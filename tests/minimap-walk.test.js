/**
 * MAPWALK: click the street map to walk there (glitch-client MiniMapView.as mouseUpHandler,
 * TSFrontController.startUserInitiatedPath, AvatarController.beginPath / onGameLoop / endPath,
 * AvatarPhysicsHandler's path steering and hasHitWall). js/user-path.js, the map's click
 * (js/ui/street-minimap.js), the feature's walkFromMap and game.js startUserWalk.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTokens } from './css-tokens.js';
import {
  PATH_END_ALLOWANCE,
  PATH_MAX_OFFSET,
  PATH_STALL_FRAMES,
  createUserPath,
  pathGoalX,
  stepUserPath,
} from '../public/js/user-path.js?fresh=minimap-walk';
import { DEST_MARK, mapGeometry, mapToWorld, toMap } from '../public/js/ui/street-minimap.js?fresh=minimap-walk';
import { walkFromMap } from '../public/js/features/street-minimap-feature.js?fresh=minimap-walk';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('map walk: the goal (beginPath)', () => {
  it('the source numbers: path_end_allowance 20, max_offset 70', () => {
    assert.equal(PATH_END_ALLOWANCE, 20);
    assert.equal(PATH_MAX_OFFSET, 70);
  });

  it('a signpost and a point are their own x', () => {
    assert.equal(pathGoalX({ kind: 'sign', x: 900 }, 100), 900);
    assert.equal(pathGoalX({ kind: 'point', x: 40 }, 800), 40);
  });

  it('a player or an item stops short on your side: half the way, at most 70', () => {
    assert.equal(pathGoalX({ kind: 'player', x: 1000 }, 100), 930, 'far: 70 short');
    assert.equal(pathGoalX({ kind: 'player', x: 1000 }, 1900), 1070, 'from the right: 70 past');
    assert.equal(pathGoalX({ kind: 'item', x: 1000 }, 940), 970, 'near: half the gap');
    assert.equal(pathGoalX({ kind: 'player', x: 'x' }, 0), null);
  });

  it('a walk keeps its goal inside the street and knows its street', () => {
    const p = createUserPath({ kind: 'point', id: '', x: 5000, y: 300 }, { fromX: 100, tsid: 'L1', worldW: 3000 });
    assert.deepEqual([p.user, p.x, p.y, p.tsid, p.kind], [true, 3000, 300, 'L1', 'point']);
    assert.equal(createUserPath({ kind: 'sign', x: NaN }, { fromX: 0 }), null);
  });
});

describe('map walk: each frame (onGameLoop, updateAvatarVelocities, endPath)', () => {
  const walk = (x = 1000, fromX = 100) => createUserPath({ kind: 'point', x }, { fromX, tsid: 'L1' });

  it('holds left or right toward the goal, as the arrow keys would', () => {
    const p = walk(1000, 100);
    assert.deepEqual(stepUserPath(p, { x: 100, tsid: 'L1' }), { dir: 1, end: null });
    assert.deepEqual(stepUserPath(p, { x: 104, tsid: 'L1' }), { dir: 1, end: null });
    const back = walk(10, 600);
    assert.equal(stepUserPath(back, { x: 600, tsid: 'L1' }).dir, -1);
  });

  it('arrives within 20 px of the goal (x only: a goal up on a ledge stops under it)', () => {
    const p = walk(1000, 100);
    assert.equal(stepUserPath(p, { x: 979, tsid: 'L1' }).end, null);
    assert.equal(stepUserPath(p, { x: 981, tsid: 'L1' }).end, 'arrived');
  });

  it('any movement key or Space ends it, and so does a new street', () => {
    assert.equal(stepUserPath(walk(), { x: 100, moving: true, tsid: 'L1' }).end, 'key');
    assert.equal(stepUserPath(walk(), { x: 100, jump: true, tsid: 'L1' }).end, 'jump');
    assert.equal(stepUserPath(walk(), { x: 100, tsid: 'L2' }).end, 'street');
  });

  it('a wall (no headway for a few frames) ends it; walking on resets the count', () => {
    assert.equal(PATH_STALL_FRAMES, 6);
    const p = walk(1000, 100);
    let x = 100;
    for (let i = 0; i < 4; i++) assert.equal(stepUserPath(p, { x, tsid: 'L1' }).end, null);
    x += 3;
    assert.equal(stepUserPath(p, { x, tsid: 'L1' }).end, null);
    assert.equal(p.stall, 0);
    let end = null;
    for (let i = 0; i < PATH_STALL_FRAMES && !end; i++) end = stepUserPath(p, { x, tsid: 'L1' }).end;
    assert.equal(end, 'wall');
  });
});

describe('map walk: the click (mouseUpHandler)', () => {
  const street = { bounds: { l: 0, r: 3200, t: -1000, b: 0 } };

  it('a map point is the world point under it, with the slice scrolled', () => {
    const g = mapGeometry(street, { width: 160 });
    const at = mapToWorld(g, 80, 25, 0);
    assert.deepEqual([at.x, at.y], [1600, 500]);
    const back = toMap(g, at.x, at.y);
    assert.deepEqual([back.x, back.y], [80, 25]);
    assert.equal(mapToWorld(g, 0, 10, 15).y, 500, 'scrollY adds');
    assert.deepEqual(mapToWorld(g, -9, 999), { x: 0, y: 1000 }, 'kept inside the street');
  });

  it('the view walks on a click or Enter: a mark is its thing, elsewhere is the point', () => {
    const mod = read('public/js/ui/street-minimap.js');
    assert.match(mod, /card\.addEventListener\('click', \(e\) => \{[\s\S]{0,900}const keyboard = e\.detail === 0;/);
    assert.match(mod, /goal = \{ kind: row\.mark\.kind, id: row\.mark\.id, x: row\.mark\.x, y: row\.mark\.y \};/);
    assert.match(mod, /goal = \{ kind: 'point', id: '', \.\.\.mapToWorld\(geom, e\.clientX - rect\.left, e\.clientY - rect\.top, scrollY\) \};/);
    assert.match(mod, /opts\.onWalk\?\.\(goal, \{ keyboard \}\);/);
    // The hide button is its own; a pointer press never leaves the focus on a mark.
    assert.match(mod, /e\.target\?\.closest\?\.\('\.smm-hide'\)\) return;/);
    assert.match(mod, /card\.addEventListener\('mousedown', \(e\) => \{\s+if \(e\.target\?\.closest\?\.\('\[data-mark\]'\)\) e\.preventDefault\(\);/);
    assert.doesNotMatch(mod, /Left out: clicking the map to walk there/);
  });

  it('the feature hands the goal to engine.walkTo and takes the keys back from a text field', () => {
    let blurred = 0;
    const doc = { activeElement: { matches: (s) => s.includes('input'), blur: () => { blurred += 1; } } };
    const data = {};
    const goals = [];
    const engine = { walkTo: (g) => (goals.push(g), true), setData: (k, v) => { data[k] = v; }, userWalkGoal: null };
    assert.equal(walkFromMap(engine, { kind: 'sign', id: 's1', x: 812.4, y: -40 }, { doc }), true);
    assert.deepEqual([blurred, data.streetMapWalk, goals.length], [1, 'sign:812', 1]);
    walkFromMap(engine, { kind: 'player', id: 'u7', x: 10, y: 0 }, { keyboard: true, doc });
    assert.equal(blurred, 1, 'Enter on a mark keeps the focus where it is');
    const refused = { walkTo: () => false, setData: (k, v) => { data[k] = v; } };
    assert.equal(walkFromMap(refused, { kind: 'point', x: 1, y: 1 }, { doc }), false);
    assert.equal(data.streetMapWalk, 'refused');
  });

  it('the goal ring: the remake\'s own small mark (the client drew none), tokens, no click', () => {
    assert.equal(DEST_MARK.d, 8);
    const mod = read('public/js/ui/street-minimap.js');
    assert.match(mod, /<span class="smm-dest" aria-hidden="true" hidden><\/span>/);
    assert.match(read('public/js/features/street-minimap-feature.js'), /view\.setDestination\(engine\.userWalkGoal \|\| null\);/);
    const css = resolveTokens(read('public/style.css'));
    const block = css.slice(css.indexOf('/* —— MINIMAP —— */'), css.indexOf('/* —— end MINIMAP —— */'));
    assert.match(block, /\.smm-dest \{[^}]*pointer-events: none;[^}]*border: calc\(2px \* var\(--mm-u\)\) solid #ffd616;/);
    assert.match(block, /\.smm-window \{[^}]*cursor: pointer;/, 'the hand cursor over the whole map (map_sp.useHandCursor)');
  });
});

