/**
 * The modern skin's big moment card (js/ui/moment-card.js; HUB, phase 2): the HUD mock's
 * final sizes on #award-screen under <html data-ui="modern">, art for every moment, reward
 * chips, the "N more" line, and the award screens' own rules left to js/screen-fx.js.
 * Run: node --test tests/moment-card.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MOMENT_ART,
  isModernSkin,
  isRewardText,
  momentArt,
  momentArtShape,
  momentMoreText,
  rewardChips,
  rewardIcon,
} from '../public/js/ui/moment-card.js?v=b383144f';
import { awardRewardTokens, awardTokens } from '../public/js/screen-fx.js?v=7cd62cca';
import { questRewardSummary } from '../public/js/quests.js?v=4c8f3a10';
import { questAwardPayload } from '../public/js/quest-offers.js?v=dfecc1b4';
import { readTokens } from '../tools/tokens/css-sources.mjs';
import { statIconUrl } from '../public/js/stat-icons.js?v=36d17f30';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(root, 'public');
// #562: the stats' reward icons are the top bar's and the bubble's (js/stat-icons.js).
const IMG_ICON = statIconUrl('imagination');
const CURRANTS_ICON = statIconUrl('currants');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');
const css = read('style.css');
const hub = css.slice(css.indexOf('/* —— HUB —— */'), css.indexOf('/* —— end HUB —— */'));

describe('moment card helpers', () => {
  it('reads the skin from <html data-ui>', () => {
    assert.equal(isModernSkin({ documentElement: { dataset: { ui: 'modern' } } }), true);
    assert.equal(isModernSkin({ documentElement: { dataset: { ui: 'classic' } } }), false);
    assert.equal(isModernSkin(undefined), false);
  });

  it('gives every moment art: its own, else the quest book or the iMG mark', () => {
    assert.equal(momentArt({ kind: 'achievement', iconUrl: 'assets/badges/confident_petter.webp' }), 'assets/badges/confident_petter.webp');
    assert.equal(momentArt({ kind: 'quest' }), 'assets/ui/quest-book-solid.webp');
    // A paged quest's own book (game.js iconUrl) is the solid copy too: no rays through the pages.
    assert.equal(momentArt({ kind: 'quest', iconUrl: 'assets/ui/quest-book.webp' }), 'assets/ui/quest-book-solid.webp');
    assert.equal(momentArt({ kind: 'level' }), MOMENT_ART.level);
    assert.equal(momentArt({ kind: 'generic' }), null);
    assert.equal(momentArtShape('assets/ui/quest-book.webp'), 'book');
    assert.equal(momentArtShape('assets/ui/quest-book-solid.webp'), 'book');
    assert.equal(momentArtShape('assets/badges/x.png'), 'square');
    for (const url of Object.values(MOMENT_ART)) assert.ok(existsSync(join(PUBLIC, url)), url);
    // The cropped iMG mark is the card art's own paths with a tighter viewBox.
    const crop = read('assets/imagination/ui/moment_icon_imagination.svg');
    const card = read('assets/imagination/cards/icon_imagination.svg');
    assert.match(crop, /viewBox="132\.10 172\.80 57\.85 52\.40"/);
    assert.equal(crop.slice(crop.indexOf('<defs>')), card.slice(card.indexOf('<defs>')));
  });

  it('turns a reward summary into chips, and leaves a cheer as words', () => {
    const chips = rewardChips(awardRewardTokens('+300 iMG · +40 Grendaline favor · +50 currants · +30 energy'));
    assert.deepEqual(chips.map((c) => [c.text, c.kind, c.icon]), [
      ['+300 iMG', 'img', IMG_ICON],
      ['+40 Grendaline favor', 'favor', 'assets/sprites/icons/emblem_grendaline@3x.webp'],
      ['+50 currants', 'currants', CURRANTS_ICON],
      ['+30 energy', 'energy', statIconUrl('energy')],
    ]);
    for (const c of chips) if (c.icon && !c.icon.startsWith('data:')) assert.ok(existsSync(join(PUBLIC, c.icon)), c.icon);
    assert.deepEqual(rewardChips(awardRewardTokens('Onwards and upwards!')), []);
    assert.deepEqual(rewardChips(awardRewardTokens('Numismatical!')), []);
    // #492: one chip per line, never all or nothing: a line that is not a reward keeps its words.
    assert.deepEqual(rewardChips(awardRewardTokens('+1,000 iMG · You opened the box!')).map((c) => [c.text, c.icon]), [
      ['+1,000 iMG', IMG_ICON],
      ['You opened the box!', null],
    ]);
    assert.equal(isRewardText('2 levels gained'), true);
    assert.equal(rewardIcon('+30 All favor', 'favor'), null);
  });

  it('#492: a quest with a recipe or an item reward keeps every icon (The Grill of Victory)', () => {
    // quests.json grilling_make_level1_recipes: xp 275, currants 175, energy 25, Pot favor 25, a recipe.
    const grill = {
      title: 'The Grill of Victory',
      rewards: { xp: 275, currants: 175, energy: 25, favor: { 0: { giant: 'pot', points: 25 } }, recipes: { 0: { class_tsid: 'papl_upside_down_pizza', label: 'Pineapple Upside Down Pizza' } } },
    };
    const payload = questAwardPayload(grill, questRewardSummary(grill.rewards));
    assert.equal(payload.subtitle, '+275 iMG · +175 currants · +25 energy · +25 Pot favor · Recipe: Pineapple Upside Down Pizza');
    const chips = rewardChips(awardTokens(payload));
    assert.deepEqual(chips.map((c) => [c.text, c.kind, c.icon]), [
      ['+275 iMG', 'img', IMG_ICON],
      ['+175 currants', 'currants', CURRANTS_ICON],
      ['+25 energy', 'energy', statIconUrl('energy')],
      ['+25 Pot favor', 'favor', 'assets/sprites/icons/emblem_pot@3x.webp'],
      ['Recipe: Pineapple Upside Down Pizza', 'recipe', null],
    ]);
    // The subtitle alone (an old save's queued award) still gives the icons it can.
    assert.equal(rewardChips(awardTokens({ subtitle: payload.subtitle })).filter((c) => c.icon).length, 4);
    // An item reward shows its own icon, as a Glitch reward slug did (Slug.as getIcon 228-233).
    const items = questRewardSummary({ xp: 10, items: { 0: { class_tsid: 'element_red', label: 'Red Element', count: 100 } } });
    const itemChips = rewardChips(awardTokens(questAwardPayload({ title: 'x' }, items)));
    assert.deepEqual(itemChips.map((c) => [c.text, c.icon]), [
      ['+10 iMG', IMG_ICON],
      ['100× Red Element', 'assets/sprites/icons/element_red.webp'],
    ]);
    for (const c of [...chips, ...itemChips]) if (c.icon && !c.icon.startsWith('data:')) assert.ok(existsSync(join(PUBLIC, c.icon)), c.icon);
  });

  it('says how many screens wait behind this one', () => {
    assert.equal(momentMoreText(0), '');
    assert.equal(momentMoreText(-1), '');
    assert.equal(momentMoreText(1), '1 more');
    assert.equal(momentMoreText(3), '3 more');
  });
});

