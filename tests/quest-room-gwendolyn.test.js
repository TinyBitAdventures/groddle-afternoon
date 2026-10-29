/**
 * Gwendolyn's Task (public/js/quest-rooms/gwendolyn.js): source constants,
 * the archived Area 42 street, reach across the rebuilt Outer Mind and Inner
 * Mind against the avatar's jump, the heat buff, and the chain reset that
 * location.js applies when you leave early.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as kit from '../public/js/quest-rooms/kit.js';
import { QUEST_ROOMS, roomModulePath } from '../public/js/quest-rooms/catalog.js';
import { loadContentCatalogsFromDir, getQuestCatalog } from '../public/js/content-catalogs.js?v=g403-1';
import { acceptOffer, ensureQuestOfferState, questStatus, turnInQuest } from '../public/js/quest-offers.js?v=g403-1';
import { gwendolynOffers } from '../public/js/gwendolyn-room-23.js?v=g403-1';
import {
  CACTUS,
  CACTUS_LINES,
  CHAIN,
  CHAMBER_EXIT,
  COOLING_DOWN,
  DESERT_LINES,
  DESERT_STREET,
  HEAT,
  HIT_HALF,
  INSTANCES,
  ITS_COOL,
  OUTER_LINE,
  PART2,
  PART3,
  PART3_REPEAT,
  ROOM_ID,
  SHEETS,
  SQUID_GLIDE,
  STAGES,
  STUCK_TEXT,
  TASK,
  VOG_LINES,
  chainBroken,
  chainFinished,
  chamberLayout,
  heatTick,
  innerLayout,
  outerLayout,
  resetChain,
  room,
  stageForQuest,
  thirdPartFor,
} from '../public/js/quest-rooms/gwendolyn.js?v=g446-2';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = (p) => join(root, 'public', p);

/** An ordinary jump peaks near 110 px (the other rooms' measured apex). */
const JUMP_RISE = 105;
const JUMP_GAP = 140;

/** Platform surface y at x (slopes too). */
const surface = (p, x) => kit.surfaceAt(p, x);

/**
 * Reach over sampled platform points: a hop goes up at most JUMP_RISE and
 * across at most JUMP_GAP; drops are free. A wall (pc_perm -1, solid when
 * walking right) splits what lies right of it unless the take-off point is
 * high enough for the jump to clear its top.
 */
function reach(platforms, barriers = [], startId, without = new Set()) {
  const pts = [];
  for (const p of platforms) {
    if (without.has(p.id)) continue;
    for (let x = p.x1; x <= p.x2; x += 10) pts.push({ id: p.id, x, y: surface(p, x) });
    pts.push({ id: p.id, x: p.x2, y: p.y2 });
  }
  const blocked = (a, b) => barriers.some((w) => {
    const right = a.x < w.x && b.x >= w.x;
    const left = b.x < w.x && a.x >= w.x;
    if (!right && !left) return false;
    if (left && w.pc_perm === -1) return false; // walking left is open
    // Clear it only when the jump from `a` rises above its top.
    return a.y - JUMP_RISE > w.y;
  });
  const byId = new Map();
  for (const pt of pts) (byId.get(pt.id) || byId.set(pt.id, []).get(pt.id)).push(pt);
  const seen = new Set();
  const start = pts.find((pt) => pt.id === startId);
  const queue = [start];
  const key = (pt) => `${pt.id}:${pt.x}`;
  seen.add(key(start));
  const reachedIds = new Set([start.id]);
  while (queue.length) {
    const a = queue.shift();
    for (const b of pts) {
      if (seen.has(key(b))) continue;
      const same = b.id === a.id && Math.abs(b.x - a.x) <= 10;
      const hop = Math.abs(b.x - a.x) <= JUMP_GAP && a.y - b.y <= JUMP_RISE;
      if (!same && !hop) continue;
      if (blocked(a, b)) continue;
      seen.add(key(b));
      reachedIds.add(b.id);
      queue.push(b);
    }
  }
  return { reachedIds, reached: (x, y, r = 30) => pts.some((pt) => seen.has(key(pt)) && Math.abs(pt.x - x) <= r && Math.abs(pt.y - y) <= r) };
}

