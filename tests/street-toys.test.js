/**
 * Street toys (register G679): Lotha Harte's three icicles and heart, Icicle Dangles' three lights.
 * js/street-toys.js rules against the street data and the source scripts.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROADCAST_DISTANCE,
  STREET_TOYS,
  createNoteState,
  inBroadcastReach,
  lothaNote,
  prepareToyStreet,
  streetToysFor,
  toyDecoId,
  toyHitBox,
} from '../public/js/street-toys.js?v=09630452';
import { GLITCH_ONE_CLICK, oneClickChoice } from '../public/js/world-context-menu.js?v=34676f3f';
import { createEventRuntime, runLocationEvent } from '../public/js/location-events.js?v=05663361';
import { SOUND_FILES } from '../public/js/sound-keys.js?v=d6b20718';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const street = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));
const LOTHA = 'GHV88RQU60B3Q0G';
const ICICLE = 'GHF70EIUS0D3RDM';

describe('street toys data', () => {
  test('every toy names a deco the street has and events the street scripts', () => {
    for (const [tsid, def] of Object.entries(STREET_TOYS)) {
      const s = street(tsid);
      const res = prepareToyStreet(s, def);
      assert.deepEqual(res.missing, [], `${def.name}: every toy finds its deco`);
      const ids = new Set(s.layers.flatMap((l) => (l.decos || []).map((d) => d.id)).filter(Boolean));
      for (const toy of def.toys) {
        assert.ok(ids.has(toyDecoId(toy)), `${toy.id} deco tagged`);
        assert.ok(toy.why.length > 40, `${toy.id} says why`);
        for (const ev of toy.events) assert.ok(s.events[ev], `${def.name} has ${ev}`);
      }
    }
  });

  test('Lotha Harte: the heart starts hidden (hidden_decos) and correct_order shows exactly those decos', () => {
    const s = street(LOTHA);
    const res = prepareToyStreet(s);
    assert.equal(res.tagged, 3);
    assert.equal(res.hidden, 13);
    const hidden = s.layers.flatMap((l) => l.decos || []).filter((d) => d.hidden).map((d) => d.id).sort();
    const shown = s.events.correct_order.filter((a) => a.type === 'deco_show').map((a) => a.deco).sort();
    assert.deepEqual(hidden, shown);
    // Running prepare twice changes nothing more (the street object is reused between visits).
    assert.deepEqual(prepareToyStreet(s), { tagged: 0, hidden: 0, missing: [] });
  });

  test('a shifted deco is not taken: sprite and x must match', () => {
    const s = street(LOTHA);
    const layer = s.layers.find((l) => l.id === 'T_1348191266333');
    layer.decos.splice(0, 1);
    assert.deepEqual(prepareToyStreet(s).missing.sort(), ['lotha_note_1', 'lotha_note_2', 'lotha_note_3']);
  });

  test('the three notes ship: WM_D1, WM_D2, WM_E2 (Sounds.zip)', () => {
    for (const key of ['WM_D1', 'WM_D2', 'WM_E2']) {
      assert.ok(SOUND_FILES[key], key);
      assert.ok(existsSync(join(root, 'public', SOUND_FILES[key])), key);
    }
    const s = street(LOTHA);
    assert.deepEqual(['first_note', 'second_note', 'third_note'].map((e) => s.events[e][0].name), ['WM_D1', 'WM_D2', 'WM_E2']);
  });
});

describe('Lotha Harte note order (loc.note1-3)', () => {
  test('1, 2, 3 lights the heart; the state is clear after', () => {
    const st = createNoteState();
    assert.equal(lothaNote(st, 'first_note'), false);
    assert.equal(lothaNote(st, 'second_note'), false);
    assert.deepEqual(st, { note1: true, note2: true, note3: false });
    assert.equal(lothaNote(st, 'third_note'), true);
    assert.deepEqual(st, createNoteState());
  });

  test('wrong orders reset, as the source\'s else branches do', () => {
    const st = createNoteState();
    lothaNote(st, 'second_note');
    assert.deepEqual(st, createNoteState());
    lothaNote(st, 'first_note');
    assert.equal(lothaNote(st, 'third_note'), false);
    assert.deepEqual(st, createNoteState());
    // A repeat of a note already held does not break the order (the source only checks note1 / note1 and note2).
    for (const e of ['first_note', 'first_note', 'second_note', 'second_note']) lothaNote(st, e);
    assert.equal(lothaNote(st, 'third_note'), true);
  });

  test('correct_order locks the notes for the 22 s light and 3.5 s fade', () => {
    const s = street(LOTHA);
    const rt = createEventRuntime();
    const fx = runLocationEvent(rt, s.events, 'correct_order', { now: 0, target: true });
    assert.equal(fx.filter((e) => e.type === 'deco' && e.visible).length, 13);
    assert.ok(rt.flags.has('lock'));
    // While locked a note still sounds but stops before its code (flag_has_exit lock).
    const note = runLocationEvent(rt, s.events, 'first_note', { now: 100, target: true });
    assert.deepEqual(note.map((e) => e.type), ['sound']);
    assert.deepEqual(rt.timers.map((t) => [t.event, t.at]), [['light_fade', 22000]]);
  });
});

describe('Icicle Dangles lights', () => {
  test('one click broadcasting _on then _off toggles the light, with the 700 ms lockout', () => {
    const s = street(ICICLE);
    const rt = createEventRuntime();
    const click = (now) => {
      const fx = [];
      for (const ev of ['shroom_light_1_on', 'shroom_light_1_off']) fx.push(...runLocationEvent(rt, s.events, ev, { now, target: true }));
      return fx.filter((e) => e.type === 'deco').map((e) => e.visible);
    };
    assert.deepEqual(click(0), [false], 'lit at first: a click puts it out');
    assert.deepEqual(click(100), [], 'locked out for 700 ms');
    for (const t of [...rt.timers]) if (t.at <= 800) runLocationEvent(rt, s.events, t.event, { now: 800 });
    rt.timers = [];
    assert.deepEqual(click(900), [true], 'and on again');
  });
});

describe('the click', () => {
  test('clickable_broadcaster is a Glitch one-click item: a left click runs click_broadcast', () => {
    assert.equal(GLITCH_ONE_CLICK.clickable_broadcaster.verb, 'click_broadcast');
    const thing = { classId: 'clickable_broadcaster' };
    assert.equal(oneClickChoice(thing, [{ id: 'click_broadcast', enabled: true }]).kind, 'run');
  });

  test('reach is the item\'s distance, 1000 px; the tip box covers an icicle\'s lower half', () => {
    assert.equal(BROADCAST_DISTANCE, 1000);
    assert.ok(inBroadcastReach(0, 0, 600, 800));
    assert.ok(!inBroadcastReach(0, 0, 700, 800));
    assert.deepEqual(toyHitBox({ hit: 'tip' }, { x: 100, y: 500, w: 200, h: 400 }), { x: 100, y: 508, w: 140, h: 200 });
    assert.deepEqual(toyHitBox({ hit: 'whole' }, { x: 100, y: 500, w: 212, h: 153 }), { x: 100, y: 500, w: 212, h: 153 });
    assert.equal(streetToysFor('LHV88RQU60B3Q0G')?.name, 'Lotha Harte');
    assert.equal(streetToysFor('GA9TKSRJ7LD3SGK'), null);
  });
});
