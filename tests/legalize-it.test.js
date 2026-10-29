import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LEGALIZE_BACK_ALLEY_BEATS,
  LEGALIZE_BACK_ALLEY_TSID,
  LEGALIZE_CARD_COST,
  LEGALIZE_CARD_ID,
  LEGALIZE_GRANGE_TSID,
  LEGALIZE_HALL_TSID,
  LEGALIZE_QUEST_ID,
  LEGALIZE_QUESTIONS,
  LEGALIZE_REWARD,
  activateQualification,
  answerLegalizeQuestion,
  beginLegalizeApplication,
  callLegalizeApplicant,
  completeBackAlleyBriefing,
  createLegalizeState,
  departForBackAlley,
  enterBackAlleyStation,
  enterBureaucraticHall,
  exitToGregariousGrange,
  legalizeObjective,
  purchaseQualification,
  requestLegalizeQualification,
  travelToGregarious,
} from '../public/js/legalize-it.js?v=g450-1';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Legalize It preserves the source quest ids, fee, and reward', () => {
  assert.equal(LEGALIZE_QUEST_ID, 'card_carrying_qualification');
  assert.equal(LEGALIZE_BACK_ALLEY_TSID, 'LIF177DTS6T1KFG');
  assert.equal(LEGALIZE_GRANGE_TSID, 'LLI32G3NUTD100I');
  assert.equal(LEGALIZE_HALL_TSID, 'LIF101O8CDQ1AMU');
  assert.equal(LEGALIZE_CARD_ID, 'card_carrying_qualification');
  assert.equal(LEGALIZE_CARD_COST, 50);
  assert.deepEqual(LEGALIZE_REWARD, {
    xp: 100,
    favor: { giant: 'ti', points: 25 },
  });
});

test('the recorded route makes the full subway round trip before entering the hall', () => {
  const state = createLegalizeState({ tsid: 'GLI2V0UN7RD1T2J', x: 300, y: 700 });
  assert.equal(state.stage, 'gregarious_departure');
  assert.match(legalizeObjective(state), /Push A Red Button/);
  assert.equal(departForBackAlley(state).reason, 'arrived_back_alley');
  assert.match(legalizeObjective(state), /shady Bureaucrat/);
  assert.equal(completeBackAlleyBriefing(state).reason, 'briefed');
  assert.match(legalizeObjective(state), /Gregarious Grange Subway Station/);
  assert.equal(enterBackAlleyStation(state).reason, 'entered_back_alley_station');
  assert.equal(travelToGregarious(state).reason, 'arrived_gregarious_station');
  assert.equal(exitToGregariousGrange(state).reason, 'entered_gregarious_grange');
  assert.match(legalizeObjective(state), /Bureaucratic Hall/);
  assert.equal(enterBureaucraticHall(state).ok, true);
  assert.equal(state.stage, 'hall_waiting');
});

test('the Back Alley briefing and final clerk question match the recovered source', () => {
  assert.equal(LEGALIZE_BACK_ALLEY_BEATS.length, 4);
  assert.match(LEGALIZE_BACK_ALLEY_BEATS[0].text, /Bureaucratic Artsss/);
  assert.equal(LEGALIZE_BACK_ALLEY_BEATS[0].response, 'Oh, yeah?');
  assert.equal(LEGALIZE_BACK_ALLEY_BEATS[1].response, 'Sounds handy');
  assert.equal(LEGALIZE_BACK_ALLEY_BEATS[2].response, 'Um, sketchy?');
  assert.match(LEGALIZE_BACK_ALLEY_BEATS[3].text, /Bureaucratic Hall on Gregarious Grange/);
  assert.equal(LEGALIZE_QUESTIONS[0].text, 'This shouldn’t be a problem. One last question. Your favorite color?');
  assert.deepEqual(LEGALIZE_QUESTIONS[0].options, ['Beige', 'Other']);
});

test('the application waits, transfers exactly once, then proceeds to payment', () => {
  const state = createLegalizeState();
  departForBackAlley(state);
  completeBackAlleyBriefing(state);
  enterBackAlleyStation(state);
  travelToGregarious(state);
  exitToGregariousGrange(state);
  enterBureaucraticHall(state);
  assert.equal(callLegalizeApplicant(state).reason, 'called');
  assert.equal(beginLegalizeApplication(state).reason, 'item_selection');
  assert.equal(requestLegalizeQualification(state).reason, 'handoff');
  assert.equal(state.handoffs, 1);
  assert.equal(state.clerkIndex, 1);
  assert.equal(requestLegalizeQualification(state).reason, 'request_unavailable');
  callLegalizeApplicant(state);
  const question = beginLegalizeApplication(state);
  assert.equal(question.reason, 'question');
  assert.deepEqual(question.question.options, ['Beige', 'Other']);
  assert.equal(answerLegalizeQuestion(state, 1).reason, 'payment');
});

