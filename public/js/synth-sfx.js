/**
 * Web Audio recipes for sound keys whose original files are lost.
 *
 * The production sounds XML that mapped Glitch's SFX keys to files was never
 * archived, so most keys (CLICK_SUCCESS, ITEM_PICKUP, PICK, ...) have no
 * recoverable audio. Each recipe here is a short, soft, whimsical stand-in
 * built from oscillators and filtered noise, tuned to sit under the recovered
 * set (kazoo level up, quest chimes, Qurazy quoin). Nothing is sampled from
 * gameplay videos.
 *
 * recipeForKey(key) picks a recipe by explicit table, then by name pattern,
 * then by catalog category. playSynthRecipe(ctx, destination, name, opts)
 * schedules it and returns its length in seconds.
 */

/** @typedef {{ rate?: number, volume?: number, variant?: number, seed?: number }} SynthOpts */

const noiseCache = new WeakMap();

function noiseBuffer(ctx) {
  let buffer = noiseCache.get(ctx);
  if (buffer) return buffer;
  const length = Math.floor(ctx.sampleRate * 1.5);
  buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < length; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (seed / 0x3fffffff) - 1;
  }
  noiseCache.set(ctx, buffer);
  return buffer;
}

/** Attack/decay envelope on a fresh gain node; returns the node. */
function envelope(ctx, out, t, { attack = 0.004, peak = 0.3, decay = 0.2, hold = 0 } = {}) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  if (hold > 0) g.gain.setValueAtTime(Math.max(0.0002, peak), t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + decay);
  g.connect(out);
  return g;
}

/** One oscillator voice with an optional pitch glide. */
function tone(ctx, out, t, {
  type = 'sine', f = 440, f2 = null, glide = null, attack = 0.004, peak = 0.25, decay = 0.2, hold = 0,
  vibrato = 0, vibratoRate = 6, detune = 0,
} = {}) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  if (f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + (glide ?? attack + hold + decay));
  if (detune) osc.detune.setValueAtTime(detune, t);
  const g = envelope(ctx, out, t, { attack, peak, decay, hold });
  osc.connect(g);
  if (vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = vibratoRate;
    depth.gain.value = vibrato;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + attack + hold + decay + 0.05);
  }
  osc.start(t);
  osc.stop(t + attack + hold + decay + 0.05);
  return attack + hold + decay;
}

/** Filtered noise burst with an optional filter sweep. */
function noise(ctx, out, t, {
  filter = 'bandpass', f = 1200, f2 = null, q = 1, attack = 0.003, peak = 0.2, decay = 0.12, hold = 0,
  offset = 0,
} = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const biquad = ctx.createBiquadFilter();
  biquad.type = filter;
  biquad.frequency.setValueAtTime(f, t);
  if (f2) biquad.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + attack + hold + decay);
  biquad.Q.value = q;
  const g = envelope(ctx, out, t, { attack, peak, decay, hold });
  src.connect(biquad);
  biquad.connect(g);
  const len = attack + hold + decay + 0.05;
  src.start(t, offset % 1.2, len);
  src.stop(t + len);
  return attack + hold + decay;
}

/** Soft bell: a few inharmonic sine partials. */
function bell(ctx, out, t, { f = 880, peak = 0.16, decay = 0.6, bright = 1 } = {}) {
  const partials = [[1, 1], [2.01, 0.42 * bright], [2.76, 0.22 * bright], [5.4, 0.08 * bright]];
  for (const [ratio, amp] of partials) {
    tone(ctx, out, t, { f: f * ratio, peak: peak * amp, attack: 0.003, decay: decay / Math.sqrt(ratio) });
  }
  return decay;
}

/** Metallic ping (pick on rock, coins). */
function ping(ctx, out, t, { f = 1800, peak = 0.12, decay = 0.25 } = {}) {
  for (const [ratio, amp] of [[1, 1], [1.47, 0.6], [2.31, 0.45], [3.93, 0.25]]) {
    tone(ctx, out, t, { f: f * ratio, peak: peak * amp, attack: 0.001, decay: decay * (1.1 - ratio / 6), type: 'sine' });
  }
  return decay;
}

const NOTE = (semitones, base = 523.25) => base * 2 ** (semitones / 12);
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

function arp(ctx, out, t, steps, { step = 0.07, base = 523.25, peak = 0.12, decay = 0.35, kind = 'bell', bright = 0.8 } = {}) {
  steps.forEach((s, i) => {
    const f = NOTE(s, base);
    if (kind === 'bell') bell(ctx, out, t + i * step, { f, peak, decay, bright });
    else tone(ctx, out, t + i * step, { type: kind, f, peak, decay, attack: 0.004 });
  });
  return steps.length * step + decay;
}

