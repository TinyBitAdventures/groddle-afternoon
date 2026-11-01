/**
 * Feature registry (see js/feature-host.js). Add a feature by importing it
 * here and appending it to FEATURES; game.js never needs to change.
 * Order matters only for first-answer hooks (enterGate, query, ecologyOverride).
 */

import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import { hellFeature } from './hell-feature.js?v=8e4ebacf';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=34465cfa';
import { questOffersFeature } from './quest-offers-feature.js?v=592eb304';
import { meditationFeature } from './meditation-feature.js?v=3fb6ade0';
import { teleportationFeature } from './teleportation-feature.js?v=a2883436';
import { racesFeature } from './races-feature.js?v=6c86e855';
import { mayhemFeature } from './mayhem-feature.js?v=eb2a46e3';
import { crownsFeature } from './crowns-feature.js?v=76ed7484';
import { patchesFeature } from './patches-feature.js?v=09e87d4d';
import { foxesFeature } from './foxes-feature.js?v=37aeebc2';
import { heliKittiesFeature } from './heli-kitties-feature.js?v=a56dce4d';
import { homesFeature } from './homes-feature.js?v=42951491';
import { rookAttackFeature } from './rook-attack-feature.js?v=15eda966';
import { streetFurnitureFeature } from './street-furniture-feature.js?v=4917e0b2';
import { doorsFeature } from './doors-feature.js?v=006abb07';
import { locationEventsFeature } from './location-events-feature.js?v=58727a27';
import { puzzlesFeature } from './puzzles-feature.js?v=44857daf';
import { puzzleScenesFeature } from './puzzle-scenes-feature.js?v=22daa850';
import { streetJobsFeature } from './street-jobs-feature.js?v=cd496fad';
import { imaginationFeature } from './imagination-feature.js?v=0fb678d8';
import { supplyFeature } from './supply-feature.js?v=e51e2fc8';
import { giantIconsFeature } from './giant-icons-feature.js?v=7068c371';
import { rubeFeature } from './rube-feature.js?v=fb133188';
import { unlearningFeature } from './unlearning-feature.js?v=90f0dce7';
import { dropsFeature } from './drops-feature.js?v=24f391a8';
import { masterGardenFeature } from './master-garden-feature.js?v=17cb5292';
import { animalHusbandryFeature } from './animal-husbandry-feature.js?v=f9c33116';
import { questInstancesFeature } from './quest-instances-feature.js?v=155bac18';
import { partySpacesFeature } from './party-spaces-feature.js?v=356060c1';
import { seasonsFeature } from './seasons-feature.js?v=b3e06838';
import { cameraModeFeature } from './camera-mode-feature.js?v=ad1ae5ea';
import { newxpFeature } from './newxp-feature.js?v=325abc12';
import { streetMinimapFeature } from './street-minimap-feature.js?v=03127735';

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
import { smugglingFeature } from './smuggling-feature.js?v=bb447ae6'; FEATURES.push(smugglingFeature);
import { homeTowerFeature } from './home-tower-feature.js?v=7ce20566'; FEATURES.push(homeTowerFeature);
import { secretSpotsFeature } from './secret-spots-feature.js?v=53a83b19'; FEATURES.push(secretSpotsFeature);
import { musicblocksFeature } from './musicblocks-feature.js?v=abd0f941'; FEATURES.push(musicblocksFeature);
import { shrineHintFeature } from './shrine-hint-feature.js?v=ab6cb0de'; FEATURES.push(shrineHintFeature);
import { towerRoomsFeature } from './tower-rooms-feature.js?v=c153ec46'; FEATURES.push(towerRoomsFeature);
import { midTowerFeature } from './mid-tower-feature.js?v=efeefcdd'; FEATURES.push(midTowerFeature);
import { treeDeathFeature } from './tree-death-feature.js?v=9a4fe053'; FEATURES.push(treeDeathFeature);
import { enchantedForestFeature } from './enchanted-forest-feature.js?v=5b1a4c87'; FEATURES.push(enchantedForestFeature);
import { jujuBanditsFeature } from './juju-bandits-feature.js?v=ebcd674d'; FEATURES.push(jujuBanditsFeature);
import { craftybotFeature } from './craftybot-feature.js?v=408a3fb1'; FEATURES.push(craftybotFeature);
import { moodDecayFeature } from './mood-decay-feature.js?v=94ef0d97'; FEATURES.push(moodDecayFeature);
import { animalMoodFeature } from './animal-mood-feature.js?v=16852907'; FEATURES.push(animalMoodFeature);
import { butlerFeature } from './butler-feature.js?v=78209760'; FEATURES.push(butlerFeature);
import { mailCourierFeature } from './mail-courier-feature.js?v=92aef315'; FEATURES.push(mailCourierFeature);
import { pouchFeature } from './elemental-pouch-feature.js?v=1e35afdf'; FEATURES.push(pouchFeature);
import { bagsFeature } from './bags-feature.js?v=5cea431c'; FEATURES.push(bagsFeature);
import { hiSignsFeature } from './hi-signs-feature.js?v=8f5ee765'; FEATURES.push(hiSignsFeature);
import { gwendolynRoom23Feature } from './gwendolyn-room-23-feature.js?v=13b5c117'; FEATURES.push(gwendolynRoom23Feature);
import { cubimalRaceFeature } from './cubimal-race-feature.js?v=0137f83c'; FEATURES.push(cubimalRaceFeature);
import { symphoniousMaximusFeature } from './symphonious-maximus-feature.js?v=9fca63b1'; FEATURES.push(symphoniousMaximusFeature);
import { hiddenFloorsFeature } from './hidden-floors-feature.js?v=fff3374b'; FEATURES.push(hiddenFloorsFeature);
import { vicarsPeakFeature } from './vicars-peak-feature.js?v=cb444319'; FEATURES.push(vicarsPeakFeature);
import { rebuiltRoomsFeature } from './rebuilt-rooms-feature.js?v=b5232fd6'; FEATURES.push(rebuiltRoomsFeature);
import { towerFloorsFeature } from './tower-floors-feature.js?v=7f87d087'; FEATURES.push(towerFloorsFeature);
import { subwayFeature } from './subway-feature.js?v=c82a6788'; FEATURES.push(subwayFeature);
import { vendorNpcsFeature } from './vendor-npcs-feature.js?v=9facd5b4'; FEATURES.push(vendorNpcsFeature);
import { powdersFeature } from './powders-feature.js?v=3f824d08'; FEATURES.push(powdersFeature);
import { itemVerbsFeature } from './item-verbs-feature.js?v=3606a17a'; FEATURES.push(itemVerbsFeature);
import { artifactsFeature } from './artifacts-feature.js?v=3a263a0d'; FEATURES.push(artifactsFeature);
import { doorDrinkFeature } from './door-drink-feature.js?v=5ac6bf87'; FEATURES.push(doorDrinkFeature);
import { buffTriggersFeature } from './buff-triggers-feature.js?v=f2785ca5'; FEATURES.push(buffTriggersFeature);
import { snoConesFeature } from './sno-cones-feature.js?v=a27eaa58'; FEATURES.push(snoConesFeature);
import { bureaucraticHallsFeature } from './bureaucratic-halls-feature.js?v=2ae965cf'; FEATURES.push(bureaucraticHallsFeature);
import { potionsFeature } from './potions-feature.js?v=4a41a970'; FEATURES.push(potionsFeature);
import { purpleJourneyFeature } from './purple-journey-feature.js?v=ccf20fa6'; FEATURES.push(purpleJourneyFeature);
import { smallItemsFeature } from './small-items-feature.js?v=05bd7dbb'; FEATURES.push(smallItemsFeature);
import { crabsFeature } from './crabs-feature.js?v=d51f8772'; FEATURES.push(crabsFeature);
import { hellBarFeature } from './hell-bar-feature.js?v=036d4e8f'; FEATURES.push(hellBarFeature);
import { machineRoomsFeature } from './machine-rooms-feature.js?v=cf78e00a'; FEATURES.push(machineRoomsFeature);
import { soloFeatsFeature } from './solo-feats-feature.js?v=effeab1b'; FEATURES.push(soloFeatsFeature);
import { slashCommandsFeature } from './slash-commands-feature.js?v=c55c5629'; FEATURES.push(slashCommandsFeature);
import { hellTicketsFeature } from './hell-tickets-feature.js?v=81d7ad20'; FEATURES.push(hellTicketsFeature);
import { packTreeVerbsFeature } from './pack-tree-verbs-feature.js?v=fc641237'; FEATURES.push(packTreeVerbsFeature);
import { streetSpiritsFeature } from './street-spirits-feature.js?v=eb13e46c'; FEATURES.push(streetSpiritsFeature);
import { mapRoutesFeature } from './map-routes-feature.js?v=39c444e7'; FEATURES.push(mapRoutesFeature);
import { swfFeature } from './swf-feature.js?v=488bec8e'; FEATURES.push(swfFeature);
import { machineArtFeature } from './machine-art-feature.js?v=b1db10ed'; FEATURES.push(machineArtFeature);
import { conversationsFeature } from './conversations-feature.js?v=ce96d792'; FEATURES.push(conversationsFeature);
import { quoinShardsFeature } from './quoin-shards-feature.js?v=6916f329'; FEATURES.push(quoinShardsFeature);
import { helpMineFeature } from './help-mine-feature.js?v=8c20d897'; FEATURES.push(helpMineFeature);
import { familiarDialogFeature } from './familiar-dialog-feature.js?v=2fc8b1b5'; FEATURES.push(familiarDialogFeature);
import { spiritLonelinessFeature } from './spirit-loneliness-feature.js?v=53f3cd03'; FEATURES.push(spiritLonelinessFeature);
import { funpickleFeature } from './funpickle-feature.js?v=5bf13d48'; FEATURES.push(funpickleFeature);
import { qurazyFeature } from './qurazy-feature.js?v=1bdc4639'; FEATURES.push(qurazyFeature);
import { energyDecayFeature } from './energy-decay-feature.js?v=455dd40c'; FEATURES.push(energyDecayFeature);
import { partyFeature } from './party-feature.js?v=e0756bfb'; FEATURES.push(partyFeature);
import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=c8865e4d'; FEATURES.push(sharedQuoinsFeature);
import { tradeFeature } from './trade-feature.js?v=bad9746d'; FEATURES.push(tradeFeature);
import { ledgerFeature } from './ledger-feature.js?v=fb97c50f'; FEATURES.push(ledgerFeature);
import { buddiesFeature } from './buddies-feature.js?v=03deec5f'; FEATURES.push(buddiesFeature);
import { profilesFeature } from './profiles-feature.js?v=541c5384'; FEATURES.push(profilesFeature);
import { neighboursMpFeature } from './neighbours-mp-feature.js?v=b0839aac'; FEATURES.push(neighboursMpFeature);
import { questsMpFeature } from './quests-mp-feature.js?v=fe35cc59'; FEATURES.push(questsMpFeature);
import { groupsFeature } from './groups-feature.js?v=d41023ea'; FEATURES.push(groupsFeature);
import { giftsFeature } from './gifts-feature.js?v=39af38ce'; FEATURES.push(giftsFeature);
import { auctionsFeature } from './auctions-feature.js?v=93f7a50d'; FEATURES.push(auctionsFeature);
import { playerMailFeature } from './player-mail-feature.js?v=9ef2847e'; FEATURES.push(playerMailFeature);
import { followMpFeature } from './follow-mp-feature.js?v=e5a26e1b'; FEATURES.push(followMpFeature);
import { hogHaulMpFeature } from './hog-haul-mp-feature.js?v=bd99708a'; FEATURES.push(hogHaulMpFeature);
import { dropsMpFeature } from './drops-mp-feature.js?v=ad443388'; FEATURES.push(dropsMpFeature);
import { bugReportFeature } from './bug-report-feature.js?v=885d24cb'; FEATURES.push(bugReportFeature);
import { playerVerbsMpFeature } from './player-verbs-mp-feature.js?v=b4f82c89'; FEATURES.push(playerVerbsMpFeature);
import { snapsFeature } from './snaps-feature.js?v=e4764a0d'; FEATURES.push(snapsFeature);
import { homeStreetMpFeature } from './home-street-mp-feature.js?v=cefafee8'; FEATURES.push(homeStreetMpFeature);
import { swoonerfliesFeature } from './swoonerflies-feature.js?v=00c4b491'; FEATURES.push(swoonerfliesFeature);
import { homePoolMpFeature } from './home-pool-mp-feature.js?v=575920f2'; FEATURES.push(homePoolMpFeature);
import { yardVerbsMpFeature } from './yard-verbs-mp-feature.js?v=bdf09740'; FEATURES.push(yardVerbsMpFeature);
import { questVerbsFeature } from './quest-verbs-feature.js?v=7dfda702'; FEATURES.push(questVerbsFeature);
import { itemVerbsMoreFeature } from './item-verbs-more-feature.js?v=cce647db'; FEATURES.push(itemVerbsMoreFeature);
import { questPinsFeature } from './quest-pins-feature.js?v=e59012f1'; FEATURES.push(questPinsFeature);
import { zoneEffectsFeature } from './zone-effects-feature.js?v=6b079a9c'; FEATURES.push(zoneEffectsFeature);
import { updateReadyFeature } from './update-ready-feature.js?v=257c1dcb'; FEATURES.push(updateReadyFeature);
import { butlerImFeature } from './butler-im-feature.js?v=ea44853a'; FEATURES.push(butlerImFeature);
import { streetObjectsFeature } from './street-objects-feature.js?v=d6483289'; FEATURES.push(streetObjectsFeature);
import { realtimeFeature } from './realtime-feature.js?v=79fb4d5d'; FEATURES.push(realtimeFeature);
import { accountBackupFeature } from './account-backup-feature.js?v=399056e8'; FEATURES.push(accountBackupFeature);
