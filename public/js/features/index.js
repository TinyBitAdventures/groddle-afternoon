/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=5aadb484';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=3882cabb';
import { questOffersFeature } from './quest-offers-feature.js?v=539f62b3';
import { meditationFeature } from './meditation-feature.js?v=1a6a842f';
import { teleportationFeature } from './teleportation-feature.js?v=a89fa5d1';
import { racesFeature } from './races-feature.js?v=d4e5f029';
import { mayhemFeature } from './mayhem-feature.js?v=a19df82d';
import { crownsFeature } from './crowns-feature.js?v=cb69905f';
import { patchesFeature } from './patches-feature.js?v=702bd776';
import { foxesFeature } from './foxes-feature.js?v=941ad469';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=2d15f59b';
import { homesFeature } from './homes-feature.js?v=05d8f43e';
import { rookAttackFeature } from './rook-attack-feature.js?v=10817303';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=3f25ece8';
import { doorsFeature } from './doors-feature.js?v=92eb04f3';
import { locationEventsFeature } from './location-events-feature.js?v=0cda70ed';
import { puzzlesFeature } from './puzzles-feature.js?v=d47b5d92';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=1d9fab6e';
import { streetJobsFeature } from './street-jobs-feature.js?v=07aae9da';
import { imaginationFeature } from './imagination-feature.js?v=74fcb251';
import { supplyFeature } from './supply-feature.js?v=79a59bf4';
import { giantIconsFeature } from './giant-icons-feature.js?v=b6566ca4';
import { rubeFeature } from './rube-feature.js?v=e2fb6599';
import { unlearningFeature } from './unlearning-feature.js?v=da4e2b67';
import { dropsFeature } from './drops-feature.js?v=2cd8ff9b';
import { masterGardenFeature } from './master-garden-feature.js?v=57c6c634';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=02c32469';
import { questInstancesFeature } from './quest-instances-feature.js?v=5a4dc767';
import { partySpacesFeature } from './party-spaces-feature.js?v=146d960b';
import { seasonsFeature } from './seasons-feature.js?v=8a3449e1';
import { cameraModeFeature } from './camera-mode-feature.js?v=6c0a4b7a';
import { newxpFeature } from './newxp-feature.js?v=9a7fe18a';
import { streetMinimapFeature } from './street-minimap-feature.js?v=192606ca';

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
import { smugglingFeature } from './smuggling-feature.js?v=524b4f5a'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=11f8941a'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=961cdadc'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=4bfaac0a'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=4cc4a5a9'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=5164b470'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=2076fd33'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=688ddb47'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=e98eef5e'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=1f4b127e'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=189fc7f1'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=89c48e66'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=6206c0a6'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=109ec459'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=0e5b7145'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=7533332e'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=9ea775b6'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=ed80e994'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=f8f35b83'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=b82c6d28'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=683f809e'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=2c704328'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=426e7b2a'; FEATURES.push(rebuiltRoomsFeature);
import { interrogationRoomFeature } from './interrogation-room-feature.js?v=705548d0'; FEATURES.push(interrogationRoomFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=ceffc55d'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=c8b59130'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=bfb05f8e'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=c4685fe5'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=cb707833'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=715e5320'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=86c48c10'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=738cdc37'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=f0249a38'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=e502cd47'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=b2791cb8'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=5edc7e86'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=01f3bc44'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=5b081eef'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=7fda4b3e'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=4c3db7ff'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=dc2b356e'; FEATURES.push(gardenGuanoFeature);
import { worldDropFeature } from './world-drop-feature.js?v=b43ff4e3'; FEATURES.push(worldDropFeature);
import { gardenNoticesFeature } from './garden-notices-feature.js?v=723b67f3'; FEATURES.push(gardenNoticesFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=188d518a'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=1979f378'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=a4da213c'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=8fdf7e0b'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=d33ab9ef'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=80d164db'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=beb13d86'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=3bee6cfe'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=d7a546bd'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=6cf9f74f'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=9b08a708'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=017fb596'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=72016786'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=8c3cc5a1'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=fbb67753'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=0127d5d1'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=ae589bdd'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=8a7aef48'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=d076c11e'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=150a39db'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=bb657c20'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=3cd7d4fc'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=1465ba8a'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=11a87516'; FEATURES.push(questsMpFeature);
import { peatQuestMpFeature } from './peat-quest-mp-feature.js?v=517bb0ca'; FEATURES.push(peatQuestMpFeature);
import { groupsFeature } from './groups-feature.js?v=a7154b8c'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=55e7fc93'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=b2c8613a'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=c8e56d75'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=012de487'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=d5bd1087'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=361c149d'; FEATURES.push(dropsMpFeature);
import { doorKeysFeature } from './door-keys-feature.js?v=195444bc'; FEATURES.push(doorKeysFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=9e84ca5d'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=0ef95c18'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=8979ec32'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=097d9407'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=4a8e2e46'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=6798e140'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=c1ab3b83'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=258adf8c'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=5079a986'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=c2b5a04e'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=37168607'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=814bf62d'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=dd196e17'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=ea8cf432'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=8b8defff'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=c672a934'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=704d27da'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=7aa3ad1c'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=8389fe76'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=6e02d7a7'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=ddd99cdc'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=1f0592c6'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=6dbc852b'; FEATURES.push(collectionTrophiesFeature);
import { recipeMemoryFeature } from './recipe-memory-feature.js?v=b25dfe49'; FEATURES.push(recipeMemoryFeature);
import { sharedGardensFeature } from './shared-gardens-feature.js?v=bab455c1'; FEATURES.push(sharedGardensFeature);
import { sharedPatchesFeature } from './shared-patches-feature.js?v=a725acdc'; FEATURES.push(sharedPatchesFeature);
import { cubimalBattleFeature } from './cubimal-battle-feature.js?v=562c2ef4'; FEATURES.push(cubimalBattleFeature);
import { chatPurgeFeature } from './chat-purge-feature.js?v=cb6c250d'; FEATURES.push(chatPurgeFeature);
import { streetFixesFeature } from './street-fixes-feature.js?v=39e41b46'; FEATURES.push(streetFixesFeature);
import { chickenScareFeature } from './chicken-scare-feature.js?v=0e7a2522'; FEATURES.push(chickenScareFeature);
import { gameTeleporterFeature } from './game-teleporter-feature.js?v=97422ea2'; FEATURES.push(gameTeleporterFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=a5863535'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=c864854a'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=246b4b86'; FEATURES.push(accountBackupFeature);
