/**
 * Cubimal figures out of the box (G95): Race, Name / Rename, and the source
 * "set free, with love" conversation and farewell flight. Rules and numbers
 * live in js/cubimals.js (npc_cubimal_base, in every items/npc_cubimal_*.js).
 *
 * As in the source these are pack verbs. Race (verbs.race 488) takes the
 * figure out of the pack, sets it down at the player's feet with
 * CUBIMAL_WIND_UP, and after 2 s it runs right at randInt(15, 85) for
 * randInt(2, 10) s (CUBIMAL_RACE loop), stopping early at a platform edge or
 * 200 px from the street's right end. It winds down, the activity reads
 * "Your Chick Cubimal went 7.24 planks before stopping.", 8.9 planks counts
 * toward The Loneliness of the Long Distance Cubimal, 31 figures racing on one
 * street at once earn The Swarm, and 3 s later the figure is back in the pack.
 * While it races it cannot be picked up (canPickup 525). Leaving the street
 * or reloading puts racing figures straight back in the pack.
 *
 * Name / Rename (animal_naming.js) keep one name per figure class; the bubble
 * reads 'And they shall call me "Sprocket"'. A named figure goes by its name
 * on hover while racing, on its pack card and slot tooltip, and as a dropped
 * stack (itemDisplayName), its figure type beside the name. Set free (game.js setPackedCubimalFree asks this feature through
 * query('confirmCubimalFree')) opens the source conversation; on yes the
 * figure leaves the pack, poofs in 80 px ahead of the player and 60 px up,
 * says one of the five farewells at 300 ms, and at 2.5 s flies 1000 px up in
 * 1.5 s with SPINACHJUMP as game.js pays the Imagination (setFree 1041).
 *
 * Dropping and picking up a figure are the pack's own Drop and the dropped
 * stack's pick up (js/world-items.js), saved per street.
 *
 * Tottly's Toys (solo Feats, G143): a race of 5 planks or more gives +2
 * (raceEnd, npc_cubimal_*.js:942). Not here: battles (G40, another player's
 * cubimal), with the Tottly's Toys points a battle win gives
 * (npc_cubimal_*.js makeWinner 650, 661), and sloth taunts (no source:
 * npc_sloth has no race hook).
 *
 * Art: the client's CC0 race recordings, assets/sprites/cubimals/*_race.webp
 * (tools/cubimal-race-art.mjs), 60 frames at 30 fps, frame 0 for the wound-down
 * state. Each has a 3x render from its vector SWF beside it (*_race@3x.webp,
 * tools/vector-sprites/cubimals.json) that sprite-sheets.js swaps in when the
 * racer is first drawn on a dense screen.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&cubimaldemo=race
 *   (&cubimalitem=npc_cubimal_<slug>, default the Chick) puts the figure in the
 *   pack. &cubimalautoplay=race | name | free | drop | 1 (name, race, rename,
 *   drop, pick up, set free). &cubimalracespeed=15..85 and
 *   &cubimalracesecs=2..10 pin the roll; &cubimalname=<name>;
 *   &cubimalfreeroll=0..1 picks the farewell. Screenshot holds:
 *   &cubimalnamehold=1 (Name Me! box), &cubimalwindhold=1 (wound up),
 *   &cubimaldrophold=1 (on the ground), &cubimalfreehold=1 (conversation),
 *   &cubimalflighthold=1 (farewell bubble).
 *   Canvas: cubimalRaceState, cubimalRaceClass, cubimalRaceSpeed,
 *   cubimalRaceSecs, cubimalRacePlanks, cubimalRaceMessage, cubimalRacing,
 *   cubimalLongDistance, cubimalName, cubimalNameBubble, cubimalFlight,
 *   cubimalStep, cubimalInPack.
 */

