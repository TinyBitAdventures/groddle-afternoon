/**
 * Notice Boards shared online (Austin 2026-11-04): in multiplayer a board is
 * everyone's on the street, kept by the site (groddle-afternoon-site
 * src/LedgerBoard.php, the console's src/AdminBoards.php) and run live by the
 * realtime server (groddle-afternoon-server boards.go, its rules in
 * boards_test.go). Here: the pure rules (js/boards-mp.js), the feature's
 * session against a fake socket (features/boards-mp-feature.js with
 * street-furniture-feature's carried notes), the wiring and both skins,
 * the server's data (tools/build-realtime-boards.mjs) and the site's
 * routes through php -r. Solo is untouched: its boards stay in the save.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  BOARD_MP_TEXT,
  BOARD_NOTE_ID,
  boardByline,
  boardFrom,
  carriedFromBoard,
  normalizeBoardNote,
  normalizeMineBoard,
  pinPayload,
  sameWords,
} from '../public/js/boards-mp.js?v=9f6f492b';
import { BOARD_PINS, NOTE_LIMITS, REMAKE_NOTE_BYLINE, REMAKE_NOTE_MARKER, isRemakeNote, noteContent, normalizeNote, noteWriteVerb } from '../public/js/street-furniture.js?v=d99e92c5';
import { boardsMpFeature, createBoardsSession } from '../public/js/features/boards-mp-feature.js?v=5632f15c';
import { carriedNoteList, giveCarriedNote, streetFurnitureFeature } from '../public/js/features/street-furniture-feature.js?v=b9aec0aa';
import { boardsData } from '../tools/build-realtime-boards.mjs';
import { HAS_SITE, SITE_DIR, serverPath, sitePath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipPhp = skipWithoutSite || (!hasPhp && 'no php');
const OP = 'board-00000000000000a1';
const SEED = 'board-seed-GA5134UPLRU29OH-0';

function php(body) {
  const code = `foreach (['WordFilter', 'LedgerMath', 'LedgerGift', 'BugReports', 'AdminConsole', 'LedgerBoard', 'AdminBoards'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\LedgerBoard; use Groddle\\Minn\\AdminBoards; echo json_encode(${body}, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);`;
  return JSON.parse(execFileSync('php', ['-r', code]).toString());
}

describe('the rules (js/boards-mp.js)', () => {
  it('reads the remake\'s opening notices as the remake\'s, marked, with no writer', () => {
    const n = normalizeBoardNote({ id: SEED, title: 'Welcome', body: 'Welcome to Gregarious Towers.', author: null, remake: true, at: 1700000000000 }, 7);
    assert.equal(n.initialText, 'Welcome to Gregarious Towers.');
    assert.equal(n.remakeText, true);
    assert.equal(isRemakeNote(n), true);
    assert.equal(boardByline(n), REMAKE_NOTE_BYLINE);
    assert.equal(noteContent(n).title, 'Welcome');
    assert.ok(BOARD_NOTE_ID.test(SEED) && BOARD_NOTE_ID.test(OP));
    assert.equal(normalizeBoardNote({ id: 'drop-00000000000000a1', title: 'x' }), null, 'only the server\'s ids');
  });

  it('names another player\'s note and keeps it theirs; yours stays yours to write on', () => {
    const ada = normalizeBoardNote({ id: OP, title: 'Lost hat', body: 'Blue.', author: { id: 7, name: 'Ada' }, remake: false, at: 1700000000000 }, 9);
    assert.equal(ada.lastEditor, 'player:7');
    assert.equal(ada.authorName, 'Ada');
    assert.equal(boardByline(ada), 'Written by Ada');
    assert.equal(noteWriteVerb(ada, { playerId: 'player', learned: ['penmanship_1'], quillWorking: true }), null, 'note.js 126: hidden once another Glitch is the last editor');
    const mine = normalizeBoardNote({ id: OP, title: 'Lost hat', body: 'Blue.', author: { id: 9, name: 'Bo' }, remake: false, at: 1700000000000 }, 9);
    assert.equal(mine.lastEditor, 'player');
    assert.equal(mine.authorName, undefined);
    assert.ok(noteWriteVerb(mine, { playerId: 'player', learned: ['penmanship_1'], quillWorking: true }).enabled);
  });

  it('carries a taken note with its words and writer, and a carried note normalises the same', () => {
    const ada = normalizeBoardNote({ id: OP, title: 'Lost hat', body: 'Blue.', author: { id: 7, name: 'Ada' }, at: 1700000000000 }, 9);
    const c = normalizeNote({ ...carriedFromBoard(ada), id: 'n3' });
    assert.equal(c.authorName, 'Ada');
    assert.equal(c.lastEditor, 'player:7');
    assert.equal(c.body, 'Blue.');
    assert.equal(c.shared, undefined, 'nothing of the board\'s left on it');
  });

  it('pins a carried note\'s words as it reads, with its writer when that is someone else', () => {
    assert.deepEqual(pinPayload({ title: '', body: 'Hello' }), { note: { title: '', body: 'Hello' }, author: 0 }, 'an untitled note stays untitled');
    assert.deepEqual(pinPayload({ initialTitle: 'Welcome', initialText: 'Hi\\nthere', remakeText: true }), { note: { title: 'Welcome', body: 'Hi\nthere' }, author: 0 });
    assert.deepEqual(pinPayload({ title: 'T', body: 'B', lastEditor: 'player:7' }), { note: { title: 'T', body: 'B' }, author: 7 });
    assert.deepEqual(pinPayload({ title: 'T', body: 'B', lastEditor: 'player' }).author, 0);
    assert.ok(sameWords({ title: 'T', body: 'B' }, { initialTitle: 'T', initialText: 'B' }));
    assert.ok(!sameWords({ title: 'T', body: 'B' }, { title: 'T', body: 'C' }));
  });

  it('reads the server\'s board and the site\'s missed ops', () => {
    const b = boardFrom({ street: 'GA5134UPLRU29OH', capacity: 10, boards: [{ board: 0, notes: [{ id: SEED, title: 'Welcome', body: 'x', remake: true }, { id: 'nope' }] }] });
    assert.equal(b.street, 'GA5134UPLRU29OH');
    assert.deepEqual(b.notes.map((n) => n.id), [SEED]);
    assert.deepEqual(normalizeMineBoard({ op: OP, id: OP, side: 'pinned', note: { title: 'a', body: 'b' } }).side, 'pinned');
    assert.equal(normalizeMineBoard({ op: `${OP}-t`, id: OP, note: { title: 'a', body: 'b' } }).side, 'took');
    assert.equal(normalizeMineBoard({ op: 'gift-00000000000000a1', id: OP, note: {} }), null);
  });

  it('keeps its words plain', () => {
    for (const w of Object.values(BOARD_MP_TEXT)) {
      const t = typeof w === 'function' ? w('X') : w;
      assert.ok(!/[—–]|Glitch/.test(t), t);
    }
  });
});

/** A fake realtime client: frames sent, handlers by kind. */
function fakeClient(street) {
  const on = {};
  return {
    state: 'online',
    street,
    sent: [],
    send(kind, payload) { this.sent.push({ kind, ...payload }); return true; },
    on(kind, fn) { (on[kind] ||= []).push(fn); },
    emit(kind, msg) { for (const fn of on[kind] || []) fn(msg); },
  };
}

