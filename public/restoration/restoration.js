/**
 * Groddle Field Notes · Restoration. Renders public/restoration/data.json,
 * which tools/build-restoration.mjs computes from the repo and
 * tools/restoration/checklist.mjs.
 */

import { dametimeParts } from '../js/game-day.js';

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
  for (const kid of kids.flat()) if (kid != null && kid !== false) node.append(kid);
  return node;
};
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const tone = (status, data) => `var(--${data.status[status]?.tone || 'stone'})`;

const STATUS_ORDER = ['source', 'rebuilt', 'reimagined', 'solo', 'progress', 'missing', 'lost'];

/* —— Scoreboard ———————————————————————————— */
function renderScore(data) {
  for (const node of document.querySelectorAll('[data-bind]')) node.textContent = fmt(data[node.dataset.bind]);
  const bar = $('#score-bar');
  const legend = $('#score-legend');
  const total = data.items.length;
  for (const status of STATUS_ORDER) {
    const n = data.tally[status] || 0;
    if (!n) continue;
    bar.append(el('span', { style: `width:${(n / total) * 100}%; background:${tone(status, data)}`, title: `${data.status[status].label}: ${n}` }));
    legend.append(el('li', {}, el('span', { class: 'dot', style: `background:${tone(status, data)}` }), el('b', {}, String(n)), data.status[status].label));
  }
}

/* —— Detail card ———————————————————————————— */
const tpl = () => $('#detail-tpl').content.firstElementChild.cloneNode(true);
function detailFor(item, data) {
  const node = tpl();
  const group = data.groups.find((g) => g.id === item.group);
  $('.detail-kicker', node).textContent = group?.name || '';
  $('.detail-title', node).textContent = item.name;
  const pill = $('.pill', node);
  pill.textContent = data.status[item.status].label;
  pill.style.setProperty('--tone', tone(item.status, data));
  $('.detail-blurb', node).textContent = item.blurb;
  const img = $('.detail-shot', node);
  if (item.shot) {
    img.src = item.shot;
    img.alt = `${item.name} in Groddle Afternoon`;
  } else img.hidden = true;
  const ev = $('.detail-evidence', node);
  if (item.evidence.length) for (const p of item.evidence) $('ul', ev).append(el('li', {}, p));
  else ev.remove();
  return node;
}

/* —— Diorama ———————————————————————————— */
function setupDiorama(data) {
  const frame = $('#diorama-frame');
  const stage = $('#diorama');
  const card = $('#spot-card');
  const fit = () => {
    const s = frame.clientWidth / 1200;
    stage.style.transform = `scale(${s})`;
    frame.style.height = `${440 * s}px`;
  };
  new ResizeObserver(fit).observe(frame);
  fit();

  // The live Dametime clock, from the game's own calendar (js/game-day.js).
  const clock = $('#d-clock');
  const tick = () => {
    const p = dametimeParts();
    clock.textContent = `${p.time} ${p.ampm}`;
  };
  tick();
  setInterval(tick, 10000);

  const show = (spot, button) => {
    const items = data.items.filter((it) => it.spot === spot);
    if (!items.length) return;
    for (const b of stage.querySelectorAll('.spot.is-active')) b.classList.remove('is-active');
    for (const b of stage.querySelectorAll(`.spot[data-spot="${spot}"]`)) b.classList.add('is-active');
    card.replaceChildren(...items.map((it) => detailFor(it, data)));
    if (window.matchMedia('(max-width: 980px)').matches && button) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  for (const button of stage.querySelectorAll('.spot')) {
    button.addEventListener('click', () => show(button.dataset.spot, button));
  }
  show('piggy');
}

/* —— Systems board ———————————————————————————— */
function setupBoard(data) {
  const filters = $('#filters');
  const groupsEl = $('#groups');
  let active = 'all';
  const chips = [];
  const addChip = (id, label, count) => {
    const chip = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(id === active), onclick: () => { active = id; apply(); } },
      id !== 'all' ? el('span', { class: 'dot', style: `background:${tone(id, data)}` }) : null,
      label, el('span', { class: 'count' }, String(count)));
    chip.dataset.status = id;
    chips.push(chip);
    filters.append(chip);
  };
  addChip('all', 'Everything', data.items.length);
  for (const s of STATUS_ORDER) if (data.tally[s]) addChip(s, data.status[s].label, data.tally[s]);

  for (const group of data.groups) {
    const items = data.items.filter((it) => it.group === group.id);
    const meter = el('div', { class: 'group-meter', 'aria-hidden': 'true' },
      STATUS_ORDER.map((s) => {
        const n = items.filter((it) => it.status === s).length;
        return n ? el('span', { style: `width:${(n / items.length) * 100}%; background:${tone(s, data)}` }) : null;
      }));
    const back = items.filter((it) => ['source', 'rebuilt', 'reimagined', 'solo'].includes(it.status)).length;
    groupsEl.append(el('section', { class: 'group', 'aria-label': group.name },
      el('h3', {}, group.name),
      el('p', { class: 'group-blurb' }, `${group.blurb} ${back} of ${items.length} back.`),
      meter,
      el('ul', { class: 'items' }, items.map((it) => {
        const st = data.status[it.status];
        const li = el('li', { class: 'item', style: `--tone:${tone(it.status, data)}`, 'data-status': it.status });
        const btn = el('button', { type: 'button', 'aria-expanded': 'false', onclick: () => {
          const open = li.classList.toggle('is-open');
          btn.setAttribute('aria-expanded', String(open));
        } },
        el('span', { class: 'check', 'aria-hidden': 'true' }, st.mark || ''),
        el('span', { class: 'item-name' }, it.name),
        el('span', { class: 'item-tag' }, st.short),
        el('span', { class: 'item-blurb' }, it.blurb),
        it.shot ? el('img', { class: 'item-shot', src: it.shot, alt: `${it.name} in Groddle Afternoon`, loading: 'lazy' }) : null);
        li.append(btn);
        return li;
      }))));
  }

  function apply() {
    for (const chip of chips) chip.setAttribute('aria-pressed', String(chip.dataset.status === active));
    for (const li of groupsEl.querySelectorAll('.item')) li.hidden = active !== 'all' && li.dataset.status !== active;
    for (const g of groupsEl.querySelectorAll('.group')) g.hidden = ![...g.querySelectorAll('.item')].some((li) => !li.hidden);
  }
}

