/**
 * Machine parts sound one by one as a machine is put together or taken apart
 * (js/machines.js assemblySounds / disassemblySounds, features/supply-feature.js),
 * in Tiny Speck's own recordings (tools/sound/sounds-zip-map.json). The keys per
 * part are read from items/<machine>.js when the source is beside the game.
 * Run: node --test tests/machine-part-sounds.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInventory, countItem } from '../public/js/inventory.js?v=f49c8998';
import { createToolConditionState } from '../public/js/tools.js?v=48542c24';
import {
  MACHINE_ASSEMBLIES,
  MACHINE_IDS,
  MACHINE_PART_SOUNDS,
  PART_STEP_MS,
  assemblySounds,
  disassemblySounds,
  machineWorkSounds,
  startAssembly,
  startDisassembly,
} from '../public/js/machines.js?v=e96d8d3b';
import { resolveSound } from '../public/js/sound-board.js?v=7ff169eb';
import { SOUND_ALIASES, SOUND_FILES } from '../public/js/sound-keys.js?v=fb6ee553';
import { supplyFeature } from '../public/js/features/supply-feature.js?v=82859ab1';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(ROOT, '..', 'glitch-GameServerJS', 'items');
const skipWithoutSource = existsSync(join(GSJS, 'blockmaker.js')) ? false : 'needs tinyspeck/glitch-GameServerJS beside the game';
const map = JSON.parse(readFileSync(join(ROOT, 'tools/sound/sounds-zip-map.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(ROOT, 'public/assets/content/sound-keys.json'), 'utf8')).keys;

/** The Tiny Speck files this lane shipped for the parts: key, the server's file name, sha256. */
const PART_FILES = [
  ['CHASSIS1', '1302285963-chassis1_30.mp3', '53cd553f7ca28154'],
  ['CHASSIS2', '1302285971-chassis2_30.mp3', '3aa2ae389cf94822'],
  ['ENGINE2', '1302286012-engine2_30.mp3', 'ca56738753990def'],
  ['PLATES1', '1302286260-plates1_30.mp3', 'e3d0631f204975c0'],
  ['PLATES2', '1302286267-plates2_30.mp3', '9fce2cfb16c786f2'],
  ['FUELMAKER_CASE1', '1302286068-fuelmaker_case1_30.mp3', 'fcb5a2ec08765c48'],
  ['FUELMAKER_CORE1', '1302286130-fuelmaker_core1_30.mp3', '0579bfc28ab2eec6'],
];

/** The body of `function <name>(` in a GSJS item file, up to the next top-level function. */
function fn(src, name) {
  const at = src.indexOf(`\nfunction ${name}(`);
  assert.ok(at >= 0, name);
  const end = src.indexOf('\nfunction ', at + 10);
  return src.slice(at, end < 0 ? undefined : end);
}

/** part_id (2, 3, 4) -> the key that branch announces, in a function of items/<machine>.js. */
function soundsByPart(body) {
  const out = {};
  for (const m of body.matchAll(/part_id == (\d)\)\{([\s\S]*?)\n\t\}/g)) {
    const key = m[2].match(/announce_sound_to_all\('([A-Z0-9_]+)'\)/);
    if (key) out[m[1]] = key[1];
  }
  return out;
}

function fakeEngine(inv, extra = {}) {
  const played = [];
  return {
    played,
    inv,
    pc: { energy: 400, imaginationUpgrades: [] },
    toolState: createToolConditionState(),
    learnedSkills: ['engineering_1'],
    param: () => null,
    playSound: (key, opts) => played.push({ key, opts }),
    ...extra,
  };
}

/** Run the feature's clock from the work's start in 100 ms frames; returns [ms from start, key]. */
function runWork(engine, startAt, forMs) {
  const heard = [];
  for (let t = 0; t <= forMs; t += 100) {
    const before = engine.played.length;
    supplyFeature.onTick(100, startAt + t, engine);
    for (const row of engine.played.slice(before)) heard.push([t, row.key]);
  }
  return heard;
}

