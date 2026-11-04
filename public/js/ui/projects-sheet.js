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
 * [data-pj-act="route|teleport|map"], [data-pj-needs], #projects-meta, #projects-close.
 */

import { PROJECTS_TEXT as T, shareLine, statusLine } from '../projects-tracker.js?v=f46bfff9';

export const PROJECTS_PANEL_ID = 'projects-panel';
const ICON = 'assets/sprites/street-jobs/sign_stake.png';

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
    class: `pj-card${e.finished ? ' is-done' : ''}${e.isNew ? ' is-new' : ''}`,
    dataset: { project: e.jobId, status: e.status, ...(e.isNew ? { new: '1' } : {}) },
  });
  const head = el(doc, 'div', { class: 'pj-head' });
  const title = el(doc, 'h3', { class: 'pj-title' }, e.title);
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
      needs.append(el(doc, 'summary', {}, `${T.needs} (${e.needs.length})`));
      const ul = el(doc, 'ul');
      for (const n of e.needs) {
        const li = el(doc, 'li', { class: n.open ? '' : 'is-later', dataset: { need: n.id } }, n.text);
        if (!n.open) li.append(el(doc, 'span', { class: 'pj-later' }, ` (${T.later})`));
        ul.append(li);
      }
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
  const active = list?.active || [];
  const done = list?.done || [];
  if (!active.length && !done.length) {
    box.append(el(doc, 'p', { class: 'pj-empty' }, T.empty));
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
