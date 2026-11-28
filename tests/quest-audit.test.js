/**
 * The quest audit (Austin 2026-11-25, after #671 Sparkly of Interest: "Are there other quests with
 * status broken like this mining quest? If so we find and fix them now"). tools/quests/audit.mjs
 * checks every requirement of every quest a player can be offered or given: fed (something sends
 * it), visible (the row moves with the first unit), possible (what it needs exists and can be got),
 * pays (fed as its routes say, it turns in with its rewards), words (no placeholder or raw id),
 * offered (its chain and gate open) and online (no solo-only feeder). This test fails on any finding
 * not allowed below with its reason, so the class (R53, R35) cannot come back.
 *
 * Found and fixed by the sweep:
 *  - Respect for the Beginnings (donate_to_all_shrines) was never offered: its trigger (a
 *    shrine_donation event) is one the familiar's context never carries. GSJS offers it on a
 *    donation made without it (include/shrines.js 573-592, offerGiantQuest 1262-1265). The street
 *    spirits' first talks and the Last Pilgrimage of Esquibeth wait on it, so those never came either.
 *  - Aranna Scramble's milk row counted only while a milk quest it comes after was under way.
 * Run: node --test tests/quest-audit.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditQuests } from '../tools/quests/audit.mjs';
import { createQuestState } from '../public/js/quests.js?v=f574d2e1';
import { acceptOffer, offerOnShrineDonation, putOffOffer, questStatus, routeQuestEvent, waitingOffers, GIANT_QUEST } from '../public/js/quest-offers.js?v=cec1b5e9';
import { questOffersFeature } from '../public/js/features/quest-offers-feature.js?v=e1da24cc';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../public');

/**
 * Findings the audit makes that are right as they stand. key: '<check> <quest> <requirement id>'.
 * One-shot flags: the step names a number, but the flag is one act that reaches it, set at once in
 * GSJS too (the row reads 0/1, then done).
 */
const ALLOWED = Object.freeze({
  'b betterlearning_get_favor_at_shrines r280': 'Counts Giants (0/5), each once 23 favor is donated to it that day: inc_quests.js 1358-1371 betterlearning_favor_add; kept as Glitch had it (lane questk, #671)',
  'b betterlearning_spend_favor_with_primary_giant r281': 'One spend of 997 favor: include/shrines.js 56 quests_set_flag',
  'b betterlearning_spend_huge_favor r282': 'One spend of 1511 favor at once: include/shrines.js 59 quests_set_flag',
  'b focusedmeditation_get_mood_or_energy r160': 'One focus that gains 24: focusing_orb.js 828, 836 quests_set_flag',
  'b meditativearts_get_max_relax r171': 'One meditation that gains 50 mood: focusing_orb.js 837, 977 quests_set_flag',
  'b smelting_smelt_metal_rock_to_plain_metal r254': 'One smelt of 100 rocks (20 ingots): smelter.js 571 quests_set_flag',
  'b tinkering_repair_for_time_period r181': 'One 15-second repair: tinkertool.js 371 quests_set_flag',
  'b transcendentalradiation_radiate_to_five_people r175': 'Online: one radiance that reaches 5 players: focusing_orb.js 1139, 1299 quests_set_flag',
  'b teleportation_teleport_with_followers r335': 'Online: one teleport with 3 followers: inc_teleportation.js 1055 quests_set_flag',
  'b meditative_arts_with_friends r438': 'Online: one meditation with 10 others (the count is ours, quests-mp.js MEDITATE_TOGETHER_HINT)',
});

/** Quests held back until a road opens (tests/quest-reach.test.js names the same six). */
const HELD_BACK = ['purple_journey_north', 'sparkly_of_interest_1', 'sparkly_of_interest_2', 'sparkly_of_interest_3', 'sparkly_of_interest_4', 'tend_to_your_community'];

/**
 * Quests nothing hands out, so nobody can hold one. Each is a call recorded in the report and the
 * register, not a stuck player.
 */
const NEVER_OFFERED = Object.freeze({
  spice_must_flow: 'GSJS never offered it either: no setAvailableQuests names it (street_spirit_groddle.js 1295-1303), and nothing sets go_to_eastwest_spice',
  rannacramble: 'Its offer trigger (inferred: in Aranna after master_milker) needs a region the offer context never carries; GSJS offered it nowhere',
  treasure_map_1: 'Offered on using a Treasure Map, an item never finished in the original (Item Catalog unbuilt_original)',
});

let result;
before(async () => {
  result = await auditQuests();
});

