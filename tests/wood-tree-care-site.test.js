/**
 * Draft for tests/ (lane yardwood): the site's HomeYard replays the server's testdata/wood-care.json,
 * a visitor's pet and water on a home Wood Tree (judge: each visitor's 5-minute clock, wood_tree.js
 * canPet / canWater 614-640; plotNow / woodCare: onTendComplete 955-1010).
 * Needs the PHP replay beside it as tests/fixtures/wood-care-site-replay.php.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SITE_DIR, serverPath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';

const hasPhp = spawnSync('php', ['-v']).status === 0;
describe('the site counts a visitor\'s Wood Tree care as the game and server do', { skip: skipWithoutServer || skipWithoutSite || (!hasPhp && 'no php') }, () => {
  it('replays testdata/wood-care.json through HomeYard::judge and plotNow', () => {
    const script = fileURLToPath(new URL('./fixtures/wood-care-site-replay.php', import.meta.url));
    const r = spawnSync('php', [script, SITE_DIR, serverPath('testdata', 'wood-care.json')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^ok \d+ cases/);
  });
});
