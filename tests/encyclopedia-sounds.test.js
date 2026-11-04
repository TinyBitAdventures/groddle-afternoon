/**
 * The encyclopedia's Music and sounds section (tools/encyclopedia/sounds.mjs,
 * Austin 2026-11-03): a page for every sound key of the catalog
 * (assets/content/sound-keys.json), every street music key and every music
 * set's key of assets/content/ambient-music.json; statuses from the same model
 * the sound compare report reads (tools/sound/sound-model.mjs); counts on the
 * index, the home card and the Still missing page that agree with the catalog;
 * a Still missing list that is exactly the original's sounds with no recording
 * found; players that load the game's own files lazily; and the way back from
 * the places, creatures and items a sound plays on.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { INVENTORY_DB } from '../tools/catalog/build.mjs';
import { STATUS } from '../tools/encyclopedia/parts.mjs';
import { SOUND_STATUS, plainName, playerMoment } from '../tools/encyclopedia/sounds.mjs';
import { keyState, loadSoundData, originalOf, streetMusicKeys } from '../tools/sound/sound-model.mjs';
import { denied, pageText } from './player-copy-dev-refs.js';

const spike = join(import.meta.dirname, '..');
const pub = join(spike, 'public');
const dir = join(pub, 'encyclopedia', 'sounds');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const skipWithoutInventory = existsSync(INVENTORY_DB) ? false : `needs the coverage inventory at ${INVENTORY_DB}`;
const built = existsSync(join(dir, 'index.html'));
const { keys, music } = loadSoundData();
const streets = streetMusicKeys(music);
const themeKeys = new Set(Object.values(music.themes).flatMap((t) => t.gsjsKeys || []));
const search = JSON.parse(read('encyclopedia/search.json'));
const rows = search.entries.filter((x) => x.s === 'sounds');
const page = (id) => read(`encyclopedia/sounds/${id}/index.html`);
const n = (x) => Number(String(x).replace(/,/g, ''));

/** The original's sounds whose recording has not been found, from the catalog and the music config alone. */
function expectedMissing() {
  const out = new Set();
  for (const [key, row] of Object.entries(keys)) {
    if (row.category === 'remake' || row.dead || key === 'NO_MUSIC') continue;
    if (!originalOf(keys, key)) out.add(key.toLowerCase());
  }
  // Keys a music set names that the catalog does not list are Tiny Speck's, and none has a file.
  for (const key of themeKeys) if (!keys[key]) out.add(key.toLowerCase());
  return out;
}

