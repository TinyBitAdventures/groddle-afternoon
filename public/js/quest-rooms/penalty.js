/**
 * Smuggle the Smuggler I-III (quests/smuggle_the_smuggler_part1.js, _part2,
 * _part3) in the penalty cell.
 *
 * Source: part 1's onStarted needs a working Shovel or Ace of Spades ("You
 * need some sort of tool to help you out. You dig?"), then creates instance
 * `penalty` from template LUVGFS2RQI63N49 (dev "penaltyisland2",
 * LRO10390SI63T7N) at -1319,-123 with exit_delay 2*60: after two minutes the
 * "Are you stuck? Do you want to leave this place?" prompt
 * (players/inc_instances.js). Part 1 turns in at npc_rare_item_vendor, the
 * hooded figure who is the wrongfully imprisoned Smuggler ("They got you too?
 * I'm innocent, I tell you!"). Part 2: dig the patch ('VERB:'+patch+':'+dig,
 * a working shovel). Part 3 ("After you."): crawl through the hole; 500 iMG,
 * 500 currants, 50 mood, then instances_exit_familiar('penalty', "You're
 * free! ...").
 *
 * Lost: the template's geometry (neither TSID is in the locations dump) and
 * who first offered part 1 (no offer trigger survives; the remake's give
 * Smuggler offers it, features/smuggling-feature.js). The cell is rebuilt
 * from the penalty box's own recovered decos (penaltybox_* in
 * assets/decos/groddle: cave cell, roof, bars, mud floor, "you are here
 * because you are bad"), the vendor's OGA sheets and the patch_dark art the
 * patches feature already uses; digging runs through js/patches.js, so it
 * costs the dig_patch energy and tool wear and turns up earth.
 *
 * Little Poundcake's Snap of the cell (research/wayback/raw/snaps/penalty_box/,
 * reference only) shows what lies round it: a grassy ledge under the mud
 * floor's edge (penaltybox_base_grass) and a bark trunk behind the bars at the
 * right, its roots under the "knock it off!" sign (penaltybox_trunk), both
 * groddle1.swf decos; their placement is read off the Snap.
 */

import { createPlot, performPlotVerb, plotArtPath, plotVerbs, soilResponse } from '../patches.js?v=3996c344';
import { getQuestCatalog } from '../content-catalogs.js?v=10b118dd';
import { onLoaded, textureFromUrl } from '../textures.js?v=db2ce452';
import { ensureItem } from '../inventory.js?v=85d4faba';

export const PART_1 = 'smuggle_the_smuggler_part1';
export const PART_2 = 'smuggle_the_smuggler_part2';
export const PART_3 = 'smuggle_the_smuggler_part3';
/** source: part1 onStarted tools; patch.js dig needs either, working. */
export const TOOLS = Object.freeze(['shovel', 'ace_of_spades']);
/** source: exit_delay 2*60 -> instances_show_exit_prompt. */
export const EXIT_PROMPT_MS = 2 * 60 * 1000;
export const EXIT_PROMPT = 'Are you stuck? Do you want to leave this place?';
export const NEED_TOOL = 'You need some sort of tool to help you out. You dig?';
/** source: smuggle_the_smuggler_part3.js onComplete_custom. */
export const FREE_TEXT = "You're free! And as a reward, your friend left something for you somewhere. You remember the name of the town don't you? Nevermind, just take it.";
/** source: part2 requirement r376 (counter, num 1, shovel). */
export const DIG_COUNTER = "'VERB:'+patch+':'+dig";

const ART = 'assets/sprites/quest-rooms/penalty/';
export const W = 1400;
export const H = 900;
export const FLOOR = 740;
export const SPAWN = Object.freeze({ x: 1060, y: FLOOR });
export const PATCH_X = 250;
/** npc_rare_item_vendor pace_distance 400 around its spot. */
export const PACE = Object.freeze({ x1: 520, x2: 920, speed: 40 });
/** Bars close the cell on the right; the cave wall on the left. */
export const BARS_X = 1290;
/** The trunk's centre (the Snap: right of the "knock it off!" sign at 1210, behind the bars). */
export const TRUNK_X = 1330;
/** The grassy ledge's top under the floor line: its grass shows below the mud floor's edge. */
export const GRASS_TOP = 62;
const VENDOR = { cell: { w: 187, h: 91 }, anchor: { x: 153 / 187, y: 90 / 91 } };

