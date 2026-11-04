/**
 * The Groddle Encyclopedia (docs/encyclopedia.md): quests, animals, people,
 * skills, places, achievements and music and sounds from Tiny Speck's game data, each with its
 * status in the remake, cross-linked with each other and with the Item catalog
 * (the Items section, /encyclopedia/items/, written by tools/catalog/build.mjs,
 * which reads the same index; this build leaves that folder to it).
 *
 *   public/encyclopedia/index.html                 the home: search across every section
 *   public/encyclopedia/search.json                every entry (items included), for the search
 *   public/encyclopedia/<section>/index.html       a section's list, drawn in full
 *   public/encyclopedia/<section>/<id>/index.html  one page per entry
 *   public/encyclopedia/sounds/still-missing/       every sound whose recording is still missing
 *
 *   node tools/encyclopedia/build.mjs          write the files
 *   node tools/encyclopedia/build.mjs --check  exit 1 if any file is stale (tests/encyclopedia.test.js)
 *
 * Words about the original game are Tiny Speck's (GSJS and their CC0 data);
 * words about the remake are ours.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteNav } from '../changelog/build.mjs';
import { committedMap, keyAssetUrls, mapTags } from '../data-versions/build.mjs';
import { keyOf as moduleKeyOf } from '../module-keys/build.mjs';
import { EMAIL } from '../contribute/to-minn.mjs';
import { GIANTS, PUB, SECTIONS, giantIcon, loadEncyclopedia, picture } from './data.mjs';
import { SOUND_GROUPS } from './sounds.mjs';
import { neverReleased, neverReleasedNote, neverReleasedTag } from './never-released.mjs';
import { STATUS, andList, article, badge, esc, fmt, inRemake, makeParts, pathOf, plainText, sep, statusLabel, tsHtml } from './parts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = 'encyclopedia';
const SECTION = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));

/* -- What each status means, per kind of entry (our words) -- */

const STATUS_TEXT = {
  quests: {
    source: 'You can do this quest in the remake.',
    rebuilt: 'You can do this quest in the remake. Its place was never archived, so it is rebuilt from recordings of the original.',
    solo: 'You can do this quest in the remake, reworked so you can do it on your own.',
    multiplayer: 'This quest needs other players: you can do it in multiplayer.',
    unbuilt_original: 'Never finished in the original: Tiny Speck’s code has it, but the game never offered it.',
  },
  animals: {
    source: 'In the remake: you will meet it out in the world.',
    partial: 'Partly in the remake.',
    unbuilt_original: 'Never finished in the original: Tiny Speck’s code has it, but it never appeared in the game.',
  },
  people: {
    source: 'In the remake: you will meet them out in the world.',
    partial: 'Partly in the remake: the remake runs this one as the main shrine of its Giant, without its own art.',
    rebuilt: 'In the remake, rebuilt from recordings of the original.',
    reimagined: 'In the remake, reimagined: too little of the original survives, so it is designed fresh in its spirit.',
    unbuilt_original: 'Never finished in the original: Tiny Speck’s code has it, but it never appeared in the game.',
  },
  skills: {
    source: 'You can learn this skill in the remake.',
    multiplayer: 'You can learn this skill in the remake; what it does needs other players, so it works in multiplayer.',
    reimagined: 'You can learn this skill in the remake. Part of it is reimagined, because not all of the original survives.',
    unbuilt_original: 'Never finished in the original: Tiny Speck’s code has it, but nobody could learn it.',
  },
  places: {
    source: 'Every street of this region is in the remake.',
    partial: 'Some streets of this region are in the remake; the list below marks which.',
    missing: 'None of this region’s streets are in the remake yet.',
  },
  achievements: {
    source: 'You can earn this achievement in the remake.',
    multiplayer: 'You can earn this achievement in multiplayer: it counts things you do with other players.',
    unbuilt_original: 'Never finished in the original: Tiny Speck’s code has it, but nobody could earn it.',
  },
};
const statusText = (section, s) => STATUS_TEXT[section]?.[s] || `${statusLabel(s)}.`;

/** The remake's reasons a quest is not solo (quests.json soloReason), in our words. */
const SOLO_REASON = {
  needs_other_players: 'It counts things only other players can do for you.',
  multiplayer: 'It is a game played against or with other players.',
  incomplete_in_source: 'Tiny Speck’s code for it is incomplete.',
  unreachable_in_source: 'Nothing in Tiny Speck’s game ever offered it.',
};

/* -- Page frame -------------------------------------------- */

const FOOT = (p) => `  <footer class="foot">
    <div class="wrap">
      <p>A <a href="https://tinybitadventures.com">fan remake</a> of Tiny Speck’s Glitch · <a href="${p}credits/">Credits</a> · <a href="${p}privacy-policy/">Privacy</a></p>
      <p><a href="${p}">Home</a> · <a href="${p}play/">Play Groddle Afternoon</a> · <a href="${p}encyclopedia/">Encyclopedia</a> · <a href="${p}encyclopedia/items/">Item catalog</a></p>
    </div>
  </footer>`;

