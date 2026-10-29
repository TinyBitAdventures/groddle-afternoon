/**
 * Puzzle streets brought back to life: the colour levels (Orangian,
 * Griinolyza, Piryan, Purplysa, Blooian, Fernucopia, Amberlyza), Piano Party
 * and the gut tubes.
 *
 * Their event scripts survived (street.events, run by location-events), but
 * the items that fired them did not. This feature reads the reconstructed
 * triggers in assets/content/puzzle-triggers.json (rules in
 * js/puzzle-triggers.js) and fires the recovered events through
 * locationEventsApi when the avatar enters or leaves each box, exactly as the
 * Collision-triggered Event Boxes did. Streets marked `strict` turn the
 * location-events walkable fallback off, so platforms appear and vanish as
 * the scripts say.
 *
 * Around the triggers: the street's source quoin count placed along the
 * route (collected through the normal quoin economy and daily limit), pit
 * recovery to the last ledge passed, the exit door as the finish line (first
 * finish pays the colour-level reward), and a Map card to reach the levels.
 *
 * A trigger with `verb` is an item the player clicks rather than walks into:
 * Shim Shiri's six Light Beams (items/light_beam.js beam_up "Beam Up", key e,
 * proximity_override 160, tooltip "Travel to " + dest) broadcast their event
 * from the verb (events_broadcast, target_pc), so they register as targets
 * on their beam art and never fire on contact.
 *
 * A street entry with `instance` (A Summer's Day: 'summers-day') belongs to a private
 * quest instance that game.js holds on the imported street: its triggers and scripts run
 * only while engine.heldInstance() names that instance, never on a plain visit. Such
 * entries may add `signs` (deco id -> the deco's archived sign_txt, drawn while the
 * street's events show the deco), triggers with `teleport` (the lost Collision-triggered
 * Teleporter: stand there) and triggers with `moment` (reported to the instance through
 * engine.instanceMoment when the avatar enters them).
 *
 * QA: ?autostart=1&questoffer=off&puzzledemo=<tsid> travels to a puzzle
 * street and stands at its start; &puzzleautoplay=1 walks the triggers in
 * order by placing the avatar on each (1.2 s apart), collects every quoin,
 * then uses the exit; &puzzleautoplay=<triggerId> stops on that trigger;
 * &puzzlex=&puzzley= start elsewhere; &puzzleend=x,y moves the avatar there
 * after the last step (framing a result). Canvas data: puzzleStreet,
 * puzzleStrict, puzzleTriggers, puzzleFired, puzzleLast, puzzleQuoins,
 * puzzleRespawns, puzzleComplete, puzzleReward, puzzleDemo.
 */

import { locationEventsApi } from './location-events-feature.js?v=g452-1';
import { collectQuoin, QUOIN_SHEET, QUOIN_TYPES } from '../quoins.js?v=g424-1';
import {
  PUZZLE_DATA_URL,
  SOURCE_PHYSICS,
  autoplaySteps,
  completionReward,
  normalizePuzzleData,
  normalizePuzzleSave,
  quoinsInReach,
  respawnPoint,
  rewardBits,
  stepTriggers,
} from '../puzzle-triggers.js';
import { energyMax, metabolicGain, moodMax } from '../metabolics.js';
import { isLoaded, onLoaded, sourceFromUrl, textureFromUrl } from '../textures.js';

export const PUZZLES_FEATURE_ID = 'puzzles';
export const LIGHT_BEAM_CLASS = 'light_beam';
export const BEAM_UP_VERB = 'beam_up';
/** items/light_beam.js: label, verb name, get_tooltip. */
export const LIGHT_BEAM = Object.freeze({ label: 'Light Beam', verb: 'Beam Up', tooltip: (dest) => `Travel to ${dest || 'a new location'}` });
const DATA_MS = 250;
const BODY_H = 34; // avatar height at the colour levels' 0.41 scale

let data = null; // { [tsid]: def }
let loading = null;
let save = normalizePuzzleSave();
let run = null; // per visit
let lastData = 0;
let demo = { stage: 'idle', at: 0, queue: [], target: '' };

function load() {
  if (data) return Promise.resolve(data);
  if (!loading) {
    loading = fetch(`${PUZZLE_DATA_URL}?v=puzzles-3`)
      .then((r) => r.json())
      .then((raw) => {
        data = normalizePuzzleData(raw);
        return data;
      })
      .catch((err) => {
        console.warn('puzzle triggers', err);
        loading = null;
        return null;
      });
  }
  return loading;
}

const key = (tsid) => (String(tsid || '').startsWith('L') ? `G${String(tsid).slice(1)}` : String(tsid || ''));
const defFor = (tsid) => data?.[key(tsid)] || null;

/**
 * Repaired scripts: a street entry's `events` replace source events whose
 * logic can never run as archived (each carries `eventsWhy`). Applied before
 * location-events reads the street.
 */
