/**
 * Winter Walk and Winter Haven (quests/winter_walk.js, winter_walk_part2.js),
 * rebuilt from players' pictures. Pure data and street builders (no Pixi, no
 * DOM); tools/build-rebuilt-rooms.mjs writes the street JSON and the index
 * rows, js/winter-walk.js names the two streets the timed route runs on, and
 * features/rebuilt-rooms-feature.js keeps them empty.
 *
 * Source
 * - winter_walk.js:24-33 names the two templates, level_quest_winter_walk
 *   LIFH2AKJ5I735SV and level_quest_winter_haven LIFNNTRK1073PQ6;
 *   winter_walk_part2.js:20-29 the repeat's own copies, LIFNBTGUQJ739MC and
 *   LIFNEN3QHC73UO9 (the remake runs the repeat on the same two streets).
 *   inc_data_maps_prod.js:17934-17937 lists all four in hub 61 (Simple Level
 *   Quests), with two "Winter Walk with Door" copies (:17945-17946).
 * - onStarted (winter_walk.js:105, winter_walk_part2.js:85) drops you in the
 *   walk at -2875,-81: the far left end of a street at least 6000 wide (the
 *   standard -3000..3000), on a floor 81 px above its bottom.
 * - No geometry survives: none of the six TSIDs is in tinyspeck's
 *   glitch-locations, and the callback that ends the walk
 *   (callback_winter_walk_part1_finish) was fired by the lost template.
 *
 * Pictures (reference only, all rights reserved; nothing of them ships)
 * - Winter Walk: Cleops (Sloth Knocker), Flickr 8417912672 "Kumbaya, so cold"
 *   and 8417912992 "Wintry Walk quest revisit" (2013-01-26); URvonb's snap
 *   111722-054d9a5777 (Flickr 8264519059, 2012-10-14); reelasitgets, Flickr
 *   8273330942 (2012-12-14). A flat snowy wood under a pale blue sky: rows of
 *   snowy firs and white hills behind, tall bare dead trees, snow-covered
 *   bushes, dry grass, a pale tan floor patched with snow, and at the left
 *   end a hide teepee with a campfire. Further on, a grey basalt overhang at
 *   the top, a big bare tree, snowy basalt mountains behind, and white
 *   snow-capped pillars standing in the snow.
 * - Winter Haven: Cleops, Flickr 8416817115, 8416817377, 8416817629 and
 *   8417913246 (2013-01-26). A wall of grey-mauve basalt columns with icicles
 *   hanging from the top and dark cave corners, a plank boardwalk on wooden
 *   trestles over snowy rubble, white snow-capped pillars of three heights
 *   standing on clusters of dark drums, a fire burning out of one cluster,
 *   bare snowy branches at the sides, and at the right a wooden ladder up to
 *   a snowy landing with the EXIT sign.
 *
 * Art: Tiny Speck's CC0 decos already in assets/decos/groddle. The teepee and
 * campfire are the Juju camp's own (juju_grandma_tent_01a_al1,
 * juju_grandma_campfire_01a_al1), the pillars are Alakol's icicle_1b_al1
 * standing on end as the pictures show them (snow cap up, taper down), the
 * hanging icicles icicle_1a_al1, the basalt the Alakol cliff faces
 * (cliff_face_mountaineering_*, cliffside_*, snow_cliffface_*), the firs
 * snow_pinecluster_01a_al1, the dead trees heights_tree_bare_* and
 * tree_bare_*, the drums ground_rootpipe2 darkened, the boardwalk
 * wood_platform on wood_cover_middleplus posts, the ladder
 * ladder_interior_4steps. Left out (no CC0 art in the shipped set): the big
 * hollow two-trunk tree and the pale green curling plants of the walk (bare
 * trees and dry grass stand there), and the snow on the haven's branches.
 * The walk's caption line (WINTER_WALK_CAPTION) is placed in the walk as the
 * pictures show it (G352, Austin 2026-10-28: one-off approval); Being Watched
 * places its own (js/quest-rooms/being-watched.js CAPTION).
 */

export const WINTER_STREETS_SOURCE = 'research/flickr-2026-10-27 (reference only)';

/** hub 61 Simple Level Quests (inc_data_maps_prod.js:242-245), a dev label: the game shows "Quest". */
export const WINTER_HUB = Object.freeze({ hubId: '61', hubName: 'Simple Level Quests' });

export const WINTER_WALK_TSID = 'GIFH2AKJ5I735SV';
export const WINTER_WALK_SOURCE_TSID = 'LIFH2AKJ5I735SV';
export const WINTER_WALK_LABEL = 'Winter Walk';
export const WINTER_HAVEN_TSID = 'GIFNNTRK1073PQ6';
export const WINTER_HAVEN_SOURCE_TSID = 'LIFNNTRK1073PQ6';
export const WINTER_HAVEN_LABEL = 'Winter Haven';
/** winter_walk_part2's copies of the two templates; the repeat runs on the same streets. */
export const WINTER_REPEAT_SOURCE_TSIDS = Object.freeze({ walk: 'LIFNBTGUQJ739MC', haven: 'LIFNEN3QHC73UO9' });

/** winter_walk.js:105 questInstanceLocation(pc, 'level_quest_winter_walk', -2875, -81, 5*60). */
export const WINTER_WALK_START = Object.freeze({ x: -2875, y: -81 });

