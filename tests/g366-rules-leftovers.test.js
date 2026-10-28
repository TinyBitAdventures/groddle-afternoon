/**
 * G282, G277, G261 leftovers (lane RULES, 2026-10-27), each from what the source says:
 *
 * - G282: a song sung to a Butterfly counts butterflies:sung_to (npc_butterfly.js 679) and
 *   npc_butterfly:sing_to (items/item.js 738 notifyVerb); the unused chicken `buttered` flag is
 *   gone (butter up has no daily limit, npc_chicken.js 163-236); a trant harvest spends energy
 *   through loseEnergy (inc_skill_packages.js 486-488 metabolics_lose_energy, nothing while dead,
 *   inc_metabolics.js 108-122).
 * - G277: butterflies_milked and butterflies_massaged count each Butterfly once per quest run
 *   (npc_butterfly.js 1139-1142, 1286-1291); a timer buff whose item_class iconic is lost gets its
 *   stand-in icon when applied; a waiting emergency offer is looked at every second
 *   (QuestsDialog.as 41); Escape answers an open confirm before it closes the Decorate or
 *   Cultivate bar (ConfirmationDialog.as 102-111); the Tower's remove confirm is a prompt
 *   (proto_furniture_tower_chassis.js 66-76) and the Visiting Stone and Fox Ranger talk with
 *   conversations (visiting_stone.js 87/110/148, npc_fox_ranger.js 195-415), not quest cards.
 * - G261: Rainbow Run coins are class 'rainbow run' (spawner_moving_quoin.js 189): mood 1,
 *   back in 15 s (quoin.js 448-452, 289), outside the daily limit (quoin.js 198, 234).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=g403-1';
import { worldVerbAchievementCounters } from '../public/js/achievements.js?v=g403-1';
import { createAnimalState, resetAnimalDay } from '../public/js/animals.js?v=g414-1';
import { createQuestState } from '../public/js/quests.js';
import { acceptOffer, routeQuestEvent } from '../public/js/quest-offers.js?v=g403-1';
import { applyBuff, createBuffState } from '../public/js/buffs.js?v=g403-1';
import { BUFF_ICONS, QUEST_TIMER_BUFFS } from '../public/js/buff-triggers.js?v=g370-1';
import { EMERGENCY_RETRY_MS } from '../public/js/features/quest-offers-feature.js?v=g403-1';
import { QUOIN_CLASSES, quoinClassAmount, quoinRespawnMs } from '../public/js/quoins.js';
import { COIN_BACK_MS, COIN_CLASS, COIN_TYPE, room as rainbowRoom } from '../public/js/quest-rooms/rainbow-run.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');
const GSJS = join(ROOT, '..', 'glitch-GameServerJS');
const CLIENT = join(ROOT, '..', 'glitch-client', 'com', 'tinyspeck', 'engine');
const hasGsjs = existsSync(GSJS);
const hasClient = existsSync(CLIENT);
const gsjs = (p) => readFileSync(join(GSJS, p), 'utf8');
const client = (p) => readFileSync(join(CLIENT, p), 'utf8');

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(PUBLIC, 'assets/content'));
});

describe('G282: Flattery leftovers', () => {
  it('a song counts butterflies:sung_to and npc_butterfly:sing_to', () => {
    assert.deepEqual(worldVerbAchievementCounters('npc_butterfly', 'sing_to'), [
      { counter: 'npc_butterfly:sing_to', amount: 1 },
      { counter: 'butterflies:sung_to', amount: 1 },
    ]);
    assert.deepEqual(worldVerbAchievementCounters('npc_chicken', 'sing_to'), []);
  });

  it('the source counts the song where it succeeds', { skip: !hasGsjs && 'no GSJS' }, () => {
    const lines = gsjs('items/npc_butterfly.js').split('\n');
    assert.equal(lines[678].trim(), "pc.achievements_increment('butterflies', 'sung_to');");
    assert.match(gsjs('items/item.js'), /pc\.achievements_increment\(this\.class_tsid, verb\);/);
  });

  it('a chicken keeps no buttered flag; an old save loses it on the new day', () => {
    assert.equal('buttered' in createAnimalState('npc_chicken'), false);
    const old = createAnimalState('npc_chicken', { buttered: true });
    resetAnimalDay('npc_chicken', old);
    assert.equal('buttered' in old, false);
    assert.doesNotMatch(read('js/animals.js'), /\.buttered = |buttered: false/);
  });

  it('a trant harvest spends through loseEnergy, the gated loss', () => {
    const content = read('content.js');
    assert.match(content, /effects\.energy -= loseEnergy\(pc, result\.energyCost\);/);
    assert.doesNotMatch(content, /pc\.energy -= /);
  });

  it('skill packages lose energy through metabolics_lose_energy', { skip: !hasGsjs && 'no GSJS' }, () => {
    assert.match(gsjs('players/inc_skill_packages.js'), /actuals\['energy_cost'\] = this\.metabolics_lose_energy\(details\.energy_cost \* source_item\.getProp\('count'\)\);/);
  });
});

describe('G277: each Butterfly counts once per quest run', () => {
  for (const [quest, event, counter] of [
    ['animalkinship_milk_butterflies', 'npc_butterfly:milk', 'butterflies_milked'],
    ['animalkinship_massage_butterflies', 'npc_butterfly:massage', 'butterflies_massaged'],
  ]) {
    it(`${counter}: the same Butterfly twice is one, another is two`, () => {
      const qs = createQuestState();
      assert.equal(acceptOffer(qs, quest, { now: Date.now(), ignorePrereq: true }).ok, true);
      const go = (animal) => routeQuestEvent(qs, event, 1, { managedOnly: true, detail: animal ? { animal } : undefined });
      go('GA94:npc_butterfly:0');
      go('GA94:npc_butterfly:0');
      assert.equal(qs.active[quest].progress[counter], 1);
      go('GA94:npc_butterfly:1');
      assert.equal(qs.active[quest].progress[counter], 2);
      // An event with no animal (none today) still counts.
      go('');
      assert.equal(qs.active[quest].progress[counter], 3);
    });
  }

  it('the source keys the count by the Butterfly', { skip: !hasGsjs && 'no GSJS' }, () => {
    const src = gsjs('items/npc_butterfly.js');
    assert.ok(src.includes("if (!pc.butterflies_milked[this.tsid]){\n\t\t\t\t\tpc.butterflies_milked[this.tsid] = true;\n\t\t\t\t\tpc.quests_inc_counter('butterflies_milked', 1);"));
    assert.ok(src.includes("if (!pc.butterflies_massaged[this.tsid]){\n\t\t\t\tpc.butterflies_massaged[this.tsid] = true;\n\t\t\t\tpc.quests_inc_counter('butterflies_massaged', 1);"));
    assert.match(gsjs('quests/animalkinship_milk_butterflies.js'), /delete pc\.butterflies_milked;/);
  });

  it('game.js gives street Butterflies a key and passes it with the badge counters', () => {
    const game = read('game.js');
    assert.match(game, /animalKey: `\$\{currentStreetTsid\}:npc_butterfly:\$\{i\}`/);
    assert.match(game, /animalKey: `\$\{currentStreetTsid\}:npc_butterfly:\$\{flyIndex\}`/);
    assert.match(game, /achievementEvent\.amount,\n\s+pc,\n\s+verbDetail\n\s+\);/);
    assert.match(read('js/features/quest-offers-feature.js'), /onEvent\(counter, amount, engine, detail\) \{\n.*\n\s+const result = routeQuestEvent\(engine\.questState, counter, amount, \{ \.\.\.questContext\(engine\), detail \}\);/);
  });
});

describe('G277: timer buff icons for NPC classes', () => {
  it('a buff gets its stand-in icon when applied', () => {
    const state = createBuffState();
    const res = applyBuff(state, 'go_moloko_loco', null, 1000);
    assert.equal(res.ok, true);
    assert.equal(res.buff.sourceItem, 'milk_butterfly');
    assert.equal(applyBuff(state, 'get_a_rasher', null, 1000).buff.sourceItem, 'meat');
    // An item buff still shows its own item.
    assert.equal(applyBuff(state, 'high_jumper', null, 1000).buff.sourceItem, 'spinach');
  });

  it('every quest timer buff shows an icon that exists', () => {
    const buffs = JSON.parse(read('assets/content/buffs.json'));
    for (const { buff } of QUEST_TIMER_BUFFS) {
      const icon = BUFF_ICONS[buff] || buffs[buff]?.itemClass;
      if (!icon) continue; // no item_class: the client draws none (BuffUI.as setIcon 156-171)
      assert.ok(existsSync(join(PUBLIC, 'assets/sprites/icons', `${icon}.png`)), `${buff}: ${icon}`);
    }
  });
});

describe('G277: emergencies, Escape and plain confirms', () => {
  it('a waiting emergency is looked at every second', () => {
    assert.equal(EMERGENCY_RETRY_MS, 1000);
    assert.match(read('js/features/quest-offers-feature.js'), /if \(!offerOpen && waitingOffers\(engine\.questState\)\.some\(\(row\) => row\.emergency\)\) \{\n\s+nextOfferCheckAt = Math\.min\(nextOfferCheckAt, now \+ EMERGENCY_RETRY_MS\);/);
  });

  it('the client checks every second', { skip: !hasClient && 'no glitch-client' }, () => {
    assert.ok(client('port/QuestsDialog.as').includes('private var emergency_timer:Timer = new Timer(1000);'));
  });

  it('Escape reaches an open confirm before the Decorate / Cultivate bar', () => {
    const src = read('js/features/homes-feature.js');
    const guard = src.indexOf('if (engine.questDialogueOpen?.()) return;');
    const stop = src.indexOf('e.stopImmediatePropagation();', guard);
    assert.ok(guard > 0 && stop > guard && stop - guard < 80);
  });

  it('the client confirm answers Escape with its escape_value', { skip: !hasClient && 'no glitch-client' }, () => {
    const dlg = client('port/ConfirmationDialog.as');
    assert.ok(dlg.includes('override protected function closeFromUserInput(e:Event=null):void {'));
    assert.ok(dlg.includes('submitValue(cdVO.escape_value);'));
  });

  it('only real quest offers use the quest card', () => {
    // home-tower's Magic Rock Tower quest stays an offer; its remove confirm is a prompt.
    assert.equal((read('js/features/home-tower-feature.js').match(/offerQuestDialogue/g) || []).length, 1);
    assert.match(read('js/features/home-tower-feature.js'), /engine\.prompt\(\{\n\s+modal: true,\n\s+title: 'Please Confirm!'/);
    assert.equal((read('js/features/street-furniture-feature.js').match(/offerQuestDialogue/g) || []).length, 0);
    assert.equal((read('js/features/foxes-feature.js').match(/offerQuestDialogue/g) || []).length, 0);
    // Quest offers by NPCs keep it.
    for (const f of ['juju-bandits-feature.js', 'gwendolyn-room-23-feature.js', 'vendor-npcs-feature.js']) {
      assert.match(read(`js/features/${f}`), /engine\.offerQuestDialogue\(\{\n\s+title: card\.def\.title,/, f);
    }
  });

  it('the source asks with a prompt and talks with conversations', { skip: !hasGsjs && 'no GSJS' }, () => {
    const tower = gsjs('items/proto_furniture_tower_chassis.js');
    assert.ok(tower.includes("pc.prompts_add({\n\t\t\t\ttitle\t\t\t: 'Please Confirm!',"));
    assert.ok(tower.includes("{ value : 'cancel', label : 'Nevermind' }"));
    const stone = gsjs('items/visiting_stone.js');
    assert.equal((stone.match(/this\.conversation_start\(pc, /g) || []).length, 3);
    assert.doesNotMatch(stone, /quests_offer|offer_quest/);
    assert.ok((gsjs('items/npc_fox_ranger.js').match(/this\.conversation_start\(pc, /g) || []).length >= 8);
  });
});

describe('G261: Rainbow Run coins are class rainbow run', () => {
  it('the class is a mood quoin worth 1, back in 15 s', () => {
    assert.equal(COIN_CLASS, 'rainbow run');
    assert.equal(COIN_TYPE, QUOIN_CLASSES[COIN_CLASS].type);
    assert.equal(quoinClassAmount(COIN_CLASS, 'mood'), 1);
    assert.equal(quoinRespawnMs(COIN_CLASS), 15_000);
    assert.equal(COIN_BACK_MS, 15_000);
  });

  it('the source spawns them with that class', { skip: !hasGsjs && 'no GSJS' }, () => {
    const lines = gsjs('items/spawner_moving_quoin.js').split('\n');
    assert.equal(lines[188].trim(), 'stack.setInstanceProp("class_name", "rainbow run");');
    const quoin = gsjs('items/quoin.js');
    assert.ok(quoin.includes("case 'rainbow run':\n\t\t\tthis.instanceProps.respawn_time = 15;\n\t\t\tthis.instanceProps.is_random = \"0\";\n\t\t\tthis.instanceProps.benefit = \"1\";\n\t\t\tthis.instanceProps.type = 'mood';"));
    assert.match(quoin, /!this\.container\.isInstance\('rainbow_run'\) && !this\.container\.isParadiseLocation\(\) && this\.instanceProps\.type != 'qurazy' && pc\.stats\.quoins_today\.value >= pc\.stats\.quoins_today\.top\) return;/);
  });

  describe('a grab pays the class outside the limit and the coin comes back', () => {
    const realNow = Date.now;
    let t = 1_000_000;
    before(() => { Date.now = () => t; });
    after(() => { Date.now = realNow; });

    it('runs', () => {
      const calls = [];
      const spr = { visible: true, y: 300, destroyed: false };
      const ctx = {
        player: { x: 500, y: 330 },
        data: { phase: 'running', endsAt: t + 30_000, got: 0, coins: [{ x: 500, y: 300, spr, taken: false }] },
        collectQuoin: (...args) => calls.push(args),
        progress: () => {},
      };
      rainbowRoom.tick(ctx);
      assert.deepEqual(calls, [['mood', 500, 300, { className: 'rainbow run', ignoreLimit: true }]]);
      assert.equal(spr.visible, false);
      t += COIN_BACK_MS - 1;
      ctx.player.x = 0;
      rainbowRoom.tick(ctx);
      assert.equal(spr.visible, false, 'not back yet');
      t += 1;
      rainbowRoom.tick(ctx);
      assert.equal(spr.visible, true, 'back after 15 s');
      ctx.player.x = 500;
      rainbowRoom.tick(ctx);
      assert.equal(calls.length, 2);
      assert.equal(ctx.data.got, 2);
    });
  });
});
