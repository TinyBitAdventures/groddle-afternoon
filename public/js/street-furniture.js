import { isItemFloor, platformYAt, worldToScreen } from './street-model.js?v=b6cb6a4e';
import { filterText } from './word-filter.js?v=9a7a7ebb';
import { MAILBOX_SPOTS } from './node-spots-data.js?v=97d4281c';

/**
 * Street furniture rules: street Mailboxes, placed Notes, Notice Boards and
 * Visiting Stones (pure; js/features/street-furniture-feature.js renders them).
 *
 * Sources (glitch-GameServerJS):
 * - items/npc_mailbox.js: verb "open mailbox" (checkMail → pc.mail_check),
 *   per-player states idle / has_mail / interact / all_done, the 2 s
 *   all_done → idle timer (pc_idle_timers = time() + 2), 200×200 hit box,
 *   default instance variant "mailboxLeft". Mail itself is per player
 *   (players/inc_mail.js), so every street mailbox opens the same mail.
 * - items/note.js: instance props initial_title / initial_text, "read"
 *   (default verb, disabled "It is blank :(") and "write on" (Penpersonship +
 *   a working Quill; hidden once another Glitch is the last editor), title
 *   150 / body 1,000 character limits, a 10-entry edit history, one Quill use
 *   per edit, base cost 4, stack max 1.
 * - items/paper.js "write on": Penpersonship + a working Quill turn one Paper
 *   into a Note (the new note's own edit then uses the Quill once).
 * - items/bag_notice_board.js: capacity 10, art state "m" + note count,
 *   "view" (read or take) and "add a note" (needs a Note in the pack).
 * - items/visiting_stone.js + players/inc_visiting.js: flip / visit /
 *   get visitors / stop random visitors, the exact conversation lines, the
 *   level 4 opt-in gate, 1200×1200 hit box and the first-sighting VOG.
 *
 * Archived populations (build-street-ecology.mjs `furniture`): 265 Mailboxes,
 * 199 Visiting Stones, 135 Notes and 7 Notice Boards across the location XML.
 * The per-instance note texts are not in the public dump, so the notes and
 * pinned notices below are authored for the remake (see STREET_NOTES). Each
 * carries `remake: true`, and a note seeded from one keeps `remakeText`, so
 * the note view can say so (G175). Tiny Speck's own word on the boards is
 * that players wrote them: "Notice Boards (first debuted inside Machine
 * Rooms ...) which allow players to post notes for others to read ... Jokes,
 * propaganda and instructions abound" (glitch blog 2011-06-01, research/
 * wayback/raw/blog/2011-06-01-life-in-beta-new-features-so-far.txt:78). The
 * only notices that survive are players' own, transcribed on the Glitch
 * Tribute Blog: they set how many pins five boards carry (see BOARD_PINS),
 * and their words never ship.
 */

export const MAILBOX_CLASS = 'npc_mailbox';
export const STONE_CLASS = 'visiting_stone';
export const NOTE_CLASS = 'note';
export const BOARD_CLASS = 'bag_notice_board';
export const PAPER_CLASS = 'paper';
export const QUILL_CLASS = 'quill';
export const PENMANSHIP_SKILL = 'penmanship_1';

export const SOURCE_FURNITURE_COUNTS = Object.freeze({
  npc_mailbox: 265,
  visiting_stone: 199,
  note: 135,
  bag_notice_board: 7,
});

/** Planner keys and clearances for each furniture class. */
export const FURNITURE_GROUPS = Object.freeze({
  npc_mailbox: Object.freeze({ key: 'furnitureMailbox', clearance: 80 }),
  visiting_stone: Object.freeze({ key: 'furnitureStone', clearance: 90 }),
  bag_notice_board: Object.freeze({ key: 'furnitureBoard', clearance: 120 }),
  note: Object.freeze({ key: 'furnitureNote', clearance: 40 }),
});

/** The shared planner allocates at most 40 points per group. */
export const PLANNER_GROUP_MAX = 40;

const DIR = 'assets/sprites/street-furniture/';

/** Exact OGA cells: every mailbox clip is 97×146. */
export const MAILBOX_SHEETS = Object.freeze({
  idle: Object.freeze({ path: `${DIR}mailbox-left-idle.webp`, fw: 97, fh: 146, cols: 1, frames: 1 }),
  has_mail: Object.freeze({ path: `${DIR}mailbox-left-has-mail.webp`, fw: 97, fh: 146, cols: 10, frames: 73 }),
  interact: Object.freeze({ path: `${DIR}mailbox-left-interact.webp`, fw: 97, fh: 146, cols: 9, frames: 9 }),
  all_done: Object.freeze({ path: `${DIR}mailbox-left-all-done.webp`, fw: 97, fh: 146, cols: 8, frames: 22 }),
});
export const STONE_ART = Object.freeze({ path: `${DIR}visiting-stone.webp`, w: 101, h: 155 });
export const NOTE_ART = Object.freeze({ path: `${DIR}note-world.webp`, w: 45, h: 14, icon: 'assets/sprites/icons/note.webp' });
export const BOARD_ART = Object.freeze({ w: 212, h: 147, path: (count) => `${DIR}notice-board-m${count}.webp` });

export const MAILBOX_ALL_DONE_MS = 2000;
export const MAILBOX_HITBOX = 200;

