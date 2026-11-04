/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=54d49b30';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=ebe52849';
import { questOffersFeature } from './quest-offers-feature.js?v=fe27c730';
import { meditationFeature } from './meditation-feature.js?v=11c9ecae';
import { teleportationFeature } from './teleportation-feature.js?v=491b614a';
import { racesFeature } from './races-feature.js?v=96cd7e16';
import { mayhemFeature } from './mayhem-feature.js?v=37998880';
import { crownsFeature } from './crowns-feature.js?v=92e52ba9';
import { patchesFeature } from './patches-feature.js?v=e4a197ff';
import { foxesFeature } from './foxes-feature.js?v=f9ccfcc0';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=b17eed58';
import { homesFeature } from './homes-feature.js?v=98970cff';
import { rookAttackFeature } from './rook-attack-feature.js?v=ba9a81cd';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=f463b679';
import { doorsFeature } from './doors-feature.js?v=fa98d010';
import { locationEventsFeature } from './location-events-feature.js?v=baea1395';
import { puzzlesFeature } from './puzzles-feature.js?v=22bf75b9';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=2376a16a';
import { streetJobsFeature } from './street-jobs-feature.js?v=2f493585';
import { imaginationFeature } from './imagination-feature.js?v=035b4f14';
import { supplyFeature } from './supply-feature.js?v=2ae7c9b4';
import { giantIconsFeature } from './giant-icons-feature.js?v=03f0531d';
import { rubeFeature } from './rube-feature.js?v=cb66009e';
import { unlearningFeature } from './unlearning-feature.js?v=9e1acb91';
import { dropsFeature } from './drops-feature.js?v=35b140d2';
import { masterGardenFeature } from './master-garden-feature.js?v=c31c04ec';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=26792389';
import { questInstancesFeature } from './quest-instances-feature.js?v=4985d60d';
import { partySpacesFeature } from './party-spaces-feature.js?v=f1de28ee';
import { seasonsFeature } from './seasons-feature.js?v=017deaee';
import { cameraModeFeature } from './camera-mode-feature.js?v=ad1ae5ea';
import { newxpFeature } from './newxp-feature.js?v=7ed3081e';
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
import { smugglingFeature } from './smuggling-feature.js?v=b9953b91'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=10c7d4b9'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=1dc466de'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=d90b7c8c'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=8152e847'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=ec08273c'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=95d63a43'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=919615ba'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=db45f3c7'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=1a01b5f2'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=1af49d9a'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=a7b4d831'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=a981af88'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=8b58c78b'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=476d34e8'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=ccf7d6fe'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=87415a3f'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=27da67bb'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=f73881c7'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=118455fd'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=59145efa'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=378ff340'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=8baf41e0'; FEATURES.push(rebuiltRoomsFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=c1bfba0b'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=2bb5e65c'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=d85a7eb5'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=168aeda3'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=26388930'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=a7e181a2'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=79634b87'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=c0a9bef9'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=70d00bb8'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=033abb20'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=2395c807'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=2c79517d'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=14984736'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=a6e52391'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=28782c49'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=cf04f823'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=e3370488'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=fbe2ce5e'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=510dc28a'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=28b6ab76'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=cff24e52'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=52b41d02'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=1a52ded4'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=ad2c03bb'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=871b6313'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=a064489e'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=c485955b'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=b043ef2b'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=1818626b'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=8e175321'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=95cf4a98'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=5e9a9350'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=136328ee'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=0c3fa98a'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=71760af2'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=a9e7d066'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=8272528d'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=e5e1fa09'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=0e75c3e7'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=9e1cd6ba'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=e3033084'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=ef71a299'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=a85b60bc'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=314c306b'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=61e93839'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=12bab068'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=72e2f488'; FEATURES.push(dropsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=b5ee3618'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=f95a49eb'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=9c17475e'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=72dc8afe'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=9d9c6cf5'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=6e734aad'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=fe143907'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=42563a02'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=d87a5d08'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=bf99205d'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=38cfe4e8'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=eef3178d'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=79b64838'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=8bb50d68'; FEATURES.push(playerImFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=df02c6a1'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=182aa81e'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=80ff3f6b'; FEATURES.push(accountBackupFeature);
