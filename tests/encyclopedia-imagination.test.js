/**
 * The encyclopedia's Imagination upgrades section (tools/encyclopedia/imagination.mjs,
 * Austin 2026-11-05): a page for every card the remake has, with Tiny Speck's
 * card text, its cost, what it needs and opens, the card's own art, and what it
 * does in the remake (the Imagination panel's note).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { IMAGINATION_UPGRADES } from '../public/js/imagination.js?v=6adb7b9a';
import { remakeStatus } from '../public/js/imagination-remake.js?v=c37ad887';
import { cardName } from '../tools/encyclopedia/imagination.mjs';
import { esc } from '../tools/encyclopedia/parts.mjs';

const pub = join(import.meta.dirname, '..', 'public');
const dir = join(pub, 'encyclopedia', 'imagination');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const page = (id) => read(`encyclopedia/imagination/${id}/index.html`);
const search = JSON.parse(read('encyclopedia/search.json'));

describe('encyclopedia: Imagination upgrades', () => {
  it('has a page for every card, listed on the section page and in the search', () => {
    const ids = Object.keys(IMAGINATION_UPGRADES).sort();
    const have = readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name).sort();
    assert.deepEqual(have, ids);
    const index = read('encyclopedia/imagination/index.html');
    const rows = new Set(search.entries.filter((x) => x.s === 'imagination').map((x) => x.id));
    for (const id of ids) {
      assert.ok(index.includes(`href="../../encyclopedia/imagination/${id}/"`), id);
      assert.ok(rows.has(id), id);
    }
    assert.ok(search.sections.some((s) => s.key === 'imagination' && s.label === 'Imagination upgrades'));
    assert.match(read('encyclopedia/index.html'), /<a class="ency-card" href="imagination\/">[\s\S]*?Imagination upgrades <span class="count">275<\/span>/);
  });

  it('prints the card text, cost and the remake note of each card', () => {
    for (const [id, u] of Object.entries(IMAGINATION_UPGRADES)) {
      const html = page(id);
      assert.ok(html.includes(`<h1>${esc(cardName(u))}</h1>`), id);
      assert.ok(html.includes(esc(String(u.desc).replace(/\{amount\}/g, '…'))), `${id}: card text`);
      assert.ok(html.includes(esc(remakeStatus(id).note)), `${id}: remake note`);
      if (!u.options && !id.startsWith('keepable_')) assert.ok(html.includes(`<dt>Cost</dt><dd>${u.cost.toLocaleString('en-US')} iMG</dd>`), `${id}: cost`);
    }
  });

  it('shows the jump cards: High Jumper I and II restore the full jump, and the triple jump chain', () => {
    const hj1 = page('jump_1');
    assert.match(hj1, /<dt>Cost<\/dt><dd>3 iMG<\/dd>/);
    assert.match(hj1, /Offered in the tutorial\./);
    assert.match(hj1, /href="\.\.\/\.\.\/\.\.\/encyclopedia\/imagination\/mappery\/"/);
    assert.match(hj1, /about 116 px/);
    const hj2 = page('jump_2');
    assert.match(hj2, /The full jump, about 142 px high\./);
    assert.match(hj2, /href="\.\.\/\.\.\/\.\.\/encyclopedia\/imagination\/walk_speed_1\/"[\s\S]*?buy it first/);
    assert.match(page('jump_3'), /href="\.\.\/\.\.\/\.\.\/encyclopedia\/imagination\/jump_triple_3\/"[\s\S]*?buy it first/);
    const baby = page('jump_triple_1');
    assert.match(baby, /<h1>Baby Triple Jump<\/h1>/);
    assert.match(baby, /href="\.\.\/\.\.\/\.\.\/encyclopedia\/imagination\/mappery\/"[\s\S]*?buy it first/);
    assert.match(baby, /href="\.\.\/\.\.\/\.\.\/encyclopedia\/imagination\/jump_triple_2\/"/);
    assert.match(page('jump_triple_2'), /Level 10 or more\./);
  });

  it('marks what the remake has: in the remake, online only, never dealt', () => {
    assert.match(page('jump_triple_1'), /<span class="pill st-source">In the remake<\/span>/);
    assert.match(page('trade_channel'), /<span class="pill st-multiplayer">In multiplayer<\/span>[\s\S]*The shop deals it in multiplayer\./);
    assert.match(page('jump_wall'), /<span class="pill st-unbuilt_original">Never finished<\/span>[\s\S]*It was a secret card: the original game never dealt it\./);
    assert.match(page('furnituremaking_bonus_upgrade_1'), /The shop deals it\./);
  });

  it('draws the card from its own art layers and prices the cards that come in sizes', () => {
    const html = page('energy_tank');
    assert.match(html, /<h1>Energy Tank<\/h1>/);
    for (const layer of ['bg_red', 'pattern_upgrade', 'suit_upgrade', 'art_quoinenergy', 'icon_upgrade']) {
      assert.match(html, new RegExp(`src="\\.\\./\\.\\./\\.\\./assets/imagination/cards/${layer}\\.svg(?:\\?v=[0-9a-f]+)?"`), layer);
      assert.ok(existsSync(join(pub, 'assets/imagination/cards', `${layer}.svg`)), layer);
    }
    assert.match(html, /<link rel="stylesheet" href="\.\.\/\.\.\/\.\.\/encyclopedia\/sections\.css[^"]*" \/>/);
    assert.match(html, /<dt>100 to 129<\/dt><dd>20 iMG a point of energy; dealt as \+10 and 20<\/dd>/);
    assert.match(page('keepable_reshuffle'), /The price grows with your level/);
  });

  it('links a keepable card to the item it puts in your pack', () => {
    assert.match(page('ticket_to_paradise_cloud_rings'), /href="\.\.\/\.\.\/\.\.\/encyclopedia\/items\/paradise_ticket_cloud_rings\/"[\s\S]*?goes into your pack/);
  });
});
