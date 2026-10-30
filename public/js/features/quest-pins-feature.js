/**
 * VERBS (phase 2): the quests you pinned from the Quests sheet, shown in the tracker under the
 * left pill (js/ui/quest-tracker.js). Up to two, in the order pinned, and whether the tracker is
 * folded to its chip. Kept as a feature slice so it rides in the player save: localStorage in
 * solo, the Minn save online (features.save() -> playerState.systems.features['quest-pins']).
 */

export const MAX_QUEST_PINS = 2;

const ID_RE = /^[a-z0-9_:-]{1,80}$/i;

/** A clean pins slice: unique quest ids, at most MAX_QUEST_PINS, and the fold flag. */
export function normalizeQuestPins(slice) {
  const pins = [];
  for (const id of Array.isArray(slice?.pins) ? slice.pins : []) {
    const s = String(id || '');
    if (ID_RE.test(s) && !pins.includes(s)) pins.push(s);
    if (pins.length >= MAX_QUEST_PINS) break;
  }
  return { pins, collapsed: slice?.collapsed === true };
}

let state = normalizeQuestPins();

export const questPinsFeature = {
  id: 'quest-pins',

  save() {
    return { pins: [...state.pins], collapsed: state.collapsed };
  },

  restore(slice) {
    state = normalizeQuestPins(slice);
  },

  pins() {
    return [...state.pins];
  },

  isPinned(classTsid) {
    return state.pins.includes(String(classTsid || ''));
  },

  /** Pin or unpin. Returns { ok, pinned, reason }: a third pin is refused (unpin one first). */
  toggle(classTsid) {
    const id = String(classTsid || '');
    if (!ID_RE.test(id)) return { ok: false, pinned: false, reason: 'unknown' };
    if (state.pins.includes(id)) {
      state.pins = state.pins.filter((p) => p !== id);
      return { ok: true, pinned: false };
    }
    if (state.pins.length >= MAX_QUEST_PINS) return { ok: false, pinned: false, reason: 'full' };
    state.pins = [...state.pins, id];
    return { ok: true, pinned: true };
  },

  /** Drop pins whose quest is no longer active (finished, abandoned). Returns true when any went. */
  keepOnly(activeIds) {
    const keep = new Set(activeIds || []);
    const next = state.pins.filter((p) => keep.has(p));
    if (next.length === state.pins.length) return false;
    state.pins = next;
    return true;
  },

  collapsed() {
    return state.collapsed;
  },

  setCollapsed(on) {
    state.collapsed = Boolean(on);
  },
};
