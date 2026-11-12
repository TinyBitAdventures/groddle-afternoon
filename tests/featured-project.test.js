/**
 * The featured street project (G656, Austin 2026-11-11): js/featured-project.js (the message and
 * the words), js/ui/featured-project.js (the pill and the Feat panel's row), the Projects panel's
 * Featured section (js/ui/projects-sheet.js), the giver's bubble star (js/job-indicator.js), the
 * Global notices kept as notes (features/groups-feature.js) and the wiring in
 * features/street-jobs-feature.js. The server's rule is groddle-afternoon-server projects_featured.go
 * (its own tests).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURED_TEXT, featuredChanged, featuredFromServer, featuredLabel, featuredPillText, featuredStatus, featuredWhere } from '../public/js/featured-project.js?v=3cc0565c';
import { FEATURED_PILL_ID, FEATURED_ROW_ID, renderFeaturedPill, renderFeaturedRow } from '../public/js/ui/featured-project.js?v=d4b01f4f';
import { buildProjectsPanel, renderProjects } from '../public/js/ui/projects-sheet.js?v=e1d49852';
import { jobIndicatorView } from '../public/js/job-indicator.js?v=05498227';
import { normalizeStreetJobState } from '../public/js/street-jobs.js?v=94f8d250';
import { rowFromServer } from '../public/js/street-jobs-mp.js?v=25efcadf';
import { PROJECTS_TEXT, projectEntry } from '../public/js/projects-tracker.js?v=edd58b99';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const catalog = JSON.parse(read('public/assets/content/street-jobs.json'));
const NOW = Date.UTC(2026, 10, 11, 12);
const TUMBLE = '377'; // Build Tumble Rd 1 (Choru): four phases

const MSG = {
  t: 'project_featured', now: NOW + 1000, job: TUMBLE, kind: 'street', street: 'GA5101HF7F429V3', board: 'GA5S8KFNVF42GS5',
  label: 'Tumble Rd 1', hub: 'Choru', boardLabel: 'Gelatto Lane', phase: 1, phases: 4, perc: 0.5, percent: 37, since: NOW - 5000, by: 'auto',
  row: { phase: 1, got: { r1: 2 }, held: {}, mine: {}, started: NOW - 9000, ready: 0, done: 0, option: '', votes: {}, top: [{ id: 9, name: 'Bo', cost: 40 }], count: 1 },
};

/** Just enough DOM for the two views and the panel. */
function fakeDoc() {
  class Text {
    constructor(t) { this.textContent = String(t); }
  }
  class El {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.attrs = {};
      this.dataset = {};
      this.props = {};
      this.style = { setProperty: (k, v) => { this.props[k] = v; } };
      this.listeners = {};
      this.hidden = false;
      this.className = '';
      this.parentElement = null;
      this._text = '';
    }
    get id() { return this.attrs.id || ''; }
    set id(v) { this.attrs.id = v; }
    get childElementCount() { return this.children.filter((c) => c instanceof El).length; }
    get nextSibling() { const p = this.parentElement; return p ? p.children[p.children.indexOf(this) + 1] || null : null; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    append(...nodes) { for (const n of nodes) { n.parentElement?.children && n.parentElement !== this && n.parentElement.children.splice(n.parentElement.children.indexOf(n), 1); n.parentElement = this; this.children.push(n); } }
    prepend(n) { n.parentElement = this; this.children.unshift(n); }
    after(n) {
      if (n.parentElement) n.parentElement.children.splice(n.parentElement.children.indexOf(n), 1);
      const p = this.parentElement;
      p.children.splice(p.children.indexOf(this) + 1, 0, n);
      n.parentElement = p;
    }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    click() { for (const fn of this.listeners.click || []) fn({ target: this }); }
    set textContent(v) { this.children = []; this._text = String(v); }
    get textContent() { return this._text + this.children.map((c) => c.textContent || '').join(''); }
    *walk() { for (const c of this.children) { if (!(c instanceof El)) continue; yield c; yield* c.walk(); } }
    all(fn) { return [...this.walk()].filter(fn); }
    querySelector(sel) {
      const parts = sel.trim().split(/\s+/);
      let scope = [this];
      for (const p of parts) {
        const match = (n) => (p.startsWith('#') ? n.id === p.slice(1) : p.startsWith('.') ? n.className.split(/\s+/).includes(p.slice(1)) : /^\[data-featured="1"\]$/.test(p) ? n.dataset.featured === '1' : false);
        scope = scope.flatMap((s) => s.all(match));
      }
      return scope[0] || null;
    }
  }
  const html = new El('html');
  const head = new El('head');
  const body = new El('body');
  html.append(head, body);
  const doc = {
    head,
    body,
    createElement: (tag) => new El(tag),
    createElementNS: (_ns, tag) => new El(tag),
    createTextNode: (t) => new Text(t),
    getElementById: (id) => html.all((n) => n.id === id)[0] || null,
    querySelector: (sel) => html.querySelector(sel),
  };
  return doc;
}

