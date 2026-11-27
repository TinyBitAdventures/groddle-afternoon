/**
 * #746 (reopened on v0.79.0): Glitch's Sloth Knocker hangs off the trunk's LEFT edge, not its middle.
 *
 * Glitch: sloth_knocker.js has no instance props (no dir) and its knock handler always sets state
 * '1' after 'tool_animation' (sloth_knocker.js 52-53); the client mirrors an itemstack only for a
 * state starting with '-' (Itemstack.as 327-333, LocationItemstackView.as 1018-1024). So every
 * Knocker shows the art as drawn: the gold ring and face on the left, the grey plate on the right
 * (sloth_knocker x1 png, 34 x 50, its point the bottom centre: getAssetInfo x -17 y -51). The ring's
 * hole centre is 4 px left of the point and 15 px up.
 *
 * The 2012 Eleven snaps (6000 x 1000 = street px) show 37 of the 84 Knockers, found by template
 * match at NCC 1.00, all unmirrored, on trees whose sloth hangs right (24) and left (13). Their ring
 * centre sits a median 5 px inside the trunk's drawn left edge (range -8..27), the foot a median 11 px
 * left of the drawn middle. v0.79.0 puts the ring on the drawn middle (sloth-trees.js 172-175), a
 * median 13 px right of Glitch's (max 34).
 *
 * The same snaps show 57 Sloths' own branches (sloth_hidden template match, NCC 0.9 and up): Glitch's
 * branch reached a median 18 px into the drawn trunk (9-29); v0.79.0 stopped it 2 px in and pushed the
 * sloth out to keep the Knocker clear of its box (KNOCKER_CLEAR 92), a median 13 px across from Glitch's
 * (max 32). Now the branch goes 18 px in, and where the Knocker lies in the Sloth's box a click or tap
 * on the Knocker is the Knocker's (tests/r746-knocker-pick.test.js).
 *
 * Run: node --test tests/r746-knocker-left-edge.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../public/', import.meta.url).pathname;
const { SLOTH_SPOTS } = await import('../public/js/sloth-spots-data.js?v=0fb481e0');
const { slothTrees, drawnTrunkAt } = await import('../public/js/sloth-trees.js?v=775bef07');

/** The ring's hole centre from the Knocker's point (bottom centre), unmirrored art. */
const RING = { x: -4, y: -15 };
/** Glitch's Knocker feet [tsid, tree index, x, y] in street px (0, 0 = top left), from the 2012 snaps. */
const GLITCH = [
  ['GA512IH5226256P', 0, 948, 719], ['GA51701PF262LC8', 0, 960, 563], ['GA51701PF262LC8', 1, 2102, 616],
  ['GA519RU9M462NJ1', 0, 1293, 398], ['GA519RU9M462NJ1', 1, 4393, 419], ['GA51BMHT2562Q3D', 0, 716, 280],
  ['GA51BMHT2562Q3D', 1, 4674, 499], ['GA55645B8O528MI', 0, 2767, 579], ['GA55645B8O528MI', 1, 5183, 346],
  ['GDO20OO2ETQ2EAG', 0, 1892, 651], ['GDO20OO2ETQ2EAG', 1, 2795, 425], ['GDO20OO2ETQ2EAG', 2, 3555, 343],
  ['GDO20OO2ETQ2EAG', 3, 4247, 601], ['GDORIA62TLQ2HOH', 0, 1802, 308], ['GDORIA62TLQ2HOH', 1, 2907, 491],
  ['GDORIA62TLQ2HOH', 2, 3715, 445], ['GHF48S34D1J2F31', 0, 4934, 717], ['GHF6MVO2G6J2F1F', 0, 1381, 577],
  ['GHFC3I4EKMI20JD', 0, 3295, 505], ['GHFC3I4EKMI20JD', 1, 4240, 432], ['GHFEKBJFP0J2J9Q', 0, 3373, 761],
  ['GHFF2N2M36J2MG3', 0, 3651, 478], ['GHFF2N2M36J2MG3', 1, 4817, 590], ['GHFF2N2M36J2MG3', 2, 5673, 478],
  ['GHFG6KGMV3J2OU9', 0, 1799, 676], ['GHFG6KGMV3J2OU9', 1, 5079, 572], ['GHFJGR1KH3J29IT', 0, 1056, 887],
  ['GHFJR7H9R8J2SHM', 0, 1276, 601], ['GHFJR7H9R8J2SHM', 1, 2440, 528], ['GHFJR7H9R8J2SHM', 2, 5256, 541],
  ['GHFO1IFRP3J28EU', 0, 1700, 681], ['GHFO1IFRP3J28EU', 1, 5143, 558], ['GHFP8P54GMI2UCH', 0, 4171, 380],
  ['GHFPD9KBT5J2D8M', 0, 2357, 526], ['GHFU61GVLKI2ATQ', 0, 1024, 265], ['GHFU61GVLKI2ATQ', 1, 1650, 319],
  ['GHFU61GVLKI2ATQ', 2, 4668, 484],
];
/** Glitch's Sloths in the same snaps: [tsid, tree index, x, y] of the SWF's origin (street px), NCC 0.9 and up. */
const GLITCH_SLOTHS = [
  ['GA512IH5226256P', 0, 1033, 555], ['GA51701PF262LC8', 0, 1024, 443], ['GA51701PF262LC8', 1, 2087, 475],
  ['GA519RU9M462NJ1', 0, 1243, 272], ['GA519RU9M462NJ1', 1, 4438, 267], ['GA51BMHT2562Q3D', 0, 781, 138],
  ['GA51BMHT2562Q3D', 1, 4657, 358], ['GDO20OO2ETQ2EAG', 0, 1832, 550], ['GDO20OO2ETQ2EAG', 1, 2889, 291],
  ['GDO20OO2ETQ2EAG', 2, 3491, 208], ['GDO3JFLC5TQ2NOR', 0, 721, 592], ['GDO3JFLC5TQ2NOR', 2, 3945, 643],
  ['GDO4KOD692R2GQB', 0, 1450, 530], ['GDO4KOD692R2GQB', 1, 3280, 428], ['GDO97PV01MQ236V', 2, 3691, 669],
  ['GDOAVTFUNTQ2EVU', 0, 2124, 220], ['GDOAVTFUNTQ2EVU', 2, 5046, 410], ['GDOGVQ4M32R2COS', 0, 1332, 535],
  ['GDOGVQ4M32R2COS', 1, 3630, 407], ['GDOGVQ4M32R2COS', 2, 4877, 489], ['GDOIGN9B60R2LI4', 0, 1147, 513],
  ['GDOIGN9B60R2LI4', 2, 5228, 471], ['GDOJ3MELL2R23Q6', 0, 1423, 505], ['GDOJ3MELL2R23Q6', 1, 3472, 355],
  ['GDOKUS4M0TQ263H', 0, 1011, 629], ['GDOKUS4M0TQ263H', 1, 3064, 622], ['GDOKUS4M0TQ263H', 2, 4667, 521],
  ['GDOPA4JQBTQ2AA9', 1, 2160, 440], ['GDOPA4JQBTQ2AA9', 2, 4155, 545], ['GDOPA4JQBTQ2AA9', 3, 5251, 642],
  ['GDORIA62TLQ2HOH', 0, 1898, 183], ['GDORIA62TLQ2HOH', 1, 2978, 367], ['GDORIA62TLQ2HOH', 2, 3803, 295],
  ['GDOT3LP63TQ204B', 1, 1713, 579], ['GDOT3LP63TQ204B', 2, 4424, 369], ['GDOT3LP63TQ204B', 3, 5219, 483],
  ['GDOU6HOAO2R21Q1', 0, 1095, 605], ['GDOU6HOAO2R21Q1', 2, 4773, 615], ['GDOVCSE5H2R2L24', 1, 4354, 522],
  ['GHF48S34D1J2F31', 0, 4908, 587], ['GHF6MVO2G6J2F1F', 0, 1357, 437], ['GHFC3I4EKMI20JD', 0, 3240, 382],
  ['GHFEKBJFP0J2J9Q', 0, 3339, 605], ['GHFF2N2M36J2MG3', 0, 3717, 344], ['GHFF2N2M36J2MG3', 1, 4899, 455],
  ['GHFF2N2M36J2MG3', 2, 5768, 353], ['GHFG6KGMV3J2OU9', 0, 1746, 539], ['GHFG6KGMV3J2OU9', 1, 5146, 464],
  ['GHFJGR1KH3J29IT', 0, 1151, 779], ['GHFJR7H9R8J2SHM', 0, 1230, 491], ['GHFJR7H9R8J2SHM', 1, 2503, 416],
  ['GHFO1IFRP3J28EU', 0, 1768, 571], ['GHFP8P54GMI2UCH', 0, 4236, 282], ['GHFPD9KBT5J2D8M', 0, 2417, 403],
  ['GHFU61GVLKI2ATQ', 0, 1122, 144], ['GHFU61GVLKI2ATQ', 1, 1717, 214], ['GHFU61GVLKI2ATQ', 2, 4617, 350],
];
/** The SWF's origin from a sloth's spot (the hands): resource-nodes-feature.js SLOTH_GRIP. */
const GRIP = { x: 30, y: 22 };
const NAMES = { GDORIA62TLQ2HOH: 'Haqiq Cedony', GHF6MVO2G6J2F1F: 'Chandrika Chimes', GHFJR7H9R8J2SHM: 'Erupekku Rumple', GDOKUS4M0TQ263H: 'Moonga Coral' };

