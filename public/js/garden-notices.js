/**
 * A home garden tells its owner when a plot dries or a crop is ready (register G405).
 * include/garden.js stateChanged 989-1049: "One of your garden plots has gone dry." when a wet
 * seeds or shoots plot dries, "One of your garden crops is ready for picking." when a plot becomes
 * a crop. notifyOwner 1060-1075: the location's owner (a street garden has none,
 * locations/inc_pols.js pols_get_owner) gets a 10 second ok prompt, and that garden stays quiet for
 * the next 10 minutes (this.last_notification, one for each garden, whichever line it was).
 *
 * The source's events ran on the server wherever the owner was, so a prompt reached them on any
 * street. An owner who was offline never saw one: prompts_add keeps it with an expiry of 10
 * seconds and prompts_get_login drops it (players/inc_prompts.js 15-16, 68-71, 155-164). So a
 * game that loads only takes its plots as they stand, and says nothing about what changed while
 * it was closed.
 */

export const GARDEN_DRY_LINE = 'One of your garden plots has gone dry.';
export const GARDEN_CROP_LINE = 'One of your garden crops is ready for picking.';
/** include/garden.js 1063: 10 * 60 seconds. */
export const GARDEN_NOTICE_GAP_MS = 10 * 60 * 1000;
/** include/garden.js 1068: timeout 10. */
export const GARDEN_NOTICE_TIMEOUT = 10;

const GROWING = new Set(['seeds', 'shoots']);

/** What the notices need of a garden's plots, to compare with the next look. */
export function plotMarks(garden) {
  const out = {};
  for (const [key, plot] of Object.entries(garden?.plots || {})) out[key] = { state: plot?.state || 'clean', wet: plot?.wet === true };
  return out;
}

/**
 * What the plots did since `before`: the line of stateChanged's dry and grow2 events, oldest kind
 * first in plot order. Only a plot in both looks counts, so a plot or a garden seen for the first
 * time says nothing.
 * @returns {string[]}
 */
export function gardenNoticeLines(before, after) {
  const lines = [];
  for (const [key, now] of Object.entries(after || {})) {
    const was = before?.[key];
    if (!was) continue;
    if (was.wet && !now.wet && GROWING.has(now.state)) lines.push(GARDEN_DRY_LINE);
    if (GROWING.has(was.state) && now.state === 'crop') lines.push(GARDEN_CROP_LINE);
  }
  return lines;
}

/** notifyOwner's own check: this garden's last prompt was long enough ago. */
export function noticeAllowed(garden, now) {
  const last = Number(garden?.lastNoticeAt) || 0;
  return !last || now - last >= GARDEN_NOTICE_GAP_MS;
}
