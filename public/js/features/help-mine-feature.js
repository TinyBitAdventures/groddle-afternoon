/**
 * Help mine (G207): mine a rock with the local companions. Rules in
 * js/help-mine.js (GameServerJS items/include/mining.js 8-120, 222-225,
 * 327-383, 501-505; quests/help_mine.js).
 *
 *   - A companion sometimes works a rock near you (on its own platform, at
 *     most one rock each per street visit, only while you know Mining and
 *     carry a working pick). While it swings, the rock's verb reads
 *     "help mine"; mining then counts for I Me Mine (help_mine, 3 needed).
 *   - When you start mining, an idle companion close to the rock may join
 *     you (at most once each per visit). Each helper adds min(i+1, 4) chunks
 *     to your swing, and you read the source's "You got N additional ...".
 *   - Companions take their own chunks from the rock (their roll plus their
 *     help bonus) but always leave COMPANION_MINE_RULES.leaveChunks, and a
 *     companion called away (a Feat, the bear, a quoin) stops at once.
 *
 * In multiplayer the crew is real players and the realtime server keeps it
 * (groddle-afternoon-server objects.go, through street-objects-feature's
 * sharedMineSwing / sharedMiners / sharedVerbGrant): your swing at a shared
 * rock tells the server it starts (or is cancelled, game.js verbCancelled);
 * "help mine" shows while someone else swings; your landed swing's answer
 * carries the bonus from everyone who helped, and the line names them.
 * Companions stay solo stand-ins.
 *
 * Help dig (G329, js/help-dig.js; dirt_pile.js addDigger, onDigComplete), in
 * multiplayer only: a Dirt Pile keeps a dig crew on the realtime server as a
 * rock keeps its miners (street-objects-feature sharedDigSwing /
 * sharedDiggers). The dig verb reads "Help dig" while someone else digs; a
 * dig that had helpers gets the server's bonus items (and Loam when the
 * crew's chance came up, applied by resource-nodes-feature), the source's
 * "You got N additional ... thanks to the help you got from ..." line, and
 * counts helped_dig for It Takes Two. Solo has no dig crews (the source's
 * helpers were other players; the companions only mine).
 *
 * On a home street (G947, M3, #464) the same queries are answered by home-crew-mp-feature, whose
 * crews the server's home_crew.go keeps, for the owner and every visitor: a visitor's landed swing
 * or dig brings its help with yard-verbs-mp-feature's grant (the site took and credited it); the
 * owner's own swing or dig ran on the owner's own rock or pile, so its help is the server's answer
 * to the landing (homeCrewLand), applied when it comes, and a rock's bonus comes off that rock.
 *
 * Companions are opt-in (?companions=1, game.js localCompanionsEnabled).
 * Hooks from game.js: engine.query('verbStarted', target, verb, engine) as a
 * timed verb begins, engine.query('rockMined', target, result, engine) after
 * the player's swing lands (before the rock is redrawn).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&helpminedemo=help
 *     (Amp works the nearest rock and you stand beside it; &helpmineautoplay=1
 *     helps three times, &helpminequest=1 accepts I Me Mine first so it
 *     completes). &helpminedemo=join puts companions round the rock and you
 *     on it (&helpminejoin=1-3 how many join; &helpmineautoplay=1 swings).
 * Canvas: data-help-mine-label, -crew, -last, -helps, -quest, -demo,
 *     data-help-mine-companion (the last companion swing: name:chunks).
 */

import { MINING_COSTS, ROCK_CATALOG, crumbleRock, findWorkingPick, miningProfile, miningToolWear, setMiningBuffs } from '../mining.js?v=7ecaa572';
import { rockId } from '../street-objects.js?v=2599de2a';
import { addItem, removeItem } from '../inventory.js?v=3be7988a';
import { MEGA_ROCK_CHUNKS } from '../imagination-effects.js?v=70169933';
import { crowdScaleX } from '../avatar-anims.js?v=fb921bf4';
import { frameTexture, loadTexture } from '../textures.js?v=b8e38103';
import { acceptOffer } from '../quest-offers.js?v=7e00498b';
import { CREW_NODES, CREW_VERBS, HELP_DIG_COUNTER, HELP_DIG_LABEL, HELP_SCRAPE_LABEL, digHelpFrom, helpDigMessage, helpScrapeMessage, othersDigging } from '../help-dig.js?v=7a854b00';
import {
  COMPANION_MINE_RULES,
  HELP_MINE_COUNTER,
  PLAYER_MINER,
  addMiner,
  companionCanJoin,
  companionMineTake,
  createRockCrew,
  helpBonusMessage,
  helpMineBonus,
  helperCount,
  helperIds,
  isHelpMining,
  mineVerbLabel,
  pickCompanionRock,
  removeMiner,
} from '../help-mine.js?v=27f9d276';
import { topUpMetabolic } from '../metabolics.js?v=48f784bf';

