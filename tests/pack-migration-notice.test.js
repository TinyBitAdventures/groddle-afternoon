/**
 * A fresh solo save says what happened to its pack once (lead's report 2026-10-30, the Social lane's
 * paper-1280-solo-open shot: "Your pack has 16 slots now." beside the full line, both in the log).
 *
 * The short line was not the game's: the Social lane's shot script raised it itself
 * (groddleQA.notify.notice('Your pack has 16 slots now.')). The game's own path is bags-feature
 * migrate() -> say(): pushActivity(text) and toast(text, 5000) with the same words, which the
 * notifier (js/notify.js notice: same key within SAME_EVENT_MS) folds into one card and one log
 * line. This pins that: one notice, one log line, the full wording, and no second line on a reload.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNotifier } from '../public/js/notify.js?v=d85330ff';
import { bagsFeature } from '../public/js/features/bags-feature.js?v=65fc537f';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A solo engine whose pushActivity and toast are game.js's: both the one notifier. */
function soloEngine(inv) {
  let t = 1000;
  const notify = createNotifier({ now: () => t, clock: () => t });
  return {
    notify,
    tick: (ms) => { t += ms; notify.tick?.(t); },
    engine: {
      mode: 'solo', inv, started: true, param: () => null, setData() {},
      pushActivity: (msg) => notify.activity(msg),
      toast: (msg, ms) => notify.notice(msg, { ms }),
    },
  };
}

/** 30 different single stacks: more than the 16 pack slots, so the migration mints bags. */
const crowded = () => Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`zz_single_${i}`, 1]));

describe('the pack migration notice', () => {
  it('a fresh solo save shows the full line once, as one card and one log line', () => {
    const { notify, engine } = soloEngine(crowded());
    bagsFeature.restore(undefined, engine);
    bagsFeature.packLayout(engine);
    bagsFeature.packLayout(engine);
    const about = (rows) => rows.filter((r) => /slots now/.test(r.text));
    const cards = about(notify.notices);
    const lines = about(notify.entries);
    assert.equal(cards.length, 1, cards.map((c) => c.text).join(' / '));
    assert.equal(lines.length, 1, lines.map((c) => c.text).join(' / '));
    assert.match(cards[0].text, /^Your pack has 16 slots now\. Everything you carried is packed into .+\.$/);
    assert.equal(lines[0].text, cards[0].text);
    assert.equal(cards[0].count, 1, 'not counted as a repeat');
  });

  it('a reload of the migrated save says nothing more', () => {
    const first = soloEngine(crowded());
    bagsFeature.restore(undefined, first.engine);
    bagsFeature.packLayout(first.engine);
    const saved = bagsFeature.save();
    const again = soloEngine(first.engine.inv);
    bagsFeature.restore(saved, again.engine);
    bagsFeature.packLayout(again.engine);
    assert.equal(again.notify.entries.filter((r) => /slots now/.test(r.text)).length, 0);
  });

  it('the game raises no short "16 slots now" line of its own', () => {
    const src = readFileSync(join(root, 'public/js/features/bags-feature.js'), 'utf8');
    // The two lines that start this way both go on with what was packed or given.
    const starts = [...src.matchAll(/Your pack has \$\{PACK_CAPACITY\} slots now\.([^`]*)`/g)].map((m) => m[1].trim());
    assert.equal(starts.length, 2);
    for (const rest of starts) assert.ok(rest.length > 10, rest);
    assert.doesNotMatch(readFileSync(join(root, 'public/game.js'), 'utf8'), /slots now/);
  });
});
