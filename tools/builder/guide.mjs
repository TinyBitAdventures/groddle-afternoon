/**
 * LEVEL BUILDER (spec 8.6): what an agent needs to know, in one place. The builder worker serves it
 * at GET …/admin/builder/guide and the CLI prints it (`cli.mjs guide`). Every number comes from the
 * module the validator and the game use (avatar-step.js, reach-graph.js, validate.js, ops.js, the
 * style profiles), so the card cannot drift from what is checked.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_DIR } from '../repos.mjs';
import { GRAVITY, JUMP_SPEED, WALK_MAX, FLOOR_ACCEL, AIR_ACCEL_RATIO, STREET_PHYSICS_TERMINAL_VY, AVATAR_BODY_H, GROUND_SNAP, NORMAL_BUFF } from '../../public/js/avatar-step.js?v=c04c7c76';
import { RULES, LIMITS, MIN_VIEW, PARALLAX_VIEW, LICENCES, plainApex } from '../../public/js/builder/validate.js?v=f15a39d0';
import { REACH_LIMITS, POST_REACH_X, POST_BELOW, DOOR_REACH_X, TIGHT_MARGIN, streetWorld, jumpArc } from '../../public/js/builder/reach-graph.js?v=6f7512af';
import { OP_NAMES } from '../../public/js/builder/ops.js?v=28c0d569';
import { LAYER_ROLES } from '../../public/js/builder/layer-role.js?v=e585f610';
import { POPULATION_CLASSES } from '../../public/js/builder/zone.js?v=9608addf';
import { SCOPES, RATES, RENDER } from './limits.mjs';

/** Spec 2.1: where each kind of thing is measured. */
export const SPACES = Object.freeze([
  { what: 'platforms, barriers, ladders, signposts', space: 'world', anchor: 'y up is negative (bounds.b about 0, bounds.t about -1000); line ends; a barrier\'s top y and h down; a ladder\'s bottom-centre and h up; a signpost\'s bottom-centre' },
  { what: 'middleground decos', space: 'world', anchor: 'bottom-centre; w and h are the drawn size; r in degrees; flip mirrors about the anchor' },
  { what: 'decos on every other layer', space: 'layer-local, 0..w by 0..h', anchor: 'bottom-centre, as middleground decos' },
  { what: 'doors, boxes, connect arrive, finding where (space "screen")', space: 'screen: x - bounds.l, y - bounds.t', anchor: 'bottom-centre' },
]);

/** The flat running jump, stepped with the validator's stepper (198 px measured in the game). */
export function runningJumpLength() {
  const street = { tsid: 'GZGUIDE', bounds: { l: 0, r: 3000, t: -1000, b: 0 }, platforms: [{ id: 'plat_1', x1: 0, y1: 0, x2: 3000, y2: 0, pc_perm: -1 }], layers: [{ id: 'middleground', name: 'middleground', z: 0, decos: [] }] };
  const arc = jumpArc(streetWorld(street), { x: 500, y: 1000 }, { dir: 1, run: true });
  return arc.landed ? Math.round(arc.landed.x - 500) : null;
}

let cached = null;

/** The guide (spec 8.6). */
export function builderGuide() {
  if (cached) return cached;
  const profiles = JSON.parse(readFileSync(join(GAME_DIR, 'public/assets/content/style-profiles.json'), 'utf8'));
  const world = profiles.profiles.default;
  const roles = Object.fromEntries(LAYER_ROLES.map((r) => {
    const b = world.roles[r] || {};
    return [r, { z: b.z, widthOfStreet: b.w, decoW: b.decoW, decoH: b.decoH, densityPer1000px: b.density, filters: Object.fromEntries(Object.entries(b.filters || {}).map(([k, v]) => [k, v.band])) }];
  }));
  cached = {
    format: 'groddle-builder-guide/1',
    read: 'Bands are [p10, median, p90] over the 1,460 shipped streets; a z band is [median, min, max]. Style bands are advice (info and warn), never a block.',
    spaces: SPACES,
    street: { size: world.size, minView: MIN_VIEW, parallaxView: PARALLAX_VIEW, max: { w: LIMITS.width, h: LIMITS.height }, tsid: 'GZ + 13 capitals or digits', hubIds: '900-999 for new hubs' },
    jump: {
      fps: 60,
      gravity: GRAVITY,
      jumpSpeed: JUMP_SPEED,
      walkMax: WALK_MAX,
      floorAccel: FLOOR_ACCEL,
      airAccelRatio: AIR_ACCEL_RATIO,
      terminalFall: Math.round(STREET_PHYSICS_TERMINAL_VY * 100) / 100,
      bodyHeight: AVATAR_BODY_H,
      groundSnap: GROUND_SNAP,
      plainApex: Math.round(plainApex(NORMAL_BUFF) * 10) / 10,
      runningJump: runningJumpLength(),
      rule: 'Keep a ledge you must jump to at most 100 px over the floor you jump from (8 px of margin under the 105 px apex), or add a ladder.',
    },
    reach: { signpostX: POST_REACH_X, signpostBelow: POST_BELOW, doorX: DOOR_REACH_X, tightMargin: TIGHT_MARGIN, limits: REACH_LIMITS },
    layerRoles: roles,
    flipped: world.flipped,
    rotated: world.rotated,
    ops: OP_NAMES,
    population: POPULATION_CLASSES,
    rules: Object.entries(RULES).map(([id, [severity, title]]) => ({ id, severity, title })),
    severities: { fatal: 'blocks play-test, render and publish', error: 'blocks publish', warn: 'blocks publish until acknowledged or waived', info: 'blocks nothing' },
    licences: LICENCES,
    limits: { ...LIMITS, opsPerBatch: 500, render: RENDER, ratesPerMinute: RATES },
    auth: {
      header: 'X-Groddle-Builder: <key id>.<unix seconds>.<16 hex nonce>.<base64url HMAC-SHA256>',
      signs: '"groddle-builder/1\\n" METHOD "\\n" route "\\n" query "\\n" seconds "\\n" nonce "\\n" hex(sha256(body))',
      window: 60,
      nonce: 'each nonce once (kept 2 minutes)',
      scopes: SCOPES,
    },
  };
  return cached;
}
