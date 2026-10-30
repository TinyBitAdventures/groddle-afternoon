/**
 * Furniture upgrades (register G358): a placed piece can carry an upgrade
 * (a style) that changes its art and name. Pure rules, no Pixi or DOM.
 *
 * Sources (tinyspeck/glitch-GameServerJS, glitch-client; CC0):
 * - items/include/furniture.js getUpgrades 236-286: the class's catalog rows,
 *   plus the plain piece as upgrade 0 when the class can_revert_to_base;
 *   is_owned = hasUpgrade(id) (351-359: the piece's upgrade_history has it).
 *   getLabel 168-173: an upgraded piece is called by its upgrade's name.
 * - items/include/furniture.js applyUpgrade 1-86: upgrade_history gets
 *   { from, to, when, who }, upgrade_id is set, and
 *   achievements_increment("upgraded", class, 1) (48).
 * - players/inc_furniture.js furniture_upgrade_purchase 737-785: 'Invalid
 *   upgrade', 'Already upgraded'; free (credits_cost 0) or owned upgrades
 *   apply at once, others go to the credits webapp ("You don't have enough
 *   credits.").
 * - items/furniture_*.js verbs.upgrade (sort_on 56, "Change it", only while
 *   upgrade_id is 0) and verbs.change_style (57, only once upgraded): both
 *   open the picker; "Cannot be upgraded while it's for sale".
 * - glitch-client HandOfDecorator.as startFurnitureUpgrade 456-515: hidden
 *   upgrades are dropped (FurnUpgrade.parseMultiple), the list is sorted by
 *   is_owned (owned first), credits, id (482), and the piece's current upgrade
 *   goes to the top, marked owned (496). FurnUpgradeDialog.as: "Choose a new style",
 *   "Choose a style from the right", "Change style", "Change style for FREE!",
 *   "Change style for N credits". FurnUpgradeButton.as setText: "Free for
 *   everyone", "N credits", "You own this" (owned and costs credits).
 * - items/construction_tool.js onMakingComplete 334-381 and
 *   inc_data_imagination.js 2037-2120: Bonus Furniture Upgrade I / II / III.
 *
 * Remake decisions:
 * - Credits were real money. Upgrades with credits_cost 0 are free to choose.
 *   Paid ones (Austin 2026-10-27, lane FURNSELL) are bought with currants at
 *   CURRANTS_PER_CREDIT, the rate players themselves sold credit styles at
 *   (see the constant). The Bonus Furniture Upgrade cards still hand out a
 *   paid style for nothing, as in the source.
 * - The remake has no subscription (home-styles.js drops the same gate), so
 *   subscriber_only does not lock a free upgrade.
 * - The base piece is upgrade '' (the source's 0) and its art is the class's
 *   recovered frame.
 */

import { FURNITURE_UPGRADES } from './furniture-upgrades-data.js?v=56706fb9';

export { FURNITURE_UPGRADES };

export const UPGRADE_TEXT = Object.freeze({
  verbUpgrade: 'Upgrade',
  verbChange: 'Change style',
  verbTip: 'Change it',
  title: 'Choose a new style',
  pick: 'Choose a style from the right',
  change: 'Change style',
  changeFree: 'Change style for FREE!',
  freeForEveryone: 'Free for everyone',
  owned: 'You own this',
  invalid: 'Invalid upgrade',
  already: 'Already upgraded',
  forSale: "Cannot be upgraded while it's for sale",
  // FurnUpgradeDialog.as updateCredits 579-613 and furniture_upgrade_purchase
  // (inc_furniture.js 781), with currants for credits (lane FURNSELL).
  youHave: 'You have',
  needCurrants: 'You need more currants',
  notEnough: "You don't have enough currants.",
  cancel: 'Cancel',
});

