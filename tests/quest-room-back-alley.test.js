/**
 * We're Off to See the Lizard (public/js/quest-rooms/back-alley.js): source
 * constants and dialogue from quests/fuelmaking_refuel_robot.js,
 * items/npc_bureaucrat.js and items/npc_maintenance_bot.js; the subway door
 * table against the imported streets; the bot on the real stations (js/subway.js)
 * and the world hooks on a stub context; the one Back Alley set it shares with
 * Legalize It.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import * as kit from '../public/js/quest-rooms/kit.js?v=g458-1';
import {
  ALLEY,
  ALLEY_ART,
  ALLEY_MS,
  ALLEY_SET,
  ALLEY_SPAWN_SOURCE,
  BOT_EXIT_PATH,
  BOT_HITBOX,
  BOT_SOURCE,
  BOT_SPEED,
  BOT_TEXT,
  COLLIDE,
  DANCE_FAMILIAR,
  DANCE_FAMILIAR_AT,
  DANCE_STEPS,
  FUEL_HINT,
  PROPOSITION,
  PUFF_DY,
  QUEST,
  REVIVE,
  SUBWAY_STREETS,
  alleyPlatforms,
  botVerbs,
  botSpot,
  botWaits,
  inBotBox,
  nearestStation,
  room,
  stationForDoor,
} from '../public/js/quest-rooms/back-alley.js?v=g458-1';
import * as alleySet from '../public/js/quest-rooms/back-alley-set.js?v=g458-1';
import { STATION_FLOOR, STATIONS, stationArrival, stationByTsid, surfaceStation } from '../public/js/subway.js?v=g454-1';
import { BACK_ALLEY_FILES } from '../public/js/quest-rooms/back-alley-art.js';
import { QUEST_ROOMS } from '../public/js/quest-rooms/catalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS');
const BAND = 160;
const read = (rel) => readFileSync(join(GSJS, rel), 'utf8');
const hasGsjs = existsSync(join(GSJS, 'quests/fuelmaking_refuel_robot.js'));
// GSJS escapes ' and / inside its strings; compare on unescaped text.
const unescape = (s) => s.replace(/\\(['"/])/g, '$1');

describe("We're Off to See the Lizard (fuelmaking_refuel_robot) source", () => {
  it('maps to the room and keeps the source numbers', () => {
    assert.equal(QUEST_ROOMS[QUEST], 'back_alley');
    assert.equal(room.id, 'back_alley');
    assert.equal(ALLEY_MS, 180_000);
    assert.deepEqual(ALLEY_SPAWN_SOURCE, { x: 715, y: -73 });
    assert.deepEqual(BOT_SOURCE, { x: 198, y: -140 });
    assert.deepEqual(BOT_HITBOX, { w: 200, h: 100 });
    assert.equal(BOT_SPEED, 300);
    assert.equal(PUFF_DY, 140);
    assert.deepEqual(DANCE_STEPS.map((s) => s.hit), ['hit1', 'hit2', 'hit1', 'hit2', 'hit1']);
    assert.equal(DANCE_FAMILIAR_AT, 3000);
    const quests = JSON.parse(readFileSync(join(root, 'public/assets/content/quests.json'), 'utf8'));
    const def = (quests.quests || quests)[QUEST];
    assert.deepEqual(def.requirements.map((r) => r.name), ['talk_to_bureaucrat', 'made_fuel_cell', 'refuel_bot']);
    assert.equal(def.rewards.xp, 1000);
    assert.equal(def.rewards.currants, 600);
    assert.equal(def.rewards.mood, 100);
    assert.deepEqual(def.rewards.favor['0'], { giant: 'alph', points: 100 });
    assert.deepEqual(def.offerTriggers, [{ type: 'skill', skill: 'fuelmaking_1' }]);
    if (!hasGsjs) return;
    const quest = read('quests/fuelmaking_refuel_robot.js');
    assert.match(quest, /instance_id: 'back_alley', x: 715, y: -73, exit_delay: 3\*60/);
    assert.match(quest, /pc\.back_alley_business = 'fuelmaking'/);
    assert.match(read('locations/inc_transit.js'), /createAndReturnItem\('npc_maintenance_bot', 1, 198, -140/);
    const bot = read('items/npc_maintenance_bot.js');
    assert.match(bot, /apiSetHitBox\(200, 100\)/);
    assert.match(bot, /apiMoveToXY\(46,-349, 300/);
    assert.match(bot, /apiMoveToXY\(-850,-349, 300/);
    assert.match(bot, /delta_y: 140/);
    assert.deepEqual(BOT_EXIT_PATH, [{ x: 46, y: -349 }, { x: -850, y: -349 }]);
    assert.match(read('items/fuelmaker.js'), /pc\.quests_set_flag\('made_fuel_cell'\)/);
  });

  it('quotes the source conversations word for word', { skip: !hasGsjs }, () => {
    const bureaucrat = unescape(read('items/npc_bureaucrat.js'));
    for (const beat of PROPOSITION) {
      assert.ok(bureaucrat.includes(beat.text), beat.text.slice(0, 40));
      assert.ok(bureaucrat.includes(`butt_txt="${beat.response}"`), beat.response);
    }
    const bot = unescape(read('items/npc_maintenance_bot.js'));
    for (const beat of [...COLLIDE, ...REVIVE]) {
      assert.ok(bot.includes(`"${beat.text}"`), beat.text.slice(0, 40));
      assert.ok(bot.includes(`txt: "${beat.response}"`), beat.response);
    }
    assert.ok(bot.includes(FUEL_HINT.replace(/"/g, '\\"')) || bot.includes(FUEL_HINT), 'fuel cell hint');
    assert.ok(bot.includes(DANCE_FAMILIAR[0].text) && bot.includes(DANCE_FAMILIAR[1].text));
    for (const text of Object.values(BOT_TEXT)) assert.ok(bot.includes(text), text);
  });

  it('ships its art', () => {
    assert.ok(existsSync(join(root, 'public', room.icon)));
    for (const f of ['bot_move.png', 'bot_attract.png']) assert.ok(existsSync(join(root, 'public/assets/sprites/quest-rooms/back_alley', f)), f);
    for (const f of ['bot_talk.png']) assert.ok(existsSync(join(root, 'public/assets/sprites/quest-rooms/le_miserable', f)), f);
    const set = readFileSync(join(root, 'public/js/quest-rooms/back-alley-set.js'), 'utf8');
    const decos = [...set.matchAll(/'((?:tree|bush|groddle|wallpaper|platform|forest)_[a-z0-9_]+)'/g)].map((m) => m[1]);
    assert.ok(decos.length >= 10, 'the set draws from the Groddle decos');
    for (const d of new Set(decos)) {
      assert.ok(existsSync(join(root, 'public/assets/decos/groddle', `${d}.webp`)), d);
    }
  });
});

describe('Maintenance bot rules', () => {
  it('offers refuel and dance with the source conditions', () => {
    const fresh = botVerbs({ cells: 0 });
    assert.deepEqual(fresh.map((v) => v.id), ['refuel', 'dance']);
    assert.equal(fresh[0].enabled, false);
    assert.equal(fresh[0].reason, BOT_TEXT.needCell);
    assert.equal(fresh[1].enabled, true);
    const ready = botVerbs({ cells: 2, danced: true });
    assert.equal(ready[0].enabled, true);
    assert.equal(ready[1].enabled, false);
    assert.equal(ready[1].reason, BOT_TEXT.danced);
    const done = botVerbs({ cells: 2, revived: true });
    assert.deepEqual(done.map((v) => v.id), ['refuel']);
    assert.equal(done[0].reason, BOT_TEXT.revived);
  });

  it('uses the 200 x 100 hit box', () => {
    const bot = { x: 1000, y: 600 };
    assert.equal(inBotBox(bot, 1100, 600), true);
    assert.equal(inBotBox(bot, 1101, 600), false);
    assert.equal(inBotBox(bot, 1000, 499), false);
    assert.equal(inBotBox(bot, 920, 560), true);
  });
});

describe('Subway stations', () => {
  it('lists every imported street with a subway door, matching its data', () => {
    for (const row of SUBWAY_STREETS) {
      const street = JSON.parse(readFileSync(join(root, 'public/assets/streets', `${row.street}.json`), 'utf8'));
      assert.equal(street.label, row.label);
      assert.equal(String(street.hubId), row.hubId);
      const door = (street.doors || []).find((d) => d.id === row.door);
      assert.ok(door, `${row.label} ${row.door}`);
      assert.deepEqual(stationForDoor(door)?.station, row.station);
    }
    assert.equal(new Set(SUBWAY_STREETS.map((r) => r.street)).size, SUBWAY_STREETS.length);
  });

  it('recognises station doors only', () => {
    assert.equal(stationForDoor({ connect: { label: 'Bureaucratic Hall', tsid: 'x' } }), null);
    assert.equal(stationForDoor(null), null);
    assert.equal(stationForDoor({ connect: { label: 'Kongu Hop Subway Station', tsid: 'LA59' } }).station, 'Kongu Hop Subway Station');
  });

  it('names the closest station by hub', () => {
    assert.equal(nearestStation('56').street, 'GLI3272LOTD1B1F');
    assert.equal(nearestStation('58').label, 'Gregarious Grange');
    assert.equal(nearestStation('999').label, 'Gregarious Grange');
  });

  it('puts every street in the table on a real station of the Ur subway', () => {
    for (const row of SUBWAY_STREETS) {
      const station = surfaceStation(row.street);
      assert.ok(station, row.label);
      assert.equal(stationByTsid(station.streetTsid), station);
    }
    assert.equal(STATIONS.length, SUBWAY_STREETS.length, 'all twelve stations');
  });

  it('keeps the bot waiting on any station from the meeting until it is refuelled', () => {
    assert.equal(botWaits({ active: true, talked: false, station: true }), false, 'not before the Bureaucrat has spoken');
    assert.equal(botWaits({ active: true, talked: true, station: true }), true);
    assert.equal(botWaits({ active: true, talked: true, station: false }), false, 'stations only');
    assert.equal(botWaits({ active: true, talked: true, refueled: true, station: true }), false);
    assert.equal(botWaits({ active: false, talked: true, station: true }), false);
  });
});

describe('Back Alley and station geometry', () => {
  it('stages the alley on one floor with the trigger between spawn and Bureaucrat', () => {
    const [floor] = alleyPlatforms(kit);
    assert.equal(floor.y1, ALLEY.FLOOR);
    assert.ok(ALLEY.spawnX > ALLEY.triggerX && ALLEY.triggerX > ALLEY.bureaucratX);
    assert.ok(ALLEY.spawnX - ALLEY.triggerX < 400, 'a short walk to the meeting');
  });

  it('lays the alley out in the Snap order: trunk, wall, hut behind the Bureaucrat, log behind the avatar (G111)', () => {
    const S = ALLEY_SET;
    assert.ok(S.trunkX < S.wall.left && S.wall.left < S.wall.right, 'the dark trunk left of the wall');
    assert.ok(S.wall.right < ALLEY.bureaucratX, 'the wall stands left of the Bureaucrat, not behind him');
    assert.ok(Math.abs(S.hutX - ALLEY.bureaucratX) <= 20, 'the hut sits right behind the Bureaucrat');
    assert.ok(S.wall.height >= 300, 'a tall wall (~260 Snap px at ~1.45 world px each)');
    assert.ok(S.shaft.top[0] > S.wall.right - 40 && S.shaft.bottom[1] < S.log.left + 60, 'the light shaft falls between the wall and the log');
    assert.ok(S.log.left > ALLEY.bureaucratX + 100 && S.log.right < ALLEY.spawnX + 40, 'the log lies between the Bureaucrat and the arrival');
    assert.ok(S.log.left <= ALLEY.triggerX + 20, 'the meeting starts as the avatar reaches the log');
    // The art is recovered CC0: street decos and the room-art set (corey3.swf).
    for (const name of [ALLEY_ART.wall, ALLEY_ART.hut, ALLEY_ART.canopy, ALLEY_ART.forest]) {
      assert.ok(existsSync(join(root, `public/assets/decos/groddle/${name}.webp`)), name);
    }
    const [file, w] = BACK_ALLEY_FILES[ALLEY_ART.log];
    assert.ok(existsSync(join(root, 'public/assets/sprites/quest-rooms/back_alley', file)));
    assert.ok(Math.abs(S.log.left + w - S.log.right) <= 2, 'the log span is the art width');
  });

  it('stands the bot at the source x 198 on the station floor, 778 px from the stairs arrival', () => {
    const spot = botSpot();
    const arrive = stationArrival(-580);
    assert.equal(spot.x - arrive.x, 778);
    assert.equal(spot.y, arrive.y, 'on the platform floor');
    assert.equal(STATION_FLOOR, -136);
    assert.ok(Math.abs(STATION_FLOOR - BOT_SOURCE.y) <= 10, 'the source y -140 is the floor');
  });

  it('is the one set Legalize It draws too', () => {
    assert.equal(alleySet.BACK_ALLEY_TSID, 'LIF177DTS6T1KFG');
    assert.equal(ALLEY, alleySet.ALLEY);
    assert.equal(ALLEY_SET, alleySet.ALLEY_SET);
    assert.ok(alleySet.inEnteredBox(ALLEY.triggerX) && !alleySet.inEnteredBox(ALLEY.spawnX));
    assert.equal(alleySet.SHADY.x, ALLEY.bureaucratX);
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /import \{ ALLEY, SHADY, drawAlley, inEnteredBox \} from '\.\/js\/quest-rooms\/back-alley-set\.js\?v=g458-1';/);
    assert.match(game, /const layer = drawAlley\(PIXI\);/);
  });
});

describe('World hooks', () => {
  function world(progress = {}, opts = {}) {
    const log = { progress: [], turnIn: 0, started: [] };
    const wctx = {
      engine: { streetTsid: opts.street || 'GLI32G3NUTD100I', street: { label: 'Gregarious Grange', hubName: 'Groddle Meadow' }, questState: { active: { [QUEST]: { progress } } } },
      questActive: (q) => q === QUEST && opts.active !== false,
      questProgress: (q, name) => Number(progress[name]) || 0,
      progressQuest: (q, name) => { progress[name] = 1; log.progress.push(name); },
      turnInQuest: () => { log.turnIn += 1; },
      startInstance: (q) => { log.started.push(q); },
    };
    return { wctx, log };
  }
  const subwayDoor = { classId: 'street_door', door: { connect: { label: 'Gregarious Grange Subway Station', tsid: 'LCR177QO65T1EON' } } };

  it('leaves subway doors to the subway feature: the stations are the real ones', () => {
    assert.equal(room.world.verbOverride, undefined);
    assert.equal(room.world.runVerbOverride, undefined);
    const { wctx } = world({ talk_to_bureaucrat: 1 });
    assert.deepEqual(room.world.verbs(wctx, subwayDoor), []);
  });

  it('puts no bot on a street that is not a station, nor before the meeting', () => {
    const calls = [];
    const stub = (progress, tsid) => {
      const { wctx } = world(progress);
      wctx.register = (t) => { calls.push(t); return t; };
      wctx.setData = () => {};
      room.world.onStreetEnter(wctx, { tsid });
      return wctx;
    };
    const station = surfaceStation('GLI32G3NUTD100I').streetTsid;
    stub({ talk_to_bureaucrat: 1 }, 'GLI32G3NUTD100I');
    stub({}, station);
    stub({ talk_to_bureaucrat: 1, refuel_bot: 1 }, station);
    assert.equal(calls.length, 0);
  });

  it('counts a Fuelmaker run and turns in when the bot is already fixed', () => {
    const a = world({ talk_to_bureaucrat: 1 });
    room.world.onEvent(a.wctx, 'making_tool_output:metalmaker:plain_metal', 1);
    assert.deepEqual(a.log.progress, []);
    room.world.onEvent(a.wctx, 'making_tool_output:fuelmaker:fuel_cell', 1);
    assert.deepEqual(a.log.progress, ['made_fuel_cell']);
    assert.equal(a.log.turnIn, 0);
    const b = world({ talk_to_bureaucrat: 1, refuel_bot: 1 });
    room.world.onEvent(b.wctx, 'making_tool_output:fuelmaker:fuel_cell', 1);
    assert.equal(b.log.turnIn, 1);
  });

  it('starts in the alley with the 3-minute clock before the meeting', () => {
    const { wctx } = world({});
    wctx.param = () => '';
    room.world.onTick(wctx);
    assert.equal(room.firstStage(QUEST), 'alley');
    assert.equal(room.durationFor(QUEST), ALLEY_MS);
    // onExitLocation: leaving the alley unsolved is a fail (the runtime fails unsolved runs).
    assert.deepEqual(room.onLeave(), { leaveFlag: false });
  });
});
