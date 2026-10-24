#!/usr/bin/env node
/**
 * The restoration inventory: every source thing of the original Glitch,
 * enumerated mechanically, with what the remake does about it, in SQLite.
 *
 *   node tools/inventory/build.mjs                build the DB (prints a one-line summary)
 *   node tools/inventory/build.mjs --report       counts by kind + the top unreachable entries
 *   node tools/inventory/build.mjs --kind <k>     every row of one kind (with --status <s> to filter)
 *   node tools/inventory/build.mjs --diff         status changes recorded by the last build
 *   node tools/inventory/build.mjs --json         machine-readable (with --report / --kind / --diff)
 *   node tools/inventory/build.mjs --no-build     report from the existing DB without rebuilding
 *   INVENTORY_DB=<path> overrides the DB location (tests use a temp file).
 *
 * DB: ~/Documents/glitch-audit/research/coverage/inventory.sqlite (generated, outside git).
 * Manual judgements: tools/inventory/overrides.json (in git), keyed kind:id.
 *
 * Schema
 *   entities(kind, id, name, source_ref, status, basis, detector, evidence, register, updated_at, PRIMARY KEY(kind, id))
 *     status: source | rebuilt | solo | reimagined | partial | missing | lost | excluded | unknown | unbuilt_original
 *     basis: auto (a detector decided) | override (overrides.json)
 *   history(kind, id, at, from_status, to_status, commit)   one row per status change between builds, HEAD's short hash
 *   builds(at, commit, counts)                              one row per build, counts JSON by kind and status
 *   commits(hash, date, type, subject, register_rows)       git log typed by Emoji-Log prefix (NEW/IMPROVE/FIX/DOC/TEST/RELEASE)
 *   remake_only(id, name, kind, commit, note)               things the original never had
 *   links(kind, id, register)                               register.md rows <-> entities
 *   blockers(kind, blocker, count, examples)                what blocks the most entities (e.g. one counter group)
 *
 * Kinds and detectors (rules in tools/inventory/detectors.mjs and below):
 *   achievement  GSJS achievements/*.js. Earnable when granted outright or when every condition is met
 *                by a counter the remake increments (tools/inventory/scan.mjs resolves the arguments
 *                of engine.achievement / applyAchievementProgress / grantAchievement / unlockAchievement
 *                call sites, constants, templates and wrappers included). in_inventory, making_tool and
 *                making_known_tool conditions also need the item obtainable. The same scan over GSJS +
 *                eleven-gsjs (achievements_increment / achievements_set / achievements_grant) decides
 *                unbuilt_original: the original never wired it either.
 *   system       every config_prod.js top-level var, locations/inc_*.js, players/inc_*.js and
 *                items/include/*.js: mapped to a checklist.mjs item by overrides.json, else missing.
 *   location     every street TSID in inc_data_maps_prod.js maps_get_streets() (3,295): imported or
 *                rebuilt (assets/streets/index.json), else research/streets-hunt/categories.json decides
 *                (excluded with the category as reason; unreleased/other rows are unknown).
 *   item / npc   GSJS items/*.js (npc_* separately): obtainable (tools/job-obtainable.mjs: vendors,
 *                starter kit, harvests, recipe and conversion fixpoint; plus solo quest rewards and
 *                addItem() grants outside QA paths), in the world (street-ecology.json), or placed by
 *                code (a classId/classTsid literal or a spawn/create/place call argument). Unreferenced
 *                anywhere in GSJS = unbuilt_original. Source verbs are listed in the evidence.
 *   quest        GSJS quests/*.js against quests.json solo flags and soloReason, quest rooms built.
 *   skill        inc_data_skills.js: skill-tree.js audit status, prereqs (skills, badges, quests, cards)
 *                reachable, GSJS unlock sites (files that name the skill id) on items the remake has.
 *   imagination  imagination-remake.js statuses (none = GSJS never applied it = unbuilt_original).
 *   buff         items/catalog_buffs.js: applied by the remake (applyBuff, buffId catalog) or not;
 *                not applied by GSJS buffs_apply either = unbuilt_original.
 *   street_project  every job id in the location XML: street-jobs.json playable or its exclusion reason.
 *   sound        sound-keys.json (recording = source, synth stand-in = partial, dead = excluded).
 *   wardrobe     every article SWF in glitch-avatars against the avatar catalog.
 *   badge_art    every badge against badge-icons.json / badge-icons-generated.json.
 */

import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex, contextLiterals, listJsFiles, literalIndex, matchPattern, patternString, scanEmissions, spawnTemplates, templatePatterns } from './scan.mjs';
import * as G from './gsjs-data.mjs';
import * as D from './detectors.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const SPIKE = join(here, '..', '..');
const AUDIT = join(SPIKE, '..');
export const DEFAULT_DB = join(homedir(), 'Documents/glitch-audit/research/coverage/inventory.sqlite');
const REGISTER = join(homedir(), 'Documents/glitch-audit/research/coverage/register.md');

/* ------------------------------------------------------------------ */
/* Emitters                                                             */
/* ------------------------------------------------------------------ */

export const REMAKE_EMITTERS = [
  { name: 'achievement', args: [0], member: true, tag: 'counter' },
  { name: 'applyAchievementProgress', args: [1], tag: 'counter' },
  { name: 'applyAchievementProgressRaw', args: [1], tag: 'counter' },
  { name: 'apply', args: [0], member: false, tag: 'counter', files: /exploration\.js$/ },
  { name: 'grantAchievement', args: [0], tag: 'grant' },
  { name: 'unlockAchievement', args: [1], tag: 'grant' },
  { name: 'applyBuff', args: [1], member: false, tag: 'buff' },
  { name: 'applyBuff', args: [0], member: true, tag: 'buff' },
  { name: 'addItem', args: [1], tag: 'item' },
];