const deco = (sprite, x, y, w, h, z, extra = {}) => ({ sprite, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), z, r: 0, ...extra });
const countDecos = (layers) => layers.reduce((n, l) => n + (l.decos?.length || 0), 0);

/** A deterministic 0..1 from an integer (the builder's --check must be stable). */
const rnd = (n) => {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h % 10000) / 10000;
};

const sameTsid = (a, b) => String(a || '').slice(1) === String(b || '').slice(1) && String(a || '').length > 1;
export const isWinterWalkTsid = (tsid) => sameTsid(tsid, WINTER_WALK_TSID);
export const isWinterHavenTsid = (tsid) => sameTsid(tsid, WINTER_HAVEN_TSID);
export const isWinterStreetTsid = (tsid) => isWinterWalkTsid(tsid) || isWinterHavenTsid(tsid);

/** The pillar art: Alakol's icicle_1b_al1 on end (its snow cap is the pillar's top). */
const PILLAR_SPRITE = 'icicle_1b_al1';

function shell({ source, tsid, label, bounds, platforms, layers, ladders = [], gradient, why }) {
  return {
    source,
    reconstructed: true,
    tsid,
    label,
    hubId: WINTER_HUB.hubId,
    hubName: WINTER_HUB.hubName,
    swf_file: 'alpine_landscape.swf,groddle1.swf',
    bounds: { ...bounds },
    platforms,
    layers,
    signposts: [],
    doors: [],
    barriers: [],
    stats: {
      platformCount: platforms.length,
      layerCount: layers.length,
      decoCount: countDecos(layers),
      signpostCount: 0,
      doorCount: 0,
      ladderCount: ladders.length,
      barrierCount: 0,
    },
    gradient,
    ladders,
    // Instances had no world tint (the snaps are all in daylight).
    ownLight: true,
    why,
  };
}

function indexRow(street) {
  return {
    label: street.label,
    file: `assets/streets/${street.tsid}.json`,
    hubId: street.hubId,
    hubName: street.hubName,
    platforms: street.platforms.length,
    decos: street.stats.decoCount,
    reconstructed: true,
  };
}

const plat = (id, x1, x2, y) => ({ id, x1, y1: y, x2, y2: y, pc_perm: -1 });

/* ------------------------------------------------------------------ */
/* Winter Walk                                                         */
/* ------------------------------------------------------------------ */

export const WINTER_WALK_BOUNDS = Object.freeze({ l: -3000, r: 3000, t: -1000, b: 0 });
export const WINTER_WALK_FLOOR_Y = WINTER_WALK_START.y;
/**
 * The floor in short runs (the route spreads its motes over platforms, and
 * the first run is centred on the source start, so the walk begins there).
 */
export const WINTER_WALK_FLOOR_BREAKS = Object.freeze([-3000, -2750, -2400, -2050, -1700, -1350, -1000, -650, -300, 50, 400, 750, 1100, 1450, 1800, 2150, 2500, 2750, 3000]);
/**
 * Snow pillars standing in the snow near the cliffs (Flickr 8417912992):
 * centre x, top y, cap width. Left of the last six platforms, so the return
 * leg (js/winter-walk.js: the rightmost 22%, at least six) starts on the floor.
 */
export const WINTER_WALK_PILLARS = Object.freeze([
  Object.freeze({ x: 1250, top: -176, w: 150 }),
  Object.freeze({ x: 1470, top: -271, w: 170 }),
  Object.freeze({ x: 1690, top: -176, w: 150 }),
]);
/** The camp at the left end (Flickr 8417912672: you start beside the fire, the teepee just past it). */
export const WINTER_WALK_CAMP = Object.freeze({ fire: -2760, tent: -2540 });
/**
 * G352: the walk's caption, read off URvonb's snap (Flickr 8264519059, snap 111722-054d9a5777,
 * 2012-10-14) and reelasitgets' (Flickr 8273330942, 2012-12-14), reference only. No GSJS text:
 * it was deco sign text placed in the lost template (the client's Deco sign_txt,
 * DecoRenderer.as 287-311), so it stays put as you walk: both pictures show it at the same spot,
 * dark grey, centred in four lines, just right of the hollow two-trunk tree past the camp,
 * about 140 px above the floor. Here that is right of the two-trunk heights_tree_bare_4 (-1720, its right trunk near -1658)
 * and short of the next tree (-1430), clear of the trunks. World x, y of its centre; drawn by
 * features/rebuilt-rooms-feature.js.
 * Austin 2026-10-28: one-off approval.
 */
export const WINTER_WALK_CAPTION = Object.freeze({
  lines: Object.freeze(['Have you ever heard the', 'ding-a-ling-ling sound', 'icicles make when you', 'tappity-tap them?']),
  x: -1545,
  y: WINTER_WALK_START.y - 150,
  fill: 0x3a3836,
});
export const WINTER_WALK_SOURCE_LINE =
  'reconstruction: Winter Walk (LIFH2AKJ5I735SV, not in tinyspeck/glitch-locations); layout from Cleops\' 2013-01-26 snaps (Flickr 8417912672, 8417912992), URvonb\'s snap (Flickr 8264519059) and reelasitgets\' (Flickr 8273330942), reference only; CC0 Alakol, Heights and Juju camp decos';

