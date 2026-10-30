/**
 * Vendor NPCs (register G121): js/vendor-npcs.js, features/vendor-npcs-feature.js,
 * the street-ecology.json `vendors` map (build-street-ecology.mjs) and the
 * Meet the Merchants quest chain (quest-offers.js).
 *
 * Sources: glitch-GameServerJS items/npc_gardening_vendor.js, npc_cooking_vendor.js,
 * npc_tool_vendor.js, npc_jabba1.js, npc_jabba2.js, npc_sno_cone_vending_machine.js,
 * items/catalog_stores.js, quests/vendor_ping_pong_part1-4.js, and the archived
 * location objects in streets/mnt/stos/location_data.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import {
  VENDOR_NPCS,
  VENDOR_NPC_ART,
  VENDOR_NPC_CLASSES,
  VENDOR_NPC_LABELS,
  VENDOR_PLACEMENT_KEY,
  vendorAnchor,
  vendorNpcList,
  vendorNpcPlacementGroups,
  vendorNpcStoreProfile,
  vendorNpcsFor,
  vendorSheet,
} from '../public/js/vendor-npcs.js?v=53b1f6c9';
import { VENDOR_PROFILES } from '../public/js/vendor.js?v=563afb9b';
import { getQuestCatalog, loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=10b118dd';
import { createQuestState } from '../public/js/quests.js?v=282e1621';
import {
  REMAKE_QUEST_NPCS,
  acceptOffer,
  classifyQuests,
  heldForNpcTurnIn,
  npcQuestOffers,
  pendingQuestOffers,
  syncItemRequirements,
  turnInQuest,
} from '../public/js/quest-offers.js?v=6b6cbf22';
import { XP_FOR_LEVEL } from '../public/js/progression.js?v=33462eaa';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const GSJS = join(ROOT, '../glitch-GameServerJS');
const LOCATIONS = join(ROOT, '../streets/mnt/stos/location_data');
const ECOLOGY = JSON.parse(readFileSync(join(PUBLIC, 'assets/content/street-ecology.json'), 'utf8'));
const INDEX = JSON.parse(readFileSync(join(PUBLIC, 'assets/streets/index.json'), 'utf8')).streets;

const gsjsItem = (cls) => readFileSync(join(GSJS, 'items', `${cls}.js`), 'utf8');
const ids = (rows) => rows.map((row) => row.classTsid);
const pc = (xp = 0) => ({ energy: 50, mood: 50, imagination: 0, xp, currants: 0, giantFavor: {} });

/** Archived placements: L-file -> classes, from item objrefs only. */
const SOURCE_PLACEMENTS = {
  GCR101NQ4BU1SKS: { npc_gardening_vendor: 1 }, // Community Gardens
  GCR101UN0NJ1QPQ: { npc_gardening_vendor: 1 }, // Middle Arbor
  GCR202JSVIN1STL: { npc_gardening_vendor: 1 }, // Kipacre Greens
  GIFCNFNEJRG2ON4: { npc_gardening_vendor: 1 }, // Mmumawwa Wala
  GIFGR46M8RE2RC7: { npc_gardening_vendor: 1 }, // Veldt Balm
  GIF12PMQ5121D68: { npc_tool_vendor: 1 }, // Cebarkul
  GLI1D2QFT571VQT: { npc_tool_vendor: 1 }, // Level 4 East
  GLI101QQRA211SM: { npc_cooking_vendor: 1 }, // Level 2 East
  GM4118MEHFDMM: { npc_jabba1: 1 }, // Uncle Friendly's Emporium
  GM413RQ6LRG9N: { npc_jabba2: 1 }, // West Spice
  GM11E7ODKHO1QJE: { npc_sno_cone_vending_machine: 1 }, // Wintry Place
};

