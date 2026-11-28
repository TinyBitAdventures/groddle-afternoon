/**
 * The quest audit (Austin 2026-11-25, after #671 Sparkly of Interest: "Are there other quests with
 * status broken like this mining quest? If so we find and fix them now"). Every quest a player can
 * be offered or given (solo, the custom story quests, and the ones multiplayer offers) is checked,
 * requirement by requirement, for each way a player could be stuck on a quest that looks broken:
 *
 *   a  fed        something in the game advances it: a COUNTER_ROUTES row whose event the game
 *                 emits (a call to emitGameEvent, applyAchievementProgress, engine.achievement,
 *                 onEvent, applyQuestProgress or an events list), a room flag, the pack (items),
 *                 a make (making_recipe), or a hand-checked feeder (FEEDERS, each proved by a
 *                 pattern in its file)
 *   b  visible    the row moves with the first unit of work (no hidden sum behind 0/1, R53), and a
 *                 flag's words ask for one thing, not a number
 *   c  possible   what it needs exists in the remake: the item (and a way to get it: the Item
 *                 Catalog's `get`), the recipe and its tool, the street its event names, the verb
 *                 on that class in GSJS, and no route that only counts while another, already
 *                 finished, quest is under way
 *   d  pays       fed as the routes say, the quest becomes completable and turns in with its
 *                 rewards, and every reward item and recipe exists
 *   e  words      no editor placeholder or raw id in the title, desc, offer, completion or a step
 *   f  offered    its chain and gate can open: prereq quests are themselves offered, trigger
 *                 skills, achievements and givers exist, and finishing part N offers part N+1
 *                 (pendingQuestOffers / npcQuestOffers with the prereqs done)
 *   g  online     the multiplayer game reaches the same feeders: shared rocks, trees and plots run
 *                 the same verb path (game.js runWorldVerb with the server's grant), so a feeder
 *                 that only runs in solo is named in SOLO_ONLY_FEEDERS and fails the check
 *
 * Quests held back on purpose are listed apart: a street no open road reaches on a fresh world
 * (js/quest-reach.js, tests/quest-reach.test.js), and quests whose giver never hands them out.
 *
 *   node tools/quests/audit.mjs           print the table
 *   node tools/quests/audit.mjs --json    the whole result as JSON
 *
 * tests/quest-audit.test.js fails on any finding not in ALLOWED (each with its reason).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadContentCatalogsFromDir, resetContentCatalogs, getQuestCatalog, getSkillCatalog, getAchievementCatalog } from '../../public/js/content-catalogs.js?v=b2a9a862';
import { createQuestState, cleanQuestMarkup, listQuestLog } from '../../public/js/quests.js?v=17fca824';
import {
  COUNTER_ROUTES,
  classifyQuests,
  requirementRoute,
  routesForCounter,
  acceptOffer,
  routeQuestEvent,
  syncItemRequirements,
  turnInQuest,
  pendingQuestOffers,
  npcQuestOffers,
  setQuestHeldCheck,
  REMAKE_QUEST_NPCS,
} from '../../public/js/quest-offers.js?v=769eba09';
import { MULTIPLAYER_QUESTS } from '../../public/js/quests-mp.js?v=e697cec3';
import { QUEST_ROOMS } from '../../public/js/quest-rooms/catalog.js?v=f37a25ba';
import { placeIndex, questHold } from '../../public/js/quest-reach.js?v=8b079fd3';
import { SUBWAY_STREETS, closedStreets, initializeStreetJobs, normalizeStreetJobState } from '../../public/js/street-jobs.js?v=e175c7e5';
import { routeGraph } from '../../public/js/map-routes.js?v=084dc311';
import { TELEPORTERS } from '../../public/js/hidden-floors.js?v=023336cb';
import { WINTRY_PORTAL_TELEPORTERS } from '../../public/js/wintry-portal.js?v=1437deda';
import { reachableStreets, streetGraph } from '../../public/js/street-graph.js?v=92206051';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'public');
const GSJS = join(ROOT, '..', 'glitch-GameServerJS');
const json = (rel) => JSON.parse(readFileSync(join(PUB, rel), 'utf8'));

/**
 * Feeders the scan cannot see by itself (a name held in a constant, a word too common to grep).
 * Each is proved by a pattern in its file; the audit fails if the pattern goes.
 * key: '<quest> <requirement name>' or '* <requirement name>' (any quest).
 */
