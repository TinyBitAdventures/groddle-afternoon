/**
 * The ledger's corrections in multiplayer (G335). The Groddle site holds
 * every multiplayer character's currants and tradeable things
 * (groddle-afternoon-site src/Ledger.php); a save write that holds more
 * than the site can account for is corrected there, the extra taken out of
 * the stored save, and the answer names it. js/save-store.js passes that
 * on as the groddle:ledger-corrected event; this takes the same amounts out
 * of the running game (as changes, so whatever happened since the write
 * still counts): the pack and purse, then the house (homes-feature
 * ledgerTakeBack, js/ledger-house.js), the places the site took them from;
 * it says so, then saves again. A correction left in the game would come
 * back with that save and be corrected again, on every save after.
 *
 * Multiplayer only (engine.mode). In solo it does nothing.
 *
 * QA: canvas data ledgerCorrected (the last correction's text);
 * window.groddleLedger.corrections.
 */

import { countItem, removeItem } from '../inventory.js?v=catalog-unified-7';
import { LEDGER_CORRECTED_EVENT } from '../save-store.js?v=mp2-2';

export const LEDGER_FEATURE_ID = 'ledger';

function n0(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Takes a correction out of a pack and purse: { items: { class: n }, currants }.
 * What the pack does not hold goes to `elsewhere(rest)`, which takes it from the
 * other places the site counts (the house: homes-feature ledgerTakeBack) and
 * answers what it took. Returns what was actually taken (a game that already
 * has less gives what it has).
 */
export function applyCorrection(inv, pc, corrected, elsewhere = null) {
  const taken = { items: {}, currants: 0 };
  const rest = {};
  for (const [c, n] of Object.entries(corrected?.items || {})) {
    const k = Math.min(n0(n), countItem(inv, c));
    if (k > 0) {
      removeItem(inv, c, k);
      taken.items[c] = k;
    }
    if (n0(n) - k > 0) rest[c] = n0(n) - k;
  }
  if (Object.keys(rest).length && typeof elsewhere === 'function') {
    for (const [c, k] of Object.entries(elsewhere(rest) || {})) {
      const got = Math.min(n0(k), rest[c] || 0);
      if (got > 0) taken.items[c] = (taken.items[c] || 0) + got;
    }
  }
  const cur = Math.min(n0(corrected?.currants), n0(pc?.currants));
  if (cur > 0) {
    pc.currants = n0(pc.currants) - cur;
    taken.currants = cur;
  }
  return taken;
}

const corrections = [];

export const ledgerFeature = {
  id: LEDGER_FEATURE_ID,

  init(engine) {
    if (engine?.mode !== 'multiplayer' || typeof globalThis.addEventListener !== 'function') return;
    globalThis.groddleLedger = { corrections };
    globalThis.addEventListener(LEDGER_CORRECTED_EVENT, (ev) => {
      const detail = ev?.detail || {};
      // The pack first, then the house (a correction left standing there came back on every save).
      const taken = applyCorrection(engine.inv, engine.pc, detail.corrected, (rest) => engine.query?.('ledgerTakeBack', rest, engine));
      const text = String(detail.text || 'Your pack was corrected: some things could not be accounted for.');
      corrections.push({ at: Date.now(), corrected: detail.corrected, taken, text });
      if (corrections.length > 20) corrections.shift();
      engine.setData?.('ledgerCorrected', text);
      engine.updateHud?.();
      engine.toast?.(text, 6000);
      engine.pushActivity?.(text);
      engine.save?.();
    });
  },
};
