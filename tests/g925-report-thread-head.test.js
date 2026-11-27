// G925 (#454): the Reports window's "Write to us" is the list's button. On a report's thread it stayed in
// the header and squeezed the report's title on a phone; it now shows on the list only (Back returns there).
// Run: node --test tests/g925-report-thread-head.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mountReportsSheet } from '../public/js/ui/reports-sheet.js?v=917a2f8c';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

class Node {
  constructor(tag, doc) { Object.assign(this, { tagName: String(tag).toUpperCase(), ownerDocument: doc, children: [], attrs: {}, listeners: {}, dataset: {}, hidden: false, disabled: false, value: '', className: '', _text: '' }); const self = this; this.classList = { toggle() {}, contains: (c) => self.className.split(' ').includes(c) }; }
  setAttribute(k, v) { if (k === 'hidden') { this.hidden = true; return; } if (k === 'class') { this.className = String(v); return; } if (k === 'id') this.id = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v); this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  append(...ns) { for (const n of ns) { if (typeof n !== 'string') { n.parentNode = this; this.children.push(n); } } }
  replaceChildren(...ns) { this.children = []; this.append(...ns); }
  get lastElementChild() { return this.children.at(-1) || null; }
  set textContent(t) { this.children = []; this._text = String(t); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  dispatch(k, ev = {}) { for (const fn of this.listeners[k] || []) fn({ target: this, preventDefault() {}, stopPropagation() {}, ...ev }); }
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
const byData = (r, k) => r.all().find((n) => k in n.dataset);

describe('Write to us on a report thread (G925, #454)', () => {
  it('shows on the list, hides on a thread and on the new report, and comes back with Back', async () => {
    const doc = fakeDoc();
    const host = new Node('div', doc);
    const ticket = { id: 7, subject: 'A long subject that needs the header', status: 'open', lastAuthor: 'player', lastMessageAt: '2026-11-17T02:00:00Z', unread: false, adminReplied: false };
    const api = {
      list: async () => ({ tickets: [ticket] }),
      unread: async () => ({ unread: 0 }),
      thread: async () => ({ ticket, messages: [{ id: 1, author: 'player', body: 'Hello', at: '2026-11-17T02:00:00Z', edited: null }], picture: null, editable: false }),
      reply: async () => ({}), close: async () => ({}), create: async () => ({}),
    };
    const sheet = mountReportsSheet({ doc, host, api, capture: () => null });
    const writeToUs = byData(host, 'reportsNew');
    sheet.open('list');
    await wait(20);
    assert.equal(writeToUs.hidden, false, 'the list has it');
    byData(host, 'reportsList').children[0].children[0].click();
    await wait(20);
    assert.equal(byData(host, 'reportsThreadView').hidden, false, 'the thread is open');
    assert.equal(writeToUs.hidden, true, 'the thread does not');
    byData(host, 'reportsBack').click();
    await wait(20);
    assert.equal(writeToUs.hidden, false, 'back on the list');
    writeToUs.click();
    await wait(20);
    assert.equal(writeToUs.hidden, true, 'the new report does not');
  });
});
