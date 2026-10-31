/**
 * Player slash commands in Local chat (register row G160), as a feature module
 * (see js/feature-host.js). Rules, source lines and what is left out live in
 * js/slash-commands.js.
 *
 * game.js asks `chatCommand` before saying a line that starts with "/"; the
 * first feature to answer wins (small-items-feature answers /beans before this
 * one). A line nobody answers then gets `unknownChatCommand`, the source's
 * "Unknown command: /line" (main.js:1931), so slash lines are never said aloud.
 *
 * - /makegod, /xyzzy: the source's lines in the activity log (and a toast).
 * - /who: "Ur is here", or the Glitches chatting on the street too.
 * - /home, /house, /leave: the Home panel's travel (engine.homeTravel); /house
 *   lands inside the house, /home on the home street; at home they move between
 *   the house and the street. Without a home the Home panel opens.
 * - /tower: the Tower's ground floor at its teleport point (towerApi.goToFloor
 *   via 'door'); "You don't have a tower!" until it is built.
 * - /butler: the Butler's click response, 0.5 to 1 s later (bag_butler.js
 *   sendIM), in the activity log; silent without a Butler, as in the source.
 * - has_used_house_command / has_used_tower_command are kept (saved) for the
 *   Butler hints that teach /house and /tower (butler_hints.js:382-399).
 * - /tp: the administrators' teleport (js/admin-teleport.js, v0.2.2), multiplayer
 *   only; the site's admin/teleport route decides who may, and anyone else sees
 *   the ordinary Unknown command line. Solo says /tp is not available.
 *
 * QA: type the commands into Local chat. Canvas data: slashLast
 *     (`<command>:<outcome>`, `/tp:<kind>:<outcome>` once a /tp is answered),
 *     slashLine (the last line shown).
 */

import { BUTLER_STRINGS } from '../butler.js?v=814ee05f';
import { butlerApi } from './butler-feature.js?v=6e0ef3d0';
import { hellFeature } from './hell-feature.js?v=2d9958f9';
import { towerApi } from './home-tower-feature.js?v=a9047342';
import { slashPlan, unknownLine } from '../slash-commands.js?v=23e13b20';
import { parseTp, runTeleportCommand, TP_TEXT } from '../admin-teleport.js?v=fa56e8df';
import { minnUrls } from '../minn-account.js?v=81339760';
import { saveStore } from '../save-store.js?v=b74a8113';
import { STREET_INDEX } from '../street-loader.js?v=390e4702';

export const SLASH_COMMANDS_FEATURE_ID = 'slash-commands';

let used = { house: false, tower: false };
let last = '';
let lastLine = '';

function publish(engine) {
  engine.setData?.('slashLast', last);
  engine.setData?.('slashLine', lastLine);
}

/** pc.sendActivity: the activity log, with a toast so the answer shows beside the chat. */
function activity(engine, line) {
  lastLine = line;
  engine.pushActivity?.(line);
  engine.toast?.(line, 3200);
}

/** The remake's state for js/slash-commands.js slashPlan. */
export function slashContext(engine) {
  const home = engine.homeContext?.() || {};
  const tower = towerApi.state?.() || {};
  return {
    who: engine.whoIsHere?.() || ['Ur'],
    home,
    towerBuilt: tower.built === true,
    onTowerFloor: home.inHome === true && home.room === 'interior' && towerApi.currentFloor?.() != null,
    dead: hellFeature.isDead?.() === true,
    busy: engine.acting?.() === true,
    instance: engine.transientInstance?.() === true,
    butlerOwned: butlerApi.owned?.() === true,
  };
}

async function runStep(engine, step) {
  if (step === 'tower') return towerApi.goToFloor(engine, 0, 'door');
  if (step === 'house-from-tower') {
    towerApi.clearFloor();
    return engine.refreshHomeScene?.({ arrive: 'door' });
  }
  if (step === 'teleport-inside') towerApi.clearFloor();
  return engine.homeTravel?.(step);
}

