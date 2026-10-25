// G289: the loss side of the metabolic door (metabolics_lose_energy /
// metabolics_lose_mood give nothing while dead or in the first two tutorial
// scenes), verb energy costs spent through it, rook and street-job rewards
// through the gain door, and G291's race result (the YOU WON! vp_overlay at
// once, 'Ready to leave?' at 1 s).
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  gainMetabolic,
  loseEnergy,
  loseMood,
  metabolicLoss,
  setMetabolicGainGate,
  setMetabolicLossGate,
} from '../public/js/metabolics.js';
import { HELL_TEXT, metabolicGate, normalizeHellState } from '../public/js/hell.js';
import { BUTTER_UP, butterUpChicken } from '../public/js/animal-flattery.js';
import { SET_FREE, applySetFree } from '../public/js/animal-set-free.js';
import { applyVerbReward, getVerbReward } from '../public/js/verb-rewards.js';
import { createInventory, countItem } from '../public/js/inventory.js';
import { startAssembly, startDisassembly } from '../public/js/machines.js';
import { createToolConditionState, repairToolCondition, setToolRemaining } from '../public/js/tools.js';
import { smeltMetalRocks } from '../public/js/mining.js';
import { craftRecipe } from '../public/js/making.js';
import { doChore, neighbourById, normalizeNeighbourState } from '../public/js/neighbours.js';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const gsjs = join(here, '../../glitch-GameServerJS');
const haveGsjs = existsSync(gsjs);
const src = (rel) => readFileSync(join(gsjs, rel), 'utf8');

/** The hell feature's gate over a hell state, as game.js installs both doors. */
function gateFor(hell, direction) {
  return (stat) => {
    const g = metabolicGate(hell, stat, direction, Date.now());
    return g.allowed ? { ok: true } : { ok: false, msg: g.text };
  };
}
const dead = () => normalizeHellState({ isDead: true });
const superPooped = () => normalizeHellState({ pooped: { kind: 'super_pooped', appliedAt: Date.now() - 1000, expiresAt: Date.now() + 3_600_000 } });

afterEach(() => {
  setMetabolicGainGate(null);
  setMetabolicLossGate(null);
});

