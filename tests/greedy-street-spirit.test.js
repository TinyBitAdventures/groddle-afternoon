import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GREEDY_ACTS,
  GREEDY_FIRST_REWARD,
  GREEDY_REPEAT_COOLDOWN_MS,
  GREEDY_REPEAT_REWARD,
  GREEDY_STREET_DURATION_MS,
  GREEDY_STREET_GEOMETRY_TSID,
  GREEDY_STREET_PRODUCTION_TSID,
  GREEDY_STREET_SPIRIT_QUEST_ID,
  GREEDY_STREET_SPIRIT_REPEAT_ID,
  canOfferGreedyFirst,
  canOfferGreedyRepeat,
  createGreedyStreetSpiritState,
  ensureGreedyStory,
  expireGreedyStreetSpirit,
  greedyObjective,
  greedyRemainingMs,
  markGreedyFirstComplete,
  markGreedyRepeatComplete,
  markGreedyRepeatFailed,
  pressGreedyAct,
} from '../public/js/greedy-street-spirit.js';

const PUBLIC = join(import.meta.dirname, '..', 'public');

describe('The Greedy Street Spirit source-authored story', () => {
  it('keeps all five acts, their exact scene counts, and production identity', () => {
    assert.equal(GREEDY_STREET_PRODUCTION_TSID, 'LNVKEU5TKG33K7L');
    assert.equal(GREEDY_STREET_GEOMETRY_TSID, 'GNVD57N9ERF3TNH');
    assert.deepEqual(GREEDY_ACTS.map((act) => act.lines.length), [3, 4, 3, 3, 3]);
    assert.deepEqual(
      GREEDY_ACTS.map((act) => act.eventIds.length),
      [3, 4, 3, 3, 3]
    );
    assert.match(GREEDY_ACTS[0].lines[0], /looked up at the night sky/);
    assert.match(GREEDY_ACTS[4].lines[2], /for a fair price of course/);
  });

  it('advances each act in sequence and marks only a finished act as read', () => {
    const state = createGreedyStreetSpiritState({ enteredAt: 1000 });
    const first = pressGreedyAct(state, 0, 1100);
    assert.equal(first.ok, true);
    assert.equal(first.eventId, 'act1_button2_down');
    assert.equal(first.actCompleted, false);
    assert.deepEqual(state.actsRead, []);

    pressGreedyAct(state, 0, 1200);
    const last = pressGreedyAct(state, 0, 1300);
    assert.equal(last.eventId, 'act1_button3_down');
    assert.equal(last.actCompleted, true);
    assert.equal(last.storyCompleted, false);
    assert.deepEqual(state.actsRead, [1]);
    assert.match(greedyObjective(state), /Act II/);
    assert.equal(pressGreedyAct(state, 0, 1400).reason, 'act_complete');
  });

  it('finishes only after every source act has been read', () => {
    const state = createGreedyStreetSpiritState({ repeat: true, enteredAt: 50 });
    for (let actIndex = 0; actIndex < GREEDY_ACTS.length; actIndex += 1) {
      for (let step = 0; step < GREEDY_ACTS[actIndex].lines.length; step += 1) {
        pressGreedyAct(state, actIndex, 100 + actIndex * 10 + step);
      }
    }
    assert.equal(state.status, 'ready');
    assert.deepEqual(state.actsRead, [1, 2, 3, 4, 5]);
    assert.match(greedyObjective(state), /whole story has been remembered/);
  });

  it('enforces the original five-minute instance timer', () => {
    const state = createGreedyStreetSpiritState({ enteredAt: 10_000 });
    assert.equal(greedyRemainingMs(state, 10_001), GREEDY_STREET_DURATION_MS - 1);
    assert.equal(expireGreedyStreetSpirit(state, 10_001).ok, false);
    assert.equal(
      pressGreedyAct(state, 0, 10_000 + GREEDY_STREET_DURATION_MS).reason,
      'expired'
    );
    assert.equal(state.status, 'expired');
  });

  it('gates the Piggy quest at level 4 and blocks completed or active runs', () => {
    const state = { active: {}, completed: [], story: {} };
    assert.equal(canOfferGreedyFirst(state, { level: 3 }).reason, 'level');
    assert.equal(canOfferGreedyFirst(state, { level: 4 }).ok, true);
    state.active[GREEDY_STREET_SPIRIT_QUEST_ID] = {};
    assert.equal(canOfferGreedyFirst(state, { level: 4 }).reason, 'active');
    delete state.active[GREEDY_STREET_SPIRIT_QUEST_ID];
    state.completed.push(GREEDY_STREET_SPIRIT_QUEST_ID);
    assert.equal(canOfferGreedyFirst(state, { level: 4 }).reason, 'complete');
  });

  it('enforces the Bear reminisce prerequisite and one-real-hour cooldown', () => {
    const now = 8_000_000;
    const state = { active: {}, completed: [], story: {} };
    assert.equal(canOfferGreedyRepeat(state, now).reason, 'prereq');
    state.completed.push(GREEDY_STREET_SPIRIT_QUEST_ID);
    markGreedyFirstComplete(state, now);
    const cooling = canOfferGreedyRepeat(state, now + 1);
    assert.equal(cooling.reason, 'cooldown');
    assert.equal(cooling.availableAt, now + GREEDY_REPEAT_COOLDOWN_MS);
    assert.equal(
      canOfferGreedyRepeat(state, now + GREEDY_REPEAT_COOLDOWN_MS).ok,
      true
    );
    assert.equal(canOfferGreedyRepeat(state, now + 1, { bypassCooldown: true }).ok, true);
  });

  it('starts a new hour after either a repeat success or failure', () => {
    const state = {
      active: {},
      completed: [GREEDY_STREET_SPIRIT_QUEST_ID],
      story: {},
    };
    markGreedyFirstComplete(state, 100);
    markGreedyRepeatComplete(state, 200);
    markGreedyRepeatFailed(state, 300);
    const story = ensureGreedyStory(state);
    assert.equal(story.lastRepeatCompletedAt, 200);
    assert.equal(story.lastRepeatFailedAt, 300);
    assert.equal(canOfferGreedyRepeat(state, 300).availableAt, 300 + GREEDY_REPEAT_COOLDOWN_MS);
  });

  it('retains the exact first and repeat item rewards', () => {
    assert.deepEqual(GREEDY_FIRST_REWARD, {
      mood: 150,
      giant: 'pot',
      favor: 100,
      item: 'emotional_bear',
      count: 1,
    });
    assert.deepEqual(GREEDY_REPEAT_REWARD, { item: 'waffles', count: 4 });
    assert.equal(GREEDY_STREET_SPIRIT_REPEAT_ID, 'greedy_street_spirit_reminisce');
  });

  it('ships every production theatre sprite recovered from the CC0 SWFs', () => {
    const stems = [
      'streetspirit_test',
      'star_asset_01',
      'star_asset_02',
      'moon_asset_smile',
      'sun_asset_smile',
      'flower_asset_01_orange',
      'hill_asset_happyhead',
      'cloud_asset_01_dark',
      'cloud_asset_02_dark',
      'stars_move_up',
    ];
    const manifest = JSON.parse(
      readFileSync(join(PUBLIC, 'assets/decos/manifest.json'), 'utf8')
    );
    for (const stem of stems) {
      assert.ok(manifest.includes(stem), `${stem} is in the runtime manifest`);
      assert.ok(
        existsSync(join(PUBLIC, 'assets/decos/groddle', `${stem}.webp`)),
        `${stem} clean PNG exists`
      );
    }
  });

  it('retains every exact XML show/hide event used by the 16 scenes', () => {
    const scenes = JSON.parse(
      readFileSync(
        join(PUBLIC, 'assets/content/greedy-street-spirit-scenes.json'),
        'utf8'
      )
    );
    assert.equal(scenes.productionTsid, GREEDY_STREET_PRODUCTION_TSID);
    assert.equal(scenes.dynamicOnlyDecos.length, 5);
    assert.ok(
      scenes.dynamicOnlyDecos.every((id) => id.startsWith('groddle_sign_blank_'))
    );
    assert.ok((scenes.events.player_enter.hide || []).length >= 150);
    for (const act of GREEDY_ACTS) {
      for (const eventId of act.eventIds) {
        assert.ok(scenes.events[eventId], `${eventId} is present`);
        assert.ok(
          scenes.events[eventId].hide.length + scenes.events[eventId].show.length > 0,
          `${eventId} changes the theatre`
        );
      }
    }
  });
});
