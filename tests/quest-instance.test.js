/**
 * Shared quest-instance runtime (public/js/quest-instance.js), the room
 * catalog (public/js/quest-rooms/catalog.js) and per-room geometry checks.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
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

  it('maps all 32 once-excluded instance quests to rooms', () => {
    assert.equal(Object.keys(QUEST_ROOMS).length, 32);
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
