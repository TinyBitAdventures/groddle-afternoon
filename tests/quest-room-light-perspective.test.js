/**
 * Walk Toward the Light (public/js/quest-rooms/light-perspective.js): source
 * constants, the light rules (orbs, timers, mixing lamps) and a reachability
 * walk of the intended route against the remake's jump (rise <= 100 px,
 * gap <= 150 px), plus the shortcuts that must stay closed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DURATION_MS,
  LIGHT_ROOM_FACTS,
  LOW,
  ORB_MS,
  SOLUTION,
  bulbInReach,
  bulbXs,
  expireLights,
  initialLightState,
  lightColor,
  lightLayout,
  litClouds,
  mixColor,
  pressBulb,
  solidRects,
  spanGap,
  standingWalls,
  touchOrb,
  room,
} from '../public/js/quest-rooms/light-perspective.js?v=b62f3a4c';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JUMP_RISE, JUMP_GAP } = LIGHT_ROOM_FACTS;

/** Surfaces standing now: slabs, lit clouds and the floor. */
function standable(layout, state, now) {
  return [
    ...layout.slabs.map((s) => ({ id: s.id, x1: s.x1, x2: s.x2, y: s.y })),
    ...litClouds(layout, state, now).map((c) => ({ id: c.id, x1: c.x1, x2: c.x2, y: c.y })),
  ];
}

/** One ordinary jump from a to b, not through a standing wall. */
function hop(a, b, walls = []) {
  const gap = spanGap(a, b);
  const rise = a.y - b.y;
  if (rise > JUMP_RISE || gap > JUMP_GAP) return false;
  const lo = Math.min(a.x2, b.x2);
  const hi = Math.max(a.x1, b.x1);
  const top = Math.min(a.y, b.y) - JUMP_RISE;
  return !walls.some((w) => w.x1 < hi && w.x2 > lo && w.yTop < Math.max(a.y, b.y) && w.yBot > top);
}

/** Surfaces reachable from `start` by hops (no ladders, no falls). */
function reach(layout, state, start, now = 0) {
  const all = standable(layout, state, now);
  const walls = solidRects(layout, state, now).filter((r) => r.id.startsWith('wall_'));
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const id = queue.shift();
    const a = all.find((s) => s.id === id);
    for (const b of all) {
      if (!seen.has(b.id) && hop(a, b, walls)) {
        seen.add(b.id);
        queue.push(b.id);
      }
    }
  }
  return seen;
}

