/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=flags-1';
import { hellFeature } from './hell-feature.js?v=hell-9';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=resource-nodes-6';
import { questOffersFeature } from './quest-offers-feature.js?v=offers-9';
import { meditationFeature } from './meditation-feature.js?v=g259-1';
import { teleportationFeature } from './teleportation-feature.js?v=teleport-5';
import { racesFeature } from './races-feature.js?v=card-3';
import { crownsFeature } from './crowns-feature.js?v=g259-1';
import { patchesFeature } from './patches-feature.js?v=patches-8';
import { foxesFeature } from './foxes-feature.js?v=foxes-2';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=kitties-2';
import { homesFeature } from './homes-feature.js?v=homes-15';
import { rookAttackFeature } from './rook-attack-feature.js?v=g259-1';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=furniture-13';
import { doorsFeature } from './doors-feature.js?v=doors-3';
import { locationEventsFeature } from './location-events-feature.js?v=location-events-3';
import { puzzlesFeature } from './puzzles-feature.js?v=puzzles-4';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=g259-1';
import { streetJobsFeature } from './street-jobs-feature.js?v=g259-1';
import { imaginationFeature } from './imagination-feature.js?v=imagination-5';
import { supplyFeature } from './supply-feature.js?v=supply-5';
import { giantIconsFeature } from './giant-icons-feature.js?v=g259-1';
import { rubeFeature } from './rube-feature.js?v=rube-4';
import { unlearningFeature } from './unlearning-feature.js?v=unlearn-1';
import { dropsFeature } from './drops-feature.js?v=drops-2';
import { masterGardenFeature } from './master-garden-feature.js?v=mastergarden-2';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=g259-1';
import { questInstancesFeature } from './quest-instances-feature.js?v=qi-8';
import { partySpacesFeature } from './party-spaces-feature.js?v=party-4';
import { seasonsFeature } from './seasons-feature.js?v=play-3';
import { cameraModeFeature } from './camera-mode-feature.js?v=g231-1';
import { newxpFeature } from './newxp-feature.js?v=g255-1';

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
import { smugglingFeature } from './smuggling-feature.js?v=card-2'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=home-tower-8'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=secrets-1'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=musicblocks-1'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=shrine-hint-3'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=tower-rooms-7'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=mid-tower-6'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=tree-death-5'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=g5-2'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=g259-1'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=g259-1'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=g255-1'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=g259-1'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=butler-feature-12'; FEATURES.push(butlerFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=g259-1'; FEATURES.push(pouchFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=hi-signs-8'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=g71-2'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=g259-1'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=g104-1'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=g105-1'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=g93-1'; FEATURES.push(vicarsPeakFeature);
import { subwayFeature } from './subway-feature.js?v=play-2'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=g259-1'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=g259-1'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=g259-1'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=g259-1'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=g259-1'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=card-3'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=g259-1'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=play-1'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=card-4'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=g259-1'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=card-5'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=g259-1'; FEATURES.push(crabsFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=g259-1'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=g259-1'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=g259-1'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=g259-1'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=g255-1'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=g259-1'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=lonely-2'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=lonely-2'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=g259-1'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=g259-1'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=g259-1'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=g227-1'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=g259-1'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=g225-1'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=lonely-3'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=g259-1'; FEATURES.push(funpickleFeature);