/**
 * Currants a paid style costs per credit of its credits_cost (lane FURNSELL,
 * reimagined: the source sold credits for money and never priced a style in
 * currants). The rate is the one players sold credit-upgraded furniture at in
 * the game's Marketplace forum in 2012 (research/wayback/raw/forum/
 * marketplace-threads.tsv, thread titles): 2k a credit at first (lines 1751,
 * 1792, 1929; 3498 offers 50k for a 25 credit table), 1.5k by the autumn
 * (1842, 1925, 1955, 2031, 2109, 2115), then 1k (1817, 2080, 2577, 2662,
 * 2846, 3004, 3038, 3069, 3155, 3307) with one 700 (3014), and the last
 * "Master list of affordable furniture sellers - incl. Credit (1k per)"
 * (3446, on the forum front page of 2012-11-12). So a 15 credit Chair is
 * 15,000 currants against the plain Chair's 450.
 */
export const CURRANTS_PER_CREDIT = 1000;

/** What a style costs in currants (0 for a free one). */
export function styleCurrants(credits) {
  return Math.max(0, Math.floor(Number(credits) || 0)) * CURRANTS_PER_CREDIT;
}

/** "25,000 currants" (FurnUpgradeButton's "N credits", in currants). */
export function currantsText(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return `${v.toLocaleString('en-US')} ${v === 1 ? 'currant' : 'currants'}`;
}

/** The dialog's purse line, "You have 1,200 currants" (credits_holder). */
export function purseText(currants) {
  return `${UPGRADE_TEXT.youHave} ${currantsText(currants)}`;
}

/** construction_tool.js 334: if (!is_chance(0.05)) return. */
export const BONUS_UPGRADE_CHANCE = 0.05;
/** construction_tool.js 367: credits_cost <= 25 && credits_cost > 0. */
export const BONUS_UPGRADE_MAX_CREDITS = 25;
export const BONUS_CARDS = Object.freeze(['furnituremaking_bonus_upgrade_1', 'furnituremaking_bonus_upgrade_2', 'furnituremaking_bonus_upgrade_3']);

/** "The Giants must have favored you..." (construction_tool.js 381). */
export function bonusUpgradeLine(name) {
  return `The Giants must have favored you. The item you just crafted was magically upgraded to a ${name}.`;
}

export function classUpgrades(classTsid) {
  return FURNITURE_UPGRADES[classTsid] || null;
}

export function hasUpgrades(classTsid) {
  return Boolean(FURNITURE_UPGRADES[classTsid]);
}

/** A saved upgrade id for this class: '' (base) or a catalog id with art. */
export function cleanUpgradeId(classTsid, id) {
  const key = String(id ?? '').replace(/[^0-9]/g, '').slice(0, 6);
  if (!key || key === '0') return '';
  return FURNITURE_UPGRADES[classTsid]?.upgrades?.[key]?.art ? key : '';
}

/** How many upgrade_history rows a piece keeps. */
export const HISTORY_LIMIT = 40;

/**
 * upgrade_history rows ({ from, to, when }), ids as strings. Past
 * HISTORY_LIMIT the oldest row of a style seen again later goes first, so a
 * style bought with currants stays owned however often the piece changes
 * (lane FURNSELL; no class has more than 48 styles).
 */
export function cleanHistory(rows) {
  if (!Array.isArray(rows)) return [];
  let list = rows.filter((row) => row && typeof row === 'object');
  if (list.length > HISTORY_LIMIT) {
    const key = (row) => String(row.to ?? '').replace(/[^0-9]/g, '').slice(0, 6) || '0';
    const lastAt = new Map(list.map((row, i) => [key(row), i]));
    const extra = list.length - HISTORY_LIMIT;
    let dropped = 0;
    list = list.filter((row, i) => {
      if (dropped < extra && lastAt.get(key(row)) !== i) {
        dropped += 1;
        return false;
      }
      return true;
    });
    // Still long: only distinct styles are left; keep each one's latest row.
    if (list.length > 64) list = list.slice(-64);
  }
  const out = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const to = String(row.to ?? '').replace(/[^0-9]/g, '').slice(0, 6) || '0';
    const from = String(row.from ?? '').replace(/[^0-9]/g, '').slice(0, 6) || '0';
    const when = Math.max(0, Math.floor(Number(row.when) || 0));
    out.push({ from, to, when });
  }
  return out;
}

/** The catalog row of a piece's upgrade, or null for the base piece. */
export function upgradeRow(classTsid, id) {
  const key = cleanUpgradeId(classTsid, id);
  return key ? FURNITURE_UPGRADES[classTsid].upgrades[key] : null;
}

