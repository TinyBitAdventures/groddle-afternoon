/**
 * #745 follow-up (Austin 2026-11-28: "if the loading screen boots faster than 3 seconds we should fall
 * back to show the What's new link somewhere"). Ours: Glitch had nothing like it.
 *
 * A trace found the loading card's What's new lines readable for only 3 to 4.5 s. On a first look at a
 * new release (this browser had loaded an older one) whose lines were up under 3 s, and the player did
 * not press See all notes, a quiet "What's new in vX.Y" link shows once for that version: on the start
 * card when it is up, else an Activity line with the link and a short notice. The link opens the What's
 * new window at that version (js/whats-new.js offerWhatsNewFallback, js/ui/whats-new-window.js).
 * Run: node --test tests/whats-new-fallback-745.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FALLBACK_KEY, FALLBACK_MIN_MS, SEEN_KEY, WHATS_NEW_ALL_PATH, WHATS_NEW_PATH, WHATS_NEW_TEXT, fallbackVersion, firstLookVersion, noteWhatsNewBootEnd,
  offerWhatsNewFallback, startWhatsNew, whatsNewLinkHtml, whatsNewShownMs,
} from '../public/js/whats-new.js?v=988ec58d';
import { installWhatsNewWindow } from '../public/js/ui/whats-new-window.js?v=84fae9bc';
import { isTopWindow } from '../public/js/window-stack.js?v=0c4a6356';
import { FakeEl, page } from './social-fake-dom.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const NOW = Date.UTC(2026, 10, 28, 12);
const DAY = 24 * 60 * 60 * 1000;

const FILE = {
  format: 'groddle-whats-new/1',
  releases: [
    { version: 'v0.80.0', date: '2026-11-29', lines: ['Eighty one.', 'Eighty two.'] },
    { version: 'v0.79.0', date: '2026-11-28', lines: ['Seventy nine.'] },
  ],
};
const ALL = { format: 'groddle-whats-new/1', releases: [...FILE.releases, { version: 'v0.1.0', date: '2026-10-19', lines: ['The first.'] }] };

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function memory(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

/** The play page as it boots: the loading card up, and the start card under it (or not, on a started game). */
function bootPage({ startCard = true } = {}) {
  const { doc } = page();
  doc.documentElement = new FakeEl('html');
  doc.dispatchEvent = (e) => { for (const fn of doc.listeners[e.type] || []) fn(e); };
  doc.body.classList.add('is-booting');
  const loader = new FakeEl('div');
  loader.id = 'boot-loader';
  const card = new FakeEl('div');
  card.classList.add('boot-loader-card');
  loader.append(card);
  doc.body.append(loader);
  let main = null;
  if (startCard) {
    const overlay = new FakeEl('div');
    overlay.id = 'overlay';
    overlay.classList.add('overlay', 'is-waiting');
    const sc = new FakeEl('div');
    sc.classList.add('card', 'start-card');
    main = new FakeEl('div');
    main.classList.add('start-main');
    const actions = new FakeEl('div');
    actions.classList.add('start-actions');
    const start = new FakeEl('button');
    start.id = 'start-btn';
    actions.append(start);
    const goal = new FakeEl('section');
    goal.classList.add('start-goal');
    main.append(actions, goal);
    sc.append(main);
    overlay.append(sc);
    doc.getElementById('game-root').append(overlay);
  }
  const more = new FakeEl('div');
  more.id = 'more-list';
  doc.body.append(more);
  globalThis.document = doc;
  return { doc, loader, card, main };
}

/** The loading card going, as game.js endBoot does it. */
function endBoot(doc, at) {
  doc.body.classList.remove('is-booting');
  doc.getElementById('boot-loader').hidden = true;
  noteWhatsNewBootEnd(doc, at);
}

const fetchOf = (data) => async (url) => ({ ok: true, json: async () => (url.endsWith(WHATS_NEW_ALL_PATH) ? ALL : data) });

/**
 * One load: the notes arrive at `linesAt` (clock ms), the card goes at `endAt`. `seen` is what the
 * browser stored from its last load. Resolves to { where, doc, storage, logs, notices }.
 */
