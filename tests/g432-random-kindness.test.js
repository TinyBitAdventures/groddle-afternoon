/**
 * G432 (also closes G376's last rainbow): bestowing Random Kindness on another player
 * (items/random_kindness.js 274-328). The server's half is groddle-afternoon-server verbs.go
 * (TestBestowRandomKindness), the point's is the site's LedgerUse.php.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { KINDNESS_AMOUNT, PLAYER_VERBS, RANDOM_KINDNESS, VERB_TEXT, kindnessStat, doerSide } from '../public/js/player-verbs-mp.js?v=c82b7e0f';
import { OVERLAY_USES } from '../public/js/overlays.js?v=605c12ff';
import { TOOL_CONDITION_CATALOG } from '../public/js/tools.js?v=eff5ef6f';
import { playerVerbsMpFeature } from '../public/js/features/player-verbs-mp-feature.js?v=3c01778d';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const gsjs = readFileSync(join(root, '../glitch-GameServerJS/items/random_kindness.js'), 'utf8');

describe('G432 Random Kindness between players', () => {
  it('holds the source: 50, mood if below energy, else energy', () => {
    assert.match(gsjs, /target\.metabolics_get_mood\(\) < target\.metabolics_get_energy\(\)/);
    assert.match(gsjs, /metabolics_add_mood\(50\)/);
    assert.match(gsjs, /metabolics_add_energy\(50\)/);
    assert.equal(KINDNESS_AMOUNT, 50);
    assert.equal(kindnessStat({ mood: 10, energy: 40 }), 'mood');
    assert.equal(kindnessStat({ mood: 40, energy: 40 }), 'energy');
    assert.equal(kindnessStat({ mood: 90, energy: 40 }), 'energy');
  });

  it('says what the source says, on both sides', () => {
    assert.match(gsjs, /pc\.label\+' bestowed Random Kindness on you\. \+'\+mood\+' mood'/);
    assert.equal(VERB_TEXT.gotKindness('Ada', 'mood', 50), 'Ada bestowed Random Kindness on you. +50 mood');
    assert.equal(VERB_TEXT.gotKindness('Ada', 'energy', 12), 'Ada bestowed Random Kindness on you. +12 energy');
    assert.equal(VERB_TEXT.bestowed('Bo', 'mood', 50), 'You bestowed Bo with a Random Kindness. They gain 50 mood.');
    assert.equal(VERB_TEXT.bestowed('Bo', '', 0), 'You bestowed Bo with a Random Kindness.');
    for (const line of [VERB_TEXT.gotKindness('A', 'mood', 1), VERB_TEXT.bestowed('B', 'mood', 1), PLAYER_VERBS.bestow.tooltip]) assert.doesNotMatch(line, /—/);
  });

  it('the rainbow shows on the other player, 400 px for 4 s, its sound as the source pairs it', () => {
    assert.match(gsjs, /target\.show_rainbow\('rainbow_randomkindness'\)/);
    const use = OVERLAY_USES.rainbow_randomkindness;
    assert.equal(use.wh, 400);
    assert.equal(use.durationMs, 4000);
    assert.equal(use.sound, 'RAINBOW_RANDOMKINDNESS');
    const manifest = JSON.parse(read('public/assets/sprites/overlays/overlays-more.json'));
    const row = manifest.rainbow_randomkindness || manifest.overlays?.rainbow_randomkindness;
    assert.ok(row, 'rendered from the CC0 FLA');
    assert.equal(row.src, 'glitch-overlays/rainbow_randomkindness.fla');
  });

  it('the verb has no cost, and only the pack in multiplayer offers it', () => {
    assert.match(gsjs, /"tooltip"\s*:\s*"Bestow kindness on another player\. It's kind!"/);
    assert.equal(PLAYER_VERBS.bestow.item, RANDOM_KINDNESS);
    assert.equal(PLAYER_VERBS.bestow.emote, false);
    assert.deepEqual(doerSide('bestow', { name: 'Bo' }), { energy: 0, mood: 0, text: '' });
    // Solo: no session, no verb; the item has no meter and no copies, as before.
    assert.equal(playerVerbsMpFeature.packVerbs(RANDOM_KINDNESS, { mode: 'solo' }), null);
    assert.equal(TOOL_CONDITION_CATALOG[RANDOM_KINDNESS], undefined);
  });

  it('online the item keeps its 20 points per copy, and each Bestow uses one and counts Tottly\'s Toys', () => {
    assert.match(gsjs, /"points_capacity"\s*:\s*"20"/);
    assert.match(gsjs, /"can_repair"\s*:\s*"0"/);
    assert.match(gsjs, /pc\.feats_increment\('tottlys_toys', 1\)/);
    // A page declared multiplayer before any module loads: its own process.
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', `
      globalThis.GRODDLE_MODE = 'multiplayer';
      const { TOOL_CONDITION_CATALOG: c, createToolConditionState, getToolCondition, useCharge } = await import(${JSON.stringify(new URL('../public/js/tools.js', import.meta.url).href)});
      const s = createToolConditionState();
      const before = getToolCondition(s, 'random_kindness').remaining;
      console.log(JSON.stringify({ capacity: c.random_kindness.capacity, charges: c.random_kindness.charges, repairable: c.random_kindness.repairable, before }));
    `], { encoding: 'utf8' });
    assert.deepEqual(JSON.parse(out), { capacity: 20, charges: true, repairable: false, before: 20 });
    const feature = read('public/js/features/player-verbs-mp-feature.js');
    const at = feature.indexOf('function bestowed(m, p)');
    const body = feature.slice(at, feature.indexOf('function onLanded', at));
    assert.match(body, /copyFromLedger\(engine, RANDOM_KINDNESS, copy, use\)/);
    assert.match(body, /spendCopyCharge\(engine, RANDOM_KINDNESS, copy\)/);
    assert.match(body, /featsIncrement\?\.\(FEAT_ID, 1\)/);
    assert.match(body, /'ledgerReceipt'/, 'an emptied one leaves once');
  });
});

describe('G432 the site keeps the points', { skip: skipWithoutSite }, () => {
  it('LedgerUse knows 20 points of it', () => {
    assert.match(readFileSync(join(SITE_DIR, 'src/LedgerUse.php'), 'utf8'), /'random_kindness' => \[20, 'player-verbs-mp', 'kindness'\]/);
  });
});