// js/node-tools.js PICK_SHEETS.pick (the SWF's 30 fps swing). A companion's pick stays beside it.
const PICK_SHEET = 'assets/sprites/tools/pick-tool@3x.webp';
const PICK_DEF = { fw: 115, fh: 63, cols: 11 };
const PICK_FRAMES = 33;

/** target -> crew for the rocks on this street (live only, like the source rock's miners). */
const crews = new Map();
/** companion name -> { sessions, joins, nextLookAt } for this street visit. */
const interest = new Map();
/** companion name -> session at a rock. */
const sessions = new Map();
let playerAt = null; // { target, helping }
let playerDig = null; // multiplayer: { target, helping } while your dig at a Dirt Pile runs
let digHelps = 0;
let pickFrames = null;
let pickLoading = false;
let helps = 0;
let demo = null;

const isRock = (target) => Boolean(target && ROCK_CATALOG[target.classId] && target.state?.rock);

function crewOf(target) {
  let crew = crews.get(target);
  if (!crew) crews.set(target, (crew = createRockCrew()));
  return crew;
}

function publishCrews(engine) {
  const rows = [];
  for (const [target, crew] of crews) if (crew.miners.length) rows.push(`${target.classId}:${crew.miners.join('+')}`);
  engine.setData('helpMineCrew', rows.join('|') || 'none');
}

function publishQuest(engine) {
  const qs = engine.questState;
  if ((qs?.completed || []).includes('help_mine')) engine.setData('helpMineQuest', 'completed');
  else if (qs?.active?.help_mine) engine.setData('helpMineQuest', `active:${Number(qs.active.help_mine.progress?.[HELP_MINE_COUNTER]) || 0}/3`);
}

/** The player could help: knows Mining and carries a working pick (content.js mine verb gate). */
function playerCanMine(engine) {
  const learned = engine.learnedSkills || [];
  return learned.some((id) => /^mining_[1-4]$/.test(id)) && Boolean(findWorkingPick(engine.inv || {}, engine.toolState, miningToolWear(learned)));
}

function swingMs() {
  // The companions swing at Mining I at the remake's pace (G983: 6 s), as yours does (mining.js miningProfile).
  return miningProfile(['mining_1'], 'pick')?.durationMs || MINING_COSTS.waitMs;
}

function rockRows(engine) {
  return (engine.interactables || [])
    .filter((t) => isRock(t) && t.sprite && !t.sprite.destroyed)
    .map((t) => ({
      target: t,
      x: t.sprite.x,
      y: t.sprite.y,
      chunks: t.state.rock.chunksRemaining,
      depleted: Boolean(t.state.rock.depleted),
      busy: crewOf(t).miners.length > 0,
    }));
}

function liveCompanions(engine) {
  return (engine.localCompanions || []).filter((a) => a?.sprite && !a.sprite.destroyed);
}

function interestOf(name, now) {
  let row = interest.get(name);
  if (!row) interest.set(name, (row = { sessions: 0, joins: 0, nextLookAt: now + COMPANION_MINE_RULES.lookMs }));
  return row;
}

function idle(actor, now) {
  return !sessions.has(actor.name) && now >= (actor.socialUntil || 0) && !actor.state?.following;
}

function companionView(actor, row) {
  return { x: actor.sprite.x, y: actor.sprite.y, sessions: row.sessions, joins: row.joins };
}

/**
 * Whether a companion can walk from its feet to `toX` and end level with the
 * rock: follow the ground in 24 px steps the way game.js
 * updateLocalCompanions does (groundBeneath: the highest platform at or
 * below the feet, gentle rises only), refusing a drop of more than 60 px (a
 * pit it could not climb back out of). No street geometry (tests): yes.
 */
function levelWalk(engine, actor, toX, rockY) {
  const platforms = engine.platforms || [];
  if (!platforms.length) return true;
  let y = actor.sprite.y;
  const from = actor.sprite.x;
  const steps = Math.max(1, Math.ceil(Math.abs(toX - from) / 24));
  for (let i = 1; i <= steps; i++) {
    const x = from + ((toX - from) * i) / steps;
    let ground = null;
    for (const p of platforms) {
      if (x < Math.min(p.x1, p.x2) || x > Math.max(p.x1, p.x2)) continue;
      const py = p.y1 + ((x - p.x1) / ((p.x2 - p.x1) || 1)) * (p.y2 - p.y1);
      if (py >= y - 24 && (ground === null || py < ground)) ground = py;
    }
    if (ground === null || ground - y > 60) return false;
    y = ground;
  }
  return Math.abs(y - rockY) <= COMPANION_MINE_RULES.sameLevelY;
}