describe('the featured project message (js/featured-project.js)', () => {
  it('reads project_featured in this page clock, and nothing for none', () => {
    const f = featuredFromServer(MSG, 1000);
    assert.equal(f.jobId, TUMBLE);
    assert.equal(f.label, 'Tumble Rd 1');
    assert.equal(f.phase, 1);
    assert.equal(f.phases, 4);
    assert.equal(f.percent, 37);
    assert.equal(f.since, NOW - 6000);
    assert.equal(f.by, 'auto');
    assert.equal(featuredFromServer({ t: 'project_featured', job: '' }), null);
    assert.equal(featuredFromServer({ job: '<>' }), null, 'only an id survives');
    assert.equal(featuredFromServer({ ...MSG, phase: 9 }).phase, 3, 'the phase stays inside the project');
  });

  it('says where it is and how it stands, plainly', () => {
    const f = featuredFromServer(MSG);
    assert.equal(featuredPillText(f), 'Featured: Tumble Rd 1 · 37%');
    assert.equal(featuredWhere(f), 'A new street in Choru, from Gelatto Lane');
    assert.equal(featuredStatus(f, NOW), 'Phase 2 of 4 · 37% built');
    assert.equal(featuredStatus({ ...f, readyAt: NOW + 5 * 60_000 }, NOW), 'Phase 2 of 4 opens in 5 min');
    assert.equal(featuredWhere({ ...f, kind: 'upgrade', label: 'Grand Mile', hub: 'Groddle Forest' }), 'An upgrade of Grand Mile, Groddle Forest');
    assert.match(featuredLabel(f, NOW), /^Featured street project: Tumble Rd 1\./);
    assert.equal(featuredChanged(null, f), true);
    assert.equal(featuredChanged(f, { ...f, percent: 50 }), false, 'progress is not a change of project');
    for (const text of [FEATURED_TEXT.heading, FEATURED_TEXT.copy, FEATURED_TEXT.pillTip, FEATURED_TEXT.toast('X'), PROJECTS_TEXT.featuredCopy, featuredWhere(f), featuredStatus(f, NOW)]) {
      assert.ok(!/[–—]/.test(text), `no dashes: ${text}`);
    }
  });
});

