/**
 * Player-facing summary lines for two panels (Austin's solo play, 2026-10-28).
 *
 * - The Map's subtitle under the region name. It used to carry a developer
 *   note ("painted bg" / "geometry only": whether the region has a painted
 *   background); that note now lives on the subtitle's data-map-art for QA.
 * - The Quests panel's header counts. Quests offered but not started (the
 *   put-off offers from quest-offers-feature and the story quests' offer
 *   cards) are counted on their own, so the numbers match the cards shown.
 */

/** The Map subtitle: streets, playable streets and how to use the map. */
export function hubMapSubtitle(view) {
  const streets = Array.isArray(view?.streets) ? view.streets : [];
  const playable = streets.filter((s) => s.loaded).length;
  return `${streets.length} streets · ${playable} playable here · click a street to set a destination or teleport · red star = you`;
}

/** QA only (data-map-art on the subtitle): whether the region has painted art. */
export function hubMapArtNote(view) {
  return view?.bgLocal ? 'painted bg' : 'geometry only';
}

/** The Quests header: active, offered (only when there are offer cards), done, catalog size. */
export function questLogSummary({ active = 0, offered = 0, done = 0, catalog = 0 } = {}) {
  const parts = [`${active} active`];
  if (offered > 0) parts.push(`${offered} offered`);
  parts.push(`${done} done`, `${catalog} in catalog`);
  return parts.join(' · ');
}
