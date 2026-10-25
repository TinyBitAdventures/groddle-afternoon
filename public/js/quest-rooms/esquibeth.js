/**
 * The Last Pilgrimage of Esquibeth (quests/last_pilgrimage_of_esquibeth.js
 * and last_pilgrimage_of_esquibeth_reminisce.js): a four-location story walk
 * through the waterfall instances.
 *
 * Source:
 *  - The Grendaline shrine offers it 30 minutes after Giant devotion
 *    (items/npc_shrine_*.js onPlayerCollision; the remake's Magic Rock
 *    delivers it, catalog OFFER_OVERRIDES). onStarted puts you at the
 *    marker_teleport of waterfall_01 (prod LIFQUHITQ583FKK "Eastern Grotto");
 *    the run continues through waterfall_02 (LIFR2OEUQ5832LQ "Western
 *    Grotto"), waterfall_03 (LIFR7REVQ583H6Q "Waterfall Climb") and
 *    waterfall_04_wider (LIFVOTC3H593H7H "Waterfall Hollow"). The 5 * 60
 *    passed to questInstanceLocation is the instance's exit delay, not a play
 *    clock: this room has no timer (player.js even holds the new day while you
 *    are inside a waterfall instance).
 *  - Part 1 has one requirement, the `got_conch` flag ("Find the Conch"), no
 *    rewards and no completion text. onComplete_custom sets end_esquibeth and
 *    locations/location.js then says, 5 s after the next arrival: "Contemplate
 *    well the Last Pilgrimage of Esquibeth. Your knowledge of this hero and her
 *    deeds enables you to participate in Feats."
 *  - The reminisce needs `esquibeth_exit_revealed` ("Go on the Journey") and
 *    `leave` ("Return from the Journey"), pays 500 iMG and 100 Grendaline
 *    favor, and says "What a long, strange trip it's been." It is offered by
 *    the Conch's Reminisce verb (items/conch.js available_quests), only 4 hours
 *    (a game day) after part 1 and after the last repeat or fail (canOffer).
 *  - Leaving any waterfall location for somewhere else fails a quest that is
 *    not complete (onExitLocation).
 *  - items/esquibeth_note_1..5 (the five notes, keys_in_location n),
 *    items/esquibeth_button.js ("Playback Button", a resetting wall_switch),
 *    items/npc_esquibeth_playback.js (Esquibeth's ghost: appear, idle,
 *    note1..note5, disappear), items/conch_decoy.js (the "Conch" on the
 *    pedestal, verb "pick up", tooltip "Pickup") and items/conch.js (music
 *    45000 ms; Blow pays 1000 iMG and 150 Grendaline favor once, after the
 *    quest; Play pays the musicblock freshness XP).
 *  - Sounds (inc_data_sounds.js): the five bells BW_A1/C2/D2/E2/G2,
 *    AMBIENT_WATERFALL(_LEVEL3), WATERFALL_SYMBOL_GLOW, WATERFALL_SUCCESS,
 *    ROCKS_DISAPPEAR and CONCH. The ghost's song is not a sound key: each
 *    playback overlay (glitch-overlays/npc_esquibeth_playbackA/AB/ABC.fla)
 *    streams its own take from frame 84, LIBRARY/Puzzle_Melody_Section_A,
 *    _A_and_B and _A_and_B_and_C_2.1.mp3 (installed as ESQUIBETH_PLAYBACK_*).
 *    Both recordings carry those takes at the ghost's playbacks (chroma match
 *    0.88-0.95). music_map WATERFALL_MELODY (Bells_Waterfall_1.3, 2012-08-29)
 *    is an earlier take of the same seven notes (E G D E C A D); it never
 *    stands out in either recording, so the room does not play it.
 *
 * Lost: all four location geometries and their location events (the
 * narration, the note pickups, the song check, the exits). Rebuilt from the
 * two recordings (BgRgIaeaj9Q part 1, fvin5awPESI the reminisce):
 *  - Narration and log lines are read off the recordings, in order.
 *  - Each grotto hides 3, 4 and then 5 notes ("Found 1 of 3 Notes" ...). With
 *    all found ("You found all the notes. Now, play the song.") Esquibeth's
 *    ghost plays the song at a carved Giant glyph; you play it back on the
 *    notes set into the stone. The glyph glows, rocks crumble from a passage
 *    and the narration moves you on. The song was recovered from the
 *    recordings' audio by matching the five bells: phrase A = E G D, the
 *    second grotto adds B = E C, the climb adds C = A D (the overlays are
 *    npc_esquibeth_playbackA, AB and ABC). Beat offsets are the ghost's own.
 *  - Waterfall Hollow is the Esquibeth_End_Overlay library art
 *    (Waterfall_04_Wider.png, Tiny Speck CC0): a faceless copy until
 *    Grendaline fades in through the light. The ghost dances for 12.8 s (384
 *    frames at 30 fps), rocks crumble from the pedestal: the Conch (part 1) or
 *    an iMG quoin (the reminisce, as recorded), then out through the light.
 *  - The grotto and climb terrain is clean vector basalt in the recordings'
 *    lavender, with recovered Alakol cliff decos tinted for the far walls.
 */

import { isLoaded, onLoaded, textureFromUrl } from '../textures.js';
import { grantMoodXp } from '../mood-xp.js';
import { loseEnergy, metabolicGain, moodMax } from '../metabolics.js';

export const ROOM_ID = 'esquibeth';
export const MAIN = 'last_pilgrimage_of_esquibeth';
export const REMINISCE = 'last_pilgrimage_of_esquibeth_reminisce';
const ART = 'assets/sprites/quest-rooms/esquibeth/';
const SFX = 'assets/audio/sfx/';

/** quests/*.js locations, in pilgrimage order. */
export const STAGES = Object.freeze(['waterfall_01', 'waterfall_02', 'waterfall_03', 'waterfall_04_wider']);
/** inc_data_maps_prod.js labels of the prod templates. */
export const STAGE_LABELS = Object.freeze({
  waterfall_01: 'Eastern Grotto',
  waterfall_02: 'Western Grotto',
  waterfall_03: 'Waterfall Climb',
  waterfall_04_wider: 'Waterfall Hollow',
});
export const STAGE_TSIDS = Object.freeze({
  waterfall_01: 'LIFQUHITQ583FKK',
  waterfall_02: 'LIFR2OEUQ5832LQ',
  waterfall_03: 'LIFR7REVQ583H6Q',
  waterfall_04_wider: 'LIFVOTC3H593H7H',
});
/** Notes hidden in each location (the recordings' "Found k of N Notes"). */
export const NOTE_COUNTS = Object.freeze({ waterfall_01: 3, waterfall_02: 4, waterfall_03: 5 });
/** esquibeth_note_1..5 -> its bell (recovered BW_* sounds, by the song match). */
export const BELLS = Object.freeze({ 1: 'BW_D2', 2: 'BW_E2', 3: 'BW_G2', 4: 'BW_C2', 5: 'BW_A1' });
/** The song, phrase by phrase (A = E G D, B = E C, C = A D), as note numbers. */
export const PHRASES = Object.freeze({ A: [2, 3, 1], B: [2, 4], C: [5, 1] });
export const SONGS = Object.freeze({
  waterfall_01: [...PHRASES.A],
  waterfall_02: [...PHRASES.A, ...PHRASES.B],
  waterfall_03: [...PHRASES.A, ...PHRASES.B, ...PHRASES.C],
});
/** Esquibeth's beat offsets (ms) for the seven notes, from the ABC playback. */
export const SONG_BEATS_MS = Object.freeze([0, 1800, 2400, 4050, 4700, 6400, 7550]);
/** npc_esquibeth_playbackA/AB/ABC: the overlay's own melody take per grotto. */
export const PLAYBACK_SOUNDS = Object.freeze({
  waterfall_01: 'ESQUIBETH_PLAYBACK_A',
  waterfall_02: 'ESQUIBETH_PLAYBACK_AB',
  waterfall_03: 'ESQUIBETH_PLAYBACK_ABC',
});
/** The takes' first bell sounds 50 ms into the file. */
export const PLAYBACK_LEAD_MS = 50;
/** Esquibeth_End_Overlay: her last dance, 384 frames at 30 fps. */
export const DANCE_MS = 12_800;
/** location.js: the end vog waits 5 s after the next arrival. */
export const END_VOG_DELAY_MS = 5000;
/** items/conch.js. */
export const CONCH = Object.freeze({
  musicMs: 45_000,
  blowXp: 1000,
  blowFavor: 150,
  monthMs: 30.5 * 24 * 60 * 60 * 1000,
  replayMs: 14_400 * 1000,
});
/** canOffer: part 1 and every repeat (or fail) wait 4 hours. */
export const REMINISCE_WAIT_HOURS = 4;

export const LINES = Object.freeze({
  soundBanner: 'Sound required! Turn up your speakers and in-game volume sliders.',
  soundLog: 'Sound required. Turn up speakers and game sound.',
  intro: [
    'It was a time of great uncertainty.\nThe Giants, confused and weary,\nwere drifting apart.',
    'Their shared imagination\n– this very world –\nwas under threat.',
    'It was then that Esquibeth of Inari embarked\nupon her last pilgrimage …',
  ],
  found: (k, n) => `Found ${k} of ${n} Notes`,
  allFound: 'You found all the notes. Now, play the song.',
  after: {
    waterfall_01: 'Esquibeth’s entry into the mind of\nGrendaline was our final hope …',
    waterfall_02: 'Her song rang out, and by this song\nGrendaline called to the other Giants …',
    waterfall_03: '',
  },
  hollow: '… and so it was that Esquibeth’s pilgrimage\nbrought Grendaline back to the fold and\npreserved the Elevenness of Everything.',
  memento: 'Take this artifact as a memento\nso you may better remember the\nLast Pilgrimage of Esquibeth.',
  endVog: 'Contemplate well the Last Pilgrimage of Esquibeth. Your knowledge of this hero and her deeds enables you to participate in Feats.',
});

/* ------------------------------------------------------------------ */
/* Pure rules                                                           */
/* ------------------------------------------------------------------ */

/** One note played back against the song: { ok, done, entered }. A wrong note starts over. */
export function songStep(song, entered, note) {
  const list = Array.isArray(entered) ? entered : [];
  if (song[list.length] === note) {
    const next = [...list, note];
    return { ok: true, done: next.length === song.length, entered: next };
  }
  return { ok: false, done: false, entered: [] };
}

