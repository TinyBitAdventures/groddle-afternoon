/**
 * Shared quest-instance runtime (public/js/quest-instance.js), the room
 * catalog (public/js/quest-rooms/catalog.js) and per-room geometry checks.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  QUEST_SCENE_PREFIX,
  createQuestInstance,
  changeInstanceStage,
  extendQuestInstance,
  finishQuestInstance,
  formatInstanceClock,
  inBottomBox,
  instanceRemainingMs,
  isQuestSceneTsid,
  normalizeInstanceSave,
  questSceneTsid,
  reloadTarget,
  runFlag,
  setRunFlag,
  solveQuestInstance,
  stepQuestInstance,
} from '../public/js/quest-instance.js';
import {
  BUILT_ROOMS,
  OFFER_OVERRIDES,
  QUEST_ROOMS,
  builtInstanceQuests,
  roomModulePath,
} from '../public/js/quest-rooms/catalog.js';
import { loadContentCatalogsFromDir, getQuestCatalog } from '../public/js/content-catalogs.js';
import * as kit from '../public/js/quest-rooms/kit.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('quest instance runtime', () => {
  it('names scenes and recognises them', () => {
    assert.equal(questSceneTsid('rainbow_run'), 'QI_RAINBOW_RUN_MAIN');
    assert.equal(questSceneTsid('an_autumn_day', 'wonder'), 'QI_AN_AUTUMN_DAY_WONDER');
    assert.ok(isQuestSceneTsid('QI_X_MAIN'));
    assert.ok(!isQuestSceneTsid('GLI32G3NUTD100I'));
    assert.ok(QUEST_SCENE_PREFIX.length > 0);
  });

  it('runs the timer, expires, and extends', () => {
    const run = createQuestInstance({ questId: 'mental_block', roomId: 'mental_block', now: 1000, durationMs: 5 * 60_000, returnTo: { tsid: 'GA', x: 10.4, y: 20 } });
    assert.equal(run.status, 'active');
    assert.deepEqual(run.returnTo, { tsid: 'GA', x: 10, y: 20 });
    assert.equal(instanceRemainingMs(run, 61_000), 4 * 60_000);
    assert.equal(extendQuestInstance(run, 20_000), 20_000);
    assert.equal(stepQuestInstance(run, 300_999).expired, false);
    assert.equal(stepQuestInstance(run, 321_000).expired, true);
    assert.equal(run.status, 'expired');
    assert.equal(finishQuestInstance(run).outcome, 'expired');
  });

  it('treats durationMs 0 as no clock', () => {
    const run = createQuestInstance({ questId: 'q', roomId: 'r', durationMs: 0 });
    assert.equal(instanceRemainingMs(run), Infinity);
    assert.equal(stepQuestInstance(run, Date.now() + 1e9).expired, false);
    assert.equal(formatInstanceClock(Infinity), '–');
    assert.equal(formatInstanceClock(61_000), '1:01');
    assert.equal(formatInstanceClock(500), '0:01');
  });

  it('solves, keeps flags, changes stage, and leaves once', () => {
    const run = createQuestInstance({ questId: 'q', roomId: 'r', durationMs: 1000, now: 0 });
    assert.ok(setRunFlag(run, 'switch_1'));
    assert.ok(!setRunFlag(run, 'switch_1'));
    assert.ok(runFlag(run, 'switch_1'));
    assert.ok(changeInstanceStage(run, 'comfort'));
    assert.equal(run.stage, 'comfort');
    assert.ok(solveQuestInstance(run));
    // A solved run does not expire.
    assert.equal(stepQuestInstance(run, 10_000).expired, false);
    const out = finishQuestInstance(run);
    assert.equal(out.outcome, 'complete');
    assert.equal(finishQuestInstance(run).ok, false);
  });

  it('abandons an unsolved run', () => {
    const run = createQuestInstance({ questId: 'q', roomId: 'r' });
    assert.equal(finishQuestInstance(run).outcome, 'abandoned');
  });

  it('never saves a quest scene as the return point', () => {
    const run = createQuestInstance({ questId: 'q', roomId: 'r', returnTo: { tsid: 'QI_R_MAIN', x: 1, y: 2 } });
    assert.equal(run.returnTo, null);
  });

  it('normalizes saves and resumes reloads on the return street', () => {
    const save = normalizeInstanceSave({
      returnTo: { tsid: 'GLI32G3NUTD100I', x: 400, y: 900 },
      questId: 'high_jump',
      roomId: 'top_of_tree',
      retry: { mental_block: 5, bad: 'x' },
      memory: { le_miserable: { doneAt: 3 } },
    });
    assert.deepEqual(save.retry, { mental_block: 5 });
    assert.equal(save.memory.le_miserable.doneAt, 3);
    assert.deepEqual(reloadTarget(save, { tsid: 'QI_TOP_OF_TREE_MAIN' }), { tsid: 'GLI32G3NUTD100I', x: 400, y: 900 });
    assert.equal(reloadTarget(normalizeInstanceSave({}), { tsid: 'QI_X' }), null);
    assert.deepEqual(normalizeInstanceSave('junk').retry, {});
  });

  it('hit-tests bottom-centre boxes', () => {
    const box = { x: 100, y: 500, w: 200, h: 100 };
    assert.ok(inBottomBox(box, 100, 450));
    assert.ok(!inBottomBox(box, 250, 450));
    assert.ok(!inBottomBox(box, 100, 380));
  });
});

describe('quest room catalog', () => {
  before(() => loadContentCatalogsFromDir(join(root, 'public/assets/content')));

  it('maps the 32 once-excluded instance quests, Gwendolyn\'s Task, Smuggle the Smuggler and Firefly Whistle to rooms', () => {
    assert.equal(Object.keys(QUEST_ROOMS).length, 40);
    const catalog = getQuestCatalog();
    for (const id of Object.keys(QUEST_ROOMS)) assert.ok(catalog[id], id);
  });

  it('ships a module for every built room', () => {
    for (const roomId of BUILT_ROOMS) {
      const file = join(root, 'public/js/quest-rooms', roomModulePath(roomId));
      assert.ok(existsSync(file), file);
    }
  });

  it('marks built rooms solo in quests.json with familiar offer sources', () => {
    const catalog = getQuestCatalog();
    for (const id of builtInstanceQuests()) {
      const def = catalog[id];
      assert.equal(def.solo, true, id);
      assert.ok(!def.custom, id);
      assert.equal(def.instanceRoom, QUEST_ROOMS[id], id);
      if (OFFER_OVERRIDES[id]?.offerTriggers) assert.ok(def.offerTriggers.every((t) => t.override), id);
    }
  });
});

describe('quest room kit', () => {
  it('orders platform ends and reads surfaces', () => {
    const p = kit.plat(300, 500, 100, 400);
    assert.equal(p.x1, 100);
    assert.equal(p.y1, 400);
    assert.equal(kit.surfaceAt(p, 200), 450);
    assert.equal(kit.surfaceAt(p, 50), null);
  });

  it('hashes stably', () => {
    assert.equal(kit.hash01('a'), kit.hash01('a'));
    assert.ok(kit.hash01('a') >= 0 && kit.hash01('a') < 1);
  });
});

describe('Rainbow Run (numismatic_hustle)', () => {
  it('has the source 30-second, 30-coin rules and enough coins on reachable ledges', async () => {
    const mod = await import('../public/js/quest-rooms/rainbow-run.js');
    assert.equal(mod.RUN_MS, 30_000);
    assert.equal(mod.COINS_NEEDED, 30);
    const coins = mod.rainbowCoins();
    assert.ok(coins.length >= 40, `${coins.length} coins`);
    const plats = mod.rainbowPlatforms(kit);
    const floor = plats.find((p) => p.id === 'rr_floor');
    // Every cloud is one ordinary jump (110 px apex) above the floor or a ledge beside it.
    for (const p of plats.filter((q) => q !== floor)) {
      const below = plats.filter((q) => q !== p && q.y1 > p.y1 && q.x2 >= p.x1 - 160 && q.x1 <= p.x2 + 160);
      const gap = Math.min(...below.map((q) => q.y1 - p.y1));
      assert.ok(gap <= 105, `${p.id} gap ${gap}`);
    }
    // Each coin floats within reach above some ledge.
    for (const c of coins) {
      const under = plats.filter((q) => c.x >= q.x1 - 20 && c.x <= q.x2 + 20 && q.y1 >= c.y);
      assert.ok(under.some((q) => q.y1 - c.y <= 120), `coin ${c.id}`);
    }
  });
});

describe('The High Jumper (top_of_tree)', () => {
  it('keeps the source two-minute clock and branches only Spinach can reach', async () => {
    const mod = await import('../public/js/quest-rooms/top-of-tree.js');
    assert.equal(mod.CLIMB_MS, 120_000);
    assert.deepEqual(mod.NAG.map((n) => n.atMs), [30_000, 45_000]);
    const rows = [mod.GROUND, ...mod.treeBranches().map((b) => b.y), mod.CROWN_Y];
    // An ordinary jump peaks near 110 px; Spinach's measured in-room apex is 289 px.
    for (let i = 1; i < rows.length; i++) {
      const rise = rows[i - 1] - rows[i];
      assert.ok(rise > 110 && rise < 289, `step ${i} rises ${rise}`);
    }
    // Branches alternate sides of the trunk so each hop crosses it.
    const sides = mod.treeBranches().map((b) => b.side).join('');
    assert.equal(sides, 'RLRLRLRL');
    const spinach = mod.spinachSpots().reduce((n, s) => n + s.count, 0);
    assert.ok(spinach >= 3, `${spinach} spinach`);
  });
});

describe('Color Unblocking (color_unblocking)', () => {
  it('opens a path with the four solution switches and keeps the orange bridge', async () => {
    const mod = await import('../public/js/quest-rooms/color-unblocking.js');
    const layout = mod.colorLayout();
    const on = mod.colorsAfter(layout.solution);
    for (const color of ['red', 'blue', 'green', 'purple']) assert.ok(!on.has(color), `${color} cleared`);
    assert.ok(on.has('orange'), 'the bridge stays');
    // Nothing standing on the floor path is left after the solution.
    const left = mod.solidColumns(layout, on).filter((c) => c.color !== 'orange');
    assert.deepEqual(left, []);
    // Green steps climb to the blue switch's ledge one rise at a time.
    const { CELL, JUMP_RISE } = mod.COLOR_ROOM_FACTS;
    assert.ok(CELL <= JUMP_RISE);
    assert.equal(layout.ledge.y, layout.switches.find((s) => s.id === 'blue').y);
  });
});

describe('Vision Quest (vision_quest)', () => {
  it('uses the archived Institute street and the six source objects', async () => {
    const mod = await import('../public/js/quest-rooms/vision-quest.js');
    assert.equal(mod.STREET, 'GNV1T7PCUM53T25');
    assert.deepEqual(Object.keys(mod.OBJECTS).sort(), ['lemburger', 'npc_crab', 'npc_piggy', 'pumpkin', 'rock_sparkly_1', 'trant_fruit']);
    assert.equal(mod.WRONG_THINGS.length, 7);
    assert.ok(existsSync(join(root, 'public/assets/streets', `${mod.STREET}.json`)));
  });
});

describe("Mr. Block's playroom (kids_room)", () => {
  it('has the 24 source words, the doneSpelling tiers and letter gifts', async () => {
    const mod = await import('../public/js/quest-rooms/kids-room.js');
    assert.equal(mod.WORD_UP_WORDS.length, 24);
    assert.equal(mod.SPELL_MS, 180_000);
    assert.deepEqual([2, 3, 9, 10, 19, 20].map((n) => mod.spellingTier(n).id),
      ['fail', 'done_spelling_1', 'done_spelling_1', 'done_spelling_3', 'done_spelling_3', 'done_spelling_5']);
    const spelled = [];
    assert.equal(mod.recordWord(spelled, ['T', 'E', 'A']), 'TEA');
    assert.equal(mod.recordWord(spelled, ['T', 'E', 'A']), null);
    assert.equal(mod.nextLetter('T'), 'A');
    const gifts = mod.giftable({ meat: 2, pick: 1, apple: 1 }, 'M', { meat: { label: 'Meat' }, apple: { label: 'Apple' } });
    assert.deepEqual(gifts.map((g) => g.id), ['meat']);
  });
});

describe('The Wrizzards and The Rube (rube_yard)', () => {
  it('hides ten Wrizzards where the camera and room card leave them visible', async () => {
    const mod = await import('../public/js/quest-rooms/rube-yard.js');
    assert.equal(mod.WRIZZARDS_NEEDED, 10);
    assert.equal(mod.HIDING_SPOTS.length, 10);
    assert.equal(new Set(mod.HIDING_SPOTS.map((s) => s.id)).size, 10);
    // The camera shows ~300 px above the floor and the room card covers its top
    // ~140, so each Wrizzard's clickable middle (38 px above rest) stays within
    // 160 px (the fence one sat at 180, on the card's edge, in a real-click run).
    const FLOOR = 620;
    for (const s of mod.HIDING_SPOTS) {
      const middle = s.wy + s.peek - 38;
      assert.ok(FLOOR - middle <= 160, `${s.id} middle is ${FLOOR - middle} px up`);
    }
  });

  it('registers the Play Cube for the pack catalog', async () => {
    const { ROOM_ITEMS } = await import('../public/js/quest-rooms/catalog.js');
    assert.equal(ROOM_ITEMS.play_cube.label, 'Play Cube');
    assert.equal(ROOM_ITEMS.play_cube.stackMax, 1);
    assert.equal(ROOM_ITEMS.play_cube.sellable, false);
    assert.ok(existsSync(join(root, 'public/assets/sprites/icons/play_cube.png')));
  });
});

describe('Le Misérable (le_miserable)', () => {
  const streetFile = join(root, 'public/assets/streets/GIFM4BD43383DKV.json');
  // Colour layers by their tint (yellow, orange, purple, teal): steps along the pad cycle.
  const STEP_BY_TINT = { 16777024: 1, 16750144: 2, 10436052: 3, 3394764: 4 };

  async function setup() {
    const mod = await import('../public/js/quest-rooms/le-miserable.js');
    const ev = await import('../public/js/location-events.js');
    const { readFileSync } = await import('node:fs');
    const street = JSON.parse(readFileSync(streetFile, 'utf8'));
    const rt = ev.createEventRuntime();
    const effects = [];
    const fire = (name) => effects.push(...ev.runLocationEvent(rt, street.events, name, { now: 0, target: true }));
    fire('instance_created');
    return { mod, street, rt, fire, effects };
  }

  /** Each panel's answer: the fixed square deco under each column, on a tinted colour layer. */
  function answers(street, mod) {
    const toggled = new Set(Object.values(street.events).flat().map((a) => a.deco).filter(Boolean));
    const squares = [];
    for (const layer of street.layers) {
      const step = STEP_BY_TINT[layer.filters?.tintColor];
      if (!step || layer.filters?.tintAmount !== 100) continue;
      for (const d of layer.decos || []) {
        if (d.sprite === 'bg_white_patch' && d.w === 30 && !toggled.has(d.id)) squares.push({ x: d.x + street.bounds.l, step });
      }
    }
    return mod.PANELS.map((panel) => panel.slots.map((x) => squares.find((s) => Math.abs(s.x - x) < 3)?.step));
  }

  it('keeps the source 5-minute run, rebuilt pads under every column and the crawl walls', async () => {
    const { mod, street } = await setup();
    assert.equal(mod.room.durationMs, 300_000);
    assert.equal(mod.room.streetEvents, true);
    const pads = street.layers.flatMap((l) => l.decos || []).filter((d) => d.sprite === 'circle_cutout_04_arbito1');
    for (const panel of mod.PANELS) for (const x of panel.slots) assert.ok(pads.some((p) => Math.abs(p.x - x) < 3 && p.y === -407), `pad at ${x}`);
    assert.deepEqual(mod.padEvents(2, 3), ['p2_black_3_on', 'p2_purple_3_on', 'p2_blue_3_on', 'p2_red_3_on', 'p2_yellow_3_on']);
    for (const id of mod.CRAWL_WALLS) {
      const wall = street.barriers.find((w) => w.id === id);
      assert.ok(wall, id);
      assert.ok(-109 - (wall.y + wall.h) >= 60, `${id} leaves a crawl gap`);
    }
  });

  it('solves each panel with the squares shown under it, and only then turns on the machine', async () => {
    const { mod, street, rt, fire, effects } = await setup();
    const want = answers(street, mod);
    assert.deepEqual(want, [[3, 2, 1], [4, 3, 2, 3, 4], [1, 2, 3, 4, 3, 2, 1]]);
    const step = (n, k, times) => { for (let i = 0; i < times; i++) for (const e of mod.padEvents(n, k)) fire(e); };
    // Panel 2 one step short on column 2 stays unlit. (Column 3 would not do:
    // puzzle_2_verify tests the misspelled flag p2_red_, so it takes yellow too.)
    want[1].forEach((s, i) => step(2, i + 1, i === 1 ? s - 1 : s));
    assert.equal(rt.flags.has('p2_win_check'), false);
    // Reset, then the answer.
    for (const e of mod.resetEvents(2)) fire(e);
    want[1].forEach((s, i) => step(2, i + 1, s));
    assert.equal(rt.flags.has('p2_win_check'), true);
    want[2].forEach((s, i) => step(3, i + 1, s));
    assert.equal(effects.some((fx) => fx.type === 'quest_flag'), false, 'not before panel 1');
    want[0].forEach((s, i) => step(1, i + 1, s));
    assert.ok(['p1_win_check', 'p2_win_check', 'p3_win_check'].every((f) => rt.flags.has(f)));
    assert.ok(effects.some((fx) => fx.type === 'quest_flag' && fx.flag === 'turn_on_machine'));
  });
});

