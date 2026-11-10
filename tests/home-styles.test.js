/**
 * Home street styles and the style switch (register G204): the list against
 * GameServerJS inc_data_homes_prod.js, the switch cost of players/inc_houses.js
 * house_style_switch_cost, the client HouseStylesDialog wording, and the CC0
 * composition data (tools/home-styles/build.mjs --check).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXTERIOR_STYLES,
  INTERIOR_STYLES,
  PURCHASE_STREET_STYLE,
  PURCHASE_YARD_STYLE,
  START_YARD_STYLE,
  YARD_STYLE_BY_KEY,
  yardStyleFor,
  yardStyleChoices,
  yardLook,
  switchYardStyle,
  streetLook,
  STREET_STYLE_BY_KEY,
  START_STREET_STYLE,
  STYLE_TEXT,
  changeForLabel,
  confirmText,
  quoteStyleSwitch,
  streetStyleFor,
  styleChoices,
  styleSwitchCost,
  switchStreetStyle,
} from '../public/js/home-styles.js?v=5b49a731';
import { HOME_STYLES } from '../public/js/homes.js?v=631ab6b8';
import { templateNames, templatePair } from '../tools/home-styles/build.mjs';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = join(spike, '../glitch-GameServerJS');
const dialogAs = join(spike, '../glitch-client/com/tinyspeck/engine/port/HouseStylesDialog.as');
const signAs = join(spike, '../glitch-client/com/tinyspeck/engine/port/HouseSignDialog.as');

function gsjsStyles() {
  const src = readFileSync(join(GS, 'inc_data_homes_prod.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  return new Function(`${src}; return { homes_interior_configs, homes_exterior_configs };`)();
}

/** G223 lane yards2: the next sixteen yards by distance from Glitch E's 2012-05-21 snaps (reference only), and pieces each must show. */
const NEXT_SNAP_YARDS = {
  firebog_int_1b__high: ['Glaring Muddle', /snap 12872/, ['legs_front_set', 'backhill1_green', 'legs_moss_1', 'sprout']],
  firebog_int_3_hor_high: ['Unkempt Crypt', /snap 12877/, ['hanging_braches1', 'hanging_braches2', 'legs_front_set', 'legs_moss_1']],
  _moon__high: ['Silent Orbit', /snaps 13047 and 13046/, ['k03_snowball_01', 'light_spot']],
  kajuu_2__high: ['Roaming Rubble', /snap 12884/, ['tree_acacia_1', 'craggyMountain_background_01', 'cliff_cover_5']],
  _rook__high: ['Dark Vista', /snap 12870/, ['groddle_light_pool', 'craggyMountain_background_01', 'hanging_vine_01', 'tree_02']],
  firebog_int_4_hor_high: ['Perfus Preference', /snap 12878/, ['background_bottletree_hut', 'legs_front_set', 'firebean_1', 'clouds3']],
  forest_1_hor_high: ['Saplings Skip', /snaps 12971 and 12970/, ['forestShape_pine', 'tree_pineCluster1', 'mountain_blue_1', 'cloud_fluffy_1']],
  forest_2__high: ['Busy Acre', /snaps 12975 and 12974/, ['forestShape_pine', 'tree_coniferous_fg_1', 'heights_tree_bare_2', 'treeStump3']],
  forest_3__high: ['Evergreen Sweep', /snaps 12979 and 12978/, ['forestShape_pine', 'corey3_mountain_cut2', 'tree_dead_1']],
  forest_4__high: ['Vitric Inlet', /snap 12880/, ['forestShape_pine', 'water_ripple_double_1', 'mountain_blue_1']],
  forest_5__high: ['Mulberry Mark', /snaps 12981 and 12980/, ['forestShape_pine', 'newxp_haze_oval_1', 'flower_bush_1']],
  forest_6__high: ['Olsen Rose', /snap 12881/, ['forestShape_pine', 'tree_deciduous3', 'tree_coniferous_2']],
  heights_1__high: ['Tip Top Trinket', /snaps 13022 and 13021/, ['heights_face_rock_2', 'tree_pineCluster1', 'heights_bush_1']],
  meadows_1__high: ['Blossom Thicket', /snaps 12959 and 12958/, ['forestShape_pine', 'mountain_blue_1', 'tree_coniferous_fg_1']],
  basic: ['Warm Frolic', /snap 12965/, ['forestShape_pine', 'tree_deciduous3', 'flower_bush_7']],
  highlands_1_hor_high: ['Wailing Uplands', /snaps 13043 and 13042/, ['evenground_horizon', 'tree_pineCluster1', 'tree_deciduous3']],
};

