/**
 * G963 (Austin 2026-11-17): "two water sounds for a single tree watering". The watering ran once
 * (one energy cost, one care), but its sound played twice: the Watering Can looped while the bar ran
 * (actionLoopFor) and the finish played WATERING_CAN again (soundForVerb). Hoeing and clearing a plot
 * did the same with HOE, a Paper Tree's watering through resource-nodes sfxFor. Glitch's skill
 * package announced the tool's class sound when the action began and only stopped it at the end
 * (players/inc_skill_packages.js 388, 424); onWateringComplete announced nothing (items/include/trants.js
 * 140-200). game.js keeps a ledger of the loops that ran to their end and playSound skips that key
 * once at the verb's finish, solo or online (the server's go-ahead lands after the swing).
 * Run: node --test tests/verb-sound-once.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { actionLoopFor, createToolLoopLedger, soundForGardenAction, soundForVerb } from '../public/js/sound-moments.js?v=3e66996f';
import { sfxFor } from '../public/js/features/resource-nodes-feature.js?v=ec59b66d';

const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');

/** One timed verb as game.js runs it: the loop while the bar runs, then the finish's own sounds. */
function runTimedVerb(ledger, target, verbId, finishKeys, { cancelled = false } = {}) {
  const played = [];
  ledger.started(target);
  const loop = actionLoopFor(target.classId, verbId);
  if (loop) played.push(`loop:${loop.key}`);
  if (cancelled) return played;
  ledger.ended(target, verbId, loop?.key || null);
  for (const key of finishKeys) if (!ledger.repeats(target, verbId, key)) played.push(key);
  return played;
}

describe('G963 a verb plays its tool sound once', () => {
  it('these finishes name the very key their action loop played (the double before the fix)', () => {
    for (const cls of ['trant_fruit', 'trant_bean', 'trant_bubble', 'trant_egg', 'trant_gas', 'trant_spice', 'wood_tree']) {
      assert.equal(soundForVerb(cls, 'water', { ok: true }), actionLoopFor(cls, 'water').key, cls);
    }
    assert.equal(sfxFor({ ok: true, classTsid: 'paper_tree', verbId: 'water' }), actionLoopFor('paper_tree', 'water').key);
    for (const verb of ['water', 'water_all', 'hoe', 'clear']) {
      assert.equal(soundForGardenAction(verb), actionLoopFor('garden_plot', verb).key, verb);
    }
  });

  it('one watering: the can loops while it runs and the finish plays nothing more', () => {
    const ledger = createToolLoopLedger();
    const tree = { classId: 'trant_fruit' };
    assert.deepEqual(runTimedVerb(ledger, tree, 'water', [soundForVerb('trant_fruit', 'water', { ok: true })]), ['loop:WATERING_CAN']);
    const plot = { classId: 'garden_plot' };
    assert.deepEqual(runTimedVerb(ledger, plot, 'hoe', [soundForGardenAction('hoe')]), ['loop:HOE']);
  });

  it("a finish's own sound still plays (harvest, mine, a tree's pet)", () => {
    const ledger = createToolLoopLedger();
    const wood = { classId: 'wood_tree' };
    assert.deepEqual(runTimedVerb(ledger, wood, 'harvest', ['HARVEST']), ['loop:HATCHET', 'HARVEST']);
    const rock = { classId: 'rock_metal_1' };
    assert.deepEqual(runTimedVerb(ledger, rock, 'mine', ['PETRIFIED_ROCK']), ['loop:PICK', 'PETRIFIED_ROCK']);
    const tree = { classId: 'trant_fruit' };
    assert.deepEqual(runTimedVerb(ledger, tree, 'pet', ['PET_TRANT']), ['PET_TRANT']);
  });

  it('online the finish lands later, after other sounds, and is still skipped once', () => {
    const ledger = createToolLoopLedger();
    const tree = { classId: 'trant_egg' };
    ledger.started(tree);
    ledger.ended(tree, 'water', 'WATERING_CAN', 1000);
    // Another verb on another tree meanwhile does not clear it.
    ledger.started({ classId: 'trant_bean' });
    assert.equal(ledger.repeats(tree, 'water', 'WATERING_CAN', 1400), true);
    assert.equal(ledger.repeats(tree, 'water', 'WATERING_CAN', 1500), false, 'skips only once');
  });

  it('only the same target, verb and key are skipped, and never a stale one', () => {
    const ledger = createToolLoopLedger({ maxAgeMs: 5000 });
    const a = { classId: 'trant_fruit' };
    const b = { classId: 'trant_fruit' };
    ledger.ended(a, 'water', 'WATERING_CAN', 0);
    assert.equal(ledger.repeats(b, 'water', 'WATERING_CAN', 10), false);
    assert.equal(ledger.repeats(a, 'pet', 'WATERING_CAN', 10), false);
    assert.equal(ledger.repeats(a, 'water', 'CLICK_FAILURE', 10), false);
    assert.equal(ledger.repeats(a, 'water:watering_can', 'WATERING_CAN', 10), true, 'a verb id with a tool suffix is the same verb');
    ledger.ended(a, 'water', 'WATERING_CAN', 0);
    assert.equal(ledger.repeats(a, 'water', 'WATERING_CAN', 6000), false, 'stale after maxAgeMs');
    ledger.ended(a, 'water', 'WATERING_CAN', 0);
    ledger.started(a);
    assert.equal(ledger.repeats(a, 'water', 'WATERING_CAN', 10), false, 'a new action on the target forgets it');
  });

  it('a cancelled action leaves nothing to skip, and keys compare through same()', () => {
    const ledger = createToolLoopLedger({ same: (x, y) => x.replace('SUPER_', '') === y.replace('SUPER_', '') });
    const knob = { classId: 'ice_knob' };
    runTimedVerb(ledger, knob, 'scrape', [], { cancelled: true });
    assert.equal(ledger.repeats(knob, 'scrape', 'SCRAPER'), false);
    ledger.ended(knob, 'scrape', 'SCRAPER');
    assert.equal(ledger.repeats(knob, 'scrape', 'SUPER_SCRAPER'), true);
  });

  it('game.js: one timed action at a time, and the finish runs through the ledger', () => {
    const begin = game.slice(game.indexOf('function beginVerbAction('), game.indexOf('function cancelCurrentAction('));
    assert.match(begin, /if \(!target \|\| !verb \|\| currentAction\) return false;/, 'a second start while one runs is refused');
    assert.match(begin, /toolLoopsEnded\.started\(target\);\s*currentAction\.toolSound = [^\n]*startActionSoundLoop\(/);
    const update = game.slice(game.indexOf('function updateCurrentAction('), game.indexOf('const SPEECH_REACTION_VERBS'));
    assert.match(update, /currentAction = null;\s*stopActionSoundLoop\(\);[\s\S]*toolLoopsEnded\.ended\(completed\.target, completed\.verbId, completed\.toolSound\);[\s\S]*executeVerb\(completed\.target/);
    const play = game.slice(game.indexOf('function playSound(key'), game.indexOf('function playSoundLoop('));
    assert.match(play, /finishingVerb && toolLoopsEnded\.repeats\(finishingVerb\.target, finishingVerb\.verbId, key\)\) return null;/);
    const exec = game.slice(game.indexOf('function executeVerb(target, verbId) {'), game.indexOf('function runVerbFinish('));
    assert.match(exec, /finishingVerb = \{ target, verbId \};[\s\S]*runVerbFinish\(target, verbId\);[\s\S]*finally \{\s*finishingVerb = outer;/);
  });
});