const WB = WINTER_WALK_BOUNDS;
const WF = WINTER_WALK_FLOOR_Y;

function walkSkyDecos(w) {
  const out = [];
  for (let i = 0; i < 9; i += 1) {
    const sprite = i % 2 ? 'cloud_fluffy_2' : 'cloud_fluffy_1';
    const [sw, sh] = sprite === 'cloud_fluffy_1' ? [504, 284] : [686, 270];
    const s = 0.9 + rnd(i + 5) * 0.7;
    out.push(deco(sprite, 150 + i * (w / 9) + rnd(i + 1) * 200, 230 + rnd(i + 11) * 240, sw * s, sh * s, i, i % 3 ? {} : { flip: true }));
  }
  return out;
}

/** White hills, and the snowy basalt mountains of the right half (8417912992). */
function walkFarDecos(w, h) {
  const out = [];
  let z = 0;
  for (let x = -200; x < w + 400; x += 1150) {
    const s = 0.45 + rnd(x + 3) * 0.12;
    out.push(deco('k03_background_snowhill_02', x, h - 210, 2798 * s, 1104 * s, z++, (x / 1150) % 2 ? { flip: true } : {}));
  }
  for (let i = 0; i < 6; i += 1) {
    const sprite = i % 2 ? 'snow_cliffface_01b_al1' : 'snow_cliffface_01a_al1';
    const s = 0.62 + rnd(i + 70) * 0.18;
    out.push(deco(sprite, w * 0.56 + i * 420, h - 250 + rnd(i + 80) * 40, 980 * s, 838 * s, z++, i % 2 ? { flip: true } : {}));
  }
  return out;
}

/** Rows of snowy firs on a snow bank. */
function walkFirDecos(w, h) {
  const out = [];
  let z = 0;
  for (let x = -100, i = 0; x < w + 300; x += 230 + rnd(i + 90) * 150, i += 1) {
    // Fewer firs where the basalt mountains stand (the right half, 8417912992).
    if (x > w * 0.62 && i % 3) continue;
    const s = 0.3 + rnd(i + 31) * 0.16;
    out.push(deco('snow_pinecluster_01a_al1', x, h - 200 - rnd(i + 51) * 30, 786 * s, 422 * s, z++, i % 2 ? { flip: true } : {}));
  }
  for (let x = 0, i = 0; x < w + 1700; x += 1650, i += 1) {
    out.push(deco('k03_background_snowhill_03', x, h - 110, 3424 * 0.55, 814 * 0.3, z++, i % 2 ? { flip: true } : {}));
  }
  return out;
}

/** Far bare trees and snowy scrub behind the walk. */
function walkNearDecos(w, h) {
  const out = [];
  let z = 0;
  const trees = [['heights_tree_bare_2', 334, 1288], ['heights_tree_bare_3', 362, 1166], ['tree_bare_thin_1', 550, 1568], ['tree_bare_tall_1', 430, 2016]];
  for (let x = 120, i = 0; x < w; x += 520 + rnd(i + 7) * 520, i += 1) {
    const [sprite, sw, sh] = trees[i % trees.length];
    const s = 0.24 + rnd(i + 17) * 0.08;
    out.push(deco(sprite, x, h - 120, sw * s, sh * s, z++, i % 2 ? { flip: true } : {}));
  }
  for (let x = 60, i = 0; x < w; x += 300 + rnd(i + 27) * 250, i += 1) {
    const s = 0.45 + rnd(i + 37) * 0.25;
    out.push(deco(i % 2 ? 'snow_bush_01a_al1' : 'snow_bush_01c_al1', x, h - 112, (i % 2 ? 306 : 248) * s, (i % 2 ? 178 : 78) * s, z++));
  }
  for (let x = 0, i = 0; x < w + 1000; x += 1000, i += 1) out.push(deco('k03_background_snowhill_01', x, h - 85, 1100, 90, z++, i % 2 ? { flip: true } : {}));
  // A snowfield running to the horizon, so no sky shows between the hills and the floor.
  for (let x = 0, i = 0; x < w + 900; x += 760, i += 1) out.push(deco('k03_snowpatch_03', x, h - 30, 900, 210, z++, i % 2 ? { flip: true } : {}));
  return out;
}

/** The pale tan floor plane (its own layer, coloured), in street-local coordinates. */
function walkGroundDecos() {
  const out = [];
  let z = 0;
  const ox = -WB.l;
  const oy = -WB.t;
  for (let x = WB.l - 300; x < WB.r + 600; x += 1100) {
    out.push(deco('dirt_platform_long', x + ox, 60 + oy, 1500, 250, z++, (x / 1100) % 2 ? { flip: true } : {}));
  }
  // Snow lying on the floor (the pictures: big pale patches, scattered splotches).
  for (let x = WB.l + 80, i = 0; x < WB.r; x += 330 + rnd(i + 61) * 260, i += 1) {
    const sprite = ['whitesnow_patch_1e_g1', 'snow_patch_6', 'whitesnow_splotch_1a_g1', 'whitesnow_patch_1c_g1'][i % 4];
    const dims = { whitesnow_patch_1e_g1: [948, 134], snow_patch_6: [1272, 156], whitesnow_splotch_1a_g1: [564, 74], whitesnow_patch_1c_g1: [564, 74] }[sprite];
    const s = 0.45 + rnd(i + 71) * 0.3;
    out.push(deco(sprite, x + ox, WF - 40 - rnd(i + 81) * 50 + oy, dims[0] * s, dims[1] * s, z++, i % 2 ? { flip: true } : {}));
  }
  return out;
}