describe("Gwendolyn's Task (gwendolyn): source", () => {
  before(() => loadContentCatalogsFromDir(join(root, 'public/assets/content')));

  it('maps the four quests to this room and ships the module', () => {
    for (const id of CHAIN) assert.equal(QUEST_ROOMS[id], ROOM_ID, id);
    assert.ok(existsSync(join(root, 'public/js/quest-rooms', roomModulePath(ROOM_ID))));
    assert.equal(room.id, ROOM_ID);
  });

  it('keeps the four instances, spawn points and exit delays', () => {
    assert.deepEqual(STAGES, ['desert', 'outer_mind', 'inner_mind', 'chamber']);
    assert.deepEqual(
      STAGES.map((s) => [INSTANCES[s].instanceId, INSTANCES[s].template, INSTANCES[s].x, INSTANCES[s].y, INSTANCES[s].exitDelaySec]),
      [
        ['tower_quest_desert', 'LCR8MP0IJI1299U', -2077, -105, 120],
        ['tower_quest_headspace', 'LCR8MQ9JJI12IIK', -911, -410, 120],
        ['tower_quest_crystine', 'LCR8MRAKJI12UOP', -1924, -143, 120],
        ['tower_quest_chamber', 'LCR8MSVKJI12BOU', -408, -163, 0],
      ]
    );
    assert.deepEqual(STAGES.map((s) => room.stageLabel(s)), ['Area 42', 'The Outer Mind', 'The Inner Mind', "Gwendolyn's Chamber"]);
    assert.equal(room.durationMs, 0, 'exit_delay is the stuck prompt, not a clock');
    assert.equal(STUCK_TEXT, 'Are you stuck? Do you want to leave this place?');
    assert.deepEqual([CHAMBER_EXIT.tsid, CHAMBER_EXIT.x - 2250, CHAMBER_EXIT.y - 1500], ['GTJ10M515812V0C', 102, -534]);
    assert.equal(HIT_HALF, 200);
  });

  it('starts each quest at its own location', () => {
    assert.equal(stageForQuest(TASK), 'desert');
    assert.equal(stageForQuest(PART2), 'outer_mind');
    assert.equal(stageForQuest(PART3), 'inner_mind');
    assert.equal(stageForQuest(PART3_REPEAT), 'inner_mind');
    assert.equal(room.firstStage(PART2), 'outer_mind');
  });

  it('matches the quest catalog: givers, buttons and the part 3 rewards', () => {
    const cat = getQuestCatalog();
    assert.match(cat[TASK].offer, /^Hear me\. I am <b>Gwendolyn<\/b>/);
    assert.equal(cat[TASK].acceptLabel, 'Kind of.');
    assert.deepEqual(cat[TASK].endNpcs, ['npc_squid']);
    assert.equal(cat[PART2].offer, 'Coooooooooool ….');
    assert.equal(cat[PART2].acceptLabel, 'Cool.');
    assert.match(cat[PART2].completion, /Zzybzfrx<\/b> told you it be cool/);
    assert.deepEqual(cat[PART3].endNpcs, ['npc_gwendolyn']);
    assert.equal(cat[PART3].rewards.xp, 1100);
    assert.equal(cat[PART3].rewards.mood, 100);
    assert.deepEqual(cat[PART3].rewards.favor['0'], { giant: 'cosma', points: 11 });
    assert.equal(cat[PART3].rewards.items['0'].class_tsid, 'random_kindness');
    assert.deepEqual(Object.keys(cat[PART3_REPEAT].rewards), ['items']);
    for (const id of CHAIN) assert.deepEqual(cat[id].requirements, [], `${id} turns in at an npc`);
  });

  it('keeps the npc lines word for word', () => {
    assert.equal(CACTUS_LINES.length, 4);
    assert.deepEqual(CACTUS_LINES.map(([, b]) => b), ['What?', 'Um…', 'Listen, I …', 'Oh … kay']);
    assert.deepEqual(Object.keys(DESERT_LINES).map(Number), [0, 1, 5, 17, 18, 19, 23, 24]);
    assert.equal(DESERT_LINES[24][1], 'Just get me out of here.');
    assert.equal(VOG_LINES.length, 4);
    assert.ok(VOG_LINES[1].endsWith('YOUR NEAREST EXIT MAY BE ABOVE YOU.'));
    assert.deepEqual(OUTER_LINE, ['Hee hee! Neat! C’mere!', 'OK']);
  });

  it('keeps the buff and canvas timings', () => {
    assert.equal(HEAT.its_so_hot.tickMs, 5000);
    assert.equal(HEAT.its_so_hot2.tickMs, 2000);
    // Each red canvas fills exactly one tick.
    for (const id of Object.keys(HEAT)) {
      const secs = HEAT[id].steps.reduce((s, [, t]) => s + t, 0);
      assert.equal(secs * 1000, HEAT[id].tickMs, id);
      assert.equal(HEAT[id].mood, 3);
    }
    assert.equal(COOLING_DOWN.color, '#9e67d1');
    assert.equal(COOLING_DOWN.tip, 'Ahh ...');
    assert.equal(ITS_COOL.color, '#4781f1');
    assert.equal(ITS_COOL.loop, true);
  });

  it('loses 3 mood a tick but never all of it', () => {
    const pc = { mood: 50, energyMax: 100 };
    assert.equal(heatTick(pc, 'its_so_hot'), 3);
    assert.equal(pc.mood, 47);
    pc.mood = 2;
    assert.equal(heatTick(pc, 'its_so_hot2'), 2);
    assert.equal(pc.mood, 3, 'metabolics_add_mood(3) at zero');
  });

  it('ships the recovered art', () => {
    for (const [who, states] of Object.entries(SHEETS)) {
      for (const state of Object.keys(states)) {
        const files = who === 'squid' ? [`squid_blue_${state}.webp`, `squid_purple_${state}.webp`] : [`${who}_${state}.webp`];
        for (const f of files) assert.ok(existsSync(pub(`assets/sprites/quest-rooms/gwendolyn/${f}`)), f);
      }
    }
    for (const f of ['gwendolyn_icon.png', 'swoonerfly_fall.png', 'swoonerfly_rest.png']) {
      assert.ok(existsSync(pub(`assets/sprites/quest-rooms/gwendolyn/${f}`)), f);
    }
    for (const d of ['cacti_3', 'trailerhome_1', 'land_l3_mesa_1']) assert.ok(existsSync(pub(`assets/decos/groddle/${d}.webp`)), d);
    assert.ok(existsSync(pub('assets/sprites/icons/gurly_drink.png')));
    assert.ok(existsSync(pub('assets/sprites/icons/random_kindness.png')));
  });

  it('cuts each sheet on its frame grid (WebP canvas size)', () => {
    const cells = { squid: [235, 251], cactus: [157, 126], gwendolyn: [116, 191] };
    const webpSize = (file) => {
      const b = readFileSync(file);
      assert.equal(b.toString('ascii', 12, 16), 'VP8X', file);
      return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    };
    for (const [who, states] of Object.entries(SHEETS)) {
      for (const [state, [cols, rows, count]] of Object.entries(states)) {
        const f = who === 'squid' ? `squid_blue_${state}.webp` : `${who}_${state}.webp`;
        const [w, h] = webpSize(pub(`assets/sprites/quest-rooms/gwendolyn/${f}`));
        assert.deepEqual([w / cols, h / rows], cells[who], f);
        assert.ok(count <= cols * rows && count > cols * (rows - 1), f);
      }
    }
  });
});

