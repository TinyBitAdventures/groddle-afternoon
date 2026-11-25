/**
 * #544: two Generic Bags of one colour, one holding things and one empty; Sell 2 sold both and
 * what the full one held went to the pack and the magic rock. A vendor (report #79), a trade
 * (inc_trading.js 465-469 "You may not trade non-empty bags.") and a letter (inc_mail.js
 * mail_can_send 26-29) take only empty bags.
 *
 * - pack-slots.js saleBags counts a class's empty bags and checks the count against the pack laid
 *   out with that many fewer: every bag that holds something must stay. Before, a saved row whose
 *   bag was already gone counted as one more empty bag, so a count of 2 took the full one too.
 * - The letter and the trade ask the same question (bags-feature packSaleBags) instead of counting
 *   full bags themselves, so the empty ones are lined up to be the ones that leave.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addItem } from '../public/js/inventory.js?v=6414dbdc';
import { layoutPack, saleBags } from '../public/js/pack-slots.js?v=38e4aea5';
import { bagsFeature } from '../public/js/features/bags-feature.js?v=db26bbe1';
import { VENDOR_BAG_HOLDS, createVendorSellQuote, vendorSell } from '../public/js/vendor.js?v=f9bee39e';
import { TRADE_TEXT } from '../public/js/trade.js?v=5fb43d2f';

const root = join(import.meta.dirname, '..');
const HELD = ['plank', 'apple', 'cherry'];

/** Two Generic Bags: b1 holds three stacks, b2 is empty; `order` is the saved order of the rows. */
function twoBags(order = ['b1', 'b2']) {
  const inv = {};
  addItem(inv, 'bag_generic', 2);
  for (const c of HELD) addItem(inv, c, 3);
  addItem(inv, 'orange', 2);
  const prefs = {
    bags: order.map((key) => ({ key, cls: 'bag_generic' })),
    place: { pack: ['@b1', '@b2', 'orange'], b1: HELD, b2: [] },
    n: { pack: [0, 0, 2], b1: [3, 3, 3], b2: [] },
  };
  return { inv, prefs };
}

const engineFor = (inv, mode) => ({
  mode, inv, started: true, data: {},
  setData(k, v) { this.data[k] = v; }, pushActivity() {}, toast() {}, param: () => null, save() {}, updateHud() {}, refreshPack() {},
  query() { return null; },
});

describe('#544 saleBags: a count never takes a bag that holds something', () => {
  it('a saved row whose bag is gone is not one more empty bag', () => {
    const { inv, prefs } = twoBags();
    // A third row left behind by a bag that already went (sold, mailed, traded).
    prefs.bags.push({ key: 'b3', cls: 'bag_generic' });
    prefs.place.b3 = [];
    prefs.n.b3 = [];
    const res = saleBags(inv, prefs, 'bag_generic');
    assert.equal(res.empty, 1);
    const after = layoutPack({ ...inv, bag_generic: 1 }, res.prefs);
    assert.deepEqual(after.bags.b1.slots.map((s) => s.cls), HELD);
  });

  it('never more than the bags held', () => {
    const { inv, prefs } = twoBags();
    inv.bag_generic = 1;
    for (const c of HELD) inv[c] = 0;
    assert.ok(saleBags(inv, prefs, 'bag_generic').empty <= 1);
  });
});

describe('#544 Sell 2 with one full Generic Bag and one empty, solo and online', () => {
  for (const mode of ['solo', 'multiplayer']) {
    for (const order of [['b1', 'b2'], ['b2', 'b1']]) {
      it(`${mode}, rows ${order.join(' ')}: the count stops at 1, Sell 2 is refused, Sell 1 takes the empty bag`, () => {
        const { inv, prefs } = twoBags(order);
        const e = engineFor(inv, mode);
        bagsFeature.restore({ v: 1, prefs, rock: {}, open: '', migrated: true, starter: 'none' }, e);
        const before = bagsFeature.packLayout(e);
        assert.deepEqual(before.bags.b1.slots.map((s) => s.cls), HELD);
        const opts = { emptyBags: (c) => bagsFeature.packSaleBags(c, e, ''), slotted: (c) => bagsFeature.packSlotted(c, e) };
        const q = createVendorSellQuote(inv, [], 'bag_generic', 2, [], opts);
        assert.equal(q.ok, true);
        assert.equal(q.maxQty, 1);
        const pc = { currants: 0 };
        const two = vendorSell(pc, inv, [], 'bag_generic', 2, opts);
        assert.equal(two.ok, false);
        assert.deepEqual(two.msgs, [VENDOR_BAG_HOLDS]);
        assert.equal(inv.bag_generic, 2);
        assert.equal(pc.currants, 0);
        const one = vendorSell(pc, inv, [], 'bag_generic', 1, opts);
        assert.equal(one.ok, true);
        const after = bagsFeature.packLayout(e);
        assert.deepEqual(Object.keys(after.bags), ['b1']);
        assert.deepEqual(after.bags.b1.slots.map((s) => [s.cls, s.count]), HELD.map((c) => [c, 3]));
        assert.deepEqual(after.rock, {});
      });
    }
  }
});

describe('#544 a letter and a trade take only empty bags, the empty ones first', () => {
  const mail = readFileSync(join(root, 'public/js/features/player-mail-feature.js'), 'utf8');
  const trade = readFileSync(join(root, 'public/js/features/trade-feature.js'), 'utf8');
  it('the letter asks packSaleBags (which lines the empty bags up to leave)', () => {
    assert.match(mail, /function bagHolds\(c, n\) \{\n\s+const empty = engine\.query\?\.\('packSaleBags', c, engine\);\n\s+return empty != null && n > empty;/);
  });
  it('the trade asks it when a bag is offered and again before the hold takes it', () => {
    assert.match(trade, /const empty = engine\.query\?\.\('packSaleBags', c, engine\);/);
    assert.match(trade, /if \(bagsHold\(c, \(countsOf\(open\.draft\)\[c\] \|\| 0\) - n0\(saved\.hold\?\.items\?\.\[c\]\) \+ n\)\) \{\n\s+line\(TRADE_TEXT\.bagHolds, 'error'\);/);
    assert.match(trade, /if \(more > 0 && bagsHold\(c, more\)\) return false;/);
  });
  it("the trade's refusal is the source's", () => {
    const src = readFileSync(join(root, '..', 'glitch-GameServerJS', 'players', 'inc_trading.js'), 'utf8');
    assert.ok(src.includes(`error: "${TRADE_TEXT.bagHolds}"`));
  });
});
