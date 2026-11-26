// The home page's street (Austin 2026-11-25): a slice of Hechey Track in the game's own sprites,
// lit by Ur's clock, with quoins to grab and real lines to hear (public/landing/street.js).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { streetLines, streetLight, stageScale, bubblePlacement, MAGIC_ROCK_LINES, MAX_LINE, SKY } from '../public/landing/street.js?v=43593198';
import { daylightState, GAME_DAY_MS } from '../public/js/game-day.js?v=a532775d';
import { dialoguePool } from '../public/js/dialogue.js?v=fcfed1af';

const pub = join(import.meta.dirname, '..', 'public');
const home = readFileSync(join(pub, 'index.html'), 'utf8');
const css = readFileSync(join(pub, 'landing', 'landing.css'), 'utf8');
const hero = home.slice(home.indexOf('<header class="street-hero"'), home.indexOf('</header>'));
const gsjs = join(import.meta.dirname, '..', '..', 'glitch-GameServerJS', 'items', 'magic_rock.js');

describe('the home page street', () => {
  it('is lit by the game\'s own daylight at every hour of a game day', () => {
    const start = 1_800_000_000_000;
    for (let i = 0; i < 48; i++) {
      const now = start + (GAME_DAY_MS / 48) * i;
      const l = streetLight(now);
      const d = daylightState(now);
      assert.equal(l.phase, d.phase);
      assert.equal(l.tint, d.cssColor);
      assert.equal(l.tintOpacity, d.opacity);
      assert.deepEqual(l.sky, SKY[d.phase]);
      assert.match(l.clock, /^(1[0-2]|[1-9]):[0-5]\d (AM|PM)$/);
    }
  });

  it('every speaker says lines from Tiny Speck\'s dialogue, short enough for a bubble', () => {
    const speakers = [...hero.matchAll(/data-talk="([a-z_]+)"/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(speakers)].sort(), ['magic_rock', 'npc_butterfly', 'npc_chicken', 'npc_piggy', 'trant_fruit']);
    for (const s of speakers) {
      const lines = streetLines(s);
      assert.ok(lines.length > 0, s);
      for (const line of lines) {
        assert.ok(line.length <= MAX_LINE, `${s}: ${line}`);
        if (s !== 'magic_rock') assert.ok(dialoguePool(s).includes(line), `${s}: from the pool`);
      }
    }
  });

  it('the Magic Rock is the Magic Rock (not the cubimal) and says its own two hellos', { skip: !existsSync(gsjs) && 'needs ../glitch-GameServerJS' }, () => {
    assert.match(hero, /data-talk="magic_rock"[^>]*><img src="assets\/sprites\/icons\/magic_rock@3x\.webp/);
    assert.ok(!hero.includes('cubimal'));
    const src = readFileSync(gsjs, 'utf8');
    assert.ok(src.includes('"Hey "+utils.escape(pc.label)+"! Come over here to talk to me."'));
    assert.ok(src.includes('"Hey, "+utils.escape(pc.label)+"! I have something for you that I think is worth your time."'));
    assert.deepEqual(MAGIC_ROCK_LINES, ['Hey friend! Come over here to talk to me.', 'Hey, friend! I have something for you that I think is worth your time.']);
  });

  it('walkers face the way they walk: every sheet faces right, so out is unflipped and back is flipped', () => {
    const frames = (name) => css.match(new RegExp(`@keyframes ${name} \\{([^\\n]*)\\}`))[1];
    // Glitch and piggy walk right first (positive translate), so the first half is scale 1.
    assert.match(css, /\.sh-walk-glitch \{[^}]*sh-glitch-path[^}]*sh-turn-back/);
    assert.match(frames('sh-glitch-path'), /46% \{ translate: 180px; \}/);
    assert.match(frames('sh-turn-back'), /^ 0% \{ scale: 1 1; \} 48% \{ scale: -1 1; \}/);
    assert.match(css, /\.sh-walk-piggy \{[^}]*sh-piggy-path[^}]*sh-turn-mid/);
    assert.match(frames('sh-piggy-path'), /45%, 55% \{ translate: 100px; \}/);
    assert.match(frames('sh-turn-mid'), /^ 0% \{ scale: 1 1; \} 50% \{ scale: -1 1; \}/);
    // The chicken walks left first, so it starts flipped.
    assert.match(css, /\.sh-walk-chicken \{[^}]*sh-chicken-path[^}]*sh-turn-first/);
    assert.match(frames('sh-chicken-path'), /50% \{ translate: -50px; \}/);
    assert.match(frames('sh-turn-first'), /^ 0% \{ scale: -1 1; \} 50% \{ scale: 1 1; \}/);
    // The restoration diorama's piggy too.
    const rcss = readFileSync(join(pub, 'restoration', 'restoration.css'), 'utf8');
    assert.match(rcss, /@keyframes piggy-walk \{\s*0% \{ transform: translateX\(0\) scaleX\(1\); \}\s*45% \{ transform: translateX\(56px\) scaleX\(1\); \}/);
  });

  it('stands everything on the walk line: 96 px up, less the empty rows under each sprite\'s feet', () => {
    assert.match(css, /\.sh-on \{ bottom: 96px; \}/);
    const bottom = (sel) => Number(css.match(new RegExp(`\\${sel} \\{[^}]*bottom: (\\d+)px`))[1]);
    assert.equal(bottom('.sh-walk-piggy'), 96 - 1); // piggy walk cells: 1 empty row under the feet
    assert.equal(bottom('.sh-walk-chicken'), Math.round(96 - 13 * 0.7)); // 13 rows, drawn at 0.7
    assert.equal(bottom('.sh-walk-glitch'), 92); // restoration.css's -4px margin under the Glitch sheet + its 4 rows
    // The path band the walkers stand on runs 22 to 37 px down a 124 px ground: 87 to 102 px up.
    assert.match(css, /\.sh-ground \{[^}]*bottom: -90px; height: 214px;[^}]*var\(--path\) 22px 34px/);
  });

  it('says the years without brackets, in a smaller tag', () => {
    assert.match(hero, /<p class="kicker">A fan remake of Glitch <span class="kicker-years">2009 to 2012<\/span><\/p>/);
    assert.ok(!home.includes('(2009 to 2012)'));
  });

  it('every picture the street and the page\'s stylesheet name exists', () => {
    for (const [, url] of css.matchAll(/url\("(\.\.\/[^"?]+)/g)) assert.ok(existsSync(resolve(pub, 'landing', url)), url);
    for (const [, src] of hero.matchAll(/src="([^"?]+)/g)) assert.ok(existsSync(join(pub, src)), src);
  });

  it('hangs a bubble under its speaker when there is no room above it in the hero', () => {
    assert.deepEqual(bubblePlacement(200, 70, 260), { under: false, top: 200 });
    assert.deepEqual(bubblePlacement(60, 70, 120), { under: true, top: 120 });
    assert.match(css, /\.sh-bubble\.is-below \{ transform: translate\(-50%, 0\); \}/);
  });

  it('the ground runs below the stage, so parallax never shows a gap under it', () => {
    assert.match(css, /\.sh-ground \{\n  left: -2000px; right: -2000px; bottom: -90px; height: 214px;/);
    assert.match(css, /\.sh-layer \{[^}]*calc\(var\(--py\) \* var\(--d\) \* -0\.4px\)/);
    // The largest vertical shift: 15 (half the 30 range) x 0.4 x d 1 = 6 px, well inside the 90 px.
  });

  it('draws the iMG mark from the game\'s vector file, not the 1x quoin sheet', () => {
    assert.match(hero, /<span class="sh-pill"><img src="assets\/imagination\/ui\/moment_icon_imagination\.svg/);
    assert.ok(!/sh-pill"><span class="sheet sheet-quoin/.test(hero));
  });

  it('draws every sprite from its 3x copy on sharp screens (image-set or srcset beside the 1x file)', () => {
    const rcss = readFileSync(join(pub, 'restoration', 'restoration.css'), 'utf8');
    for (const [file, text, dir] of [['landing.css', css, 'landing'], ['restoration.css', rcss, 'restoration']]) {
      for (const [, url] of text.matchAll(/url\(["']?(\.\.\/assets\/sprites\/[^"')?]+\.webp)/g)) {
        if (url.includes('@3x')) continue;
        const hi = url.replace(/\.webp$/, '@3x.webp');
        if (!existsSync(resolve(pub, dir, hi))) continue;
        assert.ok(new RegExp(`image-set\\(url\\(["']${url.replace(/[.?]/g, '\\$&')}[^)]*\\) 1x, url\\(["']${hi.replace(/[.?]/g, '\\$&')}`).test(text), `${file}: ${url} has its 3x copy`);
      }
    }
    for (const [, tag] of home.matchAll(/<img ([^>]*src="assets\/sprites\/[^"]+"[^>]*)>/g)) {
      const src = tag.match(/src="([^"?]+)/)[1];
      if (src.includes('@3x') || !existsSync(join(pub, src.replace(/\.webp$/, '@3x.webp')))) continue;
      assert.match(tag, /srcset="[^"]+@3x\.webp[^"]* 3x"/, src);
    }
  });

  it('scales the 1200 px street to the window, never below 0.72', () => {
    assert.equal(stageScale(1440), 1.2);
    assert.equal(stageScale(400), 0.72);
  });

  it('stops moving when the visitor asks for less motion', () => {
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.street-hero \*, \.street-hero \*::before, \.game-shot \*, \.todo-band \* \{ animation: none !important; \}/);
  });
});
