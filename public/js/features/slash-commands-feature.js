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
 *   In multiplayer the IM goes to the Butler's chat, and "/butler <command>"
 *   is an IM to it (features/butler-im-feature.js butlerImCommand, G367).
 * - has_used_house_command / has_used_tower_command are kept (saved) for the
 *   Butler hints that teach /house and /tower (butler_hints.js:382-399).
 * - /stuck (the remake's own; js/slash-commands.js STUCK_TEXT, REMAKE_COMMANDS):
 *   back to where you arrived on this street (engine.stuckReturn: the signpost
 *   or door you came through, else the street's own arrival), standing on the
 *   floor, with the street's event physics dropped and its launch pads re-armed
 *   (location-events-feature stuck: reports #194, #198), or at home to the door
 *   (house, home street or tower floor). In a quest room it leaves the room, back
 *   where you came in, as the room's Leave does (an unfinished quest ends; Austin
 *   2026-11-12), with no cooldown. Otherwise once
 *   every 5 minutes (saved, so a reload does not reset it); refused with its
 *   reason in a race, a Paradise course or another place with its own Leave, dead in
 *   Hell (the grapes), or busy. Online it is a move on the same street like any
 *   step: the realtime server shares it as it shares every move (hub.go "move").
 *   G528: the first time you stand 12 s on a floor a plain jump can't leave
 *   (js/street-traps-data.js, by your jump), a one-time hint names /stuck. The /
 *   key opens the box without its slash, so a line that is only a command's name
 *   typed in a box it opened runs that command (js/slash-commands.js bareCommand).
 * - /tp: the administrators' teleport (js/admin-teleport.js, v0.2.2), multiplayer
 *   only; the site's admin/teleport route decides who may, and anyone else sees
 *   the ordinary Unknown command line. Solo says /tp is not available.
 *
 * - "/", "/help" or "/?" on its own (CMDHELP, Austin 2026-11-03; the source had no
 *   /help): the command list (js/slash-commands.js COMMAND_HELP) as local lines in
 *   the chat it was typed in, never sent: notes in that drawer conversation online
 *   (Local, Live Help, a group, an IM, the party), one Activity entry solo.
 * - G563: a listed command with one letter in front ("d/home", "a/leave": a walking key's letter
 *   that landed in the box as it opened) runs that command (js/slash-commands.js strayLetterCommand).
 * - A message that ends with a listed command ("aaaa/leave") is still said as typed;
 *   a local line after it says "Commands go at the start of a message: /leave".
 *
 * QA: type the commands into Local chat. Canvas data: slashLast
 *     (`<command>:<outcome>`, `/tp:<kind>:<outcome>` once a /tp is answered,
 *     `/stuck:<arrival|street|home-door|tower-door|quest-room|refused|failed>`),
 *     slashLine (the last line shown).
 */

import { BUTLER_STRINGS } from '../butler.js?v=a660e585';
import { butlerApi } from './butler-feature.js?v=a29c18c5';
import { hellFeature } from './hell-feature.js?v=7477c8c7';
import { locationEventsApi } from './location-events-feature.js?v=f2b6c156';
import { towerApi } from './home-tower-feature.js?v=2c6161ce';
import { platformYAt, platformsScreen } from '../street-model.js?v=b6cb6a4e';
import { COMMAND_HELP_INTRO, STUCK_COOLDOWN_MS, STUCK_TEXT, bareCommand, commandHelpLines, commandHint, isCommandHelp, misplacedCommand, slashPlan, strayLetterCommand, unknownLine } from '../slash-commands.js?v=ec0e84ee';
import { parseTp, runTeleportCommand, TP_TEXT } from '../admin-teleport.js?v=fa56e8df';
import { minnUrls } from '../minn-account.js?v=c15f0ecf';
import { saveStore } from '../save-store.js?v=04420633';
import { STREET_INDEX } from '../street-loader.js?v=18b181ad';

export const SLASH_COMMANDS_FEATURE_ID = 'slash-commands';

let used = { house: false, tower: false };
/** When /stuck last moved you (ms since epoch), for its 5 minute cooldown. */
let stuckAt = 0;
/** G528: seconds on a trap floor before /stuck's one hint, and how often the feet are checked. */
export const STUCK_HINT_DWELL_MS = 12000;
const TRAP_CHECK_MS = 500;
/** The hint has been shown (once a character, saved). */
let stuckHinted = false;
/** This street's trap floors, screen space, each with `trapJump` (js/street-traps-data.js). */
let trapLines = [];
let trapStreet = null;
let trapMs = 0;
let trapCheckAt = 0;
/** Tests replace the clock. */
let now = () => Date.now();
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
    questRoom: engine.query?.('questRoomHere', engine) || null,
    butlerOwned: butlerApi.owned?.() === true,
    stuckWaitMs: Math.max(0, stuckAt + STUCK_COOLDOWN_MS - now()),
  };
}