export function nextStage(stage) {
  const i = STAGES.indexOf(stage);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

/**
 * items/conch.js play: 50 iMG the first time, 100 after a month, 10 once a
 * game day after 4 hours, otherwise nothing ("stale"). Always +2 mood, -2 energy.
 */
export function conchPlayReward(lastHeard, now, sameGameDay = false) {
  if (!lastHeard) return { xp: 50, msg: 'It reminds you of Esquibeth! Neato!' };
  if (lastHeard < now - CONCH.monthMs) return { xp: 100, msg: 'Mmmnn. This tune brings back memories.' };
  if (lastHeard < now - CONCH.replayMs) {
    return sameGameDay ? { xp: 0, msg: '' } : { xp: 10, msg: 'Ah, haven\'t heard that yet today!' };
  }
  return { xp: 0, msg: 'Good stuff, but play it too much and it gets stale, you know?' };
}

/* ------------------------------------------------------------------ */
/* Layouts (world px, y down; a block's top is its walking line)        */
/* ------------------------------------------------------------------ */

/** Basalt blocks [x1, x2, top] from the left edge to the right. */
const blocks = (rows) => rows.map(([x1, x2, top]) => ({ x1, x2, top }));

export function stageLayout(stage) {
  if (stage === 'waterfall_01') {
    return {
      stage,
      width: 3200,
      height: 1120,
      sky: 'dusk',
      blocks: blocks([
        [0, 560, 1000], [560, 700, 930], [700, 1280, 1000], [1280, 1500, 930], [1500, 1760, 860],
        [1760, 2020, 790], [2020, 2280, 720], [2280, 2560, 640], [2560, 2680, 560], [2680, 3200, 640],
      ]),
      ledges: [],
      caves: [{ x1: 0, x2: 1420, ceiling: 680 }],
      notes: [{ n: 1, x: 930, y: 1000 }, { n: 3, x: 2620, y: 560 }, { n: 2, x: 630, y: 930 }],
      glyph: { x: 330, y: 1000, symbol: 'grendaline' },
      button: { x: 470, y: 1000 },
      exit: { x: 110, y: 1000 },
      spawn: { x: 2980, y: 640 },
      quoins: [{ x: 1630, y: 860 - 70, type: 'xp' }, { x: 3120, y: 640 - 70, type: 'mood' }],
      intro: true,
    };
  }
  if (stage === 'waterfall_02') {
    return {
      stage,
      width: 3200,
      height: 1120,
      sky: 'gold',
      blocks: blocks([
        [0, 900, 1000], [900, 1080, 930], [1080, 1260, 850], [1260, 1440, 770], [1440, 1900, 700],
        [1900, 2080, 780], [2080, 2300, 860], [2300, 2440, 930], [2440, 3200, 1000],
      ]),
      ledges: [{ x1: 2540, x2: 2720, y: 910 }, { x1: 2780, x2: 2940, y: 820 }],
      caves: [{ x1: 0, x2: 1000, ceiling: 680 }, { x1: 2380, x2: 3200, ceiling: 660 }],
      light: { x: 1660, w: 520 },
      notes: [{ n: 4, x: 3040, y: 1000 }, { n: 1, x: 2860, y: 820 }, { n: 3, x: 1700, y: 700 }, { n: 2, x: 990, y: 930 }],
      glyph: { x: 430, y: 1000, symbol: 'eye' },
      button: { x: 575, y: 1000 },
      exit: { x: 110, y: 1000 },
      spawn: { x: 3100, y: 1000 },
      quoins: [{ x: 2630, y: 910 - 70, type: 'xp' }, { x: 1520, y: 700 - 70, type: 'currants' }],
    };
  }
  if (stage === 'waterfall_03') {
    // Zigzag stepping stones, 180 wide, 40 apart and 82 up: one ordinary jump each.
    const xs = [380, 600, 820, 1040, 1260, 1040, 820, 600, 380, 160, 380, 600, 820, 1040, 1260, 1040, 820, 600, 380, 600, 820];
    const steps = xs.map((x1, k) => ({ x1, x2: x1 + 180, y: 2420 - k * 82 }));
    const mid = (k) => ({ x: steps[k].x1 + 90, y: steps[k].y });
    return {
      stage,
      width: 1800,
      height: 2620,
      sky: 'rose',
      blocks: blocks([[0, 1800, 2500]]),
      top: { x1: 1080, x2: 1800, y: 700 },
      ledges: steps,
      caves: [],
      notes: [{ n: 2, ...mid(2) }, { n: 4, ...mid(7) }, { n: 5, ...mid(9) }, { n: 3, ...mid(13) }, { n: 1, ...mid(17) }],
      glyph: { x: 1300, y: 700, symbol: 'bowl' },
      button: { x: 1440, y: 700 },
      exit: { x: 1690, y: 700 },
      spawn: { x: 200, y: 2500 },
      quoins: [{ x: mid(8).x, y: mid(8).y - 70, type: 'xp' }, { x: mid(14).x, y: mid(14).y - 70, type: 'energy' }],
      climb: true,
    };
  }
  return null;
}

/**
 * Waterfall Hollow: the overlay art's floor, traced on the 1700 x 700 picture
 * (art px), then scaled so the avatar stands as tall against the rock as in the
 * recordings (about 1.35x the overlay's preview size).
 */
export const HOLLOW_ART = Object.freeze({
  width: 1700,
  height: 700,
  floor: [[150, 540], [470, 540], [530, 452], [1100, 442], [1250, 414], [1460, 402], [1640, 402]],
  spawn: { x: 230, y: 540 },
  ghost: { x: 420, y: 540 },
  pedestal: { x: 1293, y: 346, floor: 414 },
  rubble: { x: 1290, y: 414 },
  exit: { x1: 1400, x2: 1640, y: 402 },
  light: { x: 1430, y: 260 },
  revealX: 1050,
});
export const HOLLOW_SCALE = 1.35;
const hs = (v) => Math.round(v * HOLLOW_SCALE);
const hp = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, hs(v)]));
export const HOLLOW = Object.freeze({
  scale: HOLLOW_SCALE,
  width: hs(HOLLOW_ART.width),
  height: hs(HOLLOW_ART.height) + 60,
  floor: HOLLOW_ART.floor.map(([x, y]) => [hs(x), hs(y)]),
  spawn: hp(HOLLOW_ART.spawn),
  ghost: hp(HOLLOW_ART.ghost),
  pedestal: hp(HOLLOW_ART.pedestal),
  rubble: hp(HOLLOW_ART.rubble),
  exit: hp(HOLLOW_ART.exit),
  light: hp(HOLLOW_ART.light),
  revealX: hs(HOLLOW_ART.revealX),
});

/** The platform lines of a layout. */
export function stagePlatforms(kit, stage) {
  if (stage === 'waterfall_04_wider') {
    const out = [];
    const f = HOLLOW.floor;
    for (let i = 0; i < f.length - 1; i++) out.push(kit.plat(f[i][0], f[i][1], f[i + 1][0], f[i + 1][1], 'invisible', { id: `hollow_${i}` }));
    return out;
  }
  const L = stageLayout(stage);
  const out = L.blocks.map((b, i) => kit.plat(b.x1, b.top, b.x2, b.top, 'invisible', { id: `${stage}_b${i}` }));
  L.ledges.forEach((l, i) => out.push(kit.plat(l.x1, l.y, l.x2, l.y, 'invisible', { id: `${stage}_l${i}` })));
  if (L.top) out.push(kit.plat(L.top.x1, L.top.y, L.top.x2, L.top.y, 'invisible', { id: `${stage}_top` }));
  return out;
}

/** Step faces between neighbouring blocks: walls under the higher top (walking down passes). */
export function stageBarriers(stage) {
  const L = stageLayout(stage);
  if (!L) return [];
  const out = [];
  for (let i = 0; i < L.blocks.length - 1; i++) {
    const a = L.blocks[i];
    const b = L.blocks[i + 1];
    if (a.top === b.top) continue;
    const top = Math.min(a.top, b.top);
    out.push({ id: `${stage}_step${i}`, x: a.x2, y: top, h: Math.abs(a.top - b.top), pc_perm: null });
  }
  return out;
}

/** Glyph socket offsets (note -> dx, dy from the glyph's centre). */
export function socketOffsets(count) {
  if (count === 3) return { 2: [-62, 6], 3: [0, -64], 1: [62, 6] };
  if (count === 4) return { 2: [-62, -4], 3: [0, -64], 1: [62, -4], 4: [0, 56] };
  return { 2: [-66, -10], 3: [-26, -64], 1: [66, -10], 4: [26, -64], 5: [0, 56] };
}
/** The glyph's centre sits this far above the floor (sockets stay within the visible band). */
export const GLYPH_CENTRE_UP = 88;
export const STAFF_RADIUS = 96;

/* ------------------------------------------------------------------ */
/* Drawing                                                              */
/* ------------------------------------------------------------------ */

const PAL = {
  lit: { cap: 0xc9b9d4, capEdge: 0xe7dcef, face: 0x8d7aa0, seam: 0x5f4f73, deep: 0x4a3c5c },
  cave: { cap: 0x8a7898, capEdge: 0xa898b6, face: 0x54456a, seam: 0x3a2e4c, deep: 0x2c2238 },
  climb: { cap: 0x6d5a72, capEdge: 0x8e7a92, face: 0x463648, seam: 0x2e2232, deep: 0x231a27 },
};

function inCave(L, x) {
  return (L.caves || []).some((c) => x >= c.x1 && x <= c.x2);
}