describe('what the source does', () => {
  it('metabolics_lose_energy and _lose_mood refuse in newxp_intro / training1 and while dead, never for Pooped', { skip: !haveGsjs && 'no GSJS checkout' }, () => {
    const s = src('players/inc_metabolics.js');
    const lose = s.slice(s.indexOf('function metabolics_lose_energy'), s.indexOf('function metabolics_try_lose_mood'));
    assert.match(lose, /isInstance\('newxp_intro'\) \|\| this\.location\.isInstance\('newxp_training1'\)\)\)\{\s*return 0;/);
    assert.match(lose, /if \(this\.is_dead\)\{[\s\S]{0,140}You would have lost energy, but you're dead![\s\S]{0,40}return 0;/);
    const before = lose.slice(0, lose.indexOf('apiDec'));
    assert.doesNotMatch(before, /pooped/);
    const mood = s.slice(s.indexOf('function metabolics_lose_mood'), s.indexOf('function metabolics_lose_mood') + 600);
    assert.match(mood, /You would have lost some mood, but you're dead!/);
    assert.equal(HELL_TEXT.deadEnergyLoss, "You would have lost energy, but you're dead!");
    assert.equal(HELL_TEXT.deadMoodLoss, "You would have lost some mood, but you're dead!");
  });

  it('job payouts keep what metabolics_add_* returns; rook charges are metabolics_lose_*', { skip: !haveGsjs && 'no GSJS checkout' }, () => {
    assert.match(src('quests/job_cw_test.js'), /rewards\.mood = pc\.metabolics_add_mood\(/);
    assert.match(src('quests/job_cw_test.js'), /rewards\.energy = pc\.metabolics_add_energy\(/);
    const rook = src('items/include/rook.js');
    assert.match(rook, /slugs\.energy = pc\.metabolics_lose_energy\(25\);/);
    assert.match(rook, /slugs\.mood = pc\.metabolics_lose_mood\(25\);/);
  });

  it('a race result is a vp_overlay at top_y 20% with the leave prompt 1 s on; the prompt is one OK', { skip: !haveGsjs && 'no GSJS checkout' }, () => {
    const race = src('locations/inc_race.js');
    const fin = race.slice(race.indexOf('function race_finish'));
    assert.match(fin, /uid: "race_results",\s*type: "vp_overlay",\s*duration: 0,\s*locking: false,\s*width: 500,\s*x: '50%',\s*top_y: '20%'/);
    assert.match(fin, /YOU WON!/);
    assert.match(fin, /winner\.apiSetTimer\('quests_multiplayer_leave_prompt', 1000\);/);
    assert.match(fin, /loser\.apiSetTimer\('quests_multiplayer_leave_prompt', 1000\);/);
    const q = src('players/inc_quests.js');
    const prompt = q.slice(q.indexOf('function quests_multiplayer_leave_prompt'), q.indexOf('function quests_get_from_location'));
    assert.match(prompt, /txt\s*: 'Ready to leave\?',/);
    assert.match(prompt, /choices\s*: \[\s*\{ value : 'ok', label : 'OK' \},\s*\]/);
  });
});

describe('the loss door (js/metabolics.js)', () => {
  it('with no gate a loss lands and stops at 0', () => {
    const pc = { energy: 3, mood: 10 };
    assert.equal(loseEnergy(pc, 5), 3);
    assert.equal(pc.energy, 0);
    assert.equal(loseMood(pc, 4), 4);
    assert.equal(pc.mood, 6);
    assert.equal(loseEnergy(pc, 0), 0);
    assert.equal(loseEnergy(null, 5), 0);
  });

  it('dead: nothing is lost and the line goes to the gate', () => {
    setMetabolicLossGate(gateFor(dead(), 'loss'));
    const pc = { energy: 40, mood: 40 };
    assert.equal(loseEnergy(pc, 5), 0);
    assert.equal(loseMood(pc, 5), 0);
    assert.deepEqual(pc, { energy: 40, mood: 40 });
    assert.deepEqual(metabolicLoss('energy'), { ok: false, msg: HELL_TEXT.deadEnergyLoss });
    assert.equal(metabolicLoss('currants').ok, true);
  });

  it('Super Pooped refuses gains, never losses', () => {
    setMetabolicLossGate(gateFor(superPooped(), 'loss'));
    setMetabolicGainGate(gateFor(superPooped(), 'gain'));
    const pc = { energy: 4, mood: 20 };
    assert.equal(loseEnergy(pc, 2), 2);
    assert.equal(gainMetabolic(pc, 'energy', 10), 0);
    assert.equal(pc.energy, 2);
    assert.equal(gainMetabolic(pc, 'mood', 10), 10);
  });

  it('gains cap at the tank, not 100', () => {
    const pc = { energy: 290, mood: 95, energyMax: 300 };
    assert.equal(gainMetabolic(pc, 'energy', 50), 10);
    assert.equal(pc.energy, 300);
    assert.equal(gainMetabolic(pc, 'mood', 50), 50);
    assert.equal(pc.mood, 145);
  });

  it('game.js installs the loss door from the feature host', () => {
    const game = read('game.js');
    assert.match(game, /setMetabolicLossGate\(\(stat, \{ quiet = false \} = \{\}\) => \{\s*const gate = features\.metabolicGate\(stat, 'loss', engine\);/);
  });
});

describe('verb costs spend through the door', () => {
  it('butter up, set free and skill-package verbs cost nothing while dead', () => {
    setMetabolicLossGate(gateFor(dead(), 'loss'));
    setMetabolicGainGate(gateFor(dead(), 'gain'));
    const pc = { energy: 50, mood: 50, xp: 0, imagination: 0 };
    const out = butterUpChicken({}, pc);
    assert.equal(out.ok, true);
    assert.equal(pc.energy, 50);
    assert.equal(pc.mood, 50);
    const freed = applySetFree('npc_chicken', pc, 0);
    assert.deepEqual(freed.slugs, { mood: 0, energy: 0 });
    const reward = getVerbReward('npc_piggy', 'pet');
    assert.equal(applyVerbReward(pc, reward).ok, true);
    assert.equal(pc.energy, 50);
  });

  it('alive, they cost what the source says', () => {
    const pc = { energy: 50, mood: 50, xp: 0, imagination: 0 };
    butterUpChicken({}, pc);
    assert.equal(pc.energy, 50 - BUTTER_UP.energyCost);
    const before = pc.energy;
    applySetFree('npc_chicken', pc, 0);
    assert.equal(pc.energy, before - SET_FREE.energy);
  });

  it('no module left subtracting energy by hand outside the door (ratchet)', () => {
    const dirs = ['js', 'js/features', 'js/quest-rooms'];
    // G296: any `-=` or an assignment with a subtraction in it (the G289 pattern missed `(pc.energy || 0) - x`).
    const raw = /\b(?:pc|player|ctx\.pc|engine\.pc)\.energy\s*(?:-=|=(?!=)[^;\n]*\s-\s)/;
    const left = [];
    for (const d of dirs) {
      for (const f of readdirSync(join(pub, d))) {
        if (!f.endsWith('.js')) continue;
        const rel = `${d}/${f}`;
        if (rel === 'js/metabolics.js' || rel === 'js/features/energy-decay-feature.js') continue;
        if (raw.test(read(rel))) left.push(rel);
      }
    }
    // G296 routed animal-kinship, machines, making, tools, mining, animal-husbandry, neighbours and
    // the Esquibeth conch. Left: buffs.js's catalog_buffs ticks (clamped, energy and mood), a follow-up row.
    assert.deepEqual(left.sort(), ['js/buffs.js']);
  });

  it('rook attacks and street jobs pay and charge through the doors', () => {
    const rook = read('js/features/rook-attack-feature.js');
    assert.doesNotMatch(rook, /function clampStat|Math\.min\(100, Math\.round/);
    assert.match(rook, /if \(energy > 0\) gainMetabolic\(pc, 'energy', Math\.round\(energy\)\);\s*else if \(energy < 0\) loseEnergy\(pc, Math\.round\(-energy\)\);/);
    const jobs = read('js/features/street-jobs-feature.js');
    assert.match(jobs, /const moodLanded = mood > 0 \? gainMetabolic\(pc, 'mood', mood\) : 0;/);
    assert.match(jobs, /const energyLanded = energy > 0 \? gainMetabolic\(pc, 'energy', energy\) : 0;/);
    assert.match(jobs, /mood: moodLanded, energy: energyLanded \};/);
  });

  it('a gain the hell watcher missed (before its first look after a load) still ends Pooped', () => {
    const hell = read('js/features/hell-feature.js');
    assert.match(hell, /if \(lastEnergy == null \|\| energy > lastEnergy\) \{\s*const gained = onEnergyGained\(state, engine\.pc, now\);/);
  });
});

describe('G296: the loss-door leftovers cost nothing while dead', () => {
  const deadDoor = () => setMetabolicLossGate(gateFor(dead(), 'loss'));

  it('machine assembly and disassembly (machine_stand.js 460, 695)', () => {
    deadDoor();
    const inv = createInventory({ machine_stand: 1, woodworker_fuser: 1, woodworker_chassis: 1, blockmaker_engine: 1 });
    const pc = { energy: 80 };
    const built = startAssembly(inv, pc, 'woodworker', ['engineering_1']);
    assert.equal(built.ok, true);
    assert.equal(pc.energy, 80);
    assert.equal(built.energy, 0);
    assert.doesNotMatch(built.msg, /energy/);
    const inv2 = createInventory({ woodworker: 1 });
    const apart = startDisassembly(inv2, pc, 'woodworker', ['engineering_1']);
    assert.equal(apart.ok, true);
    assert.equal(pc.energy, 80);
    assert.equal(countItem(inv2, 'woodworker'), 0);
  });

  it('a Tinkertool repair says what it spent (tinkertool.js 368, 435)', () => {
    const state = createToolConditionState();
    setToolRemaining(state, 'hoe', 44);
    const alive = { energy: 20 };
    assert.match(repairToolCondition(state, 'hoe', alive, { learned: ['tinkering_1'], hasTinkertool: true }).msg, /You spent 2 energy\./);
    assert.equal(alive.energy, 18);
    deadDoor();
    setToolRemaining(state, 'hoe', 44);
    const pc = { energy: 20 };
    const out = repairToolCondition(state, 'hoe', pc, { learned: ['tinkering_1'], hasTinkertool: true });
    assert.equal(out.ok, true);
    assert.equal(pc.energy, 20);
    assert.match(out.msg, /You spent 0 energy\./);
  });

  it('making, smelting and chores', () => {
    deadDoor();
    const pc = { energy: 20, imagination: 0, xp: 0 };
    const made = craftRecipe(createInventory({ grain: 10, knife_and_board: 1 }), pc, 'flour', { requireSkill: false });
    assert.equal(made.ok, true);
    assert.equal(pc.energy, 20);
    assert.match(made.msgs[0], /−0 energy/);
    const smelt = smeltMetalRocks(createInventory({ metal_rock: 12, smelter: 1 }), pc, { learned: ['smelting_1'], requireSkill: true });
    assert.equal(smelt.ok, true);
    assert.equal(pc.energy, 20);
    assert.equal(smelt.effects.energy, 0);
    const chorePc = { energy: 50, mood: 40, xp: 0, imagination: 0 };
    const chore = doChore(normalizeNeighbourState({}), neighbourById('dorrit'), chorePc, { dayKey: 'd1', now: 1000, energy: 50 });
    assert.equal(chore.ok, true);
    assert.equal(chorePc.energy, 50);
    assert.equal(chore.effects.energy, 0);
  });

  it('every routed module spends through loseEnergy', () => {
    for (const rel of ['js/animal-kinship.js', 'js/machines.js', 'js/making.js', 'js/tools.js', 'js/mining.js',
      'js/animal-husbandry.js', 'js/neighbours.js', 'js/quest-rooms/esquibeth.js']) {
      assert.match(read(rel), /import \{[^}]*\bloseEnergy\b[^}]*\} from '\.\.?\/metabolics\.js';/, rel);
    }
    assert.match(read('js/making.js'), /const energyLost = loseEnergy\(pc, TRANSMOG_FAIL_ENERGY\);\s*const moodLost = pc\.mood != null \? loseMood\(pc, TRANSMOG_FAIL_MOOD\) : 0;/);
  });
});

describe('G291: the orb count', () => {
  it('is centred on the avatar and rises 30 px as joiners reach six (inc_rook.js 521-522)', () => {
    const rook = read('js/features/rook-attack-feature.js');
    assert.match(rook, /count\.anchor\.set\(0\.5, 1\);/);
    assert.match(rook, /orb\.count\.x = 0;\s*orb\.count\.y = ORB_ART\.countDy - 30 \* Math\.min\(orb\.joiners \/ 6, 1\) \+ ORB_ART\.orbAbove;/);
  });
});

describe('G291/G299: the race result', () => {
  const f = read('js/features/races-feature.js');
  // G299 replaced G291's inc_race.js vp_overlay and 'Ready to leave?' prompt: ticket races end
  // through inc_games.js games_end_race (tests/game-splash.test.js).
  it('is the shared game splash with one Leave the Game, not an overlay, a prompt or a card', () => {
    assert.match(f, /engine\.gameSplash\?\.\(\{\s*key: splash\.key,\s*\.\.\.splashFor\(run\.status === 'won', run\.rivalName\),/);
    assert.match(f, /const splash = quoins \? QUOIN_GRAB_SPLASH : RACE_SPLASH;/);
    assert.doesNotMatch(f, /race-results-vog|race-prompt|LEAVE_PROMPT|hog-haul-result-card|data-race-leave|resultRevealTimer/);
    assert.doesNotMatch(f, /scriptedDialogue\(\{\s*title: null/);
  });
});
