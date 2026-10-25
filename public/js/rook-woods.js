/**
 * Prove Your Rook-Fighting Mettle.
 *
 * Source anchors:
 * - quests/rook_egg_smash.js
 * - items/rook_egg.js
 * - items/crusher.js
 * - supplied Rooks' Woods alpha runthrough
 *
 * The production instance geometry was not published with the locations dump,
 * so the runtime uses a clean authored route while preserving the source quest
 * contract, two-minute timer, Crusher cycle, tool gates, and four-hit Egg smash.
 */

import { canUseTool } from './tools.js?v=tools-3';

export const ROOK_QUEST_ID = 'rook_egg_smash';
export const ROOK_WOODS_STREET_ID = 'LLI1AD8LUCH109E';
export const ROOK_WOODS_DURATION_MS = 2 * 60 * 1000;
export const ROOK_EGG_INITIAL_STATE = 5;
export const ROOK_EGG_SMASHED_STATE = 1;

export const ROOK_REWARD = Object.freeze({
  xp: 1000,
  currants: 500,
  mood: 200,
  energy: 50,
});

export const ROOK_TOOL_PROFILES = Object.freeze({
  pick: Object.freeze({
    label: 'Pick',
    healthTickMs: 1200,
    durationMs: 4800,
    wear: 1,
  }),
  fancy_pick: Object.freeze({
    label: 'Fancy Pick',
    healthTickMs: 1200,
    durationMs: 4800,
    wear: 1,
  }),
  hatchet: Object.freeze({
    label: 'Hatchet',
    healthTickMs: 830,
    durationMs: 3320,
    wear: 1,
  }),
});

/**
 * Clean-room hazard layout derived from the route cadence in the supplied
 * footage. Motion values follow crusher.js: wait, one-second strike, wait,
 * then one second per ratchet step back to the start.
 */
export const ROOK_CRUSHERS = Object.freeze([
  Object.freeze({
    id: 'root_drop',
    axis: 'y',
    x: 430,
    y: 510,
    travel: 205,
    topDelayMs: 1200,
    bottomDelayMs: 650,
    ratchetSteps: 3,
    phaseOffsetMs: 0,
    size: 118,
  }),
  Object.freeze({
    id: 'branch_sweep',
    axis: 'x',
    x: 790,
    y: 593,
    travel: 190,
    topDelayMs: 1550,
    bottomDelayMs: 700,
    ratchetSteps: 3,
    phaseOffsetMs: 1350,
    size: 112,
  }),
  Object.freeze({
    id: 'high_drop',
    axis: 'y',
    x: 1215,
    y: 320,
    travel: 220,
    topDelayMs: 950,
    bottomDelayMs: 700,
    ratchetSteps: 4,
    phaseOffsetMs: 2750,
    size: 116,
  }),
  Object.freeze({
    id: 'nest_sweep',
    axis: 'x',
    x: 1635,
    y: 718,
    travel: 205,
    topDelayMs: 1350,
    bottomDelayMs: 600,
    ratchetSteps: 3,
    phaseOffsetMs: 700,
    size: 120,
  }),
]);

export const ROOK_FOREST_ART_ID = 'clean-layered-silhouettes';

export const ROOK_FOREST_DEPTH_LAYERS = Object.freeze([
  Object.freeze({
    id: 'distant',
    zIndex: -945,
    tint: 0x3f473f,
    alpha: 0.42,
  }),
  Object.freeze({
    id: 'midground',
    zIndex: -835,
    tint: 0x181d18,
    alpha: 0.92,
  }),
  Object.freeze({
    id: 'canopy',
    zIndex: -150,
    tint: 0x090c0a,
    alpha: 0.98,
  }),
  Object.freeze({
    id: 'roots',
    zIndex: -35,
    tint: 0x0a0d0a,
    alpha: 1,
  }),
]);

function forestDeco(layer, asset, x, y, scale, extras = {}) {
  return Object.freeze({
    layer,
    asset,
    x,
    y,
    scaleX: extras.flip ? -scale : scale,
    scaleY: scale,
    anchorX: extras.anchorX ?? 0.5,
    anchorY: extras.anchorY ?? 1,
    rotation: extras.rotation ?? 0,
    alpha: extras.alpha ?? 1,
  });
}

