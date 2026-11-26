/**
 * R50 (G1224, report #655): one accessor for a place's ground stacks. v0.59.0's shared house floors
 * (G1190) moved what is dropped in a house or on a Tower floor online from the owner's save to the
 * realtime server; Decoration Mode, stacking and the owner's own tools kept reading only the save,
 * so nothing dropped since could be set on a shelf or join an older stack.
 *
 * - js/ground-stacks.js reads both stores: the save's own rows and the stacks the features share.
 * - Decoration Mode (homes-feature) selects and moves both. Moving a shared stack claims it
 *   (drops-mp-feature claimSharedStack): the server's first pickup has it whole and the site's answer
 *   sets it down in the owner's save where it was moved, locked to them as house_lock locked what the
 *   owner set on furniture (GameServerJS takeable.js 33-36, 179-198), joining a like stack (#593).
 *   It never passes through the pack; an answer applied twice, or one that came through the site's
 *   list instead, makes nothing twice and loses nothing.
 * - No module reads the save's store (engine.droppedItems) but js/ground-stacks.js.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { groundKey, groundStacks, ownGroundPlaces, ownGroundRows, ownGroundState, pruneOwnGround, sharedGroundStacks } from '../public/js/ground-stacks.js?v=22792362';
import { createDroppedItemState, setDownStack } from '../public/js/world-items.js?v=93313aad';
import { dropsMpFeature } from '../public/js/features/drops-mp-feature.js?fresh=groundstacks';
import { homeLivePrints, changedHomeKinds } from '../public/js/home-live.js?v=9c7abae7';
import { GAME_DIR } from '../tools/repos.mjs';

const OP = 'drop-00000000000000d1';
const OP2 = 'drop-00000000000000d2';
const OP3 = 'drop-00000000000000d3';
const TABLE = { items: { cherry: { food: true }, honey: {}, emblem_alph: {} }, untradeable: {} };

describe('the accessor', () => {
  it('reads the save\'s own rows live, and the stacks every feature shares, each marked', () => {
    const state = createDroppedItemState({ streets: { RH_HOME_INT: [{ id: 'world-item-1', classTsid: 'honey', count: 3, x: 900, y: 620 }] } });
    const engine = {
      dropTsid: 'RH_HOME_INT',
      streetTsid: 'RH_HOME_INT',
      droppedItems: state,
      collect: (hook, tsid) => (hook === 'sharedDroppedStacks' && tsid === 'RH_HOME_INT' ? [{ id: OP, classTsid: 'honey', count: 48, x: 950, y: 620, shared: true }, { id: 'k', classTsid: 'door_key', count: 1, x: 1, y: 1 }] : []),
    };
    assert.equal(groundKey(engine), 'RH_HOME_INT');
    assert.equal(ownGroundState(engine), state);
    assert.equal(ownGroundRows(engine), state.streets.RH_HOME_INT, 'the live array');
    assert.deepEqual(ownGroundRows(engine, 'NOWHERE'), []);
    assert.deepEqual(groundStacks(engine).map((s) => [s.id, s.shared === true]), [['world-item-1', false], [OP, true], ['k', true]]);
    assert.equal(sharedGroundStacks(engine).length, 2);
    assert.deepEqual(Object.keys(ownGroundPlaces(engine)), ['RH_HOME_INT']);
    state.streets.RH_HOME_INT[0].count = 0;
    assert.equal(pruneOwnGround(engine), true);
    assert.equal(state.streets.RH_HOME_INT, undefined, 'an emptied place goes');
    assert.deepEqual(groundStacks({}), []);
  });

  it('a stack from no pack is set down on a surface, or joins the like stack named', () => {
    const state = createDroppedItemState({ streets: { RH_HOME_INT: [{ id: 'world-item-1', classTsid: 'honey', count: 3, x: 900, y: 400, on: 4 }] } });
    const joined = setDownStack(state, 'RH_HOME_INT', 'honey', 30, { x: 905, y: 400 }, { on: 4, into: 'world-item-1', now: 5 });
    assert.deepEqual(joined, { ok: true, id: 'world-item-1', count: 30, merged: true });
    assert.equal(state.streets.RH_HOME_INT.length, 1);
    assert.equal(state.streets.RH_HOME_INT[0].count, 33);
    const alone = setDownStack(state, 'RH_HOME_INT', 'emblem_alph', 2, { x: 600, y: 300 }, { on: 7, into: 'world-item-1' });
    assert.equal(alone.merged, false, 'an unlike stack named does not take it');
    assert.equal(state.streets.RH_HOME_INT.find((r) => r.id === alone.id).on, 7);
    assert.equal(setDownStack(state, 'RH_HOME_INT', 'honey', 0, {}).ok, false);
  });
});

/** A realtime client as the feature sees it (js/realtime-client.js on/send). */
function fakeClient() {
  const handlers = {};
  return {
    state: 'online',
    street: 'HOUSE_7',
    sent: [],
    on(ev, fn) { (handlers[ev] ||= []).push(fn); return () => {}; },
    send(kind, payload) { this.sent.push([kind, payload]); return true; },
    emit(ev, msg) { for (const fn of handlers[ev] || []) fn(msg); },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 30));
