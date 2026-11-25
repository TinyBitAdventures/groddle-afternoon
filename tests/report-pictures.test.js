// Several pictures a report, any kind (Austin 2026-11-15: "The picture taking for reports is a bit rough.
// Only allows for ingame screenshots and only 1 extra per posting... open it up for uploads... drag/drop
// any image format... thumbnails with clickable previews before they submit"). A new report and a reply
// carry up to four pictures: dropped, pasted, picked or taken, each read in the browser into the JPEG the
// site keeps (js/report-pictures.js), shown as thumbnails with an x, opened over the game together
// (js/ui/picture-lightbox.js gallery); the thread shows each message's own. The site keeps several a
// message (groddle-afternoon-site TicketStore MESSAGE_PICTURES by position, Tickets PICTURES_PER_*), and
// the phone page takes several photos the same way.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PICTURE_TEXT as P, REPORT_PICTURES, convertPicture, dragHasFiles, fileName, filesOf, mayBePicture, pictureAttempts, pictureError, refusalWords, roomFor, takeForRoom } from '../public/js/report-pictures.js?v=84c52271';
import { REPORT_PICTURE, REPORT_TEXT as T, createReportsApi, messagePictures, pictureSrc, picturesBody } from '../public/js/reports.js?v=e861d5aa';
import { mountReportsSheet } from '../public/js/ui/reports-sheet.js?v=92486673';
import { LIGHTBOX_TEXT, galleryStep, openLightbox } from '../public/js/ui/picture-lightbox.js?v=e049f063';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { HAS_PHP, PHP, phpSkip } from './php.js';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (ok, ms = 5000) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await wait(5);
  assert.ok(ok(), 'timed out');
};
const hasPhp = HAS_PHP;
const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const noEngine = !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)';
const JPEG = (tag) => `data:image/jpeg;base64,${Buffer.from(`jpeg ${tag} ${'x'.repeat(30)}`).toString('base64')}`;
const file = (name, type = 'image/png', size = 1000) => ({ name, type, size });

// —— A small DOM with bubbling, enough for the sheet and the lightbox ——
class Node {
  constructor(tag, doc) {
    Object.assign(this, { tagName: String(tag).toUpperCase(), ownerDocument: doc, children: [], attrs: {}, listeners: {}, dataset: {}, parentNode: null, _text: '', hidden: false, disabled: false, value: '', className: '', style: {}, scrollLeft: 0, scrollTop: 0, clientWidth: 0, clientHeight: 0 });
    const self = this;
    this.classList = {
      toggle(c, on) { const set = new Set(self.className.split(/\s+/).filter(Boolean)); if (on) set.add(c); else set.delete(c); self.className = [...set].join(' '); },
      contains: (c) => self.className.split(/\s+/).includes(c),
    };
  }
  setAttribute(k, v) {
    if (k === 'hidden') { this.hidden = true; return; }
    if (k === 'class') { this.className = String(v); return; }
    if (k === 'id') this.id = String(v);
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
    this.attrs[k] = String(v);
  }
  removeAttribute(k) {
    delete this.attrs[k];
    if (k.startsWith('data-')) delete this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
  }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  append(...ns) { for (const n of ns) { const c = typeof n === 'string' ? Object.assign(new Node('#text', this.ownerDocument), { _text: n }) : n; if (c.parentNode) c.parentNode.children = c.parentNode.children.filter((x) => x !== c); c.parentNode = this; this.children.push(c); } }
  replaceChildren(...ns) { for (const c of this.children) c.parentNode = null; this.children = []; this.append(...ns); }
  remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument.documentElement; }
  get lastElementChild() { return this.children.at(-1) || null; }
  set textContent(t) { this.children = []; this._text = String(t); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  removeEventListener() {}
  focus() { this.ownerDocument.activeElement = this; }
  click() { if (!this.disabled) fire(this, 'click'); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 50 }; }
  all() { return [this, ...this.children.flatMap((c) => c.all())]; }
  find(pred) { return this.all().find(pred) || null; }
  querySelector() { return null; }
}
function fakeDoc() {
  const doc = { activeElement: null };
  doc.createElement = (t) => new Node(t, doc);
  doc.createTextNode = (t) => Object.assign(new Node('#text', doc), { _text: String(t) });
  doc.documentElement = new Node('html', doc);
  return doc;
}
function fire(node, kind, init = {}) {
  const ev = { type: kind, target: node, button: 0, detail: 1, stopped: false, prevented: false, ...init };
  ev.stopPropagation = () => { ev.stopped = true; };
  ev.preventDefault = () => { ev.prevented = true; };
  for (let n = node; n && !ev.stopped; n = n.parentNode) for (const fn of n.listeners[kind] || []) fn(ev);
  return ev;
}
const byData = (r, k, ok = () => true) => r.find((n) => k in n.dataset && ok(n));
const allData = (r, k) => r.all().filter((n) => k in n.dataset);
const tray = (host, which) => byData(host, 'reportsTray', (n) => n.dataset.reportsTray === which);
const thumbs = (t) => t.children.filter((li) => !li.hidden);
const status = (host) => byData(host, 'bugReportStatus').textContent;
const transfer = (files) => ({ types: ['Files'], files });

