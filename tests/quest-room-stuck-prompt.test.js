/**
 * The exit delay is "Are you stuck?", not a countdown (players/inc_instances.js 317-357).
 *
 * questInstanceLocation(pc, id, x, y, exit_delay, ...) (quests/quest_scripting.js 26-46) hands
 * exit_delay to instances_create_delayed (inc_instances.js 377-386), which schedules
 * instances_show_exit_prompt: after it the server asks "Are you stuck? Do you want to leave this
 * place?" (Yes, please / No thanks), and again two minutes after each No thanks. No room closed
 * on a clock unless its own quest ran one (Rainbow Run's 30 seconds, Mr. Block's word game).
 *
 * Every built room is listed here: on the shared prompt (room.exitPromptMs, the runtime's
 * maybeAskStuck), on its own prompt code, with a timer the source really ran, or still on the
 * remake's clock (not changed yet; each says why). A new room must pick one.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  STUCK_PROMPT_AGAIN_MS,
  STUCK_PROMPT_CHOICES,
  STUCK_PROMPT_DEAD_MS,
  STUCK_PROMPT_TEXT,
  answerStuckPrompt,
  createQuestInstance,
  finishQuestInstance,
  instanceRemainingMs,
  scheduleStuckPrompt,
  solveQuestInstance,
  stepQuestInstance,
  stuckPromptDue,
} from '../public/js/quest-instance.js?v=f0df88c3';
import { BUILT_ROOMS, QUEST_ROOMS, roomModulePath } from '../public/js/quest-rooms/catalog.js?v=9ebeb502';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(root, '../glitch-GameServerJS');
const hasSource = existsSync(join(GSJS, 'players/inc_instances.js'));
const quest = (id) => readFileSync(join(GSJS, 'quests', `${id}.js`), 'utf8');

/** The rooms on the shared prompt (2026-11-02, Austin): each quest's questInstanceLocation exit_delay. */
const SHARED = Object.freeze({
  an_autumn_day: 5 * 60,
  color_unblocking: 5 * 60,
  juju_camp: 5 * 60,
  le_miserable: 5 * 60,
  light_perspective: 5 * 60,
  operation_grow: 5 * 60,
  picto_pattern: 5 * 60,
  radiant_glare: 5 * 60,
  rube_yard: 5 * 60,
  tile_puzzle: 5 * 60,
  vision_quest: 5 * 60,
});

/** Rooms that ask "Are you stuck?" from their own code (no clock either). */
const OWN_PROMPT = Object.freeze(['clubhouse', 'mental_block', 'gwendolyn', 'penalty', 'firefly_whistle']);

/** Rooms with a timer the source ran. */
const SOURCE_TIMER = Object.freeze({
  // numismatic_hustle: exit_delay 0 (no prompt); players/inc_quests.js rainbow_run_start runs the 30-second race.
  rainbow_run: 'rainbow_run_start: a 30-second clock (exit_delay 0)',
});

/**
 * Not changed in this pass: their quests also pass the exit delay to the prompt, but the remake
 * still runs it as a clock (or, for Esquibeth, has neither). Listed so the gap stays visible.
 */
const NOT_YET = Object.freeze({
  top_of_tree: 'high_jump.js 74: exit_delay 2*60, remake CLIMB_MS clock',
  kids_room: 'letter_block_1/2: 5*60 prompt as a remake clock; letter_block_3 also runs its own source word-game Time overlay',
  being_watched: 'stale_but_necessary.js 95-98: 5*60 prompt as the remake NAP_MS clock',
  back_alley: 'card_carrying_qualification.js 88 / fuelmaking_refuel_robot.js 96: exit_delay 3*60 as a remake clock',
  esquibeth: 'last_pilgrimage_of_esquibeth onStarted 5*60: no clock, and the prompt is not built',
});

async function loadRoom(id) {
  const url = pathToFileURL(join(root, 'public/js/quest-rooms', roomModulePath(id).slice(2)));
  const mod = await import(url.href);
  return { mod, room: mod.room || mod.default };
}