import { addItem, countItem, removeItem } from '../inventory.js?v=85d4faba';
import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js?v=f0e432df';
import { landingY, walkSurfaceY } from '../walk-surface.js?v=764d5f5a';
import { playPoofIn, poofInAlpha } from '../overlay-art.js?v=628fa0b4';
import {
  CUBIMAL_FREE,
  CUBIMAL_FREE_RESPONSES,
  CUBIMAL_NAMING,
  CUBIMAL_RACE,
  advanceCubimalRacer,
  cubimalFreeQuestion,
  cubimalFreeResponseIndex,
  cubimalInfo,
  cubimalNameVerb,
  cubimalRaceEndMessage,
  cubimalRaceOutcome,
  cubimalRacePlanks,
  cubimalRacePxPerSec,
  cubimalRaceSheet,
  cubimalRaceVerbMessage,
  isCubimal,
  nameCubimal,
  rollCubimalRace,
} from '../cubimals.js?v=378622fc';

export const CUBIMAL_RACE_FEATURE_ID = 'cubimal-race';
const DEMO_DEFAULT = 'npc_cubimal_chick';
/**
 * itemDef in_foreground: true puts the figure over other items (FG_ITEM), still under the avatars
 * (zIndex 50; MiddleGroundRenderer.setupEndShapes 111-171).
 */
const RACER_Z = 40;

let loader = null;
/** Figure names by class (one per class; the remake's pack has no item instances). */
let names = {};
/** Live racers: { classTsid, sprite, target, state, x, y, startX, speed, secs, ... }. */
let racers = [];
/** Farewell flights after a set free. */
let flights = [];
let poofs = [];
let racedTotal = 0;
let lastRace = null;
let nameBubble = '';
let nameModal = null;
let raceLoop = null;
let demoStarted = false;
let demoTimers = [];
let step = '';

const now = () => Date.now();

function publish(engine) {
  if (!engine?.setData) return;
  const active = racers.filter((r) => r.state !== 'returned');
  engine.setData('cubimalRacing', String(active.length));
  engine.setData('cubimalRaceState', active[0]?.state || lastRace?.state || 'idle');
  engine.setData('cubimalRaceClass', active[0]?.classTsid || lastRace?.classTsid || '');
  engine.setData('cubimalRaceSpeed', String(active[0]?.speed ?? lastRace?.speed ?? ''));
  engine.setData('cubimalRaceSecs', String(active[0]?.secs ?? lastRace?.secs ?? ''));
  engine.setData('cubimalRacePlanks', lastRace?.planks == null ? '' : String(lastRace.planks));
  engine.setData('cubimalRaceMessage', lastRace?.message || '');
  engine.setData('cubimalLongDistance', lastRace?.longDistance ? '1' : '0');
  engine.setData('cubimalRaced', String(racedTotal));
  engine.setData('cubimalName', Object.entries(names).map(([k, v]) => `${k.replace('npc_cubimal_', '')}:${v}`).join(','));
  engine.setData('cubimalNameBubble', nameBubble);
  engine.setData('cubimalFlight', flights.length ? flights[0].phase : '');
  engine.setData('cubimalStep', step);
  if (engine.inv) {
    const owned = Object.keys(engine.inv).filter((k) => isCubimal(k) && countItem(engine.inv, k) > 0);
    engine.setData('cubimalInPack', owned.map((k) => k.replace('npc_cubimal_', '')).join(','));
  }
}

function labelFor(classTsid) {
  return names[classTsid] || cubimalInfo(classTsid)?.label || 'Cubimal';
}

function feetY(engine, x, y) {
  return landingY(engine.platforms, x, y - 4) ?? walkSurfaceY(engine.platforms, x, y, { up: 120, down: 120 }) ?? y;
}