/** Reads a fake file: a JPEG named for it, refusing names that start with "bad". */
const fakeConvert = async (f) => {
  if (!mayBePicture(f)) throw pictureError('not_image', f);
  if (f.name.startsWith('bad')) throw pictureError('unreadable', f);
  return { url: JPEG(f.name), width: 320, height: 200, bytes: 40, name: f.name };
};

/** The sheet over a fake site: every reply and new report recorded. */
function mount({ capture = () => null, refuse = false } = {}) {
  const doc = fakeDoc();
  const page = new Node('body', doc);
  doc.documentElement.append(page);
  const host = new Node('div', doc);
  page.append(host);
  const calls = { reply: [], create: [] };
  const ticket = { id: 3, subject: 'Pigs float', status: 'open', lastAuthor: 'player', lastMessageAt: '2026-11-15T10:00:00Z', unread: false };
  let messages = [{ id: 8, author: 'player', body: 'Pigs float', at: '2026-11-15T10:00:00Z', edited: null, pictures: [{ url: '/report-pictures/3/8/1', width: 300, height: 200 }], picture: { url: '/report-pictures/3/8', width: 300, height: 200 } }];
  let refusing = refuse;
  const api = {
    list: async () => ({ tickets: [ticket] }),
    unread: async () => ({ unread: 0 }),
    thread: async () => ({ ticket, messages, picture: { url: '/report-pictures/3', width: 640, height: 360 }, editable: false }),
    reply: async (id, message, pictures = null) => {
      calls.reply.push({ id, message, pictures });
      if (pictures && refusing) { refusing = false; throw Object.assign(new Error('no'), { status: 413, code: 'groddle_report_picture_too_large', data: { message: 'no' } }); }
      const n = 8 + messages.length;
      const list = (Array.isArray(pictures) ? pictures : pictures ? [pictures] : []).map((_, i) => ({ url: `/report-pictures/3/${n}/${i + 1}`, width: 320, height: 200 }));
      messages = [...messages, { id: n, author: 'player', body: message, at: '2026-11-15T10:05:00Z', edited: null, pictures: list, picture: list[0] ? { ...list[0], url: `/report-pictures/3/${n}` } : null }];
      return { ticket, messages, editable: false };
    },
    create: async (message, context, pictures = null) => { calls.create.push({ message, pictures }); return { status: 'sent', id: 4, ticket: { ...ticket, id: 4 } }; },
    close: async () => ({ ticket, messages }),
  };
  const sheet = mountReportsSheet({ doc, host, api, capture, takePicture: () => {}, convert: fakeConvert, now: () => Date.parse('2026-11-15T10:10:00Z'), uiIdle: 5 });
  return { doc, host, sheet, calls };
}

