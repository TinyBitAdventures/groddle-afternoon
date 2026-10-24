/**
 * Color Unblocking (quests/puzzle_level_color_blockage.js + _rem).
 *
 * Source: onStarted makes a private copy of LIFCUIL66CA3SU5 (the reminisce
 * copy LIFVJF94FAB3HOC) with a 5 * 60 second exit delay; leaving before the
 * exit fails the quest. The goal is the `instance_exit_via_door` flag
 * ("Find the Exit"), the quest ends at npc_crab, and the first run gives
 * 250 iMG, 100 energy, 50 Ti favor and the soulbound Play Cube that offers
 * every puzzle level's reminisce. The template geometry and its switch
 * scripts are not in the locations dump, so the level is rebuilt from the
 * quest's own description ("Unblock your way to the exit, collecting rewards
 * along the way") with the source's mechanism: wall switches (items/
 * wall_switch.js, toggle mode) broadcast events that switch coloured blocks
 * on and off. Art: wall_switch lockUp / lockDown, the arbito1 purple door
 * and the npc_crab idle/talk sheets (131x129 frames).
 *
 * Look (G69): players' Snaps (research/wayback/raw/snaps/
 * puzzle_level_color_blockage and _rem, reference only) show a white void,
 * square felt blocks in red, yellow and charcoal on a charcoal felt floor, a
 * purple door (arbito1.swf door_asset_purple), and a finale page: Keita Takahashi's four doodled block
 * characters under "Thank you for playing with us! See you !!", which is the
 * CC0 quest01.swf deco unclutter_your_mind_keita_pic (tools/room-art
 * color_unblocking). The felt is drawn here (a seeded fibre texture, tinted to
 * the colours sampled from the Snaps and that drawing); the five switch
 * groups keep their mechanics and wear the source palette: red, blue, yellow
 * (the remake's green group), charcoal (purple) and an orange bridge.
 *
 * Layout (one switch press per colour reaches the door):
 *  1. A red tower blocks the floor; its switch is right before it.
 *  2. Green steps climb to a ledge with the blue switch; a blue tower too
 *     tall to jump stands beyond. A green switch at the foot of the steps
 *     takes them away (press it again to bring them back).
 *  3. A green tower: the second green switch clears it (and the steps).
 *  4. An orange bridge over a pit and a purple tower beyond it. Purple
 *     opens the way; orange drops the bridge.
 *  5. The crab, and the door.
 */

import { COLORS, JUMP_RISE, lastCheckpoint, makeSwitch, pushOutOfSolids, spawnQuoins, takeQuoins } from './puzzle-kit.js?v=cu-1';
import { COLOR_UNBLOCKING_FILES } from '../color-unblocking-art.js';
import { textureFromUrl } from '../textures.js';

const W = 3700;
const H = 1040;
const FLOOR = 860;
const CELL = 80;
const PIT = { x1: 2180, x2: 2740 };
const FALL_Y = 990;
const ART = 'assets/sprites/quest-rooms/color_unblocking/';

/**
 * Felt per switch group: the colour its blocks and switch plate wear and the name the switch
 * goes by. Sampled from the Snaps (red #db2d2b, yellow #dad716, charcoal #4a4a45) and the finale
 * drawing (blue #336edd); the bridge keeps an orange felt of the same weight.
 */
export const FELT = Object.freeze({
  red: Object.freeze({ hex: 0xdb2d2b, css: '#db2d2b', label: 'Red' }),
  blue: Object.freeze({ hex: 0x336edd, css: '#336edd', label: 'Blue' }),
  green: Object.freeze({ hex: 0xdad716, css: '#c9c512', label: 'Yellow' }),
  purple: Object.freeze({ hex: 0x4a4a45, css: '#4a4a45', label: 'Charcoal' }),
  orange: Object.freeze({ hex: 0xe58a24, css: '#e58a24', label: 'Orange' }),
});
export const FELT_FLOOR = 0x4a4a45;
export const FINALE_ART = 'unclutter_your_mind_keita_pic';
/** How long the finale page stays up before the room closes. */
export const FINALE_MS = 3600;

