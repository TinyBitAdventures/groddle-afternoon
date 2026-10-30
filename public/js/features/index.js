/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=bdaefff5';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=9e15fe12';
import { questOffersFeature } from './quest-offers-feature.js?v=243877f6';
import { meditationFeature } from './meditation-feature.js?v=63d9212b';
import { teleportationFeature } from './teleportation-feature.js?v=a79a7cea';
import { racesFeature } from './races-feature.js?v=6e095024';
import { crownsFeature } from './crowns-feature.js?v=5393b89b';
import { patchesFeature } from './patches-feature.js?v=c3618313';
import { foxesFeature } from './foxes-feature.js?v=cd9d7bd3';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=a9c3805e';
import { homesFeature } from './homes-feature.js?v=63e548fa';
import { rookAttackFeature } from './rook-attack-feature.js?v=f4430d91';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=9d576283';
import { doorsFeature } from './doors-feature.js?v=5a46fd5b';
import { locationEventsFeature } from './location-events-feature.js?v=61fa7247';
import { puzzlesFeature } from './puzzles-feature.js?v=8292ad58';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=151e175c';
import { streetJobsFeature } from './street-jobs-feature.js?v=56e93f94';
import { imaginationFeature } from './imagination-feature.js?v=15c32e0c';
import { supplyFeature } from './supply-feature.js?v=890ec8c4';
import { giantIconsFeature } from './giant-icons-feature.js?v=3d542333';
import { rubeFeature } from './rube-feature.js?v=27db2738';
import { unlearningFeature } from './unlearning-feature.js?v=b7fefa14';
import { dropsFeature } from './drops-feature.js?v=92989dc5';
import { masterGardenFeature } from './master-garden-feature.js?v=a17da2bd';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=c14ec283';
import { questInstancesFeature } from './quest-instances-feature.js?v=412d45db';
import { partySpacesFeature } from './party-spaces-feature.js?v=3392a54d';
import { seasonsFeature } from './seasons-feature.js?v=5e5f2923';
import { cameraModeFeature } from './camera-mode-feature.js?v=0106af1c';
import { newxpFeature } from './newxp-feature.js?v=f8649cdc';

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
import { smugglingFeature } from './smuggling-feature.js?v=60d0832a'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=b4e3d104'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=b5d31c61'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=cce74646'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=45f7d542'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=b6ae268a'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=e585470b'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=80ee9bf6'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=8c862dec'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=cc52d551'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=69ce6103'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=21a78db5'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=02474666'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=70f5a175'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=0735679b'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=76163d94'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=65fc537f'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=b3ba005a'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=890eec1d'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=032b3a02'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=91d8eb1c'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=fff3374b'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=b830235a'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=47822aae'; FEATURES.push(rebuiltRoomsFeature);
import { subwayFeature } from './subway-feature.js?v=9b41f5ee'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=366bc6f0'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=5ad7b786'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=ae534daa'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=39c17a5f'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=14a6f6d0'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=0624493d'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=415d449e'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=e956341d'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=213e4ac4'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=bcdf7c97'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=46beeda8'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=fac6f3d1'; FEATURES.push(crabsFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=3d99569b'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=b8e284b6'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=3a89f5a3'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=7f710a84'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=2edbd931'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=3c14e1f7'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=9a892ab5'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=50040cd7'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=b2524e66'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=b51ea429'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=87f305f3'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=738c3d6a'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=cf3cf4c6'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=2fc8b1b5'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=61154b21'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=ff004579'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=7c571cf4'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=cf83c6a5'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=5c436881'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=e1102af3'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=5f0fc746'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=5c347d75'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=c0d1412c'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=6ff1d292'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=6fcf4742'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=15b36541'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=801a3fec'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=83d58e04'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=99383520'; FEATURES.push(auctionsFeature);
import { followMpFeature } from './follow-mp-feature.js?v=e5a26e1b'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=087704cd'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=be5487b4'; FEATURES.push(dropsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=320c0ff6'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=a6ed4cf0'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=87e04562'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=e0ee95ab'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=4035e591'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=af318a50'; FEATURES.push(yardVerbsMpFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=b6b7c200'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=346b23f8'; FEATURES.push(itemVerbsMoreFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=50e7a7d7'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=8414a47b'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=a5712ed5'; FEATURES.push(accountBackupFeature);
