#!/usr/bin/env node
/**
 * Writes public/giants/data.json for the Giants entry in the Groddle Wiki
 * (/wiki/giants/, drawn by minn/groddle/src/Giants.php).
 *
 * Every word about a giant is Tiny Speck's, from GameServerJS (CC0):
 * - config_base.js `giants` (165-177) and `giants_info` (331-429): name,
 *   giant_of, desc, followers and personality, the fields the client's Giant
 *   screen showed (main.js 1806-1820, items/include/shrines.js 1239-1256).
 * - items/npc_shrine_<giant>.js `description`: the shrine's own text.
 * - items/emblem_<giant>.js and items/icon_<giant>.js `description`.
 * - achievements/first_<giant>_emblem.js `status_text` (what the giant says
 *   with your first emblem) and emblem_skill_unlock_<giant>_1.js (what
 *   spending that emblem unlocks).
 * - items/include/shrines.js `giant_tips` (6-18): the shrine's donation tips.
 * - The primary giant of each skill: inc_data_skills.js `giants`, through the
 *   remake's assets/content/skills.json.
 *
 * The remake's own figures: where its shrines stand (street-ecology.json
 * `giantId`, read from each archived street's "Shrine to <Giant>" object,
 * build-street-ecology.mjs 224-234, grouped by region with assets/maps), the
 * emblem cost (js/shrines.js), the Icon count (js/giant-icons.js) and the
 * card colour (js/shrines.js GIANTS).
 *
 * Art: the portraits are cut from Tiny Speck's Giants_All.ai
 * (tools/giants/portraits.py); emblems and Icons are the game's own icons.
 *
 *   node tools/giants/build-data.mjs          write data.json
 *   node tools/giants/build-data.mjs --check  exit 1 if data.json is stale
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { GIANTS, EMBLEM_FAVOR_COST, EMBLEM_FAVOR_INCREMENT, FAVOR_STUDY_SECONDS } from '../../public/js/shrines.js?v=fa059603';
import { GIANT_ICON_DATA, ICONIZE_COUNT } from '../../public/js/giant-icons.js?v=0d6b4965';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pub = join(root, 'public');
const out = join(pub, 'giants', 'data.json');
export const GSJS = process.env.GSJS || join(root, '..', 'glitch-GameServerJS');

/**
 * Tiny Speck's tips use em dashes; the site's copy has none, so the two that
 * do read with a comma and a colon here (the words are otherwise theirs).
 */
const TIP_DASHES = [
  ['skill learning — but', 'skill learning, but'],
  ['single game day — in fact', 'single game day: in fact'],
];

