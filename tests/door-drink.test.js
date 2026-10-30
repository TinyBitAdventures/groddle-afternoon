/**
 * G123: Door Drink and the portal group (js/door-drink.js +
 * features/door-drink-feature.js).
 * Source: glitch-GameServerJS items/potion_chris.js, items/portal.js,
 * groups/portal.js, config_prod.js portal_group.
 * Run: node --test tests/door-drink.test.js
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DELETE_AFTER_MS,
  DOOR_DRINK,
  DOOR_DRINK_COPY,
  DOOR_DRINK_USES,
  PORTAL_SHEET,
  addPortal,
  bumpDropLocation,
  canEnter,
  canPour,
  createPortalGroup,
  normalizePortalGroup,
  portalsOn,
  prunePortals,
  useDoorDrink,
} from '../public/js/door-drink.js';
import { doorDrinkFeature, completePour } from '../public/js/features/door-drink-feature.js';
import { FEATURES } from '../public/js/features/index.js?v=registry-316';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(ROOT, '../glitch-GameServerJS');
const hasGsjs = existsSync(join(GSJS, 'items/potion_chris.js'));
const A = 'GLI2V0UN7RD1T2J';
const B = 'GCR10NQRPKJ16H6';
const C = 'GCR101LVKUJ1EQU';

describe('the source', () => {
  it('copies the potion and portal rules', { skip: !hasGsjs }, () => {
    const potion = readFileSync(join(GSJS, 'items/potion_chris.js'), 'utf8');
    assert.match(potion, /"points_capacity"\s*: "3"/);
    assert.ok(potion.includes(`"pour_tooltip"\t: "${DOOR_DRINK_COPY.pourTooltip}"`));
    assert.ok(potion.includes(DOOR_DRINK_COPY.cantPour.replace("'", "\\'")));
    assert.match(potion, /pc\.location\.pols_is_pol\(\) \|\|\s*pc\.location\.isInstance\(\) \|\|\s*pc\.location\.isInHell\(\)/);
    const portal = readFileSync(join(GSJS, 'items/portal.js'), 'utf8');
    assert.ok(portal.includes(DOOR_DRINK_COPY.noDestination.replace("'", "\\'")));
    assert.ok(portal.includes(`"tooltip"\t\t\t: "${DOOR_DRINK_COPY.enterTooltip}"`));
    const group = readFileSync(join(GSJS, 'groups/portal.js'), 'utf8');
    assert.match(group, /\(10\*1000\)/);
    assert.match(group, /signpost\.signpost_x - 100: signpost\.signpost_x \+ 100/);
    assert.match(readFileSync(join(GSJS, 'config_prod.js'), 'utf8'), /var portal_group = 'RIFQS6N3PLH2TL4';/);
    assert.equal(DOOR_DRINK_USES, 3);
  });

  it('has the portal sheet art', () => {
    assert.ok(existsSync(join(ROOT, 'public', PORTAL_SHEET.url)));
    assert.equal(PORTAL_SHEET.closed.length + PORTAL_SHEET.opening.length + PORTAL_SHEET.open.length + PORTAL_SHEET.closing.length, 37);
  });
});

describe('the portal group', () => {
  it('pairs the newest door with the one before it, both ways', () => {
    const g = createPortalGroup();
    const p1 = addPortal(g, { tsid: A, x: 100, y: 500 }, 1000);
    assert.equal(canEnter(g.portals[p1]).ok, false);
    assert.equal(canEnter(g.portals[p1]).msg, DOOR_DRINK_COPY.noDestination);
    const p2 = addPortal(g, { tsid: B, x: 300, y: 700 }, 2000);
    assert.equal(g.active, p2);
    assert.deepEqual(g.portals[p2].target, { tsid: A, x: 100, y: 500 });
    assert.deepEqual(g.portals[p1].target, { tsid: B, x: 300, y: 700 });
    assert.equal(g.portals[p1].deleteAt, 0, 'the previous active door stays');
  });

  it('a third door retires the first 10 s after it was made', () => {
    const g = createPortalGroup();
    const p1 = addPortal(g, { tsid: A, x: 1, y: 1 }, 0);
    const p2 = addPortal(g, { tsid: B, x: 2, y: 2 }, 5000);
    const p3 = addPortal(g, { tsid: C, x: 3, y: 3 }, 60_000);
    assert.equal(g.portals[p1].deleteAt, DELETE_AFTER_MS);
    assert.deepEqual(g.portals[p1].target, { tsid: C, x: 3, y: 3 });
    assert.deepEqual(g.portals[p2].target, { tsid: C, x: 3, y: 3 });
    assert.deepEqual(g.portals[p3].target, { tsid: B, x: 2, y: 2 });
    assert.deepEqual(prunePortals(g, 60_000), [p1]);
    assert.deepEqual(Object.keys(g.portals), [p2, p3]);
    assert.deepEqual(portalsOn(g, C).map((p) => p.id), [p3]);
  });

  it('nudges a door off a signpost toward the street middle', () => {
    assert.deepEqual(bumpDropLocation(450, -100, [{ x: 400, y: -120 }]), { x: 300, y: -100 });
    assert.deepEqual(bumpDropLocation(-450, -100, [{ x: -400, y: -120 }]), { x: -300, y: -100 });
    assert.deepEqual(bumpDropLocation(450, -400, [{ x: 400, y: -120 }]), { x: 450, y: -400 });
  });

  it('refuses homes, instances and Hell', () => {
    assert.deepEqual(canPour({}), { ok: true });
    for (const k of ['inHome', 'inInstance', 'inHell']) assert.equal(canPour({ [k]: true }).msg, DOOR_DRINK_COPY.cantPour);
    assert.equal(canPour({ dead: true }).msg, DOOR_DRINK_COPY.dead);
  });

  it('a bottle holds three pours, then the next one starts full', () => {
    const g = createPortalGroup();
    const inv = { [DOOR_DRINK]: 2 };
    assert.deepEqual(useDoorDrink(g, inv), { ok: true, consumed: false, usesLeft: 2 });
    useDoorDrink(g, inv);
    assert.deepEqual(useDoorDrink(g, inv), { ok: true, consumed: true, usesLeft: 3 });
    assert.equal(inv[DOOR_DRINK], 1);
    assert.equal(useDoorDrink(g, { [DOOR_DRINK]: 0 }).ok, false);
  });

  it('normalizes the saved group', () => {
    const g = normalizePortalGroup({ active: 'p9', seq: 2, bottleUses: 7, portals: { p1: { tsid: A, x: 1.4, y: 2, target: { tsid: 'bad tsid' } }, x: { tsid: A } } });
    assert.deepEqual(g, { version: 1, active: null, seq: 2, bottleUses: 3, portals: { p1: { tsid: A, x: 1, y: 2, createdAt: 0, deleteAt: 0, target: null } } });
  });
});

describe('the feature', () => {
  beforeEach(() => doorDrinkFeature._reset());

  function engineAt(tsid, x, y, extra = {}) {
    const log = { activity: [], counters: [], entered: [] };
    const engine = {
      inv: { [DOOR_DRINK]: 1 },
      player: { x, y },
      streetTsid: tsid,
      street: { hubId: '58', bounds: { l: -3000, t: -1000 }, signposts: [] },
      homeContext: () => ({ inHome: false }),
      transientInstance: () => false,
      inScene: () => false,
      pushActivity: (m) => log.activity.push(m),
      toast: () => {},
      achievement: (c, n) => log.counters.push([c, n]),
      refreshPack: () => {},
      save: () => {},
      setData: () => {},
      enter: (t, o) => log.entered.push([t, o]),
      travelGate: () => ({ ok: true }),
      ...extra,
    };
    return { engine, log };
  }

  it('is in the registry and offers Pour with the uses left', () => {
    assert.ok(FEATURES.some((f) => f.id === doorDrinkFeature.id));
    const { engine } = engineAt(A, 100, 200);
    const [v] = doorDrinkFeature.packVerbs(DOOR_DRINK, engine);
    assert.deepEqual([v.id, v.label, v.enabled], ['pour', 'Pour', true]);
    assert.match(v.tooltip, /^Open a door to adventure · 3 of 3 left$/);
    const home = engineAt(A, 1, 1, { homeContext: () => ({ inHome: true }) }).engine;
    assert.equal(doorDrinkFeature.packVerbs(DOOR_DRINK, home)[0].reason, DOOR_DRINK_COPY.cantPour);
  });

  it('pours a door in street coordinates, counts the potion and pairs two doors across streets', () => {
    const first = engineAt(A, 100, 200);
    const p1 = completePour(first.engine, 1000);
    assert.deepEqual(first.log.counters[0], ['potions_used:potion_chris', 1]);
    assert.equal(first.log.activity.at(-1), 'You poured a Door Drink.');
    const second = engineAt(B, 400, 600);
    const p2 = completePour(second.engine, 2000);
    const { group } = doorDrinkFeature._state();
    assert.deepEqual(group.portals[p1].target, { tsid: B, x: 400, y: 600 });
    assert.equal(group.bottleUses, 1);
    // Enter the new door (no sprite here): straight through to the first.
    doorDrinkFeature._enterDoor(second.engine, p2);
    assert.deepEqual(second.log.entered, [[A, { spawnX: 100, spawnY: 200, teleport: true }]]);
    const verbs = doorDrinkFeature.verbsFor({ classId: 'portal', portalId: p1 });
    assert.deepEqual(verbs.map((x) => [x.id, x.enabled]), [['enter', true]]);
  });

  it('locks the avatar while pouring', () => {
    const { engine } = engineAt(A, 0, 0);
    doorDrinkFeature.runPackVerb(DOOR_DRINK, 'pour', engine);
    assert.deepEqual(doorDrinkFeature.physics(), { speed: 0, jump: 0 });
  });
});
