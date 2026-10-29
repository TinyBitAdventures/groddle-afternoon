/**
 * Register G332 (the rest): items dropped on a public street are everyone's
 * in multiplayer, and dragging a pack item onto another player opens the
 * Give window. The pure rules are js/drops-mp.js; the site's routes
 * (src/LedgerDrop.php) are checked through php -r (skipped without the site
 * or php); the server's rules are drops_test.go. Solo is untouched: the
 * feature answers nothing there, and game.js asks it only through hooks.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DROP_LOCK_RADIUS,
  DROP_REACH,
  DROP_TEXT,
  dropEffect,
  groundFrom,
  isPublicStreet,
  normalizeGroundStack,
  normalizeMine,
  shareReason,
} from '../public/js/drops-mp.js?v=g375-1';
import { dropsMpFeature } from '../public/js/features/drops-mp-feature.js?v=g403-1';
import { giftsFeature } from '../public/js/features/gifts-feature.js?v=g416-1';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath, sitePath } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const TABLE = JSON.parse(readFileSync(join(root, 'public/assets/content/trade-items.json'), 'utf8'));
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;
const OP = 'drop-00000000000000a1';

function php(body) {
  const code = `foreach (['LedgerDrop'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\LedgerDrop; ${body}`;
  return JSON.parse(execFileSync('php', ['-r', code]).toString());
}

describe('what a drop shares', () => {
  it('shares a tradeable stack on a public street only', () => {
    const street = 'LA5101HF7F429V';
    assert.equal(isPublicStreet(street), true);
    for (const s of ['', 'HOME_7', 'HOUSE_7', 'PARTY_12', 'RACE_ab', 'CROWNS_1']) assert.equal(isPublicStreet(s), false, s);
    assert.equal(shareReason('cherry', TABLE, { street }), '');
    assert.equal(shareReason('cherry', TABLE, { street: 'HOME_7' }), 'private');
    assert.equal(shareReason('cherry', TABLE, { street, dropKey: `${street}:floor2` }), 'private', 'a Tower floor keeps its own');
    assert.equal(shareReason('no_such_thing', TABLE, { street }), 'type', 'the ledger does not carry it: the game drops it as its own');
    assert.equal(shareReason('note', { items: { note: {} } }, { street }), 'note', 'a note\'s writing would not travel');
    assert.equal(shareReason('cherry', null, { street }), 'table');
  });

  it('keeps the source\'s numbers (takeable.js:38, config_prod.js:37)', () => {
    assert.equal(DROP_LOCK_RADIUS, 100);
    assert.equal(DROP_REACH, 800);
    assert.equal(DROP_TEXT.locked, 'You are not allowed to pick this up.');
  });

  it('reads the server\'s stacks as game.js draws dropped stacks', () => {
    const s = normalizeGroundStack({ id: OP, c: 'cherry', n: 3, x: 1200, y: -120, by: { id: 7, name: 'Ada' }, at: 1730000000000 }, 'LA5');
    assert.deepEqual(s, { id: OP, streetTsid: 'LA5', classTsid: 'cherry', count: 3, x: 1200, y: -120, droppedAt: 1730000000000, shared: true, by: { id: 7, name: 'Ada' }, subtitle: 'Dropped by Ada · 3 in this pile' });
    assert.equal(normalizeGroundStack({ id: 'world-item-1', c: 'cherry', n: 3 }), null, 'only the server\'s ids');
    assert.equal(normalizeGroundStack({ id: OP, c: 'cherry', n: 0 }), null);
    assert.equal(normalizeGroundStack({ id: OP, c: 'pick', n: 1, r: 40 }).r, 40);
    const g = groundFrom({ street: 'LA5', stacks: [{ id: OP, c: 'apple', n: 1 }, { id: 'x' }] });
    assert.equal(g.street, 'LA5');
    assert.deepEqual(g.stacks.map((x) => x.id), [OP]);
  });

  it('moves the pack only by what the server says moved', () => {
    const label = (c, n) => (n === 1 ? 'Cherry' : 'Cherries');
    assert.deepEqual(dropEffect('dropped', { c: 'cherry', n: 3 }, label), { pack: { cherry: -3 }, tool: null, line: 'You dropped 3× Cherries.', sound: 'ITEM_DROP' });
    assert.deepEqual(dropEffect('took', { c: 'cherry', n: 1 }, label).pack, { cherry: 1 });
    assert.equal(dropEffect('took', { c: 'cherry', n: 1 }, label).line, 'You picked up 1× Cherry.');
    assert.deepEqual(dropEffect('took', { c: 'pick', n: 1, r: 40 }).tool, { c: 'pick', r: 40 });
    assert.equal(dropEffect('back', { c: 'cherry', n: 2 }, label).line, 'Nobody picked up your 2× Cherries, so it came back to your pack.');
    assert.equal(dropEffect('took', { c: '', n: 1 }), null);
  });

  it('reads the site\'s list of ops the save has not applied', () => {
    assert.deepEqual(normalizeMine({ op: OP, side: 'dropped', id: OP, item: { c: 'cherry', n: 3 } }), { op: OP, id: OP, side: 'dropped', item: { c: 'cherry', n: 3 } });
    assert.equal(normalizeMine({ op: `${OP}-t`, id: OP, item: { c: 'cherry', n: 3 }, why: 'pickup' }).side, 'took');
    assert.equal(normalizeMine({ op: `${OP}-t`, id: OP, item: { c: 'cherry', n: 3 }, why: 'return' }).side, 'back');
    assert.equal(normalizeMine({ op: 'gift-00000000000000a1', id: OP, item: { c: 'cherry', n: 3 } }), null);
  });
});

describe('solo is untouched', () => {
  it('answers no game.js hook in solo', () => {
    const engine = { mode: 'solo', started: true, query: () => null };
    dropsMpFeature.init(engine);
    assert.equal(dropsMpFeature.sharedDrop({ classTsid: 'cherry', count: 1, x: 0, y: 0 }, engine), null);
    assert.equal(dropsMpFeature.sharedPickup({ state: { id: OP } }, engine), null);
    assert.equal(dropsMpFeature.sharedDroppedStacks('LA5', engine), null);
    dropsMpFeature.onTick(16, 0, engine);
    assert.equal(globalThis.groddleDrops, undefined);
    giftsFeature.init(engine);
    assert.equal(giftsFeature.packDragStart('cherry', {}, engine), null);
  });

  it('is registered once, before street-objects, and game.js asks it only through hooks', () => {
    const index = readFileSync(join(root, 'public/js/features/index.js'), 'utf8');
    assert.equal((index.match(/drops-mp-feature\.js/g) || []).length, 1);
    assert.ok(index.indexOf('drops-mp-feature.js') > index.indexOf('trade-feature.js'), 'after trade-feature (ledgerReceipt)');
    assert.ok(index.indexOf('drops-mp-feature.js') < index.indexOf('street-objects-feature.js'));
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /features\.query\('sharedDrop', \{ classTsid, count, x, y \}, engine\)/);
    assert.match(game, /features\.query\('sharedPickup', target, engine\)/);
    assert.match(game, /features\.query\('sharedDroppedStacks', droppedStacksTsid\(\), engine\)/);
    assert.match(game, /features\.query\('packDragStart', s\.classTsid, event, engine\)/);
    assert.doesNotMatch(game, /from '[^']*drops-mp/, 'game.js imports nothing of it');
  });
});

describe('the site keeps the stacks and moves them through the ledger', { skip: skipSite }, () => {
  it('checks the realtime server\'s call', () => {
    const ok = php(`echo json_encode(LedgerDrop::call(['op' => '${OP}', 'id' => 7, 'street' => 'LA5101HF7F429V', 'x' => 1200, 'y' => -120, 'item' => ['c' => 'pick', 'n' => 1, 'r' => 40]]));`);
    assert.deepEqual(ok, { op: OP, id: 7, street: 'LA5101HF7F429V', x: 1200, y: -120, c: 'pick', n: 1, r: 40 });
    const bad = php(`echo json_encode([
      LedgerDrop::call(['op' => 'drop-1', 'id' => 7, 'street' => 'LA5', 'item' => ['c' => 'cherry', 'n' => 1]]),
      LedgerDrop::call(['op' => '${OP}', 'id' => 0, 'street' => 'LA5', 'item' => ['c' => 'cherry', 'n' => 1]]),
      LedgerDrop::call(['op' => '${OP}', 'id' => 7, 'street' => 'HOME_7', 'item' => ['c' => 'cherry', 'n' => 1]]),
      LedgerDrop::call(['op' => '${OP}', 'id' => 7, 'street' => 'LA5', 'item' => ['c' => 'cherry', 'n' => 0]]),
      LedgerDrop::call(['op' => '${OP}', 'id' => 7, 'street' => 'LA5', 'item' => ['c' => 'Cherry!', 'n' => 1]]),
      LedgerDrop::call(['op' => '${OP}', 'id' => 7, 'street' => 'LA5', 'x' => 1.5, 'item' => ['c' => 'cherry', 'n' => 1]]),
    ]);`);
    assert.deepEqual(bad, [null, null, null, null, null, null]);
    assert.deepEqual(php(`echo json_encode([LedgerDrop::opId('${OP}'), LedgerDrop::opId('${OP}-t'), LedgerDrop::opId('gift-00000000000000a1')]);`), [true, false, false]);
  });

  it('is registered with Minn and its table declared', () => {
    const ext = readFileSync(sitePath('src/Extension.php'), 'utf8');
    assert.match(ext, /new LedgerDrop\(\$minn\)/);
    const manifest = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8'));
    const cols = manifest.tables.groddle_drops;
    assert.ok(cols.some((c) => c.startsWith('PRIMARY KEY')));
    for (const c of ['dropper_id', 'street', 'class_tsid', 'count', 'status', 'taker_id']) assert.ok(cols.some((x) => x.startsWith(`${c} `)), c);
  });
});

describe('the server says the source\'s words', { skip: HAS_SERVER ? false : 'no server checkout' }, () => {
  it('drops.go refuses with takeable.js and main.js lines', () => {
    let go = '';
    try { go = readFileSync(serverPath('drops.go'), 'utf8'); } catch { /* not copied yet */ }
    if (!go) return;
    for (const line of [
      "This item is locked to you and can't be dropped.",
      DROP_TEXT.locked,
      DROP_TEXT.gone,
      'Oops. The %s got too far away for you to pick up. Get closer and then try again.',
    ]) assert.ok(go.includes(line), line);
    assert.match(go, /dropLockRadius\s+= 100\.0/);
    assert.match(go, /dropReach\s+= 800\.0/);
  });
});