const src = (file) => readFileSync(join(GSJS, file), 'utf8');
const lineOf = (text, at) => text.slice(0, at).split('\n').length;
const tidy = (s) => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** A `var name = <literal>;` from a GSJS file, evaluated alone in an empty context, with its line. */
export function gsjsVar(file, name) {
  const text = src(file);
  const m = new RegExp(`^var ${name}\\s*=\\s*`, 'm').exec(text);
  if (!m) throw new Error(`${file}: no var ${name}`);
  const start = m.index + m[0].length;
  let end;
  if (text[start] === '"') {
    end = start + 1;
    while (text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
    end += 1;
  } else {
    const close = { '{': '}', '[': ']' }[text[start]];
    let depth = 0;
    let quote = null;
    for (end = start; end < text.length; end++) {
      const c = text[end];
      if (quote) {
        if (c === '\\') end++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === text[start]) depth++;
      else if (c === close && --depth === 0) { end++; break; }
    }
  }
  return { value: vm.runInNewContext(`(${text.slice(start, end)})`, Object.create(null)), line: lineOf(text, m.index) };
}

/** The line in config_base.js where a giant's giants_info entry opens. */
function infoLine(id) {
  const text = src('config_base.js');
  const from = text.indexOf('var giants_info');
  return lineOf(text, text.indexOf(`'${id}'`, from));
}

/** Street rows with a shrine, by giant: how many streets, and in which regions. */
function shrineStreets() {
  const ecology = JSON.parse(readFileSync(join(pub, 'assets/content/street-ecology.json'), 'utf8')).streets;
  const maps = JSON.parse(readFileSync(join(pub, 'assets/maps/index.json'), 'utf8'));
  const regionOf = {};
  for (const hub of Object.values(maps.hubs)) {
    const file = JSON.parse(readFileSync(join(pub, hub.file), 'utf8'));
    for (const s of file.streets || []) regionOf[s.tsid] = file.hubName;
  }
  const by = {};
  for (const [tsid, row] of Object.entries(ecology)) {
    if (!row.giantId) continue;
    const region = regionOf[`L${tsid.slice(1)}`] || regionOf[row.sourceTsid];
    if (!region) throw new Error(`shrine street ${tsid} (${row.label}) is in no region of assets/maps`);
    const g = (by[row.giantId] ??= { streets: 0, regions: {} });
    g.streets++;
    g.regions[region] = (g.regions[region] || 0) + 1;
  }
  return by;
}

/** Skill families (the name without its rank) whose primary giant this is. */
function primarySkills() {
  const skills = JSON.parse(readFileSync(join(pub, 'assets/content/skills.json'), 'utf8'));
  const by = {};
  for (const s of Array.isArray(skills) ? skills : Object.values(skills)) {
    for (const [g, rel] of Object.entries(s.giants || {})) {
      if (Number(rel.primary) === 1) (by[g] ??= new Set()).add(s.name.replace(/ [IVX]+$/, ''));
    }
  }
  return Object.fromEntries(Object.entries(by).map(([g, set]) => [g, [...set].sort((a, b) => a.localeCompare(b))]));
}

function art(path) {
  if (!existsSync(join(pub, path))) throw new Error(`no art at public/${path}`);
  return `/${path}`;
}

export function giantsData() {
  const ids = gsjsVar('config_base.js', 'giants').value;
  const info = gsjsVar('config_base.js', 'giants_info').value;
  const streets = shrineStreets();
  const skills = primarySkills();
  const giants = ids.map((id) => {
    const i = info[id];
    const remake = GIANTS[id];
    const icon = GIANT_ICON_DATA[id];
    if (!i || !remake || !icon) throw new Error(`${id}: missing from giants_info, js/shrines.js GIANTS or js/giant-icons-data.js`);
    const shrineFile = `items/npc_shrine_${id}.js`;
    const firstFile = `achievements/first_${id}_emblem.js`;
    const unlockFile = `achievements/emblem_skill_unlock_${id}_1.js`;
    const where = streets[id] || { streets: 0, regions: {} };
    const regions = Object.entries(where.regions).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return {
      id,
      name: i.name,
      giantOf: i.giant_of,
      desc: tidy(i.desc),
      followers: i.followers,
      personality: i.personality,
      color: remake.color,
      portrait: art(`assets/sprites/giant-portraits/${id}.webp`),
      shrine: { name: tidy(gsjsVar(shrineFile, 'name_single').value), text: tidy(gsjsVar(shrineFile, 'description').value) },
      emblem: { name: tidy(gsjsVar(`items/${icon.emblemClass}.js`, 'name_single').value), desc: tidy(gsjsVar(`items/${icon.emblemClass}.js`, 'description').value), art: art(`assets/sprites/icons/${icon.emblemClass}@3x.png`) },
      icon: { name: tidy(gsjsVar(`items/${icon.iconClass}.js`, 'name_single').value), desc: tidy(gsjsVar(`items/${icon.iconClass}.js`, 'description').value), art: art(`assets/sprites/icons/${icon.iconClass}@3x.png`) },
      firstEmblem: tidy(gsjsVar(firstFile, 'status_text').value),
      unlock: { name: tidy(gsjsVar(unlockFile, 'name').value), desc: tidy(gsjsVar(unlockFile, 'desc').value) },
      skills: skills[id] || [],
      remake: { streets: where.streets, regions: regions.length, among: regions.slice(0, 3).map(([r]) => r) },
      sources: [`config_base.js:${infoLine(id)}`, shrineFile, `items/${icon.emblemClass}.js`, `items/${icon.iconClass}.js`, firstFile, unlockFile],
    };
  });
  let tips = gsjsVar('items/include/shrines.js', 'giant_tips').value.map(tidy);
  for (const [from, to] of TIP_DASHES) tips = tips.map((t) => t.replace(from, to));
  const dashed = JSON.stringify({ giants, tips }).match(/.{0,30}—.{0,30}/);
  if (dashed) throw new Error(`an em dash in the copy: ${dashed[0]} (tools/giants/build-data.mjs TIP_DASHES)`);
  return {
    giants,
    tips,
    rules: { emblemCost: EMBLEM_FAVOR_COST, emblemStep: EMBLEM_FAVOR_INCREMENT, iconize: ICONIZE_COUNT, studySeconds: FAVOR_STUDY_SECONDS },
    counts: { giants: giants.length, shrineStreets: giants.reduce((n, g) => n + g.remake.streets, 0) },
  };
}

function main() {
  const body = JSON.stringify(giantsData(), null, 1) + '\n';
  const now = existsSync(out) ? readFileSync(out, 'utf8') : null;
  if (process.argv.includes('--check')) {
    if (now !== body) {
      console.log('public/giants/data.json is stale (node tools/giants/build-data.mjs)');
      process.exit(1);
    }
    return;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, body);
  const d = JSON.parse(body);
  console.log(`${d.counts.giants} giants, shrines on ${d.counts.shrineStreets} streets, ${d.tips.length} tips`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