/** A block of columnar basalt: hex caps along the top, columns down the face. */
function drawBasalt(g, x1, x2, top, bottom, pal, seedKey, kit) {
  const h = bottom - top;
  g.rect(x1, top, x2 - x1, h).fill(pal.face);
  // Columns: strips of slightly different tone with dark seams.
  let x = x1;
  let i = 0;
  const lips = [];
  while (x < x2 - 2) {
    const w = 18 + Math.floor(kit.hash01(`${seedKey}:${i}`) * 24);
    const right = Math.min(x2, x + w);
    const r = kit.hash01(`${seedKey}:s${i}`);
    const tone = r > 0.66 ? pal.capEdge : r > 0.33 ? pal.seam : pal.face;
    g.rect(x, top, right - x, h).fill({ color: tone, alpha: r > 0.66 ? 0.16 : r > 0.33 ? 0.28 : 0 });
    // A sliver of light down one side of each column.
    g.rect(x + 2, top + 10, 3, h).fill({ color: pal.capEdge, alpha: 0.12 });
    g.moveTo(right, top + 8);
    g.lineTo(right, bottom);
    g.stroke({ width: 1.5, color: pal.seam, alpha: 0.85 });
    for (let j = 1; j < 8; j++) {
      const jy = top + 30 + j * (50 + kit.hash01(`${seedKey}:j${i}:${j}`) * 80);
      if (jy > bottom - 10) break;
      g.moveTo(x + 2, jy);
      g.lineTo(right - 2, jy + (kit.hash01(`${seedKey}:k${i}:${j}`) - 0.5) * 7);
      g.stroke({ width: 1.2, color: pal.seam, alpha: 0.6 });
    }
    lips.push([x, right, 8 + Math.round(kit.hash01(`${seedKey}:l${i}`) * 9)]);
    x = right;
    i += 1;
  }
  // The flat top: a lighter band with a ragged front lip and a few hex cracks.
  g.moveTo(x1, top - 3);
  g.lineTo(x2, top - 3);
  for (let k = lips.length - 1; k >= 0; k--) {
    const [lx, rx, d] = lips[k];
    g.lineTo(rx, top + d);
    g.lineTo(lx + 3, top + d + 2);
  }
  g.lineTo(x1, top + 8);
  g.closePath();
  g.fill(pal.cap);
  g.moveTo(x1, top - 2);
  g.lineTo(x2, top - 2);
  g.stroke({ width: 2, color: pal.capEdge, alpha: 0.95 });
  for (const [lx, rx] of lips) {
    if (kit.hash01(`${seedKey}:c${lx}`) < 0.5) continue;
    g.moveTo(rx, top - 1);
    g.lineTo(rx - 4, top + 5);
  }
  g.stroke({ width: 1, color: pal.seam, alpha: 0.45 });
  // Depth: darker towards the bottom.
  for (let k = 0; k < 4; k++) {
    const y = top + h * (0.25 + k * 0.18);
    g.rect(x1, y, x2 - x1, bottom - y).fill({ color: pal.deep, alpha: 0.16 });
  }
}

/** A floating slab of column tops (the climb's stepping stones). */
function drawSlab(g, l, pal, kit) {
  const depth = 46;
  drawBasalt(g, l.x1, l.x2, l.y, l.y + depth, pal, `slab${l.x1}:${l.y}`, kit);
  // Broken column stubs hang under the slab.
  const n = Math.max(2, Math.round((l.x2 - l.x1) / 30));
  for (let i = 0; i < n; i++) {
    const w = (l.x2 - l.x1) / n;
    const x = l.x1 + i * w;
    const len = 10 + kit.hash01(`drip${l.x1}:${i}`) * 30;
    g.rect(x + 2, l.y + depth - 2, w - 4, len).fill(i % 2 ? pal.face : pal.seam);
    g.rect(x + 2, l.y + depth + len - 6, w - 4, 6).fill({ color: pal.deep, alpha: 0.6 });
  }
}

/** A cave's ceiling: an overhang of rock with a jagged underside. */
function drawCeiling(g, c, pal, kit, worldTop = 0) {
  g.moveTo(c.x1, worldTop);
  g.lineTo(c.x2, worldTop);
  let x = c.x2;
  let i = 0;
  while (x > c.x1) {
    const w = 60 + kit.hash01(`ceil${c.x1}:${i}`) * 90;
    const drop = 20 + kit.hash01(`ceilD${c.x1}:${i}`) * 70;
    g.lineTo(x, c.ceiling);
    g.lineTo(x - w / 2, c.ceiling + drop);
    x -= w;
    i += 1;
  }
  g.lineTo(c.x1, c.ceiling);
  g.closePath();
  g.fill(pal.face);
  g.rect(c.x1, worldTop, c.x2 - c.x1, c.ceiling - worldTop - 40).fill({ color: pal.deep, alpha: 0.6 });
}

/** The dark columned wall at the back of a cave. */
function drawBackWall(g, c, floor, kit) {
  g.rect(c.x1, c.ceiling - 20, c.x2 - c.x1, floor - c.ceiling + 40).fill(0x3b2f4a);
  let x = c.x1;
  let i = 0;
  while (x < c.x2) {
    const w = 34 + kit.hash01(`wall${c.x1}:${i}`) * 50;
    const a = 0.12 + kit.hash01(`wallA${c.x1}:${i}`) * 0.2;
    g.rect(x, c.ceiling, Math.max(6, w - 6), floor - c.ceiling).fill({ color: 0x8a78a0, alpha: a });
    g.moveTo(x, c.ceiling);
    g.lineTo(x, floor);
    g.stroke({ width: 2, color: 0x241b30, alpha: 0.55 });
    x += w;
    i += 1;
  }
  g.rect(c.x1, c.ceiling - 20, c.x2 - c.x1, 140).fill({ color: 0x1d1626, alpha: 0.35 });
}

/** A soft radial light (canvas texture), for openings and glows. */
function radial(PIXI, inner, outer, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const c2 = canvas.getContext('2d');
  const grad = c2.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  c2.fillStyle = grad;
  c2.fillRect(0, 0, 128, 128);
  const s = new PIXI.Sprite(PIXI.Texture.from(canvas));
  s.anchor.set(0.5);
  s.width = w;
  s.height = h;
  return s;
}

/** The Giant glyphs on the loading stones, as vectors (local, ~100 px tall). */
export function drawGlyph(g, symbol, color, width = 5, alpha = 1) {
  if (symbol === 'grendaline') {
    g.moveTo(-34, -40);
    g.quadraticCurveTo(-46, 6, -18, 34);
    g.lineTo(0, 46);
    g.lineTo(18, 34);
    g.quadraticCurveTo(46, 6, 34, -40);
    g.quadraticCurveTo(0, -24, -34, -40);
    g.moveTo(0, -30);
    g.lineTo(0, 30);
    g.moveTo(0, -4);
    g.lineTo(-20, -24);
    g.moveTo(0, -4);
    g.lineTo(20, -24);
    g.moveTo(-16, 22);
    g.lineTo(-8, 14);
    g.lineTo(0, 22);
    g.lineTo(8, 14);
    g.lineTo(16, 22);
  } else if (symbol === 'eye') {
    g.moveTo(-46, 6);
    g.quadraticCurveTo(0, -42, 46, 6);
    g.quadraticCurveTo(0, 40, -46, 6);
    g.circle(0, 6, 11);
    for (const [x1, y1, x2, y2] of [[-30, -26, -40, -42], [0, -34, 0, -52], [30, -26, 40, -42], [-24, 34, -32, 48], [24, 34, 32, 48]]) {
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
    }
  } else {
    g.moveTo(-42, 12);
    g.quadraticCurveTo(0, 62, 42, 12);
    g.moveTo(-42, 12);
    g.lineTo(42, 12);
    g.moveTo(-32, 0);
    g.quadraticCurveTo(-30, -16, -12, -14);
    g.quadraticCurveTo(0, -30, 14, -14);
    g.quadraticCurveTo(32, -16, 32, 0);
    g.moveTo(-20, -24);
    g.quadraticCurveTo(0, -48, 20, -24);
    g.circle(0, -48, 4);
  }
  g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
}

/**
 * Sky stops per stage, sampled from players' Snaps (research/wayback/raw/snaps/
 * last_pilgrimage_of_esquibeth/) and the NelLACFkrVg recording (research/video, G79):
 * Eastern Grotto peach-pink at the top (#f9bcb6), Western Grotto a bright pale lemon
 * (#fae093 to #feff99) under a pink flush with a lavender haze low down, the Climb
 * magenta-pink (#eba2e8 to #f5bfee).
 */
export const SKY_STOPS = Object.freeze({
  gold: [[0, '#f6cdb4'], [0.22, '#f0dc9e'], [0.5, '#fae093'], [0.72, '#fbf59a'], [0.88, '#f4f28c'], [1, '#d6c2c8']],
  rose: [[0, '#eba2e8'], [0.5, '#f5bfee'], [0.8, '#f6d7bf'], [1, '#f2e2c0']],
  dusk: [[0, '#f9bcb6'], [0.4, '#f6cdb4'], [0.75, '#ecd6c4'], [1, '#bba9c4']],
});

function skyStops(kind) {
  return SKY_STOPS[kind] || SKY_STOPS.dusk;
}

/** Far cliffs: recovered Alakol cliffside decos, tinted to the grottos' lavender basalt. */
const FAR_CLIFFS = ['cliffside_1a_al1', 'cliffside_1b_al1', 'cliffside_1c_al1', 'cliffside_1d_al1', 'cliff_face_skirt_01a_al1'];

