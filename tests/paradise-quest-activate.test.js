/**
 * Report #126: "Up up and away!" (quests/fly_paradise.js 25-44) waits on VERB:<ticket>:activate flags,
 * and activating a ticket never said so. A real activation counts once; the QA ?paradise= entry does
 * not; a course already visited counts for a player who holds the quest (a small kindness beyond the
 * original: paradiseState.visits is saved).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadContentCatalogsFromDir, resetContentCatalogs, getQuestCatalog } from '../public/js/content-catalogs.js?v=10b118dd';
import { createQuestState } from '../public/js/quests.js?v=2951073f';
import { acceptOffer, ensureQuestOfferState, paradiseVisitCredits, requirementRoute, routeQuestEvent } from '../public/js/quest-offers.js?v=ecd7c1d7';
import { PARADISE_COURSES, activateParadiseTicket, createParadiseState, normalizeParadiseState } from '../public/js/paradise-flight.js?v=0a71a6af';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUEST = 'fly_paradise';
const FLAGS = ['abysmal_thrill', 'cloud_rings', 'starlit_night'].map((c) => `VERB:paradise_ticket_${c}:activate`);

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
});

function held() {
  const qs = createQuestState();
  ensureQuestOfferState(qs);
  assert.equal(acceptOffer(qs, QUEST, { now: 1000, managedOnly: true }).ok, true);
  return qs;
}

describe('Up up and away!', () => {
  it('wants the three tickets, and each course the quest names has a ticket of that name', () => {
    assert.deepEqual(getQuestCatalog()[QUEST].requirements.map((r) => r.name).sort(), FLAGS);
    for (const c of ['abysmal_thrill', 'cloud_rings', 'starlit_night']) assert.equal(PARADISE_COURSES[c].ticketId, `paradise_ticket_${c}`);
    for (const r of getQuestCatalog()[QUEST].requirements) assert.ok(requirementRoute(r).emitted, r.name);
  });

  it('counts an activation event, in any order, and is ready to turn in after the third', () => {
    const qs = held();
    const ctx = { managedOnly: true };
    assert.equal(routeQuestEvent(qs, 'paradise_ticket_abysmal_thrill:activate', 1, ctx).advanced.length, 1);
    assert.equal(routeQuestEvent(qs, 'paradise_ticket_radial_heights:activate', 1, ctx).advanced.length, 0, 'a course it does not name');
    assert.equal(routeQuestEvent(qs, 'paradise_ticket_cloud_rings:activate', 1, ctx).completable.length, 0);
    const last = routeQuestEvent(qs, 'paradise_ticket_starlit_night:activate', 1, ctx);
    assert.deepEqual(last.completable.map((row) => row.classTsid), [QUEST]);
  });

  it('game.js counts the activation once, after the ticket and iMG are spent, and only there', () => {
    const src = readFileSync(join(root, 'public/game.js'), 'utf8');
    const at = src.indexOf('function confirmParadiseTicketActivation');
    const end = src.indexOf('function collectParadiseEntry', at);
    const body = src.slice(at, end);
    assert.equal(body.match(/emitGameEvent\(/g)?.length, 1);
    assert.ok(body.indexOf('removeItem(inv, course.ticketId, 1)') < body.indexOf('emitGameEvent(`${course.ticketId}:activate`)'));
    assert.ok(body.indexOf('emitGameEvent(') < body.indexOf('await startParadiseFlight(courseId)'));
    // Every course (the four flown, the nine reconstructed) comes through this one spend.
    assert.equal(src.match(/activateParadiseTicket\(paradiseState/g)?.length, 1);
    const start = src.slice(src.indexOf('async function startParadiseFlight'), at);
    assert.ok(!/:activate/.test(start), 'the QA ?paradise= entry calls startParadiseFlight and counts for nothing');
  });

  it('every flown course reaches that one path from its ticket', () => {
    const tickets = Object.values(PARADISE_COURSES).map((c) => c.ticketId);
    assert.equal(new Set(tickets).size, tickets.length);
    assert.ok(tickets.length >= 13);
    for (const t of tickets) assert.match(t, /^paradise_ticket_/);
  });

  it('Beam Me Down counts its activation too, from both of its ways in', () => {
    const src = readFileSync(join(root, 'public/js/features/puzzle-scenes-feature.js'), 'utf8');
    assert.equal(src.match(/`\$\{TICKET\}:activate`/g)?.length, 2);
  });
});

describe('courses already visited', () => {
  it('credits only what a held quest still wants', () => {
    const none = createQuestState();
    assert.deepEqual(paradiseVisitCredits(none, { cloud_rings: 3 }), [], 'not held: nothing');
    const qs = held();
    assert.deepEqual(paradiseVisitCredits(qs, {}), []);
    assert.deepEqual(paradiseVisitCredits(qs, undefined), []);
    assert.deepEqual(paradiseVisitCredits(qs, { radial_heights: 9 }), [], 'a course it does not name');
    assert.deepEqual(paradiseVisitCredits(qs, { cloud_rings: 2, starlit_night: 0 }), ['paradise_ticket_cloud_rings:activate']);
  });

  it('counts once, on load or on accept, and finishes a player who has been to all three', () => {
    const visits = normalizeParadiseState({ visits: { cloud_rings: 2, starlit_night: 1, abysmal_thrill: 4 } }).visits;
    const qs = held();
    const events = paradiseVisitCredits(qs, visits);
    assert.equal(events.length, 3);
    let completable = [];
    for (const e of events) completable = routeQuestEvent(qs, e, 1, { managedOnly: true }).completable;
    assert.deepEqual(completable.map((row) => row.classTsid), [QUEST]);
    for (const f of FLAGS) assert.equal(qs.active[QUEST].progress[f], 1);
    assert.deepEqual(paradiseVisitCredits(qs, visits), [], 'nothing asked for twice');
  });

  it('a save keeps the visits the credit reads, and an activation adds to them', () => {
    const s = createParadiseState();
    const out = activateParadiseTicket(s, 'cloud_rings', { imagination: 1e6, quoinMultiplier: 1, dead: false });
    assert.equal(out.ok, true);
    assert.equal(normalizeParadiseState(JSON.parse(JSON.stringify(s))).visits.cloud_rings, 1);
  });

  it('the feature asks on its one-second sync, so a load and an accept both get it', () => {
    const src = readFileSync(join(root, 'public/js/features/quest-offers-feature.js'), 'utf8');
    assert.match(src, /paradiseVisitCredits\(qs, engine\.paradiseVisits\?\.\(\)\)/);
    assert.match(readFileSync(join(root, 'public/game.js'), 'utf8'), /paradiseVisits: \(\) => paradiseState\.visits/);
  });
});
