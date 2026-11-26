/**
 * G887: streets with no road back to Ur. After G886 a player was still stuck: a reload on the EZ
 * Cookin' practice street, the Map's Puzzle streets card to Orangian (whose one door leads to
 * itself), and then G886's way out ("your last ordinary street") was Orangian, while Orangian's exit
 * door sent him back to the practice street the card was taken from. The way out must only ever be
 * a street whose roads lead to Ur; the source never left anyone on these (the colour levels were a
 * quest instance, quests/puzzle_level_color_blockage.js onStarted questInstanceLocation, left through
 * instances_exit, and players/player.js onLogout moved you out of one).
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRAY_FALLBACK_TSID, strayWayOut, streetsReachingUr } from '../public/js/quest-instance.js?v=15090adc';
import { COLOUR_LEVEL_STREETS, NO_EXIT_PUZZLE_STREETS, PUZZLE_LEAVE_TEXT } from '../public/js/puzzle-triggers.js?v=221b67a9';
import { questInstancesFeature as qi } from '../public/js/features/quest-instances-feature.js?v=b3edaff7';
import { puzzlesFeature as pz } from '../public/js/features/puzzles-feature.js?v=12ca7213';
import { STUCK_TEXT, slashPlan } from '../public/js/slash-commands.js?v=bb2569aa';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const gsjs = (p) => readFileSync(join(root, '../glitch-GameServerJS', p), 'utf8');
const graph = JSON.parse(read('public/assets/content/signpost-graph.json'));
const puzzles = JSON.parse(read('public/assets/content/puzzle-triggers.json')).streets;

const ORANGIAN = 'GHVCKEPHO403BN5';
const EZ = 'GIFII3UBRFB3KBE';
const GIMBAP_BOP = 'GA54VETILKR26N1'; // Umbra's door
const HECHEY = { tsid: 'GLI2V0UN7RD1T2J', x: 410, y: 820 };

function fakeEngine({ tsid = HECHEY.tsid, owned = false } = {}) {
  const log = { entered: [], toasts: [], activity: [], data: {} };
  const engine = {
    log,
    started: true,
    streetTsid: tsid,
    street: { tsid, label: tsid, boxes: [] },
    player: { x: 100, y: 829 },
    questState: { active: {}, completed: [], offers: { managed: {} } },
    setData: (k, v) => { log.data[k] = v; },
    param: () => null,
    save() {},
    updateHud() {},
    busy: () => false,
    inScene: () => false,
    transientInstance: () => false,
    homeContext: () => ({ owned }),
    toast: (t) => log.toasts.push(t),
    pushActivity: (t) => log.activity.push(t),
    query: () => null,
    enter: async (to, opts) => {
      log.entered.push([to, opts]);
      engine.streetTsid = to;
      engine.street = { tsid: to, label: to, boxes: [] };
    },
  };
  return engine;
}

describe('which puzzle streets have no road out (js/puzzle-triggers.js)', () => {
  const ur = streetsReachingUr(graph);

  it('reads the roads that lead back to Hechey Track', () => {
    assert.ok(ur.has(HECHEY.tsid));
    assert.ok(ur.has('LLI2V0UN7RD1T2J'.replace(/^L/, 'G')));
    assert.ok(ur.has(GIMBAP_BOP), "Umbra's door street is Ur's");
    assert.ok(!ur.has(ORANGIAN), "Orangian's one door leads to itself");
    assert.ok(!ur.has(EZ), 'the practice street has no door');
    assert.equal(streetsReachingUr(null), null);
  });

  it('NO_EXIT_PUZZLE_STREETS is every puzzle street (not a held instance) with no road to Ur', () => {
    const found = Object.entries(puzzles).filter(([t, def]) => !def.instance && !ur.has(t)).map(([t]) => t).sort();
    assert.deepEqual([...NO_EXIT_PUZZLE_STREETS].sort(), found);
  });

  it('the colour levels are the ones that end at their own exit door', () => {
    const doors = Object.entries(puzzles).filter(([, def]) => def.exit?.door).map(([t]) => t).sort();
    assert.deepEqual([...COLOUR_LEVEL_STREETS].sort(), doors);
    // Their door is the level's Exit (puzzles-feature verbOverride), never a trip: six lead to
    // themselves, and Fernucopia's (to Jutuan Central) is not in the Map's roads either.
    const src = read('public/js/features/puzzles-feature.js');
    assert.match(src, /if \(!run\?\.def\?\.exit\?\.door \|\| target\?\.classId !== 'street_door'\) return null;/);
  });

  it('in the source the colour levels were a quest instance, left by its exit', () => {
    const q = gsjs('quests/puzzle_level_color_blockage.js');
    assert.match(q, /this\.questInstanceLocation\(pc, location_id, marker\.x, marker\.y, 5\*60, \{preserve_links: true\}\);/);
    assert.match(q, /function onExitLocation\(location\)\{[\s\S]*pc\.instances_exit\('color_unblocking'\);/);
  });
});

describe('the way out is never a dead end (features/quest-instances-feature.js)', () => {
  beforeEach(() => qi.restore({}));

  it('strayWayOut drops a last street the caller says is no ordinary street', () => {
    const notOrangian = (t) => t !== ORANGIAN;
    assert.deepEqual(strayWayOut({ lastStreet: { tsid: ORANGIAN, x: 1, y: 2 }, ordinary: notOrangian }).tsid, STRAY_FALLBACK_TSID);
    assert.deepEqual(strayWayOut({ lastStreet: { tsid: ORANGIAN, x: 1, y: 2 }, homeTsid: 'RH_HOME_EXT', ordinary: notOrangian }).tsid, 'RH_HOME_EXT');
    assert.deepEqual(strayWayOut({ lastStreet: HECHEY, ordinary: notOrangian }), HECHEY);
  });

  it('a save holding Orangian as the last street is repaired on load', () => {
    qi.restore({ lastStreet: { tsid: ORANGIAN, x: 100, y: 829 } });
    assert.equal(qi._state().save.lastStreet, null);
    qi.restore({ lastStreet: { tsid: 'LIFII3UBRFB3KBE', x: 1, y: 2 } });
    assert.equal(qi._state().save.lastStreet, null, 'the practice street by its source tsid too');
    qi.restore({ lastStreet: HECHEY });
    assert.deepEqual(qi._state().save.lastStreet, HECHEY);
  });

  it('standing on a puzzle street with no road out never makes it the last street', () => {
    qi.restore({ lastStreet: HECHEY });
    const engine = fakeEngine({ tsid: ORANGIAN });
    qi.onStreetEnter(engine.street, engine);
    assert.deepEqual(qi._state().save.lastStreet, HECHEY);
    assert.deepEqual(engine.log.entered, [], 'and Orangian itself is left alone (its card run)');
  });

  it("the reported loop: the practice street's way out goes to Ur, not Orangian", () => {
    qi.restore({ lastStreet: { tsid: ORANGIAN, x: 100, y: 829 } });
    assert.equal(qi.safeWayOut(fakeEngine({ tsid: EZ })).tsid, STRAY_FALLBACK_TSID);
    qi.restore({ lastStreet: { tsid: ORANGIAN, x: 100, y: 829 } });
    assert.equal(qi.safeWayOut(fakeEngine({ tsid: EZ, owned: true })).tsid, 'RH_HOME_EXT');
    // G888: a reload there stays (the street's EXIT sign leads out by this way).
    assert.equal(qi.reloadLocation({ tsid: EZ, x: 1443, y: 900 }, fakeEngine()), null);
  });

  it('a quest run whose way back is a dead end comes out on the way out', () => {
    qi.restore({ lastStreet: HECHEY, questId: 'ezcooking_1', roomId: 'ez_cookin', returnTo: { tsid: ORANGIAN, x: 1, y: 2 } });
    assert.deepEqual(qi.reloadLocation({ tsid: EZ }, fakeEngine()), HECHEY);
  });

  it('safeWayOut keeps where you came in unless it is a dead end, and can say the safe-place line', () => {
    qi.restore({ lastStreet: HECHEY });
    const engine = fakeEngine({ tsid: ORANGIAN });
    assert.deepEqual(qi.safeWayOut(engine, { prefer: { tsid: GIMBAP_BOP, x: 5, y: 6 } }), { tsid: GIMBAP_BOP, x: 5, y: 6 });
    assert.deepEqual(qi.safeWayOut(engine, { prefer: { tsid: EZ, x: 5, y: 6 } }), HECHEY);
    assert.deepEqual(qi.safeWayOut(engine, { prefer: { tsid: 'GHVOD0F3T403694', x: 5, y: 6 } }), HECHEY, 'another colour level');
    assert.equal(qi.deadEndStreet(ORANGIAN, engine), true);
    assert.equal(qi.deadEndStreet(EZ, engine), true);
    assert.equal(qi.deadEndStreet(HECHEY.tsid, engine), null);
  });

  it("the puzzle card's way back and the exit door ask the same rule (features/puzzles-feature.js)", () => {
    const src = read('public/js/features/puzzles-feature.js');
    const done = src.slice(src.indexOf('function complete(engine) {'), src.indexOf('/* Map card'));
    assert.match(done, /const back = noExit\(tsid\) \? wayOut\(engine, tsid\) : save\.returnTo;/);
    const out = src.slice(src.indexOf('function wayOut('), src.indexOf('function rememberReturn('));
    assert.match(out, /!deadEnd\(engine, r\.tsid\)/);
    assert.match(out, /engine\.query\?\.\('safeWayOut', engine, \{ prefer \}\)/);
    const card = src.slice(src.indexOf('function rememberReturn('), src.indexOf('function wayBack('));
    assert.match(card, /deadEnd\(engine, engine\.streetTsid\)/, 'a card taken on a dead end keeps the return it had');
  });
});

describe("/stuck, I'm stuck and the Map card on a puzzle street with no road out (features/puzzles-feature.js)", () => {
  const wired = (opts) => {
    const engine = fakeEngine(opts);
    engine.query = (hook, ...args) => (typeof qi[hook] === 'function' ? qi[hook](...args) : null);
    return engine;
  };
  beforeEach(() => {
    qi.restore({ lastStreet: HECHEY });
    pz.restore({});
  });

  it('answers as a quest room with nothing to fail, so /stuck takes the way out with no cooldown', () => {
    const engine = wired({ tsid: ORANGIAN });
    const here = pz.questRoomHere(engine);
    assert.deepEqual(here, { title: ORANGIAN, solved: true, stray: true, puzzle: true });
    assert.deepEqual(slashPlan('/stuck', { home: { inHome: false }, questRoom: here, stuckWaitMs: 60_000 }), { command: '/stuck', stuck: 'quest-room' });
    for (const t of NO_EXIT_PUZZLE_STREETS) assert.ok(pz.questRoomHere(wired({ tsid: t })), t);
    assert.equal(pz.questRoomHere(wired({ tsid: HECHEY.tsid })), null);
    assert.equal(pz.questRoomHere(wired({ tsid: 'GA96OS42D6F3M9P' })), null, 'Piano Party has its own signposts');
  });

  it('the reported state: from Orangian with the card taken on the practice street, /stuck goes to Ur unsolved', async () => {
    pz.restore({ returnTo: { tsid: EZ, x: 1443, y: 900, card: ORANGIAN } });
    qi.restore({ lastStreet: { tsid: ORANGIAN, x: 100, y: 829 } });
    const engine = wired({ tsid: ORANGIAN });
    assert.equal(await pz.questRoomLeave(engine, { transition: false }), true);
    assert.equal(engine.log.entered[0][0], STRAY_FALLBACK_TSID);
    assert.equal(engine.log.entered[0][1].useTransition, false);
    assert.deepEqual(pz.save().completed, {}, 'never solved');
    assert.equal(pz.save().returnTo, null);
  });

  it('goes back where the card was taken when that is a street of Ur, and a teleport lands on its target', async () => {
    pz.restore({ returnTo: { tsid: GIMBAP_BOP, x: 700, y: 400, card: ORANGIAN } });
    const engine = wired({ tsid: ORANGIAN });
    await pz.questRoomLeave(engine);
    assert.deepEqual(engine.log.entered[0], [GIMBAP_BOP, { spawnX: 700, spawnY: 400, useTransition: true }]);
    const tp = wired({ tsid: 'GDOSHD9J6NT2HUJ' });
    await pz.questRoomLeave(tp, { to: { tsid: 'GLI32G3NUTD100I', x: 1, y: 2 } });
    assert.equal(tp.log.entered[0][0], 'GLI32G3NUTD100I');
    assert.equal(await pz.questRoomLeave(wired({ tsid: HECHEY.tsid })), null, 'nothing to leave on a street of Ur');
  });

  it('/stuck says the puzzle line (features/slash-commands-feature.js)', () => {
    assert.equal(STUCK_TEXT.donePuzzle, "You're off the puzzle street, back where you came in.");
    const src = read('public/js/features/slash-commands-feature.js');
    assert.match(src, /room\?\.puzzle \? STUCK_TEXT\.donePuzzle : room\?\.solved/);
  });

  it("the Map card offers Leave there (the card was the only way back, to more puzzle streets)", () => {
    assert.equal(PUZZLE_LEAVE_TEXT.button('Orangian'), 'Leave Orangian');
    const src = read('public/js/features/puzzles-feature.js');
    const card = src.slice(src.indexOf('function buildMapCard('), src.indexOf('/* QA'));
    assert.match(card, /const stuck = noExitHere\(engine\);/);
    assert.match(card, /addEventListener\('click', \(\) => leavePuzzle\(engine\)\)/);
  });
});

describe('a reload saved on a colour level (G888)', () => {
  beforeEach(() => {
    qi.restore({ lastStreet: HECHEY });
    pz.restore({});
  });

  it('stays there: no level is in progress after a reload, so the EXIT sign shows (dead-ends-feature)', () => {
    // G887 moved you out here; reloadLocation now answers only a G904 hold reloaded in a party space.
    assert.equal(pz.reloadLocation({ tsid: ORANGIAN }, fakeEngine({ tsid: ORANGIAN })), null);
    pz.restore({ returnTo: { tsid: GIMBAP_BOP, x: 700, y: 400, card: ORANGIAN } });
    assert.equal(pz.deadEndRun(fakeEngine({ tsid: ORANGIAN })), null, 'a card mark in the save is no trip this page');
  });

  it('its EXIT (questRoomLeave) still goes back where the card was taken when that is a street of Ur', async () => {
    pz.restore({ returnTo: { tsid: GIMBAP_BOP, x: 700, y: 400, card: ORANGIAN } });
    const engine = fakeEngine({ tsid: ORANGIAN });
    engine.query = (hook, ...args) => (typeof qi[hook] === 'function' ? qi[hook](...args) : null);
    await pz.questRoomLeave(engine);
    assert.equal(engine.log.entered[0][0], GIMBAP_BOP);
  });
});

describe('no Teleportation Point or script on a street that was an instance (features/teleportation-feature.js)', () => {
  it('the source refused saving a point in any instance', () => {
    assert.match(gsjs('players/inc_teleportation.js'), /if \(this\.location\.isInstance\(\) \|\| this\.location\.jobs_is_street_locked\(\)[\s\S]{0,200}You can't save this location as a Teleportation Point\./);
  });

  it('quest room streets, practice streets and colour levels count; Umbra and Ur do not', () => {
    const engine = fakeEngine();
    assert.equal(qi.instanceStreet(ORANGIAN, engine), true);
    assert.equal(qi.instanceStreet(EZ, engine), true);
    assert.equal(qi.instanceStreet('GHFS40864GB396O', engine), true, 'Soil Appreciation');
    assert.equal(qi.instanceStreet('GDOSHD9J6NT2HUJ', engine), null, 'Umbra was a street of its own');
    assert.equal(qi.instanceStreet(HECHEY.tsid, engine), null);
  });

  it('points and scripts ask it', () => {
    const src = read('public/js/features/teleportation-feature.js');
    const fn = src.slice(src.indexOf('function unsavable('), src.indexOf('function quillWorking('));
    assert.match(fn, /engine\.query\?\.\('instanceStreet', engine\.streetTsid, engine\) === true/);
  });
});
