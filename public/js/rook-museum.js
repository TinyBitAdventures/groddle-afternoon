/**
 * Museum of the Rook transient quest.
 *
 * Contract sources:
 * - quests/rook_hall_start.js
 * - quests/rook_hall.js
 * - items/rook_hall_speaker.js
 * - items/npc_quest_widget.js
 *
 * Layout: the instance template (LA91BDTNHS82D36) is not in the locations
 * dump, but the GSJS keeps its key points in the instance's own coordinates
 * (ROOK_MUSEUM_SOURCE): where you arrive, where Greeterbot starts and where it
 * goes, where each painting overlay plays and where each speaker puts you.
 * The hall is laid out on those points; everything between them (door,
 * windows, bench, speakers, orb and shrine spots) is placed from the three
 * player recordings of the museum (WyBQqq8TMVc, 53YLN1SHLU4, dTqJiZDUZBY;
 * reference only, never shipped as pixels).
 */

import { ROOK_ART } from './rook-art.js?v=3d9cd2ae';

export const ROOK_HALL_START_QUEST_ID = 'rook_hall_start';
export const ROOK_HALL_QUEST_ID = 'rook_hall';
export const ROOK_MUSEUM_STREET_ID = 'INSTANCE_ROOK_MUSEUM';
export const ROOK_MUSEUM_PRODUCTION_TSID = 'LA91BDTNHS82D36';
export const ROOK_MUSEUM_EXHIBIT_COUNT = 6;
export const ROOK_MUSEUM_REWARD = Object.freeze({ xp: 400 });

/**
 * The museum's points in the instance's own coordinates (x right, y down,
 * the floor about y -94).
 * - entry: rook_hall.js startMuseum, questInstanceLocation(pc, 'rook_museum', -2270, -136).
 * - greeterStart: rook_hall.js onEnterLocation, createItemStack('npc_quest_widget', 1, -2132, -196).
 * - greeterEnd: rook_hall.js callback_widgetConversation, move_to_xy {x: 2200, y: -100}.
 * - overlays: rook_hall_speaker.js play(), the location_overlay x, y per button
 *   (centre-bottom registration, InLocationAnnouncementOverlay.as 439): the
 *   overlay is the painting deco's own 429 x 312 stage, so it is where the
 *   framed painting hangs.
 * - avatar: rook_hall_speaker.js play(), move_avatar per button (where the
 *   lesson stands you, and which way you face).
 * - floorY: the lowest avatar point (button_5, -94). The recordings put the
 *   frames' bottom edge about 93 px over the feet, which agrees: -190 + 93.
 */
export const ROOK_MUSEUM_SOURCE = Object.freeze({
  entry: Object.freeze({ x: -2270, y: -136 }),
  greeterStart: Object.freeze({ x: -2132, y: -196 }),
  greeterEnd: Object.freeze({ x: 2200, y: -100 }),
  overlays: Object.freeze({
    button_1: Object.freeze({ overlay: 'rook_hall_painting_01', x: -1180, y: -190 }),
    button_2: Object.freeze({ overlay: 'rook_hall_painting_02', x: -469, y: -189 }),
    button_4: Object.freeze({ overlay: 'rook_hall_painting_03', x: 541, y: -189 }),
    button_6: Object.freeze({ overlay: 'rook_hall_painting_04', x: 1750, y: -187 }),
  }),
  avatar: Object.freeze({
    button_1: Object.freeze({ x: -1036, y: -141, face: 'left' }),
    button_2: Object.freeze({ x: -372, y: -141, face: 'left' }),
    button_3: Object.freeze({ x: -16, y: -125, face: 'right' }),
    button_4: Object.freeze({ x: 696, y: -136, face: 'left' }),
    button_5: Object.freeze({ x: 1217, y: -94, face: 'left' }),
    button_6: Object.freeze({ x: 1886, y: -133, face: 'left' }),
  }),
  floorY: -94,
});

/**
 * The remake's world for the instance: source x + 2600, source y + 594 (the
 * floor at y 500). The ends are ours: the left wall just past the arrival
 * door, the right one past Greeterbot's last spot.
 */
export const ROOK_MUSEUM_WORLD = Object.freeze({
  left: -2600,
  right: 2500,
  floorY: 500,
  height: 620,
});

