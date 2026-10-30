/**
 * Tests ship domain modules used by the playable client.
 * Run: node --test tests/world.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocation, getLocation, playerInBounds, DEFAULT_STREET } from '../public/js/locations.js?v=g403-1';
import {
  createWorld,
  teleportTo,
  enterHouse,
  leaveHouse,
  tryUsePortal,
} from '../public/js/world.js';
import {
  createQuestState,
  assignQuest,
  applyQuestProgress,
  completeQuest,
  getQuestProgress,
  QUEST_CATALOG,
} from '../public/js/quests.js';
import {
  createInventory,
  addItem,
  removeItem,
  useItem,
  countItem,
  ITEM_CATALOG,
} from '../public/js/inventory.js?v=catalog-unified-7';
import { getVerbsFor, runVerb } from '../public/content.js?v=g478-1';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=g403-1';

const __dirname = dirname(fileURLToPath(import.meta.url));
before(async () => {
  await loadContentCatalogsFromDir(join(__dirname, '../public/assets/content'));
});

describe('location load (original streets)', () => {
  it('loads West Hechey Clearing with original tsid/label', () => {
    const loc = loadLocation('LM411BNOGTUG2');
    assert.equal(loc.tsid, 'LM411BNOGTUG2');
    assert.equal(loc.label, 'West Hechey Clearing');
    assert.equal(loc.hubName, 'Old Groddle Forest');
    assert.ok(loc.worldW > 100);
    assert.ok(loc.bounds.maxX > loc.bounds.minX);
  });

  it('loads East Hechey and Hechey Track as distinct streets', () => {
    const east = loadLocation('LM4103P17E3G0');
    const track = loadLocation('LM4104P19669M');
    assert.equal(east.label, 'East Hechey Clearing');
    assert.equal(track.label, 'Hechey Track');
    assert.notEqual(east.tsid, track.tsid);
  });

  it('player spawn is inside street bounds', () => {
    const loc = loadLocation(DEFAULT_STREET);
    assert.ok(
      playerInBounds({ x: loc.spawnX, y: loc.groundY }, loc),
      'spawn inside bounds',
    );
  });

  it('throws on unknown tsid', () => {
    assert.throws(() => getLocation('NOPE'), /Unknown location/);
  });
});

describe('teleport', () => {
  it('moves session from West Hechey to East Hechey', () => {
    const world = createWorld('LM411BNOGTUG2');
    assert.equal(world.currentTsid, 'LM411BNOGTUG2');
    const r = teleportTo(world, 'LM4103P17E3G0');
    assert.equal(r.ok, true);
    assert.equal(r.tsid, 'LM4103P17E3G0');
    assert.equal(r.label, 'East Hechey Clearing');
    assert.equal(world.currentTsid, 'LM4103P17E3G0');
    assert.equal(world.location.label, 'East Hechey Clearing');
  });

  it('portal edge teleports with spawn context', () => {
    const world = createWorld('LM411BNOGTUG2');
    // portal at x=2320 on West Hechey
    const r = tryUsePortal(world, 2320);
    assert.equal(r.ok, true);
    assert.equal(r.tsid, 'LM4103P17E3G0');
    assert.ok(r.spawnX > 0);
    assert.equal(world.location.label, 'East Hechey Clearing');
  });
});

describe('personal house', () => {
  it('enter house then leave to return street', () => {
    const world = createWorld('LM411BNOGTUG2');
    const enter = enterHouse(world);
    assert.equal(enter.ok, true);
    assert.equal(enter.tsid, 'RH_HOME_INT');
    assert.equal(enter.label, 'Your House');
    assert.equal(enter.returnStreet, 'LM411BNOGTUG2');
    assert.ok(world.location.isHouse);

    const leave = leaveHouse(world);
    assert.equal(leave.ok, true);
    assert.equal(leave.tsid, 'LM411BNOGTUG2');
    assert.equal(world.location.label, 'West Hechey Clearing');
    assert.ok(!world.location.isHouse);
  });

  it('house door portal leaves house', () => {
    const world = createWorld('LM4103P17E3G0');
    enterHouse(world);
    const r = tryUsePortal(world, 100); // leave door
    assert.equal(r.ok, true);
    assert.equal(r.tsid, 'LM4103P17E3G0');
  });
});

describe('quests (original Porcine Pleaser)', () => {
  it('assigns animalkinship_pet_piggies from catalog', () => {
    const state = createQuestState();
    const r = assignQuest(state, 'animalkinship_pet_piggies', { ignorePrereq: true });
    assert.equal(r.ok, true);
    assert.equal(r.def.title, 'Porcine Pleaser');
    assert.ok(state.active.animalkinship_pet_piggies);
  });

  it('progresses and completes after 6 piggy pets', () => {
    const state = createQuestState();
    const pc = { energy: 50, mood: 50, imagination: 0, currants: 0 };
    assignQuest(state, 'animalkinship_pet_piggies', { ignorePrereq: true });
    for (let i = 0; i < 5; i++) {
      const u = applyQuestProgress(state, 'pet_piggy', 1, pc);
      assert.equal(u[0].completed, false);
    }
    const last = applyQuestProgress(state, 'pet_piggy', 1, pc);
    assert.equal(last[0].completed, true);
    assert.ok(state.completed.includes('animalkinship_pet_piggies'));
    assert.ok(!state.active.animalkinship_pet_piggies);
    assert.equal(pc.currants, 50);
    assert.equal(pc.imagination, 200);
    const prog = getQuestProgress(state, 'animalkinship_pet_piggies');
    assert.equal(prog.completed, true);
  });

  it('catalog includes original quest class_tsid', () => {
    assert.ok(QUEST_CATALOG.animalkinship_pet_piggies);
    assert.equal(QUEST_CATALOG.animalkinship_pet_piggies.requirements[0].num, 6);
  });
});

describe('items + verbs (content.js handlers)', () => {
  it('catalog has original class_tsids', () => {
    assert.ok(ITEM_CATALOG.apple);
    assert.ok(ITEM_CATALOG.milk_butterfly);
    assert.ok(ITEM_CATALOG.grain);
  });

  it('pick up apple adds to inventory via runVerb', () => {
    const inv = createInventory({ apple: 0, butterfly_lotion: 0 });
    const pc = { energy: 80, mood: 70 };
    const target = { classId: 'apple', state: {} };
    const verbs = getVerbsFor(target, { pc, inv });
    assert.ok(verbs.some((v) => v.id === 'pickup' && v.enabled));
    const r = runVerb(target, 'pickup', { pc, inv });
    assert.equal(r.ok, true);
    assert.equal(countItem(inv, 'apple'), 1);
  });

  it('pet piggy works and costs energy', () => {
    const inv = createInventory();
    const pc = { energy: 80, mood: 70 };
    const target = { classId: 'npc_piggy', state: {} };
    const r = runVerb(target, 'pet', { pc, inv, rng: () => 0.5 });
    assert.equal(r.ok, true);
    assert.ok(pc.energy < 80);
    assert.ok(pc.mood > 70);
  });

  it('useItem eats apple from pack', () => {
    const inv = createInventory({ apple: 2 });
    const pc = { energy: 40, mood: 40 };
    const r = useItem(inv, pc, 'apple');
    assert.equal(r.ok, true);
    assert.equal(countItem(inv, 'apple'), 1);
    assert.ok(pc.energy > 40);
  });

  it('add/remove inventory', () => {
    const inv = createInventory({ grain: 0 });
    addItem(inv, 'grain', 3);
    assert.equal(countItem(inv, 'grain'), 3);
    assert.equal(removeItem(inv, 'grain', 2), true);
    assert.equal(countItem(inv, 'grain'), 1);
  });
});
