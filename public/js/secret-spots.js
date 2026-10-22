/**
 * The Eleven Secret Locations ("11 Clusters of DNAja vu", badge
 * eleven_secret_locations): pure rules (no DOM/Pixi). The Tower Secrets of the
 * Base of Jethimadh Tower (location.js handleTowerSecrets) live with the home
 * Tower in js/home-tower.js and features/home-tower-feature.js.
 *
 * Sources (glitch-GameServerJS, CC0):
 * - players/inc_eleven_secrets.js: the hunt starts at level 5
 *   (secretLocationsQuestLevel) unless the badge is held; 20 of the
 *   config.secret_spots are chosen (secretLocationsQuestNumToChoose); the ten
 *   Giants are shuffled and Lem is always the eleventh. Each pending spot on
 *   the current location shows the secret_location_marker overlay (110 x 110)
 *   and loops 11_SECRET_LOCATIONS_BEACON_LOOP. Walking in plays
 *   11_SECRET_LOCATIONS_COLLISION, stops the loop and turns the marker off;
 *   the VoG text, growl, favor and iMG follow (handleElevenSecrets, doGrowl),
 *   and the counter is incremented 1 s after the growl (elevenSecretsIncrement).
 *   On the eleventh the remaining markers are cleared.
 * - config_prod.js secret_spots: 100 spots { id, tsid, x, y }.
 * - locations/location.js handleElevenSecrets: a hitbox id starting
 *   `11spots_` or `11secrets_` on a pending spot's location; marker cancel and
 *   the rainbow_secretspot pc_overlay (players/player.js show_rainbow, 4 s,
 *   RAINBOW_SECRETSPOT) 600 ms later, the announcement 3500 ms later.
 * - achievements/eleven_secret_locations.js: group_count 11 over group
 *   eleven_secret_locations (+500 iMG, +20 favor with every Giant).
 * - glitch-overlays secret_location_marker.fla / rainbow_secretspot.fla (XFL,
 *   vector only): the marker is a 30 x 100 column of 16 rising cyan-white
 *   gradient blobs (#EFFEFD to transparent #A7F6FE) over a base glow and four
 *   flame licks, with red and green tinted copies behind; "off" shoots the
 *   blobs up while a flat glow flashes. The rainbow is five bands under the
 *   arched words "Secret Spot!" in cream letters with brown outlines and gold
 *   stars. The remake redraws both from those numbers.
 *
 * Remake decisions:
 * - All 100 spots map to imported street boxes (bottom-centre, screen space).
 * - The source shuffled with sort(random); the remake uses Fisher-Yates.
 * - The growl reuses the VoG message index (the source re-rolled it when the
 *   index was 0) and puts a space before "You gain".
 */

export const ELEVEN_GROUP = 'eleven_secret_locations';
export const ELEVEN_BADGE = 'eleven_secret_locations';
export const ELEVEN_TOTAL = 11;
/** secretLocationsQuestLevel. */
export const ELEVEN_START_LEVEL = 5;
/** secretLocationsQuestNumToChoose. */
export const ELEVEN_CHOOSE = 20;
/** The ten shuffled Giants; Lem always takes the eleventh spot. */
export const SECRET_GIANTS = Object.freeze(['alph', 'humbaba', 'cosma', 'spriggan', 'grendaline', 'zille', 'mab', 'tii', 'pot', 'friendly']);
export const SECRET_LAST_GIANT = 'lem';

/** Source timers (ms). */
export const SECRET_TIMING = Object.freeze({
  markerCancel: 600, // apiSetTimerX('apiSendMsg', 600, overlay_cancel)
  rainbowDelay: 600, // apiSetTimerX('show_rainbow', 600, 'rainbow_secretspot')
  rainbow: 4000, // show_rainbow duration
  announce: 3500, // apiSetTimerX('handleElevenSecrets', 3500)
  increment: 1000, // apiSetTimer('elevenSecretsIncrement', 1000)
});

/** doGrowl rewards: 50 favor + 100 iMG; Lem 100 favor and no iMG (the badge follows). */
export const SECRET_REWARD = Object.freeze({ favor: 50, xp: 100, lastFavor: 100 });

/** location_overlay width / height for secret_location_marker. */
export const SECRET_MARKER_SIZE = 110;

export const SECRET_SOUNDS = Object.freeze({
  beacon: '11_SECRET_LOCATIONS_BEACON_LOOP',
  collision: '11_SECRET_LOCATIONS_COLLISION',
  rainbow: 'RAINBOW_SECRETSPOT',
});

