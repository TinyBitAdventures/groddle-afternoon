/**
 * A sheet's header stays put (Austin 2026-10-30, live, Modern: scrolling the Skills sheet slid its
 * search, category and filter chips over the "Skills" title and its close button). The panel shell's
 * rule, in both skins: a fixed header, a body that is the only scroller, then a footer. The header is
 * never inside the scroller, no sheet card scrolls as a whole, and the Skills filters stick at the top
 * of the list, under the header.
 * Run: node --test tests/sheet-header-fixed.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const style = read('public/style.css');
const classic = read('public/css/classic.css');

/** The elements of an HTML fragment, in order, with their depth and classes. */
function elements(html) {
  const out = [];
  let depth = 0;
  const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'wbr']);
  for (const m of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([a-z][a-z0-9-]*)\b([^>]*?)(\/?)>/gi)) {
    const [, close, tag, attrs, self] = m;
    if (close) {
      depth--;
      continue;
    }
    const cls = (/\bclass="([^"]*)"/.exec(attrs)?.[1] || '').split(/\s+/).filter(Boolean);
    const id = /\bid="([^"]*)"/.exec(attrs)?.[1] || '';
    out.push({ tag: tag.toLowerCase(), depth, cls, id });
    if (!self && !VOID.has(tag.toLowerCase())) depth++;
  }
  return out;
}

/** The markup of the element with this id, up to its matching close tag. */
function block(html, id) {
  const at = html.indexOf(`id="${id}"`);
  assert.ok(at >= 0, `${id} is in the page`);
  const start = html.lastIndexOf('<', at);
  let depth = 0;
  const re = /<(\/?)(div|section)\b[^>]*>/g;
  re.lastIndex = start;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (!depth) return html.slice(start, m.index + m[0].length);
  }
  throw new Error(`${id} never closes`);
}

/** The card, its header and its body: the header is a child of the card, before the body, not in it. */
function assertShellOrder(html, label) {
  const els = elements(html);
  const card = els.find((e) => e.cls.includes('ui-sheet-card'));
  assert.ok(card, `${label}: a .ui-sheet-card`);
  const kids = els.filter((e) => e.depth === card.depth + 1 && els.indexOf(e) > els.indexOf(card));
  const head = kids.findIndex((e) => e.cls.includes('ui-sheet-head'));
  const body = kids.findIndex((e) => e.cls.includes('ui-sheet-body'));
  assert.ok(head >= 0, `${label}: the header is a child of the card`);
  assert.ok(body > head, `${label}: the body (the scroller) comes after the header, beside it, not around it`);
}

/** The rules of a stylesheet, flattened out of @media: { selector, body }. */
function rules(css) {
  const out = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  (function walk(text) {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const selector = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      for (; j < text.length && depth; j++) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
      }
      const body = text.slice(open + 1, j - 1);
      if (selector.startsWith('@media') || selector.startsWith('@supports')) walk(body);
      else if (!selector.startsWith('@')) out.push({ selector, body });
      i = j;
    }
  })(src);
  return out;
}

const CARD = /(\.side-card|\.ui-sheet-card|\.make-card|\.vendor-card|\.feat-card|\.img-card-shell|\.home-card|\.mail-card|\.snap-win|\.reports-card|\.glitch-modal-card)$/;
const HEAD = /(\.side-head|\.ui-sheet-head|\.glitch-modal-head|\.img-head|\.home-head|\.mail-head|\.snap-win-head|\.reports-head)$/;
const SKINNED = /^(\[data-ui="modern"\]|:root\[data-ui="(modern|classic)"\])/;
const lastCompound = (sel) => sel.trim().split(/\s+|>/).filter(Boolean).pop().replace(/:not\([^)]*\)|::?[a-z-]+(\([^)]*\))?/g, '');

