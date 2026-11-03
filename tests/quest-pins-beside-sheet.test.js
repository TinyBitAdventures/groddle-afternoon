/**
 * MAKESHEET (Austin 2026-11-02, live, Modern, 2000x1312): "Crafting goes over top of the mini quests.
 * Maybe we could center that so the mini quests is still visible and updates status in realtime?"
 *
 * The pinned quests card (js/ui/quest-tracker.js) used to hide while any side sheet was open (the
 * root's data-sheet). Now it steps right, beside the open sheet (Make, a tool's recipes, a vendor,
 * Quests, Skills, Badges...), at left: --inset-l, which the panel shell (js/ui/panel-shell.js)
 * already sets to the sheet's width plus its gap. The sheet stays docked left, so the earlier rules
 * hold: the pack row centres in the width left over (--inset-l), the travel card keeps --inset-r,
 * and the avatar still walks while Make or Quests is open (tests/side-sheets.test.js). Centring the
 * sheet instead would sit it over the avatar, whom the camera keeps in the middle.
 *
 * And it ticks as each unit is made: updateMakeCraft emits making_recipe:<key> for every unit as
 * its cycle ends (noteMadeUnit), the Magic Rock's quests route it (quest-offers.js routeQuestEvent),
 * and updateHud redraws the tracker each time, open sheet or not.
 * Run: node --test tests/quest-pins-beside-sheet.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';
import { getQuestProgress } from '../public/js/quests.js?v=282e1621';
import { acceptOffer, routeQuestEvent } from '../public/js/quest-offers.js?v=7dfa8eae';
import { questStep } from '../public/js/ui/quest-sheet.js?v=4d6b1340';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');
const css = read('style.css');
const game = read('game.js');

/** Every rule whose selector names #quest-pins under [data-sheet], with the @media it sits in (or ''). */
function sheetPinRules(text) {
  const out = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
      start = i + 1;
    } else if (text[i] === '{') {
      stack.push({ head: text.slice(start, i).trim(), at: i + 1 });
      start = i + 1;
    } else if (text[i] === '}') {
      const open = stack.pop();
      start = i + 1;
      if (!open || !/\[data-sheet\][^,{]*#quest-pins/.test(open.head)) continue;
      const media = [...stack].reverse().find((s) => s.head.startsWith('@media'))?.head || '';
      out.push({ selector: open.head, body: text.slice(open.at, i), media });
    } else if (text[i] === ';' && !stack.length) {
      start = i + 1;
    }
  }
  return out;
}

