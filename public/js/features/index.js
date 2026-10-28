/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=flags-1';
import { hellFeature } from './hell-feature.js?v=hell-16';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=resource-nodes-15';
import { questOffersFeature } from './quest-offers-feature.js?v=g390-1';
import { meditationFeature } from './meditation-feature.js?v=g392-1';
import { teleportationFeature } from './teleportation-feature.js?v=teleport-13';
import { racesFeature } from './races-feature.js?v=g392-1';
import { crownsFeature } from './crowns-feature.js?v=g392-1';
import { patchesFeature } from './patches-feature.js?v=patches-16';
import { foxesFeature } from './foxes-feature.js?v=g392-1';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=kitties-2';
import { homesFeature } from './homes-feature.js?v=g380-1';
import { rookAttackFeature } from './rook-attack-feature.js?v=g392-1';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=g380-1';
import { doorsFeature } from './doors-feature.js?v=doors-10';
import { locationEventsFeature } from './location-events-feature.js?v=location-events-4';
import { puzzlesFeature } from './puzzles-feature.js?v=puzzles-7';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=g300-1';
import { streetJobsFeature } from './street-jobs-feature.js?v=blur-9';
import { imaginationFeature } from './imagination-feature.js?v=radiate-3';
import { supplyFeature } from './supply-feature.js?v=g390-1';
import { giantIconsFeature } from './giant-icons-feature.js?v=g335-1';
import { rubeFeature } from './rube-feature.js?v=rube-12';
import { unlearningFeature } from './unlearning-feature.js?v=unlearn-1';
import { dropsFeature } from './drops-feature.js?v=drops-4';
import { masterGardenFeature } from './master-garden-feature.js?v=g390-1';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=g392-1';
import { questInstancesFeature } from './quest-instances-feature.js?v=g388-1';
import { partySpacesFeature } from './party-spaces-feature.js?v=party-11';
import { seasonsFeature } from './seasons-feature.js?v=g392-1';
import { cameraModeFeature } from './camera-mode-feature.js?v=g359-1';
import { newxpFeature } from './newxp-feature.js?v=g380-1';

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
import { smugglingFeature } from './smuggling-feature.js?v=g388-1'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=g366-1'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=secrets-7'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=musicblocks-1'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=g385-1'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=tower-rooms-12'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=mid-tower-6'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=g383-1'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=g369-1'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=g364-1'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=g380-1'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=g392-1'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=g392-1'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=g380-1'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=g388-1'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=g335-2'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=g359-1'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=g380-1'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=g382-1'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=g311-1'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=g104-1'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=g105-1'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=g93-1'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=g382-1'; FEATURES.push(rebuiltRoomsFeature);
import { subwayFeature } from './subway-feature.js?v=play-9'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=g300-2'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=g392-1'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=g380-1'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=g392-1'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=g300-1'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=g392-1'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=g335-1'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=play-2'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=g388-1'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=g382-1'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=g380-1'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=g382-1'; FEATURES.push(crabsFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=g300-1'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=g374-1'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=g370-1'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=g380-1'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=g392-1'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=g300-1'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=lonely-4'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=lonely-9'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=g313-1'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=g374-1'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=g300-1'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=desk2-2'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=g334-3'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=g381-1'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=lonely-13'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=desk2-9'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=g372-1'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=g392-1'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=mp4-2'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=mp4-2'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=g392-1'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=g335-1'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=g359-1'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=play-12'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=g380-1'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=races3-test-2'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=nbhome-10'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=g380-1'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=g359-1'; FEATURES.push(auctionsFeature);
import { followMpFeature } from './follow-mp-feature.js?v=follow-1'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=g392-1'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=g375-1'; FEATURES.push(dropsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=g359-1'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=g392-1'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=g332-snaps-1'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=g380-1'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=g369-1'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=g375-1'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=g380-1'; FEATURES.push(yardVerbsMpFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=g390-1'; FEATURES.push(questVerbsFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=g383-1'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=nbhome-12'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=nbhome-10'; FEATURES.push(accountBackupFeature);
