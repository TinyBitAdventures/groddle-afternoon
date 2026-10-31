/**
 * Party Spaces: Party Packs, the timed private party location, the Party ATM,
 * and the teleporter that takes you in. Pure rules (no DOM, no Pixi).
 *
 * Source (GSJS, CC0):
 * - items/party_pack*.js activate(): duration 60*60 s, or 10*60 s when the
 *   class starts with `party_pack_taster_`; party_id picks the template; the
 *   pack is deleted on success. First use shows the PARTY SPACE ASSEMBLY
 *   INSTRUCTIONS prompt (instructions_read). base_cost 1000 / taster 200.
 * - items/catalog_stores.js store 19 (Toy Vendor): full packs 1100c, tasters
 *   220c (seven themes each; Winter Wingding is not stocked anywhere).
 * - config_prod.js party_spaces: template TSIDs, descriptions, and the ATM
 *   extension prices {5,10,15,30 minutes}.
 * - groups/party.js create_space / enter_space / space_warning /
 *   delete_space / extend_space_time: "<name> made us a new Party Space!",
 *   a warning at duration - 5 min, "Our Party Space expired.", and
 *   "<name> extended the party time!"; is_taster = (duration == 600).
 * - players/inc_party.js party_create_teleporter: the creator gets a single
 *   use teleporter_visible 100 px to the right that disappears after
 *   2 minutes; everyone else (or a later rejoin) pays
 *   teleportation_get_energy_cost() or round(max_energy * 0.40).
 * - items/teleporter_visible.js: onCreate -> 1000 ms -> appear -> 500 ms ->
 *   portal; collision enters the space; single use.
 * - items/party_atm.js extend: tasters offer 5m/15m, full packs 10m/30m, at
 *   the template's prices; replies "Party on, Wayne.", "You don't have
 *   enough currants to do that.", and "Down low, too slow." when expired.
 * - locations/location.js: party spaces set no_hubmap + no_starting_quests;
 *   locations/inc_rook.js: no rook attacks in party spaces.
 * - items/spawner.js defaults: max_count 1, spawn_interval 10 s. Party
 *   ingredients sit on spawners, so a taken stack comes back.
 * - Archived party locations (tinyspeck/glitch-locations L*.xml item refs)
 *   give each space's exact goods, tools, rocks, quoins and ATM; the G*.xml
 *   geometry carries each space's physics block (normal = config_base.js
 *   physics_configs.normal: gravity 1190, vy_jump -570, vx_max 335).
 * - L*.xml dynamic.events: Val Holla `booster` (gravity x -4 for 400 ms) and
 *   Aquarius `waterjet` (gravity x -7 for 1200 ms), fired by each space's one
 *   Collision-triggered Event Box (players/inc_physics.js physics_event_run:
 *   a percentage multiplier with duration_ms).
 * - groups/party.js create_space: geo_signpost_set_instance_exit('signpost_1'),
 *   so each space's one signpost is the way back to where you came from.
 */

import { applyPhysicsAdjustments, physicsMultipliers } from './location-events.js?v=61e0c5d3';

export const PARTY_FULL_SECONDS = 60 * 60;
export const PARTY_TASTER_SECONDS = 10 * 60;
export const PARTY_WARNING_SECONDS = 5 * 60;
export const PARTY_FULL_BASE_COST = 1000;
export const PARTY_TASTER_BASE_COST = 200;
export const PARTY_FULL_STORE_PRICE = 1100;
export const PARTY_TASTER_STORE_PRICE = 220;
export const PARTY_MAX_SIZE = 71;
export const PARTY_TELEPORTER_LIFETIME_MS = 2 * 60 * 1000;
export const PARTY_TELEPORTER_APPEAR_MS = 1000;
export const PARTY_TELEPORTER_PORTAL_MS = 500;
export const PARTY_TELEPORTER_OFFSET_X = 100;
export const PARTY_REJOIN_ENERGY_FRACTION = 0.4;
export const PARTY_SPAWNER_INTERVAL_MS = 10 * 1000;

