// Austin's iPhone (2026-11-13): "Under settings I just see zoom and Night tint." On a short screen the
// Menu scrolls (style.css, under 760 px tall) and a phone shows no scroll bar, so the rows past its foot
// (Stick follows your thumb, last in Settings) looked missing. The foot fades while rows wait below.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const topbar = readFileSync(join(root, 'public/js/ui/topbar.js'), 'utf8');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');

describe('the Menu says there is more below', () => {
  it('marks data-more-below while it can scroll further, on open, scroll and resize', () => {
    assert.match(topbar, /const more = !list\.hidden && list\.scrollHeight - list\.scrollTop - list\.clientHeight > 4;/);
    assert.match(topbar, /list\.addEventListener\('scroll', edge, \{ passive: true \}\);/);
    assert.match(topbar, /new MutationObserver\(edge\)\.observe\(list, \{ attributes: true, attributeFilter: \['hidden'\] \}\);/);
  });
  it('fades the foot (Modern), with WebKit\'s prefix', () => {
    assert.match(css, /\[data-ui="modern"\] \.top-bar \.more-list\[data-more-below\] \{\n\s*-webkit-mask-image: linear-gradient\(to bottom, var\(--c-black\) calc\(100% - 48px\), transparent\);\n\s*mask-image:/);
  });
});
