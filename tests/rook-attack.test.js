/** Rook attacks: rules (js/rook-attack.js). */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FOREHORSEMAN_LINES,
  ROOKABLE_CLASSES,
  ROOK_RESPONSES,
  ROOK_SOLO,
  ROOK_SOURCE,
  ROOK_TEXT,
  applyReviveDose,
  applyDailyRule,
  applyStrike,
  canStrike,
  canStun,
  createRookArm,
  createRookAttack,
  damageFeedText,
  defeatXpFor,
  forceRook,
  normalizeRookSave,
  normalizeRookedSlot,
  orbJoinOrder,
  orbLookFor,
  resolveStun,
  rollWingBeat,
  rookClockS,
  rookResponse,
  rookStartDelayMs,
  scheduleAfterHerald,
  stepRookArm,
  rookTrantState,
  soloCost,
  stepRookAttack,
  streetIsRookable,
  strikeBeamFor,
  strikeDamageFor,
  stunFeedText,
  stunTableFor,
  useBalmPoint,
} from '../public/js/rook-attack.js?v=c12e825f';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

describe('rook attack source constants', () => {
  it('keeps the GSJS numbers', () => {
    assert.equal(ROOK_SOURCE.maxStun, 1000);
    assert.equal(ROOK_SOURCE.defaultHealth, 1000);
    assert.equal(ROOK_SOURCE.prodStrength, 5000);
    assert.equal(ROOK_SOURCE.wingBeatS, 600);
    assert.equal(ROOK_SOURCE.angryWingBeatS, 120);
    assert.equal(ROOK_SOURCE.stunRecoveryS, 120);
    assert.equal(ROOK_SOURCE.clearAfterDeathS, 15);
    assert.equal(ROOK_SOURCE.reviveMs, 10000);
    assert.equal(ROOK_SOURCE.balmPoints, 5);
    // The source's hourly admin schedule stays on record; the remake comes once a day (below).
    assert.equal(ROOK_SOURCE.scheduleMinMin, 60);
    assert.equal(ROOK_SOURCE.scheduleMaxMin, 60);
  });

  it('maps orb joiners to the exact stun table', () => {
    const rows = [0, 1, 2, 3, 4, 5, 6, 8, 9].map((n) => [n, stunTableFor(n).damage, stunTableFor(n).xp]);
    assert.deepEqual(rows, [
      [0, 0, 0], [1, 25, 10], [2, 40, 20], [3, 60, 20], [4, 85, 30], [5, 130, 30], [6, 200, 50], [8, 200, 50], [9, 0, 0],
    ]);
    assert.equal(stunTableFor(9).broke, true);
    assert.deepEqual(orbLookFor(0), { state: 'orb1', scale: 1 });
    assert.equal(orbLookFor(3).state, 'orb3');
    assert.equal(orbLookFor(12).scale, 2);
  });

  it('scales metabolic costs for the solo tank', () => {
    assert.equal(soloCost(ROOK_SOURCE.stunEnergy), 10);
    assert.equal(soloCost(ROOK_SOURCE.stunEnergy, { armor: true }), 5);
    assert.equal(soloCost(ROOK_SOURCE.wingBeatMood, { armor: true, armorRule: 'none' }), 0);
    assert.equal(soloCost(ROOK_SOURCE.reviveEnergy), 5);
  });

  it('writes the source feed lines', () => {
    assert.equal(
      stunFeedText('Rascalmom', 5, 130, 130),
      'Rascalmom and 5 others led an attack against the Rook, stunning it for 130 points. 870 remaining to stun the Rook.'
    );
    assert.equal(stunFeedText('zeeberk', 0, 0, 0), 'zeeberk attempted to stun the Rook, but failed.');
    assert.equal(damageFeedText('Varaeth', 50, 1267), 'Varaeth attacked the Rook for 50 damage. 1267 health remaining.');
    assert.equal(ROOK_TEXT.firstStun.sub, 'Completely stun the Rook within 2 minutes or it will attack!');
    assert.equal(FOREHORSEMAN_LINES.length, 7);
  });

  it('has rooked and revived lines for every speaking rookable class', () => {
    for (const id of ROOKABLE_CLASSES.filter((c) => c !== 'paper_tree')) {
      for (const pool of ['rooked', 'revived_1st_time', 'revived_2nd_time', 'revived_3rd_time']) {
        assert.ok(ROOK_RESPONSES[id]?.[pool]?.length, `${id}.${pool}`);
      }
    }
    assert.equal(rookResponse('trant_bean', 'revived_3rd_time', () => 0), 'I am unrooked!!! Trunks be to Ur!');
  });
});

