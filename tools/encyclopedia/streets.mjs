/**
 * The encyclopedia's Streets section (Austin 2026-11-05): one page per street the
 * remake has, reached from its region's page in Places and from search, at
 * /encyclopedia/streets/<slug of its name>/ (the street's tsid is added to the slug
 * when two streets share a name). Each page shows what the remake puts there and
 * how you get there on a new world. tools/encyclopedia/build.mjs draws the pages
 * with streetPage and streetsIndex; loadEncyclopedia (data.mjs) calls addStreets.
 *
 * Sources (read only, nothing evaluated but the remake's own pure modules):
 *  - assets/streets/index.json (the remake's streets), assets/maps/hubs/hub-<id>.json
 *    (the 2012 map: the street's name, region and line), the Places entries;
 *  - assets/content/street-ecology.json through js/street-ecology.js populationForStreet,
 *    the same call the game makes, so the animals, trees and rocks are the remake's own
 *    counts; its `vendors`, `wildlife`, `furniture`, `soil` and `swoonerflies` rows;
 *  - js/vendor.js selectVendorProfile (the Street Spirit's store, as game.js picks it)
 *    and js/vendor-npcs.js (the vendors that stand on a street of their own);
 *  - assets/content/signpost-graph.json (signposts and doors), one-way-roads.json,
 *    street-jobs.json with js/street-jobs.js (which roads a new world keeps closed),
 *    js/subway-line.js, js/hidden-floors.js and js/wintry-portal.js (the ways no closure holds);
 *  - js/quest-reach.js questPlaceNeeds (the quests that happen on named streets),
 *    the achievements' streets_visited_in_hub conditions with js/exploration.js countsTowardHub;
 *  - each street file's musicFile (tools/sound/sound-model.mjs streetMusicKeys);
 *  - assets/content/loading-images.json (Tiny Speck's loading pictures) and
 *    js/hub-map-backgrounds.js (the region maps from Tiny Speck's world map).
 * Tiny Speck's data has no description of a street of its own; the words it has are
 * the street project's title and line and a street upgrade's description, and those
 * are shown as theirs. Everything else is ours.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadSoundData, streetMusicKeys } from '../sound/sound-model.mjs';
import { andList, esc, fmt, pathOf } from './parts.mjs';

const root = join(import.meta.dirname, '..', '..');
const PUB = join(root, 'public');
const json = (rel) => JSON.parse(readFileSync(join(PUB, rel), 'utf8'));
const mod = (name) => import(join(PUB, 'js', name));
const G = (t) => String(t || '').replace(/^L/, 'G');

/** Animals, trees, rocks and other things, in the order a page lists them. */
const KIND_ORDER = ['Animals', 'Trees and plants', 'Rocks', 'Things to harvest', 'Other things'];
const kindOf = (cls) => {
  if (/^npc_/.test(cls)) return 'Animals';
  if (/^(trant_|wood_tree$|paper_tree$)/.test(cls)) return 'Trees and plants';
  if (/^rock_/.test(cls)) return 'Rocks';
  if (/^(dirt_pile|peat|jellisac|ice_knob|mortar_barnacle|dust_trap|patch)/.test(cls)) return 'Things to harvest';
  return 'Other things';
};
/** Classes the street's population owns (counted from it, not from the raw file). */
const POPULATED = /^(npc_piggy|npc_chicken|npc_butterfly|trant_.*|wood_tree|rock_.*)$/;

/**
 * Everything the Streets section needs, added to the encyclopedia's data:
 * an entry `streets:<slug>` per street (refs empty: a street names many things, and
 * those pages do not list their streets back), `d.streetKeyOf(tsid)` and the
 * streets left out with the reason, and `d.streetsHaving(classId)` for the item pages.
 */
