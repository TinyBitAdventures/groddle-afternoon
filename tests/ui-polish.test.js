import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');

function pngSize(file) {
  const bytes = fs.readFileSync(file);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

test.describe('responsive chrome polish', () => {
  test('uses exact single-cell Bubble Tree frames at every maturity', () => {
    for (const maturity of [1, 3, 5, 7, 10]) {
      const file = path.join(
        publicRoot,
        `assets/sprites/trants/frames/trant_bubble_m${maturity}.png`
      );
      assert.deepEqual(pngSize(file), { width: 167, height: 277 });
    }
  });

  test('ships a static boot cover and removes it only after initialization', () => {
    const html = fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(publicRoot, 'style.css'), 'utf8');
    const game = fs.readFileSync(path.join(publicRoot, 'game.js'), 'utf8');
    assert.match(html, /<body class="is-booting">/);
    assert.match(html, /id="boot-loader"/);
    assert.match(html, /Loading Groddle Afternoon/);
    assert.match(css, /\.boot-loader\s*\{[\s\S]*position:\s*fixed/);
    assert.match(game, /bootLoader\.hidden = true/);
    assert.match(game, /Groddle could not finish loading/);
  });

  test('renders only complete activity bubbles and enlarges large-screen chrome', () => {
    const css = fs.readFileSync(path.join(publicRoot, 'style.css'), 'utf8');
    const game = fs.readFileSync(path.join(publicRoot, 'game.js'), 'utf8');
    assert.match(game, /feed\.children\.length > 4/);
    assert.doesNotMatch(
      css.match(/\.activity-feed\s*\{[\s\S]*?\}/)?.[0] || '',
      /max-height/
    );
    assert.match(css, /@media \(min-width: 1500px\)/);
    assert.match(css, /\.pack-slots \.inv-slot,[\s\S]*?width:\s*52px/);
  });
});
