/**
 * #157: door keys lie on their streets again (js/door-key-spawns.js, features/door-keys-feature.js).
 * The table covers every keyed door; each spot stands on a floor of its street; solo keys come back
 * 5 minutes after a pickup and never pile up; online the server's key is shared (keys_test.go has
 * the server's rules; here the client against a fake socket and the server's data).
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  KEY_DOORS,
  KEY_RESPAWN_MS,
  KEY_SPAWNS,
  keyBackIn,
  keySpawnsOn,
  keySpotId,
  keySpotIndex,
  normalizeKeySpawnState,
  soloKeyStep,
} from '../public/js/door-key-spawns.js?v=8e6b40bb';
import { doorKeysFeature, resetDoorKeysForTest, sharedKeyStacks } from '../public/js/features/door-keys-feature.js?v=195444bc';
import { createDroppedItemState, dropInventoryStack, listDroppedStacks, pickupDroppedStack } from '../public/js/world-items.js?v=792e1606';
import { isStandable, platformYAt, platformsScreen, streetWidth, streetHeight } from '../public/js/street-model.js?v=b6cb6a4e';
import { doorKeysData } from '../tools/build-realtime-door-keys.mjs';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const streetsDir = join(root, 'public/assets/streets');
const loadStreet = (tsid) => JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));
const locations = join(root, '../streets/mnt/stos/location_data');

/** Every keyed door in the imported streets. */
function keyedDoors() {
  const out = [];
  for (const f of readdirSync(streetsDir)) {
    if (!f.endsWith('.json') || f === 'index.json') continue;
    const s = JSON.parse(readFileSync(join(streetsDir, f), 'utf8'));
    for (const d of s.doors || []) if (d.key_id) out.push({ street: s.tsid, key: d.key_id, to: d.connect?.street || '', hidden: Boolean(d.hidden) });
  }
  return out;
}

afterEach(() => {
  resetDoorKeysForTest();
  mock.restoreAll();
});

describe('the key table', () => {
  it('covers every keyed door, each with a spot that holds its key', () => {
    const doors = keyedDoors();
    assert.equal(doors.length, 32);
    assert.equal(KEY_DOORS.length, doors.length);
    for (const d of doors) {
      const row = KEY_DOORS.find((r) => r.street === d.street && r.key === d.key);
      assert.ok(row, `${d.street} key ${d.key} has no row`);
      if (row.partySpace) {
        assert.equal(d.key, 11, 'only Mazza\'la Gala\'s key lies in its Party Space');
        assert.match(read('public/js/party-spaces.js'), /door_key_11/);
        continue;
      }
      assert.ok(row.from.length, `${d.street} key ${d.key}: no spot`);
      for (const street of row.from) {
        assert.ok(KEY_SPAWNS.some((s) => s.street === street && s.key === d.key), `${d.street} key ${d.key}: ${street} holds no key ${d.key}`);
      }
    }
    // Every spot serves at least one door.
    for (const s of KEY_SPAWNS) {
      assert.ok(KEY_DOORS.some((d) => d.key === s.key && d.from.includes(s.street)), `${s.label} key ${s.key} opens no listed door`);
    }
  });

  it('puts each key on a floor of its street, one spot per key and street', () => {
    const seen = new Set();
    for (const s of KEY_SPAWNS) {
      const id = `${s.street}:${s.key}`;
      assert.ok(!seen.has(id), `two spots for ${id}`);
      seen.add(id);
      const street = loadStreet(s.street);
      assert.equal(street.label, s.label, s.street);
      assert.ok(s.x > 0 && s.x < streetWidth(street) && s.y > 0 && s.y < streetHeight(street) + 80, `${s.label} off the street`);
      const floor = platformsScreen(street).filter((p) => isStandable(p) && s.x >= p.x1 && s.x <= p.x2)
        .map((p) => platformYAt(p, s.x)).find((y) => Math.abs(y - s.y) <= 3);
      assert.ok(floor != null, `${s.label} (${s.x}, ${s.y}) is not on a floor`);
      assert.ok(s.words && s.from, `${s.label}: cite the words and where they come from`);
      assert.ok(KEY_DOORS.length && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12].includes(s.key));
    }
  });

  it('names a spawner of the 2012 location file on each sourced street', { skip: !existsSync(locations) && 'no ../streets location files' }, () => {
    for (const s of KEY_SPAWNS) {
      const file = join(locations, `L${s.street.slice(1)}.xml`);
      const lines = readFileSync(file, 'utf8').split('\n');
      const spawners = lines.map((l, i) => (/label="spawner"/.test(l) ? i + 1 : 0)).filter(Boolean);
      if (s.spawner == null) {
        assert.equal(s.at, 'ours', `${s.label}: no spawner, so the spot is ours`);
        assert.equal(spawners.length, 0, `${s.label} does list a spawner (${spawners})`);
      } else {
        assert.ok(spawners.includes(s.spawner), `${s.label}: line ${s.spawner} is no spawner (${spawners})`);
      }
    }
  });

  it('brings every key back 5 minutes after a pickup (Austin 2026-11-09)', () => {
    assert.equal(KEY_RESPAWN_MS, 300000);
  });

  it('opens every seam street of Explore The Seams with street keys (G461)', () => {
    // locations/location.js 540: the ten seam streets; quests.json asks for 3.
    const seams = ['GDOC74759ST2IG1', 'GDOB5HTH1ID2MTL', 'GCR14T7ECHM18G8', 'GDOHDJ84BST2UI2', 'GTJ1KL16N2O13T2', 'GHVDIELDQQ7228K', 'GTJ1KOM8N2O1EFS', 'GM11E7ODKHO1QJE', 'GCR1516SFHM122V', 'GDOSHD9J6NT2HUJ'];
    const doors = keyedDoors();
    for (const seam of seams) {
      const ways = doors.filter((d) => d.to === seam && !d.hidden);
      assert.ok(ways.length, `${seam}: no keyed door leads there`);
      const open = ways.filter((d) => KEY_DOORS.find((r) => r.street === d.street && r.key === d.key)?.from.length);
      assert.ok(open.length, `${seam}: no door's key lies on a street`);
    }
    const quest = JSON.parse(read('public/assets/content/quests.json')).explore_the_seams;
    assert.match(quest.desc, /Visit 3/);
  });

  it('says in doors.js that keys 7-10 and 12 lay on streets', () => {
    const src = read('public/js/doors.js');
    assert.doesNotMatch(src, /Keys 7-10 and 12 had no source/);
    assert.match(src, /door-key-spawns\.js/);
  });
});

