/**
 * Administrators delete a channel line for everyone (Austin 2026-11-07: a player's stray "d/leave" in
 * Live Help, "as an admin I should be able to delete mistakes like this"). The remake's own: Glitch's
 * channels had no deletion.
 *
 * - The site (groddle-afternoon-site src/ChatHistory.php deleteLine): DELETE
 *   groddle/v1/chat/channels/<global|help|trade>/lines/<lid>, manage_options only; the kept row is
 *   marked (deleted_ms, deleted_by) and every read leaves it out; /chat/'s line menu has Delete line
 *   for administrators only (main data-chat-admin), with a confirm step drawn in the menu.
 * - The realtime server (groddle-afternoon-server chatdelete.go, its own Go tests): the signed
 *   chat_delete takes it out of the history, threads and reactions and sends chat_deleted to the
 *   game and the website at once; the chat log keeps the line marked with who and when.
 * - The game (groups-feature, chat-threads-feature): chat_deleted takes the line out of its chat, or
 *   a reply out of its thread with the count down.
 * - The console's chat log shows the deleted line as said, marked Deleted with who and when.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { HAS_SITE, serverPath, sitePath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';
import { dropLid } from '../public/js/groups.js?v=c9635d96';
import { deletedSummary } from '../public/js/features/chat-threads-feature.js?v=7aa3ad1c';

const src = (f) => readFileSync(sitePath(f), 'utf8');
const game = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const EM_DASH = /—/;

describe('the game takes a deleted line away (groups.js dropLid, chat-threads-feature deletedSummary)', () => {
  it('a chat loses only the deleted line, by its lid', () => {
    const lines = [{ id: 7, lid: 11, text: 'd/leave' }, { id: 7, lid: 12, text: 'how do I leave?' }, { note: true, text: 'Welcome' }];
    assert.deepEqual(dropLid(lines, 11).map((l) => l.text), ['how do I leave?', 'Welcome']);
    assert.equal(dropLid(lines, 99), lines, 'a lid it does not have changes nothing');
    assert.equal(dropLid(lines, 0), lines, 'a note has no lid and is never taken');
  });

  it('a thread\'s count after a reply goes: the server\'s when it sent one, else one fewer', () => {
    assert.deepEqual(deletedSummary({ n: 3, last: { id: 9, name: 'Bo' } }, { n: 1, last: { id: 7, name: 'Ada' } }), { n: 1, last: { id: 7, name: 'Ada' } });
    assert.deepEqual(deletedSummary({ n: 3, last: { id: 9, name: 'Bo' } }, { n: 0 }), { n: 0, last: null });
    assert.deepEqual(deletedSummary({ n: 3, last: { id: 9, name: 'Bo' } }, {}), { n: 2, last: { id: 9, name: 'Bo' } });
    assert.deepEqual(deletedSummary(null, {}), { n: 0, last: null });
  });

  it('both features listen for chat_deleted, a reply being the thread\'s', () => {
    const groups = game('features/groups-feature.js');
    assert.match(groups, /client\.on\('msg:chat_deleted', \(msg\) => \{/);
    assert.match(groups, /if \(!chat \|\| Number\(msg\.parent\) > 0\) return;/);
    assert.match(groups, /social\?\.setLines\(ch, chat\.lines\.map\(drawerLine\)\);\n  \}\);\n  \/\/ MODERATION/, 'then the purge (tests/moderation.test.js)');
    const threads = game('features/chat-threads-feature.js');
    assert.match(threads, /client\.on\('msg:chat_deleted', \(m\) => \{/);
    assert.match(threads, /th\.setReplies\(tk, st\.replies\.filter\(\(r\) => r\.rk !== lineKey\(lid\)\), \{ loaded: st\.loaded \}\);/);
    assert.match(threads, /else if \(th\.current\?\.tk === lineKey\(lid\)\) th\.close\(\);/);
  });
});

describe('/chat/\'s Delete line (community/chat-pure.js, chat-menus.js, chat-app.js)', { skip: skipWithoutSite }, () => {
  const pure = () => import(pathToFileURL(sitePath('community/chat-pure.js')).href);

  it('only an administrator\'s menu has Delete line, last, on a channel\'s line', async () => {
    const { deletableKey, lineRows } = await pure();
    assert.ok(!lineRows({}).some((r) => r.id === 'delete'), 'a player never sees it');
    const rows = lineRows({ del: true, mine: true });
    assert.deepEqual(rows.at(-1), { id: 'delete', label: 'Delete line', tip: 'Take it away for everyone. The team\'s chat log keeps it.', focusBack: false });
    assert.deepEqual(lineRows({ del: true }).map((r) => r.id), ['thread', 'react', 'copy', 'link', 'report', 'delete']);
    assert.equal(deletableKey('chan:help'), 'help');
    assert.equal(deletableKey('chan:global'), 'global');
    assert.equal(deletableKey('chan:trade'), 'trade');
    assert.equal(deletableKey('im:7'), '', 'IMs are never deleted here');
    assert.equal(deletableKey('chan:group-12'), '');
  });

  it('a confirm step in the menu itself, Cancel focused; no window.confirm', async () => {
    const { DELETE_CONFIRM, deleteConfirmRows } = await pure();
    assert.equal(DELETE_CONFIRM.title, 'Delete this line for everyone?');
    assert.deepEqual(deleteConfirmRows().map((r) => r.id), ['confirm', 'cancel']);
    assert.equal(DELETE_CONFIRM.focus, 1);
    for (const r of [...deleteConfirmRows(), { label: DELETE_CONFIRM.title }]) assert.doesNotMatch(`${r.label} ${r.tip || ''}`, EM_DASH);
    const menus = src('community/chat-menus.js');
    assert.doesNotMatch(menus, /window\.confirm\(|[^\w.]confirm\(/);
    assert.match(menus, /else if \(row === 'delete' && del\) confirmDelete\(li, f, at, keys\);/);
    assert.match(menus, /focusIndex: DELETE_CONFIRM\.focus,/);
    assert.match(menus, /if \(row !== 'confirm'\) return;\n\s*const r = await api\.deleteLine\(f\.conv, f\.id, parent\);/);
    assert.match(menus, /deleted: 'Line deleted for everyone\.',/);
  });

  it('the page asks the site, and takes the line away on chat_deleted and a poll\'s gone', () => {
    const app = src('community/chat-app.js');
    assert.match(app, /admin: main\.dataset\.chatAdmin === '1',/);
    assert.match(app, /await call\(`chat\/channels\/\$\{key\}\/lines\/\$\{Number\(id\)\}`, \{ method: 'DELETE' \}\);/);
    assert.match(app, /case 'chat_deleted': \{/);
    assert.match(app, /for \(const g of r\.data\.gone \|\| \[\]\) dropLine\(c\.key, Number\(g\.lid\), Number\(g\.parent\) \|\| 0\);\n\s*keep\(c,/, 'gone before changed, so a parent\'s count is the site\'s');
    assert.match(app, /lineGone: 'That line was deleted\.',/);
  });

  it('only an administrator\'s page is marked, and the asset key moved with the files', () => {
    const pages = src('src/CommunityPages.php');
    assert.match(pages, /\(\(\$viewer\['admin'\] \?\? false\) \? ' data-chat-admin="1"' : ''\)/);
    assert.ok(Number(pages.match(/public const ASSET_KEY = 'community-(\d+)';/)?.[1]) >= 16, 'community-16 or later');
  });
});

describe('the site deletes for administrators only, and never serves a deleted line (src/ChatHistory.php)', { skip: skipWithoutSite }, () => {
  it('the route is manage_options, for the three channels, and tells the realtime server', () => {
    const c = src('src/ChatHistory.php');
    assert.match(c, /private const ADMIN = 'manage_options';/);
    assert.match(c, /#\[Route\(Method::Delete, '\/groddle\/v1\/chat\/channels\/\{key:global\|help\|trade\}\/lines\/\{lid:\[1-9\]\[0-9\]\{0,18\}\}', policy: new Policy\(Access::Cap, self::ADMIN\)\)\]\n    public function deleteLine/);
    assert.match(c, /\$rooms = \$key === 'help' \? \['help', 'newbie'\] : \[\$key\];/);
    assert.match(c, /\(new RealtimeCall\(\$this->minn\)\)->post\('chat_delete', \$call\);/);
    assert.match(c, /AdminConsole::recordAction\(\$db, \$admin->id, \$done\['author'\], 'chat_delete',/);
    assert.match(c, /public function deleteAs\(int \$by, string \$byName, string \$key, int \$id\): array/, 'the moderators\' delete line shares it (Moderation)');
    assert.match(c, /case 'delete':\n/, 'the server\'s chat store marks a row that came after');
  });

  it('every read of the kept lines leaves a deleted one out', () => {
    const c = src('src/ChatHistory.php');
    const has = (text, n = 1) => assert.equal(c.split(text).length - 1, n, text);
    has('WHERE l.room = ? AND l.parent_lid = 0 AND l.deleted_ms = 0{$notBlocked}', 2); // the lists (lines, latest)
    has('l.lid = ? AND l.parent_lid = 0 AND l.deleted_ms = 0{$notBlocked}'); // a thread's parent
    has('l.parent_lid = ? AND l.deleted_ms = 0{$notBlocked} ORDER BY l.lid ASC LIMIT 500'); // its replies
    has('l.parent_lid IN ({$in}) AND l.deleted_ms = 0{$notBlocked} GROUP BY l.parent_lid'); // reply counts
    has('p.deleted_ms = 0 AND r.deleted_ms = 0'); // notifications of replies
    has('AND author_id = ? AND deleted_ms = 0'); // and the reader's own last reply
    assert.match(c, /'gone' => \$gone,/);
    assert.match(c, /if \(\$row !== null && \(int\) \$row\['deleted_ms'\] > 0\) \{\n\s*throw new RestError\('groddle_chat_no_line', 'That line is not there to reply to\.', 404\);/);
  });

  it('the table keeps the row, marked (additive columns only)', () => {
    const t = JSON.parse(src('minn.json')).tables.groddle_chat_lines;
    assert.ok(t.includes('deleted_ms bigint(20) unsigned NOT NULL DEFAULT 0'));
    assert.ok(t.includes('deleted_by bigint(20) unsigned NOT NULL DEFAULT 0'));
  });
});

describe('the console\'s chat log marks a deleted line (console/console.js, src/AdminConsole.php)', { skip: skipWithoutSite }, async () => {
  const mod = HAS_SITE ? await import(pathToFileURL(sitePath('console/console.js')).href) : {};

  it('Deleted, with who and when; nothing on a line nobody deleted', () => {
    assert.equal(mod.chatDeleted({ text: 'hi' }), null);
    const d = mod.chatDeleted({ deleted: { at: '2026-11-07T14:03:05.000Z', by: { id: 1, name: 'Austin' } } });
    assert.equal(d.text, 'Deleted');
    assert.match(d.title, /^Deleted for everyone by Austin, /);
    assert.doesNotMatch(d.title, EM_DASH);
    assert.equal(mod.logWords({ kind: 'chat_delete', delivery: 'live', player: { id: 7, name: 'Ada' }, detail: { where: 'Live Help', text: 'd/leave' } }), 'deleted Ada\'s line in Live Help: “d/leave”');
    assert.match(mod.logWords({ kind: 'chat_delete', delivery: 'down', player: { id: 7, name: 'Ada' }, detail: { where: 'Global Chat', reply: true, text: 'x' } }), /^deleted Ada's thread reply in Global Chat: “x” \(realtime server not answering/);
    const ac = src('src/AdminConsole.php');
    assert.match(ac, /'deleted' => \$this->chatDeleted\(\$l\['deleted'\] \?\? null, \$names\),/);
    assert.match(src('src/AdminConsolePage.php'), /ASSET_KEY = 'skin-7'/);
  });
});

describe('the realtime server\'s side (groddle-afternoon-server chatdelete.go)', { skip: skipWithoutServer }, () => {
  it('a signed call of the site, never a socket message, and the chat log keeps the evidence', () => {
    const go = readFileSync(serverPath('chatdelete.go'), 'utf8');
    assert.match(go, /func init\(\) \{ serviceHandlers\["chat_delete"\] = chatDeleteService \}/);
    assert.match(go, /var chatDeleteRooms = map\[string\]bool\{"global": true, "help": true, "newbie": true, "trade": true\}/);
    assert.match(go, /h\.logDeletionLocked\(d\)/);
    assert.match(readFileSync(serverPath('chatlog.go'), 'utf8'), /chatlogDeletedFile  = "deleted\.jsonl"/);
  });
});
