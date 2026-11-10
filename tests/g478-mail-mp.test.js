/**
 * Register G478: mail between real players in multiplayer. The pure rules
 * and words are js/player-mail.js; the site's rules (src/LedgerMail.php:
 * postage, limits, what a reader sees) run here through php -r (skipped
 * without the site or php), and its table (data/mail.json) must match
 * tools/build-mail.mjs. The routes, the ledger moves and the realtime nudge
 * are checked live with two players (the lane's two-player check). Solo is
 * untouched: the feature answers nothing there and the mailbox keeps the
 * companions' letters as they were.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LETTER_ROW,
  PLAYER_MAIL_RULES,
  PLAYER_MAIL_TEXT,
  RETURN_ROW,
  arrivesAt,
  composeRefusal,
  goodsWords,
  letterRow,
  mailReceiptEffects,
  newLetterId,
  normalizeMailReceipt,
  parcelWaits,
  parcelsWaiting,
  normalizePlayerMailSlice,
  playerMailCost,
  sentRow,
} from '../public/js/player-mail.js?v=af6a8b00';
import { playerMailFeature } from '../public/js/features/player-mail-feature.js?v=c9285772';
import { createMailboxState, deliverMail, listMailboxMessages, mailCost, normalizeMailboxState, recordSentMail } from '../public/js/mailbox.js?v=a3e833ba';
import { handOver, isExpressPending, sendDueToMailbox } from '../public/js/mail-courier.js?v=68125101';
import { mailText } from '../public/js/ui/topbar.js?v=717d5b4c';
import { mergePlayerMail } from '../public/js/phone/companion-data.js?v=014d5e9e';
import { mailJson } from '../tools/build-mail.mjs';
import { ITEM_BASE_COSTS } from '../public/js/store-catalog.js?v=74b56af3';
import { HAS_SITE, SITE_DIR, sitePath } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

function php(body) {
  const code = `foreach (['Economy', 'LedgerMath', 'WordFilter', 'LedgerGift', 'LedgerMail'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\LedgerMail; ${body}`;
  return JSON.parse(execFileSync('php', ['-r', code]).toString());
}

const ID = '00000000000000a1';
const letter = (over = {}) => ({
  id: ID, box: 'in', from: { id: 7, name: 'Ada' }, to: { id: 9, name: 'Bo' }, text: 'Cherries for you',
  item: { c: 'cherry', n: 3 }, currants: 25, postage: 7, at: 2_000_000, sent: 1_580_000, collected: false, reply: null, replied: false, ...over,
});

describe('postage and arrival follow inc_mail.js and config_prod.js', () => {
  it('charges 2, 10% of the stack\'s base cost (at least 1), 10% of the currants, at most 200, plus the currants (mail_get_message_cost 1295-1312)', () => {
    assert.equal(playerMailCost({}, ITEM_BASE_COSTS), 2);
    assert.equal(playerMailCost({ c: 'apple', n: 10 }, ITEM_BASE_COSTS), 7, 'base 5 x 10 x 0.1 = 5');
    assert.equal(playerMailCost({ c: 'cherry', n: 1 }, ITEM_BASE_COSTS), 3, 'at least 1 for a stack');
    assert.equal(playerMailCost({ c: 'cosmox', n: 3 }, ITEM_BASE_COSTS), 4, 'base 8.2: Math.round(2.46)');
    assert.equal(playerMailCost({ currants: 100 }, ITEM_BASE_COSTS), 112);
    assert.equal(playerMailCost({ c: 'antique_spigot', n: 5, currants: 5000 }, ITEM_BASE_COSTS), 5200, 'postage stops at 200');
    assert.equal(playerMailCost({ c: 'bag_butler', n: 3 }, ITEM_BASE_COSTS), 3, 'no base cost: the minimum 1');
    // The solo mailbox's own formula agrees where it has the same base cost.
    assert.equal(mailCost({ itemBaseCost: 5, itemCount: 10, currants: 0 }), playerMailCost({ c: 'apple', n: 10 }, ITEM_BASE_COSTS));
  });

  it('delivers words at once and anything carrying things 420 s later (config_prod.js:45-46)', () => {
    assert.equal(arrivesAt({}, 1000), 1000);
    assert.equal(arrivesAt({ item: { c: 'apple', n: 1 } }, 1000), 421_000);
    assert.equal(arrivesAt({ currants: 1 }, 1000), 421_000);
    assert.deepEqual(PLAYER_MAIL_RULES, { textMax: 300, countMax: 999, currantsMax: 999999, delay: 0, delayAttached: 420, baseCost: 2, postageMax: 200, mailboxMax: 50, sendPerHour: 60 });
  });

  it('checks the compose form as the AS3 client did', () => {
    assert.equal(composeRefusal({ to: '', text: 'hi' }), PLAYER_MAIL_TEXT.noOne);
    assert.equal(composeRefusal({ to: 'Bo', text: '   ' }), PLAYER_MAIL_TEXT.empty);
    assert.equal(composeRefusal({ to: 'Bo', text: 'x'.repeat(301) }), 'Keep it to 300 characters.');
    assert.equal(composeRefusal({ to: 'Bo', item: { c: 'apple', n: 1000 } }), 'Choose how many to send, from 1 to 999.');
    assert.equal(composeRefusal({ to: 'Bo', item: { c: 'apple', n: 4 }, held: 3 }), "You don't have that many.");
    assert.equal(composeRefusal({ to: 'Bo', item: { c: 'bag_generic', n: 1 }, bagHolds: true }), PLAYER_MAIL_TEXT.bagStuffed);
    assert.equal(composeRefusal({ to: 'Bo', currants: 50, purse: 56 }, ITEM_BASE_COSTS), PLAYER_MAIL_TEXT.needCurrants, '50 + 2 + 5 = 57');
    assert.equal(composeRefusal({ to: 'Bo', currants: 50, purse: 57 }, ITEM_BASE_COSTS), null);
    assert.equal(composeRefusal({ to: 'Bo', currants: 1_000_000 }), 'Enclose from 0 to 999,999 currants.');
  });
});

describe('letters from the site in the mailbox', () => {
  it('reads a letter as a row from its sender, its things held by the site\'s ledger, waiting in the mailbox (HOMES2: not the Frog\'s)', () => {
    const row = letterRow(letter({ reply: { text: 'Got any cherries?', from: { id: 9, name: 'Bo' } } }));
    assert.equal(row.id, LETTER_ROW(ID));
    assert.equal(row.sender, 'Ada');
    assert.equal(row.fromId, 7);
    assert.equal(row.ledger, `mail-${ID}-c`);
    assert.deepEqual(row.attachment, { classTsid: 'cherry', count: 3 });
    assert.equal(row.currants, 25);
    assert.equal(row.attachmentsClaimed, false);
    assert.equal(row.express, false);
    assert.deepEqual(row.quote, { text: 'Got any cherries?', from: 'Bo' });
    const box = createMailboxState();
    const kept = deliverMail(box, row);
    assert.equal(kept.ledger, row.ledger);
    assert.equal(kept.fromId, 7);
    assert.equal(kept.playerMail, ID);
    assert.notEqual(kept.express, true);
    assert.deepEqual(kept.quote, { text: 'Got any cherries?', from: 'Bo' });
    // Round trip through a save.
    const again = normalizeMailboxState(JSON.parse(JSON.stringify(box))).messages[0];
    assert.equal(again.ledger, row.ledger);
    assert.equal(again.fromId, 7);
    assert.notEqual(again.express, true);
  });

  it('HOMES2: a parcel waits for a mailbox; words alone carry nothing to collect', () => {
    const away = letterRow(letter());
    assert.equal(isExpressPending(away), false);
    assert.equal(parcelWaits(away), true);
    const words = letterRow(letter({ item: null, currants: 0 }));
    assert.equal(words.express, false);
    assert.equal(words.ledger, undefined, 'nothing to collect');
    assert.equal(words.attachmentsClaimed, true);
    const coins = letterRow(letter({ item: null }));
    assert.equal(coins.express, false, 'currants alone go to the mailbox (main.js 6747)');
    assert.equal(coins.ledger, `mail-${ID}-c`);
  });

  it('never hands a player\'s parcel over locally, and the Frog brings none (HOMES2)', () => {
    const box = createMailboxState();
    const row = deliverMail(box, letterRow(letter()));
    assert.equal(isExpressPending(row), false);
    assert.equal(isExpressPending({ ...row, express: true }), true, 'an old save\'s row: the feature moves it into the mailbox (take)');
    const inv = {};
    const pc = { currants: 0 };
    assert.deepEqual(handOver({ ...row, express: true }, inv, pc), { ok: false, reason: 'ledger' });
    assert.deepEqual(inv, {});
    assert.equal(pc.currants, 0);
    // An auction delivery is still never the Frog's.
    const auc = deliverMail(box, { id: 'auc-x', sender: 'AFLC', text: 'x', attachment: { classTsid: 'cherry', count: 1 }, ledger: 'auc-00000000000000b2-d' });
    assert.notEqual(auc.express, true);
    assert.equal(isExpressPending({ ...auc, express: true }), false);
  });

  it('HOMES2: things a letter holds wait for a mailbox; the button counts them', () => {
    const rows = [
      letterRow(letter()),
      letterRow(letter({ id: '00000000000000a2', item: null, currants: 0 })),
      letterRow(letter({ id: '00000000000000a3', collected: true })),
      letterRow(letter({ id: '00000000000000a4', box: 'returned' })),
      { id: 'auc-1', ledger: 'auc-00000000000000b2-d', attachmentsClaimed: false },
      { id: 'sent', outgoing: true, ledger: 'mail-00000000000000a5-c' },
    ];
    assert.deepEqual(rows.map(parcelWaits), [true, false, false, true, true, false]);
    assert.equal(parcelsWaiting(rows), 3);
    assert.match(PLAYER_MAIL_TEXT.parcelFrom('Ada'), /^Ada sent you a parcel\. Collect it at any mailbox\.$/);
    assert.deepEqual(mailText(1, 1), { sub: '1 unread · A parcel waits at any mailbox', label: 'Mail, 1 unread, A parcel waits at any mailbox' });
    assert.deepEqual(mailText(0, 2), { sub: '2 parcels wait at any mailbox', label: 'Mail, 2 parcels wait at any mailbox' });
    assert.deepEqual(mailText(0, 0), { sub: 'No new mail', label: 'Mail' });
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /const notHere = canReceive && message\.ledger && !mailboxAt;/, 'the reader takes things only at a mailbox');
    assert.match(game, /openMailboxPanel\(\{ atMailbox: true \}\)/, 'your home street\'s mailbox');
    assert.match(readFileSync(join(root, 'public/js/features/street-furniture-feature.js'), 'utf8'), /engine\.openMailbox\?\.\(\{ atMailbox: true \}\)/, 'a street mailbox');
    assert.match(game, /onMail: \(\) => \{ if \(state\.started\) openMailboxPanel\(\); \},/, 'the button reads and writes anywhere');
  });

  it('HOMES2: the original opened mail only at a mailbox and the Frog brought a stack in person (where this differs)', () => {
    const gs = (f) => readFileSync(join(root, '..', 'glitch-GameServerJS', f), 'utf8').split('\n');
    assert.match(gs('items/npc_mailbox.js').slice(175, 191).join('\n'), /view_inbox/);
    assert.match(gs('main.js')[6676], /mail_add_player_delivery\(itemstack_tsid, .*, false, reply\)/, 'a stack: to_mailbox false, the Frog');
    const client = readFileSync(join(root, '..', 'glitch-client', 'com', 'tinyspeck', 'engine', 'port', 'MailManager.as'), 'utf8').split('\n');
    assert.match(client[84], /if\(!itemstack_tsid\) return;/, 'the client checks mail only with a mailbox named');
  });

  it('reads a letter that came back from the Post, with nobody to reply to', () => {
    const row = letterRow(letter({ box: 'returned', why: 'gone', returned: 'Your letter to Bo came back: there is nobody at that address any more. Here are your things.' }));
    assert.equal(row.id, RETURN_ROW(ID));
    assert.equal(row.sender, 'Groddle Afternoon Post');
    assert.equal(row.fromId, undefined);
    assert.match(row.text, /came back/);
    assert.match(row.text, /Cherries for you/);
    assert.equal(row.express, false);
    assert.equal(row.ledger, `mail-${ID}-c`);
  });

  it('keeps your sent letter as a Sent row, nothing moved', () => {
    const box = createMailboxState();
    const sent = recordSentMail(box, sentRow({ ...letter(), box: 'sent' }));
    assert.equal(sent.outgoing, true);
    assert.equal(sent.recipient, 'Bo');
    assert.equal(sent.attachmentsClaimed, true);
    assert.equal(recordSentMail(box, sentRow({ ...letter(), box: 'sent' })), null, 'once');
    assert.equal(listMailboxMessages(box, { now: Date.now(), outgoing: true }).length, 1);
    assert.equal(box.totalSent, 1);
  });

  it('applies the site\'s receipts as moves of the pack and purse', () => {
    const s = normalizeMailReceipt({ op: `mail-${ID}-s`, gave: { items: [{ c: 'cherry', n: 3 }], currants: 32 }, got: { items: [], currants: 0 } });
    assert.deepEqual(mailReceiptEffects(s), { pack: { cherry: -3 }, currants: -32 });
    const c = normalizeMailReceipt({ op: `mail-${ID}-c`, gave: { items: [], currants: 0 }, got: { items: [{ c: 'cherry', n: 3 }], currants: 25 } });
    assert.deepEqual(mailReceiptEffects(c), { pack: { cherry: 3 }, currants: 25 });
    assert.equal(c.kind, 'c');
    assert.equal(c.id, ID);
    assert.equal(normalizeMailReceipt({ op: 'auc-00000000000000a1-d' }), null);
    assert.match(newLetterId(), /^[0-9a-f]{16}$/);
    assert.equal(goodsWords({ classTsid: 'cherry', count: 3 }, 25, (c, n) => `${n} ${c}`), '3 cherry and 25 currants');
    assert.deepEqual(normalizePlayerMailSlice({ seen: ['pm-' + ID, 'junk', 'pmr-' + ID], toldAt: 5 }), { seen: ['pm-' + ID, 'pmr-' + ID], toldAt: 5 });
  });

  it('shows the phone companion the letters the save has not taken in yet', () => {
    const rows = [{ id: LETTER_ROW(ID), sender: 'Ada', text: 'x', snippet: 'x', at: 5, unread: false, item: null, currants: 0, collected: false, onItsWay: false }];
    const out = mergePlayerMail(rows, { letters: [letter({ collected: true }), letter({ id: '00000000000000c3', item: null, currants: 0, text: 'Hello from far away', at: 9 }), letter({ id: '00000000000000d4', at: Date.now() + 60_000 })] }, 1_000_000_000);
    assert.equal(out.length, 2, 'a letter still on its way is not shown');
    assert.equal(out.find((r) => r.id === LETTER_ROW(ID)).collected, true);
    assert.equal(out.find((r) => r.id === LETTER_ROW('00000000000000c3')).sender, 'Ada');
    assert.deepEqual(mergePlayerMail(rows, null).map((r) => r.id), [LETTER_ROW(ID)]);
  });
});

describe('solo is untouched', () => {
  it('answers nothing in solo', () => {
    playerMailFeature.restore({ seen: ['pm-' + ID] }, { mode: 'solo' });
    playerMailFeature.init({ mode: 'solo' });
    assert.equal(playerMailFeature.mailCompose({ mode: 'solo' }), null);
    assert.equal(playerMailFeature.mailSend({ to: 'Bo' }, { mode: 'solo' }), null);
    assert.equal(playerMailFeature.mailReceive({ ledger: `mail-${ID}-c` }, { mode: 'solo' }), null);
    assert.equal(playerMailFeature.save(), undefined);
  });

  it('is registered once, after the trade feature (ledgerReceipt) and before street-objects; game.js asks it', () => {
    const index = readFileSync(join(root, 'public/js/features/index.js'), 'utf8');
    assert.equal((index.match(/player-mail-feature\.js/g) || []).length, 1);
    assert.ok(index.indexOf('player-mail-feature.js') > index.indexOf('trade-feature.js'));
    assert.ok(index.indexOf('player-mail-feature.js') < index.indexOf('street-objects-feature.js'));
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /features\.query\('mailCompose', engine\)/);
    assert.match(game, /features\.query\('mailSend', \{ \.\.\.f, reply: reply\?\.playerMail \|\| null \}, engine\)/);
    assert.match(game, /recordSentMail\(row\) \{/);
    const courier = readFileSync(join(root, 'public/js/features/mail-courier-feature.js'), 'utf8');
    assert.match(courier, /msg\.ledger \? await ledgerHandOver\(engine, msg, room\)/);
  });
});

describe('the site\'s rules', { skip: skipSite }, () => {
  it('has the table tools/build-mail.mjs writes', () => {
    assert.equal(readFileSync(sitePath('data/mail.json'), 'utf8'), mailJson());
  });

  it('charges the postage the game shows, and refuses as the game says', () => {
    const cases = [[null, 0, 0], ['apple', 10, 0], ['cherry', 1, 0], ['cosmox', 3, 0], [null, 0, 100], ['antique_spigot', 5, 5000], ['bag_butler', 3, 0], ['potato', 999, 999999]];
    const out = php(`echo json_encode([
      'cost' => array_map(fn ($x) => LedgerMail::cost($x[0], $x[1], $x[2]), ${JSON.stringify(cases)}),
      'refuse' => [LedgerMail::sendRefusal('', null, 0), LedgerMail::sendRefusal('hi', ['c' => 'greeter_twig', 'n' => 1], 0), LedgerMail::sendRefusal('', ['c' => 'apple', 'n' => 1000], 0), LedgerMail::sendRefusal('', null, 1000000), LedgerMail::sendRefusal('hi', ['c' => 'apple', 'n' => 3], 10)],
      'call' => [LedgerMail::call(['id' => '${ID}', 'to' => ' Bo ', 'text' => str_repeat('x', 400), 'item' => ['c' => 'apple', 'n' => 3], 'currants' => 5]), LedgerMail::call(['id' => 'nope', 'to' => 'Bo']), LedgerMail::call(['id' => '${ID}', 'to' => 9, 'currants' => 1.5])],
      'shown' => [LedgerMail::shown(['status' => 'sent', 'class_tsid' => '', 'currants' => 0, 'from_id' => 7], [7]), LedgerMail::shown(['status' => 'sent', 'class_tsid' => 'apple', 'currants' => 0, 'from_id' => 7], [7]), LedgerMail::shown(['status' => 'sent', 'class_tsid' => '', 'currants' => 0, 'from_id' => 7], [8])],
      'op' => LedgerMail::op('${ID}', 'c'),
      'rules' => LedgerMail::rules(),
    ]);`);
    assert.deepEqual(out.cost, cases.map(([c, n, currants]) => playerMailCost({ c, n, currants }, ITEM_BASE_COSTS)));
    assert.deepEqual(out.refuse, [['empty', PLAYER_MAIL_TEXT.empty], ['type', "That can't be sent by mail."], ['bad_count', 'Choose how many to send, from 1 to 999.'], ['bad_currants', 'Enclose from 0 to 999,999 currants.'], null]);
    assert.equal(out.call[0].text.length, 300);
    assert.equal(out.call[0].to, 'Bo');
    assert.deepEqual(out.call[0].item, { c: 'apple', n: 3 });
    assert.equal(out.call[1], null);
    assert.equal(out.call[2], null);
    assert.deepEqual(out.shown, [false, true, true], 'build_mail_check_msg 1356-1358');
    assert.equal(out.op, `mail-${ID}-c`);
    assert.deepEqual(out.rules, PLAYER_MAIL_RULES);
  });

  it('is registered with Minn and its table declared', () => {
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /new LedgerMail\(\$minn\)/);
    const manifest = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8'));
    const cols = manifest.tables.groddle_player_mail;
    assert.ok(cols.some((c) => c.startsWith('PRIMARY KEY')));
    for (const c of ['from_id ', 'to_id ', 'deliver_to ', 'deliver_at ', 'collected_at ', 'status ']) assert.ok(cols.some((x) => x.startsWith(c)), c);
  });
});
