/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=ba4199c6';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=8b010b2e';
import { questOffersFeature } from './quest-offers-feature.js?v=db81cdfe';
import { meditationFeature } from './meditation-feature.js?v=5114e225';
import { teleportationFeature } from './teleportation-feature.js?v=e867c103';
import { racesFeature } from './races-feature.js?v=53416f5f';
import { mayhemFeature } from './mayhem-feature.js?v=3ecdedc4';
import { crownsFeature } from './crowns-feature.js?v=a29fd3bf';
import { patchesFeature } from './patches-feature.js?v=85691d7e';
import { foxesFeature } from './foxes-feature.js?v=9d5a9514';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=b75022d7';
import { homesFeature } from './homes-feature.js?v=3a0f2cd8';
import { rookAttackFeature } from './rook-attack-feature.js?v=89c24ee9';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=87214e9e';
import { doorsFeature } from './doors-feature.js?v=14e8a8ea';
import { locationEventsFeature } from './location-events-feature.js?v=d86a5941';
import { puzzlesFeature } from './puzzles-feature.js?v=d360b57f';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=46570fdd';
import { streetJobsFeature } from './street-jobs-feature.js?v=8db7536b';
import { imaginationFeature } from './imagination-feature.js?v=19c3a230';
import { supplyFeature } from './supply-feature.js?v=65175221';
import { giantIconsFeature } from './giant-icons-feature.js?v=1bb98754';
import { rubeFeature } from './rube-feature.js?v=2636c9e3';
import { unlearningFeature } from './unlearning-feature.js?v=122a06ac';
import { dropsFeature } from './drops-feature.js?v=4152401d';
import { masterGardenFeature } from './master-garden-feature.js?v=f08f73cc';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=e9f476c8';
import { questInstancesFeature } from './quest-instances-feature.js?v=bc3f2516';
import { partySpacesFeature } from './party-spaces-feature.js?v=dd85528b';
import { seasonsFeature } from './seasons-feature.js?v=719f09e3';
import { cameraModeFeature } from './camera-mode-feature.js?v=33da0f2a';
import { newxpFeature } from './newxp-feature.js?v=0fb45e01';
import { streetMinimapFeature } from './street-minimap-feature.js?v=579f6c4f';

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
import { smugglingFeature } from './smuggling-feature.js?v=36209740'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=f574b637'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=23b49fc3'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=15238ed5'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=ff4322bf'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=22a9d42e'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=5603dda6'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=6e6490fe'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=eaaceee5'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=d45fef8c'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=7dac520a'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=66e73701'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=b1ca01bf'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=f7d576dd'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=6a985a35'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=0260d7b9'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=bd95f07e'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=1dae6316'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=bc075168'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=f97d92aa'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=4faefda8'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=ce4f75f0'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=514604e6'; FEATURES.push(rebuiltRoomsFeature);
import { interrogationRoomFeature } from './interrogation-room-feature.js?v=abce8d45'; FEATURES.push(interrogationRoomFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=8d036336'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=8911e9c0'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=9bf0f1b5'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=6593b51f'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=7f1bb055'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=a0746048'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=15438b92'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=6e04ce8d'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=98eec6f6'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=7c9eabdb'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=9372e949'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=b407a3d9'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=49e9406e'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=7ce496e8'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=42b5983c'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=8485041c'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=5596a952'; FEATURES.push(gardenGuanoFeature);
import { worldDropFeature } from './world-drop-feature.js?v=7ce58ec6'; FEATURES.push(worldDropFeature);
import { gardenNoticesFeature } from './garden-notices-feature.js?v=c797cde9'; FEATURES.push(gardenNoticesFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=a2cfb6c2'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=2352be70'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=6d95fbe2'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=af1f6393'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=4242ee84'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=0afc3644'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=aa61108f'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=6b21a053'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=cb0b118e'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=f9bffa8e'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=772752b5'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=017fb596'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=64885596'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=17df0b58'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=415499c4'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=223ff021'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=ae589bdd'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=e2fea25c'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=58347655'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=ceda1626'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=cea4455f'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=1bf77587'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=7f7e7d6c'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=97657d4c'; FEATURES.push(questsMpFeature);
import { peatQuestMpFeature } from './peat-quest-mp-feature.js?v=914da126'; FEATURES.push(peatQuestMpFeature);
import { groupsFeature } from './groups-feature.js?v=879a63f2'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=1d3cd4c3'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=72f25053'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=c9285772'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=3c21814e'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=3bb3202a'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=dfa23fc7'; FEATURES.push(dropsMpFeature);
import { doorKeysFeature } from './door-keys-feature.js?v=c17deb02'; FEATURES.push(doorKeysFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=a9c89402'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=249f473f'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=96bbe5c2'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=ccc9350b'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=f019e8ac'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=8e1698f1'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=436afb7e'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=9312f3bd'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=7908a52e'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=6dff3574'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=e238bf08'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=8c6a095d'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=6fc872ed'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=90dd57f6'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=39f34d6d'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=704d27da'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=364b4ec1'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=7ad7355e'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=9e21ad24'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=d7f5a759'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=57ac83d0'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=a54215da'; FEATURES.push(collectionTrophiesFeature);
import { recipeMemoryFeature } from './recipe-memory-feature.js?v=7bd61f92'; FEATURES.push(recipeMemoryFeature);
import { sharedGardensFeature } from './shared-gardens-feature.js?v=70f93f53'; FEATURES.push(sharedGardensFeature);
import { sharedPatchesFeature } from './shared-patches-feature.js?v=27ec3637'; FEATURES.push(sharedPatchesFeature);
import { cubimalBattleFeature } from './cubimal-battle-feature.js?v=aa8bf0de'; FEATURES.push(cubimalBattleFeature);
import { chatPurgeFeature } from './chat-purge-feature.js?v=cb6c250d'; FEATURES.push(chatPurgeFeature);
import { streetFixesFeature } from './street-fixes-feature.js?v=39e41b46'; FEATURES.push(streetFixesFeature);
import { chickenScareFeature } from './chicken-scare-feature.js?v=6e892fd9'; FEATURES.push(chickenScareFeature);
import { gameTeleporterFeature } from './game-teleporter-feature.js?v=ebe1cf75'; FEATURES.push(gameTeleporterFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=62ac2dd9'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=85bd3b0a'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=3efe5c17'; FEATURES.push(accountBackupFeature);
