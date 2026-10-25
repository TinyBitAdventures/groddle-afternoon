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
  START_STREET_STYLE,
  STYLE_TEXT,
  changeForLabel,
  confirmText,
  quoteStyleSwitch,
  streetStyleFor,
  styleChoices,
  styleSwitchCost,
  switchStreetStyle,
} from '../public/js/home-styles.js';
import { HOME_STYLES } from '../public/js/homes.js';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = join(spike, '../glitch-GameServerJS');
const dialogAs = join(spike, '../glitch-client/com/tinyspeck/engine/port/HouseStylesDialog.as');
const signAs = join(spike, '../glitch-client/com/tinyspeck/engine/port/HouseSignDialog.as');

function gsjsStyles() {
  const src = readFileSync(join(GS, 'inc_data_homes_prod.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  return new Function(`${src}; return { homes_interior_configs, homes_exterior_configs };`)();
}

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
  it('offers every exterior style with surviving art; Coral Caves is left out with its reason', () => {
    const { choices, missing } = styleChoices(START_STREET_STYLE, 5);
    assert.equal(choices.length, 36);
    assert.deepEqual(missing.map((row) => row.label), ['Coral Caves']);
    assert.match(missing[0].reason, /CC0/);
    assert.equal(choices.filter((row) => row.isCurrent).length, 1);
    for (const row of INTERIOR_STYLES) {
      assert.equal(row.built, false);
      assert.match(row.reason, /back yard/);
    }
  });

  it('draws only shipped CC0 decos', () => {
    const decos = join(spike, 'public/assets/decos/groddle');
    const names = new Set();
    for (const row of EXTERIOR_STYLES.filter((r) => r.built)) {
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
    assert.equal(streetStyleFor(null, 'firebog'), 'firebog_1_high');
    assert.equal(streetStyleFor('pol_ext_coral_high', 'uralia'), 'uralia_1_high');
    assert.equal(streetStyleFor('nonsense', 'nonsense'), START_STREET_STYLE);
  });

  it('is up to date with GSJS and the recipes', () => {
    execFileSync(process.execPath, [join(spike, 'tools/home-styles/build.mjs'), '--check'], { stdio: 'pipe' });
  });

  it('the homes feature saves the chosen style with the yard and imports one module key', () => {
    const src = readFileSync(join(spike, 'public/js/features/homes-feature.js'), 'utf8');
    assert.match(src, /houseVisits, streetStyle \};/);
    const keys = new Set([...src.matchAll(/home-styles\.js\?v=([\w-]+)/g)].map((m) => m[1]));
    assert.equal(keys.size, 1);
  });
});
