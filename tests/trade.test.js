/**
 * Multiplayer trading (phase 4), the game side: js/trade.js (offers, the
 * hold, the done, the window's lines) and js/features/trade-feature.js (off
 * in solo, wired before realtime, the escrow flow against a fake client).
 * The server's rules are trade_test.go in groddle-afternoon-server (the
 * checks that read it skip without it, tools/repos.mjs); the table is
 * tools/build-realtime-trade.mjs.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  TRADE_SLOTS,
  TRADE_TEXT,
  addToGoods,
  backedBy,
  changeLines,
  completeLine,
  holdDelta,
  holdFor,
  normalizeGoods,
  normalizeSlice,
  returnedLine,
  setSlot,
  settleDone,
  tradeCommand,
  untradeableReason,
} from '../public/js/trade.js?v=g335-1';
import { tradeFeature } from '../public/js/features/trade-feature.js?v=pspace-2';
import { FEATURES } from '../public/js/features/index.js';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';
import { GSJS } from '../tools/build-realtime-trade.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const readServer = (rel) => readFileSync(serverPath(rel), 'utf8');
const skipWithoutGsjs = !existsSync(join(GSJS, 'items')) && `needs tinyspeck/glitch-GameServerJS at ${GSJS}`;
const table = JSON.parse(read('public/assets/content/trade-items.json'));

describe('trade table (tools/build-realtime-trade.mjs)', () => {
  it('is current (node tools/build-realtime-trade.mjs, from GSJS)', { skip: skipWithoutServer || skipWithoutGsjs }, () => {
    execFileSync(process.execPath, ['tools/build-realtime-trade.mjs', '--check'], { cwd: root });
  });

  it('the server and the client read the same file', { skip: skipWithoutServer }, () => {
    assert.equal(readServer('data/trade.json'), read('public/assets/content/trade-items.json'));
  });

  it('keeps the source rules', () => {
    assert.equal(table.slots, 6);
    assert.equal(TRADE_SLOTS, 6); // TradeDialog.as:50
    assert.deepEqual(table.items.apple, { max: 100, name: 'Apple', plural: 'Apples' }); // items/apple.js stackmax
    assert.equal(table.items.pick.max, 1);
    assert.equal(table.untradeable.play_cube, 'soulbound'); // items/play_cube.js:121-140
    assert.equal(table.untradeable.greeter_twig, 'soulbound');
    assert.equal(table.untradeable.artifact_bee_key, 'no_trade');
    assert.equal(untradeableReason('apple', table), '');
    assert.equal(untradeableReason('play_cube', table), "That item is locked to you, and can't be traded.");
    assert.equal(untradeableReason('artifact_bee_key', table), "You can't trade this item!");
    assert.equal(untradeableReason('made_up_thing', table), "You can't trade this item!");
  });
});

describe('trade rules (js/trade.js)', () => {
  it('fills slots one stack at a time, six at most', () => {
    let { goods, added } = addToGoods({ items: [], currants: 0 }, 'apple', 150, table);
    assert.equal(added, 150);
    assert.deepEqual(goods.items, [{ c: 'apple', n: 100 }, { c: 'apple', n: 50 }]);
    ({ goods } = addToGoods(goods, 'apple', 30, table));
    assert.deepEqual(goods.items, [{ c: 'apple', n: 100 }, { c: 'apple', n: 80 }]);
    ({ goods } = addToGoods(goods, 'pick', 5, table, { tool: 40 }));
    assert.equal(goods.items.length, 6);
    assert.deepEqual(goods.items[2], { c: 'pick', n: 1, r: 40 });
    const full = addToGoods(goods, 'cherry', 1, table);
    assert.equal(full.added, 0);
    assert.equal(full.reason, TRADE_TEXT.full);
    assert.equal(addToGoods(goods, 'play_cube', 1, table).reason, TRADE_TEXT.soulbound);
    assert.deepEqual(setSlot({ items: [{ c: 'apple', n: 5 }], currants: 0 }, 0, 500, table).items, [{ c: 'apple', n: 100 }]);
    assert.deepEqual(setSlot({ items: [{ c: 'apple', n: 5 }], currants: 0 }, 0, 0, table).items, []);
  });

  it('checks an offer against the pack and what is already held', () => {
    const goods = { items: [{ c: 'apple', n: 10 }], currants: 30 };
    assert.equal(backedBy(goods, { apple: 10 }, 30, null), '');
    assert.equal(backedBy(goods, { apple: 4 }, 30, { items: { apple: 6 }, currants: 0 }), '');
    assert.equal(backedBy(goods, { apple: 4 }, 30, null), TRADE_TEXT.notEnough);
    assert.equal(backedBy(goods, { apple: 10 }, 10, { items: {}, currants: 5 }), TRADE_TEXT.notEnoughCurrants);
  });

  it('holds the most any live offer asks for', () => {
    const a = { items: [{ c: 'apple', n: 10 }], currants: 5 };
    const b = { items: [{ c: 'apple', n: 4 }, { c: 'pick', n: 1 }], currants: 20 };
    assert.deepEqual(holdFor([a, b]), { items: { apple: 10, pick: 1 }, currants: 20 });
    assert.deepEqual(holdDelta({ items: { apple: 10 }, currants: 20 }, { items: { apple: 4, pick: 1 }, currants: 0 }), { items: { apple: -6, pick: 1 }, currants: -20 });
  });

  it('settles a done: the hold minus what was given comes back, what was got goes in', () => {
    const hold = { items: { apple: 150, pick: 2 }, currants: 30 };
    const done = { gave: { items: [{ c: 'apple', n: 100 }, { c: 'pick', n: 1, r: 40 }], currants: 20 }, got: { items: [{ c: 'cherry', n: 7 }, { c: 'hatchet', n: 1, r: 12 }], currants: 5 } };
    assert.deepEqual(settleDone(hold, done), { pack: { apple: 50, pick: 1, cherry: 7, hatchet: 1 }, currants: 15, tools: [{ c: 'hatchet', r: 12 }] });
    // No hold (a save from before it): what was given still leaves the pack, so nothing is made twice.
    assert.deepEqual(settleDone(null, done).pack, { apple: -100, pick: -1, cherry: 7, hatchet: 1 });
    // Nothing given, nothing held: just what was got.
    assert.deepEqual(settleDone(null, { gave: { items: [], currants: 0 }, got: { items: [], currants: 9 } }), { pack: {}, currants: 9, tools: [] });
  });

  it('writes the trade window lines as TradeDialog.as does', () => {
    const was = { items: [{ c: 'apple', n: 1 }, { c: 'pick', n: 1 }], currants: 50 };
    const now = { items: [{ c: 'apple', n: 3 }, { c: 'cherry', n: 1 }], currants: 60 };
    assert.deepEqual(changeLines('Bo', was, now, table), [
      'Bo changed the amount from 1 to 3 Apples',
      'Bo removed 1 Pick',
      'Bo added 1 Cherry',
      'Bo changed the amount from 50 to 60 currants',
    ]);
    assert.deepEqual(changeLines('You', { items: [], currants: 0 }, { items: [], currants: 1 }, table), ['You added 1 currant']);
    assert.deepEqual(changeLines('You', { items: [], currants: 9 }, { items: [], currants: 0 }, table), ['You removed all of the currants']);
    assert.equal(completeLine('Bo', now, { items: [], currants: 0 }, table), 'You traded Bo 3 Apples, 1 Cherry, 60 currants for nothing at all');
    assert.equal(completeLine('Bo', { items: [{ c: 'apple', n: 1 }], currants: 0 }, { items: [], currants: 1 }, table), 'You traded Bo 1 Apple for 1 currant');
    assert.equal(returnedLine({ apple: 3 }, table), 'Your 3 Apples has been returned to you.');
    assert.equal(returnedLine({ apple: 3, pick: 1, cherry: 2 }, table), 'Your 3 Apples, 1 Pick and 2 Cherries have been returned to you.');
    assert.equal(returnedLine({}, table), '');
  });

  it('parses /trade and the saved slice', () => {
    assert.deepEqual(tradeCommand('/trade  Ada  Lovelace '), { kind: 'start', name: 'Ada Lovelace' });
    assert.deepEqual(tradeCommand('/TRADE'), { kind: 'usage' });
    assert.equal(tradeCommand('/traded'), null);
    assert.equal(tradeCommand('hi /trade Bo'), null);
    const s = normalizeSlice({ hold: { trade: 'abc-1', with: { id: 2, name: 'Bo' }, items: { apple: 3, bad: -1, x: 'y' }, currants: 7 }, applied: ['abc-0', 5] });
    assert.deepEqual(s, { hold: { trade: 'abc-1', with: { id: 2, name: 'Bo' }, items: { apple: 3 }, currants: 7 }, applied: ['abc-0'] });
    assert.equal(normalizeSlice({ hold: { trade: 'BAD ID', items: { apple: 1 } } }).hold, null);
    assert.deepEqual(normalizeGoods({ items: [{ c: 'apple', n: 2.7 }, { c: '', n: 1 }, { c: 'pick', n: 1, r: -2 }], currants: -4 }), { items: [{ c: 'apple', n: 2 }, { c: 'pick', n: 1 }], currants: 0 });
  });

  it('keeps the source copy, with no em-dashes', () => {
    assert.equal(TRADE_TEXT.verb, 'Offer to Trade');
    assert.equal(TRADE_TEXT.offer, 'Looks good. Make offer...');
    assert.equal(TRADE_TEXT.confirm, 'Confirm the trade');
    assert.equal(TRADE_TEXT.sealedTitle, 'The deal was sealed!');
    assert.equal(TRADE_TEXT.canceled('Bo'), 'Bo canceled their trade with you.');
    for (const v of Object.values(TRADE_TEXT)) {
      const s = typeof v === 'function' ? v('Bo') : v;
      assert.doesNotMatch(s, /—/);
    }
  });

  it('says the refusals the way the server does', { skip: skipWithoutServer }, () => {
    const go = readServer('trade.go');
    for (const s of [TRADE_TEXT.unsettled, TRADE_TEXT.busySelf, TRADE_TEXT.cantTrade, TRADE_TEXT.soulbound]) assert.ok(go.includes(JSON.stringify(s)), s);
  });
});

// —— The feature against a fake DOM and a fake realtime client ——

class FakeEl {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attrs = {};
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this.hidden = false;
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.scrollTop = 0;
    this.scrollHeight = 0;
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === 'hidden') this.hidden = true;
    if (k === 'value') this.value = String(v);
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
  }
  append(...kids) { this.children.push(...kids); }
  replaceChildren(...kids) { this.children = kids; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type, e = {}) { for (const fn of this.listeners[type] || []) fn({ preventDefault() {}, ...e }); }
  all() { return [this, ...this.children.flatMap((c) => (c instanceof FakeEl ? c.all() : []))]; }
  find(attr, value) { return this.all().find((n) => attr in n.attrs && (value === undefined || n.attrs[attr] === String(value))); }
}

function fakeClient() {
  const listeners = new Map();
  const sent = [];
  return {
    state: 'online',
    me: { id: 1, name: 'Ada' },
    sent,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(type, payload) { for (const fn of listeners.get(type) || []) fn(payload); },
    msg(m) { this.emit(`msg:${m.t}`, m); },
    send(kind, payload = {}) { sent.push({ t: kind, ...payload }); return this.state === 'online'; },
    take(kind) { const out = sent.filter((m) => m.t === kind); sent.length = 0; return out; },
  };
}

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('trade feature (js/features/trade-feature.js)', () => {
  const saved = {};
  let body;
  let client;
  let engine;
  let saves = 0;
  const events = [];

  before(() => {
    for (const k of ['document', 'fetch', 'groddleTrade']) saved[k] = globalThis[k];
    body = new FakeEl('body');
    globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body };
    globalThis.fetch = async () => ({ ok: true, json: async () => table });
    client = fakeClient();
    engine = {
      mode: 'multiplayer',
      started: true,
      inv: { apple: 20, cherry: 0, pick: 1, artifact_bee_key: 1 },
      pc: { currants: 100 },
      toolState: { condition: { pick: { remaining: 40, broken: false, uses: 60, repairs: 0 } } },
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      targetVerbs: () => [{ id: 'party_invite', label: 'Invite to Party' }],
      save: () => { saves += 1; },
      setData: (k, v) => { engine.data[k] = v; },
      data: {},
      toast: (t) => events.push(`toast:${t}`),
      prompt: (p) => events.push(`prompt:${p.text}`),
      pushActivity: (t) => events.push(`activity:${t}`),
      achievement: (c, n) => events.push(`achievement:${c}:${n}`),
      updateHud() {},
      playSound() {},
    };
    tradeFeature.init(engine);
    tradeFeature.restore(undefined, engine);
    tradeFeature.onTick(16, 0, engine);
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('adds Offer to Trade to another player\'s menu and starts a trade', () => {
    const verbs = tradeFeature.verbOverride({ classId: 'pc_remote', featureId: 'party', playerId: 2, label: 'Bo' }, engine);
    assert.deepEqual(verbs.map((v) => v.label), ['Invite to Party', 'Offer to Trade']);
    assert.equal(tradeFeature.verbOverride({ classId: 'npc_piggy' }, engine), null);
    assert.equal(tradeFeature.runVerbOverride({ classId: 'pc_remote', playerId: 2 }, 'trade_start', engine), true);
    assert.deepEqual(client.take('trade_start'), [{ t: 'trade_start', id: 2 }]);
    assert.equal(tradeFeature.chatCommand('/trade Bo', engine), true);
    assert.deepEqual(client.take('trade_start'), [{ t: 'trade_start', name: 'Bo' }]);
  });

  it('holds what it offers, saved before the offer goes out, and gives back what an answered offer drops', async () => {
    const s = globalThis.groddleTrade;
    client.msg({ t: 'trade_open', trade: 'k1-1', with: { id: 2, name: 'Bo' }, by: 1 });
    client.msg({ t: 'trade_state', trade: 'k1-1', mine: { v: 0, items: [], currants: 0, accepted: false }, theirs: { v: 0, items: [], currants: 0, accepted: false } });
    await wait(5);
    assert.equal(engine.data.tradeState, 'open');
    assert.ok(s.lines().includes('You and Bo have begun a trade.'));
    s.addFromPack('artifact_bee_key');
    assert.equal(s.lines().at(-1), "You can't trade this item!");
    s.addFromPack('apple');
    s.editDraft({ items: [{ c: 'apple', n: 12 }], currants: 30 });
    await wait(300);
    const before = saves;
    const [offer] = client.take('trade_offer');
    assert.deepEqual(offer, { t: 'trade_offer', trade: 'k1-1', v: 1, items: [{ c: 'apple', n: 12 }], currants: 30 });
    assert.ok(before > 0, 'the save was written before the offer');
    assert.deepEqual(s.hold.items, { apple: 12 });
    assert.equal(s.hold.currants, 30);
    assert.equal(engine.inv.apple, 8);
    assert.equal(engine.pc.currants, 70);
    // Fewer apples: the hold keeps 12 until the server answers v2.
    s.editDraft({ items: [{ c: 'apple', n: 5 }], currants: 30 });
    await wait(300);
    assert.equal(client.take('trade_offer')[0].v, 2);
    assert.equal(s.hold.items.apple, 12);
    client.msg({ t: 'trade_state', trade: 'k1-1', mine: { v: 1, items: [{ c: 'apple', n: 12 }], currants: 30, accepted: false }, theirs: { v: 0, items: [], currants: 0, accepted: false } });
    assert.equal(s.hold.items.apple, 12, 'v2 is still in flight');
    client.msg({ t: 'trade_state', trade: 'k1-1', mine: { v: 2, items: [{ c: 'apple', n: 5 }], currants: 30, accepted: false }, theirs: { v: 3, items: [{ c: 'cherry', n: 7 }], currants: 0, accepted: false } });
    assert.equal(s.hold.items.apple, 5);
    assert.equal(engine.inv.apple, 15);
    assert.ok(s.lines().includes('Bo added 7 Cherries'));
    assert.ok(s.lines().includes('You changed the amount from 12 to 5 Apples'));
  });

  it('accepts what it saw, and a done moves exactly the listed goods once', async () => {
    const s = globalThis.groddleTrade;
    s.accept();
    assert.deepEqual(client.take('trade_accept'), [{ t: 'trade_accept', trade: 'k1-1', mine: 2, seen: 3 }]);
    client.msg({ t: 'trade_state', trade: 'k1-1', mine: { v: 2, items: [{ c: 'apple', n: 5 }], currants: 30, accepted: true }, theirs: { v: 3, items: [{ c: 'cherry', n: 7 }], currants: 0, accepted: false } });
    assert.equal(engine.data.tradeState, 'locked');
    assert.ok(s.lines().includes('You confirmed the offer'));
    const done = { t: 'trade_done', trade: 'k1-1', with: { id: 2, name: 'Bo' }, gave: { items: [{ c: 'apple', n: 5 }], currants: 30 }, got: { items: [{ c: 'cherry', n: 7 }, { c: 'pick', n: 1, r: 10 }], currants: 0 } };
    client.msg(done);
    await wait(5);
    assert.deepEqual(client.take('trade_ack'), [{ t: 'trade_ack', trade: 'k1-1' }]);
    assert.equal(engine.inv.apple, 15);
    assert.equal(engine.inv.cherry, 7);
    assert.equal(engine.inv.pick, 2);
    assert.equal(engine.toolState.condition.pick.remaining, 10, 'the more worn pick wins');
    assert.equal(engine.pc.currants, 70);
    assert.equal(s.hold, null);
    assert.deepEqual(s.applied, ['k1-1']);
    assert.equal(engine.data.tradeState, 'sealed');
    assert.ok(events.includes('activity:You traded Bo 5 Apples, 30 currants for 7 Cherries, 1 Pick'));
    assert.ok(events.includes('achievement:players_traded:2:1'));
    // The same done again (a reconnect before the ack landed): acked, not applied twice.
    client.msg(done);
    await wait(5);
    assert.equal(client.take('trade_ack').length, 1);
    assert.equal(engine.inv.cherry, 7);
    assert.deepEqual(tradeFeature.save(), { hold: null, applied: ['k1-1'] });
  });

  it('a cancel returns the hold, and a reconnect with a hold asks the server', async () => {
    const s = globalThis.groddleTrade;
    s.close();
    client.msg({ t: 'trade_open', trade: 'k1-2', with: { id: 2, name: 'Bo' }, by: 2 });
    s.editDraft({ items: [{ c: 'apple', n: 4 }], currants: 0 });
    await wait(300);
    client.take('trade_offer');
    assert.equal(engine.inv.apple, 11);
    // The page reloads: the hold is in the save, the socket says hello, the client asks.
    client.emit('hello', { id: 1, name: 'Ada' });
    assert.equal(engine.data.tradeState, 'none');
    assert.deepEqual(client.take('trade_check'), [{ t: 'trade_check', trade: 'k1-2' }]);
    client.msg({ t: 'trade_void', trade: 'k1-2' });
    assert.equal(engine.inv.apple, 15);
    assert.equal(s.hold, null);
    assert.ok(events.includes('prompt:Your 4 Apples has been returned to you.'));
    // Cancelled by the other player: their name, Oh well.
    client.msg({ t: 'trade_open', trade: 'k1-3', with: { id: 2, name: 'Bo' }, by: 2 });
    s.editDraft({ items: [{ c: 'apple', n: 2 }], currants: 5 });
    await wait(300);
    client.msg({ t: 'trade_cancel', trade: 'k1-3', by: { id: 2, name: 'Bo' } });
    assert.ok(events.includes('prompt:Bo canceled their trade with you.'));
    assert.equal(engine.inv.apple, 15);
    assert.equal(engine.pc.currants, 70);
    assert.equal(engine.data.tradeState, 'none');
  });

  it('a refused offer gives back what only it asked for', async () => {
    const s = globalThis.groddleTrade;
    client.take('trade_offer');
    client.msg({ t: 'trade_open', trade: 'k1-4', with: { id: 2, name: 'Bo' }, by: 2 });
    s.editDraft({ items: [{ c: 'apple', n: 3 }], currants: 0 });
    await wait(300);
    const [o] = client.take('trade_offer');
    client.msg({ t: 'trade_state', trade: 'k1-4', rejected: o.v, mine: { v: 0, items: [], currants: 0, accepted: false }, theirs: { v: 0, items: [], currants: 0, accepted: false } });
    assert.deepEqual(s.hold.items, {});
    assert.equal(engine.inv.apple, 15);
    s.cancel();
    assert.equal(client.take('trade_cancel').length, 1);
    client.msg({ t: 'trade_cancel', trade: 'k1-4' });
    assert.equal(s.hold, null);
  });
});

describe('trade feature wiring', () => {
  it('does nothing in solo', () => {
    const solo = { mode: 'solo', started: true, query: () => { throw new Error('solo asked for the realtime client'); } };
    assert.equal(tradeFeature.chatCommand('/trade Bo', solo), null);
    tradeFeature.restore({ hold: { trade: 'a-1', items: { apple: 1 } } }, solo);
    assert.equal(tradeFeature.save(), undefined, 'solo saves carry no trade slice');
  });

  it('is registered before realtime', () => {
    const ids = FEATURES.map((f) => f.id);
    assert.ok(ids.indexOf('trade') >= 0 && ids.indexOf('trade') < ids.indexOf('realtime'));
  });

  it('speaks only kinds the server\'s trade.go handles, and hears what it sends', { skip: skipWithoutServer }, () => {
    const go = readServer('trade.go');
    const header = go.slice(0, go.indexOf('import ('));
    const feature = read('public/js/features/trade-feature.js');
    const sent = [...feature.matchAll(/client\.send\('([a-z_]+)'/g)].map((m) => m[1]);
    const heard = [...feature.matchAll(/client\.on\('msg:([a-z_]+)'/g)].map((m) => m[1]);
    assert.ok(new Set(sent).size >= 7 && new Set(heard).size >= 6);
    for (const kind of new Set([...sent, ...heard])) assert.match(header, new RegExp(`"t":"${kind}"`), kind);
    for (const kind of new Set(sent)) assert.match(go, new RegExp(`r\\.Handle\\("${kind}"`), kind);
  });
});
