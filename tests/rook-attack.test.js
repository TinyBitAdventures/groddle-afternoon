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
  applyStrike,
  attackDelayMs,
  canStrike,
  canStun,
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
  rookTrantState,
  soloCost,
  stepRookAttack,
  streetIsRookable,
  strikeBeamFor,
  strikeDamageFor,
  stunFeedText,
  stunTableFor,
  useBalmPoint,
} from '../public/js/rook-attack.js';

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
    assert.equal(attackDelayMs(() => 0), 105 * 60 * 1000);
    assert.equal(attackDelayMs(() => 0.5), 112 * 60 * 1000);
    assert.ok(attackDelayMs(() => 0.999) <= 120 * 60 * 1000);
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
      'rook-hover.webp', 'rook-side.webp', 'forehorseman-frantic.webp', 'rooked-halo.png', 'rook-balm-tool.png',
      'rook-head-idle1.png', 'rook-head-angry1.png', 'rook-head-angry2.png', 'rook-head-angry3.png', 'rook-head-stun.png',
      'rook-head-stunned.png', 'rook-head-stunnedHit.png', 'rook-head-killShot.png', 'rook-head-dead.png',
      'piggy-rooked1.png', 'piggy-rooked2.png', 'chicken-rooked1.png', 'chicken-rooked2.png',
      'butterfly-fly-rooked.png', 'butterfly-rest-rooked.png', 'kitty-sad.png',
    ]) {
      assert.ok(fs.existsSync(path.join(root, 'assets/sprites/rooks', file)), file);
    }
  });
});

describe('rook attack feature', async () => {
  const { ROOK_SHEETS, rookAttackFeature } = await import('../public/js/features/rook-attack-feature.js?v=g417-1');
  const { createFeatureHost } = await import('../public/js/feature-host.js');

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

  it('answers the verb-override hooks only for rook verbs and targets', () => {
    const host = createFeatureHost([rookAttackFeature]);
    const engine = { streetSlot: () => ({}), streetTsid: 'L1' };
    assert.equal(host.query('verbOverride', { classId: 'rock_metal_1' }, engine), null);
    assert.equal(host.query('verbOverride', { classId: 'npc_piggy' }, engine), null);
    assert.equal(host.query('runVerbOverride', { classId: 'npc_piggy' }, 'pet', engine), null);
    assert.equal(host.query('verbOverride', { classId: 'npc_shrine_mab' }, engine), null);
  });

  it('saves and restores its slice', () => {
    rookAttackFeature.restore({ nextAttackAt: 123, balmPoints: 3, stats: { defeats: 1 } });
    const slice = rookAttackFeature.save();
    assert.equal(slice.nextAttackAt, 123);
    assert.equal(slice.balmPoints, 3);
    assert.equal(slice.stats.defeats, 1);
    rookAttackFeature.restore(undefined);
    assert.equal(rookAttackFeature.save().active, null);
  });
});