/**
 * npc_rare_item_vendor.js verbs.buy ("Buy extremely rare items", store_id 25, no
 * conditions): store 25 "Extremely Rare Items Vendor" in catalog_stores.js
 * 1603-1631, buy_multiplier 0 (he buys nothing back). `stock` is each row's
 * total_quantity when the servers stopped (a shared, world-wide count; one
 * player cannot plausibly empty it, so it is not counted down here). The
 * Million Currant Trophy row had total_quantity 0, sold out, and is left off.
 */
export const RARE_STORE = Object.freeze({
  storeId: 25,
  label: 'Extremely Rare Items Vendor',
  desc: 'This vendor... shhhh!... sells items that are extremely rare!',
  buyMultiplier: 0,
  offers: Object.freeze([
    Object.freeze({ classTsid: 'antique_spigot', cost: 250000, stock: 331 }),
    Object.freeze({ classTsid: 'rube_potato', cost: 500000, stock: 247 }),
    Object.freeze({ classTsid: 'npc_cubimal_factorydefect_chick', cost: 1500000, stock: 171 }),
    Object.freeze({ classTsid: 'limited_edition_imitation_grichmas_yeti', cost: 3000000, stock: 99 }),
  ]),
});

/** items/<class>.js label, name_plural, description, base_cost (stackmax 1 for all four). */
export const RARE_ITEMS = Object.freeze({
  antique_spigot: Object.freeze({ label: 'Antique Spigot', namePlural: 'Antique Spigots', desc: 'Water once flowed freely through this residual, rusting spigot. Old water, from times long by. Surely, you must have it!', baseCost: 251000 }),
  rube_potato: Object.freeze({ label: 'Rube Shaped Potato', namePlural: 'Rube Shaped Potato', desc: "A spud that's a dud, with the self-evolved claim to resemble a rubbed-on Rube. Miraculous! Fries not included.", baseCost: 503000 }),
  npc_cubimal_factorydefect_chick: Object.freeze({ label: 'Factory Defect Chick Cubimal', namePlural: 'Factory Defect Chick Cubimals', desc: 'This Factory Defect Chick Cubimal was hand-picked straight out of the garbage bin by an assembly line worker.', baseCost: 1511000 }),
  limited_edition_imitation_grichmas_yeti: Object.freeze({ label: 'Highest Quality #1 "Imported" Glitchmas Yeti', namePlural: 'Highest Quality #1 "Imported" Glitchmas Yetis', desc: 'A genuine, imitation Glitchmas Yeti. It is qualities without peer and it is always ensuring you are satisfy.', baseCost: 3001000 }),
});

/** The chick's art (OGA npc_cubimal_factorydefect_chick__x1_1) is not one of the 43 series figures in icons/. */
export const RARE_ICONS = Object.freeze({
  npc_cubimal_factorydefect_chick: 'assets/sprites/quest-rooms/penalty/npc_cubimal_factorydefect_chick.png',
});

export function ensureRareItems() {
  for (const [id, meta] of Object.entries(RARE_ITEMS)) ensureItem(id, { ...meta, stackMax: 1, ...(RARE_ICONS[id] ? { icon: RARE_ICONS[id] } : {}) });
}

/** Store 25 as a profile for engine.openShop. */
export function rareStoreProfile() {
  return {
    key: 'rare_items',
    id: 'npc_rare_item_vendor',
    storeId: RARE_STORE.storeId,
    label: RARE_STORE.label,
    desc: RARE_STORE.desc,
    badge: 'R',
    color: 0x6b4f8a,
    buyMultiplier: RARE_STORE.buyMultiplier,
    offers: RARE_STORE.offers.map((o) => ({ classTsid: o.classTsid, label: RARE_ITEMS[o.classTsid].label, buyPrice: o.cost, sellPrice: 0 })),
  };
}
const VENDOR_CLIPS = { idle: [5, 109], talk: [5, 72], walk: [4, 16] }; // G276: idle's 110th cell is blank

