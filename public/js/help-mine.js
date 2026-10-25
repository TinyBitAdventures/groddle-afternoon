/**
 * Help mine (G207): working a rock with other Glitches. The rules are
 * GameServerJS items/include/mining.js:
 *   - getVerbLabel 8-22: the verb reads "Help mine" while someone else is
 *     mining the rock, "Mine" when nobody is (or only you are).
 *   - addMiner 68-91 / removeMiner 93-120: each miner keeps a stack of the
 *     Glitches who started mining the same rock after them (a count per
 *     Glitch, so joining twice counts twice); cancelling takes you off every
 *     stack, finishing does not.
 *   - startMining 222-225: you are helping when anyone was already mining
 *     the rock as you started; onMiningComplete 501-505 then counts
 *     quests_inc_counter('help_mine', 1) (quests/help_mine.js r270, I Me Mine).
 *   - onMiningComplete 327-342, 367-383: the miner gets help_bonus extra
 *     chunks, min(i+1, 4) for each of the first 9 helpers, into the pack
 *     (createItemFromOffset, players/inc_items.js 454) with "You got N
 *     additional <chunks> with the help you received from <names>."
 *     (getHelpString 25-51), and the rock loses them too.
 *
 * In the remake the other Glitches are the local companions (opt-in,
 * ?companions=1; js/local-companions.js). COMPANION_MINE_RULES is the
 * remake's own gentle cadence for them (features/help-mine-feature.js).
 */

/** mining.js 335: only the first 9 helpers add chunks. */
export const HELP_MINE_MAX_HELPERS = 9;

/** mining.js 504 / quests/help_mine.js r270: the I Me Mine counter. */
export const HELP_MINE_COUNTER = 'help_mine';

/** The player's id on a rock's crew (the companions use their names). */
export const PLAYER_MINER = 'player';

/** items/metal_rock.js, dullite.js, beryl.js, sparkly.js name_single / name_plural. */
export const ROCK_CHUNK_NAMES = Object.freeze({
  metal_rock: Object.freeze(['Chunk of Metal Rock', 'Chunks of Metal Rock']),
  dullite: Object.freeze(['Chunk of Dullite', 'Chunks of Dullite']),
  beryl: Object.freeze(['Chunk of Beryl', 'Chunks of Beryl']),
  sparkly: Object.freeze(['Chunk of Sparkly', 'Chunks of Sparkly']),
});

/**
 * The remake's companions at a rock. They only start on a rock while you
 * could help (you know Mining and carry a working pick), one they can walk
 * to on level ground and within sight of you, at most one rock each per
 * street visit; they join your rock at most once each per visit; and they
 * always leave a rock at least `leaveChunks`, so they never mine one out
 * from under you.
 */
export const COMPANION_MINE_RULES = Object.freeze({
  lookMs: 3200,
  chance: 0.25,
  reachX: 700,
  reachY: 120,
  sameLevelY: 48,
  playerNearX: 560,
  playerNearY: 240,
  standOffX: 54,
  swings: 4,
  perVisit: 1,
  joinChance: 0.5,
  joinX: 400,
  joinsPerVisit: 1,
  leaveChunks: 20,
  walkMs: 9000,
});

/** mining.js 334-337: sum of min(i+1, 4) over the first 9 helpers. */
export function helpMineBonus(helpers) {
  const n = Math.max(0, Math.floor(Number(helpers) || 0));
  let bonus = 0;
  for (let i = 0; i < n && i < HELP_MINE_MAX_HELPERS; i++) bonus += Math.min(i + 1, 4);
  return bonus;
}

/** One rock's miners and helper stacks (instance state, never saved: the source kept it on the live rock). */
export function createRockCrew() {
  return { miners: [], helpers: {} };
}

/** mining.js addMiner 68-91. */
export function addMiner(crew, id) {
  for (const stack of Object.values(crew.helpers)) stack[id] = (stack[id] || 0) + 1;
  crew.helpers[id] = {};
  crew.miners.push(id);
  return crew;
}

/** mining.js removeMiner 93-120 (cancel: also off everyone else's stack). */
export function removeMiner(crew, id, cancel = false) {
  if (cancel) {
    for (const stack of Object.values(crew.helpers)) {
      if (!stack[id]) continue;
      stack[id] -= 1;
      if (!stack[id]) delete stack[id];
    }
  }
  delete crew.helpers[id];
  const index = crew.miners.indexOf(id);
  if (index >= 0) crew.miners.splice(index, 1);
  return crew;
}

