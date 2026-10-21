/**
 * Le Misérable (quests/le_miserable.js, le_miserable_part_2.js and
 * le_miserable_reminisce.js) in the Fireflex 3000 Lab.
 *
 * Geometry and scripts survive: template LIFMMN6E7A73R0T was archived as its
 * instantiated copy LIFM4BD43383DKV (geometry GIFM4BD43383DKV, an imported
 * street with 234 location events). onStarted puts you at -1873,-167 for
 * 5 * 60 seconds. The room runs the street's own scripts (streetEvents) and
 * rebuilds only the triggers that were items:
 *  - Three light panels (3, 5 and 7 columns). Each column has a floor pad,
 *    the circle_cutout_04_arbito1 marks at y -407 under it: a Collision-
 *    triggered Event Box (items/cteb.js, onEnter = a comma list run in
 *    order). Listing the column's five `_on` events black first lets each
 *    one's gates stop all but the next colour, so a crossing steps the column
 *    once: grey, yellow, orange, purple, teal, dark (the colour layers' tints;
 *    the script names them yellow, red, blue, purple, black). The fixed
 *    squares under each panel show the answer; puzzle_N_verify checks it and
 *    win_condition sets turn_on_machine once all three are lit.
 *  - A Reset button per panel (the recording's red wall_button) fires
 *    puzzle_N_off then puzzle_N_checks.
 *  - The machine at -845,-458 (beam shown by win_condition) fires pc_scale
 *    (x0.5); the one at 2157,-186 fires pc_scale_normal. Between them the
 *    crawl space runs under two walls that stop 69 px above the floor: they
 *    open only while you are small.
 *  - npc_maintenance_bot: a 600 x 600 hit box. Bumping into it turns in part 1
 *    and offers part 2, and turns part 2 in once the machine is on
 *    (onPlayerCollision -> talk_to -> offerQuests).
 * The reminisce copy (LIF42FA3D183STG, not archived) has no bot: turn on the
 * machine and leave by the door. Leaving early fails the quest in progress.
 * Crawl-space quoins are placed by the remake (their objrefs carry no x/y);
 * the reference recording (j9xJLETQzi4) shows quoins there.
 */

export const STREET = 'GIFM4BD43383DKV';
const BOUNDS = { l: -2000, t: -1000 };
const sx = (x) => x - BOUNDS.l;
const sy = (y) => y - BOUNDS.t;
const ART = 'assets/sprites/quest-rooms/le_miserable/';

export const PART_1 = 'le_miserable';
export const PART_2 = 'le_miserable_part_2';
export const REMINISCE = 'le_miserable_reminisce';

/** Script colour order; each crossing of a pad moves a column one step along it. */
export const CYCLE = Object.freeze(['yellow', 'red', 'blue', 'purple', 'black']);
/** Column x (source) per panel, left to right = slot 1..n; resets sit left of each panel. */
export const PANELS = Object.freeze([
  { n: 1, slots: [-260, -189, -121], reset: -345 },
  { n: 2, slots: [340, 411, 479, 551, 619], reset: 255 },
  { n: 3, slots: [1164, 1235, 1303, 1375, 1443, 1515, 1583], reset: 1080 },
]);
const UPPER_FLOOR = -414;
/** Pads sit 70 px apart; +-24 px forgives the avatar's coasting and keeps a gap between neighbours. */
export const PAD_HALF = 24;
const LOWER_FLOOR = -109;
const SHRINK = { x1: -904, x2: -783, y: -458 };
const GROW = { x1: 2102, x2: 2213, y: -186 };
/** The crawl space's two low doorways, a wall pair each (bottoms at -178 / -176 over the -109 floor). */
export const CRAWL_WALLS = Object.freeze(['wall_1344905394650', 'wall_1344905394651', 'wall_1345154495728', 'wall_1345154495662']);
const BOT = { x: -1500, y: -133, hitHalf: 300 };
const DOOR = { x: 2468, y: -155 };
const CRAWL_QUOINS = [
  { x: -930, type: 'xp' }, { x: -520, type: 'mood' }, { x: -110, type: 'xp' },
  { x: 300, type: 'currants' }, { x: 710, type: 'xp' }, { x: 1120, type: 'energy' }, { x: 1530, type: 'xp' },
].map((q) => ({ ...q, y: LOWER_FLOOR - 30 }));

/** The pad's onEnter list for panel n, column k (1-based). */
export function padEvents(n, k) {
  return [...CYCLE].reverse().map((color) => `p${n}_${color}_${k}_on`);
}

/** The Reset button's events for panel n. */
export function resetEvents(n) {
  return [`puzzle_${n}_off`, `puzzle_${n}_checks`];
}

