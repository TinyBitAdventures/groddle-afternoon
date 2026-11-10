/**
 * A Chicken scared by a bump: pure rules. No Pixi, no DOM;
 * js/features/chicken-scare-feature.js binds them to the world.
 *
 * Source: glitch-GameServerJS items/npc_chicken.js (CC0), onPlayerCollision 1299-1343:
 *
 *   is_announcement chickens do nothing (1301; none in the remake);
 *   a rooked Chicken runs rookedCollision instead (1302-1305);
 *   the player's hatched egg is handed over and it returns (1307-1312; the remake hatches by
 *   itself, features/animal-husbandry-feature.js watchIncubations);
 *   "No scaring when incubating" (1314-1318);
 *   a conversation it can offer is offered and it returns (1320-1326);
 *   then "Did we get scared?": chance 0.75, 0.25 with Animal Kinship I (1328-1332; 1 on
 *   LM41026L4057N, 1334, a street of the developers' own map, inc_data_maps_dev.js 4875, that
 *   the game never had), and on a hit this.fly(), this.sendBubble('Squawk!', 1*1000),
 *   achievements_increment('chickens', 'scared') (1336-1340). No achievement reads that counter.
 *
 * There is no cooldown and no per-player limit in the file: every collision rolls again. A
 * collision is the player coming into the item's hit box; leaving it is another call
 * (onPlayerLeavingCollisionArea: items/cteb.js 73-85 names the two "onEnter" and "onExit"), so
 * one touch is one roll, and the next roll needs the player to step clear and come back. The
 * player's move runs the test (main.js doXYMove 1588-1606, pc.apiSetXY).
 *
 * The bubble goes to everyone on the street (sendBubble with no pc: location.apiSendMsg,
 * items/item.js 562-603) and stays up one second.
 *
 * fly() 820-882: nothing when rooked, sad or waiting on a player (821-823; the Squawk and the
 * counter above still happen); vx = randInt(-100, 100), vy = -200, facing by vx (857-870); a
 * Chicken bound to a Magic Chicken Stick gets vx / 2 and vy / 3 (872-876); apiKickTheChicken(vx,
 * vy) 878; state 'flying', and 2 s later 'flying_no_feathers' if it is still up (881, onInTheAir
 * 1113-1119). onPlatformLanding 1279-1297: state 'land', startMoving 1 s later. No sound key.
 *
 * Not in the source (Tiny Speck's engine is not public):
 * - The hit box. npc_chicken.js sets none (no apiSetHitBox; item.js 1560 only restores one that
 *   was set). As for quoins (js/quoins.js QUOIN_TOUCH) the box is the bird the player sees: the
 *   art's own bounds, 53 x 67 (npc_chicken.js getAssetInfo 2556, position w and h), at the scale
 *   the remake draws it, against the player's box, 59 x 112 over the feet (players/player.js
 *   62-64). Footage W2m8syZCKXU 151.9-152.0 s: no Squawk with the two about 85 px apart, Squawk
 *   on the next frame with them overlapping.
 * - The arc. apiKickTheChicken's gravity is in the engine. Footage W2m8syZCKXU 152.0-154.0 s: a
 *   bumped Chicken climbs about 170 px in 1.6 to 2 s, drifting sideways at a steady speed, and
 *   lands on a pot. 100 px/s2 puts the top of the arc 200 px up at 2 s, the moment the source
 *   swaps 'flying' for 'flying_no_feathers'.
 */

export const CHICKEN_CLASS = 'npc_chicken';

/** onPlayerCollision 1328-1340 and fly 857-880. */
export const CHICKEN_SCARE = Object.freeze({
  chance: 0.75,
  chanceSkilled: 0.25,
  calmSkill: 'animalkinship_1',
  line: 'Squawk!',
  lineMs: 1000,
  counter: 'chickens:scared',
  kickVy: -200, // px/s
  kickVxMin: -100,
  kickVxMax: 100,
  /** With move_limits (a Magic Chicken Stick): vx / 2, vy / 3. */
  limitedVx: 2,
  limitedVy: 3,
  /** onInTheAir: apiSetTimer('onInTheAir', 2000). */
  noFeathersMs: 2000,
  /** onPlatformLanding: apiSetTimer('startMoving', 1 * 1000). */
  landedResumeMs: 1000,
  /** px/s2, from footage (see the header): not in the source. */
  gravity: 100,
});