/** The art a piece draws with: its upgrade's frame, or null (use the class's). */
export function upgradeArt(classTsid, id) {
  return upgradeRow(classTsid, id)?.art || null;
}

/** getLabel: an upgraded piece goes by its upgrade's name. */
export function pieceLabel(piece, baseLabel) {
  return upgradeRow(piece?.classTsid, piece?.upgradeId)?.name || baseLabel;
}

/** hasUpgrade: the piece was upgraded to `id` before (upgrade_history). */
export function pieceOwns(piece, id) {
  const key = String(id);
  return (piece?.upgradeHistory || []).some((row) => row.to === key);
}

/** verbs.upgrade (base piece) or verbs.change_style (upgraded piece). */
export function upgradeVerb(piece) {
  if (!hasUpgrades(piece?.classTsid)) return null;
  const upgraded = Boolean(cleanUpgradeId(piece.classTsid, piece.upgradeId));
  return { id: upgraded ? 'change_style' : 'upgrade', label: upgraded ? UPGRADE_TEXT.verbChange : UPGRADE_TEXT.verbUpgrade, tooltip: UPGRADE_TEXT.verbTip };
}

/**
 * The picker's list for a piece: getUpgrades (+ the base piece when the class
 * can revert), hidden rows dropped, sorted owned first, then credits, then id,
 * and the current upgrade on top (marked owned). Each option:
 * { id ('0' = base), label, credits, currants (its price, 0 when free or
 * owned), owned, current, paid (bought with currants), art, isNew, text }.
 */
export function listUpgrades(piece, baseLabel = '') {
  const def = FURNITURE_UPGRADES[piece?.classTsid];
  if (!def) return [];
  const current = cleanUpgradeId(piece.classTsid, piece.upgradeId) || '0';
  const rows = [];
  if (def.canRevert) {
    rows.push({ id: '0', label: baseLabel, credits: 0, art: null, isNew: false });
  }
  for (const [id, row] of Object.entries(def.upgrades)) {
    if (!row.art) continue;
    if (!row.visible && id !== current) continue;
    rows.push({ id, label: row.name, credits: row.credits, art: row.art, isNew: Boolean(row.isNew) });
  }
  for (const row of rows) {
    row.owned = pieceOwns(piece, row.id);
    row.current = row.id === current;
  }
  rows.sort((a, b) => Number(b.owned) - Number(a.owned) || a.credits - b.credits || Number(a.id) - Number(b.id));
  const at = rows.findIndex((row) => row.current);
  if (at > 0) rows.unshift(...rows.splice(at, 1));
  if (at >= 0) rows[0].owned = true;
  for (const row of rows) {
    row.paid = row.credits > 0 && !row.owned;
    row.currants = row.paid ? styleCurrants(row.credits) : 0;
    row.text = row.owned && row.credits ? UPGRADE_TEXT.owned
      : row.paid ? currantsText(row.currants)
        : UPGRADE_TEXT.freeForEveryone;
  }
  return rows;
}

/** Whether the list has styles to buy (the dialog shows the purse then: credits_holder, 367-368). */
export function listHasPaid(options) {
  return (options || []).some((row) => row.paid);
}

/**
 * FurnUpgradeDialog's save button for a chosen option (setButtonToChosen
 * 552-565 and updateCredits 579-613): "Change style for N currants" for a
 * style to buy, turned off with "You need more currants" when the purse
 * (`currants`) is short. `short` marks the purse line low (furn_upgrade_credits_low).
 */
export function saveButtonText(piece, option, { currants = 0 } = {}) {
  const current = cleanUpgradeId(piece?.classTsid, piece?.upgradeId) || '0';
  if (!option || option.id === current) return { text: UPGRADE_TEXT.pick, disabled: true };
  if (option.owned) return { text: UPGRADE_TEXT.change, disabled: false };
  if (option.paid) {
    const cost = option.currants || styleCurrants(option.credits);
    const text = `${UPGRADE_TEXT.change} for ${currantsText(cost)}`;
    if ((Number(currants) || 0) >= cost) return { text, disabled: false, cost };
    return { text, disabled: true, cost, short: true, tip: UPGRADE_TEXT.needCurrants };
  }
  return { text: UPGRADE_TEXT.changeFree, disabled: false };
}