describe('reading a picture (js/report-pictures.js)', () => {
  it('four a message, the files that fit taken in order', () => {
    assert.equal(REPORT_PICTURES.max, 4);
    assert.equal(roomFor(0), 4);
    assert.equal(roomFor(3), 1);
    assert.equal(roomFor(6), 0);
    assert.deepEqual(takeForRoom(['a', 'b', 'c'], 2), { take: ['a', 'b'], over: 1 });
    assert.deepEqual(takeForRoom(['a'], 0), { take: [], over: 1 });
  });

  it('a picture is fitted to the site\'s box, a tiny one set on a margin to the site\'s smallest side', () => {
    const [big] = pictureAttempts(4032, 3024);
    assert.deepEqual(big, { canvasW: 1280, canvasH: 960, drawW: 1280, drawH: 960, x: 0, y: 0, quality: 0.8 });
    assert.deepEqual(pictureAttempts(3024, 4032)[0].canvasH, 1280, 'a portrait photo fits 1280 tall');
    assert.deepEqual(pictureAttempts(20, 10)[0], { canvasW: 64, canvasH: 64, drawW: 20, drawH: 10, x: 22, y: 27, quality: 0.8 });
    const strip = pictureAttempts(3000, 10)[0];
    assert.equal(strip.canvasW, 1280);
    assert.equal(strip.canvasH, 64, 'never under the site\'s 64 px side');
    // Each width with each quality, largest first, never past the site's limits.
    const all = pictureAttempts(2000, 1500);
    assert.equal(all.length, REPORT_PICTURE.widths.length * REPORT_PICTURE.qualities.length);
    assert.ok(all.every((a) => a.canvasW <= 1280 && a.canvasH <= 1280));
    assert.deepEqual(pictureAttempts(0, 10), []);
  });

  it('turns any picture into a JPEG data URL within the limits, never the file\'s own bytes', async () => {
    let closed = 0;
    const tried = [];
    const decode = async () => ({ source: 'bitmap', width: 2000, height: 1000, close: () => { closed += 1; } });
    const big = `data:image/jpeg;base64,${'A'.repeat(500000)}`;
    const small = `data:image/jpeg;base64,${'B'.repeat(4000)}`;
    const draw = (pic, a) => { tried.push([a.canvasW, a.quality]); return tried.length < 3 ? big : small; };
    const got = await convertPicture(file('cat.png'), { decode, draw });
    assert.equal(got.url, small);
    assert.deepEqual([got.width, got.height], [1280, 640]);
    assert.equal(got.name, 'cat.png');
    assert.deepEqual(tried, [[1280, 0.8], [1280, 0.7], [1280, 0.6]], 'lower quality before a smaller size');
    assert.equal(closed, 1, 'the decoded picture is let go');
    // HEIC with no type, AVIF, GIF, BMP, WebP: the decoder decides.
    for (const f of [file('IMG_1.HEIC', ''), file('a.avif', 'image/avif'), file('a.gif', 'image/gif'), file('a.bmp', 'image/bmp'), file('a.webp', 'image/webp')]) {
      assert.match((await convertPicture(f, { decode, draw: () => small })).url, /^data:image\/jpeg;base64,/, f.name);
    }
  });

  it('refuses what is not a picture, cannot be read or is too big, naming the file', async () => {
    const ok = async () => ({ source: 1, width: 10, height: 10 });
    const refusal = async (f, opts) => { try { await convertPicture(f, opts); return null; } catch (err) { return err; } };
    let err = await refusal(file('notes.txt', 'text/plain'), { decode: ok, draw: () => JPEG('x') });
    assert.equal(err.code, 'not_image');
    assert.equal(err.words, P.notImage('notes.txt'));
    assert.match(refusalWords(err), /notes\.txt/);
    err = await refusal(file('broken.png'), { decode: async () => { throw new Error('bad'); }, draw: () => JPEG('x') });
    assert.equal(err.code, 'unreadable');
    assert.match(err.words, /broken\.png could not be opened as a picture/);
    err = await refusal(file('mystery', ''), { decode: async () => { throw new Error('bad'); } });
    assert.equal(err.code, 'not_image', 'a file with no type that does not decode is not a picture');
    err = await refusal(file('huge.png', 'image/png', REPORT_PICTURES.maxFileBytes + 1), { decode: ok });
    assert.equal(err.code, 'too_big');
    err = await refusal(file('dense.png'), { decode: ok, draw: () => `data:image/jpeg;base64,${'A'.repeat(500000)}` });
    assert.equal(err.code, 'too_big', 'never fits at any size');
    err = await refusal(file('odd.png'), { decode: ok, draw: () => 'data:image/png;base64,AAAA' });
    assert.equal(err.code, 'unreadable', 'only a JPEG goes');
    assert.equal(fileName({ name: '' }), 'That file');
    assert.ok(fileName({ name: `${'a'.repeat(80)}.png` }).length <= 60);
  });

  it('a drop\'s or a paste\'s files, and only a drag with files is taken', () => {
    const f = file('a.png');
    assert.deepEqual(filesOf({ files: [f] }), [f]);
    assert.deepEqual(filesOf({ files: [], items: [{ kind: 'string' }, { kind: 'file', getAsFile: () => f }] }), [f]);
    assert.deepEqual(filesOf(null), []);
    assert.equal(dragHasFiles({ types: ['text/plain', 'Files'] }), true);
    assert.equal(dragHasFiles({ types: ['text/plain'] }), false);
  });

  it('the words are plain, with no dashes', () => {
    for (const [k, v] of Object.entries(P)) assert.doesNotMatch(typeof v === 'function' ? v('x.png', 4) : v, /[—–]/, k);
    assert.equal(P.add, 'Add pictures');
  });
});

