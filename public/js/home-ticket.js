/**
 * G208: the Home Street Ticket, the 2012 way to a home of your own.
 *
 * Sources (GameServerJS):
 * - items/homestreet_ticket.js 3-8 (label, description), 15-16 (stackmax 1,
 *   base_cost 0), 42 (its pack "use" is disabled: "Use this from a Ticket
 *   Machine"), 128-132 (no_rube, no_trade, no_auction).
 * - items/homestreet_ticket_dispenser.js 1 ("Home Street Selection Machine"),
 *   38 (meadow, firebog, uralia), 43-143 (one "Pick <Style> Style" verb per
 *   machine; without a ticket: "You need to get a ticket to use this
 *   machine"), 145-161 (doChoose: the ticket is used up).
 * - locations/newxp_training2.js 714-746: the Magic Rock's "I have a ticket
 *   for you" talk, "Oh right, the ticket.", then the ticket (only when the
 *   pack has none).
 * - players/inc_houses.js 807-914 houses_go_to_new_house: the home street and
 *   house are made free, then you are taken there (main.js 1873-1884 /home).
 *
 * In 2012 every new player met the rock and the machine in the tutorial
 * (features/newxp-feature.js runs that scene). A remake save that skipped the
 * tutorial, or predates it, gets the same free ticket from the rock the first
 * time it opens the Home panel, and the panel is the Selection Machine. No
 * currants and no Your Papers: that gate belonged to the older real-estate
 * sale (locations/inc_pols.js 45-49), not to 2012 home streets (desk PAPERS,
 * Austin 2026-10-25).
 */

import { addItem, countItem, ensureItem, removeItem } from './inventory.js?v=catalog-unified-5';
import { HOME_STYLES, imagineHome, normalizeHomeState } from './homes.js?v=homes-mail-3';
import { LINES, talkPages } from './newxp.js?v=newxp-2';

export const HOME_TICKET_CLASS = 'homestreet_ticket';

/** homestreet_ticket.js 3-8, 15-16, 42, 128-132. */
export const HOME_TICKET = Object.freeze({
  label: 'Home Street Ticket',
  namePlural: 'Home Street Tickets',
  desc: 'This handy ticket lets you choose your home street style.',
  useReason: 'Use this from a Ticket Machine',
  stackMax: 1,
  tags: Object.freeze(['no_rube', 'no_trade', 'no_auction']),
  icon: 'assets/sprites/icons/homestreet_ticket.png',
});

/** homestreet_ticket_dispenser.js 1, 38, 43-143 (verb name, tooltip; the art is the OGA icon). */
export const HOME_MACHINE = Object.freeze({
  label: 'Home Street Selection Machine',
  needTicket: 'You need to get a ticket to use this machine',
  icon: 'assets/sprites/icons/homestreet_ticket_dispenser.png',
  styles: Object.freeze(['meadow', 'firebog', 'uralia']),
  verb: (style) => {
    const label = HOME_STYLES[style]?.label || style;
    return { name: `Pick ${label} Style`, tooltip: `Choose the ${label} style of Home Street` };
  },
});

/** newxp-feature.js line 1478 wording, the remake's activity line for the hand-over. */
export const TICKET_GIVEN = 'The Magic Rock gave you a Home Street Ticket.';

ensureItem(HOME_TICKET_CLASS, {
  label: HOME_TICKET.label,
  namePlural: HOME_TICKET.namePlural,
  desc: HOME_TICKET.desc,
  icon: HOME_TICKET.icon,
  baseCost: 0,
  stackMax: HOME_TICKET.stackMax,
  sellable: false,
  donatable: false,
  tags: [...HOME_TICKET.tags],
});

export function ticketCount(inv) {
  return Math.max(0, countItem(inv || {}, HOME_TICKET_CLASS) || 0);
}

/**
 * The rock's ticket talk (newxp_training2.js 714 and 727) as scripted beats:
 * each `<split butt_txt>` page with its button, then "Oh right, the ticket.".
 */
export function rockTicketBeats(name = 'friend') {
  const plain = (html) => String(html || '').replace(/<br\s*\/?>/g, ' ').replace(/\s+/g, ' ').trim();
  const pages = talkPages(LINES.rockTicket, { name }, 'OK').map((p) => ({ text: plain(p.text), response: p.button }));
  // The source opens on pc.getLabel(); a remake save may have no name, so "Friend, my new chum."
  if (pages[0]) pages[0].text = pages[0].text.charAt(0).toUpperCase() + pages[0].text.slice(1);
  return [...pages, { text: LINES.rockOhRight, response: 'Yes …' }];
}

