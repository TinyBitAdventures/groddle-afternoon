/**
 * Collection badges counted from the pack (see js/collection-trophies.js and js/feature-host.js).
 * Once a second, and at a save's first look, so someone already holding a whole collection is
 * credited on load.
 */
import { countItem } from '../inventory.js?v=d82f3b00';
import { getAchievementCatalog } from '../content-catalogs.js?v=10b118dd';
import { HELD_AT_ONCE, collectionClasses, heldChanges } from '../collection-trophies.js?v=069a6848';

const CHECK_MS = 1000;
let seen = null;
let checkAt = 0;

function countHeld(engine, catalog) {
  const unlocked = engine.unlockedAchievements || [];
  const classes = new Set();
  for (const id of HELD_AT_ONCE) {
    if (!unlocked.includes(id)) for (const cls of collectionClasses(catalog[id])) classes.add(cls);
  }
  const { gained, lost, held } = heldChanges(seen, classes, (cls) => countItem(engine.inv, cls));
  seen = held;
  for (const cls of lost) engine.resetAchievementCounter?.(`in_inventory:${cls}`);
  for (const cls of gained) engine.achievement?.(`in_inventory:${cls}`, 1);
}

export const collectionTrophiesFeature = {
  id: 'collection-trophies',

  onTick(dtMs, now, engine) {
    if (!engine?.inv || !engine.started || now < checkAt) return;
    checkAt = now + CHECK_MS;
    const catalog = getAchievementCatalog();
    if (!catalog) return;
    countHeld(engine, catalog);
  },

  restore() {
    seen = null;
    checkAt = 0;
  },
};
