// Ticket 62 (Austin 2026-11-03): F opens "Eat what?" with the best food chosen; / focuses the chat
// box (KeyBeacon.as 31-32); R opens Report a bug. js/eat-pick.js and its game.js wiring.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EAT_PICK_TEXT, bestFoodIndex, compareFood, eatChoices, eatTip, isEatable } from '../public/js/eat-pick.js?v=8fb763d0';
import { hotkeySections, hotkeyText } from '../public/js/client-hotkeys.js?fresh=eat-pick';
import { ITEM_CATALOG, getItemUseInfo, listPackItemSlots } from '../public/js/inventory.js?v=602da017';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

const FOOD = {
  apple: { info: { usable: true, kind: 'food', verb: 'Eat', effects: { energy: 10, mood: 5 } }, meta: { label: 'Apple', baseCost: 3 } },
  sammich: { info: { usable: true, kind: 'food', verb: 'Eat', effects: { energy: 25, mood: 10 } }, meta: { label: 'Sammich', baseCost: 40 } },
  pie: { info: { usable: true, kind: 'food', verb: 'Eat', effects: { energy: 25 } }, meta: { label: 'Pie', baseCost: 90 } },
  waffles: { info: { usable: true, kind: 'food', verb: 'Eat', effects: { energy: 185 } }, meta: { label: 'Waffle', baseCost: 185 } },
  cherry: { info: { usable: true, kind: 'food', verb: 'Eat', effects: { mood: 8 } }, meta: { label: 'Cherry', baseCost: 2 } },
  juice: { info: { usable: true, kind: 'drink', verb: 'Drink', effects: { energy: 15, mood: 8 } }, meta: { label: 'Juice', baseCost: 10 } },
  spinach: { info: { usable: true, kind: 'food', verb: 'Eat', effects: { energy: 3 } }, meta: { label: 'Spinach' }, buff: true },
  cake: { info: { usable: true, kind: 'food', verb: 'Eat', effects: { energy: 20 } }, meta: { label: 'Quest Cake', tags: ['quest-item'] } },
  pick: { info: { usable: false, verb: 'Use', effects: {} }, meta: { label: 'Pick', isTool: true } },
};
const opts = (energy, energyMax = 100) => ({
  info: (c) => FOOD[c]?.info,
  meta: (c) => FOOD[c]?.meta,
  buff: (c) => Boolean(FOOD[c]?.buff),
  energy,
  energyMax,
});
const slots = (...ids) => ids.map((id) => ({ classTsid: id, label: FOOD[id].meta.label, count: 3 }));
const best = (energy, ...ids) => {
  const list = eatChoices(slots(...ids), opts(energy));
  return list[bestFoodIndex(list)]?.classTsid || null;
};

describe('ticket 62: which stacks Eat what? offers', () => {
  it('ordinary eats only: never a drink, a buff herb, a tool or a quest item', () => {
    const ids = eatChoices(slots(...Object.keys(FOOD)), opts(50)).map((c) => c.classTsid);
    assert.deepEqual(ids, ['apple', 'sammich', 'pie', 'waffles', 'cherry']);
    assert.equal(isEatable(FOOD.cake.info, { tags: ['no_eat'] }), false, "'no_eat' stays off");
  });

  it('in pack order, with what one would put in', () => {
    const [apple, waffle] = eatChoices(slots('apple', 'waffles'), opts(90));
    assert.deepEqual([apple.gain, apple.spill], [10, 0]);
    assert.deepEqual([waffle.gain, waffle.spill], [10, 175]);
  });

  it('at full energy only food with no energy (food.js: "You already have full energy.")', () => {
    assert.deepEqual(eatChoices(slots('apple', 'cherry'), opts(100)).map((c) => c.classTsid), ['cherry']);
    assert.deepEqual(eatChoices(slots('apple'), opts(100)), []);
  });

  it('the game\'s real catalogue: an apple is food, the pack slots feed it', () => {
    const list = eatChoices(listPackItemSlots({ apple: 2, milk_butterfly: 1 }), {
      info: getItemUseInfo, meta: (c) => ITEM_CATALOG[c], energy: 40, energyMax: 100,
    });
    assert.deepEqual(list.map((c) => [c.classTsid, c.have]), [['apple', 2]], 'Butterfly Milk is a drink');
  });
});

describe('ticket 62: the best food', () => {
  it('the most energy that fits without spilling over', () => {
    assert.equal(best(50, 'apple', 'sammich', 'waffles'), 'sammich');
    assert.equal(best(85, 'apple', 'sammich', 'waffles'), 'apple', '15 room: the apple fits, the Sammich spills');
  });

  it('when everything spills, the one that spills least', () => {
    assert.equal(best(95, 'sammich', 'waffles'), 'sammich');
  });

  it('ties go to the cheaper food, so the precious one is kept', () => {
    assert.equal(best(50, 'pie', 'sammich'), 'sammich');
    assert.ok(compareFood({ energy: 25, gain: 25, spill: 0, mood: 0, value: 40, have: 1, label: 'b' }, { energy: 25, gain: 25, spill: 0, mood: 0, value: 90, have: 9, label: 'a' }) < 0);
  });

  it('food with energy before mood food; mood food alone when energy is full', () => {
    assert.equal(best(10, 'cherry', 'apple'), 'apple');
    assert.equal(best(100, 'cherry', 'apple'), 'cherry');
    assert.equal(bestFoodIndex([]), -1);
  });

  it('the footer line says why', () => {
    const [c] = eatChoices(slots('sammich'), opts(50));
    assert.equal(eatTip(c, { best: true }), 'Best for now: Sammich: +25 energy, +10 mood (you have 3)');
    assert.equal(EAT_PICK_TEXT.nothing, 'You have nothing to eat.');
    for (const t of [EAT_PICK_TEXT.title, EAT_PICK_TEXT.nothing, eatTip(c)]) assert.doesNotMatch(t, /—/);
  });
});

