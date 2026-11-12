/**
 * G368: the public gardens are shared online (js/shared-gardens.js,
 * js/features/shared-gardens-feature.js; the realtime server's gardens.go;
 * the site's GardenPayout.php). Solo, homes, the tutorial's spinach and tower
 * rooms keep their own plots: tests/gardens.test.js is untouched and still
 * passes, and the hooks here answer null everywhere but the ten streets.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { SEED_CATALOG, createGarden, harvestPlot, plantPlot, tickGarden, waterAllPlots, waterPlot } from '../public/js/garden.js?v=37209241';
import { GARDEN_LOCK_MS, LOCK_LINE, SHARED_GARDEN_STREETS, applyPlot, isSharedGardenStreet, localPlot, lockedFor, parsePlotId, plotId, rollPasses } from '../public/js/shared-gardens.js?v=c1f90bc0';
import { sharedGardensFeature } from '../public/js/features/shared-gardens-feature.js?v=0259921f';
import { FEATURES } from '../public/js/features/index.js?v=d13a4db7';
import { mgDetails, potionPlotCount } from '../public/js/master-garden.js?v=2cd0c59d';
// A fresh pick's save waits for the server's receipt (GRANT_SAVE_DELAY_MS): the tests wait it out.
const settle = () => new Promise((res) => setTimeout(res, 2700));
import { HAS_SITE, SITE_DIR, serverPath, sitePath, skipWithoutServer } from '../tools/repos.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const COMMUNITY = 'GCR101NQ4BU1SKS';

describe('the ten public gardens', () => {
  it('lists the streets the plan names, and never the tutorial, a home or a tower', () => {
    assert.equal(SHARED_GARDEN_STREETS.length, 10);
    assert.ok(isSharedGardenStreet(COMMUNITY));
    assert.ok(isSharedGardenStreet('GLI2V0UN7RD1T2J'), 'Hechey Track stays (Austin 2026-11-07)');
    for (const t of ['GA94GCF7H3D30IM', 'HOME_7', 'HOUSE_7', 'PARTY_3', '']) assert.ok(!isSharedGardenStreet(t), t);
    assert.equal(GARDEN_LOCK_MS, 60000, 'include/garden.js 952: 0.0167 hours');
    assert.equal(LOCK_LINE, 'Another player planted those seeds, give them time to snag them up!');
  });

  it('plot ids', () => {
    assert.equal(plotId('herb', '2-1'), 'herb:2-1');
    assert.deepEqual(parsePlotId('default:4-2'), { bed: 'default', key: '4-2' });
    assert.equal(parsePlotId('home:1-1'), null);
  });

  it('a server plot becomes the page\'s plot on its own clock, with the lock', () => {
    const now = 1_000_000;
    const p = localPlot({ state: 'crop', seed: 'seed_spinach', wet: true, wetAt: 5000, stageAt: 6000, ripeAt: 6000, planter: 7, lock: 30000 }, 2000, now);
    assert.equal(p.wetAt, 3000);
    assert.equal(p.stageStartedAt, 4000);
    assert.equal(p.lockUntil, now + 30000);
    assert.ok(lockedFor(p, 8, now));
    assert.ok(!lockedFor(p, 7, now), 'the planter may pick');
    assert.ok(!lockedFor(p, 8, now + 30001));
    const plot = { state: 'seeds', seed: 'seed_spinach', extra: 1 };
    applyPlot(plot, { state: 'clean' }, 0, now);
    assert.equal(plot.state, 'clean');
    assert.equal(plot.seed, null);
    assert.ok(!('extra' in plot));
  });

  it('the roll passes under the success rate only', () => {
    assert.ok(rollPasses(0.99, 100));
    assert.ok(rollPasses(0.49, 50));
    assert.ok(!rollPasses(0.5, 50));
  });
});

describe('the server\'s data and growth agree with the game', { skip: skipWithoutServer }, () => {
  it('data/gardens.json is current (tools/build-realtime-gardens.mjs --check)', () => {
    const out = spawnSync(process.execPath, ['tools/build-realtime-gardens.mjs', '--check'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
    assert.equal(out.status, 0, out.stderr || out.stdout);
    const data = JSON.parse(readFileSync(serverPath('data', 'gardens.json'), 'utf8'));
    assert.deepEqual(Object.keys(data.streets).sort(), [...SHARED_GARDEN_STREETS].sort());
    const plots = Object.values(data.streets).flat().reduce((n, b) => n + b[1] * b[2], 0);
    // Report #252: the three Herb Gardens streets' 20 planter boxes hold 117 plots (their old two planned beds 42).
    assert.equal(Object.values(data.streets).flat().length, 34, '34 beds');
    assert.equal(plots, 215, '215 plots');
    for (const [id, s] of Object.entries(SEED_CATALOG)) {
      assert.deepEqual(data.rules.seeds[id], [s.gardenType === 'herb' ? 'herb' : 'default', s.grow1Ms, s.grow2Ms, s.cropId, s.produces], id);
      assert.deepEqual(data.rules.legacy.seeds[id], [Math.max(4000, s.grow1H * 8000), Math.max(4000, s.grow2H * 8000)], id);
    }
    assert.deepEqual([data.rules.pace, data.rules.waterMs, data.rules.legacy.waterMs, data.rules.lockMs], [10, 72 * 60_000, 12 * 3_600_000, 60_000]);
  });

  it('the page grows each fixture plot as the server does (testdata/garden-growth.json)', () => {
    const cases = JSON.parse(readFileSync(serverPath('testdata', 'garden-growth.json'), 'utf8'));
    for (const c of cases) {
      const r = c.plot;
      const plot = localPlot({ state: r.s, seed: r.seed, wet: r.wet, wetAt: r.wetAt, stageAt: r.stageAt ?? 0, banked: r.banked, mod: r.mod, pace: r.pace, wetPace: r.wetPace }, 0, r.stageAt ?? 0);
      if (!r.wet) plot.wetAt = null;
      const garden = { plots: { '1-1': plot } };
      // The page ticks every frame; one stage a call (G561) is the same at that pace.
      // (Long cases step a minute at a time: the fixtures from before the garden's speed changed carry no pace.)
      const step = c.at > 1_000_000 ? 60_000 : 250;
      for (let t = Math.min(r.stageAt ?? 0, r.wetAt ?? 0); t < c.at; t += step) tickGarden(garden, t);
      tickGarden(garden, c.at);
      const got = { state: plot.state, wet: plot.wet, banked: plot.growthMs };
      for (const [k, want] of Object.entries(c.expect)) assert.equal(got[k], want, `${c.name}: ${k}`);
    }
  });
});

describe('the feature', () => {
  it('a fresh pick waits for the server\'s receipt before it saves (the take credit is batched)', () => {
    assert.match(read('public/js/features/shared-gardens-feature.js'), /const GRANT_SAVE_DELAY_MS = 2500;[\s\S]*setTimeout\(done, GRANT_SAVE_DELAY_MS\)/);
  });

  it('sits before street-objects and its hooks are in game.js and content.js', () => {
    const ids = FEATURES.map((f) => f.id);
    assert.ok(ids.includes('shared-gardens'));
    assert.ok(ids.indexOf('shared-gardens') < ids.indexOf('street-objects'));
    const game = read('public/game.js');
    assert.match(game, /features\.query\('sharedGardenFor', bedKey, \{ cols, rows \}, engine\)/);
    assert.match(game, /if \(!opts\.detached && !sharedGarden\) \{\n    if \(bedKey !== gardenType\) garden\.bed = bedKey;\n[^\n]*\n    if \(opts\.cols && opts\.rows && !opts\.garden\) fitGardenToBed\(garden, opts\.cols, opts\.rows\);\n    streetState\.gardens\[bedKey\] = garden;/);
    assert.match(game, /const refusedNow = features\.query\('verbRefusedNow', target, verb\.id, engine\);\s*if \(refusedNow\) \{\s*toast\(refusedNow, 2600\);\s*pushActivity\(refusedNow\);\s*playSound\('CLICK_FAILURE'/);
    assert.match(game, /sharedGarden: Boolean\(sharedGrant\?\.garden\)/);
    const content = read('public/content.js');
    assert.equal((content.match(/\.\.\.\(ctx\.sharedGarden \? \{ rng: ctx\.rng \} : \{\}\)/g) || []).length, 2);
  });

  it('solo, homes and other streets keep their own beds: every hook answers null', () => {
    sharedGardensFeature._reset();
    const solo = { mode: 'solo', streetTsid: COMMUNITY, query: () => null };
    assert.equal(sharedGardensFeature.sharedGardenFor('default', { cols: 4, rows: 2 }, solo), null);
    const t = { classId: 'garden_plot', state: { garden: createGarden(), plotKey: '1-1' } };
    assert.equal(sharedGardensFeature.runVerbOverride(t, 'plant', solo), null);
    assert.equal(sharedGardensFeature.verbRefusedNow(t, 'harvest', solo), null);
    const r = rig({ street: 'GA94GCF7H3D30IM' });
    assert.equal(sharedGardensFeature.sharedGardenFor('default', { cols: 4, rows: 2 }, r.engine), null, 'the tutorial\'s spinach');
    assert.equal(r.sent.filter((m) => m.t === 'garden_sync').length, 0);
    assert.equal(sharedGardensFeature.save(), undefined);
  });

  it('a shared street: the bed is the server\'s, and plant, pick and the lock go through it', async (t) => {
    // The page's own success rolls pass (a failed roll runs the verb here alone: tested below).
    t.mock.method(Math, 'random', () => 0.01);
    const r = rig({});
    assert.deepEqual(r.sent.map((m) => m.t), ['garden_sync']);
    // Before the snapshot a verb waits.
    assert.equal(sharedGardensFeature.runVerbOverride(r.plot('1-1'), 'plant', r.engine), true);
    assert.equal(r.engine.toasts.at(-1), 'The street is still connecting. Try again in a moment.');
    r.client.emit('msg:gardens', { t: 'gardens', street: COMMUNITY, snap: true, now: Date.now(), lock: 60000, plots: { 'default:2-1': { state: 'crop', seed: 'seed_spinach', ripeAt: Date.now() - 1000, stageAt: Date.now() - 1000, planter: 99, lock: 59000 } } });
    assert.equal(r.bed.plots['2-1'].state, 'crop');
    assert.equal(r.engine.data.sharedGardens, `${COMMUNITY}:snap`);
    // The old personal copies on the ten streets went from the save; other streets kept theirs.
    assert.deepEqual(r.world[COMMUNITY].gardens, {});
    assert.ok(r.world.GA94GCF7H3D30IM.gardens.default, 'the tutorial bed is untouched');
    // Another player's crop in its 60 seconds: refused before the bar with the original's line.
    assert.equal(sharedGardensFeature.verbRefusedNow(r.plot('2-1'), 'harvest', r.engine), LOCK_LINE);
    // Plant: the seed the page would plant, after the save is written.
    assert.equal(sharedGardensFeature.runVerbOverride(r.plot('1-1'), 'plant', r.engine), true);
    await new Promise((res) => setTimeout(res, 0));
    const ask = r.sent.at(-1);
    assert.equal(ask.t, 'garden_act');
    assert.equal(ask.verb, 'plant');
    assert.equal(ask.id, 'default:1-1');
    assert.equal(ask.seed, 'seed_spinach');
    assert.equal(r.engine.inv.seed_spinach, 2, 'nothing leaves the pack before the go-ahead');
    r.client.emit('msg:garden_ok', { req: ask.req, id: 'default:1-1', verb: 'plant', now: Date.now(), before: { 'default:1-1': { state: 'clean' } }, plots: { 'default:1-1': { state: 'seeds', seed: 'seed_spinach', stageAt: Date.now() } }, use: { op: 'use-00000000000000a1', c: 'seed_spinach', n: 1, spent: true } });
    assert.equal(r.engine.inv.seed_spinach, 1, 'the plant took one seed');
    assert.deepEqual(r.receipts, ['use-00000000000000a1']);
    assert.equal(r.bed.plots['1-1'].state, 'seeds');
    // A pick: the base crop the server granted, the page's own super harvest roll, then the ack.
    r.bed.plots['3-1'] = { ...r.bed.plots['3-1'], state: 'crop', seed: 'seed_spinach' };
    assert.equal(sharedGardensFeature.runVerbOverride(r.plot('3-1'), 'harvest', r.engine), true);
    const pick = r.sent.at(-1);
    assert.equal(pick.verb, 'harvest');
    r.client.emit('msg:garden_ok', { req: pick.req, id: 'default:3-1', verb: 'harvest', now: Date.now(), before: { 'default:3-1': { state: 'crop', seed: 'seed_spinach' } }, plots: { 'default:3-1': { state: 'dirty' } }, grant: { id: 'gg-ab-1', c: 'spinach', n: 6 } });
    await settle();
    assert.ok(r.engine.inv.spinach >= 6);
    assert.deepEqual(r.sent.at(-1), { t: 'garden_ack', id: 'gg-ab-1' });
    assert.deepEqual(sharedGardensFeature.save(), { applied: ['gg-ab-1'] });
    // The same grant resent (a lost answer elsewhere) adds nothing and is acked again.
    const had = r.engine.inv.spinach;
    r.client.emit('msg:garden_grant', { id: 'gg-ab-1', c: 'spinach', n: 6 });
    await new Promise((res) => setTimeout(res, 0));
    assert.equal(r.engine.inv.spinach, had);
    assert.deepEqual(r.sent.at(-1), { t: 'garden_ack', id: 'gg-ab-1' });
    // A grant the page never heard: the base crop, once.
    r.client.emit('msg:garden_grant', { id: 'gg-ab-2', c: 'spinach', n: 12 });
    await new Promise((res) => setTimeout(res, 0));
    assert.equal(r.engine.inv.spinach, had + 12);
    // A refusal shows the server's line and its plot.
    r.bed.plots['4-1'] = { ...r.bed.plots['4-1'], state: 'crop', seed: 'seed_spinach' };
    sharedGardensFeature.runVerbOverride(r.plot('4-1'), 'harvest', r.engine);
    const late = r.sent.at(-1);
    r.client.emit('msg:garden_no', { req: late.req, id: 'default:4-1', verb: 'harvest', code: 'nothing', message: 'Oops. There is nothing there to pick.', now: Date.now(), plots: { 'default:4-1': { state: 'dirty' } } });
    assert.equal(r.engine.toasts.at(-1), 'Oops. There is nothing there to pick.');
    assert.equal(r.bed.plots['4-1'].state, 'dirty');
  });

  it('Water All is one message naming the plots the page\'s own rolls watered', (t) => {
    // No skill: a watering succeeds three times in four (success_rate 75); every other roll fails.
    let n = 0;
    t.mock.method(Math, 'random', () => (n++ % 2 ? 0.9 : 0.1));
    const r = rig({});
    r.client.emit('msg:gardens', { t: 'gardens', street: COMMUNITY, snap: true, now: Date.now(), plots: {} });
    assert.equal(sharedGardensFeature.runVerbOverride(r.bedT, 'water_all', r.engine), true);
    const ask = r.sent.at(-1);
    assert.equal(ask.verb, 'water_all');
    assert.equal(ask.bed, 'default');
    assert.deepEqual(ask.ids, ['default:1-1', 'default:3-1', 'default:1-2', 'default:3-2'], 'the plots whose rolls passed, in the bed\'s order');
  });

  it('a failed roll runs the verb here alone, and the plot stays the server\'s', (t) => {
    t.mock.method(Math, 'random', () => 0.999);
    const r = rig({});
    r.client.emit('msg:gardens', { t: 'gardens', street: COMMUNITY, snap: true, now: Date.now(), plots: { 'default:1-1': { state: 'crop', seed: 'seed_spinach', stageAt: Date.now(), ripeAt: Date.now() } } });
    const before = r.sent.length;
    assert.equal(sharedGardensFeature.runVerbOverride(r.plot('1-1'), 'harvest', r.engine), true);
    assert.equal(r.sent.length, before, 'nothing asked');
    assert.equal(r.bed.plots['1-1'].state, 'crop');
    assert.ok(!r.engine.inv.spinach, 'no crop');
  });

  it('a bed drawn before the realtime client was there becomes the server\'s at the snapshot', () => {
    const r = rig({});
    const local = createGarden({ cols: 4, rows: 2 });
    r.bedT.state.garden = local;
    for (const t of r.bedT.state.plotTargets) Object.assign(t.state, { garden: local, plot: local.plots[t.state.plotKey] });
    r.client.emit('msg:gardens', { t: 'gardens', street: COMMUNITY, snap: true, now: Date.now(), plots: { 'default:1-1': { state: 'dirty' } } });
    assert.ok(r.bedT.state.garden.shared);
    assert.equal(r.plot('1-1').state.plot.state, 'dirty');
    assert.equal(local.plots['1-1'].state, 'clean', 'the save\'s own bed is not written');
  });

  it('a server without gardens (bad_frame) puts the save\'s own plots back', () => {
    const r = rig({});
    r.world[COMMUNITY].gardens.default.plots['1-1'].state = 'crop';
    r.client.emit('error', { code: 'bad_frame' });
    assert.equal(r.bedT.state.garden, r.world[COMMUNITY].gardens.default);
    assert.equal(r.plot('1-1').state.plot.state, 'crop');
    assert.equal(sharedGardensFeature.runVerbOverride(r.plot('1-1'), 'harvest', r.engine), null, 'local rules');
  });
});

describe('Master Gardener potions on a shared bed (slice 2)', () => {
  it('potionPlotCount is potionTendGarden\'s plots: its tests, the seeds, the energy', () => {
    const g = createGarden({ cols: 4, rows: 2 });
    g.plots['1-1'].state = 'dirty';
    g.plots['3-1'].state = 'dirty';
    g.plots['2-2'] = { ...g.plots['2-2'], state: 'crop', seed: 'seed_spinach' };
    const ctx = { learned: ['mastergardener_1', 'croppery_1'], upgrades: [] };
    const pc = { energy: 1000 };
    assert.equal(potionPlotCount(g, 'hoe', {}, pc, ctx), 2);
    assert.equal(potionPlotCount(g, 'water', {}, pc, ctx), 8);
    assert.equal(potionPlotCount(g, 'pick', {}, pc, ctx), 1);
    assert.equal(potionPlotCount(g, 'plant', { seed_spinach: 3 }, pc, { ...ctx, seedId: 'seed_spinach' }), 3, 'three seeds for five clean plots');
    assert.equal(potionPlotCount(g, 'plant', { herb_seed_rubeweed: 3 }, pc, { ...ctx, seedId: 'herb_seed_rubeweed' }), 0, 'an herb seed in a crop bed');
    const cost = Number(mgDetails('default', 'water', ctx.learned, []).energy_cost) || 0;
    if (cost > 0) assert.equal(potionPlotCount(g, 'water', {}, { energy: cost * 3 + 1 }, ctx), 3, 'it stops when too tired');
    assert.equal(potionPlotCount(g, 'water', {}, pc, { learned: [], upgrades: [] }) >= 0, true);
  });

  it('the pour asks the server with the plots, the bottle, the seed; its go-ahead lands the pour and the grants', async (t) => {
    t.mock.method(Math, 'random', () => 0.01);
    const r = rig({});
    r.client.emit('msg:gardens', { t: 'gardens', street: COMMUNITY, snap: true, now: Date.now(), plots: {} });
    const granted = [];
    const q = r.engine.query.bind(r.engine);
    r.engine.query = (hook, ...args) => {
      if (hook === 'masterGardenPourGranted') {
        granted.push(args[1]);
        const g = args[0].target.state.garden;
        for (const k of ['1-1', '2-1']) Object.assign(g.plots[k], { state: 'dirty', seed: null });
        r.engine.inv.spinach = (r.engine.inv.spinach || 0) + 24;
        return true;
      }
      return q(hook, ...args);
    };
    const pour = { potionClass: 'potion_garden_harvest', seedId: null, target: r.bedT, copy: null, n: 2, k: 0 };
    assert.equal(sharedGardensFeature.sharedPotionPour(pour, r.engine), true);
    await new Promise((res) => setTimeout(res, 0));
    const ask = r.sent.at(-1);
    assert.deepEqual({ t: ask.t, bed: ask.bed, c: ask.c, n: ask.n, k: ask.k }, { t: 'garden_potion', bed: 'default', c: 'potion_garden_harvest', n: 2, k: 0 });
    r.client.emit('msg:garden_ok', { req: ask.req, verb: 'potion', bed: 'default', c: 'potion_garden_harvest', count: 2, now: Date.now(),
      before: { 'default:1-1': { state: 'crop', seed: 'seed_spinach' }, 'default:2-1': { state: 'crop', seed: 'seed_spinach' } },
      plots: { 'default:1-1': { state: 'dirty' }, 'default:2-1': { state: 'dirty' } },
      use: { op: 'use-00000000000000b1', c: 'potion_garden_harvest', left: 4, spent: false },
      grants: [{ id: 'gg-cd-1', c: 'spinach', n: 24 }] });
    await settle();
    assert.deepEqual(granted, [{ use: { op: 'use-00000000000000b1', c: 'potion_garden_harvest', left: 4, spent: false } }]);
    assert.equal(r.bed.plots['1-1'].state, 'dirty');
    assert.deepEqual(r.sent.at(-1), { t: 'garden_ack', id: 'gg-cd-1' });
    assert.equal(r.engine.inv.spinach, 24, 'the pour gave the crop; nothing added twice');
    // A Seed-Dibber: the seeds' op is applied once.
    sharedGardensFeature.sharedPotionPour({ potionClass: 'potion_garden_plant', seedId: 'seed_spinach', target: r.bedT, n: 2, mod: 1 }, r.engine);
    await new Promise((res) => setTimeout(res, 0));
    const plant = r.sent.at(-1);
    assert.equal(plant.seed, 'seed_spinach');
    r.client.emit('msg:garden_ok', { req: plant.req, verb: 'potion', bed: 'default', now: Date.now(), before: {}, plots: {}, use: { op: 'use-00000000000000b2', left: 3, spent: false }, seeds: { op: 'use-00000000000000b3', c: 'seed_spinach', n: 2, spent: true } });
    assert.ok(r.receipts.includes('use-00000000000000b3'));
  });

  it('master-garden-feature asks for a shared bed, and the temporary refusal is gone', () => {
    const mg = read('public/js/features/master-garden-feature.js');
    assert.match(mg, /if \(garden\?\.shared && engine\.mode === 'multiplayer'\)/);
    assert.match(mg, /engine\.query\?\.\('sharedPotionPour'/);
    assert.ok(!/sharedGardenPotion/.test(mg + read('public/js/features/shared-gardens-feature.js')));
  });

  it('another player\'s can or hoe goes over their head; the page\'s own acts name the tool', () => {
    const f = read('public/js/features/shared-gardens-feature.js');
    assert.match(f, /c\.on\('msg:garden_ev'/);
    assert.match(f, /JOB_WORK_OVERLAY\.deltaY/);
    const r = rig({});
    r.client.emit('msg:gardens', { t: 'gardens', street: COMMUNITY, snap: true, now: Date.now(), plots: { 'default:1-1': { state: 'dirty' } } });
    sharedGardensFeature.runVerbOverride(r.plot('1-1'), 'clear', r.engine);
    assert.equal(r.sent.at(-1).tool, 'hoe');
  });
});

describe('the one-time payout by mail (site GardenPayout.php)', { skip: !HAS_SITE ? 'no site checkout' : spawnSync('php', ['-v']).status !== 0 ? 'no php' : false }, () => {
  const php = (body) => JSON.parse(execFileSync('php', ['-r', `foreach (['LedgerMath', 'Economy', 'LedgerMail', 'GardenPayout'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\GardenPayout as P; ${body}`]).toString());
  const seeds = JSON.parse(readFileSync(sitePath('data', 'garden-seeds.json'), 'utf8'));

  it('the site lists the same ten streets, with each seed\'s crop and count', () => {
    assert.deepEqual(seeds.shared, [...SHARED_GARDEN_STREETS]);
    // 0.5 h and 0.25 h at 10 times Glitch's speed; l1, l2 the clock before it (8 s an hour, 4 s at least).
    assert.deepEqual(seeds.seeds.seed_spinach, { t: 'default', g1: 180000, g2: 90000, l1: 4000, l2: 4000, c: 'spinach', n: 12 });
    assert.deepEqual([seeds.pace, seeds.waterMs, seeds.legacyWaterMs], [10, 4320000, 43200000]);
  });

  it('pays the full crop for seeds, shoots and crops, on the ten streets only', () => {
    const state = {
      world: { streets: {
        [COMMUNITY]: { gardens: {
          default: { plots: { '1-1': { state: 'crop', seed: 'seed_spinach' }, '2-1': { state: 'seeds', seed: 'seed_spinach', wet: false }, '3-1': { state: 'clean' }, '4-1': { state: 'dirty' }, '9-9': { state: 'crop', seed: 'seed_spinach' }, '1-2': { state: 'crop', seed: 'herb_seed_rubeweed' } } },
          herb: { plots: { '1-1': { state: 'shoots', seed: 'herb_seed_rubeweed' } } },
        } },
        GA94GCF7H3D30IM: { gardens: { default: { plots: { '1-1': { state: 'crop', seed: 'seed_spinach' } } } } },
      } },
    };
    const arg = JSON.stringify(JSON.stringify(state));
    const shared = JSON.stringify(JSON.stringify(seeds.shared));
    const seedArg = JSON.stringify(JSON.stringify(seeds.seeds));
    const owed = php(`echo json_encode(P::owed(json_decode(${arg}), json_decode(${shared}, true), json_decode(${seedArg}, true)));`);
    // The full produces_count whatever the skills (Austin 2026-11-07): no halving in the payout.
    assert.deepEqual(owed, { [COMMUNITY]: { rubeweed: SEED_CATALOG.herb_seed_rubeweed.produces, spinach: 24 } }, 'two spinach plots at 12, the bad key and the herb seed in a crop bed skipped');
    const streets = php(`echo json_encode(P::streetsWithGardens(json_decode(${arg}), json_decode(${shared}, true)));`);
    assert.deepEqual(streets, [COMMUNITY]);
  });

  it('the letter is plain, short and has no em-dash', () => {
    const text = php('echo json_encode(P::TEXT);');
    assert.ok(text.length <= 300);
    assert.ok(!/[\u2014\u2013]/.test(text), 'no em-dash or en-dash');
    assert.match(text, /upgraded from solo play to shared play/);
  });
});

/** A fake engine on Community Gardens with its crop bed, a save world and a fake realtime client. */
function rig({ street = COMMUNITY }) {
  const sent = [];
  const listeners = new Map();
  const client = {
    state: 'online',
    street,
    me: { id: 7 },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    send(kind, payload = {}) {
      sent.push({ t: kind, ...payload });
      return true;
    },
    emit(type, detail) {
      for (const fn of listeners.get(type) || []) fn(detail);
    },
  };
  const world = {
    [COMMUNITY]: { gardens: { default: createGarden({ cols: 4, rows: 2 }) } },
    GA94GCF7H3D30IM: { gardens: { default: createGarden({ cols: 4, rows: 2 }) } },
  };
  const receipts = [];
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: street,
    inv: { seed_spinach: 2, watering_can: 1, hoe: 1 },
    pc: { energy: 500, mood: 50, imaginationUpgrades: [] },
    learnedSkills: [],
    toolState: null,
    interactables: [],
    data: {},
    toasts: [],
    setData(k, v) { this.data[k] = String(v); },
    toast(line) { this.toasts.push(line); },
    pushActivity() {},
    playSound() {},
    refreshGarden() {},
    refreshPack() {},
    save() {},
    visitedStreets: () => Object.keys(world),
    streetWorld: (tsid) => world[tsid] || (world[tsid] = { gardens: {} }),
    query(hook, op) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'ledgerReceipt') { receipts.push(op); return true; }
      return null;
    },
    executeVerb(target, verbId) {
      // What game.js and content.js do: overrides first, then js/garden.js with the page's draws.
      assert.equal(sharedGardensFeature.runVerbOverride(target, verbId, engine), null, 'the granted run goes through');
      const grant = sharedGardensFeature.sharedVerbGrant(target, verbId);
      const rolls = [...(grant?.rolls || [])];
      const opts = { inv: engine.inv, learned: [], upgrades: [], rng: () => (rolls.length ? rolls.shift() : 0.99) };
      const g = target.state.garden;
      if (verbId === 'plant') plantPlot(g, target.state.plotKey, engine.inv, engine.pc, undefined, opts);
      if (verbId === 'harvest') harvestPlot(g, target.state.plotKey, engine.inv, engine.pc, opts);
      if (verbId === 'water') waterPlot(g, target.state.plotKey, engine.pc, opts);
      if (verbId === 'water_all') waterAllPlots(g, engine.pc, opts);
    },
  };
  sharedGardensFeature._reset();
  sharedGardensFeature.restore(undefined, engine);
  sharedGardensFeature.onTick(16, 0, engine);
  // game.js spawnGarden: the bed and its plot targets.
  const bed = sharedGardensFeature.sharedGardenFor('default', { cols: 4, rows: 2 }, engine) || world[street]?.gardens?.default;
  const bedT = { classId: 'garden_new', state: { garden: bed, plotTargets: [] } };
  for (const key of Object.keys(bed.plots)) {
    const t = { classId: 'garden_plot', state: { garden: bed, plotKey: key, plot: bed.plots[key], gardenEntity: bedT } };
    bedT.state.plotTargets.push(t);
  }
  engine.interactables = [bedT, ...bedT.state.plotTargets];
  const plot = (key) => {
    const t = bedT.state.plotTargets.find((p) => p.state.plotKey === key);
    t.state.plot = t.state.garden.plots[key];
    return t;
  };
  return { engine, client, sent, world, receipts, bed, bedT, plot };
}