/** HTML-safe text for the solo Activity entry. */
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * Lines shown only to you, in the chat you typed in (`where`, the drawer's
 * conversation at submit): notes online, else one Activity log entry (solo's
 * drawer is the Activity log, with the chat box under it). Never sent.
 * Answers where they went: the conversation's id, or 'activity'.
 */
export function showLocalLines(engine, lines, where = engine.social?.showing) {
  const social = engine.social;
  if (engine.mode === 'multiplayer' && social) {
    for (const id of [where, 'local']) {
      if (!id || !social.has?.(id)) continue;
      if (lines.every((text) => social.push(id, { note: true, text }))) return id;
    }
  }
  const [head, ...rest] = lines;
  const html = [esc(head), ...rest.map((l) => { const [cmd, ...what] = l.split('  '); return what.length ? `<b>${esc(cmd)}</b> ${esc(what.join('  '))}` : esc(l); })].join('<br>');
  if (engine.notify?.log) engine.notify.log(lines.join(' '), { kind: 'help', html });
  else for (const l of lines) engine.pushActivity?.(l);
  return 'activity';
}

/**
 * PURE: a street's trap floors, screen space, each with the highest jump it traps at
 * (`trapJump`), or, for a floor that traps only along part of it, `trapRuns` [jump, x1, x2]
 * (js/street-traps-data.js; Wintry Place's floor traps only in the slot right of its ice blocks).
 */
export function trapLinesOn(street, traps) {
  const row = street?.tsid && traps && (traps[street.tsid] || traps[`G${String(street.tsid).slice(1)}`]);
  if (!row || !Array.isArray(street.platforms)) return [];
  return platformsScreen(street).filter((p) => row[p.id] != null).map((p) => (Array.isArray(row[p.id])
    ? { ...p, trapJump: Math.max(...row[p.id].map((r) => r[0])), trapRuns: row[p.id] }
    : { ...p, trapJump: row[p.id] }));
}

/** PURE: standing on a floor, or the part of one, that traps this jump. */
export function onTrapFloor(lines, player, jump = 1) {
  if (!player?.onGround) return false;
  return lines.some((p) => {
    if (jump > p.trapJump + 1e-6) return false;
    if (p.trapRuns && !p.trapRuns.some(([j, x1, x2]) => jump <= j + 1e-6 && player.x >= x1 && player.x <= x2)) return false;
    const y = platformYAt(p, player.x);
    return y != null && Math.abs(y - player.y) <= 8;
  });
}

/**
 * The trap floors' list, loaded the first time it's asked for (70 KB, no use once the hint has
 * shown). A failed load costs only the hint.
 */
let trapData = null;
function loadTraps() {
  trapData ||= import('../street-traps-data.js?v=b2911c49').then((m) => m.STREET_TRAPS).catch(() => null);
  return trapData;
}

