/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=2071e737';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=bafaaa48';
import { questOffersFeature } from './quest-offers-feature.js?v=e1da24cc';
import { meditationFeature } from './meditation-feature.js?v=3be95bf0';
import { teleportationFeature } from './teleportation-feature.js?v=3dc439b9';
import { racesFeature } from './races-feature.js?v=34a829ae';
import { mayhemFeature } from './mayhem-feature.js?v=edefd650';
import { crownsFeature } from './crowns-feature.js?v=e55d1b47';
import { patchesFeature } from './patches-feature.js?v=47114517';
import { foxesFeature } from './foxes-feature.js?v=55edb09c';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=7726f88f';
import { homesFeature } from './homes-feature.js?v=6f62563f';
import { rookAttackFeature } from './rook-attack-feature.js?v=25cdf70e';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=f24ef5cc';
import { doorsFeature } from './doors-feature.js?v=14aa3f1f';
import { locationEventsFeature } from './location-events-feature.js?v=1c5b6340';
import { puzzlesFeature } from './puzzles-feature.js?v=0bad3187';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=5313f8b4';
import { streetJobsFeature } from './street-jobs-feature.js?v=a1b071dd';
import { imaginationFeature } from './imagination-feature.js?v=14fda213';
import { supplyFeature } from './supply-feature.js?v=396a928f';
import { giantIconsFeature } from './giant-icons-feature.js?v=6c01ecb1';
import { rubeFeature } from './rube-feature.js?v=297ef961';
import { unlearningFeature } from './unlearning-feature.js?v=cbabf5c6';
import { dropsFeature } from './drops-feature.js?v=0ff27571';
import { masterGardenFeature } from './master-garden-feature.js?v=2304d0ce';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=ca3e9c88';
import { questInstancesFeature } from './quest-instances-feature.js?v=75cb26d4';
import { partySpacesFeature } from './party-spaces-feature.js?v=6ae500ba';
import { seasonsFeature } from './seasons-feature.js?v=889075fd';
import { cameraModeFeature } from './camera-mode-feature.js?v=71e0cdce';
import { newxpFeature } from './newxp-feature.js?v=072e93e9';
import { streetMinimapFeature } from './street-minimap-feature.js?v=43b74e07';

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
import { smugglingFeature } from './smuggling-feature.js?v=e891748e'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=dede285b'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=e987fd5d'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=4e2baea6'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=8765ccd6'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=e25f208a'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=b2eb03a0'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=9387e6f4'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=d18d7569'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=8db14719'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=5d8f6118'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=603a4d94'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=2928f9d0'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=6e45d5ba'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=d0793aa6'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=24218d1e'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=426f342b'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=8d245d08'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=e7a6f1b9'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=79067be9'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=dc7b16ed'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=91b3ac77'; FEATURES.push(hiddenFloorsFeature);
// Glitch's Random Hole (items/random_hole.js): touch one and pop out of another on the same street.
import { randomHolesFeature } from './random-holes-feature.js?v=e7177463'; FEATURES.push(randomHolesFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { thornfadLettersFeature } from './thornfad-letters-feature.js?v=6eeefe36'; FEATURES.push(thornfadLettersFeature);
import { streetToysFeature } from './street-toys-feature.js?v=c94fcbec'; FEATURES.push(streetToysFeature);
import { koulatoJarsFeature } from './koulato-jars-feature.js?v=989b015b'; FEATURES.push(koulatoJarsFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=b7c2982d'; FEATURES.push(rebuiltRoomsFeature);
import { quarterFeature } from './quarter-feature.js?v=f5c81363'; FEATURES.push(quarterFeature);
import { deadEndsFeature } from './dead-ends-feature.js?v=780f62cb'; FEATURES.push(deadEndsFeature);
import { interrogationRoomFeature } from './interrogation-room-feature.js?v=e8ec81eb'; FEATURES.push(interrogationRoomFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=2613cfb3'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=ea2715aa'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=e273c29d'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=32b9256a'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=40406f55'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=1d5abf66'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=8ef7a788'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=15f98f06'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=aea8620b'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=cb022c8a'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=89f0c3e1'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=12871f22'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=7308fbfc'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=e23ebb4e'; FEATURES.push(crabsFeature);
// G1245 (#661, ours): the Vine Radio on a home street, its Choose music sheet and its music.
import { radioFeature } from './vine-radio-feature.js?v=2a4a1db8'; FEATURES.push(radioFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=2db70fa3'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=e06bdf49'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=ac3a61c1'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=3faeddbb'; FEATURES.push(gardenGuanoFeature);
import { worldDropFeature } from './world-drop-feature.js?v=535c019d'; FEATURES.push(worldDropFeature);
import { gardenNoticesFeature } from './garden-notices-feature.js?v=fa6a7e95'; FEATURES.push(gardenNoticesFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=f9d8782d'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=707260e7'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=22a6041b'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=613ecd32'; FEATURES.push(packTreeVerbsFeature);
import { packToolVerbsFeature } from './pack-tool-verbs-feature.js?v=7a55178a'; FEATURES.push(packToolVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=1f64b953'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=67704f8c'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=a79587a0'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=e6bfe174'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=0a9583b6'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=1b25a0d7'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=b6e3ecc2'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=bf5413ed'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=a31a3613'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=6f0df99c'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=14415ef6'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=a7b59120'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=5f80492b'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=38b383d6'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=c15dc61d'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=2825b888'; FEATURES.push(ledgerFeature);
import { vendorFinderFeature } from './vendor-finder-feature.js?v=bda9237a'; FEATURES.push(vendorFinderFeature);
import { buddiesFeature } from './buddies-feature.js?v=dec3565b'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=da2cbe51'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=ad1b3b62'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=cad741ea'; FEATURES.push(questsMpFeature);
import { peatQuestMpFeature } from './peat-quest-mp-feature.js?v=c0fc5f5b'; FEATURES.push(peatQuestMpFeature);
import { groupsFeature } from './groups-feature.js?v=d9f66484'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=d9d95573'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=0276e653'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=d86a9d9e'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=b83f8f33'; FEATURES.push(followMpFeature);
import { summonMpFeature } from './summon-mp-feature.js?v=d1ba1a35'; FEATURES.push(summonMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=33479007'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=c48e2640'; FEATURES.push(dropsMpFeature);
import { gravesMpFeature } from './graves-mp-feature.js?v=d1164ba2'; FEATURES.push(gravesMpFeature);
import { doorKeysFeature } from './door-keys-feature.js?v=1aaac29f'; FEATURES.push(doorKeysFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=1ed06a15'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=20ee73f2'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=dfbb5ea0'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=cd05c3aa'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=cc742dde'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=fdef25dc'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=eda3419c'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=e2037c08'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=95f5915a'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=e4d2ee1f'; FEATURES.push(homeStorageFeature);
import { homeLiveFeature } from './home-live-feature.js?v=0020c4eb'; FEATURES.push(homeLiveFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=5a505823'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=773489f5'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=589e49ec'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=0e07d9a1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=e070fe66'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=239aaefb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=0409a426'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=2ff7dae2'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=0750c712'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=ddb17a9f'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=66281288'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=40759c57'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=146ead82'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=4a54b8e9'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=41273f01'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=8254ecc4'; FEATURES.push(collectionTrophiesFeature);
import { recipeMemoryFeature } from './recipe-memory-feature.js?v=963139e7'; FEATURES.push(recipeMemoryFeature);
import { compoundDiscoveryFeature } from './compound-discovery-feature.js?v=f07dd91a'; FEATURES.push(compoundDiscoveryFeature);
import { sharedGardensFeature } from './shared-gardens-feature.js?v=d3a8343a'; FEATURES.push(sharedGardensFeature);
import { sharedPatchesFeature } from './shared-patches-feature.js?v=6658ba8a'; FEATURES.push(sharedPatchesFeature);
import { cubimalBattleFeature } from './cubimal-battle-feature.js?v=3dc557f7'; FEATURES.push(cubimalBattleFeature);
import { chatPurgeFeature } from './chat-purge-feature.js?v=cb6c250d'; FEATURES.push(chatPurgeFeature);
import { streetFixesFeature } from './street-fixes-feature.js?v=06e9f5a2'; FEATURES.push(streetFixesFeature);
import { skillBubblesFeature } from './skill-bubbles-feature.js?v=7b6f1022'; FEATURES.push(skillBubblesFeature);
// G947 (M3): crews on a home street (help mine, help dig); answers help-mine-feature's queries there.
import { homeCrewMpFeature } from './home-crew-mp-feature.js?v=81824897'; FEATURES.push(homeCrewMpFeature);
// TODAYCARD: the start card's Today panel and nudge for a returning player (asks solo-feats for startCardFeat).
import { startTodayFeature } from './start-today-feature.js?v=0d8b2ecb'; FEATURES.push(startTodayFeature);
// G1312: a finished Group Hall's street, members only, entered from its lot (street-jobs-feature).
import { groupHallStreetFeature } from './group-hall-street-feature.js?v=59e2a499'; FEATURES.push(groupHallStreetFeature);
import { chickenScareFeature } from './chicken-scare-feature.js?v=a460944d'; FEATURES.push(chickenScareFeature);
import { gameTeleporterFeature } from './game-teleporter-feature.js?v=8b56238e'; FEATURES.push(gameTeleporterFeature);
import { levelUpMpFeature } from './level-up-mp-feature.js?v=22659e6d'; FEATURES.push(levelUpMpFeature);
// G982 Pot Luck Day, part A: the chicken costumes (after seasons-feature, whose seasonOn it asks).
import { potLuckFeature } from './pot-luck-feature.js?v=487baddd'; FEATURES.push(potLuckFeature);
import { potLuckFeastFeature } from './pot-luck-feast-feature.js?v=78d688d3'; FEATURES.push(potLuckFeastFeature);
// G1009 Thanksgiving Day's feast: eat-in-place piles of the week's table food (asks pot-luck-feast for its counts).
import { feastDayFeature } from './feast-day-feature.js?v=c6a9aaf3'; FEATURES.push(feastDayFeature);
import { calendarFeature } from './calendar-feature.js?v=6cbe4537'; FEATURES.push(calendarFeature);
// G1195 Happy New Ur: the countdown at the Groddle midnights of December 31, the show and the party street.
import { newUrFeature } from './new-ur-feature.js?v=1a4d36d0'; FEATURES.push(newUrFeature);
import { newUrPartyFeature } from './new-ur-party-feature.js?v=f42ade79'; FEATURES.push(newUrPartyFeature);
// Meteor showers and lone shooting stars in the night sky (ours): started from the console, synced by the server.
import { meteorShowerFeature } from './meteor-shower-feature.js?v=100d8c5e'; FEATURES.push(meteorShowerFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=fa0035e8'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=02112e91'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=7cda2116'; FEATURES.push(accountBackupFeature);
