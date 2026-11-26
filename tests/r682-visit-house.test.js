// #682: a visitor saw the house the owner's region style moved to, not the owner's own house.
// The site sends the owner's house (Neighbours::homeHouse); normalizeHomeView dropped it, so
// visitorHomeState fell back to HOUSE_FROM_HOME_STYLE. Glitch drew the owner's chassis and config
// on their home street (inc_homes.js 2464, 2478-2501).
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHomeView } from '../public/js/neighbours-mp.js?v=f43b50c8';
import { visitorHomeState } from '../public/js/features/homes-feature.js?v=c571ad49';

const answer = (house) => ({ owner: { id: 7, name: 'Owner' }, home: { owned: true, style: 'uralia', house }, homes: {}, key: false, pass: { token: 't' } });

it("keeps the owner's house through the visit answer", () => {
  const view = normalizeHomeView(answer({ chassis: 'shipwreck', config: { door: 2, mast: 3 }, facingRight: true }));
  assert.deepEqual(view.home.house, { chassis: 'shipwreck', config: { door: 2, mast: 3 }, facingRight: true });
  const house = visitorHomeState(view).house;
  assert.equal(house.chassis, 'shipwreck');
  assert.equal(house.config.door, 2);
  assert.equal(house.facingRight, true);
});

it('a site or save with no house still shows the house the style moved to', () => {
  for (const sent of [undefined, null, 'cottage', { chassis: 'Not A House' }, []]) {
    const view = normalizeHomeView(answer(sent));
    assert.equal(view.home.house, null);
    assert.equal(visitorHomeState(view).house.chassis, 'hominid');
  }
});

it('an unknown chassis name passes the shape check and falls back in visitorHomeState', () => {
  const view = normalizeHomeView(answer({ chassis: 'castle', config: { x: 'y' } }));
  assert.deepEqual(view.home.house, { chassis: 'castle', config: {}, facingRight: false });
  assert.equal(visitorHomeState(view).house.chassis, 'hominid');
});
