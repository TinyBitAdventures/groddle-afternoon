/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=c528dffe';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=451781d3';
import { questOffersFeature } from './quest-offers-feature.js?v=07ab9ba0';
import { meditationFeature } from './meditation-feature.js?v=58fe00b1';
import { teleportationFeature } from './teleportation-feature.js?v=179d8bb9';
import { racesFeature } from './races-feature.js?v=5d5235b6';
import { mayhemFeature } from './mayhem-feature.js?v=3e1f4ed9';
import { crownsFeature } from './crowns-feature.js?v=06c72f6f';
import { patchesFeature } from './patches-feature.js?v=48accf5e';
import { foxesFeature } from './foxes-feature.js?v=c764080f';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=462bba41';
import { homesFeature } from './homes-feature.js?v=38327b85';
import { rookAttackFeature } from './rook-attack-feature.js?v=e6e49a9b';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=38f91339';
import { doorsFeature } from './doors-feature.js?v=9e2cf139';
import { locationEventsFeature } from './location-events-feature.js?v=0cda70ed';
import { puzzlesFeature } from './puzzles-feature.js?v=d47b5d92';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=1f23b91a';
import { streetJobsFeature } from './street-jobs-feature.js?v=9d48b7f4';
import { imaginationFeature } from './imagination-feature.js?v=8a21750c';
import { supplyFeature } from './supply-feature.js?v=2a7f0ae8';
import { giantIconsFeature } from './giant-icons-feature.js?v=e5595f32';
import { rubeFeature } from './rube-feature.js?v=fe947d98';
import { unlearningFeature } from './unlearning-feature.js?v=b08de565';
import { dropsFeature } from './drops-feature.js?v=fc237a8b';
import { masterGardenFeature } from './master-garden-feature.js?v=5766650e';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=3272e893';
import { questInstancesFeature } from './quest-instances-feature.js?v=2406490b';
import { partySpacesFeature } from './party-spaces-feature.js?v=23943ec0';
import { seasonsFeature } from './seasons-feature.js?v=c5d74a94';
import { cameraModeFeature } from './camera-mode-feature.js?v=6c0a4b7a';
import { newxpFeature } from './newxp-feature.js?v=4300277b';
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
import { smugglingFeature } from './smuggling-feature.js?v=3f04df75'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=19eff7b0'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=8116ccb2'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=9c722be4'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=893fde71'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=8604301e'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=9d8f8e74'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=21e3384f'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=1d759aae'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=0b5006e1'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=ab3871a7'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=60255c7d'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=255fbdc0'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=fc941161'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=5faa2c9e'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=2c3348e6'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=faf7b587'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=3c025dab'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=90b6984a'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=7f15d5f1'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=683f809e'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=0e5157c8'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=426e7b2a'; FEATURES.push(rebuiltRoomsFeature);
import { interrogationRoomFeature } from './interrogation-room-feature.js?v=705548d0'; FEATURES.push(interrogationRoomFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=573a9f73'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=c72af5f3'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=11dbf52f'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=432262d6'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=cb707833'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=715e5320'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=614aed00'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=738cdc37'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=d0c29870'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=83e4742b'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=06ece6fe'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=e6ffb0fc'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=5cb683b0'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=e2e611a8'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=7fda4b3e'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=4c3db7ff'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=ea27d332'; FEATURES.push(gardenGuanoFeature);
import { worldDropFeature } from './world-drop-feature.js?v=0cb19562'; FEATURES.push(worldDropFeature);
import { gardenNoticesFeature } from './garden-notices-feature.js?v=776e5e5a'; FEATURES.push(gardenNoticesFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=188d518a'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=5eb13b5b'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=6c1f9189'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=8fdf7e0b'; FEATURES.push(packTreeVerbsFeature);
import { packToolVerbsFeature } from './pack-tool-verbs-feature.js?v=00000000'; FEATURES.push(packToolVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=f1fb4eb9'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=80d164db'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=beb13d86'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=3bee6cfe'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=d7a546bd'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=6cf9f74f'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=6e8563af'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=ab9681a0'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=e4c02c0a'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=28495665'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=20089b86'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=0077bda5'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=ae589bdd'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=8a7aef48'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=7a7a0dde'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=fb603dca'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=bb657c20'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=b47efec6'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=eee18f8e'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=386c212e'; FEATURES.push(questsMpFeature);
import { peatQuestMpFeature } from './peat-quest-mp-feature.js?v=bc5ddd1b'; FEATURES.push(peatQuestMpFeature);
import { groupsFeature } from './groups-feature.js?v=06e451e2'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=9d1db559'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=e70d17c2'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=eb9a9322'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=012de487'; FEATURES.push(followMpFeature);
import { summonMpFeature } from './summon-mp-feature.js?v=6389f111'; FEATURES.push(summonMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=d5bd1087'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=2fd8dcb9'; FEATURES.push(dropsMpFeature);
import { doorKeysFeature } from './door-keys-feature.js?v=f6f5876e'; FEATURES.push(doorKeysFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=6e6af8d7'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=991c33c7'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=1490c58a'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=906da358'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=1f7449b1'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=6798e140'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=4b6f1d1b'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=4eae1223'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=cdda0c18'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=a1b47519'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=9f33de7d'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=cd004e0e'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=dd196e17'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=2ba32d77'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=af7a67bb'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=c672a934'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=704d27da'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=7aa3ad1c'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=8389fe76'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=6b864738'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=89def5f0'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=42210a95'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=6e08009c'; FEATURES.push(collectionTrophiesFeature);
import { recipeMemoryFeature } from './recipe-memory-feature.js?v=d1bd232c'; FEATURES.push(recipeMemoryFeature);
import { sharedGardensFeature } from './shared-gardens-feature.js?v=9a4cb5bc'; FEATURES.push(sharedGardensFeature);
import { sharedPatchesFeature } from './shared-patches-feature.js?v=89e2bad5'; FEATURES.push(sharedPatchesFeature);
import { cubimalBattleFeature } from './cubimal-battle-feature.js?v=8aed5707'; FEATURES.push(cubimalBattleFeature);
import { chatPurgeFeature } from './chat-purge-feature.js?v=cb6c250d'; FEATURES.push(chatPurgeFeature);
import { streetFixesFeature } from './street-fixes-feature.js?v=39e41b46'; FEATURES.push(streetFixesFeature);
import { chickenScareFeature } from './chicken-scare-feature.js?v=7f78a45d'; FEATURES.push(chickenScareFeature);
import { gameTeleporterFeature } from './game-teleporter-feature.js?v=97422ea2'; FEATURES.push(gameTeleporterFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=e460a430'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=c864854a'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=246b4b86'; FEATURES.push(accountBackupFeature);
import { levelUpMpFeature } from './level-up-mp-feature.js?v=00000000'; FEATURES.push(levelUpMpFeature);
