/**
 * Penumbra (G91): the Puzzles-hub level behind Umbra, rebuilt from video
 * jBz24r82wPw (public/js/penumbra.js, tools/build-penumbra.mjs).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LADDERS,
  ORBS,
  PENUMBRA_ORB_IMG,
  PENUMBRA_START,
  PENUMBRA_TSID,
  SQUARES,
  SWITCH_WALLS,
  UMBRA_ENTRY,
  UMBRA_RETURN,
  UMBRA_TSID,
  penumbraStreet,
  windowOrbs,
} from '../public/js/penumbra.js?v=f6f7176e';
import { autoplaySteps, normalizePuzzleData, quoinsInReach, stepTriggers } from '../public/js/puzzle-triggers.js?v=3ee2f2c8';
import { createEventRuntime, dueEventTimers, runLocationEvent } from '../public/js/location-events.js?v=b45cd9c3';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const pen = read(`public/assets/streets/${PENUMBRA_TSID}.json`);
const umbra = read(`public/assets/streets/${UMBRA_TSID}.json`);
const index = read('public/assets/streets/index.json').streets;
const puzzles = normalizePuzzleData(read('public/assets/content/puzzle-triggers.json'));
const manifest = new Set(read('public/assets/decos/manifest.json'));
const screen = (s, p) => ({ x1: p.x1 - s.bounds.l, x2: p.x2 - s.bounds.l, y: p.y1 - s.bounds.t, id: p.id });
const floors = (s) => s.platforms.map((p) => screen(s, p));
/** The floor under (x, y): the highest platform at or below y. */
const floorUnder = (s, x, y) =>
  floors(s)
    .filter((f) => x >= Math.min(f.x1, f.x2) && x <= Math.max(f.x1, f.x2) && f.y >= y - 1)
    .sort((a, b) => a.y - b.y)[0] || null;

describe('Penumbra build', () => {
  test('street JSON, index row and puzzle entries are fresh', () => {
    execFileSync(process.execPath, [join(root, 'tools/build-penumbra.mjs'), '--check'], { cwd: root });
    assert.deepEqual(pen, JSON.parse(JSON.stringify(penumbraStreet())));
    assert.equal(index[PENUMBRA_TSID].label, 'Penumbra');
    assert.equal(index[PENUMBRA_TSID].hubName, 'Puzzles');
    assert.equal(index[PENUMBRA_TSID].reconstructed, true);
  });

  test('draws only CC0 decos the remake ships', () => {
    for (const layer of pen.layers) for (const d of layer.decos) assert.ok(manifest.has(d.sprite), `${d.sprite} not in the deco manifest`);
    const mid = pen.layers.find((l) => l.id === 'middleground');
    assert.deepEqual(mid.filters, { brightness: -100, contrast: -100 }, "Umbra's middleground matrix: silhouettes");
  });
});

describe('Penumbra layout', () => {
  test('22 orbs at +120 iMG: the 2,640 iMG the video counter climbs', () => {
    const def = puzzles[PENUMBRA_TSID];
    assert.equal(def.quoins.length, 22);
    assert.equal(def.quoins.length, ORBS.length + windowOrbs().length);
    assert.ok(def.quoins.every((q) => q.type === 'xp' && q.amount === PENUMBRA_ORB_IMG));
    assert.equal(def.quoins.reduce((n, q) => n + q.amount, 0), 10441115 - 10438475);
  });

  test('every orb sits within a jump of the floor under it', () => {
    for (const q of puzzles[PENUMBRA_TSID].quoins) {
      const f = floorUnder(pen, q.x, q.y);
      assert.ok(f, `orb ${q.id} has no floor`);
      // quoinsInReach takes feet within 64 px below to 41 px above the orb; the source jump apex is 135.
      assert.ok(f.y - q.y <= 135 + 64 - 10, `orb ${q.id} at ${q.x},${q.y} is ${f.y - q.y} px over ${f.id}`);
    }
  });

  test('every ladder runs from one floor up to the next', () => {
    for (const l of LADDERS) {
      assert.ok(floorUnder(pen, l.x, l.y)?.y === l.y, `${l.id} foot on a floor`);
      const top = floors(pen).find((f) => Math.abs(f.y - l.top) <= 12 && l.x >= Math.min(f.x1, f.x2) && l.x <= Math.max(f.x1, f.x2));
      assert.ok(top, `${l.id} top meets a floor`);
    }
    assert.equal(pen.ladders.length, LADDERS.length);
  });

  test('squares sit on a floor or within a jump of one, and each opens what it names', () => {
    const def = puzzles[PENUMBRA_TSID];
    for (const s of SQUARES) {
      const t = def.triggers.find((tr) => tr.id === s.id);
      assert.ok(t?.once, `${s.id} is a one-shot trigger`);
      const f = floorUnder(pen, s.x, s.y);
      assert.ok(f && f.y - s.y <= 200, `${s.id} reachable`);
      const acts = pen.events[s.id];
      assert.ok(acts.some((a) => a.type === 'deco_show' && a.deco === `${s.id}_green`), `${s.id} turns green`);
      if (s.opens) assert.ok(acts.some((a) => a.type === 'wall' && a.wall === `wall_${s.opens}` && a.pc_perm === 0));
    }
    for (const w of SWITCH_WALLS) assert.ok(pen.barriers.some((b) => b.id === `wall_${w.id}` && b.pc_perm == null), `${w.id} starts closed`);
  });

  test('the window square uncovers the grids and lets their orbs be taken', () => {
    const rt = createEventRuntime();
    const quoins = puzzles[PENUMBRA_TSID].quoins.filter((q) => q.flag === 'windows');
    assert.equal(quoins.length, 5);
    const q = quoins[0];
    const has = (f) => rt.flags.has(f);
    assert.equal(quoinsInReach(quoins, new Set(), q.x, q.y + 30, 34, has).length, 0, 'covered');
    const fx = runLocationEvent(rt, pen.events, 'sq2', { now: 0, target: true });
    assert.deepEqual(fx.filter((e) => e.type === 'deco' && !e.visible).map((e) => e.id).filter((id) => id.startsWith('cover_')), ['cover_a', 'cover_b']);
    assert.ok(quoinsInReach(quoins, new Set(), q.x, q.y + 30, 34, has).some((x) => x.id === q.id), 'uncovered');
  });

  test('the ceiling barcode flickers on a loop', () => {
    const rt = createEventRuntime();
    runLocationEvent(rt, pen.events, 'player_enter', { now: 0, target: true });
    let shown = 0;
    let now = 0;
    for (let i = 0; i < 6; i += 1) {
      const [timer] = dueEventTimers(rt, (now += 1000));
      assert.ok(timer, 'a timer is always pending');
      shown += runLocationEvent(rt, pen.events, timer.event, { now }).filter((e) => e.type === 'deco' && e.visible).length;
    }
    assert.ok(shown > 0);
  });
});

