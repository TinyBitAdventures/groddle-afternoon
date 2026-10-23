/**
 * The home-street Tower (pure rules: no Pixi, no DOM).
 *
 * Sources (tinyspeck/glitch-GameServerJS, CC0):
 * - items/proto_furniture_tower_chassis.js  label "Tower", base_cost 20000, ghost width 356,
 *                                           job_class_id job_cult_tower, build_tower verb,
 *                                           scaffolding states 1 / 2 (>= 0.333) / 3 (>= 0.666)
 * - locations/inc_cultivation.js            level 18 gate, one tower per player, the fixed
 *                                           20,000 iMG cost (no 1.15^n escalation) and the
 *                                           placement_warning text
 * - quests/job_cult_tower.js                the one-phase cultivation project (two buckets)
 * - quests/job_tower_floor_3..9.js          one project per extra floor
 * - items/tower_expander.js                 the Workbench that runs a floor project
 * - items/furniture_tower_chassis.js        exterior: extra_floors = floors - 2, customize,
 *                                           setUserName (25 chars, the client's regex),
 *                                           the five catalog_furniture.js styles
 * - locations/tower.js                      START_FLOORS 2, MAX_FLOORS 9 (config_base.js
 *                                           towers), 6 wall segments, 458 + 28 px floors,
 *                                           elevator signposts (label TOWER), the exit door,
 *                                           tower_start_expand / tower_end_expand,
 *                                           tower_get_expand_costs, tower_set_floor_name,
 *                                           tower_move_players (owner to the top row),
 *                                           the 130-290 construction floor, y_cam_offset 220
 * - research/wayback/raw/home-images/towers   64 archived cutaways (look only): the L, 1, 2 ...
 *                                           marks on the elevator column
 * - players/inc_towers.js, location.js      getTower, has_visited_tower
 * - quests/build_a_tower.js                 offer / completion text, flags cultivate_tower
 *                                           and build_tower, 2,000 currants + 200 energy
 * - location.js handleTowerSecrets          TowerSpot_ hitboxes in the Jethimadh Tower Base,
 *                                           achievements/tower_secret_areas.js (group 11)
 *
 * Remake decisions:
 * - Tower floors are one room at a time (the source stacked them in one tall
 *   location and the elevator signpost teleported between them); each floor is
 *   decorated with the house decorate system.
 * - Styles were credit purchases; with no credits in the remake they are free,
 *   like the house swatches.
 * - Removing an unfinished Tower needed Wine of the Dead to cancel a started
 *   project; the remake keeps that rule (and removes an untouched one freely).
 * - Exterior art: the six recovered chassis SWFs (base + five styles), every
 *   article choice rasterised at 2x with its registration point
 *   (assets/sprites/home-tower, tools/tower-art/build.mjs); Customize picks a
 *   choice per part as the client's ChassisManager / ConfiggerUI did.
 */

import { TOWER_ROOM_SPOTS } from './tower-rooms.js?v=tower-rooms-1';
import { TOWER_PART_CHOICES, TOWER_VARIANT_ART } from './home-tower-art.js?v=tower-art-1';

export { TOWER_PART_CHOICES, TOWER_VARIANT_ART };

export const TOWER_PROTO = 'proto_furniture_tower_chassis';
export const TOWER_CHASSIS = 'furniture_tower_chassis';
export const TOWER_EXPANDER = 'tower_expander';
export const TOWER_JOB = 'job_cult_tower';
/** inc_cultivation.js cultivation_classes. */
export const TOWER_MIN_LEVEL = 18;
/** proto_furniture_tower_chassis.js base_cost; cultivation_get_img_cost skips the escalation. */
export const TOWER_IMG_COST = 20_000;
/** proto classProps width (the cultivation ghost). */
export const TOWER_WIDTH = 356;
export const TOWER_PLACEMENT_WARNING = "Building a tower is an expensive job: after imagining this plan, you'll still need 4 girders, 16 wall segments, 20 urth blocks, 200 snails and a general building permit to actually build your tower! Are you sure you want to get into this?";
/** config_base.js towers. */
export const TOWER_CONFIG = Object.freeze({
  START_FLOORS: 2,
  START_TEXTURE_FLOOR: 'starter_crappy',
  START_TEXTURE_CEILING: 'starter_crappy_ceiling',
  START_TEXTURE_WALL: 'grey_unfinished',
  MAX_FLOORS: 9,
});
/** tower.js tower_get_geo_config / tower_get_bounds. */
export const TOWER_GEO = Object.freeze({
  wallSegments: 6,
  leftOffset: 145,
  frameHeight: 28,
  floorHeight: 458 + 28,
  width: 145 + 7 * 150 - 17,
  elevatorX: 200,
  elevatorLabel: 'TOWER',
  /** exit_door x = floors[0].w - 67; teleport point x = w - 150. */
  exitX: 145 + 7 * 150 - 17 - 67,
  arriveX: 145 + 7 * 150 - 17 - 150,
  /** expansion.job (the Workbench): 260 + 80. */
  workbenchX: 340,
  /**
   * tower_build_expansion: the floor under construction has a floor platform
   * and walls only from 130 to 290 (the planked strip by the elevator).
   */
  expansionLeft: 130,
  expansionRight: 290,
  /** tower_reset_geometry: geo.physics.y_cam_offset for the whole tower. */
  yCamOffset: 220,
});

/**
 * The floor mark painted on the elevator column above its call buttons: L on
 * the ground floor, then 1, 2, ... (every one of the 64 archived tower
 * cutaways, research/wayback/raw/home-images/towers, the construction floor
 * included). Measured on those renders (720 px for the 1,178 px tower): the
 * mark is centred 75 px from the tower's left edge with its foot 171 px above
 * the floor's bound, about 35 px tall, dark grey on the stone.
 */
export const ELEVATOR_MARK = Object.freeze({ x: 75, footAboveBound: 171, capH: 35 });

export function elevatorMark(index) {
  const i = Math.max(0, Math.floor(Number(index) || 0));
  return i === 0 ? 'L' : String(i);
}
/** proto onContribution: setAndBroadcastState at these fractions. */
export const PROTO_STATE_AT = Object.freeze([0.333, 0.666]);
/** setJobData delay_seconds between phases (one phase here, kept for reference). */
export const TOWER_JOB_DELAY_S = 60;

export const BUILD_A_TOWER = Object.freeze({
  id: 'build_a_tower',
  cultivateFlag: 'cultivate_tower',
  buildFlag: 'build_tower',
  giver: 'magic_rock',
  rewards: Object.freeze({ currants: 2000, energy: 200 }),
});

/** bag_butler.js buildTowerComment trigger (level 18+, no tower, 20%). */
export const BUTLER_TOWER_CHANCE = 0.2;

