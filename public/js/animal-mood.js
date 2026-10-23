/**
 * Piggy mood and hunger, self-feeding, and animal sadness, ported from Tiny
 * Speck's GSJS (CC0). Pure rules: the animal-mood feature puts them on the
 * street, the back yard replays them through advanceYard (animal-husbandry.js).
 *
 * Sources (glitch-GameServerJS/items/):
 * - npc_piggy.js onCreate 1433-1472: mood 1, hunger 0, onTwiceDaily every
 *   game_days_to_ms(0.5) (two real hours), is_daily starts at 1.
 * - npc_piggy.js onTwiceDaily 1832-2040: a rooked or sad piggy skips the
 *   tick; is_daily flips; on the daily half the piggy loses 1 mood unless
 *   has_been_petted (never set anywhere in GSJS, so the loss is every game
 *   day; a pet's +1 is what keeps it up), then if other animals on the street
 *   average mood >= 1 a mood-0 piggy goes to 1 ("Other animals make me
 *   happy!"); hunger +1 each half day below 2, then +1 only on the daily half
 *   up to 10; at 10 the onCroaking interval starts and there is a 50% chance
 *   it dies (smoke puff, die()); a hungry piggy paths to food on the street,
 *   else to a trant with fruit.
 * - npc_piggy.js decMood/incMood 1301-1362: mood stays within 0..2.
 * - npc_piggy.js onPetComplete 1709-1717: a successful pet adds 1 mood.
 * - npc_piggy.js nibble handler 862-910: petted today (or Animal Kinship VI)
 *   but mood 0 or hunger > 2 refuses ("That Piggy doesn't feel like being
 *   nibbled right now.", too_much_nibble, nibble_na_fail).
 * - npc_piggy.js onCroaking 1474-1480 (10 s bubble, once a minute while
 *   hunger is 10), onPropsChanged 1810-1816 (stops when hunger != 10).
 * - npc_piggy.js onFoodPathing 1482-1533: on arrival eat one food item within
 *   100 px (apiConsume(1)) or one fruit off a trant, hunger 0, chew, "Yum!".
 * - npc_piggy.js onContainerItemAdded 1393-1416 / onContainerItemStateChanged
 *   1418-1431: food dropped on the street, or a trant changing state with
 *   fruit on it, sends every hungry (not rooked, not sad) piggy to it.
 * - npc_piggy.js onTwiceDaily 2037: walk speed randInt(30,55) - hunger px/s.
 * - include/animal_sadness.js locationIsDepressing 1-63, isSad 257-263,
 *   onSadnessStart 153-187, onSadnessInterval 189-229.
 * - npc_piggy.js verb conditions 568-570, 765-767, 836-838, 930-932 and
 *   capture 383-386, 439-444; onReleased 1081-1088.
 * - chick.js smile_at 101-110, feed 151-153; piglet.js hum_to 105-115, feed
 *   171-173; caterpillar.js feed 102-104; sad_baby_animals (chick.js 314-323).
 */

/** One game day is four real hours (js/game-day.js); the tick is half of it. */
export const GAME_DAY_MS = 4 * 60 * 60 * 1000;
export const PIGGY_TICK_MS = GAME_DAY_MS / 2;

export const PIGGY_MOOD = Object.freeze({ min: 0, max: 2, start: 1 });
export const PIGGY_HUNGER = Object.freeze({
  start: 0,
  max: 10,
  /** nibble refuses above this (npc_piggy.js 875). */
  nibbleMax: 2,
  /** onStatus 1181: Feed is the suggested verb above this. */
  feedWarning: 8,
  /** Below this hunger rises every half day, then only on the daily half. */
  halfDayRise: 2,
});

/**
 * Starvation death (npc_piggy.js onTwiceDaily 1958-1973: at hunger 10 a 50%
 * chance per tick of the smoke puff and die(), which drops 10 Meat and a Plop
 * at npc_piggy.js 1036-1041). Off until Austin decides whether the remake's
 * piggies can starve; while off a starving piggy stays at 10 and keeps
 * croaking. The pure tick below reports `die` only when this is true; the
 * street side (removing the piggy, dropping the Meat and Plop) is not built.
 */