test('purchase costs 50 currants and activation is a separate pack action', () => {
  const state = createLegalizeState();
  departForBackAlley(state);
  completeBackAlleyBriefing(state);
  enterBackAlleyStation(state);
  travelToGregarious(state);
  exitToGregariousGrange(state);
  enterBureaucraticHall(state);
  callLegalizeApplicant(state);
  beginLegalizeApplication(state);
  requestLegalizeQualification(state);
  callLegalizeApplicant(state);
  beginLegalizeApplication(state);
  answerLegalizeQuestion(state, 0);

  assert.equal(purchaseQualification(state, 49).reason, 'not_enough_currants');
  const bought = purchaseQualification(state, 50, 1000);
  assert.equal(bought.ok, true);
  assert.equal(bought.item, LEGALIZE_CARD_ID);
  assert.equal(state.stage, 'card_owned');
  assert.match(legalizeObjective(state), /Activate/);
  assert.equal(activateQualification(state, false).reason, 'card_missing');
  const activated = activateQualification(state, true, 2000);
  assert.equal(activated.ok, true);
  assert.equal(state.stage, 'complete');
  assert.deepEqual(activated.reward, LEGALIZE_REWARD);
  assert.equal(activateQualification(state, true).reason, 'already_activated');
});

test('client integration ships recovered clean quest art and a playable route', () => {
  const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
  const content = fs.readFileSync(path.join(root, 'public/content.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public/play/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
  const spriteRoot = path.join(root, 'public/assets/sprites/quests/legalize');

  for (const file of [
    'card_carrying_qualification__x1_iconic_png_1354833115.png',
    'your_papers__x1_iconic_png_1354833120.png',
    'subway_gate__x1_1_png_1354832987.png',
    'npc_bureaucrat_arms_01_glasses_none_hair_01_legs_01_necklace_none_tie_01_torso_01_x1_iconic_png_1354832989.png',
    'npc_bureaucrat_arms_02_glasses_none_hair_02_legs_02_necklace_none_tie_02_torso_02_x1_iconic_png_1354832997.png',
    'npc_bureaucrat_arms_03_glasses_none_hair_04_legs_03_necklace_01_tie_none_torso_03_x1_iconic_png_1354833006.png',
    'npc_bureaucrat_arms_01_glasses_none_hair_01_legs_01_necklace_none_tie_01_torso_01_x1_idle1_png_1354832995.png',
    'npc_bureaucrat_arms_01_glasses_none_hair_01_legs_01_necklace_none_tie_01_torso_01_x1_talk_png_1354832993.png',
    'npc_bureaucrat_arms_02_glasses_none_hair_02_legs_02_necklace_none_tie_02_torso_02_x1_idle1_png_1354833004.png',
    'npc_bureaucrat_arms_02_glasses_none_hair_02_legs_02_necklace_none_tie_02_torso_02_x1_talk_png_1354833002.png',
  ]) {
    assert.equal(fs.existsSync(path.join(spriteRoot, file)), true);
  }
  for (const file of [
    'subway_platform_1.png',
    'subway_station_entrance.png',
    'bureaucratic_hall_exterior_1.png',
    'bureaucratic_hall_counter_1.png',
    'bureaucratic_hall_tv_1.png',
  ]) {
    assert.equal(fs.existsSync(path.join(root, 'public/assets/decos/groddle', file.replace(/\.png$/, '.webp'))), true);
  }
  assert.match(game, /startLegalizeIt/);
  assert.match(game, /handleLegalizeTarget/);
  assert.match(game, /legalizeautoplay/);
  // The waiting area, Please Wait and the calls are the shared hall visit (js/bureaucratic-hall.js).
  assert.match(game, /features\.query\('bureaucraticHallFlow', engine, \{/);
  assert.match(game, /const LEGALIZE_HALL_QUESTION = HALL_QUESTIONS\.findIndex\(\(qn\) => qn\.options\.join\('\|'\) === 'Beige\|Other'\);/);
  assert.doesNotMatch(game, /legalizeWaitStartedAt/);
  assert.match(game, /recovered-animated-bureaucrats/);
  assert.match(game, /Beige\|Other/);
  assert.match(content, /legalize_transit_gate/);
  // The route runs on the real places: Gregarious Grange's own station (subway feature), the
  // imported street with its hall door, and the one Back Alley set. No drawn stand-ins are left.
  assert.doesNotMatch(content, /legalize_subway_entrance/);
  for (const gone of ['drawGregariousGrangeExterior', 'drawLegalizeSubwayStation', 'drawLegalizeBackAlley', 'spawnLegalizeTransitGate', 'spawnLegalizeBackAlleyStation', 'LEGALIZE_GRANGE_STATION_TSID', 'LEGALIZE_BACK_ALLEY_STATION_TSID']) {
    assert.doesNotMatch(game, new RegExp(`\\b${gone}\\b`), gone);
  }
  assert.match(game, /const LEGALIZE_STATION = surfaceStation\(LEGALIZE_GRANGE_TSID\);/);
  assert.match(game, /const LEGALIZE_HALL_DOOR = 'door_1300484753304';/);
  assert.match(game, /const LEGALIZE_STAIRS_DOOR = 'door_subway_stairs';/);
  assert.match(game, /from '\.\/js\/quest-rooms\/back-alley-set\.js\?v=g\d+-\d+'/);
  assert.match(game, /papersRefused: \(\) => legalizeGateRefused\(\)/);
  assert.match(content, /legalize_hall_entrance/);
  assert.match(content, /npc_back_alley_bureaucrat/);
  assert.match(content, /npc_bureaucrat/);
  assert.match(html, /id="legalize-hud"/);
  assert.match(html, /data-legalize-progress>1 \/ 5/);
  assert.match(html, /legalize=6/);
  assert.match(css, /\.legalize-hud/);
});