const questName = (id) => getQuestCatalog()?.[id]?.title || id;

/** The cell floor and its invisible end stops. */
export function cellPlatforms(kit) {
  return [kit.plat(0, FLOOR, W, FLOOR, 'invisible', { id: 'pen_floor' })];
}

/** Which beat the cell is on, from the three quests' states. */
export function cellStep(q) {
  if (q.part1Active) return 'talk';
  if (q.part3Active) return 'crawl';
  if (q.part2Active) return q.dug ? 'turn_in' : 'dig';
  if (q.part2Done && !q.part3Done) return 'offer3';
  if (!q.part2Done) return 'offer2';
  return 'free';
}

export function hasWorkingTool(inv, toolState, canUse) {
  return TOOLS.some((cls) => (Number(inv?.[cls]) || 0) > 0 && (!canUse || canUse(toolState, cls)));
}

function questState(ctx) {
  const qs = ctx.engine.questState || {};
  const done = (id) => (qs.completed || []).includes(id);
  return {
    part1Active: ctx.quest(PART_1).active(),
    part2Active: ctx.quest(PART_2).active(),
    part3Active: ctx.quest(PART_3).active(),
    part2Done: done(PART_2),
    part3Done: done(PART_3),
    dug: ctx.data.plot?.stage === 'dug',
  };
}

function vendorFrames(ctx, clip) {
  ctx.data.vendorSheets ||= {};
  if (!ctx.data.vendorSheets[clip]) {
    const [cols, count] = VENDOR_CLIPS[clip];
    const rows = Math.ceil(count / cols);
    ctx.data.vendorSheets[clip] = ctx.kit.sheetFrames(ctx.PIXI, `${ART}vendor_${clip}.webp`, cols, rows, count);
  }
  return ctx.data.vendorSheets[clip];
}

function vendorClip(ctx, clip) {
  const spr = ctx.data.vendor;
  if (!spr || spr.destroyed || ctx.data.vendorClip === clip) return;
  ctx.data.vendorClip = clip;
  const sheet = vendorFrames(ctx, clip);
  const set = () => {
    if (spr.destroyed || ctx.data.vendorClip !== clip || !sheet.frames.length) return;
    spr.textures = sheet.frames;
    spr.animationSpeed = 0.5;
    spr.play();
  };
  if (sheet.frames.length) set();
  else onLoaded(sheet.base, () => setTimeout(set, 0));
}

function drawPatch(ctx) {
  const { PIXI } = ctx;
  const c = ctx.data.patchView;
  c.removeChildren();
  const hit = new PIXI.Graphics();
  hit.rect(-70, -40, 140, 50).fill({ color: 0xffffff, alpha: 0.001 });
  c.addChild(hit);
  if (ctx.data.plot.stage === 'dug') {
    // The tunnel under the dug patch.
    const g = new PIXI.Graphics();
    g.ellipse(0, -6, 62, 18).fill({ color: 0x120d09, alpha: 0.92 });
    g.ellipse(0, -4, 44, 11).fill({ color: 0x000000, alpha: 0.9 });
    c.addChild(g);
  }
  const art = new PIXI.Sprite(textureFromUrl(plotArtPath(ctx.data.plot)));
  art.anchor.set(0.5, 1);
  art.scale.set(1.6);
  art.y = 6;
  c.addChild(art);
}

function plotCtx(ctx) {
  const e = ctx.engine;
  return {
    inv: e.inv,
    pc: e.pc,
    skills: e.learnedSkills || [],
    upgrades: e.pc?.imaginationUpgrades || [],
    buffs: e.activeBuffIds?.() || [],
    toolState: e.toolState,
    hubId: null,
  };
}

