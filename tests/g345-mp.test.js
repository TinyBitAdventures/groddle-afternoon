/**
 * G345: Feats between real players. The multiplayer rules and helpers
 * (js/feats-mp.js), the server's table (tools/build-realtime-feats.mjs ->
 * groddle-afternoon-server data/feats.json), the Feat feature's multiplayer
 * branch driven by a fake realtime client, the site's ledger side
 * (src/LedgerMath.php Feat records, src/LedgerService.php ledger/feat) and the
 * guards that keep solo as it was. The server's rules have their own tests
 * (groddle-afternoon-server feats_test.go).
 * Run: node --test tests/g345-mp.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';
import { featTable } from '../tools/build-realtime-feats.mjs';
import {
  APPLIED_KEEP,
  MP_ACTS,
  MP_ORDER,
  MP_PACE,
  RUN_MS,
  appliedFrom,
  endedLine,
  endsText,
  goalLine,
  goalStatus,
  mpGoals,
  ordinal,
  remember,
  reportFor,
  rewardBits,
  rewardParts,
  runAt,
  runFromServer,
  youLine,
} from '../public/js/feats-mp.js';
import { FEAT_BY_ID, WIRED_FEATS, vogTextFor } from '../public/js/solo-feats.js?v=g370-1';
import { GAME_DAY_MS, GAME_EPOCH_MS } from '../public/js/game-day.js?v=dametime-4';
import { soloFeatsFeature } from '../public/js/features/solo-feats-feature.js?v=g370-1';

const root = join(import.meta.dirname, '..');
const feature = readFileSync(join(root, 'public/js/features/solo-feats-feature.js'), 'utf8');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const GSJS = join(root, '..', 'glitch-GameServerJS');
const hasGsjs = existsSync(join(GSJS, 'players', 'inc_feats.js'));

describe('the server table (tools/build-realtime-feats.mjs)', () => {
  it('is current (node tools/build-realtime-feats.mjs)', { skip: skipWithoutServer }, () => {
    execFileSync(process.execPath, ['tools/build-realtime-feats.mjs', '--check'], { cwd: root });
  });

  it('carries every wired Feat in game_day order with three goals from the personal goal', () => {
    const t = featTable();
    // G172: then the multiplayer-only Feat, last so the others keep their index.
    assert.deepEqual(t.order, [...WIRED_FEATS.map((f) => f.id), 'visiting_stones']);
    for (const id of t.order) {
      const f = FEAT_BY_ID[id];
      const row = t.feats[id];
      assert.equal(row.goal, f.goal * 3, id);
      assert.equal(row.bonus, row.goal * 2, id);
      assert.equal(row.super, row.goal * 3, id);
      assert.ok(row.pace.n > 0 && row.pace.everyMs > 0 && row.pace.burst > 0, id);
      assert.equal(row.title, f.title);
    }
    assert.equal(t.runMs, 24 * 60 * 60 * 1000);
    assert.equal(t.epochMs, GAME_EPOCH_MS);
    // inc_feats.js:311 counts every production Feat of an epic, wired or not.
    assert.deepEqual(t.epics, { 2: 6, 4: 3 });
    assert.equal(t.feats.makeup_feat_redux.elsewhere, true);
    assert.deepEqual(t.feats.streaking.acts, { streak: { n: 1, dedupe: 'street-day' }, wheel: { n: 5 } });
    assert.deepEqual(t.reward.favor, [{ giant: 'all', points: 34 }]);
    assert.equal(t.reward.topPlaces, 26);
    assert.equal(t.reward.cigarPlaces, 30);
  });

  it('cites a pace for every wired Feat and acts only where the source fixes the amount', () => {
    assert.deepEqual(Object.keys(MP_PACE).sort(), [...MP_ORDER].sort());
    for (const [id, p] of Object.entries(MP_PACE)) assert.ok(p.source && !/—/.test(p.source), id);
    assert.deepEqual(Object.keys(MP_ACTS).sort(), ['qurazy_quoin_collecting', 'streaking', 'visiting_stones']);
  });

  it('reads the source it cites', { skip: !hasGsjs && 'glitch-GameServerJS not checked out' }, () => {
    const feats = readFileSync(join(GSJS, 'players', 'inc_feats.js'), 'utf8');
    assert.match(feats, /if \(rewards\.place && rewards\.place <= 26\)\{\n\t\tthis\.achievements_increment\('feats', 'top_26', 1\);/);
    assert.match(feats, /else if \(rewards\.place && rewards\.place <= 30\)\{\n\t\tthis\.achievements_grant\('the_cigar'\);/);
    assert.match(feats, /if \(time\(\) - converted <= \(30\*60\)\) this\.achievements_grant\('quick_on_your_feat'\);/);
    const feat = readFileSync(join(GSJS, 'groups', 'feat.js'), 'utf8');
    assert.match(feat, /if \(this\.counter >= this\.stretch_goal2 \* this\.goal_multiplier\)/);
    const main = readFileSync(join(GSJS, 'main.js'), 'utf8');
    assert.match(main, /place:1304,\s*currants:170,\s*mood:0,\s*energy:102/);
    assert.match(main, /imagination:272,\s*favor:\[\s*\{\s*giant:"all",\s*points:34/);
  });
});

describe('the schedule and the panel words (js/feats-mp.js)', () => {
  it('opens one Feat a day in turn, each on a game day boundary', () => {
    const now = Date.UTC(2026, 9, 26, 12);
    const a = runAt(now);
    assert.ok(a.start <= now && now < a.end);
    assert.equal(a.end - a.start, RUN_MS);
    assert.equal((a.start - GAME_EPOCH_MS) % GAME_DAY_MS, 0);
    const b = runAt(a.end);
    assert.equal(b.run, a.run + 1);
    assert.equal(MP_ORDER[(MP_ORDER.indexOf(a.feat) + 1) % MP_ORDER.length], b.feat);
    assert.equal(runAt(a.end + RUN_MS * (MP_ORDER.length - 1)).feat, a.feat);
  });

  it('words the goals in the order the source reads them (inc_feats.js 87-100)', () => {
    const g = mpGoals('tottlys_toys');
    assert.deepEqual(g, { goal: 30, bonus: 60, super: 90 });
    const run = runFromServer({ feat: 'tottlys_toys', run: 9, total: 12, ...g, count: 2, mine: 5, place: 2, top: [{ id: 1, name: 'Ada', n: 7 }, { id: 2, name: 'Bo', n: 5 }] }, 0);
    assert.equal(goalLine(run), '18 more to meet the minimum goal.');
    assert.equal(youLine(run), 'You: 5, 2nd of 2 contributors.');
    run.total = 61;
    assert.deepEqual(goalStatus(run), { tier: 2, next: 90, remaining: 29, label: 'Supermegabonus goal' });
    assert.equal(goalLine(run), 'Bonus goal met! 29 more to meet the supermegabonus goal.');
    run.total = 95;
    assert.equal(goalLine(run), 'Supermegabonus goal met!');
    assert.equal(youLine({ ...run, mine: 0, count: 1 }), '1 Glitch has contributed. You have not yet.');
    assert.equal(ordinal(11), '11th');
    assert.equal(ordinal(22), '22nd');
    assert.equal(endsText(Date.now() + 13 * 3600_000 + 60_000), 'Ends in 13 hours.');
    assert.equal(endsText(Date.now() + 5 * 60_000 - 1), 'Ends in 5 minutes.');
    assert.equal(endedLine({ feat: 'tottlys_toys', tier: 0 }), 'The Feat "Tottly\'s Toys" did not meet its minimum goal, so the Feat failed.');
    assert.equal(endedLine({ feat: 'tottlys_toys', tier: 2 }), 'The Feat "Tottly\'s Toys" has ended and met its bonus goal.');
    for (const s of [goalLine(run), youLine(run), endedLine({ feat: 'pet_only', tier: 3 })]) assert.ok(!/—/.test(s));
  });

  it('reports only today\'s Feat, with the act and street the server needs', () => {
    const run = { feat: 'streaking', run: 1 };
    assert.equal(reportFor(run, 'animal_love', 1), null);
    assert.equal(reportFor(run, 'streaking', 1), null);
    assert.deepEqual(reportFor(run, 'streaking', 1, { act: 'streak', street: 'GA5101HF7F429V5' }), { feat: 'streaking', n: 1, act: 'streak', street: 'GA5101HF7F429V5' });
    assert.deepEqual(reportFor(run, 'streaking', 5, { act: 'wheel' }), { feat: 'streaking', n: 5, act: 'wheel' });
    assert.deepEqual(reportFor({ feat: 'animal_love' }, 'animal_love', 3), { feat: 'animal_love', n: 3 });
    assert.equal(reportFor(null, 'animal_love', 3), null);
  });

  it('applies a reward without the currants a load already put in', () => {
    const msg = { rewards: { xp: 635, currants: 397, mood: 0, energy: 238, favor: [{ giant: 'all', points: 79 }] }, items: [{ c: 'petrified_rock_small', n: 1 }, { c: 'petrified_rock_large', n: 1 }, { c: 'gem_diamond', n: 9 }], counters: [{ counter: 'feats:contributed_to', n: 1 }, { counter: 'feats:top_26', n: 1 }, { counter: 'xp', n: 99 }], grants: ['the_cigar', 'rook_slayer'] };
    const all = rewardParts(msg);
    assert.equal(all.rewards.currants, 397);
    assert.deepEqual(all.items.map((i) => i.classTsid), ['petrified_rock_small', 'petrified_rock_large']);
    assert.deepEqual(all.counters.map((c) => c.counter), ['feats:contributed_to', 'feats:top_26']);
    assert.deepEqual(all.grants, ['the_cigar']);
    assert.equal(rewardParts(msg, { ledger: false }).rewards.currants, 0);
    assert.deepEqual(rewardBits(all.rewards, all.items), ['+635 iMG', '+397 currants', '+238 energy', '+79 favor with every Giant', '1 Small Petrified Rock', '1 Large Petrified Rock']);
    const many = [];
    for (let i = 0; i < APPLIED_KEEP + 3; i += 1) remember(many, `feat-r-a-${i}`);
    assert.equal(many.length, APPLIED_KEEP);
    assert.deepEqual(appliedFrom({ applied: ['feat-r-44j-8-7', 'job-g-x', '<b>', 'feat-f-3-7'] }), ['feat-r-44j-8-7', 'feat-f-3-7']);
  });
});

/** A fake realtime client: records sends, lets the test deliver server messages. */
function fakeClient() {
  const listeners = new Map();
  return {
    state: 'online',
    me: { id: 7, name: 'Ada' },
    sent: [],
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type).delete(fn);
    },
    send(kind, payload) {
      this.sent.push({ kind, ...payload });
      return true;
    },
    deliver(msg) {
      for (const fn of listeners.get(`msg:${msg.t}`) || []) fn(msg);
    },
  };
}

