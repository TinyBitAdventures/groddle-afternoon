/**
 * Heli Kitties as a feature module (see js/feature-host.js).
 *
 * Rules live in js/heli-kitties.js. Each street spawns its archived Heli Kitty
 * population (93 `Heli Kitty` labels across 33 streets in the location XML,
 * assets/content/street-ecology.json `wildlife`, capped at three per street)
 * through the shared placement planner. Kitties hover edge to edge at
 * 50-55 px/s on their rotor tails, stop every 6-14 s for a blink, a happy
 * wiggle, a chew, a hop, or a swat at a ball, and startle into the air when
 * bumped (75%, or 25% with Animal Kinship I). Pet curls them up for one
 * sleep cycle (-4 energy, +10 mood, +4 iMG, "purrrrrr"); with Animal Kinship V
 * they can be named and renamed, and names persist per street.
 *
 * The source class hides the chicken verbs (butter up, squeeze, talk to,
 * incubate, youth potion, set free) behind {state:null} conditions; they are
 * not offered here either. Revive/Apply Balm need Rook attacks, which the
 * remake leaves out.
 *
 * Art: recovered CC0 OGA `npc_kitty_chicken` adult (`3*`) sheets under
 * assets/sprites/kitties/, sliced on their exact 136×115 cells.
 *
 * QA: ?autostart=1&fresh=1&kittydemo=1 places a Heli Kitty beside the player;
 * &kittyautoplay=1 pets it, =scare bumps it into the air, =name teaches
 * Animal Kinship V and names it "Whirly". Canvas data: kittyCount,
 * kittyStreetCount, kittyState, kittyX, kittyLast, kittyName,
 * kittyHiddenVerbs, kittyDemo.
 */

import { slugsFromEffects } from '../speech-slugs.js?v=g412-1';
import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js?v=g405-1';
import { landingY, nearestSurfaceY, walkSurfaceY } from '../walk-surface.js';
import { loadWildlifeCatalog, wildlifeCatalog, wildlifeFor } from '../wildlife.js';
import {
  KITTY_ID,
  KITTY_MOTION,
  KITTY_NAMING_SKILL,
  KITTY_PET,
  KITTY_SOURCE_HIDDEN_VERBS,
  createKitty,
  kickKitty,
  kittyCountFor,
  kittyLabel,
  kittyVerbs,
  nameKitty,
  normalizeKittySlot,
  petKitty,
  rollScare,
  stepKitty,
} from '../heli-kitties.js?v=g414-1';

export const KITTY_FEATURE_ID = 'heli-kitties';
export const KITTY_GROUP = 'kitty';
const KITTY_SCALE = 0.86;
const PLAYER_ID = 'player';

const DIR = 'assets/sprites/kitties/';
const sheet = (name, cols, frames, first = 0) => Object.freeze({ path: `${DIR}kitty-${name}.png`, fw: 136, fh: 115, cols, frames, first });

/** Exact OGA cells (136×115). The appear clip's first cell is blank by design. */
export const KITTY_SHEETS = Object.freeze({
  '3appear': sheet('appear', 7, 46, 1),
  '3fly': sheet('fly', 7, 20),
  '3sleepStart': sheet('sleepStart', 7, 26),
  '3sleep': sheet('sleep', 7, 57),
  '3blink': sheet('blink', 5, 5),
  '3happy': sheet('happy', 7, 38),
  '3chew': sheet('chew', 5, 15),
  '3jump': sheet('jump', 6, 16),
  '3hitBall': sheet('hitBall', 5, 9),
  '3disappear': sheet('disappear', 7, 26),
});
const LOOP_CLIPS = new Set(['3fly', '3sleep', '3chew', '3jump']);

// ---------------------------------------------------------------------------
// Pure helpers (tests/heli-kitties.test.js)
// ---------------------------------------------------------------------------

