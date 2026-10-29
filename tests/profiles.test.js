/**
 * Player profiles (register G338): js/profiles.js (the pure rules),
 * features/profiles-feature.js (multiplayer only, the Account panel's Your
 * profile), the minn-account.js profile calls, and the site side
 * (groddle-afternoon-site src/Profiles.php, ProfilePng.php, PlayerPages.php:
 * the routes, the table, escaping, what is never shown), read from the site
 * repo like tests/minn-account.test.js does; ProfilePng and the pure parts of
 * Profiles run through php when the engine is on this machine.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import {
  AVATAR_STILL, AVATAR_TILE, FAILURE_BACKOFF_MS, HOME_MAX_BYTES, HOME_REFRESH_MS, PROFILE_ABOUT_MAX, PROFILE_COPY, RETRY_MS,
  aboutCounter, aboutLength, avatarKeyOf, base64Bytes, cleanAbout, homeKeyOf, pngBase64, profileSlug, shortHash, shouldUpload, stillTransform,
} from '../public/js/profiles.js?v=play-1';
import { createMinnAccount } from '../public/js/minn-account.js?v=nbhome-10';
import { FEATURES } from '../public/js/features/index.js?v=registry-277';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { loadContentCatalogsFromDir, getSkillCatalog } from '../public/js/content-catalogs.js?v=g403-1';
import { skillTitle } from '../public/js/skill-tree.js?v=g403-1';
import { skillArtFor } from '../public/js/familiar.js?v=g434-1';
import { CARD_ART_LAYERS } from '../public/js/imagination-data.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const site = (rel) => readFileSync(join(SITE_DIR, rel), 'utf8');

describe('profile rules (js/profiles.js)', () => {
  it('counts and cleans a description as the site does', () => {
    assert.equal(cleanAbout('  Hi\r\nthere\u0007\n\n\n\nyou  '), 'Hi\nthere\n\nyou');
    assert.equal(aboutLength('é'.repeat(10)), 10);
    assert.equal(aboutLength('🙂🙂'), 2, 'code points, as mb_strlen counts');
    assert.equal(PROFILE_ABOUT_MAX, 500);
    assert.deepEqual(aboutCounter('a'.repeat(501)), { n: 501, max: 500, over: true, label: '501 / 500' });
    assert.equal(aboutCounter('abc').over, false);
  });

  it('makes the same paths as the site (Profiles::slug)', () => {
    assert.deepEqual(['Zz Prof A 12', 'bo-peep', 'Bo_ Peep', '-x-', 'Review Glitch'].map(profileSlug), ['zz-prof-a-12', 'bo-peep', 'bo-peep', 'x', 'review-glitch']);
  });

  it('keys pictures by what they were made from', () => {
    assert.match(shortHash('abc'), /^[0-9a-f]{8}$/);
    assert.notEqual(avatarKeyOf('hair=a'), avatarKeyOf('hair=b'));
    assert.equal(avatarKeyOf('x'), avatarKeyOf('x'));
    assert.match(avatarKeyOf('hair=a|skin={}'), /^[A-Za-z0-9:._-]{1,64}$/, 'a key the site takes');
    const t = 1_800_000_000_000;
    assert.equal(homeKeyOf('meadow', t), homeKeyOf('meadow', t + 1000));
    assert.notEqual(homeKeyOf('meadow', t), homeKeyOf('firebog', t));
    assert.notEqual(homeKeyOf('meadow', t), homeKeyOf('meadow', t + HOME_REFRESH_MS));
    assert.match(homeKeyOf('<script>', t), /^h1-script-/);
    assert.match(homeKeyOf('', t), /^h1-meadow-/);
  });

  it('uploads only when the site holds another picture, throttled', () => {
    const now = 10_000_000;
    assert.equal(shouldUpload({ held: null, key: 'k', now }), true, 'none yet');
    assert.equal(shouldUpload({ held: { key: 'k' }, key: 'k', now }), false, 'same look');
    assert.equal(shouldUpload({ held: { key: 'j' }, key: 'k', now }), true, 'new look');
    assert.equal(shouldUpload({ held: null, key: 'k', now, lastTry: now - RETRY_MS + 1 }), false, 'one try a minute');
    assert.equal(shouldUpload({ held: null, key: 'k', now, failedAt: now - FAILURE_BACKOFF_MS + 1 }), false, 'backs off after a failure');
    assert.equal(shouldUpload({ held: null, key: '', now }), false);
  });

  it('draws the still as PNGUtil did: 172x248 at scale 1.76 facing left, feet on the bottom, the tile at 100/172', () => {
    assert.deepEqual([AVATAR_STILL.w, AVATAR_STILL.h, AVATAR_STILL.scale], [172, 248, 1.76]);
    assert.deepEqual([AVATAR_TILE.w, AVATAR_TILE.h], [100, Math.round(248 * 100 / 172)]);
    const [a, , , d, tx, ty] = stillTransform([-30, -110, 30, 0]);
    assert.equal(d, 1.76);
    assert.equal(a, -1.76, 'flipped');
    assert.equal(tx, 86);
    assert.equal(ty, 248 - 4);
    const tall = stillTransform([-30, -200, 30, 0]);
    assert.ok(tall[3] < 1.76 && -200 * tall[3] + tall[5] >= 4 - 1e-9, 'a tall hat shrinks to fit');
    const x2 = stillTransform([-30, -110, 30, 0], { resolution: 2 });
    assert.deepEqual([x2[3], x2[4], x2[5]], [3.52, 172, 496 - 8]);
  });

  it('reads base64 out of a PNG data URL only', () => {
    assert.equal(pngBase64('data:image/png;base64,QUJD'), 'QUJD');
    assert.equal(pngBase64('data:image/jpeg;base64,QUJD'), '');
    assert.equal(base64Bytes('QUJD'), 3);
    assert.equal(base64Bytes('QUI='), 2);
    assert.equal(HOME_MAX_BYTES, 600 * 1024);
  });

  it('copy is short and plain', () => {
    for (const v of Object.values(PROFILE_COPY)) {
      const text = typeof v === 'function' ? v(500) : v;
      assert.doesNotMatch(text, /—/, 'no em-dashes');
    }
  });
});

describe('profile calls (js/minn-account.js)', () => {
  function fakeFetch(answers) {
    const calls = [];
    const fn = async (url, init = {}) => {
      calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
      const a = answers.shift() || { status: 200, body: {} };
      return { status: a.status, ok: a.status >= 200 && a.status < 300, headers: new Map(), json: async () => a.body, text: async () => JSON.stringify(a.body) };
    };
    return { fn, calls };
  }

  it('reads, writes the description and uploads both pictures to groddle/v1/profile', async () => {
    const profile = { id: 7, name: 'Zz', url: '/players/zz/', about: '', aboutMax: 500, avatar: null, home: null };
    const { fn, calls } = fakeFetch([{ status: 200, body: profile }, { status: 200, body: profile }, { status: 200, body: profile }, { status: 200, body: profile }]);
    const account = createMinnAccount({ baseUri: 'https://groddle.localhost/play/online/', fetch: fn, nonce: '0123456789' });
    assert.deepEqual(await account.profile(), profile);
    await account.saveAbout('Hello');
    await account.uploadAvatar({ key: 'a1-x', avatar: 'QUJD', tile: 'QUJD' });
    await account.uploadHome({ key: 'h1-x', home: 'QUJD' });
    assert.deepEqual(calls.map((c) => `${c.method} ${c.url.replace('https://groddle.localhost/play/online/wp-json/groddle/v1/', '')}`), ['GET profile', 'PUT profile', 'PUT profile/avatar', 'PUT profile/home']);
    assert.deepEqual(calls[1].body, { about: 'Hello' });
    assert.deepEqual(calls[2].body, { key: 'a1-x', avatar: 'QUJD', tile: 'QUJD' });
    assert.equal(calls[0].headers['X-WP-Nonce'], '0123456789');
  });

  it('a refusal throws with the site\'s words', async () => {
    const { fn } = fakeFetch([{ status: 400, body: { code: 'groddle_profile_about', message: 'Descriptions are at most 500 characters.' } }]);
    const account = createMinnAccount({ baseUri: 'https://groddle.localhost/', fetch: fn, nonce: '0123456789' });
    await assert.rejects(account.saveAbout('x'), (err) => err.status === 400 && err.code === 'groddle_profile_about' && /500 characters/.test(err.message));
  });
});

describe('the profiles feature', () => {
  const src = read('public/js/features/profiles-feature.js');

  it('is registered before the account feature that asks it', () => {
    const ids = FEATURES.map((f) => f.id);
    assert.ok(ids.includes('profiles'));
    assert.ok(ids.indexOf('profiles') < ids.indexOf('account-backup'));
    assert.match(read('public/js/features/index.js'), /profiles-feature\.js\?v=play-12/);
  });

  it('does nothing in solo: no state, no account section, no upload', () => {
    const f = FEATURES.find((x) => x.id === 'profiles');
    const engine = { mode: 'solo', started: true, setData() {}, homeContext: () => ({ inHome: true, room: 'street' }) };
    f.init(engine);
    f.onTick(16, 0, engine);
    assert.equal(f.accountProfile({}, engine), null);
    assert.match(src, /init\(engine\) \{\n\s*if \(engine\.mode !== 'multiplayer'/);
    assert.match(src, /onTick\(dtMs, now, engine\) \{\n\s*if \(!state \|\| engine\.mode !== 'multiplayer'/);
  });

  it('the account panel asks for the section and drops the host when nobody answers', () => {
    const acct = read('public/js/features/account-backup-feature.js');
    assert.match(acct, /if \(!engine\.query\?\.\('accountProfile', profile, engine\)\) profile\.remove\(\);/);
  });

  it('draws with the game\'s own compositor and uploads through minn-account', () => {
    assert.match(src, /from '\.\.\/avatar-compositor\.js'/, 'the same module instance game.js uses');
    assert.match(src, /s\.account\.uploadAvatar\(pictures\)/);
    assert.match(src, /s\.account\.uploadHome\(\{ key, home \}\)/);
    assert.match(src, /engine\.snapshotView\?\.\(/);
    assert.match(read('public/game.js'), /snapshotView\(\{ resolution = 1 \} = \{\}\) \{\n\s*if \(!app\?\.renderer \|\| !app\.stage\) return null;/);
  });

  it('sets the description as text and links the page in a new tab', () => {
    assert.doesNotMatch(src, /innerHTML/, 'nothing the player wrote is parsed as HTML');
    assert.match(src, /target: '_blank', rel: 'noopener'/);
  });
});

describe('the site side (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  it('declares groddle_profiles and bumps the version', () => {
    const manifest = JSON.parse(site('minn.json'));
    const cols = manifest.tables.groddle_profiles.join('\n');
    for (const c of ['user_id bigint(20) unsigned NOT NULL', "about varchar(500) NOT NULL DEFAULT ''", 'avatar mediumblob NULL', 'tile mediumblob NULL', 'home mediumblob NULL', 'avatar_key varchar(64)', 'home_key varchar(64)', 'updated_at datetime NOT NULL', 'PRIMARY KEY  (user_id)']) {
      assert.ok(cols.includes(c), c);
    }
  });

  it('registers the REST routes signed-in and the pages public', () => {
    const ext = site('src/Extension.php');
    assert.match(ext, /new Profiles\(\$minn\)[,)]/);
    assert.match(ext, /\$minn->routes\(new PlayerPages\(\$minn, \$root\)\);/);
    const routes = (f) => [...site(`src/${f}`).matchAll(/#\[Route\(Method::(\w+), '([^']+)', policy: new Policy\(Access::(\w+)\)\)\]/g)].map((m) => `${m[1]} ${m[2]} ${m[3]}`).sort();
    assert.deepEqual(routes('Profiles.php'), [
      'Get /groddle/v1/profile SignedIn',
      'Put /groddle/v1/profile SignedIn',
      'Put /groddle/v1/profile/avatar SignedIn',
      'Put /groddle/v1/profile/home SignedIn',
    ]);
    assert.deepEqual(routes('PlayerPages.php'), [
      'Get /players Public',
      'Get /players/ Public',
      'Get /players/{id:\\d+}/{kind:avatar|tile|home} Public',
      'Get /players/{slug:[a-z0-9][a-z0-9.-]*} Public',
      'Get /players/{slug:[a-z0-9][a-z0-9.-]*}/ Public',
      'Get /players/{slug:[a-z0-9][a-z0-9.-]*}/{tab:skills|achievements|buddies} Public',
      'Get /players/{slug:[a-z0-9][a-z0-9.-]*}/{tab:skills|achievements|buddies}/ Public',
    ]);
  });

  it('writes the caller\'s own row only, never a user from the request', () => {
    const p = site('src/Profiles.php');
    assert.match(p, /\$id = \$this->minn->reader->userId;/);
    assert.doesNotMatch(p, /json\(\)\['(?:id|user|user_id)'\]/);
    for (const m of p.matchAll(/UPDATE ' \. \$db->table\(self::TABLE\) \. '[^']*'/g)) assert.match(m[0], /WHERE user_id = \?/);
    assert.match(p, /FROM_BASE64\(\?\)/, 'blobs through text the database door takes');
  });

  it('serves pictures as PNG with nosniff and a versioned cache', () => {
    const pages = site('src/PlayerPages.php');
    assert.match(pages, /'Content-Type' => 'image\/png'/);
    assert.match(pages, /'X-Content-Type-Options' => 'nosniff'/);
    assert.match(pages, /\$request->query\('v'\) === \$stamp \? 'public, max-age=31536000, immutable'/);
  });

  it('escapes what players wrote and never shows an email or a username', () => {
    const pages = site('src/PlayerPages.php');
    assert.match(pages, /nl2br\(Html::esc\(\$about\), false\)/);
    assert.match(pages, /Html::esc\(\$name\)/);
    assert.doesNotMatch(pages, /user_email|user_login|display_name|->email\b/);
    assert.doesNotMatch(site('src/Profiles.php'), /user_email|user_login|->email\b/);
  });

  it('draws the page in the site\'s look: the header menu with the theme button, the stylesheets, the footer', () => {
    const pages = site('src/PlayerPages.php');
    assert.match(pages, /SiteNav::nav\(SiteNav::links\(\$this->minn, 0\), \$path\)/);
    assert.match(pages, /Extension::head\(\)/);
    assert.match(site('src/Extension.php'), /'<script src="\/site\/theme\.js"><\/script>'/);
    assert.match(site('style.css'), /\.players-grid \{/);
  });

  it('runs no WordPress function (the engine\'s classes only)', () => {
    for (const f of ['Profiles.php', 'ProfilePng.php', 'PlayerPages.php']) {
      assert.doesNotMatch(site(`src/${f}`), /\b(?:get_option|wp_[a-z_]+|current_user_can|get_current_user_id|esc_[a-z]+|\$wpdb)\s*\(/, f);
    }
  });

  const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
  it('ProfilePng takes well formed PNGs within limits and refuses the rest; Profiles cleans text (php)', { skip: !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)' }, () => {
    let out;
    try {
      out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/profiles/profile-png.php'), engine, SITE_DIR], { encoding: 'utf8' }));
    } catch (err) {
      if (err.code === 'ENOENT') return; // no php here
      throw err;
    }
    assert.equal(out.avatar, 'ok:344x496:344x496:png');
    assert.equal(out['avatar data url'], 'ok:344x496:344x496:png');
    assert.equal(out.tile, 'ok:200x288:200x288:png');
    assert.equal(out.home, 'ok:960x408:960x408:png');
    for (const k of ['jpeg data url', 'jpeg bytes', 'html']) assert.equal(out[k], 'groddle_profile_image:415', k);
    for (const k of ['not a string', 'not base64', 'bad crc', 'cut short', 'bytes after IEND']) assert.equal(out[k], 'groddle_profile_image:400', k);
    for (const k of ['too wide', 'too small', 'home too tall']) assert.equal(out[k], 'groddle_profile_size:400', k);
    assert.equal(out['unknown kind'], 'groddle_profile_kind:400');
    assert.equal(out['too many bytes'], 'groddle_profile_too_large:413');
    if (out.gd === 'yes') assert.equal(out['a text chunk is dropped by the re-encode'], 'ok:dropped');
    assert.equal(out['about trims and keeps lines'], 'ok:Hello\nthere\n\nfriend');
    assert.equal(out['about 500'], 'ok:500');
    for (const k of ['about 501', 'about not text', 'about bad utf8']) assert.equal(out[k], 'groddle_profile_about:400', k);
    assert.equal(out.slug, 'zz-prof-a-12,bo-peep,bo-peep,x,review-glitch');
    // No .png: Kinsta's nginx answers a missing .png file itself, so PHP never saw those (2026-10-29).
    assert.equal(out['image url'], '/players/57/tile?v=1793037600');
  });
});

describe('only characters from level 5 are public (Austin 2026-10-26)', () => {
  it('the grid lists level 5 and up; a lower page and its pictures are the owner\'s alone', { skip: skipWithoutSite }, () => {
    const prof = readFileSync(join(SITE_DIR, 'src/Profiles.php'), 'utf8');
    const pages = readFileSync(join(SITE_DIR, 'src/PlayerPages.php'), 'utf8');
    assert.match(prof, /public const LISTED_LEVEL = 5;/);
    assert.match(pages, /AND " \. Profiles::levelSql\('s'\) \. ' >= ' \. Profiles::LISTED_LEVEL;/);
    assert.match(pages, /if \(\$facts\['level'\] < Profiles::LISTED_LEVEL && !\$own\) \{\n\s+throw new RouteMiss\(\);/);
    assert.match(pages, /if \(!\$listed && \$this->minn->reader->userId !== \(int\) \$id\) \{\n\s+throw new RouteMiss\(\);/);
    assert.match(pages, /!\$listed \? 'private, no-store'/);
  });
});


describe('a profile\'s pages: skills, badges and buddies (G338, Glitch\'s /profiles/<tsid>/skills/, achievements/, friends/)', { skip: skipWithoutSite }, () => {
  const pages = () => readFileSync(join(SITE_DIR, 'src/PlayerPages.php'), 'utf8');

  it('every page of a profile goes through one door with the level rule', () => {
    const src = pages();
    assert.match(src, /private const TABS = \['' => 'Profile', 'skills' => 'Skills', 'achievements' => 'Badges', 'buddies' => 'Buddies'\];/);
    assert.match(src, /public function profile\(Request \$request, string \$slug\): Response\n\s+\{\n\s+return \$this->tab\(\$request, \$slug, ''\);/);
    assert.match(src, /public function subpage\(Request \$request, string \$slug, string \$tab\): Response\n\s+\{\n\s+return \$this->tab\(\$request, \$slug, \$tab\);/);
    assert.equal([...src.matchAll(/Profiles::LISTED_LEVEL && !\$own\)/g)].length, 1, 'one level check, shared by all four pages');
  });

  it('lists only buddies who are public, and never one who ignores the player or whom they ignore', () => {
    const src = pages();
    const fn = src.slice(src.indexOf('private function buddies('), src.indexOf('private function skillCatalog('));
    assert.match(fn, /JOIN ' \. \$db->table\(MultiplayerSave::TABLE\) \. ' s ON s\.user_id = b\.buddy_id AND ' \. Profiles::levelSql\('s'\) \. ' >= ' \. Profiles::LISTED_LEVEL/);
    assert.match(fn, /JOIN " \. \$db->table\(Characters::TABLE\) \. ' c ON c\.user_id = b\.buddy_id/);
    assert.match(fn, /NOT EXISTS \(SELECT 1 FROM \{\$ignores\} i WHERE \(i\.user_id = b\.buddy_id AND i\.ignored_id = b\.user_id\) OR \(i\.user_id = b\.user_id AND i\.ignored_id = b\.buddy_id\)\)/);
    assert.match(fn, /WHERE b\.user_id = \?/);
    assert.doesNotMatch(fn, /user_email|user_login|display_name/);
  });

  it('shows the CC0 art the game already ships: badge pictures and skill card art', () => {
    const src = pages();
    assert.match(src, /<img src="\/assets\/badges\/' \. Html::attr\(\$badge\) \. '\.png"/);
    assert.match(src, /"\/assets\/imagination\/cards\/\{\$art\}\.svg"/);
    assert.match(src, /Html::esc\(\$title\)/);
    assert.match(readFileSync(join(SITE_DIR, 'style.css'), 'utf8'), /\.profile-skills \{/);
  });

  const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
  it('names and pictures each skill as the game does (php against js/skill-tree.js skillTitle, js/familiar.js skillArtFor)', { skip: !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)' }, async () => {
    let out;
    try {
      out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/profiles/profile-pages.php'), engine, SITE_DIR, join(root, 'public')], { encoding: 'utf8' }));
    } catch (err) {
      if (err.code === 'ENOENT') return; // no php here
      throw err;
    }
    await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
    const catalog = getSkillCatalog();
    assert.ok(Object.keys(catalog).length > 100);
    for (const [id, def] of Object.entries(catalog)) {
      assert.deepEqual(out.skills[id], [skillTitle(def), `/${skillArtFor(id, CARD_ART_LAYERS)}`], id);
    }
    assert.equal(out.skills.not_a_skill_1, undefined, 'a skill the game does not know is left out');
    assert.deepEqual(out.ids, ['refining_1', 'mining_1', 'alchemy_1'], 'newest first, once each, only well formed ids');
    assert.deepEqual(out['ids not a list'], []);
  });
});
