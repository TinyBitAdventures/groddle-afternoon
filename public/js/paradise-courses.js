/**
 * The nine Ticket to Paradise courses that paradise-flight.js did not ship
 * with: course data plus one small, pure body-physics step they share.
 *
 * Source (GameServerJS):
 * - config_prod.js `paradise_locations`: template TSIDs and names.
 * - items/paradise_ticket_<id>.js: names and ticket descriptions (exact).
 * - inc_data_imagination.js `ticket_to_paradise_<id>`: the keepable upgrade
 *   cards that deal these tickets (handled by imagination.js).
 * - items/quoin.js `paradise iMG` / `paradise currants`: Paradise quoins
 *   bypass the daily quoin limit (handled by paradise-flight.js / game.js).
 *
 * Lost: none of the nine production templates (LHF5NUH5UT53VSG ...) were
 * archived, and no public street reused their geometry (searched every
 * location XML label in streets/mnt/stos/location_data and the imported
 * streets). Layouts are therefore clean reconstructions:
 * - Six from recordings (reference only, never pixels): Aerial Boost
 *   (SlXjnIYvqtc), Mountain Scaling (qjZT5cPUcnM, VcM5yWeRlgE), Abysmal
 *   Thrill (9ZnoxQLVNsc, bcy0gFFZ4bw), Arbor Hollow (ELtkACMJkNU,
 *   JgWvGd7FcKA), Bippity Bop (rpZY_pooO_o, ySRo7sXl3OU) and Cloud Flight
 *   (nKzXwAraaO0, vI76UyqikgQ). On-screen text and the order of quoin
 *   rewards follow those recordings.
 * - Two from their ticket description and ticket art only (no recording
 *   was found): Updraft and Drafty Uplift. Their mechanics read the
 *   description literally and their copy is remake copy.
 * - Sky Plunge from its upgrade card, card art, player reports and one
 *   player Snap of its landing (no recording, no geometry): see the Sky
 *   Plunge block below.
 *
 * Reward amounts use the same scale as the four shipped courses (the
 * recorded values at the recorders' quoin multipliers: 120 iMG, 100 of a
 * stat, big 360-3,000 iMG quoins), so a Paradise run pays alike everywhere.
 */

const reward = (type, amount, giantId = null) => Object.freeze({ type, amount, giantId });
const xp = (amount = 120) => reward('xp', amount);
const mood = () => reward('mood', 100);
const energy = () => reward('energy', 100);
const currants = () => reward('currants', 100);
const favor = (giantId = 'friendly') => reward('favor', 100, giantId);
/**
 * A Qurazy quoin. Its iMG is level-indexed when collected (GSJS items/quoin.js:
 * 207-209 pays config.qurazy_rewards[level - 1], no quoin multiplier), so the
 * amount here is resolved by paradise-flight.js collectParadisePickup.
 */
const qurazy = () => reward('qurazy', 0);

const pt = (x, y) => Object.freeze({ x, y });
const freezeList = (list) => Object.freeze(list.map((entry) => Object.freeze({ ...entry })));

/** Normal avatar numbers from game.js (vx max 4.4, jump -9.6, gravity 0.42 per frame). */
export const PARADISE_BODY = Object.freeze({
  gravity: 0.42,
  jumpVy: -9.6,
  maxVx: 4.4,
  groundAccel: 0.55,
  airAccel: 0.3,
  coast: 0.78,
  terminalVy: 11.2,
  halfWidth: 14,
  bodyHeight: 62,
});

/** Pickup collision used by game.js for quoin courses: hypot(dx, dy - 30) < 47. */
export const PARADISE_PICKUP_RADIUS = 47;

/** One-way platform; `block` platforms are solid rock to the course floor. */
function platform(x1, x2, y, extra = {}) {
  return { x1, x2, y, ...extra };
}

// ---------------------------------------------------------------------------
// Mountain Scaling: basalt crags and stone pillars above a cloud sea.
// Recording: start crag with a fir, a pillar, a stepped cliff, a row of
// pillars, a second cliff, three rising pillars and the exit cliff (EXIT
// sign, wooden door). Falling into the clouds returns you to the last rock.
const MOUNTAIN_PILLARS_1 = [
  [1500, 652], [1690, 628], [1880, 660], [2070, 618], [2260, 646], [2450, 634],
];
const MOUNTAIN_PILLARS_2 = [[3420, 622], [3610, 596], [3800, 566]];
const MOUNTAIN_PLATFORMS = freezeList([
  platform(0, 380, 640, { block: true, kind: 'crag', id: 'start-crag' }),
  platform(480, 590, 668, { block: true, kind: 'pillar' }),
  platform(690, 890, 620, { block: true, kind: 'cliff', id: 'cliff-1-low' }),
  platform(860, 1020, 538, { block: true, kind: 'cliff', id: 'cliff-1-mid' }),
  platform(990, 1260, 458, { block: true, kind: 'cliff', id: 'cliff-1-top' }),
  platform(1260, 1380, 560, { block: true, kind: 'pillar' }),
  ...MOUNTAIN_PILLARS_1.map(([x, y]) => platform(x - 55, x + 55, y, { block: true, kind: 'pillar' })),
  platform(2580, 2780, 600, { block: true, kind: 'cliff', id: 'cliff-2-low' }),
  platform(2750, 2900, 520, { block: true, kind: 'cliff', id: 'cliff-2-mid' }),
  platform(2880, 3180, 440, { block: true, kind: 'cliff', id: 'cliff-2-top' }),
  platform(3180, 3300, 540, { block: true, kind: 'pillar' }),
  ...MOUNTAIN_PILLARS_2.map(([x, y]) => platform(x - 55, x + 55, y, { block: true, kind: 'pillar' })),
  platform(3900, 4300, 520, { block: true, kind: 'crag', id: 'exit-crag' }),
]);
const MOUNTAIN_PICKUPS = Object.freeze([
  pt(300, 560), pt(535, 600), pt(640, 560), pt(790, 540), pt(940, 450),
  pt(1120, 370), pt(1320, 480), pt(1595, 560), pt(1785, 540), pt(1975, 560),
  pt(2165, 530), pt(2355, 550), pt(2520, 540), pt(2830, 440), pt(3030, 350),
  pt(3240, 460), pt(3515, 530), pt(3705, 500), pt(3850, 470), pt(4040, 430),
]);

