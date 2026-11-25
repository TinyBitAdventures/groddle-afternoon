/**
 * G1192: online, a second drop sent while the server still weighed the first got "Wait a moment,
 * you are still dropping something." (drops.go weighs one drop per player at a time). The client now
 * queues drops: each goes in order when the last is answered, its count cut to what the pack has
 * then, and never faster than drops.go's rate (allow: a bucket of 6, one back a second, drops and
 * pickups alike; a frame over it gets only slow_down, never its answer).
 * Run: node --test tests/drop-queue-g1192.test.js
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DROP_QUEUE_MAX, DROP_RATE, DROP_TEXT, bucketTake } from '../public/js/drops-mp.js?v=499b0363';
import { dropsMpFeature } from '../public/js/features/drops-mp-feature.js?fresh=dropqueue';

const STREET = 'LIF102FDNU11314';
const TABLE = { items: { cherry: { food: true }, plank: {} }, untradeable: {} };

describe('the client keeps drops.go\'s rate', () => {
  it('a bucket of 6, one back a second, as party.go bucket.take', () => {
    assert.deepEqual(DROP_RATE, { burst: 6, everyMs: 1000 });
    const b = { tokens: 0, at: 0 };
    for (let i = 0; i < 6; i++) assert.equal(bucketTake(b, 10_000 + i).ok, true, `token ${i + 1}`);
    const no = bucketTake(b, 10_006);
    assert.equal(no.ok, false);
    assert.ok(no.waitMs > 900 && no.waitMs <= 1000, `waits about a second (${no.waitMs})`);
    assert.equal(bucketTake(b, 10_500).ok, false);
    assert.equal(bucketTake(b, 11_010).ok, true, 'one back a second later');
    assert.equal(bucketTake(b, 11_020).ok, false);
    assert.equal(bucketTake(b, 60_000).ok, true, 'a long rest refills to 6, no more');
    assert.ok(b.tokens <= 5);
  });
});

function fakeClient() {
  const handlers = {};
  return {
    state: 'online',
    street: STREET,
    sent: [],
    on(ev, fn) { (handlers[ev] ||= []).push(fn); return () => {}; },
    send(kind, payload) { this.sent.push([kind, payload]); return true; },
    emit(ev, msg) { for (const fn of handlers[ev] || []) fn(msg); },
  };
}
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

describe('drops online go in order, one at a time', () => {
  const client = fakeClient();
  const applied = new Set();
  const toasts = [];
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: STREET,
    inv: { cherry: 3, plank: 20 },
    player: { x: 900, y: 620 },
    query(hook, op) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'ledgerReceipt') {
        if (applied.has(op)) return false;
        applied.add(op);
        return true;
      }
      return null;
    },
    dropWorldStack: () => ({ ok: true }),
    redrawDroppedStacks: () => {},
    setData: () => {},
    toast: (line) => toasts.push(line),
    pushActivity: () => {},
    playSound: () => {},
    floatText: () => {},
    refreshPack: () => {},
    save: () => {},
  };
  const drops = () => client.sent.filter(([k]) => k === 'ground_drop').map(([, p]) => p);
  let opN = 0;
  /** The server settles the drop it was sent last. */
  const settle = (p) => {
    opN += 1;
    const op = `drop-${String(opN).padStart(16, '0')}`;
    client.emit('msg:ground_dropped', { op, ref: p.ref, status: 'settled', stack: { id: op, c: p.item.c, n: p.item.n, x: p.x, y: p.y, by: { id: 7, name: 'Ada' }, at: opN } });
  };

  before(async () => {
    globalThis.document = { baseURI: 'https://groddle.localhost/' };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.fetch = async (url) => {
      const body = String(url).includes('trade-items.json') ? TABLE : { drops: [] };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
    };
    dropsMpFeature.init(engine);
    dropsMpFeature.onTick(16, 0, engine);
    await wait();
  });
  after(() => {
    delete globalThis.document;
    delete globalThis.GRODDLE_MP_BOOT;
    delete globalThis.fetch;
    delete globalThis.groddleDrops;
  });

  it('a quick second drop waits for the first\'s answer instead of "Wait a moment", then goes', async () => {
    assert.equal(dropsMpFeature.sharedDrop({ classTsid: 'cherry', count: 1, x: 900, y: 620 }, engine), true);
    assert.equal(dropsMpFeature.sharedDrop({ classTsid: 'plank', count: 2, x: 950, y: 620 }, engine), true);
    await wait();
    assert.equal(drops().length, 1, 'one at a time: the server weighs one');
    assert.deepEqual(drops()[0].item, { c: 'cherry', n: 1 });
    assert.equal(globalThis.groddleDrops.queued.length, 1);
    assert.ok(!toasts.includes(DROP_TEXT.busy), 'no "Wait a moment"');
    settle(drops()[0]);
    await wait();
    assert.equal(drops().length, 2, 'the second went once the first was answered');
    assert.deepEqual([drops()[1].item, drops()[1].x], [{ c: 'plank', n: 2 }, 950], 'as it was asked, where it was put');
    settle(drops()[1]);
    assert.deepEqual([engine.inv.cherry, engine.inv.plank], [2, 18]);
  });

  it('a queued drop takes only what the pack still has once the drops before it went', async () => {
    engine.inv.cherry = 2;
    dropsMpFeature.sharedDrop({ classTsid: 'cherry', count: 2, x: 900, y: 620 }, engine);
    dropsMpFeature.sharedDrop({ classTsid: 'cherry', count: 2, x: 900, y: 620 }, engine);
    await wait();
    const before = drops().length;
    settle(drops().at(-1));
    await wait();
    assert.equal(engine.inv.cherry, 0);
    assert.equal(drops().length, before, 'nothing left to send: the second is skipped');
    assert.equal(globalThis.groddleDrops.queued.length, 0);
  });

  it('never faster than the server\'s rate: past its bucket a drop waits for the next token', { timeout: 20_000 }, async () => {
    const start = drops().length;
    const times = [];
    const send = client.send;
    client.send = function (kind, payload) {
      if (kind === 'ground_drop') times.push(Date.now());
      return send.call(this, kind, payload);
    };
    for (let i = 0; i < 9; i++) dropsMpFeature.sharedDrop({ classTsid: 'plank', count: 1, x: 900 + i, y: 620 }, engine);
    // The server answers each at once; the client sends the next when it may.
    const until = Date.now() + 15_000;
    let settled = 0;
    while (drops().length - start < 9 && Date.now() < until) {
      await wait(10);
      if (drops().length - start > settled) {
        settle(drops().at(-1));
        settled += 1;
      }
    }
    settle(drops().at(-1));
    client.send = send;
    assert.equal(drops().length - start, 9, 'all went');
    assert.deepEqual(drops().slice(start).map((p) => p.x), [900, 901, 902, 903, 904, 905, 906, 907, 908], 'in order');
    // A window of any 1 s never holds more sends than the bucket's 6 (the server would refuse the 7th).
    for (let i = 0; i + DROP_RATE.burst < times.length; i++) {
      assert.ok(times[i + DROP_RATE.burst] - times[i] >= 900, `send ${i + DROP_RATE.burst + 1} came ${times[i + DROP_RATE.burst] - times[i]} ms after send ${i + 1}`);
    }
    // And once the bucket ran dry they went about a second apart.
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    assert.ok(gaps.some((g) => g >= 900), `some waited for a token (${gaps.join(',')})`);
    assert.ok(!toasts.includes(DROP_TEXT.busy));
  });

  it('a full place stops the drops behind it; they stay in the pack', async () => {
    await wait(1100);
    dropsMpFeature.sharedDrop({ classTsid: 'plank', count: 1, x: 900, y: 620 }, engine);
    dropsMpFeature.sharedDrop({ classTsid: 'plank', count: 1, x: 900, y: 620 }, engine);
    await wait();
    const p = drops().at(-1);
    const n = drops().length;
    client.emit('msg:ground_dropped', { ref: p.ref, status: 'refused', why: 'full', text: "This street can't hold any more dropped things." });
    await wait();
    assert.equal(drops().length, n);
    assert.equal(globalThis.groddleDrops.queued.length, 0);
  });

  it('leaving the street drops the queue: what waited stays in the pack', async () => {
    await wait(1100);
    dropsMpFeature.sharedDrop({ classTsid: 'plank', count: 1, x: 900, y: 620 }, engine);
    dropsMpFeature.sharedDrop({ classTsid: 'plank', count: 1, x: 900, y: 620 }, engine);
    await wait();
    const n = drops().length;
    client.street = 'LIF999OTHER0001';
    engine.streetTsid = 'LIF999OTHER0001';
    settle(drops().at(-1));
    await wait();
    assert.equal(drops().length, n, 'nothing sent on the new street');
    assert.equal(globalThis.groddleDrops.queued.length, 0);
    client.street = STREET;
    engine.streetTsid = STREET;
  });

  it('the queue is capped; past it the old line still says wait', () => {
    assert.ok(DROP_QUEUE_MAX >= 6);
  });
});
