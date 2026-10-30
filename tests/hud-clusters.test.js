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

const bar = html.slice(html.indexOf('<header class="top-bar"'), html.indexOf('<div class="top-actions'));
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

// Phase 2 (Warm paper): the clusters live on in the modern bar's left pill (js/ui/topbar.js),
// in the HUD mock's order: energy and mood rings, the level ring, then iMG, currants, favor, quoins.
describe('top bar clusters', () => {
  it('runs you, progress, wallet, then the buttons', () => {
    order(bar, 'id="hud-stats"', 'data-hud-cluster="you"', 'data-hud-cluster="progress"', 'data-hud-cluster="wallet"');
    assert.match(bar, /<div class="meta-vitals hud-cluster" data-hud-cluster="you">/);
    order(cluster('you'), 'meta-pill energy', 'id="bar-energy"', 'id="stat-energy"', 'meta-pill mood', 'id="bar-mood"', 'id="stat-mood"');
    order(cluster('progress'), 'id="player-menu-btn"', 'id="level-meter"', 'id="stat-level"', 'id="low-energy-btn"', 'id="stat-img"');
    order(cluster('wallet'), 'id="stat-currants"', 'id="favor-stat"', 'id="quoin-stat"');
  });

  it('keeps the new-player tour able to hide progress and wallet but not mood and energy', () => {
    // newxp-feature.js hides .metabolics-cluster's children that are not mood or energy pills.
    assert.match(newxp, /body\.nx-hide-meta \.metabolics-cluster>:not\(\.meta-pill\)/);
    const meta = bar.slice(bar.indexOf('<div class="metabolics-cluster">'));
    assert.doesNotMatch(meta, /meta-pill|data-hud-cluster="you"/);
    assert.match(meta, /data-hud-cluster="progress"[\s\S]*data-hud-cluster="wallet"/);
    assert.match(css, /body\.nx-hide-mood\.nx-hide-energy \.meta-vitals \{ visibility: hidden; \}/);
    // Sound stays while the tour hides the other actions.
    assert.match(newxp, /body\.nx-hide-actions \.top-actions>:not\(#mute-btn\):not\(#sound-btn\)/);
  });

  it('draws the pills 44 px tall over the world, scoped to the modern skin', () => {
    assert.match(css, /--hud-h: 44px;/);
    const block = css.slice(css.indexOf('/* —— PAPER —— (phase 2'), css.indexOf('/* —— end PAPER —— */'));
    assert.ok(block.length > 1000, 'the PAPER block');
    assert.match(block, /\[data-ui="modern"\] header\.top-bar,[\s\S]*?\{\n  position: absolute;[\s\S]*?height: var\(--hud-h\);[\s\S]*?pointer-events: none;/);
    assert.match(block, /\[data-ui="modern"\] \.top-bar \.hud-pill \{[^}]*height: var\(--hud-h\);[^}]*border-radius: var\(--radius-pill\);/);
    assert.match(block, /\[data-ui="modern"\] \.street-nameplate \{[^}]*height: var\(--hud-h\);/);
    for (const rule of block.matchAll(/\n([^\n{}@]+)\{/g)) {
      for (const sel of rule[1].split(',')) {
        const t = sel.trim();
        if (!t || /^(from|to|\d+%)/.test(t)) continue;
        assert.match(t, /\[data-ui="modern"\]/, `${t} is scoped to the modern skin`);
      }
    }
  });

  it('writes the rings from game state through js/ui/topbar.js', () => {
    assert.match(game, /renderTopBar\(document, \{\n\s*energy: \[pc\.energy, energyCap\(\)\],\n\s*mood: \[pc\.mood, moodMax\(pc\)\],\n\s*level: levelInfo,/);
    assert.match(game, /installTopBar\(document, \{/);
  });
});
