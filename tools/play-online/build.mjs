#!/usr/bin/env node
/**
 * Writes public/play/online/index.html, the multiplayer entry page, from
 * public/play/index.html (multiplayer phase 2): the same game shell, so the
 * two never drift, with these differences:
 *
 * - <html data-mode="multiplayer"> and <base href="../../"> (one folder deeper);
 * - the mode-entry script first of all scripts: it declares multiplayer and
 *   strips every demo and QA param (js/game-mode.js);
 * - no js/practice-mode.js (practice copies are solo only);
 * - the sign-in gate (#online-gate) over the shell, and game.js loaded by
 *   js/online-boot.js only once the player's save is in memory.
 *
 *   node tools/play-online/build.mjs           write the page
 *   node tools/play-online/build.mjs --check   exit 1 when the page is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = join(root, 'public/play/index.html');
const TARGET = join(root, 'public/play/online/index.html');

/** The cache key of js/online-boot.js (bump it when that file or js/minn-account.js changes). */
export const ONLINE_BOOT_SRC = 'js/online-boot.js?v=play-9';

const MODE_ENTRY = `  <!--
    Multiplayer entry (js/game-mode.js). This must stay the FIRST script on the page, ahead of
    Pixi and game.js, and the page never loads js/practice-mode.js (practice copies are solo only).
    It declares the mode from <html data-mode> and, in multiplayer, strips location.search so the
    game's query reads (game.js URLSearchParams, engine.param in features) see no demo or QA params.
  -->
  <script id="mode-entry">
    (function multiplayerEntry(w, d) {
      var mode = d.documentElement.getAttribute('data-mode') === 'multiplayer' ? 'multiplayer' : 'solo';
      w.GRODDLE_MODE = mode;
      if (mode !== 'multiplayer') return;
      var loc = w.location;
      if (!loc.search) return;
      var clean = loc.pathname + loc.hash;
      try {
        w.history.replaceState(w.history.state, '', clean);
      } catch (e) {
        loc.replace(clean);
        return;
      }
      // Never boot with params still in place.
      if (loc.search) loc.replace(clean);
    })(window, document);
  </script>`;

const ONLINE_STYLE = `  <style>
    /* The sign-in gate (js/online-boot.js) covers the shell until the save is loaded. */
    body.online-gated #wrap { display: none; }
    .online-gate { min-height: 100vh; display: grid; place-items: center; padding: 1rem; background-attachment: fixed; }
    .online-gate[hidden] { display: none; }
    .online-gate .card { line-height: 1.4; text-align: left; max-width: 26rem; }
    .online-gate .card img { display: block; width: 44px; height: 44px; margin: 0 auto 0.5rem; }
    .online-gate .online-play {
      display: block; width: 100%; margin-top: 0.85rem; text-align: center; text-decoration: none; border: 0; cursor: pointer;
      border-radius: 10px; padding: 0.7rem 1rem; font: inherit; font-size: 1rem; font-weight: 700; color: white;
      background: linear-gradient(180deg, #f09a55, var(--accent)); box-shadow: 0 3px 0 #b85a24;
    }
    .online-gate .online-play:hover { filter: brightness(1.05); }
    .online-gate .online-play:active { transform: translateY(2px); box-shadow: 0 1px 0 #b85a24; }
    .online-gate .online-alt {
      display: block; margin-top: 0.6rem; text-align: center; text-decoration: none; border-radius: 10px; padding: 0.6rem 1rem;
      font-weight: 700; color: #2e5a20; background: #eef6e4; box-shadow: inset 0 0 0 2px #b9d8a0;
    }
    .online-gate .online-home { display: block; margin-top: 0.6rem; text-align: center; color: #2e5a20; font-weight: 700; }
    .online-gate button.online-home { width: 100%; padding: 0; border: 0; background: none; font: inherit; font-weight: 700; text-decoration: underline; cursor: pointer; }
    /* Play solo under the sign-in (Austin 2026-10-26: Play shows the sign-in or a button to play solo). */
    .online-gate .online-solo { margin-top: 1.1rem; padding-top: 0.9rem; border-top: 1px solid rgba(46, 90, 32, 0.2); }
    .online-gate .online-solo h3 { margin: 0 0 0.25rem; font-size: 1rem; }
    .online-gate .online-solo p { margin: 0; }
    /* The multiplayer save state (js/save-store.js groddle:save-state). */
    .save-pill {
      position: fixed; left: 10px; bottom: 10px; z-index: 60; display: flex; gap: 0.45rem; align-items: center;
      padding: 0.3rem 0.7rem; border-radius: 999px; font: 600 12px/1.3 system-ui, sans-serif; color: #24401b;
      background: rgba(244, 251, 236, 0.92); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25); pointer-events: auto;
    }
    .save-pill .save-pill-who { opacity: 0.75; }
    .save-pill .save-pill-state::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 0.35rem; border-radius: 50%; background: #5fa83a; vertical-align: 1px; }
    .save-pill[data-state="pending"] .save-pill-state::before, .save-pill[data-state="saving"] .save-pill-state::before { background: #e8a33c; }
    .save-pill[data-state="offline"] .save-pill-state::before, .save-pill[data-state="error"] .save-pill-state::before { background: #c8553d; }
    .save-pill[data-state="conflict"], .save-pill[data-state="signed-out"] { background: #fff1d6; }
    .save-pill[data-state="conflict"] .save-pill-state::before, .save-pill[data-state="signed-out"] .save-pill-state::before { background: #c8553d; }
    .save-pill a { color: #8a3d12; }
  </style>`;

