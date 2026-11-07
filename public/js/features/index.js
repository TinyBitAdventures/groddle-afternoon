/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=13196575';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=ae8016ec';
import { questOffersFeature } from './quest-offers-feature.js?v=ed3cb5da';
import { meditationFeature } from './meditation-feature.js?v=b84b5a66';
import { teleportationFeature } from './teleportation-feature.js?v=ee0d6d00';
import { racesFeature } from './races-feature.js?v=9ee2b015';
import { mayhemFeature } from './mayhem-feature.js?v=407f69d9';
import { crownsFeature } from './crowns-feature.js?v=9c83f9ad';
import { patchesFeature } from './patches-feature.js?v=42117b13';
import { foxesFeature } from './foxes-feature.js?v=151ffa47';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=e66f1ad2';
import { homesFeature } from './homes-feature.js?v=7e590ce8';
import { rookAttackFeature } from './rook-attack-feature.js?v=b85c43f3';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=3374320f';
import { doorsFeature } from './doors-feature.js?v=d708e563';
import { locationEventsFeature } from './location-events-feature.js?v=0966e395';
import { puzzlesFeature } from './puzzles-feature.js?v=48ced800';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=37d78c06';
import { streetJobsFeature } from './street-jobs-feature.js?v=03adbad6';
import { imaginationFeature } from './imagination-feature.js?v=0589acce';
import { supplyFeature } from './supply-feature.js?v=70489c1b';
import { giantIconsFeature } from './giant-icons-feature.js?v=920a0d00';
import { rubeFeature } from './rube-feature.js?v=0c2a3c93';
import { unlearningFeature } from './unlearning-feature.js?v=30560d19';
import { dropsFeature } from './drops-feature.js?v=43984e8f';
import { masterGardenFeature } from './master-garden-feature.js?v=2c8bef0c';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=cb203b90';
import { questInstancesFeature } from './quest-instances-feature.js?v=c36d5ee9';
import { partySpacesFeature } from './party-spaces-feature.js?v=a287ae6a';
import { seasonsFeature } from './seasons-feature.js?v=c5d98059';
import { cameraModeFeature } from './camera-mode-feature.js?v=ad1ae5ea';
import { newxpFeature } from './newxp-feature.js?v=036f8c3f';
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
import { smugglingFeature } from './smuggling-feature.js?v=de7c8355'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=e46f9b45'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=9c9fd1e4'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=0885e42f'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=58a92a1b'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=ac0a49ae'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=5b275e87'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=0bd8032e'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=4e87d74b'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=246efc7c'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=7ab9421d'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=631d2cbc'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=f3594b44'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=e41ab1f0'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=484c09aa'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=1eeace34'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=c40581b7'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=265ecc37'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=8cb4cd08'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=72a5ab33'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=59145efa'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=37f51085'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=8baf41e0'; FEATURES.push(rebuiltRoomsFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=8433ba6c'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=abb07d12'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=d11abfec'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=74ef992c'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=802e3126'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=4eb882c5'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=4827af5f'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=ea514c53'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=25d5a1c8'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=2d2e4613'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=c49cd387'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=b8f688b6'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=763f237c'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=490c23d8'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=b5c16464'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=5c56c08f'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=f9b131f0'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=072b8926'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=c2e7133e'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=cc81ac37'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=e50d4419'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=09516fab'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=2c4acc19'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=993bc630'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=1fa17b85'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=ee944692'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=ecf7cfe7'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=b043ef2b'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=2fc22b4f'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=9cc4240c'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=f6f26a75'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=3583d3f4'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=3a7cf4c6'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=9ece295c'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=05f3dd73'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=66d50ed1'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=40edf322'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=dc8b0852'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=a4f3cea4'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=823123ab'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=49d04974'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=c956615c'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=826a57ed'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=775faa4c'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=674ebe1d'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=2d5c74ca'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=9f2c3ba0'; FEATURES.push(dropsMpFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=aedbdaed'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=be28caeb'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=b3e1fb18'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=25e93d3d'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=ec420b56'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=5a901dfc'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=a7dfd793'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=60fa67d3'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=66f782b7'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=52517603'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=05464146'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=38cfe4e8'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=eef3178d'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=149382aa'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=9644f0b9'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=96309267'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=448cc317'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=c7f00a33'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=bf0f3b0d'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=45ef6058'; FEATURES.push(partyScrapingFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=c357c3ad'; FEATURES.push(collectionTrophiesFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=62a5ecf1'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=c9c3d2f8'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=d780c98a'; FEATURES.push(accountBackupFeature);
