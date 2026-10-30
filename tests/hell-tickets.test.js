/**
 * Diabolical Drink Tickets and the Beelzebooze chain, solo (register row G163):
 * js/hell-tickets.js, features/hell-tickets-feature.js, and the quest events
 * hell-feature and hell-bar-feature now send.
 */
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentCatalogsFromDir, resetContentCatalogs, getQuestCatalog } from '../public/js/content-catalogs.js?v=g403-1';
import { createQuestState } from '../public/js/quests.js';
import { classifyQuests, eventCounters, isEventEmitted, questRoutingReport, requirementRoute } from '../public/js/quest-offers.js?v=g403-1';
import { HELL_LOCATION, HELL_QUESTS, createHellState, croak } from '../public/js/hell.js';
import { PANKA_TSID, HELL_BAR_TSID } from '../public/js/hell-bar.js';
import {
  GRAVE_VISIT,
  GRAVE_VISITORS,
  HELL_HOLE_ACCEPTED_TEXT,
  HELL_TICKET_EVENTS,
  chainOfferDue,
  graveVisitDue,
  hellQuestAcceptedText,
  holeHintDue,
  normalizeHellTicketsState,
  planGraveVisit,
  recognitionBranch,
  ticketDue,
} from '../public/js/hell-tickets.js';
import { hellTicketsFeature } from '../public/js/features/hell-tickets-feature.js?v=g463-2';
import { hellFeature } from '../public/js/features/hell-feature.js?v=hell-16';
import { hellBarFeature } from '../public/js/features/hell-bar-feature.js?v=g464-2';
import { questOffersFeature } from '../public/js/features/quest-offers-feature.js?v=g425-1';
import { questFlagsFeature } from '../public/js/features/quest-flags-feature.js?v=flags-1';
import { FEATURES } from '../public/js/features/index.js?v=registry-327';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(spike, 'public/assets/content');
const gsjs = join(spike, '../glitch-GameServerJS');
const hasGsjs = existsSync(gsjs);
const src = (rel) => readFileSync(join(gsjs, rel), 'utf8');
const HELL_ONE = HELL_LOCATION.tsid;
const MAHATAM = HELL_LOCATION.hellHole.destinationTsid;
const T0 = Date.UTC(2026, 9, 20, 15, 0, 0);

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(CONTENT);
});

const seq = (...values) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

