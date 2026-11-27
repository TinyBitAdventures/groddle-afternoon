/**
 * House files (G1285, report #669, Austin 2026-11-25): a whole house as plain JSON
 * (js/house-file.js, the format), loaded by the ?housefile= play-link param into a solo practice
 * copy's own house (js/house-file-loader.js).
 * - The repo's sample (public/play/houses/sample-house.json, a small made-up house) validates
 *   against the format with no problems; unknown classes, styles, swatches and items are reported.
 * - Only this site's files load: same origin, absolute URLs under /wp-content/uploads/, .json,
 *   read as data with a size cap.
 * - The loader places every piece of the file in a fresh solo save (counted by class and floor),
 *   with the Doors joined, the machines, the Crafty Bot and every stack on its piece.
 * - The online game ignores housefile; a house file always opens a practice copy.
 * Run: node --test tests/house-file.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import {
  HOUSE_FILE_MAX_BYTES,
  HOUSE_FLOOR_KEYS,
  UPLOADS_PATH,
  buildHouse,
  houseFileItemClasses,
  parseHouseFileText,
  resolveHouseFileUrl,
  validateHouseFile,
} from '../public/js/house-file.js?v=72118137';
import { applyHouse, bootHouseFile, houseFileRequest } from '../public/js/house-file-loader.js?v=6953f4b4';
import { homesFeature } from '../public/js/features/homes-feature.js?v=2dfb1ee6';
import { homeMachinesFeature } from '../public/js/features/home-machines-feature.js?v=8394d4d1';
import { craftybotFeature } from '../public/js/features/craftybot-feature.js?v=ba76d419';
import { createHomeState, imagineHome } from '../public/js/homes.js?v=dca6b2cd';
import { normalizeDroppedItemState, setDownStack } from '../public/js/world-items.js?v=93313aad';

const root = join(import.meta.dirname, '..', 'public');
const read = (p) => readFileSync(join(root, p), 'utf8');
const SAMPLE = JSON.parse(read('play/houses/sample-house.json'));
const ICONS = new Set(readdirSync(join(root, 'assets/sprites/icons')).filter((f) => f.endsWith('.webp')).map((f) => f.replace(/\.webp$/, '')));
const isItem = (c) => ICONS.has(c);
const SITE = { baseUri: 'https://groddleafternoon.com/', origin: 'https://groddleafternoon.com' };
const clone = (v) => JSON.parse(JSON.stringify(v));

/** Pieces a file asks for, per floor and class (doors the validator adds count too). */
function fileCounts(house) {
  return house.floors.map((f) => {
    const c = {};
    for (const p of f.pieces) c[p.classTsid] = (c[p.classTsid] || 0) + 1;
    return c;
  });
}

