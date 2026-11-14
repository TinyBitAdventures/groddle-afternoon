/**
 * The jump is the client's (Austin 2026-11-03: "figure out and fix the jump height").
 *
 * Glitch's jump was one launch per key press (AvatarController.as onSpaceKey 388-408 sets
 * triggerJump; AvatarPhysicsHandler.as handleAvatarControls 204-290 sets vy = vy_jump once, no
 * hold-to-rise), then the normal setting's gravity 1190, friction_air -0.22 and the vy_max 670
 * bound (updateAvatarVelocities 411-415, boundAvatarVelocities 433-442), stepped in 17 ms slices.
 * The height grew with imagination: a new player jumps at vy_jump x0.7105 (inc_physics.js
 * setDefaultPhysics 97-106), High Jumper I x0.907, II x1 (the classic jump), III x1.05
 * (inc_data_imagination.js 3240-3337). The remake used to fall at 0.42 px/frame^2 (1512 px/s^2)
 * with no air friction: a 105 px jump against the client's 143.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIR_FRICTION, GRAVITY, JUMP_SPEED, MAX_TICK_FRAMES, NORMAL_BUFF, REMAKE_ROOM_PHYSICS, TERMINAL_VY, flatJump, frameSteps, jumpApex, stepAvatar, avatarGround } from '../public/js/avatar-step.js?v=43b1182e';
import { questInstancesFeature } from '../public/js/features/quest-instances-feature.js?v=e72358b3';
import { buffPhysics } from '../public/js/buffs.js?v=c499cf1a';
import { physicsMultipliers } from '../public/js/location-events.js?v=05663361';
import { NEWXP_DEFAULT_PHYSICS, NEWXP_UPGRADES, reachFor } from '../public/js/newxp.js?v=b89001c1';
import { NO_UPGRADE_PHYSICS_STREETS, ignoresUpgradePhysics, remakeMovementMultipliers } from '../public/js/imagination.js?v=1bdfd77c';
import { rawTripleJumpMultiplier, scaledTripleJumpMultiplier, TRIPLE_JUMP_UPGRADES } from '../public/js/movement.js?v=b30f84eb';
import { reachStreet } from '../public/js/builder/reach-graph.js?v=d03eeab1';
import { plainApex, LEDGE_RISE } from '../public/js/builder/validate.js?v=903e6811';
import { SOURCE_PHYSICS } from '../public/js/puzzle-triggers.js?v=facc2c29';
import { CANOPY_PHYSICS } from '../public/js/hidden-floors.js?v=732a2610';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const GSJS = join(ROOT, '..', 'glitch-GameServerJS');
const CLIENT = join(ROOT, '..', 'glitch-client', 'com/tinyspeck/engine');

/**
 * The client's vertical loop, written from AvatarPhysicsHandler.as: the launch frame sets vy,
 * then each 17 ms slice adds friction_air and gravity, bounds vy at vy_max (twice while triple
 * jumping), moves and rounds the position (setAndBoundPositionOnSelf 479-480).
 */
function clientApex({ vyJump = -570, gravity = 1190, frictionAir = -0.22, vyMax = 670, triple = false }) {
  const dt = 0.017;
  let vy = vyJump;
  let y = 0;
  let top = 0;
  for (let i = 0; i < 5000; i += 1) {
    vy += -vy * frictionAir * dt;
    vy += gravity * dt;
    vy = vy < 0 ? Math.max(vy, -vyMax * (triple ? 2 : 1)) : Math.min(vy, vyMax);
    y = Math.round(y + vy * dt);
    top = Math.min(top, y);
    if (vy > 0 && y >= 0) break;
  }
  return -top;
}

