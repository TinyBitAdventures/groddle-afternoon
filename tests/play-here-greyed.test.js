/**
 * #733 follow-up (Austin, 2026-11-27): while a window waits on Play here (another window took over,
 * 'replaced', or it slept, 'asleep': js/online-request.js PLAY_HERE_STATES), what cannot act looked
 * usable. A shared tree's, rock's, animal's, Patch's, garden's or floor stack's verb was offered as
 * ever and only refused after it was picked ("You need to be online to do that."), and the emote
 * buttons sent to a socket that was gone.
 *
 * Now, in those states only:
 * - the verb menu greys each verb a feature would refuse now (verbRefusedNow), with that line as its
 *   reason (game.js playHereVerbs); a floor stack's Pick up answers verbRefusedNow too (drops-mp);
 * - the emotes (and a phone's Hi) are greyed with a tip that points at Play here
 *   (realtime-feature greyForPlayHere), and Play here is drawn as the drawer's accent button.
 * Glitch asked for a reload after a long silence (NetController.as disconnectHandler 596-603), so
 * nothing could be pressed meanwhile.
 * Run: node --test tests/play-here-greyed.test.js
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFeatureHost } from '../public/js/feature-host.js?v=b87e2cbc';
import { createDroppedItemState } from '../public/js/world-items.js?v=93313aad';
import { OFFLINE_LINE, PLAY_HERE_STATES } from '../public/js/online-request.js?v=5fa7a635';
import { PLAY_HERE_STATES as DROPS_PLAY_HERE, dropsMpFeature } from '../public/js/features/drops-mp-feature.js?fresh=play-here-greyed';
import { PLAY_HERE_TIP, greyForPlayHere } from '../public/js/features/realtime-feature.js?v=f50700da';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const game = read('public/game.js');

describe('one list of Play here states', () => {
  it('online-request.js holds it; drops-mp and boards-mp read it', () => {
    assert.deepEqual([...PLAY_HERE_STATES].sort(), ['asleep', 'replaced']);
    assert.equal(DROPS_PLAY_HERE, PLAY_HERE_STATES);
    assert.doesNotMatch(read('public/js/features/boards-mp-feature.js'), /new Set\(\['asleep', 'replaced'\]\)/);
    assert.match(game, /import \{ PLAY_HERE_STATES \} from '\.\/js\/online-request\.js/);
  });
});

describe('the verb menu greys what a feature would refuse (game.js playHereVerbs)', () => {
  const body = game.match(/function playHereVerbs\(target, verbs\) \{([\s\S]*?)\n\}/)[1];
  const run = (state, refuse) => new Function('features', 'engine', 'PLAY_HERE_STATES', 'target', 'verbs', body)(
    { query: (hook, ...a) => (hook === 'realtimeClient' ? { state } : hook === 'verbRefusedNow' ? refuse(...a) : null) },
    {}, PLAY_HERE_STATES, { classId: 'trant_bean' },
    [{ id: 'harvest', label: 'Harvest', enabled: true }, { id: 'look', label: 'Look', enabled: true }, { id: 'water', label: 'Water', enabled: false, reason: 'Needs a can' }],
  );
  const refuse = (target, id) => (id === 'harvest' ? OFFLINE_LINE : null);

  for (const state of ['asleep', 'replaced']) {
    it(`${state}: a shared verb is greyed with the refusal; a local verb and an already greyed one are left`, () => {
      const [harvest, look, water] = run(state, refuse);
      assert.equal(harvest.enabled, false);
      assert.equal(harvest.reason, OFFLINE_LINE);
      assert.equal(look.enabled, true);
      assert.equal(water.reason, 'Needs a can');
    });
  }

  it('online, connecting, solo: nothing changes (a verb is still refused when picked, as before)', () => {
    for (const state of ['online', 'connecting', 'offline', undefined]) assert.equal(run(state, refuse)[0].enabled, true, String(state));
  });

  it('menuVerbsFor ends in it', () => {
    assert.match(game, /return playHereVerbs\(target, verbs\);\n\}/);
  });
});

describe('a floor stack\'s Pick up answers verbRefusedNow (drops-mp)', () => {
  const handlers = {};
  const client = {
    state: 'online', street: 'HOUSE_7', sent: [],
    on(ev, fn) { (handlers[ev] ||= []).push(fn); return () => {}; },
    send(kind, payload) { this.sent.push([kind, payload]); return true; },
    emit(ev, msg) { for (const fn of handlers[ev] || []) fn(msg); },
  };
  const STACK = { id: 'drop-00000000000000a1', c: 'apple', n: 3, x: 300, y: 620, by: { id: 7, name: 'Owner' }, at: 1 };
  let host;
  const engine = {
    mode: 'multiplayer', started: true, streetTsid: 'RH_HOME_INT', dropTsid: 'RH_HOME_INT',
    inv: {}, player: { x: 200, y: 680 }, droppedItems: createDroppedItemState({ streets: {} }),
    query(hook, ...args) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'homeDropOrigin') return { owner: 7, room: 'interior', floor: 0, houseX: 0, own: true };
      return host.query(hook, ...args);
    },
    collect: () => [], redrawDroppedStacks: () => {}, setData: () => {}, toast: () => {}, pushActivity: () => {},
    playSound: () => {}, floatText: () => {}, refreshPack: () => {}, save: () => {}, dropWorldStack: () => ({ ok: true }),
  };
  before(async () => {
    globalThis.document = { baseURI: 'https://groddle.localhost/' };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.fetch = async (url) => {
      const body = String(url).includes('trade-items.json') ? { items: { apple: { max: 40 } }, untradeable: {} } : { drops: [] };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
    };
    host = createFeatureHost([dropsMpFeature]);
    dropsMpFeature.init(engine);
    dropsMpFeature.onTick(16, 0, engine);
    await new Promise((r) => setTimeout(r, 30));
    client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: [STACK] });
  });
  after(() => {
    delete globalThis.document;
    delete globalThis.GRODDLE_MP_BOOT;
    delete globalThis.fetch;
    delete globalThis.groddleDrops;
  });

  it('online: not refused; asleep: "You need to be online to do that."; never for another verb or a local item', () => {
    const target = { worldItemId: STACK.id };
    assert.equal(host.query('verbRefusedNow', target, 'pickup', engine), null);
    client.street = '';
    client.state = 'asleep';
    client.emit('state', { state: 'asleep' });
    assert.equal(host.query('verbRefusedNow', target, 'pickup', engine), OFFLINE_LINE);
    assert.equal(host.query('verbRefusedNow', target, 'look', engine), null);
    assert.equal(host.query('verbRefusedNow', { worldItemId: 'world-item-1' }, 'pickup', engine), null, "the save's own floor item");
  });
});

describe('the emotes while the window waits on Play here (realtime-feature greyForPlayHere)', () => {
  const button = (title = null) => {
    const attrs = new Map(title ? [['title', title]] : []);
    return { disabled: false, dataset: {}, getAttribute: (k) => attrs.get(k) ?? null, setAttribute: (k, v) => attrs.set(k, String(v)), removeAttribute: (k) => attrs.delete(k) };
  };

  it('asleep or replaced: greyed with a tip naming Play here; online again: each tip back', () => {
    const happy = button();
    const hi = button('Say hi (key 5)');
    for (const state of ['asleep', 'replaced']) {
      assert.equal(greyForPlayHere([happy, hi], state), true);
      assert.equal(happy.disabled, true);
      assert.equal(hi.getAttribute('title'), PLAY_HERE_TIP);
      assert.match(PLAY_HERE_TIP, /Play here/);
      greyForPlayHere([happy, hi], 'online');
      assert.equal(happy.disabled, false);
      assert.equal(happy.getAttribute('title'), null);
      assert.equal(hi.getAttribute('title'), 'Say hi (key 5)');
    }
    // A short drop reconnects by itself: the emotes are not greyed for it.
    greyForPlayHere([happy], 'offline');
    assert.equal(happy.disabled, false);
  });

  it('publish greys them, and Play here is the drawer\'s accent button', () => {
    const src = read('public/js/features/realtime-feature.js');
    assert.match(src, /hereBtn\.hidden = !PLAY_HERE_STATES\.has\(s\);\n\s*greyForPlayHere\(emoteRow\.querySelectorAll\('button'\), s\);/);
    assert.match(src, /\.social-status-slot \[data-realtime-play-here\] \{[^}]*background: var\(--accent\);/);
    assert.match(src, /\.mp-emotes button:disabled \{[^}]*cursor: not-allowed;/);
  });
});