/**
 * Deterministic clean-asset composition guided by the alpha recording's
 * defining silhouette: thin distant trunks, crooked middle trees, a low
 * overhanging canopy, and roots that visually bind the authored walkable path.
 * These are recovered CC0 decos, never pixels extracted from the recording.
 */
export const ROOK_FOREST_DECOS = Object.freeze([
  forestDeco('distant', 'heights_tree_bare_1.png', 80, 810, 0.25),
  forestDeco('distant', 'heights_tree_bare_2.png', 340, 808, 0.41, { flip: true }),
  forestDeco('distant', 'tree_bare_thin_1.png', 570, 812, 0.34),
  forestDeco('distant', 'heights_tree_bare_3.png', 815, 808, 0.45),
  forestDeco('distant', 'heights_tree_bare_1.png', 1060, 810, 0.25, { flip: true }),
  forestDeco('distant', 'heights_tree_bare_2.png', 1330, 808, 0.4),
  forestDeco('distant', 'tree_bare_thin_1.png', 1570, 812, 0.33, { flip: true }),
  forestDeco('distant', 'heights_tree_bare_3.png', 1810, 808, 0.44, { flip: true }),
  forestDeco('distant', 'heights_tree_bare_1.png', 2055, 810, 0.26),
  forestDeco('distant', 'heights_tree_bare_2.png', 2290, 808, 0.39, { flip: true }),

  forestDeco('midground', 'tree_bare_bunch_1.png', 230, 824, 0.46),
  forestDeco('midground', 'heights_tree_bare_4.png', 620, 808, 0.35, { flip: true }),
  forestDeco('midground', 'tree_bare_tall_1.png', 930, 816, 0.32),
  forestDeco('midground', 'tree_bare_bunch_1.png', 1250, 824, 0.49, { flip: true }),
  forestDeco('midground', 'heights_tree_bare_4.png', 1640, 808, 0.34),
  forestDeco('midground', 'tree_bare_tall_1.png', 1955, 816, 0.33, { flip: true }),
  forestDeco('midground', 'tree_bare_bunch_1.png', 2240, 824, 0.44),

  forestDeco('canopy', 'hang_branch3.png', 235, 14, 0.82, {
    anchorY: 0,
    rotation: -0.08,
  }),
  forestDeco('canopy', 'hang_branch1.png', 790, -10, 0.76, {
    anchorY: 0,
    flip: true,
    rotation: 0.1,
  }),
  forestDeco('canopy', 'hang_branch3.png', 1505, 8, 0.86, {
    anchorY: 0,
    flip: true,
    rotation: 0.06,
  }),
  forestDeco('canopy', 'hang_branch1.png', 2170, -8, 0.78, {
    anchorY: 0,
    rotation: -0.1,
  }),
  forestDeco('canopy', 'tree_plane_branch_01c_g1.png', -35, 265, 1.55, {
    anchorX: 0,
    anchorY: 0.5,
    rotation: -0.08,
  }),
  forestDeco('canopy', 'tree_plane_branch_01b_g1.png', 795, 220, 1.7, {
    anchorX: 0,
    anchorY: 0.5,
    rotation: 0.08,
  }),
  forestDeco('canopy', 'tree_plane_branch_01c_g1.png', 2290, 225, 1.5, {
    anchorX: 0,
    anchorY: 0.5,
    flip: true,
    rotation: -0.06,
  }),

  forestDeco('roots', 'tree_base_root_1.png', 535, 811, 0.6),
  forestDeco('roots', 'tree_base_root_3.png', 1038, 716, 0.52, {
    rotation: -0.12,
  }),
  forestDeco('roots', 'tree_base_root_2.png', 1425, 594, 0.56, {
    flip: true,
    rotation: 0.08,
  }),
  forestDeco('roots', 'tree_stack_branch_1.png', 875, 712, 0.8, {
    rotation: -0.06,
  }),
  forestDeco('roots', 'tree_stack_branch_2.png', 1760, 806, 0.86, {
    flip: true,
    rotation: 0.05,
  }),
  forestDeco('roots', 'roots_ug_1.png', 715, 734, 0.66, {
    anchorY: 0.5,
    rotation: 1.18,
  }),
  forestDeco('roots', 'roots_ug_3.png', 1530, 700, 0.58, {
    anchorY: 0.5,
    flip: true,
    rotation: -1.08,
  }),
]);