function patchStreet(street) {
  const def = defFor(street?.tsid);
  if (!def || !street) return;
  if (def.events) street.events = { ...(street.events || {}), ...def.events };
  // Geometry a street's own events still name but the archive lost (`platforms`, source
  // space, each with its `why`), with the art that marks it (`decos`, middleground).
  for (const plat of def.platforms || []) {
    if (!(street.platforms || []).some((pl) => pl.id === plat.id)) {
      const { why, ...row } = plat;
      (street.platforms ||= []).push(row);
    }
  }
  const mg = (street.layers || []).find((layer) => layer.id === 'middleground');
  for (const deco of def.decos || []) {
    if (mg && !mg.decos.some((d) => d.id === deco.id)) {
      const { why, ...row } = deco;
      mg.decos.push(row);
    }
  }
}

locationEventsApi.register({
  strict: (street) => defFor(street?.tsid)?.strict === true,
  // A private instance on an archived street runs that street's own scripts.
  instance: (street, engine) => {
    const def = defFor(street?.tsid);
    return Boolean(def?.instance && engine?.heldInstance?.() === def.instance);
  },
});

/** May this entry run now? Plain entries off instances; instance entries only inside their own. */
function runsHere(engine, def) {
  if (!def) return false;
  if (def.instance) return engine.heldInstance?.() === def.instance;
  return !engine.transientInstance();
}

/* ------------------------------------------------------------------ */
/* Quoins                                                              */
/* ------------------------------------------------------------------ */

let quoinFrames = null;
function quoinTexture(engine, type) {
  const { PIXI } = engine;
  if (!quoinFrames) {
    const base = sourceFromUrl(QUOIN_SHEET.url);
    quoinFrames = {};
    for (const def of Object.values(QUOIN_TYPES)) {
      quoinFrames[def.id] = new PIXI.Texture(
        { source: base, frame: new PIXI.Rectangle(0, def.row * QUOIN_SHEET.frameHeight, QUOIN_SHEET.frameWidth, QUOIN_SHEET.frameHeight) },
      );
    }
  }
  return quoinFrames[type] || quoinFrames.xp;
}

function spawnQuoins(engine, def) {
  const { PIXI } = engine;
  for (const q of def.quoins) {
    const spr = new PIXI.Sprite(quoinTexture(engine, q.type));
    spr.anchor.set(0.5, 0.5);
    spr.x = q.x;
    spr.y = q.y;
    spr.scale.set(0.55);
    spr.zIndex = 40;
    spr.puzzleQuoin = q;
    // Flagged quoins wait for the street's script (Penumbra's covered windows).
    if (q.flag) spr.visible = false;
    engine.entityLayer.addChild(spr);
    run.sprites.push(spr);
    run.quoinViews.set(q.id, { spr, baseY: q.y, phase: (q.x % 97) / 15 });
  }
}

function takeQuoins(engine) {
  const p = engine.player;
  for (const q of quoinsInReach(run.def.quoins, run.taken, p.x, p.y, 34, locationEventsApi.flag)) {
    run.taken.add(q.id);
    const view = run.quoinViews.get(q.id);
    if (view?.spr && !view.spr.destroyed) view.spr.visible = false;
    const opts = q.amount ? { amount: q.amount } : {};
    const result = collectQuoin(engine.quoinState, q.type, engine.pc, opts);
    const label = QUOIN_TYPES[result.resolvedTypeId || q.type]?.label || 'iMG';
    if (result.ok) {
      engine.floatText(q.x, q.y - 16, `+${result.amount} ${label}`, '#ffffff');
      engine.playSound(`QUOIN_${String(result.typeId || 'xp').toUpperCase()}`, { volume: 0.5 });
    } else {
      engine.floatText(q.x, q.y - 16, 'Daily quoin limit', '#ffe7a8');
    }
    engine.updateHud();
  }
}

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

function clearRun(engine) {
  if (!run) return;
  for (const spr of run.sprites) {
    if (spr.parent) spr.parent.removeChild(spr);
    if (!spr.destroyed) spr.destroy();
  }
  run = null;
}

const ART_BASE = 'assets/sprites/puzzles/';

/** Recovered CC0 item art the lost objects wore (e.g. Shim Shiri's light beams). */
function spawnArt(engine, def) {
  const { PIXI } = engine;
  for (const a of def.art || []) {
    const spr = new PIXI.Sprite(textureFromUrl(`${ART_BASE}${a.sprite}.png`));
    spr.anchor.set(0.5, 1);
    spr.x = a.x;
    spr.y = a.y;
    // Size once the texture is real (a 1x1 placeholder would inflate the scale).
    const size = () => {
      spr.width = a.w;
      spr.height = a.h;
    };
    if (isLoaded(spr.texture)) size();
    else onLoaded(spr.texture.source, size);
    if (a.tint != null) spr.tint = Number(a.tint);
    spr.alpha = a.alpha ?? 0.6;
    spr.zIndex = a.z ?? 5;
    if (a.blend === 'add') spr.blendMode = 'add';
    spr.puzzleArt = a;
    engine.entityLayer.addChild(spr);
    run.sprites.push(spr);
    run.artViews.push({ spr, a, phase: (a.x % 53) / 9 });
  }
}

