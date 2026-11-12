// A Piggy rooked on its way to food stands still, and walks again (never in place) once revived.
// Sources: include/rook.js fullStop 53-63 on rooking, npc_animal onContainerItemAdded 1394/1419
// (no food while rooked), npc_piggy.js onRevived 1090-1095 (startMoving).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAnimalState } from '../public/js/animals.js?v=7e27e9d2';
import { animalMoodFeature } from '../public/js/features/animal-mood-feature.js?v=c178cc24';
import { rookAttackFeature } from '../public/js/features/rook-attack-feature.js?v=ff660cea';

const TSID = 'GLI2HVHUM4F16B0'; // Pasha's Place, Groddle Forest: where Austin met it

function setup() {
  const slots = {};
  const walk = [{ walk: true }];
  const sprite = { x: 4400, y: 876, vx: 0.45, baseX: 4400, range: 90, scale: { x: 1 }, visible: true, destroyed: false, textures: walk, loop: true, animationSpeed: 0.14, gotoAndPlay() {} };
  const pig = { classId: 'npc_piggy', animalKey: `${TSID}:npc_piggy:0`, classIndex: 0, state: createAnimalState('npc_piggy', { hunger: 5, mood: 1, hungerAt: Date.now() + 3_600_000 }), sprite };
  const tree = { classId: 'trant_bubble', state: { fruitCount: 3 }, sprite: { x: 3900, y: 876, visible: true, destroyed: false, scale: { x: 1 } } };
  const engine = {
    started: true,
    mode: 'solo',
    street: { tsid: TSID, hubId: '56', hubName: 'Groddle Forest' },
    streetTsid: TSID,
    interactables: [pig, tree],
    droppedItems: { streets: {} },
    textures: { piggyWalk: { frames: walk } },
    platforms: [],
    player: { x: 3000, y: 876 },
    pc: {},
    inv: {},
    camera: { x: 0, y: 0, w: 1280 },
    inScene: () => false,
    transientInstance: () => false,
    homeContext: () => ({ inHome: false }),
    busy: () => true,
    acting: () => false,
    // pigroot=off: these walks are timed without the rooting pauses (tests/piggies-walk-on.test.js has those).
    param: (k) => (k === 'pigroot' ? 'off' : null),
    setData: () => {},
    say: () => {},
    save: () => {},
    streetSlot: (id) => (slots[id] ||= {}),
  };
  return { engine, pig, tree, slots };
}

describe('a rooked Piggy (Pasha\'s Place walk in place)', () => {
  it('stops on its way to food, stays put while rooked and walks again once revived', () => {
    const { engine, pig, tree, slots } = setup();
    animalMoodFeature.onStreetClear();
    rookAttackFeature.onStreetClear(engine);
    let t = 10_000;
    const tick = (ms = 500) => {
      t += ms;
      rookAttackFeature.onTick(ms, t, engine);
      animalMoodFeature.onTick(ms, t, engine);
      pig.sprite.x += pig.sprite.vx * (ms / 16); // game.js patrol
    };
    tick();
    // The server's tick sends it to a tree it ate from (objects_pigs.go obj_ev ate).
    const start = pig.sprite.x;
    animalMoodFeature.sharedAnimalEvent(pig, { ev: 'ate', on: tree }, engine);
    tick();
    assert.ok(pig.sprite.x < start - 10, 'it walks towards the tree');
    // A wing beat rooks it on the way.
    slots['rook-attack'].rooked = { 'npc_piggy:0': { classId: 'npc_piggy', doses: 0, at: Date.now() } };
    tick();
    tick();
    const x = pig.sprite.x;
    for (let i = 0; i < 20; i += 1) tick();
    assert.equal(pig.sprite.x, x, 'a rooked Piggy stays where it was rooked');
    assert.equal(pig.sprite.vx, 0);
    assert.equal(tree.state.fruitCount, 3, 'and eats nothing');
    // Another tick of the server while it is rooked: it still stays.
    animalMoodFeature.sharedAnimalEvent(pig, { ev: 'ate', on: tree }, engine);
    for (let i = 0; i < 4; i += 1) tick();
    assert.equal(pig.sprite.x, x);
    // Whatever relabels it (here the server's tick event), it still reads as rooked.
    animalMoodFeature.sharedAnimalEvent(pig, { ev: 'happy' }, engine);
    assert.notEqual(pig.subtitle, 'Rooked! It needs reviving', 'the event relabels it');
    tick();
    assert.equal(pig.subtitle, 'Rooked! It needs reviving');
    // Revived: it walks again at a real pace, inside its patrol range.
    slots['rook-attack'].rooked = {};
    tick();
    tick();
    assert.ok(Math.abs(pig.sprite.vx) >= 0.4, `walks at a real pace, not ${pig.sprite.vx}`);
    assert.ok(pig.sprite.range >= 42, `patrols a real range, not ${pig.sprite.range}`);
    const before = pig.sprite.x;
    tick();
    assert.ok(Math.abs(pig.sprite.x - before) > 5, 'it moves');
    animalMoodFeature.onStreetClear();
    rookAttackFeature.onStreetClear(engine);
  });
});

