// The home page's vendor (Austin 2026-11-27): the street at the top of the home page shows Hechey
// Track's own Street Spirit, a still cut from the game's sprite sheet, not the old vendor deco.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spiritForStreet, spiritSheet } from '../public/js/street-spirits.js?v=2a97502d';
import { streetLines } from '../public/landing/street.js?v=82fae819';
import { dialoguePool } from '../public/js/dialogue.js?v=fcfed1af';

const pub = join(import.meta.dirname, '..', 'public');
const home = readFileSync(join(pub, 'index.html'), 'utf8');
const css = readFileSync(join(pub, 'landing', 'landing.css'), 'utf8');
const hero = home.slice(home.indexOf('<header class="street-hero"'), home.indexOf('</header>'));
const index = JSON.parse(readFileSync(join(pub, 'assets/streets/index.json'), 'utf8'));
const ecology = JSON.parse(readFileSync(join(pub, 'assets/content/street-ecology.json'), 'utf8'));

/** A WebP's canvas size (VP8X, VP8L or VP8 header). */
function webpSize(file) {
  const b = readFileSync(file);
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

describe('the home page vendor', () => {
  const [tsid, street] = Object.entries(index.streets).find(([, s]) => s.label === 'Hechey Track');
  const pick = spiritForStreet({ tsid, hubId: street.hubId });

  it('is not the old vendor deco any more', () => {
    assert.ok(!hero.includes('decos/groddle/vendor'), 'the hero still draws decos/groddle/vendor');
  });

  it('is Hechey Track\'s own Street Spirit: the Groddle spirit in the look the game gives that street', () => {
    assert.equal(street.hubName, 'Groddle Forest');
    assert.equal(ecology.streets[tsid].counts.street_spirit, 1);
    assert.equal(pick.variant, 'groddle');
    const m = hero.match(/<button class="sh-on sh-tap sh-spirit"[^>]*data-talk="street_spirit"[^>]*><img src="assets\/sprites\/street-spirits\/frames\/([a-z]+)_([a-z]+)_idle_f0\.webp\?v=[0-9a-f]{8}" srcset="assets\/sprites\/street-spirits\/frames\/\1_\2_idle_f0@3x\.webp\?v=[0-9a-f]{8} 3x"/);
    assert.ok(m, 'a street-spirit still in a talk button');
    assert.deepEqual([m[1], m[2]], [pick.variant, pick.look]);
  });

  it('is the idle sheet\'s first frame, trimmed to the spirit, with a 3x copy three times the size', () => {
    const sheet = spiritSheet(pick.variant, pick.look, 'idle');
    assert.ok(existsSync(join(pub, sheet.path)));
    const lo = join(pub, `assets/sprites/street-spirits/frames/${pick.variant}_${pick.look}_idle_f0.webp`);
    const hi = lo.replace(/\.webp$/, '@3x.webp');
    const [w, h] = webpSize(lo);
    assert.ok(w <= sheet.fw && h <= sheet.fh, `${w}x${h} inside the ${sheet.fw}x${sheet.fh} cell`);
    assert.deepEqual(webpSize(hi), [w * 3, h * 3]);
    const img = hero.match(/sh-spirit"[^>]*><img [^>]*width="(\d+)" height="(\d+)"/);
    assert.deepEqual([Number(img[1]), Number(img[2])], [w, h]);
  });

  it('stands on the walk line like the others (no empty rows under its feet)', () => {
    assert.match(css, /\.sh-spirit \{[^}]*left: \d+px;/);
    assert.ok(!/\.sh-spirit \{[^}]*bottom:/.test(css), 'takes .sh-on\'s 96 px');
  });

  it('says the Groddle spirit\'s own lines when clicked', () => {
    const lines = streetLines('street_spirit');
    assert.ok(lines.length >= 3);
    for (const line of lines) assert.ok(dialoguePool('street_spirit').includes(line), line);
    assert.match(hero, /data-talk="street_spirit" data-name="Street Spirit" aria-label="Talk to the Street Spirit"/);
  });
});