function makeFigure(engine, classTsid, x, y) {
  const PIXI = engine.PIXI;
  const def = cubimalRaceSheet(classTsid);
  const ready = Boolean(def && loader?.ready(def));
  const sprite = new PIXI.AnimatedSprite(ready ? loader.frames(def) : [PIXI.Texture.EMPTY]);
  sprite.anchor.set(0.5, 1);
  sprite.x = x;
  sprite.y = y;
  sprite.zIndex = RACER_Z;
  sprite.label = 'cubimal-figure';
  sprite.animationSpeed = pixiSpeed(CUBIMAL_RACE.fps);
  sprite.loop = true;
  sprite.gotoAndStop(0);
  engine.entityLayer?.addChild(sprite);
  // A figure won this session may not have its sheet yet: swap the frames in when it lands.
  if (!ready && def && loader) {
    loader.load(def).then(() => {
      const frames = loader.frames(def);
      if (sprite.destroyed || !frames.length) return;
      const playing = sprite.playing;
      sprite.textures = frames;
      if (playing) sprite.play();
      else sprite.gotoAndStop(0);
    });
  }
  return sprite;
}

function destroySprite(sprite) {
  if (!sprite) return;
  if (sprite.parent) sprite.parent.removeChild(sprite);
  if (!sprite.destroyed) sprite.destroy({ children: true });
}

/**
 * cubimals.js onConversation 855: createItemStackWithPoof, so the figure
 * appears in Tiny Speck's proto_puff (js/overlay-art.js playPoofIn, G272),
 * centred on it. (x, y) is the figure's feet.
 */
function poof(engine, x, y) {
  const h = playPoofIn(engine.PIXI, { layer: engine.fxLayer || engine.entityLayer, x, bottom: y, itemH: 40 });
  poofs.push({ h, at: now() });
}

// —— Race ———————————————————————————————————————————————————————————————

function startRace(engine, classTsid) {
  const info = cubimalInfo(classTsid);
  const player = engine.player;
  if (!info || !player || !engine.started) return false;
  if (engine.busy?.()) {
    engine.toast?.('Not right now.');
    return false;
  }
  if (countItem(engine.inv, classTsid) < 1 || !removeItem(engine.inv, classTsid, 1)) {
    engine.toast?.('That Cubimal is no longer in your pack.');
    return false;
  }
  const x = Math.round(player.x);
  const y = feetY(engine, x, player.y);
  const sprite = makeFigure(engine, classTsid, x, y);
  const racer = {
    classTsid,
    sprite,
    target: null,
    state: 'windup',
    x,
    y,
    startX: x,
    speed: null,
    secs: null,
    placedAt: now(),
    startAt: 0,
    endAt: 0,
    returnAt: 0,
  };
  racer.target = engine.register({
    classId: 'cubimal_racer',
    featureId: CUBIMAL_RACE_FEATURE_ID,
    label: labelFor(classTsid),
    subtitle: info.label,
    sprite,
    state: { classTsid },
  });
  racers.push(racer);
  engine.playSound?.('CUBIMAL_WIND_UP', { volume: 0.7 });
  engine.pushActivity?.(cubimalRaceVerbMessage(classTsid));
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
  return true;
}

function raceStart(engine, racer) {
  const pins = { speed: engine.param('cubimalracespeed'), secs: engine.param('cubimalracesecs') };
  const roll = rollCubimalRace(Math.random, pins);
  racer.speed = roll.speed;
  racer.secs = roll.secs;
  racer.startX = Math.round(racer.x);
  racer.startAt = now();
  racer.endAt = racer.startAt + roll.secs * 1000;
  racer.state = 'racing';
  racer.sprite?.gotoAndPlay?.(0);
  if (!raceLoop) raceLoop = engine.playSoundLoop?.('CUBIMAL_RACE', { intervalMs: 3_400, volume: 0.55 }) || null;
  // isSwarm: every figure out racing on this street (wind-up, run, wind-down) counts.
  const out = racers.filter((r) => r.state !== 'returned').length;
  if (out >= CUBIMAL_RACE.swarmSize) engine.grantAchievement?.(CUBIMAL_RACE.swarmAchievement);
  publish(engine);
}

