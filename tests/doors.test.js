/**
 * Doors, ladders, walls and hidden signposts restored from the archived
 * location XML (build-street-navigation.mjs + js/location-navigation.js),
 * and the door rules in js/doors.js.
 * Run: node --test tests/doors.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractLocationNavigation,
  buildStreetNavigation,
  arrivalInTarget,
} from '../public/js/location-navigation.js?v=38c12adf';
import {
  DOOR_KEYS,
  DOOR_TEXT,
  KEY_DROP,
  checkDoorEntry,
  doorAt,
  doorDestination,
  doorKeyClass,
  doorSubtitle,
  doorTooltip,
  keyDropDue,
  normalizeDoorState,
  visibleDoors,
} from '../public/js/doors.js?v=eb9510b1';
import {
  barriersScreen,
  blockBarrierCrossing,
  climbWallsWorld,
  navigableSignposts,
} from '../public/js/street-model.js?v=606bae73';

const here = dirname(fileURLToPath(import.meta.url));
const street = (tsid) =>
  JSON.parse(readFileSync(join(here, `../public/assets/streets/${tsid}.json`), 'utf8'));

const XML = `<game_object tsid="GTEST" label="Test">
	<object id="dynamic">
		<int id="l">-1000</int>
		<int id="r">1000</int>
		<int id="t">-800</int>
		<int id="b">0</int>
		<object id="layers">
			<object id="middleground">
				<object id="signposts">
					<object id="signpost_1">
						<int id="x">-900</int>
						<int id="y">-60</int>
						<object id="connects">
							<object id="0">
								<objref id="target" tsid="LOTHER" label="Other Street"/>
								<int id="x">400</int>
								<int id="y">-95</int>
								<bool id="hidden">true</bool>
							</object>
							<object id="1">
								<objref id="target" tsid="LGONE" label="Lost Street"/>
								<int id="x">10</int>
								<int id="y">-10</int>
								<bool id="hidden">false</bool>
							</object>
						</object>
					</object>
				</object>
				<object id="doors">
					<object id="door_1">
						<int id="key_id">7</int>
						<object id="connect">
							<objref id="target" tsid="LOTHER" label="Other Street"/>
							<str id="hub_id">66</str>
							<int id="x">-300</int>
							<int id="y">-130</int>
							<bool id="hidden">false</bool>
						</object>
						<null id="owner_label"/>
						<bool id="is_locked">true</bool>
						<int id="w">197</int>
						<int id="requires_level">0</int>
						<str id="house_number">12</str>
						<object id="deco">
							<str id="sprite_class">zutto_door_asset_wooden_door_lock</str>
							<int id="h">166</int>
							<int id="w">197</int>
						</object>
						<int id="x">380</int>
						<int id="y">-168</int>
						<int id="h">166</int>
					</object>
					<object id="door_2">
						<object id="connect">
							<objref id="target" tsid="LGTEST" label="Self"/>
							<int id="x">0</int>
							<int id="y">0</int>
							<bool id="hidden">true</bool>
						</object>
						<int id="x">0</int>
						<int id="y">-20</int>
						<int id="w">50</int>
						<int id="h">100</int>
					</object>
					<object id="door_3">
						<object id="destinations">
							<str id="0">LOTHER</str>
							<str id="1">LGONE</str>
						</object>
						<int id="x">-500</int>
						<int id="y">-20</int>
						<int id="w">60</int>
						<int id="h">120</int>
					</object>
				</object>
				<object id="ladders">
					<object id="ladder_1">
						<int id="y">-141</int>
						<int id="w">50</int>
						<int id="h">593</int>
						<int id="x">167</int>
					</object>
				</object>
				<object id="walls">
					<object id="wall_1">
						<int id="y">-417</int>
						<null id="pc_perm"/>
						<int id="w">0</int>
						<int id="h">378</int>
						<int id="x">-600</int>
					</object>
					<object id="wall_2">
						<int id="y">-300</int>
						<int id="pc_perm">0</int>
						<int id="h">300</int>
						<int id="x">600</int>
					</object>
				</object>
				<object id="boxes">
					<object id="box_1">
						<int id="x">268</int>
						<int id="y">-23</int>
						<int id="w">200</int>
						<int id="h">532</int>
						<str id="id">key_drop</str>
					</object>
				</object>
			</object>
		</object>
	</object>
</game_object>`;

const OTHER = {
  tsid: 'GOTHER',
  bounds: { l: -500, r: 500, t: -600, b: 0 },
  platforms: [{ x1: -500, y1: -128, x2: 500, y2: -128 }],
};

describe('location navigation extraction', () => {
  const nav = extractLocationNavigation(XML);

  it('reads doors with deco, key, house number, connect and random destinations', () => {
    assert.equal(nav.doors.length, 3);
    const [door, hidden, random] = nav.doors;
    assert.equal(door.sprite, 'zutto_door_asset_wooden_door_lock');
    assert.equal(door.key_id, 7);
    assert.equal(door.house_number, '12');
    assert.deepEqual([door.x, door.y, door.w, door.h], [380, -168, 197, 166]);
    assert.equal(door.connect.tsid, 'LOTHER');
    assert.equal(door.connect.hub_id, '66');
    assert.deepEqual([door.connect.x, door.connect.y], [-300, -130]);
    assert.equal(hidden.connect.hidden, true);
    assert.deepEqual(random.destinations, ['LOTHER', 'LGONE']);
  });

  it('reads ladders, walls with pc_perm, boxes and signpost connect flags', () => {
    assert.deepEqual(nav.ladders, [{ id: 'ladder_1', x: 167, y: -141, w: 50, h: 593 }]);
    assert.deepEqual(nav.walls.map((w) => w.pc_perm), [null, 0]);
    assert.deepEqual(nav.boxes, [{ key: 'box_1', id: 'key_drop', x: 268, y: -23, w: 200, h: 532 }]);
    assert.deepEqual(nav.signposts[0].connects.map((c) => c.hidden), [true, false]);
  });

  it('builds screen-space doors with an arrival on the target platform', () => {
    const json = {
      bounds: { l: -1000, r: 1000, t: -800, b: 0 },
      signposts: [{ id: 'signpost_1', connects: [{ tsid: 'LOTHER', label: 'Other Street' }, { tsid: 'LGONE', label: 'Lost Street' }] }],
    };
    const resolve = (tsid) => (tsid.slice(1) === 'OTHER' ? { key: 'GOTHER', street: OTHER } : null);
    const out = buildStreetNavigation(json, nav, resolve);
    const [door, hidden, random] = out.doors;
    assert.deepEqual([door.x, door.y], [1380, 632]);
    assert.equal(door.is_locked, true);
    assert.equal(door.connect.street, 'GOTHER');
    // connect x/y -300,-130 → screen 200, platform -128 → 472
    assert.deepEqual(door.connect.arrive, { x: 200, y: 472 });
    assert.equal(hidden.hidden, true);
    assert.deepEqual(random.destinations, [{ tsid: 'LOTHER', street: 'GOTHER' }, { tsid: 'LGONE', street: null }]);
    assert.deepEqual(out.boxes[0], { key: 'box_1', id: 'key_drop', x: 1268, y: 777, w: 200, h: 532 });
    const [shown, lost] = out.signposts[0].connects;
    assert.equal(shown.hidden, true);
    assert.deepEqual(shown.arrive, { x: 900, y: 472 });
    assert.equal(lost.hidden, undefined);
    assert.equal(lost.arrive, undefined);
  });

  it('keeps a raw arrival when no platform is near and rejects points off the street', () => {
    assert.deepEqual(arrivalInTarget(OTHER, 0, -400), { x: 500, y: 200, snapped: false });
    assert.equal(arrivalInTarget(OTHER, 4000, -100), null);
  });
});

describe('imported street navigation data', () => {
  it('restores the locked Level 2 West door to Oppidan Avenue (key 7)', () => {
    const level2 = street('GHH1011JSO11ORS');
    const [door] = level2.doors;
    assert.equal(door.sprite, 'zutto_door_asset_wooden_door_lock');
    assert.equal(door.key_id, 7);
    assert.equal(door.connect.street, 'GDOHDJ84BST2UI2');
    assert.ok(door.connect.arrive.x > 230 && door.connect.arrive.x < 320);
    const oppidan = street('GDOHDJ84BST2UI2');
    assert.ok(oppidan.doors.some((d) => d.connect?.street === 'GHH1011JSO11ORS'));
  });

  it('restores Game of Crowns ladders and Corridor One’s key_drop box', () => {
    const crowns = street('GHFFV931FRF3TMS');
    assert.equal(crowns.ladders.length, 5);
    const corridor = street(KEY_DROP.street);
    assert.ok(corridor.boxes.some((b) => b.id === KEY_DROP.box));
  });

  it('hides every connect on Market St, so its posts are not shown', () => {
    const market = street('GLI104NPBDC1DC2');
    assert.ok(market.signposts.every((s) => s.connects.every((c) => c.hidden)));
    assert.equal(navigableSignposts(market.signposts).length, 0);
  });
});

describe('door rules', () => {
  const locked = {
    x: 500, y: 600, w: 120, h: 160, key_id: 7, requires_level: 0, is_locked: true, hidden: false,
    connect: { tsid: 'LDOHDJ84BST2UI2', label: 'Oppidan Avenue', street: 'GDOHDJ84BST2UI2', arrive: { x: 268, y: 836 } },
  };

  it('follows the source order: destination, level, key', () => {
    assert.deepEqual(checkDoorEntry(locked, { destination: null }), { ok: false, code: 'not_working', msg: DOOR_TEXT.broken });
    const dest = doorDestination(locked);
    assert.equal(checkDoorEntry({ ...locked, requires_level: 9 }, { level: 3, destination: dest }).msg,
      'You must be level 9 or higher to pass through this door.');
    assert.equal(checkDoorEntry(locked, { destination: dest }).msg, 'You need the correct key to unlock this door.');
    const ok = checkDoorEntry(locked, { destination: dest, hasKey: (c) => c === 'door_key_7' });
    assert.deepEqual(ok, { ok: true, consumeKey: 'door_key_7' });
    assert.deepEqual(checkDoorEntry({ ...locked, key_id: 0, is_locked: false }, { destination: dest }), { ok: true, consumeKey: null });
  });

  it('resolves connect doors to their arrival and random doors to an imported pick', () => {
    assert.deepEqual(doorDestination(locked), { street: 'GDOHDJ84BST2UI2', label: 'Oppidan Avenue', arrive: { x: 268, y: 836 } });
    const random = { destinations: [{ tsid: 'LA', street: 'GA' }, { tsid: 'LB', street: null }, { tsid: 'LC', street: 'GC' }] };
    assert.equal(doorDestination(random, { rng: () => 0.99 }).street, 'GC');
    assert.equal(doorDestination(random, { current: 'GA', rng: () => 0 }).street, 'GC');
    assert.equal(doorDestination({ connect: { tsid: 'LGONE', label: 'Room 8', street: null } }), null);
  });

  it('names the destination, owner and key', () => {
    assert.equal(doorTooltip({ connect: { label: 'Apt 3' }, owner_label: 'Bumbishfish' }), 'Apt 3 · Owned by Bumbishfish');
    assert.equal(doorTooltip({ connect: { label: 'Bumbishfish’s House' }, owner_label: 'Bumbishfish' }), 'Bumbishfish’s House');
    assert.equal(doorSubtitle(locked), 'Locked: needs a Yellow-Teal Square Key');
    assert.equal(doorSubtitle(locked, { hasKey: () => true }), 'Unlock with a Yellow-Teal Square Key');
  });

  it('covers all twelve keys and maps key_id N to door_key_N', () => {
    assert.equal(Object.keys(DOOR_KEYS).length, 12);
    assert.equal(doorKeyClass(12), 'door_key_12');
    assert.equal(DOOR_KEYS[1].label, 'Yellow-Purple Triangle Key');
  });

  it('finds the door in front of the avatar and skips hidden ones', () => {
    const doors = [locked, { ...locked, x: 560, hidden: true }];
    assert.equal(doorAt(doors, 530, 600), locked);
    assert.equal(doorAt(doors, 900, 600), null);
    assert.deepEqual(visibleDoors({ doors }), [locked]);
  });

  it('drops one door_key_1 a day in Corridor One’s box, only with none in the pack', () => {
    const boxes = [{ id: 'key_drop', x: 2168, y: 977, w: 200, h: 532 }];
    const ctx = { street: KEY_DROP.street, boxes, x: 2170, y: 900, day: '2026-10-19', hasKey: false };
    assert.equal(keyDropDue(normalizeDoorState(), ctx), true);
    assert.equal(keyDropDue({ keyDropDay: '2026-10-19' }, ctx), false);
    assert.equal(keyDropDue(normalizeDoorState(), { ...ctx, hasKey: true }), false);
    assert.equal(keyDropDue(normalizeDoorState(), { ...ctx, x: 1500 }), false);
    assert.equal(keyDropDue(normalizeDoorState(), { ...ctx, street: 'GOTHER' }), false);
  });
});

describe('ladders, walls and signposts at runtime', () => {
  const base = { bounds: { l: -1000, r: 1000, t: -800, b: 0 }, platforms: [], layers: [] };

  it('turns source ladders into climb zones without doubling a restored one', () => {
    const ladders = [{ id: 'l1', x: 167, y: -141, w: 50, h: 593 }];
    const zones = climbWallsWorld({ ...base, ladders });
    assert.deepEqual(zones.map((z) => [z.x, z.y, z.h, z.source]), [[167, -734, 593, 'ladder']]);
    const restored = climbWallsWorld({ ...base, ladders, walls: [{ id: 'l1', x: 167, y: -734, h: 593, w: 50 }] });
    assert.equal(restored.length, 1);
  });

  it('blocks walking through a solid wall and respects one-way pc_perm', () => {
    const barriers = barriersScreen({
      ...base,
      barriers: [
        { id: 'solid', x: -600, y: -417, h: 378, pc_perm: null },
        { id: 'open', x: 600, y: -300, h: 300, pc_perm: 0 },
        { id: 'oneway', x: 0, y: -300, h: 300, pc_perm: 1 },
      ],
    });
    assert.equal(barriers.length, 2);
    // solid wall at screen x 400, spanning y 383..761; feet at 700
    assert.equal(blockBarrierCrossing(barriers, 390, 410, 700), 399);
    assert.equal(blockBarrierCrossing(barriers, 410, 390, 700), 401);
    // above the wall: no block
    assert.equal(blockBarrierCrossing(barriers, 390, 410, 300), 410);
    // pc_perm 1 lets you through walking right, not left
    assert.equal(blockBarrierCrossing(barriers, 990, 1010, 780), 1010);
    assert.equal(blockBarrierCrossing(barriers, 1010, 990, 780), 1001);
  });

  it('drops hidden connects and posts left with none', () => {
    const posts = navigableSignposts([
      { id: 'a', connects: [{ tsid: 'L1', hidden: true }, { tsid: 'L2' }] },
      { id: 'b', connects: [{ tsid: 'L3', hidden: true }] },
      { id: 'c', connects: [] },
    ]);
    assert.deepEqual(posts.map((p) => [p.id, p.connects.map((c) => c.tsid)]), [['a', ['L2']]]);
  });
});

describe('barriersScreen follows walls opened at runtime', () => {
  it('drops a wall once its pc_perm becomes 0 and brings it back', async () => {
    const { barriersScreen } = await import('../public/js/street-model.js?v=606bae73');
    const street = { bounds: { l: 0, t: 0, r: 1000, b: 500 }, barriers: [{ id: 'w', x: 100, y: 0, h: 200, pc_perm: null }] };
    assert.equal(barriersScreen(street).length, 1);
    street.barriers[0].pc_perm = 0;
    assert.equal(barriersScreen(street).length, 0);
    street.barriers[0].pc_perm = null;
    assert.equal(barriersScreen(street).length, 1);
  });
});
