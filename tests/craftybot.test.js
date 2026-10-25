/**
 * Craftybot: the job catalog build, the step planner, fuel, crystals, the
 * queue and the delivery box, against items/npc_crafty_bot.js,
 * utils/craftytasking.js and items/catalog_craftytasking.js numbers.
 * Run: node --test tests/craftybot.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CRAFTYBOT,
  CRAFTYBOT_BOX,
  CRAFTYBOT_COPY,
  advanceCraftybot,
  buildSequence,
  collectJob,
  costCheck,
  craftybotSpec,
  craftybotView,
  createBot,
  createCraftybotState,
  elementSpec,
  installCrystalCheck,
  kick,
  normalizeCraftybotState,
  queueAdd,
  queueRemove,
  queueSizeMax,
  refuelCheck,
  refuelFromCells,
  setCraftybotSpecs,
  setJobTotal,
  setPaused,
  serializeCraftybotState,
} from '../public/js/craftybot.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const CATALOG = join(PUBLIC, 'assets/content/craftybot-specs.json');

function packWorld(inv, log = []) {
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
    drop: (cls, n) => {
      inv[cls] = (inv[cls] || 0) + n;
    },
    give: (cls, n) => {
      inv[cls] = (inv[cls] || 0) + n;
    },
    imagination: (n) => log.push(`img ${n}`),
    prompt: (t) => log.push(`prompt ${t}`),
    say: (t) => log.push(`say ${t}`),
    sound: (k) => log.push(`sound ${k}`),
  };
}

function groundWorld(stacks, log = []) {
  return {
    inLocation: true,
    count: (cls) => stacks.filter((s) => String(cls).split('|').includes(s.cls)).reduce((a, s) => a + s.count, 0),
    find: (cls) => stacks.find((s) => String(cls).split('|').includes(s.cls) && s.count > 0) || null,
    take: (id, cls, n) => {
      const s = stacks.find((x) => x.id === id);
      if (!s) return 0;
      const k = Math.min(n, s.count);
      s.count -= k;
      return k;
    },
    wear: () => ({ broke: false }),
    drop: (cls, n, x) => stacks.push({ id: `d${stacks.length}`, cls, count: n, x }),
    give: () => {},
    imagination: (n) => log.push(`img ${n}`),
    prompt: (t) => log.push(`prompt ${t}`),
    say: (t) => log.push(`say ${t}`),
    sound: (k) => log.push(`sound ${k}`),
    stopSound() {},
    fuelCell: () => stacks.find((s) => s.cls === 'fuel_cell' && s.count > 0) || null,
  };
}

/** Run the bot's timers forward in small steps; returns the time at which `until` held. */
function runUntil(bot, world, from, until, { stepMs = 100, maxMs = 600_000 } = {}) {
  for (let t = from; t <= from + maxMs; t += stepMs) {
    advanceCraftybot(bot, t, world);
    if (until(t)) return t;
  }
  return null;
}

before(() => {
  setCraftybotSpecs(JSON.parse(readFileSync(CATALOG, 'utf8')).specs);
});

describe('craftybot catalog build (build-craftybot.mjs)', () => {
  it('is current and keeps the 319 queueable specs of 1,162', () => {
    execFileSync(process.execPath, [join(ROOT, 'build-craftybot.mjs'), '--check'], { cwd: ROOT });
    const json = JSON.parse(readFileSync(CATALOG, 'utf8'));
    assert.equal(json.coverage.sourceSpecs, 1162);
    assert.equal(json.coverage.queueable, 319);
    assert.equal(Object.keys(json.specs).length, 319);
    assert.ok(json.coverage.menu >= 250, `menu jobs ${json.coverage.menu}`);
  });

  it('keeps catalog_craftytasking.js numbers: Apple is 3 Cherries, 2300 ms, 3 fuel, recipe 112', () => {
    const apple = craftybotSpec('apple');
    assert.equal(apple.recipe_id, '112');
    assert.equal(apple.fuel_cost, 3);
    assert.equal(apple.tool.class_tsid, 'fruit_changing_machine');
    assert.equal(apple.tool.wait_ms, 2300);
    assert.deepEqual(apple.ingredients.map((i) => [i.class_tsid, i.count]), [['cherry', 3]]);
    const blender = craftybotSpec('blender');
    assert.equal(blender.tool.wait_ms, 10300);
    assert.equal(blender.required_ingredients.element_red, 60);
  });
});