/** A source point in world px. */
export function rookMuseumWorldPoint(x, y = ROOK_MUSEUM_SOURCE.floorY) {
  return {
    x: x - ROOK_MUSEUM_WORLD.left,
    y: y - ROOK_MUSEUM_SOURCE.floorY + ROOK_MUSEUM_WORLD.floorY,
  };
}

const worldX = (x) => rookMuseumWorldPoint(x).x;
const overlayX = (id) => worldX(ROOK_MUSEUM_SOURCE.overlays[id].x);

export const ROOK_MUSEUM_GREETING = Object.freeze([
  {
    text: 'Welcome, young one, to the ancient and venerable Museum of the Rook. I am Greeterbot Sentry G-42, humble docent of this establishment. How may I be of service?',
    response: 'A magic rock told me to talk to you.',
  },
  {
    text: 'Then it is time: time for you to learn of the Rook! Time for you to take up the fight against those dreadful beasts, the fight for imagination - nay, for Ur itself!',
    response: 'Me?',
  },
  {
    text: 'Yes, for if not you, then who else?',
    response: 'Lead the way.',
  },
]);

export const ROOK_MUSEUM_TOUR_INTRO = Object.freeze([
  {
    text: 'Let me ask you this: do you believe yourself ready to fight the Rook?',
    response: "I'm not so sure.",
  },
  {
    text: 'You do well to be wary, for to fight against the Rook is no trifling matter! Many believe the Rook to originate from outside the minds of the Giants. It is an invading force, a parasite of imagination, fearsome and terrible.',
    response: 'But it can be stopped?',
  },
  {
    text: 'No one knows how to stop the Rook for good, but it can be repelled for a time. The ancients discovered methods for this. The relics and chronicles of their battles against the Rook are displayed here.',
    response: 'Can they teach me how to fight the Rook?',
  },
  {
    text: 'Perhaps they can. Study the exhibits, learn all you can about the weapons of your ancestors, and then speak with me when you are done. We may make a mighty guardian of you yet.',
    response: "OK, I'll do that.",
  },
]);

export const ROOK_MUSEUM_COMPLETION = Object.freeze([
  {
    text: 'You have seen all there is to see here. Do you now feel prepared to do battle with the Rook?',
    response: "I'm not sure.",
  },
  {
    text: 'I understand your trepidation, but you must simply remember this…',
    response: 'Yes?',
  },
  {
    text: 'The Rook, while incredibly powerful, is vulnerable to the attacks of Martial Imagination. Before you can harm the Rook, you must use a Focusing Orb to stun it.',
    response: 'Focusing Orb. Stun. Got it.',
  },
  {
    text: 'Once the Rook has been stunned, the Pious Glitch can prime a shrine, turning the donations of others into powerful attacks.',
    response: 'Prime. Donations. Attack. OK.',
  },
  {
    text: 'I believe you are now ready. Go, rally the forces of imagination in defence of Ur! And may the Giants be with you.',
    response: 'For imagination!',
  },
]);

const ORB_LESSON = Object.freeze([
  'Heed my words, young Glitch. YES, YOU! The Rook, in its full wrath and vigour, cannot be harmed by even the most powerful of attacks. It must first be stunned.',
  'Only with a Focusing Orb and the power of Martial Imagination can you stun the Rook. But you cannot do it alone: others must join in the fight.',
  'As other Glitches turn their wills towards the Focusing Orb, your attack will grow in size and power.',
  'The Rook is exceptionally strong, and several powerful attacks may be required to stun it.',
  'But beware, for as the Orb reaches its most powerful, it also grows fragile. If too many minds join in the attack…',
  'The Orb will be destroyed, and the attack for naught. To walk this fine line between success and failure is your sacred duty as a defender of imagination.',
]);

