import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMPANION_QUOIN_RULES,
  QUOIN_SHARD_FX,
  QUOIN_SHARD_RADIUS,
  QUOIN_SHARD_STATS,
  QUOIN_SHARD_TYPES,
  companionTouchesQuoin,
  pickCompanionQuoin,
  planQuoinShards,
  quoinShardAmount,
  quoinShardFxPlan,
  quoinShardGrabberSound,
  quoinShardPercentage,
  quoinShardSoundKey,
  quoinTypeShards,
} from '../public/js/quoin-shards.js';
import { QUOIN_TYPES, collectQuoin, createQuoinState, creditQuoinStat } from '../public/js/quoins.js';
import { SOUND_ALIASES, SOUND_FILES } from '../public/js/sound-keys.js';

const here = import.meta.dirname;
const pub = join(here, '../public');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const quoinJs = join(here, '../../glitch-GameServerJS/items/quoin.js');
const client = join(here, '../../glitch-client/com/tinyspeck/engine');

describe('quoin shards against items/quoin.js', { skip: !existsSync(quoinJs) && 'glitch-GameServerJS not beside the spike' }, () => {
  const src = existsSync(quoinJs) ? readFileSync(quoinJs, 'utf8') : '';
  const body = src.slice(src.indexOf('function distributeQuoinShards'), src.indexOf('function onCreate'));

  it('shards only iMG, mood, energy and currants quoins', () => {
    const line = body.split('\n').find((l) => l.includes("this.instanceProps.type != 'xp'"));
    const types = [...line.matchAll(/type != '(\w+)'/g)].map((m) => m[1]);
    assert.deepEqual(types, [...QUOIN_SHARD_TYPES]);
    for (const id of ['mystery', 'favor', 'time', 'qurazy']) assert.equal(quoinTypeShards(id), false, id);
    assert.deepEqual(QUOIN_SHARD_STATS, { xp: 'iMG', mood: 'mood', energy: 'energy', currants: 'currants' });
  });

  it('uses the 300 px radius', () => {
    assert.match(body, /var dist_threshold = 300;/);
    assert.equal(QUOIN_SHARD_RADIUS, 300);
  });

  it('matches the source share at every distance from 0 to 300 px', () => {
    // Evaluate the source's own expressions (items/quoin.js 108-118).
    const pctExpr = body.match(/shard_percentage = (Math\.max\(0\.50-\(0\.50\*\(\(players\[i\]\.dist - 25\)\/275\)\), 0\.050\));/)[1];
    const amountExpr = body.match(/final_amount = (Math\.max\(Math\.round\(amount \* quoin_multiplier \* shard_percentage\), 1\));/)[1];
    assert.match(body, /var shard_percentage = 0\.50;\s+if \(players\[i\]\.dist > 25\)\{/);
    const sourcePct = new Function('dist', `const players = [{ dist }]; const i = 0; let shard_percentage = 0.50; if (dist > 25) shard_percentage = ${pctExpr}; return shard_percentage;`);
    const sourceAmount = new Function('amount', 'quoin_multiplier', 'shard_percentage', `return ${amountExpr};`);
    for (let d = 0; d <= 300; d += 0.5) {
      assert.equal(quoinShardPercentage(d), sourcePct(d), `pct at ${d}`);
      for (const [amount, mult] of [[5, 1], [7, 1], [10, 3], [12, 2.5], [25, 1], [100, 4]]) {
        assert.equal(quoinShardAmount(amount, mult, d), sourceAmount(amount, mult, sourcePct(d)), `amount ${amount}x${mult} at ${d}`);
      }
    }
  });

  it('pins the shape of the curve: 50% to 25 px, 5% floor from 272.5 px', () => {
    assert.equal(quoinShardPercentage(0), 0.5);
    assert.equal(quoinShardPercentage(25), 0.5);
    assert.ok(Math.abs(quoinShardPercentage(162.5) - 0.25) < 1e-12);
    assert.ok(Math.abs(quoinShardPercentage(272.5) - 0.05) < 1e-12);
    assert.equal(quoinShardPercentage(290), 0.05);
    assert.equal(quoinShardPercentage(300), 0.05);
    // At least one, even at 5% of a 1-point quoin; a falsy multiplier counts as 1.
    assert.equal(quoinShardAmount(1, 1, 300), 1);
    assert.equal(quoinShardAmount(5, 0, 0), 3);
    assert.equal(quoinShardAmount(5, 1, 0), Math.round(2.5));
  });

  it('plays QUOIN_SHARD_<n> held to 2-9, by crowd for receivers and shards + 1 for the grabber', () => {
    assert.match(body, /var sound = 'QUOIN_SHARD_'\+Math\.min\(Math\.max\(players\.length, 2\), 9\);/);
    assert.match(src, /sound = 'QUOIN_SHARD_'\+Math\.min\(Math\.max\(shards\.length\+1, 2\), 9\);/);
    assert.equal(quoinShardSoundKey(0), 'QUOIN_SHARD_2');
    assert.equal(quoinShardSoundKey(1), 'QUOIN_SHARD_2');
    assert.equal(quoinShardSoundKey(4), 'QUOIN_SHARD_4');
    assert.equal(quoinShardSoundKey(40), 'QUOIN_SHARD_9');
    assert.equal(quoinShardGrabberSound(0), null);
    assert.equal(quoinShardGrabberSound(1), 'QUOIN_SHARD_2');
    assert.equal(quoinShardGrabberSound(3), 'QUOIN_SHARD_4');
    assert.equal(quoinShardGrabberSound(12), 'QUOIN_SHARD_9');
  });

  it('skips followers and AFK Glitches but counts them in the crowd', () => {
    assert.match(body, /if \(players\[i\]\.pc\.followee\) continue;/);
    assert.match(body, /if \(players\[i\]\.pc\.is_afk\) continue;/);
    const plan = planQuoinShards({
      typeId: 'xp',
      amount: 5,
      grabber: { x: 1000, y: 500 },
      players: [
        { id: 'far', x: 1290, y: 500 },
        { id: 'near', x: 1010, y: 500 },
        { id: 'follower', x: 1100, y: 500, following: true },
        { id: 'afk', x: 900, y: 500, afk: true },
        { id: 'out', x: 1301, y: 500 },
        { id: 'edge', x: 1000, y: 800 },
        { id: 'tripled', x: 1150, y: 500, multiplier: 3 },
      ],
    });
    assert.equal(plan.crowd, 7, 'grabber + six in the radius (300 px exactly is in)');
    assert.equal(plan.receiverSound, 'QUOIN_SHARD_7');
    assert.deepEqual(plan.receivers.map((r) => r.id), ['near', 'tripled', 'far', 'edge']);
    assert.deepEqual(plan.receivers.map((r) => r.amount), [3, Math.round(5 * 3 * quoinShardPercentage(150)), 1, 1]);
    assert.equal(planQuoinShards({ typeId: 'favor', amount: 5, grabber: { x: 0, y: 0 }, players: [{ id: 'a', x: 0, y: 0 }] }).applies, false);
  });

  it('distributes the benefit before the grabber multiplier (onPlayerCollision 169 then 171-174)', () => {
    const i = src.indexOf('var shards = this.distributeQuoinShards(pc, amount);');
    const j = src.indexOf('amount = Math.round(amount * personal_multiplier);');
    assert.ok(i > 0 && j > i);
    const state = createQuoinState({ multiplier: 3 });
    const result = collectQuoin(state, 'xp', { imagination: 0, xp: 0, level: 5 });
    assert.equal(result.baseAmount, QUOIN_TYPES.xp.baseAmount);
    assert.equal(result.amount, QUOIN_TYPES.xp.baseAmount * 3);
  });
});

describe('a shard goes through the normal quoin reward path', () => {
  it('credits the stat without touching the daily quoin count', () => {
    const pc = { imagination: 10, xp: 10, level: 5, mood: 40, energy: 30, currants: 3 };
    assert.equal(creditQuoinStat(pc, 'currants', 4), 4);
    assert.equal(pc.currants, 7);
    assert.equal(creditQuoinStat(pc, 'energy', 6), 6);
    assert.equal(pc.energy, 36);
    // stats_add_xp takes the mood bonus, so iMG lands as the mood scale says.
    assert.ok(creditQuoinStat(pc, 'xp', 3) > 0);
    assert.ok(pc.imagination > 10);
    assert.equal(creditQuoinStat(pc, 'favor', 3), 0);
  });

  it('lands nothing on a full tank, so no shard shows (items/quoin.js 176)', () => {
    const pc = { mood: 100, energy: 100, level: 1 };
    assert.equal(creditQuoinStat(pc, 'mood', 5), 0);
    assert.equal(creditQuoinStat(pc, 'energy', 5), 0);
  });

  it('collectQuoin still pays each type as before', () => {
    const state = createQuoinState();
    const pc = { imagination: 0, xp: 0, level: 1, mood: 10, energy: 10, currants: 0 };
    assert.equal(collectQuoin(state, 'currants', pc).actual, QUOIN_TYPES.currants.baseAmount);
    assert.equal(pc.currants, QUOIN_TYPES.currants.baseAmount);
    assert.equal(collectQuoin(state, 'mood', pc).actual, QUOIN_TYPES.mood.baseAmount);
    assert.equal(state.collectedToday, 2);
  });
});

describe('the shard picture (glitch-client doQuoinGot)', () => {
  const shards = [
    { id: 'Amp', x: 110, y: 500, delta: 2, stat: 'iMG' },
    { id: 'player', x: 240, y: 500, delta: 1, stat: 'iMG' },
    { id: 'Lily', x: 350, y: 500, delta: 1, stat: 'iMG' },
  ];

  it('chains bolts from the quoin through each receiver, 0.2 s apart', () => {
    const plan = quoinShardFxPlan({ quoin: { x: 100, y: 420 }, grabberIsViewer: false, viewerId: 'player', shards });
    assert.equal(plan.show, true);
    assert.deepEqual(plan.bolts.map((b) => [b.x1, b.y1, b.x2, b.y2, b.delaySec]), [
      [100, 405, 110, 440, 0],
      [110, 440, 240, 440, 0.2],
      [240, 440, 350, 440, 0.4],
    ]);
    // Your own shard shows its amount; others their place in the crowd; the quoin a small 1.
    assert.deepEqual(plan.bursts.map((b) => [b.value, b.small, b.delaySec]), [
      [2, true, 0.2], [1, false, 0.4], [4, true, 0.6], [1, true, 0],
    ]);
    assert.equal(plan.bursts[1].stat, 'iMG');
  });

  it('shows a grabber their crowd numbers and keeps their own amount at the quoin', () => {
    const plan = quoinShardFxPlan({ quoin: { x: 100, y: 420 }, grabberIsViewer: true, shards: shards.filter((s) => s.id !== 'player'), delta: 5, stat: 'iMG' });
    assert.deepEqual(plan.bursts.map((b) => b.value), [2, 3, 5]);
    assert.equal(plan.bursts.at(-1).own, true);
  });

  it('shows a bystander only a plain burst', () => {
    const plan = quoinShardFxPlan({ quoin: { x: 100, y: 420 }, grabberIsViewer: false, viewerId: 'player', shards: [shards[0]] });
    assert.equal(plan.show, false);
    assert.equal(plan.bolts.length, 0);
    assert.deepEqual(plan.bursts.map((b) => b.plain), [true]);
  });

  it('uses the client numbers', { skip: !existsSync(client) && 'glitch-client not beside the spike' }, () => {
    const annc = readFileSync(join(client, 'control/engine/AnnouncementController.as'), 'utf8');
    const qa = readFileSync(join(client, 'port/QuoinAnimation.as'), 'utf8');
    const bolt = readFileSync(join(client, 'view/effects/LightningBolt.as'), 'utf8');
    assert.match(annc, /var small_text_size:int = 16;/);
    assert.match(annc, /var small_circle_size:int = 34;/);
    assert.match(annc, /shard_y = shard_pc\.y-60;/);
    assert.match(annc, /var start_y:int = int\(annc\.y\)-15;/);
    assert.match(annc, /bolt\.go\(\.2\*\(m\), 1\.5,/);
    assert.match(annc, /qa\.go\(delay, m\+2, '', small_text_size, small_circle_size, true\);/);
    assert.match(qa, /color_num = \(is_shard\) \? 0xF0F0BD : 0xffffff;/);
    assert.match(bolt, /fade_in_secs:Number = \.2;/);
    assert.match(bolt, /fade_out_secs:Number = \.8;/);
    assert.equal(QUOIN_SHARD_FX.smallText, 16);
    assert.equal(QUOIN_SHARD_FX.smallCircle, 34);
    assert.equal(QUOIN_SHARD_FX.receiverLift, 60);
    assert.equal(QUOIN_SHARD_FX.startLift, 15);
    assert.equal(QUOIN_SHARD_FX.shardColor, 0xf0f0bd);
    assert.equal(QUOIN_SHARD_FX.boltSec, 1.5);
  });
});

describe('companion quoin interest (remake rule)', () => {
  const companion = { x: 1000, y: 600, minX: 700, maxX: 1400 };
  const quoins = [
    { typeId: 'xp', x: 1100, y: 540 },
    { typeId: 'favor', x: 1010, y: 540 },
    { typeId: 'mood', x: 1500, y: 540 },
    { typeId: 'energy', x: 1180, y: 420 },
  ];

  it('picks the nearest sharing quoin on its platform, near you, that you are not about to take', () => {
    assert.equal(pickCompanionQuoin({ companion, quoins, player: { x: 900, y: 600 } }), quoins[0]);
    // You are right under it: leave it to you.
    assert.equal(pickCompanionQuoin({ companion, quoins: [quoins[0]], player: { x: 1090, y: 600 } }), null);
    // Too far from you to shard you: it is not flocking.
    assert.equal(pickCompanionQuoin({ companion, quoins: [quoins[0]], player: { x: 1500, y: 600 } }), null);
    // Off its platform, out of reach or not a sharing type.
    assert.equal(pickCompanionQuoin({ companion, quoins: [quoins[1], quoins[2], quoins[3]], player: { x: 900, y: 600 } }), null);
  });

  it('takes one quoin per street visit', () => {
    assert.equal(COMPANION_QUOIN_RULES.perVisit, 1);
    assert.equal(pickCompanionQuoin({ companion: { ...companion, grabs: 1 }, quoins, player: { x: 900, y: 600 } }), null);
  });

  it('touches a quoin within its body height', () => {
    assert.equal(companionTouchesQuoin({ x: 1000, y: 600 }, { x: 1020, y: 540 }), true);
    assert.equal(companionTouchesQuoin({ x: 1000, y: 600 }, { x: 1040, y: 540 }), false);
    assert.equal(companionTouchesQuoin({ x: 1000, y: 600 }, { x: 1000, y: 400 }), false);
  });
});

describe('wiring', () => {
  it('has a recovered take for every crowd size', () => {
    for (let n = 2; n <= 9; n += 1) {
      const key = `QUOIN_SHARD_${n}`;
      const file = SOUND_FILES[key] || SOUND_FILES[SOUND_ALIASES[key]];
      assert.ok(file, key);
      assert.ok(existsSync(join(pub, file)), file);
    }
  });

  it('routes the player grab, companions and the Grab Em Good rival through the feature', () => {
    const game = read('game.js');
    assert.match(game, /features\.query\('quoinShards', \{\s+grabber: 'player',[\s\S]{0,120}baseAmount: result\.baseAmount,/);
    assert.match(game, /playSound\(quoinShare\?\.sound \|\| soundForQuoin\(result\.typeId\)/);
    assert.match(game, /get localCompanions\(\) \{/);
    assert.match(game, /takeQuoin\(q\) \{/);
    assert.match(game, /params\.has\('quoinshard'\)\) return true;/);
    const races = read('js/features/races-feature.js');
    assert.match(races, /engine\.query\('quoinShards', \{/);
    const index = read('js/features/index.js');
    assert.match(index, /import \{ quoinShardsFeature \} from '\.\/quoin-shards-feature\.js\?v=[\w-]+'; FEATURES\.push\(quoinShardsFeature\);/);
  });

  it('loads quoin-shards.js under one key', () => {
    const feature = read('js/features/quoin-shards-feature.js');
    const keys = [...feature.matchAll(/'\.\.\/quoin-shards\.js(\?v=[\w-]+)?'/g)].map((m) => m[1] || '');
    assert.equal(new Set(keys).size, 1);
  });
});
