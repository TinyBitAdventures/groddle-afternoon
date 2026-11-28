/**
 * Report #753: the player wanted word when the set-down Crafty Bot's queue is done. Glitch never
 * had one (npc_crafty_bot.js craftDone 1051-1090 only iterates the queue; sendCraftyMessage 2941
 * speaks for halts, broken tools and missing machines). Ours (Austin 2026-11-27): one short
 * "From Crafty-bot" line in the activity feed when the last job of the queue finishes, never one
 * per job.
 *
 * Run: node --test tests/r753-craftybot-queue-done.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CRAFTYBOT_COPY,
  advanceCraftybot,
  createBot,
  createCraftybotState,
  setCraftybotSpecs,
  setJobTotal,
} from '../public/js/craftybot.js?v=6f09b162';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'public/assets/content/craftybot-specs.json');

/** The bot's pack as its source (no walking), counting each queueDone it reports. */
function packWorld(inv, log) {
  return {
    inLocation: false,
    count: (cls) => String(cls).split('|').reduce((s, c) => s + (inv[c] || 0), 0),
    find: (cls) => {
      for (const c of String(cls).split('|')) if (inv[c] > 0) return { id: c, cls: c, x: 0 };
      return null;
    },
    take: (id, cls, n) => {
      const k = Math.min(n, inv[id] || 0);
      inv[id] = (inv[id] || 0) - k;
      return k;
    },
    wear: () => ({ broke: false }),
    drop: (cls, n) => { inv[cls] = (inv[cls] || 0) + n; },
    give: (cls, n) => { inv[cls] = (inv[cls] || 0) + n; },
    imagination: () => {},
    prompt: (t) => log.push(`prompt ${t}`),
    say: (t) => log.push(`say ${t}`),
    sound: () => {},
    queueDone: () => log.push('queueDone'),
  };
}

function runUntil(bot, world, from, until, { stepMs = 200, maxMs = 600_000 } = {}) {
  for (let t = from; t <= from + maxMs; t += stepMs) {
    advanceCraftybot(bot, t, world);
    if (until(t)) return t;
  }
  return null;
}

before(() => {
  setCraftybotSpecs(JSON.parse(readFileSync(CATALOG, 'utf8')).specs);
});

describe('#753: word when the queue is done (ours)', () => {
  it('fires once, when the last job ends, not when the first does', () => {
    const log = [];
    const inv = { cherry: 12, fruit_changing_machine: 1 };
    const world = packWorld(inv, log);
    const bot = createBot(createCraftybotState(), 0, 'pack', 0);
    advanceCraftybot(bot, 1500, world);
    setJobTotal(bot, world, 'apple', 2);
    setJobTotal(bot, world, 'orange', 1);
    const firstDone = runUntil(bot, world, 1500, () => bot.queue.some((r) => r.crafted >= r.count));
    assert.ok(firstDone, 'a job finished');
    assert.ok(bot.queue.some((r) => r.crafted < r.count), 'the other one is still to do');
    assert.equal(log.filter((l) => l === 'queueDone').length, 0, 'no word for one job of two');
    const allDone = runUntil(bot, world, firstDone, () => bot.queue.every((r) => r.crafted >= r.count));
    assert.ok(allDone, 'both finished');
    runUntil(bot, world, allDone, () => false, { maxMs: 300_000, stepMs: 1000 });
    assert.equal(log.filter((l) => l === 'queueDone').length, 1, 'one word for the whole queue');
    assert.equal(log.filter((l) => l.startsWith('prompt')).length, 0, 'no modal prompt: the feed line only');
  });

  it('raising a finished job and finishing it again says so again; a job that cannot finish says nothing', () => {
    const log = [];
    const inv = { cherry: 6, fruit_changing_machine: 1 };
    const world = packWorld(inv, log);
    const bot = createBot(createCraftybotState(), 0, 'pack', 0);
    advanceCraftybot(bot, 1500, world);
    setJobTotal(bot, world, 'apple', 1);
    const done = runUntil(bot, world, 1500, () => bot.queue[0].crafted >= 1);
    runUntil(bot, world, done, () => false, { maxMs: 20_000 });
    assert.equal(log.filter((l) => l === 'queueDone').length, 1);
    setJobTotal(bot, world, 'apple', 2);
    const again = runUntil(bot, world, done + 20_000, () => bot.queue[0].crafted >= 2);
    assert.ok(again);
    runUntil(bot, world, again, () => false, { maxMs: 20_000 });
    assert.equal(log.filter((l) => l === 'queueDone').length, 2, 'a new finish is a new word');
    // Only 0 Cherries left: the third Apple never finishes, so the queue is never done.
    setJobTotal(bot, world, 'apple', 3);
    runUntil(bot, world, again + 20_000, () => false, { maxMs: 120_000, stepMs: 1000 });
    assert.equal(bot.queue[0].crafted, 2);
    assert.equal(log.filter((l) => l === 'queueDone').length, 2);
  });

  it('the feature puts one short "From Crafty-bot" line in the activity feed, no toast and no modal', async () => {
    assert.equal(CRAFTYBOT_COPY.promptTitle, 'From Crafty-bot');
    assert.ok(CRAFTYBOT_COPY.queueDone, 'its words');
    assert.ok(!/—/.test(CRAFTYBOT_COPY.queueDone), 'no em dash');
    assert.ok(CRAFTYBOT_COPY.queueDone.length <= 60, 'short');
    const { craftybotFeature } = await import('../public/js/features/craftybot-feature.js?v=bbe1e4da');
    craftybotFeature.restore({ owned: true, where: 'pack' });
    const feed = [];
    const toasts = [];
    const prompts = [];
    const engine = {
      inv: {},
      pc: { xp: 0, imagination: 0 },
      toolState: {},
      droppedItems: { version: 1, nextId: 1, streets: {} },
      param: () => null,
      pushActivity: (m) => feed.push(m),
      toast: (m) => toasts.push(m),
      prompt: (p) => prompts.push(p),
      save() {},
      refreshPack() {},
    };
    craftybotFeature._world(engine).queueDone();
    assert.deepEqual(feed, [`${CRAFTYBOT_COPY.promptTitle}: ${CRAFTYBOT_COPY.queueDone}`]);
    assert.deepEqual(toasts, []);
    assert.deepEqual(prompts, []);
  });

  it('is listed as ours in the inventions register', () => {
    const reg = JSON.parse(readFileSync(join(ROOT, 'tools/inventions/inventions.json'), 'utf8'));
    const e = reg.entries.find((x) => x.id === 'craftybot-queue-done-line');
    assert.ok(e, 'the entry');
    assert.equal(e.status, 'kept');
    assert.match(e.ruling, /Austin 2026-11-27/);
  });
});
