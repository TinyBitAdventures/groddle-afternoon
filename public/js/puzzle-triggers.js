/**
 * Reconstructed puzzle-street triggers (pure: no DOM, no Pixi).
 *
 * The archive kept each puzzle street's event scripts (L*.xml `events`) but
 * not the items that fired them: 785 Collision-triggered Event Boxes, plus the
 * quoins, switches and keys of the colour levels, Piano Party and the gut
 * tubes. assets/content/puzzle-triggers.json rebuilds them per street, each
 * position derived from the street's own geometry (the platform or deco the
 * event toggles, the ledge before a bridge, the art of a pad) and checked
 * against gameplay video; `why` records the derivation.
 *
 * Street entry shape (screen space, like street.boxes: bottom-centre x, y):
 * {
 *   name, strict: true,                  // walkable fallback off (real perms)
 *   start: { x, y },                     // the lost Teleport Marker
 *   fallY, checkpoints: [{ x, y }],      // pit recovery: back to the last passed
 *   exit: { door: true } | { x, y, w, h } // completion
 *   reward: { xp, energy, mood, currants, favor: [{ giant, points }], source },
 *   triggers: [{ id, x, y, w, h, onEnter: [], onExit: [], body, once, art, why }],
 *   quoins: [{ x, y, type, amount }],
 *   physics: { gravity, ... }             // whole-street multipliers (gut tubes)
 * }
 */

export const PUZZLE_DATA_URL = 'assets/content/puzzle-triggers.json';

/**
 * Source-faithful movement for hand-tuned puzzle geometry. The remake walks
 * at 4.4 px/frame (264 px/s against the source vx_max 335) and falls at 0.42
 * px/frame^2 (1512 px/s^2 against gravity 1190), so its jumps cover ~62% of
 * the source distance: Griinolyza's 140 px board gaps became impossible.
 * These two factors put the arc back on the source curve (normal: 324 px /
 * 135 px apex vs the client's 318 / 134; Griinolyza 199 / 99 vs 197 / 99).
 */
export const SOURCE_PHYSICS = Object.freeze({ speed: 335 / 264, gravity: 1190 / 1512 });

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const list = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : String(v).split(',').map((s) => s.trim()).filter(Boolean));

/** One trigger, normalized. Unknown fields pass through for the renderer. */
export function normalizeTrigger(raw, index = 0) {
  return {
    ...raw,
    id: String(raw?.id || `t${index + 1}`),
    x: num(raw?.x),
    y: num(raw?.y),
    w: Math.max(1, num(raw?.w, 40)),
    h: Math.max(1, num(raw?.h, 40)),
    onEnter: list(raw?.onEnter),
    onExit: list(raw?.onExit),
    body: raw?.body === true,
    once: raw?.once === true,
  };
}

/** One street definition, normalized (null when unusable). */
export function normalizePuzzleStreet(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const reward = raw.reward && typeof raw.reward === 'object' ? raw.reward : null;
  return {
    ...raw,
    name: String(raw.name || ''),
    strict: raw.strict === true,
    sourcePhysics: raw.sourcePhysics !== false,
    start: raw.start ? { x: num(raw.start.x), y: num(raw.start.y) } : null,
    fallY: Number.isFinite(Number(raw.fallY)) ? Number(raw.fallY) : null,
    checkpoints: (raw.checkpoints || []).map((c) => ({ x: num(c.x), y: num(c.y) })).sort((a, b) => a.x - b.x),
    exit: raw.exit || null,
    reward: reward
      ? {
          xp: num(reward.xp),
          energy: num(reward.energy),
          mood: num(reward.mood),
          currants: num(reward.currants),
          favor: (reward.favor || []).filter((f) => f && f.giant && num(f.points) > 0),
          source: String(reward.source || ''),
        }
      : null,
    triggers: (raw.triggers || []).map(normalizeTrigger),
    quoins: (raw.quoins || []).map((q, i) => ({ id: `q${i + 1}`, x: num(q.x), y: num(q.y), type: String(q.type || 'xp'), amount: num(q.amount, 0) || null })),
  };
}