describe('grave visits (the solo stand-in for other players)', () => {
  it('one croak in three, 20 to 50 s later, by a named companion', () => {
    assert.equal(GRAVE_VISIT.chance, 1 / 3);
    assert.deepEqual(GRAVE_VISITORS, ['Amp', 'Bumbishfish', 'Lily Linguistic']);
    assert.equal(planGraveVisit({ visitId: 1, now: T0, rng: seq(0.34) }), null, 'a miss');
    const hit = planGraveVisit({ visitId: 1, now: T0, rng: seq(0.1, 0, 0.2, 0.9) });
    assert.deepEqual(hit, { visitId: 1, at: T0 + 20_000, type: 'mourn', recognizer: 'Lily Linguistic' });
    const late = planGraveVisit({ visitId: 2, now: T0, rng: seq(0.1, 0.999, 0.7, 0.4) });
    assert.equal(late.type, 'celebrate');
    assert.ok(late.at - T0 <= GRAVE_VISIT.maxDelayMs && late.at - T0 > 49_000);
    // Over many croaks the rate stays near a third.
    let n = 0;
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 3000; i += 1) if (planGraveVisit({ visitId: i, rng })) n += 1;
    assert.ok(n > 850 && n < 1150, `${n} visits in 3000 croaks`);
  });

  it('QA forces a visit with a chosen delay, type and companion', () => {
    const v = planGraveVisit({ visitId: 4, now: T0, rng: seq(0.99), force: true, delayMs: 3000, type: 'celebrate', recognizer: 'Amp' });
    assert.deepEqual(v, { visitId: 4, at: T0 + 3000, type: 'celebrate', recognizer: 'Amp' });
  });

  it('lands only while the grave stands: dropped by resurrection, a new croak or an earlier recognition', () => {
    const dead = croak(createHellState(), { streetTsid: 'GLI2V0UN7RD1T2J', x: 100, y: 200, now: T0 }).state;
    const visit = { visitId: dead.visitId, at: T0 + 20_000, type: 'mourn', recognizer: 'Amp' };
    assert.equal(graveVisitDue(null, dead, T0), 'none');
    assert.equal(graveVisitDue(visit, dead, T0 + 1000), 'wait');
    assert.equal(graveVisitDue(visit, dead, T0 + 20_000), 'fire');
    assert.equal(graveVisitDue(visit, dead, T0 + 20_000, { inHell: false }), 'wait', 'still loading into Hell One');
    assert.equal(graveVisitDue(visit, createHellState(), T0 + 20_000), 'drop');
    assert.equal(graveVisitDue({ ...visit, visitId: visit.visitId + 1 }, dead, T0 + 20_000), 'drop');
    assert.equal(graveVisitDue(visit, { ...dead, graveMarker: { ...dead.graveMarker, state: 'mourn' } }, T0 + 20_000), 'drop');
  });

  it('saves and sanitizes its slice', () => {
    const s = normalizeHellTicketsState({ plannedVisitId: 3.7, visit: { visitId: 3, at: T0, type: 'mourn', recognizer: 'Nobody' }, visits: -2, ticketGiven: 'yes' });
    assert.deepEqual(s, { version: 1, plannedVisitId: 3, visit: { visitId: 3, at: T0, type: 'mourn', recognizer: 'Amp' }, visits: 0, ticketGiven: false, holeHinted: false, chainOffered: false });
    assert.equal(normalizeHellTicketsState({ visit: { at: T0, type: 'dance' } }).visit, null);
  });
});