async function talk(ctx) {
  if (ctx.data.talking) return;
  ctx.data.talking = true;
  vendorClip(ctx, 'talk');
  try {
    const step = cellStep(questState(ctx));
    if (step === 'talk') {
      // Part 1 turns in here (end_npcs: npc_rare_item_vendor), then he asks for part 2.
      await ctx.quest(PART_1).turnIn();
      await ctx.offerQuest(PART_2, { kicker: 'Smuggler' });
    } else if (step === 'offer2') {
      await ctx.offerQuest(PART_2, { kicker: 'Smuggler' });
    } else if (step === 'offer3') {
      await ctx.offerQuest(PART_3, { kicker: 'Smuggler' });
    } else if (step === 'dig') {
      await ctx.converse({ title: questName(PART_2), kicker: 'Smuggler', text: "Good luck finding a way out. I've been looking for a way since I got here." });
    } else if (step === 'crawl') {
      await ctx.converse({ title: questName(PART_3), kicker: 'Smuggler', text: "It'll be a dirty crawl but we'll come out clean on the other side." });
    }
  } finally {
    ctx.data.talking = false;
    vendorClip(ctx, 'idle');
  }
}

async function dig(ctx) {
  const plot = ctx.data.plot;
  const res = performPlotVerb(plot, 'dig', plotCtx(ctx));
  if (!res.ok) {
    ctx.toast(res.msg || res.reason || "You can't dig here.", 2200);
    return;
  }
  const e = ctx.engine;
  e.refreshPack();
  e.updateHud();
  ctx.sound('SHOVEL', { volume: 0.6 });
  const got = res.outputs.map((o) => `${o.qty} ${o.classTsid === 'earth' ? 'Lumps of Earth' : o.classTsid}`).join(', ');
  ctx.activity(`${res.activity}${got ? ` You got ${got}.` : ''}`);
  if (ctx.data.patchTarget) ctx.say(ctx.data.patchTarget, res.response || soilResponse('dig_na_sa1_sa5'), 3000);
  drawPatch(ctx);
  ctx.data.patchTarget.label = 'Hole';
  ctx.data.patchTarget.subtitle = 'Just wide enough';
  const part2 = ctx.quest(PART_2);
  part2.progress(digCounter());
  // part2 has no end NPC: it completes as soon as the hole is dug.
  if (part2.complete()) {
    await part2.turnIn();
    await ctx.offerQuest(PART_3, { kicker: 'Smuggler' });
  }
}

/** The requirement name exactly as quests.json carries it. */
function digCounter() {
  const req = getQuestCatalog()?.[PART_2]?.requirements?.find((r) => r.classId === 'shovel');
  return req?.name || DIG_COUNTER;
}

async function crawl(ctx) {
  if (ctx.data.crawling) return;
  ctx.data.crawling = true;
  const v = ctx.data.vendor;
  // "After you.": the Smuggler goes first.
  ctx.data.vendorGoal = PATCH_X;
  for (let i = 0; i < 80 && v && !v.destroyed && Math.abs(v.x - PATCH_X) > 8; i++) await ctx.wait(100);
  if (v && !v.destroyed) {
    for (let a = 1; a > 0; a -= 0.1) {
      v.alpha = Math.max(0, a);
      v.y = FLOOR + (1 - a) * 30;
      await ctx.wait(60);
    }
    v.visible = false;
  }
  ctx.place(PATCH_X, FLOOR);
  ctx.data.sinking = true;
  await ctx.wait(700);
  await ctx.quest(PART_3).turnIn();
  ctx.solve();
  await ctx.converse({ title: questName(PART_3), kicker: 'Magic Rock', text: FREE_TEXT });
  ctx.leave({ transition: ctx.fx() });
}

