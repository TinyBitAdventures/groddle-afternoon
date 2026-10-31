/**
 * Lane HOMEMAIL: "can I move my mail dispatcher?" Cultivate on your home street carries the
 * Mail Dispatcher (reimagined: the source rebuilt it from the street template, so no player
 * moved it). Its spot is saved with the street, kept on the street and off the fixtures, and
 * Back to its usual spot clears it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createBackYardState,
  createCultivationState,
  dispatcherRx,
  homeStreetLayout,
  normalizeCultivationState,
  placementCheck,
} from '../public/js/home-cultivation.js?v=3f6c0792';
import {
  DISPATCHER_HALF,
  DISPATCHER_TEXT,
  STREET_EDGE,
  dispatcherDefaultRx,
  dispatcherFits,
  gateX,
  savedDispatcherRx,
  streetFixtures,
} from '../public/js/home-street-fixtures.js?v=57eaae87';
import { homesFeature } from '../public/js/features/homes-feature.js?v=6aa45670';

const root = join(import.meta.dirname, '..', 'public', 'js');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

describe('moving the Mail Dispatcher (HOMEMAIL)', () => {
  it('keeps a moved spot in the street save, and only there', () => {
    assert.equal(normalizeCultivationState({ dispatcherRx: 412.6 }).dispatcherRx, 413);
    assert.equal('dispatcherRx' in normalizeCultivationState({}), false, 'the usual spot saves nothing');
    assert.equal('dispatcherRx' in normalizeCultivationState({ dispatcherRx: 'left' }), false);
    assert.equal('dispatcherRx' in normalizeCultivationState({ dispatcherRx: null }), false);
    assert.equal('dispatcherRx' in createBackYardState({ dispatcherRx: -300 }), false, 'the back yard has no dispatcher');
    assert.equal(dispatcherRx(createBackYardState({})), null);
    const again = normalizeCultivationState(JSON.parse(JSON.stringify(normalizeCultivationState({ dispatcherRx: 900 }))));
    assert.equal(again.dispatcherRx, 900);
  });

  it('round-trips through the homes save (solo and online use the same slice)', () => {
    homesFeature.restore({ decor: {}, cult: { yardRight: 1, dispatcherRx: 620 } });
    assert.equal(homesFeature._state().cult.dispatcherRx, 620);
    const slice = JSON.parse(JSON.stringify(homesFeature.save()));
    assert.equal(slice.cult.dispatcherRx, 620);
    homesFeature.restore(slice);
    assert.equal(savedDispatcherRx(homesFeature._state().cult), 620);
    homesFeature.restore(undefined);
    assert.equal(savedDispatcherRx(homesFeature._state().cult), null);
  });

  it('stands at the saved spot, which moves with the house when the street grows left', () => {
    const st = createCultivationState({ dispatcherRx: 520 });
    assert.equal(dispatcherRx(st), 520);
    const before = homeStreetLayout(st).houseX + dispatcherRx(st);
    st.yardLeft += 1;
    assert.equal(homeStreetLayout(st).houseX + dispatcherRx(st), before + 150);
  });

  it('never stands on a fixture or off the street, whatever the save says', () => {
    const st = createCultivationState({});
    const layout = homeStreetLayout(st);
    const fixtures = streetFixtures(layout);
    for (const want of [gateX(layout) - layout.houseX, -layout.houseX - 500, layout.width, 221, 300]) {
      st.dispatcherRx = want;
      const x = layout.houseX + dispatcherRx(st);
      assert.ok(x - DISPATCHER_HALF >= STREET_EDGE && x + DISPATCHER_HALF <= layout.width - STREET_EDGE, `on the street for ${want}`);
      assert.equal(dispatcherFits(layout, x, { fixtures }).ok, true, `clear for ${want}`);
    }
    const on = dispatcherFits(layout, gateX(layout), { fixtures });
    assert.deepEqual([on.ok, on.reason, on.msg], [false, 'gate', 'Keep it clear of your World Gate.']);
    const sign = dispatcherFits(layout, gateX(layout) - 200, { fixtures });
    assert.deepEqual([sign.ok, sign.reason, sign.msg], [false, 'signpost', 'Keep it clear of your signpost.']);
    const edge = dispatcherFits(layout, 20, { fixtures });
    assert.deepEqual([edge.ok, edge.msg], [false, 'Not enough street there.']);
  });

  it('frees its usual spot for cultivating once moved, and guards the new one', () => {
    const st = createCultivationState({ yardLeft: 2, yardRight: 2 });
    const usual = dispatcherDefaultRx(homeStreetLayout(st));
    assert.equal(placementCheck(st, 'proto_metal_rock', usual).reason, 'dispatcher');
    st.dispatcherRx = 1000;
    assert.equal(placementCheck(st, 'proto_metal_rock', usual).ok, true);
    assert.equal(placementCheck(st, 'proto_metal_rock', 1000).reason, 'dispatcher');
    delete st.dispatcherRx;
    assert.equal(placementCheck(st, 'proto_metal_rock', usual).reason, 'dispatcher', 'back in its usual spot');
  });

  it('is wired into Cultivate: select, Move, drag, Place, Back to its usual spot, saved', () => {
    const src = read('features/homes-feature.js');
    for (const hook of ["'data-home-action': 'dispatcher-move'", "'data-home-action': 'dispatcher-reset'", "'data-home-dispatcher': 'select'"]) {
      assert.ok(src.includes(hook), hook);
    }
    assert.match(src, /if \(placing\.kind === 'dispatcher'\) return placeDispatcher\(engine, at\.x\);/);
    assert.match(src, /if \(press\.kind === 'dispatcher'\) beginDispatcherMove\(engine\);/);
    assert.match(src, /cult\.dispatcherRx = Math\.round\(x\) - homeStreetLayout\(cult\)\.houseX;[\s\S]{0,400}engine\.save\(\);/);
    assert.match(src, /delete cult\.dispatcherRx;[\s\S]{0,400}engine\.save\(\);/);
    // Recorded as reimagined, with the source that never moved it.
    assert.match(src, /Reimagined: the\s+\* source rebuilt it/);
    assert.match(read('home-street-fixtures.js'), /upgrades_recreate_classes/);
  });

  it('speaks plainly', () => {
    for (const text of Object.values(DISPATCHER_TEXT)) {
      assert.doesNotMatch(text, /—|Glitch/);
    }
    assert.equal(DISPATCHER_TEXT.reset, 'Back to its usual spot');
  });
});