const stack = (id, c, n, x) => ({ id, c, n, x, y: 620, by: { id: 9, name: 'Bo' }, at: 1 });

describe('Decoration Mode at the owner\'s own house online', () => {
  const client = fakeClient();
  const applied = new Set();
  let origin = { owner: 7, room: 'interior', floor: 0, houseX: 750, own: true };
  const claimed = [];
  let siteDrops = [];
  const state = createDroppedItemState({ streets: { RH_HOME_INT: [{ id: 'world-item-1', classTsid: 'honey', count: 3, x: 1000, y: 400, on: 4 }] } });
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'RH_HOME_INT',
    dropTsid: 'RH_HOME_INT',
    inv: { cherry: 1 },
    player: { x: 900, y: 620 },
    droppedItems: state,
    query(hook, a) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'homeDropOrigin') return origin;
      if (hook === 'homeStackClaimed') claimed.push(a);
      if (hook === 'ledgerReceipt') {
        if (applied.has(a)) return false;
        applied.add(a);
        return true;
      }
      return null;
    },
    collect(hook, tsid) {
      return hook === 'sharedDroppedStacks' ? dropsMpFeature.sharedDroppedStacks(tsid, engine) || [] : [];
    },
    placeOwnStack(tsid, c, n, opts) {
      if (tsid === 'BROKEN') return { ok: false, reason: 'invalid' };
      return setDownStack(state, tsid, c, n, { x: opts.x, y: opts.y }, opts);
    },
    redrawDroppedStacks: () => {},
    setData: () => {},
    toast: () => {},
    pushActivity: () => {},
    playSound: () => {},
    floatText: () => {},
    refreshPack: () => {},
    save: () => {},
  };
  const packCount = () => Object.values(engine.inv).reduce((a, b) => a + b, 0);
  const groundCount = (c) => groundStacks(engine).filter((s) => s.classTsid === c).reduce((a, s) => a + s.count, 0);

  before(async () => {
    globalThis.document = { baseURI: 'https://groddle.localhost/' };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.fetch = async (url) => {
      const body = String(url).includes('trade-items.json') ? TABLE : { drops: siteDrops };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
    };
    dropsMpFeature.init(engine);
    dropsMpFeature.onTick(16, 0, engine);
    await tick();
    client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: [stack(OP, 'honey', 30, 300), stack(OP2, 'emblem_alph', 12, 500), stack(OP3, 'cherry', 2, 600)] });
  });
  after(() => {
    delete globalThis.document;
    delete globalThis.GRODDLE_MP_BOOT;
    delete globalThis.fetch;
    delete globalThis.groddleDrops;
  });

  it('every stack on the floor is there to select: the older one in the save and the ones dropped since', () => {
    const all = groundStacks(engine);
    assert.deepEqual(all.map((s) => [s.id, s.shared === true]), [['world-item-1', false], [OP, true], [OP2, true], [OP3, true]]);
    assert.equal(all.find((s) => s.id === OP).x, 1050, 'drawn from the house\'s left end, as Decoration Mode hits it');
  });

  it('moving the 30 honey onto the shelf\'s older honey asks the server for all of it, and the save does not change yet', () => {
    const res = dropsMpFeature.claimSharedStack(OP, { tsid: 'RH_HOME_INT', x: 1004, y: 400, on: 4, into: 'world-item-1' }, engine);
    assert.deepEqual(res, { ok: true });
    assert.deepEqual(client.sent.at(-1), ['ground_pickup', { id: OP, ox: 750 }], 'the whole stack: no count');
    assert.equal(state.streets.RH_HOME_INT[0].count, 3);
    assert.equal(dropsMpFeature.claimSharedStack(OP, { tsid: 'RH_HOME_INT', x: 1, y: 1 }, engine).reason, 'busy', 'already on its way to the shelf');
    assert.equal(client.sent.filter(([k]) => k === 'ground_pickup').length, 1, 'one pickup at a time');
  });

  it('the site\'s answer stacks it with the older honey in the save, locked to the owner, never through the pack', async () => {
    const pack = packCount();
    client.emit('msg:ground_gone', { id: OP, by: { id: 7, name: 'Ada' }, why: 'picked' });
    client.emit('msg:ground_taken', { op: `${OP}-t`, id: OP, status: 'settled', item: { c: 'honey', n: 30 } });
    assert.equal(packCount(), pack, 'the pack never held it');
    assert.deepEqual(state.streets.RH_HOME_INT.map((r) => [r.id, r.classTsid, r.count, r.on]), [['world-item-1', 'honey', 33, 4]]);
    assert.equal(groundCount('honey'), 33, 'once');
    assert.deepEqual(claimed, ['world-item-1']);
    // The same answer again, or the site's list on the next connect, applies nothing more.
    client.emit('msg:ground_taken', { op: `${OP}-t`, id: OP, status: 'settled', item: { c: 'honey', n: 30 } });
    siteDrops = [{ op: `${OP}-t`, id: OP, item: { c: 'honey', n: 30 } }];
    await globalThis.groddleDrops.sync();
    assert.equal(groundCount('honey'), 33);
    assert.equal(engine.inv.honey, undefined);
  });

  it('an emblem stack set on a table alone becomes the owner\'s own decor there', () => {
    dropsMpFeature.claimSharedStack(OP2, { tsid: 'RH_HOME_INT', x: 820, y: 500, on: 3, into: null }, engine);
    client.emit('msg:ground_taken', { op: `${OP2}-t`, id: OP2, status: 'settled', item: { c: 'emblem_alph', n: 12 } });
    const row = state.streets.RH_HOME_INT.find((r) => r.classTsid === 'emblem_alph');
    assert.deepEqual([row.count, row.x, row.y, row.on, row.decor], [12, 820, 500, 3, true]);
    assert.equal(groundStacks(engine).find((s) => s.id === row.id).shared, undefined, 'in the save, so drawn as decor');
  });

  it('a refused claim (someone else took it first) leaves everything where it was', () => {
    const before = JSON.stringify(state);
    dropsMpFeature.claimSharedStack(OP3, { tsid: 'RH_HOME_INT', x: 820, y: 620 }, engine);
    client.emit('msg:ground_taken', { op: `${OP3}-t`, id: OP3, status: 'refused', why: 'gone', text: 'That stack has already been picked up.' });
    assert.equal(JSON.stringify(state), before);
    assert.equal(claimed.at(-1), null);
  });

  it('a claim whose spot can no longer take it lands in the pack instead: nothing is lost', () => {
    client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: [stack(OP3, 'cherry', 2, 600)] });
    dropsMpFeature.claimSharedStack(OP3, { tsid: 'BROKEN', x: 820, y: 620 }, engine);
    client.emit('msg:ground_taken', { op: `${OP3}-t`, id: OP3, status: 'settled', item: { c: 'cherry', n: 2 } });
    assert.equal(engine.inv.cherry, 3);
  });

  it('only at the owner\'s own home, and only a stack the server shares', () => {
    client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: [stack(OP3, 'cherry', 2, 600)] });
    assert.equal(dropsMpFeature.claimSharedStack('world-item-1', { tsid: 'RH_HOME_INT', x: 1, y: 1 }, engine), null, 'the save\'s own moves as before');
    origin = { owner: 7, room: 'interior', floor: 0, houseX: 750, own: false };
    assert.equal(dropsMpFeature.claimSharedStack(OP3, { tsid: 'RH_HOME_INT', x: 1, y: 1 }, engine).reason, 'place', 'a visitor claims nothing');
  });
});