export const FEEDERS = Object.freeze({
  'hogtie_piggy multiplayer_quest_win': { file: 'js/races.js', proof: /RACE_FLAGS = Object\.freeze\(\{ win: 'multiplayer_quest_win', leave: 'race_leave' \}\)/ },
  'hogtie_piggy race_leave': { file: 'js/races.js', proof: /leave: 'race_leave'/ },
  'blue_and_white_part1 leave': { file: 'js/summers-day.js', proof: /\bleave\b/ },
  'blue_and_white_part2 leave': { file: 'js/summers-day.js', proof: /\bleave\b/ },
  'winter_walk leave': { file: 'js/winter-walk.js', proof: /\bleave\b/ },
  'winter_walk_part2 leave': { file: 'js/winter-walk.js', proof: /\bleave\b/ },
  'animalkinship_1 finish_animalkinship': { file: 'js/newxp.js', proof: /finishBox: 'quest:flag:finish_animalkinship'/ },
  'lightgreenthumb_1 finish_lightgreenthumb': { file: 'js/newxp.js', proof: /finishBox: 'quest:flag:finish_lightgreenthumb'/ },
  'leave_gentle_island leave_gentle_island': { file: 'js/features/newxp-feature.js', proof: /turnInQuest\(qs, 'leave_gentle_island'/ },
  'phantom_glitch found_ghost': { file: 'js/ghost-quest.js', proof: /name: 'found_ghost'/ },
  // focusing_orb.js 1299 quests_set_flag: the server decides it (radiance.go), meditation-feature passes the flag on.
  'transcendentalradiation_radiate_to_five_people transcendence_5players': { file: 'js/features/meditation-feature.js', proof: /if \(flag !== 'transcendence_5players'\) continue;\s*engine\.questFlag\?\.\(flag\);/ },
});

/**
 * Feeders that only run in solo (the online game never reaches them). Empty: every feeder found
 * runs in both (the verb path takes the server's grant online, game.js runWorldVerb sharedVerbGrant).
 */
export const SOLO_ONLY_FEEDERS = Object.freeze({});

/* ------------------------------------------------------------------ */
/* The game's source, as the scan reads it                              */
/* ------------------------------------------------------------------ */

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Comments blanked (line numbers kept), so a word in a comment is never a feeder. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[\s;{}()])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
}

