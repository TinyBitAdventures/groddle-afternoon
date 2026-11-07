/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=13196575';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=af4c5520';
import { questOffersFeature } from './quest-offers-feature.js?v=9406a75d';
import { meditationFeature } from './meditation-feature.js?v=14741c17';
import { teleportationFeature } from './teleportation-feature.js?v=8a9ee900';
import { racesFeature } from './races-feature.js?v=cf2b808e';
import { mayhemFeature } from './mayhem-feature.js?v=bf288afa';
import { crownsFeature } from './crowns-feature.js?v=23979d63';
import { patchesFeature } from './patches-feature.js?v=c0adb8fb';
import { foxesFeature } from './foxes-feature.js?v=8d6265ce';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=2490269c';
import { homesFeature } from './homes-feature.js?v=548bcb72';
import { rookAttackFeature } from './rook-attack-feature.js?v=c56ce4a4';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=d59e2a7a';
import { doorsFeature } from './doors-feature.js?v=d5a94b32';
import { locationEventsFeature } from './location-events-feature.js?v=0966e395';
import { puzzlesFeature } from './puzzles-feature.js?v=1d577ff5';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=37d78c06';
import { streetJobsFeature } from './street-jobs-feature.js?v=bf5cc4f7';
import { imaginationFeature } from './imagination-feature.js?v=0589acce';
import { supplyFeature } from './supply-feature.js?v=e5a255b4';
import { giantIconsFeature } from './giant-icons-feature.js?v=920a0d00';
import { rubeFeature } from './rube-feature.js?v=0c2a3c93';
import { unlearningFeature } from './unlearning-feature.js?v=30560d19';
import { dropsFeature } from './drops-feature.js?v=43984e8f';
import { masterGardenFeature } from './master-garden-feature.js?v=2f6d6291';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=d8880ee3';
import { questInstancesFeature } from './quest-instances-feature.js?v=fba6f510';
import { partySpacesFeature } from './party-spaces-feature.js?v=a287ae6a';
import { seasonsFeature } from './seasons-feature.js?v=74835b6b';
import { cameraModeFeature } from './camera-mode-feature.js?v=ad1ae5ea';
import { newxpFeature } from './newxp-feature.js?v=6b77c529';
import { streetMinimapFeature } from './street-minimap-feature.js?v=18324074';

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
import { smugglingFeature } from './smuggling-feature.js?v=594d138e'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=4867d52a'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=9c9fd1e4'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=0885e42f'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=609ad00b'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=ac0a49ae'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=b1b79cdd'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=da52335c'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=a5385534'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=68cf981d'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=f6f1d2c6'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=85d80bde'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=0a63c072'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=936557af'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=83339c6a'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=734414e5'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=3fbac957'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=f7229944'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=a59dcfa8'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=8ff3d175'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=59145efa'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=37f51085'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=8baf41e0'; FEATURES.push(rebuiltRoomsFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=ff38d0da'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=eda2f2b4'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=fbc30481'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=cd31e78b'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=b014162c'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=4eb882c5'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=c10ef817'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=ea514c53'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=bffd81ef'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=0d357a24'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=d36b081b'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=31d1365f'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=efd458ca'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=47b82bac'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=800c512f'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=ae1d83ed'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=23300651'; FEATURES.push(gardenGuanoFeature);
import { gardenNoticesFeature } from './garden-notices-feature.js?v=dd2755c2'; FEATURES.push(gardenNoticesFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=f9b131f0'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=cca5db71'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=3a49a662'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=490b5d7e'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=a3a44310'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=09516fab'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=2c4acc19'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=71f5190d'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=6723ed7b'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=ee944692'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=58472446'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=b043ef2b'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=2fc22b4f'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=6817a676'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=f6f26a75'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=1816a8f4'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=3a7cf4c6'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=9ece295c'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=626cda18'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=66d50ed1'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=40edf322'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=a3f4c9fd'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=ac8c3f22'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=46d08238'; FEATURES.push(questsMpFeature);
import { peatQuestMpFeature } from './peat-quest-mp-feature.js?v=598ae7c4'; FEATURES.push(peatQuestMpFeature);
import { groupsFeature } from './groups-feature.js?v=fc5b2a50'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=a6973ad4'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=a5e7ecbb'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=0ad8852b'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=674ebe1d'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=dd222238'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=86f4a798'; FEATURES.push(dropsMpFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=8689ae18'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=be28caeb'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=af1f6f19'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=25e93d3d'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=1abbd09c'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=0a54205d'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=338e121b'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=6e7192f8'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=feed8530'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=52517603'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=de9963b2'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=38cfe4e8'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=eef3178d'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=60d98107'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=16659128'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=96309267'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=822b67e3'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=c7f00a33'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=ab3dbbd0'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=db7445b9'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=e4311d0b'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=c357c3ad'; FEATURES.push(collectionTrophiesFeature);
import { recipeMemoryFeature } from './recipe-memory-feature.js?v=7a403966'; FEATURES.push(recipeMemoryFeature);
import { sharedGardensFeature } from './shared-gardens-feature.js?v=50746a5c'; FEATURES.push(sharedGardensFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=06fc7f80'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=8f92f5fb'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=48101765'; FEATURES.push(accountBackupFeature);
