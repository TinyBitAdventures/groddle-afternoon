/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=1f4a67d5';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=c1f27466';
import { questOffersFeature } from './quest-offers-feature.js?v=0956f753';
import { meditationFeature } from './meditation-feature.js?v=24a154f1';
import { teleportationFeature } from './teleportation-feature.js?v=b46fa776';
import { racesFeature } from './races-feature.js?v=eadf55c0';
import { mayhemFeature } from './mayhem-feature.js?v=eb2a46e3';
import { crownsFeature } from './crowns-feature.js?v=3afa035f';
import { patchesFeature } from './patches-feature.js?v=72ac643c';
import { foxesFeature } from './foxes-feature.js?v=80c3b966';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=feaa4705';
import { homesFeature } from './homes-feature.js?v=5d16178b';
import { rookAttackFeature } from './rook-attack-feature.js?v=85b77d22';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=632b4259';
import { doorsFeature } from './doors-feature.js?v=73e0844b';
import { locationEventsFeature } from './location-events-feature.js?v=df2533e4';
import { puzzlesFeature } from './puzzles-feature.js?v=85b9269e';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=653f39c7';
import { streetJobsFeature } from './street-jobs-feature.js?v=ca06066e';
import { imaginationFeature } from './imagination-feature.js?v=5c719310';
import { supplyFeature } from './supply-feature.js?v=d52bef9d';
import { giantIconsFeature } from './giant-icons-feature.js?v=46f7a384';
import { rubeFeature } from './rube-feature.js?v=8e9a1426';
import { unlearningFeature } from './unlearning-feature.js?v=9e1acb91';
import { dropsFeature } from './drops-feature.js?v=e0102ed4';
import { masterGardenFeature } from './master-garden-feature.js?v=774844ba';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=d3446ee5';
import { questInstancesFeature } from './quest-instances-feature.js?v=f5101397';
import { partySpacesFeature } from './party-spaces-feature.js?v=8d1a043a';
import { seasonsFeature } from './seasons-feature.js?v=c5e97ac7';
import { cameraModeFeature } from './camera-mode-feature.js?v=ad1ae5ea';
import { newxpFeature } from './newxp-feature.js?v=64a4a29b';
import { streetMinimapFeature } from './street-minimap-feature.js?v=380c53d5';

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
import { smugglingFeature } from './smuggling-feature.js?v=e443d111'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=f925db96'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=f559de91'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=d4e958e4'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=1788a6f4'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=83e94397'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=e6a0b420'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=269432db'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=8d96031a'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=4aa4be1d'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=a31497c8'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=ea43f7ad'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=46480201'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=e5e8fea1'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=cc35ee2d'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=42f1bc42'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=c75cbbff'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=a3d5c174'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=04b68748'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=5431bf32'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=9fca63b1'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=066bdc6c'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=b5232fd6'; FEATURES.push(rebuiltRoomsFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=423ef4d6'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=274d284f'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=e4dd24e5'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=8f771fb9'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=0a7d89d1'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=d922491a'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=4a189ce0'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=08ebe41b'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=b6ec11a0'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=cedb7c15'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=66abdfdf'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=1d4e0830'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=7a9ee1f9'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=b10bc484'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=060bf9f7'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=c22867c1'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=ddf2cfdb'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=fb09fd65'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=b2cfd1a4'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=cf95024a'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=4a6cc55e'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=be3bdc63'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=32ecd142'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=36f43135'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=e75c7a07'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=a064489e'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=673661ca'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=b043ef2b'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=1b4e595d'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=315bfba6'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=1bdc4639'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=24b6ad77'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=942b08e3'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=0c3fa98a'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=c410b78d'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=488ca796'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=14be65fd'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=e76c05ea'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=be609558'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=7ae5aec5'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=6059be0e'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=e7b86070'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=06118661'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=0c45c5b2'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=e5a26e1b'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=bd99708a'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=054ccb2c'; FEATURES.push(dropsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=ba4dbfd0'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=4ed879bf'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=e2980571'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=2937eef1'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=b7e2dd17'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=a12b5767'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=89c16a35'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=6e4b1cac'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=0ae7c7ff'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=0ffd904f'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=38cfe4e8'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=b0813bcf'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=7ee052da'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=5d2e4748'; FEATURES.push(playerImFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=055e3502'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=4aedb68b'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=80ff3f6b'; FEATURES.push(accountBackupFeature);
