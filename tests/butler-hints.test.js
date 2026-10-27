/**
 * The Butler hints that teach /house and /tower (register row G170).
 * Source: glitch-GameServerJS items/include/butler_hints.js:382-399,
 * locations/location.js:72-74 and :170-174 (butler_hint_counters
 * visited_my_house / visited_my_tower), main.js:1880, :1891
 * (has_used_house_command / has_used_tower_command).
 * Remake: js/butler.js BUTLER_HINTS, features/butler-feature.js ownerHintCtx,
 * features/homes-feature.js countHouseVisit, features/home-tower-feature.js goToFloor.
 * Run: node --test tests/butler-hints.test.js
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUTLER_HINTS, createButlerState, pickHint } from '../public/js/butler.js?v=butler-9';
import { ownerHintCtx } from '../public/js/features/butler-feature.js?v=butler-feature-52';
import { countHouseVisit, homesFeature } from '../public/js/features/homes-feature.js?v=homes-52';
import { homeTowerFeature, towerApi } from '../public/js/features/home-tower-feature.js?v=home-tower-15';
import { slashCommandsFeature } from '../public/js/features/slash-commands-feature.js?v=blur-13';
import { createFeatureHost } from '../public/js/feature-host.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const hasGsjs = existsSync(gsjs);
const src = (rel) => readFileSync(join(gsjs, rel), 'utf8');

const HOUSE = BUTLER_HINTS.find((h) => h.id === 'house_command');
const TOWER = BUTLER_HINTS.find((h) => h.id === 'tower_command');

function stubEngine(params = {}) {
  const data = {};
  let saves = 0;
  const host = createFeatureHost([slashCommandsFeature]);
  return {
    data,
    saves: () => saves,
    inv: {},
    learnedSkills: [],
    questState: { active: {}, completed: [] },
    skillQueue: {},
    pc: { xp: 0, level: 5 },
    param: (k) => (k in params ? params[k] : null),
    setData: (k, v) => { data[k] = v; },
    save: () => { saves += 1; },
    query: (hook, ...args) => host.query(hook, ...args),
    enter: async () => {},
    playSound: () => {},
    toast: () => {},
  };
}

afterEach(() => {
  slashCommandsFeature._reset();
  homesFeature.restore(undefined, stubEngine());
  homeTowerFeature.restore(undefined, stubEngine());
});

describe('source text and rules', { skip: !hasGsjs && 'GSJS checkout not beside this worktree' }, () => {
  it('keeps both hints verbatim with the more-than-ten rule', () => {
    const s = src('items/include/butler_hints.js');
    assert.ok(s.includes(`hint = "${HOUSE.text}";`));
    assert.ok(s.includes(`hint = "${TOWER.text}";`));
    assert.match(s, /if \(!pc\.has_used_house_command\) \{\s*if \(pc\.counters_get_label_count\("butler_hint_counters", "visited_my_house"\) > 10\)/);
    assert.match(s, /if \(!pc\.has_used_tower_command\) \{\s*if \(pc\.counters_get_label_count\("butler_hint_counters", "visited_my_tower"\) > 10\)/);
    const loc = src('locations/location.js');
    assert.match(loc, /houses_get_interior_tsid\(\) == this\.tsid\) \{\s*pc\.counters_increment\("butler_hint_counters", "visited_my_house"\)/);
    assert.match(loc, /home_id == "tower"\) \{\s*pc\.has_visited_tower = true;\s*pc\.counters_increment\("butler_hint_counters", "visited_my_tower"\)/);
  });

  it('plain words: no em-dashes', () => {
    assert.ok(!/—/.test(HOUSE.text + TOWER.text));
  });
});

describe('the hint conditions', () => {
  it('house_command after more than ten house visits, until /house is used', () => {
    assert.equal(HOUSE.when({ houseVisits: 10 }), false);
    assert.equal(HOUSE.when({ houseVisits: 11 }), true);
    assert.equal(HOUSE.when({ houseVisits: 50, usedHouseCommand: true }), false);
    assert.equal(TOWER.when({ towerVisits: 10 }), false);
    assert.equal(TOWER.when({ towerVisits: 11 }), true);
    assert.equal(TOWER.when({ towerVisits: 11, usedTowerCommand: true }), false);
  });

  it('pickHint gives each one once among the others, and &butlerhint picks it', () => {
    const ctx = { level: 20, learning: true, skillCount: 60, canOptIn: false, allowVisits: true, towerQuestNone: false, fiberArts: true, hasTower: true, sdbPlaced: true, houseVisits: 11, towerVisits: 11 };
    const s = createButlerState({ now: 0 });
    const ids = [pickHint(s, ctx, { now: 1, rand: () => 0 }).id, pickHint(s, ctx, { now: 2, rand: () => 0 }).id];
    assert.deepEqual(ids.sort(), ['house_command', 'tower_command']);
    const only = pickHint(createButlerState({ now: 0 }), ctx, { now: 1, only: 'tower_command' });
    assert.equal(only.text, TOWER.text);
    assert.equal(pickHint(createButlerState({ now: 0 }), { ...ctx, towerVisits: 3 }, { now: 1, only: 'tower_command' }), null);
  });
});

describe('the counters', () => {
  it('a house visit counts on entering the house, not on a rebuild or a tower floor', () => {
    const engine = stubEngine();
    homesFeature.restore({}, engine);
    countHouseVisit(engine, 'street');
    countHouseVisit(engine, 'house');
    countHouseVisit(engine, 'house'); // refreshHomeScene in place
    countHouseVisit(engine, 'tower');
    countHouseVisit(engine, 'house'); // back down from the Tower
    assert.equal(homesFeature.houseVisits(), 2);
    assert.equal(engine.data.homeHouseVisits, '2');
    // Away from home and back: a new visit.
    homesFeature.onStreetEnter({}, { ...engine, homeContext: () => ({ inHome: false }) });
    countHouseVisit(engine, 'house');
    assert.equal(homesFeature.houseVisits(), 3);
  });

  it('the house count is saved and restored (QA &housevisits=N overrides)', () => {
    const engine = stubEngine();
    homesFeature.restore({ houseVisits: 12 }, engine);
    assert.equal(homesFeature.houseVisits(), 12);
    assert.equal(homesFeature.save().houseVisits, 12);
    homesFeature.restore({ houseVisits: 12 }, stubEngine({ housevisits: '4' }));
    assert.equal(homesFeature.houseVisits(), 4);
    homesFeature.restore({ houseVisits: 'x' }, engine);
    assert.equal(homesFeature.houseVisits(), 0);
  });

  it('a Tower visit counts on going in from outside, not riding the elevator', async () => {
    const engine = stubEngine();
    homeTowerFeature.restore({ built: true, floors: 3 }, engine);
    await towerApi.goToFloor(engine, 0, 'door');
    await towerApi.goToFloor(engine, 2); // elevator
    assert.equal(towerApi.visits(), 1);
    towerApi.clearFloor(); // out to the street or the house
    await towerApi.goToFloor(engine, 0, 'door');
    assert.equal(towerApi.visits(), 2);
    assert.equal(engine.data.towerVisits, '2');
    assert.equal(homeTowerFeature.save().visits, 2);
    homeTowerFeature.restore(homeTowerFeature.save(), engine);
    assert.equal(towerApi.visits(), 2);
    homeTowerFeature.restore({ built: true }, stubEngine({ towervisits: '11' }));
    assert.equal(towerApi.visits(), 11);
  });
});

describe('the Butler reads them', () => {
  it('ownerHintCtx has the counters and the slash-command flags', () => {
    const engine = stubEngine();
    homesFeature.restore({ houseVisits: 11 }, engine);
    homeTowerFeature.restore({ built: true, visits: 14 }, engine);
    let ctx = ownerHintCtx(engine);
    assert.deepEqual([ctx.houseVisits, ctx.towerVisits, ctx.usedHouseCommand, ctx.usedTowerCommand], [11, 14, false, false]);
    assert.equal(HOUSE.when(ctx) && TOWER.when(ctx), true);
    slashCommandsFeature.restore({ usedHouse: true, usedTower: true });
    ctx = ownerHintCtx(engine);
    assert.deepEqual([ctx.usedHouseCommand, ctx.usedTowerCommand], [true, true]);
    assert.equal(HOUSE.when(ctx) || TOWER.when(ctx), false);
  });
});