/** The bird's art bounds (getAssetInfo position w, h) and the player's box (player.js 62-64). */
export const CHICKEN_TOUCH = Object.freeze({ birdW: 53, birdH: 67, playerW: 59, playerH: 112 });

/**
 * The flight clips: Tiny Speck's OGA npc_chicken sheets (CC0), 148 x 110 cells, every cell drawn
 * (flying and flying_no_feathers 888 x 770, 6 x 7 = 42 frames; land 740 x 550, 5 x 5 = 25), at
 * the SWF's 30 fps. Their 3x twins come from npc_chicken.swf (tools/vector-sprites/animals.json).
 */
export const CHICKEN_SCARE_SHEETS = Object.freeze({
  flying: Object.freeze({ path: 'assets/sprites/animals/npc_chicken_flying.webp', fw: 148, fh: 110, cols: 6, frames: 42 }),
  flying_no_feathers: Object.freeze({ path: 'assets/sprites/animals/npc_chicken_flying_no_feathers.webp', fw: 148, fh: 110, cols: 6, frames: 42 }),
  land: Object.freeze({ path: 'assets/sprites/animals/npc_chicken_land.webp', fw: 148, fh: 110, cols: 5, frames: 25 }),
});
export const CHICKEN_SCARE_FPS = 30;

/**
 * Online a street's Chickens walk a path every player shares, so a scared one cannot leave it:
 * it hops where it is, as a bumped Heli Kitty does there (features/heli-kitties-feature.js).
 * The remake's own stand-in, not the source's flight.
 */
export const CHICKEN_HOP = Object.freeze({ ms: 800, px: 60 });

export function randInt(min, max, rng = Math.random) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Whether the player's box touches the Chicken's. Both stand on their (x, y): the bottom
 * centre. `scale` is the avatar's (a street's pc_scale), `birdScale` the scale the Chicken is drawn at.
 */
export function chickenTouches(chicken, player, { scale = 1, birdScale = 1 } = {}) {
  if (!chicken || !player) return false;
  const cx = Number(chicken.x);
  const cy = Number(chicken.y);
  const px = Number(player.x);
  const py = Number(player.y);
  if (![cx, cy, px, py].every(Number.isFinite)) return false;
  const s = scale > 0 ? scale : 1;
  const k = birdScale > 0 ? birdScale : 1;
  const birdW = CHICKEN_TOUCH.birdW * k;
  const birdH = CHICKEN_TOUCH.birdH * k;
  const playerW = CHICKEN_TOUCH.playerW * s;
  const playerH = CHICKEN_TOUCH.playerH * s;
  if (Math.abs(px - cx) >= (birdW + playerW) / 2) return false;
  // Boxes over the feet: the player's top is under the bird's feet, and its feet under the bird's top.
  return py - playerH < cy && py > cy - birdH;
}

/**
 * One collision test for one Chicken, run when the player has moved. `book` remembers who is
 * inside (a WeakMap or Map keyed by the Chicken). True only on the way in.
 */
export function enterCollision(book, key, touching) {
  const was = book.get(key) === true;
  if (touching) book.set(key, true);
  else book.delete(key);
  return Boolean(touching) && !was;
}

/** The chance a bump scares it (1328-1332). */
export function scareChance(learned = []) {
  return (learned || []).includes(CHICKEN_SCARE.calmSkill) ? CHICKEN_SCARE.chanceSkilled : CHICKEN_SCARE.chance;
}

/**
 * onPlayerCollision for one bump. ctx: { rooked, incubating, offered (a conversation was offered
 * on this collision), sad, waiting (a player is at it: its menu or a verb), learned }.
 * Returns { squawk, fly, why }: `squawk` is the bubble and the counter, `fly` the kick.
 */