export const NOTE_ITEM = Object.freeze({
  classTsid: NOTE_CLASS,
  label: 'Note',
  namePlural: 'Notes',
  desc: 'A note is the kind of thing you write on.',
  baseCost: 4,
  stackMax: 1,
  icon: NOTE_ART.icon,
});

export const NOTE_LIMITS = Object.freeze({ title: 150, body: 1000, history: 10 });

export const NOTE_TEXT = Object.freeze({
  defaultTitle: 'A note!',
  blank: 'It is blank :(',
  needPenmanship: 'You need to know Penpersonship.',
  needQuill: 'You need a working quill.',
  notYours: 'This is not your note.',
  quillGone: "You don't have a working quill anymore!",
  paperNeedQuill: "You'll need a Quill first.",
  paperNeedPenmanship: 'You need to learn Penpersonship.',
  paperGone: "Wha? Where'd the paper go?",
  greeting: 'Notes on a greeting street stay where they are.',
});

export const BOARD_CAPACITY = 10;
export const BOARD_TEXT = Object.freeze({
  full: 'The notice board is full.',
  fullAdd: "The notice board is already full! You'll have to remove a note before you can add another.",
  noNotes: 'You have no notes to add.',
  noNotesPost: 'You have no notes to post!',
  tooltipView: 'Read or take notes from the notice board',
  tooltipAdd: 'Add a note to this notice board',
});

export const STONE_LEVEL = 4;
export const STONE_HITBOX = 1200;
export const STONE_TEXT = Object.freeze({
  visit: 'Ah — I know just the street to send you to. Ready to go?',
  visitYes: 'Sure',
  visitNo: 'Maybe later',
  visitLater: 'Ok, well … come back any time.',
  optIn: 'Me and my kindred rocks and stones often help random travellers visit home streets far and wide.',
  optInAsk: 'Would you like me to try to draw some of these visitors to your home street?',
  optInSplit: 'Interesting',
  optInYes: 'Indubitably',
  optInNo: 'No Thanks',
  optInDone: (butler) => `Very well. I will put a word in for you and we’ll see what happens. I’m sure ${butler} will tell you if any new visitors drop by.`,
  optInLater: 'Ah, well, if you ever change your mind come and talk to me again.',
  optOut: 'OK, we will no longer send random visitors to your home street. If you change your mind, you know who … er, "what" … to talk to.',
  optedIn: "You've been opted in - you will recieve random visitors to your street.",
  optedOut: "You've been opted out - you will no longer receive random visitors to your street.",
  lowLevel: 'You need to reach level 4 first.',
  noHome: 'You need a home street first.',
  noButler: "You haven't yet unboxed your butler in your front yard.",
  // visiting_stone.js onPlayerCollision: vog before you have a Butler, vogHigh after.
  vog: [
    'Hmm! Over there, near the end of the street … it’s a Visiting Stone!',
    'Visiting Stones can instantly transport you to the home streets of people looking for more visitors.',
    'Later, once you get a little higher level, you can get some visitors through the stones too.',
  ],
  vogHigh: [
    'Hmm! Over there, near the end of the street … it’s a Visiting Stone!',
    'Visiting Stones can instantly transport you to the home streets of people looking for more visitors.',
    'And, if you want s’more visitors you can get them from the stones as well. Go look.',
  ],
  desc: 'A confederate in the grand System of Stones and Rocks whose aim in life is to redistribute the Glitch here and there and make sure each has a chance to see each.',
  extra: 'Visiting Stones can typically be found in "dead-end locations" of most regions.',
});

/**
 * The opt-in reply names your Butler (butler.getLabel(pc)); before the Butler
 * feature existed the remake said "your mailbox", and it still does if a
 * caller has no Butler to name.
 */
export const STONE_BUTLER_STANDIN = 'your mailbox';

// ---------------------------------------------------------------------------
// Catalog rows and placement
// ---------------------------------------------------------------------------

function whole(value, max = 999) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
}

/** Furniture row for a street (G/L alias aware), or null. */
export function furnitureFor(catalog, tsid) {
  const map = catalog?.furniture || {};
  const id = String(tsid || '');
  const aliases = [id];
  if (id.startsWith('G')) aliases.push(`L${id.slice(1)}`);
  if (id.startsWith('L')) aliases.push(`G${id.slice(1)}`);
  for (const alias of aliases) if (map[alias]) return map[alias];
  return null;
}

/**
 * Fixed screen points a row pins one class to (row.at[classTsid]), or null to
 * use the planner. Rebuilt and special rooms supply rows through the feature
 * hook furnitureRow(street, base, engine) (the machine rooms hang their Notice
 * Board on the wall, G169).
 */
export function fixedFurniturePoints(row, classTsid) {
  const pts = row?.at?.[classTsid];
  if (!Array.isArray(pts)) return null;
  return pts.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)).slice(0, whole(row[classTsid]));
}

/** Gap kept between a piece of furniture and a door's frame, in px. */
export const DOOR_CLEARANCE = 24;

/**
 * Austin 2026-11-08 (Tii Street GLI23TBNDHD19F2: the mailbox planned 75 px from a Spice Plant's
 * trunk, standing in it): a tree is an obstacle as wide as its trunk and lower canopy for planned
 * furniture, stepped off the way a door is (clearOfDoors). Fixed source spots are left alone.
 */
export const TREE_OBSTACLE_W = 200;

/** Tree planner points as door-like obstacles for clearOfDoors. */
export function treeObstacles(points = []) {
  return (points || [])
    .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
    .map((p) => ({ x: p.x, y: p.y, w: TREE_OBSTACLE_W }));
}

