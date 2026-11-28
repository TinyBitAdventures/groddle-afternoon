/**
 * #746 (R2): the Sloth Knocker on Haqiq Cedony floated off its trunk. js/sloth-trees.js put every
 * Knocker on the middle of its trunk deco's box and every sloth BRANCH_OFFSET out from it, but the
 * trunk art is lopsided (tree_plane_trunk_01a's trunk stands about 40 px off its box's middle), so 21
 * Knockers hung off their trunks and 35 sloths' own branches ended short of them. Glitch placed them
 * by hand, the Knocker on the trunk and the branch growing out of it (the 2012 Haqiq Cedony snaps).
 * The same box-versus-drawn-pixels mistake as #731's Visiting Stones; this measures the drawn trunk
 * here, from the art at full size (ImageMagick), apart from the tool's columns.
 * Reopened on v0.79.0: Glitch's Knocker hung unmirrored with its ring just inside the trunk's LEFT edge
 * and the branch went about 18 px into the trunk (tests/r746-knocker-left-edge.test.js against the
 * snaps); this keeps the art-side checks.
 *
 * Run: node --test tests/sloth-knocker-on-trunk-746.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SLOTH_SPOTS } from '../public/js/sloth-spots-data.js?v=0fb481e0';
import { slothSpotFromRow, slothTrees, KNOCKER_SNAPS } from '../public/js/sloth-trees.js?v=775bef07';
import { SLOTH_GRIP, SLOTH_REACH, slothGeometry } from '../public/js/features/resource-nodes-feature.js?v=b8fc0749';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ecology = JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
const TRUNK_RE = /^tree_plane_trunk|^tree_plane_01a/;
/** The Knocker's ring over its foot (sloth_knocker, 34 x 50, its point the bottom centre). */
const RING = 25;
/** The thick end of the sloth's own branch: sloth_hidden's cell x 2, rows 88-118, from the SWF's origin. */
const BRANCH = { back: 59, down: 36 };
/** The ring's hole centre from the Knocker's foot (unmirrored art), and how far inside the left edge it hangs. */
const RING_AT = { x: -4, y: -15 };
const INSET = 5;

/** Each row's [left, right) of the art where alpha is over half, at full size (null = nothing drawn). */
const artRows = new Map();
function rowsOf(sprite) {
  if (artRows.has(sprite)) return artRows.get(sprite);
  const file = join(root, 'public/assets/decos/groddle', `${sprite}.webp`);
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', file], { encoding: 'utf8' }).trim().split(' ').map(Number);
  const raw = execFileSync('magick', [file, '-alpha', 'extract', '-depth', '8', 'gray:-'], { maxBuffer: 1 << 26 });
  const rows = [];
  for (let y = 0; y < h; y += 1) {
    let l = -1;
    let r = -1;
    for (let x = 0; x < w; x += 1) if (raw[y * w + x] > 128) { if (l < 0) l = x; r = x + 1; }
    rows.push(l < 0 ? null : [l, r]);
  }
  const out = { w, h, rows };
  artRows.set(sprite, out);
  return out;
}

/** The street's trunk deco at screen x (rounded), with its bottom in screen px. */
function trunkOf(street, x) {
  const b = street.bounds;
  const W = b.r - b.l;
  const H = b.b - b.t;
  for (const layer of street.layers) {
    if (!(layer.z < 0 && layer.w === W && layer.name !== 'sky')) continue;
    for (const d of layer.decos || []) if (TRUNK_RE.test(d.sprite) && Math.round(d.x) === x) return { ...d, bottom: d.y + (H - layer.h) };
  }
  return null;
}

/** The trunk as drawn at screen row y: [left, right], or null. */
function drawn(d, y) {
  const art = rowsOf(d.sprite);
  const top = d.bottom - d.h;
  if (y < top || y >= d.bottom) return null;
  const row = art.rows[Math.floor(((y - top) / d.h) * art.h)];
  if (!row) return null;
  const at = (px) => (d.flip ? d.x + d.w / 2 - (px * d.w) / art.w : d.x - d.w / 2 + (px * d.w) / art.w);
  return [Math.min(at(row[0]), at(row[1])), Math.max(at(row[0]), at(row[1]))];
}

