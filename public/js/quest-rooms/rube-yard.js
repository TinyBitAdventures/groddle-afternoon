/**
 * The Wrizzards and The Rube (quests/rube_spy.js).
 *
 * Source: onStarted creates instance `the_wrizzards_and_the_rube` from
 * template LIFJM2QDA093KA6 (hub 135, "The Wrizzards and the Rube" in
 * inc_data_maps_prod.js) for 5 * 60 seconds at (0, -132). The quest is one
 * counter, `wrizzards_found` x10 ("Help The Rube by finding and clicking all
 * the Wrizzards hiding in his yard"); onComplete_custom exits the instance and
 * leaving early fails it. Rewards 500 iMG, 500 currants, 100 mood.
 *
 * Neither the yard's geometry nor any Wrizzard art or item script survives
 * (no items/*wrizzard*), so this is a reconstruction: The Rube's yard of
 * recovered CC0 clutter (crates, barrels, a log pile, fence, bush, his house,
 * a heap of tradeable odds and ends) with ten Wrizzards, the offer's
 * "jar of Wrizzards" drawn as the recovered lizard decos wearing a clean
 * vector wizard hat, peeking out from behind things. Click one to catch it;
 * it hops into The Rube's empty jar. The Rube uses his recovered talk and
 * offer_accept sheets (108x154 cells, facing left).
 */

import { frameTexture, isLoaded, onLoaded, sourceFromUrl } from '../textures.js';

const W = 1900;
const H = 760;
const FLOOR = 620;
export const WRIZZARDS_NEEDED = 10;
const RUBE_DIR = 'assets/sprites/rube/';
const CELL = { w: 108, h: 154 };

/**
 * Hiding places: the cover deco, and the Wrizzard's resting (hidden) and
 * peeking offsets. `under: true` draws the Wrizzard behind the cover.
 */
export const HIDING_SPOTS = Object.freeze([
  { id: 'crate_top', cover: 'crate_1', x: 380, y: FLOOR, scale: 0.62, wx: 392, wy: FLOOR - 112, peek: 24, lizard: 'lizard1', under: true },
  { id: 'barrel', cover: 'barrel_1', x: 560, y: FLOOR, scale: 0.6, wx: 560, wy: FLOOR - 104, peek: 26, lizard: 'lizard1', under: true },
  { id: 'jar_shelf', cover: 'crate_2', x: 720, y: FLOOR, scale: 0.5, wx: 742, wy: FLOOR - 82, peek: 20, lizard: 'lizard2', under: true },
  { id: 'logs', cover: 'log_pile2', x: 930, y: FLOOR + 6, scale: 0.55, wx: 990, wy: FLOOR - 70, peek: 22, lizard: 'lizard2', under: true },
  { id: 'fence', cover: 'fence_wood_1', x: 1140, y: FLOOR + 4, scale: 0.42, wx: 1150, wy: FLOOR - 136, peek: 30, lizard: 'lizard1', under: true },
  { id: 'bush', cover: 'heights_bush_1', x: 1320, y: FLOOR + 8, scale: 0.6, wx: 1290, wy: FLOOR - 88, peek: 26, lizard: 'lizard2', under: true },
  { id: 'box', cover: 'k04_box_01', x: 1500, y: FLOOR, scale: 0.2, wx: 1530, wy: FLOOR - 118, peek: 22, lizard: 'lizard1', under: true },
  { id: 'stash', cover: null, x: 1665, y: FLOOR, scale: 1, wx: 1668, wy: FLOOR - 44, peek: 26, lizard: 'lizard2', under: true },
  // The camera shows ~300 px above the floor and the room card covers its top
  // ~140, so each Wrizzard's middle stays within ~160 px (the eave, the trunk).
  { id: 'roof', cover: null, x: 0, y: 0, scale: 1, wx: 350, wy: FLOOR - 120, peek: 24, lizard: 'lizard1', under: true },
  { id: 'tree', cover: null, x: 0, y: 0, scale: 1, wx: 1790, wy: FLOOR - 110, peek: 22, lizard: 'lizard1', under: false },
]);

