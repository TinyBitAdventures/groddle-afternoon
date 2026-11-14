/**
 * G578 (live report #146, 2026-11-08): a resource node's gains float with the item's icon beside
 * the words, from one helper every node shares (Dust Traps, peat, barnacles, jellisacs, ice...).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { floatGain } from '../public/js/features/resource-nodes-feature.js?v=214ac1c9';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('#146 resource node gains show their item', () => {
  it('floatGain asks floatText for the icon of the class it gave', () => {
    const calls = [];
    floatGain({ floatText: (...a) => calls.push(a) }, 100, 200, 'plain_metal', 3);
    assert.equal(calls.length, 1);
    const [x, y, text, , opts] = calls[0];
    assert.deepEqual([x, y, opts], [100, 200, { icon: 'plain_metal' }]);
    assert.match(text, /^\+3 /);
  });

  it('every node result goes through it', () => {
    const f = readFileSync(join(root, 'public/js/features/resource-nodes-feature.js'), 'utf8');
    const apply = f.slice(f.indexOf('function applyResult('), f.indexOf('for (const counter of result.achievementCounters'));
    assert.match(apply, /floatGain\(engine, anchorX, anchorY - lift, classTsid, qty\);/);
    assert.doesNotMatch(apply, /engine\.floatText\(anchorX, anchorY - lift, `\+\$\{itemLabel/);
  });

  it("a node's rolled drop (a Dust Trap's finds) floats each item with its icon too", () => {
    const d = readFileSync(join(root, 'public/js/features/drops-feature.js'), 'utf8');
    assert.match(d, /const icon = paid\.landed\?\.items\?\.\[i\]\?\.classTsid;/);
    assert.match(d, /0xffe39a, icon \? \{ icon \} : undefined\);/);
  });

  it('floatText draws the pack icon beside the words, one float (game.js)', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    const fn = game.slice(game.indexOf('function floatText('), game.indexOf('function burst('));
    assert.match(fn, /if \(opts\.icon\) \{/);
    assert.match(fn, /new PIXI\.Sprite\(textureFromUrl\(itemIconUrl\(opts\.icon\)\)\)/);
    assert.match(fn, /float\.addChild\(icon, t\);/);
    assert.match(fn, /fxLayer\.addChild\(float\);/);
  });
});