// —— The pick a companion swings (the same sheet as yours) ——
function ensurePickFrames(engine) {
  if (pickFrames || pickLoading || !engine.PIXI?.AnimatedSprite) return pickFrames;
  pickLoading = true;
  Promise.resolve().then(() => loadTexture(PICK_SHEET)).then((tex) => {
    pickFrames = Array.from({ length: PICK_FRAMES }, (_, i) => frameTexture(tex.source,
      new engine.PIXI.Rectangle((i % PICK_DEF.cols) * PICK_DEF.fw, Math.floor(i / PICK_DEF.cols) * PICK_DEF.fh, PICK_DEF.fw, PICK_DEF.fh)));
  }).catch(() => {}).finally(() => {
    pickLoading = false;
  });
  return null;
}

function showPick(engine, session) {
  const frames = ensurePickFrames(engine);
  if (!frames || session.tool) return;
  const actor = session.actor;
  const tool = new engine.PIXI.AnimatedSprite(frames);
  tool.anchor.set(0.5);
  tool.animationSpeed = 0.5; // 30 fps on the 60 fps ticker
  tool.loop = true;
  tool.eventMode = 'none';
  tool.label = 'helpMinePick';
  actor.sprite.addChild(tool);
  session.tool = tool;
  aimPick(session);
  tool.play();
}

function aimPick(session) {
  const tool = session.tool;
  if (!tool || tool.destroyed) return;
  const left = session.target.sprite.x < session.actor.sprite.x;
  // 50 px toward the rock, 46 px up, flipped for a rock on the left (your own pick plays on the rock).
  tool.x = left ? -50 : 50;
  tool.y = -46;
  tool.scale.set(left ? -1 : 1, 1);
}

function hidePick(session) {
  const tool = session.tool;
  session.tool = null;
  if (tool && !tool.destroyed) tool.destroy();
}

function faceRock(session) {
  const body = session.actor.body;
  if (!body || body.destroyed) return;
  body.facing = session.target.sprite.x < session.actor.sprite.x ? 'left' : 'right';
  body.scale.x = crowdScaleX(Math.abs(body.baseScale || 1), body.facing === 'left' ? -1 : 1, body.facesRight);
}

// —— Sessions ——
function standX(target, side) {
  return target.sprite.x + side * COMPANION_MINE_RULES.standOffX;
}

function startSession(actor, target, { kind, swings, side, now }) {
  const session = {
    actor,
    target,
    kind,
    swingsLeft: swings,
    standX: standX(target, side),
    phase: 'walk',
    walkUntil: now + COMPANION_MINE_RULES.walkMs,
    swingEndsAt: 0,
    tool: null,
  };
  sessions.set(actor.name, session);
  // A companion that joins you starts mining at once, so it is on your stack before your swing lands.
  if (kind === 'join') addMiner(crewOf(target), actor.name);
  actor.socialTargetX = session.standX;
  actor.socialUntil = now + COMPANION_MINE_RULES.walkMs;
  return session;
}

function endSession(session, engine, { cancel = false } = {}) {
  sessions.delete(session.actor.name);
  hidePick(session);
  const crew = crews.get(session.target);
  if (crew?.miners.includes(session.actor.name)) removeMiner(crew, session.actor.name, cancel);
  if (session.actor.socialTargetX === session.standX) session.actor.socialUntil = 0;
  publishCrews(engine);
}

/** One companion swing lands: its roll plus its help bonus, never below leaveChunks. */
function landCompanionSwing(session, engine, rng = Math.random) {
  const rock = session.target.state.rock;
  const def = ROCK_CATALOG[rock.classTsid] || ROCK_CATALOG[session.target.classId];
  const crew = crewOf(session.target);
  const roll = (def?.minChunks ?? 3) + Math.floor(rng() * ((def?.maxChunks ?? 9) - (def?.minChunks ?? 3) + 1));
  const taken = companionMineTake(rock.chunksRemaining, roll, helpMineBonus(helperCount(crew, session.actor.name)));
  rock.chunksRemaining -= taken;
  removeMiner(crew, session.actor.name, false);
  engine.refreshMineRock?.(session.target);
  engine.setData('helpMineCompanion', `${session.actor.name}:${taken}`);
  session.swingsLeft -= 1;
  return rock.chunksRemaining - COMPANION_MINE_RULES.leaveChunks >= (def?.maxChunks ?? 9);
}

function tickSession(session, now, engine) {
  const { actor, target } = session;
  const rock = target.state?.rock;
  const gone = !actor.sprite || actor.sprite.destroyed || !target.sprite || target.sprite.destroyed
    || !(engine.interactables || []).includes(target);
  // Someone else's call on the companion (a Feat, the bear, a quoin) wins.
  if (gone || !rock || rock.depleted || actor.socialTargetX !== session.standX || actor.state?.following) {
    endSession(session, engine, { cancel: true });
    return;
  }
  actor.socialUntil = Math.max(actor.socialUntil || 0, now + 400);
  if (session.phase === 'walk') {
    if (Math.abs(actor.sprite.x - session.standX) <= 6) {
      session.phase = 'swing';
      session.swingEndsAt = now + swingMs();
      // Its own rock: each swing is a new startMining (mining.js 243).
      if (session.kind === 'own') addMiner(crewOf(target), actor.name);
      publishCrews(engine);
    } else if (now > session.walkUntil) {
      endSession(session, engine, { cancel: true });
    }
    return;
  }
  ensurePickFrames(engine);
  showPick(engine, session);
  aimPick(session);
  faceRock(session);
  if (now < session.swingEndsAt) return;
  const more = landCompanionSwing(session, engine);
  if (session.kind === 'own' && session.swingsLeft > 0 && more) {
    addMiner(crewOf(target), actor.name);
    session.swingEndsAt = now + swingMs();
    publishCrews(engine);
    return;
  }
  endSession(session, engine);
}