const panelSolved = (ctx, n) => ctx.events.flag(`p${n}_win_check`);
const solvedCount = (ctx) => PANELS.filter((p) => panelSolved(ctx, p.n)).length;

/** The quest that owns the machine flag on this run. */
function machineQuest(ctx) {
  if (ctx.questId === REMINISCE) return ctx.quest(REMINISCE);
  return ctx.quest(PART_2);
}

function setSmall(ctx, small) {
  if (ctx.data.small === small) return;
  ctx.data.small = small;
  // Open the crawl walls while small (pc_perm 0 is open, null solid both ways).
  for (const wall of ctx.engine.street?.barriers || []) {
    if (CRAWL_WALLS.includes(wall.id)) wall.pc_perm = small ? 0 : null;
  }
}

function useBot(ctx, sheet) {
  const bot = ctx.data.bot;
  const set = () => {
    if (!bot || bot.destroyed || !sheet.frames.length) return;
    bot.textures = sheet.frames;
    bot.play();
  };
  if (sheet.frames.length) set();
  else sheet.base.once('loaded', () => setTimeout(set, 0));
}

/** onPlayerCollision -> talk_to -> offerQuests: turn in what is ready, offer part 2. */
async function botTalk(ctx) {
  if (ctx.data.talking || ctx.questId === REMINISCE) return;
  ctx.data.talking = true;
  useBot(ctx, ctx.data.botTalk);
  try {
    const part2 = ctx.quest(PART_2);
    if (ctx.questId === PART_1 && !ctx.data.part1Done) {
      ctx.data.part1Done = true;
      await ctx.turnIn();
    }
    if (!part2.active() && !ctx.data.part2Done) {
      ctx.data.offered = true;
      await ctx.offerQuest(PART_2, { kicker: 'MaintenanceBot M-64' });
    } else if (part2.active() && part2.complete()) {
      ctx.data.part2Done = true;
      await part2.turnIn();
      ctx.solve();
    }
  } finally {
    ctx.data.talking = false;
    ctx.data.botCooldownAt = Date.now() + 4000;
    useBot(ctx, ctx.data.botIdle);
  }
}

async function exit(ctx) {
  if (ctx.data.exiting) return;
  ctx.data.exiting = true;
  const quest = machineQuest(ctx);
  if (ctx.questId === REMINISCE) {
    if (quest.complete() || ctx.events.flag('p3_win_check')) ctx.solve();
  } else if (quest.active() && quest.complete()) {
    // Reached the door without telling the bot: part 2 still turns in.
    ctx.data.part2Done = true;
    await quest.turnIn();
    ctx.solve();
  }
  ctx.leave({ transition: ctx.fx() });
}

function addResetButton(ctx, panel) {
  const { PIXI, kit } = ctx;
  const c = new PIXI.Container();
  const plate = new PIXI.Graphics();
  plate.beginFill(0xe9e6df).lineStyle(2, 0x9a958c, 1).drawRoundedRect(-24, -66, 48, 56, 6).endFill();
  c.addChild(plate);
  const sheet = kit.sheetFrames(PIXI, `${ART}reset_button.png`, 7, 1, 7);
  const btn = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  btn.anchor.set(0.5, 0.5);
  btn.y = -28;
  btn.loop = false;
  btn.animationSpeed = 0.5;
  const ready = () => {
    if (btn.destroyed || !sheet.frames.length) return;
    btn.textures = sheet.frames;
    btn.gotoAndStop(0);
  };
  if (sheet.frames.length) ready();
  else sheet.base.once('loaded', () => setTimeout(ready, 0));
  c.addChild(btn);
  c.addChild(kit.label(PIXI, 'Reset', 0, -58, { size: 11, fill: 0x45413b, weight: '900' }));
  c.x = sx(panel.reset);
  c.y = sy(UPPER_FLOOR) - 34;
  ctx.add(c, 40);
  const target = ctx.register({ classId: 'wall_button', label: 'Reset', subtitle: `Light panel ${panel.n}`, sprite: c });
  target.resetPanel = panel.n;
  target.button = btn;
  return target;
}

function pressReset(ctx, target) {
  const n = target.resetPanel;
  target.button?.gotoAndPlay?.(0);
  ctx.events.fire('button_press');
  if (panelSolved(ctx, n)) return;
  for (const name of resetEvents(n)) ctx.events.fire(name);
  ctx.data.resets = (ctx.data.resets || 0) + 1;
}

