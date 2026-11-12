/**
 * Gap 1 (research/street-projects-audit-2026-11-11.md): the Group Hall lot. In multiplayer a
 * street with a group hall draws Tiny Speck's roped lot and its house-and-hammer sign
 * (group_hall_lot_marker.swf), and clicking the sign (talk to) opens the hall's project panel.
 *
 * Source: glitch-GameServerJS items/group_hall_lot_marker.js 3, 8, 39-61, 119, 134;
 * items/include/jobs.js canOffer 104-106, offerJobs 124-158; quests/quest.js 1830-1840.
 * Art: tools/group-hall-lot-art/build.mjs.
 * Run: node --test tests/group-hall-lot.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { streetJobsFeature, projectApi } from '../public/js/features/street-jobs-feature.js?v=ab8f4936';
import { LOT_ART, LOT_CLASS, LOT_PLACEMENT, LOT_SIGN_X, LOT_TEXT, floorYAt, lotFit, lotHeadline, lotJobIds, lotVerb } from '../public/js/group-hall-lot.js?v=23e8fbd9';
import { batterflyPlacementGroups } from '../public/js/features/animal-husbandry-feature.js?v=b2286d02';
import { imageSize } from '../tools/image-size.mjs';
import { Display, FakeEl, fakePixi } from './fake-scene.js';

const root = join(import.meta.dirname, '..');
const audit = join(root, '..');
const read = (rel) => readFileSync(join(root, 'public', rel), 'utf8');
const catalog = JSON.parse(read('assets/content/street-jobs.json'));
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const HALL_STREETS = Object.fromEntries(Object.entries(catalog.halls.jobs).map(([id, j]) => [j.connecting[0], id]));

describe('the art (tools/group-hall-lot-art/build.mjs)', () => {
  it('ships the plot and the sign at 3x their SWF sizes', () => {
    for (const piece of ['plot', 'sign']) {
      const file = join(root, 'public', LOT_ART[piece].url);
      assert.ok(existsSync(file), file);
      const { w, h } = imageSize(file);
      assert.equal(w, Math.ceil(LOT_ART[piece].w * 3), `${piece} width`);
      assert.equal(h, Math.ceil(LOT_ART[piece].h * 3), `${piece} height`);
    }
    execFileSync(process.execPath, [join(root, 'tools/group-hall-lot-art/build.mjs'), '--check'], { stdio: 'pipe' });
  });

  it('lays the pieces as the SWF does: the stage 621 x 114.6, the sign on the origin line', () => {
    // displayRect 12420 x 2292 twips; plot (0,0); interaction_target at (1483, 135) twips.
    assert.equal(LOT_ART.plot.x, -LOT_ART.originX);
    assert.equal(LOT_ART.plot.y, -LOT_ART.originY);
    assert.ok(Math.abs(LOT_ART.sign.x - (1483 / 20 - LOT_ART.originX)) < 1e-9);
    assert.ok(Math.abs(LOT_ART.sign.y - (135 / 20 - LOT_ART.originY)) < 1e-9);
    assert.ok(Math.abs(LOT_ART.sign.y + LOT_ART.sign.h) < 1e-9, 'the post stands on the ground');
    assert.ok(LOT_SIGN_X < -150 && LOT_SIGN_X > -240, 'the sign is at the left end of the rope');
    // getAssetInfo (group_hall_lot_marker.js 119): {x:-311, y:-115, w:621, h:115}.
    assert.equal(Math.round(LOT_ART.plot.w), 621);
    assert.equal(Math.round(LOT_ART.originY), 115);
  });

  it('is cut from the CC0 SWF (when glitch-items is beside the game)', (t) => {
    const swf = join(audit, 'glitch-items/misc/group_hall_lot_marker/group_hall_lot_marker.swf');
    if (!existsSync(swf)) return t.skip('glitch-items not here');
    assert.ok(read('../tools/group-hall-lot-art/build.mjs').includes('group_hall_lot_marker.swf'));
  });
});

describe('the words and the streets', () => {
  it('takes its label, description and verb from the item file', (t) => {
    const src = join(audit, 'glitch-GameServerJS/items/group_hall_lot_marker.js');
    if (!existsSync(src)) return t.skip('glitch-GameServerJS not here');
    const js = readFileSync(src, 'utf8');
    assert.ok(js.includes(`var label = "${LOT_TEXT.label}";`));
    assert.ok(js.includes(`var description = "${LOT_TEXT.desc}";`));
    assert.ok(js.includes(`"name"\t\t\t\t: "${LOT_TEXT.verb}"`));
    assert.ok(js.includes(`"tooltip"\t\t\t: "${LOT_TEXT.tooltip}"`));
    assert.ok(js.includes('in_background\t: true'));
    for (const text of Object.values(LOT_TEXT)) assert.ok(!text.includes('—'), 'no em-dash');
  });

  it('stands on every hall street: the nine archived lots and Addingfoot Trip', (t) => {
    assert.equal(Object.keys(HALL_STREETS).length, 10);
    const dir = join(audit, 'streets/mnt/stos/location_data');
    if (!existsSync(dir)) return t.skip('location XML not here');
    const withLot = readdirSync(dir)
      .filter((f) => /^L[A-Z0-9]+\.xml$/.test(f) && readFileSync(join(dir, f), 'utf8').includes('label="Group Hall Lot Marker"'))
      .map((f) => `G${f.slice(1, -4)}`)
      .sort();
    assert.equal(withLot.length, 9);
    for (const tsid of withLot) assert.ok(HALL_STREETS[tsid], `${tsid} offers a hall`);
    // The tenth was built before the snapshot, so its lot was hidden (quest.js 1838).
    assert.deepEqual(Object.keys(HALL_STREETS).filter((s) => !withLot.includes(s)), ['GCR10157DMK1L0G']);
  });

  it('asks the placement plan for a floor run as wide as the rope, off the signposts', () => {
    assert.equal(LOT_PLACEMENT.count, 1);
    assert.ok(LOT_PLACEMENT.footprint >= 560 && LOT_PLACEMENT.footprint <= 621);
    assert.ok(LOT_PLACEMENT.clearance >= 300);
    assert.equal(LOT_PLACEMENT.height, 115);
  });

  it('keeps the shared layout: no hall street has Batterflies planned after the lot', () => {
    // build-realtime-objects.mjs creatureRequests leaves street-jobs' groups out; the Batterflies are
    // the only shared group after them, so the lot must not share a street with any.
    for (const tsid of Object.keys(HALL_STREETS)) assert.deepEqual(batterflyPlacementGroups({ tsid }), [], tsid);
  });

  it('keeps the sign clear: slides along its floor, else faces the rope the other way', () => {
    const at = { x: 1000, y: 900, room: 621 };
    assert.deepEqual(lotFit(at, {}), { x: 1000, side: 1 }, 'as the SWF draws it');
    const onSign = { shrine: [{ x: 1000 + LOT_SIGN_X, y: 900 }] };
    assert.deepEqual(lotFit(at, onSign), { x: 1000, side: -1 }, 'no floor to slide on: mirrored');
    const both = { ...onSign, trees: [{ x: 1000 - LOT_SIGN_X, y: 905 }] };
    assert.deepEqual(lotFit(at, both), { x: 1000, side: 1 }, 'both ends blocked, no room: as drawn');
    const roomy = lotFit({ ...at, room: 1021 }, both);
    assert.ok(roomy.x !== 1000 && Math.abs(roomy.x - 1000) <= 200, 'slides within its free floor');
    assert.deepEqual(lotFit(at, { shrine: [{ x: 1000 + LOT_SIGN_X, y: 600 }] }), { x: 1000, side: 1 }, 'a shrine on a floor above hides nothing');
    // The floor under the slid lot: the line nearest the plan point's y.
    const floor = [{ x1: 0, y1: 900, x2: 2000, y2: 940 }, { x1: 0, y1: 500, x2: 2000, y2: 500 }];
    assert.equal(floorYAt(floor, 1000, 910), 920);
    assert.equal(floorYAt(floor, 3000, 910), 910);
  });
});

describe('the lot on the street (multiplayer)', () => {
  let engine;
  let data;
  const saved = {};
  const unregistered = [];
  const ADDINGFOOT = 'GCR10157DMK1L0G'; // job 694, the hall alone
  const ESTEVAN = 'GLI32KHF0UD1AOK'; // job 86 (a new street, the spirit's) and hall 689
  const spirit = { classId: 'street_spirit_groddle', label: 'Street Spirit', state: { vendorKey: 'groceries' }, sprite: null };

  before(async () => {
    for (const k of ['document', 'window', 'fetch', 'PIXI']) saved[k] = globalThis[k];
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    const body = new FakeEl('body');
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
    globalThis.PIXI = fakePixi;
    globalThis.fetch = async (url) => {
      const rel = String(url).split('?')[0].replace(/^\//, '');
      try {
        return { ok: true, status: 200, json: async () => JSON.parse(read(rel)) };
      } catch {
        return { ok: false, status: 404, json: async () => null };
      }
    };
    data = {};
    spirit.sprite = new Display();
    engine = {
      mode: 'multiplayer',
      started: true,
      PIXI: fakePixi,
      entityLayer: new Display(),
      fxLayer: new Display(),
      streetTsid: ADDINGFOOT,
      street: { tsid: ADDINGFOOT },
      player: { x: 500, y: 800 },
      interactables: [],
      inv: {},
      pc: { level: 10, energy: 500, mood: 100, currants: 0 },
      learnedSkills: [],
      unlockedAchievements: ['you_have_papers'],
      param: () => null,
      placement: (key) => (key === LOT_PLACEMENT.key ? [{ x: 1400, y: 900 }] : []),
      query: () => null,
      register: (t) => t,
      unregister: (t) => {
        unregistered.push(t);
        t.sprite?.destroy?.();
      },
      say() {},
      setData: (k, v) => { data[k] = v; },
      toast() {},
      prompt() {},
      pushActivity() {},
      floatText() {},
      updateHud() {},
      refreshPack() {},
      save() {},
      achievement() {},
      grantAchievement() {},
      visitedStreets: () => [ADDINGFOOT],
    };
    streetJobsFeature.init(engine);
    streetJobsFeature.restore({}, engine);
    await projectApi.ready();
  });

  after(() => {
    streetJobsFeature.onStreetClear(engine);
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  const enter = async (tsid, here = []) => {
    streetJobsFeature.onStreetClear(engine);
    engine.streetTsid = tsid;
    engine.street = { tsid };
    engine.interactables = here;
    streetJobsFeature.onStreetEnter(engine.street, engine);
    await wait(5);
  };

  it('asks for the lot\'s floor run on a hall street', () => {
    const groups = streetJobsFeature.placementGroups({}, { tsid: ADDINGFOOT });
    assert.ok(groups.some((g) => g.key === LOT_PLACEMENT.key && g.footprint === LOT_PLACEMENT.footprint));
    assert.ok(!groups.some((g) => g.key === 'street-job-board'), 'no Job Board for a hall');
  });

  it('draws the roped plot and the sign at the plan\'s point, with the bubble over the sign', async () => {
    await enter(ADDINGFOOT);
    const st = streetJobsFeature._state();
    assert.deepEqual(st.lot, { jobId: '694', x: 1400, side: 1, signX: Math.round(1400 + LOT_SIGN_X) });
    assert.equal(st.board, false, 'the hall is the lot\'s, not the board\'s');
    const plot = engine.entityLayer.children.find((c) => c.label === 'group-hall-lot-plot');
    const sign = engine.entityLayer.children.find((c) => c.label === 'group-hall-lot-sign');
    assert.ok(plot && sign);
    assert.equal(plot.x, 1400 + LOT_ART.plot.x);
    assert.equal(sign.y, 900);
    assert.ok(sign.zIndex > plot.zIndex, 'the sign over its rope');
    assert.equal(sign._worldHitW, Math.ceil(LOT_ART.sign.w));
    assert.ok(engine.fxLayer.children.some((c) => c.label === 'job-indicator-lot'));
    streetJobsFeature.onTick(16, Date.now(), engine);
    assert.equal(streetJobsFeature._state().bubble.lot, 'Project available');
    assert.equal(data.streetJobLot, '694');
  });

  it('talk to, with the item\'s tooltip, opens the hall\'s project panel', () => {
    const target = { classId: LOT_CLASS, featureId: 'street-jobs', sprite: new Display() };
    const verbs = streetJobsFeature.verbsFor(target, engine);
    assert.deepEqual(verbs.map((v) => [v.id, v.label, v.tooltip, v.enabled]), [['talk_to', 'talk to', 'Build a new Group Hall', true]]);
    assert.equal(streetJobsFeature.runVerb(target, 'talk_to', engine), true);
    streetJobsFeature.onTick(16, Date.now(), engine);
    assert.equal(data.streetJobPanel, '694');
  });

  it('beside a street project the spirit gives, the lot gives the hall', async () => {
    await enter(ESTEVAN, [spirit]);
    const st = streetJobsFeature._state();
    assert.equal(st.lot?.jobId, '689');
    assert.equal(st.giver, true, 'job 86 stays with the spirit');
    assert.equal(st.board, false);
  });

  it('a finished hall takes its lot away (quest.js 1838)', async () => {
    await enter(ADDINGFOOT);
    const { state } = streetJobsFeature._state();
    state.jobs['694'] = { phase: 1, got: {}, mine: {}, hired: {}, startedAt: 1, readyAt: 0, doneAt: Date.now(), option: null };
    streetJobsFeature.onTick(16, Date.now(), engine);
    assert.equal(streetJobsFeature._state().lot, null);
    assert.ok(unregistered.some((t) => t.classId === LOT_CLASS), 'its target goes too');
    assert.ok(!engine.entityLayer.children.some((c) => c.label === 'group-hall-lot-plot'));
    await enter(ADDINGFOOT);
    assert.equal(streetJobsFeature._state().lot, null, 'and stays away');
    delete state.jobs['694'];
  });

  it('solo has no halls, so no lot', async () => {
    engine.mode = 'solo';
    streetJobsFeature.restore({}, engine);
    await enter(ADDINGFOOT);
    assert.equal(streetJobsFeature._state().lot, null);
    assert.deepEqual(streetJobsFeature.placementGroups({}, { tsid: ADDINGFOOT }).filter((g) => g.key === LOT_PLACEMENT.key), []);
    engine.mode = 'multiplayer';
  });
});
