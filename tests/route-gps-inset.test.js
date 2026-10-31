/**
 * The travel card (To: / Next:, js/features/map-routes-feature.js) sat under the Social
 * drawer's rail at the top right: its right edge ignored --inset-r, which the drawer sets on
 * #game-root (60px as the rail, 316px open; js/ui/social-drawer.js syncInset).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(import.meta.dirname, '../public/style.css'), 'utf8');

describe('route card clears the Social drawer', () => {
  it('the modern rule places it left of --inset-r', () => {
    const rule = css.match(/\[data-ui="modern"\] #game-root \.route-gps \{([^}]*)\}/);
    assert.ok(rule, 'the modern route card rule');
    assert.match(rule[1], /right:\s*max\(var\(--hud-inset\),\s*var\(--inset-r\)\)/);
    assert.match(rule[1], /max-width:[^;]*var\(--inset-r\)/);
  });
});