function lookForRocks(now, engine) {
  if (engine.acting?.() || engine.busy?.() || !playerCanMine(engine)) return;
  const player = engine.player;
  if (!player) return;
  let rocks = null;
  for (const actor of liveCompanions(engine)) {
    const row = interestOf(actor.name, now);
    if (now < row.nextLookAt || !idle(actor, now)) continue;
    row.nextLookAt = now + COMPANION_MINE_RULES.lookMs;
    if (row.sessions >= COMPANION_MINE_RULES.perVisit || Math.random() >= COMPANION_MINE_RULES.chance) continue;
    rocks ||= rockRows(engine);
    const pick = pickCompanionRock({
      companion: companionView(actor, row),
      rocks,
      player,
      reachable: (rock) => levelWalk(engine, actor, standX(rock.target, Math.sign(actor.sprite.x - rock.x) || 1), rock.y),
    });
    if (!pick) continue;
    row.sessions += 1;
    pick.busy = true;
    const side = Math.sign(actor.sprite.x - pick.x) || 1;
    startSession(actor, pick.target, { kind: 'own', swings: COMPANION_MINE_RULES.swings, side, now });
  }
}

/** Multiplayer with the realtime server: the crew is the server's, made of real players. */
function sharedCrew(engine, target) {
  if (engine.mode !== 'multiplayer' || !engine.query?.('realtimeClient')) return null;
  const miners = engine.query('sharedMiners', target);
  if (!Array.isArray(miners)) return null;
  const me = Number(engine.query('realtimeClient')?.me?.id) || 0;
  return { miners, others: miners.filter((id) => id !== me) };
}

/**
 * #464: whether a swing helps is the server's word (objects.go handleMine answers obj_mine
 * { id, helping }: someone was already swinging when your start reached it), as Glitch's was
 * (items/include/mining.js 222-225: !help_mining when the rock has helpers as the swing starts,
 * counted for help_mine at 504-507). The crew this page copied lags, so a 3-2-1 group start read
 * nobody else there and counted no one; it stays the first guess until the answer lands.
 */
let answersFrom = null;
function hearServerAnswers(engine) {
  const client = engine.query?.('realtimeClient');
  if (!client?.on || answersFrom === client) return;
  answersFrom = client;
  client.on('msg:obj_mine', (msg) => {
    const target = playerAt?.shared ? playerAt.target : null;
    if (!Number.isInteger(target?.rockIndex) || msg?.id !== rockId(target.rockIndex) || typeof msg.helping !== 'boolean') return;
    playerAt.helping = msg.helping;
    engine.setData?.('helpMineHelping', msg.helping ? 'server:yes' : 'server:no');
  });
  // G947 (M3): on a home street the crew is home_crew.go's, and its answer names the rock by the
  // site's id (features/home-crew-mp-feature.js homeCrewId).
  client.on('msg:home_crew_ok', (msg) => {
    if (!playerAt?.shared || typeof msg?.helping !== 'boolean' || !String(msg.id || '').startsWith('rock:')) return;
    if (msg.id !== engine.query?.('homeCrewId', playerAt.target, engine)) return;
    playerAt.helping = msg.helping;
    engine.setData?.('helpMineHelping', msg.helping ? 'server:yes' : 'server:no');
  });
}

/** Your swing at a shared rock begins: the server adds you to its crew. */
function sharedStarts(target, crew, engine) {
  hearServerAnswers(engine);
  playerAt = { target, helping: crew.others.length > 0, shared: true };
  engine.query('sharedMineSwing', target, 'start');
  engine.setData('helpMineCrew', `shared:${crew.miners.length + 1}`);
}

/** Your shared swing lands: the bonus is the server's (mining.js 327-383), from everyone who helped. */
function sharedMined(target, result, engine) {
  const rock = result?.rock || target.state.rock;
  const grant = engine.query('sharedVerbGrant', target, 'mine');
  // G947 (M3): your own swing at a rock on your own home street ran here, on your own rock: the
  // crew's bonus is the server's answer to the landing (home_crew.go), and it comes off this rock.
  const own = grant ? null : engine.query('homeCrewLand', target, engine);
  const bonus = own && typeof own.then === 'function' ? 0 : mineBonus(target, rock, grant?.help, engine);
  if (bonus === 0 && own?.then) own.then((help) => mineBonus(target, rock, help, engine, { ownRock: true }));
  const helping = playerAt?.target === target && playerAt.helping;
  playerAt = null;
  if (helping) {
    helps += 1;
    engine.setData('helpMineHelps', String(helps));
    if (bonus <= 0) engine.setData('helpMineLast', 'helped');
    engine.achievement(HELP_MINE_COUNTER, 1);
    publishQuest(engine);
  }
}

