// G791 (#216, #281): a reply on your own report can carry a picture, as the first report can, and a
// picture can be taken on purpose, because a bug can be gone before the Reports window opens: Take a
// picture under the reply box (the window closes, a small bar waits until you take it) or Shift+R
// anywhere in the game. The picture waits for your next reply or new report. The site keeps a
// reply's picture per message (groddle-afternoon-site TicketStore MESSAGE_PICTURES), with a new
// report's size and type checks (ReportPicture) and a limit of its own, shows it to the player and
// the administrators only (TicketPictures /report-pictures/<report>/<message>), and both threads
// (the player's and the console's admin/tickets/{id}, which /groddle-check reads) carry it per message.
// Since 2026-11-15 (lane reportpics, tests/report-pictures.test.js) a message carries up to four: the
// picture taken is one of them, held in a list with any added, dropped or pasted.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mountReportsSheet } from '../public/js/ui/reports-sheet.js?v=917a2f8c';
import { REPORT_TEXT as T, createReportsApi, isPictureKey, pictureSrc } from '../public/js/reports.js?v=3c805cc4';
import { REPORT_LEAVE_OUT } from '../public/js/features/bug-report-feature.js?v=c54c6abe';
import { hotkeySections } from '../public/js/client-hotkeys.js?v=401d994d';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { HAS_PHP, PHP, phpSkip } from './php.js';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hasPhp = HAS_PHP;
const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const noEngine = !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)';
// A tiny JPEG data URL (the sheet only checks the prefix; the site checks the bytes).
const PIC = { url: `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64')}`, width: 640, height: 360 };

