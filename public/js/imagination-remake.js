/**
 * What each imagination upgrade does in this remake. The shop only deals
 * cards whose effect is wired (`live`) or mostly wired (`partial`); every
 * other card stays in the catalog with an honest note, the same way the
 * Skills panel keeps "not here yet" skills (see skill-tree.js).
 *
 * Statuses:
 *   live        effect wired with source numbers
 *   partial     main effect wired; a side effect waits on a missing system
 *   starter     one of the nine tutorial cards, granted to every save
 *   later       the system it improves is not in the remake yet
 *   multiplayer needs other players
 *   interface   a client UI convenience with no gameplay effect here
 *   none        GameServerJS never applied it
 */

const RULES = [
  // Tutorial cards (type 1 condition), granted as starters.
  [/^(walk_speed_[12]|jump_[12]|mappery|camera_mode|zoomability|encyclopeddling|skill_learning)$/, 'starter',
    'Granted to every save: the remake skips the tutorial island where these were bought, and its movement is the post-tutorial feel.'],

  // Movement and core stats.
  [/^walk_speed_[34]$/, 'live', 'Walk speed rises by the source ratio to the post-tutorial pace (Walk Speed III 1.21x, IV 1.28x).'],
  [/^jump_3$/, 'live', 'Jump velocity 1.05x.'],
  [/^jump_triple_[123]$/, 'live', 'Triple Jump height 0.7 / 0.82 / 1 of the full boost.'],
  [/^jump_wall$/, 'later', 'Secret card that was never dealt; wall jumping is not in the remake.'],
  [/^energy_tank$/, 'live', 'Raises the energy tank and refills it.'],
  [/^quoin_multiplier$/, 'live', 'Adds to the quoin multiplier (cap 100).'],
  [/^daily_quoin_limit_[1-5]$/, 'live', 'Daily quoin limit 110 / 120 / 130 / 140 / 150, effective at once.'],
  [/^brain_capacity$/, 'live', 'Each skill beyond your brain capacity makes study 5% slower; this raises the capacity (max 60).'],
  [/^learntime_/, 'live', 'Skills in this category study faster by the card percentage.'],
  [/^food_variety_bonus$/, 'live', 'Meals you have not eaten lately give bonus iMG.'],
  [/^periodic_mood_loss_reduced_[123]$/, 'later', 'The remake has no periodic mood loss to reduce.'],

  // Reward multipliers.
  [/^achievement_reward_bonus_[1-5]$/, 'live', 'Badge rewards +2% to +10%.'],
  [/^quest_reward_bonus_[1-5]$/, 'live', 'Quest rewards +2% to +10%.'],
  [/^vendors_lower_sell_price_[1-4]$/, 'live', 'Vendors charge you 2 / 5 / 7 / 10% less.'],
  [/^vendors_higher_buy_price_[1-4]$/, 'live', 'Vendors pay you 2 / 5 / 7 / 10% more.'],

  // Keepable cards.
  [/^keepable_reshuffle$/, 'live', 'Puts a Reshuffle Card in your pack: a free re-deal of your hand.'],
  [/^keepable_instant_resurrection$/, 'live', 'Puts a Get Out of Hell Free Card in your pack: resurrect at once, fully refreshed.'],
  [/^ticket_to_paradise_(cloud_rings|radial_heights|starlit_night|slip_n_slide)$/, 'live', 'Puts this Paradise ticket in your pack.'],
  [/^ticket_to_paradise_/, 'later', 'This Paradise course has no recording to rebuild it from yet.'],

  // Mining and metal.
  [/^mining_time_[123]$/, 'live', 'Mining takes 10 / 25 / 50% less time.'],
  [/^mining_drop_[1-4]$/, 'live', 'Mining can turn up a small gem (amber to diamond).'],
  [/^mining_expert_(beryl|dullite|metal_rock|sparkly)$/, 'live', '15% more chunks from that rock.'],
  [/^mining_high_capacity_rock$/, 'later', 'Mega rocks (150 chunks) do not respawn in the remake.'],
  [/^mining_multitasking$/, 'none', 'Secret card with no server effect.'],
  [/^refining_time_[12]$/, 'live', 'Grinding ore takes 20 / 40% less time.'],
  [/^refining_drop_[12]$/, 'later', 'Refining drop tables (currants, musicblocks) are not ported.'],
  [/^smelting_energy$/, 'live', 'Smelting costs 3 energy instead of 5.'],
  [/^smelting_tool_wear$/, 'live', 'Smelting wears the Smelter 2 instead of 3.'],
  [/^smelting_drop$/, 'later', 'The smelting drop table (currants, musicblocks) is not ported.'],
  [/^metalmaking_music$/, 'later', 'Metalmaker music and dancing sloths are not in the remake.'],

  // Making.
  [/^(cheffery|saucery|master_chef|blending|cocktail_crafting|spicemilling|fruitchanging|bubbletuning|gassifying|botany|tincturing|alchemy_[12]|fuelmaking|metalmaking)_imagination$/, 'live',
    'A chance of bonus iMG worth a share of what you make with that tool.'],
  [/^(ezcooking|grilling)_less_imagination$/, 'live', 'A chance of bonus iMG worth a share of what you make with that tool.'],
  [/^intermediate_admixing_imagination_[12]$/, 'live', 'A chance of bonus iMG when making with the Beaker.'],
  [/^toolcrafting_imagination_[12]$/, 'live', 'A chance of bonus iMG when making with the Tinkertool.'],
  [/^potionmaking_imagination$/, 'none', 'GameServerJS never checks this upgrade (the Cauldron rolls Shake Things Up instead).'],
  [/^(cheffery|saucery|master_chef|blending|cocktail_crafting|ezcooking|grilling)_tool_wear$/, 'live', 'That cooking tool wears at half rate.'],
  [/^recipe_task_limit_/, 'later', 'Making has no per-recipe task limit here (batches already go to 99).'],
  [/^blockmaking_save_fuel_[12]$/, 'later', 'The Blockmaker machine is not built yet.'],
  [/^toolcrafting_bonus_tool$/, 'later', 'Random bonus tools from the Tinkertool are not wired yet.'],
  [/^engineering_/, 'later', 'Machine assembly is not in the remake.'],
  [/^furnituremaking_bonus_upgrade_[123]$/, 'later', 'Furniture upgrades (credit SWFs) are lost.'],
  [/^fiber_arts_bonus_[12]$/, 'later', 'Spindle and Loomer bonuses are not wired yet.'],
  [/^distilling_/, 'later', 'The Still is not in the remake.'],
  [/^crystallography_craft_multiple_crystals$/, 'none', 'Secret card with no server effect.'],
  [/^element_handling_bonus_[12]$/, 'later', 'The Elemental Pouch Shake verb is not in the remake.'],
  [/^tinkering_repairing_gives_mood$/, 'live', 'Repairs with the Tinkertool also lift your mood.'],

  // Trees, gardens and animals.
  [/^gardening_tree_super_harvest_[123]$/, 'live', 'Tree super harvests (x2) at 6 / 10 / 14%.'],
  [/^gardening_harvest_(bean|bubble|egg|fruit|gas|spice)$/, 'live', 'That tree can super harvest x4 at 10%.'],
  [/^gardening_harvest_paper$/, 'live', 'Paper trees give 8 sheets instead of 5.'],
  [/^gardening_harvest_wood$/, 'live', 'Wood Tree harvests cost 12 energy and 3 Hatchet wear (from 20 and 5).'],
  [/^lightgreenthumb_tool_wear$/, 'live', 'Watering Cans wear at half rate.'],
  [/^lightgreenthumb_(pet|water)_drop_[12]$/, 'later', 'Tree petting and watering drop tables (currants, musicblocks) are not ported.'],
  [/^croppery_time_[12]$/, 'live', 'Crops grow 10 / 20% faster.'],
  [/^herbalism_time_[12]$/, 'live', 'Herbs grow 10 / 20% faster.'],
  [/^croppery_super_harvest_[12]$/, 'live', 'Crop super harvests x3 / x4 at 6%.'],
  [/^herbalism_super_harvest_[12]$/, 'live', 'Herb super harvests x3 at 20 / 30%.'],
  [/^croppery_herbalism_(watering|clearing)_time$/, 'partial', 'Required for Master Gardener; the Master Garden itself is not built yet.'],
  [/^croppery_growing_drop_[12]$/, 'later', 'The croppery drop table (currants, musicblocks) is not ported.'],
  [/^herbalism_shucking_[12]$/, 'later', 'Herb seed extraction is not in the remake.'],
  [/^hoeing_more_img_more_wear$/, 'live', 'Aggressive hoeing: tending patches gives more iMG for more Hoe wear.'],
  [/^soil_appreciation_bean_grow_[12]$/, 'live', 'Planted beans sprout faster and grow further when petted.'],
  [/^soil_appreciation_dirt_pile_[12]$/, 'live', 'Dig each dirt pile 4 / 5 times a day.'],
  [/^animal_kinship_super_harvest_[123]$/, 'live', 'Bigger, more frequent animal super harvests.'],
  [/^animal_kinship_grain$/, 'live', 'Squeezing a chicken at Animal Kinship VII gives 10 Grain with a x4 chance.'],
  [/^animal_husbandry_twin_animals_[12]$/, 'later', 'Incubation is not in the remake.'],
  [/^herdkeeping_|^remoteherdkeeping_/, 'later', 'Herdkeeping and collectors are not in the remake.'],
  [/^batterfly_bonus_guano(_2)?$/, 'later', 'Batterflies are not in the remake.'],
  [/^sloth_bonus_snails$/, 'later', 'Sloths are not in the remake.'],
  [/^fox_brushing_bonus$/, 'later', 'Fox brushing yields are not wired to upgrades yet.'],

  // Resource nodes.
  [/^bog_specialization_dig_peat_bog_twice$/, 'live', 'Dig each peat bog twice a game day.'],
  [/^bogspecialization_more_peat$/, 'live', '25% more peat per dig.'],
  [/^bogspecialization_dig_peat_drop$/, 'later', 'The peat drop table (currants, musicblocks) is not ported.'],
  [/^barnacle_scraping_speed_1$/, 'live', 'Scraping barnacles and ice takes half the time.'],
  [/^barnacle_scraping_drop_1$/, 'later', 'The barnacle drop table (currants, musicblocks) is not ported.'],
  [/^ice_scraping_yield$/, 'live', 'Ice per scrape becomes 2 to 5.'],
  [/^jellisac_hands_speed_[12]$/, 'live', 'Scooping jellisac takes half the time, then no time.'],
  [/^jellisac_hands_drop_1$/, 'later', 'The jellisac drop table (currants, musicblocks) is not ported.'],

  // Meditation, rooks, giants.
  [/^meditative_arts_|^focused_meditation_imagination$/, 'later', 'Meditation does not read upgrades yet.'],
  [/^levitation_(physics|time)$/, 'later', 'Levitation does not read upgrades yet.'],
  [/^piety_shrine_prime_bonus_[12]$/, 'later', 'Shrine priming with Piety is not in the remake.'],
  [/^icon_tithe_[1-4]$/, 'live', 'Tithing an Icon costs 3 / 5 / 10 / 20% fewer currants.'],
  [/^icon_bestow_chance_[1-3]$/, 'live', 'Placed Icons bestow Giant Love 5.5 / 6 / 6.5% of the time (from 5%).'],
  [/^transcendental_/, 'multiplayer', 'Transcendental Radiation needs other players.'],
  [/^ancestral_lands_time_[12]$/, 'later', 'The Ancestral Lands are not in the remake.'],
  [/^rube_better_items$/, 'live', 'The Rube treats you as 10 levels higher when choosing what to offer: no more cheap items.'],
  [/^rube_chance_to_meet$/, 'live', 'The Rube visits on 1% of street entries (from 0.5%).'],
  [/^unlearning_ability$/, 'live', 'Unlearn a skill from the Skills panel in the time it took to learn.'],
  [/^unlearning_time_[12]$/, 'live', 'Unlearning takes 25 / 50% less time.'],

  // Interface conveniences.
  [/^trade_channel$/, 'multiplayer', 'The trade chat channel needs other players.'],
  [/^(snapshotting|snapshottery_)/, 'interface', 'Snapshots and photo filters are a client feature not in the remake.'],
  [/^(map_search|inventory_search)$/, 'none', 'Secret card with no server effect.'],
  [/^pack_(stack_up_bags|internal_sortitude|magic_sort)$/, 'interface', 'Bag sorting verbs; the remake pack has no bags.'],
];

/** { status, note } for an upgrade id. */
export function remakeStatus(id) {
  for (const [re, status, note] of RULES) if (re.test(id)) return { status, note };
  return { status: 'later', note: 'Not wired in the remake yet.' };
}

/** Cards the shop deals: wired effects only. */
export function isOfferedInRemake(id) {
  const { status } = remakeStatus(id);
  return status === 'live' || status === 'partial';
}

export const REMAKE_STATUS_RULES = RULES;