export const ROOK_MUSEUM_EXHIBITS = Object.freeze([
  Object.freeze({
    id: 'button_1',
    number: 1,
    kind: 'painting',
    title: 'The Rook, Enemy of Imagination',
    shortTitle: 'The Rook',
    x: overlayX('button_1'),
    painting: 1,
    pages: Object.freeze([
      'Back in the early ages of Ur, when small islands formed spontaneously from the primordial chaos, only to be rendered unrecognizable moments later by the constant ebb and flow of imagination, the ancient Glitchian tribes suffered under constant threats to their very survival.',
      'There was the instability of the environment, the paucity of piggies - not to mention going to sleep every night without knowing what shapes or substances their meagre huts might be when they awoke.',
      'But by far the most dangerous and terrifying of these was the Rook.',
      'THE ROOK, enemy of imagination, visited its wrath upon whatever the Giants’ minds created.',
      'It was the very manifestation of fear, doubt and uncertainty.',
      'It pecked and clawed relentlessly at the periphery of the Giants’ domain, black winter to the Giants’ spring of creativity.',
      'It was, if I can say so myself, most awful.',
    ]),
  }),
  Object.freeze({
    id: 'button_2',
    number: 2,
    kind: 'painting',
    title: 'The Birth of Martial Imagination',
    shortTitle: 'Martial Imagination',
    x: overlayX('button_2'),
    painting: 2,
    pages: Object.freeze([
      'Noticing the capability of a particularly strong, focused and concentrated burst of imagination to temporarily stun the Rook, ascetics and yogis of the Meadow Tribes set to work to develop a more reliable method of harnessing this defensive action.',
      'Employing the recent technological breakthrough of spun-crystal Focusing Orbs, they learned to draw the small imaginations of individual Glitches together and blast the Rook into stillness, at least temporarily.',
      'They gave this discipline the name of “Martial Imagination,” and the image preserved in this display shows an elder Glitch in early times leading imaginators to defend against a stream of Rook attacks.',
    ]),
  }),
  Object.freeze({
    id: 'button_3',
    number: 3,
    kind: 'orb',
    title: 'Ancient Focusing Orb',
    shortTitle: 'Focusing Orb',
    // You face right at -16 (move_avatar): the orb stands to your right.
    x: worldX(ROOK_MUSEUM_SOURCE.avatar.button_3.x + 100),
    pages: Object.freeze([
      'While the lustre of this ancient Focusing Orb has faded with the passing of generations, in ages long past, its flawless surface of spun crystal acted as a nexus for the imaginations of our Glitchian ancestors, and as a potent weapon against the Rook.',
      ...ORB_LESSON,
    ]),
  }),
  Object.freeze({
    id: 'button_4',
    number: 4,
    kind: 'painting',
    title: 'Esquibeth of Inari',
    shortTitle: 'The Pious Esquibeth',
    x: overlayX('button_4'),
    painting: 3,
    pages: Object.freeze([
      'Generations struggled to find a way to fight back against the Rook and end its destruction of creativity.',
      'No progress was made until the extraordinarily Pious Esquibeth of Inari discovered that her will alone could turn a normal shrine into a weapon, harnessing the direct conduit to the minds of the Giants to return fire instead of favor.',
    ]),
  }),
  Object.freeze({
    id: 'button_5',
    number: 5,
    kind: 'shrine',
    title: 'Primitive Shrine Holofilm',
    shortTitle: 'Shrine Holofilm',
    // You face left at 1217 (move_avatar): the shrine is on your left. The
    // holofilm art keeps its left half for the projection, so the stone shrine
    // (its right half) stands about 110 px left of you.
    x: worldX(ROOK_MUSEUM_SOURCE.avatar.button_5.x - 210),
    pages: Object.freeze([
      'The holofilm which follows demonstrates a pious primitive priming the shrine for an attack.',
      'Discovered half-buried in a rock face at Ekorran Roughs, it would be easy to overlook the coarse stonework of this ancient shrine as simply another natural feature.',
      'But while the crafts of ancient Glitchian tribespeople may have been rudimentary, they still excelled in their piety and devotion to the Giants.',
      'This shrine would have played an integral role in the everyday ceremonies of village life.',
    ]),
  }),
  Object.freeze({
    id: 'button_6',
    number: 6,
    kind: 'painting',
    title: 'Secret Rook Battle Plans',
    shortTitle: 'Rook Battle Plans',
    x: overlayX('button_6'),
    painting: 4,
    pages: Object.freeze([
      'As ancient legends tell it, these battle plans were recovered from an abandoned nest after a series of courageous attacks repulsed the Rook entirely from the Isle of Uralia.',
      'Though their true provenance has never been proven to the satisfaction of all skeptics, most now believe them to be a genuine artifact - indeed, the only such artifact ever to fall into Glitchian hands.',
      'And the only example of Rookish script ever seen.',
    ]),
  }),
]);

