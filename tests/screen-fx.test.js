/**
 * Screen transition helpers (shipped module).
 * Run: node --test tests/screen-fx.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOAD_FADE_IN,
  LOAD_FADE_OUT,
  LOAD_HOLD_MS,
  AWARD_FADE_IN,
  AWARD_FADE_OUT,
  AWARD_HOLD_MS,
  NEW_DAY_HOLD_MS,
  wait,
  nextFrame,
  normalizeAwardPages,
  awardRewardTokens,
  runStreetTransition,
  showAwardScreen,
} from '../public/js/screen-fx.js';

describe('screen-fx timings (LoadingLocationView / BaseScreenView)', () => {
  it('uses deliberate non-skippable fade windows (seconds)', () => {
    // Teleport slightly slower than original LoadingLocationView (~0.2 / 0.5)
    assert.ok(LOAD_FADE_IN >= 0.35 && LOAD_FADE_IN <= 0.7);
    assert.ok(LOAD_FADE_OUT >= 0.6 && LOAD_FADE_OUT <= 1.2);
    assert.ok(LOAD_HOLD_MS >= 300 && LOAD_HOLD_MS <= 800);
    // BaseScreenView-ish award fades
    assert.ok(AWARD_FADE_IN >= 0.3 && AWARD_FADE_IN <= 0.6);
    assert.ok(AWARD_FADE_OUT >= 0.25 && AWARD_FADE_OUT <= 0.55);
    assert.ok(AWARD_HOLD_MS >= 3000);
    assert.ok(NEW_DAY_HOLD_MS >= 3500);
  });

  it('wait resolves after the requested delay', async () => {
    const t0 = Date.now();
    await wait(40);
    assert.ok(Date.now() - t0 >= 35);
  });

  it('runStreetTransition calls onMid between fades when DOM is present', async () => {
    // Minimal DOM stubs (jsdom not required — create elements in memory)
    const { JSDOM } = await import('jsdom').catch(() => ({ JSDOM: null }));
    if (!JSDOM) {
      // Environment without jsdom: still exercise mid callback via null el path
      let mid = false;
      await runStreetTransition(null, {
        toLabel: 'Test Street',
        onMid: async () => {
          mid = true;
        },
      });
      assert.equal(mid, true);
      return;
    }
    const dom = new JSDOM(`<!DOCTYPE html><div id="st" hidden>
      <span data-st-leave></span><span data-st-leave-hub></span>
      <span data-st-enter></span><span data-st-enter-hub></span>
      <i data-st-bar></i><span data-st-status></span>
    </div>`);
    globalThis.document = dom.window.document;
    globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    const el = dom.window.document.getElementById('st');
    let mid = false;
    await runStreetTransition(el, {
      fromLabel: 'A',
      fromHub: 'Hub A',
      toLabel: 'B',
      toHub: 'Hub B',
      onMid: async () => {
        mid = true;
      },
    });
    assert.equal(mid, true);
    assert.equal(el.querySelector('[data-st-enter]').textContent, 'B');
  });

  it('showAwardScreen no-ops without element', async () => {
    await showAwardScreen(null, { title: 'x' });
  });

  it('normalizes authored quest-completion pages and gives the final page an OK action', () => {
    assert.deepEqual(
      normalizeAwardPages({
        steps: [
          { text: 'Where did he go?', response: 'I dunno.' },
          { text: 'Anything is possible.', response: '' },
        ],
        primaryLabel: 'OK',
      }),
      [
        { text: 'Where did he go?', response: 'I dunno.' },
        { text: 'Anything is possible.', response: 'OK' },
      ]
    );
  });

  it('rejects malformed pages so ordinary awards retain their timed behavior', () => {
    assert.deepEqual(normalizeAwardPages({ steps: null }), []);
    assert.deepEqual(normalizeAwardPages({ steps: [{ text: '  ', response: '' }] }), []);
  });

  it('classifies source-style reward pills without changing their authored order', () => {
    assert.deepEqual(
      awardRewardTokens('+500 iMG · +50 Lem favor · +300 currants · +200 mood'),
      [
        { text: '+500 iMG', kind: 'img' },
        { text: '+50 Lem favor', kind: 'favor' },
        { text: '+300 currants', kind: 'currants' },
        { text: '+200 mood', kind: 'mood' },
      ]
    );
  });
});

describe('badge + loading asset maps (local pack)', () => {
  it('maps exist and include priority streets when present on disk', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '../public');
    const badgeMapPath = join(root, 'assets/content/badge-icons.json');
    const loadMapPath = join(root, 'assets/content/loading-images.json');
    assert.ok(existsSync(badgeMapPath), 'badge-icons.json');
    assert.ok(existsSync(loadMapPath), 'loading-images.json');
    const badges = JSON.parse(readFileSync(badgeMapPath, 'utf8'));
    const loads = JSON.parse(readFileSync(loadMapPath, 'utf8'));
    assert.ok(typeof badges === 'object');
    assert.ok(typeof loads === 'object');
    // Hechey / Guillermo snaps were priority-fetched from Wayback
    if (loads.GLI2V0UN7RD1T2J?.local) {
      assert.ok(existsSync(join(root, loads.GLI2V0UN7RD1T2J.local)));
    }
    if (loads.GM4109NI2R640?.local) {
      assert.ok(existsSync(join(root, loads.GM4109NI2R640.local)));
    }
    // Any badge entry must point at a real file
    for (const [id, path] of Object.entries(badges).slice(0, 20)) {
      assert.ok(existsSync(join(root, path)), `missing badge file ${id} ${path}`);
    }
  });

  it('ships the original quest book and routes every authored completion through pages', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '../public');
    const game = readFileSync(join(root, 'game.js'), 'utf8');
    assert.ok(existsSync(join(root, 'assets/ui/quest-book.png')));
    assert.match(
      game,
      /const completionPages = parseQuestConversation\(update\.def\.completion\)/
    );
    assert.match(game, /steps: completionPages/);
    assert.doesNotMatch(game, /const phantomCompletion/);
    assert.match(game, /onDismiss: \(\) => leaveFourLetterQuest\(\{ abandon: false \}\)/);
    assert.match(game, /onDismiss: \(\) => leaveLegalizeIt\(\{ abandon: false \}\)/);
    assert.match(game, /onDismiss: \(\) => returnFromRookWoods\(\)/);
    assert.match(game, /onDismiss: \(\) => returnFromRookMuseum\(\)/);
    assert.match(game, /onDismiss: \(\) => returnFromDeEmbiggenify\(\)/);
  });
});

describe('award card text', () => {
  it('drops GSJS item links and tags but keeps the words', async () => {
    const { awardText, normalizeAwardPages } = await import('../public/js/screen-fx.js');
    assert.equal(
      awardText('Give 6 <a href="event:item|npc_piggy">Piggies</a> the pleasuring of a lifetime. By petting them, of course.'),
      'Give 6 Piggies the pleasuring of a lifetime. By petting them, of course.',
    );
    assert.equal(awardText('<b>Bold</b> &amp; brave<br>next &quot;line&quot;'), 'Bold & brave\nnext "line"');
    assert.equal(awardText(undefined), '');
    assert.equal(normalizeAwardPages({ steps: [{ text: 'A <a href="event:item|apple">Apple</a>' }] })[0].text, 'A Apple');
  });
});