describe('the big moment card in the page', () => {
  it('takes the mock\'s final sizes from tokens', () => {
    const tokens = readTokens(root);
    assert.equal(tokens.get('--moment-w'), 'clamp(460px, 41vw, 640px)');
    assert.equal(tokens.get('--fs-moment-title'), 'clamp(2.125rem, 3vw, 2.5rem)');
    assert.equal(tokens.get('--fs-lead'), '1.0625rem');
    assert.equal(tokens.get('--moment-art'), '166px');
    assert.equal(tokens.get('--moment-burst'), '192px');
    assert.equal(tokens.get('--moment-art-book'), '129px'); // 1.5x the 86 px book, its only size
    assert.equal(tokens.get('--scrim-strong'), 'rgba(36, 22, 10, 0.6)');
    assert.match(hub, /width: var\(--moment-w\);/);
    assert.match(hub, /font-size: var\(--fs-moment-title\);/);
    assert.match(hub, /font-size: var\(--fs-lead\);/);
    assert.match(hub, /background: var\(--scrim-strong\);/);
    // Eyebrow 14 px at .14em, chips 38 px with 16 px words and 26 px icons, buttons 44 px and 16 px.
    assert.match(hub, /font-size: var\(--fs-base\);\n\s+font-weight: var\(--fw-heavy\);\n\s+letter-spacing: 0\.14em;/);
    assert.match(hub, /height: 38px;[\s\S]{0,260}font-size: var\(--fs-lg\);/);
    assert.match(hub, /\.award-reward-icon \{ width: 26px; height: 26px;/);
    assert.match(hub, /min-height: 44px;[\s\S]{0,300}font-size: var\(--fs-lg\);/);
    // Every look is the modern skin's.
    for (const rule of hub.split('}').map((r) => r.trim()).filter((r) => r && !r.startsWith('@') && !r.startsWith('/*') && /\{/.test(r))) {
      const sel = rule.slice(0, rule.indexOf('{')).replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (!sel || /^(from|to|\d)/.test(sel) || sel.startsWith('@')) continue;
      if (sel === '.award-more' || sel === '.imagination-hub[hidden]') continue;
      for (const part of sel.split(',')) assert.match(part.trim(), /^\[data-ui="modern"\]/, part);
    }
    assert.match(hub, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none;/);
  });

  it('has the queued line in the card and the game keeps it current', () => {
    const html = read('play/index.html');
    assert.match(html, /<span class="award-more" data-award-more hidden><\/span>\n\s+<p class="award-kicker" data-award-kicker>/);
    const game = read('game.js');
    assert.match(game, /awardsPending \+= 1;\n\s+noteScreensWaiting\(\);/);
    assert.match(game, /noteScreenHold\(''\);\n\s+noteScreensWaiting\(\);/);
    assert.match(game, /const text = momentMoreText\(awardsPending - 1\);/);
  });

  it('leaves the screens\' rules to screen-fx.js (art and chips only in the modern skin)', () => {
    const fx = read('js/screen-fx.js');
    assert.match(fx, /const modern = isModernSkin\(\);\n\s+const art = modern \? momentArt\(payload\) : momentSharpUrl\(payload\.iconUrl\);/);
    assert.match(fx, /const chips = modern && !paged \? rewardChips\(/);
    assert.match(fx, /await holdScreenUntilDismissed\(el, \{ button: next, autoCloseMs: awardAutoCloseMs\(\) \}\);/);
  });
});
