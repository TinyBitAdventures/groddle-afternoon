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
 */

import { PROJECTS_TEXT as T, shareLine, statusLine } from '../projects-tracker.js?v=30bdd34d';
import { featuredTag } from './featured-project.js?v=46c958b3';

export const PROJECTS_PANEL_ID = 'projects-panel';
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
  body.append(el(doc, 'div', { id: 'projects-list', class: 'projects-list', 'data-projects-list': '', 'aria-live': 'polite' }));
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
    dataset: { project: e.jobId, status: e.status, ...(e.isNew ? { new: '1' } : {}), ...(e.featured ? { featured: '1' } : {}) },
  });
  const head = el(doc, 'div', { class: 'pj-head' });
  const title = el(doc, 'h3', { class: 'pj-title' });
  if (e.featured) title.append(featuredTag(doc), doc.createTextNode(' '));
  title.append(doc.createTextNode(e.title));
  if (e.isNew) title.append(doc.createTextNode(' '), el(doc, 'span', { class: 'pj-new' }, T.newMark));
  head.append(title, el(doc, 'p', { class: 'pj-where' }, statusLine(e, now)));
  card.append(head);
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
    if (!e.known) card.append(el(doc, 'p', { class: 'pj-note' }, T.unknown));
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
  const now = o.now ?? Date.now();
  const scroll = box.parentElement?.scrollTop || 0;
  box.replaceChildren();
  const featured = list?.featured || null;
  // The featured project shows once, at the top (G656).
  const active = (list?.active || []).filter((e) => !featured || e.jobId !== featured.jobId);
  const done = list?.done || [];
  if (featured) {
    const sec = el(doc, 'section', { class: 'pj-section', dataset: { pjSection: 'featured' }, 'aria-label': T.featured });
    sec.append(el(doc, 'h3', { class: 'pj-section-title' }, T.featured));
    if (T.featuredCopy) sec.append(el(doc, 'p', { class: 'pj-note' }, T.featuredCopy));
    sec.append(projectCard(doc, featured, { ...o, now }));
    box.append(sec);
  }
  if (!active.length && !done.length) {
    if (!featured) box.append(el(doc, 'p', { class: 'pj-empty' }, T.empty));
  } else {
    const section = (name, rows, empty, kind) => {
      const sec = el(doc, 'section', { class: 'pj-section', dataset: { pjSection: kind }, 'aria-label': name });
      sec.append(el(doc, 'h3', { class: 'pj-section-title' }, `${name} ${rows.length}`));
      if (!rows.length) sec.append(el(doc, 'p', { class: 'pj-empty' }, empty));
      for (const e of rows) sec.append(projectCard(doc, e, { ...o, now }));
      box.append(sec);
    };
    section(T.active, active, T.noneActive, 'active');
    section(T.done, done, T.noneDone, 'done');
  }
  const meta = doc.getElementById('projects-meta');
  if (meta) meta.textContent = o.meta || '';
  if (box.parentElement) box.parentElement.scrollTop = scroll;
}