describe('the house file format', () => {
  it('the sample house validates with no problems, every item class has art', () => {
    const res = validateHouseFile(SAMPLE, { isItem });
    assert.equal(res.ok, true);
    assert.deepEqual(res.problems, []);
    for (const c of houseFileItemClasses(SAMPLE)) assert.ok(isItem(c), `${c} has an icon`);
    assert.equal(res.house.floors.length, 2);
    assert.equal(res.house.segments, 8);
  });

  it('the sample is small and made up (no player house in the repo)', () => {
    const pieces = SAMPLE.floors.reduce((n, f) => n + (f.pieces?.length || 0), 0);
    assert.ok(pieces <= 20, 'a small synthetic house');
    assert.equal(SAMPLE.title, 'Sample house');
    assert.doesNotMatch(JSON.stringify(SAMPLE), /#\d{3}|report|2012/i);
  });

  it('refuses what is not a house file', () => {
    assert.equal(validateHouseFile(null).ok, false);
    assert.equal(validateHouseFile([]).ok, false);
    assert.equal(validateHouseFile({ ...SAMPLE, format: 'other' }).ok, false);
    assert.equal(validateHouseFile({ ...SAMPLE, version: 2 }).ok, false);
    assert.equal(validateHouseFile({ ...SAMPLE, floors: [] }).ok, false);
    assert.match(validateHouseFile({ ...SAMPLE, version: 2 }).problems.at(-1).msg, /version/);
  });

  it('reports unknown classes, styles, swatches, items and fields instead of guessing', () => {
    const raw = clone(SAMPLE);
    raw.floors[0].wall = 'no_such_paper';
    raw.floors[0].pieces.push({ class: 'furniture_hovercraft', x: 300 });
    raw.floors[0].pieces.push({ class: 'furniture_sofa', style: 999999, x: 300 });
    raw.floors[0].pieces.push({ class: 'bag_furniture_sdb', x: 300, y: 200, show: { class: 'no_such_item' } });
    raw.floors[0].pieces.push({ class: 'furniture_sofa', x: 500, colour: 'blue' });
    raw.floors[0].pieces.push({ class: 'furniture_door', x: 500, door: 'sideways' });
    const res = validateHouseFile(raw, { isItem });
    assert.equal(res.ok, true);
    const msgs = res.problems.map((p) => `${p.level} ${p.where}: ${p.msg}`).join('\n');
    assert.match(msgs, /warn floors\[0\]\.wall: Unknown wall swatch "no_such_paper"/);
    assert.match(msgs, /error floors\[0\]\.pieces\[9\]: Unknown furniture class "furniture_hovercraft"/);
    assert.match(msgs, /warn floors\[0\]\.pieces\[10\]: furniture_sofa has no style 999999 with art: placed plain/);
    assert.match(msgs, /Unknown item class "no_such_item"/);
    assert.match(msgs, /"colour" is not part of the house file format/);
    assert.match(msgs, /"door" is up or down/);
    // The unknown class is left out; the rest are kept.
    assert.equal(res.house.floors[0].pieces.filter((p) => p.classTsid === 'furniture_hovercraft').length, 0);
    assert.equal(res.house.floors[0].pieces.filter((p) => p.classTsid === 'furniture_sofa').length, 3);
  });

  it('adds the Doors a floor needs and says so', () => {
    const raw = clone(SAMPLE);
    raw.floors[0].pieces = raw.floors[0].pieces.filter((p) => p.class !== 'furniture_door');
    const res = validateHouseFile(raw, { isItem });
    assert.ok(res.problems.some((p) => /No up Door: a plain one is added/.test(p.msg)));
    const built = buildHouse(res.house);
    assert.equal(built.floors.links.length, 1, 'the floors are still joined');
  });

  it('caps the file and reads it as JSON data only', () => {
    assert.equal(parseHouseFileText(JSON.stringify(SAMPLE)).ok, true);
    assert.equal(parseHouseFileText('{"a":1').reason, 'json');
    assert.equal(parseHouseFileText('<html><script>x</script></html>').reason, 'json');
    assert.equal(parseHouseFileText(' '.repeat(HOUSE_FILE_MAX_BYTES + 1)).reason, 'size');
  });
});

describe('where a house file may come from', () => {
  const ok = (v) => resolveHouseFileUrl(v, SITE);
  it('the site media library, absolute or as a path', () => {
    assert.deepEqual(ok('https://groddleafternoon.com/wp-content/uploads/2026/11/h-3k9x.json'), { ok: true, url: 'https://groddleafternoon.com/wp-content/uploads/2026/11/h-3k9x.json' });
    assert.equal(ok('/wp-content/uploads/2026/11/h-3k9x.json').url, 'https://groddleafternoon.com/wp-content/uploads/2026/11/h-3k9x.json');
    assert.equal(UPLOADS_PATH, '/wp-content/uploads/');
  });
  it('a relative same-origin path, for local testing', () => {
    assert.equal(ok('play/houses/sample-house.json').url, 'https://groddleafternoon.com/play/houses/sample-house.json');
    assert.equal(ok('play/houses/sample-house.json#x').url, 'https://groddleafternoon.com/play/houses/sample-house.json');
  });
  it('refuses anything else, with a line to show', () => {
    for (const [v, reason] of [
      ['https://evil.example/wp-content/uploads/h.json', 'origin'],
      ['//evil.example/wp-content/uploads/h.json', 'origin'],
      ['http://groddleafternoon.com/wp-content/uploads/h.json', 'origin'],
      ['https://user:pw@groddleafternoon.com/wp-content/uploads/h.json', 'origin'],
      ['javascript:alert(1)', 'origin'],
      ['data:application/json,{}', 'origin'],
      ['https://groddleafternoon.com/play/houses/sample-house.json', 'path'],
      ['https://groddleafternoon.com/wp-json/groddle/v1/me', 'path'],
      ['/wp-content/uploads/2026/11/h.php', 'type'],
      ['play/houses/sample-house.js', 'type'],
      ['', 'bad'],
    ]) {
      const res = ok(v);
      assert.equal(res.ok, false, v);
      assert.equal(res.reason, reason, v);
      assert.ok(res.msg && !/\u2014/.test(res.msg), 'plain words, no em dash');
    }
  });
});

describe('the loader lays the whole file into a fresh solo save', () => {
  function fakeEngine() {
    const dropped = normalizeDroppedItemState({});
    const data = {};
    return {
      dropped,
      data,
      param: () => null,
      setData: (k, v) => { data[k] = v; },
      get droppedItems() { return dropped; },
      droppedItemsChanged() {},
      save() {},
      placeOwnStack(tsid, classTsid, count, { x, y, on }) {
        return setDownStack(dropped, tsid, classTsid, count, { x, y }, { on });
      },
    };
  }
  const features = { get: (id) => ({ homes: homesFeature, 'home-machines': homeMachinesFeature, craftybot: craftybotFeature })[id] };

  function freshSave(engine) {
    homesFeature.restore(undefined, engine);
    homeMachinesFeature._reset();
    craftybotFeature.restore(undefined);
    return createHomeState();
  }

  it('places every piece, counted by class and floor, joins the Doors and sets every stack on its piece', () => {
    const engine = fakeEngine();
    const homeState = freshSave(engine);
    const checked = validateHouseFile(SAMPLE, { isItem });
    const built = buildHouse(checked.house);
    applyHouse(built, { engine, features, homeState, imagineHome });
    assert.equal(homeState.owned, true, 'a fresh save is given a house');
    assert.equal(homeState.style, 'meadow');
    const st = homesFeature._state();
    const want = fileCounts(checked.house);
    const count = (decor) => decor.placed.reduce((c, row) => ({ ...c, [row.classTsid]: (c[row.classTsid] || 0) + 1 }), {});
    assert.deepEqual(count(st.houseDecor), want[0], 'ground floor');
    assert.equal(st.floors.upper.length, 1);
    assert.deepEqual(count(st.floors.upper[0]), want[1], 'upstairs');
    assert.equal(st.houseDecor.wallSegments, 8);
    assert.equal(st.houseDecor.wall, 'yellowgreen_molding');
    assert.equal(st.houseDecor.walls[5], 'whitepillar_molding');
    assert.equal(st.floors.upper[0].floor, 'metal_spaceship_floor');
    assert.equal(st.houseDecor.starterKit, true, 'no starter kit laid over it');
    // Styles, boxes and cabinets as the file has them.
    assert.equal(st.houseDecor.placed.find((r) => r.classTsid === 'furniture_sofa').upgradeId, '359');
    assert.deepEqual(st.houseDecor.placed.find((r) => r.classTsid === 'bag_furniture_sdb').display, { classTsid: 'cherry', count: 12 });
    assert.deepEqual(st.houseDecor.placed.find((r) => r.classTsid === 'bag_furniture_smallcabinet').contents.slice(0, 3), [{ classTsid: 'plank', count: 5 }, null, { classTsid: 'board', count: 2 }]);
    const shelf = st.houseDecor.placed.find((r) => r.classTsid === 'furniture_shelf');
    assert.equal(st.houseDecor.placed.find((r) => r.classTsid === 'trophy_fruit').on, shelf.id, 'the trophy stands on the mantel');
    assert.equal(st.houseDecor.placed.find((r) => r.classTsid === 'furniture_chair').facingRight, false);
    // The Doors: the ground floor's up Door leads to upstairs' down Door.
    const link = st.floors.links[0];
    assert.equal(st.houseDecor.placed.find((r) => r.id === link.up).classTsid, 'furniture_door');
    assert.equal(st.floors.upper[0].placed.find((r) => r.id === link.down).upgradeId, '270');
    assert.equal(st.floors.at, 0, 'you start on the ground floor');
    // Machines upstairs and the Crafty Bot.
    const machines = homeMachinesFeature.save().machines;
    assert.deepEqual(machines.map((m) => [m.classTsid, m.place, m.rx, m.fuel]), [['woodworker', 'house:1', 420, 50], ['fuelmaker', 'house:1', 680, 120]]);
    const bot = craftybotFeature.save();
    assert.equal(bot.owned, true);
    assert.equal(bot.where, 'interior');
    assert.equal(bot.floor, 1);
    assert.equal(bot.x, 860);
    // Stacks: on the coffee table (resting on it) and one on the floor, ground floor key.
    const rows = engine.dropped.streets[HOUSE_FLOOR_KEYS[0]];
    const table = st.houseDecor.placed.find((r) => r.classTsid === 'furniture_coffeetable');
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.filter((r) => r.on === table.id).map((r) => [r.classTsid, r.count]), [['cherry', 3], ['beer', 1]]);
    assert.equal(rows.filter((r) => r.on == null).length, 1);
    const x0 = homesFeature.roomWorldX();
    assert.ok(rows.every((r) => r.x >= x0), 'stacks stand in the house, past the back yard');
  });

  it('G1291 (#669): a folded Crafty Bot sleeps as a cube, and the back yard keeps what is cultivated there', () => {
    const engine = fakeEngine();
    const homeState = freshSave(engine);
    const file = JSON.parse(JSON.stringify(SAMPLE));
    const botFloor = file.floors.findIndex((f) => f.craftybot);
    file.floors[botFloor].craftybot.folded = true;
    file.yard = { segments: 7, items: [{ class: 'proto_patch', x: -400 }, { class: 'rock_beryl_2', x: -800 }, { class: 'proto_herb_garden_small', x: -9999 }, { class: 'sofa', x: -100 }] };
    const checked = validateHouseFile(file, { isItem });
    assert.ok(checked.problems.some((p) => p.where === 'yard.items[3]' && p.level === 'error'), 'not a cultivation: left out');
    assert.ok(checked.problems.some((p) => p.where === 'yard.items[2]' && /moved to -990/.test(p.msg)), 'kept inside the 7 segments');
    const built = buildHouse(checked.house);
    applyHouse(built, { engine, features, homeState, imagineHome });
    const bot = craftybotFeature.save();
    assert.deepEqual([bot.craftState, bot.anim, bot.collapsed], ['sleep', 'sleepMode', true], 'npc_crafty_bot.js craft_state sleep');
    const yard = homesFeature._state().backCult;
    assert.equal(yard.yardLeft, 2, 'seven back yard segments, five to start with');
    assert.deepEqual(yard.items.slice(0, 2).map((r) => [r.protoClass, r.endClass, r.rx]), [['proto_patch', 'patch', -400], ['proto_beryl_rock', 'rock_beryl_2', -800]]);
    // A garden keeps its bed whole in the yard (home-cultivation settleGardens may move it in).
    const garden = yard.items[2];
    assert.equal(garden.protoClass, 'proto_herb_garden_small');
    assert.ok(garden.rx >= -990 && garden.rx <= 0, String(garden.rx));
    // Standing (no "folded") is the plain idle bot.
    file.floors[botFloor].craftybot.folded = false;
    applyHouse(buildHouse(validateHouseFile(file, { isItem }).house), { engine, features, homeState, imagineHome });
    assert.deepEqual([craftybotFeature.save().craftState, craftybotFeature.save().collapsed], ['idle', false]);
  });

  it('a second file replaces what the first laid in the house', () => {
    const engine = fakeEngine();
    const homeState = freshSave(engine);
    const built = buildHouse(validateHouseFile(SAMPLE, { isItem }).house);
    applyHouse(built, { engine, features, homeState, imagineHome });
    applyHouse(built, { engine, features, homeState, imagineHome });
    assert.equal(engine.dropped.streets[HOUSE_FLOOR_KEYS[0]].length, 3, 'stacks are not doubled');
    assert.equal(homeMachinesFeature.save().machines.length, 2, 'machines are not doubled');
  });

  it('boot: fetches same-origin without following redirects, reports, and keeps the house on reload', async () => {
    const engine = fakeEngine();
    const homeState = freshSave(engine);
    const calls = [];
    const fetchImpl = async (url, opts = {}) => {
      calls.push([url, opts]);
      if (opts.method === 'HEAD') return { ok: true };
      return { ok: true, headers: { get: (h) => (h === 'content-type' ? 'application/json' : null) }, text: async () => JSON.stringify(SAMPLE) };
    };
    const args = { search: '?autostart=1&housefile=play%2Fhouses%2Fsample-house.json', mode: 'solo', ...SITE, doc: null, engine, features, homeState, imagineHome, fetchImpl };
    const res = await bootHouseFile({ ...args, hadSave: false });
    assert.equal(res.entered, true);
    assert.equal(engine.data.houseFile, `loaded:${SAMPLE.floors.reduce((n, f) => n + f.pieces.length, 0)}`);
    const [url, opts] = calls[0];
    assert.equal(url, 'https://groddleafternoon.com/play/houses/sample-house.json');
    assert.equal(opts.redirect, 'error');
    assert.equal(opts.credentials, 'same-origin');
    // The save itself remembers the file (the homes slice), not a storage key of its own.
    assert.equal(homesFeature.save().houseFile, 'https://groddleafternoon.com/play/houses/sample-house.json');
    homesFeature.restore(clone(homesFeature.save()), engine);
    assert.equal(homesFeature.save().houseFile, 'https://groddleafternoon.com/play/houses/sample-house.json', 'kept through a save and load');
    // A reload of the same copy keeps the house (and what you changed in it).
    calls.length = 0;
    const again = await bootHouseFile({ ...args, hadSave: true });
    assert.deepEqual(again, { entered: true, kept: true });
    assert.equal(calls.length, 0, 'not fetched again');
  });

  it('boot: a refused link fetches nothing and says why', async () => {
    const engine = fakeEngine();
    let fetched = 0;
    const res = await bootHouseFile({ search: `?housefile=${encodeURIComponent('https://evil.example/wp-content/uploads/h.json')}`, mode: 'solo', ...SITE, doc: null, engine, features, homeState: createHomeState(), imagineHome, hadSave: false, fetchImpl: async () => { fetched += 1; } });
    assert.equal(res, null);
    assert.equal(fetched, 0);
    assert.equal(engine.data.houseFile, 'refused:origin');
  });
});

