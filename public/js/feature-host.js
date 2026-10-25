/**
 * Feature host: the contract that lets one feature live in one file instead of
 * threading through game.js. game.js builds an `engine` API object (world,
 * player, HUD, audio, travel) and calls the host at fixed points; each feature
 * implements only the hooks it needs.
 *
 * Feature shape (every hook optional except `id`):
 * {
 *   id: 'hell',
 *   init(engine),                         // once, after the engine exists
 *   ecologyOverride(street, engine)       // -> ecology entry | null, before population
 *   prepareStreet(street, engine),        // mutate labels/hub before the street is built
 *   onStreetEnter(street, engine, opts),  // spawn world entities
 *   onStreetClear(engine),                // drop references before entities are destroyed
 *   onTick(dtMs, now, engine),            // every frame
 *   onNewDay(now, engine),
 *   onEvent(counter, amount, engine)      // every badge counter the game emits
 *   verbsFor(target, engine)              // -> verb list | null for targets it owns
 *   runVerb(target, verbId, engine)       // -> true when handled
 *   travelGate(tsid, engine, meta)        // -> { ok:false, msg } blocks travel (meta.via: 'signpost' | undefined)
 *   enterGate(tsid, engine)               // -> { tsid, spawnX, spawnY } redirects an enter
 *   labelFor(tsid)                        // -> { street, hub, hubId } public street name
 *   placementGroups(population, street)   // -> [{ key, count, clearance }] extra planner groups;
 *                                         //    read the points with engine.placement(key)
 *   allowZeroEnergyMovement(engine)       // -> true lets the avatar walk at 0 energy
 *   reloadLocation(saved, engine)         // -> { tsid, x, y } overrides the saved start
 *   metabolicGate(stat, direction, engine)// -> { ok:false, msg } blocks a gain/loss
 *   physics(engine)                       // -> { speed, jump, gravity } multipliers, plus optional
 *                                         //    vyMax (terminal-speed multiplier, min wins), accel,
 *                                         //    airAccel, friction, tripleJump (multiply), airDrag
 *                                         //    (per second, max wins), jetpack (any true)
 *   packVerbs(classTsid, engine)          // -> [{ id, label, enabled, reason, tooltip, primary }]
 *                                         //    extra buttons on that item's pack popover
 *   runPackVerb(classTsid, verbId, engine)// -> true when handled
 *   mapCards(engine)                      // -> [HTMLElement] cards shown above the Map canvas
 *   furnitureRow(street, base, engine)    // -> street furniture row (base = the archived row or null),
 *                                         //    row.at[classTsid] = fixed screen points (engine.query)
 *   save()                                // -> JSON-safe slice
 *   restore(slice, engine)                // slice may be undefined on a fresh game
 * }
 *
 * Targets a feature registers carry `featureId`, so verbs route back to it.
 */

/**
 * @param {object[]} features
 * @returns {object}
 */