/** A seeded felt texture (greyscale fibres on near-white), tinted per block. */
let feltCanvas = null;
function feltTexture(PIXI) {
  if (!feltCanvas && typeof document !== 'undefined') {
    const n = 128;
    const cv = document.createElement('canvas');
    cv.width = n;
    cv.height = n;
    const g = cv.getContext('2d');
    g.fillStyle = '#efefef';
    g.fillRect(0, 0, n, n);
    let seed = 7;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    // Short fibres in every direction, drawn wrapped so the tile repeats cleanly.
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * n;
      const y = rnd() * n;
      const a = rnd() * Math.PI;
      const len = 2 + rnd() * 5;
      const v = Math.round(214 + rnd() * 41);
      g.strokeStyle = `rgba(${v},${v},${v},${(0.35 + rnd() * 0.4).toFixed(2)})`;
      g.lineWidth = 0.8 + rnd() * 0.8;
      for (const [ox, oy] of [[0, 0], [-n, 0], [0, -n], [-n, -n]]) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
        g.stroke();
      }
    }
    feltCanvas = cv;
  }
  return feltCanvas ? PIXI.Texture.from(feltCanvas) : PIXI.Texture.WHITE;
}

/** A felt rectangle: the fibre texture tinted to a colour, with a faint darker edge. */
function feltRect(PIXI, w, h, color) {
  const c = new PIXI.Container();
  const t = new PIXI.TilingSprite({ texture: feltTexture(PIXI), width: w, height: h });
  t.tint = color;
  c.addChild(t);
  const edge = new PIXI.Graphics();
  edge.rect(0.5, 0.5, w - 1, h - 1).stroke({ width: 1.5, color: 0x000000, alpha: 0.12 });
  c.addChild(edge);
  return c;
}

/** Every block: a column of `rows` cells standing on `base` (default the floor). */
export function colorLayout() {
  const blocks = [];
  const column = (color, x, rows, base = FLOOR) => {
    for (let r = 0; r < rows; r++) blocks.push({ id: `${color}_${x}_${r}`, color, x, top: base - (r + 1) * CELL, col: `${color}_${x}` });
  };
  // 1. Red tower, 3 high (240 px).
  column('red', 640, 3);
  // 2. Green steps: 1, 2, 3 high, then the blue tower, 5 high (400 px).
  column('green', 960, 1);
  column('green', 1040, 2);
  column('green', 1120, 3);
  column('blue', 1460, 5);
  // 3. Green tower, 4 high.
  column('green', 1880, 4);
  // 4. Orange bridge across the pit (tops level with the floor), purple tower.
  for (let x = PIT.x1 + CELL / 2; x < PIT.x2; x += CELL) blocks.push({ id: `orange_${x}`, color: 'orange', x, top: FLOOR, col: `orange_${x}` });
  column('purple', 2860, 4);
  return {
    blocks,
    ledge: { x1: 1170, x2: 1360, y: FLOOR - 3 * CELL },
    floors: [
      { x1: 0, x2: PIT.x1, y: FLOOR },
      { x1: PIT.x2, x2: W, y: FLOOR },
    ],
    switches: [
      { id: 'red', color: 'red', x: 540, y: FLOOR },
      { id: 'green_a', color: 'green', x: 860, y: FLOOR },
      { id: 'blue', color: 'blue', x: 1300, y: FLOOR - 3 * CELL },
      { id: 'green_b', color: 'green', x: 1760, y: FLOOR },
      { id: 'orange', color: 'orange', x: 2010, y: FLOOR },
      { id: 'purple', color: 'purple', x: 2100, y: FLOOR },
    ],
    checkpoints: [{ x: 160 }, { x: 760 }, { x: 1560 }, { x: 2060 }, { x: 2960 }],
    quoins: [
      { x: 330, y: FLOOR - 60, type: 'currants' }, { x: 420, y: FLOOR - 100, type: 'xp' },
      { x: 760, y: FLOOR - 60, type: 'mood' },
      { x: 1040, y: FLOOR - 2 * CELL - 50, type: 'xp' }, { x: 1120, y: FLOOR - 3 * CELL - 50, type: 'currants' },
      { x: 1230, y: FLOOR - 3 * CELL - 50, type: 'energy' },
      { x: 1620, y: FLOOR - 60, type: 'xp' }, { x: 1700, y: FLOOR - 100, type: 'currants' },
      { x: 2300, y: FLOOR - 60, type: 'mood' }, { x: 2460, y: FLOOR - 90, type: 'xp' }, { x: 2620, y: FLOOR - 60, type: 'currants' },
      { x: 3000, y: FLOOR - 60, type: 'energy' }, { x: 3100, y: FLOOR - 100, type: 'xp' },
    ],
    crab: { x: 3260, y: FLOOR },
    door: { x: 3500, y: FLOOR },
    spawn: { x: 160, y: FLOOR },
    // The order a player solves it in (tests walk it).
    solution: ['red', 'blue', 'green_b', 'purple'],
  };
}