function forestLimb(points, width, alpha = 1) {
  return Object.freeze({
    points: Object.freeze(points),
    width,
    alpha,
  });
}

export const ROOK_FOREST_LIMBS = Object.freeze([
  forestLimb([0, 350, 95, 285, 158, 185, 288, 116, 460, 132], 44, 0.96),
  forestLimb([505, 0, 520, 92, 600, 151, 720, 172, 870, 124], 35, 0.9),
  forestLimb([1065, 0, 1085, 85, 1175, 130, 1325, 118, 1450, 170], 42, 0.94),
  forestLimb([2300, 320, 2200, 275, 2110, 180, 1945, 125, 1780, 145], 48, 0.98),
  forestLimb([1510, 0, 1538, 74, 1625, 112, 1725, 96, 1830, 48], 30, 0.86),
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cleanSourceLocation(sourceLocation) {
  if (!sourceLocation?.tsid) return null;
  return {
    tsid: String(sourceLocation.tsid),
    x: finite(sourceLocation.x),
    y: finite(sourceLocation.y),
  };
}

export function createRookWoodsState({ sourceLocation = null } = {}) {
  return {
    status: 'warning',
    startedAt: 0,
    expiresAt: 0,
    sourceLocation: cleanSourceLocation(sourceLocation),
    spawn: { x: 115, y: 780 },
    hits: 0,
    lastCrusherId: '',
    eggState: ROOK_EGG_INITIAL_STATE,
    eggSmashed: false,
    smashTool: '',
  };
}

export function beginRookWoods(state, now = Date.now()) {
  if (!state || state.status !== 'warning') {
    return { ok: false, reason: state?.status || 'missing', state };
  }
  state.status = 'running';
  state.startedAt = finite(now);
  state.expiresAt = state.startedAt + ROOK_WOODS_DURATION_MS;
  return { ok: true, reason: 'started', state };
}

export function rookWoodsRemainingMs(state, now = Date.now()) {
  if (!state || ['complete', 'expired', 'abandoned'].includes(state.status)) return 0;
  if (state.status === 'warning') return ROOK_WOODS_DURATION_MS;
  return Math.max(0, finite(state.expiresAt) - finite(now));
}

export function expireRookWoods(state, now = Date.now()) {
  if (!state || state.status !== 'running') {
    return { ok: false, reason: state?.status || 'missing', state };
  }
  if (rookWoodsRemainingMs(state, now) > 0) {
    return { ok: false, reason: 'time_remaining', state };
  }
  state.status = 'expired';
  return { ok: true, reason: 'expired', state };
}

export function findWorkingRookTool(inv = {}, toolState = null) {
  for (const classTsid of Object.keys(ROOK_TOOL_PROFILES)) {
    if ((Number(inv[classTsid]) || 0) <= 0) continue;
    const profile = ROOK_TOOL_PROFILES[classTsid];
    const condition = canUseTool(toolState, classTsid, profile.wear);
    if (condition.ok) return { ok: true, classTsid, profile, condition };
  }
  return {
    ok: false,
    reason: 'tool',
    msg: 'You need a working Pick, Fancy Pick, or Hatchet to smash the Egg.',
  };
}

export function rookToolProfile(classTsid) {
  return ROOK_TOOL_PROFILES[classTsid] || null;
}

export function rookEggStateForProgress(progress) {
  const normalized = clamp(finite(progress), 0, 1);
  return clamp(
    ROOK_EGG_INITIAL_STATE - Math.floor(normalized * 4),
    ROOK_EGG_SMASHED_STATE,
    ROOK_EGG_INITIAL_STATE
  );
}

export function completeRookEggSmash(state, classTsid) {
  const profile = rookToolProfile(classTsid);
  if (!state || state.status !== 'running') {
    return { ok: false, reason: state?.status || 'missing', state };
  }
  if (!profile) return { ok: false, reason: 'tool', state };
  if (state.eggSmashed) return { ok: false, reason: 'already_smashed', state };
  state.eggState = ROOK_EGG_SMASHED_STATE;
  state.eggSmashed = true;
  state.smashTool = classTsid;
  state.status = 'complete';
  return { ok: true, reason: 'complete', profile, reward: ROOK_REWARD, state };
}

export function recordCrusherHit(state, crusherId) {
  if (!state || state.status !== 'running') {
    return { ok: false, reason: state?.status || 'missing', state };
  }
  state.hits += 1;
  state.lastCrusherId = String(crusherId || '');
  return { ok: true, reason: 'hit', hits: state.hits, state };
}

export function crusherMoodLoss(playerX, spawnX) {
  const steps = Math.floor(Math.abs(finite(playerX) - finite(spawnX)) / 100);
  return Math.max(0, steps * 2);
}

export function crusherCycleMs(spec) {
  const ratchetSteps = Math.max(1, Math.floor(finite(spec?.ratchetSteps, 1)));
  return (
    Math.max(0, finite(spec?.topDelayMs)) +
    1000 +
    Math.max(0, finite(spec?.bottomDelayMs)) +
    ratchetSteps * 1000
  );
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function crusherPosition(spec, elapsedMs = 0) {
  const axis = spec?.axis === 'x' ? 'x' : 'y';
  const baseX = finite(spec?.x);
  const baseY = finite(spec?.y);
  const travel = finite(spec?.travel);
  const topDelayMs = Math.max(0, finite(spec?.topDelayMs));
  const bottomDelayMs = Math.max(0, finite(spec?.bottomDelayMs));
  const ratchetSteps = Math.max(1, Math.floor(finite(spec?.ratchetSteps, 1)));
  const cycle = crusherCycleMs(spec);
  let local = (finite(elapsedMs) + finite(spec?.phaseOffsetMs)) % cycle;
  if (local < 0) local += cycle;

  let offset = 0;
  let phase = 'waiting';
  if (local >= topDelayMs && local < topDelayMs + 1000) {
    phase = 'striking';
    offset = travel * smoothstep((local - topDelayMs) / 1000);
  } else if (local < topDelayMs + 1000 + bottomDelayMs) {
    if (local >= topDelayMs + 1000) phase = 'impact';
    offset = local >= topDelayMs + 1000 ? travel : 0;
  } else {
    phase = 'ratcheting';
    const returningMs = local - topDelayMs - 1000 - bottomDelayMs;
    const step = Math.min(ratchetSteps - 1, Math.floor(returningMs / 1000));
    const stepProgress = smoothstep((returningMs % 1000) / 1000);
    const from = travel * (1 - step / ratchetSteps);
    const to = travel * (1 - (step + 1) / ratchetSteps);
    offset = from + (to - from) * stepProgress;
  }

  return {
    x: baseX + (axis === 'x' ? offset : 0),
    y: baseY + (axis === 'y' ? offset : 0),
    offset,
    phase,
    cycle,
    local,
  };
}

export function crusherHitsAvatar(spec, position, avatar) {
  const size = Math.max(1, finite(spec?.size, 120));
  const half = size * 0.43;
  const avatarHalfWidth = Math.max(12, finite(avatar?.halfWidth, 22));
  const avatarHeight = Math.max(36, finite(avatar?.height, 88));
  const avatarLeft = finite(avatar?.x) - avatarHalfWidth;
  const avatarRight = finite(avatar?.x) + avatarHalfWidth;
  const avatarTop = finite(avatar?.y) - avatarHeight;
  const avatarBottom = finite(avatar?.y);
  return (
    avatarRight >= position.x - half &&
    avatarLeft <= position.x + half &&
    avatarBottom >= position.y - half &&
    avatarTop <= position.y + half
  );
}

export function rookWoodsObjective(state) {
  if (!state) return 'Enter the Rooks’ Woods';
  if (state.status === 'warning') return 'Prepare to evade the Crushers';
  if (state.status === 'expired') return 'The Rooks’ Woods closed';
  if (state.status === 'complete') return 'Rook Egg smashed';
  return 'Evade the Crushers and smash the Rook Egg';
}