function raceEnd(engine, racer) {
  racer.state = 'stopped';
  racer.sprite?.gotoAndStop?.(0);
  const planks = cubimalRacePlanks(racer.startX, racer.x);
  const message = cubimalRaceEndMessage(racer.classTsid, planks);
  const outcome = cubimalRaceOutcome(planks);
  // npc_cubimal_*.js onRaceEnd 941-942: Tottly's Toys +2 at 5 planks or more (G143).
  if (planks >= 5) engine.featsIncrement?.('tottlys_toys', 2);
  racer.returnAt = now() + CUBIMAL_RACE.returnMs;
  racedTotal += 1;
  lastRace = {
    classTsid: racer.classTsid,
    speed: racer.speed,
    secs: racer.secs,
    planks,
    message,
    longDistance: outcome.longDistance,
    state: 'stopped',
  };
  if (!racers.some((r) => r.state === 'racing')) {
    raceLoop?.stop?.();
    raceLoop = null;
  }
  engine.playSound?.('CUBIMAL_WIND_DOWN', { volume: 0.7 });
  engine.pushActivity?.(message);
  engine.toast?.(message, 4_200);
  if (outcome.longDistance) engine.achievement?.(CUBIMAL_RACE.longDistanceCounter, 1);
  publish(engine);
}

function returnToPack(engine, racer, { quiet = false } = {}) {
  if (racer.state === 'returned') return;
  racer.state = 'returned';
  addItem(engine.inv, racer.classTsid, 1);
  if (racer.target) engine.unregister?.(racer.target);
  else destroySprite(racer.sprite);
  racer.sprite = null;
  racer.target = null;
  if (lastRace && lastRace.classTsid === racer.classTsid) lastRace.state = 'returned';
  if (!quiet) {
    engine.refreshPack?.();
    engine.save?.();
  }
}

function tickRacers(engine) {
  const t = now();
  const limitX = Math.max(0, (Number(engine.worldW) || 0) - CUBIMAL_RACE.rightMargin);
  const surface = (x, y) => walkSurfaceY(engine.platforms, x, y, { up: 24, down: 24 });
  for (const racer of racers) {
    // &cubimalwindhold=1 (QA) keeps the figure wound up at the player's feet.
    if (racer.state === 'windup' && t - racer.placedAt >= CUBIMAL_RACE.windUpMs && engine.param('cubimalwindhold') !== '1') raceStart(engine, racer);
    if (racer.state === 'racing') {
      const elapsed = Math.min(t, racer.endAt) - racer.startAt;
      const targetX = racer.startX + (cubimalRacePxPerSec(racer.speed) * elapsed) / 1000;
      const next = advanceCubimalRacer(racer, targetX, surface, limitX);
      racer.x = next.x;
      racer.y = next.y;
      if (racer.sprite && !racer.sprite.destroyed) {
        racer.sprite.x = racer.x;
        racer.sprite.y = racer.y;
      }
      // onPathing: arriving or a broken path ends the race early.
      if (next.blocked || t >= racer.endAt) raceEnd(engine, racer);
    }
    if (racer.state === 'stopped' && t >= racer.returnAt) {
      returnToPack(engine, racer);
      publish(engine);
    }
  }
  racers = racers.filter((r) => r.state !== 'returned');
}

// —— Name / Rename ————————————————————————————————————————————————————————

function closeNameModal() {
  if (nameModal?.parentElement) nameModal.parentElement.removeChild(nameModal);
  nameModal = null;
}

function applyName(engine, classTsid, value) {
  const res = nameCubimal(names, classTsid, value);
  if (!res.ok) return false;
  nameBubble = res.bubble;
  const player = engine.player;
  if (player) engine.say?.({ sprite: player, label: cubimalInfo(classTsid)?.label || '' }, res.bubble, res.bubbleMs);
  else engine.toast?.(res.bubble, res.bubbleMs);
  engine.achievement?.(res.counter, 1);
  for (const racer of racers) if (racer.classTsid === classTsid && racer.target) racer.target.label = res.name;
  // The pack card and slot tooltip read the name (itemDisplayName).
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
  return true;
}

