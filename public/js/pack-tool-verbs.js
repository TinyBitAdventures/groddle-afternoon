/**
 * The Pick's, the Shovel's and the Scraper's own pack verbs: like the Hatchet's (G165,
 * js/pack-tree-verbs.js) they proxy to the nearest node's own verb (pure: no Pixi, no DOM).
 *
 * Source (tinyspeck/glitch-GameServerJS, CC0):
 * - items/pick.js:274-317       verbs.use (Pick and Fancy Pick, the default verb, key u):
 *                               Mining I, else "You need to know Mining I to use this.";
 *                               a broken pick "This pick has become broken, and must be
 *                               repaired."; the handler sets force_pick for a plain Pick and
 *                               runs the mine handler of the nearest mineable, useable rock
 *                               within 100 px, else "But there's nothing to mine!".
 * - items/rock_metal_1.js:235-238  a forced plain Pick on a Metal Rock: "This humdrum, everyday
 *                               pick is far too brittle to mine a metal rock!"
 * - items/shovel.js:70-121      verbs.dig (Shovel and Ace of Spades, default): broken check,
 *                               then the nearest dirt_pile / patch / patch_dark within 100 whose
 *                               dig is enabled; else the first one's reason; else "There's
 *                               nothing to dig!" (handler: "But there's nothing to dig!").
 * - items/shovel.js:123-174     verbs.harvest: the nearest peat_1 / peat_2 / peat_3 within 100;
 *                               else its reason; else "There's nothing to harvest!".
 * - items/scraper.js:335-389    verbs.scrape (Scraper and Super Scraper): the nearest Mortar
 *                               Barnacle within 200 (Ice Nubbins only for gods and dev); a
 *                               barnacle's own reason; with none in reach the verb is disabled
 *                               (its ice branch answers disabled with no reason).
 * - items/item.js:444-467       proxyVerb / proxyVerbEnabled; players/player.js:1152-1182
 *                               findCloseStack (nearest, straight line, at most the distance).
 *
 * The node's verb state comes from the remake's own menu for it (engine.targetVerbs), so the pack
 * button and the node agree. A Shovel's or a Scraper's verb runs the node's verb with no tool
 * named (the node takes its usual first working one, as the source's handler did: dirt_pile.js
 * 211-212, peat_1.js 345-351, mortar_barnacle.js 91-101); a plain Pick's Use names the plain Pick
 * (force_pick, js/tool-choice.js).
 */

import { findCloseTarget } from './pack-tree-verbs.js?v=bfcb87be';

export const PACK_TOOL_SOURCE = 'tinyspeck/glitch-GameServerJS CC0 items/pick.js, shovel.js, scraper.js';

/** The tools and name_single (pick.js / fancy_pick.js, shovel.js / ace_of_spades.js, scraper.js / super_scraper.js). */
export const PACK_TOOL_NAMES = Object.freeze({
  pick: 'Pick',
  fancy_pick: 'Fancy Pick',
  shovel: 'Shovel',
  ace_of_spades: 'Ace of Spades',
  scraper: 'Scraper',
  super_scraper: 'Super Scraper',
});

/** Each tool's verbs in the source's sort order (sort_on), with the classes they reach and how far. */
const KINDS = Object.freeze({
  pick: Object.freeze(['use']),
  shovel: Object.freeze(['dig', 'harvest']),
  scraper: Object.freeze(['scrape']),
});
const KIND_OF = Object.freeze({ pick: 'pick', fancy_pick: 'pick', shovel: 'shovel', ace_of_spades: 'shovel', scraper: 'scraper', super_scraper: 'scraper' });

/** verb -> [{ classes, verb }] in proxy order, and the reach (findCloseStack's max_distance). */
export const PACK_TOOL_TARGETS = Object.freeze({
  use: Object.freeze({ reach: 100, order: Object.freeze([{ test: (c) => /^rock_/.test(c), verb: 'mine' }]) }),
  dig: Object.freeze({
    reach: 100,
    order: Object.freeze([
      { test: (c) => c === 'dirt_pile', verb: 'dig' },
      { test: (c) => c === 'patch', verb: 'dig' },
      { test: (c) => c === 'patch_dark', verb: 'dig' },
    ]),
  }),
  harvest: Object.freeze({ reach: 100, order: Object.freeze([{ test: (c) => /^peat_[123]$/.test(c), verb: 'harvest' }]) }),
  scrape: Object.freeze({ reach: 200, order: Object.freeze([{ test: (c) => c === 'mortar_barnacle', verb: 'scrape' }]) }),
});

/** Labels, tooltips and lines, verbatim. */
export const PACK_TOOL_TEXT = Object.freeze({
  use: Object.freeze({ label: 'use', tooltip: 'Or, drag pick to rock.' }),
  dig: Object.freeze({ label: 'dig', tooltip: 'Or, drag shovel to a patch' }),
  harvest: Object.freeze({ label: 'harvest', tooltip: 'Or, drag shovel to a peat bog' }),
  scrape: Object.freeze({ label: 'scrape', tooltip: 'Or, drag scraper to a barnacle' }),
  broken: (name) => `This ${name} has become broken, and must be repaired.`,
  brokenPick: 'This pick has become broken, and must be repaired.',
  noMining: 'You need to know Mining I to use this.',
  nothingToDig: "There's nothing to dig!",
  nothingToDigRun: "But there's nothing to dig!",
  nothingToHarvest: "There's nothing to harvest!",
  nothingToMine: "But there's nothing to mine!",
  nothingToScrape: "But there's nothing to scrape!",
  brittle: 'This humdrum, everyday pick is far too brittle to mine a metal rock!',
});