describe('encyclopedia: music and sounds', { skip: built ? false : 'run node tools/encyclopedia/build.mjs' }, () => {
  it('has a page for every catalog key, street music key and music set key', () => {
    const want = new Set([...Object.keys(keys), ...streets.keys(), ...themeKeys].map((k) => k.toLowerCase()));
    const have = new Set(readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory() && x.name !== 'still-missing').map((x) => x.name));
    // No sound is a blank stub today; one that became one would be in neither list, and this would name it.
    assert.deepEqual([...want].filter((k) => !have.has(k)), []);
    assert.deepEqual([...have].filter((k) => !want.has(k)), []);
    assert.equal(rows.length, have.size);
    for (const r of rows) assert.ok(SOUND_STATUS.includes(r.st), `${r.id}: ${r.st}`);
  });

  it('gives each sound the status the shared model gives its key', () => {
    let checked = 0;
    const st = new Map(rows.map((r) => [r.id, r.st]));
    for (const [key, row] of Object.entries(keys)) {
      const s = keyState(keys, key);
      const id = key.toLowerCase();
      if (row.dead) assert.equal(st.get(id), 'snd_silent', key);
      else if (s.status === 'original') assert.equal(st.get(id), 'snd_original', key);
      else if (s.status === 'synth' && !streets.has(key) && !themeKeys.has(key)) assert.equal(st.get(id), 'snd_synth', key);
      else continue;
      checked += 1;
      const html = page(id);
      assert.match(html, new RegExp(`<span class="pill st-${st.get(id)}">${STATUS[st.get(id)].label}</span>`), key);
      assert.ok(html.includes(`<span class="ency-key">${key}</span>`), `${key}: the key, for contributors`);
      if (s.status === 'original' && !row.dead) assert.ok(html.includes(`<audio controls preload="none" src="../../../${s.file}`), `${key}: its own recording`);
    }
    assert.ok(checked > 500, `only ${checked}`);
    assert.equal(st.get('no_music'), 'snd_silent');
  });

  it('counts the same on the index, the home card, the search and the Still missing page', { skip: skipWithoutInventory }, () => {
    const index = read('encyclopedia/sounds/index.html');
    const fromOriginal = rows.filter((r) => !/^New in the remake$/.test(r.g));
    const original = fromOriginal.filter((r) => r.st === 'snd_original').length;
    const score = /<strong>([\d,]+)<\/strong> of ([\d,]+) sounds and tunes from the original game play Tiny Speck’s own recording\./.exec(index);
    assert.ok(score, 'the headline');
    assert.equal(n(score[1]), original);
    assert.equal(n(score[2]), fromOriginal.length);
    const missing = expectedMissing();
    assert.match(index, new RegExp(`<p class="cat-note">${missing.size.toLocaleString('en-US')} are still missing their recording: `));
    for (const s of SOUND_STATUS) {
      const chip = new RegExp(`data-st="${s}"><span class="dot st-${s}" aria-hidden="true"></span><span>[^<]+</span> <span class="count">([\\d,]+)</span>`).exec(index);
      assert.equal(n(chip?.[1]), rows.filter((r) => r.st === s).length, s);
    }
    const home = read('encyclopedia/index.html');
    assert.match(home, new RegExp(`ency-card-name">Music and sounds <span class="count">${rows.length.toLocaleString('en-US')}</span>`));
    assert.match(home, new RegExp(`${original.toLocaleString('en-US')} of ${fromOriginal.length.toLocaleString('en-US')} play Tiny Speck’s own recording\\.`));
    assert.match(read('encyclopedia/sounds/still-missing/index.html'), new RegExp(`<p class="lead">${missing.size.toLocaleString('en-US')} sounds and tunes from the original game are still missing their recording: `));
  });

  it('lists exactly the sounds still missing, each with its file name where known and a way to send it', () => {
    const html = read('encyclopedia/sounds/still-missing/index.html');
    const listed = new Set([...html.matchAll(/<li id="([a-z0-9_]+)"><span class="snd-miss-name">/g)].map((m) => m[1]));
    assert.deepEqual([...listed].sort(), [...expectedMissing()].sort());
    for (const id of listed) {
      const url = keys[id.toUpperCase()]?.url;
      if (url) assert.ok(html.includes(`<span class="snd-miss-file">${decodeURIComponent(url.split('/').pop())}</span>`), `${id}: file name`);
      assert.ok(page(id).includes('The original recording has not been found yet.'), id);
      assert.ok(page(id).includes('mailto:hello@groddleafternoon.com'), `${id}: the ask`);
    }
    assert.ok(html.includes('<a href="mailto:hello@groddleafternoon.com">hello@groddleafternoon.com</a>'));
    assert.ok(html.includes('<a href="../../../contribute/">Contribute</a>'));
    // A sound new in the remake is never missing: the original had none.
    for (const [key, row] of Object.entries(keys)) if (row.category === 'remake') assert.ok(!listed.has(key.toLowerCase()), key);
  });

  it('plays the game’s own files, lazily, and the synth stand-ins through the game’s recipes', () => {
    let audio = 0;
    let synth = 0;
    for (const r of rows) {
      const html = page(r.id);
      // The data-versions key (?v=) keeps a recording fresh after it changes.
      for (const [tag, src] of [...html.matchAll(/<audio ([^>]*)src="\.\.\/\.\.\/\.\.\/([^"?]+)(?:\?v=[0-9a-f]+)?"/g)].map((m) => [m[1], m[2]])) {
        assert.match(tag, /preload="none"/, r.id);
        assert.ok(src.startsWith('assets/audio/'), `${r.id}: ${src}`);
        assert.ok(existsSync(join(pub, src)), `${r.id}: ${src}`);
        audio += 1;
      }
      if (r.st === 'snd_synth') {
        assert.match(html, /<button type="button" class="snd-synth" data-synth="[A-Za-z0-9_]+" data-synth-module="\.\.\/\.\.\/\.\.\/js\/synth-sfx\.js\?v=[0-9a-f]{8}" hidden>/, r.id);
        synth += 1;
      }
    }
    assert.ok(audio > 500 && synth > 50, `${audio} players, ${synth} synth buttons`);
    const index = read('encyclopedia/sounds/index.html');
    assert.ok(!index.includes('<audio'), 'the index stays light: players are on the pages');
    const js = read('encyclopedia/encyclopedia.js');
    assert.match(js, /await import\(b\.dataset\.synthModule\)/);
    assert.match(js, /playSynthRecipe\(ctx, ctx\.destination, b\.dataset\.synth/);
  });

  it('names where each sound plays, linking its places, and the places link back', { skip: skipWithoutInventory }, () => {
    // Region music: the set's regions (assets hub map), linked.
    const forest = page('forest_ambient1');
    assert.match(forest, /href="\.\.\/\.\.\/\.\.\/encyclopedia\/places\/groddle-meadow\/"/);
    assert.match(read('encyclopedia/places/groddle-meadow/index.html'), /href="\.\.\/\.\.\/\.\.\/encyclopedia\/sounds\/forest_ambient1\/"/);
    // Street music: each street it loops on, at its line on the place page, which names the music.
    let linked = 0;
    for (const r of rows.filter((x) => x.g === 'Street music')) {
      for (const [, slug, tsid] of page(r.id).matchAll(/href="\.\.\/\.\.\/\.\.\/encyclopedia\/places\/([a-z0-9-]+)\/#([A-Z0-9]+)"/g)) {
        const place = read(`encyclopedia/places/${slug}/index.html`);
        const line = new RegExp(`<li id="${tsid}" class="ency-street">[\\s\\S]*?</li>`).exec(place)?.[0] || '';
        assert.ok(line.includes(`Music: ${r.n}`) && line.includes(`/encyclopedia/sounds/${r.id}/"`), `${slug}#${tsid}: ${r.id}`);
        linked += 1;
      }
    }
    assert.ok(linked > 20, `${linked} street links`);
    // Things: a tool's sound links the tool, and its item page lists the sound.
    assert.match(page('pick'), /href="\.\.\/\.\.\/\.\.\/encyclopedia\/items\/pick\/"/);
    assert.match(read('encyclopedia/items/pick/index.html'), /<h3>Sounds<\/h3>[\s\S]*href="\.\.\/\.\.\/\.\.\/encyclopedia\/sounds\/pick\/"/);
  });

  it('keeps the original’s files and code out of the words: plain names, player moments, no dev references', () => {
    assert.equal(plainName('ROOK_CAW'), 'Rook caw');
    assert.equal(plainName('AMBIENT_CAVERNS3'), 'Ambient Caverns 3');
    assert.equal(plainName('BW_A1'), 'Waterfall bell A1');
    assert.equal(playerMoment('items/pick.js (tool class sound while working)'), '');
    assert.equal(playerMoment('street:GIFM4BD43383DKV (Le Miserable puzzle_1_verify)'), '');
    assert.equal(playerMoment('Any enabled button in a dialog (client UI)'), 'Any enabled button in a dialog');
    assert.equal(playerMoment('iMG quoin'), 'iMG quoin');
    const bad = [];
    for (const rel of ['index.html', 'still-missing/index.html', ...rows.map((r) => `${r.id}/index.html`)]) {
      const html = read(`encyclopedia/sounds/${rel}`);
      for (const text of pageText(html).split('\n')) {
        const d = denied(text);
        if (d) bad.push(`${rel}: ${d.rule} "${d.match}"`);
      }
      if (/—/.test(html)) bad.push(`${rel}: an em dash`);
      if (/public domain|CC0/i.test(pageText(html))) bad.push(`${rel}: claims the recordings are public domain`);
    }
    assert.deepEqual(bad.slice(0, 20), [], `${bad.length} problems`);
    assert.match(read('encyclopedia/sounds/index.html'), /Every recording here is Tiny Speck’s own: the sounds as their game played them, and the music they published for everyone to download\./);
  });

  it('works without JavaScript: status anchors and group anchors that land on lists', () => {
    const index = read('encyclopedia/sounds/index.html');
    for (const s of SOUND_STATUS) {
      if (!rows.some((r) => r.st === s)) continue;
      assert.ok(index.includes(`href="#st-${s}"`) && index.includes(`<h3 id="st-${s}">`), s);
    }
    const groups = [...index.matchAll(/<a href="#g-([a-z]+)">/g)].map((m) => m[1]);
    assert.ok(groups.length >= 8, `${groups.length} groups`);
    for (const g of groups) assert.ok(index.includes(`<section class="ency-group" id="g-${g}"`), g);
    // Every sound is listed once in the groups and once under its status.
    const tiles = [...index.matchAll(/<li data-name="[^"]*" data-status="(snd_[a-z]+)">/g)];
    assert.equal(tiles.length, rows.length);
  });

  it('reads the catalog through the model the sound compare report reads', () => {
    const report = readFileSync(join(spike, 'tools/sound/compare-report.mjs'), 'utf8');
    assert.match(report, /from '\.\/sound-model\.mjs(?:\?v=[0-9a-f]+)?'/);
    for (const fn of ['function resolve', 'function originalOf', 'function keyState', 'function themeStatus']) assert.ok(!report.includes(fn), `compare-report.mjs keeps its own ${fn}`);
    const sounds = readFileSync(join(spike, 'tools/encyclopedia/sounds.mjs'), 'utf8');
    assert.match(sounds, /from '\.\.\/sound\/sound-model\.mjs(?:\?v=[0-9a-f]+)?'/);
  });
});
