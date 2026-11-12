/**
 * Ticket 240: the featured project says what it still needs before the trip there: the Feat
 * panel's row (and the pill's tip) carry a one-line summary, and the Projects card opened from
 * the pill or the row shows its needs open.
 * Run: node --test tests/featured-project-needs.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { featuredNeedsLine } from '../public/js/featured-project.js?v=3cc0565c';

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

  it('the row and the pill carry it, and the card opens with its needs shown', () => {
    const ui = read('public/js/ui/featured-project.js');
    assert.match(ui, /\.\.\.\(o\.needs \? \[span\(doc, 'fp-needs', o\.needs\)\] : \[\]\)/);
    assert.match(ui, /pill\.title = o\.needs \? `\$\{T\.pillTip\} \$\{o\.needs\}\.` : T\.pillTip;/);
    const feature = read('public/js/features/street-jobs-feature.js');
    assert.match(feature, /featuredNeedsLine\(featuredEntry\(engine, Number\(state\.trackerSeen\) \|\| 0\)\)/);
    assert.match(feature, /pj\.openNeeds\.add\(featured\.jobId\);\n\s+pj\.sig = '';\n\s+if \(!pj\.open\) openProjects\(engine\);/);
  });
});
