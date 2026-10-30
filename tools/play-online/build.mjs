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
import { committedMap, keyAssetUrls } from '../data-versions/build.mjs';
import { moduleUrl } from '../module-keys/build.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = join(root, 'public/play/index.html');
const TARGET = join(root, 'public/play/online/index.html');

/** js/online-boot.js with its content key (tools/module-keys/build.mjs: it changes with that file or js/minn-account.js). */
export const ONLINE_BOOT_SRC = moduleUrl('js/online-boot.js', root);

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
    .online-gate { min-height: 100vh; display: grid; place-items: center; padding: var(--sp-8); background-attachment: fixed; }
    .online-gate[hidden] { display: none; }
    .online-gate .card { line-height: var(--lh-normal); text-align: left; max-width: 26rem; }
    .online-gate .card img { display: block; width: 44px; height: 44px; margin: 0 auto var(--sp-4); }
    .online-gate .online-play {
      display: block; width: 100%; margin-top: var(--sp-7); text-align: center; text-decoration: none; border: 0; cursor: pointer;
      border-radius: var(--radius-lg); padding: 0.7rem var(--sp-8); font: inherit; font-size: var(--fs-lg); font-weight: 700; color: var(--text);
      /* One warm orange like the header's Play, dark text on it (6.7:1 to 5.0:1); white on orange fell under 3:1. */
      background: linear-gradient(180deg, var(--c-orange-76), var(--c-orange-68)); box-shadow: 0 3px 0 var(--c-orange-57);
    }
    .online-gate .online-play:hover { filter: brightness(1.05); }
    .online-gate .online-play:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--c-orange-57); }
    .online-gate .online-alt {
      display: block; margin-top: var(--sp-5); text-align: center; text-decoration: none; border-radius: var(--radius-lg); padding: var(--sp-5) var(--sp-8);
      font-weight: 700; color: var(--text-moss); background: var(--surface-moss); box-shadow: inset 0 0 0 2px var(--c-lime-85);
    }
    .online-gate .online-home { display: block; margin-top: var(--sp-5); text-align: center; color: var(--text-moss); font-weight: 700; }
    .online-gate button.online-home { width: 100%; padding: 0; border: 0; background: none; font: inherit; font-weight: 700; text-decoration: underline; cursor: pointer; }
    /* Play solo under the sign-in (Austin 2026-10-26: Play shows the sign-in or a button to play solo). */
    .online-gate .online-solo { margin-top: var(--sp-9); padding-top: var(--sp-7); border-top: 1px solid color-mix(in srgb, var(--c-green-42) 20%, transparent); }
    .online-gate .online-solo h3 { margin: 0 0 var(--sp-2); font-size: var(--fs-lg); }
    .online-gate .online-solo p { margin: 0; }
    /* The multiplayer save state (js/save-store.js groddle:save-state). */
    .save-pill {
      position: fixed; left: 10px; bottom: 10px; z-index: calc(var(--z-notice) + 10); display: flex; gap: 0.45rem; align-items: center;
      padding: 0.3rem 0.7rem; border-radius: var(--radius-pill); font: 600 var(--fs-sm)/var(--lh-snug) var(--font-system); color: var(--c-green-34);
      background: color-mix(in srgb, var(--surface-moss) 92%, transparent); box-shadow: var(--shadow-1); pointer-events: auto;
    }
    .save-pill .save-pill-who { opacity: 0.75; }
    .save-pill .save-pill-state::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: var(--sp-3); border-radius: var(--radius-round); background: var(--c-lime-67); vertical-align: 1px; }
    .save-pill[data-state="pending"] .save-pill-state::before, .save-pill[data-state="saving"] .save-pill-state::before { background: var(--c-gold-76); }
    .save-pill[data-state="offline"] .save-pill-state::before, .save-pill[data-state="error"] .save-pill-state::before { background: var(--c-red-59); }
    .save-pill[data-state="conflict"], .save-pill[data-state="signed-out"] { background: var(--status-warn-soft); }
    .save-pill[data-state="conflict"] .save-pill-state::before, .save-pill[data-state="signed-out"] .save-pill-state::before { background: var(--c-red-59); }
    .save-pill a { color: var(--c-brown-46b); }
    /* In the pack, under its hint (js/online-boot.js mountSavePill): part of the game, not over it. */
    .pack-side { display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: var(--sp-3); flex-shrink: 0; }
    .save-pill.in-pack { position: static; z-index: auto; box-shadow: none; padding: 0.18rem 0.55rem; font-size: var(--fs-xs); white-space: nowrap; }
    /* In the pack: one round cloud whose dot is the state, so the row never changes width; the words are its tooltip. */
    .save-pill-icon { display: none; }
    .save-pill.in-pack:not([data-state="conflict"]):not([data-state="signed-out"]) { position: relative; inset: auto; width: 32px; height: 32px; padding: 0; justify-content: center; border-radius: var(--radius-round); cursor: default; }
    .save-pill.in-pack:not([data-state="conflict"]):not([data-state="signed-out"]) .save-pill-icon { display: block; position: relative; width: 20px; height: 20px; color: var(--c-green-34); }
    .save-pill.in-pack .save-pill-icon svg { display: block; }
    .save-pill.in-pack .save-pill-icon::after { content: ''; position: absolute; right: -3px; bottom: 0; width: 8px; height: 8px; border-radius: var(--radius-round); background: var(--c-lime-67); box-shadow: 0 0 0 2px var(--surface-moss); }
    .save-pill.in-pack[data-state="pending"] .save-pill-icon::after, .save-pill.in-pack[data-state="saving"] .save-pill-icon::after { background: var(--c-gold-76); }
    .save-pill.in-pack[data-state="offline"] .save-pill-icon::after, .save-pill.in-pack[data-state="error"] .save-pill-icon::after { background: var(--c-red-59); }
    .save-pill.in-pack:not([data-state="conflict"]):not([data-state="signed-out"]) :is(.save-pill-who, .save-pill-state) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .save-pill.in-pack:not([data-state="conflict"]):not([data-state="signed-out"])::after { content: attr(data-tip); position: absolute; right: 0; bottom: calc(100% + var(--sp-4)); padding: var(--sp-2) var(--sp-4); border-radius: var(--radius-sm); background: var(--surface-dark); color: var(--text-on-dark); font-size: var(--fs-xs); white-space: nowrap; box-shadow: var(--shadow-2); opacity: 0; pointer-events: none; transition: opacity 120ms ease-out; }
    .save-pill.in-pack:not([data-state="conflict"]):not([data-state="signed-out"]):is(:hover, :focus-visible)::after { opacity: 1; }
    @media (prefers-reduced-motion: reduce) { .save-pill.in-pack::after { transition: none; } }
    /* In the one-row pack: a 36 px button like search beside it, centred in the row, the same ink and hover. */
    #pack-row > .save-pill.in-row:not([data-state="conflict"]):not([data-state="signed-out"]) { flex: none; width: 36px; height: 36px; border-radius: var(--radius-lg); background: transparent; color: var(--text); transition: background 120ms ease-out; }
    #pack-row > .save-pill.in-row:not([data-state="conflict"]):not([data-state="signed-out"]):hover { background: var(--surface-parchment); }
    #pack-row > .save-pill.in-row:not([data-state="conflict"]):not([data-state="signed-out"]) .save-pill-icon { color: var(--text); }
    #pack-row > .save-pill.in-row .save-pill-icon::after { box-shadow: 0 0 0 2px var(--surface-raised); }
    #pack-row > .save-pill.in-row:focus-visible { outline: 2px solid var(--c-sky-57); outline-offset: 2px; }
    #pack-row > .save-pill.in-row[data-state="conflict"], #pack-row > .save-pill.in-row[data-state="signed-out"] { flex: none; align-self: center; }
    /* G320: the start card over the street, the chat dock and the pack, inside the game frame (it scrolls when the
       frame is shorter); the street's toasts, activity lines and Qurazy banner wait for it to close (game.js holds the
       toast's clock, qurazy-feature the banner). */
    #overlay:not(.hidden) { z-index: var(--z-screen); padding: var(--sp-4); box-sizing: border-box; }
    #overlay:not(.hidden) > .card { max-height: 100%; overflow-y: auto; overscroll-behavior: contain; box-sizing: border-box; }
    #game-root:has(> #overlay:not(.hidden)) :is(.notify-notices, .qurazy-overlay) { visibility: hidden; }
    body:has(#overlay:not(.hidden)) .save-pill { z-index: calc(var(--z-screen) + 1); }
    @media (max-width: 560px) {
      #overlay:not(.hidden) > .card { width: 100%; padding: var(--sp-7) 0.95rem var(--sp-6); font-size: var(--fs-base); line-height: var(--lh-normal); }
      #overlay:not(.hidden) > .card h2 { font-size: var(--fs-xl); margin-bottom: var(--sp-3); }
      #overlay:not(.hidden) > .card p { margin: var(--sp-3) 0; }
    }
  </style>`;

const GATE = `  <!-- Multiplayer phase 2: js/online-boot.js signs the player in and loads the save before game.js. -->
  <main id="online-gate" class="online-gate" data-online="checking">
    <div class="card" role="status" aria-live="polite">
      <img src="favicon.svg?v=arch" alt="" width="44" height="44" />
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
  html = swap(html, '<!DOCTYPE html>\n<!-- data-ui: the interface skin. "modern" (the default) scopes the modern HUD\'s CSS and markup; a Classic skin can replace it. -->\n<html lang="en" data-ui="modern">', '<!DOCTYPE html>\n<!-- Generated from play/index.html by tools/play-online/build.mjs: edit that page or the builder, never this file. -->\n<!-- data-ui: the interface skin. "modern" (the default) scopes the modern HUD\'s CSS and markup; a Classic skin can replace it. -->\n<html lang="en" data-ui="modern" data-mode="multiplayer">', 'its <html> tag');
  html = swap(html, /  <!-- The game lives at \/play\/;[^\n]*-->\n  <base href="\.\.\/" \/>/, `  <!-- The multiplayer entry lives at /play/online/; every path stays relative to the site root. -->\n  <base href="../../" />\n${MODE_ENTRY}`, 'its <base>');
  html = swap(html, '<title>Groddle Afternoon</title>', '<meta name="robots" content="noindex" />\n  <title>Groddle Afternoon · Multiplayer</title>', 'its <title>');
  html = swap(html, /  <!-- \?practice=1:[^\n]*-->\n  <script src="js\/practice-mode\.js[^"]*"><\/script>\n/, '', 'the practice-mode script');
  html = swap(html, '</head>', `${ONLINE_STYLE}\n</head>`, '</head>');
  html = swap(html, /<body class="([^"]*)">\n/, (m, cls) => `<body class="${cls} online-gated">\n${GATE}\n`, 'its <body>');
  html = swap(html, /  <script type="module" src="(game\.js\?[^"]*)"><\/script>/, (m, src) => `  <!-- game.js loads once the multiplayer save is in memory (js/online-boot.js). -->\n  <script type="module" id="online-boot" src="${ONLINE_BOOT_SRC}" data-game="${src}"></script>`, 'the game.js module');
  // The gate's art and the shell's carry content keys, as the solo page's do (tools/data-versions/build.mjs).
  return keyAssetUrls(html, 'play/online/index.html', committedMap(root));
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