/** mining.js 331-334: n_helpers counts every join on this miner's stack. */
export function helperCount(crew, id) {
  return Object.values(crew?.helpers?.[id] || {}).reduce((sum, n) => sum + n, 0);
}

/** The Glitches on a miner's stack, in join order (getHelpString). */
export function helperIds(crew, id) {
  return Object.keys(crew?.helpers?.[id] || {});
}

/** startMining 222-225: helping when anyone is already working the rock. */
export function isHelpMining(crew) {
  return Object.keys(crew?.helpers || {}).length > 0;
}

/** getVerbLabel 8-22. */
export function mineVerbLabel(crew, id = PLAYER_MINER) {
  const miners = crew?.miners || [];
  if (!miners.length || (miners.length === 1 && miners[0] === id)) return 'Mine';
  return 'Help mine';
}

/** getHelpString 25-51 (linkifyPlayer dropped): "A", "A, and B", "A, B, and C". */
export function helpString(names = []) {
  let out = '';
  names.forEach((name, i) => {
    if (i > 0) out += i === names.length - 1 ? ', and ' : ', ';
    out += name;
  });
  return out;
}

/** mining.js 371-373. */
export function helpBonusMessage(rockType, count, names = []) {
  const [single, plural] = ROCK_CHUNK_NAMES[rockType] || ROCK_CHUNK_NAMES.metal_rock;
  return `You got ${count} additional ${count > 1 ? plural : single} with the help you received from ${helpString(names)}.`;
}

const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/**
 * A rock a companion could start working: nobody on it, enough chunks to
 * leave some, in reach on its level, in sight of the player, and one it can
 * walk to (`reachable(rock)`, the feature's level-ground check).
 * rocks: [{ x, y, chunks, depleted, busy }].
 */
export function pickCompanionRock({ companion, rocks = [], player, rules = COMPANION_MINE_RULES, maxChunks = 9, reachable = () => true } = {}) {
  if (!companion || (companion.sessions || 0) >= rules.perVisit) return null;
  const cx = finite(companion.x, 0);
  const cy = finite(companion.y, 0);
  let best = null;
  let bestDx = Infinity;
  for (const rock of rocks) {
    if (!rock || rock.depleted || rock.busy) continue;
    if (finite(rock.chunks, 0) <= rules.leaveChunks + maxChunks) continue;
    const rx = finite(rock.x, NaN);
    const ry = finite(rock.y, NaN);
    if (!Number.isFinite(rx) || !Number.isFinite(ry)) continue;
    const dx = Math.abs(rx - cx);
    if (dx > rules.reachX || Math.abs(ry - cy) > rules.reachY) continue;
    if (!player || Math.abs(finite(player.x, Infinity) - rx) > rules.playerNearX
      || Math.abs(finite(player.y, Infinity) - ry) > rules.playerNearY) continue;
    if (dx >= bestDx || !reachable(rock)) continue;
    best = rock;
    bestDx = dx;
  }
  return best;
}

/** Whether an idle companion is close enough (on its level, a walk it can make) to join a rock. */
export function companionCanJoin({ companion, rock, rules = COMPANION_MINE_RULES, reachable = () => true } = {}) {
  if (!companion || !rock || rock.depleted) return false;
  if ((companion.joins || 0) >= rules.joinsPerVisit) return false;
  if (finite(rock.chunks, 0) <= rules.leaveChunks) return false;
  const rx = finite(rock.x, NaN);
  if (!Number.isFinite(rx)) return false;
  return Math.abs(rx - finite(companion.x, Infinity)) <= rules.joinX
    && Math.abs(finite(rock.y, Infinity) - finite(companion.y, Infinity)) <= rules.reachY
    && reachable(rock);
}

/**
 * Chunks a companion's swing takes: its roll plus its own help bonus
 * (onMiningComplete), but never below the rock's `leaveChunks`.
 */
export function companionMineTake(chunksRemaining, roll, bonus = 0, rules = COMPANION_MINE_RULES) {
  const room = Math.max(0, Math.floor(finite(chunksRemaining, 0)) - rules.leaveChunks);
  return Math.min(room, Math.max(0, Math.floor(roll) + Math.floor(bonus)));
}
