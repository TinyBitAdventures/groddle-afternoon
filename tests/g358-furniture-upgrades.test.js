// G358: furniture upgrades (styles), the free ones in the picker, the paid ones
// for currants (lane FURNSELL: tests/g358-furniture-sell.test.js), and the
// three Bonus Furniture Upgrade cards.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FURNITURE_UPGRADES,
  FURNITURE_UPGRADE_COUNTS,
  FURNITURE_UPGRADES_LEFT_OUT,
  FURNITURE_UPGRADES_MISSING_ART,
} from '../public/js/furniture-upgrades-data.js?v=56706fb9';
import {
  applyBonusUpgrade,
  applyUpgrade,
  bonusUpgradeLine,
  cleanUpgradeId,
  listUpgrades,
  pieceLabel,
  rollBonusUpgrade,
  saveButtonText,
  upgradeVerb,
  UPGRADE_TEXT,
} from '../public/js/furniture-upgrades.js?v=c4ee77ed';
import {
  createHomeDecorState,
  furnitureSize,
  listPlaceable,
  moveFurniture,
  normalizeHomeDecorState,
  pickUpFurniture,
  placeFurniture,
  surfaceHeight,
} from '../public/js/home-decor.js?v=cbf17565';
import { FURNITURE_CATALOG } from '../public/js/homes-catalog.js?v=29713fa8';
import { IMAGINATION_UPGRADES, upgradeStatus, DEALT_SECRET_CARDS } from '../public/js/imagination.js?v=b4f0eaf6';
import { isOfferedInRemake, remakeStatus } from '../public/js/imagination-remake.js?v=ca0a48d5';
import { visitorHomeState } from '../public/js/features/homes-feature.js?v=055d557b';

const spike = join(import.meta.dirname, '..');
const pub = join(spike, 'public');
const GSJS = join(process.env.HOME || '', 'Documents/glitch-audit/glitch-GameServerJS');
const CHAIR = 'furniture_chair';

/** WebP canvas size (VP8X, VP8L or VP8 header). */
function webpSize(file) {
  const b = readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
}

describe('upgrade data (tools/furniture-upgrades/build.mjs)', () => {
  it('is current with GameServerJS and the rendered art', { skip: !existsSync(GSJS) && 'no GameServerJS checkout' }, () => {
    const out = execFileSync(process.execPath, ['tools/furniture-upgrades/build.mjs', '--check'], { cwd: spike, encoding: 'utf8' });
    assert.match(out, /^ok: 565 upgrades in 28 classes, 565 with art/);
  });

  it('keeps every catalog upgrade of the 28 placed classes, 113 of them free', () => {
    assert.deepEqual(
      { ...FURNITURE_UPGRADE_COUNTS },
      { classes: 28, upgrades: 565, free: 113, paid: 452, hidden: 21, withArt: 565 },
    );
    assert.deepEqual(FURNITURE_UPGRADES_MISSING_ART, []);
    assert.deepEqual(Object.keys(FURNITURE_UPGRADES_LEFT_OUT).sort(), [
      'furniture_chassis', 'furniture_door', 'furniture_largecabinet', 'furniture_shortcabinet',
      'furniture_smallcabinet', 'furniture_tower_chassis', 'furniture_wallcabinet',
    ]);
    for (const cls of Object.keys(FURNITURE_UPGRADES)) assert.ok(FURNITURE_CATALOG[cls], cls);
    // catalog_furniture.js: Brass Metal Chair (1) is free, Crab Chair (112) 25 credits, Cactus Chair (5) hidden.
    const chair = FURNITURE_UPGRADES[CHAIR];
    assert.equal(chair.canRevert, true);
    assert.deepEqual([chair.upgrades['1'].name, chair.upgrades['1'].credits], ['Brass Metal Chair', 0]);
    assert.deepEqual([chair.upgrades['112'].name, chair.upgrades['112'].credits, chair.upgrades['112'].subscriberOnly], ['Crab Chair', 25, true]);
    assert.equal(chair.upgrades['5'].visible, false);
  });

  it('ships each upgrade as a 3x WebP three times its recorded size (G448)', () => {
    for (const [cls, def] of Object.entries(FURNITURE_UPGRADES)) {
      for (const [id, row] of Object.entries(def.upgrades)) {
        const file = join(pub, row.art.path);
        assert.ok(existsSync(file), `${cls}/${id}`);
        assert.match(row.art.path, new RegExp(`^assets/sprites/furniture/upgrades/${cls}/${id}@3x\\.webp$`));
        if (Number(id) % 7 === 0) assert.deepEqual(webpSize(file), { w: row.art.w * 3, h: row.art.h * 3 }, `${cls}/${id}`);
      }
    }
  });

  it('the picker gives a style\'s 3x file a density srcset: tiles at its 1x size, the preview at 2x as before', async () => {
    const { artImgAttrs } = await import('../public/js/furniture-upgrade-picker.js?v=42523674');
    const path = FURNITURE_UPGRADES.furniture_chair.upgrades['1'].art.path;
    assert.deepEqual(artImgAttrs(path), { src: path, srcset: `${path} 3x` });
    assert.deepEqual(artImgAttrs(path, 2), { src: path, srcset: `${path} 1.5x` });
    assert.deepEqual(artImgAttrs('assets/sprites/furniture/furniture_chair.png'), { src: 'assets/sprites/furniture/furniture_chair.png' });
    assert.deepEqual(artImgAttrs(''), { src: '' });
  });
});

