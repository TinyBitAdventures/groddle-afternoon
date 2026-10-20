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
];
