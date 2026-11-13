/**
 * The street toys online (register G679): js/street-toys-mp.js against the streets' own scripts, and
 * the server's table (groddle-afternoon-server streettoys.go) against the game's toys. The server side is
 * streettoys_test.go there.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOY_CLICK, catchUpDangles, catchUpLotha, toyEvents, toyMessageFor, toyServerState } from '../public/js/street-toys-mp.js?v=ba23095f';
import { STREET_TOYS } from '../public/js/street-toys.js?v=09630452';
import { createEventRuntime, runLocationEvent } from '../public/js/location-events.js?v=05663361';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const street = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));
const LOTHA = 'GHV88RQU60B3Q0G';
const ICICLE = 'GHF70EIUS0D3RDM';

describe('the server\'s word, as the game keeps it', () => {
  test('toy_state per street kind, and toy_played over it', () => {
    let s = toyServerState({ t: 'toy_state', street: LOTHA, toys: 'lotha', lit: false });
    assert.deepEqual(s, { toys: 'lotha', lit: false });
    s = toyServerState({ t: 'toy_played', street: LOTHA, toy: 'lotha_note_3', by: 2, events: ['third_note', 'correct_order'] }, s);
    assert.equal(s.lit, true);
    s = toyServerState({ t: 'toy_played', street: LOTHA, toy: '', by: 0, events: ['light_fade'] }, s);
    assert.equal(s.lit, false);
    let d = toyServerState({ t: 'toy_state', toys: 'dangles', lights: [true, false, true] });
    d = toyServerState({ t: 'toy_played', events: ['shroom_light_2_on', 'shroom_light_3_off'] }, d);
    assert.deepEqual(d.lights, [true, true, false]);
    assert.equal(toyServerState({ t: 'toy_played', events: ['x'] }, null), null, 'a played with no state first is ignored');
    assert.deepEqual(toyEvents({ events: ['first_note', 7, 'bad name', 'x'.repeat(41)] }), ['first_note']);
    assert.ok(toyMessageFor({ street: 'LHV88RQU60B3Q0G' }, LOTHA) && !toyMessageFor({ street: ICICLE }, LOTHA) && !toyMessageFor(null, LOTHA));
    assert.equal(TOY_CLICK, 'toy_click');
  });
});

describe('catching up with the street\'s own scripts', () => {
  test('Lotha Harte: an arrival while it is lit shows the heart and leaves the fade to the server', () => {
    const s = street(LOTHA);
    const rt = createEventRuntime();
    const step = catchUpLotha({ toys: 'lotha', lit: true }, false);
    assert.deepEqual(step, { fire: ['correct_order'], cancel: ['light_fade'], shown: true });
    const fx = runLocationEvent(rt, s.events, step.fire[0], { now: 0 });
    assert.equal(fx.filter((e) => e.type === 'deco' && e.visible).length, STREET_TOYS[LOTHA].hide.length);
    assert.deepEqual(rt.timers.map((t) => t.event), ['light_fade'], 'the timer the caller cancels');
    assert.deepEqual(catchUpLotha({ toys: 'lotha', lit: false }, true), { fire: ['light_fade'], cancel: [], shown: false });
    assert.equal(catchUpLotha({ toys: 'lotha', lit: true }, true), null);
    assert.equal(catchUpLotha({ toys: 'dangles', lights: [] }, false), null);
  });

  test('Icicle Dangles: a light out for the street goes out here, past the 700 ms lock', () => {
    const s = street(ICICLE);
    const rt = createEventRuntime();
    const flag = (n) => rt.flags.has(n);
    assert.deepEqual(catchUpDangles({ toys: 'dangles', lights: [true, true, true] }, flag), []);
    // This game's light 2 is still locked from a click of its own a moment ago.
    rt.flags.add('light2');
    const steps = catchUpDangles({ toys: 'dangles', lights: [true, false, true] }, flag);
    assert.deepEqual(steps, [{ clear: 'light2', fire: 'shroom_light_2_off' }]);
    rt.flags.delete(steps[0].clear);
    const fx = runLocationEvent(rt, s.events, steps[0].fire, { now: 0 });
    assert.deepEqual(fx.filter((e) => e.type === 'deco').map((e) => [e.id, e.visible]), [['light_spot_2_groddle1_1352325189092', false]]);
    assert.ok(flag('light2_on'));
    assert.deepEqual(catchUpDangles({ toys: 'dangles', lights: [true, false, true] }, flag), [], 'then it matches');
    assert.deepEqual(catchUpDangles({ toys: 'dangles', lights: [true, true, true] }, flag), [{ clear: 'light2', fire: 'shroom_light_2_on' }]);
  });
});

describe('the server\'s table matches the game', { skip: skipWithoutServer }, () => {
  const go = () => readFileSync(serverPath('streettoys.go'), 'utf8');

  test('the toy ids and their events', () => {
    const src = go();
    for (const toy of STREET_TOYS[LOTHA].toys) assert.match(src, new RegExp(`"${toy.id}": "${toy.events[0]}"`), toy.id);
    STREET_TOYS[ICICLE].toys.forEach((toy, i) => assert.match(src, new RegExp(`"${toy.id}": ${i}`), toy.id));
    for (const tsid of [LOTHA, ICICLE]) assert.match(src, new RegExp(`"${tsid.slice(1)}": toy`), tsid);
  });
});
