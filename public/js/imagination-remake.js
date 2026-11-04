/**
 * What each imagination upgrade does in this remake. The shop only deals
 * cards whose effect is wired (`live`) or mostly wired (`partial`), and in
 * multiplayer also the cards whose effect only exists between players
 * (`online`); every other card stays in the catalog with an honest note, the
 * same way the Skills panel keeps "not here yet" skills (see skill-tree.js).
 *
 * Statuses:
 *   live        effect wired with source numbers
 *   partial     main effect wired; a side effect waits on a missing system
 *   starter     one of the seven tutorial cards granted to a save that skips the tutorial
 *   online      effect wired in multiplayer, where the system it changes
 *               lives (chat, Snaps, radiation); dealt online only
 *   later       the system it improves is not in the remake yet
 *   multiplayer needs other players and is not wired online yet
 *   interface   a client UI convenience with no gameplay effect here
 *   none        GameServerJS never applied it
 */

const RULES = [
  // Tutorial cards (type 1 condition): seven are starters; High Jumper I and II are bought
  // (Austin 2026-11-04), in the tutorial or from the normal hand (imagination.js TUTORIAL_CARDS_DEALT).
  [/^(walk_speed_[12]|mappery|camera_mode|zoomability|encyclopeddling|skill_learning)$/, 'starter',
    'Bought in the tutorial; a solo game that skips the tutorial is given them. Your walk is always at least the after-tutorial pace.'],
  [/^jump_1$/, 'live', 'A new player jumps about 69 px high; High Jumper I raises that to about 116 px. Bought in the tutorial, or dealt in your hand if you skipped it.'],
  [/^jump_2$/, 'live', 'The full jump, about 142 px high. Bought in the tutorial, or dealt in your hand if you skipped it.'],

  // Movement and core stats.
  [/^walk_speed_[34]$/, 'live', 'Walk speed rises by the source ratio to the post-tutorial pace (Walk Speed III 1.21x, IV 1.28x).'],
  [/^jump_3$/, 'live', 'Jump velocity 1.05x.'],
  [/^jump_triple_[123]$/, 'live', 'Triple Jump height 0.7 / 0.82 / 1 of the full boost.'],
  // Secret (inc_data_imagination.js 3457-3489, never dealt: inc_imagination.js 552 skips is_secret). Its reward
  // was can_wall_jump, which the Flash client honoured (AvatarPhysicsHandler.as), so a card granted by hand
  // did something; a player reset took it with every movement card (inc_physics.js 36).
  [/^jump_wall$/, 'none', 'Secret card that was never dealt, so no player could get it.'],
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
  // inc_data_imagination.js 5557-5572: secret, no rewards, and nothing anywhere checks it (server or client).
  [/^mining_multitasking$/, 'none', 'Secret card with no effect: nothing in the original game checks it.'],
  [/^refining_time_[12]$/, 'live', 'Grinding ore takes 20 / 40% less time.'],
  [/^refining_drop_[12]$/, 'live', 'Grinding a batch of 5+ ore rolls the refining drop table (4 / 8%).'],
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
  // inc_data_imagination.js 5888-5908; items/cauldron.js 320-329 rolls cocktail_crafting_imagination instead.
  [/^potionmaking_imagination$/, 'none', 'The original game never checks this upgrade (the Cauldron rolls Shake Things Up instead).'],
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
  // construction_tool.js 334-381 (G358, js/furniture-upgrades.js). Secret in the source; dealt here (imagination.js DEALT_SECRET_CARDS).
  [/^furnituremaking_bonus_upgrade_1$/, 'live', '5% of the Furnituremaking I pieces you make with a Construction Tool come out as a random style worth 25 credits or less (the piece goes into your furniture storage).'],
  [/^furnituremaking_bonus_upgrade_2$/, 'live', 'The 5% bonus style now also comes out of Furnituremaking II pieces.'],
  [/^furnituremaking_bonus_upgrade_3$/, 'live', 'The 5% bonus style now also comes out of Engineering pieces (Storage Display Box, cabinets, shelves).'],
  [/^fiber_arts_bonus_1$/, 'live', '4% of spins on a Spindle make String instead of Thread.'],
  [/^fiber_arts_bonus_2$/, 'live', '4% of General Fabric batches on a Loomer give 2 more Fabric.'],
  [/^distilling_(corn|grain|potato)$/, 'live', 'That crop puts 20% more into the Still hopper.'],
  // inc_data_imagination.js 1321-1348: secret, no rewards; items/crystallizer.js never checks it.
  [/^crystallography_craft_multiple_crystals$/, 'none', 'Secret card with no effect: nothing in the original game checks it.'],
  // bag_elemental_pouch.js verbs.shake 53-114 + doShake 669-690 (js/elemental-pouch.js).
  [/^element_handling_bonus_1$/, 'live', 'Adds Shake to your Elemental Pouch: once a day, each element in it grows by 4, 5 or 6% (rounded), up to 5000 of each.'],
  [/^element_handling_bonus_2$/, 'live', 'Super Shake: each element grows by 8 to 12% instead (rounded), up to 5000 of each.'],
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
  [/^croppery_herbalism_(watering|clearing)_time$/, 'live', 'Required for Master Gardener, whose garden potions now water, plant, clear, fertilize and harvest a whole bed; the original only shortens the potion pass (one sound instead of two).'],
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
  // players/player.js 1851-1863 (radiance-mp.js imInterrupts / chatInterrupts, meditation-feature).
  [/^meditative_arts_less_distraction$/, 'online', 'An instant message from another player no longer breaks your meditation (online, where IMs are).'],
  [/^meditative_arts_less_distraction_2$/, 'online', 'Your own chat lines and instant messages no longer break your meditation (online).'],
  [/^levitation_time$/, 'live', 'Levitation lasts 8 seconds instead of 5 and costs 12 energy instead of 20.'],
  [/^levitation_physics$/, 'live', 'Levitation floats longer: lighter gravity and stronger lifts.'],
  [/^piety_shrine_prime_bonus_[12]$/, 'live', 'Offerings through a shrine you primed hit the Rook 25 / 50% harder.'],
  [/^icon_tithe_[1-4]$/, 'live', 'Tithing an Icon costs 3 / 5 / 10 / 20% fewer currants.'],
  [/^icon_bestow_chance_[1-3]$/, 'live', 'Placed Icons bestow Giant Love 5.5 / 6 / 6.5% of the time (from 5%).'],
  // inc_imagination.js 906-933, focusing_orb.js 1152-1311 (G330: radiance-mp.js, server radiance.go).
  [/^transcendental_radius_1$/, 'online', 'Transcendental Radiation reaches 50% further (online, where there are players to radiate to).'],
  [/^transcendental_radius_2$/, 'online', 'Transcendental Radiation reaches twice as far (online).'],
  [/^transcendental_radius_3$/, 'online', 'Transcendental Radiation reaches everyone on the street (online).'],
  [/^transcendental_benefits_1$/, 'online', 'Transcendental Radiation lasts 20% longer (online).'],
  [/^transcendental_benefits_2$/, 'online', 'Transcendental Radiation lasts 50% longer (online).'],
  [/^transcendental_imagination$/, 'online', '5% of radiations also pay you bonus iMG (online).'],
  // inc_special_locations.js 46-51 / 133-138, catalog_buffs.js 31-36, inc_imagination.js 175-176 (G39, js/ancestral-nostalgia.js).
  [/^ancestral_lands_time_1$/, 'live', 'Overwhelming Ancestral Nostalgia lasts 11 minutes instead of 10, so you can stay a minute longer in the Ancestral Lands before you are sent away.'],
  [/^ancestral_lands_time_2$/, 'live', 'Overwhelming Ancestral Nostalgia lasts 12 minutes.'],
  [/^rube_better_items$/, 'live', 'The Rube treats you as 10 levels higher when choosing what to offer: no more cheap items.'],
  [/^rube_chance_to_meet$/, 'live', 'The Rube visits on 1% of street entries (from 0.5%).'],
  [/^unlearning_ability$/, 'live', 'Unlearn a skill from the Skills panel in the time it took to learn.'],
  [/^unlearning_time_[12]$/, 'live', 'Unlearning takes 25 / 50% less time.'],

  // Interface conveniences.
  // player.js 3404-3406 canJoinTradeChat, inc_imagination.js 181-187 (G326: groups-feature, site Groups.php).
  [/^trade_channel$/, 'online', 'Opens the Trade Channel in the chat (online).'],
  // player.js 2148-2173 getCameraAbilities (G332: snaps-feature, site Snaps.php).
  [/^snapshotting$/, 'online', 'Snaps in Camera Mode (Enter), kept on the site for other players\' Cameras (online, where Snaps are).'],
  // main.js 6871-6893 lists each pack's filters for Camera Mode; glitch-client glitchr/filters (js/snap-filters.js).
  [/^snapshottery_basic_filter_pack$/, 'online', 'The Boost, B&W, Historic and Chilliwack filters for your Snaps (online).'],
  [/^snapshottery_filter_pack_1$/, 'online', 'The Piggy, Beryl and Fire Fly filters for your Snaps (online).'],
  [/^snapshottery_filter_pack_2$/, 'online', 'The Holga, Vintage and Ancient filters for your Snaps (online).'],
  [/^snapshottery_filter_pack_3$/, 'online', 'The Dither, Shift and Outline filters for your Snaps (online).'],
  // inc_data_imagination.js 3123-3144 / 5006-5027: secret, no rewards; the Flash client gave every player
  // inventory search and map search (InventorySearchManager.as, LocationSearchMap.as) without the card.
  [/^(map_search|inventory_search)$/, 'none', 'Secret card with no effect: the original gave everyone this search without it.'],
  // items/bag_generic_gray.js 30-473, bag.js 113-150 / 774-808 (js/pack-slots.js, features/bags-feature.js).
  [/^pack_internal_sortitude$/, 'live', 'Adds Sort: verbs to your Generic and Bigger Bags: a bag sorted for keys, food, mining goods and more takes them first when they come into your pack.'],
  [/^pack_magic_sort$/, 'live', 'Adds Magic sort to a sorted bag (and to toolboxes, spice racks and other one-kind bags): it gathers in what it is for from the rest of your pack.'],
  [/^pack_stack_up_bags$/, 'live', 'Adds Stack up to your bags: partial stacks of one thing across your pack and bags join into full ones.'],
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

/** Cards the multiplayer shop deals: the solo ones, and those whose effect is wired online. */
export function isOfferedOnline(id) {
  return isOfferedInRemake(id) || remakeStatus(id).status === 'online';
}

export const REMAKE_STATUS_RULES = RULES;
