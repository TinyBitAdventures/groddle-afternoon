/**
 * The Projects panel (ticket 81, G520): a side sheet of the panel shell in Modern (js/ui/panel-shell.js,
 * on the left like Quests, never in the way of walking: SIDE_SHEET_IDS), and in Classic a 2012
 * window like the Quest Log (css/classic.css lists #projects-panel with the other windows). The
 * data is js/projects-tracker.js projectList; features/street-jobs-feature.js mounts it, fills it
 * and does what its buttons ask (the Map's route, the Map's Teleport, the Map).
 *
 * Each project is a card: its name, where it is and how it stands, a bar for the phase, your part,
 * what the phase still needs (folded: "Still needed (3)"), and Set as Destination, Teleport (when you
 * can teleport there: the Map's own rule, or a Teleportation Script to it) and Show on Map. Finished
 * projects follow under Done, newest first, with when they finished; one that finished since you
 * last looked has a quiet New mark until the panel closes.
 *
 * Everything is set as text, never HTML. QA hooks: #projects-panel, #projects-list
 * [data-projects-list], cards [data-project=<job id>] with data-status and data-new,
 * [data-pj-act="route|teleport|map"], [data-pj-needs] with rows [data-need=<requirement id>] and
 * [data-can=yes|some|no] (ticket 81: whether you can do it now), #projects-meta, #projects-close.
 *
 * G656: online, the featured street project (js/featured-project.js) leads the list in a section
 * of its own, [data-pj-section="featured"], its card [data-featured] with a Featured tag, whether
 * or not you have put anything into it yet.
 *
 * G1116 (report #591): All / Open / Done chips over the list, in the Skills panel's chip look
 * (.skill-tree-chip), each with its count: #projects-filters, chips [data-pj-filter=all|open|done].
 * Open is the featured project and those under way, Done the finished ones. The choice is kept in
 * this browser (PROJECTS_FILTER_KEY); with none kept the panel opens on Open when anything is open.
 *
 * G1210 (report #591): Sort: Status (open by how they stand, Done newest first, as before) or Region
 * (each section grouped by region A to Z, a region's name over its projects, the usual order inside
 * it): #projects-sorts, chips [data-pj-sort=status|region], kept in this browser (PROJECTS_SORT_KEY).
 * The featured project keeps its own section at the top either way.
 *
 * G801: "Roads to a region", folded after the open projects (not under Done): pick a region you
 * cannot walk to yet and the street projects that open the way there follow in order, each a card
 * as above (its progress, Set as Destination to its board on the way, Teleport, Show on Map).
 * features/street-jobs-feature.js works out the regions and the projects (renderAhead's view).
 * QA hooks: #projects-ahead [data-pj-ahead=<status>], #projects-ahead-region (the select),
 * #projects-ahead-list, cards [data-project] with [data-step].
 */

import { PROJECTS_TEXT as T, shareLine, statusLine } from '../projects-tracker.js?v=27b6ea1e';
import { featuredTag } from './featured-project.js?v=ed9eded9';

export const PROJECTS_PANEL_ID = 'projects-panel';
/** G1116: the chip a viewer last picked, kept in this browser only. */
export const PROJECTS_FILTER_KEY = 'groddle.projects.filter';
export const PROJECTS_FILTERS = Object.freeze([['all', 'All'], ['open', 'Open'], ['done', 'Done']]);
const FILTER_IDS = new Set(PROJECTS_FILTERS.map(([id]) => id));
/** G1210: the sort a viewer last picked, kept in this browser only. */
export const PROJECTS_SORT_KEY = 'groddle.projects.sort';
export const PROJECTS_SORTS = Object.freeze([['status', 'Status'], ['region', 'Region']]);
const SORT_IDS = new Set(PROJECTS_SORTS.map(([id]) => id));
const ICON = 'assets/sprites/street-jobs/sign_stake.webp';

function el(doc, tag, attrs = {}, text = '') {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'hidden') node.hidden = true;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  if (text) node.textContent = text;
  return node;
}

/**
 * The panel's markup, put into `root` (#game-root) once.
 * @param {Document} doc
 * @param {HTMLElement} root
 */