describe('npc_crafty_bot.js instance props', () => {
  it('starts with 3000 fuel, 3 of 9 crystals and 1000 crystal hit points', () => {
    const bot = createBot(createCraftybotState(), 300, 'street', 0);
    assert.equal(bot.fuel, 3000);
    assert.equal(bot.crystals, 3);
    assert.equal(bot.slots, 9);
    assert.equal(bot.crystalHp, 1000);
    assert.equal(CRAFTYBOT.MAX_FUEL, 3000);
    assert.equal(CRAFTYBOT.FUEL_PER_CELL, 500);
    assert.equal(CRAFTYBOT.WALK_SPEED, 70);
  });

  it('queueSizeMax doubles 5 per crystal and is 0 with none', () => {
    const bot = createCraftybotState();
    for (const [n, max] of [[0, 0], [1, 10], [3, 40], [9, 2560]]) {
      bot.crystals = n;
      assert.equal(queueSizeMax(bot), max);
    }
  });

  it('refuse refuel at a full tank and crystals past 9 slots, with the source copy', () => {
    const bot = createBot(createCraftybotState(), 0, 'pack', 0);
    assert.deepEqual(refuelCheck(bot, 3), { ok: false, msg: 'No more fuel is needed.' });
    bot.fuel = 10;
    assert.deepEqual(refuelCheck(bot, 0), { ok: false, msg: "You don't have any fuel cells." });
    assert.equal(installCrystalCheck(bot, 0).msg, "You don't have any Crystals.");
    bot.crystals = 9;
    assert.equal(installCrystalCheck(bot, 5).msg, 'No more Crystals can be installed.');
  });

  it('saves and restores the whole bot, queue and timers included', () => {
    const inv = { cherry: 9, fruit_changing_machine: 1 };
    const world = packWorld(inv);
    const bot = createBot(createCraftybotState(), 0, 'pack', 1000);
    advanceCraftybot(bot, 2000, world);
    setJobTotal(bot, world, 'apple', 3);
    const copy = normalizeCraftybotState(serializeCraftybotState(bot));
    assert.equal(copy.queue.length, 1);
    assert.equal(copy.queue[0].item, 'apple');
    assert.deepEqual(Object.keys(copy.timers).sort(), Object.keys(bot.timers).sort());
  });
});

describe('a job in the pack (no walking)', () => {
  it('crafts what the pack allows, burns fuel and crystal points, then Collect hands the items over', () => {
    const inv = { cherry: 10, fruit_changing_machine: 1 };
    const world = packWorld(inv);
    const bot = createBot(createCraftybotState(), 0, 'pack', 1000);
    advanceCraftybot(bot, 2500, world);
    assert.equal(setJobTotal(bot, world, 'apple', 4), 0);
    const seq = bot.queue[0].seq;
    assert.deepEqual(seq.map((s) => s.type), ['fetch_ingredient', 'fetch_tool', 'craft', 'craft_complete']);
    const craft = seq[2].data;
    assert.deepEqual(craft.count, [3]); // floor(10 / 3)
    assert.equal(craft.duration, 3 * 2300);
    assert.equal(craft.fuel_cost, 9);
    const done = runUntil(bot, world, 2500, () => bot.queue[0].crafted === 3);
    assert.ok(done, 'three apples');
    assert.equal(bot.fuel, 3000 - 9);
    assert.equal(bot.crystalHp, 997);
    assert.equal(inv.cherry, 1);
    const v = craftybotView(bot);
    assert.equal(v.jobs[0].done, 3);
    assert.equal(v.jobs[0].total, 4);
    assert.equal(collectJob(bot, world, 'apple', 3), 3);
    assert.equal(inv.apple, 3);
    assert.equal(bot.queue[0].count, 1);
    assert.equal(bot.queue[0].crafted, 0);
  });

  it('pausing stops the job and resuming carries on', () => {
    const inv = { cherry: 3, fruit_changing_machine: 1 };
    const world = packWorld(inv);
    const bot = createBot(createCraftybotState(), 0, 'pack', 0);
    advanceCraftybot(bot, 1500, world);
    setJobTotal(bot, world, 'apple', 1);
    setPaused(bot, world, 'apple', true);
    runUntil(bot, world, 1500, () => false, { maxMs: 30_000, stepMs: 500 });
    assert.equal(bot.queue[0].crafted, 0);
    setPaused(bot, world, 'apple', false);
    assert.ok(runUntil(bot, world, 32_000, () => bot.queue[0].crafted === 1));
  });
});

