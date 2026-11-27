/**
 * Register G1316 (report #753): online, a Crafty Bot set down at home never fetched from the shared
 * floor. Since G1190 the owner's drops in the house (and since G1313 on every upper floor) lie on
 * the shared floor (the realtime server's drops.go, the site's LedgerDrop), and the bot's source
 * (craftybot-feature locationRows) read only the save's own stacks. Glitch's bot searched the
 * whole location (npc_crafty_bot.js findItem 1885-1932: container.find_items_including_bags) and
 * took what it found there (pickupStack 2555-2600: apiSplit / the stack itself).
 *
 * Austin 2026-11-27: as Glitch, through the same shared pickup players use: the server decides
 * (one taker, the take recorded in the owner's ledger), the stack leaves the floor for everyone
 * (ground_left / ground_gone), and what the bot took sits in its job's holder (saved: the site's
 * LedgerMath::holdings counts it there).
 *
 * The rules wait for the server's answer (craftybot.js pickupStack: take answers -1, the bot waits;
 * fetchAnswered hands it what came, or nothing, and the step runs again).
 *
 * Run: node --test tests/g1316-craftybot-shared-floor.test.js
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  advanceCraftybot,
  createBot,
  createCraftybotState,
  fetchAnswered,
  normalizeCraftybotState,
  serializeCraftybotState,
  setCraftybotSpecs,
  setJobTotal,
} from '../public/js/craftybot.js?v=06550c66';
import { craftybotFeature } from '../public/js/features/craftybot-feature.js?v=8053cbd4';
import { homesFeature } from '../public/js/features/homes-feature.js?v=78d0151e';
import { dropsMpFeature } from '../public/js/features/drops-mp-feature.js?v=a34f5a9b';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'public/assets/content/craftybot-specs.json');

function runUntil(bot, world, from, until, { stepMs = 100, maxMs = 120_000 } = {}) {
  for (let t = from; t <= from + maxMs; t += stepMs) {
    advanceCraftybot(typeof bot === 'function' ? bot() : bot, t, typeof world === 'function' ? world() : world);
    if (until(t)) return t;
  }
  return null;
}

before(() => {
  setCraftybotSpecs(JSON.parse(readFileSync(CATALOG, 'utf8')).specs);
});

describe('the rules: a fetch the server answers later', () => {
  /** A floor where stack `s` is shared: its take is asked, and answers -1 until the server's word. */
  function sharedWorld(stacks, asks) {
    return {
      inLocation: true,
      count: (cls) => stacks.filter((s) => String(cls).split('|').includes(s.cls)).reduce((a, s) => a + s.count, 0),
      find: (cls) => stacks.filter((s) => String(cls).split('|').includes(s.cls) && s.count > 0).sort((a, b) => a.x - b.x)[0] || null,
      take: (id, cls, n) => {
        const s = stacks.find((x) => x.id === id);
        if (!s) return 0;
        if (s.shared) {
          asks.push([id, cls, n]);
          return -1;
        }
        const k = Math.min(n, s.count);
        s.count -= k;
        return k;
      },
      wear: () => ({ broke: false }),
      drop: () => {},
      give: () => {},
      imagination: () => {},
      say: () => {},
      sound: () => {},
      stopSound() {},
      fuelCell: () => stacks.find((s) => s.cls === 'fuel_cell' && s.count > 0) || null,
    };
  }

  it('waits for the answer, holds what came, and finishes the job', () => {
    const stacks = [{ id: 's', cls: 'cherry', count: 5, x: 220, shared: true }, { id: 'm', cls: 'fruit_changing_machine', count: 1, x: 240 }];
    const asks = [];
    const world = sharedWorld(stacks, asks);
    const bot = createBot(createCraftybotState(), 200, 'interior', 0);
    advanceCraftybot(bot, 1500, world);
    setJobTotal(bot, world, 'apple', 1);
    assert.deepEqual(asks, [['s', 'cherry', 3]], 'asked the server for three');
    // Nothing happens while the answer is out: it does not ask again, nor move on.
    runUntil(bot, world, 1500, () => false, { maxMs: 10_000 });
    assert.equal(asks.length, 1);
    assert.equal(bot.queue[0].crafted, 0);
    assert.equal(bot.queue[0].holder.general?.cherry, undefined);
    // The server's answer: three taken.
    stacks[0].count = 2;
    assert.equal(fetchAnswered(bot, world, 's', 3), true);
    assert.equal(bot.queue[0].holder.general.cherry.count, 3);
    assert.ok(runUntil(bot, world, 11_500, () => bot.queue[0].crafted === 1), 'the Apple');
    assert.equal(asks.length, 1, 'never asked twice');
  });

  it('a stack someone else took first: nothing held, and it fetches from the next one', () => {
    const stacks = [{ id: 's', cls: 'cherry', count: 3, x: 210, shared: true }, { id: 'own', cls: 'cherry', count: 3, x: 400 }, { id: 'm', cls: 'fruit_changing_machine', count: 1, x: 240 }];
    const asks = [];
    const world = sharedWorld(stacks, asks);
    const bot = createBot(createCraftybotState(), 200, 'interior', 0);
    advanceCraftybot(bot, 1500, world);
    setJobTotal(bot, world, 'apple', 1);
    assert.equal(asks.length, 1);
    stacks.splice(0, 1); // ground_gone: it is not on the floor any more
    assert.equal(fetchAnswered(bot, world, 's', 0), false);
    assert.equal(bot.queue[0].holder.general?.cherry, undefined);
    assert.ok(runUntil(bot, world, 1500, () => bot.queue[0].crafted === 1), 'made from the other stack');
    assert.equal(stacks.find((s) => s.id === 'own').count, 0);
  });

  it('an answer for another stack, or after it stopped waiting, holds nothing (the feature puts it in the pack)', () => {
    const stacks = [{ id: 's', cls: 'cherry', count: 3, x: 210, shared: true }, { id: 'm', cls: 'fruit_changing_machine', count: 1, x: 240 }];
    const world = sharedWorld(stacks, []);
    const bot = createBot(createCraftybotState(), 200, 'interior', 0);
    advanceCraftybot(bot, 1500, world);
    setJobTotal(bot, world, 'apple', 1);
    assert.equal(fetchAnswered(bot, world, 'other', 3), false);
    assert.equal(fetchAnswered(bot, world, 's', 0), false);
    assert.equal(fetchAnswered(bot, world, 's', 3), false, 'no longer waiting');
    assert.equal(bot.queue[0].holder.general?.cherry, undefined);
  });

  it('a reload while waiting runs the step again (the answer, if any, comes to the pack through the site\'s list)', () => {
    const stacks = [{ id: 's', cls: 'cherry', count: 3, x: 210, shared: true }, { id: 'm', cls: 'fruit_changing_machine', count: 1, x: 240 }];
    const asks = [];
    const world = sharedWorld(stacks, asks);
    const bot = createBot(createCraftybotState(), 200, 'interior', 0);
    advanceCraftybot(bot, 1500, world);
    setJobTotal(bot, world, 'apple', 1);
    const back = normalizeCraftybotState(serializeCraftybotState(bot));
    assert.equal(back.awaiting, null, 'the ask does not survive the page');
    runUntil(back, world, 1500, () => asks.length === 2, { maxMs: 5000 });
    assert.equal(asks.length, 2, 'asked again after the reload');
  });

  it('a Fuel Cell on the shared floor: Add More walks there and the cell fills the tank when it comes', async () => {
    const { autoRefuel } = await import('../public/js/craftybot.js?v=06550c66');
    const stacks = [{ id: 'f', cls: 'fuel_cell', count: 2, x: 230, shared: true }];
    const asks = [];
    const world = sharedWorld(stacks, asks);
    const bot = createBot(createCraftybotState(), 200, 'interior', 0);
    bot.fuel = 100;
    advanceCraftybot(bot, 1500, world);
    assert.equal(autoRefuel(bot, world), true);
    assert.deepEqual(asks, [['f', 'fuel_cell', 1]]);
    assert.equal(bot.fuel, 100, 'not before the answer');
    assert.equal(fetchAnswered(bot, world, 'f', 1), true);
    assert.equal(bot.fuel, 600);
  });
});

