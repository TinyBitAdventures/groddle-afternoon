/**
 * Build the street projects ("jobs") catalog from Tiny Speck's GameServerJS and
 * archived location XML (both CC0).
 *
 *   node build-street-jobs.mjs
 *
 * Sources:
 *  - quests/job_*.js: the 200 job phase classes (type, requirements with
 *    bucket/group gating, base_cost, work energy/wear/skill, rewards and
 *    performance rewards)
 *  - streets/mnt/stos/location_data/L*.xml `<object id="jobs">`: which street
 *    each job builds or upgrades, the connecting street(s) whose Street Spirit
 *    offered it, the ordered phase list with labels and delays
 *  - inc_data_street_upgrades_prod.js: the upgrade trees (option names and
 *    descriptions); the template street geometry they point at is not in the
 *    public dump
 *  - items/catalog_drop_tables.js: street_creation_rewards_a and
 *    street_creation_trophies (the performance reward drop tables)
 *  - items/proto_*.js (the cultivation protos): classProps job_class_id is
 *    the Restore project a depleted cultivation offers (setJobData: one phase
 *    per class, delay_seconds 60) and item_class what it turns back into;
 *    written to `restorations` with their job classes in `classes`
 *
 * Writes public/assets/content/street-jobs.json. tools/job-obtainable.mjs
 * decides which item requirements a solo player can meet in the remake.
 * tools/retired-items.mjs turns requirements for retired items (Bricks,
 * Grade A and AAA Earth Blocks) into Urth Blocks at the rate each item's
 * onLoad replaceWith uses; the row keeps the source amount in `retired`.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { obtainableItems } from './tools/job-obtainable.mjs';
import { loadRetiredItems, retireRequirement } from './tools/retired-items.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const gsjs = process.env.GRODDLE_GSJS || '/Users/austin/Documents/glitch-audit/glitch-GameServerJS';
const locationRoot =
  process.env.GRODDLE_LOCATION_XML || '/Users/austin/Documents/glitch-audit/streets/mnt/stos/location_data';
const outputPath = join(root, 'public/assets/content/street-jobs.json');
const index = JSON.parse(await readFile(join(root, 'public/assets/streets/index.json'), 'utf8'));

const gTsid = (tsid) => (tsid && tsid.startsWith('L') ? `G${tsid.slice(1)}` : tsid);
const indexed = (tsid) => index.streets[gTsid(tsid)] || index.streets[tsid] || null;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ------------------------------------------------------------------ */
/* Job phase classes                                                    */
/* ------------------------------------------------------------------ */

const TEST_CLASSES = /^job_(myles_test|cw_test|justin_all_work_test|multi_phase_test|notes_as_requirements_test)/;

const retiredItems = {};

async function loadClasses() {
  const dir = join(gsjs, 'quests');
  const out = {};
  for (const file of (await readdir(dir)).filter((f) => /^job_.*\.js$/.test(f)).sort()) {
    const src = await readFile(join(dir, file), 'utf8');
    const ctx = {};
    // Only the data declarations matter; the generated functions call server APIs.
    vm.runInNewContext(src.replace(/^function [\s\S]*?^}/gm, ''), ctx);
    const id = file.slice(0, -3);
    let requirements = Object.entries(ctx.requirements || {}).map(([rid, r]) => ({
      id: rid,
      bucket: String(r.bucket_id || '1'),
      group: num(r.group_id) || 1,
      type: r.type,
      ...(r.class_id ? { classId: r.class_id } : {}),
      ...(r.class_ids ? { classIds: Object.values(r.class_ids) } : {}),
      ...(r.skill ? { skill: r.skill } : {}),
      num: num(r.num),
      baseCost: num(r.base_cost),
      ...(r.type === 'work' ? { energy: num(r.energy), wear: num(r.wear), verb: r.verb_name || 'work', verbPast: r.verb_past || 'worked' } : {}),
      desc: r.desc || '',
    }));
    const itemIds = requirements.filter((r) => r.type === 'item' && r.classId).map((r) => r.classId);
    Object.assign(retiredItems, await loadRetiredItems(gsjs, itemIds.filter((i) => !(i in retiredItems))));
    requirements = requirements.map((r) => retireRequirement(r, retiredItems));
    const rewards = ctx.rewards || {};
    const perf = ctx.performance_rewards || {};
    out[id] = {
      type: num(ctx.type),
      title: ctx.title || id,
      desc: ctx.desc || '',
      completion: ctx.completion || '',
      ...(num(ctx.duration) ? { duration: num(ctx.duration) } : {}),
      ...(num(ctx.claimable) ? { claimable: 1 } : {}),
      requirements,
      rewards: {
        ...(rewards.xp ? { xp: num(rewards.xp) } : {}),
        ...(rewards.currants ? { currants: num(rewards.currants) } : {}),
        ...(rewards.mood ? { mood: num(rewards.mood) } : {}),
        ...(rewards.energy ? { energy: num(rewards.energy) } : {}),
        ...(rewards.favor ? { favor: Object.values(rewards.favor).map((f) => ({ giant: f.giant, points: num(f.points) })) } : {}),
      },
      performance: {
        ...(perf.xp ? { xp: num(perf.xp) } : {}),
        ...(perf.mood ? { mood: num(perf.mood) } : {}),
        ...(perf.energy ? { energy: num(perf.energy) } : {}),
        ...(perf.drop_table ? { dropTables: dropTablesIn(src) } : {}),
      },
      performancePercent: num(ctx.performance_percent),
      performanceCutoff: num(ctx.performance_cutoff),
    };
  }
  return out;
}

