/**
 * Race course geometry for the seven Glitch Races and Grab 'Em Good.
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
    this.walkDir = 1;
    this.cursor = { x: 0, y: 0 };
    this.platforms = [];
    this.walls = [];
    this.route = [];
    this.checkpoints = [];
    this.decor = [];
    this.props = [];
    this.finish = null;
    this.spawn = null;
    this.quoins = [];
    this.gravity = opts.gravity || 1;
  }

  /**
   * A game quoin at (x, y) (its centre), collected by a scripted racer at
   * float route index `at` (default: the projection on the last segment).
   */
  quoin(x, y, opts = {}) {
    let at = opts.at;
    if (at == null) {
      const n = this.route.length - 1;
      const a = this.route[n - 1] || this.route[n];
      const b = this.route[n];
      const span = b.x - a.x;
      const u = Math.abs(span) < 1 ? 1 : Math.max(0, Math.min(1, (x - a.x) / span));
      at = n - 1 + u;
      if (n < 1) at = 0;
    }
    const { at: _at, ...rest } = opts;
    this.quoins.push({ x: Math.round(x), y: Math.round(y), at: Math.round(at * 1000) / 1000, ...rest });
    return this;
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
    this.advance(x2, y);
    return this;
  }

  /** Move the cursor to the end of a ledge walked in the current direction. */
  advance(x, y) {
    this.cursor = { x, y };
    this.walkDir = this.dir;
  }

  endWalk() {
    const x = this.cursor.x - this.walkDir * 14;
    const y = this.last ? surfaceYAt(this.last, x, 1) : null;
    this.node(x, y == null ? this.cursor.y : y, 'walk');
  }

  run(len, style = 'ledge', extra = {}) {
    const x2 = this.cursor.x + this.dir * len;
    const last = this.last;
    const cx = Math.round(this.cursor.x);
    const flat = last && last.y1 === last.y2 && last.y1 === Math.round(this.cursor.y);
    if (flat && last.style === style && !Object.keys(extra).length && (this.dir > 0 ? last.x2 === cx : last.x1 === cx)) {
      // Same surface, same style: lengthen the ledge instead of stacking a seam.
      if (this.dir > 0) last.x2 = Math.round(x2);
      else last.x1 = Math.round(x2);
    } else {
      this.plat(this.cursor.x, this.cursor.y, x2, this.cursor.y, style, extra);
    }
    this.advance(x2, this.cursor.y);
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
    const landX = gap > 0 ? sx + this.dir * 26 : this.cursor.x - this.walkDir * 14 + this.dir * 10;
    this.node(landX, ny, 'jump');
    this.advance(ex, ny);
    this.endWalk();
    return this;
  }

  /** Sloped run (stairs, ramps, slides): dy > 0 climbs. */
  stairs(dx, dy, style = 'stairs', extra = {}) {
    const x2 = this.cursor.x + this.dir * dx;
    const y2 = this.cursor.y - dy;
    this.plat(this.cursor.x, this.cursor.y, x2, y2, style, extra);
    this.advance(x2, y2);
    this.endWalk();
    return this;
  }

  /** A climbable wall near the ledge end, topped by a new ledge. */
  ladder(height, topLen, style = 'ladder', topStyle = 'ledge', extra = {}) {
    const wx = this.cursor.x - this.walkDir * 36;
    const yTop = this.cursor.y - height;
    this.walls.push({ id: `w${(nextId += 1)}`, x: Math.round(wx), yTop: Math.round(yTop), yBot: Math.round(this.cursor.y), style });
    this.node(wx, this.cursor.y, 'walk');
    this.node(wx, yTop, 'climb');
    this.plat(wx - this.dir * 46, yTop, wx + this.dir * topLen, yTop, topStyle, extra);
    this.advance(wx + this.dir * topLen, yTop);
    this.endWalk();
    return this;
  }

  turn() {
    this.dir *= -1;
    return this;
  }

  checkpoint(back = 70) {
    const cp = { index: this.checkpoints.length, x: Math.round(this.cursor.x - this.walkDir * back), y: this.cursor.y };
    this.checkpoints.push(cp);
    return this;
  }

  finishLine(len, style = 'ledge', extra = {}) {
    this.run(len, style, extra);
    this.finish = { x: Math.round(this.cursor.x - this.walkDir * 110), y: this.cursor.y };
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

  /**
   * Jump straight up onto a shared summit centred on `centerX` (the cursor
   * must sit under it) and walk to the finish posts in the middle.
   */
  summit(centerX, half, rise, style, extra = {}) {
    this.endWalk();
    const from = this.route[this.route.length - 1];
    const y = this.cursor.y - rise;
    this.plat(centerX - half, y, centerX + half, y, style, { ...extra, shared: true });
    this.node(from.x + this.walkDir * 10, y, 'jump');
    this.cursor = { x: centerX, y };
    this.finish = { x: Math.round(centerX), y };
    this.node(centerX, y, 'walk');
    return this;
  }

  /**
   * Twin-path climbs (the source start points are mirrored, e.g. Crystal
   * Climb x = ±655): copy every non-shared piece across x = width / 2 for the
   * rival, whose route is the mirror of the player's.
   */
  mirror(width) {
    const mx = (x) => Math.round(width - x);
    for (const p of this.platforms.filter((row) => !row.shared && !row.mirrored)) {
      this.platforms.push({ ...p, id: `p${(nextId += 1)}`, x1: mx(p.x2), y1: p.y2, x2: mx(p.x1), y2: p.y1, mirrored: true });
    }
    for (const w of this.walls.filter((row) => !row.mirrored)) {
      this.walls.push({ ...w, id: `w${(nextId += 1)}`, x: mx(w.x), mirrored: true });
    }
    for (const d of this.decor.filter((row) => !row.shared && !row.mirrored)) {
      this.decor.push({ ...d, x: mx(d.x), flip: !d.flip, mirrored: true });
    }
    for (const prop of this.props.filter((row) => !row.shared && !row.mirrored)) {
      this.props.push({ ...prop, x: mx(prop.x), flip: !prop.flip, mirrored: true });
    }
    for (const q of this.quoins.filter((row) => !row.shared && !row.mirrored)) {
      this.quoins.push({ ...q, x: mx(q.x), mirrored: true });
    }
    this.rivalRoute = this.route.map((n) => ({ ...n, x: mx(n.x) }));
    this.spawn = { player: this.spawn.player, rival: { x: this.rivalRoute[0].x, y: this.rivalRoute[0].y } };
    return this;
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
      rivalRoute: this.rivalRoute || null,
      checkpoints: this.checkpoints,
      finish: this.finish,
      spawn: this.spawn,
      decor: this.decor,
      props: this.props,
      quoins: this.quoins,
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
  b.propHere('cubeStack', -260, 0, { cols: 2, rows: 2 });
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
    rivalPace: 0.76,
    source: 'Reconstructed from recording 6ruMDWrHNa0 (production street LHV1BCTKK142N8F is not archived).',
  });
}

