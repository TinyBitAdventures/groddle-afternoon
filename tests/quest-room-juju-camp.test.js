/**
 * Carry That Weight (help_juju_bandits, help_juju_bandits_2): the Juju
 * Hideout room and the dig-site hunt (public/js/quest-rooms/juju-camp.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as kit from '../public/js/quest-rooms/kit.js?v=g458-1';
import * as mod from '../public/js/quest-rooms/juju-camp.js?v=g463-1';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const street = (tsid) => JSON.parse(readFileSync(join(ROOT, 'assets', 'streets', `${tsid}.json`), 'utf8'));
const quests = JSON.parse(readFileSync(join(ROOT, 'assets', 'content', 'quests.json'), 'utf8'));
const questDef = (id) => (Array.isArray(quests) ? quests : quests.quests || Object.values(quests)).find?.((q) => q.classTsid === id) || quests[id] || quests.quests?.[id];

/** A seeded rng for deterministic picks. */
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('Carry That Weight hint table (buildHintTable)', () => {
  it('has four hubs of five streets, each an imported street with a juju_dig box', () => {
    assert.deepEqual(mod.HUBS, ['baqala', 'zhambu', 'xalanga', 'choru']);
    for (const hub of mod.HUBS) assert.equal(Object.keys(mod.HINTS[hub]).length, 5, hub);
    const all = mod.HUBS.flatMap((h) => Object.keys(mod.HINTS[h]));
    assert.equal(all.length, 20);
    assert.deepEqual([...all].sort(), Object.keys(mod.LOCATION_TSIDS).sort());
    for (const loc of all) {
      const tsid = mod.streetForLocation(loc);
      assert.ok(existsSync(join(ROOT, 'assets', 'streets', `${tsid}.json`)), `${loc} ${tsid}`);
      const s = street(tsid);
      const box = mod.digBox(s);
      assert.ok(box, `${loc} has juju_dig`);
      // The box sits inside the street and over a walkable surface.
      const width = s.bounds.r - s.bounds.l;
      assert.ok(box.x >= 0 && box.x <= width, `${loc} box x ${box.x}`);
      // You can stand inside it: some walkable surface under the box falls in its band.
      const standable = s.platforms.some((p) => {
        if (p.pc_perm === 1) return false;
        const x1 = p.x1 - s.bounds.l;
        const x2 = p.x2 - s.bounds.l;
        for (let x = box.x - box.w / 2; x <= box.x + box.w / 2; x += 10) {
          if (x < Math.min(x1, x2) || x > Math.max(x1, x2)) continue;
          const y = p.y1 + ((x - x1) / (x2 - x1 || 1)) * (p.y2 - p.y1) - s.bounds.t;
          if (mod.inDigBox(box, x, y)) return true;
        }
        return false;
      });
      assert.ok(standable, `${loc} box is standable`);
      assert.ok(mod.isClueStreet({ location: loc }, tsid));
      assert.ok(mod.isClueStreet({ location: loc }, mod.LOCATION_TSIDS[loc]));
    }
  });

  it('keeps the source text and titles', () => {
    assert.equal(mod.HINTS.baqala.dust_path.text, 'Dead-end on a trail of dust. Behind the big tree.');
    assert.equal(mod.HINTS.choru.putter_track.text, 'If you try golfing in the northeast, avoid this dirt trap.');
    for (const hub of mod.HUBS) {
      for (const clue of Object.values(mod.HINTS[hub])) assert.equal(clue.title, `Hidden in ${hub[0].toUpperCase()}${hub.slice(1)}`);
    }
  });

  it('matches the quest data (three clues, the Paperweight, the 21 locations)', () => {
    const q1 = questDef('help_juju_bandits');
    const q2 = questDef('help_juju_bandits_2');
    assert.ok(q1 && q2);
    const clue = q1.requirements.find((r) => r.name === 'solve_clue');
    assert.equal(clue.num, mod.CLUES);
    assert.ok(q1.requirements.some((r) => r.type === 'item' && r.classId === 'juju_paperweight'));
    assert.equal(q1.locations.length, 21);
    assert.equal(q2.requirements[0].name, 'return_weight');
    assert.equal(q2.rewards.xp, 1000);
    assert.equal(q2.rewards.currants, 500);
    assert.equal(q2.rewards.mood, 250);
    assert.deepEqual(q1.chainOffers, ['help_juju_bandits_2']);
  });
});

