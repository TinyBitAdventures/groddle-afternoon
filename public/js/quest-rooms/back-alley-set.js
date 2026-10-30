/**
 * The Back Alley (LIF177DTS6T1KFG): the one set for its one TSID. Both
 * quests that send you there copy the same template (quests/
 * card_carrying_qualification.js and quests/fuelmaking_refuel_robot.js
 * onStarted: instances_create_delayed 'back_alley' at 715, -73), and the same
 * Shady Bureaucrat propositions you when you walk into its
 * back_alley_entered box (locations/location.js 1314-1321); only
 * pc.back_alley_business picks his speech (npc_bureaucrat.js 877).
 * We're Off to See the Lizard's room (back-alley.js) and Legalize It's route
 * (game.js spawnLegalizeBackAlley) both draw it from here.
 *
 * The location's geometry is lost. The set is laid out from its one player
 * Snap (G111: research/wayback/raw/snaps/fuelmaking_refuel_robot/, Jul 2012,
 * reference only) at ~1.45 world px per Snap px, measured from the
 * Bureaucrat (Snap x 320), with recovered CC0 art: Groddle forest decos, the
 * white brick back wall, corey3's grey stone hut and fallen log, and the
 * Shady Bureaucrat sheets.
 */

import * as kit from './kit.js?v=g458-1';
import { textureFromUrl } from '../textures.js';
import { BACK_ALLEY_FILES } from './back-alley-art.js';

const ART = 'assets/sprites/quest-rooms/back_alley/';

export const BACK_ALLEY_TSID = 'LIF177DTS6T1KFG';

/** World pixels, y down: the floor, where you arrive, the Bureaucrat and the left edge of the entered box. */
export const ALLEY = Object.freeze({ W: 1600, FLOOR: 620, spawnX: 1300, bureaucratX: 880, triggerX: 1060 });

/** The Shady Bureaucrat (npc_bureaucrat arms_01 ... torso_01), standing on the path in front of the hut. */
export const SHADY = Object.freeze({ x: ALLEY.bureaucratX, y: ALLEY.FLOOR + 4, scale: 0.95 });

/**
 * Left to right as in the Snap: a dark trunk, a tall pale brick wall under
 * the canopy, the light shaft, the small grey hut behind the Bureaucrat,
 * bushes, the fallen reddish log behind the avatar, on a dirt path through
 * a dark green forest. World x of each piece (centre, or [left, right] for
 * the wall and log).
 */
export const ALLEY_SET = Object.freeze({
  trunkX: 632,
  wall: Object.freeze({ left: 656, right: 812, height: 380 }),
  shaft: Object.freeze({ top: [850, 1000], bottom: [900, 1080] }),
  hutX: 880,
  log: Object.freeze({ left: 1060, right: 1312 }),
  bushes: Object.freeze([960, 1120, 1290, 1440]),
});
/** Recovered CC0 pieces the set uses (assets/decos/groddle, or the room-art set). */
export const ALLEY_ART = Object.freeze({
  wall: 'backwall_bricks_white_ghtest',
  hut: 'house_back_small01',
  log: 'corey3_fallenTree_log',
  canopy: 'platform_branch_a04',
  forest: 'wallpaper_tree_short_1',
});

export function alleyPlatforms(k = kit) {
  return [k.plat(0, ALLEY.FLOOR, ALLEY.W, ALLEY.FLOOR, 'invisible', { id: 'ba_floor' })];
}

/** In the back_alley_entered box: from the Bureaucrat's side up to the log. */
export const inEnteredBox = (x) => x <= ALLEY.triggerX;

