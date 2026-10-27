/**
 * Furniture upgrades (register G358): the style variants each furniture class
 * could carry in the source, with their art, written as
 * public/js/furniture-upgrades-data.js.
 *
 * Source (tinyspeck/glitch-GameServerJS and glitch-items, CC0):
 * - items/catalog_furniture.js        every upgrade per class: name, swf,
 *                                     credits_cost (0 = free), subscriber_only,
 *                                     is_visible, is_new, config, plats
 * - items/furniture_*.js              can_revert_to_base (getUpgrades adds the
 *                                     plain piece as upgrade 0 when it is 1)
 * - glitch-items/furniture/<class>/<class>_<name>.swf
 *                                     the art (catalog swf URL minus its upload stamp)
 *
 * Steps (run from the spike root):
 *   node tools/furniture-upgrades/build.mjs            plan.json + the data module
 *   python3 -I tools/furniture-upgrades/render.py      renders plan.json to
 *                                                      public/assets/sprites/furniture/upgrades/
 *                                                      and records sizes in art.json
 *   node tools/furniture-upgrades/build.mjs            again, to pick the sizes up
 *   node tools/furniture-upgrades/build.mjs --check    exit 1 when the data module,
 *                                                      plan or art is stale or missing
 *
 * Left out (written into the data module's LEFT_OUT):
 * - furniture_door: the door's look follows its role (up / down / building a
 *   floor) through the SWF's config; a single frame export cannot show that.
 * - furniture_chassis / furniture_tower_chassis: the house itself ("Change
 *   House"), not a piece in the room.
 * - classes the remake does not place (the 2012-01 furniture_wallcabinet,
 *   _shortcabinet, _smallcabinet, _largecabinet and furniture_snap_frame).
 */

import vm from 'node:vm';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadItem } from '../../build-recipes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const AUDIT = join(process.env.HOME || '', 'Documents/glitch-audit');
const GSJS = process.env.GLITCH_GSJS || join(AUDIT, 'glitch-GameServerJS');
const ITEMS = process.env.GLITCH_ITEMS || join(AUDIT, 'glitch-items/furniture');
const OUT = join(root, 'public/js/furniture-upgrades-data.js');
const PLAN = join(here, 'plan.json');
const ART = join(here, 'art.json');
const ART_DIR = 'assets/sprites/furniture/upgrades';

const LEFT_OUT = {
  furniture_door: "The door's look follows its role (up, down, building a floor) through the SWF's config.",
  furniture_chassis: 'The house itself (Change House), not a piece in the room.',
  furniture_tower_chassis: 'The Tower itself, not a piece in the room.',
};

function loadCatalog() {
  const ctx = {};
  vm.runInNewContext(
    `${readFileSync(join(GSJS, 'items/catalog_furniture.js'), 'utf8')}\n` +
      'var o = { furniture: {} }; for (var k in this) if (/^add_furniture_/.test(k)) this[k].call(o); this.out = o.furniture;',
    ctx,
    { filename: 'catalog_furniture.js', timeout: 5000 },
  );
  return ctx.out;
}

function swfIndex() {
  const out = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isDirectory()) walk(p);
      else if (name.name.endsWith('.swf')) out.set(name.name, p);
    }
  };
  walk(ITEMS);
  return out;
}

/** The catalog swf URL's file name without its upload stamp: 1343239350-furniture_chair_x.swf -> furniture_chair_x.swf */
function swfName(url) {
  return String(url || '').split('/').pop().replace(/^\d+-/, '');
}

/**
 * Height above the foot where tabletop decor rests on an upgraded piece: the
 * highest catalog plat that spans the piece's middle (x 0), else the longest.
 * Plats are relative to the piece's foot (applyUpgrade adds item x / y).
 */
function surfaceFrom(plats) {
  const rows = Object.values(plats || {}).filter((p) => p?.start && p?.end);
  if (!rows.length) return null;
  const mid = rows.filter((p) => Math.min(p.start.x, p.end.x) <= 0 && Math.max(p.start.x, p.end.x) >= 0);
  const pick = (mid.length ? mid : rows).reduce((best, p) => {
    const y = -Math.min(p.start.y, p.end.y);
    return !best || y > best.y ? { y, len: Math.abs(p.end.x - p.start.x) } : best;
  }, null);
  return pick && pick.y > 0 ? Math.round(pick.y) : null;
}

async function remakeClasses() {
  const mod = await import(join(root, 'public/js/homes-catalog.js'));
  return mod.FURNITURE_CATALOG;
}