/** introFirst / introSecond (shown instead of the count text on the first find). */
export const SECRET_INTRO = Object.freeze([
  'Woah! Did you feel that? That was a DNA deja vu...',
  "See - when you were imagined up, your genetic macromolecules were pulled from random parts of the giants' brains.",
  'Everything in this world is made up of different combinations of the same microscopic imagination particles from the eleven giants...',
  '...and when you hit a genetic dust cluster that resembles your own glitchy makeup, you might find yourself getting a DNA deja vu (or "DNAja-vu") Just like this one.',
  'It may happen quickly, it may take you years, but eventually, you will find eleven hidden DNAja-vu clusters, unique to you.',
]);

export const SECRET_GIANT_MESSAGES = Object.freeze({
  alph: Object.freeze([
    "*YOWCH!*\nWha…? What was that? Some kind of shock?",
    "*POW*.\nWas that a deja vu of the DNA? Because it smells like burning hair.",
    "WOAH THERE!\nI swear I just felt a planet imploding. Did you feel that?!?",
  ]),
  humbaba: Object.freeze([
    "*FWAP!*\nYour mindicles are vibrating at a manic giant frequency.",
    "*YIKES*\nThis is like being trampled by a thousand hooves. What the...",
    "WHAT THE...\nYour fingernails are tingling with the force of this DNAja-vu.",
  ]),
  cosma: Object.freeze([
    "*SHHHHH*\nWhat was that? Did the air just freeze?",
    "*WHOA!*\nAre you still on your feet? Powerful DNAja-vu! Even MY eyeballs have gone wibbly.",
    "*HUSSHHHHH*\nI swear I just felt the winds converge.",
  ]),
  spriggan: Object.freeze([
    "*SHUDDER*.\nSo that’s a DNAja-vu? Smells like wet forests.",
    "You feel a rootlike tingling in your undertoes.\nWoah! DNAja-vu!",
    "DNAja-vu, right? I swear I just heard your limbs creak in the wind.",
  ]),
  grendaline: Object.freeze([
    "*SHUDDER*\nA sudden deluge of sadness stops you in your tracks.",
    "HUH?!?\nWhat's going on?!? You feel like you’re going under...",
    "*WOOOSH*\nYour folicles are recoiling. Is that possible?",
  ]),
  zille: Object.freeze([
    "*SHAZAM*\nAn avalanche of Zille's old thoughts almost crush you.",
    "HEY! WHAT THE... Did you hear that? Like a mountain creeping up behind you?",
    "You hear ancient gravel rattling through your brainicle passages. DNA deja vu, man.",
  ]),
  mab: Object.freeze([
    "WOAH.\nYour guts feel like they're being sucked into the earth.",
    "*YEEESH*\nYou feel like you're being buried alive... Make. It. Stop.",
    "Is this really one of those deja vu of the DNA? It smells like wet dirt.",
  ]),
  tii: Object.freeze([
    "CAN'T. THINK. DNA DEJA VU. TOO. STRONG. BRAIN. IMPLODING.",
    "*ZAP!*\nYou feel a mental link with Tii so strong you can smell burning synapse.",
    "WOAH.\nYour brain feels like it is the size of a planet.\nBut your skull remains small.",
  ]),
  lem: Object.freeze([
    "*FWAP!*\nLem's warm thoughts fuzzle in your brainicles. This feels good. You have explored well. You feel at peace.",
    "*PHEW.*\nYour brain sighs with the relief that this is your last DNA deja vu cluster.",
    "*POP!*\nOne last DNA deja vu. A sharp jolt in your brain, but a familiar one.\nThis feels almost peaceful.",
  ]),
  pot: Object.freeze([
    "*UUURGH*\nDoes deja vu of the DNA feel like food poisoning?",
    "YEEEEK!\nWhat wa… who the… did you feel that?!",
    "*ZJUK-FFF-NNNG*\nIntestines? Being tied in complex knots? Or something?",
  ]),
  friendly: Object.freeze([
    "*POW!*\nA strong DNAja-vu vibration is making your eyes go funny.",
    "*YEEEESH!*\nPowerful wave of sweet nausea, friendly?!? What *was* that?",
    "*SHAZAYAM*\nI feel dizzy. Can a deja vu of the DNA make you dizzy?",
  ]),
});

