/**
 * Retired items in Tiny Speck's GameServerJS (CC0), for street projects.
 *
 * On 2012-03-26 Urth Blocks replaced Bricks and the Grade A and Grade AAA
 * Earth Blocks:
 *  - items/brick.js onLoad: replaceWith('grade_aa_earth_block', count * 2)
 *  - items/grade_a_earth_block.js and items/grade_aaa_earth_block.js onLoad:
 *    replaceWith('grade_aa_earth_block', count)
 *  - items/catalog_recipes.js keeps only recipe 190 (Urth Block); the
 *    Blockmaker hooks in items/blockmaker.js still name 189/191/193
 *  - items/catalog_craftytasking.js lists the three with no recipe, and the
 *    catalog_tags.js "block" tag holds only grade_aa_earth_block
 *
 * Many quests/job_*.js classes still ask for the old blocks. A requirement
 * for a retired item asks for its replacement at the source's own rate, so a
 * 50-Brick row becomes 100 Urth Blocks. The rate is read from each item
 * file's onLoad, not hard-coded. Node only.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const strVar = (src, name) => src.match(new RegExp(`^var ${name} = "((?:[^"\\\\]|\\\\.)*)";`, 'm'))?.[1] || '';

/** `{ id: { to, per, label, toPlural, toBaseCost } | null }` for each class id. */
export async function loadRetiredItems(gsjs, classIds) {
  const out = {};
  for (const id of [...new Set(classIds)].sort()) {
    out[id] = null;
    let src;
    try {
      src = await readFile(join(gsjs, 'items', `${id}.js`), 'utf8');
    } catch {
      continue;
    }
    const m = src.match(/apiSetTimerX\('replaceWith',\s*\d+,\s*'([a-z0-9_]+)',\s*null,\s*this\.count(?:\s*\*\s*(\d+))?\)/);
    if (!m) continue;
    const to = await readFile(join(gsjs, 'items', `${m[1]}.js`), 'utf8');
    out[id] = {
      to: m[1],
      per: Number(m[2] || 1),
      label: strVar(src, 'name_plural') || strVar(src, 'label'),
      toPlural: strVar(to, 'name_plural') || strVar(to, 'label'),
      toBaseCost: num(to.match(/^var base_cost = (\d+);/m)?.[1]),
    };
  }
  return out;
}

/** Point a retired item requirement at its replacement, in the source desc format. */
export function retireRequirement(r, retired) {
  const swap = r.type === 'item' ? retired[r.classId] : null;
  if (!swap) return r;
  const need = r.num * swap.per;
  return {
    ...r,
    classId: swap.to,
    num: need,
    baseCost: swap.toBaseCost,
    desc: `Contribute ${swap.toPlural} - ${need} needed!`,
    retired: { classId: r.classId, num: r.num, baseCost: r.baseCost, per: swap.per },
  };
}
