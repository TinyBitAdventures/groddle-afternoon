/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=6825f033';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=395dd6a2';
import { questOffersFeature } from './quest-offers-feature.js?v=243877f6';
import { meditationFeature } from './meditation-feature.js?v=72f3a544';
import { teleportationFeature } from './teleportation-feature.js?v=a79a7cea';
import { racesFeature } from './races-feature.js?v=5466b0c9';
import { crownsFeature } from './crowns-feature.js?v=d628732d';
import { patchesFeature } from './patches-feature.js?v=735652f6';
import { foxesFeature } from './foxes-feature.js?v=f4057c66';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=44aae071';
import { homesFeature } from './homes-feature.js?v=8bff91b7';
import { rookAttackFeature } from './rook-attack-feature.js?v=cb36367b';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=6ddf202c';
import { doorsFeature } from './doors-feature.js?v=47c6382e';
import { locationEventsFeature } from './location-events-feature.js?v=58727a27';
import { puzzlesFeature } from './puzzles-feature.js?v=65441405';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=151e175c';
import { streetJobsFeature } from './street-jobs-feature.js?v=7ced7a49';
import { imaginationFeature } from './imagination-feature.js?v=23aaa85d';
import { supplyFeature } from './supply-feature.js?v=890ec8c4';
import { giantIconsFeature } from './giant-icons-feature.js?v=6ff5f2c5';
import { rubeFeature } from './rube-feature.js?v=6bb9259f';
import { unlearningFeature } from './unlearning-feature.js?v=b7fefa14';
import { dropsFeature } from './drops-feature.js?v=92989dc5';
import { masterGardenFeature } from './master-garden-feature.js?v=a17da2bd';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=59d92492';
import { questInstancesFeature } from './quest-instances-feature.js?v=4d634fed';
import { partySpacesFeature } from './party-spaces-feature.js?v=9375fb8d';
import { seasonsFeature } from './seasons-feature.js?v=2f0c53b7';
import { cameraModeFeature } from './camera-mode-feature.js?v=ad1ae5ea';
import { newxpFeature } from './newxp-feature.js?v=92133eb2';
import { streetMinimapFeature } from './street-minimap-feature.js?v=9ae206b1';

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
  streetMinimapFeature,
];
import { smugglingFeature } from './smuggling-feature.js?v=e404583f'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=b4e3d104'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=b5d31c61'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=cce74646'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=45f7d542'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=b6ae268a'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=e585470b'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=e49a55a3'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=b16337ce'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=0915e28e'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=242a6ed1'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=209426f3'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=805bee21'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=696d9c67'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=5f7667b7'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=76163d94'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=65fc537f'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=9bb1d3a2'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=890eec1d'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=8b496c3c'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=91d8eb1c'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=fff3374b'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=b830235a'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=47822aae'; FEATURES.push(rebuiltRoomsFeature);
import { subwayFeature } from './subway-feature.js?v=c9a11a93'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=366bc6f0'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=9c281316'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=c32178e5'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=39c17a5f'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=14a6f6d0'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=9c4305d2'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=415d449e'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=b7ba06fa'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=f85077e8'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=861dd26f'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=6a5932c0'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=b53bdac3'; FEATURES.push(crabsFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=6db603fc'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=28cc267b'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=3a89f5a3'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=224a457c'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=2a3bd592'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=3c14e1f7'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=95db8a73'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=08e081b4'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=b2524e66'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=b51ea429'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=87f305f3'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=738c3d6a'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=cf3cf4c6'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=2fc8b1b5'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=0e5fb6ba'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=5951293d'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=7c571cf4'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=482a88d0'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=a2f5182e'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=e1102af3'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=5f0fc746'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=5c347d75'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=77c4f953'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=6ff1d292'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=bc2f04a6'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=15b36541'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=801a3fec'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=b0117035'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=99383520'; FEATURES.push(auctionsFeature);
import { followMpFeature } from './follow-mp-feature.js?v=e5a26e1b'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=087704cd'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=be5487b4'; FEATURES.push(dropsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=320c0ff6'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=a6ed4cf0'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=d0c9813d'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=e9ff24e3'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=4035e591'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=8662a388'; FEATURES.push(yardVerbsMpFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=b6b7c200'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=7665b7bf'; FEATURES.push(itemVerbsMoreFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=d9623685'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=2de8255d'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=a5712ed5'; FEATURES.push(accountBackupFeature);