describe("Gwendolyn's Task: Area 42 (archived street)", () => {
  const street = JSON.parse(readFileSync(pub(`assets/streets/${DESERT_STREET}.json`), 'utf8'));

  it('is the instantiated copy of the desert template', () => {
    assert.equal(street.label, 'Area 42');
    const xml = join(root, '..', 'streets/mnt/stos/location_data/LHF8DDDBTPF3P4U.xml');
    if (existsSync(xml)) {
      const src = readFileSync(xml, 'utf8');
      assert.match(src, /<str id="instance_of">LCR8MP0IJI1299U<\/str>/);
      assert.match(src, /<str id="instance_id">tower_quest_desert<\/str>/);
    }
  });

  it('puts the spawn, the cactus and the squid glide on the ground', () => {
    const onGround = (x, y, slack) => street.platforms.some((p) => {
      const s = kit.surfaceAt(kit.plat(p.x1, p.y1, p.x2, p.y2), x);
      return s != null && Math.abs(s - y) <= slack;
    });
    assert.ok(onGround(INSTANCES.desert.x, INSTANCES.desert.y, 8), 'spawn');
    assert.ok(onGround(CACTUS.x, CACTUS.y, 4), 'cactus');
    assert.ok(street.platforms.some((p) => p.x1 <= SQUID_GLIDE.x && p.x2 >= SQUID_GLIDE.x), 'glide target');
    assert.deepEqual([SQUID_GLIDE.x, SQUID_GLIDE.rise, SQUID_GLIDE.speed], [275, 35, 200]);
  });

  it('walks from the spawn to the cactus (one crack to hop)', () => {
    const plats = street.platforms.map((p) => kit.plat(p.x1, p.y1, p.x2, p.y2, 'x', { id: p.id }));
    const spawnPlat = plats.find((p) => p.x1 <= INSTANCES.desert.x && p.x2 >= INSTANCES.desert.x);
    // The crack between -349 and -207 is the widest gap (142 px at the same height): a running jump.
    const wide = { ...reach(plats, [], spawnPlat.id) };
    const gaps = [];
    const sorted = [...plats].sort((a, b) => a.x1 - b.x1);
    for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i].x1 - sorted[i - 1].x2);
    assert.equal(Math.max(...gaps), 142);
    assert.ok(wide.reachedIds.size >= 5);
  });
});

