/**
 * Constellation and Beam Me Down: two puzzle levels whose streets were never
 * archived, rebuilt as feature scenes (engine.enterScene) from their reference
 * videos and recovered CC0 art. Rules and layout: js/puzzle-scenes.js.
 *
 * - Constellation: click the sky's stars in order (the first one pulses) to
 *   draw a piggy; closing the outline lights its eye. A miss or a pause makes
 *   the next star twinkle. First finish: +150 iMG, +50 mood.
 * - Beam Me Down: step off the start cloud and steer through the saucers'
 *   tractor beams, which slow the fall and hold 21 quoins (+4 each, through
 *   the normal quoin economy). Landing shows "Bravo! You made it!"; the first
 *   landing pays +138 iMG. Entered with a Ticket To Beam Me Down (pack:
 *   Activate) or from the Map's puzzle card.
 * Both leave by their EXIT door back to the street they were entered from;
 * map travel waits for the door, and a reload resumes on that street.
 *
 * QA: ?autostart=1&questoffer=off&scenedemo=constellation|beam_me_down;
 * &sceneautoplay=1 solves it (constellation: clicks every star in order;
 * beam: drops through each beam's quoins, lands, and leaves; &scenehold=1
 * stays for a screenshot). Canvas data:
 * sceneId, sceneStatus, sceneProgress, sceneQuoins, sceneReward, sceneDemo.
 */

import { addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=catalog-unified-7';
import { QUOIN_SHEET, QUOIN_TYPES } from '../quoins.js?v=g424-1';
import {
  BEAM_ME_DOWN,
  CONSTELLATION,
  SCENES,
  beamAt,
  beamPhysics,
  beamQuoins,
  clickConstellation,
  createConstellationRun,
  fieldStars,
  isPuzzleSceneTsid,
  nextStarIndex,
  normalizeSceneSave,
  sceneTsid,
} from '../puzzle-scenes.js';
import { metabolicGain, moodMax } from '../metabolics.js';
import { frameTexture, isLoaded, onLoaded, sourceFromUrl, textureFromUrl } from '../textures.js';
import { grantMoodXp } from '../mood-xp.js';

export const PUZZLE_SCENES_FEATURE_ID = 'puzzle-scenes';
const TICKET = 'paradise_ticket_beam_me_down';
const DECO = 'assets/decos/groddle/';
const ART = 'assets/sprites/puzzles/';

let save = normalizeSceneSave();
let active = null; // { id, scene, views, quoins, taken, ... }
let entering = false;
let demo = { stage: 'idle', at: 0, queue: [] };
let lastData = 0;

ensureItem(TICKET, {
  label: 'Ticket To Beam Me Down',
  desc: 'A one-way trip down past some very friendly flying saucers.',
  baseCost: 0,
  stackMax: 11,
});

/* ------------------------------------------------------------------ */
/* Drawing                                                            */
/* ------------------------------------------------------------------ */

function skyTexture(PIXI, h, stops) {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  for (const [at, colour] of stops) grad.addColorStop(at, colour);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  return PIXI.Texture.from(canvas);
}

function deco(PIXI, name, x, y, { w, h, alpha = 1, tint, ax = 0.5, ay = 1, rotation = 0 } = {}) {
  const spr = new PIXI.Sprite(textureFromUrl(`${DECO}${name}.png`));
  spr.anchor.set(ax, ay);
  spr.x = x;
  spr.y = y;
  spr.alpha = alpha;
  spr.rotation = rotation;
  if (tint != null) spr.tint = tint;
  const size = () => {
    if (w) spr.width = w;
    if (h) spr.height = h;
  };
  if (isLoaded(spr.texture)) size();
  else onLoaded(spr.texture.source, size);
  return spr;
}

function cloudBank(PIXI, root, scene, y, tint) {
  for (let x = -640, i = 0; x < scene.width + 700; x += 240, i += 1) {
    root.addChild(deco(PIXI, i % 2 ? 'cloud_fluffy_1' : 'cloud_fluffy_2', x, y + 120, { w: 420, h: 200, tint, alpha: 0.95 }));
  }
  const under = new PIXI.Graphics();
  under.rect(-640, y + 60, scene.width + 1280, 600).fill({ color: tint ?? 0xe8eef4, alpha: 1 });
  root.addChild(under);
}

function buildConstellation(engine) {
  const { PIXI } = engine;
  const scene = CONSTELLATION;
  const root = new PIXI.Container();
  const sky = new PIXI.Sprite(skyTexture(PIXI, scene.height, [[0, '#1c2030'], [0.7, '#2c2f42'], [1, '#4a4258']]));
  // Overscan: the chrome around the location view shows past the scene edges.
  sky.x = -600;
  sky.y = -400;
  sky.width = scene.width + 1200;
  sky.height = scene.height + 800;
  root.addChild(sky);
  for (const s of fieldStars(scene)) {
    root.addChild(deco(PIXI, 'star_asset_01', s.x, s.y, { w: 22 * s.size, h: 22 * s.size, ay: 0.5, alpha: 0.9 }));
  }
  const lines = new PIXI.Graphics();
  root.addChild(lines);
  const glows = new PIXI.Container();
  root.addChild(glows);
  const stars = scene.stars.map((s, i) => {
    const spr = deco(PIXI, 'star_asset_01', s.x, s.y, { w: scene.starSize, h: scene.starSize, ay: 0.5 });
    spr.eventMode = 'static';
    spr.cursor = 'pointer';
    spr.hitArea = new PIXI.Circle(0, 0, scene.hitRadius / Math.max(0.2, spr.scale.x || 1));
    spr.on('pointertap', () => clickStar(engine, s.x, s.y));
    spr.puzzleStar = i;
    root.addChild(spr);
    return spr;
  });
  const eye = new PIXI.Graphics();
  eye.circle(0, 0, 14).fill({ color: 0xfff4b0, alpha: 0.95 });
  eye.x = scene.eye.x;
  eye.y = scene.eye.y;
  eye.alpha = 0;
  root.addChild(eye);
  cloudBank(PIXI, root, scene, scene.floorY, 0xd8d0e8);
  return { root, lines, glows, stars, eye };
}

function buildBeamMeDown(engine) {
  const { PIXI } = engine;
  const scene = BEAM_ME_DOWN;
  const root = new PIXI.Container();
  const sky = new PIXI.Sprite(skyTexture(PIXI, scene.height, [[0, '#1b2230'], [0.5, '#2a2440'], [1, '#3a2e48']]));
  sky.x = -600;
  sky.y = -400;
  sky.width = scene.width + 1200;
  sky.height = scene.height + 800;
  root.addChild(sky);
  for (let y = 300, i = 0; y < scene.height - 300; y += 340, i += 1) {
    root.addChild(deco(PIXI, i % 2 ? 'cloud_fluffy_1' : 'cloud_fluffy_2', 200 + ((i * 523) % 1200), y, { w: 360, h: 190, alpha: 0.25, tint: 0x9aa4b8 }));
  }
  const beams = [];
  for (const s of scene.saucers) {
    const g = new PIXI.Graphics();
    const top = s.y + 30;
    g.poly([
      s.x - scene.beamTop / 2, top, s.x + scene.beamTop / 2, top,
      s.x + scene.beamBottom / 2, top + scene.beamLength, s.x - scene.beamBottom / 2, top + scene.beamLength,
    ]);
    g.fill({ color: 0xfff2b0, alpha: 0.16 });
    g.poly([
      s.x - scene.beamTop / 4, top, s.x + scene.beamTop / 4, top,
      s.x + scene.beamBottom / 4, top + scene.beamLength, s.x - scene.beamBottom / 4, top + scene.beamLength,
    ]);
    g.fill({ color: 0xfff8d8, alpha: 0.12 });
    root.addChild(g);
    beams.push(g);
    const ufo = new PIXI.Sprite(textureFromUrl(`${ART}ufo_1.png`));
    ufo.anchor.set(0.5, 0.75);
    ufo.x = s.x;
    ufo.y = s.y + 30;
    ufo.scale.set(0.5);
    root.addChild(ufo);
  }
  // Start cloud with its sign, and the landing cloud floor.
  root.addChild(deco(PIXI, 'cloud_fluffy_1', (scene.startCloud.x0 + scene.startCloud.x1) / 2, scene.startCloud.y + 70, { w: 520, h: 210, tint: 0xe8eef4 }));
  const sign = new PIXI.Text({ text: scene.sign.replace(' here!', '\nhere!'), style: { fontFamily: 'Trebuchet MS, sans-serif', fontSize: 22, fontWeight: '700', fill: 0xffffff, align: 'center' } });
  sign.anchor.set(0.5, 1);
  sign.x = (scene.startCloud.x0 + scene.startCloud.x1) / 2;
  sign.y = scene.startCloud.y - 110;
  sign.alpha = 0.9;
  root.addChild(sign);
  cloudBank(PIXI, root, scene, scene.floorY, 0xe8eef4);
  const bravo = new PIXI.Text({ text: scene.completion.replace('! ', '!\n').replace('You made', 'You\nmade'), style: {
    fontFamily: 'Trebuchet MS, sans-serif', fontSize: 46, fontWeight: '800', fill: 0xe8d23a, align: 'center', lineHeight: 50,
  } });
  bravo.anchor.set(0.5, 1);
  bravo.x = scene.width / 2;
  bravo.y = scene.floorY - 160;
  bravo.alpha = 0;
  root.addChild(bravo);
  return { root, beams, bravo };
}

function exitDoor(engine, scene) {
  const { PIXI } = engine;
  const door = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.roundRect(-34, -108, 68, 108, 26).fill(0x2b2230);
  g.roundRect(-26, -96, 52, 20, 4).fill(0xe2c34a);
  door.addChild(g);
  const label = new PIXI.Text({ text: 'EXIT', style: { fontFamily: 'Trebuchet MS, sans-serif', fontSize: 15, fontWeight: '800', fill: 0x2b2230 } });
  label.anchor.set(0.5, 0.5);
  label.y = -86;
  door.addChild(label);
  door.x = scene.exit.x;
  door.y = scene.exit.y;
  door.zIndex = 20;
  engine.entityLayer.addChild(door);
  const target = engine.register({
    classId: 'puzzle_scene_exit',
    featureId: PUZZLE_SCENES_FEATURE_ID,
    label: 'Exit',
    subtitle: 'Back to where you came from',
    sprite: door,
  });
  return { door, target };
}

let quoinFrames = null;
function quoinTexture(engine, type) {
  const { PIXI } = engine;
  if (!quoinFrames) {
    const base = sourceFromUrl(QUOIN_SHEET.url);
    quoinFrames = {};
    for (const def of Object.values(QUOIN_TYPES)) {
      quoinFrames[def.id] = frameTexture(base, new PIXI.Rectangle(0, def.row * QUOIN_SHEET.frameHeight, QUOIN_SHEET.frameWidth, QUOIN_SHEET.frameHeight));
    }
  }
  return quoinFrames[type] || quoinFrames.xp;
}

/* ------------------------------------------------------------------ */
/* Enter / leave                                                      */
/* ------------------------------------------------------------------ */

function inMyScene(engine) {
  return Boolean(active) && engine.inScene() && engine.sceneTsid === sceneTsid(active.id);
}

function startScene(engine, id) {
  const scene = SCENES[id];
  if (!scene || entering) return false;
  if (!engine.inScene() && !isPuzzleSceneTsid(engine.streetTsid)) {
    save.returnTo = { tsid: engine.streetTsid, x: Math.round(engine.player?.x || 0), y: Math.round(engine.player?.y || 0) };
  }
  engine.closeMap?.();
  const views = id === 'constellation' ? buildConstellation(engine) : buildBeamMeDown(engine);
  const platforms = id === 'constellation'
    ? [{ id: 'clouds', x1: 0, y1: scene.floorY, x2: scene.width, y2: scene.floorY }]
    : [
      { id: 'start-cloud', x1: scene.startCloud.x0, y1: scene.startCloud.y, x2: scene.startCloud.x1, y2: scene.startCloud.y },
      { id: 'floor-cloud', x1: 0, y1: scene.floorY, x2: scene.width, y2: scene.floorY },
    ];
  entering = true;
  try {
    engine.enterScene({
      tsid: sceneTsid(id),
      label: scene.name,
      hubName: id === 'beam_me_down' ? 'Paradise' : 'Puzzle',
      width: scene.width,
      height: scene.height,
      background: views.root,
      platforms,
      walls: [],
      spawn: scene.spawn,
      returnTo: save.returnTo,
    });
  } finally {
    entering = false;
  }
  active = {
    id,
    scene,
    views,
    run: id === 'constellation' ? createConstellationRun() : null,
    quoins: id === 'beam_me_down' ? beamQuoins(scene) : [],
    taken: new Set(),
    quoinSprites: new Map(),
    landed: false,
    complete: false,
    lastClickAt: Date.now(),
    status: id === 'constellation' ? 'connecting' : 'falling',
    reward: '',
  };
  // A smaller avatar so the whole sky (or beam) reads at once, as in the video.
  const p = engine.player;
  if (p && scene.avatarScale && !active.scaled) {
    active.scaled = { base: p.baseScale };
    p.baseScale *= scene.avatarScale;
  }
  active.exit = exitDoor(engine, scene);
  for (const q of active.quoins) {
    const spr = new engine.PIXI.Sprite(quoinTexture(engine, q.type));
    spr.anchor.set(0.5, 0.5);
    spr.scale.set(0.6);
    spr.x = q.x;
    spr.y = q.y;
    spr.zIndex = 30;
    engine.entityLayer.addChild(spr);
    active.quoinSprites.set(q.id, spr);
  }
  engine.toast(scene.objective, 3600);
  engine.save();
  return true;
}

async function leaveScene(engine) {
  if (!active) return false;
  const back = save.returnTo;
  cleanup(engine);
  active = null;
  save.returnTo = null;
  engine.save();
  if (back?.tsid) await engine.enter(back.tsid, { spawnX: back.x, spawnY: back.y, quiet: true, bypassFeatureGates: true });
  engine.setData('sceneStatus', 'left');
  return true;
}

function cleanup(engine) {
  if (!active) return;
  const p = engine.player;
  if (active.scaled && p && !p.destroyed) p.baseScale = active.scaled.base;
  active.scaled = null;
  if (active.exit?.target) engine.unregister(active.exit.target);
  for (const spr of [active.exit?.door, ...active.quoinSprites.values()]) {
    if (spr?.parent) spr.parent.removeChild(spr);
    if (spr && !spr.destroyed) spr.destroy({ children: true });
  }
  active.quoinSprites.clear();
}

function payout(engine, r) {
  const pc = engine.pc;
  if (r.xp) {
    pc.xp = (pc.xp || 0) + r.xp;
    pc.imagination = (pc.imagination || 0) + r.xp;
  }
  // The scene's mood goes through metabolics_add_mood like every source gain:
  // nothing while dead (inc_metabolics.js 79-86). Returns the mood that landed.
  const mood = r.mood > 0 && metabolicGain('mood').ok ? r.mood : 0;
  if (mood) pc.mood = Math.min(moodMax(pc), (pc.mood || 0) + mood);
  return mood;
}

function finish(engine) {
  if (!active || active.complete) return;
  active.complete = true;
  const { id, scene } = active;
  const first = !save.done[id];
  save.done[id] = (save.done[id] || 0) + 1;
  const bits = [];
  if (first) {
    const mood = payout(engine, scene.reward);
    if (scene.reward.xp) bits.push(`+${scene.reward.xp} iMG`);
    if (mood) bits.push(`+${mood} mood`);
  }
  active.reward = bits.join(' · ') || 'none';
  active.status = 'complete';
  engine.pushActivity(first ? `${scene.name}: ${scene.completion} ${bits.join(', ')}` : `${scene.name}: ${scene.completion}`);
  engine.award({ kind: 'quest', title: scene.completion, body: first ? 'Take the EXIT when you are ready.' : 'Another fine run.', subtitle: bits.join(' · ') || scene.name, primaryLabel: 'OK' });
  engine.updateHud();
  engine.save();
}

/* ------------------------------------------------------------------ */
/* Constellation                                                      */
/* ------------------------------------------------------------------ */

function clickStar(engine, x, y) {
  if (!active || active.id !== 'constellation') return;
  const out = clickConstellation(active.run, active.scene, x, y);
  active.lastClickAt = Date.now();
  if (out.result === 'connect' || out.result === 'close') {
    engine.playSound(`LITTLE_STAR_${(active.run.connected.length % 19) + 1}`, { volume: 0.5, allowMultiple: true });
    drawConstellation(engine);
    if (out.result === 'close') {
      engine.playSound('MOON_APPEARS', { volume: 0.6 });
      finish(engine);
    }
  } else if (out.result === 'miss') {
    engine.playSound('CLICK_FAILURE', { volume: 0.35 });
  }
}

function drawConstellation(engine) {
  const { lines, glows } = active.views;
  const { PIXI } = engine;
  const pts = active.run.connected.map((i) => active.scene.stars[i]);
  if (active.run.complete) pts.push(active.scene.stars[0]);
  lines.clear();
  pts.forEach((p, i) => (i ? lines.lineTo(p.x, p.y) : lines.moveTo(p.x, p.y)));
  lines.stroke({ width: 3, color: 0xf2efe0, alpha: 0.6 });
  glows.removeChildren();
  for (const p of pts) {
    const g = new PIXI.Graphics();
    g.circle(p.x, p.y, 15).fill({ color: 0xfff2a0, alpha: 0.28 });
    glows.addChild(g);
  }
}

function stepConstellation() {
  const { stars, eye } = active.views;
  const t = Date.now() / 1000;
  const hint = nextStarIndex(active.run, active.scene);
  const showHint = active.run.connected.length === 0 || active.run.misses > 0 || Date.now() - active.lastClickAt > 6000;
  stars.forEach((spr, i) => {
    const pulse = showHint && i === hint ? 1 + Math.sin(t * 6) * 0.18 : 1;
    if (isLoaded(spr.texture)) spr.scale.set((active.scene.starSize / spr.texture.width) * pulse);
  });
  if (active.run.complete) eye.alpha = Math.min(1, eye.alpha + 0.02);
}

/* ------------------------------------------------------------------ */
/* Beam Me Down                                                       */
/* ------------------------------------------------------------------ */

function stepBeam(engine) {
  const p = engine.player;
  if (!p) return;
  for (const q of active.quoins) {
    if (active.taken.has(q.id) || Math.abs(q.x - p.x) > 36 || p.y < q.y - 20 || p.y - 60 > q.y + 20) continue;
    active.taken.add(q.id);
    const spr = active.quoinSprites.get(q.id);
    if (spr) spr.visible = false;
    // Paradise pickups skip the daily quoin limit (the shipped courses do too).
    const pc = engine.pc;
    let amount = q.amount;
    // items/quoin.js 184: an iMG quoin takes the mood bonus.
    if (q.type === 'xp') amount = grantMoodXp(pc, q.amount);
    else if (q.type === 'currants') pc.currants = (pc.currants || 0) + q.amount;
    else pc[q.type] = Math.min(100, (pc[q.type] || 0) + q.amount);
    const label = QUOIN_TYPES[q.type]?.label || 'iMG';
    engine.floatText(q.x, q.y - 14, `+${amount} ${label}`, '#ffffff');
    engine.playSound(`QUOIN_${q.type.toUpperCase()}`, { volume: 0.45 });
    engine.updateHud();
  }
  const { beams, bravo } = active.views;
  const lit = beamAt(active.scene, p.x, p.y);
  beams.forEach((g, i) => {
    g.alpha = active.scene.saucers[i] === lit ? 1.25 : 0.9 + Math.sin(Date.now() / 400 + i) * 0.1;
  });
  if (!active.landed && p.onGround && p.y >= active.scene.floorY - 4) {
    active.landed = true;
    finish(engine);
  }
  if (active.landed) bravo.alpha = Math.min(1, bravo.alpha + 0.03);
}

/* ------------------------------------------------------------------ */
/* QA                                                                 */
/* ------------------------------------------------------------------ */

function publish(engine, now) {
  if (now - lastData < 250) return;
  lastData = now;
  engine.setData('sceneId', active?.id || '');
  engine.setData('sceneStatus', active?.status || '');
  engine.setData('sceneProgress', active?.run ? `${active.run.connected.length + (active.run.complete ? 1 : 0)}/${active.scene.stars.length}` : active?.landed ? 'landed' : '');
  engine.setData('sceneQuoins', active?.quoins.length ? `${active.taken.size}/${active.quoins.length}` : '');
  engine.setData('sceneReward', active?.reward || '');
}

function demoStep(engine, now) {
  const want = engine.param('scenedemo');
  if (!want || demo.stage === 'done' || now < demo.at) return;
  if (demo.stage === 'idle') {
    if (!SCENES[want]) {
      demo.stage = 'done';
      engine.setData('sceneDemo', 'unknown-scene');
      return;
    }
    if (!engine.street || engine.busy()) return;
    startScene(engine, want);
    demo = { stage: 'entered', at: now + 1200, queue: [] };
    engine.setData('sceneDemo', 'entered');
    return;
  }
  if (!active || engine.param('sceneautoplay') !== '1') {
    demo.stage = 'done';
    return;
  }
  if (demo.stage === 'entered') {
    if (active.id === 'constellation') {
      demo.queue = [...active.scene.stars.map((s) => ({ click: s })), { click: active.scene.stars[0] }, { wait: true }];
      if (engine.param('scenehold') !== '1') demo.queue.push({ leave: true });
    } else {
      demo.queue = [...active.quoins.map((q) => ({ place: q })), { place: { x: 800, y: active.scene.floorY - 40 } }, { wait: true }];
      if (engine.param('scenehold') !== '1') demo.queue.push({ leave: true });
    }
    demo.stage = 'run';
  }
  const step = demo.queue.shift();
  if (!step) {
    demo.stage = 'done';
    return;
  }
  if (step.click) clickStar(engine, step.click.x, step.click.y);
  if (step.place && engine.player) {
    engine.player.x = step.place.x;
    engine.player.y = step.place.y + 12;
    engine.player.vy = 0;
    engine.snapCamera();
  }
  if (step.leave) {
    engine.setData('sceneDemo', active.complete ? 'complete' : 'incomplete');
    leaveScene(engine);
  }
  demo.at = now + (step.wait ? 2500 : 450);
}

/* ------------------------------------------------------------------ */
/* Feature                                                            */
/* ------------------------------------------------------------------ */

export const puzzleScenesFeature = {
  id: PUZZLE_SCENES_FEATURE_ID,

  init(engine) {
    if (engine.param('scenedemo')) engine.setData('sceneDemo', 'idle');
  },

  onStreetEnter(street) {
    // Any real street means the scene is over (left by door, reload, or travel).
    if (active && !isPuzzleSceneTsid(street?.tsid)) active = null;
  },

  onStreetClear(engine) {
    if (entering || !active) return;
    cleanup(engine);
  },

  onTick(dtMs, now, engine) {
    if (!engine.started) return;
    demoStep(engine, now);
    if (active && inMyScene(engine)) {
      if (active.id === 'constellation') stepConstellation();
      else stepBeam(engine);
    }
    publish(engine, now);
  },

  physics(engine) {
    if (!active || active.id !== 'beam_me_down' || !inMyScene(engine)) return null;
    const p = engine.player;
    return beamPhysics(Boolean(p && beamAt(active.scene, p.x, p.y)));
  },

  verbsFor(target) {
    if (target?.classId !== 'puzzle_scene_exit') return [];
    return [{ id: 'leave', label: 'Leave', enabled: true, tooltip: 'Back to where you came from', durationMs: 0 }];
  },

  runVerb(target, verbId, engine) {
    if (target?.classId !== 'puzzle_scene_exit' || verbId !== 'leave') return false;
    leaveScene(engine);
    return true;
  },

  travelGate(tsid, engine) {
    if (active && inMyScene(engine)) return { ok: false, msg: 'Take the EXIT to head back.' };
    return null;
  },

  reloadLocation(saved) {
    if (isPuzzleSceneTsid(saved?.tsid)) {
      const back = save.returnTo;
      return back ? { tsid: back.tsid, x: back.x, y: back.y } : null;
    }
    return null;
  },

  packVerbs(classTsid, engine) {
    if (classTsid !== TICKET) return [];
    const block = engine.transientInstance() ? 'Not from here.' : '';
    return [{ id: 'activate', label: 'Activate', primary: true, enabled: !block, reason: block, tooltip: 'Ride down past the friendly saucers' }];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== TICKET || verbId !== 'activate') return false;
    if (countItem(engine.inv, TICKET) < 1 || engine.transientInstance()) return true;
    removeItem(engine.inv, TICKET, 1);
    engine.refreshPack();
    if (!startScene(engine, 'beam_me_down')) addItem(engine.inv, TICKET, 1);
    return true;
  },

  mapCards(engine) {
    if (typeof document === 'undefined') return [];
    const card = document.createElement('section');
    card.className = 'map-feature-card puzzle-scene-card';
    card.style.cssText = 'padding:8px 10px;margin:0 0 8px;border-radius:10px;background:#eef3ff;border:1px solid #c8d4f0;font-size:13px';
    const head = document.createElement('div');
    head.textContent = 'Lost puzzle levels';
    head.style.cssText = 'font-weight:700;margin-bottom:6px;color:#2f3f75';
    card.appendChild(head);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
    const tickets = countItem(engine.inv, TICKET);
    for (const [id, scene] of Object.entries(SCENES)) {
      const b = document.createElement('button');
      b.type = 'button';
      const needsTicket = id === 'beam_me_down';
      b.textContent = `${save.done[id] ? '✓ ' : ''}${scene.name}${needsTicket ? ` (ticket: ${tickets})` : ''}`;
      b.disabled = (needsTicket && tickets < 1) || engine.transientInstance();
      b.style.cssText = `padding:3px 9px;border-radius:999px;border:1px solid #a8b8e0;background:${save.done[id] ? '#e3f4d8' : '#fff'};cursor:pointer`;
      b.addEventListener('click', () => {
        if (needsTicket) {
          if (countItem(engine.inv, TICKET) < 1) return;
          removeItem(engine.inv, TICKET, 1);
          engine.refreshPack();
        }
        startScene(engine, id);
      });
      row.appendChild(b);
    }
    card.appendChild(row);
    return [card];
  },

  save() {
    return save;
  },

  restore(slice) {
    save = normalizeSceneSave(slice);
  },
};