export function buildProjectsPanel(doc, root) {
  let panel = doc.getElementById(PROJECTS_PANEL_ID);
  if (panel) return panel;
  panel = el(doc, 'div', { id: PROJECTS_PANEL_ID, class: 'side-panel projects-panel ui-sheet', role: 'region', 'aria-labelledby': 'projects-panel-title', hidden: true });
  const card = el(doc, 'div', { class: 'side-card ui-sheet-card' });
  const head = el(doc, 'div', { class: 'side-head ui-sheet-head' });
  const icon = el(doc, 'img', { class: 'ui-sheet-icon', src: ICON, alt: '', width: 17, height: 28 });
  const title = el(doc, 'h2', { id: 'projects-panel-title', class: 'ui-sheet-title', tabindex: '-1' }, T.title);
  const key = el(doc, 'span', { class: 'kcap ui-sheet-key', 'aria-hidden': 'true' }, 'P');
  const close = el(doc, 'button', { type: 'button', id: 'projects-close', class: 'verb-menu-x ui-sheet-x', 'aria-label': 'Close Projects (Esc)' }, '×');
  head.append(icon, title, key, close);
  const body = el(doc, 'div', { class: 'ui-sheet-body' });
  body.append(filterBar(doc), sortBar(doc));
  const list = el(doc, 'div', { id: 'projects-list', class: 'projects-list', 'data-projects-list': '', 'aria-live': 'polite' });
  list.append(aheadBox(doc));
  body.append(list);
  const foot = el(doc, 'div', { class: 'ui-sheet-foot' });
  const meta = el(doc, 'p', { class: 'panel-meta', id: 'projects-meta' });
  const esc = el(doc, 'span', { class: 'ui-sheet-esc' });
  esc.append(el(doc, 'span', { class: 'kcap' }, 'Esc'), doc.createTextNode(' close'));
  foot.append(meta, esc);
  card.append(head, body, foot);
  panel.append(card);
  // Beside the Quest Log, so the windows keep their order in the page.
  const after = doc.getElementById('quest-panel');
  if (after?.parentElement === root) after.after(panel);
  else root.append(panel);
  return panel;
}

/** G801: the folded Roads to a region box, made once and moved back into the list on each draw. */
const aheadBoxes = new WeakMap();
/** What renderAhead was last handed: its callbacks (onToggle, onPick) and the card options. */
let aheadHooks = null;

function aheadBox(doc) {
  if (aheadBoxes.has(doc)) return aheadBoxes.get(doc);
  const box = el(doc, 'details', { id: 'projects-ahead', class: 'pj-ahead', dataset: { pjAhead: 'closed' } });
  box.append(el(doc, 'summary', { class: 'pj-ahead-title' }, T.aheadTitle));
  box.append(el(doc, 'p', { class: 'pj-note' }, T.aheadCopy));
  const pick = el(doc, 'label', { class: 'pj-ahead-pick' });
  const select = el(doc, 'select', { id: 'projects-ahead-region' });
  select.append(el(doc, 'option', { value: '' }, T.aheadChoose));
  pick.append(el(doc, 'span', {}, T.aheadPick), select);
  box.append(pick, el(doc, 'div', { id: 'projects-ahead-list', class: 'pj-ahead-list' }));
  box.addEventListener('toggle', () => aheadHooks?.onToggle?.(Boolean(box.open)));
  select.addEventListener('change', () => aheadHooks?.onPick?.(String(select.value || '')));
  aheadBoxes.set(doc, box);
  return box;
}

const roadsWord = (n) => (n === 1 ? '1 road to build' : `${n} roads to build`);

/**
 * G801: fill the Roads to a region box.
 * @param {Document} doc
 * @param {{ status: 'closed'|'loading'|'none'|'pick'|'open'|'noroad'|'list', regions?: { id: string, name: string, count: number }[],
 *   hub?: string, name?: string, entries?: object[] }} view
 * @param {{ onToggle?: (open: boolean) => void, onPick?: (hubId: string) => void, now?: number, teleport?: Function, onAction?: Function, openNeeds?: Set<string> }} o
 */