const EMIT_CALL = /(emitGameEvent|applyAchievementProgress|achievement\??\.?\(|onEvent\(|\bemit\(|\.event\(|applyQuestProgress|routeQuestEvent|events\.push\(|\bcounter\s*:|\bevent\s*:|questEvent\s*=|questEvents?\.push|setFlag\(|\bcount\(|questFlag\??\.?\(|progress\[[^\]]+\]\s*=(?!=))/;

/**
 * Every string a game event can be made from, where the game sends it: literals and template
 * literals inside an emitting call (EMIT_CALL in the same statement before it).
 */
export function readEmitters(root = ROOT) {
  const files = [join(root, 'public', 'game.js'), ...walk(join(root, 'public', 'js'))];
  const literals = new Map(); // value -> [where]
  const templates = []; // { re, prefix, fixed, where, src }
  const words = []; // { file, text } for direct-name and FEEDERS checks
  const statements = []; // the text of every emitting statement (a constant's name in one counts)
  const constants = new Map(); // value -> [{ name, where }] (NAME = 'value' or name: 'value')
  const addTemplate = (body, where) => {
    // A ternary of two strings inside ${} is either string.
    const alt = body.match(/\$\{[^{}?]*\?\s*'([^']*)'\s*:\s*'([^']*)'\s*\}/);
    if (alt) {
      addTemplate(body.replace(alt[0], alt[1]), where);
      addTemplate(body.replace(alt[0], alt[2]), where);
      return;
    }
    if (!body.includes('${')) {
      (literals.get(body) || literals.set(body, []).get(body)).push(where);
      return;
    }
    const parts = body.split(/\$\{(?:[^{}]|\{[^{}]*\})*\}/);
    const re = new RegExp(`^${parts.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+')}$`);
    templates.push({ re, prefix: parts[0], fixed: parts.join('').length, where, src: body });
  };
  for (const file of files) {
    let src = stripComments(readFileSync(file, 'utf8'));
    const rel = relative(join(root, 'public'), file);
    if (rel === 'js/quest-offers.js') {
      // The route tables declare events; they never send one.
      const a = src.indexOf('export const COUNTER_ROUTES');
      const b = src.indexOf('const templateCache');
      if (a > 0 && b > a) src = src.slice(0, a) + src.slice(b);
    }
    words.push({ file: rel, text: src });
    const lineOf = (i) => src.slice(0, i).split('\n').length;
    const call = new RegExp(EMIT_CALL.source, 'g');
    let c;
    while ((c = call.exec(src))) {
      const from = src.lastIndexOf(';', c.index) + 1;
      let to = src.indexOf(';', c.index);
      if (to < 0) to = src.length;
      statements.push(src.slice(from, Math.min(to, c.index + 400)));
    }
    const decl = /(?:\b([A-Za-z_$][\w$]*)\s*(?:=|:)\s*)'([^'\\\n]+)'/g;
    while ((c = decl.exec(src))) {
      (constants.get(c[2]) || constants.set(c[2], []).get(c[2])).push({ name: c[1], where: `${rel}:${lineOf(c.index)}` });
    }
    const re = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
    let m;
    while ((m = re.exec(src))) {
      const before = src.slice(Math.max(0, m.index - 220), m.index);
      const stmt = before.slice(before.lastIndexOf(';') + 1);
      if (!EMIT_CALL.test(stmt)) continue;
      addTemplate(m[0][0] === '`' ? m[0].slice(1, -1) : m[0].slice(1, -1).replace(/\$\{/g, '$ {'), `${rel}:${lineOf(m.index)}`);
    }
  }
  return { literals, templates, words, statements, constants };
}

/**
 * Who sends this concrete event: ['literal', where] for its exact string, ['constant', where] for
 * a constant holding it whose name an emitting statement uses, ['template', where] for a template
 * literal with fixed text that matches it, ['generic', where] for one that is all placeholders but
 * a ':' (`${class}:${verb}`: every world verb and pack use), or null.
 */
export function emitterOf(event, emitters) {
  const lit = emitters.literals.get(event);
  if (lit) return { kind: 'literal', where: lit[0] };
  for (const { name, where } of emitters.constants.get(event) || []) {
    const word = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`);
    if (emitters.statements.some((st) => word.test(st))) return { kind: 'constant', where };
  }
  for (const t of emitters.templates) if (t.fixed >= 3 && t.re.test(event)) return { kind: 'template', where: t.where };
  for (const t of emitters.templates) if (t.fixed < 3 && t.re.test(event) && /:/.test(event)) return { kind: 'generic', where: t.where };
  return null;
}

/** Who sends some event starting with `prefix` (a route's event before its first {a}). */
function emitterOfPrefix(prefix, emitters) {
  for (const [value, where] of emitters.literals) if (value.startsWith(prefix)) return { kind: 'literal', where: where[0] };
  for (const t of emitters.templates) {
    if (t.prefix.length >= 3 && (t.prefix.startsWith(prefix) || prefix.startsWith(t.prefix))) return { kind: 'template', where: t.where };
  }
  return null;
}

/** A requirement name written straight into a quest's progress, or sent by name. */
function directWriter(name, emitters) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`progress(?:\\.${esc}\\b|\\[\\s*['"\`]${esc}['"\`]\\s*\\])\\s*=(?!=)`);
  for (const { file, text } of emitters.words) if (re.test(text)) return { kind: 'progress', where: file };
  const who = emitterOf(name, emitters);
  if (who && who.kind !== 'generic') return who;
  // A name built from a stem (read_act_${n}), sent or written straight into progress.
  const stem = name.replace(/\d+$/, '');
  if (stem !== name) {
    for (const t of emitters.templates) if (t.prefix === stem) return { kind: 'template', where: t.where };
    const st = new RegExp(`progress\\[\`${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\$\\{[^\`]*\`\\]\\s*=(?!=)`);
    for (const { file, text } of emitters.words) if (st.test(text)) return { kind: 'progress', where: file };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The remake's world                                                    */
/* ------------------------------------------------------------------ */

function loadWorld() {
  const items = new Map(json('encyclopedia/items/data.json').items.map((row) => [row.id, row]));
  const recipes = json('assets/content/recipes.json');
  const index = json('assets/streets/index.json');
  const idx = placeIndex(index);
  // A fresh world's open roads (tests/quest-reach.test.js world()).
  const jobs = json('assets/content/street-jobs.json');
  const graph = routeGraph(json('assets/content/signpost-graph.json')).graph;
  const G = (t) => String(t || '').replace(/^L/, 'G');
  const free = {};
  for (const a of SUBWAY_STREETS) for (const b of SUBWAY_STREETS) if (a !== b) (free[a] ||= []).push(b);
  for (const t of [...TELEPORTERS, ...WINTRY_PORTAL_TELEPORTERS]) (free[G(t.from)] ||= []).push(G(t.to));
  const state = normalizeStreetJobState({});
  initializeStreetJobs(state, [index.default]);
  const shut = new Set(closedStreets(state, jobs, { exemptFrom: [index.default] }));
  const reach = reachableStreets(streetGraph(graph, { closed: shut }), { free, starts: [index.default, ...state.grandfathered] });
  const sold = new Set([...readFileSync(join(PUB, 'js', 'store-catalog.js'), 'utf8').matchAll(/"classTsid": "([a-z0-9_]+)"/g)].map((m) => m[1]));
  return { items, recipes, index, idx, reach, sold };
}

const GIANTS = new Set(['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'ti', 'zille']);

/** Does GSJS give this class this verb (items/<class>.js verbs.<verb>)? */
function gsjsVerb(cls, verb) {
  try {
    const src = readFileSync(join(GSJS, 'items', `${cls}.js`), 'utf8');
    return new RegExp(`^verbs\\.${verb.replace(/[^a-z0-9_]/gi, '')}\\s*=`, 'm').test(src);
  } catch {
    return null; // no such file: an NPC the remake draws on its own, or not GSJS
  }
}

/** An item the remake has and a player can get (the Item Catalog's status and `get`). */
function itemProblem(world, cls, { online = false } = {}) {
  const row = world.items.get(cls);
  // The Item Catalog leaves out a few classes a vendor still sells (test_tube reads as a test id there).
  if (!row && world.sold.has(cls)) return null;
  if (!row) return `no item "${cls}" in the Item Catalog and no vendor sells it`;
  const ok = row.status === 'source' || (online && row.status === 'multiplayer');
  if (!ok) return `item "${cls}" is ${row.status} in the remake`;
  if (!(row.get || []).length && !(row.sold || []).length) return `item "${cls}" has no way to get it (Item Catalog get is empty)`;
  return null;
}

/* ------------------------------------------------------------------ */
/* Per requirement                                                       */
/* ------------------------------------------------------------------ */

const PLACEHOLDER = /\b(Toggle flag|Increment counter|TODO|FIXME|lorem)\b|^blah\b|\{[a-z_]+\}/i;
const RAW_ID = /\b[a-z0-9]+_[a-z0-9]+(?:_[a-z0-9]+)*\b/;

/** The concrete events (with their route) that can feed a counter or flag requirement. */
function feedEvents(req) {
  const out = [];
  for (const { route, vars } of routesForCounter(req.name)) {
    const event = String(route.event).replace(/\{([ab])\}/g, (_, k) => vars[k] ?? `{${k}}`);
    out.push({ route, event });
  }
  return out;
}

function checkEventPlace(event, world) {
  let m = event.match(/^street_entered:([a-z0-9_]+)$/);
  if (m && !(world.idx.bySlug.get(m[1]) || []).length) return `no street is named "${m[1]}" (street_entered slugs a street's label)`;
  m = event.match(/^(?:shrines_donated|favor_offered|favor_earned|favor_daily|shrine_item_donated):([a-z]+)/);
  if (m && !m[1].startsWith('{') && !GIANTS.has(m[1])) return `no Giant "${m[1]}"`;
  return null;
}

function auditRequirement(def, req, world, emitters, scope) {
  const out = [];
  const add = (check, what) => out.push({ quest: def.classTsid, req: req.id || req.name, check, what });
  const desc = String(req.desc || '').trim();
  if (!desc || PLACEHOLDER.test(desc) || RAW_ID.test(desc)) add('e', `step reads "${desc}"`);

  if (req.type === 'item') {
    const p = itemProblem(world, req.classId, { online: scope === 'online' });
    if (p) add('c', p);
    return out;
  }
  if (req.type === 'currants') return out;
  if (req.type === 'work') {
    add('a', `a job's work step (work:${req.classId}): nothing outside street projects feeds it`);
    return out;
  }
  if (req.type === 'make') {
    const recipe = world.recipes[req.recipeKey];
    if (!recipe) add('c', `recipe "${req.recipeKey || req.recipeId}" is not in recipes.json`);
    else {
      const tool = itemProblem(world, recipe.tool);
      if (tool) add('c', `its tool: ${tool}`);
      if (recipe.skill && !getSkillCatalog()[recipe.skill]) add('c', `its skill "${recipe.skill}" is not in skills.json`);
    }
    if (!emitterOf(`making_recipe:${req.recipeKey}`, emitters)) add('a', `nothing sends making_recipe:${req.recipeKey}`);
    return out;
  }

  // counter / flag
  const route = requirementRoute(req);
  if (route?.system === 'quest-instances') {
    const room = QUEST_ROOMS[def.classTsid];
    const files = [`js/features/quest-instances-feature.js`, room && `js/quest-rooms/${room.replace(/_/g, '-')}.js`].filter(Boolean);
    const esc = String(req.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const seen = emitters.words.some((w) => files.includes(w.file) && new RegExp(`['"\`]${esc}['"\`]`).test(w.text));
    if (!seen) add('a', `room flag "${req.name}" is set by neither its room (${files.join(', ')})`);
    return out;
  }
  const feeder = FEEDERS[`${def.classTsid} ${req.name}`] || FEEDERS[`* ${req.name}`];
  const feeds = feedEvents(req);
  let fed = null;
  for (const { route: r, event } of feeds) {
    const place = checkEventPlace(event, world);
    if (place) {
      add('c', `${event}: ${place}`);
      continue;
    }
    if (r.whileQuests && !r.whileQuests.includes(def.classTsid)) {
      add('c', `${req.name} counts only while ${r.whileQuests.join(' or ')} is under way (a route's whileQuests)`);
    }
    let who;
    if (/\{[ab]\}/.test(event)) {
      const prefix = event.slice(0, event.indexOf('{'));
      who = prefix ? emitterOfPrefix(prefix, emitters) : emitterOf(event.replace(/\{a\}/, 'x'), emitters);
    } else {
      who = emitterOf(event, emitters);
    }
    if (who?.kind === 'generic' && r.counter === 'VERB:{a}:{b}') {
      // `${class}:${verb}`: the class must have that verb.
      const [cls, verb] = event.split(':');
      if (!cls.includes('{') && gsjsVerb(cls, verb) === false) {
        add('c', `${event}: GSJS gives ${cls} no "${verb}" verb`);
        who = null;
      }
    }
    if (who) fed = fed || { event, ...who };
  }
  if (!fed) {
    const w = directWriter(req.name, emitters);
    if (w) fed = { event: req.name, ...w };
  }
  if (!fed && feeder) {
    const w = emitters.words.find((x) => x.file === feeder.file);
    if (w && feeder.proof.test(w.text)) fed = { event: req.name, kind: 'feeder', where: feeder.file };
    else add('a', `FEEDERS row for ${req.name} no longer proved in ${feeder.file}`);
  }
  if (fed) world.fedBy.push({ quest: def.classTsid, req: req.id || req.name, name: req.name, scope, ...fed });
  if (!fed) add('a', `nothing sends ${feeds.length ? feeds.map((f) => f.event).join(' or ') : req.name}`);
  else if (scope !== 'online' && SOLO_ONLY_FEEDERS[fed.where]) add('g', `fed only in solo (${fed.where})`);

  // b: words and numbers.
  if (req.type === 'flag') {
    const n = desc.replace(/\b[A-Z]+-\d+\b/g, '').match(/\b(\d+)\b/g)?.map(Number).filter((x) => x > 1) || [];
    if (n.length) add('b', `a 0/1 flag whose step asks for ${n.join(', ')} ("${desc}")`);
    if (feeds.some(({ route: r }) => r.threshold)) add('b', `a flag set by a hidden sum (threshold route)`);
  } else if (Number(req.num) <= 1) {
    const n = desc.match(/\b(\d+)\b/g)?.map(Number).filter((x) => x > 1) || [];
    if (n.length) add('b', `counts to 1 but its step asks for ${n.join(', ')} ("${desc}")`);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Per quest                                                             */
/* ------------------------------------------------------------------ */

function auditText(def) {
  const out = [];
  for (const field of ['title', 'desc', 'offer', 'completion']) {
    const text = cleanQuestMarkup(String(def[field] || ''));
    if (field === 'title' && !text) out.push({ quest: def.classTsid, req: '', check: 'e', what: 'no title' });
    if (PLACEHOLDER.test(text.replace(/\{pc_label\}/g, ''))) out.push({ quest: def.classTsid, req: '', check: 'e', what: `${field} has a placeholder: "${text.slice(0, 80)}"` });
    const raw = text.match(/\b[a-z]+_[a-z0-9_]+\b/);
    if (raw) out.push({ quest: def.classTsid, req: '', check: 'e', what: `${field} shows a raw id "${raw[0]}"` });
  }
  return out;
}

function auditRewards(def, world) {
  const out = [];
  for (const row of Object.values(def.rewards?.items || {})) {
    const cls = row?.class_tsid || row?.classTsid;
    if (cls && !world.items.get(cls)) out.push({ quest: def.classTsid, req: '', check: 'd', what: `reward item "${cls}" is not in the Item Catalog` });
  }
  for (const row of Object.values(def.rewards?.recipes || {})) {
    const id = String(row?.recipe_id ?? row?.class_tsid ?? '');
    if (id && !world.recipes[id] && !Object.values(world.recipes).some((r) => r.id === id || r.outputs?.some((o) => o.classTsid === id))) {
      out.push({ quest: def.classTsid, req: '', check: 'd', what: `reward recipe "${id}" is not in recipes.json` });
    }
  }
  return out;
}

/** Every prereq quest of a quest, deep. */
function prereqsOf(id, cat, seen = new Set()) {
  for (const pre of cat[id]?.prereqQuests || []) {
    if (seen.has(pre)) continue;
    seen.add(pre);
    prereqsOf(pre, cat, seen);
  }
  for (const p of cat[id]?.prerequisites || []) {
    if (p.condition === 'completed_quest' && !p.not && !seen.has(p.value)) {
      seen.add(p.value);
      prereqsOf(p.value, cat, seen);
    }
  }
  for (const t of cat[id]?.offerTriggers || []) {
    for (const q of [t.type === 'quest' ? t.quest : null, ...(t.quests || [])].filter(Boolean)) {
      if (!seen.has(q)) {
        seen.add(q);
        prereqsOf(q, cat, seen);
      }
    }
  }
  return seen;
}

/**
 * The context the game itself gives the offer engine (features/quest-offers-feature.js
 * questContext): every gate a quest's chain needs is open (all skills, badges, level 60), and it
 * stands where the trigger asks, as the game says where it stands: `hub` is the street's hubId and
 * `street` its label. Nothing in it says `events` or `region`: an offer that waits on those must be
 * made by its own feature (OFFERED_BY).
 */
function gameCtx(def, world) {
  const skills = Object.keys(getSkillCatalog());
  const ctx = {
    level: 60,
    xp: 10_000_000,
    skills,
    achievements: Object.keys(getAchievementCatalog()),
    inv: {},
    buffs: [],
    emblemsMax: 99, // the game's own count of one Giant's Emblems (shrineState.emblems)
    now: 10,
    customPrereq: () => true,
  };
  for (const p of def.prerequisites || []) if (p.condition === 'has_item' && !p.not) ctx.inv[p.value] = 1;
  for (const t of def.offerTriggers || []) {
    const where = t.street
      ? Object.entries(world.index.streets).find(([tsid, row]) => row.label === t.street || tsid === t.street)
      : t.region
        ? Object.entries(world.index.streets).find(([, row]) => String(row.hubName).toLowerCase() === String(t.region).toLowerCase())
        : null;
    if (where) {
      ctx.hub = where[1].hubId;
      ctx.street = where[1].label;
      ctx.streetTsid = where[0];
    }
  }
  return ctx;
}

/**
 * Quests the familiar's engine does not offer by itself (an event, a place it cannot see, a start
 * the game makes): the feature that offers or starts each, proved by a pattern in its file.
 */
export const OFFERED_BY = Object.freeze({
  buy_bag: { file: 'js/quest-offers.js', proof: /export const FIRST_SKILL_QUEST_ID = 'buy_bag';/, how: 'started with the first skill (claimFirstSkillQuest)' },
  hell_hole: { file: 'js/hell.js', proof: /hell_hole: Object\.freeze\(\{/, how: 'offered on dying into Hell (hell.js)' },
  hell_quest: { file: 'js/hell.js', proof: /onCompleteOffers: 'hell_quest'/, how: 'offered when It\'s Better in a Hell Hole is done (hell.js)' },
  stale_but_necessary: { file: 'js/features/bureaucratic-halls-feature.js', proof: /const CUP_QUEST_ID = 'stale_but_necessary';/, how: 'a Cup of Water drunk (cup_of_water.js 171)' },
  donate_to_all_shrines: { file: 'js/features/quest-offers-feature.js', proof: /if \(offerOnShrineDonation\(engine\.questState, counter\)\)/, how: 'a first shrine donation (include/shrines.js 573-592)' },
  baqala_nostalgia: { file: 'js/ancestral-nostalgia.js', proof: /export const NOSTALGIA_QUEST = 'baqala_nostalgia';/, how: 'Ancestral Nostalgia in Baqala' },
});

/** f: with its chain done, is the quest offered by the familiar or one of its givers? */
function auditOffer(def, cat, offeredSet, world, emitters) {
  const out = [];
  const add = (what) => out.push({ quest: def.classTsid, req: '', check: 'f', what });
  for (const pre of def.prereqQuests || []) if (!offeredSet.has(pre)) add(`prereq quest "${pre}" is never offered, so this never is`);
  for (const t of def.offerTriggers || []) {
    if (t.type === 'skill' && !getSkillCatalog()[t.skill]) add(`trigger skill "${t.skill}" is not in skills.json`);
    if (t.type === 'achievement' && !getAchievementCatalog()[t.achievement]) add(`trigger badge "${t.achievement}" is not in achievements.json`);
  }
  if (def.custom) return out;
  const by = OFFERED_BY[def.classTsid];
  if (by) {
    const w = emitters.words.find((x) => x.file === by.file);
    if (!w || !by.proof.test(w.text)) add(`OFFERED_BY row no longer proved in ${by.file}`);
    return out;
  }
  const qs = createQuestState();
  for (const q of prereqsOf(def.classTsid, cat)) qs.completed.push(q);
  const ctx = gameCtx(def, world);
  const pc = { level: 60, xp: ctx.xp };
  const familiar = pendingQuestOffers(qs, pc, ctx).some((r) => r.classTsid === def.classTsid);
  const npcs = new Set((def.offerTriggers || []).filter((t) => t.npc).map((t) => t.npc));
  const byNpc = [...npcs].some((npc) => npcQuestOffers(qs, npc, pc, ctx).offered.some((c) => c.classTsid === def.classTsid));
  if (!familiar && !byNpc) out.never = true, add(`with its chain done (${[...prereqsOf(def.classTsid, cat)].join(', ') || 'none'}) neither the Magic Rock nor a giver offers it (triggers ${JSON.stringify((def.offerTriggers || []).map((t) => t.type + (t.region ? ':' + t.region : t.event ? ':' + t.event : '')))})`);
  return out;
}

/** The labels a distinct or templated route needs, n of them. */
function labelsFor(route, n) {
  if (Array.isArray(route.a) && route.a.length) return route.a.slice(0, n);
  if (/shrines_donated|favor_/.test(route.event)) return [...GIANTS].slice(0, n);
  return Array.from({ length: n }, (_, i) => `x${i + 1}`);
}

/**
 * d and b: accept, feed each step as its route says, and see the row move with the first unit and
 * the quest turn in with its rewards. Returns findings (b: a counter that stands still on its first
 * unit; d: never completable, or the turn-in failed).
 */
function auditRun(def, cat) {
  const out = [];
  const add = (check, what, req = '') => out.push({ quest: def.classTsid, req, check, what });
  const qs = createQuestState();
  for (const q of prereqsOf(def.classTsid, cat)) qs.completed.push(q);
  const inv = {};
  const pc = { xp: 0, imagination: 0, currants: 0, energy: 0, mood: 0, giantFavor: {} };
  const accepted = acceptOffer(qs, def.classTsid, { inv, now: 1, level: 60 });
  if (!accepted.ok) return [{ quest: def.classTsid, req: '', check: 'd', what: `accept fails (${accepted.reason})` }];
  let completable = [...(accepted.completable || [])].map((r) => r.classTsid || r);
  const rowOf = (name) => listQuestLog(qs).find((r) => r.def.classTsid === def.classTsid)?.requirements.find((r) => r.name === name);
  const fire = (event, amount, ctx = {}) => {
    const res = routeQuestEvent(qs, event, amount, { inv, ...ctx });
    completable.push(...res.completable.map((r) => r.classTsid));
  };
  for (const req of def.requirements || []) {
    const num = Math.max(1, Number(req.num) || 1);
    if (req.type === 'item') {
      inv[req.classId] = num;
      completable.push(...syncItemRequirements(qs, inv, {}).completable.map((r) => r.classTsid));
      continue;
    }
    if (req.type === 'currants') {
      pc.currants = num;
      completable.push(...syncItemRequirements(qs, inv, { pc }).completable.map((r) => r.classTsid));
      continue;
    }
    if (req.type === 'make') {
      fire(`making_recipe:${req.recipeKey || req.outputClass}`, 1);
      if (num > 1 && !(Number(rowOf(req.name)?.current) > 0)) add('b', 'one make does not move the row', req.id);
      fire(`making_recipe:${req.recipeKey || req.outputClass}`, num - 1);
      continue;
    }
    if (req.type !== 'counter' && req.type !== 'flag') continue;
    const feeds = feedEvents(req);
    if (!feeds.length) {
      // Fed by name (rooms, custom code): set as their code does.
      fire(req.name, req.type === 'flag' ? 1 : num);
      continue;
    }
    const { route, event } = feeds[0];
    const ctx = { streetTsid: route.afterStreets?.[0] || '' };
    if (route.after) fire(String(route.after).replace(/\{[ab]\}/g, 'x1'), 1, ctx);
    const per = route.minAmount || route.threshold || 1;
    const steps = req.type === 'flag' ? 1 : num;
    const many = route.distinct || route.threshold || route.perEvent || /\{[ab]\}/.test(event);
    const labels = many ? labelsFor(route, steps) : null;
    for (let i = 0; i < (many ? steps : 1); i++) {
      const ev = event.replace(/\{[ab]\}/g, labels ? labels[i] : 'x1');
      const detail = route.distinct === 'animal' ? { animal: `a${i + 1}` } : undefined;
      if (i === 0 && req.type === 'counter' && num > 1) {
        // The first unit of work: one event of the least amount the game sends.
        fire(ev, 1, { ...ctx, detail });
        if (!(Number(rowOf(req.name)?.current) > 0)) add('b', `the first ${event} does not move the row (${rowOf(req.name)?.current ?? 0}/${num})`, req.id);
        if (!many) {
          fire(ev, num - 1, { ...ctx, detail });
          break;
        }
        if (route.threshold) fire(ev, per - 1, { ...ctx, detail });
        continue;
      }
      fire(ev, many ? per : (req.type === 'flag' ? per : num), { ...ctx, detail });
    }
  }
  const rows = listQuestLog(qs).find((r) => r.def.classTsid === def.classTsid)?.requirements || [];
  const short = rows.filter((r) => (r.type === 'flag' ? !(Number(r.current) > 0) : Number(r.current) < Number(r.num)));
  for (const r of short) add('d', `fed as its route says, the row stands at ${r.current}/${r.num}`, r.id);
  if (!short.length && !completable.includes(def.classTsid)) add('d', 'every row done, yet it never became completable');
  if (!short.length) {
    const done = turnInQuest(qs, def.classTsid, pc, { inv });
    if (!done.ok) add('d', `turn-in fails (${done.reason})`);
    else if (Number(def.rewards?.xp) > 0 && !(pc.xp > 0)) add('d', 'turned in, but paid no iMG');
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The sweep                                                             */
/* ------------------------------------------------------------------ */

/** NPC givers whose feature offers only some of the quests naming them (read from each feature). */
export const GIVER_OFFERS = Object.freeze({
  // street-spirits-feature.js offers only the seasonal memories' repeats (spirit-reminisce.js
  // SPIRIT_REPEAT_QUESTS, AUTUMN_REPEAT); the spirits' part 1s are the seasonal days' own.
  street_spirit_groddle: { file: 'js/features/street-spirits-feature.js', offers: ['an_autumn_day_part2', 'blue_and_white_part2', 'winter_walk_part2'] },
});

export async function auditQuests({ root = ROOT } = {}) {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(root, 'public', 'assets', 'content'));
  setQuestHeldCheck(null);
  const cat = getQuestCatalog();
  const world = { ...loadWorld(), fedBy: [] };
  const emitters = readEmitters(root);
  const c = classifyQuests(cat);
  const scopes = new Map();
  for (const r of c.solo) scopes.set(r.classTsid, 'solo');
  for (const r of c.custom) scopes.set(r.classTsid, 'custom');
  for (const id of Object.keys(MULTIPLAYER_QUESTS)) if (cat[id] && !scopes.has(id)) scopes.set(id, 'online');

  // Held back: a street no open road reaches yet (offered once a road opens), and quests whose
  // only giver never hands them out.
  const heldBack = {};
  for (const id of scopes.keys()) {
    const hold = questHold(cat[id], world.reach, world.idx);
    if (hold) heldBack[id] = `waits for a road to ${hold.place} (js/quest-reach.js)`;
  }
  const neverOffered = {};
  for (const r of c.solo) {
    if (r.familiar) continue;
    const live = r.npcs.filter((npc) => {
      const giver = GIVER_OFFERS[npc] || (npc.startsWith('street_spirit') ? GIVER_OFFERS.street_spirit_groddle : null);
      return giver ? giver.offers.includes(r.classTsid) : REMAKE_QUEST_NPCS.some((have) => have === npc || (npc.startsWith('street_spirit') && have.startsWith('street_spirit')));
    });
    if (!live.length) neverOffered[r.classTsid] = `only ${r.npcs.join(', ')} would give it, and no giver in the remake hands it out`;
  }

  const offeredSet = new Set([...scopes.keys()].filter((id) => !neverOffered[id]));
  const findings = [];
  for (const [id, scope] of scopes) {
    if (heldBack[id] || neverOffered[id]) continue;
    const def = cat[id];
    findings.push(...auditText(def));
    findings.push(...auditRewards(def, world));
    for (const req of def.requirements || []) findings.push(...auditRequirement(def, req, world, emitters, scope));
    if (scope === 'solo') {
      const offer = auditOffer(def, cat, offeredSet, world, emitters);
      if (offer.never) {
        // Nobody can hold it: listed with the never-offered, its steps still checked below.
        neverOffered[id] = offer.find((f) => /neither the Magic Rock/.test(f.what)).what;
        findings.push(...offer.filter((f) => !/neither the Magic Rock/.test(f.what)));
      } else findings.push(...offer);
    }
    if (scope === 'solo') findings.push(...auditRun(def, cat));
  }
  return {
    checked: [...scopes.keys()].filter((id) => !heldBack[id]).sort(),
    scopes: Object.fromEntries(scopes),
    heldBack,
    neverOffered,
    notOffered: Object.fromEntries(c.excluded.filter((r) => !scopes.has(r.classTsid)).map((r) => [r.classTsid, r.reason])),
    total: Object.keys(cat).length,
    fedBy: world.fedBy,
    findings,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await auditQuests();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.total} quests in the catalog; ${result.checked.length} offered or given and checked; ${Object.keys(result.heldBack).length} held back; ${Object.keys(result.neverOffered).length} never handed out; ${Object.keys(result.notOffered).length} not offered (jobs, removed, other players).`);
    for (const [id, why] of Object.entries(result.heldBack)) console.log(`  held back  ${id}: ${why}`);
    for (const [id, why] of Object.entries(result.neverOffered)) console.log(`  never      ${id}: ${why}`);
    for (const f of result.findings) console.log(`${f.check}  ${f.quest}${f.req ? ` ${f.req}` : ''}: ${f.what}`);
  }
}
