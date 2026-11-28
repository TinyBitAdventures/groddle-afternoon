/**
 * Beam Me Down's ticket was free and outside the 11-a-day ticket limit: Activate took the ticket
 * and dropped the player into the scene. In Glitch items/paradise_ticket_beam_me_down.js is a
 * paradise_ticket like the rest (parent_classes, location_id 'beam_me_down'): verbs.activate
 * refuses at 11 tickets a day (154), the handler asks with the calc_img_cost price (173-199;
 * 20 x the quoin multiplier, more above x40, 246-265), and modal_callback spends the iMG and
 * counts the ticket (330-331). It now goes through the flight courses' own ticket code
 * (js/paradise-flight.js quoteParadiseTicket / activateParadiseTicket, game.js
 * confirmParadiseTicketActivation via engine.activateParadiseTicket).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PARADISE_DAILY_LIMIT,
  PARADISE_SCENE_TICKETS,
  activateParadiseTicket,
  createParadiseState,
  paradiseTicketCost,
  paradiseTicketPlace,
  quoteParadiseTicket,
} from '../public/js/paradise-flight.js?v=fe7ba6de';
import { createInventory, addItem, countItem } from '../public/js/inventory.js?v=3be7988a';
import { puzzleScenesFeature } from '../public/js/features/puzzle-scenes-feature.js?v=5313f8b4';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TICKET = 'paradise_ticket_beam_me_down';

describe('Beam Me Down is a Ticket to Paradise', () => {
  it('is quoted at the normal ticket price', () => {
    assert.equal(paradiseTicketPlace('beam_me_down')?.ticketId, TICKET);
    assert.equal(PARADISE_SCENE_TICKETS.beam_me_down.name, 'Beam Me Down');
    for (const qm of [1, 6, 40, 100]) {
      const quote = quoteParadiseTicket(createParadiseState(), 'beam_me_down', { imagination: 1e6, quoinMultiplier: qm });
      assert.equal(quote.ok, true);
      assert.equal(quote.cost, paradiseTicketCost(qm));
    }
    assert.equal(paradiseTicketCost(6), 120);
    const poor = quoteParadiseTicket(createParadiseState(), 'beam_me_down', { imagination: 119, quoinMultiplier: 6 });
    assert.equal(poor.reason, 'not_enough_imagination');
  });

  it('counts in the day\'s 11 tickets alongside the flight courses', () => {
    const state = createParadiseState();
    for (let i = 0; i < PARADISE_DAILY_LIMIT - 1; i += 1) {
      assert.equal(activateParadiseTicket(state, 'cloud_rings', { imagination: 1e6 }).ok, true);
    }
    const last = activateParadiseTicket(state, 'beam_me_down', { imagination: 1e6 });
    assert.equal(last.ok, true);
    assert.equal(state.ticketsToday, PARADISE_DAILY_LIMIT);
    assert.equal(activateParadiseTicket(state, 'beam_me_down', { imagination: 1e6 }).reason, 'daily_limit');
    assert.equal(activateParadiseTicket(state, 'cloud_rings', { imagination: 1e6 }).reason, 'daily_limit');
    // The visits ledger (quest credits) keeps the flight courses only.
    assert.equal('beam_me_down' in state.visits, false);
  });
});

describe('the ticket\'s Activate goes through the shared ticket flow', () => {
  const fakeEngine = (quote) => {
    const inv = createInventory();
    addItem(inv, TICKET, 1);
    const calls = [];
    return {
      inv,
      calls,
      transientInstance: () => false,
      paradiseTicketQuote: (id) => { calls.push(['quote', id]); return quote; },
      activateParadiseTicket: (id, start) => { calls.push(['activate', id, typeof start]); return true; },
      refreshPack() {},
    };
  };

  it('Activate hands the ticket to engine.activateParadiseTicket and takes nothing itself', () => {
    const engine = fakeEngine({ ok: true, reason: '', cost: 120, ticketsToday: 3 });
    assert.equal(puzzleScenesFeature.runPackVerb(TICKET, 'activate', engine), true);
    assert.deepEqual(engine.calls, [['activate', 'beam_me_down', 'function']]);
    assert.equal(countItem(engine.inv, TICKET), 1, 'the ticket is spent only after the prompt is accepted');
  });

  it('the pack verb shows the shared refusal (daily limit, iMG) and the day\'s count', () => {
    const limit = 'You have already activated the maximum 11 Ticket to Paradise cards per day.';
    const [verb] = puzzleScenesFeature.packVerbs(TICKET, fakeEngine({ ok: false, reason: limit, cost: 20, ticketsToday: 11 }));
    assert.equal(verb.enabled, false);
    assert.equal(verb.reason, limit);
    assert.match(verb.tooltip, /used 11 tickets today/);
    const [ok] = puzzleScenesFeature.packVerbs(TICKET, fakeEngine({ ok: true, reason: '', cost: 20, ticketsToday: 1 }));
    assert.equal(ok.enabled, true);
    assert.match(ok.tooltip, /used 1 ticket today/);
  });

  it('game.js spends the price and the day\'s count for a scene ticket too', () => {
    const src = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(src, /activateParadiseTicket: \(courseId, start\) => confirmParadiseTicketActivation\(courseId, \{ start \}\)/);
    const at = src.indexOf('function confirmParadiseTicketActivation');
    const body = src.slice(at, src.indexOf('function collectParadiseEntry', at));
    assert.match(body, /paradiseTicketPlace\(courseId\)/);
    assert.ok(body.indexOf('pc.imagination - activated.cost') < body.indexOf('await start()'));
  });
});
