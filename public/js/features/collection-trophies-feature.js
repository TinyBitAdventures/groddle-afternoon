/**
 * Collection badges counted from the pack, and the trophies they give (see js/collection-trophies.js
 * and js/feature-host.js). Once a second, and at a save's first look, so someone already holding a
 * whole collection, or already wearing the badge, is settled on load. Online the trophy is not a
 * ledger class (it can't be traded: catalog_tags.js no_trade), so the site's reconcile leaves it,
 * and the badge's currants are its credits.badges.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&collectiondemo=collection_gems[,<badge>] packs
 *   one of each thing the badge asks for. Canvas: collectionTrophies (the badges settled).
 */
import { addItem, countItem, ensureItem } from '../inventory.js?v=60dfc9ca';
import { getAchievementCatalog } from '../content-catalogs.js?v=10b118dd';
import { trophyGotText } from '../home-trophies.js?v=309fd6c7';
import { COLLECTION_TROPHIES, COUNTED_ON_ARRIVAL, HELD_AT_ONCE, collectionClasses, heldChanges, planCollectionTrophies } from '../collection-trophies.js?v=69205984';

const CHECK_MS = 1000;
let given = [];
let seen = null;
let arrived = null;
let checkAt = 0;
let demoDone = false;

// Registered up front: a reload's pack shows the trophy before any new grant runs. base_cost 0: no vendor buys one.
for (const { trophy, label, desc } of Object.values(COLLECTION_TROPHIES)) {
  ensureItem(trophy, { label, desc, baseCost: 0, stackMax: 1, donatable: false, tags: ['trophy', 'no_trade'] });
}

function classesOf(ids, catalog, unlocked) {
  const out = new Set();
  for (const id of ids) {
    if (!unlocked.includes(id)) for (const cls of collectionClasses(catalog[id])) out.add(cls);
  }
  return out;
}

function countHeld(engine, catalog) {
  const unlocked = engine.unlockedAchievements || [];
  const held = (cls) => countItem(engine.inv, cls);
  const atOnce = heldChanges(seen, classesOf(HELD_AT_ONCE, catalog, unlocked), held);
  seen = atOnce.held;
  for (const cls of atOnce.lost) engine.resetAchievementCounter?.(`in_inventory:${cls}`);
  for (const cls of atOnce.gained) engine.achievement?.(`in_inventory:${cls}`, 1);
  const onArrival = heldChanges(arrived, classesOf(COUNTED_ON_ARRIVAL, catalog, unlocked), held);
  arrived = onArrival.held;
  for (const cls of onArrival.gained) engine.achievement?.(`in_inventory:${cls}`, 1);
}

function settleTrophies(engine) {
  // A trophy standing in the house or back in furniture storage has left the pack: it still counts as had.
  const plans = planCollectionTrophies(given, engine.unlockedAchievements, (cls) => countItem(engine.inv, cls) + (Number(engine.query?.('homeFurnitureHeld', cls)) || 0));
  for (const plan of plans) {
    given.push(plan.badge);
    if (!plan.give) continue;
    addItem(engine.inv, plan.trophy, 1);
    engine.pushActivity?.(trophyGotText(`You got the ${COLLECTION_TROPHIES[plan.badge].label}!`));
  }
  if (plans.length) {
    engine.refreshPack?.();
    engine.save?.();
    publish(engine);
  }
}

function publish(engine) {
  engine.setData?.('collectionTrophies', given.join(','));
}

function demo(engine, catalog) {
  const param = engine.param?.('collectiondemo');
  if (demoDone || !param) return;
  demoDone = true;
  for (const id of String(param).split(',')) {
    for (const cls of collectionClasses(catalog[id])) if (countItem(engine.inv, cls) < 1) addItem(engine.inv, cls, 1);
  }
  engine.refreshPack?.();
}

export const collectionTrophiesFeature = {
  id: 'collection-trophies',

  onTick(dtMs, now, engine) {
    if (!engine?.inv || !engine.started || now < checkAt) return;
    checkAt = now + CHECK_MS;
    const catalog = getAchievementCatalog();
    if (!catalog) return;
    demo(engine, catalog);
    countHeld(engine, catalog);
    settleTrophies(engine);
  },

  save() {
    return { given: [...given] };
  },

  restore(slice) {
    given = Array.isArray(slice?.given) ? slice.given.filter((id) => COLLECTION_TROPHIES[id]) : [];
    seen = null;
    arrived = null;
    checkAt = 0;
  },
};
