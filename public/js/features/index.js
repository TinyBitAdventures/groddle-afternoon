/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=480cdd11';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=17a1f5c0';
import { questOffersFeature } from './quest-offers-feature.js?v=7c77bd57';
import { meditationFeature } from './meditation-feature.js?v=fbd7665b';
import { teleportationFeature } from './teleportation-feature.js?v=48f780ad';
import { racesFeature } from './races-feature.js?v=371def00';
import { mayhemFeature } from './mayhem-feature.js?v=3e1f4ed9';
import { crownsFeature } from './crowns-feature.js?v=28e9c767';
import { patchesFeature } from './patches-feature.js?v=0d114881';
import { foxesFeature } from './foxes-feature.js?v=506e124c';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=f2a21ad9';
import { homesFeature } from './homes-feature.js?v=1ab67b46';
import { rookAttackFeature } from './rook-attack-feature.js?v=6b7118c4';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=9ecb3094';
import { doorsFeature } from './doors-feature.js?v=bbc75ee2';
import { locationEventsFeature } from './location-events-feature.js?v=0cda70ed';
import { puzzlesFeature } from './puzzles-feature.js?v=d47b5d92';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=1d9fab6e';
import { streetJobsFeature } from './street-jobs-feature.js?v=c4f6c040';
import { imaginationFeature } from './imagination-feature.js?v=8e3fcf1c';
import { supplyFeature } from './supply-feature.js?v=79a59bf4';
import { giantIconsFeature } from './giant-icons-feature.js?v=52b8b1fb';
import { rubeFeature } from './rube-feature.js?v=ac2f3c9d';
import { unlearningFeature } from './unlearning-feature.js?v=b08de565';
import { dropsFeature } from './drops-feature.js?v=eb1d8eb4';
import { masterGardenFeature } from './master-garden-feature.js?v=c4e7db6d';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=e02e903b';
import { questInstancesFeature } from './quest-instances-feature.js?v=c2d4b97a';
import { partySpacesFeature } from './party-spaces-feature.js?v=3a984373';
import { seasonsFeature } from './seasons-feature.js?v=60c4e3a2';
import { cameraModeFeature } from './camera-mode-feature.js?v=6c0a4b7a';
import { newxpFeature } from './newxp-feature.js?v=ae3dc877';
import { streetMinimapFeature } from './street-minimap-feature.js?v=d5a16dd2';

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
import { smugglingFeature } from './smuggling-feature.js?v=0d439649'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=4ec55e06'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=bb8fcb0f'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=d97e86b3'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=e3688c74'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=50750cf0'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=9d8f8e74'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=f22d217e'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=8fce2616'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=af0ed5d2'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=90d8b0bc'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=cd845de9'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=20b4a406'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=a0631653'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=cb80e56b'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=703032b0'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=9ea775b6'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=21064088'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=13bff828'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=b82c6d28'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=683f809e'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=50bb14d6'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=426e7b2a'; FEATURES.push(rebuiltRoomsFeature);
import { interrogationRoomFeature } from './interrogation-room-feature.js?v=705548d0'; FEATURES.push(interrogationRoomFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=1ea27ece'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=9f901d06'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=1f096f37'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=0a5f0f27'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=cb707833'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=715e5320'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=be161654'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=782b135a'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=7dcc5b1b'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=d919e340'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=2c526927'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=cf1dbc8c'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=c2e89b9a'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=1ea8de12'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=85db56b5'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=4c3db7ff'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=ea27d332'; FEATURES.push(gardenGuanoFeature);
import { worldDropFeature } from './world-drop-feature.js?v=bbd401a1'; FEATURES.push(worldDropFeature);
import { gardenNoticesFeature } from './garden-notices-feature.js?v=d300ba34'; FEATURES.push(gardenNoticesFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=32531b64'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=b4196844'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=ee258bd1'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=8fdf7e0b'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=9fb780d4'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=025ecd12'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=beb13d86'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=3bee6cfe'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=95e4b707'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=6cf9f74f'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=1ab5ccb0'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=ab9681a0'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=e4c02c0a'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=8c3cc5a1'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=20089b86'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=b3c9716c'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=ae589bdd'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=8a7aef48'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=2fd558d8'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=14880c53'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=bb657c20'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=5dd385ba'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=f06c2492'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=30f1ffbb'; FEATURES.push(questsMpFeature);
import { peatQuestMpFeature } from './peat-quest-mp-feature.js?v=47baf5e7'; FEATURES.push(peatQuestMpFeature);
import { groupsFeature } from './groups-feature.js?v=06e451e2'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=93fc4acb'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=946fcdc4'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=06aee040'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=012de487'; FEATURES.push(followMpFeature);
import { summonMpFeature } from './summon-mp-feature.js?v=6389f111'; FEATURES.push(summonMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=d5bd1087'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=80f3a1cd'; FEATURES.push(dropsMpFeature);
import { doorKeysFeature } from './door-keys-feature.js?v=195444bc'; FEATURES.push(doorKeysFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=63744c6a'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=991c33c7'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=954d779f'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=097d9407'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=652f03aa'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=6798e140'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=14f41ef0'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=e7fe4b1e'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=1fe325ee'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=c2b5a04e'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=624256eb'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=cd004e0e'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=dd196e17'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=2ba32d77'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=1617ed3f'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=c672a934'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=704d27da'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=7aa3ad1c'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=8389fe76'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=a9719601'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=90998d45'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=40225240'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=6dbc852b'; FEATURES.push(collectionTrophiesFeature);
import { recipeMemoryFeature } from './recipe-memory-feature.js?v=de8ab273'; FEATURES.push(recipeMemoryFeature);
import { sharedGardensFeature } from './shared-gardens-feature.js?v=cf189816'; FEATURES.push(sharedGardensFeature);
import { sharedPatchesFeature } from './shared-patches-feature.js?v=20cb848e'; FEATURES.push(sharedPatchesFeature);
import { cubimalBattleFeature } from './cubimal-battle-feature.js?v=562c2ef4'; FEATURES.push(cubimalBattleFeature);
import { chatPurgeFeature } from './chat-purge-feature.js?v=cb6c250d'; FEATURES.push(chatPurgeFeature);
import { streetFixesFeature } from './street-fixes-feature.js?v=39e41b46'; FEATURES.push(streetFixesFeature);
import { chickenScareFeature } from './chicken-scare-feature.js?v=89d3da2d'; FEATURES.push(chickenScareFeature);
import { gameTeleporterFeature } from './game-teleporter-feature.js?v=4036410a'; FEATURES.push(gameTeleporterFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=0e4ca103'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=93fe0fe9'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=464d6c34'; FEATURES.push(accountBackupFeature);
