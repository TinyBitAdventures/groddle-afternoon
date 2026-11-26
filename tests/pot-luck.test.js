/**
 * Pot Luck Day, part A (G982): the season's window and QA overrides (js/seasons.js), the chicken
 * costumes' rules (js/pot-luck.js), the dress flow and the Fancy Feather in the feature
 * (features/pot-luck-feature.js), the server's word on a shared Chicken (js/street-creatures.js),
 * the drop on a Chicken (js/world-drop.js), and the costume art (tools/pot-luck-art).
 * Run: node --test tests/pot-luck.test.js
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageSize } from '../tools/image-size.mjs';
import { HIRES_SPRITES } from '../public/js/sprite-hires.js?v=e96be5f1';
import { HIRES_ICONS } from '../public/js/icon-hires.js?v=60e2474b';
import { PACKED_SHEETS } from '../public/js/packed-sheets-data.js?v=192c6f15';
import { SEASONS, SEASONAL_STOCK, SEASONAL_ITEMS, activeSeasons, calendarSeasons, daysLeft, parseSeasonDate, potLuckWindow, seasonalConversions, seasonalSources } from '../public/js/seasons.js?v=5d8f545a';
import {
  CHICKEN_SHEETS,
  COSTUME_CLASSES,
  COSTUME_SHEETS,
  FEATHER,
  POT_LUCK_ITEMS,
  POT_LUCK_LINES,
  costumeFrame,
  dressCheck,
  dressVerbs,
  dressWhy,
  featherDrop,
} from '../public/js/pot-luck.js?v=e704c060';
import { applyCreatureState } from '../public/js/street-creatures.js?v=ec4785db';
import { dropFor } from '../public/js/world-drop.js?v=a8956ae5';
import { potLuckFeature } from '../public/js/features/pot-luck-feature.js?v=24662363';
import { problems } from '../tools/pot-luck-art/build.mjs';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const at = (y, m, d) => parseSeasonDate(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

describe('Pot Luck Day window (js/seasons.js)', () => {
  it('is a designed season from the Sunday before US Thanksgiving to the Sunday after, November only', () => {
    assert.equal(SEASONS.pot_luck_day.source, 'designed');
    assert.deepEqual(potLuckWindow(2026), { from: [11, 22], to: [11, 29] });
    assert.deepEqual(potLuckWindow(2027), { from: [11, 21], to: [11, 28] });
    assert.deepEqual(potLuckWindow(2028), { from: [11, 19], to: [11, 26] });
    assert.deepEqual(calendarSeasons(at(2026, 11, 21)), []);
    assert.deepEqual(calendarSeasons(at(2026, 11, 22)), ['pot_luck_day']);
    assert.deepEqual(calendarSeasons(at(2026, 11, 26)), ['pot_luck_day']);
    assert.deepEqual(calendarSeasons(at(2026, 11, 29)), ['pot_luck_day']);
    assert.deepEqual(calendarSeasons(at(2026, 11, 30)), []);
    // No Pot Twoday: nothing in any other month of the year.
    for (let m = 1; m <= 12; m++) for (let d = 1; d <= 28; d++) if (m !== 11) assert.ok(!calendarSeasons(at(2026, m, d)).includes('pot_luck_day'), `${m}/${d}`);
    assert.equal(daysLeft('pot_luck_day', at(2026, 11, 26)), 3);
    assert.equal(daysLeft('pot_luck_day', at(2026, 11, 29)), 0);
  });

  it('takes the QA overrides as the other seasons do', () => {
    assert.deepEqual(activeSeasons(at(2026, 6, 1), { override: 'pot_luck_day' }), { ids: ['pot_luck_day'], primary: 'pot_luck_day', via: 'override' });
    assert.deepEqual(activeSeasons(at(2026, 11, 26), { override: 'none' }).ids, []);
    assert.deepEqual(activeSeasons(at(2026, 11, 26)), { ids: ['pot_luck_day'], primary: 'pot_luck_day', via: 'calendar' });
  });

  it('stocks the Toy Vendor with both costumes, and knows the feather and its rot', () => {
    assert.deepEqual(SEASONAL_STOCK.pot_luck_day.toys.map((o) => [o.classTsid, o.cost]), [['turkey_tailfan', 150], ['rooster_plume', 150]]);
    assert.equal(SEASONAL_ITEMS.turkey_tailfan, 'pot_luck_day');
    assert.ok(seasonalSources().some(([id, src]) => id === 'fancy_feather' && src === 'season:pot_luck_squeeze'));
    assert.ok(seasonalConversions().some((c) => c.inputs[0] === 'fancy_feather' && c.outputs[0] === 'loam'));
  });

  it('G1152: the feather says what it is for (show, a vendor) and what it turns into', () => {
    const { desc, baseCost } = POT_LUCK_ITEMS.fancy_feather;
    assert.match(desc, /just for show: keep it, or sell it to any vendor\./);
    assert.match(desc, /When Pot Luck Day ends it turns into a Lump of Loam\.$/);
    assert.ok(baseCost > 0, 'a vendor pays for it');
    assert.doesNotMatch(desc, /—/);
  });
});

describe('dress rules (js/pot-luck.js)', () => {
  const base = { classId: 'npc_chicken', street: true, season: true, costume: '', cls: 'turkey_tailfan', have: 1 };
  it('refuses out of season, without the item, on a dressed Chicken and on anything else', () => {
    assert.deepEqual(dressCheck(base), { ok: true });
    assert.equal(dressCheck({ ...base, season: false }).code, 'no_season');
    assert.equal(dressCheck({ ...base, have: 0 }).msg, POT_LUCK_LINES.noItem);
    // G1181: a dressed Chicken takes the other costume, never the one it wears, and never twice from you.
    assert.deepEqual(dressCheck({ ...base, costume: 'rooster_plume' }), { ok: true });
    assert.deepEqual(dressCheck({ ...base, costume: 'turkey_tailfan' }), { ok: false, code: 'same', msg: 'This Chicken is already wearing a Turkey Tailfan.' });
    assert.deepEqual(dressCheck({ ...base, costume: 'rooster_plume', counted: true }), { ok: false, code: 'counted', msg: POT_LUCK_LINES.counted });
    assert.equal(dressCheck({ ...base, counted: true }).code, 'counted');
    assert.equal(dressCheck({ ...base, costume: 'rooster_plume', have: 0 }).code, 'no_item');
    assert.equal(dressCheck({ ...base, classId: 'npc_piggy' }).code, 'not_chicken');
    assert.deepEqual(dressCheck({ ...base, street: false }), { ok: false, code: 'not_street', msg: POT_LUCK_LINES.streetOnly });
    assert.equal(dressCheck({ ...base, cls: 'chicken_egg' }).code, 'not_costume');
  });

  it('offers one row per costume in the pack, or one row that says why not', () => {
    assert.deepEqual(dressVerbs({ season: false, inv: { turkey_tailfan: 1 } }), []);
    assert.deepEqual(dressVerbs({ season: true, inv: { turkey_tailfan: 1, rooster_plume: 2 } }).map((r) => [r.id, r.label, r.enabled]), [
      ['potluck:dress:turkey_tailfan', 'Dress in Turkey Tailfan', true],
      ['potluck:dress:rooster_plume', 'Dress in Rooster Plume', true],
    ]);
    assert.deepEqual(dressVerbs({ season: true, inv: {} }).map((r) => [r.id, r.enabled, r.reason]), [['potluck:dress', false, POT_LUCK_LINES.noItem]]);
  });

  it('G1181: a dressed Chicken offers the other costume, only while you carry it and have not dressed that Chicken', () => {
    const rows = (o) => dressVerbs({ season: true, ...o }).map((r) => [r.id, r.label, r.enabled, r.reason]);
    assert.deepEqual(rows({ costume: 'turkey_tailfan', inv: { turkey_tailfan: 1, rooster_plume: 1 } }), [['potluck:dress:rooster_plume', 'Dress in Rooster Plume', true, '']]);
    assert.deepEqual(rows({ costume: 'rooster_plume', inv: { turkey_tailfan: 2 } }), [['potluck:dress:turkey_tailfan', 'Dress in Turkey Tailfan', true, '']]);
    // Only the costume it wears, or none: the greyed row says what would work.
    const wearing = 'This Chicken is wearing a Turkey Tailfan. A Rooster Plume would dress it again.';
    assert.equal(POT_LUCK_LINES.wearing('turkey_tailfan'), wearing);
    assert.deepEqual(rows({ costume: 'turkey_tailfan', inv: { turkey_tailfan: 1 } }), [['potluck:dress', 'Dress up', false, wearing]]);
    assert.deepEqual(rows({ costume: 'turkey_tailfan', inv: {} }), [['potluck:dress', 'Dress up', false, wearing]]);
    // Counted (you dressed it): no live row, dressed or not.
    assert.deepEqual(rows({ costume: 'turkey_tailfan', counted: true, inv: { rooster_plume: 1 } }), [['potluck:dress', 'Dress up', false, POT_LUCK_LINES.counted]]);
    assert.deepEqual(rows({ counted: true, inv: { rooster_plume: 1 } }), [['potluck:dress', 'Dress up', false, POT_LUCK_LINES.counted]]);
    assert.equal(dressWhy({}), POT_LUCK_LINES.noItem);
    for (const line of [POT_LUCK_LINES.counted, wearing, POT_LUCK_LINES.same('rooster_plume')]) assert.doesNotMatch(line, /\u2014/);
  });

  it('takes a costume dropped on a Chicken through its dress row', () => {
    const verbs = dressVerbs({ season: true, inv: { turkey_tailfan: 1, rooster_plume: 1 } });
    assert.equal(dropFor('npc_chicken', 'rooster_plume', verbs).verb.id, 'potluck:dress:rooster_plume');
    assert.equal(dropFor('npc_chicken', 'turkey_tailfan', verbs).verb.id, 'potluck:dress:turkey_tailfan');
    // G1181: dressed in a tailfan, a plume dropped on it re-dresses it.
    const dressed = dressVerbs({ season: true, costume: 'turkey_tailfan', inv: { rooster_plume: 1 } });
    assert.equal(dropFor('npc_chicken', 'rooster_plume', dressed).verb.id, 'potluck:dress:rooster_plume');
    // The costume it wears, or a Chicken you dressed: the drop meets the disabled row, which says why.
    const same = dressVerbs({ season: true, costume: 'turkey_tailfan', inv: { turkey_tailfan: 1 } });
    assert.equal(dropFor('npc_chicken', 'turkey_tailfan', same).verb.enabled, false);
    const counted = dressVerbs({ season: true, costume: 'turkey_tailfan', counted: true, inv: { rooster_plume: 1 } });
    assert.equal(dropFor('npc_chicken', 'rooster_plume', counted).verb.enabled, false);
    assert.equal(dropFor('npc_piggy', 'rooster_plume', verbs), null);
    assert.equal(dropFor('npc_chicken', 'rooster_plume', []), null, 'out of season the Chicken offers no dress verb');
  });

  it('drops a Fancy Feather one squeeze in four from a dressed Chicken, five a game day', () => {
    const row = { day: '', n: 0 };
    assert.equal(featherDrop(row, { dressed: false, dayKey: 'd1', rng: () => 0 }), false);
    assert.equal(featherDrop(row, { dressed: true, dayKey: 'd1', rng: () => 0.25 }), false);
    let n = 0;
    for (let i = 0; i < 9; i++) if (featherDrop(row, { dressed: true, dayKey: 'd1', rng: () => 0.1 })) n++;
    assert.equal(n, FEATHER.dailyMax);
    assert.equal(featherDrop(row, { dressed: true, dayKey: 'd2', rng: () => 0.1 }), true, 'a new game day');
    assert.equal(FEATHER.chance, 0.25);
  });
});

describe('a shared Chicken (js/street-creatures.js applyCreatureState)', () => {
  it('wears the costume the server holds, and loses it when the server clears it', () => {
    const state = {};
    applyCreatureState('npc_chicken', state, { id: 'chicken:1', cos: 'rooster_plume' });
    assert.equal(state.costume, 'rooster_plume');
    applyCreatureState('npc_chicken', state, { id: 'chicken:1', cos: 'party_hat' });
    assert.equal(state.costume, undefined);
    applyCreatureState('npc_chicken', state, { id: 'chicken:1', cos: 'turkey_tailfan' });
    applyCreatureState('npc_chicken', state, { id: 'chicken:1' });
    assert.equal(state.costume, undefined);
  });
});

/** A small engine for the feature: solo, one street Chicken. */
function fakeEngine({ on = true, preview = false, mode = 'solo', inv = {} } = {}) {
  const chicken = { classId: 'npc_chicken', classIndex: 0, state: {}, sprite: null };
  const e = {
    mode,
    streetTsid: 'GA5101HF7F429V5',
    inv: { ...inv },
    interactables: [chicken],
    counters: [],
    lines: [],
    data: {},
    season: { on, preview },
    target: null,
    query(name, ...args) {
      if (name === 'seasonOn') return args[0] === 'pot_luck_day' && e.season.on;
      if (name === 'seasonPreview') return e.season.preview;
      if (name === 'sharedObjectVerb') return e.sharedAsk ? true : null;
      return null;
    },
    achievement: (c, n) => e.counters.push(`${c}=${n}`),
    toast: (l) => e.lines.push(l),
    pushActivity() {},
    save() {},
    setData: (k, v) => { e.data[k] = v; },
    verbTarget: () => e.target,
  };
  return { e, chicken };
}

