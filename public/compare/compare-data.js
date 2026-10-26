/**
 * Groddle Field Notes · Compare. Pure helpers shared by compare.js and
 * tests/compare.test.js. Our column is never typed in by hand: it is derived
 * from public/restoration/data.json (tools/build-restoration.mjs), so it moves
 * with development.
 */

export const STATUS_KEYS = Object.freeze(['yes', 'partial', 'no', 'unknown']);

/** Restoration checklist status -> comparison matrix status. */
export const FROM_RESTORATION = Object.freeze({
  source: 'yes',
  rebuilt: 'yes',
  reimagined: 'yes',
  solo: 'partial',
  progress: 'partial',
  missing: 'no',
  lost: 'no',
});

/**
 * Our cell for one matrix row: every restoration item the row names, folded
 * into one status. All yes -> yes, all no -> no, anything else -> partial.
 */
export function oursCell(row, restoration) {
  const items = (row.ours || []).map((id) => restoration.items.find((it) => it.id === id));
  if (!items.length || items.some((it) => !it)) {
    return { status: 'unknown', note: 'Not on the restoration checklist yet.', items: [] };
  }
  const mapped = items.map((it) => FROM_RESTORATION[it.status] || 'unknown');
  let status = 'partial';
  if (mapped.every((s) => s === 'yes')) status = 'yes';
  else if (mapped.every((s) => s === 'no')) status = 'no';
  else if (mapped.every((s) => s === 'unknown')) status = 'unknown';
  const note = items
    .map((it) => `${it.name} (${restoration.status[it.status]?.label || it.status}): ${it.blurb}`)
    .join(' ');
  return { status, note, items: items.map((it) => it.id) };
}

/** Headline numbers for our project card, straight from data.json. */
export function oursNumbers(restoration) {
  const r = restoration;
  return [
    { id: 'systems', num: r.back, of: r.possible, label: 'systems playable again', note: `${r.tally?.lost || 0} more can't come back: retired, or nothing survives` },
    { id: 'quests', num: r.quests.playable, of: r.quests.story, label: 'story and skill quests playable' },
    { id: 'streets', num: r.streets.imported, of: null, label: 'original streets', note: `across ${r.streets.hubs} regions` },
    { id: 'rooms', num: r.rooms.built, of: r.rooms.total, label: 'private quest rooms rebuilt' },
    { id: 'sounds', num: r.sounds.playable ?? r.sounds.withFile, of: r.sounds.keys, label: 'sound keys with a real recording', note: `plus ${r.sounds.musicTracks ?? r.sounds.ambientTracks} music tracks` },
    { id: 'icons', num: r.icons.items, of: null, label: 'item icons from the original art' },
  ];
}

/** Count statuses in a project's column (for the little tally under each header). */
export function tallyColumn(cells) {
  const out = Object.fromEntries(STATUS_KEYS.map((k) => [k, 0]));
  for (const c of cells) out[c.status] = (out[c.status] || 0) + 1;
  return out;
}
