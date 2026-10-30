import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DE_EMBIGGENIFY_PART2_QUEST_ID,
  DE_EMBIGGENIFY_QUEST_ID,
  EESTI_AUTOPLAY_POINTS,
  EESTI_DURATION_MS,
  EESTI_FIND_BOX,
  EESTI_HAIRBALL_SPOT,
  EESTI_INSTANCE,
  EESTI_LANDMARKS,
  EESTI_MUSIC_FILE,
  EESTI_PLAYER_SCALE,
  EESTI_PRODUCTION_TSID,
  EESTI_ROOM_ROUTE,
  EESTI_SHINY_SPOT,
  EESTI_SOURCE_SPAWN,
  EESTI_REWARD,
  EESTI_STREET_BOUNDS,
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
  eestiStreetPoint,
  expireDeEmbiggenify,
  findSmallWorthless,
} from '../public/js/de-embiggenify.js?v=58d2613c';
import { SOURCE_PHYSICS, triggerHit } from '../public/js/puzzle-triggers.js?v=3ee2f2c8';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCATIONS = path.join(root, '../streets/mnt/stos/location_data');
const eestiStreet = JSON.parse(fs.readFileSync(path.join(root, `public/assets/streets/${EESTI_STREET_ID}.json`), 'utf8'));
const eestiPuzzle = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/content/puzzle-triggers.json'), 'utf8'))
  .streets[EESTI_STREET_ID];
const screenPlatforms = () => eestiStreet.platforms.map((pl) => {
  const a = eestiStreetPoint({ x: pl.x1, y: pl.y1 });
  const b = eestiStreetPoint({ x: pl.x2, y: pl.y2 });
  return a.x <= b.x ? { ...pl, x1: a.x, y1: a.y, x2: b.x, y2: b.y } : { ...pl, x1: b.x, y1: b.y, x2: a.x, y2: a.y };
});
const lineY = (pl, x) => pl.y1 + ((pl.y2 - pl.y1) * (x - pl.x1)) / Math.max(1, pl.x2 - pl.x1);
const lineAt = (x, filter = () => true) => screenPlatforms().filter((pl) => filter(pl) && x >= pl.x1 && x <= pl.x2);

