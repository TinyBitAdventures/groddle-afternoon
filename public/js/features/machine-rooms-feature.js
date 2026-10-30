/**
 * Community machine rooms (register rows G156, G169, G175, G193), as a feature
 * module (see js/feature-host.js).
 *
 * - Indoors: the Meadow and Besara rooms are archived, so street-ecology.json
 *   keeps them indoors (interior: no fallback piggies, trees, vendor or
 *   shrine, no quoins). The Forest Community Machine Room
 *   (js/forest-machine-room.js, tools/build-forest-machine-room.mjs) has no
 *   location XML, so build-street-ecology.mjs cannot write its row: this
 *   feature answers it through ecologyOverride, the same row the archived
 *   rooms carry.
 * - Machines (G169, js/machine-rooms.js): each room's Fuelmakers,
 *   Blockmakers, Woodworkers and Metal Machines stand on the floor. Anyone
 *   can use or refuel them; nobody can pick them up or take them apart
 *   (machine_base isInCraftingAltar). "Use" opens the Make panel on that
 *   machine (engine.openMakeStation): its recipes, its own tank (saved per
 *   room in the street slot, 50/200 to start), no machine needed in the pack.
 * - Wait and collect (G175): Make in the panel starts a job on the machine
 *   instead of making in your hands. The ingredients go in now, the panel
 *   closes, and the machine works for the source's job time (count * wait_ms
 *   + 2200 ms) whether you stay or leave. When it is done the recipe runs on
 *   the machine (engine.makeStationJob: its tank pays the fuel, the badge
 *   counters count), READY plays, the machine calls you, and the output waits
 *   in it until you Collect it (6 game days at most). While it runs, Use says
 *   "The machine is still running. N remaining." The machine hums (ACTIVE, or
 *   Metal Music) while you are in the room and shows a progress bar.
 * - Art states (G193, js/machine-art.js): each machine plays its own SWF
 *   states from Tiny Speck's sheets: assembled when idle; loadOpen, loadClose
 *   and active through a job; ready (its own blinking light) while your stuff
 *   waits; collectOpen and collectClose when you Collect.
 * - Low fuel (G193): when a job leaves the tank at 10 or less the machine says
 *   "I am low on fuel!" for 10 s, and again every 30 s while you are in the
 *   room and the tank stays that low (machine_base use, lowFuelAlert).
 * - Each finished job rolls the source's "Altar bonus!" drop table once
 *   (onMakingComplete), with the preface on every activity line.
 * - Metal Music (G175): a room's Metal Machine has Turn Music Off / On with
 *   the Making Metal card (metalmaker.js:46-101), its own setting.
 * - Notice Board: furnitureRow hangs one on the right wall of every room,
 *   the Forest's included (it has no archived furniture row).
 *
 * QA (doordemo enters through the door that leads in):
 *   Meadow  ?autostart=1&questoffer=off&doordemo=GCR10K3BPJK1U6F&doorindex=0&doorautoplay=1
 *   Besara  ?autostart=1&questoffer=off&doordemo=GA9G6MA4P6923PH&doorindex=0&doorautoplay=1
 *   Forest  ?autostart=1&questoffer=off&doordemo=GLI23FELDHD1O3C&doorindex=0&doorautoplay=1
 *   &machineroomdemo=fuelmaker|blockmaker|woodworker|metalmaker grants the
 *   machine's skill and one job's ingredients and stands you beside the
 *   first one; &machineroomautoplay=1 uses it and starts one job
 *   (=collect also collects it when it is done); &machineroomjobms=N sets
 *   the job time (QA only); &machineroomroll=0..100 fixes the bonus roll
 *   (randInt(0, 100)); &machineroommusic=1 gives the Making Metal card;
 *   &machineroomseed=<class>:<seconds> puts a job you started earlier on
 *   that class's first machine, N seconds from done (0: done, output waiting).
 *   &machineartstate=<state> (machine-art-feature) shows every machine in one
 *   art state, for screenshots.
 * Canvas data: machineRoom (the room's tsid, or ''), machineRoomMachines,
 *   machineRoomFuel (id=fuel,...), machineRoomJobs (id=seconds left,...),
 *   machineRoomWaiting (ids with output waiting), machineRoomBonus (bonus
 *   rolls paid), machineRoomLast (the last line or verb result), machineRoomArt
 *   (id=state,... as drawn).
 */

