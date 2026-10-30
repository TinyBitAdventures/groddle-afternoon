/**
 * The Classic imagination hub (public/js/classic/classic-hub.js; ImgMenuView.as): X opens it under
 * Classic only, its seven clouds route to what the remake has, and Modern's X is untouched.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUB_CLOUDS, hubKey, isHubKey, coverRect, placeClouds, CLOUD_SIZE } from '../public/js/classic/classic-hub.js?v=g476-1';
import { CLASSIC_ART } from '../public/js/classic/classic-art.js?v=g468-9';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('Classic hub', () => {
  it('the client\'s seven clouds in two rows, each with its art', () => {
    assert.deepEqual(HUB_CLOUDS.map((c) => c.title), ['Skills', 'Quests', 'Upgrades', 'Your looks', 'Teleport', 'Go home', 'Back to world']);
    assert.deepEqual(HUB_CLOUDS.map((c) => c.row), [1, 1, 1, 2, 2, 2, 2]);
    for (const c of HUB_CLOUDS) for (const a of [c.art, c.icon].filter(Boolean)) assert.ok(CLASSIC_ART[a], a);
  });

  it('the hub keys (ImgMenuView.as 495-671): S, Q or L, U, T, Y, H, B', () => {
    assert.deepEqual(['s', 'Q', 'l', 'u', 't', 'y', 'h', 'b', 'x', 'z'].map(hubKey), ['skills', 'quests', 'quests', 'upgrades', 'teleport', 'looks', 'home', 'back', null, null]);
  });

  it('X opens it under Classic only, never while typing or with a modifier', () => {
    assert.equal(isHubKey({ key: 'x' }, { classic: true }), true);
    assert.equal(isHubKey({ key: 'X' }, { classic: true }), true, 'caps lock');
    assert.equal(isHubKey({ key: 'x' }, { classic: false }), false, 'Modern keeps its X');
    assert.equal(isHubKey({ key: 'x' }, { classic: true, typing: true }), false);
    assert.equal(isHubKey({ key: 'x', shiftKey: true }, { classic: true }), false);
    assert.equal(isHubKey({ key: 'x', metaKey: true }, { classic: true }), false);
    assert.equal(isHubKey({ key: 'x', repeat: true }, { classic: true }), false);
  });

  it('Modern\'s X is the imagination feature\'s, unchanged', () => {
    const img = readFileSync(join(root, 'public/js/features/imagination-feature.js'), 'utf8');
    assert.match(img, /\(e\.key === 'x' \|\| e\.key === 'X'\)/);
  });

  it('pictures in the clouds: the home and world snapshots cut to their clouds, the avatar, the teleport art', () => {
    const src = readFileSync(join(root, 'public/js/classic/classic-hub.js'), 'utf8');
    assert.match(src, /engine\?\.snapshotView\?\.\(/, 'the game\'s own view snapshot');
    assert.match(src, /new OffscreenCanvas\(/, 'drawn off the page');
    assert.doesNotMatch(src, /createElement\(\s*['"]canvas/);
    assert.equal(HUB_CLOUDS.find((c) => c.id === 'teleport').icon, 'familiar_dialog_teleport');
    assert.deepEqual(CLOUD_SIZE.cloud_home, [207, 80.3]);
    const r = coverRect(1000, 600, 414, 160);
    assert.ok(Math.abs(r.w - 414) < 1e-9 && r.h > 160, 'cover');
    assert.ok(Math.abs(r.y - (160 - r.h) * 0.7) < 1e-9, 'the ground in view');
  });

  it('at home the home cloud says Back to world and the world cloud dims (ImgMenuHome, ImgMenuBackToWorld)', () => {
    assert.deepEqual(placeClouds(true), { homeTitle: 'Back to world', homePicture: 'world', backDisabled: true });
    assert.deepEqual(placeClouds(false), { homeTitle: 'Go home', homePicture: 'home', backDisabled: false });
  });

  it('IMAGINATION_OPEN, CLOUD1-7 a tenth of a second apart, IMAGINATION_CLOSE: shipped sound keys', () => {
    const src = readFileSync(join(root, 'public/js/classic/classic-hub.js'), 'utf8');
    assert.match(src, /sound\('IMAGINATION_OPEN'\)/);
    assert.match(src, /sound\(`CLOUD\$\{i \+ 1\}`\)/);
    assert.match(src, /sound\('IMAGINATION_CLOSE'\)/);
    const keys = readFileSync(join(root, 'public/js/sound-keys.js'), 'utf8');
    for (const k of ['IMAGINATION_OPEN', 'IMAGINATION_CLOSE', 'CLOUD1', 'CLOUD7']) assert.match(keys, new RegExp(`"${k}":`), k);
  });
});