function rand(opts, salt = 0) {
  const x = Math.sin(((opts.seed ?? 0) + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Piano Party (GA96OS42D6F3M9P) notes, whose files never survived: its 19
 * keys and 34 small stars play LITTLE_STAR_1..19, its 12 constellation stars
 * BIG_STAR_1..12. Key 1 (leftmost) plays LITTLE_STAR_19, so the numbers run
 * high to low: a C major scale from G6 (1) down to C4 (19). The big stars,
 * hit in their scripted order, play the opening of "Twinkle Twinkle Little
 * Star" (the sounds' namesake); MOON_APPEARS resolves it when the moon smiles.
 */
const C_MAJOR = [0, 2, 4, 5, 7, 9, 11];
const scaleSemitones = (i) => 12 * Math.floor(i / 7) + C_MAJOR[i % 7];
const C4 = 261.63;
const TWINKLE = [0, 0, 7, 7, 9, 9, 7, 5, 5, 4, 4, 2];
const PIANO_RECIPES = {};
const PIANO_KEY_RECIPES = {};
for (let n = 1; n <= 19; n += 1) {
  const f = C4 * 2 ** (scaleSemitones(19 - n) / 12);
  PIANO_RECIPES[`littleStar${n}`] = (c, o, t, p) => {
    tone(c, o, t, { type: 'triangle', f: f * p.r, peak: 0.09, attack: 0.004, decay: 0.7 });
    return bell(c, o, t, { f: f * p.r, peak: 0.05, decay: 0.9, bright: 0.35 });
  };
  PIANO_KEY_RECIPES[`LITTLE_STAR_${n}`] = `littleStar${n}`;
}
TWINKLE.forEach((semitones, i) => {
  PIANO_RECIPES[`bigStar${i + 1}`] = (c, o, t, p) =>
    bell(c, o, t, { f: 523.25 * 2 ** (semitones / 12) * p.r, peak: 0.12, decay: 1.1, bright: 0.7 });
  PIANO_KEY_RECIPES[`BIG_STAR_${i + 1}`] = `bigStar${i + 1}`;
});
PIANO_RECIPES.moonAppears = (c, o, t, p) => arp(c, o, t, [0, 4, 7, 12, 16, 19, 24], { base: C4 * p.r, step: 0.11, peak: 0.08, decay: 1.4 });
PIANO_KEY_RECIPES.MOON_APPEARS = 'moonAppears';

/**
 * Recipes. Each: (ctx, out, t, opts) → seconds. `out` is a per-play gain at
 * the requested volume; `opts.rate` scales pitch where it reads naturally.
 */
export const SYNTH_RECIPES = Object.freeze({
  // —— UI ——
  click: (c, o, t, p) => {
    tone(c, o, t, { f: 1250 * p.r, f2: 900 * p.r, peak: 0.16, decay: 0.045 });
    return noise(c, o, t, { f: 3800, q: 2, peak: 0.05, decay: 0.02 });
  },
  clickFail: (c, o, t, p) => {
    tone(c, o, t, { type: 'triangle', f: 330 * p.r, f2: 300 * p.r, peak: 0.18, decay: 0.09 });
    return 0.12 + tone(c, o, t + 0.12, { type: 'triangle', f: 247 * p.r, f2: 220 * p.r, peak: 0.18, decay: 0.14 });
  },
  toggle: (c, o, t, p) => tone(c, o, t, { type: 'triangle', f: 880 * p.r, f2: 1320 * p.r, peak: 0.12, decay: 0.06 }),
  panelOpen: (c, o, t, p) => {
    noise(c, o, t, { f: 900, f2: 3200, q: 0.8, attack: 0.04, peak: 0.05, decay: 0.12 });
    bell(c, o, t + 0.03, { f: NOTE(7, 784 * p.r), peak: 0.07, decay: 0.3 });
    return bell(c, o, t + 0.09, { f: NOTE(12, 784 * p.r), peak: 0.06, decay: 0.35 }) + 0.09;
  },
  panelClose: (c, o, t, p) => {
    noise(c, o, t, { f: 2800, f2: 700, q: 0.8, attack: 0.02, peak: 0.045, decay: 0.12 });
    return bell(c, o, t + 0.02, { f: NOTE(0, 784 * p.r), peak: 0.06, decay: 0.25 }) + 0.02;
  },
  mapOpen: (c, o, t, p) => {
    for (let i = 0; i < 4; i += 1) noise(c, o, t + i * 0.045, { f: 2000 + i * 500, q: 1.4, peak: 0.06, decay: 0.05, offset: i * 0.1 });
    return 0.18 + bell(c, o, t + 0.18, { f: 1046 * p.r, peak: 0.06, decay: 0.3 });
  },
  mapClose: (c, o, t) => {
    for (let i = 0; i < 3; i += 1) noise(c, o, t + i * 0.05, { f: 3000 - i * 600, q: 1.4, peak: 0.055, decay: 0.05, offset: 0.4 + i * 0.1 });
    return 0.2;
  },
  cardFlip: (c, o, t, p) => {
    noise(c, o, t, { f: 2600 * p.r, q: 1.2, peak: 0.08, decay: 0.04 });
    return 0.05 + noise(c, o, t + 0.05, { f: 1700 * p.r, q: 1.2, peak: 0.06, decay: 0.05 });
  },
  cloud: (c, o, t, p) => {
    noise(c, o, t, { filter: 'lowpass', f: 600, f2: 2400, attack: 0.08, peak: 0.05, decay: 0.3 });
    return bell(c, o, t + 0.05, { f: NOTE(PENTA[(p.variant || 0) % PENTA.length], 659 * p.r), peak: 0.06, decay: 0.5 });
  },
  chat: (c, o, t, p) => {
    tone(c, o, t, { f: 1568 * p.r, peak: 0.08, decay: 0.12 });
    return 0.08 + tone(c, o, t + 0.08, { f: 2093 * p.r, peak: 0.07, decay: 0.16 });
  },
  shutter: (c, o, t) => {
    noise(c, o, t, { f: 4000, q: 1, peak: 0.12, decay: 0.03 });
    return 0.06 + noise(c, o, t + 0.06, { f: 2500, q: 1, peak: 0.1, decay: 0.05 });
  },
  // —— Items ——
  pop: (c, o, t, p) => {
    tone(c, o, t, { f: 520 * p.r, f2: 980 * p.r, glide: 0.05, peak: 0.2, decay: 0.08 });
    return tone(c, o, t + 0.04, { f: 1320 * p.r, peak: 0.06, decay: 0.12 }) + 0.04;
  },
  drop: (c, o, t, p) => {
    tone(c, o, t, { f: 210 * p.r, f2: 95 * p.r, glide: 0.12, peak: 0.26, decay: 0.14 });
    return noise(c, o, t, { filter: 'lowpass', f: 700, peak: 0.08, decay: 0.07 });
  },
  give: (c, o, t, p) => arp(c, o, t, [0, 7], { base: 659 * p.r, step: 0.08, peak: 0.09, decay: 0.3 }),
  packFull: (c, o, t, p) => {
    tone(c, o, t, { type: 'triangle', f: 196 * p.r, peak: 0.16, decay: 0.12 });
    return 0.1 + tone(c, o, t + 0.1, { type: 'triangle', f: 196 * p.r, f2: 165 * p.r, peak: 0.16, decay: 0.2 });
  },
  coin: (c, o, t, p) => {
    ping(c, o, t, { f: 1975 * p.r, peak: 0.08, decay: 0.18 });
    return 0.06 + ping(c, o, t + 0.06, { f: 2637 * p.r, peak: 0.08, decay: 0.32 });
  },
  purchase: (c, o, t, p) => {
    noise(c, o, t, { f: 1500, q: 2, peak: 0.06, decay: 0.05 });
    ping(c, o, t + 0.05, { f: 2093 * p.r, peak: 0.07, decay: 0.2 });
    return 0.13 + ping(c, o, t + 0.13, { f: 2794 * p.r, peak: 0.08, decay: 0.4 });
  },
  sell: (c, o, t, p) => {
    for (let i = 0; i < 4; i += 1) ping(c, o, t + i * 0.055, { f: (2400 - i * 220) * p.r, peak: 0.05, decay: 0.12 });
    return 0.35;
  },
  // —— Food ——
  munch: (c, o, t, p) => {
    for (let i = 0; i < 3; i += 1) {
      noise(c, o, t + i * 0.13, { filter: 'lowpass', f: 1400 + rand(p, i) * 600, peak: 0.14, decay: 0.06, offset: i * 0.2 });
      tone(c, o, t + i * 0.13, { f: 140 * p.r, f2: 90 * p.r, peak: 0.08, decay: 0.05 });
    }
    return 0.45;
  },
  gulp: (c, o, t, p) => {
    for (let i = 0; i < 2; i += 1) {
      tone(c, o, t + i * 0.22, { f: 330 * p.r, f2: 160 * p.r, glide: 0.1, peak: 0.18, decay: 0.12 });
      noise(c, o, t + i * 0.22, { filter: 'lowpass', f: 500, peak: 0.05, decay: 0.08 });
    }
    return 0.4;
  },
  burp: (c, o, t, p) => tone(c, o, t, { type: 'sawtooth', f: 120 * p.r, f2: 85 * p.r, peak: 0.07, attack: 0.03, decay: 0.3, vibrato: 12, vibratoRate: 28 }),
  // —— Quoins (one per type, all bright and short) ——
  quoinXp: (c, o, t, p) => arp(c, o, t, [0, 4, 7, 12], { base: 784 * p.r, step: 0.045, peak: 0.08, decay: 0.32 }),
  quoinMood: (c, o, t, p) => arp(c, o, t, [4, 9, 16], { base: 880 * p.r, step: 0.06, peak: 0.08, decay: 0.4, bright: 0.5 }),
  quoinEnergy: (c, o, t, p) => {
    tone(c, o, t, { type: 'triangle', f: 600 * p.r, f2: 1800 * p.r, glide: 0.12, peak: 0.1, decay: 0.12 });
    return arp(c, o, t + 0.08, [7, 12, 19], { base: 784 * p.r, step: 0.035, peak: 0.07, decay: 0.25 }) + 0.08;
  },
  quoinCurrants: (c, o, t, p) => {
    ping(c, o, t, { f: 2349 * p.r, peak: 0.08, decay: 0.2 });
    return 0.07 + ping(c, o, t + 0.07, { f: 3136 * p.r, peak: 0.09, decay: 0.45 });
  },
  quoinMystery: (c, o, t, p) => {
    [0, 3, 6, 11].forEach((s, i) => tone(c, o, t + i * 0.06, { type: 'triangle', f: NOTE(s, 659 * p.r), peak: 0.07, decay: 0.3, vibrato: 14, vibratoRate: 7 }));
    return 0.5;
  },
  quoinFavor: (c, o, t, p) => {
    bell(c, o, t, { f: 392 * p.r, peak: 0.12, decay: 0.9, bright: 0.6 });
    return arp(c, o, t + 0.06, [12, 16, 19], { base: 392 * p.r, step: 0.06, peak: 0.05, decay: 0.5 }) + 0.06;
  },
  quoinTime: (c, o, t, p) => {
    noise(c, o, t, { f: 3500, q: 6, peak: 0.08, decay: 0.03 });
    noise(c, o, t + 0.14, { f: 2600, q: 6, peak: 0.08, decay: 0.03 });
    return 0.24 + bell(c, o, t + 0.24, { f: 1175 * p.r, peak: 0.08, decay: 0.45 });
  },
  quoinShard: (c, o, t, p) => arp(c, o, t, [0, 7, 12, 16, 19].slice(0, 2 + Math.min(3, (p.variant || 2) - 1)), { base: 698 * p.r, step: 0.04, peak: 0.06, decay: 0.3 }),
  // —— Rewards ——
  chime: (c, o, t, p) => arp(c, o, t, [0, 7, 12], { base: 659 * p.r, step: 0.07, peak: 0.08, decay: 0.45 }),
  sparkle: (c, o, t, p) => {
    for (let i = 0; i < 6; i += 1) tone(c, o, t + i * 0.035, { f: NOTE(PENTA[(i * 3 + (p.variant || 0)) % PENTA.length], 1318 * p.r), peak: 0.035, decay: 0.18 });
    return noise(c, o, t, { filter: 'highpass', f: 6000, attack: 0.05, peak: 0.02, decay: 0.25 }) + 0.2;
  },
  fanfare: (c, o, t, p) => {
    arp(c, o, t, [0, 4, 7], { base: 523 * p.r, step: 0.1, peak: 0.08, decay: 0.3, kind: 'triangle' });
    return bell(c, o, t + 0.32, { f: 1046 * p.r, peak: 0.1, decay: 1.1 }) + 0.32;
  },
  badge: (c, o, t, p) => {
    arp(c, o, t, [0, 4, 7, 12], { base: 587 * p.r, step: 0.09, peak: 0.07, decay: 0.5, kind: 'triangle' });
    bell(c, o, t + 0.36, { f: 1174 * p.r, peak: 0.1, decay: 1.2 });
    return SYNTH_RECIPES.sparkle(c, o, t + 0.4, p) + 0.4;
  },
  skill: (c, o, t, p) => arp(c, o, t, [0, 2, 4, 7, 9, 12], { base: 523 * p.r, step: 0.06, peak: 0.07, decay: 0.5 }),
  questStep: (c, o, t, p) => arp(c, o, t, [7, 12], { base: 784 * p.r, step: 0.09, peak: 0.08, decay: 0.4 }),
  emblem: (c, o, t, p) => {
    bell(c, o, t, { f: 262 * p.r, peak: 0.12, decay: 1.6, bright: 0.7 });
    bell(c, o, t + 0.12, { f: 523 * p.r, peak: 0.08, decay: 1.3 });
    return SYNTH_RECIPES.sparkle(c, o, t + 0.2, p) + 0.2;
  },
  gong: (c, o, t, p) => {
    bell(c, o, t, { f: 131 * p.r, peak: 0.14, decay: 2.2, bright: 0.9 });
    return noise(c, o, t, { filter: 'lowpass', f: 400, peak: 0.05, decay: 0.4 });
  },
  donate: (c, o, t, p) => {
    ping(c, o, t, { f: 1760 * p.r, peak: 0.05, decay: 0.15 });
    return 0.08 + bell(c, o, t + 0.08, { f: NOTE(PENTA[(p.variant || 0) * 2 % PENTA.length], 392 * p.r), peak: 0.1, decay: 0.9, bright: 0.6 });
  },
  levelUp: (c, o, t, p) => SYNTH_RECIPES.fanfare(c, o, t, p),
  // —— Tools and work ——
  pickHit: (c, o, t, p) => {
    ping(c, o, t, { f: (1500 + rand(p, 1) * 300) * p.r, peak: 0.08, decay: 0.16 });
    noise(c, o, t, { f: 3000, q: 1.5, peak: 0.08, decay: 0.03 });
    return noise(c, o, t + 0.01, { filter: 'lowpass', f: 600, peak: 0.07, decay: 0.08 });
  },
  chop: (c, o, t, p) => {
    noise(c, o, t, { f: 900 * p.r, q: 2.5, peak: 0.16, decay: 0.07 });
    return tone(c, o, t, { f: 170 * p.r, f2: 110 * p.r, peak: 0.16, decay: 0.09 });
  },
  hoeScrape: (c, o, t, p) => noise(c, o, t, { f: 700 * p.r, f2: 1400 * p.r, q: 1.2, attack: 0.03, peak: 0.1, hold: 0.06, decay: 0.12 }),
  dig: (c, o, t, p) => {
    noise(c, o, t, { filter: 'lowpass', f: 900 * p.r, attack: 0.02, peak: 0.13, decay: 0.12 });
    return tone(c, o, t, { f: 120 * p.r, f2: 80 * p.r, peak: 0.1, decay: 0.1 });
  },
  watering: (c, o, t, p) => {
    for (let i = 0; i < 9; i += 1) noise(c, o, t + i * 0.07, { f: 2500 + rand(p, i) * 2500, q: 3, peak: 0.035 + rand(p, i + 9) * 0.03, decay: 0.06, offset: i * 0.13 });
    return noise(c, o, t, { filter: 'lowpass', f: 1800, attack: 0.08, peak: 0.03, hold: 0.4, decay: 0.2 }) + 0.05;
  },
  splash: (c, o, t, p) => {
    noise(c, o, t, { filter: 'lowpass', f: 4000, f2: 500, peak: 0.14, decay: 0.35 });
    for (let i = 0; i < 4; i += 1) tone(c, o, t + 0.1 + i * 0.06, { f: (500 + rand(p, i) * 500) * p.r, f2: (900 + rand(p, i) * 700) * p.r, glide: 0.04, peak: 0.05, decay: 0.05 });
    return 0.45;
  },
  sizzle: (c, o, t, p) => {
    noise(c, o, t, { filter: 'highpass', f: 4200, attack: 0.05, peak: 0.05, hold: 0.25, decay: 0.2 });
    for (let i = 0; i < 7; i += 1) noise(c, o, t + rand(p, i) * 0.45, { f: 5000, q: 4, peak: 0.05, decay: 0.012, offset: i * 0.07 });
    return 0.5;
  },
  bubble: (c, o, t, p) => {
    for (let i = 0; i < 5; i += 1) {
      const f = (240 + rand(p, i) * 360) * p.r;
      tone(c, o, t + i * 0.09 + rand(p, i + 5) * 0.04, { f, f2: f * 1.9, glide: 0.04, peak: 0.08, decay: 0.05 });
    }
    return 0.5;
  },
  brew: (c, o, t, p) => {
    for (let i = 0; i < 4; i += 1) {
      const f = (700 + rand(p, i) * 700) * p.r;
      tone(c, o, t + i * 0.1, { f, f2: f * 1.6, glide: 0.03, peak: 0.06, decay: 0.06 });
    }
    return 0.4 + bell(c, o, t + 0.4, { f: 1568 * p.r, peak: 0.03, decay: 0.3 });
  },
  whir: (c, o, t, p) => {
    const g = envelope(c, o, t, { attack: 0.08, peak: 0.05, hold: 0.35, decay: 0.15 });
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90 * p.r, t);
    osc.frequency.linearRampToValueAtTime(140 * p.r, t + 0.3);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    osc.connect(lp);
    lp.connect(g);
    osc.start(t);
    osc.stop(t + 0.65);
    return noise(c, o, t, { f: 1800, q: 0.8, attack: 0.08, peak: 0.025, hold: 0.35, decay: 0.15 });
  },
  grind: (c, o, t, p) => {
    for (let i = 0; i < 6; i += 1) noise(c, o, t + i * 0.06, { f: 1100 * p.r, q: 3, peak: 0.07, decay: 0.04, offset: i * 0.05 });
    return 0.4;
  },
  knife: (c, o, t, p) => {
    for (let i = 0; i < 3; i += 1) {
      noise(c, o, t + i * 0.12, { f: 2400 * p.r, q: 4, peak: 0.08, decay: 0.025 });
      tone(c, o, t + i * 0.12, { f: 330 * p.r, f2: 220 * p.r, peak: 0.08, decay: 0.04 });
    }
    return 0.4;
  },
  shake: (c, o, t, p) => {
    for (let i = 0; i < 6; i += 1) noise(c, o, t + i * 0.08, { f: i % 2 ? 3200 : 2400, q: 1.5, attack: 0.015, peak: 0.07, decay: 0.05, offset: i * 0.09 });
    return 0.55;
  },
  hiss: (c, o, t) => noise(c, o, t, { filter: 'highpass', f: 2500, f2: 5000, attack: 0.06, peak: 0.06, hold: 0.2, decay: 0.25 }),
  flame: (c, o, t, p) => {
    noise(c, o, t, { filter: 'lowpass', f: 300 * p.r, f2: 900 * p.r, attack: 0.1, peak: 0.12, hold: 0.25, decay: 0.3 });
    return noise(c, o, t + 0.05, { f: 1400, q: 1, attack: 0.08, peak: 0.03, hold: 0.2, decay: 0.3 }) + 0.05;
  },
  clank: (c, o, t, p) => {
    ping(c, o, t, { f: 820 * p.r, peak: 0.08, decay: 0.3 });
    return noise(c, o, t, { f: 1600, q: 2, peak: 0.07, decay: 0.04 });
  },
  ratchet: (c, o, t, p) => {
    for (let i = 0; i < 5; i += 1) noise(c, o, t + i * 0.05, { f: 3200 * p.r, q: 5, peak: 0.08, decay: 0.015 });
    return 0.3 + ping(c, o, t + 0.3, { f: 1600 * p.r, peak: 0.05, decay: 0.2 });
  },
  hammer: (c, o, t, p) => {
    tone(c, o, t, { f: 200 * p.r, f2: 120 * p.r, peak: 0.15, decay: 0.08 });
    return noise(c, o, t, { f: 1300 * p.r, q: 2, peak: 0.1, decay: 0.05 });
  },
  sprinkle: (c, o, t, p) => {
    for (let i = 0; i < 10; i += 1) noise(c, o, t + i * 0.035 + rand(p, i) * 0.02, { filter: 'highpass', f: 5000 + rand(p, i + 3) * 3000, peak: 0.03, decay: 0.03, offset: i * 0.11 });
    return 0.25 + SYNTH_RECIPES.sparkle(c, o, t + 0.25, p);
  },
  squishSoft: (c, o, t, p) => {
    noise(c, o, t, { filter: 'lowpass', f: 1200, f2: 300, peak: 0.1, decay: 0.18 });
    return tone(c, o, t, { f: 300 * p.r, f2: 180 * p.r, peak: 0.06, decay: 0.15 });
  },
  swish: (c, o, t, p) => noise(c, o, t, { f: 600 * p.r, f2: 3000 * p.r, q: 1.5, attack: 0.05, peak: 0.08, decay: 0.12 }),
  magic: (c, o, t, p) => {
    tone(c, o, t, { type: 'triangle', f: 440 * p.r, f2: 880 * p.r, peak: 0.05, attack: 0.05, decay: 0.3, vibrato: 8 });
    return SYNTH_RECIPES.sparkle(c, o, t + 0.05, p) + 0.05;
  },
  workTick: (c, o, t, p) => noise(c, o, t, { f: 1800 * p.r, q: 3, peak: 0.06, decay: 0.03 }),
  toolBreak: (c, o, t, p) => {
    noise(c, o, t, { f: 2200, q: 1, peak: 0.16, decay: 0.06 });
    ping(c, o, t + 0.05, { f: 900 * p.r, peak: 0.06, decay: 0.2 });
    return 0.15 + tone(c, o, t + 0.15, { type: 'triangle', f: 330 * p.r, f2: 165 * p.r, peak: 0.1, decay: 0.35 });
  },
  craftDone: (c, o, t, p) => {
    ping(c, o, t, { f: 1760 * p.r, peak: 0.05, decay: 0.15 });
    return arp(c, o, t + 0.05, [0, 4, 7], { base: 784 * p.r, step: 0.06, peak: 0.07, decay: 0.4 }) + 0.05;
  },
  // —— Nature and animals ——
  oink: (c, o, t, p) => {
    const voice = (at, f) => {
      const g = envelope(c, o, at, { attack: 0.01, peak: 0.12, decay: 0.12 });
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, at);
      osc.frequency.exponentialRampToValueAtTime(f * 0.78, at + 0.12);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 3;
      osc.connect(bp);
      bp.connect(g);
      osc.start(at);
      osc.stop(at + 0.16);
    };
    voice(t, 230 * p.r);
    voice(t + 0.15, 260 * p.r);
    return 0.32;
  },
  snort: (c, o, t, p) => noise(c, o, t, { f: 500 * p.r, q: 4, attack: 0.02, peak: 0.14, decay: 0.15 }),
  cluck: (c, o, t, p) => {
    [0, 0.09, 0.2].forEach((dt, i) => tone(c, o, t + dt, { type: 'square', f: (700 + i * 120) * p.r, f2: (520 + i * 80) * p.r, peak: 0.04, decay: 0.05 }));
    return 0.3;
  },
  squawk: (c, o, t, p) => {
    tone(c, o, t, { type: 'square', f: 900 * p.r, f2: 1400 * p.r, glide: 0.08, peak: 0.045, decay: 0.12, vibrato: 30, vibratoRate: 30 });
    return 0.1 + tone(c, o, t + 0.12, { type: 'square', f: 1100 * p.r, f2: 700 * p.r, peak: 0.04, decay: 0.15 });
  },
  flutter: (c, o, t, p) => {
    for (let i = 0; i < 8; i += 1) noise(c, o, t + i * 0.035, { f: 1800 * p.r, q: 1, peak: 0.035, decay: 0.025, offset: i * 0.07 });
    return 0.3 + tone(c, o, t + 0.1, { f: 2637 * p.r, peak: 0.03, decay: 0.25, vibrato: 40, vibratoRate: 11 });
  },
  sing: (c, o, t, p) => arp(c, o, t, [0, 4, 2, 7, 9], { base: 1046 * p.r, step: 0.09, peak: 0.05, decay: 0.25, kind: 'sine' }),
  purr: (c, o, t, p) => {
    const g = envelope(c, o, t, { attack: 0.1, peak: 0.1, hold: 0.4, decay: 0.3 });
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260 * p.r;
    const am = c.createGain();
    am.gain.value = 0.5;
    const lfo = c.createOscillator();
    lfo.frequency.value = 24;
    lfo.connect(am.gain);
    src.connect(lp);
    lp.connect(am);
    am.connect(g);
    lfo.start(t);
    src.start(t);
    lfo.stop(t + 0.85);
    src.stop(t + 0.85);
    return 0.8;
  },
  mew: (c, o, t, p) => tone(c, o, t, { type: 'triangle', f: 700 * p.r, f2: 1050 * p.r, glide: 0.1, attack: 0.03, peak: 0.09, decay: 0.28 }),
  yip: (c, o, t, p) => {
    tone(c, o, t, { type: 'triangle', f: 900 * p.r, f2: 1300 * p.r, glide: 0.04, peak: 0.1, decay: 0.07 });
    return 0.1 + tone(c, o, t + 0.1, { type: 'triangle', f: 1000 * p.r, f2: 1500 * p.r, glide: 0.04, peak: 0.08, decay: 0.08 });
  },
  ribbit: (c, o, t, p) => {
    for (let i = 0; i < 2; i += 1) tone(c, o, t + i * 0.16, { type: 'sawtooth', f: 180 * p.r, f2: 260 * p.r, peak: 0.05, decay: 0.1, vibrato: 40, vibratoRate: 45 });
    return 0.3;
  },
  caw: (c, o, t, p) => {
    tone(c, o, t, { type: 'sawtooth', f: 520 * p.r, f2: 380 * p.r, attack: 0.02, peak: 0.04, decay: 0.3, vibrato: 25, vibratoRate: 35 });
    return noise(c, o, t, { f: 1400, q: 2, attack: 0.02, peak: 0.05, decay: 0.28 });
  },
  sloth: (c, o, t, p) => tone(c, o, t, { type: 'triangle', f: 160 * p.r, f2: 110 * p.r, attack: 0.15, peak: 0.12, decay: 0.6, vibrato: 4, vibratoRate: 3 }),
  rustle: (c, o, t, p) => {
    for (let i = 0; i < 5; i += 1) noise(c, o, t + i * 0.06 + rand(p, i) * 0.03, { f: 2600 + rand(p, i + 1) * 1400, q: 1.2, attack: 0.01, peak: 0.05, decay: 0.06, offset: i * 0.15 });
    return 0.4;
  },
  harvest: (c, o, t, p) => {
    SYNTH_RECIPES.rustle(c, o, t, p);
    return arp(c, o, t + 0.12, [0, 4, 7], { base: 659 * p.r, step: 0.06, peak: 0.06, decay: 0.4 }) + 0.12;
  },
  crunch: (c, o, t, p) => {
    for (let i = 0; i < 3; i += 1) noise(c, o, t + i * 0.05, { filter: 'lowpass', f: 1500 - i * 300, peak: 0.12, decay: 0.07, offset: i * 0.2 });
    return tone(c, o, t, { f: 90 * p.r, f2: 60 * p.r, peak: 0.12, decay: 0.25 });
  },
  croak: (c, o, t, p) => {
    tone(c, o, t, { type: 'triangle', f: 420 * p.r, f2: 70 * p.r, glide: 0.9, attack: 0.04, peak: 0.45, hold: 0.5, decay: 0.7 });
    return tone(c, o, t + 0.75, { f: 90, f2: 40, glide: 0.4, peak: 0.35, decay: 0.45 }) + 0.75;
  },
  squish: (c, o, t, p) => {
    noise(c, o, t, { filter: 'lowpass', f: 1800, f2: 260, peak: 0.5, decay: 0.26 });
    return tone(c, o, t, { f: 260 * p.r, f2: 90 * p.r, glide: 0.18, peak: 0.3, decay: 0.2 });
  },
  // —— Movement and travel ——
  whoosh: (c, o, t, p) => noise(c, o, t, { f: 400 * p.r, f2: 2600 * p.r, q: 1.4, attack: 0.15, peak: 0.08, decay: 0.3 }),
  teleport: (c, o, t, p) => {
    noise(c, o, t, { f: 300, f2: 4000, q: 2, attack: 0.25, peak: 0.06, decay: 0.3 });
    tone(c, o, t, { type: 'triangle', f: 220 * p.r, f2: 1760 * p.r, glide: 0.5, attack: 0.1, peak: 0.05, hold: 0.2, decay: 0.3, vibrato: 10, vibratoRate: 9 });
    return SYNTH_RECIPES.sparkle(c, o, t + 0.45, p) + 0.45;
  },
  arrive: (c, o, t, p) => {
    noise(c, o, t, { f: 3000, f2: 500, q: 1.5, attack: 0.05, peak: 0.05, decay: 0.3 });
    return bell(c, o, t + 0.15, { f: 784 * p.r, peak: 0.06, decay: 0.5 }) + 0.15;
  },
  doorOpen: (c, o, t, p) => {
    const g = envelope(c, o, t, { attack: 0.05, peak: 0.05, hold: 0.25, decay: 0.15 });
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240 * p.r, t);
    osc.frequency.linearRampToValueAtTime(330 * p.r, t + 0.18);
    osc.frequency.linearRampToValueAtTime(280 * p.r, t + 0.42);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 6;
    osc.connect(bp);
    bp.connect(g);
    osc.start(t);
    osc.stop(t + 0.5);
    noise(c, o, t, { f: 1800, q: 3, peak: 0.06, decay: 0.03 }); // latch click
    return 0.48;
  },
  doorClose: (c, o, t, p) => {
    tone(c, o, t, { f: 150 * p.r, f2: 80 * p.r, peak: 0.18, decay: 0.12 });
    noise(c, o, t, { filter: 'lowpass', f: 900, peak: 0.1, decay: 0.08 });
    return 0.08 + noise(c, o, t + 0.08, { f: 2500, q: 4, peak: 0.05, decay: 0.03 });
  },
  step: (c, o, t, p) => noise(c, o, t, { filter: 'lowpass', f: (500 + rand(p, 2) * 300) * p.r, peak: 0.08, decay: 0.04 }),
  jump: (c, o, t, p) => tone(c, o, t, { type: 'triangle', f: 300 * p.r, f2: 620 * p.r, glide: 0.1, peak: 0.07, decay: 0.12 }),
  elevator: (c, o, t, p) => {
    bell(c, o, t, { f: 1318 * p.r, peak: 0.07, decay: 0.6 });
    return bell(c, o, t + 0.25, { f: 1046 * p.r, peak: 0.07, decay: 0.8 }) + 0.25;
  },
  train: (c, o, t, p) => {
    noise(c, o, t, { filter: 'lowpass', f: 200, attack: 0.3, peak: 0.12, hold: 0.6, decay: 0.6 });
    for (let i = 0; i < 6; i += 1) noise(c, o, t + 0.2 + i * 0.22, { f: 900, q: 3, peak: 0.04, decay: 0.03 });
    return 1.6;
  },
  // —— Events ——
  beep: (c, o, t, p) => tone(c, o, t, { type: 'triangle', f: 660 * p.r, peak: 0.12, hold: 0.08, decay: 0.08 }),
  go: (c, o, t, p) => tone(c, o, t, { type: 'triangle', f: 1320 * p.r, peak: 0.13, hold: 0.18, decay: 0.15 }),
  win: (c, o, t, p) => {
    arp(c, o, t, [0, 4, 7, 12, 16], { base: 523 * p.r, step: 0.08, peak: 0.07, decay: 0.4, kind: 'triangle' });
    return bell(c, o, t + 0.42, { f: 1046 * p.r, peak: 0.1, decay: 1 }) + 0.42;
  },
  lose: (c, o, t, p) => {
    [0, -1, -2].forEach((s, i) => tone(c, o, t + i * 0.22, { type: 'triangle', f: NOTE(s, 392 * p.r), peak: 0.1, decay: 0.2 }));
    return 0.66 + tone(c, o, t + 0.66, { type: 'triangle', f: NOTE(-3, 392 * p.r), f2: NOTE(-5, 392 * p.r), peak: 0.1, decay: 0.6, vibrato: 6, vibratoRate: 5 });
  },
  heartbeat: (c, o, t, p) => {
    tone(c, o, t, { f: 70 * p.r, f2: 50 * p.r, peak: 0.25, decay: 0.12 });
    return 0.18 + tone(c, o, t + 0.18, { f: 65 * p.r, f2: 45 * p.r, peak: 0.18, decay: 0.15 });
  },
  sneeze: (c, o, t, p) => {
    tone(c, o, t, { type: 'triangle', f: 500 * p.r, f2: 900 * p.r, attack: 0.25, peak: 0.05, decay: 0.05 });
    return 0.3 + noise(c, o, t + 0.3, { f: 2500, f2: 900, q: 0.7, peak: 0.16, decay: 0.22 });
  },
  kiss: (c, o, t, p) => {
    noise(c, o, t, { f: 2200 * p.r, q: 3, peak: 0.12, decay: 0.03 });
    return tone(c, o, t, { f: 1400 * p.r, f2: 2200 * p.r, glide: 0.04, peak: 0.06, decay: 0.06 });
  },
  hug: (c, o, t, p) => {
    tone(c, o, t, { type: 'triangle', f: 330 * p.r, f2: 262 * p.r, attack: 0.06, peak: 0.08, decay: 0.3 });
    return bell(c, o, t + 0.12, { f: 784 * p.r, peak: 0.05, decay: 0.5, bright: 0.4 }) + 0.12;
  },
  fireworks: (c, o, t, p) => {
    tone(c, o, t, { type: 'sine', f: 500, f2: 1600, glide: 0.5, attack: 0.05, peak: 0.03, decay: 0.45 });
    noise(c, o, t + 0.55, { filter: 'lowpass', f: 2000, f2: 400, peak: 0.12, decay: 0.4 });
    return SYNTH_RECIPES.sparkle(c, o, t + 0.6, p) + 0.6;
  },
  horrible: (c, o, t, p) => {
    tone(c, o, t, { type: 'sawtooth', f: 155 * p.r, peak: 0.035, attack: 0.04, hold: 0.25, decay: 0.2 });
    return tone(c, o, t, { type: 'sawtooth', f: 164 * p.r, peak: 0.035, attack: 0.04, hold: 0.25, decay: 0.2 });
  },
  grow: (c, o, t, p) => tone(c, o, t, { type: 'triangle', f: 220 * p.r, f2: 660 * p.r, glide: 0.4, attack: 0.05, peak: 0.07, decay: 0.4, vibrato: 6 }),
  shrink: (c, o, t, p) => tone(c, o, t, { type: 'triangle', f: 660 * p.r, f2: 220 * p.r, glide: 0.4, attack: 0.05, peak: 0.07, decay: 0.4, vibrato: 6 }),
  rain: (c, o, t, p) => {
    noise(c, o, t, { filter: 'lowpass', f: 2500, attack: 0.4, peak: 0.05, hold: 1, decay: 0.6 });
    for (let i = 0; i < 14; i += 1) noise(c, o, t + rand(p, i) * 1.8, { f: 3000 + rand(p, i + 20) * 3000, q: 5, peak: 0.03, decay: 0.02, offset: i * 0.08 });
    return 2;
  },
  soft: (c, o, t, p) => tone(c, o, t, { type: 'triangle', f: 660 * p.r, f2: 880 * p.r, peak: 0.08, decay: 0.12 }),
  ...PIANO_RECIPES,
});

