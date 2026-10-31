/**
 * Winter Walk and Winter Haven rebuilt from players' pictures
 * (js/winter-walk-streets.js, written by tools/build-rebuilt-rooms.mjs; the
 * timed route in js/winter-walk.js and game.js runs on them). Cleops' and
 * URvonb's snaps (research/flickr-2026-10-27, reference only) guide the
 * layout; every deco is CC0 art already shipped.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry } from '../public/js/street-model.js?v=23b926e5';
import { OWNED_STREETS, streetOwner } from '../public/js/location-events.js?v=61e0c5d3';
import { JUMP_GAP } from '../public/js/quest-rooms/puzzle-kit.js?v=8a4480a4';
import { WINTER_HAVEN_STREET_ID, WINTER_WALK_STREET_ID } from '../public/js/winter-walk.js?v=9961c35f';
import {
  WINTER_HAVEN_BOARDWALK_Y,
  WINTER_HAVEN_FIRE_X,
  WINTER_HAVEN_GROUND_Y,
  WINTER_HAVEN_LADDER,
  WINTER_HAVEN_LANDING,
  WINTER_HAVEN_PILLARS,
  WINTER_HAVEN_SOURCE_TSID,
  WINTER_HAVEN_STEP,
  WINTER_HAVEN_TSID,
  WINTER_HUB,
  WINTER_REPEAT_SOURCE_TSIDS,
  WINTER_WALK_CAMP,
  WINTER_WALK_PILLARS,
  WINTER_WALK_SOURCE_TSID,
  WINTER_WALK_START,
  WINTER_WALK_TSID,
  isWinterStreetTsid,
  winterStreetEcology,
} from '../public/js/winter-walk-streets.js?v=615549da';
import { rebuiltRoomsFeature } from '../public/js/features/rebuilt-rooms-feature.js?v=47822aae';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(spike, 'public');
const streets = join(pub, 'assets/streets');
const gsjs = join(spike, '../glitch-GameServerJS');
const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8')).streets;
const manifest = new Set(JSON.parse(readFileSync(join(pub, 'assets/decos/manifest.json'), 'utf8')));
const street = (tsid) => JSON.parse(readFileSync(join(streets, `${tsid}.json`), 'utf8'));
const walk = street(WINTER_WALK_TSID);
const haven = street(WINTER_HAVEN_TSID);
/** One ordinary jump, with margin under the ~110 px the default jump reaches. */
const HOP = 95;

/**
 * game.js winterRouteCandidates: platform midpoints (screen space) at least
 * 24 wide; the surface by x, the haven lowest first, the return leg the
 * rightmost 22% (at least six).
 */
function routeCandidates(s, stage) {
  const rows = s.platforms
    .map((p) => ({ x: (p.x1 + p.x2) / 2 - s.bounds.l, y: (p.y1 + p.y2) / 2 - s.bounds.t, width: Math.abs(p.x2 - p.x1), id: p.id }))
    .filter((r) => r.width >= 24);
  if (stage === 'haven') return rows.sort((a, b) => b.y - a.y || a.x - b.x);
  const surface = rows.sort((a, b) => a.x - b.x || b.y - a.y);
  if (stage === 'return') return surface.slice(-Math.max(6, Math.ceil(surface.length * 0.22)));
  return surface;
}

