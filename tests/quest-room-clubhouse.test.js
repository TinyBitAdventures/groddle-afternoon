/**
 * Join the Club (quest-rooms/clubhouse.js): source constants, the noticing
 * puzzle, and reachability of both rebuilt locations against the avatar's
 * jump (about 110 px apex, 200 px carry; rooms keep rises <= 100 and gaps
 * <= 150 like puzzle-kit.js).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as kit from '../public/js/quest-rooms/kit.js?v=g458-1';
import * as club from '../public/js/quest-rooms/clubhouse.js?v=g463-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const JUMP_RISE = 100;
const JUMP_GAP = 150;
const DROP_GAP = 220;

/** Platforms reachable from `start` by walking, ladders and ordinary jumps. */
function reachable(platforms, walls, startId) {
  const yAt = (p, x) => kit.surfaceAt(p, x);
  const seen = new Set([startId]);
  const queue = [startId];
  const byId = Object.fromEntries(platforms.map((p) => [p.id, p]));
  while (queue.length) {
    const a = byId[queue.shift()];
    for (const b of platforms) {
      if (seen.has(b.id)) continue;
      let ok = false;
      // Walk across touching ends.
      for (const [xa, xb] of [[a.x2, b.x1], [a.x1, b.x2]]) {
        if (Math.abs(xa - xb) <= 2 && Math.abs(yAt(a, xa) - yAt(b, xb)) <= 6) ok = true;
      }
      // Overlapping in x: step up within a jump, or drop down.
      const lo = Math.max(a.x1, b.x1);
      const hi = Math.min(a.x2, b.x2);
      if (!ok && lo <= hi) {
        for (let x = lo; x <= hi; x += 10) {
          const rise = yAt(a, x) - yAt(b, x);
          if (rise <= JUMP_RISE) ok = true;
        }
      }
      // A gap between the ends.
      if (!ok) {
        const gapR = b.x1 - a.x2;
        const gapL = a.x1 - b.x2;
        if (gapR > 0 && gapR <= DROP_GAP) {
          const rise = yAt(a, a.x2) - yAt(b, b.x1);
          ok = rise <= JUMP_RISE && (rise <= 0 || gapR <= JUMP_GAP);
        }
        if (!ok && gapL > 0 && gapL <= DROP_GAP) {
          const rise = yAt(a, a.x1) - yAt(b, b.x2);
          ok = rise <= JUMP_RISE && (rise <= 0 || gapL <= JUMP_GAP);
        }
      }
      // Ladders join the platform at their foot to the one at their top.
      for (const w of walls) {
        const onA = yAt(a, w.x) != null;
        const onB = yAt(b, w.x) != null;
        if (!onA || !onB) continue;
        const ends = [yAt(a, w.x), yAt(b, w.x)];
        if (ends.every((y) => y >= w.yTop - 10 && y <= w.yBot + 2)) ok = true;
      }
      if (ok) {
        seen.add(b.id);
        queue.push(b.id);
      }
    }
  }
  return seen;
}

