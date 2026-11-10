/**
 * Street art fixes (js/street-fixes.js, features/street-fixes-feature.js): small mends to Tiny
 * Speck's street art, kept out of the street files and listed with their reason.
 * Run: node --test tests/street-fixes.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STREET_FIXES, applyStreetFixes, streetFixFor } from '../public/js/street-fixes.js?v=536481c5';
import { STREET_FIXES_FEATURE_ID, streetFixesFeature } from '../public/js/features/street-fixes-feature.js?v=39e41b46';
import { FEATURES } from '../public/js/features/index.js?v=aa7e2acb';

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
