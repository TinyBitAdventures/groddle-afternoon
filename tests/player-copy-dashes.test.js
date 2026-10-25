/**
 * House style (G215): no em-dashes in the remake's own player-facing copy.
 * Every string literal in public/ (comments are not copy) and the text of
 * the built HTML pages is scanned for U+2014 (and its &#8212; / &mdash;
 * entities). Three kinds may keep one:
 *   - a lone "—" standing for an empty value (garden.js plotStatusLabel);
 *   - Tiny Speck's own text, kept word for word: SOURCE_VERBATIM below names
 *     the file each one comes from, and the source check proves it;
 *   - item catalog pages, which print the GSJS item description.
 * The changelog notes keep their archived text (tests/changelog.test.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const acorn = createRequire(import.meta.url)('acorn');
const GS = join(root, '../glitch-GameServerJS');
const CLIENT = join(root, '../glitch-client');
const DASH = /—|&#8212;|&mdash;/;

/**
 * Source-verbatim lines: [file under public/, a piece of the literal, the
 * file the words come from]. The piece is copied from the source, dash and
 * all, so the source check can find it there.
 */
const SOURCE_VERBATIM = [
  ['js/butler.js', 'made by the Toymakers — who existed', 'glitch-GameServerJS/items/butler_box.js'],
  ['js/foxes.js', 'Ah — would you like to hear my introduction', 'glitch-GameServerJS/items/npc_fox_ranger.js'],
  ['js/foxes.js', 'Ah — you’d like to hear about the licenses?', 'glitch-GameServerJS/items/npc_fox_ranger.js'],
  ['js/foxes.js', 'The price is 500 currants — but the license', 'glitch-GameServerJS/items/npc_fox_ranger.js'],
  ['js/hell.js', 'the potent Wine of the Dead—a fermented', 'glitch-GameServerJS/items/drink_ticket.js'],
  ['js/hell.js', 'that your life—or your death—had value', 'glitch-GameServerJS/items/hell_bartender.js'],
  ['js/imagination-data.js', 'your location. Easy — and it works great', 'glitch-GameServerJS/inc_data_imagination.js'],
  ['js/imagination-data.js', 'merest beginner jump — however', 'glitch-GameServerJS/inc_data_imagination.js'],
  ['js/imagination-data.js', 'This is the tin standard — the most common', 'glitch-GameServerJS/inc_data_imagination.js'],
  ['js/juju-bandits.js', 'I have a riddle for you—what', 'glitch-GameServerJS/items/npc_juju_bandit.js'],
  // The yard rule (magic_rock.js 351, G226).
  ['js/magic-rock-home.js', 'Sorry kid — your first cultivation', 'glitch-GameServerJS/items/magic_rock.js'],
  ['js/newxp.js', 'Well, well — welcome.<br><br>', 'glitch-GameServerJS/locations/newxp_training1.js'],
  ['js/newxp.js', ' — enjoy your new home!', 'glitch-GameServerJS/locations/newxp_training2.js'],
  ['js/newxp.js', 'your house and your land — but to do much more', 'glitch-GameServerJS/items/magic_rock.js'],
  ['js/newxp.js', 'I was a little short — that’s not quite enough', 'glitch-GameServerJS/locations/newbie_island.js'],
  ['js/newxp.js', 'Not so fast — head home first', 'glitch-GameServerJS/locations/newbie_island.js'],
  ['js/newxp.js', 'You little adventurer, you — nicely done.', 'glitch-GameServerJS/locations/home.js'],
  ['js/newxp.js', 'kinds of skills — Teleportation and Mining', 'glitch-GameServerJS/locations/home.js'],
  // The Scion's quotes, verbatim (purple_apparition.js 89, 111).
  ['js/purple-journey.js', 'the crooked ladder of your spine—', 'glitch-GameServerJS/items/purple_apparition.js'],
  ['js/purple-journey.js', 'all around them is silence—that is the earth!', 'glitch-GameServerJS/items/purple_apparition.js'],
  ['js/quest-rooms/back-alley.js', 'routine subway maintenance—refilling', 'glitch-GameServerJS/items/npc_maintenance_bot.js'],
  ['js/quest-rooms/kids-room.js', 'six different letters—A, B, E, M, S and T—you', 'glitch-GameServerJS/items/npc_letterblock.js'],
  ['js/rube.js', 'Something smells weird—like', 'glitch-GameServerJS/items/essence_of_rubeweed.js'],
  ['js/seasons-data.js', 'not sure what they are — though from the description', 'glitch-GameServerJS/players/player.js'],
  ['js/street-furniture.js', 'Ah — I know just the street to send you to.', 'glitch-GameServerJS/items/visiting_stone.js'],
  ['js/exploration.js', ' &#8212; ', 'glitch-client/com/tinyspeck/engine/view/gameoverlay/LoadingLocationView.as'],
];