export const PIGGY_STARVATION_DEATH = false;
export const PIGGY_DEATH_CHANCE = 0.5;

/** onCroaking runs on apiSetInterval(..., 1): once a minute. */
export const CROAK_INTERVAL_MS = 60 * 1000;
/** onSadnessInterval repeats every 30 s. */
export const SAD_INTERVAL_MS = 30 * 1000;
/** onFoodPathing eats food within this radius of where the piggy stops. */
export const EAT_RADIUS = 100;
/** After eating, startMoving resumes in 3 s (onFoodPathing 1531). */
export const EAT_PAUSE_MS = 3000;

export const PIGGY_LINES = Object.freeze({
  croak: "I'm about to croak!",
  croakMs: 10 * 1000,
  yum: 'Yum!',
  yumMs: 3 * 1000,
  happy: 'Other animals make me happy!',
  happyMs: 3 * 1000,
  nibbleRefused: "That Piggy doesn't feel like being nibbled right now.",
  sad: "Can't do that! Piggy is sad!.",
  sadName: 'This piggy is sad, and in no mood to be called names. Even nice ones.',
});

/** npc_piggy.js responses.nibble_na_fail 2866-2869. */
export const NIBBLE_NA_FAIL = Object.freeze([
  "Denied, friend, I'm all nibbled out!",
  'Nah. Not happening. Meat out, dude!',
]);

/** npc_piggy.js responses.sad_piggy 2737-2746 (the babies' sad_baby_animals is the same list). */
export const SAD_PIGGY_LINES = Object.freeze([
  "I don't wanna be here.",
  "I'm BORED.",
  "I don't like this. You promised me fun. This isn't fun.",
  "What is this place anyway, it's rubbish, take me somewhere else.",
  "Take me away from here, it's lame. I hate it.",
  "Don't like it here. It's smelly.",
  "This is boring, why did you bring me here? It's lame.",
  "Where ARE we? It's Lame-o. LAME-O.",
]);
export const SAD_BABY_LINES = SAD_PIGGY_LINES;

/** Baby animal verbs in a depressing place (chick.js, piglet.js, caterpillar.js). */
export const SAD_BABY = Object.freeze({
  chick: Object.freeze({
    feedReason: 'This chick is off its food in these uncomfortable surroundings!',
    extraVerb: Object.freeze({
      msg: "The chick's unblinking gaze conveys its extreme distaste for its surroundings. You feel embarrassed for smiling at it.",
      energy: 0,
      mood: -5,
    }),
  }),
  piglet: Object.freeze({
    feedReason: 'This place seems to give this piglet the howling fantods, and it refuses food.',
    extraVerb: Object.freeze({
      msg: 'You hum an off-key hum, but the piglet is too unhappy here to notice. Its misery is contagious.',
      energy: -2,
      mood: -2,
    }),
  }),
  caterpillar: Object.freeze({
    feedReason: 'The caterpillar is too busy complaining to eat.',
    extraVerb: null,
  }),
});

/** Classes isSad() covers through locationIsDepressing (animal_sadness.js 257-263). */
export const SAD_CLASSES = Object.freeze(['npc_piggy', 'chick', 'piglet', 'caterpillar']);

/**
 * Hubs locationIsDepressing names (config_prod.js hubs): Ilmenskie Caverns 50,
 * Ilmenskie Deeps 78, Jethimadh Tower: Base 77, Seam Streets 66 (the remake's
 * map calls it The Seams), Choru 90, Baqala 86, Zhambu 91, Xalanga 95.
 * Hub 122 is never depressing. Hell is the purgatory hub 40.
 */
export const DEPRESSING_HUBS = Object.freeze({
  50: 'Ilmenskie Caverns',
  78: 'Ilmenskie Deeps',
  77: 'Jethimadh Tower: Base',
  66: 'Seam Streets',
  90: 'Choru',
  86: 'Baqala',
  91: 'Zhambu',
  95: 'Xalanga',
});
const DEPRESSING_HUB_NAMES = new Set([...Object.values(DEPRESSING_HUBS), 'The Seams']);
/** Hell (animal_sadness.js 41): LM4107R9OLUTA and isInHell() (Hell One, hub 40). */
const HELL_TSIDS = new Set(['GM4107R9OLUTA', 'GA5PPFP86NF2FOS']);

