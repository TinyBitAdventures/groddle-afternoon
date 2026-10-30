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
} from '../public/js/ui/moment-card.js?v=g470-1';
import { awardRewardTokens } from '../public/js/screen-fx.js?v=g470-1';
import { readTokens } from '../tools/tokens/css-sources.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(root, 'public');
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
    assert.equal(momentArt({ kind: 'achievement', iconUrl: 'assets/badges/confident_petter.png' }), 'assets/badges/confident_petter.png');
    assert.equal(momentArt({ kind: 'quest' }), 'assets/ui/quest-book.png');
    assert.equal(momentArt({ kind: 'level' }), MOMENT_ART.level);
    assert.equal(momentArt({ kind: 'generic' }), null);
    assert.equal(momentArtShape('assets/ui/quest-book.png'), 'book');
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
      ['+300 iMG', 'img', 'assets/imagination/ui/imagination_button.png'],
      ['+40 Grendaline favor', 'favor', 'assets/sprites/icons/emblem_grendaline@3x.png'],
      ['+50 currants', 'currants', 'assets/sprites/icons/pile_of_currants@3x.png'],
      ['+30 energy', 'energy', null],
    ]);
    for (const c of chips) if (c.icon) assert.ok(existsSync(join(PUBLIC, c.icon)), c.icon);
    assert.deepEqual(rewardChips(awardRewardTokens('Onwards and upwards!')), []);
    assert.deepEqual(rewardChips(awardRewardTokens('Numismatical!')), []);
    assert.deepEqual(rewardChips(awardRewardTokens('+1,000 iMG · You opened the box!')), []);
    assert.equal(isRewardText('2 levels gained'), true);
    assert.equal(rewardIcon('+30 All favor', 'favor'), null);
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
    assert.equal(tokens.get('--moment-art-book'), '140px');
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
      if (sel === '.award-more') continue;
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
    assert.match(fx, /const modern = isModernSkin\(\);\n\s+const art = modern \? momentArt\(payload\) : payload\.iconUrl;/);
    assert.match(fx, /const chips = modern && !paged \? rewardChips\(/);
    assert.match(fx, /await holdScreenUntilDismissed\(el, \{ button: next, autoCloseMs: awardAutoCloseMs\(\) \}\);/);
  });
});