const walk = (dir, skip) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (skip(relative(pub, path).split(sep).join('/'))) return [];
  return statSync(path).isDirectory() ? walk(path, skip) : [path];
});
const rel = (path) => relative(pub, path).split(sep).join('/');

/** A lone dash for an empty value (also inside a tag): not a sentence dash. */
const placeholder = (text) => text.replace(/<[^>]*>/g, '').trim() === '—';

function dashLiterals() {
  const out = [];
  const skip = (p) => p === 'vendor' || p.startsWith('vendor/');
  for (const file of walk(pub, skip).filter((p) => /\.m?js$/.test(p))) {
    const src = readFileSync(file, 'utf8');
    if (!DASH.test(src)) continue;
    for (const tok of acorn.tokenizer(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true })) {
      if (tok.type.label !== 'string' && tok.type.label !== 'template') continue;
      const raw = src.slice(tok.start, tok.end);
      if (!DASH.test(raw) || placeholder(String(tok.value ?? ''))) continue;
      out.push({ file: rel(file), line: tok.loc.start.line, raw });
    }
  }
  return out;
}

function pageText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
}

describe('em-dashes in player-facing copy (G215)', () => {
  it('no string literal in public/ has one unless it is source-verbatim', () => {
    const stray = [];
    for (const hit of dashLiterals()) {
      const allowed = SOURCE_VERBATIM.some(([file, piece]) => file === hit.file && hit.raw.includes(piece));
      if (!allowed) stray.push(`${hit.file}:${hit.line} ${hit.raw.slice(0, 90)}`);
    }
    assert.deepEqual(stray, []);
  });

  it('every allowed line is still in use', () => {
    const hits = dashLiterals();
    for (const [file, piece] of SOURCE_VERBATIM) {
      assert.ok(hits.some((h) => h.file === file && h.raw.includes(piece)), `${file}: ${piece}`);
    }
  });

  it('every allowed line is Tiny Speck\'s own words, dash and all', (t) => {
    if (!existsSync(GS) || !existsSync(CLIENT)) return t.skip('GSJS or the client is not beside the spike');
    for (const [file, piece, source] of SOURCE_VERBATIM) {
      const text = readFileSync(join(root, '..', source), 'utf8');
      assert.ok(text.includes(piece), `${file}: "${piece}" not in ${source}`);
    }
  });

  it('no page text has one (comments, scripts and the changelog notes aside)', () => {
    const skip = (p) => p === 'vendor' || p.startsWith('vendor/') || p === 'changelog' || p.startsWith('changelog/');
    const stray = [];
    for (const file of walk(pub, skip).filter((p) => p.endsWith('.html'))) {
      const path = rel(file);
      const text = pageText(readFileSync(file, 'utf8'));
      if (!DASH.test(text)) continue;
      // Item pages print the item's GSJS description (tools/catalog/build.mjs).
      const item = /^items\/([^/]+)\/index\.html$/.exec(path)?.[1];
      if (item) {
        const desc = /<div class="cat-desc"><p>([\s\S]*?)<\/p>/.exec(text)?.[1] || '';
        // The meta description is that same text plus " In the remake."
        const outside = text.replace(/<meta name="description"[^>]*>/, '').replace(desc, '');
        if (!DASH.test(outside) && (!existsSync(GS) || readFileSync(join(GS, 'items', `${item}.js`), 'utf8').includes(desc.replace(/&#39;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&')))) continue;
      }
      stray.push(path);
    }
    assert.deepEqual(stray, []);
  });
});

describe('the lines G215 reworded', () => {
  it('making uses the source result line and a colon before the recipe name', async () => {
    const { formatCraftProgress, formatCraftResultLine } = await import('../public/js/making.js');
    assert.equal(formatCraftProgress(2, 5, 'Flour'), 'Making 2 of 5: Flour');
    assert.equal(formatCraftProgress(1, 1), 'Making 1 of 1');
    // players/inc_making.js 896-909.
    assert.equal(formatCraftResultLine({ made: 3, recipeName: 'Flour', energy: -3, xp: 2 }), 'You made Flour (x3) -3 energy, +2 iMG.');
    assert.equal(formatCraftResultLine({ made: 1, recipeName: 'Flour', energy: 0, xp: 0 }), 'You made Flour (x1).');
  });

  it('the Hog Haul bait line is the source\'s', async (t) => {
    const { hogHaulObjective } = await import('../public/js/hog-haul.js');
    assert.equal(hogHaulObjective({ status: 'running', hasBait: true }), 'You have bait, now go get a piggy!');
    if (!existsSync(GS)) return t.skip('no GSJS');
    assert.ok(readFileSync(join(GS, 'players/inc_games.js'), 'utf8').includes('You have bait, now go get a piggy!'));
  });
});