describe('Winter Walk and Winter Haven: street JSON', () => {
  it('are written, indexed and current (tools/build-rebuilt-rooms.mjs --check), and the route runs on them', () => {
    execFileSync(process.execPath, [join(spike, 'tools/build-rebuilt-rooms.mjs'), '--check'], { stdio: 'pipe' });
    assert.equal(WINTER_WALK_STREET_ID, WINTER_WALK_TSID);
    assert.equal(WINTER_HAVEN_STREET_ID, WINTER_HAVEN_TSID);
    for (const [s, label] of [[walk, 'Winter Walk'], [haven, 'Winter Haven']]) {
      assertStreetGeometry(s);
      assert.match(s.source, /^reconstruction/);
      assert.equal(s.reconstructed, true);
      assert.equal(s.label, label);
      assert.equal(s.ownLight, true, 'instances had no world tint');
      assert.deepEqual([s.doors.length, s.signposts.length], [0, 0], 'entered only by the route');
      const row = index[s.tsid];
      assert.deepEqual([row.label, row.hubId, row.hubName, row.reconstructed, row.platforms], [label, WINTER_HUB.hubId, WINTER_HUB.hubName, true, s.platforms.length]);
      assert.equal(s.stats.decoCount, s.layers.reduce((n, l) => n + l.decos.length, 0));
    }
  });

  it('draw only CC0 decos already shipped', () => {
    for (const s of [walk, haven]) {
      for (const layer of s.layers) {
        for (const d of layer.decos) {
          assert.ok(manifest.has(d.sprite), `${s.label}: ${d.sprite} in the deco manifest`);
          assert.ok(existsSync(join(pub, 'assets/decos/groddle', `${d.sprite}.webp`)), `${s.label}: ${d.sprite}`);
        }
      }
    }
  });

  it('keep the middleground unfiltered (its matrix also colours the avatar)', () => {
    for (const s of [walk, haven]) assert.equal(s.layers.find((l) => l.id === 'middleground').filters, undefined, s.label);
  });

  it('the source names the templates in hub 61 and the walk\'s start point', { skip: !existsSync(gsjs) && 'GSJS checkout not beside this worktree' }, () => {
    const maps = readFileSync(join(gsjs, 'inc_data_maps_prod.js'), 'utf8');
    for (const [tsid, name] of [[WINTER_WALK_SOURCE_TSID, 'Winter Walk'], [WINTER_HAVEN_SOURCE_TSID, 'Winter Haven'], [WINTER_REPEAT_SOURCE_TSIDS.walk, 'Winter Walk'], [WINTER_REPEAT_SOURCE_TSIDS.haven, 'Winter Haven']]) {
      assert.match(maps, new RegExp(`"${tsid}"\\t: "${name}"`));
    }
    const quest = readFileSync(join(gsjs, 'quests/winter_walk.js'), 'utf8');
    assert.match(quest, /"prod_tsid"\t: "LIFH2AKJ5I735SV"/);
    assert.match(quest, /"prod_tsid"\t: "LIFNNTRK1073PQ6"/);
    assert.match(quest, new RegExp(`questInstanceLocation\\(pc, 'level_quest_winter_walk', ${WINTER_WALK_START.x}, ${WINTER_WALK_START.y}, 5\\*60\\)`));
  });

  it('the Drifa streets they stood in on are ordinary streets again; the rebuilt pair is the route\'s own', () => {
    assert.equal(streetOwner('GHF8LE0Q0UC3QEF'), null);
    assert.equal(streetOwner('GHFA15VS0UC3ITS'), null);
    assert.equal(OWNED_STREETS[WINTER_WALK_TSID], 'winter-walk');
    assert.equal(OWNED_STREETS[WINTER_HAVEN_TSID], 'winter-walk');
  });

  it('spawn nothing (the route clears them; no fallback piggies, vendor or shrine)', () => {
    for (const s of [walk, haven]) {
      assert.ok(isWinterStreetTsid(s.tsid));
      const eco = rebuiltRoomsFeature.ecologyOverride(s);
      assert.deepEqual([eco.counts, eco.quoins, eco.reconstructed], [{}, 0, true]);
    }
    assert.equal(winterStreetEcology('GHF8LE0Q0UC3QEF'), null);
  });
});

describe('Winter Walk after the snaps', () => {
  const floor = walk.platforms.filter((p) => p.id.startsWith('plat_ww_floor'));

  it('is the standard -3000..3000 with one floor at the source start height, end to end', () => {
    assert.deepEqual(walk.bounds, { l: -3000, r: 3000, t: -1000, b: 0 });
    assert.ok(floor.every((p) => p.y1 === WINTER_WALK_START.y && p.y2 === WINTER_WALK_START.y));
    const xs = floor.map((p) => [p.x1, p.x2]).sort((a, b) => a[0] - b[0]);
    assert.equal(xs[0][0], walk.bounds.l);
    assert.equal(xs.at(-1)[1], walk.bounds.r);
    for (let i = 1; i < xs.length; i += 1) assert.equal(xs[i][0], xs[i - 1][1], 'no gaps');
  });

  it('starts where winter_walk.js drops you, beside the campfire with the teepee just past it (8417912672)', () => {
    const [first] = routeCandidates(walk, 'surface');
    assert.equal(first.x + walk.bounds.l, WINTER_WALK_START.x);
    assert.equal(first.y + walk.bounds.t, WINTER_WALK_START.y);
    const mid = walk.layers.find((l) => l.id === 'middleground').decos;
    const fire = mid.find((d) => d.id === 'campfire');
    const tent = mid.find((d) => d.id === 'teepee');
    assert.deepEqual([fire.sprite, tent.sprite], ['juju_grandma_campfire_01a_al1', 'juju_grandma_tent_01a_al1']);
    assert.ok(fire.x > WINTER_WALK_START.x && fire.x - WINTER_WALK_START.x < 200 && tent.x > fire.x);
    assert.equal(fire.x, WINTER_WALK_CAMP.fire);
  });

  it('has the snow pillars of 8417912992, each one hop up, and the return leg begins on the floor', () => {
    for (const p of WINTER_WALK_PILLARS) {
      const plat = walk.platforms.find((q) => q.y1 === p.top && q.x1 < p.x && q.x2 > p.x);
      assert.ok(plat, `pillar at ${p.x}`);
    }
    assert.ok(WINTER_WALK_PILLARS.some((p) => p.top === WINTER_WALK_START.y - HOP));
    for (let i = 1; i < WINTER_WALK_PILLARS.length; i += 1) assert.ok(Math.abs(WINTER_WALK_PILLARS[i].top - WINTER_WALK_PILLARS[i - 1].top) <= HOP);
    const ret = routeCandidates(walk, 'return');
    assert.equal(ret[0].y + walk.bounds.t, WINTER_WALK_START.y, `the homeward leg starts on the floor, not on ${ret[0].id}`);
    // The passage out and the way home are at the right end.
    assert.equal(routeCandidates(walk, 'surface').at(-1).x + walk.bounds.l, 2875);
  });
});