const TRUNK_RE = /^tree_plane_trunk|^tree_plane_01a/;
const cases = [];
for (const tsid of Object.keys(SLOTH_SPOTS)) {
  const street = JSON.parse(readFileSync(ROOT + `assets/streets/${tsid}.json`, 'utf8'));
  const b = street.bounds;
  const W = b.r - b.l;
  const H = b.b - b.t;
  const trunks = [];
  for (const layer of street.layers) {
    if (!(layer.z < 0 && layer.w === W && layer.name !== 'sky')) continue;
    for (const d of layer.decos || []) {
      if (!TRUNK_RE.test(d.sprite)) continue;
      const x = d.x + b.l;
      const y = d.y + b.t + (H - layer.h);
      trunks.push({ x, y0: y - d.h, y1: y, sprite: d.sprite, w: d.w, h: d.h, flip: Boolean(d.flip), r: Number(d.r) || 0 });
    }
  }
  slothTrees(street).forEach((t, i) => {
    const [x, y, dir, , kx, ky] = SLOTH_SPOTS[tsid][i];
    const trunk = trunks.find((k) => Math.round(k.x) - b.l === t.trunk);
    // The trunk as drawn at screen row y, in screen px.
    const col = (y) => { const c = drawnTrunkAt(trunk, y + b.t); return c && [c[0] - b.l, c[1] - b.l]; };
    cases.push({ tsid, i, name: `${NAMES[tsid] || tsid} ${i} (sloth ${dir > 0 ? 'right' : 'left'})`, dir, x, y, kx, ky, col });
  });
}

