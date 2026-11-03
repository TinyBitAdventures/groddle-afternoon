/**
 * The word filter (the remake's own addition, Austin 2026-11-02: "include a
 * list of bad words to exclude from chat and things like bag renames. If
 * someone uses one of those words, like fuck, turn it into something funny
 * like #!@$."). The original Glitch had no swear filter in its server or
 * client code, so nothing here has a source line.
 *
 * One list (js/word-filter-list.js), one rule in three languages: the game's
 * js/word-filter.js, the realtime server's wordfilter.go (its own tests run
 * the same vectors), the site's src/WordFilter.php (run here through php).
 * tools/build-word-filter.mjs copies the list and the vectors to the other
 * two repos. Chat is filtered by the server (its chat log keeps the words);
 * names and notes the game and the site keep are filtered where they are
 * written or shown; character names with a bad word are refused.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as acorn from 'acorn';

import { NAME_REFUSED, SYMBOLS, badSpans, filterText, grawlix, hasBadWord, isBadWord } from '../public/js/word-filter.js?v=9a7a7ebb';
import { WORD_FILTER } from '../public/js/word-filter-list.js?v=20da9845';
import { VECTORS, wordFilterOutputs } from '../tools/build-word-filter.mjs';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath, sitePath } from '../tools/repos.mjs';
import { bagLabel } from '../public/js/bag-names.js?v=22391c55';
import { BAG_DEFS, PACK_CAPACITY, layoutPack, normalizePrefs, renameBag } from '../public/js/pack-slots.js?v=ba0a895f';
import { ITEM_CATALOG, isToolItem } from '../public/js/inventory.js?v=597a17a2';
import { nameAnimal, namedAnimalLabel } from '../public/js/animal-husbandry.js?v=9c649df2';
import { kittyLabel, nameKitty } from '../public/js/heli-kitties.js?v=8fbe314a';
import { nameCubimal } from '../public/js/cubimals.js?v=6cf43927';
import { createButlerState, renameButler, teachButler } from '../public/js/butler.js?v=86316578';
import { cleanTowerName } from '../public/js/home-tower.js?v=6a203c8f';
import { PENMANSHIP_SKILL, editNote, writePaperNote } from '../public/js/street-furniture.js?v=cb0ba050';
import { MAIL_COMPANIONS, createMailboxState, sendMail } from '../public/js/mailbox.js?v=b2bde2fe';
import { teachPhrase } from '../public/js/seasons.js?v=1978c3f3';
import { cleanCaption } from '../public/js/snaps.js?v=55d4c257';
import { sauceLabel, sauceStreetLine } from '../public/js/potions.js?v=c21bad59';
import { groupNameProblem } from '../public/js/groups.js?v=14b60589';
import { characterNameProblem } from '../public/js/account-forms.js?v=fe37d0de';

const ROOT = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const { vectors } = JSON.parse(readFileSync(VECTORS, 'utf8'));

describe('the rule and its shared vectors', () => {
  it('turns "fuck" into "#!@$", the example Austin gave', () => {
    assert.equal(filterText('fuck'), '#!@$');
    assert.equal(filterText('Oh fuck, a rock!'), 'Oh #!@$, a rock!');
    assert.equal(SYMBOLS, '#!@$%&*');
    assert.equal(grawlix(9), '#!@$%&*#!');
  });

  it('every vector comes out as written, a second pass changes nothing, and hasBadWord agrees', () => {
    assert.ok(vectors.length >= 150, `${vectors.length} vectors`);
    for (const v of vectors) {
      assert.equal(filterText(v.in), v.out, v.in);
      assert.equal(filterText(v.out), v.out, `again: ${v.out}`);
      assert.equal(hasBadWord(v.in), v.in !== v.out, v.in);
      assert.equal(filterText(v.in).length, v.in.length, `same length: ${v.in}`);
    }
  });

  it('covers what the design asked for: suffixes, repeats, swaps, joiners, and the Scunthorpe words', () => {
    const out = new Map(vectors.map((v) => [v.in, v.out]));
    for (const bad of ['fucking', 'fuuuuck', 'fvck', 'f.u.c.k', 'sh1t', '5hit', 'a$$hole', 'sh!t', 'motherfucker', 'Cvnt']) assert.notEqual(out.get(bad), bad, bad);
    for (const fine of ['assassin', 'class', 'pass', 'grass', 'bass', 'Scunthorpe', 'cockpit', 'cocktail', 'Hancock', 'hello', 'shell', 'shitake', 'shiitake', 'spicy', 'cumin', 'niger', 'snigger', '45s', '455 currants', 'f u c k']) assert.equal(out.get(fine), fine, fine);
  });

  it('the list is lower case letters, and no exception is itself caught', () => {
    for (const key of ['stems', 'suffixes', 'exact', 'inside', 'exceptions']) {
      for (const w of WORD_FILTER[key]) assert.match(w, key === 'suffixes' ? /^[a-z]*$/ : /^[a-z]+$/, `${key}: ${w}`);
      assert.equal(new Set(WORD_FILTER[key]).size, WORD_FILTER[key].length, `${key} has no repeats`);
    }
    for (const w of WORD_FILTER.exceptions) assert.equal(isBadWord(w), false, w);
    for (const w of [...WORD_FILTER.stems, ...WORD_FILTER.exact, ...WORD_FILTER.inside]) assert.equal(isBadWord(w), true, w);
  });

  it('only ASCII is looked at, so offsets agree with the byte-based twins', () => {
    assert.deepEqual(badSpans('é fuck'), [[2, 6]]);
    assert.equal(filterText('fück'), 'fück');
  });
});

describe("the game's own text comes through unchanged", () => {
  // Real words of Stoot Barfield on the Stoot doll (js/stoot-doll.js): a player quoting them sees them filtered.
  const STOOT = new Set([
    "Right now, people can't ... they basically can't play the game, because it's so fucking slow.",
    "... And that wasn't going to be enough, so we were like, 'Oh shit,' but then we realized, 'Oh, it doesn't matter!'",
    "It's fucking awesome!",
  ]);
  const SKIP = new Set(['public/js/word-filter-list.js', 'public/js/word-filter.js']);

  function files(dir, out = []) {
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) files(rel, out);
      else if (/\.(js|json)$/.test(name) && !SKIP.has(rel)) out.push(rel);
    }
    return out;
  }

  it('every string in the content, items, streets and the game code is untouched (but the Stoot doll\'s three quotes)', () => {
    const changed = [];
    let strings = 0;
    const check = (rel, s) => {
      strings += 1;
      if (filterText(s) !== s) changed.push(`${rel}: ${s.slice(0, 120)}`);
    };
    const all = ['public/assets/content', 'public/assets/streets', 'public/encyclopedia', 'public/js'].flatMap((d) => files(d));
    all.push('public/game.js', 'public/content.js');
    for (const rel of all) {
      const src = read(rel);
      if (rel.endsWith('.json')) {
        const walk = (v) => {
          if (typeof v === 'string') check(rel, v);
          else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { check(rel, k); walk(x); }
        };
        walk(JSON.parse(src));
        continue;
      }
      const walk = (n) => {
        if (!n || typeof n.type !== 'string') return;
        if (n.type === 'Literal' && typeof n.value === 'string') check(rel, n.value);
        else if (n.type === 'TemplateElement') check(rel, n.value.cooked ?? n.value.raw);
        for (const k of Object.keys(n)) {
          const v = n[k];
          if (Array.isArray(v)) v.forEach(walk);
          else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
        }
      };
      walk(acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }));
    }
    assert.ok(strings > 1_000_000, `${strings} strings read`);
    const unexpected = changed.filter((c) => !STOOT.has(c.slice(c.indexOf(': ') + 2)) || !c.startsWith('public/js/stoot-doll.js'));
    assert.deepEqual(unexpected, []);
    assert.equal(changed.length, STOOT.size);
  });
});

describe('the list reaches the server and the site (tools/build-word-filter.mjs)', () => {
  it('--check: both repos hold what the builder writes', { skip: (!HAS_SERVER || !HAS_SITE) && 'needs the server and site checkouts' }, () => {
    for (const [file, text] of wordFilterOutputs()) assert.equal(readFileSync(file, 'utf8'), text, `${file} is stale: run node tools/build-word-filter.mjs`);
  });

  it('the server embeds it and filters every chat path before delivery, logging the typed line marked', { skip: !HAS_SERVER && 'no server checkout' }, () => {
    const src = (f) => readFileSync(serverPath(f), 'utf8');
    assert.match(src('wordfilter.go'), /\/\/go:embed data\/word-filter\.json/);
    assert.match(src('hub.go'), /shown := filterWords\(text\)[\s\S]*"text": shown/);
    assert.match(src('channels.go'), /Text: filterWords\(text\)/);
    assert.match(src('party.go'), /"text": filterWords\(text\)/);
    assert.match(src('butler_im.go'), /shown := filterWords\(text\)/);
    assert.match(src('chatlog.go'), /l\.Filtered, l\.Shown = true, shown/);
    assert.match(src('gifts.go'), /filterWords\(cleanNoteText\(msg\.Note\.Title/);
    assert.match(src('homes_help.go'), /filterWords\(cleanButlerText\(msg\.Text\)\)/);
    assert.match(src('verbs.go'), /hasBadWord\(word\)/);
  });
});

const hasPhp = spawnSync('php', ['-v']).status === 0;
const ENGINE = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const skipPhp = !HAS_SITE ? 'no site checkout' : !hasPhp ? 'no php' : !existsSync(join(ENGINE, 'src/Minn/Autoloader.php')) ? 'Minn Engine not found (set MINN_ENGINE_DIR)' : false;

describe("the site's twin (src/WordFilter.php)", { skip: skipPhp }, () => {
  const out = skipPhp ? null : JSON.parse(execFileSync('php', [join(ROOT, 'tests/fixtures/word-filter/site.php'), ENGINE, SITE_DIR, VECTORS], { encoding: 'utf8' }));

  it('passes the same vectors', () => {
    assert.equal(out.vectors, vectors.length);
    assert.deepEqual(out.wrong, []);
  });

  it('keeps profiles, letters, gift notes, Butler messages, captions and pole notes filtered, and shows a neighbour\'s names filtered', () => {
    assert.equal(out.about, 'Hi!\nI hate this #!@$.');
    assert.equal(out.letter, 'Dear #!@$%&*, hello');
    assert.equal(out.butler, 'for you, #!@$%');
    assert.equal(out.caption, 'look at this #!@$%& rock');
    assert.equal(out.pole, 'a #!@$%& note');
    assert.equal(out.butlerName, 'Sir #!@$%&*#');
    assert.equal(out.tower.tower.name, '#!@$ Tower');
    assert.deepEqual(out.tower.tower.floorLabels, { 1: '#!@$ floor', 2: 'Attic' });
  });

  it('refuses a character name with one at sign-up, the link and Google (never filtered), and a group name', () => {
    assert.equal(out.refused, NAME_REFUSED);
    assert.deepEqual(out.google, ['', 'Ada']);
    const acct = readFileSync(sitePath('src/PlayerAccount.php'), 'utf8');
    assert.equal((acct.match(/WordFilter::has\(\$name\)/g) || []).length, 2, 'players and players/verify');
    assert.match(readFileSync(sitePath('src/GoogleSignIn.php'), 'utf8'), /if \(WordFilter::has\(\$name\)\) \{\s*return self::refused\('name_refused', 400/);
    assert.match(readFileSync(sitePath('src/Characters.php'), 'utf8'), /WordFilter::has\(\$name\)/);
    const groups = readFileSync(sitePath('src/Groups.php'), 'utf8');
    assert.match(groups, /elseif \(WordFilter::has\(\$name\)\) \{\s*\$fields\['name'\] = WordFilter::NAME_REFUSED;/);
    assert.match(groups, /: WordFilter::text\(\$text\);/, 'descriptions filtered');
  });

  it('the console marks a filtered chat line and shows the original', async () => {
    const php = readFileSync(sitePath('src/AdminConsole.php'), 'utf8');
    assert.match(php, /'filtered' => \(\$l\['filtered'\] \?\? false\) === true,\s*'shown' => \(string\) \(\$l\['shown'\] \?\? ''\),/);
    const src = readFileSync(sitePath('console/console.js'), 'utf8');
    const row = src.slice(src.indexOf('function chatRow('), src.indexOf('async function loadChat('));
    assert.match(row, /el\('span', \{ text: l\.text \}\)/, 'the line as typed');
    assert.match(row, /chatFiltered\(l\)[\s\S]*console-tag-filtered/);
    const mod = await import(pathToFileURL(sitePath('console/console.js')).href);
    assert.equal(mod.chatFiltered({ filtered: false }), null);
    assert.deepEqual(mod.chatFiltered({ filtered: true, shown: 'oh #!@$' }), { text: 'Filtered', title: 'Players saw: oh #!@$' });
  });
});

describe('the game filters what players name and write', () => {
  it('chat: solo local chat shows the grawlix, and the server gets the typed line (it filters for everyone and logs it)', () => {
    const game = read('public/game.js');
    const say = game.slice(game.indexOf('function sayLocalChat('), game.indexOf('function finishAssistedFeatChain('));
    assert.match(say, /const text = filterText\(typed\);/);
    assert.match(say, /features\.query\('localChatSaid', typed, engine\)/);
    assert.match(say, /showLocalChatBubble\(shown, text,/);
    assert.match(read('public/js/features/butler-im-feature.js'), /text: filterText\(text\), mine: true/);
  });

  it('bags: the name is kept as typed and shows as a grawlix in the pack, on the ground and in the Rename box', () => {
    assert.equal(bagLabel('fuck bag', 'Bigger Bag'), '#!@$ bag');
    assert.equal(bagLabel('Fruit', 'Bigger Bag'), 'Fruit');
    assert.equal(bagLabel('', 'Bigger Bag'), 'Bigger Bag');
    const opts = { capacity: PACK_CAPACITY, catalog: ITEM_CATALOG, isTool: isToolItem, order: Object.keys(ITEM_CATALOG) };
    const inv = { bag_bigger: 1 };
    const layout = layoutPack(inv, normalizePrefs(null), opts);
    const key = Object.keys(layout.bags)[0];
    const res = renameBag(layout.prefs, key, 'shit stash');
    assert.ok(res.ok && BAG_DEFS.bag_bigger);
    const named = layoutPack(inv, normalizePrefs(res.prefs), opts);
    assert.equal(named.bags[key].name, 'shit stash');
    assert.equal(named.bags[key].label, '#!@$ stash');
    const game = read('public/game.js');
    assert.match(game, /label: filterText\(stack\.name\)/, 'a dropped bag on the street');
    const feat = read('public/js/features/bags-feature.js');
    assert.match(feat, /const shown = bagLabel\(current, ''\);[\s\S]*value: shown,[\s\S]*onSubmit: \(typed\) => onName\(shown && typed === shown \? current : typed\)/);
  });

  it('animals, Heli Kitties and Cubimals', () => {
    const state = {};
    const r = nameAnimal('npc_piggy', state, 'Bacon Bitch', { learned: ['animalkinship_5'], playerId: 'p', nowS: 1 });
    assert.equal(r.ok, true);
    assert.equal(state.userName, 'Bacon #!@$%');
    assert.equal(namedAnimalLabel('npc_piggy', { userName: 'Fuck' }), 'A Piggy Named #!@$');
    const kitty = { name: '' };
    const k = nameKitty(kitty, 'Shitty', { learned: ['animalkinship_5'], playerId: 'p', nowS: 1 });
    if (k.ok) assert.match(k.bubble, /"#!@\$%&"/);
    assert.equal(kittyLabel({ name: 'Shitty' }), 'A Heli Kitty Named #!@$%&');
    const names = {};
    const c = nameCubimal(names, 'npc_cubimal_emobear', 'Twat');
    assert.equal(c.ok, true);
    assert.equal(names.npc_cubimal_emobear, '#!@$');
  });

  it('the Butler, the Tower, notes, letters, phrases, cards, captions and Alphabet Sauce', () => {
    const b = createButlerState();
    renameButler(b, 'Sir Shithead');
    assert.equal(b.name, 'Sir #!@$%&*#');
    teachButler(b, 'owner_greeting', 'hello you bastard');
    assert.equal(b.ownerGreeting, 'hello you #!@$%&*');
    assert.equal(cleanTowerName('Fuck Tower'), '#!@$ Tower');
    const ctx = { learned: [PENMANSHIP_SKILL], quillWorking: true, playerId: 'p', paper: 1, nextId: 1 };
    const note = editNote({ id: 'n1' }, { title: 'Dear dickhead', body: 'Shit.\nLove, me' }, ctx);
    assert.equal(note.note.title, 'Dear #!@$%&*#');
    assert.equal(note.note.body, '#!@$.\nLove, me');
    assert.equal(writePaperNote([], { title: 'piss off', body: '' }, ctx).note.title, '#!@$ off');
    const box = createMailboxState();
    assert.equal(sendMail(box, { currants: 100 }, {}, { recipient: MAIL_COMPANIONS[0], text: 'you fucking legend', now: Date.now() }).ok, true);
    const sent = JSON.stringify(box);
    assert.ok(sent.includes('you #!@$%&* legend') && !sent.includes('fucking'));
    const phrases = [];
    teachPhrase(phrases, 'boo, bitch');
    assert.deepEqual(phrases, ['boo, #!@$%']);
    assert.match(read('public/js/features/seasons-feature.js'), /card\.message = filterText\(/);
    assert.equal(cleanCaption('what a  shit  view'), 'what a #!@$ view');
    assert.equal(sauceLabel('cunt'), 'Alphabet Sauce spelling #!@$');
    assert.equal(sauceStreetLine('Ada', 'fuck'), 'Ada poured an Alphabet Sauce to try and spell: #!@$');
    assert.match(read('public/js/features/newxp-feature.js'), /const name = filterText\(/, 'the solo character name');
  });

  it('names are refused, never filtered: a character at sign-up, the link and Google, and a group', () => {
    assert.equal(NAME_REFUSED, 'Please pick a different name.');
    assert.equal(characterNameProblem('Fuck Face'), NAME_REFUSED);
    assert.equal(characterNameProblem('Sh1t Lord'), NAME_REFUSED);
    assert.equal(characterNameProblem('ShitLord'), '', 'whole words only: a run-together name is not caught (Kshitij must stay fine)');
    assert.equal(characterNameProblem('Hancock'), '');
    assert.equal(characterNameProblem('Kshitij'), '');
    assert.match(characterNameProblem('x'), /^Names are 3 to 19/);
    const forms = read('public/js/account-forms.js');
    assert.equal((forms.match(/const nameProblem = characterNameProblem\(/g) || []).length, 3, 'New player, the link, Google');
    assert.equal(groupNameProblem('Bitch Club'), NAME_REFUSED);
    assert.equal(groupNameProblem('Gardeners'), '');
  });
});
