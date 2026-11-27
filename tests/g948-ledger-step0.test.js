/**
 * G948: step 0 of the G942 grants audit (research/audits-2026-11-17/grants/design.md section 7), the
 * quick fixes that stop the multiplayer ledger taking earned goods back from honest players. The site
 * side (groddle-afternoon-site src/LedgerMath.php) runs through the php CLI on made-up fixture saves;
 * no player data. Gap numbers are gaps.md part A (honest losses) and B (free gains).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { gameFiles, gameText } from '../tools/build-economy.mjs';
import { RARE_STORE } from '../public/js/quest-rooms/penalty.js?v=78c900a7';
import { CAMERA_OFFER } from '../public/js/snaps.js?v=b5be8bff';

import { ISLAND_CURRANTS, ISLAND_FLAGS, normalizeNewxpSave } from '../public/js/newxp.js?v=43f8df2c';
import { createIconState, pickUpIcon, placeIcon } from '../public/js/giant-icons.js?v=dae82b5f';
import { GNOME_CLASS } from '../public/js/garden-gnome.js?v=f1410394';
import { NOTE_POLE_CLASS } from '../public/js/home-street-mp.js?v=2af2d58f';
import { FUNPICKLE } from '../public/js/funpickle.js?v=95796317';
import { funpickleFeature } from '../public/js/features/funpickle-feature.js?v=c2740458';
import { HAS_PHP, PHP } from './php.js';

const root = join(import.meta.dirname, '..');
const economy = () => JSON.parse(readFileSync(join(SITE_DIR, 'data/economy.json'), 'utf8'));
const hasPhp = HAS_PHP;
const skip = skipWithoutSite || !hasPhp;

function php(op, args) {
  const code = `
    foreach (['Economy', 'LedgerMath'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerMath};
    $in = json_decode(stream_get_contents(STDIN), true);
    $a = $in['args'];
    echo json_encode(match ($in['op']) {
      'check' => LedgerMath::check($a[0], $a[1], [], $a[2], (float) $a[3], 50000.0, Economy::shared(), null, fn (): int => 0, 1763319600),
      'holdings' => LedgerMath::holdings($a[0], Economy::shared()),
      'baseline' => LedgerMath::markBaseline905($a[0]),
    });`;
  const out = execFileSync(PHP, ['-r', code], { input: JSON.stringify({ op, args }) });
  return JSON.parse(String(out), (k, v) => (Array.isArray(v) && !v.length && ['items', 'made', 'runs', 'capped', 'detail', 'held', 'spent'].includes(k) ? {} : v));
}

const counts = (items = {}, currants = 0) => ({ items, currants });
const none = counts();
/** A made-up multiplayer save: the pack, the purse and feature slices. */
function save({ inv = {}, currants = 0, features = {}, level = 1, xp = 300, dropped = null } = {}) {
  const out = { playerState: JSON.stringify({ version: 7, inventory: inv, player: { currants, xp, level }, systems: { quests: { active: {}, completed: [] }, achievements: { unlocked: [] }, features } }) };
  if (dropped) out.droppedItems = JSON.stringify({ streets: dropped });
  return out;
}
const credited = (more = {}) => ({ base: { base: 1 }, level: { level: 1 }, mark: { base: 1, base905: 1 }, ...more });

describe('G948 A20/A21: the economy builder reads every game folder', () => {
  it('scans js/quest-rooms, js/ui, js/classic, js/builder and js/phone too', () => {
    const files = gameFiles('public/js');
    for (const dir of ['quest-rooms', 'ui', 'classic', 'builder', 'phone', 'features']) {
      assert.ok(files.some((f) => f.startsWith(`public/js/${dir}/`)), dir);
    }
    assert.ok(files.includes('public/js/quest-rooms/penalty.js'));
    assert.match(gameText(), /[^a-z0-9_]rube_potato[^a-z0-9_]/);
  });

  it('the Rube Shaped Potato is no longer credit-gated, and the Camera is no longer capped at 5 a day', { skip: skipWithoutSite }, () => {
    const t = economy();
    // Every class the Extremely Rare Items Vendor sells (quest-rooms/penalty.js) can be bought, so none is credit-only.
    for (const o of RARE_STORE.offers) assert.notEqual(t.items[o.classTsid]?.g, 'credit', o.classTsid);
    assert.ok(RARE_STORE.offers.some((o) => o.classTsid === 'rube_potato'));
    assert.equal(t.items.rube_potato.g, undefined, 'a 500,000-currant purchase reads as an exchange, not a forged potato');
    assert.equal(t.items[CAMERA_OFFER.classTsid].g, undefined);
    assert.equal(t.items[CAMERA_OFFER.classTsid].cap, undefined);
  });
});

