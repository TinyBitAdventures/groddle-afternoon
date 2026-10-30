/**
 * The Classic skin stays a layer over the modern game (classic-spec build-plan
 * §1, §5): every rule in public/css/classic.css is scoped under
 * :root[data-ui="classic"], its colours come only from the --c-classic-*
 * palette (and that palette from nowhere else), it never hides the elements
 * slugs, measured zones and tests read, no Classic module draws a canvas, and
 * no Classic file names the trademark or uses an em-dash.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allDeclarations, maskCss, readTokens } from '../tools/tokens/css-sources.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const CSS = 'public/css/classic.css';
const SCOPE = ':root[data-ui="classic"]';
const classicJs = readdirSync(join(root, 'public/js/classic')).filter((f) => f.endsWith('.js')).map((f) => `public/js/classic/${f}`);

/** Each style rule's selector list, @media / @supports blocks opened (masked text, so comments and strings are gone). */
function selectors(text) {
  const masked = maskCss(text);
  const out = [];
  let depth = 0;
  let start = 0;
  const atStack = [];
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '{') {
      // Structure from the masked text, words from the original (strings like "classic" kept, comments dropped).
      const prelude = text.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, ' ').trim().replace(/\s+/g, ' ');
      if (prelude.startsWith('@')) atStack.push({ depth, frames: /^@(-webkit-)?keyframes\b/.test(prelude) });
      else if (!atStack.some((a) => a.frames)) out.push(prelude);
      depth++;
      start = i + 1;
    } else if (c === '}') {
      depth--;
      if (atStack.length && atStack[atStack.length - 1].depth === depth) atStack.pop();
      start = i + 1;
    } else if (c === ';') start = i + 1;
  }
  return out;
}

/** A selector list split on its own commas, not those inside :is(...) or :not(...). */
function topLevelParts(sel) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < sel.length; i++) {
    if (sel[i] === '(') depth++;
    else if (sel[i] === ')') depth--;
    else if (sel[i] === ',' && depth === 0) { parts.push(sel.slice(start, i)); start = i + 1; }
  }
  parts.push(sel.slice(start));
  return parts;
}

