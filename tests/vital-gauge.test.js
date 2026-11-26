/**
 * #699 (Austin, 2026-11-26): the Modern top bar's energy and mood rings take their colour from how
 * full they are, as Glitch's gauges did, instead of one colour at every level.
 *
 * Glitch's numbers, checked here:
 * - Energy (glitch-client EnergyGauge.as 122-127, EnergyBar.as 140-142): the share is held in [0, 1)
 *   and the colour is pixel floor(share * 200) of energy_mood_gradient.png, a 200 x 1 ramp from red
 *   through orange and yellow to green. The ring uses 11 of those pixels (every 20th, and the last),
 *   the same samples Classic's energy arc draws (--c-classic-ramp-0..10), picking the one nearest
 *   Glitch's pixel.
 * - Mood (PlayerFaceUI.as 37-45, 232-252): the face's colour steps at 90, 80, 70 and 20%.
 *
 * The cream top bar needs darker shades than Glitch's own (its yellows read 1.6:1 there): each step's
 * Modern colour keeps Glitch's hue and reads at least 3:1 on --surface.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTokens } from './css-tokens.js';
import { parseColour, oklch } from '../tools/tokens/colour.mjs';
import { energyGaugePixel, energyGaugeStep, moodGauge, MOOD_GAUGES } from '../public/js/vitals.js?v=5efac5f3';
import { vitalRing } from '../public/js/ui/topbar.js?v=78373487';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');

// energy_mood_gradient.png (TSEngineAssets/src/assets/graphics), the pixels the ring uses.
const GLITCH_RAMP = [[0, '#cb202e'], [20, '#e4491a'], [40, '#f36213'], [60, '#f98b06'], [80, '#f8b100'], [100, '#f6bf00'], [120, '#d1bc1a'], [140, '#a7b933'], [160, '#83b63d'], [180, '#73b43d'], [199, '#6bb745']];
// PlayerFaceUI.as 37-45: each state's top gradient colour, and the share it starts at.
const GLITCH_FACE = [['sun', 0.9, '#6bcddb'], ['glow', 0.8, '#64d2ad'], ['fair', 0.7, '#cac97e'], ['meh', 0.2, '#b0734b'], ['low', 0, '#644849']];

const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const token = (name) => parseColour(resolveTokens(`var(${name})`).trim());
const hueGap = (a, b) => { const d = Math.abs(oklch(a)[2] - oklch(b)[2]) % 360; return Math.min(d, 360 - d); };

test('energy: Glitch\'s pixel is floor(share * 200), the share held in [0, 1) (EnergyGauge.as 122-127)', () => {
  assert.equal(energyGaugePixel(0, 100), 0);
  assert.equal(energyGaugePixel(1, 200), 1);
  assert.equal(energyGaugePixel(50, 100), 100);
  assert.equal(energyGaugePixel(99.5, 100), 199);
  assert.equal(energyGaugePixel(100, 100), 199, 'a full gauge is the last pixel, not past it ("perc of 1 = black")');
  assert.equal(energyGaugePixel(150, 100), 199, 'over the maximum: Glitch raised the maximum, so the gauge reads full');
  assert.equal(energyGaugePixel(-5, 100), 0);
  assert.equal(energyGaugePixel(5, 0), null, 'no maximum: no step, the ring keeps its plain colour');
});

test('energy: the ring takes the sampled pixel nearest Glitch\'s, at every whole energy', () => {
  for (const max of [100, 180, 237, 1000]) {
    for (let now = 0; now <= max; now++) {
      const px = energyGaugePixel(now, max);
      const step = energyGaugeStep(now, max);
      const gap = Math.abs(GLITCH_RAMP[step][0] - px);
      const best = Math.min(...GLITCH_RAMP.map(([p]) => Math.abs(p - px)));
      assert.equal(gap, best, `${now}/${max}: pixel ${px} took step ${step}`);
    }
  }
  assert.equal(energyGaugeStep(0, 100), 0);
  assert.equal(energyGaugeStep(4, 100), 0);
  assert.equal(energyGaugeStep(6, 100), 1);
  assert.equal(energyGaugeStep(50, 100), 5);
  assert.equal(energyGaugeStep(100, 100), 10);
  assert.equal(energyGaugeStep(5, 0), null);
});

test('mood: Glitch\'s face steps at 90, 80, 70 and 20% (PlayerFaceUI.as 232-252)', () => {
  assert.deepEqual(MOOD_GAUGES, GLITCH_FACE.map(([name]) => name));
  const at = (now) => moodGauge(now, 100);
  assert.deepEqual([at(100), at(90), at(89.9), at(80), at(79), at(70), at(69), at(20), at(19.9), at(1), at(0)],
    ['sun', 'sun', 'glow', 'glow', 'fair', 'fair', 'meh', 'meh', 'low', 'low', 'low']);
  assert.equal(moodGauge(5, 0), null);
});

test('the rings carry their step for the stylesheet', () => {
  assert.equal(vitalRing('energy', 50, 100).gauge, '5');
  assert.equal(vitalRing('energy', 3, 100).gauge, '0');
  assert.equal(vitalRing('mood', 95, 100).gauge, 'sun');
  assert.equal(vitalRing('mood', 12, 100).gauge, 'low');
  assert.equal(vitalRing('energy', 5, 0).gauge, '');
});

test('each step has a token in Glitch\'s hue that reads 3:1 on the top bar', () => {
  const surface = token('--surface');
  const steps = [
    ...GLITCH_RAMP.map(([, glitch], i) => ['energy', String(i), glitch]),
    ...GLITCH_FACE.map(([name, , glitch]) => ['mood', name, glitch]),
  ];
  for (const [stat, step, glitch] of steps) {
    const name = `--${stat}-gauge-${step}`;
    const rule = new RegExp(`\\[data-ui="modern"\\] \\.top-bar \\.ring\\[data-stat="${stat}"\\]\\[data-gauge="${step}"\\] \\{ --c: var\\(${name}\\); \\}`);
    assert.match(css, rule, `${stat} step ${step} sets the ring colour`);
    const ours = token(name);
    assert.ok(ours, `${name} is a colour`);
    const g = parseColour(glitch);
    assert.ok(hueGap(ours, g) <= 6, `${name} keeps Glitch's hue (${glitch}): off by ${hueGap(ours, g).toFixed(1)} degrees`);
    assert.ok(contrast(ours, surface) >= 3, `${name} reads ${contrast(ours, surface).toFixed(2)}:1 on --surface`);
  }
});