/** A landed swing's help bonus into the pack, with the source's line; ownRock: it comes off the rock here too. */
function mineBonus(target, rock, help, engine, { ownRock = false } = {}) {
  const bonus = Math.max(0, Math.floor(Number(help?.bonus) || 0));
  if (bonus <= 0 || !rock) return 0;
  addItem(engine.inv, rock.chunkId, bonus);
  const names = Array.isArray(help.by) ? help.by.map(String) : [];
  engine.pushActivity(helpBonusMessage(rock.rockType, bonus, names));
  engine.floatText?.(target.sprite.x, target.sprite.y - 120, `+${bonus}`, 0xfff4d6);
  engine.setData('helpMineLast', `bonus:${bonus}:${names.join(',')}`);
  if (ownRock) {
    takeFromRock(rock, bonus, engine);
    engine.refreshMineRock?.(target);
  }
  engine.refreshPack?.();
  return bonus;
}

/** mining.js 383-419: the bonus comes off the rock too, and a rock it empties crumbles (as js/mining.js mineRock clears one). */
function takeFromRock(rock, bonus, engine) {
  rock.chunksRemaining -= bonus;
  if (rock.chunksRemaining <= 0 && !rock.depleted) {
    // js/pace.js rockRespawnMs: Glitch's 8 min at 0.3 (#521), more for a mega rock.
    crumbleRock(rock, engine.pc?.imaginationUpgrades || []);
    engine.pushActivity('The rock crumbles away. It will reform soon.');
  }
}

/**
 * G757 (It Takes Two): dirt_pile.js getVerbLabel 273-281 names the verb when the menu opens, so a
 * menu opened a moment before a friend started still read "Dig". An open Dirt Pile menu follows
 * the crew: its dig row reads "Help dig" while someone else digs, "Dig" when no one does. The
 * row runs the same verb either way (verbStarted asks the server at the start).
 */
const RELABEL_MS = 250;
let relabelAt = 0;
export function relabelOpenDig(engine, doc = globalThis.document) {
  const target = engine?.interactionTarget?.();
  if (target?.classId !== 'dirt_pile' || engine.mode !== 'multiplayer' || !doc) return null;
  const menu = doc.getElementById?.('verb-menu');
  if (!menu || menu.hidden) return null;
  const row = menu.querySelector('.vm-row[data-verb="dig"]');
  const text = row?.querySelector('.vm-label');
  const crew = sharedDigCrew(engine, target);
  if (!text || !crew) return null;
  if (!row.dataset.vmDigLabel) row.dataset.vmDigLabel = text.textContent === HELP_DIG_LABEL ? 'Dig' : text.textContent;
  const label = crew.others.length ? HELP_DIG_LABEL : row.dataset.vmDigLabel;
  if (text.textContent !== label) {
    text.textContent = label;
    const said = String(row.getAttribute('aria-label') || '').split(', ').slice(1);
    row.setAttribute('aria-label', [label, ...said].join(', '));
    engine.setData?.('helpDigLabel', crew.others.length ? label : '');
  }
  return label;
}

/** Multiplayer: the server's crew at a shared node ({ diggers, others }: js/help-dig.js CREW_NODES), or null. */
function sharedDigCrew(engine, target) {
  if (!CREW_NODES.has(target?.classId) || engine.mode !== 'multiplayer' || !engine.query?.('realtimeClient')) return null;
  const diggers = engine.query('sharedDiggers', target, engine);
  if (!Array.isArray(diggers)) return null;
  const me = Number(engine.query('realtimeClient')?.me?.id) || 0;
  return { diggers, others: othersDigging(diggers, me) };
}

/** Your dig landed (resource-nodes-feature resourceNodeUsed): the crew's bonus, from the server. */
function sharedDug(target, result, engine) {
  const grant = engine.query('sharedVerbGrant', target, 'dig', engine);
  playerDig = null;
  // G947 (M3): your own dig at a Dirt Pile on your own home street ran here: the crew's help is the
  // server's answer to the landing (home_crew.go), and its Loam turns the dig's Earth to Loam too
  // (dirt_pile.js 380-389, as resource-nodes-feature's loamBonus does with a grant).
  const own = grant ? null : engine.query('homeCrewLand', target, engine);
  if (own && typeof own.then === 'function') {
    own.then((raw) => {
      const help = digHelpFrom(raw);
      const earth = help?.loam ? (result?.outputs || []).filter((o) => o?.classTsid === 'earth').reduce((n, o) => n + (Number(o.qty) || 0), 0) : 0;
      if (earth > 0 && removeItem(engine.inv, 'earth', earth) !== false) addItem(engine.inv, 'loam', earth);
      digBonus(target, help, engine);
    });
    return;
  }
  digBonus(target, digHelpFrom(grant?.help), engine);
}

