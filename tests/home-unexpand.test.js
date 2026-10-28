/**
 * Un-expanding the house (locations/inc_homes.js homes_unexpand and the
 * homes_get_expand_costs `unexpand` refund; client HouseExpandDialog copy).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEGMENT_W,
  UNEXPAND_TEXT,
  createHomeDecorState,
  expandInterior,
  interiorWidth,
  normalizeHomeDecorState,
  quoteInteriorUnexpand,
  unexpandInterior,
} from '../public/js/home-decor.js?v=g418-1';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const homes = join(spike, '../glitch-GameServerJS/locations/inc_homes.js');
const dialog = join(spike, '../glitch-client/com/tinyspeck/engine/port/HouseExpandDialog.as');

describe('house un-expand (homes_unexpand)', () => {
  it('refunds the source parts, stepping with the segment', () => {
    const at = (w) => quoteInteriorUnexpand({ wallSegments: w }).items;
    assert.deepEqual(at(7), { wood_post: 2, board: 6, barnacle_talc: 8, beam: 1, girder: 1 });
    assert.deepEqual(at(8), { wood_post: 2, board: 6, barnacle_talc: 7 });
    assert.deepEqual(at(9), { wood_post: 2, board: 6, barnacle_talc: 8, beam: 1 });
    assert.deepEqual(at(10), { wood_post: 2, board: 6, barnacle_talc: 7 });
    assert.deepEqual(at(11), { wood_post: 2, board: 6, barnacle_talc: 8, beam: 1, girder: 1 });
    assert.equal(quoteInteriorUnexpand({ wallSegments: 20 }).count, 14);
  });

  it('stops at MIN_WALL_SEGMENTS (6) and never in the tower', () => {
    const q = quoteInteriorUnexpand({ wallSegments: 6 });
    assert.equal(q.ok, false);
    assert.equal(q.msg, 'Your house is already sooo small!');
    assert.equal(quoteInteriorUnexpand({ wallSegments: 9, layout: 'tower' }).ok, false);
    const s = createHomeDecorState({});
    const inv = {};
    assert.equal(unexpandInterior(s, inv).ok, true);
    assert.equal(s.wallSegments, 6);
    assert.equal(normalizeHomeDecorState(JSON.parse(JSON.stringify(s))).wallSegments, 6, 'a 6-segment house survives a reload');
    assert.equal(unexpandInterior(s, inv).ok, false);
  });

  it('drops the second-to-last wallpaper and moves the last 300 px over by 150', () => {
    const s = createHomeDecorState({ wallSegments: 9 });
    s.walls = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'end'].map((k) => s.wall);
    s.walls[7] = s.walls[0];
    const w = interiorWidth(s);
    s.placed.push({ id: 900, classTsid: 'furniture_chair', slot: 'floor', x: w - 250, y: 620, z: 1, on: null });
    s.placed.push({ id: 901, classTsid: 'furniture_chair', slot: 'floor', x: w - 600, y: 620, z: 1, on: null });
    const inv = { board: 1 };
    const r = unexpandInterior(s, inv);
    assert.equal(r.ok, true);
    assert.equal(s.wallSegments, 8);
    assert.equal(s.walls.length, 8);
    assert.equal(interiorWidth(s), w - SEGMENT_W);
    assert.equal(s.placed.find((p) => p.id === 901).x, w - 600, 'away from the end: stays');
    assert.ok(s.placed.find((p) => p.id === 900).x <= w - 250 - 150, 'in the last 300 px: moved over');
    assert.deepEqual(inv, { board: 7, wood_post: 2, barnacle_talc: 8, beam: 1 });
    // Expand again with a Wall Segment: back to 9.
    assert.equal(expandInterior(s, { wall_segment: 1 }).wallSegments, 9);
  });

  it('match the GSJS and client sources', { skip: !(existsSync(homes) && existsSync(dialog)) && 'source checkouts not beside this worktree' }, () => {
    const src = readFileSync(homes, 'utf8');
    assert.match(src, /'wood_post' : num_floors \* 2,/);
    assert.match(src, /'board' : num_floors \* 6,/);
    assert.match(src, /'barnacle_talc' : num_floors \* \(\(segs % 2 == 0\) \? 8 : 7\),/);
    assert.match(src, /apiSetXY\(this\.items\[i\]\.x - 150/);
    const as = readFileSync(dialog, 'utf8');
    for (const key of ['body', 'confirmTitle', 'yes']) assert.ok(as.includes(UNEXPAND_TEXT[key].replace("don't", "don\\'t")), key);
    assert.ok(as.includes(UNEXPAND_TEXT.confirm.replace("don't", "don\\'t")));
  });
});