describe("Gwendolyn's Task: The Outer Mind", () => {
  const L = outerLayout(kit);

  it('climbs from the checkered floor to the mouth, one hop per tier', () => {
    const r = reach(L.platforms, [], 'om_floor');
    for (const p of L.platforms) assert.ok(r.reachedIds.has(p.id), p.id);
    assert.ok(r.reached(L.squid.x, L.squid.y), 'the squid spot');
    // Every piece of the path is needed: skip one and the mouth is out of reach.
    for (const id of L.path.slice(0, -1)) {
      const { reachedIds } = reach(L.platforms, [], 'om_floor', new Set([id]));
      assert.ok(!reachedIds.has('om_mouth'), `skipping ${id} still reaches the mouth`);
    }
    // Each hop is a comfortable ~90 px, and tiers you walk under leave head room.
    for (let i = 1; i < L.path.length; i++) {
      const a = L.platforms.find((p) => p.id === L.path[i - 1]);
      const b = L.platforms.find((p) => p.id === L.path[i]);
      const xs = [Math.max(a.x1, b.x1), Math.min(a.x2, b.x2)];
      const rise = Math.min(...xs.map((x) => kit.surfaceAt(a, x) - kit.surfaceAt(b, x)));
      assert.ok(rise >= 80 && rise <= 96, `${a.id} -> ${b.id} rise ${rise}`);
    }
    const t2 = L.platforms.find((p) => p.id === 'om_t2');
    const t3 = L.platforms.find((p) => p.id === 'om_t3');
    assert.ok(kit.surfaceAt(t2, 2000) - kit.surfaceAt(t3, 2000) > 160, 'room to walk under the tier above');
  });

  it('places the boxes in order along the path', () => {
    assert.ok(L.spawn.x < L.vogX, 'the VOG fires soon after you start');
    assert.ok(L.appear.yMax > L.squid.y && L.appear.yMax - L.squid.y < 40);
    assert.ok(L.appear.x2 - L.squid.x < 480, 'the squid bamfs in on screen');
    assert.ok(L.endBox.x1 <= L.squid.x && L.endBox.x2 >= L.squid.x);
    const mouth = L.platforms.find((p) => p.id === 'om_mouth');
    assert.ok(L.squid.x >= mouth.x1 && L.squid.x <= mouth.x2);
    // The source spawn sits ~480 px below the squid's waiting spot; ours climbs a little more.
    const rise = L.FLOOR - L.squid.y;
    assert.ok(rise >= 480 && rise <= 720, `rise ${rise}`);
  });
});

describe("Gwendolyn's Task: The Inner Mind", () => {
  const L = innerLayout(kit);

  it('crosses three crystals by their glass stairs to the EXIT', () => {
    for (const w of L.barriers) assert.ok(w.h > JUMP_RISE + 5, `${w.id} is taller than a jump (${w.h})`);
    const r = reach(L.platforms, L.barriers, 'im_floor');
    assert.ok(r.reached(L.exit.x, L.FLOOR), 'the exit is reachable');
    for (const id of ['im_s2', 'im_g2', 'im_s4']) {
      const cut = reach(L.platforms, L.barriers, 'im_floor', new Set([id]));
      assert.ok(!cut.reached(L.exit.x, L.FLOOR), `without ${id} you still reach the exit`);
    }
  });

  it('keeps every quoin and the Gurly Drink in reach', () => {
    const r = reach(L.platforms, L.barriers, 'im_floor');
    for (const q of L.quoins) {
      // A quoin floats up to ~60 px above some reachable surface.
      const ok = L.platforms.some((p) => {
        const s = kit.surfaceAt(p, q.x);
        return s != null && s - q.y >= 0 && s - q.y <= 80 && r.reached(q.x, s, 12);
      });
      assert.ok(ok, `quoin at ${q.x},${q.y}`);
    }
    assert.ok(r.reached(L.drink.x, L.drink.y, 12), 'the Gurly Drink ledge');
    assert.ok(L.drink.x < L.exit.x);
    assert.ok(L.quoins.filter((q) => q.type === 'mood').length >= 4 && L.quoins.filter((q) => q.type === 'energy').length >= 4);
  });

  it('keeps the glass within the visible band of the surface below', () => {
    for (const p of L.platforms.filter((q) => q.style === 'glass')) {
      const below = L.platforms.filter((q) => q !== p && q.x2 >= p.x1 - JUMP_GAP && q.x1 <= p.x2 + JUMP_GAP && q.y1 > p.y1);
      const gap = Math.min(...below.map((q) => q.y1 - p.y1));
      assert.ok(gap <= JUMP_RISE, `${p.id} gap ${gap}`);
    }
  });
});

