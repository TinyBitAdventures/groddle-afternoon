/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=aa67fca8';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=41cadcfe';
import { questOffersFeature } from './quest-offers-feature.js?v=db81cdfe';
import { meditationFeature } from './meditation-feature.js?v=16a2d75c';
import { teleportationFeature } from './teleportation-feature.js?v=176a9c17';
import { racesFeature } from './races-feature.js?v=3ecb48c5';
import { mayhemFeature } from './mayhem-feature.js?v=489cc7ee';
import { crownsFeature } from './crowns-feature.js?v=92c6a78a';
import { patchesFeature } from './patches-feature.js?v=5d9c8add';
import { foxesFeature } from './foxes-feature.js?v=cc338177';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=5d01afe6';
import { homesFeature } from './homes-feature.js?v=ff876d70';
import { rookAttackFeature } from './rook-attack-feature.js?v=0a731ebd';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=ba0972ab';
import { doorsFeature } from './doors-feature.js?v=8d51e9bd';
import { locationEventsFeature } from './location-events-feature.js?v=0cda70ed';
import { puzzlesFeature } from './puzzles-feature.js?v=bb2423b8';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=0871cf98';
import { streetJobsFeature } from './street-jobs-feature.js?v=ddaf962d';
import { imaginationFeature } from './imagination-feature.js?v=ccc05759';
import { supplyFeature } from './supply-feature.js?v=65175221';
import { giantIconsFeature } from './giant-icons-feature.js?v=dd24c7b2';
import { rubeFeature } from './rube-feature.js?v=cb84a76e';
import { unlearningFeature } from './unlearning-feature.js?v=da4e2b67';
import { dropsFeature } from './drops-feature.js?v=0d11750e';
import { masterGardenFeature } from './master-garden-feature.js?v=5229480a';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=0eb2a544';
import { questInstancesFeature } from './quest-instances-feature.js?v=f5f97d45';
import { partySpacesFeature } from './party-spaces-feature.js?v=dd85528b';
import { seasonsFeature } from './seasons-feature.js?v=89ad1a58';
import { cameraModeFeature } from './camera-mode-feature.js?v=33da0f2a';
import { newxpFeature } from './newxp-feature.js?v=698b9613';
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
import { smugglingFeature } from './smuggling-feature.js?v=80fb9975'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=f574b637'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=2321fe7f'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=334dd267'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=19d56dc5'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=ef26121d'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=5603dda6'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=26beb5b3'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=86abd23a'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=8bd822d4'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=a27b113d'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=572de8dd'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=4d225615'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=aee231ca'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=a164545b'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=4efdffb8'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=c802a863'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=a1d3577c'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=f951f4ac'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=f97d92aa'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=4faefda8'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=42f3f5ce'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=514604e6'; FEATURES.push(rebuiltRoomsFeature);
import { interrogationRoomFeature } from './interrogation-room-feature.js?v=abce8d45'; FEATURES.push(interrogationRoomFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=b9b4689b'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=981a8144'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=122c5305'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=d33a4e44'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=7f1bb055'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=a0746048'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=bfd6531e'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=ad7ae523'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=b3efe011'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=690a4d5c'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=e1e816dd'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=1d9f9854'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=567be528'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=0a7ef66d'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=b6c452e8'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=8485041c'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=cfc0c7cf'; FEATURES.push(gardenGuanoFeature);
import { worldDropFeature } from './world-drop-feature.js?v=9b78121c'; FEATURES.push(worldDropFeature);
import { gardenNoticesFeature } from './garden-notices-feature.js?v=20da6feb'; FEATURES.push(gardenNoticesFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=9e8ece39'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=158bf979'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=728f4869'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=af1f6393'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=8f94a81a'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=13581d21'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=aa61108f'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=6b21a053'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=cb0b118e'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=5dad6c80'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=772752b5'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=017fb596'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=bd1f8ea3'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=6c05d997'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=5c9ea4d3'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=1ad1df55'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=ae589bdd'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=c75498d5'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=0ed6c320'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=98bae752'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=cea4455f'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=dff9d282'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=825fe240'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=97657d4c'; FEATURES.push(questsMpFeature);
import { peatQuestMpFeature } from './peat-quest-mp-feature.js?v=8fbbc464'; FEATURES.push(peatQuestMpFeature);
import { groupsFeature } from './groups-feature.js?v=6be87da2'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=49abf371'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=96b544a1'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=a052c8de'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=012de487'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=3bb3202a'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=a7b8ffec'; FEATURES.push(dropsMpFeature);
import { doorKeysFeature } from './door-keys-feature.js?v=c17deb02'; FEATURES.push(doorKeysFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=d789fe76'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=249f473f'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=b6151e96'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=ccc9350b'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=0c123889'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=8e1698f1'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=9c261aeb'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=d848cea7'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=b2de87ae'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=6dff3574'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=9f4ab581'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=75e4085c'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=6fc872ed'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=ad156bf8'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=3f1c2979'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=39f34d6d'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=704d27da'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=364b4ec1'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=7ad7355e'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=b8440eb4'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=abd08eff'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=da03c69f'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=2507feab'; FEATURES.push(collectionTrophiesFeature);
import { recipeMemoryFeature } from './recipe-memory-feature.js?v=5e8e35eb'; FEATURES.push(recipeMemoryFeature);
import { sharedGardensFeature } from './shared-gardens-feature.js?v=03b68d3c'; FEATURES.push(sharedGardensFeature);
import { sharedPatchesFeature } from './shared-patches-feature.js?v=f7a46644'; FEATURES.push(sharedPatchesFeature);
import { cubimalBattleFeature } from './cubimal-battle-feature.js?v=aa8bf0de'; FEATURES.push(cubimalBattleFeature);
import { chatPurgeFeature } from './chat-purge-feature.js?v=cb6c250d'; FEATURES.push(chatPurgeFeature);
import { streetFixesFeature } from './street-fixes-feature.js?v=39e41b46'; FEATURES.push(streetFixesFeature);
import { chickenScareFeature } from './chicken-scare-feature.js?v=d97cfec3'; FEATURES.push(chickenScareFeature);
import { gameTeleporterFeature } from './game-teleporter-feature.js?v=04829fb4'; FEATURES.push(gameTeleporterFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=3087c72e'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=8ce73ca1'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=496ec380'; FEATURES.push(accountBackupFeature);