/* ------------------------------------------------------------------ */
/* Lava Leap (recording VxDEwOb5ehg)                                   */
/* A dark red cavern: a stone ledge sloping down to a sea of lava, then */
/* a long run of rock-pillar tops at varying heights, finish on a mesa. */
/* Leaping is a little floaty (0.8 gravity); lava sends you back to the */
/* last checkpoint.                                                     */
/* ------------------------------------------------------------------ */

function buildLavaLeap() {
  const b = new CourseBuilder({ gravity: 0.8 });
  b.start(60, 1000, 560, 'rockLedge');
  b.decoHere('rock_group_1', -380, 4, { scale: 0.5, tint: 0x7a4a36 });
  b.stairs(240, -90, 'rockSlope');
  b.run(150, 'rockLedge');
  // Pillar tops hover 40-150 px over the lava (y 1050-1160); [gap, rise, width].
  const pillars = [
    [150, 30, 110], [160, -20, 100], [150, 50, 100], [140, -40, 110], 'cp',
    [170, -20, 120], [140, 60, 90], [150, -50, 100], [160, 30, 110], [150, -40, 100], 'cp',
    [140, 70, 100], [140, -30, 90], [170, -50, 110], [150, 60, 120], [150, -40, 100], [160, 30, 100], 'cp',
    [170, -60, 110], [150, 50, 100], [160, 20, 100], [150, -40, 110], [160, 40, 100],
  ];
  for (const step of pillars) {
    if (step === 'cp') b.checkpoint(50);
    else b.hop(step[0], step[1], step[2], 'pillar');
  }
  b.hop(150, 50, 520, 'rockLedge');
  b.finishLine(220, 'rockLedge');
  return b.build({
    id: 'lava_leap',
    width: 7200,
    height: 1400,
    theme: 'lava',
    floor: { y: 1200, kind: 'lava' },
    rivalPace: 0.74,
    source: 'Reconstructed from recording VxDEwOb5ehg (production street LIF107M5ORP1DQ5 is not archived).',
  });
}

