/**
 * The encyclopedia's search (tools/encyclopedia/build.mjs writes the pages):
 *  - the home page (input[data-search]) loads search.json and shows matches
 *    from every section, items included, as tiles grouped by section, with a
 *    section filter; the query lives in the address (?q=&s=);
 *  - a section's list (input[data-filter], and select[data-group] drawn as the
 *    themed combobox of ./items/combobox.js) hides the tiles that do not match
 *    (?q=&g=), so the list it draws without JavaScript stays the source; on
 *    Music and sounds the status chips (a[data-st], anchors to the By status
 *    lists without JavaScript) filter it by status too (?st=);
 *  - a sound's page plays its synth stand-in (button[data-synth], shown only
 *    here) through the game's own recipes, loaded on the first press, and one
 *    player at a time.
 */
import { combobox } from './items/combobox.js?v=f2510e19';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => n.toLocaleString('en-US');
/** Lower case, accents and punctuation folded, for search. */
const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ');
const LIMIT = 60;

function filterList(input) {
  const tiles = [...document.querySelectorAll('li[data-name]')];
  const hay = tiles.map((li) => fold(li.dataset.name));
  const groups = [...document.querySelectorAll('.ency-group, .snd-sub')];
  const count = $('count');
  const chips = [...document.querySelectorAll('a[data-st]')];
  const inStatus = tiles.map((li) => li.dataset.status || '');
  let status = '';
  const total = tiles.length;
  const label = count.textContent.replace(/^[\d,]+ /, '');
  const pick = document.querySelector('select[data-group]');
  const inGroup = tiles.map((li) => li.closest('.ency-group')?.dataset.group || '');
  const run = () => {
    const words = fold(input.value).split(' ').filter(Boolean);
    const group = pick?.value || '';
    let shown = 0;
    tiles.forEach((li, i) => {
      const ok = (!group || inGroup[i] === group) && (!status || inStatus[i] === status) && words.every((w) => hay[i].includes(w));
      li.hidden = !ok;
      if (ok) shown += 1;
    });
    for (const g of groups) g.hidden = !g.querySelector('li[data-name]:not([hidden])');
    const p = new URLSearchParams();
    if (input.value) p.set('q', input.value);
    if (group) p.set('g', group);
    if (status) p.set('st', status);
    for (const c of chips) c.setAttribute('aria-pressed', String(c.dataset.st === status));
    history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
    count.textContent = shown === total ? `${fmt(total)} ${label}` : `${fmt(shown)} of ${fmt(total)} ${label}`;
  };
  const params = new URLSearchParams(location.search);
  if (params.get('q')) input.value = params.get('q');
  if (pick && [...pick.options].some((o) => o.value === params.get('g'))) pick.value = params.get('g');
  if (chips.some((c) => c.dataset.st === params.get('st'))) status = params.get('st');
  for (const c of chips) {
    c.setAttribute('role', 'button');
    c.setAttribute('aria-pressed', 'false');
    c.addEventListener('click', (ev) => {
      ev.preventDefault();
      status = status === c.dataset.st ? '' : c.dataset.st;
      run();
    });
  }
  input.addEventListener('input', run);
  if (pick) {
    pick.addEventListener('change', run);
    combobox(pick);
  }
  if (input.value || pick?.value || status) run();
}

/** A sound's synth stand-in, played with the game's own recipe (public/js/synth-sfx.js). */
function synthButtons() {
  let ctx = null;
  for (const b of document.querySelectorAll('button[data-synth]')) {
    b.hidden = false;
    b.addEventListener('click', async () => {
      const { playSynthRecipe } = await import(b.dataset.synthModule);
      ctx ||= new AudioContext();
      if (ctx.state === 'suspended') await ctx.resume();
      for (const a of document.querySelectorAll('audio')) a.pause();
      playSynthRecipe(ctx, ctx.destination, b.dataset.synth, { volume: 1.6 });
    });
  }
  // One recording at a time.
  document.addEventListener('play', (ev) => {
    for (const a of document.querySelectorAll('audio')) if (a !== ev.target) a.pause();
  }, true);
}

async function search(input) {
  const base = '../';
  const data = await (await fetch(input.dataset.search)).json();
  const label = Object.fromEntries(data.sections.map((s) => [s.key, s.label]));
  const inRemake = new Set(data.inRemake);
  const hay = data.entries.map((e) => fold(`${e.n} ${e.id.replace(/[_-]/g, ' ')} ${e.g || ''}`));
  const params = new URLSearchParams(location.search);
  input.value = params.get('q') || '';
  let section = params.get('s') || '';
  const chips = $('sections');
  chips.innerHTML = [['', 'All'], ...data.sections.map((s) => [s.key, s.label])]
    .map(([k, l]) => `<button type="button" class="chip" data-s="${esc(k)}" aria-pressed="${k === section}">${esc(l)}</button>`).join(' ');
  const tile = (e) => `<li><a class="ency-tile${inRemake.has(e.st) ? '' : ' ency-tile-out'}" href="${base}${e.h}"><span class="ency-tile-pic">${e.ic ? `<img class="ency-ic" src="${base}${esc(e.ic)}" alt="" loading="lazy" decoding="async" />` : '<span class="ency-ic cat-ph" aria-hidden="true"></span>'}</span> <span class="ency-tile-name">${esc(e.n)}<span class="ency-sep">,</span></span> <span class="ency-tile-sub"><span class="cat-st st-${esc(e.st)}">${esc(data.statuses[e.st] || e.st)}</span></span></a></li>`;
  const run = () => {
    const words = fold(input.value).split(' ').filter(Boolean);
    const p = new URLSearchParams();
    if (input.value) p.set('q', input.value);
    if (section) p.set('s', section);
    history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
    for (const c of chips.children) c.setAttribute('aria-pressed', String(c.dataset.s === section));
    chips.hidden = !words.length;
    $('cards').hidden = Boolean(words.length);
    if (!words.length) { $('results').innerHTML = ''; $('count').textContent = ''; return; }
    const hits = [];
    data.entries.forEach((e, i) => {
      if ((!section || e.s === section) && words.every((w) => hay[i].includes(w))) {
        // Names that start with the query first.
        hits.push({ e, rank: fold(e.n).startsWith(words[0]) ? 0 : 1 });
      }
    });
    hits.sort((a, b) => a.rank - b.rank);
    const groups = new Map();
    for (const { e } of hits) { if (!groups.has(e.s)) groups.set(e.s, []); groups.get(e.s).push(e); }
    $('count').textContent = hits.length ? `${fmt(hits.length)} match${hits.length === 1 ? '' : 'es'}` : 'Nothing matches. Try fewer words.';
    $('results').innerHTML = [...groups].map(([s, list]) => `<section class="ency-group"><h2>${esc(label[s])} <span class="count">${fmt(list.length)}</span></h2><ul class="ency-tiles ency-grid">${list.slice(0, LIMIT).map(tile).join('')}</ul>${list.length > LIMIT ? `<p class="cat-muted">${fmt(list.length - LIMIT)} more: add a word, or pick ${esc(label[s])} above.</p>` : ''}</section>`).join('');
  };
  let frame = 0;
  input.addEventListener('input', () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; run(); }); });
  chips.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-s]');
    if (!b) return;
    section = b.dataset.s;
    run();
  });
  run();
}

const filter = document.querySelector('input[data-filter]');
if (filter) filterList(filter);
if (document.querySelector('button[data-synth], audio')) synthButtons();
const box = document.querySelector('input[data-search]');
if (box) search(box).catch(() => { $('count').textContent = 'The search could not be loaded.'; });
