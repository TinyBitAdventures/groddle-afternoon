/**
 * The encyclopedia's Buffs section (tools/encyclopedia/buffs.mjs): a page for
 * every buff of Tiny Speck's catalog but the staff and test ones, what gives
 * each one linked to its item, quest or street, the remake's status, and the
 * section list and search carrying them.
 *
 * Run: node --test tests/encyclopedia-buffs.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { INVENTORY_DB } from '../tools/catalog/build.mjs';
import { loadEncyclopedia } from '../tools/encyclopedia/data.mjs';
import { DEV_BUFFS, durationWords } from '../tools/encyclopedia/buffs.mjs';
import { CONSUME_BUFFS, QUEST_TIMER_BUFFS } from '../public/js/buff-triggers.js?v=a3093922';
import { BUFF_ITEM_CATALOG } from '../public/js/buffs.js?v=819cb342';

const pub = join(import.meta.dirname, '..', 'public');
const dir = join(pub, 'encyclopedia', 'buffs');
const skip = existsSync(INVENTORY_DB) ? false : `needs the coverage inventory at ${INVENTORY_DB}`;
const d = skip ? null : await loadEncyclopedia();
const buffs = JSON.parse(readFileSync(join(pub, 'assets/content/buffs.json'), 'utf8'));
const page = (id) => readFileSync(join(dir, id, 'index.html'), 'utf8');
/** The "What gives it to you" band of a buff's page. */
const causes = (id) => /<h2 id="cause-h">[\s\S]*?<\/section>/.exec(page(id))?.[0] || '';
const link = (path) => `href="../../../encyclopedia/${path}/"`;

