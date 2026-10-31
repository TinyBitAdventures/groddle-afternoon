/**
 * Lane HOMES3 (registers G328 and G332), the game side and the site's pure
 * rules: the signpost's arms (locations/home.js addNeighbor), Note Poles
 * (items/note_pole.js, recipe 303, the CC0 parts), furniture for sale and the
 * Pile of Currants (furniture_base, pile_of_currants.js), and shared home
 * restorations (players/inc_jobs.js type 5) with the realtime server's ids;
 * and that solo is untouched. The server's rules are home_projects_test.go
 * and homes_street_test.go; the site's PHP runs here through php -r
 * (skipped without the site or php).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  GOOD_NEIGHBOUR_AT,
  GOOD_NEIGHBOUR_COUNTER,
  HOME_STREET_TEXT as T,
  NOTE_POLE_RECIPE,
  SIGNPOST_ARMS,
  canSellClass,
  currants,
  normalizeHomeStreetSlice,
  normalizeListings,
  normalizePiles,
  normalizePole,
  normalizeRestores,
  noteSold,
  parsePrice,
  philanthropicReward,
  poleConfig,
  poleLayout,
  poleVerbs,
  readWireId,
  restoreWireId,
  saleVerbs,
  signpostArms,
  signpostCandidates,
} from '../public/js/home-street-mp.js?v=0fc12d80';
import { NOTE_POLE_CONTAINERS, NOTE_POLE_PARTS, NOTE_POLE_SIGN_Y } from '../public/js/note-pole-art.js?v=860d393a';
import { isSharedJob } from '../public/js/street-jobs-mp.js?v=74c659ea';
import { homeStreetMpFeature } from '../public/js/features/home-street-mp-feature.js?v=c5027d74';
import { projectTable } from '../tools/build-realtime-projects.mjs';
import { HAS_SITE, SITE_DIR, serverPath } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const GSJS = join(process.env.HOME || '', 'Documents/glitch-audit/glitch-GameServerJS');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

function php(body) {
  const code = `foreach (['Economy', 'LedgerMath', 'HomeSignpost', 'HomeStreet', 'LedgerFurniture'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\HomeStreet; use Groddle\\Minn\\LedgerFurniture; ${body}`;
  return JSON.parse(execFileSync('php', ['-r', code]).toString());
}

describe('the signpost: friends\' homes on its arms (locations/home.js)', () => {
  it('has five arms, positions 0 to 4, by position', () => {
    assert.equal(SIGNPOST_ARMS, 5);
    const arms = signpostArms([{ position: 3, id: 9, name: 'Bo' }, { position: 0, id: 7, name: 'Ada' }, { position: 5, id: 11, name: 'Cy' }, { position: 1, id: 0, name: 'Nobody' }]);
    assert.deepEqual(arms.map((a) => a?.name ?? null), ['Ada', null, null, 'Bo', null]);
  });
  it('offers the buddies not on it already, by name', () => {
    const c = signpostCandidates([{ id: 9, name: 'Bo' }, { id: 7, name: 'Ada' }, { id: 12, name: 'Ari' }], [{ position: 0, id: 7, name: 'Ada' }]);
    assert.deepEqual(c.map((b) => b.id), [12, 9]);
  });
  it('sets signpost:num_neighbors to 5 (achievements/good_neighbour.js condition 766)', () => {
    assert.equal(GOOD_NEIGHBOUR_COUNTER, 'signpost:num_neighbors');
    assert.equal(GOOD_NEIGHBOUR_AT, 5);
    const badge = read('public/js/achievements.js');
    assert.ok(existsSync(join(GSJS, 'achievements/good_neighbour.js')) ? readFileSync(join(GSJS, 'achievements/good_neighbour.js'), 'utf8').includes('label	: "num_neighbors"') : true);
    assert.ok(badge.length > 0);
  });
  it('uses the client\'s words (SignpostDialog.as) and the server\'s (main.js)', () => {
    assert.equal(T.editTitle, 'Edit your signpost');
    assert.equal(T.emptyArm, 'Click to add a friend');
    assert.equal(T.removeConfirm('Bo'), 'Are you sure you want to remove Bo from your signpost?');
    assert.equal(T.couldNotAdd, 'Could not add neighbor');
  });
});

describe('Note Poles (items/note_pole.js)', () => {
  it('is recipe 303 as catalog_recipes.js has it', { skip: existsSync(join(GSJS, 'items/catalog_recipes.js')) ? false : 'no GSJS checkout' }, () => {
    const src = readFileSync(join(GSJS, 'items/catalog_recipes.js'), 'utf8');
    const block = /this\.recipes\["303"\] = \{([\s\S]*?)\n\t\};/.exec(src)[1];
    assert.match(block, /name : "Note Pole"/);
    assert.match(block, /tool : "construction_tool"/);
    assert.match(block, /skill : "furnituremaking_1"/);
    assert.match(block, /energy_cost : 50/);
    assert.match(block, /xp_reward : 24/);
    assert.match(block, /wait_ms : 3000/);
    const inputs = [...block.matchAll(/\["([a-z_]+)", (\d+)\]/g)].map((m) => [m[1], Number(m[2])]);
    assert.deepEqual(inputs, [...NOTE_POLE_RECIPE.inputs.map((i) => [i.classTsid, i.qty]), ['note_pole', 1]]);
    assert.equal(NOTE_POLE_RECIPE.id, '303');
    assert.equal(NOTE_POLE_RECIPE.toolWear, 2);
  });
  it('stays out of solo\'s recipes (build-recipes.mjs skips it)', () => {
    const recipes = JSON.parse(read('public/assets/content/recipes.json'));
    assert.equal(recipes.note_pole, undefined);
  });
  it('keeps the server\'s config choices (instancePropsChoices) and a pole\'s place', () => {
    assert.deepEqual(poleConfig({ size: 'Huge', pole: 25, sign: '0' }), { size: 'Tall', pole: '10', sign: '1' });
    assert.deepEqual(poleConfig({ size: 'Short', pole: '3', sign: 9 }), { size: 'Short', pole: '3', sign: '9' });
    const p = normalizePole({ id: 2, room: 'house', rx: 33.6, cfg: { size: 'Medium' }, note: { title: '<b>Hi</b>', body: 'x'.repeat(1200), by: { id: 7, name: 'Ada' }, at: 5 } });
    assert.equal(p.room, 'house');
    assert.equal(p.rx, 34);
    assert.equal(p.note.title, 'Hi');
    assert.equal(p.note.body.length, 1000);
    assert.equal(normalizePole({ id: 0, rx: 1 }), null);
    const slice = normalizeHomeStreetSlice({ poles: [{ id: 3, rx: 0 }, { id: 3, rx: 9 }, { id: 5, rx: 2 }], nextPole: 2, sold: ['furn-0123456789abcdef', 'nope'] });
    assert.deepEqual(slice.poles.map((x) => x.id), [3, 5]);
    assert.equal(slice.nextPole, 6);
    assert.deepEqual(slice.sold, ['furn-0123456789abcdef']);
    assert.equal(noteSold(slice, 'furn-0123456789abcdef'), false);
    assert.equal(noteSold(slice, 'furn-00000000000000ff'), true);
  });
  it('lets the owner post, customize and pick up, and everyone else read (read_oneclick)', () => {
    assert.deepEqual(poleVerbs({ owner: false, hasNote: true }).map((v) => v.id), ['pole_read']);
    assert.equal(poleVerbs({ owner: false, hasNote: false })[0].reason, 'Nothing has been posted');
    const own = poleVerbs({ owner: true, hasNote: false, notes: 0 });
    assert.deepEqual(own.map((v) => v.id), ['pole_read', 'pole_post', 'pole_customize', 'pole_pickup']);
    assert.equal(own[1].reason, "You don't have any notes.");
  });
  it('draws the CC0 parts from the pole\'s base: the sign at 8, 64 or 129 (note_pole.as initializehead)', () => {
    const art = { parts: NOTE_POLE_PARTS, containers: NOTE_POLE_CONTAINERS, signY: NOTE_POLE_SIGN_Y };
    for (const size of ['Tall', 'Medium', 'Short']) {
      for (let pole = 1; pole <= 10; pole += 1) {
        const parts = poleLayout({ size, pole, sign: 1 }, true, art);
        assert.equal(parts.length, 3, `${size} ${pole}`);
        const base = parts[0];
        assert.ok(Math.abs(base.y + base.h) < 0.01, 'the pole stands on its base');
        assert.ok(Math.abs(base.x + base.w / 2) < 0.01, 'centred');
        assert.ok(existsSync(join(root, 'public/assets/sprites/note-pole', base.file)));
      }
    }
    const tall = poleLayout({ size: 'Tall' }, false, art);
    const short = poleLayout({ size: 'Short' }, false, art);
    assert.equal(tall.length, 2);
    assert.ok(short[1].y > tall[1].y + 100, 'a short pole carries its sign lower');
    for (let s = 1; s <= 9; s += 1) {
      assert.ok(existsSync(join(root, 'public/assets/sprites/note-pole', NOTE_POLE_PARTS[`sign_${s}`][0])));
      assert.ok(existsSync(join(root, 'public/assets/sprites/note-pole', NOTE_POLE_PARTS[`signNote_${s}`][0])));
    }
  });
});

describe('furniture for sale and the Pile of Currants (furniture_base)', () => {
  it('sells any piece but a chassis or a door (canSell 400-405)', () => {
    assert.equal(canSellClass('furniture_bed'), true);
    assert.equal(canSellClass('bag_furniture_sdb'), true);
    assert.equal(canSellClass('furniture_door'), false);
    assert.equal(canSellClass('furniture_tower_chassis'), false);
    assert.equal(canSellClass('apple'), false);
  });
  it('takes prices as the input box did: digits only, six at most, 0 stops the sale', () => {
    assert.equal(parsePrice('1,200c'), 1200);
    assert.equal(parsePrice('12345678'), 123456);
    assert.equal(parsePrice('0'), 0);
    assert.equal(parsePrice('none'), null);
  });
  it('gives the owner set / edit / don\'t sell and a visitor buy for Nc', () => {
    assert.deepEqual(saleVerbs({ owner: true }).map((v) => v.label), ['set sale price']);
    assert.deepEqual(saleVerbs({ owner: true, listing: { price: 5 } }).map((v) => v.label), ['edit sale price', "don't sell"]);
    assert.deepEqual(saleVerbs({ owner: false }), []);
    const buy = saleVerbs({ owner: false, listing: { price: 1200 } });
    assert.equal(buy[0].tooltip, 'Buy it for 1,200c');
  });
  it('says the source\'s words about the sale and the pile', () => {
    assert.equal(T.soldToYou('Bo', 'Chair', 1200), 'Bo just bought your Chair for 1,200 currants.');
    assert.equal(T.pileHere(1, T.pileSource('Bo', 'Chair')), 'Here is 1 currant from Bo purchasing your Chair.');
    assert.equal(T.pileCollected(1200, 'Bo purchasing your Chair'), 'You collected 1,200 currants. (From Bo purchasing your Chair)');
    assert.equal(T.pileBump(3, 'Bo purchasing your Chair'), 'I have 3 currants from Bo purchasing your Chair!');
    assert.equal(currants(2), '2 currants');
  });
  it('reads listings and piles the site sent, nothing else', () => {
    const l = normalizeListings([{ op: 'furn-0123456789abcdef', uid: 4, class: 'furniture_chair', price: 1200 }, { op: 'nope', uid: 5, price: 3 }, { op: 'furn-0123456789abcde0', uid: 6, price: 0 }]);
    assert.deepEqual([...l.keys()], [4]);
    const p = normalizePiles([{ op: 'furn-0123456789abcdef', uid: 4, class: 'furniture_chair', price: 1200, x: 300, buyer: { id: 9, name: 'Bo' } }, { op: 'x' }]);
    assert.equal(p.length, 1);
    assert.equal(p[0].buyer.name, 'Bo');
  });
});

describe('restorations shared at a home (players/inc_jobs.js type 5)', () => {
  it('names a job the same way the site and the server do', () => {
    assert.equal(restoreWireId(7, { id: 12, cycle: 1 }), 'h7-c-1');
    assert.equal(restoreWireId(1000, { id: 40, cycle: 3 }, 'back'), 'yrs-14-3');
    assert.deepEqual(readWireId('yrs-14-3'), { owner: 1000, item: 40, cycle: 3, yard: 'back' });
    assert.deepEqual(readWireId('hrs-14-b'), { owner: 1000, item: 40, cycle: 11, yard: 'street' });
    assert.equal(readWireId('home-proto-1-1'), null);
    assert.equal(restoreWireId(0, { id: 1 }), '');
  });
  it('is the site\'s id too (HomeStreet::restore)', { skip: skipSite }, () => {
    const got = php(`echo json_encode([HomeStreet::restore(1000, 'back', (object) ['id' => 40, 'cycle' => 3, 'depleted' => true, 'protoClass' => 'proto_peat', 'lifeSteps' => 4]), HomeStreet::restore(7, 'street', (object) ['id' => 12, 'depleted' => false, 'protoClass' => 'proto_peat'])]);`);
    assert.deepEqual(got[0], { job: restoreWireId(1000, { id: 40, cycle: 3 }, 'back'), proto: 'proto_peat', yard: 'back', item: 40, cycle: 3, mult: 1.2 });
    assert.equal(got[1], null);
  });
  it('shares a restoration once it has the server\'s id', () => {
    const catalog = { jobs: { a: { kind: 'restore' }, b: { kind: 'restore', wire: 'h7-c-1' }, c: { kind: 'street' } } };
    assert.equal(isSharedJob(catalog, 'a'), false);
    assert.equal(isSharedJob(catalog, 'b'), true);
    assert.equal(isSharedJob(catalog, 'c'), true);
  });
  it('grants the badge only for someone else\'s home, over half, as the server marks it', () => {
    assert.equal(philanthropicReward({ philanthropic: true, owner: 7, share: 0.68 }, 9), true);
    assert.equal(philanthropicReward({ philanthropic: true, owner: 9, share: 0.68 }, 9), false);
    assert.equal(philanthropicReward({ philanthropic: true, owner: 7, share: 0.5 }, 9), false);
    assert.equal(philanthropicReward({ philanthropic: false, owner: 7, share: 0.9 }, 9), false);
  });
  it('reads the site\'s tokens', () => {
    const r = normalizeRestores([{ job: 'h7-c-1', proto: 'proto_metal_rock', yard: 'street', mult: 1.1, token: 'a.b' }, { job: 'bad', proto: 'proto_peat', token: 'x' }]);
    assert.equal(r.length, 1);
    assert.equal(r[0].item, 12);
  });
  it('gives the server every restoration\'s phases at the source amounts (divisor 1)', () => {
    const catalog = JSON.parse(read('public/assets/content/street-jobs.json'));
    const t = projectTable(catalog);
    assert.equal(Object.keys(t.restorations).length, Object.keys(catalog.restorations).length);
    const dirt = t.restorations.proto_dirt_pile;
    assert.deepEqual(dirt.phases, [{ c: 'job_cult_dirt_pile_2', delay: 60 }]);
    const cls = t.classes['job_cult_dirt_pile_2/1'];
    assert.deepEqual(cls.reqs.map((q) => q.need), [1, 10, 3, 15]);
    assert.equal(cls.reqs.reduce((s, q) => s + q.need * q.cost, 0), 380);
    assert.deepEqual(cls.rewards, { xp: 150 });
  });
  it('the server\'s data/projects.json is the tool\'s', { skip: existsSync(serverPath('data', 'projects.json')) ? false : 'no server checkout' }, () => {
    const out = spawnSync(process.execPath, [join(root, 'tools/build-realtime-projects.mjs'), '--check'], { encoding: 'utf8', env: process.env });
    assert.equal(out.status, 0, out.stderr);
  });
});

describe('the site\'s pure rules', { skip: skipSite }, () => {
  it('cleans Note Poles a visitor reads (HomeStreet::poles)', () => {
    const got = php(`echo json_encode(HomeStreet::poles(json_decode(json_encode(['systems' => ['features' => ['home-street-mp' => ['poles' => [
      ['id' => 2, 'room' => 'house', 'rx' => 12.4, 'cfg' => ['size' => 'Short', 'pole' => '30', 'sign' => 'x'], 'note' => ['title' => '<i>Hello</i>  there', 'body' => "Line 1\\n<script>x</script>Line 2", 'by' => ['id' => 7, 'name' => 'Ada'], 'at' => 5]],
      ['id' => 'nope'],
    ]]]]]))));`);
    assert.equal(got.length, 1);
    assert.deepEqual(got[0].cfg, { size: 'Short', pole: '10', sign: '1' });
    assert.equal(got[0].room, 'house');
    assert.equal(got[0].note.title, 'Hello there');
    assert.equal(got[0].note.body, 'Line 1\nxLine 2');
  });
  it('knows a sale\'s owner side (LedgerFurniture::isSale) and finds a placed piece', () => {
    const got = php(`echo json_encode([LedgerFurniture::isSale('furn-0123456789abcdef-o'), LedgerFurniture::isSale('furn-0123456789abcdef'), LedgerFurniture::opId('furn-0123456789abcdef'),
      LedgerFurniture::placed(json_decode(json_encode(['systems' => ['features' => ['homes' => ['decor' => ['placed' => [['id' => 4, 'classTsid' => 'furniture_chair']]]]]]])), 4)?->classTsid]);`);
    assert.deepEqual(got, [true, false, true, 'furniture_chair']);
  });
});

describe('solo is untouched', () => {
  const solo = { mode: 'solo', inv: { note_pole: 1 } };
  it('answers no hook in solo', () => {
    assert.deepEqual(homeStreetMpFeature.packVerbs('note_pole', solo), []);
    assert.equal(homeStreetMpFeature.homeRestoreWire({ id: 1 }, 'street', solo), null);
    assert.equal(homeStreetMpFeature.furnitureSaleLock({}, 1, solo), null);
    assert.equal(homeStreetMpFeature.homeStreetVisit({ owner: 7 }, solo), null);
    assert.equal(homeStreetMpFeature.save(), undefined);
  });
  it('sits before street-objects in features/index.js', () => {
    const src = read('public/js/features/index.js');
    const at = src.search(/from '\.\/home-street-mp-feature\.js\?v=[0-9a-f]{8}'/);
    assert.ok(at > 0 && at < src.indexOf("from './street-objects-feature.js"));
  });
});
