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
 * Build climb walls from original geo + trunk_ladder_* deco stacks.
 * Many climbable trees (e.g. Hechey Track) ship empty walls[] but ladder decos.
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
  // Synthesize from trunk_ladder stacks (cluster by x)
  /** @type {{ x:number, y:number, w:number, h:number, sprite:string }[]} */
  const ladders = [];
  for (const L of street.layers || []) {
    for (const d of L.decos || []) {
      const sp = String(d.sprite || '');
      if (!sp.startsWith('trunk_ladder')) continue;
      ladders.push({
        x: Number(d.x) || 0,
        y: Number(d.y) || 0,
        w: Number(d.w) || 40,
        h: Number(d.h) || 50,
        sprite: sp,
      });
    }
  }
  if (ladders.length) {
    const used = new Set();
    const sorted = [...ladders].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length; i++) {
      if (used.has(i)) continue;
      const cluster = [sorted[i]];
      used.add(i);
      for (let j = i + 1; j < sorted.length; j++) {
        if (used.has(j)) continue;
        const cx = cluster.reduce((s, c) => s + c.x, 0) / cluster.length;
        if (Math.abs(sorted[j].x - cx) <= 48) {
          cluster.push(sorted[j]);
          used.add(j);
        }
      }
      // Deco y is registration at bottom of sprite → top = y - h
      const tops = cluster.map((c) => c.y - c.h);
      const bots = cluster.map((c) => c.y);
      let top = Math.min(...tops);
      let bot = Math.max(...bots);
      const x = Math.round(cluster.reduce((s, c) => s + c.x, 0) / cluster.length);
      // Extend climb zone down to the nearest platform under the trunk so you
      // can grab from the path/mound (ladder rungs often start above ground).
      let groundY = null;
      for (const p of street.platforms || []) {
        const minX = Math.min(p.x1, p.x2) - 60;
        const maxX = Math.max(p.x1, p.x2) + 60;
        if (x < minX || x > maxX) continue;
        const midY = (p.y1 + p.y2) / 2;
        // platforms at or below ladder bottom (less negative = lower)
        if (midY >= bot - 20 && midY <= bot + 200) {
          if (groundY == null || midY > groundY) groundY = midY;
        }
      }
      if (groundY != null && groundY > bot) bot = groundY + 8;
      const h = bot - top;
      if (h < 40) continue;
      // Skip if an XML wall already covers this x range closely
      const overlapsXml = out.some(
        (w) => Math.abs(w.x - x) < 40 && !(bot < w.y || top > w.y + w.h)
      );
      if (overlapsXml) continue;
      out.push({
        id: `ladder_climb_${x}_${Math.round(top)}`,
        x,
        y: top,
        h,
        w: 0,
        pc_perm: null,
        item_perm: null,
        source: 'trunk_ladder',
      });
    }
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

/**
 * Resolve ground under a feet position (screen coords).
 * Returns the highest platform top the player is standing on / falling onto.
 * @param {{ x1:number,y1:number,x2:number,y2:number }[]} platforms  screen-space
 * @param {number} feetX
 * @param {number} feetY  current feet y
 * @param {number} [vy=0]
 * @param {number} [snap=12]
 */
export function resolveGround(platforms, feetX, feetY, vy = 0, snap = 12) {
  let best = null;
  let bestY = Infinity;
  for (const p of platforms) {
    const y = platformYAt(p, feetX);
    if (y == null) continue;
    // Only consider platforms at or below feet when falling / standing
    if (vy >= 0 && feetY <= y + snap && feetY >= y - 40) {
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
 * @param {StreetData} street
 * @param {number} screenX
 * @param {number} [radius=60]
 */
export function signpostNear(street, screenX, radius = 120) {
  let best = null;
  let bestD = radius;
  for (const s of street.signposts || []) {
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
        return { tsid: a, label: c.label || a, hub_id: c.hub_id };
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
