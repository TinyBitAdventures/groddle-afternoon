/**
 * #745 (Austin 2026-11-27, option 3): the loading card shows what changed, the top three lines from
 * play/whats-new.json, while the game loads. After an update rolled up across every release since
 * the last visit when that was within a week, else the newest release alone; on every other load
 * (a first visit, the same version again) the newest release (Austin 2026-11-27: always show the
 * latest). Ours: Glitch had nothing like it.
 * Then (Austin 2026-11-27, "the popup style ... I just don't want to automatically open that for
 * folks"): the What's new window (js/ui/whats-new-window.js), opened only from the Menu or the loading
 * card's "See all notes", with an All versions list of every release (play/whats-new-all.json,
 * backfilled from v0.1.0 by tools/release/whats-new.mjs --backfill).
 * Run: node --test tests/whats-new.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  KEEP_RELEASES, MAX_LINE, MAX_LINES, ROLL_UP_MS, SEEN_KEY, SHOW_LINES, WHATS_NEW_ALL_PATH, WHATS_NEW_PATH, compareVersions, nextSeen, startWhatsNew, validateWhatsNew, whatsNewFor,
} from '../public/js/whats-new.js?v=c410d2ba';
import {
  ALL_FILE, FILE as RECENT_FILE, checkFile, draftFromBody, draftLines, highlightOf, publishedDay, recentOf, tagsAt, withBackfill, withRelease,
} from '../tools/release/whats-new.mjs';
import { WHATS_NEW_MENU, installWhatsNewWindow, releaseDate, versionRows } from '../public/js/ui/whats-new-window.js?v=9d37f2dc';
import { menuRowFor } from '../public/js/ui/topbar.js?v=820dd86c';
import { FakeEl, page } from './social-fake-dom.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 27, 12);

const FILE = {
  format: 'groddle-whats-new/1',
  releases: [
    { version: 'v0.80.0', date: '2026-11-29', lines: ['Eighty one.', 'Eighty two.'] },
    { version: 'v0.79.1', date: '2026-11-28', lines: ['Seventy nine one.'] },
    { version: 'v0.79.0', date: '2026-11-28', lines: ['Seventy nine.', 'Not shown.'] },
    { version: 'v0.78.0', date: '2026-11-27', lines: ['Seventy eight.'] },
  ],
};

/** A small DOM: the loading card and what is appended to it. */
function fakeDoc() {
  const make = (tag) => {
    const el = {
      tagName: tag.toUpperCase(), children: [], className: '', textContent: '', classes: new Set(), listeners: {}, attrs: {},
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      click() { for (const fn of this.listeners.click || []) fn({ target: this }); },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      append(...kids) { this.children.push(...kids); },
      remove() { const p = el.parent; if (p) p.children = p.children.filter((c) => c !== el); },
      querySelector(sel) { return this.children.find((c) => sel === `.${c.className}`) || null; },
    };
    el.classList = { add: (c) => el.classes.add(c), contains: (c) => el.classes.has(c) };
    const append = el.append;
    el.append = (...kids) => { for (const k of kids) k.parent = el; append.apply(el, kids); };
    return el;
  };
  const card = make('div');
  card.className = 'boot-loader-card';
  const loader = make('div');
  loader.querySelector = (sel) => (sel === '.boot-loader-card' ? card : null);
  const documentElement = { dataset: {} };
  return { card, documentElement, baseURI: 'https://groddle.test/', createElement: make, getElementById: (id) => (id === 'boot-loader' ? loader : null) };
}

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

const fetchOf = (data, seen = []) => async (url) => { seen.push(url); return { ok: true, json: async () => data }; };