describe('a sheet header stays put', () => {
  const page = read('public/play/index.html');

  it('every side sheet and centred sheet: the header sits beside the body, outside it', () => {
    for (const id of ['quest-panel', 'make-panel', 'achieve-panel', 'skills-panel', 'buffs-panel', 'feat-panel', 'vendor-panel', 'home-panel', 'mail-panel']) {
      if (id === 'mail-panel') {
        // Mail's list and reader are its two scrollers, side by side under the header and tabs.
        const els = elements(block(page, id));
        const card = els.find((e) => e.cls.includes('ui-sheet-card'));
        const kids = els.filter((e) => e.depth === card.depth + 1);
        assert.ok(kids.findIndex((e) => e.cls.includes('ui-sheet-head')) < kids.findIndex((e) => e.cls.includes('mail-layout')));
        continue;
      }
      assertShellOrder(block(page, id), id);
    }
    // The sheets the features build.
    const img = read('public/js/features/imagination-feature.js');
    assertShellOrder(/panel\.innerHTML = `([\s\S]*?)`;/.exec(img)[1], 'Upgrades');
    assert.match(read('public/js/features/snaps-feature.js'), /win\.append\(head, body, foot\);/, 'Snaps: header, body, footer');
    assert.match(read('public/js/ui/reports-sheet.js'), /card\.append\(head, body, foot\);/, 'Reports: header, body, footer');
  });

  it('the online page has the same sheets', () => {
    const online = read('public/play/online/index.html');
    for (const id of ['achieve-panel', 'skills-panel', 'buffs-panel', 'quest-panel', 'feat-panel', 'vendor-panel']) assertShellOrder(block(online, id), `online ${id}`);
  });

  it('the shell rule, in every skin: a card with a body never scrolls, its body does', () => {
    const all = rules(style);
    const find = (sel) => all.find((r) => r.selector === sel)?.body || '';
    assert.match(find('.ui-sheet-card:has(> .ui-sheet-body)'), /display: flex;[\s\S]*flex-direction: column;[\s\S]*overflow: hidden;/);
    assert.match(find('.ui-sheet-card > .ui-sheet-head'), /flex: none;[\s\S]*position: static;/);
    assert.match(find('.ui-sheet-card > .ui-sheet-body'), /min-height: 0;[\s\S]*overflow-y: auto;/);
    // The old rules that scroll a card are one class each, so the shell's rule (two) beats them in
    // either skin, wherever they sit (Upgrades' own sheet is injected after style.css).
    const injected = rules(/const STYLE = `([\s\S]*?)`;/.exec(read('public/js/features/imagination-feature.js'))?.[1] || '');
    for (const r of [...all, ...injected]) {
      if (SKINNED.test(r.selector) || !/overflow(-y)?:\s*(auto|scroll)/.test(r.body)) continue;
      for (const sel of r.selector.split(',')) {
        if (!CARD.test(lastCompound(sel)) || sel.includes('.ui-sheet-body')) continue;
        assert.ok(/^\.[\w-]+$/.test(sel.trim()), `${sel.trim()} scrolls a sheet card with more than one class`);
      }
    }
  });

  it('no skin scrolls a sheet card as a whole or makes a header sticky', () => {
    for (const [name, css] of [['style.css', style], ['classic.css', classic]]) {
      for (const r of rules(css)) {
        for (const sel of r.selector.split(',').map((s) => s.trim())) {
          if (!SKINNED.test(sel)) continue;
          const last = lastCompound(sel);
          if (CARD.test(last) || /\.map-card(\.map-hub)?$/.test(last)) {
            assert.doesNotMatch(r.body, /overflow(-y)?:\s*(auto|scroll)/, `${name}: ${sel} scrolls the whole card, header and all`);
          }
          if (HEAD.test(last)) assert.doesNotMatch(r.body, /position:\s*sticky/, `${name}: ${sel} is a sticky header in a scroller`);
        }
      }
    }
  });

  it('the Skills filters stick at the top of the list, under the header, never over it', () => {
    const tb = rules(style).find((r) => r.selector === '.skill-tree-toolbar');
    assert.match(tb.body, /position: sticky;/);
    assert.match(tb.body, /top: 0;/, 'the list is its scroller, so it sticks at its top');
    // Modern: the three older panels' header is in the card's frame, not stuck in a scroller.
    const head = rules(style).find((r) => r.selector.includes('#skills-panel .side-head') && /position:/.test(r.body));
    assert.match(head.body, /position: static;/);
    // The Map's card never scrolls in Modern: its art gives way, the cards under it scroll in place.
    const map = rules(style).find((r) => r.selector === '[data-ui="modern"] #map-panel .map-card.map-hub' && /overflow/.test(r.body));
    assert.match(map.body, /overflow: hidden;/);
    // The list is a .ui-sheet-body: the card's one scroller.
    assert.match(read('public/play/index.html'), /<div id="skills-body" class="quest-log-body ui-sheet-body"><\/div>/);
    // A redraw that sets the list's classes keeps it the scroller (the Badges list did not, at first).
    const game = read('public/game.js');
    for (const m of game.matchAll(/box\.className = '([^']*quest-log-body[^']*)'/g)) assert.ok(m[1].split(' ').includes('ui-sheet-body'), m[0]);
    assert.match(game, /box\.className = 'quest-log-body ui-sheet-body achieve-grid';/);
  });
});