describe('the quest audit', () => {
  it('checks every quest a player can be offered or given', () => {
    assert.equal(result.total, 446, 'quests.json and our Tunes for Crabs');
    assert.ok(result.checked.length >= 200, `${result.checked.length} checked`);
    assert.deepEqual(Object.keys(result.heldBack).sort(), HELD_BACK);
  });

  it('finds no unfed, invisible, impossible or unpaid requirement, no placeholder and no closed chain', () => {
    const key = (f) => `${f.check} ${f.quest}${f.req ? ` ${f.req}` : ''}`;
    const bad = result.findings.filter((f) => !ALLOWED[key(f)]).map((f) => `${key(f)}: ${f.what}`);
    assert.deepEqual(bad, []);
    const seen = new Set(result.findings.map(key));
    assert.deepEqual(Object.keys(ALLOWED).filter((k) => !seen.has(k)), [], 'an allowed row the audit no longer makes');
  });

  it('lists the quests nothing hands out, each with its reason', () => {
    assert.deepEqual(Object.keys(result.neverOffered).sort(), Object.keys(NEVER_OFFERED).sort());
  });
});

describe('Respect for the Beginnings is offered on a first shrine donation', () => {
  it('a donation offers it once, waiting in the log; not again once offered, put off or done', () => {
    const qs = createQuestState();
    assert.equal(questStatus(qs, GIANT_QUEST), 'none');
    assert.equal(offerOnShrineDonation(qs, 'vendor_bought:bag_generic', 5), null);
    assert.equal(offerOnShrineDonation(qs, 'shrines_donated:alph', 5), GIANT_QUEST);
    assert.equal(questStatus(qs, GIANT_QUEST), 'offered');
    assert.deepEqual(waitingOffers(qs).map((r) => r.classTsid), [GIANT_QUEST]);
    assert.equal(offerOnShrineDonation(qs, 'shrines_donated:cosma', 6), null, 'already offered');
    const done = createQuestState();
    done.completed.push(GIANT_QUEST);
    assert.equal(offerOnShrineDonation(done, 'shrines_donated:alph', 5), null, 'already done');
    assert.equal(putOffOffer(qs, GIANT_QUEST, 7).ok, false, 'not a startable quest: it stays offered');
  });

  it('the game sends the donation to the offer engine (quest-offers-feature onEvent), and accepted it counts each Giant', () => {
    const data = {};
    const dialogs = [];
    const engine = {
      started: true,
      dialogOpen: false,
      pc: { level: 2, xp: 0, energy: 50, mood: 50, imagination: 0, currants: 0, giantFavor: {} },
      inv: {},
      learnedSkills: [],
      unlockedAchievements: [],
      shrineState: {},
      questState: createQuestState(),
      street: { tsid: 'GLI2V0UN7RD1T2J', hubId: '56', label: 'Hechey Track' },
      streetTsid: 'GLI2V0UN7RD1T2J',
      param: () => null,
      activeBuffIds: () => [],
      streetCardUp: () => false,
      screenFxScreenUp: () => false,
      busy: () => false,
      questOffersHeld: () => false,
      questDialogueOpen() { return this.dialogOpen; },
      offerQuestDialogue(opts) { this.dialogOpen = true; dialogs.push(opts); },
      setData: (k, v) => { data[k] = v; },
      updateHud() {},
      refreshPack() {},
      save() {},
      pushActivity() {},
      award() {},
      playSound() {},
    };
    questOffersFeature.init(engine);
    questOffersFeature.onEvent('shrines_donated:alph', 1, engine);
    assert.equal(questStatus(engine.questState, GIANT_QUEST), 'offered');
    assert.equal(data.questOffer, GIANT_QUEST);
    // An emergency (donate_to_all_shrines.js is_emergency 1): it pops on the street at the next check.
    assert.equal(waitingOffers(engine.questState)[0].emergency, true);
    questOffersFeature.onTick(16, Date.now() + 2_000, engine);
    assert.deepEqual(dialogs.map((d) => d.title), ['Respect for the Beginnings']);
    assert.equal(acceptOffer(engine.questState, GIANT_QUEST, { now: 1 }).ok, true);
    routeQuestEvent(engine.questState, 'shrines_donated:alph', 1);
    assert.equal(engine.questState.active[GIANT_QUEST].progress.shrine_donated_alph, 1);
    // game.js doShrineDonation sends shrines_donated:<giant> on every donation, solo and online.
    const game = readFileSync(join(PUBLIC, 'game.js'), 'utf8');
    assert.match(game, /applyAchievementProgress\(achieveState, `shrines_donated:\$\{giantId\}`, 1, pc\)/);
  });
});

describe('Aranna Scramble\'s milk row counts on its own', () => {
  it('milking 11 butterflies finishes the row with both milk quests long done', () => {
    const qs = createQuestState();
    qs.completed.push('animalkinship_massage_butterflies', 'animalkinship_milk_butterflies', 'master_milker');
    assert.equal(acceptOffer(qs, 'rannacramble', { now: 1 }).ok, true);
    for (let i = 0; i < 11; i++) routeQuestEvent(qs, 'npc_butterfly:milk', 1, { detail: { animal: `b${i}` } });
    routeQuestEvent(qs, 'npc_butterfly:milk', 1, { detail: { animal: 'b0' } });
    assert.equal(qs.active.rannacramble.progress.butterflies_milked, 11, 'each butterfly once (npc_butterfly.js 1286-1291)');
  });
});
