/**
 * Signpost arm keys (Austin 2026-11-01): a post's arms are numbered 1 to N from the top, each
 * shows a small key past its tip while the avatar stands at the post, and that number key takes
 * the arm, as a click on it does; typing in a field never travels. Since 2026-11-02 Enter and E hold
 * a post of several arms as the client did and T no longer travels (tests/signpost-focus.test.js).
 *
 * The client focused the post (SignpostView.as 395-490: Up/Down or W/S move between the arms,
 * Enter goes) and drew every visible connect, one under the other (229-247); the remake adds the
 * number keys. The post at hand is the one
 * Enter and the T hint find (street-model.js signpostNear with signpostReachY, player report 33),
 * never a post at a deckless ladder top or one buried under the floor (ladder-top-signposts.js
 * walkUpSignpostStreet), and never from a ladder.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walkUpSignpostStreet } from '../public/js/ladder-top-signposts.js?v=046013b4';
import { navigableSignposts, signpostNear, worldToScreen } from '../public/js/street-model.js?v=b6cb6a4e';
import { SIGN_MAX_ARMS, setSignpostKeys } from '../public/js/street-render.js?v=2e521905';
import { hotkeySections, hotkeyText } from '../public/js/client-hotkeys.js?v=31d1891d';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(spike, 'public', p), 'utf8');
const game = read('game.js');
const render = read('js/street-render.js');
const streetJson = (tsid) => {
  const s = JSON.parse(readFileSync(join(spike, 'public/assets/streets', `${tsid}.json`), 'utf8'));
  s.signposts = navigableSignposts(s.signposts, tsid);
  return s;
};

describe('signpost arm keys: the arms', () => {
  it('draws every visible arm, top first, each with its number key', () => {
    assert.equal(SIGN_MAX_ARMS, 9, 'one arm for each number key');
    assert.match(render, /const shown = connects\.slice\(0, SIGN_MAX_ARMS\);/);
    assert.match(render, /const armY = -postH \+ visibleI \* 28 \+ 32;/, 'arm 1 is the top one');
    assert.match(render, /const keyCap = signKeyCap\(PIXI, visibleI \+ 1\);[\s\S]{0,300}keyCap\.visible = false;/);
    assert.match(render, /key: String\(visibleI \+ 1\),/);
  });

  it('shows and hides a post\'s keys together', () => {
    const view = { signBoards: [{ keyCap: { visible: false } }, { keyCap: { visible: false } }] };
    setSignpostKeys(view, true);
    assert.deepEqual(view.signBoards.map((b) => b.keyCap.visible), [true, true]);
    assert.equal(view.signKeysShown, true);
    setSignpostKeys(view, false);
    assert.deepEqual(view.signBoards.map((b) => b.keyCap.visible), [false, false]);
    setSignpostKeys(null, true);
  });

  it('a four-arm post numbers 1 to 4 (Otterlane), and a five-connect lift post drops its own street (Sabudana Drama Towers)', () => {
    const otter = streetJson('GCR10K3BPJK1U6F');
    assert.equal(Math.max(...otter.signposts.map((s) => s.connects.length)), 4);
    const towers = streetJson('GIFI4FP9GRU2CC8');
    assert.deepEqual(towers.signposts[0].connects.map((c) => c.label), [
      'Sabudana Drama Towers, floor 4',
      'Sabudana Drama Towers, floor 2',
      'Sabudana Drama Towers, floor 3',
      'Sabudana Drama Towers, floor 1',
    ]);
  });
});

describe('signpost arm keys: the post at hand', () => {
  it('is the post Enter and the T hint find, never from a ladder', () => {
    const fn = game.slice(game.indexOf('function signpostAtHand()'), game.indexOf('function sceneSignViews()'));
    assert.match(fn, /if \(climb\.active \|\| !player\) return null;\n\s*if \(currentStreet\) \{/);
    assert.match(fn, /signpostNear\(walkUpSignpostStreet\(currentStreet\), player\.x, 140, player\.y\)/);
    // FRIENDPOST: else the post a scene draws itself (the home street's signpost).
    assert.match(fn, /return scenePostAtHand\(\);/);
  });

  it('a deckless ladder-top post and a buried post never show keys', () => {
    // Groddle Ladder's signpost_3 tops the spine ladder (ladder-top-signposts.test.js); from the
    // ladder's top rung its post is not at hand on foot.
    const ladder = streetJson('GM4115NJ46G8M');
    const top = ladder.signposts.find((s) => s.id === 'signpost_3');
    assert.ok(top, 'Groddle Ladder keeps signpost_3');
    assert.ok(!walkUpSignpostStreet(ladder).signposts.includes(top), 'off the walk-up list');
    const pos = worldToScreen(ladder, top.x, top.y);
    assert.equal(signpostNear(walkUpSignpostStreet(ladder), pos.x, 140, pos.y)?.signpost?.id === 'signpost_3', false);
  });

  it('shows the keys only while the prompt is worked out, and hides them otherwise', () => {
    assert.match(game, /const nearSign = currentStreet \? signpostNear\(walkUpSignpostStreet\(currentStreet\), player\.x, 140, player\.y\) : null;\n\s*const postAtHand = signpostAtHand\(\);\n\s*showSignpostKeys\(postAtHand\);/);
    assert.match(game, /prompt\.visible = false;\n\s*showSignpostKeys\(null\);/);
  });
});

describe('signpost arm keys: the keys', () => {
  it('1 to 9 take the arm with that number after the menus and panels, before the map key', () => {
    const at = game.indexOf('if (!e.repeat && !e.shiftKey && signpostArmKey(e.key)) {');
    assert.ok(at > 0);
    // The key that opens the Map (since #206 another such line closes an open Map, earlier in the handler).
    assert.ok(at < game.indexOf("if (!document.body.classList.contains('nx-hide-map')) openMap();"), 'before the map key');
    assert.ok(at > game.indexOf('if (verbMenuKey(document.getElementById(\'verb-menu\'), e)) {'), 'a verb menu keeps 1 to 9');
    // The world's keydown returns at once for a field (typing never travels).
    assert.match(game, /window\.addEventListener\('keydown', \(e\) => \{\n\s*if \(e\.target\?\.matches\?\.\('input, textarea, select, \[contenteditable="true"\]'\)\) \{/);
  });

  it('goes as a click on the arm does, through the same refusals as T did', () => {
    const fn = game.slice(game.indexOf('function signpostArmKey(key)'), game.indexOf('let signpostFocus = null;'));
    assert.match(fn, /return takeSignBoard\(hit\);/);
    assert.match(fn, /if \(signpostTravelRefused\(\)\) return true;/);
    assert.match(fn, /pickConnection\(\{ connects: \[board\.connection\] \}, availableStreetTsids\(\)\)/);
    assert.match(fn, /travelTo\(conn\.tsid, \{ label: conn\.label, arrive: conn\.arrive, via: 'signpost' \}\)/);
    // Ticket 37: a road to a street not in the game says so (game.js ROAD_NOT_IN_GAME), not "not loaded yet".
    assert.match(fn, /toast\(ROAD_NOT_IN_GAME\);/);
    assert.match(game, /function doTeleport\(\) \{\n\s*if \(signpostTravelRefused\(\)\) return;/);
  });

  it('the hotkey sheet (?) lists them', () => {
    const rows = hotkeySections().flatMap((s) => s.rows.map(([label, alts, note]) => `${label}: ${hotkeyText(alts)} ${note || ''}`.trim()));
    assert.ok(rows.includes('Signpost Arm: 1-9 (At a signpost: arms numbered from the top)'), rows.join('\n'));
  });

  it('a number with no arm keeps its own use: 5 says hi unless a fifth arm takes it', () => {
    assert.match(game, /signpostTakesKey: \(key\) => Boolean\(signpostArmFor\(key\)\),/);
    const hi = read('js/features/hi-signs-feature.js');
    assert.match(hi, /if \(eng\.signpostTakesKey\?\.\(e\.key\)\) return;\n\s*if \(e\.key === '5'/);
  });
});