function stepPads(ctx) {
  const p = ctx.player;
  if (!p) return;
  let on = '';
  if (Math.abs(p.y - sy(UPPER_FLOOR)) < 14) {
    for (const panel of PANELS) {
      panel.slots.forEach((x, i) => {
        if (Math.abs(p.x - sx(x)) <= PAD_HALF) on = `${panel.n}:${i + 1}`;
      });
    }
  }
  if (on && on !== ctx.data.pad) {
    const [n, k] = on.split(':').map(Number);
    for (const name of padEvents(n, k)) ctx.events.fire(name);
    ctx.data.steps = (ctx.data.steps || 0) + 1;
  }
  ctx.data.pad = on;
}

function stepMachines(ctx) {
  const p = ctx.player;
  if (!p) return;
  const inBox = (box) => p.x >= sx(box.x1) && p.x <= sx(box.x2) && Math.abs(p.y - sy(box.y)) < 40;
  const atShrink = inBox(SHRINK);
  // The CTEBs fire the street's own events; pc_scale only shrinks once win_condition cleared its flag.
  if (atShrink && !ctx.data.atShrink && !ctx.data.small) ctx.events.fire('pc_scale');
  ctx.data.atShrink = atShrink;
  const atGrow = inBox(GROW);
  if (atGrow && !ctx.data.atGrow && ctx.data.small) ctx.events.fire('pc_scale_normal');
  ctx.data.atGrow = atGrow;
  // Small is whatever the avatar really is: the crawl walls follow it.
  const small = Boolean(ctx.data.normalScale) && Math.abs(p.baseScale || 0) < ctx.data.normalScale * 0.75;
  if (small !== Boolean(ctx.data.small)) {
    ctx.activity(small ? 'The machine hums and you shrink down to crawl-space size.' : 'The second machine makes you big again.');
    if (!small) ctx.data.grown = true;
  }
  setSmall(ctx, small);
}