/* —— Numbers ———————————————————————————— */
function renderNumbers(data) {
  const tiles = $('#tiles');
  const tile = (num, of, label, note, ratio) => el('div', { class: 'tile' },
    el('div', { class: 'tile-num' }, fmt(num), of != null ? el('small', {}, ` / ${fmt(of)}`) : null),
    el('p', { class: 'tile-label' }, label),
    el('p', { class: 'tile-note' }, note),
    ratio != null ? el('div', { class: 'tile-bar' }, el('span', { style: `width:${Math.min(100, ratio * 100)}%` })) : null);
  const q = data.quests;
  const s = data.skills;
  tiles.append(
    tile(q.playable, q.story, 'Quests you can play', 'Story, skill and adventure quests offered by the Magic Rock and friends.', q.playable / q.story),
    tile(data.rooms.built, data.rooms.total, 'Quest rooms rebuilt', 'Private quest instances, reconstructed one by one.', data.rooms.built / data.rooms.total),
    tile(data.streets.imported, null, 'Original streets', `Every street the public archive kept, across ${data.streets.hubs} regions, with their real geometry and art.`),
    tile(data.badges.officialArt, data.badges.total, 'Badges with original art', `${data.badges.reimaginedArt} were never archived, so their art is reimagined.`, data.badges.officialArt / data.badges.total),
    tile(s.counts.live || 0, s.total, 'Skills that work', 'Learnable with their real effects; the rest need other players or lost systems.', (s.counts.live || 0) / s.total),
    tile(data.imagination.counts.live || 0, data.imagination.total, 'Imagination cards in play', 'Upgrade cards whose effects are wired in.', (data.imagination.counts.live || 0) / data.imagination.total),
    tile(data.jobs.playableJobs, data.jobs.sourceJobs, 'Street projects', `Build-a-street jobs offered on ${fmt(data.jobs.offeringStreets)} streets.`, data.jobs.playableJobs / data.jobs.sourceJobs),
    tile(data.recipes.imported, null, 'Recipes', `From the original catalog; ${data.recipes.skipped} belong to tools or items that never shipped.`),
    tile(data.icons.items, null, 'Item icons', `${fmt(data.icons.sharp)} re-rendered at triple resolution from the original vector art.`),
    tile(data.sounds.musicTracks ?? data.sounds.ambientTracks, null, 'Music tracks', `The published soundtrack and ringtones. ${fmt(data.sounds.playable ?? data.sounds.withFile)} of ${fmt(data.sounds.keys)} sound keys play a real recording (${data.sounds.recoveredWayback} from web archives, ${data.sounds.archiveorgSfx ?? 0} from Tiny Speck's archived sound effects); the rest are gentle synth stand-ins.`),
  );

  const bar = $('#quest-bar');
  const legend = $('#quest-legend');
  const colors = { playable: 'var(--moss)', job: 'var(--sun)', building: 'var(--sand)', tutorial: 'var(--sky)', players: 'var(--dusk)', retired: 'var(--stone)' };
  bar.setAttribute('aria-label', q.buckets.map((b) => `${b.label}: ${b.count}`).join(', '));
  for (const b of q.buckets) {
    if (!b.count) continue;
    bar.append(el('span', { style: `width:${(b.count / q.total) * 100}%; background:${colors[b.id]}`, title: `${b.label}: ${b.count}` }));
    legend.append(el('li', { title: b.note }, el('span', { class: 'dot', style: `background:${colors[b.id]}` }), el('b', {}, String(b.count)), b.label));
  }
}

