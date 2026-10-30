/**
 * Ladder-top signposts (js/ladder-top-signposts.js): a post at the top of a
 * ladder with no deck stands in for the Collision-triggered Teleporter that
 * moved a climber there (items/teleporter.js onPlayerCollision; the client gives
 * a climber no interactions, MiddleGroundRenderer._findInteractionSprites).
 * Run: node --test tests/ladder-top-signposts.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  climberAtLadderTop,
  isLadderTopSignpost,
  ladderTopSignpostFor,
  ladderTopSignpostLadder,
  ladderTopSignposts,
  walkUpSignpostStreet,
} from '../public/js/ladder-top-signposts.js?v=d4123a4c';
import { navigableSignposts, signpostNear, wallsScreen, worldToScreen } from '../public/js/street-model.js?v=606bae73';
import { planSignpostTravel } from '../public/js/travel.js?v=855c6c68';
import { visibleDoors } from '../public/js/doors.js?v=eb9510b1';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const streets = join(spike, 'public/assets/streets');
const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8')).streets;
const locations = join(spike, '../streets/mnt/stos/location_data');
const load = (tsid) => {
  const s = JSON.parse(readFileSync(join(streets, `${tsid}.json`), 'utf8'));
  s.signposts = navigableSignposts(s.signposts);
  return s;
};

const GRODDLE_LADDER = 'GM4115NJ46G8M';
const GREAT_HOLE = 'GLI2VDR4JRD1AEG';

function shaft({ deck = false, hidden = false, ladderBottom = -79, postY = -2850 } = {}) {
  return {
    bounds: { l: -2000, r: 2000, t: -3000, b: 0 },
    platforms: [
      { id: 'floor', x1: -2000, y1: -80, x2: 2000, y2: -80, pc_perm: -1 },
      ...(deck ? [{ id: 'deck', x1: 800, y1: postY + 10, x2: 1100, y2: postY + 10, pc_perm: -1 }] : []),
    ],
    ladders: [{ id: 'spine', x: 960, y: ladderBottom, w: 31, h: ladderBottom + 2979 }],
    signposts: [
      { id: 'top', x: 950, y: postY, w: 100, h: 200, connects: [{ tsid: 'LX', label: 'Up There', hidden, arrive: { x: 1, y: 2 } }] },
      { id: 'foot', x: 1600, y: -70, w: 150, h: 200, connects: [{ tsid: 'LY', label: 'Down Here' }] },
    ],
  };
}

describe('ladder-top signposts: the rule', () => {
  it('a visible post at a deckless ladder top is the ladder\'s exit', () => {
    const s = shaft();
    assert.equal(ladderTopSignpostLadder(s, s.signposts[0])?.id, 'spine');
    assert.equal(ladderTopSignpostLadder(s, s.signposts[1]), null, 'a post on the floor is walked up to');
    assert.equal(ladderTopSignpostFor(s, 'spine'), s.signposts[0]);
    assert.ok(isLadderTopSignpost(s, s.signposts[0]));
    assert.deepEqual(ladderTopSignposts(s).map((r) => r.signpost.id), ['top']);
  });

  it('a deck beside the post, a hidden connect or a short ladder is not one', () => {
    for (const s of [shaft({ deck: true }), shaft({ hidden: true }), shaft({ ladderBottom: -2800 })]) {
      assert.equal(ladderTopSignpostLadder(s, s.signposts[0]), null);
      assert.equal(ladderTopSignpostFor(s, 'spine'), null);
    }
    const buried = shaft({ postY: 150 });
    assert.equal(ladderTopSignpostLadder(buried, buried.signposts[0]), null);
  });

  it('fires only at the top of the climb', () => {
    const wall = { id: 'spine', x: 2960, yTop: 21, yBot: 2921 };
    assert.ok(climberAtLadderTop(wall, 25));
    assert.ok(climberAtLadderTop(wall, 29));
    assert.ok(!climberAtLadderTop(wall, 40));
    assert.ok(!climberAtLadderTop(null, 25));
  });

  it('never prompts or travels by T from the ladder\'s foot (proximity is x only)', () => {
    const s = shaft();
    const footX = worldToScreen(s, 960, -80).x;
    assert.equal(signpostNear(s, footX, 140)?.signpost.id, 'top', 'the bug: x-only proximity finds the top post');
    const walk = walkUpSignpostStreet(s);
    assert.equal(signpostNear(walk, footX, 140), null);
    assert.equal(planSignpostTravel(walk, footX, new Set(['LX', 'LY']), 140).reason, 'no_signpost');
    assert.equal(signpostNear(walk, worldToScreen(s, 1600, -70).x, 140)?.signpost.id, 'foot');
    assert.equal(walkUpSignpostStreet(s), walk, 'memoized per street');
    const plain = shaft({ deck: true });
    assert.equal(walkUpSignpostStreet(plain), plain);
  });

  it('T at the Great Hole\'s rim never takes the buried link to Groddle Ladder', () => {
    const hole = load(GREAT_HOLE);
    const rimX = worldToScreen(hole, -2650, 0).x;
    assert.equal(planSignpostTravel(hole, rimX, new Set([GRODDLE_LADDER]), 140).signpost?.id, 'signpost_2', 'the bug: x-only T finds the buried post');
    const walk = walkUpSignpostStreet(hole);
    assert.equal(planSignpostTravel(walk, rimX, new Set([GRODDLE_LADDER]), 140).reason, 'no_signpost');
    assert.deepEqual(walk.signposts.map((p) => p.id).sort(), ['signpost_1', 'signpost_3']);
  });
});

describe('ladder-top signposts: the street data', () => {
  it('Groddle Ladder\'s spine tops out at signpost_3 to The Great Hole to Ix', () => {
    const s = load(GRODDLE_LADDER);
    const sign = ladderTopSignpostFor(s, 'ladder_1266351553163');
    assert.equal(sign?.id, 'signpost_3');
    assert.equal(sign.connects[0].label, 'The Great Hole to Ix');
    assert.ok(index[GREAT_HOLE], 'the destination is imported (L/G alias)');
    const wall = wallsScreen(s).find((w) => w.id === 'ladder_1266351553163');
    assert.equal(wall.yTop, 21);
    assert.ok(climberAtLadderTop(wall, wall.yTop + 4), 'game.js holds a deckless climber at yTop + 4');
    // The other two posts stay on the ground and keep their T prompt.
    const walk = walkUpSignpostStreet(s);
    assert.deepEqual(walk.signposts.map((p) => p.id).sort(), ['signpost_1', 'signpost_2']);
    assert.equal(signpostNear(walk, wall.x, 140), null);
  });

  it('the source: no deck up there, and two Collision-triggered Teleporters on the street', { skip: !existsSync(locations) && 'no location XML' }, () => {
    const g = readFileSync(join(locations, `${GRODDLE_LADDER}.xml`), 'utf8');
    const l = readFileSync(join(locations, 'LM4115NJ46G8M.xml'), 'utf8');
    assert.match(g, /<object id="signpost_3">\s*<int id="y">-2850<\/int>/);
    assert.equal((l.match(/label="Collision-triggered Teleporter"/g) || []).length, 2);
  });

  it('sweep: Groddle Ladder is the only signpost or visible door reached only from a ladder', () => {
    const posts = [];
    const doors = [];
    for (const tsid of Object.keys(index)) {
      const file = join(streets, `${tsid}.json`);
      if (!existsSync(file)) continue;
      const s = load(tsid);
      for (const { signpost } of ladderTopSignposts(s)) posts.push(`${tsid}:${signpost.id}`);
      // Doors are screen space (bottom-centre); hidden ones are inert (client DoorView).
      for (const d of visibleDoors(s)) {
        const x = d.x + s.bounds.l;
        const y = d.y + s.bounds.t;
        const probe = { ...s, signposts: [{ id: d.id, x, y, w: d.w, h: d.h, connects: [{ tsid: 'door' }] }] };
        if (ladderTopSignpostLadder(probe, probe.signposts[0])) doors.push(`${tsid}:${d.id}`);
      }
    }
    assert.deepEqual(posts, [`${GRODDLE_LADDER}:signpost_3`]);
    assert.deepEqual(doors, []);
  });
});

describe('ladder-top signposts: game.js', () => {
  const game = readFileSync(join(spike, 'public/game.js'), 'utf8');
  it('travels from the top like a door and keeps walk-up lookups off the post', () => {
    assert.match(game, /from '\.\/js\/ladder-top-signposts\.js\?v=[0-9a-f]{8}'/);
    assert.match(game, /updateBuriedSignposts\(\);\n\s*updateLadderTopSignposts\(\);/);
    assert.match(game, /if \(!climberAtLadderTop\(climb\.wall, player\.y\)\) return;/);
    assert.match(game, /const sign = ladderTopSignpostFor\(currentStreet, climb\.wall\.id\);[\s\S]{0,400}travelTo\(conn\.tsid, \{ label: conn\.label, arrive: conn\.arrive, via: 'door' \}\)/);
    assert.equal((game.match(/signpostNear\(walkUpSignpostStreet\(currentStreet\), player\.x, 140\)/g) || []).length, 2);
    assert.match(game, /planSignpostTravel\(\s*walkUpSignpostStreet\(currentStreet\),/);
  });
});
