/**
 * G1315 (Austin 2026-11-25): the profile's home street picture is drawn with the owner standing in it.
 *
 * Cause: the profile draws the home street from the layout the game sends (js/home-layout-scene.js
 * walkHomeScene, sent by features/profiles-feature.js uploadLayout; the site's diorama,
 * groddle-afternoon-site src/HomeLayout.php), and the walk turned the owner's Glitch into an avatar
 * entry (the owner's profile still where they stood). The flat picture (drawHome) already left players
 * out (js/public-picture.js, G1283), but its QA copy (groddleHomeShot) did not.
 *
 * Glitch: the home pictures showed the street with nobody on it. saveHomeImg (TSFrontController.as
 * 1515-1546) took getSnapshot(SNAPSHOT_TYPE_NORMAL) with includeAlmostEverything false, and
 * LocationRenderer.as 594-660 hid every PC for it, the owner's own avatar too.
 *
 * - the walk leaves out the owner's Glitch and every other player's (publicPicture 'hide'), with
 *   all they hold;
 * - the layout's key and the picture's key move on, so one drawn with the owner is replaced on the
 *   owner's next visit home;
 * - the QA home picture is drawn as the uploaded one (withPublicView).
 *
 * Run: node --test tests/g1315-home-picture-no-players.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { walkHomeScene } from '../public/js/home-layout-scene.js?v=ae8a0d27';
import { buildHomeLayout, homeLayoutKeyOf } from '../public/js/home-layout.js?v=84b69e98';
import { homeKeyOf, shortHash } from '../public/js/profiles.js?v=7e94c96f';
import { PUBLIC_HIDE } from '../public/js/public-picture.js?v=1a0b03fa';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

/** A tiny display tree: translation-only containers, sprites with a texture source URL. */
const node = (props, children = []) => {
  const n = { x: 0, y: 0, alpha: 1, visible: true, children, ...props };
  for (const c of children) c.parent = n;
  return n;
};
const sprite = (url, x, y, w, h, extra = {}) => node({ x, y, isSprite: true, w, h, texture: { source: { label: url, width: w, height: h }, frame: { x: 0, y: 0, width: w, height: h } }, ...extra });
const offset = (n) => {
  let x = 0;
  let y = 0;
  for (let p = n; p; p = p.parent) {
    x += p.x;
    y += p.y;
  }
  return { x, y };
};
const io = (player, targets = new Map()) => ({
  targets,
  player,
  isSprite: (n) => Boolean(n.isSprite),
  localBounds: (n) => (n.isSprite ? { x: 0, y: 0, width: n.w, height: n.h } : n.bounds || null),
  toStage: (n, points) => {
    const o = offset(n);
    return points.map((p) => ({ x: p.x + o.x, y: p.y + o.y }));
  },
});

describe('G1315: the home street layout has nobody on it (walkHomeScene)', () => {
  /** The home street as the game builds it: a house, a door, the owner's Glitch holding a tool, a visitor's Glitch with its name plate. */
  function street() {
    const house = sprite('assets/sprites/homes/house.webp', 100, 200, 300, 200, { homeLayout: { k: 'house', s: 'meadow' } });
    const door = node({ x: 260, y: 400, bounds: { x: -46, y: -150, width: 92, height: 150 } });
    const owner = node({ x: 500, y: 400, scale: { y: 1 }, facing: 'right' }, [sprite('assets/sprites/tools/hoe.webp', 10, -60, 30, 30)]);
    const visitor = node({ x: 700, y: 400, publicPicture: PUBLIC_HIDE }, [sprite('assets/sprites/avatars/visitor.webp', -40, -110, 80, 110), node({ homeLayoutText: 'Visitor', bounds: { x: 0, y: 0, width: 60, height: 12 } })]);
    const world = node({}, [house, door, owner, visitor]);
    return { world, owner, door };
  }

  it('leaves out the owner, everything the owner holds, and every other player with its name plate', () => {
    const { world, owner, door } = street();
    const { draw, spots } = walkHomeScene(world, io(owner, new Map([[door, { classId: 'home_door' }]])));
    assert.equal(draw.some((d) => d.avatar), false, 'no avatar drawn');
    assert.equal(spots.some((s) => s.desc?.k === 'avatar'), false, 'no avatar spot');
    assert.deepEqual(draw.map((d) => d.art || d.txt), ['assets/sprites/homes/house.webp'], 'only the street\'s own art');
    assert.deepEqual(spots.map((s) => s.desc.k), ['house', 'door']);
    const layout = buildHomeLayout({ w: 960, h: 476, draw, spots });
    assert.equal(layout.draw.some((d) => d.avatar), false);
    assert.deepEqual(layout.spots.map((s) => s.k), ['house', 'door']);
  });

  it('a layout drawn with the owner in it is replaced on the next visit home (its key moves on)', () => {
    const layout = { v: 2, spots: [{ k: 'door', b: [0, 0, 1, 1] }] };
    const pic = homeKeyOf('firebog', 0);
    const key = homeLayoutKeyOf(layout, pic);
    // The key a layout of the drawing before (with the owner's still) went up under.
    const before = `l2-firebog-0-${shortHash('door:::::')}`;
    assert.notEqual(key, before);
    assert.match(key, /^l2-firebog-0-[0-9a-f]{8}$/);
  });

  it('a picture drawn before players were left out is replaced too (h3)', () => {
    assert.match(homeKeyOf('firebog', 0), /^h3-firebog-0$/);
  });

  it('the QA home picture is drawn as the uploaded one (no players)', () => {
    const prof = read('public/js/features/profiles-feature.js');
    assert.match(prof, /window\.groddleHomeShot = \(\) => \{[\s\S]{0,300}withPublicView\(engine, \(\) => engine\.snapshotView/);
  });
});