const GATE = `  <!-- Multiplayer phase 2: js/online-boot.js signs the player in and loads the save before game.js. -->
  <main id="online-gate" class="online-gate" data-online="checking">
    <div class="card" role="status" aria-live="polite">
      <img src="favicon.svg?v=quoin" alt="" width="44" height="44" />
      <h2>Finding your account</h2>
      <p>Checking whether you are signed in…</p>
      <noscript><p>Multiplayer needs JavaScript. <a href="play/">Play solo</a></p></noscript>
    </div>
  </main>`;

function swap(html, find, replace, label) {
  const at = typeof find === 'string' ? html.indexOf(find) : html.search(find);
  if (at < 0) throw new Error(`play/index.html no longer has ${label}: update tools/play-online/build.mjs`);
  return html.replace(find, replace);
}

/** The multiplayer page made from the solo shell's markup. */
export function buildOnlinePage(play) {
  let html = play;
  html = swap(html, '<!DOCTYPE html>\n<html lang="en">', '<!DOCTYPE html>\n<!-- Generated from play/index.html by tools/play-online/build.mjs: edit that page or the builder, never this file. -->\n<html lang="en" data-mode="multiplayer">', 'its <html> tag');
  html = swap(html, /  <!-- The game lives at \/play\/;[^\n]*-->\n  <base href="\.\.\/" \/>/, `  <!-- The multiplayer entry lives at /play/online/; every path stays relative to the site root. -->\n  <base href="../../" />\n${MODE_ENTRY}`, 'its <base>');
  html = swap(html, '<title>Groddle Afternoon</title>', '<meta name="robots" content="noindex" />\n  <title>Groddle Afternoon · Multiplayer</title>', 'its <title>');
  html = swap(html, /  <!-- \?practice=1:[^\n]*-->\n  <script src="js\/practice-mode\.js[^"]*"><\/script>\n/, '', 'the practice-mode script');
  html = swap(html, '</head>', `${ONLINE_STYLE}\n</head>`, '</head>');
  html = swap(html, /<body class="([^"]*)">\n/, (m, cls) => `<body class="${cls} online-gated">\n${GATE}\n`, 'its <body>');
  html = swap(html, /  <script type="module" src="(game\.js\?[^"]*)"><\/script>/, (m, src) => `  <!-- game.js loads once the multiplayer save is in memory (js/online-boot.js). -->\n  <script type="module" id="online-boot" src="${ONLINE_BOOT_SRC}" data-game="${src}"></script>`, 'the game.js module');
  return html;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const page = buildOnlinePage(readFileSync(SOURCE, 'utf8'));
  if (process.argv.includes('--check')) {
    let current = '';
    try { current = readFileSync(TARGET, 'utf8'); } catch { /* missing */ }
    if (current !== page) {
      console.error('public/play/online/index.html is stale: run node tools/play-online/build.mjs');
      process.exit(1);
    }
    console.log('public/play/online/index.html is current');
  } else {
    writeFileSync(TARGET, page);
    console.log('wrote public/play/online/index.html');
  }
}
