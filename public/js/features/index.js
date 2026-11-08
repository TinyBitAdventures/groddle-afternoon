/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=93f1c8dd';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=6f009751';
import { questOffersFeature } from './quest-offers-feature.js?v=20fc0cc0';
import { meditationFeature } from './meditation-feature.js?v=32f475d1';
import { teleportationFeature } from './teleportation-feature.js?v=627cf405';
import { racesFeature } from './races-feature.js?v=8cfe6cb4';
import { mayhemFeature } from './mayhem-feature.js?v=5a166283';
import { crownsFeature } from './crowns-feature.js?v=728e36d9';
import { patchesFeature } from './patches-feature.js?v=91433cb0';
import { foxesFeature } from './foxes-feature.js?v=99db327a';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=7a82dd14';
import { homesFeature } from './homes-feature.js?v=7132ef0d';
import { rookAttackFeature } from './rook-attack-feature.js?v=3a229a28';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=bc6bf685';
import { doorsFeature } from './doors-feature.js?v=143f00d3';
import { locationEventsFeature } from './location-events-feature.js?v=0062e032';
import { puzzlesFeature } from './puzzles-feature.js?v=6834b43d';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=ad67ddaa';
import { streetJobsFeature } from './street-jobs-feature.js?v=fe350f5a';
import { imaginationFeature } from './imagination-feature.js?v=251a7aa3';
import { supplyFeature } from './supply-feature.js?v=ab1afede';
import { giantIconsFeature } from './giant-icons-feature.js?v=e9ef10f4';
import { rubeFeature } from './rube-feature.js?v=e131eebe';
import { unlearningFeature } from './unlearning-feature.js?v=122a06ac';
import { dropsFeature } from './drops-feature.js?v=0b8ff8c1';
import { masterGardenFeature } from './master-garden-feature.js?v=31210d0a';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=711c93ca';
import { questInstancesFeature } from './quest-instances-feature.js?v=5751ef70';
import { partySpacesFeature } from './party-spaces-feature.js?v=00d7bcb9';
import { seasonsFeature } from './seasons-feature.js?v=22036f4f';
import { cameraModeFeature } from './camera-mode-feature.js?v=e367ad68';
import { newxpFeature } from './newxp-feature.js?v=cd723acc';
import { streetMinimapFeature } from './street-minimap-feature.js?v=579f6c4f';

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
import { smugglingFeature } from './smuggling-feature.js?v=786cadcb'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=a2a28a4d'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=aed48abb'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=5aeba913'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=58a4f21a'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=78ed7778'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=43a0ff88'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=b7dd8544'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=d2f8de4d'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=31e7a396'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=8d5d4f00'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=9bfc0c48'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=8d28e28b'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=97743ea1'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=b23d193a'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=52e45e2a'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=1a8252c1'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=679fa035'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=5a060918'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=02dc6a2e'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=59145efa'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=f10cb41f'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=514604e6'; FEATURES.push(rebuiltRoomsFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=3177b18d'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=63fee44a'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=6ad4908d'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=b20d7479'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=7d56f3be'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=eb42483d'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=ce782ab3'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=ccd32c25'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=f3a8a8eb'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=7507d5fd'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=0be229fa'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=2a8be58a'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=a309127e'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=88a1aa90'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=1a9cb4ff'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=a72af4b5'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=b0d27805'; FEATURES.push(gardenGuanoFeature);
import { gardenNoticesFeature } from './garden-notices-feature.js?v=b1253a86'; FEATURES.push(gardenNoticesFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=197a99b9'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=5fc10558'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=74488fb0'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=d9d8aadb'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=56518147'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=32e75025'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=c039ff5b'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=69491996'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=8d1cfb76'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=dd2a0af9'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=5b069291'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=017fb596'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=f71a4932'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=9eb19176'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=17920508'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=b996e39f'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=4d88a80e'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=b1ae6211'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=566961a9'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=42ffd03e'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=926c0446'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=6005f50b'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=c2198494'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=c7057d57'; FEATURES.push(questsMpFeature);
import { peatQuestMpFeature } from './peat-quest-mp-feature.js?v=4ee9914f'; FEATURES.push(peatQuestMpFeature);
import { groupsFeature } from './groups-feature.js?v=52d21208'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=0ffc4fea'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=1ac1b91d'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=85525568'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=9152f8b5'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=f26b2ae3'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=85d71d4f'; FEATURES.push(dropsMpFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=3b268f68'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=680d7750'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=abbc726c'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=c2d9862b'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=285fc464'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=83bbd4d8'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=3c2f93c2'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=fda233db'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=32ca767c'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=258f925b'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=b306ed45'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=38cfe4e8'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=8399f1f5'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=ba4d48dc'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=063a9a4c'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=96309267'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=591b989a'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=7ad7355e'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=de8ecb80'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=8ae4e04e'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=d830c125'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=bb848f8f'; FEATURES.push(collectionTrophiesFeature);
import { recipeMemoryFeature } from './recipe-memory-feature.js?v=b88942c4'; FEATURES.push(recipeMemoryFeature);
import { sharedGardensFeature } from './shared-gardens-feature.js?v=5746cd6d'; FEATURES.push(sharedGardensFeature);
import { sharedPatchesFeature } from './shared-patches-feature.js?v=4e1623eb'; FEATURES.push(sharedPatchesFeature);
import { cubimalBattleFeature } from './cubimal-battle-feature.js?v=a5f103b0'; FEATURES.push(cubimalBattleFeature);
import { gameTeleporterFeature } from './game-teleporter-feature.js?v=cc541350'; FEATURES.push(gameTeleporterFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=636d7e3a'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=1ca263fd'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=3efe5c17'; FEATURES.push(accountBackupFeature);
