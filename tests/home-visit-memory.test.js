/**
 * G1227 (report #644): "all the home streets are treated the same in terms of when you last visited
 * them". A visit's loading card had no memory of its own: every home street, house and Tower floor
 * said "Last here just moments ago" alike. In the original each was its own location, with its own
 * visit history (location.js getLoadingInfo 3157-3159 pols_visited, players/inc_stats.js
 * street_history), so the card counts and times each owner's rooms on their own.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME_VISITS_KEEP, homeVisitKey, homeVisitSeen, normalizeNeighboursSlice } from '../public/js/neighbours-mp.js?v=6d97fefa';
import { polVisitLine } from '../public/js/screen-fx.js?v=7cd62cca';
import { GAME_DIR } from '../tools/repos.mjs';

const MIN = 60000;

describe('each home room remembers its own visits', () => {
  it('keys are per owner and room, a Tower per floor', () => {
    assert.equal(homeVisitKey(7, 'street'), '7:street');
    assert.equal(homeVisitKey(7, 'interior'), '7:interior');
    assert.equal(homeVisitKey(7, 'tower', 3), '7:tower:3');
    assert.equal(homeVisitKey(0, 'street'), '');
    assert.equal(homeVisitKey(7, 'party'), '');
  });

  it('two owners\' home streets, and a house beside its street, each count and time their own', () => {
    const slice = normalizeNeighboursSlice({});
    const t0 = 1_800_000_000_000;
    assert.deepEqual(homeVisitSeen(slice, '7:street', t0), { firstVisit: true, visitCount: 0, lastVisitMins: 0 });
    assert.deepEqual(homeVisitSeen(slice, '9:street', t0 + 5 * MIN), { firstVisit: true, visitCount: 0, lastVisitMins: 0 }, 'another owner\'s street is new');
    assert.deepEqual(homeVisitSeen(slice, '7:interior', t0 + 6 * MIN), { firstVisit: true, visitCount: 0, lastVisitMins: 0 }, 'the house is its own room');
    const again = homeVisitSeen(slice, '7:street', t0 + 60 * MIN);
    assert.deepEqual(again, { firstVisit: false, visitCount: 1, lastVisitMins: 60 });
    assert.equal(polVisitLine(again), 'Last here <b>1 hour ago</b> &#8212; this is your 2nd visit');
    assert.equal(homeVisitSeen(slice, '9:street', t0 + 65 * MIN).lastVisitMins, 60);
  });

  it('is kept with the save, cleaned, and holds the homes most lately visited', () => {
    const raw = { visits: { '7:street': { visits: 3, lastAt: 10 }, bad: { visits: 1, lastAt: 1 }, '8:street': { visits: 0, lastAt: 5 } } };
    assert.deepEqual(normalizeNeighboursSlice(raw).visits, { '7:street': { visits: 3, lastAt: 10 } });
    const slice = normalizeNeighboursSlice({});
    for (let i = 1; i <= HOME_VISITS_KEEP + 5; i += 1) homeVisitSeen(slice, `${i}:street`, i * MIN);
    assert.equal(Object.keys(slice.visits).length, HOME_VISITS_KEEP);
    assert.equal(slice.visits['1:street'], undefined, 'the oldest goes first');
    assert.ok(slice.visits[`${HOME_VISITS_KEEP + 5}:street`]);
  });

  it('the visit\'s loading card shows it, and the slice saves it', () => {
    const src = readFileSync(join(GAME_DIR, 'public/js/features/neighbours-mp-feature.js'), 'utf8');
    assert.match(src, /const seen = quiet \? null : homeVisitSeen\(slice, homeVisitKey\(visit\.owner, room, built\.floor\)\);/);
    assert.match(src, /ownerName: visit\.name, \.\.\.\(seen \? \{ visit: seen \} : \{\}\) \}/);
    assert.match(src, /visits: s\.visits \|\| \{\} \};/);
  });
});
