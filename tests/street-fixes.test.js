/**
 * Street art fixes (js/street-fixes.js, features/street-fixes-feature.js): small mends to Tiny
 * Speck's street art, kept out of the street files and listed with their reason.
 * Run: node --test tests/street-fixes.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STREET_FIXES, applyStreetFixes, streetFixFor } from '../public/js/street-fixes.js?v=ec61843c';
import { LADDER_GAP_FIXES } from '../public/js/ladder-gap-fixes.js?v=6da8a701';
import { findLadderGaps, LADDER_ART, LADDER_PIECE } from '../tools/ladder-gaps.mjs';
import { vineTiles } from '../public/js/tower-rooms.js?v=4f1f6af7';
import { STREET_FIXES_FEATURE_ID, streetFixesFeature } from '../public/js/features/street-fixes-feature.js?v=06e9f5a2';
import { FEATURES } from '../public/js/features/index.js?v=3703a202';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const street = (tsid) => JSON.parse(readFileSync(join(pub, 'assets/streets', `${tsid}.json`), 'utf8'));
const middle = (s) => s.layers.find((l) => l.id === 'middleground');
/** A deco row's vertical reach: y is its bottom edge. */
const span = (d) => [d.y - d.h, d.y];

describe('the fixes table', () => {
  it('every fix names a shipped street, says why, and adds only decos whose art ships', () => {
    for (const [tsid, fix] of Object.entries(STREET_FIXES)) {
      assert.ok(existsSync(join(pub, 'assets/streets', `${tsid}.json`)), tsid);
      assert.ok(fix.why && fix.why.length > 20, `${tsid} why`);
      assert.ok(fix.decos.length > 0, `${tsid} decos`);
      const ids = new Set();
      for (const d of fix.decos) {
        assert.match(d.id, /^fix_g\d+_/, `${tsid} deco ids name their register row`);
        assert.ok(!ids.has(d.id), d.id);
        ids.add(d.id);
        assert.ok(existsSync(join(pub, 'assets/decos/groddle', `${d.sprite}.webp`)), `${d.sprite} art`);
        for (const k of ['x', 'y', 'w', 'h', 'z', 'r']) assert.ok(Number.isFinite(d[k]), `${d.id} ${k}`);
      }
    }
    assert.equal(streetFixFor('NOPE'), null);
  });

  it('the street files stay as the source has them: a fix is added at load, once', () => {
    for (const tsid of Object.keys(STREET_FIXES)) {
      const s = street(tsid);
      const before = middle(s).decos.length;
      assert.ok(!middle(s).decos.some((d) => String(d.id || '').startsWith('fix_')), `${tsid} file holds no fix`);
      assert.equal(applyStreetFixes(s), STREET_FIXES[tsid].decos.length);
      assert.equal(applyStreetFixes(s), 0, 'not twice');
      assert.equal(middle(s).decos.length, before + STREET_FIXES[tsid].decos.length);
    }
    assert.equal(applyStreetFixes({ tsid: 'GTJ102GGGJK1VDO', layers: [] }), 0);
    assert.equal(applyStreetFixes(null), 0);
  });
});

describe("Harbinger Heath's leftmost ladder (report #161, G615)", () => {
  const TSID = 'GTJ102GGGJK1VDO';
  const rungsOn = (s, ladder) => middle(s).decos
    .filter((d) => /^ladder_(interior_\dsteps|int_step)$/.test(d.sprite) && Math.abs(d.x - ladder.x) <= 2)
    .map(span)
    .sort((a, b) => a[0] - b[0]);
  /** The longest stretch of a ladder's height that no rung piece covers. */
  const widestGap = (s, ladder) => {
    let gap = 0;
    const spans = rungsOn(s, ladder);
    for (let i = 1; i < spans.length; i++) gap = Math.max(gap, spans[i][0] - spans[i - 1][1]);
    return gap;
  };

  it('the source leaves 52 px without rungs, and the fix is one more of the same step', () => {
    const s = street(TSID);
    const ladder = s.ladders.find((l) => l.id === 'ladder_1300532628840');
    assert.ok(ladder, 'the ladder is still in the street file');
    assert.equal(widestGap(s, ladder), 52);
    applyStreetFixes(s);
    assert.equal(widestGap(s, ladder), 0);
    const step = middle(s).decos.find((d) => d.id === 'fix_g615_ladder_step');
    const own = middle(s).decos.find((d) => d.sprite === 'ladder_int_step' && !d.id);
    assert.deepEqual([step.sprite, step.x, step.w, step.h], [own.sprite, own.x, own.w, own.h]);
    // Inside the climb zone, which always covered the whole height.
    assert.ok(step.y <= ladder.y && step.y - step.h >= ladder.y - ladder.h);
  });
});

describe('the feature', () => {
  it('is registered, and mends the street before it is built', () => {
    assert.ok(FEATURES.includes(streetFixesFeature));
    assert.equal(streetFixesFeature.id, STREET_FIXES_FEATURE_ID);
    const ids = FEATURES.map((f) => f.id);
    assert.ok(ids.indexOf(STREET_FIXES_FEATURE_ID) < ids.indexOf('street-objects'));
    const s = street('GTJ102GGGJK1VDO');
    streetFixesFeature.prepareStreet(s);
    assert.ok(middle(s).decos.some((d) => d.id === 'fix_g615_ladder_step'));
    let data = null;
    streetFixesFeature.onStreetEnter(s, { setData: (k, v) => { data = [k, v]; } });
    assert.deepEqual(data, ['streetFixes', '1']);
    const plain = street('GLI3272LOTD1B1F');
    streetFixesFeature.prepareStreet(plain);
    streetFixesFeature.onStreetEnter(plain, { setData: (k, v) => { data = [k, v]; } });
    assert.deepEqual(data, ['streetFixes', '0']);
  });
});