const job = (title, desc, completion, requirements) => Object.freeze({ title, desc, completion, requirements: Object.freeze(requirements.map((r) => Object.freeze(r))) });

/** quests/job_cult_tower.js and job_tower_floor_N.js, field for field. */
export const TOWER_JOBS = Object.freeze({
  job_cult_tower: job("Tower", "This project is to create a Tower.", "Congrats, you made a Tower!", [
    {id: "r1701",bucket: 1,group: 1,type: "item",classId: "grade_aa_earth_block",num: 20,baseCost: 150,desc: "Urthify the foundation"},
    {id: "r1703",bucket: 1,group: 1,type: "item",classId: "general_building_permit",num: 1,baseCost: 500,desc: "Employ a permit"},
    {id: "r1704",bucket: 1,group: 1,type: "item",classId: "snail",num: 200,baseCost: 10,desc: "Add snails"},
    {id: "r1814",bucket: 1,group: 2,type: "work",classId: "shovel",num: 20,baseCost: 28,desc: "Break ground",classIds: ["shovel","ace_of_spades"],energy: 25,wear: 2,verb: "break ground",verbPast: "broke ground",skill: ""},
    {id: "r1700",bucket: 2,group: 1,type: "item",classId: "girder",num: 4,baseCost: 1500,desc: "Block out foundation"},
    {id: "r1702",bucket: 2,group: 1,type: "item",classId: "wall_segment",num: 16,baseCost: 2500,desc: "Put up walls"},
    {id: "r1705",bucket: 2,group: 2,type: "work",classId: "construction_tool",num: 20,baseCost: 43,desc: "Construct the tower",classIds: ["construction_tool"],energy: 40,wear: 2,verb: "construct",verbPast: "constructed",skill: ""},
  ]),
  job_tower_floor_3: job("Tower Floor 3", "This project is to add the third floor to your Tower.", "Congrats, your Tower now has 3 floors!", [
    {id: "r1706",bucket: 1,group: 1,type: "item",classId: "wall_segment",num: 8,baseCost: 2500,desc: "Add wall segments"},
    {id: "r1707",bucket: 1,group: 1,type: "item",classId: "grade_aa_earth_block",num: 40,baseCost: 150,desc: "Add Urth blocks"},
    {id: "r1708",bucket: 1,group: 1,type: "item",classId: "girder",num: 8,baseCost: 1500,desc: "Add girders"},
    {id: "r1712",bucket: 1,group: 1,type: "item",classId: "snail",num: 24,baseCost: 10,desc: "Use snails"},
    {id: "r1709",bucket: 1,group: 2,type: "work",classId: "construction_tool",num: 25,baseCost: 23,desc: "Construct the next floor",classIds: ["construction_tool"],energy: 20,wear: 2,verb: "construct",verbPast: "constructed",skill: ""},
    {id: "r1710",bucket: 2,group: 1,type: "item",classId: "beam",num: 4,baseCost: 800,desc: "Add beams"},
    {id: "r1711",bucket: 2,group: 1,type: "item",classId: "metal_post",num: 8,baseCost: 400,desc: "Add metal bars"},
    {id: "r1713",bucket: 2,group: 1,type: "item",classId: "string",num: 53,baseCost: 53,desc: "String it up"},
    {id: "r1807",bucket: 2,group: 1,type: "item",classId: "general_building_permit",num: 1,baseCost: 500,desc: "Employ a permit"},
    {id: "r1714",bucket: 2,group: 2,type: "work",classId: "tinkertool",num: 25,baseCost: 23,desc: "Elevate the floor",classIds: ["tinkertool"],energy: 20,wear: 2,verb: "elevate",verbPast: "elevated",skill: ""},
  ]),
  job_tower_floor_4: job("Tower Floor 4", "This project is to add the fourth floor to your Tower.", "Congrats, your Tower now has 4 floors!", [
    {id: "r1715",bucket: 1,group: 1,type: "item",classId: "wall_segment",num: 8,baseCost: 2500,desc: "Add wall segments"},
    {id: "r1721",bucket: 1,group: 1,type: "item",classId: "grade_aa_earth_block",num: 60,baseCost: 150,desc: "Add Urth blocks"},
    {id: "r1727",bucket: 1,group: 1,type: "item",classId: "girder",num: 12,baseCost: 1500,desc: "Add girders"},
    {id: "r1751",bucket: 1,group: 1,type: "item",classId: "snail",num: 24,baseCost: 10,desc: "Use snails"},
    {id: "r1733",bucket: 1,group: 2,type: "work",classId: "construction_tool",num: 30,baseCost: 23,desc: "Construct the next floor",classIds: ["construction_tool"],energy: 20,wear: 2,verb: "construct",verbPast: "constructed",skill: ""},
    {id: "r1739",bucket: 2,group: 1,type: "item",classId: "beam",num: 6,baseCost: 800,desc: "Add beams"},
    {id: "r1745",bucket: 2,group: 1,type: "item",classId: "metal_post",num: 12,baseCost: 400,desc: "Add metal bars"},
    {id: "r1757",bucket: 2,group: 1,type: "item",classId: "string",num: 106,baseCost: 53,desc: "String it up"},
    {id: "r1808",bucket: 2,group: 1,type: "item",classId: "general_building_permit",num: 1,baseCost: 500,desc: "Employ a permit"},
    {id: "r1763",bucket: 2,group: 2,type: "work",classId: "tinkertool",num: 30,baseCost: 23,desc: "Elevate the floor",classIds: ["tinkertool"],energy: 20,wear: 2,verb: "elevate",verbPast: "elevated",skill: ""},
  ]),
  job_tower_floor_5: job("Tower Floor 5", "This project is to add the fifth floor to your Tower.", "Congrats, your Tower now has 5 floors!", [
    {id: "r1716",bucket: 1,group: 1,type: "item",classId: "wall_segment",num: 8,baseCost: 2500,desc: "Add wall segments"},
    {id: "r1722",bucket: 1,group: 1,type: "item",classId: "grade_aa_earth_block",num: 80,baseCost: 150,desc: "Add Urth blocks"},
    {id: "r1728",bucket: 1,group: 1,type: "item",classId: "girder",num: 16,baseCost: 1500,desc: "Add girders"},
    {id: "r1752",bucket: 1,group: 1,type: "item",classId: "snail",num: 24,baseCost: 10,desc: "Use snails"},
    {id: "r1734",bucket: 1,group: 2,type: "work",classId: "construction_tool",num: 35,baseCost: 23,desc: "Construct the next floor",classIds: ["construction_tool"],energy: 20,wear: 2,verb: "construct",verbPast: "constructed",skill: ""},
    {id: "r1740",bucket: 2,group: 1,type: "item",classId: "beam",num: 8,baseCost: 800,desc: "Add beams"},
    {id: "r1746",bucket: 2,group: 1,type: "item",classId: "metal_post",num: 16,baseCost: 400,desc: "Add metal bars"},
    {id: "r1758",bucket: 2,group: 1,type: "item",classId: "string",num: 159,baseCost: 53,desc: "String it up"},
    {id: "r1809",bucket: 2,group: 1,type: "item",classId: "general_building_permit",num: 1,baseCost: 500,desc: "Employ a permit"},
    {id: "r1764",bucket: 2,group: 2,type: "work",classId: "tinkertool",num: 35,baseCost: 23,desc: "Elevate the floor",classIds: ["tinkertool"],energy: 20,wear: 2,verb: "elevate",verbPast: "elevated",skill: ""},
  ]),
  job_tower_floor_6: job("Tower Floor 6", "This project is to add the sixth floor to your Tower.", "Congrats, your Tower now has 6 floors!", [
    {id: "r1717",bucket: 1,group: 1,type: "item",classId: "wall_segment",num: 8,baseCost: 2500,desc: "Add wall segments"},
    {id: "r1723",bucket: 1,group: 1,type: "item",classId: "grade_aa_earth_block",num: 100,baseCost: 150,desc: "Add Urth blocks"},
    {id: "r1729",bucket: 1,group: 1,type: "item",classId: "girder",num: 20,baseCost: 1500,desc: "Add girders"},
    {id: "r1753",bucket: 1,group: 1,type: "item",classId: "snail",num: 24,baseCost: 10,desc: "Use snails"},
    {id: "r1735",bucket: 1,group: 2,type: "work",classId: "construction_tool",num: 40,baseCost: 23,desc: "Construct the next floor",classIds: ["construction_tool"],energy: 20,wear: 2,verb: "construct",verbPast: "constructed",skill: ""},
    {id: "r1741",bucket: 2,group: 1,type: "item",classId: "beam",num: 10,baseCost: 800,desc: "Add beams"},
    {id: "r1747",bucket: 2,group: 1,type: "item",classId: "metal_post",num: 20,baseCost: 400,desc: "Add metal bars"},
    {id: "r1759",bucket: 2,group: 1,type: "item",classId: "string",num: 212,baseCost: 53,desc: "String it up"},
    {id: "r1810",bucket: 2,group: 1,type: "item",classId: "general_building_permit",num: 1,baseCost: 500,desc: "Employ a permit"},
    {id: "r1765",bucket: 2,group: 2,type: "work",classId: "tinkertool",num: 40,baseCost: 23,desc: "Elevate the floor",classIds: ["tinkertool"],energy: 20,wear: 2,verb: "elevate",verbPast: "elevated",skill: ""},
  ]),
  job_tower_floor_7: job("Tower Floor 7", "This project is to add the seventh floor to your Tower.", "Congrats, your Tower now has 7 floors!", [
    {id: "r1718",bucket: 1,group: 1,type: "item",classId: "wall_segment",num: 8,baseCost: 2500,desc: "Add wall segments"},
    {id: "r1724",bucket: 1,group: 1,type: "item",classId: "grade_aa_earth_block",num: 120,baseCost: 150,desc: "Add Urth blocks"},
    {id: "r1730",bucket: 1,group: 1,type: "item",classId: "girder",num: 24,baseCost: 1500,desc: "Add girders"},
    {id: "r1754",bucket: 1,group: 1,type: "item",classId: "snail",num: 24,baseCost: 10,desc: "Use snails"},
    {id: "r1736",bucket: 1,group: 2,type: "work",classId: "construction_tool",num: 45,baseCost: 23,desc: "Construct the next floor",classIds: ["construction_tool"],energy: 20,wear: 2,verb: "construct",verbPast: "constructed",skill: ""},
    {id: "r1742",bucket: 2,group: 1,type: "item",classId: "beam",num: 12,baseCost: 800,desc: "Add beams"},
    {id: "r1748",bucket: 2,group: 1,type: "item",classId: "metal_post",num: 24,baseCost: 400,desc: "Add metal bars"},
    {id: "r1760",bucket: 2,group: 1,type: "item",classId: "string",num: 265,baseCost: 53,desc: "String it up"},
    {id: "r1811",bucket: 2,group: 1,type: "item",classId: "general_building_permit",num: 1,baseCost: 500,desc: "Employ a permit"},
    {id: "r1766",bucket: 2,group: 2,type: "work",classId: "tinkertool",num: 45,baseCost: 23,desc: "Elevate the floor",classIds: ["tinkertool"],energy: 20,wear: 2,verb: "elevate",verbPast: "elevated",skill: ""},
  ]),
  job_tower_floor_8: job("Tower Floor 8", "This project is to add the eighth floor to your Tower.", "Congrats, your Tower now has 8 floors!", [
    {id: "r1719",bucket: 1,group: 1,type: "item",classId: "wall_segment",num: 8,baseCost: 2500,desc: "Add wall segments"},
    {id: "r1725",bucket: 1,group: 1,type: "item",classId: "grade_aa_earth_block",num: 140,baseCost: 150,desc: "Add Urth blocks"},
    {id: "r1731",bucket: 1,group: 1,type: "item",classId: "girder",num: 28,baseCost: 1500,desc: "Add girders"},
    {id: "r1755",bucket: 1,group: 1,type: "item",classId: "snail",num: 24,baseCost: 10,desc: "Use snails"},
    {id: "r1737",bucket: 1,group: 2,type: "work",classId: "construction_tool",num: 50,baseCost: 23,desc: "Construct the next floor",classIds: ["construction_tool"],energy: 20,wear: 2,verb: "construct",verbPast: "constructed",skill: ""},
    {id: "r1743",bucket: 2,group: 1,type: "item",classId: "beam",num: 14,baseCost: 800,desc: "Add beams"},
    {id: "r1749",bucket: 2,group: 1,type: "item",classId: "metal_post",num: 28,baseCost: 400,desc: "Add metal bars"},
    {id: "r1761",bucket: 2,group: 1,type: "item",classId: "string",num: 318,baseCost: 53,desc: "String it up"},
    {id: "r1812",bucket: 2,group: 1,type: "item",classId: "general_building_permit",num: 1,baseCost: 500,desc: "Employ a permit"},
    {id: "r1767",bucket: 2,group: 2,type: "work",classId: "tinkertool",num: 50,baseCost: 23,desc: "Elevate the floor",classIds: ["tinkertool"],energy: 20,wear: 2,verb: "elevate",verbPast: "elevated",skill: ""},
  ]),
  job_tower_floor_9: job("Tower Floor 9", "This project is to add the ninth floor to your Tower.", "Congrats, your Tower now has 9 floors!", [
    {id: "r1720",bucket: 1,group: 1,type: "item",classId: "wall_segment",num: 8,baseCost: 2500,desc: "Add wall segments"},
    {id: "r1726",bucket: 1,group: 1,type: "item",classId: "grade_aa_earth_block",num: 160,baseCost: 150,desc: "Add Urth blocks"},
    {id: "r1732",bucket: 1,group: 1,type: "item",classId: "girder",num: 32,baseCost: 1500,desc: "Add girders"},
    {id: "r1756",bucket: 1,group: 1,type: "item",classId: "snail",num: 24,baseCost: 10,desc: "Use snails"},
    {id: "r1738",bucket: 1,group: 2,type: "work",classId: "construction_tool",num: 55,baseCost: 23,desc: "Construct the next floor",classIds: ["construction_tool"],energy: 20,wear: 2,verb: "construct",verbPast: "constructed",skill: ""},
    {id: "r1744",bucket: 2,group: 1,type: "item",classId: "beam",num: 16,baseCost: 800,desc: "Add beams"},
    {id: "r1750",bucket: 2,group: 1,type: "item",classId: "metal_post",num: 32,baseCost: 400,desc: "Add metal bars"},
    {id: "r1762",bucket: 2,group: 1,type: "item",classId: "string",num: 371,baseCost: 53,desc: "String it up"},
    {id: "r1813",bucket: 2,group: 1,type: "item",classId: "general_building_permit",num: 1,baseCost: 500,desc: "Employ a permit"},
    {id: "r1768",bucket: 2,group: 2,type: "work",classId: "tinkertool",num: 55,baseCost: 23,desc: "Elevate the floor",classIds: ["tinkertool"],energy: 20,wear: 2,verb: "elevate",verbPast: "elevated",skill: ""},
  ]),
});