describe('G948 A14: the island rock\'s 978 currants stand once per character', { skip }, () => {
  const island = (flags) => ({ newxp: { v: 1, status: 'active', stage: 'island', skill: 'animalkinship_1', flags, island: 'quest_given' } });

  it('the game pays them once, flagging it in the same tick, and the flag survives a reload', () => {
    assert.ok(ISLAND_FLAGS.includes('island_currants'));
    assert.deepEqual(normalizeNewxpSave({ status: 'active', stage: 'island', flags: ['island_currants'] }).flags, ['island_currants']);
    const src = readFileSync(join(root, 'public/js/features/newxp-feature.js'), 'utf8');
    const pay = src.slice(src.indexOf('async function islandRockScript('), src.indexOf('function bagShopProfile('));
    assert.match(pay, /if \(!hasFlag\('island_currants'\)\) \{\n\s+engine\.pc\.currants = \(Number\(engine\.pc\.currants\) \|\| 0\) \+ ISLAND_CURRANTS;\n\s+setFlag\('island_currants'\);/);
  });

  it('a new player\'s 978 stand with no budget; without the flag, or a second time, they go through the budget', () => {
    const r = php('check', [none, credited(), save({ currants: ISLAND_CURRANTS, features: island(['currants_revealed', 'island_currants']) }), 0]);
    assert.deepEqual(r.reconciled.clamped, none);
    assert.equal(r.after.currants, ISLAND_CURRANTS);
    assert.ok(r.rows.some(([k, ref, n]) => k === 'tut' && ref === 'islandcurrants:currants' && n === ISLAND_CURRANTS));
    const unflagged = php('check', [none, credited(), save({ currants: ISLAND_CURRANTS, features: island(['currants_revealed']) }), 0]);
    assert.equal(unflagged.reconciled.clamped.currants, ISLAND_CURRANTS);
    const again = php('check', [none, credited({ tut: { 'islandcurrants:currants': ISLAND_CURRANTS } }), save({ currants: ISLAND_CURRANTS, features: island(['island_currants']) }), 0]);
    assert.equal(again.reconciled.clamped.currants, ISLAND_CURRANTS);
  });

  it('only what the write shows beyond the ledger: a bag already bought leaves the rest', () => {
    const r = php('check', [none, credited(), save({ currants: ISLAND_CURRANTS - 500, inv: { bag_generic: 1 }, features: island(['island_currants']) }), 0]);
    assert.deepEqual(r.reconciled.clamped, none, 'the bag (island set) and the change both stand');
    assert.ok(r.rows.some(([k, ref, n]) => k === 'tut' && ref === 'islandcurrants:currants' && n === ISLAND_CURRANTS - 500));
  });
});

describe('G948 A25: the Egg Plant\'s egg is credited in training2, where it is harvested', { skip }, () => {
  it('a training2 save\'s one egg stands with no budget; a second egg does not', () => {
    const t2 = { newxp: { v: 1, status: 'active', stage: 'training2', flags: [] } };
    const r = php('check', [none, credited(), save({ inv: { egg_plain: 1 }, features: t2 }), 0]);
    assert.deepEqual(r.reconciled.clamped, none);
    assert.deepEqual(r.credits.detail.tutorial, { egg_plain: 1 });
    const two = php('check', [none, credited(), save({ inv: { egg_plain: 2 }, features: t2 }), 0]);
    assert.deepEqual(two.reconciled.clamped, counts({ egg_plain: 1 }));
  });
});

describe('G948 A3: what the Craftybot holds is counted, so its making is never taken back', { skip }, () => {
  // recipe:crystallizer, 20 Molybdenum -> a Crystallizer: the bot fetches, crafts, then Collect.
  const job = (general = {}, complete = {}) => ({ craftybot: { version: 1, owned: true, queue: [{ item: 'crystallizer', count: 1, crafted: 0, holder: { general, complete } }] } });
  const ledger = counts({ molybdenum: 20, pick: 1 });

  it('fetched ingredients and made goods count; a held tool stays counted where it is', () => {
    const h = php('holdings', [save({ inv: { pick: 1 }, features: job({ molybdenum: { count: 20 }, pick: { count: 1, tsid: { pick: 1 } } }, { crystallizer: { count: 1 } }) })]);
    assert.deepEqual(h.items, { crystallizer: 1, molybdenum: 20, pick: 1 });
  });

  it('fetch, craft and Collect in three writes stand with no budget', () => {
    const fetched = php('check', [ledger, credited(), save({ inv: { pick: 1 }, features: job({ molybdenum: { count: 20 } }) }), 0]);
    assert.deepEqual(fetched.reconciled.clamped, none);
    assert.deepEqual(fetched.after, ledger, 'a fetch is a move');
    const made = php('check', [fetched.after, credited(), save({ inv: { pick: 1 }, features: job({}, { crystallizer: { count: 1 } }) }), 0]);
    assert.deepEqual(made.reconciled.clamped, none);
    assert.deepEqual(made.reconciled.made, { crystallizer: 1 }, 'the recipe explains it in the write that crafted it');
    const collected = php('check', [made.after, credited(), save({ inv: { pick: 1, crystallizer: 1 }, features: job() }), 0]);
    assert.deepEqual(collected.reconciled.clamped, none);
    assert.deepEqual(collected.after, counts({ crystallizer: 1, pick: 1 }));
  });
});

describe('G948 A11: things set down (gnome, Giant Icons, Note Poles, pumpkins) are counted where they stand', { skip }, () => {
  /** Put down then picked up again, each in its own write with no budget: nothing is clamped, the ledger never moves. */
  const roundTrip = (ledger, down, up) => {
    const a = php('check', [ledger, credited(), down, 0]);
    assert.deepEqual(a.reconciled.clamped, none);
    assert.deepEqual(a.after, ledger, 'setting it down is a move');
    const b = php('check', [a.after, credited(), up, 0]);
    assert.deepEqual(b.reconciled.clamped, none, 'picking it up is a move, not a gain');
    assert.deepEqual(b.after, ledger);
  };

  it('a Garden Gnome placed at home and picked up', () => {
    roundTrip(counts({ [GNOME_CLASS]: 1 }),
      save({ features: { 'garden-gnome': { placed: [{ id: 'g1', place: 'street', x: 40, phrases: [] }] } } }),
      save({ inv: { [GNOME_CLASS]: 1 } }));
  });

  it('a Giant Icon placed on a street and picked up (the game\'s own placeIcon / pickUpIcon)', () => {
    const state = createIconState();
    const inv = { icon_alph: 1 };
    const put = placeIcon(state, inv, 'alph', 'LA5101HF7F429V5', 300, 500);
    assert.ok(put.ok);
    const down = save({ inv: { ...inv }, features: { 'giant-icons': JSON.parse(JSON.stringify({ version: 2, ...state })) } });
    assert.ok(pickUpIcon(state, inv, 'LA5101HF7F429V5', put.row.id).ok);
    roundTrip(counts({ icon_alph: 1 }), down, save({ inv: { ...inv }, features: { 'giant-icons': { version: 2, ...state } } }));
  });

  it('Note Poles at home and Zilloween pumpkins placed in the house', () => {
    roundTrip(counts({ [NOTE_POLE_CLASS]: 2 }),
      save({ features: { 'home-street-mp': { poles: [{ id: 1, room: 'street', rx: 10, cfg: {}, note: null }, { id: 2, room: 'house', rx: 20, cfg: {}, note: null }], nextPole: 3 } } }),
      save({ inv: { [NOTE_POLE_CLASS]: 2 } }));
    roundTrip(counts({ pumpkin_lit_2: 1 }),
      save({ features: { seasons: { placed: [{ cls: 'pumpkin_lit_2', tsid: 'home', x: 100 }] } } }),
      save({ inv: { pumpkin_lit_2: 1 } }));
  });
});

describe('G948 A9: a Cubimal out racing or battling is still counted as the player\'s', { skip }, () => {
  const ledger = counts({ npc_cubimal_gnome: 1, npc_cubimal_chick: 1 });

  it('a race and a battle: off and back, each in its own write, stand with no budget', () => {
    const out = php('check', [ledger, credited(), save({ features: { 'cubimal-race': { version: 2, out: ['npc_cubimal_gnome'], outNames: [''], outTags: [null] }, 'cubimal-battle': { version: 1, out: { c: 'npc_cubimal_chick', tag: null } } } }), 0]);
    assert.deepEqual(out.reconciled.clamped, none);
    assert.deepEqual(out.after, ledger, 'out of the pack, still held');
    const back = php('check', [out.after, credited(), save({ inv: { npc_cubimal_gnome: 1, npc_cubimal_chick: 1 }, features: { 'cubimal-race': { version: 2, out: [], outNames: [], outTags: [] }, 'cubimal-battle': { version: 1, out: null } } }), 0]);
    assert.deepEqual(back.reconciled.clamped, none, 'its return is not a 1,000 gain');
    assert.deepEqual(back.after, ledger);
  });
});

describe('G948 A1: the Funpickle out using a power is still counted as the player\'s', { skip }, () => {
  const ledger = counts({ [FUNPICKLE]: 1 });

  it('the deploy write and the return write stand with no budget; the slice is the game\'s own', () => {
    funpickleFeature._reset();
    funpickleFeature.restore({ found: true, out: true, powersUsed: {} });
    const slice = JSON.parse(JSON.stringify(funpickleFeature.save()));
    assert.equal(slice.out, true);
    const out = php('check', [ledger, credited(), save({ features: { funpickle: slice } }), 0]);
    assert.deepEqual(out.reconciled.clamped, none);
    assert.deepEqual(out.after, ledger, 'out of the pack, still held');
    const back = php('check', [out.after, credited(), save({ inv: { [FUNPICKLE]: 1 }, features: { funpickle: { ...slice, out: false } } }), 0]);
    assert.deepEqual(back.reconciled.clamped, none, 'its return is not a 1,000 gain');
    assert.deepEqual(back.after, ledger);
  });

  it('never two: out with one in the pack still counts one', () => {
    const h = php('holdings', [save({ inv: { [FUNPICKLE]: 1 }, features: { funpickle: { out: true } } })]);
    assert.equal(h.items[FUNPICKLE], 1);
  });
});
