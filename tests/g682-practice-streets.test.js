/**
 * G682: the two lost skill-quest practice streets, Breezy, EZ Cookin' and Talking 'bout Soil
 * Appreciation, rebuilt from players' full-street snaps (js/practice-streets.js,
 * tools/build-rebuilt-rooms.mjs) and hooked into their quests (js/quest-rooms/ez-cookin.js,
 * soil-appreciation.js, catalog.js; the tutorial's EZ Cooking pick in js/newxp.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry, platformYAt } from '../public/js/street-model.js?v=b6cb6a4e';
import { reachStreet } from '../public/js/builder/reach-graph.js?v=d03eeab1';
import {
  EZ_COOKIN_BOUNDS,
  EZ_COOKIN_FLOOR_Y,
  EZ_COOKIN_SOURCE_TSID,
  EZ_COOKIN_TSID,
  EZ_COUNTERS,
  EZ_FINISH_BOX,
  EZ_FLAMINGO_AWAY,
  EZ_FOOD,
  EZ_KNIFE_AND_BOARD,
  PRACTICE_FLAMINGO,
  PRACTICE_HUB,
  PRACTICE_START,
  SOIL_BLOCK,
  SOIL_BOUNDS,
  SOIL_DIRT_PILE,
  SOIL_FINISH_BOX,
  SOIL_FLAMINGO_AWAY,
  SOIL_FLOOR_Y,
  SOIL_PATCH,
  SOIL_SOURCE_TSID,
  SOIL_TOOLS,
  SOIL_TSID,
  ezCookinStreet,
  inPracticeBox,
  isPracticeStreetTsid,
  practiceExitSign,
  practiceScreen,
  practiceStreetEcology,
  soilStreet,
} from '../public/js/practice-streets.js?v=b170eb1d';
import { BUILT_ROOMS, QUEST_ROOMS } from '../public/js/quest-rooms/catalog.js?v=a217b716';
import { FIRST_SKILLS, PRACTICE_TOOLS, firstSkill, practiceToolToPlace } from '../public/js/newxp.js?v=b3802708';
import { HELLO as EZ_HELLO, room as ezRoom } from '../public/js/quest-rooms/ez-cookin.js?v=1b700821';
import { HELLO as SOIL_HELLO, TEND_FIRST, patchArt, patchVerbs, room as soilRoom } from '../public/js/quest-rooms/soil-appreciation.js?v=206a8e3e';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(spike, 'public');
const streets = join(pub, 'assets/streets');
const gsjs = join(spike, '../glitch-GameServerJS');
const noGsjs = !existsSync(gsjs) && 'no GSJS clone';
const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8')).streets;
const quests = JSON.parse(readFileSync(join(pub, 'assets/content/quests.json'), 'utf8'));
const manifest = new Set(JSON.parse(readFileSync(join(pub, 'assets/decos/manifest.json'), 'utf8')));
const file = (tsid) => JSON.parse(readFileSync(join(streets, `${tsid}.json`), 'utf8'));
const decos = (s) => s.layers.flatMap((l) => l.decos);
const floorsAt = (s, x) => s.platforms.map((p) => platformYAt(p, x, 0)).filter((y) => y != null);

describe('G682 practice streets: street JSON', () => {
  it('are written, indexed in hub 132 Skill Quests and current (tools/build-rebuilt-rooms.mjs --check)', () => {
    execFileSync(process.execPath, [join(spike, 'tools/build-rebuilt-rooms.mjs'), '--check'], { stdio: 'pipe' });
    for (const [tsid, build, label] of [[EZ_COOKIN_TSID, ezCookinStreet, "Breezy, EZ Cookin'"], [SOIL_TSID, soilStreet, "Talking 'bout Soil Appreciation"]]) {
      const s = file(tsid);
      assertStreetGeometry(s);
      assert.deepEqual(s, build());
      assert.equal(s.label, label);
      assert.equal(s.reconstructed, true);
      assert.match(s.source, /^reconstruction: /);
      assert.deepEqual([index[tsid].hubId, index[tsid].hubName, index[tsid].reconstructed], ['132', 'Skill Quests', true]);
      assert.equal(s.stats.decoCount, decos(s).length);
      assert.ok(isPracticeStreetTsid(tsid));
    }
    assert.ok(isPracticeStreetTsid(EZ_COOKIN_SOURCE_TSID) && isPracticeStreetTsid(SOIL_SOURCE_TSID));
  });

  it('name the source rows: config newxp_locations and hub 132 in the maps', { skip: noGsjs }, () => {
    const config = readFileSync(join(gsjs, 'config_prod.js'), 'utf8').split('\n');
    assert.match(config[1340], /ezcooking_1: 'LIFII3UBRFB3KBE'/);
    assert.match(config[1341], /soilappreciation_1: 'LHFS40864GB396O'/);
    const maps = readFileSync(join(gsjs, 'inc_data_maps_prod.js'), 'utf8').split('\n');
    assert.match(maps[18067], /"LIFII3UBRFB3KBE"\s*:\s*"Breezy, EZ Cookin'"/);
    assert.match(maps[18068], /"LHFS40864GB396O"\s*:\s*"Talking 'bout Soil Appreciation"/);
    assert.match(maps[1154], /"name"\s*:\s*"Skill Quests"/);
    assert.equal(PRACTICE_HUB.hubName, 'Skill Quests');
  });

  it('are the full-street snaps\' size at 1 px a unit, top-left at 0, -1000', () => {
    assert.deepEqual([EZ_COOKIN_BOUNDS.r - EZ_COOKIN_BOUNDS.l, EZ_COOKIN_BOUNDS.b - EZ_COOKIN_BOUNDS.t], [2800, 1000]);
    assert.deepEqual([SOIL_BOUNDS.r - SOIL_BOUNDS.l, SOIL_BOUNDS.b - SOIL_BOUNDS.t], [2500, 1000]);
    assert.deepEqual([EZ_COOKIN_BOUNDS.l, EZ_COOKIN_BOUNDS.t, SOIL_BOUNDS.l, SOIL_BOUNDS.t], [0, -1000, 0, -1000]);
    // The flamingo stands on each lane (initial_flamingo 370, -93).
    assert.ok(Math.abs(EZ_COOKIN_FLOOR_Y - PRACTICE_FLAMINGO.y) <= 2);
    assert.equal(SOIL_FLOOR_Y, PRACTICE_FLAMINGO.y);
    // The snaps are reference only: none ships.
    for (const s of [file(EZ_COOKIN_TSID), file(SOIL_TSID)]) assert.ok(!JSON.stringify(s).includes('eleven-snaps/Tutorial/'));
  });

  it('draw only shipped Tiny Speck decos', () => {
    for (const s of [file(EZ_COOKIN_TSID), file(SOIL_TSID)]) {
      for (const d of decos(s)) assert.ok(manifest.has(d.sprite), `${s.label}: ${d.sprite} in the deco manifest`);
    }
  });

  it('put the GSJS food on the counters\' tops (skillquest_ezc_v2.js location_targets, special_items)', { skip: noGsjs }, () => {
    const src = readFileSync(join(gsjs, 'locations/skillquest_ezc_v2.js'), 'utf8');
    for (const f of EZ_FOOD) {
      const at = new RegExp(`'${f.id}': \\{x:(-?\\d+), y:(-?\\d+)\\}`).exec(src);
      assert.deepEqual([Number(at[1]), Number(at[2])], [f.x, f.y], f.id);
      const item = new RegExp(`'${f.id}': \\{class_tsid:'(\\w+)', count:(\\d+)\\}`).exec(src);
      assert.deepEqual([item[1], Number(item[2])], [f.classTsid, f.count], f.id);
    }
    assert.match(src, /'initial_flamingo': \{x:370, y:-93\}/);
    assert.match(src, new RegExp(`'initial_flamingo_2': \\{x:${EZ_FLAMINGO_AWAY.x}, y:${EZ_FLAMINGO_AWAY.y}\\}`));
    assert.ok(src.includes(EZ_HELLO[0].text.replace(/'/g, "\\'")) && src.includes(`txt:'${EZ_HELLO[0].reply}'`));
    const sa = readFileSync(join(gsjs, 'locations/skillquest_sa.js'), 'utf8');
    assert.match(sa, new RegExp(`'initial_flamingo_2': \\{x:${SOIL_FLAMINGO_AWAY.x}, y:${SOIL_FLAMINGO_AWAY.y}\\}`));
    for (const l of SOIL_HELLO) assert.ok(sa.includes(l.text.replace(/'/g, "\\'")) && sa.includes(`txt:'${l.reply}'`), l.text);
    assert.ok(sa.includes(`reason:'${TEND_FIRST}'`));
  });

  it('rest each food item and the Knife & Board on a table top (items rest, the avatar walks through)', () => {
    const s = file(EZ_COOKIN_TSID);
    for (const f of [...EZ_FOOD, EZ_KNIFE_AND_BOARD]) {
      const tops = s.platforms.filter((p) => p.pc_perm === 0 && p.item_perm === -1 && platformYAt(p, f.x, 0) != null);
      assert.equal(tops.length, 1, f.id);
      assert.ok(Math.abs(platformYAt(tops[0], f.x, 0) - f.y) <= 8, `${f.id} at ${f.y}`);
    }
    assert.deepEqual(EZ_COUNTERS.map((c) => c.id), ['trant1', 'trant2', 'trant3']);
    // The boxes the script named (eventScriptHitBox) and the exit's flag box.
    assert.deepEqual(s.boxes.map((b) => b.id), ['knifeandboard', 'trant1', 'trant2', 'trant3', 'quest:flag:finish_ezcooking']);
    assert.deepEqual(file(SOIL_TSID).boxes.map((b) => b.id), ['quest:flag:finish_soilappreciation']);
  });

  it('empty streets (no location XML) with the EXIT word on each arrow', () => {
    for (const tsid of [EZ_COOKIN_TSID, SOIL_TSID]) {
      const e = practiceStreetEcology(tsid);
      assert.deepEqual([e.counts, e.quoins, e.reconstructed], [{}, 0, true]);
      assert.equal(practiceExitSign(tsid).text, 'EXIT');
    }
    assert.equal(practiceStreetEcology('GA5101HF7F429V5'), null);
  });
});

describe('G682 practice streets: reach', () => {
  const start = (s) => ({ x: PRACTICE_START.x - s.bounds.l, y: PRACTICE_FLAMINGO.y - s.bounds.t - 4, from: 'start' });
  const door = (s, id, at) => ({ id, x: at.x - s.bounds.l, y: at.y - s.bounds.t, w: 40, h: 100 });

  it("EZ Cookin': the start reaches every table and the exit, on the lane alone, with no traps", () => {
    const s = ezCookinStreet();
    s.doors = [door(s, 'exit', EZ_FINISH_BOX), ...[EZ_KNIFE_AND_BOARD, ...EZ_COUNTERS].map((c, i) => door(s, `table${i}`, { x: c.x, y: EZ_COOKIN_FLOOR_Y }))];
    const r = reachStreet(s, [start(s)]);
    assert.ok(r.arrivals.every((a) => a.stands));
    for (const t of r.targets) assert.deepEqual(t.reachedFrom, [true], t.id);
    assert.deepEqual(r.unreached, []);
    assert.deepEqual(r.traps, []);
  });

  it('Soil Appreciation: the start reaches the Dirt Pile, the Patch on the block (up its slope) and the exit', () => {
    const s = soilStreet();
    s.doors = [door(s, 'exit', SOIL_FINISH_BOX), door(s, 'patch', SOIL_PATCH), door(s, 'pile', SOIL_DIRT_PILE), ...SOIL_TOOLS.map((t) => door(s, t.id, t))];
    const r = reachStreet(s, [start(s)]);
    assert.ok(r.arrivals.every((a) => a.stands));
    for (const t of r.targets) assert.deepEqual(t.reachedFrom, [true], t.id);
    for (const line of ['plat_soil_lane', 'plat_soil_block', 'plat_soil_slope']) {
      const runs = r.surfaces.filter((x) => x.line === line);
      assert.ok(runs.length && runs.every((x) => x.reached), line);
    }
    assert.deepEqual(r.traps, []);
    // The Patch sits on the block's top, out of a jump from the lane (157 px up): the slope is the way.
    assert.ok(SOIL_BLOCK.x1 < SOIL_PATCH.x && SOIL_PATCH.x < SOIL_BLOCK.x2);
    assert.ok(floorsAt(s, SOIL_PATCH.x).includes(SOIL_BLOCK.top));
  });

  it('start falls onto the lane, the exit box is past the arrow and inside the walls', () => {
    for (const s of [ezCookinStreet(), soilStreet()]) {
      const lane = s.platforms[0];
      assert.ok(lane.x1 <= PRACTICE_START.x && PRACTICE_START.x <= lane.x2);
      const box = s.boxes.at(-1);
      assert.ok(box.x + box.w / 2 < lane.x2 + 60 && box.x - box.w / 2 > s.layers.find((l) => l.name === 'middleground').decos.find((d) => /_exit$/.test(d.id || '')).x - 120);
      assert.ok(inPracticeBox(box, box.x, box.y - 30));
      assert.ok(!inPracticeBox(box, box.x - box.w, box.y - 30));
    }
  });
});

describe('G682 practice streets: the quests', () => {
  it('are quest rooms: ezcooking_1 offered on learning EZ Cooking I, soilappreciation_1 back on its source flag', () => {
    assert.equal(QUEST_ROOMS.ezcooking_1, 'ez_cookin');
    assert.equal(QUEST_ROOMS.soilappreciation_1, 'soil_appreciation');
    assert.ok(BUILT_ROOMS.includes('ez_cookin') && BUILT_ROOMS.includes('soil_appreciation'));
    const ez = quests.ezcooking_1;
    assert.equal(ez.instanceRoom, 'ez_cookin');
    assert.equal(ez.solo, true);
    assert.ok(!ez.custom, 'no longer tutorial-only');
    assert.deepEqual(ez.offerTriggers, [{ type: 'skill', skill: 'ezcooking_1', force: true }]);
    assert.deepEqual(ez.requirements.map((r) => [r.type, r.name, r.desc]), [['flag', 'finish_ezcooking', 'Do it all!']]);
    const soil = quests.soilappreciation_1;
    assert.equal(soil.instanceRoom, 'soil_appreciation');
    assert.deepEqual(soil.requirements.map((r) => [r.id, r.type, r.name, r.desc]), [['r370', 'flag', 'finish_soilappreciation', 'Do it all!']]);
    // Animal Kinship and Light Green Thumb stay the tutorial's.
    assert.equal(quests.animalkinship_1.custom, true);
    assert.equal(quests.lightgreenthumb_1.custom, true);
  });

  it('start where onStarted put you (123, -958) on the rebuilt streets', () => {
    for (const [room, tsid] of [[ezRoom, EZ_COOKIN_TSID], [soilRoom, SOIL_TSID]]) {
      const at = room.street();
      assert.equal(at.tsid, tsid);
      assert.deepEqual({ x: at.x, y: at.y }, practiceScreen(tsid, PRACTICE_START.x, PRACTICE_START.y));
      assert.equal(room.durationMs, 0);
    }
  });

  it('gate Dig on the Patch behind Tend, and each verb behind its tool (skillquest_sa.js verbAvailable)', () => {
    const none = () => false;
    const both = () => true;
    assert.deepEqual(patchVerbs('weedy', none).map((v) => [v.id, v.enabled]), [['tend', false], ['dig', false]]);
    const weedy = patchVerbs('weedy', both);
    assert.deepEqual(weedy.map((v) => [v.id, v.enabled]), [['tend', true], ['dig', false]]);
    assert.equal(weedy[1].tooltip, TEND_FIRST);
    assert.deepEqual(patchVerbs('tended', both).map((v) => [v.id, v.enabled]), [['dig', true]]);
    assert.deepEqual(patchVerbs('dug', both), []);
    assert.deepEqual(['weedy', 'tended', 'dug'].map(patchArt), ['assets/sprites/soil/patch-dirty.webp', 'assets/sprites/soil/patch-clean.webp', 'assets/sprites/soil/patch-dug.webp']);
    for (const t of SOIL_TOOLS) assert.ok(existsSync(join(pub, `assets/sprites/icons/${t.classTsid}.webp`)));
  });

  it('the tutorial\'s EZ Cooking pick walks the rebuilt street, with the Knife & Board (not a Watering Can) on its table', () => {
    const ez = firstSkill('ezcooking_1');
    assert.equal(ez.street, EZ_COOKIN_TSID);
    assert.equal(ez.finishBox, 'quest:flag:finish_ezcooking');
    assert.ok(ezCookinStreet().boxes.some((b) => b.id === ez.finishBox));
    assert.ok(FIRST_SKILLS.every((s) => s.street && s.finishBox));
    assert.equal(PRACTICE_TOOLS.ezcooking_1.classTsid, 'knife_and_board');
    const { place } = practiceToolToPlace('ezcooking_1', [], () => 0);
    assert.deepEqual(place.map((r) => r.classTsid), ['knife_and_board']);
    const screen = practiceScreen(EZ_COOKIN_TSID, EZ_KNIFE_AND_BOARD.x, EZ_KNIFE_AND_BOARD.y);
    assert.deepEqual({ x: PRACTICE_TOOLS.ezcooking_1.x, y: PRACTICE_TOOLS.ezcooking_1.y }, screen);
  });
});