export const SECRET_GIANT_GROWLS = Object.freeze({
  alph: Object.freeze([
    "The power of Alph is reverberating in your cellular membranes. The DNAja-vu feels like an electric shock.",
    "An Alph-specific DNAja-vu fizzles through your veins. You feel the urge to go tinker with something.",
    "One of Alph's own memories flashed through your brain faster than you could catch in a moment of DNAja-vu.",
  ]),
  humbaba: Object.freeze([
    "The connection to Humbaba is strong in this spot. Your synapses are feeling all bamboozled by giant memories.",
    "The sense of Humbaba in this particular spot is enough to make your nucleotide polymers jangle. Strong DNAja-vu, here.",
    "The overwhelming sense of precognition almost fells you. Humbaba must have very carefully woven her imagination into this place.",
  ]),
  cosma: Object.freeze([
    "You feel the power of Cosma vibrating the air in your bronchioles. This is one crazy DNAja-vu.",
    "A powerful Cosma-infused DNAja-vu rushes your nerve endings and leaves you unable to breathe for a second.",
    "Cosma's own recolllection of imagining up the 7 directions of the winds just rushed through your brain in a DNAja-vu. It was pretty overwhelming.",
  ]),
  spriggan: Object.freeze([
    "Your synapses buzz with a Spriggan-centric DNA deja vu. Spriggan must have put a lot of thought into this place.",
    "Your mitochondria tingle as the Spriggan-imagined parts of your DNA resonate with the Sprigganness of this place.",
    "Spriggan must have imagined this place up. The Spriggot parts of your DNA are shivering in recognition.",
  ]),
  grendaline: Object.freeze([
    "You're temporarily stunned by a rush of memories. From what you can tell, they seem to be Grendaline's.",
    "You're incapacitated by an ocean of Grendalinian DNAja-vu bearing down on you. She must have poured a lot of imagination into this spot.",
    "The power of Grendaline is reverberating in your chloroplastic membranes. This is a powerful DNAja-vu spot.",
  ]),
  zille: Object.freeze([
    "The connection to Zille in this spot is so strong that the DNAja-vu in this spot could feasibly crush you.",
    "Zille must have poured some heavy imagination into this spot. Your chromosomes are rattling in recognition.",
    "Briefly, your DNA-dust connection to Zille is so strong that you hear her old thoughts. You forget them immediately. Far too heavy.",
  ]),
  mab: Object.freeze([
    "A sudden DNAja-vu digs deep into your cellular membranes and sucks them downward. Your connection to Mab is strong here.",
    "A strong Mab-centric DNAja-vu changes the gravity in your synapses and makes you feel all weird.",
    "Your mitochondrial membranes soak up the earthiness that Mab imagined into this spot. It is a strong DNAja-vu.",
  ]),
  tii: Object.freeze([
    "Your mental connection to Tii is so strong in this location that you feel your ears being sucked inward.",
    "You're overwhelmed by a DNAja-vu. Your brain starts working by itself in strange, Tii-like loops and clusters.",
    "Briefly, the DNAja-vu connection with Tii in this spot makes you feel like you have all Tii's thoughts in your head at once. It hurts.",
  ]),
  lem: Object.freeze([
    "Your last DNAja-vu makes you feel warm and fuzzy. Every Lemmite molecule in you reverberates joyfully at the amount of wandering you have done to get here.",
    "You can feel your genetic closeness to Lem in this place. Your long hours of exploration have filled the Giant with pride.",
    "You feel proud of all the exploring you have done to find your DNAja-vu clusters. The strong connection with Lem in this place reassures you of this.",
  ]),
  pot: Object.freeze([
    "The strong connection to Pot here is fiddling with your polynucleotides, and making them feel all ooky.",
    "This spot contains such a strong imaginational cluster connecting you to Pot that it feels as if you're wearing someone else's arms.",
    "The DNAja-vu in this location is so rooted to Pot that every piece of food inside you feels like it's being recalled to its creator.",
  ]),
  friendly: Object.freeze([
    "You feel an overwhelming rush of Friendly vibrations caused by a DNA deja vu in this spot.",
    "The connection to Friendly is strong in this place. The reverberation in your synapses makes you feel pukey.",
    "The feeling of DNAja-vu courses through your veins like a triple-hooched Spicy Grog. Your connection to Friendly is strong here.",
  ]),
});

