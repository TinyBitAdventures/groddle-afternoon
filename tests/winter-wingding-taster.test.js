/**
 * G180: the Glitchmas Cracker's Winter Wingding taster pack.
 * catalog_drop_tables.js:1352-1354 glitchmas_cracker row 88 gives one
 * party_pack_taster_winter_wingding (rolls 87 and 88 of randInt(0, 100):
 * 2 in 101); party_pack_taster_winter_wingding.js party_id "glitchmas",
 * party_pack activate() 10 minutes for a taster.
 * Run: node --test tests/winter-wingding-taster.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DROP_TABLES, DROP_ITEMS } from '../public/js/drop-tables-data.js?v=c51a6400';
import { rollDropTable } from '../public/js/drop-tables.js?v=0f922478';
import { CRACKER } from '../public/js/seasons.js?v=fcb12a83';
import { PARTY_PACKS, PARTY_SPACES, isPartyPack, partyPackDurationSeconds } from '../public/js/party-spaces.js?v=6fea0ad5';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const pub = join(root, 'public');
const TASTER = 'party_pack_taster_winter_wingding';
/** rng value that makes randInt(0, 100) return `n`. */
const rollOf = (n) => () => (n + 0.5) / 101;

describe('Glitchmas Cracker row 88 (catalog_drop_tables.js:1352-1354)', () => {
  it('sits in the cracker table between Rainbow Juice (86) and Hairball (90)', () => {
    const rows = DROP_TABLES.glitchmas_cracker.rows;
    const i = rows.findIndex(([threshold]) => threshold === 88);
    assert.ok(i > 0, 'row 88 is missing');
    assert.deepEqual(rows[i][1], [{ item: TASTER, count: 1 }]);
    assert.deepEqual(rows[i - 1], [86, [{ item: 'potion_rainbow_juice', count: 1 }]]);
    assert.deepEqual(rows[i + 1], [90, [{ item: 'essence_of_hairball', count: 1 }]]);
    assert.equal(rows.length, 20);
    assert.equal(rows.at(-1)[0], 100);
    assert.equal(DROP_ITEMS[TASTER].label, 'Winter Wingding Party Pack Taster');
  });

  it('pays the taster on rolls 87 and 88 only (2 in 101)', () => {
    const hits = [];
    for (let n = 0; n <= 100; n++) {
      const r = rollDropTable('glitchmas_cracker', rollOf(n));
      if (r.items.some((it) => it.classTsid === TASTER)) hits.push(n);
    }
    assert.deepEqual(hits, [87, 88]);
    assert.deepEqual(rollDropTable('glitchmas_cracker', rollOf(88)).items, [{ classTsid: TASTER, qty: 1, table: 'glitchmas_cracker' }]);
  });

  it('is the table a cracker pull rolls (seasons-feature.js pullCracker)', () => {
    assert.equal(CRACKER.table, 'glitchmas_cracker');
    const src = readFileSync(join(pub, 'js/features/seasons-feature.js'), 'utf8');
    assert.match(src, /rollDropTable\(CRACKER\.table, sleepyRng\)/);
    assert.match(src, /payDrop\(engine, result, \{ source: 'glitchmas_cracker' \}\)/);
  });
});

describe('the taster pack opens a 10-minute Winter Wingding', () => {
  it('is a party pack for the glitchmas space, unsold (party_id "glitchmas")', () => {
    assert.equal(isPartyPack(TASTER), true);
    const pack = PARTY_PACKS[TASTER];
    assert.equal(pack.template, 'glitchmas');
    assert.equal(pack.taster, true);
    assert.equal(pack.label, 'Winter Wingding Party Pack Taster');
    assert.equal(pack.baseCost, 200);
    assert.equal(pack.storePrice, null);
    assert.equal(partyPackDurationSeconds(TASTER), 600);
  });

  it('has its space, street, art and icons', () => {
    const space = PARTY_SPACES.glitchmas;
    assert.equal(space.label, 'Winter Wingding');
    assert.equal(space.streetTsid, 'GDOOS17UPNJ2HT7');
    assert.ok(existsSync(join(pub, `assets/streets/${space.streetTsid}.json`)));
    assert.ok(existsSync(join(pub, `assets/sprites/icons/${TASTER}.png`)));
    assert.ok(existsSync(join(pub, `assets/sprites/icons/${TASTER}@3x.png`)));
  });

  it('the item inventory finds the cracker drop on its own, with no override (G183 dropTableReach)', () => {
    const overrides = JSON.parse(readFileSync(join(root, 'tools/inventory/overrides.json'), 'utf8'));
    assert.equal(overrides[`item:${TASTER}`], undefined);
  });
});