describe('Walk Toward the Light (light_perspective)', () => {
  it('keeps the source quest facts', () => {
    assert.equal(DURATION_MS, 5 * 60 * 1000);
    assert.equal(room.id, 'light_perspective');
    assert.equal(room.durationMs, DURATION_MS);
    const catalog = readFileSync(join(root, 'public/js/quest-rooms/catalog.js'), 'utf8');
    assert.match(catalog, /puzzle_level_light_perspective: 'light_perspective'/);
    assert.match(catalog, /puzzle_level_light_perspective_rem: 'light_perspective'/);
    const quests = JSON.parse(readFileSync(join(root, 'public/assets/content/quests.json'), 'utf8'));
    const all = quests.quests || quests;
    const main = all.puzzle_level_light_perspective;
    const rem = all.puzzle_level_light_perspective_rem;
    assert.deepEqual(main.requirements.map((r) => r.name), ['solved_puzzle']);
    assert.deepEqual(rem.requirements.map((r) => r.name).sort(), ['leave', 'solved_puzzle']);
    assert.equal(main.rewards.currants, 1500);
    assert.equal(main.rewards.favor[0].giant, 'cosma');
    assert.equal(rem.rewards.currants, 350);
    // The reminisce's leave flag rides the runtime default.
    assert.deepEqual(room.onLeave(), {});
  });

  it('mixes lamp colours like the footage', () => {
    assert.equal(mixColor([]), null);
    assert.equal(mixColor(['red', null]), 'red');
    assert.equal(mixColor(['red', 'yellow']), 'orange');
    assert.equal(mixColor(['yellow', 'blue']), 'green');
    assert.equal(mixColor(['blue', 'red']), 'purple');
    assert.equal(mixColor(['blue', 'blue']), 'blue');
  });

  it('times orb lights, keeps the floor red on and puts walls out for a while', () => {
    const layout = lightLayout();
    const s = initialLightState(layout);
    assert.equal(lightColor(layout, s, 'l1', 0), null);
    touchOrb(layout, s, 'o1', 1000);
    assert.equal(lightColor(layout, s, 'l1', 1000 + ORB_MS.short - 1), 'yellow');
    assert.equal(lightColor(layout, s, 'l1', 1000 + ORB_MS.short), null);
    assert.ok(expireLights(s, 1000 + ORB_MS.short));
    // Walls stand until their red orb is touched.
    assert.ok(standingWalls(layout, s, 0).some((w) => w.id === 'w1'));
    touchOrb(layout, s, 'o3', 0);
    assert.ok(!standingWalls(layout, s, 100).some((w) => w.id === 'w1'));
    assert.ok(standingWalls(layout, s, ORB_MS.wall + 1).some((w) => w.id === 'w1'));
    // The red bulb on the floor stays on for good.
    touchOrb(layout, s, 'o7', 0);
    assert.equal(lightColor(layout, s, 'l4r', 10 * 60 * 1000), 'red');
    // Panels: one pick each, pressing again puts it out.
    pressBulb(layout, s, 'pa', 'red');
    pressBulb(layout, s, 'pb', 'blue');
    assert.equal(lightColor(layout, s, 'm1', 0), 'purple');
    pressBulb(layout, s, 'pa', 'yellow');
    assert.equal(lightColor(layout, s, 'm1', 0), 'green');
    pressBulb(layout, s, 'pa', 'yellow');
    assert.equal(lightColor(layout, s, 'm1', 0), 'blue');
    assert.equal(pressBulb(layout, s, 'pb', 'red'), false);
  });

  it('walks the intended route one ordinary jump at a time', () => {
    const layout = lightLayout();
    const s = initialLightState(layout);
    let now = 0;
    let at = layout.slabs.find((x) => x.id === 'a');
    let hops = 0;
    for (const step of SOLUTION) {
      now += 400;
      if (step.orb) {
        const o = layout.orbs.find((it) => it.id === step.orb);
        // Each orb floats over (or beside) where the player stands, within a jump.
        assert.ok(o.x >= at.x1 - 30 && o.x <= at.x2 + 30, `${o.id} over ${at.id}`);
        const up = at.y - o.y;
        assert.ok(up >= 0 && up <= JUMP_RISE + 10, `${o.id} is ${up} px up`);
        touchOrb(layout, s, o.id, now);
      } else if (step.bulb) {
        const [panel, color] = step.bulb;
        const def = layout.panels.find((p) => p.id === panel);
        const bx = bulbXs(def)[def.colors.indexOf(color)];
        assert.ok(bx >= at.x1 && bx <= at.x2 + 40, `${panel} ${color} beside ${at.id}`);
        assert.ok(bulbInReach(def, bx, at.y, bx), `${panel} ${color} reachable from ${at.id}`);
        pressBulb(layout, s, panel, color);
      } else if (step.fall) {
        at = { id: 'low', x1: 0, x2: LIGHT_ROOM_FACTS.W, y: LOW };
      } else if (step.ladder) {
        const l = layout.ladders.find((it) => it.id === step.ladder);
        const top = standable(layout, s, now).find((x) => x.y === l.top && l.x >= x.x1 && l.x <= x.x2);
        assert.ok(top, `ladder ${l.id} reaches a slab`);
        at = top;
      } else if (step.to) {
        const next = standable(layout, s, now).find((x) => x.id === step.to);
        assert.ok(next, `${step.to} is lit when needed`);
        const walls = solidRects(layout, s, now).filter((r) => r.id.startsWith('wall_'));
        assert.ok(hop(at, next, walls), `hop ${at.id} -> ${next.id}`);
        assert.ok(step.x >= next.x1 && step.x <= next.x2);
        at = next;
        hops += 1;
      }
    }
    assert.equal(at.id, 'g');
    assert.ok(hops >= 25);
    // The exit door is on the floor past the last ledge's pillar.
    const g = layout.slabs.find((x) => x.id === 'g');
    assert.ok(layout.door.x > g.x1 + 60 && layout.door.y === LOW);
  });

  it('keeps every section closed without its lights', () => {
    const layout = lightLayout();
    const dark = initialLightState(layout);
    // Nothing lit: the start slab leads nowhere.
    assert.deepEqual([...reach(layout, dark, 'a')], ['a']);
    // The blue cloud is behind a wall until the red orb is touched.
    const s = initialLightState(layout);
    touchOrb(layout, s, 'o2', 0);
    assert.ok(!reach(layout, s, 'b', 1).has('c1'));
    touchOrb(layout, s, 'o3', 0);
    assert.ok(reach(layout, s, 'b', 1).has('c1'));
    // Yellow and blue alone cannot cross the "fall" gap.
    const f = initialLightState(layout);
    touchOrb(layout, f, 'o4', 0);
    touchOrb(layout, f, 'o5', 0);
    touchOrb(layout, f, 'o6', 0);
    assert.ok(!reach(layout, f, 'c2', 1).has('d'));
    touchOrb(layout, f, 'o7', 0);
    assert.ok(reach(layout, f, 'c2', 1).has('d'));
    // Mixing lamp 1: only purple (red + blue) reaches the next ledge.
    for (const [pa, pb, ok] of [['red', null, false], ['yellow', null, false], ['yellow', 'blue', false], [null, 'blue', false], ['red', 'blue', true]]) {
      const m = initialLightState(layout);
      if (pa) pressBulb(layout, m, 'pa', pa);
      if (pb) pressBulb(layout, m, 'pb', pb);
      assert.equal(reach(layout, m, 'd').has('e'), ok, `${pa}+${pb}`);
    }
    // The blue switch hangs where only the yellow (or green) clouds reach.
    const pb = layout.panels.find((p) => p.id === 'pb');
    assert.ok(!bulbInReach(pb, pb.x, LOW));
    assert.ok(!bulbInReach(pb, pb.x, 690));
    assert.ok(bulbInReach(pb, pb.x, 810));
    const y = initialLightState(layout);
    pressBulb(layout, y, 'pa', 'yellow');
    assert.ok(reach(layout, y, 'd').has('m1y2'));
    // Green brings you back up to the red/yellow switch.
    pressBulb(layout, y, 'pb', 'blue');
    assert.ok(reach(layout, y, 'm1g1').has('d'));
    // Mixing lamp 2: of all nine pairs only red + yellow (orange) crosses.
    const colors = ['red', 'yellow', 'blue'];
    for (const a of colors) {
      for (const b of colors) {
        const m = initialLightState(layout);
        pressBulb(layout, m, 'pc', a);
        pressBulb(layout, m, 'pd', b);
        assert.equal(reach(layout, m, 'e').has('f'), mixColor([a, b]) === 'orange', `${a}+${b}`);
      }
    }
    // The upper switch needs the ladder: out of reach from the ledge below.
    const pd = layout.panels.find((p) => p.id === 'pd');
    assert.ok(!bulbInReach(pd, pd.x, 700));
    assert.ok(bulbInReach(pd, pd.x, 590));
    // The spotlight run: walls and the dark blue dish hold you back.
    const z = initialLightState(layout);
    assert.ok(!reach(layout, z, 'f').has('f2'));
    touchOrb(layout, z, 'o8', 0);
    assert.ok(reach(layout, z, 'f', 1).has('f2'));
    assert.ok(!reach(layout, z, 'f', 1).has('g'));
    touchOrb(layout, z, 'o9', 0);
    assert.ok(!reach(layout, z, 'f', 1).has('g'));
    touchOrb(layout, z, 'o10', 0);
    assert.ok(reach(layout, z, 'f', 1).has('g'));
  });

  it('partitions the floor so a fall returns to its own section', () => {
    const layout = lightLayout();
    const pillars = layout.slabs.filter((s) => s.pillar).map((s) => s.x1);
    const bounds = [0, ...pillars, LIGHT_ROOM_FACTS.W];
    // Every floor stretch but the exit's has one ladder up to a slab.
    const floorLadders = layout.ladders.filter((l) => l.bottom == null);
    for (let i = 0; i < bounds.length - 2; i++) {
      const inside = floorLadders.filter((l) => l.x > bounds[i] + 60 && l.x < bounds[i + 1]);
      assert.equal(inside.length, 1, `floor ${bounds[i]}-${bounds[i + 1]}`);
    }
    // Walls stop above the floor, so nobody is trapped below them.
    for (const w of layout.walls) assert.ok(w.yBot < LOW - 100, w.id);
    // Orbs and panel bulbs sit where the camera shows them (<= 160 px up).
    for (const o of layout.orbs) {
      const below = layout.slabs.concat(layout.clouds).filter((s) => o.x >= s.x1 - 40 && o.x <= s.x2 + 40 && s.y >= o.y).map((s) => s.y);
      const floor = Math.min(LOW, ...below);
      assert.ok(floor - o.y <= 160, `${o.id}`);
    }
    for (const p of layout.panels) assert.ok(p.surface - p.bulbY <= 160);
  });
});

describe('Walk Toward the Light: the look of the Snaps (G78)', () => {
  it('draws lamp shades, wired bulbs, wooden dishes, striped poles and a plank EXIT', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
    const src = readFileSync(join(spike, 'public/js/quest-rooms/light-perspective.js'), 'utf8');
    for (const fn of ['function drawShade(', 'function drawPole(', 'Bare bulbs hang on long wires', "'firebog_sign_blank_plank'", "'EXIT'"]) {
      assert.ok(src.includes(fn), fn);
    }
    assert.ok(!src.includes("'sign_exit_starter_01a'"), 'the lit EXIT box is gone');
    for (const d of ['firebog_sign_blank_plank', 'hanging_lightbulb', 'door_asset_gray']) {
      assert.ok(existsSync(join(spike, 'public/assets/decos/groddle', `${d}.webp`)), d);
    }
  });
});
