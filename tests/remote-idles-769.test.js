/**
 * #769: other players' Glitches stood frozen. The realtime feature drew them with
 * animForState(st, { idles: false }), so standing was the still frame, and never loaded their idle
 * sheets, so a random idle the owner sent showed the still stand-in too. Glitch drew every avatar
 * from the state its owner sent (AbstractAvatarView _animateAndOrientFromS): STAND is the idle4
 * loop (AvatarAnimationState DEFAULT_IDLE_STR), the random idles and the doze come over as their
 * own states. Now js/remote-idles.js loads the sheets lazily under a cap and the feature draws
 * the idles (the packs here are real avatar-pack.js packs over stand-in frames).
 * Run: node --test tests/remote-idles-769.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHEET_FRAMES, animForState } from '../public/js/avatar-anims.js?v=fb921bf4';
import { fillPackAnims } from '../public/js/avatar-pack.js?v=65324246';
import * as remoteIdles from '../public/js/remote-idles.js?v=e370b3fa';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');

/** A look's pack: its base sheet in, its idle sheets from its own loader (counted). */
function look(name, loads = []) {
  const frames = (sheet) => SHEET_FRAMES[sheet].map((fn) => ({ look: name, sheet, fn }));
  const idleLoader = async (sheet) => {
    loads.push(`${name}:${sheet}`);
    return { frames: frames(sheet) };
  };
  return fillPackAnims({ key: name, sheets: { base: { frames: frames('base') } }, idleLoader, anims: {} });
}

