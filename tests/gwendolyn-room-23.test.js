/**
 * Gwendolyn's Task starts in Room 23 (G71): js/gwendolyn-room-23.js (street
 * data and the Greeterbot's and Gwendolyn's rules, written by
 * tools/build-tower-rooms.mjs), features/gwendolyn-room-23-feature.js, the
 * catalog's npc_gwendolyn offer, and the Inner Mind's CC0 shards
 * (js/quest-rooms/gwendolyn.js, tools/room-art set gwendolyn_inner_mind).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as kit from '../public/js/quest-rooms/kit.js?v=g458-1';
import { loadContentCatalogsFromDir, getQuestCatalog } from '../public/js/content-catalogs.js?v=g403-1';
import { acceptOffer, ensureQuestOfferState, npcQuestOffers, pendingQuestOffers, turnInQuest } from '../public/js/quest-offers.js?v=g403-1';
import { XP_FOR_LEVEL } from '../public/js/progression.js';
import { OFFER_OVERRIDES } from '../public/js/quest-rooms/catalog.js?v=g482-2';
import { GREETERBOT } from '../public/js/tower-mid-rooms.js';
import { ROOM_23_FILES } from '../public/js/gwendolyn-room-23-art.js';
import { GWENDOLYN_INNER_FILES } from '../public/js/quest-rooms/gwendolyn-inner-art.js';
import { INNER_BASE, PART3 as G_PART3, PART3_REPEAT as G_PART3_REPEAT, innerLayout, thirdPartFor } from '../public/js/quest-rooms/gwendolyn.js?v=g463-2';
import {
  CONSOLATION,
  CORRIDOR_FIVE_TSID,
  EXIT_PROMPT,
  GREETER_LINES,
  GWENDOLYN_DOOR_LINKS,
  HIT_HALF,
  LEAD_X,
  MIN_LEVEL,
  PART2,
  PART3,
  PART3_REPEAT,
  REPEAT_COST,
  REPEAT_DECLINE,
  ROOM_23,
  ROOM_23_ART_ROOT,
  ROOM_23_DOOR,
  ROOM_23_ROOM,
  ROOM_23_SOURCE_TSID,
  ROOM_23_TSID,
  TASK,
  TELEPORT_OUT,
  clearChainForRepeat,
  greeterOpening,
  greeterScript,
  gwendolynOffers,
  leadPath,
  room23Street,
} from '../public/js/gwendolyn-room-23.js?v=g403-1';
import { gwendolynRoom23Feature } from '../public/js/features/gwendolyn-room-23-feature.js?v=g458-1';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = (p) => join(spike, 'public', p);
const gsjs = join(spike, '../glitch-GameServerJS');
const c5xml = join(spike, '../streets/mnt/stos/location_data/GTJ10M515812V0C.xml');
const firebogDir = join(spike, '../research/audio-hunt/raw/glitch-locations/source/firebog');
const street = (tsid) => JSON.parse(readFileSync(pub(`assets/streets/${tsid}.json`), 'utf8'));
const sha16 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16);
/** A plain jump peaks near 110 px (the other rooms' measured apex). */
const JUMP_RISE = 105;