/** Colours present after toggling the given switch ids from all-on. */
export function colorsAfter(presses) {
  const on = new Set(Object.keys(COLORS));
  const layout = colorLayout();
  for (const id of presses) {
    const sw = layout.switches.find((s) => s.id === id);
    if (!sw) continue;
    if (on.has(sw.color)) on.delete(sw.color);
    else on.add(sw.color);
  }
  return on;
}

/** Column tops/bottoms for the colours present (solid rectangles). */
export function solidColumns(layout, on) {
  const cols = new Map();
  for (const b of layout.blocks) {
    if (!on.has(b.color)) continue;
    const r = cols.get(b.col) || { x1: b.x - CELL / 2, x2: b.x + CELL / 2, yTop: Infinity, yBot: -Infinity, color: b.color, col: b.col };
    r.yTop = Math.min(r.yTop, b.top);
    r.yBot = Math.max(r.yBot, b.top + CELL);
    cols.set(b.col, r);
  }
  return [...cols.values()];
}

function walkable(layout, on) {
  const out = layout.floors.map((f, i) => ({ id: `cu_floor${i}`, x1: f.x1, y1: f.y, x2: f.x2, y2: f.y, style: 'invisible' }));
  out.push({ id: 'cu_ledge', x1: layout.ledge.x1, y1: layout.ledge.y, x2: layout.ledge.x2, y2: layout.ledge.y, style: 'invisible' });
  // The pit's floor sits below the fall line, so a missing bridge means a fall.
  out.push({ id: 'cu_pitfloor', x1: PIT.x1, y1: FALL_Y + 20, x2: PIT.x2, y2: FALL_Y + 20, style: 'invisible' });
  for (const c of solidColumns(layout, on)) out.push({ id: `cu_top_${c.col}`, x1: c.x1, y1: c.yTop, x2: c.x2, y2: c.yTop, style: 'invisible' });
  return out;
}

function syncPlatforms(ctx) {
  const list = ctx.engine.platforms;
  if (!list) return;
  const keep = list.filter((p) => !String(p.id).startsWith('cu_'));
  list.length = 0;
  list.push(...keep, ...walkable(ctx.data.layout, ctx.data.on));
}

function drawBlocks(ctx) {
  for (const b of ctx.data.layout.blocks) {
    const spr = ctx.data.blockSprites[b.id];
    if (!spr) continue;
    const want = ctx.data.on.has(b.color) ? 1 : 0;
    spr.targetAlpha = want;
  }
}

