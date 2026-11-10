/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=ba4199c6';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=e39701d5';
import { questOffersFeature } from './quest-offers-feature.js?v=db81cdfe';
import { meditationFeature } from './meditation-feature.js?v=5114e225';
import { teleportationFeature } from './teleportation-feature.js?v=e867c103';
import { racesFeature } from './races-feature.js?v=862b3f62';
import { mayhemFeature } from './mayhem-feature.js?v=50ea12e9';
import { crownsFeature } from './crowns-feature.js?v=da80d222';
import { patchesFeature } from './patches-feature.js?v=b043f683';
import { foxesFeature } from './foxes-feature.js?v=b6d174c1';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=78707ab9';
import { homesFeature } from './homes-feature.js?v=b636b982';
import { rookAttackFeature } from './rook-attack-feature.js?v=8f50ee28';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=1b2d1c32';
import { doorsFeature } from './doors-feature.js?v=14e8a8ea';
import { locationEventsFeature } from './location-events-feature.js?v=0062e032';
import { puzzlesFeature } from './puzzles-feature.js?v=82380a1e';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=46570fdd';
import { streetJobsFeature } from './street-jobs-feature.js?v=62a66cae';
import { imaginationFeature } from './imagination-feature.js?v=19c3a230';
import { supplyFeature } from './supply-feature.js?v=7a23afd4';
import { giantIconsFeature } from './giant-icons-feature.js?v=4937e0dc';
import { rubeFeature } from './rube-feature.js?v=2636c9e3';
import { unlearningFeature } from './unlearning-feature.js?v=122a06ac';
import { dropsFeature } from './drops-feature.js?v=6c5ec616';
import { masterGardenFeature } from './master-garden-feature.js?v=71c046e3';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=81001e0b';
import { questInstancesFeature } from './quest-instances-feature.js?v=cb21105d';
import { partySpacesFeature } from './party-spaces-feature.js?v=dd85528b';
import { seasonsFeature } from './seasons-feature.js?v=0ce5faa1';
import { cameraModeFeature } from './camera-mode-feature.js?v=33da0f2a';
import { newxpFeature } from './newxp-feature.js?v=f170bb3c';
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
import { smugglingFeature } from './smuggling-feature.js?v=a4288ae3'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=f574b637'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=f2691f79'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=2a6cbea5'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=3b809d5f'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=22a9d42e'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=a6fcf523'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=49520e5c'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=c0ab4a69'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=f4eb2340'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=cd6d9de6'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=b3567246'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=9500d777'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=3e89280f'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=ec43144f'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=84cf708f'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=bd95f07e'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=e429e30b'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=bc075168'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=9509cf65'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=4faefda8'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=8475c970'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=514604e6'; FEATURES.push(rebuiltRoomsFeature);
import { interrogationRoomFeature } from './interrogation-room-feature.js?v=abce8d45'; FEATURES.push(interrogationRoomFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=8d036336'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=ea60fdba'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=98d91cb9'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=2181582d'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=7f1bb055'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=a0746048'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=21b93d93'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=6e04ce8d'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=06341678'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=c7596cc7'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=d489bfe0'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=0bc7d695'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=b09f1b5f'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=ac022a87'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=6b68c8e0'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=49d1b1f4'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=c04f0d4b'; FEATURES.push(gardenGuanoFeature);
import { worldDropFeature } from './world-drop-feature.js?v=b2cf4e2b'; FEATURES.push(worldDropFeature);
import { gardenNoticesFeature } from './garden-notices-feature.js?v=1201a8fb'; FEATURES.push(gardenNoticesFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=c9933c71'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=a9655d2f'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=6d95fbe2'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=af1f6393'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=bfc9b5a7'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=0afc3644'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=aa61108f'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=bad46489'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=a5ce9abb'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=602b78f7'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=772752b5'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=017fb596'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=c39253fa'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=dea7f1fc'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=979864a3'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=62ec4b34'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=3690cf08'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=0a712259'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=58347655'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=ceda1626'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=cea4455f'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=e9ef3b6c'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=fca4343f'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=97657d4c'; FEATURES.push(questsMpFeature);
import { peatQuestMpFeature } from './peat-quest-mp-feature.js?v=626782be'; FEATURES.push(peatQuestMpFeature);
import { groupsFeature } from './groups-feature.js?v=33286053'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=c19f6eb0'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=72f25053'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=c9285772'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=294a6205'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=3bb3202a'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=dfa23fc7'; FEATURES.push(dropsMpFeature);
import { doorKeysFeature } from './door-keys-feature.js?v=c17deb02'; FEATURES.push(doorKeysFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=9ed04dd5'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=249f473f'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=06fed474'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=ccc9350b'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=f6c2cd57'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=813d7303'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=1fd3eab2'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=28e64291'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=27dff207'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=6dff3574'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=05603c52'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=8c6a095d'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=6fc872ed'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=1e9fe330'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=cc105ae8'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=96309267'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=a1049d64'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=7ad7355e'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=4d5cc889'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=d7f5a759'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=7ece20fa'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=a54215da'; FEATURES.push(collectionTrophiesFeature);
import { recipeMemoryFeature } from './recipe-memory-feature.js?v=7bd61f92'; FEATURES.push(recipeMemoryFeature);
import { sharedGardensFeature } from './shared-gardens-feature.js?v=1564bf79'; FEATURES.push(sharedGardensFeature);
import { sharedPatchesFeature } from './shared-patches-feature.js?v=c353f6fe'; FEATURES.push(sharedPatchesFeature);
import { cubimalBattleFeature } from './cubimal-battle-feature.js?v=513f11ac'; FEATURES.push(cubimalBattleFeature);
import { chatPurgeFeature } from './chat-purge-feature.js?v=cb6c250d'; FEATURES.push(chatPurgeFeature);
import { streetFixesFeature } from './street-fixes-feature.js?v=39e41b46'; FEATURES.push(streetFixesFeature);
import { gameTeleporterFeature } from './game-teleporter-feature.js?v=ca9bc29c'; FEATURES.push(gameTeleporterFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=ddc43409'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=bd008176'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=3efe5c17'; FEATURES.push(accountBackupFeature);
