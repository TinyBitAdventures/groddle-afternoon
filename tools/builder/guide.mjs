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
import { RULES, LIMITS, MIN_VIEW, PARALLAX_VIEW, LICENCES, plainApex } from '../../public/js/builder/validate.js?v=1705a409';
import { REACH_LIMITS, POST_REACH_X, POST_BELOW, DOOR_REACH_X, TIGHT_MARGIN, streetWorld, jumpArc } from '../../public/js/builder/reach-graph.js?v=6f7512af';
import { OP_NAMES } from '../../public/js/builder/ops.js?v=acf30407';
import { LAYER_ROLES } from '../../public/js/builder/layer-role.js?v=e585f610';
import { POPULATION_CLASSES } from '../../public/js/builder/zone.js?v=6a3db28e';
import { SCOPES, RATES, RENDER } from './limits.mjs';
import { EFFECT_KINDS, EFFECT_WORDS, EFFECT_DEFAULTS, EFFECT_RANGES, EFFECT_LIMITS, RUMBLE_RANGES, RUMBLE_DEFAULTS, RUMBLE_SOUND } from '../../public/js/street-effects.js?v=e427650f';

/** Spec 2.1: where each kind of thing is measured. */
export const SPACES = Object.freeze([
  { what: 'platforms, barriers, ladders, signposts', space: 'world', anchor: 'y up is negative (bounds.b about 0, bounds.t about -1000); line ends; a barrier\'s top y and h down; a ladder\'s bottom-centre and h up; a signpost\'s bottom-centre' },
  { what: 'middleground decos', space: 'world', anchor: 'bottom-centre; w and h are the drawn size; r in degrees; flip mirrors about the anchor' },
  { what: 'decos on every other layer', space: 'layer-local, 0..w by 0..h', anchor: 'bottom-centre, as middleground decos' },
  { what: 'effects (emitters)', space: 'as a deco on the same layer: world on the middleground, layer-local elsewhere', anchor: 'the vent\'s mouth: particles start there and rise (lava flies up and falls back)' },
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
    effects: {
      what: 'Zone ambient effects (spec 15 Q12): emitters placed like decos, and a street-wide earthquake rumble. Zone streets only, solo only; prefers-reduced-motion turns the shake off and calms the emitters.',
      kinds: Object.fromEntries(EFFECT_KINDS.map((k) => [k, { words: EFFECT_WORDS[k], defaults: EFFECT_DEFAULTS[k] }])),
      fields: { rate: 'particles a second while it puffs', size: 'a particle\'s size in px', height: 'how high the plume rises or the squirt flies, px', spread: 'degrees either side of straight up', period: '[min, max] seconds from one burst\'s start to the next; leave it out to never stop', burst: 'seconds a burst lasts (at most the shortest period)', sprite: 'optional particle art (library or gz_); the built-in soft shape otherwise', layer: 'which layer it draws with (just above that layer\'s decos)' },
      ranges: EFFECT_RANGES,
      rumble: { ranges: RUMBLE_RANGES, defaults: RUMBLE_DEFAULTS, sound: RUMBLE_SOUND, fields: { every: '[min, max] seconds between rumbles', duration: 'seconds a rumble lasts', strength: 'the camera shake in px', sound: 'false for a silent rumble' } },
      limits: EFFECT_LIMITS,
      cli: ['effect --street k --kind steam --x 0 --y -60', 'set <street>/fx_1 rate=4 period=[5,9]', 'rm <street>/fx_1', 'rumble --street k --every 14,30 --duration 1.6 --strength 6', 'effects --street k'],
      ops: 'emitter.add {street, emitter: {kind, layer, x, y, ...}}, emitter.set {street, id, set}, emitter.remove {street, id}; street.set {street, set: {rumble}}',
    },
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
