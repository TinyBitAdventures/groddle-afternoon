/**
 * Ticket 71: following another player keeps pace, follows their jumps and
 * carries on while a card is open. In Glitch the follower's own physics stood
 * aside and the server walked it along the leader's path (glitch-client
 * AvatarView.as 107-119, 255; GameServerJS main.js 27 follow_move_end). The
 * remake walks the follower itself: js/follow-mp.js (the walk, the catch-up,
 * the take-off points), features/follow-mp-feature.js followSteer (asked by
 * game.js handleInput in place of coasting), js/movement.js
 * matchLeaderJumpStep (the triple-jump step) and the lift_triple wire word.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  FOLLOW_CATCHUP_SPEED,
  FOLLOW_OFFSCREEN_MS,
  FOLLOW_TAKEOFF_MAX_AGE_MS,
  FOLLOW_TAKEOFF_REACH,
  FOLLOW_TRAIL_DISTANCE,
  createTakeoffLog,
  followSpeedLimit,
  followSteerVelocity,
  followVelocity,
  leaderGrounded,
  noteLeaderSample,
  pruneTakeoffs,
  takeoffDue,
  trailingX,
} from '../public/js/follow-mp.js?v=9f45db20';
import { followMpFeature } from '../public/js/features/follow-mp-feature.js?v=eba68b74';
import { coastX, NORMAL_BUFF, WALK_MAX } from '../public/js/avatar-step.js?v=537aa4b7';
import { createJumpState, matchLeaderJumpStep, queueJump, resolveQueuedJump } from '../public/js/movement.js?v=b30f84eb';

const ROOT = join(import.meta.dirname, '..');
const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');
const FRAME = 1000 / 60;

// A clock the feature reads (performance.now) that the tests move.
let clockNow = 100000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clockNow }, configurable: true, writable: true });

const keyListeners = [];
globalThis.window ??= { addEventListener: (type, fn) => { if (type === 'keydown') keyListeners.push(fn); } };
const press = (key) => { for (const fn of keyListeners) fn({ key, target: null }); };

function fakeClient() {
  const listeners = new Map();
  const sent = [];
  return {
    me: { id: 1, name: 'Ada' },
    sent,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    msg(m) { for (const fn of listeners.get(`msg:${m.t}`) || []) fn(m); },
    emit(type, payload) { for (const fn of listeners.get(type) || []) fn(payload); },
    send(kind, payload) { sent.push([kind, payload]); return true; },
  };
}

const client = fakeClient();
const remotes = new Map();
globalThis.groddleRealtime = { remotes };
const leader = { x: 600, y: -100, destroyed: false };
remotes.set(2, { root: leader });
const engine = {
  mode: 'multiplayer',
  started: true,
  streetTsid: 'GA5A',
  player: { x: 100, y: -100, vx: 0, onGround: true },
  // The camera follows the player, as game.js's does.
  get camera() { return { x: engine.player.x - 500, y: engine.player.y - 450, w: 1000, h: 600 }; },
  data: {},
  query(hook) { return hook === 'realtimeClient' ? client : null; },
  prompt: () => 'p1',
  removePrompt() {},
  pushActivity() {},
  toast() {},
  setData(k, v) { engine.data[k] = String(v); },
  acting: () => false,
  streetExists: () => true,
  travel: () => Promise.resolve({ ok: true }),
  save() {},
};
followMpFeature.onTick(16, Date.now(), engine);

function startFollowing() {
  client.msg({ t: 'follow_started', id: 2, name: 'Bo', streets: 1 });
}

/** One frame of handleInput + physics as the follower sees it: the hook's vx, then the move. */
function frame(leaderVx = 0) {
  clockNow += FRAME;
  const out = followMpFeature.followSteer(engine, { max: WALK_MAX, now: clockNow });
  if (out?.place) {
    engine.player.x = out.place.x;
    engine.player.y = out.place.y;
  }
  if (out) engine.player.vx = out.vx;
  engine.player.x += engine.player.vx;
  leader.x += leaderVx;
  return out;
}