/* ------------------------------------------------------------------ */
/* Canyon Run (recording Ox_Tdn8tdd0)                                  */
/* Bare-tree forest and a fallen log at the start, then floating rocks */
/* over the canyon, mesas, a rock cave, stone spires, and a rocky      */
/* finish. Falling into the canyon returns you to a checkpoint.        */
/* ------------------------------------------------------------------ */

function buildCanyonRun() {
  const b = new CourseBuilder({ gravity: 1 });
  b.start(40, 1100, 900, 'dirt');
  for (const [dx, name, sc] of [[-860, 'tree_bare_tall_1', 0.42], [-640, 'heights_tree_bare_1', 0.38], [-420, 'tree_bare_thin_1', 0.46], [-180, 'heights_tree_bare_3', 0.62]]) {
    b.decoHere(name, dx, 6, { scale: sc });
  }
  b.stairs(220, 70, 'log');
  b.run(110, 'log');
  b.hop(70, -70, 380, 'dirt');
  b.decoHere('heights_tree_bare_3', -120, 6, { scale: 0.55 });
  b.checkpoint();
  b.hop(130, 20, 170, 'floatRock');
  b.hop(120, 30, 150, 'floatRock');
  b.hop(130, -20, 160, 'floatRock');
  b.hop(110, 50, 170, 'floatRock');
  b.hop(120, 10, 620, 'mesa');
  b.decoHere('cave_large_rock_1', -420, 6, { scale: 0.42 });
  b.checkpoint();
  b.stairs(220, 110, 'rockSlope');
  b.run(320, 'mesa');
  b.hop(90, -200, 520, 'mesa');
  b.checkpoint();
  b.run(560, 'cave', { ceiling: 200 });
  b.run(200, 'mesa');
  b.hop(120, 0, 90, 'spire');
  b.hop(110, 40, 90, 'spire');
  b.hop(120, -30, 90, 'spire');
  b.hop(110, 50, 100, 'spire');
  b.hop(120, -40, 400, 'mesa');
  b.checkpoint();
  b.hop(120, 30, 160, 'floatRock');
  b.hop(130, 0, 160, 'floatRock');
  b.hop(120, 40, 160, 'floatRock');
  b.hop(120, -60, 620, 'dirtRock');
  b.decoHere('cave_large_rock_2', -500, 6, { scale: 0.4 });
  b.finishLine(260, 'dirtRock');
  b.decoHere('cave_large_rock_1', 40, 6, { scale: 0.36 });
  return b.build({
    id: 'canyon_run',
    width: 9000,
    height: 1650,
    theme: 'canyon',
    floor: { y: 1580, kind: 'pit' },
    rivalPace: 0.74,
    source: 'Reconstructed from recording Ox_Tdn8tdd0 (production street LIF1H6AFJ9P19UJ is not archived).',
  });
}

/* ------------------------------------------------------------------ */
/* Time Warp (recording feBQ5kjPzfk)                                   */
/* The Arbito set: a giant stone foot, green hills under a purple sky, */
/* pink floating islands, a checkered ribbon bridge, slime ladders, a  */
/* stone column, pink stairs, a rainbow slide, standing stones and the */
/* finish on the last hill. Slightly floaty (0.85 gravity).            */
/* ------------------------------------------------------------------ */