/**
 * Vent currents: the WindCurl swirl the source drew has a blank first frame,
 * so a vent shows as a column of crisp rising bubbles inside its box.
 */
function spawnBubbles(engine, def) {
  const { PIXI } = engine;
  for (const t of def.triggers) {
    if (!t.bubbles) continue;
    const layer = new PIXI.Container();
    layer.zIndex = 30;
    const bubbles = [];
    const count = Math.max(10, Math.min(22, Math.round((t.w * t.h) / 5000)));
    for (let i = 0; i < count; i += 1) {
      const g = new PIXI.Graphics();
      const r = 3 + ((i * 7) % 6);
      g.circle(0, 0, r).fill({ color: 0xdff6ff, alpha: 0.18 }).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
      g.circle(-r * 0.35, -r * 0.35, Math.max(1, r * 0.25)).fill({ color: 0xffffff, alpha: 0.8 });
      layer.addChild(g);
      bubbles.push({ g, u: ((i * 37) % 100) / 100, v: (i * 0.61803) % 1, speed: 0.004 + ((i * 13) % 7) * 0.0012 });
    }
    engine.entityLayer.addChild(layer);
    run.sprites.push(layer);
    run.bubbleViews.push({ t, bubbles });
  }
}

function stepBubbles() {
  for (const view of run.bubbleViews) {
    const { t } = view;
    for (const b of view.bubbles) {
      b.v = (b.v + b.speed) % 1;
      b.g.x = t.x - t.w / 2 + t.w * (0.15 + 0.7 * b.u) + Math.sin((b.v + b.u) * 12) * 6;
      b.g.y = t.y - t.h * b.v;
      b.g.alpha = Math.min(1, b.v * 6, (1 - b.v) * 6);
    }
  }
}

/**
 * The street's own sign text (instance entries' `signs`): each label follows its sign
 * deco's show, hide and fade from the street's events.
 */
function spawnSigns(engine, street, def) {
  const { PIXI } = engine;
  if (!def.signs || !PIXI?.Text) return;
  const mg = (street.layers || []).find((layer) => layer.id === 'middleground');
  const bounds = street.bounds || { l: 0, t: 0 };
  for (const deco of mg?.decos || []) {
    const text = def.signs[deco.id];
    if (!text) continue;
    const label = new PIXI.Text({
      text: String(text).replace(/\s*<br>\s*/g, '\n'),
      style: {
        fontFamily: 'Nunito, "Trebuchet MS", sans-serif',
        fontWeight: '700',
        fontSize: 15,
        fill: 0xffffff,
        align: 'center',
        lineHeight: 18,
        wordWrap: true,
        wordWrapWidth: Math.max(160, (deco.w || 400) * 0.9),
        // The recording's white lettering with a soft blue edge, readable on the pale sky.
        dropShadow: { color: 0x2f6f8a, alpha: 0.55, blur: 3, distance: 1, angle: Math.PI / 2 },
      },
    });
    label.resolution = 3;
    label.anchor.set(0.5, 0.5);
    // Middleground decos are source space, bottom-centre: the text sits on the sign's middle.
    label.x = deco.x - bounds.l;
    label.y = deco.y - bounds.t - (deco.h || 248) / 2;
    label.zIndex = 36;
    label.visible = false;
    engine.entityLayer.addChild(label);
    run.sprites.push(label);
    run.signs.push({ id: deco.id, label });
  }
}

function syncSigns(engine) {
  if (!run?.signs?.length) return;
  const views = engine.decoViews;
  const shown = [];
  for (const row of run.signs) {
    if (row.label.destroyed) continue;
    const view = views?.get(row.id);
    const visible = Boolean(view && !view.destroyed && view.visible && view.alpha > 0);
    row.label.visible = visible;
    row.label.alpha = view ? view.alpha : 0;
    if (visible) shown.push(row.id.slice(-4));
  }
  const data = shown.join(' ');
  if (data !== run.signData) {
    run.signData = data;
    engine.setData('puzzleSigns', data);
  }
}

function startRun(engine, street, def) {
  run = {
    tsid: key(street.tsid),
    def,
    inside: new Set(),
    spent: new Set(),
    taken: new Set(),
    sprites: [],
    quoinViews: new Map(),
    bestX: def.start?.x ?? 0,
    fired: 0,
    last: '',
    respawns: 0,
    complete: false,
    startedAt: locationEventsApi.clock(),
    repeatAt: new Map(),
    artViews: [],
    bubbleViews: [],
    pull: null,
    toasted: new Set(),
    prevY: null,
    pinned: false,
    arrivalChecked: false,
    ceilings: def.ceilings
      ? new Set((street.platforms || []).filter((pl) => pl.pc_perm == null || Number(pl.pc_perm) === 1).map((pl) => pl.id))
      : null,
    signs: [],
    signData: null,
  };
  spawnSigns(engine, street, def);
  spawnQuoins(engine, def);
  spawnArt(engine, def);
  spawnBubbles(engine, def);
  spawnVerbTargets(engine, def);
}