export const PARTY_TEXT = Object.freeze({
  activateTooltip: 'Start party. GOOD NEWS: permit requirements temporarily lifted for parties',
  alreadyGoing: 'Your party already has a Party Space going.',
  instructionsTitle: 'PARTY SPACE ASSEMBLY INSTRUCTIONS',
  instructions: [
    '1. Assemble the desired group of party attendees by clicking on Glitches in person or in chat, and selecting "Invite to Party" to invite.',
    '2. Continue until your party has reached Maximum Fun Capacity Level. While waiting for party pack activation, the party chat channel can be used for smalltalk and metaphorical icebreaking.',
    "3. Once Party Participants are assembled, activate party pack. Do this by clicking 'Activate' on party pack.",
    '4. Every guest in party chat will be sent an offer to create a teleportation portal that will take them directly your private party space, regardless of their current location. Party Participants have a limited time to join, so ensure everyone is ready to party.',
    '5. PARTY HARD.',
  ],
  smallPrint: [
    `* A single-activation party pack gives a party of limited duration. To extend party length, insert currants into the machine inside your private party space. CORRECT CURRANTS ONLY. NO CHANGE GIVEN. Parties limited to ${PARTY_MAX_SIZE} participants.`,
    '* Please note, due to physical funness capacity, individuals can only participate in one party at a time.',
    '* The giants and their representatives are not responsible for the level of fun experienced at parties. No refunds for bad parties.',
  ],
  permits: 'GOOD NEWS: Temporarily, parties do not require Party Permits.',
  warning: 'Our Party Space will expire in 5 minutes.',
  expired: 'Our Party Space expired.',
  alreadyExpired: 'Sorry, but the party space has already expired.',
  noEnergy: "You don't have enough energy for that.",
  joinLater: "If you'd like to join the Party Space later, you can do so from the Party Chat menu above.",
  atmLabel: 'Party ATM',
  atmDesc: "The party don't stop 'til I walk in.",
  atmTooltip: 'Make moar party longer',
  atmQuestion: 'Would you like to extend the party timer?',
  atmNo: 'No, thanks',
  atmOk: 'Party on, Wayne.',
  atmBroke: "You don't have enough currants to do that.",
  atmTooLate: 'Down low, too slow.',
});

function prices(map) {
  return Object.freeze(Object.fromEntries(Object.entries(map).map(([k, v]) => [k, Number(v)])));
}

function goods(list) {
  return Object.freeze(list.map(([classTsid, count]) => Object.freeze({ classTsid, count })));
}

/**
 * Templates by party_id. `goods` respawn on their spawner; `tools` and `keys`
 * are single takeable stacks. Counts are the archived item references.
 */