// ---------------------------------------------------------------------------
// Aerial Boost: a tall pale-blue sky. Every fluffy cloud bounces you upward;
// the long cloud at the top-left holds the exit door.
const AERIAL_CLOUDS = [
  [420, 3550], [650, 3370], [420, 3190], [690, 3010], [960, 2840], [740, 2660],
  [470, 2480], [230, 2300], [470, 2120], [740, 1940], [1010, 1760], [790, 1580],
  [540, 1400], [290, 1220], [540, 1040], [800, 860], [1060, 690], [820, 530],
];
export const AERIAL_BOOST_BOUNCE_VY = -14.5;
const AERIAL_PLATFORMS = freezeList([
  platform(0, 1400, 3640, { kind: 'cloud-floor', id: 'start-floor' }),
  ...AERIAL_CLOUDS.map(([x, y], index) =>
    platform(x - 120, x + 120, y, {
      kind: 'bounce-cloud',
      id: `bounce-${index + 1}`,
      bounce: -AERIAL_BOOST_BOUNCE_VY,
      boost: 16.5,
    })
  ),
  platform(40, 640, 380, { kind: 'cloud-shelf', id: 'exit-cloud' }),
]);
const AERIAL_PICKUPS = Object.freeze([
  pt(300, 3500),
  ...AERIAL_CLOUDS.slice(0, -1).map(([x, y], index) => {
    const [nx, ny] = AERIAL_CLOUDS[index + 1];
    return pt(Math.round((x + nx) / 2), Math.min(y, ny) - 90);
  }),
  ...[3, 7, 11, 15].map((index) => pt(AERIAL_CLOUDS[index][0], AERIAL_CLOUDS[index][1] - 200)),
  pt(520, 300),
  pt(300, 300),
]);

// ---------------------------------------------------------------------------
// Bippity Bop: inside a cloud. The cloud floor bounces you along under a
// cloud ceiling; hold Space as you land for a bigger bounce. The quoins sit
// between the two recorded lines of text.
export const BIPPITY_BOP_BOUNCE_VY = -15;
const BIPPITY_PLATFORMS = freezeList([
  platform(80, 300, 700, { kind: 'cloud-puff', id: 'start-cloud' }),
  platform(0, 4600, 790, { kind: 'cloud-floor', id: 'bouncy-floor', bounce: 15, boost: 17.5 }),
  platform(4280, 4600, 690, { kind: 'cloud-mound', id: 'exit-mound' }),
]);
const BIPPITY_HEIGHTS = [640, 540, 460, 600, 500, 410];
const BIPPITY_PICKUPS = Object.freeze(
  Array.from({ length: 24 }, (_, index) => pt(1000 + index * 125, BIPPITY_HEIGHTS[index % BIPPITY_HEIGHTS.length]))
);

// ---------------------------------------------------------------------------
// Cloud Flight: the shipped flight model over snowy firs in a cloud sea.
// Start on a fir branch at the left, exit door on a fir branch at the right.
const CLOUD_FLIGHT_PICKUPS = Object.freeze(
  Array.from({ length: 22 }, (_, index) =>
    pt(420 + index * 150, Math.round(520 + Math.sin(index * 0.9) * 230))
  )
);

// ---------------------------------------------------------------------------
// Arbor Hollow: climb fir branches around a great trunk to the nest at the
// top, then drop down the open side of the trunk to the door on the forest
// floor ("grabbing quoins on the way up AND back down").
const ARBOR_FLOOR_Y = 3180;
const ARBOR_TRUNK_X = 800;
const ARBOR_BRANCH_STEP = 92;
const ARBOR_BRANCHES = Array.from({ length: 26 }, (_, index) => {
  const y = 2915 - index * ARBOR_BRANCH_STEP;
  const left = index % 2 === 0;
  const wobble = Math.round(Math.sin(index * 1.7) * 26);
  return left
    ? platform(560 + wobble, 790, y, { kind: 'branch', side: 'left' })
    : platform(810, 1040 + wobble, y, { kind: 'branch', side: 'right' });
});
export const ARBOR_NEST = Object.freeze({ x1: 720, x2: 880, y: 520 });
const ARBOR_PLATFORMS = freezeList([
  platform(0, 1600, ARBOR_FLOOR_Y, { kind: 'forest-floor', id: 'floor' }),
  platform(300, 440, 3095, { kind: 'fungus', id: 'shelf-1' }),
  platform(440, 590, 3005, { kind: 'fungus', id: 'shelf-2' }),
  ...ARBOR_BRANCHES,
  platform(ARBOR_NEST.x1, ARBOR_NEST.x2, ARBOR_NEST.y, { kind: 'nest', id: 'nest' }),
]);
const ARBOR_DROP_X = 1150;
const ARBOR_PICKUPS = Object.freeze([
  pt(370, 3030),
  ...ARBOR_BRANCHES.filter((_, index) => index % 2 === 1).map((branch) =>
    pt(Math.round((branch.x1 + branch.x2) / 2), branch.y - 70)
  ),
  pt(800, 450),
  ...[880, 1160, 1440, 1720, 2000, 2280, 2560, 2840].map((y) => pt(ARBOR_DROP_X, y)),
]);

// ---------------------------------------------------------------------------
// Abysmal Thrill: the sea floor of a deep trench. "Jump to float up": each
// jump is a swim stroke under low water gravity, past rock outcrops and into
// the light, to the exit ledge at the top right.
const ABYSMAL_PLATFORMS = freezeList([
  platform(0, 1400, 3280, { kind: 'seabed', id: 'seabed' }),
  platform(200, 420, 2700, { kind: 'outcrop', side: 'left' }),
  platform(980, 1200, 2200, { kind: 'outcrop', side: 'right' }),
  platform(200, 380, 1700, { kind: 'outcrop', side: 'left' }),
  platform(1000, 1200, 1150, { kind: 'outcrop', side: 'right' }),
  platform(960, 1200, 430, { kind: 'exit-ledge', id: 'exit-ledge' }),
]);
const ABYSMAL_PICKUPS = Object.freeze(
  Array.from({ length: 22 }, (_, index) =>
    pt(Math.round(700 + Math.sin(index * 1.3) * 360), 3120 - index * 122)
  )
);