describe('map walk: game.js (startUserInitiatedPath)', () => {
  const game = read('public/game.js');
  const start = game.slice(game.indexOf('function startUserWalk('), game.indexOf('function endUserWalk('));

  it('refused while the game\'s own walk runs, a menu or scene holds you, or in a Paradise course', () => {
    assert.match(start, /if \(avatarWalk && !avatarWalk\.user\) return false;/);
    assert.match(start, /if \(gameplayInputBlocked\(\) \|\| paradiseIsInstanced\(\)\) return false;/);
    assert.match(start, /if \(climb\.active\) stopClimb\(\);/, 'getOffLadder');
  });

  it('steers through the shared walk, ends on a jump, a hold or the game\'s walk', () => {
    assert.match(game, /const step = stepUserPath\(w, \{ x: player\.x, moving: userMoving, jump: hasQueuedJump\(jumpState, movementNow\(\)\), tsid: currentStreetTsid \}\);/);
    assert.match(game, /function handleInput\(\) \{\n  if \(gameplayInputBlocked\(\)\) \{\n    \/\/ MAPWALK[^\n]*\n    endUserWalk\('held'\);/);
    assert.match(game, /function startAvatarWalk\(x, face = ''\) \{\n[^\n]*\n[^\n]*\n  endUserWalk\('game'\);/);
  });

  it('beside the player you walked to, their menu opens (endPath: startInteractionWith the PCView)', () => {
    assert.match(game, /if \(reason === 'arrived' && w\.kind === 'player' && w\.id && !menuTarget\) \{[\s\S]{0,200}t\?\.classId === 'pc_remote' && String\(t\.playerId\) === w\.id[\s\S]{0,80}withinReach\(them, 100\)\) openVerbMenu\(them\);/);
  });

  it('the engine answers walkTo and userWalkGoal', () => {
    assert.match(game, /walkTo: \(goal\) => startUserWalk\(goal\),/);
    assert.match(game, /get userWalkGoal\(\) \{\n    const w = avatarWalk;\n    return w\?\.user \? \{ kind: w\.kind, id: w\.id, x: w\.x, y: w\.y \} : null;/);
  });
});
