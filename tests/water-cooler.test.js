/**
 * G352 Cup of Water: every Bureaucratic Hall has its Water Cooler
 * (js/water-cooler.js, items/water_cooler.js); a cup drunk (cup_of_water.js)
 * puts Being Watched (quests/stale_but_necessary.js) to the player at once.
 * Run: node --test tests/water-cooler.test.js
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import {
  CUP_CLASS,
  CUP_OF_WATER,
  CUP_QUEST,
  WATER_COOLER,
  cupOffersQuest,
  drinkCup,
  getWater,
  getWaterState,
} from '../public/js/water-cooler.js';
import { addItem, countItem, removeItem } from '../public/js/inventory.js';
import { COOLER_X, DRINK_VERB, GET_WATER_VERB, bureaucraticHallsFeature } from '../public/js/features/bureaucratic-halls-feature.js?v=g452-1';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=g403-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS');
const gsjs = (f) => (existsSync(join(GSJS, f)) ? readFileSync(join(GSJS, f), 'utf8') : null);
await loadContentCatalogsFromDir(join(root, 'public/assets/content'));

describe('Water Cooler and Cup of Water: source', () => {
  it('keeps the verbs, words and numbers of water_cooler.js and cup_of_water.js', () => {
    const cooler = gsjs('items/water_cooler.js');
    const cup = gsjs('items/cup_of_water.js');
    if (!cooler || !cup) return;
    assert.ok(cooler.includes(`"tooltip"			: "${WATER_COOLER.verb.tooltip}"`));
    assert.ok(cooler.includes(WATER_COOLER.dispensed));
    assert.match(cooler, /pc\.metabolics_lose_energy\(2 \* msg\.count\)/);
    assert.ok(cooler.includes(`reason: "${WATER_COOLER.full}"`));
    assert.ok(cooler.includes(WATER_COOLER.desc));
    assert.ok(cup.includes(CUP_OF_WATER.drank));
    assert.ok(cup.includes(CUP_OF_WATER.desc));
    assert.match(cup, /pc\.metabolics_lose_mood\(5 \* msg\.count\)/);
    assert.match(cup, /pc\.quests_offer\('stale_but_necessary', true\)/);
    assert.match(cup, /var base_cost = 1;/);
    assert.equal(WATER_COOLER.energy, 2);
    assert.equal(CUP_OF_WATER.mood, 5);
  });

  it('the quest waits for the cup again (item_use cup_of_water), not for Legalize It', () => {
    const quests = JSON.parse(readFileSync(join(root, 'public/assets/content/quests.json'), 'utf8'));
    const def = (quests.quests || quests)[CUP_QUEST];
    assert.equal(def.solo, true);
    assert.equal(def.isEmergency, true);
    assert.deepEqual(def.offerTriggers.map(({ type, event, item }) => ({ type, event, item })), [{ type: 'event', event: 'item_use', item: CUP_CLASS }]);
  });
});

describe('Water Cooler rules', () => {
  it('get water: a cup and 2 energy; a full pack refuses with the source words', () => {
    const inv = {};
    let lost = 0;
    const res = getWater(inv, { addItem, loseEnergy: (n) => { lost += n; return n; } });
    assert.equal(res.ok, true);
    assert.equal(res.msg, 'A cup of water cooler water is duly dispensed.');
    assert.equal(inv[CUP_CLASS], 1);
    assert.equal(lost, 2);
    assert.deepEqual(getWaterState({ room: 0 }), { enabled: false, reason: 'Your bag is full!' });
    const full = getWater({}, { room: 0, addItem });
    assert.equal(full.ok, false);
    assert.equal(full.msg, 'Your bag is full!');
  });

  it('drink: the cup goes, 5 mood, and Being Watched only while it is not in the log or done', () => {
    const inv = { [CUP_CLASS]: 1 };
    let mood = 0;
    const res = drinkCup(inv, { removeItem, countItem, loseMood: (n) => { mood += n; return n; }, questStatus: 'none' });
    assert.equal(res.ok, true);
    assert.equal(res.msg, 'Ewww. That water tastes really … bureaucratic-y.');
    assert.equal(countItem(inv, CUP_CLASS), 0);
    assert.equal(mood, 5);
    assert.equal(res.offer, CUP_QUEST);
    assert.equal(drinkCup({ [CUP_CLASS]: 1 }, { removeItem, countItem, questStatus: 'done' }).offer, '');
    assert.equal(drinkCup({ [CUP_CLASS]: 1 }, { removeItem, countItem, questStatus: 'active' }).offer, '');
    assert.equal(drinkCup({}, { removeItem, countItem }).ok, false);
    assert.equal(cupOffersQuest('none'), true);
    assert.equal(cupOffersQuest('done'), false);
  });
});

function fakeEngine(over = {}) {
  const calls = { registered: [], offers: [], toasts: [], activity: [], saves: 0 };
  const sprite = () => ({ anchor: { set() {} }, position: { set() {} }, scale: { set() {} }, width: 0, height: 0 });
  const engine = {
    streetTsid: 'GLI32G3NUTD100I',
    player: { x: 600, y: 830 },
    pc: { energy: 100, mood: 100, energyMax: 100, moodMax: 100, level: 10 },
    inv: {},
    questState: { active: {}, completed: [], offers: {} },
    interactables: [],
    entityLayer: { addChild() {} },
    transientInstance: () => false,
    travelGate: () => ({ ok: true }),
    bureaucraticHall: () => ({ layer: { platformsScreen: [] }, clerk: () => sprite(), sprite: () => sprite() }),
    enterScene() {},
    register: (t) => {
      calls.registered.push(t);
      return t;
    },
    playSound() {},
    toast: (t) => calls.toasts.push(t),
    pushActivity: (t) => calls.activity.push(t),
    refreshPack() {},
    updateHud() {},
    save: () => { calls.saves += 1; },
    setData() {},
    param: () => null,
    query: () => null,
    offerQuestDialogue: (o) => calls.offers.push(o),
    ...over,
  };
  return { engine, calls };
}

describe('Water Cooler in the hall (bureaucratic-halls-feature)', () => {
  beforeEach(() => bureaucraticHallsFeature._reset());

  it('stands in every hall, in the desk room, with Get water from', () => {
    const { engine, calls } = fakeEngine();
    bureaucraticHallsFeature.runVerbOverride({ classId: 'street_door', door: { id: 'door_1300484753304', x: 900, y: 830 } }, 'hall_enter', engine);
    const cooler = calls.registered.find((t) => t.classId === 'water_cooler');
    assert.ok(cooler);
    assert.equal(cooler.label, 'Water Cooler');
    // The desk ends at backdrop x 548, the partition starts at 625 (bureaucratic_hall_bg).
    assert.ok(COOLER_X - WATER_COOLER.w / 2 > 525 && COOLER_X + WATER_COOLER.w / 2 < 640, 'between the desk and the partition');
    const [verb] = bureaucraticHallsFeature.verbsFor(cooler, engine);
    assert.equal(verb.id, GET_WATER_VERB);
    assert.equal(verb.label, 'Get water from');
    assert.equal(verb.enabled, true);
    const full = fakeEngine({ query: (name) => (name === 'packRoom' ? 0 : null) });
    assert.equal(bureaucraticHallsFeature.verbsFor(cooler, full.engine)[0].reason, 'Your bag is full!');
  });

  it('gets a cup, drinks it, and offers Being Watched as an emergency (Take nap)', () => {
    const { engine, calls } = fakeEngine();
    assert.equal(bureaucraticHallsFeature.runVerb({ classId: 'water_cooler' }, GET_WATER_VERB, engine), true);
    assert.equal(engine.inv[CUP_CLASS], 1);
    assert.equal(engine.pc.energy, 98);
    assert.deepEqual(calls.activity, ['A cup of water cooler water is duly dispensed.']);
    const [drink] = bureaucraticHallsFeature.packVerbs(CUP_CLASS, engine);
    assert.equal(drink.id, DRINK_VERB);
    assert.equal(drink.label, 'Drink');
    assert.equal(bureaucraticHallsFeature.runPackVerb(CUP_CLASS, DRINK_VERB, engine), true);
    assert.equal(countItem(engine.inv, CUP_CLASS), 0);
    assert.equal(engine.pc.mood, 95);
    assert.equal(calls.offers.length, 1);
    const offer = calls.offers[0];
    assert.equal(offer.title, 'Being Watched');
    assert.equal(offer.acceptLabel, 'Take nap');
    assert.equal(offer.urgent, true);
    assert.equal(offer.declinable, false);
    offer.onAccept();
    assert.ok(engine.questState.active[CUP_QUEST], 'accepted into the log (the room starts from there)');
    // The quest is in the log now: another cup is only water.
    engine.inv[CUP_CLASS] = 1;
    bureaucraticHallsFeature.runPackVerb(CUP_CLASS, DRINK_VERB, engine);
    assert.equal(calls.offers.length, 1);
    assert.equal(bureaucraticHallsFeature.packVerbs(CUP_CLASS, engine), null);
  });
});
