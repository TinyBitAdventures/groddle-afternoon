/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=8679fcab';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=25b58b25';
import { questOffersFeature } from './quest-offers-feature.js?v=e2ba8b9c';
import { meditationFeature } from './meditation-feature.js?v=9deafde9';
import { teleportationFeature } from './teleportation-feature.js?v=3df5070c';
import { racesFeature } from './races-feature.js?v=468234e8';
import { mayhemFeature } from './mayhem-feature.js?v=6cb71c31';
import { crownsFeature } from './crowns-feature.js?v=67def12f';
import { patchesFeature } from './patches-feature.js?v=36616769';
import { foxesFeature } from './foxes-feature.js?v=2e6bb9e9';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=9d7a6e66';
import { homesFeature } from './homes-feature.js?v=19223b1a';
import { rookAttackFeature } from './rook-attack-feature.js?v=1ddb5049';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=b738d795';
import { doorsFeature } from './doors-feature.js?v=e0ea66ac';
import { locationEventsFeature } from './location-events-feature.js?v=1c5b6340';
import { puzzlesFeature } from './puzzles-feature.js?v=af0fc0e3';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=19a3e3b8';
import { streetJobsFeature } from './street-jobs-feature.js?v=e345cf11';
import { imaginationFeature } from './imagination-feature.js?v=b699c633';
import { supplyFeature } from './supply-feature.js?v=a8465469';
import { giantIconsFeature } from './giant-icons-feature.js?v=84cba776';
import { rubeFeature } from './rube-feature.js?v=3bc4adbe';
import { unlearningFeature } from './unlearning-feature.js?v=de32d9ee';
import { dropsFeature } from './drops-feature.js?v=5fce9ad0';
import { masterGardenFeature } from './master-garden-feature.js?v=6a07de61';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=c676af54';
import { questInstancesFeature } from './quest-instances-feature.js?v=c8dd7fd7';
import { partySpacesFeature } from './party-spaces-feature.js?v=7cdb53d7';
import { seasonsFeature } from './seasons-feature.js?v=b01bb1a5';
import { cameraModeFeature } from './camera-mode-feature.js?v=1dbbcbd3';
import { newxpFeature } from './newxp-feature.js?v=c0b121bd';
import { streetMinimapFeature } from './street-minimap-feature.js?v=200f5165';

export { questFlagsFeature };