describe('report 188: the Herb Gardens streets grow herbs in both beds', () => {
  it('streetGardenBed gives two herb beds there (herb2, herb) and crop then herb everywhere else', async () => {
    const { HERB_GARDEN_STREETS, bedKind, streetGardenBed } = await import('../public/js/garden.js?v=37209241');
    assert.deepEqual([...HERB_GARDEN_STREETS].sort(), ['GA95U14319524O9', 'GA97L62229522GS', 'GA99U5PI39524GN']);
    for (const tsid of HERB_GARDEN_STREETS) {
      assert.deepEqual(streetGardenBed(tsid, 0), { bed: 'herb2', gardenType: 'herb', cols: 4 });
      assert.deepEqual(streetGardenBed(tsid, 1), { bed: 'herb', gardenType: 'herb', cols: 3 });
      // The L tsid names the same street.
      assert.equal(streetGardenBed(`L${tsid.slice(1)}`, 0).gardenType, 'herb');
    }
    assert.deepEqual(streetGardenBed('GLI2V0UN7RD1T2J', 0), { bed: 'default', gardenType: 'default', cols: 4 });
    assert.deepEqual(streetGardenBed('GLI2V0UN7RD1T2J', 1), { bed: 'herb', gardenType: 'herb', cols: 3 });
    assert.equal(bedKind('herb2'), 'herb');
    assert.equal(bedKind('default'), 'default');
  });

  it('herb2 plot ids round-trip, and the save keeps an herb2 bed', async () => {
    assert.equal(plotId('herb2', '4-2'), 'herb2:4-2');
    assert.deepEqual(parsePlotId('herb2:4-2'), { bed: 'herb2', key: '4-2' });
    // Report #252: one herb bed per planter box, herb2..herb9.
    assert.deepEqual(parsePlotId('herb3:1-1'), { bed: 'herb3', key: '1-1' });
    assert.equal(parsePlotId('herb10:1-1'), null);
    assert.equal(parsePlotId('herb1:1-1'), null);
    const { gardenBedKey } = await import('../public/js/shared-gardens.js?v=c1f90bc0');
    assert.equal(gardenBedKey(createGarden({ gardenType: 'herb', bed: 'herb2' })), 'herb2');
    assert.equal(gardenBedKey(createGarden({ gardenType: 'herb' })), 'herb');
    assert.equal(gardenBedKey(createGarden({})), 'default');
    const src = readFileSync(new URL('../public/js/player-save.js', import.meta.url), 'utf8');
    assert.match(src, /for \(const type of \['default', 'herb', 'herb2', 'herb3', 'herb4', 'herb5', 'herb6', 'herb7', 'herb8', 'herb9'\]\)/);
  });

  it('game.js lays the street beds out by streetGardenBed and keeps each under its own key', () => {
    const src = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
    assert.match(src, /const bed = streetGardenBed\(data\.tsid, index\);/);
    assert.match(src, /streetState\.gardens\[bedKey\] = garden;/);
  });
});