describe('Classic skin: classic.css', () => {
  const text = read(CSS);

  it('every selector is under :root[data-ui="classic"]', () => {
    const list = selectors(text);
    assert.ok(list.length > 10, `${list.length} rules`);
    const bad = [];
    for (const sel of list) for (const part of topLevelParts(sel)) if (!part.trim().startsWith(SCOPE)) bad.push(part.trim());
    assert.deepEqual(bad, []);
  });

  it('the selector reader sees nested and grouped rules', () => {
    assert.deepEqual(selectors('a, b { x: 1 } @media (min-width: 1px) { c { y: 2 } } /* d { } */ @keyframes k { to { z: 1 } } e { f: 1 }'), ['a, b', 'c', 'e']);
    assert.deepEqual(topLevelParts('a:is(b, c), d'), ['a:is(b, c)', ' d']);
  });

  it('its colours are the Classic palette only, and the palette is used nowhere else', () => {
    const tokens = readTokens(root);
    const classic = [...tokens.keys()].filter((n) => n.startsWith('--c-classic-'));
    assert.ok(classic.length >= 30, `${classic.length} Classic colours`);
    for (const n of ['--c-classic-page', '--c-classic-panel', '--c-classic-close', '--c-classic-focus', '--c-classic-text', '--c-classic-title']) assert.ok(tokens.has(n), n);
    for (const n of ['--font-classic-title', '--font-classic-body', '--fs-classic-body', '--fs-classic-window']) assert.ok(tokens.has(n), n);
    const bad = [];
    for (const d of allDeclarations(root)) {
      for (const m of d.value.matchAll(/var\((--c-[\w-]+)/g)) {
        const isClassic = m[1].startsWith('--c-classic-');
        if (d.file === CSS && !isClassic) bad.push(`${d.file}: ${m[1]} in ${d.selector}`);
        if (d.file !== CSS && isClassic) bad.push(`${d.file}: ${m[1]} in ${d.selector}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  it('the colours the spec read off a reference frame say so', () => {
    const style = read('public/style.css');
    const block = style.slice(style.indexOf('/* classic:start */'), style.indexOf('/* classic:end */'));
    for (const n of ['--c-classic-text', '--c-classic-title', '--c-classic-btn-minor-top', '--c-classic-btn-dark-top']) {
      assert.match(block, new RegExp(`${n}: #[0-9a-f]{6};\\s*/\\* PROPOSED, from frame ref/`), n);
    }
    for (const n of ['--c-classic-page', '--c-classic-slot-ring', '--c-classic-tab-off', '--c-classic-you']) {
      assert.match(block, new RegExp(`${n}: #[0-9a-f]{6};\\s*/\\*[^*]*code default`), n);
    }
  });

  it('never hides an element slugs, zones, speech or tests read (build-plan §5)', () => {
    const KEEP = ['#stat-img', '#stat-xp', '#bar-energy', '#bar-mood', '#stat-currants', '#street-nameplate', '#buff-strip', '#local-chat-dock', '#pack-bar',
      '#player-menu-btn', 'header.top-bar', '.top-bar', '#mute-btn', '#more-btn', '#more-list', '#notify-notices', '#activity-history', '#quest-tracker-list', '#verb-menu', '.pack-slot', '#game-root', 'canvas'];
    const bad = [];
    for (const d of allDeclarations(root).filter((x) => x.file === CSS)) {
      const hides = (d.prop === 'display' && /\bnone\b/.test(d.value)) || (d.prop === 'visibility' && /hidden/.test(d.value) && !/notify-notices/.test(d.selector));
      if (!hides) continue;
      for (const part of topLevelParts(d.selector)) {
        const last = part.trim().split(/\s+/).pop();
        if (KEEP.some((k) => last === k || last.startsWith(`${k}:`) || last.startsWith(`${k}[`) || last.startsWith(`${k}.`))) bad.push(part.trim());
      }
    }
    assert.deepEqual(bad, []);
  });

  it('linked after style.css on both play pages', () => {
    for (const page of ['public/play/index.html', 'public/play/online/index.html']) {
      const html = read(page);
      const style = html.indexOf('href="style.css?v=');
      const classic = html.indexOf('<link rel="stylesheet" href="css/classic.css?v=');
      assert.ok(style > 0 && classic > style, page);
      assert.ok(classic < html.indexOf('<script type="module"'), `${page}: before the game`);
    }
  });
});

describe('Classic skin: modules and copy', () => {
  it('no Classic module makes a canvas (tools read the first canvas on the page)', () => {
    for (const f of classicJs) assert.doesNotMatch(read(f), /createElement\(\s*['"]canvas['"]\s*\)|<canvas/i, f);
  });

  it('no Classic file names the trademark or uses an em-dash', () => {
    for (const f of [...classicJs, CSS]) {
      const src = read(f);
      assert.doesNotMatch(src, /glitch/i, f);
      assert.doesNotMatch(src, /—/, f);
    }
  });

  it('the verb menu sits on its thing with the 2012 tail, from the place game.js works out for both skins', () => {
    const css = read(CSS);
    for (const v of ['--vm-left', '--vm-top', '--vm-bottom', '--vm-tail']) assert.match(css, new RegExp(`#verb-menu[^{]*\\{[^}]*var\\(${v}`), v);
    assert.match(css, /#verb-menu \.vm-ptr \{[^}]*int_menu_norm\.png/);
    assert.match(css, /int_menu_dis\.png/);
    assert.match(css, /#verb-menu\.below \.vm-ptr \{[^}]*scaleY\(-1\)/);
    assert.match(read('public/game.js'), /function placeWorldVerbMenu\(target\)/);
  });

  it('Skills, Buffs, Badges, Quests and the Map in the 2012 window shell; Upgrades the hub\'s sub-screen', () => {
    const css = read(CSS);
    const shell = /#skills-panel, #buffs-panel, #achieve-panel, #quest-panel\) > \.side-card,\n:root\[data-ui="classic"\] #game-root #make-panel > \.make-card,\n:root\[data-ui="classic"\] #game-root #map-panel > \.map-card \{[^}]*border-radius: 4px;[^}]*0 0 0 1px color-mix\(in srgb, var\(--c-classic-ink\) 37%, transparent\),\n\s+0 0 1px 7px color-mix\(in srgb, var\(--c-classic-ink\) 15%, transparent\);/;
    assert.match(css, shell);
    assert.match(css, /#map-panel > \.map-card \{ width: min\(calc\(764 \* var\(--cu\)\), 100%\); \}/);
    assert.match(css, /width: min\(calc\(615 \* var\(--cu\)\), 100%\);/);
    assert.match(css, /\.verb-menu-x::before,[\s\S]{0,300}background: var\(--c-classic-close\);/);
    assert.match(css, /#imagination-panel:not\(\[hidden\]\) \{[^}]*color-mix\(in srgb, var\(--c-classic-ink\) 70%, transparent\)/);
    // No shade over the world for the windows.
    assert.match(css, /#map-panel, #make-panel\):not\(\[hidden\]\) \{[^}]*background: none;[^}]*backdrop-filter: none;/);
  });

  it('window contents at the 2012 size: type FROM FRAME, the Quest Log rows, the footer buttons', () => {
    const style = read('public/style.css');
    for (const n of ['--fs-classic-window', '--fs-classic-row', '--fs-classic-row-title', '--fs-classic-button']) assert.match(style, new RegExp(`${n}: [^;]+; +/\\* \\d+px, FROM FRAME ref/`), n);
    const css = read(CSS);
    assert.match(css, /font-size: calc\(var\(--fs-classic-row\) \* var\(--cu-n, 1\)\);/);
    assert.match(css, /border-bottom: 1px solid var\(--c-classic-row-rule\);/);
    assert.match(css, /min-height: calc\(29 \* var\(--cu\)\);/, 'the 29 px footer buttons');
    assert.match(css, /#make-panel > \.make-card \{ width: min\(calc\(614 \* var\(--cu\)\), 100%\);/);
    assert.match(css, /#map-panel \.map-canvas \{[^}]*height: calc\(460 \* var\(--cu\)\);/);
  });

  it('montage fixes: quest steps read desc (got/need); Make\'s recipe and result drop the tool tabs and keep their buttons in the footer band', () => {
    const css = read(CSS);
    assert.match(css, /#quest-panel \.qc-head \.qc-step \+ \.qc-count::before,[^{]*\{ content: "\("; \}/);
    assert.match(css, /:has\(#make-result:not\(\[hidden\]\), #make-detail:not\(\[hidden\]\)\) #make-tools,/);
    assert.match(css, /#make-panel #make-result \.mr-actions \{\s*position: absolute;[^}]*min-height: calc\(64 \* var\(--cu\)\);/);
    assert.match(css, /#make-panel > \.make-card \{[^}]*min-width: min\(calc\(614 \* var\(--cu\)\)/, 'the window keeps its 614 px without the tabs');
  });

  it('dialogs: conversations, prompts and quest complete in the 462 px dark box; How many as the client\'s quantity picker', () => {
    const css = read(CSS);
    assert.match(css, /#award-screen\[data-kind="quest"\] \.award-card \{[^}]*width: min\(calc\(462 \* var\(--cu\)\)/);
    assert.match(css, /background: color-mix\(in srgb, var\(--c-classic-dark\) 90%, transparent\);/);
    assert.match(css, /#award-screen\[data-kind="quest"\] \{ background: none; \}/, 'no full screen');
    assert.match(css, /\.count-pop :is\(\.count-pop-num, \.feed-picker-qty-input, \[data-vq-val\]\):focus \{ outline: none; box-shadow: 0 0 0 2px var\(--c-classic-qty-ring\); \}/);
    const style = read('public/style.css');
    assert.match(style, /--c-classic-quest-title: #[0-9a-f]{6}; +\/\* FROM FRAME/);
    // How many is MPANELS' shared chooser (js/ui/count-chooser.js): one Classic rule set for Feed, Eat more, Drop, Buy and Sell.
    assert.match(css, /\.count-pop :is\(\.count-pop-num, \.feed-picker-qty-input, \[data-vq-val\]\) \{[^}]*height: calc\(30 \* var\(--cu\)\);/);
    assert.match(css, /\.count-pop :is\(\.count-pop-dec, \.count-pop-inc, \.count-pop-max, \[data-pack-eat-choice\]/);
    // The familiar's and the voice of rock's looks stay theirs.
    assert.match(css, /\.quest-dialogue:not\(\[data-look="familiar"\], \[data-look="vog"\]\)/);
  });
});
