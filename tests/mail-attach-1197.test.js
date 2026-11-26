/**
 * G1197: a Teleportation Script could not be mailed online, with the copy picker already live.
 * Glitch's mail took any itemstack dragged from the pack but no_mail, soulbound and the hogtied
 * piggy (AbstractMailUI.as isDroppable 60-74, RESTRICTED_ITEMS 22), and its server refused only a
 * bag with things in it (inc_mail.js mail_can_send 26-29, main.js doMailSend 6654-6666);
 * teleportation_script.js and teleportation_script_imbued.js carry no no_mail tag. Both mail
 * forms built Attach from listPackItemSlots, which leaves tools out, and kept the first 80
 * classes in catalog order, where a script comes about 390th, so a full pack never offered it.
 * Now Attach is every pack stack but the refused table the site uses (tools/build-mail.mjs).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ITEM_CATALOG, ensureItem, listPackSlots } from '../public/js/inventory.js?v=3be7988a';
import { MAIL_REFUSED, mailAttachSlots } from '../public/js/mailbox.js?v=d50d0d05';
import { SCRIPT_CLASS, SCRIPT_IMBUED_CLASS, SCRIPT_ITEM } from '../public/js/teleportation.js?v=cbbc673f';
import { mailTable } from '../tools/build-mail.mjs';

const root = join(import.meta.dirname, '..');
const read = (f) => readFileSync(join(root, f), 'utf8');

describe('G1197 mail Attach offers what Glitch let you mail', () => {
  it('refuses exactly what the site refuses (tools/build-mail.mjs, data/mail.json)', () => {
    assert.deepEqual({ ...MAIL_REFUSED }, mailTable().refused);
    assert.ok(!MAIL_REFUSED[SCRIPT_CLASS] && !MAIL_REFUSED[SCRIPT_IMBUED_CLASS], 'no no_mail tag on either script (GSJS items)');
  });

  it('a pack with more than 80 kinds of things still offers its Teleportation Script, and its tools', () => {
    // As in the game, where the script comes about 390th of the catalog: 100 kinds listed before it.
    for (let i = 0; i < 100; i += 1) ensureItem(`zz_kind_${i}`, { label: `Kind ${i}` });
    ensureItem(SCRIPT_CLASS, { ...SCRIPT_ITEM });
    const before = Object.keys(ITEM_CATALOG).filter((c) => c !== SCRIPT_CLASS && c !== 'pick' && c !== 'cherry');
    const inv = Object.fromEntries(before.map((c) => [c, 1]));
    inv[SCRIPT_CLASS] = 1;
    inv.pick = 1;
    inv.conch = 1;
    inv.cherry = 0;
    const slots = listPackSlots(inv);
    assert.ok(slots.findIndex((s) => s.classTsid === SCRIPT_CLASS) >= 80, 'the script comes after the first 80 kinds held');
    const offered = mailAttachSlots(slots).map((s) => s.classTsid);
    assert.ok(offered.includes(SCRIPT_CLASS), 'the script is offered');
    assert.ok(offered.includes('pick'), 'a tool is offered (Glitch mailed tools)');
    assert.ok(!offered.includes('conch'), 'no_mail stays out');
    assert.ok(!offered.includes('cherry'), 'nothing held, nothing offered');
    assert.ok(offered.length > 80, `no cap: ${offered.length}`);
  });

  it('both mail forms build Attach from mailAttachSlots over every pack slot, uncapped', () => {
    const src = read('public/game.js');
    const solo = src.slice(src.indexOf('function renderMailboxCompose('), src.indexOf('function themeMailPickers('));
    const online = src.slice(src.indexOf('function renderPlayerMailCompose('), src.indexOf('function renderMailboxReader('));
    for (const [name, body] of [['solo', solo], ['online', online]]) {
      assert.match(body, /mailAttachSlots\(listPackSlots\(inv\)\)/, name);
      assert.doesNotMatch(body, /listPackItemSlots|slice\(0, 80\)/, name);
    }
  });
});
