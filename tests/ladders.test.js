/**
 * Getting off at a ladder's top (street-model.js ladderTopDeck).
 * Run: node --test tests/ladders.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ladderTopDeck, platformsScreen, wallsScreen, platformYAt } from '../public/js/street-model.js?v=77584eff';

const here = dirname(fileURLToPath(import.meta.url));
const streets = join(here, '../public/assets/streets');
const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8')).streets;

describe('ladder tops', () => {
  it('steps onto a deck just above or below the top, never onto the floor', () => {
    const deckAbove = [{ x1: 0, y1: 300, x2: 200, y2: 300 }, { x1: 0, y1: 600, x2: 2000, y2: 600 }];
    // Climber clamped at the top (yTop + 2) of a ladder from 600 up to 296.
    assert.equal(ladderTopDeck(deckAbove, 100, 298, 600), 300);
    // Archived shape: the ladder ends 40 px above its deck.
    assert.equal(ladderTopDeck(deckAbove, 100, 262, 600), 300);
    // No deck within reach: stay on the ladder.
    assert.equal(ladderTopDeck([{ x1: 0, y1: 600, x2: 2000, y2: 600 }], 100, 540, 600), null);
    assert.equal(ladderTopDeck(deckAbove, 1000, 298, 600), null);
  });

  it('mounts the deck on most archived ladders', () => {
    let withDeck = 0;
    let mounted = 0;
    for (const tsid of Object.keys(index)) {
      const street = JSON.parse(readFileSync(join(streets, `${tsid}.json`), 'utf8'));
      if (!street.ladders?.length) continue;
      const plats = platformsScreen(street);
      for (const wall of wallsScreen(street).filter((w) => w.source === 'ladder')) {
        // A deck a player could mean: a surface within 48 px of the top that is not the base floor.
        // An underside (pc_perm 1) is no deck: Purplysa's secret ladder ends under one.
        const deck = plats.filter((p) => p.pcPerm !== 1).map((p) => platformYAt(p, wall.x)).filter((y) => y != null && y - wall.yTop > -46 && y - wall.yTop <= 48 && y < wall.yBot - 8);
        if (!deck.length) continue;
        withDeck += 1;
        if (ladderTopDeck(plats, wall.x, wall.yTop + 2, wall.yBot) != null) mounted += 1;
      }
    }
    assert.ok(withDeck > 600, String(withDeck));
    assert.equal(mounted, withDeck);
  });
});

describe('climbing input (game.js)', () => {
  const game = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'public/game.js'), 'utf8');

  it('does not re-grab a ladder with a still-held Up/Down right after leaving it', () => {
    // Hopping off sideways or jumping while Up/Down is held must not flip back onto the ladder next frame.
    assert.match(game, /climb\.wall = null;\s*\/\/[^\n]*\n[^\n]*\n\s*climb\.regrabLock = true;/);
    assert.match(game, /if \(!up && !down\) climb\.regrabLock = false;/);
    assert.match(game, /climbHit && !climb\.regrabLock && \(up !== down\)/);
    assert.match(game, /climbHit && up && !climb\.regrabLock\)/);
  });

  it('treats Up/W as climb, not jump, while on a ladder (only Space jumps off)', () => {
    assert.match(game, /e\.key === ' ' \|\| \(!climb\.active && \['ArrowUp', 'w', 'W'\]\.includes\(e\.key\)\)/);
  });

  it('runs the climb cycle only while moving on the ladder (CLIMB_PAUSE holds the frame)', () => {
    // The Glitch sheets report climb or climbPause from vy (js/ladder-anim.js, tests/ladder-anim.test.js);
    // the sheetless fallback still stops its cycle at rest.
    assert.match(game, /if \(player\.vy !== 0 \|\| player\.anims\) setPlayerAnim\('climb'\);\s*(?:\/\/[^\n]*\s*)?else if \(player\.playing\) player\.stop\(\);/);
    assert.match(game, /return ladderAnimState\(player\.vy\);/);
    assert.match(game, /if \(swap === 'stop'\) player\.stop\(\);\s*else player\.play\(\);/);
  });
});
