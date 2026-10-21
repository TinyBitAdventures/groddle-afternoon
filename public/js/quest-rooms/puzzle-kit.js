/**
 * Helpers shared by the colour puzzle rooms (Color Unblocking, Walk Toward
 * the Light, Radiant Glare): solid blocks the avatar cannot walk through,
 * pit recovery to the last checkpoint passed, quoins paid through the normal
 * economy, and recovered wall switches (OGA wall_switch, 33x42 lockUp /
 * lockDown statics) mounted on a colour plate.
 *
 * Geometry is world pixels, y down; a platform's y is its walking surface.
 * The remake's ordinary jump peaks at ~110 px and carries ~200 px, so the
 * rooms keep every required rise <= 100 px and every gap <= 150 px.
 */

export const JUMP_RISE = 100;
export const JUMP_GAP = 150;
export const BODY_H = 70;
export const BODY_HALF_W = 14;

export const SWITCH_ART = 'assets/sprites/quest-rooms/color_unblocking/';

export const COLORS = Object.freeze({
  red: { hex: 0xe8542c, css: '#e8542c', block: 'block_red', label: 'Red' },
  orange: { hex: 0xf5a623, css: '#f5a623', block: 'block_orange', label: 'Orange' },
  purple: { hex: 0x8d5aa6, css: '#8d5aa6', block: 'block_purple', label: 'Purple' },
  pink: { hex: 0xf7b6a1, css: '#f7b6a1', block: 'block_pink', label: 'Pink' },
  blue: { hex: 0x2f86c4, css: '#2f86c4', block: 'block_deepblue', label: 'Blue' },
  green: { hex: 0x5aa61e, css: '#5aa61e', block: 'block_deepgreen', label: 'Green' },
  sky: { hex: 0x7fd0e3, css: '#7fd0e3', block: 'block_lightblue', label: 'Sky' },
  lime: { hex: 0x9ad43a, css: '#9ad43a', block: 'block_lightgreen', label: 'Lime' },
});

/**
 * Keep the avatar out of solid rectangles ({ x1, x2, yTop, yBot }) after a
 * physics step: whichever side it came from, it is put back on that side.
 * Returns true when it was pushed.
 */
export function pushOutOfSolids(player, prevX, rects) {
  if (!player) return false;
  let pushed = false;
  for (const r of rects) {
    if (player.y <= r.yTop + 2 || player.y - BODY_H >= r.yBot) continue;
    if (player.x <= r.x1 - BODY_HALF_W || player.x >= r.x2 + BODY_HALF_W) continue;
    const fromLeft = prevX <= (r.x1 + r.x2) / 2;
    player.x = fromLeft ? r.x1 - BODY_HALF_W : r.x2 + BODY_HALF_W;
    player.vx = 0;
    pushed = true;
  }
  return pushed;
}

/** The furthest checkpoint the avatar has reached (by x). */
export function lastCheckpoint(checkpoints, reachedX) {
  let best = checkpoints[0];
  for (const c of checkpoints) if (c.x <= reachedX && c.x >= best.x) best = c;
  return best;
}

/** Quoin pickups: spawn sprites for a list of { x, y, type }. */
export function spawnQuoins(ctx, list) {
  return list.map((q, i) => {
    const spr = ctx.add(ctx.quoinSprite(q.type || 'xp', q.x, q.y, 0.7), 30);
    return { ...q, id: q.id || `q${i}`, spr, taken: false };
  });
}

/** Collect any quoin the avatar touches; returns how many were taken. */
export function takeQuoins(ctx, quoins) {
  const p = ctx.player;
  if (!p) return 0;
  let n = 0;
  const t = Date.now() / 1000;
  for (const q of quoins) {
    if (q.taken) continue;
    if (q.spr && !q.spr.destroyed) q.spr.y = q.y + Math.sin(t * 2.6 + q.x / 70) * 5;
    if (Math.abs(p.x - q.x) < 30 && p.y - BODY_H < q.y + 16 && p.y + 6 > q.y - 16) {
      q.taken = true;
      if (q.spr) q.spr.visible = false;
      ctx.collectQuoin(q.type || 'xp', q.x, q.y);
      n += 1;
    }
  }
  return n;
}

/**
 * A recovered wall switch on a coloured plate, registered as a target with
 * the room's verbs. `on` true shows lockDown.
 */
export function makeSwitch(ctx, { id, color, x, y, on = false, label }) {
  const { PIXI } = ctx;
  const c = new PIXI.Container();
  const plate = new PIXI.Graphics();
  const col = COLORS[color]?.hex ?? 0xffffff;
  plate.beginFill(0x3b3f45, 0.35);
  plate.drawRoundedRect(-27, -64, 54, 62, 12);
  plate.endFill();
  plate.beginFill(col);
  plate.lineStyle(3, 0xffffff, 0.9);
  plate.drawRoundedRect(-24, -66, 48, 58, 11);
  plate.endFill();
  c.addChild(plate);
  const up = PIXI.Sprite.from(`${SWITCH_ART}wall_switch_lockUp.png`);
  const down = PIXI.Sprite.from(`${SWITCH_ART}wall_switch_lockDown.png`);
  for (const s of [up, down]) {
    s.anchor.set(0.5, 0.5);
    s.scale.set(1.15);
    s.y = -37;
    c.addChild(s);
  }
  // A short post so the plate stands on the ground.
  const post = new PIXI.Graphics();
  post.beginFill(0x6b6f75);
  post.drawRect(-4, -8, 8, 8);
  post.endFill();
  c.addChild(post);
  c.x = x;
  c.y = y;
  const target = ctx.register({
    classId: 'wall_switch',
    label: label || `${COLORS[color]?.label || 'Colour'} Switch`,
    subtitle: 'Press',
    sprite: c,
    puzzleSwitch: { id, color },
  });
  const set = (value) => {
    up.visible = !value;
    down.visible = Boolean(value);
  };
  set(on);
  return { id, color, x, y, target, set, container: c };
}

/** A soft vertical light beam (OGA light_beam 161x382, tinted). */
export function beamSprite(ctx, x, y, color, height = 300) {
  const spr = ctx.PIXI.Sprite.from(`${SWITCH_ART}light_beam.png`);
  spr.anchor.set(0.5, 1);
  spr.x = x;
  spr.y = y;
  spr.scale.set(0.8, height / 382);
  spr.tint = color;
  spr.alpha = 0.85;
  return spr;
}
