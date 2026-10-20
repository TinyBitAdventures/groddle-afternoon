/**
 * Persistent quest flags (GSJS quests_set_flag): named facts such as
 * `resurrected` or `jump_hell_hole` that quests and badges can test later.
 * Kept as a feature so any system can set one through engine.questFlag().
 */

let flags = {};

export const questFlagsFeature = {
  id: 'quest-flags',

  save() {
    return { flags };
  },

  restore(slice) {
    flags = {};
    for (const [name, at] of Object.entries(slice?.flags || {})) {
      if (/^[a-z0-9_:-]{1,64}$/i.test(name) && Number.isFinite(at)) flags[name] = at;
    }
  },

  /** Record a flag once; returns true when it is new. */
  set(name, now = Date.now()) {
    const key = String(name || '');
    if (!key || flags[key]) return false;
    flags[key] = now;
    return true;
  },

  has(name) {
    return Boolean(flags[String(name || '')]);
  },

  all() {
    return { ...flags };
  },
};
