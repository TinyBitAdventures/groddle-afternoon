/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=13196575';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=18e9b4d3';
import { questOffersFeature } from './quest-offers-feature.js?v=a5f91399';
import { meditationFeature } from './meditation-feature.js?v=76b0c9e3';
import { teleportationFeature } from './teleportation-feature.js?v=ee0d6d00';
import { racesFeature } from './races-feature.js?v=727668d2';
import { mayhemFeature } from './mayhem-feature.js?v=13530ea8';
import { crownsFeature } from './crowns-feature.js?v=0fc0ebe3';
import { patchesFeature } from './patches-feature.js?v=42117b13';
import { foxesFeature } from './foxes-feature.js?v=6ad29476';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=e66f1ad2';
import { homesFeature } from './homes-feature.js?v=605d63fc';
import { rookAttackFeature } from './rook-attack-feature.js?v=fab98cea';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=329e66c8';
import { doorsFeature } from './doors-feature.js?v=d708e563';
import { locationEventsFeature } from './location-events-feature.js?v=0966e395';
import { puzzlesFeature } from './puzzles-feature.js?v=1d577ff5';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=37d78c06';
import { streetJobsFeature } from './street-jobs-feature.js?v=867d894e';
import { imaginationFeature } from './imagination-feature.js?v=0589acce';
import { supplyFeature } from './supply-feature.js?v=70489c1b';
import { giantIconsFeature } from './giant-icons-feature.js?v=920a0d00';
import { rubeFeature } from './rube-feature.js?v=0c2a3c93';
import { unlearningFeature } from './unlearning-feature.js?v=30560d19';
import { dropsFeature } from './drops-feature.js?v=43984e8f';
import { masterGardenFeature } from './master-garden-feature.js?v=bc9c3093';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=fe510813';
import { questInstancesFeature } from './quest-instances-feature.js?v=61d1ae9e';
import { partySpacesFeature } from './party-spaces-feature.js?v=a287ae6a';
import { seasonsFeature } from './seasons-feature.js?v=04e963a4';
import { cameraModeFeature } from './camera-mode-feature.js?v=ad1ae5ea';
import { newxpFeature } from './newxp-feature.js?v=8a5701ff';
import { streetMinimapFeature } from './street-minimap-feature.js?v=a79051b1';

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
import { smugglingFeature } from './smuggling-feature.js?v=2e9b7fad'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=14b7181b'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=9c9fd1e4'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=0885e42f'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=fc0ce397'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=ac0a49ae'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=5b275e87'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=0bd8032e'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=4e87d74b'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=8114245e'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=e542a526'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=209361be'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=64892746'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=b4902879'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=12689b6a'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=9ef6ffae'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=6aec8098'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=56c65da8'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=0de650b1'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=72a5ab33'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=59145efa'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=37f51085'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=8baf41e0'; FEATURES.push(rebuiltRoomsFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=8433ba6c'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=c9fe093b'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=a1b3bfae'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=174b1123'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=471df17b'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=4eb882c5'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=3d178f63'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=ea514c53'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=d7df922d'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=b8eb9f2a'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=4162ad6d'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=0d8e6b7b'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=763f237c'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=490c23d8'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=b5c16464'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=5c56c08f'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=b46fc7cd'; FEATURES.push(gardenGuanoFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=f9b131f0'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=7d9926dd'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=8ea948b7'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=cc81ac37'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=b7e79d8e'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=09516fab'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=2c4acc19'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=993bc630'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=f442742f'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=ee944692'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=1e698fc8'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=b043ef2b'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=2fc22b4f'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=9cc4240c'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=f6f26a75'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=fa5d52cf'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=3a7cf4c6'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=9ece295c'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=59e8e9f6'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=66d50ed1'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=40edf322'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=a2482388'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=959d7680'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=3f11cd7a'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=49d04974'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=ded2dfe8'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=826a57ed'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=775faa4c'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=674ebe1d'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=f014c708'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=9f2c3ba0'; FEATURES.push(dropsMpFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=f7f40446'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=be28caeb'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=3c008fc4'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=25e93d3d'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=0f890a54'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=5a901dfc'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=a19eddc5'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=e53c81f8'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=29ba6001'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=52517603'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=30705bb7'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=38cfe4e8'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=eef3178d'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=dc3a1dd9'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=9644f0b9'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=96309267'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=448cc317'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=c7f00a33'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=09696d80'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=45ef6058'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=3add469f'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=c357c3ad'; FEATURES.push(collectionTrophiesFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=62a5ecf1'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=c9c3d2f8'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=d780c98a'; FEATURES.push(accountBackupFeature);