class Node {
  constructor(tag, doc) { Object.assign(this, { tagName: String(tag).toUpperCase(), ownerDocument: doc, children: [], attrs: {}, listeners: {}, dataset: {}, hidden: false, disabled: false, value: '', className: '', _text: '', style: {} }); const self = this; this.classList = { toggle() {}, contains: (c) => self.className.split(' ').includes(c) }; }
  setAttribute(k, v) { if (k === 'hidden') { this.hidden = true; return; } if (k === 'class') { this.className = String(v); return; } if (k === 'id') this.id = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v); this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  append(...ns) { for (const n of ns) { if (typeof n !== 'string') { n.parentNode = this; this.children.push(n); } } }
  replaceChildren(...ns) { this.children = []; this.append(...ns); }
  get lastElementChild() { return this.children.at(-1) || null; }
  set textContent(t) { this.children = []; this._text = String(t); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  dispatch(k, ev = {}) { for (const fn of this.listeners[k] || []) fn({ target: this, button: 0, preventDefault() {}, stopPropagation() {}, ...ev }); }
  click() { if (!this.disabled) this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; }
  all() { return [this, ...this.children.flatMap((c) => c.all())]; }
  querySelector() { return null; }
}
function fakeDoc() {
  const doc = { activeElement: null };
  doc.createElement = (t) => new Node(t, doc);
  doc.createTextNode = (t) => Object.assign(new Node('#text', doc), { _text: String(t) });
  return doc;
}
const byData = (r, k, ok = () => true) => r.all().find((n) => k in n.dataset && ok(n));
const allData = (r, k) => r.all().filter((n) => k in n.dataset);
const ticket = { id: 3, subject: 'Pigs float', status: 'open', lastAuthor: 'player', lastMessageAt: '2026-11-15T10:00:00Z', unread: false };

/** A sheet over a fake site: every reply and new report recorded, the reply refused once when `refuse` is set. */
function mount({ takePicture = null, refuse = false } = {}) {
  const doc = fakeDoc();
  const host = new Node('div', doc);
  const calls = { reply: [], create: [] };
  let messages = [{ id: 8, author: 'player', body: 'Pigs float', at: '2026-11-15T10:00:00Z', edited: null, picture: null }];
  let refusing = refuse;
  const api = {
    list: async () => ({ tickets: [ticket] }),
    unread: async () => ({ unread: 0 }),
    thread: async () => ({ ticket, messages, picture: null, editable: false }),
    reply: async (id, message, picture = null) => {
      calls.reply.push({ id, message, picture });
      if (picture && refusing) {
        refusing = false;
        throw Object.assign(new Error('slow'), { status: 429, code: 'groddle_report_picture_slow', data: { message: 'slow' } });
      }
      const n = 8 + messages.length;
      messages = [...messages, { id: n, author: 'player', body: message, at: '2026-11-15T10:05:00Z', edited: null, picture: picture ? { url: `/report-pictures/3/${n}`, width: 640, height: 360 } : null }];
      return { ticket, messages, editable: false };
    },
    create: async (message, context, picture = null) => { calls.create.push({ message, picture }); return { status: 'sent', id: 4, ticket: { ...ticket, id: 4 } }; },
    close: async () => ({ ticket, messages }),
  };
  const states = [];
  const sheet = mountReportsSheet({ doc, host, api, capture: () => null, takePicture, onState: (s) => states.push(s), now: () => Date.parse('2026-11-15T10:10:00Z') });
  return { doc, host, api, calls, sheet, states };
}

describe('G791: the rules (js/reports.js)', () => {
  it('a reply\'s picture address is the report\'s and the message\'s number; nothing else is shown', () => {
    assert.equal(pictureSrc({ url: '/report-pictures/3/9' }), '/report-pictures/3/9');
    assert.equal(pictureSrc({ url: '/report-pictures/3' }), '/report-pictures/3');
    // 2026-11-15: a message's nth picture (1 to 9) too.
    assert.equal(pictureSrc({ url: '/report-pictures/3/9/2' }), '/report-pictures/3/9/2');
    for (const bad of ['/report-pictures/3/9/0', '/report-pictures/3/9/12', '/report-pictures/3/9/1/1', '/report-pictures/3/x', '//evil.example/report-pictures/3/9', '/report-pictures//9']) assert.equal(pictureSrc({ url: bad }), '', bad);
  });

  it('Shift+R is the picture key, never while typing and never with Ctrl, Alt or Cmd', () => {
    const k = (over = {}) => ({ key: 'R', code: 'KeyR', shiftKey: true, target: { tagName: 'CANVAS' }, ...over });
    assert.equal(isPictureKey(k()), true);
    assert.equal(isPictureKey(k({ key: 'r' })), true, 'Caps Lock');
    assert.equal(isPictureKey(k({ shiftKey: false, key: 'r' })), false, 'R alone opens Reports');
    for (const m of ['ctrlKey', 'altKey', 'metaKey', 'repeat']) assert.equal(isPictureKey(k({ [m]: true })), false, m);
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(isPictureKey(k({ target: { tagName: tag } })), false, tag);
    assert.equal(isPictureKey(k({ target: { tagName: 'DIV', isContentEditable: true } })), false);
  });

  it('a reply sends the picture with its words, and leaves the field out without one', async () => {
    const sent = [];
    const fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) }; };
    const api = createReportsApi({ baseUri: 'https://groddle.example/play/online/', fetch, nonce: '0123456789' });
    await api.reply(3, 'Again', PIC.url);
    await api.reply(3, 'Words only');
    assert.deepEqual(sent, [{ message: 'Again', picture: PIC.url }, { message: 'Words only' }]);
  });

  it('the words are plain, with no dashes', () => {
    for (const k of ['take', 'takeAgain', 'takeHint', 'takeReply', 'takeTaken', 'takeFailed', 'takeDrawing', 'shutterTitle', 'shutterTake', 'shutterCancel', 'replyPictureAlt', 'replySentNoPicture', 'trayLabel', 'reportPictureAlt']) {
      assert.ok(typeof T[k] === 'string' && T[k], k);
      assert.doesNotMatch(T[k], /[—–]/, k);
    }
  });
});