/** askPlayer 'Name Me!' / 'Rename Me!' with input_label 'My new name:' (verbs.name 446, verbs.rename 478). */
function openNameModal(engine, classTsid) {
  closeNameModal();
  if (typeof document === 'undefined') return null;
  const verb = cubimalNameVerb(names, classTsid);
  const host = document.getElementById('verb-menu')?.parentElement || document.body;
  const wrap = document.createElement('div');
  wrap.className = 'verb-menu animal-name-modal cubimal-name-modal';
  wrap.id = 'cubimal-name-modal';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `
    <div class="verb-menu-card">
      <div class="verb-menu-head">
        <div class="verb-menu-title"></div>
        <button type="button" class="verb-menu-x" aria-label="Cancel">×</button>
      </div>
      <form style="padding:0.2rem 0.85rem 0.85rem;display:grid;gap:0.55rem">
        <label style="font-size:0.82rem;opacity:0.75"></label>
        <input type="text" maxlength="${CUBIMAL_NAMING.maxLength}" autocomplete="off" spellcheck="false"
          style="font:inherit;padding:0.45rem 0.6rem;border:1px solid #d9ccb3;border-radius:8px;background:#fff" />
        <div style="display:flex;gap:0.5rem;justify-content:flex-end">
          <button type="button" data-cancel class="verb-choice" style="width:auto;border:1px solid #e4d9c4;border-radius:8px;padding:0.35rem 0.8rem">Cancel</button>
          <button type="submit" class="verb-choice" style="width:auto;border:1px solid #9cc47a;border-radius:8px;padding:0.35rem 0.8rem;background:#e8f0dc;font-weight:700">OK</button>
        </div>
      </form>
    </div>`;
  wrap.querySelector('.verb-menu-title').textContent = verb.title;
  wrap.querySelector('label').textContent = CUBIMAL_NAMING.inputLabel;
  const input = wrap.querySelector('input');
  input.value = verb.value;
  const cancel = () => closeNameModal();
  wrap.querySelector('.verb-menu-x').addEventListener('click', cancel);
  wrap.querySelector('[data-cancel]').addEventListener('click', cancel);
  wrap.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value;
    closeNameModal();
    applyName(engine, classTsid, value);
  });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });
  host.appendChild(wrap);
  nameModal = wrap;
  requestAnimationFrame(() => input.focus());
  return wrap;
}

// —— Set free, with love ——————————————————————————————————————————————————

function startFlight(engine, classTsid, response, { done = null, roll = 0 } = {}) {
  const player = engine.player;
  if (!player) return;
  const x = Math.round(player.x + CUBIMAL_FREE.offsetX);
  const y = Math.round(player.y + CUBIMAL_FREE.offsetY);
  poof(engine, x, y);
  const sprite = makeFigure(engine, classTsid, x, y);
  flights.push({
    classTsid,
    sprite,
    target: { sprite, label: labelFor(classTsid) },
    response,
    y0: y,
    at: now(),
    phase: 'poof',
    done,
    roll,
    paid: !done,
  });
  publish(engine);
}

