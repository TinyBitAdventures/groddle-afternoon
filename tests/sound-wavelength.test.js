/**
 * Austin's Wavelength takes (2026-11-01): 66 round-one picks over their synth recipes, 69 recipes
 * kept, burp/sneeze/fireworks redone. Takes ship round by round as Austin picks them
 * (tools/sound/wavelength-sfx/takes.json `rounds`), and only when every sound source their job
 * plays may ship in a public repo (`sources`). Files, provenance and the runtime table come from
 * tools/sound/install-wavelength-sfx.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SYNTH_RECIPE_NAMES, SYNTH_RECIPES } from '../public/js/synth-sfx.js?v=9853c8e7';
import { WAVELENGTH_TAKES } from '../public/js/wavelength-sfx.js?v=fd2ceb4b';
import { createSoundBoard, resolveSound } from '../public/js/sound-board.js?v=7da54812';
import { jobSources, roundPicks, tableSource } from '../tools/sound/install-wavelength-sfx.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const CONFIG = JSON.parse(readFileSync(join(root, 'tools/sound/wavelength-sfx/takes.json'), 'utf8'));
const PROV = JSON.parse(readFileSync(join(pub, 'assets/audio/sfx/wavelength/provenance.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(pub, 'assets/content/sound-keys.json'), 'utf8'));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Web Audio stand-in that records voice gains and buffer rates. */
function fakeContext() {
  const param = (value = 0) => ({ value, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
  const made = { gains: [], sources: [], osc: 0 };
  return {
    currentTime: 0,
    sampleRate: 8000,
    made,
    createGain() { const g = node({ gain: param(1) }); made.gains.push(g); return g; },
    createOscillator() { made.osc += 1; return node({ type: 'sine', frequency: param(), detune: param(), start() {}, stop() {} }); },
    createBiquadFilter() { return node({ type: 'lowpass', frequency: param(), Q: param() }); },
    createBufferSource() { const s = node({ buffer: null, loop: false, playbackRate: param(1), start() {}, stop() {}, onended: null }); made.sources.push(s); return s; },
    createBuffer(channels, length) { const data = new Float32Array(length); return { duration: length / 8000, getChannelData: () => data }; },
    decodeAudioData: async () => ({ duration: 0.6 }),
  };
}

function board({ ok = true, takes, delay = 0 } = {}) {
  const ctx = fakeContext();
  const played = [];
  const fetched = [];
  const b = createSoundBoard({
    getContext: () => ctx,
    getDestination: () => ctx.createGain(),
    onPlayed: (last) => played.push(last),
    ...(takes ? { takes } : {}),
    fetchImpl: async (url) => {
      fetched.push(url);
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return { ok, arrayBuffer: async () => new ArrayBuffer(8) };
    },
  });
  return { ctx, b, played, fetched };
}

const shipped = Object.keys(PROV.takes);
const held = Object.keys(PROV.held || {});
const STARS = [...Array.from({ length: 19 }, (_, i) => `littleStar${i + 1}`), ...Array.from({ length: 12 }, (_, i) => `bigStar${i + 1}`)];

describe('Wavelength takes: what ships', () => {
  it('ships what Austin picked round by round; the kept recipes and burp keep their synth', () => {
    assert.equal(CONFIG.roundOnePicks.length, 66);
    assert.deepEqual(CONFIG.redo, ['burp', 'sneeze', 'fireworks']);
    assert.equal(SYNTH_RECIPE_NAMES.length, 138);
    const kept = SYNTH_RECIPE_NAMES.filter((r) => !CONFIG.roundOnePicks.includes(r) && !CONFIG.redo.includes(r));
    assert.equal(kept.length, 69);
    for (const r of [...kept, 'burp']) {
      assert.ok(!WAVELENGTH_TAKES[r], `${r} must keep its synth recipe`);
      assert.ok(!PROV.takes[r], r);
    }
    // Clean-licence round (2026-11-01): the whole star melody, coin, chime, craftDone, magic.
    const clean = CONFIG.rounds.find((r) => r.id === 'clean');
    assert.deepEqual([...clean.picks].sort(), [...STARS, 'coin', 'chime', 'craftDone', 'magic'].sort());
    // Redo round: sneeze take a, fireworks take b; burp still open.
    assert.deepEqual(CONFIG.rounds.find((r) => r.id === 'redo').picks, { sneeze: 'a', fireworks: 'b' });
    for (const r of [...clean.picks, 'sneeze', 'fireworks']) assert.equal(PROV.takes[r]?.round, r === 'sneeze' || r === 'fireworks' ? 'redo' : 'clean', r);
    assert.equal(PROV.takes.sneeze.take, 'a');
    assert.equal(PROV.takes.fireworks.take, 'b');
    // Every pick of every round ships or is held with what blocks it; nothing else ships.
    const picked = new Set(CONFIG.rounds.flatMap((r) => roundPicks(r).map(([recipe]) => recipe)));
    assert.deepEqual([...shipped, ...held].sort(), [...picked].sort());
    for (const r of shipped) assert.ok(CONFIG.roundOnePicks.includes(r) || CONFIG.redo.includes(r), r);
    for (const r of held) {
      assert.ok(!WAVELENGTH_TAKES[r], `${r} is held`);
      assert.ok(PROV.held[r].blockedBy.length > 0, r);
      for (const id of PROV.held[r].blockedBy) assert.equal(PROV.sources[id].ship, false, `${r}: ${id}`);
    }
  });

  it('the star notes sit where the synth melody sat: each note matched, and one group that loads together', () => {
    for (const r of STARS) {
      const row = PROV.takes[r];
      assert.ok(row, r);
      // gain + the take's loudness lands on the synth note's own loudness (within the peak cap).
      assert.ok(Math.abs(row.lufs + row.gainDb - row.recipeLufs) <= 0.1, `${r}: ${row.lufs} + ${row.gainDb} vs ${row.recipeLufs}`);
    }
    const little = STARS.filter((r) => r.startsWith('little'));
    for (const r of little) assert.equal(WAVELENGTH_TAKES[r].group, 'littleStars', r);
    const levels = little.map((r) => PROV.takes[r].recipeLufs);
    assert.ok(Math.max(...levels) - Math.min(...levels) < 3, 'the synth melody is even, so the takes are too');
    const feature = readFileSync(join(pub, 'js/features/puzzle-scenes-feature.js'), 'utf8');
    assert.match(feature, /if \(id === 'constellation'\) engine\.preloadSounds\?\.\(CONSTELLATION_SOUNDS\)/);
  });

  it('every shipped take has its file, bytes, job and provenance, and plays only clear-licence sources', () => {
    const notice = join(pub, 'assets/audio/sfx/wavelength/MuseScore_General_License.md');
    for (const [recipe, row] of Object.entries(PROV.takes)) {
      assert.ok(SYNTH_RECIPES[recipe], recipe);
      assert.equal(row.file, `assets/audio/sfx/wavelength/${recipe}.mp3`);
      const bytes = readFileSync(join(pub, row.file));
      assert.equal(sha256(bytes), row.sha256, `${row.file}: not the bytes its provenance names`);
      assert.equal(bytes.length, row.bytes);
      assert.ok(bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0, `${recipe}: MPEG frame, no tags`);
      // MPEG-1 layer III, 96 kbps (index 7), 44.1 kHz, mono (channel mode 3).
      assert.equal(bytes[2] >> 4, 7, `${recipe}: 96 kbps`);
      assert.equal((bytes[2] >> 2) & 3, 0, `${recipe}: 44.1 kHz`);
      assert.equal(bytes[3] >> 6, 3, `${recipe}: mono`);
      assert.ok(bytes.length < 40 * 1024, `${recipe}: ${bytes.length} B`);
      assert.ok(row.seconds > 0.05 && row.seconds < 2.5, `${recipe}: ${row.seconds}s`);
      assert.equal(row.author, 'Austin Ginder');
      assert.equal(row.rendered, '2026-11-01');
      assert.match(row.licence, /^own-work(\+MIT)?$/);
      const job = JSON.parse(readFileSync(join(root, row.job), 'utf8'));
      assert.deepEqual(jobSources(job), row.instruments, `${recipe}: job and provenance name the same sources`);
      for (const id of row.instruments) {
        assert.equal(PROV.sources[id]?.ship, true, `${recipe}: ${id}`);
        assert.ok(['own-work', 'MIT'].includes(PROV.sources[id].licence), id);
      }
      if (row.instruments.includes('soundfont:MuseScore_General')) {
        assert.equal(row.licence, 'own-work+MIT');
        assert.equal(row.notice, 'assets/audio/sfx/wavelength/MuseScore_General_License.md');
      }
      assert.ok(Number.isFinite(row.gainDb) && row.gainDb <= -row.peak + 0.05, `${recipe}: gain ${row.gainDb}`);
      assert.equal(row.gainDb, Math.round(Math.min(row.recipeLufs - row.lufs, -row.peak) * 10) / 10, `${recipe}: gain matches the recipe's loudness`);
    }
    assert.ok(existsSync(notice));
    assert.match(readFileSync(notice, 'utf8'), /Frank Wen[\s\S]*Michael Cowgill[\s\S]*S\. Christian Collins[\s\S]*MIT/);
    const files = readdirSync(join(pub, 'assets/audio/sfx/wavelength')).filter((f) => f.endsWith('.mp3'));
    assert.deepEqual(files.map((f) => f.slice(0, -4)).sort(), [...shipped].sort(), 'no file without a provenance row');
    const jobs = readdirSync(join(root, 'tools/sound/wavelength-sfx/jobs')).map((f) => f.replace(/\.json$/, ''));
    assert.deepEqual(jobs.sort(), [...shipped].sort());
  });

  it('the runtime table is the provenance, and the keys listed are the keys that play each take', () => {
    assert.equal(readFileSync(join(pub, 'js/wavelength-sfx.js'), 'utf8'), tableSource(PROV));
    for (const [recipe, row] of Object.entries(PROV.takes)) {
      assert.equal(WAVELENGTH_TAKES[recipe].file, row.file);
      for (const key of row.keys) {
        const r = resolveSound(key);
        assert.equal(r.file, null, key);
        assert.equal(r.recipe, recipe, key);
        assert.equal(r.take, WAVELENGTH_TAKES[recipe], key);
      }
      // A key with a Tiny Speck recording keeps it; the take never replaces a recording.
      for (const key of row.recordingKeys) {
        const r = resolveSound(key);
        assert.ok(r.file, key);
        assert.equal(r.take, null, key);
      }
    }
    for (const key of Object.keys(catalog.keys)) {
      const r = resolveSound(key);
      if (r.take) assert.ok(PROV.takes[r.recipe].keys.includes(key), `${key} plays ${r.recipe}'s take but is not listed`);
    }
    // Heard today: a trade, mail and quest chimes, crafting, the Focusing Orb, the constellation's stars.
    for (const key of ['TRADE_COMPLETED', 'HAS_MAIL', 'QUEST_ACCEPT', 'COLLECT', 'CRAFT_DONE', 'FOCUSING_ORB', 'LITTLE_STAR_1', 'LITTLE_STAR_19', 'BIG_STAR_3']) {
      assert.ok(resolveSound(key).take, key);
    }
  });
});

describe('Wavelength takes: playing', () => {
  it('a warm take plays its file at the recipe loudness, with the caller volume and rate', async () => {
    const { ctx, b, played } = board();
    await b.preload(['TRADE_COMPLETED']);
    const handle = b.play('TRADE_COMPLETED', { volume: 0.5, rate: 1.25 });
    assert.equal(handle.kind, 'wavelength');
    assert.equal(handle.recipe, 'coin');
    assert.equal(played.at(-1), 'TRADE_COMPLETED:wavelength:coin');
    const voice = ctx.made.gains.at(-1);
    assert.ok(Math.abs(voice.gain.value - 0.5 * 10 ** (WAVELENGTH_TAKES.coin.gainDb / 20)) < 1e-9);
    assert.equal(ctx.made.sources.at(-1).playbackRate.value, 1.25);
    assert.equal(b.stats.take, 1);
    assert.equal(b.stats.synth, 0);
  });

  it('a take whose recipe varied per play keeps a small seeded spread', async () => {
    const { ctx, b } = board({ takes: { coin: { ...WAVELENGTH_TAKES.coin, vary: 0.04 } } });
    await b.preload(['TRADE_COMPLETED']);
    const rates = [1, 2, 3, 4, 5].map((seed) => {
      b.play('TRADE_COMPLETED', { seed, allowMultiple: true });
      return ctx.made.sources.at(-1).playbackRate.value;
    });
    for (const r of rates) assert.ok(Math.abs(r - 1) <= 0.04 + 1e-9, String(r));
    assert.ok(new Set(rates).size > 1);
    for (const [r, row] of Object.entries(WAVELENGTH_TAKES)) if (row.vary) assert.ok(CONFIG.vary[r] === row.vary, r);
  });

  it('the synth recipe covers a cold take, and plays at once when the file fails', async () => {
    const failing = board({ ok: false });
    const handle = failing.b.play('HAS_MAIL');
    assert.equal(handle.kind, 'loading');
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(failing.played.at(-1), 'HAS_MAIL:synth:chime', 'failed file: the recipe plays without waiting');
    assert.equal(failing.b.play('HAS_MAIL', { allowMultiple: true }).kind, 'synth', 'a known failure goes straight to the recipe');
    const slow = board({ delay: 500 });
    slow.b.play('CRAFT_DONE');
    await new Promise((r) => setTimeout(r, 420));
    assert.equal(slow.played.at(-1), 'CRAFT_DONE:synth:craftDone', 'a slow file: the recipe after 350 ms');
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(slow.played.length, 1, 'the late file does not play on top');
    assert.equal(slow.b.play('CRAFT_DONE', { allowMultiple: true }).kind, 'wavelength', 'warm next time');
    const quick = board({ delay: 5 });
    quick.b.play('FOCUSING_ORB');
    await new Promise((r) => setTimeout(r, 400));
    assert.deepEqual(quick.played, ['FOCUSING_ORB:wavelength:magic']);
  });

  it('opts.synth and kept or redo recipes still play the recipe', async () => {
    const { b } = board();
    await b.preload(['TRADE_COMPLETED']);
    assert.equal(b.play('TRADE_COMPLETED', { synth: true }).kind, 'synth');
    for (const key of ['FOX_YIP', 'CRAFT_TICK', 'CHOP_HIT', 'UI_PANEL_OPEN', 'HEARTBEAT', 'PACK_FULL']) {
      const r = resolveSound(key);
      assert.equal(r.take, null, key);
      assert.equal(b.play(key).kind, 'synth', key);
    }
  });

  it('an action loop re-fires a take like its recipe instead of looping the one-shot', async () => {
    const { b, played } = board();
    await b.preload(['CRAFT_DONE']);
    const loop = b.loop('CRAFT_DONE', { intervalMs: 30 });
    await new Promise((r) => setTimeout(r, 75));
    loop.stop();
    const hits = played.filter((p) => p === 'CRAFT_DONE:wavelength:craftDone');
    assert.ok(hits.length >= 2, played.join(','));
  });

  it('a take in a group warms the whole group when one of them is first asked for', () => {
    const takes = {
      littleStar1: { file: 'stars/1.mp3', gainDb: -6, group: 'stars' },
      littleStar2: { file: 'stars/2.mp3', gainDb: -6, group: 'stars' },
      bigStar1: { file: 'stars/b1.mp3', gainDb: -6, group: 'stars' },
      chime: { file: 'chime.mp3', gainDb: -6 },
    };
    const { b, fetched } = board({ takes });
    assert.equal(b.play('LITTLE_STAR_1').kind, 'loading');
    assert.deepEqual([...fetched].sort(), ['stars/1.mp3', 'stars/2.mp3', 'stars/b1.mp3']);
  });
});