import { forestMachineRoomEcology, isForestMachineRoomTsid } from '../forest-machine-room.js?v=5f7e4589';
import {
  CALL_PLAYER_LINES,
  MACHINE_HITBOX,
  MACHINE_LABELS,
  MACHINE_ROOM_TSIDS,
  MACHINE_SKILLS,
  SOLO_USER,
  altarBonusLine,
  altarBonusTable,
  collectLine,
  contentsExpired,
  hasContents,
  jobRunning,
  jobSecondsLeft,
  machineJobMs,
  machineMadeLine,
  machineRoomFurnitureRow,
  machineRoomLayout,
  machineTank,
  roomMachineVerbs,
  runningSoundKey,
  secondsToString,
  takeJobIngredients,
  tankFuel,
} from '../machine-rooms.js?v=dd347926';
import { refuelMachine, MAX_FUEL } from '../machines.js?v=aad0d603';
import { DROP_ITEMS, applyDropResult, isEmptyDrop, rollDropTable } from '../drop-tables.js?v=0f922478';
import { ITEM_CATALOG, addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=85d4faba';
import { energyMax, moodMax } from '../metabolics.js?v=8504134e';
import { getSkillCatalog } from '../content-catalogs.js?v=10b118dd';
import { worldToScreen } from '../street-model.js?v=606bae73';
import { nearestSurfaceY } from '../walk-surface.js?v=c4aff42f';
import { textureFromUrl } from '../textures.js?v=01a295a1';
import { createSheetLoader } from '../sprite-sheets.js?v=0e86cc0f';
import {
  LOW_FUEL_BUBBLE_MS,
  LOW_FUEL_LINE,
  LOW_FUEL_REPEAT_MS,
  MACHINE_ART_SHEETS,
  isLowFuel,
  machineFrame,
  machineSheetDef,
  roomMachineState,
} from '../machine-art.js?v=2ce23a81';

export const MACHINE_ROOMS_FEATURE_ID = 'machine-rooms';
const MUSIC_CARD = 'metalmaking_music';

/** One job's ingredients per machine, for the QA demo (catalog_recipes.js). */
const DEMO_JOBS = Object.freeze({
  fuelmaker: { recipe: 'Fuel Cell', key: 'fuel_cell', id: '192', output: 'fuel_cell', waitMs: 20000, items: { jellisac_clump: 12, peat: 8, white_gas: 2 } },
  blockmaker: { recipe: 'Urth Block', key: 'grade_aa_earth_block', id: '190', output: 'grade_aa_earth_block', waitMs: 15000, items: { earth: 5, loam: 2, heavy_gas: 1 } },
  woodworker: { recipe: 'Board', key: 'board', id: '253', output: 'board', waitMs: 2500, items: { plank: 4 } },
  metalmaker: { recipe: 'Metal Rod', key: 'metal_rod', id: '279', output: 'metal_rod', waitMs: 10000, items: { tin: 1, plain_metal: 1 } },
});

let machines = [];
let roomTsid = '';
let bonusPaid = 0;
let last = '';
let demoDone = false;
let seedDone = false;
let timers = [];
/** Saved: machine id -> { room, classTsid, key, recipeId, name, qty, held, startedAt, readyAt, user }. */
let jobs = {};
/** Saved: machine id -> { room, classTsid, items: { classTsid: n }, at }: output waiting (setContents). */
let contents = {};
/** Saved: Metal Machine ids with their music turned off (music_on is on by default). */
let musicOff = {};
let loops = new Map();
let tickMs = 0;
/** Machine id -> when you last collected from it (the collectOpen / collectClose states). */
let collectedAt = {};
/** Machine id -> when it next says it is low on fuel (lowFuelAlert's 30 s timer). */
let lowFuelNext = {};
let sheetLoader = null;

const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const now = () => Date.now();

function skillName(id) {
  return getSkillCatalog()?.[id]?.name || String(id || '').replace(/_\d+$/, '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const upgrades = (engine) => engine.pc?.imaginationUpgrades || [];
const hasMusicCard = (engine) => upgrades(engine).includes(MUSIC_CARD);

function publish(engine) {
  const t = now();
  engine.setData?.('machineRoomMachines', String(machines.length));
  engine.setData?.('machineRoomFuel', machines.map((m) => `${m.def.id}=${tankFuel(m.tank, m.def.classTsid)}`).join(','));
  engine.setData?.('machineRoomJobs', machines.filter((m) => jobs[m.def.id]).map((m) => `${m.def.id}=${jobSecondsLeft(jobs[m.def.id], t)}`).join(','));
  engine.setData?.('machineRoomWaiting', machines.filter((m) => hasContents(contents[m.def.id])).map((m) => m.def.id).join(','));
  engine.setData?.('machineRoomBonus', String(bonusPaid));
  engine.setData?.('machineRoomLast', last);
  engine.setData?.('machineRoomArt', machines.map((m) => `${m.def.id}=${m.art || 'icon'}`).join(','));
}

function subtitle(m, t = now()) {
  const job = jobs[m.def.id];
  if (jobRunning(job, t)) return `Working · ${secondsToString(jobSecondsLeft(job, t))} left`;
  if (hasContents(contents[m.def.id])) return 'Done · your stuff is waiting';
  return `Community machine · Fuel ${tankFuel(m.tank, m.def.classTsid)}/${MAX_FUEL}`;
}

/** The room tank for a machine id (live sprite row first, else the street slot). */
function tankFor(engine, id, room, classTsid) {
  const m = machines.find((row) => row.def.id === id);
  if (m) return m.tank;
  const slot = engine.streetSlot?.(MACHINE_ROOMS_FEATURE_ID, room);
  if (!slot) return machineTank(null, classTsid);
  slot.tanks ||= {};
  slot.tanks[id] = machineTank(slot.tanks[id], classTsid);
  return slot.tanks[id];
}

function spawnFx(engine, m) {
  const { PIXI } = engine;
  if (!PIXI?.Graphics || !PIXI?.Container) return;
  const fx = new PIXI.Container();
  fx.zIndex = 9;
  const bar = new PIXI.Graphics();
  fx.addChild(bar);
  engine.entityLayer.addChild(fx);
  m.fx = { root: fx, bar, drawn: '' };
}

/** Swap the icon for the machine's state sheet once it loads (G193). */
function loadArt(engine, m) {
  const def = machineSheetDef(m.def.classTsid);
  if (!def || !engine.PIXI?.Rectangle) return;
  sheetLoader ||= createSheetLoader(engine.PIXI);
  sheetLoader.load(def).then(() => {
    if (!machines.includes(m) || m.sprite.destroyed) return;
    const frames = sheetLoader.frames(def);
    if (!frames.length) return;
    const s = MACHINE_ART_SHEETS[m.def.classTsid];
    m.frames = frames;
    // The registration x (getAssetInfo) and the idle art's bottom on the floor.
    m.sprite.anchor.set(s.ax / s.fw, s.ay / s.fh);
    m.frame = -1;
  });
}

function spawnMachines(engine, street, layout) {
  const slot = engine.streetSlot?.(MACHINE_ROOMS_FEATURE_ID, street.tsid) || {};
  slot.tanks ||= {};
  const { PIXI } = engine;
  for (const def of layout.machines) {
    slot.tanks[def.id] = machineTank(slot.tanks[def.id], def.classTsid);
    const p = worldToScreen(street, def.x, -130);
    const y = nearestSurfaceY(engine.platforms, p.x, p.y) ?? p.y;
    const sprite = new PIXI.Sprite(textureFromUrl(`assets/sprites/icons/${def.classTsid}.png`));
    sprite.anchor.set(0.5, 1);
    sprite.x = p.x;
    sprite.y = y + 4;
    sprite.zIndex = 8;
    engine.entityLayer.addChild(sprite);
    const m = { def, sprite, baseY: sprite.y, tank: slot.tanks[def.id], target: null, near: false, fx: null, frames: null, frame: -1, art: '' };
    m.target = engine.register({
      classId: def.classTsid,
      featureId: MACHINE_ROOMS_FEATURE_ID,
      label: MACHINE_LABELS[def.classTsid] || def.classTsid,
      subtitle: subtitle(m),
      sprite,
      roomMachine: def.id,
    });
    spawnFx(engine, m);
    machines.push(m);
    loadArt(engine, m);
    // A tank left at 10 or less is still on lowFuelAlert's 30 s timer when you come back.
    if (isLowFuel(tankFuel(m.tank, def.classTsid)) && !lowFuelNext[def.id]) lowFuelNext[def.id] = now() + LOW_FUEL_REPEAT_MS;
  }
}

function machineFor(target) {
  return machines.find((m) => m.target === target) || null;
}

function say(engine, msg, ok = true) {
  last = msg;
  engine.toast?.(msg);
  if (ok) engine.pushActivity?.(msg);
  publish(engine);
}

function callPlayer(engine, m) {
  const line = CALL_PLAYER_LINES[Math.floor(Math.random() * CALL_PLAYER_LINES.length)];
  engine.say?.(m.target, line, 3000);
}

/** The hum while a machine of yours runs in this room (onPlayerEnter, onMakingStart, finishMakingKnown :742-744). */
function syncSounds(engine) {
  const t = now();
  const want = new Set();
  for (const m of machines) {
    const job = jobs[m.def.id];
    if (jobRunning(job, t) && job.user === SOLO_USER) {
      want.add(runningSoundKey(m.def.classTsid, { upgrade: hasMusicCard(engine), musicOn: !musicOff[m.def.id] }));
    }
  }
  for (const [key, loop] of loops) {
    if (!want.has(key)) {
      loop?.stop?.();
      loops.delete(key);
    }
  }
  for (const key of want) {
    if (!loops.has(key)) loops.set(key, engine.playSoundLoop?.(key, { volume: key === 'METALMAKER' ? 0.5 : 0.36 }) || null);
  }
}

function stopSounds() {
  for (const loop of loops.values()) loop?.stop?.();
  loops = new Map();
}

/** onMakingComplete for a room machine: one roll of the recipe's table, once per finished job. */
function altarBonus(engine, classTsid, recipeId, made) {
  const table = made > 0 ? altarBonusTable(classTsid, recipeId) : null;
  if (!table) return;
  const forced = engine.param?.('machineroomroll');
  const rng = forced != null && forced !== '' ? () => (Math.max(0, Math.min(100, Number(forced) || 0)) + 0.5) / 101 : Math.random;
  const result = rollDropTable(table, rng);
  if (isEmptyDrop(result)) return;
  for (const it of result.items) {
    const meta = DROP_ITEMS[it.classTsid];
    if (meta && (!ITEM_CATALOG[it.classTsid] || /^Item /.test(ITEM_CATALOG[it.classTsid].desc || ''))) {
      ensureItem(it.classTsid, { label: meta.label, namePlural: meta.plural, desc: meta.desc || undefined, baseCost: meta.baseCost });
    }
  }
  const pc = engine.pc;
  const paid = applyDropResult(result, { inv: engine.inv, pc, addItem, energyCap: energyMax(pc), moodCap: moodMax(pc) });
  bonusPaid += 1;
  const p = engine.player;
  let lift = 0;
  for (const line of paid.lines) {
    const text = altarBonusLine(line);
    engine.pushActivity?.(text);
    last = text;
    if (p) engine.floatText?.(p.x, (p.y || 0) - 130 - lift, line.replace(/^You got /, '+').replace(/!$/, ''), 0xffe39a);
    lift += 18;
  }
  if (paid.lines[0]) engine.toast?.(altarBonusLine(paid.lines[0]), 4200);
}

/** finishMakingKnown for a machine job whose time is up (wherever you are). */
function finishJob(engine, id) {
  const job = jobs[id];
  if (!job) return;
  delete jobs[id];
  const tank = tankFor(engine, id, job.room, job.classTsid);
  const hold = { ...(job.held || {}) };
  const res = engine.makeStationJob?.({ key: job.key, qty: job.qty, hold, tool: job.classTsid, toolState: tank }) || { made: 0, xp: 0, msgs: [] };
  const items = {};
  for (const [cls, n] of Object.entries(hold)) if (n > 0) items[cls] = n;
  if (Object.keys(items).length) contents[id] = { room: job.room, classTsid: job.classTsid, items, at: now() };
  const m = machines.find((row) => row.def.id === id);
  if (res.made > 0) {
    engine.playSound?.('READY', { volume: 0.55 });
    const line = machineMadeLine(job.name, res.made, res.xp);
    engine.pushActivity?.(line);
    last = line;
    if (m) {
      callPlayer(engine, m);
      m.near = true;
    } else {
      engine.toast?.(`${MACHINE_LABELS[job.classTsid] || job.classTsid}: ${line}`, 4200);
    }
  } else {
    // onMakingFailed (fuelmaker.js:1408-1411): what was put in stays in the machine to collect.
    if (m) engine.say?.(m.target, 'I couldn\'t find the ingredient I needed. I guess I ran for nothing.', 4000);
    last = res.msgs[0] || 'failed';
  }
  for (const msg of res.msgs) if (msg && res.made > 0) engine.pushActivity?.(msg);
  // use() -> lowFuelAlert (fuelmaker.js:1553-1566, :1228-1233): the bubble only reaches the room.
  if (res.made > 0 && isLowFuel(tankFuel(tank, job.classTsid))) {
    lowFuelNext[id] = now() + LOW_FUEL_REPEAT_MS;
    if (m) engine.say?.(m.target, LOW_FUEL_LINE, LOW_FUEL_BUBBLE_MS);
  }
  altarBonus(engine, job.classTsid, job.recipeId, res.made);
  if (m) m.target.subtitle = subtitle(m);
  syncSounds(engine);
  engine.updateHud?.();
  publish(engine);
  engine.save?.();
}

function settleJobs(engine) {
  const t = now();
  for (const id of Object.keys(jobs)) if (!jobRunning(jobs[id], t)) finishJob(engine, id);
}

/** The Make panel's Make on a room machine: the ingredients go in and the job starts. */
function startJob(engine, m, { key, recipe, qty, waitMultiplier }) {
  const id = m.def.id;
  if (jobRunning(jobs[id], now())) {
    say(engine, `The machine is still running. ${secondsToString(jobSecondsLeft(jobs[id]))} remaining.`, false);
    return false;
  }
  if (hasContents(contents[id])) {
    say(engine, 'Collect what is in the machine first.', false);
    return false;
  }
  const held = takeJobIngredients(engine.inv, recipe, qty, { count: countItem, remove: removeItem });
  if (!held) {
    say(engine, 'You need more ingredients.', false);
    return false;
  }
  const forced = Number(engine.param?.('machineroomjobms'));
  const ms = forced > 0 ? forced : machineJobMs(recipe.waitMs, qty, waitMultiplier);
  const t = now();
  jobs[id] = {
    room: roomTsid,
    classTsid: m.def.classTsid,
    key,
    recipeId: String(recipe.id ?? ''),
    name: recipe.name || key,
    qty,
    held,
    startedAt: t,
    readyAt: t + ms,
    user: SOLO_USER,
  };
  last = `start:${id}:${key}x${qty}`;
  engine.toast?.(`${MACHINE_LABELS[m.def.classTsid]}: making ${recipe.name} (x${qty}), ${secondsToString(Math.round(ms / 1000))} to go.`, 2800);
  m.target.subtitle = subtitle(m, t);
  syncSounds(engine);
  engine.refreshPack?.();
  publish(engine);
  engine.save?.();
  return true;
}

function useMachine(engine, m) {
  engine.openMakeStation?.({
    tool: m.def.classTsid,
    toolState: m.tank,
    roomMachine: m.def.id,
    startJob: (job) => startJob(engine, m, job),
  });
  last = `use:${m.def.id}`;
  publish(engine);
}

function collect(engine, m) {
  const id = m.def.id;
  const row = contents[id];
  if (!hasContents(row)) return;
  delete contents[id];
  collectedAt[id] = now();
  for (const [cls, n] of Object.entries(row.items)) addItem(engine.inv, cls, n);
  engine.playSound?.('COLLECT', { volume: 0.6 });
  const line = collectLine(m.def.classTsid);
  m.target.subtitle = subtitle(m);
  m.near = false;
  engine.updateHud?.();
  say(engine, line, true);
  engine.save?.();
}

function refuel(engine, m, all) {
  const res = refuelMachine(engine.inv, m.tank, m.def.classTsid, { all });
  if (res.ok) {
    if (!isLowFuel(tankFuel(m.tank, m.def.classTsid))) delete lowFuelNext[m.def.id];
    // machine_base refuel handler: refueled, and refueled_for_others away from home (Bowser).
    engine.achievement?.('machines:refueled', 1);
    engine.achievement?.('machines:refueled_for_others', 1);
    m.target.subtitle = subtitle(m);
    engine.updateHud?.();
    engine.save?.();
  }
  say(engine, res.msg, res.ok);
}

function setMusic(engine, m, on) {
  if (on) delete musicOff[m.def.id];
  else musicOff[m.def.id] = true;
  syncSounds(engine);
  last = `music:${on ? 'on' : 'off'}:${m.def.id}`;
  publish(engine);
  engine.save?.();
}

/** expireOldContents on entering (fuelmaker.js:1146-1158; a machine room is nobody's house). */
function expireContents(room) {
  const t = now();
  for (const [id, row] of Object.entries(contents)) {
    if (row.room === room && contentsExpired(row.at, t)) delete contents[id];
  }
}

function drawFx(m, t) {
  if (!m.fx || m.sprite.destroyed) return;
  const job = jobs[m.def.id];
  const running = jobRunning(job, t);
  const waiting = !running && hasContents(contents[m.def.id]);
  // G193: the machine's own state (js/machine-art.js) replaces the old wobble and drawn ready light.
  const { state, since } = roomMachineState({ job, waiting, collectedAt: collectedAt[m.def.id] }, t);
  m.art = m.frames ? state : '';
  if (m.frames) {
    const k = machineFrame(m.def.classTsid, state, t - since);
    if (k >= 0 && k !== m.frame && m.frames[k]) {
      m.frame = k;
      m.sprite.texture = m.frames[k];
    }
  }
  // On the floor in front of the machine, clear of the verb prompt above it.
  const top = m.baseY + 10;
  const { bar } = m.fx;
  const pct = running ? Math.max(0, Math.min(1, (t - job.startedAt) / Math.max(1, job.readyAt - job.startedAt))) : 0;
  const key = running ? `run:${Math.round(pct * 60)}` : 'idle';
  if (key !== m.fx.drawn) {
    m.fx.drawn = key;
    bar.clear();
    if (running) {
      const w = 54;
      bar.roundRect(m.sprite.x - w / 2, top, w, 8, 4).fill({ color: 0x2a2320, alpha: 0.72 });
      bar.roundRect(m.sprite.x - w / 2 + 1.5, top + 1.5, Math.max(2, (w - 3) * pct), 5, 2.5).fill({ color: 0x9ed36a, alpha: 0.98 });
    }
  }
}

function nearMachine(engine, m) {
  const p = engine.player;
  if (!p) return false;
  return Math.abs(p.x - m.sprite.x) <= MACHINE_HITBOX.w / 2 && Math.abs((p.y || 0) - m.baseY) <= MACHINE_HITBOX.h;
}

function tickRoom(engine, t) {
  for (const m of machines) {
    const sub = subtitle(m, t);
    if (m.target.subtitle !== sub) m.target.subtitle = sub;
    // onPlayerCollision: come near with your stuff waiting and it calls you.
    const near = nearMachine(engine, m);
    if (near && !m.near && hasContents(contents[m.def.id]) && !jobRunning(jobs[m.def.id], t)) callPlayer(engine, m);
    m.near = near;
    // lowFuelAlert repeats every 30 s while the tank stays at 10 or less.
    const next = lowFuelNext[m.def.id];
    if (next && t >= next) {
      if (isLowFuel(tankFuel(m.tank, m.def.classTsid))) {
        engine.say?.(m.target, LOW_FUEL_LINE, LOW_FUEL_BUBBLE_MS);
        lowFuelNext[m.def.id] = t + LOW_FUEL_REPEAT_MS;
      } else delete lowFuelNext[m.def.id];
    }
  }
}

/** QA: a job started before you left, N seconds from done (0: done, output waiting). */
function seedJob(engine) {
  const raw = engine.param?.('machineroomseed');
  if (!raw || seedDone) return;
  const [cls, secs] = String(raw).split(':');
  const demo = DEMO_JOBS[cls];
  const m = machines.find((row) => row.def.classTsid === cls);
  if (!demo || !m) return;
  seedDone = true;
  const t = now();
  const left = Math.max(0, Number(secs) || 0) * 1000;
  if (left > 0) {
    jobs[m.def.id] = { room: roomTsid, classTsid: cls, key: demo.key, recipeId: demo.id, name: demo.recipe, qty: 1, held: { ...demo.items }, startedAt: t - 2 * 60 * 1000, readyAt: t + left, user: SOLO_USER };
  } else {
    contents[m.def.id] = { room: roomTsid, classTsid: cls, items: { [demo.output]: 1 }, at: t - 60 * 1000 };
  }
  m.target.subtitle = subtitle(m, t);
  later(() => {
    if (engine.player) {
      engine.player.x = m.sprite.x + 260;
      engine.player.vx = 0;
      engine.snapCamera?.();
    }
  }, 900);
}

function setupDemo(engine) {
  if (engine.param?.('machineroommusic') === '1' && engine.pc) {
    engine.pc.imaginationUpgrades ||= [];
    if (!engine.pc.imaginationUpgrades.includes(MUSIC_CARD)) engine.pc.imaginationUpgrades.push(MUSIC_CARD);
  }
  const cls = engine.param?.('machineroomdemo');
  if (!cls || demoDone || !DEMO_JOBS[cls]) return;
  const m = machines.find((row) => row.def.classTsid === cls);
  if (!m) return;
  demoDone = true;
  const job = DEMO_JOBS[cls];
  if (!(engine.learnedSkills || []).includes(MACHINE_SKILLS[cls])) engine.grantSkill?.(MACHINE_SKILLS[cls]);
  if (!jobs[m.def.id] && !hasContents(contents[m.def.id])) {
    for (const [id, n] of Object.entries(job.items)) {
      const short = n - countItem(engine.inv, id);
      if (short > 0) addItem(engine.inv, id, short);
    }
  }
  if (engine.pc && engine.pc.energy < 50) engine.pc.energy = 50;
  engine.updateHud?.();
  later(() => {
    if (engine.player) {
      engine.player.x = m.sprite.x + 90;
      engine.player.vx = 0;
      engine.snapCamera?.();
    }
    const auto = engine.param?.('machineroomautoplay');
    if (auto !== '1' && auto !== 'collect') return;
    useMachine(engine, m);
    later(() => {
      const tile = [...document.querySelectorAll('#make-list .make-tile')].find((t) => t.querySelector('.tile-label')?.textContent === job.recipe);
      tile?.click();
      later(() => document.querySelector('#make-detail [data-make-go]')?.click(), 400);
    }, 600);
    if (auto === 'collect') {
      const poll = () => {
        if (!machines.includes(m)) return;
        if (hasContents(contents[m.def.id]) && !jobs[m.def.id]) later(() => collect(engine, m), 1500);
        else later(poll, 500);
      };
      later(poll, 1500);
    }
  }, 1200);
}

export const machineRoomsFeature = {
  id: MACHINE_ROOMS_FEATURE_ID,

  ecologyOverride(street) {
    return isForestMachineRoomTsid(street?.tsid) ? forestMachineRoomEcology() : null;
  },

  /** The Notice Board on the wall (and the Forest room's furniture row). */
  furnitureRow(street, base) {
    if (!street?.bounds) return null;
    return machineRoomFurnitureRow(street.tsid, base, (x, y) => worldToScreen(street, x, y));
  },

  onStreetEnter(street, engine) {
    const layout = machineRoomLayout(street?.tsid);
    roomTsid = layout ? street.tsid : '';
    engine.setData?.('machineRoom', roomTsid);
    if (layout && street?.bounds && engine.entityLayer) {
      expireContents(street.tsid);
      settleJobs(engine);
      spawnMachines(engine, street, layout);
      seedJob(engine);
      setupDemo(engine);
      syncSounds(engine);
    }
    publish(engine);
  },

  onStreetClear() {
    for (const id of timers) clearTimeout(id);
    timers = [];
    stopSounds();
    machines = [];
    roomTsid = '';
    collectedAt = {};
  },

  onTick(dtMs, t, engine) {
    tickMs += dtMs;
    if (machines.length) {
      for (const m of machines) if (m.fx && !m.sprite.destroyed) drawFx(m, t);
    }
    if (tickMs < 250) return;
    tickMs = 0;
    if (Object.keys(jobs).length) settleJobs(engine);
    if (machines.length) {
      tickRoom(engine, t);
      publish(engine);
    }
  },

  verbsFor(target, engine) {
    const m = machineFor(target);
    if (!m) return null;
    return roomMachineVerbs(m.def.classTsid, m.tank, {
      learned: engine.learnedSkills || [],
      fuelCells: countItem(engine.inv, 'fuel_cell'),
      skillName,
      job: jobs[m.def.id] || null,
      contents: contents[m.def.id] || null,
      now: now(),
      user: SOLO_USER,
      musicUpgrade: hasMusicCard(engine),
      musicOn: !musicOff[m.def.id],
    });
  },

  runVerb(target, verbId, engine) {
    const m = machineFor(target);
    if (!m) return false;
    if (verbId === 'use') useMachine(engine, m);
    else if (verbId === 'collect') collect(engine, m);
    else if (verbId === 'refuel') refuel(engine, m, false);
    else if (verbId === 'refuel_all') refuel(engine, m, true);
    else if (verbId === 'music_off') setMusic(engine, m, false);
    else if (verbId === 'music_on') setMusic(engine, m, true);
    return true;
  },

  save() {
    return {
      version: 1,
      jobs: JSON.parse(JSON.stringify(jobs)),
      contents: JSON.parse(JSON.stringify(contents)),
      ...(Object.keys(musicOff).length ? { musicOff: { ...musicOff } } : {}),
    };
  },

  restore(slice) {
    const rooms = new Set(MACHINE_ROOM_TSIDS);
    const ok = (row) => row && typeof row === 'object' && rooms.has(row.room);
    jobs = {};
    contents = {};
    musicOff = {};
    for (const [id, row] of Object.entries(slice?.jobs || {})) {
      if (ok(row) && row.key && Number.isFinite(Number(row.readyAt))) jobs[id] = { ...row, held: { ...(row.held || {}) }, user: row.user || SOLO_USER };
    }
    for (const [id, row] of Object.entries(slice?.contents || {})) {
      if (ok(row) && row.items && typeof row.items === 'object') contents[id] = { ...row, items: { ...row.items } };
    }
    for (const id of Object.keys(slice?.musicOff || {})) musicOff[id] = true;
  },

  /** QA / tests. */
  _state() {
    return {
      roomTsid,
      bonusPaid,
      last,
      jobs: JSON.parse(JSON.stringify(jobs)),
      contents: JSON.parse(JSON.stringify(contents)),
      musicOff: { ...musicOff },
      loops: [...loops.keys()],
      machines: machines.map((m) => ({ id: m.def.id, classTsid: m.def.classTsid, x: m.sprite.x, fuel: tankFuel(m.tank, m.def.classTsid), subtitle: m.target.subtitle, art: m.art })),
      lowFuelNext: { ...lowFuelNext },
    };
  },
  _reset() {
    jobs = {};
    contents = {};
    musicOff = {};
    bonusPaid = 0;
    last = '';
    collectedAt = {};
    lowFuelNext = {};
    demoDone = false;
    seedDone = false;
    stopSounds();
  },
};