describe('machine part sounds: the plan', () => {
  it('every machine has three parts, each with a landing, a fixing and a coming-off sound', () => {
    assert.deepEqual(Object.keys(MACHINE_PART_SOUNDS), MACHINE_IDS);
    for (const id of MACHINE_IDS) {
      assert.equal(MACHINE_PART_SOUNDS[id].length, MACHINE_ASSEMBLIES[id].parts.length, id);
      for (const row of MACHINE_PART_SOUNDS[id]) assert.equal(row.length, 3, id);
    }
    // The Machine Engine is the Blockmaker's second part and the others' third (machine_stand.js assemble_*).
    assert.deepEqual(MACHINE_PART_SOUNDS.blockmaker.map((r) => r[0]), ['CHASSIS1', 'ENGINE1', 'PLATES1']);
    for (const id of ['woodworker', 'metalmaker', 'fuelmaker']) assert.deepEqual(MACHINE_PART_SOUNDS[id].map((r) => r[0]), ['CHASSIS1', 'CHASSIS1', 'ENGINE1'], id);
  });

  it('the keys per part are the source\'s (items/<machine>.js onApplyPart, onApplyPartStep, onDisassemblePart)', { skip: skipWithoutSource }, () => {
    for (const id of MACHINE_IDS) {
      const src = readFileSync(join(GSJS, `${id}.js`), 'utf8');
      const lands = soundsByPart(fn(src, 'onApplyPart'));
      const off = soundsByPart(fn(src, 'onDisassemblePart'));
      // onApplyPartStep: the sound is in each part's `placing_part_step == 2` branch.
      const step = fn(src, 'onApplyPartStep');
      const fixed = {};
      for (const m of step.matchAll(/part_id == (\d)\)\{[\s\S]*?placing_part_step == 2\)\{[\s\S]*?announce_sound_to_all\('([A-Z0-9_]+)'\)/g)) fixed[m[1]] = m[2];
      MACHINE_PART_SOUNDS[id].forEach((row, i) => {
        const part = String(i + 2);
        assert.deepEqual(row, [lands[part], fixed[part], off[part]], `${id} part ${part}`);
      });
      // The second step comes 1100 ms after the part lands.
      assert.match(fn(src, 'onApplyPart'), /apiSetTimer\('onApplyPartStep', 1100\)/, id);
    }
    assert.equal(PART_STEP_MS, 1100);
  });

  it('assembly: each part lands a quarter into its share of the install and is fixed on 1100 ms later', () => {
    assert.deepEqual(assemblySounds('woodworker', 6000), [
      { atMs: 500, key: 'CHASSIS1' }, { atMs: 1600, key: 'CHASSIS2' },
      { atMs: 2500, key: 'CHASSIS1' }, { atMs: 3600, key: 'CHASSIS2' },
      { atMs: 4500, key: 'ENGINE1' }, { atMs: 5600, key: 'ENGINE2' },
    ]);
    assert.deepEqual(assemblySounds('blockmaker', 6000).map((r) => r.key), ['CHASSIS1', 'CHASSIS2', 'ENGINE1', 'ENGINE2', 'PLATES1', 'PLATES2']);
    // Speedy Assembler halves the install; the rhythm is kept in proportion.
    assert.deepEqual(assemblySounds('fuelmaker', 3000).map((r) => r.atMs), [250, 800, 1250, 1800, 2250, 2800]);
    for (const id of MACHINE_IDS) {
      for (const ms of [6000, 3000]) {
        const plan = assemblySounds(id, ms);
        assert.equal(plan.length, 6, id);
        assert.ok(plan.every((r, i) => r.atMs > 0 && r.atMs < ms && (i === 0 || r.atMs > plan[i - 1].atMs)), `${id} ${ms}`);
      }
    }
    assert.deepEqual(assemblySounds('still', 6000), []);
    assert.deepEqual(assemblySounds('woodworker', 0), []);
  });

  it('disassembly: last part first; all at once with Master Exploder, a part every 2200 ms', () => {
    assert.deepEqual(disassemblySounds('woodworker', 6000), [
      { atMs: 1500, key: 'FUELMAKER_ENGINE1' }, { atMs: 3500, key: 'FUELMAKER_CORE1' }, { atMs: 5500, key: 'FUELMAKER_CASE1' },
    ]);
    assert.deepEqual(disassemblySounds('blockmaker', 3000), [
      { atMs: 750, key: 'PLATES1' }, { atMs: 1750, key: 'ENGINE1' }, { atMs: 2750, key: 'CHASSIS1' },
    ]);
    assert.deepEqual(disassemblySounds('metalmaker', 6600, { full: true }), [
      { atMs: 0, key: 'FUELMAKER_ENGINE1' }, { atMs: 2200, key: 'FUELMAKER_CORE1' }, { atMs: 4400, key: 'FUELMAKER_CASE1' },
    ]);
  });

  it('a started job carries its length, so its sounds can be planned; an old save without it plays none', () => {
    const inv = createInventory({ machine_stand: 1, fuelmaker_case: 1, fuelmaker_core: 1, blockmaker_engine: 1 });
    const started = startAssembly(inv, { energy: 100 }, 'fuelmaker', ['engineering_1'], [], 1000);
    assert.equal(started.pending.ms, 6000);
    assert.equal(started.pending.readyAt, 7000);
    assert.equal(machineWorkSounds(started.pending).length, 6);
    const apart = startDisassembly(createInventory({ fuelmaker: 1 }), { energy: 100 }, 'fuelmaker', ['engineering_1'], ['engineering_disassemble_machine'], { full: true }, 0);
    assert.equal(apart.pending.ms, 6600);
    assert.deepEqual(machineWorkSounds(apart.pending).map((r) => r.atMs), [0, 2200, 4400]);
    assert.deepEqual(machineWorkSounds({ kind: 'assemble', machine: 'fuelmaker', energy: 60, readyAt: 0 }), []);
    assert.deepEqual(machineWorkSounds(null), []);
  });
});

