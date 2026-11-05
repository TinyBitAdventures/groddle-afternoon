/**
 * The encyclopedia's data: every entry of every section (quests, animals,
 * people, skills, places, achievements) and the items they touch, read from
 * the game data at build time, with one cross-reference index so each link has
 * its way back. tools/encyclopedia/build.mjs draws the pages from it, and
 * tools/catalog/build.mjs reads the same index for the item pages.
 * Spec: docs/encyclopedia.md.
 *
 * Sources (read only):
 *  - research/coverage/inventory.sqlite: which entries exist and their status
 *    (kinds quest, npc, skill, location, achievement, item; 'excluded' is left out).
 *  - assets/content/quests.json, skills.json (+ js/better-learning.js), achievements.json.
 *  - glitch-GameServerJS items/npc_*.js and the item classes of people (Street
 *    Spirit, Hell's Bartender, Magic Rock, Butler): name, description, verbs,
 *    the item classes the file creates (createItem*('x')) and the skills it
 *    checks (skills_has('x')). Text only; nothing is evaluated.
 *  - assets/maps/hubs/hub-<id>.json (the 2012 hub maps: streets, store, shrine),
 *    assets/streets/index.json and assets/content/street-ecology.json.
 *  - js/vendor.js stores, js/foxes.js Fox Ranger store, js/bureaucracy.js.
 *  - for the blank stubs left out (isBlankStub): assets/content/recipes.json,
 *    buffs.json, js/drop-tables-data.js, js/resource-nodes.js, js/patches.js,
 *    js/artifacts.js and tools/job-obtainable.mjs supplyConversions.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { GSJS, INVENTORY_DB, readGsjsItem } from '../catalog/build.mjs';
import { readSkills } from '../inventory/gsjs-data.mjs';
import { supplyConversions } from '../job-obtainable.mjs';
import { inRemake, plainText } from './parts.mjs';
import { addSounds } from './sounds.mjs';
import { MORE_SECTIONS, addMoreSections } from './sections.mjs';
import { addStreets, streetsSection } from './streets.mjs';
import { addStores, storesSection } from './stores.mjs';

const root = join(import.meta.dirname, '..', '..');
export const PUB = join(root, 'public');
const content = (name) => JSON.parse(readFileSync(join(PUB, 'assets', 'content', name), 'utf8'));
const js = (name) => join(PUB, 'js', name);

/** The sections built so far (docs/encyclopedia.md "Order of work"). */
export const BUILT_SECTIONS = ['quests', 'animals', 'people', 'skills', 'places', 'achievements', 'sounds', 'streets', 'stores', ...MORE_SECTIONS.map((s) => s.key)];

const ALL_SECTIONS = [
  { key: 'quests', label: 'Quests', one: 'quest', blurb: 'How to get each quest, every step, what it needs and what it gives.' },
  { key: 'animals', label: 'Animals and creatures', one: 'creature', blurb: 'Where they live, what you can do with them and what they give.' },
  { key: 'people', label: 'People', one: 'person', blurb: 'Vendors and what they sell, the Giants’ shrines and everyone else you meet.' },
  { key: 'skills', label: 'Skills', one: 'skill', blurb: 'What each skill needs, how long it takes and what it opens.' },
  { key: 'places', label: 'Places', one: 'region', blurb: 'Every region on the map, its streets and what lives on them.' },
  { key: 'achievements', label: 'Achievements', one: 'achievement', blurb: 'Every badge, what earns it and what it rewards.' },
  { key: 'sounds', label: 'Music and sounds', one: 'sound', blurb: 'Every tune and sound of the original, what the remake plays for it, and what is still missing.' },
  streetsSection,
  storesSection,
  // Imagination upgrades, recipes, buffs, feats and street projects, Giants (tools/encyclopedia/sections.mjs).
  ...MORE_SECTIONS.map(({ key, label, one, noun, blurb, groupWord, sample, css, cardCount, scoreMore }) => ({ key, label, one, noun, blurb, groupWord, sample, css, cardCount, scoreMore })),
];
export const SECTIONS = ALL_SECTIONS.filter((s) => BUILT_SECTIONS.includes(s.key));

export const GIANTS = {
  alph: 'Alph', cosma: 'Cosma', friendly: 'Friendly', grendaline: 'Grendaline', humbaba: 'Humbaba', lem: 'Lem',
  mab: 'Mab', pot: 'Pot', spriggan: 'Spriggan', ti: 'Tii', zille: 'Zille',
};
export const giantIcon = (g) => `assets/sprites/giant-icons/icon_${g === 'ti' ? 'tii' : g}.png`;

