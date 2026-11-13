/**
 * A verb that spends a use or charge of one copy of an item (2026-11-04): potions, powders, Tree
 * Poison, the garden potions. Glitch kept points_remaining (tool_base) and charges (powder_base) on
 * each item, so a new bottle or jar starts full and two of a kind keep their own; js/tools.js keeps
 * them per copy ("charges" classes). The copy is the one picked in the pack (Glitch's verbs named the
 * itemstack, main.js doVerb), else the one in use (findFirst, the first in pack order). An emptied
 * copy leaves the pack from its own slot (bags-feature packTakeUnit), the others keep theirs.
 *
 * Without a tool state (a pure caller, older tests) these answer null and the caller keeps its own
 * count, as before.
 */

import { removeItem } from './inventory.js?v=f49c8998';
import { TOOL_CONDITION_CATALOG, chargesLeft, copyForVerb, setToolRemaining, useCharge } from './tools.js?v=48542c24';

/** Whether this engine keeps `classTsid` per copy. */
export function keepsCopies(engine, classTsid) {
  return Boolean(engine?.toolState && TOOL_CONDITION_CATALOG[classTsid]);
}

/** The copy a verb acts on (its place in pack order), or -1. */
export function verbCopy(engine, classTsid, copy = null) {
  return keepsCopies(engine, classTsid) ? copyForVerb(engine.toolState, classTsid, copy) : -1;
}

/** Uses or charges left in that copy, or null when the engine keeps none per copy. */
export function copyChargesLeft(engine, classTsid, copy = null) {
  if (!keepsCopies(engine, classTsid)) return null;
  return verbCopy(engine, classTsid, copy) < 0 ? 0 : chargesLeft(engine.toolState, classTsid, copy);
}

/**
 * One use off that copy; emptied, it leaves the pack (its own slot). Returns { ok, copy, left,
 * emptied }, or null when the engine keeps none per copy.
 */
export function spendCopyCharge(engine, classTsid, copy = null) {
  if (!keepsCopies(engine, classTsid)) return null;
  const at = verbCopy(engine, classTsid, copy);
  if (at < 0) return { ok: false, copy: -1, left: 0, emptied: false };
  // The slot that empties is this copy's (marked before the copy moves last in js/tools.js).
  if (chargesLeft(engine.toolState, classTsid, at) <= 1) engine.query?.('packTakeUnit', classTsid, at, 1, engine);
  const used = useCharge(engine.toolState, classTsid, at);
  if (used.emptied) removeItem(engine.inv, classTsid, 1);
  return used;
}

/**
 * The site's ledger used this copy's charge for a shared act (LedgerUse.php, use { left, spent }):
 * the copy holds what the ledger says it had before the local use, so the use that follows lands on
 * the ledger's number. `left` 0 with spent: it had one. Returns the copy, or -1.
 */
export function copyFromLedger(engine, classTsid, copy, use) {
  if (!keepsCopies(engine, classTsid) || !use) return -1;
  const at = verbCopy(engine, classTsid, copy);
  if (at < 0) return -1;
  const cap = TOOL_CONDITION_CATALOG[classTsid].capacity;
  const left = Math.max(0, Math.floor(Number(use.left) || 0));
  setToolRemaining(engine.toolState, classTsid, use.spent ? 1 : Math.min(cap - 1, left) + 1, { copy: at });
  return at;
}
