/**
 * G570: the letters the game writes show a real subject in the mailbox reader instead of
 * "Delivered message". The original's mail had no subjects at all (GSJS players/inc_mail.js keeps
 * none; glitch-client MailReadUI.as shows From, Received and the words), so every subject is ours.
 * A player's letter, and a letter saved before subjects, keeps the old title.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAIL_SUBJECTS, createMailboxState, deliverMail, mailTitle, normalizeMailboxState, seedMailbox, sendMail } from '../public/js/mailbox.js?v=a3e833ba';
import { deliveryMail, mailSubject } from '../public/js/auctions.js?v=3cdbb521';
import { NEIGHBOURS, doChore, normalizeNeighbourState, postNoteReply, visitorLetter } from '../public/js/neighbours.js?v=161fc2e5';
import { PLAYER_MAIL_TEXT, letterRow } from '../public/js/player-mail.js?v=af6a8b00';
import { HAS_SITE, SITE_DIR } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const hasPhp = spawnSync('php', ['-v']).status === 0;

describe('G570: subjects on the game\'s own letters', () => {
  it('the reader titles a letter by its subject, else as before', () => {
    assert.equal(mailTitle({ subject: 'Your garden crops' }), 'Your garden crops');
    assert.equal(mailTitle({}), 'Delivered message');
    assert.equal(mailTitle({ outgoing: true }), 'Sent message');
    assert.equal(mailTitle({ replyTo: 'mail-1' }), 'Re: Delivered message');
    assert.equal(mailTitle({ replyTo: 'mail-1', subject: 'Your letter' }), 'Re: Your letter');
    const game = read('public/game.js');
    assert.match(game, /<h3 class="mail-message-title">\$\{escapeHtml\(mailTitle\(message\)\)\}<\/h3>/);
    assert.doesNotMatch(game, /'Delivered message'/, 'one place decides the title');
  });

  it('a letter saved before subjects still loads and renders; a subject survives a save', () => {
    const old = normalizeMailboxState({ messages: [{ id: 'mail-1', sender: 'Tiny Speck Post', text: 'Hello', deliveryAt: 5 }] });
    assert.equal('subject' in old.messages[0], false);
    assert.equal(mailTitle(old.messages[0]), 'Delivered message');
    const box = createMailboxState();
    deliverMail(box, { sender: 'Amp', subject: '  Welcome home  ', text: 'hi', deliveryAt: 5 });
    const back = normalizeMailboxState(JSON.parse(JSON.stringify(box)));
    assert.equal(back.messages[0].subject, 'Welcome home');
    assert.equal(normalizeMailboxState({ messages: [{ text: 'x', subject: 'y'.repeat(200) }] }).messages[0].subject.length, 80);
  });

  it('the welcome letters and a companion\'s reply carry subjects; the player\'s own letter does not', () => {
    const box = seedMailbox(createMailboxState(), 1_000_000);
    assert.deepEqual(box.messages.map((m) => m.subject), [MAIL_SUBJECTS.welcome, MAIL_SUBJECTS.ampWelcome]);
    const out = sendMail(box, { currants: 100 }, {}, { recipient: 'Amp', text: 'The kettle chose tea', now: 2_000_000 });
    assert.equal(out.ok, true);
    const sent = box.messages.find((m) => m.id === out.id);
    const reply = box.messages.find((m) => m.id === out.replyId);
    assert.equal(mailTitle(sent), 'Sent message');
    assert.equal(mailTitle(reply), 'Re: Your letter');
  });

  it('auction deliveries, neighbours\' letters and returned letters have subjects', () => {
    assert.deepEqual(['purchased', 'cancelled', 'expired'].map(mailSubject), ['Your auction purchase', 'Your cancelled auction', 'Your expired auction']);
    assert.equal(deliveryMail({ id: '00000000000000a1', kind: 'expired', at: 5, item: { c: 'apple', n: 1 } }).subject, 'Your expired auction');
    const nb = normalizeNeighbourState({});
    const n = NEIGHBOURS.find((x) => x.chore !== 'gift') || NEIGHBOURS[0];
    const chore = doChore(nb, n, { energy: 100, mood: 50, maxMood: 100, xp: 0 }, { dayKey: 'd1', now: 10, energy: 100, have: { grain: 99 } });
    assert.equal(chore.letter?.subject, 'Thank you');
    assert.equal(postNoteReply(nb, n, { title: 'Hello' }, { dayKey: 'd1', now: 10 }).subject, 'Your note');
    assert.equal(visitorLetter({ ...nb, allowVisits: true }, { dayKey: 'd2', homeOwned: true, now: 10 }).subject, 'I stopped by');
    const returned = letterRow({ id: '00000000000000b1', box: 'returned', to: { name: 'Bo' }, returned: 'Your letter to Bo came back.', text: 'hi', at: 5 });
    assert.equal(returned.subject, PLAYER_MAIL_TEXT.returnedSubject);
    assert.equal(mailTitle(returned), 'Your letter came back');
  });

  it('a site letter keeps the site\'s subject; a player\'s letter has none', () => {
    const base = { id: '00000000000000c1', box: 'in', to: { id: 9, name: 'Bo' }, text: 'x', item: { c: 'cherry', n: 3 }, currants: 0, at: 5, sent: 5, collected: false, reply: null };
    const payout = letterRow({ ...base, from: { id: 0, name: 'Groddle Afternoon' }, subject: 'Your garden crops' });
    assert.equal(mailTitle(payout), 'Your garden crops');
    const player = letterRow({ ...base, from: { id: 7, name: 'Ada' } });
    assert.equal('subject' in player, false);
    assert.equal(mailTitle(player), 'Delivered message');
    // Letters a save took in before subjects get them when the site lists them again.
    assert.match(read('public/js/features/player-mail-feature.js'), /if \(row\.subject && !have\.subject\) have\.subject = row\.subject;/);
    assert.match(read('public/js/features/auctions-feature.js'), /if \(!have\.subject\) have\.subject = row\.subject;/);
  });

  it('every game-made letter in the features names its subject', () => {
    assert.match(read('public/js/features/mail-courier-feature.js'), /sender: MAIL_POST_SENDER, subject: 'A special delivery', text: "Here's a special delivery just for you!"/);
    assert.match(read('public/js/features/mail-courier-feature.js'), /sender: AUCTION_SENDER,\n\s+subject: mailSubject\(kind\),/);
    assert.match(read('public/js/features/seasons-feature.js'), /sender: MAIL_POST_SENDER, subject: 'A gift from the Yeti', text: SEASON_DATA\.yetiMail/);
    const sf = read('public/js/features/street-furniture-feature.js');
    assert.equal((sf.match(/sender: MAIL_POST_SENDER,\n\s+subject: 'Mail on every street',/g) || []).length, 2);
    // Every literal game letter (a sender on a deliverMail row) carries a subject.
    for (const f of ['public/js/features/mail-courier-feature.js', 'public/js/features/seasons-feature.js']) {
      for (const call of read(f).match(/engine\.deliverMail\?\.\(\{ sender:[^\n]*/g) || []) assert.match(call, /subject: /, `${f}: ${call.slice(0, 80)}`);
    }
  });

  it('subjects are plain and short (no em-dash, no trademark)', () => {
    const all = [...Object.values(MAIL_SUBJECTS), ...['purchased', 'cancelled', 'expired'].map(mailSubject), PLAYER_MAIL_TEXT.returnedSubject,
      'A special delivery', 'A gift from the Yeti', 'Mail on every street', 'Thank you', 'Your note', 'I stopped by', 'Your garden crops', 'Your Patch tree is shared', 'Your Patch beans'];
    for (const s of all) {
      assert.doesNotMatch(s, /—|Glitch/, s);
      assert.ok(s.length <= 30, s);
    }
  });
});

