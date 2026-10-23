/**
 * Race course geometry for the seven Glitch Races and Grab 'Em Good.
 *
 * None of the production race streets (config_prod.js
 * shared_instances.race.locations) survive in the public locations archive,
 * so every course here is a clean reconstruction read from the supplied
 * recordings (reference-videos/raw/<id>.mp4, research/video/raw/<id>/): the
 * landmarks in the order the racers meet them, the "Entering" loading-screen
 * panorama and the minimap / street map where a recording shows one, the
 * config_prod.js multiplayer_quest_locations start points, and the finish
 * posts, rebuilt as collision lines that the remake's avatar physics can
 * always clear. Gaps are cut to the remake's jump reach, so a course runs
 * shorter than its source street where the original leaps were longer. Courses are authored with a small cursor
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

  /** A ledge off the race line (scenery, shortcuts, the way back up): the cursor stays put. */
  side(xa, ya, xb, yb, style = 'ledge', extra = {}) {
    const last = this.last;
    const p = this.plat(xa, ya, xb, yb, style, extra);
    this.last = last;
    return p;
  }

  /** Walk off the ledge end onto a ledge `drop` px lower (no jump). */
  step(drop, len, style = 'ledge', extra = {}) {
    const ny = this.cursor.y + drop;
    const x2 = this.cursor.x + this.dir * len;
    this.plat(this.cursor.x, ny, x2, ny, style, extra);
    this.node(this.cursor.x + this.dir * 24, ny, 'walk');
    this.advance(x2, ny);
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

  /**
   * Finish posts at `x` on the ledge just landed on (the source posts often
   * stand near a ledge's near edge, with the ledge running on past them).
   */
  finishAt(x) {
    const y = surfaceYAt(this.last, x, 1) ?? this.cursor.y;
    this.finish = { x: Math.round(x), y: Math.round(y) };
    this.route[this.route.length - 1] = { x: this.finish.x, y: this.finish.y, mode: 'walk' };
    return this;
  }

  /**
   * The two config_prod.js start points when they differ in height: the
   * player and the rival each get their own spot (the rival's route starts
   * at its spot).
   */
  startPoints(player, rival) {
    this.spawn = { player: { x: Math.round(player.x), y: Math.round(player.y) }, rival: { x: Math.round(rival.x), y: Math.round(rival.y) } };
    this.route = [{ x: this.spawn.rival.x, y: this.spawn.rival.y, mode: 'start' }];
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
    // Twin starts are a mirrored pair (config start points), so the race
    // line begins where the player stands.
    this.route[0] = { ...this.route[0], x: this.spawn.player.x, y: this.spawn.player.y };
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
/* Space Race (recording 6ruMDWrHNa0; loading-screen panorama)         */
/* "Race through space to be the first past the post." Black starfield, */
/* frosted glass floors and stairs, glass block towers, pink, blue and  */
/* yellow bubble domes. The racers start at the same x, 145 px apart    */
/* (config start points): one on a small glass ledge, one on the floor  */
/* below. In the recording's order: along the floor past the domes, up  */
/* glass stairs to a long walkway, over a raised row of four glass      */
/* blocks, down onto a domed block tower, down to the floor, up a small */
/* block and a taller one, glass stairs up to the pink-domed tower, a   */
/* long floaty leap to a floor slab, up the slabs beside a block tower  */
/* to its blue dome, and slabs stepping up to the posts. Floaty (0.62   */
/* gravity: leaps hang ~1.6 s); falling into space returns you to a     */
/* checkpoint.                                                          */
/* ------------------------------------------------------------------ */

function buildSpaceRace() {
  const Y = 1150;
  const b = new CourseBuilder({ gravity: 0.62 });
  const floor = b.plat(100, Y, 960, Y, 'glass');
  b.plat(100, Y - 145, 300, Y - 145, 'slab');
  b.startPoints({ x: 180, y: Y }, { x: 180, y: Y - 145 });
  b.node(286, Y - 145, 'walk');
  b.node(340, Y, 'fall');
  b.last = floor;
  b.advance(960, Y);
  b.endWalk();
  b.prop('dome', 470, Y, { color: 'pink', r: 92 });
  b.side(560, Y - 320, 760, Y - 320, 'slab');
  b.prop('dome', 820, Y, { color: 'blue', r: 64 });
  // Glass stairs up to the long walkway and its raised row of four blocks.
  b.stairs(320, 210, 'glassStairs');
  b.run(560, 'glass');
  b.hop(-10, 104, 416, 'cube', { depth: 104 });
  b.side(b.cursor.x - 200, Y - 560, b.cursor.x + 20, Y - 560, 'slab');
  b.checkpoint(60);
  // Down onto the domed block tower, then to the floor.
  b.hop(150, -70, 220, 'cube', { depth: 250 });
  b.propHere('dome', -70, 0, { color: 'yellow', r: 52 });
  b.propHere('dome', -160, 0, { color: 'blue', r: 44 });
  b.hop(160, -250, 360, 'glass');
  // A small block, a taller one, back down, and glass stairs to the pink-domed tower.
  b.hop(-10, 104, 110, 'cube', { depth: 104 });
  b.hop(120, 104, 110, 'cube', { depth: 208 });
  b.hop(150, -208, 220, 'glass');
  b.stairs(300, 220, 'glassStairs');
  b.run(60, 'glass');
  b.hop(-10, 40, 240, 'cube', { depth: 330 });
  b.propHere('dome', -120, 0, { color: 'pink', r: 86 });
  b.checkpoint(60);
  // The long leap through space to a floor slab.
  b.hop(240, -120, 420, 'glass');
  b.side(b.cursor.x - 330, Y - 470, b.cursor.x - 150, Y - 470, 'slab');
  // Up the slabs beside the block tower to its blue dome.
  b.hop(60, 110, 160, 'slab');
  b.turn();
  b.hop(-70, 110, 160, 'slab');
  b.turn();
  b.hop(80, 110, 230, 'cube', { depth: 450 });
  b.propHere('dome', -110, 0, { color: 'blue', r: 70 });
  b.checkpoint(60);
  // Slabs stepping up to the posts.
  b.hop(170, 60, 180, 'slab');
  b.hop(170, 80, 480, 'glass');
  const top = b.last;
  b.finishAt(top.x1 + 150);
  return b.build({
    id: 'space_race',
    width: Math.round(top.x2 + 200),
    height: 1500,
    theme: 'space',
    floor: { y: 1460, kind: 'void' },
    rivalPace: 0.76,
    source: 'Reconstructed from recording 6ruMDWrHNa0 and its loading-screen panorama (production street LHV1BCTKK142N8F is not archived).',
  });
}

/* ------------------------------------------------------------------ */
/* Lava Leap (recordings VxDEwOb5ehg; loading screen and minimap)      */
/* A dark red cavern over a sea of lava. The racers start apart (config */
/* start points 174 px apart in height): one up on a rock slope, one on */
/* the long flat ledge below it. Then, as the loading-screen panorama   */
/* and minimap show, only nine landings: a tall square block, a low     */
/* two-step block, three mushroom pillars (the middle one short), a     */
/* long broken slab that tilts down to the right, a last pillar, and a  */
/* tall cliff with the finish posts near its left edge. Leaps are       */
/* floaty: the recording's hop onto the tall block hangs ~1.25 s, a     */
/* third longer than a normal jump (0.7 gravity). The source street is  */
/* ~6000 px wide (start x -2857 / -2938); the gaps are cut to the       */
/* remake's jump reach, so the course runs ~4900 px. Lava sends you     */
/* back to the last checkpoint.                                         */
/* ------------------------------------------------------------------ */

function buildLavaLeap() {
  const Y = 1040;
  const b = new CourseBuilder({ gravity: 0.7 });
  // The long start ledge and the rock slope above its left end.
  const ledge = b.plat(40, Y, 900, Y, 'rockLedge');
  const slope = b.plat(40, Y - 245, 460, Y, 'rockSlope');
  b.startPoints({ x: 80, y: Y }, { x: 160, y: Math.round(surfaceYAt(slope, 160)) });
  b.node(460, Y, 'walk');
  b.last = ledge;
  b.advance(900, Y);
  b.endWalk();
  // The tall square block, then the low block with its raised left step.
  b.hop(110, 90, 240, 'rockLedge');
  b.hop(170, -50, 110, 'rockLedge');
  b.step(24, 310, 'rockLedge');
  b.checkpoint(60);
  // Three mushroom pillars: tall, short, tall.
  b.hop(130, 90, 100, 'pillar');
  b.hop(140, -130, 80, 'pillar');
  b.hop(110, 120, 100, 'pillar');
  b.checkpoint(50);
  // The long broken slab, tilting down to the right, and its last block.
  b.hop(150, -20, 80, 'rockLedge');
  b.stairs(640, -50, 'rockSlope');
  b.hop(-10, 36, 240, 'rockLedge');
  b.checkpoint(60);
  b.hop(140, 60, 100, 'pillar');
  // The tall finish cliff at the street's end: the posts stand near its left edge.
  b.hop(150, 30, 380, 'rockLedge');
  const cliff = b.last;
  b.finishAt(cliff.x1 + 130);
  return b.build({
    id: 'lava_leap',
    width: Math.round(cliff.x2 + 60),
    height: 1400,
    theme: 'lava',
    floor: { y: 1200, kind: 'lava' },
    rivalPace: 0.7,
    source: 'Reconstructed from recording VxDEwOb5ehg, its loading-screen panorama and minimap (production street LIF107M5ORP1DQ5 is not archived).',
  });
}

/* ------------------------------------------------------------------ */
/* Canyon Run (recording Ox_Tdn8tdd0; loading-screen panorama)         */
/* "Ok, so you can race UP, that much is true. But can you race         */
/* SIDEWAYS!?" The racers start apart (config start points: one 123 px  */
/* higher and 106 px further left): one up on a fallen log in the       */
/* bare-tree forest, one on the ground. In the recording's order: a     */
/* tall spire, a flat table rock, a stemmed rock, a rounded mesa, a     */
/* lower ledge under a bare tree holding a slab of rock in its branches, */
/* a mossy outcrop, the big mesa, four floating mushroom rocks over a   */
/* valley of mountains and thin spires, then the canyon wall: climb its */
/* face, walk the ledge through the rock, pass the last spire, drop to  */
/* a mossy ledge and the rocky flat with a boulder and the posts.       */
/* Falling into the canyon returns you to a checkpoint.                 */
/* ------------------------------------------------------------------ */

function buildCanyonRun() {
  const Y = 1100;
  const b = new CourseBuilder({ gravity: 1 });
  const ground = b.plat(40, Y, 1150, Y, 'dirt');
  const log = b.plat(150, Y - 148, 450, Y, 'log');
  b.startPoints({ x: 306, y: Y }, { x: 200, y: Math.round(surfaceYAt(log, 200)) });
  b.node(450, Y, 'walk');
  b.last = ground;
  b.advance(1150, Y);
  b.endWalk();
  b.deco('rock_group_1', 120, Y + 6, { scale: 0.2, tint: 0x8a6a4c, back: true });
  for (const [x, name, sc] of [[90, 'tree_bare_tall_1', 0.42], [330, 'heights_tree_bare_1', 0.34], [560, 'tree_bare_thin_1', 0.46], [760, 'heights_tree_bare_3', 0.62]]) {
    b.deco(name, x, Y + 6, { scale: sc });
  }
  b.deco('stalagmite_1', 960, Y + 8, { scale: 1.1 });
  // Table rock, stemmed rock, the rounded mesa.
  b.hop(100, 70, 220, 'dirtRock');
  b.hop(120, 20, 100, 'spire');
  b.hop(110, 30, 440, 'mesa');
  b.decoHere('heights_mound_2', -90, 10, { scale: 0.32 });
  b.checkpoint();
  // Down to the ledge under the bare tree with a rock slab in its branches.
  b.hop(120, -90, 320, 'dirt');
  const treeX = b.cursor.x - 160;
  b.deco('heights_tree_bare_2', treeX, Y - 10, { scale: 0.5, back: true });
  b.side(treeX - 30, b.cursor.y - 300, treeX + 190, b.cursor.y - 300, 'floatRock');
  // The mossy outcrop and the big mesa.
  b.hop(100, 60, 260, 'dirt');
  b.hop(100, 70, 640, 'mesa');
  b.decoHere('heights_mound_1', -150, 10, { scale: 0.36 });
  b.checkpoint();
  // Four floating mushroom rocks over the valley.
  const valley = b.cursor.x;
  b.hop(120, 10, 140, 'floatRock');
  b.hop(110, 40, 140, 'floatRock');
  b.hop(130, -30, 140, 'floatRock');
  b.hop(120, 20, 150, 'floatRock');
  b.deco('mountain_blue_1', valley + 500, 1290, { scale: 0.5, tint: 0xc9d8e6, back: true });
  b.deco('stalagmite_2', valley + 230, 1330, { scale: 0.7, back: true });
  b.deco('stalagmite_1', valley + 640, 1330, { scale: 0.6, back: true });
  // The canyon wall: a ledge at its foot, climb the face, walk through the rock.
  b.hop(110, -40, 260, 'mesa');
  b.ladder(360, 200, 'rockFace', 'cave', { ceiling: 210 });
  b.run(520, 'cave', { ceiling: 210 });
  b.checkpoint();
  b.run(220, 'mesa');
  b.decoHere('stalagmite_2', -110, 8, { scale: 0.9 });
  // Off the wall: down to a mossy ledge, then the rocky flat with the posts.
  b.hop(120, -180, 300, 'dirt');
  b.hop(120, -60, 820, 'dirtRock');
  const flat = b.last;
  b.deco('heights_mound_2', flat.x1 + 200, flat.y1 + 10, { scale: 0.34 });
  b.finishAt(flat.x1 + 420);
  return b.build({
    id: 'canyon_run',
    width: Math.round(flat.x2 + 60),
    height: 1650,
    theme: 'canyon',
    floor: { y: 1580, kind: 'pit' },
    rivalPace: 0.74,
    source: 'Reconstructed from recording Ox_Tdn8tdd0 and its loading-screen panorama (production street LIF1H6AFJ9P19UJ is not archived).',
  });
}

/* ------------------------------------------------------------------ */
/* Time Warp (recording feBQ5kjPzfk; loading-screen panorama)          */
/* "Be the first to the end of the time warp to win the race." The      */
/* Arbito set under a purple sky. The racers start at the same x, 148   */
/* px apart (config start points): one up on the giant stone foot, one  */
/* on the green hill below. In the recording's order: pink islands, the */
/* checkered ribbon to an island whose slime ladder hangs down to a     */
/* broken column (the way back up after a fall), over the giant head to */
/* the peace hand, pink stairs up an island, down the rainbow slide, a  */
/* stone slab, the tall slime ladder beside the column, the pink-stair  */
/* island, islands stepping down to one heaped with rubble, and the     */
/* hills of standing stones with the posts on the last crest. Slightly  */
/* floaty (0.85 gravity: the column-top leap hangs ~1.2 s).             */
/* ------------------------------------------------------------------ */

function buildTimeWarp() {
  const Y = 1300;
  const b = new CourseBuilder({ gravity: 0.85 });
  const hill = b.plat(40, Y, 1260, Y, 'hill');
  // The giant foot: walkable along the top of its toes.
  b.deco('statue_foot_2', 300, Y + 10, { scale: 0.3 });
  const foot = b.plat(150, Y - 222, 470, Y - 90, 'none');
  b.startPoints({ x: 330, y: Y }, { x: 330, y: Math.round(surfaceYAt(foot, 330)) });
  b.node(456, Math.round(surfaceYAt(foot, 456)), 'walk');
  b.node(510, Y, 'fall');
  b.last = hill;
  b.advance(1260, Y);
  b.endWalk();
  b.deco('arbito_tree_2', 920, Y + 4, { scale: 0.42 });
  // Pink islands and the checkered ribbon.
  b.hop(100, 70, 200, 'island', { art: 'cloud_rock_1' });
  b.hop(120, 30, 180, 'island', { art: 'cloud_rock_3' });
  const ribbonFrom = b.cursor.x;
  b.hop(130, -10, 560, 'ribbon', { wave: 22 });
  b.hop(130, 20, 220, 'island', { art: 'cloud_rock_2' });
  const isle = b.last;
  // Below: a stretch of hill, a broken column, and the slime ladder back up.
  b.side(ribbonFrom - 160, Y, isle.x2 + 420, Y, 'hill');
  b.deco('pillar_small_2a', isle.x1 + 40, Y + 6, { scale: 0.3 });
  b.walls.push({ id: `w${(nextId += 1)}`, x: isle.x1 + 40, yTop: isle.y1, yBot: Y - 180, style: 'slimeLadder' });
  b.checkpoint(60);
  // Over the giant head to the peace hand.
  b.hop(110, 50, 380, 'none');
  const head = b.last;
  b.deco('statue_head_1', (head.x1 + head.x2) / 2, Y + 8, { scale: 0.3 });
  b.deco('heights_coniferous_2', head.x2 + 40, Y + 6, { scale: 0.17, tint: 0x2f5a9a });
  b.hop(100, 80, 90, 'stoneSlab');
  b.deco('statue_handpeace', b.cursor.x - 40, Y + 6, { scale: 0.34 });
  // Pink stairs up the island, then down the rainbow slide.
  b.hop(100, -10, 60, 'pinkStairs');
  b.stairs(240, 120, 'pinkStairs');
  b.run(200, 'island', { art: 'cloud_rock_4' });
  b.checkpoint(60);
  b.stairs(460, -300, 'rainbow');
  const slideEnd = b.cursor.x;
  b.step(Y - b.cursor.y, 280, 'hill');
  b.deco('pillar_1', slideEnd + 60, Y - 4, { scale: 0.3, rotation: -Math.PI / 2, ay: 0.5, tint: 0x8a96a8 });
  // The floating stone slab, then down to the tall slime ladder by the column.
  b.hop(100, 80, 200, 'stoneSlab');
  b.hop(100, -80, 240, 'hill');
  b.ladder(420, 130, 'slimeLadder', 'column');
  b.deco('arbito_tree_3', b.cursor.x + 120, Y + 6, { scale: 0.5, tint: 0xb04a4a, back: true });
  b.checkpoint(60);
  // The pink-stair island, islands stepping down, the rubble island.
  b.hop(110, 20, 60, 'pinkStairs');
  b.stairs(160, 60, 'pinkStairs');
  b.run(180, 'island', { art: 'cloud_rock_1' });
  b.hop(110, -60, 210, 'island', { art: 'cloud_rock_3' });
  b.hop(110, -70, 210, 'island', { art: 'cloud_rock_2' });
  b.hop(120, -40, 220, 'island', { art: 'cloud_rock_4' });
  b.decoHere('rock_group_1', -110, 6, { scale: 0.18 });
  // The hills of standing stones; the posts stand on the last crest.
  b.hop(120, -60, 540, 'hill');
  b.decoHere('rock_group_3', -420, 8, { scale: 0.3, tint: 0x5a5b45 });
  b.decoHere('rock_group_2', -150, 8, { scale: 0.26, tint: 0x5a5b45 });
  b.hop(110, 60, 560, 'hill');
  const crest = b.last;
  b.finishAt(crest.x1 + 260);
  b.deco('rock_group_4', crest.x1 + 60, crest.y1 + 8, { scale: 0.34, tint: 0x5a5b45 });
  b.deco('rock_group_3', crest.x2 - 60, crest.y1 + 8, { scale: 0.36, tint: 0x5a5b45 });
  return b.build({
    id: 'time_warp',
    width: Math.round(crest.x2 + 300),
    height: 1800,
    theme: 'warp',
    floor: { y: 1740, kind: 'void' },
    rivalPace: 0.74,
    source: 'Reconstructed from recording feBQ5kjPzfk and its loading-screen panorama, with recovered Arbito decos (production street LHV1BDAMK142HAO is not archived).',
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
/* Crystal Climb (recordings 8SaHD6H4-0w, E41OOKMklLU)                 */
/* "Climb fastest to the top of the crystal maze to win. WIN!" The      */
/* second recording opens the full street map: a tall street about     */
/* twice as high as it is wide, the two start points low on either     */
/* side (config x = ±655, mirrored), giant pastel crystals filling the  */
/* lower two-thirds, white sky with floating white blocks above, and    */
/* the posts at the top centre. Two mirrored climbs: frosted glass      */
/* ledges and stairs, glass block columns, ladders of white glass rungs */
/* (both recordings climb them), painted arrows on the crystals, then  */
/* white blocks up to a shared summit. No hazards: a fall lands lower  */
/* on the climb or on the floor (one recording loses a racer from the  */
/* white blocks back into the crystals).                                */
/* ------------------------------------------------------------------ */

function buildCrystalClimb() {
  const W = 2000;
  const FY = 3800;
  const b = new CourseBuilder({ gravity: 1 });
  b.start(275, FY, 360, 'none');
  b.hop(-60, 80, 260, 'glassDeco');
  zig(b, 3, 82, 280, 'glassDeco');
  b.checkpoint(60);
  b.stairs(260, 200, 'glassStairs');
  b.run(100, 'glassDeco');
  zig(b, 2, 84, 260, 'glassDeco');
  b.turn();
  b.ladder(320, 200, 'glassLadder', 'glassDeco');
  b.hop(40, 80, 130, 'cube', { depth: 160 });
  b.hop(-20, 80, 130, 'cube', { depth: 240 });
  b.hop(-20, 80, 140, 'cube', { depth: 320 });
  b.checkpoint(60);
  zig(b, 2, 84, 280, 'glassDeco');
  // A landing above the ledge's end, so the stairs never share a foothold with it.
  b.turn();
  b.hop(-50, 70, 100, 'glassDeco');
  b.stairs(240, 180, 'glassStairs');
  b.run(100, 'glassDeco');
  zig(b, 3, 84, 260, 'glassDeco');
  b.turn();
  b.ladder(340, 180, 'glassLadder', 'glassDeco');
  b.checkpoint(60);
  b.stairs(240, 200, 'glassStairs');
  b.run(100, 'glassDeco');
  zig(b, 2, 84, 260, 'glassDeco');
  // Out of the crystals into the white sky and its floating blocks.
  zig(b, 2, 82, 240, 'whiteBlock');
  b.turn();
  b.ladder(300, 160, 'glassLadder', 'whiteBlock');
  b.hop(60, 80, 220, 'whiteBlock');
  b.checkpoint(60);
  zig(b, 2, 84, 240, 'whiteBlock');
  b.hop(60, 70, 200, 'whiteBlock');
  b.summit(W / 2, 320, 84, 'cloudTop');
  b.mirror(W);
  const crystals = [
    ['cave_crystal_7', 300, 0, 1.7, 0x8f6bff], ['cave_crystal_4', 760, 360, 2.2, 0x6a8dff],
    ['cave_crystal_5', 420, 820, 2.4, 0xff9a5c], ['cave_crystal_7', 860, 1250, 2.0, 0xff7fd1],
    ['cave_crystal_4', 330, 1650, 2.0, 0x63e0a8], ['cave_crystal_5', 820, 2050, 2.3, 0xb48cff],
    ['cave_crystal_7', 480, 2400, 1.8, 0xff9fd8],
  ];
  for (const [name, x, up, scale, tint] of crystals) {
    b.deco(name, x, FY - up + 20, { scale, tint, alpha: 0.9, back: true });
    b.deco(name, W - x, FY - up + 80, { scale, tint, alpha: 0.9, flip: true, back: true, mirrored: true });
  }
  // Arrows painted on the crystals, pointing the way up.
  for (const [x, up, angle] of [[620, 420, -60], [260, 1150, -120], [700, 1900, -60], [300, 2500, -120]]) {
    b.prop('arrow', x, FY - up, { angle, color: 0xffffff, alpha: 0.35, size: 90, shared: true });
    b.prop('arrow', W - x, FY - up, { angle, flip: true, color: 0xffffff, alpha: 0.35, size: 90, shared: true });
  }
  return b.build({
    id: 'crystal_climb',
    width: W,
    height: FY + 100,
    theme: 'crystal',
    floor: { y: FY, kind: 'ground' },
    rivalPace: 0.76,
    source: 'Reconstructed from recordings 8SaHD6H4-0w and E41OOKMklLU (its full street map) with recovered glass and crystal decos (production street LHV1BEMOK14268R is not archived).',
  });
}

/* ------------------------------------------------------------------ */
/* The Amazing Race (recording EkI4G2qi-Z0; loading-screen panorama)   */
/* "Be the first to get to the top!" Groddle Heights rock (glitchen:    */
/* "set in Groddle Heights type terrain"). Two mirrored climbs from     */
/* start points either side of the cave's centre (config x = -575 /     */
/* 591): rock ledges and footholds marked with white up-arrows up out   */
/* of the cave, floating rocks in open sky with white arrows pointing   */
/* the way, then the tall central rock pillar the panorama shows        */
/* between them: both routes meet on it, climb its face, and finish on  */
/* its broad mushroom top. (The recording's winner goes on from the     */
/* pillar top across more floating rocks to a mossy cliff top; with     */
/* twin routes that last stretch is not placed, so the posts stand on   */
/* the pillar top.) No hazards: a fall lands lower on the climb.        */
/* ------------------------------------------------------------------ */

function buildAmazingRace() {
  const W = 2800;
  const C = W / 2;
  const FY = 3100;
  const b = new CourseBuilder({ gravity: 1 });
  // The start ledge faces the cave's centre; climb out of the cave.
  b.turn();
  b.start(900, FY, 420, 'none');
  b.ladder(340, 260, 'rockFace', 'rockLedge');
  zig(b, 2, 84, 300, 'rockLedge');
  b.checkpoint(60);
  b.turn();
  b.ladder(360, 240, 'rockFace', 'rockLedge');
  b.hop(110, 40, 170, 'floatRock');
  b.hop(110, 60, 200, 'floatRock');
  b.checkpoint(60);
  // Out of the cave mouth: floating rocks in the open sky.
  zig(b, 2, 84, 280, 'floatRock');
  b.turn();
  b.ladder(380, 240, 'rockFace', 'rockLedge');
  b.checkpoint(60);
  b.hop(110, 50, 170, 'floatRock');
  b.hop(100, 70, 170, 'floatRock');
  b.turn();
  b.hop(110, 60, 200, 'floatRock');
  zig(b, 3, 84, 260, 'floatRock');
  b.checkpoint(60);
  b.turn();
  // Floating rocks toward the central pillar, the arrows pointing at it.
  b.hop(110, 40, 170, 'floatRock');
  b.prop('arrow', b.cursor.x + 70, b.cursor.y - 110, { angle: 0, color: 0xffffff, alpha: 0.85, size: 46 });
  b.hop(110, 50, 170, 'floatRock');
  b.prop('arrow', b.cursor.x + 70, b.cursor.y - 110, { angle: 0, color: 0xffffff, alpha: 0.85, size: 46 });
  b.hop(100, 20, 170, 'floatRock');
  // The pillar: a foothold ledge on its face, climb it, finish on its top.
  const footY = b.cursor.y - 30;
  b.plat(C - 130, footY, C + 130, footY, 'floatRock', { shared: true });
  b.node(C - 104, footY, 'jump');
  b.node(C, footY, 'walk');
  const topY = footY - 520;
  b.walls.push({ id: `w${(nextId += 1)}`, x: C, yTop: topY, yBot: footY, style: 'rockFace' });
  b.node(C, topY, 'climb');
  b.plat(C - 420, topY, C + 420, topY, 'summit', { shared: true });
  b.finish = { x: C, y: topY };
  // The pillar body: stacked Groddle Heights rock sections from below the clouds to the top.
  for (let y = footY + 700; y - 590 >= topY - 40; y -= 560) b.deco('crosssection_heights_pillar_2', C, y, { scale: 0.95, shared: true, back: true });
  b.mirror(W);
  return b.build({
    id: 'amazing_race',
    width: W,
    height: FY + 100,
    theme: 'amazing',
    floor: { y: FY, kind: 'ground' },
    rivalPace: 0.76,
    source: 'Reconstructed from recording EkI4G2qi-Z0 and its loading-screen panorama (production street LIF10A4HV3P17BU is not archived).',
  });
}

/* ------------------------------------------------------------------ */
/* Star Sprint (recordings w3kWmsESi8A, mHC0T0xlVi0)                   */
/* "Want to touch the stars? You have to get there first. Race! To the  */
/* top!" Both recordings show the same climb. The racers start 160 px   */
/* apart on a green hilltop (config start points x = 60 / -100), hop a  */
/* leaning broken column and a taller one, and climb the slime ladder   */
/* up the tall column. Then up through the Arbito purple sky: pink      */
/* stairs, islands, the checkered ribbons, stone slabs, slime ladders,  */
/* grey arrows painted on the sky, into the black of space where the    */
/* slabs carry rock piles. The striped planet is a trap: walk into its  */
/* door and its rainbow slide pours you back down (both recordings lose */
/* a racer this way). A last slime ladder reaches the top slab; the     */
/* posts stand a little way along it.                                   */
/* ------------------------------------------------------------------ */

function buildStarSprint() {
  const FY = 3100;
  const b = new CourseBuilder({ gravity: 0.85 });
  const hill = b.plat(1150, FY - 50, 1620, FY - 50, 'hill');
  b.startPoints({ x: 1300, y: FY - 50 }, { x: 1460, y: FY - 50 });
  b.last = hill;
  b.advance(1620, FY - 50);
  b.endWalk();
  b.deco('pillar_1', 1000, FY + 10, { scale: 0.3 });
  // A leaning broken column, a taller one, then the slime ladder up the tall column.
  b.hop(100, 80, 110, 'none');
  b.decoHere('pillar_small_1a', -55, 50 + 80, { scale: 0.34, rotation: -0.1 });
  b.hop(90, 75, 110, 'none');
  b.decoHere('pillar_small_2a', -55, 50 + 155, { scale: 0.36 });
  b.ladder(380, 240, 'slimeLadder', 'stoneSlab');
  b.side(b.cursor.x - 236, b.cursor.y, b.cursor.x - 110, b.cursor.y, 'column');
  b.prop('arrow', b.cursor.x - 120, b.cursor.y - 220, { angle: -135 });
  // Pink stairs up to an island and the ribbon, heading left.
  b.turn();
  b.hop(-60, 90, 260, 'stoneSlab');
  b.stairs(260, 150, 'pinkStairs');
  b.run(200, 'island', { art: 'cloud_rock_2' });
  b.hop(110, -10, 420, 'ribbon', { wave: 18 });
  b.hop(120, 40, 220, 'island', { art: 'cloud_rock_1' });
  b.checkpoint(60);
  // Back to the right: a slab, pink stairs, a slab and a slime ladder.
  b.turn();
  b.hop(-60, 90, 300, 'stoneSlab');
  b.prop('arrow', b.cursor.x - 120, b.cursor.y - 180, { angle: -45 });
  b.stairs(260, 150, 'pinkStairs');
  b.run(80, 'pinkStairs');
  b.hop(130, 40, 220, 'stoneSlab');
  // Past the ladder, the striped planet: its door floor leads only down its slide.
  const slab = b.last;
  const R = 240;
  const px = slab.x2 + R - 30;
  b.prop('planet', px, slab.y1 - R * 0.08, { r: R, slide: false });
  const door = b.side(slab.x2, slab.y1, px + R * 0.75, slab.y1, 'none');
  const slide = b.side(door.x2, door.y1, door.x2 + 480, door.y1 + 620, 'rainbow');
  b.side(slide.x2 - 20, slide.y2 + 10, slide.x2 + 200, slide.y2 + 10, 'island', { art: 'cloud_rock_3' });
  b.ladder(360, 240, 'slimeLadder', 'stoneSlab');
  b.checkpoint(60);
  // Left again: islands, a ribbon, stairs up into space.
  b.turn();
  b.hop(-60, 90, 300, 'stoneSlab');
  b.hop(130, 50, 220, 'island', { art: 'cloud_rock_4' });
  b.hop(120, 20, 420, 'ribbon', { wave: 18 });
  b.hop(120, 50, 220, 'island', { art: 'cloud_rock_3' });
  b.turn();
  b.hop(-60, 90, 300, 'stoneSlab');
  b.decoHere('rock_group_1', -60, 6, { scale: 0.16 });
  b.prop('arrow', b.cursor.x - 240, b.cursor.y - 200, { angle: -45 });
  b.stairs(260, 150, 'pinkStairs');
  b.run(80, 'pinkStairs');
  b.checkpoint(40);
  b.ladder(360, 220, 'slimeLadder', 'stoneSlab');
  b.decoHere('rock_group_1', -90, 6, { scale: 0.16 });
  // The black of space: slabs with rock piles, an island, the last slime ladder.
  b.turn();
  b.hop(-60, 90, 260, 'stoneSlab');
  b.prop('arrow', b.cursor.x + 120, b.cursor.y - 200, { angle: -135 });
  b.hop(130, 40, 220, 'island', { art: 'cloud_rock_2' });
  b.hop(120, 50, 260, 'stoneSlab');
  b.decoHere('rock_group_1', -70, 6, { scale: 0.16 });
  b.turn();
  b.ladder(340, 420, 'slimeLadder', 'stoneSlab');
  const top = b.last;
  b.finishAt(b.dir > 0 ? top.x1 + 240 : top.x2 - 240);
  return b.build({
    id: 'star_sprint',
    width: 2800,
    height: FY + 100,
    theme: 'star',
    floor: { y: FY, kind: 'ground' },
    rivalPace: 0.74,
    source: 'Reconstructed from recordings w3kWmsESi8A and mHC0T0xlVi0 with recovered Arbito decos (production street LHV1BF1QK142P0V is not archived).',
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