/* -- Pictures -------------------------------------------- */

function imageSize(path) {
  const b = readFileSync(path);
  if (b.toString('ascii', 12, 16) === 'IHDR') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.toString('ascii', 0, 4) === 'RIFF') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc2) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

const sizeCache = new Map();
/** A picture under public/: { src, w, h, hi? } or null when the file is missing. */
export function picture(src, caption = '') {
  const abs = join(PUB, src);
  if (!sizeCache.has(src)) sizeCache.set(src, existsSync(abs) ? imageSize(abs) : null);
  const size = sizeCache.get(src);
  if (!size) return null;
  const hiSrc = src.replace(/\.png$/, '@3x.png');
  const hi = hiSrc !== src && existsSync(join(PUB, hiSrc)) ? hiSrc : null;
  return { src, w: size.w, h: size.h, hi, caption };
}
export const itemIcon = (id) => picture(`assets/sprites/icons/${id}.png`);

/** Creatures and people with no pack icon of their own: a single still of Tiny Speck's, or their Cubimal. */
const STILLS = { npc_butterfly: 'assets/sprites/butterfly_rest_single.png', npc_salmon: 'assets/sprites/icons/salmon.png' };
const CUBIMAL_OF = {
  npc_chicken: 'chick', npc_squid: 'squid', npc_juju_bandit: 'juju', npc_juju_grandma: 'juju', npc_gwendolyn: 'gwendolyn',
  npc_jabba1: 'unclefriendly', npc_jabba2: 'helga', npc_maintenance_bot: 'maintenancebot', npc_widget: 'greeterbot',
  npc_quest_widget: 'greeterbot', npc_quest_giver_widget: 'greeterbot', npc_myopic_frog: 'frog', npc_yoga_frog: 'frog',
  npc_piggy_explorer: 'ilmenskiejones', npc_fox_ranger: 'foxranger', npc_gardening_vendor: 'gardeningtoolsvendor',
  npc_cooking_vendor: 'mealvendor', npc_tool_vendor: 'toolvendor', npc_sno_cone_vending_machine: 'snoconevendor',
  npc_newxp_dustbunny: 'dustbunny', npc_dustbunny: 'dustbunny', npc_bureaucrat: 'bureaucrat', npc_piggy: 'piggy',
  npc_sloth: 'sloth', npc_firefly: 'firefly', npc_crab: 'crab', npc_garden_gnome: 'gnome',
};
export function portrait(id) {
  const own = itemIcon(id);
  if (own) return own;
  if (STILLS[id]) { const p = picture(STILLS[id]); if (p) return p; }
  const shrine = /^npc_shrine_(?:(?:firebog|ix|uralia)_)?([a-z]+)$/.exec(id);
  if (shrine && GIANTS[shrine[1]]) return picture(giantIcon(shrine[1]), 'The Giant’s icon');
  if (CUBIMAL_OF[id]) return picture(`assets/sprites/icons/npc_cubimal_${CUBIMAL_OF[id]}.png`, 'Shown as its Cubimal');
  return null;
}

/* -- Inventory ------------------------------------------- */

export function readInventoryAll(path = INVENTORY_DB) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const out = {};
    for (const r of db.prepare('SELECT kind, id, name, source_ref, status, register, evidence FROM entities').all()) {
      (out[r.kind] ||= new Map()).set(r.id, { name: r.name, ref: r.source_ref || '', status: r.status, register: r.register || '', evidence: r.evidence || '' });
    }
    return out;
  } finally {
    db.close();
  }
}

/* -- GSJS creature files ---------------------------------- */