export const PARTY_SPACES = Object.freeze({
  moon: Object.freeze({
    id: 'moon',
    bounds: Object.freeze({ l: -2000, t: -1550, r: 2000 }),
    exit: Object.freeze({ x: -1858, y: -177 }),
    ambience: 'sparkles',
    label: 'Toxic Moon',
    streetTsid: 'GDOBUP8IR8E2IPH',
    templateTsid: 'LDOBUP8IR8E2IPH',
    desc: 'Secluded lunar location, with sparkly moonrock. Provisions provided: complimentary cocktail bar and other refreshments.',
    prices: prices({ 5: '3000', 10: '4500', 15: '8500', 30: '13250' }),
    physics: Object.freeze({ gravity: 346, vy_jump: -332, vx_max: 292, jetpack: false }),
    musicFile: 'TOXIC_MOON',
    quoins: 24,
    rocks: Object.freeze({ rock_sparkly_1: 3 }),
    goods: goods([
      ['hooch', 2], ['purple_flower', 2], ['cinnamon', 1], ['laughing_gas', 1], ['hot_n_fizzy_sauce', 1],
      ['plain_bubble', 1], ['fruity_juice', 1], ['milk_butterfly', 1], ['coffee', 1], ['no_no_powder', 1],
    ]),
    tools: goods([['cocktail_shaker', 2]]),
    palette: Object.freeze([0x9cff57, 0x5ff2c8, 0xd6ff3c, 0xb388ff]),
  }),
  mazzala: Object.freeze({
    id: 'mazzala',
    bounds: Object.freeze({ l: -2500, t: -1500, r: 2500 }),
    exit: Object.freeze({ x: -2304, y: -145 }),
    ambience: 'confetti',
    label: "Mazza'la Gala",
    streetTsid: 'GDOE67MFL6E2FBR',
    templateTsid: 'LDOE67MFL6E2FBR',
    desc: 'Atmospheric five-room party lodge. Contains: DIY hearty party feast (gumbo, sammiches etc), beer, booze, and "other refreshments".',
    prices: prices({ 5: '3000', 10: '4500', 15: '8500', 30: '13250' }),
    physics: null,
    musicFile: '',
    quoins: 0,
    rocks: Object.freeze({}),
    goods: goods([
      ['meat', 2], ['hot_n_fizzy_sauce', 2], ['hooch', 2], ['fruity_juice', 2], ['egg_plain', 2], ['cheese', 2],
      ['bun', 2], ['tomato', 1], ['saffron', 1], ['pickle', 1], ['onion', 1], ['olive_oil', 1], ['mushroom', 1],
      ['laughing_gas', 1], ['hot_pepper', 1], ['butterfly_butter', 1], ['blue_bubble', 1], ['beer', 1],
      ['purple_flower', 1],
    ]),
    tools: goods([['cocktail_shaker', 2]]),
    keys: goods([['door_key_11', 1]]),
    palette: Object.freeze([0xffb347, 0xff7a59, 0xffd27a, 0xe0663d]),
  }),
  rainbow: Object.freeze({
    id: 'rainbow',
    bounds: Object.freeze({ l: -3000, t: -1000, r: 3000 }),
    exit: Object.freeze({ x: -2627, y: -399 }),
    ambience: 'confetti',
    label: 'Double Rainbow',
    streetTsid: 'GDOGBH4BG1E2BM0',
    templateTsid: 'LDOGBH4BG1E2BM0',
    desc: 'Totally cute party paddock, complete with rainbows. Contains: minable sparkly rocks, mixable cosmopolitans and a make-your-own cold taco bar.',
    prices: prices({ 5: '2000', 10: '3000', 15: '6000', 30: '9250' }),
    physics: null,
    musicFile: '',
    quoins: 4,
    rocks: Object.freeze({ rock_sparkly_1: 2, rock_beryl_1: 1 }),
    trees: Object.freeze({ trant_fruit: 1 }),
    goods: goods([
      ['tortilla', 1], ['meat', 1], ['lemon_juice', 1], ['ice', 1], ['hooch', 1], ['fruity_juice', 1], ['cheese', 1],
    ]),
    tools: goods([['knife_and_board', 2], ['cocktail_shaker', 1]]),
    palette: Object.freeze([0xff8fd8, 0x7fd8ff, 0xfff27a, 0xb7ff8a]),
  }),
  pitchen: Object.freeze({
    id: 'pitchen',
    bounds: Object.freeze({ l: -2000, t: -1500, r: 2000 }),
    exit: Object.freeze({ x: -510, y: -1056 }),
    ambience: 'confetti',
    label: 'Pitchen Lilliputt',
    streetTsid: 'GDOGNQICG1E2PNI',
    templateTsid: 'LDOGNQICG1E2PNI',
    desc: 'Miniature Ur for Glitchean giants. Rental includes minables, ingredients for nibbles, snacks and sammiches, and DIY fancy-cocktail bar.',
    prices: prices({ 5: '3000', 10: '4500', 15: '8500', 30: '13250' }),
    physics: null,
    musicFile: '',
    quoins: 0,
    rocks: Object.freeze({ rock_beryl_1: 1, rock_sparkly_1: 2 }),
    goods: goods([
      ['hooch', 2], ['honey', 2], ['milk_butterfly', 2], ['tiny_bubble', 1], ['pickle', 1], ['onion', 1], ['meat', 1],
      ['lemon', 1], ['ice', 1], ['hot_n_fizzy_sauce', 1], ['ginger', 1], ['fruity_juice', 1], ['cloudberry', 1],
      ['cheese', 1], ['bun', 1], ['banana', 1], ['apple', 1],
    ]),
    tools: goods([['knife_and_board', 2], ['cocktail_shaker', 2], ['blender', 1]]),
    palette: Object.freeze([0xfff07a, 0x9be15d, 0xff9a76, 0x7ec8ff]),
  }),
  nylon: Object.freeze({
    id: 'nylon',
    bounds: Object.freeze({ l: -2000, t: -1500, r: 2000 }),
    exit: Object.freeze({ x: -880, y: -388 }),
    ambience: 'bubbles',
    label: 'Nylon Phool',
    streetTsid: 'GDOK0A8OG1E2C7O',
    templateTsid: 'LDOK0A8OG1E2C7O',
    desc: 'Perfect underwater pool party hang-out. Ingredients for juices, smoothies and Grog, plus complimentary DIY three-course pescetarian meal.',
    prices: prices({ 5: '3500', 10: '5500', 15: '10000', 30: '16000' }),
    physics: Object.freeze({ gravity: 346, vy_jump: -505, vx_max: 217, jetpack: true }),
    musicFile: '',
    quoins: 0,
    rocks: Object.freeze({ rock_sparkly_1: 2 }),
    nodes: Object.freeze({ npc_salmon: 1 }),
    goods: goods([
      ['orange', 2], ['onion', 2], ['all_spice', 2], ['tomato', 1], ['pineapple', 1], ['oily_dressing', 1],
      ['mustard', 1], ['mushroom', 1], ['meat', 1], ['licorice', 1], ['lemon', 1], ['hot_pepper', 1], ['hooch', 1],
      ['hard_bubble', 1], ['broccoli', 1], ['black_pepper', 1], ['banana', 1],
    ]),
    tools: goods([['knife_and_board', 2], ['blender', 2], ['cocktail_shaker', 1], ['mike_tyson_grill', 1]]),
    palette: Object.freeze([0x5fe0ff, 0x7a8cff, 0x6dffc4, 0xffffff]),
  }),
  val_holla: Object.freeze({
    id: 'val_holla',
    bounds: Object.freeze({ l: -3000, t: -1000, r: 3000 }),
    exit: Object.freeze({ x: -760, y: -274 }),
    ambience: 'sparkles',
    label: 'Val Holla',
    streetTsid: 'GUVNGTHAGP93U34',
    templateTsid: 'LUVNGTHAGP93U34',
    desc: 'Soar to new heights in this quoin-heavy party space. Grab a bunch of your closest friends, and get ready to Party Shardy!',
    prices: prices({ 5: '5000', 10: '8500', 15: '15000', 30: '25000' }),
    physics: Object.freeze({ gravity: 280, vy_jump: -371, vx_max: 287, jetpack: true }),
    musicFile: 'AMBIENT_HIGHLANDS6',
    quoins: 23,
    rocks: Object.freeze({}),
    goods: goods([]),
    tools: goods([]),
    event: Object.freeze({ id: 'booster', gravity: -4, durationMs: 400 }),
    palette: Object.freeze([0xffe066, 0xff9f43, 0x74c0fc, 0xffffff]),
  }),
  aquarius: Object.freeze({
    id: 'aquarius',
    bounds: Object.freeze({ l: -1500, t: -2000, r: 1500 }),
    exit: Object.freeze({ x: -1326, y: -191 }),
    ambience: 'bubbles',
    label: 'Aquarius',
    streetTsid: 'GUVU11R1HP9341R',
    templateTsid: 'LUVU11R1HP9341R',
    desc: 'Swim, float & drift your way around this quoin-laden party space. And, remember … quoining is always more fun with friends!',
    prices: prices({ 5: '5000', 10: '8500', 15: '15000', 30: '25000' }),
    physics: Object.freeze({ gravity: 349, vy_jump: -501, vx_max: 218, jetpack: true }),
    musicFile: 'ABYSMAL_THRILLS',
    quoins: 23,
    rocks: Object.freeze({}),
    goods: goods([]),
    tools: goods([]),
    event: Object.freeze({ id: 'waterjet', gravity: -7, durationMs: 1200 }),
    palette: Object.freeze([0x63e6be, 0x4dabf7, 0xb197fc, 0xffffff]),
  }),
  glitchmas: Object.freeze({
    id: 'glitchmas',
    bounds: Object.freeze({ l: -2500, t: -1200, r: 2500 }),
    exit: Object.freeze({ x: 2270, y: -205 }),
    ambience: 'snow',
    label: 'Winter Wingding',
    streetTsid: 'GDOOS17UPNJ2HT7',
    templateTsid: 'LDOOS17UPNJ2HT7',
    desc: 'One temporary wonderland, perfect for holiday get-togethers and winterly fun. When activated, this icy private party spot includes trees for decorating, ingredients for heart-warming drinkables and a DIY pie bar.',
    prices: prices({ 5: '2000', 10: '3000', 15: '6000', 30: '9250' }),
    physics: null,
    musicFile: 'GLITCHMAS_PARTY_LOCATION',
    quoins: 0,
    rocks: Object.freeze({}),
    goods: goods([
      ['blue_bubble', 20], ['hooch', 3], ['pumpkin', 1], ['plain_bubble', 1], ['nutmeg', 1], ['mustard', 1],
      ['licorice', 1], ['laughing_gas', 1], ['hot_pepper', 1], ['hot_n_fizzy_sauce', 1], ['honey', 1],
      ['fruity_juice', 1], ['flour', 1], ['cumin', 1], ['coffee', 1], ['cinnamon', 1], ['cheese', 1],
      ['milk_butterfly', 1], ['butterfly_butter', 1], ['bean_plain', 1], ['all_spice', 1],
    ]),
    tools: goods([['cocktail_shaker', 3], ['frying_pan', 2]]),
    palette: Object.freeze([0xbff6ff, 0xff6b6b, 0x8ce99a, 0xffffff]),
  }),
});