export function renderAhead(doc, view, o = {}) {
  aheadHooks = o;
  const box = aheadBox(doc);
  const v = view || { status: 'closed' };
  box.dataset.pjAhead = v.status;
  const open = v.status !== 'closed';
  if (Boolean(box.open) !== open) box.open = open;
  const select = box.children.find?.((c) => c.tagName === 'LABEL')?.children.find((c) => c.tagName === 'SELECT') || box.querySelector?.('select');
  const list = box.children.find?.((c) => c.id === 'projects-ahead-list') || box.querySelector?.('#projects-ahead-list');
  if (select) {
    const regions = [...(v.regions || [])];
    if (v.hub && !regions.some((r) => r.id === v.hub)) regions.push({ id: v.hub, name: v.name || v.hub, count: 0 });
    const sig = JSON.stringify(regions.map((r) => [r.id, r.count]));
    if (select.dataset.sig !== sig) {
      select.dataset.sig = sig;
      select.replaceChildren(el(doc, 'option', { value: '' }, T.aheadChoose), ...regions.map((r) => el(doc, 'option', { value: r.id }, r.count ? `${r.name} (${roadsWord(r.count)})` : r.name)));
    }
    select.value = v.hub || '';
    select.disabled = v.status === 'loading' || v.status === 'none';
  }
  if (!list) return;
  list.replaceChildren();
  const note = (text) => list.append(el(doc, 'p', { class: 'pj-note' }, text));
  if (v.status === 'loading') note(T.aheadLoading);
  else if (v.status === 'none') note(T.aheadNone);
  else if (v.status === 'open') note(`Open roads already lead to ${v.name}.`);
  else if (v.status === 'noroad') note(`No road leads to ${v.name}.`);
  else if (v.status === 'list') {
    const n = v.entries.length;
    note(n === 1 ? `To reach ${v.name}, this road needs building.` : `To reach ${v.name}, these ${n} roads need building, first one first.`);
    const ol = el(doc, 'ol', { class: 'pj-ahead-steps' });
    const now = o.now ?? Date.now();
    for (const e of v.entries) {
      const li = el(doc, 'li');
      li.append(projectCard(doc, e, { ...o, now }));
      ol.append(li);
    }
    list.append(ol);
  }
}

/** G1116: the All / Open / Done chips, drawn once; renderProjects sets their counts and which is on. */
function filterBar(doc) {
  const bar = el(doc, 'div', { id: 'projects-filters', class: 'skill-tree-filters pj-filters', role: 'tablist', 'aria-label': 'Show projects', hidden: true });
  for (const [id, label] of PROJECTS_FILTERS) {
    const chip = el(doc, 'button', { type: 'button', class: 'skill-tree-chip', role: 'tab', 'aria-selected': 'false', dataset: { pjFilter: id } });
    chip.append(doc.createTextNode(`${label} `), el(doc, 'b'));
    chip.addEventListener('click', () => pickFilter(doc, id));
    bar.append(chip);
  }
  return bar;
}

/** G1210: Sort: Status / Region, drawn once; renderProjects sets which is on. */
function sortBar(doc) {
  const bar = el(doc, 'div', { id: 'projects-sorts', class: 'skill-tree-filters pj-filters pj-sorts', role: 'radiogroup', 'aria-label': 'Sort projects', hidden: true });
  bar.append(el(doc, 'span', { class: 'pj-sort-label', 'aria-hidden': 'true' }, 'Sort'));
  for (const [id, label] of PROJECTS_SORTS) {
    const chip = el(doc, 'button', { type: 'button', class: 'skill-tree-chip', role: 'radio', 'aria-checked': 'false', dataset: { pjSort: id } }, label);
    chip.addEventListener('click', () => pickSort(doc, id));
    bar.append(chip);
  }
  return bar;
}

