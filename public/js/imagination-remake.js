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
  [/^jump_wall$/, 'none', 'Secret card that was never dealt, and physicsReset (inc_physics.js) deletes it from any player who has it.'],
  [/^energy_tank$/, 'live', 'Raises the energy tank and refills it.'],
  [/^quoin_multiplier$/, 'live', 'Adds to the quoin multiplier (cap 100).'],
  [/^daily_quoin_limit_[1-5]$/, 'live', 'Daily quoin limit 110 / 120 / 130 / 140 / 150, effective at once.'],
  [/^brain_capacity$/, 'live', 'Each skill beyond your brain capacity makes study 5% slower; this raises the capacity (max 60).'],
  [/^learntime_/, 'live', 'Skills in this category study faster by the card percentage.'],
  [/^food_variety_bonus$/, 'live', 'Meals you have not eaten lately give bonus iMG.'],
  [/^periodic_mood_loss_reduced_[123]$/, 'live', 'Idle mood loss from above 80% runs 1/6 / 1/3 / 1/2 slower (1.25 / 1.0 / 0.75% of max mood a minute instead of 1.5%, still at least 4).'],

  // Reward multipliers.
  [/^achievement_reward_bonus_[1-5]$/, 'live', 'Badge rewards +2% to +10%.'],
  [/^quest_reward_bonus_[1-5]$/, 'live', 'Quest rewards +2% to +10%.'],
  [/^vendors_lower_sell_price_[1-4]$/, 'live', 'Vendors charge you 2 / 5 / 7 / 10% less.'],
  [/^vendors_higher_buy_price_[1-4]$/, 'live', 'Vendors pay you 2 / 5 / 7 / 10% more.'],

  // Keepable cards.
  [/^keepable_reshuffle$/, 'live', 'Puts a Reshuffle Card in your pack: a free re-deal of your hand.'],
  [/^keepable_instant_resurrection$/, 'live', 'Puts a Get Out of Hell Free Card in your pack: resurrect at once, fully refreshed.'],
  [/^ticket_to_paradise_(cloud_rings|radial_heights|starlit_night|slip_n_slide|aerial_boost|mountain_scaling|abysmal_thrill|arbor_hollow|bippity_bop|cloud_flight|updraft|sky_plunge|drafty_uplift)$/, 'live', 'Puts this Paradise ticket in your pack.'],
  [/^ticket_to_paradise_beam_me_down$/, 'live', 'Puts a Ticket To Beam Me Down in your pack: Activate it to ride down past the saucers.'],
  [/^ticket_to_paradise_/, 'later', 'This Paradise course cannot be reached by ticket yet.'],

  // Mining and metal.
  [/^mining_time_[123]$/, 'live', 'Mining takes 10 / 25 / 50% less time.'],
  [/^mining_drop_[1-4]$/, 'live', 'Mining can turn up a small gem (amber to diamond).'],
  [/^mining_expert_(beryl|dullite|metal_rock|sparkly)$/, 'live', '15% more chunks from that rock.'],
  [/^mining_high_capacity_rock$/, 'live', 'Rocks you clear come back as 150-chunk mega rocks 50% more often (dullite 7.5%, beryl 15%, sparkly 30%).'],
  [/^mining_multitasking$/, 'none', 'Secret card with no server effect.'],
  [/^refining_time_[12]$/, 'live', 'Grinding ore takes 20 / 40% less time.'],
  [/^refining_drop_[12]$/, 'live', 'Grinding a batch of 5+ ore rolls the refining_rocks drop table (4 / 8%).'],
  [/^smelting_energy$/, 'live', 'Smelting costs 3 energy instead of 5.'],
  [/^smelting_tool_wear$/, 'live', 'Smelting wears the Smelter 2 instead of 3.'],
  [/^smelting_drop$/, 'live', 'Each smelting batch has a 10% chance at the smelting drop table.'],
  [/^metalmaking_music$/, 'live', 'Your Metalmaker plays metal music while it works (Turn Music Off / On in its menu); other machines just hum.'],

  // Making.
  [/^(cheffery|saucery|master_chef|blending|cocktail_crafting|spicemilling|fruitchanging|bubbletuning|gassifying|botany|tincturing|alchemy_[12]|fuelmaking|metalmaking)_imagination$/, 'live',
    'A chance of bonus iMG worth a share of what you make with that tool.'],
  [/^(ezcooking|grilling)_less_imagination$/, 'live', 'A chance of bonus iMG worth a share of what you make with that tool.'],
  [/^intermediate_admixing_imagination_[12]$/, 'live', 'A chance of bonus iMG when making with the Beaker.'],
  [/^toolcrafting_imagination_[12]$/, 'live', 'A chance of bonus iMG when making with the Tinkertool.'],
  [/^potionmaking_imagination$/, 'none', 'GameServerJS never checks this upgrade (the Cauldron rolls Shake Things Up instead).'],
  [/^(cheffery|saucery|master_chef|blending|cocktail_crafting|ezcooking|grilling)_tool_wear$/, 'live', 'That cooking tool wears at half rate.'],
  [/^recipe_task_limit_(food|drink|transmog|machines)_1$/, 'live', 'Make 50% more per batch with these tools (the recipe batch limit x1.5).'],
  [/^recipe_task_limit_(food|drink|transmog|machines)_2$/, 'live', 'Make twice as many per batch with these tools (the recipe batch limit x2).'],
  [/^recipe_task_limit_loomer_1$/, 'live', 'Loomer batches 2.5 times as large.'],
  [/^recipe_task_limit_tincturing_1$/, 'live', 'Tincturing Kit batches twice as large.'],
  [/^blockmaking_save_fuel_[12]$/, 'live', 'The Blockmaker burns 20 / 40% less fuel (4 / 3 per Urth Block instead of 5).'],
  [/^toolcrafting_bonus_tool$/, 'live', '5% of Tinkertool makes also give you a random tool worth half to twice what you made.'],
  [/^engineering_assemble_machine$/, 'live', 'Assemble a machine from its stand and parts without spending energy (60 otherwise).'],
  [/^engineering_disassemble_machine$/, 'live', 'Fully disassemble a machine for 15 energy instead of 15 per part.'],
  [/^engineering_reduce_time$/, 'live', 'Installing or uninstalling each machine part takes 1 second instead of 2.'],
  [/^furnituremaking_bonus_upgrade_[123]$/, 'later', 'Furniture upgrades (credit SWFs) are lost.'],
  [/^fiber_arts_bonus_1$/, 'live', '4% of spins on a Spindle make String instead of Thread.'],
  [/^fiber_arts_bonus_2$/, 'live', '4% of General Fabric batches on a Loomer give 2 more Fabric.'],
  [/^distilling_(corn|grain|potato)$/, 'live', 'That crop puts 20% more into the Still hopper.'],
  [/^crystallography_craft_multiple_crystals$/, 'none', 'Secret card with no server effect.'],
  [/^element_handling_bonus_[12]$/, 'later', 'The Shake verb lives on the Elemental Pouch, and bags are not in the remake (elements stack in the pack).'],
  [/^tinkering_repairing_gives_mood$/, 'live', 'Repairs with the Tinkertool also lift your mood.'],

  // Trees, gardens and animals.
  [/^gardening_tree_super_harvest_[123]$/, 'live', 'Tree super harvests (x2) at 6 / 10 / 14%.'],
  [/^gardening_harvest_(bean|bubble|egg|fruit|gas|spice)$/, 'live', 'That tree can super harvest x4 at 10%.'],
  [/^gardening_harvest_paper$/, 'live', 'Paper trees give 8 sheets instead of 5.'],
  [/^gardening_harvest_wood$/, 'live', 'Wood Tree harvests cost 12 energy and 3 Hatchet wear (from 20 and 5).'],
  [/^lightgreenthumb_tool_wear$/, 'live', 'Watering Cans wear at half rate.'],
  [/^lightgreenthumb_(pet|water)_drop_[12]$/, 'live', 'Petting (6 / 9%) and watering (4 / 6%) trees can turn up a drop: currants, musicblocks, gems, tickets.'],
  [/^croppery_time_[12]$/, 'live', 'Crops grow 10 / 20% faster.'],
  [/^herbalism_time_[12]$/, 'live', 'Herbs grow 10 / 20% faster.'],
  [/^croppery_super_harvest_[12]$/, 'live', 'Crop super harvests x3 / x4 at 6%.'],
  [/^herbalism_super_harvest_[12]$/, 'live', 'Herb super harvests x3 at 20 / 30%.'],
  [/^croppery_herbalism_(watering|clearing)_time$/, 'live', 'Required for Master Gardener, whose garden potions now water, plant, clear, fertilize and harvest a whole bed; the source only shortens the potion pass (one sound instead of two).'],
  [/^croppery_growing_drop_[12]$/, 'live', 'Planting, watering and clearing crops roll the larger croppery drop table (5 / 7%).'],
  [/^herbalism_shucking_[12]$/, 'live', 'Shucking herbs doubles the seeds 75% / 100% of the time.'],
  [/^hoeing_more_img_more_wear$/, 'live', 'Aggressive hoeing: tending patches gives more iMG for more Hoe wear.'],
  [/^soil_appreciation_bean_grow_[12]$/, 'live', 'Planted beans sprout faster and grow further when petted.'],
  [/^soil_appreciation_dirt_pile_[12]$/, 'live', 'Dig each dirt pile 4 / 5 times a day.'],
  [/^animal_kinship_super_harvest_[123]$/, 'live', 'Bigger, more frequent animal super harvests.'],
  [/^animal_kinship_grain$/, 'live', 'Squeezing a chicken at Animal Kinship VII gives 10 Grain with a x4 chance.'],
  [/^animal_husbandry_twin_animals_[12]$/, 'live', 'An incubating Chicken hatches a bonus baby animal 5 / 10% of the time.'],
  [/^herdkeeping_animal_sadness_[12]$/, 'live', 'Your back yard holds 10% / 20% more Piggies, Chickens and Butterflies before they sulk, leave or puff away from crowding (18 Piggies on a starter yard become 20 / 22).'],
  [/^herdkeeping_(pig|chicken|butterfly)_stick$/, 'live', 'Change radius on a placed Magic Stick: how far your yard animals may roam (300 to 50 px).'],
  [/^remoteherdkeeping_production_[12]$/, 'live', 'Back-yard Meat Collectors and Butterfly Milkers collect every 22 / 20 minutes instead of 24.'],
  [/^herdkeeping_|^remoteherdkeeping_/, 'later', 'Herdkeeping and collectors are not in the remake.'],
  [/^batterfly_bonus_guano(_2)?$/, 'live', 'A Batterfly fed 50+ currants of food releases 3 Guano / fed 80+ releases 5.'],
  [/^sloth_bonus_snails$/, 'live', 'Walking under a hiding Sloth, 7% of the time (at most every 5 minutes) it spits 1 to 3 Snails at you.'],
  [/^fox_brushing_bonus$/, 'live', 'Each fox brush gives 8 to 12 more Fiber, for 1.5x Fox Brush wear.'],

  // Resource nodes.
  [/^bog_specialization_dig_peat_bog_twice$/, 'live', 'Dig each peat bog twice a game day.'],
  [/^bogspecialization_more_peat$/, 'live', '25% more peat per dig.'],
  [/^bogspecialization_dig_peat_drop$/, 'live', 'Digging peat has a 10% chance at the peat drop table.'],
  [/^barnacle_scraping_speed_1$/, 'live', 'Scraping barnacles and ice takes half the time.'],
  [/^barnacle_scraping_drop_1$/, 'live', 'Scraping barnacles has a 6% chance at the barnacle drop table.'],
  [/^ice_scraping_yield$/, 'live', 'Ice per scrape becomes 2 to 5.'],
  [/^jellisac_hands_speed_[12]$/, 'live', 'Scooping jellisac takes half the time, then no time.'],
  [/^jellisac_hands_drop_1$/, 'live', 'Scooping jellisac drops twice as often (8% from 4%).'],

  // Meditation, rooks, giants.
  [/^meditative_arts_focus_1$/, 'live', 'Meditation sessions run 20% longer.'],
  [/^meditative_arts_focus_2$/, 'live', 'Meditation sessions run 50% longer.'],
  [/^meditative_arts_max_relax$/, 'live', 'A Max Relax pays double energy, mood and iMG.'],
  [/^meditative_arts_imagination$/, 'live', '8% of meditations also pay bonus iMG equal to the energy and mood gained.'],
  [/^focused_meditation_imagination$/, 'live', '8% of focused meditations also pay bonus iMG equal to the energy (or mood) gained.'],
  [/^meditative_arts_less_distraction(_2)?$/, 'multiplayer', 'Chat messages that interrupt meditation come from other players.'],
  [/^levitation_time$/, 'live', 'Levitation lasts 8 seconds instead of 5 and costs 12 energy instead of 20.'],
  [/^levitation_physics$/, 'live', 'Levitation floats longer: lighter gravity and stronger lifts.'],
  [/^piety_shrine_prime_bonus_[12]$/, 'live', 'Offerings through a shrine you primed hit the Rook 25 / 50% harder.'],
  [/^icon_tithe_[1-4]$/, 'live', 'Tithing an Icon costs 3 / 5 / 10 / 20% fewer currants.'],
  [/^icon_bestow_chance_[1-3]$/, 'live', 'Placed Icons bestow Giant Love 5.5 / 6 / 6.5% of the time (from 5%).'],
  [/^transcendental_/, 'multiplayer', 'Transcendental Radiation needs other players.'],
  [/^ancestral_lands_time_[12]$/, 'later', 'These add a minute to Ancestral Nostalgia, the 10-minute stay before the kick, and the remake has no 10-minute limit by design (G39); the Juju Bandit clock counts time spent, so they would change nothing.'],
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
