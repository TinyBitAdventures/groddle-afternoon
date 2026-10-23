/**
 * Street-visit badge counters, as locations/location.js onPlayerEnter emits
 * them:
 *
 * - `locations_visited:<tsid>` on every visit (instances count as their
 *   template); OK Explorer, Rambler, Wanderer, Globetrotter and friends are
 *   group_count badges over it.
 * - `hubs_visited:<hub>` on every visit.
 * - `streets_visited_in_hub:number_<hub>` on the first visit to a street that
 *   countsTowardHubAchievement (the hub's own map lists it); every
 *   `<hub>_completist` badge is a counter on that label.
 * - `streets_visited_in_hub_<hub>:<tsid>` on every counting visit (Haraiva's
 *   Completist is a group_count over it).
 *
 * Remake rule: the public archive lost a few streets of most hubs (1 to 3 of
 * Groddle Forest's 41, all but 2 of Uralia's 4), so no Completist badge could
 * ever finish. When every street the archive kept for a hub has been visited,
 * the hub counter is topped up to the hub map's full street count.
 */

import { HUB_MAP_STREETS } from './hub-maps-data.js';

// js/hell.js noteNarakaVisit already counts Naraka's streets (its index rows
// leave Hell One Clone's hub blank), so hub 40 is left to it.
const HUBS_COUNTED_ELSEWHERE = new Set(['40']);

const mappedSets = new Map();
function mappedSet(hubId) {
  const key = String(hubId);
  if (!mappedSets.has(key)) mappedSets.set(key, new Set(HUB_MAP_STREETS[key] || []));
  return mappedSets.get(key);
}

/** True when the hub's own map lists the street (countsTowardHubAchievement). */
export function countsTowardHub(tsid, hubId) {
  return Boolean(tsid && hubId != null && mappedSet(hubId).has(tsid));
}

/**
 * Streets of a hub the remake can actually load: listed on the hub map,
 * present in the street index, and filed under that hub.
 * @param {string|number} hubId
 * @param {Record<string, { hubId?: string }>} indexStreets
 */
export function availableHubStreets(hubId, indexStreets = {}) {
  const key = String(hubId);
  return (HUB_MAP_STREETS[key] || []).filter((tsid) => String(indexStreets[tsid]?.hubId ?? '') === key);
}

/** Total streets the source hub map lists for a hub. */
export function hubMapStreetCount(hubId) {
  return (HUB_MAP_STREETS[String(hubId)] || []).length;
}

/**
 * The counters one street entry emits, in source order.
 * @param {object} args
 * @param {string} args.tsid           street (or instance template) tsid
 * @param {string|number} args.hubId
 * @param {string[]} [args.visitedInHub] counting streets of this hub already seen (before this visit)
 * @param {Record<string, object>} [args.indexStreets]
 * @returns {{ counter: string, amount: number }[]}
 */
export function streetVisitCounters({ tsid, hubId, visitedInHub = [], indexStreets = {} }) {
  if (!tsid) return [];
  const out = [{ counter: `locations_visited:${tsid}`, amount: 1 }];
  if (hubId == null || hubId === '') return out;
  const hub = String(hubId);
  out.push({ counter: `hubs_visited:${hub}`, amount: 1 });
  if (HUBS_COUNTED_ELSEWHERE.has(hub) || !countsTowardHub(tsid, hub)) return out;
  const seen = new Set(visitedInHub);
  if (!seen.has(tsid)) {
    seen.add(tsid);
    const available = availableHubStreets(hub, indexStreets);
    const allKept = available.length > 0 && available.every((id) => seen.has(id));
    // Top up to the full hub count once every kept street has been seen.
    const amount = allKept ? Math.max(1, hubMapStreetCount(hub) - (seen.size - 1)) : 1;
    out.push({ counter: `streets_visited_in_hub:number_${hub}`, amount });
  }
  out.push({ counter: `streets_visited_in_hub_${hub}:${tsid}`, amount: 1 });
  return out;
}