describe('sending several (js/reports.js)', () => {
  it('one goes as "picture", several as "pictures" with the first again for an older site', async () => {
    assert.deepEqual(picturesBody(null), {});
    assert.deepEqual(picturesBody('a'), { picture: 'a' });
    assert.deepEqual(picturesBody(['a']), { picture: 'a' });
    assert.deepEqual(picturesBody(['a', '', 'b']), { pictures: ['a', 'b'], picture: 'a' });
    const sent = [];
    const fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) }; };
    const api = createReportsApi({ baseUri: 'https://groddle.example/play/online/', fetch, nonce: '0123456789' });
    await api.reply(3, 'Two', ['p1', 'p2']);
    await api.create('New', { street: 'x' }, ['p1', 'p2', 'p3']);
    assert.deepEqual(sent, [{ message: 'Two', pictures: ['p1', 'p2'], picture: 'p1' }, { message: 'New', context: { street: 'x' }, pictures: ['p1', 'p2', 'p3'], picture: 'p1' }]);
  });

  it('a message\'s pictures are its list, else G791\'s one, and only the site\'s addresses', () => {
    assert.deepEqual(messagePictures({ pictures: [{ url: '/report-pictures/3/9/1' }, { url: 'javascript:alert(1)' }, { url: '/report-pictures/3/9/2' }] }).map((p) => p.url), ['/report-pictures/3/9/1', '/report-pictures/3/9/2']);
    assert.deepEqual(messagePictures({ picture: { url: '/report-pictures/3/9' } }).map((p) => p.url), ['/report-pictures/3/9']);
    assert.deepEqual(messagePictures({ pictures: [], picture: { url: '/report-pictures/3/9' } }), [], 'the list wins');
    assert.equal(pictureSrc({ url: '/report-pictures/3/9/4' }), '/report-pictures/3/9/4');
  });
});