/** Explicit key → recipe choices. Pattern rules below cover the rest. */
const KEY_RECIPES = {
  ...PIANO_KEY_RECIPES,
  CLICK_SUCCESS: 'click',
  CLICK_FAILURE: 'clickFail',
  UI_TOGGLE: 'toggle',
  UI_PANEL_OPEN: 'panelOpen',
  UI_PANEL_CLOSE: 'panelClose',
  VERB_MENU_OPEN: 'soft',
  QUEST_DIALOGUE_BOX: 'panelOpen',
  QUEST_DIALOGUE_BOX_CLOSE: 'panelClose',
  IMAGINATION_OPEN: 'panelOpen',
  IMAGINATION_CLOSE: 'panelClose',
  OPEN_HUB_MAP: 'mapOpen',
  CLOSE_HUB_MAP: 'mapClose',
  FLIP_BACK: 'cardFlip',
  FLIP_OVER: 'cardFlip',
  HAND_SWIPE: 'swish',
  HAND_PULL_DOWN: 'swish',
  CAMERA_SHUTTER: 'shutter',
  CAMERA_WIND: 'ratchet',
  INCOMING_CHAT: 'chat',
  INCOMING_CHAT_NEW: 'chat',
  TRADE_COMPLETED: 'coin',
  ITEM_PICKUP: 'pop',
  ITEM_DROP: 'drop',
  ITEM_GIVE: 'give',
  ITEM_GIVEN_TO_YOU: 'give',
  PACK_FULL: 'packFull',
  PURCHASE_ITEM: 'purchase',
  VENDOR_SELL: 'sell',
  PAY_50_CURRANTS: 'coin',
  PAY_FIFTY_CURRANTS: 'coin',
  ITEM_EAT: 'munch',
  ITEM_DRINK: 'gulp',
  BURP: 'burp',
  QUOIN_GOT: 'quoinXp',
  QUOIN_XP: 'quoinXp',
  QUOIN_MOOD: 'quoinMood',
  QUOIN_ENERGY: 'quoinEnergy',
  QUOIN_CURRANTS: 'quoinCurrants',
  QUOIN_MYSTERY: 'quoinMystery',
  QUOIN_FAVOR: 'quoinFavor',
  QUOIN_TIME: 'quoinTime',
  QUORAZY_QUOIN: 'sparkle',
  QUEST_COMPLETE: 'fanfare',
  QUEST_ADDED: 'questStep',
  QUEST_OFFER: 'questStep',
  QUEST_ACCEPT: 'chime',
  COMPLETE_QUEST_REQUIREMENT: 'questStep',
  LEVEL_UP: 'levelUp',
  ACHIEVEMENT_UNLOCKED: 'badge',
  BADGE_FANFARE: 'badge',
  TROPHY_RECEIVED: 'badge',
  SKILL_ACHIEVED: 'skill',
  BEGIN_LEARNING_SKILL: 'questStep',
  DISCOVER_USEFUL_NEW_ITEM: 'chime',
  DONATE_TO_SHRINE: 'donate',
  DONATION_1ST_TIER: 'donate',
  DONATION_2ND_TIER: 'donate',
  DONATION_3RD_TIER: 'donate',
  DONATION_4TH_TIER: 'emblem',
  DONATION_RECIEVE_EMBLEM: 'emblem',
  SHRINE_EMBLEM: 'emblem',
  GONG_GIANTS: 'gong',
  ICON_GIANT_LOVE: 'emblem',
  NEWDAY: 'fanfare',
  PET_PIGGY: 'oink',
  NIBBLE_PIGGY: 'munch',
  FEED_PIGGY: 'oink',
  RECEIVE_MEAT_FROM_PIGGY: 'drop',
  PIGGY_SCOFFS: 'snort',
  PIGGY_PLOP: 'drop',
  CHICKEN_SQUEEZED: 'squawk',
  HAPPY_CHICKEN: 'cluck',
  BUTTERFLY_SING: 'sing',
  PET_TRANT: 'rustle',
  HARVEST: 'harvest',
  RAINBOW_SUPERHARVEST: 'sparkle',
  WATERING_CAN: 'watering',
  IRRIGATOR_9000: 'watering',
  HOE: 'hoeScrape',
  HIGH_CLASS_HOE: 'hoeScrape',
  GARDEN_PLANT: 'dig',
  GARDEN_CLEAR: 'hoeScrape',
  SHOVEL: 'dig',
  ACE_OF_SPADES: 'dig',
  PICK: 'pickHit',
  FANCY_PICK: 'pickHit',
  MINE_HIT: 'pickHit',
  PETRIFIED_ROCK: 'crunch',
  HATCHET: 'chop',
  CLASS_AXE: 'chop',
  CLASSIC_AXE: 'chop',
  CHOP_HIT: 'chop',
  TOOL_BREAKS: 'toolBreak',
  TINKERTOOL: 'ratchet',
  FRYING_PAN: 'sizzle',
  MIKE_TYSON_GRILL: 'sizzle',
  SAUCEPAN: 'bubble',
  AWESOME_POT: 'bubble',
  CAULDRON: 'bubble',
  MAKING_WAITING_COOKING: 'bubble',
  BEAKER: 'brew',
  TEST_TUBE: 'brew',
  TINCTURING_KIT: 'brew',
  ALCHEMICAL_TONGS: 'clank',
  BLENDER: 'whir',
  FRUIT_CHANGING_MACHINE: 'whir',
  LOOMER: 'whir',
  SPINDLE: 'whir',
  SPLENDID_SPINDLE: 'whir',
  ORE_GRINDER: 'grind',
  GRAND_OL_GRINDER: 'grind',
  SPICE_MILL: 'grind',
  KNIFE_AND_BOARD: 'knife',
  COCKTAIL_SHAKER: 'shake',
  GASSIFIER: 'hiss',
  BUBBLE_TUNER: 'bubble',
  SMELTER: 'flame',
  CONSTRUCTION_TOOL: 'hammer',
  SCRAPER: 'hoeScrape',
  SUPER_SCRAPER: 'hoeScrape',
  BUTTERFLY_LOTION: 'squishSoft',
  BUTTERFLY_NET: 'swish',
  FOX_BRUSH: 'swish',
  FOX_BRUSH_HIT: 'swish',
  FOX_BRUSH_MISS: 'clickFail',
  QUILL: 'swish',
  CRYSTALLIZER: 'sparkle',
  FOCUSING_ORB: 'magic',
  DUSTY_STICK: 'magic',
  SPIGOT: 'splash',
  BEAN_SEASONER: 'sprinkle',
  EGG_SEASONER: 'sprinkle',
  RANDOM_KINDNESS: 'chime',
  CRAFT_DONE: 'craftDone',
  CRAFT_TICK: 'workTick',
  CRAFTING_RESULT_NOTHING: 'clickFail',
  COLLECT: 'craftDone',
  STILL_COLLECT: 'craftDone',
  STILL_READY: 'chime',
  DOOR_OPEN: 'doorOpen',
  DOOR_CREAK: 'doorOpen',
  DOOR_CLOSE: 'doorClose',
  ELEVATOR_OPENS: 'elevator',
  SUBWAY_BUTTON: 'click',
  TRAIN_ARRIVES: 'train',
  TRAIN_DEPARTS: 'train',
  TRAVELLING_TRAIN: 'train',
  SIGNPOST_TRAVEL: 'whoosh',
  TELEPORT_AWAY: 'teleport',
  TELEPORT_AWAY_HUB: 'teleport',
  TELEPORT_ARRIVE: 'arrive',
  ACTIVATE_GAME_TELEPORTER: 'teleport',
  TELEPORTER_VISIBLE_APPEAR: 'arrive',
  TELEPORTER_VISIBLE_DISAPPEARS: 'whoosh',
  TELEPORTER_VISIBLE_PORTAL: 'magic',
  STREET_LOADED: 'arrive',
  FOOTSTEP: 'step',
  JUMP: 'jump',
  SPINACHJUMP: 'jump',
  COUNT_DOWN: 'beep',
  GAME_STARTING_SOON: 'beep',
  READY: 'go',
  YOU_WIN: 'win',
  YOU_TAKE_CROWN: 'win',
  YOU_LOSE: 'lose',
  YOU_LOSE_CROWN: 'lose',
  CROWN_CHANGES_HANDS: 'gong',
  HEARTBEAT: 'heartbeat',
  SNEEZING_AHCHOO: 'sneeze',
  KISS_RECV: 'kiss',
  KISS_SEND: 'kiss',
  EMO_BEAR_HUG: 'hug',
  EMOTIONAL_BEAR_HIGH_5: 'kiss',
  LONELINESS_FIREWORKS: 'fireworks',
  GLITCHMAS_CRACKER: 'fireworks',
  HORRIBLE_SOUND: 'horrible',
  MEDITATION_SUCCESS: 'chime',
  BIGENNIFY: 'grow',
  SMALLIFY: 'shrink',
  JUJU_BANDIT_SHRINK: 'shrink',
  JUJU_BANDIT_SPAWN: 'magic',
  EFFECT_MILD: 'sparkle',
  EFFECT_EXTREME: 'magic',
  CROAK: 'croak',
  SQUISH_GRAPES: 'squish',
  ROOK_CAW: 'caw',
  RAINBOW_FULLYREVIVED: 'sparkle',
  RAIN: 'rain',
  FOX_YIP: 'yip',
  FOX_BAIT: 'pop',
  FOX_BAIT_LAND: 'drop',
  FOX_EAT: 'munch',
  KITTY_MEW: 'mew',
  FLYING_KITTY_MEW: 'mew',
  FLYING_KITTY_PURR: 'purr',
  NEIGHBOUR_WAVE: 'chime',
  HAS_MAIL: 'chime',
  INTERACT_MAILBOX: 'doorOpen',
  MAILBOX_ALL_DONE: 'questStep',
  PACKAGE_SENT: 'whoosh',
  CONFIRM_DELIVERY: 'chime',
  SLOTH_KNOCKER: 'hammer',
  SLOTH_EAT: 'munch',
  SLOTH_SPIT: 'splash',
  SLOTH_PEAK_AND_SPIT: 'splash',
  SALMON_CATCH: 'splash',
  SALMON_RELEASE: 'splash',
  BARNACLE_IS_RELEASED: 'pop',
  SCOOPED_JELLISAC: 'squishSoft',
  DUST_TRAP_SMACK_DOWN: 'hammer',
  DUST_TRAP_UP: 'ratchet',
  CRUSHER_COLLISION: 'doorClose',
  CRUSHER_IMPACT: 'crunch',
  CUBIMAL_WIND_UP: 'ratchet',
  CUBIMAL_WIND_DOWN: 'ratchet',
  CUBIMAL_RACE: 'whir',
  PROTO_PUFF: 'pop',
  POTION_GENERIC: 'gulp',
  HI_FLOWERS: 'swish',
  HI_FLOWERS_2X: 'swish',
  HI_FLOWERS_HIT: 'sparkle',
  CHAIN_PULL: 'ratchet',
  ICE_CUBE: 'clank',
  ANIMAL_STICK: 'pop',
};

