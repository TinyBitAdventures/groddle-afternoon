/**
 * Rare drops (js/drop-tables.js) as a feature module: the skill-package
 * drop roll the older systems skipped, run after each successful action.
 *
 * Wired from the game event stream (onEvent):
 *   garden_plot:plant|water|clear|harvest  croppery_* / herbalism_* (by the
 *                                          nearest garden's type)
 *   trant_*:pet / :water / :harvest        light_green_thumb_pet / _water /
 *                                          gardening_harvest (egg plants pet
 *                                          with lgt_egg_plant_pet)
 *   wood_tree:pet / :water / :harvest      wood_tree_pet / _water / _harvest
 *   making_known_tool:smelter              smelting, once per smelting batch
 *   making_known_tool:ore_grinder          refining, once per batch of 5+ ore
 *                                          (ore_grinder.js no_drop below 5)
 *   making_known_tool:crystallizer         crystallizing (favor drops)
 * And from resource nodes (features/resource-nodes-feature.js calls
 * rollResourceNodeDrop after each harvest): barnacle scraping, jellisac
 * scooping, peat digging, paper tree pet/water.
 *
 * Not here (their modules roll their own tables): mining gems (mining.js),
 * patches and dirt piles (patches.js, resource-nodes.js loam), animal
 * kinship (animals lane), street creation rewards (street-jobs.js).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&dropdemo=<table>
 *     (e.g. croppery, tree_watering_large, refining_rocks) opens the table
 *     card with every row's odds; &dropautoplay=1 rolls it (&droprolls=N
 *     times, &dropseed=N for a fixed RNG) into the pack and highlights the
 *     rows hit. &droppackage=<package> rolls that skill package's drop with
 *     the chance the player has (&dropluck=1 forces every roll to hit,
 *     also for real actions; &dropcards=1 owns the eight drop cards, e.g.
 *     with &caredemo=bean&careskill=2&carereset=1 then E -> Water);
 *     &dropevent=<counter> replays one game event (trant_bean:water,
 *     garden_plot:water, making_known_tool:smelter). Canvas:
 *     dropTable, dropLast, dropRolls, dropHits, dropAutoplay.
 */

import { addItem, ensureItem, ITEM_CATALOG } from '../inventory.js?v=catalog-unified-4';
import { emblemCostFor } from '../shrines.js';
import {
  DROP_ITEMS,
  DROP_TABLES,
  applyDropResult,
  dropItemName,
  isEmptyDrop,
  packageDropChance,
  rollDropTable,
  rollPackageDrop,
  tableItemOdds,
} from '../drop-tables.js';

export const DROPS_FEATURE_ID = 'drops';
const BATCH_GAP_MS = 4000;

let rng = Math.random;
let last = '';
let hits = 0;
let rolls = 0;
const batches = {};
let demoDone = false;
let autoplayAt = 0;
let card = null;
/** QA (&dropluck=1): every package roll hits, like the Max Luck buff. */
let forceLuck = false;

