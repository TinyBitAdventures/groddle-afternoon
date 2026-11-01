/**
 * The Bureaucratic Halls between real players (register G479): pure helpers
 * for the multiplayer branch of features/bureaucratic-halls-feature.js. The
 * realtime server (groddle-afternoon-server halls.go) knows which of a street
 * hall's four bureaucrats is busy with whom and keeps the hall's line; every
 * player in the hall (scene street HALL_<tsid>) sees the same bureaucrats.
 *
 * Source: items/npc_bureaucrat.js isBusy 805-837 (busy greeting, helping or
 * promised; let go when that player leaves, player_exit 705-715),
 * location.js 1076-1092 and catalog_buffs.js 1650-1662 (the nearest free one
 * greets you, and helps you after Please Wait), getRandomBureaucrat 314-321
 * (a hand-off names the first free one), idle_onMsg 733-765 (strolls).
 * The halls were instances, "generally one person ... unless people follow
 * each other in" (forum general/17265): the remake keeps one hall per door so
 * players meet there. Ours: a line when every bureaucrat is busy (the source
 * never came), and a turn lost after HALL_TURN_MS with no progress.
 */

/** A bureaucrat held with no progress this long is lost to you (halls.go turn). */
export const HALL_TURN_MS = 60_000;
/** Your bureaucrat's pose goes to the others at most this often while it moves. */
export const HALL_POSE_MS = 200;

export const HALL_MP_TEXT = Object.freeze({
  // Ours: the source had no line (nobody came when every bureaucrat was busy).
  line: (place) => (place <= 1 ? 'Every bureaucrat is busy. You are next in line.' : `Every bureaucrat is busy. You are number ${place} in line.`),
  lost: 'You lost your turn. To conduct another transaction, you must exit and re-enter the Hall.',
  serving: (name) => `Busy with ${name}`,
});

/** The street a street hall is shared on. */
export const hallStreet = (sceneTsid) => String(sceneTsid || '');

/**
 * One bureaucrat as the server sent it, kept with the time it came so a walk
 * can be drawn on: { i, by, who, kind, x, dir, anim, to?, speed?, at }.
 */
export function clerkRow(row, at) {
  const x = Number(row?.x);
  const out = {
    i: Math.max(0, Math.floor(Number(row?.i) || 0)),
    by: Math.max(0, Math.floor(Number(row?.by) || 0)),
    who: String(row?.who || ''),
    kind: ['greet', 'help', 'will'].includes(row?.kind) ? row.kind : '',
    x: Number.isFinite(x) ? x : 0,
    dir: row?.dir === 'right' ? 'right' : 'left',
    anim: typeof row?.anim === 'string' && row.anim ? row.anim : 'idle',
    at: Number(at) || 0,
  };
  const to = Number(row?.to);
  const speed = Number(row?.speed);
  if (Number.isFinite(to) && Number.isFinite(speed) && speed > 0) {
    out.to = to;
    out.speed = speed;
  }
  return out;
}

/** Where a server bureaucrat stands at `now`: a walk goes on at its speed until it gets there. */
export function clerkAt(row, now) {
  if (!row) return null;
  if (row.to == null) return { x: row.x, dir: row.dir, anim: row.anim === 'walk1' || row.anim === 'walk2' ? 'idle' : row.anim, walking: false };
  const d = (row.speed * Math.max(0, Number(now) - row.at)) / 1000;
  if (Math.abs(row.to - row.x) <= d) return { x: row.to, dir: row.dir, anim: 'idle', walking: false };
  return { x: row.x + Math.sign(row.to - row.x) * d, dir: row.to > row.x ? 'right' : 'left', anim: row.anim || 'walk1', walking: true };
}

/** Whether a bureaucrat is busy with someone other than `me` (isBusy, from the server). */
export const busyForOther = (row, me) => Boolean(row && row.by && row.by !== me);

/** A pose worth sending: moved a pixel, turned or changed animation since the last one sent. */
export function poseChanged(prev, pose) {
  if (!prev) return true;
  return Math.abs(prev.x - pose.x) >= 1 || prev.dir !== pose.dir || prev.anim !== pose.anim;
}