describe('the Reports window\'s pictures (js/ui/reports-sheet.js)', () => {
  it('a reply takes dropped, pasted and picked pictures as thumbnails; a file that is not a picture is named', async () => {
    const { host, sheet, calls } = mount();
    await sheet.openTicket(3);
    const panel = sheet.panel;
    // A drag with files lights the window; the drop adds them.
    const over = fire(panel, 'dragover', { dataTransfer: transfer([]) });
    assert.equal(over.prevented, true);
    fire(panel, 'dragenter', { dataTransfer: transfer([]) });
    assert.ok(panel.hasAttribute('data-dropping'));
    const drop = fire(panel, 'drop', { dataTransfer: transfer([file('one.png'), file('two.jpg', 'image/jpeg')]) });
    assert.equal(drop.prevented, true, 'the browser never opens the file in place of the game');
    assert.ok(!panel.hasAttribute('data-dropping'));
    await waitFor(() => sheet.pictures.length === 2);
    // A paste of a picture (the clipboard's files); a paste of words is left to the box.
    const words = fire(byData(host, 'reportsReplyText'), 'paste', { clipboardData: { files: [], items: [{ kind: 'string' }] } });
    assert.equal(words.prevented, false);
    fire(byData(host, 'reportsReplyText'), 'paste', { clipboardData: { files: [file('shot.png')] } });
    await waitFor(() => sheet.pictures.length === 3);
    // The picker: a text file is refused by name, the picture taken.
    const input = byData(host, 'reportsFile');
    assert.equal(input.getAttribute('type'), 'file');
    assert.ok(input.hasAttribute('multiple'));
    assert.match(input.getAttribute('accept'), /image\/\*/);
    input.files = [file('notes.txt', 'text/plain')];
    fire(input, 'change');
    await waitFor(() => status(host).includes('notes.txt'));
    assert.equal(status(host), P.notImage('notes.txt'));
    assert.equal(sheet.pictures.length, 3);
    const t = tray(host, 'reply');
    assert.equal(t.hidden, false);
    assert.deepEqual(thumbs(t).map((li) => li.dataset.reportsThumb), ['1', '2', '3']);
    assert.equal(thumbs(t)[0].children[0].children[0].getAttribute('alt'), P.thumbAlt(1));
    // Send: every picture with the words, then they are let go; the thread shows them.
    byData(host, 'reportsReplyText').value = 'Three of them';
    byData(host, 'reportsSendReply').click();
    await waitFor(() => calls.reply.length === 1 && sheet.state === 'open');
    assert.deepEqual(calls.reply[0].pictures, [JPEG('one.png'), JPEG('two.jpg'), JPEG('shot.png')]);
    assert.deepEqual(sheet.pictures, []);
    assert.equal(tray(host, 'reply').hidden, true);
    const shown = allData(host, 'reportsMsgPicture').map((a) => a.getAttribute('href'));
    assert.deepEqual(shown, ['/report-pictures/3/8/1', '/report-pictures/3/9/1', '/report-pictures/3/9/2', '/report-pictures/3/9/3']);
  });

  it('four at most: the rest are left out and said so; Add pictures and Take a picture wait while it is full', async () => {
    const { host, sheet } = mount();
    await sheet.openTicket(3);
    await sheet.addFiles([1, 2, 3, 4, 5].map((n) => file(`p${n}.png`)));
    assert.equal(sheet.pictures.length, 4);
    assert.equal(status(host), P.leftOut(1));
    assert.equal(sheet.room, 0);
    assert.equal(byData(host, 'reportsAdd').disabled, true);
    assert.equal(byData(host, 'reportsTake').disabled, true);
    await sheet.addFiles([file('p6.png')]);
    assert.equal(status(host), P.full);
    // A thumbnail's x frees a place; focus stays in the row.
    const t = tray(host, 'reply');
    byData(thumbs(t)[1], 'reportsThumbRemove').click();
    assert.deepEqual(sheet.pictures.map((p) => p.name), ['p1.png', 'p3.png', 'p4.png']);
    assert.equal(byData(host, 'reportsAdd').disabled, false);
    assert.ok(host.ownerDocument.activeElement?.dataset && 'reportsThumbRemove' in host.ownerDocument.activeElement.dataset);
  });

  it('a thumbnail opens the pictures over the game; Left and Right go between them, Esc closes only the picture', async () => {
    const { host, sheet } = mount();
    await sheet.openTicket(3);
    await sheet.addFiles([file('a.png'), file('b.png'), file('c.png')]);
    const t = tray(host, 'reply');
    fire(thumbs(t)[1].children[0], 'click', { button: 0 });
    const lb = byData(host, 'pictureLightbox');
    assert.ok(lb);
    assert.equal(lb.dataset.count, '3');
    assert.equal(lb.dataset.index, '1');
    assert.equal(byData(lb, 'pictureLightboxCount').textContent, LIGHTBOX_TEXT.count(2, 3));
    fire(lb, 'keydown', { key: 'ArrowRight' });
    assert.equal(lb.dataset.index, '2');
    assert.equal(byData(lb, 'pictureLightboxImg').getAttribute('src'), byData(thumbs(t)[2], 'reportsHeldPicture').getAttribute('href'));
    byData(lb, 'pictureLightboxNext').click();
    assert.equal(lb.dataset.index, '0', 'round to the first');
    byData(lb, 'pictureLightboxPrev').click();
    assert.equal(lb.dataset.index, '2');
    fire(lb, 'keydown', { key: 'Escape' });
    assert.equal(byData(host, 'pictureLightbox'), null);
    assert.equal(sheet.state, 'open', 'the window stays');
    // In the thread, the report's own picture and its first message's open together.
    fire(byData(host, 'reportsThreadPicture'), 'click', { button: 0 });
    const box = byData(host, 'pictureLightbox');
    assert.equal(box.dataset.count, '2');
    assert.equal(box.dataset.index, '0');
  });

  it('a refused picture never costs the words; the pictures stay for another try', async () => {
    const { host, sheet, calls } = mount({ refuse: true });
    await sheet.openTicket(3);
    await sheet.addFiles([file('a.png'), file('b.png')]);
    byData(host, 'reportsReplyText').value = 'Again';
    byData(host, 'reportsSendReply').click();
    await waitFor(() => calls.reply.length === 2 && sheet.state === 'open');
    assert.deepEqual(calls.reply.map((c) => c.pictures), [[JPEG('a.png'), JPEG('b.png')], null]);
    assert.equal(status(host), P.replyWithout);
    assert.equal(sheet.pictures.length, 2);
  });

  it('a new report: the game\'s own picture is the first thumbnail and one of the four; its x unticks it', async () => {
    const { host, sheet, calls } = mount({ capture: () => ({ url: JPEG('game'), width: 640, height: 360 }) });
    sheet.open('new');
    await waitFor(() => !tray(host, 'new').hidden);
    const t = tray(host, 'new');
    assert.equal(thumbs(t).length, 1);
    assert.ok('lead' in thumbs(t)[0].dataset);
    assert.equal(sheet.room, 3);
    await sheet.addFiles([1, 2, 3, 4].map((n) => file(`p${n}.png`)));
    assert.equal(sheet.pictures.length, 3, 'three beside the game\'s own');
    assert.equal(status(host), P.leftOut(1));
    assert.equal(thumbs(t).length, 4);
    byData(host, 'bugReportText').value = 'Four pictures';
    byData(host, 'bugReportSend').click();
    await waitFor(() => calls.create.length === 1);
    assert.deepEqual(calls.create[0].pictures, [JPEG('game'), JPEG('p1.png'), JPEG('p2.png'), JPEG('p3.png')]);
    await waitFor(() => sheet.view === 'list');
    assert.deepEqual(sheet.pictures, []);
    // Again: the x on the game's own picture unticks Attach a picture, freeing its place.
    sheet.open('new');
    await waitFor(() => !tray(host, 'new').hidden);
    byData(thumbs(tray(host, 'new'))[0], 'reportsThumbRemove').click();
    assert.equal(byData(host, 'reportsPicture').checked, false);
    assert.equal(sheet.room, 4);
    assert.equal(tray(host, 'new').hidden, true);
  });

  it('pictures dropped on the list open Write to us with them', async () => {
    const { host, sheet } = mount();
    sheet.open('list');
    fire(sheet.panel, 'drop', { dataTransfer: transfer([file('a.png')]) });
    assert.equal(sheet.view, 'new');
    await waitFor(() => sheet.pictures.length === 1);
    assert.equal(byData(host, 'bugReportText').ownerDocument.activeElement !== undefined, true);
  });

  it('Take a picture on a new report comes back to the same form, its own picture kept', async () => {
    let handlers = null;
    let draws = 0;
    const doc = fakeDoc();
    const host = new Node('div', doc);
    doc.documentElement.append(host);
    const sheet = mountReportsSheet({
      doc, host, convert: fakeConvert, uiIdle: 5, now: () => 0,
      api: { list: async () => ({ tickets: [] }), unread: async () => ({ unread: 0 }) },
      capture: () => { draws += 1; return { url: JPEG(`game${draws}`), width: 640, height: 360 }; },
      takePicture: (h) => { handlers = h; },
    });
    sheet.open('new');
    await waitFor(() => draws >= 1);
    byData(host, 'bugReportText').value = 'Words';
    const before = draws;
    byData(host, 'reportsNewTake').click();
    assert.equal(sheet.state, 'closed');
    handlers.done({ url: JPEG('taken'), width: 800, height: 600 });
    await wait(30);
    assert.equal(sheet.view, 'new');
    assert.equal(byData(host, 'bugReportText').value, 'Words');
    assert.ok(draws - before <= 1, 'the form\'s picture is not drawn over from the start');
    assert.equal(sheet.pictures.length, 1);
    assert.equal(thumbs(tray(host, 'new')).length, 2);
  });
});