/**
 * Streets whose location data sets disallow_animals true ("Animal sadness has
 * been manually forced for this location"): 461 L-prefixed locations in the
 * CC0 location XMLs (streets/mnt/stos/location_data + streets/xml), each with
 * a remake street (G-prefixed). Stored without the leading G. Regenerate with
 * grep -l '<bool id="disallow_animals">true' over those folders.
 */
const DISALLOW_ANIMALS = `
  A5101HF7F429V5 A510IHD1F426DS A510OD56BH2CBJ A512CSG4H42RKG A512SK50J52F8M A512T760J52JMS A512UR70J52M1G
  A512V480J52NMN A5130090J525IQ A5131390J52DJR A5132LA0J526JJ A5133PB0J522JA A5134PC0J52VC3 A5134UPLRU29OH
  A5135VC0J52RGQ A5136CE0J52562 A5137QE0J52UB8 A5138OK0J526HB A5139FL0J52SP5 A513A7M0J521F2 A513BTM0J524D4
  A513CDN0J52ND9 A513I7O0J52MO0 A513JAO0J5220P A513KEP0J52N21 A513LMP0J52V1C A513MGQ0J52Q8S A513NJQ0J523F2
  A513OVR0J52BMT A513PFS0J52F45 A513QET0J523AD A513RIT0J52F6P A513S9U0J52SKD A513TDU0J524CU A5140E01J52TLO
  A5142521J52DH8 A5143921J52F9U A5144431J524TC A51450HIC42Q4I A5145S31J52BA2 A5146P2JC42B1Q A5146Q41J528U9
  A5147561J525G7 A5147JHJC424OI A51488SJC424V7 A5148N71J5237C A514988KC42014 A514BBVLC423BJ A514DNTMC42534
  A514GCJNC42I6G A514HDC2J52TOU A514JHG3J52E88 A514K0J3J52ID0 A514TDJOC42JUA A5157TDPC42IGK A515E0PQC4214G
  A515GCSSC42QGF A515H6TSC424T9 A515KVOUC42I7T A517OTP8K42NN9 A51AB6PCBH2A2V A51CP6NAF42G0N A51DET7GF42FKO
  A51UU6VQAH21BE A524M0OMOE2OGT A52G8H9PJ420LQ A52JSKF6BH2BPA A52VVB0LDH23N7 A536V4QPH429H8 A5371G9AH421NO
  A53N05IG9S2BLR A53SMVHGD13MA5 A54AT4AK613NBL A54GMM2OL13C81 A556IE55JS245H A55S7P5RJ42VTG A578O7KNJS2BNI
  A57AV78DL13O51 A57CE3KTN13I7Q A57JSVQRH423HV A57LTPQBK42SLV A57S02C1BH2TP4 A582EG1QLS20BF A58P18ELAH2ERI
  A5945LJ7JS2GFK A59DJ1KSH42F4L A5AS7POI5T24IG A5ASS2OEH42TSV A5BLHFU8913RQ7 A5BVMNOTH42T8L A5C1CH8TDH277B
  A5C39VNDK420LG A5CSD7ERL13G16 A5CTEP5UH42CQC A5CUF0978T2L64 A5D24IIRL13IIC A5D59PVEL13KNQ A5DNE9DVJ429P8
  A5EK4L9B613VB1 A5ELMKFP7T2Q4H A5FMLBNS31300N A5FR0B3BUG27S7 A5G15O4BUG2CVB A5G8MQD45T2UMH A5GB0PVS313DBO
  A5GBQ27BUG2FF9 A5GNCQ4T3137M7 A5GR516F3H2GUL A5GTNUABUG2BP7 A5H8G00NUG2CRH A5I6EGFG813HL5 A5I9D23ODH22M8
  A5ICL7V9BH2LCA A5IVDTK1O13F5I A5J7IB1HK42N3D A5JN50RNAH27R9 A5KC1SHA8T2AL7 A5KUKA22I42CI9 A5LBN35B8T288J
  A5M6H0P2I42BQJ A5M93LAV313EBJ A5N5E10CM42HJ4 A5N7KV0CM42DKT A5NACEOCUG283E A5NV05NFJS2NIF A5OD66T5B13RKN
  A5OO9PJC8T26KE A5P9MNTJK42IJS A5PPFP86NF2FOS A5PRVG8G613GKF A5PV4JH5K42CIV A5PV4T79OE2AOA A5Q57C99OE2GNU
  A5QAHLTB9S2C0F A5QLASKPD13NEM A5R11F6C9S2HA9 A5REO5I9OE2KLS A5RFFFCK813Q99 A5RJRSOHJS2C95 A5RPAFK9OE28GN
  A5RV551E8T2K2F A5S44RM9OE2416 A5T6PDF7K42SNM A5T7SLLO3H2ERO A5THPDOLK42GRD A5TIHLV6E13IRP A5U9449F8T2DPR
  A5UDRLCE9S20ER A5VEL0SJJS2KVU A5VJDNKS5T2EFM A931BPTNLD3E35 A96OS42D6F3M9P A983PEN5DT21G9 A9BT2I0ILD340S
  A9EAH3R8DT2R18 A9EBPF8M2031HB A9H1V6OGRU2FSB A9MJQRNCDT23BP A9MU59GB792T80 A9Q9EQ5V4F33RE A9QMIMHV4F3RHN
  A9QNMSIV4F3143 A9QR9R40DT2A1D A9QTSIOV4F31QH A9RFQBJ05F33D7 A9RM4IT05F3B4M A9RMUNU05F3EI8 A9S04AB15F3H53
  A9S09UB15F34AE A9TCL1H7LD37DC A9TKSRJ7LD3SGK A9U27HN7LD3FVE A9UCEFP7LD3523 A9UIKNQ7LD3SN0 CR101Q98A12EHH
  DO1OPGDSCD29NF DO2NCNJUR038S7 DO2QRVKUR03S35 DO2TP0MUR03PJP DO34N1OUR03H4O DO38FFPUR035D6 DO3CO0RUR0307B
  DO3GP3SUR034JD DO3KC3TUR03MUH DO3QTOUUR03ELC DO42D61VR03PM6 DO5CC4R1FD2SQG DO8HM0S8DD240C DO8SVSPPCD22ED
  DOB5HTH1ID2MTL DOC74759ST2IG1 DOE4V402DD2S3O DOEMNGFQCD2KI2 DOEP1822S03350 DOESR432S03SK7 DOF15642S031VN
  DOF4NU42S03R63 DOF6PP52S03H66 DOFACJ62S03LLK DOFAE74UCD29PD DOFE9L72S03U5T DOFHEF82S03AE7 DOFQEEIHDT2QNS
  DOG0IIC2S03H1R DOHDJ84BST2UI2 DOISPPQICD27RQ DOKTFQ22DT2OEL DOM6B78RCD26TA DONE5453DD2DHS DONEDVHC4030KF
  DOOD6S77DD228S DOOF07GRCD2MAP DOOSA8V29J24I3 DOQRJELVCD285H DORJMMHCDT2J08 DORU6QC6S035VQ DOSBNUH6S03CBT
  DOSHD9J6NT2HUJ DOTQ8JCOCD20TU DOU1UON87E3K2T DOU5PQU0FD21PF DOVRMU9SCD2ASN DOVUDD84DD2U4U HF2KOKDR2D2EIU
  HF70EIUS0D3RDM HF893IMS2D2AKU HF8B3B0S4D2L5U HFA15VS0UC3ITS HFATC8M4RD3E61 HFD24US63D2QO6 HFER9HGE3D2UPP
  HFFH3GKN2D2BTS HFKT1LK83D2BAF HFL23QTC2D21SF HFL7HBQO2D2B4H HFNBKJMP4D2S9M HFNIVJNP4D2IM6 HFR6PV2Q2D24KJ
  HFRC7NQL4D2C59 HFSH881K2D2GP9 HFTBK54M4D2JQA HFTJK6IQ4D2R6M HFTQ7GLV2D2GG1 HFUE6UMQ4D2K42 HV21H2S5DT2VF8
  HV6HOCAH203RMF HV73IC58DT2RO7 HV7LLAAIDB35G2 HV7RGKN4MA33RT HV7VE7O4MA35H6 HVAP821MDT2L85 HVBSCOFMDT2VE0
  HVC7554ADT2VA1 HVCJB2OMDT2VD8 HVCKEPHO403BN5 HVDIELDQQ7228K HVDKQ2O6S23LVJ HVECS766MC3LHP HVEI9NVJ203LRO
  HVFCFD8FRA37T6 HVK0T750DT2D3K HVNJNP4MAB3JI5 HVO8GQFVAB33C9 HVOD0F3T403694 HVP6H0KT403N8A HVP7QOKT403F5Q
  HVP8TCLT40336S HVPOOR1LTA3NJ2 HVQMS17V813FN7 HVSP6MKGDT2VUK HVUFJ6HGRU2V0E HVUR3UKGRU2SD2 IF1Q3IQM7122SP
  IF1Q48RM712F87 IF1QBNPP7123J0 IF2K0TOOK434L9 IF33FDK0K3371H IF3T0ACGI43H7O IF455U7PK43M1N IF54MLFFJ33G7G
  IF5TTUG9H33TNH IF6BOGS0I43INV IF6RTBE48435HF IF72A3F7J33VAI IF77JBCJF43LC2 IF7CEAQOJ339P2 IF84CCRN203N7P
  IF94J49PJ332NQ IF9JS2DPJ3327C IF9O9SDPJ3318J IFBHR9M3L43FET IFBLG555G434J3 IFD6TMU2952RMJ IFD7QU2DF432MC
  IFDAMF03952OEO IFDQ6HSHJ33QQB IFF7O3E9O72HNI IFF7PKF9O72UKC IFF7Q3H9O7222R IFF7RSJ9O725F1 IFF7T7N9O72TP2
  IFF7UIP9O724RP IFF7V2R9O72MUP IFF808S9O724UJ IFF81JT9O72F60 IFF829V9O7221M IFF83D0AO72SUG IFF84K2AO72945
  IFF85Q3AO72TIV IFF86N5AO72UVT IFF87R8AO72P6D IFF88AAAO72MQ9 IFF892CAO72FUN IFF8A7EAO72NPH IFF8B1GAO72GIC
  IFF8C3IAO7210R IFF8D0JAO72UM0 IFF8EOJAO72U8U IFF8FOKAO722CT IFF8GBMAO72KNI IFF8H8NAO729GM IFF8ITNAO72C6N
  IFF8JAQAO72U81 IFF8K9RAO72LP5 IFF8LVSAO72S3C IFF8NE0BO72CNQ IFF8OI1BO72KC1 IFF8P93BO72VKV IFF8R57BO72VDS
  IFF8TQ8BO72L8G IFF8VNBBO72B2C IFF91EEBO723DF IFF92MGBO72DPK IFF949JBO728GK IFF95RKBO72R2Q IFF96TLBO72CS3
  IFG0VETDF43E95 IFGKHHCIE33LTF IFHNVD4SG33SKK IFI4FP9GRU2CC8 IFJ48A6O743F2G IFJ8NC9JE33O53 IFJISNAO743CK0
  IFJKLT8VF43JTF IFJLIMKKI438SK IFJPVPCO743LKE IFJUKUDO743LES IFKRLE5NL334A8 IFL52J67952Q3L IFL56303J33S8H
  IFL5KM3KE333GJ IFLAJU87952TDU IFLFDAA79522M2 IFLKU9C7952Q8N IFLN0JD7952TH6 IFLPDTE7952BT3 IFLRSGG7952SBS
  IFM36BDKE33VO3 IFMJ2KQ7952UFB IFMLT2S7952HAQ IFMNSVS7952M4T IFMR8JU7952PH5 IFMTLQV79528FE IFNGN0F5I438EQ
  IFNKR2C2G522MG IFNL5554G52MHJ IFNL7F74G52BUD IFNL8294G52U4M IFNMSQ5GG528AK IFNMTBAGG52OON IFNN016HG5246T
  IFNNAK4JG5273T IFNNB46JG527E6 IFNNC57JG52PDR IFNNDV7JG52198 IFNNEA8JG52VL8 IFNNFA9JG5222H IFNNGNAJG52LIH
  IFNNHRBJG52QS0 IFNNI8JJG52EA8 IFNNL3OJG52OKJ IFNNMMQJG52764 IFNOHGBMG523LQ IFNTBMONG520FD IFNTFRSNG52DMO
  IFNTLPJPG52ONQ IFNTM0NPG52JB5 IFNTN8PPG52DTG IFNTO2RPG52AH8 IFOEFNL89529MS IFP24DTLI43SM4 IFPV9EMLT72DP4
  IFR1RLV0G43647 IFRS9CDPF43UKR IFSC0G9FG33LCT IFTFC6OCE33DO7 IFTQPDA7H335UQ IFU2T6EMJ33NI6 M11E7ODKHO1QJE
  M4118MEHFDMM NV4R9D5ADT2NP1 NV9O6NVFCD2SFS NVCJKCAHCD2660 NVEC8L1DDT2F20 NVVEB4M8DT2JUB TJ10K7P3812R8F
  TJ10M515812V0C TJ110817812KO4 TJ1KOM8N2O1EFS UV10AGQOOA3MOE UV13UHOH3D3V3S UV1BKIJU8A3VL1 UV1JGGKU8A3NHG
  UV1RBFLU8A3LR9 UV270LMU8A3UCB UV2ERENU8A30JC UV2LJJO5UC30B2 UV2M7GCJ8D3878 UV2M85OU8A39GS UV2SS9BHDT2I85
  UV2SSTOU8A30RS UV2UE4DCMA3RLS UV3HOATQOS2HNO UV5I1CTIEA3DT0 UV8KVC0JDT2N8E UV8TSS9Q5D308S UV9CALK9MC3MGA
  UVA5LSLC0D3VCR UVAPJARHHC3H1I UVCHLO06EA3VBC UVCLS8RV5D3VGT UVDU3H5COS2S4O UVE3K14D3D314I UVE5KV0TOS2N87
  UVEAT1BCOS25QL UVEDNPVFJC3UIQ UVG9L7NOLA3CEB UVGG7RFV2D3L0U UVH137RPTC3IJ6 UVHBDR6DOS2UED UVIP8FLKOS2USV
  UVITGLVQOA3H34 UVKHENRO0D3MJ8 UVLLA752MA3R76 UVM9R39TBA362T UVMF06N99A3U2B UVNHLCRGEA3VAS UVO1ABIQQS2QIF
  UVPAQS5B9S2E00 UVPMRNUQQS2GF3 UVSBGGQCHC386B UVST31K7MA369P UVTKP64DEA3D31 UVUMTSQ2FC34ES UVV0NRR2FC3D3D
  UVV8SDGGDT2QOH UVVASOS2FC3J3Q UVVL8J088D3QVT UVVMMKT2FC3V5B UVVSU5NCBA3KOS UVVV3FU2FC38SK`;
