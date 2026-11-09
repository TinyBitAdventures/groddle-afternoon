/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=ba4199c6';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=af34bbb5';
import { questOffersFeature } from './quest-offers-feature.js?v=db81cdfe';
import { meditationFeature } from './meditation-feature.js?v=5114e225';
import { teleportationFeature } from './teleportation-feature.js?v=e867c103';
import { racesFeature } from './races-feature.js?v=a06da3bc';
import { mayhemFeature } from './mayhem-feature.js?v=50ea12e9';
import { crownsFeature } from './crowns-feature.js?v=da80d222';
import { patchesFeature } from './patches-feature.js?v=b043f683';
import { foxesFeature } from './foxes-feature.js?v=b6d174c1';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=4f8d0ea0';
import { homesFeature } from './homes-feature.js?v=aca728d5';
import { rookAttackFeature } from './rook-attack-feature.js?v=743c7875';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=ed2df641';
import { doorsFeature } from './doors-feature.js?v=48eaa933';
import { locationEventsFeature } from './location-events-feature.js?v=0062e032';
import { puzzlesFeature } from './puzzles-feature.js?v=6687bad8';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=309b6411';
import { streetJobsFeature } from './street-jobs-feature.js?v=09bad030';
import { imaginationFeature } from './imagination-feature.js?v=b8cbfae4';
import { supplyFeature } from './supply-feature.js?v=7a23afd4';
import { giantIconsFeature } from './giant-icons-feature.js?v=a7b97342';
import { rubeFeature } from './rube-feature.js?v=2636c9e3';
import { unlearningFeature } from './unlearning-feature.js?v=122a06ac';
import { dropsFeature } from './drops-feature.js?v=7f45f07f';
import { masterGardenFeature } from './master-garden-feature.js?v=cc311208';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=e5481158';
import { questInstancesFeature } from './quest-instances-feature.js?v=be3f6816';
import { partySpacesFeature } from './party-spaces-feature.js?v=dd85528b';
import { seasonsFeature } from './seasons-feature.js?v=9817a5fb';
import { cameraModeFeature } from './camera-mode-feature.js?v=33da0f2a';
import { newxpFeature } from './newxp-feature.js?v=3bfe48b6';
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
import { smugglingFeature } from './smuggling-feature.js?v=d8661f75'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=f574b637'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=7d17e271'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=2a6cbea5'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=f4d96ba3'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=c50804dc'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=997cf9ae'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=49520e5c'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=c0ab4a69'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=fc903f71'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=6d437cbe'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=9d946eab'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=4daaa7fc'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=c5b8a0df'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=7201ed13'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=97073c18'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=bd95f07e'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=4a9e67f4'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=1b84ec08'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=b51ffb02'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=4faefda8'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=1b6988f8'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=514604e6'; FEATURES.push(rebuiltRoomsFeature);
import { interrogationRoomFeature } from './interrogation-room-feature.js?v=abce8d45'; FEATURES.push(interrogationRoomFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=d890b36b'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=03d6af33'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=98d91cb9'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=e062cd0e'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=7f1bb055'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=a0746048'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=bffb2ac2'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=a2281d36'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=c9572a8e'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=334fb13d'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=ee2969a4'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=40b03eb4'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=f889f244'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=ac022a87'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=6b68c8e0'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=237138fa'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=404cbf75'; FEATURES.push(gardenGuanoFeature);
import { worldDropFeature } from './world-drop-feature.js?v=b2cf4e2b'; FEATURES.push(worldDropFeature);
import { gardenNoticesFeature } from './garden-notices-feature.js?v=73a7d383'; FEATURES.push(gardenNoticesFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=9be56a77'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=68c793a5'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=cdd35020'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=af1f6393'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=f539c8d4'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=7bf3ae78'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=aa61108f'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=527a9856'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=a5ce9abb'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=dd2a0af9'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=772752b5'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=017fb596'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=c39253fa'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=dea7f1fc'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=979864a3'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=00f5b8b6'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=3690cf08'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=b1ae6211'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=58347655'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=ceda1626'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=9a7b87b6'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=ba9c9e2d'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=5ea53501'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=97657d4c'; FEATURES.push(questsMpFeature);
import { peatQuestMpFeature } from './peat-quest-mp-feature.js?v=626782be'; FEATURES.push(peatQuestMpFeature);
import { groupsFeature } from './groups-feature.js?v=33286053'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=e0de13ee'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=72f25053'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=c9285772'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=294a6205'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=3bb3202a'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=d11ef273'; FEATURES.push(dropsMpFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=fd9a0a31'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=680d7750'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=06fed474'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=ccc9350b'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=183738d7'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=813d7303'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=3e2c6838'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=05b14135'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=0225a857'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=6dff3574'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=05603c52'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=5e3b2521'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=6fc872ed'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=6f86e8cb'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=cc105ae8'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=96309267'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=a1049d64'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=7ad7355e'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=fe50f90a'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=d7f5a759'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=347dfafa'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=a54215da'; FEATURES.push(collectionTrophiesFeature);
import { recipeMemoryFeature } from './recipe-memory-feature.js?v=7bd61f92'; FEATURES.push(recipeMemoryFeature);
import { sharedGardensFeature } from './shared-gardens-feature.js?v=0f69ec43'; FEATURES.push(sharedGardensFeature);
import { sharedPatchesFeature } from './shared-patches-feature.js?v=c353f6fe'; FEATURES.push(sharedPatchesFeature);
import { cubimalBattleFeature } from './cubimal-battle-feature.js?v=d84ba1f1'; FEATURES.push(cubimalBattleFeature);
import { chatPurgeFeature } from './chat-purge-feature.js?v=cb6c250d'; FEATURES.push(chatPurgeFeature);
import { gameTeleporterFeature } from './game-teleporter-feature.js?v=ca9bc29c'; FEATURES.push(gameTeleporterFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=ddc43409'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=d90ae938'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=3efe5c17'; FEATURES.push(accountBackupFeature);