/** The odds and ends of The Rube's stash (recovered item icons). */
const STASH = ['plank', 'meat', 'cherry', 'apple', 'bun', 'paper', 'pumpkin', 'lemburger', 'spinach', 'fuel_cell',
  'cloud_11_smoothie', 'rubeweed', 'tinkertool', 'pick', 'hoe', 'watering_can', 'plain_bubble', 'egg_plain', 'grain', 'sammich'];

function rubeFrames(PIXI, file, cols, count) {
  const base = sourceFromUrl(`${RUBE_DIR}${file}`);
  const frames = [];
  const cut = () => {
    frames.length = 0;
    for (let i = 0; i < count; i++) {
      frames.push(frameTexture(base, new PIXI.Rectangle((i % cols) * CELL.w, Math.floor(i / cols) * CELL.h, CELL.w, CELL.h)));
    }
  };
  if (isLoaded(base)) cut();
  else onLoaded(base, cut);
  return { base, frames };
}

/** A Wrizzard: a recovered lizard deco in a clean vector wizard hat. */
function makeWrizzard(PIXI, kit, spot) {
  const c = new PIXI.Container();
  const side = spot.lizard === 'lizard2';
  const body = kit.deco(PIXI, spot.lizard, 0, 0, { scale: side ? 0.42 : 0.46, flip: spot.id === 'bush' || spot.id === 'logs' });
  c.addChild(body);
  const hat = new PIXI.Graphics();
  const hx = side ? (spot.id === 'bush' || spot.id === 'logs' ? 14 : -14) : 2;
  const hy = side ? -30 : -44;
  hat.moveTo(hx - 13, hy);
  hat.lineTo(hx + 3, hy - 30);
  hat.lineTo(hx + 13, hy);
  hat.closePath();
  hat.fill(0x5b3c9e);
  hat.ellipse(hx, hy, 17, 4.5).fill(0x7a58c4);
  for (const [sx, sy] of [[hx - 3, hy - 9], [hx + 3, hy - 18], [hx + 6, hy - 5]]) {
    // Pixi 7's bundle had no drawStar (graphics-extras), so these were always dots.
    hat.circle(sx, sy, 1.6);
  }
  hat.fill(0xffe066);
  c.addChild(hat);
  c.hitArea = new PIXI.Rectangle(-32, -82, 64, 88);
  c.eventMode = 'static';
  c.cursor = 'pointer';
  return c;
}

