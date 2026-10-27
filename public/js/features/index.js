/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=flags-1';
import { hellFeature } from './hell-feature.js?v=hell-16';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=resource-nodes-14';
import { questOffersFeature } from './quest-offers-feature.js?v=offers-12';
import { meditationFeature } from './meditation-feature.js?v=radiate-7';
import { teleportationFeature } from './teleportation-feature.js?v=teleport-13';
import { racesFeature } from './races-feature.js?v=card-23';
import { crownsFeature } from './crowns-feature.js?v=g334-6';
import { patchesFeature } from './patches-feature.js?v=patches-15';
import { foxesFeature } from './foxes-feature.js?v=foxes-4';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=kitties-2';
import { homesFeature } from './homes-feature.js?v=homes-49';
import { rookAttackFeature } from './rook-attack-feature.js?v=g334-1';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=furniture-57';
import { doorsFeature } from './doors-feature.js?v=doors-10';
import { locationEventsFeature } from './location-events-feature.js?v=location-events-4';
import { puzzlesFeature } from './puzzles-feature.js?v=puzzles-7';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=g300-1';
import { streetJobsFeature } from './street-jobs-feature.js?v=blur-7';
import { imaginationFeature } from './imagination-feature.js?v=radiate-1';
import { supplyFeature } from './supply-feature.js?v=supply-8';
import { giantIconsFeature } from './giant-icons-feature.js?v=g335-1';
import { rubeFeature } from './rube-feature.js?v=rube-12';
import { unlearningFeature } from './unlearning-feature.js?v=unlearn-1';
import { dropsFeature } from './drops-feature.js?v=drops-4';
import { masterGardenFeature } from './master-garden-feature.js?v=mastergarden-4';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=g335-3';
import { questInstancesFeature } from './quest-instances-feature.js?v=qi-17';
import { partySpacesFeature } from './party-spaces-feature.js?v=party-10';
import { seasonsFeature } from './seasons-feature.js?v=play-19';
import { cameraModeFeature } from './camera-mode-feature.js?v=g231-1';
import { newxpFeature } from './newxp-feature.js?v=play-3';

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
import { smugglingFeature } from './smuggling-feature.js?v=card-18'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=home-tower-15'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=secrets-7'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=musicblocks-1'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=shrine-hint-5'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=tower-rooms-12'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=mid-tower-6'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=tree-death-18'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=g296-1'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=g300-1'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=blur-9'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=play-17'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=g335-3'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=butler-feature-49'; FEATURES.push(butlerFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=g335-2'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=g152-2'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=hi-signs-46'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=g313-1'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=g311-1'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=g104-1'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=g105-1'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=g93-1'; FEATURES.push(vicarsPeakFeature);
import { subwayFeature } from './subway-feature.js?v=play-9'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=g300-2'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=g327-1'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=g356-1'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=g300-1'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=g300-1'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=radiate-10'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=g335-1'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=play-2'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=card-43'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=blur-9'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=card-49'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=g196-1'; FEATURES.push(crabsFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=g300-1'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=g300-1'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=g345-2'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=blur-10'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=blur-1'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=g300-1'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=lonely-3'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=lonely-9'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=g313-1'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=g300-1'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=g300-1'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=desk2-2'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=g334-3'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=g225-1'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=lonely-12'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=desk2-8'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=g339-2'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=play-17'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=mp4-2'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=mp4-2'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=pspace-1'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=g335-1'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=g328-11'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=play-11'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=radiate-13'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=g329-6'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=nbhome-9'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=g356-1'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=g333-5'; FEATURES.push(auctionsFeature);
import { followMpFeature } from './follow-mp-feature.js?v=follow-1'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=g334-hog-1'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=g332-drops-4'; FEATURES.push(dropsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=g353-3'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=verbs-1'; FEATURES.push(playerVerbsMpFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=g334-4'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=nbhome-10'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=nbhome-9'; FEATURES.push(accountBackupFeature);