describe('ticket 71: the follow walks at full speed', () => {
  it('the old order (vx set after physics, then the coast) held a follower near 2.6 px a frame', () => {
    // game.js before: handleInput coasted (vx * 0.78 on the floor), physics moved, features.tick set vx.
    let x = 0;
    let lx = 200;
    let vx = 0;
    let moved = 0;
    for (let i = 0; i < 600; i += 1) {
      vx = coastX(vx, true, NORMAL_BUFF);
      x += vx;
      moved = vx;
      lx += WALK_MAX;
      vx = followVelocity(x, lx, vx, WALK_MAX);
    }
    assert.ok(moved < 2.8, `settled at ${moved.toFixed(2)} px a frame`);
    assert.ok(lx - x > 1000, 'and fell far behind');
  });

  it('steering in handleInput keeps the leader\'s 4.4 px a frame and a short gap', () => {
    let x = 0;
    let lx = 200;
    let vx = 0;
    for (let i = 0; i < 600; i += 1) {
      vx = followSteerVelocity(x, trailingX(x, lx), vx, followSpeedLimit(lx - x, WALK_MAX));
      x += vx;
      lx += WALK_MAX;
    }
    assert.ok(Math.abs(vx - WALK_MAX) < 0.05, `walks at ${vx.toFixed(2)}`);
    assert.ok(lx - x < 140 && lx - x > FOLLOW_TRAIL_DISTANCE, `gap ${Math.round(lx - x)} px`);
  });

  it('through the feature: following a walking leader for 10 s keeps up', () => {
    startFollowing();
    engine.player.x = 100;
    leader.x = 250;
    for (let i = 0; i < 600; i += 1) frame(WALK_MAX);
    assert.ok(engine.player.vx > WALK_MAX - 0.05, `vx ${engine.player.vx.toFixed(2)}`);
    assert.ok(leader.x - engine.player.x < 140, `gap ${Math.round(leader.x - engine.player.x)} px`);
    // A leader who stops: the follower stands at the trailing gap.
    for (let i = 0; i < 200; i += 1) frame(0);
    assert.equal(engine.player.vx, 0);
    assert.ok(Math.abs(leader.x - FOLLOW_TRAIL_DISTANCE - engine.player.x) <= 10);
  });

  it('the solo follow of the recorded Glitches still steers in handleInput as before', () => {
    assert.match(game, /companionFollowVelocity\(player\.x, followee\.sprite\.x, player\.vx, \{ maxSpeed: max \}\)/);
    const input = game.slice(game.indexOf('function handleInput() {'), game.indexOf('function soloChickenPause'));
    const follow = input.indexOf("features.query('followSteer', engine, { max, now })");
    assert.ok(follow > 0 && follow < input.indexOf('} else if (follow) {'), 'the hook is asked before the walk');
    assert.ok(input.indexOf('} else if (follow) {') < input.indexOf('} else if (companionFollowState.active'), 'in place of coasting');
  });
});

