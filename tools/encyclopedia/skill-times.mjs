/**
 * How long timed skills take (register G956, Austin 2026-11-17): a table per
 * skill package whose time changes with the skill's rank or with a speed
 * card, shown on each skill page in it (that rank's row marked) and on each
 * speed card's Imagination page (that card's column marked).
 *
 * Every number comes from skillPackageDetails (public/js/skill-packages.js,
 * the port of GSJS players/inc_skill_packages.js getSkillPackageDetails
 * 585-677) over public/js/skill-packages-data.js (GSJS
 * items/catalog_skill_packages.js): one call per rank and best card owned.
 * Nothing here is typed by hand except the words. A package the remake runs
 * at its own pace (public/js/pace.js, G983: mining at 0.3 of Glitch's time)
 * shows the time the game takes, with Glitch's own in its note.
 *
 * Which packages: any with a time on at least one row, and either times that
 * differ between rows or a card with a duration_multiplier, leaving out the
 * ones the original game never ran (skill-bubbles.js GSJS_SKILL_PACKAGES:
 * the transmogrification machines' packages were read for details or not at
 * all, so their times never applied). Packages whose tables come out the
 * same (a Pick and a Fancy Pick) share one table.
 */
import { SKILL_PACKAGES, skillPackageDetails } from '../../public/js/skill-packages.js?v=bfb87281';
import { GSJS_SKILL_PACKAGES } from '../../public/js/skill-bubbles.js?v=f1bbe298';
import { IMAGINATION_UPGRADES } from '../../public/js/imagination.js?v=1bdfd77c';
import { pace, paceFor, pacedSystemOf } from '../../public/js/pace.js?v=c07dfbd8';
import { cardName } from './imagination.mjs';
import { esc, fmt, orList, andList } from './parts.mjs';

/** Our words for each package: what you do, and the thing (so shared tables read "a Pick or a Fancy Pick"). */
const WORDS = {
  ak_butterfly_massage: ['Massaging', 'a butterfly'],
  ak_butterfly_milk: ['Milking', 'a butterfly'],
  ak_chicken_squeeze: ['Squeezing', 'a chicken'],
  ak_piggy_nibble: ['Nibbling', 'a piggy'],
  ak_piggy_pet: ['Petting', 'a piggy'],
  barnacle_refining: ['Refining', 'barnacles in a grinder'],
  croppery_clear: ['Clearing', 'a crop plot'],
  croppery_water: ['Watering', 'a crop plot'],
  dig_dirt_pile: ['Digging', 'a dirt pile'],
  dig_patch: ['Digging', 'a patch'],
  focused_meditation: ['Focused meditation', 'with a focusing orb'],
  gardening_harvest: ['Harvesting', 'a tree'],
  herbalism_clear: ['Clearing', 'an herb plot'],
  herbalism_water: ['Watering', 'an herb plot'],
  ice_scraping: ['Scraping', 'an ice knob'],
  jellisac_scooping: ['Scooping', 'a jellisac clump'],
  lgt_egg_plant_pet: ['Petting', 'an Egg Plant'],
  light_green_thumb_pet: ['Petting', 'a tree'],
  light_green_thumb_water: ['Watering', 'a tree'],
  meditative_arts: ['Meditating', 'with a focusing orb'],
  mining: ['Mining a rock with', 'a Pick'],
  mining_fancypick: ['Mining a rock with', 'a Fancy Pick'],
  peat_harvest: ['Harvesting', 'a peat bog'],
  refining: ['Refining', 'rocks in a grinder'],
  scraping: ['Scraping', 'barnacles'],
  soil_appreciation: ['Tending', 'a patch'],
  transcendental_radiation: ['Transcendental radiation', 'with a focusing orb'],
  wood_tree_pet: ['Petting', 'a Wood Tree'],
  wood_tree_water: ['Watering', 'a Wood Tree'],
};

/** A note under a table, where the game adds to the package's own numbers. */
const NOTES = {
  refining: 'The grinder adds a little time for each item in the stack, and its energy and tool wear grow with the stack too.',
  barnacle_refining: 'The grinder adds a little time for each item in the stack, and its energy and tool wear grow with the stack too.',
  transcendental_radiation: 'The game then rounds each go to a whole number of 3 second steps.',
};

/** The cards that change a package's time, in the order the game ranks them. */
function speedCards(pkg) {
  return Object.entries(pkg.img_upgrades || {}).filter(([, img]) => img.duration_multiplier).map(([id, img]) => ({ id, multiplier: img.duration_multiplier }));
}

