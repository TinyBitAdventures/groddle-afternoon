/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=flags-1';
import { hellFeature } from './hell-feature.js?v=hell-7';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=resource-nodes-5';
import { questOffersFeature } from './quest-offers-feature.js?v=offers-3';
import { meditationFeature } from './meditation-feature.js?v=g148-1';
import { teleportationFeature } from './teleportation-feature.js?v=teleport-2';
import { racesFeature } from './races-feature.js?v=g212-1';
import { crownsFeature } from './crowns-feature.js?v=g148-1';
import { patchesFeature } from './patches-feature.js?v=patches-7';
import { foxesFeature } from './foxes-feature.js?v=foxes-1';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=kitties-2';
import { homesFeature } from './homes-feature.js?v=homes-9';
import { rookAttackFeature } from './rook-attack-feature.js?v=g148-1';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=furniture-4';
import { doorsFeature } from './doors-feature.js?v=doors-2';
import { locationEventsFeature } from './location-events-feature.js?v=location-events-1';
import { puzzlesFeature } from './puzzles-feature.js?v=puzzles-2';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=g148-1';
import { streetJobsFeature } from './street-jobs-feature.js?v=g177-1';
import { imaginationFeature } from './imagination-feature.js?v=imagination-2';
import { supplyFeature } from './supply-feature.js?v=supply-4';
import { giantIconsFeature } from './giant-icons-feature.js?v=g202-1';
import { rubeFeature } from './rube-feature.js?v=rube-2';
import { unlearningFeature } from './unlearning-feature.js?v=unlearn-1';
import { dropsFeature } from './drops-feature.js?v=drops-1';
import { masterGardenFeature } from './master-garden-feature.js?v=mastergarden-1';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=g178-1';
import { questInstancesFeature } from './quest-instances-feature.js?v=qi-4';
import { partySpacesFeature } from './party-spaces-feature.js?v=party-2';
import { seasonsFeature } from './seasons-feature.js?v=g148-1';
import { cameraModeFeature } from './camera-mode-feature.js';
import { newxpFeature } from './newxp-feature.js?v=g148-1';

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
import { smugglingFeature } from './smuggling-feature.js?v=g200-1'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=home-tower-4'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=secrets-1'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=musicblocks-1'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=shrine-hint-2'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=tower-rooms-6'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=mid-tower-6'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=tree-death-4'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=g5-2'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=g39-3'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=g148-2'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=g148-2'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=g148-2'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=butler-feature-6'; FEATURES.push(butlerFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=g148-1'; FEATURES.push(pouchFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=hi-signs-2'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=g71-2'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=g95-3'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=g104-1'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=g105-1'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=g93-1'; FEATURES.push(vicarsPeakFeature);
import { subwayFeature } from './subway-feature.js?v=g115-1'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=g148-1'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=g178-2'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=g137-2'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=g122-1'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=g123-1'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=g148-1'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=g148-1'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=g139-1'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=g149-2'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=g150-1'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=g155-1'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=g154-3'; FEATURES.push(crabsFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=g140-2'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=g193-1'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=g171-1'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=g200-1'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=g200-1'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=g165-1'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=g202-1'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=g200-1'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=g190-1'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=g193-1'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=g202-1'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=g212-1'; FEATURES.push(quoinShardsFeature);