/** The 37 trees whose Knocker the 2012 snaps show (sloth-trees.js KNOCKER_SNAPS, by trunk x). */
const SNAPPED_TREES = new Set();
const cases = [];
for (const tsid of Object.keys(SLOTH_SPOTS)) {
  const street = JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));
  const label = ecology.streets[tsid]?.label || tsid;
  slothTrees(street).forEach((t, i) => {
    if ((KNOCKER_SNAPS[tsid] || []).some(([x]) => x === t.trunk)) SNAPPED_TREES.add(`${tsid} ${i}`);
    const spot = slothSpotFromRow(SLOTH_SPOTS[tsid][i]);
    cases.push({ tsid, label, i, d: trunkOf(street, t.trunk), spot, geo: slothGeometry({ x: spot.x, y: spot.y, sloth: spot }) });
  });
}
// Haqiq Cedony (the report) first.
cases.sort((a, b) => (b.tsid === 'GDORIA62TLQ2HOH') - (a.tsid === 'GDORIA62TLQ2HOH'));

describe('#746 Sloth trees: the Knocker and the branch meet the trunk as drawn', () => {
  it('the trunk columns are current (tools/build-sloth-trunk-columns.mjs --check)', () => {
    execFileSync(process.execPath, [join(root, 'tools/build-sloth-trunk-columns.mjs'), '--check'], { stdio: 'pipe' });
  });

  it('finds the trunk deco of all 84 Sloths', () => {
    assert.equal(cases.length, 84);
    assert.deepEqual(cases.filter((c) => !c.d).map((c) => `${c.label} ${c.i}`), []);
  });

  it("hangs every Knocker on the drawn trunk, its ring just inside the trunk's left edge whichever side the sloth is (Haqiq Cedony first)", () => {
    const bad = [];
    let snapped = 0;
    for (const { tsid, label, i, d, spot } of cases) {
      const col = drawn(d, spot.knocker.y + RING_AT.y);
      if (!col) {
        bad.push(`${label} ${i}: no trunk at the ring`);
        continue;
      }
      const inset = Math.round(spot.knocker.x + RING_AT.x - col[0]);
      if (SNAPPED_TREES.has(`${tsid} ${i}`)) {
        snapped += 1;
        // Glitch's own, by hand: its ring 8 px outside the left edge (Gomed Essoni's first, on a flared
        // trunk) to 27 px in (the 2012 snaps).
        if (inset < -9 || inset > 28) bad.push(`${label} ${i}: snapped ring ${inset} px inside the left edge`);
        continue;
      }
      if (Math.abs(inset - INSET) > 1) bad.push(`${label} ${i}: ring ${inset} px inside the left edge, not ${INSET}`);
      // The foot (the art's bottom centre) on the trunk as drawn.
      if (!(spot.knocker.x > col[0] && spot.knocker.x < col[1])) bad.push(`${label} ${i}: the foot off the trunk`);
    }
    assert.deepEqual(bad, []);
    assert.equal(snapped, 37);
  });

  it("grows every sloth's own branch out of the drawn trunk: its thick end in it, not past it", () => {
    const bad = [];
    for (const { label, i, d, geo } of cases) {
      const tip = geo.origin.x - geo.dir * BRANCH.back;
      const col = drawn(d, geo.origin.y + BRANCH.down);
      if (!col) {
        bad.push(`${label} ${i}: no trunk at the branch`);
        continue;
      }
      const [near, far] = geo.dir > 0 ? [col[1], col[0]] : [col[0], col[1]];
      const gap = Math.round(geo.dir * (tip - near));
      if (gap > 0) bad.push(`${label} ${i}: branch ${gap} px short of the trunk`);
      if (geo.dir * (tip - far) <= 0) bad.push(`${label} ${i}: branch through the trunk`);
    }
    assert.deepEqual(bad, []);
  });
});