export const GSJS_EMITTERS = [
  { name: 'achievements_increment', args: [0, 1], tag: 'counter' },
  { name: 'achievements_set', args: [0, 1], tag: 'counter' },
  { name: 'achievements_grant', args: [0], tag: 'grant' },
  { name: 'buffs_apply', args: [0], tag: 'buff' },
  { name: 'buffs_apply_delay', args: [0], tag: 'buff' },
];

/** Remake code files: game.js + public/js (generated data modules and vendored libs are skipped). */
export function remakeFiles(spike = SPIKE) {
  const pub = join(spike, 'public');
  return [join(pub, 'game.js'), ...listJsFiles(join(pub, 'js'), { skip: ['node_modules', 'vendor', 'lib'] })];
}

/** Emissions by tag from an index. */
export function emissionsByTag(index, emitters, opts) {
  const { emissions, unresolved } = scanEmissions(index, emitters, opts);
  const by = {};
  for (const e of emissions) (by[e.tag] ||= []).push(e);
  return { by, unresolved };
}

/* ------------------------------------------------------------------ */
/* Collect                                                              */
/* ------------------------------------------------------------------ */

function loadOverrides() {
  const p = join(here, 'overrides.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}

function git(args, cwd = SPIKE) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }).trim();
}

/** Every job id in the location XML: Map id -> { classIds, hidden, tsid }. */
function jobIdsFromXml(dir) {
  const ids = new Map();
  if (!existsSync(dir)) return ids;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.xml')) continue;
    const xml = readFileSync(join(dir, f), 'utf8');
    const at = xml.indexOf('<object id="jobs">');
    if (at < 0) continue;
    // The jobs block's own indentation decides which <object> lines are job ids.
    const indent = xml.slice(xml.lastIndexOf('\n', at) + 1, at);
    const end = xml.indexOf(`\n${indent}</object>`, at);
    const block = xml.slice(at, end < 0 ? undefined : end);
    const starts = [...block.matchAll(new RegExp(`\\n${indent}\\t<object id="([^"]+)">`, 'g'))];
    starts.forEach((m, i) => {
      const body = block.slice(m.index, starts[i + 1]?.index ?? block.length);
      const prev = ids.get(m[1]) || { classIds: new Set(), hidden: false, tsid: f.slice(0, -4) };
      for (const c of body.matchAll(/<str id="class_id">([^<]+)<\/str>/g)) prev.classIds.add(c[1]);
      if (/<int id="is_hidden">1<\/int>/.test(body)) prev.hidden = true;
      ids.set(m[1], prev);
    });
  }
  return ids;
}