export const DISALLOW_ANIMALS_TSIDS = Object.freeze(new Set(DISALLOW_ANIMALS.trim().split(/\s+/).map((s) => `G${s}`)));

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * locationIsDepressing for a plain location descriptor:
 * { tsid, hubId, hubName, label, race, game, inHell, transit, tower,
 *   skillquest, instance, newxp }.
 * Order follows the source: races and games are never sad, then the forced
 * flag, the hubs (122 never), Hell, subway stations, towers, skill quests
 * (never), then instances that are not the new-player experience.
 */
export function locationIsDepressing(loc = {}) {
  if (!loc) return false;
  if (loc.race || loc.game) return false;
  const tsid = String(loc.tsid || '');
  if (loc.disallowAnimals === true || DISALLOW_ANIMALS_TSIDS.has(tsid)) return true;
  const hubId = String(loc.hubId ?? '');
  if (hubId === '122') return false;
  if (DEPRESSING_HUBS[hubId] || DEPRESSING_HUB_NAMES.has(String(loc.hubName || ''))) return true;
  if (loc.inHell || HELL_TSIDS.has(tsid) || hubId === '40') return true;
  if (loc.transit || /\bSubway Station$/i.test(String(loc.label || ''))) return true;
  if (loc.tower) return true;
  if (loc.skillquest) return false;
  if (loc.instance && !loc.newxp) return true;
  return false;
}

