/**
 * Groddle Field Notes · Compare. Renders compare.json (hand-researched facts
 * about other Glitch remakes, each with a source and a checked date) next to
 * Groddle Afternoon's own column, which is computed at runtime from
 * ../restoration/data.json so it stays in step with development.
 */

import { STATUS_KEYS, oursCell, oursNumbers, tallyColumn } from './compare-data.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) node.append(kid);
  return node;
};
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const longDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const isExternal = (url) => /^https?:/.test(url);
const linkAttrs = (url) => (isExternal(url) ? { href: url, target: '_blank', rel: 'noopener noreferrer' } : { href: url });

/* —— Theme ———————————————————————————— */
function setupTheme() {
  const root = document.documentElement;
  const button = $('#theme-toggle');
  const order = ['auto', 'light', 'dark'];
  const labels = { auto: 'Theme: auto', light: 'Theme: light', dark: 'Theme: dark' };
  let mode = 'auto';
  try { mode = localStorage.getItem('groddle-compare-theme') || 'auto'; } catch { /* storage blocked */ }
  const apply = () => {
    if (mode === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    $('.theme-toggle-text', button).textContent = labels[mode];
    button.setAttribute('aria-label', `${labels[mode]}. Switch colour theme`);
  };
  button.addEventListener('click', () => {
    mode = order[(order.indexOf(mode) + 1) % order.length];
    try { localStorage.setItem('groddle-compare-theme', mode); } catch { /* storage blocked */ }
    apply();
  });
  apply();
}

/* —— Sources (numbered once, in first-use order) ———————————————— */
function makeSourceIndex(data) {
  const order = [];
  const number = (id) => {
    if (!data.sources[id]) throw new Error(`Unknown source ${id}`);
    let i = order.indexOf(id);
    if (i < 0) { order.push(id); i = order.length - 1; }
    return i + 1;
  };
  const refs = (ids) => (ids || []).map((id) => {
    const n = number(id);
    const s = data.sources[id];
    return el('sup', { class: 'ref' }, el('a', { href: `#src-${n}`, title: `${s.title}. Checked ${s.checked}.` }, String(n)));
  });
  return { order, number, refs };
}

/* —— Project cards ———————————————————————————— */
function renderCards(data, restoration, src) {
  const cards = $('#cards');
  for (const p of data.projects) {
    const facts = el('dl', { class: 'facts' }, p.facts.map((f) => [
      el('dt', {}, f.label),
      el('dd', {}, f.text, ' ', src.refs(f.sources)),
    ]));
    let numbers = null;
    if (p.ours && restoration) {
      numbers = el('ul', { class: 'card-numbers', 'aria-label': 'Counted from the repository' },
        oursNumbers(restoration).map((n) => el('li', {},
          el('b', {}, fmt(n.num), n.of != null ? el('small', {}, ` / ${fmt(n.of)}`) : null),
          el('span', {}, n.label, n.note ? `, ${n.note}` : ''))));
    }
    cards.append(el('article', { class: `card${p.ours ? ' card-ours' : ''}`, id: `project-${p.id}`, 'aria-labelledby': `project-${p.id}-h` },
      el('div', { class: 'card-head' },
        el('p', { class: 'card-kicker' }, `${p.approach} · ${p.years}`),
        el('h3', { id: `project-${p.id}-h` }, p.name),
        el('span', { class: 'pill', style: `--tone:var(--${p.badge.tone})` }, p.badge.label)),
      el('p', { class: 'card-summary' }, p.summary),
      numbers,
      facts,
      el('p', { class: 'card-link' }, el('a', linkAttrs(p.link.url), p.link.label, isExternal(p.link.url) ? el('span', { class: 'ext', 'aria-hidden': 'true' }, ' ↗') : null))));
  }
  const others = $('#others-list');
  for (const o of data.others) {
    others.append(el('li', {}, el('a', linkAttrs(o.url), o.name), `: ${o.text} `, el('span', { class: 'checked' }, `Checked ${o.checked}.`)));
  }
}

/* —— Matrix ———————————————————————————— */
function renderMatrix(data, restoration, src) {
  const table = $('#matrix-table');
  const projects = data.projects;
  const statuses = data.statuses;

  $('#matrix-legend').append(...STATUS_KEYS.map((k) => el('li', {},
    el('span', { class: `mark mark-${k}`, 'aria-hidden': 'true' }, statuses[k].mark),
    el('b', {}, statuses[k].label), ` ${statuses[k].desc}`)));

  // Resolve every cell first, so the header can carry a tally.
  const grid = data.rows.map((row) => projects.map((p) => {
    if (p.ours) {
      if (!restoration) return { status: 'unknown', note: 'The restoration data could not be loaded.', sources: ['ga-restoration'] };
      const c = oursCell(row, restoration);
      return { ...c, sources: ['ga-restoration'], ours: true };
    }
    return row.cells[p.id];
  }));
  // Number the matrix's sources in reading order, after the cards' own.
  for (const r of grid) for (const c of r) for (const id of c.sources || []) src.number(id);

  const head = el('tr', {}, el('th', { scope: 'col', class: 'col-system' }, 'System'),
    projects.map((p, pi) => {
      const t = tallyColumn(grid.map((r) => r[pi]));
      return el('th', { scope: 'col', class: p.ours ? 'col-ours' : '' },
        el('a', { href: `#project-${p.id}` }, p.name),
        el('span', { class: 'col-tally' }, `${t.yes} yes · ${t.partial} partly`));
    }));
  $('thead', table).append(head);

  const body = $('tbody', table);
  data.rows.forEach((row, ri) => {
    const tr = el('tr', {}, el('th', { scope: 'row' }, row.name));
    projects.forEach((p, pi) => {
      const cell = grid[ri][pi];
      const st = statuses[cell.status];
      const button = el('button', {
        type: 'button',
        class: `cell cell-${cell.status}`,
        'aria-haspopup': 'dialog',
        'aria-label': `${p.name}, ${row.name}: ${st.label}. Show detail and source.`,
      }, el('span', { class: `mark mark-${cell.status}`, 'aria-hidden': 'true' }, st.mark), el('span', { class: 'cell-label' }, st.label));
      button.addEventListener('click', (e) => openNote(e.currentTarget, { project: p, row, cell, data, src, pinned: true }));
      button.addEventListener('mouseenter', (e) => {
        if (!canHover() || pinned) return;
        clearTimeout(closeTimer);
        openNote(e.currentTarget, { project: p, row, cell, data, src, pinned: false });
      });
      button.addEventListener('mouseleave', () => {
        if (pinned) return;
        clearTimeout(closeTimer);
        closeTimer = setTimeout(() => { if (!pinned) closeNote(); }, 160);
      });
      tr.append(el('td', { class: p.ours ? 'col-ours' : '' }, button));
    });
    body.append(tr);
  });

  $('#matrix-foot').textContent = restoration
    ? `Groddle Afternoon's column is read live from the restoration report (generated ${restoration.generatedAt}). Systems adapted for one player count as partly.`
    : 'The restoration data did not load, so Groddle Afternoon\'s column shows unknown.';
}

/* —— Cell note popover ———————————————————————————— */
let pinned = false;
let anchor = null;
let closeTimer = 0;
// Hover previews only where there is a real pointer and room for a popover;
// on phones the note is a bottom sheet opened by tapping.
const canHover = () => matchMedia('(hover: hover) and (min-width: 641px)').matches;
function openNote(button, { project, row, cell, data, src, pinned: pin }) {
  const box = $('#cell-note');
  const st = data.statuses[cell.status];
  pinned = pin;
  anchor = button;
  $('#cell-note-kicker').textContent = `${project.name} · ${row.name}`;
  $('#cell-note-title').replaceChildren(el('span', { class: `mark mark-${cell.status}`, 'aria-hidden': 'true' }, st.mark), ` ${st.label}`);
  $('#cell-note-text').textContent = cell.note;
  const list = $('#cell-note-sources');
  list.replaceChildren(...(cell.sources || []).map((id) => {
    const s = data.sources[id];
    const n = src.number(id);
    const href = id === 'ga-restoration' ? '../restoration/#systems' : s.url;
    return el('li', {}, el('a', linkAttrs(href), s.title), el('span', { class: 'checked' }, ` [${n}] Checked ${s.checked}.`));
  }));
  if (!(cell.sources || []).length) list.append(el('li', { class: 'checked' }, `No public source found as of ${data.checked}.`));
  box.hidden = false;
  box.classList.toggle('is-pinned', pin);
  place(box, button);
  if (pin) $('.cell-note-close', box).focus({ preventScroll: true });
}
function place(box, button) {
  if (matchMedia('(max-width: 640px)').matches) {
    box.style.left = '';
    box.style.top = '';
    box.classList.add('is-sheet');
    return;
  }
  box.classList.remove('is-sheet');
  const r = button.getBoundingClientRect();
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
  let top = r.bottom + 8;
  if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 8);
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
}
function closeNote({ restoreFocus = false } = {}) {
  const box = $('#cell-note');
  if (box.hidden) return;
  box.hidden = true;
  if (restoreFocus && pinned && anchor) anchor.focus({ preventScroll: true });
  pinned = false;
}
function setupNote() {
  const box = $('#cell-note');
  $('.cell-note-close', box).addEventListener('click', () => closeNote({ restoreFocus: true }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNote({ restoreFocus: true }); });
  document.addEventListener('pointerdown', (e) => {
    if (box.hidden || box.contains(e.target) || e.target.closest?.('.cell')) return;
    closeNote();
  });
  box.addEventListener('mouseenter', () => { clearTimeout(closeTimer); if (!box.hidden) { pinned = true; box.classList.add('is-pinned'); } });
  const reflow = () => { if (!box.hidden && anchor) place(box, anchor); };
  window.addEventListener('resize', reflow);
  $('#matrix-scroll').addEventListener('scroll', reflow, { passive: true });
  window.addEventListener('scroll', reflow, { passive: true });
}