/** The floor job a tower with `floors` floors would run next, or null at MAX_FLOORS. */
export function floorJobFor(floors) {
  const n = Math.floor(Number(floors) || 0) + 1;
  if (n > TOWER_CONFIG.MAX_FLOORS || n < 3) return null;
  return `job_tower_floor_${n}`;
}

/* ------------------------------------------------------------------ */
/* Styles and exterior art                                              */
/* ------------------------------------------------------------------ */

/**
 * items/catalog_furniture.js add_furniture_29 (upgrade id, name, credits) and
 * the base chassis (getDefaultUpgradeConfig). The art rows are the recovered
 * SWF compositions: maincontainer scale, bottom_floor_h / floor_h from each
 * chassis .as and the named containers [x, y, scaleX, scaleY, depth]. Every
 * article choice (floor_ground_1..n, floor_top_*, extra_floor_*, deco_*) lives
 * in the generated js/home-tower-art.js (tools/tower-art/build.mjs).
 */
export const TOWER_STYLES = Object.freeze({
  base: { id: 'base', upgradeId: '', name: 'Tower', credits: 0 },
  tree: { id: 'tree', upgradeId: '620', name: 'Tree Tower', credits: 180 },
  quarry: { id: 'quarry', upgradeId: '621', name: 'Quarry Tower', credits: 90 },
  mushroom: { id: 'mushroom', upgradeId: '624', name: 'Mushroom Tower', credits: 120 },
  spaceship: { id: 'spaceship', upgradeId: '625', name: 'Spaceship Tower', credits: 150 },
  adobe: { id: 'adobe', upgradeId: '658', name: 'Adobe Tower', credits: 90 },
});

