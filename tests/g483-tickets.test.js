/**
 * TICKETS (2026-10-30): bug reports as threads between a player and the
 * administrators. The game: js/reports.js (the rules and the groddle/v1/tickets
 * calls), js/ui/reports-sheet.js (the Reports sheet), features/bug-report-feature.js
 * (the bug icon, its unread badge and polling), css/classic.css (the 2012 window).
 * The site (groddle-afternoon-site, skipped without it): minn.json's two tables,
 * src/TicketStore.php, Tickets.php (the player's routes), AdminTickets.php (the
 * console's), TicketMigration.php + bin/migrate-bug-reports.php (the old posts),
 * PlayerMail::ticketReply, and the console's Reports tab (console/console.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { REPORT_MAX, REPORT_PICTURE, REPORT_TEXT, STATUS_WORDS, UNREAD_POLL_MS, base64Size, createReportsApi, pictureRefused, pictureSize, pictureSrc, refusalWords, reportFromHash, ticketLine, unreadCount, whenWords } from '../public/js/reports.js?v=0cc4230d';
import { mountReportsSheet } from '../public/js/ui/reports-sheet.js?v=4b181c55';
import { BUG_TEXT, badgeFor, bugReportFeature, capturePicture } from '../public/js/features/bug-report-feature.js?v=320c0ff6';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const noEngine = !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)';
const flush = () => new Promise((r) => setImmediate(r));
const NOW = Date.parse('2026-10-30T12:00:00Z');

// —— A small DOM, enough for the sheet ——
class FakeNode {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.dataset = {};
    this.parentNode = null;
    this._text = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.className = '';
    const self = this;
    this.classList = {
      toggle(c, on) { const set = new Set(self.className.split(/\s+/).filter(Boolean)); if (on) set.add(c); else set.delete(c); self.className = [...set].join(' '); },
      contains(c) { return self.className.split(/\s+/).includes(c); },
    };
  }
  setAttribute(k, v) {
    if (k === 'hidden') { this.hidden = true; return; }
    if (k === 'class') { this.className = String(v); return; }
    if (k === 'id') this.id = String(v);
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
    this.attrs[k] = String(v);
  }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  append(...nodes) { for (const n of nodes) { if (typeof n === 'string') this.children.push(Object.assign(new FakeNode('#text', this.ownerDocument), { _text: n })); else { n.parentNode = this; this.children.push(n); } } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  get lastElementChild() { return this.children.at(-1) || null; }
  set textContent(t) { this.children = []; this._text = String(t); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  addEventListener(kind, fn) { (this.listeners[kind] ||= []).push(fn); }
  dispatch(kind, ev = {}) { for (const fn of this.listeners[kind] || []) fn({ target: this, preventDefault() {}, stopPropagation() {}, ...ev }); }
  click() { if (!this.disabled) this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; }
  scrollIntoView() {}
  all() { return [this, ...this.children.flatMap((c) => c.all())]; }
  find(pred) { return this.all().find(pred) || null; }
  findAll(pred) { return this.all().filter(pred); }
  querySelector(sel) {
    const m = /^\[data-ticket="(\d+)"\] button$/.exec(sel);
    if (m) return this.find((n) => n.dataset.ticket === m[1])?.children[0] || null;
    return null;
  }
}
function fakeDoc() {
  const doc = { activeElement: null };
  doc.createElement = (t) => new FakeNode(t, doc);
  doc.createTextNode = (t) => Object.assign(new FakeNode('#text', doc), { _text: String(t) });
  return doc;
}
const byData = (rootNode, key) => rootNode.find((n) => key in n.dataset);
const byId = (rootNode, id) => rootNode.find((n) => n.id === id);

function fakeApi({ tickets = [], threads = {} } = {}) {
  const calls = [];
  return {
    calls,
    list: async () => { calls.push(['list']); return { tickets: tickets.map((t) => ({ ...t })), unread: unreadCount(tickets) }; },
    unread: async () => { calls.push(['unread']); return { unread: unreadCount(tickets) }; },
    thread: async (id) => {
      calls.push(['thread', id]);
      const t = tickets.find((x) => x.id === id);
      t.unread = false;
      return { ticket: { ...t }, messages: threads[id] || [] };
    },
    create: async (message, context) => { calls.push(['create', message, context]); const t = { id: 99, status: 'open', subject: message.split('\n')[0], lastAuthor: 'player', lastMessageAt: new Date(NOW).toISOString(), unread: false }; tickets.unshift(t); return { status: 'sent', id: 99, ticket: t }; },
    reply: async (id, message) => {
      calls.push(['reply', id, message]);
      const t = tickets.find((x) => x.id === id);
      Object.assign(t, { status: 'open', lastAuthor: 'player' });
      (threads[id] ||= []).push({ id: 50, author: 'player', body: message, at: new Date(NOW).toISOString() });
      return { ticket: { ...t }, messages: threads[id] };
    },
    close: async (id) => { calls.push(['close', id]); const t = tickets.find((x) => x.id === id); t.status = 'closed'; return { ticket: { ...t }, messages: threads[id] || [] }; },
  };
}

describe('the rules (js/reports.js)', () => {
  it('counts unread replies and reads a reply email\'s link', () => {
    assert.equal(unreadCount([{ unread: true }, { unread: false }, { unread: true }, null]), 2);
    assert.equal(unreadCount(undefined), 0);
    assert.equal(reportFromHash('#report=42'), 42);
    for (const h of ['', '#report=', '#report=4x', '#reports', '#report=1234567890123']) assert.equal(reportFromHash(h), 0, h);
  });

  it('says when in plain words, and who wrote last', () => {
    const ago = (s) => new Date(NOW - s * 1000).toISOString();
    assert.equal(whenWords(ago(20), NOW), 'just now');
    assert.equal(whenWords(ago(5 * 60), NOW), '5 min ago');
    assert.equal(whenWords(ago(3 * 3600), NOW), '3 h ago');
    assert.equal(whenWords(ago(30 * 3600), NOW), 'yesterday');
    assert.equal(whenWords(ago(4 * 86400), NOW), '4 days ago');
    assert.equal(whenWords('nonsense', NOW), '');
    assert.equal(ticketLine({ lastAuthor: 'admin', lastMessageAt: ago(120) }, NOW), 'Administrator replied 2 min ago');
    assert.equal(ticketLine({ lastAuthor: 'player', lastMessageAt: ago(120) }, NOW), 'You wrote 2 min ago');
  });

  it('keeps the original form\'s words and the site\'s limits, with no em dashes', () => {
    assert.equal(BUG_TEXT.title, 'We\'d love to hear from you!');
    assert.equal(BUG_TEXT.label, 'Tell us anything: feedback, a suggestion, or a bug you found.');
    assert.equal(REPORT_MAX, 2000);
    assert.equal(UNREAD_POLL_MS, 60000);
    const words = [...Object.values(REPORT_TEXT).map((v) => (typeof v === 'function' ? `${v(1)} ${v(3)}` : v)), ...Object.values(STATUS_WORDS)];
    for (const w of words) assert.ok(!/[—–]/.test(w), `no em dash: ${w}`);
    assert.equal(refusalWords({ data: { message: 'Too many.' } }), 'Too many.');
    assert.equal(refusalWords(new Error('x')), REPORT_TEXT.failed);
  });

  it('the bug icon\'s badge: hidden at none, a count, 9+ past nine, and the tip says so', () => {
    assert.deepEqual(badgeFor(0), { hidden: true, text: '0', tip: 'Feedback, ideas and bugs' });
    assert.deepEqual(badgeFor(1), { hidden: false, text: '1', tip: 'Feedback, ideas and bugs (1 new reply)' });
    assert.deepEqual(badgeFor(12), { hidden: false, text: '9+', tip: 'Feedback, ideas and bugs (12 new replies)' });
  });
});

describe('the ticket calls (createReportsApi)', () => {
  it('names each route and method, signed in with the session nonce', async () => {
    const calls = [];
    const fetch = async (url, init) => {
      calls.push({ url, method: init.method, nonce: init.headers['X-WP-Nonce'], body: init.body });
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ ok: 1 }) };
    };
    const api = createReportsApi({ baseUri: 'https://groddle.localhost/', fetch, nonce: 'abcdef1234' });
    await api.list();
    await api.unread();
    await api.thread(7);
    await api.create('It broke', { street: 'GA5' });
    await api.reply(7, 'More');
    await api.close(7);
    assert.deepEqual(calls.map((c) => `${c.method} ${c.url.replace('https://groddle.localhost/wp-json/groddle/v1/', '')}`), ['GET tickets', 'GET tickets/unread', 'GET tickets/7', 'POST tickets', 'POST tickets/7/messages', 'POST tickets/7/close']);
    assert.ok(calls.every((c) => c.nonce === 'abcdef1234'));
    assert.deepEqual(JSON.parse(calls[3].body), { message: 'It broke', context: { street: 'GA5' } });
    assert.deepEqual(JSON.parse(calls[4].body), { message: 'More' });
  });

  it('fetches a fresh nonce once when the old one went stale, and throws the site\'s refusal', async () => {
    let n = 0;
    const fetch = async (url, init) => {
      if (url.includes('admin-ajax')) return { ok: true, text: async () => '0123456789' };
      n += 1;
      if (n === 1) return { status: 403, ok: false, headers: { get: () => null }, json: async () => ({ code: 'rest_cookie_invalid_nonce' }) };
      if (init.headers['X-WP-Nonce'] !== '0123456789') throw new Error('old nonce reused');
      return { status: 404, ok: false, headers: { get: () => null }, json: async () => ({ code: 'groddle_ticket_missing', message: 'That report is not one of yours.' }) };
    };
    const api = createReportsApi({ baseUri: 'https://groddle.localhost/', fetch, nonce: 'ffffffffff' });
    await assert.rejects(api.thread(5), (err) => err.status === 404 && err.code === 'groddle_ticket_missing' && refusalWords(err) === 'That report is not one of yours.');
  });
});

describe('the Reports sheet (js/ui/reports-sheet.js)', () => {
  const tickets = () => [
    { id: 3, status: 'answered', subject: 'Pigs float', lastAuthor: 'admin', lastMessageAt: new Date(NOW - 60000).toISOString(), unread: true },
    { id: 2, status: 'closed', subject: 'Old one', lastAuthor: 'player', lastMessageAt: new Date(NOW - 86400000 * 3).toISOString(), unread: false },
  ];

  it('lists your reports with their status and a dot for a new reply, and publishes the hooks', async () => {
    const doc = fakeDoc();
    const host = new FakeNode('div', doc);
    const states = [];
    const api = fakeApi({ tickets: tickets() });
    const sheet = mountReportsSheet({ doc, host, api, onState: (s) => states.push(s), now: () => NOW });
    const panel = byId(host, 'bug-report-panel');
    assert.ok(panel.hidden, 'starts closed');
    assert.equal(panel.className, 'reports-panel ui-sheet ui-sheet-center');
    assert.equal(panel.getAttribute('role'), 'dialog');
    sheet.open('list');
    await flush();
    assert.equal(panel.hidden, false);
    const rows = host.findAll((n) => n.dataset.ticket);
    assert.deepEqual(rows.map((r) => r.dataset.ticket), ['3', '2']);
    assert.equal(rows[0].dataset.unread, '1');
    assert.equal(rows[1].dataset.unread, undefined);
    assert.ok(rows[0].find((n) => n.className === 'reports-dot'));
    assert.ok(rows[0].find((n) => n.className === 'reports-chip is-answered' && n.textContent === 'Answered'));
    assert.ok(rows[0].textContent.includes('Administrator replied 1 min ago'));
    assert.deepEqual(states.at(-1), { state: 'open', view: 'list', unread: 1, ticket: 0, last: '2 reports' });
  });

  it('a thread sets what people wrote as text, marks it read and replies; a reply opens a closed report again', async () => {
    const doc = fakeDoc();
    const host = new FakeNode('div', doc);
    const states = [];
    const api = fakeApi({ tickets: tickets(), threads: { 2: [{ id: 1, author: 'player', body: '<img src=x onerror=alert(1)>', at: new Date(NOW - 86400000 * 3).toISOString() }], 3: [{ id: 4, author: 'admin', body: 'Fixed, thanks!', at: new Date(NOW).toISOString() }] } });
    const sheet = mountReportsSheet({ doc, host, api, onState: (s) => states.push(s), now: () => NOW });
    sheet.open('list');
    await flush();
    await sheet.openTicket(3);
    await flush();
    assert.equal(byId(host, 'bug-report-panel').dataset.reportsView, 'thread');
    assert.equal(states.at(-1).unread, 0, 'read now: the badge goes');
    const msgs = byData(host, 'reportsMessages');
    assert.equal(msgs.children[0].dataset.author, 'admin');
    assert.ok(msgs.children[0].textContent.startsWith('Administrator'));

    await sheet.openTicket(2);
    await flush();
    const body = byData(host, 'reportsMessages').children[0].children[1];
    assert.equal(body.textContent, '<img src=x onerror=alert(1)>', 'kept as text');
    assert.equal(body.children.length, 0, 'never parsed into elements');
    assert.equal(byData(host, 'reportsCloseTicket').hidden, true, 'a closed report offers no Close');
    const reply = byId(host, 'reports-reply-text');
    byData(host, 'reportsSendReply').click();
    await flush();
    assert.equal(states.at(-1).last, REPORT_TEXT.replyEmpty);
    reply.value = '  Still broken  ';
    byData(host, 'reportsSendReply').click();
    await flush();
    await flush();
    assert.deepEqual(api.calls.find((c) => c[0] === 'reply'), ['reply', 2, 'Still broken']);
    assert.equal(byData(host, 'reportsThreadStatus').dataset.status, 'open');
    assert.equal(byData(host, 'reportsCloseTicket').hidden, false);
    byData(host, 'reportsCloseTicket').click();
    await flush();
    assert.deepEqual(api.calls.at(-1), ['close', 2]);
    assert.equal(byData(host, 'reportsThreadStatus').dataset.status, 'closed');
  });

  it('New report is the original form, sent with what the game knew; Esc closes and hands focus back', async () => {
    const doc = fakeDoc();
    const host = new FakeNode('div', doc);
    const opener = new FakeNode('button', doc);
    const toasts = [];
    const api = fakeApi({ tickets: [] });
    const sheet = mountReportsSheet({ doc, host, api, context: () => ({ street: 'GA5101HF7F429V5' }), toast: (t) => toasts.push(t), opener: () => opener, now: () => NOW });
    sheet.open('new');
    await flush();
    const panel = byId(host, 'bug-report-panel');
    assert.equal(panel.dataset.reportsView, 'new');
    const text = byId(host, 'bug-report-text');
    assert.ok(text && 'bugReportText' in text.dataset);
    assert.ok(host.find((n) => n.textContent === 'We\'d love to hear from you!' && n.className === 'reports-new-title'));
    text.value = 'The pig floated\nup and away';
    byData(host, 'bugReportSend').click();
    await flush();
    await flush();
    assert.deepEqual(api.calls.find((c) => c[0] === 'create'), ['create', 'The pig floated\nup and away', { street: 'GA5101HF7F429V5' }]);
    assert.deepEqual(toasts, [REPORT_TEXT.sent]);
    assert.equal(panel.dataset.reportsView, 'list');
    assert.equal(host.findAll((n) => n.dataset.ticket)[0].dataset.ticket, '99');
    panel.dispatch('keydown', { key: 'Escape' });
    assert.equal(panel.hidden, true);
    assert.equal(doc.activeElement, opener);
    assert.equal(sheet.state, 'closed');
  });

  it('keys typed in the sheet never reach the world', () => {
    const doc = fakeDoc();
    const host = new FakeNode('div', doc);
    const sheet = mountReportsSheet({ doc, host, api: fakeApi(), now: () => NOW });
    sheet.open('new');
    let stopped = 0;
    byId(host, 'bug-report-panel').dispatch('keydown', { key: 'a', stopPropagation: () => { stopped += 1; } });
    assert.equal(stopped, 1);
  });

  it('draws nothing in solo (solo has no account)', () => {
    const before = globalThis.groddleBugReport;
    const e = { mode: 'solo', started: true };
    bugReportFeature.init(e);
    bugReportFeature.onTick(16, 0, e);
    assert.equal(globalThis.groddleBugReport, before);
  });
});

describe('a picture of the game with a report (Austin 2026-10-30)', () => {
  const JPEG = (n) => `data:image/jpeg;base64,${'A'.repeat(n)}`;

  it('the limits and helpers: at most 1280 wide, quality 0.8 first, under 300 KiB, JPEG', () => {
    assert.equal(REPORT_PICTURE.maxWidth, 1280);
    assert.equal(REPORT_PICTURE.qualities[0], 0.8);
    assert.equal(REPORT_PICTURE.maxBytes, 307200);
    assert.equal(REPORT_PICTURE.type, 'image/jpeg');
    assert.deepEqual(pictureSize(1920, 1080), [1280, 720]);
    assert.deepEqual(pictureSize(960, 540), [960, 540], 'never enlarged');
    assert.deepEqual(pictureSize(1000, 2000), [640, 1280], 'a tall view keeps within 1280 tall');
    assert.deepEqual(pictureSize(0, 10), [0, 0]);
    assert.equal(base64Size('QUJD'), 3);
    assert.equal(base64Size('QUI='), 2);
    assert.equal(base64Size('QQ=='), 1);
    assert.equal(pictureRefused({ code: 'groddle_report_picture_too_large' }), true);
    assert.equal(pictureRefused({ code: 'groddle_feedback_slow' }), false);
    assert.equal(pictureSrc({ url: '/report-pictures/12' }), '/report-pictures/12');
    for (const url of ['https://evil.example/x.jpg', '/report-pictures/12?x', 'javascript:alert(1)', '']) assert.equal(pictureSrc({ url }), '', url);
    for (const k of ['picture', 'pictureHint', 'pictureNone', 'pictureAlt', 'pictureOpen', 'sentNoPicture']) {
      assert.ok(REPORT_TEXT[k], k);
      assert.ok(!/[—–]/.test(REPORT_TEXT[k]), `no em dash: ${REPORT_TEXT[k]}`);
    }
    assert.equal(REPORT_TEXT.picture, 'Attach a picture of the game');
    assert.match(REPORT_TEXT.pictureHint, /other players, their names and speech bubbles/, 'says what the canvas shows');
  });

  it('capturePicture draws the location view through snapshotView, downscaled, then lower quality, then narrower, until it fits', () => {
    const made = [];
    // Bytes a fake JPEG comes to: width x quality decides, so the steps show.
    const doc = { createElement: () => {
      const c = { width: 0, height: 0, drawn: [], getContext: () => ({ fillRect() {}, drawImage: (...a) => c.drawn.push(a) }), toDataURL: (type, q) => { made.push([c.width, q, type]); return JPEG(Math.round((c.width * q * 400) * 4 / 3)); } };
      return c;
    } };
    const view = { width: 1920, height: 1080 };
    const asked = [];
    const engine = { snapshotView: (o) => { asked.push(o); return view; } };
    // 1280 x 0.8 x 400 = 409,600 bytes: too big; 0.7 too; 0.6 = 307,200 fits.
    const shot = capturePicture(engine, doc);
    assert.deepEqual(asked, [{ resolution: 1 }]);
    assert.deepEqual(made.map((m) => m.slice(0, 2)), [[1280, 0.8], [1280, 0.7], [1280, 0.6]]);
    assert.equal(made[0][2], 'image/jpeg');
    assert.equal(shot.width, 1280);
    assert.equal(shot.height, 720);
    assert.ok(shot.bytes <= 307200);
    assert.ok(shot.url.startsWith('data:image/jpeg;base64,'));
    // Tighter limits: narrower once every quality is too big at the widest.
    made.length = 0;
    const narrow = capturePicture(engine, doc, { ...REPORT_PICTURE, maxBytes: 250000 });
    assert.deepEqual(made.map((m) => m.slice(0, 2)), [[1280, 0.8], [1280, 0.7], [1280, 0.6], [1024, 0.8], [1024, 0.7], [1024, 0.6]]);
    assert.equal(narrow.width, 1024);
    assert.equal(capturePicture(engine, doc, { ...REPORT_PICTURE, maxBytes: 10 }), null, 'never fits: no picture');
    assert.equal(capturePicture({}, doc), null, 'no renderer yet');
    assert.equal(capturePicture({ snapshotView: () => { throw new Error('lost context'); } }, doc), null);
    // Only the canvas: the feature never reads the page's HUD or chat.
    const f = read('public/js/features/bug-report-feature.js');
    const fn = f.slice(f.indexOf('export function capturePicture('), f.indexOf('const STYLE'));
    assert.match(fn, /engine\?\.snapshotView\?\.\(\{ resolution: 1 \}\)/);
    assert.doesNotMatch(fn, /querySelector|getElementById|html2canvas|innerHTML/);
    assert.match(f, /capture: \(\) => capturePicture\(engine\),/);
    // snapshotView is the stage inside the location view (the pack strip below it left out).
    assert.match(read('public/game.js'), /snapshotView\(\{ resolution = 1 \} = \{\}\) \{[\s\S]*?app\.renderer\.extract\.canvas\(\{ target: app\.stage, frame: new PIXI\.Rectangle\(0, 0, VIEW_W, LOCATION_VIEW_H\), resolution \}\)/);
  });

  function pictureApi({ refusePicture = false } = {}) {
    const calls = [];
    const tickets = [];
    return {
      calls,
      list: async () => ({ tickets: tickets.map((t) => ({ ...t })), unread: 0 }),
      unread: async () => ({ unread: 0 }),
      thread: async (id) => ({ ticket: { id, status: 'open', subject: 'Pigs', lastAuthor: 'player', lastMessageAt: new Date(NOW).toISOString(), unread: false }, messages: [{ id: 1, author: 'player', body: 'Pigs float', at: new Date(NOW).toISOString() }], picture: id === 7 ? { url: '/report-pictures/7', width: 1280, height: 720 } : null }),
      create: async (message, context, picture = null) => {
        calls.push(['create', message, picture]);
        if (picture && refusePicture) throw Object.assign(new Error('too big'), { status: 413, code: 'groddle_report_picture_too_large', data: { message: 'That picture is larger than a report keeps.' } });
        const t = { id: 99, status: 'open', subject: message, lastAuthor: 'player', lastMessageAt: new Date(NOW).toISOString(), unread: false };
        tickets.unshift(t);
        return { status: 'sent', id: 99, ticket: t };
      },
      reply: async () => ({}),
      close: async () => ({}),
    };
  }
  const mount = (api, capture) => {
    const doc = fakeDoc();
    const host = new FakeNode('div', doc);
    const toasts = [];
    const sheet = mountReportsSheet({ doc, host, api, capture, toast: (t) => toasts.push(t), now: () => NOW });
    return { doc, host, sheet, toasts };
  };

  it('New report ticks Attach a picture by default, shows it small, and sends it; unticked sends none', async () => {
    const shot = { url: JPEG(400), width: 1280, height: 720, bytes: 300 };
    let taken = 0;
    const api = pictureApi();
    const { host, sheet } = mount(api, () => { taken += 1; return shot; });
    sheet.open('new');
    await flush();
    const box = byId(host, 'reports-picture');
    assert.ok(box && 'reportsPicture' in box.dataset);
    assert.equal(box.attrs.type, 'checkbox');
    assert.equal(box.checked, true, 'on by default');
    assert.equal(box.disabled, false);
    assert.equal(taken, 1, 'drawn when the form opens');
    const preview = byData(host, 'reportsPicturePreview');
    assert.equal(preview.hidden, false);
    assert.equal(preview.getAttribute('src'), shot.url);
    assert.ok(host.find((n) => n.tagName === 'LABEL' && n.textContent.includes('Attach a picture of the game')));
    byId(host, 'bug-report-text').value = 'Pigs float';
    byData(host, 'bugReportSend').click();
    await flush();
    await flush();
    assert.deepEqual(api.calls[0], ['create', 'Pigs float', shot.url]);
    // A second report, unticked: no picture.
    sheet.open('new');
    await flush();
    assert.equal(taken, 2, 'a fresh picture for each new report');
    box.checked = false;
    box.dispatch('change');
    assert.equal(preview.hidden, true);
    byId(host, 'bug-report-text').value = 'No picture please';
    byData(host, 'bugReportSend').click();
    await flush();
    await flush();
    assert.deepEqual(api.calls[1], ['create', 'No picture please', null]);
  });

  it('when the view cannot be drawn the box is off and says so; a refused picture never costs the report', async () => {
    const off = mount(pictureApi(), () => null);
    off.sheet.open('new');
    await flush();
    const box = byId(off.host, 'reports-picture');
    assert.equal(box.checked, false);
    assert.equal(box.disabled, true);
    assert.equal(byId(off.host, 'reports-picture-hint').textContent, REPORT_TEXT.pictureNone);
    const api = pictureApi({ refusePicture: true });
    const { host, sheet, toasts } = mount(api, () => ({ url: JPEG(400), width: 800, height: 450 }));
    sheet.open('new');
    await flush();
    byId(host, 'bug-report-text').value = 'Pigs float';
    byData(host, 'bugReportSend').click();
    for (let i = 0; i < 4; i++) await flush();
    assert.equal(api.calls.length, 2);
    assert.ok(api.calls[0][2], 'first with the picture');
    assert.equal(api.calls[1][2], null, 'then without it');
    assert.deepEqual(toasts, [REPORT_TEXT.sentNoPicture]);
    // Something not a JPEG data URL from capture is never sent.
    const odd = pictureApi();
    const m = mount(odd, () => ({ url: 'https://evil.example/x.png' }));
    m.sheet.open('new');
    await flush();
    byId(m.host, 'bug-report-text').value = 'x';
    byData(m.host, 'bugReportSend').click();
    await flush();
    await flush();
    assert.equal(odd.calls[0][2], null);
  });

  it('a thread shows the report\'s picture under its first message; a click opens it full size', async () => {
    const { host, sheet } = mount(pictureApi(), () => null);
    await sheet.openTicket(7);
    await flush();
    const a = byData(host, 'reportsThreadPicture');
    assert.ok(a, 'the picture link');
    assert.equal(a.tagName, 'A');
    assert.equal(a.getAttribute('href'), '/report-pictures/7');
    assert.equal(a.getAttribute('target'), '_blank');
    assert.equal(a.getAttribute('rel'), 'noopener');
    assert.equal(a.getAttribute('aria-label'), REPORT_TEXT.pictureOpen);
    assert.equal(a.parentNode.dataset.author, 'player', 'under the report itself');
    const img = a.children[0];
    assert.equal(img.getAttribute('src'), '/report-pictures/7');
    assert.equal(img.getAttribute('alt'), REPORT_TEXT.pictureAlt);
    await sheet.openTicket(8);
    await flush();
    assert.equal(byData(host, 'reportsThreadPicture'), null, 'a report without one shows none');
  });

  it('the new controls are styled in both skins, Classic under its root', () => {
    const f = read('public/js/features/bug-report-feature.js');
    for (const sel of ['.reports-picture-row', '.reports-checkbox', '.reports-picture-thumb', '.reports-picture img']) assert.ok(f.includes(`[data-ui="modern"] #bug-report-panel ${sel}`), sel);
    const css = read('public/css/classic.css');
    for (const sel of ['.reports-picture-row', '.reports-checkbox', '.reports-picture-thumb', '.reports-picture img']) assert.ok(css.includes(`:root[data-ui="classic"] #bug-report-panel ${sel}`), sel);
    assert.match(f, /prefers-reduced-motion/);
  });
});

describe('the game wiring', () => {
  it('the feature mounts the sheet in the panel shell and polls the badge; game.js hands features the shell', () => {
    const f = read('public/js/features/bug-report-feature.js');
    assert.match(f, /engine\.panelShell\?\.add\?\.\(\{ id: 'bug-report-panel', kind: 'center'/);
    assert.match(f, /setInterval\(poll, UNREAD_POLL_MS\)/);
    assert.match(f, /if \(sheet\.state !== 'closed' \|\| document\.hidden/);
    assert.match(f, /reportFromHash\(globalThis\.location\?\.hash\)/);
    assert.match(f, /if \(engine\?\.mode !== 'multiplayer'\) return;/);
    assert.match(read('public/game.js'), /get panelShell\(\) \{\n    return panelShell;\n  \},/);
  });

  it('Classic restyles the sheet in place as a 2012 window, every rule under the classic root', () => {
    const css = read('public/css/classic.css');
    const block = css.slice(css.indexOf('/* == TICKETS =='));
    assert.ok(block.length > 200);
    for (const sel of ['#bug-report-panel .reports-card', '#bug-report-panel .reports-head h2', '#bug-report-panel .ui-sheet-x', '#bug-report-panel .reports-body', '#bug-report-panel .reports-foot', '#bug-btn .bug-unread']) assert.ok(block.includes(sel), sel);
    const rules = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '').match(/[^{}]+\{/g) || [];
    // Split each selector list at its top-level commas (not those inside :is()).
    const split = (sel) => { const out = ['']; let depth = 0; for (const ch of sel) { if (ch === '(') depth += 1; if (ch === ')') depth -= 1; if (ch === ',' && depth === 0) out.push(''); else out[out.length - 1] += ch; } return out; };
    for (const r of rules) for (const s of split(r.slice(0, -1))) if (s.trim()) assert.match(s.trim(), /^:root\[data-ui="classic"\]/, s.trim());
  });
});

describe('the site (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(sitePath(f), 'utf8');

  it('declares the two tables additively, with the indexes asked for', () => {
    const m = JSON.parse(src('minn.json'));
    const t = m.tables.groddle_tickets;
    const msg = m.tables.groddle_ticket_messages;
    for (const col of ['id', 'player_user_id', 'status', 'subject', 'created_at', 'updated_at', 'last_message_at', 'last_author_role', 'player_read_at', 'admin_read_at', 'context', 'legacy_post_id']) assert.ok(t.some((l) => l.startsWith(`${col} `)), col);
    assert.ok(t.includes('KEY player_updated (player_user_id,updated_at)'));
    assert.ok(t.includes('KEY status_updated (status,updated_at)'));
    assert.ok(t.includes('UNIQUE KEY legacy_post_id (legacy_post_id)'), 'a post becomes one ticket, even twice run');
    for (const col of ['id', 'ticket_id', 'author_user_id', 'author_role', 'body', 'created_at']) assert.ok(msg.some((l) => l.startsWith(`${col} `)), col);
    assert.ok(msg.includes('KEY ticket_id (ticket_id,id)'));
    assert.ok(m.types.some((x) => x.slug === 'groddle_feedback'), 'the old posts stay listed');
  });

  it('a player reaches only their own tickets: every route that names one reads it through mine()', () => {
    const php = src('src/Tickets.php');
    const routes = [...php.matchAll(/#\[Route\(Method::(\w+), '([^']+)', policy: new Policy\(Access::(\w+)\)\)\]\s*public function (\w+)\(([^)]*)\): Response\s*\{([\s\S]*?)\n    \}/g)];
    assert.deepEqual(routes.map((r) => `${r[1]} ${r[2]}`), ['Get /groddle/v1/tickets', 'Get /groddle/v1/tickets/unread', 'Get /groddle/v1/tickets/{id:\\d+}', 'Post /groddle/v1/tickets', 'Post /groddle/v1/tickets/{id:\\d+}/messages', 'Post /groddle/v1/tickets/{id:\\d+}/close']);
    for (const r of routes) {
      assert.equal(r[3], 'SignedIn', r[2]);
      if (r[2].includes('{id')) assert.match(r[6], /\$row = \$this->mine\(\$me, \(int\) \$id\);/, `${r[2]} goes through mine()`);
      assert.doesNotMatch(r[6], /->find\(\(int\) \$id\)/, `${r[2]} never reads a ticket by id alone`);
    }
    const store = src('src/TicketStore.php');
    assert.match(store, /WHERE id = \? AND player_user_id = \?', \[\$ticket, \$player\]/);
    assert.match(store, /WHERE player_user_id = \? ORDER BY updated_at DESC/);
    assert.match(php, /throw new RestError\('groddle_ticket_missing', 'That report is not one of yours\.', 404\)/);
    // The old route files a ticket too, so games built before the sheet keep working.
    assert.match(src('src/BugReports.php'), /#\[Route\(Method::Post, '\/groddle\/v1\/feedback', policy: new Policy\(Access::SignedIn\)\)\]\s*public function send\(Request \$request\): Response\s*\{\s*return \(new Tickets\(\$this->minn\)\)->create\(\$request\);/);
  });

  it('keeps the report\'s limits: length, rate, and the reply limit', () => {
    const php = src('src/Tickets.php');
    const bug = src('src/BugReports.php');
    assert.match(bug, /MAX_MESSAGE = 2000;/);
    assert.match(bug, /PER_WINDOW = 3;/);
    assert.match(bug, /PER_DAY = 20;/);
    assert.match(php, /openedSince\(\$me->id, BugReports::WINDOW, \$now\) >= BugReports::PER_WINDOW \|\| \$store->openedSince\(\$me->id, 86400, \$now\) >= BugReports::PER_DAY/);
    assert.match(php, /writtenSince\(\$me->id, BugReports::WINDOW, \$now\) >= self::REPLY_PER_WINDOW/);
    assert.match(php, /BugReports::context\(/);
  });

  it('the console\'s routes are manage_options only, and each action is logged', () => {
    const php = src('src/AdminTickets.php');
    const routes = [...php.matchAll(/#\[Route\(Method::(\w+), '([^']+)', policy: new Policy\(([^)]*)\)\)\]/g)];
    assert.equal(routes.length, 6);
    for (const r of routes) assert.equal(r[3], 'Access::Cap, self::ADMIN', r[2]);
    assert.match(php, /private const ADMIN = 'manage_options';/);
    for (const kind of ['reply', 'close', 'reopen', 'migrate']) assert.match(php, new RegExp(`AdminConsole::recordAction\\(\\$this->minn->db, \\$admin->id, [^,]+, '${kind}'`), kind);
    assert.match(src('src/Extension.php'), /new Tickets\(\$minn\)/);
    assert.match(src('src/Extension.php'), /new AdminTickets\(\$minn\)/);
  });

  it('an administrator\'s reply emails the player once until they read it, within the site\'s mail ceiling', () => {
    const php = src('src/AdminTickets.php');
    assert.match(php, /\$waiting = \$email && \$this->mailWaiting\(\$row\);/);
    assert.match(php, /\$delivery = !\$email \? 'note' : \(\$waiting \? 'unread' : \$this->mail\(/);
    // Waiting means an emailed reply they have not read: unread news and a 'mailed' reply logged since they read it.
    const waiting = php.slice(php.indexOf('private function mailWaiting('), php.indexOf('private function mail('));
    assert.match(waiting, /TicketStore::unreadFor\(\$row, TicketStore::PLAYER\)/);
    assert.match(waiting, /kind = 'reply' AND delivery = 'mailed' AND detail LIKE \?/);
    assert.match(waiting, /'\{"ticket":' \. \(int\) \$row\['id'\] \. ',%'/);
    assert.match(waiting, /AND at > \?/);
    assert.match(php, /overHourCap\(\$now, 'report reply'\)/);
    assert.match(php, /\$limits->record\(MailLimits::REPLY,/);
    assert.match(src('src/MailLimits.php'), /public const REPLY = 'reply';/);
    // The character's name or display name, never the username.
    assert.doesNotMatch(php.slice(php.indexOf('private function mail(')), /user_login/);
    // The migration emails nobody.
    assert.doesNotMatch(src('src/TicketMigration.php'), /mail\(/);
  });

  it('an administrator can reply without an email: a note, logged as delivery note, the player still sees it (Austin 2026-10-30)', async () => {
    const php = src('src/AdminTickets.php');
    assert.match(php, /\$email = \(\$body\['email'\] \?\? true\) !== false;/, 'emailing stays the default');
    assert.match(php, /AdminConsole::recordAction\(\$this->minn->db, \$admin->id, \$player, 'reply', \[.*\], \$delivery, \$now\);/);
    assert.match(php, /'note' => "Note added\. \{\$name\} sees it in the game; no email went\.",/);
    // The note is a message like any reply: the same store call, so the thread and the badge show it.
    assert.match(php, /\$this->store\(\)->add\(\(int\) \$row\['id'\], \$admin->id, TicketStore::ADMIN, \$message, \$now\);\s*\$delivery = /);
    const page = src('src/AdminConsolePage.php');
    assert.match(page, /<label class="console-check"><input type="checkbox" name="noemail" data-console-reply-noemail \/> Don't email<\/label>/);
    assert.ok(!/data-console-reply-noemail[^>]*checked/.test(page), 'unticked: emailing is the default');
    const js = src('console/console.js');
    assert.match(js, /body: \{ message: text, email: !noEmail\.checked \}/);
    const mod = await import(pathToFileURL(sitePath('console/console.js')).href);
    assert.deepEqual(mod.replyFormWords(false).send, 'Send reply');
    assert.deepEqual(mod.replyFormWords(true).send, 'Add note');
    assert.match(mod.replyFormWords(true).placeholder, /No email goes/);
    assert.equal(mod.logWords({ kind: 'reply', player: { name: 'Ada' }, detail: { subject: 'Pigs' }, delivery: 'note' }), 'replied to Ada\'s report “Pigs” (a note, not emailed)');
    for (const w of [...Object.values(mod.replyFormWords(true)), ...Object.values(mod.replyFormWords(false))]) assert.ok(!/[—–]/.test(w), w);
  });

  it('the console has a Reports tab: list, thread, reply, close and reopen, and the old reports\' button', async () => {
    const page = src('src/AdminConsolePage.php');
    for (const hook of ['data-console-tab="reports"', 'data-console-tickets', 'data-console-thread', 'data-console-reply', 'data-console-thread-close', 'data-console-thread-reopen', 'data-console-migrate', 'data-console-ticket-filter']) assert.ok(page.includes(hook), hook);
    assert.match(page, /ASSET_KEY = 'g491-4'/);
    const js = src('console/console.js');
    for (const route of ["admin/tickets?status=", "admin/tickets/${id}", "admin/tickets/${tickets.open}/reply", "admin/tickets/${tickets.open}/${kind}", "admin/tickets/migrate"]) assert.ok(js.includes(route), route);
    assert.match(js, /el\('p', \{ class: 'console-msg-body', text: m\.body \}\)/, 'messages set as text');
    const mod = await import(pathToFileURL(sitePath('console/console.js')).href);
    assert.deepEqual(mod.contextRows({ street: 'GA5', streetName: 'Hechey Track', x: '1', y: '', errors: ['boom', ''] }), [['Street', 'Hechey Track'], ['Street id', 'GA5'], ['x', '1'], ['Error 1', 'boom']]);
    assert.equal(mod.logWords({ kind: 'reply', player: { name: 'Ada' }, detail: { subject: 'Pigs' }, delivery: 'mailed' }), 'replied to Ada\'s report “Pigs” (emailed)');
    assert.equal(mod.logWords({ kind: 'migrate', player: { id: 0 }, detail: { made: 10 }, delivery: 'stored' }), 'brought in 10 old bug reports as tickets');
    for (const w of Object.values(mod.TICKET_STATUS)) assert.ok(!/—/.test(w));
  });

  it('the rules, the old posts and the email (php)', { skip: (!hasPhp && 'no php') || noEngine }, () => {
    const out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/minn-accounts/tickets.php'), engine, SITE_DIR], { encoding: 'utf8' }));
    assert.deepEqual(out.subject, { short: 'Pigs float', long: `${'a'.repeat(59)}…`, longLen: 60, spaces: 'a b' });
    assert.deepEqual(out.statusAfter, ['open', 'answered']);
    assert.deepEqual(out.unread, { adminWroteNeverRead: true, adminWroteReadBefore: true, adminWroteReadAfter: false, playerWroteForPlayer: false, playerWroteForAdmin: true, playerWroteAdminRead: false });
    assert.deepEqual(out.clean, { control: 'ab\nc', badUtf8: 'ok ?( there', cut: 2000 });
    // An old post: the words (entities read back, <br> a line, paragraphs a blank line apart), the Details as the context.
    assert.equal(out.migration.message, 'The pig & the <b>butterfly</b> froze.\nThen the street went dark.\n\nSecond paragraph.');
    assert.deepEqual(out.migration.context, { street: 'GA5101HF7F429V5', streetName: 'Hechey Track', x: '120', y: '-30', build: 'g465-1', page: '/play/online/', agent: 'Test/1.0', screen: '1280x800', errors: ['TypeError: boom <here>', 'second'] });
    assert.equal(out.migration.bareMessage, 'Only words');
    assert.equal(out.migration.bareContext.street, 'LIF12PMQ5121D68', 'meta fills what the Details lack');
    assert.deepEqual(out.migration.bareContext.errors, ['From meta']);
    assert.equal(out.migration.titleMessage, 'Title only', 'the title without its "<character>: "');
    // The email: escaped, by character name, the thread's link.
    const html = out.mail.html;
    assert.equal(out.mail.subject, 'A reply to your Groddle Afternoon message');
    assert.ok(html.includes('Hi <strong>Zz &lt;b&gt;Ada&lt;/b&gt;</strong>,'));
    assert.ok(html.includes('The &lt;i&gt;pig&lt;/i&gt; froze'));
    assert.ok(html.includes('Thanks!<br>\n&lt;script&gt;alert(1)&lt;/script&gt; &amp; fixed.'));
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('href="https://groddle.example/play/online/#report=7"'));
    assert.ok(!/—/.test(html), 'no em dashes');
    assert.ok(out.mail.headers.includes('Content-Type: text/html; charset=UTF-8'));
  });

  it('the migration is a WP-CLI file Austin can run once at release (safe again)', () => {
    const cli = src('bin/migrate-bug-reports.php');
    assert.match(cli, /new Groddle\\Minn\\TicketMigration\(\$db\)/);
    assert.match(cli, /dry-run/);
    const mig = src('src/TicketMigration.php');
    assert.match(mig, /legacy_post_id/);
    assert.match(mig, /\$store->open\(\(int\) \$row\['post_author'\], \$message, \$context, \$at, \$id\)/);
    assert.match(src('src/TicketStore.php'), /'INSERT ' \. \(\$legacyPost !== null \? 'IGNORE ' : ''\)/);
    assert.doesNotMatch(mig, /UPDATE [^']*posts|DELETE/i, 'the posts stay as they are');
  });
});

describe('the site keeps a report\'s picture (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(sitePath(f), 'utf8');

  it('declares groddle_ticket_pictures additively and bumps the schema version', () => {
    const m = JSON.parse(src('minn.json'));
    const t = m.tables.groddle_ticket_pictures;
    for (const col of ['ticket_id', 'player_user_id', 'picture', 'width', 'height', 'bytes', 'created_at']) assert.ok(t.some((l) => l.startsWith(`${col} `)), col);
    assert.ok(t.includes('picture mediumblob NOT NULL'));
    assert.ok(t.includes('PRIMARY KEY  (ticket_id)'), 'one picture a ticket');
    assert.ok(t.includes('KEY player_user_id (player_user_id)'), 'cleanups find it by player');
    const [a, b, c] = m.version.split('.').map(Number);
    assert.ok(a > 0 || b > 5 || (b === 5 && c >= 23), `schema version past 0.5.22 (HomePicture's): ${m.version}`);
    // Additive: the tickets' own tables keep every column.
    for (const col of ['id', 'player_user_id', 'status', 'subject', 'context', 'legacy_post_id']) assert.ok(m.tables.groddle_tickets.some((l) => l.startsWith(`${col} `)), col);
  });

  it('checks the picture on the server: JPEG from its bytes, at most 1280x1280 and 300 KiB, written again by GD', () => {
    const php = src('src/ReportPicture.php');
    assert.match(php, /MAX_BYTES = 307_200;/);
    assert.match(php, /MAX_W = 1280;/);
    assert.match(php, /MAX_H = 1280;/);
    assert.match(php, /str_starts_with\(\$bytes, "\\xFF\\xD8\\xFF"\)/);
    assert.match(php, /SnapImage::readJpeg\(\$bytes\)/);
    assert.match(php, /imagejpeg\(\$image, null, \$quality\)/);
    assert.match(php, /public const CODE = 'groddle_report_picture';/);
    // Only with a new report, after the report's own limits.
    const t = src('src/Tickets.php');
    const create = t.slice(t.indexOf('public function create('), t.indexOf('public function reply('));
    assert.ok(create.indexOf('openedSince(') > 0 && create.indexOf('openedSince(') < create.indexOf('ReportPicture::accept('), 'the rate limit first');
    assert.match(create, /\$store->open\(\$me->id, \$message, \$context, \$now, null, \$picture\)/);
    assert.doesNotMatch(t.slice(t.indexOf('public function reply(')), /ReportPicture/, 'no picture with a reply');
    assert.match(src('src/TicketStore.php'), /INSERT INTO ' \. \$this->db->table\(self::PICTURES\) \. ' \(ticket_id, player_user_id, picture, width, height, bytes, created_at\)/);
    // Binary as base64 through FROM_BASE64, as Profiles writes its pictures: raw bytes bound as a string never stored (QA 2026-10-30).
    assert.match(src('src/TicketStore.php'), /VALUES \(\?, \?, FROM_BASE64\(\?\), \?, \?, \?, \?\)', \[\$id, \$player, base64_encode\(\$picture\['bytes'\]\)/);
  });

  it('serves it only to the report\'s player and the administrators, never cached', () => {
    const php = src('src/TicketPictures.php');
    assert.match(php, /#\[Route\(Method::Get, '\/report-pictures\/\{id:\\d\+\}', policy: new Policy\(Access::Public\)\)\]/);
    assert.match(php, /if \(\$user === null\) \{\s*throw new RouteMiss\(\);/);
    assert.match(php, /\$mine = \(int\) \$row\['player_user_id'\] === \$user->id;/);
    assert.match(php, /if \(!\$mine && !Capabilities::fromDb\(\$this->minn->db\)->can\(\$user->id, 'manage_options'\)\) \{\s*throw new RouteMiss\(\);/);
    for (const h of ["'Content-Type' => 'image/jpeg'", "'Cache-Control' => 'private, no-store'", "'X-Content-Type-Options' => 'nosniff'", "default-src 'none'; sandbox"]) assert.ok(php.includes(h), h);
    assert.match(src('src/Extension.php'), /\$minn->routes\(new TicketPictures\(\$minn\)\);/);
    // Both threads carry where it is, never the bytes.
    assert.match(src('src/Tickets.php'), /'picture' => \$store->pictureOut\(\$id\)/);
    assert.match(src('src/AdminTickets.php'), /'picture' => \$store->pictureOut\(\$id\),/);
    assert.match(src('src/TicketStore.php'), /SELECT width, height FROM ' \. \$this->db->table\(self::PICTURES\)/);
  });

  it('the console shows it in the thread, click to open full size', async () => {
    const page = src('src/AdminConsolePage.php');
    for (const hook of ['data-console-picture', 'data-console-picture-link', 'data-console-picture-img']) assert.ok(page.includes(hook), hook);
    assert.match(page, /<a data-console-picture-link target="_blank" rel="noopener"/);
    const mod = await import(pathToFileURL(sitePath('console/console.js')).href);
    assert.equal(mod.pictureSrc({ url: '/report-pictures/3' }), '/report-pictures/3');
    assert.equal(mod.pictureSrc({ url: '//evil.example/x' }), '');
    assert.equal(mod.pictureSrc(null), '');
  });

  it('the picture rules (php)', { skip: (!hasPhp && 'no php') || noEngine }, () => {
    const out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/minn-accounts/tickets.php'), engine, SITE_DIR], { encoding: 'utf8' })).picture;
    assert.deepEqual(out.kept, { width: 640, height: 360, soi: true, fits: true, tagDropped: true });
    assert.deepEqual(out.bytesDecide, { ok: true }, 'a data URL\'s own type is not trusted');
    assert.deepEqual(out.pngNamedJpeg, { code: 'groddle_report_picture_type', status: 415 });
    assert.deepEqual(out.tooWide, { code: 'groddle_report_picture_size', status: 400 });
    assert.deepEqual(out.tooSmall, { code: 'groddle_report_picture_size', status: 400 });
    assert.deepEqual(out.tooLarge, { code: 'groddle_report_picture_too_large', status: 413 });
    assert.deepEqual(out.tooLong, { code: 'groddle_report_picture_too_large', status: 413 });
    for (const k of ['garbage', 'cut', 'notString']) assert.deepEqual(out[k], { code: 'groddle_report_picture', status: 400 }, k);
    assert.deepEqual(out.limits, { maxBytes: REPORT_PICTURE.maxBytes, maxW: REPORT_PICTURE.maxWidth, maxH: REPORT_PICTURE.maxHeight }, 'the game and the site agree');
  });
});