function buildGrotto(ctx, stage) {
  const { PIXI, kit } = ctx;
  const L = stageLayout(stage);
  const root = kit.sceneRoot(PIXI, L.width, L.height);
  const sky = root.layer(0, 0);
  sky.addChild(kit.gradient(PIXI, skyStops(L.sky), 960, 520));
  const far = root.layer(0.25, 1);
  const mid = root.layer(0.5, 2);
  // Parallax: a layer of factor f shows world y at screen y - f * camY, so the
  // mesas sit just above the terraces whichever level the camera is on.
  const rows = L.climb ? [520, 900, 1280] : [760];
  for (const [r, bottom] of rows.entries()) {
    for (let i = 0; i < 8; i++) {
      const name = FAR_CLIFFS[(i + r) % FAR_CLIFFS.length];
      far.addChild(kit.deco(PIXI, name, -180 + i * 330 + r * 90, bottom + (i % 2) * 30, { scale: 0.5, tint: 0xc4b3d2, alpha: 0.8 }));
    }
  }
  const midRows = L.climb ? [700, 1150, 1600] : [960];
  for (const [r, bottom] of midRows.entries()) {
    for (let i = 0; i < 7; i++) {
      const name = FAR_CLIFFS[(i + 2 + r) % FAR_CLIFFS.length];
      if (L.climb && i % 2 === 0) continue;
      mid.addChild(kit.deco(PIXI, name, -120 + i * 520 + r * 140, bottom + (i % 3) * 24, { scale: 0.62, tint: 0x9a88ae, alpha: 0.92 }));
    }
  }
  if (L.climb) {
    // The climb's wall of great columns on the right.
    for (let i = 0; i < 5; i++) {
      mid.addChild(kit.deco(PIXI, i % 2 ? 'cliffside_1b_al1' : 'cliffside_1c_al1', 900 + (i % 2) * 160, 600 + i * 340, { scale: 0.9, tint: 0x5d4b66, alpha: 0.96 }));
    }
  }
  const world = root.layer(1, 3);
  const back = new PIXI.Graphics();
  world.addChild(back);
  for (const c of L.caves) drawBackWall(back, c, Math.max(...L.blocks.filter((b) => b.x1 < c.x2 && b.x2 > c.x1).map((b) => b.top)), kit);
  if (L.light) {
    const glow = radial(PIXI, 'rgba(255,248,170,0.95)', 'rgba(255,240,160,0)', L.light.w * 1.6, 900);
    glow.x = L.light.x;
    glow.y = 560;
    world.addChild(glow);
    const fall = kit.gradient(PIXI, [[0, '#fffbd0'], [1, 'rgba(255,250,200,0)']], 70, 520);
    fall.x = L.light.x - 35;
    fall.y = 180;
    fall.alpha = 0.8;
    world.addChild(fall);
  }
  if (L.climb) {
    const glowTop = radial(PIXI, 'rgba(255,246,200,1)', 'rgba(255,240,190,0)', 520, 520);
    glowTop.x = L.exit.x + 30;
    glowTop.y = L.top.y - 120;
    world.addChild(glowTop);
  }
  // The exit passage: pinkish light in the wall (hidden by rocks until the song is played).
  const exitGlow = radial(PIXI, 'rgba(255,214,206,1)', 'rgba(250,190,200,0)', 260, 300);
  exitGlow.x = L.exit.x;
  exitGlow.y = L.exit.y - 90;
  exitGlow.alpha = 0;
  world.addChild(exitGlow);
  const g = new PIXI.Graphics();
  world.addChild(g);
  for (const [i, b] of L.blocks.entries()) {
    drawBasalt(g, b.x1, b.x2, b.top, L.height, inCave(L, (b.x1 + b.x2) / 2) ? PAL.cave : L.climb ? PAL.climb : PAL.lit, `${stage}:${i}`, kit);
  }
  const slabs = new PIXI.Graphics();
  world.addChild(slabs);
  for (const l of L.ledges) drawSlab(slabs, l, L.climb ? PAL.climb : PAL.lit, kit);
  if (L.top) drawBasalt(slabs, L.top.x1, L.top.x2, L.top.y, L.top.y + 240, PAL.climb, `${stage}:top`, kit);
  const ceil = new PIXI.Graphics();
  world.addChild(ceil);
  for (const c of L.caves) drawCeiling(ceil, c, PAL.cave, kit, 0);
  if (L.climb) {
    // The overhang above the summit ledge frames the bright cave mouth.
    drawCeiling(ceil, { x1: 980, x2: 1800, ceiling: 420 }, PAL.climb, kit, 0);
  }
  // The glyph stone, carved into the wall.
  const gl = L.glyph;
  const stone = new PIXI.Graphics();
  stone.moveTo(gl.x - 92, gl.y);
  stone.lineTo(gl.x - 96, gl.y - 120);
  stone.quadraticCurveTo(gl.x, gl.y - 215, gl.x + 96, gl.y - 120);
  stone.lineTo(gl.x + 92, gl.y);
  stone.closePath().fill({ color: 0x6a5a7c, alpha: 0.95 }).stroke({ width: 3, color: 0x2c2238, alpha: 0.8 });
  world.addChild(stone);
  const carve = new PIXI.Graphics();
  carve.x = gl.x;
  carve.y = gl.y - GLYPH_CENTRE_UP;
  drawGlyph(carve, gl.symbol, 0x2a2133, 6, 0.9);
  world.addChild(carve);
  return {
    label: STAGE_LABELS[stage],
    hubName: 'The Last Pilgrimage of Esquibeth',
    width: L.width,
    height: L.height,
    background: root,
    platforms: stagePlatforms(kit, stage),
    barriers: stageBarriers(stage),
    spawn: { ...L.spawn },
    exitGlow,
  };
}

function buildHollow(ctx) {
  const { PIXI, kit } = ctx;
  const root = kit.sceneRoot(PIXI, HOLLOW.width, HOLLOW.height);
  const world = root.layer(1, 1);
  const base = new PIXI.Graphics();
  base.rect(0, 0, HOLLOW.width, HOLLOW.height).fill(0x231b29);
  world.addChild(base);
  const bg = new PIXI.Sprite(textureFromUrl(`${ART}hollow.webp`));
  bg.scale.set(HOLLOW.scale);
  world.addChild(bg);
  const giant = new PIXI.Sprite(textureFromUrl(`${ART}hollow_grendaline.webp`));
  giant.scale.set(HOLLOW.scale);
  giant.alpha = 0;
  world.addChild(giant);
  return {
    label: STAGE_LABELS.waterfall_04_wider,
    hubName: 'The Last Pilgrimage of Esquibeth',
    width: HOLLOW.width,
    height: HOLLOW.height,
    background: root,
    platforms: stagePlatforms(kit, 'waterfall_04_wider'),
    barriers: [],
    spawn: { ...HOLLOW.spawn },
    giant,
  };
}

/* ------------------------------------------------------------------ */
/* Screen text: the narration overlay and the bottom line               */
/* ------------------------------------------------------------------ */

let overlayEl = null;
let lineEl = null;
let lineTimer = 0;

function hudHost() {
  return document.getElementById('rook-woods-hud')?.parentElement || document.getElementById('game-root') || document.body;
}

/** announce_vog: big white lines over a dimmed world; click anywhere (or Enter/Space). */
export function narrate(ctx, text, { width = 800 } = {}) {
  ctx.activity(text.replace(/\n/g, ' '));
  if (typeof document === 'undefined') return Promise.resolve();
  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.className = 'esq-vog';
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.style.cssText = 'position:absolute;inset:0;z-index:86;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;cursor:pointer;text-align:center;padding:0 16px;background:radial-gradient(ellipse at center,rgba(20,14,30,.55),rgba(20,14,30,.25) 70%);transition:opacity .45s;opacity:0';
    hudHost().appendChild(overlayEl);
  }
  overlayEl.innerHTML = `<p style="margin:0;max-width:${Math.min(width, 800)}px;font:900 clamp(1.2rem,3.2vw,1.85rem)/1.2 Nunito,'Trebuchet MS',sans-serif;color:#fff;text-shadow:0 2px 0 #2a2230,0 0 16px rgba(0,0,0,.55);white-space:pre-line"></p>
    <span style="font:800 .8rem Nunito,sans-serif;color:#fff;text-shadow:0 1px 2px #000">&#9656; Click anywhere&hellip;</span>`;
  overlayEl.querySelector('p').textContent = text;
  overlayEl.hidden = false;
  const token = (overlayEl.token = (overlayEl.token || 0) + 1);
  requestAnimationFrame(() => { if (overlayEl && overlayEl.token === token && !overlayEl.closing) overlayEl.style.opacity = '1'; });
  overlayEl.closing = false;
  ctx.setData('esqVog', text.replace(/\n/g, ' '));
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', onKey, true);
      overlayEl.closing = true;
      overlayEl.style.opacity = '0';
      setTimeout(() => { if (overlayEl && overlayEl.token === token) overlayEl.hidden = true; }, 450);
      ctx.setData('esqVog', '');
      ctx.data.vogNext = null;
      resolve();
    };
    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopImmediatePropagation();
        finish();
      }
    };
    ctx.data.vogNext = finish;
    setTimeout(() => {
      overlayEl.addEventListener('click', finish, { once: true });
      window.addEventListener('keydown', onKey, true);
    }, 350);
  });
}

/** The small line at the bottom of the screen ("Found 1 of 3 Notes"). */
function bottomLine(ctx, text, ms = 3200, log = true) {
  if (log) ctx.activity(text);
  ctx.setData('esqLine', text);
  if (typeof document === 'undefined') return;
  if (!lineEl) {
    lineEl = document.createElement('div');
    lineEl.className = 'esq-line';
    lineEl.style.cssText = 'position:absolute;left:50%;bottom:120px;transform:translateX(-50%);z-index:80;pointer-events:none;font:800 .95rem Nunito,sans-serif;color:#fff;text-shadow:0 1px 2px #000,0 0 8px rgba(0,0,0,.6);transition:opacity .4s;white-space:nowrap';
    hudHost().appendChild(lineEl);
  }
  lineEl.textContent = text;
  lineEl.style.opacity = '1';
  lineEl.hidden = false;
  clearTimeout(lineTimer);
  lineTimer = setTimeout(() => { if (lineEl) lineEl.style.opacity = '0'; }, ms);
}

function clearScreenText() {
  clearTimeout(lineTimer);
  if (overlayEl) overlayEl.hidden = true;
  if (lineEl) lineEl.hidden = true;
}

/* ------------------------------------------------------------------ */
/* Esquibeth's ghost (npc_esquibeth_playback sheets, 157 x 205 frames)  */
/* ------------------------------------------------------------------ */

const GHOST_SHEETS = {
  appear: [6, 7, 41], idle: [6, 6, 34], disappear: [6, 7, 36],
  note1: [6, 5, 26], note2: [5, 5, 25], note3: [6, 5, 27], note4: [6, 5, 26], note5: [5, 5, 25],
};

function ghostSheets(ctx) {
  if (!ctx.data.ghostSheets) {
    ctx.data.ghostSheets = {};
    for (const [name, [cols, rows, count]] of Object.entries(GHOST_SHEETS)) {
      ctx.data.ghostSheets[name] = ctx.kit.sheetFrames(ctx.PIXI, `${ART}ghost_${name}.webp`, cols, rows, count);
    }
  }
  return ctx.data.ghostSheets;
}

function makeGhost(ctx, x, y) {
  const { PIXI } = ctx;
  const spr = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  spr.anchor.set(0.5, 0.93);
  spr.animationSpeed = 0.5;
  spr.x = x;
  spr.y = y;
  ctx.add(spr, 24);
  return spr;
}

