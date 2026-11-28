import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as kit from '../public/js/quest-rooms/kit.js?v=44218fc3';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mod = await import('../public/js/quest-rooms/esquibeth.js?v=ac401394');

// Avatar reach (game.js physics): jump 9.6 px/frame against 0.42 gravity peaks near 110 px
// and carries about 200 px at run speed 4.4; keep margins.
const RISE = 95;
const GAP = 150;

/** Walkable surfaces of a grotto layout: blocks, ledges, the climb's summit. */
function surfaces(L) {
  const out = L.blocks.map((b, i) => ({ id: `b${i}`, x1: b.x1, x2: b.x2, y: b.top }));
  L.ledges.forEach((l, i) => out.push({ id: `l${i}`, x1: l.x1, x2: l.x2, y: l.y }));
  if (L.top) out.push({ id: 'top', x1: L.top.x1, x2: L.top.x2, y: L.top.y });
  return out;
}

function gapBetween(a, b) {
  if (a.x2 < b.x1) return b.x1 - a.x2;
  if (b.x2 < a.x1) return a.x1 - b.x2;
  return 0;
}

/** Surfaces reachable from the one under `start` by walking, dropping and ordinary jumps. */
function reachable(list, start) {
  const first = list.filter((s) => start.x >= s.x1 && start.x <= s.x2 && Math.abs(s.y - start.y) < 2);
  const seen = new Set(first.map((s) => s.id));
  const queue = [...first];
  while (queue.length) {
    const a = queue.shift();
    for (const b of list) {
      if (seen.has(b.id)) continue;
      const gap = gapBetween(a, b);
      const rise = a.y - b.y;
      const ok = rise > 0 ? rise <= RISE && gap <= GAP : gap <= GAP + 60 || gap === 0;
      // Overlapping surfaces: you can drop through to a lower one, or jump up through a one-way one.
      const overlap = gap === 0 && (rise <= 0 || rise <= RISE);
      if (ok || overlap) {
        seen.add(b.id);
        queue.push(b);
      }
    }
  }
  return list.filter((s) => seen.has(s.id));
}

const on = (list, x, y) => list.some((s) => x >= s.x1 - 2 && x <= s.x2 + 2 && Math.abs(s.y - y) < 2);