export const PARTY_TEMPLATE_IDS = Object.freeze(Object.keys(PARTY_SPACES));

/** The seven themes the Toy Vendor sold (the QA list for `?partydemo=`). */
export const PARTY_STORE_THEMES = Object.freeze(['pitchen', 'moon', 'nylon', 'rainbow', 'mazzala', 'val_holla', 'aquarius']);

const PACK_THEMES = Object.freeze({
  toxic_moon: 'moon',
  mazzala_gala: 'mazzala',
  double_rainbow: 'rainbow',
  pitchen_lilliputt: 'pitchen',
  nylon_phool: 'nylon',
  val_holla: 'val_holla',
  aquarius: 'aquarius',
  winter_wingding: 'glitchmas',
});

const PACK_DESCRIPTIONS = Object.freeze({
  moon: 'One secluded and totally transient lunar location. When activated, temporary party spot includes ingredients for cocktails, sparkly rocks for space-mining, and a notable lack of gravity, for super-awesome-space-jumpiness.',
  mazzala: 'One private and transient five-room wooden party lodge. When activated, temporary party location includes DIY hearty party feast, beer, booze, and one very dark make-out room.',
  rainbow: 'One ephemeral cute-as-a-button party space, perfect for private events. When activated, temporary party location includes complimentary mineables, munchables and mixables, sparkles and lollipops and glee.',
  pitchen: 'Miniature Ur for Glitchean giants in one small but perfectly formed temporary party location. When activated, this ephemeral party spot includes minables, nibbles, snacks and sammiches, and one DIY fancy-cocktail bar.',
  nylon: 'One temporary underwater pool-party spot. When activated, this ephemeral party place includes a complimentary DIY juice bar, smoothie-zone and Spicy Grog spot, replenishing nibbles and unlimited floatiness.',
  val_holla: 'Soar to new heights in this quoin-heavy party space. Grab a bunch of your closest friends, and get ready to Party Shardy!',
  aquarius: 'Swim, float & drift your way around this quoin-laden party space. And, remember … quoining is always more fun with friends!',
  glitchmas: 'One temporary wonderland, perfect for holiday get-togethers and winterly fun. When activated, this icy private party spot includes trees for decorating, ingredients for heart-warming drinkables and a DIY pie bar.',
});