export const room = {
  id: 'le_miserable',
  title: 'Le Misérable',
  kicker: 'The Fireflex 3000 Lab',
  icon: `${ART}bot_icon.png`,
  theme: 'memory',
  hubName: 'The Fireflex 3000 Lab',
  durationMs: 5 * 60 * 1000,
  streetEvents: true,
  leaveText: 'Leave the lab? You will have to start over.',
  travelText: 'There is No Exit. Not that way, anyway.',

  street() {
    return { tsid: STREET, x: sx(-1873), y: sy(-167) };
  },

  enter(ctx) {
    const { PIXI, kit } = ctx;
    ctx.data.small = null;
    setSmall(ctx, false);
    ctx.data.normalScale = Math.abs(ctx.engine.player?.baseScale || 0);
    ctx.data.pad = '';
    ctx.data.machineOn = false;
    ctx.data.quoins = [];
    if (ctx.questId !== REMINISCE) {
      ctx.data.botIdle = kit.sheetFrames(PIXI, `${ART}bot_idle.png`, 12, 2, 24);
      ctx.data.botTalk = kit.sheetFrames(PIXI, `${ART}bot_talk.png`, 12, 6, 69);
      const bot = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
      bot.anchor.set(0.5, 1);
      bot.animationSpeed = 0.3;
      bot.x = sx(BOT.x);
      bot.y = sy(BOT.y) + 2;
      ctx.data.bot = bot;
      ctx.add(bot, 30);
      useBot(ctx, ctx.data.botIdle);
      ctx.data.botTarget = ctx.register({ classId: 'npc_maintenance_bot', label: 'MaintenanceBot M-64', subtitle: 'Stuck here for ages', sprite: bot });
    }
    ctx.data.resetTargets = PANELS.map((panel) => addResetButton(ctx, panel));
    const door = new PIXI.Container();
    door.x = sx(DOOR.x);
    door.y = sy(DOOR.y);
    const hit = new PIXI.Graphics();
    hit.beginFill(0xffffff, 0.001).drawRect(-70, -160, 140, 160).endFill();
    door.addChild(hit);
    ctx.add(door, 25);
    ctx.data.door = ctx.register({ classId: 'door', label: 'Exit', subtitle: 'The way out of the lab', sprite: door });
  },

  verbs(ctx, target) {
    if (target === ctx.data.botTarget) {
      return [{ id: 'talk_to', label: 'Talk to', enabled: !ctx.data.talking && !ctx.data.part2Done, tooltip: 'It looks intelligent enough' }];
    }
    if (target.resetPanel) return [{ id: 'press', label: 'Press', enabled: true, tooltip: 'Reset this light panel' }];
    if (target === ctx.data.door) {
      const near = ctx.near(sx(DOOR.x), sy(DOOR.y), 160);
      const why = !ctx.data.machineOn ? 'Turn on the machine first' : !near ? 'Walk over to the door' : 'Leave through the door';
      return [{ id: 'enter', label: 'Enter', enabled: ctx.data.machineOn && near, tooltip: why }];
    }
    return [];
  },

  runVerb(ctx, target, verbId) {
    if (target === ctx.data.botTarget && verbId === 'talk_to') {
      botTalk(ctx);
      return true;
    }
    if (target.resetPanel && verbId === 'press') {
      pressReset(ctx, target);
      return true;
    }
    if (target === ctx.data.door && verbId === 'enter') {
      exit(ctx);
      return true;
    }
    return false;
  },

  tick(ctx) {
    const p = ctx.player;
    if (!p) return;
    stepPads(ctx);
    // win_condition (all three panels) clears the street's pc_scale flag and shows the beam.
    if (!ctx.data.machineOn && PANELS.every((panel) => panelSolved(ctx, panel.n)) && !ctx.events.flag('pc_scale')) {
      ctx.data.machineOn = true;
      machineQuest(ctx).progress('turn_on_machine');
      ctx.activity('All three panels are lit. The machine is on.');
    }
    stepMachines(ctx);
    // The bot's 600 x 600 hit box: part 1 to turn in, or part 2 done.
    const nearBot = ctx.data.bot && Math.abs(p.x - sx(BOT.x)) < BOT.hitHalf && Math.abs(p.y - sy(BOT.y)) < BOT.hitHalf;
    const part2 = ctx.quest(PART_2);
    const ready = (ctx.questId === PART_1 && !ctx.data.part1Done) || (part2.active() && part2.complete() && !ctx.data.part2Done);
    if (nearBot && ready && !ctx.data.talking && !ctx.dialogOpen() && Date.now() > (ctx.data.botCooldownAt || 0)) botTalk(ctx);
    if (ctx.data.small && !ctx.data.quoins.length) {
      ctx.data.quoins = CRAWL_QUOINS.map((q, i) => {
        const spr = ctx.add(ctx.quoinSprite(q.type, sx(q.x), sy(q.y), 0.7), 30);
        return { ...q, id: `crawl${i}`, x: sx(q.x), y: sy(q.y), spr, taken: false };
      });
    }
    for (const q of ctx.data.quoins) {
      if (q.taken || Math.abs(p.x - q.x) > 26 || Math.abs(p.y - 20 - q.y) > 40) continue;
      q.taken = true;
      if (q.spr) q.spr.visible = false;
      ctx.collectQuoin(q.type, q.x, q.y);
    }
  },

  objective(ctx) {
    const lit = solvedCount(ctx);
    const part2 = ctx.quest(PART_2);
    let text = 'Make each light panel match the squares under it.';
    if (ctx.questId === PART_1 && !ctx.data.part1Done) text = 'Look around the lab.';
    else if (ctx.questId !== REMINISCE && !part2.active() && !ctx.data.part2Done) text = 'Talk to MaintenanceBot M-64.';
    else if (ctx.data.machineOn && part2.active() && !ctx.data.part2Done) text = 'The machine is on. Tell MaintenanceBot M-64.';
    else if (ctx.data.grown) text = 'Find the exit.';
    else if (ctx.data.small) text = 'Crawl through to the machine on the other side.';
    else if (ctx.data.machineOn) text = 'Step into the machine to shrink.';
    return { text, stats: [['panels lit', `${lit}/3`]] };
  },

  onLeave(ctx, outcome) {
    // le_miserable_part_2 onExitLocation: leaving before it is complete fails it.
    if (outcome !== 'complete' && ctx.questId === PART_1 && ctx.quest(PART_2).active() && !ctx.quest(PART_2).complete()) {
      ctx.quest(PART_2).fail();
    }
    setSmall(ctx, false);
    return ctx.questId === REMINISCE ? { leaveFlag: 'instance_exit_via_door' } : {};
  },

  publish(ctx) {
    ctx.setData('lemisPanels', PANELS.map((panel) => (panelSolved(ctx, panel.n) ? '1' : '0')).join(''));
    ctx.setData('lemisPad', ctx.data.pad || '');
    ctx.setData('lemisSteps', String(ctx.data.steps || 0));
    ctx.setData('lemisResets', String(ctx.data.resets || 0));
    ctx.setData('lemisMachine', ctx.data.machineOn ? '1' : '0');
    ctx.setData('lemisSmall', ctx.data.small ? '1' : '0');
    ctx.setData('lemisPart1', ctx.data.part1Done ? '1' : '0');
    ctx.setData('lemisPart2', ctx.data.part2Done ? 'done' : ctx.quest(PART_2).active() ? 'active' : 'none');
    ctx.setData('lemisQuoins', String((ctx.data.quoins || []).filter((q) => q.taken).length));
    ctx.setData('lemisScale', String(Math.round((ctx.engine.player?.baseScale || 0) * 1000) / 1000));
  },
};
