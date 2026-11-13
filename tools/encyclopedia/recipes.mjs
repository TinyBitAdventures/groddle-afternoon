/**
 * Recipes, by tool (tools/encyclopedia/sections.mjs): one page per tool or
 * machine, with every recipe it makes: what goes in, what comes out, the
 * skills it needs, energy, time and iMG.
 *
 * Sources (read only):
 *  - assets/content/recipes.json (built from GSJS catalog_recipes.js by
 *    build-recipes.mjs): the recipes the remake makes, with their source
 *    numbers per unit (energyCost, waitMs, xpReward, toolWear, taskLimit,
 *    fuel), skills, achievements and the quest that teaches one.
 *  - public/js/making.js TOOL_CATALOG (names) and MAKING_TOOL_SKILLS (the
 *    skill each tool needs, and which tools are transmogrifiers).
 * Each recipe has an anchor (#r<id>) for links from item pages.
 */
import { MAKING_TOOL_SKILLS, TOOL_CATALOG, TRANSMOG_FAIL_CHANCE } from '../../public/js/making.js?v=ba3677f0';
import { esc, fmt } from './parts.mjs';

/** Our grouping of the tools. */
const ALCHEMY = ['test_tube', 'beaker', 'alchemical_tongs', 'tincturing_kit', 'cauldron'];
function groupOf(tool) {
  const type = MAKING_TOOL_SKILLS[tool]?.makingType || '';
  if (type === 'cooking') return 'Cooking tools';
  if (type === 'transmogrification') return 'Transmogrifiers';
  if (type === 'machine' || type === 'crystalmalization') return 'Machines';
  if (ALCHEMY.includes(tool)) return 'Alchemy and potions';
  return 'Crafting and other tools';
}

const seconds = (ms) => {
  const s = Math.round((Number(ms) || 0) / 100) / 10;
  return s >= 60 ? `${fmt(Math.round(s / 6) / 10)} min` : `${fmt(s)} s`;
};

function add({ add: addEntry, entries, items, recipes }) {
  const byTool = new Map();
  for (const r of Object.values(recipes)) byTool.set(r.tool, [...(byTool.get(r.tool) || []), r]);
  for (const [tool, list] of byTool) {
    const it = items.get(tool);
    const sorted = list.slice().sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || Number(a.id) - Number(b.id));
    const e = addEntry('recipes', tool, {
      name: it?.name || TOOL_CATALOG[tool]?.label || tool, status: it?.status || 'source', register: '', group: groupOf(tool),
      icon: it?.icon || null, recipes: sorted, toolSkill: MAKING_TOOL_SKILLS[tool] || null,
      desc: `${fmt(sorted.length)} recipe${sorted.length === 1 ? '' : 's'} made with the ${it?.name || TOOL_CATALOG[tool]?.label || tool}.`,
    });
    if (!e) continue;
    const seen = new Set();
    const ref = (to, rel) => {
      if (seen.has(`${to} ${rel}`) || !(to.startsWith('item:') ? items.has(to.slice(5)) : entries.has(to))) return;
      seen.add(`${to} ${rel}`);
      e.refs.push({ to, rel });
    };
    ref(`item:${tool}`, 'tool');
    for (const r of sorted) {
      for (const o of r.outputs || []) ref(`item:${o.classTsid}`, 'makes');
      for (const i of r.inputs || []) ref(`item:${i.classTsid}`, 'takes');
      for (const s of new Set([r.skill, ...(r.skills || [])].filter(Boolean))) ref(`skills:${s}`, 'needs-skill');
      for (const a of r.achievements || []) ref(`achievements:${a}`, 'after');
      if (r.taughtBy) ref(`quests:${r.taughtBy}`, 'after');
    }
  }
}

