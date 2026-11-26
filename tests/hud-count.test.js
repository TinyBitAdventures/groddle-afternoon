/**
 * #372 (Austin 2026-11-15): a phone's top bar shows iMG, currants and favor side by side in one row,
 * counts over 9,999 shortened on a phone only (17.2K, 110.5K, 1.2M: one decimal, no trailing .0,
 * cut rather than rounded); a desktop window keeps the whole number.
 * Run: node --test tests/hud-count.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUD_COUNT_STEP, HUD_SHORT_OVER, drawHudCount, hudCount, hudCountStep, pickPhoneOverflow, renderTopBar } from '../public/js/ui/topbar.js?v=efebad7d';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

describe('#372 top bar counts on a phone', () => {
  it('shortens over 9,999 to one decimal, no trailing .0, never more than you have', () => {
    const cases = [[17230, '17.2K'], [110510, '110.5K'], [1234567, '1.2M'], [20000, '20K'], [10000, '10K'], [17299, '17.2K'], [999999, '999.9K'], [1_000_000, '1M'], [2_500_000_000, '2.5B']];
    for (const [n, want] of cases) assert.equal(hudCount(n, true), want, String(n));
    assert.equal(HUD_SHORT_OVER, 9999);
    for (const n of [0, 7, 250, 9999]) assert.equal(hudCount(n, true), String(n));
    assert.equal(hudCount('110510', true), '110.5K');
  });

  it('a desktop keeps the number as it was', () => {
    for (const n of [0, 250, 17230, 110510, 1234567]) assert.equal(hudCount(n, false), String(n));
    assert.equal(hudCount(17230), '17230');
  });

  it('the game writes the iMG and the bar currants through it on a phone; the pack and vendor keep the whole number', () => {
    const game = readFileSync(join(PUBLIC, 'game.js'), 'utf8');
    assert.match(game, /drawHudCount\(document, document\.getElementById\('stat-img'\), pc\.imagination, TOUCH_PHONE\);/);
    assert.match(game, /drawHudCount\(document, curEl, cur, TOUCH_PHONE\);\s*const packCur = document\.getElementById\('pack-currants'\);\s*if \(packCur\) packCur\.textContent = cur;/);
  });

  it('favor shortens on a phone only', () => {
    const doc = (phone) => {
      const els = {};
      const node = (id) => (els[id] ||= { id, hidden: true, textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, hasAttribute(k) { return k in this.attrs; }, removeAttribute(k) { delete this.attrs[k]; }, querySelector: () => null });
      return { els, documentElement: { classList: { contains: (c) => phone && c === 'touch-phone' } }, querySelector: () => null, getElementById: node };
    };
    const favor = { name: 'Spriggan', points: 12_345, target: 20_000, icon: 'x.webp' };
    const phone = doc(true);
    renderTopBar(phone, { favor });
    assert.equal(phone.els['stat-favor'].textContent, '12.3K');
    const desk = doc(false);
    renderTopBar(desk, { favor });
    assert.equal(desk.els['stat-favor'].textContent, '12,345');
  });
});

describe('#595 (G1110): a tight phone bar shortens its counts harder before it cuts one', () => {
  it('step 2 shortens from 1,000 up; step 3 drops the decimal from two digits; never more than you have', () => {
    assert.deepEqual({ ...HUD_COUNT_STEP }, { 'counts-k': 2, 'counts-whole': 3 });
    const two = [[1302, '1.3K'], [1000, '1K'], [9999, '9.9K'], [999, '999'], [70212, '70.2K'], [80312, '80.3K'], [1_234_567, '1.2M']];
    for (const [n, want] of two) assert.equal(hudCount(n, 2), want, `2: ${n}`);
    const three = [[1302, '1.3K'], [9999, '9.9K'], [70212, '70K'], [80312, '80K'], [80999, '80K'], [110510, '110K'], [999, '999'], [12_345_678, '12M']];
    for (const [n, want] of three) assert.equal(hudCount(n, 3), want, `3: ${n}`);
    // Step 1 is #372's, unchanged.
    assert.equal(hudCount(1302, 1), '1302');
    assert.equal(hudCount(80312, true), '80.3K');
  });

  it('the phone bar tries each count step before it cuts a count with an ellipsis', () => {
    const tried = [];
    const fitsAt = (ok) => (steps) => { tried.push(steps.join(' ')); return ok(steps); };
    assert.deepEqual(pickPhoneOverflow(fitsAt((s) => s.includes('counts-whole'))), ['chip', 'map', 'make', 'counts-k', 'counts-whole']);
    assert.deepEqual(tried, ['chip map make', 'chip map make counts-k', 'chip map make counts-k counts-whole']);
    assert.deepEqual(pickPhoneOverflow(fitsAt((s) => s.includes('counts-k'))), ['chip', 'map', 'make', 'counts-k']);
    assert.deepEqual(pickPhoneOverflow(() => true), ['chip', 'map', 'make']);
    assert.deepEqual(pickPhoneOverflow(() => false), ['chip', 'map', 'make', 'counts-k', 'counts-whole', 'counts']);
  });

  it("the report's counts at each step: the bar's step is read from its data-overflow", () => {
    const bar = { dataset: {} };
    const doc = { querySelector: (q) => (q === 'header.top-bar' ? bar : null) };
    const el = () => ({ dataset: {}, textContent: '' });
    const img = el();
    const cur = el();
    const fav = el();
    const draw = () => {
      drawHudCount(doc, img, 70212, true);
      drawHudCount(doc, cur, '80312', true);
      drawHudCount(doc, fav, 1302, true, '1,302');
      return [img, cur, fav].map((e) => e.textContent);
    };
    assert.equal(hudCountStep(doc), 1);
    assert.deepEqual(draw(), ['70.2K', '80.3K', '1,302']);
    bar.dataset.overflow = 'chip map make counts-k';
    assert.deepEqual(draw(), ['70.2K', '80.3K', '1.3K']);
    bar.dataset.overflow = 'chip map make counts-k counts-whole';
    assert.deepEqual(draw(), ['70K', '80K', '1.3K']);
    assert.deepEqual([img.dataset.n, cur.dataset.n, fav.dataset.n, fav.dataset.whole], ['70212', '80312', '1302', '1,302']);
    // Not shortened (a desktop): the whole number, and nothing kept for the phone's redraw.
    drawHudCount(doc, fav, 1302, false, '1,302');
    assert.equal(fav.textContent, '1,302');
    assert.equal(fav.dataset.n, undefined);
  });
});