describe('home styles list (inc_data_homes_prod.js)', () => {
  const gs = gsjsStyles();

  it('has the 37 exterior and 37 interior styles in source order', () => {
    assert.deepEqual(EXTERIOR_STYLES.map((row) => row.key), Object.keys(gs.homes_exterior_configs));
    assert.deepEqual(INTERIOR_STYLES.map((row) => row.key), Object.keys(gs.homes_interior_configs));
    assert.equal(EXTERIOR_STYLES.length, 37);
    assert.equal(INTERIOR_STYLES.length, 37);
  });

  it('keeps each style label, template and subscriber flag (48 subscriber-only)', () => {
    for (const [rows, cfgs] of [[EXTERIOR_STYLES, gs.homes_exterior_configs], [INTERIOR_STYLES, gs.homes_interior_configs]]) {
      for (const row of rows) {
        const cfg = cfgs[row.key];
        assert.equal(row.label, cfg.label, row.key);
        assert.equal(row.template, cfg.template, row.key);
        assert.equal(row.subscriber, cfg.is_subscriber === true, row.key);
      }
    }
    const subs = [...EXTERIOR_STYLES, ...INTERIOR_STYLES].filter((row) => row.subscriber).length;
    assert.equal(subs, 48);
  });

  it('carries the September 2012 batch of five pairs (templates *IJ83*, images 2012-09-05)', () => {
    const pairs = [
      ['Tjorn Trample', 'Vatn Road'],
      ['Nightfall Surprise', 'Eventide Essence'],
      ['Ruddy Skies', 'Sunset Strip'],
      ['Anemone Alley', 'Coral Caves'],
      ['Grasslands Graze', 'Llano Lane'],
    ];
    for (const [inner, outer] of pairs) {
      const i = INTERIOR_STYLES.find((row) => row.label === inner);
      const e = EXTERIOR_STYLES.find((row) => row.label === outer);
      assert.ok(i && e, `${inner} / ${outer}`);
      for (const row of [i, e]) {
        assert.match(row.template, /IJ83/, row.label);
        assert.equal(row.added, '2012-09-05', row.label);
      }
    }
  });

  it('starts on the source START_EXT_TEMPLATE and maps the purchase looks onto source styles', () => {
    const cfg = readFileSync(join(GS, 'config_base.js'), 'utf8');
    assert.match(cfg, new RegExp(`START_EXT_TEMPLATE\\s*:\\s*'${START_STREET_STYLE}'`));
    assert.deepEqual(Object.keys(PURCHASE_STREET_STYLE).sort(), Object.keys(HOME_STYLES).sort());
    assert.equal(PURCHASE_STREET_STYLE.meadow, START_STREET_STYLE);
    for (const key of Object.values(PURCHASE_STREET_STYLE)) assert.ok(EXTERIOR_STYLES.find((row) => row.key === key)?.built, key);
  });

  it('G263: each purchase look starts on the source tutorial’s street and yard (magic_rock.js 594-605)', () => {
    assert.deepEqual(PURCHASE_STREET_STYLE, { meadow: 'meadow_ext_default_high', firebog: 'firebog_4_high', uralia: 'uralia_2_high' });
    assert.deepEqual(PURCHASE_YARD_STYLE, { meadow: 'meadows_int_default__high', firebog: 'firebog_int_4__high', uralia: 'uralia_int_2_hor_high' });
    assert.deepEqual(Object.keys(PURCHASE_YARD_STYLE).sort(), Object.keys(HOME_STYLES).sort());
    for (const key of Object.values(PURCHASE_YARD_STYLE)) assert.ok(YARD_STYLE_BY_KEY[key]?.built, key);
    assert.equal(PURCHASE_YARD_STYLE.meadow, START_YARD_STYLE);
    const rock = join(GS, 'items/magic_rock.js');
    if (existsSync(rock)) {
      const src = readFileSync(rock, 'utf8');
      for (const look of Object.keys(PURCHASE_STREET_STYLE)) {
        const ext = PURCHASE_STREET_STYLE[look];
        const int = PURCHASE_YARD_STYLE[look];
        assert.match(src, new RegExp(`instance_id == '${ext}_newxp'\\)\\{\\s*ext_style = '${ext}';\\s*int_style = '${int}';`), look);
      }
    }
    const training = join(GS, 'locations/newxp_training2.js');
    if (existsSync(training)) {
      const src = readFileSync(training, 'utf8');
      for (const ext of Object.values(PURCHASE_STREET_STYLE)) assert.ok(src.includes(`house_style == '${ext}'`), ext);
    }
    // A home that never changed style saves none: saved Firebog and Uralia homes follow on load.
    assert.equal(streetStyleFor(null, 'firebog'), 'firebog_4_high');
    assert.equal(yardStyleFor(null, 'firebog'), 'firebog_int_4__high');
    assert.equal(yardStyleFor(null, 'uralia'), 'uralia_int_2_hor_high');
    assert.equal(yardStyleFor(null, 'meadow'), 'meadows_int_default__high');
    assert.equal(yardStyleFor(null), START_YARD_STYLE);
    assert.equal(yardStyleFor('forest_dusk_int_1_hor_high', 'firebog'), 'forest_dusk_int_1_hor_high', 'a chosen yard stays');
    const feature = readFileSync(join(spike, 'public/js/features/homes-feature.js'), 'utf8');
    assert.match(feature, /return yardStyleFor\(yardStyle, engine\?\.homeContext\?\.\(\)\.style \|\| 'meadow'\);/);
    assert.ok(!/yardStyleFor\(yardStyle\)/.test(feature), 'every yard read goes through the purchase look');
  });
});

