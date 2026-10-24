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

const TSID_LIT = /['"](L[A-Z0-9]{12,16})['"]/g;

/**
 * Every location TSID literal in one GSJS file, with what binds it:
 * [{ tsid, file, line, text, quest, key, env, instanceId, configVar, configKey }].
 *   quest/key/env  quests/<id>.js `var locations = { key: { dev_tsid, prod_tsid } }` (env prod|dev),
 *                  or another literal in a quest file (a template_tsid for instances_create_delayed)
 *   instanceId     the instance_id (or instances_create first argument) of the statement that uses
 *                  it, looked for on its own line and up to eight lines after (`var tsid = ...;
 *                  pc.events_add({ callback: 'instances_create_delayed', tsid: tsid, instance_id: 'x' })`)
 *   configVar/Key  config_prod.js: the top-level var and the key that holds it
 *                  (`paradise_locations` / `sky_plunge: {template_tsid: 'L...'}`)
 * The map catalogs (inc_data_maps*, inc_data_mapextras*) are skipped by readTsidRefs.
 */
export function tsidRefsFromText(rel, text) {
  const out = [];
  if (!text.includes("'L") && !text.includes('"L')) return out;
  const lines = text.split('\n');
  const quest = /(^|\/)quests\/([a-z_0-9]+)\.js$/.exec(rel)?.[2] || null;
  const isConfig = /(^|\/)config_[a-z]+\.js$/.test(rel);
  // Quest locations block.
  const locKeys = new Map();
  if (quest) {
    const at = text.search(/^var locations\s*=/m);
    const lit = at >= 0 ? literalFrom(text, at) : null;
    let obj = null;
    if (lit) { try { obj = literalToJson(lit); } catch { obj = null; } }
    for (const [key, v] of Object.entries(obj || {})) {
      if (v?.prod_tsid) locKeys.set(v.prod_tsid, { key, env: 'prod' });
      if (v?.dev_tsid && !locKeys.has(v.dev_tsid)) locKeys.set(v.dev_tsid, { key, env: 'dev' });
    }
  }
  let configVar = null;
  lines.forEach((line, i) => {
    if (isConfig) { const v = /^var ([A-Za-z_0-9]+)\s*=/.exec(line); if (v) configVar = v[1]; }
    if (/^\s*(\/\/|\*)/.test(line)) return;
    for (const m of line.matchAll(TSID_LIT)) {
      const tsid = m[1];
      const ref = { tsid, file: rel, line: i + 1, text: line.trim().slice(0, 200), quest, key: null, env: null, instanceId: null, configVar: null, configKey: null };
      const lk = locKeys.get(tsid);
      if (lk) Object.assign(ref, lk);
      for (let j = i; j < Math.min(lines.length, i + 9); j += 1) {
        if (j > i && /\bfunction\b/.test(lines[j])) break;
        const im = /instance_id\s*:\s*['"]([a-z_0-9]+)['"]/.exec(lines[j]) || /instances_create(?:_delayed)?\(\s*['"]([a-z_0-9]+)['"]/.exec(lines[j]);
        if (im) { ref.instanceId = im[1]; break; }
      }
      if (isConfig) {
        ref.configVar = configVar;
        const before = line.slice(0, m.index);
        const keys = [...before.matchAll(/['"]?([A-Za-z_0-9]+)['"]?\s*:/g)].map((k) => k[1]).filter((k) => !/^(template_tsid|tsid|locations|prod_tsid|dev_tsid)$/.test(k));
        if (keys.length) ref.configKey = keys[0];
        else {
          // A nested `tsid: 'L...'` line: the nearest less-indented `key: {` above it.
          const indent = /^\s*/.exec(line)[0].length;
          for (let j = i - 1; j >= 0 && j > i - 40; j -= 1) {
            const km = /^(\s*)['"]?([A-Za-z_0-9]+)['"]?\s*:\s*\{\s*$/.exec(lines[j]);
            if (km && km[1].length < indent) { ref.configKey = km[2]; break; }
            if (/^var /.test(lines[j])) break;
          }
        }
      }
      out.push(ref);
    }
  });
  return out;
}

/**
 * tsidRefsFromText over indexed GSJS files ([{ rel, text }]): Map tsid -> [ref]. A config ref also
 * carries `configQuests`: the quests/*.js files that look its key up (`config.newxp_locations['ezcooking_1']`).
 */
export function readTsidRefs(files) {
  const out = new Map();
  const lookups = new Map();
  for (const f of files) {
    const quest = /(^|\/)quests\/([a-z_0-9]+)\.js$/.exec(f.rel)?.[2];
    if (!quest) continue;
    for (const m of f.text.matchAll(/config\.([A-Za-z_0-9]+)(?:\[\s*['"]([A-Za-z_0-9]+)['"]\s*\]|\.([A-Za-z_0-9]+))/g)) {
      const k = `${m[1]}.${m[2] || m[3]}`;
      if (!lookups.has(k)) lookups.set(k, new Set());
      lookups.get(k).add(quest);
    }
  }
  for (const f of files) {
    if (/(^|\/)inc_data_map(s|extras)_/.test(f.rel)) continue;
    for (const r of tsidRefsFromText(f.rel, f.text)) {
      const q = r.configVar && r.configKey ? lookups.get(`${r.configVar}.${r.configKey}`) : null;
      if (q) r.configQuests = [...q].sort();
      if (!out.has(r.tsid)) out.set(r.tsid, []);
      out.get(r.tsid).push(r);
    }
  }
  return out;
}

/** items/catalog_recipes.js `this.recipes["<id>"] = {...}`: Map id -> { name, skills, tool }. */
export function readRecipes(gsjs) {
  const p = join(gsjs, 'items', 'catalog_recipes.js');
  const out = new Map();
  if (!existsSync(p)) return out;
  const text = read(p);
  for (const m of text.matchAll(/this\.recipes\["([^"]+)"\]\s*=\s*\{/g)) {
    const lit = literalFrom(text, m.index);
    let r = null;
    try { r = lit && literalToJson(lit); } catch { r = null; }
    if (r) out.set(m[1], { name: r.name || '', skills: [...(r.skills || []), ...(r.skill && !(r.skills || []).includes(r.skill) ? [r.skill] : [])], tool: r.tool || null });
  }
  return out;
}
