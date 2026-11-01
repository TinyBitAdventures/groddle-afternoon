/**
 * Player reports of 2026-11-01 (Safari, macOS): input that the game held on to.
 * - 23: the avatar walked right on its own, across streets, after a right click while walking
 *   (js/held-keys.js; glitch-client KeyBeacon.as reset 97-107, 231-245, 251-259, 322-324).
 * - 22: a menu opened in mid-air left the avatar floating until it closed.
 * - 17: Enter went to the butterfly just milked, not the tree walked up to
 *   (LocationInputHandler.as _beginInteractionAfterEnterKey 208-237).
 * - 16: Esc that closes a panel also left Safari's full screen.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHeldKeys, installHeldKeyGuard, isMacPlatform, isEditableTarget } from '../public/js/held-keys.js?v=98b96620';

const game = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/game.js'), 'utf8');

const press = (held, keys, key, code, extra = {}) => {
  held.keydown({ key, code, isTrusted: true, ...extra });
  keys.add(key); // game.js's own keydown adds the name
};

describe('held keys (report 23)', () => {
  it('lets go of a key whose name changed under Option or Shift (by its code)', () => {
    const keys = new Set();
    const held = createHeldKeys(keys);
    press(held, keys, 'd', 'KeyD');
    held.keyup({ key: '∂', code: 'KeyD' });
    assert.equal(keys.size, 0);
    press(held, keys, 'ArrowRight', 'ArrowRight');
    held.keyup({ key: 'ArrowRight', code: 'ArrowRight' });
    assert.equal(keys.size, 0);
  });

  it('lets go of everything when Cmd or Ctrl comes up (KeyBeacon._keyUpFire 255-259)', () => {
    const keys = new Set();
    const why = [];
    const held = createHeldKeys(keys, { onRelease: (r) => why.push(r) });
    press(held, keys, 'Meta', 'MetaLeft');
    press(held, keys, 'd', 'KeyD');
    held.keyup({ key: 'Meta', code: 'MetaLeft' }); // the d release never comes on a Mac
    assert.equal(keys.size, 0);
    assert.deepEqual(why, ['cmd-up']);
  });

  it('on a Mac a fresh Right, Left, A or D starts the held keys over (KeyBeacon 231-245)', () => {
    const keys = new Set(['ArrowRight']); // stuck: its keyup went to a context menu
    const held = createHeldKeys(keys, { mac: true });
    press(held, keys, 'a', 'KeyA');
    assert.deepEqual([...keys], ['a']);
    // A repeat, Shift held, or a scripted press does not reset.
    keys.add('ArrowUp');
    held.keydown({ key: 'a', code: 'KeyA', repeat: true, isTrusted: true });
    held.keydown({ key: 'D', code: 'KeyD', shiftKey: true, isTrusted: true });
    held.keydown({ key: 'ArrowRight', code: 'ArrowRight', isTrusted: false });
    assert.ok(keys.has('ArrowUp'));
    // Off a Mac, no reset (EnvironmentUtil.is_mac).
    const pc = new Set(['ArrowRight']);
    press(createHeldKeys(pc, { mac: false }), pc, 'a', 'KeyA');
    assert.ok(pc.has('ArrowRight'));
  });

  it('ignores keys typed into a text field', () => {
    const keys = new Set(['ArrowRight']);
    const held = createHeldKeys(keys, { mac: true });
    held.keydown({ key: 'd', code: 'KeyD', isTrusted: true, target: { matches: (sel) => sel.includes('input') } });
    assert.ok(keys.has('ArrowRight'));
    assert.equal(isEditableTarget({ isContentEditable: true }), true);
    assert.equal(isEditableTarget({ matches: () => false }), false);
  });

  it('knows a Mac from the platform', () => {
    assert.equal(isMacPlatform({ platform: 'MacIntel' }), true);
    assert.equal(isMacPlatform({ userAgentData: { platform: 'macOS' } }), true);
    assert.equal(isMacPlatform({ platform: 'Win32' }), false);
  });

  it('releases on blur, a context menu, a hidden page, full screen and a text field', () => {
    const win = new EventTarget();
    const doc = new EventTarget();
    doc.visibilityState = 'visible';
    const keys = new Set();
    const why = [];
    installHeldKeyGuard(keys, { win, doc, mac: false, onRelease: (r) => why.push(r) });
    const fire = (target, type, init = {}) => target.dispatchEvent(Object.assign(new Event(type), init));
    keys.add('d');
    fire(win, 'blur');
    keys.add('d');
    fire(doc, 'contextmenu');
    keys.add('d');
    doc.visibilityState = 'hidden';
    fire(doc, 'visibilitychange');
    keys.add('d');
    fire(doc, 'webkitfullscreenchange');
    keys.add('d');
    const field = new EventTarget();
    field.matches = (sel) => sel.includes('input');
    doc.dispatchEvent(Object.defineProperty(new Event('focusin'), 'target', { value: field }));
    keys.add('d');
    fire(win, 'pagehide');
    assert.deepEqual(why, ['blur', 'contextmenu', 'hidden', 'fullscreen', 'text-field', 'pagehide']);
    assert.equal(keys.size, 0);
    // Nothing held: nothing to report.
    fire(win, 'blur');
    assert.equal(why.length, 6);
  });

  it('listens for key releases in the capture phase, ahead of panels that stop them', () => {
    const calls = [];
    const win = { addEventListener: (type, fn, capture) => calls.push([type, capture === true]), navigator: { platform: 'MacIntel' } };
    installHeldKeyGuard(new Set(), { win, doc: null });
    assert.deepEqual(calls.filter(([t]) => t === 'keyup' || t === 'keydown'), [['keydown', true], ['keyup', true]]);
  });

  it('game.js installs the guard and lets go of keys on a new street and when a menu takes the avatar', () => {
    assert.match(game, /import \{ installHeldKeyGuard \} from '\.\/js\/held-keys\.js(\?v=[0-9a-f]{8})?';/);
    assert.match(game, /const keys = new Set\(\);\n[\s\S]{0,300}const heldKeys = installHeldKeyGuard\(keys, /);
    assert.match(game, /function clearWorldEntities\(\) \{[\s\S]{0,200}heldKeys\.releaseAll\('street'\);/);
    assert.match(game, /if \(gameplayInputBlocked\(\)\) \{[\s\S]{0,600}if \(!inputWasBlocked\) heldKeys\.releaseAll\('held'\);/);
  });

  it('a right or middle click does nothing to the world (BootStrap.as 38-55)', () => {
    assert.match(game, /app\.canvas\.addEventListener\('pointerdown', \(e\) => \{\n[^\n]*\n[\s\S]{0,300}if \(e\.pointerType === 'mouse' && e\.button !== 0\) return;/);
  });
});
