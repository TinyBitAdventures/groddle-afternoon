/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=2d9958f9';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=786a2ac4';
import { questOffersFeature } from './quest-offers-feature.js?v=aecedb48';
import { meditationFeature } from './meditation-feature.js?v=e9095468';
import { teleportationFeature } from './teleportation-feature.js?v=084947bd';
import { racesFeature } from './races-feature.js?v=ca4981db';
import { crownsFeature } from './crowns-feature.js?v=0a3487a4';
import { patchesFeature } from './patches-feature.js?v=4afa4c2b';
import { foxesFeature } from './foxes-feature.js?v=45e3e0ca';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=a56dce4d';
import { homesFeature } from './homes-feature.js?v=61ee8fba';
import { rookAttackFeature } from './rook-attack-feature.js?v=c57dc3cc';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=8e6ccce2';
import { doorsFeature } from './doors-feature.js?v=c0abe987';
import { locationEventsFeature } from './location-events-feature.js?v=58727a27';
import { puzzlesFeature } from './puzzles-feature.js?v=ad73fe48';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=6fa3bd02';
import { streetJobsFeature } from './street-jobs-feature.js?v=c3539496';
import { imaginationFeature } from './imagination-feature.js?v=71d48137';
import { supplyFeature } from './supply-feature.js?v=1eba1a15';
import { giantIconsFeature } from './giant-icons-feature.js?v=c8382ee7';
import { rubeFeature } from './rube-feature.js?v=82dec7ab';
import { unlearningFeature } from './unlearning-feature.js?v=b7fefa14';
import { dropsFeature } from './drops-feature.js?v=92989dc5';
import { masterGardenFeature } from './master-garden-feature.js?v=a8ee06d0';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=e46617e9';
import { questInstancesFeature } from './quest-instances-feature.js?v=d554c0df';
import { partySpacesFeature } from './party-spaces-feature.js?v=bb533f7e';
import { seasonsFeature } from './seasons-feature.js?v=84d4a389';
import { cameraModeFeature } from './camera-mode-feature.js?v=ad1ae5ea';
import { newxpFeature } from './newxp-feature.js?v=361b3ce0';
import { streetMinimapFeature } from './street-minimap-feature.js?v=c06ab604';

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
import { smugglingFeature } from './smuggling-feature.js?v=398b8f48'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=fd5a4171'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=aee4a1d2'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=cce74646'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=567ae21b'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=ba8fe469'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=f98638ea'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=4545641a'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=a3aae4c0'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=d83ea821'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=b3d417ea'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=47aa526f'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=ec4eeaf7'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=0f849c03'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=93ce283a'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=081cd35c'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=a094943c'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=2b49516a'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=8555aef3'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=c07362d6'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=9fca63b1'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=fff3374b'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=b830235a'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=b5232fd6'; FEATURES.push(rebuiltRoomsFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=7f87d087'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=86bb91d1'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=b2948120'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=3aed2f0e'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=2a97ab96'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=1bcb57ac'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=09d72deb'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=8c266e38'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=9d452a84'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=cfbb69de'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=fe7ce266'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=5d8c787e'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=3ea9bff1'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=d267a22f'; FEATURES.push(crabsFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=0054078b'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=ec10c5b9'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=3a89f5a3'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=5c839621'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=f88aeaea'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=cb21dc91'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=80753184'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=d06f2bf4'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=c0df83f4'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=f38920dc'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=f12751f9'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=738c3d6a'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=94a88f2a'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=2fc8b1b5'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=9dd31449'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=53914ede'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=667f85c8'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=cc7311e1'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=e0756bfb'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=e1102af3'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=af69c017'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=5c347d75'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=8f5f422f'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=6ff1d292'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=7cc9428f'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=12dd5c4d'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=801a3fec'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=469d047b'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=8d2e4b49'; FEATURES.push(auctionsFeature);
import { followMpFeature } from './follow-mp-feature.js?v=e5a26e1b'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=615760e5'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=86fad7da'; FEATURES.push(dropsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=320c0ff6'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=4eeadc83'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=dd057d33'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=4fc6f8da'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=00c4b491'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=fd1266e8'; FEATURES.push(yardVerbsMpFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=b6b7c200'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=fdaf5a7d'; FEATURES.push(itemVerbsMoreFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=6b079a9c'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=107825cd'; FEATURES.push(updateReadyFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=65db2cc8'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=c9cbbbf0'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=a5712ed5'; FEATURES.push(accountBackupFeature);