/** Bare dead trees along the walk (the pictures: tall, dark, spiky). */
export const WINTER_WALK_TREES = Object.freeze([
  ['heights_tree_bare_1', -2985, 0.42, false],
  ['tree_bare_bunch_1', -2330, 0.44, false],
  ['heights_tree_bare_3', -2080, 0.5, true],
  ['heights_tree_bare_4', -1720, 0.42, false],
  ['heights_tree_bare_2', -1430, 0.52, false],
  ['tree_bare_thin_1', -1180, 0.4, true],
  ['heights_tree_bare_1', -860, 0.4, true],
  ['tree_bare_bunch_1', -420, 0.4, true],
  ['heights_tree_bare_3', 60, 0.5, false],
  ['heights_tree_bare_2', 470, 0.5, true],
  ['heights_tree_bare_4', 980, 0.4, true],
  ['tree_bare_thin_1', 1290, 0.42, false],
  ['heights_tree_bare_4', 2330, 0.55, false],
]);

const TREE_DIMS = { heights_tree_bare_1: [752, 2138], heights_tree_bare_2: [334, 1288], heights_tree_bare_3: [362, 1166], heights_tree_bare_4: [1138, 1294], tree_bare_bunch_1: [1398, 1318], tree_bare_thin_1: [550, 1568], tree_bare_tall_1: [430, 2016] };

function walkMiddleDecos() {
  const out = [];
  let z = 10;
  // Trees first (behind everything else on the walk line).
  for (const [sprite, x, s, flip] of WINTER_WALK_TREES) {
    const [sw, sh] = TREE_DIMS[sprite];
    out.push(deco(sprite, x, WF + 12, sw * s, sh * s, z++, flip ? { flip: true } : {}));
  }
  // The camp: the Juju camp's teepee and campfire.
  out.push(deco('juju_grandma_tent_01a_al1', WINTER_WALK_CAMP.tent, WF + 8, 638 * 0.62, 506 * 0.62, z++, { id: 'teepee' }));
  out.push(deco('juju_grandma_campfire_01a_al1', WINTER_WALK_CAMP.fire, WF + 16, 140, 140, z++, { id: 'campfire' }));
  out.push(deco('pampas_2', -2975, WF + 4, 214 * 0.32, 326 * 0.32, z++));
  // Snow-covered bushes and dry grass (the pictures: low white-topped scrub, sprigs).
  const bushes = [-2380, -2230, -1900, -1560, -1290, -980, -700, -520, -150, 240, 650, 820, 1180, 1500, 2240, 2620];
  bushes.forEach((x, i) => {
    const sprite = ['snow_bush_01a_al1', 'snow_bush_01b_al1', 'snow_bush_01c_al1'][i % 3];
    const [sw, sh] = { snow_bush_01a_al1: [306, 178], snow_bush_01b_al1: [222, 168], snow_bush_01c_al1: [248, 78] }[sprite];
    const s = 0.45 + rnd(i + 101) * 0.25;
    out.push(deco(sprite, x, WF - 6, sw * s, sh * s, z++, i % 2 ? { flip: true } : {}));
  });
  for (const [i, x] of [-1800, -1000, -330, 360, 1020, 2460].entries()) out.push(deco('pampas_2', x, WF - 2, 214 * 0.3, 326 * 0.3, z++, i % 2 ? { flip: true } : {}));
  // Snowy rocks here and there.
  for (const [i, x] of [-640, 560, 1380, 2560].entries()) out.push(deco('rock_snowy_1a_al1', x, WF - 4, 386 * 0.32, 282 * 0.32, z++, i % 2 ? { flip: true } : {}));
  // The grey basalt overhang along the top at the cliffs' end (8417912992), hung from the street top.
  for (const [i, x] of [1300, 1760, 2240, 2720].entries()) {
    const sprite = i % 2 ? 'cliffside_1c_al1' : 'cliffside_1a_al1';
    const [sw, sh] = sprite === 'cliffside_1a_al1' ? [1336, 878] : [620, 846];
    const s = 0.55;
    // Rotated half a turn about its foot: it hangs down from y to y + h, its foot at -450.
    out.push(deco(sprite, x, -450 - sh * s, sw * s, sh * s, z++, { r: 180, ...(i % 2 ? { flip: true } : {}) }));
  }
  // Snow pillars: snow cap up, taper down into the snow.
  for (const [i, p] of WINTER_WALK_PILLARS.entries()) {
    out.push(deco(PILLAR_SPRITE, p.x, WF + 6, p.w, WF + 6 - (p.top - 14), 60 + i, { id: `walk_pillar_${i + 1}` }));
    out.push(deco('snow_rubble_01c_al1', p.x, WF + 10, p.w * 1.1, 52, 64 + i));
  }
  return out;
}

/**
 * The floor plane again under the walk line, in front (top 26 px below the
 * feet): the renderer's ground skirt stretches only the middleground's bottom
 * row below the street, so the floor has to run on past the bottom from here.
 */