/** One planner group per street, from the archived Heli Kitty count. */
export function kittyPlacementGroups(row) {
  const count = kittyCountFor(row || {});
  return count ? [{ key: KITTY_GROUP, count, clearance: 90 }] : [];
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

let loader = null;
let generation = 0;
let kitties = []; // { kitty, sprite, target, clip, colliding }
let lastAction = '';
let streetCount = 0;
let demoUsed = false;
let demoMode = '';
let autoplayTimer = null;
let nameModal = null;
let publishAt = 0;

function slot(engine) {
  const s = engine.streetSlot(KITTY_FEATURE_ID);
  const clean = normalizeKittySlot(s);
  s.names = clean.names;
  return s;
}

function world(engine) {
  const platforms = engine.platforms;
  return {
    geo: { l: 0, r: engine.worldW },
    groundY: engine.groundY,
    surfaceY: (x, y) => walkSurfaceY(platforms, x, y, { up: 40, down: 70 }),
    landY: (x, y) => landingY(platforms, x, y),
  };
}

function setClip(entity, clip) {
  if (entity.clip === clip || !entity.sprite || entity.sprite.destroyed) return;
  const frames = loader.frames(KITTY_SHEETS[clip] || KITTY_SHEETS['3fly']);
  if (!frames.length) return;
  entity.clip = clip;
  entity.sprite.textures = frames;
  entity.sprite.loop = LOOP_CLIPS.has(clip);
  entity.sprite.animationSpeed = pixiSpeed(30);
  entity.sprite.gotoAndPlay(0);
}

function buildKitty(engine, kitty) {
  const { PIXI } = engine;
  const frames = loader.frames(KITTY_SHEETS['3appear']);
  const spr = new PIXI.AnimatedSprite(frames.length ? frames : [PIXI.Texture.EMPTY]);
  spr.anchor.set(0.57, 0.92);
  spr.zIndex = 22;
  spr._worldHitW = 62;
  spr._worldHitH = 92;
  spr.loop = false;
  spr.animationSpeed = pixiSpeed(30);
  spr.play();
  engine.entityLayer.addChild(spr);
  const entity = { kitty, sprite: spr, target: null, clip: '3appear', colliding: false };
  entity.target = engine.register({
    classId: KITTY_ID,
    featureId: KITTY_FEATURE_ID,
    label: kittyLabel(kitty),
    subtitle: 'Never needs to worry about landing on its feet',
    sprite: spr,
    airborne: true,
    kittyKey: kitty.key,
  });
  kitties.push(entity);
  place(entity);
  return entity;
}

function place(entity) {
  const { kitty, sprite } = entity;
  if (!sprite || sprite.destroyed) return;
  sprite.x = kitty.x;
  sprite.y = kitty.y + 2;
  // The art faces right.
  sprite.scale.set(KITTY_SCALE * (kitty.dir === 'left' ? -1 : 1), KITTY_SCALE);
  if (kitty.clip !== entity.clip) setClip(entity, kitty.clip);
}

function scare(engine, entity, force = false) {
  const { kitty } = entity;
  if (!force && !rollScare(kitty, engine.learnedSkills)) return false;
  if (kitty.state === 'sleep' || kitty.state === 'sleepStart' || kitty.flying) return false;
  kickKitty(kitty);
  engine.say(entity.target, KITTY_MOTION.mewBubble, KITTY_MOTION.mewBubbleMs);
  engine.playSound('FLYING_KITTY_MEW', { volume: 0.5 });
  lastAction = 'scared';
  publish(engine, true);
  return true;
}

function pet(engine, entity) {
  const result = petKitty(entity.kitty, engine.pc);
  if (!result.ok) {
    engine.toast(result.msg, 1800);
    return;
  }
  setClip(entity, '3sleepStart');
  // npc_kitty_chicken.js 240-279: sendBubble("purrrrrr", 2000, pc, slugs), xp, mood and energy.
  engine.say(entity.target, result.bubble, KITTY_PET.bubbleMs, { slugs: slugsFromEffects({ energy: result.energy, mood: result.mood, xp: result.xp }) });
  engine.playSound('FLYING_KITTY_PURR', { volume: 0.6 });
  // npc_kitty_chicken.js 283-287: animal_love +1 for the first 3 pets of each kitty (G143).
  engine.featsIncrement?.('animal_love', 1, { cap: { key: `kitty:${engine.streetTsid}:${entity.kitty.key}`, max: 3 } });
  engine.pushActivity({
    base: `You petted ${entity.kitty.name ? entity.kitty.name : 'a Heli Kitty'}`,
    effects: { energy: result.energy, mood: result.mood, xp: result.xp },
  });
  engine.floatText(entity.kitty.x, entity.kitty.y - 110, `+${result.mood} mood`, 0xffd0e8);
  lastAction = `pet:${result.energy}:${result.mood}:${result.xp}`;
  engine.updateHud();
  engine.save();
  publish(engine, true);
}

function applyName(engine, entity, value) {
  const res = nameKitty(entity.kitty, value, {
    learned: engine.learnedSkills,
    playerId: PLAYER_ID,
    nowS: Math.floor(Date.now() / 1000),
  });
  if (!res.ok) {
    if (res.reason !== 'unchanged') engine.toast(res.reason, 2200);
    return false;
  }
  const s = slot(engine);
  s.names[entity.kitty.key] = { name: entity.kitty.name, namer: entity.kitty.namer, namedOn: entity.kitty.namedOn };
  entity.target.label = kittyLabel(entity.kitty);
  engine.say(entity.target, res.bubble, 5000);
  engine.achievement(res.counter, 1);
  engine.pushActivity(`You named a Heli Kitty "${res.name}".`);
  lastAction = `named:${res.name}`;
  engine.save();
  publish(engine, true);
  return true;
}

/** askPlayer 'Name Me!' / 'Rename Me!': a small input card in the verb-menu style. */
function openNameModal(engine, entity, title) {
  closeNameModal();
  if (typeof document === 'undefined') return;
  const host = document.getElementById('verb-menu')?.parentElement || document.body;
  const wrap = document.createElement('div');
  wrap.className = 'verb-menu kitty-name-modal';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `
    <div class="verb-menu-card">
      <div class="verb-menu-head">
        <div class="verb-menu-title"></div>
        <button type="button" class="verb-menu-x" aria-label="Cancel">×</button>
      </div>
      <form style="padding:0.2rem 0.85rem 0.85rem;display:grid;gap:0.55rem">
        <label style="font-size:0.82rem;opacity:0.75">My new name:</label>
        <input type="text" maxlength="32" autocomplete="off" spellcheck="false"
          style="font:inherit;padding:0.45rem 0.6rem;border:1px solid #d9ccb3;border-radius:8px;background:#fff" />
        <div style="display:flex;gap:0.5rem;justify-content:flex-end">
          <button type="button" data-cancel class="verb-choice" style="width:auto;border:1px solid #e4d9c4;border-radius:8px;padding:0.35rem 0.8rem">Cancel</button>
          <button type="submit" class="verb-choice" style="width:auto;border:1px solid #9cc47a;border-radius:8px;padding:0.35rem 0.8rem;background:#e8f0dc;font-weight:700">OK</button>
        </div>
      </form>
    </div>`;
  wrap.querySelector('.verb-menu-title').textContent = title;
  const input = wrap.querySelector('input');
  input.value = entity.kitty.name || '';
  const cancel = () => closeNameModal();
  wrap.querySelector('.verb-menu-x').addEventListener('click', cancel);
  wrap.querySelector('[data-cancel]').addEventListener('click', cancel);
  wrap.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value;
    closeNameModal();
    applyName(engine, entity, value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });
  host.appendChild(wrap);
  nameModal = wrap;
  requestAnimationFrame(() => input.focus());
}

