// Links in report threads (Austin 2026-11-25, report #669: the game link in a reply could not be clicked in the
// console). The game's Reports window and the phone page draw a message's addresses as links the way chat lines do
// (js/chat-links.js: http and https only, text nodes only, a link to another site asks first); the console
// (groddle-afternoon-site console/console.js, skipped without the site) has its own small splitter with the same
// rules, since it imports nothing from the game.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mountReportsSheet } from '../public/js/ui/reports-sheet.js?v=408d8843';
import { HAS_SITE, sitePath, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

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

const REPLY = 'Walk around it here:\n\nhttps://groddleafternoon.com/play/?autostart=1&fresh=1&housefile=%2Fwp-content%2Fuploads%2Fh.json\n\nOr see https://example.com/snaps. Not javascript:alert(1) or www-ish words.';

describe('links in the game\'s Reports window (js/ui/reports-sheet.js)', () => {
  it('a reply\'s addresses are links, home ones open, others ask; the words read the same', async () => {
    const doc = fakeDoc();
    const host = new Node('div', doc);
    const ticket = { id: 3, subject: 'My house', status: 'answered', lastAuthor: 'admin', lastMessageAt: '2026-11-25T16:55:00Z', unread: false };
    const messages = [
      { id: 8, author: 'player', body: 'A snap of my house', at: '2026-11-25T10:00:00Z', edited: null, picture: null },
      { id: 9, author: 'admin', body: REPLY, at: '2026-11-25T16:55:00Z', edited: null, picture: null },
    ];
    const api = { list: async () => ({ tickets: [ticket] }), unread: async () => ({ unread: 0 }), thread: async () => ({ ticket, messages, picture: null, editable: false }) };
    const sheet = mountReportsSheet({ doc, host, api, capture: () => null, now: () => Date.parse('2026-11-25T17:00:00Z') });
    await sheet.openTicket(3);
    const bodies = host.all().filter((n) => n.className === 'reports-msg-body');
    assert.equal(bodies.length, 2);
    assert.equal(bodies[1].textContent, REPLY, 'every word kept, in order');
    const links = bodies[1].all().filter((n) => n.tagName === 'A');
    assert.deepEqual(links.map((a) => [a.dataset.chatLink, a.attrs.href]), [
      ['home', 'https://groddleafternoon.com/play/?autostart=1&fresh=1&housefile=%2Fwp-content%2Fuploads%2Fh.json'],
      ['away', 'https://example.com/snaps'],
    ]);
    assert.ok(links.every((a) => a.attrs.target === '_blank' && /noopener/.test(a.attrs.rel)));
    assert.equal(bodies[0].all().filter((n) => n.tagName === 'A').length, 0, 'no address, no link');
    const list = host.all().find((n) => 'reportsMessages' in n.dataset);
    assert.ok(list.listeners.click?.length, 'the list answers clicks on its links (the ask for another site)');
  });

  it('the phone page draws its threads the same way, loading the links only when a thread has an address', () => {
    const src = read('public/js/phone/companion.js');
    // Lazy, as the lightbox: the page's first load stays under its budget (tests/phone-companion.test.js).
    assert.doesNotMatch(src, /^import [^\n]*chat-links\.js/m);
    assert.match(src, /const loadChatLinks = \(\) => \(chatLinksModule \|\|= import\('\.\.\/chat-links\.js(\?v=[0-9a-f]{8})?'\)/);
    assert.match(src, /if \(\/https\?:\\\/\\\/\/i\.test\(String\(m\.body \|\| ''\)\)\) linkBodies\.push\(\[body, m\.body\]\);/);
    assert.match(src, /linkMessages\(msgs, linkBodies\);\n  panel\.append\(msgs\);/);
    assert.match(src, /appendLinkedText\(body, text, \{ doc \}\);/);
    assert.match(src, /bindChatLinks\(list, \{ doc \}\)/);
    const css = read('public/play/phone/phone.css');
    for (const sel of ['.pc-message-body .chat-link', '.chat-link-confirm', '.chat-link-confirm-row', '.chat-link-confirm-open']) assert.ok(css.includes(sel), sel);
  });
});

describe('links in the console\'s report threads (console/console.js)', { skip: skipWithoutSite }, async () => {
  const mod = HAS_SITE ? await import(pathToFileURL(sitePath('console/console.js')).href) : {};

  it('splits a message into words and http(s) links, trailing punctuation left out', () => {
    const segs = mod.messageLinks(REPLY);
    assert.equal(segs.map((s) => s.text).join(''), REPLY);
    assert.deepEqual(segs.filter((s) => s.href).map((s) => [s.href, s.host]), [
      ['https://groddleafternoon.com/play/?autostart=1&fresh=1&housefile=%2Fwp-content%2Fuploads%2Fh.json', 'groddleafternoon.com'],
      ['https://example.com/snaps', 'example.com'],
    ]);
    assert.deepEqual(mod.messageLinks('(see https://a.example/x).'), [{ text: '(see ' }, { text: 'https://a.example/x', href: 'https://a.example/x', host: 'a.example' }, { text: ').' }]);
  });

  it('never links another scheme, a glued scheme, a user name or an over-long address', () => {
    for (const t of ['javascript:alert(1)', 'xhttps://a.example', 'javascript:https://a.example', 'https://groddleafternoon.com@evil.example/', 'data:text/html,hi', `https://a.example/${'x'.repeat(400)}`, 'https://', 'plain words']) {
      assert.ok(mod.messageLinks(t).every((s) => !s.href), t);
      assert.equal(mod.messageLinks(t).map((s) => s.text).join(''), t);
    }
    assert.deepEqual(mod.messageLinks(''), []);
  });

  it('draws the thread and each earlier version through it, links in the accent with a new tab', () => {
    const js = readFileSync(sitePath('console/console.js'), 'utf8');
    assert.match(js, /linkedBody\(m\.body\),/);
    assert.match(js, /linkedBody\(r\.body\)/);
    assert.doesNotMatch(js, /class: 'console-msg-body', text: m\.body/);
    assert.match(js, /rel: 'noopener noreferrer nofollow ugc'/);
    assert.match(readFileSync(sitePath('console/console.css'), 'utf8'), /\.console-msg-link \{ color: var\(--accent\)/);
  });
});
