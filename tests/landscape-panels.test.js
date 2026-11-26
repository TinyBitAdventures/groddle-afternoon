/**
 * Panels on a phone held sideways (the landscape audit, 2026-11-13; Austin: phones play both ways up).
 * The rules live in style.css's LANDSCAPE-PANELS block, and only a phone (html.touch-phone) wider than
 * tall and under 500 px tall matches them, so a computer and an upright phone keep their panels.
 * Run: node --test tests/landscape-panels.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');

/** The LANDSCAPE-PANELS block of style.css. */
function landBlock() {
  const at = css.indexOf('/* === LANDSCAPE-PANELS (land2) === */');
  const end = css.indexOf('/* === end LANDSCAPE-PANELS === */');
  assert.ok(at > 0 && end > at, 'the LANDSCAPE-PANELS block is in style.css');
  return css.slice(at, end);
}

/** The body of the @media rule that holds `marker` (a comment inside the block, before the rule). */
function sidewaysRule(marker) {
  const block = landBlock();
  const at = block.indexOf(marker);
  assert.ok(at >= 0, `${marker} is in the block`);
  const media = block.indexOf('@media (max-height: 500px) and (orientation: landscape) {', at);
  assert.ok(media > at, `${marker}: a sideways short-screen rule follows it`);
  let depth = 0;
  for (let i = block.indexOf('{', media); i < block.length; i += 1) {
    if (block[i] === '{') depth += 1;
    else if (block[i] === '}') {
      depth -= 1;
      if (!depth) return block.slice(media, i + 1);
    }
  }
  throw new Error(`${marker}: the rule never closes`);
}

