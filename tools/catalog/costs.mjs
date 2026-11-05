/**
 * What making a recipe costs, and what a vendor pays for an item, as the remake
 * really works them out, for the item pages (tools/catalog/build.mjs). Every
 * figure comes from the game's own functions, never typed here:
 *
 *  - Skills: js/making.js canCraft needs every skill the recipe lists
 *    (recipe.skill and recipe.skills) and the tool's own skill
 *    (makingRequiredSkill), except a recipe flagged toolSkillFree.
 *  - Energy: makingSkillAdjustments(recipe, skills).energyCost, the "Uses N
 *    energy each" the Make panel shows (game.js renderMakePanel), for a player
 *    who has just the skills it needs. Higher cooking levels and Refining II
 *    lower it later.
 *  - Time: the Make panel's timer per unit (craftUnitDurations /
 *    craftDurationFor, the recipe's wait_ms clamped to the visible cycle);
 *    transmogrifiers follow transmogUnitSeconds (2 s each for the first five,
 *    then quicker); a placed machine runs count * wait_ms + 2200 ms
 *    (js/machine-rooms.js machineJobMs, js/features/home-machines-feature.js).
 *  - Selling: js/vendor.js vendorSellValue, round(base cost * the store's
 *    buy multiplier) a unit: 0.66 at most street spirits, 0.75 at the Tool
 *    Vendor, nothing at the Sno Cone Vendor. Items tagged no_vendor
 *    (store-catalog.js NO_VENDOR_ITEMS) and items the remake flags
 *    `sellable: false` (NOT_SELLABLE below) can't be sold.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const pubJs = (root, name) => pathToFileURL(join(root, 'public', 'js', name)).href;

/** Seconds as the page says them: "2 seconds", "0.7 seconds", "1 minute 30 seconds". */
export function secondsText(ms) {
  const s = Math.round(Number(ms) / 100) / 10;
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const rest = Math.round(s - m * 60);
    return `${m} ${m === 1 ? 'minute' : 'minutes'}${rest ? ` ${rest} ${rest === 1 ? 'second' : 'seconds'}` : ''}`;
  }
  const n = s >= 10 ? Math.round(s) : s;
  return `${n} ${n === 1 ? 'second' : 'seconds'}`;
}

/**
 * The remake's `sellable: false` items, by the file that sets the flag (a
 * test counts the flags per file, tests/catalog-costs.test.js, so a new one
 * has to be named here). Values are class ids, or a function of the loaded
 * modules for files that flag a whole family.
 */
export const NOT_SELLABLE = Object.freeze({
  'js/funpickle.js': ['special_item_that_only_beta_testers_get'],
  'js/animal-husbandry.js': ['plop', 'hogtied_piggy'],
  'js/teleportation.js': ['teleportation_script'],
  'js/cubimals.js': (m) => Object.values(m.cubimals.CUBIMAL_SERIES).flat().map((c) => c.classTsid),
  'js/hell.js': ['bunch_of_grapes_hell'],
  'js/features/gifts-feature.js': ['bag_gift_box_wrapped'],
  'js/quest-rooms/catalog.js': (m) => Object.keys(m.rooms.ROOM_ITEMS).filter((id) => m.rooms.ROOM_ITEMS[id].sellable === false),
  'js/crabs.js': ['crabphones'],
  'js/smuggling.js': ['contraband'],
  'js/home-ticket.js': ['homestreet_ticket'],
  'js/features/small-items-feature.js': ['fortune', 'plate_of_beans'],
  'js/features/newxp-feature.js': ['greeter_twig'],
  'js/features/artifacts-feature.js': (m) => [...m.artifacts.ALL_ARTIFACT_CLASSES],
  'js/features/imagination-feature.js': ['upgrade_card_reshuffle', 'upgrade_card_instant_resurrection'],
  'js/features/giant-icons-feature.js': (m) => Object.values(m.icons.GIANT_ICON_DATA).map((g) => g.iconClass),
  'js/features/craftybot-feature.js': ['npc_crafty_bot'],
  'js/features/door-drink-feature.js': ['portal'],
  'js/features/rube-feature.js': ['npc_rube'],
  'js/features/swf-feature.js': ['swf_1', 'swf_2', 'swf_3', 'game_box'],
  'js/quest-rooms/juju-camp.js': ['juju_trowel', 'note_hint', 'juju_paperweight'],
  'js/quest-rooms/esquibeth.js': ['conch'],
  'game.js': ['stoot_barfield_pullstring_doll'],
});
/** How many `sellable: false` flags each file in NOT_SELLABLE carries (one entry may cover a loop). */
export const NOT_SELLABLE_FLAGS = Object.freeze({ 'js/quest-rooms/catalog.js': 6, 'js/animal-husbandry.js': 2, 'js/features/small-items-feature.js': 2, 'js/features/imagination-feature.js': 2, 'js/features/swf-feature.js': 2, 'js/quest-rooms/juju-camp.js': 3 });