/** Verbs a player could use (no admin, debug or cubimal-likeness verbs). */
const HIDDEN_VERBS = new Set(['debug', 'rook_attack', 'unrook', 'test', 'give_cubimal']);
function readCreature(id) {
  const it = readGsjsItem(id);
  const text = readFileSync(join(GSJS, 'items', `${id}.js`), 'utf8');
  const makes = [...new Set([...text.matchAll(/createItem[A-Za-z]*\(\s*['"]([a-z0-9_]+)['"]/g)].map((m) => m[1]))];
  const skills = [...new Set([...text.matchAll(/skills_has\(\s*['"]([a-z0-9_]+)['"]/g)].map((m) => m[1]))];
  const verbs = it.verbs.filter((v) => !HIDDEN_VERBS.has(v.id) && !/^ADMIN/.test(v.tooltip) && /[ A-Z]|^[a-z]+$/.test(v.name))
    .filter((v, i, a) => a.findIndex((o) => o.name === v.name) === i);
  return { ...it, verbs, makes, skills };
}

/* -- Sections ---------------------------------------------- */

/** Animals and creatures (npc classes), in our grouping. Everything else that is an npc is a person or a Cubimal. */
const ANIMAL_GROUPS = [
  ['Animals', ['npc_piggy', 'npc_chicken', 'npc_butterfly', 'npc_batterfly', 'npc_kitty_chicken', 'npc_kitty', 'npc_fox', 'npc_salmon', 'npc_sloth', 'npc_firefly', 'npc_crab', 'npc_flamingo']],
  ['Creatures', ['npc_squid', 'npc_swoonerfly', 'npc_dustbunny', 'npc_cactus', 'npc_juju_bandit', 'npc_juju_black', 'npc_deimaginator', 'npc_catch_me_ghost', 'npc_blimp']],
];
const ANIMAL_GROUP = new Map(ANIMAL_GROUPS.flatMap(([g, ids]) => ids.map((id) => [id, g])));

/** Item classes that are people you meet (they also keep their item page). */
const ITEM_PEOPLE = ['street_spirit', 'hell_bartender', 'magic_rock', 'bag_butler'];
const STREET_SPIRITS = ['street_spirit', 'street_spirit_firebog', 'street_spirit_groddle', 'street_spirit_ix', 'street_spirit_zutto'];

/** Stores that belong to a person (the rest are kept by Street Spirits). */
const STORE_KEEPER = {
  emporium: 'npc_jabba1', liquor: 'npc_jabba2', meals: 'npc_cooking_vendor', tools: 'npc_tool_vendor',
  gardening_tools: 'npc_gardening_vendor', sno_cone: 'npc_sno_cone_vending_machine',
};

function peopleGroup(id) {
  if (id.startsWith('vendor-') || STREET_SPIRITS.includes(id) || Object.values(STORE_KEEPER).includes(id) || /vendor|fox_ranger|bureaucrat|smuggler|bartender/.test(id)) return 'Vendors and stores';
  if (id.startsWith('npc_shrine_')) return 'Giants’ shrines';
  return 'Everyone else';
}

const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function loadEncyclopedia({ inventory = readInventoryAll() } = {}) {
  const live = (kind) => [...(inventory[kind] || new Map())].filter(([, r]) => r.status !== 'excluded');
  const entries = new Map(); // `${section}:${id}` -> entry
  const add = (section, id, e) => { if (!BUILT_SECTIONS.includes(section)) return null; const key = `${section}:${id}`; entries.set(key, { key, section, id, refs: [], ...e }); return entries.get(key); };

  /* Items: every catalog item, for names, icons and links. */
  const items = new Map();
  for (const [id, r] of live('item')) {
    if (!existsSync(join(GSJS, 'items', `${id}.js`))) continue;
    const text = readFileSync(join(GSJS, 'items', `${id}.js`), 'utf8');
    const name = /^var name_single\s*=\s*"((?:[^"\\]|\\.)*)"/m.exec(text)?.[1] || id;
    const plural = /^var name_plural\s*=\s*"((?:[^"\\]|\\.)*)"/m.exec(text)?.[1] || '';
    items.set(id, { id, name: JSON.parse(`"${name}"`), plural: plural ? JSON.parse(`"${plural}"`) : '', status: r.status, icon: itemIcon(id) });
  }

  const quests = content('quests.json');
  const { withBetterLearning } = await import(js('better-learning.js'));
  const skills = withBetterLearning(content('skills.json'));
  const achievements = content('achievements.json');
  const ecology = content('street-ecology.json').streets;
  const streetIndex = JSON.parse(readFileSync(join(PUB, 'assets', 'streets', 'index.json'), 'utf8')).streets;
  const recipes = content('recipes.json');
  const vendor = await import(js('vendor.js'));
  const foxes = await import(js('foxes.js'));
  const bureaucracy = await import(js('bureaucracy.js'));

  /* Quests (inventory kind quest; street projects are a kind of their own). */
  for (const [id, r] of live('quest')) {
    const q = quests[id];
    if (!q) continue;
    add('quests', id, { name: String(q.title).trim(), status: r.status, register: r.register, quest: q, icon: picture('assets/ui/quest-book.png'), group: questGroup(id, q) });
  }

  /* Skills. */
  const gsjsSkills = new Map(readSkills(GSJS).map((s) => [s.id, s]));
  for (const [id, r] of live('skill')) {
    const s = skills[id] || (gsjsSkills.has(id) ? { ...gsjsSkills.get(id), classTsid: id, description: '', learned: '', pointCost: 0, postSkills: [], giants: {} } : null);
    if (!s) continue;
    const primary = Object.entries(s.giants || {}).find(([, g]) => g.primary)?.[0];
    add('skills', id, { name: skillName(s, skills), status: r.status, register: r.register, skill: s, icon: primary ? picture(giantIcon(primary)) : null, group: SKILL_CATEGORIES[s.categoryId] || 'Other' });
  }

  /* Achievements. */
  for (const [id, r] of live('achievement')) {
    const a = achievements[id];
    if (!a) continue;
    add('achievements', id, { name: a.name, status: r.status, register: r.register, ach: a, icon: picture(`assets/badges/${id}.png`), group: a.category ? a.category[0].toUpperCase() + a.category.slice(1) : 'Other' });
  }

  /* Animals, Cubimals and people (inventory kind npc), plus the item-class people and the stores. */
  const npcs = live('npc');
  const npcStatus = new Map(npcs);
  for (const [id, r] of npcs) {
    if (!existsSync(join(GSJS, 'items', `${id}.js`))) continue;
    if (/^npc_shrine_(firebog|ix|uralia)_/.test(id)) continue; // variants: folded into the shrine
    if (/^npc_letterblock_/.test(id)) continue; // letters of the one Letter Block
    const c = readCreature(id);
    const base = { name: c.name, status: r.status, register: r.register, creature: c, icon: portrait(id) };
    if (id.startsWith('npc_cubimal_')) add('animals', id, { ...base, group: 'Cubimals' });
    else if (ANIMAL_GROUP.has(id)) add('animals', id, { ...base, group: ANIMAL_GROUP.get(id) });
    else add('people', id, { ...base, group: peopleGroup(id) });
  }
  const itemInv = inventory.item || new Map();
  for (const id of ITEM_PEOPLE) {
    const r = itemInv.get(id);
    if (!r || r.status === 'excluded') continue;
    const c = readCreature(id);
    add('people', id, { name: id === 'bag_butler' ? 'Butler' : c.name, status: r.status, register: r.register, creature: c, icon: portrait(id), group: peopleGroup(id), itemPage: items.has(id) ? id : null });
  }
  const shrineVariants = npcs.filter(([id]) => /^npc_shrine_(firebog|ix|uralia)_/.test(id)).map(([id]) => id);
  for (const v of shrineVariants) {
    const g = /_([a-z]+)$/.exec(v)[1].replace(/^tii$/, 'ti');
    const main = entries.get(`people:npc_shrine_${g}`);
    if (main) (main.variants ||= []).push(v);
  }
  const spirit = entries.get('people:street_spirit');
  if (spirit) spirit.variants = STREET_SPIRITS.slice(1).filter((v) => items.has(v));

  // Stores: a person's own, or a Street Spirit store of its own entry.
  const storeOf = (key, label, offers) => ({ key, label, offers: offers.filter((o) => o.classTsid) });
  for (const p of Object.values(vendor.VENDOR_PROFILES)) {
    const store = storeOf(p.key, p.label, p.offers.map((o) => ({ classTsid: o.classTsid, price: o.buyPrice })));
    const keeper = entries.get(`people:${STORE_KEEPER[p.key]}`);
    if (keeper) { keeper.store = store; continue; }
    add('people', `vendor-${p.key}`, {
      name: p.label, status: 'source', register: '', store, desc: p.desc, icon: itemIcon('street_spirit'), iconCaption: 'A Street Spirit keeps this store',
      group: 'Vendors and stores', storeName: p.label.replace(/ Vendor$/, ''),
    });
  }
  const fox = entries.get('people:npc_fox_ranger');
  if (fox) fox.store = storeOf('fox_ranger', foxes.FOX_RANGER_STORE.name, foxes.FOX_RANGER_STORE.items.map((o) => ({ classTsid: o.classTsid, price: o.cost })));
  const clerk = entries.get('people:npc_bureaucrat');
  if (clerk) clerk.store = storeOf('bureaucracy', 'Bureaucratic Hall clerk', Object.entries(bureaucracy.BUREAUCRACY_ITEMS).map(([id, o]) => ({ classTsid: id, price: o.cost })));

  /* Places: the hubs on the 2012 map, with their streets. */
  const locInv = inventory.location || new Map();
  const hubDir = join(PUB, 'assets', 'maps', 'hubs');
  const usedSlugs = new Set();
  for (const file of readdirSync(hubDir).filter((f) => /^hub-\d+\.json$/.test(f))) {
    const hub = JSON.parse(readFileSync(join(hubDir, file), 'utf8'));
    let s = slug(hub.hubName) || `hub-${hub.hubId}`;
    if (usedSlugs.has(s)) s = `${s}-${hub.hubId}`;
    usedSlugs.add(s);
    const streets = (hub.streets || []).map((st) => {
      const g = `G${st.tsid.slice(1)}`;
      const inv = locInv.get(st.tsid);
      const eco = ecology[g]?.counts || {};
      return {
        tsid: st.tsid, name: String(st.name).trim(), status: inv ? inv.status : (streetIndex[g] ? 'source' : 'missing'),
        inRemake: Boolean(streetIndex[g]), store: st.store || '', shrine: st.shrine || '', subway: Boolean(st.has_subway), counts: eco,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
    if (!streets.length) continue;
    const kept = streets.filter((x) => x.status !== 'excluded');
    if (!kept.length) continue;
    const inCount = kept.filter((x) => x.inRemake).length;
    add('places', s, {
      name: hub.hubName, hubId: hub.hubId, status: inCount === kept.length ? 'source' : inCount ? 'partial' : 'missing', register: '',
      streets: kept, color: hub.color || '', icon: hub.thumbLocal ? picture(hub.thumbLocal.replace(/^\//, '')) : null, group: hubGroup(hub.hubName),
    });
  }

  /* Cross references. */
  const has = (key) => entries.has(key);
  const animalOrPerson = (id) => (has(`animals:${id}`) ? `animals:${id}` : has(`people:${id}`) ? `people:${id}` : STREET_SPIRITS.includes(id) && has('people:street_spirit') ? 'people:street_spirit' : null);
  /** Any class id named in the data, as the key of its entry (an item, or a creature or person). */
  const keyOf = (id) => {
    if (!id) return null;
    const ap = animalOrPerson(id);
    if (ap) return ap;
    if (/^npc_shrine_(firebog|ix|uralia)_([a-z]+)$/.test(id)) return `people:npc_shrine_${/_([a-z]+)$/.exec(id)[1].replace(/^tii$/, 'ti')}`;
    if (items.has(id)) return `item:${id}`;
    return null;
  };
  const ref = (from, to, rel, extra = {}) => { if (to && (to.startsWith('item:') || has(to))) from.refs.push({ to, rel, ...extra }); };
  const textLinks = (text) => [...String(text || '').matchAll(/(?:event:|glitch=")item\|([a-z0-9_]+)/g)].map((m) => m[1]);

  for (const e of entries.values()) {
    if (e.section === 'quests') {
      const q = e.quest;
      for (const r of q.requirements) {
        if (r.type === 'item') ref(e, keyOf(r.classId), 'needs', { n: r.num });
        else if (r.type === 'make') { ref(e, keyOf(r.outputClass), 'needs', { n: r.num, make: true }); ref(e, keyOf(r.tool), 'tool'); }
        else if (r.classId) ref(e, keyOf(r.classId), r.type === 'work' ? 'tool' : 'involves');
      }
      for (const it of Object.values(q.rewards.items || {})) ref(e, keyOf(it.class_tsid), 'rewards', { n: it.count || 1 });
      for (const it of q.giveItems || []) ref(e, keyOf(it.classTsid), 'gives', { n: it.count || 1 });
      for (const id of new Set([...textLinks(q.desc), ...textLinks(q.offer)])) ref(e, keyOf(id), 'mentions');
      for (const t of q.offerTriggers) {
        if (t.type === 'skill') ref(e, `skills:${t.skill}`, 'offered-by');
        if (t.type === 'npc') ref(e, keyOf(t.npc), 'giver');
        if (t.type === 'quest') ref(e, `quests:${t.quest}`, 'after');
        if (t.type === 'achievement') ref(e, `achievements:${t.achievement}`, 'after');
        for (const qq of t.quests || []) ref(e, `quests:${qq}`, 'after');
      }
      for (const qq of q.prereqQuests) ref(e, `quests:${qq}`, 'after');
      for (const p of q.prerequisites) {
        if (p.condition === 'has_skill') ref(e, `skills:${p.value}`, 'needs-skill');
        if (p.condition === 'has_achievement') ref(e, `achievements:${p.value}`, 'after');
        if (p.condition === 'completed_quest' && !p.not) ref(e, `quests:${p.value}`, 'after');
      }
      for (const n of q.endNpcs) ref(e, keyOf(n), 'return-to');
    } else if (e.section === 'animals' || e.section === 'people') {
      const c = e.creature;
      if (c) {
        for (const id of c.makes) if (id !== e.id) ref(e, keyOf(id), 'gives');
        for (const id of c.skills) ref(e, `skills:${id}`, 'skill');
        for (const id of textLinks(c.desc)) if (id !== e.id) ref(e, keyOf(id), 'mentions');
      }
      for (const o of e.store?.offers || []) ref(e, keyOf(o.classTsid), 'sells', { price: o.price });
    } else if (e.section === 'skills') {
      const s = e.skill;
      for (const id of s.reqSkills || []) ref(e, `skills:${id}`, 'needs-skill');
      for (const id of s.reqQuests || []) ref(e, `quests:${id}`, 'after');
      for (const id of s.reqAchievements || []) ref(e, `achievements:${id}`, 'after');
      if (s.questId) ref(e, `quests:${s.questId}`, 'opens');
      for (const [, r] of Object.entries(recipes)) {
        if (r.skill !== e.id) continue;
        for (const o of r.outputs || []) ref(e, keyOf(o.classTsid), 'recipe', { recipe: r.name });
      }
    } else if (e.section === 'achievements') {
      for (const c of e.ach.conditions || []) {
        for (const id of [c.name, c.group]) {
          const k = keyOf(id) || keyOf(`npc_${id}`);
          if (k) { ref(e, k, 'counts', { n: c.num }); break; }
        }
      }
      for (const r of Object.values(e.ach.rewards?.items || {})) ref(e, keyOf(r.class_tsid), 'rewards', { n: r.count || 1 });
    } else if (e.section === 'places') {
      // id -> { n: how many in all, streets: on how many streets }
      const tally = new Map();
      const count = (id, n) => { const t = tally.get(id) || { n: 0, streets: 0 }; t.n += n; t.streets += 1; tally.set(id, t); };
      for (const st of e.streets) {
        for (const [id, n] of Object.entries(st.counts)) count(id, n);
        if (st.store) count(`vendor-store:${st.store}`, 1);
        if (st.shrine) count(`npc_shrine_${st.shrine}`, 1);
      }
      for (const [id, t] of tally) {
        const store = /^vendor-store:(.+)$/.exec(id)?.[1];
        if (store) {
          const v = [...entries.values()].find((x) => x.storeName === store) || [...entries.values()].find((x) => x.store?.label === `${store} Vendor`);
          if (v) ref(e, v.key, 'lives', t);
          continue;
        }
        ref(e, keyOf(id), 'lives', t);
      }
    }
  }

  // The way back: key -> [{ from, rel, ...extra }].
  const backOf = () => {
    const out = new Map();
    for (const e of entries.values()) {
      for (const r of e.refs) {
        if (!out.has(r.to)) out.set(r.to, []);
        out.get(r.to).push({ ...r, from: e.key });
      }
    }
    return out;
  };

  /* Blank stubs (isBlankStub): left out of every section, and every link to one becomes its name in plain text. */
  const stubs = await findStubs({ entries, items, back: backOf(), recipes, vendor, foxes, bureaucracy, ecology });
  for (const s of stubs.values()) {
    if (s.section === 'items') items.delete(s.id);
    else entries.delete(s.key);
  }
  for (const e of entries.values()) e.refs = e.refs.filter((r) => !stubs.has(r.to));
  // Skill trees: postSkills come back as needs-skill, so "unlocks" reads from back.

  // Store key (js/vendor.js profile, fox_ranger, bureaucracy) -> the entry that keeps it.
  const stores = new Map([...entries.values()].filter((e) => e.store).map((e) => [e.store.key, e.key]));
  if (entries.has('people:npc_rare_item_vendor')) stores.set('rare_item_vendor', 'people:npc_rare_item_vendor');
  /** A left-out stub's key for a class id named in the data (a creature, person or item), or null. */
  const stubKey = (id) => ['animals', 'people', 'item'].map((sec) => `${sec}:${id}`).find((k) => stubs.has(k)) || null;
  /** The name of any key, a left-out stub's included (for the plain text that replaces its links). */
  const nameOf = (key) => (key.startsWith('item:') ? items.get(key.slice(5))?.name : entries.get(key)?.name) || stubs.get(key)?.name || null;
  /* Music and sounds (tools/encyclopedia/sounds.mjs): added once the stubs are known, so a sound keeps none of them. */
  const sounds = addSounds({ entries, items, keyOf, stubKey, nameOf }, { picture });
  for (const s of sounds.stubs) stubs.set(s.key, s);
  addMoreSections({ add, entries, items, keyOf, nameOf, picture, itemIcon, recipes, skills, ecology });
  const out = { entries, items, recipes, keyOf, skills, stores, stubs, stubKey, nameOf, sounds };
  /* Streets and Stores (streets.mjs, stores.mjs). */
  await addStreets(out, { inventory, picture, slug });
  await addStores(out, { itemIcon, portrait });
  out.back = backOf();
  return out;
}

/* -- Blank stubs ------------------------------------------- */

/**
 * A blank stub is an entry with nothing to show (Austin 2026-11-03: "leave the
 * blank pages out of the encyclopedia"; the example was Kitty, npc_kitty). It
 * gets no page, no search row and no place in any count, in every section
 * (items too: tools/catalog/build.mjs reads the same list). An entry is one
 * when ALL of these hold (each a field of `f`, filled in by findStubs):
 *
 *  1. status: not in the remake (never finished, not yet or lost: parts.mjs STATUS inRemake false);
 *  2. art: no picture of its own (pack icon, still, Cubimal, Giant's icon,
 *     badge, map). The quest book every quest shares is not one;
 *  3. desc: Tiny Speck's description is empty, or only says its name (or its id);
 *  4. content: no content of its own on the page: no steps or rewards (a
 *     quest), no Giants, requirements, learn time or quest (a skill), no
 *     conditions, rewards or status text (an achievement), no streets (a
 *     place), no store or other shrines (a person), no info lines or buffs (an item);
 *  5. linked: no other kept entry links to it: no quest that needs, gives,
 *     rewards, involves or mentions it, no achievement that counts or rewards
 *     it, no skill, creature or person that names it, no region whose streets
 *     hold it. A quest that only names it as the one who offers the quest or
 *     takes it back does not count: nobody met a creature or person that was
 *     never in the game (Kitty: npc_kitty.js:731 offers The Greedy Street
 *     Spirit only when the class is npc_piggy; Black Juju: manor_mystery.js:20
 *     end_npcs, a quest the original never offered either);
 *  6. used: the remake's own systems never name it: no recipe takes, makes or
 *     needs it as the tool, no store sells it, no drop table, harvest or other
 *     conversion gives or takes it;
 *  7. placed: no archived street holds one (street-ecology.json counts).
 *
 * What a creature's or item's own class file lists (its verbs, the items it
 * would create, the skills it checks) is not content for this rule: in a class
 * nobody ever met, that is code it inherits (npc_kitty.js carries npc_animal's
 * Piggy code: nibble for Meat, the Animal Kinship checks, the quest above).
 */
export function isBlankStub(f) {
  return !inRemake(f.status) && !f.art && !hasWords(f.desc, f.name, f.id) && !f.content && !f.linked && !f.used && !f.placed;
}

const bare = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
/** Whether a description says anything beyond the name (markup stripped). */
export function hasWords(desc, name = '', id = '') {
  const text = bare(plainText(desc));
  return Boolean(text) && text !== bare(name) && text !== bare(id);
}

/** Quest relations that only name who offers a quest or takes it back (rule 5). */
const NAMING_ONLY = new Set(['giver', 'return-to']);
const QUEST_BOOK = 'assets/ui/quest-book.png';
const filled = (o) => Object.values(o || {}).some((v) => (v && typeof v === 'object' ? Object.keys(v).length : Boolean(v)));

/** Every class id the remake's systems name (rule 6): recipes, stores, drop tables, harvests and conversions. */
async function remakeClassIds({ recipes, vendor, foxes, bureaucracy }) {
  const ids = new Set();
  const collect = (v) => { for (const m of JSON.stringify(v ?? null).matchAll(/"([a-z0-9_]+)"/g)) ids.add(m[1]); };
  collect(recipes);
  collect(Object.values(vendor.VENDOR_PROFILES).map((p) => p.offers.map((o) => o.classTsid)));
  collect(foxes.FOX_RANGER_STORE.items.map((o) => o.classTsid));
  collect(Object.keys(bureaucracy.BUREAUCRACY_ITEMS));
  collect((await import(js('drop-tables-data.js'))).DROP_TABLES);
  const nodes = await import(js('resource-nodes.js'));
  collect([nodes.RESOURCE_DROP_TABLES, nodes.RESOURCE_NODE_CATALOG]);
  const patches = await import(js('patches.js'));
  collect([patches.SOIL_DROP_TABLES, patches.SOIL_ITEM_DEFS]);
  const artifacts = await import(js('artifacts.js'));
  collect([artifacts.CRACK_STEPS, artifacts.ARTIFACT_MAP, artifacts.ARTIFACT_NECKLACES]);
  collect(await supplyConversions());
  return ids;
}

/** The blank stubs among the entries and items: key -> { key, section, id, name, status }. */
async function findStubs({ entries, items, back, recipes, vendor, foxes, bureaucracy, ecology }) {
  const used = await remakeClassIds({ recipes, vendor, foxes, bureaucracy });
  const placed = new Set(Object.values(ecology).flatMap((st) => Object.keys(st.counts || {})));
  const buffed = new Set(Object.values(content('buffs.json')).map((b) => b.itemClass).filter(Boolean));
  const ownContent = (e) => {
    if (e.section === 'quests') return e.quest.requirements.length > 0 || filled(e.quest.rewards) || (e.quest.giveItems || []).length > 0;
    if (e.section === 'skills') {
      const s = e.skill;
      return filled(s.giants) || [s.reqSkills, s.reqQuests, s.reqAchievements].some((l) => l?.length) || Boolean(s.questId || s.requiresLevel || s.pointCost || s.learned);
    }
    if (e.section === 'achievements') return (e.ach.conditions || []).length > 0 || filled(e.ach.rewards) || Boolean(e.ach.statusText);
    if (e.section === 'places') return e.streets.length > 0;
    return Boolean(e.store?.offers?.length || e.variants?.length);
  };
  const candidates = [];
  for (const e of entries.values()) {
    if (inRemake(e.status)) continue;
    const desc = e.quest?.desc || e.creature?.desc || e.skill?.description || e.ach?.desc || e.desc || '';
    candidates.push({ key: e.key, section: e.section, id: e.id, name: e.name, status: e.status, art: Boolean(e.icon && e.icon.src !== QUEST_BOOK), desc, content: ownContent(e) });
  }
  for (const it of items.values()) {
    if (inRemake(it.status) || it.icon) continue;
    const g = readGsjsItem(it.id);
    candidates.push({ key: `item:${it.id}`, section: 'items', id: it.id, name: it.name, status: it.status, art: false, desc: g.desc, content: g.extras.length > 0 || buffed.has(it.id) });
  }
  // Links from a stub do not keep another stub: repeat until nothing more drops out.
  const stubs = new Map();
  for (let grew = true; grew;) {
    grew = false;
    for (const c of candidates) {
      if (stubs.has(c.key)) continue;
      const linked = (back.get(c.key) || []).some((b) => b.from !== c.key && !stubs.has(b.from) && !NAMING_ONLY.has(b.rel));
      if (isBlankStub({ ...c, linked, used: used.has(c.id), placed: placed.has(c.id) })) {
        stubs.set(c.key, { key: c.key, section: c.section, id: c.id, name: c.name, status: c.status });
        grew = true;
      }
    }
  }
  return stubs;
}

/* -- Helpers ------------------------------------------- */

export const SKILL_CATEGORIES = { 6: 'Alchemy', 8: 'Cooking', 11: 'Industrial', 14: 'Animals', 16: 'Gathering', 17: 'Growing', 19: 'Intellectual' };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
function skillName(s, all) {
  const siblings = Object.values(all).some((o) => o.name === s.name && o.classTsid !== s.classTsid);
  return `${s.name}${siblings && ROMAN[s.level] ? ` ${ROMAN[s.level]}` : ''}`;
}

/** Our own grouping for quests: by the skill or system they belong to. */
function questGroup(id, q) {
  const skill = q.offerTriggers.find((t) => t.type === 'skill')?.skill;
  if (skill) return 'Skill quests';
  if (q.instanceRoom || q.instanced) return 'Quests with their own place';
  if (/race|run|climb|dash|hogtied|crown/.test(id) && q.isMultiplayer) return 'Races and games';
  if (q.isMultiplayer) return 'Games with other players';
  return 'Other quests';
}

function hubGroup(name) {
  if (/Groddle|Ilmenskie|Uralia|Ix|Seams|Naraka|Gentle|Start/.test(name)) return 'Early regions';
  if (/Quest|Puzzle|Party|Paradise|Hall|Tower|Penalty|POL|Lab|Vortex|Moshi/.test(name)) return 'Special places';
  return 'Regions';
}

export { slug };
