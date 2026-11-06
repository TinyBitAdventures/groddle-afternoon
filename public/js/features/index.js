/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=13196575';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=d00b988a';
import { questOffersFeature } from './quest-offers-feature.js?v=c6f19dc4';
import { meditationFeature } from './meditation-feature.js?v=76643032';
import { teleportationFeature } from './teleportation-feature.js?v=7d175a00';
import { racesFeature } from './races-feature.js?v=d0ac52b0';
import { mayhemFeature } from './mayhem-feature.js?v=37998880';
import { crownsFeature } from './crowns-feature.js?v=b178d652';
import { patchesFeature } from './patches-feature.js?v=3b664dfa';
import { foxesFeature } from './foxes-feature.js?v=3bd5713b';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=e66f1ad2';
import { homesFeature } from './homes-feature.js?v=343c5786';
import { rookAttackFeature } from './rook-attack-feature.js?v=37ebb5fd';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=b0d7924e';
import { doorsFeature } from './doors-feature.js?v=5c5d34ee';
import { locationEventsFeature } from './location-events-feature.js?v=0966e395';
import { puzzlesFeature } from './puzzles-feature.js?v=9bf8a2ad';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=087c4f1a';
import { streetJobsFeature } from './street-jobs-feature.js?v=e25ef344';
import { imaginationFeature } from './imagination-feature.js?v=438eaaf3';
import { supplyFeature } from './supply-feature.js?v=9a7e5dc5';
import { giantIconsFeature } from './giant-icons-feature.js?v=920a0d00';
import { rubeFeature } from './rube-feature.js?v=0c2a3c93';
import { unlearningFeature } from './unlearning-feature.js?v=30560d19';
import { dropsFeature } from './drops-feature.js?v=43984e8f';
import { masterGardenFeature } from './master-garden-feature.js?v=d29db02c';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=6856e7d5';
import { questInstancesFeature } from './quest-instances-feature.js?v=f8fd82b2';
import { partySpacesFeature } from './party-spaces-feature.js?v=86c7739a';
import { seasonsFeature } from './seasons-feature.js?v=b9966f99';
import { cameraModeFeature } from './camera-mode-feature.js?v=ad1ae5ea';
import { newxpFeature } from './newxp-feature.js?v=8e5f6ddd';
import { streetMinimapFeature } from './street-minimap-feature.js?v=92e83f75';

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
import { smugglingFeature } from './smuggling-feature.js?v=53c3ca95'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=c854a072'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=9c9fd1e4'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=0885e42f'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=3dcb03a9'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=7b886c5d'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=1715bfc7'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=21455d5b'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=5b0e17bd'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=c4a9724f'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=6e756429'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=c757018d'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=6cbe4a80'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=5876fd01'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=dfc01b6a'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=84442e60'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=9824d140'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=94b8d9e2'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=318d2679'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=d1e61887'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=59145efa'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=d0997a50'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=8baf41e0'; FEATURES.push(rebuiltRoomsFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=5f0bb75e'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=51fbc41c'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=c18221e6'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=9ff5133f'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=5444e645'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=4eb882c5'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=4cfb922a'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=776bf235'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=44a7cb4b'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=6834c7c1'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=0b44c13b'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=cd3260ff'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=763f237c'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=490c23d8'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=b5c16464'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=38dc7769'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=f9b131f0'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=a37cd6bf'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=d13c2b58'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=285dab87'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=43a2dd45'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=b1569512'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=2c4acc19'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=8fb463e8'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=eb3da738'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=a064489e'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=e43b4d06'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=b043ef2b'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=47dc66d1'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=8028c796'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=3cf6a5c3'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=4959beb3'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=3a7cf4c6'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=0c3fa98a'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=4916f4c4'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=66d50ed1'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=909520f4'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=1da0b443'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=752b7b46'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=14920340'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=a49e5816'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=f3f0587f'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=fa7466b8'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=6dd42322'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=674ebe1d'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=12bab068'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=5a9e88af'; FEATURES.push(dropsMpFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=5225026a'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=23935bd3'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=7cf449dd'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=513cc8ff'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=4bfc620d'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=5a901dfc'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=44fc5b0c'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=6435b350'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=cdda1d98'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=52517603'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=0736847f'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=38cfe4e8'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=eef3178d'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=945087a9'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=53b5bb94'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=96309267'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=c10440b7'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=65690382'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=76cdcc33'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=3aca01c7'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=0479a06e'; FEATURES.push(accountBackupFeature);
