/**
 * G256: the buff chips and the activity feed share the top-left corner; the
 * feed steps down below the chips whenever they show, so a badge never covers
 * a line. Source: BuffViewManager.as 32, 118, 149-150 (one row at the top).
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

/** `top` of a selector's rules, split into the base value and each media block's value. */
function tops(selector) {
  const out = {};
  const re = /@media\s*\(([^)]*)\)\s*\{|\}|([^{}]+)\{([^{}]*)\}/g;
  const stack = [];
  let m;
  while ((m = re.exec(css))) {
    if (m[1] !== undefined) { stack.push(m[1].trim()); continue; }
    if (m[0] === '}') { stack.pop(); continue; }
    const sels = m[2].split(',').map((s) => s.trim());
    if (!sels.includes(selector)) continue;
    const top = /(?:^|;|\s)top:\s*([^;]+);/.exec(m[3]);
    if (top) out[stack.at(-1) || 'base'] = top[1].trim();
  }
  return out;
}

describe('buff strip and activity feed', () => {
  it('the original kept buffs in one row at the top', () => {
    assert.match(client, /y = 20;/);
    assert.match(client, /next_x \+= buff_ui\.width \+ GAP;/);
  });

  it('the strip comes before the feed in the same parent, so the sibling rule applies', () => {
    const strip = html.indexOf('id="buff-strip"');
    const feed = html.indexOf('id="activity-feed"');
    assert.ok(strip > 0 && feed > strip);
    assert.doesNotMatch(html.slice(strip, feed), /<\/div>\s*<\/(div|section|main)>/, 'no parent closes between them');
  });

  it('strip and feed start at the same top at every breakpoint', () => {
    const strip = tops('.buff-strip');
    const feed = tops('.activity-feed');
    assert.equal(strip.base, feed.base);
    assert.equal(strip['max-width: 760px'], feed['max-width: 760px']);
    assert.equal(strip['min-width: 1500px'], feed['min-width: 1500px']);
  });

  it('a shown strip pushes the feed down by its row height and a gap', () => {
    const chip = /\.buff-chip\s*\{[^}]*height:\s*(\d+)px/.exec(css);
    const push = /\.buff-strip:not\(\[hidden\]\)\s*~\s*\.activity-feed\s*\{\s*margin-top:\s*(\d+)px/.exec(css);
    assert.ok(chip && push);
    assert.ok(Number(push[1]) >= Number(chip[1]) + 4, `${push[1]} px clears a ${chip[1]} px chip`);
    assert.doesNotMatch(/\.buff-strip\s*\{[^}]*\}/.exec(css)[0], /flex-wrap:\s*wrap/, 'one row only');
  });
});
