/**
 * Pack, quest, vendor, interactive map — shipped modules only.
 * Run: node --test tests/ui-systems.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTokens } from './css-tokens.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createInventory,
  addItem,
  removeItem,
  useItem,
  countItem,
  listPackSlots,
  listPackItemSlots,
  listPackToolSlots,
  listPackRows,
  isToolItem,
  getItemUseInfo,
} from '../public/js/inventory.js?v=85d4faba';
import { starterToolsInventory, ensureMakingItems } from '../public/js/making.js?v=9e538296';
import {
  createQuestState,
  assignQuest,
  applyQuestProgress,
  getQuestProgress,
  listQuestTracker,
  QUEST_CATALOG,
} from '../public/js/quests.js?v=282e1621';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';

const __dirnameUi = dirname(fileURLToPath(import.meta.url));
before(async () => {
  await loadContentCatalogsFromDir(join(__dirnameUi, '../public/assets/content'));
});
import {
  DEFAULT_VENDOR,
  vendorBuy,
  vendorSell,
  listBuyOffers,
  listSellOffers,
  createVendorSellQuote,
} from '../public/js/vendor.js?v=563afb9b';
import {
  buildMapGraph,
  buildHubMapView,
  mapClickTravel,
  renderHubMapSvg,
  findCurrentStreet,
  segmentMid,
  listHubsFromIndex,
  resolveHubId,
} from '../public/js/map-graph.js?v=53d64e50';
import { STREET_INDEX } from '../public/js/street-loader.js?v=d4113627';
import { listMapDestinations } from '../public/js/travel.js?v=855c6c68';
import { readFileSync } from 'node:fs';

const HUB56 = JSON.parse(
  readFileSync(join(__dirnameUi, '../public/assets/maps/hubs/hub-56.json'), 'utf8')
);
const MAP_INDEX = JSON.parse(
  readFileSync(join(__dirnameUi, '../public/assets/maps/index.json'), 'utf8')
);
const HUB_SALATU = JSON.parse(
  readFileSync(join(__dirnameUi, '../public/assets/maps/hubs/hub-93.json'), 'utf8')
);

describe('pack / inventory', () => {
  it('adds items and lists pack slots with counts', () => {
    const inv = createInventory({ butterfly_lotion: 0, apple: 0 });
    addItem(inv, 'apple', 3);
    addItem(inv, 'grain', 2);
    const slots = listPackSlots(inv);
    assert.ok(slots.length >= 2);
    const apple = slots.find((s) => s.classTsid === 'apple');
    assert.ok(apple);
    assert.equal(apple.count, 3);
    assert.ok(apple.icon);
    assert.equal(apple.label, 'Apple');
  });

  it('dual-row pack: items row and tools row both receive entries', () => {
    ensureMakingItems();
    const inv = createInventory({
      apple: 2,
      grain: 5,
      butterfly_lotion: 0,
      ...starterToolsInventory(),
    });
    const items = listPackItemSlots(inv);
    const tools = listPackToolSlots(inv);
    const rows = listPackRows(inv);
    assert.ok(items.length >= 1, 'items row should list goods');
    assert.ok(tools.length >= 1, 'tools row should list tools');
    assert.ok(items.some((s) => s.classTsid === 'apple'));
    assert.ok(tools.some((s) => s.classTsid === 'knife_and_board' || s.classTsid === 'blender'));
    assert.ok(isToolItem('knife_and_board'));
    assert.equal(isToolItem('apple'), false);
    assert.equal(rows.itemCount, items.length);
    assert.equal(rows.toolCount, tools.length);
    // The modern pack is one row (bags, then items and tools); currants live in the top bar only
    const html = readFileSync(join(__dirnameUi, '../public/play/index.html'), 'utf8');
    assert.ok(html.includes('id="pack-items"'));
    assert.ok(html.includes('id="pack-bags"'));
    assert.ok(!html.includes('id="pack-tools"'));
    assert.ok(html.includes('id="stat-currants"'));
    assert.ok(!html.includes('id="pack-currants"'));
  });

  it('use consumable changes pack + metabolics', () => {
    const inv = createInventory({ apple: 2, butterfly_lotion: 0 });
    const pc = { energy: 40, mood: 40, currants: 0 };
    const r = useItem(inv, pc, 'apple');
    assert.equal(r.ok, true);
    assert.equal(countItem(inv, 'apple'), 1);
    assert.ok(pc.energy > 40);
  });

  it('pack use previews match the effects actually applied', () => {
    const preview = getItemUseInfo('apple');
    assert.equal(preview.usable, true);
    assert.equal(preview.verb, 'Eat');
    assert.deepEqual(preview.effects, { energy: 10, mood: 5 });
    const inv = createInventory({ apple: 1, butterfly_lotion: 0 });
    const pc = { energy: 40, mood: 40 };
    const used = useItem(inv, pc, 'apple');
    assert.deepEqual(used.effects, preview.effects);

    const cappedInv = createInventory({ apple: 1, butterfly_lotion: 0 });
    const cappedPc = { energy: 97, mood: 100 };
    const capped = useItem(cappedInv, cappedPc, 'apple');
    assert.deepEqual(capped.effects, { energy: 3 });
    assert.equal(cappedPc.energy, 100);
    assert.equal(cappedPc.mood, 100);

    assert.equal(getItemUseInfo('butterfly_lotion').usable, false);
    assert.match(getItemUseInfo('butterfly_lotion').reason, /recipes|quests|trading/i);
    assert.equal(getItemUseInfo('knife_and_board').usable, false);
    assert.match(getItemUseInfo('knife_and_board').reason, /tool/i);
  });

  it('ships a contextual pack action card with use, recipe, tool, and vendor paths', () => {
    const html = readFileSync(join(__dirnameUi, '../public/play/index.html'), 'utf8');
    const css = resolveTokens(readFileSync(join(__dirnameUi, '../public/style.css'), 'utf8'));
    const game = readFileSync(join(__dirnameUi, '../public/game.js'), 'utf8');
    assert.match(html, /id="pack-popover"/);
    assert.match(html, /Shift-click to quick use/);
    assert.match(css, /\.pack-popover/);
    assert.match(css, /\.pack-slot\.active/);
    assert.match(game, /renderPackPopover/);
    assert.match(game, /data-pack-use/);
    assert.match(game, /data-pack-make/);
    assert.match(game, /data-pack-sell/);
    assert.match(game, /event\.shiftKey/);
    assert.match(css, /\.pack-bar\s*\{[\s\S]*?z-index:\s*45/);
    // Modal workflows stop above the live pack so it stays usable underneath.
    assert.match(css, /\.glitch-modal\s*\{[^}]*bottom:\s*var\(--pack-live-height, 105px\)/);
    assert.match(css, /\.vendor-shelf\[hidden\][\s\S]*?display:\s*none\s*!important/);
    assert.match(css, /\.qty-row \.btn-glitch-primary\s*\{[\s\S]*?width:\s*auto[\s\S]*?background:\s*#4a90c8/);
  });

  it('an open pack card keeps its buttons through HUD redraws, and its green button stays green on hover', () => {
    const css = resolveTokens(readFileSync(join(__dirnameUi, '../public/style.css'), 'utf8'));
    const game = readFileSync(join(__dirnameUi, '../public/game.js'), 'utf8');
    // updateHud redraws the open card on every HUD change; the same markup keeps the same buttons (no hover blink).
    assert.match(game, /if \(packSelected\) renderPackPopover\(packSelected\);/);
    assert.match(game, /const unchanged = pop\.dataset\.packFor === classTsid && pop\.innerHTML !== '' && packPopoverMarkup === markup;\n[\s\S]{0,500}?if \(!unchanged\) \{\n\s*pop\.innerHTML = markup;/);
    assert.match(game, /positionPackPopover\(pop, sourceAnchor\);\n\s*if \(unchanged\) return;/);
    assert.match(game, /packPopoverMarkup = '';/, 'closing forgets the markup');
    assert.match(game, /const sourceAnchor = \(anchor\?\.isConnected \? anchor : null\) \|\| findPackSlotElement\(classTsid\);/);
    // .pack-pop-actions button:hover (0,2,1) outranks .pack-pop-primary (0,2,0): the primary needs its own hover.
    assert.match(css, /\.pack-pop-actions \.pack-pop-primary:hover:not\(:disabled\) \{ background: #5a9e3e;/, 'a shade deeper than #6aaa3a (the design token --c-green-63)');
  });

  it('uses one shared inventory module instance so runtime-registered tools reach the HUD', () => {
    const files = [
      '../public/game.js',
      '../public/js/garden.js',
      '../public/js/making.js',
      '../public/js/mining.js',
      '../public/js/musicblocks.js',
      '../public/js/shrines.js',
      '../public/js/vendor.js',
      '../public/js/world-items.js',
    ].map((path) => readFileSync(join(__dirnameUi, path), 'utf8'));
    for (const source of files) {
      assert.match(source, /inventory\.js\?v=[0-9a-f]{8}/);
      assert.doesNotMatch(source, /inventory\.js\?v=(?:pack-actions-1|butterfly-care-1)/);
    }
    const game = files[0];
    assert.match(game, /classTsid === 'fruit_changing_machine'[\s\S]*?'Convert fruit'/);
    // The tool's condition is said once, on the stack menu's kind line (VERBS).
    assert.equal((game.match(/\[conditionNote, foodMemory, /g) || []).length, 1);
  });

  it('starts with sound on, remembers a mute, and offers the mute control', () => {
    const html = readFileSync(join(__dirnameUi, '../public/play/index.html'), 'utf8');
    const game = readFileSync(join(__dirnameUi, '../public/game.js'), 'utf8');
    assert.match(game, /muted:\s*loadMutedPreference\(\)/);
    assert.match(game, /state\.muted = !state\.muted;\n\s*saveMutedPreference\(state\.muted\);/);
    assert.match(html, /id="mute-btn"[^>]*title="Mute audio"[^>]*aria-label="Mute audio"[^>]*aria-pressed="false"/);
    assert.match(html, /id="start-btn"[^>]*>Start exploring</);
    assert.doesNotMatch(html, /Start \(enables sound\)/);
  });

  it('remove/spend reduces count', () => {
    const inv = createInventory({ cherry: 5, butterfly_lotion: 0 });
    assert.equal(removeItem(inv, 'cherry', 2), true);
    assert.equal(countItem(inv, 'cherry'), 3);
  });
});

describe('quest system UI state', () => {
  it('assign → progress → complete drives log fields', () => {
    const state = createQuestState();
    const pc = { energy: 50, mood: 50, imagination: 0, currants: 0 };
    assignQuest(state, 'animalkinship_pet_piggies', { ignorePrereq: true });
    let p = getQuestProgress(state, 'animalkinship_pet_piggies');
    assert.equal(p.active, true);
    assert.equal(p.requirements[0].current, 0);
    assert.equal(p.requirements[0].num, 6);
    for (let i = 0; i < 6; i++) applyQuestProgress(state, 'pet_piggy', 1, pc);
    p = getQuestProgress(state, 'animalkinship_pet_piggies');
    assert.equal(p.completed, true);
    assert.equal(p.active, false);
    assert.ok(pc.currants >= 50);
  });

  it('catalog has original quest titles for log UI', () => {
    assert.equal(QUEST_CATALOG.animalkinship_pet_piggies.title, 'Porcine Pleaser');
  });

  it('builds a compact active tracker with clamped progress percentages', () => {
    const state = createQuestState();
    assignQuest(state, 'animalkinship_pet_piggies', { ignorePrereq: true });
    applyQuestProgress(state, 'pet_piggy', 2);
    const tracker = listQuestTracker(state, 1);
    assert.equal(tracker.length, 1);
    assert.equal(tracker[0].title, 'Porcine Pleaser');
    assert.equal(tracker[0].requirements[0].current, 2);
    assert.equal(tracker[0].requirements[0].total, 6);
    assert.equal(tracker[0].requirements[0].percent, 33);
  });

  it('ships the persistent quest and local activity HUD', () => {
    const html = readFileSync(join(__dirnameUi, '../public/play/index.html'), 'utf8');
    assert.match(html, /id="play-context"/);
    assert.match(html, /id="quest-tracker-list"/);
    assert.match(html, /id="activity-history"/);
  });
});

describe('vendor buy/sell', () => {
  it('buys item for currants and adds to pack', () => {
    const inv = createInventory({ butterfly_lotion: 0, apple: 0 });
    const pc = { currants: 100, energy: 50, mood: 50 };
    const before = pc.currants;
    const r = vendorBuy(pc, inv, DEFAULT_VENDOR.offers, 'apple', 2);
    assert.equal(r.ok, true);
    assert.equal(countItem(inv, 'apple'), 2);
    assert.equal(pc.currants, before - 8 * 2);
  });

  it('sells pack item for currants', () => {
    const inv = createInventory({ grain: 3, butterfly_lotion: 0 });
    const pc = { currants: 10, energy: 50, mood: 50 };
    const r = vendorSell(pc, inv, DEFAULT_VENDOR.offers, 'grain', 1);
    assert.equal(r.ok, true);
    assert.equal(countItem(inv, 'grain'), 2);
    assert.ok(pc.currants > 10);
  });

  it('rejects buy when broke', () => {
    const inv = createInventory({ butterfly_lotion: 0 });
    const pc = { currants: 1, energy: 50, mood: 50 };
    const r = vendorBuy(pc, inv, DEFAULT_VENDOR.offers, 'butterfly_lotion', 1);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'broke');
  });

  it('lists buy and sell offers for UI', () => {
    assert.ok(listBuyOffers(DEFAULT_VENDOR.offers).length >= 3);
    const inv = createInventory({ apple: 2, butterfly_lotion: 0 });
    const sells = listSellOffers(inv, DEFAULT_VENDOR.offers);
    assert.ok(sells.some((s) => s.classTsid === 'apple'));
  });

  it('quotes any non-tool pack item from its own base cost', () => {
    ensureMakingItems();
    const inv = createInventory({ butterfly_lotion: 0, orange_juice: 3, knife_and_board: 1 });
    const sells = listSellOffers(inv, DEFAULT_VENDOR.offers);
    const juice = sells.find((row) => row.classTsid === 'orange_juice');
    assert.ok(juice, 'crafted goods outside vendor stock should still be sellable');
    assert.equal(juice.price, 26); // round(39 * 0.66)
    assert.equal(sells.some((row) => row.classTsid === 'knife_and_board'), false, 'tools stay out of drag-sell');

    const quote = createVendorSellQuote(inv, DEFAULT_VENDOR.offers, 'orange_juice', 99);
    assert.equal(quote.ok, true);
    assert.equal(quote.qty, 3, 'quote clamps to current stack');
    assert.equal(quote.total, 78);
    assert.equal(quote.vendorStocked, false);
  });

  it('rejects non-sellable drops and normalizes transaction quantities', () => {
    ensureMakingItems();
    const inv = createInventory({ butterfly_lotion: 0, grain: 3, knife_and_board: 1 });
    const bad = createVendorSellQuote(inv, DEFAULT_VENDOR.offers, 'knife_and_board', 1);
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, 'not_sellable');

    const pc = { currants: 0 };
    const sold = vendorSell(pc, inv, DEFAULT_VENDOR.offers, 'grain', 1.9);
    assert.equal(sold.ok, true);
    assert.equal(sold.qty, 1);
    assert.equal(countItem(inv, 'grain'), 2);
  });

  it('wires the pack drag payload, sell drop zone, receipt, and click fallback', () => {
    const html = readFileSync(join(__dirnameUi, '../public/play/index.html'), 'utf8');
    const css = resolveTokens(readFileSync(join(__dirnameUi, '../public/style.css'), 'utf8'));
    const game = readFileSync(join(__dirnameUi, '../public/game.js'), 'utf8');
    assert.match(html, /id="vendor-sell-drop"/);
    assert.match(html, /Drag an item from your pack/);
    assert.match(css, /\.vendor-sell-drop\.is-dragover/);
    assert.match(css, /\.vendor-sell-drop\.is-receipt/);
    assert.match(css, /\.pack-slots \.pack-slot\.is-dragging/);
    assert.match(game, /application\/x-groddle-item/);
    assert.match(game, /addEventListener\('drop'/);
    assert.match(game, /createVendorSellQuote/);
    assert.match(game, /vendorSellReceipt/);
    assert.match(game, /data-pack-sell/);
  });

  it('uses the Pixi v7 filter API for hover outlines without legacy namespace warnings', () => {
    const game = readFileSync(join(__dirnameUi, '../public/game.js'), 'utf8');
    assert.match(game, /const ColorMatrixFilter = PIXI\.ColorMatrixFilter/);
    assert.doesNotMatch(game, /PIXI\.filters/);
  });
});

describe('interactive street map', () => {
  it('builds graph with ≥2 labeled nodes and current marker', () => {
    const g = buildMapGraph('GLI2V0UN7RD1T2J', STREET_INDEX.streets);
    assert.ok(g.nodes.length >= 2);
    assert.ok(g.nodes.every((n) => n.label && n.tsid));
    const cur = g.nodes.find((n) => n.current);
    assert.ok(cur);
    assert.equal(cur.tsid, 'GLI2V0UN7RD1T2J');
    assert.ok(g.edges.length >= 1);
  });

  it('map click travel A→B returns destination identity', () => {
    const dests = listMapDestinations('GLI2V0UN7RD1T2J', STREET_INDEX.streets);
    const b = dests.find((d) => d.travelable);
    assert.ok(b);
    const plan = mapClickTravel('GLI2V0UN7RD1T2J', b.tsid, STREET_INDEX.streets);
    assert.equal(plan.ok, true);
    assert.equal(plan.toTsid, 'GLI3272LOTD1B1F');
    assert.notEqual(plan.fromTsid, plan.toTsid);
    assert.match(plan.label, /Groddle Forest Junction/i);
  });
});

describe('GSJS hub-56 geometry map', () => {
  it('hub JSON has ≥20 streets and Hechey Track + Junction', () => {
    assert.equal(HUB56.hubId, '56');
    assert.match(HUB56.hubName, /Groddle Forest/i);
    assert.ok(HUB56.streets.length >= 20);
    assert.equal(HUB56.mapW, 760);
    assert.equal(HUB56.mapH, 460);
    const hechey = HUB56.streets.find((s) => s.tsid === 'LLI2V0UN7RD1T2J');
    const junc = HUB56.streets.find((s) => s.tsid === 'LLI3272LOTD1B1F');
    assert.ok(hechey, 'Hechey Track segment');
    assert.match(hechey.name, /Hechey Track/i);
    assert.ok(junc, 'Forest Junction segment');
    assert.ok(typeof hechey.x1 === 'number' && typeof hechey.y2 === 'number');
  });

  it('findCurrentStreet matches L/G alias (GLI ↔ LLI)', () => {
    const cur = findCurrentStreet('GLI2V0UN7RD1T2J', HUB56.streets);
    assert.ok(cur);
    assert.equal(cur.tsid, 'LLI2V0UN7RD1T2J');
  });

  it('buildHubMapView marks current + travelable loaded streets', () => {
    const view = buildHubMapView(HUB56, 'GLI2V0UN7RD1T2J', STREET_INDEX.streets);
    assert.equal(view.hubName, 'Groddle Forest');
    assert.ok(view.streets.length >= 20);
    const hechey = view.streets.find((s) => s.tsid === 'LLI2V0UN7RD1T2J');
    const junc = view.streets.find((s) => s.tsid === 'LLI3272LOTD1B1F');
    assert.ok(hechey.current);
    assert.equal(hechey.loaded, true);
    assert.equal(hechey.travelable, false);
    assert.ok(junc.loaded);
    assert.ok(junc.travelable);
    assert.equal(junc.loadedTsid, 'GLI3272LOTD1B1F');
    // Only 2 loaded playable nodes
    assert.equal(view.nodes.length, 2);
    assert.ok(view.nodes.some((n) => n.current));
    // Hub exits present (GO buttons)
    assert.ok(view.hubs.length >= 3);
  });

  it('segment midpoints and SVG render include star + travelable path', () => {
    const mid = segmentMid({ x1: 0, y1: 0, x2: 100, y2: 50 });
    assert.equal(mid.x, 50);
    assert.equal(mid.y, 25);
    const view = buildHubMapView(HUB56, 'GLI2V0UN7RD1T2J', STREET_INDEX.streets);
    const svg = renderHubMapSvg(view);
    assert.match(svg, /viewBox="0 0 760 460"/);
    assert.match(svg, /map-you/);
    assert.match(svg, /map-street travelable/);
    assert.match(svg, /Hechey Track/);
    assert.match(svg, /Groddle Forest Junction/);
    assert.match(svg, /data-tsid="GLI3272LOTD1B1F"/);
  });

  it('map click from hub segment tsid (LLI) resolves to loaded GLI street', () => {
    const plan = mapClickTravel(
      'GLI2V0UN7RD1T2J',
      'LLI3272LOTD1B1F',
      STREET_INDEX.streets
    );
    assert.equal(plan.ok, true);
    assert.equal(plan.toTsid, 'GLI3272LOTD1B1F');
  });
});

describe('multi-hub map catalog', () => {
  it('index lists many hubs with street geometry', () => {
    assert.ok(Object.keys(MAP_INDEX.hubs).length >= 50);
    const listed = listHubsFromIndex(MAP_INDEX);
    assert.ok(listed.length >= 40, 'hubs with streets > 0');
    assert.ok(listed.some((h) => h.hubId === '56' && /Groddle Forest/i.test(h.hubName)));
    assert.ok(listed.some((h) => h.hubId === '93' && /Salatu/i.test(h.hubName)));
    assert.ok(listed.some((h) => h.hubId === '58' && /Meadow/i.test(h.hubName)));
  });

  it('Salatu hub has original street names and coords', () => {
    assert.equal(String(HUB_SALATU.hubId), '93');
    assert.match(HUB_SALATU.hubName, /Salatu/i);
    assert.ok(HUB_SALATU.streets.length >= 20);
    const khoul = HUB_SALATU.streets.find((s) => /Khoul/i.test(s.name));
    assert.ok(khoul, 'Khoul Bheens on Salatu map');
    assert.ok(typeof khoul.x1 === 'number');
  });

  it('resolveHubId uses street hubId', () => {
    assert.equal(resolveHubId({ hubId: 56 }), '56');
    assert.equal(resolveHubId({ hub_id: '93' }), '93');
    assert.equal(resolveHubId(null, '56'), '56');
  });

  it('renders Salatu SVG with many street labels', () => {
    const view = buildHubMapView(HUB_SALATU, 'GLI2V0UN7RD1T2J', STREET_INDEX.streets);
    const svg = renderHubMapSvg(view);
    assert.match(svg, /viewBox="0 0 760 460"/);
    assert.match(svg, /Salatu|Khoul|Lunu/i);
    // player not on Salatu — no current star required
    assert.equal(view.streets.filter((s) => s.loaded).length, 0);
  });
});