/** Clicked triggers (light beams): a target on the art standing at the trigger's x. */
function spawnVerbTargets(engine, def) {
  for (const t of def.triggers) {
    if (t.verb !== BEAM_UP_VERB) continue;
    const view = run.artViews.find((v) => v.a.x === t.x);
    if (!view?.spr || typeof engine.register !== 'function') continue;
    engine.register({
      classId: LIGHT_BEAM_CLASS,
      featureId: PUZZLES_FEATURE_ID,
      label: LIGHT_BEAM.label,
      subtitle: LIGHT_BEAM.tooltip(t.dest),
      sprite: view.spr,
      state: { trigger: t.id },
    });
  }
}

/** beam_up handler: broadcast the beam's event(s) to the street, aimed at the player. */
function beamUp(engine, triggerId) {
  const t = run?.def.triggers.find((tr) => tr.id === triggerId && tr.verb === BEAM_UP_VERB);
  if (!t) return false;
  fireAll(engine, t.onEnter, t.id);
  if (!run) return true;
  // moveAvatar stand-in: ease the avatar onto the beam while it lifts.
  if (t.pullMs) run.pull = { x: t.x, until: locationEventsApi.clock() + t.pullMs };
  return true;
}

function place(engine, x, y) {
  const p = engine.player;
  if (!p) return;
  p.x = x;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  p.onGround = false;
  engine.snapCamera();
}

function fireAll(engine, names, via) {
  for (const name of names) {
    if (locationEventsApi.fire(engine, name, true)) {
      run.fired += 1;
      run.last = `${via}:${name}`;
    }
  }
}

function respawn(engine, msg) {
  const at = respawnPoint(run.def, run.bestX);
  if (!at) return;
  run.respawns += 1;
  // Whatever the scripts did to gravity ends with the attempt.
  if (run.def.respawnEvents) fireAll(engine, run.def.respawnEvents, 'respawn');
  place(engine, at.x, at.y - 4);
  engine.floatText(at.x, at.y - 50, msg, '#fff3c4');
}

function avatarHeight(p) {
  const h = Math.abs(Number(p.height) || 0);
  return h >= 16 && h <= 160 ? h * 0.85 : BODY_H;
}

/**
 * Source ceilings (platform pc_perm 1, "hard from below") stop a rising
 * avatar's head: the remake's platforms are all one-way floors, which is
 * fine until a street's scripts turn gravity upside down.
 */
function clampCeiling(engine, p, height) {
  if (!run.ceilings || !(p.vy < 0) || run.prevY == null) return;
  const head = p.y - height;
  const prevHead = run.prevY - height;
  for (const pl of engine.platforms || []) {
    if (!run.ceilings.has(pl.id)) continue;
    const x0 = Math.min(pl.x1, pl.x2);
    const x1 = Math.max(pl.x1, pl.x2);
    if (p.x < x0 || p.x > x1) continue;
    const y = x1 > x0 ? pl.y1 + ((pl.y2 - pl.y1) * (p.x - pl.x1)) / (pl.x2 - pl.x1) : pl.y1;
    if (prevHead >= y - 2 && head < y) {
      p.y = y + height;
      p.vy = 0;
      return;
    }
  }
}

function ceilingYAt(pl, x) {
  const x0 = Math.min(pl.x1, pl.x2);
  const x1 = Math.max(pl.x1, pl.x2);
  if (x < x0 || x > x1) return null;
  return x1 > x0 ? pl.y1 + ((pl.y2 - pl.y1) * (x - pl.x1)) / (pl.x2 - pl.x1) : pl.y1;
}

/**
 * Reversed gravity (the gut tubes' gravity -1, Purplysa's x-0.1 pads): as in
 * the client (AvatarAnimationState, AvatarPhysicsHandler) the avatar stays
 * upright in its airborne pose and its head stops on source ceilings
 * (pc_perm 1/null). While it presses a ceiling the head follows that ceiling
 * up and down its slope as the avatar moves, so it slides along the roof of a
 * tube instead of tunnelling through where the line dips.
 * @returns {boolean} true while gravity is reversed here
 */
function stepInverted(engine, p, height) {
  const inverted = Boolean(run.ceilings) && locationEventsApi.gravity() < 0;
  if (!inverted) {
    run.pinned = false;
    return false;
  }
  const head = p.y - height;
  const prevHead = run.prevY == null ? null : run.prevY - height;
  let best = null;
  for (const pl of engine.platforms || []) {
    if (!run.ceilings.has(pl.id)) continue;
    const y = ceilingYAt(pl, p.x);
    if (y == null) continue;
    if (run.pinned && y >= head - 12 && y <= head + 28) {
      if (best == null || Math.abs(y - head) < Math.abs(best - head)) best = y;
    } else if (p.vy < 0 && prevHead != null && prevHead >= y - 2 && head < y) {
      if (best == null || y > best) best = y;
    }
  }
  if (best != null && p.vy <= 0.5) {
    p.y = best + height;
    p.vy = 0;
    run.pinned = true;
  } else {
    run.pinned = false;
  }
  return true;
}