describe("#746 reopened: the Knocker's ring hangs on the trunk's left edge, whichever side the sloth is", () => {
  it('finds all 84 trees and the 37 snapped Knockers among them', () => {
    assert.equal(cases.length, 84);
    for (const [tsid, i] of GLITCH) assert.ok(cases.find((c) => c.tsid === tsid && c.i === i), `${tsid} ${i}`);
  });

  it("puts each of the 37 snapped Knockers within 6 px across of Glitch's (Haqiq Cedony, Chandrika Chimes, Erupekku Rumple among them)", () => {
    const bad = [];
    for (const [tsid, i, gx] of GLITCH) {
      const c = cases.find((k) => k.tsid === tsid && k.i === i);
      const dx = c.kx - gx;
      if (Math.abs(dx) > 6) bad.push(`${c.name}: ${dx > 0 ? dx + ' px right' : -dx + ' px left'} of Glitch's`);
    }
    assert.deepEqual(bad, []);
  });

  it('stands each of the 37 snapped Knockers at the height the snap shows it (within 2 px)', () => {
    const bad = [];
    for (const [tsid, i, , gy] of GLITCH) {
      const c = cases.find((k) => k.tsid === tsid && k.i === i);
      if (Math.abs(c.ky - gy) > 2) bad.push(`${c.name}: ${c.ky - gy} px below Glitch's`);
    }
    assert.deepEqual(bad, []);
  });

  it("hangs the 57 snapped Sloths with their branch as deep in the trunk as Glitch's: within 18 px across, a median 6 or less", () => {
    const off = [];
    for (const [tsid, i, gx] of GLITCH_SLOTHS) {
      const c = cases.find((k) => k.tsid === tsid && k.i === i);
      off.push({ name: c.name, dx: c.x - c.dir * GRIP.x - gx });
    }
    assert.equal(off.length, 57);
    assert.deepEqual(off.filter((o) => Math.abs(o.dx) > 18).map((o) => `${o.name}: ${o.dx} px across from Glitch's`), []);
    const sorted = off.map((o) => Math.abs(o.dx)).sort((a, b) => a - b);
    assert.ok(sorted[sorted.length >> 1] <= 6, `median ${sorted[sorted.length >> 1]} px across`);
  });

  for (const dir of [1, -1]) {
    it(`sloth ${dir > 0 ? 'right' : 'left'} of the trunk, no snap: the ring centre sits on the drawn left edge (-4..+14 px in, Glitch's middle 80%)`, () => {
      const bad = [];
      for (const c of cases.filter((k) => k.dir === dir && !GLITCH.some(([t, i]) => t === k.tsid && i === k.i))) {
        const ry = c.ky + RING.y;
        const col = c.col(ry);
        if (!col) { bad.push(`${c.name}: no trunk at the ring`); continue; }
        const inset = Math.round(c.kx + RING.x - col[0]);
        if (inset < -4 || inset > 14) bad.push(`${c.name}: ring ${inset} px inside the left edge (trunk ${Math.round(col[1] - col[0])} px wide)`);
      }
      assert.deepEqual(bad, []);
    });
  }
});
