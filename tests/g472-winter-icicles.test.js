/**
 * G472: Winter Walk's big icicles fall when you walk under them and stand in the snow as pillars
 * (js/winter-icicles.js, features/rebuilt-rooms-feature.js), as the recording 2Xko9Hy-cLE shows
 * at 1:25-1:29.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reachStreet } from '../public/js/builder/reach-graph.js?v=d03eeab1';
import {
  ICICLE_FALL_MS,
  ICICLE_PILLAR_SPRITE,
  ICICLE_RISE,
  ICICLE_SOUND,
  ICICLE_TRIGGER_HALF,
  createIcicleState,
  fallProgress,
  fallenIcicle,
  icicleSummary,
  stepIcicles,
  underIcicle,
} from '../public/js/winter-icicles.js?v=04c0780f';
import { WINTER_WALK_FLOOR_Y, WINTER_WALK_ICICLES, WINTER_WALK_PILLARS, winterWalkStreet } from '../public/js/winter-walk-streets.js?v=d1c7d113';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const WF = WINTER_WALK_FLOOR_Y;

describe('G472 falling icicles: rules', () => {
  it('fall when the avatar stands on the floor under one (about 70 px either side), not from above or far off', () => {
    const ic = WINTER_WALK_ICICLES[0];
    assert.equal(ICICLE_TRIGGER_HALF, 70);
    assert.equal(underIcicle(ic, { x: ic.x - 70, y: WF }, WF), true);
    assert.equal(underIcicle(ic, { x: ic.x + 40, y: WF - 10 }, WF), true);
    assert.equal(underIcicle(ic, { x: ic.x - 90, y: WF }, WF), false);
    assert.equal(underIcicle(ic, { x: ic.x, y: WF - 120 }, WF), false, 'jumping past high up does not');
    assert.equal(underIcicle(ic, null, WF), false);
  });

  it('drop in a quarter second, eased in, land once and stay down', () => {
    const s = createIcicleState(WINTER_WALK_ICICLES.length);
    const ic = WINTER_WALK_ICICLES[2];
    const feet = { x: ic.x, y: WF };
    assert.deepEqual(stepIcicles(s, WINTER_WALK_ICICLES, feet, WF, 1000), { started: [2], landed: [] });
    assert.ok(ICICLE_FALL_MS <= 300);
    assert.equal(fallProgress(s, 2, 1000), 0);
    assert.ok(fallProgress(s, 2, 1000 + ICICLE_FALL_MS / 2) < 0.5, 'gathering speed');
    assert.deepEqual(stepIcicles(s, WINTER_WALK_ICICLES, feet, WF, 1000 + ICICLE_FALL_MS), { started: [], landed: [2] });
    assert.equal(fallProgress(s, 2, 9e9), 1);
    assert.deepEqual(stepIcicles(s, WINTER_WALK_ICICLES, feet, WF, 9e9), { started: [], landed: [] });
    assert.equal(icicleSummary(s), '1:hang,2:hang,3:down,4:hang,5:hang,6:hang');
  });

  it('stand one hop off the floor, between the walk\'s own pillars', () => {
    for (const ic of WINTER_WALK_ICICLES) {
      const f = fallenIcicle(ic, WF);
      assert.equal(f.x, ic.x);
      assert.ok(f.rise >= ICICLE_RISE.min && f.rise <= ICICLE_RISE.max, `${ic.x}: rise ${f.rise}`);
      assert.equal(f.plat.y, WF - f.rise);
      assert.ok(f.plat.x2 - f.plat.x1 >= 80, 'a cap wide enough to land on');
    }
    // The tallest falls to the cap, the short ones to the floor of the range.
    assert.equal(fallenIcicle({ x: 0, h: 240 }, WF).rise, ICICLE_RISE.max);
    assert.equal(fallenIcicle({ x: 0, h: 100 }, WF).rise, ICICLE_RISE.min);
  });
});

describe('G472 falling icicles: reach', () => {
  it('every fallen icicle is reached from the floor, and nothing strands the player', () => {
    const street = winterWalkStreet();
    WINTER_WALK_ICICLES.forEach((ic, i) => {
      const f = fallenIcicle(ic, WF);
      street.platforms.push({ id: `plat_ww_fallen_icicle_${i + 1}`, x1: f.plat.x1, y1: f.plat.y, x2: f.plat.x2, y2: f.plat.y, pc_perm: -1 });
    });
    const B = street.bounds;
    const r = reachStreet(street, [{ x: -2875 - B.l, y: WF - 4 - B.t, from: 'start' }]);
    assert.ok(r.arrivals.every((a) => a.stands));
    for (let i = 1; i <= WINTER_WALK_ICICLES.length; i += 1) {
      const runs = r.surfaces.filter((s) => s.line === `plat_ww_fallen_icicle_${i}`);
      assert.ok(runs.length && runs.every((s) => s.reached), `fallen icicle ${i}`);
    }
    for (let i = 1; i <= WINTER_WALK_PILLARS.length; i += 1) {
      assert.ok(r.surfaces.filter((s) => s.line === `plat_ww_pillar_${i}`).every((s) => s.reached), `pillar ${i}`);
    }
    assert.deepEqual(r.traps, []);
  });
});

describe('G472 falling icicles: art, sound and wiring', () => {
  it('stand as the walk\'s pillar art and play Tiny Speck\'s own ice recording', () => {
    assert.equal(ICICLE_PILLAR_SPRITE, 'icicle_1b_al1');
    const manifest = new Set(JSON.parse(readFileSync(join(pub, 'assets/decos/manifest.json'), 'utf8')));
    assert.ok(manifest.has(ICICLE_PILLAR_SPRITE));
    const keys = JSON.parse(readFileSync(join(pub, 'assets/content/sound-keys.json'), 'utf8'));
    const row = (keys.keys || keys)[ICICLE_SOUND];
    assert.equal(row.origin, 'archiveorg-sfx');
    assert.ok(existsSync(join(pub, row.file)));
  });

  it('the walk names the icicles it drops, and no longer says they hang still', () => {
    const walk = winterWalkStreet();
    const ids = walk.layers.flatMap((l) => l.decos).map((d) => d.id).filter((id) => /^walk_icicle_/.test(id || ''));
    assert.deepEqual(ids, WINTER_WALK_ICICLES.map((_, i) => `walk_icicle_${i + 1}`));
    assert.match(walk.why.notBuilt, /G472/);
    assert.doesNotMatch(walk.why.notBuilt, /Tapping the icicles down/);
    const feature = readFileSync(join(pub, 'js/features/rebuilt-rooms-feature.js'), 'utf8');
    assert.match(feature, /tickIcicles\(engine, now\)/);
    assert.match(feature, /plat_ww_fallen_icicle_/);
  });
});