/**
 * Gut tubes: Space flips which way is down. The lost boxes that flipped
 * gravity at each bend of the serpentine and spiral tubes cannot be placed
 * from the archive, so the traveller works the street's own invert/reset
 * scripts instead (def.gravityToggle names them).
 */
let flipKeysBound = false;
function bindGravityFlip(engine) {
  if (flipKeysBound || typeof window === 'undefined') return;
  flipKeysBound = true;
  window.addEventListener('keydown', (e) => {
    const flip = run?.def?.gravityToggle;
    if (!flip || e.code !== 'Space' || e.repeat) return;
    const tag = String(e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || engine.busy() || engine.transientInstance()) return;
    const now = performance.now();
    if (now - (run.flippedAt || -1e9) < 300) return;
    run.flippedAt = now;
    const inverted = locationEventsApi.gravity() < 0;
    fireAll(engine, [inverted ? flip.normal : flip.invert], 'flip');
    run.flips = (run.flips || 0) + 1;
    engine.playSound('JUMP', { volume: 0.4, rate: inverted ? 0.8 : 1.3 });
  });
}

function stepRun(engine) {
  const p = engine.player;
  if (!p || !run) return;
  run.bestX = Math.max(run.bestX, p.x);
  const height = avatarHeight(p);
  if (!stepInverted(engine, p, height)) clampCeiling(engine, p, height);
  if (!run.arrivalChecked) {
    run.arrivalChecked = true;
    // Where the avatar arrived decides which way the street runs (the gut
    // tubes' player_enter checked pc.y): fire that region's events once.
    for (const rule of run.def.arrival || []) {
      if (p.x >= rule.x0 && p.x <= rule.x1 && p.y >= rule.y0 && p.y <= rule.y1) {
        fireAll(engine, rule.events || [], 'arrival');
        if (rule.toast) engine.toast(rule.toast);
        break;
      }
    }
  }
  const now = locationEventsApi.clock();
  for (const edge of stepTriggers(run.def.triggers.filter((t) => !t.verb), run.inside, run.spent, p.x, p.y, height)) {
    fireAll(engine, edge.events, edge.trigger.id);
    if (!run) return;
    if (edge.edge === 'enter') run.repeatAt.set(edge.trigger.id, now + (edge.trigger.repeatMs || 0));
    // moveAvatar stand-in: ease the avatar to the trigger's centre (a light
    // beam lifting it straight up its column).
    if (edge.edge === 'enter' && edge.trigger.pullMs) run.pull = { x: edge.trigger.x, until: now + edge.trigger.pullMs };
    if (edge.edge === 'enter' && edge.trigger.toast && !run.toasted.has(edge.trigger.id)) {
      run.toasted.add(edge.trigger.id);
      engine.toast(edge.trigger.toast);
    }
    // An instance's moment (A Summer's Day's birds, stones, water, orbs and dots).
    if (edge.edge === 'enter' && edge.trigger.moment) engine.instanceMoment?.(edge.trigger.moment, edge.trigger.id);
    if (!run) return;
    // The lost Collision-triggered Teleporter: stand at its target.
    if (edge.edge === 'enter' && edge.trigger.teleport) {
      place(engine, edge.trigger.teleport.x, edge.trigger.teleport.y);
      run.inside.delete(edge.trigger.id);
      run.prevY = engine.player?.y ?? null;
      return;
    }
    if (edge.edge === 'enter' && edge.trigger.respawn) {
      respawn(engine, edge.trigger.respawnText || 'Ouch! Back to the last safe spot.');
      run.inside.delete(edge.trigger.id);
      run.prevY = engine.player?.y ?? null;
      return;
    }
  }
  // Boxes that keep firing while the avatar stays inside (fire, wind).
  for (const t of run.def.triggers) {
    if (!t.repeatMs || !run.inside.has(t.id) || now < (run.repeatAt.get(t.id) || 0)) continue;
    run.repeatAt.set(t.id, now + t.repeatMs);
    fireAll(engine, t.onEnter, t.id);
  }
  if (run.pull) {
    if (now > run.pull.until) run.pull = null;
    else {
      p.x += (run.pull.x - p.x) * 0.15;
      p.vx *= 0.5;
    }
  }
  for (const view of run.artViews) {
    if (view.a.steady) continue; // solid set pieces (Umbra's return ledge) do not pulse
    view.phase += 0.05;
    if (view.spr && !view.spr.destroyed) view.spr.alpha = (view.a.alpha ?? 0.6) * (0.85 + Math.sin(view.phase) * 0.15);
  }
  stepBubbles();
  syncSigns(engine);
  takeQuoins(engine);
  if (run.def.fallY != null && p.y > run.def.fallY) respawn(engine, 'Whoops! Back to the ledge.');
  const exit = run.def.exit;
  // A finish the street's own script declares (Piano Party's moon_done).
  if (exit?.flag && !run.complete && locationEventsApi.flag(exit.flag)) complete(engine);
  if (exit && !exit.door && !exit.flag && !run.complete && Math.abs(p.x - exit.x) <= (exit.w || 60) / 2 && p.y <= exit.y + 4 && p.y >= exit.y - (exit.h || 80)) {
    complete(engine);
  }
  for (const [id, view] of run.quoinViews) {
    view.phase += 0.08;
    if (!view.spr || view.spr.destroyed) continue;
    view.spr.y = view.baseY + Math.sin(view.phase) * 4;
    const flag = view.spr.puzzleQuoin?.flag;
    if (flag && !view.spr.visible && !run.taken.has(id) && locationEventsApi.flag(flag)) view.spr.visible = true;
  }
  run.prevY = engine.player?.y ?? null;
}