function closeNameModal() {
  if (nameModal?.parentElement) nameModal.parentElement.removeChild(nameModal);
  nameModal = null;
}

function checkCollisions(engine) {
  const p = engine.player;
  if (!p || !engine.started || engine.transientInstance()) return;
  for (const entity of kitties) {
    const k = entity.kitty;
    const touching = Math.abs(p.x - k.x) <= 38 && p.y >= k.y - 90 && p.y <= k.y + 30;
    if (touching && !entity.colliding) scare(engine, entity);
    entity.colliding = touching;
  }
}

function setupDemo(engine) {
  if (demoUsed) return;
  const mode = String(engine.param('kittydemo') || '');
  if (!mode) return;
  demoUsed = true;
  demoMode = mode;
  const p = engine.player;
  if (!p) return;
  const x = Math.min(engine.worldW - 140, p.x + 130);
  const y = nearestSurfaceY(engine.platforms, x, p.y) ?? p.y;
  const kitty = createKitty({ key: 'kitty:99', x, y });
  kitty.dir = 'left';
  const entity = buildKitty(engine, kitty);
  const auto = engine.param('kittyautoplay');
  if (!auto) return;
  clearTimeout(autoplayTimer);
  autoplayTimer = setTimeout(() => {
    if (!kitties.includes(entity)) return;
    if (auto === 'scare') scare(engine, entity, true);
    else if (auto === 'name') {
      if (!engine.learnedSkills.includes(KITTY_NAMING_SKILL)) engine.grantSkill?.(KITTY_NAMING_SKILL);
      applyName(engine, entity, 'Whirly');
    } else pet(engine, entity);
  }, 2600);
}

