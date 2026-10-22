/**
 * Overworld Juju Bandits (js/juju-bandits.js, features/juju-bandits-feature.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DUST_TRAP_LOOT,
  JUJU_BANDIT,
  JUJU_SHEETS,
  JUJU_TEXT,
  SAVANNA_HUBS,
  jujuAnchor,
  jujuCurse,
  jujuLine,
  jujuSheetUrl,
  jujuSpawnX,
  jujuWants,
  nearSignpost,
  redeclareDelay,
  stealChanceForSeconds,
  withinReach,
} from '../public/js/juju-bandits.js';
import { DROP_TABLES } from '../public/js/drop-tables.js';
import { REMAKE_QUEST_NPCS } from '../public/js/quest-offers.js';
import { OFFER_OVERRIDES } from '../public/js/quest-rooms/catalog.js';
import { FEATURES } from '../public/js/features/index.js';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const gsjs = join(spike, '../glitch-GameServerJS');

describe('juju bandit rules (npc_juju_bandit.js, juju_bandit_curse, dust_trap.js)', () => {
  it('keep the source numbers', () => {
    assert.deepEqual(SAVANNA_HUBS, ['86', '90', '91', '95']);
    assert.equal(JUJU_BANDIT.offerQuestChance, 0.5);
    assert.equal(JUJU_BANDIT.curseDelayMs, 1000);
    assert.equal(JUJU_BANDIT.spawnOffset, 250);
    assert.equal(JUJU_BANDIT.walkSpeed, 75);
    assert.equal(JUJU_BANDIT.alertMs, 500);
    assert.equal(JUJU_BANDIT.declareMs, 1500);
    assert.equal(JUJU_BANDIT.followAfterDeclareMs, 3000);
    assert.equal(JUJU_BANDIT.reach, 50);
    assert.equal(JUJU_BANDIT.signpostFear, 200);
    assert.equal(JUJU_BANDIT.rageQuitMs, 2500);
    assert.equal(JUJU_BANDIT.shrinkMs, 1500);
    assert.deepEqual(JUJU_BANDIT.variants, ['red', 'green', 'yellow']);
    assert.deepEqual(JUJU_BANDIT.bandanas, ['blue', 'black', 'red']);
    assert.ok(redeclareDelay(0) === 15000 && redeclareDelay(0.999) < 20000);
  });

  it('match the GSJS files', { skip: !existsSync(gsjs) && 'GSJS checkout not beside this worktree' }, () => {
    const npc = readFileSync(join(gsjs, 'items/npc_juju_bandit.js'), 'utf8');
    for (const line of [...JUJU_TEXT.offerLines, ...JUJU_TEXT.stealLines]) {
      const parts = line.replace(/\{(pc|item|plural|name)\}/g, '|').split('|').map((x) => x.trim()).filter((x) => x.length > 3);
      for (const part of parts) assert.ok(npc.includes(part), `${line}: ${part}`);
    }
    assert.ok(npc.includes(JUJU_TEXT.rageQuit));
    assert.ok(npc.includes(JUJU_TEXT.gotIt));
    assert.match(npc, /Math\.abs\(this\.pc\.x - signpost\.signpost_x\) < 200/);
    assert.match(npc, /this\.npc_walk_speed = 75;/);
    const trap = readFileSync(join(gsjs, 'items/dust_trap.js'), 'utf8');
    assert.match(trap, /offer_quest\) \{\s*chance = 0\.5;/);
    assert.match(trap, /apiSetTimer\('juju_bandit_curse',1000\)/);
  });

  it('come only in the Savanna, for something from the Dust Trap table, one at a time', () => {
    const inv = { paper: 3 };
    assert.equal(jujuCurse({ hubId: '56', inv, questStatus: 'none', roll: 0 }).reason, 'not_savanna');
    assert.equal(jujuCurse({ hubId: '86', inv: {}, questStatus: 'none', roll: 0 }).reason, 'nothing_to_take');
    assert.equal(jujuCurse({ hubId: '86', inv, questStatus: 'none', roll: 0, pursued: true }).reason, 'pursued');
    assert.equal(jujuCurse({ hubId: '86', inv, questStatus: 'none', roll: 0.49 }).ok, true);
    assert.equal(jujuCurse({ hubId: '86', inv, questStatus: 'none', roll: 0.5 }).reason, 'roll');
    const hit = jujuCurse({ hubId: '95', inv, questStatus: 'none', roll: 0.1 });
    assert.deepEqual([hit.mode, hit.itemClass], ['offer', 'paper']);
    // Once the quest is taken the chance comes from the Nostalgia timer (not wired: 0).
    assert.equal(jujuCurse({ hubId: '86', inv, questStatus: 'active', roll: 0 }).reason, 'roll');
    assert.equal(jujuCurse({ hubId: '86', inv, questStatus: 'active', roll: 0, stealChance: 1 }).mode, 'steal');
  });

  it('keep the source steal-chance curve for the Nostalgia decision', () => {
    assert.deepEqual([0, 179, 180, 240, 300, 360, 420, 480, 539, 540, 5000].map(stealChanceForSeconds),
      [0, 0, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.35, 1, 1]);
  });

  it('want exactly the dust_trap drop table items, with their GSJS names', () => {
    const ids = new Set();
    const walk = (id) => {
      for (const [, rows] of DROP_TABLES[id].rows) for (const r of rows) {
        if (r.item) ids.add(r.item);
        if (r.table) walk(r.table);
      }
    };
    walk('dust_trap');
    assert.deepEqual([...ids].sort(), Object.keys(DUST_TRAP_LOOT).sort());
    assert.deepEqual(jujuWants({ paper: 1, apple: 4, gem_ruby: 0 }), ['paper']);
    assert.equal(jujuLine(JUJU_TEXT.stolen, 'friend', 'gem_ruby'), 'Oh no! The Juju Bandit has stolen one of your Modestly Sized Rubies.');
    assert.equal(jujuLine(JUJU_TEXT.stealLines[0], 'friend', 'awesome_stew'), "Friend! I know you have an Awesome Stew and I'm coming to get it!");
    assert.equal(jujuLine(JUJU_TEXT.offerLines[1], 'friend'), 'We need your help, friend!');
  });

  it('appear 250 px to a side, flipped at the street edge', () => {
    assert.equal(jujuSpawnX(1000, 3000, 0.1), 1250);
    assert.equal(jujuSpawnX(1000, 3000, 0.9), 750);
    assert.equal(jujuSpawnX(2900, 3000, 0.1), 2650);
    assert.equal(jujuSpawnX(100, 3000, 0.9), 350);
  });

  it('fear signposts and reach 50 x 50', () => {
    assert.equal(nearSignpost(100, 900, [{ x: 299, y: 1000 }]), true);
    assert.equal(nearSignpost(100, 900, [{ x: 300, y: 1000 }]), false);
    assert.equal(withinReach({ x: 0, y: 0 }, { x: 50, y: -50 }), true);
    assert.equal(withinReach({ x: 0, y: 0 }, { x: 51, y: 0 }), false);
  });

  it('use the OGA sheets, cropped with the feet kept, all on disk', () => {
    for (const v of JUJU_BANDIT.variants) for (const b of JUJU_BANDIT.bandanas) for (const s of Object.keys(JUJU_SHEETS)) {
      assert.ok(existsSync(join(spike, 'public', jujuSheetUrl(v, b, s))), jujuSheetUrl(v, b, s));
    }
    const a = jujuAnchor('walk');
    assert.ok(Math.abs(99 + a.x * 95 - 148) < 1e-9 && Math.abs(86 + a.y * 102 - 185) < 1e-9);
  });

  it('offer Carry That Weight in place of the Magic Rock', () => {
    assert.ok(REMAKE_QUEST_NPCS.includes('npc_juju_bandit'));
    assert.deepEqual(OFFER_OVERRIDES.help_juju_bandits.offerTriggers, [{ type: 'npc', npc: 'npc_juju_bandit' }]);
    const quests = JSON.parse(readFileSync(join(spike, 'public/assets/content/quests.json'), 'utf8'));
    assert.deepEqual(quests.help_juju_bandits.offerTriggers.map((t) => [t.type, t.npc]), [['npc', 'npc_juju_bandit']]);
    assert.equal(quests.help_juju_bandits.solo, true);
    assert.ok(FEATURES.some((f) => f.id === 'juju-bandits'));
  });
});