/** The framed paintings: the deco frame alone (js/rook-art.js) over the window its picture fills. */
export const ROOK_MUSEUM_PAINTING_ART = Object.freeze({
  1: ROOK_ART.rook_hall_painting_01_deco,
  2: ROOK_ART.rook_hall_painting_02_deco,
  3: ROOK_ART.rook_hall_painting_03_deco,
  4: ROOK_ART.rook_hall_painting_04_deco,
});

/** The squawk stand under the shrine exhibit's speaker (js/rook-art.js). */
export const ROOK_MUSEUM_STAND_ART = ROOK_ART.rook_hall_placeholder_squawk_stand;

/** Where a painting hangs: its overlay's centre-bottom (rook_hall_speaker.js play()), world px. */
export function rookMuseumOverlayPoint(exhibitId) {
  const at = ROOK_MUSEUM_SOURCE.overlays[exhibitId];
  return at ? rookMuseumWorldPoint(at.x, at.y) : null;
}

/**
 * The paintings' overlay (glitch-overlays rook_hall_painting_0N.fla, symbol
 * "All", 24 fps, 130 frames, the same timeline in all four): the three frames
 * cross-fade in the frame's window, c to a over frames 0-9, a to b over 39-49,
 * b to c over 79-89, then c holds to the loop. Layers bottom to top: c (79 on),
 * b (39-89), a (0-49), c again (0-9). A tween runs from its keyframe to the
 * next one (alpha 1 to 0 over 9 or 10 frames).
 */
export const ROOK_MUSEUM_PAINTING_LOOP = Object.freeze({
  fps: 24,
  frames: 130,
  layers: Object.freeze([
    Object.freeze({ frame: 'c', from: 79, to: 130, fadeFrom: 130 }),
    Object.freeze({ frame: 'b', from: 39, to: 90, fadeFrom: 79 }),
    Object.freeze({ frame: 'a', from: 0, to: 50, fadeFrom: 39 }),
    Object.freeze({ frame: 'c', from: 0, to: 10, fadeFrom: 0 }),
  ]),
});

/** Each loop layer's alpha at an elapsed time (ms), bottom to top. */
export function rookMuseumPaintingAlphas(elapsedMs = 0) {
  const { fps, frames, layers } = ROOK_MUSEUM_PAINTING_LOOP;
  const f = ((Math.floor((Math.max(0, Number(elapsedMs) || 0) * fps) / 1000) % frames) + frames) % frames;
  return layers.map((layer) => {
    if (f < layer.from || f >= layer.to) return 0;
    if (f < layer.fadeFrom) return 1;
    const span = layer.to - 1 - layer.fadeFrom;
    return span > 0 ? Math.max(0, 1 - (f - layer.fadeFrom) / span) : 1;
  });
}

/**
 * The hall around the exhibits, world px (floor y 500; bottom-centre unless
 * noted). Source points come through rookMuseumWorldPoint; the rest is ours,
 * measured off the recordings (53YLN1SHLU4 frames, about 2 world px per frame
 * px across and 2.45 down; the paintings' left edges land within 20 px of
 * the source overlays, which checks the scale): the arrival door under a
 * "Mezzanine" plaque at the left end, an "Exhibits" arrow sign over a long
 * bench (the bench deco stretched to 260 px, as the recordings show it), a
 * pointed window over the bench, between paintings 1 and 2, behind the orb,
 * on both sides of the shrine and over Greeterbot's last spot, a spotlight
 * over the orb and the shrine, each painting's speaker hung right of its
 * frame (bottom 76 px over the floor), the orb's on its pedestal, the
 * shrine's on a squawk stand. Wall, windows, door, plaque and shadows are
 * the Jethimadh Tower's own decos, as the Mezzanine and the Hall
 * of Rejected Concepts use them.
 */
