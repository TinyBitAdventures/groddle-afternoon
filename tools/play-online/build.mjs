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

/** js/online-boot.js with its content key (tools/module-keys/build.mjs: it changes with that file or js/minn-account-core.js). */
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
    /* The Juju Boss on a server-trouble card: 24 frames of npc_juju_boss shaking_fists (frames 27-50, Tiny Speck CC0). */
    .online-gate[data-online="offline"] .card > img, .online-gate[data-online="load-failed"] .card > img { display: none; }
    .online-boss { width: 104px; height: 114px; margin: 0 auto var(--sp-4); background: url("assets/sprites/juju_boss/shaking-fists.webp") 0 0 no-repeat; animation: online-boss-shake 1s steps(24) infinite; }
    @keyframes online-boss-shake { to { background-position: -2496px 0; } }
    @media (prefers-reduced-motion: reduce) { .online-boss { animation: none; } }
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
    /* A login's characters (alternate characters, Austin 2026-11-12): a row each, a fresh one, the retired ones small. */
    .online-gate .online-characters { list-style: none; margin: 0; padding: 0; }
    .online-gate button.online-alt { width: 100%; border: 0; font: inherit; font-weight: 700; cursor: pointer; }
    .online-gate .online-character { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-5); text-align: left; }
    .online-gate .online-character-name { min-width: 0; overflow-wrap: anywhere; }
    .online-gate .online-character-level { flex: none; font-size: var(--fs-sm); font-weight: 600; opacity: 0.8; }
    /* An extra character's Retire: a small link beside its row, and a plain confirmation under it in the card. */
    .online-gate .online-character-row { display: flex; flex-wrap: wrap; align-items: center; column-gap: var(--sp-4); margin-top: var(--sp-5); }
    .online-gate .online-character-row > .online-character { flex: 1 1 0; min-width: 0; margin-top: 0; }
    .online-gate .online-retire-open { flex: none; padding: var(--sp-3) var(--sp-2); border: 0; background: none; font: inherit; font-size: var(--fs-sm); font-weight: 700; color: var(--text-moss); text-decoration: underline; cursor: pointer; }
    .online-gate .online-retire-open[hidden], .online-gate .online-retire-confirm[hidden] { display: none; }
    .online-gate .online-retire-confirm { flex: 1 0 100%; box-sizing: border-box; margin-top: var(--sp-4); padding: var(--sp-5) var(--sp-6); border-radius: var(--radius-md); background: var(--status-warn-soft); box-shadow: inset 0 0 0 2px var(--c-gold-76); }
    .online-gate .online-retire-ask { margin: 0; }
    .online-gate .online-retire-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-4) var(--sp-7); margin-top: var(--sp-5); }
    .online-gate .online-retire-yes { padding: var(--sp-4) var(--sp-7); border: 0; border-radius: var(--radius-lg); font: inherit; font-weight: 700; color: var(--text-on-dark); background: var(--status-danger); cursor: pointer; }
    .online-gate .online-retire-actions button.online-home { width: auto; margin-top: 0; }
    .online-gate .online-retire-note { margin: var(--sp-4) 0 0; font-weight: 600; color: var(--text-moss); }
    .online-gate .online-retire-note:empty { display: none; }
    .online-gate .online-retire-note[data-tone="bad"] { color: var(--text-danger); }
    .online-gate .online-fresh-form { display: grid; gap: var(--sp-2); margin-top: var(--sp-7); padding-top: var(--sp-6); border-top: 1px solid color-mix(in srgb, var(--c-green-42) 20%, transparent); }
    .online-gate .online-fresh-form[hidden], .online-gate .online-alt[hidden] { display: none; }
    .online-gate .online-fresh-form h3 { margin: 0; font-size: var(--fs-lg); }
    .online-gate .online-fresh-form p { margin: 0 0 var(--sp-3); }
    .online-gate .online-fresh-form label { font-weight: 700; color: var(--c-lime-31); }
    .online-gate .online-fresh-form input { box-sizing: border-box; width: 100%; padding: var(--sp-5) 0.7rem; border-radius: var(--radius-md); border: 2px solid var(--c-lime-85c); background: var(--surface-bright); color: var(--c-sage-27); font: inherit; font-size: var(--fs-lg); }
    .online-gate .online-fresh-form input:focus { outline: none; border-color: var(--c-orange-68); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-orange-68) 22%, transparent); }
    .online-gate .online-fresh-form input[aria-invalid="true"] { border-color: var(--c-red-59); }
    .online-gate .online-fresh-form small { color: var(--text-moss); font-size: var(--fs-md); }
    .online-gate .online-fresh-error { color: var(--text-danger); font-weight: 600; }
    .online-gate .online-fresh-error:empty { display: none; }
    .online-gate .online-fresh-form .online-play { margin-top: var(--sp-4); }
    .online-gate .online-fresh-note { margin: var(--sp-5) 0 0; text-align: center; font-weight: 600; color: var(--text-moss); }
    .online-gate .online-characters-status { margin: var(--sp-4) 0 0; text-align: center; font-weight: 600; color: var(--text-moss); }
    .online-gate .online-characters-status:empty { display: none; }
    .online-gate .online-characters-status[data-tone="bad"] { color: var(--text-danger); }
    .online-gate .online-retired { margin-top: var(--sp-6); text-align: center; font-size: var(--fs-sm); color: var(--text-moss); }
    .online-gate .online-retired summary { cursor: pointer; font-weight: 700; text-decoration: underline; }
    .online-gate .online-retired .online-home { margin-top: var(--sp-3); }
    .online-gate button:disabled { opacity: 0.6; cursor: default; }
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
    /* A stopped save (js/online-boot.js mountSaveAlert): a card over the game, never only the pack's cloud (ticket 21). */
    .save-alert {
      position: fixed; top: var(--sp-8); left: 50%; transform: translateX(-50%); z-index: calc(var(--z-screen) + 2);
      width: min(30rem, calc(100vw - 2rem)); box-sizing: border-box; padding: var(--sp-7) var(--sp-8); border-radius: var(--radius-lg);
      font: var(--fs-base)/var(--lh-normal) var(--font-system); color: var(--text); background: var(--surface-raised);
      box-shadow: var(--shadow-2), inset 0 0 0 2px var(--c-red-59);
    }
    .save-alert[hidden] { display: none; }
    .save-alert h2 { margin: 0 0 var(--sp-3); font-size: var(--fs-lg); }
    .save-alert p { margin: 0 0 var(--sp-3); }
    .save-alert .save-alert-note { font-size: var(--fs-sm); color: var(--text-moss); }
    .save-alert-buttons { display: flex; flex-wrap: wrap; gap: var(--sp-4); margin-top: var(--sp-5); }
    .save-alert-buttons button {
      flex: 1 1 auto; border: 0; cursor: pointer; border-radius: var(--radius-lg); padding: var(--sp-4) var(--sp-7); font: inherit; font-weight: 700;
      color: var(--text-moss); background: var(--surface-moss); box-shadow: inset 0 0 0 2px var(--c-lime-85);
    }
    .save-alert-buttons button:first-child { color: var(--text); background: linear-gradient(180deg, var(--c-orange-76), var(--c-orange-68)); box-shadow: 0 3px 0 var(--c-orange-57); }
    .save-alert-buttons button:disabled { opacity: 0.6; cursor: default; }
    .save-alert-buttons button:focus-visible { outline: 2px solid var(--c-sky-57); outline-offset: 2px; }
    /* In the pack, under its hint (js/online-boot.js mountSavePill): part of the game, not over it. */
    .pack-side { display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: var(--sp-3); flex-shrink: 0; }
    .save-pill.in-pack { position: static; z-index: auto; box-shadow: none; padding: 0.18rem 0.55rem; font-size: var(--fs-xs); white-space: nowrap; }
    /* In the pack: one round cloud whose dot is the state, so the row never changes width; the words are its tooltip. */
    .save-pill-icon, .save-pill-btn { display: none; }
    .save-pill.in-pack:not([data-state="conflict"]):not([data-state="signed-out"]) { position: relative; inset: auto; width: 32px; height: 32px; padding: 0; justify-content: center; border-radius: var(--radius-round); cursor: default; }
    .save-pill.in-pack:not([data-state="conflict"]):not([data-state="signed-out"]) .save-pill-icon { display: block; position: relative; width: 20px; height: 20px; color: var(--c-green-34); }
    .save-pill.in-pack .save-pill-icon svg { display: block; }
    /* The cloud is a button the size of its pill (js/character-switcher.js opens Your characters from it in multiplayer). */
    .save-pill.in-pack:not([data-state="conflict"]):not([data-state="signed-out"]) .save-pill-btn { display: grid; place-items: center; position: absolute; inset: 0; padding: 0; border: 0; border-radius: inherit; background: none; color: inherit; font: inherit; cursor: default; -webkit-tap-highlight-color: transparent; }
    .save-pill-btn:focus-visible { outline: 2px solid var(--c-sky-57); outline-offset: 2px; }
    .save-pill.in-pack .save-pill-icon::after { content: ''; position: absolute; right: -3px; bottom: 0; width: 8px; height: 8px; border-radius: var(--radius-round); background: var(--c-lime-67); box-shadow: 0 0 0 2px var(--surface-moss); }
    .save-pill.in-pack[data-state="pending"] .save-pill-icon::after, .save-pill.in-pack[data-state="saving"] .save-pill-icon::after { background: var(--c-gold-76); }
    .save-pill.in-pack[data-state="offline"] .save-pill-icon::after, .save-pill.in-pack[data-state="error"] .save-pill-icon::after { background: var(--c-red-59); }
    .save-pill.in-pack:not([data-state="conflict"]):not([data-state="signed-out"]) :is(.save-pill-who, .save-pill-state) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .save-pill.in-pack:not([data-state="conflict"]):not([data-state="signed-out"])::after { content: attr(data-tip); position: absolute; right: 0; bottom: calc(100% + var(--sp-4)); padding: var(--sp-2) var(--sp-4); border-radius: var(--radius-sm); background: var(--surface-dark); color: var(--text-on-dark); font-size: var(--fs-xs); white-space: nowrap; box-shadow: var(--shadow-2); opacity: 0; pointer-events: none; transition: opacity 120ms ease-out; }
    .save-pill.in-pack:not([data-state="conflict"]):not([data-state="signed-out"]):is(:hover, :has(.save-pill-btn:focus-visible))::after { opacity: 1; }
    @media (prefers-reduced-motion: reduce) { .save-pill.in-pack::after { transition: none; } }
    /* The words are a mouse's tooltip: a tap's sticky hover never leaves them standing on a phone. */
    @media (hover: none) { .save-pill.in-pack::after { display: none; } }
    /* In the one-row pack: a 36 px button like search beside it, centred in the row, the same ink and hover. */
    #pack-row > .save-pill.in-row:not([data-state="conflict"]):not([data-state="signed-out"]) { flex: none; width: 36px; height: 36px; border-radius: var(--radius-lg); background: transparent; color: var(--text); transition: background 120ms ease-out; }
    #pack-row > .save-pill.in-row:not([data-state="conflict"]):not([data-state="signed-out"]):hover { background: var(--surface-parchment); }
    #pack-row > .save-pill.in-row:not([data-state="conflict"]):not([data-state="signed-out"]) .save-pill-icon { color: var(--text); }
    #pack-row > .save-pill.in-row .save-pill-icon::after { box-shadow: 0 0 0 2px var(--surface-raised); }
    /* A 44 px target on a touch screen (the 56 px row holds it). */
    @media (pointer: coarse) { #pack-row > .save-pill.in-row:not([data-state="conflict"]):not([data-state="signed-out"]) { width: 44px; height: 44px; } }
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