export const room = {
  id: 'penalty',
  title: 'Smuggle the Smuggler',
  kicker: 'Wrongfully imprisoned',
  icon: `${ART}vendor_icon.png`,
  theme: 'dark',
  // G315: hub 73 'Penalty' (inc_data_maps_prod.js 371, street 'The Penalty Box' 18014).
  hubName: 'Penalty',
  durationMs: 0, // exit_delay: a prompt after two minutes, no clock
  leaveText: 'Leave the cell? The Smuggler stays locked up and you will have to come back.',
  travelText: 'The bars are sturdier than they look. There must be another way out.',
  doneLabel: 'Leave',

  build(ctx) {
    const { PIXI, kit } = ctx;
    const root = kit.sceneRoot(PIXI, W, H);
    const sky = root.layer(0, 0);
    sky.addChild(kit.gradient(PIXI, [[0, '#26323a'], [0.6, '#4e6470'], [1, '#7f949a']], 960, 640));
    const far = root.layer(0.25, 1);
    far.addChild(kit.deco(PIXI, 'moon', 760, 170, { scale: 0.5, alpha: 0.85 }));
    for (let i = 0; i < 3; i++) far.addChild(kit.deco(PIXI, 'penaltybox_water_reflection', 300 + i * 900, 640, { scale: 0.5, alpha: 0.7 }));
    const world = root.layer(1, 3);
    // The cave cell behind, the rock roof above, the mud floor.
    world.addChild(kit.deco(PIXI, 'penaltybox_cell_background', W / 2, FLOOR + 30, { scale: 0.66 }));
    // The Snap's trunk: behind the bars at the right, roots under the sign, its top under the roof.
    world.addChild(kit.deco(PIXI, 'penaltybox_trunk', TRUNK_X, FLOOR + 8, { scale: 0.62 }));
    world.addChild(kit.deco(PIXI, 'penaltybox_roof', W / 2, FLOOR - 470, { ay: 0, scale: 0.62 }));
    world.addChild(kit.deco(PIXI, 'penaltybox_doorway', 60, FLOOR + 12, { scale: 0.62, tint: 0x8a8278 }));
    world.addChild(kit.deco(PIXI, 'penaltybox_sign_youarehere', 430, FLOOR + 4, { scale: 0.5 }));
    world.addChild(kit.deco(PIXI, 'penaltybox_sign_knockitoff', 1210, FLOOR + 4, { scale: 0.42 }));
    const g = new PIXI.Graphics();
    // The earth below the grassy ledge.
    g.rect(-200, FLOOR + 180, W + 400, H - FLOOR + 50).fill(0x4a3a2e);
    world.addChild(g);
    // The Snap's grassy ledge under the mud floor's edge, one copy each side for the camera's overscroll.
    for (const dx of [-1440, 0, 1440]) world.addChild(kit.deco(PIXI, 'penaltybox_base_grass', W / 2 + dx, FLOOR + GRASS_TOP, { ay: 0, scale: 0.62 }));
    const band = new PIXI.Graphics();
    // The mud floor's walking band (the strip's art thins out at its left end).
    band.rect(-200, FLOOR - 6, W + 400, 40).fill(0x8a7a66);
    band.rect(-200, FLOOR - 6, W + 400, 6).fill(0x9d8c76);
    world.addChild(band);
    world.addChild(kit.deco(PIXI, 'penaltybox_middleplus_side', W / 2, FLOOR - 10, { ay: 0, scale: 0.62 }));
    // The cell door: a row of recovered bars from floor to roof.
    for (let i = 0; i < 6; i++) {
      world.addChild(kit.deco(PIXI, i % 2 ? 'penaltybox_bar_2' : 'penaltybox_bar_1', BARS_X + i * 22, FLOOR + 8, { scale: 0.62 }));
    }
    return {
      label: 'The Cell',
      width: W,
      height: H,
      background: root,
      platforms: cellPlatforms(kit),
      spawn: { ...SPAWN },
    };
  },

  enter(ctx) {
    const { PIXI } = ctx;
    ctx.data.enteredAt = Date.now();
    ctx.data.promptShown = false;
    ctx.data.plot ||= createPlot('patch_dark');
    // A retry of part 3: the hole was dug on the earlier visit.
    if ((ctx.engine.questState?.completed || []).includes(PART_2)) ctx.data.plot.stage = 'dug';
    const patch = new PIXI.Container();
    patch.x = PATCH_X;
    patch.y = FLOOR;
    ctx.data.patchView = patch;
    drawPatch(ctx);
    ctx.add(patch, 12);
    patch._worldHitW = 140;
    patch._worldHitH = 50;
    ctx.data.patchTarget = ctx.register({ classId: 'patch_dark', label: 'Dark Patch', subtitle: 'Soft, under the straw', sprite: patch });
    if (ctx.data.plot.stage === 'dug') {
      ctx.data.patchTarget.label = 'Hole';
      ctx.data.patchTarget.subtitle = 'Just wide enough';
    }
    const v = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
    v.anchor.set(VENDOR.anchor.x, VENDOR.anchor.y);
    v.x = (PACE.x1 + PACE.x2) / 2;
    v.y = FLOOR;
    v._worldHitW = 70;
    v._worldHitH = 90;
    ctx.data.vendor = v;
    ctx.data.vendorClip = '';
    ctx.data.vendorDir = 1;
    ctx.data.vendorGoal = null;
    ctx.data.paceWaitUntil = 0;
    vendorClip(ctx, 'idle');
    ctx.data.vendorTarget = ctx.register({ classId: 'npc_rare_item_vendor', label: 'Smuggler', subtitle: 'Wrongfully imprisoned', sprite: v });
  },

  verbs(ctx, target) {
    if (target === ctx.data.vendorTarget) {
      const step = cellStep(questState(ctx));
      return [
        { id: 'talk_to', label: 'Talk to', enabled: !ctx.data.talking && !ctx.data.crawling && step !== 'free', reason: 'He is busy', tooltip: 'He says he is innocent' },
        { id: 'buy', label: 'Buy', enabled: !ctx.data.talking && !ctx.data.crawling, reason: 'He is busy', tooltip: 'Buy extremely rare items' },
      ];
    }
    if (target === ctx.data.patchTarget) {
      const q = questState(ctx);
      if (q.dug) {
        return [{ id: 'crawl', label: 'Crawl into', enabled: q.part3Active && !ctx.data.crawling, reason: 'Ask the Smuggler first', tooltip: 'A dirty crawl to freedom' }];
      }
      const row = plotVerbs(ctx.data.plot, plotCtx(ctx)).find((r) => r.id === 'dig');
      if (!row) return [];
      if (!q.part2Active) return [{ ...row, enabled: false, reason: 'Talk to the Smuggler first' }];
      if (!row.enabled && /shovel/i.test(row.reason || '')) return [{ ...row, reason: NEED_TOOL }];
      return [row];
    }
    return [];
  },

  runVerb(ctx, target, verbId) {
    if (target === ctx.data.vendorTarget && verbId === 'talk_to') {
      talk(ctx);
      return true;
    }
    if (target === ctx.data.vendorTarget && verbId === 'buy') {
      ensureRareItems();
      ctx.engine.openShop?.(rareStoreProfile());
      ctx.engine.setData?.('penaltyRareStore', 'open');
      return true;
    }
    if (target === ctx.data.patchTarget && verbId === 'dig') {
      dig(ctx);
      return true;
    }
    if (target === ctx.data.patchTarget && verbId === 'crawl') {
      crawl(ctx);
      return true;
    }
    return false;
  },

  tick(ctx, dtMs) {
    // QA: &penaltystore=1 runs the Smuggler's Buy verb once the room is up.
    if (!ctx.data.qaStore && ctx.param?.('penaltystore') === '1' && ctx.data.vendorTarget && Date.now() - (ctx.data.enteredAt || 0) > 1500) {
      ctx.data.qaStore = true;
      this.runVerb(ctx, ctx.data.vendorTarget, 'buy');
    }
    const v = ctx.data.vendor;
    const p = ctx.player;
    // npc_walkable pace: walk the 400 px between his marks, pausing while anyone talks.
    if (v && !v.destroyed && v.visible && !ctx.data.talking) {
      const goal = ctx.data.vendorGoal ?? (ctx.data.vendorDir > 0 ? PACE.x2 : PACE.x1);
      const dx = goal - v.x;
      if (Date.now() < ctx.data.paceWaitUntil && ctx.data.vendorGoal == null) {
        vendorClip(ctx, 'idle');
      } else if (Math.abs(dx) > 4) {
        const step = Math.sign(dx) * PACE.speed * (ctx.data.vendorGoal != null ? 5 : 1) * (dtMs / 1000);
        v.x += Math.abs(step) > Math.abs(dx) ? dx : step;
        v.scale.x = dx < 0 ? -1 : 1;
        vendorClip(ctx, 'walk');
      } else if (ctx.data.vendorGoal == null) {
        ctx.data.vendorDir *= -1;
        ctx.data.paceWaitUntil = Date.now() + 2500;
      } else {
        vendorClip(ctx, 'idle');
      }
    } else if (v && ctx.data.talking && p) {
      v.scale.x = p.x < v.x ? -1 : 1;
    }
    if (ctx.data.sinking && p) p.alpha = Math.max(0, (p.alpha ?? 1) - dtMs / 600);
    // exit_delay 2*60: instances_show_exit_prompt, once.
    if (!ctx.data.promptShown && Date.now() - ctx.data.enteredAt >= EXIT_PROMPT_MS && !ctx.dialogOpen() && !ctx.engine.acting() && !ctx.data.crawling) {
      ctx.data.promptShown = true;
      // inc_instances.js 322-339: a prompts_add prompt, not a familiar conversation (G225);
      // G304: icon_buttons, no timeout, not modal, so the bottom-right prompt stack.
      ctx.prompt({
        text: EXIT_PROMPT,
        iconButtons: true,
        choices: [{ label: 'Yes, please', value: 'yes' }, { label: 'No thanks', value: 'no' }],
      }).then((answer) => answer === 'yes' && ctx.leave({ transition: ctx.fx() }));
    }
  },

  objective(ctx) {
    const step = cellStep(questState(ctx));
    const text = {
      talk: 'Talk to the wrongfully imprisoned Smuggler.',
      offer2: 'Ask the Smuggler how to get out.',
      dig: 'Dig your way out.',
      turn_in: 'Dig your way out.',
      offer3: 'Show the Smuggler your hole.',
      crawl: "Let's get outta here: crawl into the hole.",
      free: "You're free!",
    }[step];
    return { text, stats: [['hole', ctx.data.plot?.stage === 'dug' ? 'dug' : 'not yet']] };
  },

  onLeave(ctx, outcome) {
    const p = ctx.player;
    if (p) p.alpha = 1;
    if (outcome !== 'complete') {
      // The later parts were accepted in here: leaving early fails them too.
      for (const id of [PART_2, PART_3]) {
        if (id !== ctx.questId && ctx.quest(id).active()) ctx.quest(id).fail();
      }
    }
    return { leaveFlag: false };
  },

  publish(ctx) {
    const q = questState(ctx);
    ctx.setData('penaltyStep', cellStep(q));
    ctx.setData('penaltyPatch', ctx.data.plot?.stage || '');
    ctx.setData('penaltyParts', [PART_1, PART_2, PART_3].map((id) => (ctx.quest(id).active() ? 'a' : (ctx.engine.questState?.completed || []).includes(id) ? 'd' : '-')).join(''));
    ctx.setData('penaltyVendorX', String(Math.round(ctx.data.vendor?.x || 0)));
  },

  async autoplay(ctx, mode) {
    const drain = async (until, max = 60) => {
      for (let i = 0; i < max && !until(); i++) {
        if (!ctx.advanceAward()) ctx.advanceDialog();
        await ctx.wait(250);
      }
    };
    await ctx.wait(800);
    if (ctx.count('shovel') < 1 && ctx.count('ace_of_spades') < 1) ctx.give('shovel', 1);
    if ((ctx.engine.pc.energy || 0) < 20) ctx.engine.pc.energy = 60;
    ctx.place(ctx.data.vendor.x + 80, FLOOR);
    talk(ctx);
    await drain(() => ctx.quest(PART_2).active());
    await drain(() => !ctx.dialogOpen(), 10);
    if (mode === 'talk') return 'talked';
    ctx.place(PATCH_X + 60, FLOOR);
    await ctx.wait(300);
    dig(ctx);
    await drain(() => ctx.quest(PART_3).active());
    await drain(() => !ctx.dialogOpen(), 10);
    if (mode === 'dig') return 'dug';
    crawl(ctx);
    await drain(() => !ctx.run, 120);
    return 'free';
  },
};