function tickFlights(engine) {
  const t = now();
  for (const f of flights) {
    const age = t - f.at;
    // poofItIn: the stack fades in over 1 s, 0.2 s after the puff starts.
    if (f.sprite && !f.sprite.destroyed) f.sprite.alpha = poofInAlpha(age);
    if (f.phase === 'poof' && age >= CUBIMAL_FREE.responseMs) {
      f.phase = 'farewell';
      if (f.response) engine.say?.(f.target, f.response, CUBIMAL_FREE.flyAtMs + CUBIMAL_FREE.riseMs - CUBIMAL_FREE.responseMs);
      publish(engine);
    }
    // &cubimalflighthold=1 (QA) keeps the figure saying goodbye.
    if (f.phase === 'farewell' && age >= CUBIMAL_FREE.flyAtMs && engine.param('cubimalflighthold') !== '1') {
      f.phase = 'rising';
      f.sprite?.gotoAndPlay?.(0);
      engine.playSound?.(CUBIMAL_FREE.sound, { volume: 0.7 });
      payFlight(engine, f);
      publish(engine);
    }
    if (f.phase === 'rising') {
      const k = Math.min(1, (age - CUBIMAL_FREE.flyAtMs) / CUBIMAL_FREE.riseMs);
      if (f.sprite && !f.sprite.destroyed) f.sprite.y = f.y0 - CUBIMAL_FREE.riseY * k;
      if (k >= 1) {
        f.phase = 'gone';
        destroySprite(f.sprite);
        f.sprite = null;
        publish(engine);
      }
    }
  }
  flights = flights.filter((f) => f.phase !== 'gone');
  poofs = poofs.filter((p) => t - p.at < 2400);
}

/**
 * The conversation (verbs.set_free_with_love 413-421): yes runs game.js's
 * set free (pack removal, Imagination, cubimals_freed badge counter, award)
 * through `done`, then the figure says goodbye and flies off.
 */
function confirmFree(engine, classTsid, done) {
  const question = cubimalFreeQuestion(classTsid);
  if (!question || typeof done !== 'function' || !engine.scriptedDialogue) return null;
  const info = cubimalInfo(classTsid);
  engine.scriptedDialogue({
    title: labelFor(classTsid),
    // A named figure keeps its kind on the kicker line.
    kicker: names[classTsid] ? info.label : '',
    beats: [{ text: question, response: CUBIMAL_FREE.yes }],
    cancelable: true,
    primaryLabel: CUBIMAL_FREE.yes,
    cancelLabel: CUBIMAL_FREE.no,
    onComplete: () => {
      // onConversation 855-862: the pack figure is deleted now, a new one poofs in
      // beside the player, says goodbye at 300 ms, and setFree pays at 2.5 s.
      if (countItem(engine.inv, classTsid) < 1 || !removeItem(engine.inv, classTsid, 1)) {
        engine.toast?.('That Cubimal is no longer in your pack.');
        return;
      }
      const roll = freeRoll(engine);
      engine.refreshPack?.();
      startFlight(engine, classTsid, CUBIMAL_FREE_RESPONSES[cubimalFreeResponseIndex(roll)], { done, roll });
      engine.save?.();
    },
  });
  return true;
}

function freeRoll(engine) {
  const pinned = engine.param('cubimalfreeroll');
  return pinned !== null && Number.isFinite(Number(pinned)) ? Number(pinned) : Math.random();
}

/** setFree 1041: put the figure back for game.js's set free (removal, Imagination, badge counter, award). */
function payFlight(engine, f) {
  if (f.paid) return;
  f.paid = true;
  addItem(engine.inv, f.classTsid, 1);
  const result = f.done?.({ responseRoll: f.roll });
  if (!result || result.ok === false) {
    // game.js refused: keep the figure rather than lose it.
    if (countItem(engine.inv, f.classTsid) < 1) addItem(engine.inv, f.classTsid, 1);
    engine.refreshPack?.();
    return;
  }
  // A freed figure takes its name with it when no other copy remains (onTrade deletes user_name).
  if (countItem(engine.inv, f.classTsid) < 1) delete names[f.classTsid];
  engine.save?.();
}

// —— QA autoplay ——————————————————————————————————————————————————————————

function later(ms, fn) {
  demoTimers.push(setTimeout(fn, ms));
}

function click(sel) {
  const el = typeof document !== 'undefined' ? document.querySelector(sel) : null;
  if (el && !el.disabled) {
    el.click();
    return true;
  }
  return false;
}

function openSlot(classTsid) {
  return click(`.pack-slot[data-tsid="${classTsid}"]`);
}

function setStep(engine, value) {
  step = value;
  publish(engine);
}