/**
 * Every party pack class: { classTsid, template, taster, label, desc,
 * baseCost, storePrice (null when no store stocks it), durationSeconds }.
 */
export const PARTY_PACKS = Object.freeze(Object.fromEntries(
  Object.entries(PACK_THEMES).flatMap(([slug, template]) => {
    const space = PARTY_SPACES[template];
    const sold = template !== 'glitchmas';
    return [false, true].map((taster) => {
      const classTsid = taster ? `party_pack_taster_${slug}` : `party_pack_${slug}`;
      return [classTsid, Object.freeze({
        classTsid,
        template,
        taster,
        label: `${space.label} Party Pack${taster ? ' Taster' : ''}`,
        desc: PACK_DESCRIPTIONS[template],
        baseCost: taster ? PARTY_TASTER_BASE_COST : PARTY_FULL_BASE_COST,
        storePrice: sold ? (taster ? PARTY_TASTER_STORE_PRICE : PARTY_FULL_STORE_PRICE) : null,
        durationSeconds: taster ? PARTY_TASTER_SECONDS : PARTY_FULL_SECONDS,
      })];
    });
  })
));

export const PARTY_PACK_CLASSES = Object.freeze(Object.keys(PARTY_PACKS));

export function isPartyPack(classTsid) {
  return Object.prototype.hasOwnProperty.call(PARTY_PACKS, classTsid);
}

