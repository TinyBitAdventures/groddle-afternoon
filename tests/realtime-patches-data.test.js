/**
 * G564: the shared street Patches' layout and rules the realtime server runs
 * by (data/patches.json, tools/build-realtime-patches.mjs; the server's
 * patches.go). The file must be current, its plot keys the page's own, its
 * numbers js/patches.js's, and the page must grow a Patch tree as the server
 * does on the server's own fixtures (testdata/patch-growth.json).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  CAN_PLANT_MAPPINGS,
  PLANT_HUB_ALIASES,
  SEASONED_BEANS,
  SOIL_TIMERS,
  WOOD_TREE_MATURITY_MAP,
  createPlot,
  maturityGrowChance,
  tickPlot,
} from '../public/js/patches.js?v=cd774b2c';
import { createTrantState } from '../public/js/trants.js?v=4d6f5593';
import { PATCH_PILOT, SITE_OUT, sharedPatchStreets } from '../tools/build-realtime-patches.mjs';
import { HAS_SITE, serverPath, skipWithoutServer } from '../tools/repos.mjs';

const OLD_MAIN = 'GM4103L52ID23';

describe('the server\'s Patches data and growth agree with the game', { skip: skipWithoutServer }, () => {
  it('data/patches.json is current (tools/build-realtime-patches.mjs --check)', () => {
    const out = spawnSync(process.execPath, ['tools/build-realtime-patches.mjs', '--check'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
    assert.equal(out.status, 0, out.stderr || out.stdout);
  });

  it('lays out every placed plot under the page\'s own keys, every street shared (no pilot list)', () => {
    const data = JSON.parse(readFileSync(serverPath('data', 'patches.json'), 'utf8'));
    // Slice 3 (Austin 2026-11-08: "all 100 streets", "no pilot: every street at once"): one data value.
    assert.equal(data.pilot, null);
    assert.equal(PATCH_PILOT, null);
    assert.equal(sharedPatchStreets(data.streets).length, 100);
    assert.deepEqual(sharedPatchStreets(data.streets, [OLD_MAIN]), [OLD_MAIN], 'a list narrows it again');
    const plots = Object.values(data.streets).flatMap((s) => s.plots);
    assert.equal(Object.keys(data.streets).length, 100, 'the plan\'s 100 streets');
    assert.equal(plots.length, 188, '175 Patches, 8 Dark Patches, 5 dead trees');
    for (const [key, cls] of plots) assert.match(key, new RegExp(`^${cls}:\\d+$`), 'soilSpawnPlan keys: <class>:<n>');
    const old = data.streets[OLD_MAIN];
    assert.equal(old.hub, 27);
    assert.deepEqual(old.plots.map((p) => p[0]), ['patch:0', 'patch:1', 'patch:2', 'patch:3', 'trant_spice_dead:0']);
  });

  it('writes the site\'s payout data for every shared street (data/patch-streets.json)', { skip: HAS_SITE ? false : 'no site checkout' }, () => {
    const data = JSON.parse(readFileSync(serverPath('data', 'patches.json'), 'utf8'));
    const site = JSON.parse(readFileSync(SITE_OUT, 'utf8'));
    assert.deepEqual(Object.keys(site.streets).sort(), Object.keys(data.streets).sort());
    assert.equal(site.streets[OLD_MAIN].name, 'Old Main Street');
    assert.deepEqual(site.streets[OLD_MAIN].plots, data.streets[OLD_MAIN].plots.map(([k, c]) => [k, c]));
    for (const [bean, b] of Object.entries(SEASONED_BEANS)) assert.equal(site.beans[b.trantClass], bean);
    assert.equal(site.fruit.trant_spice, 'all_spice');
    assert.deepEqual(site.planks, [25, 30, 40, 50, 60, 80]);
  });

  it('carries js/patches.js\'s numbers', () => {
    const { rules } = JSON.parse(readFileSync(serverPath('data', 'patches.json'), 'utf8'));
    assert.equal(rules.timers.clean, SOIL_TIMERS.cleanRegrowMs);
    assert.equal(rules.timers.dug, SOIL_TIMERS.dugFillMs);
    assert.equal(rules.timers.min, SOIL_TIMERS.seedlingMinMs);
    assert.equal(rules.timers.max, SOIL_TIMERS.seedlingMaxMs);
    assert.equal(rules.timers.wood, SOIL_TIMERS.woodToPatchMs);
    assert.equal(rules.timers.catchUp, SOIL_TIMERS.maxCatchUpCycles);
    for (let m = 0; m <= 10; m += 1) for (let h = 0; h <= 10; h += 1) assert.equal(rules.chance[m][h], maturityGrowChance(m, h), `chance ${m}/${h}`);
    assert.deepEqual(rules.plant, JSON.parse(JSON.stringify(CAN_PLANT_MAPPINGS)));
    assert.deepEqual(rules.aliases, { 28: PLANT_HUB_ALIASES[28], 52: PLANT_HUB_ALIASES[52] });
    for (const [bean, b] of Object.entries(SEASONED_BEANS)) assert.equal(rules.beans[bean], b.trantClass);
    assert.deepEqual(rules.woodMap, [...WOOD_TREE_MATURITY_MAP]);
    assert.deepEqual(rules.grow, { 3: 180000, 4: 60000 });
    assert.equal(rules.clear, 25);
  });

  it('the page grows each fixture tree as the server does (testdata/patch-growth.json)', () => {
    const cases = JSON.parse(readFileSync(serverPath('testdata', 'patch-growth.json'), 'utf8'));
    assert.ok(cases.length >= 5);
    const base = 1_800_000_000_000;
    for (const c of cases) {
      let used = 0;
      const rng = () => (used < c.rolls.length ? c.rolls[used++] : 0.99);
      const plot = createPlot('patch', { now: base });
      plot.stage = 'tree';
      plot.tree = {
        classId: c.tree,
        state: createTrantState(c.tree, { maturity: c.maturity, health: c.health, fruitCount: 0 }),
        grownAt: base,
        lastCycleAt: base,
        woodPetted: 0,
        woodWatered: 0,
        seenPetted: false,
        seenWatered: false,
        seenHarvests: 0,
        clearedAt: 0,
        resetAt: base,
      };
      tickPlot(plot, base + c.at, { rng });
      assert.equal(plot.tree.state.maturity, c.expect.maturity, `${c.name}: maturity`);
      assert.equal(plot.tree.lastCycleAt - base, c.expect.cycleAt, `${c.name}: cycleAt`);
      assert.equal(used, c.expect.rolls, `${c.name}: rolls`);
    }
  });
});