/** isSad() for a class on a street: piggies and the three babies follow the location. */
export function isSadIn(classId, depressing) {
  return Boolean(depressing) && SAD_CLASSES.includes(classId);
}

/**
 * Fill a piggy's mood/hunger timeline without discarding older saves.
 * `hungerAt` is the next onTwiceDaily tick (the back yard already used that
 * name). Saves from before mood existed get the onCreate mood of 1, and the
 * old capped day counter (0..3, one step a game day) is held at 2 so an
 * upgrade does not lock a piggy out of nibbling until it next eats.
 */
export function ensurePiggyMood(state = {}, now = Date.now()) {
  const s = state || {};
  const legacy = !Number.isFinite(Number(s.hungerAt)) || s.hungerAt === null;
  if (s.mood === undefined || s.mood === null || !Number.isFinite(Number(s.mood))) s.mood = PIGGY_MOOD.start;
  s.mood = clamp(Math.floor(num(s.mood, PIGGY_MOOD.start)), PIGGY_MOOD.min, PIGGY_MOOD.max);
  s.hunger = clamp(Math.floor(num(s.hunger, PIGGY_HUNGER.start)), 0, PIGGY_HUNGER.max);
  if (legacy) {
    if (s.moodVersion === undefined && s.hunger > PIGGY_HUNGER.nibbleMax) s.hunger = PIGGY_HUNGER.nibbleMax;
    s.hungerAt = now + PIGGY_TICK_MS;
  }
  if (s.isDaily === undefined) s.isDaily = 1;
  s.isDaily = s.isDaily ? 1 : 0;
  s.croaking = s.hunger === PIGGY_HUNGER.max && s.croaking === true;
  s.moodVersion = 1;
  return s;
}