function recipeBlock(r, P, info, name) {
  const ins = (r.inputs || []).map((i) => P.tile(`item:${i.classTsid}`, { n: i.qty }));
  const outs = (r.outputs || []).map((o) => P.tile(`item:${o.classTsid}`, { n: o.qty }));
  const chips = [];
  for (const s of new Set([r.skill, ...(r.skills || [])].filter(Boolean))) {
    chips.push(info(`skills:${s}`) ? P.chip(`needs ${esc(info(`skills:${s}`).name)}`, { pic: info(`skills:${s}`).icon, link: P.href(`skills:${s}`) }) : P.chip('needs a skill'));
  }
  for (const a of r.achievements || []) if (info(`achievements:${a}`)) chips.push(P.chip(`after ${esc(info(`achievements:${a}`).name)}`, { pic: info(`achievements:${a}`).icon, link: P.href(`achievements:${a}`) }));
  if (r.taughtBy && info(`quests:${r.taughtBy}`)) chips.push(P.chip(`taught by ${esc(info(`quests:${r.taughtBy}`).name)}`, { link: P.href(`quests:${r.taughtBy}`) }));
  if (r.energyCost) chips.push(P.chip(`${fmt(r.energyCost)} energy`));
  if (r.waitMs) chips.push(P.chip(seconds(r.waitMs)));
  if (r.xpReward) chips.push(P.chip(`${fmt(r.xpReward)} iMG`, { cls: 'ency-chip-xp' }));
  if (r.fuel) chips.push(P.chip(`${fmt(r.fuel)} fuel`));
  if (r.taskLimit) chips.push(P.chip(`up to ${fmt(r.taskLimit)} at a time`));
  return `<div class="ency-recipe" id="r${esc(r.id)}">
            <p class="ency-recipe-name">${esc(r.name || name)}</p><div class="ency-recipe-row"><ul class="ency-tiles ency-ins">${ins.join('<li class="ency-plus" aria-hidden="true">+</li>')}</ul> <span class="ency-arrow" aria-label="makes">→</span> <ul class="ency-tiles ency-outs">${outs.join('')}</ul></div>
            ${P.chips(chips)}
          </div>`;
}

function page(e, P, { info, d, uniqBy, backOf, kit }) {
  const { band, sub, entryHead } = kit;
  const tool = e.id;
  const rule = e.toolSkill;
  const skillKey = rule?.requiredSkill ? `skills:${rule.requiredSkill}` : null;
  const skill = skillKey && info(skillKey) ? `<a href="${P.href(skillKey)}">${esc(info(skillKey).name)}</a>` : 'its skill';
  const use = rule?.makingType === 'transmogrification'
    ? `<p>Anyone can use it. Without ${skill} each make takes twice as long, costs a quarter more energy and fails ${fmt(TRANSMOG_FAIL_CHANCE * 100)}% of the time.</p>`
    : rule?.requiredSkill ? `<p>You need ${skill} to use it at all; some recipes need more skills, as shown on each.</p>` : '';
  const cooking = rule?.makingType === 'cooking' ? '<p>The energy and time below are per item, before skills: from level II of the tool’s skill a make takes half the time and less energy.</p>' : '<p>The energy and time below are per item, before skills.</p>';
  const toolTile = info(`item:${tool}`) ? P.tiles([P.tile(`item:${tool}`, { sub: 'the tool' })]) : '';
  const sellers = uniqBy(backOf(`item:${tool}`, (b) => b.rel === 'sells'), (b) => b.from).map((b) => P.tile(b.from, { sub: b.price ? P.currants(b.price) : '' }));
  const blocks = e.recipes.map((r) => recipeBlock(r, P, info, e.name));
  const kinds = [...new Set(e.recipes.flatMap((r) => (r.outputs || []).map((o) => o.classTsid)))].length;
  return `${entryHead(e, P, { subline: esc(`${e.group.replace(/s$/, '').replace(/ and other tool$/, ' tool')} · ${fmt(e.recipes.length)} recipe${e.recipes.length === 1 ? '' : 's'}`) })}
  <main>
${band('tool-h', 'The tool', `${use}${toolTile}${sub('Where to buy it', P.tiles(sellers))}`)}
${band('recipes-h', `What the ${esc(e.name)} makes`, `${cooking}${blocks.join('\n          ')}`, { alt: true, lead: `${fmt(e.recipes.length)} recipe${e.recipes.length === 1 ? '' : 's'}, ${fmt(kinds)} different thing${kinds === 1 ? '' : 's'} to make, with Tiny Speck’s names and numbers.` })}
${band('remake-h', 'In the remake', `<div class="cat-remake-body"><p class="cat-status-text">Every recipe on this page can be made in the remake${e.status === 'source' ? '' : ', once the tool is'}.</p></div>`)}
  </main>`;
}

const recipeTotal = (list) => list.reduce((n, e) => n + (e.recipes?.length || 0), 0);

export const SECTION = {
  key: 'recipes', label: 'Tools and recipes', one: 'tool', noun: 'tools', groupWord: 'Kind', sample: 'recipes:frying_pan', css: '',
  blurb: 'The tools and machines you make things with, and every recipe each one makes: what goes in, what comes out, the skill it needs, energy and time.',
  /** The section counts tools; the recipes they make are counted beside them. */
  cardCount: (list) => `${fmt(list.length)} tools · ${fmt(recipeTotal(list))} recipes`,
  scoreMore: (list) => `Between them they make ${fmt(recipeTotal(list))} recipes.`,
  add, page,
};
