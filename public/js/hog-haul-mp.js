/**
 * The Great Hog Haul between real players (G334): the pure side of the
 * client. The server is groddle-afternoon-server's hoghaul.go (on races.go's
 * challenge, Click to Start and countdown; its header lists the messages and
 * the GameServerJS rules: items/pig_bait.js, items/npc_piggy.js,
 * players/inc_games.js games_hogtie_piggy_*, groups/global_game.js); the
 * world side is features/hog-haul-mp-feature.js. Solo's Hog Haul (game.js
 * startHogHaulRace, js/hog-haul.js) is untouched.
 *
 * Nothing here touches the DOM, Pixi or the socket.
 */

export const HOG_MP_COURSE = 'hogtie_piggy';
const ID_RE = /^[0-9a-f]{16}$/;
const STREET_RE = /^RACE_[0-9A-F]{16}$/;
const HOME_RE = /^[A-Z0-9]{8,20}$/;

/** Copy players read (GSJS strings where there are any). */
export const HOG_MP_TEXT = Object.freeze({
  title: 'The Great Hog Haul',
  // inc_games.js games_hogtie_piggy_splash 1837-1841.
  splash: 'Be the first to capture 3 Piggies.',
  steps: Object.freeze(['Touch Pig Bait to pick it up', 'While carrying Bait, touch a Piggy to hogtie it', 'Deliver your Hogtied Piggy to the Pig Pen']),
  start: 'Click to Start',
  // inc_games.js 1934, 1950, 1980, 1995, 2017, 2045, 2059.
  baitFirst: 'You have bait, now go get a piggy!',
  baitAgain: 'Got bait! Find a pig!',
  pigFirst: 'You hogtied a piggy, now take it to the Pig Pen!',
  pigAgain: 'Got a pig! Back to the pen!',
  needsBait: 'You need bait first!',
  twoMore: 'Nice job! Now, get two more!',
  oneMore: 'Nice job! Now, get one more!',
  // game.js updateHogHaul / leaveHogHaulRace (solo's lines).
  rivalPen: (name) => `${name} returned a Piggy!`,
  done: 'Dem Piggies got hogtied up good! Nice work.',
  findBait: 'Find a Pig Bait sack.',
  backToPen: 'Got a pig! Back to the pen!',
});

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function point(v) {
  if (!Array.isArray(v) || v.length < 2) return null;
  const x = Number(v[0]);
  const y = Number(v[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** A race_match for the haul, cleaned, or null when it is not one this client can run. */
export function normalizeHogMatch(msg) {
  if (!msg || msg.course !== HOG_MP_COURSE || msg.kind !== 'pigs') return null;
  if (!ID_RE.test(String(msg.match || '')) || !STREET_RE.test(String(msg.street || '')) || !HOME_RE.test(String(msg.home || ''))) return null;
  const players = (Array.isArray(msg.players) ? msg.players : [])
    .map((p) => {
      const id = Number(p?.id);
      return Number.isInteger(id) && id > 0 ? { id, name: String(p?.name || 'A Glitch').slice(0, 64), slot: Math.max(0, Math.floor(num(p.slot))) } : null;
    })
    .filter(Boolean);
  if (players.length < 2) return null;
  const baits = (Array.isArray(msg.baits) ? msg.baits : []).map(point);
  const pigs = (Array.isArray(msg.pigs) ? msg.pigs : []).map((p) => {
    const at = point(p);
    return at ? { ...at, range: Math.max(0, Math.min(200, num(p[2], 86))) } : null;
  });
  const pen = point(msg.pen);
  if (!pen || !baits.length || !pigs.length || baits.some((b) => !b) || pigs.some((p) => !p)) return null;
  return {
    match: String(msg.match),
    street: String(msg.street),
    home: String(msg.home),
    title: String(msg.title || HOG_MP_TEXT.title),
    slot: Math.max(0, Math.floor(num(msg.slot))),
    spawn: point(msg.spawn) || { x: pen.x - 145, y: pen.y },
    players,
    goal: Math.max(1, Math.floor(num(msg.goal, 3))),
    pen,
    baits,
    pigs,
    autoLeave: Math.max(0, num(msg.autoLeave, 120)),
  };
}

/** The carry map of a race_hog ({ "7": "pig" }) as Map<id, 'bait'|'pig'>. */
export function carryMap(raw) {
  const out = new Map();
  for (const [k, v] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    const id = Number(k);
    if (Number.isInteger(id) && id > 0 && (v === 'bait' || v === 'pig')) out.set(id, v);
  }
  return out;
}

/**
 * The line this racer reads for its own race_hog (inc_games.js: bait 1913-1955
 * by its score before, a Piggy 1957-2000, the pen 2023-2066 by its score
 * before the one just scored), or '' when the source says nothing.
 */
export function hogLine(what, scoreAfter) {
  const s = Math.max(0, Math.floor(num(scoreAfter)));
  if (what === 'bait') return s === 0 ? HOG_MP_TEXT.baitFirst : HOG_MP_TEXT.baitAgain;
  if (what === 'pig') return s === 0 ? HOG_MP_TEXT.pigFirst : s === 1 ? HOG_MP_TEXT.pigAgain : '';
  if (what === 'pen') return s === 1 ? HOG_MP_TEXT.twoMore : s === 2 ? HOG_MP_TEXT.oneMore : '';
  return '';
}

/** What the objective line says (js/hog-haul.js hogHaulObjective's wording). */
export function hogObjective(carry) {
  if (carry === 'pig') return HOG_MP_TEXT.backToPen;
  if (carry === 'bait') return HOG_MP_TEXT.baitFirst;
  return HOG_MP_TEXT.findBait;
}

/**
 * Where a loose Piggy stands now: pacing its range (game.js spawnHogHaulPiggy,
 * 0.48 px a frame) from the same clock on every client, so racers see it in
 * the same place. index offsets the phase. Returns { x, dir }.
 */
export function pigPose(pig, index, nowMs) {
  const range = Math.max(1, pig.range || 0);
  const period = (4 * range) / (0.48 * 60 / 1000); // ms for there and back
  const t = ((nowMs / period + index * 0.37) % 1 + 1) % 1;
  const tri = t < 0.5 ? t * 4 - 1 : 3 - t * 4; // -1 .. 1 .. -1
  return { x: pig.x + tri * range, dir: t < 0.5 ? 1 : -1 };
}

/** A touch in the source's hit box (global_game.js:652-655 apiSetHitBox(100, 50)) from the feet. */
export function touches(px, py, x, y, halfW = 50, h = 50) {
  return Math.abs(px - x) <= halfW && py >= y - h && py <= y + h;
}

/** At the pen (game.js spawnHogHaulPen: solo's 310 x 145 box). */
export function atPen(px, py, pen) {
  return Boolean(pen) && Math.abs(px - pen.x) <= 155 && py >= pen.y - 145 && py <= pen.y + 20;
}