describe('the style picker (getUpgrades, HandOfDecorator, FurnUpgradeDialog)', () => {
  it('lists the base piece and visible styles, owned first, then by credits and id, the current one on top', () => {
    const piece = { id: 1, classTsid: CHAIR };
    const list = listUpgrades(piece, 'Chair');
    assert.equal(list[0].id, '0');
    assert.equal(list[0].current, true);
    assert.equal(list[0].label, 'Chair');
    assert.ok(!list.some((row) => row.id === '5' || row.id === '110'), 'hidden rows are dropped');
    const rest = list.slice(1);
    for (let i = 1; i < rest.length; i++) {
      const a = rest[i - 1];
      const b = rest[i];
      assert.ok(a.credits < b.credits || (a.credits === b.credits && Number(a.id) < Number(b.id)), `${a.id} before ${b.id}`);
    }
    assert.deepEqual(list.filter((row) => !row.paid).map((row) => row.id), ['0', '1', '14', '15', '45']);
    assert.equal(list.find((row) => row.id === '1').text, UPGRADE_TEXT.freeForEveryone);
    assert.equal(list.find((row) => row.id === '112').text, '25,000 currants');
    assert.equal(list.find((row) => row.id === '112').paid, true);
  });

  it('words the save button like FurnUpgradeDialog; a paid style needs the currants', () => {
    const piece = { id: 1, classTsid: CHAIR };
    const list = listUpgrades(piece, 'Chair');
    assert.deepEqual(saveButtonText(piece, list[0]), { text: 'Choose a style from the right', disabled: true });
    assert.deepEqual(saveButtonText(piece, list.find((r) => r.id === '1')), { text: 'Change style for FREE!', disabled: false });
    const paid = saveButtonText(piece, list.find((r) => r.id === '112'));
    assert.equal(paid.text, 'Change style for 25,000 currants');
    assert.equal(paid.disabled, true);
    assert.equal(paid.tip, UPGRADE_TEXT.needCurrants);
    assert.deepEqual(applyUpgrade(piece, '112').reason, 'currants');
    assert.equal(piece.upgradeId, undefined);
  });

  it('applies a free style, records upgrade_history, and can go back to the base piece', () => {
    const piece = { id: 1, classTsid: CHAIR };
    assert.equal(upgradeVerb(piece).label, 'Upgrade');
    const r = applyUpgrade(piece, '1', { now: 1_000_000, baseLabel: 'Chair' });
    assert.deepEqual(r, { ok: true, id: '1', name: 'Brass Metal Chair', cost: 0, counter: 'upgraded:furniture_chair' });
    assert.equal(piece.upgradeId, '1');
    assert.deepEqual(piece.upgradeHistory, [{ from: '0', to: '1', when: 1000 }]);
    assert.equal(pieceLabel(piece, 'Chair'), 'Brass Metal Chair');
    assert.equal(upgradeVerb(piece).label, 'Change style');
    assert.equal(applyUpgrade(piece, '1').msg, 'Already upgraded');
    assert.equal(applyUpgrade(piece, '999').msg, 'Invalid upgrade');
    assert.equal(applyUpgrade(piece, '0', { baseLabel: 'Chair' }).ok, true);
    assert.equal(piece.upgradeId, '');
    assert.equal(listUpgrades(piece, 'Chair').find((row) => row.id === '1').owned, true);
  });

  it('marks an owned paid style "You own this" and lets the piece change back to it', () => {
    const piece = { id: 1, classTsid: CHAIR };
    assert.equal(applyBonusUpgrade(piece, '112', { now: 5000 }), true);
    assert.equal(applyUpgrade(piece, '1').ok, true);
    const crab = listUpgrades(piece, 'Chair').find((row) => row.id === '112');
    assert.deepEqual([crab.owned, crab.paid, crab.currants, crab.text], [true, false, 0, 'You own this']);
    assert.deepEqual(saveButtonText(piece, crab), { text: 'Change style', disabled: false });
    assert.equal(applyUpgrade(piece, '112').ok, true);
  });
});