/**
 * A planned spot moved off any door on its floor. The archive keeps how many
 * Mailboxes, Visiting Stones and Notice Boards a street had, not where (the
 * planner picks), and the planner only keeps clear of signposts, so Gregarious
 * Towers' board hung over the Grange door (Austin 2026-10-29). `doors` are the
 * street's own (screen space, bottom-centre, build-street-navigation.mjs); the
 * spot slides to the nearer side that clears the frame by DOOR_CLEARANCE and
 * has floor within 60 px of its own (a step down off a doorstep counts), else it stays.
 * Floor is a line furniture rests on that the avatar stands on (street-model.js isItemFloor).
 * @param {{x:number,y:number}} point
 * @param {number} halfWidth  half the furniture's art width
 */
export function clearOfDoors(point, halfWidth, doors = [], platforms = [], worldW = Infinity) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return point;
  const floorAt = (x) => {
    let best = null;
    for (const p of platforms || []) {
      if (!isItemFloor(p)) continue;
      const y = platformYAt(p, x, 0);
      if (y != null && Math.abs(y - point.y) <= 60 && (best == null || Math.abs(y - point.y) < Math.abs(best - point.y))) best = y;
    }
    return best;
  };
  let at = { ...point };
  for (let pass = 0; pass < 3; pass += 1) {
    const door = (doors || []).find((d) => !d?.hidden && Number.isFinite(d?.x) && Number.isFinite(d?.y)
      && Math.abs(d.y - at.y) <= 60 && Math.abs(d.x - at.x) < (Number(d.w) || 0) / 2 + halfWidth + DOOR_CLEARANCE);
    if (!door) return at;
    const reach = (Number(door.w) || 0) / 2 + halfWidth + DOOR_CLEARANCE;
    const sides = [door.x - reach, door.x + reach]
      .filter((x) => x - halfWidth >= 0 && x + halfWidth <= worldW)
      .map((x) => ({ x: Math.round(x), y: floorAt(x) }))
      .filter((c) => c.y != null)
      .sort((a, b) => Math.abs(a.x - at.x) - Math.abs(b.x - at.x));
    if (!sides.length) return at;
    at = { ...at, x: sides[0].x, y: sides[0].y };
  }
  return at;
}

/**
 * The placements audit (2026-11-12): Glitch set its street mailboxes by hand (npc_mailbox.js
 * obey_physics false), and 42% of the ones the planner put on snapped streets stood at a height
 * where the street had none (Saani Shim's against the rock face, Glitch's on the flat floor to its
 * left). tools/snap-placements/nodes.py measures every mailbox players' 2012 snaps show
 * (MAILBOX_SPOTS, node-spots.json: [x, y, facing], 1 mailboxLeft, 2 mailboxRight).
 *
 * PURE: a street's measured mailboxes, [{ x, y, facing }] (screen px, where buildMailbox stands one), or null.
 */
export function measuredMailboxes(tsid) {
  const id = String(tsid || '');
  const aliases = [id];
  if (id.startsWith('G')) aliases.push(`L${id.slice(1)}`);
  if (id.startsWith('L')) aliases.push(`G${id.slice(1)}`);
  for (const alias of aliases) {
    const rows = MAILBOX_SPOTS[alias];
    if (rows?.length) {
      return rows.filter((r) => Number.isFinite(r?.[0]) && Number.isFinite(r?.[1])).map(([x, y, facing]) => ({ x, y, facing: facing === 2 ? 2 : 1 }));
    }
  }
  return null;
}

/**
 * PURE: the street's mailboxes the snaps show, at most the row's count ({ x, y, facing, fixed: true }).
 * street-ecology.js streetReservedSpots keeps every planned thing clear of them (the same on every
 * page and in the server's layout), and only the rest are planned.
 */
export function rowMailboxes(row, tsid) {
  return (measuredMailboxes(tsid) || []).slice(0, whole(row?.[MAILBOX_CLASS])).map((m) => ({ ...m, fixed: true }));
}

/**
 * Planner groups for one street row (notes beyond the planner cap pile up nearby). With the
 * street's `tsid`, the mailboxes the snaps show are not planned (rowMailboxes).
 */
export function furniturePlacementGroups(row, tsid = '') {
  if (!row) return [];
  const out = [];
  for (const [classTsid, group] of Object.entries(FURNITURE_GROUPS)) {
    if (fixedFurniturePoints(row, classTsid)) continue;
    let count = Math.min(PLANNER_GROUP_MAX, whole(row[classTsid]));
    if (classTsid === MAILBOX_CLASS) count -= rowMailboxes(row, tsid).length;
    if (count > 0) out.push({ key: group.key, count, clearance: group.clearance });
  }
  return out;
}

/**
 * World positions for `count` notes from the planner points: one per point,
 * and the rest in small deterministic piles beside the earlier points.
 */