function digBonus(target, help, engine) {
  if (!help) {
    engine.setData('helpDigLast', 'alone');
    return;
  }
  if (help.items > 0) {
    addItem(engine.inv, help.classTsid, help.items);
    engine.pushActivity(helpDigMessage(help.items, help.classTsid, help.by));
    engine.floatText?.(target.sprite?.x ?? 0, (target.sprite?.y ?? 0) - 120, `+${help.items}`, 0xfff4d6);
    engine.refreshPack?.();
  }
  // dirt_pile.js 481-483: a dig that had help counts for It Takes Two.
  digHelps += 1;
  engine.achievement(HELP_DIG_COUNTER, 1);
  engine.setData('helpDigLast', `bonus:${help.items}:${help.classTsid}:${help.by.join(',')}`);
  engine.setData('helpDigHelps', String(digHelps));
}

/** Your scrape at a shared Ice Nubbin landed: one more Ice for each other scraper (ice_knob.js 270-317). */
function sharedScraped(target, result, engine) {
  const help = digHelpFrom(engine.query('sharedVerbGrant', target, 'scrape', engine)?.help);
  playerDig = null;
  if (!help?.items) {
    engine.setData('helpScrapeLast', 'alone');
    return;
  }
  addItem(engine.inv, 'ice', help.items);
  engine.pushActivity(helpScrapeMessage(help.items, help.by));
  engine.floatText?.(target.sprite?.x ?? 0, (target.sprite?.y ?? 0) - 120, `+${help.items}`, 0xfff4d6);
  // ice_knob.js 300: achievements_increment('ice', 'ice_received', got + bonus).
  engine.achievement('ice:ice_received', help.items);
  engine.refreshPack?.();
  engine.setData('helpScrapeLast', `bonus:${help.items}:${help.by.join(',')}`);
}

/** Your swing begins: are you helping, and does anyone join you? */
function playerStarts(target, engine, now = Date.now()) {
  const crew = crewOf(target);
  playerAt = { target, helping: isHelpMining(crew) };
  addMiner(crew, PLAYER_MINER);
  const player = engine.player;
  const rock = target.state.rock;
  const row = { x: target.sprite.x, y: target.sprite.y, chunks: rock.chunksRemaining, depleted: rock.depleted };
  const forced = demo?.mode === 'join' && !demo.joined ? demo.joinCount : 0;
  let joined = 0;
  for (const actor of liveCompanions(engine)) {
    const r = interestOf(actor.name, now);
    if (!idle(actor, now)) continue;
    if (forced) {
      if (joined >= forced) break;
    } else if (!companionCanJoin({ companion: companionView(actor, r), rock: row, reachable: () => levelWalk(engine, actor, target.sprite.x, target.sprite.y) })
      || Math.random() >= COMPANION_MINE_RULES.joinChance) {
      continue;
    }
    r.joins += 1;
    // The far side of the rock from you, a step further out for each extra helper.
    const side = player && player.x < target.sprite.x ? 1 : -1;
    const session = startSession(actor, target, { kind: 'join', swings: 1, side, now });
    session.standX += side * joined * 34;
    actor.socialTargetX = session.standX;
    joined += 1;
  }
  if (forced) demo.joined = true;
  publishCrews(engine);
}

/** Your swing lands (content.js runVerb mine succeeded). */
function playerMined(target, result, engine) {
  const crew = crews.get(target);
  if (!crew?.miners.includes(PLAYER_MINER)) return;
  const rock = result?.rock || target.state.rock;
  const n = helperCount(crew, PLAYER_MINER);
  const bonus = helpMineBonus(n);
  if (bonus > 0) {
    addItem(engine.inv, rock.chunkId, bonus);
    const msg = helpBonusMessage(rock.rockType, bonus, helperIds(crew, PLAYER_MINER));
    engine.pushActivity(msg);
    engine.floatText?.(target.sprite.x, target.sprite.y - 120, `+${bonus}`, 0xfff4d6);
    engine.setData('helpMineLast', `bonus:${bonus}:${helperIds(crew, PLAYER_MINER).join(',')}`);
    // mining.js 383: the rock gives up the bonus too.
    takeFromRock(rock, bonus, engine);
    engine.refreshPack?.();
  }
  removeMiner(crew, PLAYER_MINER, false);
  const helping = playerAt?.target === target && playerAt.helping;
  playerAt = null;
  publishCrews(engine);
  if (helping) {
    helps += 1;
    engine.setData('helpMineHelps', String(helps));
    if (bonus <= 0) engine.setData('helpMineLast', 'helped');
    // mining.js 501-505: quests_inc_counter('help_mine', 1) (I Me Mine).
    engine.achievement(HELP_MINE_COUNTER, 1);
    publishQuest(engine);
  }
}

