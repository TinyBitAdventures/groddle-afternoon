/**
 * Groddle Field Notes · Every change. Renders ../history.json (written by
 * tools/build-restoration.mjs from the git log): every 📦 NEW, 👌 IMPROVE
 * and 🐛 FIX commit, grouped by day, with a kind filter and a search box.
 * #new, #improve or #fix in the address opens that filter; #d-<yyyy-mm-dd>
 * scrolls to that day.
 */

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

const dayName = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

const log = await (await fetch('../history.json', { cache: 'no-cache' })).json();
const changes = log.changes || [];
let kind = ['new', 'improve', 'fix'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'all';
let query = '';

const counts = { new: 0, improve: 0, fix: 0 };
for (const c of changes) counts[c.kind] += 1;
$('#stats').textContent = `${fmt(changes.length)} changes since ${log.since ? dayName(log.since) : 'the start'}: ${fmt(counts.new)} new, ${fmt(counts.improve)} better, ${fmt(counts.fix)} fixed.`;
$('#foot-meta').textContent = `Generated from the repository on ${log.generatedAt || 'build'}.`;

const chips = [];
for (const [id, label] of [['all', 'Everything'], ['new', 'New'], ['improve', 'Better'], ['fix', 'Fixed']]) {
  const chip = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(id === kind), onclick: () => {
    kind = id;
    window.history.replaceState(null, '', id === 'all' ? location.pathname : `#${id}`);
    render();
  } }, id === 'all' ? null : el('span', { class: `dot kind-dot-${id}` }), label,
  el('span', { class: 'count' }, fmt(id === 'all' ? changes.length : counts[id])));
  chip.dataset.kind = id;
  chips.push(chip);
  $('#kind-filter').append(chip);
}

let timer = 0;
$('#q').addEventListener('input', (e) => {
  clearTimeout(timer);
  timer = setTimeout(() => { query = e.target.value.trim().toLowerCase(); render(); }, 120);
});

function matches(c) {
  if (kind !== 'all' && c.kind !== kind) return false;
  if (!query) return true;
  return c.text.toLowerCase().includes(query) || c.details.some((d) => d.toLowerCase().includes(query));
}

function render() {
  for (const chip of chips) chip.setAttribute('aria-pressed', String(chip.dataset.kind === kind));
  const days = new Map();
  for (const c of changes) {
    if (!matches(c)) continue;
    if (!days.has(c.date)) days.set(c.date, []);
    days.get(c.date).push(c);
  }
  const root = $('#days');
  root.replaceChildren(...[...days].map(([date, list]) => el('section', { class: 'history-day', 'aria-labelledby': `d-${date}` },
    el('h2', { id: `d-${date}` }, dayName(date), el('span', { class: 'history-day-count' }, ` · ${list.length} ${list.length === 1 ? 'change' : 'changes'}`)),
    el('ol', { class: 'history-list' }, list.map((c) => el('li', { class: 'history-item' },
      el('span', { class: `kind kind-${c.kind}` }, KINDS[c.kind]),
      c.details.length
        ? el('details', {}, el('summary', {}, c.text), el('ul', { class: 'history-details' }, c.details.map((d) => el('li', {}, d))),
          el('p', { class: 'history-hash' }, `commit ${c.hash}`))
        : el('p', { class: 'history-text' }, c.text)))))));
  $('#empty').hidden = days.size > 0;
}

render();

// #d-2026-10-19 (a day link from the Notes blog) scrolls once the days exist.
const day = /^#d-\d{4}-\d{2}-\d{2}$/.test(location.hash) && document.getElementById(location.hash.slice(1));
if (day) day.closest('section').scrollIntoView();
