/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=b3f6bb33';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=9d032d86';
import { questOffersFeature } from './quest-offers-feature.js?v=e2ba8b9c';
import { meditationFeature } from './meditation-feature.js?v=fb4d0cac';
import { teleportationFeature } from './teleportation-feature.js?v=6c413af1';
import { racesFeature } from './races-feature.js?v=189ff57f';
import { mayhemFeature } from './mayhem-feature.js?v=6aea206e';
import { crownsFeature } from './crowns-feature.js?v=1f0251c9';
import { patchesFeature } from './patches-feature.js?v=ae1f8b31';
import { foxesFeature } from './foxes-feature.js?v=26383b90';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=6988b94e';
import { homesFeature } from './homes-feature.js?v=40aefd9c';
import { rookAttackFeature } from './rook-attack-feature.js?v=66fb41be';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=489ef3dc';
import { doorsFeature } from './doors-feature.js?v=81ee2cdd';
import { locationEventsFeature } from './location-events-feature.js?v=13175520';
import { puzzlesFeature } from './puzzles-feature.js?v=12ca7213';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=2b0b8233';
import { streetJobsFeature } from './street-jobs-feature.js?v=14067d1b';
import { imaginationFeature } from './imagination-feature.js?v=e716a163';
import { supplyFeature } from './supply-feature.js?v=a948ba88';
import { giantIconsFeature } from './giant-icons-feature.js?v=69813637';
import { rubeFeature } from './rube-feature.js?v=80c7874a';
import { unlearningFeature } from './unlearning-feature.js?v=de32d9ee';
import { dropsFeature } from './drops-feature.js?v=67036c6e';
import { masterGardenFeature } from './master-garden-feature.js?v=193a7f57';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=5fb58dff';
import { questInstancesFeature } from './quest-instances-feature.js?v=5306f321';
import { partySpacesFeature } from './party-spaces-feature.js?v=cdcffabd';
import { seasonsFeature } from './seasons-feature.js?v=12daed29';
import { cameraModeFeature } from './camera-mode-feature.js?v=3e2e8721';
import { newxpFeature } from './newxp-feature.js?v=795c74b5';
import { streetMinimapFeature } from './street-minimap-feature.js?v=cb78fbb2';

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
import { smugglingFeature } from './smuggling-feature.js?v=6116634b'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=93b1bf27'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=9e20da33'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=3af1adf4'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=9cbd5ec9'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=46b6949f'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=da4c7ad9'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=1a6cd3d9'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=85b5b8a6'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=20125f6e'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=80a1396b'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=926788f4'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=1e7c3b13'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=bb5f5cfb'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=7eb6c71c'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=c6bded2b'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=426f342b'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=fba5f85b'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=58ea1ec4'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=16cd16c4'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=9a54b747'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=b0b33dc1'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { thornfadLettersFeature } from './thornfad-letters-feature.js?v=b88a132f'; FEATURES.push(thornfadLettersFeature);
import { streetToysFeature } from './street-toys-feature.js?v=6dacccb1'; FEATURES.push(streetToysFeature);
import { koulatoJarsFeature } from './koulato-jars-feature.js?v=00832931'; FEATURES.push(koulatoJarsFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=0f928a67'; FEATURES.push(rebuiltRoomsFeature);
import { quarterFeature } from './quarter-feature.js?v=abffbacf'; FEATURES.push(quarterFeature);
import { deadEndsFeature } from './dead-ends-feature.js?v=1a5e981f'; FEATURES.push(deadEndsFeature);
import { interrogationRoomFeature } from './interrogation-room-feature.js?v=3b2769d5'; FEATURES.push(interrogationRoomFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=2613cfb3'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=77386ca9'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=371e5c00'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=6edb0a3c'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=10b42a97'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=32d11520'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=bf1b0d08'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=a8d89c5b'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=5487f05c'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=4fef0e78'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=8ff44720'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=8b86aaeb'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=08be421a'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=b65c5cc6'; FEATURES.push(crabsFeature);
// G1245 (#661, ours): the Vine Radio on a home street, its Choose music sheet and its music.
import { radioFeature } from './vine-radio-feature.js?v=1a298021'; FEATURES.push(radioFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=e2dcfdf8'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=51e0bf44'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=a06a275f'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=f588f27e'; FEATURES.push(gardenGuanoFeature);
import { worldDropFeature } from './world-drop-feature.js?v=2a740be1'; FEATURES.push(worldDropFeature);
import { gardenNoticesFeature } from './garden-notices-feature.js?v=4412e915'; FEATURES.push(gardenNoticesFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=18e0411f'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=6994f174'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=ebee35dc'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=613ecd32'; FEATURES.push(packTreeVerbsFeature);
import { packToolVerbsFeature } from './pack-tool-verbs-feature.js?v=7a55178a'; FEATURES.push(packToolVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=c853aa4d'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=0fb04690'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=ffdbab28'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=0d89701e'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=95ad9731'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=5d71a1eb'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=0163cc83'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=bf5413ed'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=5c91331b'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=56ef379c'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=0f1f688d'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=c58ba4ee'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=e218803f'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=5d1f752a'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=c80a2867'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=a78e3d8c'; FEATURES.push(ledgerFeature);
import { vendorFinderFeature } from './vendor-finder-feature.js?v=fc001375'; FEATURES.push(vendorFinderFeature);
import { buddiesFeature } from './buddies-feature.js?v=b916c35f'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=6d27fcda'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=6579c175'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=d01a99c4'; FEATURES.push(questsMpFeature);
import { peatQuestMpFeature } from './peat-quest-mp-feature.js?v=2a3a0d49'; FEATURES.push(peatQuestMpFeature);
import { groupsFeature } from './groups-feature.js?v=46cd41d4'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=acd5b732'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=3cbac17c'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=22d75ac3'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=b83f8f33'; FEATURES.push(followMpFeature);
import { summonMpFeature } from './summon-mp-feature.js?v=c1fc8b1d'; FEATURES.push(summonMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=d8134654'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=9b314606'; FEATURES.push(dropsMpFeature);
import { gravesMpFeature } from './graves-mp-feature.js?v=27e2be66'; FEATURES.push(gravesMpFeature);
import { doorKeysFeature } from './door-keys-feature.js?v=1aaac29f'; FEATURES.push(doorKeysFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=4629998c'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=d4d7be10'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=8b7c8cb8'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=7b074427'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=b01aa08d'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=138a4206'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=eda3419c'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=7e0c496b'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=c3a1c931'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=dd60b2df'; FEATURES.push(homeStorageFeature);
import { homeLiveFeature } from './home-live-feature.js?v=84b01b4b'; FEATURES.push(homeLiveFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=5a4cfe2d'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=3a5cf37c'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=7e1f2688'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=0e07d9a1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=75786bbd'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=b410467c'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=8a25e0a9'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=a80ab6bc'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=704d27da'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=f6a6fdc9'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=66281288'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=3ab3fd3b'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=146ead82'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=826b9797'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=7d25908e'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=715c84fd'; FEATURES.push(collectionTrophiesFeature);
import { recipeMemoryFeature } from './recipe-memory-feature.js?v=ede86999'; FEATURES.push(recipeMemoryFeature);
import { compoundDiscoveryFeature } from './compound-discovery-feature.js?v=d00b7568'; FEATURES.push(compoundDiscoveryFeature);
import { sharedGardensFeature } from './shared-gardens-feature.js?v=48e149ca'; FEATURES.push(sharedGardensFeature);
import { sharedPatchesFeature } from './shared-patches-feature.js?v=8ce1a8d6'; FEATURES.push(sharedPatchesFeature);
import { cubimalBattleFeature } from './cubimal-battle-feature.js?v=b560ac6a'; FEATURES.push(cubimalBattleFeature);
import { chatPurgeFeature } from './chat-purge-feature.js?v=cb6c250d'; FEATURES.push(chatPurgeFeature);
import { streetFixesFeature } from './street-fixes-feature.js?v=06e9f5a2'; FEATURES.push(streetFixesFeature);
import { skillBubblesFeature } from './skill-bubbles-feature.js?v=c74e18c4'; FEATURES.push(skillBubblesFeature);
// G947 (M3): crews on a home street (help mine, help dig); answers help-mine-feature's queries there.
import { homeCrewMpFeature } from './home-crew-mp-feature.js?v=6aae7990'; FEATURES.push(homeCrewMpFeature);
// TODAYCARD: the start card's Today panel and nudge for a returning player (asks solo-feats for startCardFeat).
import { startTodayFeature } from './start-today-feature.js?v=07488661'; FEATURES.push(startTodayFeature);
// G1312: a finished Group Hall's street, members only, entered from its lot (street-jobs-feature).
import { groupHallStreetFeature } from './group-hall-street-feature.js?v=59e2a499'; FEATURES.push(groupHallStreetFeature);
import { chickenScareFeature } from './chicken-scare-feature.js?v=e6deff80'; FEATURES.push(chickenScareFeature);
import { gameTeleporterFeature } from './game-teleporter-feature.js?v=4124fcaf'; FEATURES.push(gameTeleporterFeature);
import { levelUpMpFeature } from './level-up-mp-feature.js?v=22659e6d'; FEATURES.push(levelUpMpFeature);
// G982 Pot Luck Day, part A: the chicken costumes (after seasons-feature, whose seasonOn it asks).
import { potLuckFeature } from './pot-luck-feature.js?v=ae540988'; FEATURES.push(potLuckFeature);
import { potLuckFeastFeature } from './pot-luck-feast-feature.js?v=4990bde2'; FEATURES.push(potLuckFeastFeature);
// G1009 Thanksgiving Day's feast: eat-in-place piles of the week's table food (asks pot-luck-feast for its counts).
import { feastDayFeature } from './feast-day-feature.js?v=bb594059'; FEATURES.push(feastDayFeature);
import { calendarFeature } from './calendar-feature.js?v=911e7478'; FEATURES.push(calendarFeature);
// G1195 Happy New Ur: the countdown at the Groddle midnights of December 31, the show and the party street.
import { newUrFeature } from './new-ur-feature.js?v=ec3e79d8'; FEATURES.push(newUrFeature);
import { newUrPartyFeature } from './new-ur-party-feature.js?v=597e81ae'; FEATURES.push(newUrPartyFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=3cb486ee'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=04c7bfd9'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=67cb16d8'; FEATURES.push(accountBackupFeature);
