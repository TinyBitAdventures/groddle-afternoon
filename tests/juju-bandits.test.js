/**
 * Overworld Juju Bandits (js/juju-bandits.js, features/juju-bandits-feature.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANCESTRAL_CLOCK,
  DUST_TRAP_LOOT,
  JUJU_BANDIT,
  JUJU_SHEETS,
  JUJU_TEXT,
  SAVANNA_HUBS,
  ancestralClock,
  ancestralEnter,
  ancestralLeave,
  ancestralSeconds,
  ancestralTick,
  jujuAnchor,
  jujuCurse,
  jujuLine,
  jujuSheetUrl,
  jujuSpawnX,
  jujuSpawnPoint,
  jujuCanReach,
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
import { remakeStatus } from '../public/js/imagination-remake.js';

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
    // Once the quest is taken the chance comes from the Ancestral Lands clock (stealChance).
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

  it('never appear on a ledge they cannot walk down from', () => {
    // Player's floor y 900 over x 0-1100; a ledge y 644 over 1150-1400 with a gap before it.
    const floors = [{ l: 0, r: 1100, y: 900 }, { l: 1150, r: 1400, y: 644 }];
    const at = (x) => floors.filter((f) => x >= f.l && x <= f.r);
    const ground = (x, y, rise) => {
      const here = at(x);
      if (!here.length) return null;
      const below = here.filter((f) => f.y >= y - rise).sort((a, b) => a.y - b.y)[0];
      return (below || here.sort((a, b) => b.y - a.y)[0]).y;
    };
    const opts = {
      sideRoll: 0.1, // the source picks the right side (the ledge)
      spawnFloor: (x) => at(x).find((f) => Math.abs(f.y - 900) <= 160)?.y ?? ground(x, 100, 0),
      groundAhead: (x, y) => ground(x, y, 30),
      stepUp: 30,
    };
    const player = { x: 1000, y: 900 };
    assert.equal(jujuCanReach({ x: 1250, y: 644 }, player, opts.groundAhead, 30), false);
    assert.deepEqual(jujuSpawnPoint(player, 3000, opts), { x: 750, y: 900 });
    // With the left side off the street too, it comes closer on the player's floor.
    assert.deepEqual(jujuSpawnPoint({ x: 1000, y: 900 }, 3000, { ...opts, spawnFloor: (x) => (x < 1000 ? null : opts.spawnFloor(x)) }), { x: 1100, y: 900 });
    // A walk that drops off an edge onto the player's floor is fine.
    assert.equal(jujuCanReach({ x: 1250, y: 644 }, { x: 1300, y: 644 }, opts.groundAhead, 30), true);
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

describe('the Ancestral Lands clock (baqala_times, G39: no kick)', () => {
  const MIN = 60 * 1000;

  it('counts only inside, capped per frame, and starts fresh with nothing banked', () => {
    const c = ancestralEnter(ancestralClock(), 0);
    assert.deepEqual([c.spent, c.inside, c.exitAt], [0, true, null]);
    ancestralTick(c, 500);
    ancestralTick(c, 5 * MIN); // a hidden tab's gap counts one capped frame
    assert.equal(ancestralSeconds(c), 0.5 + ANCESTRAL_CLOCK.maxTickMs / 1000);
    ancestralLeave(c, 10_000);
    ancestralTick(c, 1000);
    assert.equal(ancestralSeconds(c), 1.5, 'nothing counts outside');
  });

  it('loses half the time away on re-entry, floored at 0', () => {
    const c = ancestralClock({ spent: 300, inside: true });
    ancestralLeave(c, 1 * MIN);
    assert.deepEqual([c.inside, c.exitAt, c.loggedOut], [false, 1 * MIN, false]);
    ancestralEnter(c, 3 * MIN); // 2 min away: -60 s
    assert.equal(c.spent, 240);
    assert.equal(c.exitAt, null);
    ancestralLeave(c, 3 * MIN);
    ancestralEnter(c, 30 * MIN);
    assert.equal(c.spent, 0);
  });

  it('clamps 600 s or more to 585 s on entry (the grace period) and never kicks', () => {
    const c = ancestralEnter(ancestralClock(), 0);
    for (let i = 0; i < 1200; i++) ancestralTick(c, 1000);
    assert.equal(ancestralSeconds(c), 1200, 'no 10-minute limit: still inside, still counting');
    assert.equal(c.inside, true);
    ancestralLeave(c, 0);
    ancestralEnter(c, 2000); // -1 s, still over 600
    assert.equal(c.spent, ANCESTRAL_CLOCK.graceTo);
  });

  it('survives a logout without decay', () => {
    const c = ancestralClock({ spent: 400, inside: true });
    ancestralLeave(c, 0, true);
    ancestralEnter(c, 60 * MIN);
    assert.equal(c.spent, 400);
    assert.equal(c.loggedOut, true, 'logged_out stays until the next leave');
    ancestralLeave(c, 60 * MIN, false);
    assert.equal(c.loggedOut, false);
  });

  it('copies inc_special_locations.js and savanna.js', { skip: !existsSync(gsjs) && 'GSJS checkout not beside this worktree' }, () => {
    const loc = readFileSync(join(gsjs, 'players/inc_special_locations.js'), 'utf8');
    assert.match(loc, /time_spent -= \(time\(\) - this\.baqala_times\.exit_time\) \/ 2\.0;/);
    assert.match(loc, /time_spent >= 600\) \{\s*this\.baqala_times\.time_spent = 585;/);
    assert.match(loc, /return this\.baqala_times \? \(this\.baqala_times\.time_spent \+ time\(\) - this\.baqala_times\.entry_time\) : 0;/);
    const trap = readFileSync(join(gsjs, 'items/dust_trap.js'), 'utf8');
    assert.match(trap, /var buff_time = this\.pc\.get_baqala_buff_time\(\);/);
    // The cards only lengthen the buff (players/inc_imagination.js), not the clock.
    const img = readFileSync(join(gsjs, 'players/inc_imagination.js'), 'utf8');
    assert.match(img, /ancestral_lands_time\/\.exec\(class_tsid\) && this\.buffs_has\("ancestral_nostalgia"\)\) \{\s*this\.buffs_extend_time\("ancestral_nostalgia", 60\);/);
  });

  it('leaves the Prepared For Ancestral Nostalgia cards for later (no 10-minute limit)', () => {
    for (const id of ['ancestral_lands_time_1', 'ancestral_lands_time_2']) {
      assert.equal(remakeStatus(id).status, 'later');
      assert.match(remakeStatus(id).note, /no 10-minute limit by design \(G39\)/);
    }
  });
});

describe('the Juju feature on the clock', () => {
  const feature = FEATURES.find((f) => f.id === 'juju-bandits');
  const street = (hubId) => ({ hubId, platforms: [], bounds: { l: 0, r: 3000, t: -1000, b: 0 } });
  const savanna = street('86');
  const meadow = street('56');
  const makeEngine = (params = {}) => {
    const data = {};
    return {
      data,
      street: savanna,
      inv: {},
      player: { x: 500, y: 0 },
      questState: { active: { help_juju_bandits: {} }, completed: [] },
      param: (k) => (k in params ? String(params[k]) : null),
      setData: (k, v) => { data[k] = String(v); },
      achievement() {},
      save() {},
      refreshPack() {},
    };
  };
  const enter = (engine, street) => {
    engine.street = street;
    feature.onStreetClear(engine);
    feature.onStreetEnter(street, engine);
  };
  /** A Dust Trap pays out; the curse runs 1 s later. */
  const trap = (engine) => {
    feature.onEvent('dust_trap:trigger', 1, engine);
    feature.onTick(16, Date.now() + JUJU_BANDIT.curseDelayMs + 1, engine);
    return feature._state().last;
  };

  it('rolls the source curve once the quest is taken, from the clock', () => {
    feature.restore(undefined);
    const engine = makeEngine({ jujuroll: 0.99 });
    enter(engine, savanna);
    assert.equal(engine.data.jujuAncestralSeconds, '0');
    assert.equal(engine.data.jujuStealChance, '0');
    assert.equal(trap(engine), 'no-juju:roll');
    feature.restore({ ancestral: { spent: 9 * 60 } });
    enter(engine, savanna);
    assert.equal(feature._state().stealChance, 1);
    // Past the roll: the empty pack is what stops it now (no 10-minute kick either).
    assert.equal(trap(engine), 'no-juju:nothing_to_take');
  });

  it('keeps the 0.5 offer roll while Carry That Weight is new', () => {
    feature.restore(undefined);
    const engine = makeEngine({ jujuroll: 0.49 });
    engine.questState = { completed: [] };
    enter(engine, savanna);
    assert.equal(trap(engine), 'no-juju:nothing_to_take');
  });

  it('presets with &jujutime, publishes data, and banks across streets and reloads', () => {
    feature.restore(undefined);
    const engine = makeEngine({ jujutime: 200 });
    enter(engine, savanna);
    assert.equal(engine.data.jujuAncestralSeconds, '200');
    assert.equal(engine.data.jujuStealChance, '0.1');
    assert.equal(engine.data.jujuAncestralInside, '1');
    const t0 = Date.now();
    feature.onTick(16, t0, engine);
    for (let i = 1; i <= 60; i++) feature.onTick(16, t0 + i * 1000, engine);
    assert.ok(Math.abs(feature._state().clock.spent - 260) < 2, String(feature._state().clock.spent));
    assert.equal(engine.data.jujuStealChance, '0.15');
    // Another Savanna street: the clock carries on.
    enter(engine, street('95'));
    assert.ok(feature._state().clock.spent > 250);
    // A reload in the Savanna is a relog: no decay, preset only on the first load.
    const saved = JSON.parse(JSON.stringify(feature.save()));
    assert.equal(saved.ancestral.inside, true);
    feature.restore(saved);
    const reloaded = makeEngine();
    enter(reloaded, savanna);
    assert.ok(Math.abs(feature._state().clock.spent - saved.ancestral.spent) < 1e-6);
    assert.equal(feature._state().clock.inside, true);
    // Walking out stops the clock and the chance reads 0.
    enter(reloaded, meadow);
    assert.equal(reloaded.data.jujuAncestralInside, '0');
    assert.equal(reloaded.data.jujuStealChance, '0');
    const left = feature._state().clock.spent;
    feature.onTick(16, Date.now() + 500, reloaded);
    assert.equal(feature._state().clock.spent, left);
    feature.restore(undefined);
  });
});