describe('ticket 71: catching up', () => {
  it('walks up to 1.3x the walk speed when far behind, the walk speed when close', () => {
    assert.equal(followSpeedLimit(80, WALK_MAX), WALK_MAX);
    assert.equal(followSpeedLimit(130, WALK_MAX), WALK_MAX);
    assert.ok(Math.abs(followSpeedLimit(250, WALK_MAX) - WALK_MAX * FOLLOW_CATCHUP_SPEED) < 1e-9);
    assert.ok(Math.abs(followSpeedLimit(900, WALK_MAX) - WALK_MAX * FOLLOW_CATCHUP_SPEED) < 1e-9);
    const mid = followSpeedLimit(190, WALK_MAX);
    assert.ok(mid > WALK_MAX && mid < WALK_MAX * FOLLOW_CATCHUP_SPEED);
  });

  it('closes a 600 px gap on a walking leader, never faster than 1.3x', () => {
    engine.player.x = 100;
    engine.player.vx = 0;
    leader.x = 700;
    let top = 0;
    let frames = 0;
    while (leader.x - engine.player.x > 160 && frames < 1200) {
      frame(WALK_MAX);
      top = Math.max(top, engine.player.vx);
      frames += 1;
    }
    assert.ok(frames < 1200, 'caught up');
    assert.ok(top > WALK_MAX + 0.5, `top ${top.toFixed(2)}`);
    assert.ok(top <= WALK_MAX * FOLLOW_CATCHUP_SPEED + 1e-9);
    assert.equal(engine.data.followMpPlaced, '0', 'walked, not put');
  });

  it('puts a follower more than 1000 px away at the trailing spot behind the leader', () => {
    engine.player.x = 100;
    leader.x = 1300;
    client.emit('moved', { id: 2, x: leader.x, y: leader.y, dir: 1, anim: 'walk1x' });
    const out = frame(0);
    assert.ok(out.place, 'placed');
    assert.equal(out.place.x, 1300 - FOLLOW_TRAIL_DISTANCE);
    assert.equal(out.place.y, leader.y);
    assert.equal(engine.data.followMpPlaced, '1');
    // Facing left, the trailing spot is on their right.
    clockNow += 2000;
    engine.player.x = 100;
    leader.x = 2400;
    client.emit('moved', { id: 2, x: leader.x, y: leader.y, dir: -1, anim: 'stand' });
    assert.equal(frame(0).place.x, 2400 + FOLLOW_TRAIL_DISTANCE);
  });

  it('waits for a leader in the air to land before putting the follower there', () => {
    clockNow += 2000;
    engine.player.x = 100;
    leader.x = 1500;
    client.emit('moved', { id: 2, x: leader.x, y: leader.y - 60, dir: 1, anim: 'fall' });
    assert.equal(frame(0).place, null);
    client.emit('moved', { id: 2, x: leader.x, y: leader.y, dir: 1, anim: 'stand' });
    assert.ok(frame(0).place);
  });

  it('puts the follower there when the leader has been off screen a moment', () => {
    clockNow += 2000;
    engine.player.x = 100;
    engine.player.y = -100;
    leader.x = 300;
    leader.y = -700; // above the camera (y -550 .. 50)
    client.emit('moved', { id: 2, x: leader.x, y: leader.y, dir: 1, anim: 'stand' });
    assert.equal(frame(0).place, null, 'not at once');
    let placedAfter = 0;
    for (let i = 0; i < 120; i += 1) {
      placedAfter += FRAME;
      if (frame(0).place) break;
    }
    assert.ok(placedAfter >= FOLLOW_OFFSCREEN_MS - 1 && placedAfter < FOLLOW_OFFSCREEN_MS + 100, `after ${Math.round(placedAfter)} ms`);
    leader.y = -100;
    engine.player.y = -100;
  });

  it('game.js puts it on the floor there (or the leader\'s spot) and fades it in', () => {
    const fn = game.slice(game.indexOf('function placeFollower(place, now) {'), game.indexOf('function fadeInPlacedFollower'));
    assert.match(fn, /walkSurfaceY\(streetPlatforms, x, y - 2, \{ up: 48, down: 48 \}, isStandable\)/);
    assert.match(fn, /place\.leaderX/);
    assert.match(fn, /player\.alpha = 0\.15;/);
    assert.match(game, /if \(follow\?\.place\) placeFollower\(follow\.place, now\);/);
  });
});

