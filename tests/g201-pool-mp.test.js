/**
 * Register G201 (the visitor iMG pool) and G332's leftovers, between real
 * players. The source: locations/inc_cultivation.js
 * cultivation_add_img_rewards 168-178, cultivation_rewards_cap 180-241,
 * cultivation_get_img_rewards 244-277, cultivation_reset_img_rewards
 * 284-292; locations/home.js home_log_visitor 435-458; include/garden.js:579;
 * items/magic_rock.js 427-446; items/npc_piggy.js onContainerItemAdded
 * 1393-1411, onFoodPathing 1482-1500. The site's pool is
 * src/HomePool.php (checked through php -r), the server's home_pool.go and
 * objects_pigs.go / drops.go (go test). Solo is untouched.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { HOME_POOL_REFRESH_MS, collectAmount, normalizePool, poolView } from '../public/js/home-pool-mp.js?v=g375-1';
import { homePoolMpFeature } from '../public/js/features/home-pool-mp-feature.js?v=g375-1';
import { CULTIVATION_REWARDS_CAP, imgRewards, imgRewardLine } from '../public/js/magic-rock-home.js?v=g253-1';
import { DROP_TEXT, eatenStack, normalizeGroundStack, pigAnimalKey } from '../public/js/drops-mp.js?v=g375-1';
import { dropsMpFeature } from '../public/js/features/drops-mp-feature.js?v=g403-1';
import { GAME_DAY_MS, GAME_EPOCH_MS, getGameDayKey } from '../public/js/game-day.js?v=dametime-4';
import { tradeTable } from '../tools/build-realtime-trade.mjs';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath, sitePath } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const GS = join(root, '../glitch-GameServerJS');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;
const OP = 'drop-00000000000000a1';

function php(classes, body) {
  const code = `foreach (${JSON.stringify(classes)} as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; ${body}`;
  return JSON.parse(execFileSync('php', ['-r', code]).toString());
}

describe('the pool as the source keeps it (site HomePool.php)', { skip: skipSite }, () => {
  const pool = (body) => php(['HomePool'], `use Groddle\\Minn\\HomePool as P; ${body}`);

  it('has the source\'s cap table, the stipend from level 2 and 3% of the cap a new visitor', () => {
    const src = readFileSync(join(GS, 'locations/inc_cultivation.js'), 'utf8');
    const table = src.slice(src.indexOf('var cultivation_rewards_cap = ['), src.indexOf('];', src.indexOf('var cultivation_rewards_cap')));
    const nums = [...table.matchAll(/\d+/g)].map((m) => Number(m[0]));
    assert.deepEqual(pool('echo json_encode(P::CAP);'), nums);
    assert.deepEqual(pool('echo json_encode(P::CAP);'), [...CULTIVATION_REWARDS_CAP], 'the same table as solo');
    assert.match(src, /best_amount \+= Math\.round\(cap \* 0\.20\);/);
    assert.deepEqual(pool('echo json_encode([P::stipend(1), P::stipend(2), P::stipend(20), P::stipend(99)]);'), [0, 15, 165, 915]);
    const home = readFileSync(join(GS, 'locations/home.js'), 'utf8');
    assert.match(home, /this\.cultivation_add_img_rewards\(this, Math\.round\(cap \* 0\.03\)\);/);
    assert.deepEqual(pool('echo json_encode([P::visitAmount(1), P::visitAmount(10), P::visitAmount(20), P::visitAmount(60)]);'), [2, 8, 25, 137]);
    assert.match(readFileSync(join(GS, 'items/include/garden.js'), 'utf8'), /this\.container\.cultivation_add_img_rewards\(pc, 5\.0\);/);
    assert.equal(pool('echo json_encode(P::HARVEST);'), 5);
  });

  it('hands over the best earlier day, capped, plus the stipend; today never counts; nothing once cashed', () => {
    // Solo's imgRewards is the same function: the two must agree.
    const cases = [
      [{ 10: 40, 11: 900, 12: 5000 }, 2, false, 12],
      [{ 10: 30 }, 1, false, 11],
      [{ 10: 30, 11: 70 }, 20, false, 11],
      [{}, 20, false, 11],
      [{ 10: 300 }, 20, true, 11],
    ];
    for (const [p, level, cashed, today] of cases) {
      const site = pool(`echo json_encode(P::collectable(${JSON.stringify(p).replace(/"(\d+)":/g, '$1=>').replace(/[{}]/g, (c) => (c === '{' ? '[' : ']')).replace(/:/g, '=>')}, ${level}, ${cashed}, ${today}));`);
      const solo = imgRewards({ level, cashedToday: cashed, pool: p, today: String(today) });
      assert.equal(site, solo, JSON.stringify([p, level, cashed, today]));
    }
    assert.equal(pool('echo json_encode(P::collectable([10 => 40, 11 => 900, 12 => 5000], 2, false, 12));'), 75 + 15);
  });

  it('counts game days as the game does (four real hours, the same epoch)', () => {
    const t = Date.UTC(2026, 9, 27, 18, 0, 0);
    const day = pool(`echo json_encode(P::dayOf(${t}));`);
    assert.equal(day, Math.floor((t - GAME_EPOCH_MS) / GAME_DAY_MS));
    assert.equal(pool(`echo json_encode(P::dayOf(${t + GAME_DAY_MS}));`), day + 1);
    assert.equal(getGameDayKey(t) !== getGameDayKey(t + GAME_DAY_MS), true);
    assert.equal(pool(`echo json_encode([P::GAME_EPOCH_MS, P::GAME_DAY_MS]);`).join(), [GAME_EPOCH_MS, GAME_DAY_MS].join());
  });

  it('reads the owner\'s level from the stored save', () => {
    assert.deepEqual(pool('echo json_encode([P::levelOf(null), P::levelOf(json_decode(\'{"player":{"level":17}}\')), P::levelOf(json_decode(\'{"player":{"level":"x"}}\'))]);'), [1, 17, 1]);
  });

  it('is registered with Minn, its tables declared, and HomeTending pays a street harvest into it', () => {
    const ext = readFileSync(sitePath('src/Extension.php'), 'utf8');
    assert.match(ext, /new HomePool\(\$minn\)/);
    const manifest = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8'));
    for (const [t, cols] of [['groddle_home_pool', ['owner_id', 'day', 'amount']], ['groddle_home_pool_marks', ['owner_id', 'visitor_id', 'day', 'mark', 'amount']]]) {
      assert.ok(manifest.tables[t], t);
      for (const c of cols) assert.ok(manifest.tables[t].some((x) => x.startsWith(`${c} `)), `${t}.${c}`);
    }
    const tend = readFileSync(sitePath('src/HomeTending.php'), 'utf8');
    assert.match(tend, /\$act\['act'\] === 'harvest' && \$act\['yard'\] === 'street'[\s\S]{0,200}HomePool::add\(\$db, \$owner, HomePool::HARVEST, HomePool::today\(\)\)/);
    const p = readFileSync(sitePath('src/HomePool.php'), 'utf8');
    assert.match(p, /ServiceCall::verify\(/, 'a visit is the realtime server\'s word, signed');
    assert.doesNotMatch(p, /\$body\['amount'\]/, 'no amount comes from a caller');
  });
});

describe('the game shows the site\'s pool (home-pool-mp)', () => {
  it('reads the site\'s answers', () => {
    assert.deepEqual(normalizePool({ day: 32044, collect: 40, cashed: false, today: 8, cap: 200, stipend: 40 }), { day: 32044, collect: 40, cashed: false, today: 8, cap: 200, stipend: 40 });
    assert.equal(normalizePool({ collect: 3 }), null);
    assert.equal(normalizePool(null), null);
    assert.equal(poolView({ collect: 40, cashed: true, today: 8 }), '40:c:8');
    assert.equal(poolView(null), '');
    assert.equal(HOME_POOL_REFRESH_MS, 60000);
  });

  it('applies a hand-over once: a repeat answer only when this save has not marked the day', () => {
    assert.equal(collectAmount({ amount: 55, day: 1, op: 'pool-7-1' }), 55);
    assert.equal(collectAmount({ amount: 55, again: true }, { cashedToday: true }), 0);
    assert.equal(collectAmount({ amount: 55, again: true }, { cashedToday: false }), 55, 'the first answer was lost');
    assert.equal(collectAmount({ amount: 0 }), 0);
    assert.equal(collectAmount(null), 0);
  });

  it('answers nothing in solo, so the rock keeps the stipend alone', () => {
    const engine = { mode: 'solo', started: true, query: () => null, homeContext: () => ({ inHome: true, owned: true, room: 'street' }) };
    assert.equal(homePoolMpFeature.homeImgPool(engine), null);
    assert.equal(homePoolMpFeature.homeImgCollect(engine), null);
    homePoolMpFeature.onTick(16, 0, engine);
    assert.equal(globalThis.groddleHomePool, undefined);
  });

  it('is registered once, before street-objects', () => {
    const index = readFileSync(join(root, 'public/js/features/index.js'), 'utf8');
    assert.equal((index.match(/home-pool-mp-feature\.js/g) || []).length, 1);
    assert.ok(index.indexOf('home-pool-mp-feature.js') < index.indexOf('street-objects-feature.js'));
  });

  it('the rock hands over the site\'s amount in multiplayer, after the site marked the day', async () => {
    const { homesFeature } = await import('../public/js/features/homes-feature.js?v=g446-2');
    homesFeature.restore({ decor: {}, cult: {}, magicRock: { cultivate: 'cultivate_complete', changestyle: 'howto_shown', expand: 'howto_shown' } });
    const beats = [];
    const data = {};
    const pc = { level: 40, imagination: 100, xp: 1000 };
    let site = 95;
    const asked = [];
    const engine = {
      pc,
      questState: { active: {}, completed: [], offers: {} },
      scriptedDialogue: (d) => beats.push(d),
      achievement: () => {},
      setData: (k, v) => { data[k] = v; },
      homeContext: () => ({ inHome: false }),
      query: (hook, ...args) => {
        if (hook === 'homeImgPool') return site;
        if (hook === 'homeImgCollect') {
          asked.push(args[1]);
          const got = site;
          site = 0;
          return Promise.resolve(got);
        }
        return null;
      },
    };
    const yard = { classId: 'magic_rock', state: { room: 'yard' } };
    assert.ok(homesFeature.verbsFor(yard, engine).some((v) => v.id === 'talk_to'), 'talk to while the site has iMG');
    assert.equal(homesFeature.runVerb(yard, 'talk_to', engine), true);
    assert.equal(pc.imagination, 100, 'nothing until the site answers');
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(pc.imagination, 195);
    assert.equal(pc.xp, 1095);
    assert.deepEqual(asked, [{ cashedToday: false }]);
    assert.equal(beats[0].beats[0].text, imgRewardLine(95));
    assert.equal(data.homeRockLast, 'img:95');
    assert.ok(!homesFeature.verbsFor(yard, engine).some((v) => v.id === 'talk_to'), 'the site says nothing more today');
  });
});

describe('G332: street Piggies eat food dropped for everyone, and the drop prompt\'s words', () => {
  it('the source eats dropped food (npc_piggy.js) and the trade table marks what is food (include/food.js)', () => {
    const pig = readFileSync(join(GS, 'items/npc_piggy.js'), 'utf8');
    assert.match(pig, /function onContainerItemAdded\(addedItem, oldContainer\)\{ \/\/ defined by npc_animal\n\tif \(!this\.isRooked\(\) && !this\.isSad\(\) && this\.instanceProps\.hunger > 0 && this\.isFood\(addedItem\)\)\{/);
    assert.match(pig, /var consumed = it\.apiConsume\(1\);/);
    const t = tradeTable();
    assert.equal(t.items.apple.food, true);
    assert.equal(t.items.cherry.food, true);
    assert.equal(t.items.pick.food, undefined);
    const foods = Object.entries(t.items).filter(([, v]) => v.food).map(([k]) => k);
    for (const c of foods) assert.match(readFileSync(join(GS, 'items', `${c}.js`), 'utf8'), /^\/\/#include .*include\/food\.js/m, c);
    assert.ok(foods.length > 150);
    const client = JSON.parse(readFileSync(join(root, 'public/assets/content/trade-items.json'), 'utf8'));
    assert.equal(client.items.apple.food, true, 'the client\'s copy is the same file');
  });

  it('a bite shrinks the stack, and the server\'s Piggy id finds the street Piggy', () => {
    const s = normalizeGroundStack({ id: OP, c: 'apple', n: 3, x: 1200, y: -120, by: { id: 7, name: 'Ada' }, at: 1 }, 'LA5');
    const after = eatenStack(s, 2);
    assert.equal(after.count, 2);
    assert.equal(after.subtitle, 'Dropped by Ada · 2 in this pile');
    assert.equal(s.count, 3, 'a copy');
    assert.equal(eatenStack(s, 0), null);
    assert.equal(pigAnimalKey('LA5', 'pig:2'), 'LA5:npc_piggy:2');
    assert.equal(pigAnimalKey('LA5', 'tree:2'), '');
    assert.equal(pigAnimalKey('', 'pig:2'), '');
  });

  it('the pack\'s drop prompt reads the drop verb\'s tooltip for a shared drop (stacks dropped for others never merge)', () => {
    assert.match(readFileSync(join(GS, 'items/apple.js'), 'utf8'), /"tooltip"\t\t\t: "Drop it on the ground",/);
    assert.equal(DROP_TEXT.prompt, 'Drop it on the ground.');
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /features\.query\('sharedDropPrompt', classTsid, engine\) \|\| 'Drop this stack at your feet\. Nearby matching stacks will merge\.'/);
    const engine = { mode: 'solo', started: true, query: () => null };
    dropsMpFeature.init(engine);
    assert.equal(dropsMpFeature.sharedDropPrompt('apple', engine), null, 'solo keeps its words');
  });
});

describe('G332: a tool picked up while away keeps its wear (site LedgerDrop.php)', { skip: skipSite }, () => {
  const drop = (body) => php(['LedgerMath', 'LedgerDrop'], `use Groddle\\Minn\\LedgerDrop as D; ${body}`);

  it('sets the stored save\'s tool condition as the game\'s pickup does', () => {
    const state = JSON.stringify({ inventory: { pick: 0 }, systems: { tools: { condition: { pick: { remaining: 90, broken: false, uses: 3, repairs: 0 } } } } });
    const entries = `['playerState' => ${JSON.stringify(state).replace(/\$/g, '\\$')}]`;
    const first = drop(`echo json_encode(json_decode(D::withToolPoints(${entries}, 'pick', 40, false)['playerState'])->systems->tools->condition->pick);`);
    assert.deepEqual(first, { remaining: 40, broken: false, uses: 3, repairs: 0 }, 'a first one takes the stack\'s wear');
    const more = drop(`echo json_encode(json_decode(D::withToolPoints(${entries}, 'pick', 95, true)['playerState'])->systems->tools->condition->pick);`);
    assert.equal(more.remaining, 90, 'one more keeps the more worn (drops-mp-feature apply)');
    const fresh = drop(`echo json_encode(json_decode(D::withToolPoints(['playerState' => '{"inventory":{}}'], 'hoe', 0, false)['playerState'])->systems->tools->condition->hoe);`);
    assert.deepEqual(fresh, { remaining: 0, broken: true, uses: 0, repairs: 0 });
    assert.deepEqual(drop(`echo json_encode([D::isTake('${OP}-t'), D::isTake('${OP}'), D::isTake('gift-00000000000000a1-t')]);`), [true, false, false]);
    const ledger = readFileSync(sitePath('src/Ledger.php'), 'utf8');
    assert.match(ledger, /LedgerDrop::isTake\(\$p\['trade'\]\) => LedgerDrop::catchUp\(\$this->db, \$entries, \$user, \$p\)/);
  });

  it('a Piggy\'s bite moves only the count, once for each count the server held', () => {
    assert.deepEqual(drop(`echo json_encode([
      D::biteOf(['status' => 'ground', 'count' => 3], 3),
      D::biteOf(['status' => 'ground', 'count' => 2], 3),
      D::biteOf(['status' => 'ground', 'count' => 1], 1),
      D::biteOf(['status' => 'eaten', 'count' => 0], 1),
      D::biteOf(['status' => 'taken', 'count' => 3], 3),
      D::biteOf(['status' => 'ground', 'count' => 5], 3),
    ]);`), [
      { status: 'settled', n: 2, set: { status: 'ground', count: 2 } },
      { status: 'settled', n: 2 },
      { status: 'settled', n: 0, set: { status: 'eaten', count: 0 } },
      { status: 'settled', n: 0 },
      { status: 'refused', why: 'gone' },
      { status: 'refused', why: 'stale' },
    ]);
    // A missed drop still applies what was dropped, not what is left after a bite.
    assert.equal(drop(`echo json_encode(D::movedCount('{"items":[{"c":"apple","n":3}],"currants":0}', 1));`), 3);
    assert.equal(drop(`echo json_encode(D::movedCount('nope', 2));`), 2);
  });
});

describe('the server', { skip: HAS_SERVER ? false : 'no server checkout' }, () => {
  it('tells the site of visitors on a home street, and Piggies go for shared food', () => {
    const pool = serverPath('home_pool.go');
    if (!existsSync(pool)) return;
    const go = readFileSync(pool, 'utf8');
    assert.match(go, /ledgerRouteHomeVisit = "\/groddle\/v1\/homes\/pool\/visit"/);
    assert.match(go, /owner == 0 \|\| house \|\| owner == visitor/);
    const pigs = readFileSync(serverPath('objects_pigs.go'), 'utf8');
    assert.match(pigs, /func \(o \*objects\) pigFood\(street, id string, x, y float64\)/);
    const drops = readFileSync(serverPath('drops.go'), 'utf8');
    assert.match(drops, /ledgerRouteDropEat\s+= "\/groddle\/v1\/ledger\/drop\/eat"/);
    assert.match(readFileSync(serverPath('data/trade.json'), 'utf8'), /"apple":\{"max":100,"name":"Apple","plural":"Apples","food":true\}/);
  });
});