export async function addStreets(d, { inventory, picture, slug }) {
  const index = json('assets/streets/index.json');
  const eco = json('assets/content/street-ecology.json');
  const signs = json('assets/content/signpost-graph.json');
  const oneWay = json('assets/content/one-way-roads.json').streets || {};
  const jobs = json('assets/content/street-jobs.json');
  const strips = json('assets/content/loading-images.json');
  const [ecology, vendor, npcs, stores, sj, routes, hidden, wintry, subway, maps, reach, exploration, resources] = await Promise.all([
    mod('street-ecology.js'), mod('vendor.js'), mod('vendor-npcs.js'), mod('store-catalog.js'), mod('street-jobs.js'), mod('map-routes.js'),
    mod('hidden-floors.js'), mod('wintry-portal.js'), mod('subway-line.js'), mod('hub-map-backgrounds.js'), mod('quest-reach.js'), mod('exploration.js'), mod('resource-nodes.js'),
  ]);
  const locInv = inventory.location || new Map();
  const places = [...d.entries.values()].filter((e) => e.section === 'places');
  const hubPlace = new Map(places.map((p) => [String(p.hubId), p]));

  // The 2012 map: each drawn street's region and line.
  const drawn = new Map(); // G tsid -> { place, name, line: [x1, y1, x2, y2], hubId, w, h }
  const hubDir = join(PUB, 'assets', 'maps', 'hubs');
  for (const file of readdirSync(hubDir).filter((f) => /^hub-\d+\.json$/.test(f))) {
    const hub = JSON.parse(readFileSync(join(hubDir, file), 'utf8'));
    const place = hubPlace.get(String(hub.hubId));
    if (!place) continue;
    for (const st of hub.streets || []) {
      if (!drawn.has(G(st.tsid))) drawn.set(G(st.tsid), { place, name: String(st.name).trim(), line: [st.x1, st.y1, st.x2, st.y2], hubId: String(hub.hubId), w: hub.mapW || 760, h: hub.mapH || 460 });
    }
  }
  const labelOf = (g) => drawn.get(g)?.name || String(index.streets[g]?.label || '').trim() || g;

  // Which streets get a page.
  const kept = [];
  const leftOut = [];
  for (const [g, row] of Object.entries(index.streets)) {
    const map = drawn.get(g);
    const place = map?.place || hubPlace.get(String(row.hubId));
    const inv = locInv.get(`L${g.slice(1)}`) || locInv.get(g);
    if (inv?.status === 'excluded') { leftOut.push({ tsid: g, name: labelOf(g), region: row.hubName || '', why: 'excluded' }); continue; }
    if (!place) { leftOut.push({ tsid: g, name: labelOf(g), region: row.hubName || '', why: row.hubName ? 'no-region' : 'no-hub' }); continue; }
    kept.push({ g, row, map, place, status: inv?.status || 'source' });
  }
  const bySlug = new Map();
  for (const k of kept) { const s = slug(labelOf(k.g)) || k.g.toLowerCase(); bySlug.set(s, (bySlug.get(s) || 0) + 1); k.slug = s; }
  for (const k of kept) if (bySlug.get(k.slug) > 1) k.slug = `${k.slug}-${k.g.toLowerCase()}`;
  const keyByTsid = new Map(kept.map((k) => [k.g, `streets:${k.slug}`]));

  // A new world: which roads are closed, and the fewest street projects between the start and each street.
  const home = index.default;
  const state = sj.normalizeStreetJobState({});
  sj.initializeStreetJobs(state, [home]);
  const shut = new Set(sj.closedStreets(state, jobs, { exemptFrom: [home] }));
  const graph = routes.routeGraph(signs).graph;
  const free = {};
  for (const a of sj.SUBWAY_STREETS) for (const b of sj.SUBWAY_STREETS) if (a !== b) (free[a] ||= []).push(b);
  for (const t of [...hidden.TELEPORTERS, ...wintry.WINTRY_PORTAL_TELEPORTERS]) (free[G(t.from)] ||= []).push(G(t.to));
  const projectOf = new Map(); // street -> its street-building job
  const boards = {};
  for (const [id, job] of Object.entries(jobs.jobs || {})) {
    if (job.kind !== 'street') continue;
    if (!projectOf.has(job.street)) projectOf.set(job.street, { id, ...job });
    boards[job.street] = (job.connecting || []).map(G);
  }
  const way = waysFromStart({ graph, free, shut, boards, start: home });

  // Stores: catalog_stores.js store_id -> store key; the vendors that stand on a street of their own.
  const storeKeyOfId = new Map(stores.STORE_CATALOG.map((s) => [s.storeId, s.key]));
  const npcStore = (cls) => storeKeyOfId.get(npcs.VENDOR_NPCS[cls]?.storeId) || null;

  // Music: the key each street's own file names.
  const { music } = loadSoundData(root);
  const musicOf = new Map();
  for (const [key, row] of streetMusicKeys(music, root)) for (const st of row.streets) musicOf.set(G(st.tsid), key);

  // Quests that can only be done on named streets, and the regions' Completist achievements.
  const placeIdx = reach.placeIndex(index);
  const questsOn = new Map();
  for (const e of d.entries.values()) {
    if (e.section !== 'quests') continue;
    for (const need of reach.questPlaceNeeds(e.quest, placeIdx)) for (const t of need.streets) (questsOn.get(t) || questsOn.set(t, new Set()).get(t)).add(e.key);
  }
  const completist = new Map(); // hub id -> achievement key
  for (const e of d.entries.values()) {
    if (e.section !== 'achievements') continue;
    for (const c of e.ach.conditions || []) {
      const hub = c.group === 'streets_visited_in_hub' ? /^number_(\d+)$/.exec(c.name)?.[1] : /^streets_visited_in_hub_(\d+)$/.exec(c.group)?.[1];
      if (hub) completist.set(hub, e.key);
    }
  }

  const nodeIds = new Set(Object.keys(resources.RESOURCE_NODE_CATALOG));
  const stations = subway.SUBWAY_LINE.stations;
  const having = new Map(); // class -> number of kept streets that have it
  for (const k of kept) {
    const { g, row, map, place } = k;
    const ecoRow = ecology.ecologyForStreet(g, eco);
    const pop = ecology.populationForStreet(g, ecoRow, { starter: g === home });
    // What is here: the population's own counts, then every other class the street's file and rows list.
    const here = new Map();
    const add = (cls, n) => { if (n > 0) here.set(cls, (here.get(cls) || 0) + n); };
    add('npc_piggy', pop.piggies);
    add('npc_chicken', pop.chickens);
    add('npc_butterfly', pop.butterflies + pop.flyingButterflies);
    for (const c of [...pop.treeClasses, ...pop.rockClasses, ...pop.resourceNodeClasses]) add(c, 1);
    for (const [c, n] of Object.entries(pop.featureCounts || {})) add(c, n);
    if (!pop.sourceEmpty) {
      for (const [c, n] of Object.entries(ecoRow?.counts || {})) if (!POPULATED.test(c) && !nodeIds.has(c) && c !== 'street_spirit' && c !== 'garden' && !(c in (pop.featureCounts || {}))) add(c, n);
      for (const rows of [eco.wildlife, eco.furniture, eco.soil, eco.swoonerflies]) for (const [c, n] of Object.entries(rows?.[g] || {})) add(c, n);
    }
    for (const c of here.keys()) having.set(c, (having.get(c) || 0) + 1);
    const npcVendors = Object.keys(eco.vendors?.[g] || {}).filter((c) => npcs.VENDOR_NPCS[c]);
    const station = stations.find((s) => s.streetTsid === g) || null;
    const surface = stations.find((s) => s.surfaceStreetTsid === g) || null;
    const project = projectOf.get(g) || null;
    const doorKey = (to) => signs.doorKeys?.[`${g}>${to}`] || null;
    const sealed = Object.entries(signs.sealed || {}).filter(([k]) => k.startsWith(`${g}>`)).map(([k, n]) => ({ to: k.slice(g.length + 1), key: n }));
    const sealedIn = Object.entries(signs.sealed || {}).filter(([k]) => k.endsWith(`>${g}`)).map(([k, n]) => ({ from: k.slice(0, -(g.length + 1)), key: n }));
    const cut = oneWay[g]?.cut || {};
    const offers = (jobs.byStreet?.[g] || []).map((id) => ({ id, ...jobs.jobs[id] })).filter((j) => j.kind);
    const upgrade = jobs.upgrades?.[g] || null;
    const hubId = String(map?.hubId || place.hubId);
    const strip = strips[g]?.local ? picture(strips[g].local) : null;
    const bg = maps.HUB_MAP_BACKGROUNDS[hubId];
    const w = way.get(g);
    const e = {
      name: labelOf(g), status: k.status, register: '', group: place.name, icon: place.icon, refs: [],
      desc: `${labelOf(g)}, a street in ${place.name}.`,
      street: {
        tsid: g, place: place.key, anchor: map ? `L${g.slice(1)}` : '', onMap: Boolean(map), starter: g === home,
        store: pop.vendor ? vendor.selectVendorProfile(g, '', { rocks: pop.rockClasses.length, store: row.store }).key : null,
        npcStores: npcVendors.map((c) => ({ cls: c, store: npcStore(c) })).filter((v) => v.store),
        giant: pop.giantId || null, gardens: pop.gardens, interiorWhy: ecoRow?.interiorWhy || '', empty: Boolean(pop.sourceEmpty),
        here: [...here].sort((a, b) => KIND_ORDER.indexOf(kindOf(a[0])) - KIND_ORDER.indexOf(kindOf(b[0])) || b[1] - a[1] || a[0].localeCompare(b[0])),
        signposts: (signs.streets?.[g] || []).filter((t) => t !== g),
        doors: (signs.doors?.[g] || []).map((to) => ({ to, key: doorKey(to) })),
        sealed, sealedIn,
        oneWay: Object.entries(cut).map(([from, to]) => ({ from, to })),
        station, surface,
        project: project ? { title: project.title, desc: project.desc, boards: (project.connecting || []).map(G), closed: shut.has(g), builtFromStart: Boolean(project.builtFromStart) } : null,
        offers: offers.map((j) => ({ kind: j.kind, title: j.title, desc: j.desc, target: j.kind === 'street' ? j.street : null })),
        upgrade: upgrade ? { name: upgrade.current?.name || '', desc: upgrade.current?.desc || '', options: (upgrade.options || []).map((o) => ({ name: o.name, desc: o.desc })) } : null,
        reach: w ? { projects: w.projects, first: w.first } : null,
        music: musicOf.get(g) || null,
        quests: [...(questsOn.get(g) || [])].sort(),
        achievement: completist.has(hubId) && exploration.countsTowardHub(g, hubId) ? completist.get(hubId) : null,
        strip,
        map: map && bg ? { src: bg.x1, hi: bg.x2, w: map.w, h: map.h, line: map.line, hubId } : null,
      },
    };
    d.entries.set(`streets:${k.slug}`, { key: `streets:${k.slug}`, section: 'streets', id: k.slug, ...e });
  }
  // Each kept street's neighbours on the same map, drawn faintly around it.
  for (const k of kept) {
    const st = d.entries.get(`streets:${k.slug}`).street;
    if (!st.map) continue;
    st.map.near = [...new Set([...st.signposts, ...st.doors.map((x) => x.to)])].map((t) => drawn.get(t)).filter((m) => m && m.hubId === st.map.hubId).map((m) => m.line);
  }
  d.streetKeyOf = (tsid) => keyByTsid.get(G(tsid)) || null;
  d.streetLabel = labelOf;
  d.streetsLeftOut = leftOut;
  d.streetsHaving = (cls) => having.get(cls) || 0;
  d.streetHome = home;
}