/** mining.js miningSanityCheck: you are off the rock once your swing is no longer running. */
function sanity(engine) {
  // A shared swing ends by landing (sharedMined) or by verbCancelled; the server keeps the crew.
  if (!playerAt || playerAt.shared) return;
  const action = engine.currentAction;
  if (action && action.target === playerAt.target && String(action.verbId).split(':')[0] === 'mine') return;
  const crew = crews.get(playerAt.target);
  if (crew) removeMiner(crew, PLAYER_MINER, true);
  playerAt = null;
  publishCrews(engine);
}

// —— QA staging ——
function demoMode(engine) {
  const raw = engine.param('helpminedemo');
  if (!raw || raw === '0') return null;
  return raw === 'join' ? 'join' : 'help';
}

function stageDemo(now, engine) {
  if (!demo || demo.done) return;
  const actors = liveCompanions(engine);
  const player = engine.player;
  if (!actors.length || !player || !engine.started) return;
  demo.firstSeen ||= now;
  if (now - demo.firstSeen < 900) return;
  if (!demo.staged) {
    let rocks = rockRows(engine).filter((r) => !r.depleted);
    if (!rocks.length) {
      // No rock on this street: one beside you, in the street's next rock slot.
      const slot = engine.streetWorld?.(engine.streetTsid)?.rocks?.length || 0;
      const spawned = engine.spawnMineRock?.('rock_metal_1', player.x + 160, player.y, slot);
      if (!spawned) return;
      rocks = rockRows(engine);
    }
    const rock = rocks.sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0];
    demo.target = rock.target;
    // A mega rock's 150 chunks (include/mining.js onRespawn), so the companions never reach their floor mid-demo.
    rock.target.state.rock.chunksRemaining = Math.max(rock.target.state.rock.chunksRemaining, MEGA_ROCK_CHUNKS);
    engine.refreshMineRock?.(rock.target);
    // You can mine: Mining I, a pick, energy.
    if (!(engine.learnedSkills || []).includes('mining_1')) engine.grantSkill?.('mining_1');
    engine.inv.pick = Math.max(1, engine.inv.pick || 0);
    if (engine.pc) topUpMetabolic(engine.pc, 'energy', 400, { overTank: true });
    if (engine.param('helpminequest') === '1' && !engine.questState?.active?.help_mine) {
      acceptOffer(engine.questState, 'help_mine', { inv: engine.inv, now });
      engine.save?.();
    }
    if (demo.mode === 'help') {
      const amp = actors.find((a) => a.name === 'Amp') || actors[0];
      amp.sprite.x = rock.x + COMPANION_MINE_RULES.standOffX;
      amp.sprite.y = rock.y;
      for (const actor of actors) {
        if (actor === amp) continue;
        // The others stay well off, so only Amp is at the rock.
        actor.sprite.x = rock.x + (actor.name === 'Bumbishfish' ? 520 : -560);
        actor.socialTargetX = actor.sprite.x;
        actor.socialUntil = now + 120_000;
      }
      interestOf(amp.name, now).sessions += 1;
      startSession(amp, rock.target, { kind: 'own', swings: 8, side: 1, now });
      player.x = rock.x - 70;
    } else {
      demo.joinCount = Math.max(1, Math.min(3, Number(engine.param('helpminejoin')) || 2));
      const offsets = [150, 210, -190];
      actors.forEach((actor, i) => {
        actor.sprite.x = rock.x + (offsets[i] ?? 120);
        actor.sprite.y = rock.y;
        // Idle where they stand (their wander home), so they are still close when you swing.
        actor.homeX = actor.sprite.x;
        actor.wanderTargetX = actor.sprite.x;
        actor.socialTargetX = null;
        actor.socialUntil = 0;
        interestOf(actor.name, now).nextLookAt = now + 60_000;
      });
      player.x = rock.x - 40;
    }
    player.y = rock.y;
    player.vx = 0;
    player.vy = 0;
    demo.staged = true;
    demo.stagedAt = now;
    engine.setData('helpMineDemo', `staged:${demo.mode}`);
    publishQuest(engine);
    return;
  }
  if (engine.param('helpmineautoplay') !== '1') return;
  if (engine.acting?.() || engine.currentAction) return;
  if (now - demo.stagedAt < 1400 || now < (demo.nextAt || 0)) return;
  const target = demo.target;
  const want = demo.mode === 'help' ? 3 : 1;
  if ((demo.swings || 0) >= want) {
    demo.done = true;
    engine.setData('helpMineDemo', `done:${demo.mode}`);
    return;
  }
  const verb = (engine.targetVerbs(target) || []).find((v) => v.id === 'mine');
  if (!verb?.enabled) return;
  if (demo.mode === 'help' && verb.label !== 'help mine') return;
  demo.swings = (demo.swings || 0) + 1;
  demo.nextAt = now + 300;
  engine.beginVerb(target, verb);
}