describe('the dress flow and the feather (features/pot-luck-feature.js)', () => {
  beforeEach(() => potLuckFeature._reset());

  it('dresses a street Chicken solo: the costume leaves the pack, the save keeps it, the counter counts', () => {
    const { e, chicken } = fakeEngine({ inv: { turkey_tailfan: 1, rooster_plume: 1 } });
    potLuckFeature.init(e);
    const rows = potLuckFeature.decorateVerbs(chicken, [{ id: 'squeeze' }], e);
    assert.deepEqual(rows.map((r) => r.id), ['squeeze', 'potluck:dress:turkey_tailfan', 'potluck:dress:rooster_plume']);
    assert.equal(potLuckFeature.runVerbOverride(chicken, 'potluck:dress:turkey_tailfan', e), true);
    assert.equal(e.inv.turkey_tailfan || 0, 0);
    assert.equal(chicken.state.costume, 'turkey_tailfan');
    assert.deepEqual(potLuckFeature.save().dressed, { 'GA5101HF7F429V5:0': 'turkey_tailfan' });
    assert.deepEqual(e.counters, ['chicken_dressed:turkey_tailfan=1']);
    assert.equal(e.lines.at(-1), POT_LUCK_LINES.dressed.turkey_tailfan);
    // You dressed it: re-dressing it yourself is refused (G1181: each Chicken counts once), the plume stays in the pack.
    potLuckFeature.runVerbOverride(chicken, 'potluck:dress:rooster_plume', e);
    assert.equal(e.inv.rooster_plume, 1);
    assert.equal(e.lines.at(-1), POT_LUCK_LINES.counted);
    assert.deepEqual(potLuckFeature.decorateVerbs(chicken, [], e).map((r) => [r.id, r.enabled]), [['potluck:dress', false]]);
    potLuckFeature.runVerbOverride(chicken, 'potluck:dress', e);
    assert.equal(e.lines.at(-1), POT_LUCK_LINES.counted);
    assert.deepEqual(potLuckFeature.save().counted, { 'GA5101HF7F429V5:0': true });
    assert.equal(e.data.potLuckCounted, '1');
    // The save round-trips.
    const saved = potLuckFeature.save();
    potLuckFeature._reset();
    potLuckFeature.restore(saved);
    assert.deepEqual(potLuckFeature.save().dressed, saved.dressed);
    assert.deepEqual(potLuckFeature.save().counted, saved.counted);
    // A save from before G1181 (no counted): the Chickens it dressed were this player's.
    potLuckFeature._reset();
    potLuckFeature.restore({ version: 1, dressed: { 'GA5101HF7F429V5:0': 'turkey_tailfan' }, feathers: { day: '', n: 0 } });
    assert.deepEqual(potLuckFeature.save().counted, { 'GA5101HF7F429V5:0': true });
  });

  it('G1181: re-dresses a Chicken someone else dressed in the other costume, counting it once', () => {
    const { e, chicken } = fakeEngine({ inv: { turkey_tailfan: 1, rooster_plume: 2 } });
    potLuckFeature.init(e);
    // Another player's Turkey Tailfan (the save holds what it wears; nobody counted it here).
    potLuckFeature.restore({ version: 1, dressed: { 'GA5101HF7F429V5:0': 'turkey_tailfan' }, counted: {}, feathers: { day: '', n: 0 } });
    chicken.state.costume = 'turkey_tailfan';
    assert.deepEqual(potLuckFeature.decorateVerbs(chicken, [], e).map((r) => [r.id, r.enabled]), [['potluck:dress:rooster_plume', true]]);
    // The tailfan it wears: refused, kept.
    potLuckFeature.runVerbOverride(chicken, 'potluck:dress:turkey_tailfan', e);
    assert.equal(e.lines.at(-1), POT_LUCK_LINES.same('turkey_tailfan'));
    assert.equal(e.inv.turkey_tailfan, 1);
    assert.deepEqual(e.counters, []);
    // The plume goes on over it, and counts.
    potLuckFeature.runVerbOverride(chicken, 'potluck:dress:rooster_plume', e);
    assert.equal(chicken.state.costume, 'rooster_plume');
    assert.equal(e.inv.rooster_plume, 1);
    assert.deepEqual(potLuckFeature.save().dressed, { 'GA5101HF7F429V5:0': 'rooster_plume' });
    assert.deepEqual(e.counters, ['chicken_dressed:rooster_plume=1']);
    // Now counted: no more rows that dress it, so the plume and tailfan can't farm it.
    assert.deepEqual(potLuckFeature.decorateVerbs(chicken, [], e).map((r) => [r.id, r.enabled, r.reason]), [['potluck:dress', false, POT_LUCK_LINES.counted]]);
    potLuckFeature.runVerbOverride(chicken, 'potluck:dress:turkey_tailfan', e);
    assert.deepEqual(e.counters, ['chicken_dressed:rooster_plume=1']);
    assert.equal(e.inv.turkey_tailfan, 1);
  });

  it('G1181: online, a re-dress asks the server, lands on the go-ahead and counts once; the record empties when the season ends', () => {
    const { e, chicken } = fakeEngine({ mode: 'multiplayer', inv: { rooster_plume: 1 } });
    chicken.state.costume = 'turkey_tailfan'; // the server's word: someone else's
    assert.deepEqual(potLuckFeature.decorateVerbs(chicken, [], e).map((r) => [r.id, r.enabled]), [['potluck:dress:rooster_plume', true]]);
    e.sharedAsk = true;
    potLuckFeature.runVerbOverride(chicken, 'potluck:dress:rooster_plume', e);
    assert.equal(chicken.state.costume, 'turkey_tailfan');
    assert.deepEqual(e.counters, []);
    e.sharedAsk = false;
    potLuckFeature.runVerbOverride(chicken, 'potluck:dress:rooster_plume', e);
    assert.equal(chicken.state.costume, 'rooster_plume');
    assert.deepEqual(e.counters, ['chicken_dressed:rooster_plume=1']);
    assert.deepEqual(potLuckFeature.save().counted, { 'GA5101HF7F429V5:0': true }, 'online the record is the player\'s save too');
    assert.deepEqual(potLuckFeature.save().dressed, {});
    // The season ends: the record goes with the costumes.
    potLuckFeature.onTick(16, 0, e);
    e.season.on = false;
    potLuckFeature.onTick(16, 5000, e);
    assert.deepEqual(potLuckFeature.save().counted, {});
  });

  it('refuses with no season, no costume and on a Chicken that is not the street\'s', () => {
    const { e, chicken } = fakeEngine({ on: false, inv: { turkey_tailfan: 1 } });
    assert.equal(potLuckFeature.decorateVerbs(chicken, [], e), null, 'no rows out of season');
    potLuckFeature.runVerbOverride(chicken, 'potluck:dress:turkey_tailfan', e);
    assert.equal(e.lines.at(-1), POT_LUCK_LINES.noSeason);
    e.season.on = true;
    e.inv = {};
    potLuckFeature.runVerbOverride(chicken, 'potluck:dress:turkey_tailfan', e);
    assert.equal(e.lines.at(-1), POT_LUCK_LINES.noItem);
    e.inv = { turkey_tailfan: 1 };
    const yours = { classId: 'npc_chicken', featureId: 'animal-husbandry', state: {} };
    potLuckFeature.runVerbOverride(yours, 'potluck:dress:turkey_tailfan', e);
    assert.equal(e.lines.at(-1), POT_LUCK_LINES.streetOnly);
    assert.equal(e.inv.turkey_tailfan, 1);
    assert.equal(e.counters.length, 0);
  });

  it('your own or a yard\'s Chicken, with a costume in the pack: the dress rows greyed, saying only a street Chicken dresses up', () => {
    assert.equal(POT_LUCK_LINES.streetOnly, 'Only a Chicken out on the streets can dress up for Pot Luck Day.');
    assert.doesNotMatch(POT_LUCK_LINES.streetOnly, /\u2014/);
    const { e } = fakeEngine({ inv: { turkey_tailfan: 1, rooster_plume: 2 } });
    const yours = { classId: 'npc_chicken', featureId: 'animal-husbandry', state: {} };
    const yard = { classId: 'npc_chicken', yardVisit: { kind: 'animal', id: 'a1' }, state: {} };
    const want = [
      ['potluck:dress:turkey_tailfan', 'Dress in Turkey Tailfan', false, POT_LUCK_LINES.streetOnly],
      ['potluck:dress:rooster_plume', 'Dress in Rooster Plume', false, POT_LUCK_LINES.streetOnly],
    ];
    const rows = (list) => list.map((r) => [r.id, r.label, r.enabled, r.reason]);
    // Your own Chicken's menu is animal-husbandry's: the rows come as extraVerbs.
    assert.deepEqual(rows(potLuckFeature.extraVerbs(yours, e)), want);
    // A visited yard's Chicken has no owner feature: decorateVerbs.
    assert.deepEqual(rows(potLuckFeature.decorateVerbs(yard, [{ id: 'squeeze' }], e)).slice(1), want);
    // Without a costume, or out of season: nothing.
    e.inv = {};
    assert.equal(potLuckFeature.extraVerbs(yours, e), null);
    assert.equal(potLuckFeature.decorateVerbs(yard, [], e), null);
    e.inv = { turkey_tailfan: 1 };
    e.season.on = false;
    assert.equal(potLuckFeature.extraVerbs(yours, e), null);
    assert.equal(potLuckFeature.decorateVerbs(yard, [], e), null);
    // A street Chicken still gets the live rows.
    e.season.on = true;
    const { chicken } = fakeEngine({});
    assert.deepEqual(potLuckFeature.decorateVerbs(chicken, [], e).map((r) => [r.id, r.enabled]), [['potluck:dress:turkey_tailfan', true]]);
    assert.equal(potLuckFeature.extraVerbs(chicken, e), null);
    assert.deepEqual(dressVerbs({ season: true, street: false, inv: {} }), []);
  });

  it('asks the server online before anything changes', () => {
    const { e, chicken } = fakeEngine({ mode: 'multiplayer', inv: { rooster_plume: 1 } });
    e.sharedAsk = true;
    potLuckFeature.runVerbOverride(chicken, 'potluck:dress:rooster_plume', e);
    assert.equal(e.inv.rooster_plume, 1);
    assert.equal(chicken.state.costume, undefined);
    // The go-ahead runs it again (sharedObjectVerb answers null with the grant): it lands, held by the server's state.
    e.sharedAsk = false;
    potLuckFeature.runVerbOverride(chicken, 'potluck:dress:rooster_plume', e);
    assert.equal(e.inv.rooster_plume || 0, 0);
    assert.equal(chicken.state.costume, 'rooster_plume');
    assert.deepEqual(potLuckFeature.save().dressed, {}, 'online the server holds it, not the save');
  });

  it('drops Fancy Feathers from a dressed Chicken\'s squeeze, at most five a day, and rots them into loam when the season ends', () => {
    const { e, chicken } = fakeEngine({ inv: { turkey_tailfan: 1 } });
    potLuckFeature.onTick(16, Date.now(), e);
    e.target = chicken;
    const rnd = Math.random;
    Math.random = () => 0.1;
    try {
      potLuckFeature.onEvent('chicken:squoze', 1, e);
      assert.equal(e.inv.fancy_feather || 0, 0, 'a plain Chicken drops none');
      potLuckFeature.runVerbOverride(chicken, 'potluck:dress:turkey_tailfan', e);
      for (let i = 0; i < 8; i++) potLuckFeature.onEvent('chicken:squoze', 1, e);
      assert.equal(e.inv.fancy_feather, FEATHER.dailyMax);
    } finally {
      Math.random = rnd;
    }
    // A preview turning the season off rots nothing.
    e.season = { on: false, preview: true };
    potLuckFeature.onTick(16, Date.now() + 5000, e);
    assert.equal(e.inv.fancy_feather, 5);
    // The calendar's end: the costumes fall off and the feathers turn to loam.
    e.season = { on: false, preview: false };
    potLuckFeature.onTick(16, Date.now() + 10000, e);
    assert.equal(e.inv.fancy_feather || 0, 0);
    assert.equal(e.inv.loam, 5);
    assert.deepEqual(potLuckFeature.save().dressed, {});
    assert.match(e.lines.at(-1), /5 Lumps of Loam/);
  });
});

