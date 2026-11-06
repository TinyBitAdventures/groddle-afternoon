/**
 * FRIENDPOST (Austin 2026-11-02, /play/online/ on his home street): "Can we make the sign posts
 * directly interactive on the home streets? ... you can't actually click on the individual signs
 * themselves." The home street's signpost (homes-feature's post with its top arm, Back to Ur, and
 * home-street-mp-feature's friends' arms below it, on your street and on a friend's) now has
 * every arm as its own board, the way a street post's are: hover glows that arm, a click or a tap
 * takes it, and at the post its number key does (Back to Ur 1, the friends 2 on). A click on the
 * post itself (not an arm) still opens its menu, with Edit your signpost for the owner. The Enter
 * hint sits over the post's top instead of on the top arm.
 *
 * The original (glitch-client, CC0): SignpostView.as made every visible connect its own
 * SignpostSignView (makeSign 290-329: mouseChildren off, useHandCursor), a friends' post no
 * different from a street's (render 226-249); the owner's post had an Edit button over its base
 * (251-274, shown on roll over 280-288). LocationInputHandler.as 396-399 took a click on a sign
 * as that sign (walking over first, _moveAvatarToSpriteAndStartInteraction 873-877 keeps
 * interaction_sign), and a click on the post focused it (387-393).
 * Run: node --test tests/home-signpost-arms.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SIGN_FIRST_ARM_Y, SIGN_SCALE, addSignBoard, setSignpostHover, setSignpostKeys, signpostBoardAt } from '../public/js/street-render.js?v=9349c0e5';
import { SIGN_PROMPT_LIFT } from '../public/js/features/homes-feature.js?v=9a88f70e';
import { FRIENDS_HIT_H } from '../public/js/features/home-street-mp-feature.js?v=97643fe4';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, 'public', p), 'utf8');
const game = read('game.js');
const mp = read('js/features/home-street-mp-feature.js');
const homes = read('js/features/homes-feature.js');
const render = read('js/street-render.js');

function fakePixi() {
  class Container {
    constructor() { this.children = []; this.x = 0; this.y = 0; this.rotation = 0; this.visible = true; this.destroyed = false; }
    addChild(...c) { this.children.push(...c); return c[0]; }
    addChildAt(c, i) { this.children.splice(i, 0, c); return c; }
  }
  class Graphics extends Container {
    roundRect() { return this; }
    fill() { return this; }
    stroke() { return this; }
  }
  class Text extends Container {
    constructor(o) { super(); this.text = o?.text; this.anchor = { set() {} }; }
  }
  class BlurFilter {}
  return { Container, Graphics, Text, BlurFilter };
}

/** A post as the home street draws it: Back to Ur (left, the first slot) and two friends below (right, left). */
function homePost(PIXI) {
  const view = new PIXI.Container();
  view.x = 600;
  view.y = 872;
  const arm = (y, left, opts) => {
    const holder = new PIXI.Container();
    holder.y = y;
    holder.x = left ? -2 : 2;
    holder.rotation = ((left ? 5.5 : -5.5) * Math.PI) / 180;
    return addSignBoard(PIXI, view, holder, { left, ...opts });
  };
  arm(SIGN_FIRST_ARM_Y, true, { width: 96, key: 1, tip: 'Back to Hechey Track' });
  arm(-200 + 32, false, { width: 130, key: 2, verbId: 'sign_go_0', tip: "Go to Bo's Home Street" });
  arm(-200 + 28 + 32, true, { width: 110, key: 3, verbId: 'sign_go_1', tip: "Go to Cy's Home Street" });
  return view;
}

const centre = (view, b) => {
  const lx = b.hitArea.x + b.hitArea.width / 2;
  const ly = b.hitArea.y + b.hitArea.height / 2;
  const c = Math.cos(b.rotation);
  const s = Math.sin(b.rotation);
  return { x: view.x + view.signScale * (b.x + lx * c - ly * s), y: view.y + view.signScale * (b.y + lx * s + ly * c) };
};