function walkFrontGroundDecos() {
  const out = [];
  let z = 0;
  const ox = -WB.l;
  const oy = -WB.t;
  for (let x = WB.l - 300, i = 0; x < WB.r + 600; x += 1100, i += 1) {
    out.push(deco('dirt_platform_long', x + ox, 470 + oy, 1500, 530, z++, i % 2 ? { flip: true } : {}));
  }
  return out;
}

/** In front of the walk line: drifts and snowy boulders along the bottom, in street-local coordinates. */
function walkFrontDecos() {
  const out = [];
  let z = 0;
  const ox = -WB.l;
  const oy = -WB.t;
  for (let x = WB.l + 120, i = 0; x < WB.r; x += 420 + rnd(i + 121) * 380, i += 1) {
    const sprite = i % 3 === 2 ? 'snow_drift_01a_al1' : i % 2 ? 'snow_rubble_01d_al1' : 'snow_rubble_01c_al1';
    const [sw, sh] = { snow_drift_01a_al1: [618, 168], snow_rubble_01d_al1: [618, 274], snow_rubble_01c_al1: [386, 218] }[sprite];
    const s = 0.28 + rnd(i + 131) * 0.16;
    out.push(deco(sprite, x + ox, 70 + oy, sw * s, sh * s, z++, i % 2 ? { flip: true } : {}));
  }
  return out;
}

export function winterWalkStreet() {
  const W = WB.r - WB.l;
  const H = WB.b - WB.t;
  const breaks = WINTER_WALK_FLOOR_BREAKS;
  const platforms = [];
  for (let i = 0; i + 1 < breaks.length; i += 1) platforms.push(plat(`plat_ww_floor_${i + 1}`, breaks[i], breaks[i + 1], WF));
  WINTER_WALK_PILLARS.forEach((p, i) => platforms.push(plat(`plat_ww_pillar_${i + 1}`, p.x - Math.round(p.w * 0.42), p.x + Math.round(p.w * 0.42), p.top)));
  const layers = [
    { id: 'T_ww_sky', name: 'sky', z: -6, w: 4400, h: H, decos: walkSkyDecos(4400), filters: { brightness: 18 } },
    { id: 'T_ww_far', name: 'mountains', z: -5, w: 4800, h: H, decos: walkFarDecos(4800, H), filters: { tintColor: 0xc9c6ec, tintAmount: 28, brightness: 14, saturation: -20 } },
    { id: 'T_ww_firs', name: 'firs', z: -4, w: 5300, h: H, decos: walkFirDecos(5300, H), filters: { tintColor: 0xc6c8f0, tintAmount: 18, brightness: 6 } },
    { id: 'T_ww_near', name: 'bg_1', z: -3, w: 5700, h: H, decos: walkNearDecos(5700, H), filters: { saturation: -35, brightness: 22, tintColor: 0xd2d4f2, tintAmount: 20 } },
    { id: 'T_ww_ground', name: 'ground', z: -1, w: W, h: H, decos: walkGroundDecos(), filters: { brightness: 72, saturation: -45, tintColor: 0xead9b6, tintAmount: 45 } },
    { id: 'middleground', name: 'middleground', z: 0, w: W, h: H, decos: walkMiddleDecos() },
    { id: 'T_ww_front_ground', name: 'ground front', z: 1, w: W, h: H, decos: walkFrontGroundDecos(), filters: { brightness: 72, saturation: -45, tintColor: 0xead9b6, tintAmount: 45 } },
    { id: 'T_ww_front', name: 'middleplus', z: 2, w: W, h: H, decos: walkFrontDecos(), filters: { tintColor: 0x9eabd0, tintAmount: 30, brightness: -6 } },
  ];
  return shell({
    source: WINTER_WALK_SOURCE_LINE,
    tsid: WINTER_WALK_TSID,
    label: WINTER_WALK_LABEL,
    bounds: WB,
    platforms,
    layers,
    // The pictures' sky: pale blue over a lavender haze.
    gradient: { top: '8CC2EA', bottom: 'DCE2F6' },
    why: {
      street: 'winter_walk.js:24-33 (LIFH2AKJ5I735SV) and inc_data_maps_prod.js:17936 (hub 61); no location XML.',
      bounds: 'onStarted drops you at -2875,-81 (winter_walk.js:105), so the walk is the standard -3000..3000 with its floor at -81.',
      layout: 'Left to right: the camp (campfire, teepee) where you start, a wood of bare dead trees and snowy scrub, an open snowfield, then the cliffs\' end with a basalt overhang, a big bare tree and three snow pillars; firs, white hills and snowy basalt mountains behind.',
      route: 'js/winter-walk.js runs the timed route: motes spread over the platforms, the passage to Winter Haven at the right end, and the way home at the same end on the return.',
      notBuilt: 'The hollow two-trunk tree and the curling green plants have no CC0 art in the shipped set.',
      caption: 'The pictures\' caption line is drawn at the same spot by features/rebuilt-rooms-feature.js (WINTER_WALK_CAPTION; Austin 2026-10-28: one-off approval).',
    },
  });
}

/* ------------------------------------------------------------------ */
/* Winter Haven                                                        */
/* ------------------------------------------------------------------ */