/**
 * furniture_upgrade_purchase + applyUpgrade. A free or owned style applies at
 * once; a paid one the piece never had costs `cost` currants (the caller
 * takes them from the purse) and is refused with "You don't have enough
 * currants." when `currants` is short (inc_furniture.js 778-782, credits
 * there). Either way upgrade_history records it, so the piece owns it after.
 * @returns {{ ok: boolean, msg?: string, reason?: string, id?: string, name?: string, cost?: number }}
 */
export function applyUpgrade(piece, id, { now = Date.now(), baseLabel = '', currants = 0 } = {}) {
  const option = listUpgrades(piece, baseLabel).find((row) => row.id === String(id));
  if (!option) return { ok: false, reason: 'invalid', msg: UPGRADE_TEXT.invalid };
  const current = cleanUpgradeId(piece.classTsid, piece.upgradeId) || '0';
  if (option.id === current) return { ok: false, reason: 'already', msg: UPGRADE_TEXT.already };
  const cost = option.paid ? option.currants : 0;
  if (cost > 0 && !((Number(currants) || 0) >= cost)) return { ok: false, reason: 'currants', msg: UPGRADE_TEXT.notEnough, cost };
  piece.upgradeHistory = cleanHistory([...cleanHistory(piece.upgradeHistory), { from: current, to: option.id, when: Math.floor(now / 1000) }]);
  piece.upgradeId = option.id === '0' ? '' : option.id;
  return { ok: true, id: option.id, name: option.label, cost, counter: `upgraded:${piece.classTsid}` };
}

/**
 * The card's upgrade (construction_tool.js 380: setInstanceProp('upgrade_id')).
 * The source counted it under the tool's own class (378: this.class_id is the
 * Construction Tool); the remake counts the furniture class, as applyUpgrade does.
 * The source wrote no upgrade_history, so switching away lost a paid style the
 * client still showed as owned (HandOfDecorator.as 496: "if it's being used,
 * then they probably own it"); the remake records it so the piece keeps it.
 */
export function applyBonusUpgrade(piece, id, { now = Date.now() } = {}) {
  const key = cleanUpgradeId(piece?.classTsid, id);
  if (!key) return false;
  piece.upgradeHistory = cleanHistory([...cleanHistory(piece.upgradeHistory), { from: cleanUpgradeId(piece.classTsid, piece.upgradeId) || '0', to: key, when: Math.floor(now / 1000) }]);
  piece.upgradeId = key;
  return true;
}

/**
 * construction_tool.js onMakingComplete 334-381 for one finished recipe:
 * a 5% roll, then one of the three cards, then the recipe's skill (FM1 any
 * card, FM2 needs card II, Engineering I needs card III), then a random
 * upgrade of the made class with 0 < credits_cost <= 25 (getUpgrades, so
 * hidden rows count too). Returns null or { id, name }.
 */
export function rollBonusUpgrade({ recipe, owned = [], rand = Math.random, classTsid } = {}) {
  if (!(rand() < BONUS_UPGRADE_CHANCE)) return null;
  const have = new Set(owned);
  if (!BONUS_CARDS.some((id) => have.has(id))) return null;
  const skill = recipe?.skill;
  if (skill !== 'furnituremaking_1' && skill !== 'furnituremaking_2' && skill !== 'engineering_1') return null;
  if (skill === 'furnituremaking_2' && !have.has(BONUS_CARDS[1])) return null;
  if (skill === 'engineering_1' && !have.has(BONUS_CARDS[2])) return null;
  const cls = classTsid || recipe?.outputs?.[0]?.classTsid;
  const def = FURNITURE_UPGRADES[cls];
  if (!def) return null;
  const keys = Object.entries(def.upgrades)
    .filter(([, row]) => row.art && row.credits > 0 && row.credits <= BONUS_UPGRADE_MAX_CREDITS)
    .map(([id]) => id);
  if (!keys.length) return null;
  const id = keys[Math.min(keys.length - 1, Math.floor(rand() * keys.length))];
  return { id, name: def.upgrades[id].name, classTsid: cls };
}
