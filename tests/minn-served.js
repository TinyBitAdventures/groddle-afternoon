/**
 * Pages groddle.localhost serves from Minn's own content, with no built page
 * behind them: Musicblocks and Street music are Minn pages (tools/musicblocks/
 * to-minn.mjs, tools/streetmusic/to-minn.mjs) over folders that hold only
 * their data; Credits (tools/credits/to-minn.mjs) and the privacy policy (a page made in Minn Admin,
 * published 2026-10-29) have no folder at all. Tests that check a built page's links resolve to files skip
 * these.
 */
export const MINN_SECTIONS = ['musicblocks/', 'street-music/', 'credits/', 'privacy-policy/'];

/** Whether a page-relative link points into a Minn-served section. */
export function servedByMinn(ref) {
  const path = String(ref).replace(/[?#].*$/, '').replace(/^(\.\.\/|\.\/)+/, '').replace(/^\//, '');
  return MINN_SECTIONS.some((section) => path === section || path.startsWith(section));
}
