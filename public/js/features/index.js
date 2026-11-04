/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=4c54964f';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=c7ebd2cb';
import { questOffersFeature } from './quest-offers-feature.js?v=dc90952d';
import { meditationFeature } from './meditation-feature.js?v=feba0fd1';
import { teleportationFeature } from './teleportation-feature.js?v=45342b7d';
import { racesFeature } from './races-feature.js?v=8ab676cd';
import { mayhemFeature } from './mayhem-feature.js?v=37998880';
import { crownsFeature } from './crowns-feature.js?v=b178d652';
import { patchesFeature } from './patches-feature.js?v=fda9d58d';
import { foxesFeature } from './foxes-feature.js?v=e0cb9027';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=e66f1ad2';
import { homesFeature } from './homes-feature.js?v=4f102e41';
import { rookAttackFeature } from './rook-attack-feature.js?v=1f9292b9';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=6002cabd';
import { doorsFeature } from './doors-feature.js?v=5c5d34ee';
import { locationEventsFeature } from './location-events-feature.js?v=baea1395';
import { puzzlesFeature } from './puzzles-feature.js?v=22bf75b9';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=087c4f1a';
import { streetJobsFeature } from './street-jobs-feature.js?v=e95032da';
import { imaginationFeature } from './imagination-feature.js?v=47bb9dc9';
import { supplyFeature } from './supply-feature.js?v=a852ced4';
import { giantIconsFeature } from './giant-icons-feature.js?v=c3ebf7ef';
import { rubeFeature } from './rube-feature.js?v=326fcf6c';
import { unlearningFeature } from './unlearning-feature.js?v=9e1acb91';
import { dropsFeature } from './drops-feature.js?v=fffa1f9e';
import { masterGardenFeature } from './master-garden-feature.js?v=e793a0c8';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=8071b5a5';
import { questInstancesFeature } from './quest-instances-feature.js?v=fce55071';
import { partySpacesFeature } from './party-spaces-feature.js?v=86c7739a';
import { seasonsFeature } from './seasons-feature.js?v=88fa7012';
import { cameraModeFeature } from './camera-mode-feature.js?v=ad1ae5ea';
import { newxpFeature } from './newxp-feature.js?v=d4378267';
import { streetMinimapFeature } from './street-minimap-feature.js?v=92e83f75';

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
import { smugglingFeature } from './smuggling-feature.js?v=1de15c5f'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=1ee17067'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=80ee758d'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=0885e42f'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=40ae25c4'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=7b886c5d'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=e1c31bc6'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=fbf714a8'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=d9885ad2'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=3f78ec90'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=1962337a'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=ef1056a7'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=a0c103d5'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=9d27cd2f'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=43574016'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=a11a4609'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=30607c74'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=cac85806'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=c57f6c0d'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=94213b86'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=59145efa'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=ebf834c6'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=8baf41e0'; FEATURES.push(rebuiltRoomsFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=5f0bb75e'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=a9e9b768'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=b162a143'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=2312dfb9'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=0a512e1d'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=4eb882c5'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=15e8a203'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=0f8934f3'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=f217044d'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=b0163ebc'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=d1896e57'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=27edba53'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=d6934711'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=490c23d8'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=b8e0598f'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=fc79f311'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=5ba19d5e'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=d47e53bb'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=0d3c5ee5'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=f8fc4bfe'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=da428f34'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=23044e57'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=2c4acc19'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=6474a206'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=1e1bafec'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=a064489e'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=b8abad4c'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=b043ef2b'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=1818626b'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=a80a9758'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=95cf4a98'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=c015540d'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=45bef442'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=0c3fa98a'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=b761090f'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=66d50ed1'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=01fc8d91'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=84d8b633'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=78e7cdcc'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=5426d4d7'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=4e697338'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=a95c22fa'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=bdffc490'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=3eda46d4'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=61e93839'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=12bab068'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=65e6e10e'; FEATURES.push(dropsMpFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=9f33c699'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=2a531cf9'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=5f285969'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=1fad048e'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=40ab1323'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=5a901dfc'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=d87155d2'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=d4dc9c94'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=98621471'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=52517603'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=00bf9a74'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=38cfe4e8'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=eef3178d'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=5f3b8f59'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=8bb50d68'; FEATURES.push(playerImFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=62a313dc'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=9ddd4a70'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=a4b21c5e'; FEATURES.push(accountBackupFeature);