const shell = ({ p, title, description, body, script }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${esc(description)}" />
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="${p}restoration/restoration.css" />
  <link rel="stylesheet" href="${p}changelog/changelog.css" />
  <link rel="stylesheet" href="${p}site/site-nav.css" />
${script ? mapTags(p) : ''}  <script src="${p}site/theme.js"></script>
  <link rel="stylesheet" href="${p}encyclopedia/items/catalog.css" />
  <link rel="icon" href="${p}favicon.svg?v=arch" type="image/svg+xml" />
  <link rel="icon" href="${p}favicon.ico?v=arch" sizes="32x32" />
  <link rel="apple-touch-icon" href="${p}apple-touch-icon.png?v=arch" />
${script ? `  <script type="module" src="${p}encyclopedia/encyclopedia.js?v=${moduleKeyOf('encyclopedia/encyclopedia.js', root)}"></script>\n` : ''}</head>
<body class="notes catalog ency">
${siteNav(p, 'items')}
${body}
${FOOT(p)}
</body>
</html>
`;

const band = (id, title, inner, { alt = false, lead = '' } = {}) => (inner ? `
    <section class="band${alt ? ' band-alt' : ''} ency-band" aria-labelledby="${id}">
      <div class="wrap">
        <h2 id="${id}">${title}</h2>
${lead ? `        <p class="section-lead">${lead}</p>\n` : ''}        ${inner}
      </div>
    </section>` : '');

const sub = (title, inner) => (inner ? `<h3>${title}</h3>\n        ${inner}` : '');
const paras = (list) => list.map((x) => `<p>${x}</p>`).join('');

/* -- Shared bits of entry pages --------------------------- */

/** The sounds that link to an entry (tools/encyclopedia/sounds.mjs refs), as tiles. */
function soundTiles(key, P, backOf, uniqBy, test = () => true) {
  return uniqBy(backOf(key, (b) => b.from.startsWith('sounds:') && test(b)), (b) => b.from).map((b) => P.tile(b.from));
}

function entryHead(e, P, { kickerExtra = '', subline = '' } = {}) {
  const sec = SECTION[e.section];
  const pic = e.icon ? P.img(e.icon, 'cat-hero-icon', 144) : '<span class="cat-hero-icon cat-ph" aria-hidden="true"></span>';
  const caption = e.icon?.caption || e.iconCaption || '';
  // Never released in Glitch (never-released.mjs): a tag beside the status and a note under it.
  const nr = neverReleased(e.key);
  return `
  <header class="masthead note-head cat-item-head">
    <div class="wrap">
      <p class="kicker"><a href="../../">Groddle Encyclopedia</a> · <a href="../">${esc(sec.label)}</a>${e.group ? ` · ${esc(e.group)}` : ''}${kickerExtra}</p>
      <div class="cat-hero">
        <div class="cat-hero-frame">${pic}</div>
        <div>
          <h1>${esc(e.name)}</h1>
          <p class="cat-plural">${subline || '&nbsp;'}</p>
          <p class="cat-status">${badge(e.status)}${nr ? ` ${neverReleasedTag()}` : ''}${caption ? ` <span class="cat-register">${esc(caption)}</span>` : ''}</p>${nr ? `\n          ${neverReleasedNote(nr)}` : ''}
        </div>
      </div>
    </div>
  </header>`;
}

function remakeBand(e, extra = '') {
  const nr = neverReleased(e.key);
  return band('remake-h', 'In the remake', `<div class="cat-remake-body"><p class="cat-status-text">${esc(nr ? nr.remake : statusText(e.section, e.status))}</p>${extra}</div>`, { alt: true });
}

function pager(list, i, label) {
  const prev = list[i - 1];
  const next = list[i + 1];
  return `
    <nav class="band note-after" aria-label="More ${esc(label.toLowerCase())}">
      <div class="wrap">
        <div class="note-pager">
          ${prev ? `<a class="note-pager-older" href="../${esc(prev.id)}/" rel="prev"><span>Previous${sep(':')}</span> ${esc(prev.name)}</a>` : '<span></span>'}
          ${next ? `<a class="note-pager-newer" href="../${esc(next.id)}/" rel="next"><span>Next${sep(':')}</span> ${esc(next.name)}</a>` : '<span></span>'}
        </div>
        <p class="note-all"><a href="../">All ${fmt(list.length)} ${esc(label.toLowerCase())}</a> · <a href="../../">Search the encyclopedia</a></p>
      </div>
    </nav>`;
}

/** Verbs, with Tiny Speck's tooltips. */
const verbList = (verbs) => (verbs.length ? `<dl class="cat-verbs">
${verbs.map((v) => `          <div><dt>${esc(v.name)}</dt><dd>${v.tooltip ? esc(v.tooltip.replace(/\$[a-z_]+/g, '…')) : ''}</dd></div>`).join('\n')}
        </dl>` : '');

const learnTime = (points) => {
  const sec = Math.round((points || 0) / 10);
  if (!sec) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h >= 48) return `${fmt(Math.round(h / 24 * 10) / 10)} days`;
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || `${sec} s`;
};

/* -- Builders per section --------------------------------- */

export async function buildEncyclopedia(data = null) {
  const d = data || await loadEncyclopedia();
  const { entries, items, back } = d;
  const info = (key) => {
    if (key.startsWith('item:')) return items.get(key.slice(5)) || null;
    return entries.get(key) || null;
  };
  const bySection = Object.fromEntries(SECTIONS.map((s) => [s.key, [...entries.values()].filter((e) => e.section === s.key)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id))]));
  const backOf = (key, test = () => true) => (back.get(key) || []).filter(test);
  const uniqBy = (list, f) => list.filter((x, i, a) => a.findIndex((y) => f(y) === f(x)) === i);

  const files = {};
  const put = (path, html) => { files[path] = html; };

  for (const sec of SECTIONS) {
    const list = bySection[sec.key];
    list.forEach((e, i) => {
      const p = '../../../';
      const P = makeParts(p, info, d.nameOf);
      const linkFor = (id) => { const k = d.keyOf(id); return k ? P.href(k) : null; };
      const page = { quests: questPage, animals: creaturePage, people: creaturePage, skills: skillPage, places: placePage, achievements: achievementPage, sounds: soundPage }[sec.key];
      // Bands alternate plain and tinted in the order they appear, whichever ones the entry has.
      let band = 0;
      const body = (page(e, P, { linkFor, backOf, uniqBy, info, d }) + pager(list, i, sec.label))
        .replace(/<(section|nav) class="band(?: band-alt)?/g, (m, tag) => `<${tag} class="band${band++ % 2 ? ' band-alt' : ''}`);
      const desc = plainText(e.quest?.desc || e.creature?.desc || e.skill?.description || e.ach?.desc || e.desc || e.sound?.moment || '').slice(0, 150);
      // A sound's page loads the encyclopedia's script for its synth stand-in and its players.
      put(`${OUT}/${sec.key}/${e.id}/index.html`, shell({ p, title: `${e.name} · Groddle Encyclopedia`, description: `${desc ? `${desc} ` : ''}${statusLabel(e.status)}.`, body, script: sec.key === 'sounds' }));
    });
    if (sec.key === 'sounds') {
      put(`${OUT}/sounds/index.html`, soundsIndex(sec, list, info, d.nameOf));
      put(`${OUT}/sounds/${STILL_MISSING}/index.html`, stillMissingPage(list, info, d.nameOf));
    } else put(`${OUT}/${sec.key}/index.html`, sectionIndex(sec, list, info, d.nameOf));
  }

  // Search: every entry, items included.
  const search = [
    ...[...items.values()].map((it) => ({ s: 'items', id: it.id, n: it.name, st: it.status, ic: it.icon?.src || '', h: pathOf(`item:${it.id}`) })),
    ...[...entries.values()].map((e) => ({ s: e.section, id: e.id, n: e.name, g: e.group || '', st: e.status, ic: e.icon?.src || '', h: pathOf(e.key) })),
  ];
  put(`${OUT}/search.json`, `${JSON.stringify({ sections: [{ key: 'items', label: 'Items' }, ...SECTIONS.map(({ key, label }) => ({ key, label }))], statuses: Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.label])), inRemake: Object.keys(STATUS).filter(inRemake), entries: search }).replace(/\{"s":/g, '\n{"s":')}\n`);
  put(`${OUT}/index.html`, homePage(bySection, items, info, d.nameOf));

  const keys = committedMap();
  for (const path of Object.keys(files)) if (path.endsWith('.html')) files[path] = keyAssetUrls(files[path], path, keys);
  // The blank stubs left out (data.mjs isBlankStub), per section, items included.
  const leftOut = Object.fromEntries(['items', ...SECTIONS.map((s) => s.key)].map((k) => [k, [...d.stubs.values()].filter((s) => s.section === k)]));
  return { files, counts: Object.fromEntries(SECTIONS.map((s) => [s.key, bySection[s.key].length])), leftOut, data: d };
}

/* -- Quests ------------------------------------------------- */