describe('compact sheets sideways (#2)', () => {
  const rule = sidewaysRule('/* COMPACT SHEETS (#2)');
  it('is for a phone only, in Modern', () => {
    for (const line of rule.split('\n').filter((l) => l.includes('{') && !l.startsWith('@media'))) {
      assert.match(line, /^\s*:root\.touch-phone\[data-ui="modern"\] #game-root /, line);
    }
  });
  it('puts the header in one grid row, the list in the one stretching row, and drops the footer', () => {
    assert.match(rule, /> \.ui-sheet-card \{\s*display: grid;\s*grid-template-columns: auto minmax\(0, 1fr\) auto auto;\s*grid-template-rows: auto auto auto minmax\(0, 1fr\) auto;/);
    assert.match(rule, /> \.ui-sheet-card > \.ui-sheet-head \{ display: contents; \}/);
    assert.match(rule, /> \.ui-sheet-card > \.ui-sheet-head > \* \{ grid-row: 1;/);
    assert.match(rule, /> \.ui-sheet-card > \.ui-sheet-body \{ grid-row: 4; align-self: stretch; \}/);
    assert.match(rule, /> \.ui-sheet-card > \.ui-sheet-foot \{ display: none; \}/);
  });
  it('shares the title row with Quests\' tabs and the Make and badge searches', () => {
    assert.match(rule, /#quest-panel > \.ui-sheet-card > #quest-tabs \{ grid-row: 1; grid-column: 2 \/ 4;/);
    assert.match(rule, /#make-panel \.make-search-row > \.make-search \{ grid-row: 1; grid-column: 2 \/ 4;/);
    assert.match(rule, /#achieve-panel \.badge-browser-tools > \.badge-search \{ grid-row: 1; grid-column: 2 \/ 4;/);
  });
  it('widens the sheet sideways up to 440 px, leaving the pack row room beside it', () => {
    assert.match(rule, /width: clamp\(320px, 100% - 310px - env\(safe-area-inset-left, 0px\), 440px\);/);
  });
  it('keeps the close button a 44 px thumb target (TOUCH PANELS)', () => {
    assert.doesNotMatch(rule, /\.ui-sheet-x[^{]*\{[^}]*(min-)?(width|height): (?!44)\d+px/);
  });
});

describe('Imagination upgrade cards sideways (#3)', () => {
  const rule = sidewaysRule('/* UPGRADES SIDEWAYS (#3)');
  it('runs the window from under the top bar to the floor, title row shared with the tabs', () => {
    assert.match(rule, /#imagination-panel\.ui-sheet-center \{ bottom: 0; align-items: flex-start; padding-top: calc\(var\(--hud-h\) \+ 4px \+ var\(--safe-t\)\);/);
    assert.match(rule, /#imagination-panel \.img-card-shell > \.img-head \{ display: contents; \}/);
    assert.match(rule, /#imagination-panel \.img-card-shell > \.img-tabs \{ grid-row: 1; grid-column: 2;/);
  });
  it('deals the three cards side by side, each as tall as the room left, in their own shape', () => {
    assert.match(rule, /#imagination-panel \.img-hand \{ flex-wrap: nowrap;/);
    assert.match(rule, /#imagination-panel \.img-card \{ --h: clamp\(120px, 100dvh - var\(--hud-h\) - 112px, 279px\); --w: calc\(var\(--h\) \* 207 \/ 279\);/);
  });
});

describe('Mail sideways (#4)', () => {
  const rule = sidewaysRule('/* MAIL SIDEWAYS (#4)');
  it('shares the title row with the folders and Write mail, and drops the footer', () => {
    assert.match(rule, /#mail-panel \.mail-card > \.mail-head \{ display: contents; \}/);
    assert.match(rule, /#mail-panel \.mail-card > \.mail-tabs \{ grid-row: 1; grid-column: 2;/);
    assert.match(rule, /#mail-panel \.mail-card > \.ui-sheet-foot \{ display: none; \}/);
  });
  it('stands the list and the letter side by side in the stretching row, one line per letter', () => {
    assert.match(rule, /#mail-panel \.mail-card > \.mail-layout \{ grid-row: 2; grid-column: 1 \/ -1; align-self: stretch; height: auto; grid-template-columns: minmax\(200px, 38%\) minmax\(0, 1fr\);/);
    assert.match(rule, /#mail-panel \.mail-row-copy span \{ display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;/);
  });
});

describe('the report window sideways (#9)', () => {
  const rule = sidewaysRule('/* REPORT SIDEWAYS (#9)');
  it('outranks the feature\'s own phone rule (injected after style.css) for the window\'s padding', () => {
    assert.match(rule, /#game-root #bug-report-panel\.reports-panel \{ padding: calc\(var\(--hud-h\) \+ 4px \+ var\(--safe-t\)\)/);
  });
  it('keeps Send at the foot while the rest scrolls, with a three-line box', () => {
    assert.match(rule, /#bug-report-panel \.reports-actions \{ position: sticky; bottom: 0;/);
    assert.match(rule, /#bug-report-panel \.reports-new-view \.reports-text \{ min-height: 3\.6rem; \}/);
    assert.match(rule, /#bug-report-panel \.reports-foot \{ display: none; \}/);
  });
});

describe('Cultivate and Decorate sideways (#6)', () => {
  const rule = sidewaysRule('/* HOME BUILDER SIDEWAYS (#6)');
  it('puts the banner right under the top bar, slim, so it clears the stick and Jump on the tray', () => {
    assert.match(rule, /\.hb-banner \{ top: calc\(var\(--hud-h\) \+ 4px \+ var\(--safe-t\)\);/);
    assert.match(rule, /\.hb-banner \.hb-hint \{ display: none; \}/);
  });
  it('lays Cultivate\'s tray in one row without its footer line, with smaller tiles', () => {
    assert.match(rule, /\.hb-tray:has\(\.hb-aside\) > \.hb-foot \{ display: none; \}/);
    assert.match(rule, /\.hb-tile-cult \{ width: 70px; height: 66px; \}/);
  });
  it('puts Decorate\'s tabs, filters and store on one row over the strip', () => {
    assert.match(rule, /\.hb-tray:not\(:has\(\.hb-aside\)\) \{ grid-template-columns: auto minmax\(0, 1fr\) auto; grid-template-areas: "tabs filters foot" "panel panel panel"; \}/);
  });
});

describe('#342 and #343: a phone held sideways (PHONE SIDEWAYS 2)', () => {
  const at = css.indexOf('/* === PHONE SIDEWAYS 2 (chk6');
  const end = css.indexOf('/* === end PHONE SIDEWAYS 2 === */');
  const block = css.slice(at, end);

  it('the block is in style.css, and its sideways rules are for a short phone only', () => {
    assert.ok(at > 0 && end > at);
    assert.match(block, /@media \(max-height: 500px\) and \(orientation: landscape\) \{/);
    for (const line of block.split('\n').filter((l) => /^\s+:root/.test(l))) assert.match(line, /:root\.touch-phone/, line);
  });

  it('#342: Jump and Act stand left of the Social rail; the pack row and the controls sit lower', () => {
    assert.match(block, /\.touch-jump \{ right: max\(var\(--sp-6\), env\(safe-area-inset-right, 0px\), var\(--inset-r, 0px\)\); \}/);
    assert.match(block, /\.touch-act \{ right: calc\(max\(var\(--sp-6\), env\(safe-area-inset-right, 0px\), var\(--inset-r, 0px\)\) \+ 76px \+ var\(--sp-5\)\); \}/);
    assert.match(block, /\.pack-bar:not\(\[data-hb-dock\]\) \{ bottom: max\(0px, var\(--safe-b\) - 4px\); \}/);
    assert.match(block, /\.touch-controls \{ bottom: calc\(var\(--pack-live-height, 72px\) \+ max\(0px, var\(--safe-b\) - 4px\)\); \}/);
  });

  it('the pack row clears the iPhone home-bar strip by 4 px, sideways (Austin 2026-11-15)', () => {
    // Read the rule's own value and work it out for an iPhone held sideways (safe-area-inset-bottom
    // 21) and a phone without the strip (0). The band's foot is 8 px under the row (measured in
    // WebKit at 874 x 402 and 956 x 440: band 64 px, row 56 px; rules-shots packrow-after-*).
    const value = block.match(/\.pack-bar:not\(\[data-hb-dock\]\) \{ bottom: ([^;]+); \}/)[1];
    const px = (safe) => {
      const m = value.match(/^max\(0px, var\(--safe-b\) - (\d+)px\)$/);
      assert.ok(m, value);
      return Math.max(0, safe - Number(m[1]));
    };
    const FOOT = 8;
    for (const safe of [21, 34]) {
      const rowBottom = px(safe) + FOOT;
      assert.ok(rowBottom >= safe + 4, `safe ${safe}: the row's foot ${rowBottom} px up, the strip ${safe}`);
      assert.ok(rowBottom <= safe + 8, `safe ${safe}: still as low as it can sit (${rowBottom})`);
      assert.ok(px(safe) < safe, 'lower than before chk6 (the band sat on the strip)');
    }
    assert.equal(px(0), 0, 'a phone without the strip keeps the band at the foot');
  });

  it('#342: the Menu is wide, its groups side by side, down to the foot, and never see-through', () => {
    assert.match(block, /\.top-bar \.more-list \{\n\s+width: min\(760px,[^\n]+\n\s+max-height: calc\(100dvh - var\(--hud-h\)[^\n]+\n\s+grid-template-columns: repeat\(auto-fit, minmax\(150px, 1fr\)\);/);
    assert.match(block, /\.more-list\[data-more-below\] \{ -webkit-mask-image: none; mask-image: none; \}/);
    assert.match(block, /\.more-list\[data-more-below\]::after \{[^}]*background: linear-gradient\(to bottom, transparent, var\(--surface-card\)\);/);
  });

  it('#343: the report window takes the screen sideways, and the box above the keyboard while typing', () => {
    assert.match(block, /#bug-report-panel \.reports-new-view \{\n\s+display: grid;/);
    assert.match(block, /\.reports-new-view > \.reports-new-title \{ display: none; \}/);
    assert.match(block, /:root\.touch-phone\.kbd-up\[data-ui="modern"\] #game-root #bug-report-panel\.reports-panel:focus-within \{\n\s+inset: var\(--kbd-top, 0px\) 0 auto 0; height: var\(--kbd-h, 100%\);/);
    assert.match(block, /:focus-within :is\(\.reports-new-title, \.reports-label, \.reports-picture-row, \.reports-tray, \.reports-foot, \.reports-ext-row:not\(:focus-within\)\) \{ display: none; \}/);
  });
});

describe('G857 (#406): sideways, the report window gives each picture row its own place', () => {
  const block = css.slice(css.indexOf('/* === PHONE SIDEWAYS 2 (chk6'), css.indexOf('/* === end PHONE SIDEWAYS 2 === */'));
  it('the Attach row, the Add and Take row, the tray and Send each have a grid area', () => {
    assert.match(block, /grid-template-areas: "label label" "text pic" "text add" "text ext" "text tray" "text send";/);
    assert.match(block, /\.reports-new-view > \.reports-picture-row \{ grid-area: pic;/);
    assert.match(block, /\.reports-new-view > \.reports-picture-row\.reports-new-pictures \{ grid-area: add;/);
    assert.match(block, /\.reports-new-view > \.reports-tray \{ grid-area: tray;/);
  });
  it('both rows carry reports-picture-row in the sheet, so the second needs the more specific rule', () => {
    const sheet = readFileSync(join(root, 'public/js/ui/reports-sheet.js'), 'utf8');
    assert.match(sheet, /e\('div', \{ class: 'reports-picture-row', 'data-reports-picture-row': '' \}\)/);
    assert.match(sheet, /e\('div', \{ class: 'reports-picture-row reports-new-pictures' \}\)/);
  });
});