describe("Gwendolyn's Chamber", () => {
  const L = chamberLayout(kit);
  it('puts Gwendolyn a short walk from the door, the exit behind you', () => {
    const d = L.gwen.x - L.spawn.x;
    assert.ok(d > HIT_HALF && d < 700, `distance ${d}`);
    assert.ok(L.exit.x < L.spawn.x);
    assert.ok(L.FLOOR - L.gwen.y < 20, 'she stands on the floor (within the visible band)');
  });
});

describe("Gwendolyn's Task: the chain", () => {
  before(() => loadContentCatalogsFromDir(join(root, 'public/assets/content')));

  const fresh = () => {
    const qs = { active: {}, completed: [] };
    ensureQuestOfferState(qs);
    return qs;
  };

  it('offers part 3, or the repeat once part 3 is done', () => {
    assert.equal(thirdPartFor(fresh()), PART3);
    assert.equal(thirdPartFor({ completed: [PART3] }), PART3_REPEAT);
  });

  it('turns each part in without requirements (npc turn-ins)', () => {
    const qs = fresh();
    assert.ok(acceptOffer(qs, TASK, {}).ok);
    assert.ok(turnInQuest(qs, TASK, null, {}).ok);
    assert.ok(acceptOffer(qs, PART2, {}).ok);
    assert.ok(chainBroken(qs));
    assert.ok(turnInQuest(qs, PART2, null, {}).ok);
    assert.ok(acceptOffer(qs, PART3, {}).ok);
    assert.ok(!chainFinished(qs));
    assert.ok(turnInQuest(qs, PART3, null, {}).ok);
    assert.ok(chainFinished(qs));
    assert.ok(!chainBroken(qs));
  });

  // G313: location.js 443-456 fails every part; none has onStarted, so failQuest
  // (inc_quests.js 466-469) removes them and Gwendolyn offers tower_quest again.
  it('takes the whole chain out of the log when you leave early', () => {
    const qs = fresh();
    acceptOffer(qs, TASK, {});
    turnInQuest(qs, TASK, null, {});
    acceptOffer(qs, PART2, {});
    turnInQuest(qs, PART2, null, {});
    acceptOffer(qs, PART3, {});
    assert.equal(resetChain(qs), true);
    assert.deepEqual(Object.keys(qs.active), []);
    assert.ok(!qs.completed.includes(TASK) && !qs.completed.includes(PART2));
    for (const id of [TASK, PART2, PART3]) {
      assert.equal(qs.offers.managed[id], undefined);
      assert.equal(questStatus(qs, id), 'none');
    }
    assert.equal(chainBroken(qs), false);
    // Nothing left to undo.
    assert.equal(resetChain(qs), false);
  });

  it('removes tower_quest itself when you leave before part 2', () => {
    const qs = fresh();
    acceptOffer(qs, TASK, {});
    assert.equal(resetChain(qs), true);
    assert.equal(questStatus(qs, TASK), 'none');
    assert.ok(gwendolynOffers(qs), 'Gwendolyn offers it again');
  });

  it('keeps a finished first run when a repeat is abandoned', () => {
    const qs = fresh();
    qs.completed.push(PART3);
    acceptOffer(qs, PART3_REPEAT, {});
    resetChain(qs);
    assert.ok(qs.completed.includes(PART3));
    assert.ok(!qs.active[PART3_REPEAT]);
    assert.ok(!qs.active[TASK]);
  });
});
