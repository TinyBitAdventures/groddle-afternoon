import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HOME_INTERIOR_TSID,
  HOME_STREET_TSID,
  beginHomeVisit,
  createHomeState,
  endHomeVisit,
  enterHomeInterior,
  leaveHomeInterior,
  imagineHome,
} from '../public/js/homes.js';
import {
  MAIL_BASE_COST,
  archiveMail,
  createMailboxState,
  deleteMail,
  listMailboxMessages,
  mailCost,
  readMail,
  receiveMailAttachments,
  seedMailbox,
  sendMail,
  unreadMailCount,
} from '../public/js/mailbox.js';

describe('source-backed home ownership', () => {
  it('imagines one of the three homestreet ticket styles once, free (inc_houses.js houses_go_to_new_house)', () => {
    const state = createHomeState();
    const result = imagineHome(state, 'firebog', 123);
    assert.equal(result.ok, true);
    assert.equal(result.styleLabel, 'Firebog');
    assert.equal(state.owned, true);
    assert.equal(state.style, 'firebog');
    assert.equal(state.purchasedAt, 123);
    assert.equal(imagineHome(state, 'uralia').reason, 'already_owned');
    assert.equal(imagineHome(createHomeState(), 'mordor').reason, 'unknown_style');
  });

  it('keeps a home bought with the retired deed (G208)', () => {
    const state = createHomeState({ owned: true, style: 'uralia', purchasedAt: 99, visits: 4 });
    assert.equal(state.owned, true);
    assert.equal(state.style, 'uralia');
    assert.equal(state.purchasedAt, 99);
    assert.equal(state.visits, 4);
  });

  it('teleports home, enters the house, and returns to the remembered street', () => {
    const state = createHomeState({ owned: true, style: 'uralia' });
    const home = beginHomeVisit(state, {
      tsid: 'GLI123',
      label: 'Hechey Track',
      hubName: 'Groddle Forest',
      x: 321,
      y: 654,
    });
    assert.equal(home.ok, true);
    assert.equal(home.tsid, HOME_STREET_TSID);
    assert.equal(state.visits, 1);
    assert.equal(enterHomeInterior(state).tsid, HOME_INTERIOR_TSID);
    assert.equal(state.room, 'interior');
    assert.equal(leaveHomeInterior(state).tsid, HOME_STREET_TSID);
    const returned = endHomeVisit(state);
    assert.equal(returned.returnLocation.tsid, 'GLI123');
    assert.equal(returned.returnLocation.x, 321);
    assert.equal(state.inHome, false);
  });
});

describe('mailbox state and GSJS postage', () => {
  it('uses base, attachment, and enclosed-currant postage rules', () => {
    assert.equal(mailCost(), MAIL_BASE_COST);
    assert.equal(mailCost({ itemBaseCost: 100, itemCount: 2, includeEnclosedCurrants: false }), 22);
    assert.equal(mailCost({ currants: 100 }), 112);
    assert.equal(mailCost({ itemBaseCost: 9999, itemCount: 99, currants: 500 }), 700);
  });

  it('seeds readable mail and claims attachments once', () => {
    const now = Date.UTC(2026, 6, 26, 12);
    const state = seedMailbox(createMailboxState(), now);
    const inventory = { apple: 0 };
    const player = { currants: 10 };
    assert.equal(unreadMailCount(state, now), 2);
    const messages = listMailboxMessages(state, { now });
    assert.ok(messages.every((message) => message.deliveryAt > Date.UTC(2026, 0, 1)));
    const apple = messages.find((message) => message.attachment?.classTsid === 'apple');
    assert.equal(readMail(state, apple.id, now).ok, true);
    assert.equal(unreadMailCount(state, now), 1);
    const received = receiveMailAttachments(state, inventory, player, apple.id, now);
    assert.equal(received.ok, true);
    assert.equal(inventory.apple, 1);
    assert.equal(receiveMailAttachments(state, inventory, player, apple.id, now).reason, 'nothing_to_receive');
  });

  it('sends one item stack, charges postage, and schedules a local reply', () => {
    const state = createMailboxState();
    const inventory = { apple: 3 };
    const player = { currants: 100 };
    const sent = sendMail(state, player, inventory, {
      recipient: 'Amp',
      text: 'Do you need an apple?',
      attachment: { classTsid: 'apple', count: 2 },
      attachmentBaseCost: 5,
      now: 1000,
      replyDelayMs: 5000,
    });
    assert.equal(sent.ok, true);
    assert.equal(sent.cost, 3);
    assert.equal(player.currants, 97);
    assert.equal(inventory.apple, 1);
    assert.equal(listMailboxMessages(state, { now: 5999 }).length, 0);
    assert.equal(listMailboxMessages(state, { now: 6000 }).length, 1);
    assert.equal(unreadMailCount(state, 6000), 1);
  });

  it('archives and deletes delivered inbox messages', () => {
    const state = seedMailbox(createMailboxState(), 100_000);
    const message = listMailboxMessages(state, { now: 100_000 })[0];
    assert.equal(archiveMail(state, message.id).ok, true);
    assert.equal(listMailboxMessages(state, { now: 100_000 }).length, 1);
    assert.equal(listMailboxMessages(state, { now: 100_000, archived: true }).length, 1);
    assert.equal(deleteMail(state, message.id).ok, true);
    assert.equal(listMailboxMessages(state, { now: 100_000, archived: true }).length, 0);
  });
});

describe('playable home and mailbox integration', () => {
  it('ships the home ticket machine, map teleport, physical mailbox, and mail UI', () => {
    const root = join(import.meta.dirname, '..', 'public');
    const game = readFileSync(join(root, 'game.js'), 'utf8');
    const html = readFileSync(join(root, 'play/index.html'), 'utf8');
    const css = readFileSync(join(root, 'style.css'), 'utf8');
    const content = readFileSync(join(root, 'content.js'), 'utf8');
    assert.match(game, /async function teleportHome/);
    assert.match(game, /async function returnFromHome/);
    assert.match(game, /function renderHomeMapCallout/);
    assert.match(game, /classId: 'npc_mailbox'/);
    assert.match(game, /function renderMailboxCompose/);
    assert.match(game, /receiveMailAttachments/);
    assert.match(html, /id="home-panel"/);
    assert.match(html, /id="mail-panel"/);
    assert.match(html, /id="mail-unread-badge"/);
    assert.match(css, /\.mail-layout/);
    assert.match(css, /\.home-style-grid/);
    assert.match(content, /classId === 'npc_mailbox'/);
    assert.match(content, /return_to_world/);
  });

  it('ships clean extracted Mailbox (1) art for idle and has-mail states', () => {
    const root = join(import.meta.dirname, '..', 'public', 'assets', 'sprites', 'mailbox');
    for (const file of [
      'npc_mailbox_variant_mailboxRight_x1_idle_png_1354832227.png',
      'npc_mailbox_variant_mailboxRight_x1_has_mail_idle_png_1354832230.png',
      'npc_mailbox_variant_mailboxRight_x1_interact_png_1354832230.png',
      'npc_mailbox_variant_mailboxRight_x1_all_done_png_1354832231.png',
    ]) {
      assert.ok(readFileSync(join(root, file)).length > 1_000);
    }
  });
});
