/**
 * Timed world actions inspired by Glitch's commit → animate → reward cadence.
 * Pure state helpers keep timing deterministic for tests and the Pixi ticker.
 */

const INSTANT_VERBS = new Set(['browse', 'talk_to', 'inspect', 'open', 'buy', 'sell']);

export const ACTION_DURATION_MS = Object.freeze({
  pickup: 420,
  pet: 900,
  nibble: 1300,
  feed: 900,
  squeeze: 950,
  massage: 1350,
  milk: 1600,
  sing_to: 1200,
  harvest: 1500,
  'wood_tree:harvest': 4000,
  water: 900,
  water_all: 1450,
  plant: 1100,
  clear: 1050,
  mine: 1800,
});

const ACTION_GERUNDS = Object.freeze({
  pickup: 'Picking up',
  pet: 'Petting',
  nibble: 'Nibbling',
  feed: 'Feeding',
  squeeze: 'Squeezing',
  massage: 'Massaging',
  milk: 'Milking',
  sing_to: 'Singing to',
  harvest: 'Harvesting',
  water: 'Watering',
  water_all: 'Watering',
  plant: 'Planting',
  clear: 'Clearing',
  mine: 'Mining',
});

/**
 * @param {string} classId
 * @param {string} verbId
 */
export function actionDurationFor(classId, verbId) {
  const baseVerb = String(verbId || '').split(':')[0];
  if (!baseVerb || INSTANT_VERBS.has(baseVerb)) return 0;
  const exact = ACTION_DURATION_MS[`${classId}:${baseVerb}`];
  if (Number.isFinite(exact)) return Math.max(0, exact);
  const generic = ACTION_DURATION_MS[baseVerb];
  return Number.isFinite(generic) ? Math.max(0, generic) : 800;
}

/**
 * @param {string} verbId
 * @param {string} targetLabel
 * @param {string} [fallbackLabel]
 */
export function actionLabelFor(verbId, targetLabel, fallbackLabel = '') {
  const baseVerb = String(verbId || '').split(':')[0];
  const gerund = ACTION_GERUNDS[baseVerb] || fallbackLabel || 'Doing';
  const target = String(targetLabel || '').trim();
  return `${gerund}${target ? ` ${target}` : ''}…`;
}

/**
 * @param {{ classId?: string, verbId: string, verbLabel?: string, targetLabel?: string, durationMs?: number }} input
 */
export function createTimedAction(input) {
  const durationMs = Number.isFinite(input.durationMs)
    ? Math.max(0, Number(input.durationMs))
    : actionDurationFor(input.classId || '', input.verbId);
  return {
    classId: input.classId || '',
    verbId: input.verbId,
    label: actionLabelFor(input.verbId, input.targetLabel || '', input.verbLabel || ''),
    durationMs,
    elapsedMs: 0,
    progress: durationMs > 0 ? 0 : 1,
    status: durationMs > 0 ? 'running' : 'complete',
  };
}

/**
 * Advance without mutating the previous action.
 * @param {ReturnType<typeof createTimedAction>} action
 * @param {number} deltaMs
 */
export function advanceTimedAction(action, deltaMs) {
  if (!action || action.status !== 'running') return action;
  const elapsedMs = Math.min(
    action.durationMs,
    action.elapsedMs + Math.max(0, Number(deltaMs) || 0)
  );
  const progress = action.durationMs > 0 ? elapsedMs / action.durationMs : 1;
  return {
    ...action,
    elapsedMs,
    progress,
    status: progress >= 1 ? 'complete' : 'running',
  };
}

/** @param {ReturnType<typeof createTimedAction>} action */
export function cancelTimedAction(action) {
  if (!action || action.status !== 'running') return action;
  return { ...action, status: 'cancelled' };
}
