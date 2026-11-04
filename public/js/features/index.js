/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=705a486b';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=128c01c5';
import { questOffersFeature } from './quest-offers-feature.js?v=10d91ea6';
import { meditationFeature } from './meditation-feature.js?v=6f4fd517';
import { teleportationFeature } from './teleportation-feature.js?v=b46fa776';
import { racesFeature } from './races-feature.js?v=b8789363';
import { mayhemFeature } from './mayhem-feature.js?v=1efbaf68';
import { crownsFeature } from './crowns-feature.js?v=81d9cba0';
import { patchesFeature } from './patches-feature.js?v=310a2eec';
import { foxesFeature } from './foxes-feature.js?v=22a3a425';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=b17eed58';
import { homesFeature } from './homes-feature.js?v=c68a24c0';
import { rookAttackFeature } from './rook-attack-feature.js?v=8292bb23';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=96b07841';
import { doorsFeature } from './doors-feature.js?v=35b83e5d';
import { locationEventsFeature } from './location-events-feature.js?v=df2533e4';
import { puzzlesFeature } from './puzzles-feature.js?v=4eabe06d';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=152de95f';
import { streetJobsFeature } from './street-jobs-feature.js?v=b7692d01';
import { imaginationFeature } from './imagination-feature.js?v=bfa3cd2c';
import { supplyFeature } from './supply-feature.js?v=ed3383bf';
import { giantIconsFeature } from './giant-icons-feature.js?v=e23935e9';
import { rubeFeature } from './rube-feature.js?v=4c485fdb';
import { unlearningFeature } from './unlearning-feature.js?v=9e1acb91';
import { dropsFeature } from './drops-feature.js?v=e0102ed4';
import { masterGardenFeature } from './master-garden-feature.js?v=8431267b';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=67850b69';
import { questInstancesFeature } from './quest-instances-feature.js?v=ee5c255f';
import { partySpacesFeature } from './party-spaces-feature.js?v=da8f8c9b';
import { seasonsFeature } from './seasons-feature.js?v=01414915';
import { cameraModeFeature } from './camera-mode-feature.js?v=ad1ae5ea';
import { newxpFeature } from './newxp-feature.js?v=639a2965';
import { streetMinimapFeature } from './street-minimap-feature.js?v=c7ceb7ef';

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
import { smugglingFeature } from './smuggling-feature.js?v=7bb72f7c'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=552041c3'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=6cdc64f7'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=d4e958e4'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=7fa801fb'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=cfbc572c'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=add6dd98'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=bbb68967'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=2c3e8ee9'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=2027a9a8'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=311cab17'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=b6a01f5e'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=9a3e0740'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=e603802f'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=e582678f'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=a71fe5d3'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=c75cbbff'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=8aa8fc74'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=5cdbde80'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=377b1015'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=59145efa'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=066bdc6c'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=b5232fd6'; FEATURES.push(rebuiltRoomsFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=4eb1b5f0'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=36d838f3'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=23fef51c'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=47b4d077'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=44cffcee'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=874827ac'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=6438e51e'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=08ebe41b'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=ace33ed9'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=6652a898'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=d0573db9'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=67ad0322'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=33f788cb'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=a6e52391'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=b6764b2c'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=ff81e11c'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=ddf2cfdb'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=bf302a9a'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=68ecac40'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=cf95024a'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=5a736174'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=c308e15a'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=e6523d0b'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=36f43135'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=4014e91d'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=a064489e'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=e5f58d96'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=b043ef2b'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=82753d14'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=db397ab7'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=f5afe627'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=033b89d0'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=136328ee'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=0c3fa98a'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=f0239868'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=488ca796'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=fe844a86'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=5b9e2708'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=917668f1'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=72cdf529'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=e3033084'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=d886e0df'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=06118661'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=0c45c5b2'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=237cb006'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=12bab068'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=054ccb2c'; FEATURES.push(dropsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=dd0464d4'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=70dd379e'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=e2980571'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=b6bd2975'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=9d9c6cf5'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=c0169593'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=7a41f33d'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=a04398cc'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=0ae7c7ff'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=dae15c96'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=38cfe4e8'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=eef3178d'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=b097ef2b'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=8bb50d68'; FEATURES.push(playerImFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=055e3502'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=9cc093c0'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=80ff3f6b'; FEATURES.push(accountBackupFeature);