function mpEngine(client) {
  const calls = { achievement: [], grant: [], award: [], activity: [], toast: [], data: {} };
  return {
    mode: 'multiplayer',
    started: true,
    inv: {},
    pc: { currants: 100, mood: 10, energy: 10, xp: 0, giantFavor: {} },
    player: { x: 100, y: 500 },
    streetTsid: 'GA5101HF7F429V5',
    questState: { completed: [] },
    quoinState: { qurazyFound: 0 },
    hasBuff: () => false,
    inScene: () => false,
    param: () => null,
    query: (name) => (name === 'realtimeClient' ? client : null),
    achievement: (counter, amount) => calls.achievement.push([counter, amount]),
    grantAchievement: (id) => { calls.grant.push(id); return true; },
    award: (p) => calls.award.push(p),
    pushActivity: (l) => calls.activity.push(l),
    toast: (l) => calls.toast.push(l),
    refreshPack() {},
    playSound() {},
    updateHud() {},
    save() {},
    setData: (k, v) => { calls.data[k] = String(v); },
    calls,
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('the Feat feature in multiplayer (features/solo-feats-feature.js)', () => {
  it('sends today\'s increments to the server and keeps no personal goal', async () => {
    const client = fakeClient();
    const engine = mpEngine(client);
    soloFeatsFeature.init(engine);
    soloFeatsFeature.restore({}, engine);
    soloFeatsFeature.onStreetEnter({ tsid: engine.streetTsid }, engine);
    assert.deepEqual(client.sent.map((m) => m.kind), ['feat_sync']);
    // Before the server names today's Feat, nothing is sent.
    soloFeatsFeature.onEvent('npc_piggy:pet', 1, engine);
    assert.equal(client.sent.length, 1);
    client.deliver({ t: 'feat_state', now: Date.now(), run: 5348, feat: 'animal_love', start: Date.now() - 1000, end: Date.now() + RUN_MS, total: 0, goal: 150, bonus: 300, super: 450, tier: 0, count: 0, mine: 0, place: 0, top: [] });
    soloFeatsFeature.onEvent('npc_piggy:pet', 1, engine);
    soloFeatsFeature.onEvent('emotional_bear:hug', 1, engine);
    soloFeatsFeature.onEvent('players_hugged', 1, engine); // Tottly's Toys: not today's
    assert.deepEqual(client.sent.slice(1), [{ kind: 'feat_add', feat: 'animal_love', n: 1 }]);
    // Feeds keep the source's three-per-animal cap on the client too.
    for (let i = 0; i < 5; i += 1) soloFeatsFeature.onEvent('npc_piggy:feed:cherry', 1, engine, { animal: 'GA5:npc_piggy:0' });
    assert.equal(client.sent.filter((m) => m.kind === 'feat_add').length, 4);
    // featsIncrement call sites (crabs) keep their cap.
    soloFeatsFeature.featsIncrement('animal_love', 1, { cap: { key: 'crab:GA5:hug', max: 1 } }, engine);
    soloFeatsFeature.featsIncrement('animal_love', 1, { cap: { key: 'crab:GA5:hug', max: 1 } }, engine);
    assert.equal(client.sent.filter((m) => m.kind === 'feat_add').length, 5);
    const save = soloFeatsFeature.save();
    assert.deepEqual(save.progress, {});
    assert.equal(save.mpRun, 'animal_love:5348');
    // The answer: down_to_the_wire on a counted contribution (inc_feats.js 104-106).
    client.deliver({ t: 'feat_counted', feat: 'animal_love', run: 5348, n: 1, total: 1, mine: 1, place: 1 });
    assert.deepEqual(engine.calls.grant, ['down_to_the_wire']);
    assert.equal(engine.calls.data.mpFeat, 'animal_love:1/150:1:1');
  });

  it('applies the first contribution\'s badges and the reward once, then acks', async () => {
    const client = fakeClient();
    const engine = mpEngine(client);
    soloFeatsFeature.init(engine);
    soloFeatsFeature.restore({ applied: [], rewarded: [] }, engine);
    soloFeatsFeature.onStreetEnter({ tsid: engine.streetTsid }, engine);
    const first = { t: 'feat_first', id: 'feat-f-8-7', feat: 'animal_love', run: 5348, counters: [{ counter: 'feats:contributed', n: 1 }], grants: ['quick_on_your_feat'], remaining: 149 };
    client.deliver(first);
    await tick();
    client.deliver(first);
    await tick();
    assert.deepEqual(engine.calls.achievement, [['feats:contributed', 1]]);
    assert.deepEqual(engine.calls.grant, ['quick_on_your_feat']);
    assert.ok(engine.calls.toast.includes(vogTextFor('animal_love', 149)));
    assert.equal(client.sent.filter((m) => m.kind === 'feat_ack' && m.id === 'feat-f-8-7').length, 2);
    const reward = { t: 'feat_reward', id: 'feat-r-44k-8-7', feat: 'animal_love', run: 5348, place: 1, count: 2, tier: 1, rewards: { xp: 272, currants: 170, mood: 0, energy: 102, favor: [{ giant: 'all', points: 34 }] }, items: [{ c: 'petrified_rock_small', n: 1 }, { c: 'petrified_rock_large', n: 1 }], counters: [{ counter: 'feats:contributed_to', n: 1 }, { counter: 'feats:top_26', n: 1 }], grants: [] };
    client.deliver(reward);
    await tick();
    client.deliver(reward);
    await tick();
    assert.equal(engine.pc.currants, 270);
    assert.equal(engine.inv.petrified_rock_small, 1);
    assert.equal(engine.inv.petrified_rock_large, 1);
    assert.equal(engine.pc.giantFavor.alph, 34);
    assert.deepEqual(engine.calls.achievement.slice(1), [['feats:contributed_to', 1], ['feats:top_26', 1]]);
    assert.equal(engine.calls.award.length, 1);
    assert.equal(engine.calls.award[0].title, 'Feat Completed!');
    assert.match(engine.calls.award[0].body, /^The ancient Feat "Heebo's Happy Accident" has been successfully recreated by modern Glitches/);
    const save = soloFeatsFeature.save();
    assert.deepEqual(save.applied, ['feat-f-8-7', 'feat-r-44k-8-7']);
    assert.deepEqual(save.rewarded, ['feat-r-44k-8-7']);
    // A load that applied the ledger's part (Ledger::catchUp lists the id): the currants are not added again.
    const client2 = fakeClient();
    const engine2 = mpEngine(client2);
    soloFeatsFeature.init(engine2);
    soloFeatsFeature.restore({ applied: ['feat-r-44k-8-7'], rewarded: [] }, engine2);
    soloFeatsFeature.onStreetEnter({ tsid: engine2.streetTsid }, engine2);
    client2.deliver({ ...reward });
    await tick();
    assert.equal(engine2.pc.currants, 100);
    assert.equal(engine2.inv.petrified_rock_large, 1);
  });
});

describe('the feature keeps solo as it was', () => {
  it('gates every shared path on multiplayer', () => {
    assert.match(feature, /function increment\(engine, featId, amount, opts = \{\}\) \{\n  \/\/ Multiplayer: today's shared Feat, counted by the server \(feats\.go\)\.\n  if \(mpMode\) return mpReport/);
    assert.match(feature, /function reopenDue\(engine, now = Date\.now\(\)\) \{\n  if \(mpMode\) return \[\];/);
    assert.match(feature, /if \(mpMode\) return \{ \.\.\.state, applied: \[\.\.\.mpLists\.applied\], rewarded: \[\.\.\.mpLists\.rewarded\], mpRun: mpLists\.run \};\n    return state;/);
    assert.match(feature, /if \(mpMode\) ensureMp\(engine\);\n    else applyDemo\(engine\);/);
  });

  it('a solo engine never sends or keeps a multiplayer field', () => {
    const client = fakeClient();
    const engine = { ...mpEngine(client), mode: 'solo' };
    soloFeatsFeature.init(engine);
    soloFeatsFeature.restore(undefined, engine);
    soloFeatsFeature.onStreetEnter({ tsid: engine.streetTsid }, engine);
    soloFeatsFeature.onEvent('npc_piggy:pet', 1, engine);
    assert.equal(client.sent.length, 0);
    const save = soloFeatsFeature.save();
    assert.equal(save.progress.animal_love.value, 1);
    assert.equal('applied' in save || 'mpRun' in save, false);
  });
});

describe('the site ledger counts Feat records (src/LedgerMath.php, src/LedgerService.php)', () => {
  const skip = skipWithoutSite || !hasPhp;
  const php = (code, input) => JSON.parse(String(execFileSync('php', ['-r', `
    foreach (['Economy', 'LedgerMath'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerMath};
    $in = json_decode(stream_get_contents(STDIN), true);
    ${code}`], { input: JSON.stringify(input) })));
  const entries = (features) => ({ playerState: JSON.stringify({ inventory: { ginger: 3 }, player: { currants: 50 }, systems: { features } }) });

  it('reads applied ids from the Feats slice too', { skip }, () => {
    const out = php('echo json_encode(LedgerMath::applied($in));', entries({ trade: { applied: ['k1-2'] }, 'solo-feats': { applied: ['feat-r-44k-8-7'] } }));
    assert.deepEqual(out, ['k1-2', 'feat-r-44k-8-7']);
  });

  it('a load applies a Feat reward into the Feats slice, once', { skip }, () => {
    const out = php(`
      $e = LedgerMath::applyTrade($in, 'feat-r-44k-8-7', ['items' => [], 'currants' => 0], ['items' => [], 'currants' => 170]);
      $e = LedgerMath::applyTrade($e, 'feat-r-44k-8-7', ['items' => [], 'currants' => 0], ['items' => [], 'currants' => 170]);
      echo $e['playerState'];`, entries({ 'solo-feats': { progress: {}, applied: [] } }));
    assert.equal(out.player.currants, 220);
    assert.deepEqual(out.systems.features['solo-feats'].applied, ['feat-r-44k-8-7']);
    assert.equal(out.systems.features.trade, undefined);
  });

  it('the feat route only pays, takes ids the server makes, and checks the signature', { skip: skipWithoutSite }, () => {
    const service = readFileSync(join(SITE_DIR, 'src/LedgerService.php'), 'utf8');
    assert.match(service, /public function feat\(Request \$request\): Response\n    \{\n        \$this->signed\(\$request, self::FEAT\);/);
    assert.match(service, /preg_match\('\/\^feat-r-\[a-z0-9-\]\{1,33\}\$\/', \$id\)/);
    assert.match(service, /\$project->settle\(\$id, \$user, \['items' => \[\], 'currants' => 0\], \$got, time\(\)\)/);
    const id = 'feat-r-44k-8-12345678';
    assert.ok(/^feat-r-[a-z0-9-]{1,33}$/.test(id) && id.length <= 40);
  });
});