function questPage(e, P, { linkFor, backOf, uniqBy, info, d }) {
  const q = e.quest;
  const has = (key) => Boolean(info(key));
  // How to get it.
  const how = [];
  const howTiles = [];
  const seen = new Set();
  const addTile = (key, sub) => { if (!seen.has(key) && has(key)) { seen.add(key); howTiles.push(P.tile(key, { sub })); } };
  const name = (key) => (info(key) ? `<a href="${P.href(key)}">${esc(info(key).name)}</a>` : esc(d.nameOf(key) || key.split(':')[1]));
  /** The key of a class id the quest names, a left-out stub's too (its name shows as plain text). */
  const keyOrStub = (id) => d.keyOf(id) || d.stubKey(id);
  for (const t of q.offerTriggers) {
    if (t.type === 'skill') { how.push(`Offered when you learn ${name(`skills:${t.skill}`)}.`); addTile(`skills:${t.skill}`, 'learn it'); }
    else if (t.type === 'npc') { const k = keyOrStub(t.npc); how.push(`Offered by ${k ? name(k) : esc(t.npc.replace(/_/g, ' '))}.`); if (k) addTile(k, 'talk to them'); }
    else if (t.type === 'quest') { how.push(`Offered after you finish ${name(`quests:${t.quest}`)}.`); addTile(`quests:${t.quest}`, 'finish it first'); }
    else if (t.type === 'achievement') { how.push(`Offered once you earn ${name(`achievements:${t.achievement}`)}.`); addTile(`achievements:${t.achievement}`, 'earn it first'); }
    else if (t.type === 'level') how.push(`Offered once you reach level ${fmt(t.level)}.`);
    else if (t.type === 'xp') how.push(`Offered once you have ${fmt(t.xp)} iMG in all.`);
    else if (t.type === 'region') how.push(`Offered in ${esc(t.region)}.`);
    else if (t.type === 'event') how.push(`Offered when something happens in the game (${esc(t.event.replace(/_/g, ' '))}).`);
    else if (t.type === 'inferred') {
      if (t.quests?.length) { how.push(`Comes after ${andList(t.quests.map((x) => name(`quests:${x}`)))}.`); t.quests.forEach((x) => addTile(`quests:${x}`, 'finish it first')); }
      if (t.level) how.push(`Offered once you reach level ${fmt(t.level)}.`);
    }
  }
  for (const pq of q.prereqQuests) if (!seen.has(`quests:${pq}`)) { how.push(`Needs ${name(`quests:${pq}`)} done first.`); addTile(`quests:${pq}`, 'finish it first'); }
  for (const c of q.prerequisites) {
    const not = c.not ? ' not' : '';
    if (c.condition === 'over_level') how.push(`You need to be over level ${fmt(c.value)}.`);
    else if (c.condition === 'has_skill') { how.push(`You need${not} to know ${name(`skills:${c.value}`)}.`); addTile(`skills:${c.value}`, 'learn it'); }
    else if (c.condition === 'has_achievement') { how.push(`You need${not} to have earned ${name(`achievements:${c.value}`)}.`); addTile(`achievements:${c.value}`, 'earn it first'); }
    else if (c.condition === 'completed_quest') { how.push(c.not ? `Only while you have not done ${name(`quests:${c.value}`)}.` : `You need ${name(`quests:${c.value}`)} done first.`); if (!c.not) addTile(`quests:${c.value}`, 'finish it first'); }
    else if (c.condition === 'over_favor') how.push('You need enough favor with a Giant.');
    else if (c.condition === 'custom_code') {
      const m = /^hours?_after:(?:(\d+):)?([a-z0-9_]+)$/.exec(String(c.value));
      if (m) how.push(`Comes ${m[1] ? `${m[1]} hours` : 'an hour'} after ${has(`quests:${m[2]}`) ? name(`quests:${m[2]}`) : 'the quest before it'}.`);
      else if (/^upgrades:/.test(c.value)) how.push('Needs the Imagination upgrades for walking speed and jumping.');
      else if (c.value === 'rube_traded') how.push('Comes after you trade with the Rube.');
      else if (c.value === 'no_butler') how.push('Only while you do not have a Butler yet.');
    }
  }
  if (!how.length) how.push(q.autoComplete ? 'It starts and finishes by itself as you play.' : 'The game offers it as you play.');

  // Steps.
  const steps = q.requirements.map((r) => {
    const parts = [];
    let title = esc(r.desc || '');
    if (r.type === 'item') parts.push(P.tiles([P.tile(d.keyOf(r.classId) || `item:${r.classId}`, { n: r.num, sub: r.remove ? 'handed in' : 'have it' })]));
    else if (r.type === 'make') {
      const recipe = d.recipes[r.recipeKey];
      parts.push(recipe ? P.recipeRow(recipe, { note: r.num > 1 ? `make ${fmt(r.num)}` : '' }) : P.tiles([P.tile(`item:${r.outputClass}`, { n: r.num })]));
    } else if (r.type === 'counter' || r.type === 'flag') {
      if (/^toggle flag/.test(r.desc || '')) title = r.name === 'leave' ? 'Leave when you are done.' : 'Finish what this place asks of you.';
      const k = keyOrStub(r.classId);
      if (k) parts.push(P.tiles([P.tile(k, { n: r.type === 'counter' ? r.num : null })]));
    } else if (r.type === 'currants') parts.push(P.chips([P.currants(r.num, 'ency-chip')]));
    else if (r.classId) { const k = keyOrStub(r.classId); if (k) parts.push(P.tiles([P.tile(k, { n: r.num })])); }
    return `<li><p class="ency-step-title">${title || 'Do what the quest asks.'}</p>${parts.join('')}</li>`;
  });
  if (q.timer?.durationSec) steps.push(`<li><p class="ency-step-title">All of it within ${learnTime(q.timer.durationSec * 10)}: a countdown runs from the moment you take the quest, and the quest fails if it runs out.</p></li>`);

  // Where to go.
  const where = [];
  const whereTiles = [];
  if (q.instanceRoom || q.instanced) where.push('This quest takes you to a place of its own: take it, and the game sends you there.');
  const back2 = uniqBy(q.endNpcs.map(keyOrStub).filter(Boolean), (x) => x);
  if (back2.length) { where.push(`Hand it in to ${andList(back2.map(name))}.`); back2.forEach((k) => whereTiles.push(P.tile(k, { sub: 'hand it in' }))); }
  else if (q.familiarTurnin) where.push('Hand it in to your Magic Rock, wherever you are.');

  // Rewards.
  const rw = q.rewards || {};
  const rewards = [];
  if (rw.xp) rewards.push(P.chip(`${fmt(rw.xp)} iMG`, { cls: 'ency-chip-xp' }));
  if (rw.currants) rewards.push(P.currants(rw.currants, 'ency-chip'));
  if (rw.mood) rewards.push(P.chip(`${fmt(rw.mood)} mood`));
  if (rw.energy) rewards.push(P.chip(`${fmt(rw.energy)} energy`));
  for (const f of Object.values(rw.favor || {})) if (f?.giant) rewards.push(P.chip(`${fmt(f.points)} favor with ${esc(GIANTS[f.giant] || f.giant)}`, { pic: picture(giantIcon(f.giant)), link: info(`people:npc_shrine_${f.giant}`) ? P.href(`people:npc_shrine_${f.giant}`) : null }));
  for (const r of Object.values(rw.recipes || {})) rewards.push(P.chip(`Recipe: ${esc(r.label)}`));
  const rewardTiles = [...Object.values(rw.items || {}).map((it) => P.tile(d.keyOf(it.class_tsid) || `item:${it.class_tsid}`, { n: it.count || 1 })),
    ...(q.giveItems || []).map((it) => P.tile(`item:${it.classTsid}`, { n: it.count, sub: 'given when you take it' }))];

  // Leads to.
  const leads = uniqBy(backOf(e.key, (b) => b.rel === 'after'), (b) => b.from)
    .map((b) => P.tile(b.from, { sub: b.from.startsWith('skills:') ? 'you can learn it after' : b.from.startsWith('quests:') ? 'comes next' : '' }));
  const involved = uniqBy(e.refs.filter((r) => ['involves', 'mentions', 'tool', 'needs'].includes(r.rel) && !r.to.startsWith('quests:')), (r) => r.to)
    .map((r) => P.tile(r.to, { sub: r.rel === 'tool' ? 'tool' : r.rel === 'needs' ? 'needed' : '' }));

  const words = [
    sub('The quest', `<div class="cat-desc">${paras(tsHtml(q.desc, linkFor))}</div>`),
    q.offer ? sub('When it is offered', `<div class="ency-talk">${paras(tsHtml(q.offer, linkFor))}</div>`) : '',
    q.completion ? sub('When you finish', `<div class="ency-talk">${paras(tsHtml(q.completion, linkFor))}</div>`) : '',
  ].filter(Boolean).join('\n        ');

  const solo = q.soloReason && SOLO_REASON[q.soloReason] ? `<p>${esc(SOLO_REASON[q.soloReason])}</p>` : '';
  const kinds = [q.isRepeatable && 'repeatable', q.isMultiplayer && 'with other players', q.timer && 'timed'].filter(Boolean);
  return `${entryHead(e, P, { subline: kinds.length ? esc(`Quest · ${kinds.join(' · ')}`) : 'Quest' })}
  <main>${band('how-h', 'How to get this quest', `<ul class="cat-list">${how.map((h) => `<li>${h}</li>`).join('')}</ul>\n        ${P.tiles(howTiles)}`)}
${band('steps-h', 'Steps', `<ol class="ency-steps">${steps.join('\n          ')}</ol>${where.length ? `\n        ${sub('Where to go', `<ul class="cat-list">${where.map((w) => `<li>${w}</li>`).join('')}</ul>${P.tiles(whereTiles)}`)}` : ''}`, { alt: true, lead: 'Each step in Tiny Speck’s words, with what it needs.' })}
${band('rewards-h', 'Rewards', `${P.chips(rewards)}${P.tiles(rewardTiles)}` || '', {})}
${band('rel-h', 'Linked to this quest', [sub('Comes next', P.tiles(leads)), sub('Things it involves', P.tiles(involved)), sub('Sounds', P.tiles(soundTiles(e.key, P, backOf, uniqBy)))].filter(Boolean).join('\n        '), { alt: true })}
${band('words-h', 'In Tiny Speck’s words', `${words}\n        <p class="cat-source">From Tiny Speck’s game code.</p>`)}
${remakeBand(e, solo)}
  </main>`;
}

/* -- Animals and people ------------------------------------- */

