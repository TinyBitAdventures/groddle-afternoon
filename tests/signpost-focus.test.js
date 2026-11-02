/**
 * SIGNFOCUS (Austin 2026-11-02, ticket 21): Enter or E at a signpost works as the client's.
 * One arm goes at once; several arms make the post take hold with the top arm lit; Up/Down or
 * W/S move between arms, wrapping round; Enter goes; Escape, Left/Right or A/D let go; the avatar
 * stands still meanwhile (SignpostView.as tryFocus 382-416, focus 447-462, go 581-584,
 * escapeHandler 586-588, downHandler 590-599, upHandler 601-610). T no longer travels from a post
 * (the client bound only Shift+T, TSMainView.as 649). The hint over a lone post says Enter.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const game = readFileSync(join(here, '../public/game.js'), 'utf8');
const fn = (name) => {
  const at = game.indexOf(`function ${name}(`);
  assert.ok(at > 0, name);
  return game.slice(at, game.indexOf('\n}\n', at) + 2);
};

describe('signpost focus (ticket 21)', () => {
  it('Enter and the chooser hold a post of several arms and take a lone arm at once', () => {
    const enter = fn('enterSignpost');
    assert.match(enter, /if \(boards\.length === 1\) \{\n\s*takeSignBoard\(boards\[0\]\);/);
    assert.match(enter, /signpostFocus = \{ boards, index: 0 \};/);
    assert.match(enter, /if \(player\) player\.vx = 0;/);
    assert.match(fn('openEnterChoice'), /if \(choice\.kind === 'signpost'\) \{\n\s*enterSignpost\(\);/);
    assert.match(fn('tryOpenNearestMenu'), /plan\.choice\.kind === 'signpost'\) \{\n\s*enterSignpost\(\);/);
  });

  it('a held post takes Up/Down and W/S (wrapping), Enter and E, Space and Escape; a move key lets go and walks', () => {
    const key = fn('signpostFocusKey');
    assert.match(key, /signpostFocus\.index = \(signpostFocus\.index \+ step \+ n\) % n;/);
    assert.match(key, /\['ArrowUp', 'w', 'W', 'ArrowDown', 's', 'S'\]/);
    assert.match(key, /if \(e\.key === 'Enter' \|\| e\.key === 'e' \|\| e\.key === 'E'\) \{/);
    assert.match(key, /if \(e\.key === 'Escape'\) \{\n\s*e\.preventDefault\(\);\n\s*releaseSignpostFocus\(\);\n\s*return true;/);
    assert.match(key, /\['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'\]\.includes\(e\.key\) \|\| \/\^\[1-9\]\$\/\.test\(e\.key\)\) releaseSignpostFocus\(\);\n\s*return false;/);
    // A post left behind (a street change, walking off) lets go.
    assert.match(key, /if \(!at \|\| !signpostFocus\.boards\.every/);
    assert.match(fn('clearWorldEntities'), /releaseSignpostFocus\(\);/);
    // The world's keydown asks the post first, before the key is held or a jump is queued.
    const kd = game.indexOf('if (signpostFocusKey(e)) return;');
    assert.ok(kd > 0 && game.indexOf('keys.add(e.key);', kd) > kd && kd < game.indexOf('queueJump(jumpState, movementNow());'));
  });

  it('T does not travel from a post, and the hint over a lone post says Enter', () => {
    assert.ok(!game.includes("if (e.key === 't' || e.key === 'T') doTeleport();"));
    assert.ok(!game.includes("key: 'T', label: conn.label"));
    assert.match(game, /: \{ key: 'Enter', label: 'Choose a road', x: nearSign\.screen\.x, y \};/);
  });

  it('every arm goes the same way, by Enter, number or click (takeSignBoard)', () => {
    const take = fn('takeSignBoard');
    assert.match(take, /releaseSignpostFocus\(\);/);
    assert.match(take, /if \(signpostTravelRefused\(\)\) return true;/);
    assert.match(take, /travelTo\(conn\.tsid, \{ label: conn\.label, arrive: conn\.arrive, via: 'signpost' \}\);/);
    assert.match(fn('signpostArmKey'), /return takeSignBoard\(hit\);/);
  });
});