export const room = {
  id: 'rube_yard',
  title: 'The Wrizzards and The Rube',
  kicker: 'The Rube’s yard',
  icon: 'assets/sprites/icons/npc_rube.png',
  theme: 'warm',
  hubName: 'The Rube’s yard',
  durationMs: 5 * 60 * 1000,
  leaveText: 'Leave The Rube’s yard? The Wrizzards will stay hidden and you will have to start over.',

  build(ctx) {
    const { PIXI, kit } = ctx;
    const root = kit.sceneRoot(PIXI, W, H);
    const sky = root.layer(0, 0);
    sky.addChild(kit.gradient(PIXI, [[0, '#9ed8f0'], [0.6, '#e7f3e6'], [1, '#f6e9c8']], 960, 620));
    const far = root.layer(0.2, 1);
    for (let i = 0; i < 4; i++) far.addChild(kit.deco(PIXI, 'pinehills_distant_1', 300 + i * 700, 560, { scale: 0.42, alpha: 0.75 }));
    const mid = root.layer(0.5, 2);
    for (let i = 0; i < 5; i++) mid.addChild(kit.deco(PIXI, 'transition_hill_1', 200 + i * 640, 600, { scale: 0.45 }));
    const back = root.layer(1, 3);
    const g = new PIXI.Graphics();
    g.rect(0, FLOOR - 18, W, 40).fill(0x8bbd57);
    g.rect(0, FLOOR + 14, W, H - FLOOR).fill(0x6a4329);
    for (let x = 30; x < W; x += 140) g.ellipse(x, FLOOR + 60 + (x % 3) * 18, 34, 7);
    g.fill(0x5c3a23);
    back.addChild(g);
    // The Rube's house and his tree.
    back.addChild(kit.deco(PIXI, 'house_back_medium01', 230, FLOOR + 2, { scale: 0.62 }));
    back.addChild(kit.deco(PIXI, 'tree_deciduous3', 1810, FLOOR + 4, { scale: 0.36 }));
    for (let x = 60; x < W; x += 220) back.addChild(kit.deco(PIXI, 'groddle_grass_1', x, FLOOR + 4, { scale: 0.45, flip: x % 440 === 60 }));
    return {
      label: 'The Wrizzards and The Rube',
      width: W,
      height: H,
      background: root,
      platforms: [kit.plat(0, FLOOR, W, FLOOR, 'invisible', { id: 'yard_floor' })],
      spawn: { x: 520, y: FLOOR },
    };
  },

  enter(ctx) {
    const { PIXI, kit } = ctx;
    ctx.data.found = ctx.data.found || [];
    ctx.data.wrizzards = [];
    // The Rube, by his house, with the empty jar the Wrizzards hop into.
    const talk = rubeFrames(PIXI, 'rube_talk.webp', 7, 20);
    const cheer = rubeFrames(PIXI, 'rube_offer_accept.webp', 9, 70);
    const rube = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
    rube.anchor.set(0.5, 1);
    rube.x = 470;
    rube.y = FLOOR + 4;
    rube.scale.set(-0.95, 0.95); // the sheets face left; turn him toward the yard
    rube.animationSpeed = 24 / 60;
    const play = (set, loop = true) => {
      const start = () => {
        if (!set.frames.length || rube.destroyed) return;
        rube.textures = set.frames;
        rube.loop = loop;
        rube.gotoAndPlay(0);
      };
      if (set.frames.length) start();
      else onLoaded(set.base, () => setTimeout(start, 0));
    };
    play(talk);
    ctx.data.rubePlay = (which) => play(which === 'cheer' ? cheer : talk, which !== 'cheer');
    ctx.data.rube = ctx.register({
      classId: 'npc_rube',
      label: 'The Rube',
      subtitle: 'Lost a jar of Wrizzards',
      sprite: rube,
    });
    const jar = ctx.add(kit.deco(PIXI, 'jar4_empty', 520, FLOOR + 2, { scale: 0.62 }), 31);
    ctx.data.jar = jar;
    ctx.data.jarCount = ctx.add(kit.label(PIXI, '', 520, FLOOR - 74, { size: 16, fill: 0x5b3c9e, stroke: { color: 0xffffff, width: 4 } }), 33);
    // The stash heap.
    STASH.forEach((cls, i) => {
      const row = Math.floor(i / 7);
      const x = 1610 + (i % 7) * 18 + row * 9;
      const y = FLOOR + 4 - row * 20 - (i % 2) * 4;
      ctx.add(kit.icon(PIXI, cls, x, y, { scale: 0.85, rotation: ((i * 37) % 9 - 4) / 18 }), 24 + row);
    });
    for (const spot of HIDING_SPOTS) {
      const caught = ctx.data.found.includes(spot.id);
      const w = makeWrizzard(PIXI, kit, spot);
      w.x = spot.wx;
      w.y = spot.wy + spot.peek;
      w.zIndex = spot.under ? 22 : 30;
      w.visible = !caught;
      w.on('pointertap', () => catchWrizzard(ctx, spot.id));
      ctx.add(w, w.zIndex);
      if (spot.cover) ctx.add(kit.deco(PIXI, spot.cover, spot.x, spot.y, { scale: spot.scale }), 26);
      ctx.data.wrizzards.push({ spot, sprite: w, phase: kit.hash01(spot.id) * Math.PI * 2 });
    }
    updateJar(ctx);
    if (!ctx.data.greeted) {
      ctx.data.greeted = true;
      setTimeout(() => ctx.say(ctx.data.rube, 'Help a Rube out, will ya?', 4200), 900);
    }
  },

  tick(ctx) {
    const t = Date.now() / 1000;
    for (const w of ctx.data.wrizzards || []) {
      if (w.sprite.destroyed) continue;
      if (w.hop) {
        const k = Math.min(1, (Date.now() - w.hop.at) / 650);
        w.sprite.x = w.hop.x0 + (w.hop.x1 - w.hop.x0) * k;
        w.sprite.y = w.hop.y0 + (w.hop.y1 - w.hop.y0) * k - Math.sin(k * Math.PI) * 120;
        w.sprite.scale.set(1 - 0.6 * k);
        if (k >= 1) {
          w.sprite.visible = false;
          w.hop = null;
        }
        continue;
      }
      // Peek out for a moment, then duck back behind the cover.
      const s = Math.sin(t * 1.3 + w.phase);
      const up = Math.max(0, (s - 0.35) / 0.65);
      w.sprite.y = w.spot.wy + w.spot.peek * (1 - up);
      w.sprite.rotation = Math.sin(t * 4 + w.phase) * 0.05 * up;
    }
  },

  verbs(ctx, target) {
    if (target === ctx.data.rube) return [{ id: 'talk_to', label: 'Talk to', enabled: true, tooltip: 'Chat with The Rube' }];
    return [];
  },

  runVerb(ctx, target, verbId) {
    if (target !== ctx.data.rube || verbId !== 'talk_to') return false;
    const left = WRIZZARDS_NEEDED - (ctx.data.found?.length || 0);
    ctx.say(target, left > 0 ? 'Help a Rube out, will ya?' : 'You got them all?! Thank ya, thank ya!', 3600);
    return true;
  },

  objective(ctx) {
    const n = ctx.data.found?.length || 0;
    return {
      text: n >= WRIZZARDS_NEEDED ? 'You got them all!' : 'Find and click the Wrizzards hiding in The Rube’s yard.',
      stats: [['Wrizzards found', `${n}/${WRIZZARDS_NEEDED}`]],
    };
  },

  onLeave() {
    return { leaveFlag: false };
  },

  publish(ctx) {
    ctx.setData('wrizzardsFound', String(ctx.data.found?.length || 0));
    ctx.setData('wrizzardSpots', String(HIDING_SPOTS.length));
    ctx.setData('wrizzardArt', 'recovered-lizards-vector-hats');
  },

  async autoplay(ctx, mode) {
    await ctx.wait(1200);
    const stop = mode === 'half' ? 5 : WRIZZARDS_NEEDED;
    for (const spot of HIDING_SPOTS) {
      if ((ctx.data.found?.length || 0) >= stop) break;
      ctx.place(spot.wx, FLOOR);
      await ctx.wait(500);
      catchWrizzard(ctx, spot.id);
      await ctx.wait(700);
    }
    if (mode === 'half') return 'half';
    for (let i = 0; i < 80 && ctx.run; i++) {
      if (ctx.engine.param('questautoplay') && document.querySelector('#award-screen:not([hidden]) button')) {
        document.querySelector('#award-screen:not([hidden]) button')?.click();
      }
      await ctx.wait(400);
    }
    return 'complete';
  },
};