describe('the Buffs section', () => {
  it('has a page for every buff but the staff and test ones', { skip }, () => {
    const want = Object.keys(buffs).filter((id) => !DEV_BUFFS.has(id)).sort();
    const have = readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name).sort();
    assert.deepEqual(have, want);
    assert.ok(want.length > 100, `${want.length} buffs`);
    for (const id of ['admin_buff_timers', 'cal_test', 'timer_test', 'online_test', 'offline_test', 'max_luck', 'turn_off_quests', 'walking_dead']) {
      assert.ok(!existsSync(join(dir, id)), `${id} has a page`);
    }
  });

  it('links the drink, food, herb or quest that gives each buff', { skip }, () => {
    assert.ok(causes('caffeine_buzz').includes(link('items/coffee')));
    assert.ok(causes('caffeine_buzz').includes(link('items/mabbish_coffee')));
    assert.match(causes('caffeine_buzz'), /Drinking <a [^>]+>Coffee<\/a> or <a [^>]+>Mabbish Coffee<\/a>\./);
    assert.match(causes('high_jumper'), /Activating <a href="\.\.\/\.\.\/\.\.\/encyclopedia\/items\/spinach\/">Spinach<\/a>\./);
    assert.match(causes('get_a_rasher'), /The timer of <a href="\.\.\/\.\.\/\.\.\/encyclopedia\/quests\/animalkinship_nibble_meat\/">/);
    assert.ok(causes('kukubee_winter_negative').includes('href="../../../encyclopedia/places/the-seams/#LM11E7ODKHO1QJE"'));
    assert.ok(causes('poisoners_guilt').includes(link('items/potion_tree_poison')));
    // Every table row of the remake's own triggers shows up on its buff's page.
    for (const r of CONSUME_BUFFS) assert.ok(causes(r.buff).includes(link(`items/${r.event.split(':')[0]}`)), r.event);
    for (const [cls, r] of Object.entries(BUFF_ITEM_CATALOG)) assert.ok(causes(r.buffId).includes(link(`items/${cls}`)), cls);
    for (const r of QUEST_TIMER_BUFFS) if (d.entries.has(`quests:${r.quest}`)) assert.ok(causes(r.buff).includes(link(`quests/${r.quest}`)), r.quest);
  });

  it('keeps the way back to the buff that came before', { skip }, () => {
    assert.ok(causes('buff_hungover').includes(link('buffs/buff_smashed')));
    assert.match(page('buff_smashed'), /<h2 id="after-h">What comes after<\/h2>[\s\S]*?href="\.\.\/\.\.\/\.\.\/encyclopedia\/buffs\/buff_hungover\/"/);
    assert.ok(d.entries.get('buffs:buff_hungover').refs.some((r) => r.to === 'buffs:buff_smashed' && r.rel === 'after'));
    assert.ok(d.entries.get('buffs:caffeine_buzz').refs.some((r) => r.to === 'item:coffee' && r.rel === 'causes'));
  });

  it('marks what the remake gives, what only multiplayer gives and what nothing gave', { skip }, () => {
    const status = (id) => d.entries.get(`buffs:${id}`).status;
    for (const id of ['caffeine_buzz', 'high_jumper', 'pooped', 'get_a_rasher', 'nekkid', 'stuffed']) assert.equal(status(id), 'source', id);
    for (const id of ['charades', 'glitch_train', 'sneezing', 'play_musicblocks']) assert.equal(status(id), 'multiplayer', id);
    for (const id of ['zen', 'bad_mood', 'real_bummer']) assert.equal(status(id), 'missing', id);
    for (const id of ['rooked_recovery', 'crusher_invincibility', 'tickle_me_emo']) assert.equal(status(id), 'unbuilt_original', id);
    assert.match(page('zen'), /<span class="pill st-missing">/);
    assert.doesNotMatch(page('stuffed'), /st-missing|Not in the remake yet/);
  });

  it('calls no buff missing that the game gives (report #186: Stuffed was)', { skip }, () => {
    // The status is a hand table (buffs.mjs CAUSES): it goes stale when a buff is built later.
    const js = [];
    const walk = (p) => {
      for (const x of readdirSync(p, { withFileTypes: true })) {
        if (x.isDirectory()) { if (x.name !== 'vendor') walk(join(p, x.name)); } else if (x.name.endsWith('.js')) js.push(readFileSync(join(p, x.name), 'utf8'));
      }
    };
    walk(join(pub, 'js'));
    js.push(readFileSync(join(pub, 'game.js'), 'utf8'));
    const src = js.join('\n');
    const missing = [...d.entries.values()].filter((x) => x.section === 'buffs' && x.status === 'missing').map((x) => x.id).sort();
    assert.deepEqual(missing, ['bad_mood', 'real_bummer', 'zen']);
    const gives = (id) => new RegExp(`(?:applyBuff\\(|mirror\\(engine, |restart\\(engine, )['"]${id}['"]`).test(src);
    assert.ok(gives('stuffed') && gives('kukubee_winter_negative'), 'the check finds a buff the game applies');
    for (const id of missing) assert.ok(!gives(id), `the game applies ${id}: it is not missing`);
  });

  it('prints Tiny Speck\'s words, the duration and the kind', { skip }, () => {
    const html = page('caffeine_buzz');
    assert.match(html, /<div class="cat-desc"><p>Caffeine pops your mood every 10 seconds<\/p><\/div>/);
    assert.match(html, /<dt>Lasts<\/dt><dd>50 seconds<\/dd>/);
    assert.match(html, /<dt>Works<\/dt><dd>every 10 seconds<\/dd>/);
    assert.match(page('camera_recharging'), /You need to wait before you can &quot;Take a picture&quot; again!/);
    assert.match(page('nekkid'), /<dt>Lasts<\/dt><dd>Until something ends it<\/dd>/);
    assert.equal(durationWords(14400), '4 hours (one game day)');
    assert.equal(durationWords(90), '1 minute 30 seconds');
  });

  it('is listed in the section index, on the home page and in the search', { skip }, () => {
    const index = readFileSync(join(dir, 'index.html'), 'utf8');
    for (const g of ['Buffs', 'Debuffs', 'Quest timers', 'Cooldowns']) assert.match(index, new RegExp(`<section class="ency-group" aria-label="${g}"`), g);
    assert.ok(index.includes('href="../../encyclopedia/buffs/high_jumper/"'));
    assert.ok(readFileSync(join(pub, 'encyclopedia/index.html'), 'utf8').includes('href="buffs/"'));
    const search = JSON.parse(readFileSync(join(pub, 'encyclopedia/search.json'), 'utf8'));
    assert.ok(search.sections.some((s) => s.key === 'buffs'));
    const rows = search.entries.filter((x) => x.s === 'buffs');
    assert.equal(rows.length, readdirSync(dir).length - 1);
    assert.ok(rows.some((x) => x.id === 'caffeine_buzz' && x.n === 'Caffeine Buzz' && x.h === 'encyclopedia/buffs/caffeine_buzz/'));
  });

  it('writes no em dashes in its own words', () => {
    assert.ok(!readFileSync(join(import.meta.dirname, '..', 'tools/encyclopedia/buffs.mjs'), 'utf8').includes('—'));
  });
});
