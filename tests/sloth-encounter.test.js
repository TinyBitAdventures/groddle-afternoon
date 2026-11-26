/**
 * G889 (#245): the Sloth drawn from Tiny Speck's npc_sloth.swf and its animations played at the
 * GSJS moments (items/npc_sloth.js setState / setStateComplete / createSnail / hideSloth).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SLOTH_SHEETS } from '../public/js/sloth-art.js?v=a2768e2f';
import { SLOTH_FULL_PEEK_GAP_MS, SLOTH_LINES, SLOTH_PEEK_GAP_MS, chooseSlothLine, slothCellAt, slothIdleTick, slothLabelMs, slothTimeline } from '../public/js/sloth-encounter.js?v=d78eba08';
import { slothFeedPlan } from '../public/js/resource-nodes.js?v=7d42d002';

const anims = (steps) => steps.filter((s) => s.anim).map((s) => s.anim);

describe('Sloth encounter timeline', () => {
  it('plays cells at 15 a second: loopers wrap, the rest hold their last', () => {
    assert.equal(slothCellAt('eat', 0, true), 0);
    assert.equal(slothCellAt('eat', 1000, true), 15 % SLOTH_SHEETS.eat.count);
    assert.equal(slothCellAt('eat', 10_000, true), 150 % SLOTH_SHEETS.eat.count);
    assert.equal(slothCellAt('drop', 10_000), SLOTH_SHEETS.drop.count - 1);
    assert.equal(slothLabelMs('drop'), 1000, 'drop is the 1 s setState gives it');
  });

  it('drops when the knock gets it down, then idles (setState idle from hidden)', () => {
    const steps = slothTimeline('arrive');
    assert.deepEqual(anims(steps), ['drop']);
    assert.deepEqual(steps.find((s) => s.idle), { at: 1000, idle: true });
    // 1.5 s in it says a drop line for 3 s, on a timer a feed does not cancel (npc_sloth.js 695).
    assert.deepEqual(steps.find((s) => s.say), { at: 1500, say: 'drop', ms: 3000, keep: true });
  });

  it('speaks the GSJS lines in bubbles, never the same one twice running (chooseTalk)', () => {
    assert.equal(SLOTH_LINES.drop.length, 4);
    assert.equal(SLOTH_LINES.thanks[0], 'That was SO METAL! Thanks for the Rods, brah!');
    assert.deepEqual(SLOTH_LINES.yawn, ['Yawn... See ya']);
    let last = '';
    for (let i = 0; i < 50; i += 1) {
      const line = chooseSlothLine('thanks', last, () => (i % 7) / 7);
      assert.ok(SLOTH_LINES.thanks.includes(line));
      assert.notEqual(line, last);
      last = line;
    }
    assert.equal(chooseSlothLine('yawn', 'Yawn... See ya'), 'Yawn... See ya', 'one line repeats');
    const says = (event, opts) => slothTimeline(event, opts).filter((s) => s.say).map((s) => [s.say, s.ms]);
    assert.deepEqual(says('hide'), [['yawn', 5000]]);
    assert.deepEqual(says('feed', { plan: { rounds: [], doneMs: 1500 } }), [['thanks', 5000]]);
    assert.deepEqual(says('feed', { plan: { rounds: [], doneMs: 1500 }, full: true }), [['thanks', 5000]]);
    assert.deepEqual(says('peek'), []);
  });

  it('answers a knock from the leaves when full or when you have no Metal Rod (callSloth 312-336)', () => {
    assert.deepEqual(SLOTH_LINES.full, ['Sod off, I\'m full!', 'I just ate and don\'t want to move. Maybe later.', 'Ugh, I was just down there. Maybe later']);
    assert.equal(SLOTH_LINES.noRod.length, 4);
    assert.equal(SLOTH_LINES.noRod[0], 'I ain\'t comin\' down, brah. You don\'t have any Metal Rods!');
    assert.equal(SLOTH_FULL_PEEK_GAP_MS, 7000);
  });

  it('idles on hangIdle1 or hangIdle2 every 3-6 s (onIdleTick)', () => {
    assert.deepEqual(slothIdleTick(() => 0), { anim: 'hangIdle1', nextMs: 3000 });
    assert.deepEqual(slothIdleTick(() => 0.99), { anim: 'hangIdle2', nextMs: 6000 });
  });

  it('chews, spits each round and chews again, then finishes eating (createSnail, metalizeComplete)', () => {
    const plan = { max: 8, rounds: [{ atMs: 3000, snails: 3, count: 3, rod: 3 }, { atMs: 5500, snails: 4, count: 7, rod: 7 }, { atMs: 8500, snails: 1, count: 8, rod: 7 }], doneMs: 10000 };
    const steps = slothTimeline('feed', { plan });
    assert.deepEqual(steps.filter((s) => s.anim).map((s) => [s.at, s.anim]), [
      [0, 'eat'], [3000, 'spit'], [4500, 'eat'], [5500, 'spit'], [7000, 'eat'], [8500, 'spit'], [10000, 'finishedEating'], [11000, 'talk'],
    ]);
    assert.equal(steps.at(-1).idle, true);
    // After the 8th rod it climbs away at once (metalize_count > 7 -> hideSloth).
    const full = slothTimeline('feed', { plan, full: true });
    assert.deepEqual(full.slice(-2), [{ at: 10000, anim: 'climbUp', say: 'thanks', ms: 5000 }, { at: 15000, hidden: true }]);
  });

  it('climbs up after 20 s without a rod, and peeks when walked under', () => {
    assert.deepEqual(slothTimeline('hide'), [{ at: 0, anim: 'climbUp', say: 'yawn', ms: 5000 }, { at: 5000, hidden: true }]);
    assert.deepEqual(anims(slothTimeline('peek')), ['peek', 'peekIdle', 'peekWithdraw']);
    assert.equal(slothTimeline('peek').at(-1).hidden, true);
    assert.deepEqual(anims(slothTimeline('peekSpit')), ['peek', 'peekSpit', 'peekIdle', 'peekWithdraw']);
    assert.equal(SLOTH_PEEK_GAP_MS, 20000);
  });

  it('swaps the rod after every spit and plays each sound at its moment', () => {
    const plan = { max: 9, rounds: [{ atMs: 3000, snails: 2, count: 2, rod: 2 }, { atMs: 6000, snails: 4, count: 6, rod: 6 }, { atMs: 8500, snails: 3, count: 9, rod: 7 }], doneMs: 10000 };
    const steps = slothTimeline('feed', { plan });
    assert.deepEqual(steps.filter((s) => s.rod).map((s) => [s.at, s.rod]), [[0, 1], [3000, 2], [6000, 6], [8500, 7]]);
    assert.deepEqual(steps.filter((s) => s.sound).map((s) => [s.at, s.sound]), [[0, 'CHOOSE_ROD'], [3000, 'SLOTH_SPIT'], [6000, 'SLOTH_SPIT'], [8500, 'SLOTH_SPIT']]);
    // SLOTH_EAT loops while it chews: from the rod, and 1.5 s after each spit but the last; each spit stops it.
    assert.deepEqual(steps.filter((s) => s.eatSound).map((s) => s.at), [0, 4500, 7500]);
    assert.deepEqual(steps.filter((s) => s.stopEat).map((s) => s.at), [3000, 6000, 8500]);
    assert.equal(slothTimeline('arrive')[0].sound, 'SLOTH_ARRIVES');
    assert.equal(slothTimeline('peekSpit').find((s) => s.anim === 'peekSpit').sound, 'SLOTH_PEAK_AND_SPIT');
  });

  it('spits every round a real feed plans', () => {
    const plan = slothFeedPlan(() => 0.5);
    const spits = slothTimeline('feed', { plan }).filter((s) => s.anim === 'spit');
    assert.deepEqual(spits.map((s) => s.at), plan.rounds.map((r) => r.atMs));
  });
});
