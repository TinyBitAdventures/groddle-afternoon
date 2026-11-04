/**
 * No developer references in what a player reads (Austin 2026-11-03: a Bigger
 * Bag's menu ended "Bigger Bag, stocked by the Hardware Vendor. (GSJS
 * catalog_stores.js)"). The deny list (tests/player-copy-dev-refs.js DENY):
 * GSJS, the source repos, catalog_ files, file names (.js, .as, .swf, .xml),
 * register rows (G###), QA, "(source", tsids shown as text, TODO.
 *
 * Code comments and data provenance (`source`, `why`, `gsjs` fields) keep
 * their references; the checks look only where a player-facing string goes:
 *   - every string the game's modules put in a label, description, tooltip,
 *     line, toast or a DOM text property (an AST scan of public/js and game.js);
 *   - every item in the pack catalog once the game has registered its items
 *     (label and description, which the item's menu ends with);
 *   - the store stock's descriptions (build-stores.mjs) and the notes the
 *     Imagination and Skills panels show under "In this remake";
 *   - the hotkey sheet, and every copy table (FOO_TEXT, FOO_COPY, T) in the modules;
 *   - the text of the game's pages and the encyclopedia (no "Register row",
 *     no "From items/x.js", no item ids).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DENY, denied, gameModules, pageText, pagesUnder, pub, rel, scanModule, stripTags } from './player-copy-dev-refs.js';
import { ITEM_CATALOG } from '../public/js/inventory.js?v=597a17a2';
import { ensureVendorItems, VENDOR_PROFILES } from '../public/js/vendor.js?v=4e3cc8fb';
import { ensureMakingItems } from '../public/js/making.js?v=0100c686';
import { ensureMiningItems } from '../public/js/mining.js?v=76295780';
import { ensureGardenItems } from '../public/js/garden.js?v=b38ab310';
import { ensureMusicblockItems } from '../public/js/musicblocks.js?v=c9e56377';
import { ensureSpinningWheelItems } from '../public/js/spinning-wheel.js?v=d0958fab';
import { ensureCubimalItems } from '../public/js/cubimals.js?v=6cf43927';
import { ensureHellItems } from '../public/js/hell.js?v=45060736';
import { ensureFoxItems } from '../public/js/foxes.js?v=f03578b1';
import { STORE_CATALOG } from '../public/js/store-catalog.js?v=74b56af3';
import { IMAGINATION_UPGRADES } from '../public/js/imagination-data.js?v=4a85e7fe';
import { remakeStatus } from '../public/js/imagination-remake.js?v=5ca4a35f';
import { HOTKEYS_FOOTER, HOTKEYS_TITLE, hotkeySections } from '../public/js/client-hotkeys.js?v=5a0e7cc7';
import { SKILL_REMAKE_NOTES } from '../public/js/skill-tree.js?v=53795620';

/**
 * Strings the AST scan finds that no player reads, each with why. Keep this
 * short: fix the copy instead when a player can see it.
 */
const NOT_SHOWN = [
  // &questofferaward=1 only (a QA route's award screen).
  ['js/features/quest-offers-feature.js', "subtitle: 'QA'"],
  // UNWIRED_FEATS' reasons are provenance for the restoration report; the Feats panel never shows them.
  ['js/solo-feats.js', 'reason: \'Counted plays of the Conch'],
  ['js/solo-feats.js', 'reason: "Celebrate / Mourn'],
  ['js/solo-feats.js', 'reason: \'Its increment code'],
  ['js/solo-feats.js', 'reason: "The one surviving increment'],
];

/** A class id (snake_case) in a description is the id, not words. */
const CLASS_ID = /\b[a-z]+_[a-z0-9_]+\b/;

const fail = (rows) => assert.deepEqual(rows, [], `${rows.length} player-facing strings cite the code:\n${rows.join('\n')}`);

