/**
 * Detectors for tools/inventory/build.mjs. Each one enumerates every source
 * entity of its kind mechanically (from GSJS files or mined source data) and
 * decides its status from evidence in the remake, never from name matching.
 * Every row: { kind, id, name, source_ref, status, basis, detector, evidence }.
 *
 * Statuses
 *   source            built from source data
 *   rebuilt           laid out from reference (footage, Snaps)
 *   solo              adapted for one player
 *   reimagined        designed fresh (nothing survives)
 *   partial           present but incomplete
 *   missing           the original had it working; the remake does not
 *   lost              needs other players, or nothing survives
 *   excluded          dev/test/retired/data, with a reason
 *   unknown           a detector cannot decide; needs a human (override)
 *   unbuilt_original  defined in the original but never wired there either
 *                     (a Tiny Speck idea left unfinished)
 *
 * The pure judges (judgeAchievements, conditionReach) take plain inputs so
 * tests can drive them with fixtures.
 */

import { matchPattern, prefixLabels, patternString } from './scan.mjs';

export const REACHABLE = new Set(['source', 'rebuilt', 'solo', 'reimagined']);
export const STATUSES = ['source', 'rebuilt', 'solo', 'reimagined', 'partial', 'missing', 'lost', 'excluded', 'unknown', 'unbuilt_original'];

const row = (kind, id, fields) => ({ kind, id: String(id), name: '', source_ref: '', status: 'unknown', basis: 'auto', detector: '', evidence: '', ...fields });

/* ------------------------------------------------------------------ */
/* Counter matching                                                     */
/* ------------------------------------------------------------------ */

/** A pattern with a literal run of 6+ characters may be matched with its wildcard constraints dropped. */
function loosen(pattern) {
  const longest = Math.max(0, ...pattern.filter((p) => typeof p === 'string').map((p) => p.length));
  if (longest < 6 || !pattern.some((p) => typeof p === 'object' && p.cons)) return null;
  return pattern.map((p) => (typeof p === 'object' ? { wild: true, cons: null } : p));
}

const literalSets = new WeakMap();
function literalSet(emissions) {
  if (!literalSets.has(emissions)) {
    const m = new Map();
    const rest = [];
    for (const e of emissions) {
      if (e.pattern.length === 1 && typeof e.pattern[0] === 'string') { if (!m.has(e.pattern[0])) m.set(e.pattern[0], e); } else rest.push(e);
    }
    literalSets.set(emissions, { m, rest });
  }
  return literalSets.get(emissions);
}

function findExact(emissions, key) {
  const { m, rest } = literalSet(emissions);
  if (m.has(key)) return { via: m.get(key), weak: false };
  emissions = rest;
  for (const e of emissions) if (matchPattern(e.pattern, key)) return { via: e, weak: false };
  for (const e of emissions) {
    const l = loosen(e.pattern);
    if (l && matchPattern(l, key)) return { via: e, weak: true };
  }
  return null;
}

function prefixInfo(emissions, prefix) {
  const labels = new Set();
  let open = null;
  let any = null;
  let weak = false;
  const { m, rest } = literalSet(emissions);
  for (const [lit, e] of m) if (lit.startsWith(prefix) && lit.length > prefix.length) { labels.add(lit.slice(prefix.length)); any ||= e; }
  for (const e of rest) {
    let got = prefixLabels(e.pattern, prefix);
    let isWeak = false;
    if (got !== true && !got.size) {
      const l = loosen(e.pattern);
      if (l) { got = prefixLabels(l, prefix); isWeak = true; }
    }
    if (got === true) { if (!open || (open.weak && !isWeak)) open = { via: e, weak: isWeak }; any ||= e; continue; }
    if (got.size) { any ||= e; weak ||= isWeak; for (const x of got) labels.add(x); }
  }
  return { labels, open, any, weak };
}

/**
 * Can `cond` be met given counter emissions? Returns { ok, via, weak, why }.
 * deps(group, name) may veto a matched counter (in_inventory needs the item).
 */
export function conditionReach(cond, emissions, deps = () => null) {
  const type = cond.type;
  if (type === 'has_currants') return { ok: true, why: 'currants are earned everywhere' };
  if (type === 'counter') {
    const key = cond.group ? `${cond.group}:${cond.name}` : cond.name;
    const hit = findExact(emissions, key);
    if (!hit) return { ok: false, why: `counter ${key} incremented nowhere` };
    const veto = deps(cond.group, cond.name);
    if (veto) return { ok: false, why: veto, via: hit.via };
    return { ok: true, via: hit.via, weak: hit.weak };
  }
  if (type === 'group_sum' || type === 'group_count') {
    const info = prefixInfo(emissions, `${cond.group}:`);
    if (!info.any) return { ok: false, why: `no counter in group ${cond.group} is incremented` };
    if (type === 'group_sum' || info.open) return { ok: true, via: (info.open || { via: info.any }).via, weak: info.open ? info.open.weak : info.weak };
    if (info.labels.size >= cond.num) return { ok: true, via: info.any, weak: info.weak };
    return { ok: false, why: `group ${cond.group} has ${info.labels.size} distinct labels, needs ${cond.num}`, via: info.any };
  }
  return { ok: false, why: `unknown condition type ${type}` };
}

