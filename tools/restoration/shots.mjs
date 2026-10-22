/**
 * Screenshots for the restoration page, captured from the live game by
 * tools/restoration/capture.mjs into public/restoration/shots/<key>.webp
 * (room shots as room-<room>.webp). Each entry is a QA route plus optional
 * shot.mjs-style steps. frame: 'world' crops to the street view above the
 * pack; 'panel' keeps the whole game area so an open panel shows.
 */
const Q = '?autostart=1&fresh=1&resetgame=1&questoffer=off&questfx=0';

export const SHOTS = Object.freeze({
  streets: { route: `${Q}`, wait: 9000 },
  navigation: { route: `${Q}&doordemo=GLI32G3NUTD100I`, wait: 11000 },
  physics: { route: `${Q}&streetdemo=GUVUMTSQ2FC34ES`, wait: 11000 },
  'street-events': { route: `${Q}&puzzledemo=GHVOD0F3T403694`, wait: 12000 },
  camera: { route: `${Q}&camerademo=1&cameraskill=1&cameralook=-1100,-60`, wait: 12000 },
  avatar: { route: `${Q}&emotiondemo=happy`, wait: 9000 },
  piggies: { route: `${Q}&animaldemo=piggy&animalrank=2`, wait: 9000 },
  butterflies: { route: `${Q}&animaldemo=butterfly&animalrank=2&tooldemo=butterfly_lotion&toolremaining=5`, wait: 9000 },
  trants: { route: `${Q}&harvestdemo=fruit&harvestrank=2&harvestreset=1`, wait: 9000 },
  foxes: { route: `${Q}&foxdemo=1`, wait: 11000 },
  batterflies: { route: `${Q}&streetdemo=GA9114MS8B32FB2`, wait: 11000 },
  gardens: { route: `${Q}&mastergardendemo=1`, wait: 10000 },
  mining: { route: `${Q}&rockdemo=sparkly`, wait: 9000 },
  cooking: { route: `${Q}`, wait: 8000, frame: 'panel', steps: [{ click: '#make-btn' }, { wait: 1200 }] },
  quoins: { route: `${Q}&quoindemo=qurazy`, wait: 9000 },
  shrines: { route: `${Q}&shrinedemo=1`, wait: 10000 },
  imagination: { route: `${Q}&imgdemo=1&imglevel=12`, wait: 10000, frame: 'panel' },
  badges: { route: `${Q}&badgeqa=1`, wait: 9000, frame: 'panel', steps: [{ click: '#more-btn' }, { click: '#achieve-btn' }, { wait: 1500 }] },
  quests: { route: '?autostart=1&fresh=1&resetgame=1&questoffer=now', wait: 16000, frame: 'panel' },
  'story-quests': { route: `${Q}&questdemo=winter&winterautoplay=surface`, wait: 16000 },
  paradise: { route: `${Q}&paradise=cloud_rings&paradisepreview=ring&paradisefx=0`, wait: 12000 },
  races: { route: `${Q}&racedemo=space_race&raceassist=1&raceautoplay=1`, wait: 16000 },
  'hog-haul': { route: `${Q}&questdemo=hoghaul&racedemo=1&raceassist=1`, wait: 14000 },
  'street-jobs': { route: `${Q}&jobdemo=351`, wait: 10000 },
  parties: { route: `${Q}&partydemo=moon&partyautoplay=hold`, wait: 16000 },
  homes: { route: `${Q}&homedemo=decorate`, wait: 12000 },
  neighbours: { route: `${Q}&stonedemo=1&stoneautoplay=1`, wait: 16000 },
  rooks: { route: `${Q}&rookdemo=attack&rookfx=hold`, wait: 12000 },
  skills: { route: `${Q}&skilltree=mining_3`, wait: 9000, frame: 'panel' },
  meditation: { route: `${Q}&meditatedemo=all&meditateroll=0.99&meditateautoplay=levitate&meditatelevhold=1`, wait: 14000 },
  icons: { route: `${Q}&icondemo=1&iconautoplay=place`, wait: 16000 },
  rube: { route: `${Q}&rubedemo=1&rubeautoplay=offer&rubeseed=3`, wait: 20000, frame: 'panel' },
  hell: { route: `${Q}&helldemo=croak`, wait: 12000 },
  collectibles: { route: `${Q}&stootdemo=1&stootdollautoplay=1&stootquote=38`, wait: 12000 },

  'room:rainbow_run': { route: `${Q}&questdemo=numismatic_hustle&questautoplay=ready`, wait: 16000 },
  'room:top_of_tree': { route: `${Q}&questdemo=high_jump`, wait: 12000 },
  'room:color_unblocking': { route: `${Q}&questdemo=puzzle_level_color_blockage`, wait: 12000 },
  'room:vision_quest': { route: `${Q}&questdemo=eyeballery_identify_object`, wait: 14000 },
  'room:kids_room': { route: `${Q}&questdemo=letter_block_1`, wait: 12000 },
  'room:rube_yard': { route: `${Q}&questdemo=rube_spy`, wait: 12000 },
  'room:le_miserable': { route: `${Q}&questdemo=le_miserable`, wait: 14000 },
  'room:juju_camp': { route: `${Q}&questdemo=help_juju_bandits&questautoplay=scene`, wait: 20000 },
  'room:picto_pattern': { route: `${Q}&questdemo=picto_pattern&questautoplay=solve1`, wait: 18000 },
  'room:radiant_glare': { route: `${Q}&questdemo=radiant_glare&questautoplay=mixer`, wait: 18000 },
  'room:an_autumn_day': { route: `${Q}&questdemo=an_autumn_day`, wait: 12000 },
  'room:being_watched': { route: `${Q}&questdemo=stale_but_necessary&questautoplay=veil`, wait: 18000 },
  'room:back_alley': { route: `${Q}&questdemo=fuelmaking_refuel_robot&backalleystage=station`, wait: 14000 },
  'room:clubhouse': { route: `${Q}&questdemo=join_club`, wait: 14000 },
  'room:light_perspective': { route: `${Q}&questdemo=puzzle_level_light_perspective&questautoplay=mix`, wait: 18000 },
  'room:tile_puzzle': { route: `${Q}&questdemo=btc_room_3`, wait: 12000 },
  'room:operation_grow': { route: `${Q}&questdemo=where_the_blue_grew`, wait: 12000 },
});
