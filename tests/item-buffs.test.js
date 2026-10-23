/**
 * Item-triggered buffs: official sources, timing, ticks, movement, and persistence.
 * Run: node --test tests/item-buffs.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadContentCatalogsFromDir,
  resetContentCatalogs,
} from '../public/js/content-catalogs.js';
import {
  BUFF_ITEM_CATALOG,
  createBuffState,
  getBuffItemInfo,
  activateBuffItem,
  listActiveBuffs,
  listPendingBuffs,
  tickBuffs,
  buffPhysics,
  buffedRandom,
  formatBuffRemaining,
  hasBuff,
  consumeRewardBuff,
  studyBuffBlockReason,
} from '../public/js/buffs.js?v=item-buffs-1';
import { accelerateActiveStudy, createSkillState, getStudyStatus, startSkillStudy } from '../public/js/skills.js';
import { applyRewards } from '../public/js/quests.js?v=item-buffs-1';
import { normalizeBuffSnapshot } from '../public/js/player-save.js?v=player-save-5';

const root = join(dirname(fileURLToPath(import.meta.url)), '../public');

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(root, 'assets/content'));
});

describe('official item buff mappings', () => {
  it('maps every currently growable effect item to a mined catalog buff', () => {
    assert.deepEqual(Object.keys(BUFF_ITEM_CATALOG), [
      'spinach',
      'hairball_flower',
      'rookswort',
      'purple_flower',
      'rubeweed',
      'silvertongue',
      'yellow_crumb_flower',
      'essence_of_yellow_crumb',
    ]);
    for (const classTsid of Object.keys(BUFF_ITEM_CATALOG)) {
      const info = getBuffItemInfo(classTsid);
      assert.ok(info.def, classTsid);
      assert.ok(existsSync(join(root, 'assets/sprites/icons', `${classTsid}.png`)), classTsid);
    }
    assert.equal(getBuffItemInfo('spinach').buffId, 'high_jumper');
    assert.equal(getBuffItemInfo('spinach').durationSeconds, 7);
    assert.equal(getBuffItemInfo('purple_flower').delaySeconds, 15);
    assert.equal(getBuffItemInfo('purple_flower').tickSeconds, 7);
    assert.equal(getBuffItemInfo('hairball_flower').durationSeconds, 300);
  });

  it('activates Spinach atomically and changes movement only while active', () => {
    const state = createBuffState();
    const inv = { spinach: 2 };
    const pc = { energy: 40, mood: 40 };
    const result = activateBuffItem(state, inv, pc, 'spinach', 1000);
    assert.equal(result.ok, true);
    assert.equal(inv.spinach, 1);
    assert.equal(listActiveBuffs(state, 1000)[0].classTsid, 'high_jumper');
    assert.deepEqual(buffPhysics(state, 1000), {
      speed: 1.7,
      jump: 1.5,
      gravity: 0.35 / 0.42,
    });
    const duplicate = activateBuffItem(state, inv, pc, 'spinach', 2000);
    assert.equal(duplicate.ok, false);
    assert.equal(inv.spinach, 1, 'a rejected activation must not consume the item');
    tickBuffs(state, pc, 8000);
    assert.equal(hasBuff(state, 'high_jumper', 8000), false);
    assert.deepEqual(buffPhysics(state, 8000), { speed: 1, jump: 1, gravity: 1 });
  });

  it('runs Hairball Rally energy ticks on the official one-minute cadence', () => {
    const state = createBuffState();
    const inv = { hairball_flower: 1 };
    const pc = { energy: 50, mood: 50 };
    activateBuffItem(state, inv, pc, 'hairball_flower', 0);
    assert.equal(buffPhysics(state, 0).speed, 1.1);
    assert.equal(tickBuffs(state, pc, 59999).length, 0);
    const first = tickBuffs(state, pc, 60000);
    assert.equal(first.filter((event) => event.type === 'tick').length, 1);
    assert.equal(pc.energy, 45);
    const finish = tickBuffs(state, pc, 300000);
    assert.equal(finish.filter((event) => event.type === 'tick').length, 4);
    assert.equal(finish.at(-1).type, 'expired');
    assert.equal(pc.energy, 25);
  });

  it('preserves the original Purple Flower delay and 7-second iMG pulse', () => {
    const state = createBuffState();
    const inv = { purple_flower: 1 };
    const pc = { energy: 50, mood: 50, imagination: 10, xp: 10 };
    const result = activateBuffItem(state, inv, pc, 'purple_flower', 1000);
    assert.equal(result.pending, true);
    assert.equal(listActiveBuffs(state, 1000).length, 0);
    assert.equal(listPendingBuffs(state, 1000).length, 1);
    assert.equal(formatBuffRemaining(result.buff, 1000), 'in 15s');
    const started = tickBuffs(state, pc, 16000);
    assert.equal(started[0].type, 'activated');
    assert.equal(pc.imagination, 10);
    const pulse = tickBuffs(state, pc, 23000);
    assert.equal(pulse[0].type, 'tick');
    assert.equal(pc.imagination, 11);
    assert.equal(pc.xp, 11);
  });

  it('ports Rookswort and Silvertongue immediate metabolics and reward bonus', () => {
    const rookState = createBuffState();
    const rookPc = { energy: 90, mood: 80 };
    const rook = activateBuffItem(rookState, { rookswort: 1 }, rookPc, 'rookswort', 0);
    assert.deepEqual(rook.effects, { energy: 3, mood: -2 });
    assert.equal(rookPc.energy, 93);
    assert.equal(rookPc.mood, 78);

    const silverState = createBuffState();
    const silverInv = { silvertongue: 1 };
    const silverPc = { energy: 50, mood: 50, imagination: 0, xp: 0, currants: 0 };
    activateBuffItem(silverState, silverInv, silverPc, 'silvertongue', 0);
    assert.equal(silverPc.rewardMultiplier, 1.05);
    applyRewards(silverPc, { xp: 100, currants: 20 });
    assert.equal(silverPc.imagination, 105);
    assert.equal(silverPc.currants, 20); // round_to_5(21)
    assert.equal(silverPc.rewardBuffConsumed, true);
    const spent = consumeRewardBuff(silverState, silverPc, 1);
    assert.equal(spent.classTsid, 'silvertongue');
    assert.equal(silverPc.rewardMultiplier, 1);
  });

  it('makes Rubeweed Max Luck favor low-roll-is-good checks', () => {
    const state = createBuffState();
    const inv = { rubeweed: 1 };
    const pc = { energy: 50, mood: 50 };
    activateBuffItem(state, inv, pc, 'rubeweed', 0);
    assert.equal(buffedRandom(state, () => 0.99, 0), 0);
  });
});

describe('buff save and client wiring', () => {
  it('sanitizes timers, source items, counters, and strips runtime definitions', () => {
    const normalized = normalizeBuffSnapshot({
      active: {
        purple_flower: {
          appliedAt: 16000,
          expiresAt: 142000,
          nextTickAt: 23000,
          activated: false,
          sourceItem: 'purple flower!',
          args: { energy: 5, nested: { nope: true } },
          def: { huge: true },
        },
      },
      totalActivated: 4.8,
      ticksApplied: 9.2,
    });
    assert.deepEqual(normalized.active.purple_flower, {
      classTsid: 'purple_flower',
      appliedAt: 16000,
      expiresAt: 142000,
      nextTickAt: 23000,
      activated: false,
      sourceItem: 'purpleflower',
      args: { energy: 5, nested: { nope: true } },
    });
    assert.equal(normalized.totalActivated, 4);
    assert.equal(normalized.ticksApplied, 9);
  });

  it('wires pack actions, honest effects panel, HUD strip, physics, QA, and cache versions', () => {
    const game = readFileSync(join(root, 'game.js'), 'utf8');
    const html = readFileSync(join(root, 'play/index.html'), 'utf8');
    const css = readFileSync(join(root, 'style.css'), 'utf8');
    assert.match(game, /activateBuffItem\(buffState, inv, pc/);
    assert.match(game, /tickBuffs\(buffState, pc/);
    assert.match(game, /buffPhysics\(buffState/);
    assert.match(game, /buffedRandom\(buffState/);
    assert.match(game, /bootParams\.get\('buffdemo'\)/);
    assert.doesNotMatch(game, /Catalog \(apply demo\)/);
    assert.match(html, /id="buff-strip"/);
    assert.match(html, /game\.js\?v=official-ecology-1/);
    assert.match(html, /style\.css\?v=feed-picker-1/);
    assert.match(css, /\.buff-chip/);
    assert.match(css, /body\.buff-purple-pulse::after/);
    assert.match(game, /!state\.muted && audio\.ctx\?\.state === 'suspended'/);
  });
});

describe('Yellow Crumb items speed up the study in progress', () => {
  it('munch needs a study below maximum acceleration (yellow_crumb_flower.js verbs.munch)', () => {
    const crumb = getBuffItemInfo('yellow_crumb_flower');
    assert.equal(crumb.buffId, 'yellow_crumb_flower');
    assert.equal(crumb.def.name, 'Crumb of Knowledge');
    assert.equal(crumb.durationSeconds, 60);
    assert.equal(crumb.studyAccelerationSeconds, 60);
    assert.equal(crumb.verb, 'Munch');
    assert.equal(crumb.message, 'You feel studious.');
    assert.equal(crumb.effectHint, 'The Yellow Crumb Flower can help you focus.');
    assert.equal(studyBuffBlockReason(crumb, {}), 'You must be learning a skill to munch Yellow Crumb Flower.');
    assert.equal(
      studyBuffBlockReason(crumb, { learning: true, atMaxAcceleration: true }),
      'You are already learning at the maximum speed.'
    );
    assert.equal(studyBuffBlockReason(crumb, { learning: true }), '');
    assert.equal(studyBuffBlockReason(getBuffItemInfo('spinach'), {}), '');

    const state = createBuffState();
    const inv = { yellow_crumb_flower: 2 };
    const pc = { energy: 50, mood: 50 };
    const idle = activateBuffItem(state, inv, pc, 'yellow_crumb_flower', 1000, { study: { learning: false } });
    assert.equal(idle.ok, false);
    assert.equal(inv.yellow_crumb_flower, 2);
    const ok = activateBuffItem(state, inv, pc, 'yellow_crumb_flower', 1000, { study: { learning: true } });
    assert.equal(ok.ok, true);
    assert.equal(inv.yellow_crumb_flower, 1);
    const again = activateBuffItem(state, inv, pc, 'yellow_crumb_flower', 2000, { study: { learning: true } });
    assert.equal(again.msgs[0], 'The effects of eating too much of this herb could be serious!');
    assert.equal(hasBuff(state, 'yellow_crumb_flower', 60_999), true);
    assert.equal(hasBuff(state, 'yellow_crumb_flower', 61_000), false);
  });

  it('Crumb of Knowledge doubles study speed for one minute (skills_start_acceleration(60))', () => {
    const skills = createSkillState();
    startSkillStudy(skills, 'animalkinship_1', { level: 99 }, 0); // 60 s study
    const sped = accelerateActiveStudy(skills, getBuffItemInfo('yellow_crumb_flower').studyAccelerationSeconds, 0);
    // Capped at half the time left, like every source acceleration.
    assert.equal(sped.applied, 30);
    assert.equal(getStudyStatus(skills, 'animalkinship_1', 0).remainingSeconds, 30);
  });

  it('Essence of Yellow Crumb gives Crumbly Thoughts and ten minutes of acceleration', () => {
    const essence = getBuffItemInfo('essence_of_yellow_crumb');
    assert.equal(essence.buffId, 'crumbly_thoughts');
    assert.equal(essence.durationSeconds, 600);
    assert.equal(essence.studyAccelerationSeconds, 600);
    assert.equal(essence.verb, 'Imbibe');
    assert.equal(studyBuffBlockReason(essence, {}), 'You must be learning a skill to imbibe Essence of Yellow Crumb.');
    const state = createBuffState();
    const inv = { essence_of_yellow_crumb: 1 };
    assert.equal(
      activateBuffItem(state, inv, {}, 'essence_of_yellow_crumb', 0, { dead: true, study: { learning: true } }).msgs[0],
      'You are too dead for that now.'
    );
    assert.equal(activateBuffItem(state, inv, {}, 'essence_of_yellow_crumb', 0, { study: { learning: true } }).ok, true);
    assert.equal(
      activateBuffItem(state, { essence_of_yellow_crumb: 1 }, {}, 'essence_of_yellow_crumb', 1, { study: { learning: true } }).msgs[0],
      'You are already under the effects of Essence of Yellow Crumb.'
    );
  });

  it('the pack applies the acceleration after the buff lands', () => {
    const game = readFileSync(join(root, 'game.js'), 'utf8');
    assert.match(game, /activateBuffItem\(buffState, inv, pc, classTsid, Date\.now\(\), \{ study: studyBuffContext\(\), dead: playerIsDead\(\) \}\)/);
    assert.match(game, /accelerateActiveStudy\(skillState, r\.info\.studyAccelerationSeconds, Date\.now\(\)\)/);
  });
});
