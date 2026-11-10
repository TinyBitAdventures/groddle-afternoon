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
  applyEestiWallFix,
  beginDeEmbiggenifySearch,
  completeDeEmbiggenify,
  createDeEmbiggenifyState,
  deEmbiggenifyEndDrops,
  deEmbiggenifyEndLine,
  deEmbiggenifyObjective,
  deEmbiggenifyPart2Lost,
  eestiRemainingMs,
  eestiStreetPoint,
  expireDeEmbiggenify,
  findSmallWorthless,
} from '../public/js/de-embiggenify.js?v=db347ac1';
import { jumpApex, NORMAL_BUFF } from '../public/js/avatar-step.js?v=e8e9581f';
import { SOURCE_PHYSICS, triggerHit } from '../public/js/puzzle-triggers.js?v=44eec9ea';
import { barriersScreen, blockBarrierCrossing } from '../public/js/street-model.js?v=b6cb6a4e';

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
  assert.equal(EESTI_MUSIC_FILE, 'assets/audio/sfx/DE_EMBIGGENIFY.mp3');
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
    'npc_dustbunny__x1_idle_stand_png_1354831147.webp',
    'npc_dustbunny__x1_talk_png_1354831143.webp',
    'small_worthless__x1_1_x1_2_png_1354829517.webp',
  ]) {
    assert.equal(fs.existsSync(path.join(spriteRoot, file)), true);
  }
  assert.equal(fs.existsSync(path.join(root, 'public/assets/sprites/icons/emotional_bear.webp')), true);
  // Every deco the street places ships as Tiny Speck's own art.
  for (const sprite of new Set(eestiStreet.layers.flatMap((layer) => layer.decos.map((d) => d.sprite)))) {
    assert.equal(fs.existsSync(path.join(decoRoot, `${sprite}.webp`)), true, sprite);
  }
  assert.equal(fs.existsSync(path.join(root, 'public', EESTI_MUSIC_FILE)), true);
  const ambient = JSON.parse(
    fs.readFileSync(path.join(root, 'public/assets/content/ambient-music.json'), 'utf8')
  );
  assert.equal(ambient.hubMap['49'], 'eesti');
  // The catalogue room's own music_file plays its original (Sounds.zip); hub 49 keeps the Eesti stand-in.
  assert.deepEqual(ambient.themes[ambient.streetMusic.DE_EMBIGGENIFY].tracks, [EESTI_MUSIC_FILE]);
  assert.deepEqual(ambient.themes.eesti.tracks, ['assets/audio/ambient/eesti_life_catalogue_1344997859.mp3']);
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
  assert.match(game, /if \(deEmbiggenifyState && deEmbiggenifySourceLocation\?\.tsid\) return deEmbiggenifySourceLocation;/);
  assert.match(game, /const back = instanceWayBack\(\);\s*return back \? savePlayerLocation\(back\) : savePlayerLocation\(\);/);
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
  assert.equal(ambient.streetMusic.DE_EMBIGGENIFY, 'de_embiggenify');
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
  // The game's own arc (js/avatar-step.js, the client's numbers) times the street's jump.
  const apex = -jumpApex(eestiPuzzle.physics.jump, { ...NORMAL_BUFF, gravity: SOURCE_PHYSICS.gravity });
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

test('#109: off the tabletop\'s right end you can always walk back past the table\'s right leg', () => {
  const street = JSON.parse(JSON.stringify(eestiStreet));
  const leg = street.barriers.find((w) => w.id === 'wall_1267251214163');
  // Tiny Speck's leg: solid both ways, 20 px over the floor, under a tabletop that runs past it.
  assert.deepEqual([leg.x, leg.y, leg.h, leg.pc_perm], [1881, -352, 300, null]);
  const floor = street.platforms.find((pl) => pl.id === '_pl1257983553359');
  const top = street.platforms.find((pl) => pl.id === '_pl1257983927390');
  assert.deepEqual([floor.x1, floor.x2, floor.y1], [1041, 1999, -32]);
  assert.ok(top.x2 > leg.x && top.y1 < leg.y, 'the tabletop runs on past the leg, above it');
  // Feet on the floor right of the leg (the report's spot, source 1976, -32), body as tall as the shrunken avatar's.
  const feet = eestiStreetPoint({ x: 1976, y: -32 }).y;
  const at = (x) => eestiStreetPoint({ x, y: 0 }).x;
  const walk = (s, from, to) => blockBarrierCrossing(barriersScreen(s), at(from), at(to), feet, 40);
  assert.equal(walk(street, 1890, 1870), at(1881) + 1, 'before: the leg holds you in the pocket');
  assert.equal(applyEestiWallFix(street), 1);
  assert.equal(walk(street, 1890, 1870), at(1870), 'after: you walk back left under the table');
  assert.equal(walk(street, 1870, 1890), at(1881) - 1, 'the leg still ends the floor under the table from the left');
  assert.equal(applyEestiWallFix(street), 0, 'once');
  // The instance applies it as the room is set up; the street file keeps Tiny Speck's wall.
  assert.equal(eestiStreet.barriers.find((w) => w.id === 'wall_1267251214163').pc_perm, null);
  const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
  const setup = game.slice(game.indexOf('async function setupDeEmbiggenifyInstance('), game.indexOf('async function startDeEmbiggenify('));
  assert.match(setup, /applyEestiWallFix\(currentStreet\);/);
});

