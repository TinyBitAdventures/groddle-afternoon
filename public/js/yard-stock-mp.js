/**
 * Rocks and resource nodes on another player's home street in multiplayer
 * (register G328 MPVISIT, G438): the rules both sides share. Pure (no Pixi,
 * no DOM); features/yard-verbs-mp-feature.js puts them in the world and
 * groddle-afternoon-site src/HomeYard.php decides each act from the same
 * numbers (data/yard-verbs.json "rocks", "nodes", "cult", written by
 * tools/build-yard-verbs.mjs from this file).
 *
 * In the original nothing a home street grew asked for its owner or a key:
 * - mining (items/include/mining.js verbs.mine, rock_metal_1.js 168: a pick
 *   and Mining I) gives the chunks to the one swinging
 *   (mining.js:344 pc.createItemFromSource);
 * - a Peat Bog's harvest (peat_1.js:268), a Dirt Pile's dig
 *   (dirt_pile.js 413/431), a Mortar Barnacle's scrape (mortar_barnacle.js:261)
 *   and a Jellisac's scoop (jellisac.js) give their yield to the actor too;
 * - only removing them (Wine of the Dead, rock_metal_1.js:66, peat_1.js:66,
 *   dirt_pile.js:67) is the owner's.
 * The thing itself is one for everyone: what one visitor takes is gone for
 * the next and for the owner, and each use wears the cultivation down
 * (items/include/cultivation.js addWear) until it turns back into its proto.
 *
 * What a visitor's act adds to the owner's Magic Rock pool
 * (locations/inc_cultivation.js cultivation_add_img_rewards 168-178; key-holders
 * count, the owner never does):
 * - a rock mined out: metal 25, dullite 15, beryl 20, any other 30
 *   (include/mining.js 388-401);
 * - Peat 6 a harvest (peat_1.js:301), a Dirt Pile 3 a dig (dirt_pile.js:470),
 *   a Mortar Barnacle 3 a scrape (mortar_barnacle.js:304), a Jellisac 2 a
 *   scoop (jellisac.js:234).
 *
 * Remake choices:
 * - A rock comes back 45 s after it is mined out, as every rock in the remake
 *   does (js/mining.js; the source's 8 minutes), with its 50 chunks (no mega
 *   rock on a visit: the roll is the clearing player's card).
 * - A home rock's cultivation wears one use a swing, as the owner's own
 *   mining wears it in the remake (homes-feature wearFromEvent); the source
 *   wore it once a clear (mining.js:389). Nodes wear one use each.
 * - A node regrows one step every mean regrow delay on the site (the game's
 *   own timer runs the owner's copy), so the site needs no timers.
 * - The site credits the yield it can count (the chunks it rolled; a node's
 *   base yield, objects.go objNodeYield) as a ledger receipt; skill bonuses
 *   and drops go through the visitor's earning budget, as on public streets.
 * - HOMES2: a Firefly Hive's Fireflies (firefly_hive.js: one every 60 s up
 *   to 10 around it) are anyone's to whistle into a Firefly Jar, as on any
 *   street (firefly_jar.js verbs.open 129-216: no owner check; the
 *   whistler's Firefly Whistling, energy and jar are their own). Each one
 *   caught is gone for everyone until the hive's next comes (10 s, the
 *   remake's Firefly respawn) and wears the hive one use (nodes wear from
 *   their harvests). A jar filled on a home street pays its owner's pool 25
 *   (firefly_jar.js:383, onAttract on pc.location). The site cannot see the
 *   visitor's jar (a tool's state is their own), so every seventh Firefly a
 *   visitor catches there in a game day counts as a full jar (FIREFLY_JAR_MAX
 *   7); the owner's own catches pay nothing (inc_cultivation.js:171).
 */