function buildTimeWarp() {
  const b = new CourseBuilder({ gravity: 0.85 });
  b.deco('statue_foot_2', 330, 1312, { scale: 0.42 });
  b.start(40, 1300, 980, 'hill');
  b.decoHere('arbito_tree_2', -160, 4, { scale: 0.42 });
  b.hop(130, 60, 200, 'island', { art: 'cloud_rock_1' });
  b.hop(150, 40, 190, 'island', { art: 'cloud_rock_3' });
  b.hop(140, -20, 520, 'ribbon', { wave: 22 });
  b.checkpoint();
  b.hop(140, 40, 220, 'island', { art: 'cloud_rock_2' });
  b.ladder(330, 200, 'slimeLadder', 'stoneSlab');
  b.hop(140, 20, 180, 'stoneSlab');
  b.hop(130, 50, 140, 'column', { depth: 900 });
  b.hop(150, -40, 200, 'island', { art: 'cloud_rock_4' });
  b.checkpoint();
  b.stairs(260, 140, 'pinkStairs');
  b.run(90, 'pinkStairs');
  b.hop(140, -30, 200, 'island', { art: 'cloud_rock_1' });
  b.decoHere('statue_handpeace', 140, 40, { scale: 0.45 });
  b.hop(170, -40, 180, 'stoneSlab');
  b.hop(150, 20, 220, 'island', { art: 'cloud_rock_3' });
  b.checkpoint();
  b.stairs(420, -260, 'rainbow');
  b.run(60, 'rainbow');
  b.hop(80, -40, 560, 'hill');
  b.decoHere('rock_group_3', -420, 8, { scale: 0.3 });
  b.hop(130, 50, 200, 'island', { art: 'cloud_rock_2' });
  b.hop(140, 30, 200, 'stoneSlab');
  b.hop(140, -90, 760, 'hill');
  b.decoHere('rock_group_3', -600, 8, { scale: 0.34 });
  b.decoHere('rock_group_2', -300, 8, { scale: 0.26 });
  b.finishLine(260, 'hill');
  b.decoHere('rock_group_4', 60, 8, { scale: 0.42 });
  return b.build({
    id: 'time_warp',
    width: 8400,
    height: 1800,
    theme: 'warp',
    floor: { y: 1740, kind: 'void' },
    rivalPace: 0.74,
    source: 'Reconstructed from recording feBQ5kjPzfk with recovered Arbito decos (production street LHV1BDAMK142HAO is not archived).',
  });
}

/* ------------------------------------------------------------------ */
/* Twin-path climbs                                                    */
/* ------------------------------------------------------------------ */

/** Zigzag up `steps` overlapping ledges, `rise` px each, turning every step. */
function zig(b, steps, rise, len, style, extra = {}) {
  for (let i = 0; i < steps; i += 1) {
    b.turn();
    b.hop(-70, rise, len, style, extra);
  }
}

/* ------------------------------------------------------------------ */
/* Crystal Climb (recording 8SaHD6H4-0w)                               */
/* Two mirrored climbs (config start points x = ±655) through giant    */
/* coloured crystals: frosted glass ledges and stairs, glass block     */
/* columns, then white cloud blocks to a shared summit and the posts.  */
/* ------------------------------------------------------------------ */