describe('vendor NPC placement', () => {
  it('puts each vendor where the archived location objects did, on imported streets', () => {
    assert.deepEqual(ECOLOGY.vendors, SOURCE_PLACEMENTS);
    assert.equal(ECOLOGY.vendorStreetCount, 11);
    for (const tsid of Object.keys(SOURCE_PLACEMENTS)) assert.ok(INDEX[tsid], `${tsid} is imported`);
  });

  it('matches the item objrefs in the location dump', { skip: !existsSync(LOCATIONS) }, () => {
    const found = {};
    for (const f of readdirSync(LOCATIONS)) {
      if (!f.startsWith('L') || !f.endsWith('.xml')) continue;
      const xml = readFileSync(join(LOCATIONS, f), 'utf8');
      const block = xml.match(/<objrefs id="items">([\s\S]*?)<\/objrefs>/)?.[1] || '';
      for (const m of block.matchAll(/<objref\b[^>]*\blabel="([^"]+)"/g)) {
        const cls = VENDOR_NPC_LABELS[m[1]];
        if (!cls) continue;
        const g = `G${f.slice(1, -4)}`;
        (found[g] ||= {})[cls] = (found[g]?.[cls] || 0) + 1;
      }
    }
    assert.deepEqual(found, SOURCE_PLACEMENTS);
  });

  it('labels are the GSJS item labels', () => {
    for (const [label, cls] of Object.entries(VENDOR_NPC_LABELS)) {
      assert.match(gsjsItem(cls), new RegExp(`var label = "${label}";`), cls);
      assert.equal(VENDOR_NPCS[cls].label, label);
    }
  });

  it('asks the planner for one point per vendor and reads G/L aliases', () => {
    assert.deepEqual(vendorNpcPlacementGroups(vendorNpcsFor(ECOLOGY, 'LIF12PMQ5121D68')), [{ key: VENDOR_PLACEMENT_KEY, count: 1, clearance: 140 }]);
    assert.deepEqual(vendorNpcList(vendorNpcsFor(ECOLOGY, 'GM4118MEHFDMM')), ['npc_jabba1']);
    assert.deepEqual(vendorNpcPlacementGroups(vendorNpcsFor(ECOLOGY, 'GLI2V0UN7RD1T2J')), []);
  });
});

describe('vendor NPC stores', () => {
  let stores;
  before(() => {
    const ctx = {};
    vm.runInNewContext(`${readFileSync(join(GSJS, 'items/catalog_stores.js'), 'utf8')};this.stores = stores;`, ctx);
    stores = ctx.stores;
  });

  it('opens the store_id, tooltip and description each GSJS file names', () => {
    for (const cls of VENDOR_NPC_CLASSES) {
      const src = gsjsItem(cls);
      const def = VENDOR_NPCS[cls];
      assert.equal(Number(src.match(/"store_id"\s*:\s*(\d+)/)[1]), def.storeId, cls);
      const tooltip = src.match(/verbs\.buy_sell[\s\S]*?"tooltip"\s*:\s*"((?:[^"\\]|\\.)*)"/)[1].replace(/\\"/g, '"');
      assert.equal(def.buyTooltip, tooltip, cls);
      assert.equal(def.desc, src.match(/var description = "((?:[^"\\]|\\.)*)";/)[1], cls);
    }
  });

  it('sells catalog_stores.js stock at source prices (bags aside, as build-stores.mjs does)', () => {
    for (const cls of VENDOR_NPC_CLASSES) {
      const profile = vendorNpcStoreProfile(cls, VENDOR_PROFILES);
      const src = stores[VENDOR_NPCS[cls].storeId];
      assert.ok(profile && src, cls);
      assert.equal(profile.label, src.name);
      assert.equal(profile.desc, VENDOR_NPCS[cls].desc);
      const offered = new Map(profile.offers.map((o) => [o.classTsid, o.buyPrice]));
      for (const item of src.items) {
        if (/^bag_/.test(item.class_tsid) && !offered.has(item.class_tsid)) continue;
        assert.equal(offered.get(item.class_tsid), item.cost, `${cls} ${item.class_tsid}`);
      }
      assert.equal(offered.size, src.items.filter((i) => offered.has(i.class_tsid)).length);
    }
    // The Meet the Merchants shopping lists are on sale where the quests say.
    const garden = vendorNpcStoreProfile('npc_gardening_vendor', VENDOR_PROFILES).offers.map((o) => o.classTsid);
    for (const id of ['seed_tomato', 'seed_onion', 'hoe', 'watering_can']) assert.ok(garden.includes(id), id);
    assert.ok(vendorNpcStoreProfile('npc_tool_vendor', VENDOR_PROFILES).offers.some((o) => o.classTsid === 'butterfly_lotion'));
    assert.ok(vendorNpcStoreProfile('npc_jabba1', VENDOR_PROFILES).offers.some((o) => o.classTsid === 'beer'));
  });

  it('keeps the spoken lines from GSJS', () => {
    assert.match(gsjsItem('npc_gardening_vendor'), /"Hey, "\+pc\.label\+"! If you need gardening tools, I have plenty\."/);
    assert.equal(VENDOR_NPCS.npc_gardening_vendor.attract('friend'), 'Hey, friend! If you need gardening tools, I have plenty.');
    const sno = gsjsItem('npc_sno_cone_vending_machine');
    const talk = VENDOR_NPCS.npc_sno_cone_vending_machine.talk;
    for (const line of [talk.offer, talk.offerYes, talk.offerNo, talk.tooltip]) assert.ok(sno.includes(line), line);
    assert.ok(sno.includes('"Hot enough for ya, "+pc.label+"?"'));
    assert.match(gsjsItem('npc_jabba1'), /"tooltip"\s*:\s*"Are you sure\? He looks shifty"/);
    assert.equal(VENDOR_NPCS.npc_jabba1.questVerb.id, 'make_eye_contact');
    assert.equal(VENDOR_NPCS.npc_jabba2.questVerb, null);
  });
});