/** One hint, once a character, after a while on a floor you can't jump off and only when /stuck would move you. */
function stuckHintTick(engine) {
  const t = now();
  const gap = trapCheckAt ? Math.min(TRAP_CHECK_MS * 4, t - trapCheckAt) : 0;
  if (trapCheckAt && gap < TRAP_CHECK_MS) return;
  trapCheckAt = t;
  if (!engine.started || engine.busy?.()) return;
  if (!onTrapFloor(trapLines, engine.player, engine.movementBuff?.()?.jump ?? 1)) return;
  trapMs += gap;
  if (trapMs < STUCK_HINT_DWELL_MS) return;
  if (slashPlan('/stuck', slashContext(engine))?.stuck !== 'arrival') return;
  stuckHinted = true;
  trapLines = [];
  lastLine = STUCK_TEXT.hint;
  engine.pushActivity?.(STUCK_TEXT.hint);
  engine.toast?.(STUCK_TEXT.hint, 8000);
  last = '/stuck:hint';
  publish(engine);
  engine.save?.();
}

/** /stuck's move: the street's arrival, or the door at home. */
async function stuck(engine, plan) {
  let result;
  if (plan.stuck === 'quest-room') {
    // Out of the quest room as its Leave does (quest-instances-feature questRoomLeave); no cooldown.
    const room = engine.query?.('questRoomHere', engine);
    result = await engine.query?.('questRoomLeave', engine, { transition: engine.param?.('questfx') !== '0' });
    if (!result) {
      last = '/stuck:failed:quest-room';
      publish(engine);
      return;
    }
    activity(engine, room?.solved ? STUCK_TEXT.doneQuestRoomSolved : STUCK_TEXT.doneQuestRoom);
    last = '/stuck:quest-room';
    publish(engine);
    return;
  }
  if (plan.stuck === 'tower-door') result = await towerApi.goToFloor(engine, towerApi.currentFloor?.() ?? 0, 'door');
  else if (plan.stuck === 'home-door') result = await engine.refreshHomeScene?.({ arrive: 'door', spawnX: undefined });
  else result = engine.stuckReturn?.();
  if (result === false || result?.ok === false || result == null) {
    last = `/stuck:failed:${result?.reason || 'blocked'}`;
    publish(engine);
    return;
  }
  // Put back on the street's arrival with its event physics dropped (a gut tube's reversed
  // gravity, a launch's jetpack) and its launch pads re-armed: reports #194, #198.
  if (plan.stuck === 'arrival') locationEventsApi.stuck(engine);
  stuckAt = now();
  activity(engine, plan.stuck === 'arrival' ? STUCK_TEXT.done : STUCK_TEXT.doneHome);
  last = `/stuck:${plan.stuck === 'arrival' ? result.from || 'arrival' : plan.stuck}`;
  engine.save?.();
  publish(engine);
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
  if (isCommandHelp(text)) {
    const where = showLocalLines(engine, commandHelpLines());
    lastLine = COMMAND_HELP_INTRO;
    last = `/help:${where}`;
    publish(engine);
    return true;
  }
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
  } else if (plan.stuck) {
    last = '/stuck:moving';
    stuck(engine, plan);
  } else if (plan.travel) {
    last = `${plan.command}:travelling`;
    travel(engine, plan);
  } else if (plan.butler) {
    last = `${plan.command}:butler`;
    const rest = String(text || '').trim().replace(/^\/butler\b\s*/i, '');
    if (!engine.query?.('butlerImCommand', rest, engine)) butlerIm(engine);
  } else {
    last = `${plan.command}:silent`;
  }
  publish(engine);
  return true;
}

/**
 * A message ending with a listed command ("aaaa/leave"): it goes out as typed (every
 * chat's own submit handler), then a local hint shows in the same chat. Capture on the
 * document, before the drawer and the chats read or clear the box.
 */
let engineRef = null;
let hintBound = false;
/** G528: the chat box was opened by the / key and nothing has been typed elsewhere since (bareCommand). */
let slashOpened = false;
const CHAT_INPUT = 'local-chat-input';

