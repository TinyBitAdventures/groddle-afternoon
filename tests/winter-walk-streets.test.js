/**
 * Winter Walk and Winter Haven rebuilt from players' pictures
 * (js/winter-walk-streets.js, written by tools/build-rebuilt-rooms.mjs; the
 * timed route in js/winter-walk.js and game.js runs on them). Cleops' and
 * URvonb's snaps (research/flickr-2026-10-27, reference only) guide the
 * layout; every deco is CC0 art already shipped, Tiny Speck's or made for Groddle
 * (G912: the walk's tree arch and curling plants, tools/provenance/made-decos.json).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry } from '../public/js/street-model.js?v=a9a05f9d';
import { OWNED_STREETS, streetOwner } from '../public/js/location-events.js?v=48938c8f';
import { JUMP_GAP } from '../public/js/quest-rooms/puzzle-kit.js?v=e4bcec06';
import { WINTER_HAVEN_STREET_ID, WINTER_WALK_STREET_ID } from '../public/js/winter-walk.js?v=faad1d46';
import {
  WINTER_HAVEN_BOARDWALK_Y,
  WINTER_HAVEN_FIRE_X,
  WINTER_HAVEN_GROUND_Y,
  WINTER_HAVEN_LADDER,
  WINTER_HAVEN_LANDING,
  WINTER_HAVEN_PILLARS,
  WINTER_HAVEN_TREES,
  WINTER_HAVEN_SOURCE_TSID,
  WINTER_HAVEN_STEP,
  WINTER_HAVEN_TSID,
  WINTER_HUB,
  WINTER_REPEAT_SOURCE_TSIDS,
  WINTER_WALK_ARCH,
  WINTER_WALK_CAMP,
  WINTER_WALK_CAPTION,
  WINTER_WALK_CURLS,
  WINTER_WALK_CURL_SPLAYS,
  WINTER_WALK_ICICLES,
  WINTER_WALK_OVERHANG,
  WINTER_WALK_PASSAGE,
  WINTER_WALK_PILLARS,
  WINTER_WALK_SOURCE_TSID,
  WINTER_WALK_START,
  WINTER_WALK_TSID,
  isWinterStreetTsid,
  winterStreetEcology,
} from '../public/js/winter-walk-streets.js?v=c921bf92';
import { rebuiltRoomsFeature } from '../public/js/features/rebuilt-rooms-feature.js?v=b7c2982d';
import { reachStreet } from '../public/js/builder/reach-graph.js?v=687006d3';
import { GRAVITY, JUMP_SPEED, WALK_MAX } from '../public/js/avatar-step.js?v=8415ee96';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(spike, 'public');
const streets = join(pub, 'assets/streets');
const gsjs = join(spike, '../glitch-GameServerJS');
const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8')).streets;
const manifest = new Set(JSON.parse(readFileSync(join(pub, 'assets/decos/manifest.json'), 'utf8')));
const madeDecos = JSON.parse(readFileSync(join(spike, 'tools/provenance/made-decos.json'), 'utf8')).art;
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

  it('draw only CC0 decos already shipped (Tiny Speck\'s, or made for this street with its provenance)', () => {
    for (const s of [walk, haven]) {
      for (const layer of s.layers) {
        for (const d of layer.decos) {
          const made = madeDecos[d.sprite];
          assert.ok(manifest.has(d.sprite) || made?.streets.includes(s.tsid), `${s.label}: ${d.sprite} in the deco manifest or made for it`);
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

describe('Winter Walk, round 5 (the Tribute Blog and the 147 Snaps)', () => {
  const layer = (id) => walk.layers.find((l) => l.id === id);
  const mid = layer('middleground').decos;

  it('G912: the made tree arch stands round the caption, the caption between its trunks (Snaps 82043, 81189)', () => {
    const sprites = new Set(walk.layers.flatMap((l) => l.decos.map((d) => d.sprite)));
    // No CC0 stand-ins (Austin 2026-10-31), and the bare tree that stood in its place is gone from there.
    for (const name of ['corey3_tree_redBare_n2', 'ground_cutaway_hollow3', 'plant_fern_1', 'plant_fern_4', 'plant_giant_fern_1']) assert.ok(!sprites.has(name), name);
    const arch = mid.filter((d) => d.sprite === 'gz_ai_ww_tree_arch');
    assert.equal(arch.length, 1);
    const [a] = arch;
    assert.deepEqual([a.w, a.h, a.x], [WINTER_WALK_ARCH.w, WINTER_WALK_ARCH.h, WINTER_WALK_ARCH.x]);
    assert.ok(a.y >= WINTER_WALK_START.y && a.y - WINTER_WALK_START.y <= 16, 'its roots on the floor');
    assert.ok(!mid.some((d) => d.sprite === 'heights_tree_bare_4' && Math.abs(d.x - a.x) < a.w / 2), 'no bare tree inside the arch');
    // The caption sits midway between the trunks, inside the opening and under the crossing branches.
    const [l, r] = WINTER_WALK_ARCH.trunks.map((f) => a.x - a.w / 2 + f * a.w);
    assert.ok(Math.abs((l + r) / 2 - WINTER_WALK_CAPTION.x) <= 4, 'centred between the trunks');
    assert.ok(WINTER_WALK_CAPTION.y > a.y - a.h && WINTER_WALK_CAPTION.y < a.y - 100);
    // Nothing else grows under the caption between the trunks but the low plants (82043, 81189: open snow).
    for (const d of mid.filter((q) => q.x > l + 40 && q.x < r - 40 && q.z > a.z)) assert.match(d.sprite, /^gz_ai_ww_curl_/, `${d.sprite} at ${d.x}`);
    assert.match(walk.why.made, /made for Groddle/);
    assert.doesNotMatch(walk.why.notBuilt, /arch|curling|no CC0 piece/);
  });

  it('G912: the curling plants grow as splayed clusters of two or three copies, mirrored, 70-100%, roots together', () => {
    const curls = mid.filter((d) => /^gz_ai_ww_curl_/.test(d.sprite));
    assert.equal(curls.length, WINTER_WALK_CURLS.reduce((n, c) => n + WINTER_WALK_CURL_SPLAYS[c.splay].length, 0));
    for (const [i, c] of WINTER_WALK_CURLS.entries()) {
      const copies = curls.filter((d) => d.id.startsWith(`walk_curl_${i + 1}_`));
      assert.ok(copies.length >= 2 && copies.length <= 3, `plant ${i + 1}`);
      assert.ok(copies.every((d) => d.sprite === `gz_ai_ww_curl_${c.kind}`));
      assert.ok(copies.some((d) => d.flip) && copies.some((d) => !d.flip), `plant ${i + 1}: one copy mirrored`);
      const hs = copies.map((d) => d.h);
      assert.ok(Math.min(...hs) / Math.max(...hs) >= 0.69, `plant ${i + 1}: 70-100%`);
      assert.ok(Math.max(...copies.map((d) => d.x)) - Math.min(...copies.map((d) => d.x)) < Math.max(...copies.map((d) => d.w)), `plant ${i + 1}: roots together`);
      // They stand on the floor, behind the front ground plane (its top is 26 under the feet).
      assert.ok(copies.every((d) => d.y >= WINTER_WALK_START.y && d.y < WINTER_WALK_START.y + 26));
      // Clear of the icicles' fall and the pillars.
      for (const ic of WINTER_WALK_ICICLES) assert.ok(Math.abs(c.x - ic.x) > 80, `plant ${i + 1} clear of the icicle at ${ic.x}`);
      for (const p of WINTER_WALK_PILLARS) assert.ok(Math.abs(c.x - p.x) > p.w, `plant ${i + 1} clear of the pillar at ${p.x}`);
    }
    // Where the Snaps show them: the tall ones left of the arch and at its right trunk, a low one in front of it.
    const archL = WINTER_WALK_ARCH.x - WINTER_WALK_ARCH.w / 2;
    const archR = WINTER_WALK_ARCH.x + WINTER_WALK_ARCH.w / 2;
    assert.ok(WINTER_WALK_CURLS.some((c) => c.kind === 'tall' && c.x < archL + 40 && c.x > archL - 120));
    assert.ok(WINTER_WALK_CURLS.some((c) => c.kind === 'tall' && c.x > WINTER_WALK_ARCH.x && c.x < archR));
    assert.ok(WINTER_WALK_CURLS.some((c) => c.kind === 'low' && c.x > archL && c.x < archR));
  });

  it('big icicles hang from the streaked overhang, over head height and clear of the pillar tops', () => {
    const icicles = mid.filter((d) => d.sprite === 'icicle_1a_al1');
    assert.equal(icicles.length, WINTER_WALK_ICICLES.length);
    assert.equal(mid.filter((d) => d.sprite === 'snow_cliffface_mask_01a_al1').length, WINTER_WALK_OVERHANG.length);
    for (const d of icicles) {
      const top = d.y - d.h;
      assert.ok(top < -450 + 30, 'the cap tucks under the overhang');
      assert.ok(WINTER_WALK_START.y - d.y >= 100, `the point at ${d.y} stays over a standing head`);
      for (const p of walk.platforms.filter((q) => q.id.startsWith('plat_ww_pillar'))) {
        assert.ok(d.x + d.w / 2 < p.x1 || d.x - d.w / 2 > p.x2, `${d.id} clear of ${p.id}`);
      }
    }
  });

  it('the far end is a blizzard bank: soft white behind and in front, three pillars short, middle, tall', () => {
    for (const id of ['T_ww_fog', 'T_ww_fog_front']) assert.ok(layer(id).decos.length && layer(id).decos.every((d) => d.sprite === 'freeze_single_v1_al1'), id);
    assert.ok(layer('T_ww_fog_front').z > 0, 'the near edge draws in front');
    const far = WINTER_WALK_PILLARS.filter((p) => p.x > 2000);
    assert.equal(far.length, 3);
    assert.ok(far[0].top > far[1].top && far[1].top > far[2].top);
    // The homeward leg starts on the floor and its three motes (1,098, 600, 720) land on them (82003).
    const ret = routeCandidates(walk, 'return');
    const picks = [0, 1, 2].map((i) => ret[Math.round((0.12 + 0.72 * (i / 2)) * (ret.length - 1))]);
    assert.deepEqual(picks.map((r) => r.id), ['plat_ww_pillar_4', 'plat_ww_pillar_5', 'plat_ww_pillar_6']);
  });

  it('every pillar is reached on the remake jump from the floor, and nothing strands you (reach graph)', () => {
    for (const [l, r] of [[1000, 1900], [2050, 3000]]) {
      const sub = {
        ...walk,
        bounds: { ...walk.bounds, l, r },
        layers: [],
        platforms: walk.platforms.filter((p) => p.x2 > l && p.x1 < r).map((p) => ({ ...p, x1: Math.max(l, p.x1), x2: Math.min(r, p.x2) })),
      };
      const res = reachStreet(sub, [{ x: l + 60, y: WINTER_WALK_START.y - 4, from: 'left' }, { x: r - 60, y: WINTER_WALK_START.y - 4, from: 'right' }]);
      assert.ok(res.arrivals.every((a) => a.stands));
      assert.deepEqual(res.unreached, [], `${l}..${r}`);
      assert.deepEqual(res.traps, []);
      for (const p of sub.platforms.filter((q) => q.id.startsWith('plat_ww_pillar'))) {
        assert.ok(res.surfaces.filter((x) => x.line === p.id).every((x) => x.reached), p.id);
      }
    }
  });
});

describe('G1161: snow-mottled tan ground to the bottom of the view (Snaps PHV90CU6KG22L76_83293, Flickr 8273330942, 8264519059)', () => {
  const layer = (id) => walk.layers.find((l) => l.id === id);
  const toWorld = (d) => ({ sprite: d.sprite, x: d.x + walk.bounds.l, y: d.y + walk.bounds.t, w: d.w, h: d.h });
  const snow = layer('T_ww_front').decos.filter((d) => /^(whitesnow_|snow_patch_)/.test(d.sprite)).map(toWorld);

  it('lays rows of snow patches in front of the feet, end to end and on past the street bottom', () => {
    assert.ok(snow.length >= 60, `${snow.length} patches`);
    const feet = WINTER_WALK_START.y;
    // In front of the walk line only: no patch reaches up over the feet (the layer draws in front of the avatar).
    for (const d of snow) assert.ok(d.y - d.h >= feet + 4, `patch at ${d.x},${d.y} over the feet`);
    const rows = new Set(snow.map((d) => Math.round((d.y - feet) / 30)));
    assert.ok(rows.size >= 5, 'several depths');
    assert.ok(Math.max(...snow.map((d) => d.y)) > walk.bounds.b + 150, 'runs on below the street');
    const xs = snow.map((d) => d.x).sort((a, b) => a - b);
    assert.ok(xs[0] < walk.bounds.l + 300 && xs.at(-1) > walk.bounds.r - 300);
    for (const d of snow) assert.ok(manifest.has(d.sprite) || existsSync(join(pub, 'assets/decos/groddle', `${d.sprite}.webp`)));
  });

  it('tints both ground layers a warm tan (red over green), not grey-brown', () => {
    for (const id of ['T_ww_ground', 'T_ww_front_ground']) {
      const c = layer(id).filters.tintColor;
      const [r, g, b] = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
      assert.ok(r - g >= 25 && g > b, `${id} tint ${c.toString(16)}`);
    }
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

  it('#216: the feet stand on floor art, a ground layer behind them as the walk has', () => {
    // Deco x is the centre, y the bottom, both layer-local (world minus the street's left and top).
    const floorBehind = (s, layerId, feetY) => {
      const at = s.layers.findIndex((l) => l.id === layerId);
      const layer = s.layers[at];
      assert.ok(layer, `${s.label}: ${layerId}`);
      assert.ok(layer.z < 0 && at < s.layers.findIndex((l) => l.id === 'middleground'), `${s.label}: behind the walk line`);
      assert.equal(layer.w, s.bounds.r - s.bounds.l, `${s.label}: street-wide, no parallax`);
      const feet = feetY - s.bounds.t;
      // The plane is rows of its strip at the strip's own aspect (dirtPlane), overlapping.
      for (let x = 0; x <= s.bounds.r - s.bounds.l; x += 25) {
        const ds = layer.decos.filter((o) => Math.abs(o.x - x) <= o.w / 2).sort((a, b) => b.y - a.y);
        assert.ok(ds.length, `${s.label}: floor behind x ${x + s.bounds.l}`);
        for (let i = 1; i < ds.length; i += 1) assert.ok(ds[i].y >= ds[i - 1].y - ds[i - 1].h, `${s.label}: rows overlap at ${x + s.bounds.l}`);
        assert.ok(Math.min(...ds.map((d) => d.y - d.h)) <= feet - 100, `${s.label}: its top at least 100 px above the feet at ${x + s.bounds.l}`);
        assert.ok(Math.max(...ds.map((d) => d.y)) >= feet + 100, `${s.label}: it runs on under the front floor at ${x + s.bounds.l}`);
      }
      return layer;
    };
    floorBehind(walk, 'T_ww_ground', WINTER_WALK_START.y);
    const ground = floorBehind(haven, 'T_wh_ground', WINTER_HAVEN_GROUND_Y);
    // In front of the wall and icicles; the branches, pillars, drums and boards stand on it.
    const order = haven.layers.map((l) => l.id);
    for (const id of ['T_wh_wall', 'T_wh_icicles']) assert.ok(order.indexOf(id) < order.indexOf('T_wh_ground'), id);
    for (const id of ['T_wh_trees', 'T_wh_pillars', 'T_wh_drums', 'T_wh_boards', 'T_wh_drum_tops']) assert.ok(order.indexOf(id) > order.indexOf('T_wh_ground'), id);
    // The front floor's own plane and colour, so the two read as one floor.
    const front = haven.layers.find((l) => l.id === 'T_wh_floor');
    assert.ok(ground.decos.every((d) => d.sprite === 'dirt_platform_long'));
    assert.deepEqual(ground.filters, front.filters);
    const zs = haven.layers.map((l) => l.z);
    assert.equal(new Set(zs).size, zs.length, 'one z a layer');
    assert.deepEqual(zs.filter((z) => z < 0), [...zs.filter((z) => z < 0)].sort((a, b) => a - b), 'behind layers drawn in z order');
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

  it('G922: the snowy trees are the made ones, at the CC0 trees\' heights, with their own widths', () => {
    const trees = haven.layers.find((l) => l.id === 'T_wh_trees').decos;
    assert.deepEqual(trees.map((d) => d.sprite), WINTER_HAVEN_TREES.map((t) => t.sprite));
    assert.ok(!haven.layers.some((l) => l.decos.some((d) => /^heights_tree_bare_/.test(d.sprite))), 'no bare CC0 tree left in the haven');
    // Heights: the CC0 tree's drawn rows at the street's old scale (2: 1287 x 0.75, 3: 1150 x 0.7, 4: 1294 x 0.5).
    const cc0 = { heights_tree_bare_2: [334, 1287, 0.75], heights_tree_bare_3: [362, 1150, 0.7], heights_tree_bare_4: [1136, 1294, 0.5] };
    for (const [d, t] of trees.map((q, i) => [q, WINTER_HAVEN_TREES[i]])) {
      const [cw, ch, s] = cc0[t.replaces];
      assert.ok(Math.abs(d.h - ch * s) <= 1, `${d.sprite} ${d.h} tall`);
      const wider = d.w / d.h / (cw / ch) - 1;
      assert.ok(wider > 0.05 && wider < 0.2, `${d.sprite} ${(wider * 100).toFixed(1)}% wider`);
      const row = madeDecos[d.sprite];
      assert.ok(row.streets.includes(WINTER_HAVEN_TSID) && row.replaces.startsWith(t.replaces), d.sprite);
      assert.ok(Math.abs(row.w / row.h - d.w / d.h) < 0.01, `${d.sprite}: drawn at its own aspect`);
    }
    assert.match(haven.why.made, /made for Groddle/);
    assert.doesNotMatch(haven.why.notBuilt, /snow/i);
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

describe('G962: the passage to Winter Haven floats past the tall pillar (recording 2Xko9Hy-cLE 1:32-1:34)', () => {
  const tall = WINTER_WALK_PILLARS.at(-1);
  const plat = walk.platforms.find((q) => q.id === `plat_ww_pillar_${WINTER_WALK_PILLARS.length}`);
  const edge = plat.x2; // street platforms are in street units, like the pillars
  const TOUCH = 62; // game.js updateWinterWalk: the feet within 62 of the portal point
  /** Closest the feet come to the passage on a run-and-jump (or a walk off) from x, y. */
  const closest = (x, y, vy) => {
    let best = Infinity;
    for (let f = 0; f < 140; f += 1) {
      x += WALK_MAX;
      vy += GRAVITY;
      y += vy;
      best = Math.min(best, Math.hypot(x - WINTER_WALK_PASSAGE.x, y - WINTER_WALK_PASSAGE.y));
    }
    return best;
  };

  it('hangs in the air just right of the tall pillar, a little over its top', () => {
    assert.equal(tall.top, -366);
    assert.ok(WINTER_WALK_PASSAGE.x > edge && WINTER_WALK_PASSAGE.x - edge < 80, `${WINTER_WALK_PASSAGE.x} vs edge ${edge}`);
    const over = tall.top - WINTER_WALK_PASSAGE.y;
    assert.ok(over > 0 && over < 60, `foot ${over} over the pillar top`);
    // Nothing to stand on under it but the floor far below.
    for (const q of walk.platforms) {
      if (q.x1 <= WINTER_WALK_PASSAGE.x && q.x2 >= WINTER_WALK_PASSAGE.x) assert.ok(q.y1 - WINTER_WALK_PASSAGE.y > 250, q.id);
    }
  });

  it('one jump from the tall pillar reaches it, a jump from the floor does not', () => {
    assert.ok(closest(edge - 20, tall.top, JUMP_SPEED) < TOUCH, 'run and jump off the pillar');
    assert.ok(closest(edge, tall.top, 0) < TOUCH, 'or step off the pillar into it');
    const apex = WINTER_WALK_START.y - (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);
    assert.ok(apex - WINTER_WALK_PASSAGE.y > TOUCH + 60, 'out of reach from the floor');
  });
});