const REL_WORD = { needs: 'needs it', 'needs-make': 'make it', rewards: 'reward', gives: 'gives it', mentions: 'named', involves: 'involves it', tool: 'tool', giver: 'gives the quest', 'return-to': 'hand in here', after: '', counts: 'counts it' };

function creaturePage(e, P, { linkFor, backOf, uniqBy, info, d }) {
  const c = e.creature;
  const gives = uniqBy(e.refs.filter((r) => r.rel === 'gives'), (r) => r.to).map((r) => P.tile(r.to));
  const sells = (e.store?.offers || []).map((o) => P.tile(`item:${o.classTsid}`, { sub: P.currants(o.price) }));
  const skills = uniqBy(e.refs.filter((r) => r.rel === 'skill'), (r) => r.to).sort((a, b) => a.to.localeCompare(b.to, 'en', { numeric: true })).map((r) => P.tile(r.to));
  const lives = backOf(e.key, (b) => b.rel === 'lives').sort((a, b) => b.streets - a.streets || info(a.from).name.localeCompare(info(b.from).name));
  const totalStreets = lives.reduce((n, b) => n + b.streets, 0);
  const placeChips = lives.map((b) => P.chip(`${esc(info(b.from).name)} <b>${fmt(b.streets)}</b>`, { link: `${P.href(b.from)}`, cls: 'ency-place' }));
  const quests = uniqBy(backOf(e.key, (b) => b.from.startsWith('quests:')), (b) => b.from).map((b) => P.tile(b.from, { sub: REL_WORD[b.rel] || '' }));
  const comesFrom = uniqBy(backOf(e.key, (b) => b.rel === 'gives' && !b.from.startsWith('quests:')), (b) => b.from).map((b) => P.tile(b.from, { sub: 'can give it' }));
  const achs = uniqBy(backOf(e.key, (b) => b.from.startsWith('achievements:')), (b) => b.from).map((b) => P.tile(b.from, { sub: b.n ? `${fmt(b.n)} times` : '' }));
  const variants = (e.variants || []).map((v) => (info(`item:${v}`) ? P.tile(`item:${v}`) : `<li><span class="ency-tile ency-tile-plain"><span class="ency-tile-pic">${P.img(null)}</span><span class="ency-tile-name">${esc(v.replace(/^npc_shrine_/, '').replace(/_/g, ' '))}</span></span></li>`));
  const shrineGiant = /^npc_shrine_([a-z]+)$/.exec(e.id)?.[1];
  const giantSkills = shrineGiant ? Object.values(d.skills).filter((s) => s.giants?.[shrineGiant]?.primary && info(`skills:${s.classTsid}`)).map((s) => P.tile(`skills:${s.classTsid}`)) : [];
  const desc = c ? tsHtml(c.desc, linkFor) : e.desc ? [esc(e.desc)] : [];
  const original = c ? `<div class="cat-cols">
        <div>
          ${desc.length ? `<div class="cat-desc">${paras(desc)}</div>` : '<p class="cat-muted">The game code gives it no description.</p>'}
          <p class="cat-source">From Tiny Speck’s game code.</p>
        </div>
        <dl class="cat-facts">
          <dt>Kind</dt><dd>${esc(e.group)}</dd>
          ${c.plural && c.plural !== c.name ? `<dt>Plural</dt><dd>${esc(c.plural)}</dd>` : ''}
          ${e.itemPage ? `<dt>Item page</dt><dd><a href="${P.href(`item:${e.itemPage}`)}">${esc(e.name)} in the item catalog</a></dd>` : ''}
        </dl>
      </div>` : `<p class="cat-desc">${esc(e.desc || '')}</p><p class="cat-source">A Street Spirit keeps this store on the streets below. What it sells is Tiny Speck’s store ${esc(e.store?.label || '')}, from their game code; the line above is the remake’s.</p>`;
  return `${entryHead(e, P, { subline: esc(SECTION[e.section].one === 'creature' ? e.group.replace(/s$/, '') : e.group) })}
  <main>
    <section class="band cat-original" aria-labelledby="orig-h">
      <div class="wrap">
        <h2 id="orig-h">${c ? 'In Tiny Speck’s game' : 'About this store'}</h2>
        ${original}
      </div>
    </section>
${band('give-h', e.store ? 'What they sell' : 'What it gives', [sells.length ? P.tiles(sells, 'ency-shop') : '', gives.length ? (e.store ? sub('Also gives', P.tiles(gives)) : P.tiles(gives)) : ''].filter(Boolean).join('\n        '), { alt: true, lead: e.store ? 'Prices in currants, as the remake sells them.' : 'The items its game code hands out.' })}
${band('verbs-h', 'What you can do', [verbList(c?.verbs || []), sub('Skills that change it', P.tiles(skills))].filter(Boolean).join('\n        '), { lead: c?.verbs?.length ? 'Its verbs, with Tiny Speck’s tooltips.' : '' })}
${band('where-h', 'Where to find it', placeChips.length ? `<p class="ency-lead-small">On ${fmt(totalStreets)} street${totalStreets === 1 ? '' : 's'} in ${fmt(lives.length)} region${lives.length === 1 ? '' : 's'}, by the 2012 map and the streets’ own files.</p>${P.chips(placeChips)}` : '', { alt: true })}
${band('rel-h', 'Quests and achievements', [sub('Quests', P.tiles(quests)), sub('Achievements', P.tiles(achs)), sub('Sounds', P.tiles(soundTiles(e.key, P, backOf, uniqBy))), sub('Where it comes from', P.tiles(comesFrom)), sub('Skills this Giant favors', P.tiles(giantSkills)), sub('Other shrines to this Giant', P.tiles(variants))].filter(Boolean).join('\n        '))}
${remakeBand(e)}
  </main>`;
}

/* -- Skills --------------------------------------------- */

function skillPage(e, P, { linkFor, backOf, uniqBy, info }) {
  const s = e.skill;
  const giants = Object.entries(s.giants || {}).sort((a, b) => b[1].primary - a[1].primary)
    .map(([g, v]) => P.chip(`${esc(GIANTS[g] || g)}${v.primary ? ' (primary)' : ''}`, { pic: picture(giantIcon(g)), link: info(`people:npc_shrine_${g}`) ? P.href(`people:npc_shrine_${g}`) : null }));
  const needs = uniqBy(e.refs.filter((r) => ['needs-skill', 'after'].includes(r.rel)), (r) => r.to).map((r) => P.tile(r.to, { sub: r.to.startsWith('quests:') ? 'finish it first' : r.to.startsWith('achievements:') ? 'earn it first' : 'learn it first' }));
  const unlocks = uniqBy(backOf(e.key, (b) => b.rel === 'needs-skill' && b.from.startsWith('skills:')), (b) => b.from).map((b) => P.tile(b.from));
  const quests = uniqBy([...e.refs.filter((r) => r.rel === 'opens').map((r) => ({ from: r.to })), ...backOf(e.key, (b) => b.from.startsWith('quests:'))], (b) => b.from)
    .map((b) => P.tile(b.from, { sub: 'offered when you learn it' }));
  const recipes = uniqBy(e.refs.filter((r) => r.rel === 'recipe'), (r) => r.to).map((r) => P.tile(r.to, { sub: 'you can make it' }));
  const creatures = uniqBy(backOf(e.key, (b) => b.rel === 'skill'), (b) => b.from).map((b) => P.tile(b.from));
  const chips = [P.chip(`Learn time ${learnTime(s.pointCost)}`, { cls: 'ency-chip-xp' }), s.requiresLevel ? P.chip(`Level ${fmt(s.requiresLevel)} or more`) : '', P.chip(esc(e.group))].filter(Boolean);
  const own = Boolean(s.remake);
  return `${entryHead(e, P, { subline: esc(`${e.group} skill`) })}
  <main>
    <section class="band cat-original" aria-labelledby="orig-h">
      <div class="wrap">
        <h2 id="orig-h">${own ? 'About this skill' : 'In Tiny Speck’s game'}</h2>
        ${P.chips(chips)}
        ${s.description ? `<div class="cat-desc">${paras(tsHtml(s.description, linkFor))}</div>` : ''}
        ${s.learned ? `<h3>When you learn it</h3><div class="ency-talk">${paras(tsHtml(s.learned, linkFor))}</div>` : ''}
        ${giants.length ? `<h3>Giants</h3>${P.chips(giants)}` : ''}
        <p class="cat-source">${own ? 'Its words are the remake’s: the original’s did not survive.' : 'From Tiny Speck’s game code.'} The learn time is how long it takes in the remake, before Better Learning.</p>
      </div>
    </section>
${band('needs-h', 'What it needs', P.tiles(needs) || '<p class="cat-muted">Nothing: anyone can learn it.</p>', { alt: true })}
${band('opens-h', 'What it opens', [sub('Skills', P.tiles(unlocks)), sub('Quests', P.tiles(quests)), sub('Things you can make with it', P.tiles(recipes)), sub('Creatures and people it changes', P.tiles(creatures))].filter(Boolean).join('\n        '))}
${remakeBand(e)}
  </main>`;
}

