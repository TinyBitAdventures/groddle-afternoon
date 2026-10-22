/**
 * Craftybot: Tiny Speck's crafting robot (items/npc_crafty_bot.js, the step
 * planner in utils/craftytasking.js, the static recipe trees in
 * items/catalog_craftytasking.js, the job panel in the client's
 * port/CraftyDialog.as + port/CraftyManager.as + view/ui/craftybot/*).
 *
 * This module is the pure rules port: no Pixi, no DOM. The feature
 * (js/features/craftybot-feature.js) owns the world, the panel and the clock.
 *
 * Shape of the source, kept here:
 *  - A queue of jobs (one per item class). Each job holds a `craft_sequence`
 *    built by craftytasking_build_sequence from the item's static spec and
 *    what the bot's ingredient source holds right now: fetch_ingredient,
 *    fetch_tool, craft, fetch_machine, use_machine, and a final
 *    craft_complete step.
 *  - The ingredient source is where the bot stands: the location (items on
 *    the floor and in storage boxes, the bot walks to each at 70 px/s) or the
 *    owner's pack (no walking, no machines).
 *  - Steps run on named server timers (apiSetTimerX). Here every timer is a
 *    { at, arg } row in bot.timers and `advanceCraftybot(bot, now, world)`
 *    fires them in time order, so the bot keeps working while the player is
 *    away and catches up on the next visit.
 *  - Fuel: max 3000, 500 per Fuel Cell; every step with a fuel_cost burns it,
 *    and an empty tank halts the job. Crystals: 3 of 9 slots installed;
 *    queue size 5 x 2^crystals; each crafted item burns one of the current
 *    crystal's 1000 hit points, and a burnt-out crystal is gone.
 *  - Crafted items wait in the job's 'complete' holder until Collect puts
 *    them in the pack.
 *
 * The world adapter (`world`) answers for the source:
 *   inLocation                      boolean
 *   count(cls, { toolWear })        items available (tools: working, with toolWear points left)
 *   find(cls, { toolWear })         { id, x } of the nearest usable stack, SDBs first, or null
 *   take(id, cls, n)                -> n actually taken from that stack
 *   wear(cls, n)                    -> { broke } tool wear on the tool class
 *   drop(cls, n, x)                 location: ground stack at x; pack: into the pack
 *   give(cls, n)                    collected items into the owner's pack
 *   imagination(n)                  iMG to the owner (dispersed elements)
 *   say(text, ms), prompt(text), sound(key), overlay(cls)   presentation (optional)
 *   fuelCell()                      { id, x } of a Fuel Cell in the location, or null
 */

/** npc_crafty_bot.js classProps / initInstanceProps. */
export const CRAFTYBOT = Object.freeze({
  CLASS: 'npc_crafty_bot',
  MAX_FUEL: 3000,
  START_FUEL: 3000,
  FUEL_PER_CELL: 500,
  START_CRYSTALS: 3,
  CRYSTAL_SLOTS: 9,
  CRYSTAL_HIT_POINTS: 1000,
  BASE_QUEUE: 5,
  WALK_SPEED: 70, // npc_walk_speed, px/s (base_speed / time_multiplier)
  TIME_MULTIPLIER: 1,
  FETCH_REACH: 50, // moveToTarget: walk when the item is more than 50 px away
  MACHINE_REACH: 100,
  COLLAPSE_MS: 3400,
  EXPAND_MS: 2600,
  CRAFT_END_MS: 2000,
  IDLE_TO_SLEEP_MS: 3 * 60 * 1000,
  PEEK_GAP_MS: 10 * 1000,
  PEEK_MS: 5 * 1000,
  REBUILD_AFTER_ADD_MS: 2000, // onContainerItemAdded: craftSequenceRebuildAll
  RESCAN_AFTER_ADD_MS: 3000, //                       queueSetActive(0)
  BOX_OFFSET_X: -124, // location.js: butler_box at magic_rock.x - 124
  OPEN_DELAY_MS: 750, // butler_box open: createCraftybot after 750 ms
  MAX_QUANTITY: 999, // CraftyJobDetailsUI.MAX_QUANTITY
  ELEMENT_TOOL: 'ore_grinder|grand_ol_grinder',
});

export const ELEMENTS = Object.freeze(['element_green', 'element_red', 'element_blue', 'element_shiny']);
const ELEMENT_SET = new Set(ELEMENTS);

/** Recovered copy (npc_crafty_bot.js, location.js/player.js, butler_box.js, the client). */
export const CRAFTYBOT_COPY = Object.freeze({
  created: 'All hail the Craftybot.',
  outOfFuel: 'Your Crafty Bot has run out of fuel. All active jobs have been halted.',
  crystalInstalled: 'The Crystal has been installed into the Crafty Bot',
  crystalBurnt: 'A crystal has burnt out.',
  brokeTool: 'Oops, I broke it.',
  noMachinesInPack: "I can't use machines while I'm in your pack.",
  notYours: "This isn't your Crafty Bot.",
  noCrystals: "You don't have any Crystals.",
  crystalsFull: 'No more Crystals can be installed.',
  noFuelCells: "You don't have any fuel cells.",
  fuelFull: 'No more fuel is needed.',
  promptTitle: 'From Crafty-bot',
  haltedStep: "You'll need more fuel to continue this job.",
  noQueue: 'Craftybot isn’t working on anything right now.',
  noQueueCta: 'Why not give it a job to do?',
  queueFull: "Your Craftybot's queue is full!",
  removeActive: "Your Craftybot is still working on this job and if you remove it now it will drop what it's doing and lose any ingredients that may be in processing. This ok with you?",
  removeAll: 'You sure you want to remove this job?',
  crystalsTip: 'Crystals affect Craftybot’s capacity',
  idleStatus: 'Just hanging out',
  defaultStatus: 'Confabulating thingies',
  tooltips: {
    install_crystal: 'Install a crystal to increase the queue size',
    kick: 'Am I standing there looking like a goof?',
    pickup: 'Put it in your pack',
    drop: 'Drop it on the ground',
    craft: 'Start crafting an item',
    refuel: 'Add more fuel. Current level: $fuel_level/$max_fuel',
  },
});

/** butler_box.js conversation_run_read_label_craftybot (Special 'End-of-Ur' delivery). */
export const CRAFTYBOT_BOX = Object.freeze({
  CLASS: 'butler_box',
  label: 'Special One-Time Delivery',
  description: 'Special delivery, just for you! Whatever could it be?',
  beats: [
    { text: "Special 'End-of-Ur' delivery.", response: 'Oh, great. What is it?' },
    { text: 'Well someone in Ur has been busy working on this for what feels like forever.', response: 'Uh ok, what is it?' },
    { text: "Figured since the end of Ur was nigh, we'd just cobble some together and let you play with one.", response: 'Cobble together what?' },
    { text: "It might not be perfect, and might need the occasional 'Kick' to get it back in commision.", response: 'Seriously, what is it?' },
    { text: 'Just open this box to let him loose.', response: '...' },
  ],
});

let SPECS = {};

/** Install the generated catalog (assets/content/craftybot-specs.json `specs`). */
export function setCraftybotSpecs(specs) {
  SPECS = specs && typeof specs === 'object' ? specs : {};
}

export function craftybotSpec(cls) {
  return SPECS[cls] || null;
}

