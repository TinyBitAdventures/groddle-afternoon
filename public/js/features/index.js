/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=19e4c55f';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=b8fc0749';
import { questOffersFeature } from './quest-offers-feature.js?v=cb6fe38a';
import { meditationFeature } from './meditation-feature.js?v=40abda92';
import { teleportationFeature } from './teleportation-feature.js?v=3dc439b9';
import { racesFeature } from './races-feature.js?v=b26c746f';
import { mayhemFeature } from './mayhem-feature.js?v=4bb316b5';
import { crownsFeature } from './crowns-feature.js?v=26923396';
import { patchesFeature } from './patches-feature.js?v=b8149171';
import { foxesFeature } from './foxes-feature.js?v=de0df86a';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=4e3b2d5f';
import { homesFeature } from './homes-feature.js?v=86da0fc9';
import { rookAttackFeature } from './rook-attack-feature.js?v=a9dbcdad';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=e5108253';
import { doorsFeature } from './doors-feature.js?v=333e6ce2';
import { locationEventsFeature } from './location-events-feature.js?v=1c5b6340';
import { puzzlesFeature } from './puzzles-feature.js?v=897966d0';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=e2158b70';
import { streetJobsFeature } from './street-jobs-feature.js?v=e06912e8';
import { imaginationFeature } from './imagination-feature.js?v=96c77856';
import { supplyFeature } from './supply-feature.js?v=6bb1959d';
import { giantIconsFeature } from './giant-icons-feature.js?v=5dce3161';
import { rubeFeature } from './rube-feature.js?v=788b64f7';
import { unlearningFeature } from './unlearning-feature.js?v=ccbeff04';
import { dropsFeature } from './drops-feature.js?v=6a1d1013';
import { masterGardenFeature } from './master-garden-feature.js?v=fec0fc1d';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=7024724a';
import { questInstancesFeature } from './quest-instances-feature.js?v=4f07cfaf';
import { partySpacesFeature } from './party-spaces-feature.js?v=fc28aaf3';
import { seasonsFeature } from './seasons-feature.js?v=ce071985';
import { cameraModeFeature } from './camera-mode-feature.js?v=cef43295';
import { newxpFeature } from './newxp-feature.js?v=ea0fd9da';
import { streetMinimapFeature } from './street-minimap-feature.js?v=f510c513';

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
import { smugglingFeature } from './smuggling-feature.js?v=f93d0d48'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=a256355b'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=729296e1'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=4e2baea6'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=f041f2d3'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=eede2956'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=7f9ca300'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=ae55ee67'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=51089e13'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=b798e0a6'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=bbe1e4da'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=076a829c'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=ae1fc29b'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=297e5fdd'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=7ddb00d1'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=eca372f2'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=426f342b'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=acfa389d'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=0dcd243a'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=ffbd1d27'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=abd7304a'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=91b3ac77'; FEATURES.push(hiddenFloorsFeature);
// Glitch's Random Hole (items/random_hole.js): touch one and pop out of another on the same street.
import { randomHolesFeature } from './random-holes-feature.js?v=b6250ae2'; FEATURES.push(randomHolesFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { thornfadLettersFeature } from './thornfad-letters-feature.js?v=9ddccef1'; FEATURES.push(thornfadLettersFeature);
import { streetToysFeature } from './street-toys-feature.js?v=c94fcbec'; FEATURES.push(streetToysFeature);
import { koulatoJarsFeature } from './koulato-jars-feature.js?v=989b015b'; FEATURES.push(koulatoJarsFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=6f2bb59c'; FEATURES.push(rebuiltRoomsFeature);
import { quarterFeature } from './quarter-feature.js?v=9b85681e'; FEATURES.push(quarterFeature);
import { deadEndsFeature } from './dead-ends-feature.js?v=c8f59270'; FEATURES.push(deadEndsFeature);
import { interrogationRoomFeature } from './interrogation-room-feature.js?v=66c39c67'; FEATURES.push(interrogationRoomFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=2613cfb3'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=a453e2d3'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=03c0f3cb'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=661b5ae1'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=ed0aba78'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=b3b43a06'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=59ef441a'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=5653ae12'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=aea8620b'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=b0689ab3'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=5bea0934'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=f2e5e707'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=0e5432ac'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=46380063'; FEATURES.push(crabsFeature);
// G1245 (#661, ours): the Vine Radio on a home street, its Choose music sheet and its music.
import { radioFeature } from './vine-radio-feature.js?v=c7d92f90'; FEATURES.push(radioFeature);
import { fireDragonFeature } from './fire-dragon-feature.js?v=69ee7cc0'; FEATURES.push(fireDragonFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=b3f60a84'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=6948f1d1'; FEATURES.push(machineRoomsFeature);
import { gardenGuanoFeature } from './garden-guano-feature.js?v=3faeddbb'; FEATURES.push(gardenGuanoFeature);
import { worldDropFeature } from './world-drop-feature.js?v=535c019d'; FEATURES.push(worldDropFeature);
import { gardenNoticesFeature } from './garden-notices-feature.js?v=7ba2e57f'; FEATURES.push(gardenNoticesFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=c26fffcd'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=9bd26ec8'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=513a0a31'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=613ecd32'; FEATURES.push(packTreeVerbsFeature);
import { packToolVerbsFeature } from './pack-tool-verbs-feature.js?v=7a55178a'; FEATURES.push(packToolVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=8aa8d11f'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=35ee8c3f'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=b7049fe0'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=e6bfe174'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=d983d5d3'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=1b25a0d7'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=854da397'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=bf5413ed'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=ad5d6d49'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=fd8c7372'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=29f43980'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=6475eabc'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=5f80492b'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=38b383d6'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=dd6f986b'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=2825b888'; FEATURES.push(ledgerFeature);
import { vendorFinderFeature } from './vendor-finder-feature.js?v=bda9237a'; FEATURES.push(vendorFinderFeature);
import { buddiesFeature } from './buddies-feature.js?v=dec3565b'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=97e9daee'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=5d483220'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=3e40ea70'; FEATURES.push(questsMpFeature);
import { peatQuestMpFeature } from './peat-quest-mp-feature.js?v=620cacb0'; FEATURES.push(peatQuestMpFeature);
import { groupsFeature } from './groups-feature.js?v=d9f66484'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=1b44e765'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=0276e653'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=d86a9d9e'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=b83f8f33'; FEATURES.push(followMpFeature);
import { summonMpFeature } from './summon-mp-feature.js?v=d1ba1a35'; FEATURES.push(summonMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=52314913'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=c48e2640'; FEATURES.push(dropsMpFeature);
import { gravesMpFeature } from './graves-mp-feature.js?v=75cf3221'; FEATURES.push(gravesMpFeature);
import { doorKeysFeature } from './door-keys-feature.js?v=1aaac29f'; FEATURES.push(doorKeysFeature);
import { boardsMpFeature } from './boards-mp-feature.js?v=9b69cc9b'; FEATURES.push(boardsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=c54c6abe'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=ff456635'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=d6847ab2'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=f871f3fd'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=99715fcc'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=eda3419c'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=e00dd804'; FEATURES.push(yardVerbsMpFeature);
import { homeMachinesFeature } from './home-machines-feature.js?v=8b6ccd73'; FEATURES.push(homeMachinesFeature);
import { homeStorageFeature } from './home-storage-feature.js?v=f79ab3dc'; FEATURES.push(homeStorageFeature);
import { homeLiveFeature } from './home-live-feature.js?v=0020c4eb'; FEATURES.push(homeLiveFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=701799b8'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=e502f2e7'; FEATURES.push(itemVerbsMoreFeature);
import { yourLooksFeature } from './your-looks-feature.js?v=589e49ec'; FEATURES.push(yourLooksFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=0e07d9a1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=f9ec9f34'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=239aaefb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=3997eadf'; FEATURES.push(butlerImFeature);
import { playerImFeature } from './player-im-feature.js?v=2ff7dae2'; FEATURES.push(playerImFeature);
import { chatReactionsFeature } from './chat-reactions-feature.js?v=0750c712'; FEATURES.push(chatReactionsFeature);
import { chatThreadsFeature } from './chat-threads-feature.js?v=ddb17a9f'; FEATURES.push(chatThreadsFeature);
import { presenceMpFeature } from './presence-mp-feature.js?v=21272297'; FEATURES.push(presenceMpFeature);
import { communityMpFeature } from './community-mp-feature.js?v=66281288'; FEATURES.push(communityMpFeature);
import { questPlateFeature } from './quest-plate-feature.js?v=40759c57'; FEATURES.push(questPlateFeature);
import { aggressiveHoeingFeature } from './aggressive-hoeing-feature.js?v=146ead82'; FEATURES.push(aggressiveHoeingFeature);
import { partyScrapingFeature } from './party-scraping-feature.js?v=4a54b8e9'; FEATURES.push(partyScrapingFeature);
import { gardenGnomeFeature } from './garden-gnome-feature.js?v=389168ce'; FEATURES.push(gardenGnomeFeature);
import { collectionTrophiesFeature } from './collection-trophies-feature.js?v=cd3ad390'; FEATURES.push(collectionTrophiesFeature);
import { recipeMemoryFeature } from './recipe-memory-feature.js?v=963139e7'; FEATURES.push(recipeMemoryFeature);
import { compoundDiscoveryFeature } from './compound-discovery-feature.js?v=f07dd91a'; FEATURES.push(compoundDiscoveryFeature);
import { sharedGardensFeature } from './shared-gardens-feature.js?v=e889ddce'; FEATURES.push(sharedGardensFeature);
import { sharedPatchesFeature } from './shared-patches-feature.js?v=bfb5f2e9'; FEATURES.push(sharedPatchesFeature);
import { cubimalBattleFeature } from './cubimal-battle-feature.js?v=c5fb6309'; FEATURES.push(cubimalBattleFeature);
import { chatPurgeFeature } from './chat-purge-feature.js?v=cb6c250d'; FEATURES.push(chatPurgeFeature);
import { streetFixesFeature } from './street-fixes-feature.js?v=06e9f5a2'; FEATURES.push(streetFixesFeature);
import { skillBubblesFeature } from './skill-bubbles-feature.js?v=4d13726a'; FEATURES.push(skillBubblesFeature);
// G947 (M3): crews on a home street (help mine, help dig); answers help-mine-feature's queries there.
import { homeCrewMpFeature } from './home-crew-mp-feature.js?v=81824897'; FEATURES.push(homeCrewMpFeature);
// TODAYCARD: the start card's Today panel and nudge for a returning player (asks solo-feats for startCardFeat).
import { startTodayFeature } from './start-today-feature.js?v=2715b940'; FEATURES.push(startTodayFeature);
// G1312: a finished Group Hall's street, members only, entered from its lot (street-jobs-feature).
import { groupHallStreetFeature } from './group-hall-street-feature.js?v=59e2a499'; FEATURES.push(groupHallStreetFeature);
import { chickenScareFeature } from './chicken-scare-feature.js?v=f70bcd7c'; FEATURES.push(chickenScareFeature);
import { gameTeleporterFeature } from './game-teleporter-feature.js?v=c968debb'; FEATURES.push(gameTeleporterFeature);
import { levelUpMpFeature } from './level-up-mp-feature.js?v=22659e6d'; FEATURES.push(levelUpMpFeature);
// G982 Pot Luck Day, part A: the chicken costumes (after seasons-feature, whose seasonOn it asks).
import { potLuckFeature } from './pot-luck-feature.js?v=bb580d31'; FEATURES.push(potLuckFeature);
import { potLuckFeastFeature } from './pot-luck-feast-feature.js?v=14ffb102'; FEATURES.push(potLuckFeastFeature);
// G1009 Thanksgiving Day's feast: eat-in-place piles of the week's table food (asks pot-luck-feast for its counts).
import { feastDayFeature } from './feast-day-feature.js?v=b236c7ed'; FEATURES.push(feastDayFeature);
import { calendarFeature } from './calendar-feature.js?v=6cbe4537'; FEATURES.push(calendarFeature);
// G1195 Happy New Ur: the countdown at the Groddle midnights of December 31, the show and the party street.
import { newUrFeature } from './new-ur-feature.js?v=b72e031e'; FEATURES.push(newUrFeature);
import { newUrPartyFeature } from './new-ur-party-feature.js?v=f42ade79'; FEATURES.push(newUrPartyFeature);
// Meteor showers and lone shooting stars in the night sky (ours): started from the console, synced by the server.
import { meteorShowerFeature } from './meteor-shower-feature.js?v=100d8c5e'; FEATURES.push(meteorShowerFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=fa0035e8'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=45143ef2'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=7cda2116'; FEATURES.push(accountBackupFeature);
