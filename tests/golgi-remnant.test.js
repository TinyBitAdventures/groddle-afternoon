/**
 * G352 golgi_apparatus: never held (items/golgi_apparatus.js: not_selectable,
 * no verbs). It is the remnant a Dust Trap shows for 3 s (dust_trap.js
 * organelleOverlay, inc_data_overlays.js:68) and Baqalic Caesura's
 * requirement icon; finding one counts organelles_found (quests_inc_counter).
 * Run: node --test tests/golgi-remnant.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { DUST_TRAP_ORGANELLES, ORGANELLE_OVERLAY, createResourceNode, harvestResourceNode } from '../public/js/resource-nodes.js?v=g403-1';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=g403-1';
import { createQuestState } from '../public/js/quests.js';
import { acceptOffer, isEventEmitted, routeQuestEvent } from '../public/js/quest-offers.js?v=g403-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS');
await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
const NOW = Date.UTC(2026, 9, 27, 12);
const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };

describe('golgi apparatus: the Dust Trap remnant', () => {
  it('rolls at 7% (0.23 to 0.30) for +40 s, with its overlay for 3 s at 153 px above the trap', () => {
    const golgi = DUST_TRAP_ORGANELLES.find((o) => o.id === 'golgi_apparatus');
    assert.deepEqual([golgi.upTo, golgi.seconds], [0.30, 40]);
    assert.equal(ORGANELLE_OVERLAY.durationMs, 3000);
    assert.equal(ORGANELLE_OVERLAY.deltaY, -153);
    const art = ORGANELLE_OVERLAY.art.golgi_apparatus;
    assert.ok(existsSync(join(root, 'public', art.url)), art.url);
    const file = join(GSJS, 'items/dust_trap.js');
    if (!existsSync(file)) return;
    const src = readFileSync(file, 'utf8');
    assert.match(src, /else if\(check <= 0\.30\) \{\s*\/\/ golgi apparatus/);
    assert.match(src, /duration: 3000,[\s\S]*?delta_y:-153,/);
    assert.match(src, /this\.pc\.quests_inc_counter\('organelles_found',1\);\s*this\.organelleOverlay\('golgi_apparatus', 40\);/);
    assert.match(readFileSync(join(GSJS, 'items/golgi_apparatus.js'), 'utf8'), /not_selectable\s*: true/);
  });

  it('a trap that shows the golgi apparatus counts toward Baqalic Caesura', () => {
    const node = createResourceNode('dust_trap', { now: NOW - 60000 });
    const res = harvestResourceNode(node, {}, {}, { now: NOW, dayKey: 'd', rng: seq(0.25) });
    assert.equal(res.ok, true);
    assert.equal(res.organelle, 'golgi_apparatus');
    assert.equal(res.baqalaSeconds, 40);
    assert.match(res.message, /^You found a piece of the golgi apparatus, a remnant from your Glitchian ancestors\. Your time has increased by 40 seconds!$/);
    assert.ok(res.achievementCounters.some((c) => c.counter === 'dust_trap:organelle' && c.amount === 1));
    // A drop-table trap is no remnant.
    const drop = harvestResourceNode(createResourceNode('dust_trap', { now: NOW - 60000 }), {}, {}, { now: NOW, dayKey: 'd', rng: seq(0.5, 0) });
    assert.ok(!drop.achievementCounters.some((c) => c.counter === 'dust_trap:organelle'));
    assert.equal(isEventEmitted('dust_trap:organelle'), true);

    const qs = createQuestState();
    assert.equal(acceptOffer(qs, 'baqala_nostalgia', { now: NOW }).ok, true);
    for (let i = 0; i < 3; i += 1) routeQuestEvent(qs, 'dust_trap:organelle', 1, { managedOnly: true });
    assert.equal(qs.active.baqala_nostalgia.progress.organelles_found, 3);
  });
});
