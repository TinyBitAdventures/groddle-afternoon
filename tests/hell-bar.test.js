/**
 * The Hell Bar, rebuilt behind Panka Surazu's door (js/hell-bar.js,
 * tools/build-hell-bar.mjs, features/hell-bar-feature.js, tools/room-art set
 * hell_bar). Register row G140.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry } from '../public/js/street-model.js?v=g442-6';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=g442-6';
import { canTeleport, createHellState, enforceHellOnEnter, HELL_BAR, HELL_BARTENDER, isInHell, noteNarakaVisit } from '../public/js/hell.js';
import { HELL_BAR_FILES } from '../public/js/hell-bar-art.js';
import {
  BARTENDER,
  BARTENDER_TEXT,
  EXIT_DOOR,
  FLOOR_Y,
  HELL_BAR_ARRIVE,
  HELL_BAR_ART_ROOT,
  HELL_BAR_TSID,
  PANKA_DOOR,
  PANKA_TSID,
  STOOLS,
  STOOL_SEAT_Y,
  TALK_EXTRA,
  bartenderTalkOptions,
  buyWineConditions,
  buyWinePlan,
  collisionConversation,
  grantWine,
  hellBarArt,
  inBartenderHitBox,
  isHellBarTsid,
  pickBartenderLine,
  talkStateFor,
} from '../public/js/hell-bar.js';
import { hellBarFeature } from '../public/js/features/hell-bar-feature.js?v=g446-4';
import { hellFeature } from '../public/js/features/hell-feature.js?v=hell-16';
import { FEATURES } from '../public/js/features/index.js?v=registry-292';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(spike, 'public');
const streets = join(pub, 'assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streets, `${tsid}.json`), 'utf8'));
const gsjs = join(spike, '../glitch-GameServerJS');
const locations = join(spike, '../streets/mnt/stos/location_data');
const bar = street(HELL_BAR_TSID);
const panka = street(PANKA_TSID);
// The source has a no-break space after one ellipsis; js/hell.js keeps a plain one.
const bartenderSrc = existsSync(gsjs) ? readFileSync(join(gsjs, 'items/hell_bartender.js'), 'utf8').replace(/\u00a0/g, ' ') : '';

describe('Hell Bar street', () => {
  it('is written, indexed and current (tools/build-hell-bar.mjs --check)', () => {
    execFileSync(process.execPath, [join(spike, 'tools/build-hell-bar.mjs'), '--check'], { stdio: 'pipe' });
    assertStreetGeometry(bar);
    assert.match(bar.source, /^reconstruction/);
    assert.equal(bar.reconstructed, true);
    assert.deepEqual([bar.label, bar.hubId, bar.hubName], ['Hell Bar', '40', 'Naraka']);
    const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8'));
    const row = index.streets[HELL_BAR_TSID];
    assert.deepEqual([row.label, row.hubId, row.hubName, row.reconstructed, row.file], ['Hell Bar', '40', 'Naraka', true, `assets/streets/${HELL_BAR_TSID}.json`]);
    assert.equal(row.platforms, bar.platforms.length);
    assert.equal(HELL_BAR.available, true);
  });

  it('is the hell_quest location and the hub 40 room GSJS names', { skip: !existsSync(gsjs) && 'GSJS checkout not beside this worktree' }, () => {
    const quest = readFileSync(join(gsjs, 'quests/hell_quest.js'), 'utf8');
    assert.match(quest, /"hell_bar"\t\t: \{\n\t\t"dev_tsid"\t: "",\n\t\t"prod_tsid"\t: "LA5FPUNAI7P2NVF"/);
    const maps = readFileSync(join(gsjs, 'inc_data_maps_prod.js'), 'utf8');
    assert.match(maps, /"LA5FPUNAI7P2NVF"\t: "Hell Bar"/);
  });

  it("Panka Surazu's archived door leads in, landing on the floor at its own connect x", { skip: !existsSync(locations) && 'location XML not beside this worktree' }, () => {
    const xml = readFileSync(join(locations, 'GA5RPAFK9OE28GN.xml'), 'utf8');
    const block = xml.slice(xml.indexOf(`<object id="${PANKA_DOOR}">`), xml.indexOf('<object id="platform_lines">'));
    assert.match(block, /<objref id="target" tsid="LA5FPUNAI7P2NVF" label="Hell Bar"\/>/);
    assert.match(block, /<int id="y">-77<\/int>\s*<int id="x">240<\/int>/);
    assert.match(block, /locations\/kukubee\/.*locations\/groddle1\/.*locations\/firebog\//);
    assert.match(block, /<bool id="is_locked">false<\/bool>/);
    const door = panka.doors.find((d) => d.id === PANKA_DOOR);
    assert.equal(door.sprite, 'door_asset_hell_bar_entrance_01a');
    assert.equal(door.is_locked, false);
    assert.equal(door.connect.street, HELL_BAR_TSID);
    assert.deepEqual([door.connect.x, door.connect.y], [HELL_BAR_ARRIVE.x, HELL_BAR_ARRIVE.y]);
    assert.deepEqual(door.connect.arrive, arrivalInTarget(bar, 240, -77) && { x: 240 - bar.bounds.l, y: FLOOR_Y - bar.bounds.t });
  });

  it('has a way out back to Panka Surazu, landing in front of its door', () => {
    assert.equal(bar.doors.length, 1);
    const out = bar.doors[0];
    assert.equal(out.id, EXIT_DOOR.id);
    assert.equal(out.connect.street, PANKA_TSID);
    assert.equal(out.is_locked, false);
    const door = panka.doors.find((d) => d.id === PANKA_DOOR);
    assert.deepEqual([out.connect.x, out.connect.y], [door.x + panka.bounds.l, door.y + panka.bounds.t]);
    const landing = arrivalInTarget(panka, out.connect.x, out.connect.y);
    assert.ok(landing.snapped);
    assert.deepEqual(out.connect.arrive, { x: landing.x, y: landing.y });
    assert.ok(Math.abs(out.connect.arrive.x - door.x) < 1, 'lands at the door');
    // The way out stands left of the arrival, as in video shQ_KY3Pwxo t145.
    assert.ok(EXIT_DOOR.x + EXIT_DOOR.w / 2 < HELL_BAR_ARRIVE.x + 40);
  });

  it('has a floor under the arrival, stool seats to stand on and walls at both ends', () => {
    const floor = bar.platforms.find((p) => p.id === 'plat_hb_floor');
    assert.equal(floor.y1, FLOOR_Y);
    assert.ok(floor.x1 <= HELL_BAR_ARRIVE.x && floor.x2 >= BARTENDER.x);
    for (const [i, x] of STOOLS.entries()) {
      const seat = bar.platforms.find((p) => p.id === `plat_hb_stool_${i + 1}`);
      assert.ok(seat.x1 < x && seat.x2 > x && seat.y1 === STOOL_SEAT_Y && seat.pc_perm === -1);
      assert.ok(FLOOR_Y - STOOL_SEAT_Y < 60, 'a plain jump reaches a seat');
    }
    assert.equal(bar.barriers.length, 2);
  });
});

describe('Hell Bar art', () => {
  it('draws only CC0 renders and street decos that ship, behind the avatar', () => {
    const art = hellBarArt();
    assert.ok(art.length > 40);
    for (const row of art) {
      assert.ok(row.z < 0, `${row.name} z ${row.z}`);
      if (row.fill != null) continue;
      const file = row.src.startsWith(HELL_BAR_ART_ROOT) ? row.src : row.src.replace(/\.png$/, '.webp');
      assert.ok(existsSync(join(pub, file)), file);
    }
    const names = new Set(art.map((r) => r.name));
    for (const piece of ['hell_bar_sign_01a', 'hell_bar_bartender_flames_01a', 'counter', 'stool', 'shelf_long', 'skull_decal', 'wine_of_the_dead_01a_k1', 'jethimadh_int_lantern_1']) {
      assert.ok(names.has(piece), piece);
    }
  });

  it('matches its room-art plan (tools/room-art/build.py hell_bar)', () => {
    const plan = JSON.parse(readFileSync(join(spike, 'tools/room-art/hell_bar.json'), 'utf8'));
    assert.match(plan.source, /glitch-locations firebog\.swf, groddle1\.swf, kukubee\.swf \(CC0\)/);
    assert.deepEqual(Object.keys(plan.pieces).sort(), Object.keys(HELL_BAR_FILES).sort());
    for (const [name, row] of Object.entries(plan.pieces)) {
      const [file, w, h] = HELL_BAR_FILES[name];
      assert.equal(file, row.file);
      assert.deepEqual([w, h], row.world);
      assert.match(row.swf, /^bundle:(kukubee|groddle1|firebog)\.swf#/, 'only the bar\'s own location SWFs');
      const bytes = readFileSync(join(pub, HELL_BAR_ART_ROOT, file));
      assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 16), row.sha, `${file} changed since the build`);
    }
  });
});

describe("Hell's Bartender", () => {
  it('speaks source lines only', { skip: !bartenderSrc && 'GSJS checkout not beside this worktree' }, () => {
    const lines = [
      ...HELL_BARTENDER.talkGeneral, ...Object.values(TALK_EXTRA).flat(), ...HELL_BARTENDER.wineResponses,
      BARTENDER_TEXT.firstWine, BARTENDER_TEXT.packFull, BARTENDER_TEXT.needTicket, BARTENDER_TEXT.needTicketReason,
      BARTENDER_TEXT.bought, BARTENDER_TEXT.tried, BARTENDER_TEXT.talkTooltip, BARTENDER_TEXT.buyTooltip,
      ...Object.values(HELL_BARTENDER.conversations).flat().flatMap((b) => [b.text, b.response]),
    ];
    for (const line of lines) assert.ok(bartenderSrc.includes(line.replace(/"/g, '\\"')) || bartenderSrc.includes(line), line);
    assert.match(bartenderSrc, /apiSetHitBox\(300, -200\)/);
    assert.match(bartenderSrc, /apiSetTimerX\('chitChat', 30\*1000, pc\)/);
    const ticket = readFileSync(join(gsjs, 'items/drink_ticket.js'), 'utf8');
    assert.ok(ticket.includes(BARTENDER_TEXT.noOne));
    assert.match(ticket, /findCloseStack\('hell_bartender', 200\)/);
    assert.equal(BARTENDER.ticketRange, 200);
  });

  it("builds talk_to's pool the way the source does (each branch replaces it)", () => {
    const general = HELL_BARTENDER.talkGeneral;
    assert.deepEqual(bartenderTalkOptions({}), [...general]);
    assert.deepEqual(bartenderTalkOptions({ questStatus: 'todo', hasWine: true }), [...general, ...TALK_EXTRA.todoWine]);
    assert.deepEqual(bartenderTalkOptions({ questStatus: 'todo', hasWine: true, hasTicket: true }), [...general, ...TALK_EXTRA.todoTicket]);
    assert.deepEqual(bartenderTalkOptions({ questStatus: 'done' }), [...general, ...TALK_EXTRA.doneNoTicket]);
    assert.deepEqual(bartenderTalkOptions({ questStatus: 'done', hasTicket: true }), [...general, ...TALK_EXTRA.doneTicket]);
    assert.deepEqual(bartenderTalkOptions({ questStatus: 'done', hasTicket: true, hasWine: true }), [...general, ...TALK_EXTRA.doneWine]);
    const pool = bartenderTalkOptions({});
    assert.notEqual(pickBartenderLine(pool, pool[0], () => 0), pool[0], 'never the same line twice running');
  });

  it('sells one Wine of the Dead for one Diabolical Drink Ticket', () => {
    assert.deepEqual(buyWineConditions({ hasTicket: false }), { state: 'disabled', reason: BARTENDER_TEXT.needTicketReason });
    assert.equal(buyWineConditions({ hasTicket: true }).state, 'enabled');
    assert.equal(buyWinePlan({ hasTicket: false }).ok, false);
    // quests_get_flag is 0 outside the quest, so the first-purchase conversation runs every time.
    assert.equal(buyWinePlan({ hasTicket: true }).conversation, 'quest_buy_wine');
    assert.equal(buyWinePlan({ hasTicket: true, questStatus: 'todo', buyFlag: true }).conversation, null);
    const first = grantWine({ hasTicket: true, questStatus: 'todo' });
    assert.deepEqual(first.effects, [
      { type: 'consume_item', classTsid: 'drink_ticket', count: 1 },
      { type: 'grant_item', classTsid: 'wine_of_the_dead', count: 1 },
      { type: 'quest_flag', flag: 'buy_wotd' },
    ]);
    assert.equal(first.bubble, BARTENDER_TEXT.firstWine);
    assert.deepEqual(first.activity, [BARTENDER_TEXT.bought]);
    const again = grantWine({ hasTicket: true, rng: () => 0 });
    assert.equal(again.effects.length, 2);
    assert.equal(again.bubble, HELL_BARTENDER.wineResponses[0]);
    const full = grantWine({ hasTicket: true, packFull: true });
    assert.deepEqual([full.ok, full.effects.length, full.bubble], [false, 0, BARTENDER_TEXT.packFull]);
  });

  it('runs the onPlayerCollision conversations', () => {
    assert.equal(collisionConversation({}), 'no_quest_no_ticket');
    assert.equal(collisionConversation({ hasTicket: true }), 'no_quest_yes_ticket');
    assert.equal(collisionConversation({ questStatus: 'todo' }), 'yes_quest_no_ticket');
    assert.equal(collisionConversation({ questStatus: 'todo', hasTicket: true }), 'buy');
    assert.equal(collisionConversation({ questStatus: 'todo', hasTicket: true, buyFlag: true }), null);
    assert.equal(collisionConversation({ questStatus: 'done', hasTicket: true }), null);
    for (const id of ['quest_buy_wine', 'no_quest_yes_ticket', 'no_quest_no_ticket', 'yes_quest_no_ticket']) assert.ok(HELL_BARTENDER.conversations[id].length >= 2, id);
    assert.ok(inBartenderHitBox(BARTENDER.x - 140, FLOOR_Y));
    assert.ok(!inBartenderHitBox(BARTENDER.x - 160, FLOOR_Y));
    assert.equal(talkStateFor(BARTENDER.x - 10, BARTENDER.x), 'talkLeft');
    assert.equal(talkStateFor(BARTENDER.x + 10, BARTENDER.x), 'talkRight');
  });
});

describe('Hell Bar in play', () => {
  it('is a Naraka room: the dead walk in, the living are kept out, the Completist count is unchanged', () => {
    assert.ok(isHellBarTsid('LA5FPUNAI7P2NVF') && isHellBarTsid(HELL_BAR_TSID));
    assert.equal(isInHell(HELL_BAR_TSID), true);
    const dead = { ...createHellState(), isDead: true };
    assert.equal(enforceHellOnEnter(dead, HELL_BAR_TSID), null);
    assert.equal(canTeleport(dead, HELL_BAR_TSID).ok, true);
    assert.equal(canTeleport(createHellState(), HELL_BAR_TSID).ok, false);
    assert.deepEqual(noteNarakaVisit(dead, HELL_BAR_TSID).events, []);
  });

  it('registers its feature: an empty interior, the Bartender\'s two verbs, the ticket\'s pack verb', () => {
    assert.ok(FEATURES.includes(hellBarFeature));
    const eco = hellBarFeature.ecologyOverride({ tsid: HELL_BAR_TSID });
    assert.deepEqual([eco.interior, eco.quoins, Object.keys(eco.counts).length], [true, 0, 0]);
    assert.equal(hellBarFeature.ecologyOverride({ tsid: PANKA_TSID }), null);
    const engine = { inv: {}, streetTsid: PANKA_TSID };
    const verbs = hellBarFeature.verbsFor({ classId: 'hell_bartender' }, engine);
    assert.deepEqual(verbs.map((v) => [v.id, v.enabled]), [['buy_wine', false], ['talk_to', true]]);
    assert.equal(verbs[0].reason, BARTENDER_TEXT.needTicketReason);
    engine.inv.drink_ticket = 1;
    assert.equal(hellBarFeature.verbsFor({ classId: 'hell_bartender' }, engine)[0].enabled, true);
    assert.deepEqual(hellBarFeature.packVerbs('drink_ticket', engine), [], 'only in the bar');
  });

  it('gives Wine of the Dead its drink verb (items/wine_of_the_dead.js)', () => {
    hellFeature.restore({});
    const [alive] = hellFeature.packVerbs('wine_of_the_dead');
    assert.deepEqual([alive.id, alive.enabled, alive.tooltip], ['drink', true, "Bottoms up! What's the worst that could happen?"]);
    hellFeature.restore({ isDead: true, croakedAt: Date.now() });
    const [dead] = hellFeature.packVerbs('wine_of_the_dead');
    assert.equal(dead.tooltip, 'Bottoms up! Drink this to become less Pooped.');
    assert.deepEqual(hellFeature.packVerbs('drink_ticket'), []);
    hellFeature.restore({});
  });
});
