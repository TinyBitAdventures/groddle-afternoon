/**
 * Rainbow Run (public/js/quest-rooms/rainbow-run.js + rainbow-run-scene.js, register row G108):
 * the source 30-coin, 30-second rules; the night-meadow course read off the players' Snaps, built
 * from arbito1.swf's CC0 decos and the tools/room-art rainbow_run set; and a course where every
 * ledge is reachable with the ordinary jump and 30 coins sit on the meadow route alone.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as kit from '../public/js/quest-rooms/kit.js';
import { COINS_NEEDED, RUN_MS, SPAWN_X, rainbowCoins, rainbowPlatforms, room } from '../public/js/quest-rooms/rainbow-run.js';
import { COLUMNS, FLOOR, ISLANDS, PLANET, W } from '../public/js/quest-rooms/rainbow-run-scene.js';
import { RAINBOW_RUN_FILES } from '../public/js/quest-rooms/rainbow-run-art.js';

const SPIKE = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(SPIKE, rel), 'utf8');
const plats = rainbowPlatforms(kit);
const coins = rainbowCoins();
const floor = plats.find((p) => p.id === 'rr_floor');

/** Ordinary jump: apex ~110 px (quest-instance.test.js); a hop covers ~160 px sideways. */
const RISE = 105;
const REACH = 160;
const yAt = (p, x) => kit.surfaceAt(p, x);

/** Platforms reachable from the floor by walking between touching ends, hopping up, or dropping. */
function reachable() {
  const seen = new Set([floor.id]);
  const queue = [floor];
  while (queue.length) {
    const a = queue.shift();
    for (const b of plats) {
      if (seen.has(b.id)) continue;
      // Gap between the two spans (0 when they overlap) and the rise at the nearest points.
      const gap = Math.max(0, b.x1 - a.x2, a.x1 - b.x2);
      const ax = b.x1 > a.x2 ? a.x2 : b.x2 < a.x1 ? a.x1 : Math.max(a.x1, b.x1);
      const bx = b.x1 > a.x2 ? b.x1 : b.x2 < a.x1 ? b.x2 : Math.max(a.x1, b.x1);
      const rise = yAt(a, ax) - yAt(b, bx);
      const ok = (gap <= 24 && Math.abs(rise) <= 12) || (gap <= REACH && rise <= RISE);
      if (ok) {
        seen.add(b.id);
        queue.push(b);
      }
    }
  }
  return seen;
}

describe('Rainbow Run rules (numismatic_hustle, players/inc_quests.js)', () => {
  it('keeps the 30-second clock, the 30-coin goal and the ready card', () => {
    assert.equal(RUN_MS, 30_000);
    assert.equal(COINS_NEEDED, 30);
    const src = read('public/js/quest-rooms/rainbow-run.js');
    assert.match(src, /Get ready to grab those coins!/);
    assert.match(src, /\(CLICK WHEN READY\)/);
    assert.match(src, /You got them coins but good\./);
    assert.match(src, /How embarrassing\./);
    assert.match(src, /FUTURE_SWING_30/);
    assert.ok(!room.ownLight, 'the night meadow keeps the Dametime tint');
  });
});