describe('FRIENDPOST: each arm of the home street\'s signpost is its own sign', () => {
  it('a scene arm is a board as a street post\'s are: its number, its verb, its words, a hit box on the arm alone', () => {
    const PIXI = fakePixi();
    const view = homePost(PIXI);
    assert.equal(view.signScale, SIGN_SCALE);
    assert.deepEqual(view.signBoards.map((b) => [b.key, b.scene, b.verbId, b.index]), [['1', true, '', 0], ['2', true, 'sign_go_0', 1], ['3', true, 'sign_go_1', 2]]);
    for (const b of view.signBoards) {
      const p = centre(view, b);
      const hit = signpostBoardAt([view], p.x, p.y);
      assert.equal(hit?.board, b, `arm ${b.key}`);
      assert.equal(hit.view, view);
    }
    // The bare post (under the arms, and between Back to Ur and the friends) is no arm: its own menu.
    assert.equal(signpostBoardAt([view], view.x, view.y - 20), null);
    assert.equal(signpostBoardAt([view], view.x + 1, view.y + ((SIGN_FIRST_ARM_Y + 15 + (-168 - 15)) / 2) * SIGN_SCALE), null);
    // An arm's tip reaches past the post's old 140 px menu box (a long name): still that arm.
    const far = view.signBoards[1];
    const tip = { x: view.x + (far.x + 125) * SIGN_SCALE, y: view.y + far.y * SIGN_SCALE - 125 * Math.sin(5.5 * Math.PI / 180) * SIGN_SCALE };
    assert.ok(tip.x - view.x > 70, 'outside the post\'s box');
    assert.equal(signpostBoardAt([view], tip.x, tip.y)?.board, far);
  });

  it('hover glows the one arm; at the post every arm shows its number', () => {
    const view = homePost(fakePixi());
    setSignpostHover(view, true, 1);
    assert.deepEqual(view.signBoards.map((b) => b.glow.visible), [false, true, false]);
    setSignpostHover(view, false);
    assert.deepEqual(view.signBoards.map((b) => b.glow.visible), [false, false, false]);
    setSignpostKeys(view, true);
    assert.deepEqual(view.signBoards.map((b) => b.keyCap.visible), [true, true, true]);
    // The glow is behind the arm, the key past its tip.
    for (const b of view.signBoards) assert.equal(b.glow.label, 'sign-glow');
  });

  it('homes-feature\'s post makes Back to Ur arm 1; the friends\' arms are 2 on, each going to its own home', () => {
    const one = render.slice(render.indexOf('export function oneArmSignpost('), render.indexOf('/** @type {Set<string>|null} */\nlet decoManifest'));
    assert.match(one, /addSignBoard\(PIXI, box, arm, \{ width: w, left, key: 1, arm: board, label \}\);/);
    const draw = mp.slice(mp.indexOf('  function drawSignpost('), mp.indexOf('  /** note_pole.as'));
    assert.match(draw, /addSignBoard\(PIXI, box, arm, \{ width: w, left, key: i \+ 2, arm: board, label, verbId: `sign_go_\$\{n\.position\}`, tip: T\.goVerb\(n\.name\) \}\);/);
    // The verb the arm names is the one the menu lists (and runs: visitHome).
    assert.match(mp, /arms\.map\(\(n\) => \(\{ id: `sign_go_\$\{n\.position\}`, label: T\.goVerb\(n\.name\)/);
    assert.match(mp, /if \(n\) engine\.query\?\.\('visitHome', n\.id, n\.name, engine\);/);
    // Hovering Back to Ur says where it leads, on your street and on a friend's.
    assert.match(homes, /for \(const b of gate\.signBoards \|\| \[\]\) b\.tip = way\.label \? `Back to \$\{way\.label\}` : '';/);
    assert.match(read('js/features/neighbours-mp-feature.js'), /for \(const b of spots\.gate\?\.signBoards \|\| \[\]\) b\.tip = way\.label \? `Back to \$\{way\.label\}` : '';/);
  });

  it('a click or tap on an arm runs that arm\'s verb as the menu would (walking over first); the post keeps its menu', () => {
    const down = game.slice(game.indexOf("app.canvas.addEventListener('pointerdown'"), game.indexOf('async function beginGame()'));
    assert.match(down, /const signBoard = signpostBoardAt\(signViewsHere\(\), sx, sy\);\n\s*\/\/ FRIENDPOST[^\n]*\n\s*if \(signBoard\?\.board\?\.scene\) \{\n\s*takeSceneArm\(signBoard\);\n\s*return;/);
    // Not a mouse-only path: touch and pen reach it (only a mouse's other buttons are left out).
    assert.match(down, /if \(e\.pointerType === 'mouse' && e\.button !== 0\) return;/);
    // Anything else on the post (pickInteractableAt) opens its verb menu.
    assert.ok(down.indexOf('takeSceneArm(signBoard)') < down.indexOf('openVerbMenu(best);'));
    const take = game.slice(game.indexOf('function takeSceneArm(hit)'), game.indexOf('function signpostArmKey(key)'));
    assert.match(take, /const target = board\?\.target \|\| interactables\.find\(\(t\) => t\?\.sprite === hit\?\.view\) \|\| null;/);
    assert.match(take, /const verbs = menuVerbsFor\(target\) \|\| \[\];/);
    assert.match(take, /requestVerb\(target, verb\);/);
    const move = game.slice(game.indexOf("app.canvas.addEventListener('pointermove'"), game.indexOf("app.canvas.addEventListener('pointerleave'"));
    assert.match(move, /signpostBoardAt\(signViewsHere\(\), wx, wy\)/);
    // The scene's posts are the registered targets' sprites with scene boards.
    assert.match(game, /if \(v && !v\.destroyed && v\.parent && v\.signBoards\?\.some\(\(b\) => b\.scene\) && !out\.includes\(v\)\) out\.push\(v\);/);
  });

  it('at the post, its number key takes an arm (home is no street: the street posts\' refusal is not asked)', () => {
    const key = game.slice(game.indexOf('function signpostArmKey(key)'), game.indexOf('function doTeleport()'));
    assert.ok(key.indexOf('if (board.scene) {') < key.indexOf('if (signpostTravelRefused()) return true;'));
    assert.match(key, /takeSceneArm\(hit\);/);
    const hand = game.slice(game.indexOf('function scenePostAtHand()'), game.indexOf('function signBoardLabel('));
    assert.match(hand, /if \(dx > 140 \|\| Math\.abs\(v\.y - player\.y\) > 120\) continue;/);
    assert.match(hand, /\.sort\(\(a, b\) => Number\(a\.board\.key\) - Number\(b\.board\.key\)\)/);
  });

  it('the Enter hint and an arm\'s hover words sit over the post\'s top, clear of Back to Ur', () => {
    const half = 15 * SIGN_SCALE;
    const rise = 96 * SIGN_SCALE * Math.sin((5.5 * Math.PI) / 180);
    const topArmTop = -SIGN_FIRST_ARM_Y * SIGN_SCALE + half + rise;
    assert.ok(SIGN_PROMPT_LIFT > topArmTop + 6, `${SIGN_PROMPT_LIFT} over ${topArmTop.toFixed(1)}`);
    // Before: the friends' box top plus 12 put the 22 px chip on the top arm ("Back to Ur is half hidden").
    const before = FRIENDS_HIT_H - 2 + 12;
    assert.ok(before < topArmTop && before + 22 > -SIGN_FIRST_ARM_Y * SIGN_SCALE - half, 'the old hint covered the top arm');
    assert.match(homes, /post\._promptLift = SIGN_PROMPT_LIFT;/);
    assert.match(mp, /box\._promptLift = SIGN_PROMPT_LIFT;/);
    assert.match(game, /y: near\.sprite\._promptLift \? near\.sprite\.y - near\.sprite\._promptLift : \(box \? box\.top : near\.sprite\.y - 74\) - 12,/);
    assert.match(game, /want = \{ key: live \? armHover\.board\.key : '', label: signBoardLabel\(armHover\.board\), x: v\.x, y: v\.y - \(v\._promptLift \|\| 207\) \};/);
  });

  it('the original made every arm its own sign (glitch-client SignpostView.as, LocationInputHandler.as)', (t) => {
    const client = join(root, '..', 'glitch-client', 'com', 'tinyspeck', 'engine');
    if (!existsSync(client)) return t.skip('no glitch-client beside the checkout');
    const view = readFileSync(join(client, 'view', 'geo', 'SignpostView.as'), 'utf8');
    assert.match(view, /ssv\.mouseChildren = false;\n\s*ssv\.useHandCursor = true;/);
    assert.match(view, /private function clickHandler\(e:MouseEvent\):void \{\n\s*var index:int = signs\.indexOf\(e\.target as SignpostSignView\);/);
    assert.match(view, /if\(pc && pc\.home_info && _loc_tsid == pc\.home_info\.exterior_tsid\)\{\n\s*_edit_bt = new Button\(\{/);
    const input = readFileSync(join(client, 'view', 'renderer', 'LocationInputHandler.as'), 'utf8');
    assert.match(input, /if \(clickTarget is SignpostSignView\) \{\n\s*var ssvElem:SignpostSignView = clickTarget as SignpostSignView;\n\s*_moveAvatarToSpriteAndStartInteraction\(ssvElem\.signpostView, ssvElem\);/);
  });
});