/** Play one ghost animation; resolves when a non-looping one ends (or after its frame time). */
function ghostAnim(ctx, spr, name, { loop = false } = {}) {
  const sheet = ghostSheets(ctx)[name];
  return new Promise((resolve) => {
    const go = () => {
      if (!spr || spr.destroyed) return resolve();
      spr.textures = sheet.frames.length ? sheet.frames : [ctx.PIXI.Texture.EMPTY];
      spr.loop = loop;
      spr.onComplete = () => resolve();
      spr.gotoAndPlay(0);
      if (loop) resolve();
      // Headless frames are slow: never wait longer than the animation's real time.
      else setTimeout(resolve, (GHOST_SHEETS[name][2] / 30) * 1000 + 120);
    };
    if (sheet.frames.length) go();
    else onLoaded(sheet.base, () => setTimeout(go, 0));
  });
}

async function ghostVanish(ctx, spr) {
  if (!spr || spr.destroyed) return;
  await ghostAnim(ctx, spr, 'disappear');
  if (!spr.destroyed) spr.visible = false;
}

/* ------------------------------------------------------------------ */
/* Grotto play: notes, the stone, the song                              */
/* ------------------------------------------------------------------ */

function noteSprite(ctx, n, state = '1') {
  return ctx.kit.roomArt(ctx.PIXI, ROOM_ID, `note${n}_${state}`, 0, 0, { ax: 0.5, ay: 0.5 });
}

function setupGrotto(ctx, stage, scene) {
  const { PIXI, kit } = ctx;
  const L = stageLayout(stage);
  const d = ctx.data;
  d.layout = L;
  d.exitGlow = scene?.exitGlow || d.exitGlow;
  d.found = [];
  d.entered = [];
  d.phase = 'notes';
  d.exitOpen = false;
  d.songHeard = false;
  // World notes: a soft white orb with its glyph, bobbing above the rock.
  d.notes = L.notes.map((note) => {
    const c = new PIXI.Container();
    c.addChild(kit.glow(PIXI, 0, 0, 0xe8fbff, 20));
    const s = noteSprite(ctx, note.n);
    s.scale.set(0.7);
    c.addChild(s);
    c.x = note.x;
    c.y = note.y - 52;
    c.baseY = c.y;
    ctx.add(c, 22);
    return { ...note, sprite: c, taken: false };
  });
  // Sockets on the stone: empty dents until a note is found.
  const gl = L.glyph;
  const cx = gl.x;
  const cy = gl.y - GLYPH_CENTRE_UP;
  d.glyphLit = new PIXI.Graphics();
  d.glyphLit.x = cx;
  d.glyphLit.y = cy;
  drawGlyph(d.glyphLit, gl.symbol, 0x5ff0dc, 16, 0.18);
  drawGlyph(d.glyphLit, gl.symbol, 0x8ff6ea, 9, 0.35);
  drawGlyph(d.glyphLit, gl.symbol, 0xd8fffa, 5, 1);
  d.glyphLit.alpha = 0;
  ctx.add(d.glyphLit, -6);
  const offs = socketOffsets(L.notes.length);
  d.sockets = {};
  for (const [nStr, [dx, dy]] of Object.entries(offs)) {
    const n = Number(nStr);
    const c = new PIXI.Container();
    c.x = cx + dx;
    c.y = cy + dy;
    const dent = new PIXI.Graphics();
    dent.circle(0, 0, 13).fill({ color: 0x241b2e, alpha: 0.85 });
    c.addChild(dent);
    const plain = noteSprite(ctx, n, '1');
    const right = noteSprite(ctx, n, 'right');
    const wrong = noteSprite(ctx, n, 'wrong');
    for (const s of [plain, right, wrong]) {
      s.scale.set(0.82);
      s.visible = false;
      c.addChild(s);
    }
    const key = kit.label(PIXI, String(n), 0, 30, { size: 11, fill: 0xf3ecff, weight: '900' });
    key.alpha = 0;
    c.addChild(key);
    c.hitArea = new PIXI.Circle(0, 0, 26);
    c.eventMode = 'none';
    c.cursor = 'pointer';
    c.on('pointertap', () => playNote(ctx, n));
    ctx.add(c, -5);
    d.sockets[n] = { c, plain, right, wrong, key, flashUntil: 0 };
  }
  // The staff above the stone: one dot per note of the song.
  const song = SONGS[stage];
  d.staff = song.map((_, i) => {
    const t = song.length === 1 ? 0.5 : i / (song.length - 1);
    const a = Math.PI * (1.15 + 0.7 * t);
    const dot = new PIXI.Graphics();
    dot.circle(0, 0, 4).fill(0xffffff);
    dot.x = cx + Math.cos(a) * STAFF_RADIUS;
    dot.y = cy + 24 + Math.sin(a) * STAFF_RADIUS;
    dot.tint = 0x2a2133;
    ctx.add(dot, -5);
    return dot;
  });
  // esquibeth_button: Playback Button beside the stone (lockOut until all notes are found).
  const btn = new PIXI.Container();
  btn.x = L.button.x;
  btn.y = L.button.y - 64;
  const plate = new PIXI.Graphics();
  plate.roundRect(-20, -26, 40, 52, 8).fill({ color: 0x4b3d5c, alpha: 0.95 }).stroke({ width: 2, color: 0x2a2133, alpha: 1 });
  btn.addChild(plate);
  const sheet = kit.sheetFrames(PIXI, `${ART}button_in.png`, 8, 1, 8);
  const press = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  press.anchor.set(0.5);
  press.loop = false;
  press.animationSpeed = 0.5;
  const ready = () => {
    if (press.destroyed || !sheet.frames.length) return;
    press.textures = sheet.frames;
    press.gotoAndStop(0);
  };
  if (sheet.frames.length) ready();
  else onLoaded(sheet.base, () => setTimeout(ready, 0));
  btn.addChild(press);
  ctx.add(btn, -4);
  d.button = ctx.register({ classId: 'esquibeth_button', label: 'Playback Button', subtitle: 'Carved beside the stone', sprite: btn });
  d.button.press = press;
  // The stone itself: E opens a note menu (keys 1-5 work there too).
  const stoneHit = new PIXI.Container();
  const hit = new PIXI.Graphics();
  hit.rect(-80, -200, 160, 200).fill({ color: 0xffffff, alpha: 0.001 });
  stoneHit.addChild(hit);
  stoneHit.x = gl.x;
  stoneHit.y = gl.y;
  ctx.add(stoneHit, -7);
  d.stone = ctx.register({ classId: 'esquibeth_stone', label: 'The Giant’s stone', subtitle: 'Notes are set into it', sprite: stoneHit });
  // Exit rocks: a heap of basalt over the passage.
  d.rocks = rockPile(ctx, L.exit.x, L.exit.y, stage);
  // Quoins.
  d.quoins = (L.quoins || []).map((q, i) => ({ ...q, id: `${stage}q${i}`, spr: ctx.add(ctx.quoinSprite(q.type, q.x, q.y, 0.7), 28), taken: false }));
  refreshSockets(ctx);
}

function rockPile(ctx, x, floor, seed) {
  const { PIXI, kit } = ctx;
  const c = new PIXI.Container();
  const g = new PIXI.Graphics();
  const rocks = [];
  for (let i = 0; i < 11; i++) {
    const rx = (kit.hash01(`${seed}r${i}`) - 0.5) * 150;
    const ry = -18 - kit.hash01(`${seed}y${i}`) * 150;
    const r = 26 + kit.hash01(`${seed}s${i}`) * 26;
    rocks.push([rx, Math.min(-r * 0.6, ry), r, i]);
  }
  rocks.sort((a, b) => a[1] - b[1]);
  for (const [rx, ry, r, i] of rocks) {
    const shade = kit.hash01(`${seed}c${i}`) > 0.5 ? 0x6b5a7e : 0x584a6a;
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + kit.hash01(`${seed}a${i}`);
      const rr = r * (0.8 + kit.hash01(`${seed}k${i}:${k}`) * 0.3);
      pts.push(rx + Math.cos(a) * rr, ry + Math.sin(a) * rr * 0.8);
    }
    g.poly(pts).fill(shade).stroke({ width: 2, color: 0x2a2133, alpha: 0.9 });
    g.circle(rx - r * 0.3, ry - r * 0.35, r * 0.25).fill({ color: 0x9d8bb0, alpha: 0.5 });
  }
  c.addChild(g);
  c.x = x;
  c.y = floor;
  ctx.add(c, 40);
  return c;
}

function refreshSockets(ctx) {
  const d = ctx.data;
  const now = Date.now();
  const near = d.layout && ctx.near(d.layout.glyph.x, d.layout.glyph.y, 300);
  const playable = d.phase === 'song' && !d.ghostPlaying;
  for (const [nStr, s] of Object.entries(d.sockets || {})) {
    const n = Number(nStr);
    const have = d.found.includes(n);
    const flash = s.flashUntil > now ? s.flashKind : '';
    s.plain.visible = have && !flash;
    s.right.visible = flash === 'right' || (d.phase === 'done' && have);
    s.wrong.visible = flash === 'wrong';
    s.c.eventMode = playable && have ? 'static' : 'none';
    s.key.alpha = playable && have && near ? 0.85 : 0;
  }
  const song = SONGS[ctx.stage] || [];
  (d.staff || []).forEach((dot, i) => {
    const lit = d.phase === 'done' || i < (d.entered?.length || 0) || i < (d.ghostBeat ?? -1) + 1;
    dot.tint = lit ? 0x8ff6ea : 0x2a2133;
  });
  return song;
}

function flash(ctx, n, kind, ms = 520) {
  const s = ctx.data.sockets?.[n];
  if (!s) return;
  s.flashKind = kind;
  s.flashUntil = Date.now() + ms;
  refreshSockets(ctx);
  setTimeout(() => refreshSockets(ctx), ms + 20);
}

function collectNote(ctx, note) {
  const d = ctx.data;
  note.taken = true;
  d.found.push(note.n);
  ctx.sound(BELLS[note.n], { volume: 0.55 });
  const n = d.notes.length;
  const k = d.found.length;
  // The note drifts to its socket on the stone.
  const spr = note.sprite;
  const sock = d.sockets[note.n]?.c;
  const from = { x: spr.x, y: spr.y };
  const t0 = Date.now();
  const fly = () => {
    if (spr.destroyed) return;
    const t = Math.min(1, (Date.now() - t0) / 700);
    spr.alpha = 1 - t;
    spr.scale.set(1 + t * 0.6);
    spr.y = from.y - t * 30;
    if (t < 1) requestAnimationFrame(fly);
    else spr.visible = false;
  };
  if (typeof requestAnimationFrame === 'function') fly();
  else spr.visible = false;
  if (sock) flash(ctx, note.n, 'right', 900);
  if (k < n) {
    bottomLine(ctx, LINES.found(k, n));
    return;
  }
  bottomLine(ctx, LINES.allFound, 4500);
  d.phase = 'song';
  ctx.engine.updateHud();
  // Esquibeth plays the song at the stone the moment the last note is found.
  setTimeout(() => ghostPlayback(ctx), 900);
}

