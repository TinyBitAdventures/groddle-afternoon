/**
 * Other players' Glitches and the freed idle sheets (G334, "an intermittent Pixi addressModeU
 * error"). A Glitch with your look is drawn from your own animation pack (engine.glitchPack ->
 * getAppearanceTextures, cached by look), so when it plays a random idle it shows frames from
 * the idle sheet your avatar loaded. game.js frees a random idle sheet when your next idle is a
 * different one (dropIdleSheet: one at a time in memory). The other Glitch's sprite still held
 * the old frames, so the next render bound a destroyed texture ("Cannot read properties of null
 * (reading 'addressModeU')" from Pixi's GlTextureSystem.updateStyle) and every frame after it
 * threw: the street froze for that player. Now dropIdleSheet tells the features which packs it
 * refilled before it destroys the sheet, and the realtime feature draws those Glitches again
 * from the refilled frames.
 * Run: node --test tests/remote-idle-frames.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { remotesOnFreedFrames } from '../public/js/features/realtime-feature.js?v=8ce73ca1';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');

/** The body of `function name(` in `src`, up to the next top-level function. */
function fnBody(src, name) {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} is in the source`);
  const end = src.indexOf('\n}\n', at);
  return src.slice(at, end);
}

describe('remotesOnFreedFrames', () => {
  const mine = { idle2: ['old frame'] };
  const theirs = { idle2: ['their frame'] };
  const remote = (id, anims, st = 'idle2', destroyed = false) => ({ id, st, pack: { anims }, body: { destroyed } });

  it('picks the Glitches drawn from a refilled pack', () => {
    const a = remote(1, mine);
    const b = remote(2, theirs);
    assert.deepEqual(remotesOnFreedFrames([a, b], new Set([mine])).map((r) => r.id), [1]);
  });

  it('picks every Glitch sharing the pack, whatever state it shows', () => {
    const a = remote(1, mine, 'idle2');
    const b = remote(2, mine, 'walk2x');
    assert.deepEqual(remotesOnFreedFrames(new Map([[1, a], [2, b]]).values(), new Set([mine])).map((r) => r.id), [1, 2]);
  });

  it('skips Glitches that are gone or never drawn', () => {
    const gone = remote(1, mine, 'idle2', true);
    const fresh = remote(2, mine, null);
    const bare = { id: 3, st: 'idle2', pack: { anims: mine } };
    assert.deepEqual(remotesOnFreedFrames([gone, fresh, bare, null], new Set([mine])), []);
  });

  it('picks nothing when no pack was refilled', () => {
    assert.deepEqual(remotesOnFreedFrames([remote(1, mine)], new Set()), []);
    assert.deepEqual(remotesOnFreedFrames([remote(1, mine)], null), []);
  });
});

describe('the freed idle sheet goes only after the other Glitches let go of it', () => {
  it('dropIdleSheet tells the features which packs it refilled before it releases the sheet', () => {
    const body = fnBody(read('public/game.js'), 'dropIdleSheet');
    const hook = body.indexOf("features.collect('glitchFramesFreed', refilled, engine)");
    const release = body.indexOf('sheet.release?.()');
    assert.ok(hook > 0, 'the hook is called');
    assert.ok(release > hook, 'the sheet is released after the hook');
    assert.match(body, /fillPackAnims\(p\);\s*refilled\.add\(p\.anims\);/);
  });

  it('the realtime feature answers the hook by drawing those Glitches again', () => {
    const src = read('public/js/features/realtime-feature.js');
    assert.match(src, /glitchFramesFreed\(anims\) \{\s*session\?\.framesFreed\(anims\);/);
    const body = fnBody(src, 'framesFreed');
    assert.match(body, /remotesOnFreedFrames\(remotes\.values\(\), anims\)/);
    assert.match(body, /r\.st = null;\s*applyAnim\(r, st\);/);
  });

  it('a Glitch with your look really is drawn from your pack (why it shares your idle sheets)', () => {
    const game = read('public/game.js');
    assert.match(game, /glitchPack\(look\) \{\s*return getAppearanceTextures\(/);
    // The cached pack comes back for another player as it is (G614: your own look also asks that every sheet is in).
    const body = fnBody(game, 'getAppearanceTextures');
    assert.match(body, /const cached = appearanceTexCache\.get\(key\);\s*if \(cached && \(!full \|\| packComplete\(cached\)\)\) return cached;/);
    assert.match(body, /if \(!pack\.pending\) appearanceTexCache\.set\(key, pack\);/);
  });
});
