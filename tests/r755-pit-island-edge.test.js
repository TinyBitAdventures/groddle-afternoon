/**
 * Report #755 (Level 3 West, GLI107JLRU11EM2, desktop 1687x967): "going all the way to the right ...
 * one falls off" and is bounced back up. Our own stand-in teleporter box (js/cave-pit.js
 * level3west_pit_right) stood at the street's right end, x 4410..4500 up to y 850, right under the
 * last island's edge (_pl1271409531088 ends at x 4461, y 596): walking right off the island fell
 * into the box and it sent you back up to the island, again and again. Glitch had no wall or box
 * there: you fell to the pit floor.
 *
 * Pure geometry against the street data: every walk off a ledge's open end (any speed up to a full
 * walk, the key held the whole fall, frame by frame with the game's own fall, avatar-step.js) is
 * followed until it lands, and its feet must never enter a same-street pit box. The sibling, Mada
 * Tamaha's pit (js/hell.js NARAKA_TELEPORTERS), is checked the same way.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EDGE_MARGIN, NORMAL_BUFF, WALK_MAX, avatarFall } from '../public/js/avatar-step.js?v=8415ee96';
import { CAVE_PIT_TELEPORTERS, LEVEL_3_WEST_TSID } from '../public/js/cave-pit.js?v=85aad63f';
import { MADA_TAMAHA_TSID, NARAKA_TELEPORTERS } from '../public/js/hell.js?v=0dba5774';
import { inTeleporter } from '../public/js/hidden-floors.js?v=023336cb';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const loadStreet = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));

/** Walkable lines in screen space, left to right (a pc_perm 1 line is a ceiling: a fall goes through it). */
function lines(street) {
  const { l, t } = street.bounds;
  return (street.platforms || []).filter((p) => Number(p.pc_perm) !== 1).map((p) => {
    const flip = p.x1 > p.x2;
    return { id: p.id, x1: (flip ? p.x2 : p.x1) - l, y1: (flip ? p.y2 : p.y1) - t, x2: (flip ? p.x1 : p.x2) - l, y2: (flip ? p.y1 : p.y2) - t };
  });
}
const yAt = (p, x) => (p.x1 === p.x2 ? Math.max(p.y1, p.y2) : p.y1 + ((p.y2 - p.y1) * (x - p.x1)) / (p.x2 - p.x1));

/** Each ledge end a walk can go off: not joined to the next line, not at the street's clamped edge. */
function openEnds(street) {
  const ls = lines(street);
  const width = street.bounds.r - street.bounds.l;
  const out = [];
  for (const p of ls) {
    for (const [x, y, dir] of [[p.x1, p.y1, -1], [p.x2, p.y2, 1]]) {
      const joined = ls.some((q) => q !== p && (dir > 0 ? Math.abs(q.x1 - x) < 3 && Math.abs(q.y1 - y) < 6 : Math.abs(q.x2 - x) < 3 && Math.abs(q.y2 - y) < 6));
      if (joined || x <= EDGE_MARGIN || x >= width - EDGE_MARGIN) continue;
      out.push({ line: p, x, y, dir });
    }
  }
  return out;
}

/** Walk off `end` at `speed` holding the key; the feet each frame until they land (or the street's bottom). */
function walkOff(street, end, speed) {
  const ls = lines(street);
  const width = street.bounds.r - street.bounds.l;
  const height = street.bounds.b - street.bounds.t;
  const body = { vx: speed * end.dir, vy: 0, onGround: false };
  let x = end.x + end.dir;
  let y = end.y;
  const path = [{ x, y }];
  for (let frame = 0; frame < 900 && y < height; frame += 1) {
    const prevY = y;
    avatarFall(body, NORMAL_BUFF, 1);
    x = Math.max(EDGE_MARGIN, Math.min(width - EDGE_MARGIN, x + body.vx));
    y += body.vy;
    const floor = ls
      .filter((q) => q !== end.line && x >= q.x1 && x <= q.x2)
      .map((q) => yAt(q, x))
      .filter((qy) => qy >= prevY && qy <= y)
      .sort((a, b) => a - b)[0];
    if (floor !== undefined) {
      path.push({ x, y: floor, landed: true });
      return path;
    }
    path.push({ x, y });
  }
  return path;
}

/** Every walk off a ledge on the street whose feet enter one of `rows`' boxes: "line end -> box". */
function fallsIntoBoxes(street, rows) {
  const hits = new Set();
  for (const end of openEnds(street)) {
    for (let speed = 0.2; speed <= WALK_MAX + 1e-9; speed += 0.2) {
      for (const at of walkOff(street, end, speed)) {
        const row = rows.find((r) => inTeleporter(r, at.x, at.y));
        if (row) hits.add(`${end.line.id} ${end.dir > 0 ? 'right' : 'left'} end (${Math.round(end.x)}, ${Math.round(end.y)}) -> ${row.id}`);
      }
    }
  }
  return [...hits].sort();
}

describe('#755: a walk off an island over a pit lands on the floor, not in a teleporter box', () => {
  const level3 = loadStreet(LEVEL_3_WEST_TSID);
  const mada = loadStreet(MADA_TAMAHA_TSID);

  it('the walk the report made: right off the Level 2 West signpost island drops to the pit floor, clear of the box', () => {
    const end = openEnds(level3).find((e) => e.line.id === '_pl1271409531088' && e.dir > 0);
    assert.ok(end, 'the island\'s right end is open (no wall, as Glitch)');
    for (const speed of [0.2, 1, WALK_MAX]) {
      const path = walkOff(level3, end, speed);
      const last = path.at(-1);
      assert.ok(last.landed && last.y > 950, `lands on the floor at speed ${speed} (${Math.round(last.x)}, ${Math.round(last.y)})`);
      const right = CAVE_PIT_TELEPORTERS.find((r) => r.id === 'level3west_pit_right');
      assert.equal(path.some((p) => inTeleporter(right, p.x, p.y)), false, `never in the right box at speed ${speed}`);
    }
  });

  it('Level 3 West: no walk off any ledge enters either pit box', () => {
    assert.deepEqual(fallsIntoBoxes(level3, CAVE_PIT_TELEPORTERS), []);
  });

  it('Mada Tamaha (the sibling): no walk off any ledge enters either pit box', () => {
    assert.deepEqual(fallsIntoBoxes(mada, NARAKA_TELEPORTERS), []);
  });

  it('each pit box still catches its floor: the feet standing on it, walked in from the street\'s middle', () => {
    for (const [street, rows] of [[level3, CAVE_PIT_TELEPORTERS], [mada, NARAKA_TELEPORTERS]]) {
      const ls = lines(street);
      for (const row of rows) {
        const floor = ls.filter((q) => row.box.x >= q.x1 && row.box.x <= q.x2).map((q) => yAt(q, row.box.x)).filter((y) => y <= row.box.y && y >= row.box.y - row.box.h);
        assert.ok(floor.length, `${row.id}: a floor runs through its box`);
      }
    }
  });
});