describe('machine part sounds: the recordings', () => {
  it('every key of the plan plays a Tiny Speck recording, never a made-up tone', () => {
    const keys = new Set(['STAND1']);
    for (const id of MACHINE_IDS) for (const row of MACHINE_PART_SOUNDS[id]) for (const key of row) keys.add(key);
    for (const key of keys) {
      const r = resolveSound(key);
      assert.ok(r.file, `${key} has no recording`);
      assert.equal(catalog[SOUND_ALIASES[key] || key].origin, 'sounds-zip', key);
    }
  });

  it('the seven part files are the server\'s own, byte for byte, and no longer held', () => {
    for (const [key, zip, sha] of PART_FILES) {
      const row = map.files.find((r) => r.key === key);
      assert.ok(row, `${key} is not in the map's files`);
      assert.equal(row.zip, zip, key);
      assert.equal(row.match, 'filename', key);
      assert.match(row.why, /\.js:\d+/, key);
      assert.ok(!map.held.some((r) => r.key === key), `${key} is still held`);
      assert.equal(SOUND_FILES[key], `assets/audio/sfx/${key}.mp3`);
      const bytes = readFileSync(join(ROOT, 'public', SOUND_FILES[key]));
      assert.ok(createHash('sha256').update(bytes).digest('hex').startsWith(sha), `${key} sha256`);
      // The server's name says so: the key, lower case, uploaded 2011-04-08 with the rest of the machine set.
      assert.equal(zip.replace(/^\d+-/, '').replace(/_30\.mp3$/, '').toUpperCase(), key);
      assert.match(zip, /^13022(85|86)\d{3}-/, key);
    }
  });

  it('the engine coming off a Woodworker, Fuelmaker or Metalmaker borrows the engine sound, and says why', () => {
    assert.equal(SOUND_ALIASES.FUELMAKER_ENGINE1, 'ENGINE1');
    assert.equal(SOUND_FILES.FUELMAKER_ENGINE1, undefined);
    assert.match(catalog.FUELMAKER_ENGINE1.doubt, /no file of that name/);
    assert.equal(resolveSound('FUELMAKER_ENGINE1').file, 'assets/audio/sfx/ENGINE1.mp3');
  });
});

