import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GREEDY_ACTS,
  GREEDY_FIRST_REWARD,
  GREEDY_REPEAT_COOLDOWN_MS,
  GREEDY_REPEAT_REWARD,
  GREEDY_STREET_EXIT_PROMPT_MS,
  GREEDY_STREET_GEOMETRY_TSID,
  GREEDY_STREET_PRODUCTION_TSID,
  GREEDY_STREET_SPIRIT_QUEST_ID,
  GREEDY_STREET_SPIRIT_REPEAT_ID,
  canOfferGreedyFirst,
  canOfferGreedyRepeat,
  createGreedyStreetSpiritState,
  ensureGreedyStory,
  greedyActDecoXs,
  greedyButtonXs,
  greedyObjective,
  markGreedyFirstComplete,
  markGreedyRepeatComplete,
  markGreedyRepeatFailed,
  pressGreedyAct,
} from '../public/js/greedy-street-spirit.js?v=b0ce2437';

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

  it('has no time limit: five minutes in, Glitch asked "Are you stuck?" (exit_delay 5*60)', () => {
    assert.equal(GREEDY_STREET_EXIT_PROMPT_MS, 5 * 60 * 1000);
    const state = createGreedyStreetSpiritState({ enteredAt: 10_000 });
    assert.equal(state.deadlineAt, undefined);
    assert.equal(pressGreedyAct(state, 0, 10_000 + 60 * 60 * 1000).ok, true);
    assert.equal(state.status, 'running');
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

  it('draws one wall button per act, a single frame of the 7-frame strip (#359)', () => {
    const game = readFileSync(join(PUBLIC, 'game.js'), 'utf8');
    const start = game.indexOf('function greedyButtonSprite(');
    const body = game.slice(start, game.indexOf('\n}\n', start));
    // wall_button.js getAssetInfo: one button is 36x35; the strips hold 7 of them.
    assert.match(game, /const GREEDY_BUTTON_FRAME_W = 36;/);
    assert.match(game, /const GREEDY_BUTTON_FRAME_H = 35;/);
    assert.match(body, /greedyButtonFrames\('out'\)\[GREEDY_BUTTON_FRAMES - 1\]/);
    assert.doesNotMatch(body, /textureFromUrl\(/, 'the whole strip is never the button texture');
    assert.doesNotMatch(body, /button\.width = 126/);
  });
});

describe('#598 (G1111): each act\'s Wall Button stands under its own scene', () => {
  const manifest = JSON.parse(readFileSync(join(PUBLIC, 'assets', 'content', 'greedy-street-spirit-scenes.json'), 'utf8'));
  const street = JSON.parse(readFileSync(join(PUBLIC, 'assets', 'streets', `${GREEDY_STREET_GEOMETRY_TSID}.json`), 'utf8'));
  const spans = greedyActDecoXs(manifest, street);
  const xs = greedyButtonXs(manifest, street);

  it("reads each act's scene from its events on the street, in game px", () => {
    assert.equal(spans.length, GREEDY_ACTS.length);
    for (const [i, s] of spans.entries()) assert.ok(s.length >= 6, `Act ${i + 1}: ${s.length} decos`);
    // The street's left edge is -3000: Act I's scene runs 1088 to 1641, Act V's 5252 to 5334.
    assert.deepEqual([spans[0][0], spans[0].at(-1)], [1088, 1641]);
    assert.deepEqual([spans[4][0], spans[4].at(-1)], [5252, 5334]);
  });

  it("each button sits within its act's span, nearer its middle than either end, and in act order", () => {
    for (const [i, x] of xs.entries()) {
      const [lo, hi] = [spans[i][0], spans[i].at(-1)];
      assert.ok(x >= lo && x <= hi, `Act ${i + 1}: ${x} in ${lo}-${hi}`);
      assert.ok(Math.min(x - lo, hi - x) >= (hi - lo) / 4, `Act ${i + 1}: ${x} stands near an end of ${lo}-${hi}`);
      if (i) assert.ok(x > xs[i - 1], 'in act order');
    }
    // The hand-typed places stood left of their scenes (Act I at 700, its scene from 1088).
    assert.notDeepEqual(xs, [700, 1775, 2925, 4075, 5200]);
  });

  it('a phone-wide view (384 px) centred on a button shows most of its scene', () => {
    for (const [i, x] of xs.entries()) {
      const seen = spans[i].filter((d) => Math.abs(d - x) <= 192).length;
      assert.ok(seen / spans[i].length >= 0.6, `Act ${i + 1}: ${seen} of ${spans[i].length}`);
    }
  });

  it('game.js places the buttons from it, not from typed numbers', () => {
    const game = readFileSync(join(PUBLIC, 'game.js'), 'utf8');
    assert.match(game, /const buttonXs = greedyButtonXs\(greedyStreetSceneManifest, currentStreet\);/);
    assert.doesNotMatch(game, /\[700, 1775, 2925, 4075, 5200\]/);
  });

  it('an act with no scene found stands at its fifth of the street', () => {
    assert.deepEqual(greedyButtonXs({ events: {} }, { bounds: { l: -3000, r: 2900 }, layers: [] }), [590, 1770, 2950, 4130, 5310]);
  });
});