/* —— Rooms ———————————————————————————— */
function renderRooms(data) {
  const grid = $('#room-grid');
  const rooms = data.rooms.rooms;
  rooms.forEach((r, index) => {
    const shot = r.shot
      ? el('img', { class: 'room-shot', src: r.shot, alt: '', loading: 'lazy' })
      : el('div', { class: 'room-shot is-empty' }, r.built ? 'Screenshot coming' : 'On the workbench');
    const status = r.built ? 'rebuilt' : 'progress';
    const pill = el('span', { class: 'pill', style: `--tone:${tone(status, data)}` }, r.built ? 'Rebuilt' : 'In progress');
    const card = el('button', { type: 'button', class: `room${r.built ? '' : ' is-pending'}`, 'aria-haspopup': 'dialog', 'aria-label': `${r.title}: about this quest room`, onclick: () => openRoom(index) }, shot,
      el('div', { class: 'room-body' },
        el('h3', {}, r.title),
        el('p', {}, r.note?.tagline || r.quests.join(' · ')),
        pill, r.note ? el('span', { class: 'room-more' }, 'Read more') : null));
    grid.append(card);
  });

  const modal = $('#room-modal');
  let current = 0;
  const fill = (sel, text) => { $(sel, modal).textContent = text || ''; };
  function openRoom(index) {
    current = (index + rooms.length) % rooms.length;
    const r = rooms[current];
    const note = r.note || {};
    const img = $('.rm-shot', modal);
    img.src = r.hd || r.shot || '';
    img.alt = `${r.title}, rebuilt in Groddle Afternoon`;
    img.hidden = !(r.hd || r.shot);
    const questNames = r.quests.join(' · ');
    fill('.rm-kicker', questNames === r.title ? 'Quest room' : questNames);
    fill('.rm-title', r.title);
    fill('.rm-tagline', note.tagline);
    const pill = $('.rm-pill', modal);
    pill.textContent = r.built ? 'Rebuilt' : 'In progress';
    pill.style.setProperty('--tone', tone(r.built ? 'rebuilt' : 'progress', data));
    const offer = $('.rm-offer', modal);
    offer.hidden = !r.offer;
    $('p', offer).textContent = r.offer ? `“${r.offer}”` : '';
    fill('.rm-about', note.about);
    fill('.rm-play', note.play);
    fill('.rm-source', note.source);
    fill('.rm-rebuilt', note.rebuilt);
    const foot = $('.rm-footage', modal);
    const list = $('ul', foot);
    list.replaceChildren(...(note.footage || []).map((f) => el('li', {}, el('a', { href: `https://www.youtube.com/watch?v=${f.id}`, target: '_blank', rel: 'noopener' }, f.label))));
    foot.hidden = !(note.footage || []).length;
    $('.rm-prev span', modal).textContent = rooms[(current - 1 + rooms.length) % rooms.length].title;
    $('.rm-next span', modal).textContent = rooms[(current + 1) % rooms.length].title;
    if (!modal.open) modal.showModal();
    modal.scrollTop = 0;
  }
  $('.rm-close', modal).addEventListener('click', () => modal.close());
  $('.rm-prev', modal).addEventListener('click', () => openRoom(current - 1));
  $('.rm-next', modal).addEventListener('click', () => openRoom(current + 1));
  // Click on the backdrop (outside the dialog box) closes it.
  modal.addEventListener('click', (e) => {
    const r = modal.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) modal.close();
  });
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') openRoom(current - 1);
    if (e.key === 'ArrowRight') openRoom(current + 1);
  });
  // Deep link: #room-<id> opens that room.
  const fromHash = () => {
    const m = /^#room-(.+)$/.exec(location.hash);
    const i = m ? rooms.findIndex((r) => r.id === m[1]) : -1;
    if (i >= 0) openRoom(i);
  };
  window.addEventListener('hashchange', fromHash);
  fromHash();
}

/* —— Recent + honest + footer ———————————————————————————— */
function renderRest(data) {
  const list = $('#recent-list');
  const kinds = { new: 'New', improve: 'Better', fix: 'Fixed' };
  for (const r of data.git.recent) {
    list.append(el('li', {}, el('time', { datetime: r.date }, r.date), el('span', { class: `kind kind-${r.kind}` }, kinds[r.kind]), el('span', {}, r.text)));
  }
  const lost = $('#lost-list');
  for (const it of data.items.filter((i) => i.status === 'lost')) lost.append(el('li', {}, el('b', {}, it.name), ': ', it.blurb));
  const dl = $('#legend-list');
  for (const s of STATUS_ORDER) {
    const st = data.status[s];
    dl.append(el('div', {}, el('dt', {}, el('span', { class: 'pill', style: `--tone:${tone(s, data)}` }, st.label)), el('dd', {}, st.desc)));
  }
  $('#foot-meta').textContent = `Generated from the repository on ${data.generatedAt || 'build'}: ${fmt(data.git.commits)} commits since ${data.git.since}, ${data.tests} test files.`;
}

const data = await (await fetch('data.json', { cache: 'no-cache' })).json();
renderScore(data);
setupDiorama(data);
setupBoard(data);
renderNumbers(data);
renderRooms(data);
renderRest(data);
