/**
 * Street furniture the planner places (Mailboxes, Visiting Stones, Notice Boards) steps
 * off the street's doors: Gregarious Towers' board hung over the Grange door (Austin
 * 2026-10-29). The archive keeps the counts, not the spots; fixed spots stay put.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { BOARD_ART, DOOR_CLEARANCE, clearOfDoors } from '../public/js/street-furniture.js?v=3955b1b6';
import { platformsScreen } from '../public/js/street-model.js?v=606bae73';

const towers = JSON.parse(readFileSync(new URL('../public/assets/streets/GA5134UPLRU29OH.json', import.meta.url), 'utf8'));

describe('furniture keeps clear of doors', () => {
  const half = BOARD_ART.w / 2;
  const platforms = platformsScreen(towers);
  const width = towers.bounds.r - towers.bounds.l;
  const grange = towers.doors.find((d) => d.connect?.label === 'Gregarious Grange');

  it('a board planned over the Grange door slides left of its frame, onto the floor', () => {
    const over = { x: grange.x - 40, y: grange.y };
    const moved = clearOfDoors(over, half, towers.doors, platforms, width);
    assert.ok(moved.x + half + DOOR_CLEARANCE <= grange.x - grange.w / 2 + 1, JSON.stringify(moved));
    assert.ok(Math.abs(moved.y - grange.y) <= 60);
    // From the doorstep (screen y 513, the step in front of the door) too.
    const step = clearOfDoors({ x: 1450, y: 513 }, half, towers.doors, platforms, width);
    assert.ok(step.x + half + DOOR_CLEARANCE <= grange.x - grange.w / 2 + 1, JSON.stringify(step));
  });

  it('a spot clear of every door is left alone', () => {
    const p = { x: 760, y: grange.y };
    assert.deepEqual(clearOfDoors(p, half, towers.doors, platforms, width), p);
  });

  it('a door on another floor does not move it, nor a hidden one', () => {
    const p = { x: 500, y: 300 };
    assert.deepEqual(clearOfDoors(p, half, [{ x: 500, y: 600, w: 80 }], platforms, width), p);
    assert.deepEqual(clearOfDoors(p, half, [{ x: 500, y: 300, w: 80, hidden: true }], platforms, width), p);
  });

  it('the feature runs planned spots through it, fixed ones not', () => {
    const src = readFileSync(new URL('../public/js/features/street-furniture-feature.js', import.meta.url), 'utf8');
    assert.match(src, /fixedFurniturePoints\(row, classTsid\)\s*\? at\(classTsid\)\s*: at\(classTsid\)\.map\(\(p\) => clearOfDoors\(p, half, doors, engine\.platforms, worldW\)\)/);
    for (const c of ['npc_mailbox', 'visiting_stone', 'bag_notice_board']) assert.match(src, new RegExp(`\\(clear\\('${c}'`));
  });
});