// ---------------------------------------------------------------------------
// Updraft (description only): a strong wind pours out of a cloud-hole at the
// top left and carries you right. Space rides the gusts upward; three rising
// draughts lift you; the cloud floor is soft.
// Each draught sits on a rising stretch of the quoin trail, so riding it up
// is the way to the next high quoins.
export const UPDRAFT_ZONES = Object.freeze([
  Object.freeze({ x1: 1330, x2: 1490, force: 0.45 }),
  Object.freeze({ x1: 2770, x2: 2930, force: 0.45 }),
  Object.freeze({ x1: 4210, x2: 4370, force: 0.45 }),
]);
const UPDRAFT_PLATFORMS = freezeList([
  platform(220, 500, 470, { kind: 'cloud-puff', id: 'start-cloud' }),
  platform(0, 4800, 1000, { kind: 'cloud-floor', id: 'soft-floor' }),
  platform(4480, 4800, 760, { kind: 'cloud-shelf', id: 'exit-cloud' }),
]);
const UPDRAFT_PICKUPS = Object.freeze(
  Array.from({ length: 24 }, (_, index) =>
    pt(680 + index * 160, Math.round(560 + Math.sin(index * 0.7) * 220))
  )
);

// ---------------------------------------------------------------------------
// Sky Plunge. The production template LHFO01RM7I238UN was never archived
// (no geometry, no recording), so the layout is a clean reconstruction from:
// - the upgrade card, inc_data_imagination.js:7407: "Take the plunge! A fast
//   drop through soft, morning clouds. Can you collect every quoin?"
// - the CC0 card art (opengameart extracted_imagination
//   art_keepable_t2p_skyplunge.png): a mint-to-pale-yellow sky (#c7f1e2 at
//   the top to #d9e4b8 low down) with white clouds; the top of the palette;
// - the only image of the course, a player Snap of its landing (Festeus,
//   2012-10-01; glitchthegame.com snap PHF6RRQFSTC2DA8, its location link is
//   LHFO01RM7I238UN; research/wayback/raw/snaps/paradise_sky_plunge/,
//   reference only): a cream-gold sky (#eee0b6) with sun rays over a white
//   cloud floor, the sky lettering "AHHHHH YEAHHHH!!!!!", and two wooden
//   doors on the floor in front of the cloud banks at either side, signed
//   "Back to Top" (left) and "EXIT" (right). The lettering and the two signs
//   are transcribed from it (drawn as remake text, as other rooms took text
//   from recordings); the doors are the CC0 door_asset_heights_interior.
//   No source says what "Back to Top" did; doors in Glitch locations were
//   location geometry, and the name says it: it takes you back up to the top
//   cloud for another fall (players needed several falls for every quoin).
// - player reports (glitch.com forum general/24841, 25493, bugs/27422;
//   reference only): a freefall, every quoin often takes several falls, a
//   Qurazy quoin is in the course, and collecting every quoin plays a
//   special message and music (only Radial Heights and Sky Plunge had one).
// - music: GSJS inc_data_sounds.js:203-206 cut CLOUD_DROP_2 (8 s) and
//   CLOUD_DROP_2_INTRO from the Rainbow Run A Cappella theme players name as
//   the Sky Plunge music, named for Ryan's WIP street cloud_drop_2
//   (LDOQBF6DEO138FJ, inc_data_maps_prod.js:18592). No source binds a key to
//   LHFO01RM7I238UN, and TICKET_TO_PARADISE1 (the full take) is unrecovered.
// Remake choices: the 26-quoin layout, the Qurazy as one of the last two
// quoins, the message wording, the door positions read off the Snap, and the
// exit opening once every quoin is in, as on every remake course.
/** The landing's cloud floor (the Snap's), across the whole course. */
export const SKY_PLUNGE_LANDING_Y = 4260;
const PLUNGE_PLATFORMS = freezeList([
  platform(160, 460, 320, { kind: 'cloud-shelf', id: 'start-cloud' }),
  platform(0, 1400, SKY_PLUNGE_LANDING_Y, { kind: 'cloud-floor', id: 'landing' }),
]);
/** The "Back to Top" door (left on the landing): stand at it to go back up to the start cloud. */
export const SKY_PLUNGE_BACK_TO_TOP = Object.freeze({ x: 225, y: SKY_PLUNGE_LANDING_Y, reach: 36, label: 'Back to Top' });
/**
 * Text on the landing, transcribed from the Snap (positions read off it):
 * glitchthegame.com snap PHF6RRQFSTC2DA8 (Festeus, 2012-10-01). Desk
 * FOOTWORDS (Austin 2026-10-26, G314): the three-word "Back to Top" sign stays.
 */
export const SKY_PLUNGE_LANDING_SIGNS = Object.freeze([
  Object.freeze({ id: 'lettering', text: 'AHHHHH YEAHHHH!!!!!', x: 640, y: SKY_PLUNGE_LANDING_Y - 340, size: 62 }),
  Object.freeze({ id: 'back-to-top', text: 'Back to Top', x: 205, y: SKY_PLUNGE_LANDING_Y - 240, size: 40 }),
  Object.freeze({ id: 'exit', text: 'EXIT', x: 1185, y: SKY_PLUNGE_LANDING_Y - 240, size: 40 }),
]);
const PLUNGE_PICKUPS = Object.freeze(
  Array.from({ length: 26 }, (_, index) =>
    pt(Math.round(700 + Math.sin(index * 0.8) * 400), 600 + index * 140)
  )
);
/** Index of the Qurazy quoin: one of the last two in the fall. */
export const SKY_PLUNGE_QURAZY_INDEX = 24;