describe('solo: a ground stack that comes back', () => {
  function soloEngine(street) {
    const data = {};
    const engine = {
      mode: 'solo',
      started: true,
      player: { x: 0, y: 0 },
      streetTsid: street,
      droppedItems: createDroppedItemState(),
      drops: 0,
      saves: 0,
      dropWorldStack(cls, n, x, y) {
        this.drops += 1;
        return dropInventoryStack(this.droppedItems, { [cls]: n }, street, cls, n, { x, y }, { merge: false });
      },
      save() { this.saves += 1; },
      setData(k, v) { data[k] = v; },
      param: () => null,
      transientInstance: () => false,
      homeContext: () => ({ inHome: false }),
      data,
    };
    return engine;
  }

  it('keeps the rules: lie, taken, wait, drop', () => {
    assert.equal(soloKeyStep(undefined, { present: false, now: 1 }), 'drop');
    assert.equal(soloKeyStep({ stack: 'world-item-1' }, { present: true, now: 1 }), 'lie');
    assert.equal(soloKeyStep({ stack: 'world-item-1' }, { present: false, now: 1 }), 'taken');
    assert.equal(soloKeyStep({ takenAt: 1000 }, { present: false, now: 1000 + KEY_RESPAWN_MS - 1 }), 'wait');
    assert.equal(soloKeyStep({ takenAt: 1000 }, { present: false, now: 1000 + KEY_RESPAWN_MS }), 'drop');
    assert.equal(keyBackIn({ takenAt: 1000 }, 61000), KEY_RESPAWN_MS - 60000);
    assert.deepEqual(normalizeKeySpawnState({ spots: { 4: { stack: 'world-item-9', takenAt: 0 }, 999: { stack: 'x' }, x: 1 } }), { spots: { 4: { stack: 'world-item-9', takenAt: 0 } } });
  });

  it('puts one key down, comes back 5 minutes after the pickup, never two', () => {
    const street = 'GCR11SBEGQL13D9';
    const [spot] = keySpawnsOn(street);
    let clock = 1_800_000_000_000;
    mock.method(Date, 'now', () => clock);
    const engine = soloEngine(street);
    doorKeysFeature.onStreetEnter({ tsid: street }, engine);
    let tick = 0;
    const step = () => doorKeysFeature.onTick(16, (tick += 1000), engine);
    step();
    let stacks = listDroppedStacks(engine.droppedItems, street);
    assert.equal(stacks.length, 1);
    assert.equal(stacks[0].classTsid, 'door_key_4');
    assert.equal(stacks[0].x, spot.x);
    assert.equal(engine.data.keyMode, 'solo');
    assert.equal(engine.data.keyLast, `drop:${spot.i}`);
    for (let n = 0; n < 5; n++) step();
    assert.equal(listDroppedStacks(engine.droppedItems, street).length, 1, 'no second key while one lies there');

    // Picked up: none until 5 minutes later.
    const inv = {};
    assert.ok(pickupDroppedStack(engine.droppedItems, inv, street, stacks[0].id).ok);
    assert.equal(inv.door_key_4, 1);
    step();
    assert.equal(engine.data.keyLast, `taken:${spot.i}`);
    clock += KEY_RESPAWN_MS - 1000;
    step();
    assert.equal(listDroppedStacks(engine.droppedItems, street).length, 0);
    assert.equal(engine.data.keyBackIn, '1000');
    clock += 1000;
    step();
    stacks = listDroppedStacks(engine.droppedItems, street);
    assert.equal(stacks.length, 1, 'back after 5 minutes');
    assert.equal(engine.drops, 2);

    // Away a long time with the key lying there: still one when the player comes back.
    doorKeysFeature.onStreetClear(engine);
    clock += 60 * 60 * 1000;
    doorKeysFeature.onStreetEnter({ tsid: street }, engine);
    step();
    assert.equal(listDroppedStacks(engine.droppedItems, street).length, 1);
    // The save round trip keeps the spot's stack.
    const saved = JSON.parse(JSON.stringify(doorKeysFeature.save()));
    doorKeysFeature.restore(saved);
    step();
    assert.equal(listDroppedStacks(engine.droppedItems, street).length, 1);
  });

  it('counts a key picked up just before leaving from when it went', () => {
    const street = 'GCR11SBEGQL13D9';
    let clock = 1_800_000_000_000;
    mock.method(Date, 'now', () => clock);
    const engine = soloEngine(street);
    doorKeysFeature.onStreetEnter({ tsid: street }, engine);
    doorKeysFeature.onTick(16, 1000, engine);
    const [stack] = listDroppedStacks(engine.droppedItems, street);
    pickupDroppedStack(engine.droppedItems, {}, street, stack.id);
    doorKeysFeature.onStreetClear(engine);
    assert.ok(doorKeysFeature.save().spots[keySpawnsOn(street)[0].i].takenAt === clock);
    assert.equal(engine.drops, 1, 'leaving puts no key down');
  });

  it('puts nothing down in a private place or in multiplayer', () => {
    const street = 'GCR11SBEGQL13D9';
    const engine = soloEngine(street);
    engine.transientInstance = () => true;
    doorKeysFeature.onStreetEnter({ tsid: street }, engine);
    doorKeysFeature.onTick(16, 1000, engine);
    assert.equal(engine.drops, 0);
    const mp = soloEngine(street);
    mp.mode = 'multiplayer';
    mp.query = () => null;
    doorKeysFeature.onStreetEnter({ tsid: street }, mp);
    doorKeysFeature.onTick(16, 2000, mp);
    assert.equal(mp.drops, 0);
  });
});

