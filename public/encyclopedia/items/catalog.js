/**
 * The item catalog grid: draws every item in ./data.json (written by
 * tools/catalog/build.mjs) once, then filters by toggling `hidden`, so typing
 * and clicking never rebuild the list. Icons load lazily with fixed sizes, and
 * the filters live in the address (?q=&status=&cat=&get=&sold=) so a link can
 * open the catalog already filtered (?sold=<key> opens one vendor's stock). The
 * Category and Sold by selects are drawn as themed comboboxes (./combobox.js).
 */
import { combobox } from './combobox.js?v=f2510e19';

const ICONS = '../../assets/sprites/icons/';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => n.toLocaleString('en-US');
/** Statuses the encyclopedia counts as in the remake (tools/encyclopedia/parts.mjs STATUS): the page's headline and this count agree. */
const IN_REMAKE = new Set(['source', 'rebuilt', 'reimagined', 'solo', 'partial', 'multiplayer']);
/** Lower case, accents and punctuation folded, for search. */
const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ');

const state = { q: '', status: '', cat: '', get: new Set(), sold: '' };

function readUrl() {
  const p = new URLSearchParams(location.search);
  state.q = p.get('q') || '';
  state.status = p.get('status') || '';
  state.cat = p.get('cat') || '';
  state.sold = p.get('sold') || '';
  state.get = new Set((p.get('get') || '').split(',').filter(Boolean));
}

function writeUrl() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.status) p.set('status', state.status);
  if (state.cat) p.set('cat', state.cat);
  if (state.get.size) p.set('get', [...state.get].join(','));
  if (state.sold) p.set('sold', state.sold);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function card(item, statusLabel) {
  const icon = item.icon
    ? `<img class="cat-ic" src="${ICONS}${item.id}.webp"${item.icon === 3 ? ` srcset="${ICONS}${item.id}.webp 1x, ${ICONS}${item.id}@3x.webp 3x"` : ''} alt="" width="52" height="52" loading="lazy" decoding="async" />`
    : '<span class="cat-ic cat-ph" aria-hidden="true"></span>';
  // Never released in Glitch (tools/encyclopedia/never-released.mjs): a small tag over the picture.
  const tag = item.nr ? '<span class="ency-unreleased cat-card-tag">Never released<span class="ency-sep">,</span></span> ' : '';
  return `<li><a class="cat-card${item.nr ? ' cat-card-nr' : ''}" href="${item.id}/" title="${esc(item.name)}">${tag}${icon}<span class="cat-name">${esc(item.name)}<span class="ency-sep">,</span></span> <span class="cat-st st-${item.status}">${statusLabel[item.status]}</span></a></li>`;
}

async function main() {
  const res = await fetch('data.json');
  const data = await res.json();
  const statusLabel = Object.fromEntries(data.statuses.map((s) => [s.key, s.label]));
  const grid = $('grid');
  grid.innerHTML = data.items.map((item) => card(item, statusLabel)).join('');
  const rows = [...grid.children];
  const hay = data.items.map((i) => fold(`${i.name} ${i.id} ${i.id.replace(/_/g, ' ')} ${i.desc}`));

  const search = $('q');
  const cat = $('cat');
  const sold = $('sold');
  const statusChips = [...document.querySelectorAll('[data-status]')];
  const getChips = [...document.querySelectorAll('[data-get]')];

  readUrl();
  if (state.cat && ![...cat.options].some((o) => o.value === state.cat)) state.cat = '';
  if (state.sold && ![...sold.options].some((o) => o.value === state.sold)) state.sold = '';
  search.value = state.q;
  cat.value = state.cat;
  sold.value = state.sold;
  // Themed comboboxes over the two selects (./combobox.js): the selects stay the state and fire change.
  combobox(cat);
  combobox(sold);

  let frame = 0;
  const apply = () => {
    frame = 0;
    const words = fold(state.q).split(' ').filter(Boolean);
    let shown = 0;
    let inRemake = 0;
    data.items.forEach((item, i) => {
      const ok = (!state.status || item.status === state.status)
        && (!state.cat || item.category === state.cat)
        && (!state.sold || item.sold.includes(state.sold))
        && (!state.get.size || item.get.some((g) => state.get.has(g)))
        && words.every((w) => hay[i].includes(w));
      if (rows[i].hidden === ok) rows[i].hidden = !ok;
      if (ok) { shown += 1; if (IN_REMAKE.has(item.status)) inRemake += 1; }
    });
    for (const c of statusChips) c.setAttribute('aria-pressed', String(c.dataset.status === state.status));
    for (const c of getChips) c.setAttribute('aria-pressed', String(state.get.has(c.dataset.get)));
    const total = data.items.length;
    $('count').textContent = shown === total
      ? `${fmt(total)} items, ${fmt(inRemake)} of them in the remake`
      : `${fmt(shown)} of ${fmt(total)} items shown, ${fmt(inRemake)} of them in the remake`;
    $('empty').hidden = shown > 0;
    writeUrl();
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };

  search.addEventListener('input', () => { state.q = search.value; schedule(); });
  cat.addEventListener('change', () => { state.cat = cat.value; schedule(); });
  sold.addEventListener('change', () => { state.sold = sold.value; schedule(); });
  for (const c of statusChips) c.addEventListener('click', () => { state.status = c.dataset.status; schedule(); });
  for (const c of getChips) {
    c.addEventListener('click', () => {
      if (state.get.has(c.dataset.get)) state.get.delete(c.dataset.get);
      else state.get.add(c.dataset.get);
      schedule();
    });
  }
  apply();
}

main().catch(() => {
  $('count').textContent = 'The item list could not be loaded.';
});
