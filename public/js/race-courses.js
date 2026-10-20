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

const BUILDERS = {
  amazing_race: buildAmazingRace,
  canyon_run: buildCanyonRun,
  lava_leap: buildLavaLeap,
  crystal_climb: buildCrystalClimb,
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