/** incMood (npc_piggy.js 1352-1362). Returns the change. */
export function incPiggyMood(state, delta = 1) {
  const before = clamp(num(state.mood, PIGGY_MOOD.start), PIGGY_MOOD.min, PIGGY_MOOD.max);
  state.mood = Math.min(PIGGY_MOOD.max, before + delta);
  return state.mood - before;
}

/** decMood (npc_piggy.js 1301-1313). Returns the loss. */
export function decPiggyMood(state, delta = 1) {
  const before = clamp(num(state.mood, PIGGY_MOOD.start), PIGGY_MOOD.min, PIGGY_MOOD.max);
  state.mood = Math.max(PIGGY_MOOD.min, before - delta);
  return before - state.mood;
}

/** Eating (feed with base cost >= 5, onFoodPathing, the Piggy Feeder) clears hunger and the croak. */
export function satePiggy(state) {
  state.hunger = 0;
  state.croaking = false;
}

/**
 * The nibble handler's mood/hunger gate. Only reached when the player has
 * petted the piggy today or has Animal Kinship VI; returns the refusal or null.
 */
export function piggyNibbleRefusal(state = {}) {
  const mood = num(state.mood, PIGGY_MOOD.start);
  const hunger = num(state.hunger, 0);
  if (mood === 0 || hunger > PIGGY_HUNGER.nibbleMax) {
    return {
      reason: mood === 0 ? 'mood' : 'hunger',
      msg: PIGGY_LINES.nibbleRefused,
      responses: NIBBLE_NA_FAIL,
      state: 'too_much_nibble',
    };
  }
  return null;
}