export function normalizePuzzleData(raw) {
  const out = {};
  for (const [tsid, def] of Object.entries(raw?.streets || {})) {
    const norm = normalizePuzzleStreet(def);
    if (norm) out[tsid] = norm;
  }
  return out;
}

/**
 * Does the avatar touch a trigger? Feet are (x, y); a `body` trigger also
 * counts the avatar's height above the feet (ceiling pads, beams).
 */
export function triggerHit(trigger, x, y, bodyH = 0) {
  if (Math.abs(x - trigger.x) > trigger.w / 2) return false;
  const top = trigger.y - trigger.h;
  const bottom = trigger.y + 4;
  if (trigger.body && bodyH > 0) return y >= top && y - bodyH <= bottom;
  return y <= bottom && y >= top;
}

/**
 * Enter/exit edges for one frame. `inside` (Set of ids) is updated in place;
 * `spent` (Set) holds `once` triggers that already fired.
 * @returns {{ trigger: object, edge: 'enter'|'exit', events: string[] }[]}
 */
export function stepTriggers(triggers, inside, spent, x, y, bodyH = 0) {
  const out = [];
  for (const trigger of triggers) {
    const hit = triggerHit(trigger, x, y, bodyH);
    const was = inside.has(trigger.id);
    if (hit === was) continue;
    if (hit) inside.add(trigger.id);
    else inside.delete(trigger.id);
    if (trigger.once && spent.has(trigger.id)) continue;
    const events = hit ? trigger.onEnter : trigger.onExit;
    if (hit && trigger.once) spent.add(trigger.id);
    out.push({ trigger, edge: hit ? 'enter' : 'exit', events });
  }
  return out;
}

/** The checkpoint to return to after a fall: the furthest one passed. */
export function respawnPoint(def, bestX) {
  let at = def?.start || null;
  for (const c of def?.checkpoints || []) if (c.x <= bestX + 1) at = c;
  return at;
}

/** Quoins in reach of the avatar this frame (not yet taken). */
export function quoinsInReach(quoins, taken, x, y, reach = 34) {
  return quoins.filter((q) => !taken.has(q.id) && Math.abs(q.x - x) <= reach && y >= q.y - reach * 1.2 && y - 50 <= q.y + reach * 0.4);
}

/** Completion reward: the first finish only; later runs are for fun. */
export function completionReward(def, save, tsid) {
  const count = num(save?.completed?.[tsid]);
  if (!def?.reward || count > 0) return null;
  return def.reward;
}

/** Reward line for the award screen and activity feed. */
export function rewardBits(r) {
  if (!r) return [];
  const bits = [];
  if (r.xp) bits.push(`+${r.xp.toLocaleString()} iMG`);
  if (r.currants) bits.push(`+${r.currants.toLocaleString()} currants`);
  if (r.energy) bits.push(`+${r.energy.toLocaleString()} energy`);
  if (r.mood) bits.push(`+${r.mood.toLocaleString()} mood`);
  for (const f of r.favor || []) bits.push(`+${f.points} ${f.giant[0].toUpperCase()}${f.giant.slice(1)} favor`);
  return bits;
}

/** Saved slice: { completed: { tsid: n }, best: { tsid: ms }, returnTo }. */
export function normalizePuzzleSave(seed) {
  const out = { completed: {}, best: {}, returnTo: null };
  if (!seed || typeof seed !== 'object') return out;
  for (const [k, v] of Object.entries(seed.completed || {})) if (/^[GL][A-Z0-9]+$/.test(k) && num(v) > 0) out.completed[k] = Math.floor(num(v));
  for (const [k, v] of Object.entries(seed.best || {})) if (/^[GL][A-Z0-9]+$/.test(k) && num(v) > 0) out.best[k] = Math.round(num(v));
  const r = seed.returnTo;
  if (r && typeof r.tsid === 'string') out.returnTo = { tsid: r.tsid, x: num(r.x), y: num(r.y) };
  return out;
}