function updateJar(ctx) {
  const n = ctx.data.found?.length || 0;
  if (ctx.data.jarCount && !ctx.data.jarCount.destroyed) ctx.data.jarCount.text = n ? `${n}` : '';
}

async function catchWrizzard(ctx, spotId) {
  if (!ctx.run || ctx.data.found.includes(spotId)) return false;
  const w = ctx.data.wrizzards.find((row) => row.spot.id === spotId);
  if (!w || w.hop) return false;
  ctx.data.found.push(spotId);
  ctx.sound('CLICK_SUCCESS', { volume: 0.5 });
  ctx.floatText(w.sprite.x, w.sprite.y - 70, 'Wrizzard!', '#7a58c4');
  w.hop = { at: Date.now(), x0: w.sprite.x, y0: w.sprite.y, x1: 520, y1: FLOOR - 30 };
  w.sprite.zIndex = 40;
  w.sprite.eventMode = 'none';
  ctx.progress('wrizzards_found', 1);
  updateJar(ctx);
  ctx.activity(`You found a Wrizzard! (${ctx.data.found.length}/${WRIZZARDS_NEEDED})`);
  if (ctx.data.found.length >= WRIZZARDS_NEEDED) {
    ctx.solve();
    ctx.data.rubePlay?.('cheer');
    ctx.say(ctx.data.rube, 'You got them all?! Thank ya, thank ya!', 4000);
    await ctx.wait(1600);
    await ctx.turnIn();
    ctx.leave({ transition: ctx.fx() });
  }
  return true;
}