describe('Carry That Weight hunt rules', () => {
  it('picks the first hub from where you accept (default Choru)', () => {
    assert.equal(mod.hubForStart('86'), 'baqala');
    assert.equal(mod.hubForStart(91), 'zhambu');
    assert.equal(mod.hubForStart('95'), 'xalanga');
    assert.equal(mod.hubForStart('90'), 'choru');
    assert.equal(mod.hubForStart('27'), 'choru');
    assert.equal(mod.hubForStart(''), 'choru');
    const h = mod.newHunt('86', rng(4));
    assert.equal(h.hub, 'baqala');
    assert.ok(mod.HINTS.baqala[h.location]);
    assert.equal(h.hint, 0);
    assert.ok(['red', 'green', 'yellow'].includes(h.color));
  });

  it('never reuses a hub across the three clues', () => {
    for (let seed = 1; seed < 200; seed++) {
      const r = rng(seed);
      const h = mod.newHunt(['86', '91', '95', '90', ''][seed % 5], r);
      const hubs = [h.hub];
      for (let i = 1; i < mod.CLUES; i++) {
        assert.ok(mod.nextClue(h, r));
        hubs.push(h.hub);
        assert.ok(mod.clueFor(h));
      }
      assert.equal(new Set(hubs).size, mod.CLUES, hubs.join());
    }
    const h = mod.newHunt('90', rng(2));
    for (let i = 0; i < 3; i++) mod.nextClue(h, rng(i + 3));
    assert.equal(mod.nextClue(h), false, 'four hubs only');
  });

  it('arms digging only after the box, within +-100 px of it', () => {
    const box = { x: 1000, y: 900, w: 400, h: 200 };
    assert.deepEqual(mod.digRange(box), { left: 700, right: 1300 });
    assert.ok(mod.inDigBox(box, 1000, 900));
    assert.ok(mod.inDigBox(box, 1000, 990));
    assert.ok(!mod.inDigBox(box, 1000, 1010));
    assert.ok(!mod.inDigBox(box, 1000, 650));
    assert.ok(!mod.inDigBox(box, 1250, 900));
    const armed = mod.digRange(box);
    assert.ok(!mod.canDig({ armed: null, x: 1000 }));
    assert.ok(mod.canDig({ armed, x: 1290 }));
    assert.ok(!mod.canDig({ armed, x: 1300 }));
    assert.ok(!mod.canDig({ armed, x: 1000, hasPaperweight: true }));
    assert.equal(mod.digOutcome(1), 'next');
    assert.equal(mod.digOutcome(2), 'next');
    assert.equal(mod.digOutcome(3), 'paperweight');
  });

  it('keeps the source messages and timers', () => {
    assert.equal(mod.TEXT.digHere, 'Seems like this might be a good place to dig…');
    assert.equal(mod.TEXT.cantDig, "There's nothing to dig up here.");
    assert.equal(mod.TEXT.exitPrompt, "All done here! Press OK when you're ready to leave.");
    assert.equal(mod.OPEN_HINT_MS, 1500);
    assert.equal(mod.CAMP_MS, 300_000);
    assert.equal(mod.room.durationMs, 300_000);
    assert.equal(mod.HUNT_KEY, 'room:juju_camp:hunt');
  });
});