/** game.js ensureIdleSheet and dropIdleSheet, as far as a pack goes. */
const ensure = async (pack, name) => {
  const sheet = await pack.idleLoader(name);
  pack.sheets[name] = sheet;
  fillPackAnims(pack);
  return true;
};
const drops = [];
const drop = (pack, name) => {
  drops.push(`${pack.key}:${name}`);
  delete pack.sheets[name];
  fillPackAnims(pack);
  return true;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const real = (pack, anim) => pack.anims[anim].some((tex) => tex.sheet !== 'base');

const need = () => remoteIdles;

describe('#769: another player standing idles as Glitch drew them', () => {
  it('standing is the idle4 loop once their look idles; the random idles and the doze are their own', () => {
    const { remoteIdleSheet, REMOTE_IDLE_STAND_MS } = need();
    assert.deepEqual(animForState('stand', { idles: true }), { anim: 'idle4', loop: true });
    assert.equal(remoteIdleSheet('stand', 0), null, 'not for a pause between steps');
    assert.equal(remoteIdleSheet('stand', REMOTE_IDLE_STAND_MS), 'idle4');
    for (const st of ['idle1', 'idle2', 'idle3', 'idle4']) assert.equal(remoteIdleSheet(st), st);
    assert.equal(remoteIdleSheet('afk'), 'idleSleepy');
    assert.equal(remoteIdleSheet('wake'), 'idleSleepy');
    assert.equal(remoteIdleSheet('idle0'), null, 'the still stand is in the base sheet');
    assert.equal(remoteIdleSheet('walk2x'), null);
  });

  it('loads idle4 after they stand a moment, and their stand plays its real frames', async () => {
    const { createRemoteIdles, REMOTE_IDLE_STAND_MS } = need();
    const loads = [];
    const pack = look('ada', loads);
    const ready = [];
    const ctl = createRemoteIdles({ ensure, drop, own: () => null, cap: 3, onReady: (p, n) => ready.push(n) });
    const r = { pack, st: 'stand' };
    ctl.step([r], 0);
    assert.equal(ctl.idles(r), true);
    assert.deepEqual(loads, []);
    assert.equal(real(pack, 'idle4'), false, 'the still stand-in until then');
    ctl.step([r], REMOTE_IDLE_STAND_MS);
    await settle();
    assert.deepEqual(loads, ['ada:idle4']);
    assert.deepEqual(ready, ['idle4']);
    assert.ok(real(pack, 'idle4'), 'idle4 now draws from its own sheet');
  });

  it('plays the random idle they send and gives its sheet back after; the doze when they go AFK', async () => {
    const { createRemoteIdles } = need();
    const loads = [];
    const pack = look('bo', loads);
    drops.length = 0;
    const ctl = createRemoteIdles({ ensure, drop, cap: 3 });
    const r = { pack, st: 'idle2' };
    ctl.step([r], 0);
    await settle();
    assert.deepEqual(loads, ['bo:idle2']);
    assert.ok(real(pack, 'idle2'));
    r.st = 'stand';
    ctl.step([r], 100);
    assert.deepEqual(drops, ['bo:idle2'], 'one random idle in memory, as your own');
    r.st = 'afk';
    ctl.step([r], 200);
    await settle();
    assert.ok(pack.anims.afk.some((tex) => tex.sheet === 'idleSleepy'), 'the doze from idleSleepy');
  });

  it('a look drawn from your own idle sheets idles without a slot', () => {
    const { createRemoteIdles } = need();
    const mine = look('me');
    const twin = { ...mine, key: 'me-twin' };
    const ctl = createRemoteIdles({ ensure, drop, own: () => mine, cap: 0 });
    const r = { pack: twin, st: 'stand' };
    ctl.step([r], 0);
    assert.equal(ctl.idles(r), true);
    assert.equal(ctl.stats().slots, 0);
  });
});

describe('#769: a busy street does not stall or fill memory', () => {
  it('caps the looks that idle, frees a slot when its players leave, and hands it on', async () => {
    const { createRemoteIdles, REMOTE_IDLE_STAND_MS } = need();
    const loads = [];
    drops.length = 0;
    const a = { pack: look('a', loads), st: 'stand' };
    const b = { pack: look('b', loads), st: 'stand' };
    const ctl = createRemoteIdles({ ensure, drop, cap: 1 });
    ctl.step([a, b], 0);
    ctl.step([a, b], REMOTE_IDLE_STAND_MS);
    await settle();
    assert.equal(ctl.idles(a), true);
    assert.equal(ctl.idles(b), false, 'past the cap: the still stand, as before');
    assert.deepEqual(loads, ['a:idle4']);
    // a leaves: its sheets go, b takes the slot.
    ctl.step([b], REMOTE_IDLE_STAND_MS + 100);
    assert.deepEqual(drops, ['a:idle4']);
    assert.equal(ctl.idles(b), true);
    ctl.step([b], REMOTE_IDLE_STAND_MS * 2 + 200);
    await settle();
    assert.deepEqual(loads, ['a:idle4', 'b:idle4']);
  });

  it('loads one sheet at a time across the street, and one random idle sheet at a time', async () => {
    const { createRemoteIdles } = need();
    const loads = [];
    let release;
    const slow = (pack, name) => new Promise((resolve) => { release = () => resolve(ensure(pack, name)); });
    const a = { pack: look('a', loads), st: 'idle2' };
    const b = { pack: look('b', loads), st: 'idle3' };
    const ctl = createRemoteIdles({ ensure: slow, drop, cap: 3 });
    ctl.step([a, b], 0);
    ctl.step([a, b], 10);
    assert.equal(ctl.stats().loads, 1, 'the second waits for the first');
    release();
    await settle();
    await settle();
    ctl.step([a, b], 20);
    assert.equal(ctl.stats().loads, 1, 'b\'s random idle waits while a\'s is in memory');
    a.st = 'stand';
    ctl.step([a, b], 30);
    assert.equal(ctl.stats().loads, 2, 'a\'s went back, b\'s loads');
  });

  it('a phone or a device short of memory idles one other look; a computer three', () => {
    const { remoteIdleCap } = need();
    assert.equal(remoteIdleCap({ phone: true }), 1);
    assert.equal(remoteIdleCap({ phone: false, deviceMemory: 2 }), 1);
    assert.equal(remoteIdleCap({ phone: false, deviceMemory: 8 }), 3);
    assert.equal(remoteIdleCap({}), 3);
  });
});

describe('#769: the realtime feature draws them with it', () => {
  const src = read('public/js/features/realtime-feature.js');
  const game = read('public/game.js');

  it('applyAnim asks whether the look idles instead of never idling', () => {
    assert.doesNotMatch(src, /animForState\(st, \{ idles: false \}\)/);
    assert.match(src, /const idles = idleSheets\.idles\(r\);[\s\S]{0,200}animForState\(st, \{ idles \}\)/);
    assert.match(src, /idleSheets\.step\(remotes\.values\(\), t\)/);
    assert.match(src, /cap: remoteIdleCap\(\{ phone: isPhoneDevice\(\)/);
  });

  it('game.js loads and gives back their sheets as it does yours, never one your own Glitch uses', () => {
    assert.match(game, /glitchIdleSheet\(pack, name\) \{\s*return ensureIdleSheet\(pack, name\);/);
    assert.match(game, /dropGlitchIdleSheet\(pack, name\) \{\s*const sheet = pack\?\.sheets\?\.\[name\];\s*if \(!sheet \|\| player\?\.pack\?\.sheets\?\.\[name\] === sheet\) return false;/);
  });
});