/* -- Places ------------------------------------------------ */

function placePage(e, P, { info, d, backOf, uniqBy }) {
  const lives = e.refs.filter((r) => r.rel === 'lives').sort((a, b) => b.streets - a.streets || b.n - a.n);
  const who = lives.filter((r) => !r.to.startsWith('item:')).map((r) => P.tile(r.to, { sub: `on ${fmt(r.streets)} street${r.streets === 1 ? '' : 's'}` }));
  const things = lives.filter((r) => r.to.startsWith('item:')).map((r) => P.tile(r.to, { n: null, sub: `${fmt(r.n)} in all` }));
  const storeKey = (store) => [...d.entries.values()].find((x) => x.storeName === store)?.key || null;
  const streets = e.streets.map((st) => {
    const chips = [];
    if (st.store) { const k = storeKey(st.store); chips.push(P.chip(esc(`${st.store} vendor`), { pic: info('item:street_spirit')?.icon, link: k ? P.href(k) : null })); }
    if (st.shrine) chips.push(P.chip(esc(`Shrine to ${GIANTS[st.shrine] || st.shrine}`), { pic: picture(giantIcon(st.shrine)), link: info(`people:npc_shrine_${st.shrine}`) ? P.href(`people:npc_shrine_${st.shrine}`) : null }));
    if (st.subway) chips.push(P.chip('Subway station'));
    for (const b of uniqBy(backOf(e.key, (x) => x.rel === 'street-music' && x.anchor === st.tsid), (x) => x.from)) chips.push(P.chip(`Music: ${esc(info(b.from).name)}`, { pic: info(b.from).icon, link: P.href(b.from) }));
    for (const [id, n] of Object.entries(st.counts).sort((a, b) => b[1] - a[1])) {
      if (id === 'street_spirit' || id === 'garden') continue;
      const k = d.keyOf(id);
      const it = k ? info(k) : null;
      if (it) chips.push(P.chip(`${esc(it.name)}${n > 1 ? ` <b>${fmt(n)}</b>` : ''}`, { pic: it.icon, link: P.href(k) }));
    }
    return `<li id="${esc(st.tsid)}" class="ency-street"><p class="ency-street-name"><span class="dot st-${st.inRemake ? 'source' : 'missing'}" aria-hidden="true"></span>${esc(st.name)}${st.inRemake ? '' : ' <span class="cat-muted">(not in the remake yet)</span>'}</p>${P.chips(chips)}</li>`;
  });
  const inCount = e.streets.filter((x) => x.inRemake).length;
  return `${entryHead(e, P, { subline: esc(`Region on the map · ${fmt(e.streets.length)} streets, ${fmt(inCount)} in the remake`) })}
  <main>
${band('who-h', 'Who and what lives here', [P.tiles(who), sub('Trees, rocks and more', P.tiles(things))].filter(Boolean).join('\n        '), { lead: 'Counts from the streets’ own files.' })}
${band('streets-h', 'Streets', `<ul class="ency-streets">${streets.join('\n          ')}</ul>`, { alt: true, lead: 'As the 2012 map named them, with each street’s vendor, shrine, animals, trees, rocks and music of its own.' })}
${band('music-h', 'Music and sounds', [sub('Region music', P.tiles(soundTiles(e.key, P, backOf, uniqBy, (b) => b.rel === 'region-music'))), sub('Street music', P.tiles(soundTiles(e.key, P, backOf, uniqBy, (b) => b.rel === 'street-music'))), sub('Sounds on its streets', P.tiles(soundTiles(e.key, P, backOf, uniqBy, (b) => b.rel === 'plays-in')))].filter(Boolean).join('\n        '), { lead: 'The music the remake plays here, and the sounds of its streets.' })}
${remakeBand(e)}
  </main>`;
}

/* -- Achievements --------------------------------------------- */

function achievementPage(e, P, { linkFor, backOf, uniqBy }) {
  const a = e.ach;
  const counts = uniqBy(e.refs.filter((r) => r.rel === 'counts'), (r) => r.to).map((r) => P.tile(r.to, { sub: r.n > 1 ? `${fmt(r.n)} times` : '' }));
  const rw = a.rewards || {};
  const rewards = [];
  if (rw.xp) rewards.push(P.chip(`${fmt(rw.xp)} iMG`, { cls: 'ency-chip-xp' }));
  if (rw.currants) rewards.push(P.currants(rw.currants, 'ency-chip'));
  if (rw.mood) rewards.push(P.chip(`${fmt(rw.mood)} mood`));
  if (rw.energy) rewards.push(P.chip(`${fmt(rw.energy)} energy`));
  if (rw.favor?.giant) rewards.push(P.chip(`${fmt(rw.favor.points)} favor with ${esc(GIANTS[rw.favor.giant] || rw.favor.giant)}`, { pic: picture(giantIcon(rw.favor.giant)) }));
  for (const r of Object.values(rw.recipes || {})) rewards.push(P.chip(`Recipe: ${esc(r.label)}`));
  const needed = uniqBy(backOf(e.key), (b) => b.from).map((b) => P.tile(b.from, { sub: b.from.startsWith('skills:') ? 'you can learn it after' : 'comes after' }));
  return `${entryHead(e, P, { subline: esc(`${e.group} achievement${a.isSecret ? ' · secret' : ''}`) })}
  <main>
    <section class="band cat-original" aria-labelledby="orig-h">
      <div class="wrap">
        <h2 id="orig-h">In Tiny Speck’s game</h2>
        <div class="cat-desc">${paras(tsHtml(a.desc, linkFor))}</div>
        ${a.statusText ? `<div class="ency-talk">${paras(tsHtml(a.statusText, linkFor))}</div>` : ''}
        <p class="cat-source">From Tiny Speck’s game code.</p>
      </div>
    </section>
${band('counts-h', 'What it counts', P.tiles(counts), { alt: true })}
${band('rewards-h', 'Rewards', P.chips(rewards))}
${band('rel-h', 'What it opens', P.tiles(needed), { alt: true })}
${remakeBand(e)}
  </main>`;
}

/* -- Music and sounds ------------------------------------------- */

const STILL_MISSING = 'still-missing';
/** A sound of the original whose recording is still missing (the Still missing page and its counts). */
export const stillMissing = (e) => e.section === 'sounds' && !e.sound.remakeOnly && !e.sound.original && e.status !== 'snd_silent';
const SOUND_LICENCE = 'Every recording here is Tiny Speck’s own: the sounds as their game played them, and the music they published for everyone to download. A synth stand-in is a short tone the remake makes itself.';
const SOUND_MEANS = {
  snd_original: 'Tiny Speck’s own recording plays.',
  snd_standin: 'Another recording plays in its place.',
  snd_synth: 'A short tone the remake makes itself plays in its place.',
  snd_silent: 'Nothing plays, as in the original.',
  snd_missing: 'Nothing plays yet, and the original recording is still missing.',
};
const SOUND_STATUSES = Object.keys(SOUND_MEANS);
const askBox = (p) => `<div class="snd-ask"><p>Have this sound? Email <a href="mailto:${EMAIL}">${EMAIL}</a>.</p><p>The <a href="${p}contribute/">Contribute</a> page says what else helps.</p></div>`;
const stop = (s) => (/[.!?]$/.test(s) ? s : `${s}.`);
let synthUrl = null;
/** The synth module's keyed address, for the stand-in's Play button (encyclopedia.js imports it on the first press). */
const synthModule = () => (synthUrl ||= `js/synth-sfx.js?v=${moduleKeyOf('js/synth-sfx.js', root)}`);