export const room = {
  id: 'color_unblocking',
  /** Keeps its own white void: the world-only Dametime tint stays off (G99). */
  ownLight: true,
  title: 'Color Unblocking',
  kicker: 'Unblock your way to the exit',
  icon: 'assets/sprites/icons/play_cube.png',
  theme: 'warm',
  hubName: 'A puzzle place beyond Ur',
  durationMs: 5 * 60 * 1000,
  leaveText: 'Leave before you find the exit? You will have to start over.',
  travelText: 'Find the exit, or use Leave.',

  build(ctx) {
    const { PIXI, kit } = ctx;
    const layout = colorLayout();
    ctx.data.layout = layout;
    ctx.data.on = new Set(Object.keys(COLORS));
    const root = kit.sceneRoot(PIXI, W, H);
    const sky = root.layer(0, 0);
    // A pure white void (the Snaps).
    sky.addChild(kit.gradient(PIXI, [[0, '#ffffff'], [1, '#ffffff']], 960, 640));
    const world = root.layer(1, 3);
    // Charcoal felt floor, broken by the pit (which shows the white void).
    for (const f of layout.floors) {
      const fl = feltRect(PIXI, f.x2 - f.x1, H - f.y + 240, FELT_FLOOR);
      fl.x = f.x1;
      fl.y = f.y;
      world.addChild(fl);
    }
    // The blue switch ledge: a charcoal felt shelf.
    const ledge = feltRect(PIXI, layout.ledge.x2 - layout.ledge.x1, 34, FELT_FLOOR);
    ledge.x = layout.ledge.x1;
    ledge.y = layout.ledge.y;
    world.addChild(ledge);
    // Square felt blocks with a hairline of white between neighbours.
    ctx.data.blockSprites = {};
    for (const b of layout.blocks) {
      const spr = feltRect(PIXI, CELL - 2, CELL - 2, FELT[b.color].hex);
      spr.x = b.x - CELL / 2 + 1;
      spr.y = b.top + 1;
      spr.targetAlpha = 1;
      world.addChild(spr);
      ctx.data.blockSprites[b.id] = spr;
    }
    // The Snaps' purple door (arbito1.swf door_asset_purple), with no sign over it.
    const [doorFile] = COLOR_UNBLOCKING_FILES.door_asset_purple;
    const door = new PIXI.Sprite(textureFromUrl(`${ART}${doorFile}`));
    door.anchor.set(0.5, 1);
    door.x = layout.door.x;
    door.y = layout.door.y + 2;
    world.addChild(door);
    world.addChild(kit.label(PIXI, 'START', 160, FLOOR - 120, { size: 22, fill: 0xffffff, stroke: { color: FELT_FLOOR, width: 5 } }));
    return {
      label: 'Color Unblocking',
      width: W,
      height: H,
      background: root,
      platforms: walkable(layout, ctx.data.on),
      spawn: layout.spawn,
    };
  },

  enter(ctx) {
    const layout = ctx.data.layout;
    ctx.data.switches = layout.switches.map((s) => {
      const sw = makeSwitch(ctx, { ...s, on: !ctx.data.on.has(s.color), label: `${FELT[s.color].label} Switch` });
      // The plate wears its group's felt colour (puzzle-kit draws it in the shared palette).
      const plate = sw.container.children[0];
      plate.clear();
      plate.roundRect(-27, -64, 54, 62, 12).fill({ color: 0x3b3f45, alpha: 0.35 });
      plate.roundRect(-24, -66, 48, 58, 11).fill(FELT[s.color].hex).stroke({ width: 3, color: 0xffffff, alpha: 0.9 });
      return sw;
    });
    ctx.data.quoins = spawnQuoins(ctx, layout.quoins);
    ctx.data.reached = layout.spawn.x;
    ctx.data.prevX = layout.spawn.x;
    ctx.data.presses = [];
    // The crab (npc_crab idle0 6x5 / talk 7x9 sheets, 131x129).
    const crab = ctx.kit.animated(ctx.PIXI, `${ART}npc_crab_idle0.png`, 6, 5, { scale: 0.62, speed: 0.3, count: 30 });
    crab.x = layout.crab.x;
    crab.y = layout.crab.y + 6;
    crab.scale.x = -0.62;
    ctx.data.crab = ctx.register({ classId: 'npc_crab', label: 'Crab', subtitle: 'Loves a good tune', sprite: crab });
    const doorHit = new ctx.PIXI.Graphics();
    doorHit.rect(-60, -190, 120, 190).fill({ color: 0xffffff, alpha: 0.001 });
    doorHit.x = layout.door.x;
    doorHit.y = layout.door.y;
    ctx.data.door = ctx.register({ classId: 'puzzle_exit_door', label: 'Exit', subtitle: 'The way out', sprite: doorHit });
    ctx.data.phase = 'play';
  },

  tick(ctx) {
    const p = ctx.player;
    const layout = ctx.data.layout;
    if (!p || !layout) return;
    pushOutOfSolids(p, ctx.data.prevX, solidColumns(layout, ctx.data.on));
    ctx.data.prevX = p.x;
    if (p.y < FLOOR + 4) ctx.data.reached = Math.max(ctx.data.reached, p.x);
    if (p.y > FALL_Y) {
      const cp = lastCheckpoint(layout.checkpoints, Math.min(ctx.data.reached, PIT.x1 - 40));
      ctx.place(cp.x, FLOOR);
      ctx.data.falls = (ctx.data.falls || 0) + 1;
      ctx.floatText(cp.x, FLOOR - 90, 'Whoops!', '#ffffff');
    }
    for (const spr of Object.values(ctx.data.blockSprites || {})) {
      if (!spr || spr.destroyed) continue;
      spr.alpha += (spr.targetAlpha - spr.alpha) * 0.2;
      spr.visible = spr.alpha > 0.03;
    }
    takeQuoins(ctx, ctx.data.quoins || []);
  },

  verbs(ctx, target) {
    if (target.puzzleSwitch) return [{ id: 'press', label: 'Press', enabled: true, tooltip: 'Press' }];
    if (target === ctx.data.crab) return [{ id: 'talk_to', label: 'Talk to', enabled: true, tooltip: 'Say hello' }];
    if (target === ctx.data.door) return [{ id: 'enter', label: 'Enter', enabled: true, tooltip: 'Leave through the door' }];
    return [];
  },

  runVerb(ctx, target, verbId) {
    if (target.puzzleSwitch && verbId === 'press') {
      press(ctx, target.puzzleSwitch.id);
      return true;
    }
    if (target === ctx.data.crab && verbId === 'talk_to') {
      ctx.say(target, `Hey! Hey! ${ctx.engine.pc?.label || 'Ur'}! I want to listen to some tunes! What do you have for me?`, 5000);
      return true;
    }
    if (target === ctx.data.door && verbId === 'enter') {
      exit(ctx);
      return true;
    }
    return false;
  },

  objective(ctx) {
    const got = (ctx.data.quoins || []).filter((q) => q.taken).length;
    return {
      text: ctx.data.phase === 'done' ? 'You found the exit!' : 'Press the coloured switches to clear a path to the exit.',
      stats: [['quoins', `${got}/${(ctx.data.quoins || []).length}`], ['switches pressed', ctx.data.presses?.length || 0]],
    };
  },

  onLeave(ctx, outcome) {
    return { leaveFlag: 'instance_exit_via_door' };
  },

  publish(ctx) {
    ctx.setData('cuOn', [...(ctx.data.on || [])].sort().join(','));
    ctx.setData('cuPresses', (ctx.data.presses || []).join(','));
    ctx.setData('cuQuoins', String((ctx.data.quoins || []).filter((q) => q.taken).length));
    ctx.setData('cuFalls', String(ctx.data.falls || 0));
    ctx.setData('cuPhase', ctx.data.phase || '');
    ctx.setData('cuReached', String(Math.round(ctx.data.reached || 0)));
  },

  async autoplay(ctx, mode) {
    const layout = ctx.data.layout;
    const go = async (x, y = FLOOR) => {
      ctx.place(x, y);
      await ctx.wait(450);
    };
    const pressAt = async (id) => {
      const sw = layout.switches.find((s) => s.id === id);
      await go(sw.x - 30, sw.y);
      const t = ctx.data.switches.find((s) => s.id === id)?.target;
      ctx.engine.interactables.includes(t) && room.runVerb(ctx, t, 'press');
      await ctx.wait(500);
    };
    await ctx.wait(500);
    // Sweep the reachable quoins on the way.
    await go(330); await go(420);
    await pressAt('red');
    await go(760);
    if (mode === 'wrong') {
      await pressAt('green_a'); // the steps vanish
      await go(1040);
      ctx.setData('cuAutoplay', 'wrong');
      return 'wrong';
    }
    await go(1040, FLOOR - 2 * CELL); await go(1120, FLOOR - 3 * CELL); await go(1230, FLOOR - 3 * CELL);
    await pressAt('blue');
    await go(1620); await go(1700);
    await pressAt('green_b');
    if (mode === 'bridge') {
      await pressAt('orange');
      ctx.setData('cuAutoplay', 'bridge');
      return 'bridge';
    }
    await pressAt('purple');
    await go(2300); await go(2460); await go(2620); await go(3000); await go(3100);
    room.runVerb(ctx, ctx.data.crab, 'talk_to');
    await ctx.wait(800);
    if (mode === 'door') return 'door';
    await go(layout.door.x - 20);
    room.runVerb(ctx, ctx.data.door, 'enter');
    return 'exited';
  },
};

