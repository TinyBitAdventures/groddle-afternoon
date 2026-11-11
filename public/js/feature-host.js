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
 *   onEvent(counter, amount, engine, detail) // every badge counter the game emits; detail is optional ({ animal } on feeds)
 *   verbsFor(target, engine)              // -> verb list | null for targets it owns
 *   runVerb(target, verbId, engine)       // -> true when handled
 *   travelGate(tsid, engine, meta)        // -> { ok:false, msg } blocks travel (meta.via: 'signpost' | undefined)
 *   enterGate(tsid, engine)               // -> { tsid, spawnX, spawnY } redirects an enter
 *   labelFor(tsid)                        // -> { street, hub, hubId } public street name
 *   placementGroups(population, street)   // -> [{ key, count, clearance }] extra planner groups;
 *                                         //    read the points with engine.placement(key)
 *   reloadLocation(saved, engine)         // -> { tsid, x, y } overrides the saved start
 *   metabolicGate(stat, direction, engine)// -> { ok:false, msg } blocks a gain/loss
 *   physics(engine)                       // -> { speed, jump, gravity } multipliers, plus optional
 *                                         //    vyMax (terminal-speed multiplier, min wins), accel,
 *                                         //    airAccel, friction, tripleJump (multiply), airDrag
 *                                         //    (per second, max wins), airFriction (signed
 *                                         //    friction_air, max wins), jetpack (any true)
 *   packVerbs(classTsid, engine, opts)    // -> [{ id, label, enabled, reason, tooltip, primary }]
 *                                         //    extra buttons on that item's pack popover;
 *                                         //    opts.copy: which of the class's copies the menu is
 *                                         //    about (js/tools.js, its place in pack order), or null
 *   runPackVerb(classTsid, verbId, engine, opts) // -> true when handled (opts as packVerbs)
 *   packOwnDrop(classTsid, engine)        // -> true when the class's packVerbs carry its own drop:
 *                                         //    the popover's general Drop row is left out (engine.query)
 *   packDrop(classTsid, at, engine)       // -> { ok, msg } when the feature puts that class down itself
 *                                         //    (Drop, or a Decoration Mode drag to world point `at`),
 *                                         //    else null and the general drop rules run (engine.query)
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
 * The page's error event for an error the game caught and survived: the console shows it
 * (reportError logs it as uncaught) and the report form's error list hears it
 * (bug-report-feature's window 'error' listener, which names `where` from err.groddleWhere).
 */
export function reportPageError(where, err) {
  try {
    if (err && typeof err === 'object') err.groddleWhere = where;
  } catch { /* a frozen error keeps its own words */ }
  console.error(`[groddle] ${where} threw; the game goes on.`);
  if (typeof globalThis.reportError === 'function') globalThis.reportError(err);
  else console.error(err);
}

/**
 * Report 116: one throw in a per-frame call used to stop the game loop for good (Pixi's ticker
 * asks for the next frame only after its listeners return), freezing the view while the page
 * around it went on. A guard reports each error once per place and message (`where`, e.g. a
 * feature id and hook) and lets the frame go on; a call that throws every frame is reported
 * once, not 60 times a second. At most `limit` different errors are reported.
 */
export function createErrorOnce({ report = reportPageError, limit = 40 } = {}) {
  const seen = new Set();
  const once = (where, err) => {
    const key = `${where}|${err?.message ?? err}`;
    if (seen.has(key) || seen.size >= limit) return false;
    seen.add(key);
    try {
      report(where, err);
    } catch { /* the reporter itself never stops the loop */ }
    return true;
  };
  once.seen = seen;
  return once;
}

/**
 * @param {object[]} features
 * @param {{ onError?: (where: string, err: unknown) => void }} [opts] who hears a feature's
 *   per-frame throw (default reportPageError)
 * @returns {object}
 */
export function createFeatureHost(features = [], { onError } = {}) {
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
  // Every-frame hooks: one feature's throw is reported once (with its id) and the rest still run.
  const failed = createErrorOnce(onError ? { report: onError } : {});
  const eachGuarded = (hook, ...args) => {
    for (const feature of list) {
      if (typeof feature[hook] !== 'function') continue;
      try {
        feature[hook](...args);
      } catch (err) {
        failed(`${feature.id}.${hook}`, err);
      }
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
      eachGuarded('onTick', dtMs, now, engine);
    },
    /** QA: the per-frame errors caught so far (`<feature>.<hook>|<message>`). */
    caught() {
      return [...failed.seen];
    },
    newDay(now, engine) {
      each('onNewDay', now, engine);
    },
    /** A game event counter (`group:label`, the badge counters) and amount. */
    event(counter, amount, engine, detail) {
      each('onEvent', counter, amount, engine, detail);
    },
    /**
     * Verb list for a feature-owned target, or null when no feature owns it.
     * Other features may add rows to it with extraVerbs(target, engine) (a
     * quest's verb on any NPC, as the source's npc base verbs were: G447).
     */
    verbsFor(target, engine) {
      const feature = owner(target);
      if (!feature || typeof feature.verbsFor !== 'function') return null;
      const own = feature.verbsFor(target, engine) || [];
      let out = own;
      for (const other of list) {
        if (other === feature || typeof other.extraVerbs !== 'function') continue;
        const rows = other.extraVerbs(target, engine);
        if (Array.isArray(rows) && rows.length) out = [...out, ...rows];
      }
      return out;
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
        // A street's signed friction_air (js/avatar-step.js airFriction); the most drag wins.
        if (Number.isFinite(p.airFriction)) out.airFriction = out.airFriction == null ? p.airFriction : Math.max(out.airFriction, p.airFriction);
        if (p.jetpack === true) out.jetpack = true;
      }
      return out;
    },
    /** Pack popover verbs every feature offers for one item class. */
    packVerbs(classTsid, engine, opts = {}) {
      const out = [];
      for (const feature of list) {
        if (typeof feature.packVerbs !== 'function') continue;
        for (const verb of feature.packVerbs(classTsid, engine, opts) || []) {
          if (verb && typeof verb.id === 'string') out.push({ ...verb, featureId: feature.id });
        }
      }
      return out;
    },
    /** Route a pack verb to the feature that offered it (or the first that handles it). */
    runPackVerb(classTsid, verbId, engine, featureId = '', opts = {}) {
      const owners = featureId && byId.has(featureId) ? [byId.get(featureId)] : list;
      for (const feature of owners) {
        if (typeof feature.runPackVerb !== 'function') continue;
        if (feature.runPackVerb(classTsid, verbId, engine, opts) === true) return true;
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