describe('G791: the Reports sheet (js/ui/reports-sheet.js)', () => {
  it('Take a picture closes the window, and the window comes back on the thread with the picture held', async () => {
    let handlers = null;
    const { host, sheet, states } = mount({ takePicture: (h) => { handlers = h; } });
    await sheet.openTicket(3);
    const row = byData(host, 'reportsReplyPicture');
    assert.equal(row.hidden, false);
    const take = byData(host, 'reportsTake');
    assert.equal(take.textContent, T.take);
    assert.equal(byData(host, 'reportsTray').hidden, true, 'no thumbnails yet');
    byData(host, 'reportsReplyText').value = 'It happened again';
    take.click();
    assert.equal(sheet.state, 'closed', 'out of the way while the player shows the problem');
    assert.ok(handlers?.done && handlers?.cancel);
    handlers.done(PIC);
    await wait(20);
    assert.equal(sheet.state, 'open');
    assert.equal(sheet.view, 'thread');
    assert.equal(sheet.held, PIC);
    assert.deepEqual(sheet.pictures, [PIC], 'taken twice over (the feature holds it, then done): kept once');
    assert.equal(states.at(-1).held, true);
    assert.equal(byData(host, 'reportsReplyText').value, 'It happened again', 'the words typed stay');
    const tray = byData(host, 'reportsTray');
    assert.equal(tray.hidden, false);
    assert.equal(allData(tray, 'reportsThumb').length, 1, 'its thumbnail under the reply box');
    assert.ok(byData(tray, 'reportsThumbRemove'));
    assert.equal(byData(host, 'reportsTake').textContent, T.takeAgain);
  });

  it('the reply sends the held picture; the thread shows it under the reply; the picture is let go', async () => {
    const { host, sheet, calls } = mount({ takePicture: () => {} });
    await sheet.openTicket(3);
    sheet.hold(PIC);
    byData(host, 'reportsReplyText').value = 'Here it is';
    byData(host, 'reportsSendReply').click();
    await wait(20);
    assert.deepEqual(calls.reply, [{ id: 3, message: 'Here it is', picture: PIC.url }]);
    assert.equal(sheet.held, null);
    const pics = allData(host, 'reportsMsgPicture');
    assert.equal(pics.length, 1);
    assert.equal(pics[0].getAttribute('href'), '/report-pictures/3/9');
    assert.equal(pics[0].children[0].getAttribute('alt'), T.replyPictureAlt);
    assert.equal(byData(host, 'reportsTray').hidden, true);
  });

  it('a refused picture never costs the words: they go again without it, and the picture stays held', async () => {
    const { host, sheet, calls } = mount({ takePicture: () => {}, refuse: true });
    await sheet.openTicket(3);
    sheet.hold(PIC);
    byData(host, 'reportsReplyText').value = 'Again';
    byData(host, 'reportsSendReply').click();
    await wait(20);
    assert.deepEqual(calls.reply.map((c) => c.picture), [PIC.url, null]);
    assert.equal(byData(host, 'bugReportStatus').textContent, T.replySentNoPicture);
    assert.equal(sheet.held, PIC);
  });

  it('its thumbnail\'s x lets the picture go; a reply then carries none', async () => {
    const { host, sheet, calls } = mount({ takePicture: () => {} });
    await sheet.openTicket(3);
    sheet.hold(PIC);
    byData(byData(host, 'reportsTray'), 'reportsThumbRemove').click();
    assert.equal(sheet.held, null);
    byData(host, 'reportsReplyText').value = 'Words';
    byData(host, 'reportsSendReply').click();
    await wait(20);
    assert.equal(calls.reply[0].picture, null);
  });

  it('a new report carries the held picture beside the one drawn as the form opens (2026-11-15: one of the four)', async () => {
    const { host, sheet, calls } = mount({ takePicture: () => {} });
    sheet.hold(PIC);
    sheet.open('new');
    await wait(20);
    // The fake capture draws nothing here: the held picture is the report's only one.
    const tray = byData(host, 'reportsTray', (n) => n.dataset.reportsTray === 'new');
    assert.equal(tray.hidden, false);
    byData(host, 'bugReportText').value = 'The pig froze';
    byData(host, 'bugReportSend').click();
    await wait(40);
    assert.deepEqual(calls.create, [{ message: 'The pig froze', picture: PIC.url }]);
    assert.equal(sheet.held, null);
  });

  it('without a way to take one (an older host), Take a picture stays out of sight and Add pictures shows', async () => {
    const { host, sheet } = mount();
    await sheet.openTicket(3);
    assert.equal(byData(host, 'reportsReplyPicture').hidden, false);
    assert.equal(byData(host, 'reportsTake').hidden, true);
    assert.equal(byData(host, 'reportsAdd').hidden, false);
  });

  it('a picture that is not a JPEG data URL is never held, and four is the most', () => {
    const { sheet } = mount({ takePicture: () => {} });
    assert.equal(sheet.hold({ url: 'data:image/png;base64,AAAA', width: 1, height: 1 }), false);
    assert.equal(sheet.held, null);
    for (let i = 0; i < 4; i++) assert.equal(sheet.hold({ ...PIC }), true);
    assert.equal(sheet.hold({ ...PIC }), false, 'a fifth is not kept');
    assert.equal(sheet.pictures.length, 4);
  });
});

