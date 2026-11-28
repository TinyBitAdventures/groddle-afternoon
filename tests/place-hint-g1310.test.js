/**
 * G1310 (Austin 2026-11-25 evening): after #669 took the walk-past chip off things on a computer,
 * the signpost and ladder chips ("Enter · Choose a road", "↑ climb", "↑↓ climb · Space jump") were
 * still there. Glitch put no words there either: the avatar's touch glowed a signpost and a ladder
 * as it did a thing (MiddleGroundRenderer.as glowSignPosts, glowLadders; SignpostView.as glow), and
 * a signpost's arms named their roads. Now on a computer the post at hand glows and no chip shows
 * at a post or a ladder; Enter still takes hold of the post and Up still climbs. Phones keep both
 * chips (the phone gate's 'phone').
 * Run: node --test tests/place-hint-g1310.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { signpostGlowParts } from '../public/js/street-render.js?v=d76d4268';

const ROOT = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const client = join(ROOT, '../glitch-client/com/tinyspeck/engine');

const node = (label, extra = {}) => ({ label, children: [], destroyed: false, ...extra });
const art = (label) => node(label, { texture: { width: 40 } });

describe('G1310: the post at hand glows on a computer', () => {
  it('the post and its arms glow, not the shadow, the words, the key caps or a stand-in', () => {
    const post = art('sign-post');
    const armA = art('sign-arm');
    const armB = art('sign-arm');
    const holderA = node('sign-arm-holder', { children: [node('sign-glow'), armA, node('sign-label', { texture: { width: 80 } }), node('sign-key')] });
    const holderB = node('sign-arm-holder', { children: [armB, node('sign-label')] });
    const stand = node('sign-arm-holder', { children: [node('sign-arm')] }); // a Graphics arm: no art to trace
    const view = node('', { children: [node('holder', { children: [art('sign-shadow'), post, holderA, holderB, stand] })] });
    assert.deepEqual(signpostGlowParts(view), [post, armA, armB]);
  });

  it('a lift drawn as its deco glows its art; a destroyed view and its old rims are skipped', () => {
    const lift = art('sign-deco-art');
    assert.deepEqual(signpostGlowParts(node('sign-deco', { children: [node('sign-deco-glow'), lift] })), [lift]);
    assert.deepEqual(signpostGlowParts(node('', { destroyed: true, children: [art('sign-post')] })), []);
    const rim = node('hover-outline', { children: [art('sign-post')] });
    assert.deepEqual(signpostGlowParts(node('', { children: [rim] })), []);
    assert.deepEqual(signpostGlowParts(null), []);
  });

  it('game.js: the post at hand takes the hover rim, none while it has hold or on a phone', () => {
    const game = read('public/game.js');
    assert.match(game, /function postGlowWanted\(\) \{\s*if \(reachGlowOff\(\) \|\| signpostFocus\) return \[\];\s*return \(signpostAtHand\(\)\?\.views \|\| \[\]\)/);
    // #721: each rim takes its post's street colour (signpostGlowFilters), so the loop keeps the view.
    assert.match(game, /for \(const \[view, part\] of views\.flatMap\(\(v\) => signpostGlowParts\(v\)\.filter\(rimArt\)\.map\(\(part\) => \[v, part\]\)\)\) \{[\s\S]{0,200}?const rim = createSpriteOutline\(part, \{ color: 0xa8e4ff, thickness: 2, filters: signpostGlowFilters\(view\) \}\);/);
    assert.match(game, /syncPostGlow\(\);\n\s*\}/);
    assert.match(game, /function reachGlowOff\(\) \{\s*if \(TOUCH_PHONE \|\|/);
    assert.match(game, /app\.canvas\.dataset\.postGlow = String\(postGlow\.rims\.length\)/);
  });

  it('game.js: no chip at a post or a ladder on a computer, both still on a phone', () => {
    const game = read('public/game.js');
    const run = game.slice(game.indexOf("run('prompt', () => {"), game.indexOf('// TOUCH: a phone\'s hint chips name a tap'));
    assert.match(run, /const placeHints = TOUCH_PHONE;/);
    assert.match(run, /if \(climb\.active\) \{\s*if \(placeHints\) want = \{ key: '↑↓', label: 'climb · Space jump'/);
    assert.match(run, /\} else if \(placeHints && nearClimb && /);
    assert.match(run, /\} else if \(placeHints && nearSign\) \{/);
    // The arm under the mouse still names its road (FRIENDPOST), and Enter at a post is unchanged.
    assert.match(run, /\} else if \(armHover\) \{/);
    assert.match(game, /function enterSignpost\(\) \{/);
  });

  it('Glitch glowed signposts and ladders the avatar touched, and not a post that had hold', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const mg = readFileSync(join(client, 'view/renderer/MiddleGroundRenderer.as'), 'utf8');
    assert.match(mg, /glowSignPosts\(lq\.resultSignPosts\);\s*glowDoors\(lq\.resultDoors\);\s*glowLadders\(lq\.resultLadders\);/);
    const sv = readFileSync(join(client, 'view/geo/SignpostView.as'), 'utf8');
    assert.match(sv, /if \(!has_focus\) interaction_target\.filters = StaticFilters\.tsSprite_GlowA;/);
  });

  it('is registered with the walk-past chip: phones only', () => {
    const reg = JSON.parse(read('tools/inventions/inventions.json'));
    const e = reg.entries.find((x) => x.id === 'enter-walk-past-chip');
    assert.ok(e.rows.includes('G1310'));
    assert.match(e.title, /signpost and ladder chips/);
    assert.match(e.ruling, /G1310/);
  });
});
