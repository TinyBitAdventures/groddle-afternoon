/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=1f2abc54';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=ccc65bb8';
import { questOffersFeature } from './quest-offers-feature.js?v=9d9418e8';
import { meditationFeature } from './meditation-feature.js?v=782c72d3';
import { teleportationFeature } from './teleportation-feature.js?v=236fbddc';
import { racesFeature } from './races-feature.js?v=0a3f4edc';
import { mayhemFeature } from './mayhem-feature.js?v=eb2a46e3';
import { crownsFeature } from './crowns-feature.js?v=f711131e';
import { patchesFeature } from './patches-feature.js?v=01d4efa5';
import { foxesFeature } from './foxes-feature.js?v=f1aae490';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=fb881748';
import { homesFeature } from './homes-feature.js?v=4f9187b5';
import { rookAttackFeature } from './rook-attack-feature.js?v=4a61b1f1';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=32f11c3b';
import { doorsFeature } from './doors-feature.js?v=b7e66401';
import { locationEventsFeature } from './location-events-feature.js?v=df2533e4';
import { puzzlesFeature } from './puzzles-feature.js?v=6e5ce8e4';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=e00150f0';
import { streetJobsFeature } from './street-jobs-feature.js?v=e1e56904';
import { imaginationFeature } from './imagination-feature.js?v=8d4a8e0a';
import { supplyFeature } from './supply-feature.js?v=e1e77112';
import { giantIconsFeature } from './giant-icons-feature.js?v=0a91c02a';
import { rubeFeature } from './rube-feature.js?v=fa93f7fc';
import { unlearningFeature } from './unlearning-feature.js?v=7128a4ef';
import { dropsFeature } from './drops-feature.js?v=0f7a299d';
import { masterGardenFeature } from './master-garden-feature.js?v=ce3a2ef2';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=8e3c588b';
import { questInstancesFeature } from './quest-instances-feature.js?v=70c5c131';
import { partySpacesFeature } from './party-spaces-feature.js?v=a29c403b';
import { seasonsFeature } from './seasons-feature.js?v=fd92d5a2';
import { cameraModeFeature } from './camera-mode-feature.js?v=ad1ae5ea';
import { newxpFeature } from './newxp-feature.js?v=a4fb47f1';
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
import { smugglingFeature } from './smuggling-feature.js?v=6443bd90'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=c65f8992'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=c1aafbf0'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=168a4f6f'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=b132d346'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=2c8a8b05'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=26f0648c'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=d6a0c85d'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=869b564e'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=8ce5382c'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=a5b4e0a7'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=1d00b4e0'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=424cff70'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=fd30eb7c'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=6c5d8605'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=34ffd4a6'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=d1b9507d'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=6047e3a4'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=33a79a87'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=7e2dc351'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=9fca63b1'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=3b7ec815'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=b5232fd6'; FEATURES.push(rebuiltRoomsFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=61cbe48f'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=3298faef'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=7ef96cc3'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=8e62c04b'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=25457f57'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=729472e9'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=9604a16c'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=6ffae0d2'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=9be31d26'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=434b0d3d'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=0a41a42f'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=de3a8bfc'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=babe9fe4'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=4e795fff'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=0e0fad3a'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=7e28ad2b'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=cb133699'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=044e342d'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=b378852e'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=7d4f5a42'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=c4fe94ea'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=6760e292'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=1c3f6021'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=53cdb784'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=913a3f0a'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=6a468e65'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=65a9bf92'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=b043ef2b'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=ff1de505'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=430f1563'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=1bdc4639'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=4751f28a'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=dbe171b3'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=b11000f0'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=28787de8'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=41769b24'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=3d549d54'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=541c5384'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=6cec30ee'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=75f275e9'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=246c9845'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=58e6b682'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=d77466a8'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=41d97c4d'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=e5a26e1b'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=bd99708a'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=57788c0c'; FEATURES.push(dropsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=c1b501c6'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=4c2cf874'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=f73a885c'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=2c3e2bd9'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=2a7245c8'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=44f5115c'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=1f0391ca'; FEATURES.push(homeMachinesFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=91309fbd'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=74e2739d'; FEATURES.push(itemVerbsMoreFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=b0813bcf'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=ffe5bd4e'; FEATURES.push(butlerImFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=97a4cff0'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=c6f08935'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=f07da586'; FEATURES.push(accountBackupFeature);