export function notePositions(points = [], count = 0) {
  const usable = points.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
  if (!usable.length) return [];
  const out = [];
  for (let i = 0; i < whole(count); i += 1) {
    const base = usable[i % usable.length];
    const ring = Math.floor(i / usable.length);
    const offset = ring ? (ring % 2 ? 1 : -1) * 17 * Math.ceil(ring / 2) : 0;
    out.push({ x: Math.round(base.x + offset), y: base.y, pile: ring });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mailbox (per-player state machine from npc_mailbox.js)
// ---------------------------------------------------------------------------

export function createMailboxView() {
  return { open: false, doneUntil: 0 };
}

/** checkMail: interact while the panel is open. */
export function openMailboxView(view) {
  view.open = true;
  view.doneUntil = 0;
  return view;
}

/** mailStop: all_done for two seconds, then back to idle / has_mail. */
export function closeMailboxView(view, now = Date.now()) {
  if (!view.open) return view;
  view.open = false;
  view.doneUntil = now + MAILBOX_ALL_DONE_MS;
  return view;
}

/** The clip a street mailbox shows for this player. */
export function mailboxClip(view, unread = 0, now = Date.now()) {
  if (view?.open) return 'interact';
  if (view?.doneUntil && now < view.doneUntil) return 'all_done';
  return unread > 0 ? 'has_mail' : 'idle';
}

export function mailboxSubtitle(unread = 0) {
  const n = whole(unread);
  return n ? `${n} unread message${n === 1 ? '' : 's'} for you` : 'Check your mail';
}

// ---------------------------------------------------------------------------
// Notes (note.js / paper.js)
// ---------------------------------------------------------------------------

function cleanText(value, max) {
  return String(value ?? '').slice(0, max);
}

/** A retired notice's text as shown now (RETIRED_PIN_REWORDS), else the text as given. */
function rewordRetired(text) {
  return Object.hasOwn(RETIRED_PIN_REWORDS, text) ? RETIRED_PIN_REWORDS[text] : text;
}

export function normalizeNote(seed = {}) {
  const history = Array.isArray(seed.history) ? seed.history.slice(-NOTE_LIMITS.history) : [];
  return {
    id: String(seed.id || ''),
    initialTitle: cleanText(seed.initialTitle, NOTE_LIMITS.title),
    initialText: rewordRetired(cleanText(seed.initialText, NOTE_LIMITS.body)),
    title: cleanText(seed.title, NOTE_LIMITS.title),
    body: cleanText(seed.body, NOTE_LIMITS.body),
    ...(seed.remakeText ? { remakeText: true } : {}),
    // Multiplayer: the writer's character name on a note another player wrote (js/boards-mp.js).
    ...(seed.authorName ? { authorName: cleanText(seed.authorName, 64) } : {}),
    lastEditor: seed.lastEditor ? String(seed.lastEditor) : null,
    lastEdited: whole(seed.lastEdited, Number.MAX_SAFE_INTEGER),
    history: history.map((h) => ({
      title: cleanText(h?.title, NOTE_LIMITS.title),
      body: cleanText(h?.body, NOTE_LIMITS.body),
      editor: String(h?.editor || ''),
    })),
  };
}

/** readNote: initial instance text wins until somebody edits the note. */
export function noteContent(note) {
  const n = normalizeNote(note);
  const body = n.initialText ? n.initialText.replace(/\\n/g, '\n').replace(/&quot;/g, '"') : n.body;
  const title = n.initialTitle || n.title;
  return { title: title || NOTE_TEXT.defaultTitle, body };
}

/** Pen gate shared by note "write on", note views and paper "write on". */
function penReason(ctx = {}, { paper = false } = {}) {
  const learned = Array.isArray(ctx.learned) ? ctx.learned : [];
  if (!learned.includes(PENMANSHIP_SKILL)) return paper ? NOTE_TEXT.paperNeedPenmanship : NOTE_TEXT.needPenmanship;
  if (!ctx.quillWorking) return paper ? NOTE_TEXT.paperNeedQuill : NOTE_TEXT.needQuill;
  return '';
}

/** note.js "read": enabled unless the note has neither contents nor initial text. */
export function noteReadVerb(note) {
  const n = normalizeNote(note);
  const blank = !n.body && !n.initialText;
  return { id: 'read', label: 'Read', tooltip: 'What does it say?', enabled: !blank, reason: blank ? NOTE_TEXT.blank : '' };
}

/** note.js "write on": hidden (null) once somebody else edited the note. */
export function noteWriteVerb(note, ctx = {}) {
  const n = normalizeNote(note);
  const me = ctx.playerId || 'player';
  if (n.lastEditor && n.lastEditor !== me) return null;
  const reason = penReason(ctx);
  return { id: 'write_on', label: 'Write on', tooltip: 'Change what it says', enabled: !reason, reason };
}

/**
 * The note_view message (readNote): content plus why its edit button is
 * disabled. As in the source, a note somebody else (or nobody) last edited
 * reads "This is not your note." there; "Write on" is the way to claim it.
 */
export function noteView(note, ctx = {}) {
  const n = normalizeNote(note);
  const me = ctx.playerId || 'player';
  const reason = n.lastEditor !== me ? NOTE_TEXT.notYours : penReason(ctx);
  return { ...noteContent(n), lastEditor: n.lastEditor, lastEdited: n.lastEdited, disabledReason: reason, canEdit: !reason };
}

/**
 * note.js onInputBoxResponse: needs a working Quill, uses it once, clears the
 * initial instance text, truncates, records the editor and keeps 10 edits.
 * An unchanged save does nothing (and costs nothing).
 */
export function editNote(note, { title = '', body = '' } = {}, ctx = {}) {
  const n = normalizeNote(note);
  const me = ctx.playerId || 'player';
  if (n.lastEditor && n.lastEditor !== me) return { ok: false, error: NOTE_TEXT.notYours };
  const reason = penReason(ctx);
  if (reason) return { ok: false, error: reason === NOTE_TEXT.needQuill ? NOTE_TEXT.quillGone : reason };
  // The word filter (the remake's own addition, js/word-filter.js): written with a bad word as a grawlix.
  const nextTitle = filterText(cleanText(title, NOTE_LIMITS.title));
  const nextBody = filterText(cleanText(body, NOTE_LIMITS.body));
  if (!n.initialText && !n.initialTitle && n.body === nextBody && n.title === nextTitle) {
    return { ok: true, unchanged: true, note: n, costs: { quillWear: 0 } };
  }
  n.initialText = '';
  n.initialTitle = '';
  n.title = nextTitle;
  n.body = nextBody;
  n.lastEditor = me;
  n.lastEdited = whole(ctx.nowS ?? Math.floor(Date.now() / 1000), Number.MAX_SAFE_INTEGER);
  n.history.push({ title: nextTitle, body: nextBody, editor: me });
  if (n.history.length > NOTE_LIMITS.history) n.history = n.history.slice(-NOTE_LIMITS.history);
  return { ok: true, note: n, costs: { quillWear: 1 } };
}

/** paper.js "write on" conditions. */
export function paperWriteVerb(ctx = {}) {
  const reason = penReason(ctx, { paper: true });
  return { id: 'write_note', label: 'Write on', tooltip: 'Turn a piece of paper into a note', enabled: !reason, reason, primary: !reason };
}

/**
 * paper.js onInputBoxResponse + note.js edit: an empty note is never made;
 * otherwise one Paper becomes a Note written by the player (one Quill use).
 */
export function writePaperNote(carried = [], { title = '', body = '' } = {}, ctx = {}) {
  const reason = penReason(ctx, { paper: true });
  if (reason) return { ok: false, error: reason };
  if (!String(title).trim() && !String(body).trim()) return { ok: false, error: '', empty: true };
  if (!(whole(ctx.paper) > 0)) return { ok: false, error: NOTE_TEXT.paperGone };
  const id = `n${whole(ctx.nextId, 1e9) || carried.length + 1}`;
  const edited = editNote({ id }, { title, body }, ctx);
  if (!edited.ok) return edited;
  return { ok: true, note: edited.note, notes: [...carried, edited.note], costs: { paper: 1, quillWear: 1 } };
}

/**
 * Keep the carried-note texts in step with the pack count: a note dropped as
 * a plain stack loses its text, and a note from elsewhere arrives blank.
 */
export function reconcileCarried(carried = [], packCount = 0, nextId = 1) {
  const want = whole(packCount);
  const out = carried.slice(0, want).map(normalizeNote);
  let id = whole(nextId, 1e9) || 1;
  while (out.length < want) {
    out.push(normalizeNote({ id: `n${id}` }));
    id += 1;
  }
  return { notes: out, nextId: id };
}

// ---------------------------------------------------------------------------
// Notice boards
// ---------------------------------------------------------------------------

export function boardArtState(count = 0) {
  return `m${Math.min(BOARD_CAPACITY, whole(count))}`;
}

export function boardAddVerb(pins = [], carriedCount = 0) {
  if (pins.length >= BOARD_CAPACITY) return { id: 'add_note', label: 'Add a note', tooltip: BOARD_TEXT.tooltipAdd, enabled: false, reason: BOARD_TEXT.full };
  if (whole(carriedCount) < 1) return { id: 'add_note', label: 'Add a note', tooltip: BOARD_TEXT.tooltipAdd, enabled: false, reason: BOARD_TEXT.noNotes };
  return { id: 'add_note', label: 'Add a note', tooltip: BOARD_TEXT.tooltipAdd, enabled: true, reason: '' };
}

/** addNote: one carried note moves onto the board (capacity 10). */
export function pinNote(pins = [], carried = [], noteId) {
  if (pins.length >= BOARD_CAPACITY) return { ok: false, error: BOARD_TEXT.fullAdd };
  const index = carried.findIndex((n) => n.id === noteId);
  if (index < 0) return { ok: false, error: BOARD_TEXT.noNotesPost };
  const note = carried[index];
  return { ok: true, pins: [...pins, note], carried: carried.filter((_, i) => i !== index), note };
}

/** takeNote: a pinned note moves into the pack. */
export function takePinnedNote(pins = [], carried = [], noteId) {
  const index = pins.findIndex((n) => n.id === noteId);
  if (index < 0) return { ok: false, error: '' };
  const note = pins[index];
  return { ok: true, pins: pins.filter((_, i) => i !== index), carried: [...carried, note], note };
}

// ---------------------------------------------------------------------------
// Visiting Stone
// ---------------------------------------------------------------------------

/** visiting_stone.js verb list (the debug-free subset). */
export function stoneVerbs(ctx = {}) {
  const verbs = [
    { id: 'flip', label: 'Flip', tooltip: 'Turn it around', enabled: true, reason: '' },
    { id: 'visit', label: 'Visit', tooltip: "Visit a neighbour's home", enabled: !ctx.blocked, reason: ctx.blocked || '' },
  ];
  if (ctx.allowVisits) {
    verbs.push({ id: 'stop_random_visitors', label: 'Stop random visitors', tooltip: 'Opt out from receiving random visitors', enabled: true, reason: '' });
  } else {
    const gate = canOptIn(ctx);
    verbs.push({ id: 'get_visitors', label: 'Get visitors', tooltip: 'Opt in to receiving random visitors', enabled: gate.ok, reason: gate.ok ? '' : gate.reason });
  }
  return verbs;
}

/**
 * visiting_can_opt_in: level 4, a home street and an unboxed Butler
 * (ctx.hasButler; callers that leave it out skip the check). The source also
 * wants three cultivated items; cultivation lives in the homes feature, so
 * that check is skipped.
 */
export function canOptIn(ctx = {}) {
  if (whole(ctx.level) < STONE_LEVEL) return { ok: false, error: 'low_level', reason: STONE_TEXT.lowLevel };
  if (!ctx.homeOwned) return { ok: false, error: 'no_home', reason: STONE_TEXT.noHome };
  if (ctx.hasButler === false) return { ok: false, error: 'no_butler', reason: STONE_TEXT.noButler };
  return { ok: true };
}

/**
 * onPlayerCollision VOG lines (once per player), split on the source "//".
 * The source picks by pc.has_butler(); without that (ctx.hasButler unset)
 * level 4 and a home stand in.
 */
export function stoneVog(ctx = {}) {
  if (typeof ctx.hasButler === 'boolean') return ctx.hasButler ? STONE_TEXT.vogHigh : STONE_TEXT.vog;
  return whole(ctx.level) >= STONE_LEVEL && ctx.homeOwned ? STONE_TEXT.vogHigh : STONE_TEXT.vog;
}

/** True when the avatar is inside the 1200×1200 hit box centred on the stone. */
export function insideStoneHitbox(stone, player) {
  if (!stone || !player) return false;
  const half = STONE_HITBOX / 2;
  return Math.abs(player.x - stone.x) <= half && Math.abs(player.y - (stone.y - 77)) <= half;
}

// ---------------------------------------------------------------------------
// Authored note texts (the dump has no per-instance initial_text)
// ---------------------------------------------------------------------------

/** Remake text, not from Tiny Speck (flagged so views can mark it). */
const note = (title, text) => Object.freeze({ title, text, remake: true });

/**
 * Placed notes per street, in placement order. Counts match the archived
 * `Note` objrefs; uutiif's 59 notes are the end-of-game junk pile, where
 * twelve carry authored texts and the other 47 are left blank (the source's
 * own "It is blank :(" state) for players to write on.
 */
export const STREET_NOTES = Object.freeze({
  // Gregarious Towers (Groddle Meadow): apartment tower lobby
  GA5134UPLRU29OH: [
    note('Lost: one Piggy', 'Answers to Mr. Snoot. Last seen eating a doormat on floor 3. If found, please do not give him any more doormats. Reward: one slightly used Cherry.'),
  ],
  // Hauki Seeks Manor (Bortola)
  GA9H1V6OGRU2FSB: [
    note('Housekeeping', 'Please stop rearranging the portraits. They do it on their own, and they find it very confusing when you help.'),
    note('To whoever keeps knocking', 'The Manor is not haunted. The Manor is just old and a little dramatic. Please wipe your feet anyway.'),
  ],
  // Meadow Community Machine Room (Groddle Meadow)
  GCR101Q98A12EHH: [
    note('Machine Room Rules', '1. Clean the Blockmaker when you are done.\n2. The Fuelmaker is not a snack machine.\n3. Whoever taught the Woodworker to hum: thank you. It is much happier now.'),
  ],
  // Namaste (Nottis)
  GDO6NJEE1AE3MKL: [
    note('Breathe', 'In through the nose. Out through the ears, if you can manage it. Most of us can\'t, but it is nice to try.'),
  ],
  // The forgotten floor (Muufo)
  GDOOSA8V29J24I3: [
    note('Is anyone up here?', 'I came up the stairs on Tuesday. It is Friday now. The view is lovely. Please send snacks.'),
    note('Reply', 'It is Thursday, actually. Snacks are on the way. Do not eat the dust bunnies, they are friends.'),
    note('Note to self', 'Remember where you parked your Cubimal.'),
  ],
  // uutiif (Roobrik): the pile
  GDOU1UON87E3K2T: [
    note('Take what you need', 'Left my spare Spinach here. You look like you could use a hop.'),
    note('Free emblems', 'I had more emblems than shelf space. The Giants won\'t mind. Probably.'),
    note('For whoever finds this', 'It was a good game. Pet a Piggy for me.'),
    note('Inventory', 'Purple Flowers, Fiber, a Firefly Jar with nobody in it. All yours.'),
    note('Don\'t take the last Bean', 'Okay, you can take the last Bean.'),
    note('Portals', 'I built one door too many and then kept going. Some of them go somewhere.'),
    note('Left on a Bigger Bag', 'This bag is bigger. I checked.'),
    note('Hello from the pile', 'If you are reading this, you made it to uutiif. Welcome to the best junk drawer in Ur.'),
    note('Recipe', '1 Pumpkin Ale, 1 friend, 1 long walk home. Serves 2.'),
    note('Keys', 'These keys open nothing I know of. Maybe they open something you know of.'),
    note('A small thank you', 'To everyone who ever squeezed a Chicken with me: thank you. It was always worth the feathers.'),
    note('Musicblocks', 'I left a few tunes behind. Shake one when it gets too quiet.'),
  ],
  // Egret Taun Towers Basement (Besara): three gardens
  GHVEI9NVJ203LRO: [
    note('Garden rota', 'Monday: water the gardens. Tuesday: water the gardens again, because Monday forgot. Wednesday onward: see Monday.'),
    note('Missing trowel', 'If you borrowed my trowel, I\'m not angry. I\'m just disappointed. And also slightly angry.'),
    note('The basement smells like onions', 'That is not a complaint. It is a compliment to whoever is growing them.'),
  ],
  // Hakusan Heaps Towers (Muufo)
  GHVUFJ6HGRU2V0E: [
    note('Welcome, neighbour!', 'The lift is out of order (we never had a lift). The stairs are in excellent order. Mind the third step, it likes to be noticed.'),
  ],
  // Gregarious Grange (Groddle Meadow)
  GLI32G3NUTD100I: [
    note('Form 27-B Stroke 6', 'Before filling out this form, please fill out Form 27-B Stroke 5, which explains how to fill out this form. Thank you for your patience. Your patience has been filed.'),
  ],
});

/**
 * Neutral notices for the boards, plainly ours (G175). The words players
 * pinned are theirs and do not ship, but the Glitch Tribute Blog
 * (johnexploresur.tumblr.com, late 2012, reference only) transcribed every
 * notice on five boards, so those boards carry as many pins as it shows, and
 * the board art's own "m" + count state then draws Tiny Speck's pin layout for
 * that number: Hakusan Heaps Towers 5 (posts 43184658883-43259368088), Besara
 * Community Machine Room 5 (41388998992-41461262547), Egret Taun Towers 7
 * (41208895411-41298594230), Sabudana Drama Towers 6 (40388154117-
 * 40483430501), Hauki Seeks Manor 6 (48382666370-48468991839; the lobby shot
 * 48374460546 shows those six pins). Nothing survives for Gregarious Towers or
 * the Meadow Community Machine Room, so they keep three each. List in
 * research/coverage/round4-people-2026-10-31/boards/notice-posts.tsv.
 */
const PIN = Object.freeze({
  welcome: (place) => note('Welcome', `Welcome to ${place}. This board is for everyone who passes through.`),
  howTo: note('How to post', 'Write on a Note with a Quill, then choose Add a note to pin it here.'),
  room: note('Room for ten', 'This board holds ten notes. Take one down to make room for yours.'),
  take: note('Take one', 'A note you take goes into your pack. You can pin it back any time.'),
  lost: note('Lost and found', 'Found something? Pin a note saying where you left it.'),
  spare: note('Spare things', 'Have something to spare? Say what it is and where to find it.'),
  machines: note('The machines', 'The machines here are for everyone. Please leave them ready for the next visitor.'),
  kind: note('Be kind', 'Please keep notices friendly.'),
});

/** Notices already pinned to each archived Notice Board (counts above). */
export const BOARD_PINS = Object.freeze({
  // Gregarious Towers (no source: three, as before)
  GA5134UPLRU29OH: [PIN.welcome('Gregarious Towers'), PIN.howTo, PIN.kind],
  // Hauki Seeks Manor: 6
  GA9H1V6OGRU2FSB: [PIN.welcome('Hauki Seeks Manor'), PIN.howTo, PIN.room, PIN.take, PIN.lost, PIN.kind],
  // Besara Community Machine Room: 5
  GA9MU59GB792T80: [PIN.welcome('the Besara Community Machine Room'), PIN.machines, PIN.howTo, PIN.spare, PIN.kind],
  // Meadow Community Machine Room (no source: three, as before)
  GCR101Q98A12EHH: [PIN.welcome('the Meadow Community Machine Room'), PIN.machines, PIN.howTo],
  // Hakusan Heaps Towers: 5
  GHVUFJ6HGRU2V0E: [PIN.welcome('Hakusan Heaps Towers'), PIN.howTo, PIN.room, PIN.lost, PIN.kind],
  // Egret Taun Towers: 7
  GHVUR3UKGRU2SD2: [PIN.welcome('Egret Taun Towers'), PIN.howTo, PIN.room, PIN.take, PIN.lost, PIN.spare, PIN.kind],
  // Sabudana Drama Towers: 6
  GIFI4FP9GRU2CC8: [PIN.welcome('Sabudana Drama Towers'), PIN.howTo, PIN.room, PIN.take, PIN.spare, PIN.kind],
});

/** How many notices the Tribute Blog shows on each board it covers (see BOARD_PINS). */
export const BOARD_PIN_SOURCE_COUNTS = Object.freeze({
  GA9H1V6OGRU2FSB: 6,
  GA9MU59GB792T80: 5,
  GHVUFJ6HGRU2V0E: 5,
  GHVUR3UKGRU2SD2: 7,
  GIFI4FP9GRU2CC8: 6,
});

/**
 * The invented notices the boards carried before 2026-10-31. A save may still
 * hold them: they stay labelled as remake text, and a board still holding
 * only those (nobody pinned, took or wrote anything) is seeded afresh.
 */
export const RETIRED_BOARD_PIN_TEXTS = Object.freeze([
  'Potluck on the roof this Saturday. Bring a dish. Bring a chair. Do not bring the Rook.',
  'Please keep Musicblocks below a gentle jangle after dark.',
  'Leave something, take something. Last week somebody left a whole Cubimal. We are still talking about it.',
  'Brave visitors for a tour of the upper rooms. Lanterns provided. Courage not included.',
  'One monocle, one glove, one very small hat. If they are yours, you are probably a very small butler.',
  'Blockmaker: Mon, Wed, Fri. Woodworker: whenever it is in the mood.',
  'The Metal Machine has been tuned. It now goes clunk instead of clonk.',
  'We are low on fuel cells again. Please make two if you use one.',
  'To whoever oiled the Woodworker: it hums now.',
  'It has a little chip in the handle and a lot of sentimental value.',
  'New in the Towers? Knock on any door. Somebody will have tea, or at least hot water and good intentions.',
  'Please stop polishing the stairs. They are already very slippery and very proud.',
  'Spare seeds in the jar by the door. Take a handful, grow a mouthful.',
  'Tower dues are one smile per week, payable to the nearest neighbour.',
  'The Towers\' players seek a Piggy to play a Piggy. Method actors welcome.',
  'Hats in the lobby box. Please return the tall one, it has a career.',
  'Opening night! Applause is free. Encores are also free, but please pace yourselves.',
]);

/**
 * Retired notices reworded since (old text -> the text shown now): our own
 * copy never says the game's name (Austin's rule; the original's own texts keep
 * it). A save from before the change may still hold the old words, so they stay
 * here only as a key: normalizeNote shows the new words, and a board holding
 * nothing but untouched retired notices is still seeded afresh.
 */
export const RETIRED_PIN_REWORDS = Object.freeze({
  'To the kind Glitch who oiled the Woodworker: it hums now.': 'To whoever oiled the Woodworker: it hums now.',
});

/**
 * Where a board hung, when a picture shows it (street world px, the board's
 * bottom-centre as drawn: art anchor 0.99, 2 px down). Hauki Seeks Manor: the
 * Tribute Blog's lobby shot (post 48374460546, the whole 1500 px lobby at
 * 1280 px) has it on the wall right of the lift, its frame 884-1061 x
 * 254-367 in the shot, so centre x 390, frame foot at screen y 430 (the art's
 * frame ends 10 px above its anchor). Other boards keep the planner's spot.
 */
export const BOARD_SPOTS = Object.freeze({
  GA9H1V6OGRU2FSB: Object.freeze([Object.freeze({ x: 390, y: -202 })]),
});

/**
 * A street's furniture row with its board pinned to BOARD_SPOTS (screen
 * space), when the row has a board and no fixed spot of its own.
 */
export function boardSpotRow(row, street) {
  const spots = BOARD_SPOTS[String(street?.tsid || '')];
  if (!row || !spots || !street?.bounds || !whole(row[BOARD_CLASS]) || row.at?.[BOARD_CLASS]) return row;
  const at = spots.map((p) => ({ ...worldToScreen(street, p.x, p.y), wall: true }));
  return { ...row, at: { ...(row.at || {}), [BOARD_CLASS]: at } };
}

/** Initial notes for a street's `count` placed notes (blank beyond the authored list). */
export function streetNoteSeeds(tsid, count) {
  const authored = STREET_NOTES[String(tsid)] || [];
  const out = [];
  for (let i = 0; i < whole(count); i += 1) {
    const row = authored[i];
    out.push(normalizeNote({ id: `s${i}`, initialTitle: row?.title || '', initialText: row?.text || '', remakeText: Boolean(row?.remake) }));
  }
  return out;
}

/** Initial pins for a board (instance texts are authored, see BOARD_PINS). */
export function boardPinSeeds(tsid) {
  return (BOARD_PINS[String(tsid)] || []).map((row, i) =>
    normalizeNote({ id: `b${i}`, initialTitle: row.title, initialText: row.text, remakeText: Boolean(row.remake) })
  );
}

/**
 * Every note text the remake wrote, the old words of reworded notices too (a
 * note carried from before a rewording still counts as ours; the realtime
 * server's data/boards.json `remake` list comes from this).
 */
export const REMAKE_NOTE_TEXTS = Object.freeze([...new Set([
  ...[...Object.values(STREET_NOTES), ...Object.values(BOARD_PINS)].flat().map((row) => row.text),
  ...RETIRED_BOARD_PIN_TEXTS,
  ...Object.keys(RETIRED_PIN_REWORDS),
])].sort());
const REMAKE_TEXTS = new Set(REMAKE_NOTE_TEXTS);
const RETIRED_PINS = new Set(RETIRED_BOARD_PIN_TEXTS);

/**
 * A saved board's pins, or fresh seeds when it still holds only the retired
 * invented notices, untouched (see RETIRED_BOARD_PIN_TEXTS).
 */
export function refreshBoardPins(pins, tsid) {
  if (!Array.isArray(pins) || !pins.length) return pins;
  const stale = pins.every((p) => {
    const n = normalizeNote(p);
    return !n.lastEditor && !n.history.length && RETIRED_PINS.has(n.initialText);
  });
  return stale ? boardPinSeeds(tsid) : pins;
}

/**
 * True while a note still shows text written for the remake: seeded from
 * STREET_NOTES / BOARD_PINS (or an older save holding one of their texts)
 * and not yet written over by a player.
 */
export function isRemakeNote(note) {
  const n = normalizeNote(note);
  if (!n.initialText && !n.initialTitle) return false;
  return Boolean(note?.remakeText) || REMAKE_TEXTS.has(n.initialText);
}

/** The marker the note view shows on remake text. */
export const REMAKE_NOTE_MARKER = 'Written for this remake';
export const REMAKE_NOTE_BYLINE = 'Not from the original game: its note texts were not saved.';