/**
 * One onTwiceDaily tick. ctx: { sad, rooked, neighbourMoods: number[],
 * findFood: () => food|null, rng, deathEnabled }. Mutates `state` and
 * returns the events: { type: 'happy' } (the bubble), { type: 'croak' }
 * (the interval starts), { type: 'die' } (only with deathEnabled),
 * { type: 'seek', food } (path to that food).
 */
export function piggyTwiceDailyTick(state, ctx = {}) {
  const events = [];
  if (ctx.rooked || ctx.sad) return events;
  const s = state;
  s.isDaily = s.isDaily ? 0 : 1;
  const daily = s.isDaily === 1;
  if (daily) {
    // has_been_petted is reset here but never set in GSJS: every game day costs 1 mood.
    decPiggyMood(s, 1);
    const moods = (ctx.neighbourMoods || []).map((m) => num(m, PIGGY_MOOD.start));
    if (moods.length) {
      const avg = moods.reduce((a, b) => a + b, 0) / moods.length;
      if (avg >= 1 && s.mood === 0) {
        s.mood = 1;
        events.push({ type: 'happy', line: PIGGY_LINES.happy });
      }
    }
  }
  const hunger = clamp(Math.floor(num(s.hunger, 0)), 0, PIGGY_HUNGER.max);
  if (hunger < PIGGY_HUNGER.halfDayRise) s.hunger = hunger + 1;
  else if (hunger < PIGGY_HUNGER.max) s.hunger = hunger + (daily ? 1 : 0);
  else {
    s.croaking = true;
    events.push({ type: 'croak', line: PIGGY_LINES.croak });
    const deathEnabled = ctx.deathEnabled ?? PIGGY_STARVATION_DEATH;
    const rng = typeof ctx.rng === 'function' ? ctx.rng : Math.random;
    if (deathEnabled && rng() < PIGGY_DEATH_CHANCE) {
      events.push({ type: 'die' });
      return events;
    }
  }
  if (s.hunger > 0 && typeof ctx.findFood === 'function') {
    const food = ctx.findFood();
    if (food) events.push({ type: 'seek', food });
  }
  return events;
}