export function bumpChicken(ctx = {}, rng = Math.random) {
  if (ctx.rooked) return { squawk: false, fly: false, why: 'rooked' };
  if (ctx.incubating) return { squawk: false, fly: false, why: 'incubating' };
  if (ctx.offered) return { squawk: false, fly: false, why: 'offered' };
  if (!(rng() < scareChance(ctx.learned))) return { squawk: false, fly: false, why: 'calm' };
  // fly() 821-823 returns before the kick; the bubble and the counter follow it all the same.
  if (ctx.sad) return { squawk: true, fly: false, why: 'sad' };
  if (ctx.waiting) return { squawk: true, fly: false, why: 'waiting' };
  return { squawk: true, fly: true, why: 'scared' };
}

/** fly() 857-878: the kick. `limited`: bound to a Magic Chicken Stick. Speeds in px/s. */
export function kickChicken({ x = 0, y = 0, limited = false } = {}, rng = Math.random) {
  let vx = randInt(CHICKEN_SCARE.kickVxMin, CHICKEN_SCARE.kickVxMax, rng);
  let vy = CHICKEN_SCARE.kickVy;
  const dir = vx < 0 ? 'left' : 'right';
  if (limited) {
    vx /= CHICKEN_SCARE.limitedVx;
    vy /= CHICKEN_SCARE.limitedVy;
  }
  return { x, y, vx, vy, dir, phase: 'air', clip: 'flying', ms: 0, landedMs: 0, limited: Boolean(limited) };
}

/**
 * Advance a flight by dtMs. world: { landY(x, y) -> the first floor at or under y (null: none),
 * minX, maxX }. Returns events: 'no_feathers' (2 s up, still flying), 'landed', 'done' (1 s after
 * landing: it walks on). After 'done' the flight is over (phase 'done').
 */
export function stepFlight(flight, dtMs, world = {}) {
  const events = [];
  if (!flight || flight.phase === 'done') return events;
  const dt = Math.max(0, Number(dtMs) || 0);
  if (flight.phase === 'landed') {
    flight.landedMs += dt;
    if (flight.landedMs >= CHICKEN_SCARE.landedResumeMs) {
      flight.phase = 'done';
      events.push('done');
    }
    return events;
  }
  // Short steps, so a slow frame cannot carry it through a floor.
  let left = dt;
  while (left > 0 && flight.phase === 'air') {
    const step = Math.min(left, 1000 / 60);
    left -= step;
    const s = step / 1000;
    const wasMs = flight.ms;
    flight.ms += step;
    if (wasMs < CHICKEN_SCARE.noFeathersMs && flight.ms >= CHICKEN_SCARE.noFeathersMs) {
      flight.clip = 'flying_no_feathers';
      events.push('no_feathers');
    }
    let nx = flight.x + flight.vx * s;
    if (Number.isFinite(world.minX) && nx < world.minX) { nx = world.minX; flight.vx = 0; }
    if (Number.isFinite(world.maxX) && nx > world.maxX) { nx = world.maxX; flight.vx = 0; }
    flight.vy += CHICKEN_SCARE.gravity * s;
    const ny = flight.y + flight.vy * s;
    const floor = flight.vy > 0 && typeof world.landY === 'function' ? world.landY(nx, flight.y) : null;
    flight.x = nx;
    if (floor != null && ny >= floor) {
      flight.y = floor;
      flight.vx = 0;
      flight.vy = 0;
      flight.phase = 'landed';
      flight.clip = 'land';
      flight.landedMs = 0;
      events.push('landed');
    } else {
      flight.y = ny;
    }
  }
  return events;
}

/** The online hop: how far over its feet the bird is `ms` after the bump (0 once it is over). */
export function hopLift(ms) {
  const f = Number(ms) / CHICKEN_HOP.ms;
  return f >= 0 && f < 1 ? Math.sin(Math.PI * f) * CHICKEN_HOP.px : 0;
}

/**
 * How far each way a landed Chicken can walk from x on the floor at y before the floor ends:
 * surfaceY(x, y) is the walk line near y, or null over a gap. At most `most` each way.
 */
export function landedRange(x, y, surfaceY, most = 100, stepPx = 10) {
  const reach = (dir) => {
    let at = y;
    let far = 0;
    for (let d = stepPx; d <= most; d += stepPx) {
      const next = surfaceY(x + dir * d, at);
      if (next == null) break;
      at = next;
      far = d;
    }
    return far;
  };
  return Math.max(0, Math.min(reach(-1), reach(1)));
}
