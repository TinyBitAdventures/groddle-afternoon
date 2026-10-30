/**
 * An Autumn Day (public/js/quest-rooms/an-autumn-day.js): source constants,
 * the word climbs (every drifting word is needed to cross the wood), the
 * sentence puzzle, and the three feeling rooms.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as kit from '../public/js/quest-rooms/kit.js?v=g458-1';
import { QUEST_ROOMS, roomModulePath } from '../public/js/quest-rooms/catalog.js';
import { questSceneTsid } from '../public/js/quest-instance.js';
import {
  AUTUMN_MS,
  BODY_H,
  CAPTION,
  CLEARING,
  ENDINGS,
  FEELINGS,
  FEELING_LABEL,
  LINGER_MS,
  MAIN,
  MAIN_LABEL,
  ROOM,
  ROOM_ID,
  SCRAMBLE,
  SENTENCE,
  SOURCE_TSIDS,
  cycleWord,
  feelingCaption,
  feelingFor,
  feelingLayout,
  feelingPlatforms,
  mainBarriers,
  mainPlatforms,
  mainWords,
  room,
  sentenceReady,
  sentenceSlots,
  slotCorrect,
  touchesToSolve,
} from '../public/js/quest-rooms/an-autumn-day.js?v=g458-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = (p) => join(root, 'public', p);

/** An ordinary jump peaks near 110 px (the other rooms' measured apex). */
const JUMP_RISE = 105;
const JUMP_GAP = 140;

/**
 * Rightward reachability over the main wood. The floor is cut at each wall
 * (a wall is solid to a player walking right), so a floor segment beyond a
 * wall is reached only from a surface above the wall's top.
 */
function reachable(platforms, barriers, without = new Set()) {
  const floor = platforms.find((p) => p.id === 'aad_floor');
  const cuts = barriers.map((b) => b.x).sort((a, b) => a - b);
  const edges = [floor.x1, ...cuts, floor.x2];
  const nodes = [];
  for (let i = 0; i < edges.length - 1; i++) nodes.push({ id: `floor${i}`, x1: edges[i], x2: edges[i + 1], y: floor.y1, floor: true });
  for (const p of platforms) {
    if (p === floor || without.has(p.id)) continue;
    nodes.push({ id: p.id, x1: p.x1, x2: p.x2, y: p.y1 });
  }
  const gap = (a, b) => Math.max(0, Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2));
  // Walking or jumping right past a wall needs a start high enough to clear its top.
  const wallBetween = (a, b) => barriers.some((w) => a.x2 <= w.x + 1 && b.x1 >= w.x - 1 && b.x2 > w.x + 1 && a.y - JUMP_RISE > w.y);
  const seen = new Set(['floor0']);
  const queue = [nodes[0]];
  while (queue.length) {
    const a = queue.shift();
    for (const b of nodes) {
      if (seen.has(b.id)) continue;
      if (a.floor && b.floor) continue;
      const rise = a.y - b.y;
      if (rise > JUMP_RISE) continue;
      if (gap(a, b) > JUMP_GAP) continue;
      if (wallBetween(a, b)) continue;
      seen.add(b.id);
      queue.push(b);
    }
  }
  return { seen, nodes };
}

describe('An Autumn Day (an_autumn_day): source', () => {
  it('maps both quests to this room and keeps the source instance', () => {
    assert.equal(QUEST_ROOMS.an_autumn_day, ROOM_ID);
    assert.equal(QUEST_ROOMS.an_autumn_day_part2, ROOM_ID);
    assert.ok(existsSync(join(root, 'public/js/quest-rooms', roomModulePath(ROOM_ID))));
    assert.equal(AUTUMN_MS, 5 * 60 * 1000);
    assert.equal(room.durationMs, AUTUMN_MS);
    assert.equal(room.firstStage, 'main');
    assert.equal(questSceneTsid(ROOM_ID, 'wonder'), 'QI_AN_AUTUMN_DAY_WONDER');
    assert.deepEqual(SOURCE_TSIDS, {
      main: 'LUVCCQSMDIB3HOI',
      stillness: 'LUVCL0STDIB37HE',
      comfort: 'LUVCLOOUDIB3432',
      wonder: 'LUVCMAKVDIB33B4',
    });
    assert.equal(room.stageLabel('main'), MAIN_LABEL);
    for (const f of FEELINGS) assert.equal(room.stageLabel(f), FEELING_LABEL);
  });

  it('matches the quest catalog: one leave flag, no rewards, four locations', () => {
    const quests = JSON.parse(readFileSync(pub('assets/content/quests.json'), 'utf8'));
    const list = Array.isArray(quests) ? quests : quests.quests || Object.values(quests);
    for (const id of ['an_autumn_day', 'an_autumn_day_part2']) {
      const q = list.find((row) => row.classTsid === id);
      assert.ok(q, id);
      assert.deepEqual(q.requirements.map((r) => [r.type, r.name]), [['flag', 'leave']]);
      assert.deepEqual(q.rewards, {});
      assert.deepEqual(q.locations, ['an_autumn_day', 'an_autumn_day_stillness', 'an_autumn_day_comfort', 'an_autumn_day_wonder']);
    }
  });

  it('ships its art and the recovered AUTUMN_DAY music', () => {
    for (const f of ['crow.png', 'bird_red.png', 'bird_icon.png']) assert.ok(existsSync(pub(`assets/sprites/quest-rooms/an_autumn_day/${f}`)), f);
    assert.ok(existsSync(pub('assets/audio/sfx/AUTUMN_DAY.mp3')));
    for (const d of ['heights_tree_bare_1', 'heights_tree_bare_3', 'tree_bare_tall_1', 'background_ghost_transparent']) {
      assert.ok(existsSync(pub(`assets/decos/groddle/${d}.webp`)), d);
    }
    // Desk FOOTWORDS (G314): GSJS's own words (inc_data_maps_prod.js 17952-17954), not the footage's.
    assert.equal(CAPTION, 'This feeling of …');
    assert.equal(CAPTION, FEELING_LABEL);
  });
});

