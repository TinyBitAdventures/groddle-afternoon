/**
 * Race course geometry for the seven Glitch Races.
 *
 * None of the production race streets (config_prod.js
 * shared_instances.race.locations) survive in the public locations archive,
 * so every course here is a clean reconstruction read from the supplied
 * recordings (reference-videos/raw/<id>.mp4): the same theme, direction,
 * landmarks, and finish posts, rebuilt as collision lines that the remake's
 * avatar physics can always clear. Courses are authored with a small cursor
 * builder so every jump is a measured hop from the previous ledge; the
 * builder also records the rival's route, the checkpoints, and the finish.
 *
 * Coordinates are world pixels, y down, platform y = walking surface.
 */

let nextId = 0;

class CourseBuilder {
  constructor(opts = {}) {
    this.dir = 1;
    this.cursor = { x: 0, y: 0 };
    this.platforms = [];
    this.walls = [];
    this.route = [];
    this.checkpoints = [];
    this.decor = [];
    this.props = [];
    this.finish = null;
    this.spawn = null;
    this.gravity = opts.gravity || 1;
  }

  plat(xa, ya, xb, yb, style = 'ledge', extra = {}) {
    const flip = xb < xa;
    const p = {
      id: `p${(nextId += 1)}`,
      x1: Math.round(flip ? xb : xa),
      y1: Math.round(flip ? yb : ya),
      x2: Math.round(flip ? xa : xb),
      y2: Math.round(flip ? ya : yb),
      style,
      ...extra,
    };
    this.platforms.push(p);
    this.last = p;
    return p;
  }

  node(x, y, mode = 'walk') {
    const last = this.route[this.route.length - 1];
    if (last && Math.abs(last.x - x) < 1 && Math.abs(last.y - y) < 1) return;
    this.route.push({ x: Math.round(x), y: Math.round(y), mode });
  }

  /** Starting ledge; the player spawns behind the rival's start node. */
  start(x, y, len, style = 'ledge', extra = {}) {
    const x2 = x + this.dir * len;
    this.plat(x, y, x2, y, style, extra);
    this.spawn = {
      player: { x: x + this.dir * 70, y },
      rival: { x: x + this.dir * 128, y },
    };
    this.node(x + this.dir * 128, y, 'start');
    this.cursor = { x: x2, y };
    return this;
  }

  endWalk() {
    const x = this.cursor.x - this.dir * 14;
    const y = this.last ? surfaceYAt(this.last, x, 1) : null;
    this.node(x, y == null ? this.cursor.y : y, 'walk');
  }

  run(len, style = 'ledge', extra = {}) {
    const x2 = this.cursor.x + this.dir * len;
    this.plat(this.cursor.x, this.cursor.y, x2, this.cursor.y, style, extra);
    this.cursor = { x: x2, y: this.cursor.y };
    this.endWalk();
    return this;
  }

  /** Jump `gap` px ahead (negative = overlap, straight up) onto a ledge `rise` px higher. */
  hop(gap, rise, len, style = 'ledge', extra = {}) {
    this.endWalk();
    const sx = this.cursor.x + this.dir * gap;
    const ny = this.cursor.y - rise;
    const ex = sx + this.dir * len;
    this.plat(sx, ny, ex, ny, style, extra);
    const landX = gap > 0 ? sx + this.dir * 26 : this.cursor.x + this.dir * 10;
    this.node(landX, ny, 'jump');
    this.cursor = { x: ex, y: ny };
    this.endWalk();
    return this;
  }

  /** Sloped run (stairs, ramps, slides): dy > 0 climbs. */
  stairs(dx, dy, style = 'stairs', extra = {}) {
    const x2 = this.cursor.x + this.dir * dx;
    const y2 = this.cursor.y - dy;
    this.plat(this.cursor.x, this.cursor.y, x2, y2, style, extra);
    this.cursor = { x: x2, y: y2 };
    this.endWalk();
    return this;
  }

  /** A climbable wall near the ledge end, topped by a new ledge. */
  ladder(height, topLen, style = 'ladder', topStyle = 'ledge', extra = {}) {
    const wx = this.cursor.x - this.dir * 36;
    const yTop = this.cursor.y - height;
    this.walls.push({ id: `w${(nextId += 1)}`, x: Math.round(wx), yTop: Math.round(yTop), yBot: Math.round(this.cursor.y), style });
    this.node(wx, this.cursor.y, 'walk');
    this.node(wx, yTop, 'climb');
    this.plat(wx - this.dir * 46, yTop, wx + this.dir * topLen, yTop, topStyle, extra);
    this.cursor = { x: wx + this.dir * topLen, y: yTop };
    this.endWalk();
    return this;
  }

  turn() {
    this.dir *= -1;
    return this;
  }

  checkpoint(back = 70) {
    const cp = { index: this.checkpoints.length, x: Math.round(this.cursor.x - this.dir * back), y: this.cursor.y };
    this.checkpoints.push(cp);
    return this;
  }

  finishLine(len, style = 'ledge', extra = {}) {
    this.run(len, style, extra);
    this.finish = { x: Math.round(this.cursor.x - this.dir * 110), y: this.cursor.y };
    // The rival's last node is the finish posts, not the ledge end.
    this.route[this.route.length - 1] = { x: this.finish.x, y: this.finish.y, mode: 'walk' };
    return this;
  }