describe('machine part sounds: in the supply feature', () => {
  it('assembling plays the stand, then each part landing and going on, in step with the install', () => {
    supplyFeature._reset();
    const inv = createInventory({ machine_stand: 1, blockmaker_chassis: 1, blockmaker_engine: 1, blockmaker_plates: 1 });
    const engine = fakeEngine(inv);
    const startAt = Date.now();
    assert.equal(supplyFeature.runPackVerb('machine_stand', 'assemble:blockmaker', engine), true);
    assert.deepEqual(engine.played.map((r) => r.key), ['STAND1']);
    const startedAt = supplyFeature._state().work.readyAt - 6000;
    assert.ok(Math.abs(startedAt - startAt) < 1000);
    const heard = runWork(engine, startedAt, 6200);
    assert.deepEqual(heard, [[500, 'CHASSIS1'], [1600, 'CHASSIS2'], [2500, 'ENGINE1'], [3600, 'ENGINE2'], [4500, 'PLATES1'], [5600, 'PLATES2']]);
    assert.equal(countItem(inv, 'blockmaker'), 1);
    assert.equal(supplyFeature._state().work, null);
    // Nothing more once it stands.
    const after = engine.played.length;
    supplyFeature.onTick(100, startedAt + 9000, engine);
    assert.equal(engine.played.length, after);
    supplyFeature._reset();
  });

  it('taking it apart plays each part coming off, last part first; the Master Exploder way too', () => {
    supplyFeature._reset();
    const inv = createInventory({ woodworker: 2 });
    const engine = fakeEngine(inv);
    assert.equal(supplyFeature.runPackVerb('woodworker', 'disassemble', engine), true);
    assert.deepEqual(engine.played, []);
    let startedAt = supplyFeature._state().work.readyAt - 6000;
    assert.deepEqual(runWork(engine, startedAt, 6200), [[1500, 'FUELMAKER_ENGINE1'], [3500, 'FUELMAKER_CORE1'], [5500, 'FUELMAKER_CASE1']]);
    assert.equal(countItem(inv, 'woodworker'), 1);
    assert.equal(countItem(inv, 'machine_stand'), 1);

    engine.pc.imaginationUpgrades = ['engineering_disassemble_machine'];
    engine.played.length = 0;
    assert.equal(supplyFeature.runPackVerb('woodworker', 'disassemble:full', engine), true);
    startedAt = supplyFeature._state().work.readyAt - 6600;
    assert.deepEqual(runWork(engine, startedAt, 6700), [[0, 'FUELMAKER_ENGINE1'], [2200, 'FUELMAKER_CORE1'], [4400, 'FUELMAKER_CASE1']]);
    assert.equal(countItem(inv, 'woodworker'), 0);
    supplyFeature._reset();
  });

  it('a tab that slept through the install does not play the missed parts in a burst, and a reload plays none', () => {
    supplyFeature._reset();
    const inv = createInventory({ machine_stand: 1, fuelmaker_case: 1, fuelmaker_core: 1, blockmaker_engine: 1 });
    const engine = fakeEngine(inv);
    supplyFeature.runPackVerb('machine_stand', 'assemble:fuelmaker', engine);
    const startedAt = supplyFeature._state().work.readyAt - 6000;
    engine.played.length = 0;
    // One frame, 4.6 s in: only the part that is landing right then is heard.
    supplyFeature.onTick(4600, startedAt + 4600, engine);
    assert.deepEqual(engine.played.map((r) => r.key), ['ENGINE1']);
    // Saved mid-install and loaded again: the machine is finished at once, in silence.
    const slice = supplyFeature.save();
    assert.equal(slice.work.ms, 6000);
    supplyFeature._reset();
    supplyFeature.restore(slice, engine);
    engine.played.length = 0;
    supplyFeature.onTick(16, Date.now(), engine);
    assert.deepEqual(engine.played, []);
    assert.equal(countItem(inv, 'fuelmaker'), 1);
    supplyFeature._reset();
  });
});