describe('the quest rules around the visit', () => {
  it('hell_hole onComplete_custom offers hell_quest, only while dead and only once', () => {
    const qs = { active: {}, completed: ['hell_hole'], offers: { offered: {}, declined: {} } };
    assert.equal(chainOfferDue(qs, {}, { dead: true }), 'hell_quest');
    assert.equal(chainOfferDue(qs, {}, { dead: false }), null, 'the Magic Rock delivers it to the living');
    assert.equal(chainOfferDue(qs, { chainOffered: true }, { dead: true }), null);
    assert.equal(chainOfferDue({ ...qs, active: { hell_quest: {} } }, {}, { dead: true }), null);
    assert.equal(chainOfferDue({ ...qs, offers: { declined: { hell_quest: 1 } } }, {}, { dead: true }), null);
    assert.equal(chainOfferDue({ active: {}, completed: [] }, {}, { dead: true }), null);
  });

  it('hell_quest onAccepted hands over one ticket per run; hell_hole onAccepted hints in Hell One', () => {
    const qs = { active: { hell_quest: {}, hell_hole: {} }, completed: [] };
    assert.equal(ticketDue(qs, {}), true);
    assert.equal(ticketDue(qs, { ticketGiven: true }), false);
    assert.equal(ticketDue({ active: {}, completed: ['hell_quest'] }, {}), false);
    assert.equal(holeHintDue(qs, {}, { inHellOne: true }), true);
    assert.equal(holeHintDue(qs, {}, { inHellOne: false }), false);
    assert.equal(holeHintDue(qs, { holeHinted: true }, { inHellOne: true }), false);
  });

  it('keeps the source text', { skip: !hasGsjs && 'GSJS checkout not beside this worktree' }, () => {
    const quest = src('quests/hell_quest.js');
    assert.ok(quest.includes(`activityText = "${hellQuestAcceptedText(false)}";`));
    assert.ok(quest.includes(`activityText = "${hellQuestAcceptedText(true)}";`));
    assert.ok(src('quests/hell_hole.js').includes(`<span class="nuxp_vog_smallest">${HELL_HOLE_ACCEPTED_TEXT}</span>`));
    const player = src('players/player.js');
    assert.match(player, /activityText \+= recognizer\.label\+" has mourned your passing";/);
    assert.match(player, /activityText \+= ", you received a drink ticket for Wine of the Dead\.";/);
    assert.match(src('items/hell_bartender.js'), /pc\.quests_set_flag\('buy_wotd'\);/);
    assert.match(src('items/wine_of_the_dead.js'), /pc\.quests_set_flag\('drink_wotd'\);/);
  });

  it('routes the three flags to events the game now sends', () => {
    const cat = getQuestCatalog();
    const reqs = [...cat.hell_hole.requirements, ...cat.hell_quest.requirements];
    assert.deepEqual(reqs.map((r) => [r.name, requirementRoute(r).event, requirementRoute(r).emitted]), [
      ['jump_hell_hole', HELL_TICKET_EVENTS.jump, true],
      ['buy_wotd', HELL_TICKET_EVENTS.buy, true],
      ['drink_wotd', HELL_TICKET_EVENTS.drink, true],
    ]);
    assert.ok(isEventEmitted('hell_hole_jumped'));
    assert.ok(eventCounters(HELL_TICKET_EVENTS.drink).some((c) => c.counter === 'drink_wotd'));
    assert.equal(questRoutingReport().unemitted.hell, undefined, 'nothing in hell is left unemitted');
    const solo = new Set(classifyQuests(cat).solo.map((r) => r.classTsid));
    assert.ok(solo.has('hell_hole') && solo.has('hell_quest'), 'both count as playable');
    assert.deepEqual(cat.hell_quest.rewards, HELL_QUESTS.hell_quest.rewards);
  });

  it("the Hell Hole is reachable: the gap's rims sit at rimY, the depth the old check waited for never came", () => {
    const street = JSON.parse(readFileSync(join(spike, 'public/assets/streets', `${HELL_ONE}.json`), 'utf8'));
    const { l, t } = street.bounds;
    const h = HELL_LOCATION.hellHole;
    const left = street.platforms.find((p) => Math.max(p.x1, p.x2) === h.sourceX1);
    const right = street.platforms.find((p) => Math.min(p.x1, p.x2) === h.sourceX2);
    assert.ok(left && right, 'one floor ends at the gap, the next starts after it');
    assert.equal(h.rimY, Math.min(left.y2, right.y1) - t);
    assert.equal(h.x1, h.sourceX1 - l);
    // game.js resolveGround bridges a plain gap at the lowest floor, never below it.
    const lowest = Math.max(...street.platforms.flatMap((p) => [p.y1, p.y2])) - t;
    assert.ok(lowest >= h.rimY - 2 && lowest < HELL_LOCATION.spawns[0].groundY + 260);
  });

  it('names the three recognizeDeath branches', () => {
    assert.equal(recognitionBranch({ ok: true, offer: 'hell_hole' }), 'hell_hole');
    assert.equal(recognitionBranch({ ok: true, offer: null }), 'ticket');
    assert.equal(recognitionBranch({ ok: false, reason: 'no_grave' }), 'no_grave');
  });
});

/* ------------------------------------------------------------------ */
/* The whole chain through the real features                           */
/* ------------------------------------------------------------------ */

