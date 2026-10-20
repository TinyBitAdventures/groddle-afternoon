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
 * QA: ?autostart=1&questoffer=off&puzzledemo=<tsid> travels to a puzzle
 * street and stands at its start; &puzzleautoplay=1 walks the triggers in
 * order by placing the avatar on each (1.2 s apart), collects every quoin,
 * then uses the exit; &puzzleautoplay=<triggerId> stops on that trigger;
 * &puzzlex=&puzzley= start elsewhere. Canvas data: puzzleStreet,
 * puzzleStrict, puzzleTriggers, puzzleFired, puzzleLast, puzzleQuoins,
 * puzzleRespawns, puzzleComplete, puzzleReward, puzzleDemo.
 */

import { locationEventsApi } from './location-events-feature.js?v=location-events-1';
import { collectQuoin, QUOIN_SHEET, QUOIN_TYPES } from '../quoins.js';
import {
  PUZZLE_DATA_URL,
  SOURCE_PHYSICS,
  completionReward,
  normalizePuzzleData,
  normalizePuzzleSave,
  quoinsInReach,
  respawnPoint,
  rewardBits,
  stepTriggers,
} from '../puzzle-triggers.js';

export const PUZZLES_FEATURE_ID = 'puzzles';
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
    loading = fetch(`${PUZZLE_DATA_URL}?v=puzzles-1`)
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
  if (!def?.events || !street) return;
  street.events = { ...(street.events || {}), ...def.events };
}

locationEventsApi.register({
  strict: (street) => defFor(street?.tsid)?.strict === true,
});

/* ------------------------------------------------------------------ */
/* Quoins                                                              */
/* ------------------------------------------------------------------ */

