/**
 * Register G328 slice 2, the game side and the site's rules: the owner's
 * Butler for real visitors (js/neighbours-mp.js parcels, the Butler's
 * handover hook in features/butler-feature.js), key-holders tending the
 * owner's gardens (the act read off a plot, the owner's own apply, the
 * site's tick and checks in src/HomeTending.php), the neighbour counters
 * and the hosted-party badges, and that solo is untouched. The server's own
 * rules are homes_help_test.go; the site's PHP runs here through php -r
 * (skipped without the site or php).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  NEIGHBOUR_COUNTERS,
  VISITOR_BUTLER_TEXT,
  applyButlerStock,
  applyTendAct,
  butlerGiftOp,
  hostedCounters,
  isButlerVisitOp,
  isSiteParcel,
  mergeParcels,
  normalizeButlerStock,
  normalizeGiftAnswer,
  normalizeHomeView,
  normalizeNeighboursSlice,
  normalizeParcels,
  normalizeTendActs,
  giftedThisQuest,
  GIFT_QUEST,
  noteGift,
  plotsSnapshot,
  tendAct,
  tendCounters,
  tendedText,
} from '../public/js/neighbours-mp.js?v=e141e898';
import { createButlerState, giveGiftTo, newestVisit, nextHandover, normalizeButlerState, packagesAndMessagesForOwner, recordVisitor, setGift, visitorsReport } from '../public/js/butler.js?v=a660e585';
import { GARDEN_SPEEDUP, SEED_CATALOG as GARDEN_SEEDS, createGarden, tickGarden } from '../public/js/garden.js?v=1420a6d6';
import { butlerApi } from '../public/js/features/butler-feature.js?v=440db01b';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';
import { acceptOffer, routeQuestEvent } from '../public/js/quest-offers.js?v=89511e1e';
import { neighboursMpFeature } from '../public/js/features/neighbours-mp-feature.js?v=f418ec13';
import { createMinnAccount } from '../public/js/minn-account.js?v=c15f0ecf';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath, sitePath } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

function php(body) {
  const code = `foreach (['Economy', 'LedgerMath', 'WordFilter', 'ButlerParcels', 'ButlerGifts', 'HomeTending'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\ButlerParcels; use Groddle\\Minn\\ButlerGifts; use Groddle\\Minn\\HomeTending; ${body}`;
  return JSON.parse(execFileSync('php', ['-r', code]).toString());
}

const P1 = 'butler-00000000000000a1';
const P2 = 'butler-00000000000000a2';

describe('the owner\'s Butler holds what real visitors left', () => {
  it('reads the site\'s parcels and adds each to the Butler once, with the site\'s ids', () => {
    assert.equal(isSiteParcel(P1), true);
    assert.equal(isSiteParcel('b3'), false);
    const parcels = normalizeParcels({ parcels: [
      { id: P1, from: { id: 9, name: 'Bo' }, item: { c: 'cherry', n: 3 }, text: 'For you', at: 1000 },
      { id: P2, from: { id: 11, name: 'Cy' }, item: null, text: 'Hi Ada', at: 2000 },
      { id: 'nope', from: { id: 9 }, text: 'x' },
      { id: 'butler-00000000000000a3', from: { id: 9 }, item: { c: 'Bad!', n: 1 }, text: '' },
    ] });
    assert.deepEqual(parcels.map((p) => p.id), [P1, P2]);
    const st = normalizeButlerState({ owned: true });
    assert.equal(mergeParcels(st, parcels), 2);
    assert.equal(mergeParcels(st, parcels), 0, 'twice is once');
    const again = normalizeButlerState(JSON.parse(JSON.stringify(st)));
    assert.deepEqual(again.packages.map((p) => [p.id, p.classTsid, p.count, p.fromName]), [[P1, 'cherry', 3, 'Bo']]);
    assert.deepEqual(again.messages.map((m) => [m.id, m.withPackage]), [[`${P1}:m`, P1], [P2, null]]);
    assert.equal(packagesAndMessagesForOwner(again, { now: 3000 }), 'I have 1 message for you, and 1 package.');
    // The Butler hands them over with the ids the site takes them by.
    const first = nextHandover(again, { now: 5000, itemName: (c, n) => `${n} ${c}` });
    assert.equal(first.kind, 'message');
    assert.equal(first.id, P2);
    const second = nextHandover(again, { now: 5000, itemName: (c, n) => `${n} ${c}` });
    assert.equal(second.kind, 'package');
    assert.equal(second.id, P1);
    assert.match(second.text, /^Bo left you 3 cherry and told me to tell you: For you/);
  });

  it('keeps the owner\'s Butler in the visit view (its look, not what it holds)', () => {
    const view = normalizeHomeView({ owner: { id: 7, name: 'Ada' }, home: { owned: true, style: 'meadow' }, homes: {}, butler: { owned: true, name: 'Pip', parts: { skull: 'skull3' }, post: 280.4 } });
    assert.deepEqual(view.butler, { owned: true, name: 'Pip', parts: { skull: 'skull3' }, post: 280, info: '' }); // info: the owner's leave info line, none sent
    assert.equal(normalizeHomeView({ owner: { id: 7, name: 'Ada' }, home: { owned: true }, butler: { owned: false } }).butler, null);
  });

  it('speaks the source\'s Butler lines to a visitor', () => {
    assert.equal(VISITOR_BUTLER_TEXT.strangerGreeting('Bo', 'Ada'), "Hello, Bo. This is Ada's house.");
    assert.equal(VISITOR_BUTLER_TEXT.packageGiveSingle('Cherry', 'Ada'), 'Do you want to give this Cherry to Ada?');
    assert.equal(VISITOR_BUTLER_TEXT.packageSuccess('Ada'), 'Ok. What would you like me to tell Ada?');
    assert.equal(VISITOR_BUTLER_TEXT.packageConfirm('Ada'), 'I will make sure Ada gets this!');
    assert.equal(VISITOR_BUTLER_TEXT.messageSuccess('Ada'), 'Thanks! I will let Ada know.');
    assert.equal(VISITOR_BUTLER_TEXT.interactFail, 'The Butler is talking to somebody else right now.');
  });

  it('takes a real parcel through the site before the pack gets it, and only in multiplayer', () => {
    const src = read('public/js/features/butler-feature.js');
    assert.match(src, /engine\.mode === 'multiplayer' && parcelHook\?\.owns\?\.\(out\.id\)/);
    assert.equal(butlerApi.mpState({ mode: 'solo' }), null);
    assert.equal(butlerApi.parcelsArrived({ mode: 'solo' }), '');
  });

  it('calls the site\'s Butler and tending routes', async () => {
    const calls = [];
    const account = createMinnAccount({ baseUri: 'https://groddle.localhost/', nonce: 'abcdef0123', fetch: async (url, init = {}) => {
      calls.push(`${init.method || 'GET'} ${String(url).replace('https://groddle.localhost/wp-json/groddle/v1/', '')} ${init.body || ''}`.trim());
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({}) };
    } });
    await account.butlerParcels();
    await account.takeParcel(P1);
    await account.tend(7, [{ yard: 'street', garden: 'c1', plot: '1-1', act: 'water', seed: '' }]);
    await account.tending();
    assert.deepEqual(calls, ['GET butler', `POST butler/${P1}/take`, 'POST homes/7/tend {"acts":[{"yard":"street","garden":"c1","plot":"1-1","act":"water","seed":""}]}', 'GET homes/tending']);
  });
});

describe('key-holders tending the owner\'s gardens', () => {
  it('reads the act a garden verb did off the plot, never growth or drying', () => {
    assert.deepEqual(tendAct({ state: 'clean' }, { state: 'seeds', seed: 'seed_carrot' }), { act: 'plant', seed: 'seed_carrot' });
    assert.deepEqual(tendAct({ state: 'seeds', wet: false }, { state: 'seeds', wet: true }), { act: 'water', seed: '' });
    assert.deepEqual(tendAct({ state: 'crop', seed: 'seed_carrot' }, { state: 'dirty' }), { act: 'harvest', seed: '' });
    assert.deepEqual(tendAct({ state: 'dirty' }, { state: 'clean' }), { act: 'clear', seed: '' });
    assert.equal(tendAct({ state: 'seeds', wet: true }, { state: 'shoots', wet: true }), null);
    assert.equal(tendAct({ state: 'shoots', wet: true }, { state: 'shoots', wet: false }), null);
    // G537: an empty or picked plot takes water too.
    assert.deepEqual(tendAct({ state: 'clean', wet: false }, { state: 'clean', wet: true }), { act: 'water', seed: '' });
    assert.deepEqual(tendAct({ state: 'dirty', wet: false }, { state: 'dirty', wet: true }), { act: 'water', seed: '' });
  });

  it('applies a key-holder\'s act to the owner\'s own garden as the site recorded it', () => {
    const g = createGarden({ cols: 2, rows: 1, now: 0 });
    assert.equal(applyTendAct(g, { plot: '1-1', act: 'plant', seed: 'seed_spinach', at: 1000 }, tickGarden), true);
    assert.equal(applyTendAct(g, { plot: '1-1', act: 'water', at: 2000 }, tickGarden), true);
    assert.deepEqual(plotsSnapshot(g)['1-1'], { state: 'seeds', seed: 'seed_spinach', wet: true });
    // The seed and the water are on today's garden clock, as the owner's own would be.
    assert.equal(g.plots['1-1'].pace, GARDEN_SPEEDUP);
    assert.equal(g.plots['1-1'].wetPace, GARDEN_SPEEDUP);
    tickGarden(g, 2000 + GARDEN_SEEDS.seed_spinach.grow1Ms - 1);
    assert.equal(g.plots['1-1'].state, 'seeds');
    tickGarden(g, 2000 + GARDEN_SEEDS.seed_spinach.grow1Ms);
    assert.equal(g.plots['1-1'].state, 'shoots');
    assert.equal(applyTendAct(g, { plot: '9-9', act: 'water', at: 1 }), false);
    const acts = normalizeTendActs([{ id: 'tend-0000000000000001', from: { id: 9, name: 'Bo' }, yard: 'back', garden: 'g1', plot: '1-2', act: 'water', at: 5 }, { garden: 'g1', plot: 'x', act: 'water' }]);
    assert.equal(acts.length, 1);
    assert.equal(acts[0].yard, 'back');
    assert.equal(tendedText('Bo', acts), 'Bo watered your garden.');
  });

  it('counts the neighbour quests from the acts (three reimagined, herb seeds the source\'s)', () => {
    const watered = new Set();
    const herbs = new Set(['street:h1']);
    const first = tendCounters([
      { yard: 'street', garden: 'c1', act: 'water' },
      { yard: 'street', garden: 'c1', act: 'water' },
      { yard: 'street', garden: 'h1', act: 'plant', seed: 'herb_seed_rubeweed' },
      { yard: 'street', garden: 'c1', act: 'plant', seed: 'seed_carrot' },
    ], { herbGardens: herbs, wateredThisVisit: watered });
    const tally = (list) => list.reduce((o, [c, n]) => ({ ...o, [c]: (o[c] || 0) + n }), {});
    assert.deepEqual(tally(first), { [NEIGHBOUR_COUNTERS.tended]: 4, [NEIGHBOUR_COUNTERS.watered]: 1, [NEIGHBOUR_COUNTERS.herbs]: 1 });
    assert.deepEqual(tally(tendCounters([{ yard: 'street', garden: 'c1', act: 'water' }], { wateredThisVisit: watered })), { [NEIGHBOUR_COUNTERS.tended]: 1 });
    let g = noteGift([], 7);
    assert.equal(g.counted, true);
    g = noteGift(g.gifted, 7);
    assert.equal(g.counted, false, 'one owner counts once');
    assert.deepEqual(hostedCounters({ three: true, seventeen: true }), ['hosted_party:three', 'hosted_party:seventeen']);
    assert.deepEqual(normalizeNeighboursSlice({ tended: ['tend-0000000000000001', 'bad'], gifted: [7, 'x'], counts: { water_garden_for_others: 2, nope: 3 } }), { tended: ['tend-0000000000000001'], gifted: [7], counts: { water_garden_for_others: 2 } });
  });

  it('keeps nothing in solo, and counts a visit to another player\'s home street as location.js does', () => {
    neighboursMpFeature.restore({ tended: ['tend-0000000000000001'] }, { mode: 'solo' });
    assert.equal(neighboursMpFeature.save(), undefined);
    const src = read('public/js/features/neighbours-mp-feature.js');
    assert.match(src, /player_streets_visited:\$\{visitSceneTsid\(visit\.owner, 'street'\)\}/);
    assert.match(src, /if \(session\.mayTend\(\)\) return null;/);
  });
});

describe('the site\'s Butler and tending rules', { skip: skipSite }, () => {
  it('is wired: routes, tables, the seeds the game wrote', () => {
    const ext = readFileSync(sitePath('src/Extension.php'), 'utf8');
    assert.match(ext, /new ButlerParcels\(\$minn\), new ButlerGifts\(\$minn\), new HomeTending\(\$minn\)/);
    const minn = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8'));
    assert.ok(minn.tables.groddle_butler_parcels && minn.tables.groddle_home_tending);
    // Ticket 112: the Butler's gift for visitors, who had one, and the visits, all keyed for the QA cleanup.
    assert.ok(minn.tables.groddle_butler_gift.includes('PRIMARY KEY  (owner_id)'));
    assert.ok(minn.tables.groddle_butler_gifted.includes('PRIMARY KEY  (owner_id,visitor_id)'));
    assert.ok(minn.tables.groddle_butler_visits.some((l) => l.startsWith('visitor_id ')));
    const gifts = readFileSync(sitePath('src/ButlerGifts.php'), 'utf8');
    assert.match(gifts, /ServiceCall::verify/);
    assert.match(gifts, /'\/groddle\/v1\/ledger\/butler\/visit'/);
    const butler = readFileSync(sitePath('src/ButlerParcels.php'), 'utf8');
    assert.match(butler, /ServiceCall::verify/);
    assert.match(butler, /'\/groddle\/v1\/ledger\/butler'/);
    assert.equal(spawnSync('node', ['tools/build-garden-seeds.mjs', '--check'], { cwd: root }).status, 0, 'data/garden-seeds.json is current');
  });

  it('holds 5 packages and 10 messages, as bag_butler.js does', () => {
    const out = php(`
      $b = (object) ['packages' => [], 'messages' => []];
      $w = [];
      for ($i = 0; $i < 5; $i++) { $w[] = ['id' => "p$i", 'item' => true, 'text' => false]; }
      $full = ButlerParcels::room($b, $w, true, false);
      $msg = ButlerParcels::room($b, array_slice($w, 0, 4), false, true);
      $m = [];
      for ($i = 0; $i < 10; $i++) { $m[] = ['id' => "m$i", 'item' => false, 'text' => true]; }
      $talked = ButlerParcels::room($b, $m, false, true);
      $known = (object) ['packages' => [(object) ['id' => 'p0']], 'messages' => []];
      $dup = ButlerParcels::room($known, [['id' => 'p0', 'item' => true, 'text' => false]], true, false);
      echo json_encode([$full, $msg, $talked, $dup, ButlerParcels::cleanText("  a <b>b</b>\\n c  "), mb_strlen(ButlerParcels::cleanText(str_repeat('é', 500)))]);`);
    assert.deepEqual(out, ["Sorry, I can't carry any more packages.", null, "Sorry, I can't remember any more messages.", null, 'a b c', 431]);
  });

  it('grows a stored plot as the game does, then checks the act', () => {
    const out = php(`
      $seeds = HomeTending::seeds();
      $p = (object) ['state' => 'seeds', 'seed' => 'seed_spinach', 'wet' => true, 'wetAt' => 0, 'stageStartedAt' => 0, 'growthMs' => 0, 'growModifier' => 1];
      HomeTending::tickPlot($p, 7000, $seeds);
      $a = [$p->state, $p->wet];
      HomeTending::tickPlot($p, 50000000, $seeds);
      $b = [$p->state, $p->wet];
      $water = HomeTending::refuse($p, ['act' => 'water', 'seed' => ''], 'default', 50000000, $seeds);
      $harvest = HomeTending::refuse($p, ['act' => 'harvest', 'seed' => ''], 'default', 50000000, $seeds);
      $clean = (object) ['state' => 'clean'];
      $herb = HomeTending::refuse($clean, ['act' => 'plant', 'seed' => 'seed_carrot'], 'herb', 0, $seeds);
      $ok = HomeTending::refuse($clean, ['act' => 'plant', 'seed' => 'herb_seed_rubeweed'], 'herb', 0, $seeds);
      $waterClean = HomeTending::refuse($clean, ['act' => 'water', 'seed' => ''], 'default', 0, $seeds);
      $waterWet = HomeTending::refuse((object) ['state' => 'clean', 'wet' => true], ['act' => 'water', 'seed' => ''], 'default', 0, $seeds);
      HomeTending::applyAct($p, 'harvest', '', 60000000);
      $homes = (object) ['cult' => (object) ['gardens' => (object) ['g1' => (object) ['gardenType' => 'default', 'plots' => (object) ['1-1' => (object) ['state' => 'seeds', 'seed' => 'seed_spinach', 'wet' => false]]]]]];
      $shown = HomeTending::overlay($homes, [['yard' => 'street', 'garden' => 'g1', 'plot' => '1-1', 'act' => 'water', 'seed' => '', 'at_ms' => 99]]);
      echo json_encode([$a, $b, $water, $harvest, $herb, $ok, $p->state, $shown->cult->gardens->g1->plots->{'1-1'}->wet, $homes->cult->gardens->g1->plots->{'1-1'}->wet, $waterClean, $waterWet]);`);
    // Spinach: 4 s to shoots, 4 s more to a crop; the watering dries after 12 h.
    // G537: a dry empty plot takes water; a wet one does not.
    assert.deepEqual(out, [['shoots', true], ['crop', false], null, null, 'Only herb seeds go in an herb garden.', null, 'dirty', true, false, null, 'That plot is already wet.']);
  });
});

describe('the server takes the Butler\'s parcels and passes tending on', { skip: HAS_SERVER ? false : 'no server checkout' }, () => {
  it('handles the kinds the game sends and sends the ones it hears', () => {
    let go = '';
    try { go = readFileSync(serverPath('homes_help.go'), 'utf8'); } catch { /* not copied yet */ }
    if (!go) return;
    for (const kind of ['butler_leave', 'home_tend_tell']) assert.match(go, new RegExp(`r\\.Handle\\("${kind}"`));
    const feature = read('public/js/features/neighbours-mp-feature.js');
    for (const kind of ['butler_left', 'butler_parcel', 'butler_gift', 'butler_visit', 'home_tended', 'home_hosted']) {
      assert.match(go, new RegExp(`"t": "${kind}"`));
      assert.match(feature, new RegExp(`'msg:${kind}'`));
    }
    assert.match(feature, /client\.send\('butler_leave'/);
    assert.match(feature, /client\.send\('home_tend_tell'/);
  });
});