/** How a sound's stand-in recording is named: the sound it belongs to, a downloads-page title, or its name. */
function standinWords(f, P, info) {
  if (f.key) {
    const k = `sounds:${f.key.toLowerCase()}`;
    return `the ${info(k) ? `<a href="${P.href(k)}">${esc(info(k).name)}</a>` : esc(f.key)} recording`;
  }
  return f.downloads ? `“${esc(f.title)}” from Tiny Speck’s downloads page` : `“${esc(f.title)}”`;
}

/** The players for what plays now: one per recording, or the synth stand-in's button. */
function soundPlayers(e, p, info) {
  const s = e.sound;
  if (s.recipe) return `<ul class="snd-players"><li class="snd-player"><button type="button" class="snd-synth" data-synth="${esc(s.recipe)}" data-synth-module="${p}${synthModule()}" hidden>Play the synth stand-in</button></li></ul>`;
  if (!s.files.length) return '';
  const label = (f) => {
    const owner = s.standins.find((x) => x.file === f);
    if (owner?.key && info(`sounds:${owner.key.toLowerCase()}`)) return info(`sounds:${owner.key.toLowerCase()}`).name;
    if (owner?.title) return owner.title;
    return e.name;
  };
  return `<ul class="snd-players">${s.files.map((f) => `<li class="snd-player"><span class="snd-player-name">${esc(label(f))}</span> <audio controls preload="none" src="${p}${esc(f)}"></audio></li>`).join('')}</ul>`;
}

/** Where a sound plays, in a few words (the Still missing list). */
function soundFor(e, info) {
  const s = e.sound;
  if (s.moment) return s.moment;
  const parts = [
    ...s.where.things.map((t) => (t.key ? info(t.key)?.name : t.name)).filter(Boolean),
    ...s.where.streets.map((x) => x.name),
    ...s.where.systems,
    ...s.themeWords.map((w) => `${w} music`),
  ];
  const uniq = [...new Set(parts)];
  if (uniq.length) return andList(uniq.slice(0, 4)) + (uniq.length > 4 ? ` and ${fmt(uniq.length - 4)} more` : '');
  return ['region', 'street', 'event', 'musicblock'].includes(e.groupKey) ? 'Music' : '';
}

function soundPage(e, P, { info, d }) {
  const p = '../../../';
  const s = e.sound;
  const link = (key) => (info(key) ? `<a href="${P.href(key)}">${esc(info(key).name)}</a>` : esc(d.nameOf(key) || key));
  // One stand-in by name; a set of them (a music set the remake picks one of) as the players below.
  const standins = s.standins.length === 1 ? standinWords(s.standins[0], P, info) : 'one of these recordings';
  const NOW = {
    snd_original: s.remakeOnly ? 'New in the remake, it plays one of Tiny Speck’s own recordings.' : 'The remake plays Tiny Speck’s own recording.',
    snd_standin: s.remakeOnly ? `New in the remake, it borrows ${standins}.` : `The original recording is still missing, so the remake plays ${standins} in its place.`,
    snd_synth: s.remakeOnly ? 'New in the remake: a short tone the remake makes itself.' : 'The original recording is still missing, so the remake plays a short tone it makes itself.',
    snd_silent: s.dead ? 'Silent, as in the original: Tiny Speck’s final game no longer played this sound.' : 'Silent, as in the original: the street is meant to be quiet.',
    snd_missing: 'Nothing plays yet: the original recording is still missing, and the remake has no stand-in for it.',
  };
  const now = `<p class="cat-status-text">${NOW[e.status]}</p>${soundPlayers(e, p, info)}`;

  const orig = [];
  if (s.moment) orig.push(`<p class="cat-desc">${esc(stop(s.moment))}</p>`);
  if (s.themeWords.length) orig.push(`<p>Part of the ${andList(s.themeWords.map(esc))} music.</p>`);
  if (s.remakeOnly) orig.push('<p>The original game had no sound here. This one is new in the remake, so nothing is missing.</p>');
  else if (s.original) {
    const from = s.original.from ? `, from ${esc(s.original.from)}${s.original.bestFit ? ', the closest match by name' : ''}` : '';
    orig.push(`<p>The original recording: ${s.original.name ? `<strong>${esc(s.original.name)}</strong>` : 'Tiny Speck’s own'}${from}.</p>`);
    if (s.original.shared) orig.push(`<p>It is the same recording as ${link(`sounds:${s.original.shared.toLowerCase()}`)}.</p>`);
  } else if (s.dead) orig.push('<p>Tiny Speck’s code still names this sound, but the line that played it was switched off before the game closed.</p>');
  else if (e.status === 'snd_silent') orig.push('<p>Tiny Speck’s streets name it for a street that plays no music.</p>');
  else {
    orig.push(`<p>The original recording has not been found yet. ${s.lostName ? `Tiny Speck’s file was called <strong class="snd-miss-file">${esc(s.lostName)}</strong>.` : 'Its file name is not known.'}</p>${askBox(p)}`);
  }
  orig.push(`<p class="cat-source">${SOUND_LICENCE}</p>`);

  // Where it plays.
  const plainTile = (name) => `<li><span class="ency-tile ency-tile-plain"><span class="ency-tile-pic">${P.img(null)}</span> <span class="ency-tile-name">${esc(name)}</span></span></li>`;
  const things = s.where.things.map((t) => (t.key && info(t.key) ? P.tile(t.key) : plainTile(t.key ? d.nameOf(t.key) || t.key : t.name)));
  const streetChip = (st) => P.chip(`${esc(st.name)}${st.place && info(st.place) ? `, ${esc(info(st.place).name)}` : ''}`, { link: st.place && info(st.place) ? `${P.href(st.place)}#${esc(st.anchor)}` : null, cls: 'ency-place' });
  const loops = s.where.streets.filter((x) => x.music).map(streetChip);
  const plays = s.where.streets.filter((x) => !x.music).map(streetChip);
  const regions = e.refs.filter((r) => r.rel === 'region-music').map((r) => P.chip(esc(info(r.to).name), { pic: info(r.to).icon, link: P.href(r.to), cls: 'ency-place' }));
  const region = s.region ? d.sounds.regions.find((r) => r.id === s.region.id) : null;
  const where = [
    regions.length ? sub('Regions', `<p class="ency-lead-small">The remake plays ${region.tracks > 1 ? `the ${esc(region.label)} set` : 'it'} in ${regions.length === 1 ? 'this region' : `these ${fmt(regions.length)} regions`}${region.tracks > 1 ? ', one track after another' : ''}${region.others.length ? `; ${region.others.length === regions.length ? 'they are' : 'some are'} the regions with no set of their own` : ''}.</p>${P.chips(regions)}`) : '',
    loops.length ? sub('Streets it loops on', P.chips(loops)) : '',
    things.length ? sub('Things that play it', P.tiles(things)) : '',
    plays.length ? sub('Streets it plays on', P.chips(plays)) : '',
    s.where.systems.length ? sub('In the game', P.chips(s.where.systems.map((w) => P.chip(esc(w))))) : '',
  ].filter(Boolean).join('\n        ');
  const whereBody = where || `<p class="cat-muted">${s.remakeOnly ? 'The remake plays it at the moment above.' : 'Tiny Speck’s game lists it, but nothing that survives says where it played.'}</p>`;
  return `${entryHead(e, P, { subline: `Sound key <span class="ency-key">${esc(s.key)}</span>` })}
  <main>
${band('now-h', 'What plays now', now)}
${band('orig-h', s.remakeOnly ? 'About this sound' : 'In Tiny Speck’s game', orig.join('\n        '), { alt: true })}
${band('where-h', 'Where it plays', whereBody)}
  </main>`;
}