function seeded(seed) {
  let s = (Number(seed) >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function publish(engine) {
  if (!engine?.setData) return;
  engine.setData('dropLast', last || 'none');
  engine.setData('dropRolls', String(rolls));
  engine.setData('dropHits', String(hits));
}

function ctxFor(engine) {
  const buffs = engine.activeBuffIds?.() || [];
  return {
    learned: engine.learnedSkills || [],
    upgrades: engine.pc?.imaginationUpgrades || [],
    rubeweed: buffs.includes('rubeweed'),
    maxLuck: buffs.includes('max_luck'),
    rng,
  };
}

function ensureDropItem(classTsid) {
  const meta = DROP_ITEMS[classTsid];
  if (!meta) return;
  const have = ITEM_CATALOG[classTsid];
  if (have && !/^Item /.test(have.desc || '')) return;
  ensureItem(classTsid, { label: meta.label, namePlural: meta.plural, desc: meta.desc || undefined, baseCost: meta.baseCost });
}

/** Pay a rolled drop to the player with the source lines and float text. */
export function payDrop(engine, result, { source = '' } = {}) {
  if (isEmptyDrop(result)) return { lines: [], landed: null };
  for (const it of result.items) ensureDropItem(it.classTsid);
  const shrine = engine.shrineState;
  const paid = applyDropResult(result, {
    inv: engine.inv,
    pc: engine.pc,
    addItem,
    favor: shrine?.favor || engine.pc?.giantFavor || null,
    favorCap: shrine ? (g) => emblemCostFor(shrine, g) : undefined,
    energyCap: Math.max(100, Number(engine.pc?.energyMax) || 100),
    moodCap: 100,
  });
  const p = engine.player;
  let lift = 0;
  for (const line of paid.lines) {
    engine.pushActivity?.(line);
    if (p) engine.floatText?.(p.x, (p.y || 0) - 130 - lift, line.replace(/^You got /, '+').replace(/!$/, ''), 0xffe39a);
    lift += 18;
  }
  engine.playSound?.('DISCOVER_USEFUL_NEW_ITEM', { volume: 0.5 });
  hits += 1;
  last = `${source ? `${source}:` : ''}${result.table}:${paid.lines.join(' ')}`;
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
  return paid;
}

/** runSkillPackage's drop step for a package the player just completed. */
export function rollDropFor(engine, packageId, opts = {}) {
  const res = rollPackageDrop(packageId, { ...ctxFor(engine), ...(forceLuck ? { maxLuck: true } : {}), ...opts });
  rolls += 1;
  engine.setData?.('dropPackage', `${packageId}@${res.chance}%:${res.hit ? 'hit' : 'miss'}`);
  if (res.hit && res.result) payDrop(engine, res.result, { source: packageId });
  else publish(engine);
  return res;
}

/** Resource-node packages with drop tables, by node class and verb. */
export const RESOURCE_NODE_DROP_PACKAGES = Object.freeze({
  'mortar_barnacle:scrape': 'scraping',
  'jellisac:scoop': 'jellisac_scooping',
  'peat_1:harvest': 'peat_harvest',
  'peat_1:dig': 'peat_harvest',
  'paper_tree:pet': 'paper_tree_pet',
  'paper_tree:water': 'paper_tree_water',
});

/**
 * Hook for features/resource-nodes-feature.js: call after a successful
 * harvest result ({ ok, classTsid, verbId }). Returns the roll or null.
 */
export function rollResourceNodeDrop(engine, result) {
  if (!result?.ok) return null;
  const pkg = RESOURCE_NODE_DROP_PACKAGES[`${result.classTsid}:${result.verbId}`];
  return pkg ? rollDropFor(engine, pkg) : null;
}

function nearestGardenType(engine) {
  const p = engine.player;
  let best = null;
  let bestD = Infinity;
  for (const t of engine.interactables || []) {
    if (t.classId !== 'garden_plot' && t.classId !== 'garden_new') continue;
    const s = t.sprite;
    if (!s || !p) continue;
    const d = Math.abs(s.x - p.x) + Math.abs(s.y - p.y) * 0.5;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best?.state?.garden?.gardenType === 'herb' ? 'herb' : 'default';
}

/** The package a game event completed, or null. */
export function packageForEvent(counter, engine) {
  const m = String(counter || '').match(/^([a-z0-9_]+):([a-z_]+)$/);
  if (!m) return null;
  const [, cls, verb] = m;
  if (cls === 'garden_plot' && ['plant', 'water', 'clear', 'harvest'].includes(verb)) {
    return `${nearestGardenType(engine) === 'herb' ? 'herbalism' : 'croppery'}_${verb}`;
  }
  if (cls === 'wood_tree' && ['pet', 'water', 'harvest'].includes(verb)) return `wood_tree_${verb}`;
  if (/^trant_[a-z]+$/.test(cls)) {
    if (verb === 'pet') return cls === 'trant_egg' ? 'lgt_egg_plant_pet' : 'light_green_thumb_pet';
    if (verb === 'water') return 'light_green_thumb_water';
    if (verb === 'harvest') return 'gardening_harvest';
  }
  return null;
}

/** making_known_tool:<tool> -> package, gated once per making batch. */
function makingPackage(counter, now = Date.now()) {
  const tool = String(counter).replace(/^making_known_tool:/, '');
  const pkg = { smelter: 'smelting', ore_grinder: 'refining', grand_ol_grinder: 'refining', crystallizer: 'crystallizing' }[tool];
  if (!pkg) return null;
  const b = batches[tool] || (batches[tool] = { units: 0, at: 0, rolled: false });
  if (now - b.at > BATCH_GAP_MS) {
    b.units = 0;
    b.rolled = false;
  }
  b.at = now;
  b.units += 1;
  if (b.rolled) return null;
  // Smelting and crystallizing roll once per batch; the grinder only for 5+ ore.
  const need = pkg === 'refining' ? 5 : 1;
  if (b.units < need) return null;
  b.rolled = true;
  return pkg;
}

/* ---------------------------------------------------------------- QA card */

function closeCard() {
  if (card?.el) card.el.hidden = true;
}

function iconFor(id) {
  return ITEM_CATALOG[id]?.icon || `assets/sprites/icons/${id}.png`;
}

function entryHtml(e) {
  if (e.item) {
    const meta = DROP_ITEMS[e.item];
    return `<span style="display:inline-flex;align-items:center;gap:4px"><img src="${iconFor(e.item)}" alt="" style="width:22px;height:22px;object-fit:contain" onerror="this.style.visibility='hidden'">${e.count > 1 ? `${e.count} ` : ''}${(e.count > 1 ? meta?.plural : meta?.single) || e.item}</span>`;
  }
  if (e.currants) return `◎ ${e.currants} currants`;
  if (e.favor) return `${e.favor.points} favor · ${e.favor.giant === 'all' ? 'all Giants' : e.favor.giant}`;
  if (e.mood) return `${e.mood} mood`;
  if (e.energy) return `${e.energy} energy`;
  if (e.xp) return `${e.xp} iMG`;
  if (e.table) return `<i>roll ${DROP_TABLES[e.table]?.name || e.table}</i>`;
  return '?';
}

function showCard(engine, tableId, hitRows = new Set(), summary = '') {
  const table = DROP_TABLES[tableId];
  if (!table) return;
  if (!card?.el?.isConnected) {
    const host = document.getElementById('quest-dialogue')?.parentNode || document.body;
    const el = document.createElement('div');
    el.className = 'quest-dialogue glitch-modal';
    el.id = 'drop-table-card';
    el.hidden = true;
    el.innerHTML = `<div class="quest-dialogue-shade"></div><div class="quest-dialogue-card" style="width:min(560px,calc(100% - 2rem));max-height:min(560px,calc(100% - 2rem));text-align:left"></div>`;
    host.appendChild(el);
    el.querySelector('.quest-dialogue-shade').addEventListener('click', closeCard);
    card = { el };
  }
  let prev = -1;
  const rows = table.rows.map(([threshold, entries], i) => {
    const width = Math.round(((Math.min(100, threshold) - prev) / 101) * 1000) / 10;
    prev = Math.min(100, threshold);
    const hit = hitRows.has(i);
    return `<tr style="${hit ? 'background:#fff1b8;font-weight:700' : ''}"><td style="padding:3px 8px;color:#7a6a8c;white-space:nowrap">≤ ${threshold}</td><td style="padding:3px 8px;white-space:nowrap">${width}%</td><td style="padding:3px 8px">${entries.map(entryHtml).join(' + ')}</td></tr>`;
  }).join('');
  const body = card.el.querySelector('.quest-dialogue-card');
  body.innerHTML = `
    <p class="mr-kicker" style="text-align:center">Drop table</p>
    <h2 style="text-align:center;margin:.1rem 0 .4rem">${table.name}</h2>
    <p style="margin:0 0 .5rem;text-align:center;color:#6e6474;font-size:.85rem"><code>${tableId}</code> · roll 0-100, first row at or above the roll pays</p>
    <table style="width:100%;border-collapse:collapse;font-size:.86rem">${rows}</table>
    ${summary ? `<p data-drop-summary style="margin:.6rem 0 0;padding:.45rem .6rem;border-radius:10px;background:#f2ecf8;font-size:.86rem">${summary}</p>` : ''}
    <button type="button" class="quest-dialogue-cancel" data-drop-close>Close</button>`;
  body.querySelector('[data-drop-close]').addEventListener('click', closeCard);
  card.el.hidden = false;
  engine.setData?.('dropTable', tableId);
}

/** Imagination cards whose effect is a drop-table roll (QA: &dropcards=1 grants them). */
export const DROP_CARDS = Object.freeze([
  'refining_drop_2', 'smelting_drop', 'lightgreenthumb_pet_drop_2', 'lightgreenthumb_water_drop_2',
  'croppery_growing_drop_2', 'bogspecialization_dig_peat_drop', 'barnacle_scraping_drop_1', 'jellisac_hands_drop_1',
]);

function demoSetup(engine) {
  if (demoDone) return;
  if (engine.param?.('dropcards') && engine.pc) {
    engine.pc.imaginationUpgrades ||= [];
    for (const id of DROP_CARDS) if (!engine.pc.imaginationUpgrades.includes(id)) engine.pc.imaginationUpgrades.push(id);
  }
  if (engine.param?.('dropluck')) forceLuck = true;
  const tableId = engine.param?.('dropdemo');
  const pkg = engine.param?.('droppackage');
  if (engine.param?.('dropevent')) {
    demoDone = true;
    autoplayAt = Date.now() + 1500;
    return;
  }
  if (!tableId && !pkg) return;
  demoDone = true;
  if (engine.param('dropseed')) rng = seeded(engine.param('dropseed'));
  if (tableId && DROP_TABLES[tableId]) showCard(engine, tableId);
  if (engine.param('dropautoplay') || pkg) autoplayAt = Date.now() + 1500;
}

function autoplay(engine) {
  autoplayAt = 0;
  const event = engine.param('dropevent');
  if (event) {
    // QA: replay one game event through the same path real actions take.
    dropsFeature.onEvent(event, 1, engine);
    engine.setData('dropAutoplay', `event:${event}`);
    return;
  }
  const pkg = engine.param('droppackage');
  if (pkg) {
    const res = rollDropFor(engine, pkg, engine.param('dropluck') ? { maxLuck: true } : {});
    if (res.tableId) {
      const hitRows = new Set();
      showCard(engine, res.tableId, hitRows, res.hit ? `Hit at ${res.chance}%: ${last.split(':').slice(2).join(':')}` : `No drop this time (${res.chance}% chance).`);
    }
    engine.setData('dropAutoplay', 'package');
    return;
  }
  const tableId = engine.param('dropdemo');
  const n = Math.max(1, Math.min(50, Number(engine.param('droprolls')) || 1));
  const hitRows = new Set();
  const lines = [];
  for (let i = 0; i < n; i += 1) {
    const res = rollDropTable(tableId, rng);
    rolls += 1;
    const top = res.rolls[0];
    const table = DROP_TABLES[tableId];
    const idx = table.rows.findIndex(([t]) => top.roll <= t);
    if (idx >= 0) hitRows.add(idx);
    const paid = payDrop(engine, res, { source: 'demo' });
    lines.push(`roll ${top.roll}: ${paid.lines.join(' ') || 'nothing'}`);
  }
  showCard(engine, tableId, hitRows, lines.join('<br>'));
  engine.setData('dropAutoplay', 'done');
}

export const dropsFeature = {
  id: DROPS_FEATURE_ID,

  init(engine) {
    publish(engine);
  },

  onStreetEnter(street, engine) {
    demoSetup(engine);
  },

  onTick(dtMs, now, engine) {
    if (autoplayAt && now >= autoplayAt) autoplay(engine);
  },

  onEvent(counter, amount, engine) {
    if (String(counter).startsWith('making_known_tool:')) {
      const pkg = makingPackage(counter);
      if (pkg) rollDropFor(engine, pkg);
      return;
    }
    const pkg = packageForEvent(counter, engine);
    if (pkg) rollDropFor(engine, pkg);
  },

  /** QA / tests. */
  _reset() {
    rng = Math.random;
    last = '';
    hits = 0;
    rolls = 0;
    for (const k of Object.keys(batches)) delete batches[k];
    demoDone = false;
    autoplayAt = 0;
    forceLuck = false;
  },
  _setRng(fn) {
    rng = fn;
  },
  _odds: tableItemOdds,
  _chance: packageDropChance,
  _name: dropItemName,
};
