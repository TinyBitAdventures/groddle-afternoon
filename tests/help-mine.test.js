/**
 * Help mine (G207): js/help-mine.js against GameServerJS
 * items/include/mining.js and quests/help_mine.js, the I Me Mine quest in the
 * offer engine, and features/help-mine-feature.js on a stand-in engine.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMPANION_MINE_RULES,
  HELP_MINE_COUNTER,
  HELP_MINE_MAX_HELPERS,
  PLAYER_MINER,
  ROCK_CHUNK_NAMES,
  addMiner,
  companionCanJoin,
  companionMineTake,
  createRockCrew,
  helpBonusMessage,
  helpMineBonus,
  helpString,
  helperCount,
  helperIds,
  isHelpMining,
  mineVerbLabel,
  pickCompanionRock,
  removeMiner,
} from '../public/js/help-mine.js';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js';
import {
  acceptOffer,
  pendingQuestOffers,
  questOfferIndex,
  requirementRoute,
  routeQuestEvent,
  turnInQuest,
} from '../public/js/quest-offers.js';
import { createMineRock } from '../public/js/mining.js?v=g259-1';
import { createQuestState } from '../public/js/quests.js';

const here = import.meta.dirname;
const root = join(here, '..');
const GS = join(root, '../glitch-GameServerJS');
const hasGS = existsSync(GS);
const gs = (rel) => readFileSync(join(GS, rel), 'utf8');

describe('help mine against items/include/mining.js', { skip: !hasGS && 'glitch-GameServerJS not beside the spike' }, () => {
  const src = hasGS ? gs('items/include/mining.js') : '';

  it('adds min(i+1, 4) for each of the first 9 helpers, as the source loop does', () => {
    const loop = src.match(/for \(var i = 0; i < n_helpers && i < 9; i\+\+\) \{\s*help_bonus \+= Math\.min\(i\+1, 4\);\s*\}/);
    assert.ok(loop, 'the help_bonus loop');
    const sourceBonus = new Function('n_helpers', `var help_bonus = 0; ${loop[0]} return help_bonus;`);
    for (let n = 0; n <= 14; n += 1) assert.equal(helpMineBonus(n), sourceBonus(n), `n=${n}`);
    assert.equal(HELP_MINE_MAX_HELPERS, 9);
    assert.deepEqual([1, 2, 3, 4, 5, 9, 12].map(helpMineBonus), [1, 3, 6, 10, 14, 30, 30]);
  });

  it('keeps the miners and helper stacks the way addMiner and removeMiner do', () => {
    // Run the source's own functions on a stand-in rock and compare every step.
    const body = src.slice(src.indexOf('function addMiner'), src.indexOf('function cancelMining'));
    const make = new Function(`const rock = { miners: [], helpers: {} }; ${body.replace(/function (\w+)\(pc(, cancel)?\)/g, 'rock.$1 = function(pc$2)')} return rock;`);
    const rock = make();
    const crew = createRockCrew();
    const steps = [['add', 'A'], ['add', 'B'], ['add', 'C'], ['remove', 'B', true], ['add', 'B'], ['remove', 'C', false], ['add', 'C'], ['remove', 'A', false]];
    for (const [op, id, cancel] of steps) {
      if (op === 'add') {
        rock.addMiner.call(rock, { tsid: id });
        addMiner(crew, id);
      } else {
        rock.removeMiner.call(rock, { tsid: id }, cancel);
        removeMiner(crew, id, cancel);
      }
      assert.deepEqual(crew, JSON.parse(JSON.stringify({ miners: rock.miners, helpers: rock.helpers })), `${op} ${id}`);
    }
    // B started twice while C was mining: it counts twice on C's stack.
    assert.equal(helperCount(crew, 'B'), 1);
  });

  it('reads "Help mine" only when someone else is on the rock', () => {
    assert.match(src, /if\(!this\.miners \|\| miner_count == 0 \|\| \(miner_count == 1 && this\.miners\[0\] == pc\.tsid\)\) \{\s*return "Mine";\s*\} else \{\s*return "Help mine";/);
    const crew = createRockCrew();
    assert.equal(mineVerbLabel(crew), 'Mine');
    addMiner(crew, PLAYER_MINER);
    assert.equal(mineVerbLabel(crew), 'Mine');
    addMiner(crew, 'Amp');
    assert.equal(mineVerbLabel(crew), 'Help mine');
    removeMiner(crew, PLAYER_MINER);
    assert.equal(mineVerbLabel(crew), 'Help mine');
  });

  it('counts you as helping when a miner was there as you started', () => {
    assert.match(src, /if\(num_keys\(this\.helpers\)\) \{\s*pc\['!help_mining'\] = this\.tsid;/);
    assert.match(src, /if\(pc\['!help_mining'\]\) \{\s*delete pc\['!help_mining'\];\s*pc\.quests_inc_counter\('help_mine', 1\);/);
    const crew = createRockCrew();
    assert.equal(isHelpMining(crew), false);
    addMiner(crew, 'Amp');
    assert.equal(isHelpMining(crew), true);
    assert.equal(HELP_MINE_COUNTER, 'help_mine');
  });

  it('says the bonus in the source words, with the source chunk names', () => {
    assert.ok(src.includes('var bonus_msg = "You got "+ (help_bonus - bonus_remaining) +" additional "+bonus_name+" with the help you received from "+this.getHelpString(pc)+".";'));
    assert.match(src, /if\(count == num_helpers\) \{\s*result \+= ", and ";\s*\} else \{\s*result \+= ", ";/);
    for (const [type, [single, plural]] of Object.entries(ROCK_CHUNK_NAMES)) {
      const item = gs(`items/${type}.js`);
      assert.ok(item.includes(`var name_single = "${single}";`), type);
      assert.ok(item.includes(`var name_plural = "${plural}";`), type);
    }
    assert.equal(helpString(['Amp']), 'Amp');
    assert.equal(helpString(['Amp', 'Bumbishfish']), 'Amp, and Bumbishfish');
    assert.equal(helpString(['Amp', 'Bumbishfish', 'Lily Linguistic']), 'Amp, Bumbishfish, and Lily Linguistic');
    assert.equal(helpBonusMessage('metal_rock', 1, ['Amp']), 'You got 1 additional Chunk of Metal Rock with the help you received from Amp.');
    assert.equal(helpBonusMessage('beryl', 3, ['Amp', 'Bumbishfish']), 'You got 3 additional Chunks of Beryl with the help you received from Amp, and Bumbishfish.');
  });

  it('I Me Mine asks for three helps for 175 iMG, 125 currants, 50 energy and 15 Friendly favor', () => {
    const quest = gs('quests/help_mine.js');
    assert.match(quest, /"name"\s*: "help_mine",\s*"num"\s*: 3,/);
    assert.match(quest, /var title = "I Me Mine";/);
    assert.match(gs('quests/mining_mine_rocks.js'), /pc\.quests_offer\('help_mine', true\);/);
  });
});

describe('the companions\' gentle rules', () => {
  const companion = { x: 500, y: 600, sessions: 0, joins: 0 };
  const rock = { x: 640, y: 600, chunks: 50, depleted: false, busy: false };
  const player = { x: 400, y: 600 };

  it('pick a free rock they can walk to, in reach and in sight of you, with chunks to spare', () => {
    assert.equal(pickCompanionRock({ companion, rocks: [rock], player }), rock);
    assert.equal(pickCompanionRock({ companion: { ...companion, sessions: 1 }, rocks: [rock], player }), null, 'one rock a visit');
    assert.equal(pickCompanionRock({ companion, rocks: [{ ...rock, busy: true }], player }), null, 'someone is on it');
    assert.equal(pickCompanionRock({ companion, rocks: [{ ...rock, chunks: COMPANION_MINE_RULES.leaveChunks + 9 }], player }), null, 'too few chunks');
    assert.equal(pickCompanionRock({ companion, rocks: [rock], player, reachable: () => false }), null, 'no level ground to it');
    assert.equal(pickCompanionRock({ companion, rocks: [{ ...rock, x: 500 + COMPANION_MINE_RULES.reachX + 1 }], player: { x: 900, y: 600 } }), null, 'out of reach');
    assert.equal(pickCompanionRock({ companion, rocks: [{ ...rock, y: 600 - COMPANION_MINE_RULES.reachY - 1 }], player }), null, 'another level');
    assert.equal(pickCompanionRock({ companion, rocks: [rock], player: { x: 1300, y: 600 } }), null, 'out of your sight');
    const near = { ...rock, x: 560 };
    assert.equal(pickCompanionRock({ companion, rocks: [rock, near], player }), near, 'the nearest');
  });

  it('join you only from close by, once a visit, and not on a nearly mined rock', () => {
    assert.equal(companionCanJoin({ companion, rock }), true);
    assert.equal(companionCanJoin({ companion: { ...companion, joins: 1 }, rock }), false);
    assert.equal(companionCanJoin({ companion: { ...companion, x: 640 - COMPANION_MINE_RULES.joinX - 1 }, rock }), false);
    assert.equal(companionCanJoin({ companion, rock, reachable: () => false }), false);
    assert.equal(companionCanJoin({ companion, rock: { ...rock, chunks: COMPANION_MINE_RULES.leaveChunks } }), false);
  });

  it('never take a rock below its last chunks', () => {
    assert.equal(companionMineTake(50, 6, 1), 7);
    assert.equal(companionMineTake(24, 6, 1), 4);
    assert.equal(companionMineTake(COMPANION_MINE_RULES.leaveChunks, 9, 0), 0);
  });
});

describe('I Me Mine in the quest engine', () => {
  before(() => loadContentCatalogsFromDir(join(root, 'public/assets/content')));

  it('is a solo quest again, offered when Mining Rocks is done', () => {
    const def = JSON.parse(readFileSync(join(root, 'public/assets/content/quests.json'), 'utf8')).help_mine;
    assert.equal(def.solo, true);
    assert.equal(def.soloReason, undefined);
    assert.deepEqual(def.offerTriggers, [{ type: 'quest', quest: 'mining_mine_rocks' }]);
    assert.ok(questOfferIndex().some((row) => row.classTsid === 'help_mine'));
    assert.equal(requirementRoute(def.requirements[0]).emitted, true);
  });

  it('becomes offerable after Mining Rocks and completes after three helps', () => {
    const qs = createQuestState();
    const pc = { level: 5, xp: 0, imagination: 0, currants: 0, energy: 100, mood: 100 };
    const before = pendingQuestOffers(qs, pc, { now: 0 }).map((r) => r.classTsid);
    assert.ok(!before.includes('help_mine'));
    qs.completed.push('mining_mine_rocks');
    const offers = pendingQuestOffers(qs, pc, { now: 0 }).map((r) => r.classTsid);
    assert.ok(offers.includes('help_mine'), offers.join(','));
    assert.equal(acceptOffer(qs, 'help_mine', { inv: {}, now: 0 }).ok, true);
    routeQuestEvent(qs, HELP_MINE_COUNTER, 1);
    routeQuestEvent(qs, HELP_MINE_COUNTER, 1);
    assert.equal(qs.active.help_mine.progress.help_mine, 2);
    const third = routeQuestEvent(qs, HELP_MINE_COUNTER, 1);
    assert.ok(third.completable.some((row) => row.classTsid === 'help_mine'));
    const done = turnInQuest(qs, 'help_mine', pc, {});
    assert.ok(done.ok, JSON.stringify(done));
    assert.ok(qs.completed.includes('help_mine'));
  });
});

describe('features/help-mine-feature.js', () => {
  /** A street with one rock, the player and three companions, enough engine for the feature. */
  async function stage() {
    const mod = await import(`../public/js/features/help-mine-feature.js?v=test-${Math.random()}`);
    const feature = mod.helpMineFeature;
    const rock = createMineRock('rock_metal_1');
    const rockTarget = { classId: 'rock_metal_1', state: { rock }, sprite: { x: 600, y: 600, destroyed: false } };
    const mk = (name, x) => ({
      name,
      classId: 'pc_local',
      sprite: { x, y: 600, destroyed: false, addChild() {} },
      body: null,
      state: {},
      homeMinX: 100,
      homeMaxX: 1100,
      socialTargetX: null,
      socialUntil: 0,
    });
    const companions = [mk('Amp', 760), mk('Bumbishfish', 820), mk('Lily Linguistic', 1080)];
    const log = [];
    const events = [];
    const data = {};
    let action = null;
    const engine = {
      started: true,
      player: { x: 560, y: 600 },
      pc: { energy: 100 },
      inv: { pick: 1 },
      toolState: null,
      learnedSkills: ['mining_1'],
      interactables: [rockTarget, ...companions],
      localCompanions: companions,
      questState: createQuestState(),
      get currentAction() { return action; },
      acting: () => Boolean(action),
      busy: () => Boolean(action),
      param: () => null,
      setData: (k, v) => { data[k] = String(v); },
      pushActivity: (line) => log.push(line),
      floatText() {},
      refreshPack() {},
      refreshMineRock() {},
      achievement: (counter, n) => events.push([counter, n]),
    };
    feature.onStreetEnter({}, engine);
    const start = () => {
      action = { target: rockTarget, verbId: 'mine' };
      feature.verbStarted(rockTarget, { id: 'mine' }, engine);
    };
    const land = (got = 5) => {
      rock.chunksRemaining -= got;
      feature.rockMined(rockTarget, { ok: true, rock, got }, engine);
      action = null;
    };
    const stop = () => {
      action = null;
    };
    return { feature, engine, rock, rockTarget, companions, log, events, data, start, land, stop };
  }

  it('gives your swing the help bonus when companions join, in the source words', async () => {
    const realRandom = Math.random;
    Math.random = () => 0; // every companion close enough joins
    try {
      const s = await stage();
      s.start();
      // Amp (160 px) and Bumbishfish (220 px) are in join reach (400 px); Lily (480 px) is not.
      assert.equal(s.data.helpMineCrew, 'rock_metal_1:player+Amp+Bumbishfish');
      const before = s.rock.chunksRemaining;
      s.land(5);
      assert.equal(s.engine.inv.metal_rock, 3);
      assert.equal(s.rock.chunksRemaining, before - 5 - 3);
      assert.deepEqual(s.log, ['You got 3 additional Chunks of Metal Rock with the help you received from Amp, and Bumbishfish.']);
      assert.deepEqual(s.events, [], 'they helped you; you did not help them');
    } finally {
      Math.random = realRandom;
    }
  });

  it('reads "help mine" on a rock a companion works, and helping counts for I Me Mine', async () => {
    const realRandom = Math.random;
    Math.random = () => 0.99; // nobody joins on their own
    try {
      const s = await stage();
      const verbs = [{ id: 'mine', label: 'mine', enabled: true }, { id: 'talk_to', label: 'inspect' }];
      assert.equal(s.feature.decorateVerbs(s.rockTarget, verbs, s.engine), null, 'nobody on it');
      // Amp starts working the rock on its own (its interest roll comes up).
      const amp = s.companions[0];
      const now = Date.now();
      s.feature.onTick(16, now, s.engine); // first sight: they look again after lookMs
      Math.random = () => 0;
      s.feature.onTick(16, now + COMPANION_MINE_RULES.lookMs + 10, s.engine);
      assert.equal(amp.socialTargetX, 600 + COMPANION_MINE_RULES.standOffX, 'Amp walks to its side of the rock');
      assert.equal(s.companions[1].socialTargetX, null, 'one companion to a rock');
      amp.sprite.x = amp.socialTargetX; // walked there
      s.feature.onTick(16, now + COMPANION_MINE_RULES.lookMs + 30, s.engine);
      assert.match(s.data.helpMineCrew, /Amp/);
      const out = s.feature.decorateVerbs(s.rockTarget, verbs, s.engine);
      assert.equal(out.find((v) => v.id === 'mine').label, 'help mine');
      assert.equal(out.find((v) => v.id === 'talk_to').label, 'inspect');
      Math.random = () => 0.99;
      s.start();
      // Amp's swing lands while you mine: its top roll (9) plus 1 for you on its stack.
      const left = s.rock.chunksRemaining;
      s.feature.onTick(16, now + COMPANION_MINE_RULES.lookMs + 40 + 1800, s.engine);
      assert.equal(s.data.helpMineCompanion, 'Amp:10');
      assert.equal(s.rock.chunksRemaining, left - 10);
      s.land(5);
      assert.deepEqual(s.events, [['help_mine', 1]]);
      assert.equal(s.data.helpMineHelps, '1');
    } finally {
      Math.random = realRandom;
    }
  });

  it('a cancelled swing takes you off the rock and counts nothing', async () => {
    const s = await stage();
    s.start();
    assert.match(s.data.helpMineCrew, /player/);
    // The verb stopped (cancelled, or failed for energy) without landing: mining.js miningSanityCheck.
    s.stop();
    s.feature.onTick(16, Date.now(), s.engine);
    assert.ok(!/player/.test(s.data.helpMineCrew));
    s.feature.rockMined(s.rockTarget, { ok: true, rock: s.rock, got: 5 }, s.engine);
    assert.deepEqual(s.events, []);
  });

  it('is registered last in the feature list', () => {
    const index = readFileSync(join(root, 'public/js/features/index.js'), 'utf8');
    assert.match(index, /import \{ helpMineFeature \} from '\.\/help-mine-feature\.js\?v=[\w-]+'; FEATURES\.push\(helpMineFeature\);/);
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /features\.query\('verbStarted', target, verb, engine\);/);
    assert.match(game, /features\.query\('rockMined', target, result, engine\);\s*refreshMineRockVisual\(target\);/);
  });
});