  /** CC0 deco sprite (assets/decos/groddle/<name>.png), anchored bottom-centre. */
  deco(name, x, y, opts = {}) {
    this.decor.push({ name, x: Math.round(x), y: Math.round(y), ...opts });
    return this;
  }

  decoHere(name, dx = 0, dy = 0, opts = {}) {
    return this.deco(name, this.cursor.x + this.dir * dx, this.cursor.y + dy, opts);
  }

  /** Vector landmark drawn by the feature renderer. */
  prop(kind, x, y, opts = {}) {
    this.props.push({ kind, x: Math.round(x), y: Math.round(y), ...opts });
    return this;
  }

  propHere(kind, dx = 0, dy = 0, opts = {}) {
    return this.prop(kind, this.cursor.x + this.dir * dx, this.cursor.y + dy, opts);
  }

  build(def) {
    if (def.floor) {
      // A full-width floor keeps game.js resolveGround's deepest-platform
      // fallback below every gap; void/pit/lava floors respawn the racer.
      this.plat(0, def.floor.y, def.width, def.floor.y, `floor-${def.floor.kind}`, { floor: true, hazard: def.floor.kind !== 'ground' });
    }
    return Object.freeze({
      ...def,
      gravity: this.gravity,
      platforms: this.platforms,
      walls: this.walls,
      route: this.route,
      checkpoints: this.checkpoints,
      finish: this.finish,
      spawn: this.spawn,
      decor: this.decor,
      props: this.props,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Space Race (recording 6ruMDWrHNa0)                                  */
/* Black starfield, frosted glass slabs and stairs, glass block towers, */
/* pink and blue bubble domes, striped finish posts on a high slab.     */
/* Floaty low gravity; falling into space returns you to a checkpoint.  */
/* ------------------------------------------------------------------ */

function buildSpaceRace() {
  const b = new CourseBuilder({ gravity: 0.62 });
  b.start(100, 1150, 760, 'glass');
  b.prop('dome', 430, 1150, { color: 'pink', r: 92 });
  b.stairs(300, 180, 'glassStairs');
  b.run(240, 'glass');
  b.propHere('dome', 120, 0, { color: 'blue', r: 70 });
  b.hop(210, 0, 240, 'slab');
  b.hop(190, 100, 220, 'slab');
  b.checkpoint();
  b.hop(200, -180, 560, 'glass');
  b.propHere('dome', 320, 0, { color: 'yellow', r: 62 });
  b.hop(40, 110, 140, 'cube', { depth: 110 });
  b.hop(-10, 110, 140, 'cube', { depth: 220 });
  b.hop(-10, 110, 190, 'cube', { depth: 330 });
  b.propHere('dome', 95, 0, { color: 'blue', r: 56 });
  b.hop(210, 60, 200, 'slab');
  b.hop(230, 0, 200, 'slab');
  b.checkpoint();
  b.hop(220, -200, 620, 'glass');
  b.propHere('dome', 470, 0, { color: 'pink', r: 88 });
  b.propHere('cubeStack', 250, 0, { cols: 2, rows: 2 });
  b.stairs(280, -150, 'glassStairs');
  b.run(220, 'glass');
  b.hop(180, 120, 180, 'slab');
  b.hop(180, 120, 180, 'slab');
  b.checkpoint();
  b.hop(180, 110, 150, 'cube', { depth: 360 });
  b.hop(-10, 110, 150, 'cube', { depth: 470 });
  b.propHere('dome', 75, 0, { color: 'blue', r: 54 });
  b.hop(220, 30, 200, 'slab');
  b.hop(220, 0, 520, 'glass');
  b.finishLine(260, 'glass');
  return b.build({
    id: 'space_race',
    width: 8300,
    height: 1500,
    theme: 'space',
    floor: { y: 1460, kind: 'void' },
    rivalPace: 0.82,
    source: 'Reconstructed from recording 6ruMDWrHNa0 (production street LHV1BCTKK142N8F is not archived).',
  });
}

const BUILDERS = {
  space_race: buildSpaceRace,
};

const cache = new Map();

/** Built (and cached) course geometry for a race id, or null. */
export function raceCourse(raceId) {
  if (!BUILDERS[raceId]) return null;
  if (!cache.has(raceId)) cache.set(raceId, BUILDERS[raceId]());
  return cache.get(raceId);
}

export const RACE_COURSE_IDS = Object.freeze(Object.keys(BUILDERS));

/** Platform surface y at x, or null when x is off the segment. */
export function surfaceYAt(p, x, margin = 0) {
  const minX = Math.min(p.x1, p.x2) - margin;
  const maxX = Math.max(p.x1, p.x2) + margin;
  if (x < minX || x > maxX) return null;
  const dx = p.x2 - p.x1;
  if (Math.abs(dx) < 1e-6) return Math.min(p.y1, p.y2);
  return p.y1 + ((x - p.x1) / dx) * (p.y2 - p.y1);
}

/** The platform a pair of feet are standing on (within `tolerance` px). */
export function platformUnder(platforms, x, y, tolerance = 3) {
  let best = null;
  for (const p of platforms || []) {
    const sy = surfaceYAt(p, x, 2);
    if (sy == null || Math.abs(sy - y) > tolerance) continue;
    if (!best || sy < best.y) best = { platform: p, y: sy };
  }
  return best;
}