describe('vendor NPC art', () => {
  it('ships every strip at the size VENDOR_NPC_ART describes', async () => {
    for (const cls of VENDOR_NPC_CLASSES) {
      for (const state of Object.keys(VENDOR_NPC_ART[cls].states)) {
        const sheet = vendorSheet(cls, state);
        const file = join(PUBLIC, sheet.path);
        assert.ok(existsSync(file), sheet.path);
        // RIFF....WEBPVP8L: lossless; width/height live in the VP8L header.
        const buf = readFileSync(file);
        assert.equal(buf.toString('ascii', 12, 16), 'VP8L', sheet.path);
        const bits = buf.readUInt32LE(21);
        const w = (bits & 0x3fff) + 1;
        const h = ((bits >> 14) & 0x3fff) + 1;
        assert.equal(w, sheet.fw * sheet.cols, `${sheet.path} width`);
        assert.equal(h, sheet.fh * Math.ceil(sheet.frames / sheet.cols), `${sheet.path} height`);
        assert.ok(h <= 8192, `${sheet.path} fits a WebGL texture`);
      }
      const a = vendorAnchor(cls);
      assert.ok(a.x > 0 && a.x < 1 && a.y === 1, cls);
    }
  });

  it('swaps every strip to a 3x render of its vector SWF on first draw, frame for frame', async () => {
    const { FIRST_DRAW_SPRITES, HIRES_SPRITES, SPLIT_SPRITES } = await import('../public/js/sprite-hires.js?v=e2867181');
    const results = JSON.parse(readFileSync(join(PUBLIC, '../tools/vector-sprites/results.json'), 'utf8'));
    for (const cls of VENDOR_NPC_CLASSES) {
      for (const [state, art] of Object.entries(VENDOR_NPC_ART[cls].states)) {
        const sheet = vendorSheet(cls, state);
        const r = results[sheet.path];
        assert.equal(r?.status, 'ok', `${sheet.path} ${r?.reason || ''}`);
        assert.ok(FIRST_DRAW_SPRITES.has(sheet.path), sheet.path);
        assert.ok(HIRES_SPRITES.has(sheet.path) || SPLIT_SPRITES.has(sheet.path), sheet.path);
        // Same cells (the crop), same run of SWF frames: the strip's first kept frame, unmirrored.
        assert.deepEqual([r.fw, r.fh, r.cells, r.mirror, r.shift], [art.crop.w, art.crop.h, art.frames, false, art.first || 0], sheet.path);
        assert.equal(r.swfFrames[1] - r.swfFrames[0], art.frames - 1, sheet.path);
        assert.ok(r.score >= 0.95 && r.minFrame >= 0.85, `${sheet.path} ${r.score} ${r.minFrame}`);
      }
    }
  });
});

