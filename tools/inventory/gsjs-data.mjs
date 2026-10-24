/**
 * Text readers for the original GameServerJS (and eleven-gsjs), for
 * tools/inventory/build.mjs. Every file is read as text and parsed with
 * regexes or tools/subway-source.mjs literalToJson; nothing is evaluated.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { literalToJson } from '../subway-source.mjs';

const read = (p) => readFileSync(p, 'utf8');

/** The object/array literal starting at the first `open` after `at`, by depth outside strings and comments. */
export function literalFrom(text, at, open = '{') {
  const close = open === '{' ? '}' : ']';
  const start = text.indexOf(open, at);
  if (start < 0) return null;
  let depth = 0;
  let quote = '';
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '/' && text[i + 1] === '/') i = text.indexOf('\n', i) - 1;
    else if (c === '/' && text[i + 1] === '*') i = text.indexOf('*/', i) + 1;
    else if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function scalarVar(text, name) {
  const m = new RegExp(`^var ${name}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|[^;\\n]+)`, 'm').exec(text);
  if (!m) return undefined;
  const raw = m[1].trim();
  if (raw.startsWith('"') || raw.startsWith("'")) {
    try { return JSON.parse(raw.startsWith("'") ? `"${raw.slice(1, -1).replace(/"/g, '\\"')}"` : raw); } catch { return raw.slice(1, -1); }
  }
  return raw;
}

function literalVar(text, name, open = '{') {
  const at = text.search(new RegExp(`^var ${name}\\s*=`, 'm'));
  if (at < 0) return null;
  const lit = literalFrom(text, at, open);
  if (!lit) return null;
  try { return literalToJson(lit); } catch { return null; }
}

/** GSJS achievements/*.js: [{ id, name, desc, category, isSecret, conditions: [{ type, group, name, num }] }]. */
export function readAchievements(gsjs) {
  const dir = join(gsjs, 'achievements');
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
    const id = basename(f, '.js');
    if (id === 'catalog' || id.startsWith('inc_')) continue;
    const text = read(join(dir, f));
    const conds = literalVar(text, 'conditions') || {};
    out.push({
      id,
      name: scalarVar(text, 'name') || id,
      desc: scalarVar(text, 'desc') || '',
      category: scalarVar(text, 'category') || '',
      isSecret: scalarVar(text, 'is_secret') === '1',
      collectionType: Number(scalarVar(text, 'collection_type') || 0),
      conditions: Object.entries(conds).map(([cid, c]) => ({
        id: cid, type: c.type, group: c.group || '', name: c.label ?? c.name ?? '', num: Number(c.value) || 0,
      })),
    });
  }
  return out;
}

/** GSJS items/*.js: [{ id, label, tags, parents, takeable, hidden, proxy, verbs, include }]. */
export function readItems(gsjs, tagIndex = null) {
  const dir = join(gsjs, 'items');
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
    const id = basename(f, '.js');
    const text = read(join(dir, f));
    const parents = literalVar(text, 'parent_classes', '[') || [];
    const tags = literalVar(text, 'tags', '[') || [];
    const verbs = [...new Set([...text.matchAll(/^verbs\.([a-z_0-9]+)\s*=/gm)].map((m) => m[1]))];
    const include = (/^\/\/#include (.*)$/m.exec(text)?.[1] || '').split(',').map((s) => s.trim()).filter(Boolean);
    out.push({
      id,
      label: scalarVar(text, 'label') || id,
      tags: [...tags, ...(tagIndex?.get(id) || [])],
      parents,
      takeable: parents.includes('takeable') || include.some((i) => /takeable/.test(i)),
      hidden: scalarVar(text, 'is_hidden') === 'true',
      // `var proxy_item = "npc_shrine_alph"`: a variant that runs as another class (regional shrines).
      proxy: scalarVar(text, 'proxy_item') || null,
      verbs,
      include,
    });
  }
  return out;
}

/** items/catalog_tags.js item_tags: Map item -> [tags]. */
export function readItemTags(gsjs) {
  const p = join(gsjs, 'items/catalog_tags.js');
  const out = new Map();
  if (!existsSync(p)) return out;
  const tags = literalVar(read(p), 'item_tags') || {};
  for (const [tag, list] of Object.entries(tags)) for (const id of list) {
    if (!out.has(id)) out.set(id, []);
    out.get(id).push(tag);
  }
  return out;
}

/** inc_data_skills.js: [{ id, name, level, reqSkills, reqAchievements, reqQuests, reqUpgrades, questId }]. */
export function readSkills(gsjs) {
  const text = read(join(gsjs, 'inc_data_skills.js'));
  const out = [];
  for (const m of text.matchAll(/^function skills_get_([a-z_0-9]+)\(\)\{/gm)) {
    const lit = literalFrom(text, m.index + m[0].length, '{');
    let d = {};
    try { d = literalToJson(lit); } catch { /* keep the id */ }
    out.push({
      id: m[1], name: d.name || m[1], level: d.level, reqSkills: d.req_skills || [], reqAchievements: d.req_achievements || [],
      reqQuests: d.req_quests || [], reqUpgrades: d.req_upgrades || [], questId: d.quest_id || '', requiresLevel: Number(d.requires_level) || 0,
    });
  }
  return out;
}

/** items/catalog_buffs.js top-level keys. */
export function readBuffIds(gsjs) {
  const text = read(join(gsjs, 'items/catalog_buffs.js'));
  return [...text.matchAll(/^\t"([a-z_0-9]+)"\s*: \{/gm)].map((m) => m[1]);
}

/** quests/*.js ids. */
export function readQuestIds(gsjs) {
  return readdirSync(join(gsjs, 'quests')).filter((f) => f.endsWith('.js')).map((f) => basename(f, '.js')).sort();
}

/** config_prod.js top-level `var` names. */
export function readConfigKeys(gsjs) {
  return [...read(join(gsjs, 'config_prod.js')).matchAll(/^var ([A-Za-z_0-9]+)\s*=/gm)].map((m) => m[1]);
}

/**
 * inc_data_maps_prod.js maps_get_streets(): [{ tsid, name, hubId, hubName, moteId }]
 * and the hub names from maps_get_hubs().
 */
export function readMapStreets(gsjs) {
  const text = read(join(gsjs, 'inc_data_maps_prod.js'));
  const hubNames = {};
  for (const m of text.matchAll(/function maps_get_hubs_(\d+)\(\)\{\s*return \{\s*"name"\s*: "([^"]*)"/g)) hubNames[m[1]] = m[2];
  const at = text.indexOf('function maps_get_streets(){');
  const body = text.slice(at);
  const out = [];
  const seen = new Set();
  let mote = null;
  let hub = null;
  for (const line of body.split('\n')) {
    const mm = /function maps_get_streets_(\d+)\(\)/.exec(line);
    if (mm) mote = mm[1];
    const hm = /^\t\t\t"(\d+)"\t*: \{/.exec(line);
    if (hm) hub = hm[1];
    const sm = /^\t\t\t\t"([A-Z0-9]+)"\t*: "((?:[^"\\]|\\.)*)"/.exec(line);
    if (sm && !seen.has(sm[1])) {
      seen.add(sm[1]);
      out.push({ tsid: sm[1], name: sm[2].replace(/\\(.)/g, '$1'), hubId: hub, hubName: hubNames[hub] || '', moteId: mote });
    }
  }
  return out;
}

/** File names (without .js) of a GSJS folder, filtered. */
export function listNames(gsjs, folder, re = /\.js$/) {
  const dir = join(gsjs, folder);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => re.test(f)).map((f) => f.replace(/\.js$/, '')).sort();
}