test('#109: time running out after Mr. Hairball keeps De-Embiggenify II in the log to try again', () => {
  // The source: part one completes silently on meeting him; part two has no failure path, the
  // instance only asks "Are you stuck?" (inc_instances.js), so part two stays todo.
  const gs = path.join(root, '../glitch-GameServerJS');
  if (fs.existsSync(gs)) {
    assert.match(fs.readFileSync(path.join(gs, 'quests/de_embiggenify.js'), 'utf8'), /var silent_complete = 1;/);
    const part2 = fs.readFileSync(path.join(gs, 'quests/de_embiggenify_part2.js'), 'utf8');
    assert.doesNotMatch(part2, /fail/i);
    assert.match(fs.readFileSync(path.join(gs, 'players/inc_instances.js'), 'utf8'), /txt\s*: 'Are you stuck\? Do you want to leave this place\?'/);
  }
  assert.deepEqual(deEmbiggenifyEndDrops({ part2: true }), [], 'after Mr. Hairball nothing is dropped');
  assert.deepEqual(deEmbiggenifyEndDrops({ part2: false }), [DE_EMBIGGENIFY_QUEST_ID], 'before him part one goes back to its offer');
  assert.match(deEmbiggenifyEndLine({ expired: true, part2: true }), /^The catalogue page closed before you could finish\. De-Embiggenify II is still in your quest log/);
  assert.equal(deEmbiggenifyEndLine({ expired: false, part2: false }), 'You left the miniature room before helping Mr. Hairball.');
  for (const line of [deEmbiggenifyEndLine({ expired: true, part2: true }), deEmbiggenifyEndLine({ part2: true })]) assert.doesNotMatch(line, /—/);
  // A save from before the fix (part one done, part two dropped) gets part two back; finished saves don't.
  assert.equal(deEmbiggenifyPart2Lost({ completed: [DE_EMBIGGENIFY_QUEST_ID], active: {} }), true);
  assert.equal(deEmbiggenifyPart2Lost({ completed: [DE_EMBIGGENIFY_QUEST_ID, DE_EMBIGGENIFY_PART2_QUEST_ID], active: {} }), false);
  assert.equal(deEmbiggenifyPart2Lost({ completed: [DE_EMBIGGENIFY_QUEST_ID], active: { [DE_EMBIGGENIFY_PART2_QUEST_ID]: {} } }), false);
  assert.equal(deEmbiggenifyPart2Lost({ completed: [], active: {} }), false);
  const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
  const back = game.slice(game.indexOf('async function returnFromDeEmbiggenify('), game.indexOf('function confirmLeaveDeEmbiggenify('));
  assert.match(back, /for \(const id of deEmbiggenifyEndDrops\(\{ part2 \}\)\) delete questState\.active\[id\];/);
  assert.doesNotMatch(back, /delete questState\.active\[DE_EMBIGGENIFY_PART2_QUEST_ID\]/);
  assert.match(game, /if \(!eestiDemo && deEmbiggenifyPart2Lost\(questState\)\) \{\n\s+assignQuest\(questState, DE_EMBIGGENIFY_PART2_QUEST_ID, \{ ignorePrereq: true \}\);/);
  // The log's Enter button resumes part two at the search (startDeEmbiggenify resumingPart2).
  assert.match(game, /\[DE_EMBIGGENIFY_QUEST_ID, DE_EMBIGGENIFY_PART2_QUEST_ID\]\.includes\(p\.def\.classTsid\) &&\n\s+!deEmbiggenifyIsInstanced\(\)/);
  assert.match(game, /if \(resumingPart2\) beginDeEmbiggenifySearch\(deEmbiggenifyState, Date\.now\(\)\);/);
});