describe('the lightbox gallery (js/ui/picture-lightbox.js)', () => {
  it('goes round, and a single picture shows no Previous or Next', () => {
    assert.equal(galleryStep(0, -1, 4), 3);
    assert.equal(galleryStep(3, 1, 4), 0);
    assert.equal(galleryStep(5, 0, 0), 0);
    const doc = fakeDoc();
    const host = new Node('div', doc);
    doc.documentElement.append(host);
    const one = openLightbox({ doc, host, src: '/a.jpg', win: null });
    assert.equal(byData(one.root, 'pictureLightboxPrev'), null);
    assert.equal(byData(one.root, 'pictureLightboxCount'), null);
    assert.equal(one.count, 1);
    one.close({ focus: false });
    const many = openLightbox({ doc, host, gallery: [{ src: '/a.jpg' }, { src: '/b.jpg', alt: 'B' }], index: 1, win: null });
    assert.equal(byData(many.root, 'pictureLightboxImg').getAttribute('src'), '/b.jpg');
    assert.equal(byData(many.root, 'pictureLightboxTab').getAttribute('href'), '/b.jpg');
    many.go(1);
    assert.equal(byData(many.root, 'pictureLightboxImg').getAttribute('src'), '/a.jpg');
    assert.equal(many.index, 0);
  });

  it('a swipe across the fitted picture goes on; the words have no dashes', () => {
    const doc = fakeDoc();
    const host = new Node('div', doc);
    doc.documentElement.append(host);
    const box = openLightbox({ doc, host, gallery: [{ src: '/a.jpg' }, { src: '/b.jpg' }, { src: '/c.jpg' }], win: null });
    const img = byData(box.root, 'pictureLightboxImg');
    fire(img, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 100 });
    fire(img, 'pointerup', { pointerId: 1, clientX: 100, clientY: 110 });
    assert.equal(box.index, 1, 'a swipe to the left: the next');
    fire(img, 'pointerdown', { pointerId: 2, clientX: 100, clientY: 100 });
    fire(img, 'pointerup', { pointerId: 2, clientX: 110, clientY: 100 });
    assert.equal(box.index, 1, 'a tap is not a swipe');
    for (const v of [LIGHTBOX_TEXT.prev, LIGHTBOX_TEXT.next, LIGHTBOX_TEXT.count(1, 2)]) assert.doesNotMatch(v, /[—–]/);
  });
});

