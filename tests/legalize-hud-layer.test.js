/**
 * Legalize It's progress card under the windows (bug report #6, 2026-10-30): the card sat at
 * --z-dialog + 9, over every panel, the verb menu, the bug report form (--z-dialog + 5) and the
 * other windows, and hid them. It now has its own layer, --z-quest-hud: over the HUD and the
 * world banners, under every panel, menu, form and dialog.
 * Run: node --test tests/legalize-hud-layer.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTokens } from './css-tokens.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(root, 'public/style.css'), 'utf8');
const css = resolveTokens(raw);
const bugCss = resolveTokens(readFileSync(join(root, 'public/js/features/bug-report-feature.js'), 'utf8').match(/const STYLE = `([\s\S]*?)`;/)[1]);
// The z-index of the first `sel {` rule in `sheet` that sets one.
const z = (sel, sheet = css) => {
  for (let at = sheet.indexOf(`${sel} {`); at >= 0; at = sheet.indexOf(`${sel} {`, at + 1)) {
    const m = sheet.slice(at, sheet.indexOf('}', at)).match(/z-index: (-?\d+)/);
    if (m) return Number(m[1]);
  }
  assert.fail(`${sel} has no rule with a z-index`);
};

describe('Legalize It progress card layer', () => {
  it('takes the --z-quest-hud token', () => {
    assert.match(raw, /--z-quest-hud: calc\(var\(--z-overlay\) \+ 1\);/);
    assert.match(raw, /\n\.legalize-hud \{\n  position: absolute;\n  z-index: var\(--z-quest-hud\);/);
  });

  it('sits over the HUD and under every panel, menu, form and dialog', () => {
    const card = z('\n.legalize-hud');
    assert.ok(card > z('\n.street-nameplate'), `card ${card} over the HUD`);
    for (const sel of ['\n.side-panel', '\n.glitch-modal', '\n.map-panel', '\n.quest-dialogue', '\n.notify-notices', '[data-ui="modern"] #verb-menu']) {
      assert.ok(card < z(sel), `card ${card} < ${sel.trim()} ${z(sel)}`);
    }
    // TICKETS: the bug report form is the Reports sheet now (js/ui/reports-sheet.js, styled by the feature).
    const reports = '[data-ui="modern"] #game-root #bug-report-panel';
    assert.ok(card < z(reports, bugCss), `card ${card} < the Reports sheet ${z(reports, bugCss)}`);
  });
});