export const TOWER_ART_DIR = 'assets/sprites/home-tower/';
export const TOWER_ART = Object.freeze({
  base: { scale: [-0.8147888, 0.8147888], bottomFloorH: 165, floorH: 93,
    containers: {"floor_ground":[10.75,-7.9,1.02844,1.26611,1],"floor_1":[2,-166.8,1,1,3],"floor_2":[2,-259.9,1,1,5],"floor_3":[2,-353.9,1,1,7],"floor_4":[2,-447.9,1,1,9],"floor_5":[2,-540.9,1,1,11],"floor_6":[2,-633.85,1,1,13],"floor_7":[2,-727.9,1,1,15],"floor_top":[11.95,-821.05,1,1,17],"door":[-27.2,6.25,1,1,21],"deco_ground":[-267.8,-85.3,1,1,23],"deco_side":[109.55,-399.45,1,1,25]} },
  tree: { scale: [1, 1], bottomFloorH: 231, floorH: 73,
    containers: {"floor_ground":[-174.75,-128.25,1,1,1],"floor_1":[-105.85,-203.8,1,1,3],"floor_2":[-105.85,-276.8,1,1,5],"floor_3":[-105.85,-349.8,1,1,7],"floor_4":[-106.85,-422.8,1,1,9],"floor_5":[-106.85,-495.8,1,1,11],"floor_6":[-106.85,-568.8,1,1,13],"floor_7":[-106.85,-641.8,1,1,15],"floor_top":[-147.9,-742.95,1,1,17],"deco_side":[-19.7,-249.15,1,1,19],"deco_ground":[-52.35,-17.85,1,1,21],"door":[52.6,1.35,0.77271,0.77049,23]} },
  quarry: { scale: [-0.8147888, 0.8147888], bottomFloorH: 123, floorH: 93,
    containers: {"floor_ground":[10.45,4,1,1,1],"floor_1":[2,-128.05,1,1,3],"floor_2":[1.75,-220.85,1,1,5],"floor_3":[2,-315.15,1,1,7],"floor_4":[2,-409.15,1,1,9],"floor_5":[2,-502.15,1,1,11],"floor_6":[2,-595.1,1,1,13],"floor_7":[2,-689.15,1,1,15],"floor_top":[11.95,-782.3,1,1,17],"door":[-30.7,39.3,1,1,19],"deco_ground":[-267.8,-85.3,1,1,21],"deco_side":[109.55,-360.7,1,1,23]} },
  mushroom: { scale: [1, 1], bottomFloorH: 233, floorH: 74,
    containers: {"floor_ground":[-222.95,-165.5,1,1,1],"floor_1":[-147.05,-235.05,1,1,3],"floor_2":[-147.05,-309.05,1,1,5],"deco_side":[-61.9,-279.4,1,1,7],"deco_ground":[-101.55,-55.1,1,1,9],"door":[9.4,-29.5,0.77271,0.77049,25],"floor_3":[-147.05,-383.05,1,1,13],"floor_4":[-147.05,-457.05,1,1,15],"floor_5":[-147.05,-531.05,1,1,17],"floor_6":[-147.05,-605.05,1,1,19],"floor_7":[-147.05,-679.05,1,1,21],"floor_top":[-147.05,-753.05,1,1,23]} },
  spaceship: { scale: [-0.8147888, 0.8147888], bottomFloorH: 126, floorH: 86,
    containers: {"floor_ground":[10.45,4,1,1,1],"floor_1":[2,-128.05,1,1,3],"floor_2":[2,-214.05,1,1,5],"floor_3":[2,-300.05,1,1,7],"floor_4":[2,-386.05,1,1,9],"floor_5":[2,-472.05,1,1,11],"floor_6":[2,-558.05,1,1,13],"floor_7":[2,-644.05,1,1,15],"door":[-43.05,-1.05,1,1,17],"deco_ground":[-267.8,-85.3,1,1,19],"floor_top":[12.85,-729.6,1,1,21],"deco_side":[109.55,-360.7,1,1,23]} },
  adobe: { scale: [1, 1], bottomFloorH: 211, floorH: 73,
    containers: {"floor_ground":[-160.05,-122.4,1,1,1],"floor_1":[-128.05,-187.1,1,1,3],"deco_side":[96.95,-205.7,1,1,5],"floor_2":[-128.05,-260.1,1,1,7],"floor_3":[-128.05,-333.1,1,1,9],"floor_4":[-128.05,-406.1,1,1,11],"floor_5":[-128.05,-479.1,1,1,13],"floor_6":[-128.05,-552.1,1,1,15],"floor_7":[-128.05,-625.1,1,1,17],"floor_top":[-133.05,-722.1,1,1,19],"deco_ground":[-53.4,-7.9,1,1,21],"door":[30.4,2.9,0.77271,0.77049,23]} },
});

