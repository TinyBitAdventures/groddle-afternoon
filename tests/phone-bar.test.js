/**
 * PHONEBAR (Austin 2026-11-12, on his iPhone): a phone's right pill shows exactly Quests, Report a
 * problem and the Menu. The study pill, Make, Map, Imagination, Mail and Sound open from the Menu
 * (its first rows: Skills with the study, Make, Mail, Sound), and a thin ring round the Menu button
 * shows the skill being learned. Computers and tablets keep their bar.
 * Run: node --test tests/phone-bar.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MENU_GROUPS, MENU_ROWS, PHONE_MENU_GROUP, menuRowFor, phoneBar, studyRowDetail } from '../public/js/ui/topbar.js?v=04d7482c';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');
const src = readFileSync(join(root, 'public/js/ui/topbar.js'), 'utf8');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const block = css.slice(css.indexOf('/* PHONEBAR (Austin 2026-11-12'), css.indexOf('/* —— end PAPER —— */'));

describe('the phone Menu: Now first, then the rest', () => {
  it('Skills, Make, Mail and Sound go to Now on a phone; elsewhere Make and Mail stay in World', () => {
    assert.deepEqual(PHONE_MENU_GROUP, { id: 'now', label: 'Now' });
    // The four groups everywhere else are unchanged.
    assert.deepEqual(MENU_GROUPS.map((g) => g.id), ['me', 'world', 'social', 'settings']);
    const phone = ['menu-study-btn', 'menu-make-btn', 'menu-mail-btn', 'menu-sound-btn'].map((id) => menuRowFor(id, { phone: true }));
    assert.deepEqual(phone.map((r) => r.group), ['now', 'now', 'now', 'now']);
    assert.deepEqual(phone.map((r) => r.rank), [0, 1, 2, 3]);
    assert.equal(menuRowFor('menu-make-btn').group, 'world');
    assert.equal(menuRowFor('menu-make-btn').key, 'N');
    assert.equal(menuRowFor('menu-make-btn', { phone: true }).key, 'N');
    assert.equal(menuRowFor('menu-mail-btn').group, 'world');
    assert.equal('phone' in menuRowFor('menu-make-btn'), false);
    assert.equal(MENU_ROWS['menu-study-btn'].key, 'K');
    // A row with no phone place is the same row either way.
    assert.equal(menuRowFor('skills-btn', { phone: true }), MENU_ROWS['skills-btn']);
  });
  it('the study row reads as the bar pill did', () => {
    assert.equal(studyRowDetail({ hidden: false, skill: 'animalkinship_1', name: 'Animal Kinship I', short: '1:53' }), 'learning Animal Kinship I · 1:53');
    assert.equal(studyRowDetail({ hidden: false, skill: '', name: 'Skills', short: '5' }), '5 available');
    assert.equal(studyRowDetail({ hidden: true, short: '5' }), '');
    assert.equal(studyRowDetail(), '');
  });
  it('a phone in Modern only', () => {
    const doc = (cls, ui) => ({ documentElement: { classList: { contains: (c) => cls.includes(c) }, dataset: { ui } } });
    assert.equal(phoneBar(doc(['touch-phone'], 'modern')), true);
    assert.equal(phoneBar(doc(['touch-phone'], 'classic')), false);
    assert.equal(phoneBar(doc([], 'modern')), false);
    assert.equal(phoneBar(null), false);
  });
  it('the rows click the bar buttons, the Now group comes first, a skin switch re-sorts', () => {
    assert.match(src, /for \(const g of phone \? \[PHONE_MENU_GROUP, \.\.\.MENU_GROUPS\] : MENU_GROUPS\)/);
    assert.match(src, /if \(g === PHONE_MENU_GROUP\) list\.prepend\(box\);/);
    assert.match(src, /const row = menuRowFor\(btn\.id, \{ phone: onPhone \}\);/);
    assert.match(src, /row\('menu-study-btn', [^\n]*\(\) => doc\.getElementById\('skills-btn'\)\?\.click\(\)\);/);
    assert.match(src, /row\('menu-sound-btn', [^\n]*\(\) => sound\?\.click\(\)\);/);
    assert.match(src, /installNarrowRows\(doc\);\s*installPhoneRows\(doc\);/);
    // The phone bar always moves the study, Map and Make; Quests stays.
    assert.match(src, /if \(phoneBar\(doc\)\) return apply\(\['chip', 'map', 'make'\]\);/);
  });
  it('Sound opens under the Menu button when the bar does not draw it', () => {
    assert.match(src, /const anchor = \(\) => \(btn\.getClientRects\(\)\.length \? btn : doc\.getElementById\('more-btn'\) \|\| btn\);/);
    assert.match(src, /const r = anchor\(\)\.getBoundingClientRect\(\);/);
  });
});

describe('the phone bar', () => {
  it('three buttons, each a 44 px target', () => {
    const hud = ':root.touch-phone[data-ui="modern"] .top-bar .hud-actions ';
    const rule = (body) => block.slice(0, block.indexOf(body)).split('}').pop();
    const hidden = rule('{ display: none; }');
    for (const id of ['#study-chip', '#make-btn', '#map-btn', '#imagination-btn', '#mail-btn', '#sound-btn', '.hud-div']) assert.ok(hidden.includes(hud + id), id);
    assert.doesNotMatch(hidden, /#quest-btn|#bug-btn|#more-btn/);
    const sized = rule('{ order: 0; flex: none; width: var(--slot); height: var(--slot); }');
    for (const id of ['#quest-btn', '#bug-btn', '#more-btn', '#sound-btn']) assert.ok(sized.includes(hud + id), id);
  });
  it('the tutorial hiding the actions leaves Sound alone on the bar, as on a computer', () => {
    assert.match(block, /:root\.touch-phone\[data-ui="modern"\] body\.nx-hide-actions \.top-bar \.hud-actions #sound-btn \{ display: inline-grid; \}/);
    assert.match(block, /\[data-ui="modern"\] body\.nx-hide-map \.more-list #menu-map-btn,\s*\[data-ui="modern"\] body\.nx-hide-currants \.more-list #menu-currants \{ display: none; \}/);
  });
  it('the Menu button rings the study, thin, in the accent, still under reduced motion', () => {
    assert.match(block, /#more-btn\[data-study-ring\] \.menu-study-ring \{/);
    assert.match(block, /\.msr-fill \{\s*fill: none; stroke: var\(--accent\); stroke-width: 2;/);
    assert.match(block, /@media \(prefers-reduced-motion: reduce\) \{\s*\[data-ui="modern"\] \.top-bar #more-btn \.menu-study-ring \.msr-fill \{ transition: none; \}/);
    assert.match(src, /if \(showRing\) more\.dataset\.studyRing = '';/);
  });
  it('the game hands the study share to the pill', () => {
    assert.match(game, /if \(chip\) chip\.dataset\.progress = String\(Math\.round\(active\.progress \* 1000\) \/ 1000\);/);
    assert.match(game, /if \(chip\) delete chip\.dataset\.progress;\s*if \(chip\) paintIdleSkillChip/);
  });
  it('Skills is the Now row on a phone, and Report over a window draws as the bar button', () => {
    assert.match(block, /:root\.touch-phone\[data-ui="modern"\] \.more-list #skills-btn \{ display: none; \}/);
    assert.match(block, /\[data-ui="modern"\] #bug-btn-lift \.hud-badge \{/);
  });
});