export function createFeatureHost(features = []) {
  const list = [];
  const byId = new Map();
  for (const feature of features) {
    if (!feature || typeof feature.id !== 'string' || !feature.id) {
      throw new Error('Every feature needs a string id.');
    }
    if (byId.has(feature.id)) throw new Error(`Duplicate feature id: ${feature.id}`);
    byId.set(feature.id, feature);
    list.push(feature);
  }

  const each = (hook, ...args) => {
    for (const feature of list) {
      if (typeof feature[hook] === 'function') feature[hook](...args);
    }
  };
  const first = (hook, ...args) => {
    for (const feature of list) {
      if (typeof feature[hook] !== 'function') continue;
      const out = feature[hook](...args);
      if (out != null) return out;
    }
    return null;
  };
  const owner = (target) => (target?.featureId ? byId.get(target.featureId) || null : null);

  return {
    features: list,
    get(id) {
      return byId.get(id) || null;
    },
    init(engine) {
      each('init', engine);
    },
    ecologyOverride(street, engine) {
      return first('ecologyOverride', street, engine);
    },
    prepareStreet(street, engine) {
      each('prepareStreet', street, engine);
    },
    streetEnter(street, engine, opts = {}) {
      each('onStreetEnter', street, engine, opts);
    },
    streetClear(engine) {
      each('onStreetClear', engine);
    },
    tick(dtMs, now, engine) {
      each('onTick', dtMs, now, engine);
    },
    newDay(now, engine) {
      each('onNewDay', now, engine);
    },
    /** A game event counter (`group:label`, the badge counters) and amount. */
    event(counter, amount, engine) {
      each('onEvent', counter, amount, engine);
    },
    /** Verb list for a feature-owned target, or null when no feature owns it. */
    verbsFor(target, engine) {
      const feature = owner(target);
      if (!feature || typeof feature.verbsFor !== 'function') return null;
      return feature.verbsFor(target, engine) || [];
    },
    /**
     * A target's own (content.js) verb list passed through every feature's
     * decorateVerbs(target, verbs, engine), which returns a new list or null
     * to leave it alone (tree poison adds and hides tree verbs).
     */
    decorateVerbs(target, verbs, engine) {
      let out = verbs;
      for (const feature of list) {
        if (typeof feature.decorateVerbs !== 'function') continue;
        const next = feature.decorateVerbs(target, out, engine);
        if (Array.isArray(next)) out = next;
      }
      return out;
    },
    runVerb(target, verbId, engine) {
      const feature = owner(target);
      if (!feature || typeof feature.runVerb !== 'function') return false;
      return feature.runVerb(target, verbId, engine) === true;
    },
    travelGate(tsid, engine, meta = {}) {
      for (const feature of list) {
        if (typeof feature.travelGate !== 'function') continue;
        const gate = feature.travelGate(tsid, engine, meta);
        if (gate && gate.ok === false) return gate;
      }
      return { ok: true };
    },
    enterGate(tsid, engine) {
      return first('enterGate', tsid, engine);
    },
    /** Concatenated array answers from every feature implementing `hook`. */
    collect(hook, ...args) {
      const out = [];
      for (const feature of list) {
        if (typeof feature[hook] !== 'function') continue;
        const rows = feature[hook](...args);
        if (Array.isArray(rows)) out.push(...rows);
      }
      return out;
    },
    /** First non-null answer from any feature implementing `hook`. */
    query(hook, ...args) {
      return first(hook, ...args);
    },
    metabolicGate(stat, direction, engine) {
      for (const feature of list) {
        if (typeof feature.metabolicGate !== 'function') continue;
        const gate = feature.metabolicGate(stat, direction, engine);
        if (gate && gate.ok === false) return gate;
      }
      return { ok: true };
    },
    physics(engine) {
      const out = { speed: 1, jump: 1, gravity: 1 };
      // Street-physics extras (location-events) appear only when a feature sets them.
      for (const feature of list) {
        if (typeof feature.physics !== 'function') continue;
        const p = feature.physics(engine) || {};
        for (const key of ['speed', 'jump', 'gravity', 'accel', 'airAccel', 'friction', 'tripleJump']) {
          if (Number.isFinite(p[key])) out[key] = (out[key] ?? 1) * p[key];
        }
        if (Number.isFinite(p.vyMax) && p.vyMax > 0) out.vyMax = out.vyMax == null ? p.vyMax : Math.min(out.vyMax, p.vyMax);
        if (Number.isFinite(p.airDrag) && p.airDrag > 0) out.airDrag = Math.max(out.airDrag || 0, p.airDrag);
        if (p.jetpack === true) out.jetpack = true;
      }
      return out;
    },
    /** Pack popover verbs every feature offers for one item class. */
    packVerbs(classTsid, engine) {
      const out = [];
      for (const feature of list) {
        if (typeof feature.packVerbs !== 'function') continue;
        for (const verb of feature.packVerbs(classTsid, engine) || []) {
          if (verb && typeof verb.id === 'string') out.push({ ...verb, featureId: feature.id });
        }
      }
      return out;
    },
    /** Route a pack verb to the feature that offered it (or the first that handles it). */
    runPackVerb(classTsid, verbId, engine, featureId = '') {
      const owners = featureId && byId.has(featureId) ? [byId.get(featureId)] : list;
      for (const feature of owners) {
        if (typeof feature.runPackVerb !== 'function') continue;
        if (feature.runPackVerb(classTsid, verbId, engine) === true) return true;
      }
      return false;
    },
    /** { [featureId]: slice } for the player save. */
    save() {
      const out = {};
      for (const feature of list) {
        if (typeof feature.save !== 'function') continue;
        const slice = feature.save();
        if (slice !== undefined) out[feature.id] = JSON.parse(JSON.stringify(slice));
      }
      return out;
    },
    restore(slices = {}, engine) {
      for (const feature of list) {
        if (typeof feature.restore === 'function') {
          feature.restore(slices?.[feature.id], engine);
        }
      }
    },
  };
}

/**
 * Normalize the saved feature map: keep plain-object slices under safe ids.
 * Each feature still normalizes its own slice in restore().
 */
export function normalizeFeatureSlices(seed = {}) {
  const out = {};
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) return out;
  for (const [id, slice] of Object.entries(seed)) {
    if (!/^[a-z][a-z0-9-]{0,40}$/.test(id)) continue;
    if (!slice || typeof slice !== 'object') continue;
    out[id] = JSON.parse(JSON.stringify(slice));
  }
  return out;
}
