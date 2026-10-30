/**
 * Window announcements (js/overlay-art.js playVectorOverlay: the Qurazy banner, "OMG! There's a
 * Qurazy Quoin") sit above the world and the HUD and under every window: the banner drew at an inline
 * z-index 70, over an open note card (.glitch-modal, 40). Their layer is the --z-overlay token.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTokens } from './css-tokens.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = resolveTokens(readFileSync(join(root, 'public/style.css'), 'utf8'));
// The z-index of the first top-level `sel { ... }` rule that sets one.
const z = (sel) => {
  for (let at = css.indexOf(`\n${sel} {`); at >= 0; at = css.indexOf(`\n${sel} {`, at + 1)) {
    const m = css.slice(at, css.indexOf('}', at)).match(/z-index: (-?\d+)/);
    if (m) return Number(m[1]);
  }
  assert.fail(`${sel} has no rule with a z-index`);
};

describe('the window announcement layer', () => {
  it('overlay canvases take --z-overlay from style.css, not an inline number', () => {
    const src = readFileSync(join(root, 'public/js/overlay-art.js'), 'utf8');
    const fn = src.slice(src.indexOf('export async function playVectorOverlay'), src.indexOf('Sheets in the street'));
    assert.doesNotMatch(fn, /zIndex/);
    assert.match(readFileSync(join(root, 'public/style.css'), 'utf8'), /#game-root > canvas\.overlay-art \{ z-index: var\(--z-overlay\); \}/);
  });

  it('sits over the HUD and under side panels, modals, the pack and notices', () => {
    const overlay = z('#game-root > canvas.overlay-art');
    for (const sel of ['.street-nameplate', '.play-context', '.buff-strip', '.local-chat-dock', '.activity-log']) assert.ok(overlay > z(sel), `${overlay} > ${sel}`);
    for (const sel of ['.side-panel', '.glitch-modal', '.map-panel', '.pack-bar', '.notify-notices']) assert.ok(overlay < z(sel), `${overlay} < ${sel}`);
  });
});
