/**
 * G1202 (#307): a reload put the player back at an older spot. game.js writes the location entry
 * as the player moves and on the way out (savePlayerLocation, beforeunload, hidden); online the
 * store writes it to the site in the background and hands its last write to the next page of the
 * tab (js/save-claim.js leaveHandoff). A page whose save had stopped (elsewhere, conflict, error,
 * signed out, outdated, held: the tab left open across releases in #307) writes nothing and leaves
 * no handoff, so the reload read the spot of the last write that landed. Glitch kept the location
 * on the server as the player moved, so a reload came back where they stood.
 *
 * Now every spot saved is also left in the tab (leaveSpot), and the next page of the tab starts
 * from it when it is newer than the save's (newerSpot); a spot another window saved since wins.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createMultiplayerSaveStore } from '../public/js/save-store.js?v=1ccb1d6b';
import { SPOT_KEY, leaveSpot, newerSpot, spotSavedAt } from '../public/js/save-claim.js?v=f538f8c7';

const spot = (tsid, x, savedAt) => JSON.stringify({ tsid, x, y: -100, savedAt });

function tabStorage() {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

function pageScope(tab) {
  return {
    sessionStorage: tab,
    document: { documentElement: { dataset: {} }, visibilityState: 'visible', addEventListener() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    addEventListener() {},
    dispatchEvent() { return true; },
  };
}

/** The site: takes the first `ok` writes, then answers 409 elsewhere (another page claimed the save). */
function site(ok = 1) {
  const row = { version: 4, entries: null };
  let n = 0;
  const fn = async (_url, init) => {
    n += 1;
    const body = JSON.parse(init.body);
    if (n > ok) return { ok: false, status: 409, headers: { get: () => null }, json: async () => ({ code: 'groddle_save_elsewhere', data: { version: row.version } }) };
    row.version += 1;
    row.entries = body.data.entries;
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ version: row.version, updatedAt: '2026-11-13T22:58:00Z' }) };
  };
  return { row, fn };
}

const boot = (entries, id = 620) => ({ saveUrl: 'https://groddle.localhost/wp-json/groddle/v1/save', nonce: 'aaaaaaaaaa', version: 4, writer: 'page0page0page01', entries, player: { id, name: 'Tester' } });
const timers = { setTimeout: () => 0, clearTimeout() {} };

describe('G1202 a reload restores the latest spot', () => {
  it('a page whose save stopped still hands its last spot to the reload', async () => {
    const tab = tabStorage();
    const s = site(1);
    const one = createMultiplayerSaveStore({ boot: boot({ playerState: '{"savedAt":5}', location: spot('GTJ102GGGJK1VDO', 100, 1000) }), scope: pageScope(tab), fetch: s.fn, timers });
    one.set('location', spot('GTJ102GGGJK1VDO', 900, 2000));
    await one.flush();
    one.set('location', spot('GTJ102GGGJK1VDO', 3000, 3000));
    await one.flush();
    assert.equal(one.state, 'elsewhere', 'the save stopped');
    one.set('location', spot('GTJ102GGGJK1VDO', 4654, 4000));
    await one.flush();
    assert.equal(JSON.parse(s.row.entries.location).x, 900, 'the site holds an older spot');

    // The reload: the site's copy, and this tab's sessionStorage.
    const two = createMultiplayerSaveStore({ boot: boot({ ...s.row.entries }), scope: pageScope(tab), fetch: site(5).fn, timers });
    assert.equal(JSON.parse(two.get('location')).x, 4654, 'the reload stands where the player stood');
  });

  it('a spot another window saved since wins, and another character never takes this tab\'s', () => {
    const tab = tabStorage();
    assert.equal(leaveSpot({ scope: { sessionStorage: tab }, player: 620, location: spot('A', 10, 4000) }), true);
    assert.equal(newerSpot({ scope: { sessionStorage: tab }, player: 620, location: spot('B', 20, 9000) }), null, 'newer save wins');
    assert.equal(newerSpot({ scope: { sessionStorage: tab }, player: 621, location: spot('B', 20, 1000) }), null, 'another character');
    assert.equal(newerSpot({ scope: { sessionStorage: tab }, player: 620, location: spot('B', 20, 1000) }), spot('A', 10, 4000));
    assert.equal(newerSpot({ scope: { sessionStorage: tab }, player: 620, location: null }), spot('A', 10, 4000), 'a save with no spot');
    const other = createMultiplayerSaveStore({ boot: boot({ location: spot('B', 20, 9000) }), scope: pageScope(tab), fetch: site(5).fn, timers });
    assert.equal(JSON.parse(other.get('location')).tsid, 'B');
  });

  it('nothing to hand on: no sessionStorage, a spot with no time, or words that are not a spot', () => {
    assert.equal(leaveSpot({ scope: {}, player: 1, location: spot('A', 1, 5) }), false);
    assert.equal(leaveSpot({ scope: { sessionStorage: tabStorage() }, player: 1, location: '{"tsid":"A"}' }), false);
    const tab = tabStorage();
    tab.setItem(SPOT_KEY, 'not json');
    assert.equal(newerSpot({ scope: { sessionStorage: tab }, player: 1 }), null);
    assert.equal(spotSavedAt('{"savedAt":"x"}'), 0);
  });
});