describe('Juju Hideout room', () => {
  it('has Grandma’s conversations and the grandson scene lines', () => {
    assert.equal(mod.GRANDMA.explain_task.length, 6);
    assert.equal(mod.GRANDMA.explain_task.at(-1).response, 'OK.');
    assert.equal(mod.KID_LINES.length, 8);
    assert.equal(mod.GRANDMA_LINES.length, 8);
    assert.deepEqual([...mod.ANGRY_LINES], [0, 1, 4, 5]);
    assert.equal(mod.FIRST_LINE, 7);
    assert.equal(mod.SCENE.walkSpeed, 150);
    // The kid's 8.5 s timer covers the 1254 px walk at 150 px/s.
    const walk = Math.abs(mod.SCENE.kidStopX - mod.SCENE.kidSpawnX) / mod.SCENE.walkSpeed;
    assert.ok(walk * 1000 <= mod.SCENE.walkMs, `${walk}s`);
  });

  it('puts spawn, Grandma, the kid path and the trigger line on one floor inside the camp', () => {
    const plats = mod.campPlatforms(kit);
    const floor = plats.find((p) => p.id === 'jc_floor');
    const W = mod.BOUNDS.r - mod.BOUNDS.l;
    assert.equal(floor.x1, 0);
    assert.equal(floor.x2, W);
    for (const x of [mod.SPAWN.x, mod.GRANDMA_X, mod.SCENE.kidSpawnX, mod.SCENE.kidStopX, mod.SCENE.pcTriggerX]) {
      assert.ok(mod.sx(x) > 40 && mod.sx(x) < W - 40, `x ${x}`);
    }
    // Spawn drops a few px onto the floor; the room shows ~300 px above it.
    const drop = mod.sy(mod.FLOOR_Y) - mod.sy(mod.SPAWN.y);
    assert.ok(drop >= 0 && drop < 20, `drop ${drop}`);
    // Grandma sits left of the kid's stop and of the -2000 trigger, so meeting her starts the scene.
    assert.ok(mod.GRANDMA_X < mod.SCENE.kidStopX);
    assert.ok(mod.GRANDMA_X + mod.GRANDMA_HIT.w / 2 < mod.SCENE.pcTriggerX);
    // You walk to her from the spawn without passing her box.
    assert.ok(mod.SPAWN.x - mod.GRANDMA_X > mod.GRANDMA_HIT.w);
  });

  it('ships its art', () => {
    const art = join(ROOT, 'assets', 'sprites', 'quest-rooms', 'juju_camp');
    for (const f of ['grandma_idle', 'grandma_talk', 'grandma_angry']) assert.ok(existsSync(join(art, `${f}.png`)), f);
    for (const c of ['red', 'green', 'yellow']) {
      for (const s of ['spawn', 'walk', 'walk_end', 'shrink']) assert.ok(existsSync(join(art, `bandit_${c}_${s}.png`)), `${c} ${s}`);
    }
    for (const cls of Object.keys(mod.ITEMS)) assert.ok(existsSync(join(ROOT, 'assets', 'sprites', 'icons', `${cls}.png`)), cls);
    for (const d of ['juju_grandma_tent_01a_al1', 'juju_grandma_campfire_01a_al1', 'juju_grandma_papers_01a_al1']) {
      assert.ok(existsSync(join(ROOT, 'assets', 'decos', 'groddle', `${d}.webp`)), d);
    }
  });

  it('fails a run left before the first hint and keeps the quest after it', () => {
    const ctx = (given, questId = 'help_juju_bandits') => ({ data: { givenItems: given }, questId });
    assert.deepEqual(mod.room.onLeave(ctx(false), 'abandoned'), {});
    assert.deepEqual(mod.room.onLeave(ctx(true), 'complete'), { keepQuest: true, leaveFlag: false, noTurnIn: true });
    assert.deepEqual(mod.room.onLeave(ctx(false, 'help_juju_bandits_2'), 'abandoned'), {});
    assert.deepEqual(mod.room.onLeave(ctx(false, 'help_juju_bandits_2'), 'complete'), { leaveFlag: false });
  });
});

describe('Juju Hideout look (G70, players Snaps)', () => {
  it('is dusk, with two teepees, the papers, the campfire, the chair and a dirt mound', async () => {
    const { JUJU_CAMP_FILES } = await import('../public/js/juju-camp-art.js');
    const { createHash } = await import('node:crypto');
    const plan = JSON.parse(readFileSync(join(ROOT, '..', 'tools/room-art/juju_camp.json'), 'utf8'));
    // A mauve to pink-brown sky, no daytime blue anywhere in it.
    for (const [, hex] of mod.JUJU_DUSK.sky) {
      const [r, , b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      assert.ok(r > b, `${hex} is warm`);
    }
    const names = mod.CAMP_PIECES.map(([n]) => n);
    assert.equal(names.filter((n) => n === 'juju_grandma_tent_01a_al1').length, 2);
    const tents = mod.CAMP_PIECES.filter(([n]) => n.includes('tent')).map(([, x]) => x);
    assert.ok(Math.min(...tents) < mod.GRANDMA_X && Math.max(...tents) > mod.GRANDMA_X, 'teepees either side of Grandma');
    for (const n of ['juju_grandma_papers_01a_al1', 'juju_grandma_campfire_01a_al1']) assert.ok(names.includes(n), n);
    for (const n of new Set([...names, 'mound_dirt_2', 'rock_rubble_01a_al1'])) {
      assert.ok(existsSync(join(ROOT, 'assets/decos/groddle', `${n}.webp`)), n);
    }
    // The chair is a room-art render of the CC0 alpine_landscape deco, matching its plan.
    assert.match(plan.source, /glitch-locations alpine_landscape\.swf \(CC0\)/);
    const [file, w, h] = JUJU_CAMP_FILES.juju_grandma_chair_01a_al1;
    assert.deepEqual([file, w, h], [plan.pieces.juju_grandma_chair_01a_al1.file, ...plan.pieces.juju_grandma_chair_01a_al1.world]);
    const bytes = readFileSync(join(ROOT, 'assets/sprites/quest-rooms/juju_camp', file));
    assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 16), plan.pieces.juju_grandma_chair_01a_al1.sha);
  });
});