function fakeEngine(params = {}) {
  const data = {};
  const log = { offers: [], prompts: [], awards: [], toasts: [], activity: [], dialogues: [], entered: [] };
  const engine = {
    started: true,
    pc: { level: 5, xp: 1000, currants: 100, energy: 50, energyMax: 100, mood: 50, moodMax: 100 },
    inv: {},
    questState: createQuestState(),
    learnedSkills: [],
    unlockedAchievements: [],
    shrineState: { emblems: {} },
    streetTsid: HELL_ONE,
    street: { tsid: HELL_ONE, hubId: '40', label: 'Hell One', bounds: { l: 0, t: 0 } },
    player: { x: 300, y: 500, vx: 0, vy: 0 },
    interactables: [],
    log,
    data,
    param: (k) => (k in params ? String(params[k]) : null),
    setData: (k, v) => { data[k] = v; },
    activeBuffIds: () => [],
    busy: () => false,
    questDialogueOpen: () => log.open === true,
    questCustomPrereq: () => false,
    playSound() {},
    save() {},
    updateHud() {},
    refreshPack() {},
    snapCamera() {},
    stopFollowing() {},
    hasBuff: () => false,
    removeBuff() {},
    say() {},
    homeContext: () => ({ inHome: false }),
    transientInstance: () => false,
    toast: (t) => log.toasts.push(t),
    pushActivity: (t) => log.activity.push(t),
    award: (p) => log.awards.push(p),
    prompt: (p) => log.prompts.push(p),
    questFlag: (f) => questFlagsFeature.set(f),
    // game.js: every badge counter reaches features' onEvent.
    achievement: (counter, n = 1) => questOffersFeature.onEvent(counter, n, engine),
    offerQuestDialogue: (opts) => { log.open = true; log.offers.push(opts); },
    scriptedDialogue: (opts) => log.dialogues.push(opts),
    enter: (tsid, opts) => { log.entered.push(tsid); engine.streetTsid = tsid; engine.street = { ...engine.street, tsid, hubId: tsid === HELL_ONE || tsid === MAHATAM || tsid === HELL_BAR_TSID || tsid === PANKA_TSID ? '40' : '' }; return Promise.resolve(opts); },
  };
  return engine;
}

function accept(engine) {
  const offer = engine.log.offers.at(-1);
  engine.log.open = false;
  offer.onAccept();
  return offer;
}

function deadIn(tsid) {
  return croak(createHellState(), { streetTsid: 'GLI2V0UN7RD1T2J', x: 100, y: 200, now: Date.now() }).state;
}