describe('ticket 71: carrying on under a card', () => {
  it('the follow keeps steering whatever is open (the hook does not look at cards)', () => {
    clockNow += 2000;
    engine.player.x = 100;
    leader.x = 400;
    assert.equal(followMpFeature.followActive(engine), true);
    const out = frame(WALK_MAX);
    assert.ok(out.vx > 0);
  });

  it('handleInput keeps walking a follower under a card, quest dialog or award screen, not through a scene', () => {
    const held = game.slice(game.indexOf('function avatarHeldByScene() {'), game.indexOf('/** Ticket 71: the fade-in'));
    for (const name of ['menuTarget', 'currentAction', 'hogHaulBlocksInput()', 'rookHitFx', "'screen-transition'", "homeEditMode"]) assert.ok(held.includes(name), name);
    for (const name of ['isScreenFxBlocking', 'isQuestDialogueOpen', 'isVogOpen', 'isMapOpen', 'isPackPopoverOpen']) assert.ok(!held.includes(name), `${name} only takes the keys`);
    const blocked = game.slice(game.indexOf('function gameplayInputBlocked() {'), game.indexOf('function avatarHeldByScene() {'));
    for (const name of ['avatarHeldByScene()', 'isQuestDialogueOpen()', 'isVogOpen()', 'isRookMuseumExhibitOpen()', 'isScreenFxBlocking()', 'isPackPopoverOpen()', 'isMapOpen()', 'isGardenOpen()', 'isAvatarOpen()', 'isShrineOpen()']) {
      assert.ok(blocked.includes(name), `still holds the keys: ${name}`);
    }
    const input = game.slice(game.indexOf('function handleInput() {'), game.indexOf('function soloChickenPause'));
    assert.match(input, /followUnderCard = !avatarHeldByScene\(\) && !climb\.active && features\.query\('followActive', engine\) === true;\n\s+if \(!followUnderCard\) \{\n\s+player\.vx = 0;\n\s+return;/);
    assert.match(input, /const keyed = !followUnderCard;\n\s+let left = keyed && /, 'the card keeps the keys');
    assert.ok(input.indexOf('clearJumpQueue(jumpState);') < input.indexOf('followUnderCard = !avatarHeldByScene'), 'a Space meant for the card never jumps');
  });

  it('a real key press still ends the follow (AvatarController.as _endFollowing)', () => {
    press(' ');
    assert.deepEqual(client.sent.at(-1), ['follow_stop', {}]);
    assert.equal(followMpFeature.followActive(engine), null);
    assert.equal(followMpFeature.followSteer(engine, { max: WALK_MAX, now: clockNow }), null);
    client.msg({ t: 'follow_ended', id: 2, name: 'Bo', why: 'stopped' });
  });
});

describe('ticket 71: following jumps', () => {
  it('finds the take-off in the leader\'s samples, worked back from the rise', () => {
    const log = createTakeoffLog();
    assert.equal(noteLeaderSample(log, { x: 300, y: -100, dir: 1, anim: 'walk1x', t: 0 }), null);
    // 6 frames later, 'lift' shown 36 px up: the feet left about 4 frames ago.
    const p = noteLeaderSample(log, { x: 326.4, y: -136, dir: 1, anim: 'lift', t: 100 });
    assert.ok(p);
    assert.ok(Math.abs(p.x - (326.4 - 4 * 4.4)) < 3, `x ${p.x.toFixed(1)}`);
    assert.equal(p.y, -100);
    assert.equal(p.dir, 1);
    assert.equal(p.triple, false);
    assert.equal(p.air, false);
    assert.ok(Math.abs(p.speed - 4.4) < 0.01);
    assert.equal(noteLeaderSample(log, { x: 340, y: -160, dir: 1, anim: 'lift', t: 200 }), null, 'still the same jump');
    assert.equal(noteLeaderSample(log, { x: 360, y: -100, dir: 1, anim: 'land', t: 300 }), null);
    // Straight from landing into the next jump, and a triple's rise.
    const q = noteLeaderSample(log, { x: 380, y: -150, dir: 1, anim: 'lift', triple: true, t: 400 });
    assert.equal(q.triple, true);
    assert.equal(log.points.length, 2);
    // Off a ladder is not a take-off the follower can make; walking off a ledge and jumping is an air jump.
    const l2 = createTakeoffLog();
    noteLeaderSample(l2, { x: 0, y: 0, anim: 'climb', t: 0 });
    assert.equal(noteLeaderSample(l2, { x: 0, y: -20, anim: 'lift', t: 100 }), null);
    noteLeaderSample(l2, { x: 0, y: 0, anim: 'fall', t: 200 });
    assert.equal(noteLeaderSample(l2, { x: 10, y: -10, anim: 'lift', t: 300 }).air, true);
    assert.ok(leaderGrounded('walk2x') && leaderGrounded('stand') && !leaderGrounded('fall') && !leaderGrounded('climb'));
  });

  it('jumps within 12 px, on the ground, moving the same way; drops points passed or old', () => {
    const p = { x: 300, y: -100, dir: 1, speed: 4.4, triple: false, air: false, t: 0 };
    assert.ok(takeoffDue(p, { x: 290, y: -100, vx: 4.4, onGround: true }));
    assert.ok(!takeoffDue(p, { x: 300 - FOLLOW_TAKEOFF_REACH - 1, y: -100, vx: 4.4, onGround: true }), 'not yet');
    assert.ok(!takeoffDue(p, { x: 300, y: -100, vx: -4.4, onGround: true }), 'the other way');
    assert.ok(!takeoffDue(p, { x: 300, y: -100, vx: 4.4, onGround: false }), 'in the air');
    assert.ok(!takeoffDue(p, { x: 300, y: -220, vx: 4.4, onGround: true }), 'another floor');
    assert.ok(takeoffDue({ ...p, speed: 0 }, { x: 305, y: -100, vx: -1, onGround: true }), 'a standing jump takes any way in');
    const log = { points: [{ ...p }, { ...p, x: 500, t: 1000 }] };
    pruneTakeoffs(log, 320, 1000);
    assert.deepEqual(log.points.map((q) => q.x), [500], 'passed');
    pruneTakeoffs(log, 0, 1000 + FOLLOW_TAKEOFF_MAX_AGE_MS + 1);
    assert.equal(log.points.length, 0, 'old');
  });

  it('the follower jumps where the leader took off, once', () => {
    startFollowing();
    clockNow += 2000;
    engine.player.x = 150;
    engine.player.y = -100;
    engine.player.vx = WALK_MAX;
    engine.player.onGround = true;
    leader.x = 300;
    client.emit('moved', { id: 2, x: 300, y: -100, dir: 1, anim: 'walk1x' });
    clockNow += 100;
    client.emit('moved', { id: 2, x: 326.4, y: -136, dir: 1, anim: 'lift' });
    leader.x = 330;
    const jumpsAt = [];
    for (let i = 0; i < 90; i += 1) {
      const out = frame(WALK_MAX);
      if (out?.jump) jumpsAt.push({ x: engine.player.x - engine.player.vx, triple: out.triple });
    }
    assert.equal(jumpsAt.length, 1);
    assert.ok(Math.abs(jumpsAt[0].x - 309) <= FOLLOW_TAKEOFF_REACH + 3, `jumped at ${jumpsAt[0].x.toFixed(1)}`);
    assert.equal(jumpsAt[0].triple, false);
    assert.equal(engine.data.followMpJumps, '1');
  });

  it('a leader who stops just past the take-off still gets the follower there to jump', () => {
    clockNow += 2000;
    engine.player.x = 100;
    engine.player.vx = 0;
    client.emit('moved', { id: 2, x: 200, y: -100, dir: 1, anim: 'walk1x' });
    clockNow += 100;
    client.emit('moved', { id: 2, x: 226.4, y: -136, dir: 1, anim: 'lift', triple: true });
    // Landed on a ledge right past it and stood: the trailing gap alone would stop short.
    leader.x = 240;
    let jumped = null;
    for (let i = 0; i < 200 && !jumped; i += 1) {
      const out = frame(0);
      if (out?.jump) jumped = out;
    }
    assert.ok(jumped, 'jumped');
    assert.equal(jumped.triple, true, 'the leader\'s triple-jump step');
  });

  it('a take-off older than a few seconds is forgotten', () => {
    clockNow += 2000;
    engine.player.x = 100;
    client.emit('moved', { id: 2, x: 200, y: -100, dir: 1, anim: 'walk1x' });
    clockNow += 100;
    client.emit('moved', { id: 2, x: 226.4, y: -136, dir: 1, anim: 'lift' });
    clockNow += FOLLOW_TAKEOFF_MAX_AGE_MS + 100;
    leader.x = 400;
    let jumped = false;
    for (let i = 0; i < 120; i += 1) if (frame(0)?.jump) jumped = true;
    assert.equal(jumped, false);
  });

  it('takes the same triple-jump step: a triple when the leader tripled and the follower has the skill, else a plain jump', () => {
    const jump = (state, { triple, upgrades }) => {
      queueJump(state, 1000);
      matchLeaderJumpStep(state, { triple, upgrades, now: 1000 });
      return resolveQueuedJump(state, { now: 1000, grounded: true, upgrades, velocityX: 4.4, maxVelocityX: 4.4 });
    };
    assert.equal(jump(createJumpState(0), { triple: true, upgrades: ['jump_triple_1'] }).triple, true);
    assert.equal(jump(createJumpState(0), { triple: true, upgrades: [] }).triple, false, 'no skill, a plain jump');
    const open = Object.assign(createJumpState(0), { chainCount: 2, chainDeadline: 1400 });
    const plain = jump(open, { triple: false, upgrades: ['jump_triple_3'] });
    assert.equal(plain.triple, false, 'a leader\'s plain jump never becomes the follower\'s third');
    assert.equal(plain.jumpNumber, 1);
    const second = Object.assign(createJumpState(0), { chainCount: 1, chainDeadline: 1400 });
    assert.equal(jump(second, { triple: false, upgrades: ['jump_triple_3'] }).jumpNumber, 2, 'earlier steps chain as usual');
  });

  it('game.js queues the follow\'s jump with the leader\'s step, and does not count it as the player\'s own', () => {
    const input = game.slice(game.indexOf('function handleInput() {'), game.indexOf('function soloChickenPause'));
    assert.match(input, /if \(follow\?\.jump\) \{\n\s+queueJump\(jumpState, now\);\n\s+matchLeaderJumpStep\(jumpState, \{ triple: follow\.triple,/);
    assert.ok(input.indexOf('matchLeaderJumpStep(') < input.indexOf('const jumpResult = resolveQueuedJump('));
    assert.match(input, /performPlayerJump\(streetPhysicsTripleJump\(movementBuff, jumpResult\), jumpVelocity, now, \{ counted: !follow\?\.jump \}\)/);
    assert.match(game, /if \(counted\) countPlayerJump\(\);/);
  });
});