export const WINTER_HAVEN_BOUNDS = Object.freeze({ l: -1300, r: 1300, t: -1300, b: 0 });
/** The snowy rubble under the boardwalk, where you arrive. */
export const WINTER_HAVEN_GROUND_Y = -70;
export const WINTER_HAVEN_GROUND_BREAKS = Object.freeze([-1300, -1000, -650, -300, 50, 400, 750, 1050, 1300]);
/** A rubble step up to the boardwalk at its left end. */
export const WINTER_HAVEN_STEP = Object.freeze({ x1: -980, x2: -840, y: -160 });
export const WINTER_HAVEN_BOARDWALK_Y = -250;
export const WINTER_HAVEN_BOARDWALK_BREAKS = Object.freeze([-900, -500, -100, 300, 700, 1100, 1300]);
/** Drum clusters stand this tall on the boardwalk (8417913246). */
export const WINTER_HAVEN_DRUM_H = 34;
/**
 * The snow pillars on their drums, left to right: centre x, top y, cap width.
 * 8416817115: short, tall, short; 8416817629: a run of rising tops; each
 * step is one ordinary jump (95 px up, under 60 px across).
 */
export const WINTER_HAVEN_PILLARS = Object.freeze([
  Object.freeze({ x: -700, top: -345, w: 150 }),
  Object.freeze({ x: -480, top: -440, w: 170 }),
  Object.freeze({ x: -260, top: -345, w: 150 }),
  Object.freeze({ x: 140, top: -345, w: 150 }),
  Object.freeze({ x: 330, top: -440, w: 160 }),
  Object.freeze({ x: 520, top: -535, w: 160 }),
  Object.freeze({ x: 710, top: -630, w: 160 }),
  Object.freeze({ x: 900, top: -725, w: 160 }),
]);
/** The drum cluster with the fire (8416817377), between the two runs of pillars. */
export const WINTER_HAVEN_FIRE_X = -60;
/** The snowy landing at the top right, and the ladder up to it from the boardwalk (8416817377). */
export const WINTER_HAVEN_LANDING = Object.freeze({ x1: 1000, x2: 1260, y: -820 });
export const WINTER_HAVEN_LADDER = Object.freeze({ id: 'ladder_wh_exit', x: 1130, y: WINTER_HAVEN_BOARDWALK_Y, w: 50, h: WINTER_HAVEN_BOARDWALK_Y - WINTER_HAVEN_LANDING.y });
export const WINTER_HAVEN_SOURCE_LINE =
  'reconstruction: Winter Haven (LIFNNTRK1073PQ6, not in tinyspeck/glitch-locations); layout from Cleops\' 2013-01-26 snaps (Flickr 8416817115, 8416817377, 8416817629, 8417913246), reference only; CC0 Alakol and wood decos';

const HB = WINTER_HAVEN_BOUNDS;
const HG = WINTER_HAVEN_GROUND_Y;
const HW = WINTER_HAVEN_BOARDWALK_Y;

/** The basalt wall behind everything, in layer-local coordinates. */
function havenWallDecos(w, h) {
  const out = [];
  const faces = [['cliff_face_mountaineering_01b_al1', 974, 834], ['cliffside_1c_al1', 620, 846], ['cliff_face_mountaineering_01c_al1', 620, 846], ['cliffside_1a_al1', 1336, 878], ['cliff_face_mountaineering_01d_al1', 440, 588]];
  let z = 0;
  for (let y = h + 60, row = 0; y > -300; y -= 520, row += 1) {
    for (let x = -260 + (row % 2) * 200, i = 0; x < w + 400; x += 400, i += 1) {
      const [sprite, sw, sh] = faces[(row * 3 + i) % faces.length];
      const s = 640 / sh;
      out.push(deco(sprite, x, y, sw * s, 640, z++, (row + i) % 2 ? { flip: true } : {}));
    }
  }
  return out;
}

/** Icicles hanging from the top, and dark cave corners. */
function havenCeilingDecos(w) {
  const out = [];
  let z = 0;
  for (let x = 60, i = 0; x < w; x += 140 + rnd(i + 201) * 220, i += 1) {
    const s = 0.22 + rnd(i + 211) * 0.3;
    out.push(deco('icicle_1a_al1', x, 842 * s - 20, 318 * s, 842 * s, z++, i % 2 ? { flip: true } : {}));
  }
  return out;
}

/** Bare branches reaching in from both sides, and the tree between the fire and the ladder (8416817377). */
function havenTreeDecos() {
  const ox = -HB.l;
  const oy = -HB.t;
  return [
    deco('heights_tree_bare_3', HB.l + 40 + ox, HG + 10 + oy, 362 * 0.7, 1166 * 0.7, 0),
    deco('heights_tree_bare_2', HB.r - 30 + ox, HG + 10 + oy, 334 * 0.75, 1288 * 0.75, 1, { flip: true }),
    deco('heights_tree_bare_4', 1010 + ox, HW + 6 + oy, 1138 * 0.5, 1294 * 0.5, 2, { flip: true }),
  ];
}

/** Behind the walk line: the cave floor, the trestle posts and the rubble step (world coordinates). */
function havenMiddleDecos() {
  const out = [];
  let z = 10;
  // Trestle posts from the rubble up to the boardwalk.
  for (let x = -880; x <= 1280; x += 200) out.push(deco('wood_cover_middleplus', x, HG + 6, 60, HG + 6 - HW - 10, z++));
  // The rubble step at the boardwalk's left end.
  const S = WINTER_HAVEN_STEP;
  out.push(deco('rock_rubble_01a_al1', (S.x1 + S.x2) / 2, HG + 8, 230, HG + 8 - S.y + 14, z++, { id: 'haven_step' }));
  out.push(deco('snow_cap_01b_al1', (S.x1 + S.x2) / 2, S.y + 12, 170, 40, z++));
  return out;
}