export const ROOK_MUSEUM_HALL = Object.freeze({
  spawn: Object.freeze(rookMuseumWorldPoint(ROOK_MUSEUM_SOURCE.entry.x)),
  greeterStart: Object.freeze(rookMuseumWorldPoint(ROOK_MUSEUM_SOURCE.greeterStart.x, ROOK_MUSEUM_SOURCE.greeterStart.y)),
  greeterEnd: Object.freeze(rookMuseumWorldPoint(ROOK_MUSEUM_SOURCE.greeterEnd.x, ROOK_MUSEUM_SOURCE.greeterEnd.y)),
  // npc_quest_widget variant widgetWood (rook_hall.js onEnterLocation): the Mezzanine Greeterbot's art.
  greeterArt: 'assets/sprites/quests/rook-museum/greeterbot_widgetWood_idle@2x.png',
  door: Object.freeze({ x: 170, w: 196, h: 214 }),
  plaque: Object.freeze({ x: 170, text: 'Mezzanine' }),
  arrow: Object.freeze({ x: 620, y: 390, w: 140, h: 93, text: 'Exhibits' }),
  bench: Object.freeze({ x: 826, w: 260, h: 62 }),
  windows: Object.freeze([826, 1774, 2684, 3478, 3897, 4824]),
  windowSize: Object.freeze({ w: 72, h: 200, bottom: 334 }),
  spotlights: Object.freeze(['button_3', 'button_5']),
  paintingSpeaker: Object.freeze({ dx: 258, bottom: 424 }),
  orbSpeaker: Object.freeze({ dx: 0, bottom: 482 }),
  shrineStand: Object.freeze({ x: worldX(ROOK_MUSEUM_SOURCE.avatar.button_5.x + 40) }),
  // Multiply tint on jethimadh_int_bg_center, as the Hall of Rejected Concepts (js/hall-rejected-concepts.js HALL.wallTint).
  wallTint: 0xdff2e9,
});

export function createRookMuseumState(opts = {}) {
  return {
    status: 'arrival',
    visited: [],
    activeExhibitId: null,
    sourceLocation: opts.sourceLocation ? { ...opts.sourceLocation } : null,
    enteredAt: Number(opts.enteredAt) || Date.now(),
    completedAt: 0,
  };
}

export function beginRookMuseumTour(state) {
  if (!state || state.status !== 'arrival') {
    return { ok: false, reason: state ? 'already_started' : 'missing_state' };
  }
  state.status = 'touring';
  return { ok: true, status: state.status };
}

export function getRookMuseumExhibit(exhibitId) {
  return ROOK_MUSEUM_EXHIBITS.find((exhibit) => exhibit.id === exhibitId) || null;
}

export function visitRookMuseumExhibit(state, exhibitId) {
  const exhibit = getRookMuseumExhibit(exhibitId);
  if (!state) return { ok: false, reason: 'missing_state', exhibit: null };
  if (!exhibit) return { ok: false, reason: 'unknown_exhibit', exhibit: null };
  if (!['touring', 'ready'].includes(state.status)) {
    return { ok: false, reason: 'tour_not_started', exhibit };
  }
  const firstVisit = !state.visited.includes(exhibit.id);
  if (firstVisit) state.visited.push(exhibit.id);
  state.visited = ROOK_MUSEUM_EXHIBITS
    .map((entry) => entry.id)
    .filter((id) => state.visited.includes(id));
  state.activeExhibitId = exhibit.id;
  if (state.visited.length === ROOK_MUSEUM_EXHIBIT_COUNT) state.status = 'ready';
  return {
    ok: true,
    firstVisit,
    exhibit,
    visited: state.visited.length,
    complete: state.status === 'ready',
  };
}

export function rookMuseumObjective(state) {
  if (!state) return 'Enter the Museum of the Rook';
  if (state.status === 'arrival') return 'Speak with Greeterbot Sentry G-42';
  if (state.status === 'ready') return 'Return to Greeterbot Sentry G-42';
  if (state.status === 'complete') return 'Rook training complete';
  const remaining = ROOK_MUSEUM_EXHIBIT_COUNT - state.visited.length;
  return `Study ${remaining} remaining exhibit${remaining === 1 ? '' : 's'}`;
}

export function completeRookMuseum(state, now = Date.now()) {
  if (!state) return { ok: false, reason: 'missing_state', reward: null };
  if (state.status === 'complete') {
    return { ok: false, reason: 'already_complete', reward: null };
  }
  if (state.visited.length !== ROOK_MUSEUM_EXHIBIT_COUNT || state.status !== 'ready') {
    return { ok: false, reason: 'exhibits_remaining', reward: null };
  }
  state.status = 'complete';
  state.completedAt = Number(now) || Date.now();
  state.activeExhibitId = null;
  return { ok: true, reward: { ...ROOK_MUSEUM_REWARD } };
}