/** The / key, outside any field: after the drawer's own handler has run, did it open the box? */
function onSlashKey(e) {
  if (e?.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
  setTimeout(() => {
    const box = globalThis.document?.getElementById(CHAT_INPUT);
    slashOpened = Boolean(box) && globalThis.document.activeElement === box && !box.value.trim();
  }, 0);
}

function onChatBlur(e) {
  if (e?.target?.id === CHAT_INPUT) slashOpened = false;
}
/** The hint waits this long, so it lands after your own line (a channel's comes back from the server). */
export const HINT_DELAY_MS = 500;
function onChatSubmit(e) {
  const engine = engineRef;
  if (!engine?.started || e?.target?.id !== 'local-chat-form') return;
  const box = globalThis.document?.getElementById(CHAT_INPUT);
  if (slashOpened) {
    slashOpened = false;
    const bare = bareCommand(box?.value);
    if (bare) {
      box.value = bare;
      last = `slash-key:${bare}`;
      publish(engine);
      return;
    }
  }
  // G563: "d/home" is /home (the walking key's letter came first), before every chat reads the box.
  const stray = strayLetterCommand(box?.value);
  if (stray) {
    box.value = stray;
    last = `stray-letter:${stray}`;
    publish(engine);
    return;
  }
  const cmd = misplacedCommand(box?.value);
  if (!cmd) return;
  const where = engine.social?.showing;
  setTimeout(() => {
    showLocalLines(engine, [commandHint(cmd)], where);
    last = `hint:${cmd}`;
    lastLine = commandHint(cmd);
    publish(engine);
  }, HINT_DELAY_MS);
}

export const slashCommandsFeature = {
  id: SLASH_COMMANDS_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    if (!hintBound && typeof document !== 'undefined') {
      document.addEventListener('submit', onChatSubmit, true);
      document.addEventListener('keydown', onSlashKey, true);
      document.addEventListener('focusout', onChatBlur, true);
      hintBound = true;
    }
  },

  /** Tests: the hint's submit handler. */
  _onChatSubmit: (e) => onChatSubmit(e),

  /** Tests: the / key's handlers. */
  _onSlashKey: (e) => onSlashKey(e),
  _onChatBlur: (e) => onChatBlur(e),

  onStreetEnter(street) {
    trapLines = [];
    trapMs = 0;
    trapCheckAt = 0;
    if (stuckHinted || !street?.tsid) return undefined;
    trapStreet = street;
    return loadTraps().then((traps) => {
      if (trapStreet === street && !stuckHinted) trapLines = trapLinesOn(street, traps);
    });
  },

  onStreetClear() {
    trapStreet = null;
    trapLines = [];
    trapMs = 0;
    trapCheckAt = 0;
  },

  onTick(_dtMs, _now, engine) {
    if (trapLines.length && !stuckHinted) stuckHintTick(engine);
  },

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
    return { version: 1, usedHouse: used.house, usedTower: used.tower, ...(stuckAt ? { stuckAt } : {}), ...(stuckHinted ? { stuckHinted: true } : {}) };
  },

  restore(slice) {
    used = { house: slice?.usedHouse === true, tower: slice?.usedTower === true };
    const at = Math.floor(Number(slice?.stuckAt));
    stuckAt = Number.isFinite(at) && at > 0 ? Math.min(at, now()) : 0;
    stuckHinted = slice?.stuckHinted === true;
  },

  /** butler_hints.js:382, :392: has the player used /house or /tower yet. */
  usedCommand(name) {
    return name === 'house' ? used.house : name === 'tower' ? used.tower : false;
  },

  /** Tests: the clock /stuck's cooldown reads. */
  _setClock(fn) {
    now = typeof fn === 'function' ? fn : () => Date.now();
  },

  /** Tests: what /tp reaches instead of the page (fetch, baseUri, nonce, nonceUrl, streets, flush). */
  _setTeleportDeps(fn) {
    tpDeps = fn;
  },

  /** Tests. */
  _state() {
    return { used: { ...used }, last, lastLine, stuckAt, stuckHinted, trapMs };
  },
  _reset() {
    used = { house: false, tower: false };
    stuckAt = 0;
    stuckHinted = false;
    slashOpened = false;
    trapLines = [];
    trapMs = 0;
    trapCheckAt = 0;
    last = '';
    lastLine = '';
  },
};
