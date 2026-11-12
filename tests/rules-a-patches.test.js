/**
 * rules-a patches (2026-11-12): Plant's refusal order on a weedy or dug Patch, a missed tend's
 * line, and the Paper Tree asking for the watering can first. Sources: glitch-GameServerJS
 * items/patch.js, items/item.js, items/paper_tree.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createPlot, performPlotVerb, plotVerbs } from '../public/js/patches.js?v=5f333fdb';
import { createResourceNode, resourceNodeVerbs } from '../public/js/resource-nodes.js?v=9b20788d';

describe('Plant on a weedy or dug Patch with no bean (patch.js 243-253 before 270-278)', () => {
  it('the weeds first, then the hole', () => {
    const weedy = createPlot('patch', { now: 0 });
    assert.equal(plotVerbs(weedy, { inv: {}, pc: { energy: 50 } }).find((v) => v.id === 'plant').reason, 'You should probably tend to the weeds first.');
    const dug = createPlot('patch', { now: 0 });
    dug.stage = 'dug';
    assert.equal(plotVerbs(dug, { inv: {}, pc: { energy: 50 } }).find((v) => v.id === 'plant').reason, 'You need to wait for the hole to fill in first.');
  });
});

describe('a missed tend (patch.js 727-733, item.js 26-37)', () => {
  it('says "You tried to tend a Patch." and the tend_failed bubble', () => {
    const plot = createPlot('patch', { now: 0 });
    const r = performPlotVerb(plot, 'tend', { inv: { hoe: 1 }, pc: { energy: 50, mood: 50 }, skills: [], rng: () => 0.99, now: 0 });
    assert.equal(r.ok, false);
    assert.equal(r.msg ?? r.msgs?.[0], 'You tried to tend a Patch.');
    assert.ok(r.response);
  });
});

describe('the Paper Tree asks for the watering can first (paper_tree.js 350-358)', () => {
  it('watered, with no can: the can line; with a can: it does not want it', () => {
    const node = createResourceNode('paper_tree');
    node.watered = true;
    const noCan = resourceNodeVerbs(node, {}, { energy: 50 }).find((v) => v.id === 'water');
    assert.equal(noCan.message, 'You need a working watering can.');
    const withCan = resourceNodeVerbs(node, { watering_can: 1 }, { energy: 50 }).find((v) => v.id === 'water');
    assert.equal(withCan.message, "I don't want to be watered!");
  });
});