function buildCrystalClimb() {
  const W = 2600;
  const FY = 2900;
  const b = new CourseBuilder({ gravity: 1 });
  b.start(160, FY, 520, 'none');
  b.hop(-60, 80, 300, 'glassDeco');
  zig(b, 3, 82, 330, 'glassDeco');
  b.checkpoint(60);
  b.stairs(300, 220, 'glassStairs');
  b.run(120, 'glassDeco');
  zig(b, 3, 84, 300, 'glassDeco');
  b.hop(40, 80, 130, 'cube', { depth: 160 });
  b.hop(-20, 80, 130, 'cube', { depth: 240 });
  b.hop(-20, 80, 200, 'cube', { depth: 320 });
  b.checkpoint(60);
  zig(b, 2, 84, 320, 'glassDeco');
  b.turn();
  b.stairs(300, 240, 'glassStairs');
  b.run(120, 'glassDeco');
  zig(b, 4, 84, 300, 'glassDeco');
  b.checkpoint(60);
  b.stairs(280, 220, 'glassStairs');
  b.run(100, 'glassDeco');
  zig(b, 3, 82, 300, 'whiteBlock');
  b.hop(60, 80, 300, 'whiteBlock');
  b.checkpoint(60);
  zig(b, 2, 84, 300, 'whiteBlock');
  b.hop(60, 70, 260, 'whiteBlock');
  b.summit(W / 2, 380, 84, 'cloudTop');
  b.mirror(W);
  const crystals = [
    ['cave_crystal_7', 330, 0, 1.7, 0x8f6bff], ['cave_crystal_4', 860, 330, 2.2, 0x6a8dff],
    ['cave_crystal_5', 520, 760, 2.4, 0xff9a5c], ['cave_crystal_7', 1020, 1150, 2.0, 0xff7fd1],
    ['cave_crystal_4', 380, 1500, 2.0, 0x63e0a8], ['cave_crystal_5', 960, 1850, 2.3, 0xb48cff],
    ['cave_crystal_7', 560, 2150, 1.8, 0xff9fd8],
  ];
  for (const [name, x, up, scale, tint] of crystals) {
    b.deco(name, x, FY - up + 20, { scale, tint, alpha: 0.9, back: true });
    b.deco(name, W - x, FY - up + 80, { scale, tint, alpha: 0.9, flip: true, back: true, mirrored: true });
  }
  return b.build({
    id: 'crystal_climb',
    width: W,
    height: FY + 100,
    theme: 'crystal',
    floor: { y: FY, kind: 'ground' },
    rivalPace: 0.76,
    source: 'Reconstructed from recording 8SaHD6H4-0w with recovered glass and crystal decos (production street LHV1BEMOK14268R is not archived).',
  });
}

/* ------------------------------------------------------------------ */
/* The Amazing Race (recording EkI4G2qi-Z0)                            */
/* Two mirrored climbs (config start points x = -575 / 591) out of a   */
/* rock cave, up climbable stone pillars and floating rock islands     */
/* into open sky, to a shared summit with the finish posts.            */
/* ------------------------------------------------------------------ */

function buildAmazingRace() {
  const W = 2800;
  const FY = 3100;
  const b = new CourseBuilder({ gravity: 1 });
  b.start(160, FY, 520, 'none');
  b.ladder(340, 240, 'rockFace', 'rockLedge');
  zig(b, 2, 84, 320, 'rockLedge');
  b.checkpoint(60);
  b.turn();
  b.ladder(360, 220, 'rockFace', 'rockLedge');
  b.hop(110, 40, 170, 'floatRock');
  b.hop(110, 60, 170, 'floatRock');
  b.turn();
  b.hop(100, 70, 180, 'floatRock');
  b.hop(100, 60, 220, 'floatRock');
  b.checkpoint(60);
  zig(b, 2, 84, 300, 'floatRock');
  b.turn();
  b.ladder(380, 260, 'rockFace', 'rockLedge');
  b.checkpoint(60);
  b.turn();
  b.hop(110, 50, 170, 'floatRock');
  b.hop(100, 70, 170, 'floatRock');
  b.turn();
  b.hop(110, 60, 200, 'floatRock');
  zig(b, 3, 84, 300, 'floatRock');
  b.checkpoint(60);
  b.turn();
  b.ladder(360, 260, 'rockFace', 'rockLedge');
  zig(b, 2, 84, 300, 'floatRock');
  b.turn();
  b.hop(100, 60, 260, 'floatRock');
  b.hop(100, 40, 200, 'floatRock');
  b.summit(W / 2, 420, 84, 'summit');
  b.mirror(W);
  return b.build({
    id: 'amazing_race',
    width: W,
    height: FY + 100,
    theme: 'amazing',
    floor: { y: FY, kind: 'ground' },
    rivalPace: 0.76,
    source: 'Reconstructed from recording EkI4G2qi-Z0 (production street LIF10A4HV3P17BU is not archived).',
  });
}