/* ------------------------------------------------------------------ */
/* Exterior choices (Customize)                                          */
/* ------------------------------------------------------------------ */

/**
 * The parts an owner picks, in the client's row order
 * (furniture_tower_chassis*.as config_option_names_sort, labels from
 * config_option_names). floor_N rows show only up to the extra floors the
 * Tower has (initializehead pushes the others onto user_config_exclusions),
 * deco_side only with at least required_extra_floors_for_deco_side (1)
 * extra floor (ConfigOption.populateConfigChoicesForItemstack).
 */
export const TOWER_CONFIG_ROWS = Object.freeze([
  { key: 'floor_top', part: 'floor_top', label: 'Top Floor' },
  ...[7, 6, 5, 4, 3, 2, 1].map((n) => ({ key: `floor_${n}`, part: 'extra_floor', floor: n, label: `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} Floor` })),
  { key: 'floor_ground', part: 'floor_ground', label: 'Ground Floor' },
  { key: 'deco_ground', part: 'deco_ground', label: 'Ground Floor Deco' },
  { key: 'deco_side', part: 'deco_side', label: 'Side Deco' },
].map((r) => Object.freeze(r)));
const CONFIG_KEYS = TOWER_CONFIG_ROWS.map((r) => r.key);

/**
 * Each style's starting config: items/catalog_furniture.js add_furniture_29
 * (Quarry tops with 3, Mushroom's ground deco is 2, Spaceship's side deco 2,
 * Adobe's top 2) over getDefaultUpgradeConfig (all 1) for the base Tower.
 * Changing style starts from that style's config, as the client's upgrade
 * picker did; floors the catalog leaves out default to 1 (initializehead).
 */
export const TOWER_DEFAULT_CONFIG = Object.freeze({
  base: Object.freeze({}),
  tree: Object.freeze({}),
  quarry: Object.freeze({ floor_top: 3 }),
  mushroom: Object.freeze({ deco_ground: 2 }),
  spaceship: Object.freeze({ deco_side: 2 }),
  adobe: Object.freeze({ floor_top: 2 }),
});

/** How many choices a config key has for a style. */
export function configChoices(styleId, key) {
  const counts = TOWER_PART_CHOICES[styleId] || TOWER_PART_CHOICES.base;
  const row = TOWER_CONFIG_ROWS.find((r) => r.key === key);
  return row ? counts[row.part] || 1 : 0;
}

/** A full, valid config for a style: every key 1..choices, defaults filled in. */
export function normalizeTowerConfig(styleId, seed = {}) {
  const style = TOWER_STYLES[styleId] ? styleId : 'base';
  const def = TOWER_DEFAULT_CONFIG[style] || {};
  const src = seed && typeof seed === 'object' ? seed : {};
  const out = {};
  for (const key of CONFIG_KEYS) {
    const max = configChoices(style, key);
    const v = Math.floor(Number(src[key]));
    out[key] = Number.isInteger(v) && v >= 1 && v <= max ? v : Math.min(max, def[key] || 1);
  }
  return out;
}

/** The config rows the Customize panel shows for a Tower with `extra` extra floors. */
export function towerConfigRows(styleId, extra = 0) {
  const n = Math.max(0, Math.min(7, Math.floor(Number(extra) || 0)));
  return TOWER_CONFIG_ROWS
    .filter((r) => (r.floor ? r.floor <= n : r.key !== 'deco_side' || n >= 1))
    .map((r) => ({ ...r, choices: configChoices(styleId, r.key) }));
}

/** ConfiggerChoiceElementUI prev / next: step one choice and wrap around. */
export function stepConfig(styleId, config, key, dir) {
  const max = configChoices(styleId, key);
  if (!max) return config;
  const cur = Math.floor(Number(config?.[key])) || 1;
  const next = ((cur - 1 + (dir < 0 ? -1 : 1)) % max + max) % max + 1;
  return { ...normalizeTowerConfig(styleId, config), [key]: next };
}

/** The client's Randomize button: a random choice for every row. */
export function randomTowerConfig(styleId, rand = Math.random) {
  const out = {};
  for (const key of CONFIG_KEYS) out[key] = 1 + Math.floor(rand() * configChoices(styleId, key));
  return normalizeTowerConfig(styleId, out);
}

/** The article a style draws for a part and choice ([file, ox, oy, w, h] or null). */
export function towerArticle(styleId, part, choice = 1) {
  const list = (TOWER_VARIANT_ART[styleId] || TOWER_VARIANT_ART.base)[part] || [];
  return list[Math.max(1, Math.floor(Number(choice)) || 1) - 1] || null;
}

/**
 * initializehead(): the chassis articles for a style, extra-floor count and
 * config, in depth order, as sprite placements relative to the item's foot:
 * { file, anchorX, anchorY, x, y, scaleX, scaleY, depth, part }.
 * floor_ground_<n> and door_<n> share the ground floor's choice;
 * floor_top_container.y = -(bottom_floor_h + floor_h * extra_floors);
 * deco_side shows only with extra floors; floors 1..7 hold extra_floor_<floor_N>.
 * facingRight false mirrors the whole chassis about its foot, as
 * LocationItemstackView._faceLeft (view_holder.scaleX = -1) did.
 */
