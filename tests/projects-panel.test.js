/**
 * Ticket 81 (G520): the Projects panel. The data (js/projects-tracker.js) over the real street-jobs
 * catalog, solo rows and the realtime server's rows; the panel's cards (js/ui/projects-sheet.js) in
 * a small fake document; and the wiring: P and the Menu row, Escape and the panel closers, the
 * side sheet in Modern and the 2012 window in Classic, the Map's project card, and online the
 * project_sync "mine" ask and its project_mine answer.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeStreetJobState, contributeCurrants, contributeItems, settlePhase, phaseBaseCost, phaseRequirements, workCheck, workGear } from '../public/js/street-jobs.js?v=94f8d250';
import { rowFromServer } from '../public/js/street-jobs-mp.js?v=25efcadf';
import {
  PROJECTS_TEXT,
  agoWords,
  boardStreets,
  contributedJobs,
  mineTotal,
  CURRANTS_ICON,
  needCan,
  needEntry,
  needLine,
  projectEntry,
  projectList,
  projectPlace,
  shareLine,
  statusLine,
} from '../public/js/projects-tracker.js?v=edd58b99';
import { buildProjectsPanel, needRow, needsSummary, projectCard, renderProjects } from '../public/js/ui/projects-sheet.js?v=e32a73d1';
import { MENU_ROWS } from '../public/js/ui/topbar.js?v=40469965';
import { SIDE_SHEET_IDS } from '../public/js/ui/panel-shell.js?v=06a0d3fe';
import { hotkeySections, hotkeyText } from '../public/js/client-hotkeys.js?v=31d1891d';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const catalog = JSON.parse(read('public/assets/content/street-jobs.json'));
const NOW = Date.UTC(2026, 10, 4, 12);
const VIA = '351'; // Build Empty Via 5 (Baqala): one phase, items then work; its board is on Plains Rte C
const TUMBLE = '377'; // Build Tumble Rd 1 (Choru): four phases, currants first

/** A solo save that put currants into Tumble Rd 1's first phase and finished Empty Via 5. */
function soloState() {
  const state = normalizeStreetJobState({ initialized: true });
  const pc = { currants: 1000 };
  assert.equal(contributeCurrants(state, catalog, TUMBLE, 50, pc, NOW - 5000).ok, true);
  for (const r of phaseRequirements(state, catalog, VIA)) {
    const row = (state.jobs[VIA] ||= { phase: 0, got: {}, mine: {}, hired: {}, startedAt: NOW - 9000, readyAt: 0, doneAt: 0, option: null });
    row.got[r.id] = r.need;
  }
  const cls = catalog.jobs[VIA].phases[0].classTsid;
  state.jobs[VIA].mine[cls] = phaseBaseCost(catalog.classes[cls]);
  state.phasesContributed.push(`${VIA}-${catalog.jobs[VIA].phases[0].classTsid}`);
  assert.equal(settlePhase(state, catalog, VIA, NOW - 60_000, () => 0.5).jobDone, true);
  return state;
}

