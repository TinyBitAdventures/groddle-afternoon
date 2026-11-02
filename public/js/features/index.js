/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=bbe7a45e';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=eadd71d3';
import { questOffersFeature } from './quest-offers-feature.js?v=d7a7da2e';
import { meditationFeature } from './meditation-feature.js?v=782c72d3';
import { teleportationFeature } from './teleportation-feature.js?v=5f8b0c68';
import { racesFeature } from './races-feature.js?v=0a3f4edc';
import { mayhemFeature } from './mayhem-feature.js?v=eb2a46e3';
import { crownsFeature } from './crowns-feature.js?v=f711131e';
import { patchesFeature } from './patches-feature.js?v=c866ed8f';
import { foxesFeature } from './foxes-feature.js?v=c1e9c6dc';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=19414d42';
import { homesFeature } from './homes-feature.js?v=df21884b';
import { rookAttackFeature } from './rook-attack-feature.js?v=9a7f75f9';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=3b0566ef';
import { doorsFeature } from './doors-feature.js?v=7b5fb5d1';
import { locationEventsFeature } from './location-events-feature.js?v=df2533e4';
import { puzzlesFeature } from './puzzles-feature.js?v=6e5ce8e4';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=e00150f0';
import { streetJobsFeature } from './street-jobs-feature.js?v=301c9fd9';
import { imaginationFeature } from './imagination-feature.js?v=097654ae';
import { supplyFeature } from './supply-feature.js?v=b10a7b1b';
import { giantIconsFeature } from './giant-icons-feature.js?v=2ef1c648';
import { rubeFeature } from './rube-feature.js?v=eb1da065';
import { unlearningFeature } from './unlearning-feature.js?v=7128a4ef';
import { dropsFeature } from './drops-feature.js?v=7c2db147';
import { masterGardenFeature } from './master-garden-feature.js?v=d9b76c56';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=69b155ab';
import { questInstancesFeature } from './quest-instances-feature.js?v=6b78e90f';
import { partySpacesFeature } from './party-spaces-feature.js?v=a29c403b';
import { seasonsFeature } from './seasons-feature.js?v=f27eb3e3';
import { cameraModeFeature } from './camera-mode-feature.js?v=ad1ae5ea';
import { newxpFeature } from './newxp-feature.js?v=1dcf4f2f';
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
import { smugglingFeature } from './smuggling-feature.js?v=c34820b3'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=6ca164d2'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=5af94308'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=168a4f6f'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=893ecd97'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=2c8a8b05'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=a71b4639'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=4eebfc59'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=c7ba4e8f'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=203a8888'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=4f773c0b'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=fd17baca'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=1d4931a5'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=2cef8f35'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=93a44f2f'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=d79faadd'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=f233f5ad'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=aeadf862'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=13b5c117'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=12314f3b'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=9fca63b1'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=e5d108bd'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=b5232fd6'; FEATURES.push(rebuiltRoomsFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=bf78ec92'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=295cc3e4'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=57a7bcfb'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=d8889a08'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=3ba528b4'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=729472e9'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=6d0835f3'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=3c1bd835'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=bafd95ca'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=20961e0e'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=afdf9971'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=43d103d6'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=8a02f946'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=ef8f837d'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=8cf7ebbe'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=7e622d39'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=40033db6'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=df504ac6'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=be91d2d7'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=f35da7d5'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=7d8331fe'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=4b827f44'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=1c3f6021'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=d621584d'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=33185a92'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=6a468e65'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=de651cab'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=b043ef2b'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=ff1de505'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=43a94a34'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=1bdc4639'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=6016329f'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=dbe171b3'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=b11000f0'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=9c9781fd'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=41769b24'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=730d3814'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=541c5384'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=16b62b99'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=5300bf18'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=d41023ea'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=ba587501'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=0b2a2816'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=bf1e09a8'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=e5a26e1b'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=bd99708a'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=284aeb5e'; FEATURES.push(dropsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=318118d0'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=c8883c51'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=c4d8f5c0'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=4fb65463'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=b02fdc1b'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=7745adce'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=8b1d53eb'; FEATURES.push(homeMachinesFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=91309fbd'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=21078ec0'; FEATURES.push(itemVerbsMoreFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=b0813bcf'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=392ed38a'; FEATURES.push(butlerImFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=502d5963'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=c6f08935'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=399056e8'; FEATURES.push(accountBackupFeature);