/** npc_esquibeth_playback: appear at the stone, play the song, disappear. */
async function ghostPlayback(ctx) {
  const d = ctx.data;
  if (d.ghostPlaying || d.phase !== 'song' || !d.layout) return;
  d.ghostPlaying = true;
  d.entered = [];
  refreshSockets(ctx);
  const stage = ctx.stage;
  const song = SONGS[stage];
  const gl = d.layout.glyph;
  const spr = d.playbackGhost && !d.playbackGhost.destroyed ? d.playbackGhost : (d.playbackGhost = makeGhost(ctx, gl.x, gl.y + 2));
  spr.visible = true;
  spr.alpha = 0.92;
  try {
    await ghostAnim(ctx, spr, 'appear');
    if (ctx.stage !== stage) return;
    ghostAnim(ctx, spr, 'idle', { loop: true });
    // The overlay's recorded take carries the song; the separate bells are
    // the fallback when it cannot load.
    const melody = PLAYBACK_SOUNDS[stage];
    const warm = melody && ctx.engine.preloadSounds ? await ctx.engine.preloadSounds([melody]) : null;
    if (ctx.stage !== stage || d.phase !== 'song') return;
    const recorded = Boolean(warm?.[0]);
    d.playbackSound = recorded ? melody : null;
    if (recorded) d.playbackHandle = ctx.sound(melody, { volume: 0.8 });
    const t0 = Date.now() + (recorded ? PLAYBACK_LEAD_MS : 0);
    for (const [i, n] of song.entries()) {
      const at = t0 + SONG_BEATS_MS[i];
      await ctx.wait(Math.max(0, at - Date.now()));
      if (ctx.stage !== stage || d.phase !== 'song') return;
      d.ghostBeat = i;
      if (!recorded) ctx.sound(BELLS[n], { volume: 0.6 });
      flash(ctx, n, 'right', 480);
      ghostAnim(ctx, spr, `note${n}`).then(() => {
        if (!spr.destroyed && d.ghostPlaying && spr.loop === false && d.ghostBeat === i) ghostAnim(ctx, spr, 'idle', { loop: true });
      });
    }
    await ctx.wait(1100);
    await ghostVanish(ctx, spr);
  } finally {
    if (ctx.stage !== stage) try { d.playbackHandle?.stop?.(); } catch { /* ended */ }
    d.playbackHandle = null;
    d.ghostPlaying = false;
    d.ghostBeat = -1;
    d.songHeard = true;
    d.entered = [];
    refreshSockets(ctx);
  }
}

/** The player plays one of the stone's notes. */
export function playNote(ctx, n) {
  const d = ctx.data;
  if (d.phase !== 'song' || d.ghostPlaying || !d.found.includes(n)) return false;
  const song = SONGS[ctx.stage];
  ctx.sound(BELLS[n], { volume: 0.6 });
  const step = songStep(song, d.entered, n);
  d.entered = step.entered;
  d.plays = (d.plays || 0) + 1;
  if (!step.ok) {
    d.misses = (d.misses || 0) + 1;
    flash(ctx, n, 'wrong', 650);
    return true;
  }
  flash(ctx, n, 'right', 520);
  if (step.done) songDone(ctx);
  return true;
}

async function songDone(ctx) {
  const d = ctx.data;
  const stage = ctx.stage;
  d.phase = 'done';
  refreshSockets(ctx);
  await ctx.wait(500);
  ctx.sound('WATERFALL_SYMBOL_GLOW', { volume: 0.7 });
  const t0 = Date.now();
  await new Promise((resolve) => {
    const step = () => {
      if (!d.glyphLit || d.glyphLit.destroyed || ctx.stage !== stage) return resolve();
      d.glyphLit.alpha = Math.min(1, (Date.now() - t0) / 1200);
      if (d.glyphLit.alpha < 1) setTimeout(step, 30);
      else resolve();
    };
    step();
  });
  await ctx.wait(900);
  if (ctx.stage !== stage) return;
  await openExit(ctx);
  const line = LINES.after[stage];
  if (line) await narrate(ctx, line);
}

async function openExit(ctx) {
  const d = ctx.data;
  ctx.sound('ROCKS_DISAPPEAR', { volume: 0.7 });
  const rocks = d.rocks;
  const t0 = Date.now();
  await new Promise((resolve) => {
    const step = () => {
      const t = Math.min(1, (Date.now() - t0) / 1100);
      if (rocks && !rocks.destroyed) {
        rocks.alpha = 1 - t;
        rocks.y = d.layout.exit.y + t * 24;
      }
      if (d.exitGlow && !d.exitGlow.destroyed) d.exitGlow.alpha = t;
      if (t < 1) setTimeout(step, 30);
      else resolve();
    };
    step();
  });
  if (rocks && !rocks.destroyed) rocks.visible = false;
  d.exitOpen = true;
  ctx.engine.updateHud();
}

async function leaveGrotto(ctx) {
  const d = ctx.data;
  if (d.moving) return;
  d.moving = true;
  const next = nextStage(ctx.stage);
  stopMusic(ctx);
  await ctx.gotoStage(next, { transition: ctx.fx() });
  d.moving = false;
}

/* ------------------------------------------------------------------ */
/* Waterfall Hollow                                                     */
/* ------------------------------------------------------------------ */

function setupHollow(ctx, scene) {
  const { PIXI, kit } = ctx;
  const d = ctx.data;
  d.layout = null;
  d.phase = 'arrive';
  d.giant = scene?.giant || d.giant;
  d.exitOpen = false;
  d.revealed = false;
  // The pedestal's rubble.
  d.rocks = rockPile(ctx, HOLLOW.rubble.x, HOLLOW.rubble.y, 'hollow');
  d.rocks.scale.set(1.5, 1.6);
  // The exit light, faint until the way opens.
  const glow = radial(PIXI, 'rgba(255,240,190,1)', 'rgba(255,236,180,0)', 400, 460);
  glow.x = HOLLOW.light.x;
  glow.y = HOLLOW.light.y;
  glow.alpha = 0;
  ctx.add(glow, -8);
  d.exitGlow = glow;
  // The Conch (conch_decoy) or, on a reminisce, an iMG quoin, hidden behind the rubble.
  if (ctx.questId === MAIN) {
    const conch = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
    const sheet = kit.sheetFrames(PIXI, `${ART}conch_decoy.webp`, 6, 5, 30);
    const ready = () => {
      if (conch.destroyed || !sheet.frames.length) return;
      conch.textures = sheet.frames;
      conch.play();
    };
    if (sheet.frames.length) ready();
    else onLoaded(sheet.base, () => setTimeout(ready, 0));
    conch.anchor.set(0.5, 0.62);
    conch.scale.set(0.8);
    conch.animationSpeed = 0.25;
    conch.x = HOLLOW.pedestal.x;
    conch.y = HOLLOW.pedestal.y;
    conch.visible = false;
    ctx.add(conch, 30);
    d.conchSprite = conch;
  } else {
    const q = ctx.quoinSprite('xp', HOLLOW.pedestal.x, HOLLOW.pedestal.y - 10, 0.75);
    q.visible = false;
    ctx.add(q, 30);
    d.pedestalQuoin = { spr: q, x: HOLLOW.pedestal.x, y: HOLLOW.pedestal.y - 10, taken: false };
  }
  hollowScript(ctx);
}

async function hollowScript(ctx) {
  const d = ctx.data;
  await ctx.wait(1200);
  if (ctx.stage !== 'waterfall_04_wider') return;
  // Esquibeth_End_Overlay: she appears on the slab and dances her last dance.
  d.phase = 'dance';
  const spr = makeGhost(ctx, HOLLOW.ghost.x, HOLLOW.ghost.y);
  spr.scale.set(1.15);
  d.danceGhost = spr;
  await ghostAnim(ctx, spr, 'appear');
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < DANCE_MS && ctx.stage === 'waterfall_04_wider') {
    const n = [1, 3, 2, 5, 4][i % 5];
    spr.x = HOLLOW.ghost.x + Math.sin(i * 1.3) * 50;
    spr.scale.x = (i % 2 ? -1 : 1) * 1.15;
    await ghostAnim(ctx, spr, `note${n}`);
    i += 1;
  }
  await ghostVanish(ctx, spr);
  if (ctx.stage !== 'waterfall_04_wider') return;
  await narrate(ctx, LINES.hollow);
  // Grendaline fades in through the light.
  d.phase = 'giant';
  d.liftUntil = Date.now() + 7500;
  await fadeGiant(ctx, 1, 2600);
  if (ctx.questId === REMINISCE) {
    ctx.progress('esquibeth_exit_revealed');
    ctx.activity('Quest progress: Go on the Journey');
  } else {
    ctx.activity('Quest progress: Find the Conch');
  }
  d.phase = 'seek';
  ctx.engine.updateHud();
}

function fadeGiant(ctx, to, ms) {
  const d = ctx.data;
  const from = d.giant?.alpha ?? 0;
  const t0 = Date.now();
  return new Promise((resolve) => {
    const step = () => {
      if (!d.giant || d.giant.destroyed) return resolve();
      const t = Math.min(1, (Date.now() - t0) / ms);
      d.giant.alpha = from + (to - from) * t;
      if (t < 1) setTimeout(step, 30);
      else resolve();
    };
    step();
  });
}

async function revealPedestal(ctx) {
  const d = ctx.data;
  if (d.revealed) return;
  d.revealed = true;
  ctx.sound('ROCKS_DISAPPEAR', { volume: 0.7 });
  const t0 = Date.now();
  await new Promise((resolve) => {
    const step = () => {
      const t = Math.min(1, (Date.now() - t0) / 1100);
      if (d.rocks && !d.rocks.destroyed) {
        d.rocks.alpha = 1 - t;
        d.rocks.y = HOLLOW.rubble.y + t * 20;
      }
      if (t < 1) setTimeout(step, 30);
      else resolve();
    };
    step();
  });
  if (d.rocks && !d.rocks.destroyed) d.rocks.visible = false;
  if (d.conchSprite) {
    d.conchSprite.visible = true;
    d.conchTarget = ctx.register({ classId: 'conch_decoy', label: 'Conch', subtitle: 'On the pedestal', sprite: d.conchSprite });
  }
  if (d.pedestalQuoin) d.pedestalQuoin.spr.visible = true;
  ctx.sound('WATERFALL_SUCCESS', { volume: 0.5 });
  if (ctx.questId === REMINISCE) openHollowExit(ctx);
}