/** Ordered name-pattern rules for keys without an explicit choice. */
const PATTERN_RECIPES = [
  [/^CLOUD\d$/, 'cloud'],
  [/^CARD_DEAL/, 'cardFlip'],
  [/^QUOIN_SHARD_/, 'quoinShard'],
  [/^RAINBOW_/, 'sparkle'],
  [/^DONATION_/, 'donate'],
  [/FROG/, 'ribbit'],
  [/PIGGY|PIG_/, 'oink'],
  [/CHICKEN/, 'cluck'],
  [/BUTTERFLY/, 'flutter'],
  [/KITTY|CAT_/, 'mew'],
  [/FOX/, 'yip'],
  [/ROOK/, 'caw'],
  [/SLOTH/, 'sloth'],
  [/_TREE$/, 'rustle'],
  [/^POTION_/, 'brew'],
  [/POWDER|FERTILIDUST/, 'sprinkle'],
  [/^(CHASSIS|ENGINE|PLATES|STAND|FUELMAKER)/, 'clank'],
  [/^CRAFTYBOT/, 'whir'],
  [/TELEPORT/, 'teleport'],
  [/DOOR/, 'doorOpen'],
  [/TRAIN|SUBWAY/, 'train'],
  [/BUTLER|DOLL/, 'soft'],
  [/SMUGGL|DEIMAGINATOR/, 'whoosh'],
  [/WIN$/, 'win'],
  [/LOSE/, 'lose'],
];

