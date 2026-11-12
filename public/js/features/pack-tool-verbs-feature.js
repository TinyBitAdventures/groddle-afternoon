/**
 * The Pick's Use, the Shovel's dig and harvest and the Scraper's scrape from the pack, as a feature
 * module (see js/feature-host.js). Rules, source lines and remake decisions live in
 * js/pack-tool-verbs.js; the Hatchet's own (G165) are pack-tree-verbs-feature.js.
 *
 * Each runs the nearest node's own verb (engine.beginVerb, the same timed swing, wear and refusals
 * as clicking it); a plain Pick's Use names the plain Pick for that swing (js/tool-choice.js).
 *
 * QA: canvas data packToolVerbs (the buttons the last tool shows, `id:state`), packToolLast.
 */

import { countItem } from '../inventory.js?v=54d08d52';
import { getToolCondition } from '../tools.js?v=62b37c51';
import { ROCK_CATALOG, knowsMining } from '../mining.js?v=862548f1';
import { chooseTool } from '../tool-choice.js?v=e0dcb60e';
import {
  findCloseTarget,
  isPackTool,
  nodesFor,
  packToolButtons,
  packToolCondition,
  packToolVerbIds,
  planPackToolVerb,
} from '../pack-tool-verbs.js?v=479afbd9';

export const PACK_TOOL_VERBS_FEATURE_ID = 'pack-tool-verbs';

let last = '';

function verbsOf(engine, target) {
  try {
    return engine.targetVerbs?.(target) || [];
  } catch {
    return [];
  }
}

function ctxFor(engine, tool, verbId) {
  const from = engine.player;
  const targets = engine.interactables || [];
  const find = (predicate, reach) => findCloseTarget(targets, from, predicate, reach);
  return {
    tool,
    working: !getToolCondition(engine.toolState || {}, tool).broken,
    knowsMining: knowsMining(engine.learnedSkills || []),
    nodes: nodesFor(verbId, { find, verbsOf: (t) => verbsOf(engine, t) }),
    rockType: (t) => t?.state?.rock?.rockType || ROCK_CATALOG[t?.classId]?.rockType || '',
  };
}

function publish(engine, buttons) {
  if (buttons) engine.setData?.('packToolVerbs', buttons.map((b) => `${b.id}:${b.enabled ? 'enabled' : 'disabled'}`).join(','));
  engine.setData?.('packToolLast', last);
}

/** The buttons a tool shows where the avatar stands. */
export function packToolButtonsFor(engine, tool) {
  const conditions = {};
  for (const id of packToolVerbIds(tool)) conditions[id] = packToolCondition(id, ctxFor(engine, tool, id));
  return packToolButtons(tool, conditions);
}

/** Run one pack verb (pack button, tests). */
export function runPackToolVerb(engine, tool, verbId) {
  if (!isPackTool(tool) || countItem(engine.inv, tool) < 1 || !packToolVerbIds(tool).includes(verbId)) return false;
  const plan = planPackToolVerb(verbId, ctxFor(engine, tool, verbId));
  for (const line of plan.lines || []) {
    engine.pushActivity?.(line);
    engine.toast?.(line, 2600);
  }
  if (plan.run) {
    if (plan.run.choose) chooseTool(plan.run.target, plan.run.choose.cls, { force: plan.run.choose.force === true });
    const started = engine.beginVerb?.(plan.run.target, plan.run.verb);
    last = `${tool}:${verbId}:${started === false ? 'busy' : plan.run.target.classId}`;
  } else {
    last = `${tool}:${verbId}:${plan.lines?.length ? 'nothing' : 'quiet'}`;
  }
  publish(engine);
  return true;
}

export const packToolVerbsFeature = {
  id: PACK_TOOL_VERBS_FEATURE_ID,

  onStreetEnter(street, engine) {
    last = '';
    publish(engine);
  },

  packVerbs(classTsid, engine) {
    if (!isPackTool(classTsid) || countItem(engine.inv, classTsid) < 1) return [];
    const buttons = packToolButtonsFor(engine, classTsid);
    publish(engine, buttons);
    return buttons;
  },

  runPackVerb(classTsid, verbId, engine) {
    if (!isPackTool(classTsid) || !packToolVerbIds(classTsid).includes(verbId)) return false;
    runPackToolVerb(engine, classTsid, verbId);
    return true;
  },

  /** Tests. */
  _state() {
    return { last };
  },
  _reset() {
    last = '';
  },
};