describe('visitors hear of the owner\'s decor stacks changing', () => {
  it('the owner\'s own stacks in the house and Tower are part of what "home" prints', () => {
    const save = { systems: { home: { owned: true }, features: { homes: {} } } };
    const a = homeLivePrints(save, { RH_HOME_INT: [{ id: 'world-item-1', classTsid: 'honey', count: 3, x: 1, y: 2, on: 4 }] });
    const b = homeLivePrints(save, { RH_HOME_INT: [{ id: 'world-item-1', classTsid: 'honey', count: 51, x: 1, y: 2, on: 4 }] });
    assert.deepEqual(changedHomeKinds(a, b), ['home']);
    const c = homeLivePrints(save, { RH_HOME_EXT: [{ id: 'w', classTsid: 'honey', count: 9, x: 1, y: 2 }] });
    assert.deepEqual(changedHomeKinds(homeLivePrints(save, {}), c), [], 'the street\'s stacks are not the house\'s');
  });
});

describe('nothing reads the save\'s floor store but js/ground-stacks.js', () => {
  /** Every .js under public/ (the game's own code, not vendored libraries). */
  function files(dir, out = []) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (!['vendor', 'node_modules', 'assets'].includes(name)) files(p, out);
      } else if (name.endsWith('.js')) out.push(p);
    }
    return out;
  }

  it('engine.droppedItems is read only through the accessor', () => {
    const allowed = new Set(['public/js/ground-stacks.js']);
    const bad = [];
    for (const p of files(join(GAME_DIR, 'public'))) {
      const rel = relative(GAME_DIR, p).split('\\').join('/');
      if (allowed.has(rel)) continue;
      const lines = readFileSync(p, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        if (/^\s*\*/.test(code)) return;
        if (/(\.|\?\.)droppedItems\b|\{[^}]*\bdroppedItems\b[^}]*\}\s*=\s*engine|\[['"]droppedItems['"]\]/.test(code)) bad.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    assert.deepEqual(bad, [], 'read a place\'s ground stacks through js/ground-stacks.js (R50)');
  });

  it('Decoration Mode selects from every stack on the floor, and claims a shared one it moves', () => {
    const src = readFileSync(join(GAME_DIR, 'public/js/features/homes-feature.js'), 'utf8');
    // #728: a shared stack under the floor is lifted onto it, still read through groundStacks.
    assert.match(src, /function roomStacks\(engine\) \{[\s\S]{0,400}?return groundStacks\(engine\)[.;]/);
    assert.match(src, /function stackAt\(engine, p\) \{\n\s+const rows = roomStacks\(engine\);/);
    assert.match(src, /function stackRow\(engine, id\) \{\n\s+return roomStacks\(engine\)/);
    assert.match(src, /if \(row\.shared\) return claimShared\(engine, row, target, into\);/);
    // As Glitch, the floor is everyone's: only furniture takes a shared stack as the owner's decor; along
    // the floor the server moves it and it stays shared (tests/floor-merge.test.js).
    assert.match(src, /function claimShared\(engine, row, target, into\) \{[\s\S]{0,400}if \(target\.on == null\) return moveSharedOnFloor\(engine, row, target\);/);
  });
});
