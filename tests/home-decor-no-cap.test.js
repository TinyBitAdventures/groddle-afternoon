/**
 * A room holds any number of furniture pieces, as Glitch (Austin 2026-11-25, chat 11-24: "My house
 * just told me I couldn't put anything more in it"). config_base.js home_limits (213-236) limits
 * only floors, walls and the yard, and inc_homes.js counts no furniture; the remake had refused the
 * 161st piece and dropped every piece past 160 when a save loaded (fa855a2). Here: hundreds placed,
 * saved, loaded again and shown to a visitor, all kept; the site's visit answer carries them all
 * (src/Neighbours.php homesSlice, HOME_BUDGET), the stacks set on them (STACKS_MAX) and the boxes
 * among them (src/LedgerBoxes.php BOXES_MAX).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FURNITURE_CATALOG } from '../public/js/homes-catalog.js?v=0367f90f';
import { createHomeDecorState, interiorWidth, normalizeHomeDecorState, placeFurniture, renderOrder } from '../public/js/home-decor.js?v=31f37d9b';
import { createFloorsState } from '../public/js/home-floors.js?v=459925ff';
import { normalizeOwnerStacks } from '../public/js/neighbours-mp.js?v=e44a14e5';
import { visitorHomeState } from '../public/js/features/homes-feature.js?v=3a2f9342';
import { HAS_SITE, SITE_DIR } from '../tools/repos.mjs';

const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

const CLASSES = Object.keys(FURNITURE_CATALOG).filter((c) => !['furniture_chassis', 'furniture_tower_chassis', 'furniture_door'].includes(c));

/** A room with n pieces placed from the pack, the classes in turn, spread along it. */
function furnished(n) {
  const state = createHomeDecorState({});
  const inv = Object.fromEntries(CLASSES.map((c) => [c, 999]));
  const span = Math.max(200, interiorWidth(state) - 200);
  for (let i = 0; i < n; i++) {
    const res = placeFurniture(state, inv, CLASSES[i % CLASSES.length], { x: 100 + ((i * 37) % span) });
    assert.equal(res.ok, true, `piece ${i + 1}: ${res.msg}`);
  }
  return state;
}

/** The save as the game writes it and reads it back. */
const saved = (state) => JSON.parse(JSON.stringify(state));

describe('a room holds any number of pieces (Glitch had no furniture cap)', () => {
  const room = furnished(600);

  it('600 pieces place, none refused as full', () => {
    assert.equal(room.placed.length, 600);
    assert.equal(new Set(room.placed.map((r) => r.id)).size, 600);
  });

  it('saved and loaded again (normalize) keeps all 600, as they were', () => {
    const back = normalizeHomeDecorState(saved(room));
    assert.equal(back.placed.length, 600);
    assert.deepEqual(back.placed.map((r) => [r.id, r.classTsid]), room.placed.map((r) => [r.id, r.classTsid]));
    assert.ok(back.nextId > Math.max(...room.placed.map((r) => r.id)));
    assert.equal(renderOrder(back).length, 600);
  });

  it('a second load is the same (nothing trimmed on the way round)', () => {
    const once = normalizeHomeDecorState(saved(room));
    assert.equal(normalizeHomeDecorState(saved(once)).placed.length, 600);
  });

  it('an upper floor keeps 450 pieces', () => {
    const floors = createFloorsState({ upper: [saved(furnished(450))] }, room);
    assert.equal(floors.upper[0].placed.length, 450);
  });

  it("a visitor's view of the house keeps all 600 (visitorHomeState)", () => {
    const v = visitorHomeState({ owner: { id: 7, name: 'Bo' }, home: { owned: true, style: 'meadow' }, homes: { decor: saved(room) } });
    assert.equal(v.decor.placed.length, 600);
  });

  it("a visitor sees 1000 stacks the owner set in one room (normalizeOwnerStacks, the site's STACKS_MAX)", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: `s${i}`, place: 'house', c: 'apple', n: 1, x: i, y: -40 }));
    assert.equal(normalizeOwnerStacks(rows).length, 1000);
  });
});

describe('the site sends a house with many pieces whole', { skip: skipSite }, () => {
  // The state goes in on stdin (a big house is past one argument's 128 KB).
  const php = (body, input = '') => {
    const code = `foreach (["WordFilter", "Neighbours"] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\Neighbours; $in = json_decode(file_get_contents('php://stdin'), false); ${body}`;
    return JSON.parse(execFileSync('php', ['-r', code], { input, maxBuffer: 64 * 1024 * 1024 }).toString());
  };
  const stateWith = (decor) => ({ systems: { features: { homes: { decor, cult: { items: [] }, backYard: {} } } } });

  it('homesSlice carries 600 pieces, and 2000', () => {
    for (const n of [600, 2000]) {
      const state = stateWith(saved(furnished(n)));
      const out = php("$h = Neighbours::homesSlice($in); echo json_encode(['n' => $h === null ? -1 : count($h->decor->placed)]);", JSON.stringify(state));
      assert.equal(out.n, n);
    }
  });

  it('past HOME_BUDGET the visit is refused with its own words, never sent short', () => {
    const src = readFileSync(join(SITE_DIR, 'src', 'Neighbours.php'), 'utf8');
    const budget = Number(/HOME_BUDGET = (\d+);/.exec(src)?.[1]);
    const perPiece = JSON.stringify(furnished(200).placed).length / 200;
    assert.ok(budget / perPiece >= 8000, `HOME_BUDGET holds ${Math.floor(budget / perPiece)} pieces`);
    assert.match(src, /'too_full' => new RestError\('groddle_home_too_full', self::TEXT_TOO_FULL/);
    assert.match(src, /return 'too_full';/);
  });

  it("the yard and machine answers leave the furniture out (homesSlice(\\$state, false))", () => {
    const out = php("$h = Neighbours::homesSlice($in, false); echo json_encode(['decor' => isset($h->decor), 'cult' => isset($h->cult)]);", JSON.stringify(stateWith(saved(furnished(50)))));
    assert.deepEqual(out, { decor: false, cult: true });
    for (const f of ['HomeYard.php', 'HomeMachines.php']) {
      assert.match(readFileSync(join(SITE_DIR, 'src', f), 'utf8'), /Neighbours::homesSlice\(\$state, false\)/, f);
    }
  });

  it('stackRows lists 1000 stacks in a room, and the boxes query is not bounded at 200', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: `s${i}`, classTsid: 'apple', count: 1, x: i, y: -40, on: 3 }));
    const out = php('echo json_encode(count(Neighbours::stackRows($in, null)));', JSON.stringify({ streets: { RH_HOME_INT: rows } }));
    assert.equal(out, 1000);
    const boxes = readFileSync(join(SITE_DIR, 'src', 'LedgerBoxes.php'), 'utf8');
    assert.doesNotMatch(boxes, /LIMIT 200/);
    assert.ok(Number(/BOXES_MAX = (\d+);/.exec(boxes)?.[1]) >= 2000);
  });
});