/**
 * Emit one street entry's counters through `apply(counter, amount)` and
 * remember the street under its hub (the hub list is what streetVisitCounters
 * checks next time, whether or not a badge counts that group).
 * @returns {any[]} everything `apply` returned, flattened
 */
export function applyStreetVisit({ state, tsid, hubId, indexStreets = {}, apply }) {
  const key = `streets_visited_in_hub_${hubId}`;
  const counters = streetVisitCounters({ tsid, hubId, visitedInHub: state.groups?.[key] || [], indexStreets });
  const results = [];
  for (const { counter, amount } of counters) results.push(...(apply(counter, amount) || []));
  if (counters.some((c) => c.counter === `${key}:${tsid}`)) {
    if (!state.groups || typeof state.groups !== 'object') state.groups = {};
    const list = state.groups[key] || (state.groups[key] = []);
    if (!list.includes(tsid)) list.push(tsid);
  }
  return results;
}

/* ------------------------------------------------------------------ loading card */

/**
 * The loading card's per-street history (players/inc_stats.js street_history
 * plus the locations_visited label count), kept in a street feature slot:
 * `{ visits, lastAt }` (lastAt in ms).
 */
export const STREET_VISITS_SLOT = 'street-visits';

/**
 * location.js getLoadingInfo, before this entry is counted:
 * visit_count is the visits so far, first_visit when there are none, and
 * last_visit_mins = round((now - last entry) / 60 s), 0 when unknown.
 * `knownVisits` credits saves from before the history was kept (a street the
 * world save already holds counts as one visit with no time).
 * @param {{ visits?: number, lastAt?: number }|null} slot
 * @param {{ now?: number, knownVisits?: number, instance?: boolean }} [opts]
 */
export function streetLoadingVisit(slot, { now = Date.now(), knownVisits = 0, instance = false } = {}) {
  const visits = Math.max(Number(slot?.visits) || 0, Number(knownVisits) || 0);
  const lastAt = Number(slot?.lastAt) || 0;
  return {
    firstVisit: !instance && visits === 0,
    visitCount: visits,
    lastVisitMins: lastAt ? Math.max(0, Math.round((now - lastAt) / 60000)) : 0,
  };
}

/** onPlayerEnter: count the visit and stamp the time. */
export function recordStreetEntry(slot, now = Date.now(), knownVisits = 0) {
  if (!slot || typeof slot !== 'object') return slot;
  slot.visits = Math.max(Number(slot.visits) || 0, Number(knownVisits) || 0) + 1;
  slot.lastAt = now;
  return slot;
}

/** StringUtil.formatNumberWithCommas. */
function withCommas(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * StringUtil.formatTime(sec, display_sec_txt = true, use_short_form = false,
 * max_to_show = 0): "270 days 15 hours 5 mins"; maxToShow trims the tail and
 * marks it "~".
 */
export function formatLoadingTime(sec, { displaySec = true, maxToShow = 0 } = {}) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  let secTxt = `${s % 60}${s % 60 === 1 ? ' sec' : ' secs'}`;
  const mins = Math.floor(s / 60) % 60;
  let minTxt = mins > 0 ? `${mins}${mins === 1 ? ' min' : ' mins'}` : '';
  const hours = Math.floor(s / 3600) % 24;
  let hourTxt = hours > 0 ? `${hours}${hours === 1 ? ' hour' : ' hours'}` : '';
  const days = Math.floor(s / 86400);
  let dayTxt = days > 0 ? `${withCommas(days)}${days === 1 ? ' day' : ' days'}` : '';
  if (s % 60 === 0 || !displaySec) secTxt = '';
  if (minTxt && secTxt) minTxt += ' ';
  if (hourTxt && (minTxt || secTxt)) hourTxt += ' ';
  if (dayTxt && (hourTxt || minTxt || secTxt)) dayTxt += ' ';
  if (maxToShow > 0) {
    const showing = [dayTxt, hourTxt, minTxt, secTxt].filter(Boolean);
    let approx = false;
    while (showing.length > maxToShow) {
      showing.pop();
      approx = true;
    }
    return `${approx ? '~' : ''}${showing.join('').replace(/ $/, '')}`;
  }
  if (hours > 8 && !displaySec) {
    minTxt = '';
    secTxt = '';
    hourTxt = hourTxt.replace(/ $/, '');
  }
  if (days > 1 && !displaySec) {
    hourTxt = '';
    minTxt = '';
    secTxt = '';
    dayTxt = dayTxt.replace(/ $/, '');
  }
  return dayTxt + hourTxt + minTxt + secTxt;
}

