/**
 * Travel + map destination tests against shipped modules.
 * Run: node --test tests/travel.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  planTravel,
  listMapDestinations,
  planSignpostTravel,
  resolveLoadedTsid,
  pickConnection,
  tsidAliases,
} from '../public/js/travel.js?v=g478-1';
import { STREET_INDEX, availableStreetTsids } from '../public/js/street-loader.js?v=g478-1';
import { pickConnection as modelPick, signpostNear, worldToScreen } from '../public/js/street-model.js?v=g478-1';
import { setSignpostHover, signpostBoardAt } from '../public/js/street-render.js?v=g478-1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const streetsDir = join(__dirname, '../public/assets/streets');

function loadStreet(tsid) {
  const meta = STREET_INDEX.streets[tsid];
  return JSON.parse(readFileSync(join(streetsDir, meta.file.replace(/^assets\/streets\//, '')), 'utf8'));
}

describe('tsid alias + resolve', () => {
  it('maps LLI → GLI for loaded geometry files', () => {
    assert.ok(tsidAliases('LLI3272LOTD1B1F').includes('GLI3272LOTD1B1F'));
    const resolved = resolveLoadedTsid('LLI3272LOTD1B1F', availableStreetTsids());
    assert.equal(resolved, 'GLI3272LOTD1B1F');
  });
});

describe('planTravel (shared path)', () => {
  it('travels Hechey Track → Groddle Forest Junction', () => {
    const plan = planTravel(
      'GLI2V0UN7RD1T2J',
      'GLI3272LOTD1B1F',
      STREET_INDEX.streets,
    );
    assert.equal(plan.ok, true);
    assert.equal(plan.toTsid, 'GLI3272LOTD1B1F');
    assert.equal(plan.label, 'Groddle Forest Junction');
    assert.notEqual(plan.fromTsid, plan.toTsid);
  });

  it('accepts L-prefix destination alias', () => {
    const plan = planTravel(
      'GLI2V0UN7RD1T2J',
      'LLI3272LOTD1B1F',
      STREET_INDEX.streets,
    );
    assert.equal(plan.ok, true);
    assert.equal(plan.toTsid, 'GLI3272LOTD1B1F');
  });

  it('rejects already-here', () => {
    const plan = planTravel(
      'GLI2V0UN7RD1T2J',
      'GLI2V0UN7RD1T2J',
      STREET_INDEX.streets,
    );
    assert.equal(plan.ok, false);
    assert.equal(plan.reason, 'already_here');
  });

  it('rejects unloaded destination', () => {
    const plan = planTravel(
      'GLI2V0UN7RD1T2J',
      'LLICFILAMTI11QV',
      STREET_INDEX.streets,
    );
    assert.equal(plan.ok, false);
    assert.equal(plan.reason, 'not_loaded');
  });
});

describe('map destinations', () => {
  it('lists ≥2 loaded streets with labels', () => {
    const dests = listMapDestinations('GLI2V0UN7RD1T2J', STREET_INDEX.streets);
    assert.ok(dests.length >= 2);
    const here = dests.find((d) => d.current);
    assert.ok(here);
    assert.equal(here.tsid, 'GLI2V0UN7RD1T2J');
    assert.match(here.label, /Hechey/i);
    const other = dests.find((d) => d.travelable);
    assert.ok(other);
    assert.equal(other.tsid, 'GLI3272LOTD1B1F');
  });

  it('selecting map destination matches planTravel identity', () => {
    const dests = listMapDestinations('GLI2V0UN7RD1T2J', STREET_INDEX.streets);
    const b = dests.find((d) => d.tsid === 'GLI3272LOTD1B1F');
    assert.ok(b);
    const plan = planTravel('GLI2V0UN7RD1T2J', b.tsid, STREET_INDEX.streets);
    assert.equal(plan.ok, true);
    assert.equal(plan.toTsid, b.tsid);
    assert.equal(plan.label, b.label);
  });
});

describe('signpost travel plan', () => {
  it('finds a valid link from Hechey Track to Junction', () => {
    const street = loadStreet('GLI2V0UN7RD1T2J');
    // Signpost_1 world x=-2852 → screen x
    const pos = worldToScreen(street, -2852, -47);
    const plan = planSignpostTravel(street, pos.x, availableStreetTsids(), 50);
    assert.equal(plan.ok, true);
    assert.equal(plan.toTsid, 'GLI3272LOTD1B1F');
    assert.match(plan.label, /Groddle Forest Junction/i);
  });

  it('pickConnection on Junction signpost returns Hechey Track', () => {
    const street = loadStreet('GLI3272LOTD1B1F');
    let found = null;
    for (const s of street.signposts) {
      const c = pickConnection(s, availableStreetTsids());
      if (c?.tsid === 'GLI2V0UN7RD1T2J') found = c;
      const c2 = modelPick(s, availableStreetTsids());
      if (c2?.tsid === 'GLI2V0UN7RD1T2J') found = c2;
    }
    assert.ok(found);
  });

  it('signpostNear finds post within radius of screen x', () => {
    const street = loadStreet('GLI2V0UN7RD1T2J');
    const pos = worldToScreen(street, 1300, -125);
    const near = signpostNear(street, pos.x, 30);
    assert.ok(near);
    assert.equal(near.signpost.id, 'signpost_4');
  });

  it('targets and highlights only the individual destination board', () => {
    const armAngle = 5.5 * Math.PI / 180;
    const boards = [
      {
        index: 0,
        connection: { tsid: 'A', label: 'Left Road' },
        arm: { tint: 0xffffff },
        glow: { visible: false },
        label: { style: {}, destroyed: false },
        baseFill: 0x221100,
        x: 0,
        y: -160,
        rotation: armAngle,
        hitArea: { x: -120, y: -15, width: 120, height: 30 },
      },
      {
        index: 1,
        connection: { tsid: 'B', label: 'Right Road' },
        arm: { tint: 0xffffff },
        glow: { visible: false },
        label: { style: {}, destroyed: false },
        baseFill: 0x332200,
        x: 0,
        y: -125,
        rotation: -armAngle,
        hitArea: { x: 0, y: -15, width: 140, height: 30 },
      },
    ];
    const view = {
      x: 500,
      y: 400,
      signScale: 0.8,
      signBoards: boards,
      destroyed: false,
    };

    const boardCenter = (board) => {
      const localX = board.hitArea.x + board.hitArea.width / 2;
      const localY = board.hitArea.y + board.hitArea.height / 2;
      const cos = Math.cos(board.rotation);
      const sin = Math.sin(board.rotation);
      return {
        x: view.x + view.signScale * (board.x + localX * cos - localY * sin),
        y: view.y + view.signScale * (board.y + localX * sin + localY * cos),
      };
    };

    const leftPoint = boardCenter(boards[0]);
    const rightPoint = boardCenter(boards[1]);
    assert.equal(signpostBoardAt([view], leftPoint.x, leftPoint.y)?.connection?.tsid, 'A');
    const hit = signpostBoardAt([view], rightPoint.x, rightPoint.y);
    assert.equal(hit?.connection?.tsid, 'B');
    assert.equal(signpostBoardAt([view], 500, 400), null, 'the bare post is inert');

    setSignpostHover(view, true, hit.index);
    assert.equal(boards[0].glow.visible, false);
    assert.equal(boards[1].glow.visible, true);
    assert.equal(boards[1].label.style.fill, undefined, 'the lettering keeps its colour');
    setSignpostHover(view, false);
    assert.equal(boards[1].glow.visible, false);
  });
});
