/**
 * Bug report #3 (2026-10-30, Gentle Island Exit 5704,956): "there doesn't seem to be an actual exit
 * from gentle island under the down arrow". The street's box `gentle_island_exit` (600 x 300 under
 * the newxp_gentleislandexit_arrow) only fired on the tutorial's last step, so anyone else who
 * dropped off the end (the tutorial done or skipped, back on the island by the Map) sat in the
 * clouds with no way on. newbie_island.js hitBox (24-29) checks nothing: it sends whoever is in the
 * box through player.js teleportHome, a random config.newxp_exits street.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GENTLE_ISLAND, ISLAND_BOXES, exitBoxAction, inHitBox, normalizeNewxpSave } from '../public/js/newxp.js?v=d5978ec1';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const feature = read('public/js/features/newxp-feature.js');
const gsjs = join(root, '../glitch-GameServerJS');

describe('the exit box goes for everyone (newbie_island.js hitBox 24-29)', () => {
  it('the tutorial\'s last step still ends On to the Big Time', () => {
    assert.equal(exitBoxAction(normalizeNewxpSave({ status: 'active', stage: 'island', island: 'leaving' })), 'tutorial');
  });

  it('anyone else is taken off the island', () => {
    for (const seed of [
      { status: 'done', stage: 'done', island: 'exited' },
      { status: 'skipped' },
      { status: 'off' },
      { status: 'active', stage: 'island', island: 'quest_given' },
      { status: 'active', stage: 'island', island: 'exited' },
    ]) assert.equal(exitBoxAction(normalizeNewxpSave(seed)), 'teleport', JSON.stringify(seed));
    assert.equal(exitBoxAction(null), 'teleport');
  });

  it('the box is the street\'s own, and the reported spot is in it', () => {
    const street = JSON.parse(read(`public/assets/streets/${GENTLE_ISLAND.exit}.json`));
    const box = street.boxes.find((b) => b.id === 'gentle_island_exit');
    const ours = ISLAND_BOXES.gentle_island_exit;
    assert.deepEqual({ x: ours.x, y: ours.y, w: ours.w, h: ours.h }, { x: box.x, y: box.y, w: box.w, h: box.h });
    assert.ok(inHitBox(ours, 5704, 956), 'post 112');
    assert.ok(inHitBox(ours, 5976, 956), 'where a walk off the end lands');
    // The end wall stands at world x 2444 (screen 5444): the box is past it, down in the clouds.
    assert.ok(street.barriers.some((w) => w.x === 2444 && w.pc_perm === null));
  });

  it('the source checks nothing before teleportHome', { skip: !existsSync(gsjs) && 'needs glitch-GameServerJS beside the repo' }, () => {
    const src = readFileSync(join(gsjs, 'locations/newbie_island.js'), 'utf8').split('\n');
    const block = src.slice(23, 29).join('\n');
    assert.match(block, /else if \(id == 'gentle_island_exit'\)\{\s*delete pc\.return_to_gentle_island;[\s\S]*pc\.teleportHome\(\);\s*return true;/);
    const player = readFileSync(join(gsjs, 'players/player.js'), 'utf8').split('\n');
    assert.match(player.slice(2040, 2045).join('\n'), /function teleportHome\(\)\{[\s\S]*choose_one\(config\.newxp_exits\)/);
  });
});

describe('newxp-feature wiring', () => {
  it('the feature tests the box every tick, before the tutorial-only guard', () => {
    assert.match(feature, /exitBoxTick\(engine\);\s*if \(!active\(\)\) \{\s*publish\(engine, now\);\s*return;/);
    assert.match(feature, /function exitBoxTick\(engine\) \{[\s\S]{0,200}exitBoxAction\(save\) !== 'teleport'\) return;[\s\S]{0,200}inHitBox\(box, p\.x, p\.y\)/);
  });

  it('it takes the same open-road exit pick as the tutorial, and leaves the save alone', () => {
    const body = feature.slice(feature.indexOf('async function takeExitBox(engine) {'), feature.indexOf('let strandChecked'));
    assert.match(body, /pickOpenExit\(Math\.random, \(tsid\) => engine\.streetExists\(tsid\), open\)/);
    assert.match(body, /await engine\.enter\(exit\.tsid, \{ quiet: true, bypassFeatureGates: true \}\);\s*dropAtExit\(engine, exit\);/);
    assert.match(body, /engine\.setData\('newxpExitBox', 'teleport'\)/);
    assert.doesNotMatch(body, /save\.\w+\s*=|engine\.save\(\)/);
  });

  it('the tutorial path is marked too', () => {
    assert.match(feature, /engine\.setData\('newxpExitBox', 'tutorial'\);\s*leaveIsland\(engine\)/);
  });
});
