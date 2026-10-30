import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');

/** Pulls one top-level function out of game.js by name. */
function fnSource(name) {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} in game.js`);
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unclosed ${name}`);
}

const make = new Function(
  'app',
  'VIEW_W',
  'VIEW_H',
  `${fnSource('spriteWorldHitBox')}\n${fnSource('targetPageRect')}\nreturn targetPageRect;`,
);
const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600 }) };
const targetPageRect = make({ canvas }, 960, 600);
const rr = { left: 0, top: 0, width: 960, height: 600 };

test('the verb menu anchors to another player, whose hit box is an empty Container', () => {
  // party-feature.js registers remote players as a Container with no children and an explicit hit size.
  const parent = { toGlobal: ({ x, y }) => ({ x: x - 100, y: y - 50 }) };
  const hit = { x: 400, y: 500, _worldHitW: 64, _worldHitH: 172, parent, getBounds: () => ({ x: 0, y: 0, width: 0, height: 0 }) };
  const r = targetPageRect({ sprite: hit }, rr);
  assert.ok(r, 'a rect, not null');
  assert.deepEqual(r, { left: 268, top: 278, right: 332, bottom: 450 });
});

test('a sprite with real bounds still uses them', () => {
  const spr = { getBounds: () => ({ x: 10, y: 20, width: 30, height: 40 }) };
  assert.deepEqual(targetPageRect({ sprite: spr }, rr), { left: 10, top: 20, right: 40, bottom: 60 });
});
