/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=facbdc94';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=9067aab6';
import { questOffersFeature } from './quest-offers-feature.js?v=3d3728c2';
import { meditationFeature } from './meditation-feature.js?v=6bbcb224';
import { teleportationFeature } from './teleportation-feature.js?v=55f6e443';
import { racesFeature } from './races-feature.js?v=157ce1c5';
import { mayhemFeature } from './mayhem-feature.js?v=ea9b3f4d';
import { crownsFeature } from './crowns-feature.js?v=0ca45452';
import { patchesFeature } from './patches-feature.js?v=47c30e52';
import { foxesFeature } from './foxes-feature.js?v=29521d2b';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=57266e00';
import { homesFeature } from './homes-feature.js?v=025fd6f5';
import { rookAttackFeature } from './rook-attack-feature.js?v=2aa79c06';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=79d9cb50';
import { doorsFeature } from './doors-feature.js?v=bf4480ac';
import { locationEventsFeature } from './location-events-feature.js?v=0cda70ed';
import { puzzlesFeature } from './puzzles-feature.js?v=16755fe8';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=b4b9e09f';
import { streetJobsFeature } from './street-jobs-feature.js?v=72d4fb06';
import { imaginationFeature } from './imagination-feature.js?v=31dec8c3';
import { supplyFeature } from './supply-feature.js?v=f4a69cd2';
import { giantIconsFeature } from './giant-icons-feature.js?v=7990fcd0';
import { rubeFeature } from './rube-feature.js?v=335faa3a';
import { unlearningFeature } from './unlearning-feature.js?v=3fa33437';
import { dropsFeature } from './drops-feature.js?v=29255d3b';
import { masterGardenFeature } from './master-garden-feature.js?v=8a6cf8a7';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=816a79db';
import { questInstancesFeature } from './quest-instances-feature.js?v=d9739308';
import { partySpacesFeature } from './party-spaces-feature.js?v=138b71f8';
import { seasonsFeature } from './seasons-feature.js?v=0326be71';
import { cameraModeFeature } from './camera-mode-feature.js?v=6c0a4b7a';
import { newxpFeature } from './newxp-feature.js?v=fddce50f';
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
import { smugglingFeature } from './smuggling-feature.js?v=00dd3cd5'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=3fd236d0'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=923c6a7c'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=e0ead5c8'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=7b0c4fc9'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=6085c4f0'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=4903d734'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=2a47914e'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=e46dac8f'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=a20083aa'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=6e3084ab'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=bbce099c'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=446847c8'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=93c12ab1'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=d60d98c5'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=8502e36b'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=b61da5c5'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=f054b962'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=b91a03ad'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=39a52142'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=683f809e'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=fc554c70'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=426e7b2a'; FEATURES.push(rebuiltRoomsFeature);
import { interrogationRoomFeature } from './interrogation-room-feature.js?v=705548d0'; FEATURES.push(interrogationRoomFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=55d243a9'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=97505f9a'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=8bf1b5a4'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=cfa6365e'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=3acb375f'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=42b076fd'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=7d023259'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=607d4d5d'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=37ece065'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=a402f7f2'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=8aeb636e'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=fadcf59f'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=ccdf3186'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=2c9ca1b3'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=b91eab1f'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=bec7e1c5'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=567f4771'; FEATURES.push(gardenGuanoFeature);
import { worldDropFeature } from './world-drop-feature.js?v=3676348e'; FEATURES.push(worldDropFeature);
import { gardenNoticesFeature } from './garden-notices-feature.js?v=8c0878f8'; FEATURES.push(gardenNoticesFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=9a08ca93'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=b1191027'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=3ffcaed8'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=0cbf1a66'; FEATURES.push(packTreeVerbsFeature);
import { packToolVerbsFeature } from './pack-tool-verbs-feature.js?v=c30bee00'; FEATURES.push(packToolVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=f72bd08f'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=15ac5727'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=569b9d51'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=f691a910'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=5b1a184f'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=86bfb0ce'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=ed63e6c5'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=ab9681a0'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=f805ee42'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=7f69d954'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=20089b86'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=2bb9cc8b'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=ae589bdd'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=05da3ce0'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=2f3c468d'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=c172f473'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=bb657c20'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=1a28f3ee'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=ee6a285c'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=4a69ec9f'; FEATURES.push(questsMpFeature);
import { peatQuestMpFeature } from './peat-quest-mp-feature.js?v=ced05ff6'; FEATURES.push(peatQuestMpFeature);
import { groupsFeature } from './groups-feature.js?v=06e451e2'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=ed51f5b0'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=eb7eda6b'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=ff9e28e4'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=012de487'; FEATURES.push(followMpFeature);
import { summonMpFeature } from './summon-mp-feature.js?v=6389f111'; FEATURES.push(summonMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=5554b173'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=2e8a170e'; FEATURES.push(dropsMpFeature);
import { doorKeysFeature } from './door-keys-feature.js?v=f0d26150'; FEATURES.push(doorKeysFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=cae89043'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=991c33c7'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=b4d994bf'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=1b92c7aa'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=18a9b399'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=6798e140'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=443dcac8'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=23cdacf7'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=a7f1bc86'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=ad2a0910'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=d4699813'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=cd004e0e'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=dd196e17'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=2ba32d77'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=f3f0b0f4'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=c672a934'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=704d27da'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=7aa3ad1c'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=8389fe76'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=62d1e05d'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=6a64572c'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=feca566e'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=eb3d4e75'; FEATURES.push(collectionTrophiesFeature);
import { recipeMemoryFeature } from './recipe-memory-feature.js?v=8e2841df'; FEATURES.push(recipeMemoryFeature);
import { sharedGardensFeature } from './shared-gardens-feature.js?v=a7e4ad4f'; FEATURES.push(sharedGardensFeature);
import { sharedPatchesFeature } from './shared-patches-feature.js?v=927121a4'; FEATURES.push(sharedPatchesFeature);
import { cubimalBattleFeature } from './cubimal-battle-feature.js?v=3e01100b'; FEATURES.push(cubimalBattleFeature);
import { chatPurgeFeature } from './chat-purge-feature.js?v=cb6c250d'; FEATURES.push(chatPurgeFeature);
import { streetFixesFeature } from './street-fixes-feature.js?v=39e41b46'; FEATURES.push(streetFixesFeature);
import { chickenScareFeature } from './chicken-scare-feature.js?v=a63eea4e'; FEATURES.push(chickenScareFeature);
import { gameTeleporterFeature } from './game-teleporter-feature.js?v=6c080bfe'; FEATURES.push(gameTeleporterFeature);
import { levelUpMpFeature } from './level-up-mp-feature.js?v=22659e6d'; FEATURES.push(levelUpMpFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=9e183c09'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=df069959'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=464d6c34'; FEATURES.push(accountBackupFeature);