/** The skill rows of a package, lowest rank first ("no_skill" is rank -1). */
const skillRows = (pkg) => Object.entries(pkg.skills || {}).sort((a, b) => Number(a[1].rank) - Number(b[1].rank)).map(([id]) => id);

/** The inputs for one cell: the skill learned (none for no_skill), and every speed card up to the column's (the best owned counts). */
export const learnedFor = (skill) => (skill === 'no_skill' ? [] : [skill]);
export const cardsFor = (cards, col) => cards.slice(0, col).map((c) => c.id);

/** True when a package's time changes with rank or a card (the rule above). */
export function isTimed(pkg, id = '') {
  if (/never run|details only|test package/.test(GSJS_SKILL_PACKAGES[id] || '')) return false;
  const rows = Object.values(pkg?.skills || {});
  if (!rows.some((r) => r.duration)) return false;
  const times = new Set(rows.map((r) => `${r.duration}|${r.duration_max}`));
  return times.size > 1 || speedCards(pkg).length > 0;
}

/** A time at the package's pace in the remake (Glitch's own unless pace.js names its system). */
const paced = (system, ms) => (system && ms ? pace(system, ms) : ms ?? null);

function tableOf(id) {
  const pkg = SKILL_PACKAGES[id];
  const cards = speedCards(pkg);
  const system = pacedSystemOf(id);
  const rows = skillRows(pkg).map((skill) => {
    const base = skillPackageDetails(id, learnedFor(skill));
    const cells = [0, ...cards.map((_, i) => i + 1)].map((col) => {
      const d = skillPackageDetails(id, learnedFor(skill), cardsFor(cards, col));
      return { duration: paced(system, d.duration), max: paced(system, d.duration_max) };
    });
    return { skill, cells, glitch: base.duration ?? null, energy: base.energy_cost ?? null, wear: base.tool_wear ?? null };
  });
  return { ids: [id], cards, rows, paced: system, energy: rows.some((r) => r.energy !== null), wear: rows.some((r) => r.wear !== null) };
}

const SHARE = { 2: 'half', 3: 'a third', 4: 'a quarter', 5: 'a fifth' };
/** A paced table's note: the remake's pace in words, and Glitch's own times ("a third of Glitch's 20/14/10/8 s"). */
export function paceNote(t) {
  if (!t.paced) return '';
  const p = paceFor(t.paced);
  const n = Math.round(1 / p);
  const share = Math.abs(1 / p - n) < 1e-9 ? SHARE[n] : SHARE[n] ? `about ${SHARE[n]}` : `${fmt(Math.round(p * 100))}%`;
  const glitch = t.rows.filter((r) => r.glitch).map((r) => fmt(Math.round(r.glitch) / 1000));
  return `These are the remake's times, ${share} of Glitch's ${glitch.join('/')} s (players found Glitch's pace too slow).`;
}

/** Every timed package's table, packages with the same numbers sharing one. */
export const TIME_TABLES = (() => {
  const out = [];
  const byShape = new Map();
  for (const id of Object.keys(SKILL_PACKAGES)) {
    if (!isTimed(SKILL_PACKAGES[id], id)) continue;
    const t = tableOf(id);
    const shape = JSON.stringify([t.cards, t.rows]);
    if (byShape.has(shape)) byShape.get(shape).ids.push(id);
    else { byShape.set(shape, t); out.push(t); }
  }
  return out;
})();

/** The tables a skill page or a card page shows. */
export const tablesForSkill = (skill) => TIME_TABLES.filter((t) => t.rows.some((r) => r.skill === skill));
export const tablesForCard = (card) => TIME_TABLES.filter((t) => t.cards.some((c) => c.id === card));