describe('a Piggy that reached its food', () => {
  it('stands still while it eats (no walk in place), then walks on', () => {
    // The feature times the pause by Date.now: a held clock keeps this test off the machine's load.
    const realNow = Date.now;
    let clock = realNow();
    Date.now = () => clock;
    try {
    const { engine, pig, tree } = setup();
    let playing = true;
    Object.defineProperty(pig.sprite, 'playing', { get: () => playing });
    pig.sprite.gotoAndStop = () => { playing = false; };
    pig.sprite.play = () => { playing = true; };
    pig.sprite.gotoAndPlay = () => { playing = true; };
    animalMoodFeature.onStreetClear();
    let t = 10_000;
    const tick = (ms = 500) => {
      t += ms;
      clock += ms;
      animalMoodFeature.onTick(ms, t, engine);
      pig.sprite.x += pig.sprite.vx * (ms / 16);
    };
    tick();
    pig.sprite.x = tree.sprite.x + 140; // close by, so it gets there at once
    animalMoodFeature.sharedAnimalEvent(pig, { ev: 'ate', on: tree }, engine);
    for (let i = 0; i < 4; i += 1) tick();
    // Lane PIGSTUCK: beside the tree's foot (TREE_FOOTPRINT / 2 + half its body), not in its trunk.
    assert.ok(Math.abs(pig.sprite.x - (tree.sprite.x + 120)) < 7, `it reached the tree: ${pig.sprite.x}`);
    // The chew clip plays first when its frames have loaded (they load in the background, so a
    // loaded machine may not have them yet): end it as Pixi would, back to the walk frames.
    pig.sprite.onComplete?.();
    tick(16);
    assert.equal(playing, false, 'eating, it stands on a still frame (onFoodPathing 1485-1513: chew, then idle)');
    clock += 3100;
    tick();
    assert.equal(playing, true, 'it walks on after the pause');
    // Home to its own walk (lane PIGSTUCK: it does not live at the tree), then its patrol.
    const x = pig.sprite.x;
    tick();
    assert.ok(pig.sprite.x > x, 'it walks home');
    for (let i = 0; i < 40; i += 1) tick();
    assert.equal(pig.sprite.baseX, 4400);
    assert.ok(Math.abs(pig.sprite.vx) >= 0.4);
    animalMoodFeature.onStreetClear();
    } finally {
      Date.now = realNow;
    }
  });
});