describe('solo only', () => {
  it('the online game ignores housefile', async () => {
    assert.equal(houseFileRequest({ search: '?housefile=play/houses/sample-house.json', mode: 'multiplayer', ...SITE }), null);
    assert.equal(houseFileRequest({ search: '?autostart=1', mode: 'solo', ...SITE }), null);
    let fetched = 0;
    const res = await bootHouseFile({ search: '?housefile=play/houses/sample-house.json', mode: 'multiplayer', ...SITE, engine: null, fetchImpl: async () => { fetched += 1; } });
    assert.equal(res, null);
    assert.equal(fetched, 0);
  });

  it('/play/online/ strips housefile before any module loads', () => {
    const html = read('play/online/index.html');
    const script = html.match(/<script id="mode-entry">([\s\S]*?)<\/script>/)[1];
    const location = { pathname: '/play/online/', search: '?housefile=play/houses/sample-house.json', hash: '', replace() {} };
    const history = { state: null, replaceState(s, t, url) { location.search = new URL(url, 'https://groddle.localhost').search; } };
    const window = { location, history };
    vm.runInNewContext(script, { window, document: { documentElement: { getAttribute: (n) => (n === 'data-mode' ? 'multiplayer' : null) } } });
    assert.equal(location.search, '');
  });

  it('a housefile link opens a practice copy, never the real save (and never in multiplayer)', () => {
    const source = read('js/practice-mode.js');
    const mem = () => {
      const map = new Map();
      return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), key: (i) => [...map.keys()][i] ?? null, get length() { return map.size; } };
    };
    const run = (search, extra = {}) => {
      const window = { location: { search }, localStorage: mem(), sessionStorage: mem(), ...extra };
      const document = { documentElement: { dataset: {} }, body: null, getElementById: () => null, addEventListener() {} };
      vm.runInNewContext(source, { window, document, URLSearchParams });
      return window;
    };
    assert.equal(run('?autostart=1&housefile=play/houses/sample-house.json').groddlePractice, true);
    assert.equal(run('?autostart=1').groddlePractice, undefined);
    assert.equal(run('?housefile=x.json', { GRODDLE_MODE: 'multiplayer' }).groddlePractice, undefined);
  });

  it('game.js boots the loader with the page mode, and enters the house it laid', () => {
    const game = read('game.js');
    assert.match(game, /const houseFileBoot = await bootHouseFile\(\{\n\s+search: location\.search,\n\s+mode: GAME_MODE,/);
    assert.match(game, /houseFileBoot\?\.entered \|\| \['home', 'interior', 'decorate', 'cultivate'\]\.includes\(homeDemo\)/);
  });

  it('the floor keys are the ones the homes feature keeps stacks under', () => {
    const src = read('js/features/homes-feature.js');
    assert.match(src, /const HOME_INTERIOR_TSID = 'RH_HOME_INT';/);
    assert.match(src, /const HOUSE_FLOOR_DROP_PREFIX = 'RH_HOME_FLOOR_';/);
    assert.deepEqual(HOUSE_FLOOR_KEYS, ['RH_HOME_INT', 'RH_HOME_FLOOR_1', 'RH_HOME_FLOOR_2']);
  });
});