/**
 * Replay every due tick for a street's piggies in time order (a long absence
 * works like the server's intervals). rows: [{ state, ...anything }].
 * ctxFor(row) -> { sad, rooked, findFood }; `eat(row, food)` lands an
 * offline seek at once (returns true when it ate). Returns
 * [{ row, events }] for ticks that produced events.
 */
export function advancePiggies(rows = [], now = Date.now(), { ctxFor = () => ({}), eat = null, rng = Math.random, deathEnabled } = {}) {
  const out = [];
  for (const row of rows) ensurePiggyMood(row.state, now);
  for (let guard = 0; guard < 5000; guard += 1) {
    let next = null;
    for (const row of rows) {
      if (row.dead) continue;
      if (row.state.hungerAt <= now && (!next || row.state.hungerAt < next.state.hungerAt)) next = row;
    }
    if (!next) break;
    const ctx = ctxFor(next) || {};
    const neighbourMoods = rows.filter((r) => r !== next && !r.dead).map((r) => r.state.mood);
    const events = piggyTwiceDailyTick(next.state, { ...ctx, neighbourMoods, rng, deathEnabled });
    next.state.hungerAt += PIGGY_TICK_MS;
    if (events.some((e) => e.type === 'die')) next.dead = true;
    if (eat) {
      for (const ev of events) {
        if (ev.type === 'seek' && eat(next, ev.food)) ev.ate = true;
      }
    }
    if (events.length) out.push({ row: next, events, at: next.state.hungerAt - PIGGY_TICK_MS });
  }
  return out;
}

/** npc_walk_speed: randInt(30,55) - hunger, in px/s. */
export function piggyWalkSpeed(hunger = 0, rng = Math.random) {
  const base = 30 + Math.floor(rng() * 26);
  return Math.max(5, base - clamp(Math.floor(num(hunger, 0)), 0, PIGGY_HUNGER.max));
}

/** Pick one line (choose_one). */
export function pickLine(lines, rng = Math.random) {
  if (!lines?.length) return '';
  return lines[Math.min(lines.length - 1, Math.floor(rng() * lines.length))];
}

/** onSadnessInterval's piggy state: rooked2 20% of the time, else too_much_nibble. */
export function sadPiggyClip(rng = Math.random) {
  return rng() < 0.2 ? 'rooked2' : 'too_much_nibble';
}

/** Short subtitle for the world label (remake UI, not source copy). */
export function piggyMoodLabel(state = {}) {
  const hunger = num(state.hunger, 0);
  if (hunger >= PIGGY_HUNGER.max) return 'About to croak · feed it!';
  if (hunger > PIGGY_HUNGER.feedWarning) return 'Starving · feed it';
  if (num(state.mood, PIGGY_MOOD.start) === 0) return 'Bummed out · pet it first';
  if (hunger > PIGGY_HUNGER.nibbleMax) return 'Hungry · too hungry to nibble';
  return '';
}
