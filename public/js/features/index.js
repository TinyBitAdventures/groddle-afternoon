/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=0b83669c';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=189a6890';
import { questOffersFeature } from './quest-offers-feature.js?v=592eb304';
import { meditationFeature } from './meditation-feature.js?v=3fb6ade0';
import { teleportationFeature } from './teleportation-feature.js?v=a2883436';
import { racesFeature } from './races-feature.js?v=d4480c4a';
import { mayhemFeature } from './mayhem-feature.js?v=eb2a46e3';
import { crownsFeature } from './crowns-feature.js?v=6e626da9';
import { patchesFeature } from './patches-feature.js?v=762bbde9';
import { foxesFeature } from './foxes-feature.js?v=343aceca';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=0def544f';
import { homesFeature } from './homes-feature.js?v=6c0f9284';
import { rookAttackFeature } from './rook-attack-feature.js?v=67d0ba60';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=68b86a95';
import { doorsFeature } from './doors-feature.js?v=3917c0f4';
import { locationEventsFeature } from './location-events-feature.js?v=58727a27';
import { puzzlesFeature } from './puzzles-feature.js?v=44857daf';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=22daa850';
import { streetJobsFeature } from './street-jobs-feature.js?v=5c7d33a7';
import { imaginationFeature } from './imagination-feature.js?v=ee410558';
import { supplyFeature } from './supply-feature.js?v=e51e2fc8';
import { giantIconsFeature } from './giant-icons-feature.js?v=a4d9da37';
import { rubeFeature } from './rube-feature.js?v=36ac30a9';
import { unlearningFeature } from './unlearning-feature.js?v=90f0dce7';
import { dropsFeature } from './drops-feature.js?v=24f391a8';
import { masterGardenFeature } from './master-garden-feature.js?v=17cb5292';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=d09ce11d';
import { questInstancesFeature } from './quest-instances-feature.js?v=f55493a2';
import { partySpacesFeature } from './party-spaces-feature.js?v=356060c1';
import { seasonsFeature } from './seasons-feature.js?v=37a35649';
import { cameraModeFeature } from './camera-mode-feature.js?v=ad1ae5ea';
import { newxpFeature } from './newxp-feature.js?v=e538e407';
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
import { smugglingFeature } from './smuggling-feature.js?v=630b1f7d'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=7ce20566'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=53a83b19'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=abd0f941'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=ab6cb0de'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=c153ec46'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=efeefcdd'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=2eaa412b'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=4b70cd54'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=63c8250c'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=4b83fc25'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=66b8748e'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=2220a524'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=72b2221f'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=9c4a03a4'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=1e35afdf'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=49d1e351'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=319a9400'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=13b5c117'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=f64ec3bf'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=9fca63b1'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=fef9ccf7'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=b5232fd6'; FEATURES.push(rebuiltRoomsFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=f6d9db33'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=9facd5b4'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=1bb73918'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=2867b627'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=3a263a0d'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=5ac6bf87'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=efe530c7'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=a27eaa58'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=a5ea09af'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=e225d89e'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=fb73423f'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=943dbb4c'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=0def5680'; FEATURES.push(crabsFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=9a009d11'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=05e483fe'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=effeab1b'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=91c54cca'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=e705aeb8'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=fc641237'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=946143b6'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=8e7eefa8'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=488bec8e'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=b1db10ed'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=ce96d792'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=6916f329'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=8c20d897'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=2fc8b1b5'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=fdb4e3ce'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=63fc0421'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=1bdc4639'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=99f37190'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=dbe171b3'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=c8865e4d'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=bad9746d'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=fb97c50f'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=730d3814'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=541c5384'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=f6321c83'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=fe35cc59'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=d41023ea'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=be71351c'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=93f7a50d'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=9ef2847e'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=e5a26e1b'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=bd99708a'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=ad443388'; FEATURES.push(dropsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=cab34594'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=b4f82c89'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=b04bac75'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=101127e4'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=00c4b491'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=c22f3739'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=171aec9c'; FEATURES.push(homeMachinesFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=7dfda702'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=d2981c5c'; FEATURES.push(itemVerbsMoreFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=b0813bcf'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=6926ba8f'; FEATURES.push(butlerImFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=b16048cb'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=967ca61d'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=399056e8'; FEATURES.push(accountBackupFeature);