/** A realtime client as the feature sees it (js/realtime-client.js on/send). */
function fakeClient(street) {
  const handlers = {};
  return {
    state: 'online',
    street,
    me: { id: 7, name: 'Ada' },
    sent: [],
    on(ev, fn) { (handlers[ev] ||= []).push(fn); return () => {}; },
    send(kind, payload) { this.sent.push([kind, payload]); return true; },
    emit(ev, msg) { for (const fn of handlers[ev] || []) fn(msg); },
  };
}

describe('the feature online: the owner\'s bot in the house takes from the shared floor', () => {
  const OP = 'drop-00000000000000b1';
  const OP2 = 'drop-00000000000000b2';
  const OP3 = 'drop-00000000000000b3';
  const HOUSE_X = 640; // homeDropOrigin houseX: the server keeps x from the house
  const client = fakeClient('HOUSE_7');
  const applied = new Set();
  const counts = { saves: 0 };
  const features = [dropsMpFeature, craftybotFeature, homesFeature];
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'RH_HOME_INT',
    dropTsid: 'RH_HOME_INT',
    inv: {},
    pc: { xp: 0, imagination: 0 },
    toolState: {},
    groundY: 620,
    droppedItems: { version: 1, nextId: 10, streets: {} },
    learnedSkills: [],
    questState: { completed: [] },
    unlockedAchievements: [],
    player: { x: 700, y: 620 },
    param: () => null,
    homeContext: () => ({ inHome: true, owned: true }),
    query(hook, ...args) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'ledgerReceipt') {
        if (applied.has(args[0])) return false;
        applied.add(args[0]);
        return true;
      }
      if (hook === 'homeDropOrigin') return { owner: 7, room: 'interior', floor: 0, houseX: HOUSE_X, own: true };
      for (const f of features) {
        const out = typeof f[hook] === 'function' ? f[hook](...args) : null;
        if (out != null) return out;
      }
      return null;
    },
    collect(hook, ...args) {
      const out = [];
      for (const f of features) {
        const rows = typeof f[hook] === 'function' ? f[hook](...args) : null;
        if (Array.isArray(rows)) out.push(...rows);
      }
      return out;
    },
    save() { counts.saves += 1; },
    refreshPack() {},
    refreshHomeScene() {},
    droppedItemsChanged() {},
    redrawDroppedStacks() {},
    setData() {},
    toast() {},
    pushActivity() {},
    playSound() {},
    floatText() {},
    say() {},
  };
  const bot = () => craftybotFeature._state().bot;
  const world = () => craftybotFeature._world(engine);
  const shown = () => dropsMpFeature.sharedDroppedStacks('RH_HOME_INT', engine) || [];
  const tick = () => new Promise((r) => setTimeout(r, 5));

  before(() => {
    globalThis.document = { baseURI: 'https://groddle.localhost/', hidden: true };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.fetch = async (url) => {
      const u = String(url);
      const body = u.includes('trade-items.json') ? { items: { cherry: {}, fuel_cell: {} }, untradeable: {} } : u.includes('groddle/v1/drops') ? { drops: [] } : {};
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
    };
    homesFeature.restore({});
    dropsMpFeature.init(engine);
    dropsMpFeature.onTick(16, 0, engine);
  });
  after(() => {
    homesFeature.restore({});
    delete globalThis.document;
    delete globalThis.GRODDLE_MP_BOOT;
    delete globalThis.fetch;
    delete globalThis.groddleDrops;
  });

  /** A fresh bot by the machine (the owner's own stack, on their shelf of the save) at x 760. */
  function freshBot() {
    craftybotFeature.restore({ owned: true, where: 'interior', x: 700, clock: 1000 });
    engine.droppedItems.streets.RH_HOME_INT = [{ id: 'world-item-3', streetTsid: 'RH_HOME_INT', classTsid: 'fruit_changing_machine', count: 1, x: 760, y: 620 }];
    advanceCraftybot(bot(), 2500, world());
  }

  it('sees a shared floor stack where it lies, as the owner sees it', () => {
    client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: [{ id: OP, c: 'cherry', n: 5, x: 100, y: 620, by: { id: 7, name: 'Ada' } }] });
    freshBot();
    assert.equal(world().count('cherry'), 5);
    assert.deepEqual(world().find('cherry'), { id: OP, cls: 'cherry', x: 100 + HOUSE_X });
  });

  it('takes three through the shared pickup: the server is asked, the pack never holds them, the bot does', async () => {
    const saves = counts.saves;
    setJobTotal(bot(), world(), 'apple', 1);
    assert.deepEqual(client.sent.at(-1), ['ground_pickup', { id: OP, n: 3, ox: HOUSE_X }]);
    assert.equal(bot().queue[0].holder.general?.cherry, undefined, 'nothing until the server says');
    // The server's answer to the owner, then its word to everyone on the floor.
    client.emit('msg:ground_taken', { t: 'ground_taken', op: `${OP}-t5`, id: OP, status: 'settled', item: { c: 'cherry', n: 3 } });
    client.emit('msg:ground_left', { street: 'HOUSE_7', id: OP, n: 2, by: { id: 7, name: 'Ada' } });
    assert.ok(applied.has(`${OP}-t5`), 'the take is applied once through the ledger receipt');
    assert.equal(engine.inv.cherry, undefined, 'not in the pack');
    assert.equal(bot().queue[0].holder.general.cherry.count, 3, 'in the bot\'s job');
    assert.ok(counts.saves > saves, 'and saved');
    assert.equal(shown()[0].count, 2, 'the rest stays on the floor for everyone');
    assert.ok(runUntil(bot, world, 2500, () => bot().queue[0].crafted === 1), 'the Apple');
    // The same answer again (a resend) moves nothing.
    client.emit('msg:ground_taken', { t: 'ground_taken', op: `${OP}-t5`, id: OP, status: 'settled', item: { c: 'cherry', n: 3 } });
    assert.equal(engine.inv.cherry, undefined);
    await tick();
  });

  it('a whole stack taken leaves the shared floor for everyone', () => {
    client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: [{ id: OP2, c: 'cherry', n: 3, x: 80, y: 620, by: { id: 9, name: 'Bo' } }] });
    freshBot();
    setJobTotal(bot(), world(), 'apple', 1);
    assert.deepEqual(client.sent.at(-1), ['ground_pickup', { id: OP2, ox: HOUSE_X }], 'the whole stack: no count');
    client.emit('msg:ground_taken', { t: 'ground_taken', op: `${OP2}-t`, id: OP2, status: 'settled', item: { c: 'cherry', n: 3 } });
    client.emit('msg:ground_gone', { id: OP2, by: { id: 7, name: 'Ada' }, why: 'picked' });
    assert.deepEqual(shown(), [], 'gone from the floor');
    assert.equal(world().count('cherry'), 0);
    assert.equal(bot().queue[0].holder.general.cherry.count, 3);
    assert.ok(runUntil(bot, world, 2500, () => bot().queue[0].crafted === 1));
    assert.equal(engine.inv.cherry, undefined);
  });

  it('beaten to it by another player: nothing moves, and it does not keep asking for that stack', () => {
    client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: [{ id: OP3, c: 'cherry', n: 3, x: 90, y: 620, by: { id: 9, name: 'Bo' } }] });
    freshBot();
    const before = client.sent.length;
    setJobTotal(bot(), world(), 'apple', 1);
    assert.equal(client.sent.length, before + 1);
    client.emit('msg:ground_taken', { t: 'ground_taken', id: OP3, status: 'refused', why: 'gone', text: 'Someone else picked that up.' });
    client.emit('msg:ground_gone', { id: OP3, by: { id: 9, name: 'Bo' }, why: 'picked' });
    assert.equal(bot().queue[0].holder.general?.cherry, undefined);
    assert.equal(engine.inv.cherry, undefined);
    runUntil(bot, world, 2500, () => false, { maxMs: 20_000, stepMs: 500 });
    assert.equal(client.sent.length, before + 1, 'asked once');
    assert.ok(Object.keys(bot().timers).length > 0 || bot().craftState === 'idle', 'not stuck mid-step');
  });

  it('a stack still being dropped, or a floor drawn while the window waits on Play here, is not the bot\'s', () => {
    client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: [{ id: OP, c: 'cherry', n: 5, x: 100, y: 620, by: { id: 7, name: 'Ada' } }] });
    freshBot();
    assert.equal(world().count('cherry'), 5);
    client.state = 'replaced';
    client.emit('state', { state: 'replaced' });
    assert.ok(shown().length > 0, 'the last floor seen stays drawn (#733)');
    assert.equal(world().count('cherry'), 0, 'but the bot cannot take from it');
    client.state = 'online';
    client.emit('state', { state: 'online' });
  });
});