/* ------------------------------------------------------------------ */
/* Star Sprint (recording w3kWmsESi8A)                                 */
/* "Race! To the top!" One shared climb from the green hills (config   */
/* start points x = 60 / -100) through the Arbito purple sky into the  */
/* stars: stone slabs, pink islands and stairs, slime ladders, the     */
/* checkered ribbon, the striped planet, and the posts at the top.     */
/* ------------------------------------------------------------------ */

function buildStarSprint() {
  const FY = 2750;
  const b = new CourseBuilder({ gravity: 0.85 });
  b.start(1100, FY, 600, 'hill');
  b.deco('pillar_1', 960, FY + 10, { scale: 0.3 });
  b.deco('arbito_tree_2', 1500, FY + 6, { scale: 0.36 });
  b.hop(-60, 90, 260, 'stoneSlab');
  b.hop(120, 50, 220, 'island', { art: 'cloud_rock_2' });
  b.turn();
  b.hop(-60, 90, 300, 'stoneSlab');
  b.stairs(260, 150, 'pinkStairs');
  b.run(80, 'pinkStairs');
  b.hop(130, 40, 220, 'stoneSlab');
  b.checkpoint(60);
  b.ladder(340, 220, 'slimeLadder', 'stoneSlab');
  b.hop(140, 40, 220, 'island', { art: 'cloud_rock_1' });
  b.hop(130, 60, 240, 'island', { art: 'cloud_rock_3' });
  b.turn();
  b.hop(-60, 90, 300, 'stoneSlab');
  b.stairs(260, 150, 'pinkStairs');
  b.run(80, 'pinkStairs');
  b.checkpoint(40);
  b.hop(120, 20, 480, 'ribbon', { wave: 18 });
  b.hop(130, 60, 220, 'island', { art: 'cloud_rock_4' });
  b.ladder(360, 240, 'slimeLadder', 'stoneSlab');
  b.checkpoint(60);
  b.turn();
  b.hop(-60, 90, 300, 'stoneSlab');
  b.hop(130, 50, 220, 'island', { art: 'cloud_rock_1' });
  b.prop('planet', b.cursor.x - 420, b.cursor.y - 40, { r: 210 });
  b.turn();
  b.hop(-60, 90, 300, 'stoneSlab');
  b.stairs(260, 150, 'pinkStairs');
  b.run(80, 'pinkStairs');
  b.checkpoint(40);
  b.ladder(360, 220, 'slimeLadder', 'stoneSlab');
  b.turn();
  b.hop(-60, 90, 260, 'stoneSlab');
  b.hop(130, 40, 220, 'island', { art: 'cloud_rock_2' });
  b.hop(120, 60, 600, 'stoneSlab');
  b.finishLine(200, 'stoneSlab');
  return b.build({
    id: 'star_sprint',
    width: 2800,
    height: FY + 100,
    theme: 'star',
    floor: { y: FY, kind: 'ground' },
    rivalPace: 0.74,
    source: 'Reconstructed from recording w3kWmsESi8A with recovered Arbito decos (production street LHV1BF1QK142P0V is not archived).',
  });
}

/* ------------------------------------------------------------------ */
/* Grab 'Em Good (recording zBiGJR6jIJM; GSJS quoin_grab)              */
/* A night-time Groddle Forest (wiki 2011-03-31): both racers start on  */
/* a grassy dirt mound (config start points x = -319 / 356, a mirrored  */
/* pair), then climb pine boughs and plank shelves around two pairs of  */
/* giant trunks, grabbing mood quoins in rows and jump arcs. 71 quoins  */
/* (wiki: "out of a total of 71"; the recording's scores and Remaining  */
/* always sum to 71): 35 on each side and one on the shared canopy at   */
/* the top, so a racer who clears their own tree and the canopy has    */
/* the 36 that settle it. No hazards: a fall lands on the forest floor. */
/* ------------------------------------------------------------------ */