/** The section's counts, from the entries: the sounds of the original by status, and those new in the remake. */
export function soundCounts(list) {
  const orig = list.filter((e) => !e.sound.remakeOnly);
  const miss = orig.filter(stillMissing);
  const n = (l, st) => l.filter((e) => e.status === st).length;
  return {
    all: list.length, total: orig.length, original: n(orig, 'snd_original'), silent: n(orig, 'snd_silent'),
    still: miss.length, stillStandin: n(miss, 'snd_standin'), stillSynth: n(miss, 'snd_synth'), stillNothing: n(miss, 'snd_missing'),
    back: orig.filter((e) => e.sound.original && e.status !== 'snd_original').length, remake: list.length - orig.length,
    byStatus: Object.fromEntries(SOUND_STATUSES.map((st) => [st, n(list, st)])),
  };
}
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
const stillWords = (c) => `${plural(c.stillStandin, 'plays', 'play')} a stand-in recording for now, ${fmt(c.stillSynth)} a synth stand-in, and ${plural(c.stillNothing, 'plays', 'play')} nothing yet`;

function soundsIndex(sec, list, info, nameOf) {
  const p = '../../';
  const P = makeParts(p, info, nameOf);
  const c = soundCounts(list);
  const groups = SOUND_GROUPS.map((g) => ({ ...g, list: list.filter((e) => e.groupKey === g.key) })).filter((g) => g.list.length);
  const tile = (e) => P.tile(e.key, { sub: `<span class="cat-st st-${esc(e.status)}">${esc(statusLabel(e.status))}</span>` })
    .replace('<li>', `<li data-name="${esc(`${e.name} ${e.sound.key}`.toLowerCase())}" data-status="${esc(e.status)}">`);
  const groupHtml = groups.map((g) => {
    let inner;
    if (g.key === 'region') {
      const sets = [...new Set(g.list.map((e) => e.sound.region.id))];
      inner = sets.map((id) => {
        const tracks = g.list.filter((e) => e.sound.region.id === id).sort((a, b) => a.sound.region.n - b.sound.region.n);
        const places = tracks[0].refs.filter((r) => r.rel === 'region-music' && info(r.to)).map((r) => P.chip(esc(info(r.to).name), { link: P.href(r.to), cls: 'ency-place' }));
        const label = tracks[0].name.replace(/ track \d+$/, '');
        return `<div class="snd-sub"><h3>${esc(label)} <span class="count">${fmt(tracks.length)}</span></h3>${P.chips(places)}${P.tiles(tracks.map(tile), 'ency-grid')}</div>`;
      }).join('\n        ');
    } else inner = P.tiles(g.list.map(tile), 'ency-grid');
    return `<section class="ency-group" id="g-${esc(g.key)}" aria-label="${esc(g.label)}" data-group="${esc(g.label)}"><h2>${esc(g.label)} <span class="count">${fmt(g.list.length)}</span></h2><p class="snd-blurb">${esc(g.blurb)}</p>${inner}</section>`;
  }).join('\n      ');
  const chips = SOUND_STATUSES.map((st) => `<li><a class="chip" href="#st-${st}" data-st="${st}"><span class="dot st-${st}" aria-hidden="true"></span><span>${esc(statusLabel(st))}</span> <span class="count">${fmt(c.byStatus[st])}</span></a></li>`).join('');
  const byStatus = SOUND_STATUSES.filter((st) => c.byStatus[st]).map((st) => `<h3 id="st-${st}"><span class="dot st-${st}" aria-hidden="true"></span> ${esc(statusLabel(st))} <span class="count">${fmt(c.byStatus[st])}</span></h3>
        <p class="snd-blurb">${esc(SOUND_MEANS[st])}</p>
        <ul class="snd-names">${list.filter((e) => e.status === st).map((e) => `<li><a href="${e.id}/">${esc(e.name)}</a></li>`).join('')}</ul>`).join('\n        ');
  const body = `
  <header class="masthead note-head cat-head">
    <div class="wrap">
      <p class="kicker"><a href="../">Groddle Encyclopedia</a> · ${esc(sec.label)}</p>
      <h1>${esc(sec.label)}</h1>
      <p class="lead">Every tune and sound Tiny Speck’s game played, what the remake plays for it today, and where it plays. If you are here to help, the <a href="${STILL_MISSING}/">Still missing</a> list shows what we are still looking for.</p>
      <p class="cat-score"><strong>${fmt(c.original)}</strong> of ${fmt(c.total)} sounds and tunes from the original game play Tiny Speck’s own recording.</p>
      <p class="cat-note">${fmt(c.still)} are still missing their recording: ${stillWords(c)}. ${c.back ? `${plural(c.back, 'has', 'have')} its recording back but ${c.back === 1 ? 'plays' : 'play'} another for now. ` : ''}${plural(c.silent, 'is', 'are')} silent, as in the original. ${plural(c.remake, 'more is', 'more are')} new in the remake.</p>
      <ul class="snd-status" role="group" aria-label="Status">${chips}</ul>
    </div>
  </header>

  <main class="band cat-main">
    <div class="wrap">
      <div class="cat-tools">
        <label class="history-search cat-search" for="q">
          <span class="visually-hidden">Filter music and sounds</span>
          <input id="q" type="search" placeholder="Filter by name or sound key" autocomplete="off" spellcheck="false" data-filter />
        </label>
        <div class="cat-selects">
          <label><span>Group</span>
            <select id="grp" data-group>
              <option value="">All groups</option>
${groups.map((g) => `              <option value="${esc(g.label)}">${esc(g.label)} (${fmt(g.list.length)})</option>`).join('\n')}
            </select>
          </label>
        </div>
      </div>
      <ul class="snd-jump" aria-label="Groups">${groups.map((g) => `<li><a href="#g-${esc(g.key)}">${esc(g.label)}</a></li>`).join(' ')}</ul>
      <p class="cat-count" id="count" aria-live="polite">${fmt(list.length)} sounds</p>
      ${groupHtml}
      <section class="snd-by-status" id="by-status" aria-labelledby="by-status-h">
        <h2 id="by-status-h">By status</h2>
        ${byStatus}
      </section>
      <p class="cat-source">${SOUND_LICENCE}</p>
    </div>
  </main>
`;
  return shell({ p, title: `${sec.label} · Groddle Encyclopedia`, description: `${sec.blurb} ${c.original} of ${c.total} play Tiny Speck’s own recording in the Groddle Afternoon remake.`, body, script: true });
}

function stillMissingPage(list, info, nameOf) {
  const p = '../../../';
  const P = makeParts(p, info, nameOf);
  const c = soundCounts(list);
  const miss = list.filter(stillMissing);
  const groups = SOUND_GROUPS.map((g) => ({ ...g, list: miss.filter((e) => e.groupKey === g.key) })).filter((g) => g.list.length);
  const row = (e) => `<li id="${esc(e.id)}"><span class="snd-miss-name"><a href="${P.href(e.key)}">${esc(e.name)}</a> <span class="ency-key">${esc(e.sound.key)}</span></span> <span class="snd-miss-file">${e.sound.lostName ? esc(e.sound.lostName) : 'file name not known'}</span> <span class="snd-miss-for">${esc(soundFor(e, info))}</span> <span class="cat-st st-${esc(e.status)}">${esc(statusLabel(e.status))}</span></li>`;
  const body = `
  <header class="masthead note-head cat-head">
    <div class="wrap">
      <p class="kicker"><a href="../../">Groddle Encyclopedia</a> · <a href="../">Music and sounds</a> · Still missing</p>
      <h1>Still missing</h1>
      <p class="lead">${fmt(c.still)} sounds and tunes from the original game are still missing their recording: ${stillWords(c)}. If you kept any of them, from the game, its website or anywhere else, they would help.</p>
      ${askBox(p)}
    </div>
  </header>

  <main class="band cat-main">
    <div class="wrap">
      <p class="ency-lead-small">Each one with the name of Tiny Speck’s file, where it is known, what it was for, and what the remake plays for now.</p>
      ${groups.map((g) => `<section class="ency-group" id="g-${esc(g.key)}" aria-label="${esc(g.label)}"><h2>${esc(g.label)} <span class="count">${fmt(g.list.length)}</span></h2><ul class="snd-miss">${g.list.map(row).join('')}</ul></section>`).join('\n      ')}
      ${askBox(p)}
      <p class="cat-source">${SOUND_LICENCE}</p>
    </div>
  </main>
`;
  return shell({ p, title: 'Still missing · Music and sounds · Groddle Encyclopedia', description: `${c.still} sounds and tunes from Tiny Speck’s game whose recordings are still missing. Have one? Email ${EMAIL}.`, body, script: true });
}

