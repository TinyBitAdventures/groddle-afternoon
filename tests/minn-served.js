/**
 * Sections groddle.localhost serves from Minn's own content, with no built file
 * behind them: the Groddle Wiki is the theme's wiki_entry post type
 * (minn/groddle/minn.json). Tests that check a built page's links resolve to
 * files skip these.
 */
export const MINN_SECTIONS = ['wiki/'];

/** Whether a page-relative link points into a Minn-served section. */
export function servedByMinn(ref) {
  const path = String(ref).replace(/[?#].*$/, '').replace(/^(\.\.\/|\.\/)+/, '').replace(/^\//, '');
  return MINN_SECTIONS.some((section) => path === section || path.startsWith(section));
}