/** party_pack activate(): duration from the class prefix. */
export function partyPackDurationSeconds(classTsid) {
  return String(classTsid).startsWith('party_pack_taster_') ? PARTY_TASTER_SECONDS : PARTY_FULL_SECONDS;
}

/** getDescExtras lines for the pack info card. */
export function partyPackInfo(classTsid) {
  const pack = PARTY_PACKS[classTsid];
  if (!pack) return [];
  const lines = [PARTY_TEXT.permits, `The space created by this Party Pack lasts for ${pack.durationSeconds / 60} minutes.`];
  if (pack.storePrice) lines.push('This can be purchased from a Toy Vendor.');
  return lines;
}

export function partySpaceForStreet(tsid) {
  if (!tsid) return null;
  const key = String(tsid).replace(/^L/, 'G');
  return Object.values(PARTY_SPACES).find((space) => space.streetTsid === key) || null;
}

export function isPartyStreet(tsid) {
  return Boolean(partySpaceForStreet(tsid));
}

/**
 * Feature-host physics for a party street: the street's own PhysicsSetting
 * (street JSON `physics.setting`, from the template's G*.xml) with any live
 * event-box adjustments multiplied in (booster / waterjet). Null when the
 * template has no physics block (normal movement).
 * @param {object|null} setting
 * @param {Record<string, number>|null} [adjustments]
 */
export function partyPhysics(setting, adjustments = null) {
  if (!setting) return null;
  const effective = adjustments && Object.keys(adjustments).length ? applyPhysicsAdjustments(setting, adjustments) : setting;
  return physicsMultipliers(effective);
}

/**
 * The instance exit (signpost_1) pointing home: one visible connect to the
 * street the party was entered from, landing on the saved x/y.
 * @param {string} template
 * @param {{ tsid: string, label?: string, x: number, y: number }|null} returnTo
 */
export function partyExitSignpost(template, returnTo) {
  const space = PARTY_SPACES[template];
  if (!space || !returnTo?.tsid) return null;
  return {
    id: 'signpost_1',
    x: space.exit.x,
    y: space.exit.y,
    w: 100,
    h: 200,
    connects: [{
      tsid: returnTo.tsid,
      label: returnTo.label || 'Back home',
      arrive: { x: Math.round(returnTo.x), y: Math.round(returnTo.y) },
    }],
  };
}

/** Where the teleporter lands you: beside the exit signpost (screen space). */
export function partyArrival(template, bounds = PARTY_SPACES[template]?.bounds) {
  const space = PARTY_SPACES[template];
  if (!space || !bounds) return null;
  const x = space.exit.x - bounds.l;
  const y = space.exit.y - bounds.t;
  const width = bounds.r - bounds.l;
  return { x: Math.round(x + (x < width / 2 ? 150 : -150)), y: Math.round(y) };
}

/** A few friends who came to the party (remake ambience, not in the source). */
export const PARTY_GUESTS = Object.freeze([
  Object.freeze({ name: 'Amp', tint: 0xf2a34a }),
  Object.freeze({ name: 'Bumbishfish', tint: 0x69a9ef }),
  Object.freeze({ name: 'Lily Linguistic', tint: 0xed86bd }),
]);

export const PARTY_GUEST_LINES = Object.freeze([
  'PARTY HARD.',
  'Best. Party. Ever.',
  'Who brought the Hooch?',
  'Nobody tell the Giants we are this happy.',
  'I came for the snacks. I stayed for the snacks.',
  'Shall we dance? We are already dancing.',
  'Thanks for the invite!',
  'Is it just me, or is the music getting better?',
]);

export function partyGuestLine(index) {
  const n = PARTY_GUEST_LINES.length;
  return PARTY_GUEST_LINES[((Math.floor(Number(index) || 0) % n) + n) % n];
}

/**
 * One world stack per goods/tools/keys class: `max` units (the archived
 * spawner references), goods come back one at a time after the spawner
 * interval; tools and keys are taken for good.
 */
