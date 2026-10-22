import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DE_EMBIGGENIFY_PART2_QUEST_ID,
  DE_EMBIGGENIFY_QUEST_ID,
  EESTI_DURATION_MS,
  EESTI_MUSIC_FILE,
  EESTI_PLAYER_SCALE,
  EESTI_PRODUCTION_TSID,
  EESTI_ROOM_ROUTE,
  EESTI_SOURCE_SPAWN,
  EESTI_REWARD,
  EESTI_STREET_ID,
  EMOTIONAL_BEAR_ID,
  MR_HAIRBALL_COMPLETION,
  MR_HAIRBALL_GREETING,
  MR_HAIRBALL_REQUEST,
  SMALL_WORTHLESS_ID,
  beginDeEmbiggenifySearch,
  completeDeEmbiggenify,
  createDeEmbiggenifyState,
  deEmbiggenifyObjective,
  eestiRemainingMs,
  expireDeEmbiggenify,
  findSmallWorthless,
} from '../public/js/de-embiggenify.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('De-Embiggenify preserves the production two-part quest contract', () => {
  assert.equal(DE_EMBIGGENIFY_QUEST_ID, 'de_embiggenify');
  assert.equal(DE_EMBIGGENIFY_PART2_QUEST_ID, 'de_embiggenify_part2');
  assert.equal(EESTI_PRODUCTION_TSID, 'LIF10RQLPLBYV7');
  assert.deepEqual(EESTI_SOURCE_SPAWN, { x: -1832, y: -76 });
  assert.equal(EESTI_STREET_ID, 'INSTANCE_EESTI_PAGE_17');
  assert.equal(EESTI_DURATION_MS, 120000);
  assert.equal(EESTI_PLAYER_SCALE, 0.42);
  assert.equal(SMALL_WORTHLESS_ID, 'small_worthless');
  assert.equal(EMOTIONAL_BEAR_ID, 'emotional_bear');
  assert.deepEqual(EESTI_REWARD, {
    xp: 200,
    currants: 200,
    mood: 50,
    item: 'emotional_bear',
    itemCount: 1,
  });
  assert.equal(MR_HAIRBALL_GREETING.length, 2);
  assert.equal(MR_HAIRBALL_REQUEST.length, 3);
  assert.equal(MR_HAIRBALL_COMPLETION.length, 2);
  assert.equal(MR_HAIRBALL_GREETING[1].response, '');
  assert.equal(MR_HAIRBALL_REQUEST[2].response, '');
  assert.equal(MR_HAIRBALL_COMPLETION[1].response, '');
  assert.equal(EESTI_MUSIC_FILE, 'assets/audio/ambient/eesti_life_catalogue_1344997859.mp3');
  assert.deepEqual(EESTI_ROOM_ROUTE, [
    'sofa-and-sleepy-cat',
    'end-table-lamp',
    'ornate-chair',
    'curved-table',
    'cake',
  ]);
});

test('the shiny object stays hidden until Mr. Hairball starts part two', () => {
  const state = createDeEmbiggenifyState({
    enteredAt: 1000,
    sourceLocation: { tsid: 'GLI2V0UN7RD1T2J', x: 90, y: 400 },
  });
  assert.equal(state.status, 'arrival');
  assert.equal(deEmbiggenifyObjective(state), 'Find and speak with Mr. Hairball');
  assert.equal(findSmallWorthless(state, 2000).reason, 'not_searching');
  const begun = beginDeEmbiggenifySearch(state, 3000);
  assert.equal(begun.ok, true);
  assert.equal(state.deadlineAt, 123000);
  assert.equal(eestiRemainingMs(state, 63000), 60000);
  assert.match(deEmbiggenifyObjective(state), /behind the cake/);
});

test('pickup and return must happen in order and completion is idempotent', () => {
  const state = createDeEmbiggenifyState({ enteredAt: 1000 });
  beginDeEmbiggenifySearch(state, 1000);
  assert.equal(completeDeEmbiggenify(state).reason, 'object_missing');
  const found = findSmallWorthless(state, 2500);
  assert.deepEqual(found, { ok: true, item: SMALL_WORTHLESS_ID });
  assert.equal(findSmallWorthless(state, 2600).reason, 'already_found');
  assert.match(deEmbiggenifyObjective(state), /back to Mr. Hairball/);
  const done = completeDeEmbiggenify(state, 3000);
  assert.equal(done.ok, true);
  assert.deepEqual(done.reward, EESTI_REWARD);
  assert.equal(state.completedAt, 3000);
  assert.equal(completeDeEmbiggenify(state).reason, 'already_complete');
});

test('the two-minute catalogue instance expires cleanly', () => {
  const state = createDeEmbiggenifyState({ enteredAt: 1000 });
  beginDeEmbiggenifySearch(state, 2000);
  assert.equal(findSmallWorthless(state, 122001).reason, 'expired');
  assert.equal(state.status, 'expired');
  assert.equal(eestiRemainingMs(state, 122001), 0);
  assert.equal(expireDeEmbiggenify(state, 123000), false);
});

test('client integration uses clean recovered room and item art', () => {
  const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
  const content = fs.readFileSync(path.join(root, 'public/content.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public/play/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
  const spriteRoot = path.join(root, 'public/assets/sprites/quests/de-embiggenify');
  const decoRoot = path.join(root, 'public/assets/decos/groddle');

  for (const file of [
    'npc_dustbunny__x1_idle_stand_png_1354831147.png',
    'npc_dustbunny__x1_talk_png_1354831143.png',
    'small_worthless__x1_1_x1_2_png_1354829517.png',
  ]) {
    assert.equal(fs.existsSync(path.join(spriteRoot, file)), true);
  }
  assert.equal(fs.existsSync(path.join(root, 'public/assets/sprites/icons/emotional_bear.png')), true);
  for (const file of [
    'k04_wallpaper_01_tan.png',
    'k04_floor_01_wood.png',
    'k04_sofa_01.png',
    'k04_sleepycat_01.png',
    'k04_lamp_04.png',
    'k04_chair_02.png',
    'k04_table_03.png',
    'k04_cake_01.png',
    'k04_plant_03.png',
  ]) {
    assert.equal(fs.existsSync(path.join(decoRoot, file)), true);
  }
  assert.equal(fs.existsSync(path.join(root, 'public', EESTI_MUSIC_FILE)), true);
  const ambient = JSON.parse(
    fs.readFileSync(path.join(root, 'public/assets/content/ambient-music.json'), 'utf8')
  );
  assert.equal(ambient.hubMap['49'], 'eesti');
  assert.deepEqual(ambient.themes.eesti.tracks, [EESTI_MUSIC_FILE]);
  assert.match(game, /startDeEmbiggenify/);
  assert.match(game, /openMrHairballRequest/);
  assert.match(game, /handleDeEmbiggenifyTarget/);
  assert.match(game, /updateDeEmbiggenify/);
  assert.match(game, /eestiautoplay/);
  assert.match(game, /EESTI_PRODUCTION_TSID/);
  assert.match(game, /deEmbiggenifyArt = 'recovered-eesti-page-17'/);
  assert.match(game, /deEmbiggenifyTableArt = 'k04_table_03'/);
  assert.match(game, /Math\.abs\(player\.x - smallWorthlessTarget\.sprite\.x\) <= 46/);
  assert.match(game, /dustBunnyTalk/);
  assert.match(content, /npc_dustbunny/);
  assert.match(content, /small_worthless/);
  assert.match(html, /id="de-embiggenify-hud"/);
  assert.match(html, /eesti=page17-2/);
  assert.match(css, /\.de-embiggenify-hud/);
});