describe('Room 23: source', () => {
  it('is hub 79\'s Room 23, behind Corridor Five\'s key 5 door, arriving at -1919,-135', { skip: !existsSync(c5xml) && 'streets dump not beside this worktree' }, () => {
    const xml = readFileSync(c5xml, 'utf8');
    const door = xml.slice(xml.indexOf(`<object id="${ROOM_23_DOOR.id}">`), xml.indexOf('<object id="door_1304678396364">'));
    assert.match(door, /<int id="key_id">5<\/int>/);
    assert.match(door, /<objref id="target" tsid="LCR8MORFJI12IR4" label="Room 23"\/>/);
    assert.match(door, /<int id="x">-1919<\/int>/);
    assert.match(door, /<int id="y">-135<\/int>/);
    assert.match(door, /<int id="x">132<\/int>/);
    assert.match(door, /<int id="y">-549<\/int>/);
  });

  it('keeps the Greeterbot\'s and Gwendolyn\'s source lines and numbers', { skip: !existsSync(gsjs) && 'GSJS checkout not beside this worktree' }, () => {
    const widget = readFileSync(join(gsjs, 'items/npc_widget.js'), 'utf8');
    for (const [key, [text, button]] of Object.entries(GREETER_LINES)) {
      assert.ok(widget.includes(text), `${key}: ${text}`);
      assert.ok(widget.includes(`"${button}"`), `${key} button ${button}`);
    }
    assert.ok(widget.includes(`"${REPEAT_DECLINE}"`));
    assert.match(widget, /stats_get_level\(\) < 12/);
    assert.match(widget, /stats_has_currants\(100/);
    assert.match(widget, /stats_add_currants\(50/);
    assert.match(widget, /apiFindPath\(1250, this\.y/);
    assert.match(widget, /teleportToLocationDelayed\('LTJ10M515812V0C', 102, -534\)/);
    assert.match(widget, /instances_schedule_exit_prompt\('tower_quest', 2\*60\)/);
    assert.match(widget, /apiSetHitBox\(400, 400\)/);
    assert.match(widget, /var label = "Greeterbot Sentry G-42"/);
    const gwen = readFileSync(join(gsjs, 'items/npc_gwendolyn.js'), 'utf8');
    assert.match(gwen, /apiSetHitBox\(400, 400\)/);
    assert.match(gwen, /this\.setAvailableQuests\(\[\s*'tower_quest',\s*'tower_quest_part3',\s*\]\);\s*\}\s*\n\s*if\(pc\.getQuestStatus\('tower_quest_part3'\) != 'done'/);
    const prompt = readFileSync(join(gsjs, 'players/inc_instances.js'), 'utf8');
    for (const s of [EXIT_PROMPT.text, EXIT_PROMPT.yes, EXIT_PROMPT.no]) assert.ok(prompt.includes(s), s);
    const maps = readFileSync(join(gsjs, 'inc_data_maps_prod.js'), 'utf8');
    assert.match(maps, /"LCR8MORFJI12IR4"\s*:\s*"Room 23"/);
    assert.equal(HIT_HALF, 200);
    assert.deepEqual([MIN_LEVEL, REPEAT_COST, CONSOLATION, LEAD_X], [12, 100, 50, 1250]);
    assert.deepEqual([TELEPORT_OUT.tsid, TELEPORT_OUT.x, TELEPORT_OUT.y], [CORRIDOR_FIVE_TSID, 102, -534]);
  });
});

describe('Room 23: the Greeterbot and Gwendolyn', () => {
  const fresh = () => {
    const qs = { active: {}, completed: [] };
    ensureQuestOfferState(qs);
    return qs;
  };

  it('opens by level first, then by Gwendolyn\'s Task', () => {
    assert.equal(greeterOpening(fresh(), 5), 'too_young');
    assert.equal(greeterOpening(fresh(), 11), 'too_young');
    assert.equal(greeterOpening(fresh(), 12), 'first');
    assert.equal(greeterOpening({ active: {}, completed: [TASK] }, 12), 'done');
    assert.equal(greeterOpening({ active: {}, completed: [TASK] }, 9), 'too_young');
  });

  it('walks each conversation to its source ending', () => {
    const keys = (s) => s.beats.map((b) => b.key);
    const first = greeterScript('first');
    assert.deepEqual(keys(first), ['first', 'quest-ok', 'ghost', 'see-gwen']);
    assert.equal(first.end, 'lead-on');
    assert.deepEqual(first.beats.map((b) => b.button), ['OK', 'Ghost?', 'OK', 'Lead on!']);
    const young = greeterScript('too_young');
    assert.deepEqual(keys(young), ['too_young', 'if-you-say-so', 'ok-too-young']);
    assert.equal(young.end, 'teleport');
    assert.equal(young.beats.reduce((n, b) => n + (b.currants || 0), 0), 50);
    const repeat = greeterScript('done', { canPay: true });
    assert.deepEqual(keys(repeat), ['done', 'yes-true', 'out-of-touch', 'go-again']);
    assert.equal(repeat.end, 'lead-on');
    assert.equal(repeat.beats[3].cost, 100);
    assert.equal(repeat.beats[2].second, 'Too rich for my blood.');
    const broke = greeterScript('done', { canPay: false });
    assert.deepEqual(keys(broke), ['done', 'yes-true', 'out-of-touch', 'go-again-broke', 'take-currants']);
    assert.equal(broke.end, 'teleport');
    const decline = greeterScript('done', { decline: true, canPay: true });
    assert.deepEqual(keys(decline), ['done', 'yes-true', 'out-of-touch', 'take-currants']);
    assert.equal(decline.beats.reduce((n, b) => n + (b.currants || 0), 0), 50);
  });

  it('a paid repeat clears the chain so Gwendolyn offers it again and part 3 comes back as the repeat', () => {
    const qs = fresh();
    for (const id of [TASK, PART2, PART3]) qs.completed.push(id);
    assert.equal(gwendolynOffers(qs), false);
    assert.equal(clearChainForRepeat(qs), true);
    assert.deepEqual(qs.completed, [PART3]);
    assert.equal(gwendolynOffers(qs), false, 'part 3 done and the repeat not paid');
    assert.equal(gwendolynOffers(qs, { repeatPaid: true }), true);
    assert.equal(thirdPartFor(qs), PART3_REPEAT);
    assert.equal(G_PART3, PART3);
    assert.equal(G_PART3_REPEAT, PART3_REPEAT);
    // A second paid repeat drops the first repeat's completion too.
    qs.completed.push(TASK, PART2, PART3_REPEAT);
    clearChainForRepeat(qs);
    assert.deepEqual(qs.completed, [PART3]);
    // Fresh: she offers; while the quest is under way she does not.
    const q2 = fresh();
    assert.equal(gwendolynOffers(q2), true);
    q2.active[TASK] = { progress: {} };
    assert.equal(gwendolynOffers(q2), false);
  });
});

describe('Room 23: the offer is Gwendolyn\'s, not the Magic Rock\'s', () => {
  before(() => loadContentCatalogsFromDir(join(spike, 'public/assets/content')));
  const pc = (level) => ({ xp: XP_FOR_LEVEL[level - 2], level, mood: 100, energy: 100 });

  it('routes tower_quest to npc_gwendolyn with the Greeterbot\'s level 12 gate', () => {
    assert.deepEqual(OFFER_OVERRIDES.tower_quest.offerTriggers, [{ type: 'npc', npc: 'npc_gwendolyn' }]);
    const def = getQuestCatalog().tower_quest;
    assert.deepEqual(def.offerTriggers, [{ type: 'npc', npc: 'npc_gwendolyn', override: true }]);
    assert.deepEqual(def.prerequisites, [{ condition: 'over_level', value: 12, not: 0 }]);
    assert.equal(def.acceptLabel, 'Kind of.');
  });

  it('Gwendolyn offers it at level 12 (with the source offer), not at 11; the familiar never does', () => {
    const qs = { active: {}, completed: [] };
    ensureQuestOfferState(qs);
    const card = npcQuestOffers(qs, 'npc_gwendolyn', pc(12), { level: 12 }).offered.find((c) => c.classTsid === TASK);
    assert.ok(card);
    assert.match(card.beats[0].text, /I am Gwendolyn, disciple of Cosma/);
    assert.equal(card.acceptLabel, 'Kind of.');
    assert.ok(!npcQuestOffers(qs, 'npc_gwendolyn', pc(11), { level: 11 }).offered.some((c) => c.classTsid === TASK));
    assert.ok(!npcQuestOffers(qs, 'magic_rock', pc(12), { level: 12 }).offered.some((c) => c.classTsid === TASK));
    const familiar = pendingQuestOffers(qs, pc(12), { level: 12, street: CORRIDOR_FIVE_TSID, streetTsid: CORRIDOR_FIVE_TSID }).map((r) => r.classTsid);
    assert.ok(!familiar.includes(TASK));
    // Accepting it is the quest's start (quest-instances takes it to Area 42).
    assert.ok(acceptOffer(qs, TASK, { level: 12, pc: pc(12) }).ok);
    assert.ok(qs.offers.managed[TASK]);
    assert.ok(turnInQuest(qs, TASK, null, {}).ok);
  });
});

describe('Room 23: the room', () => {
  const R = ROOM_23;
  const [t1, t2, walk, mound] = R.tiers;

  it('is written, indexed (hub 79) and linked from Corridor Five\'s door, still locked by key 5', () => {
    const s = street(ROOM_23_TSID);
    // The builder's output (tower-rooms.test.js runs build-tower-rooms.mjs --check); doors get linked there.
    const built = JSON.parse(JSON.stringify(room23Street()));
    for (const k of ['bounds', 'platforms', 'layers', 'barriers', 'gradient', 'stats']) assert.deepEqual(s[k], built[k], k);
    const row = JSON.parse(readFileSync(pub('assets/streets/index.json'), 'utf8')).streets[ROOM_23_TSID];
    assert.deepEqual([row.label, row.hubId, row.reconstructed], ['Room 23', '79', true]);
    assert.equal(ROOM_23_ROOM.sourceTsid, ROOM_23_SOURCE_TSID);
    const [link] = GWENDOLYN_DOOR_LINKS;
    const door = street(link.street).doors.find((d) => d.id === link.door);
    assert.deepEqual([door.key_id, door.is_locked, door.connect.street, door.connect.x, door.connect.y], [5, true, ROOM_23_TSID, -1919, -135]);
    assert.deepEqual(door.connect.arrive, { x: -1919 - R.bounds.l, y: R.floor - R.bounds.t });
    // The way out stands where you arrive and leads back to the same door.
    const out = s.doors[0];
    assert.deepEqual([out.x, out.y], [door.connect.arrive.x, door.connect.arrive.y]);
    assert.equal(out.connect.street, CORRIDOR_FIVE_TSID);
    assert.deepEqual(out.connect.arrive, { x: door.x, y: out.connect.arrive.y });
  });

  it('climbs from the arrival to Gwendolyn by plain jumps, every face a wall', () => {
    const floorP = ROOM_23_ROOM.platforms.find((p) => p.id === 'plat_r23_floor');
    assert.ok(ROOM_23_DOOR.arrive.x >= floorP.x1 && ROOM_23_DOOR.arrive.x <= floorP.x2);
    assert.equal(floorP.y1, ROOM_23_DOOR.arrive.y);
    let below = R.floor;
    let x = floorP.x2 - 20;
    for (const tier of [t1, t2, walk, mound]) {
      const rise = below - tier.y;
      assert.ok(rise > 0 && rise <= JUMP_RISE - 20, `${tier.id} rises ${rise}`);
      assert.ok(Math.abs(tier.x1 - x) <= 20, `${tier.id} starts where the level below ends`);
      const wall = ROOM_23_ROOM.barriers.find((b) => b.x === tier.x1 && b.y === tier.y);
      assert.ok(wall && wall.pc_perm === null && wall.y + wall.h >= below, `${tier.id} has a face`);
      below = tier.y;
      x = tier.x2;
    }
  });

  it('puts the Greeterbot by the arrival, leads to x 1250 on the walk, and Gwendolyn just up to the right', () => {
    assert.ok(Math.abs(R.greeter.x - ROOM_23_DOOR.arrive.x) <= HIT_HALF, 'it greets you as you arrive');
    const path = leadPath();
    assert.deepEqual(path.at(-1), { x: LEAD_X, y: walk.y });
    assert.ok(LEAD_X >= walk.x1 && LEAD_X <= walk.x2);
    assert.ok(R.gwen.x > LEAD_X && R.gwen.x >= mound.x1 && R.gwen.x <= mound.x2);
    assert.ok(R.gwen.x - mound.x1 <= HIT_HALF + 100, 'she notices you soon after the step');
    assert.ok(R.gwen.x - LEAD_X > HIT_HALF, 'but not while you stand by the Greeterbot');
    assert.ok(R.gourd.x > R.gwen.x && R.gourd.x < R.bounds.r);
  });

  it('dresses itself from firebog.swf street decos on disk, plus the rendered up arrow', () => {
    const manifest = new Set(JSON.parse(readFileSync(pub('assets/decos/manifest.json'), 'utf8')));
    const firebog = existsSync(firebogDir) ? new Set(readdirSync(firebogDir).filter((f) => f.endsWith('.swf')).map((f) => f.slice(0, -4))) : null;
    const s = street(ROOM_23_TSID);
    const sprites = new Set([...s.layers.flatMap((l) => l.decos.map((d) => d.sprite)), ...s.doors.map((d) => d.sprite)]);
    for (const sprite of sprites) {
      assert.ok(manifest.has(sprite), `${sprite} not in the deco manifest`);
      if (firebog) assert.ok(firebog.has(sprite), `${sprite} is not a firebog.swf deco`);
    }
    for (const want of ['legs_moss_1', 'front_ground_set_1', 'firebog_ladder_tile_center_01_vine', 'hanging_braches1', 'bottletree_body2', 'ground_generic_1']) assert.ok(sprites.has(want), want);
    assert.deepEqual(s.gradient, { top: '000000', bottom: '000000' }, 'a black void');
    const plan = JSON.parse(readFileSync(join(spike, 'tools/room-art/gwendolyn_room_23.json'), 'utf8'));
    assert.match(plan.source, /glitch-locations firebog\.swf \(CC0\)/);
    const [file, w, h] = ROOM_23_FILES.firebog_up_arrows;
    const row = plan.pieces.firebog_up_arrows;
    assert.equal(row.swf, 'bundle:firebog.swf#firebog_up_arrows');
    assert.equal(file, row.file);
    assert.deepEqual([w, h], row.world);
    assert.equal(sha16(pub(`${ROOM_23_ART_ROOT}${file}`)), row.sha);
    assert.ok(existsSync(pub(GREETERBOT.art)), 'the Mezzanine\'s Greeterbot art');
  });
});

describe('Room 23: the feature', () => {
  it('is registered and keeps the room indoors', () => {
    const index = readFileSync(pub('js/features/index.js'), 'utf8');
    assert.match(index, /gwendolynRoom23Feature/);
    assert.match(readFileSync(pub('game.js'), 'utf8').split('\n')[6], /features\/index\.js\?v=registry-\d+/);
    const eco = gwendolynRoom23Feature.ecologyOverride({ tsid: ROOM_23_TSID });
    assert.deepEqual([eco.interior, eco.quoins, eco.counts], [true, 0, {}]);
    assert.equal(gwendolynRoom23Feature.ecologyOverride({ tsid: CORRIDOR_FIVE_TSID }), null);
  });

  it('saves only the paid-repeat flag and a greeting count', () => {
    gwendolynRoom23Feature.restore({ repeatPaid: true, greetings: 3, junk: 1 });
    assert.deepEqual(gwendolynRoom23Feature.save(), { v: 1, repeatPaid: true, greetings: 3 });
    gwendolynRoom23Feature.restore(undefined);
    assert.deepEqual(gwendolynRoom23Feature.save(), { v: 1, repeatPaid: false, greetings: 0 });
  });
});

describe('The Inner Mind matches its Snaps (G71)', () => {
  const L = innerLayout(kit);
  const plan = JSON.parse(readFileSync(join(spike, 'tools/room-art/gwendolyn_inner_mind.json'), 'utf8'));

  it('stands six or more shards behind, faded, and two separate jellies, magenta and orange', () => {
    const behind = [...L.far.shards, ...L.mid.shards];
    assert.ok(behind.length >= 6);
    assert.ok(L.far.alpha < 0.6 && L.mid.alpha < 1, 'the far ones are faded');
    assert.ok(new Set(behind.map((s) => s.art)).size >= 6);
    const [magenta, orange] = L.jellies;
    assert.deepEqual([magenta.art, orange.art], ['object_4', 'object_4b']);
    const half = (j) => (GWENDOLYN_INNER_FILES[j.art][1] * j.scale) / 2;
    assert.ok(orange.x - half(orange) > magenta.x + half(magenta), 'apart, not one hive');
    // The orange jelly is the first wall, with the glass shelf on its face.
    const hive = L.crystals.find((c) => c.id === 'beehive');
    assert.equal(hive.art, 'object_4b');
    assert.equal(orange.x, (hive.x1 + hive.x2) / 2);
    assert.ok(L.platforms.some((p) => p.id === 'im_beehive_top' && p.style === 'glass'));
    assert.equal(L.domes.length, 3);
    assert.equal(L.cracks.length, 5);
  });

  it('draws every piece from the arbito1.swf renders its plan records', () => {
    assert.match(plan.source, /glitch-locations arbito1\.swf \(CC0\)/);
    const used = new Set([
      ...L.far.shards, ...L.mid.shards, ...L.jellies, ...L.front, ...L.domes,
    ].map((s) => s.art).concat(L.crystals.map((c) => c.art), ['object_10', 'object_10b', 'platform_2b']));
    for (const art of used) {
      const row = plan.pieces[art];
      assert.ok(row, `${art} not in the plan`);
      assert.equal(row.swf, `bundle:arbito1.swf#${art}`);
      const [file, w, h] = GWENDOLYN_INNER_FILES[art];
      assert.deepEqual([file, w, h], [row.file, ...row.world]);
      assert.equal(sha16(pub(`assets/sprites/quest-rooms/gwendolyn/inner_mind/${file}`)), row.sha, `${file} changed since the build`);
      assert.ok(INNER_BASE[art] > 0 && INNER_BASE[art] < 1, `${art} has a base line`);
    }
    assert.deepEqual(Object.keys(GWENDOLYN_INNER_FILES).sort(), Object.keys(plan.pieces).sort());
    const bytes = Object.values(plan.pieces).reduce((n, r) => n + r.bytes, 0);
    assert.ok(bytes < 400_000, `${bytes} bytes`);
  });
});

describe('G318: no lines of our own where the source says nothing', () => {
  const HAVE_GSJS = existsSync(join(gsjs, 'items', 'npc_gwendolyn.js'));

  it('the talk_to verbs hide (state null) instead of a made-up disabled reason', { skip: !HAVE_GSJS && 'GSJS not present' }, () => {
    const gwen = readFileSync(join(gsjs, 'items', 'npc_gwendolyn.js'), 'utf8').split('\n');
    assert.match(gwen[181], /"tooltip"\s*: "Speak\. With words",/);
    assert.match(gwen[185], /return \{state:null\};/);
    const widget = readFileSync(join(gsjs, 'items', 'npc_widget.js'), 'utf8').split('\n');
    assert.match(widget[210], /if \(!config\.is_dev\) return \{state:null\};/);
    assert.match(readFileSync(join(gsjs, 'items', 'npc_quest_giver_widget.js'), 'utf8').split('\n')[187], /"tooltip"\s*: "Listen to what they have to say",/);
    const feat = readFileSync(pub('js/features/gwendolyn-room-23-feature.js'), 'utf8');
    assert.doesNotMatch(feat, /It has said its piece|She has nothing to offer you now/);
    assert.match(feat, /if \(greeter\.state !== 'waiting'\) return \[\];/);
    assert.match(feat, /if \(!can\) return \[\];/);
  });

  it('the squid appears and Gwendolyn turns in without an activity line', { skip: !HAVE_GSJS && 'GSJS not present' }, () => {
    const cactus = readFileSync(join(gsjs, 'items', 'npc_cactus.js'), 'utf8').split('\n');
    const crazy = cactus.slice(221, 227).join('\n');
    assert.match(crazy, /function doCrazyShit\(\)/);
    assert.match(crazy, /createItemStack\('npc_squid', 1, pc\.x - 150, pc\.y - 60\)/);
    assert.doesNotMatch(crazy, /sendActivity|sendBubble|announce/);
    const gwen = readFileSync(join(gsjs, 'items', 'npc_gwendolyn.js'), 'utf8').split('\n');
    const collide = gwen.slice(215, 236).join('\n');
    assert.match(collide, /function onPlayerCollision\(pc\)/);
    assert.doesNotMatch(collide, /sendActivity|apiDelete|fade/i);
    const room = readFileSync(pub('js/quest-rooms/gwendolyn.js'), 'utf8');
    assert.doesNotMatch(room, /Something has appeared beside you\.'\);|fades back into the dark/);
  });
});