export const helpMineFeature = {
  id: 'help-mine',

  onStreetEnter(street, engine) {
    // A swing's gem chance reads Rubeweed from the player's buffs (js/mining.js mineRock).
    setMiningBuffs((id) => engine.hasBuff?.(id));
    crews.clear();
    interest.clear();
    for (const s of sessions.values()) hidePick(s);
    sessions.clear();
    playerAt = null;
    playerDig = null;
    const mode = demoMode(engine);
    demo = mode && !demo?.used ? { mode, staged: false, used: true } : demo?.used ? { used: true, done: true } : null;
    publishCrews(engine);
  },

  onStreetClear() {
    for (const s of sessions.values()) hidePick(s);
    sessions.clear();
    crews.clear();
    interest.clear();
    playerAt = null;
  },

  onTick(dtMs, now, engine) {
    sanity(engine);
    stageDemo(now, engine);
    for (const session of [...sessions.values()]) tickSession(session, now, engine);
    lookForRocks(now, engine);
    if (now - relabelAt >= RELABEL_MS) {
      relabelAt = now;
      relabelOpenDig(engine);
    }
  },

  /**
   * dirt_pile.js getVerbLabel 273-281 in multiplayer: "Help dig" while someone else digs the pile
   * (resource-nodes-feature verbsFor asks; a Dirt Pile's menu is that feature's own).
   */
  sharedVerbLabel(target, verbId, engine) {
    const label = verbId === 'dig' && target?.classId === 'dirt_pile'
      ? HELP_DIG_LABEL
      : verbId === 'scrape' && target?.classId === 'ice_knob'
        ? HELP_SCRAPE_LABEL // include/scraping.js getVerbLabel 3-18
        : null;
    if (!label) return null;
    const dig = sharedDigCrew(engine, target);
    if (!dig?.others.length) return null;
    engine.setData(label === HELP_DIG_LABEL ? 'helpDigLabel' : 'helpScrapeLabel', label);
    return label;
  },

  /** mining.js getVerbLabel: "help mine" while a companion works the rock. */
  decorateVerbs(target, verbs, engine) {
    if (!isRock(target)) return null;
    const shared = sharedCrew(engine, target);
    if (shared) {
      if (!shared.others.length) return null;
      engine.setData('helpMineLabel', 'help mine');
      return verbs.map((v) => (v.id === 'mine' ? { ...v, label: 'help mine' } : v));
    }
    const crew = crews.get(target);
    if (!crew || mineVerbLabel(crew, PLAYER_MINER) !== 'Help mine') return null;
    engine.setData('helpMineLabel', 'help mine');
    return verbs.map((v) => (v.id === 'mine' ? { ...v, label: 'help mine' } : v));
  },

  verbStarted(target, verb, engine) {
    // A use of a shared crew node: the server hears it start (a late landing is paid, and the help).
    if (CREW_NODES.has(target?.classId) && String(verb?.id || '').split(':')[0] === CREW_VERBS[target.classId]) {
      const dig = sharedDigCrew(engine, target);
      if (dig) {
        playerDig = { target, helping: dig.others.length > 0 };
        engine.query('sharedDigSwing', target, 'start', engine);
        engine.setData('helpDigCrew', `shared:${dig.diggers.length + 1}`);
      }
      return undefined;
    }
    if (!isRock(target) || verb?.id !== 'mine') return undefined;
    const shared = sharedCrew(engine, target);
    if (shared) sharedStarts(target, shared, engine);
    else playerStarts(target, engine);
    return undefined;
  },

  verbCancelled(target, verbId, engine) {
    if (playerDig?.target === target && String(verbId).split(':')[0] === CREW_VERBS[target?.classId]) {
      engine.query('sharedDigSwing', target, 'stop', engine);
      playerDig = null;
    }
    if (playerAt?.shared && playerAt.target === target && String(verbId).split(':')[0] === 'mine') {
      engine.query('sharedMineSwing', target, 'stop');
      playerAt = null;
    }
    return undefined;
  },

  /** resource-nodes-feature performVerb, multiplayer: a node verb landed. */
  resourceNodeUsed(target, result, engine) {
    if (engine.mode !== 'multiplayer') return undefined;
    if (target?.classId === 'dirt_pile' && result?.verbId === 'dig') sharedDug(target, result, engine);
    else if (target?.classId === 'ice_knob' && result?.verbId === 'scrape') sharedScraped(target, result, engine);
    else if (playerDig?.target === target) playerDig = null;
    return undefined;
  },

  rockMined(target, result, engine) {
    if (!isRock(target)) return undefined;
    if (playerAt?.shared && playerAt.target === target) sharedMined(target, result, engine);
    else playerMined(target, result, engine);
    return undefined;
  },
};