describe('ticket 62: F, / and R in game.js', () => {
  const keydown = game.slice(game.indexOf("window.addEventListener('keydown', (e) => {\n    if (e.target?.matches?.('input, textarea, select, [contenteditable=\"true\"]')) {"));
  const fn = game.slice(game.indexOf('function openEatPicker() {'), game.indexOf('function announceQuestCompletions('));

  it('F opens Eat what? (no more instant apple), after the typing guard', () => {
    assert.ok(keydown.indexOf("if (!e.repeat && isPlainKey(e, 'f')) {") > 0);
    assert.match(keydown, /isPlainKey\(e, 'f'\)\) \{\s+e\.preventDefault\(\);\s+keys\.delete\(e\.key\);\s+openEatPicker\(\);/);
    assert.doesNotMatch(game, /eatApple/);
    assert.match(keydown, /menuTarget\.eatPicker && isPlainKey\(e, 'f'\)[\s\S]{0,120}closeVerbMenu\(\)/, 'F again puts it away');
  });

  it('the verb menu\'s picture level, the best tile focused, Enter or a click eats one through the pack', () => {
    assert.match(fn, /renderVerbMenu\(target, null, \{[\s\S]*noBack: true,[\s\S]*onPick: \(food\) => \{[\s\S]*usePackItem\(food\.classTsid\);/);
    assert.match(fn, /focusVerbRow\(menu, best\)/);
    assert.match(fn, /toast\(anyFood \? \(!dead\.ok \? dead\.msg : gate\.reason\) : EAT_PICK_TEXT\.nothing/);
    assert.match(fn, /homeEditMode/, 'not in Decoration Mode, where the avatar is hidden');
    // renderVerbMenu honours the level's own pick and footer.
    assert.match(game, /if \(level\.onPick\) \{\s+level\.onPick\(food\);\s+return;\s+\}/);
    assert.match(game, /tip: level\.tipFor\?\.\(food, i\) \|\| ''/);
  });

  it('R presses the Reports button (multiplayer only: it is there only online)', () => {
    assert.match(keydown, /if \(isPlainKey\(e, 'r'\) && !e\.repeat\) \{\s+const bug = document\.getElementById\('bug-btn'\);/);
    const feature = readFileSync(join(root, 'public/js/features/bug-report-feature.js'), 'utf8');
    assert.match(feature, /export const REPORT_KEY = 'R';/);
    assert.match(feature, /'data-key': REPORT_KEY/, 'the tooltip shows the key cap');
    assert.match(feature, /else btn\.title = b\.tip;/, 'the title the bar adopts carries no (R): the cap is the key');
    // R is free: no other key handler in the game takes it (the level builder is its own page).
    const files = ['public/game.js', 'public/js/features/camera-mode-feature.js', 'public/js/features/homes-feature.js', 'public/js/ui/home-builder.js'];
    for (const f of files) {
      const src = readFileSync(join(root, f), 'utf8');
      const hits = src.match(/(?:e|ev|event)\.key === '[rR]'|isPlainKey\(e, 'r'\)/g) || [];
      assert.ok(hits.length <= (f === 'public/game.js' ? 1 : 0), `${f}: ${hits.join(', ')}`);
    }
  });

  it('the hotkey sheet lists F, / and (online) R; the start card lists F and /', () => {
    const rows = (o) => hotkeySections(o).flatMap((s) => s.rows.map(([label, alts]) => `${label}: ${hotkeyText(alts)}`));
    assert.ok(rows().includes('Eat: F'));
    assert.ok(rows().includes('Chat: /'));
    assert.ok(!rows().some((r) => r.startsWith('Report a Bug')), 'solo has no Reports');
    assert.ok(rows({ reports: true }).includes('Report a Bug: R'));
    assert.match(game, /reports: \(\) => Boolean\(document\.getElementById\('bug-btn'\)\)/);
    const html = readFileSync(join(root, 'public/play/index.html'), 'utf8');
    assert.match(html, /<kbd>F<\/kbd><\/span><span>Eat<\/span>/);
    assert.match(html, /<kbd>\/<\/kbd><\/span><span>Chat<\/span>/);
  });

  it('/ puts the keyboard in the chat box, never while typing (js/ui/social-drawer.js)', () => {
    const drawer = readFileSync(join(root, 'public/js/ui/social-drawer.js'), 'utf8');
    assert.match(drawer, /if \(e\.key !== '\/' \|\| e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey \|\| e\.defaultPrevented\) return;\s+if \(e\.target\?\.matches\?\.\('input, textarea, select, \[contenteditable="true"\]'\)\) return;/);
  });
});
