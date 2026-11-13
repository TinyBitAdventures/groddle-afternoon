/**
 * Duodenal Browns' bends (register G679): the lost Collision-triggered Event Boxes that turned a
 * traveller over at the spiral's corners, placed from footage OJ8hhmn7h14 10:18-11:08. A walk
 * along the spiral's middle line (read from the street's art) both ways: every rise is ridden
 * with gravity reversed, every drop and every top passage after its bend with gravity normal.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePuzzleData, stepTriggers } from '../public/js/puzzle-triggers.js?v=facc2c29';
import { createEventRuntime, runLocationEvent } from '../public/js/location-events.js?v=05663361';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(readFileSync(join(root, 'public/assets/content/puzzle-triggers.json'), 'utf8'));
const def = normalizePuzzleData(raw).GA9TKSRJ7LD3SGK;
const street = JSON.parse(readFileSync(join(root, 'public/assets/streets/GA9TKSRJ7LD3SGK.json'), 'utf8'));
const events = { ...street.events, ...def.events };

// [x, y, reversed?] along the spiral from the heart to the mouth (screen space, the art's middle line).
const FROM_HEART = [
  [1950, 2000, true], [1950, 1500, true], [1920, 1250, true],
  [1800, 1150, true], [1600, 1150, true], [1300, 1150, false],
  [1170, 1250, false], [1087, 1450, false], [850, 1700, false], [830, 2000, false], [860, 2300, false],
  [1000, 2480, false], [1500, 2500, false], [2000, 2470, false], [2150, 2440, false],
  [2368, 2240, true], [2370, 1800, true], [2370, 1200, true], [2370, 900, true],
  [2250, 840, true], [1900, 840, false], [1500, 840, false], [1000, 840, false], [450, 840, false],
  [300, 1000, false], [260, 1500, false], [300, 2000, false], [260, 2500, false],
  [400, 2900, false], [1000, 2900, false], [2000, 2900, false], [2600, 2900, false],
  [2780, 2600, true], [2780, 1500, true], [2780, 800, true],
  [2600, 350, true], [2250, 330, false], [1500, 300, false], [800, 300, false],
];

// The other way, from the mouth to the heart.
const FROM_MOUTH = [
  [220, 450, false], [800, 300, false], [1500, 300, false], [2300, 350, false], [2600, 350, false],
  [2780, 800, false], [2780, 1500, false], [2780, 2500, false], [2780, 2850, false],
  [2600, 2900, false], [1000, 2900, false], [450, 2900, false], [240, 2800, true],
  [260, 2500, true], [300, 2000, true], [260, 1500, true], [300, 1000, true], [400, 840, true],
  [750, 840, false], [1500, 840, false], [2250, 840, false],
  [2370, 900, false], [2370, 1800, false], [2368, 2300, false],
  [2150, 2440, false], [1500, 2500, false], [1000, 2480, false], [880, 2400, true],
  [830, 2000, true], [850, 1700, true], [1087, 1450, true], [1170, 1250, true], [1300, 1150, true],
  [1600, 1150, false], [1800, 1150, false], [1920, 1250, false], [1950, 1500, false], [1950, 2000, false],
];

/** Walk the line in 10 px steps through the bend boxes; the reversed flag at each waypoint. */
function walk(points, arrival) {
  const rt = createEventRuntime();
  for (const name of arrival) runLocationEvent(rt, events, name, { now: 0, target: true });
  const bends = def.triggers.filter((t) => t.id.startsWith('bend_'));
  const inside = new Set();
  const spent = new Set();
  const seen = [];
  const fired = [];
  let [px, py] = points[0];
  for (const [x, y, want] of points) {
    const n = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / 10));
    for (let i = 1; i <= n; i++) {
      for (const edge of stepTriggers(bends, inside, spent, px + ((x - px) * i) / n, py + ((y - py) * i) / n)) {
        for (const name of edge.events) runLocationEvent(rt, events, name, { now: 0, target: true });
        if (edge.edge === 'enter') fired.push(edge.trigger.id);
      }
    }
    [px, py] = [x, y];
    seen.push({ at: `${x},${y}`, want, reversed: rt.physics.gravity?.value === -1 });
  }
  return { seen, fired };
}

describe('Duodenal Browns bends (G679)', () => {
  test('eight bend boxes, each with its footage note, firing the street\'s own four flip scripts', () => {
    const bends = def.triggers.filter((t) => t.id.startsWith('bend_'));
    assert.equal(bends.length, 8);
    for (const t of bends) {
      assert.ok(t.why && t.why.length > 40, `${t.id} says why it stands there`);
      for (const name of t.onEnter) assert.match(name, /^(invert|reset)_phys_(top|bottom)$/);
    }
    // With the two ends, the start and the street's set_top/remove_bottom, the street's 14 boxes (LA9TKSRJ7LD3SGK.xml).
    assert.deepEqual(def.events.invert_phys_bottom.map((a) => a.type), ['flag_not_exit', 'physics']);
    assert.deepEqual(def.events.reset_phys_top.map((a) => a.type), ['flag_not_exit', 'physics_reset']);
    assert.ok(def.gravityToggle, 'Space still flips as a fallback');
  });

  test('from the heart: up the shaft reversed, every rise reversed, every top passage dropped to its floor', () => {
    const { seen, fired } = walk(FROM_HEART, ['gut_from_bottom']);
    for (const s of seen) assert.equal(s.reversed, s.want, `at ${s.at}`);
    assert.deepEqual(fired.filter((id) => ['bend_inner_top', 'bend_inner_bottom_right', 'bend_middle_top_right', 'bend_outer_bottom_right', 'bend_outer_top_right'].includes(id)),
      ['bend_inner_top', 'bend_inner_bottom_right', 'bend_middle_top_right', 'bend_outer_bottom_right', 'bend_outer_top_right']);
  });

  test('from the mouth: the bottom boxes leave it alone, its own three turn it over at the rises', () => {
    const { seen } = walk(FROM_MOUTH, ['gut_from_top']);
    for (const s of seen) assert.equal(s.reversed, s.want, `at ${s.at}`);
  });

  test('no bend box reaches into a passage it does not belong to (both ways stay right with the boxes crossed)', () => {
    for (const t of def.triggers.filter((b) => b.id.startsWith('bend_'))) {
      assert.ok(t.w <= 340 && t.h <= 400, `${t.id} stays one corner`);
    }
  });
});
