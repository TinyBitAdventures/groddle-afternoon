/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=93f1c8dd';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=ed64e23a';
import { questOffersFeature } from './quest-offers-feature.js?v=57dafa96';
import { meditationFeature } from './meditation-feature.js?v=50bf1ac0';
import { teleportationFeature } from './teleportation-feature.js?v=23270f4f';
import { racesFeature } from './races-feature.js?v=f8ab7430';
import { mayhemFeature } from './mayhem-feature.js?v=bf288afa';
import { crownsFeature } from './crowns-feature.js?v=8b1d404a';
import { patchesFeature } from './patches-feature.js?v=f3e88dee';
import { foxesFeature } from './foxes-feature.js?v=427d7fa5';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=9141624d';
import { homesFeature } from './homes-feature.js?v=5391026a';
import { rookAttackFeature } from './rook-attack-feature.js?v=db912705';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=7e6704a4';
import { doorsFeature } from './doors-feature.js?v=de0e83b0';
import { locationEventsFeature } from './location-events-feature.js?v=0966e395';
import { puzzlesFeature } from './puzzles-feature.js?v=314d5a45';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=ad67ddaa';
import { streetJobsFeature } from './street-jobs-feature.js?v=25e52041';
import { imaginationFeature } from './imagination-feature.js?v=251a7aa3';
import { supplyFeature } from './supply-feature.js?v=850f2c1f';
import { giantIconsFeature } from './giant-icons-feature.js?v=7f977b91';
import { rubeFeature } from './rube-feature.js?v=50352247';
import { unlearningFeature } from './unlearning-feature.js?v=30560d19';
import { dropsFeature } from './drops-feature.js?v=123055bc';
import { masterGardenFeature } from './master-garden-feature.js?v=c6fd2350';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=6278d22e';
import { questInstancesFeature } from './quest-instances-feature.js?v=f6015246';
import { partySpacesFeature } from './party-spaces-feature.js?v=5ab158fe';
import { seasonsFeature } from './seasons-feature.js?v=9efe579c';
import { cameraModeFeature } from './camera-mode-feature.js?v=ad1ae5ea';
import { newxpFeature } from './newxp-feature.js?v=30b55578';
import { streetMinimapFeature } from './street-minimap-feature.js?v=180d825b';

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
import { smugglingFeature } from './smuggling-feature.js?v=49c3f782'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=ebbc41b4'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=3474b596'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=5aeba913'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=19b421a8'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=78ed7778'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=115f0814'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=37a31290'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=47f3f409'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=4c77d934'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=22fe518f'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=44676d34'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=15e39cb4'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=54762b93'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=c61573d7'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=84aadb1a'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=67e77f1d'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=1b66ffb5'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=5043a2a3'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=510c9a48'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=59145efa'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=4712165c'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=8baf41e0'; FEATURES.push(rebuiltRoomsFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=fc4c24d8'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=ec0c7eb3'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=28790433'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=f590fe5f'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=08d3edea'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=ba6a1a46'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=eb42483d'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=cb3595ed'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=ccd32c25'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=8bcefe40'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=918da0ee'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=dd0a98aa'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=a126bf65'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=cc75b45f'; FEATURES.push(crabsFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=d34b4c69'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=e8f2ab57'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=89e9f695'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=b8bd6173'; FEATURES.push(gardenGuanoFeature);
import { gardenNoticesFeature } from './garden-notices-feature.js?v=03b6c3d6'; FEATURES.push(gardenNoticesFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=79185107'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=1d470153'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=d1cddf95'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=db365524'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=eee67986'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=63c4ad0f'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=c039ff5b'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=15dd927a'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=f935ead5'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=dd2a0af9'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=e6fafafb'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=017fb596'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=cd21beba'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=2df16c9e'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=f6f26a75'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=b28bd599'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=3a7cf4c6'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=b1ae6211'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=0a749bcf'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=42ffd03e'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=7a4bf068'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=5fa4e4db'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=7fba429a'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=44f546e9'; FEATURES.push(questsMpFeature);
import { peatQuestMpFeature } from './peat-quest-mp-feature.js?v=56883a2a'; FEATURES.push(peatQuestMpFeature);
import { groupsFeature } from './groups-feature.js?v=e3419d6c'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=bab8345f'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=fa683fad'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=368b4a52'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=674ebe1d'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=dc1d4f96'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=b626fbd4'; FEATURES.push(dropsMpFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=2e4c139f'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=7c913497'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=e0a7dc77'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=e8685513'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=41dfc2d8'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=39c49118'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=a7277df9'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=4b3d3440'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=55d29473'; FEATURES.push(homeStorageFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=355fee62'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=42b1904a'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=38cfe4e8'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=eef3178d'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=90df10b1'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=598fa948'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=96309267'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=405f5614'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=a209b288'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=c96b9570'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=a0e81acf'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=08ae2a05'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=dec7e5fe'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=bb848f8f'; FEATURES.push(collectionTrophiesFeature);
import { recipeMemoryFeature } from './recipe-memory-feature.js?v=bbeda418'; FEATURES.push(recipeMemoryFeature);
import { sharedGardensFeature } from './shared-gardens-feature.js?v=a7bedbaf'; FEATURES.push(sharedGardensFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=f3deff4a'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=8e21ba7f'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=64af35bf'; FEATURES.push(accountBackupFeature);