/** StringUtil.addSuffix: 1st, 2nd, 3rd, 4th, 11th, 21st. */
export function ordinal(num) {
  const n = Math.trunc(Number(num) || 0);
  const str = String(Math.abs(n));
  const lastTwo = parseInt(str.slice(-2), 10);
  const baseTen = Math.abs(n) % 10;
  return `${n}${(lastTwo < 11 || lastTwo > 19) && baseTen < 4 ? ['th', 'st', 'nd', 'rd'][baseTen] : 'th'}`;
}

/**
 * LoadingLocationView.showRegular: the line above the street picture, as the
 * client's HTML (<b> and the highlight span).
 * @param {{ firstVisit?: boolean, visitCount?: number, lastVisitMins?: number, qurazyHere?: boolean }} info
 */
export function loadingVisitLine(info = {}) {
  let txt = '';
  if (info.firstVisit) {
    txt = info.qurazyHere
      ? '<span class="st-hl">First time here!</span> <b>Find the Qurazy Quoin:</b>'
      : '<span class="st-hl">First time here!</span>';
  } else if (info.lastVisitMins) {
    txt = `Last here <b>${formatLoadingTime(info.lastVisitMins * 60)} ago</b>`;
    if (info.visitCount) txt += ' &#8212; ';
  }
  // visit_count is 0-based: first visit = 0, 2nd = 1.
  if (info.visitCount && !info.firstVisit) txt += `this is your ${ordinal(info.visitCount + 1)} visit`;
  return txt;
}

/** common.js pluralize / pretty_list / capitalize. */
function pluralize(count, single, plural) {
  return count === 1 ? `1 ${single}` : `${count} ${plural}`;
}
function prettyList(list, joiner) {
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')}${joiner}${list[list.length - 1]}`;
}
function capitalize(str) {
  return String(str).replace(/\w+/g, (a) => a.charAt(0).toUpperCase() + a.slice(1).toLowerCase());
}

/** location.js plus_parts order and words. */
const PLUS_SPECIES = [
  ['npc_piggy', 'Piggy', 'Piggies'],
  ['npc_butterfly', 'Butterfly', 'Butterflies'],
  ['npc_batterfly', 'Batterfly', 'Batterflies'],
  ['npc_chicken', 'Chicken', 'Chickens'],
  ['npc_sloth', 'Sloth', 'Sloths'],
  ['chick', 'Chick', 'Chicks'],
  ['caterpillar', 'Caterpillar', 'Caterpillars'],
  ['piglet', 'Piglet', 'Piglets'],
  ['patch', 'Patch', 'Patches'],
  ['patch_dark', 'Dark Patch', 'Dark Patches'],
  ['npc_firefly', null, null],
  ['jellisac', 'Jellisac Growth', 'Jellisac Growths'],
  ['mortar_barnacle', 'Mortar Barnacle', 'Mortar Barnacles'],
  ['peat', 'Peat Bog', 'Peat Bogs'],
  ['dirt_pile', 'Dirt Pile', 'Dirt Piles'],
  ['ice_knob', 'Ice Nubbin', 'Ice Nubbins'],
  ['npc_salmon', 'Salmon', 'Salmen'],
];

