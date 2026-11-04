/**
 * Groddle Field Notes · Every change. Renders ../history.json (written by
 * tools/build-restoration.mjs from the git log): every 📦 NEW, 👌 IMPROVE
 * and 🐛 FIX commit, grouped by day, with a kind filter and a search box,
 * under a heatmap of every commit of the game, site and server by day
 * (heatmap.js). Picking a day lists only that day's changes.
 * #new, #improve or #fix in the address opens that filter, #day=<yyyy-mm-dd>
 * that day (both: #fix&day=2026-11-04); #d-<yyyy-mm-dd> scrolls to that day.
 */
import {
  dayName, dayTotals, daySpan, describeDay, describeDayLabel, formatHash, groupChanges,
  levelOf, levelRanges, levelSteps, listedCount, monthLabels, parseHash, selectableDay, shortDate, stepDay, weekColumns,
} from './heatmap.js?v=bb1775c2';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) node.append(kid);
  return node;
};
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const KINDS = { new: 'New', improve: 'Better', fix: 'Fixed' };
const changeWord = (n) => `${fmt(n)} ${n === 1 ? 'change' : 'changes'}`;

const log = await (await fetch('../history.json', { cache: 'no-cache' })).json();
const changes = log.changes || [];
const activity = log.activity && log.activity.days ? log.activity : null;
let { kind, day } = parseHash(location.hash);
if (!selectableDay(day, activity, changes)) day = '';
let query = '';

const counts = { new: 0, improve: 0, fix: 0 };
for (const c of changes) counts[c.kind] += 1;
$('#stats').textContent = `${fmt(changes.length)} changes since ${log.since ? dayName(log.since) : 'the start'}: ${fmt(counts.new)} new, ${fmt(counts.improve)} better, ${fmt(counts.fix)} fixed.`;
$('#foot-meta').textContent = `Generated from the repository on ${log.generatedAt || 'build'}.`;

const syncHash = () => {
  const hash = formatHash({ kind, day });
  window.history.replaceState(null, '', hash || location.pathname + location.search);
};

const chips = [];
for (const [id, label] of [['all', 'Everything'], ['new', 'New'], ['improve', 'Better'], ['fix', 'Fixed']]) {
  const chip = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(id === kind), onclick: () => {
    kind = id;
    syncHash();
    render();
  } }, id === 'all' ? null : el('span', { class: `dot kind-dot-${id}` }), label,
  el('span', { class: 'count' }));
  chip.dataset.kind = id;
  chips.push(chip);
  $('#kind-filter').append(chip);
}

let timer = 0;
$('#q').addEventListener('input', (e) => {
  clearTimeout(timer);
  timer = setTimeout(() => { query = e.target.value.trim().toLowerCase(); render(); }, 120);
});

function render() {
  // The chips count what the picked day holds (every day's when none is picked).
  const shown = day ? changes.filter((c) => c.date === day) : changes;
  const dayCounts = { all: shown.length, new: 0, improve: 0, fix: 0 };
  for (const c of shown) dayCounts[c.kind] += 1;
  for (const chip of chips) {
    chip.setAttribute('aria-pressed', String(chip.dataset.kind === kind));
    chip.querySelector('.count').textContent = fmt(dayCounts[chip.dataset.kind]);
  }
  const days = groupChanges(changes, { kind, query, day });
  const root = $('#days');
  root.replaceChildren(...[...days].map(([date, list]) => el('section', { class: 'history-day', 'aria-labelledby': `d-${date}` },
    el('h2', { id: `d-${date}` }, dayName(date), el('span', { class: 'history-day-count' }, ` · ${changeWord(list.length)}`)),
    el('ol', { class: 'history-list' }, list.map((c) => el('li', { class: 'history-item' },
      el('span', { class: `kind kind-${c.kind}` }, KINDS[c.kind]),
      c.details.length
        ? el('details', {}, el('summary', {}, c.text), el('ul', { class: 'history-details' }, c.details.map((d) => el('li', {}, d))),
          el('p', { class: 'history-hash' }, `commit ${c.hash}`))
        : el('p', { class: 'history-text' }, c.text)))))));
  const empty = $('#empty');
  empty.hidden = days.size > 0;
  if (!day) empty.textContent = 'No changes match that search.';
  else if (shown.length) empty.textContent = `No changes on ${dayName(day)} match that filter.`;
  else {
    const t = activity ? dayTotals(activity, day) : null;
    empty.textContent = t && t.total
      ? `No player-visible changes on ${dayName(day)}: its ${fmt(t.total)} ${t.total === 1 ? 'commit was' : 'commits were'} docs, tests, releases or work on the site and server.`
      : `No changes on ${dayName(day)}.`;
  }
  const bar = $('#day-filter');
  bar.hidden = !day;
  if (day) {
    $('#day-filter-name').textContent = dayName(day);
    $('#day-filter-count').textContent = ` · ${changeWord(shown.length)}`;
  }
  heat.mark();
}

