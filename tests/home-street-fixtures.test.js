/**
 * Lane HOMEMAIL: the Mail Dispatcher stood on the friends' signpost on the online home
 * street ("it's right on my Signpost"). The fixtures (js/home-street-fixtures.js) and the
 * dispatcher's usual spot keep every one of them apart, at any yard width and house style.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME_LIMITS } from '../public/js/homes-catalog.js?v=7aa9beb0';
import {
  createCultivationState,
  cultivateDemoYard,
  dispatcherRx,
  footprint,
  homeStreetLayout,
  placementCheck,
} from '../public/js/home-cultivation.js?v=11616085';
import {
  DISPATCHER_HALF,
  SIGNPOST,
  dispatcherDefaultRx,
  dispatcherFits,
  signpostX,
  streetFixtures,
} from '../public/js/home-street-fixtures.js?v=badcb725';
import { HOUSE_STYLE_KEYS, houseFixtureX, homesFeature } from '../public/js/features/homes-feature.js?v=c68a24c0';

const root = join(import.meta.dirname, '..', 'public', 'js');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const maxLeft = HOME_LIMITS.MAX_FRONTYARD_LEFT_SEGMENTS - HOME_LIMITS.START_FRONTYARD_LEFT_SEGMENTS;
const maxRight = HOME_LIMITS.MAX_FRONTYARD_RIGHT_SEGMENTS - HOME_LIMITS.START_FRONTYARD_RIGHT_SEGMENTS;

function streets() {
  const out = [];
  for (const style of HOUSE_STYLE_KEYS) {
    for (let yardLeft = 0; yardLeft <= maxLeft; yardLeft += 1) {
      for (const yardRight of [0, maxRight]) out.push({ style, state: createCultivationState({ yardLeft, yardRight }) });
    }
  }
  return out;
}

const apart = (a, b) => a.x2 <= b.x1 || b.x2 <= a.x1;

describe('home street fixtures (HOMEMAIL)', () => {
  it('keeps the dispatcher off the signpost, Mailbox, door, rock and Butler Box on every street', () => {
    for (const { style, state } of streets()) {
      const layout = homeStreetLayout(state);
      const house = houseFixtureX(layout, style);
      const at = { mailboxX: Math.round(house.signX), doorX: house.doorX };
      const x = layout.houseX + dispatcherRx(state, { at });
      const span = { x1: x - DISPATCHER_HALF, x2: x + DISPATCHER_HALF };
      const where = `${style} left ${state.yardLeft} right ${state.yardRight}`;
      assert.ok(span.x1 >= 60 && span.x2 <= layout.width - 60, `on the street: ${where}`);
      const fixtures = streetFixtures(layout, at);
      assert.deepEqual(fixtures.map((f) => f.id).sort(), ['butler_box', 'door', 'mailbox', 'rock', 'signpost']);
      for (const f of fixtures) assert.ok(apart(span, f), `clear of the ${f.id}: ${where}`);
      // With no cultivations it is always the usual spot, left of the signpost's left arms.
      assert.equal(x - layout.houseX, dispatcherDefaultRx(layout));
      assert.ok(span.x2 < signpostX(layout) - SIGNPOST.left);
    }
  });

  it('keeps the other fixtures apart too', () => {
    for (const { style, state } of streets()) {
      const layout = homeStreetLayout(state);
      const house = houseFixtureX(layout, style);
      const rows = Object.fromEntries(streetFixtures(layout, { mailboxX: Math.round(house.signX), doorX: house.doorX }).map((f) => [f.id, f]));
      for (const [a, b] of [['mailbox', 'door'], ['door', 'rock'], ['rock', 'butler_box'], ['signpost', 'mailbox']]) {
        assert.ok(apart(rows[a], rows[b]), `${a} and ${b}: ${style} left ${state.yardLeft}`);
      }
    }
  });

  it('places the signpost (its post, top arm and friends\' arms) and the dispatcher from the one table', () => {
    assert.match(read('features/home-street-mp-feature.js'), /return fixtureSignpostX\(layout\);/);
    assert.equal((read('features/homes-feature.js').match(/gate\.x = signpostX\(layout\);/g) || []).length, 2);
    const courier = read('features/mail-courier-feature.js');
    assert.match(courier, /engine\.query\?\.\('homeDispatcherX', engine\)/);
    assert.doesNotMatch(courier, /DISPATCHER_GATE_DX = -150/);
    assert.equal(SIGNPOST.lotDx, -70);
  });

  it('keeps cultivations clear of the dispatcher, and steps it aside from one already there', () => {
    // Two left expansions: room for a rock on either side of the usual spot.
    const st = createCultivationState({ yardLeft: 2 });
    const layout = homeStreetLayout(st);
    const usual = dispatcherDefaultRx(layout);
    const refused = placementCheck(st, 'proto_metal_rock', usual);
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, 'dispatcher');
    assert.equal(refused.msg, 'Keep it clear of your Mail Dispatcher.');
    // Beside it on the left (on its right is the signpost's post, which nothing stands on: GARDENART).
    const clear = usual - DISPATCHER_HALF - footprint('proto_metal_rock') - 1;
    assert.equal(placementCheck(st, 'proto_metal_rock', clear).ok, true);
    // A save from before this rule with a rock on the spot: the dispatcher stands beside it.
    st.items.push({ id: 1, protoClass: 'proto_metal_rock', endClass: 'rock_metal_1', rx: usual, wear: 0, lifeSteps: 0 });
    st.nextId = 2;
    const moved = dispatcherRx(st);
    assert.notEqual(moved, usual);
    assert.ok(Math.abs(moved - usual) >= DISPATCHER_HALF + footprint('proto_metal_rock'));
    assert.equal(dispatcherFits(layout, layout.houseX + moved, { items: [{ x: layout.houseX + usual, half: footprint('proto_metal_rock') }] }).ok, true);
  });

  it('still fits the whole demo yard', () => {
    const st = cultivateDemoYard(createCultivationState({}));
    assert.equal(st.items.length, 6);
    assert.equal(dispatcherRx(st), dispatcherDefaultRx(homeStreetLayout(st)));
  });

  it('answers nothing off the home street', () => {
    assert.equal(homesFeature.homeDispatcherX(), null);
  });
});
