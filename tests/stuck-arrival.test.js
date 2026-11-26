/**
 * G575 (Austin 2026-11-19): /stuck's "where you arrived" branch never ran. Every trip goes through
 * the loading card, which enters the street quiet, and quiet was read as "no arrival", so /stuck
 * always took the nearest way out. Ruling: a signpost or a door is an arrival, and /stuck goes back
 * to the spot you walked in at on that street; everything else (a resurrection, a home return, a
 * teleport point, a load) takes the nearest way out, as before.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STUCK_ARRIVAL_WAYS, stuckArrivalSpot } from '../public/js/street-arrival.js?v=c7294edc';

const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
const AT = { x: 1726, y: -800 };
const STREET = { x: 900, y: -150 };

describe('G575: /stuck remembers a signpost or door arrival', () => {
  it('a signpost or a door arrival, quiet under the loading card, is where you walked in', () => {
    assert.deepEqual([...STUCK_ARRIVAL_WAYS], ['signpost', 'door']);
    for (const via of ['signpost', 'door']) {
      const spot = stuckArrivalSpot('GA', { arrivalBy: via, spawnX: AT.x, spawnY: AT.y, quiet: true }, { at: AT, street: STREET });
      assert.deepEqual(spot, { tsid: 'GA', ...AT, from: 'arrival' }, via);
    }
  });

  it('a load, a resurrection, a home return, a teleport point or a follow takes the street spot (nearest way out)', () => {
    const others = [
      { quiet: true },
      { spawnX: AT.x, spawnY: AT.y, quiet: true },
      { spawnX: AT.x, spawnY: AT.y },
      { spawnX: AT.x, spawnY: AT.y, arrivalBy: 'teleport' },
      { spawnX: AT.x, spawnY: AT.y, arrivalBy: 'follow' },
      { arrivalBy: 'signpost' },
    ];
    for (const opts of others) {
      assert.deepEqual(stuckArrivalSpot('GA', opts, { at: AT, street: STREET }), { tsid: 'GA', ...STREET, from: 'street' }, JSON.stringify(opts));
    }
  });

  it('game.js: signposts and doors pass their way to the street entry, which records it', () => {
    assert.match(game, /\? \{ spawnX: meta\.arrive\.x, spawnY: meta\.arrive\.y, \.\.\.\(STUCK_ARRIVAL_WAYS\.includes\(meta\.via\) \? \{ arrivalBy: meta\.via \} : \{\}\) \}/);
    assert.match(game, /await enterStreetWithTransition\(plan\.toTsid, arrive\);/);
    // The loading card keeps the trip's options when it enters quiet.
    // R46: through the trip's failure contract (enterStreetOrStay), opts kept and quiet added.
    assert.match(game, /const load = \(extra = \{\}\) => enterStreetOrStay\(tsid, \{ \.\.\.opts, \.\.\.extra \}/);
    assert.match(game, /data = await load\(\{ quiet: true \}\);/);
    assert.match(game, /streetArrival = stuckArrivalSpot\(data\.tsid, opts, \{/);
    assert.doesNotMatch(game, /streetArrival = opts\.quiet/);
    // Every signpost and door path says which it is.
    assert.equal((game.match(/arrive: conn\.arrive, via: 'door' \}\)/g) || []).length, 2);
    assert.match(game, /arrive: plan\.arrive, via: 'signpost' \}\)/);
    // /stuck on that street goes back there; any other entry finds the nearest way out.
    assert.match(game, /let at = streetArrival\?\.tsid === currentStreetTsid \? streetArrival : null;/);
    assert.match(game, /if \(at\.from === 'street'\) \{\n\s+const near = stuckWay\(currentStreet, player\.x,/);
  });
});