describe('the chain in play (features, fake engine)', () => {
  beforeEach(() => {
    hellTicketsFeature._reset();
    hellTicketsFeature.restore({});
    questFlagsFeature.restore({});
    hellFeature.restore({});
  });

  it('is registered after hell, hell-bar and quest-offers', () => {
    const ids = FEATURES.map((f) => f.id);
    assert.ok(ids.includes('hell-tickets'));
    for (const id of ['hell', 'hell-bar', 'quest-offers']) assert.ok(ids.indexOf(id) < ids.indexOf('hell-tickets'), id);
  });

  it('a random visit never fires on someone else\'s QA route', () => {
    const engine = fakeEngine();
    const prev = globalThis.location;
    globalThis.location = { search: '?helldemo=squish&hellautoplay=1' };
    try {
      hellTicketsFeature.init(engine);
      hellFeature.restore(deadIn(HELL_ONE));
      hellTicketsFeature.onTick(16, Date.now(), engine);
      assert.equal(hellTicketsFeature._state().visit, null);
      assert.equal(hellTicketsFeature._state().plannedVisitId, hellFeature._state().visitId, 'rolled once, quietly');
    } finally {
      globalThis.location = prev;
    }
  });

  it('mourned in Hell One: hell_hole, the jump, Beelzebooze, the ticket, the wine, the drink, the rewards', async () => {
    const engine = fakeEngine({ gravedemo: 'mourn', gravevisitms: 0, gravecompanion: 'Bumbishfish' });
    hellTicketsFeature.init(engine);
    questOffersFeature.init(engine);
    hellFeature.restore(deadIn(HELL_ONE));
    const now = Date.now();
    hellTicketsFeature.onTick(16, now, engine); // roll (forced, no delay) and the visit
    assert.equal(hellTicketsFeature._state().visit, null);
    assert.equal(hellTicketsFeature._state().visits, 1);
    assert.equal(engine.data.hellTicketBranch, 'hell_hole');
    assert.equal(hellFeature._state().graveMarker.state, 'mourn');
    const holeOffer = accept(engine);
    assert.equal(holeOffer.title, "It's Better in a Hell Hole");
    assert.equal(holeOffer.kicker, 'Magic Rock');
    assert.match(holeOffer.beats[0].text, /^Woah! Did you feel that\?.*Bumbishfish just mourned your death at your gravestone\.$/);
    assert.deepEqual(holeOffer.beats.map((b) => b.response).slice(0, 2), ['Really?', 'I guess not.']);
    assert.ok(engine.questState.active.hell_hole);
    assert.equal(countOf(engine, 'drink_ticket'), 0, 'no ticket on this branch: Beelzebooze brings it');
    hellTicketsFeature.onTick(16, now + 20, engine);
    assert.deepEqual(engine.log.toasts, ['Make your way to the Hell Hole.']);

    // Down the hole: arriving in Mahatam Audarika sends hell_hole_jumped.
    engine.enter(MAHATAM);
    hellFeature.onStreetEnter({ tsid: MAHATAM, hubId: '40' }, { ...engineForStreet(engine), achievement: engine.achievement });
    assert.ok(engine.questState.completed.includes('hell_hole'));
    assert.equal(engine.log.awards.at(-1).title, "It's Better in a Hell Hole");

    // onComplete_custom: the Magic Rock offers Beelzebooze to the dead.
    hellTicketsFeature.onTick(16, now + 30, engine);
    const questOffer = accept(engine);
    assert.equal(questOffer.title, 'Beelzebooze');
    assert.equal(questOffer.acceptLabel, 'Thanks!');
    assert.equal(questOffer.beats[0].response, 'Thanks... I think?');
    // onAccepted: one ticket and the source prompt.
    hellTicketsFeature.onTick(16, now + 40, engine);
    hellTicketsFeature.onTick(16, now + 50, engine);
    assert.equal(countOf(engine, 'drink_ticket'), 1);
    assert.equal(engine.log.prompts.at(-1).text, 'You received a drink ticket for Wine of the Dead and your map has been updated with the route to the Hell Bar.');
    hellTicketsFeature.onTick(16, now + 60, engine);
    assert.equal(countOf(engine, 'drink_ticket'), 1, 'once');

    // The Hell Bar: Buy wine runs the first-purchase conversation, then grantWine.
    engine.enter(HELL_BAR_TSID);
    hellBarFeature.runVerb({ classId: 'hell_bartender' }, 'buy_wine', engine);
    engine.log.dialogues.at(-1).onComplete();
    assert.equal(countOf(engine, 'drink_ticket'), 0);
    assert.equal(countOf(engine, 'wine_of_the_dead'), 1);
    assert.equal(engine.questState.active.hell_quest.progress.buy_wotd, 1);
    assert.equal(engine.questState.active.hell_quest.progress.drink_wotd, 0);

    // The dead are not Pooped after a first croak, so they cannot drink it yet.
    assert.equal(hellFeature.packVerbs('wine_of_the_dead')[0].enabled, false);
    hellFeature.restore({});
    engine.enter('GLI2V0UN7RD1T2J');
    const xp = engine.pc.xp;
    const currants = engine.pc.currants;
    hellFeature.runPackVerb('wine_of_the_dead', 'drink', engine);
    assert.equal(hellFeature.isDead(), true, 'the living croak');
    // G177: the drink_wotd event waits for the croak's street entry (its loading card) to finish.
    assert.ok(!engine.questState.completed.includes('hell_quest'), 'not before Hell One has loaded');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(engine.questState.completed.includes('hell_quest'));
    assert.equal(engine.log.awards.at(-1).title, 'Beelzebooze');
    assert.equal(engine.pc.xp - xp, 250);
    assert.equal(engine.pc.currants - currants, 150);
    assert.equal(countOf(engine, 'wine_of_the_dead'), 0);
  });

  it('celebrated elsewhere in Naraka: Beelzebooze straight away', () => {
    const engine = fakeEngine({ gravedemo: 'celebrate', gravevisitms: 0, gravecompanion: 'Amp' });
    hellTicketsFeature.init(engine);
    hellFeature.restore(deadIn(MAHATAM));
    engine.enter(MAHATAM);
    const now = Date.now();
    hellTicketsFeature.onTick(16, now, engine);
    hellTicketsFeature.onTick(16, now + 10, engine);
    assert.equal(engine.data.hellTicketBranch, 'hell_quest');
    assert.equal(accept(engine).title, 'Beelzebooze');
    hellTicketsFeature.onTick(16, now + 20, engine);
    assert.equal(countOf(engine, 'drink_ticket'), 1);
  });

  it('with both quests done: a ticket and the recognition prompt', () => {
    const engine = fakeEngine({ gravedemo: 'mourn', gravevisitms: 0, gravecompanion: 'Lily Linguistic', gravedone: 1 });
    hellTicketsFeature.init(engine);
    hellFeature.restore(deadIn(HELL_ONE));
    const now = Date.now();
    hellTicketsFeature.onTick(16, now, engine);
    hellTicketsFeature.onTick(16, now + 10, engine);
    assert.equal(engine.data.hellTicketBranch, 'ticket');
    assert.equal(engine.log.offers.length, 0);
    assert.equal(countOf(engine, 'drink_ticket'), 1);
    hellTicketsFeature.onTick(16, now + 20, engine);
    assert.equal(engine.log.prompts.at(-1).text, 'Lily Linguistic has mourned your passing, you received a drink ticket for Wine of the Dead.');
    // G230: text only (player.js 1467-1472 sends no title), no "Naraka" kicker.
    assert.deepEqual(Object.keys(engine.log.prompts.at(-1)), ['text']);
  });

  it('G255: the offer has one button (no onStarted), is an emergency, and shows again if closed unanswered', () => {
    const engine = fakeEngine({ gravedemo: 'mourn', gravevisitms: 0 });
    hellTicketsFeature.init(engine);
    hellFeature.restore(deadIn(HELL_ONE));
    const now = Date.now();
    hellTicketsFeature.onTick(16, now, engine);
    hellTicketsFeature.onTick(16, now + 10, engine);
    const card = engine.log.offers.at(-1);
    // quest.js get_status 1119-1124: a quest with no onStarted gets only accept.
    assert.equal(card.declinable, false);
    assert.equal(card.onDecline, undefined);
    assert.equal(card.declineLabel, undefined);
    // hell_hole.js 12 is_emergency: rays, no X, Escape does nothing (game.js closeQuestDialogue).
    assert.equal(card.urgent, true);
    // Closed by force (another dialog took the screen): QuestsDialog.as onEmergencyTick 335-360.
    engine.log.open = false;
    hellTicketsFeature.onTick(16, now + 20, engine);
    assert.equal(engine.data.hellTicketOfferResult, 'waiting');
    assert.ok(engine.questState.offers.offered.hell_hole);
    assert.equal(engine.questState.offers.declined?.hell_hole, undefined);
    hellTicketsFeature.onTick(16, now + 30, engine);
    assert.equal(engine.log.offers.length, 2, 'shown again');
    assert.equal(engine.log.offers.at(-1).title, card.title);
    assert.deepEqual(engine.log.offers.at(-1).beats, card.beats, 'with the mourner\'s own text');
    accept(engine);
    assert.ok(engine.questState.active.hell_hole);
  });
});

function countOf(engine, id) {
  return Number(engine.inv[id]) || 0;
}

/** hell-feature's onStreetEnter needs a few drawing hooks; grapes and graves are not drawn here. */
function engineForStreet(engine) {
  return {
    ...engine,
    PIXI: null,
    entityLayer: { addChild() {} },
    register: (t) => t,
    param: () => null,
    setData() {},
  };
}