export function partyStackGroups(template) {
  const space = PARTY_SPACES[template];
  if (!space) return [];
  const rows = [];
  for (const kind of ['goods', 'tools', 'keys']) {
    for (const { classTsid, count } of space[kind] || []) rows.push({ classTsid, kind, max: count, respawns: kind === 'goods' });
  }
  return rows;
}

/** Units of a stack group on the floor now (taken = respawn times or counts). */
export function stackAvailable(group, takenAt = [], now = Date.now(), takenForGood = 0) {
  const waiting = group.respawns ? (takenAt || []).filter((t) => now - t < PARTY_SPAWNER_INTERVAL_MS).length : 0;
  return Math.max(0, group.max - waiting - (group.respawns ? 0 : takenForGood));
}

/**
 * The ecology row for a party street: exact rocks/trees/resource nodes and
 * quoins, no spawner animals, apples, musicblocks, vendor, shrine or wandering
 * companions (party spaces are private instances).
 */
export function partyEcologyEntry(template) {
  const space = PARTY_SPACES[template];
  if (!space) return null;
  return {
    label: space.label,
    sourceTsid: space.templateTsid,
    counts: { ...space.rocks, ...(space.trees || {}), ...(space.nodes || {}) },
    spawners: 0,
    apples: 0,
    musicblocks: 0,
    quoins: space.quoins,
    companions: false,
  };
}

/* ------------------------------------------------------------------ */
/* Party lifecycle                                                    */
/* ------------------------------------------------------------------ */

/**
 * Activate a pack: a fresh party for `template`, timed from `now` (ms).
 * Returns { ok, party } or { ok:false, error }.
 */
export function startParty(existing, classTsid, { now = Date.now(), creator = 'You' } = {}) {
  const pack = PARTY_PACKS[classTsid];
  if (!pack) return { ok: false, error: 'Bad template' };
  if (existing && partyAlive(existing, now)) return { ok: false, error: PARTY_TEXT.alreadyGoing };
  const durationMs = pack.durationSeconds * 1000;
  return {
    ok: true,
    party: {
      template: pack.template,
      packClass: classTsid,
      taster: pack.durationSeconds === PARTY_TASTER_SECONDS,
      startedAt: now,
      expiresAt: now + durationMs,
      warned: false,
      extensions: 0,
      inside: false,
      returnTo: null,
      taken: {},
      teleporter: null,
      instance: Math.floor(now),
    },
    announce: `${creator} made us a new Party Space!`,
  };
}

export function partyRemainingMs(party, now = Date.now()) {
  if (!party) return 0;
  return Math.max(0, Number(party.expiresAt) - now);
}

export function partyAlive(party, now = Date.now()) {
  return partyRemainingMs(party, now) > 0;
}

/** space_warning: the timer fires at expiration - 5 min (only once per timer). */
export function partyWarningDue(party, now = Date.now()) {
  if (!party || party.warned) return false;
  const left = partyRemainingMs(party, now);
  return left > 0 && left <= PARTY_WARNING_SECONDS * 1000;
}

/** "mm:ss" (or "h:mm:ss") for the party clock and the ATM screen. */
export function formatPartyClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return h ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

/** party_atm extend: the two offers for this party (taster 5/15, full 10/30). */
export function partyExtendOptions(party) {
  const space = PARTY_SPACES[party?.template];
  if (!space) return [];
  const minutes = party.taster ? [5, 15] : [10, 30];
  return minutes.map((m) => ({ minutes: m, cost: space.prices[m], label: `${m}m for ${space.prices[m]}c` }));
}

/**
 * party_atm onConversation + inc_party party_extend_space_time +
 * groups/party.js extend_space_time: expiration += minutes, currants spent.
 */
export function extendParty(party, minutes, pc, { now = Date.now(), name = 'You' } = {}) {
  if (!party || !partyAlive(party, now)) return { ok: false, expired: true, reply: PARTY_TEXT.atmTooLate };
  const option = partyExtendOptions(party).find((o) => o.minutes === Number(minutes));
  if (!option) return { ok: false, reply: '' };
  if (!pc || (Number(pc.currants) || 0) < option.cost) return { ok: false, reply: PARTY_TEXT.atmBroke };
  pc.currants -= option.cost;
  party.expiresAt = Number(party.expiresAt) + option.minutes * 60 * 1000;
  party.extensions = (party.extensions || 0) + 1;
  if (partyRemainingMs(party, now) > PARTY_WARNING_SECONDS * 1000) party.warned = false;
  return { ok: true, cost: option.cost, minutes: option.minutes, reply: PARTY_TEXT.atmOk, announce: `${name} extended the party time!` };
}