describe('The Last Pilgrimage of Esquibeth (esquibeth)', () => {
  it('keeps the source quests, locations and texts', () => {
    assert.equal(mod.MAIN, 'last_pilgrimage_of_esquibeth');
    assert.equal(mod.REMINISCE, 'last_pilgrimage_of_esquibeth_reminisce');
    assert.deepEqual(mod.STAGES, ['waterfall_01', 'waterfall_02', 'waterfall_03', 'waterfall_04_wider']);
    assert.deepEqual(Object.values(mod.STAGE_TSIDS), ['LIFQUHITQ583FKK', 'LIFR2OEUQ5832LQ', 'LIFR7REVQ583H6Q', 'LIFVOTC3H593H7H']);
    assert.deepEqual(Object.values(mod.STAGE_LABELS), ['Eastern Grotto', 'Western Grotto', 'Waterfall Climb', 'Waterfall Hollow']);
    const gsjs = join(root, '..', 'glitch-GameServerJS');
    if (existsSync(gsjs)) {
      const q1 = readFileSync(join(gsjs, 'quests/last_pilgrimage_of_esquibeth.js'), 'utf8');
      for (const tsid of Object.values(mod.STAGE_TSIDS)) assert.ok(q1.includes(tsid), tsid);
      assert.ok(q1.includes('"got_conch"'));
      const loc = readFileSync(join(gsjs, 'locations/location.js'), 'utf8');
      assert.ok(loc.includes(mod.LINES.endVog), 'end vog text');
      assert.ok(loc.includes('apiSetTimer("announce_vog_fade", 5000'), '5 s end vog');
      const rem = readFileSync(join(gsjs, 'quests/last_pilgrimage_of_esquibeth_reminisce.js'), 'utf8');
      assert.ok(rem.includes('4*60*60'), 'reminisce waits 4 hours');
      assert.equal(mod.REMINISCE_WAIT_HOURS, 4);
      const conch = readFileSync(join(gsjs, 'items/conch.js'), 'utf8');
      assert.ok(conch.includes('"music_duration"\t: "45000"'));
      assert.ok(conch.includes('var xpAmt = 1000;') && conch.includes('var favorAmt = 150;'));
      assert.ok(conch.includes("available_quests = ['last_pilgrimage_of_esquibeth_reminisce']"));
    }
    assert.equal(mod.CONCH.musicMs, 45_000);
    assert.equal(mod.CONCH.blowXp, 1000);
    assert.equal(mod.CONCH.blowFavor, 150);
    assert.equal(mod.DANCE_MS, Math.round((384 / 30) * 1000));
    // G310: the narration is remake copy; the sound warning is the CC0 overlay's.
    assert.equal(mod.LINES.intro.length, 2);
    assert.equal(mod.LINES.found(1, 3), 'Notes: 1 / 3');
    for (const gone of ['great uncertainty', 'drifting apart', 'Elevenness', 'final hope', 'Found 1 of']) assert.ok(!JSON.stringify(mod.LINES).includes(gone) && !mod.LINES.found(1, 3).includes(gone), gone);
    assert.equal(mod.room.durationMs, 0, 'the 5 * 60 is an exit delay, not a clock');
    // onStarted questInstanceLocation(..., 5*60): "Are you stuck?" after five minutes.
    assert.equal(mod.EXIT_PROMPT_MS, 300_000);
    assert.equal(mod.room.exitPromptMs, 300_000);
  });

  it('builds the song from the three recorded phrases', () => {
    assert.deepEqual(mod.NOTE_COUNTS, { waterfall_01: 3, waterfall_02: 4, waterfall_03: 5 });
    assert.deepEqual(mod.SONGS.waterfall_01, [2, 3, 1]);
    assert.deepEqual(mod.SONGS.waterfall_02, [2, 3, 1, 2, 4]);
    assert.deepEqual(mod.SONGS.waterfall_03, [2, 3, 1, 2, 4, 5, 1]);
    assert.equal(mod.SONG_BEATS_MS.length, mod.SONGS.waterfall_03.length);
    // E G D | E C | A D on the five recovered bells.
    assert.deepEqual(mod.SONGS.waterfall_03.map((n) => mod.BELLS[n]), ['BW_E2', 'BW_G2', 'BW_D2', 'BW_E2', 'BW_C2', 'BW_A1', 'BW_D2']);
    for (const stage of ['waterfall_01', 'waterfall_02', 'waterfall_03']) {
      // Every note of a song is one you can find in that location.
      const found = new Set(mod.stageLayout(stage).notes.map((n) => n.n));
      assert.equal(found.size, mod.NOTE_COUNTS[stage]);
      for (const n of mod.SONGS[stage]) assert.ok(found.has(n), `${stage} note ${n}`);
      // The glyph carves one socket per note found there, marked for that note.
      assert.deepEqual(Object.keys(mod.glyphPlacement(stage).sockets).map(Number).sort(), [...found].sort());
    }
    for (const key of Object.values(mod.BELLS)) assert.ok(existsSync(join(root, 'public/assets/audio/sfx', `${key}.mp3`)), key);
  });

  it('checks the song note by note and starts over on a wrong note', () => {
    const song = mod.SONGS.waterfall_02;
    let s = { entered: [] };
    for (const [i, n] of song.entries()) {
      s = mod.songStep(song, s.entered, n);
      assert.ok(s.ok);
      assert.equal(s.done, i === song.length - 1);
    }
    s = mod.songStep(song, [2, 3], 4);
    assert.deepEqual(s, { ok: false, done: false, entered: [] });
    assert.equal(mod.nextStage('waterfall_01'), 'waterfall_02');
    assert.equal(mod.nextStage('waterfall_04_wider'), null);
  });

  it('pays the Conch tune like items/conch.js', () => {
    const now = Date.UTC(2026, 0, 1);
    assert.equal(mod.conchPlayReward(0, now).xp, 50);
    assert.equal(mod.conchPlayReward(now - 32 * 86400_000, now).xp, 100);
    assert.equal(mod.conchPlayReward(now - 5 * 3600_000, now, false).xp, 10);
    assert.equal(mod.conchPlayReward(now - 5 * 3600_000, now, true).xp, 0);
    assert.equal(mod.conchPlayReward(now - 60_000, now).msg, 'Good stuff, but play it too much and it gets stale, you know?');
  });

  it('lays out every grotto so each note, the stone and the exit are reachable', () => {
    for (const stage of ['waterfall_01', 'waterfall_02', 'waterfall_03']) {
      const L = mod.stageLayout(stage);
      const list = surfaces(L);
      const reach = reachable(list, L.spawn);
      assert.ok(on(list, L.spawn.x, L.spawn.y), `${stage} spawn on ground`);
      for (const note of L.notes) assert.ok(on(reach, note.x, note.y), `${stage} note ${note.n} at ${note.x},${note.y}`);
      for (const q of L.quoins) assert.ok(reach.some((s) => q.x >= s.x1 && q.x <= s.x2 && s.y - q.y <= 100 && s.y >= q.y), `${stage} quoin ${q.x}`);
      assert.ok(on(reach, L.glyph.x, L.glyph.y), `${stage} glyph`);
      assert.ok(on(reach, L.button.x, L.button.y), `${stage} button`);
      assert.ok(on(reach, L.exit.x, L.exit.y), `${stage} exit`);
      // Blocks tile the width left to right; steps between them stay jumpable.
      for (let i = 1; i < L.blocks.length; i++) {
        assert.equal(L.blocks[i].x1, L.blocks[i - 1].x2);
        assert.ok(Math.abs(L.blocks[i].top - L.blocks[i - 1].top) <= RISE || L.blocks[i].top > L.blocks[i - 1].top);
      }
      // Ledges float clear of the rock they would otherwise be drawn into.
      for (const l of L.ledges) {
        for (const b of L.blocks) if (l.x2 > b.x1 && l.x1 < b.x2) assert.ok(l.y < b.top - 40, `${stage} ledge ${l.x1} clear of block`);
      }
    }
  });

  it('keeps what you click within the visible band above the floor', () => {
    for (const stage of ['waterfall_01', 'waterfall_02', 'waterfall_03']) {
      const L = mod.stageLayout(stage);
      // The camera keeps about 370 px above the floor in view (1280 x 800): sockets and the staff stay well inside.
      const P = mod.glyphPlacement(stage);
      for (const [n, at] of Object.entries(P.sockets)) {
        const up = L.glyph.y - at.y;
        assert.ok(up >= 60 && up <= 220, `${stage} socket ${n} ${up}`);
      }
      assert.ok(L.glyph.y - P.staff.y <= 260, `${stage} staff`);
      // The song's marks are on the staff.
      assert.ok(P.marks.length >= mod.SONGS[stage].length);
    }
  });

  it('walks the Hollow from the arrival to the pedestal and the light', () => {
    const f = mod.HOLLOW.floor;
    for (let i = 1; i < f.length; i++) {
      assert.ok(f[i][0] > f[i - 1][0]);
      // Slopes, not steps: no segment climbs more than a jump in a short run.
      const rise = f[i - 1][1] - f[i][1];
      assert.ok(rise <= RISE || f[i][0] - f[i - 1][0] >= rise * 0.5, `segment ${i}`);
    }
    const at = (x) => {
      for (let i = 1; i < f.length; i++) {
        if (x >= f[i - 1][0] && x <= f[i][0]) return f[i - 1][1] + ((x - f[i - 1][0]) / (f[i][0] - f[i - 1][0])) * (f[i][1] - f[i - 1][1]);
      }
      return null;
    };
    assert.equal(at(mod.HOLLOW.spawn.x), mod.HOLLOW.spawn.y);
    assert.ok(Math.abs(at(mod.HOLLOW.pedestal.x) - mod.HOLLOW.pedestal.floor) < 6, 'pedestal stands on the floor');
    assert.ok(at(mod.HOLLOW.exit.x1 + 40) != null, 'exit on the floor');
    assert.ok(mod.HOLLOW.revealX < mod.HOLLOW.pedestal.x && mod.HOLLOW.revealX > mod.HOLLOW.ghost.x);
    const plats = mod.stagePlatforms(kit, 'waterfall_04_wider');
    assert.equal(plats.length, f.length - 1);
  });

  it('ships the recovered art and the room contract', () => {
    const art = join(root, 'public/assets/sprites/quest-rooms/esquibeth');
    for (const name of ['hollow.webp', 'hollow_grendaline.webp', 'conch_decoy.webp', 'button_in.webp', 'ghost_appear.webp', 'ghost_idle.webp', 'ghost_disappear.webp',
      ...[1, 2, 3, 4, 5].flatMap((n) => [`ghost_note${n}.webp`, `note${n}_1.webp`, `note${n}_right.webp`, `note${n}_wrong.webp`])]) {
      assert.ok(existsSync(join(art, name)), name);
    }
    assert.ok(existsSync(join(root, 'public/assets/sprites/icons/conch.webp')));
    assert.equal(mod.room.id, 'esquibeth');
    assert.equal(mod.room.firstStage, 'waterfall_01');
    assert.equal(mod.room.stageLabel('waterfall_03'), 'Waterfall Climb');
    assert.deepEqual(mod.room.itemClasses, ['conch']);
    for (const fn of ['build', 'enter', 'tick', 'objective', 'onLeave', 'publish', 'autoplay', 'itemVerbs', 'runItemVerb']) {
      assert.equal(typeof mod.room[fn], 'function', fn);
    }
    assert.equal(mod.CONCH_ITEM.baseCost, 700);
  });

  it("plays the playback overlay's own melody take for the ghost", async () => {
    const { SOUND_FILES, SOUND_CATEGORIES } = await import('../public/js/sound-keys.js?v=8b36c250');
    const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/sound-keys.json'), 'utf8')).keys;
    // DOMSoundItem externalFileSize in glitch-overlays/npc_esquibeth_playback*.fla.
    const takes = {
      waterfall_01: ['ESQUIBETH_PLAYBACK_A', 'npc_esquibeth_playbackA.fla', 104414],
      waterfall_02: ['ESQUIBETH_PLAYBACK_AB', 'npc_esquibeth_playbackAB.fla', 142297],
      waterfall_03: ['ESQUIBETH_PLAYBACK_ABC', 'npc_esquibeth_playbackABC.fla', 215622],
    };
    assert.deepEqual(Object.keys(mod.PLAYBACK_SOUNDS), mod.STAGES.slice(0, 3));
    for (const [stage, [key, fla, bytes]] of Object.entries(takes)) {
      assert.equal(mod.PLAYBACK_SOUNDS[stage], key);
      assert.equal(SOUND_FILES[key], `assets/audio/sfx/${key}.mp3`);
      assert.equal(SOUND_CATEGORIES[key], 'music');
      assert.equal(catalog[key].origin, 'overlay-fla');
      assert.ok(catalog[key].overlaySource.startsWith(`glitch-overlays/${fla} LIBRARY/`), key);
      assert.equal(readFileSync(join(root, 'public', SOUND_FILES[key])).length, bytes, key);
    }
    assert.equal(mod.PLAYBACK_LEAD_MS, 50);
    const src = readFileSync(join(root, 'public/js/quest-rooms/esquibeth.js'), 'utf8');
    // The take carries the song; separate bells only when it cannot load.
    assert.match(src, /if \(recorded\) d\.playbackHandle = ctx\.sound\(melody/);
    assert.match(src, /if \(!recorded\) ctx\.sound\(BELLS\[n\]/);
    assert.match(src, /preloadSounds\?\.\(\[PLAYBACK_SOUNDS\[stage\]\]\)/);
    // music_map WATERFALL_MELODY is an earlier take that neither recording plays.
    assert.doesNotMatch(src, /sound\('WATERFALL_MELODY'/);
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /preloadSounds: \(keys\) =>/);
  });

  it('offers Blow once after part 1, and Play otherwise', () => {
    const mem = {};
    const pc = { xp: 0, imagination: 0, mood: 10, energy: 50, giantFavor: { grendaline: 0 } };
    const engine = {
      pc,
      player: { x: 0, y: 0 },
      questState: { completed: [] },
      pushActivity() {},
      updateHud() {},
      floatText() {},
    };
    const wctx = { engine, questMemory: () => mem, save() {} };
    assert.deepEqual(mod.room.itemVerbs(wctx, 'conch').map((v) => v.id), ['conch_play']);
    engine.questState.completed.push(mod.MAIN);
    assert.deepEqual(mod.room.itemVerbs(wctx, 'conch').map((v) => v.id), ['conch_blow']);
    assert.equal(mod.room.runItemVerb(wctx, 'conch', 'conch_blow'), true);
    assert.equal(pc.xp, 1000);
    assert.equal(pc.giantFavor.grendaline, 150);
    assert.deepEqual(mod.room.itemVerbs(wctx, 'conch').map((v) => v.id), ['conch_play']);
    assert.equal(mod.room.runItemVerb(wctx, 'conch', 'conch_blow'), false);
    assert.equal(mod.room.runItemVerb(wctx, 'conch', 'conch_play'), true);
    assert.equal(pc.mood, 12);
    assert.equal(pc.energy, 48);
  });
});

describe('Esquibeth: grotto skies from the Snaps (G79)', () => {
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  it('gives the Western Grotto a pale lemon sky with a pink flush, not khaki', () => {
    const gold = mod.SKY_STOPS.gold.map(([, c]) => c);
    // A pink flush at the top (red over green), then bright lemon (high red and green, low blue).
    const [r0, g0] = rgb(gold[0]);
    assert.ok(r0 > g0, 'pink flush first');
    const lemon = gold.filter((c) => { const [r, g, b] = rgb(c); return r > 235 && g > 215 && b < 165; });
    assert.ok(lemon.length >= 2, `lemon stops ${lemon}`);
    assert.ok(!gold.includes('#d9c6b0') && !gold.includes('#e9d39a'), 'the old khaki stops are gone');
  });
  it('keeps the sampled peach-pink and magenta-pink tops for the other grottos', () => {
    assert.equal(mod.SKY_STOPS.dusk[0][1], '#f9bcb6');
    assert.equal(mod.SKY_STOPS.rose[0][1], '#eba2e8');
    assert.equal(mod.SKY_STOPS.rose[1][1], '#f5bfee');
    for (const stage of ['waterfall_01', 'waterfall_02', 'waterfall_03']) assert.ok(mod.SKY_STOPS[mod.stageLayout(stage).sky], stage);
  });
});

describe('G962: the grottos and the climb are the Alakol mountaineering set tinted lavender (snap 93906)', () => {
  const src = readFileSync(join(root, 'public/js/quest-rooms/esquibeth.js'), 'utf8');
  const { BASALT } = mod;

  it('every piece ships, and the code-drawn basalt is gone', () => {
    for (const group of ['toppers', 'ledges', 'faces', 'stones', 'cones', 'rubble']) {
      assert.ok(BASALT[group].length >= 2, group);
      for (const [name, w, h] of BASALT[group]) {
        assert.ok(existsSync(join(root, `public/assets/decos/groddle/${name}.webp`)), name);
        assert.ok(w > 0 && h > 0, name);
      }
    }
    assert.match(BASALT.toppers.map((t) => t[0]).join(), /platform_topper_01a_al1/);
    assert.match(BASALT.ledges.map((t) => t[0]).join(), /platform_horizontal_ledge_mountaineering_01a_al1/);
    // No hex caps, column strips, jagged ceiling polygons or hexagon rocks drawn in code any more.
    assert.doesNotMatch(src, /const PAL = |g\.poly\(pts\)|lips\.push|ceilD\$\{/);
    for (const fn of ['drawBasalt', 'drawSlab', 'drawCeiling', 'drawBackWall', 'rockPile']) {
      const at = src.indexOf(`function ${fn}(`);
      const body = src.slice(at, src.indexOf('\n}\n', at));
      assert.match(body, /basaltPiece\(|drawBasalt\(|hangColumns\(|BASALT\./, `${fn} lays Alakol pieces`);
      assert.doesNotMatch(body, /\.moveTo\(|\.lineTo\(|\.poly\(/, `${fn} draws no rock shapes`);
    }
  });

  it('tints the set the Snaps\' lavender: lit, darker in the caves and on the climb', () => {
    const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    const [r, g, b] = rgb(BASALT.tint.lit);
    assert.ok(Math.abs(r / 255 - 0.86) < 0.03 && Math.abs(g / 255 - 0.74) < 0.03 && Math.abs(b / 255 - 0.95) < 0.03);
    const sum = (c) => rgb(c).reduce((a, v) => a + v, 0);
    assert.ok(sum(BASALT.tint.cave) < sum(BASALT.tint.lit) && sum(BASALT.tint.climb) < sum(BASALT.tint.lit));
    for (const t of Object.values(BASALT.tint)) assert.ok(rgb(t)[2] >= rgb(t)[1], 'lavender, blue over green');
  });

  it('caps sit on the walking lines the layouts already have (geometry unchanged)', () => {
    assert.equal(BASALT.scale, 0.5);
    assert.ok(BASALT.capRise > 0 && BASALT.capRise < 30);
    assert.match(src, /top - BASALT\.capRise/);
    assert.match(src, /l\.y - BASALT\.capRise/);
  });
});

describe('G1161: the Eastern Grotto\'s far wall, mountains and mist (Snaps PIF210IIKF015FF_93299, PHVRLO0EBDC23R1_87410, PIF4UQ5VJM53UEO_92602)', () => {
  const { HORIZON, stageLayout } = mod;
  const FILE_H = { cliffside_1a_al1: 878, cliffside_1b_al1: 834, cliffside_1c_al1: 846 };
  const FILE_W = { cliffside_1a_al1: 1336, cliffside_1b_al1: 974, cliffside_1c_al1: 620 };

  /** Build a stage on the fake Pixi (tests/fake-scene.js), as g999-room-parallax-views does. */
  async function buildStage(stage) {
    const { fakePixi, FakeEl } = await import('./fake-scene.js');
    const saved = { PIXI: globalThis.PIXI, document: globalThis.document };
    globalThis.PIXI = fakePixi;
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    try {
      return mod.room.build({ PIXI: fakePixi, kit, data: {}, param: () => null, stage, questId: null, engine: {}, state: {} }, stage);
    } finally {
      globalThis.PIXI = saved.PIXI;
      globalThis.document = saved.document;
    }
  }

  it('only the open-sky Eastern Grotto has it', () => {
    assert.equal(stageLayout('waterfall_01').horizon, true);
    for (const s of ['waterfall_02', 'waterfall_03']) assert.ok(!stageLayout(s).horizon, s);
  });

  it('a long lavender wall of Alakol cliffsides, end to end across what the camera shows of its layer', async () => {
    const scene = await buildStage('waterfall_01');
    const wall = scene.background.children.find((c) => c.factor === HORIZON.wallFactor && c.zIndex === 0.75);
    const peaks = scene.background.children.find((c) => c.factor === HORIZON.peakFactor);
    assert.ok(wall && peaks, 'wall and mountain layers');
    assert.ok(peaks.children.length >= 2, 'two mountain ridges');
    const L = stageLayout('waterfall_01');
    // A layer of factor f slides f * camX: a 1920 px window sees it from 0 to f * (width - 1920) + 1920.
    // Each piece's middle 80 % (its ragged ends trimmed) overlaps the next: no sky between them.
    const spans = HORIZON.wall.map(([x, name, scale]) => [x - FILE_W[name] * scale * 0.4, x + FILE_W[name] * scale * 0.4]).sort((a, b) => a[0] - b[0]);
    assert.ok(spans[0][0] <= 0 && spans.at(-1)[1] >= HORIZON.wallFactor * (L.width - 1920) + 1920);
    for (let i = 1; i < spans.length; i += 1) assert.ok(spans[i][0] <= spans[i - 1][1], `gap at ${Math.round(spans[i - 1][1])}`);
    for (const [, name] of HORIZON.wall) assert.ok(existsSync(join(root, `public/assets/decos/groddle/${name}.webp`)), name);
    const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    for (const t of [HORIZON.wallTint, HORIZON.wallLowTint]) assert.ok(rgb(t)[2] > rgb(t)[0] && rgb(t)[0] > rgb(t)[1], 'lavender');
    assert.ok(HORIZON.mist.length >= 2);
  });

  it('seen from the spawn in a 408 px view the wall tops out ~two avatar heights over the feet, the peaks over it', () => {
    const feet = stageLayout('waterfall_01').spawn.y;
    const view = kit.ROOM_LAYER_VIEW_H;
    const camY = feet - 0.75 * view;
    const overFeet = (y, f) => feet - camY - (y + kit.roomLayerOffset(f, 0, camY, view).y - camY);
    const tops = HORIZON.wall.map(([, name, scale, bottom]) => overFeet(bottom - FILE_H[name] * scale, HORIZON.wallFactor));
    const mean = tops.reduce((a, v) => a + v, 0) / tops.length;
    assert.ok(mean > 170 && mean < 280, `wall top ${Math.round(mean)} px over the feet`);
    const highest = Math.max(...HORIZON.peaks.map(([, top]) => overFeet(top, HORIZON.peakFactor)));
    assert.ok(highest > mean && highest < Math.max(...tops) + 80, 'the summits show over the wall\'s lower stretches, not far above it');
  });
});
