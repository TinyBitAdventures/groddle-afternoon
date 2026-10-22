/**
 * Original GSJS achievement event routing and gameplay-video badge acceptance.
 * Run: node --test tests/achievement-events.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  achievementCounter,
  achievementConditionLabel,
  worldVerbAchievementCounter,
  worldVerbAchievementCounters,
  makingToolAchievementCounter,
  createAchievementState,
  seedAchievementNearCompletion,
  applyAchievementProgress,
} from '../public/js/achievements.js?v=badge-events-1';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js';
import { normalizeAchievementSnapshot } from '../public/js/player-save.js?v=badge-events-1';

const here = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(here, '../public');

before(async () => {
  await loadContentCatalogsFromDir(join(publicRoot, 'assets/content'));
});

describe('canonical GSJS achievement events', () => {
  it('turns mined condition ids into player-facing labels', () => {
    assert.equal(
      achievementConditionLabel({
        name: 'musicblock_d_green_01',
        desc: 'musicblock_d_green_01',
      }),
      'Musicblock DG-1'
    );
    assert.equal(
      achievementConditionLabel({ name: 'trant_bubble', desc: 'trant_bubble' }),
      'Bubble'
    );
    assert.equal(
      achievementConditionLabel({ name: 'awesome_pot', desc: 'awesome_pot' }, 'Awesome Pot'),
      'Awesome Pot'
    );
  });

  it('routes animal, trant-care, and Making verbs to exact group:label counters', () => {
    assert.equal(achievementCounter('npc_piggy', 'pet'), 'npc_piggy:pet');
    assert.equal(worldVerbAchievementCounter('npc_piggy', 'pet'), 'npc_piggy:pet');
    assert.equal(worldVerbAchievementCounter('npc_piggy', 'nibble'), 'npc_piggy:nibble');
    assert.equal(worldVerbAchievementCounter('npc_butterfly', 'massage'), 'npc_butterfly:massage');
    assert.equal(worldVerbAchievementCounter('trant_bean', 'pet'), 'trants_petted:trant_bean');
    assert.equal(worldVerbAchievementCounter('trant_bean', 'water'), 'trants_watered:trant_bean');
    assert.equal(worldVerbAchievementCounter('trant_bean', 'harvest'), 'trants_harvested:trant_bean');
    assert.deepEqual(
      worldVerbAchievementCounters('trant_bean', 'harvest', {
        fruitClass: 'bean_plain',
        baseAmount: 12,
        superAmount: 36,
      }),
      [
        { counter: 'trants_harvested:trant_bean', amount: 1 },
        { counter: 'trants_fruit_harvested:bean_plain', amount: 12 },
      ]
    );
    assert.equal(makingToolAchievementCounter('fruit_changing_machine'), 'making_tool:fruit_changing_machine');
  });

  it('unlocks all three badge moments shown in the gameplay video on the matching final action', () => {
    const cases = [
      ['betterthanlousy_douser', 'trants_watered:trant_bean', 'grendaline', 300, 40],
      ['notquitepro_bean_tree_fondler', 'trants_petted:trant_bean', 'grendaline', 300, 40],
      ['novice_fruit_metamorphosizer', 'making_tool:fruit_changing_machine', 'spriggan', 200, 25],
    ];
    for (const [id, counter, giant, xp, favor] of cases) {
      const state = createAchievementState();
      const pc = { imagination: 0, xp: 0, giantFavor: {} };
      const seeded = seedAchievementNearCompletion(state, id, 1);
      assert.equal(seeded.ok, true, id);
      const updates = applyAchievementProgress(state, counter, 1, pc);
      assert.ok(state.unlocked.includes(id), id);
      assert.equal(updates.find((row) => row.classTsid === id)?.unlocked, true, id);
      assert.equal(pc.xp, xp, id);
      assert.equal(pc.imagination, xp, id);
      assert.equal(pc.giantFavor[giant], favor, id);
    }
  });

  it('keeps progression tiered and persists partial and unlocked badge state', () => {
    const state = createAchievementState();
    seedAchievementNearCompletion(state, 'pork_fondler', 2);
    applyAchievementProgress(state, 'npc_piggy:pet', 1, { xp: 0, imagination: 0 });
    assert.equal(state.unlocked.includes('pork_fondler'), false);
    const partial = normalizeAchievementSnapshot(state);
    assert.equal(partial.progress.pork_fondler.progress.pet, 10);
    applyAchievementProgress(state, 'npc_piggy:pet', 1, { xp: 0, imagination: 0 });
    const unlocked = normalizeAchievementSnapshot(state);
    assert.ok(unlocked.unlocked.includes('pork_fondler'));
    assert.equal(unlocked.progress.pork_fondler, undefined);
  });

  it('unlocks fruit-count badges from the base yield, excluding super bonus fruit', () => {
    const state = createAchievementState();
    const pc = { imagination: 0, xp: 0, giantFavor: {} };
    seedAchievementNearCompletion(state, 'entrylevel_fruit_tree_harvester', 3);
    const events = worldVerbAchievementCounters('trant_fruit', 'harvest', {
      fruitClass: 'cherry',
      baseAmount: 3,
      superAmount: 9,
    });
    for (const event of events) {
      applyAchievementProgress(state, event.counter, event.amount, pc);
    }
    assert.ok(state.unlocked.includes('entrylevel_fruit_tree_harvester'));
    assert.equal(pc.xp, 100);
    assert.equal(pc.giantFavor.spriggan, 15);
  });
});

describe('video badge client integration', () => {
  it('ships original 180px badge art for the three recorded award screens', () => {
    const iconMap = JSON.parse(readFileSync(join(publicRoot, 'assets/content/badge-icons.json'), 'utf8'));
    for (const id of [
      'betterthanlousy_douser',
      'notquitepro_bean_tree_fondler',
      'novice_fruit_metamorphosizer',
      'pork_fondler',
    ]) {
      const relative = iconMap[id];
      assert.ok(relative, `${id} mapped`);
      const path = join(publicRoot, relative);
      assert.ok(existsSync(path), `${id} file`);
      const png = readFileSync(path);
      assert.equal(png.readUInt32BE(16), 180, `${id} width`);
      assert.equal(png.readUInt32BE(20), 180, `${id} height`);
    }
  });

  it('uses recovered official art for the visible musicblock catalog and an honest neutral fallback', () => {
    const iconMap = JSON.parse(readFileSync(join(publicRoot, 'assets/content/badge-icons.json'), 'utf8'));
    assert.ok(Object.keys(iconMap).length >= 75, 'substantial recovered badge set');
    for (const id of [
      'collection_musicblocks_bb',
      'collection_musicblocks_db',
      'collection_musicblocks_dg',
      'collection_musicblocks_dr',
      'collection_musicblocks_xs',
      'novice_precipitator',
    ]) {
      const relative = iconMap[id];
      assert.ok(relative, `${id} mapped`);
      const png = readFileSync(join(publicRoot, relative));
      assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${id} PNG`);
      assert.ok([60, 180].includes(png.readUInt32BE(16)), `${id} source width`);
      assert.equal(png.readUInt32BE(16), png.readUInt32BE(20), `${id} square`);
    }

    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const style = readFileSync(join(publicRoot, 'style.css'), 'utf8');
    assert.match(game, /achievementBadgeFallback/);
    assert.match(game, /neutral-unrecovered/);
    assert.doesNotMatch(
      game.slice(game.indexOf('function renderAchievePanel'), game.indexOf('function openAchievePanel')),
      /icons\/apple\.png/
    );
    assert.match(style, /\.badge-card \.badge-art-missing/);
  });

  it('ships a searchable, filtered, incrementally rendered full badge catalog', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const html = readFileSync(join(publicRoot, 'play/index.html'), 'utf8');
    const style = readFileSync(join(publicRoot, 'style.css'), 'utf8');
    assert.match(html, /id="achieve-search"/);
    assert.match(html, /data-achieve-status="progress"/);
    assert.match(html, /id="achieve-category"/);
    assert.match(game, /browseAchievementLog\(achieveState, achievementBrowser\)/);
    assert.match(game, /ACHIEVEMENT_PAGE_SIZE\s*=\s*40/);
    assert.match(game, /badge-load-more/);
    assert.match(game, /Secret Achievement/);
    assert.match(game, /badgeRendered/);
    assert.match(game, /function resetAchievementBrowserPage/);
    assert.match(game, /scroller\.scrollTop\s*=\s*0/);
    assert.match(style, /\.badge-browser-tools/);
    assert.match(style, /\.badge-status-filters button\.active/);
  });

  it('wires canonical events, original status prose, Giant rewards, QA state, and cache busting', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const html = readFileSync(join(publicRoot, 'play/index.html'), 'utf8');
    assert.match(game, /worldVerbAchievementCounters\(target\.classId, verbId, result\)/);
    assert.match(game, /makingToolAchievementCounter\(record\.recipe\.tool\)/);
    assert.match(game, /update\.def\.statusText[\s\S]*update\.def\.desc/);
    assert.match(game, /rewards\.favor\?\.points/);
    assert.match(game, /achievementdemo/);
    assert.match(game, /achievementUnlocked/);
    assert.match(game, /badge-icons\.json\?v=catalog-art-3/);
    assert.match(game, /screen-fx\.js\?v=quest-pages-2/);
    assert.match(html, /game\.js\?v=official-ecology-1/);
    assert.match(html, /badges=catalog-art-3/);
    assert.match(game, /muted:\s*true/);
  });
});