describe('a job on the home street (walking, collapsing, crafting)', () => {
  it('walks at 70 px/s, folds for 3.4 s, crafts for 2300 ms an Apple, and unfolds', () => {
    const stacks = [{ id: 'c', cls: 'cherry', count: 9, x: 410 }, { id: 'm', cls: 'fruit_changing_machine', count: 1, x: 900 }];
    const log = [];
    const world = groundWorld(stacks, log);
    const bot = createBot(createCraftybotState(), 200, 'street', 0);
    advanceCraftybot(bot, 2000, world);
    setJobTotal(bot, world, 'apple', 3);
    assert.equal(bot.craftState, 'fetch');
    assert.equal(bot.move.toX, 410);
    assert.equal(bot.move.endAt - bot.move.startAt, (210 / 70) * 1000);
    const collapseAt = runUntil(bot, world, 2000, () => bot.anim === 'collapse', { stepMs: 50 });
    // 3 s to the Cherries, 1.5 s after picking them up (onDonePathing), 7 s to the machine.
    assert.ok(Math.abs(collapseAt - (2000 + 3000 + 1500 + 7000)) <= 100, `collapse at ${collapseAt}`);
    const craftAt = runUntil(bot, world, collapseAt, () => bot.anim === 'craft', { stepMs: 50 });
    assert.ok(Math.abs(craftAt - collapseAt - CRAFTYBOT.COLLAPSE_MS) <= 50);
    const doneAt = runUntil(bot, world, craftAt, () => bot.queue[0].crafted === 3, { stepMs: 50 });
    // Craft 6900 ms, craftEnd 2 s, expand 2.6 s.
    assert.ok(Math.abs(doneAt - craftAt - (6900 + 2000 + 2600)) <= 100, `done ${doneAt - craftAt}`);
    assert.deepEqual(log.filter((l) => l.startsWith('sound CRAFTYBOT')).map((l) => l.slice(6)), [
      'CRAFTYBOT_WALK', 'CRAFTYBOT_WALK', 'CRAFTYBOT_COLLAPSE', 'CRAFTYBOT_CRAFT_START', 'CRAFTYBOT_CRAFT_END', 'CRAFTYBOT_EXPAND',
    ]);
    assert.equal(stacks[0].count, 0);
  });

  it('removing the running job drops what it holds back on the ground', () => {
    const stacks = [{ id: 'c', cls: 'cherry', count: 9, x: 300 }, { id: 'm', cls: 'fruit_changing_machine', count: 1, x: 2000 }];
    const world = groundWorld(stacks);
    const bot = createBot(createCraftybotState(), 280, 'street', 0);
    advanceCraftybot(bot, 2000, world);
    setJobTotal(bot, world, 'apple', 3);
    runUntil(bot, world, 2000, () => bot.move && bot.move.toX === 2000);
    queueRemove(bot, world, 'apple', 3);
    assert.equal(bot.queue.length, 0);
    const dropped = stacks.filter((s) => s.id.startsWith('d'));
    assert.deepEqual(dropped.map((s) => [s.cls, s.count]), [['cherry', 9]]);
  });
});