describe('jump physics are the client numbers', () => {
  it('gravity, launch, vy_max and friction_air convert config_base.js normal to px per 60 fps frame', () => {
    assert.ok(Math.abs(GRAVITY * 3600 - 1190) < 1e-9);
    assert.ok(Math.abs(JUMP_SPEED * 60 + 570) < 1e-9);
    assert.ok(Math.abs(TERMINAL_VY * 60 - 670) < 1e-9);
    assert.equal(AIR_FRICTION, -0.22);
  });

  it('the source says so (config_base.js physics_configs.normal)', { skip: !existsSync(join(GSJS, 'config_base.js')) }, () => {
    const src = readFileSync(join(GSJS, 'config_base.js'), 'utf8');
    const normal = src.slice(src.indexOf('physics_configs'), src.indexOf('swim:'));
    const val = (k) => Number(normal.match(new RegExp(`'${k}':\\s*(-?[\\d.]+)`))[1]);
    assert.equal(val('gravity'), GRAVITY * 3600);
    assert.equal(val('vy_jump'), JUMP_SPEED * 60);
    assert.equal(val('vy_max'), Math.round(TERMINAL_VY * 60));
    assert.equal(val('friction_air'), AIR_FRICTION);
  });

  it('the client never lets a held key rise further: the launch is one vy per press', { skip: !existsSync(CLIENT) }, () => {
    const handler = readFileSync(join(CLIENT, 'physics/avatar/AvatarPhysicsHandler.as'), 'utf8');
    const controller = readFileSync(join(CLIENT, 'control/engine/AvatarController.as'), 'utf8');
    assert.match(controller, /KEY_DOWN_\+Keyboard\.SPACE, onSpaceKey/);
    assert.doesNotMatch(controller, /KEY_UP_\+Keyboard\.SPACE/);
    assert.match(handler, /apo\.vy = vy_jump;/);
    assert.match(handler, /vy \+= setting\.gravity\*secondsPassed/);
    assert.match(handler, /friction_air_impulse_y:Number = \(-apo\.vy\*setting\.friction_air\)/);
    const ts = readFileSync(join(CLIENT, 'model/TSEngineConstants.as'), 'utf8');
    assert.match(ts, /TARGET_PHYSICS_FRAMERATE:int = 60/);
  });

  it('each imagination tier peaks within 2 px of the client loop', () => {
    const tiers = [
      ['new player', NEWXP_DEFAULT_PHYSICS.vy_jump, 69],
      ['High Jumper I', NEWXP_UPGRADES.jump_1.vy_jump, 116],
      ['High Jumper II', NEWXP_UPGRADES.jump_2.vy_jump, 142],
      ['High Jumper III', 1.05, 158],
    ];
    for (const [name, mult, want] of tiers) {
      const ours = jumpApex(mult);
      assert.ok(Math.abs(ours - clientApex({ vyJump: -570 * mult })) <= 2, `${name}: ${ours.toFixed(1)} vs client ${clientApex({ vyJump: -570 * mult })}`);
      assert.equal(Math.round(ours), want, name);
    }
    // The remake's starters are the post-tutorial cards; High Jumper III is the live 1.05x.
    assert.equal(remakeMovementMultipliers(['jump_1', 'jump_2', 'jump_3', 'walk_speed_1', 'walk_speed_2']).jump, 1.05);
    assert.equal(Math.round(plainApex()), 142);
    assert.equal(LEDGE_RISE, 134);
  });

  it('the High Jumper cards carry those numbers in the source', { skip: !existsSync(join(GSJS, 'inc_data_imagination.js')) }, () => {
    const src = readFileSync(join(GSJS, 'inc_data_imagination.js'), 'utf8');
    const card = (id) => {
      const body = src.slice(src.indexOf(`function imagination_get_${id}(`));
      return Number(body.match(/"vy_jump"\s*:\s*([\d.]+)/)[1]);
    };
    assert.equal(card('jump_1'), 0.907);
    assert.equal(card('jump_2'), 1);
    assert.equal(card('jump_3'), 1.05);
    const phys = readFileSync(join(GSJS, 'players/inc_physics.js'), 'utf8');
    assert.match(phys, /vy_jump: 0\.7105/);
  });

  it('triple jumps peak as the client does, with twice vy_max while they rise', () => {
    for (const { multiplier: upgrade, label } of TRIPLE_JUMP_UPGRADES) {
      for (const [ms, speed] of [[0, 1], [0, 0], [150, 0], [300, 0]]) {
        const m = scaledTripleJumpMultiplier(rawTripleJumpMultiplier(ms, speed), upgrade);
        const ours = jumpApex(m, NORMAL_BUFF, { triple: true });
        const theirs = clientApex({ vyJump: -570 * m, triple: true });
        assert.ok(Math.abs(ours - theirs) <= Math.max(3, theirs * 0.01), `${label} ${ms} ms x${m.toFixed(3)}: ${ours.toFixed(1)} vs ${theirs}`);
      }
    }
    // Big 'Un off a running landing: 500 px.
    assert.equal(Math.round(jumpApex(1.8, NORMAL_BUFF, { triple: true })), 500);
  });

  it('spinach is vy_jump x4.5 under gravity x0.35, held to vy_max as in the client (~720 px)', () => {
    const state = { active: { high_jumper: { classTsid: 'high_jumper', appliedAt: 0, expiresAt: 7000 } } };
    const b = buffPhysics(state, 1000);
    assert.equal(b.jump, 4.5);
    assert.equal(b.gravity, 0.35);
    assert.equal(b.speed, 1.7);
    const ours = jumpApex(1, { ...NORMAL_BUFF, ...b });
    const theirs = clientApex({ vyJump: -570 * 4.5, gravity: 1190 * 0.35 });
    assert.ok(Math.abs(ours - theirs) <= 3, `${ours} vs ${theirs}`);
  });

  it('the spinach numbers are catalog_buffs.js High Jumper', { skip: !existsSync(join(GSJS, 'items/catalog_buffs.js')) }, () => {
    const src = readFileSync(join(GSJS, 'items/catalog_buffs.js'), 'utf8');
    const body = src.slice(src.indexOf('name		: "High Jumper"'));
    const m = body.match(/addBuffPhysics\(\{\s*vx_max: ([\d.]+),\s*vy_jump: ([\d.]+),\s*gravity: ([\d.]+)/);
    assert.deepEqual(m.slice(1).map(Number), [1.7, 4.5, 0.35]);
  });

  it('a street setting keeps its full vy_jump; the stepper bounds it at the street vy_max', () => {
    // Jal swim streets: gravity 362, vy_jump -713, vy_max 447 (G*.xml physics).
    const m = physicsMultipliers({ gravity: 362, vy_jump: -713, vy_max: 447, friction_air: 0.745, jetpack: 1 });
    assert.ok(Math.abs(m.jump - 713 / 570) < 1e-9);
    assert.equal(m.airFriction, 0.745);
    const buff = { ...NORMAL_BUFF, jump: m.jump, gravity: m.gravity, vyMax: m.vyMax, airDrag: m.airDrag, airFriction: m.airFriction };
    const theirs = clientApex({ vyJump: -713, gravity: 362, frictionAir: 0.745, vyMax: 447 });
    assert.ok(Math.abs(jumpApex(1, buff) - theirs) <= 2, `${jumpApex(1, buff)} vs ${theirs}`);
    // A fall stops gaining speed at vy_max.
    const body = { x: 100, y: 0, vx: 0, vy: 0, onGround: false };
    for (let i = 0; i < 200; i += 1) stepAvatar(body, { platforms: [], worldW: 400, ground: () => 1e9 });
    assert.ok(Math.abs(body.vy - TERMINAL_VY) < 1e-9);
  });

  it('puzzle and canopy zones no longer double the gravity fix', () => {
    assert.equal(SOURCE_PHYSICS.gravity, 1);
    assert.equal(CANOPY_PHYSICS.gravity, 1);
  });

  it('three locations ignore upgrade physics (no_upgrade_physics_adjustments): plain jump, no triple jump', () => {
    assert.deepEqual([...NO_UPGRADE_PHYSICS_STREETS], ['GHFFV931FRF3TMS', 'GHVECS766MC3LHP', 'GHVJQH26ERF3VMJ']);
    assert.ok(ignoresUpgradePhysics('LHFFV931FRF3TMS'));
    assert.ok(!ignoresUpgradePhysics('GTJ12O0H7AO1IBS'));
  });

  it('the rebuilt quest rooms (scenes laid out for the old 105 px jump) keep it', () => {
    assert.ok(Math.abs(jumpApex(1, { ...NORMAL_BUFF, ...REMAKE_ROOM_PHYSICS }) - 104.9) < 0.1);
    const src = readFileSync(join(PUBLIC, 'js/features/quest-instances-feature.js'), 'utf8');
    assert.match(src, /jump: \(own\?\.jump \?\? 1\) \* REMAKE_ROOM_PHYSICS\.jump/);
    assert.equal(questInstancesFeature.physics({}), null, 'no run, no change');
  });

  it('the new player tutorial reach follows the stepper', () => {
    const r = reachFor({ jump: 1, speed: 1 });
    assert.equal(r.rise, Math.floor(flatJump(1).apex - 10));
    assert.equal(r.rise, 132);
  });
});

describe('Viscid Pud: the signpost ledge to Pandhal Pegs', () => {
  const index = JSON.parse(readFileSync(join(PUBLIC, 'assets/streets/index.json'), 'utf8'));
  const row = index.streets.GTJ12O0H7AO1IBS;
  it('a plain jump from the west arrival reaches signpost_2 (it needed a 4% higher jump before)', { skip: !row }, () => {
    const street = JSON.parse(readFileSync(join(PUBLIC, row.file), 'utf8'));
    const r = reachStreet(street, [{ x: 225, y: 772, from: 'GTJ12O0H7AO1IBS-west' }]);
    const post = r.targets.find((t) => t.id === 'signpost_2');
    assert.ok(post?.reached, 'signpost_2 reached from the Peatland Moors arrival');
    // The old frame (0.42 gravity, no air friction, -9.6 launch) peaked at 105 px and missed it.
    let vy = -9.6;
    let y = 0;
    let top = 0;
    while (vy < 0) { vy += 0.42; y += vy; top = Math.min(top, y); }
    assert.ok(-top < 106 && jumpApex(1) > 140);
  });
});

describe('the game frame steps the same jump', () => {
  it('stepAvatar on a flat floor peaks at jumpApex and lands back on it', () => {
    const platforms = [{ id: 'f', x1: 0, y1: 1000, x2: 4000, y2: 1000, pcPerm: -1 }];
    const ground = (x, y, vy) => avatarGround(platforms, x, y, vy, { fallback: 1000 });
    const body = { x: 500, y: 1000, vx: 0, vy: JUMP_SPEED, onGround: false };
    let top = body.y;
    for (let i = 0; i < 120; i += 1) {
      stepAvatar(body, { platforms, worldW: 4000, ground });
      top = Math.min(top, body.y);
      if (body.onGround) break;
    }
    assert.ok(body.onGround);
    assert.ok(Math.abs(1000 - top - jumpApex(1)) < 0.5, `${1000 - top}`);
  });

  it('a triple jump rises past vy_max only while triple jumping', () => {
    const platforms = [];
    const ground = () => 1e9;
    const plain = { x: 500, y: 1000, vx: 0, vy: JUMP_SPEED * 1.8, onGround: false };
    stepAvatar(plain, { platforms, worldW: 4000, ground });
    assert.ok(Math.abs(plain.vy + TERMINAL_VY) < 1e-9, 'held to vy_max');
    const triple = { x: 500, y: 1000, vx: 0, vy: JUMP_SPEED * 1.8, onGround: false, tripleJumping: true };
    stepAvatar(triple, { platforms, worldW: 4000, ground });
    assert.ok(triple.vy < -TERMINAL_VY);
  });
});

describe('air time at any frame rate (sub-steps, 2026-11-04)', () => {
  const platforms = [{ id: 'f', x1: 0, y1: 1000, x2: 4000, y2: 1000, pcPerm: -1 }];
  const ground = (x, y, vy) => avatarGround(platforms, x, y, vy, { fallback: 1000 });
  /** One plain jump at `fps`, ticked as game.js ticks: `stepsOf(frames)` per tick. Seconds in the air and apex px. */
  function jumpAt(fps, stepsOf, mult = 1) {
    const frames = 60 / fps;
    const body = { x: 500, y: 1000, vx: 0, vy: 0, onGround: true };
    let ticks = 0;
    let top = 1000;
    let launched = false;
    while (ticks < 2000) {
      ticks += 1;
      for (const step of stepsOf(frames)) {
        if (!launched) {
          // handleInput's launch, on the tick's first step.
          body.vy = JUMP_SPEED * mult;
          body.onGround = false;
          launched = true;
        }
        stepAvatar(body, { dt: step, platforms, worldW: 4000, ground });
        top = Math.min(top, body.y);
      }
      if (body.onGround) break;
    }
    return { seconds: ticks / fps, apex: 1000 - top };
  }

  it('splits a tick into steps of at most one frame, at most MAX_TICK_FRAMES in all', () => {
    assert.deepEqual(frameSteps(1), [1]);
    assert.deepEqual(frameSteps(0.5), [0.5]);
    assert.deepEqual(frameSteps(4), [1, 1, 1, 1]);
    assert.deepEqual(frameSteps(2.5).map((x) => +x.toFixed(4)), [0.8333, 0.8333, 0.8333]);
    assert.equal(MAX_TICK_FRAMES, 6);
    assert.equal(frameSteps(600).reduce((a, b) => a + b, 0), 6, 'a long stall is dropped, not replayed');
    assert.equal(frameSteps(600).length, 6);
    assert.deepEqual(frameSteps(0), []);
    assert.deepEqual(frameSteps(NaN), []);
  });

  it('a plain jump is in the air about 0.98 s and peaks at 142 px at 15, 20, 24, 30, 60 and 120 fps', () => {
    for (const fps of [15, 20, 24, 30, 60, 120]) {
      const { seconds, apex } = jumpAt(fps, (f) => frameSteps(f));
      // One rendered frame of slack either way: landing is seen on the first frame back on the floor.
      assert.ok(Math.abs(seconds - 0.983) <= 1 / fps + 0.01, `${fps} fps: ${seconds.toFixed(3)} s`);
      assert.ok(Math.abs(apex - jumpApex(1)) < 3, `${fps} fps: apex ${apex.toFixed(1)}`);
    }
  });

  it('a new player\'s jump keeps its 0.70 s too', () => {
    for (const fps of [15, 30, 60]) {
      const { seconds } = jumpAt(fps, (f) => frameSteps(f), 0.7105);
      assert.ok(Math.abs(seconds - 0.70) <= 1 / fps + 0.01, `${fps} fps: ${seconds.toFixed(3)} s`);
    }
  });

  it('the old single step capped at 2.5 frames ran slow under 24 fps', () => {
    const old = (fps) => jumpAt(fps, (f) => [Math.min(f, 2.5)]).seconds;
    assert.ok(old(20) > 1.15, `20 fps: ${old(20)}`);
    assert.ok(old(15) > 1.5, `15 fps: ${old(15)}`);
    assert.ok(Math.abs(old(30) - 0.983) < 0.05);
  });

  it('game.js runs the input and movement in those steps', () => {
    const src = readFileSync(join(PUBLIC, 'game.js'), 'utf8');
    assert.match(src, /const dt = Math\.min\(ticker\.deltaTime, MAX_TICK_FRAMES\);/);
    assert.match(src, /for \(const step of frameSteps\(dt\)\) \{\n\s*handleInput\(\);\n\s*physics\(step\);\n\s*\}/);
    assert.doesNotMatch(src, /Math\.min\(ticker\.deltaTime, 2\.5\)/);
  });
});