export async function build() {
  const catalog = loadCatalog();
  const remake = await remakeClasses();
  const swfs = swfIndex();
  const art = existsSync(ART) ? JSON.parse(readFileSync(ART, 'utf8')) : {};
  const plan = {};
  const classes = {};
  const counts = { classes: 0, upgrades: 0, free: 0, paid: 0, hidden: 0, withArt: 0 };
  const missingArt = [];
  const leftOut = {};
  for (const [cls, ups] of Object.entries(catalog)) {
    if (!Object.keys(ups).length) continue;
    if (LEFT_OUT[cls]) {
      leftOut[cls] = { upgrades: Object.keys(ups).length, why: LEFT_OUT[cls] };
      continue;
    }
    if (!remake[cls]) {
      leftOut[cls] = { upgrades: Object.keys(ups).length, why: 'The remake does not place this class.' };
      continue;
    }
    const item = loadItem(cls, GSJS);
    const canRevert = String(item?.classProps?.can_revert_to_base ?? '0') === '1';
    const rows = {};
    for (const id of Object.keys(ups).sort((a, b) => Number(a) - Number(b))) {
      const u = ups[id];
      const key = `${cls}/${id}`;
      const swf = swfs.get(swfName(u.swf));
      if (swf) plan[key] = { swf: swf.replace(process.env.HOME, '~') };
      const a = art[key];
      const row = {
        name: u.name,
        credits: Number(u.credits_cost) || 0,
        visible: Boolean(u.is_visible),
      };
      if (u.subscriber_only) row.subscriberOnly = true;
      if (u.is_new) row.isNew = true;
      const surface = surfaceFrom(u.plats);
      if (surface) row.platY = surface;
      if (a && swf) {
        row.art = { path: `${ART_DIR}/${cls}/${id}@2x.webp`, w: a.w, h: a.h };
        counts.withArt += 1;
      } else {
        missingArt.push({ key, swf: swfName(u.swf), why: swf ? 'not rendered yet' : 'no SWF in glitch-items' });
      }
      rows[id] = row;
      counts.upgrades += 1;
      if (row.credits) counts.paid += 1;
      else counts.free += 1;
      if (!row.visible) counts.hidden += 1;
    }
    classes[cls] = { canRevert, upgrades: rows };
    counts.classes += 1;
  }
  return { classes, plan, counts, missingArt, leftOut };
}

function render({ classes, counts, missingArt, leftOut }) {
  const json = (v) => JSON.stringify(v, null, 1);
  return `/**
 * Generated by tools/furniture-upgrades/build.mjs from glitch-GameServerJS
 * items/catalog_furniture.js and the glitch-items furniture SWFs (CC0). Do not
 * edit by hand.
 *
 * FURNITURE_UPGRADES[class] = { canRevert, upgrades: { [upgrade_id]: row } }
 *   row.name / credits (0 = free) / visible / subscriberOnly / isNew are the
 *   catalog's name, credits_cost, is_visible, subscriber_only, is_new;
 *   row.platY is the highest catalog plat over the piece's middle (where
 *   tabletop decor rests), row.art the rendered frame ({ path, w, h } at 1x).
 */

export const FURNITURE_UPGRADES = Object.freeze(${json(classes)});

export const FURNITURE_UPGRADE_COUNTS = Object.freeze(${json(counts)});

/** Upgrades with no art (blocked), by "<class>/<id>". */
export const FURNITURE_UPGRADES_MISSING_ART = Object.freeze(${json(missingArt)});

/** Classes whose upgrades the remake does not offer, and why. */
export const FURNITURE_UPGRADES_LEFT_OUT = Object.freeze(${json(leftOut)});
`;
}

async function main() {
  const check = process.argv.includes('--check');
  if (!existsSync(GSJS) || !existsSync(ITEMS)) {
    console.log(`skip: ${existsSync(GSJS) ? ITEMS : GSJS} not found`);
    return;
  }
  const result = await build();
  const text = render(result);
  const planText = `${JSON.stringify(result.plan, null, 1)}\n`;
  if (check) {
    const problems = [];
    if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== text) problems.push(`${relative(root, OUT)} is stale: run node tools/furniture-upgrades/build.mjs`);
    if (!existsSync(PLAN) || readFileSync(PLAN, 'utf8') !== planText) problems.push(`${relative(root, PLAN)} is stale`);
    for (const [cls, c] of Object.entries(result.classes)) {
      for (const [id, row] of Object.entries(c.upgrades)) {
        if (row.art && !existsSync(join(root, 'public', row.art.path))) problems.push(`missing ${row.art.path}`);
        if (!row.art && result.plan[`${cls}/${id}`]) problems.push(`${cls}/${id} has a SWF but no art: run render.py`);
      }
    }
    if (problems.length) {
      console.error(problems.slice(0, 20).join('\n'));
      process.exit(1);
    }
    console.log(`ok: ${result.counts.upgrades} upgrades in ${result.counts.classes} classes, ${result.counts.withArt} with art`);
    return;
  }
  writeFileSync(PLAN, planText);
  writeFileSync(OUT, text);
  console.log(JSON.stringify(result.counts), `missing art ${result.missingArt.length}`, `left out ${Object.keys(result.leftOut).join(', ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
