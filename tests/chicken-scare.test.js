/**
 * A Chicken scared by a bump (js/chicken-scare.js, features/chicken-scare-feature.js): the
 * trigger, the roll, the states that stop it, the flight, and the wiring. The numbers are read
 * against Tiny Speck's npc_chicken.js when it is beside the repo.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHICKEN_HOP,
  CHICKEN_SCARE,
  CHICKEN_SCARE_SHEETS,
  CHICKEN_TOUCH,
  bumpChicken,
  chickenTouches,
  enterCollision,
  hopLift,
  kickChicken,
  landedRange,
  scareChance,
  stepFlight,
} from '../public/js/chicken-scare.js?v=1df29bf0';
import { FLYING_HIDDEN_VERBS, chickenScareFeature } from '../public/js/features/chicken-scare-feature.js?v=5f65e878';
import { bubbleMs } from '../public/js/read-time.js?v=be140198';
import { imageSize } from '../tools/image-size.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, 'public', rel), 'utf8');
const GSJS = join(root, '..', 'glitch-GameServerJS');
const BIRD_SCALE = 0.702; // game.js ENTITY_SCALE.chicken

describe('the source says what the rules say', { skip: existsSync(join(GSJS, 'items/npc_chicken.js')) ? false : 'clone tinyspeck/glitch-GameServerJS beside the repo' }, () => {
  const src = existsSync(join(GSJS, 'items/npc_chicken.js')) ? readFileSync(join(GSJS, 'items/npc_chicken.js'), 'utf8') : '';
  const fn = (name) => src.slice(src.indexOf(`function ${name}(`), src.indexOf('\n}\n', src.indexOf(`function ${name}(`)));

  it('onPlayerCollision: the order, the chance, the line and its one second', () => {
    const body = fn('onPlayerCollision');
    const at = (text) => {
      const i = body.indexOf(text);
      assert.ok(i >= 0, `onPlayerCollision has: ${text}`);
      return i;
    };
    const order = [
      at('if (this.isRooked()) {'),
      at('if (this.incubating){'),
      at('pc.conversations_offer(this, conversations[i])'),
      at('var chance = 0.75;'),
      at("if (pc.skills_has('animalkinship_1')){"),
      at('chance = 0.25;'),
      at('if (is_chance(chance)){'),
      at('this.fly();'),
      at("this.sendBubble('Squawk!', 1*1000);"),
      at("pc.achievements_increment('chickens', 'scared');"),
    ];
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.equal(CHICKEN_SCARE.chance, 0.75);
    assert.equal(CHICKEN_SCARE.chanceSkilled, 0.25);
    assert.equal(CHICKEN_SCARE.calmSkill, 'animalkinship_1');
    assert.equal(CHICKEN_SCARE.line, 'Squawk!');
    assert.equal(CHICKEN_SCARE.lineMs, 1000);
    assert.equal(CHICKEN_SCARE.counter, 'chickens:scared');
    // No timer, cooldown or per-player memory in the handler.
    assert.doesNotMatch(body, /apiSetTimer|time\(\)|last_/);
  });

  it('fly: who stays put, the kick, and the two timers', () => {
    const body = fn('fly');
    assert.match(body, /if \(this\.isRooked\(\)\) return;\s+if \(this\.isSad\(\)\) return;\s+if \(this\.isWaiting\) return;/);
    assert.match(body, /var vx = randInt\(-100, 100\);/);
    assert.match(body, /var vy = -200;/);
    assert.match(body, /if \(this\.move_limits\) \{\s+vx = vx \/ 2;\s+vy = vy \/ 3;/);
    assert.match(body, /this\.apiKickTheChicken\(vx, vy\);/);
    assert.match(body, /this\.apiSetTimer\('onInTheAir', 2000\);/);
    assert.match(fn('onInTheAir'), /this\.state = 'flying_no_feathers';/);
    assert.match(fn('onPlatformLanding'), /this\.state = 'land';[\s\S]*this\.apiSetTimer\('startMoving', 1 \* 1000\);/);
    assert.deepEqual(
      [CHICKEN_SCARE.kickVxMin, CHICKEN_SCARE.kickVxMax, CHICKEN_SCARE.kickVy, CHICKEN_SCARE.limitedVx, CHICKEN_SCARE.limitedVy, CHICKEN_SCARE.noFeathersMs, CHICKEN_SCARE.landedResumeMs],
      [-100, 100, -200, 2, 3, 2000, 1000],
    );
  });

  it('the boxes: the art bounds and the player box, and no hit box set in the file', () => {
    assert.match(src, /'position': \{"x":-29,"y":-64,"w":53,"h":67\}/);
    assert.doesNotMatch(src, /apiSetHitBox/);
    const player = readFileSync(join(GSJS, 'players/player.js'), 'utf8');
    assert.match(player, /this\.h = 112;\s+this\.w = 59;/);
    assert.deepEqual({ ...CHICKEN_TOUCH }, { birdW: 53, birdH: 67, playerW: 59, playerH: 112 });
  });

  it('a collision is the way in, leaving is its own call; the bubble goes to the whole street', () => {
    const cteb = readFileSync(join(GSJS, 'items/cteb.js'), 'utf8');
    assert.match(cteb, /function onPlayerCollision\(pc\)\{[^}]*this\.onEvent\('onEnter', pc\);/);
    assert.match(cteb, /function onPlayerLeavingCollisionArea\(pc\)\{[^}]*this\.onEvent\('onExit', pc\);/);
    const item = readFileSync(join(GSJS, 'items/item.js'), 'utf8');
    assert.match(item, /if \(pc\)\{\s+pc\.apiSendMsg\(rsp\);\s+\}\s+else\{\s+location\.apiSendMsg\(rsp\);/);
  });
});

describe('the trigger', () => {
  const reach = (CHICKEN_TOUCH.birdW * BIRD_SCALE + CHICKEN_TOUCH.playerW) / 2; // 48.1
  const hen = { x: 1000, y: 500 };
  const touch = (x, y) => chickenTouches(hen, { x, y }, { birdScale: BIRD_SCALE });

  it('is the two boxes overlapping: the bird as drawn, the player 59 x 112 over the feet', () => {
    assert.ok(Math.abs(reach - 48.1) < 0.05);
    assert.equal(touch(1000 - reach + 0.5, 500), true);
    assert.equal(touch(1000 + reach - 0.5, 500), true);
    assert.equal(touch(1000 - reach - 0.5, 500), false);
    assert.equal(touch(1000 + reach + 0.5, 500), false);
  });

  it('a jump clears it, and a floor above or below is no touch', () => {
    const top = CHICKEN_TOUCH.birdH * BIRD_SCALE; // 47 px
    assert.equal(touch(1000, 500 - top + 1), true);
    assert.equal(touch(1000, 500 - top - 1), false, 'feet over the bird');
    assert.equal(touch(1000, 500 + CHICKEN_TOUCH.playerH - 1), true);
    assert.equal(touch(1000, 500 + CHICKEN_TOUCH.playerH + 1), false, 'the player a floor under it');
  });

  it('shrinks with the avatar (a street with a small pc_scale) and grows with the bird', () => {
    assert.equal(chickenTouches(hen, { x: 1040, y: 500 }, { birdScale: BIRD_SCALE }), true);
    assert.equal(chickenTouches(hen, { x: 1040, y: 500 }, { birdScale: BIRD_SCALE, scale: 0.41 }), false);
    assert.equal(chickenTouches(hen, { x: 1055, y: 500 }, { birdScale: 1 }), true);
    assert.equal(chickenTouches(null, { x: 0, y: 0 }), false);
    assert.equal(chickenTouches({ x: NaN, y: 0 }, { x: 0, y: 0 }), false);
  });

  it('fires on the way in only, and again after stepping clear: no cooldown', () => {
    const book = new Map();
    const hits = [true, true, true, false, false, true, true, false, true].map((t) => enterCollision(book, 'hen', t));
    assert.deepEqual(hits, [true, false, false, false, false, true, false, false, true]);
    // Each Chicken on its own.
    assert.equal(enterCollision(book, 'other', true), true);
    assert.equal(enterCollision(book, 'hen', true), false);
  });
});

describe('the roll and the states that stop it', () => {
  it('three in four, one in four with Animal Kinship I', () => {
    assert.equal(scareChance([]), 0.75);
    assert.equal(scareChance(['animalkinship_1']), 0.25);
    assert.equal(scareChance(['animalkinship_2']), 0.75, 'only the first rank is asked (skills_has)');
    assert.deepEqual(bumpChicken({}, () => 0.7499), { squawk: true, fly: true, why: 'scared' });
    assert.deepEqual(bumpChicken({}, () => 0.75), { squawk: false, fly: false, why: 'calm' });
    assert.equal(bumpChicken({ learned: ['animalkinship_1'] }, () => 0.2499).why, 'scared');
    assert.equal(bumpChicken({ learned: ['animalkinship_1'] }, () => 0.25).why, 'calm');
  });

  it('rooked, incubating or offering a conversation: no Squawk, and no roll', () => {
    for (const key of ['rooked', 'incubating', 'offered']) {
      let rolled = 0;
      const res = bumpChicken({ [key]: true }, () => { rolled += 1; return 0; });
      assert.deepEqual(res, { squawk: false, fly: false, why: key });
      assert.equal(rolled, 0, key);
    }
    // In the source's order.
    assert.equal(bumpChicken({ rooked: true, incubating: true, offered: true }, () => 0).why, 'rooked');
    assert.equal(bumpChicken({ incubating: true, offered: true }, () => 0).why, 'incubating');
  });

  it('a sad Chicken and one a player is at squawk and stay put', () => {
    assert.deepEqual(bumpChicken({ sad: true }, () => 0), { squawk: true, fly: false, why: 'sad' });
    assert.deepEqual(bumpChicken({ waiting: true }, () => 0), { squawk: true, fly: false, why: 'waiting' });
    assert.deepEqual(bumpChicken({ sad: true }, () => 0.9), { squawk: false, fly: false, why: 'calm' });
  });

  it('the line is shown for its one second exactly, where a line with no source time would stay 4.3 s', () => {
    assert.equal(bubbleMs(CHICKEN_SCARE.line, CHICKEN_SCARE.lineMs, true), 1000);
    assert.ok(bubbleMs(CHICKEN_SCARE.line, CHICKEN_SCARE.lineMs, false) > 4000);
  });
});

describe('the flight', () => {
  const flat = { landY: () => 500, minX: 20, maxX: 5980 };
  const run = (flight, world, dtMs = 1000 / 60, most = 20000) => {
    const log = [];
    let peak = flight.y;
    for (let t = 0; t < most && flight.phase !== 'done'; t += dtMs) {
      for (const ev of stepFlight(flight, dtMs, world)) log.push([ev, Math.round(t + dtMs)]);
      peak = Math.min(peak, flight.y);
    }
    return { log, peak };
  };

  it('the kick: up at 200 px/s, up to 100 px/s either way, facing where it goes', () => {
    const left = kickChicken({ x: 10, y: 20 }, () => 0);
    assert.deepEqual([left.vx, left.vy, left.dir, left.x, left.y, left.phase, left.clip], [-100, -200, 'left', 10, 20, 'air', 'flying']);
    const right = kickChicken({}, () => 0.999999);
    assert.deepEqual([right.vx, right.dir], [100, 'right']);
    assert.equal(kickChicken({}, () => 0.5).dir, 'right', 'vx 0 faces right (vx < 0 is left)');
    const bound = kickChicken({ limited: true }, () => 0);
    assert.deepEqual([bound.vx, Math.round(bound.vy * 1000) / 1000], [-50, -66.667]);
  });

  it('on a flat floor: 200 px up at 2 s, feathers gone then, down at 4 s, walking on a second later', () => {
    const f = kickChicken({ x: 1000, y: 500 }, () => 0.999999);
    const { log, peak } = run(f, flat);
    const when = Object.fromEntries(log);
    assert.ok(Math.abs(500 - peak - 200) < 3, `peak ${500 - peak}`);
    assert.ok(Math.abs(when.no_feathers - 2000) <= 17, `no feathers at ${when.no_feathers}`);
    assert.ok(Math.abs(when.landed - 4000) <= 50, `landed at ${when.landed}`);
    assert.ok(Math.abs(when.done - when.landed - 1000) <= 17, `walks on ${when.done - when.landed} ms after landing`);
    assert.deepEqual(log.map((e) => e[0]), ['no_feathers', 'landed', 'done']);
    assert.equal(f.y, 500);
    assert.ok(Math.abs(f.x - 1400) < 6, `drifted to ${f.x}`);
    assert.equal(f.clip, 'land');
    assert.deepEqual(stepFlight(f, 16, flat), [], 'over');
  });

  it('lands on a ledge it comes down onto, and never on one while still rising', () => {
    // A ledge 150 px up, right of x 1100; the floor at 500 everywhere.
    const world = { landY: (x, y) => (x >= 1100 && y <= 350 + 4 ? 350 : 500), minX: 20, maxX: 5980 };
    const f = kickChicken({ x: 1000, y: 500 }, () => 0.999999);
    const { log } = run(f, world);
    assert.equal(f.y, 350);
    const landed = log.find((e) => e[0] === 'landed')[1];
    assert.ok(landed > 2000 && landed < 4000, `landed at ${landed}`);
    assert.ok(!log.some((e) => e[0] === 'landed' && e[1] < 2000));
  });

  it('a short hop off a ledge keeps its feathers; a slow frame cannot carry it through a floor', () => {
    const bound = kickChicken({ x: 1000, y: 500, limited: true }, () => 0.5);
    const a = run(bound, flat);
    assert.ok(!a.log.some((e) => e[0] === 'no_feathers'));
    assert.ok(Math.abs(500 - a.peak - 22.2) < 1.5, `bound peak ${500 - a.peak}`);
    const slow = kickChicken({ x: 1000, y: 500 }, () => 0.5);
    run(slow, flat, 700);
    assert.equal(slow.y, 500);
  });

  it('stops at the street ends', () => {
    const f = kickChicken({ x: 60, y: 500 }, () => 0);
    run(f, flat);
    assert.equal(f.x, 20);
    const g = kickChicken({ x: 5950, y: 500 }, () => 0.999999);
    run(g, flat);
    assert.equal(g.x, 5980);
  });

  it('a landed Chicken walks only as far as its floor goes', () => {
    const floor = (lo, hi) => (x) => (x >= lo && x <= hi ? 500 : null);
    assert.equal(landedRange(1000, 500, floor(0, 2000), 100), 100);
    assert.equal(landedRange(1000, 500, floor(960, 2000), 100), 40);
    assert.equal(landedRange(1000, 500, floor(995, 1005), 100), 0);
  });

  it('the online hop: 60 px at its top, over in 0.8 s', () => {
    assert.deepEqual({ ...CHICKEN_HOP }, { ms: 800, px: 60 });
    assert.equal(hopLift(0), 0);
    assert.ok(Math.abs(hopLift(400) - 60) < 1e-9);
    assert.equal(hopLift(800), 0);
    assert.equal(hopLift(-5), 0);
  });
});

describe('the flight sheets', () => {
  it('are the three clips, every cell inside its picture, each with its 3x twin', () => {
    assert.deepEqual(Object.keys(CHICKEN_SCARE_SHEETS), ['flying', 'flying_no_feathers', 'land']);
    const hires = read('js/sprite-hires.js');
    for (const def of Object.values(CHICKEN_SCARE_SHEETS)) {
      const file = join(root, 'public', def.path);
      assert.ok(existsSync(file), def.path);
      const { w, h } = imageSize(file);
      assert.equal(w, def.cols * def.fw, def.path);
      assert.equal(h, Math.ceil(def.frames / def.cols) * def.fh, def.path);
      const twin = def.path.replace('.webp', '@3x.webp');
      assert.ok(existsSync(join(root, 'public', twin)), twin);
      assert.ok(hires.includes(`"${def.path}", "${twin}"`), `${def.path} in js/sprite-hires.js`);
    }
  });
});

describe('the feature', () => {
  /** A street with one flat floor and Chickens on it; the player walks by setting x. */
  function world({ learned = [], roll = '0', shared = false, rooked = false, offer = false, acting = false, stick = false } = {}) {
    const said = [];
    const counted = [];
    const hen = (x, extra = {}) => {
      const sprite = { x, y: 502, baseScale: BIRD_SCALE, scale: { x: BIRD_SCALE, y: BIRD_SCALE }, pivot: { y: 0 }, baseX: x, range: 100, vx: 0.5, walkPose() {} };
      if (shared) sprite._path = () => true;
      return { classId: 'npc_chicken', label: 'Chicken', classIndex: 0, state: {}, sprite, ...extra };
    };
    const engine = {
      started: true,
      player: { x: 0, y: 500 },
      interactables: [hen(1000)],
      platforms: [{ x1: 0, y1: 500, x2: 6000, y2: 500 }],
      worldW: 6000,
      learnedSkills: learned,
      param: (name) => (name === 'chickenscareroll' ? roll : null),
      say: (target, text, ms, extra) => said.push({ target, text, ms, extra }),
      achievement: (counter) => counted.push(counter),
      actingOn: () => acting,
      setData() {},
      query(hook) {
        if (hook === 'targetRooked') return rooked || null;
        if (hook === 'tellerCollision') return offer ? true : null;
        if (hook === 'chickenStickBound') return stick ? true : null;
        return null;
      },
    };
    chickenScareFeature.onStreetClear();
    const tick = (ms = 1000 / 60) => chickenScareFeature.onTick(ms, 0, engine);
    const walk = (from, to, step = 4) => {
      for (let x = from; from < to ? x <= to : x >= to; x += from < to ? step : -step) {
        engine.player.x = x;
        tick();
      }
    };
    return { engine, said, counted, tick, walk, hen };
  }

  it('walking into a Chicken: one Squawk for one second, exact, the counter, and it is off', () => {
    const w = world();
    w.tick();
    w.walk(900, 940);
    assert.equal(w.said.length, 0, 'not yet touching at 60 px');
    w.walk(944, 960);
    assert.equal(w.said.length, 1);
    const [line] = w.said;
    assert.deepEqual([line.text, line.ms, line.extra], ['Squawk!', 1000, { exact: true }]);
    assert.equal(line.target, w.engine.interactables[0]);
    assert.deepEqual(w.counted, ['chickens:scared']);
    const spr = w.engine.interactables[0].sprite;
    assert.equal(spr._scareFlight, true);
    assert.equal(chickenScareFeature.debug().flights, 1);
    // Up it goes, and down again; then it is game.js's to walk once more.
    for (let i = 0; i < 60; i += 1) w.tick();
    assert.ok(spr.y < 502 - 150, `1 s up: y ${spr.y}`);
    for (let i = 0; i < 60 * 5; i += 1) w.tick();
    assert.equal(spr._scareFlight, undefined);
    assert.equal(spr.y, 502);
    assert.equal(spr.baseX, spr.x);
    assert.equal(spr.range, 100);
    assert.equal(chickenScareFeature.debug().flights, 0);
  });

  it('standing still next to one does nothing, however long; a Chicken walking into you waits for your step', () => {
    const w = world();
    const spr = w.engine.interactables[0].sprite;
    w.engine.player.x = 700;
    w.tick();
    spr.x = 705; // it walked over
    for (let i = 0; i < 600; i += 1) w.tick();
    assert.equal(w.said.length, 0);
    w.engine.player.x = 701;
    w.tick();
    assert.equal(w.said.length, 1);
  });

  it('no cooldown: every time you come back into it, it rolls again', () => {
    const w = world({ roll: '0', acting: true }); // a player at it: it squawks and stays put
    w.tick();
    for (let pass = 0; pass < 4; pass += 1) {
      w.walk(900, 1100);
      w.walk(1100, 900);
    }
    assert.equal(w.said.length, 8);
    assert.equal(chickenScareFeature.debug().flights, 0);
  });

  it('a calm roll says nothing; Animal Kinship I calms most of them', () => {
    const calm = world({ roll: '0.8' });
    calm.tick();
    calm.walk(900, 1100);
    assert.equal(calm.said.length, 0);
    assert.equal(calm.counted.length, 0);
    const skilled = world({ roll: '0.5', learned: ['animalkinship_1'] });
    skilled.tick();
    skilled.walk(900, 1100);
    assert.equal(skilled.said.length, 0);
    const unskilled = world({ roll: '0.5' });
    unskilled.tick();
    unskilled.walk(900, 1100);
    assert.equal(unskilled.said.length, 1);
  });

  it('rooked, incubating, or with a conversation to offer: nothing', () => {
    const rooked = world({ rooked: true });
    rooked.tick();
    rooked.walk(900, 1100);
    assert.equal(rooked.said.length, 0);
    const sitting = world();
    sitting.engine.interactables[0].state.incubatingEgg = 'chicken_egg';
    sitting.tick();
    sitting.walk(900, 1100);
    assert.equal(sitting.said.length, 0);
    const telling = world({ offer: true });
    telling.tick();
    telling.walk(900, 1100);
    assert.equal(telling.said.length, 0);
  });

  it('a sad Chicken, and one a player is at, squawk and stay where they are', () => {
    const sad = world();
    sad.engine.interactables[0].state.crowdSadUntil = Date.now() + 60000; // js/animal-crowding.js isCrowdSad
    sad.tick();
    sad.walk(900, 1100);
    assert.equal(sad.said.length, 1);
    assert.deepEqual(sad.counted, ['chickens:scared']);
    assert.equal(sad.engine.interactables[0].sprite._scareFlight, undefined);
    const at = world({ acting: true });
    at.tick();
    at.walk(900, 1100);
    assert.equal(at.said.length, 1);
    assert.equal(at.engine.interactables[0].sprite._scareFlight, undefined);
  });

  it('online, on the shared path, it hops where it is and keeps its place', () => {
    const w = world({ shared: true });
    const spr = w.engine.interactables[0].sprite;
    w.tick();
    w.walk(900, 960);
    assert.equal(w.said.length, 1);
    assert.equal(spr._scareFlight, undefined);
    assert.equal(chickenScareFeature.debug().hops, 1);
    assert.deepEqual([spr.x, spr.y], [1000, 502]);
  });

  it('two Chickens are two bumps; jumping over one is none', () => {
    const w = world();
    w.engine.interactables.push(w.hen(1300, { classIndex: 1 }));
    w.tick();
    w.walk(900, 1400);
    assert.equal(w.said.length, 2);
    const over = world();
    over.tick();
    over.engine.player.y = 500 - 60;
    over.walk(900, 1100);
    assert.equal(over.said.length, 0);
  });

  it('a Chicken in the air is not squeezed or talked to', () => {
    const w = world();
    const target = w.engine.interactables[0];
    const verbs = [{ id: 'squeeze' }, { id: 'butter_up' }, { id: 'talk_to' }, { id: 'name' }];
    assert.equal(chickenScareFeature.decorateVerbs(target, verbs), null);
    w.tick();
    w.walk(900, 960);
    assert.deepEqual(chickenScareFeature.decorateVerbs(target, verbs).map((v) => v.id), ['butter_up', 'name']);
    assert.deepEqual([...FLYING_HIDDEN_VERBS], ['squeeze', 'talk_to']);
  });
});

