/**
 * Item Catalog follow-ups (register G174, lane ICONS 2026-10-27): the quoin
 * icons, blank icons only where no art survives, quest countdown buffs listed
 * as quest timers, and a named route for every item in the remake.
 * Run: node --test tests/catalog-followups.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GSJS, INVENTORY_DB, ROCK_STAND_INS, ROCK_STAND_IN_ICON, esc, howOf, readQuestTimers } from '../tools/catalog/build.mjs';

const spike = join(import.meta.dirname, '..');
const pub = join(spike, 'public');
const items = join(pub, 'items');
const data = JSON.parse(readFileSync(join(items, 'data.json'), 'utf8'));
const page = (id) => readFileSync(join(items, id, 'index.html'), 'utf8');
const skipWithoutInventory = existsSync(INVENTORY_DB) ? false : `needs the coverage inventory at ${INVENTORY_DB}`;

function pngSize(file) {
  const b = readFileSync(file);
  assert.equal(b.toString('ascii', 12, 16), 'IHDR', file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], type: b[25] };
}

describe('G174 catalog follow-ups', () => {
  it('ships the quoin and moving quoin icons (1x, from the OGA quoin sheet and moving_quoin.swf)', () => {
    const want = { quoin: { w: 26, h: 30 }, moving_quoin: { w: 20, h: 30 } };
    for (const [id, size] of Object.entries(want)) {
      const s = pngSize(join(pub, 'assets/sprites/icons', `${id}.png`));
      assert.deepEqual({ w: s.w, h: s.h }, size, id);
      assert.deepEqual([s.depth, s.type], [8, 6], `${id}: 8-bit RGBA`);
      assert.equal(data.items.find((i) => i.id === id).icon, 1, id);
    }
  });

  it('gives the lost 2012-12 artifacts the original’s Large Petrified Rock, as a byte copy of the CC0 icon', () => {
    const ids = Object.keys(ROCK_STAND_INS);
    assert.equal(ids.length, 38);
    const dir = join(pub, 'assets/sprites/icons');
    const one = readFileSync(join(dir, `${ROCK_STAND_IN_ICON}.png`));
    const three = readFileSync(join(dir, `${ROCK_STAND_IN_ICON}@3x.png`));
    for (const [id, capture] of Object.entries(ROCK_STAND_INS)) {
      assert.ok(readFileSync(join(dir, `${id}.png`)).equals(one), id);
      assert.ok(readFileSync(join(dir, `${id}@3x.png`)).equals(three), id);
      // The capture's <ts> is the version stamp of the artifact's own SWF in GSJS.
      const src = readFileSync(join(GSJS, 'items', `${id}.js`), 'utf8');
      assert.match(src, new RegExp(`items\\\\?/2012-12\\\\?/${id}-${capture.split('_')[1]}\\.swf`), id);
      assert.equal(data.items.find((i) => i.id === id).icon, 3, id);
    }
  });

  it('leaves an icon blank only where no art survives (missing.swf, two unarchived artifacts, bag_sdb)', () => {
    const blank = data.items.filter((i) => !i.icon).map((i) => i.id);
    assert.ok(blank.length <= 14, `${blank.length} blank icons`);
    for (const id of blank) {
      const src = readFileSync(join(GSJS, 'items', `${id}.js`), 'utf8');
      const url = /asset_swf_v\s*:\s*"([^"]+)"/.exec(src)?.[1].replace(/\\\//g, '/') || '';
      assert.match(url, /items\/missing\.swf$|items\/2012-12\/artifact_|items\/2012-03\/bag_sdb-/, `${id}: ${url}`);
    }
  });

  it('reads the buffs that are a quest countdown from catalog_buffs.js', () => {
    const timers = readQuestTimers();
    assert.equal(timers.size, 14, 'every catalog_buffs.js entry whose on_remove fails a quest (13 with an item_class)');
    assert.deepEqual(timers.get('get_a_rasher'), { quest: 'animalkinship_nibble_meat', line: 887 });
    assert.equal(timers.get('tickle_me_emo').quest, 'zero_mood');
    assert.ok(!timers.has('high_jumper'), 'an ordinary buff');
  });

  it('lists quest countdowns as quest timers, not as the item’s buffs', () => {
    const pick = page('pick');
    assert.ok(!pick.includes('<h3>Buffs</h3>'), 'pick has only quest timers');
    assert.match(pick, /<h3>Quest timers<\/h3>[\s\S]*Giv'r till you Shiver<\/strong>: Mine 15 times in just 5 minutes\. The countdown for the quest “Giv'r 'til you Shiver”/);
    const spinach = page('spinach');
    assert.match(spinach, /<h3>Buffs<\/h3>[\s\S]*High Jumper/);
    assert.ok(!spinach.includes('Quest timers'));
  });

  it('turns a `how:` in the inventory evidence into the sentence, without its file references', () => {
    assert.equal(howOf('how: Get water from the Water Cooler (js/water-cooler.js:80) | auto: source x'), 'Get water from the Water Cooler.');
    assert.equal(howOf('obtainable: addItem at js/x.js:1'), null);
    const overrides = JSON.parse(readFileSync(join(spike, 'tools/inventory/overrides.json'), 'utf8'));
    const hows = Object.entries(overrides).filter(([, v]) => /^how: /.test(v?.reason || ''));
    assert.ok(hows.length >= 9, `${hows.length} how overrides`);
    for (const [k, v] of hows) {
      assert.match(v.reason.split(' | ')[0], /js\/[a-z0-9/-]+\.js:\d+/, `${k} cites a remake file:line`);
      assert.ok(page(k.slice(5)).includes(`<li>${esc(howOf(v.reason))}</li>`), `${k} page shows its how`);
    }
  });

  it('names where every item in the remake comes from', { skip: skipWithoutInventory }, () => {
    const generic = data.items.filter((i) => i.status === 'source' && page(i.id).includes('The remake gives it out as you play.'));
    assert.deepEqual(generic.map((i) => i.id), []);
    assert.match(page('artifact_chicken_brick'), /Assembled from all 5 Pieces of Chicken-Shaped Brick: <a href="\.\.\/artifact_chicken_brick_piece1\/">piece 1<\/a>/);
    assert.match(page('artifact_necklace_onyx'), /Assembled from 19 <a href="\.\.\/artifact_necklace_onyx_piece\/">/);
    assert.match(page('artifact_chicken_brick_piece1'), /Cracked out of a Small Petrified Rock/);
    assert.match(page('musicblock_d_blue_02'), /Sometimes drops when you pet a Paper Tree\./);
    assert.match(page('swf_1'), /Sometimes drops when you scrape a Barnacle\./);
  });
});