describe('Meet the Merchants', () => {
  const CONTENT = join(PUBLIC, 'assets/content');
  before(async () => {
    resetContentCatalogs();
    await loadContentCatalogsFromDir(CONTENT);
  });

  it('every vendor with a quest verb is a quest NPC; nothing solo is unreachable', () => {
    for (const cls of ['npc_gardening_vendor', 'npc_tool_vendor', 'npc_cooking_vendor', 'npc_jabba1']) assert.ok(REMAKE_QUEST_NPCS.includes(cls), cls);
    assert.ok(!REMAKE_QUEST_NPCS.includes('npc_jabba2'));
    const solo = classifyQuests().solo;
    for (const id of ['vendor_ping_pong_part1', 'vendor_ping_pong_part2', 'vendor_ping_pong_part3', 'vendor_ping_pong_part4', 'purple_journey_north']) {
      assert.ok(solo.find((r) => r.classTsid === id)?.reachable, id);
    }
  });

  it('runs the chain: rock offer, scarecrow turn-in and errands, each delivered by talk', () => {
    const state = createQuestState();
    const inv = {};
    const ctx = { inv, level: 2 };
    // Part 1: the pet rock speaks it ("I'm your pet rock"), so the familiar offers it.
    assert.ok(!ids(pendingQuestOffers(state, pc(0), { level: 1 })).includes('vendor_ping_pong_part1'));
    assert.ok(ids(pendingQuestOffers(state, pc(XP_FOR_LEVEL[1]), ctx)).includes('vendor_ping_pong_part1'));
    acceptOffer(state, 'vendor_ping_pong_part1', ctx);
    assert.ok(heldForNpcTurnIn(getDef('vendor_ping_pong_part1')));
    // Nothing to fetch, but it waits for the scarecrow.
    assert.deepEqual(ids(npcQuestOffers(state, 'npc_tool_vendor', pc(), ctx).completable), []);
    assert.deepEqual(ids(npcQuestOffers(state, 'npc_gardening_vendor', pc(), ctx).completable), ['vendor_ping_pong_part1']);
    assert.ok(turnInQuest(state, 'vendor_ping_pong_part1', pc(), ctx).ok);

    const steps = [
      ['vendor_ping_pong_part2', 'npc_tool_vendor', { seed_tomato: 1, seed_onion: 1, hoe: 1, watering_can: 1 }],
      ['vendor_ping_pong_part3', 'npc_cooking_vendor', { butterfly_lotion: 3 }],
      ['vendor_ping_pong_part4', 'npc_jabba1', { beer: 6, hooch: 1 }],
    ];
    for (const [quest, endNpc, goods] of steps) {
      // Offered by the scarecrow only, never by the familiar.
      assert.ok(!ids(pendingQuestOffers(state, pc(), ctx)).includes(quest), quest);
      assert.ok(ids(npcQuestOffers(state, 'npc_gardening_vendor', pc(), ctx).offered).includes(quest), quest);
      assert.ok(acceptOffer(state, quest, ctx).ok, quest);
      Object.assign(inv, goods);
      syncItemRequirements(state, inv, ctx);
      assert.ok(heldForNpcTurnIn(getDef(quest)), quest);
      assert.deepEqual(ids(npcQuestOffers(state, 'npc_gardening_vendor', pc(), ctx).completable), [], quest);
      assert.deepEqual(ids(npcQuestOffers(state, endNpc, pc(), ctx).completable), [quest]);
      const done = turnInQuest(state, quest, pc(), ctx);
      assert.ok(done.ok, quest);
      for (const [id, n] of Object.entries(goods)) assert.ok(done.removed.some((r) => r.classTsid === id && r.count === n), `${quest} takes ${id}`);
    }
    assert.ok(state.completed.includes('vendor_ping_pong_part4'));
    assert.deepEqual(ids(npcQuestOffers(state, 'npc_gardening_vendor', pc(), ctx).offered).filter((id) => id.startsWith('vendor_ping_pong')), []);
  });

  it('Uncle Friendly offers A Purple Journey North; Helga does not', () => {
    const state = createQuestState();
    assert.ok(ids(npcQuestOffers(state, 'npc_jabba1', pc(), {}).offered).includes('purple_journey_north'));
    assert.ok(!heldForNpcTurnIn(getDef('purple_journey_north')), 'familiar turn-in');
  });
});

function getDef(id) {
  return getQuestCatalog()[id];
}