describe('fuel and crystals', () => {
  it('halts with the source prompt when the tank cannot pay a step, and a Fuel Cell (+500) resumes it', () => {
    const inv = { cherry: 9, fruit_changing_machine: 1 };
    const log = [];
    const world = packWorld(inv, log);
    const bot = createBot(createCraftybotState(), 0, 'pack', 0);
    bot.fuel = 6;
    advanceCraftybot(bot, 1500, world);
    setJobTotal(bot, world, 'apple', 3);
    runUntil(bot, world, 1500, () => bot.queue[0].halted);
    assert.ok(log.includes(`prompt ${CRAFTYBOT_COPY.outOfFuel}`));
    assert.equal(CRAFTYBOT_COPY.outOfFuel, 'Your Crafty Bot has run out of fuel. All active jobs have been halted.');
    assert.equal(craftybotView(bot).jobs[0].status.txt, 'Job Halted');
    refuelFromCells(bot, world, 1);
    // +500, and the halted craft step runs again at once and pays its 9.
    assert.equal(bot.fuel, 6 + 500 - 9);
    assert.equal(bot.queue[0].halted, false);
    assert.ok(runUntil(bot, world, 20_000, () => bot.queue[0].crafted === 3));
    assert.equal(bot.fuel, 497);
  });

  it('burns one crystal hit point per item and loses a crystal at zero', () => {
    const inv = { cherry: 9, fruit_changing_machine: 1 };
    const log = [];
    const world = packWorld(inv, log);
    const bot = createBot(createCraftybotState(), 0, 'pack', 0);
    bot.crystalHp = 2;
    advanceCraftybot(bot, 1500, world);
    setJobTotal(bot, world, 'apple', 3);
    runUntil(bot, world, 1500, () => bot.queue[0].crafted === 3);
    assert.equal(bot.crystals, 2);
    assert.equal(bot.crystalHp, 1000);
    assert.ok(log.includes('say A crystal has burnt out.'));
    assert.equal(queueSizeMax(bot), 20);
  });

  it('refuses jobs past the queue size and with no crystals', () => {
    const world = packWorld({});
    const bot = createBot(createCraftybotState(), 0, 'pack', 0);
    bot.crystals = 0;
    assert.equal(queueAdd(bot, world, 'apple', 1), null);
    bot.crystals = 1; // 10
    assert.equal(queueAdd(bot, world, 'apple', 25), 0);
    assert.equal(bot.queue[0].count, 10);
    assert.equal(queueAdd(bot, world, 'orange', 1), null);
  });

  it('a kick clears halts, pauses and locks', () => {
    const world = packWorld({});
    const bot = createBot(createCraftybotState(), 0, 'pack', 0);
    queueAdd(bot, world, 'apple', 1);
    Object.assign(bot.queue[0], { halted: true, paused: true, locked: true });
    kick(bot, world);
    assert.deepEqual([bot.queue[0].halted, bot.queue[0].paused, bot.queue[0].locked], [false, false, false]);
  });
});

describe('the planner (utils/craftytasking.js)', () => {
  it('craftybot_cost: two Apples use 6 fuel; with 2 Cherries it lists 4 missing and costs what it can make (0)', () => {
    const ready = costCheck(packWorld({ cherry: 6, fruit_changing_machine: 1 }), 'apple', 2);
    assert.equal(ready.fuel_cost, 6);
    const short = costCheck(packWorld({ cherry: 2, fruit_changing_machine: 1 }), 'apple', 2);
    assert.equal(short.fuel_cost, 0);
    const fetch = short.components.find((c) => c.item_classes[0] === 'cherry');
    assert.deepEqual([fetch.counts[0], fetch.counts_missing[0], fetch.status], [6, 4, 'missing']);
  });

  it('chains sub-recipes: a Sammich fetches grain and spice and makes its bun first', () => {
    const seq = buildSequence(packWorld({}), craftybotSpec('sammich'), 1, {});
    const crafts = seq.filter((s) => s.type === 'craft').map((s) => s.data.class_id[0]);
    assert.ok(crafts.includes('bun'));
    assert.equal(crafts[crafts.length - 1], 'sammich');
    assert.equal(seq[seq.length - 1].type, 'craft_complete');
  });

  it('crushes the cheapest rocks for elements (beryl gives 4 blue, 20 red, 2 green)', () => {
    const world = packWorld({ beryl: 5, dullite: 0, sparkly: 0 });
    const spec = elementSpec(world, { element_red: 60 });
    assert.deepEqual(spec.ingredients.map((r) => [r.class_tsid, r.count, r.red_elements, r.blue_elements, r.green_elements]), [['beryl', 3, 60, 12, 6]]);
    // duration 2 + 100 + n * 200 (n <= 10)
    assert.equal(spec.ingredients[0].wait_ms, 702);
  });
});

