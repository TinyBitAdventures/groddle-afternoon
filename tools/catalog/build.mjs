/**
 * The Item Catalog: every item in Tiny Speck's game code, with its status in
 * the remake, generated from the game data at build time.
 *
 *   public/items/data.json         the list the catalog page renders
 *   public/items/index.html        the catalog (grid, search, filters)
 *   public/items/<id>/index.html   one page per item
 *
 *   node tools/catalog/build.mjs          write the files
 *   node tools/catalog/build.mjs --check  exit 1 if any file is stale
 *
 * Sources (all read, nothing written outside public/items/):
 *  - glitch-GameServerJS/items/<id>.js: name_single, name_plural, description,
 *    base_cost, stackmax, parent_classes, tags, verbs.<id> name/tooltip/sort_on
 *    and the generated info lines in getDescExtras (e.g. items/apple.js:3-18,
 *    30-232, 279-293). Text only; nothing is evaluated.
 *  - items/catalog_tags.js item_tags (read through tools/inventory/gsjs-data.mjs).
 *  - research/coverage/inventory.sqlite entities (kind 'item'): status and
 *    register row. Which classes are items at all (no NPCs, no include/) and
 *    which are server plumbing ('excluded') is the inventory's judgement.
 *  - the remake: js/vendor.js VENDOR_PROFILES (from store-catalog.js), the Fox
 *    Ranger and Bureaucratic Hall stores, assets/content/recipes.json,
 *    making-items.json (food and drink use), buffs.json, js/buffs.js, the
 *    harvest systems (trants, mining, resource nodes, soil) and
 *    tools/job-obtainable.mjs supplyConversions (garden, transforms, machines).
 *
 * Words about the original game on the pages are Tiny Speck's, from GSJS.
 * Words about the remake are ours.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { siteNav } from '../changelog/build.mjs';
import { literalFrom, readItemTags } from '../inventory/gsjs-data.mjs';
import { supplyConversions } from '../job-obtainable.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const pub = join(root, 'public');
const AUDIT = join(root, '..');
export const GSJS = join(AUDIT, 'glitch-GameServerJS');
export const INVENTORY_DB = join(AUDIT, 'research', 'coverage', 'inventory.sqlite');
const OUT = 'items';
const ICONS = join(pub, 'assets', 'sprites', 'icons');
const js = (name) => join(pub, 'js', name);
const content = (name) => JSON.parse(readFileSync(join(pub, 'assets', 'content', name), 'utf8'));

/* -- Text helpers --------------------------------------- */

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => Number(n).toLocaleString('en-US');
const andList = (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`);
const orList = (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} or ${parts.at(-1)}`);
const article = (name) => (/^[aeiou]/i.test(name) ? 'an' : 'a');

/** A GSJS string literal ("..." with JSON escapes), decoded. */
function jsString(raw) {
  try { return JSON.parse(raw); } catch { return raw.slice(1, -1); }
}

/** `var name = <scalar>;` at the start of a line. */
function scalarVar(text, name) {
  const m = new RegExp(`^var ${name}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*"|[^;\\n]+)`, 'm').exec(text);
  if (!m) return undefined;
  const raw = m[1].trim();
  return raw.startsWith('"') ? jsString(raw) : raw;
}

