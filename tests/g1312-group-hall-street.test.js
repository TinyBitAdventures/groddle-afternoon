/**
 * G1312 (Austin 2026-11-25, G331, G1301): Archimedes Acres's Group Hall has its own street, open
 * to its group's members, entered from the hall's lot. Glitch: the finished hall job's target
 * street (LA51318ODPB2UF7 for job 692) was named after the group and its signpost opened
 * (quest.js 1831-1863); a group's location let in members only, anyone else heard "The location
 * is the property of <b>...</b>, and you are not a member." (inc_pols.js pols_canEnter 286-349,
 * inc_houses.js 500). No hall street survives, so it is laid on Fanfoot Flare with the Community
 * Machine Room hut the video PUzIKuL2tPo shows (js/group-hall-street.js).
 *
 * The realtime server's side (the join gate) is groddle-afternoon-server group_hall_streets_test.go.
 *
 * Run: node --test tests/g1312-group-hall-street.test.js
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ARCHIMEDES_HALL,
  HALL_LAYOUT,
  HALL_STREET_JOBS,
  HALL_STREET_TEXT,
  HALL_TEMPLATE_TSID,
  hallEntry,
  hallLabel,
  hallStreetEcology,
  hallStreetJob,
} from '../public/js/group-hall-street.js?v=fa1921ad';
import { OPEN_HALL_STREETS, hallStreetOpen } from '../public/js/group-hall-lot.js?v=045c799a';
import { HALL_TEXT } from '../public/js/street-jobs-mp.js?v=ed23d5b4';
import { enterHall, enterVerb, groupHallStreetFeature as F, resetGroupHallStreet } from '../public/js/features/group-hall-street-feature.js?v=59e2a499';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=e9221d85';
import { ladderTopDeck } from '../public/js/street-model.js?v=a9a05f9d';

const root = join(import.meta.dirname, '..');
const read = (rel) => JSON.parse(readFileSync(join(root, 'public', rel), 'utf8'));
const catalog = read('assets/content/street-jobs.json');
const index = read('assets/streets/index.json');
const HALL = 'GA51318ODPB2UF7';
const LOT = 'GLI32N0F1UD114O';
const street = read(`assets/streets/${HALL}.json`);
const template = read(`assets/streets/${HALL_TEMPLATE_TSID}.json`);

describe('the hall street (js/group-hall-street.js, tools/build-rebuilt-rooms.mjs)', () => {
  it('is written by the builder and is what --check expects', () => {
    const out = execFileSync(process.execPath, ['tools/build-rebuilt-rooms.mjs', '--check'], { cwd: root, encoding: 'utf8' });
    assert.match(out, /stale: nothing/);
  });

  it('is hall job 692\'s own target street, in the street index, as Glitch numbered it', () => {
    assert.equal(catalog.halls.jobs['692'].street, HALL);
    assert.equal(catalog.halls.jobs['692'].connecting[0], LOT);
    assert.equal(ARCHIMEDES_HALL.tsid, HALL);
    assert.equal(ARCHIMEDES_HALL.lot, LOT);
    assert.equal(index.streets[HALL].file, `assets/streets/${HALL}.json`);
    assert.equal(index.streets[HALL].hubName, 'Groddle Meadow');
    assert.equal(hallStreetJob(HALL), '692');
    assert.equal(hallStreetJob(`L${HALL.slice(1)}`), '692');
    assert.equal(hallStreetJob(LOT), '');
  });

  it('only the built halls\' lots lead in; the others still say their street comes later', () => {
    assert.deepEqual([...OPEN_HALL_STREETS].sort(), Object.keys(HALL_STREET_JOBS).sort());
    assert.equal(hallStreetOpen('692'), true);
    assert.equal(hallStreetOpen('694'), false);
  });

  it('is laid on Fanfoot Flare: its ground and layers, no hidden box, one signpost back to Archimedes Acres', () => {
    assert.equal(street.bounds.l, template.bounds.l);
    for (const p of template.platforms) assert.ok(street.platforms.some((q) => q.id === p.id && q.x1 === p.x1 && q.y2 === p.y2), p.id);
    assert.deepEqual(street.layers.map((l) => l.name), template.layers.map((l) => l.name));
    assert.equal(street.boxes, undefined);
    assert.equal(street.signposts.length, 1);
    const [sign] = street.signposts;
    assert.equal(sign.id, HALL_LAYOUT.signId);
    assert.deepEqual(sign.connects, [{ tsid: `L${LOT.slice(1)}`, label: 'Archimedes Acres', hub_id: '58', arrive: { ...ARCHIMEDES_HALL.lotOut } }]);
    const lot = read(`assets/streets/${LOT}.json`);
    const out = arrivalInTarget(lot, ARCHIMEDES_HALL.lotOut.x + lot.bounds.l, ARCHIMEDES_HALL.lotOut.y + lot.bounds.t - 4);
    assert.ok(out?.snapped, 'the way out lands on Archimedes Acres\'s floor');
  });

  it('has the Community Machine Room hut on its middle tier, a roof to stand on and a ladder up to it', () => {
    const mg = street.layers.find((l) => l.name === 'middleground');
    const hut = mg.decos.find((d) => d.sprite === 'community_machine_room_ext');
    assert.ok(hut, 'the hut');
    assert.equal(hut.x, HALL_LAYOUT.hut.x);
    const roof = street.platforms.find((p) => p.id === 'plat_group_hall_roof');
    assert.ok(roof && roof.y1 === hut.y - 353, 'the roof line as on Middle Valley Clearing');
    const [ladder] = street.ladders;
    assert.ok(ladder.x > roof.x1 && ladder.x < roof.x2, 'the ladder ends over the roof');
    const top = ladderTopDeck(street.platforms, ladder.x, ladder.y - ladder.h, ladder.y);
    assert.equal(top, roof.y1, 'Up at the ladder\'s top steps onto the roof');
    // Its foot on the middle tier, not the lower path.
    assert.ok(ladder.y < -200 && ladder.y > -300, `ladder foot ${ladder.y}`);
  });

  it('lands you beside its signpost on the upper ledge, on the floor', () => {
    const at = arrivalInTarget(street, ARCHIMEDES_HALL.inside.x + street.bounds.l, ARCHIMEDES_HALL.inside.y + street.bounds.t - 4);
    assert.ok(at?.snapped);
    assert.ok(Math.abs(ARCHIMEDES_HALL.inside.x + street.bounds.l - street.signposts[0].x) < 150, 'beside the signpost');
  });

  it('has nothing living or growing on it (no ecology row survives)', () => {
    assert.deepEqual(hallStreetEcology(HALL).counts, {});
    assert.equal(hallStreetEcology(LOT), null);
    assert.deepEqual(F.ecologyOverride({ tsid: HALL }).counts, {});
  });
});

describe('who may go in (hallEntry, pols_canEnter)', () => {
  const owner = { owned: true, group: { id: 3, name: 'Experimental Builder' } };
  it('members of the owning group only, with Glitch\'s words for anyone else', () => {
    assert.deepEqual(hallEntry({ mp: true, online: true, owner, myGroups: [9, 3] }), { ok: true });
    assert.deepEqual(hallEntry({ mp: true, online: true, owner, myGroups: [9] }), { ok: false, why: 'member', text: 'The location is the property of Experimental Builder, and you are not a member.' });
    assert.equal(hallEntry({ mp: true, online: true, owner: { owned: true, group: { id: 4, name: 'A Private Group' } }, myGroups: [] }).text, 'The location is the property of A Private Group, and you are not a member.');
  });
  it('nobody before it is built, offline, in solo, or before the groups list has come', () => {
    assert.equal(hallEntry({ mp: true, online: true, owner: null, myGroups: [3] }).why, 'unbuilt');
    assert.equal(hallEntry({ mp: true, online: true, owner: { owned: false, group: owner.group }, myGroups: [3] }).why, 'unbuilt');
    assert.equal(hallEntry({ mp: true, online: false, owner, myGroups: [3] }).why, 'offline');
    assert.equal(hallEntry({ mp: false, online: true, owner, myGroups: [3] }).why, 'solo');
    assert.equal(hallEntry({ mp: true, online: true, owner, myGroups: null }).why, 'checking');
  });
  it('words it plainly, with no em dash', () => {
    const all = [HALL_STREET_TEXT.notMember('X'), HALL_STREET_TEXT.notBuilt, HALL_STREET_TEXT.solo, HALL_STREET_TEXT.offline, HALL_STREET_TEXT.checking, HALL_STREET_TEXT.enterTip('X'), HALL_TEXT.openStreet, HALL_TEXT.builtOpen('X', 'Y'), HALL_TEXT.finishedOpen('X', 'Y')];
    for (const t of all) assert.ok(!t.includes('—') && !/Glitch/.test(t), t);
    assert.equal(hallLabel('Experimental Builder'), "Experimental Builder's Group Hall");
    assert.equal(hallLabel('A Private Group'), "A Private Group's Group Hall");
    assert.equal(hallLabel(''), 'A Group Hall');
  });
});

describe('the feature (features/group-hall-street-feature.js)', () => {
  let engine;
  let client;
  let listeners;
  let owner;
  let groups;
  const emit = (type, msg) => { for (const fn of listeners.get(type) || []) fn(msg); };
  beforeEach(() => {
    resetGroupHallStreet();
    listeners = new Map();
    owner = { owned: true, group: { id: 3, name: 'Experimental Builder' } };
    groups = [3];
    client = {
      state: 'online',
      wanted: HALL,
      joins: [],
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
      join(j) { this.joins.push(j); },
    };
    engine = {
      mode: 'multiplayer',
      streetTsid: LOT,
      player: { x: 100, y: 900, vx: 3, vy: 1, facing: 'right' },
      data: {},
      toasts: [],
      trips: [],
      enters: [],
      setData(k, v) { this.data[k] = v; },
      toast(t) { this.toasts.push(t); },
      travel(tsid, meta) { this.trips.push([tsid, meta]); },
      enter(tsid, opts) { this.enters.push([tsid, opts]); this.streetTsid = tsid; },
      snapCamera() {},
      query(hook, ...args) {
        if (hook === 'realtimeClient') return client;
        if (hook === 'groupHallOwner') return args[0] === '692' ? owner : null;
        if (hook === 'myGroupIds') return groups;
        if (hook === 'groupHallLotSpot') return this.lotSpot && args[0] === '692' ? this.lotSpot : null;
        return null;
      },
    };
  });

  it('the lot\'s verb walks a member in beside the hall\'s signpost, named for the group', () => {
    assert.deepEqual(enterVerb('Experimental Builder'), { id: 'enter', label: 'enter', enabled: true, tooltip: "Go into Experimental Builder's Group Hall", durationMs: 0 });
    assert.equal(enterHall(engine, '692'), true);
    assert.deepEqual(engine.trips, [[HALL, { label: "Experimental Builder's Group Hall", arrive: { ...ARCHIMEDES_HALL.inside }, via: 'door' }]]);
  });

  it('refuses a non-member with Glitch\'s words, and every other way in too (the Map, a teleport)', () => {
    groups = [9];
    assert.equal(enterHall(engine, '692'), false);
    assert.deepEqual(engine.trips, []);
    assert.deepEqual(engine.toasts, ['The location is the property of Experimental Builder, and you are not a member.']);
    assert.equal(engine.data.groupHallLast, 'refused:member');
    assert.deepEqual(F.travelGate(HALL, engine, {}), { ok: false, msg: 'The location is the property of Experimental Builder, and you are not a member.' });
    assert.equal(F.travelGate(LOT, engine, {}), null, 'other streets are not its business');
    groups = [3];
    assert.equal(F.travelGate(HALL, engine, {}), null);
    engine.mode = 'solo';
    assert.equal(F.travelGate(HALL, engine, {}).msg, HALL_STREET_TEXT.solo);
  });

  it('names the street after its group (quest.js 1849-1854)', () => {
    const s = { tsid: HALL, label: 'A Group Hall' };
    F.prepareStreet(s, engine);
    assert.equal(s.label, "Experimental Builder's Group Hall");
    owner = null;
    const t = { tsid: HALL, label: 'x' };
    F.prepareStreet(t, engine);
    assert.equal(t.label, 'A Group Hall');
    const other = { tsid: LOT, label: 'Archimedes Acres' };
    F.prepareStreet(other, engine);
    assert.equal(other.label, 'Archimedes Acres');
  });

  it('the way out (its signpost) stands you at the lot once the lot is placed', () => {
    engine.streetTsid = HALL;
    assert.equal(F.enterGate(`L${LOT.slice(1)}`, engine), null);
    engine.streetTsid = LOT;
    F.onStreetEnter({ tsid: LOT }, engine);
    F.onTick(16, 0, engine);
    assert.equal(engine.player.x, 100, 'the lot is not placed yet');
    engine.lotSpot = { x: 1340, y: 900 };
    F.onTick(16, 0, engine);
    assert.deepEqual([engine.player.x, engine.player.y, engine.player.vx], [1340, 900, 0]);
    assert.equal(engine.data.groupHallLast, 'lot:692');
  });

  it('a reload in the hall starts on Archimedes Acres, at the lot', () => {
    assert.deepEqual(F.reloadLocation({ tsid: HALL, x: 2000, y: 700 }), { tsid: LOT, x: ARCHIMEDES_HALL.lotOut.x, y: ARCHIMEDES_HALL.lotOut.y });
    assert.equal(F.reloadLocation({ tsid: LOT, x: 1, y: 2 }), null);
  });

  it('the server\'s refusal walks you out to the lot with its words; one refusal on a new socket waits for the groups list', () => {
    engine.streetTsid = HALL;
    F.onTick(16, 0, engine); // binds the client
    const words = 'The location is the property of Experimental Builder, and you are not a member.';
    // A member's join before the groups list reached the server: wait, then join again.
    emit('error', { code: 'hall_members', message: words });
    assert.deepEqual(engine.enters, []);
    emit('msg:groups_status', { groups: [3] });
    assert.equal(client.joins.length, 1);
    assert.equal(client.joins[0].street, HALL);
    // Refused again: out to the lot.
    emit('error', { code: 'hall_members', message: words });
    assert.deepEqual(engine.enters, [[LOT, { spawnX: ARCHIMEDES_HALL.lotOut.x, spawnY: ARCHIMEDES_HALL.lotOut.y }]]);
    assert.deepEqual(engine.toasts, [words]);
    // Other errors are not its business.
    emit('error', { code: 'homes', message: 'x' });
    assert.equal(engine.enters.length, 1);
  });

  it('a non-member\'s refusal (or leaving the group inside) sends you out at once', () => {
    engine.streetTsid = HALL;
    groups = [];
    F.onTick(16, 0, engine);
    emit('error', { code: 'hall_members', message: 'no' });
    assert.equal(engine.enters.length, 1);
    engine.streetTsid = HALL;
    emit('msg:hall_out', { job: '692', text: 'The location is the property of Experimental Builder, and you are not a member.' });
    assert.equal(engine.enters.length, 2);
    assert.equal(engine.data.groupHallLast, 'out:692');
    emit('msg:hall_out', { job: '692', text: 'x' });
    assert.equal(engine.enters.length, 2, 'not in the hall any more: nothing to do');
  });

  it('R46: a trip out that fails (engine.enter false) leaves nothing waiting for the lot', async () => {
    engine.streetTsid = HALL;
    engine.enter = function enter(tsid, opts) { this.enters.push([tsid, opts]); return Promise.resolve(false); };
    F.onTick(16, 0, engine);
    emit('msg:hall_out', { job: '692', text: 'out' });
    assert.equal(engine.enters.length, 1);
    await new Promise((r) => setImmediate(r));
    // Still in the hall; a later visit to the lot street is not pulled to the lot.
    engine.streetTsid = LOT;
    engine.lotSpot = { x: 1340, y: 900 };
    F.onTick(16, 0, engine);
    assert.equal(engine.player.x, 100);
    assert.equal(engine.data.groupHallLast, 'out:692');
  });
});