export async function collect({ spike = SPIKE, log = () => {} } = {}) {
  const pub = join(spike, 'public');
  const gsjs = join(AUDIT, 'glitch-GameServerJS');
  const xmlDir = process.env.GRODDLE_LOCATION_XML || join(AUDIT, 'streets/mnt/stos/location_data');
  const eleven = join(AUDIT, 'eleven-gsjs');
  const json = (p) => JSON.parse(readFileSync(join(pub, p), 'utf8'));
  const overrides = loadOverrides();
  const t0 = Date.now();

  // Remake code.
  const remakeIndex = buildIndex(remakeFiles(spike), { root: pub });
  const remake = emissionsByTag(remakeIndex, REMAKE_EMITTERS);
  const remakeCtx = contextLiterals(remakeIndex);
  const remakeLits = literalIndex(remakeIndex);
  log(`remake scan ${Date.now() - t0} ms`);

  // Original GSJS + eleven-gsjs (text only).
  const gsjsIndex = buildIndex(listJsFiles(gsjs), { root: gsjs, sourceType: 'script' });
  const elevenIndex = existsSync(eleven) ? buildIndex(listJsFiles(eleven), { root: AUDIT, sourceType: 'script' }) : null;
  const og = emissionsByTag(gsjsIndex, GSJS_EMITTERS, { qaRe: null });
  const el = elevenIndex ? emissionsByTag(elevenIndex, GSJS_EMITTERS, { qaRe: null }) : { by: {} };
  const original = {};
  for (const tag of ['counter', 'grant', 'buff']) original[tag] = [...(og.by[tag] || []), ...(el.by[tag] || []).map((e) => ({ ...e, file: e.file }))];
  // items/item.js notifyVerb: every verb an item defines counts `<class>:<verb>` and `VERB:<verb>:<class>`
  // (achievements_increment(this.class_tsid, verb), which the scan cannot bind to a class).
  const gsjsItemsForVerbs = G.readItems(gsjs);
  for (const it of gsjsItemsForVerbs) for (const v of it.verbs) {
    original.counter.push({ tag: 'counter', pattern: [`${it.id}:${v}`], text: `${it.id}:${v}`, file: 'items/item.js', line: 738, callee: `notifyVerb (${it.id}.js verbs.${v})` });
    original.counter.push({ tag: 'counter', pattern: [`VERB:${v}:${it.id}`], text: `VERB:${v}:${it.id}`, file: 'items/item.js', line: 739, callee: `notifyVerb (${it.id}.js verbs.${v})` });
  }
  // in_inventory conditions are checked against the pack (achievements_check_in_inventory), not counted.
  original.counter.push({ tag: 'counter', pattern: ['in_inventory:', { wild: true, cons: null }], text: 'in_inventory:*', file: 'players/inc_achievements.js', line: 520, callee: 'achievements_check_in_inventory' });
  const gsjsLits = literalIndex(gsjsIndex);
  if (elevenIndex) for (const [v, files] of literalIndex(elevenIndex)) {
    if (!gsjsLits.has(v)) gsjsLits.set(v, new Set());
    for (const f of files) gsjsLits.get(v).add(f);
  }
  log(`gsjs scan ${Date.now() - t0} ms`);

  // Source catalogs.
  const tagIndex = G.readItemTags(gsjs);
  for (const [k, v] of tagIndex) tagIndex.set(k, [...new Set(v.map((t) => t.replace(/,$/, '')))]);
  const items = G.readItems(gsjs, tagIndex);
  const achievements = G.readAchievements(gsjs);
  const skills = G.readSkills(gsjs);
  const buffIds = G.readBuffIds(gsjs);
  const questIds = G.readQuestIds(gsjs);
  const mapStreets = G.readMapStreets(gsjs);

  // Remake catalogs.
  const { loadContentCatalogsFromDir } = await import(join(pub, 'js/content-catalogs.js'));
  await loadContentCatalogsFromDir(join(pub, 'assets/content'));
  const { obtainableItems, supplyConversions } = await import(join(spike, 'tools/job-obtainable.mjs'));
  const ob = await obtainableItems();
  const quests = json('assets/content/quests.json');
  const recipes = json('assets/content/recipes.json');
  const recipeIds = new Set(Object.values(recipes).map((r) => String(r.id)));
  const ecology = json('assets/content/street-ecology.json');

  // Item reach: obtainable + grants + quest rewards, then the conversion fixpoint again.
  const reach = new Map([...ob.items].map((id) => [id, ob.sources[id] || 'obtainable']));
  const addReach = (id, why) => { if (id && !reach.has(id)) reach.set(id, why); };
  for (const e of remake.by.item || []) {
    if (e.qa) continue;
    if (e.pattern.length === 1 && typeof e.pattern[0] === 'string') addReach(e.pattern[0], `addItem at ${e.file}:${e.line}`);
  }
  // addItem(inv, row.classTsid): a grant the scan cannot bind. Item ids written literally in that
  // same file (its prize or reward table) count, weakly. game.js is too broad for this.
  const itemIdSet = new Set(G.listNames(gsjs, 'items'));
  for (const e of [...(remake.by.item || []), ...remake.unresolved.filter((u) => u.tag === 'item')]) {
    if (e.qa || (e.pattern.length === 1 && typeof e.pattern[0] === 'string') || e.file === 'game.js') continue;
    const file = remakeIndex.files.find((f) => f.rel === e.file);
    for (const l of file?.literals || []) {
      if (l.regex || !itemIdSet.has(l.value)) continue;
      addReach(l.value, `addItem (dynamic) at ${e.file}:${e.line}, listed in that file`);
    }
    for (const c of e.pattern.filter((x) => typeof x === 'object' && x.cons)) for (const v of c.cons.strings) if (itemIdSet.has(v)) addReach(v, `addItem at ${e.file}:${e.line}`);
    if (file) {
      for (const t of templatePatterns(remakeIndex, file)) {
        if (!t.pattern.some((x) => typeof x === 'string' && x.length >= 4)) continue;
        for (const id of itemIdSet) if (matchPattern(t.pattern, id)) addReach(id, `addItem (dynamic) at ${e.file}:${e.line}, built at ${e.file}:${t.line} ${patternString(t.pattern)}`);
      }
    }
    // Template grants such as `npc_cubimal_${slug}`: expand against the GSJS item list.
    if (e.pattern.some((x) => typeof x === 'string' && x.length >= 6)) {
      for (const id of itemIdSet) if (matchPattern(e.pattern.map((x) => (typeof x === 'object' ? { wild: true, cons: null } : x)), id)) addReach(id, `addItem ${e.text} at ${e.file}:${e.line}`);
    }
  }
  for (const q of Object.values(quests)) {
    if (!q.solo) continue;
    for (const r of Object.values(q.rewards?.items || {})) addReach(r.class_tsid || r.class_id, `reward of quest ${q.classTsid}`);
  }
  // Street-project performance drops (street-jobs.json drops: street_creation_rewards_a, street_creation_trophies).
  const sjEarly = json('assets/content/street-jobs.json');
  const walkIds = (v, why) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { for (const x of v) walkIds(x, why); return; }
    for (const [k, x] of Object.entries(v)) if ((k === 'class_id' || k === 'classTsid') && typeof x === 'string') addReach(x, why); else walkIds(x, why);
  };
  for (const [name, t] of Object.entries(sjEarly.drops || {})) walkIds(t, `street-project drop table ${t.name || name}`);
  const conversions = await supplyConversions();
  const fix = () => {
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of conversions) {
        if (c.tool && !reach.has(c.tool)) continue;
        if (!c.inputs.every((i) => reach.has(i))) continue;
        for (const o of c.outputs) if (!reach.has(o)) { reach.set(o, c.source); grew = true; }
      }
    }
  };
  fix();
  const present = new Map();
  for (const sec of ['streets', 'soil', 'wildlife', 'furniture']) {
    for (const [tsid, r] of Object.entries(ecology[sec] || {})) {
      const counts = r.counts || r;
      for (const k of Object.keys(counts)) if (!present.has(k)) present.set(k, `street-ecology.json ${sec} (${tsid})`);
    }
  }

  // Achievements.
  const itemOk = (id) => reach.has(id) || present.has(id);
  const remakeDeps = (group, name) => {
    if (['in_inventory', 'making_tool', 'making_known_tool'].includes(group) && !itemOk(name)) return `${group}:${name} counts, but ${name} cannot be obtained`;
    if (group === 'making_known_recipe' && !recipeIds.has(String(name))) return `recipe ${name} is not in recipes.json`;
    return null;
  };
  const gsjsItems = new Map(items.map((i) => [i.id, i]));
  const originalDeps = (group, name) => {
    if (group === 'in_inventory') {
      const it = gsjsItems.get(name);
      if (!it) return `item ${name} does not exist in GSJS`;
      if (it.tags.includes('deleted')) return `item ${name} is tagged deleted`;
    }
    return null;
  };
  const counterOverrides = {};
  for (const [k, v] of Object.entries(overrides)) if (k.startsWith('counter:')) counterOverrides[k.slice(8)] = v;
  const achRows = D.judgeAchievements({
    achievements,
    remake: { counters: remake.by.counter || [], grants: remake.by.grant || [] },
    original: { counters: original.counter, grants: original.grant },
    deps: { remake: remakeDeps, original: originalDeps },
    counterOverrides,
  });
  // Rewards of earnable badges count as obtainable too.
  const achMap = Object.fromEntries(achievements.map((a) => [a.id, a]));
  const achContent = json('assets/content/achievements.json');
  for (const r of achRows) {
    if (!D.REACHABLE.has(r.status)) continue;
    for (const it of Object.values(achContent[r.id]?.rewards?.items || {})) addReach(it.class_id || it.class_tsid, `reward of badge ${r.id}`);
  }
  fix();

  // Items and NPCs.
  const gsjsRefs = new Map();
  for (const it of items) {
    const files = new Set([...(gsjsLits.get(it.id) || [])].filter((f) => !f.endsWith(`items/${it.id}.js`) && !/items\/catalog(_tags)?\.js$/.test(f)));
    gsjsRefs.set(it.id, files);
  }
  const families = [];
  for (const [v, files] of remakeLits) {
    if (!/^[a-z][a-z0-9_]{4,}_$/.test(v)) continue;
    const f = [...files].find((x) => !D.CATALOG_FILE.test(x));
    if (f) families.push({ prefix: v, file: f });
  }
  families.sort((a, b) => b.prefix.length - a.prefix.length);
  // Items placed on streets in the original location dump (objrefs carry only labels).
  const placed = new Map();
  if (existsSync(xmlDir)) {
    for (const f of readdirSync(xmlDir)) {
      if (!f.startsWith('L') || !f.endsWith('.xml')) continue;
      for (const m of readFileSync(join(xmlDir, f), 'utf8').matchAll(/<objref [^>]*label="([^"]+)"/g)) if (!placed.has(m[1])) placed.set(m[1], f.slice(0, -4));
    }
  }
  for (const it of items) if (placed.has(it.label)) gsjsRefs.get(it.id).add(`location dump ${placed.get(it.label)} (label "${it.label}")`);
  const templates = spawnTemplates(remakeIndex, { skipFile: (f) => D.CATALOG_FILE.test(f) });
  const itemRows = D.judgeItems({ items, reach, present, codeCtx: remakeCtx, gsjsRefs, families, templates });
  const itemStatus = new Map(itemRows.map((r) => [r.id, r.status]));

  // Quests.
  const { QUEST_ROOMS, BUILT_ROOMS } = await import(join(pub, 'js/quest-rooms/catalog.js'));
  const questRefs = new Map(questIds.map((id) => [id, new Set([...(gsjsLits.get(id) || [])].filter((f) => !f.endsWith(`quests/${id}.js`)))]));
  const questRows = D.judgeQuests({ questIds, quests, questRooms: QUEST_ROOMS, builtRooms: BUILT_ROOMS, gsjsRefs: questRefs });

  // Imagination.
  const { IMAGINATION_UPGRADES } = await import(join(pub, 'js/imagination-data.js'));
  const { remakeStatus } = await import(join(pub, 'js/imagination-remake.js'));
  const imgRows = D.judgeImagination({ ids: Object.keys(IMAGINATION_UPGRADES), remakeStatus, names: Object.fromEntries(Object.entries(IMAGINATION_UPGRADES).map(([k, v]) => [k, v.name])) });

  // Skills.
  const { skillAuditTable } = await import(join(pub, 'js/skill-tree.js'));
  const audit = new Map(skillAuditTable().map((r) => [r.classTsid, r]));
  const statusIndex = new Map();
  for (const r of [...achRows, ...questRows, ...imgRows]) statusIndex.set(`${r.kind}:${r.id}`, r.status);
  const skillIds = new Set(skills.map((s) => s.id));
  const unlocks = new Map();
  for (const s of skills) {
    const files = [...(gsjsLits.get(s.id) || [])].filter((f) => !/inc_data_skills\.js$|catalog_tags\.js$|^achievements\//.test(f) && !/eleven-gsjs\/inc_data_skills/.test(f));
    unlocks.set(s.id, files.map((f) => ({ file: f, item: /(^|\/)items\/([a-z_0-9]+)\.js$/.exec(f)?.[2] || null })));
  }
  const retiredMap = new Map();
  for (const file of gsjsIndex.files) {
    for (const m of file.text.matchAll(/skills_has\(\s*["']([a-z_0-9]+)["']\s*\)/g)) {
      if (skillIds.has(m[1])) continue;
      if (!retiredMap.has(m[1])) retiredMap.set(m[1], new Set());
      retiredMap.get(m[1]).add(file.rel);
    }
  }
  const remakeMentions = new Map([...skillIds].map((id) => [id, remakeLits.get(id)?.size || 0]));
  const skillRows = D.judgeSkills({
    skills, audit,
    statusOf: (kind, id) => statusIndex.get(`${kind}:${id}`) || 'unknown',
    unlocks, itemReachable: (id) => !['missing', 'unknown'].includes(itemStatus.get(id) || 'excluded'), remakeMentions,
    retired: [...retiredMap].map(([id, files]) => ({ id, files: [...files] })),
  });

  // Buffs.
  const buffContent = json('assets/content/buffs.json');
  const buffRows = D.judgeBuffs({ ids: buffIds, names: Object.fromEntries(Object.entries(buffContent).map(([k, v]) => [k, v.name])), remake: remake.by.buff || [], original: original.buff, refs: gsjsLits });

  // Street projects.
  const sj = json('assets/content/street-jobs.json');
  const xmlJobs = jobIdsFromXml(xmlDir);
  const jobIds = [...new Set([...xmlJobs.keys(), ...Object.keys(sj.jobs), ...Object.keys(sj.excluded)])].sort((a, b) => Number(a) - Number(b));
  const classType = (c) => {
    const p = join(gsjs, 'quests', `${c}.js`);
    if (!existsSync(p)) return null;
    return Number(/^var type\s*=\s*(\d+)/m.exec(readFileSync(p, 'utf8'))?.[1] ?? NaN);
  };
  const dropped = {};
  for (const [id, j] of xmlJobs) {
    if (sj.jobs[id] || sj.excluded[id]) continue;
    const types = [...j.classIds].map(classType);
    const cls = [...j.classIds].join(',');
    const reason = id.startsWith('proto-') && !j.classIds.size ? 'public-street cultivation proto: an empty proto slot; its item and spot are not in the public dump'
      : j.hidden ? 'hidden in the source (never offered)'
      : types.some((t) => t === 3 || t === 4) ? `group hall: needs a player group to claim and own the hall (${cls})`
        : /test/.test(cls) ? `developer test job (${cls})`
          : types.some((t) => t === 5) ? `cultivation restoration: offered by a depleted home or proto item, not a street board (${cls})`
            : types.some((t) => t === 6) ? `item upgrade: offered by an upgradeable item (${cls})`
              : types.some((t) => t == null) ? `job class missing from GSJS quests/ (${cls})` : '';
    if (reason) dropped[id] = { label: `job ${id} on ${j.tsid}`, reason };
  }
  const jobRows = D.judgeJobs({ jobIds, jobs: sj.jobs, excluded: { ...dropped, ...sj.excluded } });

  // Sounds, wardrobe, badge art.
  const soundKeys = json('assets/content/sound-keys.json').keys;
  const soundRows = D.judgeSounds({ keys: soundKeys });
  const avatar = json('assets/avatar/catalog.json');
  const catalogNames = new Set();
  const reimagined = new Set();
  for (const [type, list] of Object.entries(avatar.types || {})) for (const i of list) { catalogNames.add(`${type}/${i.name}`); if (i.reimagined) reimagined.add(`${type}/${i.name}`); }
  const swfs = [];
  for (const top of ['vanity', 'wardrobe']) {
    const dir = join(AUDIT, 'glitch-avatars', top);
    if (!existsSync(dir)) continue;
    for (const type of readdirSync(dir)) {
      const td = join(dir, type);
      if (!statSync(td).isDirectory()) continue;
      for (const f of readdirSync(td)) if (f.endsWith('.swf')) swfs.push({ key: `${type}/${f.slice(0, -4)}`, path: `glitch-avatars/${top}/${type}/${f}` });
    }
  }
  const wardrobeRows = D.judgeWardrobe({ swfs, catalogNames, reimagined });
  const badgeRows = D.judgeBadgeArt({
    ids: achievements.map((a) => a.id), names: Object.fromEntries(achievements.map((a) => [a.id, a.name])),
    official: new Set(Object.keys(json('assets/content/badge-icons.json'))), generated: new Set(Object.keys(json('assets/content/badge-icons-generated.json'))),
  });

  // Systems.
  const { CHECKLIST } = await import(join(spike, 'tools/restoration/checklist.mjs'));
  const sysSources = [
    ...G.readConfigKeys(gsjs).map((k) => ({ id: `config/${k}`, name: k, source_ref: 'config_prod.js' })),
    ...G.listNames(gsjs, 'locations', /^inc_.*\.js$/).map((k) => ({ id: `locations/${k}`, name: k, source_ref: `locations/${k}.js` })),
    ...G.listNames(gsjs, 'players', /^inc_.*\.js$/).map((k) => ({ id: `players/${k}`, name: k, source_ref: `players/${k}.js` })),
    ...G.listNames(gsjs, 'items/include').map((k) => ({ id: `items/include/${k}`, name: k, source_ref: `items/include/${k}.js` })),
  ];
  const systemMap = {};
  for (const [k, v] of Object.entries(overrides)) if (k.startsWith('system:')) systemMap[k.slice(7)] = v;
  const sysRows = D.judgeSystems({ sources: sysSources, systemMap, checklist: CHECKLIST });

  // Locations.
  const streetIndex = json('assets/streets/index.json').streets;
  const catPath = join(AUDIT, 'research/streets-hunt/categories.json');
  const categories = new Map(existsSync(catPath) ? JSON.parse(readFileSync(catPath, 'utf8')).map((r) => [r.tsid, r.category]) : []);
  const codeRefs = new Map();
  for (const [v, files] of remakeLits) {
    if (!/^[LG][A-Z0-9]{12,16}$/.test(v)) continue;
    const real = [...files].filter((f) => !D.CATALOG_FILE.test(f));
    if (real.length) codeRefs.set(v, real);
  }
  const locRows = D.judgeLocations({ mapStreets, index: streetIndex, categories, codeRefs });

  let entities = [...achRows, ...sysRows, ...locRows, ...itemRows, ...questRows, ...skillRows, ...imgRows, ...buffRows, ...jobRows, ...soundRows, ...wardrobeRows, ...badgeRows];

  // Overrides: kind:id -> { status, reason, register }.
  const applied = new Set();
  entities = entities.map((e) => {
    const o = overrides[`${e.kind}:${e.id}`];
    if (!o || e.kind === 'system') return e;
    applied.add(`${e.kind}:${e.id}`);
    return { ...e, status: o.status || e.status, basis: o.status ? 'override' : e.basis, evidence: o.reason ? `${o.reason} | auto: ${e.status} ${e.evidence}` : e.evidence, register: o.register || e.register || '' };
  });

  // Remake-only things.
  const remakeOnly = [];
  for (const c of CHECKLIST.filter((x) => x.status === 'reimagined')) remakeOnly.push({ id: `checklist:${c.id}`, name: c.name, kind: 'system', note: c.blurb });
  for (const key of reimagined) if (!swfs.some((s) => s.key === key)) remakeOnly.push({ id: `wardrobe:${key}`, name: key, kind: 'wardrobe', note: 'greyscale master with borrowed colours (G52)' });
  for (const [id, r] of Object.entries(soundKeys)) if (r.category === 'remake') remakeOnly.push({ id: `sound:${id}`, name: id, kind: 'sound', note: r.moment || 'remake-only sound key' });
  const postsPath = join(spike, 'tools/changelog/posts.json');
  if (existsSync(postsPath)) remakeOnly.push({ id: 'page:notes-blog', name: 'Notes blog (/changelog/)', kind: 'page', note: 'tools/changelog/posts.json' });
  if (existsSync(join(pub, 'js/practice-mode.js'))) remakeOnly.push({ id: 'page:practice-mode', name: 'Practice mode play links', kind: 'page', note: 'public/js/practice-mode.js' });
  if (existsSync(join(pub, 'restoration'))) remakeOnly.push({ id: 'page:restoration', name: 'Restoration walkthrough', kind: 'page', note: 'public/restoration/' });
  for (const [id, r] of Object.entries(IMAGINATION_UPGRADES)) if (r.remakeOnly) remakeOnly.push({ id: `imagination:${id}`, name: r.name, kind: 'imagination', note: 'remake-only card' });

  // Register links.
  const links = [];
  if (existsSync(REGISTER)) {
    const tokenMap = new Map();
    for (const e of entities) {
      if (e.id.length < 6 || !(/_/.test(e.id) || /^[LG][A-Z0-9]{12,16}$/.test(e.id))) continue;
      if (!tokenMap.has(e.id)) tokenMap.set(e.id, []);
      tokenMap.get(e.id).push(e);
    }
    for (const line of readFileSync(REGISTER, 'utf8').split('\n')) {
      const m = /^\| (G\d+) \|/.exec(line);
      if (!m) continue;
      for (const tok of new Set(line.match(/[A-Za-z0-9_]+/g) || [])) for (const e of tokenMap.get(tok) || []) links.push({ kind: e.kind, id: e.id, register: m[1] });
    }
  }
  for (const e of entities) if (e.register) for (const r of String(e.register).split(/[ ,]+/).filter(Boolean)) links.push({ kind: e.kind, id: e.id, register: r });

  // Commits.
  const commits = [];
  try {
    const raw = git(['log', '--format=%h%x1f%cs%x1f%s%x1f%b%x1e'], spike);
    const TYPES = { '📦': 'NEW', '👌': 'IMPROVE', '🐛': 'FIX', '📖': 'DOC', '🤖': 'TEST', '🚀': 'RELEASE' };
    for (const rec of raw.split('\x1e')) {
      const [hash, date, subject = '', body = ''] = rec.replace(/^\n+/, '').split('\x1f');
      if (!hash) continue;
      const m = /^(\S+)\s+(NEW|IMPROVE|FIX|DOC|TEST|RELEASE):/u.exec(subject);
      const type = m ? m[2] : (TYPES[[...subject][0]] || 'OTHER');
      const rows = [...new Set(`${subject}\n${body}`.match(/\bG\d+\b/g) || [])].join(',');
      commits.push({ hash, date, type, subject, register_rows: rows });
    }
  } catch { /* not a git checkout */ }

  return {
    entities, remakeOnly, links, commits,
    unresolved: { remake: remake.unresolved, original: [...(og.unresolved || []), ...(el.unresolved || [])] },
    parseFailures: [...remakeIndex.failures, ...gsjsIndex.failures, ...(elevenIndex?.failures || [])],
    overridesApplied: applied.size,
    ms: Date.now() - t0,
  };
}

/* ------------------------------------------------------------------ */
/* Database                                                             */
/* ------------------------------------------------------------------ */

export function openDb(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (kind TEXT, id TEXT, name TEXT, source_ref TEXT, status TEXT, basis TEXT, detector TEXT, evidence TEXT, register TEXT, updated_at TEXT, PRIMARY KEY (kind, id));
    CREATE TABLE IF NOT EXISTS history (kind TEXT, id TEXT, at TEXT, from_status TEXT, to_status TEXT, "commit" TEXT);
    CREATE TABLE IF NOT EXISTS builds (at TEXT, "commit" TEXT, counts TEXT);
    CREATE TABLE IF NOT EXISTS commits (hash TEXT PRIMARY KEY, date TEXT, type TEXT, subject TEXT, register_rows TEXT);
    CREATE TABLE IF NOT EXISTS remake_only (id TEXT PRIMARY KEY, name TEXT, kind TEXT, "commit" TEXT, note TEXT);
    CREATE TABLE IF NOT EXISTS links (kind TEXT, id TEXT, register TEXT, PRIMARY KEY (kind, id, register));
    CREATE TABLE IF NOT EXISTS blockers (kind TEXT, blocker TEXT, count INTEGER, examples TEXT, PRIMARY KEY (kind, blocker));
    CREATE INDEX IF NOT EXISTS entities_status ON entities (kind, status);
    CREATE INDEX IF NOT EXISTS history_at ON history (at);
  `);
  return db;
}

/** Write a collect() result; returns the status changes against the previous build. */
export function writeDb(db, data, { commit = '', at = new Date().toISOString() } = {}) {
  const prev = new Map(db.prepare('SELECT kind, id, status FROM entities').all().map((r) => [`${r.kind}:${r.id}`, r.status]));
  const firstBuild = prev.size === 0;
  const changes = [];
  const seen = new Set();
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM entities; DELETE FROM remake_only; DELETE FROM links; DELETE FROM blockers; DELETE FROM commits;');
    const ins = db.prepare('INSERT OR REPLACE INTO entities (kind, id, name, source_ref, status, basis, detector, evidence, register, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const e of data.entities) {
      const key = `${e.kind}:${e.id}`;
      seen.add(key);
      ins.run(e.kind, e.id, e.name || '', e.source_ref || '', e.status, e.basis || 'auto', e.detector || '', String(e.evidence || '').slice(0, 4000), e.register || '', at);
      const was = prev.get(key);
      if (!firstBuild && was !== e.status) changes.push({ kind: e.kind, id: e.id, from: was ?? null, to: e.status });
    }
    if (!firstBuild) for (const [key, was] of prev) if (!seen.has(key)) { const [kind, ...rest] = key.split(':'); changes.push({ kind, id: rest.join(':'), from: was, to: null }); }
    const hist = db.prepare('INSERT INTO history (kind, id, at, from_status, to_status, "commit") VALUES (?, ?, ?, ?, ?, ?)');
    for (const c of changes) hist.run(c.kind, c.id, at, c.from, c.to, commit);
    const ro = db.prepare('INSERT OR REPLACE INTO remake_only (id, name, kind, "commit", note) VALUES (?, ?, ?, ?, ?)');
    for (const r of data.remakeOnly || []) ro.run(r.id, r.name, r.kind, r.commit || '', r.note || '');
    const ln = db.prepare('INSERT OR IGNORE INTO links (kind, id, register) VALUES (?, ?, ?)');
    for (const l of data.links || []) ln.run(l.kind, l.id, l.register);
    const cm = db.prepare('INSERT OR REPLACE INTO commits (hash, date, type, subject, register_rows) VALUES (?, ?, ?, ?, ?)');
    for (const c of data.commits || []) cm.run(c.hash, c.date, c.type, c.subject, c.register_rows);
    const bl = db.prepare('INSERT OR REPLACE INTO blockers (kind, blocker, count, examples) VALUES (?, ?, ?, ?)');
    for (const b of blockerRows(data.entities)) bl.run(b.kind, b.blocker, b.count, b.examples);
    db.prepare('INSERT INTO builds (at, "commit", counts) VALUES (?, ?, ?)').run(at, commit, JSON.stringify(countsFrom(data.entities)));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { changes, firstBuild };
}

/** Group unreachable achievements by the counter group that blocks them. */
export function blockerRows(entities) {
  const by = new Map();
  for (const e of entities) {
    if (e.kind !== 'achievement' || !e.blocker || !['missing', 'unbuilt_original', 'unknown'].includes(e.status)) continue;
    const k = `${e.status}:${e.blocker}`;
    if (!by.has(k)) by.set(k, { kind: `achievement/${e.status}`, blocker: e.blocker, list: [] });
    by.get(k).list.push(e.id);
  }
  return [...by.values()].map((b) => ({ kind: b.kind, blocker: b.blocker, count: b.list.length, examples: b.list.slice(0, 8).join(',') })).sort((a, b) => b.count - a.count);
}

export function countsFrom(entities) {
  const out = {};
  for (const e of entities) {
    out[e.kind] ||= {};
    out[e.kind][e.status] = (out[e.kind][e.status] || 0) + 1;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Reports                                                              */
/* ------------------------------------------------------------------ */

const KIND_ORDER = ['system', 'achievement', 'skill', 'quest', 'location', 'item', 'npc', 'buff', 'imagination', 'street_project', 'sound', 'wardrobe', 'badge_art'];
const VALUE = { system: 60, quest: 12, skill: 10, npc: 6, achievement: 4, buff: 3, location: 3, item: 2, imagination: 2, street_project: 1, sound: 1, wardrobe: 1, badge_art: 1 };

export function summary(db) {
  const rows = db.prepare('SELECT kind, status, COUNT(*) AS n FROM entities GROUP BY kind, status').all();
  const by = {};
  for (const r of rows) {
    by[r.kind] ||= { total: 0, reachable: 0 };
    by[r.kind][r.status] = r.n;
    by[r.kind].total += r.n;
    if (D.REACHABLE.has(r.status)) by[r.kind].reachable += r.n;
  }
  return by;
}

/** The most valuable unreachable things: whole systems, then counter groups that block many badges, then the rest. */
export function topMissing(db, limit = 30) {
  const out = [];
  for (const r of db.prepare("SELECT * FROM entities WHERE status IN ('missing','unknown') AND kind = 'system'").all()) out.push({ score: VALUE.system, kind: r.kind, id: r.id, name: r.name, status: r.status, why: r.evidence });
  for (const b of db.prepare("SELECT * FROM blockers WHERE kind = 'achievement/missing'").all()) {
    out.push({ score: VALUE.achievement * b.count + 2, kind: 'achievement-group', id: b.blocker, name: `${b.count} badge${b.count > 1 ? 's' : ''} blocked by ${b.blocker}`, status: 'missing', why: b.examples });
  }
  const refs = (ev) => Number(/(\d+) GSJS files use it/.exec(ev || '')?.[1] || 0);
  for (const r of db.prepare("SELECT * FROM entities WHERE status IN ('missing','partial') AND kind IN ('quest','skill','npc','buff','item','location')").all()) {
    const base = VALUE[r.kind] || 1;
    const score = r.kind === 'item' || r.kind === 'npc' ? base + Math.min(10, refs(r.evidence)) : r.status === 'partial' ? base / 2 : base;
    out.push({ score, kind: r.kind, id: r.id, name: r.name, status: r.status, why: r.evidence });
  }
  return out.sort((a, b) => b.score - a.score || a.kind.localeCompare(b.kind)).slice(0, limit);
}

function printTable(by) {
  const cols = ['total', 'reachable', 'partial', 'missing', 'unknown', 'lost', 'excluded', 'unbuilt_original'];
  console.log(`${'kind'.padEnd(16)}${cols.map((c) => c.replace('unbuilt_original', 'unbuilt').padStart(10)).join('')}`);
  for (const k of [...KIND_ORDER, ...Object.keys(by).filter((x) => !KIND_ORDER.includes(x))]) {
    if (!by[k]) continue;
    console.log(`${k.padEnd(16)}${cols.map((c) => String(by[k][c] || 0).padStart(10)).join('')}`);
  }
}

function cut(s, n) { s = String(s || '').replace(/\s+/g, ' '); return s.length > n ? `${s.slice(0, n - 1)}…` : s; }

export function lastDiff(db) {
  const last = db.prepare('SELECT at FROM builds ORDER BY at DESC LIMIT 1').get();
  if (!last) return { at: null, changes: [] };
  return { at: last.at, changes: db.prepare('SELECT kind, id, from_status, to_status, "commit" FROM history WHERE at = ? ORDER BY kind, id').all(last.at) };
}

/* ------------------------------------------------------------------ */
/* CLI                                                                  */
/* ------------------------------------------------------------------ */

async function main() {
  const args = process.argv.slice(2);
  const flag = (f) => args.includes(f);
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
  const asJson = flag('--json');
  const dbPath = process.env.INVENTORY_DB || DEFAULT_DB;
  const db = openDb(dbPath);
  let built = null;
  if (!flag('--no-build')) {
    const data = await collect({ log: asJson ? () => {} : (m) => process.stderr.write(`${m}\n`) });
    let commit = '';
    try { commit = git(['rev-parse', '--short', 'HEAD']); } catch { /* none */ }
    built = { ...writeDb(db, data, { commit }), data };
    if (!asJson && !flag('--report') && !flag('--kind') && !flag('--diff')) {
      const by = summary(db);
      const total = Object.values(by).reduce((a, b) => a + b.total, 0);
      const reach = Object.values(by).reduce((a, b) => a + b.reachable, 0);
      console.log(`inventory: ${total} entities, ${reach} reachable, ${built.changes.length} status changes, ${data.overridesApplied} overrides, ${data.unresolved.remake.length} unresolved remake emitter args, ${data.parseFailures.length} parse failures (${data.ms} ms) -> ${dbPath}`);
    }
  }
  if (flag('--report')) {
    const by = summary(db);
    const top = topMissing(db, 30);
    const blockers = db.prepare('SELECT * FROM blockers ORDER BY count DESC').all();
    const unbuilt = db.prepare("SELECT kind, id, name, evidence FROM entities WHERE status = 'unbuilt_original' ORDER BY kind, id").all();
    if (asJson) { console.log(JSON.stringify({ counts: by, top, blockers, unbuilt }, null, 1)); return; }
    console.log(`Inventory (${dbPath})\n`);
    printTable(by);
    console.log('\nTop unreachable (missing/unknown), most valuable first:');
    top.forEach((t, i) => console.log(`${String(i + 1).padStart(2)}. [${t.kind}] ${t.id}${t.name && t.name !== t.id ? ` (${cut(t.name, 50)})` : ''}: ${cut(t.why, 150)}`));
    console.log('\nCounter groups blocking badges:');
    for (const b of blockers.slice(0, 25)) console.log(`  ${b.kind.padEnd(30)} ${String(b.count).padStart(3)}  ${b.blocker}  (${cut(b.examples, 80)})`);
    console.log(`\nunbuilt_original: ${unbuilt.length} (designers' ideas never wired in GSJS); --kind <k> --status unbuilt_original lists them`);
    if (built) console.log(`\n${built.changes.length} status changes this build; --diff lists them`);
    return;
  }
  if (val('--kind')) {
    const st = val('--status');
    const rows = db.prepare(`SELECT * FROM entities WHERE kind = ?${st ? ' AND status = ?' : ''} ORDER BY status, id`).all(...[val('--kind'), st].filter(Boolean));
    if (asJson) { console.log(JSON.stringify(rows, null, 1)); return; }
    for (const r of rows) console.log(`${r.status.padEnd(17)} ${r.id.padEnd(36)} ${cut(r.name, 34).padEnd(35)} ${cut(r.evidence, 140)}`);
    console.log(`${rows.length} rows`);
    return;
  }
  if (flag('--diff')) {
    const d = lastDiff(db);
    if (asJson) { console.log(JSON.stringify(d, null, 1)); return; }
    console.log(`Status changes recorded by the build at ${d.at || '(none)'}:`);
    for (const c of d.changes) console.log(`  ${c.kind}:${c.id}  ${c.from_status ?? '(new)'} -> ${c.to_status ?? '(gone)'}  ${c.commit}`);
    console.log(`${d.changes.length} changes`);
    return;
  }
  if (asJson && built) console.log(JSON.stringify({ counts: summary(db), changes: built.changes.length }, null, 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