// ---------------------------------------------------------------------------
// Drafty Uplift (description only): a gentle draught lifts you up a lavender
// sky past a few jokes. Space rises faster, Down sinks.
const DRAFTY_PLATFORMS = freezeList([
  platform(0, 1400, 3680, { kind: 'cloud-floor', id: 'start-floor' }),
  platform(200, 760, 400, { kind: 'cloud-shelf', id: 'exit-cloud' }),
]);
const DRAFTY_PICKUPS = Object.freeze(
  Array.from({ length: 22 }, (_, index) =>
    pt(Math.round(700 + Math.sin(index * 1.1) * 430), 3450 - index * 135)
  )
);
/** Remake copy: the source says only "enjoy a good joke". */
export const DRAFTY_UPLIFT_JOKES = Object.freeze([
  Object.freeze({ x: 700, y: 3330, text: 'What do clouds wear under their shorts?\nThunderpants.' }),
  Object.freeze({ x: 520, y: 2660, text: 'Why did the piggy sit in the breeze?\nTo be a little cooler, champ.' }),
  Object.freeze({ x: 880, y: 1980, text: 'How does a butterfly stay so calm?\nIt just goes with the flutter.' }),
  Object.freeze({ x: 560, y: 1300, text: 'What did one updraft say to the other?\nNothing. It just let it slide.' }),
  Object.freeze({ x: 760, y: 700, text: "It's the little things that make life great." }),
]);

// ---------------------------------------------------------------------------

/**
 * Updraft and Drafty Uplift may never have been released to players. Tiny
 * Speck built both (config_prod.js paradise_locations, items/paradise_ticket_*),
 * but GSJS inc_data_imagination.js deals an upgrade card for only 11 Paradise
 * tickets and neither is one of them, their items have has_infopage = false
 * (no encyclopedia page), no patch note mentions them, and the forum location
 * list (glitch.com forum general/9830) logs exactly 11 Paradise levels going
 * live: Update 25 (Arbor Hollow, Cloud Flight, Radial Heights, Sky Plunge,
 * Starlit Night), Update 27 (Abysmal Thrill, Beam Me Down, Bippity Bop,
 * Cloud Rings, Mountain Scaling) and Update 28 (Slip 'N Slide). Notes:
 * research/video/README.md section 3b, research/wayback/raw/paradise-2026-10-23/.
 */
export const PARADISE_UNCONFIRMED_RELEASE_LINE =
  'Tiny Speck built this course, but it may never have reached players.';
const unreleased = Object.freeze({
  releaseNote: 'unconfirmed',
  releaseLine: PARADISE_UNCONFIRMED_RELEASE_LINE,
});

const course = (def) => Object.freeze({
  ringCount: 0,
  starterTicket: false,
  exitLabel: '', // the scene paints its own EXIT plank
  progressNoun: 'quoins',
  skyStars: 0,
  ...def,
  pickupCount: def.pickups.length,
  rewards: Object.freeze(def.rewards),
});