function viewerStore(o) {
  if (o && 'storage' in o) return o.storage;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** The kept chip, or '' when none is kept (or this browser keeps nothing). */
export function keptFilter(storage) {
  try {
    const v = storage?.getItem(PROJECTS_FILTER_KEY) || '';
    return FILTER_IDS.has(v) ? v : '';
  } catch {
    return '';
  }
}

function keepFilter(storage, id) {
  try {
    storage?.setItem(PROJECTS_FILTER_KEY, id);
  } catch {
    /* the choice just won't be remembered */
  }
}

/** G1210: the kept sort, else Status. */
export function keptSort(storage) {
  try {
    const v = storage?.getItem(PROJECTS_SORT_KEY) || '';
    return SORT_IDS.has(v) ? v : 'status';
  } catch {
    return 'status';
  }
}

/**
 * G1210: a section's rows by region (e.hub) A to Z, a project with no region last, the order they
 * came in kept inside a region. Returns [{ region, rows }].
 */
export function byRegion(rows = []) {
  const groups = new Map();
  for (const e of rows) {
    const region = String(e?.hub || '');
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region).push(e);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (!a) - (!b) || a.localeCompare(b))
    .map(([region, list]) => ({ region, rows: list }));
}

/**
 * G1116: which chip the list shows: the one picked this session, else the kept one, else Open when
 * anything is open and All when not.
 */
export function projectsFilter(counts, kept = '') {
  if (FILTER_IDS.has(kept)) return kept;
  return counts.open ? 'open' : 'all';
}

/** What the last renderProjects drew, so a chip can redraw the same list; the chip picked, per page. */
let last = null;
const picked = new WeakMap();

function pickFilter(doc, id) {
  if (!FILTER_IDS.has(id)) return;
  picked.set(doc, id);
  if (!last || last.doc !== doc) return;
  keepFilter(viewerStore(last.o), id);
  renderProjects(doc, last.list, last.o);
}

const pickedSort = new WeakMap();

function pickSort(doc, id) {
  if (!SORT_IDS.has(id)) return;
  pickedSort.set(doc, id);
  if (!last || last.doc !== doc) return;
  try {
    viewerStore(last.o)?.setItem(PROJECTS_SORT_KEY, id);
  } catch {
    /* the choice just won't be remembered */
  }
  renderProjects(doc, last.list, last.o);
}

/** The marks beside "You can do this" and the rest; the words say it too (never colour alone). */
const CAN_MARK = Object.freeze({ yes: '✓', some: '◐', no: '✕' });

/** "Still needed (5)", and "Still needed (5) · 2 you can do now" once the panel knows your pack. */
export function needsSummary(needs) {
  const now = needs.filter((n) => n.open && (n.can === 'yes' || n.can === 'some')).length;
  const known = needs.some((n) => n.can);
  return `${T.needs} (${needs.length})${known && now ? ` · ${now} ${T.readySome}` : ''}`;
}

/**
 * One need (ticket 81, Friendly 2026-11-06): the tool's or item's picture with what is left on it,
 * the task first and the count at the end, then whether you can do it now (a step after the
 * earlier ones says so, and still says what you would need for it).
 */
export function needRow(doc, n) {
  const can = n.can || '';
  const li = el(doc, 'li', { class: `pj-need${can ? ` is-${can}` : ''}${n.open ? '' : ' is-later'}`, dataset: { need: n.id, ...(can ? { can } : {}) } });
  const pic = el(doc, 'span', { class: 'pj-need-pic', 'aria-hidden': 'true' });
  if (n.icon) {
    const img = el(doc, 'img', { src: n.icon, alt: '', width: 28, height: 28, loading: 'lazy' });
    img.onerror = () => { img.style.visibility = 'hidden'; };
    pic.append(img);
  }
  pic.append(el(doc, 'b', { class: 'pj-need-n' }, n.left.toLocaleString('en-US')));
  const words = el(doc, 'span', { class: 'pj-need-words' });
  words.append(el(doc, 'span', { class: 'pj-need-text' }, n.text));
  const notes = el(doc, 'span', { class: 'pj-need-notes' });
  if (!n.open) notes.append(el(doc, 'span', { class: 'pj-later' }, T.later));
  // A later step you could already do needs no word; one you could not says what to get ready.
  if (can && (n.open || can === 'no')) {
    const mark = el(doc, 'span', { class: 'pj-need-can' });
    mark.append(el(doc, 'span', { class: 'pj-need-mark', 'aria-hidden': 'true' }, CAN_MARK[can]), doc.createTextNode(` ${n.mark}`));
    notes.append(mark);
  }
  if (notes.children.length) words.append(notes);
  li.append(pic, words);
  return li;
}