describe('the "Are you stuck?" run state (quest-instance.js)', () => {
  it('has the source text, buttons and delays', () => {
    assert.equal(STUCK_PROMPT_TEXT, 'Are you stuck? Do you want to leave this place?');
    assert.deepEqual(STUCK_PROMPT_CHOICES.map((c) => [c.label, c.value]), [['Yes, please', 'yes'], ['No thanks', 'no']]);
    assert.equal(STUCK_PROMPT_AGAIN_MS, 2 * 60 * 1000);
    assert.equal(STUCK_PROMPT_DEAD_MS, 60 * 1000);
  });

  it('matches inc_instances.js', { skip: !hasSource }, () => {
    const inst = readFileSync(join(GSJS, 'players/inc_instances.js'), 'utf8');
    assert.match(inst, /if \(this\.is_dead\) return this\.instances_schedule_exit_prompt\(details\.instance_id, 60\);/);
    assert.match(inst, /txt\s*: 'Are you stuck\? Do you want to leave this place\?',\s*icon_buttons\s*: true,\s*timeout\s*: 0,/);
    assert.match(inst, /\{ value : 'yes', label : 'Yes, please' \},\s*\{ value : 'no', label : 'No thanks' \},/);
    // Yes, please: instances_left with force (back to where you entered); No thanks: two minutes.
    assert.match(inst, /if \(value == 'yes'\)\{[^}]*this\.instances_left\(details\.instance_id, false, false, true\);/);
    assert.match(inst, /this\.instances_schedule_exit_prompt\(details\.instance_id, 2\*60\);/);
    assert.match(inst, /else if \(details\.exit_delay\)\{\s*this\.instances_schedule_exit_prompt\(details\.instance_id, details\.exit_delay\);/);
    const scripting = readFileSync(join(GSJS, 'quests/quest_scripting.js'), 'utf8');
    assert.match(scripting, /callback: 'instances_create_delayed'[^\n]*exit_delay: exit_delay/);
  });

  it('schedules the prompt with no clock, asks once, and asks again after No thanks', () => {
    const run = createQuestInstance({ questId: 'q', roomId: 'r', now: 1000, durationMs: 0, exitPromptMs: 300_000 });
    assert.equal(instanceRemainingMs(run, 1000), Infinity);
    assert.equal(run.stuckAt, 301_000);
    assert.equal(stuckPromptDue(run, 300_999), false);
    assert.equal(stuckPromptDue(run, 301_000), true);
    // Never expires, however long you stay.
    assert.equal(stepQuestInstance(run, 1e12).expired, false);
    run.stuckAsking = true;
    assert.equal(stuckPromptDue(run, 400_000), false, 'one prompt at a time');
    assert.equal(answerStuckPrompt(run, 'no', { now: 400_000 }), 'stay');
    assert.equal(run.stuckAt, 400_000 + STUCK_PROMPT_AGAIN_MS);
    assert.equal(stuckPromptDue(run, 400_000 + STUCK_PROMPT_AGAIN_MS), true);
    run.stuckAsking = true;
    assert.equal(answerStuckPrompt(run, 'yes'), 'leave');
    assert.equal(run.stuckAt, 0);
    // Yes, please on an unsolved room is the same as Leave: abandoned (the quest fails).
    assert.equal(finishQuestInstance(run).outcome, 'abandoned');
  });

  it('keeps asking in a solved room (Yes, please then completes it), and stops when cancelled or left', () => {
    const run = createQuestInstance({ questId: 'q', roomId: 'r', now: 0, durationMs: 0, exitPromptMs: 1000 });
    solveQuestInstance(run, 10);
    assert.equal(stuckPromptDue(run, 1000), true);
    // A prompt taken down unanswered (a stage change) comes back.
    run.stuckAsking = true;
    assert.equal(answerStuckPrompt(run, null), 'stay');
    assert.equal(stuckPromptDue(run, 1001), true);
    scheduleStuckPrompt(run, 0);
    assert.equal(stuckPromptDue(run, 1e9), false, 'instances_cancel_exit_prompt');
    scheduleStuckPrompt(run, 500, 2000);
    assert.equal(stuckPromptDue(run, 2500), true);
    assert.equal(finishQuestInstance(run).outcome, 'complete');
    assert.equal(stuckPromptDue(run, 3000), false);
  });

  it('has no prompt unless the room asks for one', () => {
    const run = createQuestInstance({ questId: 'q', roomId: 'r', now: 0, durationMs: 30_000 });
    assert.equal(run.stuckAt, 0);
    assert.equal(stuckPromptDue(run, 1e9), false);
  });
});

describe('every built room: the prompt, its own prompt, a source timer, or listed', () => {
  it('lists each built room once', () => {
    const listed = [...Object.keys(SHARED), ...OWN_PROMPT, ...Object.keys(SOURCE_TIMER), ...Object.keys(NOT_YET)];
    assert.equal(new Set(listed).size, listed.length);
    assert.deepEqual([...listed].sort(), [...BUILT_ROOMS].sort());
  });

  for (const [id, seconds] of Object.entries(SHARED)) {
    it(`${id}: no clock, "Are you stuck?" after ${seconds} s`, async () => {
      const { room } = await loadRoom(id);
      assert.equal(room.durationMs, 0, 'no countdown');
      assert.equal(room.durationFor, undefined);
      assert.equal(room.exitPromptMs, seconds * 1000);
      for (const key of ['clock', 'onExpire', 'expireText']) assert.equal(room[key], undefined, key);
      const src = readFileSync(join(root, 'public/js/quest-rooms', roomModulePath(id).slice(2)), 'utf8');
      assert.doesNotMatch(src, /ctx\.remaining\(\)|ctx\.extend\(/, 'nothing reads or moves a clock');
    });
  }

  it('the shared rooms\' quests pass that exit delay and run no countdown of their own', { skip: !hasSource }, () => {
    for (const [id, seconds] of Object.entries(SHARED)) {
      const quests = Object.entries(QUEST_ROOMS).filter(([, room]) => room === id).map(([q]) => q);
      let instanced = 0;
      for (const q of quests) {
        const src = quest(q);
        const calls = [...src.matchAll(/questInstanceLocation\(([^;]*)\);/g)].map((m) => m[1]);
        // le_miserable_part_2 starts inside the lab: no instance of its own.
        for (const args of calls) {
          instanced += 1;
          const delay = args.match(/,\s*(\d+)\s*\*\s*(\d+)\s*(?:,|$)/);
          assert.ok(delay, `${q}: exit delay in ${args}`);
          assert.equal(Number(delay[1]) * Number(delay[2]), seconds, `${q} exit delay`);
          assert.doesNotMatch(args, /no_auto_return/, `${q}: no options that change the prompt`);
        }
        // No source clock: no Time overlay, and the only timer is the juju hint opener.
        assert.doesNotMatch(src, /overlay_counter|countdown/i, `${q}: no countdown overlay`);
        for (const m of src.matchAll(/apiSetTimer\('(\w+)'/g)) assert.equal(m[1], 'openHint', `${q}: timer ${m[1]}`);
      }
      assert.ok(instanced > 0, `${id}: some quest instances it`);
    }
    // Carry That Weight's own "All done here!" replaces the stuck prompt once Grandma gives the trowel.
    assert.match(quest('help_juju_bandits'), /function offerCampExit\(\)\{\s*this\.owner\.instances_cancel_exit_prompt\('juju_camp'\);/);
  });

  it('juju_camp cancels the prompt where offerCampExit did, and closes on no clock', () => {
    const src = readFileSync(join(root, 'public/js/quest-rooms/juju-camp.js'), 'utf8');
    assert.match(src, /ctx\.data\.givenItems = true;[\s\S]{0,400}ctx\.cancelStuckPrompt\?\.\(\)/);
  });

  for (const id of OWN_PROMPT) {
    it(`${id}: its own "Are you stuck?", no clock, and the shared QA wait`, async () => {
      const { room } = await loadRoom(id);
      assert.equal(room.durationMs, 0);
      assert.equal(room.exitPromptMs, undefined, 'one prompt, not two');
      const src = readFileSync(join(root, 'public/js/quest-rooms', roomModulePath(id).slice(2)), 'utf8');
      assert.match(src, /Are you stuck\? Do you want to leave this place\?/);
      assert.match(src, /stuckpromptms|stuckPromptMs/);
    });
  }

  for (const [id, why] of Object.entries(SOURCE_TIMER)) {
    it(`${id}: keeps its source timer (${why})`, async () => {
      const { room } = await loadRoom(id);
      assert.equal(room.exitPromptMs, undefined);
      assert.equal(typeof room.clock, 'function');
    });
  }

  for (const [id, why] of Object.entries(NOT_YET)) {
    it(`${id}: not changed yet (${why})`, async () => {
      const { room } = await loadRoom(id);
      assert.equal(room.exitPromptMs, undefined);
    });
  }
});

describe('the runtime asks it (quest-instances-feature.js)', () => {
  const src = readFileSync(join(root, 'public/js/features/quest-instances-feature.js'), 'utf8');
  it('schedules from the room, asks on the tick, leaves on Yes, please without "Leave anyway?"', () => {
    assert.match(src, /exitPromptMs: stuckPromptMs\(engine, exitPromptMs\)/);
    assert.match(src, /room\.tick\?\.\(ctx, dtMs, now\);\s*if \(run && ctx\) maybeAskStuck\(engine, now\);/);
    assert.match(src, /text: STUCK_PROMPT_TEXT, iconButtons: true/);
    assert.match(src, /if \(next === 'leave'\) leaveInstance\(engine,/);
    assert.match(src, /engine\.param\?\.\('stuckpromptms'\)/);
  });
  it('keeps &clubpromptms= working beside &stuckpromptms=', () => {
    const club = readFileSync(join(root, 'public/js/quest-rooms/clubhouse.js'), 'utf8');
    assert.match(club, /ctx\.param\?\.\('stuckpromptms'\)\) \|\| Number\(ctx\.param\?\.\('clubpromptms'\)\)/);
  });
});