export const EXTRA_PARADISE_COURSES = Object.freeze({
  aerial_boost: course({
    id: 'aerial_boost',
    name: 'Aerial Boost',
    ticketId: 'paradise_ticket_aerial_boost',
    templateTsid: 'LHF1CF7EER5306P',
    // source: items/paradise_ticket_aerial_boost.js
    ticketDesc: 'Activate this card to bounce atop fluffy clouds, grabbing quoins as you journey upwards.',
    reference: 'video',
    aliases: Object.freeze(['aerial', 'boost']),
    movement: 'platform',
    art: 'aerial_boost',
    width: 1400,
    height: 3800,
    spawn: pt(200, 3640),
    exit: pt(110, 380),
    platforms: AERIAL_PLATFORMS,
    pickups: AERIAL_PICKUPS,
    objective: 'Bounce up the clouds and collect 24 quoins',
    completion: 'You bounced all the way to the top. The way home is open!',
    controls: 'Arrows steer · land on clouds to bounce · hold Spacebar for more',
    controlsHint: 'Clouds bounce you upward. Arrow keys steer; hold Spacebar as you land for a bigger bounce.',
    prompt: 'BOUNCE UP THE CLOUDS!',
    palette: Object.freeze([0x5ea9d2, 0x86c4e0, 0xb2e0ee, 0xdcf3f8]),
    transitionColors: Object.freeze([0x5ea9d2, 0xdcf3f8]),
    rewards: [
      // recorded at 1x: +4 iMG, +4 currants, +4 mood, +20 iMG, +13 favor, +97 iMG last
      xp(), currants(), mood(), xp(600), favor(), xp(), energy(), currants(),
      xp(), mood(), xp(), currants(), xp(600), energy(), xp(), favor(),
      mood(), xp(), currants(), xp(), energy(), xp(), mood(), xp(3000),
    ],
    completionReward: xp(1098),
  }),
  mountain_scaling: course({
    id: 'mountain_scaling',
    name: 'Mountain Scaling',
    ticketId: 'paradise_ticket_mountain_scaling',
    templateTsid: 'LHFSE9JCDR53EG8',
    // source: items/paradise_ticket_mountain_scaling.js
    ticketDesc: 'Activate this card to traipse along the tippity-top of a mountain landscape. Try not to fall down into the clouds!',
    reference: 'video',
    aliases: Object.freeze(['mountain', 'scaling']),
    movement: 'platform',
    art: 'mountain_scaling',
    width: 4300,
    height: 1000,
    fallY: 880,
    cloudY: 820,
    spawn: pt(150, 640),
    exit: pt(4180, 520),
    platforms: MOUNTAIN_PLATFORMS,
    pickups: MOUNTAIN_PICKUPS,
    objective: 'Scale the crags and collect 20 quoins',
    // source: recorded completion text over the exit cliff
    completion: "Whether you're big or small, scaling mountains is some tough business! Congratulations! You made it!",
    controls: 'Arrows walk · Spacebar jumps · mind the clouds',
    controlsHint: 'Arrow keys walk, Spacebar jumps. Try not to fall down into the clouds!',
    prompt: 'JUMP FROM CRAG TO CRAG!',
    palette: Object.freeze([0x3d98cc, 0x74b7db, 0xadd5e6, 0xe2eef1]),
    transitionColors: Object.freeze([0x3d98cc, 0xe2eef1]),
    rewards: [
      // recorded: +120, +360, +100 energy, +120, +120, +100 energy ... +3000, exit +1098
      xp(), xp(360), energy(), xp(), xp(), energy(), mood(), favor('zille'),
      xp(), currants(), xp(360), mood(), xp(), currants(), xp(), energy(),
      xp(360), currants(), xp(), xp(3000),
    ],
    completionReward: xp(1098),
  }),
  abysmal_thrill: course({
    id: 'abysmal_thrill',
    name: 'Abysmal Thrill',
    ticketId: 'paradise_ticket_abysmal_thrill',
    templateTsid: 'LHF5NUH5UT53VSG',
    // source: items/paradise_ticket_abysmal_thrill.js
    ticketDesc: "Activate this card to explore the depths of Abysmal Thrill, floating up as you test your quoin-gettin' skills.",
    reference: 'video',
    aliases: Object.freeze(['abysmal', 'thrill', 'abyss']),
    movement: 'swim',
    art: 'abysmal_thrill',
    width: 1400,
    height: 3400,
    minX: 200,
    maxX: 1200,
    ceilingY: 140,
    spawn: pt(260, 3280),
    exit: pt(1130, 430),
    platforms: ABYSMAL_PLATFORMS,
    pickups: ABYSMAL_PICKUPS,
    // source: recorded sign beside the start
    signs: freezeList([{ x: 600, y: 3170, text: 'Jump to\nfloat up', size: 30 }]),
    // Jal-style jetpack water (gravity 362, vy_jump -713 capped by vy_max 447 of 1190/570/670).
    physics: Object.freeze({ gravity: 0.128, strokeVy: -7.5, terminalVy: 6.4, maxVx: 2.95, airAccel: 0.2, drag: 0.993 }),
    objective: 'Float up through the deep and collect 22 quoins',
    completion: 'You floated right out of the abyss. The way home is open!',
    controls: 'Spacebar swims up · arrows steer',
    controlsHint: 'Jump to float up: each Spacebar press is a swim stroke. Arrow keys steer.',
    prompt: 'JUMP TO FLOAT UP!',
    // Clearer teal-blue water, sampled from a player's Snap (research/wayback/raw/snaps/
    // paradise_abysmal_thrill/, G79: #0c2134 to #233849 mid-depth, never black).
    palette: Object.freeze([0x2b6684, 0x17405a, 0x0d2a40, 0x062034]),
    transitionColors: Object.freeze([0x0d2a40, 0x2b6684]),
    rewards: [
      // recorded: +120, +100 mood, +120, +600, +100 favor (Ti), +600, +100 currants, +480, +120, exit +954
      xp(), mood(), xp(), xp(600), favor('ti'), xp(600), currants(), xp(480),
      xp(), energy(), xp(), mood(), xp(), currants(), xp(480), energy(),
      xp(), mood(), xp(), currants(), xp(600), xp(),
    ],
    completionReward: xp(954),
  }),
  arbor_hollow: course({
    id: 'arbor_hollow',
    name: 'Arbor Hollow',
    ticketId: 'paradise_ticket_arbor_hollow',
    templateTsid: 'LHFDKS616Q23NT6',
    // source: items/paradise_ticket_arbor_hollow.js
    ticketDesc: 'Activate this card to climb to the tall of Arbor Hollow, grabbing quoins on the way up AND back down.',
    reference: 'video',
    aliases: Object.freeze(['arbor', 'hollow']),
    movement: 'platform',
    art: 'arbor_hollow',
    width: 1600,
    height: 3300,
    trunkX: ARBOR_TRUNK_X,
    dropX: ARBOR_DROP_X,
    spawn: pt(200, ARBOR_FLOOR_Y),
    exit: pt(1480, ARBOR_FLOOR_Y),
    platforms: ARBOR_PLATFORMS,
    pickups: ARBOR_PICKUPS,
    objective: 'Climb to the nest and back down for 23 quoins',
    completion: 'Up to the nest and all the way back down. The way home is open!',
    controls: 'Arrows walk · Spacebar jumps',
    controlsHint: 'Arrow keys walk, Spacebar jumps. Climb the branches to the nest, then drop down the far side.',
    prompt: 'CLIMB TO THE TALL!',
    palette: Object.freeze([0x5aaee0, 0x2d5a3b, 0x1a3522, 0x0d1c10]),
    transitionColors: Object.freeze([0x1a3522, 0x5aaee0]),
    rewards: [
      // recorded: +100 mood, +100 energy, +100 currants, +100 mood, +120 ... nest +3000,
      // the drop +120 +480 +120 +720 +240 ..., exit +954
      mood(), energy(), currants(), mood(), xp(), energy(), xp(), currants(),
      xp(), mood(), xp(), favor(), xp(), energy(), xp(3000),
      xp(), xp(480), xp(), xp(720), xp(240), xp(), xp(480), xp(),
    ],
    completionReward: xp(954),
  }),
  bippity_bop: course({
    id: 'bippity_bop',
    name: 'Bippity Bop',
    ticketId: 'paradise_ticket_bippity_bop',
    templateTsid: 'LHFS1L44SR53F5O',
    // source: items/paradise_ticket_bippity_bop.js
    ticketDesc: "Activate this card to bounce along a fluffy, joyful skyscape! You'll probably get some quoins out of it too.",
    reference: 'video',
    aliases: Object.freeze(['bippity', 'bop']),
    movement: 'platform',
    art: 'bippity_bop',
    width: 4600,
    height: 900,
    ceilingY: 150,
    spawn: pt(190, 700),
    exit: pt(4470, 690),
    platforms: BIPPITY_PLATFORMS,
    pickups: BIPPITY_PICKUPS,
    // source: recorded text at the start and beside the exit
    signs: freezeList([
      { x: 660, y: 560, text: 'Ever wonder what\nbeing inside a cloud\nwould feel like?', size: 26 },
      { x: 4080, y: 560, text: 'Fluffy.\nLike marshmallows\nand cotton candy.', size: 26 },
    ]),
    objective: 'Bounce through the cloud and collect 24 quoins',
    completion: 'Fluffy. Like marshmallows and cotton candy. The way home is open!',
    controls: 'Arrows steer · hold Spacebar to bounce higher',
    controlsHint: 'The cloud floor bounces you along. Arrow keys steer; hold Spacebar as you land to bounce higher.',
    prompt: 'BOUNCE ALONG THE CLOUD!',
    palette: Object.freeze([0x8b76b6, 0xb49ac4, 0xdcb4bb, 0xefcfb6]),
    transitionColors: Object.freeze([0x8b76b6, 0xefcfb6]),
    rewards: [
      // recorded: +100 mood, +120, +100 currants, +100 energy, +100 favor, +120 ... +600, +240, exit +858
      mood(), xp(), currants(), energy(), favor(), xp(), currants(), xp(),
      xp(600), mood(), xp(), energy(), xp(), currants(), mood(), xp(),
      energy(), xp(), currants(), xp(600), mood(), xp(), energy(), xp(240),
    ],
    completionReward: xp(858),
  }),
  cloud_flight: course({
    id: 'cloud_flight',
    name: 'Cloud Flight',
    ticketId: 'paradise_ticket_cloud_flight',
    templateTsid: 'LHFOLH3T7I23A8M',
    // source: items/paradise_ticket_cloud_flight.js
    ticketDesc: 'Activate this card to sail about Cloud Flight. Tickle the tree-tops, collecting quoins as you fly.',
    reference: 'video',
    aliases: Object.freeze(['flight', 'cloudflight']),
    // Uses the shipped Cloud Rings / Radial Heights flight model in game.js.
    art: 'cloud_flight',
    width: 4000,
    height: 1000,
    spawn: pt(200, 520),
    exit: pt(3800, 470),
    pickups: CLOUD_FLIGHT_PICKUPS,
    objective: 'Sail over the tree-tops and collect 22 quoins',
    completion: 'You tickled every tree-top. The way home is open!',
    prompt: 'PRESS SPACEBAR TO FLY!',
    palette: Object.freeze([0x1b8cc7, 0x4dade0, 0x9ad0e8, 0xe6f3f6]),
    transitionColors: Object.freeze([0x1b8cc7, 0xe6f3f6]),
    skyStars: 40,
    rewards: [
      // recorded: +120, +100 mood, +100 energy, +120, +120, +100 mood, +480, exit +954
      xp(), mood(), energy(), xp(), xp(), mood(), xp(480), currants(),
      xp(), favor(), xp(), energy(), xp(), currants(), xp(480), mood(),
      xp(), energy(), xp(), currants(), mood(), xp(600),
    ],
    completionReward: xp(954),
  }),
  updraft: course({
    id: 'updraft',
    name: 'Updraft',
    ticketId: 'paradise_ticket_updraft',
    templateTsid: 'LHF9DQTKQT53RDI',
    // source: items/paradise_ticket_updraft.js
    ticketDesc: 'Activate this card to ride the strong wind emanating from a mysterious cloud-hole in the sky. Glide right, and grab those quoins!',
    reference: 'description',
    ...unreleased, // see PARADISE_UNCONFIRMED_RELEASE_LINE
    aliases: Object.freeze(['updraught', 'wind']),
    movement: 'glide',
    art: 'updraft',
    width: 4800,
    height: 1100,
    ceilingY: 90,
    holeX: 150,
    holeY: 350,
    spawn: pt(340, 470),
    exit: pt(4690, 760),
    platforms: UPDRAFT_PLATFORMS,
    pickups: UPDRAFT_PICKUPS,
    zones: UPDRAFT_ZONES,
    physics: Object.freeze({ gravity: 0.14, terminalVy: 2.6, diveGravity: 0.3, diveVy: 5.5, lift: 0.34, maxRise: 4.2, windVx: 3.2, fastVx: 5.4, slowVx: -1.4, windResponse: 0.06 }),
    objective: 'Glide right on the wind and grab 24 quoins',
    completion: 'You rode the wind all the way across. The way home is open!',
    controls: 'The wind carries you · Spacebar rises · Down dives · arrows speed or slow',
    controlsHint: 'The wind carries you right. Hold Spacebar to ride upward, Down to dive; arrows speed up or hold back.',
    prompt: 'GLIDE RIGHT ON THE WIND!',
    palette: Object.freeze([0x2b8bce, 0x60b0df, 0xa4d4ec, 0xdff1f8]),
    transitionColors: Object.freeze([0x2b8bce, 0xdff1f8]),
    rewards: [
      xp(), currants(), mood(), xp(), energy(), xp(360), favor(), xp(),
      currants(), mood(), xp(), energy(), xp(480), currants(), xp(), mood(),
      xp(), energy(), xp(360), currants(), xp(), mood(), xp(), xp(600),
    ],
    completionReward: xp(954),
  }),
  sky_plunge: course({
    id: 'sky_plunge',
    name: 'Sky Plunge',
    ticketId: 'paradise_ticket_sky_plunge',
    templateTsid: 'LHFO01RM7I238UN',
    // source: items/paradise_ticket_sky_plunge.js
    ticketDesc: 'Activate this card to take the Sky Plunge! Swiftly drop through morning clouds, collecting quoins as you fall.',
    // source: inc_data_imagination.js:7407 (Ticket To Sky Plunge card)
    cardDesc: 'Take the plunge! A fast drop through soft, morning clouds. Can you collect every quoin?',
    // Card, card art and player reports; no recording or geometry survives.
    reference: 'card-forum',
    aliases: Object.freeze(['plunge', 'skyplunge']),
    movement: 'plunge',
    art: 'sky_plunge',
    width: 1400,
    height: 4400,
    ceilingY: 80,
    spawn: pt(300, 320),
    exit: pt(1150, SKY_PLUNGE_LANDING_Y),
    platforms: PLUNGE_PLATFORMS,
    pickups: PLUNGE_PICKUPS,
    // The landing's left door takes you back up to the start cloud (the Snap).
    backToTop: SKY_PLUNGE_BACK_TO_TOP,
    backToTopToast: 'Back to the top. Plunge again!',
    landingSigns: SKY_PLUNGE_LANDING_SIGNS,
    physics: Object.freeze({ gravity: 0.3, terminalVy: 5.6, floatVy: 1.8, diveVy: 9, maxVx: 4.2, airAccel: 0.32 }),
    objective: 'Can you collect every quoin? 26 in the clouds',
    // The special message for every quoin (remake copy after Radial Heights'
    // source sign "Good work, you've got all the stars!", GHFQOLEIHN63P27).
    completion: "Good work, you've got every quoin! The way home is open!",
    // The source keys: the Rainbow Run A Cappella intro over the course's
    // CLOUD_DROP_2 loop. Those c2 cuts are in no CC0 release (G317): the key
    // plays Tiny Speck's CC0 Rainbow Run theme (assets/content/ambient-music.json)
    // and the intro borrows the CC0 choir sting (build-sound-keys.mjs ALIASES).
    musicFile: 'CLOUD_DROP_2',
    completionSound: 'CLOUD_DROP_2_INTRO',
    controls: 'Arrows steer · hold Spacebar to float · Down dives',
    controlsHint: 'Step off the cloud and fall. Arrow keys steer, hold Spacebar to float, Down to dive. Missed a quoin? The Back to Top door on the landing takes you up for another plunge.',
    prompt: 'STEP OFF AND PLUNGE!',
    // Card art sky (mint) at the top to the Snap's cream-gold landing sky.
    palette: Object.freeze([0xc4f0e2, 0xd4ecc9, 0xe7e3ba, 0xefe0b5]),
    transitionColors: Object.freeze([0xc4f0e2, 0xefe0b5]),
    rewards: [
      xp(), mood(), currants(), xp(), energy(), xp(), favor(), xp(360),
      currants(), mood(), xp(), energy(), xp(), currants(), xp(480), mood(),
      xp(), energy(), xp(), currants(), xp(360), mood(), xp(), energy(), qurazy(), xp(600),
    ],
    completionReward: xp(954),
  }),
  drafty_uplift: course({
    id: 'drafty_uplift',
    name: 'Drafty Uplift',
    ticketId: 'paradise_ticket_drafty_uplift',
    templateTsid: 'LHFRHB1SKR53402',
    // source: items/paradise_ticket_drafty_uplift.js
    ticketDesc: "Activate this card to chill out and enjoy a good joke. It's the little things that make life great, champ.",
    reference: 'description',
    ...unreleased, // see PARADISE_UNCONFIRMED_RELEASE_LINE
    aliases: Object.freeze(['drafty', 'uplift']),
    movement: 'updraft',
    art: 'drafty_uplift',
    width: 1400,
    height: 3800,
    ceilingY: 120,
    spawn: pt(300, 3680),
    exit: pt(320, 400),
    platforms: DRAFTY_PLATFORMS,
    pickups: DRAFTY_PICKUPS,
    signs: freezeList(DRAFTY_UPLIFT_JOKES.map((joke) => ({ ...joke, size: 20 }))),
    physics: Object.freeze({ rise: 2.4, boostRise: 4.2, sink: 2.2, response: 0.08, maxVx: 3.6, airAccel: 0.26, liftOffVy: -6 }),
    objective: 'Drift up the draught and collect 22 quoins',
    completion: "It's the little things that make life great, champ. The way home is open!",
    controls: 'The draught lifts you · Spacebar rises faster · Down sinks',
    controlsHint: 'Jump into the draught and it lifts you. Spacebar rises faster, Down sinks, arrows steer.',
    prompt: 'JUMP INTO THE DRAUGHT!',
    palette: Object.freeze([0x7a6cb0, 0xa394cd, 0xc8b8de, 0xe9ddef]),
    transitionColors: Object.freeze([0x7a6cb0, 0xe9ddef]),
    rewards: [
      xp(), mood(), xp(), currants(), energy(), xp(), favor(), xp(360),
      mood(), currants(), xp(), energy(), xp(), mood(), xp(480), currants(),
      xp(), energy(), xp(), mood(), xp(), xp(600),
    ],
    completionReward: xp(954),
  }),
});