/** config_prod.js secret_spots (100): hitbox id, location tsid, overlay x/y in location coordinates. */
export const SECRET_SPOTS = Object.freeze([
  Object.freeze({ id: '11spots_aranna_01', tsid: 'LHVT10TNRIA23L2', x: -1262, y: -864 }),
  Object.freeze({ id: '11spots_aranna_02', tsid: 'LHV1H71LPKA2P7G', x: 1176, y: -851 }),
  Object.freeze({ id: '11spots_aranna_03', tsid: 'LHVGSE15MQA2OGE', x: 1999, y: -802 }),
  Object.freeze({ id: '11spots_aranna_04', tsid: 'LHV1HKHRSKA2CR9', x: 2841, y: -618 }),
  Object.freeze({ id: '11spots_aranna_05', tsid: 'LHVMK86NP7B26E6', x: 2392, y: -702 }),
  Object.freeze({ id: '11spots_kalavana_01', tsid: 'LA91SD0IEQA24L5', x: 2402, y: -564 }),
  Object.freeze({ id: '11spots_kalavana_02', tsid: 'LA9M05J386A296V', x: -658, y: -720 }),
  Object.freeze({ id: '11spots_kalavana_03', tsid: 'LA931JPPT8A2LPU', x: -2073, y: -704 }),
  Object.freeze({ id: '11spots_kalavana_04', tsid: 'LA9I8CS028A2O5F', x: -733, y: -860 }),
  Object.freeze({ id: '11spots_kalavana_05', tsid: 'LA9T7IFRDIA2N0K', x: -1850, y: -600 }),
  Object.freeze({ id: '11spots_besara_01', tsid: 'LA9G6MA4P6923PH', x: -949, y: -874 }),
  Object.freeze({ id: '11spots_besara_02', tsid: 'LA95G0P137927B4', x: 155, y: -827 }),
  Object.freeze({ id: '11spots_besara_03', tsid: 'LA9ELDLMNE92JHO', x: 2943, y: -799 }),
  Object.freeze({ id: '11spots_besara_04', tsid: 'LA91O38QQ192K8J', x: -487, y: -751 }),
  Object.freeze({ id: '11spots_besara_05', tsid: 'LA9I92MRBE92S8Q', x: -2877, y: -841 }),
  Object.freeze({ id: '11spots_besara_06', tsid: 'LA99NEQK1F92ICE', x: 2857, y: -769 }),
  Object.freeze({ id: '11spots_besara_07', tsid: 'LA9BRBV8Q492K6R', x: -1482, y: -74 }),
  Object.freeze({ id: '11spots_tamila_01', tsid: 'LIF7SHGS3E72T8L', x: -2798, y: -798 }),
  Object.freeze({ id: '11spots_tamila_02', tsid: 'LIFF11B2RE72HMI', x: -2902, y: -764 }),
  Object.freeze({ id: '11spots_tamila_03', tsid: 'LIF16GDJ89724E3', x: -118, y: -741 }),
  Object.freeze({ id: '11spots_tamila_04', tsid: 'LIF160988972VND', x: -687, y: -811 }),
  Object.freeze({ id: '11spots_tamila_05', tsid: 'LIF152TCV8720Q6', x: 2690, y: -820 }),
  Object.freeze({ id: '11spots_muufo_01', tsid: 'LA9NT2E8FF8243N', x: -988, y: -615 }),
  Object.freeze({ id: '11spots_muufo_02', tsid: 'LA961CLV4G8252G', x: -2197, y: -795 }),
  Object.freeze({ id: '11spots_muufo_03', tsid: 'LA9S90EJ0G8241N', x: 140, y: -838 }),
  Object.freeze({ id: '11spots_muufo_04', tsid: 'LA9IHQQSCF820VN', x: -1566, y: -748 }),
  Object.freeze({ id: '11spots_muufo_05', tsid: 'LA92VDUR8D82E3F', x: 357, y: -674 }),
  Object.freeze({ id: '11spots_muufo_06', tsid: 'LA9KL81E1D82ABT', x: 1148, y: -790 }),
  Object.freeze({ id: '11spots_bortola_01', tsid: 'LHVAKM1MR032IGJ', x: -26, y: -682 }),
  Object.freeze({ id: '11spots_bortola_02', tsid: 'LHV1HT5F4D32GNM', x: 1466, y: -1024 }),
  Object.freeze({ id: '11spots_bortola_03', tsid: 'LIF38KRD8S12HAR', x: 1162, y: -642 }),
  Object.freeze({ id: '11spots_bortola_04', tsid: 'LHV1H1EHOF32UJM', x: 1153, y: -994 }),
  Object.freeze({ id: '11spots_bortola_05', tsid: 'LIFU7EN0HN12ETM', x: -2247, y: -1072 }),
  Object.freeze({ id: '11spots_bortola_06', tsid: 'LIFNRF3P0E02J90', x: -1671, y: -927 }),
  Object.freeze({ id: '11spots_kajuu_01', tsid: 'LHV4AC2C3C42172', x: 795, y: -898 }),
  Object.freeze({ id: '11spots_kajuu_02', tsid: 'LHV15B8HEQ32SN0', x: -589, y: -2231 }),
  Object.freeze({ id: '11spots_kajuu_03', tsid: 'LHV1FUFU9442AKR', x: 2856, y: -699 }),
  Object.freeze({ id: '11spots_kajuu_04', tsid: 'LHV15C8IEQ322UG', x: -585, y: -2266 }),
  Object.freeze({ id: '11spots_kajuu_05', tsid: 'LHV15EUNEQ32FCI', x: -2906, y: -604 }),
  Object.freeze({ id: '11spots_kajuu_06', tsid: 'LHV1BIOIL142P25', x: 2914, y: -796 }),
  Object.freeze({ id: '11spots_andra_01', tsid: 'LA55645B8O528MI', x: -2853, y: -720 }),
  Object.freeze({ id: '11spots_andra_02', tsid: 'LA5DVVGJQQ5237U', x: -670, y: -761 }),
  Object.freeze({ id: '11spots_andra_03', tsid: 'LA5VDIGU3G525F9', x: 91, y: -1508 }),
  Object.freeze({ id: '11spots_andra_04', tsid: 'LA51B2OQAK623EF', x: -2851, y: -605 }),
  Object.freeze({ id: '11spots_andra_05', tsid: 'LA51701PF262LC8', x: 2756, y: -694 }),
  Object.freeze({ id: '11spots_andra_06', tsid: 'LA51BNNOEK629KG', x: 2730, y: -670 }),
  Object.freeze({ id: '11spots_salatu_01', tsid: 'LIFQMHF4MT72V9Q', x: 2575, y: -525 }),
  Object.freeze({ id: '11spots_salatu_02', tsid: 'LIFF72DU3O727EA', x: 158, y: -181 }),
  Object.freeze({ id: '11spots_salatu_03', tsid: 'LIF14KB3T872MAH', x: -2913, y: -855 }),
  Object.freeze({ id: '11spots_salatu_04', tsid: 'LIFKPQEDFG722M5', x: 2696, y: -843 }),
  Object.freeze({ id: '11spots_salatu_05', tsid: 'LIFFIRQ00P729BS', x: 2155, y: -318 }),
  Object.freeze({ id: '11spots_salatu_06', tsid: 'LIFJP2UC80820D3', x: 2798, y: -587 }),
  Object.freeze({ id: '11spots_alakol_01', tsid: 'LCRTAJK5UN124GG', x: -2845, y: -607 }),
  Object.freeze({ id: '11spots_alakol_02', tsid: 'LHV1HLGUT212JNT', x: -2662, y: -807 }),
  Object.freeze({ id: '11spots_alakol_03', tsid: 'LCR146VPNK12CTU', x: -535, y: -1982 }),
  Object.freeze({ id: '11spots_alakol_04', tsid: 'LHVQU18N3O021A5', x: 2413, y: -863 }),
  Object.freeze({ id: '11spots_alakol_05', tsid: 'LCR29V8S4Q12IF4', x: 856, y: -753 }),
  Object.freeze({ id: '11spots_alakol_06', tsid: 'LHV1E645M21278O', x: 2909, y: -732 }),
  Object.freeze({ id: '11spots_groddleheights_01', tsid: 'LCR10K63BQL14PE', x: -1850, y: -1050 }),
  Object.freeze({ id: '11spots_groddleheights_02', tsid: 'LCR10H9E3QJ1E2P', x: 258, y: -734 }),
  Object.freeze({ id: '11spots_groddleheights_03', tsid: 'LCR12NU45AM12BB', x: 440, y: -1014 }),
  Object.freeze({ id: '11spots_groddleheights_04', tsid: 'LCR103T98QJ1SC9', x: -517, y: -700 }),
  Object.freeze({ id: '11spots_groddleheights_05', tsid: 'LCR16BA1SSL1P7K', x: -2847, y: -687 }),
  Object.freeze({ id: '11spots_groddleheights_06', tsid: 'LCR16AUURSL1KTM', x: 2828, y: -497 }),
  Object.freeze({ id: '11spots_groddlemeadow_01', tsid: 'LCR14062REM1QIR', x: -1556, y: -855 }),
  Object.freeze({ id: '11spots_groddlemeadow_02', tsid: 'LCR13VM1REM1GHI', x: 1216, y: -871 }),
  Object.freeze({ id: '11spots_groddlemeadow_03', tsid: 'LCR11JA67NJ15N3', x: 845, y: -287 }),
  Object.freeze({ id: '11spots_groddlemeadow_04', tsid: 'LCR10M2FUJK177P', x: -2923, y: -314 }),
  Object.freeze({ id: '11spots_groddlemeadow_05', tsid: 'LLI334UG2UD1IKQ', x: -2433, y: -882 }),
  Object.freeze({ id: '11spots_groddleforest_01', tsid: 'LLI2V30ECRD1GAU', x: -227, y: -562 }),
  Object.freeze({ id: '11spots_groddleforest_02', tsid: 'LLI2HHRC84F1TJ6', x: -2881, y: -796 }),
  Object.freeze({ id: '11spots_groddleforest_03', tsid: 'LCR13M5UQEM15TA', x: 1713, y: -712 }),
  Object.freeze({ id: '11spots_groddleforest_04', tsid: 'LLI2V0UN7RD1T2J', x: 1772, y: -443 }),
  Object.freeze({ id: '11spots_groddleforest_05', tsid: 'LLI3272LOTD1B1F', x: -2824, y: -946 }),
  Object.freeze({ id: '11spots_groddleforest_06', tsid: 'LCR14HPKPBK1U25', x: 812, y: -689 }),
  Object.freeze({ id: '11spots_shimlamirch_01', tsid: 'LTJLTCN21IQ1URB', x: 1792, y: -365 }),
  Object.freeze({ id: '11spots_shimlamirch_02', tsid: 'LTJ1024R2DQ1B5S', x: 536, y: -511 }),
  Object.freeze({ id: '11spots_shimlamirch_03', tsid: 'LTJ102LVLDQ1NGH', x: 707, y: -518 }),
  Object.freeze({ id: '11spots_shimlamirch_04', tsid: 'LTJ10B0UHQQ172V', x: 315, y: -447 }),
  Object.freeze({ id: '11spots_shimlamirch_05', tsid: 'LTJ11KEKAKO196V', x: -1371, y: -753 }),
  Object.freeze({ id: '11spots_jethimadh_01', tsid: 'LA97L62229522GS', x: 1080, y: -784 }),
  Object.freeze({ id: '11spots_jethimadh_02', tsid: 'LIF12UPTEUV14ON', x: -838, y: -578 }),
  Object.freeze({ id: '11spots_jethimadh_03', tsid: 'LIFMVP96ONU12CO', x: -975, y: -579 }),
  Object.freeze({ id: '11spots_jethimadh_04', tsid: 'LIF1609JRKV151E', x: -2334, y: -929 }),
  Object.freeze({ id: '11spots_jethimadh_05', tsid: 'LIF13FGQHKV1E72', x: -1704, y: -873 }),
  Object.freeze({ id: '11spots_chakraphool_01', tsid: 'LTJ154SP8102KIG', x: 2875, y: -685 }),
  Object.freeze({ id: '11spots_chakraphool_02', tsid: 'LTJ10HO3FAV1HDD', x: -555, y: -1323 }),
  Object.freeze({ id: '11spots_chakraphool_03', tsid: 'LTJ1539P8102B2F', x: -407, y: -739 }),
  Object.freeze({ id: '11spots_chakraphool_04', tsid: 'LTJ10KOCHTU1N89', x: -2811, y: -622 }),
  Object.freeze({ id: '11spots_chakraphool_05', tsid: 'LIFDIDJT0GU1CR8', x: -2183, y: -975 }),
  Object.freeze({ id: '11spots_ilmenskie_caverns_01', tsid: 'LLI107JLRU11EM2', x: 126, y: -192 }),
  Object.freeze({ id: '11spots_ilmenskie_caverns_02', tsid: 'LHH101L162117H2', x: -49, y: -759 }),
  Object.freeze({ id: '11spots_ilmenskie_caverns_03', tsid: 'LHH112FHF411BUI', x: 723, y: -765 }),
  Object.freeze({ id: '11spots_ilmenskie_caverns_04', tsid: 'LLI101QQRA211SM', x: -462, y: -461 }),
  Object.freeze({ id: '11spots_ilmenskie_caverns_05', tsid: 'LHH12E1QP611OPA', x: -221, y: 1066 }),
  Object.freeze({ id: '11spots_ilmenskie_deeps_01', tsid: 'LA91JU4QQ712DJN', x: -698, y: -594 }),
  Object.freeze({ id: '11spots_ilmenskie_deeps_02', tsid: 'LM112V6OCA126K1', x: -662, y: -110 }),
  Object.freeze({ id: '11spots_ilmenskie_deeps_03', tsid: 'LA9DNT3I2U22RS7', x: -2187, y: -1001 }),
  Object.freeze({ id: '11spots_ilmenskie_deeps_04', tsid: 'LA9QKFSST732VNK', x: 670, y: 368 }),
  Object.freeze({ id: '11spots_ilmenskie_deeps_05', tsid: 'LA9ENT2CRE22NFB', x: -686, y: 619 }),
]);