function dropTablesIn(src) {
  return [...src.matchAll(/runDropTable\("([a-z0-9_]+)"\)/g)].map((m) => m[1]);
}

/* ------------------------------------------------------------------ */
/* Drop tables                                                          */
/* ------------------------------------------------------------------ */

async function loadDropTables(ids) {
  const src = await readFile(join(gsjs, 'items/catalog_drop_tables.js'), 'utf8');
  const tables = vm.runInNewContext(`${src}; drop_tables;`, {});
  const out = {};
  for (const id of ids) {
    const table = tables[id];
    if (!table) continue;
    out[id] = {
      name: table.name,
      drops: Object.entries(table.drops)
        .map(([chance, rows]) => [Number(chance), rows.map((row) => ({ ...row }))])
        .sort((a, b) => a[0] - b[0]),
    };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Street upgrade trees                                                 */
/* ------------------------------------------------------------------ */

async function loadUpgradeTrees() {
  const src = await readFile(join(gsjs, 'inc_data_street_upgrades_prod.js'), 'utf8');
  return vm.runInNewContext(`${src}; street_upgrades;`, {});
}

/* ------------------------------------------------------------------ */
/* Location XML                                                         */
/* ------------------------------------------------------------------ */

function xmlValue(node) {
  // node: { tag, attrs, children, text }
  if (node.tag === 'object' || node.tag === 'objects') {
    const out = {};
    for (const child of node.children) out[child.attrs.id] = xmlValue(child);
    return out;
  }
  if (node.tag === 'objref') return { objref: node.attrs.tsid, label: node.attrs.label || '' };
  if (node.tag === 'int') return num(node.text);
  if (node.tag === 'bool') return node.text.trim() === 'true';
  return node.text;
}

/** Tiny parser for the regular <object>/<str>/<int>/<bool>/<objref> dumps. */
function parseBlock(xml) {
  const stack = [{ tag: 'root', attrs: {}, children: [], text: '' }];
  const re = /<(\/?)([a-z]+)((?:\s+[a-z_]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[5] !== undefined) {
      stack[stack.length - 1].text += m[5];
      continue;
    }
    const [, close, tag, attrText, selfClose] = m;
    if (close) {
      const node = stack.pop();
      stack[stack.length - 1].children.push(node);
      continue;
    }
    const attrs = {};
    for (const a of attrText.matchAll(/([a-z_]+)="([^"]*)"/g)) attrs[a[1]] = a[2].replace(/&amp;/g, '&').replace(/&apos;/g, "'");
    const node = { tag, attrs, children: [], text: '' };
    if (selfClose) stack[stack.length - 1].children.push(node);
    else stack.push(node);
  }
  return stack[0].children[0];
}

function extractObject(xml, id) {
  const start = xml.indexOf(`<object id="${id}">`);
  if (start < 0) return null;
  let depth = 0;
  const re = /<(\/?)object\b[^>]*?(\/?)>/g;
  re.lastIndex = start;
  let m;
  while ((m = re.exec(xml))) {
    if (m[2]) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return xml.slice(start, re.lastIndex);
  }
  return null;
}

function scalar(xml, id, tag = '(?:int|str|bool)') {
  const m = xml.match(new RegExp(`<${tag} id="${id}">([^<]*)<`));
  return m ? m[1] : null;
}

async function loadLocationJobs() {
  const rows = [];
  for (const file of (await readdir(locationRoot)).filter((f) => f.endsWith('.xml')).sort()) {
    const xml = await readFile(join(locationRoot, file), 'utf8');
    if (!xml.includes('<object id="jobs">')) continue;
    const block = extractObject(xml, 'jobs');
    if (!block) continue;
    rows.push({
      tsid: file.slice(0, -4),
      jobs: xmlValue(parseBlock(block)),
      upgradeLevel: scalar(xml, 'upgrade_level') == null ? null : num(scalar(xml, 'upgrade_level')),
      upgradeTemplate: scalar(xml, 'upgrade_template'),
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Assemble                                                             */
/* ------------------------------------------------------------------ */

const classes = await loadClasses();
const trees = await loadUpgradeTrees();
const locations = await loadLocationJobs();
const { items: obtainable, tools: heldTools } = await obtainableItems();

// Class exclusion reasons (the rest are playable when their items are obtainable).
for (const [id, def] of Object.entries(classes)) {
  def.blockers = [...new Set(def.requirements
    .filter((r) => r.type === 'item' && r.classId && !obtainable.has(r.classId))
    .map((r) => r.classId))];
  def.hireOnly = [...new Set(def.requirements
    .filter((r) => r.type === 'work' && !(r.classIds || [r.classId]).some((tool) => heldTools.has(tool)))
    .map((r) => r.classId))];
  if (TEST_CLASSES.test(id)) def.excluded = 'developer test job';
  else if (def.type === 3 || def.type === 4) def.excluded = 'group hall: needs a player group to claim and own the hall';
  else if (def.type === 5) def.excluded = 'cultivation restoration: offered by a depleted home or proto item, not a street board';
  else if (def.type === 6) def.excluded = 'item upgrade: offered by an upgradeable item, not a street';
}

// Group every job id's per-location rows.
const byJobId = new Map();
for (const loc of locations) {
  for (const [jobId, job] of Object.entries(loc.jobs || {})) {
    if (!byJobId.has(jobId)) byJobId.set(jobId, []);
    byJobId.get(jobId).push({ loc, job });
  }
}

const upgradeNodeByTemplate = new Map();
for (const [tree, nodes] of Object.entries(trees)) {
  for (const [nodeId, node] of Object.entries(nodes)) upgradeNodeByTemplate.set(node.tsid, { tree, nodeId, node });
}

const jobs = {};
const byStreet = {};
const upgrades = {};
const excludedJobs = {};
const offer = (street, jobId) => {
  const key = gTsid(street);
  (byStreet[key] ||= []).includes(jobId) || byStreet[key].push(jobId);
};
const upgradeLevelOf = (classId) => {
  const m = classId.match(/^job_(?:standard(\d)_for_street_upgrades|street_upgrade_(\d))$/);
  return m ? Number(m[1] || m[2]) : null;
};

for (const [jobId, rows] of byJobId) {
  const primary = rows.find((r) => r.job.street_info?.type === 1);
  if (!primary) continue;
  const info = primary.job.street_info;
  const phases = Object.entries(primary.job.class_ids || {})
    .map(([classTsid, p]) => ({
      classTsid,
      order: num(p.in_order) || 1,
      delaySeconds: num(p.delay_seconds),
      ...(p.delay_text ? { delayText: p.delay_text } : {}),
      label: p.label || '',
    }))
    .sort((a, b) => a.order - b.order);
  if (!phases.length) continue;
  const first = classes[phases[0].classTsid];
  if (!first) continue;
  const street = gTsid(primary.loc.tsid);
  const meta = indexed(street);
  const base = { street, label: meta?.label || street, hub: meta?.hubName || '', hubId: meta?.hubId || '' };
  const reasonOf = () => {
    if (info.is_hidden === 1) return 'hidden in the source (never offered)';
    if (!meta) return 'street not in the imported world';
    const classReason = phases.map((p) => classes[p.classTsid]?.excluded).find(Boolean);
    if (classReason) return classReason;
    const blockers = [...new Set(phases.flatMap((p) => classes[p.classTsid]?.blockers || []))];
    if (blockers.length) return `needs items the remake cannot make yet: ${blockers.join(', ')}`;
    return '';
  };

  if (first.type === 1) {
    // New street: offered on the connecting streets (street_info.type 2 rows).
    const connecting = [
      ...new Set([
        ...rows.filter((r) => r.job.street_info?.type === 2).map((r) => gTsid(r.loc.tsid)),
        ...Object.values(info.connecting_streets || {}).map(gTsid),
      ]),
    ].filter((tsid) => indexed(tsid));
    const reason = reasonOf() || (connecting.length ? '' : 'no imported connecting street to offer it');
    if (reason) {
      excludedJobs[jobId] = { kind: 'street', ...base, reason };
      continue;
    }
    jobs[jobId] = {
      kind: 'street',
      ...base,
      connecting,
      title: info.title_override || `Build ${base.label}`,
      desc: info.desc_override || '',
      phases,
    };
    for (const tsid of connecting) offer(tsid, jobId);
  } else if (first.type === 2) {
    // Street upgrade: offered on the street itself. Only the next level is open.
    const level = upgradeLevelOf(phases[0].classTsid);
    const current = upgradeNodeByTemplate.get(primary.loc.upgradeTemplate || '');
    let reason = reasonOf();
    if (!reason && primary.loc.upgradeLevel == null) reason = 'street has no recorded upgrade level';
    if (!reason && level !== primary.loc.upgradeLevel + 1) {
      reason = level <= primary.loc.upgradeLevel ? `already upgraded to level ${primary.loc.upgradeLevel} in the source` : 'a lower upgrade level comes first';
    }
    const options = current ? Object.values(current.node.children || {}).map((id) => ({ id, ...trees[current.tree][id] })) : [];
    if (!reason && !options.length) reason = 'street is at the top of its upgrade tree';
    if (reason) {
      excludedJobs[jobId] = { kind: 'upgrade', ...base, reason };
      continue;
    }
    upgrades[street] = {
      tree: current.tree,
      level: primary.loc.upgradeLevel,
      current: { id: current.nodeId, name: current.node.name, desc: current.node.description, level: current.node.level },
      options: options.map((o) => ({ id: o.id, name: o.name, desc: o.description, level: o.level, template: o.tsid })),
    };
    jobs[jobId] = {
      kind: 'upgrade',
      ...base,
      title: `Upgrade ${base.label} To Level ${level}`,
      desc: `Upgrade ${base.label} from ${current.node.name} to one of ${options.length} new looks.`,
      phases,
    };
    offer(street, jobId);
  } else if (first.type === 5) {
    // An archived public street's depleted proto (adminRecultivateItems made street patches
    // cultivations). The proto item and its spot are in the items dump, not the public XML.
    excludedJobs[jobId] = { kind: 'type5', ...base, reason: 'public-street cultivation proto: its item and spot are not in the public dump (home restorations are playable)' };
  } else {
    excludedJobs[jobId] = { kind: `type${first.type}`, ...base, reason: first.excluded || 'not a street project' };
  }
}

// Keep the per-street offer order stable: ascending job id like the source hash.
for (const list of Object.values(byStreet)) list.sort((a, b) => num(a) - num(b));

const usedClasses = new Set(Object.values(jobs).flatMap((j) => j.phases.map((p) => p.classTsid)));

/* ------------------------------------------------------------------ */
/* Cultivation restorations (items/proto_*.js)                          */
/* ------------------------------------------------------------------ */

/** locations/inc_cultivation.js cultivation_classes, minus the Tower (js/home-tower.js runs it). */
const CULTIVATION_PROTOS = [
  'proto_jellisac_mound', 'proto_barnacle_pod', 'proto_firefly_hive',
  'proto_crop_garden_small', 'proto_crop_garden_medium', 'proto_crop_garden_large',
  'proto_herb_garden_small', 'proto_herb_garden_medium', 'proto_herb_garden_large',
  'proto_patch', 'proto_dullite_rock', 'proto_beryl_rock', 'proto_sparkly_rock', 'proto_metal_rock',
  'proto_dirt_pile', 'proto_peat',
];
const restorations = {};
const restoreClasses = new Set();
for (const proto of CULTIVATION_PROTOS) {
  const src = await readFile(join(gsjs, 'items', `${proto}.js`), 'utf8');
  const prop = (key) => src.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`))?.[1] || '';
  const ids = prop('job_class_id').split(',').map((id) => id.trim()).filter(Boolean);
  if (!ids.length || ids.some((id) => !classes[id])) throw new Error(`${proto}: restore job ${ids.join(',')} missing`);
  const label = src.match(/^var label = "([^"]*)";/m)?.[1] || proto;
  for (const id of ids) restoreClasses.add(id);
  const blockers = [...new Set(ids.flatMap((id) => classes[id].blockers))];
  restorations[proto] = {
    label,
    endItems: prop('item_class').split(',').map((id) => id.trim()).filter(Boolean),
    // setJobData: in_order 1..n, delay_seconds 60 for every class.
    phases: ids.map((classTsid, i) => ({ classTsid, order: i + 1, delaySeconds: 60, label: classes[classTsid].title })),
    removeDropTable: src.match(/runDropTable\('([a-z0-9_]+)'/)?.[1] || '',
    ...(blockers.length ? { blockers } : {}),
  };
}
const dropIds = [...new Set(Object.values(classes).flatMap((c) => c.performance.dropTables || []))];
const drops = await loadDropTables(dropIds);

// Item text for reward items the remake may not know yet (trophy pieces etc.).
async function itemMeta(id) {
  try {
    const src = await readFile(join(gsjs, 'items', `${id}.js`), 'utf8');
    const str = (name) => src.match(new RegExp(`^var ${name} = "((?:[^"\\\\]|\\\\.)*)";`, 'm'))?.[1]?.replace(/\\(["/])/g, '$1') || '';
    const n = (name) => num(src.match(new RegExp(`^var ${name} = (\\d+);`, 'm'))?.[1]);
    return { label: str('label') || str('name_single'), namePlural: str('name_plural'), desc: str('description'), baseCost: n('base_cost'), stackMax: n('stackmax') || 1 };
  } catch {
    return null;
  }
}
const items = {};
const rewardItemIds = new Set();
for (const table of Object.values(drops)) for (const [, rows] of table.drops) for (const row of rows) if (row.class_id) rewardItemIds.add(row.class_id);
for (const family of ['wood', 'earth', 'rock', 'dirt']) rewardItemIds.add(`trophy_street_creator_${family}`);
for (const id of [...rewardItemIds].sort()) {
  const meta = await itemMeta(id);
  if (meta) items[id] = meta;
}