describe('rook attack phases', () => {
  const T0 = 1_000_000;

  it('runs the herald, then arrives in build_up with a 10-minute wing beat', () => {
    const a = createRookAttack({ tsid: 'L1', now: T0 });
    assert.equal(a.phase, 'herald');
    let ev = stepRookAttack(a, T0);
    assert.deepEqual(ev.map((e) => e.type), ['herald_warning']);
    ev = stepRookAttack(a, T0 + ROOK_SOLO.heraldMs);
    assert.deepEqual(ev.map((e) => e.type), ['herald_warning', 'attack_start']);
    assert.equal(a.phase, 'build_up');
    assert.equal(a.wingBeatAt, T0 + ROOK_SOLO.heraldMs + 600_000);
    assert.equal(canStun(a), true);
    assert.equal(canStrike(a), false);
  });

  it('a lone orb fails without angering the Rook', () => {
    const a = createRookAttack({ tsid: 'L1', now: T0, heraldMs: 0 });
    const r = resolveStun(a, 0, T0 + 1000);
    assert.equal(r.failed, true);
    assert.equal(r.xp, 5);
    assert.equal(a.phase, 'build_up');
    assert.equal(a.stunFailures, 0);
  });

  it('the first stun turns the Rook angry with a 2-minute wing beat and the angry clock', () => {
    const a = createRookAttack({ tsid: 'L1', now: T0, heraldMs: 0 });
    const r = resolveStun(a, 5, T0 + 1000);
    assert.equal(r.firstAttempt, true);
    assert.equal(r.damage, 130);
    assert.equal(a.phase, 'angry');
    assert.equal(a.wingBeatAt, T0 + 1000 + 120_000);
    assert.equal(rookClockS(a, T0 + 1000), 120);
    let ev = stepRookAttack(a, T0 + 61_000);
    assert.deepEqual(ev.map((e) => e.type), ['angry2']);
    ev = stepRookAttack(a, T0 + 91_000);
    assert.deepEqual(ev.map((e) => e.type), ['angry3']);
    ev = stepRookAttack(a, T0 + 121_000);
    assert.deepEqual(ev.map((e) => e.type), ['wing_beat']);
    assert.equal(a.phase, 'build_up');
    assert.equal(a.stun, 0);
  });

  it('1000 stun opens the 2-minute shrine window; strikes defeat it and it clears in 15 s', () => {
    const a = createRookAttack({ tsid: 'L1', now: T0, heraldMs: 0 });
    for (let i = 0; i < 4; i += 1) resolveStun(a, 6, T0 + i * 10_000);
    const last = resolveStun(a, 6, T0 + 50_000);
    assert.equal(last.stunned, true);
    assert.equal(last.damage, 200);
    assert.equal(a.phase, 'stunned');
    assert.equal(a.wingBeatAt, null);
    assert.equal(a.recoveryAt, T0 + 50_000 + 120_000);
    assert.equal(canStun(a), false);
    assert.equal(canStrike(a), true);
    const hit = applyStrike(a, 600, T0 + 60_000);
    assert.equal(hit.text, 'Ur attacked the Rook for 600 damage. 400 health remaining.');
    const kill = applyStrike(a, 600, T0 + 63_000);
    assert.equal(kill.damage, 400);
    assert.equal(kill.dead, true);
    assert.equal(a.phase, 'dead');
    assert.equal(defeatXpFor(a), 1000 * 2 + 50);
    const ev = stepRookAttack(a, T0 + 63_000 + 15_000);
    assert.deepEqual(ev.map((e) => [e.type, e.defeated]), [['clear', true]]);
  });

  it('recovers from a stun after two minutes and re-arms the wing beat', () => {
    const a = createRookAttack({ tsid: 'L1', now: T0, heraldMs: 0 });
    for (let i = 0; i < 5; i += 1) resolveStun(a, 8, T0);
    assert.equal(a.phase, 'stunned');
    const ev = stepRookAttack(a, T0 + 120_000);
    assert.deepEqual(ev.map((e) => e.type), ['stun_recovery']);
    assert.equal(a.phase, 'build_up');
    assert.equal(a.wingBeatAt, T0 + 120_000 + 600_000);
  });

  it('leaves on its own after three wing beats (solo)', () => {
    const a = createRookAttack({ tsid: 'L1', now: T0, heraldMs: 0 });
    const ev = stepRookAttack(a, T0 + 3 * 600_000 + ROOK_SOLO.departMs);
    assert.deepEqual(ev.map((e) => e.type), ['wing_beat', 'wing_beat', 'wing_beat', 'depart', 'clear']);
    assert.equal(ev.at(-1).defeated, false);
  });

  it('five failed stuns (a broken orb) bring the wing beat forward to one second', () => {
    const a = createRookAttack({ tsid: 'L1', now: T0, heraldMs: 0 });
    resolveStun(a, 2, T0);
    for (let i = 0; i < 5; i += 1) resolveStun(a, 9, T0 + 1000);
    assert.equal(a.wingBeatAt, T0 + 2000);
  });

  it('shrine strikes follow launchAttack with the solo crowd and floor', () => {
    assert.equal(strikeDamageFor({ baseCost: 10, count: 20, solo: false }), 20);
    assert.equal(strikeDamageFor({ baseCost: 10, count: 20 }), 200);
    assert.equal(strikeDamageFor({ baseCost: 1, count: 1 }), 100);
    assert.equal(strikeDamageFor({ emblem: true, count: 2, solo: false }), 500);
    assert.equal(strikeBeamFor(99), 1);
    assert.equal(strikeBeamFor(100), 2);
    assert.equal(strikeBeamFor(5, true), 3);
  });
});

