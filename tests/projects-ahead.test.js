/**
 * G801 (Dr Flavius, kevbob, Dorktor Who; Austin approved 2026-11-22): which unbuilt roads lead to a
 * region. Players planned it by hand in Global ("what roads we would need to open to get there?").
 * The Projects sheet's "Roads to a region" lists the regions none of whose streets the roads as they
 * stand reach, and for a pick (a region there, or a street from the Map's Roads to build) the street
 * projects that open the way, in order, each a project card with its progress and the way to its
 * board. Glitch's world was fully open, so it never needed this.
 * Run: node --test tests/projects-ahead.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { closedStreets, normalizeStreetJobState } from '../public/js/street-jobs.js?v=17f103d0';
import { fewestClosures, reachableStreets, streetGraph } from '../public/js/street-graph.js?v=16013e6e';
import { PROJECTS_TEXT, aheadEntries, aheadRegions, streetProjectId } from '../public/js/projects-tracker.js?v=c5f34e96';
import { buildProjectsPanel, renderAhead, renderProjects } from '../public/js/ui/projects-sheet.js?v=f272903d';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const NOW = Date.UTC(2026, 10, 22, 12);
const fresh = (id) => normalizeStreetJobState({ jobs: { [id]: {} } }).jobs[id];

/* A toy world: A - B - C - D in a line (B and C still being built, each from the street before it),
   and Q off on its own. Regions: Home (A), Far (D), Lost (Q). */
const TOY = { streets: { GA: ['GB'], GB: ['GA', 'GC'], GC: ['GB', 'GD'], GD: ['GC'], GQ: [] } };
const PHASE = { classTsid: 'job_toy', order: 1, delaySeconds: 0, label: '' };
const TOY_CATALOG = {
  jobs: {
    t1: { kind: 'street', street: 'GB', label: 'Bee Road', hub: 'Home', hubId: '1', connecting: ['GA'], title: 'Build Bee Road', phases: [PHASE] },
    t2: { kind: 'street', street: 'GC', label: 'Sea Lane', hub: 'Far', hubId: '2', connecting: ['GB'], title: 'Build Sea Lane', phases: [PHASE] },
  },
  classes: { job_toy: { requirements: [{ id: 'r1', type: 'currants', num: 100 }] } },
  byStreet: { GA: ['t1'], GB: ['t2'] },
};
const HUBS = [
  { id: '1', name: 'Home', streets: ['GA'] },
  { id: '2', name: 'Far', streets: ['GD'] },
  { id: '3', name: 'Lost', streets: ['GQ'] },
];
const BOARDS = { GB: ['GA'], GC: ['GB'] };

describe('the projects on the way (js/projects-tracker.js)', () => {
  const state = normalizeStreetJobState({ initialized: true });
  const graph = streetGraph(TOY, { closed: ['GB', 'GC'] });
  const reach = reachableStreets(graph, { starts: ['GA'] });
  const chainTo = (targets) => fewestClosures(graph, { starts: ['GA'], targets, boards: BOARDS });

  it('lists only regions behind unbuilt roads, with how many', () => {
    assert.deepEqual(aheadRegions(HUBS, reach, chainTo), [{ id: '2', name: 'Far', count: 2 }], 'Home is open, no road at all leads to Lost');
  });

  it('the projects in the order they open the way, each to its board on the way, with its progress', () => {
    const rows = { t1: { ...fresh('t1'), startedAt: NOW - 1000, got: { r1: 1 } } };
    const es = aheadEntries(state, TOY_CATALOG, chainTo(['GD']), (id) => rows[id] || fresh(id), { now: NOW });
    assert.deepEqual(es.map((e) => [e.step, e.jobId, e.place, e.status]), [[1, 't1', 'GA', 'active'], [2, 't2', 'GB', 'open']]);
    assert.ok(es[0].progress > 0 && es[0].progress < 1, 'how far along');
    assert.equal(es[1].progress, 0);
    assert.equal(streetProjectId(TOY_CATALOG, 'LC'), 't2');
  });

  it('online, a project this client has not seen says so instead of showing nothing done', () => {
    const es = aheadEntries(state, TOY_CATALOG, chainTo(['GD']), () => null, { now: NOW });
    assert.equal(es[0].known, false);
    assert.equal(es[0].unknownText, PROJECTS_TEXT.aheadUnknown);
  });

  it('over the real world: every step can be built once the ones before it are', () => {
    const catalog = JSON.parse(read('public/assets/content/street-jobs.json'));
    const idx = JSON.parse(read('public/assets/streets/index.json'));
    const source = JSON.parse(read('public/assets/content/signpost-graph.json'));
    const save = normalizeStreetJobState({ initialized: true });
    const g = streetGraph(source, { closed: () => closedStreets(save, catalog, {}) });
    const boards = {};
    for (const job of Object.values(catalog.jobs)) if (job.kind === 'street') (boards[job.street] ||= []).push(...job.connecting.map((t) => t.replace(/^L/, 'G')));
    const by = new Map();
    for (const [t, m] of Object.entries(idx.streets)) {
      if (!m.hubId || !m.hubName) continue;
      if (!by.has(m.hubId)) by.set(m.hubId, { id: String(m.hubId), name: m.hubName, streets: [] });
      by.get(m.hubId).streets.push(t);
    }
    const starts = [idx.default];
    const chain = (targets) => fewestClosures(g, { starts, targets, boards });
    const regions = aheadRegions([...by.values()], reachableStreets(g, { starts }), chain);
    assert.ok(regions.length > 5, 'a fresh save has regions behind projects');
    for (const r of regions.slice(0, 4)) {
      const steps = aheadEntries(save, catalog, chain(by.get(r.id).streets), fresh, { now: NOW });
      assert.equal(steps.length, r.count, r.name);
      const built = normalizeStreetJobState({ initialized: true });
      for (const e of steps) {
        const open = reachableStreets(streetGraph(source, { closed: closedStreets(built, catalog, {}) }), { starts });
        assert.ok(open.has(e.place), `${r.name}: step ${e.step} (${e.title}) is built at ${e.place}, which the steps before it reach`);
        built.jobs[e.jobId] = { ...fresh(e.jobId), doneAt: NOW };
      }
      const after = reachableStreets(streetGraph(source, { closed: closedStreets(built, catalog, {}) }), { starts });
      assert.ok(by.get(r.id).streets.some((t) => after.has(t)), `${r.name} is reached once they are built`);
    }
  });
});

