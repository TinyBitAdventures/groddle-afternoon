/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=b9770c5a';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=435b011f';
import { questOffersFeature } from './quest-offers-feature.js?v=7c77bd57';
import { meditationFeature } from './meditation-feature.js?v=36624ab9';
import { teleportationFeature } from './teleportation-feature.js?v=bf2b1aab';
import { racesFeature } from './races-feature.js?v=d5ceb31b';
import { mayhemFeature } from './mayhem-feature.js?v=249f7c8a';
import { crownsFeature } from './crowns-feature.js?v=8874c929';
import { patchesFeature } from './patches-feature.js?v=962cc631';
import { foxesFeature } from './foxes-feature.js?v=d1a6ea18';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=1fb9c6eb';
import { homesFeature } from './homes-feature.js?v=4e8a703f';
import { rookAttackFeature } from './rook-attack-feature.js?v=5ed2c389';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=045d95af';
import { doorsFeature } from './doors-feature.js?v=a6b359ce';
import { locationEventsFeature } from './location-events-feature.js?v=0cda70ed';
import { puzzlesFeature } from './puzzles-feature.js?v=d47b5d92';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=1d9fab6e';
import { streetJobsFeature } from './street-jobs-feature.js?v=de835505';
import { imaginationFeature } from './imagination-feature.js?v=c425a6c8';
import { supplyFeature } from './supply-feature.js?v=79a59bf4';
import { giantIconsFeature } from './giant-icons-feature.js?v=c71d5fa8';
import { rubeFeature } from './rube-feature.js?v=225aba8d';
import { unlearningFeature } from './unlearning-feature.js?v=da4e2b67';
import { dropsFeature } from './drops-feature.js?v=8220fd90';
import { masterGardenFeature } from './master-garden-feature.js?v=4d4ec7f9';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=0640908d';
import { questInstancesFeature } from './quest-instances-feature.js?v=82fb45d1';
import { partySpacesFeature } from './party-spaces-feature.js?v=d7ab9d4e';
import { seasonsFeature } from './seasons-feature.js?v=836b8140';
import { cameraModeFeature } from './camera-mode-feature.js?v=6c0a4b7a';
import { newxpFeature } from './newxp-feature.js?v=29919fbb';
import { streetMinimapFeature } from './street-minimap-feature.js?v=d5a16dd2';

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
import { smugglingFeature } from './smuggling-feature.js?v=2241fa68'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=4ec55e06'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=8807bf43'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=c2974321'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=61369d9c'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=e673dee3'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=9d8f8e74'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=b9be4ab6'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=6e9ebdd4'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=af0ed5d2'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=9f858472'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=38a78e57'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=8e800186'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=61f6e9e6'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=136a8e8b'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=5103013d'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=9ea775b6'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=7a02b4af'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=13bff828'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=b82c6d28'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=683f809e'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=0db1755c'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=426e7b2a'; FEATURES.push(rebuiltRoomsFeature);
import { interrogationRoomFeature } from './interrogation-room-feature.js?v=705548d0'; FEATURES.push(interrogationRoomFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=cca3a471'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=9f901d06'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=b60f440c'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=c30a5b0e'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=cb707833'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=715e5320'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=3eb7022e'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=7d5038ba'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=26bd6f08'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=9ab7f79a'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=71c7f816'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=fa1d552e'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=0a596900'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=d46e8f6a'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=9683d829'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=4c3db7ff'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=ea27d332'; FEATURES.push(gardenGuanoFeature);
import { worldDropFeature } from './world-drop-feature.js?v=1d33b6bc'; FEATURES.push(worldDropFeature);
import { gardenNoticesFeature } from './garden-notices-feature.js?v=36409264'; FEATURES.push(gardenNoticesFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=671b3abb'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=a4da6b55'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=42222f0d'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=8fdf7e0b'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=4f7e4463'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=95e94bd2'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=beb13d86'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=3bee6cfe'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=95e4b707'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=6cf9f74f'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=1ab5ccb0'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=ab9681a0'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=e4c02c0a'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=8c3cc5a1'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=9ee955ba'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=fef34df7'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=ae589bdd'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=8a7aef48'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=16ab7e02'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=0b125f6c'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=bb657c20'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=c25d1d42'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=3127d63c'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=30f1ffbb'; FEATURES.push(questsMpFeature);
import { peatQuestMpFeature } from './peat-quest-mp-feature.js?v=d29844a7'; FEATURES.push(peatQuestMpFeature);
import { groupsFeature } from './groups-feature.js?v=41cf0335'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=fa465818'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=0a6e302e'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=35d128b3'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=012de487'; FEATURES.push(followMpFeature);
import { summonMpFeature } from './summon-mp-feature.js?v=6389f111'; FEATURES.push(summonMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=d5bd1087'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=a9315b0e'; FEATURES.push(dropsMpFeature);
import { doorKeysFeature } from './door-keys-feature.js?v=195444bc'; FEATURES.push(doorKeysFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=9b377863'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=991c33c7'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=5489a679'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=097d9407'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=cdf253eb'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=6798e140'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=240eafeb'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=348462af'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=dc3fa558'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=c2b5a04e'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=e203b4c6'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=4245e81b'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=dd196e17'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=bd59565e'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=1f0caea4'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=c672a934'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=704d27da'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=7aa3ad1c'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=8389fe76'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=a9719601'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=99bd8aa7'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=574f67d2'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=6dbc852b'; FEATURES.push(collectionTrophiesFeature);
import { recipeMemoryFeature } from './recipe-memory-feature.js?v=b25dfe49'; FEATURES.push(recipeMemoryFeature);
import { sharedGardensFeature } from './shared-gardens-feature.js?v=0259921f'; FEATURES.push(sharedGardensFeature);
import { sharedPatchesFeature } from './shared-patches-feature.js?v=30df8e52'; FEATURES.push(sharedPatchesFeature);
import { cubimalBattleFeature } from './cubimal-battle-feature.js?v=562c2ef4'; FEATURES.push(cubimalBattleFeature);
import { chatPurgeFeature } from './chat-purge-feature.js?v=cb6c250d'; FEATURES.push(chatPurgeFeature);
import { streetFixesFeature } from './street-fixes-feature.js?v=39e41b46'; FEATURES.push(streetFixesFeature);
import { chickenScareFeature } from './chicken-scare-feature.js?v=dcb84271'; FEATURES.push(chickenScareFeature);
import { gameTeleporterFeature } from './game-teleporter-feature.js?v=b8d1ce19'; FEATURES.push(gameTeleporterFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=a15d9885'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=411a239d'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=29998316'; FEATURES.push(accountBackupFeature);
