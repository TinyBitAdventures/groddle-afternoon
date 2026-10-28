// The top bar in three clusters (Austin 2026-10-27): you (the name, then mood
// and energy stacked in one card, as PlayerInfoUI.as kept them with the face),
// progress (level, iMG) and wallet (currants, quoins), every card two lines tall,
// all one gap apart (Austin 2026-10-28).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pub = join(import.meta.dirname, '..', 'public');
const html = readFileSync(join(pub, 'play/index.html'), 'utf8');
const css = readFileSync(join(pub, 'style.css'), 'utf8');
const game = readFileSync(join(pub, 'game.js'), 'utf8');
const newxp = readFileSync(join(pub, 'js/features/newxp-feature.js'), 'utf8');

const bar = html.slice(html.indexOf('<header class="top-bar">'), html.indexOf('<div class="top-actions">'));
const cluster = (name) => {
  const at = bar.indexOf(`data-hud-cluster="${name}"`);
  assert.ok(at > 0, `${name} cluster`);
  const next = bar.indexOf('data-hud-cluster=', at + 1);
  return bar.slice(at, next < 0 ? bar.length : next);
};
const order = (text, ...needles) => {
  let last = -1;
  for (const n of needles) {
    const at = text.indexOf(n);
    assert.ok(at > last, `${n} in order`);
    last = at;
  }
};

describe('top bar clusters', () => {
  it('runs you, progress, wallet, then the buttons', () => {
    order(bar, 'data-hud-cluster="you"', 'data-hud-cluster="progress"', 'data-hud-cluster="wallet"');
    order(cluster('you'), 'id="player-menu-btn"', 'class="meta-vitals"', 'id="bar-mood"', 'id="stat-mood"', 'id="bar-energy"', 'id="stat-energy"');
    order(cluster('progress'), 'id="level-meter"', 'id="stat-img"');
    order(cluster('wallet'), 'id="stat-currants"', 'id="quoin-stat"');
  });

  it('keeps the new-player tour able to hide progress and wallet but not mood and energy', () => {
    // newxp-feature.js hides .metabolics-cluster's children that are not mood or energy pills.
    assert.match(newxp, /body\.nx-hide-meta \.metabolics-cluster>:not\(\.meta-pill\)/);
    const meta = bar.slice(bar.indexOf('<div class="metabolics-cluster">'));
    assert.doesNotMatch(meta, /meta-pill|data-hud-cluster="you"/);
    assert.match(meta, /data-hud-cluster="progress"[\s\S]*data-hud-cluster="wallet"/);
    assert.match(css, /body\.nx-hide-mood\.nx-hide-energy \.meta-vitals \{ visibility: hidden; \}/);
  });

  it('gives every card one height, one side padding and one gap, inside and between clusters (2026-10-28)', () => {
    const card = /\.hud-cluster > \.meta-vitals,\n\.hud-cluster > \.level-meter,\n\.hud-cluster > \.meta-stat \{([^}]*)\}/.exec(css);
    assert.ok(card, 'one rule for every card');
    assert.match(card[1], /height: var\(--hud-card-h\)/);
    assert.match(card[1], /padding: 0 var\(--hud-pad-x\)/);
    assert.match(css, /\.top-bar \{\n  --hud-card-h: [\d.]+rem;\n  --hud-gap: [\d.]+rem;\n  --hud-pad-x: [\d.]+rem;\n  gap: var\(--hud-gap\);/);
    assert.match(css, /\.hud-cluster \{[^}]*gap: var\(--hud-gap\);/);
    assert.match(css, /\.metabolics-cluster \{[^}]*gap: var\(--hud-gap\);/);
    assert.doesNotMatch(css, /--hud-gap-(in|out)/, 'no second gap');
    // The name's hover pad overhangs into the gap, so the gap counts from its text.
    assert.match(css, /\.hud-you \.brand \{ margin-right: -0\.35rem; min-width: 0; \}/);
    assert.match(css, /@media \(max-width: 560px\) \{\n  \.top-bar \{ --hud-card-h: [\d.]+rem; --hud-gap: [\d.]+rem; \}\n  \.hud-you,\n  \.metabolics-cluster,\n  \.top-actions \{ flex: 1 1 100%; \}/);
    assert.doesNotMatch(css, /\.metabolics-cluster \{ justify-content: space-between; \}/);
  });

  it('writes the mood and energy numbers beside the bars and on hover', () => {
    assert.match(game, /\['stat-mood', 'Mood', pc\.mood, moodMax\(pc\)\], \['stat-energy', 'Energy', pc\.energy, energyCap\(\)\]/);
    assert.match(game, /num\.parentElement\.title = `\$\{label\} \$\{text\}`;/);
  });
});
