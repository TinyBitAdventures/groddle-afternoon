/**
 * Load original Glitch street JSON (from locations-xml) and expose
 * world↔screen coords + platform collision helpers.
 *
 * Glitch location coords: x left→right, y up is more negative (b≈0 ground, t≈-1000 top).
 * Screen: origin at street top-left (bounds.l, bounds.t), y increases downward.
 */

/**
 * @typedef {{ x1:number,y1:number,x2:number,y2:number,id?:string }} Platform
 * @typedef {{
 *   id?: string,
 *   x: number,
 *   y: number,
 *   h: number,
 *   w?: number,
 *   pc_perm?: number|null,
 *   item_perm?: number|null,
 *   source?: string,
 * }} Wall
 * @typedef {{
 *   tsid: string, label: string, hubId?: string, hubName?: string,
 *   bounds: { l:number, r:number, t:number, b:number },
 *   platforms: Platform[],
 *   walls?: Wall[],
 *   ladders?: { id?:string, x:number, y:number, w?:number, h:number }[],
 *   barriers?: { id?:string, x:number, y:number, h:number, pc_perm:number|null }[],
 *   doors?: object[],
 *   layers: { id:string, name?:string, z?:number, decos: object[] }[],
 *   signposts: object[],
 *   stats?: object,
 * }} StreetData
 */

/**
 * @param {StreetData} street
 */
export function streetWidth(street) {
  return street.bounds.r - street.bounds.l;
}

/**
 * @param {StreetData} street
 */
export function streetHeight(street) {
  return street.bounds.b - street.bounds.t; // b is 0, t is -1000 → height 1000
}

/**
 * World (Glitch) → screen pixels for this street.
 * @param {StreetData} street
 * @param {number} wx
 * @param {number} wy
 */
export function worldToScreen(street, wx, wy) {
  const { l, t } = street.bounds;
  return {
    x: wx - l,
    y: wy - t, // t more negative → smaller y near top; wy=-60, t=-1000 → y=940
  };
}

/**
 * Screen → world
 * @param {StreetData} street
 * @param {number} sx
 * @param {number} sy
 */
export function screenToWorld(street, sx, sy) {
  const { l, t } = street.bounds;
  return { x: sx + l, y: sy + t };
}

/**
 * Convert all platforms to screen-space segments (y down).
 * @param {StreetData} street
 * @returns {{ x1:number,y1:number,x2:number,y2:number,id?:string }[]}
 */
