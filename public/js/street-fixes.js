/**
 * Small fixes to Tiny Speck's street art: places where a street was laid out with a visible slip
 * and the remake mends it. Each one is a departure from the source, kept out of the street files
 * (assets/streets/*.json stay what the location XML says, so a re-import changes nothing here)
 * and listed with what the source has, what was added and who asked.
 *
 * A fix adds decos to a street's middleground when the street loads
 * (features/street-fixes-feature.js prepareStreet). Rows are in the street file's own space: x the
 * deco's middle, y its bottom edge, as every deco row.
 */
export const STREET_FIXES = Object.freeze({
  // Harbinger Heath (register G615, live report #161; Austin 2026-11-09: add the missing step).
  // The leftmost ladder (ladder_1300532628840: x -2132, y -153, h 322) is drawn by three decos:
  // ladder_interior_3steps (y -159, h 199: rungs from -358 down), ladder_int_step (y -410, h 52)
  // and ladder_tile_center_01_interior behind it. Between -410 and -358 nothing is drawn: 52 px of
  // ladder with no rungs, in the 2012 location XML exactly as here. One more ladder_int_step, the
  // street's own piece, is exactly that tall. The climb zone always covered the whole height.
  GTJ102GGGJK1VDO: Object.freeze({
    why: 'the leftmost ladder had 52 px with no rungs between its lower piece and its top step',
    decos: Object.freeze([
      Object.freeze({ id: 'fix_g615_ladder_step', sprite: 'ladder_int_step', x: -2132, y: -358, w: 72, h: 52, z: 176, r: 0 }),
    ]),
  }),
});

/** The fix for a street (by its G tsid), or null. */
export function streetFixFor(tsid) {
  return STREET_FIXES[String(tsid || '')] || null;
}

/**
 * Add a street's fixes to its middleground, once (a deco id already there is left alone).
 * Returns how many decos were added.
 */
export function applyStreetFixes(street) {
  const fix = streetFixFor(street?.tsid);
  if (!fix) return 0;
  const mg = (street.layers || []).find((layer) => layer.id === 'middleground');
  if (!mg || !Array.isArray(mg.decos)) return 0;
  let added = 0;
  for (const deco of fix.decos || []) {
    if (mg.decos.some((d) => d.id === deco.id)) continue;
    mg.decos.push({ ...deco });
    added += 1;
  }
  return added;
}