/** The set as one scene root (kit.sceneRoot: worldW, worldH, parallax layers). */
export function drawAlley(PIXI) {
  const { W, FLOOR } = ALLEY;
  const S = ALLEY_SET;
  const H = FLOOR + 140;
  const root = kit.sceneRoot(PIXI, W, H);
  const sky = root.layer(0, 0);
  sky.addChild(kit.gradient(PIXI, [[0, '#08150e'], [0.6, '#11271a'], [1, '#1a3523']], 960, 640));
  // Far forest: rows of dark pines behind everything.
  const far = root.layer(0.45, 1);
  for (let i = 0; i < 6; i++) {
    far.addChild(kit.deco(PIXI, i % 2 ? 'wallpaper_tree_short_2' : ALLEY_ART.forest, -200 + i * 360, FLOOR - 40, { scale: 0.42, tint: 0x5f7a62, alpha: 0.9 }));
  }
  const mid = root.layer(0.75, 1.5);
  [['tree_coniferous_2', 140], ['tree_coniferous_4', 620], ['tree_coniferous_1', 1060], ['tree_coniferous_3', 1420]].forEach(([n, x], i) => {
    mid.addChild(kit.deco(PIXI, n, x, FLOOR + 10, { scale: 0.42 + (i % 2) * 0.05, tint: 0x46604a }));
  });
  const world = root.layer(1, 2);
  // The pale brick wall, moved to the left of the Bureaucrat as in the Snap: a crop of the CC0
  // white brick back wall, shaded down for the dark forest.
  const wallSpr = kit.deco(PIXI, ALLEY_ART.wall, S.wall.left, FLOOR + 6, { ax: 0, ay: 1, scale: (S.wall.height + 6) / 594, tint: 0xa9aea2 });
  const wallMask = new PIXI.Graphics().rect(S.wall.left, FLOOR - S.wall.height, S.wall.right - S.wall.left, S.wall.height + 6).fill(0xffffff);
  wallSpr.mask = wallMask;
  world.addChild(wallMask, wallSpr);
  const wallEdge = new PIXI.Graphics();
  wallEdge.rect(S.wall.right - 10, FLOOR - S.wall.height, 10, S.wall.height).fill({ color: 0x1b2a1f, alpha: 0.35 });
  world.addChild(wallEdge);
  // The dark trunk at the left edge and the canopy hanging over the wall top.
  world.addChild(kit.deco(PIXI, 'tree_coniferous_fg_2', S.trunkX, FLOOR + 30, { scale: 0.34, tint: 0x3a4a3c }));
  world.addChild(kit.deco(PIXI, ALLEY_ART.canopy, S.wall.left + 110, FLOOR - 170, { scale: 0.6, tint: 0x5f8a4a, rotation: 0.16 }));
  world.addChild(kit.deco(PIXI, 'platform_branch_a02', S.wall.right + 40, FLOOR - 225, { scale: 0.5, tint: 0x4e7a40, flip: true, rotation: -0.08 }));
  // The light shaft through the canopy, above the hut.
  const beams = new PIXI.Graphics();
  beams.poly([S.shaft.top[0], -40, S.shaft.top[1], -40, S.shaft.bottom[1], FLOOR, S.shaft.bottom[0], FLOOR]).fill({ color: 0xd8f5cf, alpha: 0.1 });
  beams.poly([S.shaft.top[0] + 40, -40, S.shaft.top[1] - 40, -40, S.shaft.bottom[1] - 50, FLOOR, S.shaft.bottom[0] + 40, FLOOR]).fill({ color: 0xeefbe6, alpha: 0.07 });
  world.addChild(beams);
  world.addChild(kit.deco(PIXI, 'forest_hole_back', 285, FLOOR, { scale: 1.05, tint: 0x8a8a7a }));
  // The small grey hut behind the Bureaucrat (CC0 corey3 stone hut).
  world.addChild(kit.deco(PIXI, ALLEY_ART.hut, S.hutX, FLOOR + 6, { scale: 0.38, tint: 0x9a9f98 }));
  // Bushes behind the log.
  S.bushes.forEach((x, i) => {
    world.addChild(kit.deco(PIXI, ['bush_2', 'groddle_bush1', 'bush_3', 'bush_2'][i], x, FLOOR + 4, { scale: 0.42 + (i % 2) * 0.06, tint: 0x6f9a62, flip: i % 2 === 1 }));
  });
  // The dirt path: orange-brown earth with a mossy back edge and a dark leafy fringe in front.
  const floor = new PIXI.Graphics();
  floor.rect(-600, FLOOR, W + 1200, H - FLOOR + 200).fill(0x5b3c22);
  floor.rect(-600, FLOOR - 4, W + 1200, 10).fill(0x3f5a26);
  for (let x = -600; x < W + 600; x += 46) floor.ellipse(x + (x % 3) * 7, FLOOR - 3, 30, 6);
  floor.fill(0x4f6e2f);
  for (let i = 0; i < 40; i++) floor.ellipse((i * 131) % W, FLOOR + 18 + ((i * 47) % 70), 6 + (i % 4) * 3, 3 + (i % 3));
  floor.fill(0x7a5634);
  floor.rect(-600, FLOOR + 96, W + 1200, H).fill(0x1d2a17);
  for (let x = -600; x < W + 600; x += 38) floor.ellipse(x, FLOOR + 96 + (x % 5) * 2, 26, 12 + (x % 3) * 3);
  floor.fill(0x1d2a17);
  world.addChild(floor);
  // The fallen log (CC0 corey3_fallenTree_log), its cut end to the left, lying on the path behind the avatar.
  const [logFile] = BACK_ALLEY_FILES[ALLEY_ART.log];
  const log = new PIXI.Sprite(textureFromUrl(`${ART}${logFile}`));
  log.anchor.set(0, 1);
  log.x = S.log.left;
  log.y = FLOOR + 4;
  log.rotation = -0.05;
  log.tint = 0xd08070;
  world.addChild(log);
  world.addChild(kit.deco(PIXI, 'tree_coniferous_fg_1', 1560, FLOOR + 40, { scale: 0.3, tint: 0x33433a }));
  return root;
}
