/**
 * G1073 (chat 2026-11-20, Austin's ruling: explain the board, no balance change): players at a
 * street project board read "needs Master Chef II" on a work step that had not opened yet as a rule
 * for joining, and nothing said that anyone can give the items or where an item comes from.
 *
 * In Glitch an item ask needs no skill (quest.js 1471: any player with the item can contribute);
 * only tool work needs the tool and the skill (quest.js 942-986, 1489). So the board:
 * - says so in one line (JOB_ASK_TEXT.rule) while the project takes contributions;
 * - names a work step's skill only once that step is open (a locked step says it opens later);
 *   G802 (Austin 2026-11-21, approved after G1073) then puts it back on a locked step too: players
 *   gathered a phase's items and only learned at the work step that they lacked its skill. So every
 *   work step not done names its skill, and says so when you have not learned it (Glitch's "You don't
 *   know <skill>." from quest.js 978, shown here before the step opens); the rule line above the asks
 *   still says that skills are only for tool work, so it does not read as a rule for joining;
 * - links each item ask still open to the item's Encyclopedia page, at its "In the remake" part
 *   (How to get it: vendors, gardens, recipes; tools/encyclopedia), the page the pack's item card
 *   links to (js/encyclopedia-links.js). An item with no page gets no link; nothing is made up here.
 */

import { SITE_PAGE_WHERE } from './site-pages.js?v=9b3049cf';

export const JOB_ASK_TEXT = Object.freeze({
  rule: 'Anyone can give items. Skills are only needed for tool work.',
  getIt: 'Where to get it',
  /** `where`: js/site-pages.js sitePageWhere (over the game in the Home Screen app, else in a new tab). */
  getItTip: (where = SITE_PAGE_WHERE.tab) => `Opens its Encyclopedia page ${where}`,
  noSkillNearStart: 'no skill needed this close to the start',
  // G802: after the skill's name when you have not learned it.
  notLearned: "you don't know it yet",
});

/**
 * #641: what an item ask's part takes to make, on the project row itself. Glitch's job window named
 * each item as a link (JobDetailsUI.as 195-197: "We need 16 more Wall Segments"), and the item's info
 * card it opened said how it is made and with which skills; a player gathering a Tower's parts only
 * learned at the Construction Tool that Wall Segments need Furnituremaking II. The row now says it:
 * the tool, every skill the recipe takes, and the ones you have not learned.
 * @param {object} r a requirement row ({ type, classId, done })
 * @param {{ recipesFor: (cls: string) => object[], skillLabel?: (id: string) => string, itemName?: (cls: string) => string, learned?: string[] }} ctx
 * @returns {{ text: string, missing: string[] } | null}
 */
export function itemMakeNote(r, { recipesFor, skillLabel = (id) => String(id), itemName = (id) => String(id), learned = [] } = {}) {
  if (!r || r.type !== 'item' || r.done || !r.classId || typeof recipesFor !== 'function') return null;
  const known = new Set(learned || []);
  const skillsOf = (x) => [...new Set((x.skills?.length ? x.skills : [x.skill]).filter(Boolean))];
  // The recipe you are closest to: fewest skills you lack, then fewest skills.
  const ways = (recipesFor(r.classId) || []).map((x) => ({ x, skills: skillsOf(x) }))
    .map((w) => ({ ...w, missing: w.skills.filter((s) => !known.has(s)) }))
    .sort((a, b) => a.missing.length - b.missing.length || a.skills.length - b.skills.length);
  const best = ways[0];
  if (!best || !best.skills.length) return null;
  const list = (ids) => {
    const names = ids.map(skillLabel);
    return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  };
  const tool = best.x.tool ? itemName(best.x.tool) : '';
  const made = tool ? `made with ${/^[aeiou]/i.test(tool) ? 'an' : 'a'} ${tool}, ` : '';
  const lack = best.missing.length ? `; you don't know ${list(best.missing)} yet` : '';
  const text = `${made}needs ${list(best.skills)}${lack}`;
  return { text: text[0].toUpperCase() + text.slice(1), missing: best.missing };
}

/** The item page's "In the remake" heading (tools/encyclopedia: How to get it is under it). */
export const ITEM_GET_ANCHOR = '#remake-h';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** PURE: 'furnituremaking_2' -> 'Furnituremaking II' (the source's requirement wording); `skills` is the skill catalog. */
export function skillRankLabel(id, skills = null) {
  const name = skills?.[id]?.name || String(id).replace(/_\d+$/, '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  const rank = Number(String(id).match(/_(\d+)$/)?.[1]);
  return rank ? `${name} ${ROMAN[rank] || rank}` : name;
}

/** PURE: true when the board shows the rule line: the project takes contributions and asks for items or work. */
export function showAskRule(reqs, open) {
  return Boolean(open) && (reqs || []).some((r) => !r.done && (r.type === 'item' || r.type === 'work'));
}

/**
 * PURE: the skill words on a work row, '' for none. G802: every work step not done names its skill,
 * the locked ones too, so a player sees it before gathering the phase's items; with `learned` (the
 * skills you know) a skill you lack says so. Report #425: solo near the start the skill is lower
 * (skillWas the source's) or waived.
 * @param {object} r a phaseRequirements row
 * @param {(id: string) => string} [skillLabel]
 * @param {string[]|null} [learned] the skills you know, or null to leave the mark out
 */
export function workSkillNote(r, skillLabel = (id) => String(id), learned = null) {
  if (!r || r.type !== 'work' || r.done) return '';
  if (r.skillWas && !r.skill) return JOB_ASK_TEXT.noSkillNearStart;
  if (!r.skill) return '';
  const was = r.skillWas ? ` (${ROMAN[Number(String(r.skillWas).match(/_(\d+)$/)?.[1])] || skillLabel(r.skillWas)} further out)` : '';
  const lack = Array.isArray(learned) && !learned.includes(r.skill) ? `, ${JOB_ASK_TEXT.notLearned}` : '';
  return `needs ${skillLabel(r.skill)}${was}${lack}`;
}

/** PURE: true when a work row asks for a skill you have not learned (G802: the row's mark). */
export function workSkillMissing(r, learned = []) {
  return Boolean(r && r.type === 'work' && !r.done && r.skill && !(learned || []).includes(r.skill));
}

/** PURE: the Encyclopedia subject for an item ask still open, or null (js/encyclopedia-links.js subjects). */
export function itemAskSubject(r, itemName = (id) => String(id)) {
  if (!r || r.type !== 'item' || r.done || !r.classId) return null;
  return { id: String(r.classId), name: String(itemName(r.classId) || r.classId) };
}

/** PURE: an Encyclopedia page address taken to its How to get it part. */
export function itemGetHref(href) {
  const h = String(href || '');
  if (!h) return '';
  return `${h.replace(/#.*$/, '')}${ITEM_GET_ANCHOR}`;
}
