/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=bdaefff5';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=36c1e9ed';
import { questOffersFeature } from './quest-offers-feature.js?v=243877f6';
import { meditationFeature } from './meditation-feature.js?v=b1d02c1c';
import { teleportationFeature } from './teleportation-feature.js?v=a79a7cea';
import { racesFeature } from './races-feature.js?v=b849c346';
import { crownsFeature } from './crowns-feature.js?v=d75259a0';
import { patchesFeature } from './patches-feature.js?v=22fe1430';
import { foxesFeature } from './foxes-feature.js?v=fd9de6b9';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=15b5ea70';
import { homesFeature } from './homes-feature.js?v=aa16dd07';
import { rookAttackFeature } from './rook-attack-feature.js?v=1931ea89';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=e49f9d56';
import { doorsFeature } from './doors-feature.js?v=91a56c1b';
import { locationEventsFeature } from './location-events-feature.js?v=518e223a';
import { puzzlesFeature } from './puzzles-feature.js?v=82f606a3';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=151e175c';
import { streetJobsFeature } from './street-jobs-feature.js?v=fb0922a3';
import { imaginationFeature } from './imagination-feature.js?v=15c32e0c';
import { supplyFeature } from './supply-feature.js?v=890ec8c4';
import { giantIconsFeature } from './giant-icons-feature.js?v=7ba7b767';
import { rubeFeature } from './rube-feature.js?v=5b27168e';
import { unlearningFeature } from './unlearning-feature.js?v=b7fefa14';
import { dropsFeature } from './drops-feature.js?v=92989dc5';
import { masterGardenFeature } from './master-garden-feature.js?v=a17da2bd';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=18052725';
import { questInstancesFeature } from './quest-instances-feature.js?v=1e40a872';
import { partySpacesFeature } from './party-spaces-feature.js?v=3392a54d';
import { seasonsFeature } from './seasons-feature.js?v=d1b43e33';
import { cameraModeFeature } from './camera-mode-feature.js?v=0106af1c';
import { newxpFeature } from './newxp-feature.js?v=7192302a';

export { questFlagsFeature };

export const FEATURES = [
  questFlagsFeature,
  hellFeature,
  resourceNodesFeature,
  questOffersFeature,
  meditationFeature,
  teleportationFeature,
  racesFeature,
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
];
import { smugglingFeature } from './smuggling-feature.js?v=4c0bce9a'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=b4e3d104'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=b5d31c61'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=cce74646'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=45f7d542'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=b6ae268a'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=d9f7ec0b'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=e5c20791'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=f7e9d8f3'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=10e48eb8'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=6382472d'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=ebf9e2c0'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=a8fa70d3'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=17d0f55f'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=f748b2c1'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=76163d94'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=65fc537f'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=ea6fde30'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=890eec1d'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=c045078a'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=91d8eb1c'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=fff3374b'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=b830235a'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=47822aae'; FEATURES.push(rebuiltRoomsFeature);
import { subwayFeature } from './subway-feature.js?v=8f2f0f0c'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=875592ac'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=5ad7b786'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=72b52010'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=39c17a5f'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=14a6f6d0'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=b341caa7'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=415d449e'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=aaaacc70'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=0f868679'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=f4ad50ef'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=0ba8b873'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=ddb62082'; FEATURES.push(crabsFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=dfedf29e'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=225181c1'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=3a89f5a3'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=f7d8fa74'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=b3d005d6'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=3c14e1f7'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=9456ad7f'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=46798815'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=b2524e66'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=f9bc8dbc'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=87f305f3'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=738c3d6a'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=cf3cf4c6'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=2fc8b1b5'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=d6395408'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=190c6d4e'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=7c571cf4'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=769c31a9'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=f1f1cd14'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=e1102af3'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=5f0fc746'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=5c347d75'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=71f50834'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=6ff1d292'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=12d6cbe4'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=15b36541'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=801a3fec'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=a9af7336'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=99383520'; FEATURES.push(auctionsFeature);
import { followMpFeature } from './follow-mp-feature.js?v=e5a26e1b'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=087704cd'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=be5487b4'; FEATURES.push(dropsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=5b069040'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=a6ed4cf0'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=5e591bc6'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=a0fb76e4'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=ea49c71d'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=c54eb042'; FEATURES.push(yardVerbsMpFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=b6b7c200'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=ff118367'; FEATURES.push(itemVerbsMoreFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=50e7a7d7'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=515337d4'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=a5712ed5'; FEATURES.push(accountBackupFeature);