/* —— Resources + sources list ———————————————————————————— */
function renderResources(data) {
  $('#resources').append(...data.resources.map((r) => el('li', {},
    el('a', linkAttrs(r.url), r.name, el('span', { class: 'ext', 'aria-hidden': 'true' }, ' ↗')),
    el('p', {}, r.text, ' ', el('span', { class: 'checked' }, `Checked ${r.checked}.`)))));
}
function renderSources(data, src) {
  // Number any source not yet cited (so every one in compare.json is listed).
  for (const id of Object.keys(data.sources)) src.number(id);
  $('#sources').append(...src.order.map((id, i) => {
    const s = data.sources[id];
    return el('li', { id: `src-${i + 1}` }, el('a', linkAttrs(s.url), s.title), ' ', el('span', { class: 'checked' }, `Checked ${s.checked}.`));
  }));
}

async function load(url) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`compare: could not load ${url}`, err);
    return null;
  }
}

setupTheme();
const [data, restoration] = await Promise.all([load('compare.json'), load('../restoration/data.json')]);
if (data) {
  $('#checked-date').textContent = longDate(data.checked);
  $('#checked-date').setAttribute('datetime', data.checked);
  const src = makeSourceIndex(data);
  renderCards(data, restoration, src);
  renderMatrix(data, restoration, src);
  setupNote();
  renderResources(data);
  renderSources(data, src);
  document.body.dataset.ready = 'true';
}