describe('the pill and the Feat panel row (js/ui/featured-project.js)', () => {
  it('draws the pill under the street name, hides it with none, and opens on a click', () => {
    const doc = fakeDoc();
    const gameRoot = doc.createElement('div');
    gameRoot.id = 'game-root';
    doc.body.append(gameRoot);
    let opened = 0;
    const pill = renderFeaturedPill(doc, featuredFromServer(MSG), { onOpen: () => (opened += 1), now: NOW });
    assert.equal(pill.id, FEATURED_PILL_ID);
    assert.equal(pill.hidden, false);
    assert.equal(pill.dataset.featuredJob, TUMBLE);
    assert.match(pill.textContent, /Featured: Tumble Rd 1 · 37%/);
    assert.equal(pill.tagName, 'BUTTON');
    pill.click();
    assert.equal(opened, 1);
    assert.ok(doc.getElementById('featured-project-style'), 'its stylesheet (tokens only: tests/design-tokens.test.js)');
    renderFeaturedPill(doc, null);
    assert.equal(doc.getElementById(FEATURED_PILL_ID).hidden, true);
  });

  it('puts the row under the shared Feat in the Feat panel', () => {
    const doc = fakeDoc();
    const panel = doc.createElement('div');
    panel.id = 'feat-panel';
    const body = doc.createElement('div');
    body.className = 'ui-sheet-body';
    const feat = doc.createElement('section');
    feat.id = 'solo-feats';
    const chain = doc.createElement('p');
    body.append(feat, chain);
    panel.append(body);
    doc.body.append(panel);
    let opened = 0;
    const row = renderFeaturedRow(doc, featuredFromServer(MSG), { onOpen: () => (opened += 1), now: NOW });
    assert.equal(row.id, FEATURED_ROW_ID);
    assert.equal(body.children[1], row, 'right after the Feat');
    assert.match(row.textContent, /Featured street project/);
    assert.match(row.textContent, /Tumble Rd 1/);
    assert.match(row.textContent, /Phase 2 of 4 · 37% built/);
    row.click();
    assert.equal(opened, 1);
    renderFeaturedRow(doc, null);
    assert.equal(row.hidden, true);
  });
});

describe('the Projects panel leads with it (js/ui/projects-sheet.js)', () => {
  it('a Featured section first, its card tagged, never twice', () => {
    const doc = fakeDoc();
    const gameRoot = doc.createElement('div');
    gameRoot.id = 'game-root';
    doc.body.append(gameRoot);
    buildProjectsPanel(doc, gameRoot);
    const state = normalizeStreetJobState({ initialized: true });
    const row = rowFromServer(MSG.row);
    const e = projectEntry(state, catalog, TUMBLE, row, { now: NOW });
    e.featured = true;
    e.place = e.place || 'GA5S8KFNVF42GS5';
    renderProjects(doc, { featured: e, active: [{ ...e, featured: false }], done: [], fresh: 0 }, { now: NOW });
    const box = doc.getElementById('projects-list');
    const sections = box.all((n) => n.dataset.pjSection);
    assert.deepEqual(sections.map((s) => s.dataset.pjSection), ['featured']);
    const cards = box.all((n) => n.dataset.project);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].dataset.featured, '1');
    assert.match(cards[0].className, /is-featured/);
    assert.match(cards[0].textContent, /^Featured/);
    assert.ok(cards[0].all((n) => n.dataset.pjAct === 'route').length, 'it offers the way there');
  });
});

describe('the giver bubble star (js/job-indicator.js)', () => {
  it('marks the featured project only', () => {
    const head = { status: 'active', phase: 0 };
    const plain = jobIndicatorView(head, { perc: 0.2 });
    const star = jobIndicatorView(head, { perc: 0.2, featured: true });
    assert.equal(plain.featured, false);
    assert.equal(star.featured, true);
    assert.notEqual(plain.key, star.key, 'the bubble redraws when it becomes featured');
    assert.deepEqual(star.main, plain.main, 'the words stay the source bubble');
  });
});

describe('wiring', () => {
  const feature = read('public/js/features/street-jobs-feature.js');
  const groups = read('public/js/features/groups-feature.js');
  it('the board feature follows project_featured online and draws the pill, the row and the star', () => {
    assert.match(feature, /client\.on\('msg:project_featured'/);
    assert.match(feature, /renderFeaturedPill\(document, f,/);
    assert.match(feature, /renderFeaturedRow\(document, f,/);
    assert.match(feature, /featured: Boolean\(featured && featured\.jobId === head\.jobId\)/);
    assert.match(feature, /const f = mpMode \? featured : null;/, 'solo shows nothing');
    assert.match(feature, /list\.featured = featuredEntry\(engine, seenAt\);/);
  });
  it('Global keeps the server notices as notes', () => {
    assert.match(groups, /raw\?\.note === true && raw\.text/);
  });
});