describe('style switch cost (players/inc_houses.js house_style_switch_cost)', () => {
  it('is level x 10 iMG, never under 40', () => {
    const src = readFileSync(join(GS, 'players/inc_houses.js'), 'utf8');
    const fn = src.slice(src.indexOf('function house_style_switch_cost'), src.indexOf('function houses_style_set'));
    assert.match(fn, /this\.stats_get_level\(\) \* 10/);
    assert.match(fn, /if \(cost < 40\) cost = 40;/);
    for (let level = 1; level <= 60; level += 1) assert.equal(styleSwitchCost(level), Math.max(40, level * 10), `level ${level}`);
    assert.equal(styleSwitchCost(1), 40);
    assert.equal(styleSwitchCost(4), 40);
    assert.equal(styleSwitchCost(5), 50);
    assert.equal(styleSwitchCost(60), 600);
  });

  it('charges the cost and keeps everything else (houses_style_set / homes_set_style)', () => {
    const state = { streetStyle: START_STREET_STYLE, other: 'kept' };
    const pc = { level: 12, imagination: 500 };
    const res = switchStreetStyle(state, pc, 'savannah_ext_1_high');
    assert.equal(res.ok, true);
    assert.equal(res.cost, 120);
    assert.equal(pc.imagination, 380);
    assert.equal(state.streetStyle, 'savannah_ext_1_high');
    assert.equal(state.other, 'kept');
  });

  it('refuses as the source does: not at home, unknown style, not enough iMG', () => {
    const base = { current: START_STREET_STYLE, imagination: 1000, level: 10 };
    assert.equal(quoteStyleSwitch({ ...base, atHome: false, key: 'basic' }).error, 'not_at_home');
    assert.equal(quoteStyleSwitch({ ...base, key: 'no_such_style' }).error, 'style_not_found');
    assert.equal(quoteStyleSwitch({ ...base, key: START_STREET_STYLE }).error, 'is_current');
    const short = quoteStyleSwitch({ ...base, imagination: 99, key: 'basic' });
    assert.equal(short.error, 'not_enough_img');
    assert.equal(short.msg, STYLE_TEXT.needImg);
    const pc = { level: 10, imagination: 99 };
    const state = { streetStyle: START_STREET_STYLE };
    assert.equal(switchStreetStyle(state, pc, 'basic').ok, false);
    assert.equal(pc.imagination, 99);
    assert.equal(state.streetStyle, START_STREET_STYLE);
  });

  it('drops the subscriber gate: subscriber styles are offered like the rest', () => {
    const { choices } = styleChoices(START_STREET_STYLE, 1);
    assert.ok(choices.some((row) => EXTERIOR_STYLES.find((s) => s.key === row.key).subscriber));
    assert.equal(quoteStyleSwitch({ current: START_STREET_STYLE, key: 'aranna_ext_1_high', imagination: 40, level: 1 }).ok, true);
  });
});