test('De-Embiggenify preserves the production two-part quest contract', () => {
  assert.equal(DE_EMBIGGENIFY_QUEST_ID, 'de_embiggenify');
  assert.equal(DE_EMBIGGENIFY_PART2_QUEST_ID, 'de_embiggenify_part2');
  assert.equal(EESTI_PRODUCTION_TSID, 'LIF10RQLPLBYV7');
  assert.deepEqual(EESTI_SOURCE_SPAWN, { x: -1832, y: -76 });
  assert.equal(EESTI_STREET_ID, 'GHFBQQ4N68733LB');
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
    'kitty-frames',
    'long-table',
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
  // Every deco the street places ships as Tiny Speck's own art.
  for (const sprite of new Set(eestiStreet.layers.flatMap((layer) => layer.decos.map((d) => d.sprite)))) {
    assert.equal(fs.existsSync(path.join(decoRoot, `${sprite}.webp`)), true, sprite);
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
  assert.match(game, /deEmbiggenifyArt = 'tiny-speck-street'/);
  assert.match(game, /deEmbiggenifyTableArt = 'k04_table_03_back\+k04_table_03_front'/);
  // The real street, entered as the private instance; the drawn room and its cake are gone.
  assert.match(game, /await enterStreet\(EESTI_STREET_ID, \{/);
  assert.match(game, /heldInstance: \(\) => summersDayHeldInstance\(\) \|\| deEmbiggenifyHeldInstance\(\)/);
  assert.match(game, /moment !== EESTI_FIND_BOX\.id/);
  for (const gone of ['drawEestiCatalogueRoom', 'addEestiDeco', 'EESTI_DECO_ROOT', 'eesti-tabletop', 'k04_cake_01.png', 'INSTANCE_EESTI_PAGE_17']) {
    assert.ok(!game.includes(gone), gone);
  }
  // A reload resumes at the street you came from.
  assert.match(game, /deEmbiggenifyState && deEmbiggenifySourceLocation\?\.tsid\s+\? savePlayerLocation\(deEmbiggenifySourceLocation\)/);
  assert.match(game, /dustBunnyTalk/);
  assert.match(content, /npc_dustbunny/);
  assert.match(content, /small_worthless/);
  assert.match(html, /id="de-embiggenify-hud"/);
  assert.match(html, /"game\.js\?v=[0-9a-f]{8}"/);
  assert.match(css, /\.de-embiggenify-hud/);
});

test('the room is the newest archived instance of the production template', { skip: !fs.existsSync(LOCATIONS) }, () => {
  const copies = ['GHFBQQ4N68733LB', 'GHFHLFAFI473PSP', 'GUVEF6S1UM53T97'];
  const body = (tsid) => fs.readFileSync(path.join(LOCATIONS, `${tsid}.xml`), 'utf8').replace(/^[^\n]*\n/, '');
  for (const tsid of copies) {
    const l = fs.readFileSync(path.join(LOCATIONS, `L${tsid.slice(1)}.xml`), 'utf8');
    assert.match(l, /<str id="instance_of">LIF10RQLPLBYV7<\/str>/, tsid);
    assert.match(l, /<str id="instance_id">eesti<\/str>/, tsid);
    // The three instances differ only in their header line: one street, the template's.
    assert.equal(body(tsid), body(EESTI_STREET_ID), tsid);
  }
  const g = fs.readFileSync(path.join(LOCATIONS, `${EESTI_STREET_ID}.xml`), 'utf8');
  assert.match(g, /<str id="tsid">GIF10RQLPLBYV7<\/str>/);
  assert.match(g, /load_time="2012-08-19/);
  // The March 2011 copy is older: no instance_of, one platform short, no music_file.
  const old = fs.readFileSync(path.join(LOCATIONS, 'LIFB19E1FUM1LH9.xml'), 'utf8');
  assert.doesNotMatch(old, /instance_of/);
});

test('the street brings its own geometry, decos, music and myles_is_great box', () => {
  assert.equal(eestiStreet.tsid, EESTI_STREET_ID);
  assert.deepEqual({ l: eestiStreet.bounds.l, t: eestiStreet.bounds.t }, EESTI_STREET_BOUNDS);
  assert.equal(eestiStreet.platforms.length, 23);
  assert.equal(eestiStreet.layers.reduce((n, layer) => n + layer.decos.length, 0), 80);
  assert.equal(eestiStreet.musicFile, 'DE_EMBIGGENIFY');
  const ambient = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/content/ambient-music.json'), 'utf8'));
  assert.equal(ambient.streetMusic.DE_EMBIGGENIFY, 'eesti');
  // The archived box, in the street's screen space, is the puzzles-feature trigger as it stands.
  const box = eestiStreet.boxes.find((b) => b.id === EESTI_FIND_BOX.id);
  const at = eestiStreetPoint(EESTI_FIND_BOX);
  assert.deepEqual([box.x, box.y, box.w, box.h], [at.x, at.y, EESTI_FIND_BOX.w, EESTI_FIND_BOX.h]);
  assert.equal(eestiPuzzle.instance, EESTI_INSTANCE);
  assert.equal(eestiPuzzle.emptyEcology, true);
  assert.deepEqual(eestiPuzzle.quoins, []);
  assert.equal(eestiPuzzle.triggers.length, 1);
  const trigger = eestiPuzzle.triggers[0];
  assert.deepEqual([trigger.x, trigger.y, trigger.w, trigger.h], [box.x, box.y, box.w, box.h]);
  assert.equal(trigger.moment, EESTI_FIND_BOX.id);
  assert.deepEqual(trigger.onEnter, []);
  // Spawn: onStarted's instances_create_delayed x, y.
  assert.deepEqual(eestiPuzzle.start, eestiStreetPoint(EESTI_SOURCE_SPAWN));
});

test('Mr. Hairball, the shiny object and the QA route stand on the street', () => {
  // Mr. Hairball's feet on the item line (pc_perm 0, items only), in front of a walkable floor.
  const hairball = eestiStreetPoint(EESTI_HAIRBALL_SPOT);
  const itemLine = lineAt(hairball.x, (pl) => pl.pc_perm === 0);
  assert.equal(itemLine[0]?.id, 'pl1267165485151');
  assert.equal(Math.round(lineY(itemLine[0], hairball.x)), hairball.y);
  assert.ok(lineAt(hairball.x, (pl) => pl.pc_perm === -1).length > 0);
  // The object sits on the tabletop inside the box, half behind the cake.
  const shiny = eestiStreetPoint(EESTI_SHINY_SPOT);
  const box = eestiPuzzle.triggers[0];
  assert.ok(triggerHit(box, shiny.x, shiny.y));
  const top = lineAt(shiny.x, (pl) => pl.id === '_pl1257983927390')[0];
  assert.equal(Math.round(lineY(top, shiny.x)), shiny.y);
  const cake = eestiStreet.layers.find((l) => l.id === 'middleplus').decos.find((d) => d.sprite === 'k04_cake_01');
  assert.ok(shiny.x > cake.x - cake.w / 2 && shiny.x < cake.x);
  // Autoplay: beside Mr. Hairball, on the tabletop short of the box, then inside it.
  const by = eestiStreetPoint(EESTI_AUTOPLAY_POINTS.hairball);
  assert.ok(Math.abs(by.x - hairball.x) <= 60);
  const wait = eestiStreetPoint(EESTI_AUTOPLAY_POINTS.search);
  const find = eestiStreetPoint(EESTI_AUTOPLAY_POINTS.find);
  assert.equal(triggerHit(box, wait.x, wait.y), false);
  assert.equal(triggerHit(box, find.x, find.y), true);
});

test('the landmarks run left to right as the runthrough walks them', () => {
  const vpW = 1280;
  const W = eestiStreet.bounds.r - eestiStreet.bounds.l;
  // Where each deco crosses the middle of the view (parallaxLayerOffset in street-render.js).
  const worldX = (layerId, deco) => {
    const layer = eestiStreet.layers.find((l) => l.id === layerId);
    if (layerId === 'middleground') return deco.x - eestiStreet.bounds.l;
    if (layerId === 'middleplus') return deco.x;
    return ((deco.x - vpW / 2) / (layer.w - vpW)) * (W - vpW) + vpW / 2;
  };
  let last = -Infinity;
  for (const row of EESTI_LANDMARKS) {
    const xs = row.decos.map(([layerId, sprite]) => {
      const deco = eestiStreet.layers.find((l) => l.id === layerId)?.decos.find((d) => d.sprite === sprite);
      assert.ok(deco, `${row.id}: ${layerId} ${sprite}`);
      return worldX(layerId, deco);
    });
    const mid = xs.reduce((a, b) => a + b, 0) / xs.length;
    assert.ok(mid > last, `${row.id} after the one before`);
    last = mid;
  }
});

test('the way up to the cake is the street\'s own and the remake jump reaches every step', () => {
  // Remake arc at source physics times the street's jump (puzzle-triggers.test.js integrator).
  const jump = eestiPuzzle.physics.jump;
  let vy = -9.6 * jump;
  let y = 0;
  let apex = 0;
  for (let t = 0; t < 200; t += 1) {
    vy += 0.42 * SOURCE_PHYSICS.gravity;
    y += vy;
    apex = Math.min(apex, y);
    if (y >= 0 && t > 2) break;
  }
  // The steps: sneaker top to chair seat, chair seat to chair back (the highest), onto the table.
  const plat = (id) => eestiStreet.platforms.find((pl) => pl.id === id);
  const seatHigh = Math.min(plat('_pl1257983875546').y2, plat('_pl1285356022521').y1);
  const back = plat('_pl1285356305652').y1;
  const rise = seatHigh - back;
  assert.equal(rise, 131);
  // The client reached it through its 15 px collision circles; the remake apex clears it by 15.
  assert.ok(-apex - rise >= 15, `apex ${-apex} vs the ${rise} px step`);
  assert.ok(-apex < 160, 'no higher than the client reach needs');
});