/** Pays the reward; returns it with any energy or mood the gate refused set to 0. */
function payout(engine, r) {
  const pc = engine.pc;
  // puzzle_level_color_blockage.js 45: metabolics_add_energy, which gives
  // nothing while dead or Super Pooped and says so (inc_metabolics.js 40-53, 79-86).
  const energy = r.energy > 0 && metabolicGain('energy').ok ? r.energy : 0;
  const mood = r.mood > 0 && metabolicGain('mood').ok ? r.mood : 0;
  if (r.xp) {
    pc.xp = (pc.xp || 0) + r.xp;
    pc.imagination = (pc.imagination || 0) + r.xp;
  }
  if (r.currants) pc.currants = (pc.currants || 0) + r.currants;
  if (energy) pc.energy = Math.min(energyMax(pc), (pc.energy || 0) + energy);
  if (mood) pc.mood = Math.min(moodMax(pc), (pc.mood || 0) + mood);
  const ledger = pc.giantFavor;
  for (const f of r.favor || []) if (ledger) ledger[f.giant] = Math.max(0, Number(ledger[f.giant]) || 0) + f.points;
  return { ...r, energy, mood };
}

function complete(engine) {
  if (!run || run.complete) return;
  run.complete = true;
  const tsid = run.tsid;
  const reward = completionReward(run.def, save, tsid);
  const ms = Math.max(0, Math.round(locationEventsApi.clock() - run.startedAt));
  save.completed[tsid] = (save.completed[tsid] || 0) + 1;
  if (!save.best[tsid] || ms < save.best[tsid]) save.best[tsid] = ms;
  const name = run.def.name || engine.street?.label || 'Puzzle street';
  const quoins = `${run.taken.size}/${run.def.quoins.length} quoins`;
  const bits = rewardBits(reward ? payout(engine, reward) : null);
  engine.setData('puzzleComplete', `${tsid}:${save.completed[tsid]}`);
  engine.setData('puzzleReward', bits.join(' · ') || 'none');
  engine.pushActivity(reward ? `You solved ${name}! ${bits.join(', ')}` : `You solved ${name} again (${quoins}).`);
  engine.award({
    kind: 'quest',
    title: `${name} solved!`,
    body: reward ? run.def.completion || 'Well done. The way out is open.' : `Another clean run: ${quoins}.`,
    subtitle: bits.join(' · ') || quoins,
    primaryLabel: 'OK',
  });
  engine.updateHud();
  engine.save();
  if (run.def.exit?.stay) return;
  const back = save.returnTo;
  save.returnTo = null;
  if (back && key(back.tsid) !== tsid && engine.travelGate(back.tsid)?.ok !== false) {
    setTimeout(() => engine.enter(back.tsid, { spawnX: back.x, spawnY: back.y }), 1200);
  } else if (run.def.start) {
    place(engine, run.def.start.x, run.def.start.y);
    engine.toast('Open the Map to head back out.');
  }
}

/* ------------------------------------------------------------------ */
/* Map card                                                            */
/* ------------------------------------------------------------------ */

function rememberReturn(engine) {
  if (defFor(engine.streetTsid) || engine.transientInstance()) return;
  const p = engine.player;
  save.returnTo = { tsid: engine.streetTsid, x: Math.round(p?.x || 0), y: Math.round(p?.y || 0) };
}

function travelTo(engine, tsid) {
  const def = defFor(tsid);
  if (!def || !engine.streetExists(tsid)) return false;
  const gate = engine.travelGate(tsid);
  if (gate && gate.ok === false) {
    if (gate.msg) engine.toast(gate.msg);
    return false;
  }
  rememberReturn(engine);
  engine.closeMap?.();
  engine.enter(tsid, def.start ? { spawnX: def.start.x, spawnY: def.start.y } : {});
  return true;
}