export function composeTower(styleId, extraFloors = 0, config = null, facingRight = true) {
  const style = TOWER_ART[styleId] ? styleId : 'base';
  const art = TOWER_ART[style];
  const cfg = normalizeTowerConfig(style, config || {});
  const extra = Math.max(0, Math.min(7, Math.floor(Number(extraFloors) || 0)));
  const [sx0, my] = art.scale;
  const mx = facingRight === false ? -sx0 : sx0;
  const ops = [];
  const place = (part, containerKey, override = {}) => {
    const choice = part === 'door' ? cfg.floor_ground : part === 'extra_floor' ? cfg[containerKey] : cfg[part];
    const p = towerArticle(style, part, choice);
    const c = art.containers[containerKey];
    if (!p || !c) return;
    const [file, ox, oy, w, h] = p;
    const [cx, cy0, sx, sy, depth] = c;
    const cy = override.y ?? cy0;
    ops.push({
      part: containerKey,
      file,
      anchorX: ox / w,
      anchorY: oy / h,
      w,
      h,
      x: mx * cx,
      y: my * cy,
      scaleX: mx * sx,
      scaleY: my * sy,
      depth,
    });
  };
  place('floor_ground', 'floor_ground');
  for (let i = 1; i <= extra; i += 1) place('extra_floor', `floor_${i}`);
  place('floor_top', 'floor_top', { y: -(art.bottomFloorH + art.floorH * extra) });
  if (extra > 0) place('deco_side', 'deco_side');
  place('deco_ground', 'deco_ground');
  place('door', 'door');
  return ops.sort((a, b) => a.depth - b.depth);
}

/** Bounding box of a composition (foot-relative), for hit areas and the camera. */
export function towerBounds(ops) {
  let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
  for (const op of ops) {
    const x0 = op.x - op.anchorX * op.w * op.scaleX;
    const x1 = x0 + op.w * op.scaleX;
    const y0 = op.y - op.anchorY * op.h * op.scaleY;
    const y1 = y0 + op.h * op.scaleY;
    l = Math.min(l, x0, x1);
    r = Math.max(r, x0, x1);
    t = Math.min(t, y0, y1);
    b = Math.max(b, y0, y1);
  }
  return Number.isFinite(l) ? { l, r, t, b, w: r - l, h: b - t } : { l: 0, r: 0, t: 0, b: 0, w: 0, h: 0 };
}

/* ------------------------------------------------------------------ */
/* Facing (Flip)                                                        */
/* ------------------------------------------------------------------ */

/**
 * furniture_tower_chassis instanceProps.facing_right "1" (furniture_base): a
 * new Tower faces right, which is the art as drawn. Flip turns it around:
 * the furniture_base `flip` verb ("Turn it around", sort_on 51) and the Flip
 * button the Customize panel puts after the part rows (ConfiggerUI.as
 * startWithConfigs "toss in the flip", ConfiggerChoiceElementUI.as flip_bt
 * label 'Flip' beside Randomize). The sign and the scaffolding behind it are
 * h_flipped with the chassis (ChassisManager.as
 * changeDirectionOnLocalItemstackTowerSign, getExtraConfig sign_sd), so they
 * sit mirrored at -delta_x but their text still reads left to right
 * (InLocationAnnouncementOverlay scaleX -1 inside the flipped view).
 */
export const TOWER_SIGN = Object.freeze({ dx: 8, dy: -150 });
/** The street spot the avatar steps out to beside the door (FancyDoor mirrors door_x about the foot). */
export const TOWER_DOOR_DX = 40;

/** Mirror a foot-relative x for the Tower's facing. */
export function towerFacingX(dx, facingRight = true) {
  return facingRight === false ? -dx : dx;
}

/** setFurnitureUserConfig facing_right: true faces right (the default). Returns the new facing. */
export function setTowerFacing(state, facingRight) {
  state.facingRight = facingRight !== false;
  return state.facingRight;
}

/** ConfiggerUI onElementChange 'flip': facing = left <-> right. */
export function flipTower(state) {
  return setTowerFacing(state, state.facingRight === false);
}

/**
 * QA / save forms of facing_right: true, 1, '1', 'right' face right;
 * false, 0, '0', 'left' face left; anything else is null (keep).
 */
export function parseTowerFacing(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const v = String(value ?? '').trim().toLowerCase();
  if (v === '1' || v === 'right' || v === 'true') return true;
  if (v === '0' || v === 'left' || v === 'false') return false;
  return null;
}

/** proto_furniture_tower_chassis.swf: three scenes named 3, 2, 1 on one 344 x 204 stage. */
export const PROTO_ART = Object.freeze({
  1: 'proto_1.webp',
  2: 'proto_2.webp',
  3: 'proto_3.webp',
  w: 344,
  h: 204,
  footY: 0.9,
});

/* ------------------------------------------------------------------ */
/* State                                                                */
/* ------------------------------------------------------------------ */

const whole = (v) => Math.max(0, Math.floor(Number(v) || 0));
const cleanId = (v) => String(v || '').replace(/[^a-z0-9_]/gi, '').slice(0, 40);