describe('G570: the site titles its letters from nobody (src/LedgerMail.php subject)', { skip: !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false }, () => {
  const php = (body) => JSON.parse(execFileSync('php', ['-r', `foreach (['Economy', 'LedgerMath', 'WordFilter', 'LedgerGift', 'LedgerMail', 'GardenPayout', 'PatchPayout'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\LedgerMail as M; use Groddle\\Minn\\GardenPayout as P; use Groddle\\Minn\\PatchPayout as Q; ${body}`]).toString());

  it('the gardens payout\'s crops are "Your garden crops"; a player\'s letter has no subject', () => {
    const out = php(`echo json_encode([
      'payout' => M::subject(['from_id' => '0', 'text' => P::TEXT]),
      'other' => M::subject(['from_id' => 0, 'text' => 'Something else']),
      'player' => M::subject(['from_id' => 7, 'text' => P::TEXT]),
      'subject' => P::SUBJECT,
    ]);`);
    assert.deepEqual(out, { payout: 'Your garden crops', other: null, player: null, subject: 'Your garden crops' });
    // G564: the street Patches payout's two letters.
    const patches = php(`echo json_encode([
      'refund' => M::subject(['from_id' => 0, 'text' => Q::REFUND_TEXT]),
      'win' => M::subject(['from_id' => 0, 'text' => Q::WIN_START . 'Your Fruit Tree on Pental Leave is now a shared Patch tree.']),
      'player' => M::subject(['from_id' => 7, 'text' => Q::REFUND_TEXT]),
    ]);`);
    assert.deepEqual(patches, { refund: 'Your Patch beans', win: 'Your Patch tree is shared', player: null });
    const src = readFileSync(join(SITE_DIR, 'src/LedgerMail.php'), 'utf8');
    assert.match(src, /if \(\(\$subject = self::subject\(\$r\)\) !== null\) \{\n\s+\$letter\['subject'\] = \$subject;/);
  });
});