function buildMapCard(engine) {
  if (!data || typeof document === 'undefined') return null;
  const rows = Object.entries(data).filter(([, def]) => def.exit && def.mapCard !== false);
  if (!rows.length) return null;
  const card = document.createElement('section');
  card.className = 'map-feature-card puzzle-map-card';
  card.style.cssText = 'padding:8px 10px;margin:0 0 8px;border-radius:10px;background:#f6f0ff;border:1px solid #d8c8f0;font-size:13px';
  const head = document.createElement('div');
  head.textContent = 'Puzzle streets';
  head.style.cssText = 'font-weight:700;margin-bottom:6px;color:#4b2f75';
  card.appendChild(head);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
  for (const [tsid, def] of rows) {
    const b = document.createElement('button');
    b.type = 'button';
    const done = save.completed[tsid] > 0;
    b.textContent = `${done ? '✓ ' : ''}${def.name}`;
    b.title = def.blurb || def.name;
    b.style.cssText = `padding:3px 9px;border-radius:999px;border:1px solid #bfa8e6;background:${done ? '#e3f4d8' : '#fff'};cursor:pointer`;
    b.disabled = key(engine.streetTsid) === tsid;
    b.addEventListener('click', () => travelTo(engine, tsid));
    wrap.appendChild(b);
  }
  card.appendChild(wrap);
  return card;
}

/* ------------------------------------------------------------------ */
/* QA                                                                  */
/* ------------------------------------------------------------------ */

function publish(engine, now) {
  if (now - lastData < DATA_MS) return;
  lastData = now;
  engine.setData('puzzleStreet', run?.tsid || '');
  engine.setData('puzzleStrict', locationEventsApi.strict() ? '1' : '0');
  engine.setData('puzzleTriggers', run ? run.def.triggers.length : 0);
  engine.setData('puzzleFired', run?.fired || 0);
  engine.setData('puzzleLast', run?.last || '');
  engine.setData('puzzleQuoins', run ? `${run.taken.size}/${run.def.quoins.length}` : '');
  engine.setData('puzzleRespawns', run?.respawns || 0);
  engine.setData('puzzleGravity', run ? Number(locationEventsApi.gravity().toFixed(2)) : '');
  engine.setData('puzzleFlips', run?.flips || 0);
}

function demoStep(engine, now) {
  const want = engine.param('puzzledemo');
  if (!want || demo.stage === 'done' || !data) return;
  if (demo.stage === 'away' && run?.tsid === key(want)) demo = { ...demo, stage: 'arrived', at: now + 600 };
  if (now < demo.at) return;
  const def = defFor(want);
  if (demo.stage === 'idle') {
    if (!def || !engine.streetExists(key(want))) {
      demo.stage = 'done';
      engine.setData('puzzleDemo', 'unknown-street');
      return;
    }
    if (run?.tsid === key(want)) {
      demo = { ...demo, stage: 'arrived', at: now + 400 };
      return;
    }
    demo = { ...demo, stage: 'away', at: now + 25000 };
    engine.setData('puzzleDemo', 'travelling');
    engine.enter(key(want), def.start ? { spawnX: def.start.x, spawnY: def.start.y } : {});
    return;
  }
  if (demo.stage === 'away') {
    if (run?.tsid === key(want)) demo = { ...demo, stage: 'arrived', at: now + 400 };
    else demo.stage = 'done';
    return;
  }
  if (!run) return;
  if (demo.stage === 'arrived') {
    const x = Number(engine.param('puzzlex'));
    const y = Number(engine.param('puzzley'));
    if (Number.isFinite(x) && x > 0 && Number.isFinite(y) && y > 0) place(engine, x, y);
    else if (def.start) place(engine, def.start.x, def.start.y);
    engine.setData('puzzleDemo', 'arrived');
    const auto = engine.param('puzzleautoplay');
    if (!auto) {
      demo.stage = 'done';
      return;
    }
    const steps = autoplaySteps(def);
    const stopAt = auto !== '1' ? auto : '';
    if (stopAt) {
      const at = steps.findIndex((s) => s.kind === 'trigger' && s.id === stopAt);
      demo.queue = at >= 0 ? steps.slice(0, at + 1) : steps.filter((s) => s.kind === 'trigger');
    } else {
      demo.queue = steps;
    }
    demo.stage = 'run';
    demo.at = now + 800;
    return;
  }
  if (engine.busy() && !run.complete) return;
  const step = demo.queue.shift();
  if (!step) {
    // &puzzleend=x,y frames a result (e.g. the moon) once the steps are done.
    const end = String(engine.param('puzzleend') || '').split(',').map(Number);
    if (end.length === 2 && end.every(Number.isFinite)) place(engine, end[0], end[1]);
    engine.setData('puzzleDemo', run.complete ? 'complete' : `held:${run.last}`);
    demo.stage = 'done';
    return;
  }
  if (step.kind === 'trigger') {
    const t = def.triggers.find((tr) => tr.id === step.id);
    if (t) {
      // Stand inside the box: feet on its floor line, or at its middle for
      // mid-air (body) boxes.
      const y = t.standY ?? (t.body ? t.y - t.h / 2 : t.y - 2);
      place(engine, t.standX ?? t.x, y);
      engine.player.onGround = !t.body;
      // A clicked trigger (a light beam) runs its verb once the avatar stands there.
      if (t.verb === BEAM_UP_VERB) beamUp(engine, t.id);
    }
    engine.setData('puzzleDemo', `trigger:${step.id}`);
  } else if (step.kind === 'quoin') {
    place(engine, step.q.x, step.q.y + 20);
    engine.setData('puzzleDemo', `quoin:${step.q.id}`);
  } else if (step.kind === 'exit') {
    if (def.exit?.flag) {
      // The street's own script finishes it (Piano Party's moon): wait for it.
      step.tries = (step.tries || 0) + 1;
      if (!run.complete && step.tries < 40) demo.queue.unshift(step);
      engine.setData('puzzleDemo', run.complete ? 'exit' : `waiting:${def.exit.flag}`);
    } else {
      complete(engine);
      engine.setData('puzzleDemo', 'exit');
    }
  }
  demo.at = now + (step.kind === 'trigger' ? 1200 : 300);
}

