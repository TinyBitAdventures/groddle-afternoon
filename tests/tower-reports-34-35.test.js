/**
 * Player reports 34 and 35 (2026-11-01), the abandoned towers:
 * - 34: a locked door shows the keyhole of the key that opens it (the deco's
 *   showLock(key_id), DoorView.as 243-244), not all twelve stacked.
 * - 35a: a lift has no arm back to the street you stand on (the client's
 *   Vator Corp panel greyed that button out, LocationSelectorDialog.as
 *   showElevator; ordinary posts never point at their own street).
 * - 35b: the floors' crates and barrels on the walk line can be stood on, as
 *   the archived Gregarious lobby and basement made theirs; the nearer ones
 *   draw in front of the avatar, as the lobby's middleplus ones do.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOOR_LOCK_ART, doorLockArt } from '../public/js/door-lock-art.js?v=e656851c';
import { navigableSignposts } from '../public/js/street-model.js?v=505d8990';
import { applyStreetIndex, loadStreetDataFromFs } from '../public/js/street-loader.js?v=33d2b8bc';
import { TOWERS, TOWER_FLOORS, TOWER_NEAR_BASE, TOWER_STANDABLE, towerFloorLayout, towerPropPlatforms, towerProps } from '../public/js/tower-floors.js?v=3d1ad8b7';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(spike, 'public');
const streetsDir = join(pub, 'assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));
const body = (tsid) => String(tsid).slice(1);
const plan = JSON.parse(readFileSync(join(spike, 'tools/deco-pipeline/door-locks.json'), 'utf8'));

describe('report 34: a lock shows its own key', () => {
  it('Gregarious Towers Basement: the Red-Green Triangle Key door draws key 5\'s lock', () => {
    const door = street('GDONEDVHC4030KF').doors.find((d) => d.key_id);
    assert.deepEqual([door.sprite, door.key_id], ['door_asset_apartment_door_lock', 5]);
    const file = doorLockArt(door.sprite, door.key_id);
    assert.equal(file, 'assets/decos/door-locks/door_asset_apartment_door_lock__key5@1.5x.webp');
    assert.ok(existsSync(join(pub, file)));
  });

  it('every keyed door with a rendered lock deco has its key\'s file, and nothing else is shipped', () => {
    const want = new Set();
    for (const f of readdirSync(streetsDir)) {
      if (!f.endsWith('.json') || f === 'index.json') continue;
      for (const d of JSON.parse(readFileSync(join(streetsDir, f), 'utf8')).doors || []) {
        if (!d.sprite || plan.skipped[d.sprite]) continue;
        // An unlocked door of a lock deco: key 0, chains and keyholes hidden (hideLock()).
        const k = d.key_id && d.is_locked !== false ? d.key_id : d.sprite.endsWith('_lock') ? 0 : null;
        if (k === null) continue;
        want.add(`${d.sprite}__key${k}@1.5x.webp`);
        assert.ok(doorLockArt(d.sprite, k), `${f} ${d.id}`);
      }
    }
    const shipped = new Set(readdirSync(join(pub, 'assets/decos/door-locks')));
    assert.deepEqual([...shipped].sort(), [...want].sort());
    assert.equal(Object.values(DOOR_LOCK_ART).flat().length, want.size);
  });

  it('an unlocked lock door hides its chains and keyholes (DoorView.as 245-247 hideLock)', () => {
    const door = street('GIFGKHHCIE33LTF').doors.find((d) => d.id === 'door_1352924833378');
    assert.equal(door.connect.label, 'Distant End');
    assert.equal(door.key_id, 0);
    const file = doorLockArt(door.sprite, 0);
    assert.equal(file, 'assets/decos/door-locks/door_asset_heights_door_lock__key0@1.5x.webp');
    assert.ok(existsSync(join(pub, file)));
  });

  it('a door with no key, or a key with no file, keeps the plain deco', () => {
    assert.equal(doorLockArt('door_asset_apartment_door_lock', 0), null);
    assert.equal(doorLockArt('door_asset_apartment_door_lock', 11), null);
    assert.equal(doorLockArt('no_such_door', 5), null);
  });

  it('the doors feature draws a locked door from its key\'s file', () => {
    const src = readFileSync(join(pub, 'js/features/doors-feature.js'), 'utf8');
    assert.match(src, /doorLockArt\(door\.sprite, lockKey\)/);
  });
});

describe('report 35a: no lift arm to where you stand', () => {
  it('drops the arm back to this street when the post has others, keeps a one-arm post', () => {
    const lift = { id: 'lift', connects: [{ tsid: 'LAAA', label: 'Here' }, { tsid: 'LBBB', label: 'There' }] };
    assert.deepEqual(navigableSignposts([lift], 'GAAA')[0].connects.map((c) => c.label), ['There']);
    assert.deepEqual(navigableSignposts([lift])[0].connects.length, 2);
    const party = { id: 'p', connects: [{ tsid: 'LAAA', label: 'Here' }] };
    assert.equal(navigableSignposts([party], 'GAAA')[0].connects.length, 1);
  });

  it('every tower lobby and floor, as loaded, lists the other stops only', async () => {
    applyStreetIndex(JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8')));
    for (const t of TOWERS) {
      for (const tsid of [t.lobby, ...t.floors.map((f) => f.tsid)]) {
        const raw = street(tsid);
        const rawLift = raw.signposts.find((s) => s.connects.some((c) => body(c.tsid) === body(tsid)));
        assert.ok(rawLift, `${raw.label}: the source lift lists this street`);
        const data = await loadStreetDataFromFs(tsid, streetsDir);
        const lift = data.signposts.find((s) => s.id === rawLift.id);
        assert.equal(lift.connects.length, rawLift.connects.length - 1, raw.label);
        assert.ok(!lift.connects.some((c) => body(c.tsid) === body(tsid)), raw.label);
      }
    }
  });

  it('GA5134UPLRU29OH: the lobby lift offers floors 1-3, floor 2 offers the lobby, 1 and 3', async () => {
    const labels = async (tsid) => (await loadStreetDataFromFs(tsid, streetsDir)).signposts[0].connects.map((c) => c.label).sort();
    assert.deepEqual(await labels('GA5134UPLRU29OH'), ['Gregarious Towers, floor 1', 'Gregarious Towers, floor 2', 'Gregarious Towers, floor 3']);
    assert.deepEqual(await labels('GDOBRNDMU2V2Q34'), ['Gregarious Towers', 'Gregarious Towers, floor 1', 'Gregarious Towers, floor 3']);
  });
});

describe('report 35b: tower crates and barrels', () => {
  it('the archived Gregarious lobby and basement stand you on their crates and barrels (the rule\'s source)', () => {
    const lobby = street('GA5134UPLRU29OH');
    const ids = new Set(lobby.platforms.map((p) => p.id));
    for (const id of ['plat_1336418407239', 'plat_1336429009349', 'plat_1336429009354']) assert.ok(ids.has(id), id);
    const basement = new Set(street('GDONEDVHC4030KF').platforms.map((p) => p.id));
    for (const id of ['plat_1336067451644', 'plat_1336067451641', 'plat_1336067451643', 'plat_1336067451645']) assert.ok(basement.has(id), id);
  });

  for (const f of TOWER_FLOORS) {
    const layout = towerFloorLayout(f);
    if (!layout) continue;
    it(`${f.label}: each crate or barrel on the walk line has a platform on top; nearer ones draw in front`, () => {
      const s = street(f.tsid);
      const y = f.arrive.y;
      const plats = towerPropPlatforms(layout, y);
      for (const p of plats) assert.ok(s.platforms.some((q) => q.id === p.id && q.y1 === p.y1 && q.pc_perm === -1), p.id);
      const front = new Set(s.layers.find((l) => l.name === 'middleplus').decos.map((d) => `${d.sprite}@${d.x}`));
      const props = towerProps(layout, y);
      const hidden = (p) => props.some((q) => q.front && TOWER_STANDABLE[q.sprite] && Math.abs(q.x - p.x) < q.w / 2 && q.y - q.h <= p.y - p.h + 30);
      for (const p of props) {
        if (!TOWER_STANDABLE[p.sprite]) continue;
        if (p.front) {
          assert.ok(front.has(`${p.sprite}@${Math.round(p.x) + 1555}`), `${p.sprite} at ${p.x} drawn in front`);
          assert.ok(!plats.some((q) => q.x1 >= p.x - p.w / 2 && q.x2 <= p.x + p.w / 2 && Math.abs(q.y1 - (p.y - p.h)) < p.h * 0.2), 'no platform on a front crate');
        } else if (hidden(p)) {
          // Behind a nearer crate as tall: no platform, or you would seem to stand on the front one.
          assert.ok(!plats.some((q) => q.x1 < p.x && q.x2 > p.x && Math.abs(q.y1 - (p.y - p.h)) < p.h * 0.2), `${p.sprite} at ${p.x} hidden`);
        } else if (!p.opts.r && p.y - y <= TOWER_NEAR_BASE && !p.stacked) {
          // A crate or barrel on the walk line: a platform over its middle, under its top.
          const top = p.y - p.h;
          assert.ok(plats.some((q) => q.x1 < p.x && q.x2 > p.x && q.y1 > top && q.y1 < top + p.h * 0.2), `${p.sprite} at ${p.x}`);
        }
      }
    });
  }

  it('Gregarious Towers, floor 1: dropped above the crate at x 802 you land on it', () => {
    const s = street('GDOBRLULU2V24DS');
    const plat = s.platforms.find((p) => p.x1 <= 802 && p.x2 >= 802 && p.id.startsWith('plat_tower_crate'));
    assert.ok(plat);
    assert.equal(plat.y1, -196);
    // Its top is about a crate's height above the floor line (-107): a jump reaches it.
    assert.ok(-107 - plat.y1 > 60 && -107 - plat.y1 < 110);
  });
});