describe('An Autumn Day: the drifting words', () => {
  it('drifts the words of the sentence and its three endings', () => {
    const words = mainWords();
    assert.equal(words.length, 6);
    assert.deepEqual(new Set(words.map((w) => w.text)), new Set([...SENTENCE, ...ENDINGS]));
  });

  it('reaches the clearing, and only by standing on every word', () => {
    const plats = mainPlatforms(kit);
    const walls = mainBarriers();
    for (const w of walls) assert.ok(w.h > 110, `${w.id} is taller than a jump (${w.h})`);
    const last = `floor${walls.length}`;
    assert.ok(reachable(plats, walls).seen.has(last), 'the clearing is reachable');
    for (const w of mainWords()) {
      const { seen } = reachable(plats, walls, new Set([`aad_word_${w.id}`]));
      assert.ok(!seen.has(last), `skipping "${w.text}" still reaches the clearing`);
    }
  });

  it('keeps each next word one hop above the last surface (visible band)', () => {
    const plats = mainPlatforms(kit);
    for (const w of mainWords()) {
      const below = plats.filter((p) => p.id !== `aad_word_${w.id}` && p.y1 > w.y && p.x2 >= w.x - w.w / 2 - JUMP_GAP && p.x1 <= w.x + w.w / 2 + JUMP_GAP);
      const rise = Math.min(...below.map((p) => p.y1 - w.y));
      assert.ok(rise <= JUMP_RISE && rise <= 160, `${w.id} rises ${rise}`);
    }
  });
});

describe('An Autumn Day: the sentence', () => {
  it('starts scrambled and cycles each slot', () => {
    assert.deepEqual([...SENTENCE], ['This', 'feeling', 'of']);
    assert.deepEqual([...SCRAMBLE], ['feeling', 'of', 'This', 'comfort.']);
    assert.equal(sentenceSlots().length, SCRAMBLE.length);
    assert.equal(sentenceReady(SCRAMBLE), false);
    assert.equal(cycleWord(0, 'This'), 'feeling');
    assert.equal(cycleWord(0, 'of'), 'This');
    assert.equal(cycleWord(3, 'wonder.'), 'stillness.');
    assert.equal(cycleWord(3, 'comfort.'), 'wonder.');
    assert.ok(slotCorrect(3, 'stillness.'));
    assert.ok(!slotCorrect(1, 'of'));
    assert.equal(touchesToSolve(SCRAMBLE, 'wonder.'), 7);
    assert.equal(touchesToSolve(SCRAMBLE, 'comfort.'), 6);
  });

  it('leads to the room its last word names', () => {
    for (const end of ENDINGS) {
      const words = [...SENTENCE, end];
      assert.ok(sentenceReady(words));
      assert.equal(feelingFor(words), end.replace('.', ''));
    }
    assert.equal(feelingCaption('wonder'), 'This feeling of wonder.');
    // A six-word row from an old save is not a sentence.
    assert.equal(sentenceReady(['Almost', 'forgot', 'this', 'feeling', 'of', 'wonder.']), false);
    assert.equal(feelingFor(['x']), null);
  });

  it('changes words only when jumping, and keeps the row low enough to see', () => {
    const F = MAIN.FLOOR;
    for (const s of sentenceSlots()) {
      // Walking: the body (F - BODY_H .. F) stays under the slot.
      assert.ok(s.y + s.h / 2 < F - BODY_H - 4, `slot ${s.i} hit while walking`);
      // A jump's apex puts the head well into it.
      assert.ok(F - 110 - BODY_H < s.y - s.h / 2, `slot ${s.i} out of reach`);
      assert.ok(F - s.y <= 160, `slot ${s.i} above the visible band`);
      assert.ok(s.x > CLEARING.x1 && s.x < MAIN.W - 200);
    }
    assert.ok(CLEARING.land.x > CLEARING.x1 && CLEARING.land.x < sentenceSlots()[0].x);
  });
});

