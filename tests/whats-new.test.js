/**
 * #745 (Austin 2026-11-27, option 3): after an update the loading card shows what changed, the top
 * three lines from play/whats-new.json, while the game loads. Rolled up across every release since
 * the last visit when that was within a week, else the newest release alone; nothing on a first
 * visit. Ours: Glitch had nothing like it.
 * Run: node --test tests/whats-new.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROLL_UP_MS, SEEN_KEY, SHOW_LINES, WHATS_NEW_PATH, compareVersions, nextSeen, startWhatsNew, validateWhatsNew, whatsNewFor,
} from '../public/js/whats-new.js?v=d6a97a9a';
import { checkFile, draftLines, withRelease } from '../tools/release/whats-new.mjs';

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
      tagName: tag.toUpperCase(), children: [], className: '', textContent: '', classes: new Set(),
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
  return { card, baseURI: 'https://groddle.test/', createElement: make, getElementById: (id) => (id === 'boot-loader' ? loader : null) };
}

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

const fetchOf = (data, seen = []) => async (url) => { seen.push(url); return { ok: true, json: async () => data }; };

describe('#745: What\'s new on the loading card', () => {
  it('a first visit shows nothing, and only remembers the version', async () => {
    const doc = fakeDoc();
    const storage = fakeStorage();
    const urls = [];
    assert.equal(await startWhatsNew(doc, { fetch: fetchOf(FILE, urls), storage, now: () => NOW }), null);
    assert.equal(urls[0], `https://groddle.test/${WHATS_NEW_PATH}`);
    assert.equal(doc.card.children.length, 0);
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
    assert.deepEqual(JSON.parse(storage.map.get(SEEN_KEY)), { version: 'v0.80.0', at: NOW });
    // The next load of the same version shows nothing.
    const again = fakeDoc();
    assert.equal(await startWhatsNew(again, { fetch: fetchOf(FILE), storage, now: () => NOW + 1000 }), null);
    assert.equal(again.card.children.length, 0);
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

  it('nothing for the same or a newer stored version; a stored version is never moved back', () => {
    assert.equal(whatsNewFor(FILE, { version: 'v0.80.0', at: NOW }, NOW), null);
    assert.equal(whatsNewFor(FILE, { version: 'v0.81.0', at: NOW }, NOW), null);
    assert.equal(whatsNewFor(FILE, null, NOW), null);
    assert.equal(nextSeen(FILE, { version: 'v0.81.0', at: 1 }, NOW).version, 'v0.81.0');
    assert.equal(compareVersions('v0.79.10', 'v0.79.9') > 0, true);
    // A stored value that makes no sense is treated as a long absence: the newest release only.
    assert.equal(whatsNewFor(FILE, { version: 'nonsense', at: NOW }, NOW).title, 'New in v0.80');
  });

  it('a failed fetch or blocked storage changes nothing and never throws', async () => {
    const doc = fakeDoc();
    assert.equal(await startWhatsNew(doc, { fetch: async () => { throw new Error('offline'); }, storage: fakeStorage(), now: () => NOW }), null);
    const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    assert.equal(await startWhatsNew(doc, { fetch: fetchOf(FILE), storage: blocked, now: () => NOW }), null);
    assert.equal(doc.card.children.length, 0);
  });

  it('the committed file is valid and not behind the newest tag', () => {
    assert.deepEqual(checkFile(), []);
    const data = JSON.parse(read(`public/${WHATS_NEW_PATH}`));
    for (const r of data.releases) for (const l of r.lines) assert.doesNotMatch(l, /[–—]/);
    assert.ok(data.releases.some((r) => r.version === 'v0.78.0' && r.lines.length), 'seeded with v0.78.0');
  });

  it('the check catches a bad file', () => {
    assert.deepEqual(validateWhatsNew(FILE).filter((p) => !p.startsWith('format')), []);
    const bad = { format: 'groddle-whats-new/1', releases: [
      { version: 'v0.78.0', date: '2026-11-27', lines: ['A long dash — here.', 'x'.repeat(200), 'a', 'b', 'c', 'd'] },
      { version: 'v0.79.0', date: 'today', lines: ['See /home/someone'] },
    ] };
    const problems = validateWhatsNew(bad).join('\n');
    for (const want of ['dash', 'longer than', 'more than 5 lines', 'not newest first', 'date is not', 'a path']) assert.match(problems, new RegExp(want));
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
