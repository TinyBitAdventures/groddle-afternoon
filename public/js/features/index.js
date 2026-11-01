/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=bbe7a45e';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=59cfa106';
import { questOffersFeature } from './quest-offers-feature.js?v=d7a7da2e';
import { meditationFeature } from './meditation-feature.js?v=782c72d3';
import { teleportationFeature } from './teleportation-feature.js?v=5f8b0c68';
import { racesFeature } from './races-feature.js?v=7d7f4ca3';
import { mayhemFeature } from './mayhem-feature.js?v=eb2a46e3';
import { crownsFeature } from './crowns-feature.js?v=f711131e';
import { patchesFeature } from './patches-feature.js?v=25d3d145';
import { foxesFeature } from './foxes-feature.js?v=81c4f6a8';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=fe5d9cfe';
import { homesFeature } from './homes-feature.js?v=d388620f';
import { rookAttackFeature } from './rook-attack-feature.js?v=5401066c';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=7ce4815b';
import { doorsFeature } from './doors-feature.js?v=58ccbff9';
import { locationEventsFeature } from './location-events-feature.js?v=58727a27';
import { puzzlesFeature } from './puzzles-feature.js?v=44857daf';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=ddcfa6e3';
import { streetJobsFeature } from './street-jobs-feature.js?v=49e239a6';
import { imaginationFeature } from './imagination-feature.js?v=b7fb481a';
import { supplyFeature } from './supply-feature.js?v=b10a7b1b';
import { giantIconsFeature } from './giant-icons-feature.js?v=e2cb85ef';
import { rubeFeature } from './rube-feature.js?v=feaa2668';
import { unlearningFeature } from './unlearning-feature.js?v=7128a4ef';
import { dropsFeature } from './drops-feature.js?v=7c2db147';
import { masterGardenFeature } from './master-garden-feature.js?v=d9b76c56';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=18a41838';
import { questInstancesFeature } from './quest-instances-feature.js?v=1c0f5ec5';
import { partySpacesFeature } from './party-spaces-feature.js?v=a29c403b';
import { seasonsFeature } from './seasons-feature.js?v=cae5a17a';
import { cameraModeFeature } from './camera-mode-feature.js?v=ad1ae5ea';
import { newxpFeature } from './newxp-feature.js?v=1c2f4ba6';
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
import { smugglingFeature } from './smuggling-feature.js?v=ab19b04e'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=6ca164d2'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=5af94308'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=168a4f6f'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=893ecd97'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=2c8a8b05'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=71ec93cc'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=c0c6d826'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=c7ba4e8f'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=203a8888'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=f69d4a80'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=a7edf16a'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=5c7f445f'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=d2f293d5'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=33600263'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=ae90a9e9'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=4f96217c'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=46180abc'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=13b5c117'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=eb6af9f0'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=9fca63b1'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=e5d108bd'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=b5232fd6'; FEATURES.push(rebuiltRoomsFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=8f3b47f3'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=6d7a69ac'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=57a7bcfb'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=0d61a954'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=3ba528b4'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=729472e9'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=3b32bbab'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=3c1bd835'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=81248bca'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=66f333bd'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=1c0da91c'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=ac2d4885'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=38103b7b'; FEATURES.push(crabsFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=bcf78dbf'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=a294ee5a'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=40033db6'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=64356b5a'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=8288fc0a'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=f35da7d5'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=a7939163'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=4b827f44'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=4bf9e4f3'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=abce1e76'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=33185a92'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=6916f329'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=de651cab'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=b043ef2b'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=fdb4e3ce'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=fe52da15'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=1bdc4639'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=33ec63ec'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=dbe171b3'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=c8865e4d'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=9c9781fd'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=41769b24'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=730d3814'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=541c5384'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=5ee53c7a'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=5300bf18'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=d41023ea'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=95a58edf'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=82ddb4a0'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=bf1e09a8'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=e5a26e1b'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=bd99708a'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=284aeb5e'; FEATURES.push(dropsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=cab34594'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=c8883c51'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=c4d8f5c0'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=4f4f693e'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=fc2c1051'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=c6a11972'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=592a1442'; FEATURES.push(homeMachinesFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=91309fbd'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=2ddaf3bb'; FEATURES.push(itemVerbsMoreFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=b0813bcf'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=e0b8edbc'; FEATURES.push(butlerImFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=ddf0cba9'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=c6f08935'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=399056e8'; FEATURES.push(accountBackupFeature);
