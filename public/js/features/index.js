/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=74604dfc';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=bbf67817';
import { questOffersFeature } from './quest-offers-feature.js?v=4f23aec1';
import { meditationFeature } from './meditation-feature.js?v=2d804438';
import { teleportationFeature } from './teleportation-feature.js?v=4565e0e4';
import { racesFeature } from './races-feature.js?v=d0c6a0f1';
import { mayhemFeature } from './mayhem-feature.js?v=6aea206e';
import { crownsFeature } from './crowns-feature.js?v=8279217d';
import { patchesFeature } from './patches-feature.js?v=923a2f3d';
import { foxesFeature } from './foxes-feature.js?v=07e940e6';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=594409f1';
import { homesFeature } from './homes-feature.js?v=1e8b5e81';
import { rookAttackFeature } from './rook-attack-feature.js?v=1b9d25e2';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=050286c7';
import { doorsFeature } from './doors-feature.js?v=b34a1c83';
import { locationEventsFeature } from './location-events-feature.js?v=13175520';
import { puzzlesFeature } from './puzzles-feature.js?v=12ca7213';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=fca3ec23';
import { streetJobsFeature } from './street-jobs-feature.js?v=d7491112';
import { imaginationFeature } from './imagination-feature.js?v=df6c5849';
import { supplyFeature } from './supply-feature.js?v=c4f57ae7';
import { giantIconsFeature } from './giant-icons-feature.js?v=4b511bfa';
import { rubeFeature } from './rube-feature.js?v=cb9009c6';
import { unlearningFeature } from './unlearning-feature.js?v=de32d9ee';
import { dropsFeature } from './drops-feature.js?v=61ef6ace';
import { masterGardenFeature } from './master-garden-feature.js?v=e354ea43';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=4b5fdc7c';
import { questInstancesFeature } from './quest-instances-feature.js?v=e3215af6';
import { partySpacesFeature } from './party-spaces-feature.js?v=bbc1fcb7';
import { seasonsFeature } from './seasons-feature.js?v=b66cb70c';
import { cameraModeFeature } from './camera-mode-feature.js?v=3e2e8721';
import { newxpFeature } from './newxp-feature.js?v=22c6b653';
import { streetMinimapFeature } from './street-minimap-feature.js?v=2a56662e';

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
import { smugglingFeature } from './smuggling-feature.js?v=9965b9c6'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=dbc79f63'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=dad7b9c0'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=4668a393'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=7bd54eb1'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=584b4405'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=da4c7ad9'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=30acc93e'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=85b5b8a6'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=84e3d8b1'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=23a4891d'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=6a53b600'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=bb995cb4'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=2ee776e1'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=7afd6828'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=3501d7db'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=17bcf98a'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=26a49665'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=d25a1b87'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=4a3dc201'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=9a54b747'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=6d9c928c'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { thornfadLettersFeature } from './thornfad-letters-feature.js?v=d64406da'; FEATURES.push(thornfadLettersFeature);
import { streetToysFeature } from './street-toys-feature.js?v=6078a5a9'; FEATURES.push(streetToysFeature);
import { koulatoJarsFeature } from './koulato-jars-feature.js?v=00832931'; FEATURES.push(koulatoJarsFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=0f928a67'; FEATURES.push(rebuiltRoomsFeature);
import { quarterFeature } from './quarter-feature.js?v=020b32c7'; FEATURES.push(quarterFeature);
import { deadEndsFeature } from './dead-ends-feature.js?v=1a5e981f'; FEATURES.push(deadEndsFeature);
import { interrogationRoomFeature } from './interrogation-room-feature.js?v=3b2769d5'; FEATURES.push(interrogationRoomFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=2613cfb3'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=50d6e916'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=a4351efd'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=41e4388d'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=390d9004'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=9ccc0455'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=32652853'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=09ccef13'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=141035ab'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=952a3fb8'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=c15597b5'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=afc8ab07'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=e6faef0e'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=34e597e8'; FEATURES.push(crabsFeature);
// G1245 (#661, ours): the Vine Radio on a home street, its Choose music sheet and its music.
import { radioFeature } from './vine-radio-feature.js?v=02e6c124'; FEATURES.push(radioFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=7f1a5da5'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=4617844b'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=f81373b0'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=2468fc11'; FEATURES.push(gardenGuanoFeature);
import { worldDropFeature } from './world-drop-feature.js?v=081f70dd'; FEATURES.push(worldDropFeature);
import { gardenNoticesFeature } from './garden-notices-feature.js?v=63f2809c'; FEATURES.push(gardenNoticesFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=223528c4'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=6f63a1fa'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=09cb16b3'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=0ffcfd94'; FEATURES.push(packTreeVerbsFeature);
import { packToolVerbsFeature } from './pack-tool-verbs-feature.js?v=cf6c7ea4'; FEATURES.push(packToolVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=722fd8c3'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=7f2b3b10'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=a6816a87'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=793b8311'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=ec467b27'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=5d71a1eb'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=b338eb9e'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=bf5413ed'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=5c91331b'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=6266cfaf'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=1463654f'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=8494093a'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=e218803f'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=60096224'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=ed16a577'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=aae43c2d'; FEATURES.push(ledgerFeature);
import { vendorFinderFeature } from './vendor-finder-feature.js?v=fc001375'; FEATURES.push(vendorFinderFeature);
import { buddiesFeature } from './buddies-feature.js?v=b916c35f'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=1bc9c7f5'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=cfb44dae'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=c22c0fd5'; FEATURES.push(questsMpFeature);
import { peatQuestMpFeature } from './peat-quest-mp-feature.js?v=901a5e2b'; FEATURES.push(peatQuestMpFeature);
import { groupsFeature } from './groups-feature.js?v=c92d576f'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=82ea848b'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=0e4a8219'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=d0ceeb81'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=b83f8f33'; FEATURES.push(followMpFeature);
import { summonMpFeature } from './summon-mp-feature.js?v=2ca4f84a'; FEATURES.push(summonMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=d8134654'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=0e8f50fc'; FEATURES.push(dropsMpFeature);
import { gravesMpFeature } from './graves-mp-feature.js?v=530b23b5'; FEATURES.push(gravesMpFeature);
import { doorKeysFeature } from './door-keys-feature.js?v=7875c813'; FEATURES.push(doorKeysFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=2864b7f7'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=d4d7be10'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=8fccc08e'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=fa8c14e2'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=7b7ec420'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=138a4206'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=eda3419c'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=f65e259b'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=f26f115b'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=ced17b71'; FEATURES.push(homeStorageFeature);
import { homeLiveFeature } from './home-live-feature.js?v=84b01b4b'; FEATURES.push(homeLiveFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=bcd229ef'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=e5dc8f54'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=7e1f2688'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=0e07d9a1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=75786bbd'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=b410467c'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=db3e3304'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=94b3fa83'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=704d27da'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=0534d7d3'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=66281288'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=3ab3fd3b'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=7ac2bef0'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=5e448ffe'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=63d9cab0'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=a28eb0b7'; FEATURES.push(collectionTrophiesFeature);
import { recipeMemoryFeature } from './recipe-memory-feature.js?v=f3bba1ef'; FEATURES.push(recipeMemoryFeature);
import { compoundDiscoveryFeature } from './compound-discovery-feature.js?v=4ecf0750'; FEATURES.push(compoundDiscoveryFeature);
import { sharedGardensFeature } from './shared-gardens-feature.js?v=fd202086'; FEATURES.push(sharedGardensFeature);
import { sharedPatchesFeature } from './shared-patches-feature.js?v=25c8fb06'; FEATURES.push(sharedPatchesFeature);
import { cubimalBattleFeature } from './cubimal-battle-feature.js?v=57ce328b'; FEATURES.push(cubimalBattleFeature);
import { chatPurgeFeature } from './chat-purge-feature.js?v=cb6c250d'; FEATURES.push(chatPurgeFeature);
import { streetFixesFeature } from './street-fixes-feature.js?v=06e9f5a2'; FEATURES.push(streetFixesFeature);
import { skillBubblesFeature } from './skill-bubbles-feature.js?v=2d79e524'; FEATURES.push(skillBubblesFeature);
// G947 (M3): crews on a home street (help mine, help dig); answers help-mine-feature's queries there.
import { homeCrewMpFeature } from './home-crew-mp-feature.js?v=5cb345ea'; FEATURES.push(homeCrewMpFeature);
// TODAYCARD: the start card's Today panel and nudge for a returning player (asks solo-feats for startCardFeat).
import { startTodayFeature } from './start-today-feature.js?v=07488661'; FEATURES.push(startTodayFeature);
import { chickenScareFeature } from './chicken-scare-feature.js?v=b016caaa'; FEATURES.push(chickenScareFeature);
import { gameTeleporterFeature } from './game-teleporter-feature.js?v=3f4bb706'; FEATURES.push(gameTeleporterFeature);
import { levelUpMpFeature } from './level-up-mp-feature.js?v=22659e6d'; FEATURES.push(levelUpMpFeature);
// G982 Pot Luck Day, part A: the chicken costumes (after seasons-feature, whose seasonOn it asks).
import { potLuckFeature } from './pot-luck-feature.js?v=24662363'; FEATURES.push(potLuckFeature);
import { potLuckFeastFeature } from './pot-luck-feast-feature.js?v=0d750f6b'; FEATURES.push(potLuckFeastFeature);
// G1009 Thanksgiving Day's feast: eat-in-place piles of the week's table food (asks pot-luck-feast for its counts).
import { feastDayFeature } from './feast-day-feature.js?v=90fa4f09'; FEATURES.push(feastDayFeature);
import { calendarFeature } from './calendar-feature.js?v=911e7478'; FEATURES.push(calendarFeature);
// G1195 Happy New Ur: the countdown at the Groddle midnights of December 31, the show and the party street.
import { newUrFeature } from './new-ur-feature.js?v=ec3e79d8'; FEATURES.push(newUrFeature);
import { newUrPartyFeature } from './new-ur-party-feature.js?v=2b129547'; FEATURES.push(newUrPartyFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=330e1bec'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=187e3567'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=67cb16d8'; FEATURES.push(accountBackupFeature);
