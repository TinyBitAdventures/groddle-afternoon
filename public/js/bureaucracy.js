/**
 * Bureaucratic Hall clerks after the Card-Carrying Qualification: Your Papers
 * and the General Building Permit that street projects ask for.
 *
 * Source (glitch-GameServerJS, CC0):
 * - items/catalog_stores.js store 17 "Bureaucracy": card_carrying_qualification
 *   50, your_papers 100, general_building_permit 500 (buy_multiplier 0)
 * - items/npc_bureaucrat.js getItems: the card only until you have its badge;
 *   anything else needs Bureaucratic Arts I; the permit needs Bureaucratic
 *   Arts II. The halls are on Gregarious Grange, Baeli Bray and Chego Chase.
 * - items/your_papers.js complete: needs the card_carrying_qualification badge,
 *   grants you_have_papers (the Bureaucratic Arts II prerequisite) and is used
 *   up.
 *
 * The Legalize It quest (js/legalize-it.js) walks a new player through buying
 * the card inside the Hall; the street clerk also sells it, like getItems,
 * to anyone without the badge (no Bureaucratic Arts needed). Street projects
 * such as job_street_ph4_02c ask for Card-Carrying Qualifications.
 */

import { addItem, countItem, removeItem } from './inventory.js?v=catalog-unified-5';

export const BUREAUCRACY_STORE_ID = 17;
export const CARD_BADGE = 'card_carrying_qualification';
export const PAPERS_BADGE = 'you_have_papers';
export const PAPERS = 'your_papers';
export const PERMIT = 'general_building_permit';

/** Streets whose Bureaucratic Hall the clerk stands outside (npc_bureaucrat.js intro). */
export const HALL_STREETS = Object.freeze({
  GLI32G3NUTD100I: 'Gregarious Grange',
  GA91JUQT2G82GUL: 'Baeli Bray',
  GA5I10NJDL52TKD: 'Chego Chase',
});

export const BUREAUCRACY_ITEMS = Object.freeze({
  card_carrying_qualification: Object.freeze({
    label: 'Card-Carrying Qualification',
    cost: 50,
    skill: null,
    untilBadge: CARD_BADGE,
    desc: 'This is the most basic, entry-level, bureaucratic item of all. Being qualified to carry cards is a prerequisite to becoming the sort of person who can have Papers at all, let alone Papers which are in order.',
  }),
  your_papers: Object.freeze({
    label: 'Your Papers',
    cost: 100,
    skill: 'bureaucraticarts_1',
    desc: 'Here is a full yet incomplete set of all the papers a person might require in order that they may prove, justify or otherwise provide evidence that their papers are in order.',
  }),
  general_building_permit: Object.freeze({
    label: 'General Building Permit',
    cost: 500,
    skill: 'bureaucraticarts_2',
    desc: 'This general (adj.) building (adj.-n.) permit (n.) is quite official and permits (v.), in the general sense, building (v.).',
  }),
});

/**
 * The clerk's menu, with why each document is unavailable. The card is left
 * off once you hold its badge (npc_bureaucrat.js getItems `continue`).
 */
export function clerkOffers(learned = [], achievements = []) {
  const hasCard = achievements.includes(CARD_BADGE);
  const rows = Object.entries(BUREAUCRACY_ITEMS).filter(([, def]) => !(def.untilBadge && achievements.includes(def.untilBadge)));
  return rows.map(([classTsid, def]) => {
    let reason = '';
    if (!def.skill) reason = ''; // the card: anyone without its badge
    else if (!learned.includes('bureaucraticarts_1')) reason = "Go away, we don't have time to waste on people who have not learned any Bureaucratic Arts.";
    else if (!learned.includes(def.skill)) reason = 'You need Bureaucratic Arts II for a General Building Permit.';
    else if (!hasCard) reason = 'You need the Card-Carrying Qualification first.';
    return { classTsid, label: def.label, cost: def.cost, ok: !reason, reason };
  });
}

export function buyDocument(pc, inv, classTsid, learned = [], achievements = []) {
  const offer = clerkOffers(learned, achievements).find((o) => o.classTsid === classTsid);
  if (!offer) return { ok: false, reason: 'unknown', msg: 'The clerk does not deal in that.' };
  if (!offer.ok) return { ok: false, reason: 'gate', msg: offer.reason };
  if ((pc.currants || 0) < offer.cost) return { ok: false, reason: 'broke', msg: `That will be ${offer.cost} currants (you have ${pc.currants || 0}).` };
  pc.currants -= offer.cost;
  addItem(inv, classTsid, 1);
  return { ok: true, cost: offer.cost, msg: `You bought ${offer.label} for ${offer.cost} currants.` };
}

/** your_papers.js complete. Returns whether the badge should be granted. */
export function completePapersCheck(inv, achievements = []) {
  if (countItem(inv, PAPERS) < 1) return { ok: false, reason: 'missing', msg: 'You have no papers to fill out.' };
  if (!achievements.includes(CARD_BADGE)) return { ok: false, reason: 'card', msg: 'You need the Card-Carrying Qualification to use this.' };
  if (achievements.includes(PAPERS_BADGE)) return { ok: false, reason: 'done', msg: 'You have already completed this.' };
  return { ok: true };
}

export function completePapers(inv, achievements = []) {
  const check = completePapersCheck(inv, achievements);
  if (!check.ok) return check;
  removeItem(inv, PAPERS, 1);
  return { ok: true, badge: PAPERS_BADGE, msg: 'You completed Your Papers' };
}