describe('An Autumn Day: the feeling rooms', () => {
  it('has a bench, an exit at the left and a Qurazy Quoin within a jump', () => {
    assert.equal(LINGER_MS, 12_000);
    for (const f of FEELINGS) {
      const lay = feelingLayout(f);
      const plats = feelingPlatforms(kit, f);
      assert.ok(lay.exit.x < 200 && lay.spawn.x > lay.bench.x + 100 && lay.spawn.x < ROOM.W - 100, f);
      const q = lay.quoin;
      // From the floor or the bench a jump's body sweeps through the quoin.
      const ok = plats.some((p) => q.x >= p.x1 && q.x <= p.x2 && p.y1 - 110 - BODY_H <= q.y + 20 && p.y1 - 110 >= q.y - 20);
      assert.ok(ok, `${f} quoin out of reach`);
      assert.ok(ROOM.FLOOR - q.y <= 180, `${f} quoin too high to see`);
    }
  });
});

describe('An Autumn Day: the look of the Snaps (G75)', () => {
  it('draws three haze layers of CC0 limbo1 trees with red puffs, saplings, bushes and a far-right fence', async () => {
    const { createHash } = await import('node:crypto');
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
    const { AN_AUTUMN_DAY_FILES } = await import('../public/js/an-autumn-day-art.js');
    const mod = await import('../public/js/quest-rooms/an-autumn-day.js?v=g458-1');
    const plan = JSON.parse(readFileSync(join(spike, 'tools/room-art/an_autumn_day.json'), 'utf8'));
    assert.match(plan.source, /glitch-locations limbo1\.swf \(CC0\)/);
    assert.deepEqual(Object.keys(plan.pieces).sort(), Object.keys(AN_AUTUMN_DAY_FILES).sort());
    for (const [name, row] of Object.entries(plan.pieces)) {
      const [file, w, h] = AN_AUTUMN_DAY_FILES[name];
      assert.deepEqual([file, w, h], [row.file, ...row.world]);
      const bytes = readFileSync(join(spike, 'public/assets/sprites/quest-rooms/an_autumn_day', file));
      assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 16), row.sha, `${file} changed since the build`);
    }
    assert.equal(plan.pieces.blur_tree_03_white.swf, 'bundle:limbo1.swf#blur_tree_03');
    // Three haze layers, far to near: slower parallax first, each darker and more opaque.
    assert.equal(mod.HAZE.length, 3);
    for (let i = 1; i < 3; i++) {
      assert.ok(mod.HAZE[i].f > mod.HAZE[i - 1].f);
      assert.ok(mod.HAZE[i].alpha > mod.HAZE[i - 1].alpha);
    }
    // About two saplings to a view, two in each feeling room; bushes on the ground.
    assert.ok(mod.MAIN_SAPLINGS.length >= Math.floor(mod.MAIN.W / 960));
    assert.equal(mod.FEELING_SAPLINGS.length, 2);
    for (const [x] of [...mod.MAIN_SAPLINGS, ...mod.MAIN_BUSHES]) assert.ok(x >= 0 && x <= mod.MAIN.W);
    for (const [x] of [...mod.FEELING_SAPLINGS, ...mod.FEELING_BUSHES]) assert.ok(x >= 0 && x <= mod.ROOM.W);
    // G98: the Snaps frame each feeling room with a sapling at ~15% and ~85% of the view (camera x 320),
    // tall enough to rise past the view's top (feet 306 px down).
    const [left, right] = [...mod.FEELING_SAPLINGS].sort((a, b) => a[0] - b[0]).map(([x]) => (x - 320) / 960);
    assert.ok(left > 0.1 && left < 0.22, `left sapling at ${left}`);
    assert.ok(right > 0.78 && right < 0.92, `right sapling at ${right}`);
    for (const [, h] of [...mod.MAIN_SAPLINGS, ...mod.FEELING_SAPLINGS]) assert.ok(h > 306 + 200, 'rises past the top of the view');
    const src = readFileSync(join(spike, 'public/js/quest-rooms/an-autumn-day.js'), 'utf8');
    // The only fences are small ones at each place's far right.
    const fences = [...src.matchAll(/drawFence\(g, (\d+), (\d+), FLOOR\)/g)].map((m) => [+m[1], +m[2]]);
    assert.deepEqual(fences, [[4250, 4380], [1260, 1390]]);
    assert.doesNotMatch(src, /drawWoodTree|heights_tree_bare/);
  });
});
