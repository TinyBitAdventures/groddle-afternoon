/**
 * The interaction hint (Enter + what it acts on) draws over the street's own overlays: during a
 * Rook attack its skulls and feathers covered it (Austin 2026-10-29). It lives on a stage layer
 * that follows the world's camera at draw time and sits just above the world and any
 * 'world-overlay' (the Rook attack's root), under everything else.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8');

describe('the interaction hint stays readable', () => {
  const game = read('game.js');
  it('has its own stage layer that tracks the camera at draw time', () => {
    assert.match(game, /promptLayer\.addChild\(prompt\);\n  promptLayer\.onRender = syncPromptLayer;\n  app\.stage\.addChild\(promptLayer\);/);
    assert.doesNotMatch(game, /fxLayer\.addChild\(prompt\)/);
    assert.match(game, /promptLayer\.position\.copyFrom\(world\.position\);/);
  });
  it('is ordered once a tick just above the world and the street overlays', () => {
    assert.match(game, /syncStreetFront\(\);\n    orderPromptLayer\(\);/);
    assert.match(game, /if \(c\.label === 'world-overlay' && i > top\) top = i;/);
    assert.match(read('js/features/rook-attack-feature.js'), /root\.label = 'world-overlay';\n  stage\.addChild\(root\);/);
  });
});