export const FEATURES = [
  questFlagsFeature,
  hellFeature,
  resourceNodesFeature,
  questOffersFeature,
  meditationFeature,
  teleportationFeature,
  racesFeature,
  mayhemFeature,
  crownsFeature,
  patchesFeature,
  foxesFeature,
  heliKittiesFeature,
  homesFeature,
  rookAttackFeature,
  streetFurnitureFeature,
  doorsFeature,
  locationEventsFeature,
  puzzlesFeature,
  puzzleScenesFeature,
  streetJobsFeature,
  imaginationFeature,
  supplyFeature,
  giantIconsFeature,
  rubeFeature,
  unlearningFeature,
  dropsFeature,
  masterGardenFeature,
  animalHusbandryFeature,
  questInstancesFeature,
  partySpacesFeature,
  seasonsFeature,
  cameraModeFeature,
  newxpFeature,
  streetMinimapFeature,
];
import { smugglingFeature } from './smuggling-feature.js?v=170d9579'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=a39637c6'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=5556d39f'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=17fdc59f'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=0ecb5419'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=0005a40d'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=d027f098'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=b98a2187'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=2d94def8'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=6fea6a2f'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=2841e4f1'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=2c27f459'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=ec7b33fa'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=d339386a'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=2838c92f'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=044f0e6f'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=426f342b'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=ccce6347'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=22c06634'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=568c82ab'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=9a54b747'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=9687e04e'; FEATURES.push(hiddenFloorsFeature);
// Glitch's Random Hole (items/random_hole.js): touch one and pop out of another on the same street.
import { randomHolesFeature } from './random-holes-feature.js?v=f29d357c'; FEATURES.push(randomHolesFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { thornfadLettersFeature } from './thornfad-letters-feature.js?v=b88a132f'; FEATURES.push(thornfadLettersFeature);
import { streetToysFeature } from './street-toys-feature.js?v=5b5f0f16'; FEATURES.push(streetToysFeature);
import { koulatoJarsFeature } from './koulato-jars-feature.js?v=989b015b'; FEATURES.push(koulatoJarsFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=3a0ea434'; FEATURES.push(rebuiltRoomsFeature);
import { quarterFeature } from './quarter-feature.js?v=d2b51c60'; FEATURES.push(quarterFeature);
import { deadEndsFeature } from './dead-ends-feature.js?v=50e71f9a'; FEATURES.push(deadEndsFeature);
import { interrogationRoomFeature } from './interrogation-room-feature.js?v=5b8b204a'; FEATURES.push(interrogationRoomFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=2613cfb3'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=c9ba320d'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=d038438c'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=f8333a11'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=32198639'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=32d11520'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=f2c2610a'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=dac26e55'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=aea8620b'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=385d5089'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=cdc2ae5c'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=88c18e13'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=dfd55aa8'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=69b0fef3'; FEATURES.push(crabsFeature);
// G1245 (#661, ours): the Vine Radio on a home street, its Choose music sheet and its music.
import { radioFeature } from './vine-radio-feature.js?v=850fb8c7'; FEATURES.push(radioFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=76e632e5'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=2836ad51'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=37b1165d'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=f588f27e'; FEATURES.push(gardenGuanoFeature);
import { worldDropFeature } from './world-drop-feature.js?v=df9fde3f'; FEATURES.push(worldDropFeature);
import { gardenNoticesFeature } from './garden-notices-feature.js?v=fe7e027c'; FEATURES.push(gardenNoticesFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=10eaadee'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=be0bdc0c'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=8f47f82c'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=613ecd32'; FEATURES.push(packTreeVerbsFeature);
import { packToolVerbsFeature } from './pack-tool-verbs-feature.js?v=7a55178a'; FEATURES.push(packToolVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=df0a22c8'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=54390eef'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=ffdbab28'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=682f3275'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=28d825ec'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=5d71a1eb'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=2948043c'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=bf5413ed'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=bc83689a'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=329c41e8'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=3d44cb5b'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=bccd0e7f'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=e218803f'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=5d1f752a'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=95659434'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=2825b888'; FEATURES.push(ledgerFeature);
import { vendorFinderFeature } from './vendor-finder-feature.js?v=920bb478'; FEATURES.push(vendorFinderFeature);
import { buddiesFeature } from './buddies-feature.js?v=7ca9abe8'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=6db5bdcc'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=b7f08be9'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=d01a99c4'; FEATURES.push(questsMpFeature);
import { peatQuestMpFeature } from './peat-quest-mp-feature.js?v=1b355d87'; FEATURES.push(peatQuestMpFeature);
import { groupsFeature } from './groups-feature.js?v=5f7de309'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=a6cf36d1'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=11f6d1d9'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=d86a9d9e'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=b83f8f33'; FEATURES.push(followMpFeature);
import { summonMpFeature } from './summon-mp-feature.js?v=8b92505a'; FEATURES.push(summonMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=74d61e52'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=350b8ff3'; FEATURES.push(dropsMpFeature);
import { gravesMpFeature } from './graves-mp-feature.js?v=bbc41e90'; FEATURES.push(gravesMpFeature);
import { doorKeysFeature } from './door-keys-feature.js?v=1aaac29f'; FEATURES.push(doorKeysFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=4271914e'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=29cf9d35'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=fcd846dc'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=fbf4cb7a'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=8245ba23'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=fc437513'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=eda3419c'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=56ce7157'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=f5eb2a4d'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=48e77c70'; FEATURES.push(homeStorageFeature);
import { homeLiveFeature } from './home-live-feature.js?v=0020c4eb'; FEATURES.push(homeLiveFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=5a4cfe2d'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=aa9a0880'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=e2077bab'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=0e07d9a1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=75786bbd'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=239aaefb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=b8d0daf2'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=a80ab6bc'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=704d27da'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=f6a6fdc9'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=66281288'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=3ab3fd3b'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=146ead82'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=4a54b8e9'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=775c97af'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=715c84fd'; FEATURES.push(collectionTrophiesFeature);
import { recipeMemoryFeature } from './recipe-memory-feature.js?v=b4ba0f0a'; FEATURES.push(recipeMemoryFeature);
import { compoundDiscoveryFeature } from './compound-discovery-feature.js?v=54983bd8'; FEATURES.push(compoundDiscoveryFeature);
import { sharedGardensFeature } from './shared-gardens-feature.js?v=b9ebe997'; FEATURES.push(sharedGardensFeature);
import { sharedPatchesFeature } from './shared-patches-feature.js?v=bce0a57d'; FEATURES.push(sharedPatchesFeature);
import { cubimalBattleFeature } from './cubimal-battle-feature.js?v=3915a42b'; FEATURES.push(cubimalBattleFeature);
import { chatPurgeFeature } from './chat-purge-feature.js?v=cb6c250d'; FEATURES.push(chatPurgeFeature);
import { streetFixesFeature } from './street-fixes-feature.js?v=06e9f5a2'; FEATURES.push(streetFixesFeature);
import { skillBubblesFeature } from './skill-bubbles-feature.js?v=bac770ec'; FEATURES.push(skillBubblesFeature);
// G947 (M3): crews on a home street (help mine, help dig); answers help-mine-feature's queries there.
import { homeCrewMpFeature } from './home-crew-mp-feature.js?v=1dac05c8'; FEATURES.push(homeCrewMpFeature);
// TODAYCARD: the start card's Today panel and nudge for a returning player (asks solo-feats for startCardFeat).
import { startTodayFeature } from './start-today-feature.js?v=07488661'; FEATURES.push(startTodayFeature);
// G1312: a finished Group Hall's street, members only, entered from its lot (street-jobs-feature).
import { groupHallStreetFeature } from './group-hall-street-feature.js?v=59e2a499'; FEATURES.push(groupHallStreetFeature);
import { chickenScareFeature } from './chicken-scare-feature.js?v=afcd9b2a'; FEATURES.push(chickenScareFeature);
import { gameTeleporterFeature } from './game-teleporter-feature.js?v=d1c75903'; FEATURES.push(gameTeleporterFeature);
import { levelUpMpFeature } from './level-up-mp-feature.js?v=22659e6d'; FEATURES.push(levelUpMpFeature);
// G982 Pot Luck Day, part A: the chicken costumes (after seasons-feature, whose seasonOn it asks).
import { potLuckFeature } from './pot-luck-feature.js?v=26c13460'; FEATURES.push(potLuckFeature);
import { potLuckFeastFeature } from './pot-luck-feast-feature.js?v=e246b0a3'; FEATURES.push(potLuckFeastFeature);
// G1009 Thanksgiving Day's feast: eat-in-place piles of the week's table food (asks pot-luck-feast for its counts).
import { feastDayFeature } from './feast-day-feature.js?v=4c869b81'; FEATURES.push(feastDayFeature);
import { calendarFeature } from './calendar-feature.js?v=6cbe4537'; FEATURES.push(calendarFeature);
// G1195 Happy New Ur: the countdown at the Groddle midnights of December 31, the show and the party street.
import { newUrFeature } from './new-ur-feature.js?v=f78d5183'; FEATURES.push(newUrFeature);
import { newUrPartyFeature } from './new-ur-party-feature.js?v=73d30d79'; FEATURES.push(newUrPartyFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=841cb1ef'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=5f3320d1'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=7cda2116'; FEATURES.push(accountBackupFeature);
