import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as kit from '../public/js/quest-rooms/kit.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mod = await import('../public/js/quest-rooms/esquibeth.js');

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
  });

  it('builds the song from the three recorded phrases', async () => {
    const { SOUND_FILES } = await import('../public/js/sound-keys.js');
    const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/sound-keys.json'), 'utf8')).keys;
    assert.deepEqual(mod.NOTE_COUNTS, { waterfall_01: 3, waterfall_02: 4, waterfall_03: 5 });
    assert.deepEqual(mod.SONGS.waterfall_01, [2, 3, 1]);
    assert.deepEqual(mod.SONGS.waterfall_02, [2, 3, 1, 2, 4]);
    assert.deepEqual(mod.SONGS.waterfall_03, [2, 3, 1, 2, 4, 5, 1]);
    assert.equal(mod.SONG_BEATS_MS.length, mod.SONGS.waterfall_03.length);
    // E G D | E C | A D on the five bells.
    assert.deepEqual(mod.SONGS.waterfall_03.map((n) => mod.BELLS[n]), ['BW_E2', 'BW_G2', 'BW_D2', 'BW_E2', 'BW_C2', 'BW_A1', 'BW_D2']);
    for (const stage of ['waterfall_01', 'waterfall_02', 'waterfall_03']) {
      // Every note of a song is one you can find in that location.
      const found = new Set(mod.stageLayout(stage).notes.map((n) => n.n));
      assert.equal(found.size, mod.NOTE_COUNTS[stage]);
      for (const n of mod.SONGS[stage]) assert.ok(found.has(n), `${stage} note ${n}`);
      assert.equal(Object.keys(mod.socketOffsets(found.size)).length, found.size);
    }
    // G317: the bells are cut from the CC0 ringtone (tools/sound/build-esquibeth-bells.mjs);
    // the c2 copies are gone, and the rooms have no music bed.
    for (const key of Object.values(mod.BELLS)) {
      assert.equal(SOUND_FILES[key], `assets/audio/sfx/bells/${key}.mp3`);
      assert.ok(existsSync(join(root, 'public', SOUND_FILES[key])), key);
      assert.ok(!existsSync(join(root, 'public/assets/audio/sfx', `${key}.mp3`)), key);
      assert.equal(catalog[key].origin, 'archiveorg-derived');
    }
    assert.deepEqual(Object.values(mod.ROOM_MUSIC), [null, null]);
    for (const key of Object.keys(mod.ROOM_MUSIC)) assert.ok(!existsSync(join(root, 'public/assets/audio/sfx', `${key}.mp3`)), key);
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
      const offs = mod.socketOffsets(L.notes.length);
      for (const [, dy] of Object.values(offs)) assert.ok(mod.GLYPH_CENTRE_UP - dy <= 160, `${stage} socket ${dy}`);
      assert.ok(mod.GLYPH_CENTRE_UP - 24 + mod.STAFF_RADIUS <= 162, 'staff');
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
    for (const name of ['hollow.webp', 'hollow_grendaline.webp', 'conch_decoy.webp', 'button_in.png', 'ghost_appear.webp', 'ghost_idle.webp', 'ghost_disappear.webp',
      ...[1, 2, 3, 4, 5].flatMap((n) => [`ghost_note${n}.webp`, `note${n}_1.png`, `note${n}_right.png`, `note${n}_wrong.png`])]) {
      assert.ok(existsSync(join(art, name)), name);
    }
    assert.ok(existsSync(join(root, 'public/assets/sprites/icons/conch.png')));
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
    const { SOUND_FILES, SOUND_CATEGORIES } = await import('../public/js/sound-keys.js');
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