function openHollowExit(ctx) {
  const d = ctx.data;
  if (d.exitOpen) return;
  d.exitOpen = true;
  ctx.solve();
  const t0 = Date.now();
  const step = () => {
    if (!d.exitGlow || d.exitGlow.destroyed) return;
    d.exitGlow.alpha = Math.min(1, (Date.now() - t0) / 1000);
    if (d.exitGlow.alpha < 1) setTimeout(step, 30);
  };
  step();
  ctx.engine.updateHud();
}

async function pickUpConch(ctx) {
  const d = ctx.data;
  if (d.conchTaken || !d.revealed) return;
  d.conchTaken = true;
  if (d.conchTarget) ctx.unregister(d.conchTarget);
  if (d.conchSprite) d.conchSprite.visible = false;
  if (ctx.count('conch') === 0) ctx.give('conch', 1, CONCH_ITEM);
  ctx.progress('got_conch');
  ctx.sound('ITEM_PICKUP', { volume: 0.6 });
  ctx.floatText(HOLLOW.pedestal.x, HOLLOW.pedestal.y - 50, '+1 Conch', '#ffffff');
  await narrate(ctx, LINES.memento);
  // Grendaline looks on once more, then the way out opens.
  d.giant.alpha = 1;
  setTimeout(() => fadeGiant(ctx, 0.55, 1800), 1200);
  openHollowExit(ctx);
}

/** items/conch.js, for the pack (ensureItem). */
export const CONCH_ITEM = Object.freeze({
  label: 'Conch',
  desc: 'A Conch!',
  stackMax: 1,
  baseCost: 700,
  sellable: false,
  donatable: false,
  tags: ['no_rube', 'no_donate', 'no_auction', 'no_mail', 'no_trade'],
});

/* ------------------------------------------------------------------ */
/* Music and keys                                                       */
/* ------------------------------------------------------------------ */

function startMusic(ctx, file) {
  stopMusic(ctx);
  const d = ctx.data;
  d.musicFile = file;
  d.musicAt = Date.now();
  const p = ctx.engine.playCue?.(`${SFX}${file}.mp3`, { volume: 0.45 });
  if (p?.then) p.then((stop) => {
    if (d.musicFile === file) d.stopMusic = stop;
    else stop?.();
  });
}

function stopMusic(ctx) {
  const d = ctx.data;
  d.musicFile = null;
  try { d.stopMusic?.(); } catch { /* ended */ }
  d.stopMusic = null;
}