describe('upgraded pieces in the house (home-decor.js)', () => {
  it('keeps the upgrade when placed, moved, picked up and placed again; the ledger still sees the class', () => {
    const state = createHomeDecorState({ storage: { furniture_chair: 2 } });
    const placed = placeFurniture(state, {}, CHAIR, { x: 400 }).item;
    applyUpgrade(placed, '1');
    assert.deepEqual(furnitureSize(CHAIR, '1'), { w: FURNITURE_UPGRADES[CHAIR].upgrades['1'].art.w, h: FURNITURE_UPGRADES[CHAIR].upgrades['1'].art.h });
    moveFurniture(state, placed.id, { x: 500 });
    const lifted = pickUpFurniture(state, placed.id);
    assert.deepEqual(lifted.pieces, [{ classTsid: CHAIR, upgradeId: '1' }]);
    assert.equal(state.storage.furniture_chair, 2, 'storage counts per class');
    assert.equal(state.styles.furniture_chair.length, 1);
    const rows = listPlaceable(state, {}).filter((row) => row.classTsid === CHAIR);
    assert.deepEqual(rows.map((row) => [row.label, row.stored, row.style ?? null]), [['Brass Metal Chair', 1, 0], ['Chair', 1, null]]);
    // A plain pick takes a plain piece first; the style row takes the upgraded one.
    const plain = placeFurniture(state, {}, CHAIR, { x: 300 }).item;
    assert.equal(plain.upgradeId, undefined);
    const again = placeFurniture(state, {}, CHAIR, { x: 600 }, { style: 0 }).item;
    assert.equal(again.upgradeId, '1');
    assert.deepEqual(again.upgradeHistory.map((h) => h.to), ['1']);
    assert.equal(state.storage.furniture_chair, undefined);
    // Saved and restored.
    const restored = normalizeHomeDecorState(JSON.parse(JSON.stringify(state)));
    assert.equal(restored.placed.find((row) => row.id === again.id).upgradeId, '1');
  });

  it('shows a visitor the owner\'s upgraded pieces (visitorHomeState, G328)', () => {
    const v = visitorHomeState({ homes: { decor: { storage: {}, placed: [{ id: 3, classTsid: CHAIR, x: 400, upgradeId: '112', upgradeHistory: [{ from: '0', to: '112', when: 1 }] }] } } });
    assert.equal(v.decor.placed[0].upgradeId, '112');
    assert.equal(pieceLabel(v.decor.placed[0], 'Chair'), 'Crab Chair');
  });

  it('drops styles that outnumber the stored pieces and ids the class does not have', () => {
    const state = normalizeHomeDecorState({
      storage: { furniture_chair: 1 },
      styles: { furniture_chair: [{ upgradeId: '1' }, { upgradeId: '14' }], furniture_table: [{ upgradeId: '59' }] },
      placed: [{ id: 1, classTsid: CHAIR, x: 400, upgradeId: '777' }],
    });
    assert.deepEqual(state.styles, { furniture_chair: [{ upgradeId: '1' }] });
    assert.equal(state.placed[0].upgradeId, undefined);
    assert.equal(cleanUpgradeId(CHAIR, '0'), '');
    // Something else took the stored piece (a sale, a trade): the style goes with it.
    state.storage.furniture_chair = 0;
    assert.equal(listPlaceable(state, {}).filter((row) => row.classTsid === CHAIR).length, 0);
  });

  it('rests tabletop decor on an upgraded table at its catalog plat', () => {
    assert.equal(surfaceHeight('furniture_table'), 80);
    assert.equal(surfaceHeight('furniture_table', '59'), FURNITURE_UPGRADES.furniture_table.upgrades['59'].platY);
    // The Fireplace's base frame is drawn at half size; its upgrades are 1:1.
    assert.deepEqual(furnitureSize('furniture_fireplace', Object.keys(FURNITURE_UPGRADES.furniture_fireplace.upgrades)[0]).w < 400, true);
  });
});

