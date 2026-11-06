/**
 * PORCH (Austin 2026-11-01, "my house front is crowded"): Cultivate moves the Mailbox and the
 * Magic Rock as it moves the Mail Dispatcher (lane HOMEMAIL). Reimagined: the source put both
 * by the house (the street template's Mailbox; the rock at 221 right of the door, inc_homes.js
 * homes_demo_frontyard 2469-2471) and never moved them. A moved one is saved with the street
 * (the same slice solo and online, so visitors see it there), keeps clear of the door and its
 * mat, the other fixtures and the cultivations, and steps aside rather than moving anything a
 * player planted. Until moved, each stands where it always did.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createBackYardState,
  createCultivationState,
  dispatcherRx,
  fixtureObstacles,
  fixtureRx,
  footprint,
  groundFixtures,
  homeStreetLayout,
  normalizeCultivationState,
  placementCheck,
} from '../public/js/home-cultivation.js?v=ff17225a';
import {
  MOVABLE_FIXTURES,
  MOVABLE_FIXTURE_IDS,
  STREET_ROCK,
  fixtureFits,
  fixtureText,
  savedFixtureRx,
} from '../public/js/home-street-fixtures.js?v=badcb725';
import { HOUSE_STYLE_KEYS, homesFeature, houseDoorway, houseFixtureX } from '../public/js/features/homes-feature.js?v=bdd9c846';

const read = (rel) => readFileSync(join(import.meta.dirname, '..', 'public', 'js', rel), 'utf8');
const atFor = (layout, style) => {
  const house = houseFixtureX(layout, style);
  return { mailboxX: Math.round(house.signX), doorX: house.doorX, doorway: houseDoorway(layout, style) };
};

describe('moving the Mailbox and the Magic Rock (PORCH)', () => {
  it('saves a moved spot with the street, and only there', () => {
    const st = normalizeCultivationState({ mailboxRx: -612.4, rockRx: 640 });
    assert.equal(st.mailboxRx, -612);
    assert.equal(st.rockRx, 640);
    const plain = normalizeCultivationState({});
    assert.equal('mailboxRx' in plain || 'rockRx' in plain, false, 'the usual spots save nothing');
    assert.equal('rockRx' in normalizeCultivationState({ rockRx: 'right' }), false);
    assert.equal('mailboxRx' in createBackYardState({ mailboxRx: -300 }), false, 'the back yard has neither');
    assert.equal(fixtureRx(createBackYardState({}), 'rock'), null);
    assert.deepEqual(MOVABLE_FIXTURE_IDS, ['mailbox', 'rock', 'dispatcher']);
  });

  it('round-trips through the homes save (solo and online, and the slice a visitor is shown)', () => {
    homesFeature.restore({ decor: {}, cult: { yardRight: 1, mailboxRx: 700, rockRx: 900 } });
    const slice = JSON.parse(JSON.stringify(homesFeature.save()));
    assert.equal(slice.cult.mailboxRx, 700);
    assert.equal(slice.cult.rockRx, 900);
    homesFeature.restore(slice);
    assert.equal(savedFixtureRx(homesFeature._state().cult, 'mailbox'), 700);
    homesFeature.restore(undefined);
    assert.equal(savedFixtureRx(homesFeature._state().cult, 'rock'), null);
  });

  it('stands in its usual spot until moved, on every house', () => {
    for (const style of HOUSE_STYLE_KEYS) {
      const st = createCultivationState({});
      const layout = homeStreetLayout(st);
      const at = atFor(layout, style);
      assert.equal(fixtureRx(st, 'rock', { at }), STREET_ROCK.houseDx);
      assert.equal(layout.houseX + fixtureRx(st, 'mailbox', { at }), at.mailboxX);
    }
  });

  it('a moved one keeps clear of the doorway, the other fixtures and the street ends', () => {
    for (const style of HOUSE_STYLE_KEYS) {
      const st = createCultivationState({ yardLeft: 2, yardRight: 2 });
      const layout = homeStreetLayout(st);
      const at = atFor(layout, style);
      const door = houseDoorway(layout, style);
      for (const id of ['mailbox', 'rock']) {
        const opts = fixtureObstacles(st, id, { at });
        const onDoor = fixtureFits(layout, id, Math.round((door.x1 + door.x2) / 2), opts);
        assert.deepEqual([onDoor.ok, onDoor.reason, onDoor.msg], [false, 'door', 'Keep the path to your front door clear.'], `${style} ${id}`);
        const other = id === 'mailbox' ? 'rock' : 'mailbox';
        const otherX = layout.houseX + fixtureRx(st, other, { at });
        const onOther = fixtureFits(layout, id, otherX, opts);
        assert.equal(onOther.reason, other, `${style} ${id} on the ${other}`);
        assert.equal(fixtureFits(layout, id, 20, opts).reason, 'edge');
        // Whatever the save says, it stands somewhere clear.
        for (const want of [0, -2000, 5000, Math.round((door.x1 + door.x2) / 2) - layout.houseX]) {
          st[MOVABLE_FIXTURES[id].key] = want;
          const x = layout.houseX + fixtureRx(st, id, { at });
          assert.equal(fixtureFits(layout, id, x, fixtureObstacles(st, id, { at })).ok, true, `${style} ${id} saved ${want}`);
        }
        delete st[MOVABLE_FIXTURES[id].key];
      }
    }
  });

  it('the Mail Dispatcher keeps clear of a moved Mailbox or rock', () => {
    const st = createCultivationState({ yardLeft: 2 });
    const usual = dispatcherRx(st);
    st.mailboxRx = usual;
    const now = dispatcherRx(st);
    assert.ok(Math.abs(now - usual) >= MOVABLE_FIXTURES.mailbox.half + MOVABLE_FIXTURES.dispatcher.half, 'it steps aside');
  });

  it('cultivations keep clear of a moved one; nothing a player planted moves for it', () => {
    const st = createCultivationState({ yardRight: 2 });
    // The rock's usual spot is free once it moves; its new spot is not.
    assert.equal(placementCheck(st, 'proto_metal_rock', STREET_ROCK.houseDx).reason, 'rock');
    st.rockRx = 1100;
    assert.notEqual(placementCheck(st, 'proto_metal_rock', STREET_ROCK.houseDx).reason, 'rock', 'no longer the rock there');
    assert.equal(placementCheck(st, 'proto_metal_rock', 1100).reason, 'rock');
    st.mailboxRx = 800;
    assert.equal(placementCheck(st, 'proto_metal_rock', 800).reason, 'mailbox');
    assert.deepEqual(groundFixtures(homeStreetLayout(st)).map((f) => f.id).sort(), ['butler_box', 'rock', 'signpost'], 'unchanged without a save');
    // A save whose cultivation sits under a moved fixture: the cultivation stays, the fixture steps aside.
    const saved = normalizeCultivationState({
      yardRight: 2,
      rockRx: 1100,
      mailboxRx: 800,
      items: [
        { id: 1, protoClass: 'proto_metal_rock', endClass: 'rock_metal_1', rx: 1100 },
        { id: 2, protoClass: 'proto_metal_rock', endClass: 'rock_metal_1', rx: 800 },
      ],
    });
    assert.deepEqual(saved.items.map((r) => r.rx), [1100, 800]);
    assert.ok(Math.abs(fixtureRx(saved, 'rock') - 1100) >= footprint('proto_metal_rock') + STREET_ROCK.half);
    assert.ok(Math.abs(fixtureRx(saved, 'mailbox', { at: { mailboxX: 0 } }) - 800) >= footprint('proto_metal_rock') + MOVABLE_FIXTURES.mailbox.half);
  });

  it('is wired into Cultivate and the street, solo and for visitors', () => {
    const src = read('features/homes-feature.js');
    assert.match(src, /bannerActions: back \|\| scene\?\.room !== 'street' \? \[\] : fixtureBannerActions\(engine\)/);
    assert.match(src, /mailbox\.x = Math\.round\(fixtureWorldX\('mailbox'\) \?\? bg\?\.houseSignX/);
    assert.match(src, /rockTarget = spawnRock\(engine, fixtureWorldX\('rock'\)/);
    // A visitor's view of the owner's street reads the owner's saved spot.
    assert.match(src, /const moved = fixtureRx\(st, 'mailbox', \{ at: \{ mailboxX: usual, doorway: background\.houseDoorway \} \}\);/);
  });

  it('speaks plainly', () => {
    assert.equal(fixtureText('mailbox').banner, 'Move Mailbox');
    assert.equal(fixtureText('rock').banner, 'Move Magic Rock');
    assert.equal(fixtureText('dispatcher').banner, 'Move Mail Dispatcher');
    for (const id of MOVABLE_FIXTURE_IDS) {
      for (const text of Object.values(fixtureText(id))) assert.doesNotMatch(text, /—|Glitch/);
    }
  });
});
