// A Piggy rooked on its way to food stands still, and walks again (never in place) once revived.
// Sources: include/rook.js fullStop 53-63 on rooking, npc_animal onContainerItemAdded 1394/1419
// (no food while rooked), npc_piggy.js onRevived 1090-1095 (startMoving).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAnimalState } from '../public/js/animals.js?v=630619c4';
import { animalMoodFeature } from '../public/js/features/animal-mood-feature.js?v=8c155589';
import { rookAttackFeature } from '../public/js/features/rook-attack-feature.js?v=8d2fffe9';

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