/* —— Heatmap —— */

const heat = { mark() {} };
const span = activity && daySpan(activity, log.generatedAt);

if (span) {
  const cols = weekColumns(span.from, span.to);
  const totals = {};
  const steps = levelSteps(Object.keys(activity.days).map((d) => dayTotals(activity, d).total));
  const months = monthLabels(cols);
  const grid = $('#heat-grid');
  const scroller = $('#heat-scroll');
  const tip = el('div', { class: 'heat-tip', id: 'heat-tip', 'aria-hidden': 'true', hidden: true });
  document.body.append(tip);
  const cells = new Map();
  let active = day || span.to;
  let tipFor = '';
  let pinned = false;

  // Fewer weeks get bigger cells, so a young project's graph is not a speck (about 600 px wide at most).
  grid.style.setProperty('--cell', `${Math.max(13, Math.min(30, Math.floor(600 / cols.length) - 4))}px`);

  const head = el('tr', {}, el('td', { class: 'heat-corner' }), months.map((m) => el('th', { scope: 'col', class: 'heat-month' }, m ? el('span', {}, m) : null)));
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const rows = WEEKDAYS.map((name, r) => el('tr', {},
    el('th', { scope: 'row', class: 'heat-weekday' }, r % 2 === 0 && r < 6
      ? el('span', { 'aria-hidden': 'true' }, name.slice(0, 3))
      : null, el('span', { class: 'visually-hidden' }, name)),
    cols.map((col) => {
      const date = col[r];
      if (!date) return el('td', { class: 'heat-pad', 'aria-hidden': 'true' });
      const t = dayTotals(activity, date);
      totals[date] = t;
      const cell = el('td', {
        class: 'heat-cell',
        role: 'gridcell',
        tabindex: '-1',
        'data-day': date,
        'data-level': String(levelOf(t.total, steps)),
        'aria-label': describeDayLabel(t),
        'aria-disabled': t.total ? null : 'true',
        'aria-selected': 'false',
      });
      cells.set(date, cell);
      return cell;
    })));
  grid.append(el('thead', {}, head), el('tbody', {}, rows));

  const ranges = levelRanges(steps);
  $('#heat-legend').append(
    el('span', { 'aria-hidden': 'true' }, 'Less'),
    el('ul', { 'aria-label': 'Colour scale' }, ranges.map((words, level) => el('li', { 'data-level': String(level), title: words }, el('span', { class: 'visually-hidden' }, words)))),
    el('span', { 'aria-hidden': 'true' }, 'More'),
  );
  const all = Object.values(totals);
  const sum = all.reduce((n, t) => n + t.total, 0);
  const repoNames = { game: 'game', site: 'site', server: 'server' };
  const names = activity.repos.map((r) => repoNames[r] || r);
  const across = names.length > 1 ? ` across the ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : ` to the ${names[0]}`;
  $('#heat-sum').textContent = `${fmt(sum)} commits${across}, ${shortDate(span.from)} to ${shortDate(span.to)}.`;

  // Scrolls the grid's own box (never the page) so a cell is in view.
  const reveal = (cell, center = false) => {
    const box = scroller.getBoundingClientRect();
    const r = cell.getBoundingClientRect();
    if (center) scroller.scrollLeft += r.left + r.width / 2 - (box.left + box.width / 2);
    else if (r.left < box.left) scroller.scrollLeft -= box.left - r.left + 4;
    else if (r.right > box.right) scroller.scrollLeft += r.right - box.right + 4;
  };
  let lastPointer = '';

  const setActive = (date, focus) => {
    cells.get(active)?.setAttribute('tabindex', '-1');
    active = date;
    const cell = cells.get(active);
    if (!cell) return;
    cell.setAttribute('tabindex', '0');
    if (focus) cell.focus({ preventScroll: true });
    reveal(cell);
  };

  const placeTip = () => {
    const cell = cells.get(tipFor);
    if (!cell || tip.hidden) return;
    const r = cell.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const left = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2));
    const above = r.top - h - 8;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(above >= 8 ? above : r.bottom + 8)}px`;
    tip.dataset.side = above >= 8 ? 'above' : 'below';
  };

  const showTip = (date) => {
    const t = totals[date];
    if (!t) return;
    const [title, ...lines] = describeDay(t);
    const listed = listedCount(activity, date);
    tip.replaceChildren(
      el('b', {}, title),
      ...lines.map((line) => el('span', {}, line)),
      t.total ? el('span', { class: 'heat-tip-list' }, listed
        ? `${changeWord(listed)} in the list${date === day ? ', shown below' : ''}`
        : 'Nothing player-visible in the list') : '',
    );
    tipFor = date;
    tip.hidden = false;
    placeTip();
  };
  const hideTip = () => {
    tip.hidden = true;
    tipFor = '';
    pinned = false;
  };

  const pick = (date) => {
    if (!totals[date]?.total) return;
    day = day === date ? '' : date;
    syncHash();
    render();
    $('#heat-live').textContent = day ? `Showing ${dayName(day)}, ${changeWord(changes.filter((c) => c.date === day).length)}` : 'Showing every day';
  };
  const clearDay = () => {
    if (!day) return;
    day = '';
    syncHash();
    render();
    $('#heat-live').textContent = 'Showing every day';
  };

  heat.show = (date) => { setActive(date, false); reveal(cells.get(date), true); };
  heat.mark = () => {
    for (const [date, cell] of cells) cell.setAttribute('aria-selected', String(date === day));
  };

  grid.addEventListener('pointerover', (e) => {
    const cell = e.target.closest('.heat-cell');
    if (cell && e.pointerType !== 'touch' && !pinned) showTip(cell.dataset.day);
  });
  grid.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'touch' || pinned) return;
    // A cell reached by keyboard keeps its numbers up; one the mouse clicked lets them go.
    const focused = document.activeElement;
    if (focused?.classList.contains('heat-cell') && focused.matches(':focus-visible')) showTip(focused.dataset.day);
    else hideTip();
  });
  grid.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; });
  grid.addEventListener('click', (e) => {
    const cell = e.target.closest('.heat-cell');
    if (!cell) return;
    setActive(cell.dataset.day, true);
    pick(cell.dataset.day);
    showTip(cell.dataset.day);
    // A tap keeps the numbers up until the next tap elsewhere (there is no hover on a touch screen).
    pinned = lastPointer === 'touch' || (!lastPointer && matchMedia('(hover: none)').matches);
    lastPointer = '';
  });
  grid.addEventListener('focusin', (e) => {
    const cell = e.target.closest('.heat-cell');
    if (!cell) return;
    if (cell.dataset.day !== active) setActive(cell.dataset.day, false);
    showTip(cell.dataset.day);
  });
  grid.addEventListener('focusout', (e) => {
    if (!grid.contains(e.relatedTarget) && !pinned) hideTip();
  });
  grid.addEventListener('keydown', (e) => {
    if (!e.target.closest('.heat-cell')) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(active);
      showTip(active);
      return;
    }
    if (e.key === 'Escape') return;
    const next = stepDay(active, e.key, span);
    if (next === active && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) return;
    e.preventDefault();
    setActive(next, true);
    showTip(next);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (e.target.closest?.('input, textarea, select')) return;
    if (day) clearDay();
    else if (!tip.hidden) hideTip();
  });
  document.addEventListener('pointerdown', (e) => {
    if (pinned && !e.target.closest('.heat-cell')) hideTip();
  });
  window.addEventListener('scroll', placeTip, { passive: true });
  scroller.addEventListener('scroll', placeTip, { passive: true });
  window.addEventListener('resize', placeTip);
  $('#day-clear').addEventListener('click', clearDay);

  $('#heat').hidden = false;
  setActive(active, false);
  // Start at the latest weeks when the grid is wider than its box (a phone).
  scroller.scrollLeft = scroller.scrollWidth;
  if (day && cells.get(day)) reveal(cells.get(day), true);
} else {
  $('#day-clear').addEventListener('click', () => {
    day = '';
    syncHash();
    render();
  });
}

window.addEventListener('hashchange', () => {
  const next = parseHash(location.hash);
  kind = next.kind;
  day = selectableDay(next.day, activity, changes) ? next.day : '';
  render();
  if (day) heat.show?.(day);
});

render();

// #d-2026-10-19 (a day link from the Notes blog) scrolls once the days exist.
const dayLink = /^#d-\d{4}-\d{2}-\d{2}$/.test(location.hash) && document.getElementById(location.hash.slice(1));
if (dayLink) dayLink.closest('section').scrollIntoView();