/** party_space_prompt: teleportation cost, else 40% of max energy. */
export function partyRejoinEnergyCost(teleportCost, maxEnergy = 100) {
  if (Number.isFinite(teleportCost) && teleportCost > 0) return teleportCost;
  return Math.round(maxEnergy * PARTY_REJOIN_ENERGY_FRACTION);
}

/** A single-use teleporter beside the player (party_create_teleporter). */
export function createPartyTeleporter({ tsid, x, y, now = Date.now() }) {
  return {
    tsid,
    x: Math.round(x + PARTY_TELEPORTER_OFFSET_X),
    y: Math.round(y),
    createdAt: now,
    expiresAt: now + PARTY_TELEPORTER_LIFETIME_MS,
  };
}

/** 'waiting' (1 s), 'appear' (0.5 s), 'portal' (open) or 'gone'. */
export function teleporterPhase(tp, now = Date.now()) {
  if (!tp || now >= tp.expiresAt) return 'gone';
  const age = now - tp.createdAt;
  if (age < PARTY_TELEPORTER_APPEAR_MS) return 'waiting';
  if (age < PARTY_TELEPORTER_APPEAR_MS + PARTY_TELEPORTER_PORTAL_MS) return 'appear';
  return 'portal';
}

/** Save normalization (unknown templates and dead parties drop out). */
export function normalizePartyRecord(seed = {}, now = Date.now()) {
  const count = (v) => Math.max(0, Math.floor(Number(v) || 0));
  const out = {
    instructionsRead: seed?.instructionsRead === true,
    partiesThrown: count(seed?.partiesThrown),
    extensions: count(seed?.extensions),
    themes: Array.isArray(seed?.themes) ? seed.themes.filter((t) => PARTY_SPACES[t]) : [],
    party: null,
  };
  const p = seed?.party;
  if (p && PARTY_SPACES[p.template] && Number.isFinite(Number(p.expiresAt)) && Number(p.expiresAt) > now) {
    const back = p.returnTo;
    out.party = {
      template: p.template,
      packClass: isPartyPack(p.packClass) ? p.packClass : '',
      taster: p.taster === true,
      startedAt: Number(p.startedAt) || now,
      expiresAt: Number(p.expiresAt),
      warned: p.warned === true,
      extensions: Math.max(0, Math.floor(Number(p.extensions) || 0)),
      inside: p.inside === true,
      returnTo: back && typeof back.tsid === 'string' && !isPartyStreet(back.tsid)
        ? { tsid: back.tsid, label: typeof back.label === 'string' ? back.label : '', x: Math.round(Number(back.x) || 0), y: Math.round(Number(back.y) || 0) }
        : null,
      taken: Object.fromEntries(Object.entries(p.taken || {})
        .filter(([k, v]) => typeof k === 'string' && Number(v) > 0)
        .map(([k, v]) => [k, Math.floor(Number(v))])),
      teleporter: normalizeTeleporter(p.teleporter, now),
      instance: Number(p.instance) || Number(p.startedAt) || now,
    };
    // Multiplayer (G334): the realtime server's space this party is (js/party-spaces-mp.js).
    const mp = normalizeMpSpaceRef(p.mp);
    if (mp) out.party.mp = mp;
  }
  return out;
}

function normalizeMpSpaceRef(mp) {
  if (!mp || typeof mp !== 'object' || !/^PARTY_[0-9A-F]{16}$/.test(String(mp.street || ''))) return null;
  const n = Number(mp.creatorId);
  return { id: String(mp.id || ''), street: String(mp.street), creatorId: Number.isFinite(n) ? Math.floor(n) : 0, creatorName: String(mp.creatorName || '') };
}

function normalizeTeleporter(tp, now) {
  if (!tp || typeof tp.tsid !== 'string' || !(Number(tp.expiresAt) > now)) return null;
  return {
    tsid: tp.tsid,
    x: Math.round(Number(tp.x) || 0),
    y: Math.round(Number(tp.y) || 0),
    createdAt: Number(tp.createdAt) || now,
    expiresAt: Number(tp.expiresAt),
  };
}