describe('G99: the retry prompt names whoever offered the quest', () => {
  it('questGiver: NPC and pack-item givers, the Magic Rock for familiar offers', async () => {
    const { questGiver, FAMILIAR_GATES, GIVER_LABELS } = await import('../public/js/quest-rooms/catalog.js');
    const quests = JSON.parse(readFileSync(new URL('../public/assets/content/quests.json', import.meta.url), 'utf8'));
    const def = (id) => (Array.isArray(quests) ? quests : quests.quests || Object.values(quests)).find((q) => (q.classTsid || q.id) === id);
    assert.deepEqual(questGiver(def('join_club')), { npc: 'bag_butler', label: 'Butler' });
    // Without a Butler the no_butler gate passes and the Magic Rock offered it.
    assert.equal(FAMILIAR_GATES.join_club, 'no_butler');
    assert.equal(questGiver(def('join_club'), { familiar: true }).label, 'Magic Rock');
    assert.equal(questGiver(def('tower_quest')).label, 'Ghost of Gwendolyn');
    assert.equal(questGiver(def('tower_quest_part2')).label, 'Zzybzfrx');
    assert.equal(questGiver(def('tower_quest_part3')).label, 'Ghost of Gwendolyn');
    assert.equal(questGiver(def('help_juju_bandits')).label, 'Juju Bandit');
    assert.equal(questGiver(def('puzzle_level_color_blockage_rem')).label, 'Play Cube');
    assert.equal(questGiver(def('puzzle_level_color_blockage')).label, 'Magic Rock');
    assert.equal(questGiver(def('high_jump')).label, 'Magic Rock');
    assert.equal(GIVER_LABELS.npc_widget, 'Greeterbot Sentry G-42');
  });

  it('the prompt and the time-out note use the giver, not a fixed Magic Rock', () => {
    const src = readFileSync(new URL('../public/js/features/quest-instances-feature.js', import.meta.url), 'utf8');
    const retry = src.slice(src.indexOf('function maybeOfferRetry('), src.indexOf('function maybeOfferRetry(') + 1200);
    assert.match(retry, /kicker: giver\.label/);
    assert.doesNotMatch(retry, /kicker: 'Magic Rock'/);
    assert.match(src, /time ran out\. Ask the \$\{giverFor\(engine, questId\)\.label\} to try again\./);
  });
});