describe('Rainbow Run course (G108 Snaps)', () => {
  it('is the Snaps\' night meadow, not the old day sky and striped floor', () => {
    const scene = read('public/js/quest-rooms/rainbow-run-scene.js');
    for (const deco of ['sky_stars_1', 'sky_hills_1', 'bg_land_4a', 'statue_foot_2', 'statue_handpeace', 'cloud_rock_1',
      'pillar_small_3b', 'arbito_tree_2', 'arbito_tree_3', 'tree_1', 'rock_group_2', 'arbito_puddle_1', 'arbito_bush1']) {
      assert.match(scene, new RegExp(`'${deco}'`), deco);
    }
    for (const piece of ['statue_head_2', 'planet_1_back', 'planet_1_front', 'ramp_1', 'ramp_2', 'step1_four', 'arbito_flower_3']) {
      assert.match(scene, new RegExp(`'${piece}'`), piece);
    }
    const room = read('public/js/quest-rooms/rainbow-run.js');
    assert.doesNotMatch(room + scene, /#7fd3ff|BANDS|drawRainbow|block_cloud01/);
  });

  it('draws the missing pieces from the CC0 arbito1.swf room-art set, as planned', () => {
    const plan = JSON.parse(read('tools/room-art/rainbow_run.json'));
    assert.match(plan.source, /glitch-locations arbito1\.swf \(CC0\)/);
    assert.deepEqual(Object.keys(RAINBOW_RUN_FILES).sort(), Object.keys(plan.pieces).sort());
    let bytes = 0;
    for (const [name, [file, w, h]] of Object.entries(RAINBOW_RUN_FILES)) {
      const row = plan.pieces[name];
      assert.deepEqual([file, w, h], [row.file, ...row.world], name);
      assert.equal(row.swf, `bundle:arbito1.swf#${name}`);
      const path = join(SPIKE, 'public/assets/sprites/quest-rooms/rainbow_run', file);
      assert.ok(existsSync(path), file);
      const buf = readFileSync(path);
      bytes += buf.length;
      assert.equal(createHash('sha256').update(buf).digest('hex').slice(0, 16), row.sha, file);
    }
    assert.ok(bytes < 900_000, `${bytes} bytes`);
  });

  it('reaches every ledge, the planet included, with the ordinary jump', () => {
    const seen = reachable();
    const missing = plats.filter((p) => !seen.has(p.id)).map((p) => p.id);
    assert.deepEqual(missing, []);
    assert.ok(plats.some((p) => p.id === 'rr_planet'));
    assert.ok(ISLANDS.length >= 3 && COLUMNS.length >= 6);
    // The planet hangs above the islands, its cut-face floor above the top island.
    const top = plats.find((p) => p.id === 'rr_isle_top');
    assert.ok(plats.find((p) => p.id === 'rr_planet').y1 < top.y1);
    assert.ok(PLANET.y > 0, 'the planet fits under the room\'s top');
  });

  it('pours the rainbow slide down-left, its foot a hop up so the meadow walk passes under it', () => {
    const slide = plats.filter((p) => p.slide);
    assert.ok(slide.length >= 3);
    for (const s of slide) assert.ok(s.y2 < s.y1, `${s.id} rises to the right`);
    const foot = slide.reduce((a, b) => (a.x1 < b.x1 ? a : b));
    // resolveGround snaps feet up at most 12 px: walking right on the floor never boards the slide.
    assert.ok(FLOOR - foot.y1 > 12 && FLOOR - foot.y1 < 100, `foot ${FLOOR - foot.y1} px up`);
    assert.ok(SPAWN_X < foot.x1, 'the run starts left of the slide, by its flower');
  });

  it('keeps every column a hop up and under the jump\'s reach', () => {
    for (const c of COLUMNS) {
      const p = plats.find((q) => q.id === c.id);
      const below = Math.min(...plats.filter((q) => q !== p && q.y1 > p.y1 && q.x2 >= p.x1 - REACH && q.x1 <= p.x2 + REACH)
        .map((q) => q.y1 - p.y1));
      assert.ok(below <= RISE, `${c.id} ${below}`);
    }
  });

  it('puts 30+ coins on the meadow route alone, every coin within reach above a ledge', () => {
    assert.ok(coins.length >= 44, `${coins.length} coins`);
    const meadowIds = new Set(['rr_floor', ...COLUMNS.map((c) => c.id)]);
    let meadow = 0;
    for (const c of coins) {
      const under = plats
        .map((p) => ({ p, y: yAt(p, Math.min(Math.max(c.x, p.x1), p.x2)) }))
        .filter(({ p, y }) => c.x >= p.x1 - 20 && c.x <= p.x2 + 20 && y >= c.y && y - c.y <= 120);
      assert.ok(under.length, `coin ${c.id} at ${c.x},${FLOOR - c.y}`);
      const best = under.reduce((a, b) => (a.y < b.y ? a : b));
      if (meadowIds.has(best.p.id)) meadow += 1;
      assert.ok(c.x > 0 && c.x < W);
    }
    assert.ok(meadow >= COINS_NEEDED + 4, `${meadow} meadow coins`);
  });
});