export function isPackTool(classTsid) {
  return Object.prototype.hasOwnProperty.call(KIND_OF, classTsid);
}

/** The verbs a tool carries, in order. */
export function packToolVerbIds(classTsid) {
  return KINDS[KIND_OF[classTsid]] || [];
}

const NULL = Object.freeze({ state: null });
const enabled = () => ({ state: 'enabled' });
const disabled = (reason = '') => ({ state: 'disabled', reason });

/** A rock isMineable and isUseable (pick.js 313): not mined out. */
function useableRock(t) {
  const r = t?.state?.rock || t?.state;
  return /^rock_/.test(String(t?.classId || '')) && !(r?.depleted || Number(r?.chunksRemaining) <= 0);
}

/**
 * The nodes in reach for one pack verb, in proxy order: [{ target, verb }] where verb is the
 * node's own menu verb (or null when it offers none). `find(predicate, reach)` is findCloseTarget
 * bound to the avatar; `verbsOf(target)` the node's menu verbs.
 */
export function nodesFor(verbId, { find, verbsOf }) {
  const spec = PACK_TOOL_TARGETS[verbId];
  if (!spec) return [];
  const out = [];
  for (const row of spec.order) {
    const pred = verbId === 'use' ? useableRock : (t) => row.test(String(t?.classId || ''));
    const target = find(pred, spec.reach);
    if (!target) continue;
    const verb = (verbsOf(target) || []).find((v) => v?.id === row.verb) || null;
    out.push({ target, verb });
  }
  return out;
}

/**
 * One pack verb's condition (pick.js 285-293, shovel.js 81-100 and 134-157, scraper.js 346-370).
 * ctx: { tool, working, knowsMining, nodes: nodesFor(...) }
 */
export function packToolCondition(verbId, ctx = {}) {
  const name = PACK_TOOL_NAMES[ctx.tool] || 'tool';
  if (verbId === 'use') {
    if (ctx.knowsMining === false) return disabled(PACK_TOOL_TEXT.noMining);
    if (ctx.working === false) return disabled(PACK_TOOL_TEXT.brokenPick);
    return enabled();
  }
  if (ctx.working === false) return disabled(PACK_TOOL_TEXT.broken(name));
  const nodes = (ctx.nodes || []).filter((n) => n.verb);
  if (nodes.some((n) => n.verb.enabled !== false)) return enabled();
  const first = nodes.find((n) => n.verb.enabled === false);
  if (first) return disabled(first.verb.reason || '');
  if (verbId === 'dig') return disabled(PACK_TOOL_TEXT.nothingToDig);
  if (verbId === 'harvest') return disabled(PACK_TOOL_TEXT.nothingToHarvest);
  // scraper.js 351-370: no barnacle in reach answers the ice branch's disabled, with no reason.
  return disabled('');
}

/** Pack popover buttons for a tool (the source's sort order). */
export function packToolButtons(tool, conditions) {
  const out = [];
  for (const id of packToolVerbIds(tool)) {
    const c = conditions?.[id];
    if (!c || c.state == null) continue;
    out.push({
      id,
      label: PACK_TOOL_TEXT[id].label,
      tooltip: PACK_TOOL_TEXT[id].tooltip,
      enabled: c.state === 'enabled',
      reason: c.state === 'enabled' ? '' : c.reason || '',
    });
  }
  return out;
}

/**
 * What a pack verb's handler does: { run: { target, verb, choose } } to start the node's own verb
 * (choose: the tool the node must use, or null), or { lines } to say.
 * ctx: { tool, working, knowsMining, nodes, rockType(target) }
 */
export function planPackToolVerb(verbId, ctx = {}) {
  if (verbId === 'use') {
    // pick.js handler 301-307: no Mining I or no points: nothing happens.
    if (ctx.knowsMining === false || ctx.working === false) return { lines: [] };
    const rock = (ctx.nodes || [])[0];
    if (!rock) return { lines: [PACK_TOOL_TEXT.nothingToMine] };
    const force = ctx.tool === 'pick';
    if (force && ctx.rockType?.(rock.target) === 'metal_rock') return { lines: [PACK_TOOL_TEXT.brittle] };
    if (!rock.verb) return { lines: [PACK_TOOL_TEXT.nothingToMine] };
    if (rock.verb.enabled === false) return { lines: [rock.verb.reason || PACK_TOOL_TEXT.nothingToMine] };
    return { run: { target: rock.target, verb: rock.verb, choose: force ? { cls: 'pick', force: true } : null } };
  }
  if (ctx.working === false) return { lines: [] };
  for (const n of ctx.nodes || []) {
    if (!n.verb) continue;
    if (n.verb.enabled !== false) return { run: { target: n.target, verb: n.verb, choose: null } };
    return { lines: n.verb.reason ? [n.verb.reason] : [] };
  }
  if (verbId === 'dig') return { lines: [PACK_TOOL_TEXT.nothingToDigRun] };
  if (verbId === 'scrape') return { lines: [PACK_TOOL_TEXT.nothingToScrape] };
  // shovel.js harvest handler 166-173: nothing to harvest says nothing.
  return { lines: [] };
}

export { findCloseTarget };