describe('rooked things and cures', () => {
  it('rolls the 50% wing-beat chance per target once', () => {
    const slot = normalizeRookedSlot({});
    const targets = [
      { key: 'npc_piggy:0', classId: 'npc_piggy' },
      { key: 'trant_bean:0', classId: 'trant_bean' },
      { key: 'rock:0', classId: 'rock_metal_1' },
    ];
    let i = 0;
    const rolls = [0.2, 0.8];
    const hit = rollWingBeat(slot, targets, 5, () => rolls[i++]);
    assert.deepEqual(hit, ['npc_piggy:0']);
    assert.deepEqual(rollWingBeat(slot, targets, 6, () => 0), ['trant_bean:0']);
  });

  // Austin 2026-11-04: "when reviving animals, they seem to spawn randomly". A rooked animal stays
  // where the Rook struck it (include/rook.js rookAttack 53-63 fullStop) and is revived there
  // (unRook 82-92, onRevived), so its row keeps the spot for the next visit; a tree stands put anyway.
  it('keeps where a rooked animal lies, through a save, and nothing for a tree', () => {
    const slot = normalizeRookedSlot({});
    rollWingBeat(slot, [
      { key: 'npc_butterfly:3', classId: 'npc_butterfly', x: 1234.56, y: 812.04 },
      { key: 'trant_bean:0', classId: 'trant_bean', x: 900, y: 880 },
    ], 5, () => 0);
    forceRook(slot, { key: 'npc_piggy:2', classId: 'npc_piggy', x: 3127, y: 804 }, 6);
    forceRook(slot, { key: 'npc_chicken:0', classId: 'npc_chicken' }, 7);
    assert.deepEqual(slot.rooked['npc_butterfly:3'], { classId: 'npc_butterfly', doses: 0, at: 5, x: 1234.6, y: 812 });
    assert.deepEqual(slot.rooked['npc_piggy:2'], { classId: 'npc_piggy', doses: 0, at: 6, x: 3127, y: 804 });
    assert.deepEqual(slot.rooked['trant_bean:0'], { classId: 'trant_bean', doses: 0, at: 5 });
    assert.deepEqual(slot.rooked['npc_chicken:0'], { classId: 'npc_chicken', doses: 0, at: 7 }, 'no spot without one');
    const saved = normalizeRookedSlot(JSON.parse(JSON.stringify(slot)));
    assert.deepEqual(saved.rooked, slot.rooked);
    // An older save's row (no spot) or a bad one reads without a spot.
    const old = normalizeRookedSlot({ rooked: { 'npc_piggy:0': { classId: 'npc_piggy', doses: 1, at: 2 }, 'npc_piggy:1': { classId: 'npc_piggy', x: 'left', y: null } } });
    assert.deepEqual(old.rooked['npc_piggy:0'], { classId: 'npc_piggy', doses: 1, at: 2 });
    assert.deepEqual(old.rooked['npc_piggy:1'], { classId: 'npc_piggy', doses: 0, at: 0 });
  });

  it('takes three revive doses, then pays the final bonus and favor', () => {
    const slot = normalizeRookedSlot({});
    forceRook(slot, { key: 'npc_chicken:1', classId: 'npc_chicken' }, 1);
    const one = applyReviveDose(slot, 'npc_chicken:1');
    assert.deepEqual([one.done, one.xp, one.response], [false, 25, 'revived_1st_time']);
    const two = applyReviveDose(slot, 'npc_chicken:1');
    assert.equal(two.response, 'revived_2nd_time');
    const three = applyReviveDose(slot, 'npc_chicken:1');
    assert.deepEqual([three.done, three.xp, three.favor, three.response], [true, 50, 10, 'revived_3rd_time']);
    assert.equal(slot.rooked['npc_chicken:1'], undefined);
  });

  it('Rook Balm revives fully for 250 iMG and a tube pours five times', () => {
    const slot = normalizeRookedSlot({});
    forceRook(slot, { key: 'trant_fruit:0', classId: 'trant_fruit' }, 1);
    const r = applyReviveDose(slot, 'trant_fruit:0', { balm: true });
    assert.deepEqual([r.done, r.xp], [true, 250]);
    const save = normalizeRookSave({});
    const uses = [];
    for (let i = 0; i < 5; i += 1) uses.push(useBalmPoint(save, 1).consumeItem);
    assert.deepEqual(uses, [false, false, false, false, true]);
    assert.equal(useBalmPoint(save, 0).ok, false);
  });

  it('a rooked tree loses its fruit and two health but never dies (solo)', () => {
    assert.deepEqual(rookTrantState({ fruitCount: 9, health: 8 }), { fruitCount: 0, health: 6 });
    assert.deepEqual(rookTrantState({ fruitCount: 2, health: 2 }), { fruitCount: 0, health: 1 });
    assert.deepEqual(rookTrantState({ fruitCount: 0, health: 1 }), { fruitCount: 0, health: 1 });
  });

  it('orders orb joiners nearest first, the shrine last, at most eight', () => {
    const c = [
      { key: 'a', x: 500 },
      { key: 'b', x: 120 },
      { key: 'c', x: 90, rooked: true },
      ...Array.from({ length: 10 }, (_, i) => ({ key: `z${i}`, x: 2000 + i })),
    ];
    const order = orbJoinOrder(c, 100, { shrineKey: 'shrine' });
    assert.equal(order.length, 8);
    assert.deepEqual(order.slice(0, 2), ['b', 'a']);
    assert.deepEqual(orbJoinOrder(c.slice(0, 3), 100, { shrineKey: 'shrine' }), ['b', 'a', 'shrine']);
  });

  it('normalizes saves and only rooks streets with a shrine', () => {
    const s = normalizeRookSave({ balmPoints: 99, stats: { defeats: '2' }, active: { tsid: 'X', phase: 'nope' } });
    assert.equal(s.balmPoints, 5);
    assert.equal(s.stats.defeats, 2);
    assert.equal(s.active.phase, 'build_up');
    assert.equal(streetIsRookable({ hasShrine: true }), true);
    assert.equal(streetIsRookable({ hasShrine: true, instance: true }), false);
    assert.equal(streetIsRookable({ hasShrine: false }), false);
  });

  it('ships the recovered rook art', () => {
    for (const file of [
      'rook-hover.webp', 'rook-side.webp', 'forehorseman-frantic.webp', 'rooked-halo.webp',
      'rook-head-idle1.webp', 'rook-head-angry1.webp', 'rook-head-angry2.webp', 'rook-head-angry3.webp', 'rook-head-stun.webp',
      'rook-head-stunned.webp', 'rook-head-stunnedHit.webp', 'rook-head-killShot.webp', 'rook-head-dead.webp',
      'piggy-rooked1.webp', 'piggy-rooked2.webp', 'chicken-rooked1.webp', 'chicken-rooked2.webp',
      'butterfly-fly-rooked.webp', 'butterfly-rest-rooked.webp', 'kitty-sad.webp',
    ]) {
      assert.ok(fs.existsSync(path.join(root, 'assets/sprites/rooks', file)), file);
    }
  });
});