describe('G791: the game wiring', () => {
  it('the bar is never in the picture, Shift+R is in the hotkeys, and the feature takes the picture now', () => {
    assert.ok(REPORT_LEAVE_OUT.includes('report-shutter'));
    const rows = hotkeySections({ reports: true }).flatMap((s) => s.rows);
    assert.ok(rows.some(([label, keys]) => label === 'Report Picture' && JSON.stringify(keys) === JSON.stringify([['Shift', 'R']])));
    assert.ok(!hotkeySections({ reports: false }).flatMap((s) => s.rows).some(([label]) => label === 'Report Picture'), 'solo has no reports');
    const f = read('public/js/features/bug-report-feature.js');
    assert.match(f, /export async function takePictureNow\(/);
    assert.match(f, /takePicture: \(handlers\) => openShutter\(handlers\)/);
    // Ahead of the game's own keys (capture), never with the Reports window open.
    assert.match(f, /window\.addEventListener\('keydown', \(e\) => \{\s*if \(sheet\.state !== 'closed'\) return;/);
    assert.match(f, /\}, true\);/);
    for (const hook of ['data-report-shutter', 'data-report-shutter-take', 'data-report-shutter-cancel']) assert.ok(f.includes(`'${hook}'`), hook);
    assert.doesNotMatch(f.slice(f.indexOf('/* G791'), f.indexOf('.bug-btn {')), /[—–]/);
  });

  it('the phone page takes a photo with a reply too, and shows each message\'s picture', () => {
    const c = read('public/js/phone/companion.js');
    assert.match(c, /const photo = photoPicker\('pc-reply-photo', msg\);/);
    assert.match(c, /reports\.reply\(t\.id, text, url\)/);
    // 2026-11-15: each message's pictures (its list, else G791's one: js/reports.js messagePictures).
    assert.match(c, /const own = messagePictures\(m\)\.map\(/);
    assert.match(c, /const picker = photoPicker\('pc-photo', msg\);/, 'the new report keeps its picker');
  });
});

describe('G791: the site keeps a reply\'s picture (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(sitePath(f), 'utf8');

  it('one row a message in a new table, declared additively with a schema bump', () => {
    const m = JSON.parse(src('minn.json'));
    // 2026-11-15: up to four a message, by position (G791's one-a-message table was never released).
    const t = m.tables.groddle_message_pictures;
    for (const col of ['message_id', 'position', 'ticket_id', 'player_user_id', 'picture', 'width', 'height', 'bytes', 'created_at']) assert.ok(t.some((l) => l.startsWith(`${col} `)), col);
    assert.ok(t.includes('picture mediumblob NOT NULL'));
    assert.ok(t.includes('UNIQUE KEY message_position (message_id,position)'));
    assert.ok(t.includes('KEY player_created (player_user_id,created_at)'), 'the limit counts by player and time');
    assert.equal(m.tables.groddle_ticket_message_pictures, undefined, 'G791\'s table is copied in by bin/message-pictures.php');
    const [a, b, c] = m.version.split('.').map(Number);
    assert.ok(a > 0 || b > 5 || (b === 5 && c >= 53), m.version);
    assert.ok(m.tables.groddle_ticket_pictures.includes('PRIMARY KEY  (ticket_id)'), 'the report\'s own picture table is unchanged');
  });

  it('a reply takes a picture after its own limits, with a picture limit and a new report\'s checks', () => {
    const php = src('src/Tickets.php');
    const reply = php.slice(php.indexOf('public function reply('), php.indexOf('public function close('));
    const order = ['writtenSince(', '$this->picturesWithin(', '$store->add('];
    const at = order.map((k) => reply.indexOf(k));
    assert.ok(at.every((n, i) => n > 0 && (i === 0 || n > at[i - 1])), `in order: ${order.join(' ')}`);
    const pics = php.slice(php.indexOf('private function picturesWithin('), php.indexOf('public static function picturesFit('));
    // Support (2026-11-27): the route hands its body's pictures over to be read (fromBody checks each) once the limits passed; they are counted after.
    assert.match(reply, /static fn \(\): array => ReportPicture::fromBody\(\$body\)/, 'every picture checked before any is counted');
    assert.match(pics, /picturesSince\(/);
    assert.match(pics, /throw new RestError\(ReportPicture::CODE \. '_slow',/, 'a groddle_report_picture code: the game sends the words again');
    assert.match(reply, /\$store->add\(\(int\) \$row\['id'\], \$me->id, TicketStore::PLAYER, \$message, \$now, \$list, \$texts\);/);
    assert.match(php, /PICTURES_PER_WINDOW = 20;/);
    assert.match(php, /PICTURES_PER_DAY = 60;/);
    const store = src('src/TicketStore.php');
    const add = store.slice(store.indexOf('public function add('), store.indexOf('public function setStatus('));
    assert.match(add, /Ledger::atomically/, 'written with the message');
    assert.match(add, /\$this->writePictures\(\$ticket, \$id, \$author, \$pictures, \$at\);/);
    assert.match(store, /INSERT INTO ' \. \$this->db->table\(self::MESSAGE_PICTURES\) \. ' \(message_id, position, ticket_id, player_user_id, picture, width, height, bytes, created_at\) VALUES \(\?, \?, \?, \?, FROM_BASE64\(\?\), \?, \?, \?, \?\)/);
    // Only a player's own reply route passes one; an administrator's reply never does.
    assert.match(src('src/AdminTickets.php'), /->add\(\(int\) \$row\['id'\], \$admin->id, TicketStore::ADMIN, \$message, \$now\);/);
  });

  it('served to the report\'s player and the administrators only, a message only within its own report', () => {
    const php = src('src/TicketPictures.php');
    assert.match(php, /#\[Route\(Method::Get, '\/report-pictures\/\{id:\\d\+\}\/\{message:\\d\+\}', policy: new Policy\(Access::Public\)\)\]/);
    assert.match(php, /#\[Route\(Method::Get, '\/report-pictures\/\{id:\\d\+\}\/\{message:\\d\+\}\/\{n:\\d\}', policy: new Policy\(Access::Public\)\)\]/);
    assert.match(php, /->messagePicture\(\(int\) \$id, \(int\) \$message, \(int\) \$n\), \$user->id\)/);
    const store = src('src/TicketStore.php');
    assert.match(store, /WHERE message_id = \? AND position = \? AND ticket_id = \?', \[\$message, \$n - 1, \$ticket\]/);
    // Both threads carry where each is, never the bytes.
    assert.match(src('src/Tickets.php'), /TicketStore::messagesOut\(\$store->messages\(\$id\), null, \$store->messagePictures\(\$id\), \$store->messageFiles\(\$id\)\)/);
    assert.match(src('src/AdminTickets.php'), /TicketStore::messagesOut\(\$store->messages\(\$id\), \$store->revisions\(\$id\), \$store->messagePictures\(\$id\), \$store->messageFiles\(\$id\)\)/);
    assert.match(store, /SELECT message_id, position, width, height FROM ' \. \$this->db->table\(self::MESSAGE_PICTURES\)/);
  });

  it('the console shows a message\'s pictures under its words, each opened in the popup', async () => {
    const js = src('console/console.js');
    assert.match(js, /replyPictures\(m\),\s*replyFiles\(m\),\s*messageHistory\(m, when\)/);
    assert.match(js, /'data-console-msg-picture': ''/);
    const mod = await import(pathToFileURL(sitePath('console/console.js')).href);
    assert.equal(mod.pictureSrc({ url: '/report-pictures/3/9' }), '/report-pictures/3/9');
    assert.equal(mod.pictureSrc({ url: '/report-pictures/3/9/2' }), '/report-pictures/3/9/2');
    assert.equal(mod.pictureSrc({ url: '/report-pictures/3/9/2/1' }), '');
    assert.deepEqual(mod.messagePictures({ pictures: [{ url: '/report-pictures/3/9/1' }, { url: 'https://x.example/a.jpg' }, { url: '/report-pictures/3/9/2' }] }).map((p) => p.url), ['/report-pictures/3/9/1', '/report-pictures/3/9/2']);
    assert.deepEqual(mod.messagePictures({ picture: { url: '/report-pictures/3/9' } }).map((p) => p.url), ['/report-pictures/3/9'], 'G791\'s one');
    assert.match(src('console/console.css'), /\.console-msg-pictures \{/);
    assert.match(src('console/console.css'), /\.console-msg-picture img \{/);
  });

  it('each message carries its picture or null, for both sides (php)', { skip: phpSkip('gd') || noEngine }, () => {
    const out = JSON.parse(execFileSync(PHP, [join(root, 'tests/fixtures/minn-accounts/tickets.php'), engine, SITE_DIR], { encoding: 'utf8' })).replyPictures;
    assert.equal(out.reportUrl, '/report-pictures/3');
    assert.equal(out.replyUrl, '/report-pictures/3/9');
    assert.equal(out.nthUrl, '/report-pictures/3/9/2');
    // "picture" stays for older readers: the first, at G791's address.
    assert.deepEqual(out.out.map((m) => m.picture), [{ url: '/report-pictures/3/8', width: 64, height: 64 }, { url: '/report-pictures/3/9', width: 640, height: 360 }, null]);
    assert.equal(pictureSrc(out.out[1].picture), '/report-pictures/3/9', 'the game shows what the site sends');
    assert.deepEqual(out.adminOut[0].picture, { url: '/report-pictures/3/9', width: 640, height: 360 });
    assert.deepEqual(out.adminOut[0].revisions, []);
    assert.deepEqual(out.limits, { perWindow: 20, perDay: 60, perMessage: 4 });
  });
});