// Austin 2026-11-04: "when reviving animals, they seem to spawn randomly. Can we have them spawn
// where they're currently stuck at?" In the source a rooked animal is one item that stays where the
// Rook struck it (include/rook.js rookAttack 53-63 fullStop; npc_butterfly.js onRooked 1395-1404
// drops it to the platform line under it) and onRevived sets it off from there (unRook 82-92;
// npc_butterfly.js 1390-1393 flyAround, npc_chicken.js 1393-1395 startMoving).
describe('a rooked animal lies where the Rook struck it and is revived there', () => {
  const FLOOR = { x1: 0, y1: 1000, x2: 6000, y2: 1000 };
  const LEDGE = { x1: 2500, y1: 790, x2: 2700, y2: 790 }; // just over the Butterfly when it was struck
  function animals() {
    const { engine, slots } = setup();
    const bfly = { classId: 'npc_butterfly', airborne: true, classIndex: 4, sprite: { x: 250, y: 900, vx: 0.65, _ambient: true, visible: true, destroyed: false, scale: { x: 1 }, gotoAndPlay() {} } };
    const chick = { classId: 'npc_chicken', classIndex: 1, sprite: { x: 2569, y: 1000, vx: 0.5, baseX: 2569, range: 100, visible: true, destroyed: false, scale: { x: 1 }, gotoAndPlay() {} } };
    engine.interactables = [bfly, chick];
    engine.platforms = [FLOOR, LEDGE];
    return { engine, slots, bfly, chick };
  }
  // The feature scans the street every 400 ms of its tick clock (module state): each tick moves on.
  let clock = 2_000_000_000;
  const tick = (engine) => rookAttackFeature.onTick(500, (clock += 500), engine);

  it('solo: a later visit lays it at the spot its rooked row kept, a flyer on the line under it', () => {
    const { engine, slots, bfly, chick } = animals();
    rookAttackFeature.onStreetClear(engine);
    // Rooked on an earlier visit: the Butterfly over x 2600 under the ledge, the Chicken at 2660.
    slots['rook-attack'] = { rooked: {
      'npc_butterfly:4': { classId: 'npc_butterfly', doses: 0, at: 1, x: 2600, y: 800 },
      'npc_chicken:1': { classId: 'npc_chicken', doses: 0, at: 1, x: 2660, y: 1000 },
    } };
    tick(engine);
    assert.equal(bfly.sprite.x, 2600, 'not at its planned spot (x 250)');
    assert.equal(bfly.sprite._groundY, 998, 'on the floor under it, not the ledge over it');
    assert.equal(bfly.sprite._ambient, false);
    assert.equal(chick.sprite.x, 2660);
    assert.equal(chick.sprite.vx, 0);
    // Revived: it goes on from there.
    slots['rook-attack'].rooked = {};
    tick(engine);
    assert.equal(bfly.sprite.x, 2600);
    assert.equal(bfly.sprite._ambient, true, 'it flies again');
    assert.equal(chick.sprite.x, 2660);
    assert.ok(Math.abs(chick.sprite.vx) > 0.3, 'it walks again');
    rookAttackFeature.onStreetClear(engine);
  });

  it('online: it lies where its shared path stopped, for every page (not on a server that does not stop it)', () => {
    const { engine, slots, bfly } = animals();
    rookAttackFeature.onStreetClear(engine);
    let hold = 30 * 24 * 3600 * 1000;
    let pathX = 3333;
    bfly.sprite._pathPoint = () => ({ x: pathX, y: 900 });
    bfly.sprite._pathHold = () => hold;
    slots['rook-attack'] = { rooked: { 'npc_butterfly:4': { classId: 'npc_butterfly', doses: 0, at: 1 } } };
    tick(engine);
    assert.equal(bfly.sprite.x, 3333, 'a page that came after the strike lays it where its path stopped');
    assert.equal(bfly.sprite._groundY, 998);
    tick(engine);
    assert.equal(bfly.sprite.x, 3333);
    // A server that does not hold the path (no long hold): the page leaves it where it stopped here.
    rookAttackFeature.onStreetClear(engine);
    hold = 0;
    pathX = 4000;
    bfly.sprite.x = 1200;
    tick(engine);
    tick(engine);
    assert.equal(bfly.sprite.x, 1200);
    rookAttackFeature.onStreetClear(engine);
  });
});