describe('rook attack feature', async () => {
  const { ROOK_SHEETS, rookAttackFeature } = await import('../public/js/features/rook-attack-feature.js?v=774bf9c8');
  const { createFeatureHost } = await import('../public/js/feature-host.js?v=06bb8b74');

  /** Pixel size from a PNG IHDR or a WebP VP8/VP8L/VP8X header. */
  function imageSize(file) {
    const b = fs.readFileSync(file);
    if (b.toString('ascii', 1, 4) === 'PNG') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
    return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }

  it('slices every sheet on exact cells inside its image', () => {
    for (const [id, def] of Object.entries(ROOK_SHEETS)) {
      const { w, h } = imageSize(path.join(root, def.path));
      assert.equal(w % def.fw, 0, `${id} width ${w} / ${def.fw}`);
      assert.equal(h % def.fh, 0, `${id} height ${h} / ${def.fh}`);
      assert.equal(w / def.fw, def.cols, `${id} cols`);
      assert.ok(Math.ceil(def.frames / def.cols) * def.fh <= h, `${id} rows`);
    }
  });

  // Austin 2026-11-02: the skull and bats over rooked things looped with a reset jump. The sheet
  // (OGA emotional_bear__x1_rooked_halo) holds emotional_bear.swf's rooked_halo scene: 30 frames
  // of 124x46, 8 to a row. Cut as 124x92 x16 it played two frames stacked and its last two cells
  // half empty. The scene is in the SWF's loopers and its last frame leads into its first.
  it('plays the rooked halo as the SWF did: 30 single frames at 30 fps, looping seamlessly', async () => {
    const { ROOKED_HALO } = await import('../public/js/features/rook-attack-feature.js?v=774bf9c8');
    const { readImage } = await import('../tools/builder/art-image.mjs');
    const def = ROOK_SHEETS.halo;
    assert.deepEqual({ fw: def.fw, fh: def.fh, cols: def.cols, frames: def.frames }, { fw: 124, fh: 46, cols: 8, frames: 30 });
    assert.equal(ROOKED_HALO.fps, 30);
    assert.equal(ROOKED_HALO.width, 108);
    const img = readImage(path.join(root, def.path));
    assert.deepEqual([img.w, img.h], [def.cols * def.fw, Math.ceil(def.frames / def.cols) * def.fh]);
    const cell = (i) => {
      const out = new Float64Array(def.fw * def.fh * 4);
      const cx = (i % def.cols) * def.fw;
      const cy = Math.floor(i / def.cols) * def.fh;
      for (let y = 0; y < def.fh; y += 1) {
        for (let x = 0; x < def.fw; x += 1) {
          const p = ((cy + y) * img.w + cx + x) * 4;
          for (let k = 0; k < 4; k += 1) out[(y * def.fw + x) * 4 + k] = img.px[p + k];
        }
      }
      return out;
    };
    const cover = (c) => c.filter((_, k) => k % 4 === 3 && c[k] > 0).length;
    const diff = (a, b) => {
      let sum = 0;
      for (let k = 0; k < a.length; k += 4) {
        const fa = a[k + 3] / 255;
        const fb = b[k + 3] / 255;
        sum += Math.abs(a[k + 3] - b[k + 3]);
        for (let j = 0; j < 3; j += 1) sum += Math.abs(a[k + j] * fa - b[k + j] * fb) / 3;
      }
      return sum / (a.length / 4);
    };
    const cells = Array.from({ length: def.frames }, (_, i) => cell(i));
    // One frame per cell: every frame shows about as much art (a stacked pair or a half-empty
    // cell does not), and the two cells after the 30th are empty.
    const covers = cells.map(cover);
    const mid = [...covers].sort((a, b) => a - b)[Math.floor(covers.length / 2)];
    for (const [i, n] of covers.entries()) assert.ok(n > mid * 0.7 && n < mid * 1.3, `cell ${i} covers ${n} px, median ${mid}`);
    for (let i = def.frames; i < def.cols * (img.h / def.fh); i += 1) assert.equal(cover(cell(i)), 0, `cell ${i} is empty`);
    // Seamless: the wrap from the last frame to the first is no bigger a step than any in the loop.
    const steps = cells.slice(1).map((c, i) => diff(cells[i], c));
    assert.ok(diff(cells.at(-1), cells[0]) <= Math.max(...steps), 'the loop wraps without a jump');
  });

  // The rooked animals' clips: the server's cadence per class, the SWFs' 30 fps, and only the
  // scenes the SWFs list in loopers loop (the rest play once and hold, as the client did).
  it('cycles the rooked animal clips on the server cadence, looping only the SWF loopers', async () => {
    const { ROOKED_CADENCE, ROOKED_FPS, ROOKED_LOOPERS } = await import('../public/js/features/rook-attack-feature.js?v=774bf9c8');
    assert.equal(ROOKED_FPS, 30);
    assert.deepEqual([...ROOKED_LOOPERS].sort(), ['bflyFly', 'bflyRest', 'piggy1']);
    const flat = (c) => [c.start, ...c.cycle].map(([clip, ms]) => `${clip}:${ms}`).join(' ');
    assert.equal(flat(ROOKED_CADENCE.npc_piggy), 'piggy1:5000 piggy2:1000 piggy1:1000 piggy2:1000 piggy1:5000');
    assert.equal(flat(ROOKED_CADENCE.npc_chicken), 'chicken1:2000 chicken2:2000 chicken1:2000');
    assert.equal(flat(ROOKED_CADENCE.npc_butterfly), 'bflyFly:3000 bflyFly:1200 bflyRest:3000');
    assert.equal(flat(ROOKED_CADENCE.npc_kitty_chicken), 'kittySad:2000 kittySad:2000');
    for (const c of Object.values(ROOKED_CADENCE)) {
      for (const [clip] of [c.start, ...c.cycle]) assert.ok(ROOK_SHEETS[clip], clip);
    }
    // A clip that plays once fits inside its hold at 30 fps, so it ends and holds before the next.
    for (const c of Object.values(ROOKED_CADENCE)) {
      for (const [clip, ms] of [c.start, ...c.cycle]) {
        if (!ROOKED_LOOPERS.includes(clip)) assert.ok((ROOK_SHEETS[clip].frames / ROOKED_FPS) * 1000 <= ms, `${clip} fits ${ms} ms`);
      }
    }
  });

  it('answers the verb-override hooks only for rook verbs and targets', () => {
    const host = createFeatureHost([rookAttackFeature]);
    const engine = { streetSlot: () => ({}), streetTsid: 'L1' };
    assert.equal(host.query('verbOverride', { classId: 'rock_metal_1' }, engine), null);
    assert.equal(host.query('verbOverride', { classId: 'npc_piggy' }, engine), null);
    assert.equal(host.query('runVerbOverride', { classId: 'npc_piggy' }, 'pet', engine), null);
    assert.equal(host.query('verbOverride', { classId: 'npc_shrine_mab' }, engine), null);
  });

  it('saves and restores its slice', () => {
    const next = Date.now() + 60 * 60 * 1000;
    rookAttackFeature.restore({ rule: 'daily', nextAttackAt: next, balmPoints: 3, stats: { defeats: 1 } });
    const slice = rookAttackFeature.save();
    assert.equal(slice.nextAttackAt, next);
    assert.equal(slice.rule, 'daily');
    assert.equal(slice.balmPoints, 3);
    assert.equal(slice.stats.defeats, 1);
    rookAttackFeature.restore(undefined);
    assert.equal(rookAttackFeature.save().active, null);
  });
});