describe('Projects panel data (js/projects-tracker.js)', () => {
  it('lists the projects you put something into, and only street builds, upgrades and halls', () => {
    const state = soloState();
    const ids = contributedJobs(state, catalog, state.jobs);
    assert.deepEqual([...ids].sort(), [TUMBLE, VIA].sort());
    // A home's restoration in the save is its home's, not a street project.
    state.jobs['home-proto-1'] = { mine: { x: 5 } };
    assert.equal(contributedJobs(state, catalog, state.jobs).has('home-proto-1'), false);
    // Online, a fresh page knows only the phases the save remembers.
    const fresh = normalizeStreetJobState({ phasesContributed: [`${TUMBLE}-job_street_baq_12`] });
    assert.deepEqual([...contributedJobs(fresh, catalog, {})], [TUMBLE]);
    assert.equal(mineTotal({ mine: { a: 3, b: 4 } }), 7);
  });

  it('an active project: where, the phase, your part, progress and what it still needs', () => {
    const state = soloState();
    const e = projectEntry(state, catalog, TUMBLE, state.jobs[TUMBLE], { now: NOW, labels: { item: (c) => c, skill: (s) => `skill ${s}` } });
    assert.equal(e.status, 'active');
    assert.equal(e.finished, false);
    assert.equal(e.label, 'Tumble Rd 1');
    assert.equal(e.hub, 'Choru');
    assert.equal(e.phase, 0);
    assert.equal(e.phaseCount, 4);
    assert.equal(e.phaseName, 'Currants!');
    // The board to build it at is on the offering street; the new street itself is still closed.
    assert.equal(e.place, 'GA5C39VNDK420LG');
    assert.equal(e.board, 'GA5C39VNDK420LG');
    assert.ok(e.progress > 0 && e.progress < 1, `progress ${e.progress}`);
    assert.equal(e.shares.length, 1);
    assert.equal(e.shares[0].current, true);
    assert.match(shareLine(e), /^Your part: \d+% of phase 1 so far$/);
    assert.equal(statusLine(e, NOW), 'Tumble Rd 1, Choru. Phase 1 of 4: Currants!');
    // Every requirement not yet in, the later group marked.
    assert.ok(e.needs.length >= 5);
    const first = e.needs.find((n) => n.id === 'r915');
    assert.equal(first.text, `Contribute currants · ${first.left.toLocaleString('en-US')} more`);
    assert.equal(first.open, true);
    // r922 is bucket 1's group 2: it opens once the three currant rows are in.
    const later = e.needs.find((n) => n.id === 'r922');
    assert.equal(later.open, false);
    assert.match(later.text, /^[A-Z].* with a quill.* · \d+ units?$/);
    assert.equal(e.needs.find((n) => n.id === 'r919').open, true, 'bucket 2 runs beside bucket 1');
  });

  it('a finished project: Done with when it finished, its street to go to, New until you look', () => {
    const state = soloState();
    const e = projectEntry(state, catalog, VIA, state.jobs[VIA], { now: NOW, seenAt: NOW - 120_000 });
    assert.equal(e.status, 'done');
    assert.equal(e.finished, true);
    assert.equal(e.doneAt, NOW - 60_000);
    assert.equal(e.isNew, true);
    assert.equal(e.place, catalog.jobs[VIA].street, 'a built street is the place to go');
    assert.deepEqual(e.needs, []);
    assert.equal(statusLine(e, NOW), 'Empty Via 5, Baqala. Finished 1 min ago.');
    // A one-phase project titled after its street says only where it is while under way.
    assert.equal(statusLine({ ...e, finished: false, status: 'active', phaseName: 'Empty Via 5', phaseCount: 1 }, NOW), 'Empty Via 5, Baqala.');
    assert.equal(statusLine({ ...e, finished: false, status: 'active', phaseName: 'Spices!', phaseCount: 1 }, NOW), 'Empty Via 5, Baqala. Spices!');
    assert.equal(shareLine(e), 'Your part: 100%');
    const seen = projectEntry(state, catalog, VIA, state.jobs[VIA], { now: NOW, seenAt: NOW - 1000 });
    assert.equal(seen.isNew, false);
  });

  it('projectList: under way first (most done first), then Done newest first, and the fresh count', () => {
    const state = soloState();
    const list = projectList(state, catalog, state.jobs, { now: NOW, seenAt: NOW - 120_000 });
    assert.deepEqual(list.active.map((e) => e.jobId), [TUMBLE]);
    assert.deepEqual(list.done.map((e) => e.jobId), [VIA]);
    assert.equal(list.fresh, 1);
    assert.equal(projectList(state, catalog, state.jobs, { now: NOW, seenAt: NOW }).fresh, 0);
    const empty = projectList(normalizeStreetJobState({}), catalog, {}, { now: NOW });
    assert.deepEqual([empty.active.length, empty.done.length, empty.fresh], [0, 0, 0]);
  });

  it('online: the server row gives your own share only; a job known only from the save waits for it', () => {
    const state = normalizeStreetJobState({ initialized: true, phasesContributed: [`${TUMBLE}-job_street_baq_12`, `${VIA}-${catalog.jobs[VIA].phases[0].classTsid}`] });
    // projects.go rowJSON: mine is the reader's; top names others, which the panel never reads.
    const row = rowFromServer({ phase: 0, got: { r915: 100 }, mine: { job_street_baq_12: 40 }, started: NOW - 1000, top: [{ id: 9, name: 'Somebody', cost: 900 }], count: 3 }, 0);
    const list = projectList(state, catalog, { [TUMBLE]: row }, { now: NOW });
    const e = list.active.find((x) => x.jobId === TUMBLE);
    assert.equal(e.known, true);
    assert.ok(!JSON.stringify(e).includes('Somebody'), 'nobody else is named');
    assert.equal(e.needs.find((n) => n.id === 'r915').left, 100);
    const unknown = list.active.find((x) => x.jobId === VIA);
    assert.equal(unknown.known, false);
    assert.deepEqual(unknown.needs, []);
    assert.equal(shareLine(unknown), 'You put something in.');
  });

  it('places, words and the solo amounts note', () => {
    assert.ok(boardStreets(catalog).get(VIA).includes('GA5157TDPC42IGK'));
    assert.equal(projectPlace(catalog, VIA), 'GA5157TDPC42IGK');
    assert.equal(projectPlace(catalog, VIA, { done: true }), catalog.jobs[VIA].street);
    assert.equal(needLine({ type: 'item', classId: 'plank', need: 10, got: 9 }, { item: (c, n) => (n === 1 ? 'Plank' : 'Planks') }), 'Contribute Plank · 1 more');
    assert.equal(needLine({ type: 'item', classId: 'plank', need: 20, got: 4 }, { item: (c, n) => (n === 1 ? 'Plank' : 'Planks') }), 'Contribute Planks · 16 more');
    assert.equal(needLine({ type: 'currants', need: 1500, got: 0 }), 'Contribute currants · 1,500 more');
    assert.equal(needLine({ type: 'work', classId: 'awesome_pot', verb: 'bang on', need: 2, got: 0 }, { item: () => 'Awesome Pot' }), 'Bang on with an Awesome Pot · 2 units');
    assert.equal(needLine({ type: 'work', classId: 'hatchet', verb: 'chop', skill: 'woodworking_1', need: 3, got: 2 }, { item: () => 'Hatchet', skill: () => 'Woodworking I' }), 'Chop with a Hatchet (Woodworking I) · 1 unit');
    assert.equal(agoWords(NOW - 3 * 3600_000, NOW), '3 h ago');
    assert.equal(agoWords(NOW - 86_400_000, NOW), 'yesterday');
    assert.equal(agoWords(0, NOW), '');
    // Player-facing words: plain, no em-dashes, no trademark.
    for (const t of Object.values(PROJECTS_TEXT)) {
      assert.ok(!/[—]/.test(t), t);
      assert.ok(!/Glitch/.test(t), t);
    }
  });
});

