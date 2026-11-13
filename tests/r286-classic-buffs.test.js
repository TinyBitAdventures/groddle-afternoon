/**
 * Report #286 (Classic, 1920x1080): the Meditation cooldown chip sat over the energy arc, and the
 * energy line was hard to read on a bright sky. The client lined the buffs up right of the energy
 * line (BuffViewManager.as refresh: x = PlayerInfoUI energy_w + BuffUI.RADIUS + 10, y 20 under the
 * header), and lifted the line off the world with a drop shadow (PlayerInfoUI.as 175).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buffsLeftPx } from '../public/js/classic/classic-topbar.js?v=269916b3';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('report #286: Classic buffs clear of the energy arc', () => {
  it('the strip starts at the energy line\'s right edge, in the stage\'s px', () => {
    assert.equal(buffsLeftPx(201.4, 28), '173px');
    assert.equal(buffsLeftPx(10, 40), '0px');
    assert.equal(buffsLeftPx(undefined, undefined), '0px');
  });

  it('classic-topbar measures the line on every sync, resize and line resize', () => {
    const js = read('public/js/classic/classic-topbar.js');
    assert.match(js, /const sync = \(\) => \{[^}]*placeBuffs\(\); \};/);
    assert.match(js, /new win\.ResizeObserver\(placeBuffs\)\.observe\(energyLine\)/);
    assert.match(js, /strip\.style\.setProperty\('--classic-buffs-x', x\)/);
  });

  it('classic.css puts the strip 13 u past the line, centred 20 u under the header; the line has a halo', () => {
    const css = read('public/css/classic.css');
    const block = css.slice(css.indexOf('/* === rep13 (lane) === */'), css.indexOf('/* === end rep13 === */'));
    assert.ok(block.length > 0, 'the lane block exists');
    assert.ok(css.indexOf('/* === rep13 (lane) === */') < css.indexOf('/* == TICKETS =='), 'above TICKETS');
    assert.match(block, /#game-root #buff-strip \{\s*left: calc\(var\(--classic-buffs-x, calc\(150 \* var\(--cu\)\)\) \+ 13 \* var\(--cu\)\);\s*top: calc\(20 \* var\(--cu\)\);\s*transform: translateY\(-50%\);/);
    assert.match(block, /\.classic-energy-text \{[^}]*text-shadow:[^}]*var\(--c-classic-page\)/);
  });
});