describe('Umbra <-> Penumbra', () => {
  test('the teleporter sits on the long bar of the -1066 row and lands at the Penumbra start', () => {
    const def = puzzles[UMBRA_TSID];
    const t = def.triggers.find((tr) => tr.id === 'to_penumbra');
    assert.equal(t.x, UMBRA_ENTRY.x);
    assert.equal(floorUnder(umbra, t.x, t.y - 2)?.id, 'plat_1335376529741');
    const [step] = def.events.to_penumbra;
    assert.equal(step.code.street, PENUMBRA_TSID);
    assert.deepEqual(step.code.arrive, { ...PENUMBRA_START });
    assert.equal(floorUnder(pen, PENUMBRA_START.x, PENUMBRA_START.y)?.y, PENUMBRA_START.y);
    assert.equal(def.emptyEcology, false, "Umbra keeps its ecology (G44: Austin kept the outdoor fallback)");
    assert.ok(!def.exit, 'no Map card');
  });

  test('walking into the ">>" wash returns to the top left ledge added the night Penumbra opened', () => {
    const def = puzzles[PENUMBRA_TSID];
    const exit = def.triggers.find((t) => t.id === 'exit');
    assert.equal(pen.events.to_umbra, undefined, 'no unrecorded teleport in the street JSON');
    const fx = runLocationEvent(createEventRuntime(), { ...pen.events, ...def.events }, 'to_umbra', { now: 0, target: true });
    assert.equal(fx[0].type, 'teleport');
    assert.equal(fx[0].street, UMBRA_TSID);
    assert.deepEqual(fx[0].arrive, { ...UMBRA_RETURN });
    assert.equal(floorUnder(umbra, UMBRA_RETURN.x, UMBRA_RETURN.y)?.id, 'plat_1351549922585');
    // The corridor pillar (sq5) stands between the corridor and the exit.
    const pillar = pen.barriers.find((b) => b.id === 'wall_w5');
    assert.ok(pillar.x - pen.bounds.l < exit.x);
    const inside = new Set();
    const edges = stepTriggers(def.triggers, inside, new Set(), exit.x, exit.y);
    assert.deepEqual(edges.map((e) => e.trigger.id), ['exit']);
  });

  test('autoplay touches every square, takes every orb, then leaves', () => {
    const steps = autoplaySteps(puzzles[PENUMBRA_TSID]);
    assert.deepEqual(steps.filter((s) => s.kind === 'trigger').map((s) => s.id), ['sq1', 'sq2', 'sq6', 'sq3', 'sq4', 'sq5', 'exit']);
    assert.equal(steps.filter((s) => s.kind === 'quoin').length, 22);
    assert.equal(steps.at(-1).id, 'exit');
    // Older streets keep their order: triggers, quoins, then the exit step.
    const old = autoplaySteps(puzzles.GHVP6H0KT403N8A);
    assert.equal(old.at(-1).kind, 'exit');
    assert.equal(old.filter((s) => s.kind === 'quoin').length, puzzles.GHVP6H0KT403N8A.quoins.length);
  });
});
