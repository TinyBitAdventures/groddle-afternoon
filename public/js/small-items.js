/**
 * Small item rules from GameServerJS (register row G155), as pure functions.
 * js/features/small-items-feature.js binds them to the pack, the Local chat
 * and the street.
 *
 * - Fortune Cookie (items/fortune_cookie.js, sold by the Toy Vendor): it is
 *   sold empty. "add a note" (sort 54) takes one written Note (note.js
 *   `contents`, author = last_editor or you) and deletes it; "break" (sort 53,
 *   shown only with a note inside) replaces the cookie with a Fortune that
 *   keeps the text and author: "You broke a Fortune Cookie. The fortune
 *   appears in your pack." getLabel: "Cookie with Fortune" / "Empty Fortune
 *   Cookie". There is no built-in fortune list: every fortune is a note
 *   somebody wrote.
 * - Fortune (items/fortune.js): "read" opens note_view titled "A fortune!",
 *   the text, "This can't be edited.", by its author. Tags no_trade.
 * - Plate of Beans (items/plate_of_beans.js): main.js:1913 `/beans` gives
 *   one from the familiar (pc.createItemFromFamiliar). "overthink" asks
 *   "Are you sure you want to overthink this plate of beans?" (Yes! /
 *   Cancel); every Yes! queues the next question 2^n seconds later (n = the
 *   transient `!think_count`, first wait 1 s) with one more "really" (Yes! /
 *   No); Cancel or No forgets the count.
 * - Ball (items/ball.js): placed on Plexus (LHVDIELDQQ7228K, item
 *   IHVOUEH1GT72GUM) and Nandu Pitha (LA9DURMSIAA2S1T, item PUVMJA4CDI93TFG)
 *   in the archived location XML. "hit" (key h, the default verb) calls the
 *   native apiHitTheBall(200, 10, 0.5), whose server code is lost; the remake
 *   reads it as a 200 px knock away from the hitter, 10 frames of the arc's
 *   rise, and a bounce that keeps 0.5 of its height (reconstructed).
 */

export const FORTUNE_COOKIE = 'fortune_cookie';
export const FORTUNE = 'fortune';
export const NOTE = 'note';
export const PLATE_OF_BEANS = 'plate_of_beans';
export const BALL = 'ball';

export const FORTUNE_TEXT = Object.freeze({
  breakLabel: 'Break',
  breakTooltip: "There's a fortune inside!",
  addLabel: 'Add a note',
  addTooltip: 'Or, drag note to cookie',
  noNotes: "You don't have any written notes!",
  withNote: 'Cookie with Fortune',
  empty: 'Empty Fortune Cookie',
  // buildVerbMessage(count, 'break', 'broke', ...) + self_msgs.
  broke: 'You broke a Fortune Cookie. The fortune appears in your pack.',
  added: 'You added a note to a Fortune Cookie.',
  readLabel: 'Read',
  readTooltip: '... in bed',
  readTitle: 'A fortune!',
  readReason: "This can't be edited.",
  read: 'You read a Fortune.',
});

export const BEANS_TEXT = Object.freeze({
  command: '/beans',
  label: 'Overthink',
  tooltip: 'Overthink this plate of beans?',
  first: 'Are you sure you want to overthink this plate of beans?',
});

export const BALL_HIT = Object.freeze({
  // ball.js verbs.hit: this.apiHitTheBall(200, 10, 0.5).
  args: Object.freeze([200, 10, 0.5]),
  distance: 200,
  riseFrames: 10,
  bounce: 0.5,
  label: 'Hit',
  tooltip: 'Hit the Ball',
  // ball.js getAssetInfo position {x:-38, y:-90, w:76, h:71}; item_width/height 70.
  art: Object.freeze({ url: 'assets/sprites/small-items/ball.webp', fw: 104, fh: 91, cols: 10, rows: 7, frames: 61 }),
  draw: Object.freeze({ w: 76, h: 71, lift: 19 }),
});