describe('Join the Club (clubhouse)', () => {
  let quests;
  before(() => {
    quests = JSON.parse(readFileSync(join(root, 'public/assets/content/quests.json'), 'utf8'));
  });

  it('keeps the source quest data, timers and reach', () => {
    const q = quests.join_club;
    assert.deepEqual(q.requirements.map((r) => r.name), ['solved_puzzle', 'instance_exit_via_signpost', 'talk_to_butler']);
    assert.equal(q.rewards.currants, 750);
    assert.equal(q.rewards.favor['0'].points, 100);
    const r = quests.join_club_reminisce;
    assert.deepEqual(r.requirements.map((x) => x.name), ['solved_puzzle', 'instance_exit_via_signpost']);
    assert.equal(r.rewards.currants, 200);
    assert.equal(r.rewards.favor['0'].points, 25);
    assert.equal(club.ROOM_MS, 5 * 60 * 1000);
    assert.equal(club.PICTURE_REACH, 175);
    assert.equal(club.BUTTON_RESET_MS, 1000);
    assert.deepEqual(club.INTRO_LINES, ['Clubs can be very exclusive!', 'In this case, only the observant may enter.']);
    assert.equal(club.room.id, 'clubhouse');
    assert.equal(club.room.stageLabel('clubhouse'), 'The Society of Keen-Eyed Noticers');
    assert.equal(club.room.stageLabel('pintura'), 'Pintura Prosa');
  });

  it('has one fair answer per frame, each noticed once in the village', () => {
    const answers = club.FRAMES.map((f) => f.answer);
    assert.deepEqual(answers, ['moon', 'tree', 'goat', 'rain']);
    assert.deepEqual(club.SIGNS.map((s) => s.sketch).sort(), [...answers].sort());
    assert.equal(new Set(club.SIGNS.map((s) => s.hut)).size, 4);
    const all = club.FRAMES.flatMap((f) => f.options);
    assert.equal(new Set(all).size, all.length, 'no picture repeats across frames');
    for (const f of club.FRAMES) {
      assert.ok(f.options.includes(f.answer));
      // Only the answer of each frame hangs in a hut: the others are decoys.
      const inVillage = f.options.filter((o) => club.SIGNS.some((s) => s.sketch === o));
      assert.deepEqual(inVillage, [f.answer]);
    }
    for (const id of all) assert.ok(club.SKETCH_IDS.includes(id), `${id} is drawn`);
  });

  it('flips frames with their buttons and solves only on the right pictures', () => {
    let c = club.initialChoices();
    assert.equal(club.framesSolved(c), false);
    assert.deepEqual(c.map((_, i) => club.shownSketch(c, i)), ['cauldron', 'bird', 'boot', 'sailboat']);
    // A full turn of any button comes back round.
    let spun = c;
    for (let k = 0; k < 4; k++) spun = club.cycleFrame(spun, 2);
    assert.deepEqual(spun, c);
    const need = club.pressesToSolve(c);
    assert.deepEqual(need, [1, 2, 3, 1]);
    for (const [i, n] of need.entries()) for (let k = 0; k < n; k++) c = club.cycleFrame(c, i);
    assert.equal(club.framesSolved(c), true);
    assert.deepEqual(club.pressesToSolve(c), [0, 0, 0, 0]);
    assert.equal(club.framesSolved(club.cycleFrame(c, 0)), false);
  });

  it('reaches every deck of the treehouse village from the floor', () => {
    const plats = club.clubPlatforms(kit);
    const walls = club.clubWalls(kit);
    const got = reachable(plats, walls, 'club_floor');
    for (const p of plats) assert.ok(got.has(p.id), `${p.id} reachable`);
    // The jars hut is only reached by its ladder (no jump from below).
    const jars = plats.find((p) => p.id === 'deck_jars');
    const landing = plats.find((p) => p.id === 'deck_landing');
    assert.ok(landing.y1 - jars.y1 > JUMP_RISE + 10);
    // Bridges join their decks end to end.
    for (const b of club.BRIDGES) {
      const from = Object.values(club.DECKS).find((d) => (d.x2 === b.from[0] || d.x1 === b.from[0]) && d.y === b.from[1]);
      const to = Object.values(club.DECKS).find((d) => (d.x1 === b.to[0] || d.x2 === b.to[0]) && d.y === b.to[1]);
      assert.ok(from && to, `${b.id} joins two decks`);
    }
    for (const l of club.LADDERS) {
      const top = plats.find((p) => p.id !== 'club_floor' && kit.surfaceAt(p, l.x) === l.yTop);
      assert.ok(top, `${l.id} tops out on a deck`);
    }
  });

  it('keeps what you must see or click within 160 px of its floor', () => {
    for (const h of club.clickHeights()) assert.ok(h.up <= 160, `${h.id} is ${h.up} px up`);
    // Each hut sign hangs on its own hut.
    for (const s of club.SIGNS) {
      const hut = club.HUTS[s.hut];
      assert.ok(hut.sign.x > hut.x1 && hut.sign.x < hut.x2, `${s.hut} sign on its wall`);
    }
    // Frames and buttons stand on the clubhouse wall, ENTER beside the door.
    const c = club.CLUBHOUSE;
    for (const x of c.frameXs) assert.ok(x > c.wallX1 && x < c.wallX2);
    assert.ok(c.enterX > c.frameXs[3] && c.enterX < c.door.x1);
    assert.ok(c.fireplaceX > c.door.x2 && c.fireplaceX < club.DECKS.club.x2);
    // Every quoin hangs within reach above some walk line.
    const plats = club.clubPlatforms(kit);
    for (const q of club.CLUB_QUOINS) {
      const under = plats.map((p) => kit.surfaceAt(p, q.x)).filter((y) => y != null && y >= q.y);
      assert.ok(under.some((y) => y - q.y <= 110), `quoin ${q.id}`);
    }
    // The interior quoins are behind the door.
    for (const q of club.CLUB_QUOINS.filter((x) => x.id.startsWith('i'))) assert.ok(q.x > c.door.x2);
  });

  it('crosses Pintura Prosa pad to pad to the exit signpost', () => {
    const plats = club.prosaPlatforms(kit);
    const got = reachable(plats, [], 'prosa_floor');
    for (const p of plats) assert.ok(got.has(p.id), `${p.id} reachable`);
    // Pads climb and fall one hop at a time.
    const path = club.PADS.filter((p) => !p.step);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const gap = (b.x - b.half) - (a.x + a.half);
      assert.ok(gap <= 100, `${b.id} gap ${gap}`);
      assert.ok(a.y - b.y <= 90, `${b.id} rise ${a.y - b.y}`);
    }
    const qurazy = club.PROSA_QUOINS.filter((q) => q.type === 'qurazy');
    assert.equal(qurazy.length, 5);
    for (const q of club.PROSA_QUOINS) {
      const under = plats.map((p) => kit.surfaceAt(p, q.x)).filter((y) => y != null && y >= q.y);
      assert.ok(under.some((y) => y - q.y <= 110), `quoin ${q.id}`);
    }
    assert.ok(club.SIGNPOST.x > club.PADS[club.PADS.length - 1].x && club.SIGNPOST.x < club.PROSA_W);
    assert.equal(club.SIGNPOST.y, club.PROSA_FLOOR);
  });

  it('ships its recovered art', () => {
    for (const f of ['club_house_picture', 'wall_button_lockIn', 'wall_button_lockOut', 'fireplace']) {
      assert.ok(existsSync(join(root, 'public/assets/sprites/quest-rooms/clubhouse', `${f}.png`)), f);
    }
    const src = readFileSync(join(root, 'public/js/quest-rooms/clubhouse.js'), 'utf8');
    const decos = [...src.matchAll(/(?:deco|at)\(PIXI, '([a-z0-9_]+)'|at\('([a-z0-9_]+)'/g)].map((m) => m[1] || m[2]);
    assert.ok(decos.length > 20);
    for (const d of new Set(decos)) {
      if (d === 'fireplace') continue;
      assert.ok(existsSync(join(root, 'public/assets/decos/groddle', `${d}.webp`)), `deco ${d}`);
    }
  });
});