describe('an element job: crushing rocks on the way to Copper', () => {
  it('fetches the cheapest rocks, crushes them with the grinder at its own yield, smelts, and makes Copper', () => {
    const inv = { beryl: 3, dullite: 4, metal_rock: 5, ore_grinder: 1, smelter: 1, alchemical_tongs: 1 };
    const world = packWorld(inv);
    const bot = createBot(createCraftybotState(), 0, 'pack', 0);
    advanceCraftybot(bot, 1500, world);
    setJobTotal(bot, world, 'copper', 1);
    const crush = bot.queue[0].seq.filter((s) => s.type === 'craft' && s.data.tool === 'ore_grinder|grand_ol_grinder');
    assert.deepEqual(crush.map((s) => [s.data.ingredient_class[0], s.data.count]), [['beryl', [60, 12, 6]], ['dullite', [15, 24]]]);
    assert.deepEqual(crush.map((s) => s.data.fuel_cost), [1, 1]);
    assert.ok(runUntil(bot, world, 1500, () => bot.queue[0].crafted === 1, { stepMs: 200 }));
    assert.deepEqual([inv.beryl, inv.dullite, inv.metal_rock], [0, 1, 0]);
  });
});

describe('delivery and wiring', () => {
  it('keeps the read_label_craftybot conversation and the box spot', () => {
    assert.equal(CRAFTYBOT_BOX.beats.length, 5);
    assert.equal(CRAFTYBOT_BOX.beats[0].text, "Special 'End-of-Ur' delivery.");
    assert.equal(CRAFTYBOT_BOX.beats[4].text, 'Just open this box to let him loose.');
    assert.equal(CRAFTYBOT.BOX_OFFSET_X, -124);
    assert.equal(CRAFTYBOT.OPEN_DELAY_MS, 750);
    assert.equal(CRAFTYBOT_COPY.created, 'All hail the Craftybot.');
  });

  it('G232: the box comes in the house, 124 px left of the yard rock, on the yard ground (location.js 128-156)', () => {
    const loc = join(PUBLIC, '../../glitch-GameServerJS/locations/location.js');
    if (existsSync(loc)) {
      const src = readFileSync(loc, 'utf8');
      assert.match(src, /if \(!this\.is_public && pc == this\.owner\)\{\s*\/\/ In their house[\s\S]*?var magic_rock = this\.findFirst\('magic_rock'\);[\s\S]*?createAndReturnItem\('butler_box', 1, point\.x-124, point\.y/);
    }
    const feature = readFileSync(join(PUBLIC, 'js/features/craftybot-feature.js'), 'utf8');
    assert.match(feature, /if \(room === 'interior' && !bot\.owned && engine\.homeContext\?\.\(\)\.owned\) \{\s*view\.box = spawnBox\(engine\);/);
    assert.match(feature, /createBot\(bot, pendingOpenX, 'interior', t\);/);
    assert.match(feature, /t\.classId === 'magic_rock' && t\.state\?\.room === 'yard'/);
    assert.match(feature, /if \(room === 'interior' && x < houseLeftX\(\)\) return BACK_YARD_GROUND_Y;/);
  });

  it('registers the feature and ships its art and sounds', () => {
    const index = readFileSync(join(PUBLIC, 'js/features/index.js'), 'utf8');
    assert.match(index, /craftybot-feature\.js\?v=g232-1'; FEATURES\.push\(craftybotFeature\)/);
    for (const f of ['idle0', 'walk', 'collapse', 'craftStart', 'craftEnd', 'expand', 'sleepMode', 'peek']) {
      assert.ok(existsSync(join(PUBLIC, `assets/sprites/craftybot/craftybot_${f}.webp`)), f);
    }
    assert.ok(existsSync(join(PUBLIC, 'assets/sprites/craftybot/butler_box_craftybot.png')));
    assert.ok(existsSync(join(PUBLIC, 'assets/sprites/icons/npc_crafty_bot.png')));
    const keys = JSON.parse(readFileSync(join(PUBLIC, 'assets/content/sound-keys.json'), 'utf8')).keys;
    for (const k of ['CRAFTYBOT_WALK', 'CRAFTYBOT_COLLAPSE', 'CRAFTYBOT_EXPAND', 'CRAFTYBOT_CRAFT_START', 'CRAFTYBOT_CRAFT_END', 'CRAFTYBOT_KICK', 'CRAFTYBOT_PEEK']) {
      assert.ok(keys[k]?.file, k);
    }
  });
});

describe('craftybot feature: the ingredient source and the job menu', async () => {
  // The feature imports these with their browser cache tags; load the same module instances.
  const { craftybotFeature } = await import('../public/js/features/craftybot-feature.js');
  const { homesFeature } = await import('../public/js/features/homes-feature.js?v=homes-13');
  const cbMod = await import('../public/js/craftybot.js?v=craftybot-1');
  const making = await import('../public/js/making.js?v=g215-1');

  function fakeEngine(extra = {}) {
    return {
      inv: {},
      pc: { xp: 0, imagination: 0 },
      toolState: {},
      groundY: 620,
      droppedItems: { version: 1, nextId: 10, streets: {} },
      learnedSkills: [],
      questState: { completed: [] },
      unlockedAchievements: [],
      param: () => null,
      save() {},
      refreshPack() {},
      refreshHomeScene() {},
      droppedItemsChanged() {},
      ...extra,
    };
  }

  it('fetches from Storage Display Boxes before the floor indoors, and from the floor outdoors', () => {
    cbMod.setCraftybotSpecs(JSON.parse(readFileSync(CATALOG, 'utf8')).specs);
    homesFeature.restore({ decor: { starterKit: true, placed: [{ id: 7, classTsid: 'bag_furniture_sdb', x: 900, y: 560, display: { classTsid: 'cherry', count: 5 } }] } });
    craftybotFeature.restore({ owned: true, where: 'interior', x: 300 });
    const engine = fakeEngine();
    engine.droppedItems.streets.RH_HOME_INT = [{ id: 'world-item-3', streetTsid: 'RH_HOME_INT', classTsid: 'cherry', count: 4, x: 320, y: 620 }];
    const world = craftybotFeature._world(engine);
    assert.equal(world.inLocation, true);
    assert.equal(world.count('cherry'), 9);
    // findItem: SDBs first even though the floor stack is nearer.
    const sdbX = homesFeature._state().houseDecor.placed[0].x;
    assert.deepEqual(world.find('cherry'), { id: 'sdb:7', cls: 'cherry', x: sdbX });
    assert.equal(world.take('sdb:7', 'cherry', 3), 3);
    assert.equal(homesFeature._state().houseDecor.placed[0].display.count, 2);
    assert.equal(world.take('world-item-3', 'cherry', 9), 4);
    assert.equal(engine.droppedItems.streets.RH_HOME_INT, undefined);
    world.drop('apple', 2, 333);
    assert.deepEqual(engine.droppedItems.streets.RH_HOME_INT.map((r) => [r.classTsid, r.count, r.x]), [['apple', 2, 333]]);
    craftybotFeature.restore({ owned: true, where: 'street', x: 300 });
    const street = craftybotFeature._world(engine);
    assert.equal(street.count('cherry'), 0, 'the street does not see the house');
  });

  it('works from the pack: counts, takes and drops go through the pack', () => {
    craftybotFeature.restore({ owned: true, where: 'pack' });
    const engine = fakeEngine({ inv: { cherry: 6, npc_crafty_bot: 1 } });
    const world = craftybotFeature._world(engine);
    assert.equal(world.inLocation, false);
    assert.equal(world.count('cherry'), 6);
    assert.equal(world.take('cherry', 'cherry', 4), 4);
    world.drop('cherry', 1);
    assert.equal(engine.inv.cherry, 3);
  });

  it('lists only recipes the player can make: transmogrification for everyone, the rest by skill, no furniture or machines', async () => {
    await making.loadRecipeCatalogFromFile(join(PUBLIC, 'assets/content/recipes.json'));
    const none = craftybotFeature._menu(fakeEngine());
    assert.ok(none.length > 0);
    const transmog = ['fruit_changing_machine', 'bubble_tuner', 'spice_mill', 'gassifier'];
    const skilled = (r) => Boolean(r.skill) || (r.skills || []).length > 0;
    assert.ok(none.every((r) => transmog.includes(r.tool) || !skilled(r)));
    assert.ok(none.some((r) => r.outputs[0].classTsid === 'apple'));
    const cook = craftybotFeature._menu(fakeEngine({ learnedSkills: ['ezcooking_1', 'ezcooking_2', 'cheffery_1', 'cheffery_2'] }));
    assert.ok(cook.some((r) => r.tool === 'knife_and_board'));
    assert.ok(cook.every((r) => !r.outputs[0].classTsid.startsWith('furniture_') && !r.fuel));
  });
});