/** The two archived streets with a Ball (G aliases as the remake imports them). */
export const BALL_STREETS = Object.freeze({
  GHVDIELDQQ7228K: Object.freeze({ label: 'Plexus', source: 'LHVDIELDQQ7228K', item: 'IHVOUEH1GT72GUM' }),
  GA9DURMSIAA2S1T: Object.freeze({ label: 'Nandu Pitha', source: 'LA9DURMSIAA2S1T', item: 'PUVMJA4CDI93TFG' }),
});

export function ballStreet(tsid) {
  const key = String(tsid || '');
  return BALL_STREETS[key] || BALL_STREETS[key.replace(/^L/, 'G')] || null;
}

const MAX_TEXT = 1000;

function whole(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function cleanFortune(row) {
  if (!row || typeof row !== 'object') return null;
  const text = String(row.text || '').slice(0, MAX_TEXT);
  if (!text) return null;
  return { text, author: String(row.author || 'player').slice(0, 64) };
}

/**
 * Per-stack fortune text: cookies[i] is the note inside cookie i (null when
 * empty), fortunes[i] the text of Fortune i.
 */
export function normalizeFortuneState(seed = {}) {
  const cookies = (Array.isArray(seed.cookies) ? seed.cookies : []).slice(0, 500).map(cleanFortune);
  const fortunes = (Array.isArray(seed.fortunes) ? seed.fortunes : []).slice(0, 500).map(cleanFortune).filter(Boolean);
  return { cookies, fortunes };
}

/**
 * Keep the texts in step with the pack counts: a stack that left the pack
 * (sold, dropped as a plain stack) takes its text with it, a stack that
 * arrived from a vendor is empty. Fortunes only ever come from a broken
 * cookie, so a Fortune with no text reads blank.
 */
export function reconcileFortunes(state, cookieCount = 0, fortuneCount = 0) {
  const s = normalizeFortuneState(state);
  const wantCookies = whole(cookieCount);
  const cookies = s.cookies.slice(0, wantCookies);
  // Filled cookies outlive empty ones when the pack lost some.
  if (s.cookies.length > wantCookies) {
    const filled = s.cookies.filter(Boolean);
    const keep = filled.slice(0, wantCookies);
    while (keep.length < wantCookies) keep.push(null);
    cookies.splice(0, cookies.length, ...keep);
  }
  while (cookies.length < wantCookies) cookies.push(null);
  const fortunes = s.fortunes.slice(0, whole(fortuneCount));
  return { cookies, fortunes };
}

export function cookieCounts(state) {
  const cookies = state?.cookies || [];
  const filled = cookies.filter(Boolean).length;
  return { filled, empty: cookies.length - filled };
}

/** getLabel for the pack: one label when every cookie agrees. */
export function cookieLabel(state) {
  const { filled, empty } = cookieCounts(state);
  if (filled && !empty) return FORTUNE_TEXT.withNote;
  if (empty && !filled) return FORTUNE_TEXT.empty;
  return null;
}

/**
 * Pack buttons for the Fortune Cookie: break (enabled only with a note
 * inside, else hidden) and add a note (hidden once a cookie has a note,
 * disabled without a written note).
 */
export function cookieVerbs(state, writtenNotes = 0) {
  const { filled, empty } = cookieCounts(state);
  const out = [];
  if (filled) {
    out.push({ id: 'break_it', label: FORTUNE_TEXT.breakLabel, tooltip: FORTUNE_TEXT.breakTooltip, enabled: true, reason: '', primary: true });
  }
  if (empty) {
    const ok = whole(writtenNotes) > 0;
    out.push({ id: 'add_note', label: FORTUNE_TEXT.addLabel, tooltip: FORTUNE_TEXT.addTooltip, enabled: ok, reason: ok ? '' : FORTUNE_TEXT.noNotes, primary: !filled });
  }
  return out;
}

/** add_note: the note's contents go into the first empty cookie. */
export function addNoteToCookie(state, note) {
  const s = normalizeFortuneState(state);
  const text = String(note?.body || note?.text || '').slice(0, MAX_TEXT);
  if (!text) return { ok: false, msg: FORTUNE_TEXT.noNotes, state: s };
  const index = s.cookies.findIndex((c) => !c);
  if (index < 0) return { ok: false, msg: '', state: s };
  s.cookies[index] = { text, author: String(note?.author || 'player') };
  return { ok: true, msg: FORTUNE_TEXT.added, state: s, index };
}

/** break_it: replaceWith('fortune') keeps the text and author. */
export function breakCookie(state) {
  const s = normalizeFortuneState(state);
  const index = s.cookies.findIndex(Boolean);
  if (index < 0) return { ok: false, msg: '', state: s };
  const fortune = s.cookies[index];
  s.cookies.splice(index, 1);
  s.fortunes.push(fortune);
  return { ok: true, msg: FORTUNE_TEXT.broke, state: s, fortune };
}

/** fortune.js read: the note_view it sends. */
export function fortuneView(fortune, playerName = 'you') {
  const f = cleanFortune(fortune);
  return {
    title: FORTUNE_TEXT.readTitle,
    body: f?.text || '',
    reason: FORTUNE_TEXT.readReason,
    author: !f || f.author === 'player' ? playerName : f.author,
  };
}

/**
 * plate_of_beans.js modal_callback. `count` is the transient !think_count
 * before this answer. Yes! queues the next question; anything else resets.
 */
export function overthinkAnswer(count, value) {
  if (value !== 'ok') return { count: 0, next: null };
  const n = whole(count);
  const seconds = Math.pow(2, n) || 1;
  const nextCount = n + 1;
  const reallys = Array.from({ length: nextCount }, () => 'really').join(', ');
  return {
    count: nextCount,
    next: { text: `You're ${reallys} sure you want to overthink this?`, yes: 'Yes!', no: 'No', delayMs: seconds * 1000 },
  };
}

/** The first overthink prompt (verbs.overthink). */
export function overthinkPrompt() {
  return { text: BEANS_TEXT.first, yes: 'Yes!', no: 'Cancel', delayMs: 0 };
}

/** main.js doChatCommand: words = txt.split(' '); only `/beans` is a player command here. */
export function chatCommand(text) {
  const words = String(text || '').trim().split(' ');
  if (words[0] === BEANS_TEXT.command) return { command: 'beans', give: { [PLATE_OF_BEANS]: 1 } };
  return null;
}

/**
 * One hit: the ball flies BALL_HIT.distance away from the hitter, clamped to
 * the street, rising for riseFrames frames and then bouncing once at half
 * height (reconstructed from the apiHitTheBall arguments).
 */
export function planBallHit(ballX, hitterX, { minX = 0, maxX = Infinity } = {}) {
  const from = Number(ballX) || 0;
  const dir = (Number(hitterX) || 0) <= from ? 1 : -1;
  const lo = Math.min(minX, maxX);
  const hi = Math.max(minX, maxX);
  const to = Math.max(lo, Math.min(hi, from + dir * BALL_HIT.distance));
  const rise = BALL_HIT.riseFrames;
  const peak = BALL_HIT.distance * 0.3;
  return {
    from,
    to,
    dir,
    // Frames: rise + fall of the main arc, then one bounce at half height.
    frames: rise * 4,
    arc: [peak, peak * BALL_HIT.bounce],
  };
}

/** Ball position at frame `f` of a planned hit: { x, lift } (lift in px above rest). */
export function ballHitPose(plan, f) {
  if (!plan) return { x: 0, lift: 0, done: true };
  const t = Math.max(0, Math.min(1, f / plan.frames));
  const x = plan.from + (plan.to - plan.from) * (1 - Math.pow(1 - t, 2));
  // First arc takes the first half of the time, the bounce the second.
  const [a, b] = plan.arc;
  const lift = t < 0.5 ? a * Math.sin((t / 0.5) * Math.PI) : b * Math.sin(((t - 0.5) / 0.5) * Math.PI);
  return { x, lift: Math.max(0, lift), done: f >= plan.frames };
}
