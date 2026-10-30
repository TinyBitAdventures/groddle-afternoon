/**
 * The Classic imagination hub (public/js/classic/classic-hub.js; ImgMenuView.as): X opens it under
 * Classic only, its seven clouds route to what the remake has, and Modern's X is untouched.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUB_CLOUDS, hubKey, isHubKey } from '../public/js/classic/classic-hub.js';
import { CLASSIC_ART } from '../public/js/classic/classic-art.js';

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
});