/** furniture_tower_chassis.setUserName: 25 chars through the client's regex. */
export function cleanTowerName(value) {
  return value ? String(value).substr(0, 25).replace(/[^a-z0-9/&\-!?.$()#@~+'",_\\ ]/gi, '') : '';
}

function cleanGot(job, got) {
  const out = {};
  const def = TOWER_JOBS[job];
  if (!def) return out;
  for (const r of def.requirements) {
    const n = Math.min(r.num, whole(got?.[r.id]));
    if (n) out[r.id] = n;
  }
  return out;
}

export function normalizeTowerState(seed = {}) {
  const src = seed && typeof seed === 'object' ? seed : {};
  const built = src.built === true;
  const floors = built
    ? Math.max(TOWER_CONFIG.START_FLOORS, Math.min(TOWER_CONFIG.MAX_FLOORS, whole(src.floors) || TOWER_CONFIG.START_FLOORS))
    : TOWER_CONFIG.START_FLOORS;
  const expanding = built && src.expanding === true && floors < TOWER_CONFIG.MAX_FLOORS;
  const floorLabels = {};
  for (const [k, v] of Object.entries(src.floorLabels || {})) {
    const idx = whole(k);
    const label = cleanTowerName(v);
    if (idx < TOWER_CONFIG.MAX_FLOORS && label) floorLabels[idx] = label;
  }
  return {
    built,
    builtAt: built ? whole(src.builtAt) : 0,
    floors,
    expanding,
    project: built ? {} : cleanGot(TOWER_JOB, src.project),
    expansion: expanding ? cleanGot(floorJobFor(floors), src.expansion) : {},
    style: TOWER_STYLES[src.style] ? src.style : 'base',
    // furniture_tower_chassis user_config: the chosen article per part.
    config: normalizeTowerConfig(TOWER_STYLES[src.style] ? src.style : 'base', src.config),
    // furn_config.facing_right (FurnitureConfig.as default true); saves from before Flip face right.
    facingRight: parseTowerFacing(src.facingRight) !== false,
    name: cleanTowerName(src.name),
    floorLabels,
    visited: src.visited === true,
    secrets: [...new Set((Array.isArray(src.secrets) ? src.secrets : []).map(cleanId).filter((id) => /^TowerSpot_\d\d$/.test(id)))].slice(0, 11),
    floor: Number.isInteger(src.floor) && src.floor >= 0 && src.floor <= floors ? src.floor : null,
  };
}

/**
 * The upgrade picker: a new style starts from its catalog config (the
 * current style keeps the owner's choices). Returns false for an unknown style.
 */
export function setTowerStyle(state, styleId) {
  if (!TOWER_STYLES[styleId]) return false;
  if (state.style !== styleId) {
    state.style = styleId;
    state.config = normalizeTowerConfig(styleId, {});
  }
  return true;
}

/** furniture_tower_chassis user_config for the current style, cleaned. */
export function setTowerConfig(state, config) {
  state.config = normalizeTowerConfig(state.style, config);
  return state.config;
}

export function createTowerState(seed = {}) {
  return normalizeTowerState(seed);
}

/* ------------------------------------------------------------------ */
/* Projects (quest.js job requirements, bucket / group gates)           */
/* ------------------------------------------------------------------ */

/** quest.js getCurrentReqGroup per bucket. */
function currentGroup(rows, bucket) {
  const groups = [...new Set(rows.filter((r) => r.bucket === bucket).map((r) => r.group))].sort((a, b) => a - b);
  let open = 1;
  for (const g of groups) {
    if (rows.filter((r) => r.bucket === bucket && r.group === g).every((r) => r.done)) open = g + 1;
  }
  return open;
}

/** Requirements of a project with progress and the open flag. */
export function projectRequirements(jobId, got = {}) {
  const def = TOWER_JOBS[jobId];
  if (!def) return [];
  const rows = def.requirements.map((r) => {
    const n = Math.min(r.num, whole(got[r.id]));
    return { ...r, need: r.num, got: n, done: n >= r.num };
  });
  for (const r of rows) r.open = !r.done && r.group <= currentGroup(rows, r.bucket);
  return rows;
}

/** quest.js get_percentage_complete: base-cost weighted, floored to 0.001. */
export function projectPercent(jobId, got = {}) {
  let total = 0;
  let have = 0;
  for (const r of projectRequirements(jobId, got)) {
    total += r.need * r.baseCost;
    have += r.got * r.baseCost;
  }
  return total ? Math.floor((have / total) * 1000) / 1000 : 0;
}

export function projectComplete(jobId, got = {}) {
  const rows = projectRequirements(jobId, got);
  return rows.length > 0 && rows.every((r) => r.done);
}

/** The scaffolding state the proto shows for a project's progress. */
export function protoArtState(perc) {
  if (perc >= PROTO_STATE_AT[1]) return 3;
  if (perc >= PROTO_STATE_AT[0]) return 2;
  return 1;
}

/** The project the tower runs now: the cultivation, a floor, or none. */
export function activeProject(state) {
  if (!state) return null;
  if (!state.built) return { jobId: TOWER_JOB, got: state.project, key: 'project' };
  if (state.expanding) {
    const jobId = floorJobFor(state.floors);
    return jobId ? { jobId, got: state.expansion, key: 'expansion' } : null;
  }
  return null;
}

/**
 * quest.js inc_item: put up to `count` of one item into the first open
 * requirement for it. Mutates `got` and `inv`.
 */
export function contributeItems(jobId, got, classId, count, inv) {
  const req = projectRequirements(jobId, got).find((r) => r.type === 'item' && r.classId === classId && r.open);
  if (!req) return { ok: false, msg: 'Nothing here needs that right now.' };
  const have = whole(inv?.[classId]);
  const amount = Math.min(whole(count), have, req.need - req.got);
  if (amount <= 0) return { ok: false, msg: `You have no ${classId.replace(/_/g, ' ')} to give.` };
  inv[classId] = have - amount;
  got[req.id] = req.got + amount;
  return { ok: true, amount, req, baseCost: amount * req.baseCost, complete: projectComplete(jobId, got) };
}

/**
 * Can the player do one unit of a work requirement? (items/include/jobs.js
 * startJobWork: a working tool from class_ids, energy above the unit cost.)
 * ctx: { inv, energy, toolOk(tool, wear) }
 */
export function workCheck(jobId, got, rid, ctx = {}) {
  const req = projectRequirements(jobId, got).find((r) => r.id === rid && r.type === 'work');
  if (!req) return { ok: false, msg: 'There is no such work.' };
  if (!req.open) return { ok: false, req, msg: req.done ? "There's no more work left to do." : 'Finish the earlier steps first.' };
  const tools = req.classIds?.length ? req.classIds : [req.classId];
  const held = tools.filter((t) => whole(ctx.inv?.[t]) > 0);
  const tool = held.find((t) => (ctx.toolOk ? ctx.toolOk(t, req.wear) : true)) || null;
  if (!held.length) return { ok: false, req, msg: `You need a ${tools[0].replace(/_/g, ' ')}.` };
  if (!tool) return { ok: false, req, msg: "You don't have the necessary working tool." };
  if (whole(ctx.energy) <= req.energy) return { ok: false, req, tool, msg: "You don't have enough energy to continue." };
  return { ok: true, req, tool };
}

/** One 1.5 s unit: energy, tool wear (ctx.useTool), +1 on the requirement. */
export function applyWorkUnit(jobId, got, rid, ctx = {}) {
  const check = workCheck(jobId, got, rid, { ...ctx, energy: ctx.pc?.energy });
  if (!check.ok) return check;
  const { req, tool } = check;
  ctx.pc.energy = Math.max(0, (Number(ctx.pc.energy) || 0) - req.energy);
  const wear = ctx.useTool ? ctx.useTool(tool, req.wear) : null;
  got[req.id] = req.got + 1;
  return { ok: true, req, tool, wear, energy: req.energy, left: req.need - req.got - 1, complete: projectComplete(jobId, got) };
}

/* ------------------------------------------------------------------ */
/* Building and floors                                                  */
/* ------------------------------------------------------------------ */

/** furniture_tower_chassis.onJobComplete: the tower exists, two floors. */
export function finishTower(state, now = Date.now()) {
  if (state.built) return { ok: false, reason: 'built' };
  if (!projectComplete(TOWER_JOB, state.project)) return { ok: false, reason: 'incomplete' };
  Object.assign(state, { built: true, builtAt: whole(now), floors: TOWER_CONFIG.START_FLOORS, expanding: false, project: {}, expansion: {} });
  return { ok: true, floors: state.floors };
}

/** tower.js tower_start_expand. */
export function startExpansion(state) {
  if (!state.built) return { ok: 0, error: 'not_built' };
  if (state.expanding) return { ok: 0, error: 'already_building' };
  if (state.floors >= TOWER_CONFIG.MAX_FLOORS) return { ok: 0, error: 'max_size_already' };
  state.expanding = true;
  state.expansion = {};
  return { ok: 1, jobId: floorJobFor(state.floors) };
}

/** tower.js tower_end_expand (from tower_expander.onJobComplete). */
export function endExpansion(state) {
  if (!state.expanding) return { ok: false };
  if (!projectComplete(floorJobFor(state.floors), state.expansion)) return { ok: false, reason: 'incomplete' };
  state.floors += 1;
  state.expanding = false;
  state.expansion = {};
  return { ok: true, floors: state.floors };
}

/** tower.js tower_get_expand_costs: floors left, locked while building, next project's totals. */
export function expandCosts(state) {
  const count = Math.max(TOWER_CONFIG.MAX_FLOORS - state.floors, 0);
  const out = { count, locked: Boolean(state.expanding), items: {}, work: {} };
  const jobId = count < 1 ? null : floorJobFor(state.floors);
  for (const r of TOWER_JOBS[jobId]?.requirements || []) {
    if (r.type === 'item') out.items[r.classId] = r.num;
    if (r.type === 'work') out.work[r.classId] = r.num;
  }
  return out;
}

/** furniture_tower_chassis setExtraFloors: floors between the top and ground. */
export function extraFloors(state) {
  return state?.built ? Math.max(0, state.floors - 2) : 0;
}

/** tower.js tower_set_floor_name (index 0 is the 'exit' connect). */
export function setFloorLabel(state, idx, label) {
  const i = whole(idx);
  if (!state.built || i >= state.floors + (state.expanding ? 1 : 0)) return { ok: 0, error: 'bad_connect_id' };
  const clean = cleanTowerName(label);
  if (clean) state.floorLabels[i] = clean;
  else delete state.floorLabels[i];
  return { ok: 1, label: clean };
}

/**
 * Elevator rows (tower_build_elevator connects): floors, then the construction
 * floor. Default names follow the column's marks (L, 1, 2, ...), so the floor
 * marked 1 is "Floor 1".
 */
export function elevatorStops(state) {
  if (!state?.built) return [];
  const rows = [];
  for (let i = 0; i < state.floors; i += 1) {
    rows.push({ index: i, mark: elevatorMark(i), label: state.floorLabels[i] || (i === 0 ? 'Ground Floor' : `Floor ${i}`), construction: false });
  }
  if (state.expanding) {
    const i = state.floors;
    rows.push({ index: i, mark: elevatorMark(i), label: state.floorLabels[i] || 'Under Construction', construction: true });
  }
  return rows;
}

/**
 * tower_move_players: where the owner lands after a rebuild. Starting a floor
 * (tower_start_expand) or finishing one (tower_end_expand) reloads the owner
 * on the top row (the construction floor while expanding) once the tower has
 * more than two floors or is expanding; everyone else, and a two-floor tower,
 * goes to the ground floor.
 */
export function ownerReloadFloor(state) {
  if (!state?.built) return null;
  if (state.floors > 2 || state.expanding) return state.floors - 1 + (state.expanding ? 1 : 0);
  return 0;
}

/** tower_build_expansion: clamp an x to the construction floor's walls. */
export function clampToExpansion(x, inset = 12) {
  return Math.max(TOWER_GEO.expansionLeft + inset, Math.min(TOWER_GEO.expansionRight - inset, x));
}

export function towerLabel(state) {
  return state?.name ? `${state.name}` : 'Your Tower';
}

/* ------------------------------------------------------------------ */
/* Jethimadh Tower Base secrets (location.js handleTowerSecrets)        */
/* ------------------------------------------------------------------ */

export const TOWER_SECRETS_GROUP = 'tower_secrets';
export const TOWER_SECRETS_BADGE = 'tower_secret_areas';
export const TOWER_SECRETS_TOTAL = 11;
/** TowerSpot_03 also paid stats_add_currants(50). */
export const TOWER_SECRET_CURRANTS = Object.freeze({ TowerSpot_03: 50 });
const NUMBERS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh'];

/** The vp_overlay text (none on the eleventh: the badge speaks then). */
export function towerSecretText(count) {
  if (count === TOWER_SECRETS_TOTAL || !NUMBERS[count]) return '';
  return `You have found the ${NUMBERS[count]} of eleven secret spots in the Base of Jethimadh Tower. Nice Work!`;
}

/**
 * Seven TowerSpot hitboxes survive in the archived Base streets (they come
 * with the street's `boxes`). TowerSpot_05, 09, 10 and 11 sat in Room 15 and
 * the Ventilation Room, which the snapshot lost; js/tower-rooms.js rebuilds
 * both rooms and their spots (world coordinates, bottom-centre, the source's
 * 200 x 200 box), and its street JSON carries them as `reconstructed` boxes.
 */
export const RECONSTRUCTED_TOWER_SPOTS = TOWER_ROOM_SPOTS;

/** Every TowerSpot box on a street, in street screen coordinates. */
export function towerSpotsFor(street) {
  if (!street) return [];
  const out = (street.boxes || [])
    .filter((b) => /^TowerSpot_\d\d$/.test(b?.id || ''))
    .map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w || 200, h: b.h || 200, source: b.reconstructed ? 'reconstructed' : 'archive' }));
  const { l = 0, t = 0 } = street.bounds || {};
  for (const s of RECONSTRUCTED_TOWER_SPOTS) {
    if (s.tsid !== street.tsid || out.some((b) => b.id === s.id)) continue;
    out.push({ id: s.id, x: s.wx - l, y: s.wy - t, w: s.w, h: s.h, source: 'reconstructed' });
  }
  return out;
}

/** Avatar collision height: the client tested the avatar's box, not its feet. */
export const AVATAR_HIT_H = 100;

/** Hitbox collision: the source's bottom-centre box against the avatar's box. */
export function inTowerSpot(box, x, y, h = AVATAR_HIT_H) {
  return Math.abs(x - box.x) <= box.w / 2 && y - h <= box.y && y >= box.y - box.h;
}