function fakeEngine(street, applied = []) {
  const seen = new Set(applied);
  const calls = { toasts: [], activity: [], data: {}, saves: 0, sounds: [] };
  return {
    calls,
    mode: 'multiplayer',
    streetTsid: street,
    inv: {},
    query(name, id) {
      if (name !== 'ledgerReceipt') return null;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    },
    toast: (t) => calls.toasts.push(t),
    pushActivity: (t) => calls.activity.push(t),
    setData: (k, v) => { calls.data[k] = v; },
    playSound: (s) => calls.sounds.push(s),
    refreshPack() {},
    updateHud() {},
    save() { calls.saves += 1; },
  };
}

const flush = () => new Promise((r) => setImmediate(r));
const STREET = 'GA5134UPLRU29OH';

describe('the feature\'s session (features/boards-mp-feature.js)', () => {
  it('shows the server\'s board, pins a carried note once and takes one once, live', async () => {
    streetFurnitureFeature.restore({});
    const engine = fakeEngine(STREET);
    const client = fakeClient(STREET);
    const account = { boards: async () => ({ boards: [] }) };
    const s = createBoardsSession(engine, client, { account, me: 9, flush: () => true });
    assert.deepEqual(s.board(STREET), { ready: false, capacity: 10, notes: [] }, 'nothing until the server lists it');
    assert.equal(s.board('HOME_9'), null, 'a private place keeps its own');
    client.emit('msg:board_state', { street: STREET, capacity: 10, boards: [{ board: 0, notes: [{ id: SEED, title: 'Welcome', body: 'Hi', remake: true, at: 1 }] }] });
    assert.equal(s.board(STREET).ready, true);
    assert.equal(s.board(STREET).notes.length, 1);
    assert.equal(engine.calls.data.boardShared, `${STREET}:1`);

    // Bo pins a note he wrote.
    giveCarriedNote(engine, { title: 'Lost hat', body: 'Blue, with a feather.', lastEditor: 'player' });
    assert.equal(engine.inv.note, 1);
    const note = carriedNoteList(engine)[0];
    assert.equal(s.pin(note), true);
    await flush();
    assert.deepEqual(client.sent.at(-1), { kind: 'board_pin', ref: s.pinning.ref, board: 0, note: { title: 'Lost hat', body: 'Blue, with a feather.' }, author: 0 });
    assert.equal(engine.inv.note, 1, 'nothing leaves the pack until the server says so');
    assert.equal(s.pin(note), false, 'one at a time');
    const ref = s.pinning.ref;
    const pinned = { t: 'board_pinned', op: OP, ref, status: 'settled', note: { id: OP, title: 'Lost hat', body: 'Blue, with a feather.', author: { id: 9, name: 'Bo' }, remake: false, at: 2000 } };
    client.emit('msg:board_pinned', pinned);
    assert.equal(engine.inv.note, 0);
    assert.equal(carriedNoteList(engine).length, 0);
    assert.equal(s.board(STREET).notes.length, 2);
    client.emit('msg:board_added', { street: STREET, board: 0, note: pinned.note });
    assert.equal(s.board(STREET).notes.length, 2, 'the street\'s broadcast does not double it');
    // A missed answer listed again by the site applies nothing a second time.
    client.emit('msg:board_pinned', pinned);
    assert.equal(engine.inv.note, 0);
    assert.match(engine.calls.activity.join('|'), /You pinned a note to the notice board: Lost hat/);

    // Bo takes the remake's notice: once.
    assert.equal(s.take(SEED), true);
    assert.deepEqual(client.sent.at(-1), { kind: 'board_take', id: SEED });
    const took = { t: 'board_taken', op: `${SEED}-t`, id: SEED, status: 'settled', note: { id: SEED, title: 'Welcome', body: 'Hi', author: null, remake: true, at: 1 } };
    client.emit('msg:board_taken', took);
    client.emit('msg:board_taken', took);
    client.emit('msg:board_gone', { street: STREET, board: 0, id: SEED, by: { id: 9, name: 'Bo' }, why: 'taken' });
    assert.equal(engine.inv.note, 1);
    const carried = carriedNoteList(engine);
    assert.equal(carried.length, 1);
    assert.equal(carried[0].initialText, 'Hi');
    assert.equal(isRemakeNote(carried[0]), true, 'still marked as the remake\'s in the pack');
    assert.deepEqual(s.board(STREET).notes.map((n) => n.id), [OP]);

    // Someone else's take of Bo's note, seen live.
    client.emit('msg:board_gone', { street: STREET, board: 0, id: OP, by: { id: 7, name: 'Ada' }, why: 'taken' });
    assert.equal(s.board(STREET).notes.length, 0);
    assert.equal(s.take(OP), false, 'gone');

    // A refusal says the server's words and moves nothing.
    s.pin(carried[0]);
    await flush();
    client.emit('msg:board_pinned', { t: 'board_pinned', ref: s.pinning.ref, status: 'refused', why: 'full', text: 'The notice board is already full! You\'ll have to remove a note before you can add another.' });
    assert.equal(engine.inv.note, 1);
    assert.match(engine.calls.toasts.at(-1), /already full/);

    // Off the server: the board is not read, and nothing is sent.
    client.state = 'offline';
    client.emit('state', { state: 'offline' });
    assert.deepEqual(s.board(STREET), { ready: false, capacity: 10, notes: [] });
    assert.equal(s.pin(carried[0]), false);
  });

  it('applies what the site says was missed, once (GET groddle/v1/boards/mine)', async () => {
    streetFurnitureFeature.restore({});
    const engine = fakeEngine(STREET, [`${OP}-t`]);
    const client = fakeClient(STREET);
    const rows = [
      { op: `${SEED}-t`, side: 'took', id: SEED, note: { title: 'Welcome', body: 'Hi', author: null, remake: true, at: 1 } },
      { op: `${OP}-t`, side: 'took', id: OP, note: { title: 'Again', body: 'x', author: { id: 7, name: 'Ada' }, at: 1 } },
    ];
    createBoardsSession(engine, client, { account: { boards: async () => ({ boards: rows }) }, me: 9, flush: () => true });
    await flush();
    await flush();
    assert.equal(engine.inv.note, 1, 'the one not applied yet');
    assert.equal(carriedNoteList(engine)[0].initialTitle, 'Welcome');
  });

  it('reports a note through the site and says so', async () => {
    const engine = fakeEngine(STREET);
    const asked = [];
    const s = createBoardsSession(engine, fakeClient(STREET), { account: { boards: async () => ({}), reportBoardNote: async (id, why) => { asked.push([id, why]); return { status: asked.length > 1 ? 'already' : 'reported' }; } }, me: 9, flush: () => true });
    assert.deepEqual(await s.report(OP, 'Rude'), { ok: true, text: BOARD_MP_TEXT.reported });
    assert.deepEqual(await s.report(OP, ''), { ok: true, text: BOARD_MP_TEXT.reportedAlready });
    assert.deepEqual(asked, [[OP, 'Rude'], [OP, '']]);
    assert.equal((await s.report('nope')).ok, false);
  });
});