describe('costume art (tools/pot-luck-art)', () => {
  it('is current: built.json matches the files, the tool and the FLA, and the game names the same sheets', async () => {
    assert.deepEqual(await problems(), []);
  });

  it('has a costume frame for every frame of every clip the Chicken plays, at 1x and 3x', () => {
    const packed = Object.values(PACKED_SHEETS.chicken).map((d) => d.path);
    for (const s of CHICKEN_SHEETS) assert.ok(existsSync(join(pub, s.path)), s.path);
    for (const d of packed) assert.ok(CHICKEN_SHEETS.some((s) => s.path === d), `${d} has a costume`);
    for (const costume of COSTUME_CLASSES) {
      for (const s of CHICKEN_SHEETS) {
        const def = COSTUME_SHEETS[costume][s.clip];
        assert.equal(def.frames, s.frames);
        const one = imageSize(join(pub, def.path));
        assert.deepEqual([one.w, one.h], [def.cols * 148, Math.ceil(def.frames / def.cols) * 110], def.path);
        const three = HIRES_SPRITES.get(def.path);
        assert.ok(three, `${def.path} has a 3x`);
        assert.deepEqual(imageSize(join(pub, three)), { w: one.w * 3, h: one.h * 3, format: 'webp' });
        // Each chicken frame finds its twin: the last cell of the sheet included.
        const k = s.frames - 1;
        const r = costumeFrame(costume, s.path, { x: (k % s.cols) * s.fw, y: Math.floor(k / s.cols) * s.fh });
        assert.deepEqual(r, { path: def.path, x: (k % def.cols) * 148, y: Math.floor(k / def.cols) * 110, w: 148, h: 110 });
      }
    }
    assert.equal(costumeFrame('turkey_tailfan', 'assets/sprites/npc_piggy__x1_walk_png_1354829432.webp', { x: 0, y: 0 }), null);
  });

  it('gives the three items their 1x and 3x pack icons', () => {
    for (const id of Object.keys(POT_LUCK_ITEMS)) {
      assert.ok(HIRES_ICONS.has(id), id);
      const one = imageSize(join(pub, `assets/sprites/icons/${id}.webp`));
      const three = imageSize(join(pub, `assets/sprites/icons/${id}@3x.webp`));
      assert.deepEqual([three.w, three.h], [one.w * 3, one.h * 3]);
    }
  });
});