/* ------------------------------------------------------------------ */
/* Feature                                                             */
/* ------------------------------------------------------------------ */

export const puzzlesFeature = {
  id: PUZZLES_FEATURE_ID,

  init(engine) {
    bindGravityFlip(engine);
    if (engine.param('puzzledemo')) engine.setData('puzzleDemo', 'idle');
    load();
  },

  ecologyOverride(street) {
    const def = defFor(street?.tsid);
    // Puzzle levels and gut tubes are hand-built courses: no wandering piggies
    // or vendors. Hub streets with rebuilt triggers (Shim Shiri) keep theirs.
    if (!def || def.emptyEcology === false || !(def.exit || def.emptyEcology)) return null;
    return { label: def.name, sourceTsid: key(street.tsid), counts: {}, empty: true };
  },

  prepareStreet(street) {
    patchStreet(street);
  },

  onStreetEnter(street, engine) {
    clearRun(engine);
    if (!street || engine.homeContext?.().inHome) return;
    if (engine.transientInstance() && !engine.heldInstance?.()) return;
    const tsid = street.tsid;
    const setup = () => {
      const def = defFor(tsid);
      if (!def || !runsHere(engine, def) || key(engine.streetTsid) !== key(tsid) || run) return;
      startRun(engine, street, def);
    };
    if (data) setup();
    else {
      load().then(() => {
        if (key(engine.streetTsid) !== key(tsid)) return;
        // The street arrived before the trigger data: rerun its scripts strictly.
        const def = defFor(tsid);
        if (!runsHere(engine, def)) return;
        if (def?.events || (def?.strict && !locationEventsApi.strict())) {
          patchStreet(street);
          locationEventsApi.restart(engine);
        }
        setup();
      });
    }
  },

  onStreetClear(engine) {
    clearRun(engine);
  },

  onTick(dtMs, now, engine) {
    if (!engine.started) return;
    demoStep(engine, now);
    if (run && runsHere(engine, run.def)) stepRun(engine);
    publish(engine, now);
  },

  /** game.js leaves head-against-ceiling to clampCeiling/stepInverted on these streets. */
  ownsCeilings(engine) {
    return run?.ceilings && runsHere(engine, run.def) ? true : null;
  },

  physics(engine) {
    const def = run?.def;
    if (!def || !runsHere(engine, def)) return null;
    const p = def.physics || {};
    const src = def.sourcePhysics ? SOURCE_PHYSICS : { speed: 1, gravity: 1 };
    return { speed: src.speed * (p.speed ?? 1), jump: p.jump ?? 1, gravity: src.gravity * (p.gravity ?? 1) };
  },

  verbsFor(target) {
    if (target?.classId !== LIGHT_BEAM_CLASS) return null;
    const t = run?.def.triggers.find((tr) => tr.id === target.state?.trigger);
    if (!t) return [];
    return [{ id: BEAM_UP_VERB, label: LIGHT_BEAM.verb, sort: 50, enabled: true, reason: '', energy: 0, durationMs: 0, tooltip: LIGHT_BEAM.tooltip(t.dest) }];
  },

  runVerb(target, verbId, engine) {
    if (target?.classId !== LIGHT_BEAM_CLASS || verbId !== BEAM_UP_VERB) return false;
    beamUp(engine, target.state?.trigger);
    return true;
  },

  verbOverride(target, engine) {
    if (!run?.def?.exit?.door || target?.classId !== 'street_door') return null;
    return [{ id: 'puzzle_exit', label: 'Exit', enabled: true, tooltip: 'Finish the puzzle street', durationMs: 0 }];
  },

  runVerbOverride(target, verbId, engine) {
    if (verbId !== 'puzzle_exit') return null;
    complete(engine);
    return true;
  },

  mapCards(engine) {
    const card = buildMapCard(engine);
    return card ? [card] : [];
  },

  save() {
    return save;
  },

  restore(slice) {
    save = normalizePuzzleSave(slice);
  },
};
