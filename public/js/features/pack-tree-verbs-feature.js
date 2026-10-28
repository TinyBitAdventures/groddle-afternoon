/**
 * The Hatchet's and Class Axe's pack verbs (register row G165), as a feature
 * module (see js/feature-host.js). Rules, source lines and remake decisions
 * live in js/pack-tree-verbs.js.
 *
 * - harvest: the nearest Wood Tree within 100 px, through its own harvest verb
 *   (the same timed action, Hatchet animation, planks and wear as clicking it).
 * - Harvest and Clear: the same for a wee tree (maturity 1), whose harvest
 *   kills it. Its own menu shows "Harvest and Clear" too (wood_tree.js:442).
 * - clear: the nearest dead trant within 100 px, through the patches feature's
 *   clear verb; "Nothing to clear!" when no tree of either kind is in reach.
 *
 * engine.targetVerbs(target) is the tree's verb menu (game.js menuVerbsFor);
 * engine.beginVerb(target, verb) starts it like a menu click.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&wooddemo=1&woodreset=1
 *     (a Wood Tree 72 px away; &woodmaturity=1 for Harvest and Clear), or
 *     &patchdemo=dead (a dead Bean Tree beside you, Hatchet in the pack).
 *     &packtreeautoplay=harvest|clear|harvest_clear runs that verb from the
 *     Hatchet 1.5 s after the street loads. Canvas: packTreeVerbs (the buttons
 *     the Hatchet shows, `id:state`), packTreeLast.
 */

import { countItem } from '../inventory.js?v=catalog-unified-7';
import { getToolCondition } from '../tools.js?v=woodcutting-test-8';
import {
  PACK_TREE_REACH,
  deadTreeSide,
  findCloseTarget,
  isDeadTrant,
  isPackTreeTool,
  isPlainWoodTree,
  packTreeButtons,
  packTreeConditions,
  planPackTreeVerb,
  relabelWeeHarvest,
  woodTreeSide,
} from '../pack-tree-verbs.js?v=g165-1';

export const PACK_TREE_VERBS_FEATURE_ID = 'pack-tree-verbs';

let last = '';
let autoplayAt = 0;

function verbsOf(engine, target) {
  try {
    return engine.targetVerbs?.(target) || [];
  } catch {
    return [];
  }
}

function finder(engine) {
  const from = engine.player;
  const targets = engine.interactables || [];
  return (predicate) => findCloseTarget(targets, from, predicate, PACK_TREE_REACH);
}

function working(engine, tool) {
  return !getToolCondition(engine.toolState || {}, tool).broken;
}

/** The three conditions for one tool where the avatar stands. */
export function conditionsFor(engine, tool) {
  const find = finder(engine);
  const wood = find(isPlainWoodTree);
  const dead = find((t) => isDeadTrant(t?.classId));
  return packTreeConditions({
    tool,
    working: working(engine, tool),
    wood: wood ? woodTreeSide(wood, verbsOf(engine, wood)) : null,
    dead: dead ? deadTreeSide(dead, verbsOf(engine, dead)) : null,
  });
}

function publish(engine, buttons) {
  if (buttons) engine.setData?.('packTreeVerbs', buttons.map((b) => `${b.id}:${b.enabled ? 'enabled' : 'disabled'}`).join(','));
  engine.setData?.('packTreeLast', last);
}

/** Run one pack verb (pack button, QA autoplay, tests). */
export function runPackTreeVerb(engine, tool, verbId) {
  if (!isPackTreeTool(tool) || countItem(engine.inv, tool) < 1) return false;
  const plan = planPackTreeVerb(verbId, { working: working(engine, tool), find: finder(engine), verbsOf: (t) => verbsOf(engine, t) });
  if (!plan) return false;
  for (const line of plan.lines || []) {
    engine.pushActivity?.(line);
    engine.toast?.(line, 2600);
  }
  if (plan.run) {
    const started = engine.beginVerb?.(plan.run.target, plan.run.verb);
    last = `${tool}:${verbId}:${started === false ? 'busy' : plan.run.target.classId}`;
  } else {
    last = `${tool}:${verbId}:${plan.lines?.length ? 'nothing' : 'broken'}`;
  }
  publish(engine);
  return true;
}

export const packTreeVerbsFeature = {
  id: PACK_TREE_VERBS_FEATURE_ID,

  onStreetEnter(street, engine) {
    last = '';
    const auto = engine.param?.('packtreeautoplay');
    autoplayAt = auto ? Date.now() + 1500 : 0;
    publish(engine);
  },

  onTick(dtMs, now, engine) {
    if (!autoplayAt || now < autoplayAt) return;
    autoplayAt = 0;
    const verb = String(engine.param?.('packtreeautoplay') || '');
    const tool = countItem(engine.inv, 'hatchet') > 0 ? 'hatchet' : 'class_axe';
    publish(engine, packTreeButtons(tool, conditionsFor(engine, tool)));
    runPackTreeVerb(engine, tool, verb);
  },

  /** wood_tree.js:442-472: a wee tree's harvest is "Harvest and Clear". */
  decorateVerbs(target, verbs) {
    return relabelWeeHarvest(target, verbs);
  },

  packVerbs(classTsid, engine) {
    if (!isPackTreeTool(classTsid) || countItem(engine.inv, classTsid) < 1) return [];
    const buttons = packTreeButtons(classTsid, conditionsFor(engine, classTsid));
    publish(engine, buttons);
    return buttons;
  },

  runPackVerb(classTsid, verbId, engine) {
    if (!isPackTreeTool(classTsid)) return false;
    if (!['harvest', 'clear', 'harvest_clear'].includes(verbId)) return false;
    runPackTreeVerb(engine, classTsid, verbId);
    return true;
  },

  /** Tests. */
  _state() {
    return { last };
  },
  _reset() {
    last = '';
    autoplayAt = 0;
  },
};