describe('Bonus Furniture Upgrade I-III (construction_tool.js 330-380)', () => {
  const recipe = (skill, cls = CHAIR) => ({ tool: 'construction_tool', skill, outputs: [{ classTsid: cls, qty: 1 }] });
  const cards = ['furnituremaking_bonus_upgrade_1', 'furnituremaking_bonus_upgrade_2', 'furnituremaking_bonus_upgrade_3'];

  it('rolls 5%, needs a card, and the card for the recipe skill', () => {
    const hit = () => 0;
    assert.equal(rollBonusUpgrade({ recipe: recipe('furnituremaking_1'), owned: cards, rand: () => 0.05 }), null, 'is_chance(0.05)');
    assert.equal(rollBonusUpgrade({ recipe: recipe('furnituremaking_1'), owned: [], rand: hit }), null);
    assert.ok(rollBonusUpgrade({ recipe: recipe('furnituremaking_1'), owned: cards.slice(0, 1), rand: hit }));
    assert.equal(rollBonusUpgrade({ recipe: recipe('furnituremaking_2', 'furniture_sofa'), owned: cards.slice(0, 1), rand: hit }), null);
    assert.ok(rollBonusUpgrade({ recipe: recipe('furnituremaking_2', 'furniture_sofa'), owned: cards.slice(0, 2), rand: hit }));
    assert.equal(rollBonusUpgrade({ recipe: recipe('engineering_1', 'furniture_shelf'), owned: cards.slice(0, 2), rand: hit }), null);
    assert.ok(rollBonusUpgrade({ recipe: recipe('engineering_1', 'furniture_shelf'), owned: cards, rand: hit }));
  });

  it('picks a style worth more than 0 and at most 25 credits, hidden ones included', () => {
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
      let n = 0;
      const r = rollBonusUpgrade({ recipe: recipe('furnituremaking_1'), owned: cards, rand: () => (n++ === 0 ? 0 : i / 40) });
      const row = FURNITURE_UPGRADES[CHAIR].upgrades[r.id];
      assert.ok(row.credits > 0 && row.credits <= 25, r.id);
      seen.add(r.id);
    }
    assert.ok(seen.has('5'), 'the hidden Cactus Chair is in getUpgrades');
    assert.ok(!seen.has('480') || FURNITURE_UPGRADES[CHAIR].upgrades['480'].credits <= 25);
    assert.ok(!seen.has('662'), '40 credits is too dear');
    assert.equal(bonusUpgradeLine('Crab Chair'), 'The Giants must have favored you. The item you just crafted was magically upgraded to a Crab Chair.');
  });

  it('deals the three secret cards with their source cost and conditions', () => {
    assert.deepEqual([...DEALT_SECRET_CARDS].sort(), cards);
    for (const id of cards) {
      assert.equal(IMAGINATION_UPGRADES[id].is_secret, true);
      assert.equal(remakeStatus(id).status, 'live');
      assert.equal(isOfferedInRemake(id), true);
    }
    assert.deepEqual(cards.map((id) => IMAGINATION_UPGRADES[id].cost), [5000, 7500, 10000]);
    assert.match(IMAGINATION_UPGRADES[cards[0]].desc, /^5% chance of an instant upgrade of a base furniture item to a FM1 item worth 25 credits or less$/);
    assert.equal(upgradeStatus(cards[0], { learned: [] }).can_learn, false);
    assert.equal(upgradeStatus(cards[0], { learned: ['furnituremaking_1'] }).can_learn, true);
    assert.equal(upgradeStatus(cards[1], { learned: ['furnituremaking_2'] }).can_learn, false);
    assert.equal(upgradeStatus(cards[1], { learned: ['furnituremaking_2'], owned: [cards[0]] }).can_learn, true);
    assert.equal(upgradeStatus(cards[2], { learned: ['furnituremaking_2', 'engineering_1'], owned: [cards[0], cards[1]] }).can_learn, true);
    assert.equal(upgradeStatus(cards[2], { learned: ['furnituremaking_2', 'engineering_1'], owned: cards }).can_learn, false, 'max_uses 1');
    // Other secret cards stay out.
    assert.equal(upgradeStatus('jump_wall', { owned: ['jump_triple_2'] }).can_learn, false);
  });
});

describe('wiring and copy', () => {
  it('draws, picks and rolls from the homes feature', () => {
    const src = readFileSync(join(pub, 'js/features/homes-feature.js'), 'utf8');
    assert.match(src, /from '\.\.\/furniture-upgrades\.js\?v=[0-9a-f]{8}'/);
    assert.match(src, /from '\.\.\/furniture-upgrade-picker\.js\?v=[0-9a-f]{8}'/);
    assert.match(src, /pieceArt\(item\.classTsid, upgradeId\)/);
    assert.match(src, /counter\.startsWith\('making_recipe:'\)\) bonusFurnitureUpgrade/);
    assert.match(src, /towerDecor\.map\(\(\{ storage, styles, \.\.\.rest \}\)/);
  });

  it('uses the source words and no em-dashes in player copy', () => {
    assert.equal(UPGRADE_TEXT.title, 'Choose a new style');
    assert.equal(UPGRADE_TEXT.changeFree, 'Change style for FREE!');
    for (const text of [...Object.values(UPGRADE_TEXT), ...['1', '2', '3'].map((n) => remakeStatus(`furnituremaking_bonus_upgrade_${n}`).note)]) {
      assert.ok(!/—/.test(text), text);
    }
    assert.ok(!/—/.test(readFileSync(join(pub, 'js/furniture-upgrade-picker.js'), 'utf8')));
  });
});
