import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTokens } from './css-tokens.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VITAL_CRITICAL,
  VITAL_LOW,
  makingNeeds,
  vitalLevel,
  vitalMenuEmpty,
  vitalMenuHeading,
  vitalSnacks,
  vitalTitle,
} from '../public/js/vitals.js?v=85a51302';

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

/**
 * Austin 2026-11-12 (live v0.34.0): "it's currently not possible to eat from this popout menu while
 * crafting". The original let you: food_eat_conditions (items/include/food.js 3-28) has no making
 * check, and making_is_making refuses only another making tool (players/inc_making.js 41-48, 80-88).
 * The menu goes on offering food while a making runs, and keeps back what the batch's next units take.
 */
test('makingNeeds: what a running making still takes, by class', () => {
  const recipe = { inputs: [{ classTsid: 'cheese', qty: 2 }, { classTsid: 'bun', qty: 1 }] };
  assert.deepEqual(makingNeeds({ recipe, qty: 3, made: 0 }), { cheese: 6, bun: 3 });
  assert.deepEqual(makingNeeds({ recipe, qty: 3, made: 2 }), { cheese: 2, bun: 1 });
  assert.deepEqual(makingNeeds({ recipe, qty: 3, made: 3 }), {});
  // The same class twice adds up; nothing running holds nothing.
  assert.deepEqual(makingNeeds({ recipe: { inputs: [{ classTsid: 'apple', qty: 1 }, { classTsid: 'apple', qty: 2 }] }, qty: 2, made: 0 }), { apple: 6 });
  assert.deepEqual(makingNeeds(null), {});
  assert.deepEqual(makingNeeds({ recipe: {}, qty: 1, made: 0 }), {});
});

test('vitalSnacks: a running making keeps its units, the rest stay on the menu', () => {
  const uses = {
    cheese: { usable: true, verb: 'Eat', effects: { energy: 15 } },
    apple: { usable: true, verb: 'Eat', effects: { energy: 10 } },
  };
  const useInfoFor = (id) => uses[id] || { usable: false, effects: {} };
  const inv = { cheese: 6, apple: 3 };
  const held = makingNeeds({ recipe: { inputs: [{ classTsid: 'cheese', qty: 2 }] }, qty: 2, made: 0 });
  assert.deepEqual(vitalSnacks({ inv, stat: 'energy', useInfoFor, held }).map((s) => [s.classTsid, s.count]), [['cheese', 2], ['apple', 3]]);
  // Every cheese spoken for: only the apple is offered.
  assert.deepEqual(vitalSnacks({ inv: { cheese: 4, apple: 3 }, stat: 'energy', useInfoFor, held }).map((s) => s.classTsid), ['apple']);
  // No making: the whole stack, as before.
  assert.deepEqual(vitalSnacks({ inv, stat: 'energy', useInfoFor, held: {} }).map((s) => s.count), [6, 3]);
});

test('game.js draws the states and wires the click to the pack Eat', () => {
  const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
  assert.match(game, /from '\.\/js\/vitals\.js\?v=[0-9a-f]{8}'/);
  // Phase 2: the top bar's rings carry the state (js/ui/topbar.js drawVital).
  const topbar = fs.readFileSync(path.join(root, 'public/js/ui/topbar.js'), 'utf8');
  assert.match(topbar, /pill\.dataset\.vital = r\.level;/);
  assert.match(topbar, /label: vitalTitle\(stat, text, level\)/);
  assert.match(game, /function installVitalsMenu\(\)/);
  assert.match(game, /installVitalsMenu\(\);/);
  assert.match(game, /vitalSnacks\(\{ inv, stat, useInfoFor: getPackUseInfo, held: makingNeeds\(activeCraftSession\) \}\)/);
  // Eating never touches the making: the menu's path has no cancel or close of the Make panel.
  const menu = game.slice(game.indexOf('function refreshVitalsMenu()'), game.indexOf('function installPlayerMenu()'));
  assert.doesNotMatch(menu, /cancelMakeCraft|closeMakePanel|activeCraftSession = /);
  assert.match(game, /usePackItem\(btn\.dataset\.vitalUse, 1\)/);
});

test('style.css: amber, red with a pulse, no pulse under reduced motion', () => {
  const css = resolveTokens(fs.readFileSync(path.join(root, 'public/style.css'), 'utf8'));
  // The old bar's states stay for a Classic skin; the modern rings (PAPER block) carry them now.
  const block = css.slice(css.indexOf('/* ===== VITALS (g458'));
  assert.ok(block.length > 100, 'the VITALS block');
  assert.match(block, /\.meta-pill\[data-vital="low"\] \{/);
  assert.match(block, /\.meta-pill\[data-vital="critical"\] \{[^}]*animation: vital-pulse/);
  assert.match(block, /@media \(prefers-reduced-motion: reduce\) \{ \.meta-pill\[data-vital="critical"\] \{ animation: none; \} \}/);
  const paper = css.slice(css.indexOf('(phase 2, Warm paper: the modern top bar'));
  assert.match(paper, /\.ring\[data-vital="low"\] \{ --c: #f2a31b;/);
  assert.match(paper, /\.ring\[data-vital="critical"\]::before \{[^}]*animation: hud-ring-pulse/);
  assert.match(paper, /@media \(prefers-reduced-motion: reduce\) \{\n  \[data-ui="modern"\] \.top-bar \.ring\[data-vital="critical"\]::before \{ animation: none;/);
  // Readable numbers and pill words: 4.5:1 or better on their backgrounds.
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const surface = '#fbf5ea';
  assert.match(paper, /\.ring\[data-vital="low"\] \.ring-num \{ color: #9a5800; \}/);
  assert.match(paper, /\.ring\[data-vital="critical"\] \.ring-num \{ color: #bf3127; \}/);
  for (const [fg, bg] of [['#33241a', surface], ['#9a5800', surface], ['#bf3127', surface], ['#7a4300', '#fff1d6'], ['#ffffff', '#bf3127']]) {
    assert.ok(ratio(fg, bg) >= 4.5, `${fg} on ${bg}: ${ratio(fg, bg).toFixed(2)}`);
  }
  const html = fs.readFileSync(path.join(root, 'public/play/index.html'), 'utf8');
  assert.match(html, /href="style\.css\?v=[0-9a-f]{8}"/);
});
