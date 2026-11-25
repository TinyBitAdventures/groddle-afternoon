/** G891: the Knocker is its own thing on the trunk, with Knock (k), paired with its tree's Sloth. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SLOTH_KNOCKER, verbsForTarget, slothGeometry } from '../public/js/features/resource-nodes-feature.js?v=e1438358';
import { createResourceNode, resourceNodeVerbs } from '../public/js/resource-nodes.js?v=90d75c60';
import { verbMenuKey } from '../public/js/ui/verb-menu.js?v=4cb51d52';
import { SLOTH_SPOTS } from '../public/js/sloth-spots-data.js?v=7396e9db';
import { slothSpotFromRow } from '../public/js/sloth-trees.js?v=a3299191';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gsjs = (file) => readFileSync(join(root, '..', 'glitch-GameServerJS', 'items', file), 'utf8');
const ctx = { skills: ['animalkinship_3'], now: 1_000_000 };

describe('the Knocker (sloth_knocker.js)', () => {
  it('has the knock verb, its tooltip, its key and its own refusal; the Sloth keeps Feed', () => {
    const node = createResourceNode('npc_sloth', { now: ctx.now });
    const verbs = resourceNodeVerbs(node, { metal_rod: 2 }, {}, ctx);
    const knocker = verbsForTarget(verbs, true);
    assert.deepEqual(knocker.map((v) => [v.id, v.key, v.tooltip]), [['knock', 'k', 'Knock to call the Sloth']]);
    // #649: the Sloth up in its tree keeps Feed, greyed (npc_sloth.js feed conditions), never an empty menu.
    assert.deepEqual(verbsForTarget(verbs, false).map((v) => [v.id, v.enabled, v.message]), [['feed', false, "I'm not available right now."]]);
    assert.equal(SLOTH_KNOCKER.label, 'Knocker');
    // Without the skill: the Knocker's own reason (sloth_knocker.js 35-37).
    const noSkill = verbsForTarget(resourceNodeVerbs(node, {}, {}, { now: ctx.now }), true)[0];
    assert.equal(noSkill.enabled, false);
    assert.equal(noSkill.message, 'You must have Animal Kinship 3 to knock this Knocker.');
    // Once it is down: Feed on the Sloth, Knock greyed on the Knocker (41-43).
    node.out = true;
    const out = resourceNodeVerbs(node, { metal_rod: 2 }, {}, ctx);
    assert.deepEqual(verbsForTarget(out, false).map((v) => v.id), ['feed']);
    assert.deepEqual(verbsForTarget(out, true).map((v) => [v.id, v.enabled, v.message]), [['knock', false, 'The Sloth is already here']]);
  });

  it('matches the GSJS item, where the source survives beside the repo', { skip: !(() => { try { return gsjs('sloth_knocker.js'); } catch { return ''; } })() }, () => {
    const src = gsjs('sloth_knocker.js');
    assert.match(src, /"tooltip"\s*:\s*"Knock to call the Sloth"/);
    assert.match(src, /"k"\s*:\s*"knock"/);
    assert.match(src, /var label = "Knocker";/);
  });

  it('takes its letter in an open menu', () => {
    let clicked = 0;
    const row = { dataset: { vmLetter: 'k' }, hidden: false, getClientRects: () => [1], hasAttribute: () => false, focus() {}, click() { clicked += 1; }, classList: { toggle() {}, contains: () => false } };
    const el = { ownerDocument: { activeElement: null }, querySelectorAll: () => [row], querySelector: () => null, dataset: {} };
    assert.equal(verbMenuKey(el, { key: 'k' }), true);
    assert.equal(clicked, 1);
    assert.equal(verbMenuKey(el, { key: 'j' }), false);
    assert.equal(verbMenuKey(el, { key: 'K', shiftKey: true }), false, 'Shift+K stays the keyring');
  });

  it('hangs on its own tree, nearer its own Sloth than any other and within the knock reach of 600 px', () => {
    for (const [tsid, rows] of Object.entries(SLOTH_SPOTS)) {
      const spots = rows.map(slothSpotFromRow);
      spots.forEach((spot, i) => {
        const k = slothGeometry({ x: spot.x, y: spot.y, sloth: spot }).knocker;
        const d = spots.map((s) => Math.hypot(s.x - k.x, s.y - k.y));
        assert.equal(d.indexOf(Math.min(...d)), i, `${tsid} Knocker ${i}`);
        assert.ok(d[i] <= 600, `${tsid} ${i}`);
        // On the trunk, on the other side from the way the sloth hangs.
        assert.equal(Math.sign(spot.x - k.x), spot.dir, `${tsid} ${i}`);
      });
    }
  });
});