/* ------------------------------------------------------------------ */
/* Spots and streets                                                   */
/* ------------------------------------------------------------------ */

const SPOT_BY_ID = new Map(SECRET_SPOTS.map((s) => [s.id, s]));

export function secretSpot(id) {
  return SPOT_BY_ID.get(id) || null;
}

/** L-tsid (locations) to the imported street key (geometry G-tsid). */
export function streetKeyFor(tsid) {
  const t = String(tsid || '');
  return t ? `G${t.slice(1)}` : '';
}

/** Same location whatever the prefix (LHV... vs GHV...). */
export function sameLocation(a, b) {
  return Boolean(a && b) && String(a).slice(1) === String(b).slice(1);
}

/** location.js handleElevenSecrets: the hitbox ids that count. */
export function isSecretBoxId(id) {
  const s = String(id || '');
  return s.startsWith('11spots_') || s.startsWith('11secrets_');
}

/**
 * The street box for a spot ({ id, x, y, w, h }, screen space, bottom-centre),
 * falling back to the config x/y converted with the street bounds.
 */
export function spotBox(street, spot) {
  if (!street || !spot) return null;
  const box = (street.boxes || []).find((b) => b?.id === spot.id);
  if (box) return { id: box.id, x: box.x, y: box.y, w: Math.abs(box.w) || 80, h: Math.abs(box.h) || 100 }; // one box is flipped (w -80)
  if (!sameLocation(street.tsid, spot.tsid)) return null;
  const { l = 0, t = 0 } = street.bounds || {};
  return { id: spot.id, x: spot.x - l, y: spot.y - t, w: 80, h: 100 };
}