export const EXTRA_PARADISE_COURSE_IDS = Object.freeze(Object.keys(EXTRA_PARADISE_COURSES));

/** Courses whose avatar body this module steps (Cloud Flight uses game.js flight). */
export function usesParadiseBody(course) {
  return Boolean(course && ['platform', 'swim', 'glide', 'plunge', 'updraft'].includes(course.movement));
}

export function resolveParadiseCourseAlias(raw, courses = EXTRA_PARADISE_COURSES) {
  const key = String(raw || '').toLowerCase().replace(/[-\s']+/g, '_');
  if (courses[key]) return key;
  const flat = key.replace(/_/g, '');
  const hit = Object.values(courses).find((entry) =>
    entry.aliases?.includes(key) || entry.aliases?.includes(flat) || entry.id.replace(/_/g, '') === flat
  );
  return hit ? hit.id : null;
}

function inRange(x, p, pad = 0) {
  return x >= p.x1 - pad && x <= p.x2 + pad;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function stepOnce(course, body, input, h, events) {
  const p = { ...PARADISE_BODY, ...(course.physics || {}) };
  const platforms = course.platforms || [];
  const hw = p.halfWidth;
  const movement = course.movement;
  const left = Boolean(input.left) && !input.right;
  const right = Boolean(input.right) && !input.left;
  const dir = left ? -1 : right ? 1 : 0;
  const rising = Boolean(input.up || input.jumpHeld);

  // Horizontal.
  if (movement === 'glide' && !body.onGround) {
    const target = right ? p.fastVx : left ? p.slowVx : p.windVx;
    body.vx += (target - body.vx) * Math.min(1, p.windResponse * h);
  } else {
    // (Gliders standing on a cloud are sheltered from the wind.)
    const accel = body.onGround ? p.groundAccel : p.airAccel;
    if (dir) body.vx = clampNumber(body.vx + dir * accel * h, -p.maxVx, p.maxVx);
    else if (body.onGround) body.vx *= Math.pow(p.coast, h);
    else body.vx *= Math.pow(movement === 'platform' ? 0.995 : 0.96, h);
    if (Math.abs(body.vx) < 0.03) body.vx = 0;
  }

  // Vertical.
  if (movement === 'platform') {
    if (input.jumpPressed && body.onGround) {
      body.vy = p.jumpVy;
      body.onGround = false;
      events.push('jump');
    }
    body.vy = Math.min(p.terminalVy, body.vy + p.gravity * h);
  } else if (movement === 'swim') {
    if (input.jumpPressed) {
      body.vy = body.vy < 0 ? Math.max(p.strokeVy, body.vy + p.strokeVy * 0.5) : p.strokeVy;
      body.onGround = false;
      events.push('stroke');
    }
    body.vy = (body.vy + p.gravity * h) * Math.pow(p.drag, h);
    body.vy = clampNumber(body.vy, p.strokeVy, p.terminalVy);
  } else if (movement === 'glide') {
    if (input.jumpPressed && body.onGround) {
      body.vy = -6;
      body.onGround = false;
      events.push('jump');
    }
    const diving = Boolean(input.down) && !rising;
    body.vy += (rising ? -p.lift : diving ? p.diveGravity : p.gravity) * h;
    for (const zone of course.zones || []) {
      if (inRange(body.x, zone)) body.vy -= zone.force * h;
    }
    body.vy = clampNumber(body.vy, -p.maxRise, diving ? p.diveVy : p.terminalVy);
  } else if (movement === 'plunge') {
    if (input.jumpPressed && body.onGround) {
      body.vy = -6;
      body.onGround = false;
      events.push('jump');
    }
    const cap = rising ? p.floatVy : input.down ? p.diveVy : p.terminalVy;
    if (body.vy < cap) body.vy = Math.min(cap, body.vy + p.gravity * h);
    else body.vy += (cap - body.vy) * Math.min(1, 0.14 * h);
  } else if (movement === 'updraft') {
    if (input.jumpPressed && body.onGround) {
      body.vy = p.liftOffVy;
      body.onGround = false;
      events.push('jump');
    }
    if (!body.onGround) {
      const target = rising ? -p.boostRise : input.down ? p.sink : -p.rise;
      body.vy += (target - body.vy) * Math.min(1, p.response * h);
    }
  }

  const prevX = body.x;
  const prevY = body.y;
  body.x += body.vx * h;
  body.y += body.vy * h;

  // Solid rock blocks stop you from walking into their sides.
  for (const block of platforms) {
    if (!block.block) continue;
    const overlapsVertically = body.y > block.y + 3 && body.y - p.bodyHeight < (block.bottom ?? course.height);
    if (!overlapsVertically) continue;
    if (prevX + hw <= block.x1 && body.x + hw > block.x1) {
      body.x = block.x1 - hw;
      body.vx = 0;
    } else if (prevX - hw >= block.x2 && body.x - hw < block.x2) {
      body.x = block.x2 + hw;
      body.vx = 0;
    }
  }

  const minX = (course.minX ?? 0) + hw;
  const maxX = (course.maxX ?? course.width) - hw;
  if (body.x < minX) { body.x = minX; body.vx = Math.max(0, body.vx); }
  if (body.x > maxX) { body.x = maxX; body.vx = Math.min(0, body.vx); }
  const ceiling = (course.ceilingY ?? 0) + p.bodyHeight;
  if (body.y < ceiling) {
    body.y = ceiling;
    if (body.vy < 0) body.vy = 0;
  }

  // One-way landings: only while moving down through a platform top.
  if (body.vy >= 0) {
    let best = -1;
    for (let index = 0; index < platforms.length; index += 1) {
      const plat = platforms[index];
      if (!inRange(body.x, plat, hw * 0.6)) continue;
      if (prevY <= plat.y + 0.01 && body.y >= plat.y) {
        if (best < 0 || plat.y < platforms[best].y) best = index;
      }
    }
    if (best >= 0) {
      const plat = platforms[best];
      body.y = plat.y;
      if (plat.bounce) {
        body.vy = -(input.jumpHeld && plat.boost ? plat.boost : plat.bounce);
        body.onGround = false;
        body.lastBounce = best;
        events.push('bounce');
      } else {
        if (!body.onGround) events.push('land');
        body.vy = 0;
        body.onGround = true;
        body.groundIndex = best;
        body.safe = { x: clampNumber(body.x, plat.x1 + 24, plat.x2 - 24), y: plat.y };
      }
    } else if (body.onGround) {
      body.onGround = false;
    }
  } else {
    body.onGround = false;
  }

  // Sky Plunge's "Back to Top" door: standing at it on the landing takes you
  // back up to the start cloud for another fall.
  const door = course.backToTop;
  if (door && body.onGround && Math.abs(body.y - door.y) < 1 && Math.abs(body.x - door.x) <= door.reach) {
    body.x = course.spawn.x;
    body.y = course.spawn.y;
    body.vx = 0;
    body.vy = 0;
    body.onGround = true;
    events.push('back_to_top');
  }

  if (course.fallY && body.y > course.fallY) {
    // Mountain Scaling returns you to the last rock.
    const safe = body.safe || course.spawn;
    body.x = safe.x;
    body.y = safe.y;
    body.vx = 0;
    body.vy = 0;
    body.onGround = true;
    events.push('respawn');
  }
}

/**
 * Advance one avatar body (x/y feet, vx/vy per 60 Hz frame) through a course.
 * Mutates and returns `body`; `events` lists jump/stroke/bounce/land/respawn.
 */
export function stepParadiseBody(course, body, input = {}, dt = 1) {
  const events = [];
  if (!usesParadiseBody(course) || !body) return { body, events };
  const frames = Math.max(0, Number(dt) || 0);
  const steps = Math.max(1, Math.min(8, Math.ceil(frames)));
  const h = frames / steps;
  let first = true;
  for (let index = 0; index < steps; index += 1) {
    stepOnce(course, body, first ? input : { ...input, jumpPressed: false }, h, events);
    first = false;
  }
  return { body, events };
}

export function paradiseCourseTicketDescription(courseDef) {
  return courseDef?.ticketDesc || '';
}
