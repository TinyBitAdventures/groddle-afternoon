/**
 * G208: the free Home Street Ticket (js/home-ticket.js) replaces the
 * 1,000-currant deed. Text is checked against GameServerJS:
 * items/homestreet_ticket.js, items/homestreet_ticket_dispenser.js,
 * locations/newxp_training2.js 714-746, players/inc_houses.js 807-914.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HOME_MACHINE,
  HOME_TICKET,
  HOME_TICKET_CLASS,
  TICKET_GIVEN,
  giveHomeTicket,
  offerHomeTicket,
  quoteHomeTicket,
  rockTicketBeats,
  ticketCount,
  useHomeTicket,
} from '../public/js/home-ticket.js?v=g268-1';
import { ITEM_CATALOG } from '../public/js/inventory.js?v=catalog-unified-6';
import { createHomeState } from '../public/js/homes.js?v=homes-mail-3';

const spike = join(import.meta.dirname, '..');
const GS = join(spike, '../glitch-GameServerJS');
const src = (file) => readFileSync(join(GS, file), 'utf8');

describe('Home Street Ticket text (GSJS)', () => {
  it('matches homestreet_ticket.js', () => {
    const ticket = src('items/homestreet_ticket.js');
    assert.match(ticket, new RegExp(`var label = "${HOME_TICKET.label}";`));
    assert.match(ticket, new RegExp(`var name_plural = "${HOME_TICKET.namePlural}";`));
    assert.ok(ticket.includes(`var description = "${HOME_TICKET.desc}";`));
    assert.ok(ticket.includes(`reason:'${HOME_TICKET.useReason}'`));
    assert.match(ticket, /var stackmax = 1;/);
    assert.match(ticket, /var base_cost = 0;/);
    for (const tag of HOME_TICKET.tags) assert.ok(ticket.includes(`"${tag}"`), tag);
  });

  it('matches the Selection Machine (homestreet_ticket_dispenser.js)', () => {
    const machine = src('items/homestreet_ticket_dispenser.js');
    assert.ok(machine.includes(`var label = "${HOME_MACHINE.label}";`));
    assert.ok(machine.includes(`reason:'${HOME_MACHINE.needTicket}'`));
    assert.ok(machine.includes(`homestreet_style : ["${HOME_MACHINE.styles.join('","')}"]`));
    for (const style of HOME_MACHINE.styles) {
      const verb = HOME_MACHINE.verb(style);
      assert.ok(machine.includes(`"name"				: "${verb.name}"`), verb.name);
      assert.ok(machine.includes(`"tooltip"			: "${verb.tooltip}"`), verb.tooltip);
    }
  });

  it('registers the ticket item with the source description', () => {
    assert.equal(ITEM_CATALOG[HOME_TICKET_CLASS].label, 'Home Street Ticket');
    assert.equal(ITEM_CATALOG[HOME_TICKET_CLASS].desc, HOME_TICKET.desc);
    assert.equal(ITEM_CATALOG[HOME_TICKET_CLASS].stackMax, 1);
    assert.equal(ITEM_CATALOG[HOME_TICKET_CLASS].sellable, false);
  });

  it('gives the rock talk page by page, as newxp_training2.js 714 and 727', () => {
    const beats = rockTicketBeats('Pim');
    assert.deepEqual(beats.map((b) => b.response), ['Good', 'OK', 'Right', 'OK', 'Yes …']);
    assert.equal(beats[0].text, 'Pim, my new chum. I have a ticket for you.');
    assert.equal(rockTicketBeats()[0].text, 'Friend, my new chum. I have a ticket for you.');
    assert.equal(beats[4].text, 'Oh right, the ticket.');
    const training = src('locations/newxp_training2.js');
    for (const b of beats.slice(1, 4)) {
      const words = b.text.split(' ').slice(0, 4).join(' ');
      assert.ok(training.replace(/<br>/g, ' ').replace(/\\'/g, "'").includes(words), words);
    }
    assert.ok(training.includes("'Oh right, the ticket.', {ok:'Yes …'}"));
    for (const b of beats) assert.doesNotMatch(b.text, /<|—/);
  });
});

describe('the ticket flow', () => {
  it('the rock gives one ticket, only when the pack has none (magicrock_talk6)', () => {
    const inv = {};
    assert.equal(giveHomeTicket(inv), true);
    assert.equal(ticketCount(inv), 1);
    assert.equal(giveHomeTicket(inv), false);
    assert.equal(ticketCount(inv), 1);
  });

  it('the machine needs a ticket, then makes the home free and uses the ticket', () => {
    const home = createHomeState();
    const inv = {};
    const pc = { currants: 3 };
    assert.deepEqual(quoteHomeTicket(home, inv, 'meadow'), { ok: false, reason: 'no_ticket', msg: HOME_MACHINE.needTicket });
    giveHomeTicket(inv);
    assert.equal(quoteHomeTicket(home, inv, 'mordor').reason, 'unknown_style');
    const res = useHomeTicket(home, inv, 'uralia', 77);
    assert.equal(res.ok, true);
    assert.equal(home.owned, true);
    assert.equal(home.style, 'uralia');
    assert.equal(home.purchasedAt, 77);
    assert.equal(ticketCount(inv), 0);
    assert.equal(pc.currants, 3, 'no currants change hands');
  });

  it('a home bought with the old deed stays, and a stray ticket is kept', () => {
    const home = createHomeState({ owned: true, style: 'firebog', purchasedAt: 5 });
    const inv = { [HOME_TICKET_CLASS]: 1 };
    assert.equal(useHomeTicket(home, inv, 'meadow').reason, 'already_owned');
    assert.equal(ticketCount(inv), 1);
    assert.equal(home.style, 'firebog');
    assert.equal(offerHomeTicket({ home, inv }), false);
  });

  it('opening Home with no home and no ticket: the rock talks, hands it over, then the machine opens', () => {
    const inv = {};
    const calls = [];
    let dialog = null;
    const host = {
      inv,
      home: createHomeState(),
      name: 'Pim',
      gate: () => ({ ok: true }),
      dialogue: (opts) => { dialog = opts; },
      activity: (msg) => calls.push(['activity', msg]),
      changed: (made) => calls.push(['changed', made]),
      reopen: () => calls.push(['reopen']),
      toast: (msg) => calls.push(['toast', msg]),
    };
    assert.equal(offerHomeTicket(host), true);
    assert.equal(dialog.title, 'Magic Rock');
    assert.equal(dialog.kicker, 'Magic Rock');
    assert.equal(dialog.beats.length, 5);
    assert.equal(ticketCount(inv), 0, 'the ticket comes at the end of the talk');
    dialog.onComplete();
    assert.equal(ticketCount(inv), 1);
    assert.deepEqual(calls, [['activity', TICKET_GIVEN], ['changed', false], ['reopen']]);
    assert.equal(offerHomeTicket(host), false, 'with the ticket the panel is the machine');
  });

  it('in the tutorial the gate answers and no ticket is given', () => {
    const inv = {};
    const toasts = [];
    const host = { inv, home: createHomeState(), gate: () => ({ ok: false, msg: 'Follow the tutorial (or skip it from the Tutorial card).' }), toast: (m) => toasts.push(m), dialogue: () => assert.fail('no talk') };
    assert.equal(offerHomeTicket(host), true);
    assert.deepEqual(toasts, ['Follow the tutorial (or skip it from the Tutorial card).']);
    assert.equal(ticketCount(inv), 0);
  });
});

describe('game wiring (G208)', () => {
  const game = readFileSync(join(spike, 'public/game.js'), 'utf8');
  const homes = readFileSync(join(spike, 'public/js/homes.js'), 'utf8');
  const newxp = readFileSync(join(spike, 'public/js/features/newxp-feature.js'), 'utf8');

  it('the deed is gone', () => {
    for (const text of [game, homes]) {
      assert.doesNotMatch(text, /HOME_PURCHASE_COST|purchaseHome|quoteHomePurchase/);
      assert.doesNotMatch(text, /[Dd]eed:|home deed|Buy a home/);
    }
  });

  it('the Home panel without a home is the machine, and Home first asks the rock', () => {
    assert.match(game, /from '\.\/js\/home-ticket\.js\?v=g\d+-\d+'/);
    assert.match(game, /if \(!homeState\.owned\) \{[\s\S]{0,200}renderTicketMachine\(body, homeTicketHost\(\)\);/);
    assert.match(game, /function openHomePanel\(\) \{[\s\S]{0,200}if \(!homeState\.owned && offerHomeTicket\(homeTicketHost\(\)\)\)/);
    assert.match(game, /grantHome\(style = 'meadow'\) \{[\s\S]{0,120}imagineHome\(homeState, style, Date\.now\(\)\)/);
  });

  it('the tutorial machine uses the source verb names and refusal', () => {
    assert.match(newxp, /HOME_MACHINE\.verb\(target\.nxStyle\)\.name/);
    assert.match(newxp, /engine\.toast\(HOME_MACHINE\.needTicket, 2500\)/);
    assert.doesNotMatch(newxp, /Good for one home street/);
  });
});

describe('an answered Magic Rock conversation leaves the screen (found by G208)', () => {
  it('the conversation and VOG looks show only while not hidden', () => {
    const css = readFileSync(join(spike, 'public/style.css'), 'utf8');
    assert.match(css, /\.quest-dialogue\[data-look="conversation"\]:not\(\[hidden\]\) \{ display: block;/);
    assert.match(css, /\.quest-dialogue\[data-look="vog"\]:not\(\[hidden\]\) \{ display: block;/);
    assert.doesNotMatch(css, /\.quest-dialogue\[data-look="(conversation|vog)"\] \{ display: block;/);
  });
});