function demoName(engine, classTsid, value, then) {
  setStep(engine, 'name');
  const modal = openNameModal(engine, classTsid);
  later(700, () => {
    const input = modal?.querySelector('input');
    if (input) input.value = value;
    setStep(engine, 'name-typed');
    // &cubimalnamehold=1 leaves the filled Name Me! box open for a screenshot.
    if (engine.param('cubimalnamehold') === '1') return;
    later(500, () => {
      modal?.querySelector('form')?.requestSubmit();
      then?.();
    });
  });
}

function demoRace(engine, classTsid, then) {
  setStep(engine, 'race');
  startRace(engine, classTsid);
  const wait = () => {
    if (racers.some((r) => r.classTsid === classTsid)) {
      later(250, wait);
      return;
    }
    setStep(engine, 'race-done');
    then?.();
  };
  later(500, wait);
}

function demoDrop(engine, classTsid, then) {
  setStep(engine, 'drop');
  openSlot(classTsid);
  later(500, () => {
    click('[data-pack-drop]');
    later(1_200, () => {
      setStep(engine, 'dropped');
      if (engine.param('cubimaldrophold') === '1') return;
      later(1_000, () => {
        setStep(engine, 'pickup');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
        later(600, () => {
          const button = [...document.querySelectorAll('#verb-menu-list .verb-choice')].find((b) => /pick up/i.test(b.textContent || ''));
          button?.click();
          // Pick up is a timed verb: wait for the figure to land in the pack.
          const t0 = now();
          const back = () => {
            if (countItem(engine.inv, classTsid) < 1 && now() - t0 < 15_000) {
              later(200, back);
              return;
            }
            setStep(engine, 'picked-up');
            later(600, () => then?.());
          };
          later(300, back);
        });
      });
    });
  });
}

function demoFree(engine, classTsid, then) {
  setStep(engine, 'free');
  openSlot(classTsid);
  later(500, () => {
    click('[data-pack-use]');
    later(900, () => {
      setStep(engine, 'free-dialog');
      later(engine.param('cubimalfreehold') === '1' ? 60_000 : 900, () => {
        click('#quest-dialogue-next');
        setStep(engine, 'freed');
        then?.();
      });
    });
  });
}

function setupDemo(engine) {
  if (demoStarted || engine.param('cubimaldemo') !== 'race') return;
  demoStarted = true;
  const wanted = engine.param('cubimalitem');
  const classTsid = isCubimal(wanted) ? wanted : DEMO_DEFAULT;
  if (countItem(engine.inv, classTsid) < 1) addItem(engine.inv, classTsid, 1);
  engine.refreshPack?.();
  const mode = engine.param('cubimalautoplay');
  const name = engine.param('cubimalname') || 'Sprocket';
  publish(engine);
  if (!mode) return;
  const go = () => {
    if (mode === 'race') demoRace(engine, classTsid);
    else if (mode === 'name') demoName(engine, classTsid, name);
    else if (mode === 'free') demoFree(engine, classTsid);
    else if (mode === 'drop') demoDrop(engine, classTsid);
    else if (mode === '1' || mode === 'all') {
      demoName(engine, classTsid, name, () =>
        later(2_500, () =>
          demoRace(engine, classTsid, () =>
            later(1_500, () =>
              demoName(engine, classTsid, `${name} Two`, () =>
                later(2_500, () =>
                  demoDrop(engine, classTsid, () =>
                    later(1_500, () => demoFree(engine, classTsid, () => later(4_500, () => setStep(engine, 'done'))))
                  )
                )
              )
            )
          )
        )
      );
    }
  };
  later(Number(engine.param('cubimaldelay')) || 2_000, go);
}

// —— Feature ———————————————————————————————————————————————————————————————

