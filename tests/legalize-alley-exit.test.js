/**
 * Nobody is ever trapped in The Back Alley or Legalize It's Bureaucratic
 * Hall. The source's ways out: the Shady Bureaucrat's proposition always
 * ends in instances_exit('back_alley') back to where you came in
 * (npc_bureaucrat.js 762-797), and the quest hands out nothing
 * (quests/card_carrying_qualification.js), so a card in the pack was bought
 * and leaving keeps it.
 *
 * The trap: an application made with no way back (v0.22.0 made one whenever
 * the pack read the card's use line) threw when the alley saved the way back,
 * before the Bureaucrat was placed: an empty alley, no Leave, a refused
 * teleport, and the alley itself saved as the place to reload into.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=10b118dd';
import { assignQuest, createQuestState } from '../public/js/quests.js?v=2951073f';
import { createAchievementState } from '../public/js/achievements.js?v=552ecb19';
import { countItem, createInventory } from '../public/js/inventory.js?v=5be47371';
import { createPlayerSave, restorePlayerSave } from '../public/js/player-save.js?v=73f3592a';
import { STATION_X, stationScreen, surfaceStation } from '../public/js/subway.js?v=44d1a09f';
import {
  LEGALIZE_BACK_ALLEY_TSID,
  LEGALIZE_CARD_ID,
  LEGALIZE_GRANGE_TSID,
  LEGALIZE_HALL_TSID,
  LEGALIZE_INSTANCE_TSIDS,
  LEGALIZE_QUEST_ID,
  abandonLegalize,
  activateCardFromPack,
  ensureLegalizeState,
  ensureLegalizeWayBack,
  legalizeReloadLocation,
  legalizeWayBack,
} from '../public/js/legalize-it.js?v=70d110d3';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');

// game.js LEGALIZE_EXIT_FALLBACK: Gregarious Grange Subway Station, in front of A Red Button.
const gate = stationScreen(STATION_X.gate - 70);
const FALLBACK = Object.freeze({ tsid: surfaceStation(LEGALIZE_GRANGE_TSID).streetTsid, x: gate.x, y: gate.y });

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(path.join(root, 'public/assets/content'));
});

const newPc = () => ({ energy: 50, mood: 50, imagination: 0, currants: 200, xp: 0, level: 3 });

describe('Legalize It: always a way out', () => {
  it('the fallback way out is Gregarious Grange Subway Station at A Red Button', () => {
    assert.equal(FALLBACK.tsid, 'GCR177QO65T1EON');
    assert.deepEqual(LEGALIZE_INSTANCE_TSIDS, [LEGALIZE_BACK_ALLEY_TSID, LEGALIZE_HALL_TSID]);
    assert.match(game, /const LEGALIZE_EXIT_FALLBACK = Object\.freeze\(\{ tsid: LEGALIZE_STATION_STREET, x: LEGALIZE_GATE_SPOT\.x, y: LEGALIZE_GATE_SPOT\.y \}\);/);
    assert.match(game, /const LEGALIZE_GATE_SPOT = stationScreen\(STATION_X\.gate - 70\);/);
  });

  it('the way back is where the application came from, else the station', () => {
    const src = { tsid: 'GLI2V0UN7RD1T2J', x: 300, y: 700 };
    assert.deepEqual(legalizeWayBack({ sourceLocation: src }, FALLBACK), src);
    assert.deepEqual(legalizeWayBack({ sourceLocation: null }, FALLBACK), { ...FALLBACK });
    assert.deepEqual(legalizeWayBack(null, FALLBACK), { ...FALLBACK });
    assert.equal(legalizeWayBack(null, null), null);
  });

  it('an application with no way back gets one before the alley opens', () => {
    // The v0.22.0 shape: made from the pack, stage gregarious_departure, sourceLocation null.
    const questState = createQuestState();
    assignQuest(questState, LEGALIZE_QUEST_ID, { ignorePrereq: true });
    const state = ensureLegalizeState(questState);
    assert.equal(state.sourceLocation, null);
    assert.deepEqual(ensureLegalizeWayBack(state, FALLBACK), { ...FALLBACK });
    assert.deepEqual(state.sourceLocation, { ...FALLBACK });
    // A recorded way back is kept.
    const kept = { tsid: 'GLI2V0UN7RD1T2J', x: 1, y: 2 };
    assert.deepEqual(ensureLegalizeWayBack({ sourceLocation: kept }, FALLBACK), kept);
    // game.js: the route state fills it, and the alley saves the way out, never null.
    assert.match(game, /legalizeSourceLocation = ensureLegalizeWayBack\(legalizeRun, LEGALIZE_EXIT_FALLBACK\);/);
    assert.match(game, /savePlayerLocation\(legalizeWayOut\(\)\);\n\}/);
    assert.doesNotMatch(game, /savePlayerLocation\(legalizeSourceLocation\);\n\}/);
  });

  it('a refused activation makes no application (the v0.22.0 trigger)', () => {
    const questState = createQuestState();
    assignQuest(questState, LEGALIZE_QUEST_ID, { ignorePrereq: true });
    const inv = createInventory();
    const result = activateCardFromPack({ questState, inv, achieveState: createAchievementState(), pc: newPc() });
    assert.equal(result.reason, 'card_missing');
    assert.equal(questState.story.legalize, undefined);
  });

  it('a reload saved inside the alley or the hall resumes at the way out', () => {
    const empty = createQuestState();
    for (const tsid of [LEGALIZE_BACK_ALLEY_TSID, LEGALIZE_HALL_TSID]) {
      assert.deepEqual(legalizeReloadLocation({ tsid, x: 721, y: 620 }, empty, FALLBACK), { ...FALLBACK });
    }
    const withSource = { story: { legalize: { sourceLocation: { tsid: 'GLI2V0UN7RD1T2J', x: 5, y: 6 } } } };
    assert.deepEqual(legalizeReloadLocation({ tsid: LEGALIZE_BACK_ALLEY_TSID, x: 1, y: 1 }, withSource, FALLBACK), { tsid: 'GLI2V0UN7RD1T2J', x: 5, y: 6 });
    // Any other place (a regular hall's scene too) is not ours.
    assert.equal(legalizeReloadLocation({ tsid: 'GLI2V0UN7RD1T2J', x: 1, y: 1 }, empty, FALLBACK), null);
    assert.equal(legalizeReloadLocation({ tsid: `HALL_${LEGALIZE_HALL_TSID}`, x: 1, y: 1 }, empty, FALLBACK), null);
    assert.equal(legalizeReloadLocation(null, empty, FALLBACK), null);
    // game.js: checked before the features' reload rules; the autosave never keeps the alley either.
    assert.match(game, /const featureStart = legalizeReloadLocation\(loadPlayerLocation\(\), questState, LEGALIZE_EXIT_FALLBACK\) \|\|/);
    assert.match(game, /if \(LEGALIZE_INSTANCE_TSIDS\.includes\(currentStreetTsid\)\) return legalizeWayOut\(\);/);
  });

  it('the trapped save loads at the station with both cards, and a card then finishes the quest', () => {
    // The shape a trapped player's save has: in the alley, Legalize It active with nothing done,
    // two cards from a regular hall, no story.legalize and no way back anywhere.
    const save = createPlayerSave({
      inventory: { [LEGALIZE_CARD_ID]: 2 },
      player: newPc(),
      systems: {
        quests: {
          active: { [LEGALIZE_QUEST_ID]: { classTsid: LEGALIZE_QUEST_ID, progress: { acquired_card_carrying_qualification: 0, ccq_completed: 0 }, startedAt: 1 } },
          completed: [],
          story: {},
        },
      },
    });
    const location = { tsid: LEGALIZE_BACK_ALLEY_TSID, x: 721, y: 620 };
    const inv = createInventory();
    const pc = newPc();
    const questState = createQuestState();
    const achieveState = createAchievementState();
    assert.equal(restorePlayerSave(JSON.parse(JSON.stringify(save)), inv, pc, { quests: questState, achievements: achieveState }), true);
    assert.equal(questState.story?.legalize, undefined);
    // The load: the station in front of A Red Button, not the alley and not the default street.
    assert.deepEqual(legalizeReloadLocation(location, questState, FALLBACK), { ...FALLBACK });
    assert.equal(countItem(inv, LEGALIZE_CARD_ID), 2);
    assert.ok(questState.active[LEGALIZE_QUEST_ID]);
    // Activating one card there completes Legalize It; the other card stays.
    const result = activateCardFromPack({ questState, inv, achieveState, pc, now: 9000 });
    assert.equal(result.ok, true);
    assert.equal(result.questCompleted, true);
    assert.ok(questState.completed.includes(LEGALIZE_QUEST_ID));
    assert.ok(achieveState.unlocked.includes(LEGALIZE_CARD_ID));
    assert.equal(countItem(inv, LEGALIZE_CARD_ID), 1);
  });

  it('Leave keeps the cards in the pack and still has somewhere to go', () => {
    const questState = createQuestState();
    assignQuest(questState, LEGALIZE_QUEST_ID, { ignorePrereq: true });
    ensureLegalizeState(questState).stage = 'back_alley';
    const inv = { [LEGALIZE_CARD_ID]: 2, apple: 3 };
    assert.equal(abandonLegalize(questState), true);
    assert.equal(questState.active[LEGALIZE_QUEST_ID], undefined);
    assert.equal(questState.story.legalize, undefined);
    assert.deepEqual(inv, { [LEGALIZE_CARD_ID]: 2, apple: 3 });
    // game.js: no card removal on Leave, and the destination is the way out (never null).
    const leave = game.slice(game.indexOf('async function leaveLegalizeIt('), game.indexOf('function confirmLeaveLegalizeIt('));
    assert.doesNotMatch(leave, /removeItem\(inv, LEGALIZE_CARD_ID/);
    assert.match(leave, /abandonLegalize\(questState\);/);
    assert.match(leave, /const destination = legalizeWayOut\(\);/);
    assert.doesNotMatch(leave, /if \(!destination\?\.tsid\) return false;/);
  });

  it('the Bureaucrat sees you out whatever the stage (npc_bureaucrat.js 762-797)', () => {
    const briefing = game.slice(game.indexOf('function legalizeBriefing('), game.indexOf('async function legalizeRunStep('));
    assert.match(briefing, /if \(legalizeRun\.stage !== 'back_alley'\) \{[\s\S]*?legalizeExitAlley\(\);[\s\S]*?return;/);
    const exit = game.slice(game.indexOf('async function legalizeExitAlley('), game.indexOf('function handleLegalizeTarget('));
    assert.match(exit, /back_alley_briefed'\) return legalizeLeaveAlley\(\)/);
    assert.match(exit, /leaveLegalizeIt\(\{ abandon: false \}\)/);
    assert.match(exit, /spawnLegalizeGregariousStation/);
  });
});