/**
 * One project's card.
 * @param {Document} doc
 * @param {object} e a projectEntry
 * @param {{ now: number, teleport?: (e: object) => ({ show: boolean, ok: boolean, label?: string, reason?: string }|null),
 *   onAction?: (act: string, e: object) => void, openNeeds?: Set<string> }} o
 */
export function projectCard(doc, e, o = {}) {
  const now = o.now ?? Date.now();
  const card = el(doc, 'article', {
    class: `pj-card${e.finished ? ' is-done' : ''}${e.isNew ? ' is-new' : ''}${e.featured ? ' is-featured' : ''}`,
    dataset: { project: e.jobId, status: e.status, ...(e.isNew ? { new: '1' } : {}), ...(e.featured ? { featured: '1' } : {}), ...(e.step ? { step: String(e.step) } : {}) },
  });
  const head = el(doc, 'div', { class: 'pj-head' });
  const title = el(doc, 'h3', { class: 'pj-title' });
  if (e.step) title.append(el(doc, 'span', { class: 'pj-step' }, `${e.step}.`), doc.createTextNode(' '));
  if (e.featured) title.append(featuredTag(doc), doc.createTextNode(' '));
  title.append(doc.createTextNode(e.title));
  if (e.isNew) title.append(doc.createTextNode(' '), el(doc, 'span', { class: 'pj-new' }, T.newMark));
  head.append(title, el(doc, 'p', { class: 'pj-where' }, statusLine(e, now)));
  card.append(head);
  if (e.keptForYou) card.append(el(doc, 'p', { class: 'pj-note pj-kept' }, T.keptForYou));
  if (!e.finished) {
    const bar = el(doc, 'div', { class: 'pj-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(e.progress * 100)), 'aria-label': `${e.title}: ${Math.round(e.progress * 100)}% of this phase` });
    const fill = el(doc, 'i');
    fill.style.width = `${Math.round(e.progress * 100)}%`;
    bar.append(fill);
    card.append(bar);
  }
  const share = shareLine(e);
  if (share) card.append(el(doc, 'p', { class: 'pj-share' }, share));
  if (!e.finished) {
    if (!e.known) card.append(el(doc, 'p', { class: 'pj-note' }, e.unknownText || T.unknown));
    else if (e.needs.length) {
      const needs = el(doc, 'details', { class: 'pj-needs', 'data-pj-needs': '' });
      if (o.openNeeds?.has(e.jobId)) needs.open = true;
      needs.addEventListener('toggle', () => {
        if (!o.openNeeds) return;
        if (needs.open) o.openNeeds.add(e.jobId);
        else o.openNeeds.delete(e.jobId);
      });
      needs.append(el(doc, 'summary', {}, needsSummary(e.needs)));
      const ul = el(doc, 'ul', { class: 'pj-need-list' });
      for (const n of e.needs) ul.append(needRow(doc, n));
      needs.append(ul);
      card.append(needs);
    } else if (e.status === 'active' || e.status === 'open') card.append(el(doc, 'p', { class: 'pj-note' }, T.nothingLeft));
  }
  const acts = el(doc, 'div', { class: 'pj-acts' });
  const button = (act, label, { disabled = false, tip = '' } = {}) => {
    const b = el(doc, 'button', { type: 'button', class: 'content-action-btn', dataset: { pjAct: act }, title: tip || null }, label);
    b.disabled = disabled;
    b.addEventListener('click', () => o.onAction?.(act, e));
    acts.append(b);
    return b;
  };
  if (e.place) {
    button('route', T.destination, { tip: e.placeTip || '' });
    const tp = o.teleport ? o.teleport(e) : null;
    if (tp?.show) button('teleport', tp.label || T.teleport, { disabled: !tp.ok, tip: tp.ok ? tp.tip || '' : tp.reason || '' });
    button('map', T.showMap);
  }
  if (acts.childElementCount) card.append(acts);
  return card;
}

/**
 * Draw the list into the panel.
 * @param {Document} doc
 * @param {{ active: object[], done: object[], fresh: number }} list projectList's answer
 * @param {{ now?: number, meta?: string, teleport?: Function, onAction?: Function, openNeeds?: Set<string> }} o
 */
export function renderProjects(doc, list, o = {}) {
  const box = doc.getElementById('projects-list');
  if (!box) return;
  last = { doc, list, o };
  const now = o.now ?? Date.now();
  const scroll = box.parentElement?.scrollTop || 0;
  box.replaceChildren();
  const ahead = aheadBoxes.get(doc) || null;
  const featured = list?.featured || null;
  // The featured project shows once, at the top (G656).
  const active = (list?.active || []).filter((e) => !featured || e.jobId !== featured.jobId);
  const done = list?.done || [];
  const counts = { open: active.length + (featured ? 1 : 0), done: done.length };
  counts.all = counts.open + counts.done;
  const filter = projectsFilter(counts, picked.get(doc) || keptFilter(viewerStore(o)));
  const bar = doc.getElementById('projects-filters');
  if (bar) {
    bar.hidden = !counts.all;
    for (const chip of bar.children) {
      const id = chip.dataset?.pjFilter;
      if (!id) continue;
      const on = id === filter;
      chip.className = `skill-tree-chip${on ? ' is-active' : ''}`;
      chip.setAttribute('aria-selected', String(on));
      const n = chip.children.find?.((c) => c.tagName === 'B') || chip.querySelector?.('b');
      if (n) n.textContent = String(counts[id]);
    }
  }
  box.dataset.pjFilter = filter;
  // G1210: Status or Region; the chips show once there are two projects to order.
  const sort = pickedSort.get(doc) || keptSort(viewerStore(o));
  const sorts = doc.getElementById('projects-sorts');
  if (sorts) {
    sorts.hidden = active.length + done.length < 2;
    for (const chip of sorts.children) {
      const id = chip.dataset?.pjSort;
      if (!id) continue;
      chip.className = `skill-tree-chip${id === sort ? ' is-active' : ''}`;
      chip.setAttribute('aria-checked', String(id === sort));
    }
  }
  box.dataset.pjSort = sort;
  const showOpen = filter !== 'done';
  const showDone = filter !== 'open';
  if (featured && showOpen) {
    const sec = el(doc, 'section', { class: 'pj-section', dataset: { pjSection: 'featured' }, 'aria-label': T.featured });
    sec.append(el(doc, 'h3', { class: 'pj-section-title' }, T.featured));
    if (T.featuredCopy) sec.append(el(doc, 'p', { class: 'pj-note' }, T.featuredCopy));
    sec.append(projectCard(doc, featured, { ...o, now }));
    box.append(sec);
  }
  if (!active.length && !done.length) {
    if (!featured) box.append(el(doc, 'p', { class: 'pj-empty' }, T.empty));
    if (ahead) box.append(ahead);
  } else {
    const section = (name, rows, empty, kind) => {
      const sec = el(doc, 'section', { class: 'pj-section', dataset: { pjSection: kind }, 'aria-label': name });
      sec.append(el(doc, 'h3', { class: 'pj-section-title' }, `${name} ${rows.length}`));
      if (!rows.length) sec.append(el(doc, 'p', { class: 'pj-empty' }, empty));
      if (sort === 'region') {
        for (const g of byRegion(rows)) {
          sec.append(el(doc, 'h4', { class: 'pj-region', dataset: { pjRegion: g.region } }, g.region || 'Elsewhere'));
          for (const e of g.rows) sec.append(projectCard(doc, e, { ...o, now }));
        }
      } else for (const e of rows) sec.append(projectCard(doc, e, { ...o, now }));
      box.append(sec);
    };
    if (showOpen) section(T.active, active, T.noneActive, 'active');
    // G801: the roads to a region, after what is open; never under Done.
    if (showOpen && ahead) box.append(ahead);
    if (showDone) section(T.done, done, T.noneDone, 'done');
  }
  const meta = doc.getElementById('projects-meta');
  if (meta) meta.textContent = o.meta || '';
  if (box.parentElement) box.parentElement.scrollTop = scroll;
}