async function travel(engine, plan) {
  for (const step of plan.travel) {
    const result = await runStep(engine, step);
    // teleportHome answers { ok:false } when it opened the Home panel or an instance blocked it.
    if (result === false || result?.ok === false) {
      last = `${plan.command}:${step}:${result?.reason || 'blocked'}`;
      publish(engine);
      return;
    }
  }
  last = `${plan.command}:${plan.travel.join('+')}`;
  engine.save?.();
  publish(engine);
}

/** bag_butler.js sendIM: a 500 to 1000 ms delay "for realism", then the line. */
function butlerIm(engine, rand = Math.random) {
  const lines = BUTLER_STRINGS.normalClickResponseList;
  const line = lines[Math.floor(rand() * lines.length) % lines.length];
  const name = butlerApi.label?.() || 'Butler';
  setTimeout(() => {
    activity(engine, `${name}: ${line}`);
    publish(engine);
  }, 500 + Math.floor(rand() * 500));
}

/** What /tp needs from the page (tests replace it). */
let tpDeps = () => {
  const baseUri = globalThis.document?.baseURI || globalThis.location?.href || '';
  return {
    fetch: globalThis.fetch?.bind(globalThis),
    baseUri,
    nonce: globalThis.GRODDLE_MP_BOOT?.nonce || '',
    nonceUrl: baseUri ? minnUrls(baseUri).nonce : '',
    streets: STREET_INDEX.streets,
    flush: () => saveStore.flush?.(),
  };
};

/** /tp <...>: multiplayer administrators only (js/admin-teleport.js). */
function teleportCommand(engine, text, args) {
  if (engine.mode !== 'multiplayer') {
    activity(engine, TP_TEXT.solo);
    last = '/tp:solo';
    publish(engine);
    return;
  }
  last = '/tp:asking';
  publish(engine);
  const deps = tpDeps();
  return runTeleportCommand(args, {
    ...deps,
    engine,
    say: (line) => { if (line) activity(engine, line); },
    unknown: () => activity(engine, unknownLine(text)),
  }).then((outcome) => {
    last = `/tp:${outcome}`;
    publish(engine);
    return outcome;
  });
}

/** Answer one slash line; null when this feature does not know it. */
export function runSlashCommand(engine, text) {
  const tp = parseTp(text);
  if (tp !== null) {
    teleportCommand(engine, text, tp);
    return true;
  }
  const plan = slashPlan(text, slashContext(engine));
  if (!plan) return null;
  if (plan.command === '/house') used.house = true;
  if (plan.command === '/tower') used.tower = true;
  if (plan.say) {
    activity(engine, plan.say);
    last = `${plan.command}:say`;
  } else if (plan.travel) {
    last = `${plan.command}:travelling`;
    travel(engine, plan);
  } else if (plan.butler) {
    last = `${plan.command}:butler`;
    butlerIm(engine);
  } else {
    last = `${plan.command}:silent`;
  }
  publish(engine);
  return true;
}

export const slashCommandsFeature = {
  id: SLASH_COMMANDS_FEATURE_ID,

  /** game.js local chat: main.js doChatCommand, the commands a player can use. */
  chatCommand(text, engine) {
    return runSlashCommand(engine, text);
  },

  /** game.js local chat, after every feature passed: main.js:1931. */
  unknownChatCommand(text, engine) {
    const line = unknownLine(text);
    activity(engine, line);
    last = 'unknown';
    publish(engine);
    return true;
  },

  save() {
    return { version: 1, usedHouse: used.house, usedTower: used.tower };
  },

  restore(slice) {
    used = { house: slice?.usedHouse === true, tower: slice?.usedTower === true };
  },

  /** butler_hints.js:382, :392: has the player used /house or /tower yet. */
  usedCommand(name) {
    return name === 'house' ? used.house : name === 'tower' ? used.tower : false;
  },

  /** Tests: what /tp reaches instead of the page (fetch, baseUri, nonce, nonceUrl, streets, flush). */
  _setTeleportDeps(fn) {
    tpDeps = fn;
  },

  /** Tests. */
  _state() {
    return { used: { ...used }, last, lastLine };
  },
  _reset() {
    used = { house: false, tower: false };
    last = '';
    lastLine = '';
  },
};