import { cultivationDef, hiveFireflySpots } from './home-cultivation.js?v=1e2d2b2d';
import { createMineRock, tickMineRock } from './mining.js?v=b28fef74';
import { createResourceNode, getResourceNodeDef, normalizeResourceNode, regrowDelayMs, tickResourceNode } from './resource-nodes.js?v=3a26727e';

/** The node classes a visitor may use on a home street (HOMES2: the hive's Fireflies too). */
export const STOCK_NODE_CLASSES = Object.freeze(['peat_1', 'dirt_pile', 'mortar_barnacle', 'jellisac', 'npc_firefly']);
/** A visitor's verb on each (a Firefly: open your jar and whistle, firefly_jar.js verbs.open). */
export const STOCK_NODE_VERBS = Object.freeze({ peat_1: 'harvest', dirt_pile: 'dig', mortar_barnacle: 'scrape', jellisac: 'scoop', npc_firefly: 'open' });
/** firefly_jar.js FIREFLY_JAR_MAX: a jar holds seven; the seventh a visitor catches at a home in a game day pays the pool (above). */
export const FIREFLY_JAR_FULL = 7;

/** cultivation_add_img_rewards amounts. */
export const STOCK_POOL = Object.freeze({
  'rock:metal_rock': 25, // include/mining.js 390-391
  'rock:dullite': 15, // mining.js 393-394
  'rock:beryl': 20, // mining.js 396-397
  'rock:sparkly': 30, // mining.js 399-400 (any other rock)
  'node:peat_1': 6, // peat_1.js:301
  'node:dirt_pile': 3, // dirt_pile.js:470
  'node:mortar_barnacle': 3, // mortar_barnacle.js:304
  'node:jellisac': 2, // jellisac.js:234
});

/** The yield the site credits (groddle-afternoon-server objects.go objNodeYield; js/resource-nodes.js harvestResourceNode). */
export const STOCK_NODE_YIELD = Object.freeze({
  peat_1: Object.freeze(['peat', 3]),
  dirt_pile: Object.freeze(['earth', 2]),
  mortar_barnacle: Object.freeze(['barnacle', 1]),
  jellisac: Object.freeze(['jellisac_clump', 1]),
  // A Firefly goes into the whistler's jar, a tool's state: nothing the ledger counts.
  npc_firefly: null,
});

/** js/mining.js mineRock: a mined-out rock reforms 45 s on. */
export const ROCK_RESPAWN_MS = 45000;

const LABEL = Object.freeze({
  rock_metal_1: 'Metal Rock', rock_dullite_1: 'Dullite Rock', rock_beryl_1: 'Beryl Rock', rock_sparkly_1: 'Sparkly Rock',
  peat_1: 'Peat Bog', dirt_pile: 'Dirt Pile', mortar_barnacle: 'Mortar Barnacle', jellisac: 'Jellisac', npc_firefly: 'Firefly',
});
const DONE = Object.freeze({ mine: 'mined', harvest: 'harvested', dig: 'dug', scrape: 'scraped', scoop: 'scooped', open: 'whistled up' });

export const STOCK_TEXT = Object.freeze({
  acted: (who, verb, what) => `${who} ${DONE[verb] || verb} your ${what}.`,
});

export function isRockId(id) {
  return typeof id === 'string' && /^rock:\d{1,2}$/.test(id);
}

export function isNodeId(id) {
  const m = /^node:([a-z][a-z0-9_]{2,19}):\d{1,2}$/.exec(String(id || ''));
  return Boolean(m && STOCK_NODE_CLASSES.includes(m[1]));
}

/** Mining's class for a rock cultivation's end item (homes-feature rockClassFor). */
export function rockClass(endClass) {
  return String(endClass || 'rock_metal_1').replace(/_\d+$/, '_1');
}

/** The street's live rocks in cultivation order (homes-feature rockItems; index = the world rock slot). */
export function homeRocks(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((row) => cultivationDef(row?.protoClass)?.kind === 'rock' && !row.depleted)
    .map((row, index) => ({ id: `rock:${index}`, index, itemId: row.id, classId: rockClass(row.endClass), rx: Number(row.rx) || 0 }));
}

