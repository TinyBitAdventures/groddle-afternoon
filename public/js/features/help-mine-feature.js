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

import { ROCK_CATALOG, findWorkingPick, miningProfile } from '../mining.js?v=g330-1';
import { addItem } from '../inventory.js?v=catalog-unified-7';
import { MEGA_ROCK_CHUNKS, megaRockChance } from '../imagination-effects.js';
import { crowdScaleX } from '../avatar-anims.js';
import { frameTexture, loadTexture } from '../textures.js';
import { acceptOffer } from '../quest-offers.js';
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
} from '../help-mine.js';

// game.js PICK_TOOL_SHEETS.pick / PICK_TOOL_DEF / PICK_SWING_FRAMES (the SWF's 30 fps swing).
const PICK_SHEET = 'assets/sprites/tools/pick-tool@3x.webp';
const PICK_DEF = { fw: 115, fh: 63, cols: 11 };
const PICK_FRAMES = 33;
// mining.js MINING_COSTS rock respawn in the remake (GSJS 8 min).
const RESPAWN_MS = 45_000;

/** target -> crew for the rocks on this street (live only, like the source rock's miners). */
const crews = new Map();
/** companion name -> { sessions, joins, nextLookAt } for this street visit. */
const interest = new Map();
/** companion name -> session at a rock. */
const sessions = new Map();
let playerAt = null; // { target, helping }
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
  return learned.some((id) => /^mining_[1-4]$/.test(id)) && Boolean(findWorkingPick(engine.inv || {}, engine.toolState));
}

function swingMs() {
  // The companions swing at Mining I: the package's 20 s, scaled like yours (mining.js miningProfile).
  return miningProfile(['mining_1'], 'pick')?.durationMs || 1800;
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
  // game.js playPickAnimation: 50 px toward the rock, 46 px up, flipped for a rock on the left.
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

/** Your swing at a shared rock begins: the server adds you to its crew. */
function sharedStarts(target, crew, engine) {
  playerAt = { target, helping: crew.others.length > 0, shared: true };
  engine.query('sharedMineSwing', target, 'start');
  engine.setData('helpMineCrew', `shared:${crew.miners.length + 1}`);
}

/** Your shared swing lands: the bonus is the server's (mining.js 327-383), from everyone who helped. */
function sharedMined(target, result, engine) {
  const rock = result?.rock || target.state.rock;
  const help = engine.query('sharedVerbGrant', target, 'mine')?.help;
  const bonus = Math.max(0, Math.floor(Number(help?.bonus) || 0));
  if (bonus > 0) {
    addItem(engine.inv, rock.chunkId, bonus);
    const names = Array.isArray(help.by) ? help.by.map(String) : [];
    engine.pushActivity(helpBonusMessage(rock.rockType, bonus, names));
    engine.floatText?.(target.sprite.x, target.sprite.y - 120, `+${bonus}`, 0xfff4d6);
    engine.setData('helpMineLast', `bonus:${bonus}:${names.join(',')}`);
    engine.refreshPack?.();
  }
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
    // mining.js 383: the rock gives up the bonus too.
    rock.chunksRemaining -= bonus;
    const msg = helpBonusMessage(rock.rockType, bonus, helperIds(crew, PLAYER_MINER));
    engine.pushActivity(msg);
    engine.floatText?.(target.sprite.x, target.sprite.y - 120, `+${bonus}`, 0xfff4d6);
    engine.setData('helpMineLast', `bonus:${bonus}:${helperIds(crew, PLAYER_MINER).join(',')}`);
    if (rock.chunksRemaining <= 0 && !rock.depleted) {
      // mining.js 387-419 as js/mining.js mineRock clears a rock (game.js then emits rocks_depleted).
      rock.chunksRemaining = 0;
      rock.depleted = true;
      rock.respawnAt = Date.now() + RESPAWN_MS;
      rock.respawnChunks = Math.random() < megaRockChance(rock.rockType, engine.pc?.imaginationUpgrades || []) ? MEGA_ROCK_CHUNKS : 0;
      engine.pushActivity('The rock crumbles away. It will reform soon.');
    }
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
    if (engine.pc) engine.pc.energy = Math.max(engine.pc.energy || 0, 400);
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
    crews.clear();
    interest.clear();
    for (const s of sessions.values()) hidePick(s);
    sessions.clear();
    playerAt = null;
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
    if (!isRock(target) || verb?.id !== 'mine') return undefined;
    const shared = sharedCrew(engine, target);
    if (shared) sharedStarts(target, shared, engine);
    else playerStarts(target, engine);
    return undefined;
  },

  verbCancelled(target, verbId, engine) {
    if (playerAt?.shared && playerAt.target === target && String(verbId).split(':')[0] === 'mine') {
      engine.query('sharedMineSwing', target, 'stop');
      playerAt = null;
    }
    return undefined;
  },

  rockMined(target, result, engine) {
    if (!isRock(target)) return undefined;
    if (playerAt?.shared && playerAt.target === target) sharedMined(target, result, engine);
    else playerMined(target, result, engine);
    return undefined;
  },
};
