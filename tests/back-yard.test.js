/**
 * The house's back yard (register G135): the yard left of the house in the
 * interior location, its expansions, cultivation there, the yard styles, the
 * left-open end of the house, save migration and Landgrabber.
 *
 * Sources (GameServerJS, CC0): config_base.js home_limits 213-246,
 * locations/inc_homes.js homes_rebuild_rooms 472-541, homes_get_floor_config
 * 446, homes_rebuild_floor 'left-open' 1369-1431, home_get_yard_size 2648,
 * home_get_yard_expansion_costs 2663, home_add_expansion 2722-2745,
 * locations/inc_cultivation.js cultivation_get_available 38,
 * players/inc_houses.js houses_expand_yard 1456-1490,
 * achievements/landgrabber.js; client HouseExpandYardDialog.as,
 * HouseStylesDialog.as.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BACK_YARD,
  createBackYardState,
  createCultivationState,
  cultivate,
  cultivateDemoYard,
  cultivationChoices,
  cultivationCost,
  expandYard,
  homeStreetLayout,
  isBackYard,
  nearestFreeRx,
  normalizeCultivationState,
  placementCheck,
  quoteYardExpansion,
  restoreJobId,
  yardSegments,
} from '../public/js/home-cultivation.js?v=3f6c0792';
import { HOME_LIMITS } from '../public/js/homes-catalog.js?v=29713fa8';
import {
  INTERIOR_STYLES,
  START_YARD_STYLE,
  YARD_STYLE_TEXT,
  confirmText,
  quoteStyleSwitch,
  streetLook,
  switchYardStyle,
  yardLook,
  yardStyleChoices,
  yardStyleFor,
} from '../public/js/home-styles.js?v=f591561f';
import { WALLPAPER_MAPS, WALLPAPER_PIECES } from '../public/js/home-wallpaper-art.js?v=9f8473e6';
import { roomPieces } from '../public/js/home-wallpaper.js?v=e676f00f';
import { BACK_YARD_GROUND_Y, clampRowsX, homesFeature, shiftHusbandryRows, shiftInteriorRows, towerDropTsid } from '../public/js/features/homes-feature.js?v=6aa45670';
import { getGameDayKey } from '../public/js/game-day.js?v=3095e05b';
import { towerApi } from '../public/js/features/home-tower-feature.js?v=a9047342';
import { shiftBotX } from '../public/js/features/craftybot-feature.js?v=4a7fdbc1';
import { normalizeDroppedItemState } from '../public/js/world-items.js?v=7df5cf4a';
import { applyAchievementProgress, createAchievementState } from '../public/js/achievements.js?v=631d7daa';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';

const spike = join(import.meta.dirname, '..');
const pub = join(spike, 'public');
const GS = join(spike, '../glitch-GameServerJS');
const CLIENT = join(spike, '../glitch-client/com/tinyspeck/engine');
const rich = () => ({ level: 60, imagination: 1e9 });

function gsConfig() {
  const src = readFileSync(join(GS, 'config_base.js'), 'utf8');
  const block = src.slice(src.indexOf('var home_limits = {'), src.indexOf('var disable_old_pols'));
  // eslint-disable-next-line no-new-func
  return new Function(`${block}; return home_limits;`)();
}

describe('back yard size and expansions (inc_homes.js, config_base.js)', () => {
  it('uses the source limits and costs', { skip: !existsSync(GS) }, () => {
    const gs = gsConfig();
    assert.equal(HOME_LIMITS.START_BACKYARD_SEGMENTS, gs.START_BACKYARD_SEGMENTS);
    assert.equal(HOME_LIMITS.MAX_BACKYARD_SEGMENTS, gs.MAX_BACKYARD_SEGMENTS);
    assert.deepEqual(HOME_LIMITS.BACKYARD_EXPAND_COSTS, gs.BACKYARD_EXPAND_COSTS);
    assert.equal(gs.START_INT_TEMPLATE, START_YARD_STYLE);
  });

  it('starts at 5 segments (750 px) left of the house; rx is the source x', () => {
    const st = createBackYardState();
    assert.equal(st.yard, BACK_YARD);
    assert.ok(isBackYard(st));
    assert.deepEqual(yardSegments(st), { left: 5, right: 0 });
    const layout = homeStreetLayout(st);
    assert.equal(layout.width, 750);
    assert.equal(layout.houseX, 750, 'the house starts where the yard ends');
    assert.equal(layout.maxRx, 0);
    assert.equal(layout.minRx, -690);
  });

  it('grows one segment to the left per paid expansion, 15 of them, 200 to 3,281 iMG', () => {
    const st = createBackYardState();
    const pc = { imagination: 100_000 };
    const paid = [];
    for (let i = 0; i < 15; i += 1) {
      const quote = quoteYardExpansion(st, pc);
      assert.equal(quote.count, 15 - i);
      const res = expandYard(st, pc, 'right');
      assert.ok(res.ok);
      assert.equal(res.side, 'left', 'the back yard only grows leftwards');
      assert.equal(res.maxed, i === 14, 'max_expansions:yard on the last one only');
      paid.push(res.cost);
    }
    assert.deepEqual(paid, HOME_LIMITS.BACKYARD_EXPAND_COSTS);
    assert.equal(paid[0], 200);
    assert.equal(paid[14], 3281);
    assert.equal(homeStreetLayout(st).width, 3000, 'R3: 20 segments (150 x 20 = 3000)');
    assert.equal(pc.imagination, 100_000 - paid.reduce((a, b) => a + b, 0));
    const done = quoteYardExpansion(st, pc);
    assert.equal(done.ok, false);
    assert.equal(done.reason, 'already_max_size');
    assert.equal(done.msg, "This yard can't be expanded anymore.");
  });

  it('refuses without the iMG (houses_expand_yard not_enough_img)', () => {
    const st = createBackYardState();
    const quote = quoteYardExpansion(st, { imagination: 199 });
    assert.equal(quote.ok, false);
    assert.equal(quote.reason, 'img');
    assert.equal(expandYard(st, { imagination: 199 }).ok, false);
    assert.equal(st.yardLeft, 0);
  });

  it('uses the client dialog wording (HouseExpandYardDialog.as)', { skip: !existsSync(CLIENT) }, () => {
    const as = readFileSync(join(CLIENT, 'port/HouseExpandYardDialog.as'), 'utf8');
    assert.match(as, /'Expand your '\+loc_type/);
    assert.match(as, /can be expanded <b>'\+current_costs\.count\+'<\/b> more/);
    assert.match(as, /can’t be expanded anymore/);
    const feature = readFileSync(join(pub, 'js/features/homes-feature.js'), 'utf8');
    assert.match(feature, /'Expand your yard'/);
    assert.match(feature, /This yard can be expanded \$\{quote\.count\} more/);
  });

  it('counts max_expansions:yard in the source when the last one is bought', { skip: !existsSync(GS) }, () => {
    const src = readFileSync(join(GS, 'locations/inc_homes.js'), 'utf8');
    assert.match(src, /achievements_increment\("max_expansions", "yard", 1\)/);
    const feature = readFileSync(join(pub, 'js/features/homes-feature.js'), 'utf8');
    assert.match(feature, /engine\.achievement\(back \? 'max_expansions:yard' : 'max_expansions:street', 1\)/);
  });
});

describe('cultivating the back yard (inc_cultivation.js)', () => {
  it('offers every cultivation but the Tower (street only)', () => {
    const back = cultivationChoices(createBackYardState(), rich()).map((row) => row.protoClass);
    const front = cultivationChoices(createCultivationState(), rich()).map((row) => row.protoClass);
    assert.ok(front.includes('proto_furniture_tower_chassis'));
    assert.ok(!back.includes('proto_furniture_tower_chassis'));
    assert.equal(back.length, front.length - 1);
    const st = createBackYardState({ yardLeft: 5 });
    const res = cultivate(st, rich(), 'proto_furniture_tower_chassis', -600);
    assert.equal(res.ok, false);
  });

  it('places only in the yard, clear of the way into the house', () => {
    const st = createBackYardState();
    assert.equal(placementCheck(st, 'proto_dirt_pile', 200).reason, 'edge', 'not inside the house');
    assert.equal(placementCheck(st, 'proto_dirt_pile', -100).reason, 'door');
    assert.equal(placementCheck(st, 'proto_dirt_pile', -720).reason, 'edge', 'not past the far end');
    assert.ok(placementCheck(st, 'proto_dirt_pile', -400).ok);
    const res = cultivate(st, rich(), 'proto_dirt_pile', -400, { now: 1 });
    assert.ok(res.ok);
    assert.equal(res.item.rx, -400);
    assert.equal(placementCheck(st, 'proto_peat', -420).reason, 'overlap');
  });

  it('prices from the yard’s own items (cultivation_count_items counts this location)', () => {
    const front = createCultivationState();
    cultivateDemoYard(front, 0);
    const back = createBackYardState();
    assert.equal(cultivationCost(back, 'proto_patch'), cultivationCost(createCultivationState(), 'proto_patch'));
    assert.ok(cultivationCost(front, 'proto_patch') > cultivationCost(back, 'proto_patch'));
  });

  it('keeps its items left of the house when it grows (rx stays, the far end moves)', () => {
    const st = createBackYardState();
    cultivateDemoYard(st, 0);
    assert.deepEqual(st.items.map((row) => row.rx), [-260, -560, -820]);
    assert.equal(nearestFreeRx(st, 'proto_dirt_pile', -1050), null, 'the demo yard is full');
    expandYard(st, rich());
    assert.ok(placementCheck(st, 'proto_dirt_pile', -1050).ok);
  });

  it('names its restore projects apart from the street’s', () => {
    const item = { id: 3, cycle: 2 };
    assert.equal(restoreJobId(item), 'home-proto-3-2');
    assert.equal(restoreJobId(item, createCultivationState()), 'home-proto-3-2');
    assert.equal(restoreJobId(item, createBackYardState()), 'home-proto-back-3-2');
  });

  it('round-trips, clamps, and leaves the street state unchanged', () => {
    const st = createBackYardState({ yardLeft: 99, yardRight: 4, items: [{ id: 1, protoClass: 'proto_patch', endClass: 'patch', rx: -300 }] });
    assert.equal(st.yardLeft, 15);
    assert.equal(st.yardRight, 0);
    assert.deepEqual(normalizeCultivationState(JSON.parse(JSON.stringify(st))), st);
    assert.equal('yard' in createCultivationState(), false, 'old street saves round-trip unchanged');
  });
});

describe('the house’s open left end (home_groddle.swf, homes_rebuild_floor left-open)', () => {
  it('ships the left_open piece of every visible wallpaper and the frame_open post', () => {
    const walls = Object.entries(WALLPAPER_MAPS.walls);
    assert.equal(walls.length, 65);
    for (const [key, row] of walls) {
      assert.ok(row.left_open, key);
      const piece = row.left_open.split(',')[0];
      assert.deepEqual(WALLPAPER_PIECES[piece].slice(0, 2), [150, 393], piece);
      assert.ok(existsSync(join(pub, `assets/homes/wallpaper/${piece}@2x.webp`)), piece);
    }
    for (const piece of ['crosssection_divider_end_groddle1', 'wallpaper_divider_shadow']) {
      assert.ok(existsSync(join(pub, `assets/homes/wallpaper/${piece}@2x.webp`)), piece);
    }
  });

  it('draws segment 0 as left_open with the post, and hands the ramp to the scene', () => {
    const state = { wallSegments: 7, walls: Array(7).fill('creamy_stripes'), floor: 'woodpanel', ceiling: 'wood' };
    const closed = roomPieces(state, { floorY: 620 });
    const open = roomPieces(state, { floorY: 620, leftOpen: true });
    assert.equal(closed.leftOpen, undefined);
    assert.ok(closed.pieces.some((p) => p.piece === 'crosssection_endwall_groddle1' && p.x === 0));
    const first = open.pieces.find((p) => p.segment === 0);
    assert.equal(first.piece, 'creamy_stripes_left_open');
    assert.deepEqual([first.y, first.h], [680 - 82 - 393, 393]);
    const post = open.pieces.find((p) => p.piece === 'crosssection_divider_end_groddle1');
    assert.deepEqual([post.x, post.y, post.w, post.h], [1, 680 - 247 - 245, 17, 245]);
    assert.ok(!open.pieces.some((p) => p.piece === 'crosssection_endwall_groddle1' && p.x === 0), 'no left end wall');
    assert.deepEqual([open.groundY, open.floorStart, open.rampX, open.openTop], [680, 56, -20, 433]);
    assert.equal(open.groundY, BACK_YARD_GROUND_Y);
    assert.equal(open.walls[0].h, 393, 'the open end still takes a wall swatch');
  });
});

describe('back-yard styles (homes_interior_configs)', () => {
  it('starts on Plush Pasture and draws each built yard with its street pair', () => {
    assert.equal(yardStyleFor(null), 'meadows_int_default__high');
    assert.equal(yardStyleFor('pol_int_coral_hor_high'), START_YARD_STYLE, 'not built: the start style');
    assert.deepEqual(yardLook('meadows_int_default__high'), streetLook('meadow_ext_default_high'));
    assert.deepEqual(yardLook('forest_dusk_int_1_hor_high'), streetLook('forest_dusk_ext_1_high'));
    const { choices, missing } = yardStyleChoices(START_YARD_STYLE, 3);
    assert.equal(choices.length, 34);
    assert.equal(missing.length, 3);
    assert.equal(choices.filter((row) => row.isCurrent).length, 1);
    assert.ok(INTERIOR_STYLES.every((row) => !row.built || row.lookOf));
  });

  it('switches for max(40, level x 10) iMG and refuses the current one', () => {
    const state = { yardStyle: START_YARD_STYLE };
    const pc = { level: 7, imagination: 100 };
    assert.equal(quoteStyleSwitch({ yard: true, current: START_YARD_STYLE, key: START_YARD_STYLE, imagination: 100, level: 7 }).error, 'is_current');
    const res = switchYardStyle(state, pc, '_moon__high');
    assert.ok(res.ok);
    assert.equal(res.cost, 70);
    assert.equal(pc.imagination, 30);
    assert.equal(state.yardStyle, '_moon__high');
    assert.equal(switchYardStyle(state, pc, 'pol_int_mordor_high').error, 'style_not_found');
  });

  it('uses the dialog’s yard wording', { skip: !existsSync(CLIENT) }, () => {
    const as = readFileSync(join(CLIENT, 'port/HouseStylesDialog.as'), 'utf8');
    assert.match(as, /'Change your '\+\(is_external_street \? 'street' : 'yard'\)\+' style'/);
    assert.equal(YARD_STYLE_TEXT.title, 'Change your yard style');
    assert.equal(YARD_STYLE_TEXT.confirmTitle, 'Change your yard style?');
    assert.equal(confirmText(50, 'yard'), 'Are you sure you want to change your yard style for 50i?');
    assert.equal(confirmText(50), 'Are you sure you want to change your street style for 50i?');
  });
});

describe('saves', () => {
  it('saves the back yard, its style and the house x', () => {
    homesFeature.restore({ decor: {}, cult: {}, backYard: { yardLeft: 3, items: [] }, yardStyle: '_moon__high', houseX: 1200 });
    const slice = homesFeature.save();
    assert.equal(slice.backYard.yard, 'back');
    assert.equal(slice.backYard.yardLeft, 3);
    assert.equal(slice.yardStyle, '_moon__high');
    assert.equal(slice.houseX, 1200);
    assert.equal(slice.cult.yard, undefined);
  });

  it('migrates a save from before the back yard: 5 segments, start style, indoor stacks at house x 0', () => {
    homesFeature.restore({ decor: {}, cult: { yardRight: 2 } });
    const st = homesFeature._state();
    assert.equal(st.backCult.yardLeft, 0);
    assert.equal(st.yardStyle, null);
    assert.equal(st.savedHouseX, 0, 'the indoor stacks were dropped with the room at x 0');
    homesFeature.restore(undefined);
    assert.equal(homesFeature._state().savedHouseX, null, 'a new game has nothing to move');
    assert.equal(homesFeature.save().houseX, 750);
  });

  it('moves indoor stacks with the house', () => {
    const rows = [{ x: 640, y: 620 }, { x: 'bad' }, { x: 100.4, y: 620 }];
    assert.equal(shiftInteriorRows(rows, 750), 2);
    assert.deepEqual(rows.map((r) => r.x), [1390, 'bad', 850]);
    assert.equal(shiftInteriorRows(rows, 0), 0);
    assert.equal(shiftInteriorRows(null, 150), 0);
  });
});

describe('Landgrabber (achievements/landgrabber.js)', () => {
  before(async () => {
    await loadContentCatalogsFromDir(join(pub, 'assets/content'));
  });

  it('needs the street and the yard both maxed, and now both can be', () => {
    const state = createAchievementState();
    const street = applyAchievementProgress(state, 'max_expansions:street', 1);
    assert.equal(street.find((u) => u.classTsid === 'landgrabber')?.unlocked, false);
    const yard = applyAchievementProgress(state, 'max_expansions:yard', 1);
    assert.equal(yard.find((u) => u.classTsid === 'landgrabber')?.unlocked, true);
    assert.ok(state.unlocked.includes('landgrabber'));
  });
});

describe('G226 follow-ups', () => {
  it('gives each Tower floor its own dropped-stack key', () => {
    assert.equal(towerDropTsid(0), 'RH_HOME_TOWER_0');
    assert.equal(towerDropTsid(3), 'RH_HOME_TOWER_3');
    const tower = towerApi.state();
    const was = { built: tower.built, floor: tower.floor };
    try {
      tower.built = true;
      tower.floor = 2;
      assert.equal(homesFeature.dropTsid('RH_HOME_INT'), 'RH_HOME_TOWER_2');
      assert.equal(homesFeature.dropTsid('RH_HOME_EXT'), null, 'the street keeps its own');
      tower.floor = null;
      assert.equal(homesFeature.dropTsid('RH_HOME_INT'), null, 'the house keeps RH_HOME_INT');
    } finally {
      Object.assign(tower, was);
    }
    // world-items keeps the key through a save (its cleaner allows it), and the house's
    // old stacks stay where they were: a shared key cannot say which floor they were on.
    const state = normalizeDroppedItemState({ streets: {
      RH_HOME_INT: [{ id: 'world-item-1', classTsid: 'apple', count: 2, x: 900, y: 546 }],
      RH_HOME_TOWER_1: [{ id: 'world-item-2', classTsid: 'apple', count: 1, x: 300, y: 546 }],
    } });
    assert.deepEqual(Object.keys(state.streets).sort(), ['RH_HOME_INT', 'RH_HOME_TOWER_1']);
  });

  it('moves only the house’s stacks when the house x changes, never a Tower floor’s', () => {
    const feature = readFileSync(join(pub, 'js/features/homes-feature.js'), 'utf8');
    const shift = feature.slice(feature.indexOf('function shiftShownRoom'), feature.indexOf('function syncStreetShift'));
    assert.match(shift, /room === 'interior' \? HOME_INTERIOR_TSID : HOME_STREET_TSID/);
    assert.doesNotMatch(shift, /TOWER/);
  });

  it('moves the home street’s Guano, Plop and the rest with a left expansion', () => {
    const slot = {
      guano: [{ x: 100, count: 2 }], plops: [{ x: 200, seedClass: 'seed_carrot' }], animals: [{ x: 300 }],
      sticks: [{ x: 400 }], machines: [{ x: 500 }], starved: [{ x: 600 }], batterflies: {},
    };
    assert.equal(shiftHusbandryRows(slot, 150), 6);
    assert.deepEqual(['guano', 'plops', 'animals', 'sticks', 'machines', 'starved'].map((k) => slot[k][0].x), [250, 350, 450, 550, 650, 750]);
    assert.equal(shiftHusbandryRows(null, 150), 0);
    assert.equal(shiftHusbandryRows(slot, 0), 0);
  });

  it('moves a Craftybot standing in the shifted room, and its walk', () => {
    const bot = { owned: true, where: 'interior', x: 900, xNow: 905, move: { fromX: 900, toX: 1100, startAt: 0, endAt: 1 } };
    assert.equal(shiftBotX(bot, 'street', 150), false, 'not in that room');
    assert.equal(shiftBotX(bot, 'interior', 150), true);
    assert.deepEqual([bot.x, bot.xNow, bot.move.fromX, bot.move.toX], [1050, 1055, 1050, 1250]);
    assert.equal(shiftBotX({ owned: true, where: 'pack', x: 1 }, 'interior', 150), false);
    assert.equal(shiftBotX({ owned: false, where: 'interior', x: 1 }, 'interior', 150), false);
  });

  it('measures Storage Display Boxes in world x, as the bot and the stacks', () => {
    const src = readFileSync(join(pub, 'js/features/craftybot-feature.js'), 'utf8');
    assert.match(src, /const x0 = homesFeature\.roomWorldX\?\.\(\) \|\| 0;[\s\S]{0,400}x: x0 \+ p\.x, sdb: true/);
    homesFeature.restore({ decor: {}, cult: {}, backYard: { yardLeft: 2 }, houseX: 1050 });
    assert.equal(homesFeature.roomWorldX(), 1050, 'the x the indoor stacks were saved against');
    homesFeature.restore(undefined);
    assert.equal(homesFeature.roomWorldX(), 750, 'a new game: the 5-segment yard');
  });

  it('saves the Magic Rock flags and the street’s house x; old saves start fresh', () => {
    homesFeature.restore({ decor: {}, cult: {}, magicRock: { cultivate: 'howto_shown', keys: 'x' }, streetHouseX: 1200 });
    let st = homesFeature._state();
    assert.deepEqual(st.rockFlags, { cultivate: 'howto_shown' });
    assert.equal(st.savedStreetHouseX, 1200);
    assert.deepEqual(homesFeature.save().magicRock, { cultivate: 'howto_shown' });
    homesFeature.restore({ decor: {}, cult: { yardLeft: 2 } });
    st = homesFeature._state();
    assert.deepEqual(st.rockFlags, {});
    assert.equal(st.savedStreetHouseX, null, 'nothing to move until the street grows again');
    assert.ok(Number.isFinite(homesFeature.save().streetHouseX));
  });

  it('offers the yard rock’s verbs only for the rock, and runs only its own', () => {
    // G232: today's iMG already handed over, so talk to is not offered.
    homesFeature.restore({ decor: {}, cult: {}, magicRock: {}, rockImgDay: getGameDayKey(Date.now()) });
    const engine = { pc: { level: 3 } };
    const rows = homesFeature.verbsFor({ classId: 'magic_rock', state: { room: 'yard' } }, engine);
    assert.deepEqual(rows.map((r) => r.id), ['howto_changestyle', 'howto_expand', 'howto_cultivate']);
    assert.equal(homesFeature.runVerb({ classId: 'magic_rock', state: { room: 'yard' } }, 'pickup', engine), false);
  });

  it('G232: an old Tower stack past the house’s right wall is set down inside it', () => {
    const rows = [{ x: 1810 }, { x: 1150 }, { x: -20 }, { x: 'n/a' }];
    assert.equal(clampRowsX(rows, 36, 1688), 2);
    assert.deepEqual(rows.map((r) => r.x), [1688, 1150, 36, 'n/a']);
    assert.equal(clampRowsX(rows, 36, 1688), 0, 'once inside, nothing moves');
    // A pre-G135 save: tower x 1060 + the 750 px yard is past the 1050 px house's inner right (750 + 974).
    assert.ok(1060 + 750 > 750 + 1050 - 76);
    const feature = readFileSync(join(pub, 'js/features/homes-feature.js'), 'utf8');
    assert.match(feature, /syncHouseShift\(engine\);\s*keepStacksInHouse\(engine\);/);
  });

  it('draws dropped stacks when a home room is built, and every drop path uses the room’s key', () => {
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    const render = game.slice(game.indexOf('async function renderHomeScene('), game.indexOf('async function showLocationTransition('));
    assert.match(render, /homeScene\?\.enter\?\.\(\);\s*\/\/[^\n]*\n\s*refreshDroppedWorldItems\(\);/);
    assert.doesNotMatch(game, /(dropInventoryStack|pickupDroppedStack|listDroppedStacks)\(droppedItemState,[^)]*currentStreetTsid/);
    assert.match(game, /dropInventoryStack\(\s*droppedItemState,\s*inv,\s*droppedStacksTsid\(\),/);
  });
});
