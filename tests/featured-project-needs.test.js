/**
 * Ticket 240: the featured project says what it still needs before the trip there: the Feat
 * panel's row (and the bubble line's tooltip) carry a one-line summary, and the Projects card opened
 * from the line or the row shows its needs open.
 * Run: node --test tests/featured-project-needs.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { featuredNeedsLine, featuredSkillsLine } from '../public/js/featured-project.js?v=5b2ee7c1';
import { needEntry } from '../public/js/projects-tracker.js?v=27b6ea1e';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

describe('the featured project\'s needs', () => {
  it('one line: the first need open now, and how many more', () => {
    const needs = [
      { open: false, text: 'Contribute Planks · 12 more' },
      { open: true, text: 'Clear with a Pick (Mining IV) · 7 units' },
      { open: true, text: 'Contribute currants · 400 more' },
    ];
    assert.equal(featuredNeedsLine({ known: true, needs }), 'Needs: Clear with a Pick (Mining IV) · 7 units, and 1 more');
    assert.equal(featuredNeedsLine({ known: true, needs: needs.slice(0, 2) }), 'Needs: Clear with a Pick (Mining IV) · 7 units');
    assert.equal(featuredNeedsLine({ known: false, needs }), '');
    assert.equal(featuredNeedsLine({ known: true, finished: true, needs }), '');
    assert.equal(featuredNeedsLine({ known: true, needs: [needs[0]] }), '');
    assert.equal(featuredNeedsLine(null), '');
  });

  it('G802: then the skills its tool work needs, later steps too, the ones you lack marked', () => {
    const labels = { item: (c) => ({ pick: 'Pick', plank: 'Planks' })[c] || c, skill: (id) => ({ mining_4: 'Mining IV', piety_1: 'Piety' })[id] || id };
    const rows = [
      { id: 'r1', type: 'item', classId: 'plank', need: 12, got: 0, open: true },
      { id: 'r2', type: 'work', classId: 'pick', classIds: ['pick'], skill: 'mining_4', verb: 'clear', need: 7, got: 0, open: true },
      { id: 'r3', type: 'work', classId: 'pick', classIds: ['pick'], skill: 'piety_1', verb: 'bless', need: 5, got: 0, open: false },
      { id: 'r4', type: 'work', classId: 'pick', classIds: ['pick'], skill: 'mining_4', verb: 'smash', need: 5, got: 0, open: false },
    ];
    const ctx = { inv: {}, learned: ['mining_4'], toolOk: () => true, currants: 0, have: () => 0 };
    const needs = rows.map((r) => needEntry(r, labels, ctx));
    assert.deepEqual(needs.slice(1).map((n) => [n.skill, n.skillName, n.skillMissing]), [['mining_4', 'Mining IV', false], ['piety_1', 'Piety', true], ['mining_4', 'Mining IV', false]]);
    assert.equal(featuredSkillsLine({ needs }), 'Skills: Mining IV, Piety (not learned)');
    assert.equal(featuredNeedsLine({ known: true, needs }), 'Needs: Contribute Planks · 12 more, and 1 more. Skills: Mining IV, Piety (not learned)');
    // Without your pack (no ctx) the skills are named, unmarked; an item-only phase has no skills part.
    assert.equal(featuredSkillsLine({ needs: rows.map((r) => needEntry(r, labels)) }), 'Skills: Mining IV, Piety');
    assert.equal(featuredNeedsLine({ known: true, needs: [needs[0]] }), 'Needs: Contribute Planks · 12 more');
    for (const t of [featuredNeedsLine({ known: true, needs })]) assert.doesNotMatch(t, /[–—]/);
  });

  it('the row and the line carry it, and the card opens with its needs shown', () => {
    const ui = read('public/js/ui/featured-project.js');
    assert.match(ui, /\.\.\.\(o\.needs \? \[span\(doc, 'fp-needs', o\.needs\)\] : \[\]\)/);
    assert.match(ui, /if \(o\.needs\) line\.dataset\.sub = o\.needs;/);
    const feature = read('public/js/features/street-jobs-feature.js');
    assert.match(feature, /featuredNeedsLine\(featuredEntry\(engine, Number\(state\.trackerSeen\) \|\| 0\)\)/);
    assert.match(feature, /pj\.openNeeds\.add\(featured\.jobId\);\n\s+pj\.sig = '';\n\s+if \(!pj\.open\) openProjects\(engine\);/);
  });
});