/**
 * The fewest street projects to build between the start and every street, by the rules of
 * js/quest-reach.js closuresInTheWay (a closed street costs one and is entered only from
 * one of its project boards; the subway and the teleporters are free): street ->
 * { projects, first: the first closed street on the way, board: where it is built }.
 */
export function waysFromStart({ graph, free, shut, boards, start }) {
  const cost = new Map([[start, 0]]);
  const prev = new Map([[start, null]]);
  const deque = [start];
  while (deque.length) {
    const at = deque.shift();
    const c = cost.get(at);
    const step = (to, w) => {
      if (cost.has(to) && cost.get(to) <= c + w) return;
      cost.set(to, c + w);
      prev.set(to, at);
      if (w) deque.push(to); else deque.unshift(to);
    };
    for (const to of graph[at] || []) {
      if (!shut.has(to)) step(to, 0);
      else if (boards[to]?.includes(at)) step(to, 1);
    }
    for (const to of free[at] || []) step(to, 0);
  }
  const out = new Map();
  for (const [t, n] of cost) {
    let first = null;
    for (let at = t; at; at = prev.get(at)) if (shut.has(at)) first = { street: at, board: prev.get(at) || '' };
    out.set(t, { projects: n, first });
  }
  return out;
}

/* -- Pages ------------------------------------------------------------ */

