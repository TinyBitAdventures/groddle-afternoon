/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=630ef674';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=55fb520d';
import { questOffersFeature } from './quest-offers-feature.js?v=db81cdfe';
import { meditationFeature } from './meditation-feature.js?v=9b55c57c';
import { teleportationFeature } from './teleportation-feature.js?v=b3761e3c';
import { racesFeature } from './races-feature.js?v=9d82b8d4';
import { mayhemFeature } from './mayhem-feature.js?v=a19df82d';
import { crownsFeature } from './crowns-feature.js?v=c35db685';
import { patchesFeature } from './patches-feature.js?v=df56eea7';
import { foxesFeature } from './foxes-feature.js?v=91ca8f96';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=70a4ddb8';
import { homesFeature } from './homes-feature.js?v=b7791aed';
import { rookAttackFeature } from './rook-attack-feature.js?v=ff660cea';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=a6143180';
import { doorsFeature } from './doors-feature.js?v=70e996b6';
import { locationEventsFeature } from './location-events-feature.js?v=0cda70ed';
import { puzzlesFeature } from './puzzles-feature.js?v=d47b5d92';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=61f1e634';
import { streetJobsFeature } from './street-jobs-feature.js?v=279ffab9';
import { imaginationFeature } from './imagination-feature.js?v=2b539c49';
import { supplyFeature } from './supply-feature.js?v=654cbb5c';
import { giantIconsFeature } from './giant-icons-feature.js?v=3527a3d9';
import { rubeFeature } from './rube-feature.js?v=22d86ad8';
import { unlearningFeature } from './unlearning-feature.js?v=da4e2b67';
import { dropsFeature } from './drops-feature.js?v=faf37e97';
import { masterGardenFeature } from './master-garden-feature.js?v=2d66a9d0';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=92e6c660';
import { questInstancesFeature } from './quest-instances-feature.js?v=d5c35ffc';
import { partySpacesFeature } from './party-spaces-feature.js?v=6943bc27';
import { seasonsFeature } from './seasons-feature.js?v=1f040bcf';
import { cameraModeFeature } from './camera-mode-feature.js?v=76d37712';
import { newxpFeature } from './newxp-feature.js?v=29983b14';
import { streetMinimapFeature } from './street-minimap-feature.js?v=192606ca';

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
import { smugglingFeature } from './smuggling-feature.js?v=693aaaeb'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=daf014b6'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=6b777de9'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=80c8b95f'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=f66c0b38'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=07830e97'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=2076fd33'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=b8c04443'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=006d658f'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=5454d2ea'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=b528393c'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=4a9c38a7'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=c178cc24'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=002f6959'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=0e0b7b30'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=9191c136'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=ae3e1fea'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=c7e9229b'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=f8f35b83'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=532aa712'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=683f809e'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=4134d212'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=426e7b2a'; FEATURES.push(rebuiltRoomsFeature);
import { interrogationRoomFeature } from './interrogation-room-feature.js?v=705548d0'; FEATURES.push(interrogationRoomFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=22c86408'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=92993d70'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=f7730e5a'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=c3e8bb0e'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=9c6b2462'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=7757ea41'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=b4d79e40'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=eb6ae66d'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=d09d19f6'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=dc7ce7f4'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=655072fa'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=9298f978'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=a18f76e6'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=91fbddd6'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=b145f824'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=66ad74aa'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=cfc0c7cf'; FEATURES.push(gardenGuanoFeature);
import { worldDropFeature } from './world-drop-feature.js?v=f42f2350'; FEATURES.push(worldDropFeature);
import { gardenNoticesFeature } from './garden-notices-feature.js?v=1f871236'; FEATURES.push(gardenNoticesFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=bb4d96af'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=82384917'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=dd0f655d'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=af1f6393'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=2bf5970b'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=0304fecc'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=7884d418'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=80fa57c1'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=cb0b118e'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=5dad6c80'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=f357073f'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=017fb596'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=72016786'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=87056c64'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=55780769'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=09cab6b6'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=ae589bdd'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=8a7aef48'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=df173f92'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=ba429761'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=bb657c20'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=485b2758'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=f5cf6f95'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=97657d4c'; FEATURES.push(questsMpFeature);
import { peatQuestMpFeature } from './peat-quest-mp-feature.js?v=e45b40cb'; FEATURES.push(peatQuestMpFeature);
import { groupsFeature } from './groups-feature.js?v=a7154b8c'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=840e82bc'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=d496bbbd'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=54ab9f11'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=012de487'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=d5bd1087'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=2f606191'; FEATURES.push(dropsMpFeature);
import { doorKeysFeature } from './door-keys-feature.js?v=c17deb02'; FEATURES.push(doorKeysFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=16568303'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=0ef95c18'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=b1ab090b'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=19ce1e27'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=46a58896'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=6798e140'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=39acfc98'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=385cca2b'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=df216a85'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=59a6e5fd'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=5e6adea3'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=814bf62d'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=dd196e17'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=ea8cf432'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=e4aca171'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=c672a934'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=704d27da'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=7aa3ad1c'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=8389fe76'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=b8440eb4'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=21f43bdd'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=662f759b'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=2507feab'; FEATURES.push(collectionTrophiesFeature);
import { recipeMemoryFeature } from './recipe-memory-feature.js?v=5e8e35eb'; FEATURES.push(recipeMemoryFeature);
import { sharedGardensFeature } from './shared-gardens-feature.js?v=1d8c62fb'; FEATURES.push(sharedGardensFeature);
import { sharedPatchesFeature } from './shared-patches-feature.js?v=4ec26f26'; FEATURES.push(sharedPatchesFeature);
import { cubimalBattleFeature } from './cubimal-battle-feature.js?v=f91e89d9'; FEATURES.push(cubimalBattleFeature);
import { chatPurgeFeature } from './chat-purge-feature.js?v=cb6c250d'; FEATURES.push(chatPurgeFeature);
import { streetFixesFeature } from './street-fixes-feature.js?v=39e41b46'; FEATURES.push(streetFixesFeature);
import { chickenScareFeature } from './chicken-scare-feature.js?v=04c711ca'; FEATURES.push(chickenScareFeature);
import { gameTeleporterFeature } from './game-teleporter-feature.js?v=6d41ad04'; FEATURES.push(gameTeleporterFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=01bf4fff'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=4fe86726'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=152a9ca0'; FEATURES.push(accountBackupFeature);