const DRUMS = Object.freeze([[-46, 0], [46, 0], [0, 6]]);
const drumClusters = () => [...WINTER_HAVEN_PILLARS.map((p) => p.x), WINTER_HAVEN_FIRE_X];

/** Drums under every pillar and under the fire, from the rubble up behind the boardwalk (8417913246). */
function havenDrumBackDecos() {
  const out = [];
  let z = 0;
  const ox = -HB.l;
  const oy = -HB.t;
  for (const cx of drumClusters()) {
    for (const [dx, dy] of DRUMS) {
      for (let y = HG + 4; y > HW + 30; y -= 56) out.push(deco('ground_rootpipe2', cx + dx + ox, y + dy + oy, 64, 60, z++));
    }
  }
  return out;
}

/** The drums' tops standing on the boardwalk, in front of the pillars' feet. */
function havenDrumTopDecos() {
  const out = [];
  let z = 0;
  const ox = -HB.l;
  const oy = -HB.t;
  for (const cx of drumClusters()) {
    for (const [dx, dy] of DRUMS) out.push(deco('ground_rootpipe2', cx + dx + ox, HW + 10 + dy + oy, 64, WINTER_HAVEN_DRUM_H + 20, z++));
  }
  return out;
}

/** The boardwalk planks (their own layer so the drums show through as in 8417913246). */
function havenBoardDecos() {
  const out = [];
  let z = 0;
  const ox = -HB.l;
  const oy = -HB.t;
  for (let x = -940; x < 1320; x += 190) out.push(deco('wood_platform', x + ox, HW + 44 + oy, 230, 72, z++, (x / 190) % 2 ? { flip: true } : {}));
  // The landing at the top right: planks with snow on them.
  for (let x = WINTER_HAVEN_LANDING.x1 + 20; x < WINTER_HAVEN_LANDING.x2; x += 110) out.push(deco('wood_platform', x + ox, WINTER_HAVEN_LANDING.y + 40 + oy, 150, 60, z++));
  out.push(deco('snow_cap_01d_al1', (WINTER_HAVEN_LANDING.x1 + WINTER_HAVEN_LANDING.x2) / 2 + ox, WINTER_HAVEN_LANDING.y + 14 + oy, 270, 46, z++));
  // The ladder from the boardwalk up to the landing.
  const L = WINTER_HAVEN_LADDER;
  for (let y = L.y + 6; y > L.y - L.h + 40; y -= 190) out.push(deco('ladder_interior_4steps', L.x + ox, y + oy, 72, 196, z++, { id: `exit_ladder_${Math.round((L.y - y) / 190) + 1}` }));
  return out;
}

/**
 * The pillars and the fire. Each pillar's taper runs on down behind the drum
 * tops, the planks and the drums below (their layers are in front), so what
 * shows is the broad upper part, as in the snaps.
 */
function havenPillarDecos() {
  const out = [];
  const ox = -HB.l;
  const oy = -HB.t;
  const drumTop = HW - WINTER_HAVEN_DRUM_H + 8;
  for (const [i, p] of WINTER_HAVEN_PILLARS.entries()) {
    const shown = drumTop - (p.top - 16);
    const h = Math.round(shown / 0.68);
    out.push(deco(PILLAR_SPRITE, p.x + ox, drumTop + (h - shown) + oy, p.w, h, i, { id: `haven_pillar_${i + 1}` }));
  }
  out.push(deco('fire1', WINTER_HAVEN_FIRE_X + ox, HW - WINTER_HAVEN_DRUM_H + 16 + oy, 112, 170, 50, { id: 'haven_fire' }));
  return out;
}

/** Snowy rubble along the bottom, in street-local coordinates. */
/** The cave floor in front, from just under the feet down past the street bottom (the ground skirt only stretches the middleground). */
function havenFloorDecos() {
  const out = [];
  let z = 0;
  const ox = -HB.l;
  const oy = -HB.t;
  for (let x = HB.l - 300, i = 0; x < HB.r + 700; x += 1100, i += 1) out.push(deco('dirt_platform_long', x + ox, 480 + oy, 1500, 530, z++, i % 2 ? { flip: true } : {}));
  return out;
}

/** Snowy rubble along the bottom, in front of the walk line (street-local coordinates). */
function havenRubbleDecos() {
  const out = [];
  let z = 0;
  const ox = -HB.l;
  const oy = -HB.t;
  for (let x = HB.l - 60, i = 0; x < HB.r + 200; x += 260 + rnd(i + 301) * 140, i += 1) {
    const sprite = ['rock_rubble_01a_al1', 'snow_rubble_01d_al1', 'rock_rubble_01c_al1', 'snow_drift_01a_al1'][i % 4];
    const [sw, sh] = { rock_rubble_01a_al1: [554, 274], snow_rubble_01d_al1: [618, 274], rock_rubble_01c_al1: [544, 178], snow_drift_01a_al1: [618, 168] }[sprite];
    const s = 0.3 + rnd(i + 311) * 0.15;
    out.push(deco(sprite, x + ox, 70 + oy, sw * s, sh * s, z++, i % 2 ? { flip: true } : {}));
  }
  return out;
}