describe('multiplayer: one shared key', () => {
  function fakeClient() {
    const handlers = {};
    return {
      state: 'online',
      sent: [],
      on(kind, fn) { (handlers[kind] ||= []).push(fn); return () => {}; },
      send(kind, payload) { this.sent.push([kind, payload]); return true; },
      emit(kind, msg) { for (const fn of handlers[kind] || []) fn(msg); },
    };
  }
  function mpEngine(street, client) {
    const data = {};
    return {
      mode: 'multiplayer',
      started: true,
      player: { x: 400, y: 1263 },
      streetTsid: street,
      inv: {},
      redraws: 0,
      toasts: [],
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      redrawDroppedStacks() { this.redraws += 1; },
      toast(t) { this.toasts.push(t); },
      pushActivity() {},
      floatText() {},
      playSound() {},
      refreshPack() {},
      save() {},
      setData(k, v) { data[k] = v; },
      param: () => null,
      transientInstance: () => false,
      homeContext: () => ({ inHome: false }),
      data,
    };
  }

  it('asks the server, draws what lies there, and takes the key through it', () => {
    const street = 'GCR11SBEGQL13D9';
    const [spot] = keySpawnsOn(street);
    const client = fakeClient();
    const engine = mpEngine(street, client);
    doorKeysFeature.onStreetEnter({ tsid: street }, engine);
    client.emit('roster', { street });
    assert.deepEqual(client.sent.at(-1), ['key_sync', { street }]);
    assert.equal(doorKeysFeature.sharedDroppedStacks(street, engine), null, 'nothing drawn before the answer');

    client.emit('msg:keys', { street, keys: [{ i: spot.i, key: 4, here: true }] });
    const [stack] = doorKeysFeature.sharedDroppedStacks(street, engine);
    assert.equal(stack.id, keySpotId(spot.i));
    assert.equal(stack.classTsid, 'door_key_4');
    assert.equal(stack.shared, true);
    assert.equal(keySpotIndex(stack.id), spot.i);
    assert.equal(engine.data.keyMode, 'shared');
    assert.equal(engine.data.keySpots, '1/1');

    // Pick up asks the server; the pack changes only on its answer.
    assert.equal(doorKeysFeature.sharedPickup({ state: { id: stack.id } }, engine), true);
    assert.deepEqual(client.sent.at(-1), ['key_take', { street, i: spot.i }]);
    assert.equal(engine.inv.door_key_4, undefined);
    client.emit('msg:key_got', { street, i: spot.i, key: 4 });
    assert.equal(engine.inv.door_key_4, 1);
    assert.equal(doorKeysFeature.sharedDroppedStacks(street, engine), null, 'gone once taken');
    assert.equal(engine.data.keyLast, `got:${spot.i}`);
    // A dropped stack of someone's is not ours to pick up.
    assert.equal(doorKeysFeature.sharedPickup({ state: { id: 'drop-00000000000000a1' } }, engine), null);
  });

  it('shows a second player the key go and come back', () => {
    const street = 'GCR11SBEGQL13D9';
    const [spot] = keySpawnsOn(street);
    const client = fakeClient();
    const engine = mpEngine(street, client);
    doorKeysFeature.onStreetEnter({ tsid: street }, engine);
    client.emit('roster', { street });
    client.emit('msg:keys', { street, keys: [{ i: spot.i, key: 4, here: true }] });
    assert.equal(sharedKeyStacks(street).length, 1);
    client.emit('msg:key_taken', { street, i: spot.i, id: 7, name: 'Ada' });
    assert.equal(sharedKeyStacks(street).length, 0);
    assert.equal(engine.data.keyLast, `gone:${spot.i}`);
    // Too late: the server says gone.
    client.emit('msg:key_refused', { street, i: spot.i, why: 'gone' });
    assert.match(engine.toasts.at(-1), /first/);
    client.emit('msg:key_back', { street, i: spot.i });
    assert.equal(sharedKeyStacks(street).length, 1);
    assert.equal(engine.data.keyLast, `back:${spot.i}`);
    assert.ok(engine.redraws >= 3);
  });

  it('asks nothing for a street with no keys and refuses offline', () => {
    const client = fakeClient();
    const engine = mpEngine('GLI2V0UN7RD1T2J', client);
    doorKeysFeature.onStreetEnter({ tsid: 'GLI2V0UN7RD1T2J' }, engine);
    client.emit('roster', { street: 'GLI2V0UN7RD1T2J' });
    assert.equal(client.sent.length, 0);
    const street = 'GCR11SBEGQL13D9';
    const [spot] = keySpawnsOn(street);
    engine.streetTsid = street;
    client.state = 'reconnecting';
    assert.equal(doorKeysFeature.sharedPickup({ state: { id: keySpotId(spot.i) } }, engine), false);
  });
});

describe('wiring', () => {
  it('registers the feature and collects every feature\'s shared stacks', () => {
    const index = read('public/js/features/index.js');
    const at = index.indexOf('doorKeysFeature');
    assert.ok(at > 0 && at < index.indexOf('streetObjectsFeature'));
    assert.match(read('public/game.js'), /features\.collect\('sharedDroppedStacks'/);
  });

  it('writes the server\'s data from the table', { skip: skipWithoutServer }, () => {
    const want = `${JSON.stringify(doorKeysData())}\n`;
    assert.equal(readFileSync(serverPath('data', 'door-keys.json'), 'utf8'), want, 'run node tools/build-realtime-door-keys.mjs');
    assert.equal(doorKeysData().spots.length, KEY_SPAWNS.length);
    assert.equal(doorKeysData().respawn, 300);
  });
});
