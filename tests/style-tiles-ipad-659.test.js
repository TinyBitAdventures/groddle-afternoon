/**
 * #659 (root R52), reopened after 7520263f79b: on an iPad, in every iPad browser, the Change Style
 * tiles draw nothing inside .hs-prev, not even its own CSS sky gradient, while the labels and the
 * tile backgrounds draw. Linux WebKit (iPad Pro 11 context) paints every tile, so this test holds
 * the shape the iPad cannot draw rather than a pixel result.
 *
 * The shape: a positioned box (or one with positioned children) inside an overflow:auto scroller
 * that is NOT a stacking context, inside a transformed or z-indexed panel. iOS scrolls every
 * overflow box on its own composited layer; a positioned box whose stacking context is outside
 * its scroller becomes a separate layer with a scroll proxy and an ancestor clip, and the iPad
 * draws that layer blank. The label and tile background stay in the scroller's own layer.
 *
 * Fixed when the scroller is its own stacking context (isolation:isolate), so every positioned
 * box in it paints in the scroller's layer, as the labels do. The Change Style tile picture is
 * also back in flow (no positioned box in that tile at all). The furniture style picker (.fu-tile
 * holds its NEW badge with position) and the house picker (.hp-thumb stacks its pieces with
 * position) have the same shape and get the same isolation.
 * Run: node --test tests/style-tiles-ipad-659.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (rel) => readFileSync(new URL(`../public/js/${rel}`, import.meta.url), 'utf8');

/** The feature's `const CSS = \`...\`` block. */
function cssOf(src) {
  const at = src.indexOf('const CSS = `');
  assert.ok(at >= 0, 'the module keeps its CSS in const CSS');
  return src.slice(at, src.indexOf('`;', at));
}

/** The declarations of every rule (outside @media) whose selector list includes exactly `sel`. */
function decls(css, sel) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sels = m[1].replace(/^[\s\S]*\n/, '').split(',').map((s) => s.trim());
    if (sels.includes(sel)) out.push(m[2]);
  }
  return out.join(';');
}

/** The last value of `name` in a declaration list. */
function prop(text, name) {
  const re = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'g');
  let last = null;
  let x;
  while ((x = re.exec(text))) last = x[1].trim();
  return last;
}

const positioned = (d) => /relative|absolute|fixed|sticky/.test(prop(d, 'position') || 'static');

/** A box makes its own stacking context (so positioned children paint in its scroll layer). */
function isStack(d) {
  return prop(d, 'isolation') === 'isolate'
    || (positioned(d) && (prop(d, 'z-index') || 'auto') !== 'auto')
    || /translate|scale|matrix|rotate/.test(prop(d, 'transform') || '')
    || (prop(d, 'contain') || '').includes('paint');
}

/**
 * Each picker: its CSS, the scrollers (every scrolling box between the panel and the tiles, on
 * any layout) and the positioned boxes inside them.
 */
const PICKERS = [
  {
    name: 'Change your street style (homes)',
    file: 'features/homes-feature.js',
    panel: '.homes-styles',
    scrollers: ['.homes-styles .hs-grid'],
    inside: ['.homes-styles .hs-prev', '.homes-styles .hs-prev .hs-pic'],
  },
  {
    name: 'Choose a new style (furniture upgrade)',
    file: 'furniture-upgrade-picker.js',
    panel: '.furn-upgrade',
    scrollers: ['.furn-upgrade .fu-grid'],
    inside: ['.furn-upgrade .fu-tile', '.furn-upgrade .fu-tile .fu-new'],
  },
  {
    name: 'Customize your house',
    file: 'ui/house-picker.js',
    panel: '.house-picker',
    scrollers: ['.house-picker .hp-card', '.house-picker .hp-body', '.house-picker .hp-styles'],
    inside: ['.house-picker .hp-thumb', '.house-picker .hp-thumb>i', '.house-picker .hp-thumb img'],
  },
];

describe('#659 iPad: picture tiles paint in their scroller\'s own layer', () => {
  for (const p of PICKERS) {
    const css = cssOf(read(p.file));
    // Every selector the rule set names in any layout (touch-phone scrollers included).
    const all = (sel) => [decls(css, sel), decls(css, `:root.touch-phone ${sel}`)].join(';');

    it(`${p.name}: the panel is a stacking context over the game (the iPad case)`, () => {
      assert.ok(isStack(decls(css, p.panel)), `${p.panel} makes a stacking context`);
    });

    it(`${p.name}: every scroller round a positioned tile box is its own stacking context (fails on main)`, () => {
      const pos = p.inside.filter((sel) => positioned(decls(css, sel)));
      for (const sc of p.scrollers) {
        const d = all(sc);
        const scrolls = /auto|scroll/.test(`${prop(d, 'overflow') || ''} ${prop(d, 'overflow-x') || ''} ${prop(d, 'overflow-y') || ''}`);
        if (!scrolls && !pos.length) continue;
        assert.ok(!pos.length || isStack(decls(css, sc)),
          `${sc} scrolls round positioned ${pos.join(', ')} without isolation:isolate: on iOS those draw blank`);
      }
    });
  }

  it('the Change Style tile picture is in flow: no positioned box inside the tile at all', () => {
    const css = cssOf(read('features/homes-feature.js'));
    for (const sel of ['.homes-styles .hs-tile', '.homes-styles .hs-prev', '.homes-styles .hs-prev .hs-pic']) {
      assert.ok(!positioned(decls(css, sel)), `${sel} is position:${prop(decls(css, sel), 'position')}`);
    }
    const pic = decls(css, '.homes-styles .hs-prev .hs-pic');
    assert.equal(prop(pic, 'width'), '100%');
    assert.equal(prop(pic, 'height'), '100%');
    assert.equal(prop(pic, 'display'), 'block');
  });
});