export function winterHavenStreet() {
  const W = HB.r - HB.l;
  const H = HB.b - HB.t;
  const platforms = [];
  const g = WINTER_HAVEN_GROUND_BREAKS;
  for (let i = 0; i + 1 < g.length; i += 1) platforms.push(plat(`plat_wh_ground_${i + 1}`, g[i], g[i + 1], HG));
  platforms.push(plat('plat_wh_step', WINTER_HAVEN_STEP.x1, WINTER_HAVEN_STEP.x2, WINTER_HAVEN_STEP.y));
  const b = WINTER_HAVEN_BOARDWALK_BREAKS;
  for (let i = 0; i + 1 < b.length; i += 1) platforms.push(plat(`plat_wh_boardwalk_${i + 1}`, b[i], b[i + 1], HW));
  WINTER_HAVEN_PILLARS.forEach((p, i) => platforms.push(plat(`plat_wh_pillar_${i + 1}`, p.x - Math.round(p.w * 0.45), p.x + Math.round(p.w * 0.45), p.top)));
  platforms.push(plat('plat_wh_landing', WINTER_HAVEN_LANDING.x1, WINTER_HAVEN_LANDING.x2, WINTER_HAVEN_LANDING.y));
  const layers = [
    { id: 'T_wh_wall', name: 'bg_1', z: -9, w: 2500, h: H, decos: havenWallDecos(2500, H), filters: { tintColor: 0x7c6c78, tintAmount: 42, brightness: -22, saturation: -28 } },
    { id: 'T_wh_icicles', name: 'bg_2', z: -8, w: 2560, h: H, decos: havenCeilingDecos(2560), filters: { tintColor: 0xd9d2ee, tintAmount: 25, brightness: -4 } },
    { id: 'T_wh_trees', name: 'branches', z: -7, w: W, h: H, decos: havenTreeDecos(), filters: { brightness: -14, saturation: -30 } },
    { id: 'T_wh_pillars', name: 'pillars', z: -6, w: W, h: H, decos: havenPillarDecos(), filters: { tintColor: 0xeee6ff, tintAmount: 14 } },
    { id: 'T_wh_drums', name: 'drums', z: -5, w: W, h: H, decos: havenDrumBackDecos(), filters: { saturation: -100, brightness: -4 } },
    { id: 'T_wh_boards', name: 'boards', z: -4, w: W, h: H, decos: havenBoardDecos(), filters: { saturation: -25, brightness: -6 } },
    { id: 'T_wh_drum_tops', name: 'drum tops', z: -3, w: W, h: H, decos: havenDrumTopDecos(), filters: { saturation: -100, brightness: 6 } },
    { id: 'middleground', name: 'middleground', z: 0, w: W, h: H, decos: havenMiddleDecos() },
    { id: 'T_wh_floor', name: 'floor', z: 1, w: W, h: H, decos: havenFloorDecos(), filters: { saturation: -100, brightness: -18, tintColor: 0x6e6676, tintAmount: 35 } },
    { id: 'T_wh_rubble', name: 'middleplus', z: 2, w: W, h: H, decos: havenRubbleDecos(), filters: { tintColor: 0x8f8a9c, tintAmount: 30, brightness: -12 } },
  ];
  return shell({
    source: WINTER_HAVEN_SOURCE_LINE,
    tsid: WINTER_HAVEN_TSID,
    label: WINTER_HAVEN_LABEL,
    bounds: HB,
    platforms,
    layers,
    ladders: [{ ...WINTER_HAVEN_LADDER }],
    // Dark cave above, the basalt's grey-mauve below.
    gradient: { top: '2A262E', bottom: '6A6170' },
    why: {
      street: 'winter_walk.js:31-34 (LIFNNTRK1073PQ6) and inc_data_maps_prod.js:17934 (hub 61); no location XML.',
      bounds: 'No source size: 2600 x 1300, room for the boardwalk, the pillars\' climb and the landing above.',
      layout: 'You arrive on the snowy rubble under the boardwalk, step up at its left end, and climb the snow pillars on their drums (short, tall, short; past the fire; then a run of rising tops) to the landing at the top right, which the ladder also reaches from the boardwalk.',
      route: 'js/winter-walk.js puts the haven motes on the way up and the EXIT ladder on the highest platform, the landing.',
      notBuilt: 'Snow on the branches has no separate CC0 piece; the drums are a darkened CC0 pipe, not the pictures\' exact clusters.',
    },
  });
}

export const winterWalkIndexEntry = (street) => indexRow(street);
export const winterHavenIndexEntry = (street) => indexRow(street);

/** Nothing spawns on either (setupWinterWalkStage clears the street; this keeps the fallback population out). */
export function winterStreetEcology(tsid) {
  if (isWinterWalkTsid(tsid)) return { label: WINTER_WALK_LABEL, sourceTsid: WINTER_WALK_SOURCE_TSID, counts: {}, quoins: 0, companions: false, reconstructed: true };
  if (isWinterHavenTsid(tsid)) return { label: WINTER_HAVEN_LABEL, sourceTsid: WINTER_HAVEN_SOURCE_TSID, counts: {}, interior: true, interiorWhy: 'a cave (Cleops\' snaps)', quoins: 0, companions: false, reconstructed: true };
  return null;
}
