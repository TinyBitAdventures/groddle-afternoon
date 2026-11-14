/**
 * G718: Legalize It's hall step is made in Gregarious Grange's shared
 * Bureaucratic Hall, as in Glitch. The quest only instanced The Back Alley
 * (quests/card_carrying_qualification.js onStarted 80-91); the street's door
 * connects to the real hall LIF101O8CDQ1AMU (GLI32G3NUTD100I.xml
 * door_1300484753304), so everyone applying there stood in one room. The
 * remake's private copy is gone: its id resolves to the shared hall, and a
 * save left in it (or an application left in a hall stage) walks back in.
 * Run: node --test tests/legalize-shared-hall.test.js
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HALL_DOORS,
  bureaucraticHallsFeature,
  hallForPlace,
  hallReload,
  hallSceneTsid,
} from '../public/js/features/bureaucratic-halls-feature.js?v=a4473ba7';
import {
  LEGALIZE_HALL_STAGES,
  LEGALIZE_HALL_TSID,
  LEGALIZE_QUEST_ID,
  LEGALIZE_SHARED_HALL,
  endLegalizeVisit,
  enterLegalizeHall,
  ensureLegalizeState,
  leaveBureaucraticHall,
  legalizeObjective,
} from '../public/js/legalize-it.js?v=9afd2e68';
import { assignQuest, createQuestState } from '../public/js/quests.js?v=40c71a37';
import { loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=10b118dd';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const GRANGE = 'GLI32G3NUTD100I';

await (async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
})();

function application(stage) {
  const questState = createQuestState();
  assignQuest(questState, LEGALIZE_QUEST_ID, { ignorePrereq: true });
  const run = ensureLegalizeState(questState);
  run.stage = stage;
  return { questState, run };
}

function fakeEngine(over = {}) {
  const calls = { scenes: [], entered: [], visits: [], sent: [] };
  const sprite = () => ({ anchor: { set() {} }, position: { set() {} }, scale: { set() {} } });
  const engine = {
    streetTsid: GRANGE,
    player: { x: 1101, y: 847 },
    interactables: [],
    entityLayer: { addChild() {} },
    transientInstance: () => false,
    travelGate: () => ({ ok: true }),
    bureaucraticHall: () => ({ layer: { platformsScreen: [{ id: 'floor' }] }, clerk: () => sprite(), sprite: () => sprite() }),
    enterScene(scene) {
      calls.scenes.push(scene);
      engine.streetTsid = scene.tsid;
    },
    register: (t) => t,
    enter: async (tsid, opts) => calls.entered.push({ tsid, ...opts }),
    playSound() {},
    toast() {},
    setData() {},
    say() {},
    prompt: () => 'p1',
    removePrompt() {},
    pushActivity() {},
    param: () => null,
    ...over,
  };
  return { engine, calls };
}

describe('the application in the shared hall (js/legalize-it.js)', () => {
  it('walking in from the street starts it; an application in a hall stage starts over at the waiting area', () => {
    const { run } = application('grange_exterior');
    assert.equal(enterLegalizeHall(run).ok, true);
    assert.equal(run.stage, 'hall_waiting');
    for (const stage of LEGALIZE_HALL_STAGES) {
      const { run: r } = application(stage);
      Object.assign(r, { handoffs: 1, clerkIndex: 3, visitOver: true });
      assert.equal(enterLegalizeHall(r).ok, true, stage);
      assert.deepEqual([r.stage, r.handoffs, r.clerkIndex, r.visitOver], ['hall_waiting', 0, 0, false]);
    }
    // Before the alley, or with the card bought: no application here, the hall's plain visit.
    for (const stage of ['gregarious_departure', 'back_alley', 'card_owned', 'complete']) {
      const { run: r } = application(stage);
      assert.equal(enterLegalizeHall(r).ok, false, stage);
      assert.equal(r.stage, stage);
    }
    assert.equal(enterLegalizeHall(null).ok, false);
  });

  it('Nevermind ends the visit: apply again by leaving and coming back (location.js 810-819, 1076)', () => {
    const { run } = application('hall_processing');
    Object.assign(run, { handoffs: 1, clerkIndex: 1 });
    assert.equal(endLegalizeVisit(run).ok, true);
    assert.deepEqual([run.stage, run.handoffs, run.clerkIndex, run.visitOver], ['hall_waiting', 0, 0, true]);
    assert.equal(legalizeObjective(run), 'Leave the hall and come back in to apply again');
    leaveBureaucraticHall(run);
    assert.equal(run.stage, 'grange_exterior');
    assert.equal(run.visitOver, false);
    assert.equal(legalizeObjective(run), 'Enter the Bureaucratic Hall');
    assert.equal(endLegalizeVisit(application('card_owned').run).ok, false);
  });
});

describe('the old private hall resolves to the shared one (bureaucratic-halls-feature.js)', () => {
  beforeEach(() => bureaucraticHallsFeature._reset());

  it('its id, the shared scene id and every hall map to their street door', () => {
    assert.equal(LEGALIZE_SHARED_HALL, hallSceneTsid(LEGALIZE_HALL_TSID));
    for (const tsid of [LEGALIZE_HALL_TSID, LEGALIZE_SHARED_HALL]) {
      assert.deepEqual(hallReload({ tsid, x: 721, y: 572 }).at, { tsid: GRANGE, x: 1101, y: 847 }, tsid);
    }
    for (const def of Object.values(HALL_DOORS)) assert.equal(hallForPlace(hallSceneTsid(def.tsid)), def);
    assert.equal(hallReload({ tsid: 'GLI2V0UN7RD1T2J', x: 1, y: 1 }), null);
    assert.equal(hallReload(null), null);
  });

  it('a save in the shared hall is the hall itself, not the quest\'s way back (game.js instanceWayBack)', () => {
    // The application's stage is not part of the save (js/player-save.js keeps story.gates only), so the
    // place saved is what brings a reload back in: the shared hall's scene, never the way back.
    assert.match(game, /if \(legalizeRun && legalizeSourceLocation\?\.tsid && currentStreetTsid !== LEGALIZE_SHARED_HALL\) return legalizeSourceLocation;/);
  });

  it('a reload saved in the private copy starts at the door and walks into the shared hall, the application with it', async () => {
    const { questState, run } = application('hall_processing');
    const { engine, calls } = fakeEngine({ questState });
    let leaves = 0;
    engine.hallVisit = (tsid) => {
      calls.visits.push(tsid);
      return tsid === LEGALIZE_HALL_TSID && enterLegalizeHall(run).ok ? { script: { pick: () => null, onLeave: () => leaves++ } } : null;
    };
    const at = bureaucraticHallsFeature.reloadLocation({ tsid: LEGALIZE_HALL_TSID, x: 721, y: 572 });
    assert.deepEqual(at, { tsid: GRANGE, x: 1101, y: 847 });
    // The street comes up, then the hall (once nothing is busy).
    bureaucraticHallsFeature.onStreetEnter({ tsid: GRANGE }, engine);
    bureaucraticHallsFeature.onTick(16, Date.now(), engine);
    assert.equal(calls.scenes.length, 0, 'not before the street settles');
    bureaucraticHallsFeature.onTick(16, Date.now() + 1000, engine);
    assert.equal(calls.scenes.length, 1);
    assert.equal(calls.scenes[0].tsid, LEGALIZE_SHARED_HALL);
    assert.deepEqual(calls.scenes[0].returnTo, { tsid: GRANGE, x: 1101, y: 847 });
    assert.deepEqual(calls.visits, [LEGALIZE_HALL_TSID]);
    assert.equal(run.stage, 'hall_waiting');
    assert.equal(bureaucraticHallsFeature._state().hall.tsid, LEGALIZE_HALL_TSID);
    // Out through the glass doors: the visit ends and the application waits on the street.
    const exit = { classId: 'bureaucratic_hall_exit' };
    bureaucraticHallsFeature.runVerb(exit, 'hall_leave', engine);
    await new Promise((r) => setImmediate(r));
    assert.equal(leaves, 1);
    assert.equal(calls.entered[0].tsid, GRANGE);
    bureaucraticHallsFeature.onStreetClear(engine);
    assert.equal(leaves, 1, 'told once');
  });

  it('a reload whose street never comes up does not pull you into a hall later', () => {
    const { engine, calls } = fakeEngine({ streetTsid: 'GLI2V0UN7RD1T2J' });
    bureaucraticHallsFeature.reloadLocation({ tsid: LEGALIZE_SHARED_HALL, x: 1, y: 1 });
    bureaucraticHallsFeature.onStreetEnter({ tsid: 'GLI2V0UN7RD1T2J' }, engine);
    bureaucraticHallsFeature.onTick(16, Date.now() + 5000, engine);
    engine.streetTsid = GRANGE;
    bureaucraticHallsFeature.onStreetEnter({ tsid: GRANGE }, engine);
    bureaucraticHallsFeature.onTick(16, Date.now() + 6000, engine);
    assert.equal(calls.scenes.length, 0);
  });
});

describe('online: the application uses the server\'s bureaucrats (G479 halls.go)', () => {
  beforeEach(() => bureaucraticHallsFeature._reset());

  it('the Legalize It visit in the Grange hall joins HALL_LIF101O8CDQ1AMU and asks the server who greets', () => {
    const { run } = application('grange_exterior');
    const sent = [];
    const client = { state: 'online', me: { id: 7 }, street: LEGALIZE_SHARED_HALL, on() {}, send: (type, msg) => sent.push([type, msg]) || true };
    const { engine, calls } = fakeEngine({ mode: 'multiplayer', query: (name) => (name === 'realtimeClient' ? client : null) });
    let script = null;
    engine.hallVisit = (tsid) => (tsid === LEGALIZE_HALL_TSID && enterLegalizeHall(run).ok ? { script: (script = { pick: () => null }) } : null);
    assert.equal(bureaucraticHallsFeature.hallEnter(LEGALIZE_HALL_TSID, engine), true);
    assert.equal(calls.scenes[0].tsid, LEGALIZE_SHARED_HALL);
    assert.ok(script, 'the quest\'s script rides on the shared visit');
    assert.equal(bureaucraticHallsFeature.realtimeStreet({ ...engine, inScene: () => true }), LEGALIZE_SHARED_HALL);
    // Into the entered box: the greeting is the server's to give.
    engine.player.x = 400;
    bureaucraticHallsFeature.onTick(16, Date.now(), engine);
    assert.deepEqual(sent.find(([t]) => t === 'hall_ask'), ['hall_ask', { kind: 'greet', x: 400 }]);
  });
});

describe('game.js wiring', () => {
  it('the route\'s hall is the shared scene, The Back Alley the only instance, the street door every player\'s', () => {
    assert.match(game, /\[LEGALIZE_STATION_STREET, LEGALIZE_GRANGE_STREET, LEGALIZE_BACK_ALLEY_TSID, LEGALIZE_SHARED_HALL\]\.includes\(currentStreetTsid\)/);
    assert.match(game, /return Boolean\(legalizeRun && currentStreetTsid === LEGALIZE_BACK_ALLEY_TSID\);/);
    assert.match(game, /executeVerb\(hall, 'hall_enter'\);/);
    const visit = game.slice(game.indexOf('function legalizeHallVisit('), game.indexOf('const LEGALIZE_HALL_PICKS'));
    assert.match(visit, /if \(hallTsid !== LEGALIZE_HALL_TSID \|\| !legalizeRouteState\(\)\) return null;/);
    assert.match(visit, /return \{ script: legalizeHallScript\(\) \};/);
    // The quest log's resume: an application in a hall stage goes back into the shared hall.
    assert.match(game, /features\.query\('hallEnter', LEGALIZE_HALL_TSID, engine\);/);
  });
});
