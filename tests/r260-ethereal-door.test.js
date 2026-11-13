/**
 * Report #260: Doonboggle Trail's locked door (door_1343415170600, Door Key 1) answered "You can't
 * do that yet" to a player holding the key, because the island's travel gate (newxp-feature.js
 * travelGate) let only the six island streets through and Ethereal Endeavour was not one of them.
 * Glitch's hub 129 (Gentle Island) lists it (inc_data_maps_prod.js 17711) and the door's only rule
 * was the key (locations/inc_locked_doors.js 48-62, used up at 80-85).
 * Run: node --test tests/r260-ethereal-door.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENTLE_ISLAND_TSIDS } from '../public/js/newxp.js?v=7712f77d';
import { DOONBOGGLE_KEY, DOONBOGGLE_TSID, ETHEREAL_TSID } from '../public/js/rebuilt-rooms.js?v=8c2eaf24';

const here = dirname(fileURLToPath(import.meta.url));
const gsjsPath = join(here, '../../glitch-GameServerJS/inc_data_maps_prod.js');

describe('report #260: the door to Ethereal Endeavour', () => {
  it('Ethereal Endeavour is a Gentle Island street, so the island gate lets the key holder through', () => {
    assert.ok(GENTLE_ISLAND_TSIDS.includes(DOONBOGGLE_TSID));
    assert.ok(GENTLE_ISLAND_TSIDS.includes(ETHEREAL_TSID));
    assert.equal(DOONBOGGLE_KEY, 1);
  });

  it('hub 129 lists it in the source', { skip: !existsSync(gsjsPath) }, () => {
    const src = readFileSync(gsjsPath, 'utf8');
    const hub = src.slice(src.indexOf('"LA94GCF7H3D30IM"\t: "Doonboggle Trail"') - 400, src.indexOf('"LA94GCF7H3D30IM"\t: "Doonboggle Trail"') + 400);
    assert.match(hub, /"LA9EKMN138D3QK2"\t: "Ethereal Endeavour"/);
  });

  it('the gate refuses only streets off the island', () => {
    const feature = readFileSync(join(here, '../public/js/features/newxp-feature.js'), 'utf8');
    assert.match(feature, /save\.stage === 'island' && save\.island !== 'exited' && !GENTLE_ISLAND_TSIDS\.includes\(tsid\)/);
  });
});