/** Tree and plant names (name_single / name_plural of each class). */
export const HOME_TO_TREES = Object.freeze({
  trant_fruit: ['Fruit Tree', 'Fruit Trees'],
  trant_bean: ['Bean Tree', 'Bean Trees'],
  trant_bubble: ['Bubble Tree', 'Bubble Trees'],
  trant_egg: ['Egg Plant', 'Egg Plants'],
  trant_gas: ['Gas Plant', 'Gas Plants'],
  trant_spice: ['Spice Plant', 'Spice Plants'],
  wood_tree: ['Wood Tree', 'Wood Trees'],
  paper_tree: ['Paper Tree', 'Paper Trees'],
});

const ROCK_WORDS = {
  beryl: ['Beryl Rock', 'Beryl Rocks'],
  dullite: ['Dullite Rock', 'Dullite Rocks'],
  metal_rock: ['Metal Rock', 'Metal Rocks'],
  sparkly: ['Sparkly Rock', 'Sparkly Rocks'],
};

/**
 * location.js getLoadingInfo street_details.features ("Home to:"), from what
 * is on the street: a vendor (store name with A/An), a shrine ("A shrine
 * dedicated to <b>Ti</b>." uses capitalize(get_giant())), then one "Plus ..."
 * line of animals, nodes, trees, rocks for mining and garden plots.
 * @param {{
 *   vendor?: string,
 *   shrineGiant?: string,
 *   counts?: Record<string, number>,
 *   trees?: Array<[string, number]>,
 *   rocks?: Array<[string, number]>,
 *   gardens?: { herb?: number, crop?: number },
 *   houses?: number,
 *   housesForSale?: number,
 * }} street
 * @returns {string[]} client HTML, one entry per bullet
 */
export function homeToFeatures(street = {}) {
  const features = [];
  if (street.vendor) {
    const article = /^[aeiou]/i.test(street.vendor) ? 'An' : 'A';
    features.push(`${article} <b>${street.vendor}</b>.`);
  }
  if (street.shrineGiant) features.push(`A shrine dedicated to <b>${capitalize(street.shrineGiant)}</b>.`);
  const counts = street.counts || {};
  const plus = [];
  for (const [id, single, plural] of PLUS_SPECIES) {
    const n = Number(counts[id]) || 0;
    if (!n) continue;
    plus.push(id === 'npc_firefly' ? '<b>A Firefly Swarm</b>' : `<b>${pluralize(n, single, plural)}</b>`);
  }
  for (const [id, n] of street.trees || []) {
    const words = HOME_TO_TREES[id];
    if (words && n) plus.push(`<b>${pluralize(n, words[0], words[1])}</b>`);
  }
  for (const [type, n] of street.rocks || []) {
    const words = ROCK_WORDS[type];
    if (words && n) plus.push(`<b>${pluralize(n, words[0], words[1])} for mining</b>`);
  }
  const gardens = street.gardens || {};
  for (const type of Object.keys(gardens)) {
    const n = Number(gardens[type]) || 0;
    if (!n) continue;
    if (type === 'herb') plus.push(`<b>${pluralize(n, 'Herb Garden plot', 'Herb Garden plots')}</b>`);
    else if (type === 'crop') plus.push(`<b>${pluralize(n, 'Crop Garden plot', 'Crop Garden plots')}</b>`);
  }
  if (street.houses) {
    plus.push(street.housesForSale
      ? `<b>${pluralize(street.houses, 'House', 'Houses')} (${street.housesForSale} for sale)</b>`
      : `<b>${pluralize(street.houses, 'House', 'Houses')}</b>`);
  }
  if (plus.length) features.push(`${features.length ? 'Plus ' : ''}${prettyList(plus, ', and ')}.`);
  return features;
}

const ROCK_CLASS_TYPES = [
  [/^rock_beryl/, 'beryl'],
  [/^rock_dullite/, 'dullite'],
  [/^rock_metal/, 'metal_rock'],
  [/^rock_sparkly/, 'sparkly'],
];