function press(ctx, id) {
  const layout = ctx.data.layout;
  const sw = layout.switches.find((s) => s.id === id);
  if (!sw) return;
  const on = ctx.data.on;
  if (on.has(sw.color)) on.delete(sw.color);
  else on.add(sw.color);
  ctx.data.presses.push(id);
  for (const s of ctx.data.switches) if (s.color === sw.color) s.set(!on.has(sw.color));
  ctx.sound('CLICK_SUCCESS', { volume: 0.5 });
  ctx.floatText(sw.x, sw.y - 90, `${FELT[sw.color].label} blocks ${on.has(sw.color) ? 'back' : 'gone'}!`, FELT[sw.color].css);
  syncPlatforms(ctx);
  drawBlocks(ctx);
}

async function exit(ctx) {
  if (ctx.data.phase === 'done') return;
  if (!ctx.near(ctx.data.layout.door.x, ctx.data.layout.door.y, 140)) {
    ctx.toast('Walk up to the door first.', 1800);
    return;
  }
  ctx.data.phase = 'done';
  ctx.progress('instance_exit_via_door');
  ctx.solve();
  ctx.sound('DOOR_OPEN', { volume: 0.6 });
  await ctx.wait(400);
  await finale(ctx);
  ctx.leave({ transition: ctx.fx() });
}

