/**
 * Reimagined wardrobe articles (row G52). Seventeen of Tiny Speck's article
 * SWFs are greyscale masters GSJS never listed, so the original game never
 * gave them colours. The remake ships them with colourways borrowed from a
 * sibling GSJS article (or designed in the same palette when none fits), and
 * says so: catalog items carry `reimagined`, `borrowedColours` /
 * `borrowedLabel` or `designedColours` (tools/avatar-compositor/build.mjs).
 * Random and NPC looks never pick them (they are also `swfOnly`).
 *
 * The builder's style chips are drawn by game.js renderStyleChips; this
 * module tags them after the fact: a small "Reimagined" tag with a tooltip
 * on each chip, and a one-line explainer under the row while one is worn.
 */

export const REIMAGINED_TAG = 'Reimagined';

/** True for a catalog item whose colours the remake supplied. */
export const isReimagined = (item) => Boolean(item?.reimagined);

/** The tooltip and explainer for a reimagined item (null for any other). */
export function reimaginedNote(item) {
  if (!isReimagined(item)) return null;
  const why = `Tiny Speck's file for ${item.label || item.name} is greyscale and never had colours in the game`;
  if (item.borrowedLabel || item.borrowedColours) return `Reimagined: ${why}, so its colours are borrowed from ${item.borrowedLabel || item.borrowedColours}.`;
  return `Reimagined: ${why}, so its colours were designed for the remake in the same palette.`;
}

/**
 * Tag the reimagined style chips under root (buttons .avatar-style-chip with
 * data-type and data-name, as game.js draws them) and explain the worn one.
 * Idempotent: chips already tagged are left alone. Returns the chips tagged
 * this call.
 */
export function decorateWardrobe(root, catalog) {
  if (!root || !catalog?.types) return 0;
  let tagged = 0;
  const doc = root.ownerDocument || root;
  for (const chip of root.querySelectorAll('.avatar-style-chip[data-type][data-name]')) {
    const item = catalog.types[chip.dataset.type]?.find((i) => i.name === chip.dataset.name);
    const row = chip.parentElement;
    const note = reimaginedNote(item);
    if (!note) continue;
    if (!chip.dataset.reimagined) {
      chip.dataset.reimagined = '1';
      chip.title = note;
      const tag = doc.createElement('span');
      tag.className = 'avatar-reimagined-tag';
      tag.textContent = REIMAGINED_TAG;
      chip.appendChild(tag);
      tagged += 1;
    }
    // The worn one gets its explainer right under the row.
    if (chip.classList.contains('active') && row && !row.nextElementSibling?.classList?.contains('avatar-reimagined-note')) {
      const p = doc.createElement('p');
      p.className = 'avatar-note avatar-reimagined-note';
      p.dataset.type = chip.dataset.type;
      p.textContent = note;
      row.after(p);
    }
  }
  return tagged;
}

/**
 * Keep the builder's wardrobe list tagged: watches #avatar-swatches (redrawn
 * on every pick) and decorates it with the catalog js/avatar-compositor.js
 * loads (cached, the same file the builder reads). Browser only; a no-op
 * without the element.
 */
export function installReimaginedTags(doc = globalThis.document) {
  const box = doc?.getElementById?.('avatar-swatches');
  if (!box || box.dataset.reimaginedWatch || typeof MutationObserver === 'undefined') return false;
  box.dataset.reimaginedWatch = '1';
  let catalog = null;
  const run = () => { if (catalog) decorateWardrobe(box, catalog); };
  // Our own additions are mutations too; decorateWardrobe is idempotent, so the second pass is a no-op.
  new MutationObserver(run).observe(box, { childList: true, subtree: true });
  import('./avatar-compositor.js')
    .then(({ loadCatalog }) => loadCatalog())
    .then((c) => { catalog = c; run(); })
    .catch(() => {});
  return true;
}
