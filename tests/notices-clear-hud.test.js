/**
 * Notices and the tutorial pill on a narrow screen (the mobile QA, 2026-11-12): with no street name
 * above them the notices sat at the top over the top bar's pills and the tutorial pill, and the pill
 * sat over the titles of open sheets.
 * Run: node --test tests/notices-clear-hud.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeBelow } from '../public/js/notify.js?v=1fb97b21';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const view = readFileSync(join(root, 'public/js/notify-view.js'), 'utf8');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');

describe('notices keep clear of the HUD', () => {
  it('the pills and the tutorial pill are obstacles', () => {
    assert.match(view, /for \(const sel of \['#hud-stats', 'header\.top-bar \.top-actions', '#newxp-pill'\]\) \{\s*const r = relRect\(document\.querySelector\(sel\), rr\);\s*if \(r\) blockers\.push\(r\);/);
  });
  it('a stack over a pill goes under it; one between the pills stays; one with no room waits', () => {
    const stats = { left: 8, top: 4, right: 204, bottom: 48 };
    const actions = { left: 397, top: 4, right: 726, bottom: 48 };
    assert.deepEqual(placeBelow({ left: 117, right: 557, top: 10, bottom: 70 }, [stats, actions]), { dy: 44, wait: false });
    assert.deepEqual(placeBelow({ left: 220, right: 380, top: 10, bottom: 70 }, [stats, actions]), { dy: 0, wait: false });
    assert.equal(placeBelow({ left: 117, right: 557, top: 10, bottom: 200 }, [stats, actions], { maxBottom: 212 }).wait, true);
  });
  it('on a phone the tutorial pill waits while a sheet or window is open', () => {
    assert.match(css, /:root\.touch-phone\[data-ui="modern"\]:has\(#game-root :is\(\.ui-sheet, \.side-panel, \.glitch-modal, \.map-panel\):not\(\[hidden\]\)\) #newxp-pill \{ visibility: hidden; \}/);
  });
});