function publish(engine, force = false) {
  const now = Date.now();
  if (!force && now < publishAt) return;
  publishAt = now + 250;
  const first = kitties[kitties.length - 1]?.kitty;
  engine.setData('kittyCount', String(kitties.length));
  engine.setData('kittyStreetCount', String(streetCount));
  engine.setData('kittyState', first ? `${first.state}:${first.clip}` : '');
  engine.setData('kittyX', first ? String(Math.round(first.x)) : '');
  engine.setData('kittyLast', lastAction);
  engine.setData('kittyName', first?.name || '');
  engine.setData('kittyHiddenVerbs', KITTY_SOURCE_HIDDEN_VERBS.join(','));
  engine.setData('kittyDemo', demoMode);
}

export const heliKittiesFeature = {
  id: KITTY_FEATURE_ID,

  init(engine) {
    loader = createSheetLoader(engine.PIXI);
    loadWildlifeCatalog();
    publish(engine, true);
  },

  placementGroups(population, street) {
    const catalog = wildlifeCatalog();
    if (!catalog || !street?.tsid) return [];
    return kittyPlacementGroups(wildlifeFor(catalog, street.tsid));
  },

  onStreetEnter(street, engine) {
    generation += 1;
    const mine = generation;
    Promise.all([loadWildlifeCatalog(), loader.loadAll(Object.values(KITTY_SHEETS))]).then(([cat]) => {
      if (mine !== generation) return;
      const row = wildlifeFor(cat, engine.streetTsid);
      streetCount = Number(row?.npc_kitty_chicken) || 0;
      const names = slot(engine).names;
      const points = engine.placement(KITTY_GROUP) || [];
      points.slice(0, kittyCountFor(row || {})).forEach((pt, i) => {
        if (!Number.isFinite(pt?.x) || !Number.isFinite(pt?.y)) return;
        const key = `kitty:${i}`;
        const saved = names[key] || {};
        const kitty = createKitty({ key, x: pt.x, y: pt.y, ...saved });
        kitty.dir = i % 2 ? 'right' : 'left';
        buildKitty(engine, kitty);
      });
      setupDemo(engine);
      publish(engine, true);
    });
  },

  onStreetClear() {
    generation += 1;
    clearTimeout(autoplayTimer);
    closeNameModal();
    kitties = [];
    streetCount = 0;
  },

  onTick(dtMs, now, engine) {
    if (!kitties.length) return;
    const w = world(engine);
    for (const entity of kitties) {
      stepKitty(entity.kitty, dtMs, w);
      place(entity);
    }
    checkCollisions(engine);
    publish(engine);
  },

  verbsFor(target, engine) {
    const entity = kitties.find((e) => e.target === target);
    if (!entity) return [];
    return kittyVerbs(entity.kitty, {
      learned: engine.learnedSkills,
      energy: engine.pc.energy,
      playerId: PLAYER_ID,
      nowS: Math.floor(Date.now() / 1000),
    }).map((verb) => ({ ...verb, durationMs: 0 }));
  },

  runVerb(target, verbId, engine) {
    const entity = kitties.find((e) => e.target === target);
    if (!entity) return true;
    if (verbId === 'pet') pet(engine, entity);
    else if (verbId === 'name') openNameModal(engine, entity, 'Name Me!');
    else if (verbId === 'rename') openNameModal(engine, entity, 'Rename Me!');
    return true;
  },

  /** QA / tests. */
  _state() {
    return { kitties: kitties.length, lastAction };
  },
};
