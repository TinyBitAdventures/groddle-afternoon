/**
 * The Home Street Selection Machine's three choices (Austin 2026-11-11, Modern): "Pick Meadow Style",
 * "Pick Firebog Style" and "Pick Uralia Style" showed as big circles, the label on the left and the
 * description squeezed into a clipped column on the right. The Home/Mail shell's pill rule
 * ([data-ui="modern"] :is(#home-panel, #mail-panel) :is(.home-body, ...) button, a centred inline-flex
 * row with radius-pill) caught the machine's .home-style buttons, whose content is a swatch, a label
 * and a description. The pill rule now skips .home-style and Modern gives the choices option rows:
 * a swatch, then the label over its description. Classic keeps the base cards.
 * Run: node --test tests/home-street-machine-dialog.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const style = read('public/style.css');
const classic = read('public/css/classic.css');
const ticket = read('public/js/home-ticket.js');

/** Every rule as { selectors, body }, nested blocks flattened (good enough for these flat sheets). */
function rules(css) {
  const out = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].trim().replace(/^@media[^{]*$/, '').trim();
    if (!selectors) continue;
    out.push({ selectors, body: m[2] });
  }
  return out;
}

const all = rules(style);
const prop = (body, name) => body.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`))?.[1].trim();

describe('Home Street Selection Machine choices', () => {
  it('each choice is a button.home-style with a swatch, a label and a description', () => {
    assert.match(ticket, /el\('button', \{[^}]*class: 'home-style'/);
    assert.match(ticket, /el\('span', \{ class: 'home-style-visual' \}\),\s*el\('strong', \{ text: verb\.name \}\),\s*el\('span', \{ text: verb\.tooltip \}\)/);
  });

  it('the Home/Mail shell pill rule never reaches .home-style', () => {
    const pills = all.filter((r) => r.selectors.includes(':is(#home-panel, #mail-panel)') && /\bbutton\b/.test(r.selectors) && /radius-pill/.test(r.body));
    assert.ok(pills.length > 0, 'the shell pill rule is still there');
    for (const r of pills) assert.match(r.selectors, /:not\(\.home-style\)/, r.selectors);
    // The hover and primary variants of the same rule skip it too (they would repaint the row).
    const variants = all.filter((r) => r.selectors.includes(':is(.home-body, .mail-reader, .mail-head-actions) button'));
    assert.ok(variants.length >= 4);
    for (const r of variants) assert.match(r.selectors, /:not\(\.home-style\)/, r.selectors);
  });

  it('Modern lays the choices out as option rows: one column, swatch beside label over description', () => {
    const find = (sel) => all.find((r) => r.selectors === sel)?.body;
    const grid = find('[data-ui="modern"] #home-panel .home-style-grid');
    assert.ok(grid, 'Modern grid rule');
    assert.equal(prop(grid, 'grid-template-columns'), '1fr');
    const row = find('[data-ui="modern"] #home-panel .home-style');
    assert.ok(row, 'Modern row rule');
    assert.equal(prop(row, 'display'), 'grid');
    assert.notEqual(prop(row, 'border-radius'), 'var(--radius-pill)');
    assert.match(prop(row, 'border-radius'), /var\(--radius-m\)/);
    assert.equal(prop(row, 'min-height'), '0');
    assert.equal(prop(row, 'text-align'), 'left');
    const visual = find('[data-ui="modern"] #home-panel .home-style-visual');
    assert.ok(visual, 'swatch rule');
    assert.match(prop(visual, 'grid-row'), /span 2/);
    const label = find('[data-ui="modern"] #home-panel .home-style strong');
    const desc = find('[data-ui="modern"] #home-panel .home-style span:last-child');
    assert.ok(label && desc);
    assert.equal(prop(label, 'grid-column'), '2');
    assert.equal(prop(desc, 'grid-column'), '2');
    // Nothing clipped: the description wraps in its own column, never squeezed to a sliver.
    assert.notEqual(prop(desc, 'white-space'), 'nowrap');
  });

  it('Classic has no rule that turns .home-style round or into a row of three', () => {
    for (const r of rules(classic)) {
      if (!r.selectors.includes('home-style') && !/#home-panel[^,{]*\bbutton\b/.test(r.selectors)) continue;
      assert.doesNotMatch(r.body, /radius-pill|border-radius:\s*50%/, r.selectors);
    }
    // The base cards the Classic skin keeps: a block button, the swatch on top.
    const base = all.find((r) => r.selectors === '.home-style')?.body;
    assert.ok(base);
    assert.equal(prop(base, 'text-align'), 'left');
    assert.match(prop(base, 'border-radius'), /--radius-3xl/);
  });
});