describe('Winter Haven after the snaps', () => {
  const plats = haven.platforms;
  const top = (id) => plats.find((p) => p.id === id);

  it('you arrive low, on the rubble under the boardwalk, at the left', () => {
    const [first] = routeCandidates(haven, 'haven');
    assert.equal(first.y + haven.bounds.t, WINTER_HAVEN_GROUND_Y);
    assert.ok(first.x + haven.bounds.l < WINTER_HAVEN_STEP.x1);
  });

  it('every step up is one ordinary hop: rubble, step, boardwalk, pillars, landing', () => {
    const chain = [
      { y: WINTER_HAVEN_GROUND_Y, x1: -1300, x2: WINTER_HAVEN_STEP.x1 },
      WINTER_HAVEN_STEP,
      { y: WINTER_HAVEN_BOARDWALK_Y, x1: -900, x2: -760 },
    ];
    for (let i = 1; i < chain.length; i += 1) assert.ok(chain[i - 1].y - chain[i].y <= HOP, `rise ${chain[i - 1].y - chain[i].y}`);
    for (const run of [WINTER_HAVEN_PILLARS.slice(0, 3), WINTER_HAVEN_PILLARS.slice(3)]) {
      assert.equal(WINTER_HAVEN_BOARDWALK_Y - run[0].top, HOP);
      for (let i = 1; i < run.length; i += 1) {
        const [a, b] = [top(`plat_wh_pillar_${WINTER_HAVEN_PILLARS.indexOf(run[i - 1]) + 1}`), top(`plat_wh_pillar_${WINTER_HAVEN_PILLARS.indexOf(run[i]) + 1}`)];
        assert.ok(a.y1 - b.y1 <= HOP, `rise ${a.y1 - b.y1}`);
        assert.ok(b.x1 - a.x2 <= JUMP_GAP && b.x1 - a.x2 > 0, `gap ${b.x1 - a.x2}`);
      }
    }
    const last = top(`plat_wh_pillar_${WINTER_HAVEN_PILLARS.length}`);
    const land = top('plat_wh_landing');
    assert.ok(last.y1 - land.y1 <= HOP && land.x1 - last.x2 <= JUMP_GAP);
  });

  it('short, tall, short (8416817115), the fire between the runs (8416817377), rising tops after (8416817629)', () => {
    const [a, b, c, ...rest] = WINTER_HAVEN_PILLARS;
    assert.ok(b.top < a.top && b.top < c.top && a.top === c.top);
    assert.ok(WINTER_HAVEN_FIRE_X > c.x && WINTER_HAVEN_FIRE_X < rest[0].x);
    for (let i = 1; i < rest.length; i += 1) assert.ok(rest[i].top < rest[i - 1].top);
    const pillars = haven.layers.find((l) => l.id === 'T_wh_pillars').decos;
    assert.equal(pillars.filter((d) => d.sprite === 'icicle_1b_al1').length, WINTER_HAVEN_PILLARS.length);
    assert.ok(pillars.some((d) => d.id === 'haven_fire'));
  });

  it('the EXIT ladder\'s landing is the highest platform (the route puts the exit there), and a ladder climbs to it from the boardwalk', () => {
    const route = routeCandidates(haven, 'haven');
    assert.equal(route.at(-1).id, 'plat_wh_landing');
    assert.equal(top('plat_wh_landing').y1, WINTER_HAVEN_LANDING.y);
    const [ladder] = haven.ladders;
    assert.deepEqual(ladder, { ...WINTER_HAVEN_LADDER });
    assert.equal(ladder.y, WINTER_HAVEN_BOARDWALK_Y);
    assert.equal(ladder.y - ladder.h, WINTER_HAVEN_LANDING.y);
    assert.ok(ladder.x > WINTER_HAVEN_LANDING.x1 && ladder.x < WINTER_HAVEN_LANDING.x2);
  });
});

describe('copy', () => {
  it('player-facing strings have no em-dashes', () => {
    for (const s of [walk, haven]) {
      assert.doesNotMatch(s.label, /—/);
      assert.doesNotMatch(JSON.stringify(s.why), /—/);
    }
    assert.doesNotMatch(readFileSync(join(pub, 'js/winter-walk-streets.js'), 'utf8'), /—/);
  });
});