describe('rook schedule: once a day (Austin 2026-11-04, as online)', () => {
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const T0 = Date.UTC(2026, 10, 4, 12, 0, 0);

  it('keeps the rule in ROOK_SOLO: a day, a 2-minute dwell, then 3 to 20 minutes', () => {
    assert.equal(ROOK_SOLO.dailyMs, DAY);
    assert.equal(ROOK_SOLO.dwellMs, 2 * MIN);
    assert.equal(ROOK_SOLO.delayMinMin, 3);
    assert.equal(ROOK_SOLO.delayMaxMin, 20);
    assert.equal(rookStartDelayMs(() => 0), 3 * MIN);
    assert.equal(rookStartDelayMs(() => 0.5), 11.5 * MIN);
    assert.equal(rookStartDelayMs(() => 1), 20 * MIN);
    assert.equal('scheduleMinMin' in ROOK_SOLO, false);
  });

  it('counts the next attack a day from the herald start, not the end of the fight', () => {
    const save = normalizeRookSave({ rule: 'daily', nextAttackAt: T0 - 1 });
    const a = createRookAttack({ tsid: 'L1', now: T0 });
    assert.equal(scheduleAfterHerald(save, a.startedAt), T0 + DAY);
    assert.equal(save.lastHeraldAt, T0);
    // A two-hour fight later the clock has not moved.
    stepRookAttack(a, T0 + 2 * HOUR);
    assert.equal(save.nextAttackAt, T0 + DAY);
    // 23 h 59 min after the herald it is still waiting, whatever the street.
    const arm = createRookArm();
    assert.equal(stepRookArm(arm, { now: T0 + DAY - MIN, nextAttackAt: save.nextAttackAt, rookable: true, enteredAt: T0 }), 'wait');
    assert.equal(arm.startAt, 0);
    assert.equal(stepRookArm(arm, { now: T0 + DAY, nextAttackAt: save.nextAttackAt, rookable: true, enteredAt: T0 }), 'armed');
  });

  it('needs 2 minutes on a rookable street, then comes a random 3 to 20 minutes later, never on arrival', () => {
    const next = T0;
    for (const roll of [0, 0.37, 1]) {
      const arm = createRookArm();
      const enteredAt = T0 + 5 * MIN;
      const ctx = (now, extra = {}) => ({ now, nextAttackAt: next, rookable: true, enteredAt, rng: () => roll, ...extra });
      assert.equal(stepRookArm(arm, ctx(enteredAt)), 'dwell');
      assert.equal(stepRookArm(arm, ctx(enteredAt + 8000)), 'dwell', 'the old 8 s arrival start is gone');
      assert.equal(stepRookArm(arm, ctx(enteredAt + 2 * MIN - 1)), 'dwell');
      assert.equal(stepRookArm(arm, ctx(enteredAt + 2 * MIN)), 'armed');
      const wait = arm.startAt - (enteredAt + 2 * MIN);
      assert.equal(wait, rookStartDelayMs(() => roll));
      assert.ok(wait >= 3 * MIN && wait <= 20 * MIN);
      assert.equal(stepRookArm(arm, ctx(arm.startAt - 1)), 'armed');
      // Busy at the moment: it waits for the player, then starts.
      assert.equal(stepRookArm(arm, ctx(arm.startAt, { busy: true })), 'busy');
      assert.equal(stepRookArm(arm, ctx(arm.startAt + 4000, { busy: true })), 'busy');
      assert.equal(stepRookArm(arm, ctx(arm.startAt + 5000)), 'start');
    }
    // Not rookable (no shrine, home, instance, hidden hub): nothing arms.
    const off = createRookArm();
    assert.equal(stepRookArm(off, { now: T0 + HOUR, nextAttackAt: next, rookable: false, enteredAt: T0 }), 'off');
    assert.equal(off.startAt, 0);
    // A new street (or a reload) starts the dwell again and drops the picked moment.
    const arm = createRookArm();
    assert.equal(stepRookArm(arm, { now: T0 + 3 * MIN, nextAttackAt: next, rookable: true, enteredAt: T0, rng: () => 0.5 }), 'armed');
    assert.equal(stepRookArm(arm, { now: T0 + 4 * MIN, nextAttackAt: next, rookable: true, enteredAt: T0 + 4 * MIN }), 'dwell');
    assert.equal(arm.startAt, 0);
    // Already 2 minutes on the street when the day comes up: the 3-20 minutes count from then.
    const long = createRookArm();
    assert.equal(stepRookArm(long, { now: T0 + 3 * HOUR, nextAttackAt: T0 + 3 * HOUR, rookable: true, enteredAt: T0, rng: () => 0 }), 'armed');
    assert.equal(long.startAt, T0 + 3 * HOUR + 3 * MIN);
  });

  it('migrates a save from before the rule calmly: a day from its first load', () => {
    // The old 105-120 min schedule had the next attack 40 minutes away.
    const old = normalizeRookSave({ nextAttackAt: T0 + 40 * MIN, lastStreet: 'LHV1', stats: { attacks: 7 } });
    assert.equal(old.rule, '');
    assert.equal(applyDailyRule(old, T0), T0 + DAY);
    assert.equal(old.rule, 'daily');
    // Overdue under the old rule (it was due an hour ago): a day from now too, not straight away.
    const overdue = normalizeRookSave({ nextAttackAt: T0 - HOUR });
    assert.equal(applyDailyRule(overdue, T0), T0 + DAY);
    // A known herald start an hour ago (an attack saved mid-fight) would allow one sooner; the calmer wins.
    const mid = normalizeRookSave({ nextAttackAt: T0 + HOUR, active: createRookAttack({ tsid: 'L1', now: T0 - HOUR }) });
    assert.equal(applyDailyRule(mid, T0), T0 + DAY);
    // A new game: the first Rook a day after the first load.
    const fresh = normalizeRookSave();
    assert.equal(applyDailyRule(fresh, T0), T0 + DAY);
    // Once migrated, a later load keeps the time (the migration runs once).
    const again = normalizeRookSave(JSON.parse(JSON.stringify(old)));
    assert.equal(applyDailyRule(again, T0 + 5 * HOUR), T0 + DAY);
    // A clock that went back (more than a day away): a day from now, as rook.go does.
    const skew = normalizeRookSave({ rule: 'daily', nextAttackAt: T0 + 3 * DAY });
    assert.equal(applyDailyRule(skew, T0), T0 + DAY);
  });

  it('counts time away: the clock is real-world time kept in the save', () => {
    const save = normalizeRookSave({ rule: 'daily' });
    scheduleAfterHerald(save, T0);
    // Closed the game for 30 hours; the reload keeps the time, so the day is already up.
    const later = normalizeRookSave(JSON.parse(JSON.stringify(save)));
    assert.equal(applyDailyRule(later, T0 + 30 * HOUR), T0 + DAY);
    const arm = createRookArm();
    const back = T0 + 30 * HOUR;
    assert.equal(stepRookArm(arm, { now: back, nextAttackAt: later.nextAttackAt, rookable: true, enteredAt: back }), 'dwell');
    assert.equal(stepRookArm(arm, { now: back + 2 * MIN, nextAttackAt: later.nextAttackAt, rookable: true, enteredAt: back, rng: () => 0 }), 'armed');
  });

  it('drives the feature: an old save waits a day, then the dwell and the picked moment', async () => {
    const { rookAttackFeature } = await import('../public/js/features/rook-attack-feature.js?v=774bf9c8');
    const realNow = Date.now;
    const prevPixi = globalThis.PIXI;
    // Enough Pixi for the sheet loader to try (and quietly fail) its loads in node.
    globalThis.PIXI = { Texture: class { constructor(o) { Object.assign(this, o); } }, ImageSource: class { constructor(o) { Object.assign(this, o); } on() {} once() {} emit() {} } };
    let clock = T0;
    Date.now = () => clock;
    const data = {};
    const engine = {
      started: true, mode: 'solo', player: { x: 0, y: 0 }, streetTsid: 'LSHRINE', street: { hubId: '27' },
      interactables: [{ classId: 'npc_shrine_mab', sprite: { x: 100, y: 0 } }],
      camera: { x: 0, y: 0, w: 960 }, PIXI: {},
      param: () => null, setData: (k, v) => { data[k] = v; }, busy: () => false,
      transientInstance: () => false, homeContext: () => ({ inHome: false }), streetSlot: () => ({}),
    };
    try {
      rookAttackFeature.init(engine);
      rookAttackFeature.restore({ nextAttackAt: T0 + 10 * MIN, stats: { attacks: 3 } });
      assert.equal(rookAttackFeature.save().nextAttackAt, T0 + DAY, 'the old save is migrated on load');
      rookAttackFeature.onStreetEnter({}, engine);
      clock = T0 + HOUR;
      rookAttackFeature.onTick(16, clock, engine);
      assert.equal(rookAttackFeature._state().armState, 'wait');
      // The day is up (time away counts), and the player walks onto the shrine street again.
      clock = T0 + DAY + 5 * MIN;
      rookAttackFeature.onStreetEnter({}, engine);
      rookAttackFeature.onTick(16, clock + 9000, engine);
      assert.equal(rookAttackFeature._state().armState, 'dwell');
      assert.equal(rookAttackFeature._state().save.active, null, 'no Rook on arrival');
      rookAttackFeature.onTick(16, (clock += 2 * MIN), engine);
      const st = rookAttackFeature._state();
      assert.equal(st.armState, 'armed');
      assert.ok(st.arm.startAt - clock >= 3 * MIN && st.arm.startAt - clock <= 20 * MIN);
      assert.equal(st.save.active, null);
      // Leaving for a street without a shrine drops the arm.
      engine.interactables = [];
      rookAttackFeature.onStreetClear(engine);
      rookAttackFeature.onStreetEnter({}, engine);
      rookAttackFeature.onTick(16, (clock += 1000), engine);
      assert.equal(rookAttackFeature._state().armState, 'off');
      assert.equal(rookAttackFeature._state().arm.startAt, 0);
    } finally {
      Date.now = realNow;
      globalThis.PIXI = prevPixi;
      rookAttackFeature.restore(undefined);
    }
  });

  it('QA starts neither check nor move the clock; only the natural start sets it', () => {
    const src = fs.readFileSync(path.join(root, 'js/features/rook-attack-feature.js'), 'utf8');
    const begin = src.slice(src.indexOf('function beginAttack('), src.indexOf('function onAttackStart('));
    assert.match(begin, /if \(scheduled\) scheduleAfterHerald\(save, t\);/);
    assert.equal((src.match(/scheduleAfterHerald\(/g) || []).length, 1);
    assert.equal((src.match(/scheduled: true/g) || []).length, 1);
    assert.match(src, /if \(armState === 'start'\) \{\s*arm = createRookArm\(\);\s*beginAttack\(engine, \{ scheduled: true \}\);/);
    // The rookdemo route starts on demand, whatever the clock, and passes no scheduled flag.
    const demo = src.slice(src.indexOf('function setupDemo('), src.indexOf('function nearestEntry('));
    assert.doesNotMatch(demo, /nextAttackAt|scheduled|applyDailyRule|stepRookArm/);
    assert.match(demo, /beginAttack\(engine, \{ heraldMs: 0 \}\)/);
    // A fight's end leaves the clock alone (it counted from the herald).
    const finish = src.slice(src.indexOf('function finishAttack('), src.indexOf('function handleEvents('));
    assert.doesNotMatch(finish, /nextAttackAt|schedule/i);
    // The pure attack itself never touches a save.
    const save = normalizeRookSave({ rule: 'daily', nextAttackAt: T0 + 5 * HOUR });
    save.active = createRookAttack({ tsid: 'L1', now: T0, heraldMs: 0 });
    stepRookAttack(save.active, T0 + HOUR);
    assert.equal(save.nextAttackAt, T0 + 5 * HOUR);
    assert.equal(save.lastHeraldAt, 0);
  });
});
