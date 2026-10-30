/**
 * G256: the buff chips sit in one row at the top left. Since NOTIFY (UI audit
 * 2026-10-29) the activity feed that shared the corner is gone: the notices are
 * top centre and keep off the strip as a zone. Source: BuffViewManager.as 32,
 * 118, 149-150 (one row at the top).
 * Run: node --test tests/buff-strip-layout.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const css = readFileSync(join(pub, 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const html = readFileSync(join(pub, 'play/index.html'), 'utf8');
const client = readFileSync(join(here, '../../glitch-client/com/tinyspeck/engine/view/gameoverlay/BuffViewManager.as'), 'utf8');

describe('buff strip and the notices', () => {
  it('the original kept buffs in one row at the top', () => {
    assert.match(client, /y = 20;/);
    assert.match(client, /next_x \+= buff_ui\.width \+ GAP;/);
  });

  // NOTIFY (UI audit 2026-10-29): the top-left feed is gone; the notices are top centre and keep
  // off the strip as a zone (js/notify-view.js), the strip stays one row at the top left.
  it('the notices keep off the strip, which stays one row', () => {
    const view = readFileSync(new URL('../public/js/notify-view.js', import.meta.url), 'utf8');
    assert.match(view, /const buffs = relRect\(document\.getElementById\('buff-strip'\), rr\);\n\s+if \(buffs\) blockers\.push\(buffs\);/);
    assert.doesNotMatch(html, /id="activity-feed"/);
    assert.doesNotMatch(/\.buff-strip\s*\{[^}]*\}/.exec(css)[0], /flex-wrap:\s*wrap/, 'one row only');
  });
});