const seconds = (ms) => fmt(Math.round(ms) / 1000);
/** One cell's words: "20 s", "2 to 11 s", or "instant" (no time: the game skips the wait). */
export function timeText({ duration, max }) {
  if (!duration && !max) return 'instant';
  return max ? `${seconds(duration)} to ${seconds(max)} s` : `${seconds(duration)} s`;
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** The table's heading, and when packages share it, a line saying so. */
function heading(t) {
  const words = t.ids.map((id) => WORDS[id] || [SKILL_PACKAGES[id].name, '']);
  const verb = words[0][0];
  if (words.every((w) => w[0] === verb)) {
    const things = words.map((w) => w[1]);
    return { title: `${verb} ${orList(things)}`.trim(), shared: t.ids.length > 1 ? `${capital(andList(things))} take the same time, energy and wear.` : '' };
  }
  return { title: orList(words.map((w) => `${w[0]} ${w[1]}`.trim())), shared: `${capital(andList(words.map((w) => `${w[0].toLowerCase()} ${w[1]}`.trim())))} take the same time, energy and wear.` };
}

const cardLabel = (id) => (IMAGINATION_UPGRADES[id] ? cardName(IMAGINATION_UPGRADES[id]) : id);
const pct = (m) => `${fmt(Math.round(Math.abs(m) * 1000) / 10)}%`;

/** What one card does to a table's time, in words. */
export function cardEffect(t, card) {
  const c = t.cards.find((x) => x.id === card);
  if (!c) return '';
  if (c.multiplier >= 1) return 'It takes the wait away.';
  return c.multiplier > 0 ? `It cuts the time by ${pct(c.multiplier)}.` : `It makes each go last ${pct(c.multiplier)} longer.`;
}

/**
 * One table. `skill` marks that rank's row, `card` that card's column.
 * P is build.mjs's page parts (makeParts), info names the keys that have pages.
 */
export function timeTableHtml(t, P, info, { skill = '', card = '' } = {}) {
  const { title, shared } = heading(t);
  const col = card ? t.cards.findIndex((c) => c.id === card) + 1 : -1;
  const here = ' class="ency-time-here"';
  const link = (key, name) => (info(key) ? `<a href="${P.href(key)}">${esc(name)}</a>` : esc(name));
  const heads = t.cards.length
    ? ['No card', ...t.cards.map((c, i) => `<span class="ency-time-with">with</span> ${i + 1 === col ? `<strong>${esc(cardLabel(c.id))}</strong> <span class="ency-time-mark">(this card)</span>` : link(`imagination:${c.id}`, cardLabel(c.id))}`)]
    : ['Time'];
  const th = [
    '<th scope="col">Skill</th>',
    ...heads.map((h, i) => `<th scope="col" class="num-col${i === col ? ' ency-time-here' : ''}">${h}</th>`),
    t.energy ? '<th scope="col" class="num-col">Energy</th>' : '',
    t.wear ? '<th scope="col" class="num-col">Tool wear</th>' : '',
  ].join('');
  const tr = t.rows.map((r) => {
    const mine = r.skill === skill;
    const name = r.skill === 'no_skill' ? 'Without the skill' : info(`skills:${r.skill}`)?.name || r.skill;
    const rowHead = mine ? `<strong>${esc(name)}</strong> <span class="ency-time-mark">(this skill)</span>` : r.skill === 'no_skill' ? esc(name) : link(`skills:${r.skill}`, name);
    const cells = r.cells.map((c, i) => `<td class="num-col${i === col ? ' ency-time-here' : ''}">${timeText(c)}</td>`);
    const n = (v) => (v === null ? 'none' : fmt(v));
    return `<tr${mine ? here : ''}><th scope="row">${rowHead}</th>${cells.join('')}${t.energy ? `<td class="num-col">${n(r.energy)}</td>` : ''}${t.wear ? `<td class="num-col">${n(r.wear)}</td>` : ''}</tr>`;
  }).join('\n          ');
  const notes = [
    card ? cardEffect(t, card) : '',
    shared,
    t.rows.some((r) => r.cells.some((c) => c.max)) ? 'Where a time is a range, each go takes a random time inside it.' : '',
    t.rows.some((r) => r.cells.some((c) => !c.duration && !c.max)) ? 'Instant means no wait at all.' : '',
    ...t.ids.map((id) => NOTES[id] || ''),
    paceNote(t),
  ].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
  return `<div class="ency-time" id="time-${esc(t.ids[0])}">
        <h3>${esc(title)}</h3>
        <div class="note-table-wrap"><table class="note-table ency-time-table">
          <thead><tr>${th}</tr></thead>
          <tbody>
          ${tr}
          </tbody>
        </table></div>
        ${notes.length ? `<p class="cat-muted ency-time-notes">${notes.map(esc).join(' ')}</p>` : ''}
        </div>`;
}

/** The band's lead: what the numbers are, and the speed card rule when a card is in play. */
export function timeLead(tables) {
  const cards = tables.some((t) => t.cards.length);
  const kinds = [tables.some((t) => t.energy) ? 'energy' : '', tables.some((t) => t.wear) ? 'tool wear' : ''].filter(Boolean);
  const costs = kinds.length ? `, and the ${andList(kinds)} it costs` : '';
  const faster = tables.some((t) => t.paced) ? ' Where a note says so, the remake runs the time faster than Glitch did.' : '';
  return `How long one go takes at each rank${costs}. The numbers are Tiny Speck’s game data, which the remake reads too.${faster}${cards ? ' With speed cards, only the best one you own counts.' : ''}`;
}