function arrayVar(text, name) {
  const at = text.search(new RegExp(`^var ${name}\\s*=\\s*\\[`, 'm'));
  if (at < 0) return [];
  const lit = literalFrom(text, at, '[');
  return lit ? [...lit.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => jsString(`"${m[1]}"`)) : [];
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/**
 * GSJS text with its small markup (<i>, <b>, <br>, <a glitch="item|x">) made
 * safe: item links point at that item's catalog page when it has one, every
 * other tag is dropped and the rest is escaped. Blank lines become paragraphs.
 */
export function gsjsHtml(text, linkItem) {
  const out = [];
  let open = null;
  const re = /<(\/?)([a-z]+)([^>]*)>/gi;
  let at = 0;
  let m;
  const src = String(text ?? '').replace(/\r\n?/g, '\n');
  while ((m = re.exec(src))) {
    out.push(esc(src.slice(at, m.index)));
    at = re.lastIndex;
    const [, close, tagRaw, attrs] = m;
    const tag = tagRaw.toLowerCase();
    if (tag === 'i' || tag === 'b') out.push(`<${close}${tag === 'i' ? 'em' : 'strong'}>`);
    else if (tag === 'br') out.push('\n');
    else if (tag === 'a' && !close) {
      const id = /glitch="item\|([a-z0-9_]+)"/.exec(attrs)?.[1];
      const href = id ? linkItem(id) : null;
      if (href) { out.push(`<a href="${href}">`); open = 'a'; } else open = 'skip';
    } else if (tag === 'a' && close) {
      if (open === 'a') out.push('</a>');
      open = null;
    }
  }
  out.push(esc(src.slice(at)));
  return out.join('').trim().split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => p.replace(/\n/g, '<br />'));
}
const plainText = (text) => String(text ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/* -- Original game: GSJS items/*.js ------------------------- */

function readVerbs(text) {
  const verbs = [];
  for (const m of text.matchAll(/^verbs\.([a-z_0-9]+)\s*=\s*\{/gm)) {
    const lit = literalFrom(text, m.index) || '';
    const field = (k) => {
      const f = new RegExp(`^\\t"${k}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|[-0-9.]+|true|false)`, 'm').exec(lit);
      return f ? (f[1].startsWith('"') ? jsString(f[1]) : f[1]) : undefined;
    };
    const name = field('name');
    if (!name) continue;
    verbs.push({ id: m[1], name, tooltip: field('tooltip') || '', sort: Number(field('sort_on')) || 0, emote: field('is_emote') === 'true', line: lineOf(text, m.index) });
  }
  return verbs.sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
}

/** getDescExtras: the info lines the original's item page showed, in order (guards dropped). */
function readExtras(text) {
  const at = text.search(/^function getDescExtras\(pc\)\{/m);
  if (at < 0) return [];
  const body = literalFrom(text, at) || '';
  const lines = [...body.matchAll(/out\.push\(\[\d+,\s*("(?:[^"\\]|\\.)*")\]\)/g)].map((m) => jsString(m[1]));
  return [...new Set(lines)];
}

export function readGsjsItem(id) {
  const file = `items/${id}.js`;
  const text = readFileSync(join(GSJS, file), 'utf8');
  const descAt = text.search(/^var description\s*=/m);
  return {
    id,
    file,
    descLine: descAt >= 0 ? lineOf(text, descAt) : null,
    name: scalarVar(text, 'name_single') || scalarVar(text, 'label') || id,
    plural: scalarVar(text, 'name_plural') || '',
    desc: scalarVar(text, 'description') || '',
    baseCost: Number(scalarVar(text, 'base_cost')) || 0,
    stackmax: Number(scalarVar(text, 'stackmax')) || 0,
    parents: arrayVar(text, 'parent_classes'),
    // Carried in the pack (takeable parent or include/takeable.js), as against street objects.
    takeable: arrayVar(text, 'parent_classes').includes('takeable') || /^\/\/#include .*takeable/m.test(text),
    tags: arrayVar(text, 'tags'),
    verbs: readVerbs(text),
    extras: readExtras(text),
  };
}

/* -- Inventory ----------------------------------------- */

export function readInventory(path = INVENTORY_DB) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const rows = db.prepare("SELECT id, name, status, register FROM entities WHERE kind = 'item' ORDER BY id").all();
    return new Map(rows.map((r) => [r.id, { status: r.status, register: r.register || '' }]));
  } finally {
    db.close();
  }
}

/* -- Statuses and categories ---------------------------- */

export const STATUSES = [
  { key: 'source', label: 'In the remake', short: 'In the remake' },
  { key: 'missing', label: 'Not yet', short: 'Not yet' },
  { key: 'multiplayer', label: 'In multiplayer', short: 'In multiplayer' },
  { key: 'lost', label: 'Lost', short: 'Lost' },
  { key: 'unbuilt_original', label: 'Never finished', short: 'Never finished' },
];
const STATUS = Object.fromEntries(STATUSES.map((s) => [s.key, s]));

/** What the item page says about each status, in our own words. */
const STATUS_TEXT = {
  source: 'This item is in the remake.',
  missing: 'Not in the remake yet. Tiny Speck’s game had it, and it is on the list to bring back.',
  multiplayer: 'In the remake between real players: it only does anything with someone else to give it to, so it works in multiplayer and not in solo play.',
  lost: 'Lost for now. It needed other players or Tiny Speck’s own servers in a way neither solo play nor multiplayer brings back yet.',
  unbuilt_original: 'Never finished in the original. Tiny Speck’s code defines it, but the game never handed it out, so there is nothing to restore.',
};

/**
 * Our own grouping for the catalog filter, from each item's GSJS tags
 * (items/<id>.js `tags` plus catalog_tags.js) and parent classes. First match wins.
 */
const CATEGORY_RULES = [
  ['Musicblocks', ['musicblock'], ['musicblock_base']],
  ['Drinks', ['drink'], ['drink']],
  ['Food', ['food'], ['food']],
  ['Tools', ['tool', 'premiumtool', 'cookingtool'], ['tool_base', 'hatchet', 'pick', 'shovel', 'hoe', 'watering_can', 'scraper', 'ore_grinder', 'spindle']],
  ['Potions and powders', ['potion', 'powder', 'tinctures_potions', 'tincture'], ['potion_base', 'powder_base', 'tincture_base', 'mg_potion_base']],
  ['Alchemy', ['alchemy', 'compound', 'element', 'gassesbubbles', 'gas', 'bubble'], ['compound_base', 'element_base']],
  ['Garden', ['seed', 'crop', 'herb', 'herb_seed', 'croppery_gardening_supplies', 'herbalism_supplies', 'bean', 'garden'], ['seed_base', 'crop_base', 'herb_base', 'bean_base']],
  ['Animals', ['animals', 'herdkeeping', 'herdkeepingsupplies', 'babyanimal', 'animal', 'egg', 'animalproduct'], ['takeable_animals', 'magic_animal_stick']],
  ['Resources', ['basic_resource', 'advanced_resource', 'natural-resources', 'mining', 'mineable', 'metal', 'gem', 'earth', 'peat', 'woodproduct', 'metalproduct', 'rock', 'barnacle', 'firebogproduct', 'trantproduct', 'crystal', 'fuel', 'jellisac'], ['peat_base', 'petrified_rock_base']],
  ['Machines', ['machineparts_products', 'blockmaker', 'fuelmaker', 'metalmachine', 'woodworker'], ['machine_part_base', 'machine_base']],
  ['Artifacts', ['artifact', 'artifactpiece'], []],
  ['Trophies', ['trophy', 'trophypiece'], ['trophy_base', 'trophy_piece']],
  ['Emblems and icons', ['emblem', 'icon', 'emblems_icons'], ['emblem_base', 'icon_base']],
  ['Furniture and home', ['furniture', 'cabinet', 'house', 'trophycase', 'furniture_interactable', 'proto', 'treehouse', 'furniture_placed_normally'], ['furniture_base', 'proto', 'bag_cabinet_base', 'bag_trophycase_base', 'bag_furniture_cabinet_base']],
  ['Bags', ['bag', 'pack'], ['bag_generic', 'bag_bigger', 'bag_toolbox_base']],
  ['Toys and games', ['toys', 'games', 'game', 'doll', 'dice', 'cubimal'], ['doll', 'rare_doll', 'cubimal_package_base']],
  ['Cards and tickets', ['upgrade_card', 'ticket', 't2p', 'races', 'gameshowticket', 'party'], ['paradise_ticket', 'race_ticket', 'party_pack']],
  ['Keys', ['key'], ['door_key_base']],
  ['Holidays', ['zilloween', 'glitchmas', 'egghunt', 'xmas'], []],
  ['Mental items', ['mental'], ['mental_item_base']],
];
export const CATEGORIES = [...CATEGORY_RULES.map(([name]) => name), 'Street objects', 'Other'];

export function categoryOf(item) {
  const tags = new Set(item.tags);
  const parents = new Set(item.parents.slice(1));
  for (const [name, tagList, parentList] of CATEGORY_RULES) {
    if (tagList.some((t) => tags.has(t)) || parentList.some((p) => parents.has(p))) return name;
  }
  return item.takeable === false ? 'Street objects' : 'Other';
}

/* -- Icons --------------------------------------------- */

function pngSize(path) {
  const b = readFileSync(path);
  return b.length > 24 && b.toString('ascii', 12, 16) === 'IHDR' ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null;
}

/**
 * Lost artifacts the original drew as a Large Petrified Rock (register G174).
 * Their item SWFs (GSJS asset_swf_v items/2012-12/artifact_*.swf) were never
 * archived, and Tiny Speck's own icon for each, captured by the Wayback on
 * 2013-11-19 at c2.glitch.bz/items/2012-12-06/<n>_<ts>_iconic.png (the <ts> is
 * the SWF's version stamp), is one and the same 40 x 40 picture: the Large
 * Petrified Rock (md5 f9cbda35..., all 38). Those captures are reference only
 * (research/catalog-icons-2026-10-27/raw/wayback-matches.txt); what ships is a
 * byte copy of the CC0 petrified_rock_large.png and @3x.png under each id.
 * id -> the capture's <n>_<ts>.
 */
export const ROCK_STAND_INS = Object.freeze({
  artifact_bag_of_tent_pegs: '5142_1354846617',
  artifact_ball_of_string: '5143_1354846702',
  artifact_bee_key: '5139_1354845888',
  artifact_bronze_ladle: '5137_1354845379',
  artifact_butterfly_windchimes: '5129_1354844799',
  artifact_button_bird: '5114_1354839779',
  artifact_button_cloud: '5113_1354839700',
  artifact_button_frog: '5112_1354839627',
  artifact_button_wasp: '5115_1354839861',
  artifact_carved_ear: '5117_1354840065',
  artifact_caterpillar_trousers: '5118_1354840218',
  artifact_daybag: '5105_1354838545',
  artifact_disembodied_dentures: '5125_1354841791',
  artifact_ear_trumpet: '5111_1354839546',
  artifact_ebony_teaspoon: '5132_1354845018',
  artifact_fan: '5107_1354838936',
  artifact_goggles: '5108_1354839031',
  artifact_gold_butter_knife: '5138_1354845520',
  artifact_handbag_clasp: '5106_1354838842',
  artifact_heart_shaped_lump: '5131_1354844940',
  artifact_ivory_coffeestick: '5144_1354846784',
  artifact_metal_tap: '5136_1354845318',
  artifact_nose_of_plaster: '5119_1354840348',
  artifact_nose_of_wool: '5120_1354841070',
  artifact_paper_bag: '5126_1354841888',
  artifact_plastic_spoon: '5140_1354846076',
  artifact_roll_of_blueprints: '5127_1354844600',
  artifact_scarf: '5110_1354839485',
  artifact_see_through_bottle: '5141_1354846165',
  artifact_seed_pouch: '5116_1354839980',
  artifact_silver_spoon: '5130_1354844865',
  artifact_small_water_glass: '5133_1354845138',
  artifact_sock_garters: '5124_1354841461',
  artifact_sock_hook: '5135_1354845255',
  artifact_three_cornered_hat: '5122_1354841279',
  artifact_toenail_clippers: '5134_1354845197',
  artifact_top_hat: '5109_1354839112',
  artifact_twenty_nine_cornered_hat: '5123_1354841359',
});
export const ROCK_STAND_IN_ICON = 'petrified_rock_large';

/** The pack icon (assets/sprites/icons/<id>.png, CC0 OGA or tools/icon-hires 3x renders), or null: a placeholder is drawn. */
function iconOf(id, files) {
  if (!files.has(`${id}.png`)) return null;
  const one = pngSize(join(ICONS, `${id}.png`));
  const hi = files.has(`${id}@3x.png`) ? pngSize(join(ICONS, `${id}@3x.png`)) : null;
  return one ? { w: one.w, h: one.h, hi: hi ? { w: hi.w, h: hi.h } : null } : null;
}

/* -- The remake ---------------------------------------- */

async function readRemake(names) {
  const vendor = await import(js('vendor.js'));
  const foxes = await import(js('foxes.js'));
  const bureaucracy = await import(js('bureaucracy.js'));
  const trants = await import(js('trants.js'));
  const mining = await import(js('mining.js'));
  const imagination = await import(js('imagination-effects.js'));
  const resources = await import(js('resource-nodes.js'));
  const patches = await import(js('patches.js'));
  const making = await import(js('making.js'));
  const tools = await import(js('tools.js'));
  const garden = await import(js('garden.js'));
  const husbandry = await import(js('animal-husbandry.js'));
  const buffsMod = await import(js('buffs.js'));
  const artifacts = await import(js('artifacts.js'));
  const { DROP_TABLES } = await import(js('drop-tables-data.js'));
  const { GIANT_ICON_DATA } = await import(js('giant-icons-data.js'));
  const recipes = content('recipes.json');
  const makingItems = content('making-items.json').items;
  const buffs = content('buffs.json');
  const skills = content('skills.json');
  const conversions = await supplyConversions();

  const push = (map, id, row) => { if (!id) return; if (!map.has(id)) map.set(id, []); map.get(id).push(row); };

  // Stores: every ordinary street-spirit store, the Fox Ranger, the Bureaucratic Hall clerks.
  const vendors = [];
  const soldBy = new Map();
  for (const p of Object.values(vendor.VENDOR_PROFILES)) {
    vendors.push({ key: p.key, label: p.label });
    for (const o of p.offers || []) push(soldBy, o.classTsid, { key: p.key, label: p.label, price: o.buyPrice });
  }
  vendors.push({ key: 'fox_ranger', label: foxes.FOX_RANGER_STORE.name });
  for (const o of foxes.FOX_RANGER_STORE.items) push(soldBy, o.classTsid, { key: 'fox_ranger', label: foxes.FOX_RANGER_STORE.name, price: o.cost });
  vendors.push({ key: 'bureaucracy', label: 'Bureaucratic Hall clerk' });
  for (const [id, row] of Object.entries(bureaucracy.BUREAUCRACY_ITEMS)) push(soldBy, id, { key: 'bureaucracy', label: 'Bureaucratic Hall clerk', price: row.cost });

  // Recipes (assets/content/recipes.json, from catalog_recipes.js by build-recipes.mjs).
  const madeBy = new Map();
  const usedIn = new Map();
  const toolFor = new Map();
  for (const [key, r] of Object.entries(recipes)) {
    const row = { key, ...r };
    for (const o of r.outputs || []) push(madeBy, o.classTsid, row);
    for (const i of new Set((r.inputs || []).map((x) => x.classTsid))) push(usedIn, i, row);
    if (r.tool) push(toolFor, r.tool, row);
  }

  // Other ways to make things: garden, pack transforms, machines, the Still, animals, holidays.
  const otherMade = new Map();
  const otherUses = new Map();
  for (const c of conversions) {
    if (c.source.startsWith('recipe:')) continue;
    for (const o of new Set(c.outputs)) push(otherMade, o, c);
    for (const i of new Set(c.inputs)) push(otherUses, i, c);
  }
  // mining.js CRUSH_YIELDS (Grinder), smeltMetalRocks (Smelter, 5 chunks into 1 Plain Metal), giant-icons.js iconize.
  for (const [chunk, rows] of Object.entries(mining.CRUSH_YIELDS)) {
    const c = { inputs: [chunk], tool: 'ore_grinder', outputs: rows.map((r) => r.classTsid), source: 'ore_grinder' };
    for (const o of c.outputs) push(otherMade, o, c);
    push(otherUses, chunk, c);
  }
  const smelt = { inputs: ['metal_rock'], tool: 'smelter', outputs: ['plain_metal'], source: 'smelter' };
  push(otherMade, 'plain_metal', smelt);
  push(otherUses, 'metal_rock', smelt);
  for (const g of Object.values(GIANT_ICON_DATA)) {
    const c = { inputs: [g.emblemClass], tool: null, outputs: [g.iconClass], source: 'iconize', count: 11 };
    push(otherMade, g.iconClass, c);
    push(otherUses, g.emblemClass, c);
  }
  // Artifacts (js/artifacts.js, from players/inc_artifacts.js): the pieces put themselves together, and so do a necklace's beads.
  for (const a of Object.values(artifacts.ARTIFACT_MAP)) {
    const c = { inputs: a.pieces, tool: null, outputs: [a.artifact], source: 'assembly' };
    push(otherMade, a.artifact, c);
    for (const piece of a.pieces) push(otherUses, piece, c);
  }
  for (const [bead, n] of Object.entries(artifacts.ARTIFACT_NECKLACES)) {
    const c = { inputs: [bead], tool: null, outputs: [n.produces], source: 'assembly', count: n.required };
    push(otherMade, n.produces, c);
    push(otherUses, bead, c);
  }

  // Harvests: each as { text, tool? } in our words, naming the remake's own labels.
  const harvests = new Map();
  for (const t of Object.values(trants.TRANT_META)) push(harvests, t.fruitClass, { text: `Harvested from ${article(t.label)} ${t.label}.` });
  for (const rock of Object.values(mining.ROCK_CATALOG)) push(harvests, rock.chunkId, { text: `Mined from ${article(rock.label)} ${rock.label}`, tools: Object.keys(mining.PICK_TOOLS) });
  for (const [, id] of imagination.GEM_SMALL_DROPS) push(harvests, id, { text: 'Sometimes turns up while mining, once you have the Truly Outrageous upgrades.' });
  push(harvests, 'plank', { text: 'Chopped from a Wood Tree', tools: ['hatchet'] });
  push(harvests, 'meat', { text: 'Nibbled from a Piggy.' });
  push(harvests, 'grain', { text: 'Squeezed from a Chicken.' });
  push(harvests, 'milk_butterfly', { text: 'Milked from a Butterfly.' });
  push(harvests, 'guano', { text: 'Left behind by Batterflies on cave streets when you feed them.' });
  push(harvests, foxes.FIBER_ID, { text: 'Brushed from a Fox', tools: [foxes.FOX_BRUSH_ID] });
  for (const id of husbandry.akDropItems()) push(harvests, id, { text: 'Sometimes dropped by animals once your Animal Kinship is high enough.' });
  const tableIds = (table, seen = new Set()) => {
    const out = new Set();
    const walk = (v) => {
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v)) { v.forEach(walk); return; }
      for (const [k, x] of Object.entries(v)) {
        if ((k === 'classTsid' || k === 'class_id') && typeof x === 'string') out.add(x);
        else if (k === 'table' && typeof x === 'string' && !seen.has(x)) { seen.add(x); for (const id of tableIds(resources.RESOURCE_DROP_TABLES[x] || patches.SOIL_DROP_TABLES[x], seen)) out.add(id); }
        else walk(x);
      }
    };
    walk(table);
    return out;
  };
  const toolUses = new Map();
  for (const node of Object.values(resources.RESOURCE_NODE_CATALOG)) {
    for (const verb of node.verbs || []) {
      const got = new Set();
      for (const y of verb.yields || []) got.add(y.classTsid);
      for (const s of JSON.stringify(verb).match(/"[a-z0-9_]+"/g) || []) {
        const key = s.slice(1, -1);
        if (resources.RESOURCE_DROP_TABLES[key]) for (const id of tableIds(resources.RESOURCE_DROP_TABLES[key])) got.add(id);
      }
      const what = node.kind === 'trap' ? `Dropped by ${article(node.label)} ${node.label} when you walk into it.` : `${verb.label} ${article(node.label)} ${node.label}`;
      for (const id of got) push(harvests, id, { text: what, tools: verb.tools || [] });
      for (const tool of verb.tools || []) push(toolUses, tool, { text: `${verb.label} ${node.labelPlural || node.label}` });
    }
  }
  // Petrified Rocks (js/artifacts.js CRACK_STEPS, rolled through js/drop-tables-data.js): what cracking each one can turn up.
  const dropIds = (key, seen = new Set()) => {
    const out = new Set();
    if (seen.has(key) || !DROP_TABLES[key]) return out;
    seen.add(key);
    for (const [, picks] of DROP_TABLES[key].rows || []) {
      for (const pick of picks) {
        if (pick.item) out.add(pick.item);
        if (pick.table) for (const id of dropIds(pick.table, seen)) out.add(id);
      }
    }
    return out;
  };
  const cracked = new Map();
  for (const [rock, steps] of Object.entries(artifacts.CRACK_STEPS)) {
    for (const step of steps) {
      const got = step.table ? dropIds(step.table) : new Set((step.items || []).map(([id]) => id));
      for (const id of got) push(cracked, id, rock);
    }
  }
  const rockName = (id) => `${article(names.get(id)?.name || id)} ${names.get(id)?.name || id}`;
  for (const [id, rocks] of cracked) push(harvests, id, { text: `Cracked out of ${orList([...new Set(rocks)].map(rockName))}` });
  const soilIds = new Set([...tableIds(patches.SOIL_DROP_TABLES), ...Object.keys(patches.SOIL_ITEM_DEFS)]);
  for (const id of soilIds) push(harvests, id, { text: 'Sometimes found while digging soil patches, with Soil Appreciation.' });
  for (const id of Object.keys(mining.PICK_TOOLS)) push(toolUses, id, { text: 'Mine rocks for chunks' });
  push(toolUses, 'smelter', { text: 'Smelt Chunks of Metal Rock into Plain Metal' });
  push(toolUses, 'ore_grinder', { text: 'Grind chunks of Beryl, Dullite and Sparkly into elements' });
  push(toolUses, 'hatchet', { text: 'Chop Wood Trees for Planks' });
  for (const id of Object.keys(garden.starterGardenTools())) push(toolUses, id, { text: id === 'hoe' ? 'Hoe garden plots' : 'Water garden plots' });

  const starter = new Set([
    ...making.STARTER_TOOL_IDS,
    ...Object.keys(garden.starterGardenTools()),
    ...Object.keys(resources.starterResourceTools()),
    ...Object.keys(mining.starterMiningTools()).filter((id) => id !== 'fuel_cell'),
    'hatchet',
  ]);

  const isTool = new Set([...Object.keys(making.TOOL_CATALOG), ...Object.keys(tools.TOOL_CONDITION_CATALOG)]);
  const itemBuffs = new Map();
  for (const b of Object.values(buffs)) if (b.itemClass) push(itemBuffs, b.itemClass, b);
  const questTimers = readQuestTimers();
  const skillName = (id) => {
    const s = skills[id];
    if (!s) return id;
    const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][s.level] || '';
    return `${s.name}${roman && Object.values(skills).some((o) => o.name === s.name && o.classTsid !== s.classTsid) ? ` ${roman}` : ''}`;
  };
  return {
    vendors, soldBy, madeBy, usedIn, toolFor, otherMade, otherUses, harvests, toolUses, starter, isTool, itemBuffs, questTimers,
    uses: makingItems, buffItems: buffsMod.BUFF_ITEM_CATALOG, skillName, names,
  };
}

/**
 * Buffs that are a quest's countdown, not an effect: catalog_buffs.js entries
 * whose on_remove fails a quest (e.g. get_a_rasher, items/catalog_buffs.js
 * 887-909, applied by quests/animalkinship_nibble_meat.js:69). Their
 * item_class only picks the picture the buff shows. buff id -> { quest, line }.
 */
export function readQuestTimers(gsjs = GSJS) {
  const text = readFileSync(join(gsjs, 'items', 'catalog_buffs.js'), 'utf8');
  const out = new Map();
  for (const m of text.matchAll(/^\t"([a-z0-9_]+)"\s*:\s*\{/gm)) {
    const body = literalFrom(text, m.index) || '';
    const remove = /on_remove\s*:\s*function[^{]*\{/.exec(body);
    const onRemove = remove ? literalFrom(body, remove.index + remove[0].length - 1) || '' : '';
    if (!/\.failQuest\(/.test(onRemove)) continue;
    const quest = /quest_id\s*=\s*['"]([a-z0-9_]+)['"]/.exec(onRemove)?.[1];
    if (quest) out.set(m[1], { quest, line: lineOf(text, m.index) });
  }
  return out;
}

/** Remake files that hand items out (inventory evidence `addItem at js/...`), named for players. */
const FEATURE_NAMES = {
  'doors': 'the locked doors and their keys',
  'party-spaces': 'the Party Spaces',
  'street-jobs': 'street projects',
  'juju-camp': 'the Juju camp quest',
  'hell-bar': 'the Hell Bar',
  'newxp': 'the new player tour',
  'street-furniture': 'the street furniture',
  'esquibeth': 'the Esquibeth quest',
  'teleportation': 'teleportation',
  'smuggling': 'smuggling',
  'small-items': 'the small pack items',
  'races': 'the races',
  'puzzle-scenes': 'the puzzle streets',
  'imagination': 'Imagination upgrades',
  'crabs': 'the crabs and their crabphones',
  'butler': 'the Butler',
  'bureaucracy': 'the Bureaucratic Hall',
  'making': 'making',
  'ghost-quest': 'the Phantom hunt',
  'home-tower': 'the home Tower',
  'seasons': 'the holidays',
  'giant-icons': 'the Giants’ shrines',
};

/** Stores the inventory names that are not ordinary street spirits (evidence `vendor:<key>`). */
const EXTRA_VENDORS = {
  rare_item_vendor: 'Rare Item Vendor',
  race_ticket_dispenser: 'Race Ticket Dispenser',
};

/**
 * Skill packages whose drop tables the remake rolls (js/features/drops-feature.js),
 * as the thing you do, in our words. Inventory evidence names them as
 * `drop table <table> (skill package <package>, rolled at <file:line>)`.
 */
const PACKAGE_ACTS = {
  scraping: 'scrape a Barnacle',
  peat_harvest: 'harvest a Peat Bog',
  paper_tree_pet: 'pet a Paper Tree',
  paper_tree_water: 'water a Paper Tree',
  herbalism_clear: 'clear an herb garden plot',
  croppery_clear: 'clear a crop garden plot',
  jellisac_scooping: 'scoop a Jellisac',
  refining: 'refine ore in a Grinder',
};

/**
 * A `how:` an override wrote into the inventory evidence (tools/inventory/overrides.json
 * reason "how: <sentence> (<remake file:line>)"): the sentence, without the file references.
 */
export function howOf(evidence) {
  const m = /(?:^|\| )how: ([^|]+)/.exec(evidence || '');
  if (!m) return null;
  const text = m[1].trim().replace(/\s*\((?=[^()]*\.js)[\s\S]*$/, '').trim();
  return text ? (/[.!?]$/.test(text) ? text : `${text}.`) : null;
}

/** What the inventory says gave a source item to the player, when no other route above names it. */
function evidenceWay(evidence, quests, takeable) {
  const ob = /obtainable: ([^|]*)/.exec(evidence || '')?.[1]?.trim() || '';
  let m;
  if ((m = /^vendor:([a-z0-9_]+)/.exec(ob))) return { kind: 'sold', vendor: m[1], label: EXTRA_VENDORS[m[1]] || m[1].replace(/_/g, ' ') };
  if ((m = /^drop table [a-z0-9_]+ \(skill package ([a-z0-9_]+)/.exec(ob)) && PACKAGE_ACTS[m[1]]) {
    return { kind: 'harvest', harvest: { text: `Sometimes drops when you ${PACKAGE_ACTS[m[1]]}.` } };
  }
  if ((m = /^reward of quest ([a-z0-9_]+)/.exec(ob))) return `A reward for the quest ${quests[m[1]]?.title ? `“${quests[m[1]].title}”` : m[1]}.`;
  if ((m = /^given on accepting quest ([a-z0-9_]+)/.exec(ob))) return `Handed to you when you take the quest ${quests[m[1]]?.title ? `“${quests[m[1]].title}”` : m[1]}.`;
  if (/^street-project/.test(ob)) return 'Dropped as a reward when you finish a street project.';
  if (/^imagination/.test(ob)) return 'Comes with an Imagination upgrade card.';
  if (/^drop:egg_plant_pet/.test(ob)) return 'Petting an Egg Plant can drop one, any time of year.';
  if (/^drop:/.test(ob)) return 'A drop you can get as you play.';
  if (/^collection:/.test(ob)) return 'A reward for finishing a collection.';
  if (/^season/.test(ob)) return 'Only while its holiday is on in the remake.';
  if (/^starter/.test(ob)) return 'Every new player starts with one.';
  if (/^reward of badge/.test(ob)) return 'A reward for finishing a collection.';
  if (/musicblocks\.js/.test(ob)) return 'Found lying on streets around the world.';
  if (/quest-offers\.js/.test(ob)) return 'A reward for a quest.';
  if (/giant-icons-feature\.js/.test(ob)) return 'A Giant’s shrine hands it over as your favor fills.';
  if (/home cultivation/.test(evidence)) return 'Placed in your home yard with Cultivate.';
  if (!takeable || /street-ecology/.test(evidence)) return 'Found out in the world.';
  for (const [, file] of String(evidence).matchAll(/(?:js\/)?(?:features\/|quest-rooms\/)?([a-z0-9-]+?)(?:-feature)?\.js/g)) {
    if (FEATURE_NAMES[file]) return `Part of ${FEATURE_NAMES[file]} in the remake.`;
  }
  if (/spawned|placed/.test(evidence)) return 'Found out in the world.';
  return 'The remake gives it out as you play.';
}

/* -- Build --------------------------------------------- */

export async function buildCatalog({ inventory = readInventory(), evidence = readEvidence() } = {}) {
  const ids = [...inventory.keys()].filter((id) => existsSync(join(GSJS, 'items', `${id}.js`)));
  const tagIndex = readItemTags(GSJS);
  const all = new Map(ids.map((id) => {
    const it = readGsjsItem(id);
    it.tags = [...new Set([...it.tags, ...(tagIndex.get(id) || []).map((t) => t.replace(/,$/, ''))])];
    return [id, it];
  }));
  const excluded = ids.filter((id) => inventory.get(id).status === 'excluded');
  const listed = ids.filter((id) => inventory.get(id).status !== 'excluded')
    .map((id) => all.get(id))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
  const inCatalog = new Set(listed.map((i) => i.id));
  const names = new Map([...all.values()].map((i) => [i.id, { name: i.name, plural: i.plural }]));
  const remake = await readRemake(names);
  const quests = content('quests.json');
  const iconFiles = new Set(readdirSync(ICONS));
  const musicblocks = JSON.parse(readFileSync(join(pub, 'musicblocks', 'data.json'), 'utf8'));
  const musicCards = new Set(musicblocks.sets.flatMap((s) => s.blocks.map((b) => b.id)));

  const entries = listed.map((it) => {
    const inv = inventory.get(it.id);
    const status = inv.status;
    const ways = status === 'source' ? waysFor(it.id, remake, evidence.get(it.id), quests, it.takeable) : [];
    return {
      it,
      status,
      register: inv.register,
      category: categoryOf(it),
      icon: iconOf(it.id, iconFiles),
      ways,
      get: [...new Set(ways.map((w) => w.kind))],
    };
  });

  const data = {
    about: 'Every item in Tiny Speck’s Glitch game code (glitch-GameServerJS items/), with its status in the Groddle Afternoon remake. Generated by tools/catalog/build.mjs.',
    counts: {
      listed: entries.length,
      excluded: excluded.length,
      byStatus: Object.fromEntries(STATUSES.map((s) => [s.key, entries.filter((e) => e.status === s.key).length])),
    },
    statuses: STATUSES.map(({ key, label }) => ({ key, label })),
    categories: CATEGORIES.filter((c) => entries.some((e) => e.category === c)),
    gets: GETS.map(({ key, label }) => ({ key, label })),
    vendors: [...remake.vendors, ...Object.entries(EXTRA_VENDORS).map(([key, label]) => ({ key, label }))]
      .filter((v) => entries.some((e) => e.ways.some((w) => w.vendor === v.key))),
    items: entries.map((e) => ({
      id: e.it.id,
      name: e.it.name,
      category: e.category,
      icon: e.icon ? (e.icon.hi ? 3 : 1) : 0,
      status: e.status,
      price: e.it.baseCost,
      get: e.get,
      sold: [...new Set(e.ways.filter((w) => w.vendor).map((w) => w.vendor))],
      desc: plainText(e.it.desc).slice(0, 220),
    })),
  };

  const files = {};
  files[`${OUT}/data.json`] = `${JSON.stringify(data, null, 0).replace(/\{"id":/g, '\n{"id":')}\n`;
  files[`${OUT}/index.html`] = indexPage(data);
  entries.forEach((e, i) => {
    files[`${OUT}/${e.it.id}/index.html`] = itemPage(e, {
      prev: entries[i - 1], next: entries[i + 1], remake, inCatalog, names, musicCards, quests, total: entries.length, index: i,
    });
  });
  return { files, data, excludedIds: excluded };
}

export function readEvidence(path = INVENTORY_DB) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return new Map(db.prepare("SELECT id, evidence FROM entities WHERE kind = 'item'").all().map((r) => [r.id, r.evidence || '']));
  } finally {
    db.close();
  }
}

export const GETS = [
  { key: 'sold', label: 'Sold by a vendor' },
  { key: 'made', label: 'Made' },
  { key: 'harvest', label: 'Harvested' },
  { key: 'other', label: 'Found or given' },
];

/** Every way a player gets this item in the remake today: [{ kind, vendor?, recipe?, conv?, harvest?, text? }]. */
function waysFor(id, remake, evidence, quests, takeable) {
  const ways = [];
  for (const v of remake.soldBy.get(id) || []) ways.push({ kind: 'sold', vendor: v.key, label: v.label, price: v.price });
  for (const r of remake.madeBy.get(id) || []) ways.push({ kind: 'made', recipe: r });
  for (const c of remake.otherMade.get(id) || []) ways.push({ kind: 'made', conv: c });
  for (const h of remake.harvests.get(id) || []) ways.push({ kind: 'harvest', harvest: h });
  if (remake.starter.has(id)) ways.push({ kind: 'other', text: 'Every new player starts with one.' });
  const how = howOf(evidence);
  if (how) ways.push({ kind: 'other', text: how });
  if (!ways.length) {
    const way = evidenceWay(evidence, quests, takeable);
    ways.push(typeof way === 'string' ? { kind: 'other', text: way } : way);
  }
  return ways;
}

/* -- Pages --------------------------------------------- */

const FOOT = (p) => `  <footer class="foot">
    <div class="wrap">
      <p>A <a href="https://tinybitadventures.com">fan remake</a> of Tiny Speck’s Glitch · <a href="${p}credits/">Credits</a></p>
      <p><a href="${p}">Home</a> · <a href="${p}play/">Play Groddle Afternoon</a> · <a href="${p}restoration/">Restoration report</a> · <a href="${p}items/">Item catalog</a></p>
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
  <script src="${p}site/theme.js"></script>
  <link rel="stylesheet" href="${p}items/catalog.css" />
  <link rel="icon" href="${p}favicon.svg?v=arch" type="image/svg+xml" />
  <link rel="icon" href="${p}favicon.ico?v=arch" sizes="32x32" />
  <link rel="apple-touch-icon" href="${p}apple-touch-icon.png?v=arch" />
${script ? `  <script type="module" src="${script}"></script>\n` : ''}</head>
<body class="notes catalog">
${siteNav(p, 'items')}
${body}
${FOOT(p)}
</body>
</html>
`;

function indexPage(data) {
  const c = data.counts;
  const s = c.byStatus;
  const chip = (group, key, label, n, pressed = false) => `<button type="button" class="chip" data-${group}="${esc(key)}" aria-pressed="${pressed}">${group === 'status' && key ? `<span class="dot st-${esc(key)}" aria-hidden="true"></span>` : ''}${esc(label)} <span class="count">${fmt(n)}</span></button>`;
  const getCount = (k) => data.items.filter((i) => i.get.includes(k)).length;
  const body = `
  <header class="masthead note-head cat-head">
    <div class="wrap">
      <p class="kicker">Groddle Field Notes · Items</p>
      <h1>Item catalog</h1>
      <p class="lead">Every item in Tiny Speck’s Glitch, from the game’s own code, and whether you can get it in the remake yet.</p>
      <p class="cat-score"><strong>${fmt(s.source)}</strong> of ${fmt(c.listed)} items are in the remake. ${fmt(s.missing)} are not in yet, ${fmt(s.lost)} are lost for now because they needed other players or Tiny Speck’s own servers, and ${fmt(s.unbuilt_original)} were never finished in the original.</p>
      <p class="cat-note">${fmt(c.excluded)} more classes in the item folder are server plumbing (admin tools, tests, quest markers, containers the server made for itself) and are left out.</p>
    </div>
  </header>

  <main class="band cat-main">
    <div class="wrap">
      <div class="cat-tools">
        <label class="history-search cat-search" for="q">
          <span class="visually-hidden">Search items</span>
          <input id="q" type="search" placeholder="Search, e.g. apple, pick, piggy" autocomplete="off" spellcheck="false" />
        </label>
        <div class="cat-selects">
          <label><span>Category</span>
            <select id="cat">
              <option value="">All categories</option>
${data.categories.map((name) => `              <option value="${esc(name)}">${esc(name)} (${fmt(data.items.filter((i) => i.category === name).length)})</option>`).join('\n')}
            </select>
          </label>
          <label><span>Sold by</span>
            <select id="sold">
              <option value="">Any vendor</option>
${data.vendors.map((v) => `              <option value="${esc(v.key)}">${esc(v.label)}</option>`).join('\n')}
            </select>
          </label>
        </div>
        <div class="chips" role="group" aria-label="Status">
          ${chip('status', '', 'All', c.listed, true)}
          ${data.statuses.map((st) => chip('status', st.key, st.label, s[st.key])).join('\n          ')}
        </div>
        <div class="chips" role="group" aria-label="Can get it now">
          <span class="cat-chips-label">Get it now:</span>
          ${data.gets.map((g) => chip('get', g.key, g.label, getCount(g.key))).join('\n          ')}
        </div>
      </div>
      <p class="cat-count" id="count" aria-live="polite">${fmt(c.listed)} items</p>
      <ul class="cat-grid" id="grid"></ul>
      <p class="cat-empty" id="empty" hidden>No items match. Try fewer filters.</p>
      <noscript><p class="cat-empty">The catalog list needs JavaScript. Every item also has its own page, starting with <a href="${esc(data.items[0].id)}/">${esc(data.items[0].name)}</a>; each page links to the next.</p></noscript>
    </div>
  </main>
`;
  return shell({ p: '../', title: 'Item catalog · Groddle Field Notes', description: `Every item in Tiny Speck's Glitch and its status in the Groddle Afternoon remake: ${fmt(s.source)} of ${fmt(c.listed)} are in.`, body, script: 'catalog.js' });
}

function itemPage(e, ctx) {
  const { it } = e;
  const { remake, inCatalog, names } = ctx;
  const p = '../../';
  const nameOf = (id) => names.get(id)?.name || remake.uses[id]?.label || id;
  const pluralOf = (id) => names.get(id)?.plural || nameOf(id);
  const link = (id, label = nameOf(id)) => (inCatalog.has(id) ? `<a href="../${esc(id)}/">${esc(label)}</a>` : esc(label));
  const linkItem = (id) => (inCatalog.has(id) ? `../${esc(id)}/` : null);
  const qty = (id, n) => (n === 1 || n === '1' ? `${article(nameOf(id))} ${link(id)}` : `${esc(n)} ${link(id, pluralOf(id))}`);
  const tool = (id) => (id ? `${article(nameOf(id))} ${link(id)}` : '');

  const recipeText = (r) => {
    const inputs = andList((r.inputs || []).map((i) => qty(i.classTsid, i.qty)));
    const outs = (r.outputs || []).filter((o) => o.classTsid !== it.id);
    const mine = (r.outputs || []).find((o) => o.classTsid === it.id);
    const n = mine && mine.qty > 1 ? ` Makes ${esc(mine.qty)}.` : '';
    const also = outs.length ? ` Also makes ${andList(outs.map((o) => qty(o.classTsid, o.qty)))}.` : '';
    const skill = r.skill ? ` Needs ${esc(remake.skillName(r.skill))}.` : '';
    return `${r.tool ? `With ${tool(r.tool)}` : 'By hand'}, from ${inputs}.${n}${also}${skill}`;
  };
  const convText = (c) => {
    const ins = andList(c.inputs.map((i) => (c.count ? `${c.count} ${link(i, pluralOf(i))}` : link(i))));
    switch (c.source.split(':')[0]) {
      case 'garden': return `Grown in a garden plot from ${link(c.inputs[0])}.`;
      case 'transform': return `Made from ${ins} with its ${esc(c.source.split(':')[1].replace(/_/g, ' '))} verb.`;
      case 'assembly': {
        // An artifact's pieces all carry the artifact's name (items/artifact_*_piece*.js): number them instead.
        const same = c.inputs.length > 1 && c.inputs.every((i) => nameOf(i) === nameOf(c.inputs[0]));
        return same
          ? `Assembled from ${c.inputs.length === 2 ? 'both' : `all ${c.inputs.length}`} ${esc(pluralOf(c.inputs[0]))}: ${andList(c.inputs.map((i, n) => link(i, `piece ${n + 1}`)))}.`
          : `Assembled from ${ins}.`;
      }
      case 'still': return `Distilled in ${tool('still')} from ${ins}.`;
      case 'paper': return `Written on ${link('paper')}.`;
      case 'piggy_plop': return 'A Piggy plops it after eating three or more crops.';
      case 'incubation': return `Hatched from ${link(c.inputs[0])}.`;
      case 'herdkeeping': return `Caught with ${link(c.inputs[0])} (Herdkeeping).`;
      case 'season': return `During its holiday, made from ${ins}${c.tool ? ` with ${tool(c.tool)}` : ''}.`;
      case 'ore_grinder': return `Ground from ${ins} in ${tool('ore_grinder')}.`;
      case 'smelter': return `Smelted from five ${link('metal_rock', pluralOf('metal_rock'))} in ${tool('smelter')}.`;
      case 'iconize': return `Made from ${ins}.`;
      default: return `Made from ${ins}.`;
    }
  };
  const harvestText = (h) => {
    const tools = (h.tools || []).filter((t) => names.has(t) || remake.uses[t]);
    return tools.length ? `${esc(h.text)} with ${orList(tools.map(tool))}.` : esc(h.text.endsWith('.') ? h.text : `${h.text}.`);
  };

  // How to get it in the remake.
  const recipesShown = new Set();
  const ways = e.ways.map((w) => {
    if (w.kind === 'sold') return `<li>Sold by the <a href="../?sold=${esc(w.vendor)}">${esc(w.label)}</a>${w.price ? ` for ${fmt(w.price)} currants` : ''}.</li>`;
    if (w.recipe) {
      if (recipesShown.has(w.recipe.key)) return '';
      recipesShown.add(w.recipe.key);
      return `<li id="recipe-${esc(w.recipe.key)}"><strong>${esc(w.recipe.name)}</strong>: ${recipeText(w.recipe)}</li>`;
    }
    if (w.conv) return `<li>${convText(w.conv)}</li>`;
    if (w.harvest) return `<li>${harvestText(w.harvest)}</li>`;
    return `<li>${esc(w.text)}</li>`;
  }).filter((li, i, all) => li && all.indexOf(li) === i);
  const uniq = (list) => [...new Set(list)];

  // What it is used for in the remake.
  const uses = [];
  const usedIn = uniq((remake.usedIn.get(it.id) || []).map((r) => {
    const out = r.outputs?.[0]?.classTsid;
    const label = esc(r.name);
    const a = out && inCatalog.has(out) ? `<a href="../${esc(out)}/#recipe-${esc(r.key)}">${label}</a>` : label;
    return `${a}${r.tool ? ` <span class="cat-with">(${esc(nameOf(r.tool))})</span>` : ''}`;
  }));
  if (usedIn.length) uses.push(`<li><strong>An ingredient in ${usedIn.length === 1 ? 'one recipe' : `${usedIn.length} recipes`}:</strong> ${usedIn.join(', ')}.</li>`);
  const makes = uniq((remake.toolFor.get(it.id) || []).map((r) => {
    const out = r.outputs?.[0]?.classTsid;
    return out && inCatalog.has(out) ? `<a href="../${esc(out)}/#recipe-${esc(r.key)}">${esc(r.name)}</a>` : esc(r.name);
  }));
  if (makes.length) uses.push(`<li><strong>The tool for ${makes.length === 1 ? 'one recipe' : `${makes.length} recipes`}:</strong> ${makes.join(', ')}.</li>`);
  for (const c of remake.otherUses.get(it.id) || []) {
    const outs = andList(uniq(c.outputs).map((o) => link(o)));
    const kind = c.source.split(':')[0];
    const text = {
      garden: `Plant it in a garden plot to grow ${outs}.`,
      transform: `Its ${esc((c.source.split(':')[1] || '').replace(/_/g, ' '))} verb turns it into ${outs}.`,
      assembly: `A part for ${outs}.`,
      still: `Distil it in ${tool('still')} for ${outs}.`,
      paper: `Write on it to make ${outs}.`,
      piggy_plop: `Feed it to a Piggy, which plops out ${outs}.`,
      incubation: `A Chicken can incubate it into ${outs}.`,
      herdkeeping: `Use it to catch ${outs}.`,
      season: `During its holiday it becomes ${outs}.`,
      ore_grinder: `Grind it in ${tool('ore_grinder')} for ${outs}.`,
      smelter: `Smelt five in ${tool('smelter')} for ${outs}.`,
      iconize: `Eleven of them make ${outs}.`,
    }[kind] || `Makes ${outs}.`;
    uses.push(`<li>${text}</li>`);
  }
  for (const t of remake.toolUses.get(it.id) || []) uses.push(`<li>${esc(t.text)}.</li>`);
  const use = remake.uses[it.id]?.use;
  if (use?.kind === 'food' && use.energy) uses.push(`<li>Eat it for ${fmt(use.energy)} energy.</li>`);
  if (use?.kind === 'drink') {
    const fx = [use.mood && `${fmt(use.mood)} mood`, use.energy && `${fmt(use.energy)} energy`, use.xp && `${fmt(use.xp)} iMG`].filter(Boolean);
    if (fx.length) uses.push(`<li>Drink it for ${andList(fx)}.</li>`);
  }
  const buffItem = remake.buffItems[it.id];
  if (buffItem) uses.push(`<li>${esc(buffItem.verb)} it: ${esc(buffItem.effectHint)}.</li>`);
  const usesHtml = uniq(uses);

  // Buffs (GSJS catalog_buffs.js names and descriptions, via buffs.json).
  // buffs.json keeps catalog_buffs.js's escaped quotes (\\"Take a picture\\"); unescape them.
  const unq = (t) => String(t).replace(/\\(["'/])/g, '$1');
  const buffLine = (b, after = '') => `<li><strong>${esc(unq(b.name))}</strong>${b.desc ? `: ${gsjsHtml(unq(b.desc), linkItem).join(' ')}` : ''}${after}</li>`;
  const itemBuffs = remake.itemBuffs.get(it.id) || [];
  const buffs = itemBuffs.filter((b) => !remake.questTimers.has(b.classTsid)).map((b) => buffLine(b));
  // A quest's countdown shows this item's picture; it is not something the item does (readQuestTimers).
  const timers = itemBuffs.filter((b) => remake.questTimers.has(b.classTsid)).map((b) => {
    const quest = ctx.quests[remake.questTimers.get(b.classTsid).quest];
    const title = quest?.title ? `“${esc(String(quest.title).trim())}”` : 'it belongs to';
    return buffLine(b, `${/[.!?]$/.test(plainText(unq(b.desc))) ? '' : '.'} The countdown for the quest ${title}, shown with this item’s picture: if it runs out first, the quest fails.`);
  });

  const status = STATUS[e.status];
  const isMusic = it.id.startsWith('musicblock_') || it.tags.includes('musicblock');
  const musicHref = `${p}musicblocks/${ctx.musicCards.has(it.id) ? `#${esc(it.id)}` : ''}`;
  const icon = e.icon
    ? `<img class="cat-hero-icon" src="${p}assets/sprites/icons/${esc(it.id)}${e.icon.hi ? '@3x' : ''}.png" alt="" width="${e.icon.hi ? e.icon.hi.w : e.icon.w * 3}" height="${e.icon.hi ? e.icon.hi.h : e.icon.h * 3}"${e.icon.hi ? '' : ' style="image-rendering: auto"'} />`
    : '<span class="cat-hero-icon cat-ph" aria-hidden="true"></span>';
  const desc = gsjsHtml(it.desc, linkItem);
  const extras = it.extras.map((x) => gsjsHtml(x, linkItem).join(' ')).filter(Boolean);
  const verbs = it.verbs.filter((v, i, a) => a.findIndex((o) => o.name === v.name) === i);

  const remakeBody = e.status === 'source'
    ? `
          <h3>How to get it</h3>
          <ul class="cat-list">
            ${ways.join('\n            ')}
          </ul>
${usesHtml.length ? `          <h3>What it is for</h3>
          <ul class="cat-list">
            ${usesHtml.join('\n            ')}
          </ul>\n` : ''}${isMusic ? `          <p class="cat-music"><a href="${musicHref}">Hear it on the Musicblocks page</a></p>\n` : ''}`
    : `${isMusic ? `\n          <p class="cat-music"><a href="${musicHref}">Hear the Musicblocks on their own page</a></p>` : ''}
          <p class="cat-muted">${e.status === 'missing' ? 'You can’t get it in the remake yet, so there is nothing to make with it or use it for here.' : 'There is no way to get it in the remake.'}</p>`;

  const body = `
  <header class="masthead note-head cat-item-head">
    <div class="wrap">
      <p class="kicker"><a href="../">Groddle Field Notes · Item catalog</a> · ${esc(e.category)}</p>
      <div class="cat-hero">
        <div class="cat-hero-frame">${icon}</div>
        <div>
          <h1>${esc(it.name)}</h1>
          ${it.plural && it.plural !== it.name ? `<p class="cat-plural">Plural: ${esc(it.plural)}</p>` : '<p class="cat-plural">&nbsp;</p>'}
          <p class="cat-status"><span class="pill st-${esc(e.status)}">${esc(status.label)}</span>${e.register ? ` <span class="cat-register">Register row ${esc(e.register)}</span>` : ''}</p>
        </div>
      </div>
    </div>
  </header>

  <main>
    <section class="band cat-original" aria-labelledby="orig-h">
      <div class="wrap cat-cols">
        <div>
          <h2 id="orig-h">In Tiny Speck’s game</h2>
          ${desc.length ? `<div class="cat-desc">${desc.map((d) => `<p>${d}</p>`).join('')}</div>` : '<p class="cat-muted">The game code gives it no description.</p>'}
${extras.length ? `          <ul class="cat-list cat-extras">\n${extras.map((x) => `            <li>${x}</li>`).join('\n')}\n          </ul>\n` : ''}${buffs.length ? `          <h3>Buffs</h3>\n          <ul class="cat-list">\n            ${buffs.join('\n            ')}\n          </ul>\n` : ''}${timers.length ? `          <h3>Quest timers</h3>\n          <ul class="cat-list">\n            ${timers.join('\n            ')}\n          </ul>\n` : ''}          <p class="cat-source">From <code>${esc(it.file)}</code> in Tiny Speck’s game code.</p>
        </div>
        <dl class="cat-facts">
          <dt>Category</dt><dd>${esc(e.category)}</dd>
          <dt>Base price</dt><dd>${it.baseCost ? `${fmt(it.baseCost)} currants` : 'None'}</dd>
          ${it.stackmax ? `<dt>Stacks to</dt><dd>${fmt(it.stackmax)}</dd>` : ''}
          <dt>Item id</dt><dd><code>${esc(it.id)}</code></dd>
          ${it.tags.length ? `<dt>Tags</dt><dd><ul class="note-tags">${it.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></dd>` : ''}
        </dl>
      </div>
    </section>

    <section class="band band-alt cat-remake" aria-labelledby="remake-h">
      <div class="wrap">
        <h2 id="remake-h">In the remake</h2>
        <div class="cat-remake-body">
          <p class="cat-status-text">${esc(STATUS_TEXT[e.status])}</p>${remakeBody}
        </div>
      </div>
    </section>
${verbs.length ? `
    <section class="band cat-verbs-band" aria-labelledby="verbs-h">
      <div class="wrap">
        <h2 id="verbs-h">Verbs</h2>
        <p class="section-lead">What the original let you do with it, with Tiny Speck’s tooltips.</p>
        <dl class="cat-verbs">
${verbs.map((v) => `          <div><dt>${esc(v.name)}</dt><dd>${v.tooltip ? esc(v.tooltip.replace(/\$[a-z_]+/g, '…')) : ''}</dd></div>`).join('\n')}
        </dl>
      </div>
    </section>
` : ''}
    <nav class="band band-alt note-after" aria-label="More items">
      <div class="wrap">
        <div class="note-pager">
          ${ctx.prev ? `<a class="note-pager-older" href="../${esc(ctx.prev.it.id)}/" rel="prev"><span>Previous</span>${esc(ctx.prev.it.name)}</a>` : '<span></span>'}
          ${ctx.next ? `<a class="note-pager-newer" href="../${esc(ctx.next.it.id)}/" rel="next"><span>Next</span>${esc(ctx.next.it.name)}</a>` : '<span></span>'}
        </div>
        <p class="note-all"><a href="../">All ${fmt(ctx.total)} items</a></p>
      </div>
    </nav>
  </main>
`;
  const plainDesc = plainText(it.desc);
  return shell({
    p,
    title: `${it.name} · Groddle Item Catalog`,
    description: `${plainDesc ? `${plainDesc.slice(0, 150)} ` : ''}${status.label}${e.status === 'source' ? '' : ' in the remake'}.`.trim(),
    body,
  });
}

/* -- Write / check -------------------------------------- */

const STATIC = new Set(['catalog.js', 'catalog.css']);

function strays(files) {
  const dir = join(pub, OUT);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => (d.isDirectory() ? !files[`${OUT}/${d.name}/index.html`] : !files[`${OUT}/${d.name}`] && !STATIC.has(d.name)))
    .map((d) => `${OUT}/${d.name}${d.isDirectory() ? '/' : ''}`);
}

export function staleFiles(files) {
  const stale = Object.entries(files)
    .filter(([path, html]) => !existsSync(join(pub, path)) || readFileSync(join(pub, path), 'utf8') !== html)
    .map(([path]) => path);
  return [...stale, ...strays(files)];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t0 = performance.now();
  const { files, data } = await buildCatalog();
  if (process.argv.includes('--check')) {
    const stale = staleFiles(files);
    if (stale.length) {
      console.error(`Item catalog is stale (${stale.length} files, e.g. ${stale.slice(0, 5).join(', ')}): run node tools/catalog/build.mjs`);
      process.exit(1);
    }
    console.log(`Item catalog is current (${Object.keys(files).length} files, ${Math.round(performance.now() - t0)} ms)`);
  } else {
    for (const path of strays(files)) rmSync(join(pub, path), { recursive: true });
    let wrote = 0;
    for (const [path, html] of Object.entries(files)) {
      const abs = join(pub, path);
      if (existsSync(abs) && readFileSync(abs, 'utf8') === html) continue;
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, html);
      wrote += 1;
    }
    const s = data.counts.byStatus;
    console.log(`${data.counts.listed} items (${s.source} in the remake, ${s.missing} not yet, ${s.lost} lost, ${s.unbuilt_original} never finished; ${data.counts.excluded} excluded left out), ${wrote} files written -> ${relative(root, join(pub, OUT))}/ (${Math.round(performance.now() - t0)} ms)`);
  }
}