describe('solo is untouched; the wiring', () => {
  it('answers no hook in solo', () => {
    const engine = { mode: 'solo', started: true, query: () => null };
    boardsMpFeature.init(engine);
    assert.equal(boardsMpFeature.sharedBoard(STREET, engine), null);
    assert.equal(boardsMpFeature.sharedBoardPin({ id: 'n1' }, engine), null);
    assert.equal(boardsMpFeature.sharedBoardTake(OP, engine), null);
    assert.equal(boardsMpFeature.sharedBoardReport(OP, '', engine), null);
    boardsMpFeature.onTick(16, 0, engine);
    assert.equal(globalThis.groddleBoards, undefined);
  });

  it('is registered once, after trade-feature (ledgerReceipt) and before street-objects; it shares street-furniture\'s module', () => {
    const index = read('public/js/features/index.js');
    assert.equal((index.match(/boards-mp-feature\.js/g) || []).length, 1);
    assert.ok(index.indexOf('boards-mp-feature.js') > index.indexOf('trade-feature.js'));
    assert.ok(index.indexOf('boards-mp-feature.js') < index.indexOf('street-objects-feature.js'));
    const key = /street-furniture-feature\.js\?v=([0-9a-f]{8})/;
    assert.equal(read('public/js/features/boards-mp-feature.js').match(key)[1], index.match(key)[1], 'one instance holds the carried notes');
  });

  it('the board asks the hooks only for its own board 0, never a demo board, and keeps the solo path', () => {
    const src = read('public/js/features/street-furniture-feature.js');
    const of = src.slice(src.indexOf('function sharedBoardOf('), src.indexOf('function pinsFor('));
    assert.match(of, /if \(!entity \|\| entity\.pins \|\| entity\.index !== 0\) return null;/);
    assert.match(of, /engine\.query\?\.\('sharedBoard', engine\.streetTsid, engine\)/);
    const open = src.slice(src.indexOf('function openBoard('), src.indexOf('function addToBoard('));
    assert.match(open, /engine\.query\?\.\('sharedBoardTake', id, engine\)/);
    assert.match(open, /takePinnedNote\(pinsFor\(engine, entity\), carried, id\)/, 'solo still takes from the save');
    const add = src.slice(src.indexOf('function addToBoard('), src.indexOf('// Visiting Stones'));
    assert.match(add, /engine\.query\?\.\('sharedBoardPin', note, engine\)/);
    assert.match(add, /pinNote\(pinsFor\(engine, entity\), carried, id\)/);
    assert.match(src, /extra\.push\(\{ label: BOARD_MP_TEXT\.report, onClick: \(\) => reportSharedNote\(engine, entity, note\) \}\)/);
  });

  it('keeps the board art, limit and lines exactly as solo', () => {
    const src = read('public/js/features/street-furniture-feature.js');
    assert.match(src, /BOARD_ART\.path\(Math\.min\(BOARD_CAPACITY, count\)\)/);
    assert.equal(NOTE_LIMITS.title, 150);
    assert.equal(NOTE_LIMITS.body, 1000);
    assert.match(read('public/js/boards-mp.js'), /pinned: \(title\) => `You pinned a note to the notice board: \$\{title\}`/);
    assert.match(src, /engine\.pushActivity\(`You pinned a note to the notice board: \$\{noteTitle\(stamped\)\}`\)/);
  });

  it('both skins: the board windows are the note view\'s own, and Classic restyles none of their hooks away', () => {
    const view = read('public/js/note-view.js');
    assert.match(view, /export function openReportView\(/);
    assert.match(view, /'data-note-report': ''/);
    assert.match(view, /className: 'board-by'/);
    const classic = read('public/css/classic.css');
    assert.doesNotMatch(classic, /\.note-view|\.board-card|\.board-pin|data-note-report/, 'Classic draws them as Modern does');
    for (const token of view.match(/var\(--[a-z0-9-]+\)/g)) assert.ok(read('public/style.css').includes(`${token.slice(4, -1)}:`), `${token} is a design token`);
  });
});

describe('the realtime server\'s data (tools/build-realtime-boards.mjs)', { skip: skipWithoutServer }, () => {
  it('is current: every board street, its opening notices, ten notes, the note limits', () => {
    const want = `${JSON.stringify(boardsData())}\n`;
    assert.equal(readFileSync(serverPath('data', 'boards.json'), 'utf8'), want, 'run node tools/build-realtime-boards.mjs');
    const d = boardsData();
    assert.equal(d.capacity, 10);
    assert.equal(Object.keys(d.boards).length, 8);
    for (const [tsid, pins] of Object.entries(BOARD_PINS)) assert.deepEqual(d.boards[tsid].seeds.map((s) => s.title), pins.map((p) => p.title), tsid);
    assert.ok(d.boards.GIF16EM56A12FSB, 'the Forest machine room\'s board');
  });

  it('runs every rule the lane named in go test (boards_test.go)', () => {
    const src = readFileSync(serverPath('boards_test.go'), 'utf8');
    for (const t of ['TestBoardsLoadPinTheOpeningNoticesOnceAndSurviveARestart', 'TestAPinSettlesAtTheSiteAndEveryoneOnTheStreetSeesIt', 'TestAPinGoesThroughTheWordFilterAndTheNoteLimits', 'TestATenNoteBoardIsFullEvenWhenTwoPinAtOnce', 'TestTheFirstToTakeANoteHasIt', 'TestTheConsoleRemovesANoteAndTheStreetSeesItGo', 'TestBoardsUnderTheRaceDetector']) assert.match(src, new RegExp(`func ${t}\\(`), t);
    const go = readFileSync(serverPath('boards.go'), 'utf8');
    assert.match(go, /title := filterWords\(cleanNoteText\(msg\.Note\.Title, m\.data\.Title, false\)\)/, 'wordfilter.go on the title');
    assert.match(go, /body := filterWords\(cleanNoteText\(msg\.Note\.Body, m\.data\.Body, true\)\)/, 'and the body');
    assert.match(go, /serviceHandlers\["board_remove"\] = adminBoardRemove/);
  });
});

describe('the site keeps the notes (src/LedgerBoard.php, src/AdminBoards.php)', { skip: skipPhp }, () => {
  it('checks the server\'s pin: words cleaned and filtered, ten at most, yourself is no other writer', () => {
    const c = php(`LedgerBoard::call(['op' => '${OP}', 'id' => 7, 'street' => 'GA5134UPLRU29OH', 'board' => 0, 'title' => "Hi <b>there</b>\\nyou", 'body' => 'what the fuck', 'author' => 7, 'remake' => false, 'capacity' => 99])`);
    assert.deepEqual(c, { op: OP, id: 7, street: 'GA5134UPLRU29OH', board: 0, title: 'Hi bthere/b you', body: 'what the #!@$', author: 0, remake: false, capacity: 10 });
    for (const bad of [`['op' => 'drop-00000000000000a1', 'id' => 7, 'street' => 'GA5']`, `['op' => '${OP}', 'id' => 7, 'street' => 'HOME_7']`, `['op' => '${OP}', 'id' => 7, 'street' => 'GA5', 'board' => 1]`, `['op' => '${OP}', 'id' => 0, 'street' => 'GA5']`]) {
      assert.equal(php(`LedgerBoard::call(${bad})`), null, bad);
    }
    assert.deepEqual(php('[LedgerBoard::hasRoom(9), LedgerBoard::hasRoom(10), LedgerBoard::hasRoom(3, 99), LedgerBoard::hasRoom(10, 99)]'), [true, false, true, false], 'capacity 10, never more');
  });

  it('names the writer only when their very words reached the poster; the remake\'s words have none', () => {
    assert.deepEqual(php('[LedgerBoard::writer(9, 7, false, true), LedgerBoard::writer(9, 7, false, false), LedgerBoard::writer(9, 0, false, true), LedgerBoard::writer(9, 7, true, true), LedgerBoard::writer(9, 9, false, true)]'), [7, 9, 9, 0, 9]);
  });

  it('pins the opening notices once each, under their own ids', () => {
    const seeds = php(`LedgerBoard::seedsOf(['GA5134UPLRU29OH' => [['title' => 'Welcome', 'body' => 'Hi'], 'x'], 'HOME_7' => [['title' => 'x']], 'GHVUR3UKGRU2SD2' => array_fill(0, 12, ['title' => 't', 'body' => 'b'])])`);
    assert.deepEqual(Object.keys(seeds), ['GA5134UPLRU29OH', 'GHVUR3UKGRU2SD2']);
    assert.deepEqual(seeds.GA5134UPLRU29OH, [{ title: 'Welcome', body: 'Hi' }]);
    assert.equal(seeds.GHVUR3UKGRU2SD2.length, 10);
    assert.equal(php(`LedgerBoard::seedId('GA5134UPLRU29OH', 0)`), SEED);
    assert.deepEqual(php(`[LedgerBoard::noteId('${SEED}'), LedgerBoard::noteId('${OP}'), LedgerBoard::noteId('board-x'), LedgerBoard::isBoard('${OP}-t'), LedgerBoard::isBoard('${SEED}-t'), LedgerBoard::isBoard('drop-00000000000000a1-t')]`), [true, true, false, true, true, false]);
    const src = readFileSync(sitePath('src/LedgerBoard.php'), 'utf8');
    const seed = src.slice(src.indexOf('private function seed('), src.indexOf('public static function seedsOf('));
    assert.match(seed, /if \(\$row === null \|\| \$row\['seeded_at'\] !== null\) \{\s*return;/, 'once per board');
    assert.match(seed, /FOR UPDATE/);
  });

  it('counts a board under its own lock before a pin, and moves the Note through the ledger once', () => {
    const src = readFileSync(sitePath('src/LedgerBoard.php'), 'utf8');
    const pin = src.slice(src.indexOf('private function pin('), src.indexOf('private function reached('));
    const lock = pin.indexOf('FOR UPDATE", [$pin[\'street\'], $pin[\'board\']]');
    assert.ok(lock > 0 && lock < pin.indexOf('SELECT COUNT(*)') && pin.indexOf('SELECT COUNT(*)') < pin.indexOf('self::move('), 'lock, count, then move');
    assert.match(pin, /\$had !== null\) \{\s*return \['status' => 'settled'/, 'asking again answers as recorded');
    assert.match(pin, /'void', \?, 0, \?, \?, NULL, \?\)", \[\$pin\['op'\]/, 'a short ledger is recorded void');
    const take = src.slice(src.indexOf('private function take('), src.indexOf('private function seed('));
    assert.match(take, /WHERE id = \? FOR UPDATE/);
    assert.match(take, /\$row\['status'\] !== 'pinned'/, 'the first take has it');
    assert.match(readFileSync(sitePath('src/Ledger.php'), 'utf8'), /LedgerBoard::isBoard\(\$p\['trade'\]\) => LedgerBoard::catchUp\(/);
    const ext = readFileSync(sitePath('src/Extension.php'), 'utf8');
    assert.match(ext, /new LedgerBoard\(\$minn\)/);
    assert.match(ext, /new AdminBoards\(\$minn\)/);
    for (const r of ['PIN', 'TAKE', 'LOAD']) assert.match(src, new RegExp(`#\\[Route\\(Method::Post, self::${r}, policy: new Policy\\(Access::Public\\)\\)\\]\\s*public function \\w+\\(Request \\$request\\): Response\\s*\\{\\s*\\$this->signed\\(\\$request, self::${r}\\);`), `${r} is the server's signed call`);
    const manifest = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8'));
    assert.ok(manifest.tables.groddle_board_notes.includes('PRIMARY KEY  (id)'));
    assert.ok(manifest.tables.groddle_boards.includes('PRIMARY KEY  (street,board)'));
    assert.ok(manifest.tables.groddle_board_reports.includes('PRIMARY KEY  (note_id,reporter_id)'), 'one report a player a note');
  });

  it('a load applies a missed pin or take to the stored save, with the note\'s words', () => {
    const state = JSON.stringify({ inventory: { note: 1 }, systems: { features: { 'street-furniture': { carried: [{ id: 'n1', title: 'Lost hat', body: 'Blue.', lastEditor: 'player' }], nextNoteId: 2 } } } });
    const entries = { playerState: state };
    const pinned = php(`LedgerBoard::apply(json_decode(${JSON.stringify(JSON.stringify(entries)).replace(/\$/g, '\\$')}, true), '${OP}', 'pinned', ['id' => '${OP}', 'title' => 'Lost hat', 'body' => 'Blue.', 'author' => ['id' => 9, 'name' => 'Bo'], 'remake' => false, 'at' => 1700000000000], 9)`);
    const after = JSON.parse(pinned.playerState);
    assert.equal(after.inventory.note, 0);
    assert.deepEqual(after.systems.features['street-furniture'].carried, []);
    const took = php(`LedgerBoard::apply(['playerState' => '{"inventory":{},"systems":{"features":{}}}'], '${OP}-t', 'took', ['id' => '${OP}', 'title' => 'Lost hat', 'body' => 'Blue.', 'author' => ['id' => 7, 'name' => 'Ada'], 'remake' => false, 'at' => 1700000000000], 9)`);
    const t = JSON.parse(took.playerState);
    assert.equal(t.inventory.note, 1);
    assert.deepEqual(t.systems.features['street-furniture'].carried, [{ id: 'n1', initialTitle: '', initialText: '', title: 'Lost hat', body: 'Blue.', lastEditor: 'player:7', lastEdited: 1700000000, history: [], authorName: 'Ada' }]);
    const remake = php(`LedgerBoard::carriedNote(['id' => '${SEED}', 'title' => 'Welcome', 'body' => 'Hi', 'author' => null, 'remake' => true, 'at' => 1], 'n4', 9)`);
    assert.equal(remake.initialText, 'Hi');
    assert.equal(remake.remakeText, true);
    assert.equal(isRemakeNote(remake), true, 'the game reads it as the remake\'s');
  });

  it('a report is a ticket with the note\'s words, once a player a note, under the report limits', () => {
    const m = php(`LedgerBoard::reportMessage('Gregarious Towers', '${OP}', 'Lost hat', 'Blue.', 'Ada', 'Rude')`);
    assert.equal(m, `Reporting a notice board note in Gregarious Towers\n\nTitle: Lost hat\nWritten by: Ada\n\nBlue.\n\nWhy: Rude\nNote: ${OP}`);
    assert.ok(!/[—–]|Glitch/.test(m));
    const src = readFileSync(sitePath('src/LedgerBoard.php'), 'utf8');
    const rep = src.slice(src.indexOf('public function report('), src.indexOf('public static function reportMessage('));
    assert.ok(src.includes("#[Route(Method::Post, '/groddle/v1/boards/notes/{id:[A-Za-z0-9-]+}/report', policy: new Policy(Access::SignedIn))]"));
    assert.match(rep, /BugReports::PER_WINDOW/);
    assert.match(rep, /\$store->open\(\$user->id, \$message, \$context, \$now\)/, 'the ticket path');
    assert.ok(rep.indexOf("'already'") < rep.indexOf('$store->open('), 'a second report makes no ticket');
  });

  it('the console lists notes and removes one: administrators only, nothing back to anyone, one log line', () => {
    const src = readFileSync(sitePath('src/AdminBoards.php'), 'utf8');
    const routes = [...src.matchAll(/#\[Route\(Method::(Get|Post), '([^']+)', policy: new Policy\(([^)]*)\)\)\]/g)].map((m) => [m[2], m[3]]);
    assert.deepEqual(routes, [['/groddle/v1/admin/board_notes', 'Access::Cap, self::ADMIN'], ['/groddle/v1/admin/board_remove', 'Access::Cap, self::ADMIN']]);
    assert.match(src, /private const ADMIN = 'manage_options';/);
    const rm = src.slice(src.indexOf('public function remove('), src.indexOf('public static function removeText('));
    assert.doesNotMatch(rm, /Ledger::fromSeams|->move\(|ledger_items|TRADES/, 'nothing goes back to anyone');
    assert.match(rm, /SET status = 'removed', removed_by = \?, removed_at = \?/);
    assert.match(rm, /\(new RealtimeCall\(\$this->minn\)\)->post\('board_remove', \['id' => \$id\]\)/);
    assert.equal((rm.match(/AdminConsole::recordAction\(/g) || []).length, 1);
    assert.match(rm, /'board_remove', \$detail, \$delivery, \$now\)/);
    const row = php(`AdminBoards::row(['id' => '${OP}', 'street' => 'GA5134UPLRU29OH', 'board' => 0, 'poster_id' => 9, 'author_id' => 7, 'remake' => 0, 'title' => 'T', 'body' => 'B', 'status' => 'pinned', 'reports' => 2, 'created_at' => '2026-11-04 12:00:00'], [7 => 'Ada', 9 => 'Bo'], ['GA5134UPLRU29OH' => ['label' => 'Gregarious Towers']])`);
    assert.deepEqual(row, { id: OP, street: { tsid: 'GA5134UPLRU29OH', label: 'Gregarious Towers' }, title: 'T', body: 'B', author: { id: 7, name: 'Ada' }, remake: false, poster: { id: 9, name: 'Bo' }, status: 'pinned', reports: 2, at: Date.UTC(2026, 10, 4, 12) });
    for (const d of ['live', 'none', 'down']) assert.ok(!/[—–]/.test(php(`AdminBoards::removeText('X', '${d}')`)), d);
  });
});

describe('the console page\'s Boards tab (console/console.js)', { skip: skipWithoutSite }, async () => {
  const mod = HAS_SITE ? await import(pathToFileURL(sitePath('console/console.js')).href) : {};

  it('words a note\'s writer, its reports and its line in the activity log', () => {
    assert.equal(mod.boardWho({ author: { id: 7, name: 'Ada' }, poster: { id: 7, name: 'Ada' } }), 'Ada');
    assert.equal(mod.boardWho({ author: { id: 7, name: 'Ada' }, poster: { id: 9, name: 'Bo' } }), 'Ada, pinned by Bo');
    assert.equal(mod.boardWho({ remake: true }), 'The remake\'s own notice');
    assert.equal(mod.boardReports({ reports: 0 }), '');
    assert.equal(mod.boardReports({ reports: 1 }), 'Reported once');
    assert.equal(mod.boardReports({ reports: 3 }), 'Reported by 3');
    assert.equal(mod.boardRemovable({ status: 'pinned' }), true);
    assert.equal(mod.boardRemovable({ status: 'taken' }), false);
    const street = { tsid: 'GA5134UPLRU29OH', label: 'Gregarious Towers' };
    assert.equal(mod.logWords({ kind: 'board_remove', detail: { street, title: 'Rude', by: 'Ada' }, delivery: 'live', player: { id: 7, name: 'Ada' } }), 'removed “Rude” by Ada from the board in Gregarious Towers');
    assert.match(mod.logWords({ kind: 'board_remove', detail: { street }, delivery: 'down', player: { id: 7 } }), /^removed a note from the board in Gregarious Towers \(realtime server down/);
    for (const w of [mod.COPY.boardRemoveNote, mod.COPY.boardRemoveConfirm('X'), ...Object.values(mod.COPY.boardNone), ...Object.values(mod.BOARD_STATUS)]) assert.ok(!/[—–]|Glitch/.test(w), w);
  });

  it('the page: a Boards tab with the filter and the table; Remove only from a confirm step; words set as text', () => {
    const page = readFileSync(sitePath('src/AdminConsolePage.php'), 'utf8');
    assert.match(page, /data-console-tab="boards">Boards <span/);
    for (const hook of ['data-console-tabpanel="boards"', 'data-console-board-filter', 'data-console-boards hidden>', 'data-console-boards-empty', 'data-console-boards-count', 'data-console-boards-reported']) assert.ok(page.includes(hook), hook);
    assert.match(page, /ASSET_KEY = 'skin-7'/);
    const src = readFileSync(sitePath('console/console.js'), 'utf8');
    const rm = src.slice(src.indexOf('function removeBoardNote('), src.indexOf("$('[data-console-board-filter]')"));
    assert.ok(rm.indexOf('dialog(COPY.boardRemoveConfirm(') >= 0 && rm.indexOf('dialog(COPY.boardRemoveConfirm(') < rm.indexOf("api.call('admin/board_remove'"), 'the call only from the confirm');
    assert.match(rm, /\{ danger: true \}\);/);
    const rows = src.slice(src.indexOf('function renderBoards('), src.indexOf('async function loadBoards('));
    assert.match(rows, /el\('p', \{ class: 'console-board-body', text: n\.body \|\| '\(blank\)' \}\)/, 'what a player wrote, as text');
    assert.doesNotMatch(rows, /innerHTML/);
    assert.match(src, /if \(id === 'boards'\) loadBoards\(\);/);
  });
});