/* ------------------------------------------------------------------ */
/* A small document: enough for the panel                                */
/* ------------------------------------------------------------------ */

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
    hasAttribute(k) { return k in this.attrs; }
    append(...nodes) {
      for (const n of nodes) {
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
    querySelector(sel) { return sel.startsWith('#') ? this.all((n) => n.id === sel.slice(1))[0] || null : null; }
  }
  const body = new El('body');
  return {
    body,
    createElement: (tag) => new El(tag),
    createTextNode: (t) => new Text(t),
    getElementById: (id) => body.all((n) => n.id === id)[0] || null,
  };
}

describe('Projects panel (js/ui/projects-sheet.js)', () => {
  it('builds the side sheet with the shell frame: icon, title, P, close, a body that scrolls, the footer', () => {
    const doc = fakeDoc();
    const gameRoot = doc.createElement('div');
    gameRoot.id = 'game-root';
    const quests = doc.createElement('div');
    quests.id = 'quest-panel';
    gameRoot.append(quests);
    doc.body.append(gameRoot);
    const panel = buildProjectsPanel(doc, gameRoot);
    assert.equal(panel.id, 'projects-panel');
    assert.equal(panel.hidden, true);
    assert.match(panel.className, /\bside-panel\b/);
    assert.match(panel.className, /\bui-sheet\b/);
    assert.equal(gameRoot.children[1], panel, 'beside the Quest Log');
    assert.equal(buildProjectsPanel(doc, gameRoot), panel, 'built once');
    const card = panel.children[0];
    assert.match(card.className, /ui-sheet-card/);
    assert.deepEqual(card.children.map((c) => c.className), ['side-head ui-sheet-head', 'ui-sheet-body', 'ui-sheet-foot']);
    const head = card.children[0];
    assert.equal(head.all((n) => n.tagName === 'H2')[0].textContent, 'Projects');
    assert.equal(head.all((n) => /ui-sheet-key/.test(n.className))[0].textContent, 'P');
    assert.ok(doc.getElementById('projects-close'));
    assert.ok(doc.getElementById('projects-list'));
  });

  it('draws Under way and Done, a New mark, the needs folded, and the three buttons', () => {
    const doc = fakeDoc();
    const gameRoot = doc.createElement('div');
    doc.body.append(gameRoot);
    buildProjectsPanel(doc, gameRoot);
    const state = soloState();
    const list = projectList(state, catalog, state.jobs, { now: NOW, seenAt: NOW - 120_000 });
    const acts = [];
    renderProjects(doc, list, {
      now: NOW,
      meta: PROJECTS_TEXT.solo,
      teleport: (e) => (e.jobId === VIA ? { show: true, ok: true, label: 'Teleport' } : { show: true, ok: false, label: 'Teleport', reason: 'Not enough energy.' }),
      onAction: (act, e) => acts.push(`${act}:${e.jobId}`),
    });
    const box = doc.getElementById('projects-list');
    const sections = box.all((n) => n.dataset.pjSection);
    assert.deepEqual(sections.map((s) => s.dataset.pjSection), ['active', 'done']);
    assert.equal(sections[0].children[0].textContent, 'Under way 1');
    assert.equal(sections[1].children[0].textContent, 'Done 1');
    const cards = box.all((n) => n.dataset.project);
    assert.deepEqual(cards.map((c) => [c.dataset.project, c.dataset.status, c.dataset.new || '']), [[TUMBLE, 'active', ''], [VIA, 'done', '1']]);
    assert.match(cards[1].textContent, /New/);
    assert.match(cards[1].textContent, /Finished 1 min ago/);
    const needs = cards[0].all((n) => n.tagName === 'DETAILS')[0];
    assert.match(needs.children[0].textContent, /^Still needed \(\d+\)$/);
    assert.match(needs.textContent, /after the earlier steps/);
    assert.equal(cards[1].all((n) => n.tagName === 'DETAILS').length, 0, 'nothing is needed once it is done');
    const buttons = (c) => c.all((n) => n.tagName === 'BUTTON');
    assert.deepEqual(buttons(cards[0]).map((b) => b.dataset.pjAct), ['route', 'teleport', 'map']);
    const tp = buttons(cards[0])[1];
    assert.equal(tp.disabled, true);
    assert.equal(tp.getAttribute('title'), 'Not enough energy.');
    buttons(cards[1])[0].click();
    buttons(cards[1])[1].click();
    buttons(cards[1])[2].click();
    assert.deepEqual(acts, [`route:${VIA}`, `teleport:${VIA}`, `map:${VIA}`]);
    assert.equal(doc.getElementById('projects-meta').textContent, PROJECTS_TEXT.solo);
  });

  it('no Teleport button when you have no way to teleport; an empty list says how to start', () => {
    const doc = fakeDoc();
    const state = soloState();
    const e = projectList(state, catalog, state.jobs, { now: NOW }).active[0];
    const card = projectCard(doc, e, { now: NOW, teleport: () => null });
    assert.deepEqual(card.all((n) => n.tagName === 'BUTTON').map((b) => b.dataset.pjAct), ['route', 'map']);
    const gameRoot = doc.createElement('div');
    doc.body.append(gameRoot);
    buildProjectsPanel(doc, gameRoot);
    renderProjects(doc, { active: [], done: [], fresh: 0 }, { now: NOW });
    assert.equal(doc.getElementById('projects-list').textContent, PROJECTS_TEXT.empty);
  });
});