describe('the missing steps of loose-piece ladders (#381, G826, tools/ladder-gaps.mjs)', () => {
  const root = join(pub, '..');
  const files = readdirSync(join(pub, 'assets/streets')).filter((n) => /^G.*\.json$/.test(n));

  it('the generated table is current, names shipped streets and art, and mends only middleground ladders', () => {
    execFileSync(process.execPath, [join(root, 'tools/ladder-gaps.mjs'), '--check'], { cwd: root, stdio: 'pipe' });
    const ids = new Set();
    for (const [tsid, rows] of Object.entries(LADDER_GAP_FIXES)) {
      assert.ok(existsSync(join(pub, 'assets/streets', `${tsid}.json`)), tsid);
      assert.ok(!STREET_FIXES[tsid], `${tsid}: a hand fix and generated steps would both apply`);
      for (const d of rows) {
        assert.match(d.id, /^fix_g826_ladder_/, d.id);
        assert.ok(!ids.has(d.id), d.id);
        ids.add(d.id);
        assert.match(d.sprite, LADDER_PIECE);
        assert.ok(LADDER_ART[d.sprite], d.sprite);
        assert.ok(existsSync(join(pub, 'assets/decos/groddle', `${d.sprite}.webp`)), `${d.sprite} art`);
        for (const k of ['x', 'y', 'w', 'h', 'z', 'r']) assert.ok(Number.isFinite(d[k]), `${d.id} ${k}`);
      }
    }
    assert.ok(Object.keys(LADDER_GAP_FIXES).length >= 20);
  });

  it('every street has its ladders whole once its fixes are added (and only ladder pieces were added)', () => {
    let withGaps = 0;
    for (const f of files) {
      const s = JSON.parse(readFileSync(join(pub, 'assets/streets', f), 'utf8'));
      if (findLadderGaps(s).length) withGaps += 1;
      const before = middle(s)?.decos?.length ?? 0;
      const added = applyStreetFixes(s);
      if (middle(s)) assert.equal(middle(s).decos.length, before + added);
      assert.deepEqual(findLadderGaps(s).map((g) => `${g.ladder.id} ${Math.round(g.top)}..${Math.round(g.bottom)}`), [], s.tsid);
    }
    assert.ok(withGaps >= 20, String(withGaps));
  });

  it('Peatland Moors: the four ladders of the report get their missing step, the street\'s own centre piece', () => {
    const s = street('GLICF642CTI16R1');
    const gaps = findLadderGaps(s);
    assert.deepEqual(gaps.map((g) => [g.ladder.x, Math.round(g.bottom - g.top)]).sort((a, b) => a[0] - b[0]), [[1243, 48], [1469, 39], [2162, 39], [2403, 46]]);
    applyStreetFixes(s);
    const steps = middle(s).decos.filter((d) => String(d.id).startsWith('fix_g826_'));
    assert.equal(steps.length, 4);
    for (const d of steps) {
      assert.equal(d.sprite, 'ladder_tile_center_01_bogwood');
      const own = middle(s).decos.find((o) => o.sprite === d.sprite && !o.id);
      assert.equal(d.w, own.w);
      // Each fills its gap exactly: the step's bottom is the piece below's top.
      const gap = gaps.find((g) => g.ladder.id === d.id.replace(/^fix_g826_|_\d+$/g, ''));
      assert.ok(Math.abs(d.y - gap.bottom) < 0.1 && Math.abs(d.y - d.h - gap.top) < 0.1, d.id);
    }
  });
});

describe('the rebuilt tower rooms draw their ladders whole (#381, G826)', () => {
  it('Room 4 and the Mezzanine (ladder()), Rooms 8 and 15 (vineTiles) need no mend', () => {
    for (const tsid of ['GIF1Q6PMN7123NQ', 'GIFGJ2246R72LJL', 'GIF1FHA10312KLV', 'GIF1G7Q75312T8B']) {
      const s = street(tsid);
      assert.deepEqual(findLadderGaps(s).map((g) => Math.round(g.bottom - g.top)), [], tsid);
      assert.ok(!LADDER_GAP_FIXES[tsid], tsid);
    }
    // Room 4's corridor ladder: the 3-step pieces, then the centre pieces that reach its cap.
    const room4 = middle(street('GIF1Q6PMN7123NQ')).decos;
    assert.equal(room4.filter((d) => d.sprite === 'ladder_tile_center_01_interior').length, 2);
  });

  it('vineTiles reaches the cap exactly, in steps of at most 120 px', () => {
    const rows = vineTiles(1000, 470);
    assert.equal(rows.length, 5);
    assert.equal(rows[0].y, 1000);
    const last = rows.at(-1);
    assert.ok(Math.abs(last.y - (last.h - 2) - 470) < 0.2, JSON.stringify(last));
    for (const r of rows) assert.ok(r.h - 2 <= 120);
    assert.deepEqual(vineTiles(400, 470), []);
  });
});