const viaText = (v) => (v ? `${v.file}:${v.line} ${v.text}` : '');

/* ------------------------------------------------------------------ */
/* Achievements                                                         */
/* ------------------------------------------------------------------ */

const EVENT_CATEGORIES = new Set(['seasonal']);
const ADMIN_RE = /\b(admin|staff|beta|tester|test badge|debug|impossible|intern|ascended[a-z0-9_]*)\b/i;

/**
 * achievements: [{ id, name, desc, category, isSecret, conditions }]
 * remake / original: { counters: [emission], grants: [emission] }
 * deps: { remake(group, name) -> veto|null, original(group, name) -> veto|null }
 * counterOverrides: { group: { status, reason } } (multiplayer groups and the like)
 */
export function judgeAchievements({ achievements, remake, original, deps = {}, counterOverrides = {} }) {
  const rows = [];
  const grantIn = (side, id) => side.grants.find((g) => matchPattern(g.pattern, id)) || side.grants.find((g) => { const l = loosen(g.pattern); return l && matchPattern(l, id); });
  const judge = (side, a, depFn) => {
    const g = grantIn(side, a.id);
    if (g) return { ok: true, granted: g, results: [] };
    if (!a.conditions.length) return { ok: false, results: [], why: 'no conditions and never granted directly' };
    const results = a.conditions.map((c) => ({ c, r: conditionReach(c, side.counters, depFn) }));
    const blocked = results.filter((x) => !x.r.ok);
    return { ok: !blocked.length, results, blocked, why: blocked.map((x) => x.r.why).join('; ') };
  };
  for (const a of achievements) {
    const rm = judge(remake, a, deps.remake);
    const og = original ? judge(original, a, deps.original) : null;
    const base = { name: a.name, source_ref: `achievements/${a.id}.js`, detector: 'achievement-counters' };
    const ev = [];
    if (rm.granted) ev.push(`granted at ${viaText(rm.granted)}`);
    for (const { c, r } of rm.results) ev.push(`${c.type} ${c.group ? `${c.group}:` : ''}${c.name}${c.num ? ` x${c.num}` : ''}: ${r.ok ? `ok${r.weak ? ' (loose)' : ''} ${viaText(r.via)}` : r.why}`);
    const flags = [a.isSecret ? 'secret' : '', EVENT_CATEGORIES.has(a.category) ? 'event-only' : ''].filter(Boolean);
    if (rm.ok) {
      const weak = rm.results.some((x) => x.r.weak);
      rows.push(row('achievement', a.id, { ...base, status: 'source', detector: `achievement-counters${weak ? ':loose' : ''}`, evidence: [...flags, ...ev].join(' | ') }));
      continue;
    }
    // Why not: a counter group judged by an override (multiplayer), the original's own wiring, flags.
    const blockGroups = (rm.blocked || []).map((x) => x.c.group).filter(Boolean);
    const blockKeys = (rm.blocked || []).map((x) => (x.c.group ? `${x.c.group}:${x.c.name}` : x.c.name));
    const ov = (rm.blocked || []).length ? (rm.blocked.every((x) => counterOverrides[`${x.c.group}:${x.c.name}`] || counterOverrides[x.c.group])
      ? counterOverrides[blockKeys[0]] || counterOverrides[blockGroups[0]] : null) : null;
    const ogWhy = og && !og.ok ? og.why : '';
    const blocker = rm.blocked?.[0]?.c;
    const blockKey = blocker ? (blocker.group || blocker.name) : '(no conditions)';
    if (ADMIN_RE.test(`${a.id} ${a.name} ${a.desc}`) && !a.conditions.length) {
      rows.push(row('achievement', a.id, { ...base, status: 'excluded', blocker: blockKey, evidence: ['granted by hand to staff, interns or beta testers (no conditions, no grant in code)', ...flags, ...ev].join(' | ') }));
    } else if (og && !og.ok) {
      rows.push(row('achievement', a.id, { ...base, status: 'unbuilt_original', blocker: blockKey, evidence: [`original: ${ogWhy}`, ...flags, ...ev].join(' | ') }));
    } else if (ov) {
      rows.push(row('achievement', a.id, { ...base, status: ov.status, blocker: blockKey, evidence: [`counter group ${blockGroups.join(',')}: ${ov.reason}`, ...flags, ...ev].join(' | ') }));
    } else if (ADMIN_RE.test(`${a.name} ${a.desc}`)) {
      rows.push(row('achievement', a.id, { ...base, status: 'excluded', blocker: blockKey, evidence: ['admin/staff/test badge', ...flags, ...ev].join(' | ') }));
    } else if (EVENT_CATEGORIES.has(a.category)) {
      rows.push(row('achievement', a.id, { ...base, status: 'excluded', blocker: blockKey, evidence: ['event-only (seasonal category): unreachable in the remake', ...flags, ...ev].join(' | ') }));
    } else {
      rows.push(row('achievement', a.id, { ...base, status: 'missing', blocker: blockKey, evidence: [`blocked: ${rm.why}`, ...flags, ...ev].join(' | ') }));
    }
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Systems                                                              */
/* ------------------------------------------------------------------ */

const CHECKLIST_STATUS = { source: 'source', rebuilt: 'rebuilt', reimagined: 'reimagined', solo: 'solo', progress: 'partial', missing: 'missing', lost: 'lost' };

/**
 * sources: [{ id, name, source_ref }] (config_prod.js keys, locations/inc_*, players/inc_*, items/include/*)
 * systemMap: { id: { checklist } | { status, reason } }
 */
export function judgeSystems({ sources, systemMap, checklist }) {
  const byId = new Map(checklist.map((c) => [c.id, c]));
  return sources.map((s) => {
    const m = systemMap[s.id];
    const base = { name: s.name, source_ref: s.source_ref, detector: 'system-map' };
    if (!m) return row('system', s.id, { ...base, status: 'missing', evidence: 'no checklist item maps to it (tools/inventory/overrides.json systems)' });
    if (m.checklist) {
      const ids = [].concat(m.checklist);
      const items = ids.map((id) => byId.get(id)).filter(Boolean);
      if (!items.length) return row('system', s.id, { ...base, status: 'unknown', evidence: `maps to checklist ${ids.join(',')}, which does not exist` });
      // Several items: the weakest status wins.
      const order = ['missing', 'partial', 'lost', 'reimagined', 'solo', 'rebuilt', 'source'];
      const st = items.map((i) => CHECKLIST_STATUS[i.status] || 'unknown').sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
      return row('system', s.id, { ...base, status: m.status || st, evidence: `checklist ${items.map((i) => `${i.id} (${i.status})`).join(', ')}${m.reason ? `; ${m.reason}` : ''}` });
    }
    return row('system', s.id, { ...base, status: m.status, basis: 'override', evidence: m.reason || '' });
  });
}

/* ------------------------------------------------------------------ */
/* Locations                                                            */
/* ------------------------------------------------------------------ */

const LOCATION_CATEGORY = {
  'wip-dev-hub': ['excluded', 'designer sandbox in the WIP mote'],
  'home-pol-template': ['excluded', 'home/POL template piece (the remake builds homes its own way)'],
  'pre-release-superseded': ['excluded', 'pre-launch street, superseded'],
  'hub-placeholder': ['excluded', 'hub placeholder, never a real street'],
  'live-region-template-or-test': ['excluded', 'template or test street'],
  'street-upgrade-template': ['excluded', 'street-upgrade template state'],
  'backup-concept': ['excluded', 'saved backup or concept'],
  'apartment-tower-template': ['excluded', 'apartment/tower template'],
  'instance-template-copy-in-dump': ['excluded', 'running instance copy imported under another TSID'],
  'instance-template-no-geometry': ['missing', 'quest/instance room with no geometry anywhere'],
  // G142: hub mains, dev-map copies, backups, tests and prototypes nothing names (rooms-triage.md "exclude" rows).
  'unused-template': ['excluded', 'hub main, dev copy, backup, test or prototype: no GSJS file, config or door names it'],
  'jethimadh-tower-room': ['missing', 'Jethimadh Tower room with no geometry'],
  'live-region-other': ['unknown', 'other name in a live region: needs a judgement'],
  'subway-unreleased': ['unknown', 'filed as unreleased: needs evidence (the subway was mis-filed this way)'],
};

/**
 * mapStreets: [{ tsid, name, hubId, hubName }], index: { G-tsid: meta }, categories: Map tsid -> category,
 * codeRefs: Map tsid -> [files] (literal mentions in remake code), and what rebuilds a place with no
 * street file (quest rooms and feature scenes have no TSID of their own):
 *   gsjsRefs     Map L-tsid -> [ref] (gsjs-data.mjs tsidRefsFromText: quest locations, instance ids, config keys)
 *   rooms        { questRooms, builtRooms, modulePath(room) } (js/quest-rooms/catalog.js)
 *   builders     Map L-tsid -> [{ file, line, ctx }]: declared (const, property, array) in a live module
 *   declaredOff  the same, in an object marked `available: false` (declared, not built yet): missing
 *   remakeIds    Map id -> [{ file, line }]: `id: '<id>'` in a live module (a config_prod.js key rebuilt)
 *   questStatus  Map quest id -> inventory status
 * A rebuilt place is `rebuilt`; a room whose quest the remake plays somewhere else is `partial`.
 */
export function judgeLocations({ mapStreets, index, categories, codeRefs = new Map(), gsjsRefs = new Map(), rooms = null, builders = new Map(), declaredOff = new Map(), remakeIds = new Map(), questStatus = new Map() }) {
  const rows = [];
  const seen = new Set();
  const built = new Set(rooms?.builtRooms || []);
  const roomFile = (room) => (rooms?.modulePath ? `js/quest-rooms/${rooms.modulePath(room).replace(/^\.\//, '')}` : room);
  const at = (r) => `${r.file}:${r.line}`;
  /** [status, detector, evidence] from what rebuilds the place, or null. */
  const rebuiltBy = (tsid) => {
    const refs = gsjsRefs.get(tsid) || [];
    for (const r of refs) {
      const room = r.quest && rooms?.questRooms?.[r.quest];
      if (room && built.has(room)) return ['rebuilt', 'location-quest-room', `quest room ${room} (${roomFile(room)}) rebuilds ${r.quest} ${r.key ? `location ${r.key}${r.env === 'dev' ? ' (dev tsid)' : ''}` : 'template'} (${at(r)})`];
    }
    for (const r of refs) {
      if (r.instanceId && built.has(r.instanceId)) return ['rebuilt', 'location-instance', `instance ${r.instanceId} (${at(r)}) is quest room ${r.instanceId} (${roomFile(r.instanceId)})`];
    }
    const b = builders.get(tsid);
    if (b?.length) return ['rebuilt', 'location-builder', `built by ${b.slice(0, 2).map((x) => `${x.file}:${x.line} (${x.ctx})`).join(', ')}`];
    for (const r of refs) {
      const ids = r.configKey && remakeIds.get(r.configKey);
      if (ids?.length) return ['rebuilt', 'location-config-id', `config_prod.js ${r.configVar}.${r.configKey} (${at(r)}) is built as id '${r.configKey}' at ${ids[0].file}:${ids[0].line}`];
    }
    for (const r of refs) {
      const st = r.quest && questStatus.get(r.quest);
      if (r.key && REACHABLE.has(st)) return ['partial', 'location-quest-standin', `location ${r.key} of quest ${r.quest} (${at(r)}), which the remake plays (${st}) without rebuilding this room`];
      const q = (r.configQuests || []).find((x) => REACHABLE.has(questStatus.get(x)));
      if (q) return ['partial', 'location-quest-standin', `config_prod.js ${r.configVar}.${r.configKey} (${at(r)}), which quest ${q} looks up; the remake plays it (${questStatus.get(q)}) without rebuilding this room`];
    }
    return null;
  };
  const usedBy = (tsid) => {
    const refs = gsjsRefs.get(tsid) || [];
    const parts = [...new Set(refs.slice(0, 4).map((r) => (r.quest ? `quest ${r.quest}${r.key ? ` (${r.key})` : ''}` : r.configVar ? `config ${r.configVar}${r.configKey ? `.${r.configKey}` : ''}` : r.instanceId ? `instance ${r.instanceId} at ${at(r)}` : at(r))))];
    return parts.length ? `; GSJS: ${parts.join(', ')}${refs.length > 4 ? ` +${refs.length - 4}` : ''}` : '';
  };
  for (const s of mapStreets) {
    const g = `G${s.tsid.slice(1)}`;
    seen.add(g);
    const meta = index[g];
    const base = { name: s.name, source_ref: `inc_data_maps_prod.js hub ${s.hubId} ${s.hubName}`, detector: 'location-index' };
    if (meta) {
      rows.push(row('location', s.tsid, { ...base, status: meta.reconstructed ? 'rebuilt' : 'source', evidence: `public/assets/streets/index.json ${g}${meta.reconstructed ? ' (reconstructed)' : ''}` }));
      continue;
    }
    const cat = categories.get(s.tsid);
    const [status, why] = LOCATION_CATEGORY[cat] || ['missing', 'not imported and not categorised'];
    if (status !== 'excluded') {
      const hit = rebuiltBy(s.tsid);
      if (hit) {
        const off = declaredOff.get(s.tsid);
        const note = off?.length ? `; declared but switched off at ${off[0].file}:${off[0].line} (available: false)` : '';
        rows.push(row('location', s.tsid, { ...base, status: hit[0], detector: hit[1], evidence: `${hit[2]}${note}; category ${cat || '(none)'}` }));
        continue;
      }
    }
    const refs = codeRefs.get(s.tsid) || codeRefs.get(g) || [];
    const off = declaredOff.get(s.tsid);
    let st = status;
    let ev = `category ${cat || '(none)'}: ${why}${usedBy(s.tsid)}`;
    if (off?.length && st !== 'excluded') { st = 'missing'; ev = `declared but switched off at ${off[0].file}:${off[0].line} (${off[0].ctx}, available: false); ${ev}`; } else if (refs.length && st !== 'excluded') { st = 'unknown'; ev += `; referenced in remake code ${refs.slice(0, 3).join(', ')}`; }
    rows.push(row('location', s.tsid, { ...base, status: st, detector: 'location-category', evidence: ev }));
  }
  for (const [g, meta] of Object.entries(index)) {
    if (seen.has(g)) continue;
    rows.push(row('location', `L${g.slice(1)}`, { name: meta.label || g, source_ref: 'public/assets/streets/index.json (not on the map lists)', status: meta.reconstructed ? 'rebuilt' : 'source', detector: 'location-index', evidence: `index.json ${g}${meta.reconstructed ? ' (reconstructed)' : ''}; not in maps_get_streets()` }));
  }
  return rows;
}

/** Context kinds that declare a value (a builder's TSID constant), not merely compare or pass it. */
export const DECLARING_CTX = /^(VariableDeclarator|prop:.+|array)$/;

/* ------------------------------------------------------------------ */
/* Items and NPCs                                                       */
/* ------------------------------------------------------------------ */

const EXCLUDE_TAGS = ['deleted', 'adminonly', 'test'];
const EXCLUDE_ID = /(^test_|_test$|_test_|^admin_|_admin$|^dev_|debug|^qa_|tester)/;
const SPAWN_CTX = /^(prop:(classId|classTsid|cls|class_tsid|class_id|itemClass|npc|npcClass|spawn)|call:.*(spawn|Spawn|create|Create|place|Place|register|Register|ensure|Ensure|add[A-Z]|make[A-Z]))/;
/** Files that only list items (catalogs, art tables, labels): a mention there proves nothing. */
export const CATALOG_FILE = /(store-catalog|icon-hires|sound-keys|deco-hires|-data|dialogue|npc-glitch-looks|sprite-sheets|vector-sprites|stat-text|sound-moments|synth-sfx|inventory|achievements|quest-offers|content-catalogs)\.js$/;

/**
 * GSJS files whose mention of an item id is no evidence that the original used it: the item's own
 * file, the item list (items/catalog.js), the tag table, and the Craftybot catalog
 * (catalog_craftytasking.js), which was generated with a spec for every item class, even ones nothing
 * makes (beachball's spec needs one beachball). Same files in eleven-gsjs.
 */
export const GSJS_LIST_FILE = /items\/catalog(_tags|_craftytasking)?\.js$/;
export function gsjsItemRefs(id, files) {
  return new Set([...(files || [])].filter((f) => !f.endsWith(`items/${id}.js`) && !GSJS_LIST_FILE.test(f)));
}

/**
 * items: GSJS readItems() rows; reach: Map id -> source text (remake obtainable);
 * present: Map id -> evidence (placed/spawned world objects); codeCtx: contextLiterals(remake);
 * gsjsRefs: Map id -> Set(files) of GSJS literal references (own file and catalog_tags excluded);
 * families: [{ prefix, file }] string literals ending in _ that code builds ids from.
 */
export function judgeItems({ items, reach, present, codeCtx, gsjsRefs, families = [], templates = [] }) {
  const rows = [];
  // Base classes: an id other item files list in their parent_classes (bag, quoin, race_ticket ...).
  const subclasses = new Map();
  for (const it of items) for (const p of it.parents) if (p !== it.id) subclasses.set(p, (subclasses.get(p) || 0) + 1);
  for (const it of items) {
    const kind = it.id.startsWith('npc_') ? 'npc' : 'item';
    const base = { name: it.label, source_ref: `items/${it.id}.js`, detector: kind === 'npc' ? 'npc-spawn' : 'item-obtainable' };
    const verbs = it.verbs.length ? `source verbs: ${it.verbs.join(',')}` : '';
    const add = (status, ...ev) => rows.push(row(kind, it.id, { ...base, status, evidence: [...ev, verbs].filter(Boolean).join(' | ') }));
    if (it.id === 'catalog' || it.id.startsWith('catalog_')) { add('excluded', 'data catalog, not an item'); continue; }
    if (it.id.startsWith('quest_req_icon_')) { add('excluded', 'quest requirement icon: the class_id of a quests/*.js requirement row, drawn in the quest log, never held'); continue; }
    const tag = it.tags.find((t) => EXCLUDE_TAGS.includes(t));
    if (tag) { add('excluded', `catalog_tags/tags: ${tag}`); continue; }
    if (EXCLUDE_ID.test(it.id)) { add('excluded', 'test/admin id'); continue; }
    const refs = gsjsRefs.get(it.id) || new Set();
    if (reach.has(it.id)) { add('source', `obtainable: ${reach.get(it.id)}`); continue; }
    if (present.has(it.id)) { add('source', `in the world: ${present.get(it.id)}`); continue; }
    const ctx = (codeCtx.get(it.id) || []).filter((c) => !CATALOG_FILE.test(c.file));
    const spawn = ctx.find((c) => SPAWN_CTX.test(c.ctx));
    const constant = ctx.find((c) => c.ctx === 'VariableDeclarator');
    if (!it.takeable && spawn) { add('source', `spawned/placed by code ${spawn.file}:${spawn.line} (${spawn.ctx})`); continue; }
    // npc_flamingo spawned as makeNpc(engine, 'flamingo')
    const bare = kind === 'npc' ? (codeCtx.get(it.id.slice(4)) || []).filter((c) => !CATALOG_FILE.test(c.file) && SPAWN_CTX.test(c.ctx)) : [];
    if (!it.takeable && bare.length) { add('source', `spawned as '${it.id.slice(4)}' at ${bare[0].file}:${bare[0].line} (${bare[0].ctx})`); continue; }
    if (!it.takeable) {
      const tight = templates.find((t) => matchPattern(t.pattern.map((x) => (typeof x === 'object' ? { wild: true, cons: { strings: new Set(), regexes: [/[a-z0-9]+/] } } : x)), it.id));
      if (tight) { add('source', `spawned by template ${tight.text} at ${tight.file}:${tight.line}`); continue; }
      const loose = templates.find((t) => matchPattern(t.pattern.map((x) => (typeof x === 'object' ? { wild: true, cons: null } : x)), it.id));
      if (loose) { add('partial', `a variant of ${loose.text} (spawned at ${loose.file}:${loose.line}); this variant itself is not placed`); continue; }
    }
    if (!it.takeable && constant) { add('source', `named by a constant in ${constant.file}:${constant.line} (spawn not traced)`); continue; }
    if (!reach.has(it.id) && !present.has(it.id) && subclasses.get(it.id) >= 2) { add('excluded', `base class of ${subclasses.get(it.id)} item files (judged through them)`); continue; }
    if (it.retiredTo) { add('excluded', `retired: items/${it.id}.js onLoad swaps every stack for ${it.retiredTo} (apiSetTimerX replaceWith)`); continue; }
    if (it.hidden) { add('excluded', `is_hidden in GSJS; ${refs.size} GSJS files name it`); continue; }
    if (!refs.size) { add('unbuilt_original', 'nothing in GSJS or eleven-gsjs names it outside its own file, the item list, catalog_tags and the Craftybot catalog'); continue; }
    const fam = families.find((f) => it.id.startsWith(f.prefix) && it.id.length > f.prefix.length);
    if (!it.takeable && fam) { add('unknown', `id family ${fam.prefix}* is handled in ${fam.file}; whether this variant spawns is not traced`); continue; }
    const where = `${refs.size} GSJS files use it (${[...refs].slice(0, 3).join(', ')})`;
    if (ctx.length) { add('missing', `${it.takeable ? 'no way to obtain it' : 'not placed or spawned'}; named in ${ctx.slice(0, 2).map((c) => `${c.file}:${c.line}`).join(', ')}; ${where}`); continue; }
    add('missing', `${it.takeable ? 'no way to obtain it' : 'not placed or spawned'}; ${where}`);
  }
  // A proxy_item variant runs as its base class (npc_shrine_firebog_alph -> npc_shrine_alph; the
  // art variants rock_metal_2/3 -> rock_metal_1, peat_2/3 -> peat_1): when the base is reachable, the
  // variant's rules are too; only its own art may be missing.
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const it of items) {
    const r = byId.get(it.id);
    const baseRow = it.proxy && byId.get(it.proxy);
    if (!r || !baseRow || !['missing', 'unknown'].includes(r.status) || !REACHABLE.has(baseRow.status)) continue;
    r.status = 'partial';
    r.evidence = `proxy_item ${it.proxy} (${baseRow.status}): the remake runs it as ${it.proxy}; this variant's own art is not used`;
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Quests, skills, imagination, buffs, jobs, sounds, wardrobe, badge art */
/* ------------------------------------------------------------------ */

const QUEST_REASON = {
  multiplayer: ['lost', 'multiplayer quest'],
  needs_other_players: ['lost', 'needs other players'],
  removed_or_test: ['excluded', 'removed or test quest'],
  removed_feature: ['excluded', 'its feature was removed before shutdown'],
  broken_in_source: ['excluded', 'broken in the source'],
  incomplete_in_source: ['unbuilt_original', 'incomplete in the source'],
  unreachable_in_source: ['unbuilt_original', 'never offered in the source'],
  instance_unbuilt: ['missing', 'its quest room is not built'],
  feature_unbuilt: ['missing', 'its system is not built'],
  newxp_tutorial: ['partial', 'tutorial island quest'],
};

export function judgeQuests({ questIds, quests, questRooms, builtRooms, gsjsRefs }) {
  return questIds.map((id) => {
    const q = quests[id];
    const base = { name: q?.title || id, source_ref: `quests/${id}.js`, detector: 'quest-offers' };
    if (!q) return row('quest', id, { ...base, status: 'unknown', evidence: 'not in assets/content/quests.json' });
    if (q.isJob) return row('quest', id, { ...base, status: 'excluded', evidence: 'street-project job class (see kind street_project)' });
    if (q.solo) {
      const room = questRooms[id];
      if (room) return row('quest', id, { ...base, status: builtRooms.includes(room) ? 'rebuilt' : 'missing', evidence: `quest room ${room}${builtRooms.includes(room) ? ' built' : ' not built'}` });
      return row('quest', id, { ...base, status: 'source', evidence: 'quests.json solo' });
    }
    const [st, why] = QUEST_REASON[q.soloReason] || ['unknown', `soloReason ${q.soloReason}`];
    const refs = gsjsRefs.get(id)?.size || 0;
    const status = !refs && st !== 'lost' && st !== 'excluded' ? 'unbuilt_original' : st;
    return row('quest', id, { ...base, status, evidence: `${why}; ${refs} GSJS files offer or name it` });
  });
}

const SKILL_AUDIT = { live: 'source', partial: 'partial', later: 'missing', multiplayer: 'lost' };

/**
 * skills: GSJS readSkills() rows; audit: Map id -> { status, note };
 * statusOf(kind, id) -> status (for prereqs); unlocks: Map skill -> [{ file, item }];
 * itemReachable(id) -> bool; retired: [{ id, files }] (skills_has ids not in the catalog);
 * gateGaps: Map skill -> [text]: things the remake has whose GSJS gate on the skill the remake drops
 * (a recipe in recipes.json without the skill its catalog_recipes.js row requires).
 * `partial` means a skill-gated thing the remake has is missing its gate or effect (the skill-tree.js
 * audit says so, or a gate gap); gated items the remake lacks are judged as items, and only listed here.
 */
export function judgeSkills({ skills, audit, statusOf, unlocks, itemReachable, remakeMentions, retired = [], gateGaps = new Map() }) {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const memo = new Map();
  const learnable = (id, stack = []) => {
    if (memo.has(id)) return memo.get(id);
    if (stack.includes(id)) return { ok: true };
    const s = byId.get(id);
    if (!s) return { ok: false, why: `skill ${id} not in the catalog` };
    const blocks = [];
    for (const r of s.reqSkills) { const l = learnable(r, [...stack, id]); if (!l.ok) blocks.push(`skill ${r}: ${l.why}`); }
    for (const r of s.reqAchievements) { const st = statusOf('achievement', r); if (!REACHABLE.has(st)) blocks.push(`badge ${r} is ${st}`); }
    for (const r of s.reqQuests) { const st = statusOf('quest', r); if (!REACHABLE.has(st)) blocks.push(`quest ${r} is ${st}`); }
    for (const r of s.reqUpgrades) { const st = statusOf('imagination', r); if (!REACHABLE.has(st)) blocks.push(`card ${r} is ${st}`); }
    const out = blocks.length ? { ok: false, why: blocks.join('; '), original: blocks.some((b) => /unbuilt_original/.test(b)) } : { ok: true };
    memo.set(id, out);
    return out;
  };
  const rows = skills.map((s) => {
    const a = audit.get(s.id);
    const base = { name: `${s.name}${s.level > 1 ? ` ${s.level}` : ''}`, source_ref: `inc_data_skills.js skills_get_${s.id}`, detector: 'skill-audit+prereqs+unlocks' };
    const u = unlocks.get(s.id) || [];
    const unbuiltUnlocks = u.filter((x) => x.item && !itemReachable(x.item));
    const uniq = [...new Set(unbuiltUnlocks.map((x) => x.item))];
    const ev = [`audit: ${a ? `${a.status}${a.note ? ` (${a.note})` : ''}` : 'not in skill-tree.js'}`, `GSJS unlock sites: ${u.length}`];
    const gaps = gateGaps.get(s.id) || [];
    if (gaps.length) ev.push(`gates the remake drops: ${gaps.slice(0, 6).join(', ')}${gaps.length > 6 ? ` +${gaps.length - 6}` : ''}`);
    if (uniq.length) ev.push(`also gates items the remake lacks (judged as items): ${uniq.slice(0, 8).join(', ')}${uniq.length > 8 ? ` +${uniq.length - 8}` : ''}`);
    if (!u.length) ev.push('nothing in GSJS checks for it outside the skill catalog');
    ev.push(`remake code mentions: ${remakeMentions.get(s.id) || 0}`);
    const l = learnable(s.id);
    if (!l.ok) {
      ev.unshift(`not learnable: ${l.why}`);
      return row('skill', s.id, { ...base, status: l.original ? 'unbuilt_original' : 'missing', evidence: ev.join(' | ') });
    }
    let st = a ? SKILL_AUDIT[a.status] || 'unknown' : 'unknown';
    if (st === 'source' && gaps.length) st = 'partial';
    if (!u.length && st !== 'lost') return row('skill', s.id, { ...base, status: st === 'source' ? 'source' : 'unbuilt_original', evidence: ev.join(' | ') });
    return row('skill', s.id, { ...base, status: st, evidence: ev.join(' | ') });
  });
  for (const r of retired) {
    rows.push(row('skill', r.id, { name: r.id, source_ref: r.files.slice(0, 3).join(', '), status: 'excluded', detector: 'skill-retired', evidence: `checked by skills_has() in ${r.files.length} GSJS files but not in inc_data_skills.js (retired before shutdown)` }));
  }
  return rows;
}

const IMG_STATUS = { live: 'source', starter: 'source', partial: 'partial', later: 'missing', interface: 'excluded', multiplayer: 'lost', none: 'unbuilt_original' };

export function judgeImagination({ ids, remakeStatus, names = {} }) {
  return ids.map((id) => {
    const r = remakeStatus(id);
    return row('imagination', id, { name: names[id] || id, source_ref: 'inc_data_imagination.js', status: IMG_STATUS[r.status] || 'unknown', detector: 'imagination-remake', evidence: `${r.status}: ${r.note || ''}` });
  });
}

export function judgeBuffs({ ids, names = {}, remake, original, refs = new Map() }) {
  const hit = (list, id) => list.find((e) => matchPattern(e.pattern, id));
  return ids.map((id) => {
    const base = { name: names[id] || id, source_ref: 'items/catalog_buffs.js', detector: 'buff-applied' };
    if (/^admin_|(^|_)test$|^test_/.test(id)) return row('buff', id, { ...base, status: 'excluded', evidence: 'admin or test buff' });
    const r = hit(remake, id);
    if (r) return row('buff', id, { ...base, status: 'source', evidence: `applied at ${viaText(r)}${r.qa ? ' (QA path)' : ''}` });
    const o = hit(original, id);
    if (o) return row('buff', id, { ...base, status: 'missing', evidence: `GSJS applies it at ${viaText(o)}; the remake never does` });
    const named = [...(refs.get(id) || [])].filter((f) => !/catalog_buffs\.js$/.test(f));
    return row('buff', id, { ...base, status: 'unbuilt_original', evidence: `no live buffs_apply() for it in GSJS or eleven-gsjs${named.length ? `; only checked or commented out in ${named.slice(0, 3).join(', ')}` : '; named nowhere else'}` });
  });
}

const JOB_REASON = [
  [/^already upgraded/, 'excluded'],
  [/cultivation proto/, 'lost'],
  [/^needs items/, 'missing'],
  [/hidden in the source/, 'unbuilt_original'],
  [/group hall/, 'lost'],
  [/developer test/, 'excluded'],
  [/^cultivation restoration/, 'excluded'],
  [/^item upgrade/, 'excluded'],
  [/job class missing/, 'unbuilt_original'],
];

export function judgeJobs({ jobIds, jobs, excluded }) {
  return jobIds.map((id) => {
    const base = { source_ref: 'location XML jobs', detector: 'street-jobs' };
    if (jobs[id]) return row('street_project', id, { ...base, name: jobs[id].title || jobs[id].label, status: 'solo', evidence: `street-jobs.json ${jobs[id].kind} on ${jobs[id].street}` });
    if (excluded[id]) {
      const st = JOB_REASON.find(([re]) => re.test(excluded[id].reason))?.[1] || 'unknown';
      return row('street_project', id, { ...base, name: excluded[id].label, status: st, evidence: excluded[id].reason });
    }
    return row('street_project', id, { ...base, name: id, status: 'unknown', evidence: 'in the location XML but dropped by build-street-jobs.mjs before classification (no type 1 row, no phases or unknown class)' });
  });
}

export function judgeSounds({ keys }) {
  const rows = [];
  for (const [id, r] of Object.entries(keys)) {
    if (r.category === 'remake') continue;
    const base = { name: id, source_ref: r.moment || '', detector: 'sound-keys' };
    if (r.dead) rows.push(row('sound', id, { ...base, status: 'excluded', evidence: 'every call site commented out in the final client' }));
    else if (r.file) rows.push(row('sound', id, { ...base, status: 'source', evidence: `${r.origin}: ${r.file}` }));
    else if (r.alias) rows.push(row('sound', id, { ...base, status: 'source', evidence: `alias of ${r.alias}` }));
    else rows.push(row('sound', id, { ...base, status: 'partial', evidence: `synth stand-in (${r.category}); recording not recovered` }));
  }
  return rows;
}

export function judgeWardrobe({ swfs, catalogNames, reimagined }) {
  return swfs.map(({ key, path }) => {
    const base = { name: key, source_ref: path, detector: 'wardrobe-catalog' };
    if (catalogNames.has(key)) return row('wardrobe', key, { ...base, status: reimagined.has(key) ? 'reimagined' : 'source', evidence: 'assets/avatar/catalog.json' });
    if (/test|tester|dont_use/i.test(key)) return row('wardrobe', key, { ...base, status: 'excluded', evidence: 'tester or do-not-use SWF' });
    return row('wardrobe', key, { ...base, status: 'missing', evidence: 'SWF not in the avatar catalog' });
  });
}

export function judgeBadgeArt({ ids, names, official, generated }) {
  return ids.map((id) => row('badge_art', id, {
    name: names[id] || id, source_ref: `achievements/${id}.js icons`, detector: 'badge-icons',
    status: official.has(id) ? 'source' : generated.has(id) ? 'reimagined' : 'missing',
    evidence: official.has(id) ? 'badge-icons.json' : generated.has(id) ? 'badge-icons-generated.json' : 'no icon',
  }));
}

export { patternString };
