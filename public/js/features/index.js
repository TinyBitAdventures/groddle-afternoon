/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=54d49b30';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=a510b38e';
import { questOffersFeature } from './quest-offers-feature.js?v=b94a5453';
import { meditationFeature } from './meditation-feature.js?v=11c9ecae';
import { teleportationFeature } from './teleportation-feature.js?v=2274acec';
import { racesFeature } from './races-feature.js?v=96cd7e16';
import { mayhemFeature } from './mayhem-feature.js?v=37998880';
import { crownsFeature } from './crowns-feature.js?v=92e52ba9';
import { patchesFeature } from './patches-feature.js?v=e4a197ff';
import { foxesFeature } from './foxes-feature.js?v=f9ccfcc0';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=b17eed58';
import { homesFeature } from './homes-feature.js?v=a520d6ab';
import { rookAttackFeature } from './rook-attack-feature.js?v=870c3407';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=b3aaa232';
import { doorsFeature } from './doors-feature.js?v=fa98d010';
import { locationEventsFeature } from './location-events-feature.js?v=6aca5a98';
import { puzzlesFeature } from './puzzles-feature.js?v=6a4daa03';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=2376a16a';
import { streetJobsFeature } from './street-jobs-feature.js?v=b9e1bc27';
import { imaginationFeature } from './imagination-feature.js?v=a5f59c57';
import { supplyFeature } from './supply-feature.js?v=2ae7c9b4';
import { giantIconsFeature } from './giant-icons-feature.js?v=03f0531d';
import { rubeFeature } from './rube-feature.js?v=cb66009e';
import { unlearningFeature } from './unlearning-feature.js?v=9e1acb91';
import { dropsFeature } from './drops-feature.js?v=35b140d2';
import { masterGardenFeature } from './master-garden-feature.js?v=c31c04ec';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=f40ac234';
import { questInstancesFeature } from './quest-instances-feature.js?v=cf9bbd43';
import { partySpacesFeature } from './party-spaces-feature.js?v=f1de28ee';
import { seasonsFeature } from './seasons-feature.js?v=dd48417f';
import { cameraModeFeature } from './camera-mode-feature.js?v=ad1ae5ea';
import { newxpFeature } from './newxp-feature.js?v=fc25c094';
import { streetMinimapFeature } from './street-minimap-feature.js?v=a1b0a0da';

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
import { smugglingFeature } from './smuggling-feature.js?v=a2052294'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=dce754ae'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=1dc466de'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=d90b7c8c'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=bccebf6d'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=ec08273c'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=8321191f'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=919615ba'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=db45f3c7'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=d7f8243d'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=e020972c'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=059d1c1d'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=2e0cefa7'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=0ebc1e32'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=6c8b8940'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=753f93b0'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=87415a3f'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=d999748b'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=28f06a8e'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=118455fd'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=59145efa'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=7a3e1426'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=8baf41e0'; FEATURES.push(rebuiltRoomsFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=c1bfba0b'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=a2d30e36'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=d85a7eb5'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=d2132e76'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=26388930'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=a7e181a2'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=e9841b83'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=c0a9bef9'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=94aa2aa3'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=b6235b64'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=29e18a13'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=df070563'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=750eaabf'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=a6e52391'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=28782c49'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=cf04f823'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=e3370488'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=0dd57808'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=33877953'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=28b6ab76'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=a8a621a5'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=e8216af2'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=1a52ded4'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=ad2c03bb'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=c54a2e26'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=a064489e'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=136c40ce'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=b043ef2b'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=df29e0d4'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=0b9bf17d'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=a2e3bf22'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=2b8fd150'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=136328ee'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=0c3fa98a'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=71760af2'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=a9e7d066'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=3f7440d5'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=e5e1fa09'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=b835ce57'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=5bf659b2'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=e3033084'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=5685012d'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=a85b60bc'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=314c306b'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=eba68b74'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=12bab068'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=72e2f488'; FEATURES.push(dropsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=b5ee3618'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=ae1f9ff4'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=9c17475e'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=5c51e540'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=9d9c6cf5'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=efa16abc'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=3202a1b0'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=129fcf9e'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=d87a5d08'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=6c11f010'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=38cfe4e8'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=eef3178d'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=7fea8609'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=8bb50d68'; FEATURES.push(playerImFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=5697fd19'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=182aa81e'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=80ff3f6b'; FEATURES.push(accountBackupFeature);
