import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMPANION_QUOIN_RULES,
  QUOIN_BURST_FULL_SEC,
  QUOIN_SHARD_FX,
  QUOIN_SHARD_RADIUS,
  QUOIN_SHARD_STATS,
  QUOIN_SHARD_TYPES,
  companionTouchesQuoin,
  pickCompanionQuoin,
  planQuoinShards,
  quoinBurstPose,
  quoinShardAmount,
  quoinShardFxPlan,
  quoinShardGrabberSound,
  quoinShardPercentage,
  quoinShardSoundKey,
  quoinTypeShards,
  stackQuoinText,
} from '../public/js/quoin-shards.js?v=25e0d8b4';
import { QUOIN_TYPES, collectQuoin, createQuoinState, creditQuoinStat } from '../public/js/quoins.js?v=237c1d5d';
import { SOUND_ALIASES, SOUND_FILES } from '../public/js/sound-keys.js?v=6aedc206';

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

describe('a quoin\'s amount stays readable (report #181, QuoinAnimation.as)', () => {
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

  it('your amount: 0.4 s in, grown over 0.2 s, the nod, 1.5 s held, 0.4 s rising 40 px and fading', () => {
    assert.equal(QUOIN_BURST_FULL_SEC, 2.8);
    // The circle grows 0.5 s and is back to nothing by 1 s.
    assert.equal(quoinBurstPose(0.5).circle, 1);
    assert.equal(quoinBurstPose(1).circle, 0);
    // No words before 0.4 s; full size at 0.6 s.
    assert.equal(quoinBurstPose(0.39).textScale, 0);
    assert.ok(quoinBurstPose(0.5).textScale > 0.8 && quoinBurstPose(0.5).textScale < 1);
    assert.equal(quoinBurstPose(0.6).textScale, 1);
    // tweenText2 to tweenText5: 2 up, 4 down, 4 up, 2 down in 0.05, 0.1, 0.1, 0.05 s.
    near(quoinBurstPose(0.6).textY, 0, 'nod start');
    assert.ok(quoinBurstPose(0.649).textY < -1.9, 'up 2');
    assert.ok(quoinBurstPose(0.749).textY > 1.9, 'down to +2');
    assert.ok(quoinBurstPose(0.849).textY < -1.9, 'up to -2');
    near(quoinBurstPose(0.91).textY, 0, 'nod end');
    // Held at full strength where it is until 2.4 s.
    for (const t of [0.95, 1.5, 2, 2.39]) {
      const pose = quoinBurstPose(t);
      assert.deepEqual([pose.textScale, pose.textY, pose.textAlpha, pose.done], [1, 0, 1, false], `held at ${t}`);
    }
    // Then it rises 40 px and fades over 0.4 s.
    const mid = quoinBurstPose(2.6);
    assert.ok(mid.textY < -30 && mid.textY > -40 && mid.textAlpha > 0 && mid.textAlpha < 0.2);
    const end = quoinBurstPose(2.81);
    assert.deepEqual([end.textY, end.textAlpha, end.done], [-40, 0, true]);
    // The old float was gone in 55 frames (0.92 s), fading from its first frame.
    assert.ok(QUOIN_BURST_FULL_SEC > 55 / 60 * 3);
  });

  it('someone else\'s shard and a bystander\'s plain burst keep their own short timings', () => {
    assert.equal(quoinBurstPose(0.1, { small: true }).textScale > 0, true, 'a shard shows at once');
    assert.equal(quoinBurstPose(0.5, { small: true }).textY, 0);
    assert.equal(quoinBurstPose(0.69, { small: true }).textAlpha, 1);
    assert.equal(quoinBurstPose(1.11, { small: true }).done, true);
    assert.equal(quoinBurstPose(1.0, { small: true }).done, false);
    assert.equal(quoinBurstPose(0.3, { plain: true }).circle, 1);
    assert.equal(quoinBurstPose(0.51, { plain: true }).done, true);
    assert.equal(quoinBurstPose(-0.1).done, false);
    assert.equal(quoinBurstPose(-0.1).textScale, 0);
  });

  it('with reduced motion the amount shows at once, stays put for the same time and fades in place', () => {
    for (const t of [0, 0.3, 1, 2.39]) {
      const pose = quoinBurstPose(t, { still: true });
      assert.deepEqual([pose.circle, pose.textScale, pose.textY, pose.textAlpha, pose.done], [0, 1, 0, 1, false], `still at ${t}`);
    }
    const fading = quoinBurstPose(2.6, { still: true });
    assert.ok(fading.textAlpha > 0 && fading.textAlpha < 1);
    assert.equal(fading.textY, 0);
    assert.equal(quoinBurstPose(2.81, { still: true }).done, true);
    // A shard is not a full burst: `still` leaves it alone.
    assert.deepEqual(quoinBurstPose(0.1, { small: true, still: true }), quoinBurstPose(0.1, { small: true }));
  });

  it('an amount raised over one still showing sits a line above it', () => {
    const line = QUOIN_SHARD_FX.textLine;
    assert.equal(stackQuoinText([], 100, 200, 80), 200);
    // 60 px apart with 80 px words: they would touch.
    assert.equal(stackQuoinText([{ x: 100, y: 200, w: 80 }], 160, 200, 80), 200 - line);
    // Far enough apart: each at its own quoin, as the client drew them.
    assert.equal(stackQuoinText([{ x: 100, y: 200, w: 80 }], 190, 200, 80), 200);
    // A different height already clears it.
    assert.equal(stackQuoinText([{ x: 100, y: 200, w: 80 }], 100, 200 - line, 80), 200 - line);
    // Two already stacked: the third goes above both.
    assert.equal(stackQuoinText([{ x: 100, y: 200, w: 80 }, { x: 100, y: 200 - line, w: 80 }], 100, 200, 80), 200 - line * 2);
  });

  it('uses the client numbers', { skip: !existsSync(client) && 'glitch-client not beside the spike' }, () => {
    const qa = readFileSync(join(client, 'port/QuoinAnimation.as'), 'utf8');
    const annc = readFileSync(join(client, 'control/engine/AnnouncementController.as'), 'utf8');
    assert.match(qa, /private const move_by:int = 2;/);
    assert.match(qa, /private const move_in:Number = \.05;/);
    assert.match(qa, /private const default_end_circle_size:int = 50;/);
    assert.match(qa, /private const default_end_text_size:Number = 24;/);
    assert.match(qa, /var this_delay:Number = \(is_shard\) \? delay : \.4\+delay;/);
    assert.match(qa, /\{text_perc:1, time:\.2, delay:this_delay, transition:'easeOutCubic', onComplete:tweenText2\}/);
    assert.match(qa, /\{y:val_tf\.y-move_by, delay:0, time:move_in, transition:'easeOutCubic', onComplete:tweenText3\}/);
    assert.match(qa, /\{y:val_tf\.y\+\(move_by\*2\), delay:0, time:move_in\*2, transition:'easeOutCubic', onComplete:tweenText4\}/);
    assert.match(qa, /\{y:val_tf\.y-\(move_by\*2\), delay:0, time:move_in\*2, transition:'easeOutCubic', onComplete:tweenText5\}/);
    assert.match(qa, /\{y:val_tf\.y\+move_by, delay:0, time:move_in, transition:'easeOutCubic', onComplete:tweenText6\}/);
    assert.match(qa, /\{y:val_tf\.y-40, alpha:0, delay:1\.5, time:\.4, transition:'easeOutCubic', onComplete:done\}/);
    assert.match(qa, /\{circle_perc:1, delay:delay, time:\.5, transition:'easeOutBack', onComplete:tweenCircle2\}/);
    // The getter's burst: at the quoin, 15 px up, the default (full) sizes.
    assert.match(annc, /qa\.x = start_x;\s+qa\.y = start_y;[\s\S]{0,200}if \(this_is_the_quoin_getter\) \{[\s\S]{0,300}qa\.go\(0, delta, txt\);/);
    const fx = QUOIN_SHARD_FX;
    assert.deepEqual([fx.text, fx.circle, fx.textDelaySec, fx.textInSec, fx.textBobPx, fx.textBobSec, fx.textHoldSec, fx.textOutSec, fx.textRise, fx.circleInSec, fx.circleOutSec],
      [24, 50, 0.4, 0.2, 2, 0.05, 1.5, 0.4, 40, 0.5, 0.5]);
  });
});

describe('the collector\'s burst on the page (features/quoin-shards-feature.js quoinGotFx)', () => {
  /** Enough of Pixi for the feature's drawing. */
  function fakePixi() {
    class Node {
      constructor() {
        this.children = [];
        this.parent = null;
        this.destroyed = false;
        this.x = 0;
        this.y = 0;
        this.alpha = 1;
        const node = this;
        this.scale = { x: 1, y: 1, set(v) { node.scale.x = v; node.scale.y = v; } };
        this.anchor = { set() {} };
      }
      addChild(...kids) {
        for (const k of kids) {
          k.parent = this;
          this.children.push(k);
        }
        return kids[0];
      }
      destroy() {
        this.destroyed = true;
        if (this.parent) this.parent.children = this.parent.children.filter((k) => k !== this);
      }
    }
    class Graphics extends Node {
      clear() { this.drawn = 0; return this; }
      circle(x, y, r) { this.drawn = r; return this; }
      fill() { return this; }
      stroke() { return this; }
    }
    class Text extends Node {
      constructor({ text, style }) {
        super();
        this.text = text;
        this.style = style;
      }
      // About 0.55 em a letter, like the page's bold face.
      getLocalBounds() { return { width: this.text.length * this.style.fontSize * 0.55 }; }
    }
    return { Container: Node, Graphics, Text };
  }

  async function setup() {
    const { quoinShardsFeature } = await import('../public/js/features/quoin-shards-feature.js?v=f9bffa8e');
    const PIXI = fakePixi();
    const data = {};
    const engine = { PIXI, fxLayer: new PIXI.Container(), setData: (k, v) => { data[k] = v; }, param: () => null };
    quoinShardsFeature.onStreetClear();
    return { feature: quoinShardsFeature, engine, data };
  }
  const tick = (feature, engine, seconds, step = 1 / 60) => {
    for (let t = 0; t < seconds - 1e-9; t += step) feature.onTick(step * 1000, 0, engine);
  };

  it('draws the amount at the quoin, 15 px up, in 24 px words, for 2.8 s', async () => {
    const { feature, engine, data } = await setup();
    const drawn = feature.quoinGotFx({ x: 400, y: 300, label: '+5 iMG' }, engine);
    assert.deepEqual([drawn.x, drawn.y], [400, 285]);
    assert.equal(data.quoinGotFx, '+5 iMG@400,285');
    const words = drawn.node.children.find((k) => k.text);
    assert.equal(words.text, '+5 iMG');
    assert.equal(words.style.fontSize, 24);
    assert.equal(words.style.fill, 0xffffff);
    tick(feature, engine, 0.3);
    assert.equal(words.scale.x, 0, 'no words for the first 0.4 s');
    tick(feature, engine, 0.7);
    assert.equal(words.scale.x, 1);
    assert.equal(words.alpha, 1);
    tick(feature, engine, 1.3);
    assert.deepEqual([words.scale.x, words.alpha, words.y, drawn.node.destroyed], [1, 1, 0, false], 'still there, where it was, 2.3 s on');
    tick(feature, engine, 0.6);
    assert.equal(drawn.node.destroyed, true);
    assert.equal(data.quoinShardFx, '0');
    feature.onStreetClear();
  });

  it('keeps a long line inside 280 px and lifts an amount raised over one still showing', async () => {
    const { feature, engine } = await setup();
    const long = feature.quoinGotFx({ x: 400, y: 300, label: 'No active study to accelerate' }, engine);
    const words = long.node.children.find((k) => k.text);
    tick(feature, engine, 1);
    assert.ok(words.scale.x < 1, 'drawn smaller');
    assert.ok(Math.abs(words.getLocalBounds().width * words.scale.x - QUOIN_SHARD_FX.textMaxWidth) < 1e-6);
    const second = feature.quoinGotFx({ x: 430, y: 300, label: '+5 iMG' }, engine);
    assert.equal(second.y, 285 - QUOIN_SHARD_FX.textLine);
    const far = feature.quoinGotFx({ x: 900, y: 300, label: '+5 iMG' }, engine);
    assert.equal(far.y, 285);
    assert.equal(feature.quoinGotFx({ x: 1, y: 1, label: '' }, engine), null);
    assert.equal(feature.quoinGotFx({ x: 1, y: 1, label: '+1 iMG' }, { ...engine, fxLayer: null }), null);
    feature.onStreetClear();
  });

  it('the pickup shows its amount once: the burst, and the old float only with no layer to draw on', () => {
    const game = read('game.js');
    const grab = game.slice(game.indexOf('function grabWorldQuoin('), game.indexOf('function announceQuoinLimit('));
    assert.match(grab, /quoinGotText\(q\.x, q\.y, copy, rewardDef\.color\);/);
    assert.equal((grab.match(/floatText\(/g) || []).length, 0);
    assert.match(game, /const drawn = features\.query\('quoinGotFx', \{ x, y, label: words \}, engine\);\s+if \(!drawn\?\.node\) return floatText\(x, y - 20, text, color\);/);
    // Everything else a pickup does is still there.
    assert.match(grab, /logGain\(`You collected \$\{/);
    assert.match(grab, /if \(result\.hitLimit\) announceQuoinLimit\(result\.dailyLimit\);/);
    assert.match(grab, /if \(result\.typeId === 'mystery'\) notify\.notice\(/);
    assert.match(grab, /burst\(q\.x, q\.y, rewardDef\.color, result\.typeId === 'qurazy' \? 28 : 12\);/);
    // The feature still leaves the grabber's own burst to the pickup.
    const feature = read('js/features/quoin-shards-feature.js');
    assert.match(feature, /if \(burst\.own\) continue;/);
    // Quest-room quoins show it the same way.
    const rooms = read('js/features/quest-instances-feature.js');
    assert.match(rooms, /if \(result\.amount && engine\.quoinGotText\) engine\.quoinGotText\(x, y, `\+\$\{result\.amount\} \$\{lab\}`, '#ffffff'\);/);
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
    assert.match(game, /playSound\(quoinShare\?\.sound \|\| soundForQuoin\(result\.resolvedTypeId\)/);
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