/**
 * The street's resource nodes a visitor may use, keyed as resource-nodes-feature keys them
 * (`<class>:<n>`, peat_2/3 counted as peat_1; homes-feature nodeKeyMap), each with its cultivation.
 */
export function homeNodes(items = [], now = Date.now()) {
  const counters = {};
  const out = [];
  for (const row of Array.isArray(items) ? items : []) {
    const def = cultivationDef(row?.protoClass);
    if (def?.kind === 'hive' && !row.depleted) {
      // HOMES2: the hive's Fireflies, keyed npc_firefly:<n> as homes-feature nodeKeyMap keys them.
      for (const spot of hiveFireflySpots(row, now)) {
        const n = counters.npc_firefly || 0;
        counters.npc_firefly = n + 1;
        out.push({ id: `node:npc_firefly:${n}`, key: `npc_firefly:${n}`, classTsid: 'npc_firefly', cls: 'npc_firefly', itemId: row.id, rx: (Number(row.rx) || 0) + spot.dx, dy: spot.dy });
      }
      continue;
    }
    if (!def || def.kind !== 'node' || row.depleted) continue;
    for (const node of def.nodes || []) {
      const cls = String(node.classTsid).startsWith('peat_') ? 'peat_1' : node.classTsid;
      const n = counters[cls] || 0;
      counters[cls] = n + 1;
      if (!STOCK_NODE_CLASSES.includes(cls)) continue;
      out.push({ id: `node:${cls}:${n}`, key: `${cls}:${n}`, classTsid: cls === 'peat_1' ? row.endClass || 'peat_1' : cls, cls, itemId: row.id, rx: (Number(row.rx) || 0) + (Number(node.dx) || 0), dy: Number(node.dy) || 0 });
    }
  }
  return out;
}

export function stockLabel(classId) {
  return LABEL[classId] || LABEL[String(classId).replace(/_\d+$/, '_1')] || 'thing';
}

/** The pool key of a rock (on a clear) or node act. */
export function stockPoolKey(kind, classId, rockType = '') {
  return kind === 'rock' ? `rock:${rockType}` : `node:${String(classId).startsWith('peat_') ? 'peat_1' : classId}`;
}

/** The site's rocks and nodes of a visit (GET homes/<id>/yard), checked. */
export function normalizeStockView(answer) {
  const rocks = (Array.isArray(answer?.rocks) ? answer.rocks : [])
    .filter((r) => isRockId(r?.id) && /^rock_[a-z]+_1$/.test(String(r.classId || '')) && Number.isFinite(Number(r.rx)) && r.rock && typeof r.rock === 'object')
    .map((r) => ({ id: r.id, classId: r.classId, rx: Number(r.rx), rock: r.rock }));
  const nodes = (Array.isArray(answer?.nodes) ? answer.nodes : [])
    .filter((n) => isNodeId(n?.id) && Number.isFinite(Number(n.rx)) && n.node && typeof n.node === 'object')
    .map((n) => ({ id: n.id, key: n.id.slice(5), classTsid: String(n.classTsid || n.id.split(':')[1]), rx: Number(n.rx), dy: Number(n.dy) || 0, node: n.node }));
  return { rocks, nodes };
}

/** A visitor's copy of an owner's rock as the site has it now. */
export function visitorRock(row, now = Date.now()) {
  const rock = createMineRock(row.classId);
  const s = row.rock || {};
  rock.chunksRemaining = Math.max(0, Math.floor(Number(s.chunksRemaining ?? rock.chunksMax) || 0));
  rock.depleted = s.depleted === true;
  rock.respawnAt = Math.max(0, Number(s.respawnAt) || 0);
  tickMineRock(rock, now);
  return rock;
}

