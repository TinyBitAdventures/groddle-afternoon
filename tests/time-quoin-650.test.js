/**
 * G1235 (#650): a learning (time) quoin grabbed with nothing to speed up. Glitch counted it toward
 * the day's quoins all the same (items/quoin.js 202 skills_start_acceleration, its answer unused;
 * 236-238 stats_add_quoins_today) and the coin read the quoin's own seconds (glitch-client
 * AnnouncementController.as doQuoinGot: stat 'time' shows "seconds"), never a refusal line.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectQuoin, createQuoinState } from '../public/js/quoins.js?v=f9187edb';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const gsjs = join(root, '..', 'glitch-GameServerJS', 'items', 'quoin.js');

describe('a time quoin with nothing to study (#650)', () => {
  it('counts toward the day as Glitch\'s did', () => {
    const state = createQuoinState();
    const r = collectQuoin(state, 'time', { level: 5 }, { accelerateStudy: () => ({ ok: false, reason: 'not_studying', applied: 0 }) });
    assert.equal(r.ok, true);
    assert.equal(state.collectedToday, 1);
  });

  it('its coin reads the quoin\'s seconds, studying or not', () => {
    const game = read('public/game.js');
    assert.match(game, /if \(result\.resolvedTypeId === 'time'\) return `\+\$\{result\.amount\} seconds`;/);
    assert.doesNotMatch(game, /No active study to accelerate/);
  });

  it('matches GSJS: the day\'s count does not ask whether the speed-up took', { skip: !existsSync(gsjs) && 'needs glitch-GameServerJS' }, () => {
    const src = readFileSync(gsjs, 'utf8');
    assert.match(src, /if \(this\.instanceProps\.type == 'time'\) pc\.skills_start_acceleration\(amount\);/);
    assert.match(src, /pc\.stats_add_quoins_today\(1\);/);
  });
});