const reasonCounts = {};
for (const row of Object.values(excludedJobs)) {
  const key = row.reason.startsWith('needs items') ? 'needs items the remake cannot make yet' : row.reason;
  reasonCounts[key] = (reasonCounts[key] || 0) + 1;
}
const classReasons = {};
for (const [id, def] of Object.entries(classes)) {
  if (usedClasses.has(id) || restoreClasses.has(id)) continue;
  const key = def.excluded || (def.blockers.length ? 'needs items the remake cannot make yet' : 'not attached to an imported street project');
  classReasons[key] = (classReasons[key] || 0) + 1;
}

const catalog = {
  source: 'tinyspeck/glitch-GameServerJS quests/job_*.js + glitch-locations location XML jobs (CC0)',
  counts: {
    classes: Object.keys(classes).length,
    playableClasses: usedClasses.size,
    excludedClasses: classReasons,
    sourceJobs: byJobId.size,
    playableJobs: Object.keys(jobs).length,
    streetJobs: Object.values(jobs).filter((j) => j.kind === 'street').length,
    upgradeJobs: Object.values(jobs).filter((j) => j.kind === 'upgrade').length,
    excludedJobs: reasonCounts,
    offeringStreets: Object.keys(byStreet).length,
    restorationClasses: restoreClasses.size,
    playableRestorations: Object.values(restorations).filter((r) => !r.blockers).length,
    restorations: Object.keys(restorations).length,
  },
  classes: Object.fromEntries(Object.entries(classes).filter(([id]) => usedClasses.has(id) || restoreClasses.has(id))),
  restorations,
  jobs,
  byStreet,
  upgrades,
  drops,
  items,
  excluded: excludedJobs,
};

await writeFile(outputPath, `${JSON.stringify(catalog)}\n`);
console.log(JSON.stringify(catalog.counts, null, 2));
