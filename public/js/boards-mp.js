/**
 * Notice Boards shared by everyone on the street in multiplayer (Austin
 * 2026-11-04): the pure rules and words. features/boards-mp-feature.js talks
 * to the realtime server (groddle-afternoon-server boards.go, whose header
 * lists the messages and the source rules) and hands the shared notes to
 * features/street-furniture-feature.js, which draws the board as it always
 * did; the site keeps the notes (src/LedgerBoard.php). Solo never reads this
 * file: there a board's notes stay in the player's own save.
 *
 * Sources (glitch-GameServerJS):
 * - items/bag_notice_board.js: one board in the location for everyone, ten
 *   notes (onCreate 155), "add a note" takes the Note out of the pack
 *   (addNote 127-148), anyone may take any note (updateStatus can_take,
 *   takeNote 169-184), each listed with its last editor's name (203-210).
 * - items/note.js: the last editor travels with the note (251), title 150
 *   and body 1000 characters (246-247).
 *
 * Ours: the opening notices are the remake's own (BOARD_PINS), pinned online
 * once and marked as the remake's; a note's words go through the word filter
 * when pinned (the server's wordfilter.go; js/word-filter.js already filters
 * them when written, street-furniture.js editNote); Report sends a note to the
 * administrators as a report ticket.
 */

import { noteContent } from './street-furniture.js?v=cf1d21b1';

/** Where the site and server ids come from (boards.go boardOpRe, boardSeedRe). */
export const BOARD_NOTE_ID = /^board-([0-9a-f]{16}|seed-[A-Z0-9]{1,32}-[0-9]{1,2})$/;

/** A carried note's writer when it is another player ("player:<id>", as gifts carry it). */
const OTHER_EDITOR = /^player:(\d{1,12})$/;

export const BOARD_MP_TEXT = Object.freeze({
  pinned: (title) => `You pinned a note to the notice board: ${title}`, // the solo line (street-furniture-feature addToBoard)
  took: (title) => `You took a note from the notice board: ${title}`, // the solo line (openBoard onTake)
  busy: 'Wait a moment, you are still pinning a note.', // boards.go
  taking: 'Wait a moment, that note is on its way.', // ours
  offline: "The notice board can't be reached right now.", // boards.go boardTextOff
  loading: 'The notice board is still being read. Try again in a moment.', // ours
  gone: 'That note is no longer on the board.', // boards.go
  report: 'Report',
  reportTitle: 'Report this note?',
  reportLabel: 'Why are you reporting it? (You can leave this empty.)',
  reportSend: 'Send report',
  reportHint: 'It goes to the administrators with the note\'s words, and shows in your Reports.',
  reported: 'Thanks. The administrators will look at that note.',
  reportedAlready: 'You have already reported that note.',
  reportFailed: "That didn't send. Try again in a moment.",
  byRemake: 'Not from the original game: its note texts were not saved.', // street-furniture.js REMAKE_NOTE_BYLINE
  by: (name) => `Written by ${name}`,
});

function finite(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function text(v, max) {
  return String(v ?? '').slice(0, max);
}

/**
 * A note as the server or the site sends it, as street-furniture's board draws its pins (a
 * normalizeNote shape): the remake's own words as initial text with remakeText (so the view
 * marks them), anyone else's with lastEditor "player:<id>" and authorName, yours as "player".
 * Null when it is not one.
 */
export function normalizeBoardNote(raw, me = 0) {
  if (!raw || typeof raw !== 'object' || !BOARD_NOTE_ID.test(String(raw.id || ''))) return null;
  const title = text(raw.title, 150);
  const body = text(raw.body, 1000);
  const at = Math.max(0, Math.floor(finite(raw.at) / 1000));
  if (raw.remake === true) {
    return { id: String(raw.id), initialTitle: title, initialText: body, title: '', body: '', remakeText: true, lastEditor: null, lastEdited: 0, history: [], shared: true };
  }
  const author = raw.author && typeof raw.author === 'object' ? { id: Math.floor(finite(raw.author.id)), name: text(raw.author.name || 'Someone', 64) } : null;
  const mine = !author || (me > 0 && author.id === me);
  const out = { id: String(raw.id), initialTitle: '', initialText: '', title, body, lastEditor: mine && author ? 'player' : author ? `player:${author.id}` : null, lastEdited: at, history: [], shared: true };
  if (author && !mine) out.authorName = author.name;
  return out;
}

/** A street's notes from board_state ({ street, capacity, notes }), oldest first. */
export function boardFrom(msg, me = 0) {
  const street = String(msg?.street || '');
  const board = (Array.isArray(msg?.boards) ? msg.boards : []).find((b) => Number(b?.board) === 0);
  const notes = (Array.isArray(board?.notes) ? board.notes : []).map((n) => normalizeBoardNote(n, me)).filter(Boolean);
  return { street, capacity: Math.max(1, Math.min(10, Math.floor(finite(msg?.capacity, 10)))), notes };
}

/** A note taken off a board as the pack carries it (street-furniture's carried notes; LedgerBoard::carriedNote). */
export function carriedFromBoard(note) {
  if (!note) return null;
  const { shared, id, ...rest } = note;
  return rest;
}

/**
 * What a pin sends for a carried note: its words as it reads (initial text wins, as noteContent
 * reads them, but an untitled note stays untitled) and who wrote it when that is another player.
 */
export function pinPayload(note) {
  const title = String(note?.initialTitle || note?.title || '');
  const body = noteContent(note || {}).body;
  const m = OTHER_EDITOR.exec(String(note?.lastEditor || ''));
  return { note: { title, body }, author: m ? Number(m[1]) : 0 };
}

/** The byline a shared note shows: the remake's, its writer's name, or yours. */
export function boardByline(note) {
  if (note?.remakeText) return BOARD_MP_TEXT.byRemake;
  if (note?.authorName) return BOARD_MP_TEXT.by(note.authorName);
  return '';
}

/** A row of GET groddle/v1/boards/mine as an op the save applies: { op, side, id, note } or null. */
export function normalizeMineBoard(row, me = 0) {
  const op = String(row?.op || '');
  const id = String(row?.id || '');
  if (!BOARD_NOTE_ID.test(id) || (op !== id && op !== `${id}-t`)) return null;
  const note = normalizeBoardNote({ ...(row?.note || {}), id }, me);
  if (!note) return null;
  return { op, id, side: op === id ? 'pinned' : 'took', note };
}

/** Whether two notes read the same (a pin's answer finds the carried note it came from). */
export function sameWords(a, b) {
  const pa = pinPayload(a).note;
  const pb = pinPayload(b).note;
  return pa.title === pb.title && pa.body === pb.body;
}