let keyListener = null;
function attachKeys(ctx) {
  detachKeys();
  keyListener = (e) => {
    const d = ctx.data;
    if (!d || d.phase !== 'song' || !d.layout || ctx.dialogOpen()) return;
    if (!/^[1-5]$/.test(e.key) || e.repeat) return;
    if (!ctx.near(d.layout.glyph.x, d.layout.glyph.y, 300)) return;
    if (playNote(ctx, Number(e.key))) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  window.addEventListener('keydown', keyListener, true);
}
function detachKeys() {
  if (keyListener) window.removeEventListener('keydown', keyListener, true);
  keyListener = null;
}

/* ------------------------------------------------------------------ */
/* Room                                                                 */
/* ------------------------------------------------------------------ */

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth'];

export const room = {
  id: ROOM_ID,
  title: 'The Last Pilgrimage of Esquibeth',
  kicker: 'Retrace her steps',
  icon: 'assets/sprites/icons/conch.png',
  theme: 'dark',
  hubName: 'The Last Pilgrimage of Esquibeth',
  durationMs: 0,
  firstStage: 'waterfall_01',
  leaveText: 'Leave the pilgrimage? You will have to start over from the Eastern Grotto.',
  travelText: 'The only way on is Esquibeth’s path.',
  doneLabel: 'Go back',
  stageLabel: (stage) => STAGE_LABELS[stage] || 'Eastern Grotto',

  /** QA: &esqstage=<location> starts the walk further along. */
  start(ctx) {
    const want = ctx.param('esqstage');
    if (STAGES.includes(want) && ctx.run) ctx.run.stage = want;
  },

  build(ctx, stage) {
    const scene = stage === 'waterfall_04_wider' ? buildHollow(ctx) : buildGrotto(ctx, stage);
    ctx.data.scene = scene;
    return scene;
  },

  enter(ctx, stage) {
    const d = ctx.data;
    attachKeys(ctx);
    d.moving = false;
    if (stage === 'waterfall_04_wider') {
      setupHollow(ctx, d.scene);
      startMusic(ctx, 'AMBIENT_WATERFALL_LEVEL3');
      return;
    }
    setupGrotto(ctx, stage, d.scene);
    startMusic(ctx, stage === 'waterfall_03' ? 'AMBIENT_WATERFALL_LEVEL3' : 'AMBIENT_WATERFALL');
    // Warm the ghost's melody so her notes land on the recording's beats.
    if (PLAYBACK_SOUNDS[stage]) ctx.engine.preloadSounds?.([PLAYBACK_SOUNDS[stage]]);
    if (stage === 'waterfall_01' && !d.introDone) intro(ctx);
  },

  verbs(ctx, target) {
    const d = ctx.data;
    if (target === d.button) {
      const ready = d.phase === 'song';
      return [{
        id: 'press',
        label: 'Press',
        enabled: ready && !d.ghostPlaying,
        reason: d.phase === 'notes' ? 'Find all the notes first' : d.ghostPlaying ? 'Esquibeth is playing' : 'The song is played',
        tooltip: 'Hear Esquibeth play the song again',
      }];
    }
    if (target === d.stone) {
      if (d.phase !== 'song') return [{ id: 'look', label: 'Look', enabled: false, reason: d.phase === 'notes' ? 'Find all the notes first' : 'The glyph is glowing', tooltip: '' }];
      return [...d.found].sort().map((n) => ({
        id: `note:${n}`,
        label: `Play the ${ORDINALS[n - 1]} note`,
        enabled: !d.ghostPlaying,
        reason: 'Esquibeth is playing',
        tooltip: `Or press ${n} by the stone`,
      }));
    }
    if (target === d.conchTarget) return [{ id: 'pickup', label: 'Pick up', enabled: true, tooltip: 'Pickup' }];
    return [];
  },

  runVerb(ctx, target, verbId) {
    const d = ctx.data;
    if (target === d.button && verbId === 'press') {
      d.button.press?.gotoAndPlay?.(0);
      ctx.sound('BUTTON_2', { volume: 0.5 });
      ghostPlayback(ctx);
      return true;
    }
    if (target === d.stone && verbId.startsWith('note:')) {
      playNote(ctx, Number(verbId.slice(5)));
      return true;
    }
    if (target === d.conchTarget && verbId === 'pickup') {
      pickUpConch(ctx);
      return true;
    }
    return false;
  },

  tick(ctx) {
    const d = ctx.data;
    const p = ctx.player;
    if (!p || d.moving) return;
    const t = Date.now() / 1000;
    if (d.musicFile && Date.now() - d.musicAt > 110_000) startMusic(ctx, d.musicFile);
    if (ctx.stage === 'waterfall_04_wider') {
      // Look up into the light while Grendaline shows herself.
      const lift = (d.liftUntil || 0) > Date.now();
      if (lift !== Boolean(d.lifted)) {
        d.lifted = lift;
        ctx.engine.setCameraLook?.(lift ? 200 : 0, lift ? -170 : 0);
      }
      if (d.phase === 'seek' && !d.revealed && p.x >= HOLLOW.revealX) revealPedestal(ctx);
      const q = d.pedestalQuoin;
      if (q && q.spr.visible && !q.taken) {
        q.spr.y = q.y + Math.sin(t * 2.4) * 5;
        if (Math.abs(p.x - q.x) < 50 && p.y - 125 < q.y + 20 && p.y + 10 > q.y - 20) {
          q.taken = true;
          q.spr.visible = false;
          ctx.collectQuoin('xp', q.x, q.y);
        }
      }
      if (d.exitOpen && !d.exiting && p.x >= HOLLOW.exit.x1 + 40) {
        d.exiting = true;
        stopMusic(ctx);
        ctx.leave({ transition: ctx.fx() });
      }
      return;
    }
    // Notes bob; walking into one collects it.
    for (const note of d.notes || []) {
      if (note.taken || note.sprite.destroyed) continue;
      note.sprite.y = note.sprite.baseY + Math.sin(t * 2.2 + note.x / 90) * 6;
      if (Math.abs(p.x - note.x) < 44 && p.y - 100 < note.sprite.y + 20 && p.y + 8 > note.sprite.y - 24) collectNote(ctx, note);
    }
    for (const q of d.quoins || []) {
      if (q.taken || q.spr.destroyed) continue;
      q.spr.y = q.y + Math.sin(t * 2.6 + q.x / 60) * 5;
      if (Math.abs(p.x - q.x) < 36 && p.y - 90 < q.y + 18 && p.y + 8 > q.y - 18) {
        q.taken = true;
        q.spr.visible = false;
        ctx.collectQuoin(q.type, q.x, q.y);
      }
    }
    if (d.sockets) refreshSockets(ctx);
    const L = d.layout;
    if (L && d.exitOpen && !ctx.data.vogNext && Math.abs(p.x - L.exit.x) < 70 && Math.abs(p.y - L.exit.y) < 30) leaveGrotto(ctx);
  },

  hudTitle: () => 'The Last Pilgrimage of Esquibeth',

  objective(ctx) {
    const d = ctx.data;
    const stage = ctx.stage;
    if (stage === 'waterfall_04_wider') {
      const rem = ctx.questId === REMINISCE;
      let text = 'Contemplate the heroic actions of Esquibeth.';
      if (d.phase === 'seek' && !d.revealed) text = rem ? 'Go on the Journey.' : 'Find the Conch.';
      else if (d.revealed && !d.exitOpen) text = 'Find the Conch.';
      else if (d.exitOpen) text = rem ? 'Return from the Journey: walk on into the light.' : 'Walk on into the light.';
      return { text, stats: [['location', '4/4']] };
    }
    const n = NOTE_COUNTS[stage] || 0;
    const found = d.found?.length || 0;
    const song = SONGS[stage] || [];
    let text = 'Find the notes.';
    if (d.phase === 'song') text = d.ghostPlaying ? 'Listen to Esquibeth’s song.' : 'Play the song on the stone (click the notes, or press 1-5 there).';
    else if (d.phase === 'done') text = d.exitOpen ? 'Follow her path on through the rocks.' : 'The glyph wakes …';
    return {
      text,
      stats: [['notes', `${found}/${n}`], ['song', `${d.phase === 'done' ? song.length : d.entered?.length || 0}/${song.length}`], ['location', `${STAGES.indexOf(stage) + 1}/4`]],
    };
  },

  onLeave(ctx, outcome) {
    stopMusic(ctx);
    ctx.engine.setCameraLook?.(0, 0);
    detachKeys();
    clearScreenText();
    const engine = ctx.engine;
    if (outcome === 'complete' && ctx.questId === MAIN) {
      // location.js: 5 s after the next arrival (end_esquibeth).
      setTimeout(() => {
        const fake = { activity: (s) => engine.pushActivity(s), setData: (k, v) => engine.setData(k, v), data: {} };
        narrate(fake, LINES.endVog, { width: 600 });
      }, END_VOG_DELAY_MS + 1500);
    }
    return {};
  },

  clear() {
    detachKeys();
  },

  publish(ctx) {
    const d = ctx.data;
    ctx.setData('esqStage', ctx.stage || '');
    ctx.setData('esqPhase', d.phase || '');
    ctx.setData('esqNotes', (d.found || []).join(','));
    ctx.setData('esqEntered', (d.entered || []).join(','));
    ctx.setData('esqGhost', d.ghostPlaying ? '1' : '0');
    ctx.setData('esqMelody', d.playbackSound || '');
    ctx.setData('esqExit', d.exitOpen ? '1' : '0');
    ctx.setData('esqRevealed', d.revealed ? '1' : '0');
    ctx.setData('esqConch', String(ctx.count('conch')));
    ctx.setData('esqMisses', String(d.misses || 0));
    const gh = d.danceGhost || d.playbackGhost;
    ctx.setData('esqGhostSpr', gh && !gh.destroyed && gh.visible ? `${Math.round(gh.x)},${Math.round(gh.y)}` : '');
    ctx.setData('esqGiant', d.giant && !d.giant.destroyed ? `${d.giant.alpha.toFixed(2)}:${isLoaded(d.giant.texture) ? 'ok' : 'loading'}` : '');
    if (d.layout) {
      const gl = d.layout.glyph;
      ctx.setData('esqGlyph', `${gl.x},${gl.y - GLYPH_CENTRE_UP}`);
    }
  },

  async autoplay(ctx, mode) {
    const d = ctx.data;
    const skipVog = async () => {
      for (let i = 0; i < 240; i++) {
        if (d.vogNext) d.vogNext();
        if (ctx.dialogOpen()) ctx.advanceDialog();
        await ctx.wait(250);
        if (!d.vogNext && !d.introRunning) return;
      }
    };
    for (const stage of STAGES.slice(0, 3)) {
      if (STAGES.indexOf(ctx.stage) > STAGES.indexOf(stage)) continue;
      for (let i = 0; i < 60 && ctx.stage !== stage; i++) await ctx.wait(250);
      await skipVog();
      const L = stageLayout(stage);
      for (const note of L.notes) {
        ctx.place(note.x, note.y - 4);
        for (let i = 0; i < 30 && !d.found.includes(note.n); i++) await ctx.wait(100);
      }
      if (mode === 'notes') return 'notes';
      ctx.place(L.glyph.x + 60, L.glyph.y - 4);
      for (let i = 0; i < 120 && (d.phase !== 'song' || d.ghostPlaying || !d.songHeard); i++) await ctx.wait(250);
      if (mode === 'ghost') return 'ghost';
      if (mode === 'wrong') playNote(ctx, SONGS[stage][1]);
      for (const n of SONGS[stage]) {
        playNote(ctx, n);
        await ctx.wait(350);
      }
      for (let i = 0; i < 80 && !d.exitOpen; i++) await ctx.wait(150);
      await skipVog();
      if (mode === stage) return stage;
      ctx.place(L.exit.x, L.exit.y - 4);
      for (let i = 0; i < 80 && ctx.stage === stage; i++) await ctx.wait(250);
    }
    for (let i = 0; i < 80 && ctx.stage !== 'waterfall_04_wider'; i++) await ctx.wait(250);
    if (mode === 'arrive') return 'arrive';
    for (let i = 0; i < 160 && d.phase !== 'seek'; i++) {
      if (d.vogNext) d.vogNext();
      await ctx.wait(250);
    }
    if (mode === 'giant') return 'giant';
    ctx.place(HOLLOW.revealX + 80, HOLLOW.floor[3][1] - 4);
    for (let i = 0; i < 40 && !d.revealed; i++) await ctx.wait(150);
    await ctx.wait(1400);
    if (ctx.questId === MAIN) {
      ctx.place(HOLLOW.pedestal.x - 30, HOLLOW.pedestal.floor - 4);
      await ctx.wait(400);
      pickUpConch(ctx);
      await ctx.wait(800);
      await skipVog();
    } else {
      ctx.place(HOLLOW.pedestal.x, HOLLOW.pedestal.floor - 4);
      await ctx.wait(800);
    }
    if (mode === 'pedestal') return 'pedestal';
    ctx.place(HOLLOW.exit.x1 + 120, HOLLOW.exit.y - 4);
    for (let i = 0; i < 60 && ctx.run; i++) await ctx.wait(250);
    return 'complete';
  },

  /** The Conch in the pack (quest-instances itemVerbs): Play, and Blow once after part 1. */
  itemClasses: ['conch'],
  itemVerbs(wctx, classTsid) {
    if (classTsid !== 'conch') return [];
    const done = (wctx.engine.questState?.completed || []).includes(MAIN);
    const mem = wctx.questMemory(MAIN);
    const blown = Boolean(mem.conchBlown);
    const out = [];
    if (blown || !done) out.push({ id: 'conch_play', label: 'Play', enabled: true, tooltip: 'Put it to your ear' });
    if (!blown && done) out.push({ id: 'conch_blow', label: 'Blow', enabled: true, tooltip: 'Blow the Conch' });
    return out;
  },
  runItemVerb(wctx, classTsid, verbId) {
    if (classTsid !== 'conch') return false;
    const engine = wctx.engine;
    const pc = engine.pc;
    const mem = wctx.questMemory(MAIN);
    const now = Date.now();
    if (verbId === 'conch_blow') {
      if (mem.conchBlown) return false;
      mem.conchBlown = now;
      mem.conchHeard = now;
      pc.xp = (Number(pc.xp) || 0) + CONCH.blowXp;
      pc.imagination = (Number(pc.imagination) || 0) + CONCH.blowXp;
      const favor = pc.giantFavor || pc.favor;
      if (favor && typeof favor === 'object') favor.grendaline = (Number(favor.grendaline) || 0) + CONCH.blowFavor;
      engine.playCue?.(`${SFX}CONCH.mp3`, { volume: 0.6 });
      engine.pushActivity(`You blew the Conch. +${CONCH.blowXp} iMG, +${CONCH.blowFavor} Grendaline favor.`);
      engine.floatText?.(engine.player?.x || 0, (engine.player?.y || 0) - 110, `+${CONCH.blowXp} iMG`, '#ffffff');
      engine.updateHud();
      wctx.save();
      return true;
    }
    if (verbId === 'conch_play') {
      const day = (ts) => Math.floor(ts / (4 * 60 * 60 * 1000));
      const reward = conchPlayReward(mem.conchHeard || 0, now, mem.conchHeard ? day(mem.conchHeard) === day(now) : false);
      mem.conchHeard = now;
      // conch.js 397: metabolics_add_mood(2), nothing while dead (inc_metabolics.js 79-86).
      const moodBefore = Number(pc.mood) || 0;
      if (metabolicGain('mood').ok) pc.mood = Math.min(moodMax(pc), moodBefore + 2);
      const moodGained = (Number(pc.mood) || 0) - moodBefore;
      loseEnergy(pc, 2); // conch.js 406: metabolics_lose_energy(2)
      // conch.js 364-382: stats_add_xp(n, false) takes the mood bonus (the
      // blow's Esquibeth reward above is no_bonus, conch.js 507).
      const xp = reward.xp ? grantMoodXp(pc, reward.xp) : 0;
      engine.playCue?.(`${SFX}CONCH.mp3`, { volume: 0.6 });
      engine.pushActivity(`You played the Conch.${reward.msg ? ` ${reward.msg}` : ''}${xp ? ` +${xp} iMG` : ''}${moodGained ? ` +${moodGained} mood` : ''}`);
      engine.updateHud();
      wctx.save();
      return true;
    }
    return false;
  },
};

async function intro(ctx) {
  const d = ctx.data;
  d.introDone = true;
  d.introRunning = true;
  try {
    bottomLine(ctx, LINES.soundBanner, 4200, false);
    ctx.activity(LINES.soundLog);
    await ctx.wait(ctx.fx() ? 2600 : 300);
    for (const line of LINES.intro) {
      if (ctx.stage !== 'waterfall_01') return;
      await narrate(ctx, line);
    }
    // Esquibeth_AppearWalk_Overlay: she appears beside you and walks on ahead.
    const p = ctx.player;
    const spr = makeGhost(ctx, (p?.x || 2900) - 110, p?.y || 640);
    spr.scale.x = -1;
    await ghostAnim(ctx, spr, 'appear');
    ghostAnim(ctx, spr, 'idle', { loop: true });
    const x0 = spr.x;
    const t0 = Date.now();
    while (Date.now() - t0 < 4200 && !spr.destroyed && ctx.stage === 'waterfall_01') {
      const t = (Date.now() - t0) / 4200;
      spr.x = x0 - t * 320;
      spr.y = (p?.y || 640) - Math.sin(t * Math.PI * 6) * 4;
      await ctx.wait(30);
    }
    await ghostVanish(ctx, spr);
  } finally {
    d.introRunning = false;
  }
}