export const cubimalRaceFeature = {
  id: CUBIMAL_RACE_FEATURE_ID,

  init(engine) {
    loader = createSheetLoader(engine.PIXI);
    publish(engine);
  },

  onStreetEnter(street, engine) {
    // Warm the sheets of the figures in the pack so Race starts animated.
    const defs = Object.keys(engine.inv || {})
      .filter((k) => isCubimal(k))
      .map((k) => cubimalRaceSheet(k))
      .filter(Boolean);
    const demo = cubimalRaceSheet(isCubimal(engine.param('cubimalitem')) ? engine.param('cubimalitem') : DEMO_DEFAULT);
    if (engine.param('cubimaldemo') === 'race' && demo) defs.push(demo);
    loader?.loadAll(defs).then(() => setupDemo(engine));
  },

  onStreetClear(engine) {
    // The figures were on this street: back to the pack (returnToPack) before it goes.
    for (const racer of racers) returnToPack(engine, racer, { quiet: true });
    racers = [];
    for (const f of flights) {
      payFlight(engine, f);
      destroySprite(f.sprite);
    }
    flights = [];
    for (const p of poofs) p.h?.stop();
    poofs = [];
    raceLoop?.stop?.();
    raceLoop = null;
    closeNameModal();
    engine.refreshPack?.();
    publish(engine);
  },

  onTick(dtMs, t, engine) {
    if (!racers.length && !flights.length && !poofs.length) return;
    tickRacers(engine);
    tickFlights(engine);
  },

  /** A racing figure has nothing to do: canPickup refuses while is_racing. */
  verbsFor(target) {
    return target?.classId === 'cubimal_racer' ? [] : null;
  },

  runVerb() {
    return false;
  },

  /** Source sort_on: name 55, rename 56, race 57 (set free 54 is game.js's primary button). */
  packVerbs(classTsid, engine) {
    if (!isCubimal(classTsid) || countItem(engine.inv, classTsid) < 1) return [];
    const nameVerb = cubimalNameVerb(names, classTsid);
    return [
      { id: `cubimal_${nameVerb.id}`, label: nameVerb.label, tooltip: nameVerb.tooltip },
      { id: 'cubimal_race', label: 'Race', tooltip: 'Race it against another Cubimal' },
    ];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (!isCubimal(classTsid)) return false;
    if (verbId === 'cubimal_race') {
      startRace(engine, classTsid);
      return true;
    }
    if (verbId === 'cubimal_name' || verbId === 'cubimal_rename') {
      openNameModal(engine, classTsid);
      return true;
    }
    return false;
  },

  /**
   * game.js pack card, pack slot tooltip and dropped-stack label: a named
   * figure goes by its name, the figure type beside it. The server sent
   * getLabel() as the stack label (common.js make_item_simple 546; cubimal
   * getLabel 580 is user_name, plus a battle level the remake leaves out) and
   * the client showed that label in place of the item's (Itemstack.as
   * getLabel 445, PackItemstackView.as 102).
   */
  itemDisplayName(classTsid) {
    const name = isCubimal(classTsid) ? names[classTsid] : '';
    return name ? { label: name, kind: cubimalInfo(classTsid)?.label || 'Cubimal' } : null;
  },

  /** game.js setPackedCubimalFree: the source conversation instead of window.confirm. */
  confirmCubimalFree(classTsid, engine, done) {
    return confirmFree(engine, classTsid, done);
  },

  save() {
    const out = racers.filter((r) => r.state !== 'returned').map((r) => r.classTsid);
    // A figure saying goodbye has not been paid for yet: a reload keeps it.
    for (const f of flights) if (!f.paid) out.push(f.classTsid);
    return { names: { ...names }, out };
  },

  restore(slice, engine) {
    names = {};
    for (const [k, v] of Object.entries(slice?.names || {})) {
      if (isCubimal(k) && typeof v === 'string' && v) names[k] = v.slice(0, CUBIMAL_NAMING.maxLength);
    }
    // A reload mid-race: the figure goes home to the pack.
    for (const classTsid of Array.isArray(slice?.out) ? slice.out : []) {
      if (isCubimal(classTsid) && engine?.inv) addItem(engine.inv, classTsid, 1);
    }
    racers = [];
    flights = [];
  },
};