describe('the pinned quests card stays in view beside an open side sheet', () => {
  const rules = sheetPinRules(css);

  it('no wide-window rule hides it while a sheet is open; it moves to --inset-l', () => {
    const hiding = rules.filter((r) => /visibility:\s*hidden|opacity:\s*0\b|display:\s*none/.test(r.body));
    assert.ok(hiding.length >= 1, 'the narrow window still hides it');
    for (const r of hiding) assert.match(r.media, /max-width:\s*760px/, `${r.selector} hides it only in a narrow window`);
    const beside = rules.find((r) => !r.media && /left:\s*max\(var\(--hud-inset\),\s*var\(--inset-l/.test(r.body));
    assert.ok(beside, 'with a sheet open the card sits at left: max(--hud-inset, --inset-l)');
    assert.match(css, /#game-root #quest-pins:not\(\[hidden\]\) \{[^}]*transition:[^}]*left var\(--motion-med\)/, 'it glides across with the sheet');
    // The buff strip still steps down under the card only with no sheet open (a sheet covers its spot).
    assert.match(css, /#game-root:not\(\[data-sheet\]\) #quest-pins:not\(\[hidden\]\) ~ #buff-strip/);
  });

  it('the panel shell keeps every side sheet docked left and measures --inset-l from it', () => {
    const shell = read('js/ui/panel-shell.js');
    assert.match(shell, /return w \? Math\.round\(left \+ w \+ gap\) : 0;/);
    assert.match(css, /\.ui-sheet:not\(\.ui-sheet-center\),[^{]*\{\s*position: absolute;\s*inset: calc\(var\(--hud-h\) \+ 6px\) auto auto var\(--hud-inset\);/);
    for (const id of ['make-panel', 'vendor-panel', 'quest-panel']) {
      assert.match(game, new RegExp(`\\{ id: '${id}', close: `), `${id} is a side sheet (no kind: 'center')`);
    }
  });

  it('at 1280, 1440, 1536 and 2000 px the card clears the sheet and the open Social drawer', () => {
    const hudInset = Number(css.match(/--hud-inset:\s*(\d+)px/)[1]);
    const card = Number(css.match(/#game-root #quest-pins:not\(\[hidden\]\) \{[^}]*width:\s*(\d+)px/)[1]);
    const drawer = 316; // js/ui/social-drawer.js: --inset-r with the drawer open
    const gap = 8; // mountPanelShell's gap
    for (const width of [1280, 1440, 1536, 2000, 1024, 800]) {
      const sheetW = width <= 1100 ? 320 : 360;
      const insetL = hudInset + sheetW + gap;
      const left = Math.max(hudInset, insetL);
      assert.ok(left >= hudInset + sheetW + gap, `${width}: right of the sheet with a gap`);
      // A narrower window folds the drawer to its rail; the card still ends inside the window.
      const right = width >= 1280 ? width - drawer : width - 60;
      assert.ok(left + card <= right, `${width}: the card (${left}..${left + card}) ends before ${right}`);
    }
  });
});

describe('the pinned count ticks as each unit is made, with Make still open', () => {
  before(async () => {
    await loadContentCatalogsFromDir(join(PUBLIC, 'assets/content'));
  });

  it('Spice is the Variety of Life: Make 2 x Ginger reads 0/2, 1/2, then the next step', () => {
    const id = 'spicemilling_transform_spices';
    const qs = { active: {}, completed: [] };
    const accepted = acceptOffer(qs, id, { inv: {}, now: 1 });
    assert.equal(accepted.ok, true);
    const step = () => questStep(getQuestProgress(qs, id).requirements);
    assert.deepEqual([step().step, step().count], ['Make 2 x Ginger', '0/2']);
    routeQuestEvent(qs, 'making_recipe:ginger', 1, { managedOnly: true });
    assert.deepEqual([step().step, step().count], ['Make 2 x Ginger', '1/2']);
    routeQuestEvent(qs, 'making_recipe:ginger', 1, { managedOnly: true });
    assert.equal(getQuestProgress(qs, id).requirements.find((r) => r.recipeKey === 'ginger').current, 2);
    assert.deepEqual([step().step, step().count], ['Make 2 x Curry', '0/2'], 'the card moves on to the step you are on');
  });

  it('game.js: every made unit emits its event and redraws the HUD, and the HUD always redraws the tracker', () => {
    const craft = game.slice(game.indexOf('function updateMakeCraft(deltaMs) {'), game.indexOf('/** One made unit'));
    assert.match(craft, /record\.made \+= 1;\s*noteMadeUnit\(record, inv, stringBefore\);\s*updateHud\(\);/);
    const unit = game.slice(game.indexOf('function noteMadeUnit('), game.indexOf('/** Start a cancellable per-unit session'));
    assert.match(unit, /emitGameEvent\(`making_recipe:\$\{record\.key\}`\);/);
    const hud = game.slice(game.indexOf('function updateHud() {'), game.indexOf('// Achievements panel body'));
    assert.match(hud, /\n  renderPinnedQuests\(\);\n/, 'not behind an open-sheet check');
    const pinned = game.slice(game.indexOf('function renderPinnedQuests() {'), game.indexOf('/** The pack stamp'));
    assert.ok(!/data-sheet|dataset\.sheet|panelShell/.test(pinned), 'the tracker draws whether or not a sheet is open');
  });
});