/** Avatar body (feet at x, y) used for hitbox overlap: the client hit-tested the avatar, not a point. */
export const SECRET_BODY = Object.freeze({ w: 40, h: 90 });

/** Whether the avatar body overlaps a bottom-centre box. */
export function bodyHitsBox(box, x, y, body = SECRET_BODY) {
  if (!box) return false;
  const half = (Math.abs(Number(box.w)) || 80) / 2 + body.w / 2;
  if (Math.abs(x - box.x) > half) return false;
  const top = box.y - (Math.abs(Number(box.h)) || 100);
  return y >= top && y - body.h <= box.y;
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export function createSecretState() {
  return { started: false, done: false, spots: [], giants: [], found: [] };
}

const knownIds = (list) => (Array.isArray(list) ? list.filter((id) => SPOT_BY_ID.has(id)) : []);

/** Save normalization: unknown ids dropped, found kept to chosen spots, giants a permutation. */
export function normalizeSecretState(raw = {}) {
  const st = createSecretState();
  if (!raw || typeof raw !== 'object') return st;
  st.spots = [...new Set(knownIds(raw.spots))].slice(0, ELEVEN_CHOOSE);
  st.found = [...new Set(knownIds(raw.found))].filter((id) => st.spots.includes(id)).slice(0, ELEVEN_TOTAL);
  const giants = Array.isArray(raw.giants) ? raw.giants.filter((g) => SECRET_GIANTS.includes(g)) : [];
  st.giants = new Set(giants).size === SECRET_GIANTS.length ? giants.slice() : [];
  st.started = raw.started === true && st.spots.length > 0 && st.giants.length === SECRET_GIANTS.length;
  st.done = raw.done === true || st.found.length >= ELEVEN_TOTAL;
  if (st.done) st.started = true;
  if (!st.started && !st.done) return createSecretState();
  return st;
}

/** Fisher-Yates over a copy with an injectable rng (0 <= r < 1). */
export function shuffled(list, rng = Math.random) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * startSecretLocationsQuest: from level 5, unless the badge is held (then the
 * data is cleared and the hunt is over) or a hunt is already running.
 * Returns true when a new hunt began.
 */
export function startSecretHunt(state, { level = 1, hasBadge = false, rng = Math.random, force = false } = {}) {
  if (hasBadge) {
    Object.assign(state, { started: true, done: true, spots: [], giants: [], found: state.found || [] });
    return false;
  }
  if (state.started || state.done) return false;
  if (!force && (Number(level) || 0) < ELEVEN_START_LEVEL) return false;
  state.spots = shuffled(SECRET_SPOTS.map((s) => s.id), rng).slice(0, ELEVEN_CHOOSE);
  state.giants = shuffled(SECRET_GIANTS, rng);
  state.found = [];
  state.started = true;
  state.done = false;
  return true;
}

/** Chosen spots not yet found (none once the hunt is done). */
export function pendingSpots(state) {
  if (!state?.started || state.done) return [];
  return state.spots.filter((id) => !state.found.includes(id)).map(secretSpot).filter(Boolean);
}

/** showSecretLocationMarker: pending spots on this street. */
export function pendingSpotsOn(state, streetTsid) {
  return pendingSpots(state).filter((s) => sameLocation(s.tsid, streetTsid));
}

/** The Giant for the nth find: the shuffled ten, then Lem. */
export function giantForCount(state, count) {
  if (count >= ELEVEN_TOTAL) return SECRET_LAST_GIANT;
  return state?.giants?.[count - 1] || SECRET_GIANTS[(count - 1) % SECRET_GIANTS.length];
}

/**
 * hasSecretLocation + removeSecretLocation: a pending spot on this street was
 * entered. Returns { id, count, giant, last } or null.
 */
export function triggerSecretSpot(state, id, streetTsid) {
  if (!isSecretBoxId(id)) return null;
  const spot = pendingSpotsOn(state, streetTsid).find((s) => s.id === id);
  if (!spot) return null;
  state.found.push(id);
  const count = state.found.length;
  const last = count >= ELEVEN_TOTAL;
  if (last) state.done = true; // clearRemainingSecretOverlays + secret_locations = []
  return { id, count, giant: giantForCount(state, count), last };
}

/* ------------------------------------------------------------------ */
/* Copy and rewards                                                    */
/* ------------------------------------------------------------------ */

export function progressText(count) {
  return `You stumbled on another unique cluster of genetic dust, triggering a DNA deja vu... (${count}/11)`;
}

/** common.js capitalize. */
export function capitalizeGiant(giant) {
  return String(giant || '').replace(/\w+/g, (a) => a.charAt(0).toUpperCase() + a.slice(1).toLowerCase());
}

/**
 * The vp_overlay pages for a find: the intro (introFirst, then introSecond's
 * four pages) on the first, else the count text and the Giant's message.
 */
export function announcementPages(count, giant, messageIndex = 0) {
  if (count <= 1) return SECRET_INTRO.slice();
  const msgs = SECRET_GIANT_MESSAGES[giant] || SECRET_GIANT_MESSAGES.lem;
  return [progressText(count), msgs[((messageIndex % 3) + 3) % 3]];
}

/** doGrowl: favor giant id (Tii's favor key is `ti`), favor points and iMG. */
export function secretReward(giant, count) {
  const last = count >= ELEVEN_TOTAL;
  return {
    favorGiant: giant === 'tii' ? 'ti' : giant,
    favor: last ? SECRET_REWARD.lastFavor : SECRET_REWARD.favor,
    xp: last ? 0 : SECRET_REWARD.xp,
  };
}

/** The growl activity line with what actually landed. */
export function growlText(giant, messageIndex = 0, { favor = 0, xp = 0 } = {}) {
  const growls = SECRET_GIANT_GROWLS[giant] || SECRET_GIANT_GROWLS.lem;
  let effects = '';
  if (favor) effects += `You gain ${favor} favor with ${capitalizeGiant(giant)}. `;
  if (xp) effects += `You gain ${xp} iMG.`;
  return `${growls[((messageIndex % 3) + 3) % 3]} ${effects}`.trim();
}

/** The counter that feeds the badge's group_count. */
export function secretCounter(id) {
  return `${ELEVEN_GROUP}:${id}`;
}

/* ------------------------------------------------------------------ */
/* Marker timeline (secret_location_marker.fla, 30 fps)                */
/* ------------------------------------------------------------------ */

export const MARKER_FPS = 30;
/** 'active' loops frames 0-89 (gotoAndPlay('active') on frame 89). */
export const MARKER_LOOP_FRAMES = 90;
/** 'off' runs frames 90-117 and stops. */
export const MARKER_OFF_FRAMES = 28;

/**
 * The 16 rising blobs: x (symbol px) and the frame each is born at the base.
 * Read from the flamoid layers: every blob rises from about +40 (alpha 0) to
 * 0 (alpha 1) in 45 frames, then to about -40 (alpha 0) in 45 more.
 */
export const MARKER_BLOBS = Object.freeze([
  [-0.6, 0], [2.6, 5], [-4.5, 12], [-7.5, 18], [-1.8, 26], [4.8, 32], [3.4, 34], [-1.4, 42],
  [-4, 48], [6, 48], [-10.5, 52], [8.8, 59], [6, 65], [11.5, 73], [-5.2, 78], [-7.5, 86],
].map(([x, born]) => Object.freeze({ x, born })));

/** Blob pose at a loop frame: y (symbol px, + is down) and alpha. */
export function blobPose(blob, frame) {
  const p = (((frame - blob.born) % MARKER_LOOP_FRAMES) + MARKER_LOOP_FRAMES) % MARKER_LOOP_FRAMES;
  const half = MARKER_LOOP_FRAMES / 2;
  if (p < half) return { y: 40 - (40 * p) / half, alpha: p / half };
  return { y: -((p - half) / half) * 40, alpha: 1 - (p - half) / half };
}