describe('Roads to a region in the Projects sheet (js/ui/projects-sheet.js)', () => {
  const setup = () => {
    const doc = fakeDoc();
    const gameRoot = doc.createElement('div');
    doc.body.append(gameRoot);
    buildProjectsPanel(doc, gameRoot);
    const box = doc.getElementById('projects-ahead');
    const select = box.all((n) => n.tagName === 'SELECT')[0];
    const list = box.all((n) => n.id === 'projects-ahead-list')[0];
    return { doc, box, select, list };
  };
  const state = normalizeStreetJobState({ initialized: true });
  const graph = streetGraph(TOY, { closed: ['GB', 'GC'] });
  const entries = aheadEntries(state, TOY_CATALOG, fewestClosures(graph, { starts: ['GA'], targets: ['GD'], boards: BOARDS }), fresh, { now: NOW });

  it('folded until opened; opening and picking ask the game', () => {
    const { doc, box, select } = setup();
    const asked = [];
    renderAhead(doc, { status: 'closed' }, { onToggle: (o) => asked.push(`toggle:${o}`), onPick: (h) => asked.push(`pick:${h}`) });
    assert.equal(box.tagName, 'DETAILS');
    assert.equal(Boolean(box.open), false);
    box.open = true;
    for (const fn of box.listeners.toggle) fn();
    select.value = 'h:2';
    for (const fn of select.listeners.change) fn();
    assert.deepEqual(asked, ['toggle:true', 'pick:h:2']);
  });

  it('the regions with their counts, then the steps in order as numbered project cards', () => {
    const { doc, box, select, list } = setup();
    const acts = [];
    renderAhead(doc, { status: 'list', regions: [{ id: 'h:2', name: 'Far', count: 2 }], hub: 'h:2', name: 'Far', entries }, { now: NOW, onAction: (a, e) => acts.push(`${a}:${e.jobId}`) });
    assert.equal(box.open, true);
    assert.equal(box.dataset.pjAhead, 'list');
    assert.deepEqual(select.children.map((o) => [o.getAttribute('value'), o.textContent]), [['', 'Choose a region'], ['h:2', 'Far (2 roads to build)']]);
    assert.equal(select.value, 'h:2');
    assert.equal(list.children[0].textContent, 'To reach Far, these 2 roads need building, first one first.');
    const cards = list.all((n) => n.dataset.project);
    assert.deepEqual(cards.map((c) => [c.dataset.step, c.dataset.project]), [['1', 't1'], ['2', 't2']]);
    assert.match(cards[0].all((n) => n.tagName === 'H3')[0].textContent, /^1\. Build Bee Road/);
    assert.ok(cards[0].all((n) => n.getAttribute('role') === 'progressbar').length, 'how far along');
    cards[1].all((n) => n.dataset.pjAct === 'route')[0].click();
    assert.deepEqual(acts, ['route:t2']);
  });

  it('a street from the Map shows by name; open, no road and nothing left say so', () => {
    const { doc, select, list } = setup();
    renderAhead(doc, { status: 'open', regions: [], hub: 's:GD', name: 'Dee Street (Far)' }, {});
    assert.deepEqual(select.children.map((o) => o.textContent), ['Choose a region', 'Dee Street (Far)']);
    assert.equal(list.textContent, 'Open roads already lead to Dee Street (Far).');
    renderAhead(doc, { status: 'noroad', regions: [], hub: 'h:3', name: 'Lost' }, {});
    assert.equal(list.textContent, 'No road leads to Lost.');
    renderAhead(doc, { status: 'none', regions: [] }, {});
    assert.equal(list.textContent, PROJECTS_TEXT.aheadNone);
    assert.equal(select.disabled, true);
  });

  it('after the open projects, never under Done', () => {
    const { doc } = setup();
    const store = { getItem: () => null, setItem() {} };
    const done = [{ ...entries[0], jobId: 'd1', step: 0, finished: true, status: 'done', place: '', needs: [], shares: [] }];
    renderProjects(doc, { active: [entries[1]], done, fresh: 0 }, { now: NOW, storage: store });
    const order = () => doc.getElementById('projects-list').children.map((c) => c.id || c.dataset.pjSection);
    assert.deepEqual(order(), ['active', 'projects-ahead']);
    doc.getElementById('projects-filters').children.find((c) => c.dataset.pjFilter === 'all').click();
    assert.deepEqual(order(), ['active', 'projects-ahead', 'done']);
    doc.getElementById('projects-filters').children.find((c) => c.dataset.pjFilter === 'done').click();
    assert.deepEqual(order(), ['done']);
  });

  it('plain words', () => {
    for (const k of Object.keys(PROJECTS_TEXT).filter((k) => k.startsWith('ahead'))) assert.doesNotMatch(PROJECTS_TEXT[k], /—|Glitch/, k);
  });
});

