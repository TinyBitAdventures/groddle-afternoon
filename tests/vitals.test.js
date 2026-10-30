import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTokens } from './css-tokens.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VITAL_CRITICAL,
  VITAL_LOW,
  vitalLevel,
  vitalMenuEmpty,
  vitalMenuHeading,
  vitalSnacks,
  vitalTitle,
} from '../public/js/vitals.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('thresholds: amber under 20%, red under 10% (UI audit 2)', () => {
  assert.equal(VITAL_LOW, 0.2);
  assert.equal(VITAL_CRITICAL, 0.1);
  assert.equal(vitalLevel(80, 100), 'ok');
  assert.equal(vitalLevel(20, 100), 'ok');
  assert.equal(vitalLevel(19, 100), 'low');
  assert.equal(vitalLevel(10, 100), 'low');
  assert.equal(vitalLevel(9.9, 100), 'critical');
  assert.equal(vitalLevel(6, 100), 'critical');
  assert.equal(vitalLevel(0, 100), 'critical');
  // Shares, not points: a bigger energy cap moves the line.
  assert.equal(vitalLevel(39, 400), 'critical');
  assert.equal(vitalLevel(60, 400), 'low');
  assert.equal(vitalLevel(60, 300), 'ok');
  // Unknown numbers never alarm.
  assert.equal(vitalLevel(NaN, 100), 'ok');
  assert.equal(vitalLevel(5, 0), 'ok');
});

test('the state in words as well as colour, and the click it offers', () => {
  assert.equal(vitalTitle('energy', '6/100', 'critical'), 'Energy 6/100 (very low). Click for something to eat.');
  assert.equal(vitalTitle('mood', '15/100', 'low'), 'Mood 15/100 (low). Click for something to lift it.');
  assert.equal(vitalTitle('energy', '80/100', 'ok'), 'Energy 80/100. Click for something to eat.');
  for (const text of [vitalTitle('mood', '1/2', 'low'), vitalMenuHeading('mood'), vitalMenuHeading('energy'), vitalMenuEmpty('mood'), vitalMenuEmpty('energy')]) {
    assert.doesNotMatch(text, /—/, 'no em dashes in player copy');
  }
});

test('vitalSnacks: ordinary Eat and Drink that raise the stat, most first', () => {
  const uses = {
    meat: { usable: true, verb: 'Eat', effects: { energy: 9 } },
    cheese: { usable: true, verb: 'Eat', effects: { energy: 30, mood: 4 } },
    beer: { usable: true, verb: 'Drink', effects: { mood: 15, energy: 2 } },
    spinach: { usable: true, verb: 'Eat', buff: { id: 'spinach' }, effects: { energy: 5 } },
    licorice: { usable: true, verb: 'Munch', effects: { energy: 3 } },
    ticket: { usable: true, verb: 'Eat', paradise: true, effects: { energy: 20 } },
    pick: { usable: false, verb: 'Use', effects: {} },
  };
  const inv = { meat: 3, cheese: 1, beer: 2, spinach: 4, licorice: 1, ticket: 1, pick: 1, apple: 0 };
  const useInfoFor = (id) => uses[id] || { usable: false, effects: {} };
  assert.deepEqual(vitalSnacks({ inv, stat: 'energy', useInfoFor }).map((s) => [s.classTsid, s.gain, s.count]), [['cheese', 30, 1], ['meat', 9, 3], ['beer', 2, 2]]);
  assert.deepEqual(vitalSnacks({ inv, stat: 'mood', useInfoFor }).map((s) => s.classTsid), ['beer', 'cheese']);
  assert.equal(vitalSnacks({ inv, stat: 'energy', useInfoFor, limit: 1 }).length, 1);
  assert.deepEqual(vitalSnacks({ inv: {}, stat: 'energy', useInfoFor }), []);
  assert.deepEqual(vitalSnacks({}), []);
});

test('game.js draws the states and wires the click to the pack Eat', () => {
  const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
  assert.match(game, /from '\.\/js\/vitals\.js\?v=g458-\d+'/);
  assert.match(game, /pill\.dataset\.vital = level;/);
  assert.match(game, /function installVitalsMenu\(\)/);
  assert.match(game, /installVitalsMenu\(\);/);
  assert.match(game, /vitalSnacks\(\{ inv, stat, useInfoFor: getPackUseInfo \}\)/);
  assert.match(game, /usePackItem\(btn\.dataset\.vitalUse, 1\)/);
});

test('style.css: amber, red with a pulse, no pulse under reduced motion', () => {
  const css = resolveTokens(fs.readFileSync(path.join(root, 'public/style.css'), 'utf8'));
  const block = css.slice(css.indexOf('/* ===== VITALS (g458'));
  assert.ok(block.length > 100, 'the VITALS block');
  assert.match(block, /\.meta-pill\[data-vital="low"\] \{/);
  assert.match(block, /\.meta-pill\[data-vital="critical"\] \{[^}]*animation: vital-pulse/);
  assert.match(block, /@media \(prefers-reduced-motion: reduce\) \{ \.meta-pill\[data-vital="critical"\] \{ animation: none; \} \}/);
  // Readable numbers: 4.5:1 or better on their backgrounds.
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  for (const [fg, bg] of [['#4b5b64', '#f6fbfd'], ['#7a4100', '#fff1d6'], ['#9b1c1f', '#ffe3e1']]) {
    assert.ok(block.includes(fg), `${fg} in the block`);
    assert.ok(ratio(fg, bg) >= 4.5, `${fg} on ${bg}: ${ratio(fg, bg).toFixed(2)}`);
  }
  const html = fs.readFileSync(path.join(root, 'public/play/index.html'), 'utf8');
  assert.match(html, /&amp;vitals=g458-\d+&amp;(?:\w+=[\w-]+&amp;)*backdrop=/);
});
