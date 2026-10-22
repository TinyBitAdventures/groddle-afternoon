/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=flags-1';
import { hellFeature } from './hell-feature.js?v=hell-1';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=resource-nodes-1';
import { questOffersFeature } from './quest-offers-feature.js?v=offers-1';
import { meditationFeature } from './meditation-feature.js?v=meditation-1';
import { teleportationFeature } from './teleportation-feature.js?v=teleport-1';
import { racesFeature } from './races-feature.js?v=races-1';
import { crownsFeature } from './crowns-feature.js?v=crowns-1';
import { patchesFeature } from './patches-feature.js?v=patches-1';
import { foxesFeature } from './foxes-feature.js?v=foxes-1';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=kitties-1';
import { homesFeature } from './homes-feature.js?v=homes-1';
import { rookAttackFeature } from './rook-attack-feature.js?v=rooks-1';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=furniture-1';
import { doorsFeature } from './doors-feature.js?v=doors-1';
import { locationEventsFeature } from './location-events-feature.js?v=location-events-1';
import { puzzlesFeature } from './puzzles-feature.js?v=puzzles-1';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=puzzle-scenes-1';
import { streetJobsFeature } from './street-jobs-feature.js?v=jobs-1';
import { imaginationFeature } from './imagination-feature.js?v=imagination-1';
import { supplyFeature } from './supply-feature.js?v=supply-1';
import { giantIconsFeature } from './giant-icons-feature.js?v=icons-1';
import { rubeFeature } from './rube-feature.js?v=rube-1';
import { unlearningFeature } from './unlearning-feature.js?v=unlearn-1';
import { dropsFeature } from './drops-feature.js?v=drops-1';
import { masterGardenFeature } from './master-garden-feature.js?v=mastergarden-1';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=husbandry-1';
import { questInstancesFeature } from './quest-instances-feature.js?v=qi-1';
import { partySpacesFeature } from './party-spaces-feature.js?v=party-1';
import { seasonsFeature } from './seasons-feature.js?v=seasons-1';
import { cameraModeFeature } from './camera-mode-feature.js';
import { newxpFeature } from './newxp-feature.js?v=newxp-1';

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
import { smugglingFeature } from './smuggling-feature.js?v=smuggling-1'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=home-tower-1'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=secrets-1'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=musicblocks-1'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=shrine-hint-1'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=tower-rooms-1'; FEATURES.push(towerRoomsFeature);