describe('Change Style wording (client HouseStylesDialog.as, HouseSignDialog.as)', () => {
  it('uses the source button, title, confirm and choice labels', { skip: !existsSync(dialogAs) }, () => {
    const dlg = readFileSync(dialogAs, 'utf8');
    const sign = readFileSync(signAs, 'utf8');
    assert.match(sign, /buildButton\('Change Style'/);
    assert.equal(STYLE_TEXT.button, 'Change Style');
    assert.match(dlg, /'Change your '\+\(is_external_street \? 'street' : 'yard'\)\+' style'/);
    assert.equal(STYLE_TEXT.title, 'Change your street style');
    assert.equal(STYLE_TEXT.confirmTitle, 'Change your street style?');
    assert.match(dlg, /\{value: false, label: 'Nevermind'\}/);
    assert.match(dlg, /\{value: true, label: 'Yes\. Change it!'\}/);
    assert.match(dlg, /'Change for '\+StringUtil\.formatNumberWithCommas\(house_styles\.cost\)\+'i'/);
    assert.match(dlg, /'You need more imagination'/);
    assert.match(dlg, /Are you sure you want to change your street style for <b>/);
    assert.equal(changeForLabel(1200), 'Change for 1,200i');
    assert.equal(confirmText(50), 'Are you sure you want to change your street style for 50i?');
  });
});

describe('composed styles (tools/home-styles/build.mjs)', () => {
  it('offers every exterior style, Coral Caves included (lane coral)', () => {
    const { choices, missing } = styleChoices(START_STREET_STYLE, 5);
    assert.equal(choices.length, 37);
    assert.deepEqual(missing, []);
    assert.equal(choices.filter((row) => row.isCurrent).length, 1);
  });

  it('draws 36 of the 37 back yards with the look of their street pair (G135)', () => {
    const built = INTERIOR_STYLES.filter((row) => row.built);
    assert.equal(built.length, 36);
    for (const row of built) assert.equal(EXTERIOR_STYLES.find((ext) => ext.key === row.lookOf)?.built, true, row.key);
    assert.deepEqual(INTERIOR_STYLES.filter((row) => !row.built).map((row) => row.label), ['More Door']);
    for (const row of INTERIOR_STYLES.filter((r) => !r.built)) assert.ok(row.reason);
  });

  it('offers Bewitched Backwoods, paired with Mythical Oak and drawn from its own yard snaps (G223)', () => {
    const row = YARD_STYLE_BY_KEY._triney__high;
    assert.equal(row.label, 'Bewitched Backwoods');
    assert.equal(row.built, true);
    assert.equal(row.lookOf, 'meadows_int_default__high');
    assert.equal(STREET_STYLE_BY_KEY[row.lookOf].label, 'Mythical Oak');
    assert.equal(row.borrowed, undefined, 'its pair is the template family\'s, like every other yard');
    assert.match(row.ref, /snap 12871/);
    assert.deepEqual(yardLook('_triney__high'), row.look, 'its own composition');
    assert.notDeepEqual(yardLook('_triney__high'), streetLook('meadows_int_default__high'));
    const names = new Set(row.look.layers.flatMap((l) => (l.items || []).flatMap((it) => [it.s, ...(it.alts || []).map((a) => a.s)])));
    for (const want of ['tree_deciduous1', 'light_shafts_blue', 'tree_dead_2', 'corey3_shroom_aqua1', 'tree_plane_foliage_01a_g1']) assert.ok(names.has(want), want);
    assert.ok(row.look.near.some((it) => it.s === 'plant_fern_1'), 'fiddleheads in front');
    // The yards with pictures of their own (this one, Anemone Alley and the lane yards' seven, next test); Plush Pasture,
    // which shares the key's spelling, still draws Heartfelt Heath.
    assert.equal(YARD_STYLE_BY_KEY.meadows_int_default__high.look, undefined);
    assert.equal(INTERIOR_STYLES.filter((r) => r.borrowed).length, 0);
    assert.equal(YARD_STYLE_BY_KEY.meadows_int_default__high.lookOf, 'meadow_ext_default_high');
    assert.equal(YARD_STYLE_BY_KEY.meadows_int_default__high.label, 'Plush Pasture');
    // The price and the way it is bought are every style's: house_style_switch_cost, level x 10 and at least 40 iMG (players/inc_houses.js 1603-1667).
    const { choices, cost } = yardStyleChoices('basic', 30);
    assert.equal(cost, 300);
    assert.deepEqual(choices.find((c) => c.key === '_triney__high').look, row.look, 'the picker shows the yard\'s own look');
    const state = { yardStyle: 'basic' };
    const pc = { imagination: 500, level: 30 };
    assert.equal(switchYardStyle(state, pc, '_triney__high', { atHome: true }).ok, true);
    assert.equal(state.yardStyle, '_triney__high');
    assert.equal(pc.imagination, 200);
    assert.equal(yardStyleFor('_triney__high'), '_triney__high', 'a saved choice stands');
  });

  it('draws the seven yards furthest from their 2012 snaps from those snaps, in CC0 decos (G223, lane yards)', () => {
    // Glitch E's labelled back-yard snaps of 2012-05-21 (reference only): the yard, its snap, and pieces it must show.
    const want = {
      firebog_int_1b_hor_high: ['Night Lights', /snap 12874/, ['flying_platform_2', 'tree_14', 'zutto_platform_3', 'newxp_haze_oval_1']],
      uralia_1_hor_high: ['Wistful Tangle', /snap 12961/, ['bck_rock_22', 'flying_platform_2', 'tree_11', 'tree_10']],
      uralia_int_3__high: ['Waggish Wander', /snap 12963/, ['moon', 'flying_platform_6', 'tree_8', 'zutto_platform_1']],
      firebog_1_hor_high: ['Arid Boglands', /snap 12968/, ['legs_front_set', 'bottletree_body2', 'treetop_noflowers_1', 'sprout']],
      firebog_int_2__high: ['Faithful Fen', /snap 12876/, ['background_horizon_bottletrees_1', 'background_bottletree_face', 'legs_front_set', 'firebean_1']],
      kajuu_1__high: ['Dusty Barrens', /snaps 12883 and 12882/, ['tree_acacia_1', 'cliff_cover_3', 'heights_bush_1']],
      kajuu_int_3_hor_high: ['Torrid Cove', /snaps 12886 and 12885/, ['stalagmite_2', 'heights_face_1', 'tree_acacia_1']],
    };
    const own = INTERIOR_STYLES.filter((r) => r.look).map((r) => r.key).sort();
    assert.deepEqual(own, [...Object.keys(want), ...Object.keys(NEXT_SNAP_YARDS), '_triney__high', 'pol_int_coral_hor_high'].sort());
    for (const [key, [label, ref, pieces]] of Object.entries(want)) {
      const row = YARD_STYLE_BY_KEY[key];
      assert.equal(row.label, label);
      assert.equal(row.built, true, label);
      assert.match(row.ref, ref, label);
      assert.deepEqual(yardLook(key), row.look, `${label}: its own composition`);
      assert.notDeepEqual(yardLook(key), streetLook(row.lookOf), `${label}: no longer its street's look`);
      const names = new Set(row.look.layers.flatMap((l) => (l.items || []).flatMap((it) => [it.s, ...(it.alts || []).map((a) => a.s)])));
      for (const piece of pieces) assert.ok(names.has(piece), `${label}: ${piece}`);
      // Every piece is a shipped CC0 deco (build.mjs refuses one that is not). Hanging pieces start at y + YARD_LIFT (60) and must
      // reach below world y 340, past the top of the yard the camera shows at Original zoom (world 312 on a 760 px window).
      for (const it of row.look.layers.flatMap((l) => l.items || [])) {
        if (it.flipY) assert.ok(it.y + 60 + it.h * it.scale > 340, `${label}: ${it.s} hangs into view`);
      }
    }
    // The walking bottletrees keep their legs, body and treetop together (no jitter on any part).
    for (const key of ['firebog_1_hor_high', 'firebog_int_2__high']) {
      const parts = YARD_STYLE_BY_KEY[key].look.layers.flatMap((l) => l.items || []).filter((it) => /^(legs_|bottletree_body|treetop_)/.test(it.s));
      assert.ok(parts.length >= 4);
      for (const it of parts) assert.equal(it.jitter, 0, `${key}: ${it.s}`);
    }
  });

  it('draws the next sixteen yards from the same snaps: six landscapes and ten dense forests (G223, lane yards2)', () => {
    for (const [key, [label, ref, pieces]] of Object.entries(NEXT_SNAP_YARDS)) {
      const row = YARD_STYLE_BY_KEY[key];
      assert.equal(row.label, label);
      assert.equal(row.built, true, label);
      assert.match(row.ref, ref, label);
      assert.deepEqual(yardLook(key), row.look, `${label}: its own composition`);
      assert.notDeepEqual(yardLook(key), streetLook(row.lookOf), `${label}: no longer its street's look`);
      const items = row.look.layers.flatMap((l) => l.items || []);
      const names = new Set(items.flatMap((it) => [it.s, ...(it.alts || []).map((a) => a.s)]));
      for (const piece of pieces) assert.ok(names.has(piece), `${label}: ${piece}`);
      // Roots and vines hanging from the top reach into the view at Original zoom (world 312, see the last test).
      for (const it of items) if (it.hang) assert.ok(it.y + 60 + it.h * it.scale > 340, `${label}: ${it.s} hangs into view`);
    }
    // The forest yards' snaps show a dense pine forest where their streets have flat blob hills.
    const BLOBS = ['pinehills_distant_1', 'pinehills_1', 'wallpaper_tree_short_1', 'transition_hill_1', 'evenground_mound_1'];
    for (const key of ['forest_1_hor_high', 'forest_2__high', 'forest_3__high', 'forest_4__high', 'forest_5__high', 'forest_6__high', 'heights_1__high', 'meadows_1__high', 'basic', 'highlands_1_hor_high']) {
      const { look, label } = YARD_STYLE_BY_KEY[key];
      const names = look.layers.flatMap((l) => (l.items || []).flatMap((it) => [it.s, ...(it.alts || []).map((a) => a.s)]));
      for (const blob of BLOBS) assert.ok(!names.includes(blob), `${label}: no ${blob}`);
      assert.ok(names.some((n) => /^tree_pineCluster|^forestShape_pine|^corey3_forestShape_pine/.test(n)), `${label}: a pine forest`);
    }
    // Walking bottletrees keep their legs, body and treetop together.
    for (const key of ['firebog_int_1b__high', 'firebog_int_3_hor_high', 'firebog_int_4_hor_high']) {
      const parts = YARD_STYLE_BY_KEY[key].look.layers.flatMap((l) => l.items || []).filter((it) => /^(legs_(back|front)|bottletree_body|treetop_)/.test(it.s));
      assert.ok(parts.length >= 4, key);
      for (const it of parts) assert.equal(it.jitter, 0, `${key}: ${it.s}`);
    }
  });

  it('pairs every yard with its street by the template streets\' names, not the style keys (G223)', () => {
    const names = templateNames(join(GS, 'inc_data_maps_prod.js'));
    const exterior = EXTERIOR_STYLES;
    for (const row of INTERIOR_STYLES) {
      const pair = templatePair(row.template, exterior, names);
      if (row.key === 'pol_int_mordor_high') {
        assert.equal(pair, null, 'More Door: POL_int_mordor_high has no street');
        continue;
      }
      assert.ok(pair, row.key);
      assert.equal(row.built, true, row.key);
      assert.equal(row.lookOf, pair.key, `${row.label} (${names[row.template]})`);
    }
    // The three the keys got wrong: inc_data_maps_prod.js names LHVMN2RPE9U24OJ uralia_int_2a_HOR_high,
    // LHVMRH2SE9U2SEM firebog_int_4_HOR_high and LHVMS6CSE9U2NKR firebog_int_4a_HOR_high.
    const label = (key) => STREET_STYLE_BY_KEY[YARD_STYLE_BY_KEY[key].lookOf].label;
    assert.equal(label('firebog_int_1b_hor_high'), 'Midnight Glow', 'Night Lights (a player: "Midnight Glow - (Night Lights)")');
    assert.equal(label('firebog_int_4__high'), 'Vidya Vent', 'Easy Ash');
    assert.equal(label('firebog_int_4_hor_high'), 'Crinum Quag', 'Perfus Preference');
    assert.equal(label('firebog_int_1b__high'), "Raima's Roost", 'Glaring Muddle keeps its pair');
    // The Firebog tutorial home now has a matching street and yard (magic_rock.js 594-597).
    assert.equal(YARD_STYLE_BY_KEY[PURCHASE_YARD_STYLE.firebog].lookOf, PURCHASE_STREET_STYLE.firebog);
  });

  it('draws Toxic Moon as its header does: one drum on its side, grey dust, no drums by the door (G223)', () => {
    const look = streetLook('_moon_high');
    assert.ok(!look.trim.some((it) => /^ra_drum/.test(it.s)), 'no drums in the border by the house');
    const drums = look.near.filter((it) => /^ra_drum/.test(it.s));
    assert.deepEqual(drums.map((it) => it.s), ['ra_drum_1'], 'one drum, lying down');
    assert.ok(drums[0].every >= 2000, 'out on the plain, now and then');
    assert.ok(!look.near.some((it) => it.s === 'earthdot_grp_3'), 'no orange-brown stains');
  });

  it('draws Coral Caves and its yard Anemone Alley from the CC0 kit the visual match found (lane coral, G223)', () => {
    const street = STREET_STYLE_BY_KEY.pol_ext_coral_high;
    assert.equal(street.label, 'Coral Caves');
    assert.equal(street.built, true);
    const yard = YARD_STYLE_BY_KEY.pol_int_coral_hor_high;
    assert.equal(yard.label, 'Anemone Alley');
    assert.equal(yard.built, true);
    assert.equal(yard.lookOf, 'pol_ext_coral_high', 'paired by template names POL_int_coral_HOR_high / POL_ext_coral_high');
    assert.match(yard.ref, /snap 76401/);
    assert.deepEqual(yardLook('pol_int_coral_hor_high'), yard.look, 'its own composition from the doorway snap');
    const names = (look) => new Set([
      ...look.layers.flatMap((l) => (l.items || []).flatMap((it) => [it.s, ...(it.alts || []).map((a) => a.s)])),
      ...look.near.flatMap((it) => [it.s, ...(it.alts || []).map((a) => a.s)]),
      ...look.trim.map((it) => it.s),
    ]);
    // The matched pieces (research/hunts/2026-11-08-coral-caves/findings.md): Samudra's rocks and beaded
    // branches, Ilmenskie's fiddleheads, mushrooms and mounds, Firebog's boat and red mushrooms.
    const s = names(streetLook('pol_ext_coral_high'));
    for (const want of ['cone_top_rock_01a_al1', 'rock_rubble_01b_al1', 'underground_bogwillow', 'plant_fern_1', 'plant_giant_fern_2', 'purple_mushroom_2', 'mushrooms', 'cave_background_hill_1', 'back_wall_1', 'boat']) assert.ok(s.has(want), want);
    const y = names(yard.look);
    for (const want of ['cone_top_rock_01a_al1', 'underground_bogwillow_3', 'plant_fern_2', 'plant_giant_fern_2', 'rock_rubble_01b_al1', 'rock_snowy_1c_al1', 'cave_background_hill_1']) assert.ok(y.has(want), want);
    // Nothing stands in for the pieces no CC0 symbol matched (kelp blades, dark crystal columns, pale spires).
    for (const look of [streetLook('pol_ext_coral_high'), yard.look]) {
      for (const name of names(look)) assert.ok(!/cave_crystal|cave_icicle|stalagmite_/.test(name), name);
    }
  });

  it('draws only shipped CC0 decos', () => {
    const decos = join(spike, 'public/assets/decos/groddle');
    const names = new Set();
    // Every street look, and every yard drawn from a picture of its own (G223).
    for (const row of [...EXTERIOR_STYLES, ...INTERIOR_STYLES].filter((r) => r.built && r.look)) {
      const { look } = row;
      for (const layer of look.layers) for (const item of layer.items || []) for (const alt of item.alts || [item]) names.add(alt.s);
      for (const item of look.near) for (const alt of item.alts || [item]) names.add(alt.s);
      for (const item of look.trim) names.add(item.s);
      if (look.soil) names.add(look.soil);
      assert.ok(look.sky.length >= 2 && look.trim.length === 3, row.key);
    }
    for (const name of names) {
      const file = name.endsWith('.svg') ? name : `${name}.webp`;
      assert.ok(existsSync(join(decos, file)), file);
    }
  });

  it('keeps a saved style, else the purchase look’s', () => {
    assert.equal(streetStyleFor('basic', 'firebog'), 'basic');
    assert.equal(streetStyleFor(null, 'firebog'), 'firebog_4_high');
    assert.equal(streetStyleFor('pol_ext_coral_high', 'uralia'), 'pol_ext_coral_high', 'Coral Caves is built (lane coral)');
    assert.equal(streetStyleFor('nonsense', 'nonsense'), START_STREET_STYLE);
  });

  it('is up to date with GSJS and the recipes', () => {
    execFileSync(process.execPath, [join(spike, 'tools/home-styles/build.mjs'), '--check'], { stdio: 'pipe' });
  });

  it('the homes feature saves the chosen style with the yard and imports one module key', () => {
    const src = readFileSync(join(spike, 'public/js/features/homes-feature.js'), 'utf8');
    assert.match(src, /houseVisits,\n\s+streetStyle,\n\s+\/\/ G135[^\n]*\n\s+backYard: backCult,\n\s+yardStyle,/);
    const keys = new Set([...src.matchAll(/home-styles\.js\?v=([\w-]+)/g)].map((m) => m[1]));
    assert.equal(keys.size, 1);
  });
});