const CATEGORY_RECIPES = {
  ui: 'click',
  item: 'pop',
  quoin: 'quoinXp',
  reward: 'chime',
  making: 'workTick',
  tool: 'workTick',
  animal: 'soft',
  nature: 'rustle',
  travel: 'whoosh',
  powder: 'sprinkle',
  event: 'soft',
  remake: 'soft',
  recovered: 'soft',
  downloads: 'chime',
};

/**
 * Pick a synth recipe for a key. Music keys (category 'music') and voice lines
 * return null: a synthesized stand-in for a song or a person would mislead.
 * @param {string} key
 * @param {string} [category]
 * @returns {string|null}
 */
export function recipeForKey(key, category = '') {
  const k = String(key || '');
  if (KEY_RECIPES[k]) return KEY_RECIPES[k];
  if (category === 'music' || category === 'voice' || /^STEWARTDOLL|^MUSICBLOCK_/.test(k)) return null;
  for (const [re, name] of PATTERN_RECIPES) if (re.test(k)) return name;
  return CATEGORY_RECIPES[category] || 'soft';
}

/** Every recipe name, for tests and the sound test page. */
export const SYNTH_RECIPE_NAMES = Object.freeze(Object.keys(SYNTH_RECIPES));

/** Explicit recipe table, for tests. */
export const SYNTH_KEY_RECIPES = Object.freeze({ ...KEY_RECIPES });

/**
 * Schedule a recipe on `destination`. Returns its length in seconds (0 when
 * the recipe is unknown).
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} destination
 * @param {string} name
 * @param {SynthOpts} [opts]
 */
export function playSynthRecipe(ctx, destination, name, opts = {}) {
  const recipe = SYNTH_RECIPES[name];
  if (!ctx || !destination || !recipe) return 0;
  const out = ctx.createGain();
  out.gain.value = Math.max(0, Math.min(2, opts.volume ?? 1));
  out.connect(destination);
  const t0 = ctx.currentTime + 0.005;
  const params = { ...opts, r: Math.max(0.25, Math.min(4, opts.rate ?? 1)) };
  const seconds = recipe(ctx, out, t0, params) || 0;
  setTimeout(() => {
    try { out.disconnect(); } catch { /* already gone */ }
  }, Math.ceil((seconds + 0.4) * 1000));
  return seconds;
}
