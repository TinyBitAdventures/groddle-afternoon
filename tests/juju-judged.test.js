/**
 * Lane juju: the Black Juju, its two buffs (Bad Mood, Real Bummer), Manor
 * Mystery and the Bundle of Joy, judged from the source rather than built.
 *
 * - quests/manor_mystery.js is never offered (no quests_offer, no
 *   setAvailableQuests) and can never finish: nothing archived sets
 *   mmquest_flag3, the Basement's `complete` event sets a plain player
 *   property instead of quests_set_flag, and its end NPC (npc_juju_black) has
 *   no turn-in verb and no placement. build-quests.mjs EXCLUDEs it
 *   (unreachable_in_source), so the Magic Rock no longer offers a dead end.
 * - bad_mood / real_bummer: only juju_base NPCs bumping you apply them; the
 *   gang is retired and the Black Juju unbuilt (tools/inventory/overrides.json).
 * - npc_bundle_of_joy: only the Dusty Stick's unleash makes one, and the
 *   stick is an excluded staff gift (G125).
 *
 * The source checks read ../glitch-GameServerJS and skip when it is absent
 * (a clean worktree has no sibling checkout).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadContentCatalogsFromDir, resetContentCatalogs, getQuestCatalog } from '../public/js/content-catalogs.js?v=10b118dd';
import { classifyQuests, questOfferIndex, pendingQuestOffers, npcQuestOffers } from '../public/js/quest-offers.js?v=6b6cbf22';
import { createQuestState } from '../public/js/quests.js?v=282e1621';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'public/assets/content');
const GSJS = join(ROOT, '../glitch-GameServerJS');
const STREETS = join(ROOT, '../streets/mnt/stos/location_data');
const OVERRIDES = JSON.parse(readFileSync(join(ROOT, 'tools/inventory/overrides.json'), 'utf8'));
const haveGsjs = existsSync(join(GSJS, 'quests/manor_mystery.js'));
const haveStreets = existsSync(join(STREETS, 'LA9EBPF8M2031HB.xml'));
const gsjs = (rel) => readFileSync(join(GSJS, rel), 'utf8');

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(CONTENT);
});

describe('Manor Mystery is judged, not offered', () => {
  it('quests.json carries it as unreachable_in_source with its source text intact', () => {
    const def = getQuestCatalog().manor_mystery;
    assert.ok(def, 'still in the catalog for phase 2');
    assert.equal(def.solo, false);
    assert.equal(def.soloReason, 'unreachable_in_source');
    assert.deepEqual(def.endNpcs, ['npc_juju_black']);
    assert.equal(def.acceptLabel, "I'm brave!");
    assert.deepEqual(def.rewards, { xp: 10 });
  });

  it('is excluded by classifyQuests and absent from the offer index', () => {
    const c = classifyQuests();
    assert.ok(c.byReason.unreachable_in_source.includes('manor_mystery'));
    assert.ok(!c.solo.some((row) => row.classTsid === 'manor_mystery'));
    assert.ok(!questOfferIndex().some((row) => row.classTsid === 'manor_mystery'));
  });

  it('the Magic Rock never offers it on Hauki Seeks, and no NPC does', () => {
    const state = createQuestState();
    const pc = { energy: 50, mood: 50, imagination: 0, xp: 0, currants: 0, giantFavor: {} };
    for (const ctx of [
      { street: 'Hauki Seeks', streetTsid: 'GHV36AG0LO2208L', level: 20 },
      { street: 'Abandoned Hauki Seeks Manor', streetTsid: 'GA9H1V6OGRU2FSB', level: 20 },
    ]) {
      assert.ok(!pendingQuestOffers(state, pc, ctx).some((row) => row.classTsid === 'manor_mystery'), ctx.street);
    }
    assert.ok(!npcQuestOffers(state, 'npc_juju_black', pc, {}).offered.some((o) => o.classTsid === 'manor_mystery'));
  });
});

describe('inventory judgements (tools/inventory/overrides.json)', () => {
  const want = {
    'quest:manor_mystery': 'unbuilt_original',
    'npc:npc_juju_black': 'unbuilt_original',
    'item:note_manor_mystery': 'unbuilt_original',
    'npc:npc_bundle_of_joy': 'excluded',
    'buff:bad_mood': 'excluded',
    'buff:real_bummer': 'excluded',
  };
  for (const [key, status] of Object.entries(want)) {
    it(`${key} is ${status} with a cited reason and register row`, () => {
      const o = OVERRIDES[key];
      assert.ok(o, key);
      assert.equal(o.status, status);
      assert.match(o.register, /^G\d+$/);
      assert.match(o.reason, /\.js|\.xml/, 'cites a source file');
      assert.ok(!/—/.test(o.reason), 'no em-dashes');
    });
  }
  it('the Bundle of Joy follows the Dusty Stick it comes from', () => {
    assert.equal(OVERRIDES['item:dusty_stick']?.status, 'excluded');
  });
});

describe('the source facts behind the judgements', { skip: !haveGsjs && 'no ../glitch-GameServerJS checkout' }, () => {
  const sourceFiles = () => {
    const out = [];
    for (const dir of ['items', 'items/include', 'players', 'locations', 'quests', 'achievements']) {
      const abs = join(GSJS, dir);
      if (!existsSync(abs)) continue;
      for (const f of readdirSync(abs)) if (f.endsWith('.js')) out.push(join(dir, f));
    }
    return out;
  };

  it('nothing offers manor_mystery or creates a Black Juju', () => {
    const offers = [];
    const spawns = [];
    for (const rel of sourceFiles()) {
      const text = gsjs(rel);
      if (/quests_offer(_queue)?\(\s*['"]manor_mystery/.test(text) || /setAvailableQuests\([^)]*manor_mystery/.test(text)) offers.push(rel);
      if (/createItem\w*\(\s*['"]npc_juju_black/.test(text)) spawns.push(rel);
    }
    assert.deepEqual(offers, []);
    assert.deepEqual(spawns, []);
  });

  it('the Black Juju has no talk_to: only debug and give_cubimal', () => {
    const verbs = [...gsjs('items/npc_juju_black.js').matchAll(/^verbs\.(\w+) = \{/gm)].map((m) => m[1]);
    assert.deepEqual(verbs.sort(), ['debug', 'give_cubimal']);
  });

  it('its bump is a coin flip between the two buffs, never stacking (npc_juju_black.js:219-235)', () => {
    const text = gsjs('items/npc_juju_black.js');
    assert.match(text, /if \(pc\.buffs_has\('real_bummer'\) \|\| pc\.buffs_has\('bad_mood'\)\) return;/);
    assert.match(text, /if \(is_chance\(0\.5\)\)\{\s*pc\.buffs_apply\('real_bummer'\);\s*\}\s*else\{\s*pc\.buffs_apply\('bad_mood'\);/);
    const buffs = gsjs('items/catalog_buffs.js');
    assert.match(buffs, /"bad_mood" : \{\s*name\s*: "Bad Mood",\s*desc\s*: "Keeps your mood down low",\s*duration\s*: 60,/);
    assert.match(buffs, /"real_bummer" : \{\s*name\s*: "Real Bummer",\s*desc\s*: "Keeps your mood down real low",\s*duration\s*: 180,/);
  });

  it('only the Dusty Stick unleash creates a Bundle of Joy', () => {
    const makers = sourceFiles().filter((rel) => /createItem\w*\(\s*['"]npc_bundle_of_joy/.test(gsjs(rel)));
    assert.deepEqual(makers, ['items/dusty_stick.js']);
    assert.match(gsjs('items/npc_bundle_of_joy.js'), /this\.apiSetTimer\('onDie', 20000\);/);
  });

  it('the Manor flags never reach the quest requirement', { skip: !haveStreets && 'no street dumps' }, () => {
    const basement = readFileSync(join(STREETS, 'LA9EBPF8M2031HB.xml'), 'utf8');
    assert.match(basement, /pc\.quest_manor_mystery_done = true;/);
    assert.ok(!/quests_set_flag/.test(basement));
    const setters = readdirSync(STREETS).filter((f) => f.endsWith('.xml'))
      .filter((f) => /mmquest_flag3\s*=\s*true/.test(readFileSync(join(STREETS, f), 'utf8')));
    assert.deepEqual(setters, []);
  });
});
