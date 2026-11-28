/**
 * G944: what a home's owner changes at home reaches everyone there, live (audit G941 mismatches
 * M1, M4, M33, M41). Glitch's home street and house were ordinary shared locations (GSJS
 * locations/home.js, players/inc_houses.js; inc_homes.js apiGeometryUpdated to the whole
 * location). The rules are js/home-live.js; the owner's publisher features/home-live-feature.js;
 * the server's relay homes_street.go (TestHomeRefreshCarriesTheOwnersYardAndHome).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  HOME_LIVE_STREET,
  changedHomeKinds,
  homeLivePrints,
  homeRefreshFrames,
  visitGardenPlots,
  visitSceneKey,
} from '../public/js/home-live.js?v=9c7abae7';
import { createHomeLive, homeLiveFeature } from '../public/js/features/home-live-feature.js?v=0020c4eb';
import { YARD_ACT_HOLD_MS, YARD_LINGER_MS, followYardPath, holdYardWalk } from '../public/js/yard-wander.js?v=e6154394';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const clone = (v) => JSON.parse(JSON.stringify(v));

function ownerSave() {
  return {
    systems: {
      home: { owned: true, style: 'meadow', room: 'street', inHome: true },
      features: {
        homes: {
          decor: { storage: { furniture_chair: 2 }, placed: [{ id: 1, classTsid: 'furniture_chair', x: 300 }, { id: 2, classTsid: 'bag_furniture_cabinet', x: 500, contents: [{ classTsid: 'cherry', count: 3 }] }] },
          cult: { items: [{ id: 1, protoClass: 'proto_rock_beryl', rx: 400, wear: 0 }, { id: 2, protoClass: 'proto_crop_garden', rx: 900, wear: 0 }], gardens: { 2: { plots: { 0: { stage: 'crop', crop: 'potato' } } } } },
          streetStyle: 'meadow',
          houseVisits: 3,
          rockImgDay: 'd1',
        },
      },
    },
    world: {
      streets: {
        [HOME_LIVE_STREET]: {
          rocks: [{ chunksRemaining: 40 }],
          features: {
            'resource-nodes': { nodes: { 'peat_1:0': { units: 4 } } },
            patches: { plots: { 'patch:0': { stage: 'dug' } } },
            'animal-husbandry': { animals: [{ id: 'a1', classId: 'npc_piggy', x: 812, state: { petted: 0 } }], sticks: [], machines: [] },
          },
        },
      },
    },
  };
}

describe('G944 M1: the owner\'s own acts on their home street are published', () => {
  it('a rock the owner mined, a node harvested, a Patch dug or an animal petted is a "yard" change', () => {
    const base = homeLivePrints(ownerSave());
    for (const edit of [
      (s) => { s.world.streets[HOME_LIVE_STREET].rocks[0].chunksRemaining = 37; },
      (s) => { s.world.streets[HOME_LIVE_STREET].features['resource-nodes'].nodes['peat_1:0'].units = 3; },
      (s) => { s.world.streets[HOME_LIVE_STREET].features.patches.plots['patch:0'].stage = 'planted'; },
      (s) => { s.world.streets[HOME_LIVE_STREET].features['animal-husbandry'].animals[0].state.petted = 1; },
    ]) {
      const s = ownerSave();
      edit(s);
      assert.deepEqual(changedHomeKinds(base, homeLivePrints(s)), ['yard']);
    }
  });

  it('an animal walking (x every frame) and the owner moving between rooms publish nothing', () => {
    const s = ownerSave();
    s.world.streets[HOME_LIVE_STREET].features['animal-husbandry'].animals[0].x = 1400;
    s.systems.home.room = 'interior';
    s.systems.features.homes.houseVisits = 4;
    assert.deepEqual(changedHomeKinds(homeLivePrints(ownerSave()), homeLivePrints(s)), []);
  });

  it('no home, no prints (a player without a house publishes nothing)', () => {
    const s = ownerSave();
    s.systems.home.owned = false;
    assert.deepEqual(homeLivePrints(s), {});
  });

  it('the publisher writes the save first, then names the change to the server once', async () => {
    const order = [];
    const timers = [];
    const store = { flush: async () => { order.push('flush'); return 'saved'; }, state: 'saved' };
    const client = { state: 'online', send: (t, m) => order.push(`${t}:${m.what}`) };
    const engine = { mode: 'multiplayer', query: (h) => (h === 'realtimeClient' ? client : null) };
    let t = 1000;
    const live = createHomeLive({ store, now: () => t, timers: { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {} } });
    live.saved(ownerSave(), engine);
    const mined = ownerSave();
    mined.world.streets[HOME_LIVE_STREET].rocks[0].chunksRemaining = 30;
    assert.deepEqual(live.saved(mined, engine), ['yard']);
    live.saved(mined, engine); // the same change again: one refresh
    assert.equal(timers.length, 1);
    assert.ok(timers[0].ms <= 300, 'the first refresh after a quiet spell goes at once');
    await live.publish(engine);
    assert.deepEqual(order, ['flush', 'home_refresh:yard']);
    assert.deepEqual(live.state().sent, { yard: 1, home: 0, boxes: 0 });
    // Nothing changed since: nothing more.
    t += 5000;
    assert.deepEqual(live.saved(mined, engine), []);
  });

  it('offline or an unsaved write keeps the change for later; nothing is sent', async () => {
    const sent = [];
    const client = { state: 'offline', send: (t, m) => sent.push(m.what) };
    const engine = { mode: 'multiplayer', query: () => client };
    const live = createHomeLive({ store: { flush: async () => 'saved', state: 'saved' }, timers: { setTimeout: () => 1, clearTimeout() {} } });
    live.saved(ownerSave(), engine);
    const s = ownerSave();
    s.world.streets[HOME_LIVE_STREET].rocks[0].chunksRemaining = 1;
    live.saved(s, engine);
    assert.equal(await live.publish(engine), false);
    assert.deepEqual(sent, []);
    assert.deepEqual(live.state().pending, ['yard']);
  });

  it('solo never publishes (the feature returns before anything)', () => {
    assert.equal(homeLiveFeature.onSaved(ownerSave(), { mode: 'solo', query: () => { throw new Error('asked'); } }), null);
  });

  it('the visitor reads the yard again on "yard" and on "home", my unsent acts first', () => {
    const src = read('public/js/features/yard-verbs-mp-feature.js');
    assert.match(src, /msg:home_refresh[\s\S]{0,200}msg\.what === 'yard' \|\| msg\.what === 'home'\) refreshVisit\(\)/);
    assert.match(src, /async function refreshVisit\(\) \{\n {4}if \(!visit\) return;\n {4}const tsid = visit\.tsid;\n[^\n]*\n {4}scan\(\);/);
  });

  it('game.js hands every changed save to onSaved, after it is set in the store', () => {
    const src = read('public/game.js');
    assert.match(src, /saveStore\.set\(PLAYER_STATE_STORAGE_KEY, serialized\);\n {6}lastSerializedPlayerState = comparable;\n[^\n]*\n {6}features\.collect\('onSaved', save, engine\);/);
  });
});

describe('G944 M4: furniture, decor and cultivations changed mid-visit reach visitors', () => {
  it('a piece moved, a rock cultivated or a style changed is a "home" change; "home" stands for the yard too', () => {
    const base = homeLivePrints(ownerSave());
    const moved = ownerSave();
    moved.systems.features.homes.decor.placed[0].x = 340;
    assert.deepEqual(changedHomeKinds(base, homeLivePrints(moved)), ['home']);
    const planted = ownerSave();
    planted.systems.features.homes.cult.items.push({ id: 3, protoClass: 'proto_rock_metal', rx: 1200, wear: 0 });
    planted.world.streets[HOME_LIVE_STREET].rocks.push({ chunksRemaining: 50 });
    const kinds = changedHomeKinds(base, homeLivePrints(planted));
    assert.deepEqual(kinds, ['yard', 'home']);
    assert.deepEqual(homeRefreshFrames(kinds), ['home']);
  });

  it('private furniture storage is no change visitors see', () => {
    const s = ownerSave();
    s.systems.features.homes.decor.storage.furniture_chair = 5;
    assert.deepEqual(changedHomeKinds(homeLivePrints(ownerSave()), homeLivePrints(s)), []);
  });

  it('the visitor builds the room again only for a new look; crops and wear update in place', () => {
    const view = { home: { owned: true, style: 'meadow' }, homes: clone(ownerSave().systems.features.homes), key: false };
    const crop = clone(view);
    crop.homes.cult.gardens[2].plots[0].stage = 'empty';
    crop.homes.cult.items[0].wear = 4;
    assert.equal(visitSceneKey(crop), visitSceneKey(view));
    assert.equal(visitGardenPlots(crop, 'street', '2')[0].stage, 'empty');
    const moved = clone(view);
    moved.homes.decor.placed[0].x = 10;
    assert.notEqual(visitSceneKey(moved), visitSceneKey(view));
    const grown = clone(view);
    grown.homes.cult.items.push({ id: 9, protoClass: 'proto_rock_metal', rx: 100 });
    assert.notEqual(visitSceneKey(grown), visitSceneKey(view));
  });

  it('the visit rebuilds in place: no loading card, windows kept, the yard drawn afresh', () => {
    const nb = read('public/js/features/neighbours-mp-feature.js');
    assert.match(nb, /msg:home_refresh[\s\S]{0,120}msg\.what === 'home'[\s\S]{0,60}refreshHome\(\)/);
    assert.match(nb, /if \(!fx \|\| quiet\) setup\(\);/);
    assert.match(nb, /keepWindows: quiet/);
    assert.match(read('public/game.js'), /clearWorldEntities\(\{ keepWindows: scene\.keepWindows === true \}\)/);
    // The yard's copy goes with the cleared scene (it used to stay behind a same-street rebuild, drawn nowhere).
    assert.match(read('public/js/features/yard-verbs-mp-feature.js'), /cleared\(\) \{\n[^\n]*\n {6}clearVisit\(\);/);
  });
});

describe('G944 M33: the owner\'s cabinet moves refresh a key-holder\'s open window', () => {
  it('a cabinet\'s contents changing is a "boxes" change only', () => {
    const s = ownerSave();
    s.systems.features.homes.decor.placed[1].contents = [{ classTsid: 'cherry', count: 1 }];
    assert.deepEqual(changedHomeKinds(homeLivePrints(ownerSave()), homeLivePrints(s)), ['boxes']);
    assert.deepEqual(homeRefreshFrames(['boxes']), ['boxes']);
  });

  it('"boxes" reloads an open cabinet window of that owner', () => {
    const src = read('public/js/features/home-storage-feature.js');
    assert.match(src, /win\?\.kind === 'cabinet' && win\.owner === Number\(msg\.owner\)\) refreshVisitCabinet\(engine\)/);
  });
});

describe('G944 M41: a yard animal someone else is using stands still on every page', () => {
  it('holdYardWalk holds the walk for the act and the linger after it', () => {
    const drive = { holdUntil: 0 };
    const now = 1_000_000;
    const until = holdYardWalk(drive, 'npc_piggy', now);
    assert.equal(until, now + YARD_ACT_HOLD_MS + YARD_LINGER_MS.npc_piggy);
    const spr = { x: 500, y: 300, scale: { x: 1 } };
    const at = followYardPath(spr, drive, { animal: { id: 'a1', classId: 'npc_piggy', homeX: 500, worldW: 3000 }, nowMs: now + 1000, groundAt: () => 300 });
    assert.equal(at.moving, false);
    assert.equal(spr.x, 500);
    // A shorter hold never cuts a longer one short.
    assert.equal(holdYardWalk(drive, 'npc_piggy', now - 5000), until);
  });

  it('visitors hold on another player\'s act, the owner holds on a visitor\'s', () => {
    const yard = read('public/js/features/yard-verbs-mp-feature.js');
    assert.match(yard, /if \(a && Number\(msg\.from\?\.id\) !== me\(\)\) holdYardWalk\(a\.drive, a\.classId\);/);
    assert.match(yard, /holdYardAnimal\(act\.target\);/);
    assert.match(read('public/js/features/animal-husbandry-feature.js'), /export function holdYardAnimal\(id, nowMs = Date\.now\(\)\)/);
  });
});