export function craftybotSpecCount() {
  return Object.keys(SPECS).length;
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

function int(v, d = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : d;
}

function cleanCls(v) {
  return String(v || '').replace(/[^a-zA-Z0-9_|:-]/g, '');
}

function cleanHolder(h) {
  const out = {};
  if (!h || typeof h !== 'object') return out;
  for (const [cat, rows] of Object.entries(h)) {
    if (!rows || typeof rows !== 'object') continue;
    const clean = {};
    for (const [cls, row] of Object.entries(rows)) {
      const c = cleanCls(cls);
      const n = int(row?.count);
      if (!c || n <= 0) continue;
      clean[c] = { count: n };
      if (row?.tsid && typeof row.tsid === 'object') clean[c].tsid = { ...row.tsid };
    }
    out[String(cat).replace(/[^a-z]/g, '') || 'general'] = clean;
  }
  return out;
}

export function createCraftybotState(seed = {}) {
  return normalizeCraftybotState(seed);
}

/** The persistent bot (npc_crafty_bot instance props + the queue DC). */
export function normalizeCraftybotState(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const bot = {
    version: 1,
    owned: s.owned === true,
    boxRead: s.boxRead === true,
    where: ['street', 'interior', 'pack'].includes(s.where) ? s.where : 'street',
    x: Number.isFinite(Number(s.x)) ? Number(s.x) : 0,
    dir: s.dir === 'right' ? 'right' : 'left',
    fuel: Math.max(0, Math.min(CRAFTYBOT.MAX_FUEL, Number.isFinite(Number(s.fuel)) ? Number(s.fuel) : CRAFTYBOT.START_FUEL)),
    crystals: Math.max(0, Math.min(CRAFTYBOT.CRYSTAL_SLOTS, s.crystals == null ? CRAFTYBOT.START_CRYSTALS : int(s.crystals))),
    slots: CRAFTYBOT.CRYSTAL_SLOTS,
    crystalHp: Math.max(0, s.crystalHp == null ? CRAFTYBOT.CRYSTAL_HIT_POINTS : int(s.crystalHp)),
    queue: [],
    active: s.active == null ? undefined : int(s.active),
    iterator: Number(s.iterator) || 0,
    crafting: s.crafting === true,
    craftState: typeof s.craftState === 'string' ? s.craftState : 'idle',
    anim: typeof s.anim === 'string' ? s.anim : 'idle0',
    animAt: Number(s.animAt) || 0,
    collapsed: s.collapsed === true,
    walkTarget: s.walkTarget === 'craft' || s.walkTarget === 'machine' ? s.walkTarget : null,
    moveTarget: s.moveTarget ? String(s.moveTarget) : null,
    move: s.move && Number.isFinite(Number(s.move.toX)) ? {
      fromX: Number(s.move.fromX) || 0,
      toX: Number(s.move.toX),
      startAt: Number(s.move.startAt) || 0,
      endAt: Number(s.move.endAt) || 0,
    } : null,
    refuelling: s.refuelling === true,
    craftingTool: s.craftingTool ? cleanCls(s.craftingTool) : null,
    timers: {},
    timerSeq: int(s.timerSeq, 0),
    lastPeek: Number(s.lastPeek) || 0,
    clock: Number(s.clock) || 0,
    dropped: {},
    stats: {
      crafted: int(s.stats?.crafted),
      crystalsBurnt: int(s.stats?.crystalsBurnt),
      fuelUsed: int(s.stats?.fuelUsed),
      kicks: int(s.stats?.kicks),
    },
  };
  for (const [name, t] of Object.entries(s.timers || {})) {
    if (!t || !Number.isFinite(Number(t.at))) continue;
    bot.timers[name] = { at: Number(t.at), arg: t.arg ?? null, seq: int(t.seq) };
  }
  for (const row of Array.isArray(s.queue) ? s.queue : []) {
    const item = cleanCls(row?.item);
    const count = int(row?.count);
    if (!item || count <= 0) continue;
    bot.queue.push({
      item,
      count,
      crafted: Math.max(0, int(row.crafted)),
      paused: row.paused === true,
      locked: row.locked === true,
      halted: row.halted === true,
      iterator: Number(row.iterator) || null,
      holder: cleanHolder(row.holder),
      seq: Array.isArray(row.seq) ? row.seq : [],
      activeSeq: row.activeSeq == null ? undefined : int(row.activeSeq),
      ingredients: row.ingredients || {},
      missing_ingredients: row.missing_ingredients || {},
      tools: row.tools || {},
      missing_tools: row.missing_tools || {},
    });
  }
  if (bot.active != null && (bot.active < 0 || bot.active >= bot.queue.length)) bot.active = bot.queue.length ? 0 : undefined;
  return bot;
}

export function serializeCraftybotState(bot) {
  return JSON.parse(JSON.stringify(bot));
}

/* ------------------------------------------------------------------ */
/* Timers (apiSetTimerX / apiCancelTimer)                              */
/* ------------------------------------------------------------------ */

function setTimer(bot, name, ms, arg = null) {
  bot.timerSeq += 1;
  bot.timers[name] = { at: bot.clock + Math.max(0, ms), arg, seq: bot.timerSeq };
}

function cancelTimer(bot, name) {
  delete bot.timers[name];
}

/* ------------------------------------------------------------------ */
/* Queue size, holders                                                  */
/* ------------------------------------------------------------------ */

/** queueSizeMax: 5 doubled per installed crystal; no crystals, no queue. */
export function queueSizeMax(bot) {
  const n = int(bot.crystals);
  if (n === 0) return 0;
  let max = CRAFTYBOT.BASE_QUEUE;
  for (let i = 0; i < n; i += 1) max *= 2;
  return max;
}

export function queueSize(bot) {
  return bot.queue.reduce((sum, row) => sum + row.count, 0);
}

function holding(bot, qi, cls, holder = 'general') {
  return bot.queue[qi]?.holder?.[holder]?.[cls]?.count || 0;
}

function hold(bot, qi, cls, count, holder = 'general', tsid = null) {
  const row = bot.queue[qi];
  if (!row) return;
  row.holder ||= {};
  row.holder[holder] ||= {};
  row.holder[holder][cls] ||= { count: 0 };
  row.holder[holder][cls].count += count;
  if (tsid) {
    row.holder[holder][cls].tsid ||= {};
    row.holder[holder][cls].tsid[tsid] = 1;
  }
}

function unhold(bot, qi, cls, count, holder = 'general', tsid) {
  const h = bot.queue[qi]?.holder?.[holder]?.[cls];
  if (!h || !h.count) return 0;
  const removed = h.count - count < 0 ? h.count : count;
  h.count -= removed;
  if (tsid != null && h.tsid) delete h.tsid[tsid];
  if (h.count <= 0) delete bot.queue[qi].holder[holder][cls];
  return removed;
}

/* ------------------------------------------------------------------ */
/* utils/craftytasking.js: the planner                                  */
/* ------------------------------------------------------------------ */

/** craftytasking_get_required_rocks_for_elements. */
function requiredRocks(req, active, rockLeft, shinyM, blueM, redM, greenM) {
  let rockUsed = 0;
  if (req[active] > 0) {
    let m = shinyM;
    if (active === 'element_blue') m = blueM;
    if (active === 'element_red') m = redM;
    if (active === 'element_green') m = greenM;
    const rockRequired = Math.ceil(req[active] / m);
    rockUsed = Math.min(rockLeft, rockRequired);
    if (rockUsed > 0) {
      req.element_shiny -= rockUsed * shinyM;
      req.element_blue -= rockUsed * blueM;
      req.element_red -= rockUsed * redM;
      req.element_green -= rockUsed * greenM;
    }
  }
  return rockUsed;
}

/**
 * craftytasking_get_build_element_spec: crush the fewest expensive rocks in
 * the source's order (sparkly -> shiny; beryl -> blue, red; dullite -> green,
 * red; beryl -> green, blue; sparkly -> green, red, blue).
 */
export function elementSpec(world, requiredElements) {
  const req = { element_shiny: 0, element_green: 0, element_blue: 0, element_red: 0, ...requiredElements };
  const left = { sparkly: world.count('sparkly'), beryl: world.count('beryl'), dullite: world.count('dullite') };
  const used = { sparkly: 0, beryl: 0, dullite: 0 };
  const run = (el, rock, s, b, r, g) => {
    used[rock] += requiredRocks(req, el, left[rock] - used[rock], s, b, r, g);
  };
  run('element_shiny', 'sparkly', 6, 4, 5, 1);
  run('element_blue', 'beryl', 0, 4, 20, 2);
  run('element_red', 'beryl', 0, 4, 20, 2);
  run('element_green', 'dullite', 0, 0, 5, 8);
  run('element_red', 'dullite', 0, 0, 5, 8);
  run('element_green', 'beryl', 0, 4, 20, 2);
  run('element_blue', 'beryl', 0, 4, 20, 2);
  run('element_green', 'sparkly', 6, 4, 5, 1);
  run('element_red', 'sparkly', 6, 4, 5, 1);
  run('element_blue', 'sparkly', 6, 4, 5, 1);
  const out = { required_ingredients: {}, ingredients: [] };
  for (const el of ['element_shiny', 'element_blue', 'element_red', 'element_green']) {
    if (req[el] > 0) out.required_ingredients[el] = req[el];
  }
  const rows = [
    ['sparkly', 6, 4, 5, 1],
    ['beryl', 0, 4, 20, 2],
    ['dullite', 0, 0, 5, 8],
  ];
  for (const [rock, s, b, r, g] of rows) {
    const n = used[rock];
    if (n <= 0) continue;
    let duration = 2 + 100 + (n < 10 ? n : 10) * 200;
    if (n > 10) duration += (n - 10) * 100;
    out.ingredients.push({
      class_tsid: rock,
      count: n,
      wait_ms: duration,
      sparkly_elements: n * s,
      blue_elements: n * b,
      red_elements: n * r,
      green_elements: n * g,
    });
  }
  return out;
}

/** craftytasking_build_shopping_list_step. */
function shoppingListStep(world, spec, multiplier, ignoreSource, list, holder) {
  const cls = spec.class_tsid;
  let sourceCount = 0;
  if (!ignoreSource) {
    sourceCount = world.count(cls);
    if (holder[cls]) sourceCount += holder[cls].count;
  }
  if (spec.ingredients && (ignoreSource || sourceCount < spec.count * multiplier)) {
    let used = 0;
    if (!ignoreSource) {
      used = Math.floor(sourceCount / spec.count) * spec.count;
      if (used > 0) list[cls] = (list[cls] || 0) + used;
    }
    for (const ing of spec.ingredients) shoppingListStep(world, ing, multiplier - used, false, list, holder);
    return;
  }
  if (!ELEMENT_SET.has(cls)) list[cls] = (list[cls] || 0) + spec.count * multiplier;
}

/** craftytasking_build_sequence_step. Returns how many of spec it can make plus what the source has. */
function sequenceStep(world, spec, count, ignoreSource, seq, sourceList, external, holder) {
  let sourceCount = 0;
  if (!ignoreSource) {
    sourceCount = world.count(spec.class_tsid);
    if (holder[spec.class_tsid]) sourceCount += holder[spec.class_tsid].count;
    if (sourceCount >= count) return count;
    count -= sourceCount;
  }
  const ingredientClass = [];
  const ingredientCount = [];
  let maxCraftable = !spec.ingredients ? 0 : count;
  for (const ing of spec.ingredients || []) {
    const made = sequenceStep(world, ing, ing.count * count, false, seq, sourceList, external, holder);
    maxCraftable = Math.min(maxCraftable, Math.floor(made / ing.count));
  }
  if (external[spec.class_tsid]) maxCraftable += external[spec.class_tsid];

  let toolClass = '';
  if (spec.tool?.class_tsid && spec.tool.class_tsid !== 'self') {
    for (const t of spec.tool.class_tsid.split('|')) {
      toolClass = t;
      const toolCount = world.count(t, { toolWear: spec.tool.tool_wear });
      if (toolCount < 1) maxCraftable = 0;
      seq.push({
        type: 'fetch_tool',
        can_step: maxCraftable > 0,
        data: { class_id: t, tool_wear: spec.tool.tool_wear, source_count: toolCount, count: 1 },
      });
      if (toolCount > 0) break;
    }
  }

  if (maxCraftable > 0) {
    for (const ing of spec.ingredients || []) {
      ingredientClass.push(ing.class_tsid);
      ingredientCount.push(maxCraftable * (ing.count / spec.count));
      for (const step of seq) {
        if (step.type === 'fetch_ingredient' && step.data.class_id === ing.class_tsid) {
          sourceList[ing.class_tsid] -= maxCraftable * ing.count;
          step.data.count = Math.min(step.data.count, maxCraftable * ing.count);
          step.can_step = true;
        }
      }
    }
  } else {
    for (const ing of spec.ingredients || []) {
      ingredientClass.push(ing.class_tsid);
      ingredientCount.push(0);
      for (const step of seq) {
        if (step.type === 'fetch_ingredient' && step.data.class_id === ing.class_tsid) step.can_step = false;
      }
    }
  }

  if (spec.tool?.class_tsid) {
    seq.push({
      type: 'craft',
      can_step: maxCraftable > 0,
      data: {
        class_id: [spec.class_tsid],
        count: [maxCraftable],
        tool: toolClass,
        tool_wear: (spec.tool.tool_wear || 0) * maxCraftable,
        energy_cost: (spec.energy_cost || 0) * maxCraftable,
        fuel_cost: (spec.fuel_cost || 0) * maxCraftable,
        duration: spec.tool.wait_ms * maxCraftable * CRAFTYBOT.TIME_MULTIPLIER,
        tool_verb: spec.tool.verb || null,
        ingredient_class: ingredientClass,
        ingredient_count: ingredientCount,
      },
    });
  }

  if (spec.machine?.class_tsid) {
    // The remake's machines live in the pack (js/machines.js), never placed, so
    // container.find_items_including_bags finds none and no fetch_machine step is added.
    for (const m of spec.machine.class_tsid.split('|')) {
      if (world.count(m) > 0) {
        seq.push({ type: 'fetch_machine', can_step: maxCraftable > 0, data: { class_id: m, count: 1 } });
      }
    }
    seq.push({
      type: 'use_machine',
      can_step: maxCraftable > 0,
      data: {
        class_id: [spec.class_tsid],
        count: [maxCraftable],
        machine: spec.machine.class_tsid,
        energy_cost: spec.energy_cost || 0,
        fuel_cost: spec.fuel_cost || 0,
        recipe_id: spec.recipe_id || null,
        duration: spec.machine.wait_ms * CRAFTYBOT.TIME_MULTIPLIER,
        ingredient_class: ingredientClass,
        ingredient_count: ingredientCount,
      },
    });
  }
  return maxCraftable + sourceCount;
}

/**
 * craftytasking_build_sequence(crafty_bot, spec, count, holder): the job's
 * step list for `count` of spec, against what the source holds now.
 */
export function buildSequence(world, spec, count, holder = {}) {
  const shopping = {};
  const sourceList = {};
  const seq = [];
  const cls = spec.class_tsid;
  const ingredients = {};
  const missingIngredients = {};
  const tools = {};
  const missingTools = {};
  let element = null;
  const external = {};
  const forSingle = {};
  const req = spec.required_ingredients || {};
  if (req.element_green || req.element_red || req.element_blue || req.element_shiny) {
    const required = {};
    for (const [k, v] of Object.entries(req)) {
      if (ELEMENT_SET.has(k)) {
        required[k] = v * count;
        forSingle[k] = v;
      }
    }
    element = elementSpec(world, required);
    for (const row of element.ingredients) shopping[row.class_tsid] = (shopping[row.class_tsid] || 0) + row.count * count;
    for (const [k, v] of Object.entries(element.required_ingredients)) shopping[k] = (shopping[k] || 0) + v;
  }
  shoppingListStep(world, spec, count, true, shopping, holder);
  for (const [k, need] of Object.entries(shopping)) {
    let have = world.count(k);
    if (holder[k]) have += holder[k].count;
    seq.push({ type: 'fetch_ingredient', can_step: false, data: { class_id: k, count: need, source_count: have } });
    sourceList[k] = have;
  }
  for (const [k, need] of Object.entries(shopping)) {
    if (sourceList[k] < need) missingIngredients[k] = (missingIngredients[k] || 0) + (need - sourceList[k]);
    if (sourceList[k] > 0) ingredients[k] = (ingredients[k] || 0) + sourceList[k];
  }
  if (element) {
    let toolCount = 0;
    for (const t of CRAFTYBOT.ELEMENT_TOOL.split('|')) {
      // The source passes {element_tool_wear: ...}, a key ingredientSourceCountItem never reads,
      // so any grinder counts whatever its wear.
      toolCount = world.count(t);
      if (toolCount > 0) break;
    }
    if (element.ingredients.length > 0) {
      seq.push({ type: 'fetch_tool', can_step: toolCount > 0, data: { class_id: CRAFTYBOT.ELEMENT_TOOL, count: 1, source_count: toolCount } });
    }
    for (const row of element.ingredients) {
      const els = [];
      const counts = [];
      const add = (key, el) => {
        if (row[key] > 0) {
          els.push(el);
          // The source pushes row[key] * row.count, but row[key] is already the total for
          // row.count rocks, so n rocks would make n times the elements; the remake keeps
          // the grinder's own yield (ore_grinder: beryl 20 red / 4 blue / 2 green a rock).
          counts.push(row[key]);
          external[el] = (external[el] || 0) + row[key];
        }
      };
      add('sparkly_elements', 'element_shiny');
      add('red_elements', 'element_red');
      add('blue_elements', 'element_blue');
      add('green_elements', 'element_green');
      seq.push({
        type: 'craft',
        can_step: toolCount > 0,
        data: {
          class_id: els,
          count: counts,
          tool: CRAFTYBOT.ELEMENT_TOOL,
          energy_cost: 0,
          fuel_cost: 1,
          duration: row.wait_ms * CRAFTYBOT.TIME_MULTIPLIER,
          tool_verb: 'crush',
          ingredient_class: [row.class_tsid],
          ingredient_count: [row.count],
        },
      });
    }
    for (const row of element.ingredients) {
      for (const step of seq) {
        if (step.type === 'fetch_ingredient' && step.data.class_id === row.class_tsid) {
          sourceList[row.class_tsid] -= row.count;
          step.data.count = row.count;
          step.can_step = step.data.source_count >= step.data.count;
        }
      }
    }
  }
  sequenceStep(world, spec, count, true, seq, sourceList, external, holder);
  const last = seq[seq.length - 1];
  let craftCount;
  if (last?.data && String(last.data.class_id) === cls) craftCount = last.data.count[0];
  const meta = { energy_cost: 0, fuel_cost: 0, duration: 0 };
  for (const step of seq) {
    if (step.type === 'fetch_tool') {
      if (!step.data.source_count || step.data.count > step.data.source_count) {
        missingTools[step.data.class_id] = (missingTools[step.data.class_id] || 0) + step.data.count;
      } else {
        tools[step.data.class_id] = (tools[step.data.class_id] || 0) + step.data.count;
      }
    } else if (step.type === 'craft') {
      meta.energy_cost += step.data.energy_cost;
      meta.fuel_cost += step.data.fuel_cost;
      meta.duration += step.data.duration;
    }
  }
  seq.push({
    type: 'craft_complete',
    can_step: true,
    data: {
      class_id: cls,
      count: craftCount,
      ingredients,
      missing_ingredients: missingIngredients,
      tools,
      missing_tools: missingTools,
      energy_cost: meta.energy_cost,
      fuel_cost: meta.fuel_cost,
      duration: meta.duration,
    },
  });
  return seq;
}

/** craftybot_cost: what the job panel shows for a not-yet-queued item ("To make this I'll need to..."). */
export function costCheck(world, cls, count = 1) {
  const spec = craftybotSpec(cls);
  if (!spec) return null;
  const seq = buildSequence(world, spec, count, {});
  const components = [];
  let fuelCost = -1;
  for (const step of seq) {
    if (step.type === 'fetch_ingredient' || step.type === 'fetch_tool') {
      const missing = Math.max(0, step.data.count - (step.data.source_count || 0));
      components.push({
        type: 'fetch',
        item_classes: [step.data.class_id],
        counts: [step.data.count],
        counts_missing: [missing],
        status_txt: '',
        can_start: true,
        status: missing > 0 ? 'missing' : 'pending',
      });
    } else if (step.type === 'craft') {
      components.push({
        type: 'craft',
        item_classes: step.data.class_id,
        counts: step.data.count,
        counts_missing: [0],
        tool_class: step.data.tool,
        status_txt: '',
        can_start: true,
        status: 'pending',
      });
    } else if (step.type === 'craft_complete') {
      fuelCost = step.data.fuel_cost;
    }
  }
  return { item_class: cls, count, fuel_cost: fuelCost, crystal_cost: -1, components };
}

/* ------------------------------------------------------------------ */
/* npc_crafty_bot.js: queue                                             */
/* ------------------------------------------------------------------ */

function sequenceStatus(seq) {
  const last = seq[seq.length - 1];
  return last?.data && last.data.count > 0 ? 'craftable' : 'not-craftable';
}

function applyLast(row) {
  const last = row.seq[row.seq.length - 1]?.data || {};
  row.ingredients = last.ingredients || {};
  row.missing_ingredients = last.missing_ingredients || {};
  row.tools = last.tools || {};
  row.missing_tools = last.missing_tools || {};
  row.status = sequenceStatus(row.seq);
}

/** craftSequenceRebuild: skipped while a step is running (any truthy active_sequence_index). */
export function rebuildSequence(bot, world, qi) {
  const row = bot.queue[qi];
  if (!row) return;
  if (row.activeSeq) return;
  const holder = row.holder?.general || {};
  if (row.count - row.crafted > 0) {
    const spec = craftybotSpec(row.item);
    if (spec) row.seq = buildSequence(world, spec, row.count - row.crafted, holder);
  }
  if (row.seq.length) applyLast(row);
}

export function rebuildAll(bot, world) {
  for (let i = 0; i < bot.queue.length; i += 1) rebuildSequence(bot, world, i);
}

export function isCrafting(bot) {
  const row = bot.active != null ? bot.queue[bot.active] : null;
  return Boolean(row && !row.paused && !row.locked && !row.halted && row.activeSeq != null && bot.crafting);
}

function isComplete(bot, qi) {
  const row = bot.queue[qi];
  return Boolean(row) && row.crafted >= row.count;
}

/** queueAdd: grows an existing job or appends a new one; null when the queue is full, -1 for no spec. */
export function queueAdd(bot, world, cls, count) {
  count = Math.min(int(count), queueSizeMax(bot) - queueSize(bot));
  if (count <= 0) return null;
  const at = bot.queue.findIndex((row) => row.item === cls);
  if (at >= 0) {
    bot.queue[at].count += count;
    rebuildAll(bot, world);
    return at;
  }
  const spec = craftybotSpec(cls);
  if (!spec || !spec.ingredients) return -1;
  const seq = buildSequence(world, spec, count, {});
  const row = {
    item: cls,
    count,
    crafted: 0,
    paused: false,
    locked: false,
    halted: false,
    iterator: null,
    holder: {},
    seq,
    activeSeq: undefined,
  };
  applyLast(row);
  bot.queue.push(row);
  queueSetActive(bot, world, bot.queue.length - 1);
  return bot.queue.length - 1;
}

/** craftybot_add: the client sends the desired total for the job. */
export function setJobTotal(bot, world, cls, total) {
  const current = bot.queue.find((row) => row.item === cls)?.count || 0;
  const dif = int(total) - current;
  if (dif > 0) {
    const at = queueAdd(bot, world, cls, dif);
    // Remake: growing a job that already exists rescans the queue at once
    // (queueAdd only rescans for a new job; the source waited for a Kick).
    if (current > 0 && at != null && at >= 0) queueSetActive(bot, world, at);
    return at;
  }
  if (dif < 0) return queueRemove(bot, world, cls, Math.abs(dif));
  return bot.queue.findIndex((row) => row.item === cls);
}

/** queueRemove: shrinks or drops the job, cancelling it first when it is the active one. */
export function queueRemove(bot, world, cls, count) {
  let left = 0;
  for (let i = 0; i < bot.queue.length; i += 1) {
    const row = bot.queue[i];
    if (row.item !== cls) continue;
    if (bot.active === i) craftCancel(bot, world, false);
    row.count -= count;
    if (row.count <= 0) {
      bot.queue.splice(i, 1);
      if (bot.active === i) bot.active = 0;
      else if (bot.active > i) {
        bot.active -= 1;
        if (bot.active < 0) bot.active = undefined;
      }
      i -= 1;
    } else {
      left = row.count;
    }
  }
  if (!bot.queue.length) bot.active = undefined;
  rebuildAll(bot, world);
  return left;
}

/** craftybot_remove: Collect hands over the finished items, then shrinks the job by that many. */
export function collectJob(bot, world, cls, count) {
  let given = 0;
  for (let i = 0; i < bot.queue.length; i += 1) {
    const row = bot.queue[i];
    if (row.item !== cls) continue;
    const n = unhold(bot, i, cls, count, 'complete');
    if (n > 0) {
      world.give(cls, n);
      row.crafted -= n;
      given += n;
    }
  }
  queueRemove(bot, world, cls, count);
  return given;
}

export function queueSetActive(bot, world, index, force = false) {
  if (isCrafting(bot) && force) craftCancel(bot, world, false);
  // queue_iterator = getTime(): any fresh value works; a counter stays unique within one clock tick.
  bot.iterator = (Number(bot.iterator) || 0) + 1;
  if (!isCrafting(bot)) {
    bot.active = index;
    queueExecute(bot, world);
  }
}

function queueExecute(bot, world) {
  if (!bot.queue.length) return false;
  if (bot.active == null) return false;
  if (bot.active >= bot.queue.length) bot.active = 0;
  const row = bot.queue[bot.active];
  if (!row) return false;
  if (bot.refuelling) return false;
  if (row.paused || row.locked || row.halted) return false;
  if (row.iterator === bot.iterator) return false;
  row.iterator = bot.iterator;
  return craftItemFromQueue(bot, world, bot.active);
}

function queueIterate(bot, world) {
  if (!bot.queue.length) return false;
  bot.active = (bot.active ?? -1) + 1;
  if (bot.active >= bot.queue.length) bot.active = 0;
  return queueExecute(bot, world);
}

function craftItemFromQueue(bot, world, qi) {
  if (qi == null || qi >= bot.queue.length) return false;
  if (isComplete(bot, qi)) return false;
  bot.crafting = false;
  bot.queue[bot.active].activeSeq = 0;
  craftStep(bot, world, 0);
  return true;
}

export function setPaused(bot, world, cls, paused) {
  const qi = bot.queue.findIndex((row) => row.item === cls);
  if (qi < 0) return false;
  bot.queue[qi].paused = Boolean(paused);
  if (!paused && bot.active === qi) craftStep(bot, world, bot.queue[qi].activeSeq);
  return true;
}

export function setLocked(bot, cls, locked) {
  const row = bot.queue.find((r) => r.item === cls);
  if (!row) return false;
  row.locked = Boolean(locked);
  return true;
}

/** verbs.kick: clear every halt, pause and lock, then rescan from the top. */
export function kick(bot, world) {
  for (const row of bot.queue) {
    row.halted = false;
    row.paused = false;
    row.locked = false;
  }
  bot.stats.kicks += 1;
  world.sound?.('CRAFTYBOT_KICK');
  queueSetActive(bot, world, 0);
}

/* ------------------------------------------------------------------ */
/* Fuel and crystals                                                    */
/* ------------------------------------------------------------------ */

export function refuelCheck(bot, cellsHave) {
  if (bot.fuel >= CRAFTYBOT.MAX_FUEL) return { ok: false, msg: CRAFTYBOT_COPY.fuelFull };
  if (cellsHave < 1) return { ok: false, msg: CRAFTYBOT_COPY.noFuelCells };
  return { ok: true };
}

/** verbs.refuel: 500 a Fuel Cell, capped; un-halts every job and resumes. */
export function refuelFromCells(bot, world, cells = 1) {
  bot.fuel = Math.min(CRAFTYBOT.MAX_FUEL, bot.fuel + Math.max(0, int(cells)) * CRAFTYBOT.FUEL_PER_CELL);
  for (const row of bot.queue) row.halted = false;
  craftResume(bot, world);
  return bot.fuel;
}

export function installCrystalCheck(bot, crystalsHave) {
  if (bot.crystals >= bot.slots) return { ok: false, msg: CRAFTYBOT_COPY.crystalsFull };
  if (crystalsHave < 1) return { ok: false, msg: CRAFTYBOT_COPY.noCrystals };
  return { ok: true };
}

export function installCrystal(bot) {
  if (bot.crystals >= bot.slots) return false;
  bot.crystals += 1;
  return true;
}

/** canAutoRefuel: a Fuel Cell lying in the location and room in the tank. */
export function canAutoRefuel(bot, world) {
  return bot.fuel < CRAFTYBOT.MAX_FUEL && world.inLocation && Boolean(world.fuelCell?.());
}

/** craftybot_refuel (the panel's Fuel - Add More): walk to a Fuel Cell in the location. */
export function autoRefuel(bot, world) {
  if (!canAutoRefuel(bot, world)) return false;
  bot.refuelling = true;
  const cell = world.fuelCell();
  bot.moveTarget = cell.id;
  startWalk(bot, world, cell.x, CRAFTYBOT.FETCH_REACH);
  return true;
}

/* ------------------------------------------------------------------ */
/* Steps (craftStep and the state machine)                              */
/* ------------------------------------------------------------------ */

function activeRow(bot) {
  return bot.active != null ? bot.queue[bot.active] : null;
}

function craftResume(bot, world) {
  if (isCrafting(bot)) return;
  const row = activeRow(bot);
  if (row) craftStep(bot, world, row.activeSeq);
}

function craftStepIterate(bot) {
  const row = activeRow(bot);
  setTimer(bot, 'craftStep', 300, (row?.activeSeq ?? 0) + 1);
}

function canFetch(world, cls, toolWear) {
  return Boolean(world.find(cls, { toolWear }));
}

function canCraftStep(bot, step) {
  for (let i = 0; i < step.data.ingredient_class.length; i += 1) {
    if (holding(bot, bot.active, step.data.ingredient_class[i]) < step.data.ingredient_count[i]) return false;
  }
  if (step.data.tool) {
    if (!step.data.tool.split('|').some((t) => holding(bot, bot.active, t) > 0)) return false;
  }
  return true;
}

export function craftStep(bot, world, index) {
  const row = activeRow(bot);
  if (!row || !row.seq) return false;
  if (row.paused || row.locked || row.halted) return false;
  const step = row.seq[index];
  if (!step) return false;
  row.activeSeq = index;
  if (!step.can_step) {
    setTimer(bot, 'craftStep', 10, index + 1);
    return false;
  }
  bot.crafting = true;
  if (step.data?.fuel_cost && step.type !== 'craft_complete') {
    if (bot.fuel < step.data.fuel_cost) {
      world.prompt?.(CRAFTYBOT_COPY.outOfFuel);
      row.halted = true;
      // The source leaves is_crafting set here, so refuel's craftResume (and a Kick's
      // queueSetActive) see a running job and never step again; clearing it lets a
      // Fuel Cell resume the halted step as the verb intends.
      bot.crafting = false;
      setTimer(bot, 'queueIterate', 10);
      return false;
    }
    bot.fuel -= step.data.fuel_cost;
    bot.stats.fuelUsed += step.data.fuel_cost;
  }
  if (step.data?.tool || step.data?.machine) bot.craftingTool = String(step.data.tool || step.data.machine).split('|')[0];
  switch (step.type) {
    case 'fetch_tool':
    case 'fetch_ingredient':
      if (holding(bot, bot.active, step.data.class_id) < step.data.count) {
        if (canFetch(world, step.data.class_id, step.data.tool_wear)) {
          bot.walkTarget = 'craft';
          setState(bot, world, 'fetch');
        } else craftStepIterate(bot);
      } else craftStepIterate(bot);
      return true;
    case 'fetch_machine':
      if (canFetch(world, step.data.class_id)) {
        bot.walkTarget = 'machine';
        setState(bot, world, 'fetch');
      } else craftStepIterate(bot);
      return true;
    case 'use_machine':
      setState(bot, world, 'use_machine');
      return true;
    case 'craft':
      if (canCraftStep(bot, step)) setState(bot, world, 'craft');
      else craftStepIterate(bot);
      return true;
    case 'craft_complete':
      setState(bot, world, 'craft_complete');
      return true;
    default:
      return false;
  }
}

function setAnim(bot, anim) {
  bot.anim = anim;
  bot.animAt = bot.clock;
}

function stopMoving(bot) {
  if (bot.move) {
    bot.x = moveX(bot, bot.clock);
    bot.move = null;
  }
}

/** The bot's x at time t (it walks in a straight line at WALK_SPEED). */
export function moveX(bot, t) {
  const m = bot.move;
  if (!m) return bot.x;
  if (t >= m.endAt || m.endAt <= m.startAt) return m.toX;
  if (t <= m.startAt) return m.fromX;
  return m.fromX + (m.toX - m.fromX) * ((t - m.startAt) / (m.endAt - m.startAt));
}

function startWalk(bot, world, x, reach) {
  if (!world.inLocation || Math.abs(x - bot.x) <= reach) {
    onDonePathing(bot, world);
    return;
  }
  const ms = (Math.abs(x - bot.x) / (CRAFTYBOT.WALK_SPEED / CRAFTYBOT.TIME_MULTIPLIER)) * 1000;
  bot.move = { fromX: bot.x, toX: x, startAt: bot.clock, endAt: bot.clock + ms };
  bot.dir = x < bot.x ? 'left' : 'right';
  if (bot.craftState !== 'fetch') setState(bot, world, 'walk');
  setAnim(bot, 'walk');
  setTimer(bot, 'arrive', ms);
}

/** collapse/expand: the cube folds (3.4 s) or unfolds (2.6 s) and re-calls setState. */
function collapse(bot, world, state) {
  if (bot.collapsed) return false;
  bot.collapsed = true;
  setAnim(bot, 'collapse');
  world.sound?.('CRAFTYBOT_COLLAPSE');
  setTimer(bot, 'setState', CRAFTYBOT.COLLAPSE_MS, state);
  return true;
}

function expand(bot, world, state) {
  if (!bot.collapsed) return false;
  bot.collapsed = false;
  setAnim(bot, 'expand');
  world.sound?.('CRAFTYBOT_EXPAND');
  setTimer(bot, 'setState', CRAFTYBOT.EXPAND_MS, state);
  return true;
}

export function setState(bot, world, state) {
  if (world.inLocation) {
    world.stopSound?.('CRAFTYBOT_CRAFT_START');
    world.stopSound?.('CRAFTYBOT_WALK');
    if (bot.craftState === 'craft' && state !== 'craft') {
      world.sound?.('CRAFTYBOT_CRAFT_END');
      setAnim(bot, 'craftEnd');
      bot.craftState = state;
      setTimer(bot, 'setState', CRAFTYBOT.CRAFT_END_MS, state);
      return;
    }
    if (state !== 'walk') {
      cancelTimer(bot, 'setState');
      if (bot.move && state !== 'fetch') {
        stopMoving(bot);
        cancelTimer(bot, 'arrive');
      }
    }
    bot.craftState = state;
    let anim = null;
    let sound = null;
    let needsCollapse = false;
    let needsExpand = false;
    if (state === 'idle') {
      anim = 'idle0';
      needsExpand = true;
    } else if (state === 'fetch' || state === 'walk') {
      anim = 'walk';
      needsExpand = true;
      sound = 'CRAFTYBOT_WALK';
    } else if (state === 'craft') {
      anim = 'craft';
      sound = 'CRAFTYBOT_CRAFT_START';
      needsCollapse = true;
    } else if (state === 'craft_complete') {
      needsExpand = true;
    } else if (state === 'sleep') {
      anim = 'sleepMode';
      needsCollapse = true;
    }
    if (needsCollapse && collapse(bot, world, state)) return;
    if (needsExpand && expand(bot, world, state)) return;
    if (anim) {
      if (sound) world.sound?.(sound);
      if (anim !== 'walk' || !bot.move) setAnim(bot, anim === 'walk' ? 'idle0' : anim);
      if (anim === 'walk' && bot.move) setAnim(bot, 'walk');
    }
  } else {
    bot.craftState = state;
    setAnim(bot, state === 'craft' ? 'iconic_craft' : 'iconic');
  }
  setStateComplete(bot, world);
}

function setStateComplete(bot, world) {
  const row = activeRow(bot);
  const i = row?.activeSeq;
  switch (bot.craftState) {
    case 'idle':
      setTimer(bot, 'setState', CRAFTYBOT.IDLE_TO_SLEEP_MS, 'sleep');
      break;
    case 'fetch':
      if (bot.walkTarget === 'craft') doFetch(bot, world, i);
      else if (bot.walkTarget === 'machine') doFetchMachine(bot, world, i);
      break;
    case 'use_machine':
      doUseMachine(bot, world, i);
      break;
    case 'craft':
      doCraft(bot, world, i);
      break;
    case 'craft_complete':
      doCraftComplete(bot, world, i);
      break;
    default:
      break;
  }
}

function overlay(world, step) {
  // craftGetComment: an icon of what the bot is fetching or making, 2.5 s over its head.
  if (!step || !world.overlay) return;
  const cls = Array.isArray(step.data.class_id) ? step.data.class_id[0] : step.data.class_id;
  if (cls) world.overlay(String(cls).split('|')[0]);
}

function previousIsCraft(row, i) {
  return i > 0 && row.seq[i - 1]?.type === 'craft';
}

function doFetch(bot, world, i) {
  const row = activeRow(bot);
  if (i == null || !row) return;
  const step = row.seq[i];
  if (!step) return;
  if (!previousIsCraft(row, i)) overlay(world, step);
  if (!world.inLocation) {
    const item = world.find(step.data.class_id, { toolWear: step.data.tool_wear });
    if (!item) {
      setTimer(bot, 'craftStep', 1000, i + 1);
      return;
    }
    if (step.type === 'fetch_ingredient') {
      const picked = pickupStack(bot, world, item.id, step.data.class_id, step.data.count);
      if (picked === 0) return;
      if (picked < step.data.count) setTimer(bot, 'craftStep', 300, i);
      else setTimer(bot, 'craftStep', 1000, i + 1);
    } else {
      hold(bot, bot.active, item.cls || step.data.class_id, 1, 'general', item.id);
      setTimer(bot, 'craftStep', 1000, i + 1);
    }
    return;
  }
  if (holding(bot, bot.active, step.data.class_id) >= step.data.count) {
    setTimer(bot, 'craftStep', 1000, i + 1);
    return;
  }
  const item = world.find(step.data.class_id, { toolWear: step.data.tool_wear });
  if (!item) {
    setTimer(bot, 'craftStep', 1000, i + 1);
    return;
  }
  bot.moveTarget = item.id;
  bot.moveClass = item.cls || step.data.class_id;
  startWalk(bot, world, item.x, CRAFTYBOT.FETCH_REACH);
}

function doFetchMachine(bot, world, i) {
  const row = activeRow(bot);
  if (i == null || !row) return;
  if (!world.inLocation) {
    sendCraftyMessage(world, CRAFTYBOT_COPY.noMachinesInPack, 5000);
    craftCancel(bot, world, true);
    return;
  }
  const step = row.seq[i];
  const machine = world.find(step.data.class_id);
  if (!machine) return;
  bot.moveTarget = machine.id;
  startWalk(bot, world, machine.x, CRAFTYBOT.MACHINE_REACH);
}

function doUseMachine(bot, world, i) {
  const row = activeRow(bot);
  if (i == null || !row) return;
  setState(bot, world, 'idle');
  const step = row.seq[i];
  // machine_base craftytaskingStart reads the retired crafting_holder, so in the
  // shipped server a machine step never produced its output; the remake keeps that.
  setTimer(bot, 'craftStep', step?.data?.duration || 0, i + 1);
}

function wearTool(bot, world, wear, toolCls) {
  if (!wear) return;
  const h = bot.queue[bot.active]?.holder?.general?.[toolCls];
  if (!h || !h.tsid) return;
  const res = world.wear(toolCls, wear);
  if (res?.broke) {
    world.sound?.('TOOL_BREAKS');
    world.say?.(CRAFTYBOT_COPY.brokeTool);
  }
}

function doCraft(bot, world, i) {
  const row = activeRow(bot);
  if (i == null || !row) return;
  const step = row.seq[i];
  if (!step) return;
  if (!previousIsCraft(row, i)) overlay(world, step);
  if (!canCraftStep(bot, step)) {
    setTimer(bot, 'craftStep', step.data.duration, i + 1);
    return;
  }
  for (let k = 0; k < step.data.ingredient_class.length; k += 1) {
    const cls = step.data.ingredient_class[k];
    if (holding(bot, bot.active, cls) >= step.data.ingredient_count[k]) unhold(bot, bot.active, cls, step.data.ingredient_count[k]);
  }
  if (world.inLocation) setAnim(bot, 'craft');
  wearTool(bot, world, step.data.tool_wear, step.data.tool);
  unhold(bot, bot.active, step.data.tool, 1);
  for (let k = 0; k < step.data.class_id.length; k += 1) hold(bot, bot.active, step.data.class_id[k], step.data.count[k]);
  setTimer(bot, 'craftStep', step.data.duration, i + 1);
}

function doCraftComplete(bot, world, i) {
  const row = activeRow(bot);
  if (i == null || !row) {
    craftDone(bot, world, true);
    return;
  }
  const step = row.seq[i];
  row.activeSeq = undefined;
  rebuildSequence(bot, world, bot.active);
  if (!step?.data) {
    craftDone(bot, world, true);
    return;
  }
  const cls = step.data.class_id;
  const count = holding(bot, bot.active, cls);
  if (count === 0) {
    craftDone(bot, world, true);
    return;
  }
  bot.crystalHp = Math.max(bot.crystalHp - count, 0);
  if (bot.crystalHp <= 0) {
    bot.crystals = Math.max(0, bot.crystals - 1);
    bot.crystalHp = CRAFTYBOT.CRYSTAL_HIT_POINTS;
    bot.stats.crystalsBurnt += 1;
    world.say?.(CRAFTYBOT_COPY.crystalBurnt);
  }
  unhold(bot, bot.active, cls, count);
  hold(bot, bot.active, cls, count, 'complete');
  row.crafted += count;
  bot.stats.crafted += count;
  world.crafted?.(cls, count);
  craftDone(bot, world, true);
}

function craftDone(bot, world, continueIteration) {
  bot.crafting = false;
  cancelTimer(bot, 'craftStep');
  bot.craftingTool = null;
  stopMoving(bot);
  cancelTimer(bot, 'arrive');
  bot.moveTarget = null;
  if (bot.active != null) rebuildSequence(bot, world, bot.active);
  if (!continueIteration || !queueIterate(bot, world)) setState(bot, world, 'idle');
}

/** craftDropItems: whatever it holds goes back on the floor (or into the pack); elements become iMG. */
function craftDropItems(bot, world) {
  const row = activeRow(bot);
  const general = row?.holder?.general;
  if (!general) return;
  for (const [cls, h] of Object.entries(general)) {
    if (h.tsid && Object.keys(h.tsid).length) continue; // a held tool stays where it was
    if (world.inLocation && ELEMENT_SET.has(cls)) {
      world.imagination?.(h.count / 20);
    } else {
      bot.dropped[cls] = h.count;
      world.drop(cls, h.count, bot.x);
    }
  }
  row.holder.general = {};
}

export function craftCancel(bot, world, continueIteration) {
  craftDropItems(bot, world);
  craftDone(bot, world, continueIteration);
}

function pickupStack(bot, world, id, cls, count) {
  if (!id) return 0;
  const required = count - holding(bot, bot.active, cls);
  if (required <= 0) return 0;
  const n = world.take(id, cls, required);
  if (n > 0) hold(bot, bot.active, cls, n);
  return n;
}

function onDonePathing(bot, world) {
  if (bot.refuelling) {
    bot.refuelling = false;
    setState(bot, world, 'idle');
    if (!bot.moveTarget) return false;
    if (world.take(bot.moveTarget, 'fuel_cell', 1) < 1) return false;
    bot.fuel = Math.min(bot.fuel + CRAFTYBOT.FUEL_PER_CELL, CRAFTYBOT.MAX_FUEL);
    for (const row of bot.queue) row.halted = false;
    queueIterate(bot, world);
    return true;
  }
  const row = activeRow(bot);
  if (row && row.activeSeq != null && (bot.walkTarget === 'craft' || bot.walkTarget === 'machine')) {
    let delay = 0;
    const step = row.seq[row.activeSeq];
    setState(bot, world, 'idle');
    if (step?.type === 'fetch_ingredient') {
      const picked = pickupStack(bot, world, bot.moveTarget, step.data.class_id, step.data.count);
      if (!picked) return false;
      if (picked < step.data.count) {
        setTimer(bot, 'craftStep', 0, row.activeSeq);
        return true;
      }
      delay = 1500;
    } else if (step?.type === 'fetch_tool') {
      hold(bot, bot.active, bot.moveClass || step.data.class_id, 1, 'general', bot.moveTarget);
    }
    setTimer(bot, 'craftStep', delay, row.activeSeq + 1);
    return true;
  }
  setState(bot, world, 'idle');
  return true;
}

function sendCraftyMessage(world, text, ms) {
  if (world.inLocation) world.say?.(text, ms);
  else world.prompt?.(text, CRAFTYBOT_COPY.promptTitle);
}

/* ------------------------------------------------------------------ */
/* Lifecycle hooks                                                      */
/* ------------------------------------------------------------------ */

/** Timers in fire order. */
function nextTimer(bot) {
  let best = null;
  for (const [name, t] of Object.entries(bot.timers)) {
    if (!best || t.at < best.t.at || (t.at === best.t.at && t.seq < best.t.seq)) best = { name, t };
  }
  return best;
}

function fire(bot, world, name, arg) {
  switch (name) {
    case 'craftStep':
      craftStep(bot, world, arg);
      break;
    case 'setState':
      setState(bot, world, arg);
      break;
    case 'queueIterate':
      queueIterate(bot, world);
      break;
    case 'arrive':
      bot.x = bot.move ? bot.move.toX : bot.x;
      bot.move = null;
      onDonePathing(bot, world);
      break;
    case 'rebuildAll':
      rebuildAll(bot, world);
      break;
    case 'rescan':
      queueSetActive(bot, world, 0, false);
      break;
    default:
      break;
  }
}

/**
 * Run every timer due by `now`, in order, each at its own time (offline
 * catch-up runs the same steps the bot would have run live).
 */
export function advanceCraftybot(bot, now, world, { maxSteps = 5000 } = {}) {
  let steps = 0;
  for (;;) {
    const next = nextTimer(bot);
    if (!next || next.t.at > now) break;
    if (steps >= maxSteps) break;
    steps += 1;
    delete bot.timers[next.name];
    bot.clock = Math.max(bot.clock, next.t.at);
    fire(bot, world, next.name, next.t.arg);
  }
  bot.clock = Math.max(bot.clock, now);
  if (bot.move) bot.xNow = moveX(bot, now);
  else bot.xNow = bot.x;
  return steps;
}

/** onContainerItemAdded: something new in the source, so rebuild in 2 s and rescan in 3 s. */
export function noticeSourceChange(bot) {
  setTimer(bot, 'rebuildAll', CRAFTYBOT.REBUILD_AFTER_ADD_MS);
  setTimer(bot, 'rescan', CRAFTYBOT.RESCAN_AFTER_ADD_MS);
}

/** onPickup / onDrop: idle, rebuild against the new source, rescan from the top. */
export function onMoved(bot, world) {
  // A walk in progress has no path in the new place; run that step again.
  const row = activeRow(bot);
  if (bot.move || bot.timers.arrive) {
    stopMoving(bot);
    cancelTimer(bot, 'arrive');
    if (row && row.activeSeq != null) setTimer(bot, 'craftStep', 300, row.activeSeq);
  }
  bot.collapsed = false;
  setState(bot, world, 'idle');
  rebuildAll(bot, world);
  queueSetActive(bot, world, 0);
}

/** onPlayerCollision while asleep: peek (once every 10 s), then back to sleep in 5 s. */
export function peek(bot, world) {
  if (!world.inLocation || bot.craftState !== 'sleep') return false;
  if (bot.lastPeek && bot.clock - bot.lastPeek <= CRAFTYBOT.PEEK_GAP_MS) return false;
  world.sound?.('CRAFTYBOT_PEEK');
  setAnim(bot, 'peek');
  bot.lastPeek = bot.clock;
  setTimer(bot, 'setState', CRAFTYBOT.PEEK_MS, 'sleep');
  return true;
}

/** onCreate: idle after 1 s. */
export function createBot(bot, x, where, now) {
  bot.owned = true;
  bot.where = where;
  bot.x = x;
  bot.clock = now;
  bot.fuel = CRAFTYBOT.START_FUEL;
  bot.crystals = CRAFTYBOT.START_CRYSTALS;
  bot.crystalHp = CRAFTYBOT.CRYSTAL_HIT_POINTS;
  bot.craftState = 'idle';
  setAnim(bot, 'idle0');
  setTimer(bot, 'setState', 1000, 'idle');
  return bot;
}

/* ------------------------------------------------------------------ */
/* clientUpdate: the job panel's view model                            */
/* ------------------------------------------------------------------ */

function queueIndexStatus(bot, qi) {
  const row = bot.queue[qi];
  let scan = 'scan_pending';
  if (isCrafting(bot) && bot.active === qi) scan = 'active';
  else if (row.iterator === bot.iterator) scan = 'scan_done';
  const last = row.seq[row.seq.length - 1];
  return {
    complete: isComplete(bot, qi),
    paused: row.paused,
    locked: row.locked,
    halted: row.halted,
    scan,
    craftable: last?.data?.count || 0,
    total: row.count,
    done: row.crafted,
  };
}

/**
 * clientUpdate: jobs with done/total, status (txt), and each fetch/craft
 * component with its own status ('complete' | 'pending' | 'missing' |
 * 'halted' | 'active') and the "You are missing ..." line.
 */
export function craftybotView(bot, labelFor = (cls, n) => cls) {
  const jobs = bot.queue.map((row, qi) => {
    const st = queueIndexStatus(bot, qi);
    let txt = 'Waiting';
    if (st.complete) txt = 'Complete';
    else if (st.halted) txt = 'Job Halted';
    else if (st.scan === 'active') txt = `Crafting ${st.craftable}/${st.total}`;
    else if (st.scan === 'scan_pending') txt = 'Pending';
    const missing = { ...(row.missing_ingredients || {}), ...(row.missing_tools || {}) };
    const components = [];
    row.seq.forEach((step, j) => {
      let type;
      let classes;
      let counts;
      let tool = '';
      let key;
      if (step.type === 'fetch_ingredient' || step.type === 'fetch_tool') {
        type = 'fetch';
        key = step.data.class_id;
        classes = [step.data.class_id];
        counts = [step.data.count];
      } else if (step.type === 'craft') {
        type = 'craft';
        key = step.data.class_id[0];
        classes = step.data.class_id;
        counts = step.data.count;
        tool = step.data.tool;
      } else return;
      const missingCount = missing[key] || 0;
      let status = 'pending';
      let text = '';
      let canStart = step.can_step;
      if (st.complete) {
        status = 'complete';
        canStart = true;
      } else if (step.can_step) {
        if (row.activeSeq === j && st.halted) {
          status = 'halted';
          text = CRAFTYBOT_COPY.haltedStep;
        } else if (missingCount > 0) {
          status = 'missing';
          text = `You are missing ${missingText(key, missingCount, labelFor)}`;
        } else if (bot.active === qi) {
          if (row.activeSeq > j) status = 'complete';
          else if (row.activeSeq === j) status = 'active';
        }
      } else if (missingCount > 0) {
        status = 'missing';
        text = `You are missing ${missingText(key, missingCount, labelFor)}`;
      }
      components.push({ type, item_classes: classes, counts, counts_missing: [missingCount], tool_class: tool, status, can_start: canStart, status_txt: text });
    });
    return {
      item_class: row.item,
      done: st.done,
      total: st.total,
      craftable_count: st.craftable,
      status: {
        is_complete: st.complete,
        is_active: !st.complete && st.scan === 'active',
        is_missing: false,
        is_paused: st.paused,
        is_locked: st.locked,
        is_halted: st.halted,
        txt: txt,
      },
      components,
    };
  });
  return {
    jobs,
    jobs_max: queueSizeMax(bot),
    jobs_count: queueSize(bot),
    crystal_count: bot.crystals,
    crystal_max: bot.slots,
    crystal_hp: bot.crystalHp,
    fuel_count: bot.fuel,
    fuel_max: CRAFTYBOT.MAX_FUEL,
  };
}

/** utils.get_string_list_from_class_tsid: "a Knife & Board", "some Cherries", "an X or Y". */
export function missingText(cls, count, labelFor) {
  let out = '';
  const items = String(cls).split('|');
  items.forEach((c, i) => {
    const meta = labelFor(c, count);
    if (i === 0) out += count === 1 ? (meta.article || 'a') : 'some';
    if (i > 0) out += ' or';
    out += ` ${count === 1 ? meta.single : meta.plural}`;
  });
  return out;
}

/** The status line under the active job (CraftyActiveElementUI): "Fetching 3 Cherries" / "Crafting ...". */
export function activeLine(job, labelFor) {
  if (job.status.is_complete) return 'Job Complete!';
  const c = job.components.find((x) => x.status === 'active');
  if (!c) return CRAFTYBOT_COPY.idleStatus;
  const parts = c.item_classes.map((cls, k) => {
    const n = c.counts[k];
    const first = String(cls).split('|')[0];
    const meta = labelFor(first, n);
    return n ? `${n} ${n !== 1 ? meta.plural : meta.single}` : meta.plural;
  });
  return `${c.type === 'fetch' ? 'Fetching' : 'Crafting'} ${parts.join(', ')}`;
}