describe('#745: What\'s new on the loading card', () => {
  it('a first visit shows the newest release, and remembers the version (Austin 2026-11-27: always show the latest)', async () => {
    const doc = fakeDoc();
    const storage = fakeStorage();
    const urls = [];
    const shown = await startWhatsNew(doc, { fetch: fetchOf(FILE, urls), storage, now: () => NOW });
    assert.deepEqual(shown, { title: 'New in v0.80', lines: ['Eighty one.', 'Eighty two.'], version: 'v0.80.0' });
    assert.equal(urls[0], `https://groddle.test/${WHATS_NEW_PATH}`);
    assert.equal(doc.card.children.length, 1);
    assert.equal(doc.card.children[0].children[2].textContent, 'See all notes');
    assert.deepEqual(JSON.parse(storage.map.get(SEEN_KEY)), { version: 'v0.80.0', at: NOW });
  });

  it('the reproduction: a browser that saw an older version gets the lines on the card', async () => {
    const doc = fakeDoc();
    const storage = fakeStorage({ [SEEN_KEY]: JSON.stringify({ version: 'v0.79.1', at: NOW - DAY }) });
    const shown = await startWhatsNew(doc, { fetch: fetchOf(FILE), storage, now: () => NOW });
    assert.deepEqual(shown, { title: 'New in v0.80', lines: ['Eighty one.', 'Eighty two.'], version: 'v0.80.0' });
    assert.ok(doc.card.classList.contains('has-news'));
    const [section] = doc.card.children;
    assert.equal(section.className, 'boot-loader-news');
    assert.equal(section.children[0].textContent, 'New in v0.80');
    assert.deepEqual(section.children[1].children.map((li) => li.textContent), ['Eighty one.', 'Eighty two.']);
    // "See all notes" asks for the What's new window once the game is ready; it never leaves the page.
    const more = section.children[2];
    assert.equal(more.tagName, 'BUTTON');
    assert.equal(more.className, 'boot-loader-news-more');
    assert.equal(more.textContent, 'See all notes');
    assert.equal(doc.documentElement.dataset.whatsNew, undefined);
    more.click();
    assert.equal(doc.documentElement.dataset.whatsNew, 'queued');
    assert.equal(more.disabled, true);
    assert.equal(more.textContent, 'The notes open once the game is ready.');
    assert.deepEqual(JSON.parse(storage.map.get(SEEN_KEY)), { version: 'v0.80.0', at: NOW });
    // The next load of the same version shows the newest release again.
    const again = fakeDoc();
    assert.deepEqual(await startWhatsNew(again, { fetch: fetchOf(FILE), storage, now: () => NOW + 1000 }), shown);
    assert.equal(again.card.children.length, 1);
  });

  it('within a week it rolls up every release since, the top three, newest first', () => {
    const shown = whatsNewFor(FILE, { version: 'v0.78.0', at: NOW - 6 * DAY }, NOW);
    assert.equal(SHOW_LINES, 3);
    assert.deepEqual(shown.lines, ['Eighty one.', 'Eighty two.', 'Seventy nine one.']);
    assert.equal(shown.title, 'New since v0.78');
  });

  it('after more than a week, only the newest release', () => {
    const shown = whatsNewFor(FILE, { version: 'v0.78.0', at: NOW - ROLL_UP_MS - 1 }, NOW);
    assert.deepEqual(shown, { title: 'New in v0.80', lines: ['Eighty one.', 'Eighty two.'], version: 'v0.80.0' });
  });

  it('the same or a newer stored version, or none, shows the newest release; a stored version is never moved back', () => {
    const latest = { title: 'New in v0.80', lines: ['Eighty one.', 'Eighty two.'], version: 'v0.80.0' };
    assert.deepEqual(whatsNewFor(FILE, { version: 'v0.80.0', at: NOW }, NOW), latest);
    assert.deepEqual(whatsNewFor(FILE, { version: 'v0.80.0', at: NOW - 6 * DAY }, NOW), latest, 'no roll-up without an update');
    assert.deepEqual(whatsNewFor(FILE, { version: 'v0.81.0', at: NOW }, NOW), latest);
    assert.deepEqual(whatsNewFor(FILE, null, NOW), latest);
    assert.equal(whatsNewFor({ format: 'groddle-whats-new/1', releases: [] }, null, NOW), null, 'nothing to show');
    assert.equal(nextSeen(FILE, { version: 'v0.81.0', at: 1 }, NOW).version, 'v0.81.0');
    assert.equal(compareVersions('v0.79.10', 'v0.79.9') > 0, true);
    // A stored value that makes no sense is treated as a long absence: the newest release only.
    assert.equal(whatsNewFor(FILE, { version: 'nonsense', at: NOW }, NOW).title, 'New in v0.80');
  });

  it('a failed fetch changes nothing; blocked storage is a first visit; neither throws', async () => {
    const doc = fakeDoc();
    assert.equal(await startWhatsNew(doc, { fetch: async () => { throw new Error('offline'); }, storage: fakeStorage(), now: () => NOW }), null);
    assert.equal(doc.card.children.length, 0);
    const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    assert.equal((await startWhatsNew(doc, { fetch: fetchOf(FILE), storage: blocked, now: () => NOW }))?.title, 'New in v0.80');
    assert.equal(doc.card.children.length, 1);
  });

  it('the committed files are valid, agree, and not behind the newest tag (--check)', () => {
    assert.deepEqual(checkFile(), []);
    const data = JSON.parse(read(`public/${WHATS_NEW_PATH}`));
    for (const r of data.releases) for (const l of r.lines) assert.doesNotMatch(l, /[–—]/);
    assert.ok(data.releases.some((r) => r.version === 'v0.78.0' && r.lines.length), 'seeded with v0.78.0');
    assert.deepEqual(data, recentOf(JSON.parse(read(`public/${WHATS_NEW_ALL_PATH}`))), 'the short file is the newest releases of the whole history');
    assert.equal(data.releases.length, KEEP_RELEASES);
  });

  it('the backfill covers every release from v0.1.0, each with one to five short plain lines', () => {
    const all = JSON.parse(read(`public/${WHATS_NEW_ALL_PATH}`));
    assert.deepEqual(validateWhatsNew(all, { all: true }), []);
    const versions = all.releases.map((r) => r.version);
    assert.equal(versions.at(-1), 'v0.1.0');
    for (const v of ['v0.1.0', 'v0.2.1', 'v0.19.2', 'v0.40.0', 'v0.64.0', 'v0.77.0', 'v0.78.0']) assert.ok(versions.includes(v), v);
    // Every vX.Y.Z tag this checkout holds has its entry (a clone without tags checks nothing here).
    const missing = tagsAt().filter((t) => !versions.includes(t));
    assert.deepEqual(missing, []);
    assert.ok(versions.length >= 120, `${versions.length} releases`);
    for (const r of all.releases) {
      assert.ok(r.lines.length >= 1 && r.lines.length <= MAX_LINES, r.version);
      // A minor release gets at least three highlights; a patch may have one or two changes.
      if (/\.0$/.test(r.version) && r.version !== 'v0.64.0') assert.ok(r.lines.length >= 2, `${r.version}: ${r.lines.length} lines`);
      for (const l of r.lines) {
        assert.ok(l.length <= MAX_LINE, `${r.version}: ${l}`);
        assert.doesNotMatch(l, /[–—]|#\d|https?:|\/play\/|\bClaude\b|\bAI\b/, `${r.version}: ${l}`);
        assert.match(l, /[.!?)]$/, `${r.version}: ends a sentence: ${l}`);
      }
    }
    // The loading card reads the short file on every load; the whole history waits for the window.
    assert.ok(read(`public/${WHATS_NEW_PATH}`).length < 16000);
  });

  it('the backfill drafts highlights from the published release notes', () => {
    const body = [
      'Pairs with server v0.30.4 and site v0.33.2.',
      '',
      '## Maps',
      '- Ten more region maps are Tiny Speck\'s 2012 paintings again (#512), restored from the 2012 Encyclopedia and matched to its colour: Fenneq, Folivoria, Groddle Heights, Haoma and more.',
      '- A save that does not go in now says so — and keeps trying.',
      '  - an indented aside',
      '**For developers**',
      '- A new builder for the admin pop-up.',
    ].join('\n');
    const lines = draftFromBody(body);
    assert.equal(lines.length, 2);
    assert.ok(lines[0].length <= MAX_LINE);
    assert.doesNotMatch(lines[0], /#512/);
    assert.equal(lines[1], 'A save that does not go in now says so, and keeps trying.');
    assert.equal(highlightOf('Short'), 'Short.');
    assert.equal(publishedDay('2026-11-14T23:37:27Z'), '2026-11-14');
    assert.equal(publishedDay('2026-11-15T02:00:00Z'), '2026-11-14', 'the studio\'s day, not UTC\'s');
    const notes = { 'v0.2.0': { body: '- Two.', publishedAt: '2026-10-28T14:25:02Z' }, 'v0.1.0': { body: '- One.', publishedAt: '2026-10-27T15:56:28Z' } };
    const start = { releases: [{ version: 'v0.2.0', date: '2026-10-28', lines: ['Kept by hand.'] }] };
    const { data, added } = withBackfill(start, ['v0.2.0', 'v0.1.0'], (t) => notes[t]);
    assert.deepEqual(added, ['v0.1.0']);
    assert.deepEqual(data.releases, [{ version: 'v0.2.0', date: '2026-10-28', lines: ['Kept by hand.'] }, { version: 'v0.1.0', date: '2026-10-27', lines: ['One.'] }]);
  });

  it('the check catches a bad file', () => {
    assert.deepEqual(validateWhatsNew(FILE).filter((p) => !p.startsWith('format')), []);
    const bad = { format: 'groddle-whats-new/1', releases: [
      { version: 'v0.78.0', date: '2026-11-27', lines: ['A long dash — here.', 'x'.repeat(200), 'a', 'b', 'c', 'd'] },
      { version: 'v0.79.0', date: 'today', lines: ['See /home/someone'] },
    ] };
    const problems = validateWhatsNew(bad).join('\n');
    for (const want of ['dash', 'longer than', 'more than 5 lines', 'not newest first', 'date is not', 'a path']) assert.match(problems, new RegExp(want));
    assert.match(validateWhatsNew({ format: 'groddle-whats-new/1', releases: [{ version: 'v0.1.0', date: '2026-10-27', lines: ['Fixed (#123).'] }] }).join('\n'), /ticket number/);
    const many = { format: 'groddle-whats-new/1', releases: Array.from({ length: 30 }, (_, i) => ({ version: `v0.${30 - i}.0`, date: '2026-11-01', lines: ['x.'] })) };
    assert.match(validateWhatsNew(many).join('\n'), /more than 20 releases/);
    assert.deepEqual(validateWhatsNew(many, { all: true }), []);
  });

  it('the release tool drafts from the same Emoji-Log subjects as the release notes, NEW first', () => {
    const lines = draftLines([
      { hash: 'a', subject: '🐛 FIX: A fix' },
      { hash: 'b', subject: '🤖 TEST: Not for players' },
      { hash: 'c', subject: '📦 NEW: A thing — with a dash' },
      { hash: 'd', subject: '👌 IMPROVE: Better' },
    ]);
    assert.deepEqual(lines, ['A thing, with a dash', 'Better', 'A fix']);
    const next = withRelease({ releases: [{ version: 'v0.78.0', date: '2026-11-27', lines: ['x'] }] }, { version: 'v0.79.0', date: '2026-11-28', lines: ['1', '2', '3', '4', '5', '6'] });
    assert.equal(RECENT_FILE.endsWith(WHATS_NEW_PATH), true);
    assert.equal(ALL_FILE.endsWith(WHATS_NEW_ALL_PATH), true);
    assert.deepEqual(next.releases.map((r) => r.version), ['v0.79.0', 'v0.78.0']);
    assert.equal(next.releases[0].lines.length, 5);
    assert.throws(() => withRelease(next, { version: 'v0.79.0', date: '2026-11-28', lines: [] }), /already/);
  });

  it('both play pages start it with the loading card, and the card has room for it', () => {
    const boot = read('public/js/boot-progress.js');
    assert.match(boot, /import \{ startWhatsNew \} from '\.\/whats-new\.js/);
    assert.match(boot, /startWhatsNew\(document\)/);
    for (const page of ['public/play/index.html', 'public/play/online/index.html']) assert.match(read(page), /src="js\/boot-progress\.js/);
    const css = read('public/style.css');
    assert.match(css, /\.boot-loader-card\.has-news \{ flex-wrap: wrap; width: min\(440px, 100%\);/);
    assert.match(css, /\.boot-loader-news \{ flex: 1 0 100%;/);
    assert.match(css, /\.boot-loader\.is-error \.boot-loader-news \{ display: none; \}/);
  });
});

/** The play page's Menu and a fetch that serves the two files. */
function gamePage() {
  const { doc } = page();
  doc.documentElement = new FakeEl('html');
  doc.dispatched = [];
  doc.dispatchEvent = (e) => { doc.dispatched.push(e.type); for (const fn of doc.listeners[e.type] || []) fn(e); };
  const list = new FakeEl('div');
  list.id = 'more-list';
  const ency = new FakeEl('button');
  ency.id = 'encyclopedia-btn';
  list.append(ency);
  doc.body.append(list);
  globalThis.document = doc;
  const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    const data = url.endsWith(WHATS_NEW_ALL_PATH) ? ALL : url.endsWith(WHATS_NEW_PATH) ? FILE : null;
    return data ? { ok: true, json: async () => data } : { ok: false, status: 404 };
  };
  return { doc, list, urls, fetch };
}

const ALL = { ...FILE, releases: [...FILE.releases, { version: 'v0.2.0', date: '2026-10-28', lines: ['Two.'] }, { version: 'v0.1.0', date: '2026-10-27', lines: ['One.', 'Uno.'] }] };
const shadeOf = (doc) => doc.getElementById('whats-new-shade');
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('#745: the What\'s new window, opened only when asked', () => {
  it('the Menu has a What\'s new row beside the Encyclopedia, and nothing opens on load', async () => {
    const { doc, list, urls, fetch } = gamePage();
    const win = installWhatsNewWindow({ doc, fetch, ready: () => true });
    const row = doc.getElementById(WHATS_NEW_MENU.id);
    assert.equal(row.parentElement, list);
    assert.equal(row.textContent, "What's new");
    assert.deepEqual(menuRowFor('whats-new-btn'), { group: 'world', rank: 4.5 });
    assert.ok(menuRowFor('whats-new-btn').rank > menuRowFor('encyclopedia-btn').rank && menuRowFor('whats-new-btn').rank < menuRowFor('support-btn').rank);
    // Installed, with no request: no window, no fetch.
    await tick(5);
    assert.equal(win.isOpen(), false);
    assert.equal(shadeOf(doc), null);
    assert.deepEqual(urls, []);
    // The reproduction of the ask: the Menu row opens it, on the newest release.
    row.click();
    await tick();
    assert.equal(win.isOpen(), true);
    assert.equal(doc.documentElement.dataset.whatsNew, 'open');
    const w = doc.getElementById('whats-new-window');
    assert.equal(w.getAttribute('role'), 'dialog');
    assert.equal(w.getAttribute('aria-modal'), 'true');
    assert.equal(doc.getElementById('whats-new-title').textContent, "What's new in v0.80");
    assert.equal(w.querySelector('.wn-eyebrow').textContent, 'Updated · v0.80.0');
    assert.equal(w.querySelector('.wn-sub').textContent, 'Released Nov 29, 2026.');
    assert.deepEqual(w.querySelector('.wn-list').children.map((li) => li.children[1].textContent), ['Eighty one.', 'Eighty two.']);
    assert.deepEqual(urls, [`https://groddle.localhost/${WHATS_NEW_PATH}`]);
    // Esc closes it, and keys never reach the game under it.
    const esc = shadeOf(doc).querySelector('.wn-window').dispatch('keydown', { key: 'Escape' });
    assert.equal(esc.stopped, true);
    assert.equal(win.isOpen(), false);
    assert.equal(doc.documentElement.dataset.whatsNew, undefined);
    // The close button and Got it close it too.
    await win.open();
    doc.getElementById('whats-new-window').querySelector('.wn-close').click();
    assert.equal(win.isOpen(), false);
    await win.open();
    doc.getElementById('whats-new-window').querySelector('[data-whats-new-done]').click();
    assert.equal(win.isOpen(), false);
  });

  it('All versions lists every release, newest first with its date, each opening to its highlights', async () => {
    const { doc, urls, fetch } = gamePage();
    const win = installWhatsNewWindow({ doc, fetch, ready: () => true });
    await win.open();
    doc.getElementById('whats-new-window').querySelector('[data-whats-new-all]').click();
    await tick();
    assert.equal(win.view(), 'all');
    assert.ok(urls.includes(`https://groddle.localhost/${WHATS_NEW_ALL_PATH}`), 'the whole history is fetched only now');
    const w = doc.getElementById('whats-new-window');
    assert.equal(doc.getElementById('whats-new-title').textContent, 'All versions');
    assert.equal(w.querySelector('.wn-eyebrow').textContent, '6 versions');
    const rows = w.querySelectorAll('.wn-ver');
    assert.deepEqual(rows.map((r) => r.dataset.version), ['v0.80.0', 'v0.79.1', 'v0.79.0', 'v0.78.0', 'v0.2.0', 'v0.1.0']);
    assert.deepEqual(rows.map((r) => r.querySelector('.wn-ver-head').textContent), ['v0.80Nov 29, 2026', 'v0.79.1Nov 28, 2026', 'v0.79Nov 28, 2026', 'v0.78Nov 27, 2026', 'v0.2Oct 28, 2026', 'v0.1Oct 27, 2026']);
    // The newest is open; the rest open on a click, and close again.
    const head = (i) => rows[i].querySelector('.wn-ver-head');
    const lines = (i) => rows[i].querySelector('.wn-ver-lines');
    assert.equal(head(0).getAttribute('aria-expanded'), 'true');
    assert.equal(lines(0).hidden, false);
    assert.equal(lines(5).hidden, true);
    head(5).click();
    assert.equal(head(5).getAttribute('aria-expanded'), 'true');
    assert.equal(lines(5).hidden, false);
    assert.deepEqual(lines(5).children.map((li) => li.textContent), ['One.', 'Uno.']);
    head(5).click();
    assert.equal(lines(5).hidden, true);
    // Back returns to the newest release; nothing here is a link away from the game.
    w.querySelector('[data-whats-new-back]').click();
    await tick();
    assert.equal(win.view(), 'latest');
    assert.equal(doc.getElementById('whats-new-title').textContent, "What's new in v0.80");
    assert.equal(w.querySelectorAll('a').length, 0);
    assert.deepEqual(versionRows(ALL).map((r) => r.short), ['v0.80', 'v0.79.1', 'v0.79', 'v0.78', 'v0.2', 'v0.1']);
    assert.equal(releaseDate('2026-01-05'), 'Jan 5, 2026');
    assert.equal(releaseDate('soon'), '');
  });

  it('without the whole history it lists the newest releases and says so', async () => {
    const { doc, fetch } = gamePage();
    const win = installWhatsNewWindow({ doc, fetch: (url) => (url.endsWith(WHATS_NEW_ALL_PATH) ? Promise.resolve({ ok: false, status: 500 }) : fetch(url)), ready: () => true });
    await win.open();
    assert.equal(await win.showAll(), 4);
    const w = doc.getElementById('whats-new-window');
    assert.equal(w.querySelector('.wn-note').textContent, 'Only the newest versions could load.');
    assert.equal(w.querySelectorAll('.wn-ver').length, 4);
  });

  it('the loading card\'s See all notes waits until the game is ready, then opens it once', async () => {
    const { doc, fetch } = gamePage();
    let ready = false;
    doc.documentElement.dataset.whatsNew = 'queued'; // clicked on the card before the game's code was in
    const win = installWhatsNewWindow({ doc, fetch, ready: () => ready, poll: 5 });
    await tick(20);
    assert.equal(win.isOpen(), false, 'not while the game loads');
    assert.equal(doc.documentElement.dataset.whatsNew, 'queued');
    ready = true;
    await tick(20);
    assert.equal(win.isOpen(), true);
    win.close();
    await tick(20);
    assert.equal(win.isOpen(), false, 'once');
  });

  it('a click after the window is installed opens it at once when the game is ready', async () => {
    const { doc, fetch } = gamePage();
    const win = installWhatsNewWindow({ doc, fetch, ready: () => true });
    const { requestWhatsNew } = await import('../public/js/whats-new.js?v=c410d2ba');
    requestWhatsNew(doc);
    await tick();
    assert.equal(win.isOpen(), true);
  });

  it('it opens only from the Menu or the card: the loading code never opens it, and game.js only installs it', () => {
    const boot = read('public/js/boot-progress.js') + read('public/js/whats-new.js');
    assert.doesNotMatch(boot, /import[^;]*whats-new-window|\.open\(/);
    const game = read('public/game.js');
    assert.match(game, /import \{ installWhatsNewWindow \} from '\.\/js\/ui\/whats-new-window\.js/);
    assert.equal((game.match(/installWhatsNewWindow\(/g) || []).length, 1);
    assert.match(game, /\n  installWhatsNewWindow\(\);/);
    assert.doesNotMatch(game, /WhatsNew[\w]*\.open\(|whatsNewWindow\.open/);
    const css = read('public/style.css');
    assert.match(css, /\.prefs-shade, \.wn-shade\)/, 'the phone safe areas (PHONEPANELS)');
    assert.match(css, /\.prefs-window, \.wn-window\) \{\n  max-height: calc\(100dvh/);
    assert.match(read('public/css/classic.css'), /:root\[data-ui="classic"\] \.wn-window \{/);
  });
});