/**
 * Where Keita's drawing sits on the finale page. The Snaps (PHVE3663QE222O9_120458,
 * PCRDMHR3NDO1FVT_118277, 640x354) show it from ~5% under the top of the view down to the felt
 * floor the avatar stands on, its centre at ~60% of the width.
 * @param {number} floorTop view y of the felt floor's top edge (the avatar's feet)
 * @returns {{ scale: number, x: number, bottom: number }} view px (anchor bottom-centre)
 */
export function finaleArtPlacement(viewW, viewH, floorTop, artH) {
  const top = Math.round(viewH * 0.04);
  const scale = (floorTop - top) / artH;
  return { scale, x: Math.round(viewW * 0.58), bottom: floorTop + Math.round(4 * scale) };
}

/**
 * The finale page (Snaps PHVE3663QE222O9_120458, PCRDMHR3NDO1FVT_118277): the white void, the
 * charcoal felt floor and Keita's drawing, shown over the view for FINALE_MS once the door opens.
 */
async function finale(ctx) {
  const { PIXI } = ctx;
  const cam = ctx.engine.camera;
  if (!cam || !PIXI) return;
  const page = new PIXI.Container();
  const bg = new PIXI.Graphics();
  bg.rect(-40, -40, cam.w + 80, cam.h + 80).fill(0xffffff);
  page.addChild(bg);
  // The felt floor's top is the avatar's feet, so it stands on the page as in the Snaps.
  const player = ctx.engine.player;
  const feet = player ? player.y - cam.y : NaN;
  const floorTop = Number.isFinite(feet) ? Math.max(cam.h * 0.6, Math.min(cam.h - 48, Math.round(feet))) : cam.h - 48;
  const fl = feltRect(PIXI, cam.w + 80, cam.h - floorTop + 80, FELT_FLOOR);
  fl.x = -40;
  fl.y = floorTop;
  page.addChild(fl);
  const [file, w, h] = COLOR_UNBLOCKING_FILES[FINALE_ART];
  const art = new PIXI.Sprite(textureFromUrl(`${ART}${file}`));
  // As in the Snaps: the drawing fills the view from just under its top edge down to the
  // floor, a little right of centre; the room card steps aside while the page is up.
  const { scale, x, bottom } = finaleArtPlacement(cam.w, cam.h, floorTop, h);
  art.anchor.set(0.5, 1);
  art.scale.set(scale);
  art.x = x;
  art.y = bottom;
  page.addChild(art);
  ctx.coverHud?.(true);
  page.alpha = 0;
  const follow = () => {
    const c = ctx.engine.camera;
    page.x = c.x;
    page.y = c.y;
  };
  follow();
  ctx.add(page, 900);
  // The crab steps out of the picture (and any line it was saying goes with its sprite); the
  // door's Enter prompt goes too, and the avatar stays in front of the page.
  const crab = ctx.data.crab;
  if (crab) {
    ctx.unregister(crab);
    if (crab.sprite && !crab.sprite.destroyed) crab.sprite.destroy();
    ctx.data.crab = null;
  }
  if (ctx.data.door) {
    ctx.unregister(ctx.data.door);
    ctx.data.door = null;
  }
  const playerZ = player ? player.zIndex : null;
  if (player) player.zIndex = 901;
  ctx.setData('cuFinale', `${FINALE_ART}:${Math.round(w * scale)}x${Math.round(h * scale)}`);
  const t0 = Date.now();
  while (Date.now() - t0 < FINALE_MS && !page.destroyed) {
    follow();
    page.alpha = Math.min(1, (Date.now() - t0) / 500);
    await ctx.wait(50);
  }
  if (player && !player.destroyed) player.zIndex = playerZ;
}

export const COLOR_ROOM_FACTS = Object.freeze({ W, H, FLOOR, CELL, PIT, JUMP_RISE });
