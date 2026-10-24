import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOUND_ALIASES, SOUND_FILES, SOUND_KEY_COUNTS } from '../public/js/sound-keys.js';
import {
  SYNTH_KEY_RECIPES,
  SYNTH_RECIPE_NAMES,
  SYNTH_RECIPES,
  playSynthRecipe,
  recipeForKey,
} from '../public/js/synth-sfx.js';
import { createSoundBoard, resolveSound } from '../public/js/sound-board.js';
import {
  LEGACY_SFX_KEYS,
  actionLoopFor,
  soundForAward,
  soundForConsume,
  soundForDonation,
  soundForGameEvent,
  soundForPanel,
  soundForQuoin,
  soundForVerb,
} from '../public/js/sound-moments.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const catalog = JSON.parse(fs.readFileSync(path.join(pub, 'assets/content/sound-keys.json'), 'utf8'));

/** Minimal Web Audio stand-in: enough surface for every recipe to schedule. */
function fakeAudioContext() {
  const param = () => ({
    value: 0,
    setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {},
    setTargetAtTime() {}, cancelScheduledValues() {},
  });
  const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
  const made = { osc: 0, noise: 0, gain: 0 };
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    made,
    createGain() { made.gain += 1; return node({ gain: param() }); },
    createOscillator() {
      made.osc += 1;
      return node({ type: 'sine', frequency: param(), detune: param(), start() {}, stop() {} });
    },
    createBiquadFilter() { return node({ type: 'lowpass', frequency: param(), Q: param() }); },
    createBufferSource() {
      made.noise += 1;
      return node({ buffer: null, loop: false, playbackRate: param(), start() {}, stop() {}, onended: null });
    },
    createBuffer(channels, length) {
      const data = new Float32Array(length);
      return { duration: length / 8000, getChannelData: () => data };
    },
    decodeAudioData: async () => ({ duration: 1.5 }),
  };
  return ctx;
}

