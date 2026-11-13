/**
 * Notice board pins (js/street-furniture.js BOARD_PINS): as many notices as the Glitch Tribute Blog
 * shows on each board it covers, in our own neutral words, and Hauki Seeks Manor's board hung where
 * the blog's lobby shot has it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  BOARD_ART,
  BOARD_CLASS,
  BOARD_PINS,
  BOARD_PIN_SOURCE_COUNTS,
  BOARD_SPOTS,
  RETIRED_BOARD_PIN_TEXTS,
  boardArtState,
  boardPinSeeds,
  boardSpotRow,
  editNote,
  fixedFurniturePoints,
  isRemakeNote,
  pinNote,
  refreshBoardPins,
} from '../public/js/street-furniture.js?v=d99e92c5';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const street = (tsid) => JSON.parse(readFileSync(join(root, 'assets/streets', `${tsid}.json`), 'utf8'));

// Posts per board on johnexploresur.tumblr.com (research/coverage/round4-people-2026-10-31/boards/notice-posts.tsv).
const BLOG = {
  GHVUFJ6HGRU2V0E: 5, // Hakusan Heaps Towers
  GA9MU59GB792T80: 5, // Besara Community Machine Room
  GHVUR3UKGRU2SD2: 7, // Egret Taun Towers
  GIFI4FP9GRU2CC8: 6, // Sabudana Drama Towers
  GA9H1V6OGRU2FSB: 6, // Hauki Seeks Manor
};

describe('notice board pins follow the Tribute Blog counts', () => {
  it('pins as many notices as the blog shows on each board it covers', () => {
    assert.deepEqual(BOARD_PIN_SOURCE_COUNTS, BLOG);
    for (const [tsid, count] of Object.entries(BLOG)) {
      assert.equal(BOARD_PINS[tsid].length, count, tsid);
      assert.equal(boardPinSeeds(tsid).length, count, tsid);
      assert.equal(boardArtState(boardPinSeeds(tsid).length), `m${count}`, tsid);
    }
  });

  it('keeps three on the two boards with no source', () => {
    assert.equal(BOARD_PINS.GA5134UPLRU29OH.length, 3);
    assert.equal(BOARD_PINS.GCR101Q98A12EHH.length, 3);
  });

  it('no invented notice is left: every pin is short, neutral, labelled ours, and never a retired text', () => {
    const retired = new Set(RETIRED_BOARD_PIN_TEXTS);
    for (const [tsid, pins] of Object.entries(BOARD_PINS)) {
      assert.equal(new Set(pins.map((p) => p.title)).size, pins.length, `${tsid} repeats a notice`);
      for (const pin of pins) {
        assert.equal(pin.remake, true, pin.title);
        assert.ok(!retired.has(pin.text), pin.text);
        assert.ok(pin.text.length <= 100 && pin.title.length <= 20, pin.text);
        assert.ok(!/[—–]/.test(pin.text + pin.title), 'no dashes');
        assert.ok(!/glitch/i.test(pin.text + pin.title), 'never the game name');
        // Neutral: nobody signs them and nobody speaks as a resident.
        assert.ok(!/^[~-]|\b(I|my|me|we|our)\b/.test(pin.text), pin.text);
      }
    }
  });

  it('names the board\'s own place in its welcome', () => {
    for (const [tsid, pins] of Object.entries(BOARD_PINS)) {
      const label = street(tsid).label;
      assert.ok(pins[0].text.includes(label), `${tsid}: ${pins[0].text}`);
    }
  });
});

describe('saves holding the retired notices', () => {
  const tsid = 'GHVUR3UKGRU2SD2';
  const old = [
    { id: 'b0', initialTitle: 'Basement gardens', initialText: RETIRED_BOARD_PIN_TEXTS[12], remakeText: true },
    { id: 'b1', initialTitle: 'Tower dues', initialText: RETIRED_BOARD_PIN_TEXTS[13] },
  ];

  it('a board still holding only the old untouched notices is seeded afresh', () => {
    const fresh = refreshBoardPins(old, tsid);
    assert.equal(fresh.length, 7);
    assert.deepEqual(fresh.map((p) => p.initialText), BOARD_PINS[tsid].map((p) => p.text));
  });

  it('a board a player has used keeps its pins, and an old notice stays labelled ours', () => {
    const mine = pinNote(old, [{ id: 'n1', title: 'mine', body: 'my words' }], 'n1').pins;
    assert.equal(refreshBoardPins(mine, tsid), mine);
    const written = editNote(old[0], { title: 'Mine', body: 'My own words' }, { learned: ['penmanship_1'], quillWorking: true, playerId: 'player', nowS: 1000 });
    assert.equal(written.ok, true);
    const edited = [written.note, old[1]];
    assert.equal(refreshBoardPins(edited, tsid), edited);
    assert.equal(isRemakeNote(old[1]), true, 'a retired text without the flag is still marked as remake text');
    assert.deepEqual(refreshBoardPins([], tsid), []);
  });
});

describe('Hauki Seeks Manor hangs its board right of the lift (blog post 48374460546)', () => {
  const hauki = street('GA9H1V6OGRU2FSB');

  it('pins the board to the measured wall spot, in screen space', () => {
    assert.deepEqual(Object.keys(BOARD_SPOTS), ['GA9H1V6OGRU2FSB']);
    const row = boardSpotRow({ [BOARD_CLASS]: 1, note: 2 }, hauki);
    const [p] = fixedFurniturePoints(row, BOARD_CLASS);
    assert.deepEqual({ x: p.x, y: p.y }, { x: 390 - hauki.bounds.l, y: -202 - hauki.bounds.t });
    assert.equal(row.note, 2);
  });

  it('sits right of the lift signpost, clear of it and of both doors, above the floor', () => {
    const row = boardSpotRow({ [BOARD_CLASS]: 1 }, hauki);
    const [p] = fixedFurniturePoints(row, BOARD_CLASS);
    const half = BOARD_ART.w / 2;
    const [sign] = hauki.signposts;
    const signScreenX = sign.x - hauki.bounds.l;
    assert.ok(p.x - half > signScreenX + sign.w / 2 - 80, 'right of the lift');
    for (const door of hauki.doors) assert.ok(Math.abs(door.x - p.x) > half + door.w / 2, door.connect.label);
    // The lobby floor under it is ~y -87 (world); the board hangs on the wall above the paper stacks.
    assert.ok(p.y < -87 - hauki.bounds.t - 80 && p.y - BOARD_ART.h > 0);
  });

  it('leaves other streets, rows without a board and rows with their own spot alone', () => {
    const other = street('GHVUR3UKGRU2SD2');
    const row = { [BOARD_CLASS]: 1 };
    assert.equal(boardSpotRow(row, other), row);
    const none = { note: 1 };
    assert.equal(boardSpotRow(none, hauki), none);
    const own = { [BOARD_CLASS]: 1, at: { [BOARD_CLASS]: [{ x: 5, y: 6 }] } };
    assert.equal(boardSpotRow(own, hauki), own);
    assert.equal(boardSpotRow(null, hauki), null);
  });
});