/**
 * A visitor's copy of an owner's node: its stock as the site has it, its daily
 * counts the visitor's own (`mine`, "<verb>:<id>" => n; the source's daily
 * limits are per player: checkSkillPackageOverLimit).
 */
export function visitorNode(row, mine = {}, dayKey = '') {
  const node = normalizeResourceNode({ ...row.node, classTsid: row.classTsid }) || createResourceNode(row.classTsid);
  const verb = STOCK_NODE_VERBS[row.id.split(':')[1]];
  node.dayKey = dayKey;
  node.dailyCounts = {};
  const n = Number(mine[`${verb}:${row.id}`]) || 0;
  if (n > 0) node.dailyCounts[verb] = n;
  return node;
}

/** What a visitor's verb changed on a copy: [verb, ...]. */
export function rockActs(before, rock) {
  return before && rock && rock.chunksRemaining < before.chunks ? ['mine'] : [];
}

/**
 * Applies a visitor's rock or node act to the owner's home: `rocks` the home
 * street's world rock slots (game.js streetWorldState().rocks: { classId, rock }),
 * `nodes` the resource-nodes slot's nodes, `items` the cultivations. Mutated in
 * place, so a rock or node drawn from them follows. Returns what changed:
 * { kind, what, wearItem (the cultivation's id to wear one use), rock|node } or null.
 */
export function applyStockAct({ rocks = [], nodes = {}, items = [] } = {}, act, now = Date.now()) {
  if (!act) return null;
  if (act.kind === 'rock') {
    const row = homeRocks(items).find((r) => r.id === act.target);
    if (!row) return null;
    let slot = rocks[row.index];
    if (!slot || slot.classId !== row.classId || !slot.rock) {
      slot = { classId: row.classId, rock: createMineRock(row.classId) };
      rocks[row.index] = slot;
    }
    const rock = slot.rock;
    tickMineRock(rock, act.at);
    if (!rock.depleted) {
      rock.chunksRemaining -= Math.max(0, act.took);
      if (rock.chunksRemaining <= 0) {
        rock.chunksRemaining = 0;
        rock.depleted = true;
        rock.respawnAt = act.at + ROCK_RESPAWN_MS;
        rock.respawnChunks = 0;
      }
    }
    tickMineRock(rock, now);
    return { kind: 'rock', what: stockLabel(row.classId), wearItem: row.itemId, rock };
  }
  if (act.kind === 'node') {
    const row = homeNodes(items, act.at).find((r) => r.id === act.target);
    if (!row) return null;
    let node = normalizeResourceNode(nodes[row.key]);
    if (!node || (node.classTsid !== row.cls && !(row.cls === 'peat_1' && String(node.classTsid).startsWith('peat_')))) {
      node = createResourceNode(row.classTsid, { seed: `RH_HOME_EXT:${row.key}`, now: act.at });
    } else if (nodes[row.key] && typeof nodes[row.key] === 'object') node = nodes[row.key];
    nodes[row.key] = node;
    tickResourceNode(node, act.at);
    // resource-nodes.js harvestResourceNode: back to the first state, or one use off; the regrow restarts.
    const def = getResourceNodeDef(node.classTsid);
    const stock = def?.stock || {};
    node.units = stock.afterHarvest != null ? stock.afterHarvest : Math.max(stock.min ?? 0, (Number(node.units) || 0) - Math.max(1, stock.consume ?? 1));
    node.totalHarvests = (Number(node.totalHarvests) || 0) + 1;
    if (def?.regrow) node.regrowAt = act.at + regrowDelayMs(def);
    // A Firefly caught is gone until its respawn (resource-nodes 'respawn' stock).
    if (def?.respawnMs && node.units <= 0) {
      node.depleted = true;
      node.respawnAt = act.at + def.respawnMs;
    }
    tickResourceNode(node, now);
    return { kind: 'node', what: stockLabel(row.cls), node };
  }
  return null;
}