describe('Roads to a region wiring', () => {
  const feature = read('public/js/features/street-jobs-feature.js');
  const routes = read('public/js/features/map-routes-feature.js');
  const style = read('public/style.css');
  const classic = read('public/css/classic.css');

  it('the Map offers Roads to build for a street no open road reaches, and it opens the sheet there', () => {
    assert.match(routes, /noRoadPick = !res\.ok && res\.error === ROUTE_TEXT\.noRoad \? tsid : '';/);
    assert.match(routes, /button\('Roads to build', \(\) => \{[\s\S]*?engine\.query\?\.\('projectsPanel', 'ahead', engine, to\);/);
    assert.match(feature, /if \(action === 'ahead'\) return openAhead\(engine, to\), true;/);
  });

  it('online it reads the shared rows the client already holds, and sends nothing', () => {
    const fn = feature.slice(feature.indexOf('function aheadRow('), feature.indexOf('let aheadCache'));
    assert.match(fn, /mineRows\.get\(jobId\)/);
    assert.match(fn, /featured\.row/);
    const all = feature.slice(feature.indexOf('let regionHubs'), feature.indexOf('function tickProjectsPack'));
    assert.doesNotMatch(all, /\.send\(/, 'no new server message');
    assert.match(all, /fewestClosures\(waysReady\.graph, \{ free: waysReady\.free, starts: r\.starts, targets, boards: boardsOf\(\) \}\)/);
  });

  it('styled in Modern and Classic', () => {
    assert.match(style, /\[data-ui="modern"\] #projects-list \.pj-ahead \{/);
    assert.match(classic, /:root\[data-ui="classic"\] #game-root #projects-list \.pj-ahead \{/);
    assert.doesNotMatch(classic, /Glitch/);
  });
});

/* A small document: enough for the sheet. */
function fakeDoc() {
  class Text {
    constructor(t) {
      this.textContent = String(t);
      this.parentElement = null;
    }
  }
  class El {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.attrs = {};
      this.dataset = {};
      this.style = {};
      this.listeners = {};
      this.hidden = false;
      this.disabled = false;
      this.className = '';
      this.parentElement = null;
      this.scrollTop = 0;
      this._text = '';
    }
    get id() { return this.attrs.id || ''; }
    set id(v) { this.attrs.id = v; }
    get childElementCount() { return this.children.filter((c) => c instanceof El).length; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    append(...nodes) {
      for (const n of nodes) {
        if (n.parentElement) n.parentElement.children = n.parentElement.children.filter((c) => c !== n);
        n.parentElement = this;
        this.children.push(n);
      }
    }
    after(n) {
      const p = this.parentElement;
      p.children.splice(p.children.indexOf(this) + 1, 0, n);
      n.parentElement = p;
    }
    replaceChildren(...nodes) {
      for (const c of this.children) c.parentElement = null;
      this.children = [];
      this.append(...nodes);
    }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    click() { for (const fn of this.listeners.click || []) fn({ target: this }); }
    set textContent(v) {
      this.children = [];
      this._text = String(v);
    }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    *walk() {
      for (const c of this.children) {
        if (!(c instanceof El)) continue;
        yield c;
        yield* c.walk();
      }
    }
    all(fn) { return [...this.walk()].filter(fn); }
    querySelector() { return null; }
  }
  const body = new El('body');
  return {
    body,
    createElement: (tag) => new El(tag),
    createElementNS: (ns, tag) => new El(tag),
    createTextNode: (t) => new Text(t),
    getElementById: (id) => body.all((n) => n.id === id)[0] || null,
  };
}
