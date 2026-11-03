/**
 * A ledger correction taken out of the house (G335, multiplayer). When the
 * site cannot account for something a save shows, it takes it out of the
 * stored save (groddle-afternoon-site src/LedgerMath.php remove: the pack
 * and purse first, then the trade hold, furniture storage, dropped stacks,
 * display boxes and placed pieces) and features/ledger-feature.js takes the
 * same amounts out of the running game. The pack alone was not enough: a
 * correction of furniture left the pieces standing in the house, the next
 * save showed them again and was corrected again, over and over.
 *
 * takeFromHouse does what remove does to the house: furniture storage
 * (the ground floor's, which the upper floors and Tower floors share), then
 * per floor each placed row's display box contents and the piece itself.
 * A piece taken away drops whatever rested on it to the floor below (its
 * `on` cleared), as a sale does (features/home-street-mp-feature.js
 * applySales). Ticket 51: a cabinet's slots (js/home-storage.js) are taken
 * from before the cabinet itself, and a cabinet taken away spills what is
 * left in it into `spill` (class -> count) for the pack, as the site's
 * remove puts it in the stored save's pack. Pure: it edits the decor states
 * (and `spill`) it is given.
 */

const whole = (n) => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/**
 * @param {object[]} decors decor states, the ground floor (which holds the shared storage) first
 * @param {Record<string, number>} want class -> count still to take
 * @returns {Record<string, number>} class -> count taken
 */
export function takeFromHouse(decors, want, spill = null) {
  const left = {};
  for (const [c, n] of Object.entries(want || {})) if (whole(n)) left[c] = whole(n);
  const taken = {};
  const take = (c, n) => {
    left[c] -= n;
    taken[c] = (taken[c] || 0) + n;
  };
  const rooms = (decors || []).filter((d) => d && typeof d === 'object');
  const ground = rooms[0];
  if (ground?.storage) {
    for (const c of Object.keys(left)) {
      const have = whole(ground.storage[c]);
      const n = Math.min(have, left[c]);
      if (!n) continue;
      if (have - n > 0) ground.storage[c] = have - n;
      else delete ground.storage[c];
      // js/home-decor.js storedStyles: never more upgraded pieces than the stored count.
      const styles = ground.styles?.[c];
      if (Array.isArray(styles) && styles.length > have - n) {
        styles.length = have - n;
        if (!styles.length) delete ground.styles[c];
      }
      take(c, n);
    }
  }
  for (const d of rooms) {
    if (!Array.isArray(d.placed)) continue;
    const gone = new Set();
    const keep = [];
    for (const row of d.placed) {
      if (Array.isArray(row?.contents)) {
        for (let i = row.contents.length - 1; i >= 0; i -= 1) {
          const s = row.contents[i];
          if (!s || !(left[s.classTsid] > 0)) continue;
          const n = Math.min(whole(s.count), left[s.classTsid]);
          s.count = whole(s.count) - n;
          if (Array.isArray(s.points)) s.points.length = Math.min(s.points.length, s.count);
          if (s.count <= 0) row.contents[i] = null;
          if (n) take(s.classTsid, n);
        }
      }
      const shown = row?.display?.classTsid;
      if (shown && left[shown] > 0) {
        const n = Math.min(whole(row.display.count), left[shown]);
        row.display.count = whole(row.display.count) - n;
        if (row.display.count <= 0) delete row.display;
        if (n) take(shown, n);
      }
      if (left[row?.classTsid] > 0) {
        take(row.classTsid, 1);
        gone.add(row.id);
        if (spill && Array.isArray(row.contents)) {
          for (const s of row.contents) if (s && whole(s.count)) spill[s.classTsid] = (spill[s.classTsid] || 0) + whole(s.count);
        }
        continue;
      }
      keep.push(row);
    }
    if (!gone.size) continue;
    for (const row of keep) if (gone.has(row.on)) row.on = null;
    d.placed = keep;
  }
  return taken;
}