async function load({ seen = { version: 'v0.79.0', at: NOW - DAY }, linesAt = 1000, endAt = 2500, startCard = true, storage = null, held = false, lateNotes = false } = {}) {
  const page = bootPage({ startCard });
  const { doc } = page;
  const store = storage || memory(seen ? { [SEEN_KEY]: seen } : {});
  let clock = linesAt;
  if (lateNotes) endBoot(doc, endAt); // a fast load: the card went before the notes were in
  await startWhatsNew(doc, { fetch: fetchOf(FILE), storage: store, now: () => NOW, clock: () => clock });
  if (held) page.card.querySelector('button').click(); // See all notes
  clock = endAt;
  if (!lateNotes) endBoot(doc, endAt);
  const logs = [];
  const notices = [];
  const where = await offerWhatsNewFallback(doc, { storage: store, log: (text, html) => logs.push({ text, html }), notice: (t) => notices.push(t), now: () => clock });
  return { ...page, where, storage: store, logs, notices };
}

describe('#745: the What\'s new link after a fast boot (Austin 2026-11-28)', () => {
  it('the reproduction: a fast boot after an update shows the link on the start card, once for that version', async () => {
    const first = await load({ linesAt: 1000, endAt: 2500 });
    assert.equal(whatsNewShownMs(first.doc), 1500, 'the lines were up 1.5 s');
    assert.equal(first.where, 'start');
    const line = first.main.querySelector('.start-news');
    assert.ok(line, 'a line on the start card');
    assert.equal(first.main.children.indexOf(line), 1, 'under the actions');
    const link = line.querySelector('.whats-new-link');
    assert.equal(link.textContent, "What's new in v0.80");
    assert.equal(link.getAttribute('data-whats-new-version'), 'v0.80.0');
    assert.equal(link.getAttribute('type'), 'button');
    assert.deepEqual(first.logs, [], 'no Activity line when the start card has it');
    assert.deepEqual(first.notices, []);
    assert.deepEqual(JSON.parse(first.storage.getItem(FALLBACK_KEY)), { version: 'v0.80.0' });
    assert.equal(first.doc.documentElement.dataset.whatsNewFallback, 'start:v0.80.0');
    // The next load of the same version: no first look, no link.
    const second = await load({ storage: first.storage, linesAt: 1000, endAt: 1500 });
    assert.equal(second.where, '');
    assert.equal(second.main.querySelector('.start-news'), null);
  });

  it('with no start card (a started game) it is one Activity line with the link and a short notice', async () => {
    const r = await load({ startCard: false, linesAt: 800, endAt: 2000 });
    assert.equal(r.where, 'activity');
    assert.deepEqual(r.logs, [{ text: "What's new in v0.80", html: whatsNewLinkHtml('v0.80.0') }]);
    assert.match(r.logs[0].html, /^<button type="button" class="whats-new-link" data-whats-new-version="v0\.80\.0">What&#39;s new in v0\.80<\/button>$/);
    assert.deepEqual(r.notices, ["Updated to v0.80. What's new is in Activity."]);
    // Classic's chat column heads the same log Local Chat.
    assert.equal(WHATS_NEW_TEXT.notice('v0.80.0', true), "Updated to v0.80. What's new is in Local Chat.");
  });

  it('a slow boot (the lines up 3 s or more) shows nothing', async () => {
    const r = await load({ linesAt: 1000, endAt: 1000 + FALLBACK_MIN_MS });
    assert.equal(r.where, '');
    assert.equal(r.main.querySelector('.start-news'), null);
    assert.equal(r.storage.getItem(FALLBACK_KEY), null);
    const longer = await load({ startCard: false, linesAt: 500, endAt: 4800 });
    assert.equal(longer.where, '');
    assert.deepEqual(longer.logs, []);
  });

  it('notes that arrive after the card went were never seen: the link shows', async () => {
    const r = await load({ lateNotes: true, endAt: 900 });
    assert.equal(whatsNewShownMs(r.doc), 0);
    assert.equal(r.where, 'start');
  });

  it('never on a load that is no first look at a new release, never twice for one version, not after See all notes', async () => {
    // A first visit (nothing stored): the card shows the newest, but nothing was updated.
    assert.equal((await load({ seen: null, linesAt: 1000, endAt: 1200 })).where, '');
    // The same version again.
    assert.equal((await load({ seen: { version: 'v0.80.0', at: NOW - 1000 }, linesAt: 1000, endAt: 1200 })).where, '');
    // A second tab of the update after the link showed in the first.
    const store = memory({ [SEEN_KEY]: { version: 'v0.79.0', at: NOW - DAY }, [FALLBACK_KEY]: { version: 'v0.80.0' } });
    assert.equal((await load({ storage: store, linesAt: 1000, endAt: 1200 })).where, '');
    // The player pressed See all notes on the card: the window opens anyway, so no link.
    assert.equal((await load({ held: true, linesAt: 1000, endAt: 1200 })).where, '');
  });

  it('the pure parts', () => {
    assert.equal(firstLookVersion(FILE, { version: 'v0.79.0' }), 'v0.80.0');
    assert.equal(firstLookVersion(FILE, { version: 'v0.80.0' }), '');
    assert.equal(firstLookVersion(FILE, { version: 'v0.81.0' }), '');
    assert.equal(firstLookVersion(FILE, null), '');
    assert.equal(firstLookVersion({}, { version: 'v0.79.0' }), '');
    assert.equal(fallbackVersion({ version: 'v0.80.0', shownMs: 2999 }), 'v0.80.0');
    assert.equal(fallbackVersion({ version: 'v0.80.0', shownMs: 3000 }), '');
    assert.equal(fallbackVersion({ version: 'v0.80.0', shownMs: 0, held: true }), '');
    assert.equal(fallbackVersion({ version: 'v0.80.0', shownMs: 0, done: 'v0.80.0' }), '');
    assert.equal(fallbackVersion({ version: 'v0.80.0', shownMs: 0, done: 'v0.79.0' }), 'v0.80.0');
    assert.equal(fallbackVersion({ version: '', shownMs: 0 }), '');
    assert.equal(FALLBACK_MIN_MS, 3000);
    for (const text of [WHATS_NEW_TEXT.link('v0.80.0'), WHATS_NEW_TEXT.notice('v0.80.0')]) assert.doesNotMatch(text, /[–—]/);
  });

  it('a press on the link opens the What\'s new window at that version, over the start card', async () => {
    const r = await load({ linesAt: 1000, endAt: 2000 });
    const urls = [];
    const fetch = async (url) => {
      urls.push(url);
      const data = url.endsWith(WHATS_NEW_ALL_PATH) ? ALL : url.endsWith(WHATS_NEW_PATH) ? FILE : null;
      return data ? { ok: true, json: async () => data } : { ok: false, status: 404 };
    };
    const win = installWhatsNewWindow({ doc: r.doc, fetch, ready: () => false });
    assert.equal(win.isOpen(), false, 'never by itself');
    r.main.querySelector('.whats-new-link').click();
    await tick(5);
    assert.equal(win.isOpen(), true, 'opens at once, the start card still up');
    const w = r.doc.getElementById('whats-new-window');
    assert.equal(w.getAttribute('data-version'), 'v0.80.0');
    assert.equal(r.doc.getElementById('whats-new-title').textContent, "What's new in v0.80");
    win.close();
    // An Activity line's link for an older version opens at that version.
    const line = new FakeEl('div');
    line.innerHTML = whatsNewLinkHtml('v0.79.0');
    const link = new FakeEl('button');
    link.setAttribute('class', 'whats-new-link');
    link.setAttribute('data-whats-new-version', 'v0.79.0');
    line.append(link);
    r.doc.getElementById('game-root').append(line);
    link.click();
    await tick(5);
    assert.equal(win.isOpen(), true);
    assert.equal(w.getAttribute('data-version'), 'v0.79.0');
    assert.equal(r.doc.getElementById('whats-new-title').textContent, "What's new in v0.79");
    // The window goes over the start card in the window stack.
    const shade = r.doc.getElementById('whats-new-shade');
    assert.equal(isTopWindow(shade), true);
  });

  it('game.js times the card and offers the link as the loading card goes; both skins style it', () => {
    const game = read('public/game.js');
    const endBoot = game.slice(game.indexOf('const endBoot = '), game.indexOf('// BACKDROP (js/start-backdrop.js)'));
    assert.match(endBoot, /classList\.remove\('is-booting'\);[\s\S]*noteWhatsNewBootEnd\(document\);\n\s*offerWhatsNewFallback\(document, \{/);
    assert.match(endBoot, /log: \(text, html\) => notify\.log\(text, \{ html \}\)/);
    assert.match(endBoot, /notice: \(text\) => notify\.notice\(text, \{ log: false \}\)/);
    assert.match(read('public/style.css'), /\.start-card \.start-news \{[^}]*\}\n\.whats-new-link \{/);
    assert.match(read('public/css/classic.css'), /:root\[data-ui="classic"\] \.whats-new-link \{ color: var\(--c-classic-link\)/);
    // Kept: the card's lines and See all notes, and the Menu row.
    assert.match(read('public/js/whats-new.js'), /more\.textContent = WHATS_NEW_TEXT\.more;/);
    assert.match(read('public/js/ui/whats-new-window.js'), /export const WHATS_NEW_MENU = /);
  });
});
