import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { activitySegmentsToHtml, buildActivitySegments, formatActivityLine } from '../public/js/verb-rewards.js?v=g289-1';

describe('activity lines end one sentence once (G162)', () => {
  it('adds a period only where the line has no mark of its own', () => {
    assert.equal(formatActivityLine('You pet a Piggy', { energy: -4, mood: 1 }), 'You pet a Piggy. -4 energy, +1 mood.');
    assert.equal(formatActivityLine('A crab says plus tomatoes!', { mood: 2 }), 'A crab says plus tomatoes! +2 mood.');
    assert.equal(formatActivityLine('Really?', {}), 'Really?');
    assert.equal(formatActivityLine('Done', {}), 'Done.');
  });

  it('does the same in the feed markup', () => {
    const html = (base, fx) => activitySegmentsToHtml(buildActivitySegments(base, fx, (id) => id)).replace(/<[^>]+>/g, '');
    assert.equal(html('A crab says plus tomatoes!', { mood: 2 }), 'A crab says plus tomatoes! +2 mood.');
    assert.equal(html('You pet a Piggy', { energy: -4 }), 'You pet a Piggy. -4 energy.');
    assert.equal(html('Oh!', {}), 'Oh!');
  });
});