/** Loads what the costs need from the remake (the repo root given). */
export async function loadCosts(root) {
  const making = await import(pubJs(root, 'making.js'));
  const machines = await import(pubJs(root, 'machine-rooms.js'));
  const vendor = await import(pubJs(root, 'vendor.js'));
  const store = await import(pubJs(root, 'store-catalog.js'));
  const mods = {
    cubimals: await import(pubJs(root, 'cubimals.js')),
    rooms: await import(pubJs(root, 'quest-rooms/catalog.js')),
    artifacts: await import(pubJs(root, 'artifacts.js')),
    icons: await import(pubJs(root, 'giant-icons-data.js')),
  };
  const notSellable = new Set(Object.values(NOT_SELLABLE).flatMap((v) => (typeof v === 'function' ? v(mods) : v)));

  /** Every skill a recipe needs (canCraft's checks), without a lower level of one it lists (EZ Cooking I under II). */
  const allSkillsFor = (r) => [...new Set([
    ...(r.skill ? [r.skill] : []),
    ...(r.skills || []),
    ...(r.toolSkillFree ? [] : [making.makingRequiredSkill(r.tool)].filter(Boolean)),
  ])];
  const skillsFor = (r) => {
    const all = allSkillsFor(r);
    const line = (id) => /^(.*?)(?:_(\d+))?$/.exec(id);
    return all.filter((id) => {
      const [, base, n] = line(id);
      return !all.some((o) => o !== id && line(o)[1] === base && Number(line(o)[2] || 0) > Number(n || 0));
    });
  };

  /**
   * { skills, better, energy, time } for one recipe; time is the words for one unit.
   * A transmogrifier works without its skill, twice as slow and dearer
   * (makingSkillAdjustments): the figures are with it, and `better` names it.
   */
  function recipeCosts(r) {
    const skills = skillsFor(r);
    const tool = making.MAKING_TOOL_SKILLS[r.tool];
    const better = tool?.makingType === 'transmogrification' && !skills.includes(tool.requiredSkill) ? tool.requiredSkill : null;
    // Every listed skill counts (a player with EZ Cooking II has I): cooking levels set the energy and time.
    const learned = [...allSkillsFor(r), ...(better ? [better] : [])];
    const adjust = making.makingSkillAdjustments(r, learned);
    let time = '';
    if (adjust.makingType === 'machine') {
      time = `${secondsText(machines.machineJobMs(r.waitMs, 1) - machines.MACHINE_EXTRA_WAIT_MS)} each, plus ${secondsText(machines.MACHINE_EXTRA_WAIT_MS)} a batch`;
    } else if (adjust.makingType === 'transmogrification') {
      const unit = making.craftUnitDurations(r, 1, learned)?.[0];
      time = `${secondsText(unit)} each, quicker after ${[1, 2, 3, 4, 5, 6].find((n) => making.transmogUnitSeconds(n + 1) !== making.transmogUnitSeconds(1))}`;
    } else {
      time = `${secondsText(making.craftDurationFor(r, learned))} each`;
    }
    return { skills, better, energy: adjust.energyCost, time };
  }

  const stores = Object.values(vendor.VENDOR_PROFILES);
  // The rate most street spirits buy at (0.66 today, js/vendor.js BUYBACK_MULTIPLIER).
  const rates = stores.map((s) => s.buyMultiplier);
  const usual = rates.sort((a, b) => rates.filter((x) => x === b).length - rates.filter((x) => x === a).length)[0];
  /**
   * What vendors pay for one (a tool at full wear), or null when the remake
   * won't buy it: { usual, at: [{ key, label, price }] } where `at` lists the
   * stores that pay something else (and pay something).
   */
  function sellPrice(id) {
    if (notSellable.has(id) || store.NO_VENDOR_ITEMS.has(id)) return null;
    const unit = vendor.vendorSellValue(id, 1, { buyMultiplier: usual }).unit;
    if (!unit) return null;
    const at = stores.filter((s) => s.buyMultiplier !== usual && s.buyMultiplier > 0)
      .map((s) => ({ key: s.key, label: s.label, price: vendor.vendorSellValue(id, 1, { buyMultiplier: s.buyMultiplier }).unit }))
      .filter((s) => s.price && s.price !== unit);
    return { usual: unit, at };
  }
  /** What one store pays for one, or 0. */
  const sellAt = (id, storeKey) => {
    const s = vendor.VENDOR_PROFILES[storeKey];
    if (!s || !(s.buyMultiplier > 0) || !sellPrice(id)) return 0;
    return vendor.vendorSellValue(id, 1, { buyMultiplier: s.buyMultiplier }).unit;
  };
  return { recipeCosts, sellPrice, sellAt, notSellable, usualRate: usual };
}
