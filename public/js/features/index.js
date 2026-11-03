/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=e9d00320';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=be183531';
import { questOffersFeature } from './quest-offers-feature.js?v=9d9418e8';
import { meditationFeature } from './meditation-feature.js?v=8edaae5b';
import { teleportationFeature } from './teleportation-feature.js?v=236fbddc';
import { racesFeature } from './races-feature.js?v=7a3e8f4b';
import { mayhemFeature } from './mayhem-feature.js?v=eb2a46e3';
import { crownsFeature } from './crowns-feature.js?v=f711131e';
import { patchesFeature } from './patches-feature.js?v=ed2f7ee8';
import { foxesFeature } from './foxes-feature.js?v=89a7a4f4';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=feaa4705';
import { homesFeature } from './homes-feature.js?v=d2f12e9e';
import { rookAttackFeature } from './rook-attack-feature.js?v=8d2fffe9';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=489c06ec';
import { doorsFeature } from './doors-feature.js?v=34eb8971';
import { locationEventsFeature } from './location-events-feature.js?v=df2533e4';
import { puzzlesFeature } from './puzzles-feature.js?v=85b9269e';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=609a1fda';
import { streetJobsFeature } from './street-jobs-feature.js?v=8d0fcccb';
import { imaginationFeature } from './imagination-feature.js?v=b40fdcac';
import { supplyFeature } from './supply-feature.js?v=e1e77112';
import { giantIconsFeature } from './giant-icons-feature.js?v=f7b8da7d';
import { rubeFeature } from './rube-feature.js?v=66147dad';
import { unlearningFeature } from './unlearning-feature.js?v=7128a4ef';
import { dropsFeature } from './drops-feature.js?v=5630feea';
import { masterGardenFeature } from './master-garden-feature.js?v=babc716c';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=37a4d876';
import { questInstancesFeature } from './quest-instances-feature.js?v=7f224634';
import { partySpacesFeature } from './party-spaces-feature.js?v=a29c403b';
import { seasonsFeature } from './seasons-feature.js?v=c55269f3';
import { cameraModeFeature } from './camera-mode-feature.js?v=ad1ae5ea';
import { newxpFeature } from './newxp-feature.js?v=4b95aa42';
import { streetMinimapFeature } from './street-minimap-feature.js?v=03127735';

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
import { smugglingFeature } from './smuggling-feature.js?v=d328e33e'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=18e56c4c'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=6e82e1ec'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=bf49d1a0'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=c57f59ba'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=2c8a8b05'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=e6a0b420'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=c3c6fe49'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=14ebcb97'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=f1e68493'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=f0c5a471'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=1c49a16b'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=dc6ebb6c'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=6c40296c'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=51e9b243'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=34ffd4a6'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=d1b9507d'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=77b48d86'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=dae55bc5'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=346c39b8'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=9fca63b1'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=5fa0028a'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=b5232fd6'; FEATURES.push(rebuiltRoomsFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=01f46848'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=686cd363'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=ce4612fb'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=9f4b1ffd'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=25457f57'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=729472e9'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=7a414c47'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=6ffae0d2'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=86b6aa55'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=431cb12c'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=97dde7d7'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=cbb26292'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=c612455b'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=b10bc484'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=6867399a'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=69339591'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=bdd7fd1e'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=6a9064d2'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=d916ff1a'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=7d4f5a42'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=9cede4a6'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=26ad0302'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=1a1f181c'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=c205fb63'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=913a3f0a'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=a064489e'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=65a9bf92'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=b043ef2b'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=8d289f96'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=82a087bf'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=1bdc4639'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=506ce662'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=dbe171b3'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=0c3fa98a'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=28787de8'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=41769b24'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=3d549d54'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=541c5384'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=3bef4650'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=75f275e9'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=246c9845'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=4999f2db'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=d77466a8'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=41d97c4d'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=e5a26e1b'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=bd99708a'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=57788c0c'; FEATURES.push(dropsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=c1b501c6'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=d0002bbd'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=f73a885c'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=d9c5ad67'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=b7e2dd17'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=bb1ae5ea'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=cff8c63e'; FEATURES.push(homeMachinesFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=91309fbd'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=85cbe8b7'; FEATURES.push(itemVerbsMoreFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=b0813bcf'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=ce8fd2f1'; FEATURES.push(butlerImFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=4bb6f9df'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=c6f08935'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=f07da586'; FEATURES.push(accountBackupFeature);