/* -- Indexes -------------------------------------------------- */

const GROUP_WORD = { quests: 'Kind', animals: 'Kind', people: 'Kind', skills: 'Category', places: 'Kind', achievements: 'Category', sounds: 'Group' };

function sectionIndex(sec, list, info, nameOf) {
  const p = '../../';
  const P = makeParts(p, info, nameOf);
  const groups = [...new Set(list.map((e) => e.group))];
  const inCount = list.filter((e) => inRemake(e.status)).length;
  const groupHtml = groups.map((g) => {
    const rows = list.filter((e) => e.group === g).map((e) => P.tile(e.key, { sub: `<span class="cat-st st-${esc(e.status)}">${esc(statusLabel(e.status))}</span>${neverReleased(e.key) ? ` ${neverReleasedTag()}` : ''}` }).replace('<li>', `<li data-name="${esc(e.name.toLowerCase())}">`));
    return `<section class="ency-group" aria-label="${esc(g)}" data-group="${esc(g)}"><h2>${esc(g)} <span class="count">${fmt(rows.length)}</span></h2>${P.tiles(rows, 'ency-grid')}</section>`;
  }).join('\n      ');
  const body = `
  <header class="masthead note-head cat-head">
    <div class="wrap">
      <p class="kicker"><a href="../">Groddle Encyclopedia</a> · ${esc(sec.label)}</p>
      <h1>${esc(sec.label)}</h1>
      <p class="lead">${esc(sec.blurb)}</p>
      <p class="cat-score"><strong>${fmt(inCount)}</strong> of ${fmt(list.length)} are in the remake.</p>
    </div>
  </header>

  <main class="band cat-main">
    <div class="wrap">
      <div class="cat-tools">
        <label class="history-search cat-search" for="q">
          <span class="visually-hidden">Filter ${esc(sec.label.toLowerCase())}</span>
          <input id="q" type="search" placeholder="Filter by name" autocomplete="off" spellcheck="false" data-filter />
        </label>
${groups.length > 1 ? `        <div class="cat-selects">
          <label><span>${esc(GROUP_WORD[sec.key])}</span>
            <select id="grp" data-group>
              <option value="">All ${esc(GROUP_WORD[sec.key].toLowerCase())}s</option>
${groups.map((g) => { const pic = list.find((e) => e.group === g && e.icon)?.icon; return `              <option value="${esc(g)}"${pic ? ` data-icon="${p}${esc(pic.src)}"` : ''}>${esc(g)} (${fmt(list.filter((e) => e.group === g).length)})</option>`; }).join('\n')}
            </select>
          </label>
        </div>\n` : ''}
      </div>
      <p class="cat-count" id="count" aria-live="polite">${fmt(list.length)} ${esc(sec.label.toLowerCase())}</p>
      ${groupHtml}
    </div>
  </main>
`;
  return shell({ p, title: `${sec.label} · Groddle Encyclopedia`, description: `${sec.blurb} ${inCount} of ${list.length} are in the Groddle Afternoon remake.`, body, script: true });
}

function homePage(bySection, items, info, nameOf) {
  const p = '../';
  const P = makeParts(p, info, nameOf);
  const itemsIn = [...items.values()].filter((i) => inRemake(i.status)).length;
  const sample = { quests: 'quests:animalkinship_nibble_meat', animals: 'animals:npc_piggy', people: 'people:street_spirit', skills: 'skills:animalkinship_1', places: 'places:groddle-meadow', achievements: 'achievements:bacon_biter', sounds: 'sounds:musicblock_d_green_01' };
  const blurbOf = (s) => {
    if (s.key !== 'sounds') return s.blurb;
    const c = soundCounts(bySection.sounds);
    return `${s.blurb} ${fmt(c.original)} of ${fmt(c.total)} play Tiny Speck’s own recording.`;
  };
  const card = (href, label, n, blurb, pic) => `<li><a class="ency-card" href="${href}">${P.img(pic, 'ency-card-ic', 64)}<span class="ency-card-text"><span class="ency-card-name">${esc(label)} <span class="count">${fmt(n)}</span>${sep('.')}</span> <span class="ency-card-blurb">${esc(blurb)}</span></span></a></li>`;
  const cards = [
    card('items/', 'Items', items.size, `Every item, how to get it and what it is for. ${fmt(itemsIn)} are in the remake.`, info('item:apple')?.icon),
    ...SECTIONS.map((s) => card(`${s.key}/`, s.label, bySection[s.key].length, blurbOf(s), info(sample[s.key])?.icon || bySection[s.key][0]?.icon)),
  ];
  const body = `
  <header class="masthead note-head cat-head">
    <div class="wrap">
      <p class="kicker">Groddle Field Notes · Encyclopedia</p>
      <h1>Groddle Encyclopedia</h1>
      <p class="lead">Stuck on a quest? Look up the quest, the creature, the person or the place: how to get it, every step, and where to go. Everything here comes from Tiny Speck’s own game code, with what the remake has today, down to every tune and sound.</p>
      <label class="history-search cat-search ency-search" for="q">
        <span class="visually-hidden">Search the encyclopedia</span>
        <input id="q" type="search" placeholder="Search, e.g. rasher, piggy, alchemy, Groddle Meadow" autocomplete="off" spellcheck="false" data-search="search.json" />
      </label>
      <div class="chips ency-filter" role="group" aria-label="Section" id="sections" hidden></div>
    </div>
  </header>

  <main class="band cat-main">
    <div class="wrap">
      <p class="cat-count" id="count" aria-live="polite"></p>
      <div id="results"></div>
      <ul class="ency-cards" id="cards">
        ${cards.join('\n        ')}
      </ul>
    </div>
  </main>
`;
  return shell({ p, title: 'Groddle Encyclopedia', description: 'Quests, animals, people, skills, places, achievements, music and sounds, and items from Tiny Speck’s game, with how to get each one and its status in the Groddle Afternoon remake.', body, script: true });
}

/* -- Write / check ------------------------------------------ */

const STATIC = new Set(['encyclopedia.js']);
/** The Items section's folder: tools/catalog/build.mjs writes and checks it, so it is never a stray here. */
const CATALOG = `${OUT}/items`;

function strays(files) {
  const out = [];
  const dir = join(PUB, OUT);
  if (!existsSync(dir)) return out;
  const walk = (rel) => {
    for (const d of readdirSync(join(PUB, rel), { withFileTypes: true })) {
      const path = `${rel}/${d.name}`;
      if (path === CATALOG) continue;
      if (d.isDirectory()) {
        if (!Object.keys(files).some((f) => f.startsWith(`${path}/`))) out.push(`${path}/`);
        else walk(path);
      } else if (!files[path] && !(rel === OUT && STATIC.has(d.name))) out.push(path);
    }
  };
  walk(OUT);
  return out;
}

export function staleFiles(files) {
  const stale = Object.entries(files)
    .filter(([path, text]) => !existsSync(join(PUB, path)) || readFileSync(join(PUB, path), 'utf8') !== text)
    .map(([path]) => path);
  return [...stale, ...strays(files)];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t0 = performance.now();
  const { files, counts, leftOut } = await buildEncyclopedia();
  console.log(`Blank stubs left out: ${Object.entries(leftOut).map(([k, l]) => `${l.length} ${k}`).join(', ')}`);
  if (process.argv.includes('--check')) {
    const stale = staleFiles(files);
    if (stale.length) {
      console.error(`Encyclopedia is stale (${stale.length} files, e.g. ${stale.slice(0, 5).join(', ')}): run node tools/encyclopedia/build.mjs`);
      process.exit(1);
    }
    console.log(`Encyclopedia is current (${Object.keys(files).length} files, ${Math.round(performance.now() - t0)} ms)`);
  } else {
    for (const path of strays(files)) rmSync(join(PUB, path), { recursive: true });
    let wrote = 0;
    for (const [path, text] of Object.entries(files)) {
      const abs = join(PUB, path);
      if (existsSync(abs) && readFileSync(abs, 'utf8') === text) continue;
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text);
      wrote += 1;
    }
    console.log(`${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')}; ${wrote} files written -> ${relative(root, join(PUB, OUT))}/ (${Math.round(performance.now() - t0)} ms)`);
  }
}