export function platformsScreen(street) {
  return street.platforms.map((p) => {
    const a = worldToScreen(street, p.x1, p.y1);
    const b = worldToScreen(street, p.x2, p.y2);
    // ensure left→right for queries
    if (a.x <= b.x) {
      return { id: p.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    return { id: p.id, x1: b.x, y1: b.y, x2: a.x, y2: a.y };
  });
}

/**
 * Build climb walls from the street's source walls and ladders. trunk_ladder
 * decos are art only: the client climbs <ladder> elements (LadderView), and
 * every climbable trunk has one.
 *
 * Wall world coords (Glitch): top y (more negative), height h extends downward
 * so bottom = y + h. See Wall.as getClosestToXY.
 *
 * @param {StreetData} street
 * @returns {Wall[]}
 */
export function climbWallsWorld(street) {
  const out = [];
  for (const w of street.walls || []) {
    if (!w || !Number.isFinite(w.h) || w.h === 0) continue;
    out.push({ ...w, source: w.source || 'xml' });
  }
  // Source ladders (build-street-navigation.mjs): x centre, y bottom, h up
  // (PhysicsQuadtree.insertLadder). Skip any a feature already restored.
  for (const l of street.ladders || []) {
    if (!l || !Number.isFinite(l.h) || l.h <= 0) continue;
    const top = l.y - l.h;
    const covered = out.some((w) => Math.abs(w.x - l.x) < 40 && !(l.y < w.y || top > w.y + w.h));
    if (covered) continue;
    out.push({ id: l.id, x: l.x, y: top, h: l.h, w: l.w || 50, pc_perm: null, item_perm: null, source: 'ladder' });
  }
  return out;
}

/**
 * Climb walls in screen space (y down). Each wall: vertical segment x, yTop..yBot.
 * @param {StreetData} street
 * @returns {{ id?:string, x:number, yTop:number, yBot:number, source?:string }[]}
 */
export function wallsScreen(street) {
  return climbWallsWorld(street).map((w) => {
    const top = worldToScreen(street, w.x, w.y);
    const bot = worldToScreen(street, w.x, w.y + w.h);
    return {
      id: w.id,
      x: top.x,
      yTop: Math.min(top.y, bot.y),
      yBot: Math.max(top.y, bot.y),
      source: w.source,
    };
  });
}

/**
 * Find a climbable wall near player feet (screen coords).
 * @param {{ x:number, yTop:number, yBot:number, id?:string }[]} walls
 * @param {number} px
 * @param {number} py feet y
 * @param {number} [xTol=36]
 * @returns {{ wall: object, x:number, yTop:number, yBot:number }|null}
 */
export function findClimbWallNear(walls, px, py, xTol = 36) {
  let best = null;
  let bestD = xTol;
  for (const w of walls || []) {
    // Generous vertical slack: grab from slightly above the top or below the base
    if (py < w.yTop - 28 || py > w.yBot + 64) continue;
    const d = Math.abs(px - w.x);
    if (d <= bestD) {
      bestD = d;
      best = w;
    }
  }
  if (!best) return null;
  return { wall: best, x: best.x, yTop: best.yTop, yBot: best.yBot };
}

/** @type {WeakMap<object, { sig: string, list: object[] }>} */
const barrierCache = new WeakMap();

/**
 * The source <walls> (build-street-navigation.mjs `barriers`) as screen-space
 * vertical colliders: { x, yTop, yBot, fromLeft, fromRight } where fromLeft
 * means solid to an avatar walking right into it (Wall.as pc_solid_from_left:
 * pc_perm null or -1), fromRight the reverse (null or 1). pc_perm 0 is open.
 * @param {StreetData} street
 */
export function barriersScreen(street) {
  if (!street || typeof street !== 'object') return [];
  // Location events and quest rooms open and close walls (pc_perm) at runtime.
  const sig = (street.barriers || []).map((w) => w?.pc_perm).join(',');
  const cached = barrierCache.get(street);
  if (cached && cached.sig === sig) return cached.list;
  const out = [];
  for (const w of street.barriers || []) {
    if (!w || !Number.isFinite(w.h) || w.h === 0 || w.pc_perm === 0) continue;
    const top = worldToScreen(street, w.x, w.y);
    const bot = worldToScreen(street, w.x, w.y + w.h);
    out.push({
      id: w.id,
      x: top.x,
      yTop: Math.min(top.y, bot.y),
      yBot: Math.max(top.y, bot.y),
      fromLeft: w.pc_perm !== 1,
      fromRight: w.pc_perm !== -1,
    });
  }
  barrierCache.set(street, { sig, list: out });
  return out;
}

/**
 * Horizontal move from prevX to nextX for an avatar whose body spans
 * feetY - bodyH .. feetY, stopped at the first solid barrier it would cross.
 * @param {ReturnType<typeof barriersScreen>} barriers
 * @returns {number} the allowed x
 */
export function blockBarrierCrossing(barriers, prevX, nextX, feetY, bodyH = 80) {
  if (!barriers?.length || prevX === nextX) return nextX;
  const headY = feetY - bodyH;
  let allowed = nextX;
  for (const w of barriers) {
    // Overlap of more than a few pixels: a wall ending at the floor line or
    // just above the head does not block.
    if (Math.min(feetY - 4, w.yBot) - Math.max(headY, w.yTop) <= 0) continue;
    if (nextX > prevX && w.fromLeft && prevX <= w.x && allowed > w.x) allowed = w.x - 1;
    else if (nextX < prevX && w.fromRight && prevX >= w.x && allowed < w.x) allowed = w.x + 1;
  }
  return allowed;
}

/**
 * Signposts as the client shows them (SignpostView.render): hidden connects
 * are dropped, and a post with no visible connect is not shown at all.
 * @param {object[]} signposts
 */
export function navigableSignposts(signposts) {
  const out = [];
  for (const sign of signposts || []) {
    const connects = (sign?.connects || []).filter((c) => c && !c.hidden);
    if (!connects.length) continue;
    out.push(connects.length === (sign.connects || []).length ? sign : { ...sign, connects });
  }
  return out;
}

/**
 * Platform y at world/screen x via linear interpolation, or null if off segment.
 * @param {{ x1:number,y1:number,x2:number,y2:number }} p  screen-space
 * @param {number} x
 * @param {number} [margin=4]
 */
export function platformYAt(p, x, margin = 4) {
  const minX = Math.min(p.x1, p.x2) - margin;
  const maxX = Math.max(p.x1, p.x2) + margin;
  if (x < minX || x > maxX) return null;
  const dx = p.x2 - p.x1;
  if (Math.abs(dx) < 1e-6) return (p.y1 + p.y2) / 2;
  const t = (x - p.x1) / dx;
  return p.y1 + t * (p.y2 - p.y1);
}

/**
 * Ground for a walking NPC: the nearest platform at or below its feet, allowing
 * only a gentle `maxRise` step up, so steep slopes and branches overhead are
 * never climbed. Falls back to the lowest platform at x, or null when none.
 * @param {{ x1:number,y1:number,x2:number,y2:number }[]} platforms  screen-space
 * @param {number} x
 * @param {number} feetY
 * @param {number} [maxRise=6]
 * @returns {{ y:number, platform:object }|null}
 */
export function groundBeneath(platforms, x, feetY, maxRise = 6) {
  let below = null;
  let lowest = null;
  for (const p of platforms || []) {
    const y = platformYAt(p, x, 0);
    if (y == null) continue;
    if (y >= feetY - maxRise && (!below || y < below.y)) below = { y, platform: p };
    if (!lowest || y > lowest.y) lowest = { y, platform: p };
  }
  return below || lowest;
}

/** game.js caps a frame's delta at 2.5 frames (slow or throttled frames). */
export const FRAME_DT_CAP = 2.5;

/**
 * Resolve ground under a feet position (screen coords).
 * Returns the highest platform top the player is standing on / falling onto.
 * A falling avatar moves vy * dt in one frame, up to vy * FRAME_DT_CAP on a slow
 * frame, so a platform it crossed that far above its feet (plus 8 px of slope)
 * still catches it (G97: at ~9 fps a hop on the Stairs' flight 2 fell 21-23 px
 * past the step, beyond the snap, and dropped to flight 1 below).
 * @param {{ x1:number,y1:number,x2:number,y2:number }[]} platforms  screen-space
 * @param {number} feetX
 * @param {number} feetY  current feet y
 * @param {number} [vy=0]
 * @param {number} [snap=12]
 */
export function resolveGround(platforms, feetX, feetY, vy = 0, snap = 12) {
  let best = null;
  let bestY = Infinity;
  // Plus a little for the surface's own slope between last frame's x and this one.
  const reach = vy > 0 ? Math.max(snap, vy * FRAME_DT_CAP + 8) : snap;
  for (const p of platforms) {
    const y = platformYAt(p, feetX);
    if (y == null) continue;
    // Only consider platforms at or below feet when falling / standing
    if (vy >= 0 && feetY <= y + reach && feetY >= y - 40) {
      if (y < bestY) {
        bestY = y;
        best = p;
      }
    }
  }
  if (!best) return null;
  return { y: bestY, platform: best };
}

/**
 * The deck to step onto when a climber holds Up at a ladder's top. A
 * climbing avatar moves upward, so resolveGround would skip every platform;
 * this looks in a band around the feet instead (archived ladders mostly end
 * up to 48 px above their deck, rebuilt rooms at or just below it) and never
 * returns the floor the ladder stands on.
 * @returns {number|null} surface y
 */
export function ladderTopDeck(platforms, feetX, feetY, ladderBottomY) {
  if (!platforms?.length) return null;
  const hit = resolveGround(platforms, feetX, feetY + 56, 0, 104);
  if (!hit) return null;
  const dy = hit.y - feetY;
  if (dy <= -48 || dy >= 96 || hit.y >= ladderBottomY - 8) return null;
  return hit.y;
}

/**
 * @param {StreetData} street
 * @param {number} screenX
 * @param {number} [radius=60]
 */
export function signpostNear(street, screenX, radius = 120) {
  let best = null;
  let bestD = radius;
  for (const s of street.signposts || []) {
    if (isBuriedSignpost(street, s)) continue;
    const pos = worldToScreen(street, s.x, s.y);
    const d = Math.abs(pos.x - screenX);
    if (d <= bestD) {
      bestD = d;
      best = { signpost: s, screen: pos, distance: d };
    }
  }
  return best;
}

/**
 * Pick a navigable connection from a signpost to a street we have loaded.
 * Prefer connect whose tsid is in available set; map L/G prefix aliases from XML dumps.
 * @param {object} signpost
 * @param {Set<string>|string[]} availableTsids
 */
export function pickConnection(signpost, availableTsids) {
  // Delegate to shared travel module for consistent L/G aliasing
  // (inline mirror so street-model stays usable without circular imports in tests)
  const avail = availableTsids instanceof Set ? availableTsids : new Set(availableTsids);
  const aliases = (tsid) => {
    if (!tsid) return [];
    const out = new Set([tsid]);
    if (tsid.startsWith('L')) out.add('G' + tsid.slice(1));
    if (tsid.startsWith('G')) out.add('L' + tsid.slice(1));
    if (tsid.startsWith('LLI')) out.add('GLI' + tsid.slice(3));
    if (tsid.startsWith('GLI')) out.add('LLI' + tsid.slice(3));
    return [...out];
  };
  const connects = signpost.connects || [];
  for (const c of connects) {
    for (const a of aliases(c.tsid)) {
      if (avail.has(a)) {
        const out = { tsid: a, label: c.label || a, hub_id: c.hub_id };
        if (c.arrive) out.arrive = c.arrive;
        return out;
      }
    }
  }
  return null;
}

/**
 * Widen proximity for signposts (screen space).
 * @param {StreetData} street
 * @param {number} screenX
 * @param {number} [radius=120]
 */
/**
 * A signpost buried under the street's floor stands in for a
 * Collision-triggered Teleporter (items/teleporter.js onPlayerCollision; its
 * target lives in item instance data the location dump doesn't have). The
 * Great Hole to Ix keeps its link to Groddle Ladder at y 150, under the gap in
 * the floor you jump into. Nobody can walk up to one, so it never prompts.
 */
export function isBuriedSignpost(street, signpost) {
  return Number(signpost?.y) > (street?.bounds?.b ?? 0) - 20;
}

/** The hole's rim: the deepest floor beside a buried signpost (screen y), or null. */
export function buriedSignpostRim(street, signpost, reach = 110) {
  const pos = worldToScreen(street, signpost.x, signpost.y);
  let rim = null;
  for (const p of street?.platforms || []) {
    const a = worldToScreen(street, p.x1, p.y1);
    const b = worldToScreen(street, p.x2, p.y2);
    if (Math.max(a.x, b.x) < pos.x - reach - 40 || Math.min(a.x, b.x) > pos.x + reach + 40) continue;
    rim = Math.max(rim ?? -Infinity, a.y, b.y);
  }
  return rim;
}

/**
 * The buried signpost the player has dropped into: within `reach` of it and
 * `depth` below the hole's rim (or near the street's bottom when no floor is beside it).
 */
export function buriedSignpostUnder(street, screenX, screenY, { reach = 110, depth = 60 } = {}) {
  for (const s of street?.signposts || []) {
    if (!isBuriedSignpost(street, s)) continue;
    const pos = worldToScreen(street, s.x, s.y);
    if (Math.abs(pos.x - screenX) > reach) continue;
    const bottom = worldToScreen(street, s.x, street.bounds?.b ?? 0).y;
    const rim = buriedSignpostRim(street, s, reach);
    const trigger = rim == null ? bottom - 80 : Math.min(rim + depth, bottom - 80);
    if (screenY >= trigger) return { signpost: s, screen: pos, rim };
  }
  return null;
}

export function signpostNearWide(street, screenX, radius = 120) {
  return signpostNear(street, screenX, radius);
}

/**
 * Validate street identity + geometry presence.
 * @param {StreetData} street
 */
export function assertStreetGeometry(street) {
  if (!street?.tsid) throw new Error('street missing tsid');
  if (!street?.label) throw new Error('street missing label');
  if (!street.bounds) throw new Error('street missing bounds');
  if (!Array.isArray(street.platforms) || street.platforms.length < 1) {
    throw new Error(`street ${street.tsid} has no platforms`);
  }
  const decoCount = (street.layers || []).reduce((n, L) => n + (L.decos?.length || 0), 0);
  if (decoCount < 1) throw new Error(`street ${street.tsid} has no decos`);
  return {
    tsid: street.tsid,
    label: street.label,
    platforms: street.platforms.length,
    decos: decoCount,
    layers: (street.layers || []).length,
    signposts: (street.signposts || []).length,
  };
}
