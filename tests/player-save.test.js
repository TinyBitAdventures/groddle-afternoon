import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createPlayerSave,
  normalizeGardenSnapshot,
  normalizeInventorySnapshot,
  normalizePlayerSnapshot,
  normalizeSystemsSnapshot,
  normalizeWorldSnapshot,
  parsePlayerSave,
  restorePlayerSave,
  serializePlayerSave,
} from '../public/js/player-save.js?v=player-save-14';

const publicRoot = join(import.meta.dirname, '..', 'public');

describe('persistent pack and core player state', () => {
  it('captures and round-trips pack counts and player stats', () => {
    const save = createPlayerSave({
      inventory: { apple: 0, grain: 12, odd_item: 3 },
      player: { energy: 44, mood: 55, imagination: 6000, currants: 321, xp: 6085, level: 6 },
      savedAt: 123,
    });
    const restored = parsePlayerSave(serializePlayerSave(save));
    assert.deepEqual(restored, save);
  });

  it('preserves zero-count entries so dropped starter items do not respawn', () => {
    const save = createPlayerSave({ inventory: { apple: 0 }, player: {} });
    const inventory = { apple: 2, grain: 15 };
    const player = { energy: 80 };
    assert.equal(restorePlayerSave(save, inventory, player), true);
    assert.deepEqual(inventory, { apple: 0 });
  });

  it('restores into existing object identities used by imported game systems', () => {
    const inventory = { apple: 2 };
    const player = { energy: 80, currants: 200 };
    const invIdentity = inventory;
    const playerIdentity = player;
    restorePlayerSave(
      createPlayerSave({ inventory: { cherry: 4 }, player: { energy: 20, currants: 999 } }),
      inventory,
      player
    );
    assert.equal(inventory, invIdentity);
    assert.equal(player, playerIdentity);
    assert.equal(inventory.cherry, 4);
    assert.equal(player.currants, 999);
  });

  it('repairs hostile counts, metabolics, and duplicate upgrade ids', () => {
    assert.deepEqual(normalizeInventorySnapshot({ apple: -2, grain: 2.9, 'bad key!': 8 }), {
      apple: 0,
      grain: 2,
      badkey: 8,
    });
    const player = normalizePlayerSnapshot({
      energy: 400,
      mood: -1,
      currants: -20,
      imaginationUpgrades: ['gardening_1', 'gardening_1', 'bad upgrade!'],
    });
    assert.equal(player.energy, 100);
    assert.equal(player.mood, 0);
    assert.equal(player.currants, 0);
    assert.deepEqual(player.imaginationUpgrades, ['gardening_1', 'badupgrade']);
  });

  it('rejects malformed or non-snapshot storage', () => {
    assert.equal(parsePlayerSave('{oops'), null);
    assert.equal(parsePlayerSave('{}'), null);
    assert.equal(restorePlayerSave(null, {}, {}), false);
  });

  it('round-trips quests, badges, skills, buffs, food memory, musicblocks, and street ecology', () => {
    const save = createPlayerSave({
      inventory: { apple: 1 },
      player: { energy: 50 },
      systems: {
        quests: {
          active: { quest_one: { progress: { piggies_petted: 3 }, startedAt: 10 } },
          completed: ['quest_done'],
          story: {
            greedyStreetSpirit: {
              firstCompletedAt: 500,
              lastRepeatCompletedAt: 600,
              lastRepeatFailedAt: 700,
            },
            phantom: {
              hauntStreets: ['GHOST_A', 'GHOST_B'],
              foundStreets: ['GHOST_A'],
              rememberedStreets: ['MEMORY_A'],
              heartGranted: true,
              memoryCooldownUntil: 999,
            },
          },
        },
        achievements: {
          progress: { badge_one: { progress: { apples_picked: 7 } } },
          unlocked: ['badge_done'],
        },
        skills: {
          learned: ['animalkinship_1', 'gardening_1'],
          queue: {
            animalkinship_2: {
              classTsid: 'animalkinship_2', totalPoints: 1200, pointsRemaining: 900,
              startedAt: 100, endsAt: 100000, pausedAt: 0, isPaused: false, acceleratedUntil: 0,
            },
          },
        },
        buffs: { active: { gift_of_gab: { appliedAt: 20, expiresAt: 5000, def: { huge: true } } } },
        musicblocks: {
          heardAt: { musicblock_d_green_02: 40 },
          plays: 2,
          lastPlayed: 'musicblock_d_green_02',
          collectedStreets: { GLI123: true },
        },
        shrines: {
          favor: { spriggan: 77 },
          emblems: { spriggan: 1 },
          dailyFavor: { spriggan: 12 },
          dailyXp: 24,
          donations: 3,
          donationsByGiant: { spriggan: 3 },
        },
        quoins: {
          collectedToday: 12,
          dailyLimit: 120,
          totalCollected: 55,
          multiplier: 3,
          studyCredit: 15,
          byType: { xp: 20, currants: 4 },
          dailyByType: { xp: 8, currants: 4 },
        },
        food: {
          history: { sammich: 123456 },
          foodToday: 29,
          itemsEaten: 3,
          mealsEaten: 1,
          varietyBonuses: 1,
          varietyImg: 15,
        },
        feats: {
          totalPoints: 9,
          personalPoints: 3,
          contributions: 1,
          chainsCompleted: 1,
          nextStep: 3,
          participants: ['Amp', 'Ur'],
          activeSince: 456,
        },
        emotionalBear: {
          upgrades: ['kiss'],
          anthropomorphizedDay: '16-07-25',
          companionMood: { Amp: 88 },
          interactions: { hug: { Amp: 2 } },
          totalEmotes: 2,
        },
        home: {
          owned: true,
          style: 'firebog',
          purchasedAt: 700,
          visits: 3,
          inHome: true,
          room: 'interior',
          returnLocation: {
            tsid: 'GLI123',
            label: 'Somewhere',
            hubName: 'Groddle',
            x: 222,
            y: 333,
          },
        },
        mailbox: {
          nextId: 4,
          totalSent: 1,
          totalReceived: 2,
          messages: [{
            id: 'mail-3',
            sender: 'Amp',
            recipient: 'You',
            text: 'Hello from Amp',
            sentAt: 100,
            deliveryAt: 110,
            read: false,
            archived: false,
            attachment: { classTsid: 'apple', count: 2 },
            currants: 3,
          }],
        },
      },
      world: {
        animals: {
          'GLI123:npc_piggy:0': { classId: 'npc_piggy', state: { petted: true, petCount: 3 } },
        },
        streets: {
          GLI123: {
            gardens: {
              default: {
                gardenType: 'default', cols: 1, rows: 1,
                plots: { '1-1': { state: 'shoots', seed: 'seed_spinach', wet: true, stageStartedAt: 100 } },
              },
            },
            trees: [{ classId: 'trant_fruit', state: { fruitCount: 2, harvested: false } }],
            rocks: [{ classId: 'rock_metal_1', rock: { chunksRemaining: 12, depleted: false } }],
            collectedApples: [0, 2],
            collectedQuoins: [1],
          },
        },
      },
      savedAt: 900,
    });
    const restored = parsePlayerSave(serializePlayerSave(save));
    assert.deepEqual(restored, save);
    assert.equal(restored.systems.buffs.active.gift_of_gab.def, undefined);
    assert.equal(restored.systems.shrines.favor.spriggan, 77);
    assert.equal(restored.systems.quoins.multiplier, 3);
    assert.equal(restored.systems.skills.queue.animalkinship_2.endsAt, 100000);
    assert.equal(restored.systems.food.history.sammich, 123456);
    assert.equal(restored.systems.food.varietyImg, 15);
    assert.equal(restored.systems.feats.totalPoints, 9);
    assert.equal(restored.systems.feats.nextStep, 1);
    assert.deepEqual(restored.systems.feats.participants, []);
    assert.deepEqual(restored.systems.emotionalBear.upgrades, ['kiss']);
    assert.equal(restored.systems.emotionalBear.companionMood.Amp, 88);
    assert.equal(restored.systems.emotionalBear.interactions.hug.Amp, 2);
    assert.equal(restored.systems.home.style, 'firebog');
    assert.equal(restored.systems.home.room, 'interior');
    assert.equal(restored.systems.home.returnLocation.tsid, 'GLI123');
    assert.equal(restored.systems.mailbox.messages[0].sender, 'Amp');
    assert.equal(restored.systems.mailbox.messages[0].attachment.count, 2);
    assert.deepEqual(restored.systems.quests.story.phantom.foundStreets, ['GHOST_A']);
    assert.equal(restored.systems.quests.story.phantom.heartGranted, true);
    assert.deepEqual(restored.systems.quests.story.greedyStreetSpirit, {
      firstCompletedAt: 500,
      lastRepeatCompletedAt: 600,
      lastRepeatFailedAt: 700,
    });
    assert.equal(restored.world.streets.GLI123.gardens.default.plots['1-1'].state, 'shoots');
  });

  it('migrates a version-1 core save using current system defaults', () => {
    const migrated = parsePlayerSave(JSON.stringify({
      version: 1,
      inventory: { apple: 0 },
      player: { energy: 22 },
      savedAt: 5,
    }), {
      systems: { skills: { learned: ['animalkinship_1'] } },
      world: { animals: {}, streets: {} },
    });
    assert.equal(migrated.version, 7);
    assert.deepEqual(migrated.systems.skills.learned, ['animalkinship_1']);
    assert.equal(migrated.player.energy, 22);
  });

  it('restores every runtime state without replacing imported object identities', () => {
    const quests = { active: {}, completed: [] };
    const achievements = { progress: {}, unlocked: [] };
    const skills = { learned: [] };
    const buffs = { active: {} };
    const musicblocks = { heardAt: {}, plays: 0, lastPlayed: null, collectedStreets: {} };
    const shrines = { favor: {}, emblems: {}, dailyFavor: {}, dailyXp: 0, donations: 0, donationsByGiant: {}, giantTipIndex: 0 };
    const quoins = { collectedToday: 0, dailyLimit: 100, totalCollected: 0, multiplier: 1, studyCredit: 0, qurazyFound: 0, limitStreak: 0, bestLimitStreak: 0, byType: {}, dailyByType: {} };
    const food = { history: {}, foodToday: 0, itemsEaten: 0, mealsEaten: 0, varietyBonuses: 0, varietyImg: 0 };
    const feats = { totalPoints: 0, personalPoints: 0, contributions: 0, chainsCompleted: 0, nextStep: 1, participants: [], activeSince: 0 };
    const emotionalBear = { upgrades: [], anthropomorphizedDay: '', companionMood: {}, interactions: {}, totalEmotes: 0 };
    const world = { animals: {}, streets: {} };
    const targets = { quests, achievements, skills, buffs, musicblocks, shrines, quoins, food, feats, emotionalBear, world };
    const save = createPlayerSave({
      inventory: {},
      systems: {
        quests: { completed: ['quest_done'] },
        achievements: { unlocked: ['badge_done'] },
        skills: { learned: ['gardening_1'] },
        buffs: { active: { silvertongue: { appliedAt: 1, expiresAt: null } } },
        musicblocks: { plays: 7, collectedStreets: { GLI123: true } },
        shrines: { favor: { spriggan: 42 }, donations: 2 },
        quoins: { collectedToday: 9, multiplier: 2 },
        food: { history: { sammich: 99 }, foodToday: 29, varietyImg: 15 },
        feats: { totalPoints: 6, personalPoints: 1, contributions: 1, chainsCompleted: 1 },
        emotionalBear: { upgrades: ['moon'], companionMood: { Amp: 93 }, totalEmotes: 4 },
      },
      world: { animals: { one: { classId: 'npc_piggy', state: { petted: true } } } },
    });
    restorePlayerSave(save, {}, {}, targets);
    assert.equal(targets.quests, quests);
    assert.deepEqual(quests.completed, ['quest_done']);
    assert.deepEqual(achievements.unlocked, ['badge_done']);
    assert.deepEqual(skills.learned, ['gardening_1']);
    assert.ok(buffs.active.silvertongue);
    assert.equal(musicblocks.plays, 7);
    assert.equal(shrines.favor.spriggan, 42);
    assert.equal(quoins.collectedToday, 9);
    assert.equal(quoins.multiplier, 2);
    assert.equal(food.history.sammich, 99);
    assert.equal(food.varietyImg, 15);
    assert.equal(feats.totalPoints, 6);
    assert.equal(feats.chainsCompleted, 1);
    assert.deepEqual(emotionalBear.upgrades, ['moon']);
    assert.equal(emotionalBear.companionMood.Amp, 93);
    assert.equal(emotionalBear.totalEmotes, 4);
    assert.equal(world.animals.one.state.petted, true);
  });

  it('repairs invalid garden and street-world fields', () => {
    const garden = normalizeGardenSnapshot({
      gardenType: 'oops', cols: 99, rows: 0,
      plots: { '1-1': { state: 'teleporting', seed: 'seed spinach!', wet: 1, growModifier: -4 } },
    });
    assert.equal(garden.gardenType, 'default');
    assert.equal(garden.cols, 12);
    assert.equal(garden.rows, 1);
    assert.deepEqual(garden.plots['1-1'], {
      state: 'clean', seed: 'seedspinach', wet: false, wetAt: null, stageStartedAt: 0, growthMs: 0,
      growModifier: 0.05, fertilized: false,
    });
    const world = normalizeWorldSnapshot({
      streets: { 'bad street!': { collectedApples: [2, 2, -1, 1000], collectedQuoins: [3] } },
    });
    assert.deepEqual(world.streets.badstreet.collectedApples, [2]);
    assert.deepEqual(world.streets.badstreet.collectedQuoins, [3]);
    assert.deepEqual(normalizeSystemsSnapshot({ skills: { learned: ['a', 'a', 'bad skill!'] } }).skills.learned, ['a', 'badskill']);
  });
});

describe('player save client integration', () => {
  it('loads before street entry, saves from HUD mutations, and exposes a reset flag', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    assert.match(game, /PLAYER_STATE_STORAGE_KEY/);
    assert.match(game, /restorePlayerSave/);
    assert.match(game, /savePlayerState/);
    assert.match(game, /bootParams\.has\('resetgame'\)/);
    assert.match(game, /if \(state\.started\) savePlayerState\(\)/);
  });

  it('reattaches snapshots to live systems and every street ecology spawner', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    assert.match(game, /systems: persistentSystems\(\)/);
    assert.match(game, /world: persistentWorldState/);
    assert.match(game, /restoreAnimalStateCache\(\)/);
    assert.match(game, /streetState\.gardens\[gardenType\]/);
    assert.match(game, /streetState\.trees\[i\]/);
    assert.match(game, /streetState\.rocks\[index\]/);
    assert.match(game, /collectedApples/);
    assert.match(game, /collectedQuoins/);
    assert.match(game, /rehydrateSavedBuffs\(\)/);
  });
});