describe('ticket 112: the owner\'s gift for visitors and who visited, kept by the site', () => {
  const V1 = 'bvisit-00000000000000b1';
  it('reads the site\'s stock and visits into the Butler once, newest first in, oldest first kept', () => {
    assert.equal(isButlerVisitOp(V1), true);
    assert.equal(isButlerVisitOp('butler-00000000000000b1'), false);
    assert.match(butlerGiftOp(() => 0.5), /^bgift-8{16}$/);
    const stock = normalizeButlerStock({ gift: { c: 'chicken_egg', n: 9 }, legacy: false, visits: [
      { id: 11, name: 'Cy', at: 3000 }, { id: 9, name: 'Dr Flavius', at: 2000 }, { id: 9, name: 'Dr Flavius', at: 1000 }, { id: 0, name: 'x', at: 5 }, { id: 4, at: 0 },
    ] });
    assert.deepEqual(stock.gift, { c: 'chicken_egg', n: 9 });
    assert.equal(stock.visits.length, 3);
    const st = normalizeButlerState({ owned: true, gift: { classTsid: 'chicken_egg', count: 10 } });
    assert.equal(applyButlerStock(st, stock), 3);
    assert.equal(applyButlerStock(st, stock), 0, 'twice is once');
    assert.deepEqual(st.gift, { classTsid: 'chicken_egg', count: 9 }, 'the gift shown is the site\'s');
    assert.deepEqual(st.visitors.p9, [1000, 2000]);
    const again = normalizeButlerState(JSON.parse(JSON.stringify(st)));
    const report = visitorsReport(again);
    assert.equal(report.count, 2);
    assert.equal(report.output, 'Since the last time you asked me, the following people have visited your street: Dr Flavius and Cy.');
    // Asked: just past the newest visit (the site's clock), so the next visit shows and these do not.
    again.lastWhoVisited = newestVisit(again) + 1;
    assert.equal(visitorsReport(again).count, 0);
    applyButlerStock(again, normalizeButlerStock({ gift: null, visits: [{ id: 9, name: 'Dr Flavius', at: 4000 }] }));
    assert.equal(again.gift, null, 'the stock ran out');
    assert.equal(visitorsReport(again).output, 'Since the last time you asked me, the following people have visited your street: Dr Flavius.');
    // A gift kept in the save from before stays until the site takes it in.
    const old = normalizeButlerState({ owned: true, gift: { classTsid: 'chicken_egg', count: 10 } });
    applyButlerStock(old, normalizeButlerStock({ gift: null, legacy: true, visits: [] }), { keepGift: true });
    assert.deepEqual(old.gift, { classTsid: 'chicken_egg', count: 10 });
  });

  it('names at most 20 visitors and says when there were more than 5 (getVisitors, verbs.visitors)', () => {
    const st = normalizeButlerState({ owned: true });
    const visits = Array.from({ length: 22 }, (_, i) => ({ id: i + 1, name: `V${i + 1}`, at: 1000 + i })).reverse(); // the site sends newest first
    applyButlerStock(st, normalizeButlerStock({ visits }));
    const report = visitorsReport(st);
    assert.equal(report.count, 22);
    assert.equal(report.many, true);
    assert.match(report.output, /V20\. I think there were more, but that's all I can remember\.$/);
    assert.doesNotMatch(report.output, /V21/);
  });

  it('checks the site\'s answer to a give', () => {
    assert.deepEqual(normalizeGiftAnswer({ status: 'given', op: 'bgift-0123456789abcdef', gave: { c: 'apple', n: 3 }, got: { c: 'chicken_egg', n: 2 }, gift: { c: 'apple', n: 3 } }),
      { ok: true, op: 'bgift-0123456789abcdef', gave: { c: 'apple', n: 3 }, got: { c: 'chicken_egg', n: 2 }, gift: { c: 'apple', n: 3 } });
    assert.deepEqual(normalizeGiftAnswer({ status: 'refused', why: 'short', text: "You don't have that any more." }), { ok: false, why: 'short', text: "You don't have that any more." });
    assert.equal(normalizeGiftAnswer({ status: 'given', op: 'nope' }), null);
    assert.equal(normalizeGiftAnswer(null), null);
    assert.equal(VISITOR_BUTLER_TEXT.giftItem('Chicken Egg', 'Friendly'), 'Here is your Chicken Egg from Friendly. I hope you enjoy it!');
    assert.doesNotMatch(VISITOR_BUTLER_TEXT.giftWaiting, /\u2014/);
  });

  it('keeps solo\'s gift rules in the save: once per visitor per class, gone when it runs out', () => {
    const st = normalizeButlerState({ owned: true });
    setGift(st, { classTsid: 'apple', count: 2 });
    assert.deepEqual(giveGiftTo(st, 'dorrit'), { classTsid: 'apple', count: 1 });
    assert.equal(giveGiftTo(st, 'dorrit'), null, 'once per visitor');
    recordVisitor(st, { id: 'dorrit', name: 'Dorrit', now: 10 });
    assert.deepEqual(giveGiftTo(st, 'hadwin'), { classTsid: 'apple', count: 1 });
    assert.equal(st.gift, null);
    setGift(st, { classTsid: 'apple', count: 1 });
    assert.deepEqual(giveGiftTo(st, 'dorrit'), { classTsid: 'apple', count: 1 }, 'a new gift reaches everyone again');
  });

  it('gives through the site in multiplayer only, and solo neighbours keep the save\'s gift', () => {
    const src = read('public/js/features/butler-feature.js');
    assert.match(src, /engine\.mode === 'multiplayer' && giftHook\) return giveThroughSite/);
    assert.match(src, /if \(engine\.mode !== 'multiplayer'\) giveGiftTo\(st, id\);/);
    assert.match(src, /st\.lastWhoVisited = engine\.mode === 'multiplayer' \? newestVisit\(st\) \+ 1 : now\(\);/);
    const feature = read('public/js/features/neighbours-mp-feature.js');
    assert.match(feature, /butlerApi\.setGiftHook\?\.\(/);
    assert.match(feature, /ledgerReceipt', op, engine\) === false\) return;/, 'a gift comes into the pack once');
    assert.match(feature, /account\.butlerAdopt\(\)/);
  });

  it('calls the site\'s stock routes', async () => {
    const calls = [];
    const account = createMinnAccount({ baseUri: 'https://groddle.localhost/', nonce: 'abcdef0123', fetch: async (url, init = {}) => {
      calls.push(`${init.method || 'GET'} ${String(url).replace('https://groddle.localhost/wp-json/groddle/v1/', '')} ${init.body || ''}`.trim());
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({}) };
    } });
    await account.butlerStock();
    await account.butlerGive({ op: 'bgift-0123456789abcdef', c: 'apple', n: 3, keep: true });
    await account.butlerAdopt();
    assert.deepEqual(calls, ['GET butler/stock', 'POST butler/stock {"op":"bgift-0123456789abcdef","c":"apple","n":3,"keep":true}', 'POST butler/stock/adopt']);
  });

  it('hands out and merges by the source\'s rules on the site', { skip: skipSite }, () => {
    const out = php(`
      $egg = ['c' => 'chicken_egg', 'n' => 2];
      $first = ButlerGifts::handOut($egg, null);
      $again = ButlerGifts::handOut($first['after'], 'chicken_egg');
      $last = ButlerGifts::handOut($first['after'], 'apple');
      $none = ButlerGifts::handOut(null, null);
      $merge = ButlerGifts::leave($egg, 'chicken_egg', 3, true);
      $swap = ButlerGifts::leave($egg, 'apple', 4, true);
      $over = ButlerGifts::leave(['c' => 'apple', 'n' => 9998], 'apple', 2, true);
      $fresh = ButlerGifts::leave(null, 'apple', 1, true);
      $legacy = ButlerGifts::legacyGift(json_decode('{"systems":{"features":{"butler":{"owned":true,"gift":{"classTsid":"chicken_egg","count":10}}}}}'));
      $noLegacy = ButlerGifts::legacyGift(json_decode('{"systems":{"features":{"butler":{"owned":true,"gift":null}}}}'));
      echo json_encode([$first, $again, $last, $none, $merge, $swap, $over, $fresh, $legacy, $noLegacy, ButlerGifts::visitId('bvisit-0123456789abcdef'), ButlerGifts::giftId('bvisit-0123456789abcdef')]);`);
    assert.deepEqual(out, [
      { give: 'chicken_egg', after: { c: 'chicken_egg', n: 1 }, clear: false },
      { give: null, after: { c: 'chicken_egg', n: 1 }, clear: false },
      { give: 'chicken_egg', after: null, clear: true },
      { give: null, after: null, clear: false },
      { after: { c: 'chicken_egg', n: 5 }, back: null, clear: false },
      { after: { c: 'apple', n: 4 }, back: { c: 'chicken_egg', n: 2 }, clear: true },
      { after: { c: 'apple', n: 2 }, back: { c: 'apple', n: 9998 }, clear: true },
      { after: { c: 'apple', n: 1 }, back: null, clear: true },
      { c: 'chicken_egg', n: 10 },
      null,
      true,
      false,
    ]);
  });
});

describe('a fresh Butler state is unchanged by slice 2', () => {
  it('still starts empty', () => {
    const st = createButlerState();
    assert.equal(st.packages.length, 0);
    assert.equal(nextHandover(st).kind, 'none');
  });
});

describe('report 128: each neighbour counts once from when the quest starts', () => {
  it('owners given to before the quest was accepted count once it is held', () => {
    // Before accepting: gifts to 500, 1 and 504; the old save kept them for life. Accepted, 0/5.
    let list = giftedThisQuest([500, 1, 504], 0);
    assert.deepEqual(list, []);
    let g = noteGift(list, 1);
    assert.equal(g.counted, true);
    g = noteGift(giftedThisQuest(g.gifted, 1), 500);
    assert.equal(g.counted, true);
    assert.deepEqual(g.gifted, [1, 500]);
  });

  it('a second gift to the same neighbour during the quest does not count', () => {
    const g = noteGift(giftedThisQuest([1, 500], 2), 1);
    assert.equal(g.counted, false);
    assert.deepEqual(g.gifted, [1, 500]);
  });

  it('a held quest with progress keeps only the owners it counted: the newest ones', () => {
    // [9, 8] given before accepting, [7, 6] counted after.
    assert.deepEqual(giftedThisQuest([9, 8, 7, 6], 2), [7, 6]);
    assert.equal(noteGift(giftedThisQuest([9, 8, 7, 6], 2), 9).counted, true);
    assert.equal(noteGift(giftedThisQuest([9, 8, 7, 6], 2), 7).counted, false);
    // A correct list is left alone, on every load.
    assert.deepEqual(giftedThisQuest([7, 6], 2), [7, 6]);
  });

  it('not holding the quest keeps nothing and counts nothing', () => {
    assert.deepEqual(giftedThisQuest([1, 2], null), []);
    const src = read('public/js/features/neighbours-mp-feature.js');
    assert.match(src, /active\?\.\[GIFT_QUEST\]/);
    assert.match(src, /slice\.gifted = giftedThisQuest\(slice\.gifted, giftsCounted\(\)\);/);
    assert.match(src, /if \(held !== null && gift\.counted && receipt !== false\) count\(NEIGHBOUR_COUNTERS\.gifts, 1\);/);
    assert.equal(GIFT_QUEST, 'neighbor_gifts');
  });

  it('a counted gift moves the held quest: gifts to 1 and 500 after accepting read 2/5', async () => {
    await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
    const qs = { active: {}, completed: [] };
    assert.equal(acceptOffer(qs, GIFT_QUEST, { inv: {}, now: 1 }).ok, true);
    const held = () => qs.active[GIFT_QUEST].progress.give_bag_butler;
    let list = giftedThisQuest([500, 1, 504], held());
    for (const owner of [1, 500, 1]) {
      const g = noteGift(giftedThisQuest(list, held()), owner);
      list = g.gifted;
      if (g.counted) routeQuestEvent(qs, NEIGHBOUR_COUNTERS.gifts, 1, {});
    }
    assert.equal(held(), 2);
    assert.deepEqual(list, [1, 500]);
  });

  it('the feature is multiplayer only: solo restores no slice', () => {
    neighboursMpFeature.restore({ gifted: [1] }, { mode: 'solo' });
    assert.equal(neighboursMpFeature.save(), undefined);
    assert.match(read('public/js/features/neighbours-mp-feature.js'), /savedSlice = engine\?\.mode === 'multiplayer' \? normalizeNeighboursSlice\(slice\) : null;/);
  });
});
