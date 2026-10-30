// Regressions found by the integration playtest (tools/playtest.mjs): places
// where two features meet inside game.js, checked against the source text.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');

function fnBody(name) {
  const start = game.search(new RegExp(`\\n(async )?function ${name}\\(`));
  assert.ok(start >= 0, `${name} exists`);
  const next = game.slice(start + 1).search(/\n(async )?function /);
  return game.slice(start, next < 0 ? undefined : start + 1 + next);
}

test.describe('integration playtest regressions', () => {
  test('F eats an apple through the pack path (Naraka gate, fullness, food memory, quests)', () => {
    const body = fnBody('eatApple');
    assert.match(body, /usePackItem\('apple'\)/);
    assert.doesNotMatch(body, /useItem\(inv/);
  });

  test('toasts expire on the wall clock, not counted frames', () => {
    // NOTIFY: toast() is the notifier's notice; its clock is performance.now() (js/notify.js tick).
    assert.match(fnBody('toast'), /notify\.notice\(wholeStatAmounts\(msg\), \{ ms \}\)/);
    assert.match(game, /notifyView\?\.frame\(performance\.now\(\), \{ hold, dropBefore: notifyModalSince \}\);/);
    assert.doesNotMatch(game, /state\.toastTimer/);
  });

  test('chrome buttons wrap instead of running off wide screens', () => {
    const wide = /@media \(min-width: 1101px\) \{([\s\S]*?)\n\}/.exec(css)[1];
    assert.match(wide, /\.top-actions \{[^}]*flex-wrap: wrap/);
    assert.doesNotMatch(wide, /\.top-actions \{ flex-wrap: nowrap; \}/);
  });

  test('phone-sized modals keep their header and close button inside the game root', () => {
    assert.match(css, /\.glitch-modal-card \{[^}]*max-height: min\(78vh, 640px, calc\(100% - 12px\)\)/);
    assert.match(css, /\.home-card,\n\.mail-card \{[^}]*width: min\(920px, 100%\)/);
  });

  test('the Magic Rock waits out rook attacks, Naraka and meditation', async () => {
    const { createFeatureHost } = await import('../public/js/feature-host.js');
    const { rookAttackFeature } = await import('../public/js/features/rook-attack-feature.js?v=g458-1');
    const { hellFeature } = await import('../public/js/features/hell-feature.js');
    const { createRookAttack } = await import('../public/js/rook-attack.js');
    const host = createFeatureHost([rookAttackFeature, hellFeature]);
    rookAttackFeature.restore({ active: createRookAttack({ tsid: 'L1', now: Date.now() }) });
    assert.equal(host.query('holdQuestOffers', { streetTsid: 'L1' }), true);
    assert.equal(host.query('holdQuestOffers', { streetTsid: 'L2' }), null);
    rookAttackFeature.restore(undefined);
    hellFeature.restore({ isDead: true });
    assert.equal(host.query('holdQuestOffers', { streetTsid: 'L1' }), true);
    hellFeature.restore(undefined);
    assert.equal(host.query('holdQuestOffers', { streetTsid: 'L1' }), null);
    const offers = fs.readFileSync(path.join(root, 'public/js/features/quest-offers-feature.js'), 'utf8');
    assert.match(offers, /engine\.busy\(\) \|\| engine\.questOffersHeld\?\.\(\)/);
    assert.match(game, /questOffersHeld: \(\) => (?:(?:!state\.started|startHeld\(\)) \|\| )?features\.query\('holdQuestOffers', engine\) === true/);
    const meditation = fs.readFileSync(path.join(root, 'public/js/features/meditation-feature.js'), 'utf8');
    assert.match(meditation, /holdQuestOffers\(\) \{\n    return session \? true : null;/);
  });

  test('the map and centred modals end above the live pack', () => {
    assert.match(css, /\.map-panel \{[^}]*bottom: var\(--pack-live-height, 112px\)/);
    assert.match(css, /\.glitch-modal \{[^}]*bottom: var\(--pack-live-height, 105px\)/);
  });

  test('vendor receipts say "1 currant"', async () => {
    const { vendorSell } = await import('../public/js/vendor.js');
    const { createInventory } = await import('../public/js/inventory.js?v=catalog-unified-7');
    const inv = createInventory();
    inv.grain = 1;
    const pc = { currants: 0 };
    // Grain base_cost 1: round(1 * 0.66) = 1 currant.
    const r = vendorSell(pc, inv, [], 'grain', 1);
    assert.ok(r.ok, JSON.stringify(r));
    assert.match(r.msgs[0], /for 1 currant\.$/);
  });

  test('closed roads refuse signposts but not the Map', async () => {
    const { createFeatureHost } = await import('../public/js/feature-host.js');
    const seen = [];
    const host = createFeatureHost([{ id: 'probe', travelGate: (tsid, engine, meta) => { seen.push(meta); return meta.via === 'signpost' ? { ok: false } : null; } }]);
    assert.equal(host.travelGate('L1', {}, { via: 'signpost' }).ok, false);
    assert.equal(host.travelGate('L1', {}).ok, true);
    assert.deepEqual(seen, [{ via: 'signpost' }, {}]);
    const jobs = fs.readFileSync(path.join(root, 'public/js/features/street-jobs-feature.js'), 'utf8');
    assert.match(jobs, /travelGate\(tsid, engine, meta = \{\}\) \{\n    if \(!catalog \|\| meta\?\.via !== 'signpost'\) return null;/);
    assert.match(game, /features\.travelGate\(toTsid, engine, \{ via: meta\.via \}\)/);
    assert.equal((game.match(/via: 'signpost' \}\)/g) || []).length, 2, 'T and signpost-board clicks both say signpost');
  });

  test('clicking a street mailbox goes through its feature, not the home mailbox gate', () => {
    assert.match(game, /if \(best\.classId === 'npc_mailbox'\) \{[\s\S]{0,200}?executeVerb\(best, 'view_inbox'\);/);
  });

  test('the street nameplate stays on one line on phones', () => {
    const phone = /@media \(max-width: 760px\) \{([\s\S]*?)\n\}/.exec(css)[1];
    assert.match(phone, /\.street-nameplate \{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis/);
  });

  test('every browser import of animals.js uses one cache-bust version', () => {
    const files = [
      'public/game.js',
      'public/content.js',
      ...fs.readdirSync(path.join(root, 'public/js/features')).map((f) => `public/js/features/${f}`),
      ...fs.readdirSync(path.join(root, 'public/js')).filter((f) => f.endsWith('.js')).map((f) => `public/js/${f}`),
    ];
    const versions = new Set();
    for (const file of files) {
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      for (const m of text.matchAll(/animals\.js\?v=([\w-]+)/g)) versions.add(m[1]);
    }
    assert.equal(versions.size, 1, [...versions].join(', '));
    // butterfly-care-1 was cached by browsers before pickerMaxCount existed.
    assert.ok(!versions.has('butterfly-care-1'));
  });

  test('phone side panels end above the pack and scroll inside', () => {
    const phone = /@media \(max-width: 760px\) \{([\s\S]*?)\n\}/.exec(css)[1];
    assert.match(phone, /\.side-panel \{[^}]*bottom: var\(--pack-live-height, 112px\)[^}]*pointer-events: none/);
    assert.match(phone, /\.side-panel\.side-panel > \.side-card \{[^}]*max-height: 100%[^}]*pointer-events: auto/);
  });

  test('a street that fails to load keeps you put and says so', () => {
    const body = fnBody('travelTo');
    assert.match(body, /try \{\n    await enterStreetWithTransition\(plan\.toTsid, arrive\);\n  \} catch \(err\) \{/);
    assert.match(body, /Could not reach \$\{plan\.label/);
    assert.match(body, /reason: 'load_failed'/);
  });
});