/** magicrock_talk6 / done: one ticket, only when the pack has none. True when one was given. */
export function giveHomeTicket(inv) {
  if (!inv || ticketCount(inv) > 0) return false;
  addItem(inv, HOME_TICKET_CLASS, 1);
  return ticketCount(inv) > 0;
}

/** Whether the machine takes this ticket for `style` (dispenser conditions 64-70). */
export function quoteHomeTicket(state, inv, style) {
  if (normalizeHomeState(state).owned) return { ok: false, reason: 'already_owned', msg: '' };
  if (!HOME_STYLES[style] || !HOME_MACHINE.styles.includes(style)) return { ok: false, reason: 'unknown_style', msg: '' };
  if (ticketCount(inv) < 1) return { ok: false, reason: 'no_ticket', msg: HOME_MACHINE.needTicket };
  return { ok: true, reason: '', msg: '' };
}

/** doChoose (dispenser 145-161) then houses_go_to_new_house: the ticket goes, the home is made free. */
export function useHomeTicket(state, inv, style, now = Date.now()) {
  const quote = quoteHomeTicket(state, inv, style);
  if (!quote.ok) return quote;
  removeItem(inv, HOME_TICKET_CLASS, 1);
  return imagineHome(state, style, now);
}

/**
 * Open the Home panel without a home: in the tutorial the rock has not met
 * you yet (the gate's own line); with no ticket the rock hands one over, then
 * `host.reopen()` shows the machine. Returns true when it took over the open.
 *
 * host: { inv, home, name?, gate(): { ok, msg }, dialogue(opts), toast(msg),
 *         activity(msg), changed(made), reopen() }
 */
export function offerHomeTicket(host) {
  if (!host || normalizeHomeState(host.home).owned) return false;
  const gate = host.gate?.() || { ok: true };
  if (!gate.ok) {
    host.toast?.(gate.msg || 'Oops - looks like you need to go talk to your rock first!');
    return true;
  }
  if (ticketCount(host.inv) > 0) return false;
  host.dialogue?.({
    title: 'Magic Rock',
    kicker: 'Magic Rock',
    beats: rockTicketBeats(host.name || 'friend'),
    onComplete: () => {
      if (giveHomeTicket(host.inv)) host.activity?.(TICKET_GIVEN);
      host.changed?.(false);
      host.reopen?.();
    },
  });
  return true;
}

function el(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids) if (kid) node.append(kid);
  return node;
}

/**
 * The Home panel without a home: the Selection Machine, one Pick button per
 * style. Picking uses the ticket, makes the home, then host.goHome() ("I'll
 * meet you at your new place").
 */
export function renderTicketMachine(body, host) {
  if (!body || typeof document === 'undefined') return;
  const have = ticketCount(host?.inv);
  body.replaceChildren();
  body.dataset.homeMachine = '1';
  const ticket = el('div', { class: 'home-ticket' }, [
    el('img', { class: 'home-ticket-machine', src: HOME_MACHINE.icon, alt: '', width: 50, height: 77 }),
    el('div', { class: 'home-ticket-copy' }, [
      el('strong', { text: HOME_TICKET.label }),
      el('span', { text: HOME_TICKET.desc }),
      el('span', { class: 'home-ticket-have', text: have ? `In your pack: ${have}` : HOME_MACHINE.needTicket }),
    ]),
    el('img', { class: 'home-ticket-icon', src: HOME_TICKET.icon, alt: '', width: 48, height: 48 }),
  ]);
  const grid = el('div', { class: 'home-style-grid' });
  for (const id of HOME_MACHINE.styles) {
    const style = HOME_STYLES[id];
    const verb = HOME_MACHINE.verb(id);
    const button = el('button', { type: 'button', class: 'home-style', 'data-home-style': id, style: `--home-accent:${style.accent}`, title: verb.tooltip, disabled: have < 1 }, [
      el('span', { class: 'home-style-visual' }),
      el('strong', { text: verb.name }),
      el('span', { text: verb.tooltip }),
    ]);
    button.addEventListener('click', () => {
      const result = useHomeTicket(host.home, host.inv, id, Date.now());
      if (!result.ok) {
        host.toast?.(result.msg || 'That style cannot be picked right now.');
        return;
      }
      host.activity?.(`You picked the ${result.styleLabel} style for your home street.`);
      host.changed?.(true);
      host.goHome?.();
    });
    grid.append(button);
  }
  body.append(ticket, grid);
}
