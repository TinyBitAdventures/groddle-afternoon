import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buriedSignpostRim, buriedSignpostUnder, isBuriedSignpost, signpostNear } from '../public/js/street-model.js?v=23b926e5';

const root = join(import.meta.dirname, '..');
const street = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));

describe('buried signposts (Collision-triggered Teleporters)', () => {
  const hole = street('GLI2VDR4JRD1AEG');
  const buried = hole.signposts.find((s) => s.id === 'signpost_2');

  it('the Great Hole to Ix keeps its link to Groddle Ladder under the floor', () => {
    assert.ok(isBuriedSignpost(hole, buried));
    assert.equal(buried.connects[0].label, 'Groddle Ladder');
    assert.ok(!hole.signposts.filter((s) => s !== buried).some((s) => isBuriedSignpost(hole, s)));
  });

  it('never prompts, and triggers only once you drop below the rim', () => {
    assert.equal(signpostNear(hole, 350, 60), null);
    assert.equal(buriedSignpostRim(hole, buried), 609);
    assert.equal(buriedSignpostUnder(hole, 330, 600), null);
    assert.equal(buriedSignpostUnder(hole, 330, 668), null);
    assert.equal(buriedSignpostUnder(hole, 330, 672).signpost, buried);
    assert.equal(buriedSignpostUnder(hole, 600, 700), null);
  });

  it('game.js falls into the hole, never pulls you back up, and travels like a door', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    // The floor resolve lives in js/avatar-step.js (avatarGround), shared with the level builder.
    const step = readFileSync(join(root, 'public/js/avatar-step.js'), 'utf8');
    assert.match(step, /if \(best != null && py >= best - 80 && !\(hole && py > best \+ 24\)\) return best;/);
    assert.ok(game.includes('return avatarGround(streetPlatforms, px, py, player?.vy ?? 0, { street: currentStreet, fallback: GROUND_Y });'));
    assert.match(game, /travelTo\(conn\.tsid, \{ label: conn\.label, arrive: conn\.arrive, via: 'door' \}\);/);
    assert.match(game, /updateShrineWalkBy\(\);\n\s*updateBuriedSignposts\(\);/);
  });
});