function buildGrabEmGood() {
  const W = 3000;
  const C = W / 2;
  const FY = 2400;
  const HY = FY - 90;
  const TO = 380; // outer trunk (left half; mirrored at W - x)
  const TI = 1020; // inner trunk
  const b = new CourseBuilder({ gravity: 1 });
  const bough = (x1, x2, y, trunk, style = 'bough', extra = {}) => b.plat(x1, y, x2, y, style, { trunk, ...extra });
  const walk = (x, y) => b.node(x, y, 'walk');
  const jump = (x, y) => b.node(x, y, 'jump');
  /** Jump to (x, y) with one quoin in the arc, just above the landing height. */
  const leap = (x, y) => {
    const from = b.route[b.route.length - 1];
    jump(x, y);
    b.quoin((from.x + x) / 2, y - 40);
  };
  /** Walk to (x, y), out to a row quoin at qx and (optionally) back to bx. */
  const fetch = (x, y, qx, bx = null) => {
    walk(x, y);
    b.quoin(qx, y - 50);
    if (bx != null) walk(bx, y);
  };

  // The shared dirt mound the racers start on.
  b.plat(C - 680, FY, C - 420, HY, 'forestHill', { shared: true });
  b.plat(C - 420, HY, C + 420, HY, 'forestHill', { shared: true });
  b.plat(C + 420, HY, C + 680, FY, 'forestHill', { shared: true });
  b.node(C - 319, HY, 'start');
  b.spawn = { player: { x: C - 319, y: HY }, rival: { x: C + 319, y: HY } };

  // Pine boughs and plank shelves around the outer and inner trunks.
  bough(420, 690, 2315, TO);
  bough(110, 350, 2230, TO);
  bough(420, 700, 2145, TO);
  bough(90, 350, 2060, TO);
  bough(420, 720, 1975, TO);
  bough(170, 340, 1890, TO, 'plank');
  bough(420, 700, 1805, TO);
  bough(790, 960, 1745, null);
  bough(1060, 1300, 1680, TI);
  bough(760, 985, 1595, TI);
  bough(1060, 1320, 1510, TI);
  bough(830, 985, 1425, TI, 'plank');
  bough(1060, 1300, 1340, TI);
  bough(740, 985, 1255, TI);
  bough(1060, 1340, 1170, TI);
  bough(760, 985, 1085, TI);
  bough(1060, 1290, 1000, TI);
  // The shared canopy between the inner trunks, with the 71st quoin.
  b.plat(1250, 915, W - 1250, 915, 'canopy', { shared: true });

  // The route: down the mound, up the outer tree, across, up the inner tree.
  walk(C - 420 + 4, HY);
  b.quoin(1130, HY - 50);
  walk(800, FY);
  walk(660, FY);
  leap(650, 2315);
  fetch(434, 2315, 560);
  leap(336, 2230);
  fetch(150, 2230, 180, 336);
  leap(446, 2145);
  fetch(600, 2145, 560, 434);
  leap(336, 2060);
  fetch(130, 2060, 150, 336);
  leap(446, 1975);
  fetch(620, 1975, 600, 434);
  leap(326, 1890);
  fetch(200, 1890, 230, 326);
  leap(446, 1805);
  fetch(686, 1805, 600);
  leap(816, 1745);
  fetch(946, 1745, 880);
  leap(1086, 1680);
  fetch(1286, 1680, 1200, 1074);
  leap(971, 1595);
  fetch(780, 1595, 800, 971);
  leap(1086, 1510);
  fetch(1250, 1510, 1200, 1074);
  leap(971, 1425);
  fetch(880, 1425, 890, 971);
  leap(1086, 1340);
  fetch(1250, 1340, 1200, 1074);
  leap(971, 1255);
  fetch(760, 1255, 790, 971);
  leap(1086, 1170);
  fetch(1300, 1170, 1220, 1074);
  leap(971, 1085);
  // Out along the bough and back, so the leap across the trunk has a run-up.
  fetch(800, 1085, 830, 971);
  leap(1086, 1000);
  walk(1276, 1000);
  leap(1290, 915);
  walk(C, 915);
  b.quoin(C, 915 - 50, { shared: true });

  // Trunks, bare branches and the canopy (recovered Groddle tree-stack decos).
  for (const [x, branches] of [[TO, [[2190, 1, 'tree_stack_branch_3'], [1640, -1, 'tree_stack_branch_1'], [1330, 1, 'tree_stack_branch_4']]],
    [TI, [[2050, -1, 'tree_stack_branch_2'], [1900, 1, 'tree_stack_branch_4'], [1560, 1, 'tree_stack_branch_1'], [1220, -1, 'tree_stack_branch_3']]]]) {
    for (const [y, side, name] of branches) b.deco(name, x + side * 40, y, { scale: 0.75, flip: side < 0, ax: 0, back: true });
    b.deco('tree_stack_trunk', x, FY - 360, { scale: 0.7, back: true });
    b.deco('tree_stack_trunk', x, FY - 360 - 975, { scale: 0.7, back: true });
    b.deco('tree_stack_trunk', x, FY - 360 - 1950, { scale: 0.7, back: true });
    b.deco('tree_stack_base', x, FY + 14, { scale: 0.8, back: true });
  }
  for (const [x, y, name, scale, flip] of [
    [TO - 40, 980, 'tree_stack_leafy_1', 0.62, false], [TO + 150, 760, 'tree_stack_leafy_2', 0.8, true],
    [TO - 60, 640, 'tree_stack_leafy_2', 0.7, false], [TI - 120, 820, 'tree_stack_leafy_1', 0.6, true],
    [TI + 60, 650, 'tree_stack_leafy_2', 0.75, false], [TI - 10, 520, 'tree_stack_leafy_1', 0.55, false],
    [700, 470, 'tree_stack_leafy_2', 0.7, true],
  ]) {
    b.deco(name, x, y, { scale, flip, front: y < 700 });
  }
  // The dense crown over the shared canopy.
  b.deco('tree_stack_leafy_1', C, 800, { scale: 0.75, shared: true });
  b.deco('tree_stack_leafy_2', C - 250, 720, { scale: 0.7, shared: true });
  b.deco('tree_stack_leafy_2', C + 250, 720, { scale: 0.7, flip: true, shared: true });
  b.deco('pinecluster_2', 620, FY + 6, { scale: 0.45 });
  b.deco('groddle_fern_1', 860, FY + 4, { scale: 0.7 });
  b.mirror(W);

  // The rival clears its own tree, takes the canopy, then works down yours.
  const S = b.route.length - 1;
  for (let i = S - 1; i >= 0; i -= 1) {
    const from = b.route[i + 1];
    const to = b.route[i];
    b.rivalRoute.push({ x: to.x, y: to.y, mode: from.mode === 'jump' ? 'jump' : 'walk' });
  }
  for (const q of b.quoins) {
    if (q.shared) Object.assign(q, { owner: 'shared', rivalAt: q.at });
    else if (q.mirrored) Object.assign(q, { owner: 'rival', rivalAt: q.at, at: null });
    else Object.assign(q, { owner: 'you', rivalAt: Math.round((2 * S - q.at) * 1000) / 1000 });
  }

  return b.build({
    id: 'grab_em_good',
    kind: 'quoins',
    width: W,
    height: FY + 100,
    theme: 'forest',
    floor: { y: FY, kind: 'ground' },
    rivalPace: 0.62,
    source: "Reconstructed from recording zBiGJR6jIJM with recovered Groddle tree-stack decos (production street LIF11MB3O8P1TAR is not archived).",
  });
}

const BUILDERS = {
  amazing_race: buildAmazingRace,
  canyon_run: buildCanyonRun,
  lava_leap: buildLavaLeap,
  crystal_climb: buildCrystalClimb,
  grab_em_good: buildGrabEmGood,
  space_race: buildSpaceRace,
  star_sprint: buildStarSprint,
  time_warp: buildTimeWarp,
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