describe('styles and the phone page', () => {
  it('both skins draw the thumbnails, their x, a message\'s pictures and the gallery buttons', () => {
    const modern = read('public/js/features/bug-report-feature.js');
    const classic = read('public/css/classic.css');
    for (const sel of ['.reports-tray .reports-picture-thumb img', '.reports-thumb-remove', '.reports-msg-pictures', '.picture-lightbox-nav', '.picture-lightbox-count']) {
      assert.ok(modern.includes(sel), `Modern ${sel}`);
      assert.ok(classic.includes(sel), `Classic ${sel}`);
    }
    const block = classic.slice(classic.indexOf('/* === reportpics (lane) === */'), classic.indexOf('/* === end reportpics === */'));
    assert.ok(block && classic.indexOf('/* === end reportpics === */') < classic.indexOf('/* == TICKETS =='), 'the lane block sits above TICKETS');
    // Shift+R with four already waiting says so.
    assert.match(modern, /notKept === 'full' \? PICTURE_TEXT\.full/);
  });

  it('the phone page takes several photos, reads each into the report\'s JPEG and opens them over the page', () => {
    const c = read('public/js/phone/companion.js');
    assert.match(c, /type: 'file', id, accept: REPORT_PICTURES\.accept, multiple: true/);
    assert.match(c, /const p = await convertPicture\(file, \{ doc \}\);/);
    assert.match(c, /takeForRoom\(files, roomFor\(photos\.length \+ reading\)\)/);
    assert.match(c, /'data-phone-photo-remove': ''/);
    assert.match(c, /pictureOpener\(a, own, n\);/);
    assert.match(c, /import\('\.\.\/ui\/picture-lightbox\.js/);
    assert.match(c, /await picker\.settled\(\);/);
    assert.match(c, /await photo\.settled\(\);/);
    const css = read('public/play/phone/phone.css');
    for (const sel of ['.pc-photo-thumb', '.pc-photo-remove', '.picture-lightbox-nav', '.picture-lightbox-count', '.pc-thread-pictures']) assert.ok(css.includes(sel), sel);
  });
});

describe('the site keeps several a message (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(sitePath(f), 'utf8');

  it('a new report\'s first picture is its own, the rest its first message\'s; G791\'s rows can be copied in', () => {
    const t = src('src/Tickets.php');
    assert.match(t, /\$pictures = \$this->pictures\(\$store, \$me->id, \$body, \$now, 1\);/, 'the report\'s own picture has the report\'s limits');
    assert.match(t, /\$pictures = \$this->pictures\(\$store, \$me->id, \$body, \$now, 0\);/);
    const store = src('src/TicketStore.php');
    assert.match(store, /\$this->writePictures\(\$id, \$first, \$player, \$more, \$at\);/);
    assert.match(store, /public function adoptOldPictures\(\): int/);
    assert.match(store, /INSERT IGNORE INTO ' \. \$this->db->table\(self::MESSAGE_PICTURES\) \. " \(message_id, position,/);
    assert.match(src('bin/message-pictures.php'), /->adoptOldPictures\(\)/);
    assert.match(src('src/AdminTickets.php'), /"pictures" the message's own pictures in order/);
  });

  it('the rules, run (php): addresses, the lists, the limits, the body', { skip: phpSkip('gd') || noEngine }, () => {
    const out = JSON.parse(execFileSync(PHP, [join(root, 'tests/fixtures/minn-accounts/tickets.php'), engine, SITE_DIR], { encoding: 'utf8' })).replyPictures;
    assert.deepEqual(out.byMessage['9'].map((p) => p.url), ['/report-pictures/3/9/1', '/report-pictures/3/9/2'], 'in order; a position past four is never listed');
    assert.deepEqual(out.out[1].pictures.map((p) => pictureSrc(p)), ['/report-pictures/3/9/1', '/report-pictures/3/9/2'], 'the game shows what the site sends');
    assert.deepEqual(out.out[2].pictures, [], 'an administrator\'s message has none');
    assert.deepEqual(out.adminOut[0].pictures.length, 2, 'the console and /groddle-check get the list');
    assert.deepEqual(out.fit, { room: true, windowFull: false, dayFull: false, dayEdge: true });
    assert.deepEqual(out.body, {
      none: { n: 0 },
      one: { n: 1 },
      list: { n: 2 },
      listWins: { n: 2 },
      four: { n: 4 },
      five: { code: 'groddle_report_picture_count', status: 400 },
      notList: { code: 'groddle_report_picture', status: 400 },
      oneBad: { code: 'groddle_report_picture_type', status: 415 },
    });
  });
});