describe('Projects panel wiring', () => {
  const game = read('public/game.js');
  const feature = read('public/js/features/street-jobs-feature.js');
  const classic = read('public/css/classic.css');
  const style = read('public/style.css');

  it('P opens it and closes it, and P is free in the house keys; the Menu row and the ? sheet name it', () => {
    assert.match(game, /if \(isPlainKey\(e, 'p'\) && !e\.repeat\) features\.query\('projectsPanel', 'open', engine\);/);
    assert.match(game, /if \(isPlainKey\(e, 'p'\) && !e\.repeat\) closeProjectsPanel\(\);/);
    // No other plain P in the game's keys (the third: panelSwapOpener, P opening Projects in another window's place, report #206).
    assert.equal((game.match(/isPlainKey\(e, 'p'\)/g) || []).length, 3);
    assert.match(game, /if \(isPlainKey\(e, 'p'\) && !isProjectsOpen\(\)\) return \(\) => features\.query\('projectsPanel', 'open', engine\);/);
    assert.ok(!/e\.key === 'p'|e\.key === 'P'/.test(game));
    assert.deepEqual(MENU_ROWS['projects-btn'], { group: 'world', rank: 2, key: 'P' });
    const keys = Object.values(MENU_ROWS).filter((r) => r.key === 'P' && !r.mod);
    assert.equal(keys.length, 1);
    const menus = hotkeySections().find((s) => s.title === 'Menus');
    const row = menus.rows.find(([label]) => label === 'Projects');
    assert.equal(hotkeyText(row[1]), 'P');
    const taken = hotkeySections().flatMap((s) => s.rows.flatMap(([label, alts]) => alts.filter((a) => a.length === 1 && a[0] === 'P').map(() => label)));
    assert.deepEqual(taken, ['Projects']);
  });

  it('a side sheet that never blocks walking, closed by Escape and by the topmost-window step', () => {
    assert.ok(SIDE_SHEET_IDS.includes('projects-panel'));
    assert.match(game, /'projects-panel': \(\) => closeProjectsPanel\(\),/);
    assert.match(game, /isBuffsOpen\(\) \|\|\n\s+isProjectsOpen\(\) \|\|/);
    assert.match(game, /closeBuffsPanel\(\);\n\s+closeProjectsPanel\(\);\n\s+closeMakePanel\(\);/);
    assert.match(game, /function closeContentPanels\(\) \{\n\s+closeProjectsPanel\(\);/);
    assert.match(game, /openMap: \(hubId, opts\) => openMap\(hubId, opts\)/);
    assert.match(feature, /engine\.panelShell\?\.add\?\.\(\{ id: PROJECTS_PANEL_ID, close: \(\) => closeProjects\(engine\) \}\)/);
  });

  it('Classic draws it as a 2012 window like the Quest Log; Modern styles the cards from tokens', () => {
    assert.match(classic, /:is\(#skills-panel, #buffs-panel, #achieve-panel, #quest-panel, #projects-panel, #map-panel, #make-panel\):not\(\[hidden\]\)/);
    assert.match(classic, /:is\(#skills-panel, #buffs-panel, #achieve-panel, #quest-panel, #projects-panel\) > \.side-card,/);
    assert.match(classic, /:is\(#quest-panel, #projects-panel, #make-panel\) \.ui-sheet-body/);
    assert.match(classic, /#projects-list \.pj-card \{/);
    assert.match(style, /\[data-ui="modern"\] #projects-list \.pj-card \{/);
    assert.match(style, /\.more-menu:has\(\.pj-dot:not\(\[hidden\]\)\) \.more-btn::before/);
  });

  it('online it asks with project_sync mine and takes project_mine; the Map card opens it', () => {
    assert.match(feature, /client\.send\('project_sync', pj\.open \? \{ mine: true \} : \{\}\)/);
    assert.match(feature, /mp\.client\.send\('project_sync', \{ mine: true \}\)/);
    assert.match(feature, /client\.on\('msg:project_mine', \(msg\) => \{/);
    assert.match(feature, /'Your projects \(P\)'/);
    // The completion notices stay as they were; the panel only marks (no toast of its own).
    const section = feature.slice(feature.indexOf('/* Projects panel (ticket 81)'), feature.indexOf('/* Feature  '));
    assert.ok(section.length > 1000);
    assert.ok(!/toast\(`.*finished/i.test(section));
    // The seen time persists in the board's slice.
    assert.equal(normalizeStreetJobState({ trackerSeen: 5 }).trackerSeen, 5);
    assert.equal(normalizeStreetJobState({}).trackerSeen, null);
  });
});

describe('ticket 81 (Friendly, 2026-11-06): each need reads task first, with its picture and whether you can do it', () => {
  const PALSA = '165'; // Build Palsa Mosch (Shimla Mirch): Friendly's five work rows
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
  const NAMES = { mining: 'Mining', light_green_thumb: 'Light Green Thumb', soil_appreciation: 'Soil Appreciation', refining: 'Refining' };
  const ITEMS = { pick: 'Pick', shovel: 'Shovel', hoe: 'Hoe', scraper: 'Scraper', watering_can: 'Watering Can', ore_grinder: 'Grinder', peat: 'Peat', plank: ['Plank', 'Planks'] };
  const labels = {
    item: (c, n = 1) => { const x = ITEMS[c]; return Array.isArray(x) ? x[n === 1 ? 0 : 1] : x || c; },
    skill: (id) => { const m = /^(.*)_(\d+)$/.exec(id); return `${NAMES[m[1]]} ${ROMAN[Number(m[2])]}`; },
    icon: (c) => `assets/sprites/icons/${c}.webp`,
  };
  /** Palsa Mosch with its first items in, so bucket 1's work is open and bucket 2's waits on its items. */
  function palsa() {
    const state = normalizeStreetJobState({ initialized: true });
    const inv = { dullite: 99, earth: 99, plank: 99 };
    for (const [c, n] of Object.entries({ dullite: 12, earth: 15, plank: 10 })) assert.equal(contributeItems(state, catalog, PALSA, c, n, inv, NOW - 5000).ok, true);
    return state;
  }

  it('the lines Friendly quoted now start with the task and end with the count', () => {
    const state = palsa();
    const e = projectEntry(state, catalog, PALSA, state.jobs[PALSA], { now: NOW, labels });
    const work = e.needs.filter((n) => n.type === 'work').map((n) => n.text);
    for (const line of [
      'Clear with a Pick (Mining IV) · 7 units',
      'Level with a Hoe (Soil Appreciation V) · 11 units',
      'Scrape with a Scraper (Mining III) · 8 units',
      'Soak with a Watering Can (Soil Appreciation IV) · 9 units',
      'Crush with a Grinder (Refining II) · 10 units',
    ]) assert.ok(work.includes(line), `${line} in ${work.join(' | ')}`);
    assert.ok(e.needs.some((n) => n.text === 'Contribute Peat · 9 more'), e.needs.map((n) => n.text).join(' | '));
    // Each need has its picture and what is left (the count on the picture), and no mark without a pack to read.
    const pick = e.needs.find((n) => n.text.startsWith('Clear'));
    assert.equal(pick.icon, 'assets/sprites/icons/pick.webp');
    assert.equal(pick.left, 7);
    assert.equal(pick.can, '');
    assert.equal(e.needs.find((n) => n.type === 'item').icon.startsWith('assets/sprites/icons/'), true);
  });

  it('work: the tool in your pack that still works and the skill, as workCheck rules', () => {
    const state = palsa();
    const req = phaseRequirements(state, catalog, PALSA).find((r) => r.verb === 'clear');
    const ready = { inv: { pick: 1 }, learned: ['mining_4'], toolOk: () => true };
    assert.deepEqual(needCan(req, ready, labels), { can: 'yes', mark: PROJECTS_TEXT.ready });
    assert.deepEqual(needCan(req, { inv: {}, learned: ['mining_4'] }, labels), { can: 'no', mark: 'You need a Pick' });
    assert.deepEqual(needCan(req, { inv: { pick: 1 }, learned: [] }, labels), { can: 'no', mark: 'You need Mining IV' });
    assert.deepEqual(needCan(req, { inv: {}, learned: [] }, labels), { can: 'no', mark: 'You need a Pick and Mining IV' });
    assert.deepEqual(needCan(req, { inv: { pick: 1 }, learned: ['mining_4'], toolOk: () => false }, labels), { can: 'no', mark: 'You need a working Pick' });
    assert.deepEqual(needCan({ type: 'work', classId: 'ore_grinder', need: 1, got: 0 }, { inv: {} }, labels), { can: 'no', mark: 'You need a Grinder' });
    // The same answer as the board's Work button for an open step (energy aside, as Hire a hand leaves it out).
    for (const [ctx, ok] of [[ready, true], [{ inv: {}, learned: ['mining_4'] }, false], [{ inv: { pick: 1 }, learned: [] }, false], [{ ...ready, toolOk: () => false }, false]]) {
      assert.equal(workCheck(state, catalog, PALSA, req.id, { ...ctx, energy: Infinity }, NOW).ok, ok);
      assert.equal(needCan(req, ctx, labels).can === 'yes', ok);
    }
    // workCheck reads the same gear (its messages are unchanged).
    assert.deepEqual(workGear(req, { inv: { pick: 2 }, learned: [] }), { tools: ['pick'], held: ['pick'], tool: 'pick', missingSkill: true });
    assert.equal(workCheck(state, catalog, PALSA, req.id, { inv: {}, learned: [] }, NOW).msg, 'You need a pick.');
    assert.equal(workCheck(state, catalog, PALSA, req.id, { inv: { pick: 1 }, learned: [] }, NOW).msg, 'You need the skill this work asks for.');
  });

  it('items and currants: what you carry against what is left', () => {
    const r = { type: 'item', classId: 'plank', need: 20, got: 4 };
    assert.deepEqual(needCan(r, { inv: { plank: 16 } }, labels), { can: 'yes', mark: 'You have 16' });
    assert.deepEqual(needCan(r, { inv: { plank: 3 } }, labels), { can: 'some', mark: 'You have 3' });
    assert.deepEqual(needCan(r, { inv: {} }, labels), { can: 'no', mark: PROJECTS_TEXT.haveNone });
    assert.deepEqual(needCan(r, { inv: {}, have: (c) => (c === 'plank' ? 40 : 0) }, labels), { can: 'yes', mark: 'You have 40' });
    const cur = { type: 'currants', need: 1500, got: 0 };
    assert.deepEqual(needCan(cur, { currants: 2000 }, labels), { can: 'yes', mark: 'You have 2,000' });
    assert.deepEqual(needCan(cur, { currants: 10 }, labels), { can: 'some', mark: 'You have 10' });
    assert.equal(needEntry(cur, labels, { currants: 0 }).icon, CURRANTS_ICON);
    assert.equal(needCan(cur, null, labels).can, '');
  });

  it('projectEntry and projectList carry the marks when given your pack', () => {
    const state = palsa();
    const ctx = { inv: { pick: 1, hoe: 1, peat: 3 }, learned: ['mining_4', 'mining_3'], toolOk: () => true };
    const e = projectList(state, catalog, state.jobs, { now: NOW, labels, ctx }).active.find((x) => x.jobId === PALSA);
    const by = (start) => e.needs.find((n) => n.text.startsWith(start));
    assert.deepEqual([by('Clear').can, by('Clear').open], ['yes', true]);
    assert.deepEqual([by('Level').can, by('Level').mark], ['no', 'You need Soil Appreciation V']);
    assert.deepEqual([by('Dig').can, by('Dig').mark], ['no', 'You need a Shovel and Light Green Thumb III']);
    assert.deepEqual([by('Scrape').can, by('Scrape').open], ['no', false], 'a later step still says what it would need');
    assert.deepEqual([by('Contribute Peat').can, by('Contribute Peat').mark], ['some', 'You have 3']);
  });

  it('the panel draws each need: picture and count, the words, and the mark in words and a sign', () => {
    const doc = fakeDoc();
    const row = (n) => needRow(doc, { id: 'r1', type: 'work', open: true, left: 7, icon: 'assets/sprites/icons/pick.webp', text: 'Clear with a Pick (Mining IV) · 7 units', can: 'yes', mark: PROJECTS_TEXT.ready, ...n });
    const yes = row({});
    assert.equal(yes.dataset.need, 'r1');
    assert.equal(yes.dataset.can, 'yes');
    assert.match(yes.className, /\bpj-need\b.*\bis-yes\b/);
    const pic = yes.all((n) => /pj-need-pic/.test(n.className))[0];
    assert.equal(pic.getAttribute('aria-hidden'), 'true');
    assert.equal(pic.all((n) => n.tagName === 'IMG')[0].getAttribute('src'), 'assets/sprites/icons/pick.webp');
    assert.equal(pic.all((n) => /pj-need-n/.test(n.className))[0].textContent, '7');
    assert.equal(yes.all((n) => /pj-need-text/.test(n.className))[0].textContent, 'Clear with a Pick (Mining IV) · 7 units');
    assert.match(yes.all((n) => /pj-need-can/.test(n.className))[0].textContent, /^✓ You can do this$/);
    assert.match(row({ can: 'no', mark: 'You need Mining IV' }).textContent, /✕ You need Mining IV/);
    assert.match(row({ can: 'some', mark: 'You have 3' }).textContent, /◐ You have 3/);
    // A later step: says it opens later; it names what you lack, and says nothing more when you have it.
    const laterNo = row({ open: false, can: 'no', mark: 'You need a Scraper' });
    assert.match(laterNo.className, /is-later/);
    assert.match(laterNo.textContent, /Opens after the earlier steps.*You need a Scraper/);
    const laterYes = row({ open: false });
    assert.match(laterYes.textContent, /Opens after the earlier steps/);
    assert.doesNotMatch(laterYes.textContent, /You can do this/);
    // No pack read (no ctx): no mark at all.
    const bare = row({ can: '', mark: '' });
    assert.equal(bare.dataset.can, undefined);
    assert.equal(bare.all((n) => /pj-need-can/.test(n.className)).length, 0);
    assert.equal(needsSummary([{ open: true, can: 'yes' }, { open: true, can: 'some' }, { open: true, can: 'no' }, { open: false, can: 'yes' }]), 'Still needed (4) · 2 you can do now');
    assert.equal(needsSummary([{ open: true, can: 'no' }]), 'Still needed (1)');
    assert.equal(needsSummary([{ open: true, can: '' }]), 'Still needed (1)');
    for (const k of ['ready', 'readySome', 'haveNone', 'later']) assert.doesNotMatch(PROJECTS_TEXT[k], /—|Glitch/, k);
  });

  it('the game hands the panel your pack, skills and the item pictures, and follows the pack while it is open', () => {
    const feature = read('public/js/features/street-jobs-feature.js');
    const style = read('public/style.css');
    const classic = read('public/css/classic.css');
    assert.match(feature, /labels: \{ item: \(cls, n\) => itemLabel\(cls, n\), skill: skillLabel, icon: itemIcon \},\n\s+\/\/ Ticket 81[^\n]*\n\s+ctx: projectsCtx\(engine\),/);
    assert.match(feature, /function projectsCtx\(engine\) \{[\s\S]{0,300}workCtx\(engine\)[\s\S]{0,300}have: \(cls\) => countItem\(engine\.inv, cls\)/);
    assert.match(feature, /\$\{n\.id\}:\$\{n\.left\}:\$\{n\.open\}:\$\{n\.can\}:\$\{n\.mark\}/, 'a change of mark redraws the panel');
    assert.match(feature, /tickWork\(engine, now\);\n\s+tickProjectsPack\(engine, now\);/);
    assert.match(feature, /function tickProjectsPack\(engine, now\) \{[\s\S]{0,400}packStamp\(engine\.inv/);
    for (const k of ['pj-need', 'pj-need-pic', 'pj-need-n', 'pj-need-text', 'pj-need-can']) {
      assert.match(style, new RegExp(`\\[data-ui="modern"\\] #projects-list \\.${k}\\b`), `Modern ${k}`);
      assert.match(classic, new RegExp(`:root\\[data-ui="classic"\\] #game-root #projects-list \\.${k}\\b`), `Classic ${k}`);
    }
    for (const can of ['yes', 'some', 'no']) {
      assert.match(style, new RegExp(`\\.pj-need\\.is-${can} \\.pj-need-can \\{ color: var\\(--`));
      assert.match(classic, new RegExp(`\\.pj-need\\.is-${can} \\.pj-need-can \\{ color: var\\(--c-classic-`));
    }
  });
});

// Items for contributeItems are not needed above; keep the import used for a quick sanity check.
it('the board still takes items the usual way', () => {
  const state = normalizeStreetJobState({ initialized: true });
  const req = phaseRequirements(state, catalog, VIA).find((r) => r.type === 'item' && r.open);
  const inv = { [req.classId]: 1 };
  assert.equal(contributeItems(state, catalog, VIA, req.classId, 1, inv, NOW).ok, true);
  assert.equal(contributedJobs(state, catalog, state.jobs).has(VIA), true);
});