describe('no developer references in player-facing copy', () => {
  it('the deny list catches the reported line and lets plain words through', () => {
    assert.ok(denied('Bigger Bag, stocked by the Hardware Vendor. (GSJS catalog_stores.js)'));
    for (const bad of ['(GSJS recipe 138)', 'catalog_stores', 'npc_piggy.js:1769', 'TSFrontController.as:3165', 'Register row G125', '(G332)', 'QA', '(source: ten days)', 'GIF5UU8FO3029OK', 'GameServerJS never checks']) {
      assert.ok(denied(bad), bad);
    }
    for (const ok of ['A big, big bag for putting things in.', 'G010.J', 'Greeterbot Sentry G-42', 'a dependable source of gardening tools', 'Not in this remake yet.']) {
      assert.equal(denied(ok), null, ok);
    }
    assert.ok(DENY.length >= 9);
  });

  it('no module puts one in a label, description, tooltip, line or toast', () => {
    const rows = [];
    for (const file of gameModules()) {
      const src = readFileSync(file, 'utf8');
      const skip = NOT_SHOWN.filter(([f]) => f === rel(file)).map(([, piece]) => piece);
      for (const hit of scanModule(file)) {
        const line = Number(/:(\d+) /.exec(hit)?.[1]);
        const text = src.split('\n')[line - 1] || '';
        if (skip.some((piece) => text.includes(piece))) continue;
        rows.push(hit);
      }
    }
    fail(rows);
  });

  it('every NOT_SHOWN exemption is still in its file', () => {
    for (const [file, piece] of NOT_SHOWN) assert.ok(readFileSync(join(pub, file), 'utf8').includes(piece), `${file}: ${piece}`);
  });

  it('no item in the pack catalog has one in its name or description (the end of its menu)', () => {
    for (const ensure of [ensureMusicblockItems, ensureGardenItems, ensureMiningItems, ensureMakingItems, ensureSpinningWheelItems, ensureCubimalItems, ensureHellItems, ensureFoxItems, ensureVendorItems]) ensure();
    const rows = [];
    for (const [id, it] of Object.entries(ITEM_CATALOG)) {
      for (const key of ['label', 'desc']) {
        // The menu prints a description as plain words (verb-menu.js plainWords): its links' markup is not read.
        const text = stripTags(it[key]);
        const d = denied(text) || (key === 'desc' && CLASS_ID.test(text) ? { rule: 'class id', match: text.match(CLASS_ID)[0] } : null);
        if (d) rows.push(`${id}.${key} ${d.rule} "${d.match}": ${it[key]}`);
      }
    }
    fail(rows);
    assert.ok(Object.keys(ITEM_CATALOG).length > 300, 'the catalog registered its items');
  });

  it('a stocked item with no menu of its own reads its own description (the Bigger Bag)', () => {
    const offer = STORE_CATALOG.flatMap((s) => s.offers).find((o) => o.classTsid === 'bag_bigger');
    assert.equal(offer.desc, 'A big, big bag for putting things in. Bigger than 15 slots, but not as big as 17.');
    assert.equal(ITEM_CATALOG.bag_bigger.desc, offer.desc);
    const rows = [];
    for (const store of STORE_CATALOG) {
      for (const o of store.offers) {
        const d = denied(o.desc) || denied(o.label) || (/[<>]/.test(o.desc || '') ? { rule: 'markup', match: '<' } : null);
        if (d) rows.push(`${store.label} ${o.classTsid} ${d.rule} "${d.match}": ${o.desc}`);
      }
    }
    fail(rows);
    for (const v of Object.values(VENDOR_PROFILES)) assert.equal(denied(v.desc), null, v.label);
  });

  it('the Imagination and Skills panels\' "In this remake" notes cite no code', () => {
    const rows = [];
    for (const id of Object.keys(IMAGINATION_UPGRADES)) {
      const { note } = remakeStatus(id);
      const d = denied(note) || (CLASS_ID.test(note) ? { rule: 'class id', match: note.match(CLASS_ID)[0] } : null);
      if (d) rows.push(`imagination ${id} ${d.rule} "${d.match}": ${note}`);
    }
    for (const [family, def] of Object.entries(SKILL_REMAKE_NOTES)) {
      for (const [where, note] of [[family, def.note], ...Object.entries(def.ranks || {}).map(([rank, r]) => [rank, r.note])]) {
        const d = denied(note);
        if (d) rows.push(`skill ${where} ${d.rule} "${d.match}": ${note}`);
      }
    }
    fail(rows);
  });

  it('the hotkey sheet (hold ?) cites no code', () => {
    const words = [HOTKEYS_TITLE, HOTKEYS_FOOTER, ...JSON.stringify(hotkeySections({ keyring: true, hub: true, reports: true })).match(/"(?:[^"\\]|\\.)*"/g).map((q) => JSON.parse(q))];
    fail(words.map((w) => [w, denied(w)]).filter(([, d]) => d).map(([w, d]) => `${d.rule} "${d.match}": ${w}`));
    assert.ok(words.length > 30);
  });

  it('the game\'s pages and the encyclopedia show none (no register rows, source files or item ids)', () => {
    const rows = [];
    for (const file of [...pagesUnder('play'), ...pagesUnder('encyclopedia'), join(pub, 'index.html')]) {
      const html = readFileSync(file, 'utf8');
      for (const line of pageText(html).split('\n')) {
        const d = denied(line);
        if (d) rows.push(`${rel(file)} ${d.rule} "${d.match}": ${line.trim().slice(0, 120)}`);
      }
      if (/Register row|<dt>(?:Item id|Id)<\/dt>/.test(html)) rows.push(`${rel(file)}: register row or id row`);
    }
    fail(rows);
  });

  it('the puzzle streets\' and quests\' words in the content data cite no code', () => {
    const rows = [];
    const puzzles = JSON.parse(readFileSync(join(pub, 'assets/content/puzzle-triggers.json'), 'utf8'));
    const walk = (v, key, path) => {
      if (typeof v === 'string') {
        if (['name', 'blurb', 'label', 'text', 'title'].includes(key)) {
          const d = denied(stripTags(v));
          if (d) rows.push(`${path} ${d.rule} "${d.match}": ${v.slice(0, 100)}`);
        }
      } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, key, `${path}[${i}]`));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k, `${path}.${k}`);
    };
    walk(puzzles, '', 'puzzle-triggers');
    const quests = JSON.parse(readFileSync(join(pub, 'assets/content/quests.json'), 'utf8'));
    for (const q of Object.values(quests.quests || quests)) {
      if (!q || typeof q !== 'object') continue;
      for (const key of ['title', 'desc', 'offer', 'completion']) {
        const d = typeof q[key] === 'string' ? denied(stripTags(q[key])) : null;
        if (d) rows.push(`quest ${q.classTsid || q.id} ${key} ${d.rule} "${d.match}"`);
      }
    }
    fail(rows);
  });
});