describe('the wiring', () => {
  it('game.js leaves a flying Chicken to its flight, before anything else in its walk', () => {
    const game = read('game.js');
    const loop = game.slice(game.indexOf('for (const c of chickens) {'));
    assert.match(loop.slice(0, 400), /if \(c\._scareFlight\) continue;/);
    assert.ok(loop.indexOf('c._scareFlight') < loop.indexOf('menuTarget?.sprite === c'));
  });

  it('a Chicken of yours yields to the flight, and a Magic Chicken Stick makes the kick smaller', () => {
    const husbandry = read('js/features/animal-husbandry-feature.js');
    assert.match(husbandry, /if \(spr\._moodHold \|\| spr\._scareFlight\) \{/);
    assert.match(husbandry, /chickenStickBound\(target, engine\) \{/);
  });

  it('the conversation offer and the scare are one collision, the offer first', () => {
    const convo = read('js/features/conversations-feature.js');
    assert.match(convo, /function ownCollision\(target\) \{\s+return isIcon\(target\) \|\| target\?\.classId === 'npc_chicken';/);
    assert.match(convo, /if \(ownCollision\(target\)\) continue;/);
    assert.match(convo, /if \(!ownCollision\(target\) \|\| !engine\?\.player \|\| active\) return null;/);
    const feature = read('js/features/chicken-scare-feature.js');
    assert.ok(feature.indexOf("engine.query?.('tellerCollision', target, engine)") < feature.indexOf('if (enterCollision(inside, target, touching)) bump(engine, target);'));
  });

  it('is registered, above the pinned last features', () => {
    assert.match(read('js/features/index.js'), /FEATURES\.push\(chickenScareFeature\);\nimport \{ gameTeleporterFeature \}/);
  });
});
