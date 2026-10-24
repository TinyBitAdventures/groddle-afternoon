/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=flags-1';
import { hellFeature } from './hell-feature.js?v=hell-1';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=resource-nodes-2';
import { questOffersFeature } from './quest-offers-feature.js?v=offers-1';
import { meditationFeature } from './meditation-feature.js?v=meditation-2';
import { teleportationFeature } from './teleportation-feature.js?v=teleport-1';
import { racesFeature } from './races-feature.js?v=races-5';
import { crownsFeature } from './crowns-feature.js?v=crowns-4';
import { patchesFeature } from './patches-feature.js?v=patches-5';
import { foxesFeature } from './foxes-feature.js?v=foxes-1';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=kitties-1';
import { homesFeature } from './homes-feature.js?v=homes-7';
import { rookAttackFeature } from './rook-attack-feature.js?v=rooks-2';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=furniture-1';
import { doorsFeature } from './doors-feature.js?v=doors-2';
import { locationEventsFeature } from './location-events-feature.js?v=location-events-1';
import { puzzlesFeature } from './puzzles-feature.js?v=puzzles-2';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=puzzle-scenes-1';
import { streetJobsFeature } from './street-jobs-feature.js?v=jobs-4';
import { imaginationFeature } from './imagination-feature.js?v=imagination-1';
import { supplyFeature } from './supply-feature.js?v=supply-2';
import { giantIconsFeature } from './giant-icons-feature.js?v=icons-1';
import { rubeFeature } from './rube-feature.js?v=rube-1';
import { unlearningFeature } from './unlearning-feature.js?v=unlearn-1';
import { dropsFeature } from './drops-feature.js?v=drops-1';
import { masterGardenFeature } from './master-garden-feature.js?v=mastergarden-1';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=husbandry-1';
import { questInstancesFeature } from './quest-instances-feature.js?v=qi-3';
import { partySpacesFeature } from './party-spaces-feature.js?v=party-2';
import { seasonsFeature } from './seasons-feature.js?v=seasons-3';
import { cameraModeFeature } from './camera-mode-feature.js';
import { newxpFeature } from './newxp-feature.js?v=newxp-2';

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
import { smugglingFeature } from './smuggling-feature.js?v=smuggling-2'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=home-tower-2'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=secrets-1'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=musicblocks-1'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=shrine-hint-2'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=tower-rooms-6'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=mid-tower-6'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=tree-death-4'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=g5-1'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=g39-3'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=craftybot-3'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=mood-decay-1'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=g57-2'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=butler-feature-4'; FEATURES.push(butlerFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=g83-1'; FEATURES.push(pouchFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=hi-signs-1'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=g71-2'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=g95-2'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=g104-1'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=g105-1'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=g93-1'; FEATURES.push(vicarsPeakFeature);