describe('sound-key catalog', () => {
  test('catalogs every GSJS, client and music key plus the remake moments', () => {
    const keys = Object.keys(catalog.keys);
    assert.equal(keys.length, SOUND_KEY_COUNTS.keys);
    assert.ok(keys.length >= 550, `only ${keys.length} keys`);
    for (const key of ['CLICK_SUCCESS', 'CLICK_FAILURE', 'ITEM_PICKUP', 'PET_PIGGY', 'CHICKEN_SQUEEZED',
      'HARVEST', 'PICK', 'HATCHET', 'WATERING_CAN', 'FRYING_PAN', 'TOOL_BREAKS', 'QUOIN_GOT', 'QUORAZY_QUOIN',
      'LEVEL_UP', 'QUEST_COMPLETE', 'OPEN_HUB_MAP', 'DOOR_OPEN', 'TELEPORT_AWAY', 'STEWARTDOLL10',
      'MUSICBLOCK_D_RED_01', 'AMBIENT_FIREBOGS1', 'QUOIN_SHARD_9', 'SPARKLE_POWDER']) {
      assert.ok(catalog.keys[key], key);
    }
    assert.equal(catalog.keys.PICK.category, 'tool');
    assert.equal(catalog.keys.AMBIENT_CAVERNS1.category, 'music');
    assert.match(catalog.keys.AMBIENT_CAVERNS1.url, /^http:\/\/c2\.glitch\.bz\/sounds\//);
    assert.match(catalog.keys.ITEM_PICKUP.sources[0], /takeable\.js/);
  });

  test('keys whose every call is commented out are dead in the final client, not missing', () => {
    const dead = Object.entries(catalog.keys).filter(([, r]) => r.dead).map(([k]) => k).sort();
    // trumpet: TSFrontController.as 2784/2792 (the shutdown plays GOODNIGHT_GRODDLE);
    // TALK_FROG "Removed per Danny" (npc_yoga_frog.js 221); CRAFTYBOT_IDLE_1 (npc_crafty_bot.js 3024).
    assert.deepEqual(dead, ['CRAFTYBOT_IDLE_1', 'TALK_FROG', 'trumpet']);
    assert.deepEqual(catalog.keys.trumpet.commentedOut.map((s) => s.match(/:(\d+) /)[1]), ['2784', '2792']);
    assert.equal(SOUND_KEY_COUNTS.dead, 3);
    assert.equal(SOUND_KEY_COUNTS.live, SOUND_KEY_COUNTS.keys - 3);
    for (const key of dead) {
      assert.equal(catalog.keys[key].file, undefined, key);
      assert.equal(catalog.keys[key].alias, undefined, key);
    }
    // A live call keeps a key alive: the chat easter egg (RightSideManager.as 203).
    assert.equal(catalog.keys.Prisencolinensinainciusol.dead, undefined);
    // Commented-out calls are not uses of a live key either.
    assert.ok(!catalog.keys.CLICK_FAILURE.sources.some((s) => /TSFrontController\.as:551 /.test(s)));
  });

  test('every recovered file exists, is MPEG audio, and keeps its CDN url', () => {
    assert.equal(SOUND_KEY_COUNTS.recoveredWayback, 38);
    for (const [key, file] of Object.entries(SOUND_FILES)) {
      const abs = path.join(pub, file);
      assert.ok(fs.existsSync(abs), `${key} → ${file}`);
      const head = fs.readFileSync(abs).subarray(0, 3);
      const mpeg = head.toString('latin1') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
      assert.ok(mpeg, `${key} is not MPEG audio`);
      if (file.startsWith('assets/audio/sfx/')) {
        assert.equal(path.basename(file), `${key}.mp3`);
        if (catalog.keys[key].origin === 'archiveorg-sfx') {
          assert.match(catalog.keys[key].source, /^https:\/\/archive\.org\/download\/[a-z0-9-]+\/.+\.mp3$/);
        } else if (catalog.keys[key].origin === 'overlay-fla') {
          assert.match(catalog.keys[key].overlaySource, /^glitch-overlays\/[\w]+\.fla LIBRARY\/\d+-[\w.]+\.mp3$/);
        } else {
          assert.match(catalog.keys[key].url, /^http:\/\/c2\.glitch\.bz\/sounds\/20\d\d-\d\d\//);
          assert.equal(catalog.keys[key].origin, 'wayback-c2');
        }
      }
    }
    for (const [alias, target] of Object.entries(SOUND_ALIASES)) assert.ok(SOUND_FILES[target], alias);
  });

  test('every non-music key resolves to a recovered file or a synth recipe', () => {
    let synthesized = 0;
    for (const [key, row] of Object.entries(catalog.keys)) {
      const r = resolveSound(key);
      if (row.category === 'music' || row.category === 'voice') {
        // music_map also carries a few effects (TRAIN_ARRIVES); only those
        // named explicitly may synthesize.
        if (!SYNTH_KEY_RECIPES[key]) assert.equal(r.recipe, null, `${key} must not get a synthesized song or voice`);
        continue;
      }
      assert.ok(r.file || r.recipe, `${key} plays nothing`);
      if (r.recipe) assert.ok(SYNTH_RECIPES[r.recipe], `${key} → missing recipe ${r.recipe}`);
      if (!r.file) synthesized += 1;
    }
    // Recipes still cover the keys no recovered file answers (puzzle notes,
    // card deals, remake moments ...).
    assert.ok(synthesized >= 100 && synthesized <= 200, `${synthesized} synthesized`);
    const real = Object.keys(catalog.keys).filter((k) => resolveSound(k).file).length;
    assert.ok(real >= 350, `only ${real} keys play a real file`);
  });
});

describe('synth recipes', () => {
  test('explicit choices name real recipes', () => {
    for (const [key, name] of Object.entries(SYNTH_KEY_RECIPES)) assert.ok(SYNTH_RECIPES[name], `${key} → ${name}`);
  });

  test('every recipe schedules cleanly and stays short', () => {
    assert.ok(SYNTH_RECIPE_NAMES.length >= 70);
    for (const name of SYNTH_RECIPE_NAMES) {
      const ctx = fakeAudioContext();
      const seconds = playSynthRecipe(ctx, ctx.createGain(), name, { volume: 0.8, rate: 1, seed: 3 });
      assert.ok(seconds > 0 && seconds <= 2.5, `${name} lasts ${seconds}s`);
      assert.ok(ctx.made.osc + ctx.made.noise > 0, `${name} makes no sound`);
    }
  });

  test('pattern and category fallbacks', () => {
    assert.equal(recipeForKey('CLOUD3'), 'cloud');
    assert.equal(recipeForKey('QUOIN_SHARD_4'), 'quoinShard');
    assert.equal(recipeForKey('DANCER_POSE_FROG'), 'ribbit');
    assert.equal(recipeForKey('POTION_RAINBOW_JUICE'), 'brew');
    assert.equal(recipeForKey('SOMETHING_NEW', 'ui'), 'click');
    assert.equal(recipeForKey('STEWARTDOLL4'), null);
    assert.equal(recipeForKey('AMBIENT_URALIA1', 'music'), null);
  });
});

describe('sound moments', () => {
  test('world verbs use the production keys', () => {
    assert.equal(soundForVerb('npc_piggy', 'pet'), 'PET_PIGGY');
    assert.equal(soundForVerb('npc_piggy', 'nibble'), 'NIBBLE_PIGGY');
    assert.equal(soundForVerb('npc_piggy', 'feed:apple'), 'FEED_PIGGY');
    assert.equal(soundForVerb('npc_chicken', 'squeeze'), 'CHICKEN_SQUEEZED');
    assert.equal(soundForVerb('npc_butterfly', 'milk'), 'BUTTERFLY_SING');
    assert.equal(soundForVerb('trant_bean', 'harvest'), 'HARVEST');
    assert.equal(soundForVerb('trant_bean', 'water'), 'WATERING_CAN');
    assert.equal(soundForVerb('wood_tree', 'pet'), 'PET_TRANT');
    assert.equal(soundForVerb('beryl_rock', 'mine'), 'PETRIFIED_ROCK');
    assert.equal(soundForVerb('apple', 'pickup'), 'ITEM_PICKUP');
    assert.equal(soundForVerb('npc_piggy', 'pet', { ok: false }), 'CLICK_FAILURE');
    assert.equal(soundForVerb('trant_fruit', 'harvest', { harvest: { superHarvest: true } }), 'RAINBOW_SUPERHARVEST');
  });

  test('timed verbs loop the tool sound', () => {
    assert.deepEqual(actionLoopFor('beryl_rock', 'mine'), { key: 'PICK', intervalMs: 620 });
    assert.equal(actionLoopFor('wood_tree', 'harvest').key, 'HATCHET');
    assert.equal(actionLoopFor('trant_egg', 'water').key, 'WATERING_CAN');
    assert.equal(actionLoopFor('npc_piggy', 'talk_to'), null);
    // No tool, no loop: these play their sound once when they finish.
    for (const [cls, verb] of [['trant_fruit', 'harvest'], ['trant_bean', 'harvest'], ['npc_piggy', 'pet'], ['npc_piggy', 'nibble'], ['npc_chicken', 'squeeze'], ['npc_butterfly', 'milk'], ['npc_butterfly', 'massage']]) {
      assert.equal(actionLoopFor(cls, verb), null, `${cls} ${verb}`);
    }
  });

  test('quoins, awards, donations, panels, food and events', () => {
    assert.equal(soundForQuoin('qurazy'), 'QUORAZY_QUOIN');
    for (const type of ['xp', 'mood', 'energy', 'currants', 'mystery', 'favor', 'time']) {
      assert.match(soundForQuoin(type), /^QUOIN_/);
      assert.ok(catalog.keys[soundForQuoin(type)], type);
    }
    assert.equal(soundForAward('level'), 'LEVEL_UP');
    assert.equal(soundForAward('achievement'), 'ACHIEVEMENT_UNLOCKED');
    assert.equal(soundForDonation(5), 'DONATION_1ST_TIER');
    assert.equal(soundForDonation(120), 'DONATION_4TH_TIER');
    assert.equal(soundForPanel('map-panel', true), 'OPEN_HUB_MAP');
    assert.equal(soundForPanel('quest-panel', false), 'QUEST_DIALOGUE_BOX_CLOSE');
    assert.equal(soundForPanel('vendor-panel', true), 'UI_PANEL_OPEN');
    assert.equal(soundForConsume('bubble_tea'), 'ITEM_DRINK');
    assert.equal(soundForConsume('apple'), 'ITEM_EAT');
    assert.equal(soundForGameEvent('teleported'), 'TELEPORT_ARRIVE');
    assert.equal(soundForGameEvent('npc_piggy:pet'), null);
    for (const key of Object.values(LEGACY_SFX_KEYS)) assert.ok(catalog.keys[key], key);
  });

  test('every literal key played in the game is catalogued and audible', () => {
    const files = [
      path.join(pub, 'game.js'),
      path.join(pub, 'js/sound-moments.js'),
      ...fs.readdirSync(path.join(pub, 'js/features')).map((f) => path.join(pub, 'js/features', f)),
    ];
    const used = new Set();
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(/playSound(?:Loop)?\??\.?\(\s*'([A-Z][A-Z0-9_]+)'/g)) used.add(m[1]);
      for (const m of text.matchAll(/return '([A-Z][A-Z0-9_]+)'/g)) used.add(m[1]);
      for (const m of text.matchAll(/(?:key|pet|water|dig|tend|plant|scrape|scoop|harvest): '([A-Z][A-Z0-9_]+)'/g)) used.add(m[1]);
    }
    assert.ok(used.size >= 60, `only ${used.size} keys wired`);
    for (const key of used) {
      assert.ok(catalog.keys[key], `${key} is played but not catalogued`);
      const r = resolveSound(key);
      assert.ok(r.file || r.recipe, `${key} is played but silent`);
    }
  });
});

describe('sound board', () => {
  function host({ muted = false, files = {} } = {}) {
    const ctx = fakeAudioContext();
    const destination = ctx.createGain();
    let clock = 0;
    const fetched = [];
    return {
      ctx,
      fetched,
      tick(ms) { clock += ms; },
      board: createSoundBoard({
        getContext: () => ctx,
        getDestination: () => destination,
        isMuted: () => muted,
        now: () => clock,
        fetchImpl: async (url) => {
          fetched.push(url);
          return { ok: url in files || true, arrayBuffer: async () => new ArrayBuffer(8) };
        },
      }),
    };
  }

  test('plays a recipe for a synthesized key and respects mute', () => {
    const h = host();
    const handle = h.board.play('CARD_DEAL3');
    assert.equal(handle.kind, 'synth');
    assert.equal(handle.recipe, recipeForKey('CARD_DEAL3', 'ui'));
    const muted = host({ muted: true });
    assert.equal(muted.board.play('CARD_DEAL3'), null);
  });

  test('prefers a recovered file over the recipe once it is warm', async () => {
    const h = host();
    const played = [];
    const board = createSoundBoard({
      getContext: () => h.ctx,
      getDestination: () => h.ctx.createGain(),
      now: () => 0,
      onPlayed: (last) => played.push(last),
      fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
    });
    assert.ok(resolveSound('PET_PIGGY').file);
    await board.preload(['PET_PIGGY', 'CLICK_SUCCESS', 'PICK']);
    assert.equal(board.play('PET_PIGGY').kind, 'file');
    assert.equal(board.play('CLICK_SUCCESS').kind, 'file');
    assert.deepEqual(played, ['PET_PIGGY:file', 'CLICK_SUCCESS:file']);
    const loop = board.loop('PICK', { intervalMs: 620 });
    assert.equal(loop.key, 'PICK');
    assert.equal(played.at(-1), 'PICK:file');
    loop.stop();
  });

  test('throttles exact repeats but allows multiples on request', () => {
    const h = host();
    assert.ok(h.board.play('ITEM_PICKUP'));
    assert.equal(h.board.play('ITEM_PICKUP'), null);
    assert.ok(h.board.play('ITEM_PICKUP', { allowMultiple: true }));
    h.tick(50);
    assert.ok(h.board.play('ITEM_PICKUP'));
  });

  test('loads a recovered file once and plays it from the cache', async () => {
    const h = host();
    await h.board.preload(['HARVEST', 'HARVEST', 'pickup']);
    assert.deepEqual(h.fetched.sort(), ['assets/audio/discover_new_item.mp3', 'assets/audio/sfx/HARVEST.mp3']);
    const handle = h.board.play('HARVEST');
    assert.equal(handle.kind, 'file');
    assert.equal(h.board.stats.cached, 2);
  });

  test('a cold voice line plays once its file arrives', async () => {
    const h = host();
    const handle = h.board.play('STEWARTDOLL10');
    assert.equal(handle.kind, 'loading');
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(h.board.stats.file, 1);
  });
});