const GIANT_NAMES = {
  alph: 'Alph', cosma: 'Cosma', friendly: 'Friendly', grendaline: 'Grendaline', humbaba: 'Humbaba', lem: 'Lem',
  mab: 'Mab', pot: 'Pot', spriggan: 'Spriggan', ti: 'Tii', zille: 'Zille',
};
const giantIcon = (g) => `assets/sprites/giant-icons/icon_${g === 'ti' ? 'tii' : g}.png`;

/** A chip's 20 px picture without its 3x copy: thousands of pages, and the plain icon is already twice the size. */
const lite = (pic) => (pic ? { ...pic, hi: null } : null);

/** A street as a link to its page (or its name when it has none). */
function streetLink(t, P, d) {
  const k = d.streetKeyOf(t);
  return k ? `<a href="${P.href(k)}">${esc(d.entries.get(k).name)}</a>` : esc(d.streetLabel(t));
}
const streetChip = (t, P, d, extra = '') => {
  const k = d.streetKeyOf(t);
  return P.chip(`${esc(k ? d.entries.get(k).name : d.streetLabel(t))}${extra}`, { link: k ? P.href(k) : null, cls: 'ency-place' });
};

/** The region map with this street drawn on it (an SVG line over Tiny Speck's map), and its loading picture. */
function pictures(e, p) {
  const st = e.street;
  const out = [];
  if (st.strip) out.push(`<figure class="st-fig st-strip"><img src="${p}${esc(st.strip.src)}" alt="" width="${st.strip.w}" height="${st.strip.h}" loading="lazy" decoding="async" /><figcaption>Its loading picture in Tiny Speck’s game.</figcaption></figure>`);
  if (st.map) {
    const m = st.map;
    const line = ([x1, y1, x2, y2], cls) => `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
    out.push(`<figure class="st-fig st-map"><div class="st-map-frame"><img src="${p}${esc(m.src)}" srcset="${p}${esc(m.src)} 1x, ${p}${esc(m.hi)} 2x" alt="" width="${m.w}" height="${m.h}" loading="lazy" decoding="async" /><svg viewBox="0 0 ${m.w} ${m.h}" aria-hidden="true">${(m.near || []).map((l) => line(l, 'st-near')).join('')}${line(m.line, 'st-here')}</svg></div><figcaption>Where it is on the map of ${esc(e.group)}, with the streets its roads lead to.</figcaption></figure>`);
  }
  return out.length ? `<div class="st-figs">${out.join('')}</div>` : '';
}

/** What the street's status means (our words). */
const STREET_STATUS = {
  source: 'This street is in the remake, built from Tiny Speck’s own file for it.',
  rebuilt: 'This street is in the remake, rebuilt from recordings of the original: its file was never archived.',
  reimagined: 'This street is in the remake, reimagined: too little of the original survives, so it is designed fresh in its spirit.',
  partial: 'Part of this street is in the remake.',
};

/** One street's page body (build.mjs wraps it in the page frame and the pager). */
export function streetPage(e, P, { info, d, backOf, kit }) {
  const st = e.street;
  const { band, sub, p } = kit;
  const place = info(st.place);
  const regionHref = `${P.href(st.place)}${st.anchor ? `#${esc(st.anchor)}` : ''}`;

  // Facts.
  const facts = [`<dt>Region</dt><dd><a href="${regionHref}">${esc(place.name)}</a></dd>`];
  const storeChips = [];
  if (st.store && info(`stores:${st.store}`)) storeChips.push(P.chip(esc(info(`stores:${st.store}`).name), { pic: lite(info(`stores:${st.store}`).icon), link: P.href(`stores:${st.store}`) }));
  for (const v of st.npcStores) if (info(`stores:${v.store}`)) storeChips.push(P.chip(esc(info(`stores:${v.store}`).name), { pic: lite(info(`stores:${v.store}`).icon), link: P.href(`stores:${v.store}`) }));
  if (storeChips.length) facts.push(`<dt>Vendor${storeChips.length > 1 ? 's' : ''}</dt><dd>${P.chips(storeChips)}</dd>`);
  if (st.giant) {
    const k = `people:npc_shrine_${st.giant}`;
    facts.push(`<dt>Shrine</dt><dd>${P.chips([P.chip(esc(`Shrine to ${GIANT_NAMES[st.giant] || st.giant}`), { pic: kit.picture(giantIcon(st.giant)), link: info(k) ? P.href(k) : null })])}</dd>`);
  }
  if (st.station) facts.push(`<dt>Subway</dt><dd>${esc(st.station.name)} station, up to ${streetLink(st.station.surfaceStreetTsid, P, d)}</dd>`);
  if (st.surface) facts.push(`<dt>Subway</dt><dd>The ${esc(st.surface.name)} station is here: ${streetLink(st.surface.streetTsid, P, d)}</dd>`);
  // Music: the street's own key, silence, or the region's music.
  let musicLine = '';
  const soundKey = st.music ? `sounds:${st.music.toLowerCase()}` : null;
  if (st.music === 'NO_MUSIC') musicLine = 'None: the street is quiet, as in the original.';
  else if (soundKey && info(soundKey)) musicLine = `<a href="${P.href(soundKey)}">${esc(info(soundKey).name)}</a>`;
  else {
    const regionMusic = (backOf(st.place) || []).some((b) => b.rel === 'region-music');
    musicLine = `The music of ${regionMusic ? `<a href="${P.href(st.place)}#music-h">${esc(place.name)}</a>` : esc(place.name)}.`;
  }
  facts.push(`<dt>Music</dt><dd>${musicLine}</dd>`);

  // Tiny Speck's words about it: a street upgrade's look, the project that built it.
  const words = [];
  if (st.upgrade?.name) words.push(`<p><strong>${esc(st.upgrade.name)}</strong>${st.upgrade.desc ? `: ${esc(st.upgrade.desc)}` : ''}</p>`);
  if (st.project?.desc) words.push(`<p><strong>${esc(st.project.title)}</strong>: ${esc(st.project.desc)}</p>`);
  const about = `<div class="cat-cols">
        <div>
          ${pictures(e, p)}
          ${words.length ? `<div class="cat-desc">${words.join('')}</div>\n          <p class="cat-source">In Tiny Speck’s words, from their street data.</p>` : ''}
        </div>
        <dl class="cat-facts">
          ${facts.join('\n          ')}
        </dl>
      </div>`;

  // Roads.
  const roads = [];
  if (st.signposts.length) roads.push(sub('Signposts', P.chips(st.signposts.map((t) => streetChip(t, P, d)))));
  if (st.doors.length) roads.push(sub('Doors', P.chips(st.doors.map((x) => streetChip(x.to, P, d, x.key ? ` <b>key ${fmt(x.key)}</b>` : '')))));
  const notes = [];
  for (const x of st.sealed) notes.push(`A door to ${streetLink(x.to, P, d)} needs Door Key ${fmt(x.key)}, and nothing in the game gives one.`);
  for (const x of st.sealedIn) notes.push(`The door into here from ${streetLink(x.from, P, d)} needs Door Key ${fmt(x.key)}, and nothing in the game gives one.`);
  for (const x of st.oneWay) notes.push(`Coming in from ${streetLink(x.from, P, d)}, you cannot climb back to the signpost${x.to.length > 1 ? 's' : ''} to ${andList(x.to.map((t) => streetLink(t, P, d)))}: that way only goes down.`);
  if (st.doors.some((x) => x.key)) notes.push('A door with a key number needs that Door Key.');
  if (notes.length) roads.push(`<ul class="cat-list">${notes.map((n) => `<li>${n}</li>`).join('')}</ul>`);

  // What is here.
  const groups = new Map();
  for (const [cls, n] of st.here) {
    const k = d.keyOf(cls);
    if (!k || !info(k)) continue;
    const kind = cls.startsWith('npc_') && !k.startsWith('animals:') ? 'Other things' : kindOf(cls);
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind).push(P.chip(`${esc(info(k).name)}${n > 1 ? ` <b>${fmt(n)}</b>` : ''}`, { pic: lite(info(k).icon), link: P.href(k) }));
  }
  if (st.gardens) (groups.get('Other things') || groups.set('Other things', []).get('Other things')).push(P.chip(st.gardens > 1 ? `Garden plots <b>${fmt(st.gardens)}</b>` : 'A garden plot'));
  const hereHtml = KIND_ORDER.filter((k) => groups.has(k)).map((k) => sub(k, P.chips(groups.get(k)))).join('\n        ');
  const hereLead = st.empty ? 'Its file in Tiny Speck’s archive holds nothing to place, so nothing lives here.' : st.interiorWhy ? 'Indoors: only what its own file holds.' : 'As the remake places them, from the street’s own file.';

  // Quests and achievements.
  const questTiles = st.quests.filter((k) => info(k)).map((k) => P.tile(k, { sub: 'happens here' }));
  const achTiles = st.achievement && info(st.achievement) ? [P.tile(st.achievement, { sub: `visit every street of ${esc(place.name)}` })] : [];

  // In the remake: how you get here on a new world.
  const rm = [];
  if (st.starter) rm.push('Every new player starts here.');
  else if (st.project?.closed) {
    const boardsHtml = andList(st.project.boards.map((t) => streetLink(t, P, d)));
    rm.push(`On a new world this street is still to be built: its road stays closed until players finish its street project${boardsHtml ? `, offered on ${boardsHtml}` : ''}.`);
  } else if (st.project && st.surface) rm.push('It counts as built from the start, because the subway comes up here.');
  else if (st.project?.builtFromStart) rm.push('Its street project counts as built from the start.');
  else if (st.project) rm.push('Its street project counts as built from the start: its project board stands on the street every new player starts on.');
  if (!st.starter) {
    if (!st.reach) rm.push('No road from the starting street leads here: the game brings you here another way, such as a quest, a party or a door that needs a key of its own.');
    else if (st.reach.projects === 0) rm.push('On a new world you can walk here from the start (the subway and the teleports count).');
    else if (st.reach.first && !(st.project?.closed && st.reach.projects === 1)) {
      const f = st.reach.first;
      rm.push(`On a new world ${st.reach.projects === 1 ? 'one street project stands' : `${fmt(st.reach.projects)} street projects stand`} between the start and here; the first is ${streetLink(f.street, P, d)}${f.board ? `, built on ${streetLink(f.board, P, d)}` : ''}.`);
    }
  }
  const offers = st.offers.filter((o) => o.kind === 'street' && o.target).map((o) => streetChip(o.target, P, d));
  const upgradeOffer = st.offers.find((o) => o.kind === 'upgrade');
  const remake = `<div class="cat-remake-body"><p class="cat-status-text">${esc(STREET_STATUS[e.status] || STREET_STATUS.source)}</p><ul class="cat-list">${rm.map((x) => `<li>${x}</li>`).join('')}</ul>${offers.length ? `${sub('Projects offered here', `<p class="ency-lead-small">This street’s project board builds the road${offers.length > 1 ? 's' : ''} to:</p>${P.chips(offers)}`)}` : ''}${upgradeOffer && st.upgrade?.options.length ? sub('Upgrades', `<p class="ency-lead-small">${esc(upgradeOffer.title)}: ${andList(st.upgrade.options.map((o) => `<strong>${esc(o.name)}</strong>`))}.</p>`) : ''}</div>`;

  return `${kit.entryHead(e, P, { subline: esc(`Street in ${place.name}`) })}
  <main>
${band('about-h', 'About this street', about)}
${band('roads-h', 'Roads from here', roads.join('\n        '), { alt: true, lead: 'Where its signposts and doors lead.' })}
${band('here-h', 'What is here', hereHtml || `<p class="cat-muted">${hereLead}</p>`, { lead: hereHtml ? hereLead : '' })}
${band('rel-h', 'Quests and achievements', [sub('Quests', P.tiles(questTiles)), sub('Achievements', P.tiles(achTiles))].filter(Boolean).join('\n        '), { alt: true })}
${band('remake-h', 'In the remake', remake)}
  </main>`;
}

/** The Streets index: every street by region, as plain links (thousands of them, so no pictures). */
export function streetsIndex(sec, list, { info, kit, d }) {
  const p = '../../';
  const byPlace = new Map();
  for (const e of list) (byPlace.get(e.street.place) || byPlace.set(e.street.place, []).get(e.street.place)).push(e);
  const placesSorted = [...byPlace.keys()].sort((a, b) => info(a).name.localeCompare(info(b).name, 'en', { sensitivity: 'base' }));
  const groups = placesSorted.map((pk) => `<section class="ency-group" aria-label="${esc(info(pk).name)}" data-group="${esc(info(pk).name)}"><h2><a href="${p}${pathOf(pk)}">${esc(info(pk).name)}</a> <span class="count">${fmt(byPlace.get(pk).length)}</span></h2><ul class="snd-names">${byPlace.get(pk).map((e) => `<li data-name="${esc(e.name.toLowerCase())}"><a href="${esc(e.id)}/">${esc(e.name)}</a></li>`).join('')}</ul></section>`).join('\n      ');
  const body = `
  <header class="masthead note-head cat-head">
    <div class="wrap">
      <p class="kicker"><a href="../">Groddle Encyclopedia</a> · ${esc(sec.label)}</p>
      <h1>${esc(sec.label)}</h1>
      <p class="lead">${esc(sec.blurb)}</p>
      <p class="cat-score"><strong>${fmt(list.length)}</strong> streets in ${fmt(placesSorted.length)} regions.</p>
    </div>
  </header>

  <main class="band cat-main">
    <div class="wrap">
      <div class="cat-tools">
        <label class="history-search cat-search" for="q">
          <span class="visually-hidden">Filter streets</span>
          <input id="q" type="search" placeholder="Filter by name" autocomplete="off" spellcheck="false" data-filter />
        </label>
        <div class="cat-selects">
          <label><span>Region</span>
            <select id="grp" data-group>
              <option value="">All regions</option>
${placesSorted.map((pk) => `              <option value="${esc(info(pk).name)}"${info(pk).icon ? ` data-icon="${p}${esc(info(pk).icon.src)}"` : ''}>${esc(info(pk).name)} (${fmt(byPlace.get(pk).length)})</option>`).join('\n')}
            </select>
          </label>
        </div>
      </div>
      <p class="cat-count" id="count" aria-live="polite">${fmt(list.length)} streets</p>
      ${groups}
      <p class="cat-source">${fmt(d.streetsLeftOut.length)} more of the remake’s streets have no page: they belong to no region on the map (the old new-player streets of May 2010, and quest and party places you are sent to).</p>
    </div>
  </main>
`;
  return kit.shell({ p, title: `${sec.label} · Groddle Encyclopedia`, description: `${sec.blurb} ${list.length} streets of the Groddle Afternoon remake.`, body, script: true, css: sec.css });
}

/** On a region's page: a street's name as a link to its page. */
export function regionStreetName(st, P, d) {
  const k = d.streetKeyOf?.(st.tsid);
  return k ? `<a href="${P.href(k)}">${esc(st.name)}</a>` : esc(st.name);
}

/** On a region's page: the streets of the region its 2012 map does not draw (subway stations, towers' floors, rooms). */
export function regionMoreStreets(e, P, d) {
  const more = [...d.entries.values()].filter((x) => x.section === 'streets' && x.street.place === e.key && !x.street.onMap)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  if (!more.length) return '';
  return `<h3>More places in ${esc(e.name)}</h3>\n        <p class="ency-lead-small">Places of this region its map does not draw: subway stations, rooms and floors behind doors.</p>\n        ${P.chips(more.map((x) => P.chip(esc(x.name), { link: P.href(x.key), cls: 'ency-place' })))}`;
}

export const streetsSection = { key: 'streets', label: 'Streets', one: 'street', css: 'encyclopedia/streets.css', blurb: 'Every street in the remake: its vendor, shrine, animals, trees and rocks, where its roads lead and how you get there.' };