let quoinFrames = null;
function quoinTexture(engine, type) {
  const { PIXI } = engine;
  if (!quoinFrames) {
    const base = PIXI.BaseTexture.from(QUOIN_SHEET.url);
    quoinFrames = {};
    for (const def of Object.values(QUOIN_TYPES)) {
      quoinFrames[def.id] = new PIXI.Texture(
        base,
        new PIXI.Rectangle(0, def.row * QUOIN_SHEET.frameHeight, QUOIN_SHEET.frameWidth, QUOIN_SHEET.frameHeight),
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
    engine.entityLayer.addChild(spr);
    run.sprites.push(spr);
    run.quoinViews.set(q.id, { spr, baseY: q.y, phase: (q.x % 97) / 15 });
  }
}

function takeQuoins(engine) {
  const p = engine.player;
  for (const q of quoinsInReach(run.def.quoins, run.taken, p.x, p.y)) {
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
    prevY: null,
    ceilings: def.ceilings
      ? new Set((street.platforms || []).filter((pl) => pl.pc_perm == null || Number(pl.pc_perm) === 1).map((pl) => pl.id))
      : null,
  };
  spawnQuoins(engine, def);
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

function stepRun(engine) {
  const p = engine.player;
  if (!p || !run) return;
  run.bestX = Math.max(run.bestX, p.x);
  const height = avatarHeight(p);
  clampCeiling(engine, p, height);
  const now = locationEventsApi.clock();
  for (const edge of stepTriggers(run.def.triggers, run.inside, run.spent, p.x, p.y, height)) {
    fireAll(engine, edge.events, edge.trigger.id);
    if (!run) return;
    if (edge.edge === 'enter') run.repeatAt.set(edge.trigger.id, now + (edge.trigger.repeatMs || 0));
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
  takeQuoins(engine);
  if (run.def.fallY != null && p.y > run.def.fallY) respawn(engine, 'Whoops! Back to the ledge.');
  const exit = run.def.exit;
  if (exit && !exit.door && !run.complete && Math.abs(p.x - exit.x) <= (exit.w || 60) / 2 && p.y <= exit.y + 4 && p.y >= exit.y - (exit.h || 80)) {
    complete(engine);
  }
  for (const view of run.quoinViews.values()) {
    view.phase += 0.08;
    if (view.spr && !view.spr.destroyed) view.spr.y = view.baseY + Math.sin(view.phase) * 4;
  }
  run.prevY = engine.player?.y ?? null;
}

function payout(engine, r) {
  const pc = engine.pc;
  if (r.xp) {
    pc.xp = (pc.xp || 0) + r.xp;
    pc.imagination = (pc.imagination || 0) + r.xp;
  }
  if (r.currants) pc.currants = (pc.currants || 0) + r.currants;
  if (r.energy) pc.energy = Math.min(100, (pc.energy || 0) + r.energy);
  if (r.mood) pc.mood = Math.min(100, (pc.mood || 0) + r.mood);
  const ledger = pc.giantFavor;
  for (const f of r.favor || []) if (ledger) ledger[f.giant] = Math.max(0, Number(ledger[f.giant]) || 0) + f.points;
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
  if (reward) payout(engine, reward);
  const bits = rewardBits(reward);
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
  const rows = Object.entries(data).filter(([, def]) => def.mapCard !== false);
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
    const steps = (def.autoplay || def.triggers.filter((t) => !t.respawn).map((t) => t.id)).map((id) => ({ kind: 'trigger', id }));
    const stopAt = auto !== '1' ? auto : '';
    if (stopAt) {
      const at = steps.findIndex((s) => s.id === stopAt);
      demo.queue = at >= 0 ? steps.slice(0, at + 1) : steps;
    } else {
      demo.queue = [...steps, ...def.quoins.map((q) => ({ kind: 'quoin', q })), { kind: 'exit' }];
    }
    demo.stage = 'run';
    demo.at = now + 800;
    return;
  }
  if (engine.busy() && !run.complete) return;
  const step = demo.queue.shift();
  if (!step) {
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
    }
    engine.setData('puzzleDemo', `trigger:${step.id}`);
  } else if (step.kind === 'quoin') {
    place(engine, step.q.x, step.q.y + 20);
    engine.setData('puzzleDemo', `quoin:${step.q.id}`);
  } else if (step.kind === 'exit') {
    complete(engine);
    engine.setData('puzzleDemo', 'exit');
  }
  demo.at = now + (step.kind === 'trigger' ? 1200 : 300);
}

/* ------------------------------------------------------------------ */
/* Feature                                                             */
/* ------------------------------------------------------------------ */

export const puzzlesFeature = {
  id: PUZZLES_FEATURE_ID,

  init(engine) {
    if (engine.param('puzzledemo')) engine.setData('puzzleDemo', 'idle');
    load();
  },

  ecologyOverride(street) {
    const def = defFor(street?.tsid);
    // Puzzle streets are hand-built courses: no wandering piggies or vendors.
    return def ? { label: def.name, sourceTsid: key(street.tsid), counts: {}, empty: true } : null;
  },

  prepareStreet(street) {
    patchStreet(street);
  },

  onStreetEnter(street, engine) {
    clearRun(engine);
    if (!street || engine.transientInstance() || engine.homeContext?.().inHome) return;
    const tsid = street.tsid;
    const setup = () => {
      const def = defFor(tsid);
      if (!def || key(engine.streetTsid) !== key(tsid) || run) return;
      startRun(engine, street, def);
    };
    if (data) setup();
    else {
      load().then(() => {
        if (key(engine.streetTsid) !== key(tsid)) return;
        // The street arrived before the trigger data: rerun its scripts strictly.
        const def = defFor(tsid);
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
    if (run && !engine.transientInstance()) stepRun(engine);
    publish(engine, now);
  },

  physics(engine) {
    const def = run?.def;
    if (!def || engine.transientInstance()) return null;
    const p = def.physics || {};
    const src = def.sourcePhysics ? SOURCE_PHYSICS : { speed: 1, gravity: 1 };
    return { speed: src.speed * (p.speed ?? 1), jump: p.jump ?? 1, gravity: src.gravity * (p.gravity ?? 1) };
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