/**
 * Counts what the street actually spawned (its interactable targets) into
 * the homeToFeatures input, in spawn order like location.js walks this.items.
 * @param {Array<{ classId?: string, state?: object }>} targets
 */
export function streetFeaturesFromTargets(targets = []) {
  const out = { vendor: '', shrineGiant: '', counts: {}, trees: [], rocks: [], gardens: {} };
  const trees = new Map();
  const rocks = new Map();
  const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);
  for (const t of targets) {
    const id = String(t?.classId || '');
    if (!id) continue;
    if (id.startsWith('street_spirit')) {
      if (!out.vendor) out.vendor = String(t.state?.vendorLabel || t.label || '');
    } else if (id.startsWith('npc_shrine_')) {
      // shrines.js get_giant: class minus npc_shrine_ / ix_ / uralia_ / firebog_, tii -> ti.
      if (!out.shrineGiant) {
        out.shrineGiant = String(t.state?.giantId || id.replace('npc_shrine_', ''))
          .replace(/^(ix_|uralia_|firebog_)/, '').replace('tii', 'ti');
      }
    } else if (/^peat(_\d+)?$/.test(id)) {
      out.counts.peat = (out.counts.peat || 0) + 1;
    } else if (HOME_TO_TREES[id]) {
      bump(trees, id);
    } else if (ROCK_CLASS_TYPES.some(([re]) => re.test(id))) {
      bump(rocks, ROCK_CLASS_TYPES.find(([re]) => re.test(id))[1]);
    } else if (id === 'garden_new' || id === 'garden') {
      const g = t.state?.garden || t.state || {};
      const type = g.gardenType === 'herb' ? 'herb' : 'crop';
      const plots = (Number(g.cols) || 0) * (Number(g.rows) || 0) || Object.keys(g.plots || {}).length;
      out.gardens[type] = (out.gardens[type] || 0) + plots;
    } else {
      out.counts[id] = (out.counts[id] || 0) + 1;
    }
  }
  out.trees = [...trees.entries()];
  out.rocks = [...rocks.entries()];
  return out;
}

/**
 * Everything the card learns once the street is built: Home to, the Qurazy
 * marker (first visits only, as getLoadingInfo checks), the upgrade badge
 * (upgraded since the last visit) and "Upgraded N ago. Led by:".
 * @param {{
 *   targets?: Array<object>,
 *   quoinTypes?: string[],
 *   visit?: ReturnType<typeof streetLoadingVisit>,
 *   activeProject?: boolean,
 *   upgradedAt?: number,
 *   playerLabel?: string,
 *   now?: number,
 * }} args
 */
export function loadingCardDetails({ targets = [], quoinTypes = [], visit = {}, activeProject = false, upgradedAt = 0, playerLabel = '', now = Date.now() } = {}) {
  const qurazyHere = Boolean(visit.firstVisit && quoinTypes.includes('qurazy'));
  const upgradeMins = upgradedAt ? Math.round((now - upgradedAt) / 60000) : 0;
  const upgradeBadge = Boolean(upgradeMins && visit.visitCount && visit.lastVisitMins > upgradeMins);
  let upgradeHtml = '';
  if (upgradedAt && playerLabel) {
    // buildUpgrade: the solo remake's leaderboard is the player alone.
    const head = upgradeMins > 0
      ? `<b>Upgraded ${formatLoadingTime(upgradeMins * 60, { displaySec: false, maxToShow: 2 })} ago.</b> Led by:`
      : '<b>Upgrade project led by:</b>';
    upgradeHtml = `${head}<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>${playerLabel}</b>&nbsp;&nbsp;&nbsp;100%`;
  }
  return {
    visitHtml: loadingVisitLine({ ...visit, qurazyHere }),
    qurazyHere,
    features: homeToFeatures(streetFeaturesFromTargets(targets)),
    activeProject: Boolean(activeProject),
    upgradeBadge,
    upgradeHtml,
  };
}
