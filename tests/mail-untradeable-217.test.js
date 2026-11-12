/**
 * #217 (Kid Timecard, Austin 2026-11-12 "allow it, as Glitch did"): a full Firefly Jar and the
 * Crabpod Headphones could not be mailed. Glitch's server refused only a bag with things in it
 * (inc_mail.js mail_can_send 26-29, main.js doMailSend 6663-6665 and 6691-6693); its client also
 * refused no_mail items and stacks soulbound to the sender (AbstractMailUI.as isDroppable 60-74)
 * and the hogtied piggy (RESTRICTED_ITEMS 22). No no_trade rule: crabphones (no_trade) went by mail.
 * The site (src/LedgerMail.php) refused everything the ledger cannot price; now an unpriced class
 * goes too, moved exactly once through the saves by the letter's receipts, and the ledger never
 * counts it. The Butler keeps refusing no_trade (bag_butler.js 642, 1013).
 *
 * The site's rules run through php -r (skipped without the site checkout or php); the GSJS and
 * AS3 citations are read when those checkouts are beside the game repo.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MAIL_FULL_BAGS, MAIL_RESTRICTED, NO_MAIL, mailJson, mailTable } from '../tools/build-mail.mjs';
import { playerMailCost } from '../public/js/player-mail.js?v=af6a8b00';
import { ITEM_BASE_COSTS } from '../public/js/store-catalog.js?v=74b56af3';
import { HAS_SITE, SITE_DIR, sitePath } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const GSJS = join(root, '..', 'glitch-GameServerJS');
const AS3 = join(root, '..', 'glitch-client');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;
const trade = JSON.parse(readFileSync(join(root, 'public/assets/content/trade-items.json'), 'utf8'));

function php(body) {
  const code = `foreach (['Economy', 'LedgerMath', 'WordFilter', 'CopyTags', 'LedgerGift', 'LedgerMail', 'Ledger'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\LedgerMail; use Groddle\\Minn\\LedgerMath; use Groddle\\Minn\\Economy; use Groddle\\Minn\\Ledger; ${body}`;
  return JSON.parse(execFileSync('php', ['-r', code]).toString());
}

describe('#217 the mail table lets through what Glitch let through', () => {
  const t = mailTable();

  it('lists the Crabpod Headphones as unpriced (no_trade, not in the ledger) and the Firefly Jar as the ledger\'s', () => {
    assert.equal(trade.untradeable.crabphones, 'no_trade');
    assert.ok(t.unpriced.includes('crabphones'));
    assert.ok(trade.items.firefly_jar, 'the jar is a tradeable class: full or empty, one class');
    assert.ok(!t.unpriced.includes('firefly_jar') && !t.refused.firefly_jar);
    assert.equal(t.base.firefly_jar, 100);
  });

  it('refuses no_mail, soulbound, the hogtied piggy and the always-full wrapped Gift Box', () => {
    assert.deepEqual(t.refused, {
      bag_gift_box_wrapped: 'bag',
      conch: 'no_mail',
      faded_heart: 'no_mail',
      greeter_twig: 'soulbound',
      hogtied_piggy: 'restricted',
      play_cube: 'soulbound',
    });
    assert.deepEqual([...NO_MAIL], ['conch', 'faded_heart']);
    assert.deepEqual([...MAIL_RESTRICTED], ['hogtied_piggy']);
    assert.deepEqual([...MAIL_FULL_BAGS], ['bag_gift_box_wrapped']);
    for (const c of Object.keys(t.refused)) {
      assert.ok(!t.unpriced.includes(c), c);
      assert.equal(t.base[c], undefined, c);
    }
  });

  it('prices every unpriced class from store-catalog.js as the game does', () => {
    for (const c of t.unpriced) {
      const cost = Number(ITEM_BASE_COSTS[c]) || 0;
      assert.equal(t.base[c], cost > 0 ? cost : undefined, c);
    }
  });

  it('is the table the site reads', { skip: HAS_SITE ? false : 'no groddle-afternoon-site checkout' }, () => {
    assert.equal(readFileSync(sitePath('data/mail.json'), 'utf8'), mailJson());
  });
});

describe('#217 the sources', () => {
  it('GSJS mail_can_send refuses only a bag with things in it, and doMailSend asks nothing else', { skip: existsSync(GSJS) ? false : 'no GSJS' }, () => {
    const mail = readFileSync(join(GSJS, 'players/inc_mail.js'), 'utf8').split('\n');
    assert.equal(mail[25], 'function mail_can_send(stack){');
    assert.equal(mail[26].trim(), 'if (stack.is_bag && stack.countContents()) return false;');
    assert.equal(mail[27].trim(), 'return true;');
    const main = readFileSync(join(GSJS, 'main.js'), 'utf8').split('\n');
    assert.match(main[6662], /pc\.mail_can_send\(it\)/);
    assert.match(main[6664], /Item is not allowed to be mailed/);
    const tags = readFileSync(join(GSJS, 'items/catalog_tags.js'), 'utf8');
    assert.match(tags, /"no_mail" : \[\s*'conch',\s*'faded_heart',\s*\]/);
    const phones = readFileSync(join(GSJS, 'items/crabphones.js'), 'utf8');
    assert.match(phones, /"no_trade"/);
    assert.doesNotMatch(phones, /no_mail/);
    const butler = readFileSync(join(GSJS, 'items/bag_butler.js'), 'utf8').split('\n');
    assert.match(butler[641], /hasTag\("no_trade"\)\) return false/, 'the Butler takes no no_trade package');
  });

  it('the AS3 mail window refused no_mail, soulbound and the hogtied piggy', { skip: existsSync(AS3) ? false : 'no AS3 client' }, () => {
    const ui = readFileSync(join(AS3, 'com/tinyspeck/engine/view/ui/mail/AbstractMailUI.as'), 'utf8');
    assert.match(ui, /RESTRICTED_ITEMS:Array = \['hogtied_piggy'\]/);
    assert.match(ui, /hasTags\('no_mail'\) \|\| dragVO\.dragged_itemstack\.is_soulbound_to_me/);
  });
});

describe('#217 the site sends an unpriced class once', { skip: skipSite }, () => {
  it('lets the headphones and a full jar into a letter and keeps Glitch\'s refusals', () => {
    const out = php(`echo json_encode([
      'phones' => LedgerMail::sendRefusal('', ['c' => 'crabphones', 'n' => 1], 0),
      'jar' => LedgerMail::sendRefusal('', ['c' => 'firefly_jar', 'n' => 1, 'r' => 7], 0),
      'jarCall' => LedgerMail::call(['id' => '00000000000000b2', 'to' => 'Bo', 'item' => ['c' => 'firefly_jar', 'n' => 1, 'r' => 7]]),
      'refused' => array_map(fn ($c) => LedgerMail::sendRefusal('', ['c' => $c, 'n' => 1], 0), ['conch', 'faded_heart', 'play_cube', 'greeter_twig', 'hogtied_piggy', 'bag_gift_box_wrapped', 'not_a_thing']),
      'mailable' => [LedgerMail::mailable('crabphones'), LedgerMail::mailable('firefly_jar'), LedgerMail::mailable('conch'), LedgerMail::unpriced('crabphones'), LedgerMail::unpriced('firefly_jar')],
      'cost' => LedgerMail::cost('crabphones', 1, 0),
    ]);`);
    assert.equal(out.phones, null);
    assert.equal(out.jar, null);
    assert.deepEqual(out.jarCall.item, { c: 'firefly_jar', n: 1, r: 7 }, 'the jar\'s Fireflies ride with it as r');
    for (const r of out.refused) assert.deepEqual(r, ['type', "That can't be sent by mail."]);
    assert.deepEqual(out.mailable, [true, true, false, true, false]);
    assert.equal(out.cost, playerMailCost({ c: 'crabphones', n: 1 }, ITEM_BASE_COSTS));
  });

  it('takes it only while the stored save holds it beyond letters not yet applied', () => {
    const out = php(`echo json_encode([
      LedgerMail::unpricedLacking(['crabphones' => 1], [], ['crabphones' => 1]),
      LedgerMail::unpricedLacking(['crabphones' => 1], ['crabphones' => 1], ['crabphones' => 1]),
      LedgerMail::unpricedLacking([], [], ['crabphones' => 1]),
      LedgerMail::unpricedLacking(['crabphones' => 2], ['crabphones' => 1], ['crabphones' => 1]),
    ]);`);
    assert.deepEqual(out, [null, 'crabphones', 'crabphones', null]);
  });

  it('moves the sender\'s and the receiver\'s saves once each by the receipt, and the ledger ignores the class', () => {
    const out = php(`
      $e = Economy::shared();
      $save = fn (array $inv) => ['playerState' => json_encode(['inventory' => (object) $inv, 'player' => ['currants' => 100], 'systems' => ['features' => (object) []]])];
      $inv = fn (array $entries) => json_decode($entries['playerState'], true)['inventory'];
      $gave = ['items' => ['crabphones' => 1], 'currants' => 3];
      $none = ['items' => [], 'currants' => 0];
      $s1 = LedgerMath::applyTrade($save(['crabphones' => 1, 'apple' => 2]), 'mail-00000000000000c3-s', $gave, $none);
      $s2 = LedgerMath::applyTrade($s1, 'mail-00000000000000c3-s', $gave, $none);
      $r1 = LedgerMath::applyTrade($save([]), 'mail-00000000000000c3-c', $none, $gave);
      $r2 = LedgerMath::applyTrade($r1, 'mail-00000000000000c3-c', $none, $gave);
      // A save write before the sender's save applies the receipt: the view still expects the headphones.
      $view = LedgerMath::view(['items' => ['apple' => 2], 'currants' => 97], [['gave' => $gave, 'got' => $none]]);
      $held = LedgerMath::holdings($save(['crabphones' => 1, 'apple' => 2]), $e);
      $rec = LedgerMath::reconcile($view, $held, 0.0, 50000.0, $e);
      // The receiver, before its save shows the headphones it collected.
      $rView = LedgerMath::view(['items' => [], 'currants' => 100], [['gave' => $none, 'got' => ['items' => ['crabphones' => 1], 'currants' => 0]]]);
      $rRec = LedgerMath::reconcile($rView, LedgerMath::holdings($save([]), $e), 0.0, 50000.0, $e);
      echo json_encode(['s1' => $inv($s1), 's2same' => $s1 === $s2, 'r1' => $inv($r1), 'r2same' => $r1 === $r2, 'applied' => LedgerMath::applied($s1),
        'held' => $held['items'], 'rec' => [$rec['delta']['items'], $rec['clamped']['items'], $rec['budget']], 'rRec' => [$rRec['delta']['items'], $rRec['clamped']['items'], $rRec['budget']]]);
    `);
    assert.equal(out.s1.crabphones, 0, 'the sender\'s save loses it');
    assert.equal(out.s1.apple, 2);
    assert.ok(out.s2same, 'applied once: the trade slice lists the op');
    assert.ok(out.applied.includes('mail-00000000000000c3-s'));
    assert.equal(out.r1.crabphones, 1, 'the receiver\'s save gains it');
    assert.ok(out.r2same);
    assert.deepEqual(out.held, { apple: 2 }, 'the ledger never counts it in a save');
    assert.deepEqual(out.rec, [[], [], 0], 'no loss refunded into the budget, nothing clamped');
    assert.deepEqual(out.rRec, [[], [], 0], 'no gain charged or clamped out of the receiver\'s save');
  });

  it('keeps the class out of the ledger rows and checks the save before the ledger', () => {
    const src = readFileSync(sitePath('src/LedgerMail.php'), 'utf8');
    const settle = src.slice(src.indexOf('public static function settleAlone'), src.indexOf('private static function unpricedShort'));
    assert.match(settle, /if \(!self::unpriced\(\(string\) \$c\)\) \{\s*return \(string\) \$c;/);
    // The save row, then the trade and ledger rows, then the pending trades: a save write's order (save, ledger, trades).
    const at = (s) => { const i = settle.indexOf(s); assert.ok(i >= 0, s); return i; };
    assert.ok(at('self::lockSave(') < at('WHERE trade_id = ? FOR UPDATE'), 'the save row before the op\'s trade row');
    assert.ok(at('WHERE trade_id = ? FOR UPDATE') < at('$ledger->lock('));
    assert.ok(at('$ledger->lock(') < at('self::unpricedShort('), 'the ledger row before the trade rows unpricedShort reads');
    assert.equal((settle.match(/if \(\$economy->tradeable\(\(string\) \$c\)\) \{\s*\$delta/g) || []).length, 2, 'only ledger classes move in the ledger');
    assert.match(src, /FROM ' \. \$db->table\(MultiplayerSave::TABLE\) \. ' WHERE user_id = \? FOR UPDATE'/);
    const math = readFileSync(sitePath('src/LedgerMath.php'), 'utf8');
    assert.match(math, /if \(!\$economy->tradeable\(\$c\)\) \{\s*continue;\s*\}\s*\$d = \(\$holdings/);
    // The Butler still takes only what the ledger carries (bag_butler.js 642, 1013: no no_trade).
    assert.match(readFileSync(sitePath('src/ButlerParcels.php'), 'utf8'), /if \(!Economy::shared\(\)->tradeable\(\(string\) \$c\)\) \{\s*return \$refuse\('type'/);
  });
});

describe('#217 a letter\'s unpriced receipt waits for the save (review: no 24 h forgiveness, snapshot reads)', { skip: skipSite }, () => {
  it('waitsForSave: only a mail receipt carrying a class the ledger does not carry', () => {
    const out = php(`
      $e = Economy::shared();
      $none = ['items' => [], 'currants' => 0];
      $phones = ['items' => ['crabphones' => 1], 'currants' => 3];
      $apple = ['items' => ['apple' => 2], 'currants' => 3];
      echo json_encode([
        LedgerMail::waitsForSave('mail-00000000000000c3-s', $phones, $none, $e),
        LedgerMail::waitsForSave('mail-00000000000000c3-c', $none, $phones, $e),
        LedgerMail::waitsForSave('mail-00000000000000c3-s', $apple, $none, $e),
        LedgerMail::waitsForSave('mail-00000000000000c3-c', $none, $apple, $e),
        LedgerMail::waitsForSave('auc-00000000000000c3-l', $phones, $none, $e),
        LedgerMail::waitsForSave('mail-00000000000000c3-s-x', $phones, $none, $e),
        Ledger::givesUnpriced(['trade' => 'mail-00000000000000c3-s', 'gave' => $phones, 'got' => $none], $e),
        Ledger::givesUnpriced(['trade' => 'mail-00000000000000c3-c', 'gave' => $none, 'got' => $phones], $e),
        Ledger::givesUnpriced(['trade' => 'mail-00000000000000c3-s', 'gave' => $apple, 'got' => $none], $e),
      ]);`);
    assert.deepEqual(out, [true, true, false, false, false, false, true, false, false]);
  });

  it('Ledger::pending never stamps it by age, and receipts keeps listing it past PENDING_FOR', () => {
    const ledger = readFileSync(sitePath('src/Ledger.php'), 'utf8');
    assert.match(ledger, /\$old = !AdminConsole::isGive\(\$id\) && !LedgerMail::waitsForSave\(\$id, \$gaveA, \$gaveB, \$this->economy\) && strtotime/);
    const mail = readFileSync(sitePath('src/LedgerMail.php'), 'utf8');
    const receipts = mail.slice(mail.indexOf('private function receipts('), mail.indexOf('public static function waitsForSave('));
    assert.match(receipts, /AND created_at < \? ORDER BY created_at, trade_id LIMIT 1000/);
    assert.match(receipts, /self::waitsForSave\(/);
    assert.match(receipts, /array_slice\(\[\.\.\.\$old, \.\.\.\$rows\], 0, 60\)/, 'the waiting ones first');
  });

  it('a save write applies a waiting send receipt to the stored copy, which a load then skips', () => {
    const ledger = readFileSync(sitePath('src/Ledger.php'), 'utf8');
    const write = ledger.slice(ledger.indexOf('public function write('), ledger.indexOf('// —— Credited markers'));
    assert.match(write, /foreach \(\$pending as \$p\) \{\s*if \(self::givesUnpriced\(\$p, \$this->economy\)\) \{\s*\$entries = \$this->applyOne\(\$entries, \$user, \$p\);/);
    assert.ok(write.indexOf('self::givesUnpriced(') > write.indexOf('LedgerMath::check('), 'after the check, which compares the game\'s own copy');
    // The stored copy, then a load (catchUp applies only what the save does not list), then the game's own receipt.
    const out = php(`
      $save = fn (array $inv) => ['playerState' => json_encode(['inventory' => (object) $inv, 'player' => ['currants' => 100], 'systems' => ['features' => (object) []]])];
      $inv = fn (array $entries) => json_decode($entries['playerState'], true)['inventory'];
      $gave = ['items' => ['crabphones' => 1], 'currants' => 3];
      $none = ['items' => [], 'currants' => 0];
      $op = 'mail-00000000000000c3-s';
      $game = $save(['crabphones' => 2]);
      $stored = LedgerMath::applyTrade($game, $op, $gave, $none);
      $again = LedgerMath::applyTrade($stored, $op, $gave, $none);
      echo json_encode(['stored' => $inv($stored)['crabphones'], 'listed' => in_array($op, LedgerMath::applied($stored), true), 'loadSame' => $again === $stored,
        'short' => LedgerMail::unpricedLacking($inv($stored), [], ['crabphones' => 2]), 'one' => LedgerMail::unpricedLacking($inv($stored), [], ['crabphones' => 1])]);
    `);
    assert.equal(out.stored, 1, 'one of two went with the letter');
    assert.ok(out.listed && out.loadSame, 'listed as applied, so a load does not take a second one');
    assert.equal(out.short, 'crabphones', 'a second letter for both is refused');
    assert.equal(out.one, null);
  });

  it('unpricedShort reads the pending send receipts FOR UPDATE, by the a_id index only', () => {
    const mail = readFileSync(sitePath('src/LedgerMail.php'), 'utf8');
    const short = mail.slice(mail.indexOf('private static function unpricedShort('), mail.indexOf('public static function unpricedLacking('));
    assert.match(short, /WHERE a_id = \? AND trade_id LIKE 'mail-%-s' AND status = 'settled' AND a_applied_at IS NULL FOR UPDATE"/);
    assert.doesNotMatch(short, /b_id = \?/, 'no gap lock on the b_id index (review 2026-11-12)');
    assert.doesNotMatch(short, /MultiplayerSave::TABLE/, 'the save row is locked once, before the ledger (lockSave)');
  });

  it('a takeover never goes back less far than the stored copy\'s own save', () => {
    const out = php(`echo json_encode([
      Ledger::takeoverSince(1000, gmdate('Y-m-d H:i:s', 2000)),
      Ledger::takeoverSince(5000, gmdate('Y-m-d H:i:s', 2000)),
      Ledger::takeoverSince(0, gmdate('Y-m-d H:i:s', 2000)),
      Ledger::takeoverSince(5000, null),
    ]);`);
    assert.deepEqual(out, [1000, 2000, 0, 5000]);
    assert.match(readFileSync(sitePath('src/MultiplayerSave.php'), 'utf8'), /\$ledger->reapply\(\$user, \$entries, Ledger::takeoverSince\(is_int\(\$since\) \? \$since : 0, \$row === null \? null : \(string\) \$row\['updated_at'\]\), time\(\)\)/);
  });
});
