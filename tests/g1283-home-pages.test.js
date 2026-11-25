/**
 * G1283: public home pages, as Glitch's site had. Glitch's profile had "View <name>'s Home
 * Street" (the archived profile: <div class="profile-visit-home"><a class="button-tiny"
 * href="/locations/<home street>/">View Serguei's Home Street</a>); here the profile draws the
 * home street itself, so its page of the static picture went (Austin 2026-11-25: "I don't see
 * anything that static image has that the mockup home street doesn't have"): the address answers
 * 301 to the profile. A player with a Tower gets a page for it ("<Tower name>", "Owned by <name>", the cutaway of every floor, Zoom; Glitch's
 * Tower location pages). Glitch's client posted the Tower's picture 720 wide through saveHomeImg
 * after decorating, a Tower change or cultivation; here features/profiles-feature.js sends the
 * cutaway (js/home-shot-render.js renderHomeLocation, kind 'tower') at 720 wide after the same
 * changes. House interiors are never shown publicly (Glitch never did).
 *
 * - js/profiles.js: TOWER_SHOT_WIDTH, towerKeyOf, towerShotDue (pure)
 * - features/profiles-feature.js: towerTick / uploadTower / drawTower with a made-up renderer
 * - js/minn-account.js: PUT profile/tower
 * - the site (groddle-afternoon-site): the routes, the profile rule, HomePicture's 'tower'
 *   limits; on a throwaway database (tests/fixtures/profiles/home-pages.php) the Tower page
 *   answers signed out, only with a Tower, the button shows only then, the home street's address
 *   goes to the profile, and a page that is not public (below level 5, suspended) is gone
 */
import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  FAILURE_BACKOFF_MS, HOME_REFRESH_MS, HOME_SETTLE_MS, HOME_STALE_DELAY_MS, RETRY_MS, TOWER_MAX, TOWER_MAX_BYTES, TOWER_QUALITIES, TOWER_SHOT_WIDTH,
  towerKeyOf, towerShotDue,
} from '../public/js/profiles.js?v=7caf2524';
import { createMinnAccount } from '../public/js/minn-account.js?v=db081871';
import { drawTower, markHomeStale, profilesFeature, profilesState, towerTick, uploadTower } from '../public/js/features/profiles-feature.js?fresh=g1283';
import { renderHomeShot } from '../public/js/home-shot-render.js?v=b1875d75';
import { PUBLIC_HIDE, publicHidden, withPublicView } from '../public/js/public-picture.js?v=1a0b03fa';
import { GAME_DIR, HAS_SITE, SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const read = (rel) => readFileSync(join(GAME_DIR, rel), 'utf8');
const site = (rel) => readFileSync(join(SITE_DIR, rel), 'utf8');

const T0 = 1_800_000_000_000;
const TOWER = Object.freeze({ built: true, style: 'tree', floors: 3, expanding: false, name: 'Zz Spire' });

describe('the Tower picture\'s rules (js/profiles.js)', () => {
  it('is 720 wide as Glitch posted it, within the site\'s limits', () => {
    assert.equal(TOWER_SHOT_WIDTH, 720, 'saveHomeImg posted every home 720 wide (the archived Towers: 720 x 909 to 720 x 2693)');
    assert.deepEqual(TOWER_MAX, { w: 1440, h: 3600 });
    assert.deepEqual([...TOWER_QUALITIES], [0.85, 0.7]);
    assert.equal(TOWER_MAX_BYTES, 800 * 1024);
  });

  it('keys the picture by the Tower\'s style, floors, a floor going up, its name and six hours', () => {
    const k = towerKeyOf(TOWER, T0);
    assert.match(k, /^t1-tree-3-[0-9a-f]{8}-[0-9a-z]+$/);
    assert.match(k, /^[A-Za-z0-9:._-]{1,64}$/, 'a key the site takes');
    assert.equal(towerKeyOf(TOWER, T0 + 1000), k);
    for (const other of [{ style: 'quarry' }, { floors: 4 }, { expanding: true }, { name: 'Other' }]) assert.notEqual(towerKeyOf({ ...TOWER, ...other }, T0), k, JSON.stringify(other));
    assert.notEqual(towerKeyOf(TOWER, T0 + HOME_REFRESH_MS), k);
    assert.match(towerKeyOf({ built: true, style: '<script>', floors: 'x' }, T0), /^t1-script-1-/);
  });

  it('is due for a built Tower, to a site that takes one, when the site holds none or another key, or the home changed', () => {
    const key = towerKeyOf(TOWER, T0);
    const site = (tower) => ({ tower });
    assert.equal(towerShotDue({ tower: TOWER, profile: site(null), key, now: T0 }), true, 'none held');
    assert.equal(towerShotDue({ tower: TOWER, profile: site({ key: 'old' }), key, now: T0 }), true, 'another key');
    assert.equal(towerShotDue({ tower: TOWER, profile: site({ key }), key, now: T0 }), false, 'the same picture');
    assert.equal(towerShotDue({ tower: TOWER, profile: site({ key }), key, staleAt: T0 - 1000, now: T0 }), false, 'a change, but not 3 s ago yet');
    assert.equal(towerShotDue({ tower: TOWER, profile: site({ key }), key, staleAt: T0 - HOME_STALE_DELAY_MS, now: T0 }), true, '3 s after a change');
    assert.equal(towerShotDue({ tower: TOWER, profile: site(null), key, now: T0, lastTry: T0 - RETRY_MS + 1 }), false, 'once a minute at most');
    assert.equal(towerShotDue({ tower: TOWER, profile: site(null), key, now: T0, failedAt: T0 - FAILURE_BACKOFF_MS + 1 }), false, 'five minutes after a failure');
    assert.equal(towerShotDue({ tower: { ...TOWER, built: false }, profile: site(null), key, now: T0 }), false, 'no Tower');
    assert.equal(towerShotDue({ tower: TOWER, profile: { home: null }, key, now: T0 }), false, 'a site without the Tower page');
  });
});

describe('the upload hook (features/profiles-feature.js)', () => {
  /** A made-up multiplayer game at home, with a renderer and an encoder that record what they were asked. */
  function rig({ ctx = { inHome: true, owned: true, room: 'street' }, tower = TOWER, visiting = false, held = null, siteTakesTowers = true } = {}) {
    const calls = { render: [], encode: [], upload: [] };
    const data = {};
    const profile = siteTakesTowers ? { id: 7, name: 'Zz Ada', tower: held } : { id: 7, name: 'Zz Ada', home: null };
    const account = {
      profile: async () => profile,
      uploadTower: async (body) => {
        calls.upload.push(body);
        return { ...profile, tower: { key: body.key, at: 'now', url: '/players/7/tower-image?v=1' } };
      },
    };
    const engine = {
      mode: 'multiplayer',
      setData: (k, v) => { data[k] = v; },
      homeContext: () => ctx,
      query: (name) => (name === 'homeTowerInfo' ? tower : name === 'neighboursVisiting' ? visiting : null),
    };
    const opts = {
      render: async (eng, o) => {
        calls.render.push(o);
        const h = Math.round((1206 * o.width) / 720);
        return { canvas: { width: o.width, height: h }, w: o.width, h, kind: 'tower', floors: 3 };
      },
      encode: async (canvas, type, quality) => {
        calls.encode.push([canvas.width, canvas.height, type, quality]);
        return { type, b64: 'QUJD' };
      },
    };
    return { s: profilesState(account), engine, calls, data, opts };
  }

  it('sends the cutaway at 720 wide, with the Tower\'s name, once the player has settled in their own home', async () => {
    const { s, engine, calls, data, opts } = rig();
    assert.equal(towerTick(engine, s, T0, opts), null, 'just arrived');
    assert.equal(towerTick(engine, s, T0 + HOME_SETTLE_MS - 1, opts), null);
    assert.equal(await towerTick(engine, s, T0 + HOME_SETTLE_MS, opts), true);
    assert.deepEqual(calls.render, [{ kind: 'tower', width: 720, public: true }], 'every floor, 720 wide, as a public picture (renderHomeLocation)');
    assert.deepEqual(calls.encode, [[720, 1206, 'image/webp', 0.85]]);
    assert.deepEqual(calls.upload, [{ key: towerKeyOf(TOWER, T0 + HOME_SETTLE_MS), tower: 'QUJD', name: 'Zz Spire' }]);
    assert.equal(data.profileTower, 'uploaded');
    assert.deepEqual(s.tower.picture, { type: 'image/webp', w: 720, h: 1206, bytes: 3 });
    // The site holds it now: nothing more until something changes.
    assert.equal(await towerTick(engine, s, T0 + HOME_SETTLE_MS + RETRY_MS + 1, opts), false);
    assert.equal(calls.upload.length, 1);
  });

  it('sends it again 3 s after decorating, a Tower change or cultivation (homePictureStale), as saveHomeImg', async () => {
    const t = T0 + HOME_SETTLE_MS;
    for (const why of ['decorate', 'tower', 'cultivate', 'house']) {
      const { s, engine, calls, opts } = rig({ held: { key: towerKeyOf(TOWER, t) } });
      s.tower.since = T0;
      assert.equal(await towerTick(engine, s, t, opts), false, `${why}: the site holds this picture`);
      markHomeStale(s, why, t + 10);
      assert.equal(s.home.staleAt, t + 10, 'the home street\'s picture too');
      assert.equal(await towerTick(engine, s, t + 10 + HOME_STALE_DELAY_MS - 1, opts), false, `${why}: not 3 s yet`);
      assert.equal(await towerTick(engine, s, t + 10 + HOME_STALE_DELAY_MS, opts), true, `${why}: 3 s after`);
      assert.deepEqual(calls.render, [{ kind: 'tower', width: 720, public: true }]);
      assert.equal(s.tower.staleAt, 0);
    }
  });

  it('the game\'s own changes reach it: leaving Decoration or Cultivation Mode, a house change, a Tower change or rename', () => {
    const homes = read('public/js/features/homes-feature.js');
    assert.match(homes, /if \(endsEditing\) homePictureStale\(engine, endsEditing\);/);
    assert.match(homes, /homePictureStale\(engine, 'house'\);/);
    const tower = read('public/js/features/home-tower-feature.js');
    const customize = tower.slice(tower.indexOf('function applyCustomize(engine)'), tower.indexOf('function applyCustomize(engine)') + 600);
    assert.match(customize, /engine\.query\?\.\('homePictureStale', 'tower', engine\);/);
    // The style picker, the parts and the name all go through applyCustomize.
    assert.match(tower, /setTowerStyle\(tower, style\.id\);\s*\n[^\n]*\n?\s*applyCustomize\(engine\);/);
    assert.match(tower, /tower\.name = cleanTowerName\(input\.value\);\n\s*applyCustomize\(engine\);/);
    const src = read('public/js/features/profiles-feature.js');
    assert.match(src, /homePictureStale\(why, engine\) \{\n\s*if \(!state \|\| engine\?\.mode !== 'multiplayer'\) return null;\n\s*\/\/ G1283[^\n]*\n\s*markHomeStale\(state, why\);/);
    assert.match(src, /if \(!state\.tower\.busy\) towerTick\(engine, state, t, \{ clear: \(\) => viewClear\(engine\) \}\);/);
    assert.match(homes, /homeTowerInfo\(\) \{\n\s*const t = towerApi\.state\?\.\(\);\n\s*if \(!t\?\.built\) return null;/);
    assert.equal(profilesFeature.homePictureStale('decorate', { mode: 'solo' }), null, 'solo sends nothing');
  });

  it('never on a visit, outside the player\'s own home, without a Tower, to a site without Tower pages, or with something in front of the view', async () => {
    const after = T0 + HOME_SETTLE_MS;
    const cases = {
      visiting: rig({ visiting: true }),
      'not home': rig({ ctx: { inHome: false, owned: true, room: 'street' } }),
      'not theirs': rig({ ctx: { inHome: true, owned: false, room: 'street' } }),
    };
    for (const [why, { s, engine, calls, opts }] of Object.entries(cases)) {
      assert.equal(towerTick(engine, s, T0, opts), null, why);
      assert.equal(towerTick(engine, s, after, opts), null, why);
      assert.equal(s.tower.since, 0, why);
      assert.equal(calls.upload.length, 0, why);
    }
    for (const [why, r] of Object.entries({ 'no Tower': rig({ tower: null }), 'unbuilt Tower': rig({ tower: { ...TOWER, built: false } }), 'old site': rig({ siteTakesTowers: false }) })) {
      r.s.tower.since = T0;
      assert.equal(await towerTick(r.engine, r.s, after, r.opts), false, why);
      assert.equal(r.calls.render.length + r.calls.upload.length, 0, why);
    }
    const busy = rig();
    busy.s.tower.since = T0;
    assert.equal(towerTick(busy.engine, busy.s, after, { ...busy.opts, clear: () => false }), null, 'a panel or a verb in front');
  });

  it('draws the cutaway within the site\'s limits: a lower quality when large, nothing when too tall', async () => {
    const big = 'A'.repeat(Math.ceil(((TOWER_MAX_BYTES + 10) * 4) / 3));
    const asked = [];
    const shot = (w, h) => async () => ({ canvas: { width: w, height: h } });
    const enc = async (c, type, q) => { asked.push([type, q]); return { type, b64: q > 0.8 ? big : 'QUJD' }; };
    const pic = await drawTower({}, { render: shot(720, 2693), encode: enc });
    assert.deepEqual(asked, [['image/webp', 0.85], ['image/webp', 0.7]]);
    assert.deepEqual([pic.w, pic.h, pic.type], [720, 2693, 'image/webp']);
    assert.equal(await drawTower({}, { render: shot(720, TOWER_MAX.h + 1), encode: enc }), null);
    assert.equal(await drawTower({}, { render: async () => null, encode: enc }), null, 'no Tower to draw');
    const src = read('public/js/features/profiles-feature.js');
    assert.match(src, /const shot = await render\(engine, \{ kind: 'tower', width: TOWER_SHOT_WIDTH, public: true \}\);/);
    assert.match(src, /import \{ renderHomeLocation \} from '\.\.\/home-shot-render\.js\?v=[0-9a-f]{8}';/, 'the reusable render lane houseshotk landed');
  });

  it('a failed upload waits, and QA can force one (window.groddleProfiles.uploadTower)', async () => {
    const { s, engine, opts } = rig();
    s.account.uploadTower = async () => { throw Object.assign(new Error('nope'), { status: 500 }); };
    s.tower.since = T0;
    assert.equal(await uploadTower(engine, s, { now: T0, ...opts }), false);
    assert.equal(s.tower.failedAt, T0);
    assert.equal(await uploadTower(engine, s, { now: T0 + RETRY_MS + 1, ...opts }), false, 'within five minutes of a failure');
    assert.match(read('public/js/features/profiles-feature.js'), /uploadTower: \(\) => uploadTower\(engine, s, \{ force: true \}\),/);
  });
});

describe('public pictures leave out players and everything over them (js/public-picture.js)', () => {
  /**
   * A made-up stage as the game builds it (game.js: world = bgLayer, entityLayer, streetFrontLayer,
   * fxLayer; the hint's layer beside world on the stage), with the owner's Glitch, a visitor's
   * Glitch and name plate (realtime-feature makeRemote), a speech bubble and a hi-sign in fxLayer.
   */
  function stage() {
    const node = (label, children = []) => {
      const n = { label, visible: true, children };
      for (const c of children) c.parent = n;
      return n;
    };
    const player = node('player');
    const visitor = node('visitor', [node('body'), node('plate'), node('name')]);
    visitor.publicPicture = PUBLIC_HIDE;
    const house = node('house');
    const rock = node('magic-rock');
    const entityLayer = node('entities', [house, player, visitor, rock]);
    const fxLayer = node('fx', [node('speech-bubble'), node('hi-sign')]);
    const bgLayer = node('bg');
    const front = node('street-front');
    const world = node('world', [bgLayer, entityLayer, front, fxLayer]);
    const promptLayer = node('prompt-layer');
    const cover = node('street-cover');
    const st = node('stage', [world, promptLayer, cover]);
    const engine = { stage: st, entityLayer, fxLayer, player, viewAt: (frame, fn) => fn(), worldW: 3000 };
    const shown = () => Object.fromEntries([player, visitor, fxLayer, promptLayer, cover, house, rock, bgLayer, front, world].map((n) => [n.label, n.visible]));
    return { engine, shown, nodes: { player, visitor, fxLayer, promptLayer, cover, house, rock } };
  }

  it('hides the owner, other players with their name plates, the bubbles and the hint for one draw, then puts them back', () => {
    const { engine, shown } = stage();
    const during = withPublicView(engine, () => shown());
    assert.deepEqual(during, { player: false, visitor: false, fx: false, 'prompt-layer': false, 'street-cover': false, house: true, 'magic-rock': true, bg: true, 'street-front': true, world: true });
    assert.ok(Object.values(shown()).every(Boolean), 'everything back after');
    assert.throws(() => withPublicView(engine, () => { throw new Error('draw failed'); }), /draw failed/);
    assert.ok(Object.values(shown()).every(Boolean), 'back after a failed draw too');
  });

  it('leaves what was already hidden hidden', () => {
    const { engine, nodes } = stage();
    nodes.cover.visible = false;
    assert.ok(!publicHidden(engine).includes(nodes.cover));
    withPublicView(engine, () => null);
    assert.equal(nodes.cover.visible, false);
  });

  it('an upload render carries no players, bubbles or name plates; the camera\'s whole-house Snap keeps the screen', async () => {
    for (const isPublic of [true, false]) {
      const { engine, shown } = stage();
      const seen = [];
      const io = {
        read: (container, o) => { seen.push({ ...shown(), live: container === engine.entityLayer.parent }); return { width: Math.round(o.width * o.resolution), height: Math.round(o.height * o.resolution) }; },
        canvas: (w, h) => ({ width: w, height: h, getContext: () => ({ fillRect() {}, drawImage() {} }) }),
      };
      // The home street (the live scene) and a Tower whose floor the player stands on (live) above one drawn from the home.
      await renderHomeShot(engine, { kind: 'street', frame: { x: 0, y: 0, w: 1680, h: 720 } }, { io, width: 1680, public: isPublic, timeoutMs: 1 });
      const floor = (index, extra) => ({ index, top: 0, bottom: 300, bound: 0, pitch: 0, width: 1178, x0: 0, ...extra });
      await renderHomeShot(engine, { kind: 'tower', width: 1178, floors: [floor(0, { live: true }), floor(1, { build: () => ({ destroy() {}, children: [] }) })] }, { io, width: 720, public: isPublic, timeoutMs: 1 });
      // Three reads: the street, then the Tower's floors top first; the floor built from the home has no players in it.
      assert.equal(seen.length, 3);
      const live = seen.filter((s) => s.live);
      assert.equal(live.length, 2);
      for (const s of live) {
        for (const k of ['player', 'visitor', 'fx', 'prompt-layer', 'street-cover']) assert.equal(s[k], !isPublic, `${isPublic ? 'upload' : 'Snap'}: ${k}`);
        assert.equal(s.house, true);
      }
      assert.ok(Object.values(shown()).every(Boolean));
    }
  });

  it('every upload path asks for it: the home street picture, the Tower cutaway; the visitor is marked; the Snap does not', () => {
    const prof = read('public/js/features/profiles-feature.js');
    assert.match(prof, /const view = withPublicView\(engine, \(\) => engine\.snapshotView\?\.\(\{ resolution: HOME_RESOLUTION, \.\.\.\(frame \? \{ frame \} : \{\}\) \}\)\);/);
    assert.match(prof, /render\(engine, \{ kind: 'tower', width: TOWER_SHOT_WIDTH, public: true \}\)/);
    assert.match(read('public/js/features/realtime-feature.js'), /root\.addChild\(body, plate, name\);\n[^\n]*\n\s*root\.publicPicture = PUBLIC_HIDE;/);
    const snaps = read('public/js/features/snaps-feature.js');
    assert.match(snaps, /renderHomeLocation\(engine, \{ kind: st\.kind, resolution:/);
    assert.doesNotMatch(snaps, /public: true/, 'a Snap is private until its owner shares it, and keeps what is on screen');
    // The speech bubbles, hi-signs and floating text are all in fxLayer.
    assert.match(read('public/game.js'), /speechBubbles\.push\(bubble\);\n\s*fxLayer\.addChild\(bubble\);/);
    assert.match(read('public/js/features/hi-signs-feature.js'), /fxLayer/);
  });
});

describe('the Tower call (js/minn-account.js)', () => {
  it('PUTs the cutaway, its key and the Tower\'s name to groddle/v1/profile/tower', async () => {
    const calls = [];
    const fetch = async (url, init = {}) => {
      calls.push({ url, method: init.method, body: JSON.parse(init.body) });
      return { status: 200, ok: true, headers: new Map(), json: async () => ({ tower: null }), text: async () => '{}' };
    };
    const account = createMinnAccount({ baseUri: 'https://groddle.localhost/play/online/', fetch, nonce: '0123456789' });
    await account.uploadTower({ key: 't1-x', tower: 'QUJD', name: 'Zz Spire' });
    assert.deepEqual(calls, [{ url: 'https://groddle.localhost/play/online/wp-json/groddle/v1/profile/tower', method: 'PUT', body: { key: 't1-x', tower: 'QUJD', name: 'Zz Spire' } }]);
  });
});

describe('the site side (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  it('keeps the Tower picture in its own slot, beside the home street\'s, with a schema version moved on', () => {
    const manifest = JSON.parse(site('minn.json'));
    const cols = manifest.tables.groddle_profiles.join('\n');
    for (const c of ['tower mediumblob NULL', "tower_key varchar(64) NOT NULL DEFAULT ''", 'tower_at datetime NULL', "tower_type varchar(16) NOT NULL DEFAULT 'image/png'", 'tower_w smallint(5) unsigned NOT NULL DEFAULT 0', 'tower_h smallint(5) unsigned NOT NULL DEFAULT 0', "tower_name varchar(64) NOT NULL DEFAULT ''"]) {
      assert.ok(cols.includes(c), c);
    }
    assert.notEqual(manifest.version, '0.5.59');
  });

  it('the game and the site agree on the Tower picture\'s limits (HomePicture \'tower\')', () => {
    const hp = site('src/HomePicture.php');
    assert.match(hp, /public const TOWER_MAX_W = 1440;\n\s+public const TOWER_MAX_H = 3600;/);
    assert.equal(Number(/public const TOWER_MAX_BYTES = (\d+) \* 1024;/.exec(hp)[1]) * 1024, TOWER_MAX_BYTES);
    assert.equal(TOWER_MAX.w, 1440);
    assert.match(hp, /'tower' => \[self::TOWER_MIN_W, self::MIN_H, self::TOWER_MAX_W, self::TOWER_MAX_H, self::TOWER_MAX_BYTES, false, 'a Tower picture'\]/, 'no phone copy');
    const p = site('src/Profiles.php');
    assert.match(p, /\$tower = HomePicture::accept\(\$body\['tower'\] \?\? null, 'tower'\);/);
    assert.match(p, /'tower' => self::picture\(\$character\['id'\], 'tower-image', \$row\['tower_key'\] \?\? null, \$row\['tower_at'\] \?\? null\),/);
  });

  it('the pages are public routes, each behind the profile\'s own rule (who())', () => {
    const pages = site('src/PlayerPages.php');
    assert.match(pages, /#\[Route\(Method::Get, '\/players\/\{slug:\[a-z0-9\]\[a-z0-9\.-\]\*\}\/\{place:home-street\|tower\}\/', policy: new Policy\(Access::Public\)\)\]/);
    const place = pages.slice(pages.indexOf('public function place('), pages.indexOf('public static function towerTitle('));
    assert.match(place, /\$who = \$this->who\(\$request, \$id, \$canonical, ''\);/);
    assert.match(place, /if \(!is_string\(\$at\) \|\| \$at === ''\) \{\n\s+throw new RouteMiss\(\);/, 'no picture, no page');
    assert.doesNotMatch(place, /interior|HOME_INTERIOR/i, 'never a house\'s inside');
    assert.doesNotMatch(pages, /user_email|user_login|display_name|->email\b/);
    assert.match(pages, /'tower-image' => \['tower', 'tower_at', 'tower_type'\],/);
  });

  it('PHP lint', { skip: spawnSync('/usr/bin/php', ['-v']).status !== 0 && 'no /usr/bin/php' }, () => {
    for (const f of ['src/PlayerPages.php', 'src/Profiles.php', 'src/HomePicture.php', 'src/HomeLayout.php', join(GAME_DIR, 'tests/fixtures/profiles/home-pages.php')]) {
      const r = spawnSync('/usr/bin/php', ['-l', f.startsWith('/') ? f : join(SITE_DIR, f)], { encoding: 'utf8' });
      assert.equal(r.status, 0, `${f}: ${r.stdout}${r.stderr}`);
    }
  });
});

function mysql() {
  const env = String(process.env.GRODDLE_TEST_MYSQL || '').trim();
  if (env) {
    const [host, user, ...pass] = env.split(/\s+/);
    return { host, user, pass: pass.join(' ') };
  }
  const cfg = join(homedir(), 'Cove/Sites/groddle.localhost/public/wp-config.php');
  if (!existsSync(cfg)) return null;
  const text = readFileSync(cfg, 'utf8');
  const def = (k) => text.match(new RegExp(`define\\(\\s*'${k}',\\s*'([^']*)'`))?.[1];
  const host = def('DB_HOST');
  const user = def('DB_USER');
  return host && user ? { host, user, pass: def('DB_PASSWORD') || '' } : null;
}
const engineDir = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const db = mysql();
const reachable = db && hasPhp && spawnSync('php', ['-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const gdArgs = hasPhp && spawnSync('php', ['-r', 'exit(function_exists("imagecreatetruecolor") ? 0 : 1);']).status !== 0 ? ['-d', 'extension=gd'] : [];
const skipDb = (!HAS_SITE && 'no site repo')
  || (!hasPhp && 'no php')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('the public home pages on a throwaway database', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync('php', [...gdArgs, join(GAME_DIR, 'tests/fixtures/profiles/home-pages.php'), engineDir, SITE_DIR, join(GAME_DIR, 'public'), db.host, db.user, db.pass], { timeout: 90000 }).toString());
  });

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.equal(r.dropped, true);
  });

  it('a Tower\'s cutaway is kept 720 x 2693 (nine floors) as GD writes it, with its name cleaned; too tall or too long a name is refused', (t) => {
    if (!r.gd) return t.skip('no GD in this PHP');
    assert.equal(r.upload.tower.status, 200);
    assert.match(r.upload.tower.answer.url, /^\/players\/920\/tower-image\?v=\d+$/);
    assert.deepEqual([r.upload['tower row'].tower_w, r.upload['tower row'].tower_h, r.upload['tower row'].tower_key], [720, 2693, 't1-base-9-0-x']);
    assert.equal(r.upload['tower row'].tower_name, 'Zz <b>Spire</b>', 'a control character dropped; kept as text and escaped on the page');
    assert.equal(r.upload['too tall'], 'groddle_profile_size');
    assert.equal(r.upload['name too long'], 'groddle_profile_tower_name');
    assert.equal(r.upload['signed out'], 'groddle_profile_none');
    assert.equal(r['answer bea'], 'tower:null', 'the answer names tower, so the game knows the site takes one');
  });

  it('the home street\'s old address answers 301 to the profile (the profile draws the home street; Austin 2026-11-25)', () => {
    for (const [k, slug] of [['ada signed out', 'zz-ada'], ['ada other', 'zz-ada'], ['bea signed out', 'zz-bea'], ['eve signed out', 'zz-eve'], ['cy signed out', 'zz-cy'], ['cy owner', 'zz-cy'], ['dee signed out', 'zz-dee']]) {
      assert.deepEqual([r.street[k].status, r.street[k].location], [301, `/players/${slug}/`], k);
    }
    assert.equal(r.street.nobody.status, 404);
    assert.deepEqual(r['bare street'], [301, '/players/zz-ada/'], 'without the slash too, in one step');
    for (const v of Object.values(r.street)) assert.equal(v.leaks, false, 'no email, login or id');
  });

  it('the Tower\'s page answers signed out: its name, Owned by, the cutaway framed with Zoom', (t) => {
    if (!r.gd) return t.skip('no GD in this PHP');
    const p = r.tower['ada signed out'];
    assert.equal(p.status, 200);
    assert.equal(p.h1, 'Zz &lt;b&gt;Spire&lt;/b&gt;', 'the name escaped');
    assert.deepEqual(p.owned, ['/players/zz-ada/', 'Zz Ada']);
    assert.equal(p.img, '/players/920/tower-image?v=T');
    assert.deepEqual(p.zoom, ['/players/zz-ada/tower/?zoom=1#tower', 'Zoom']);
    assert.equal(p.framed, true);
    assert.deepEqual(r.tower['ada zoomed'].zoom, ['/players/zz-ada/tower/', 'Zoom out']);
    assert.equal(r.tower['ada zoomed'].framed, false, 'every floor at once');
    assert.equal(r.tower['cy owner short'], true, 'two floors need no Zoom');
    assert.equal(r.tower['cy owner'].h1, 'Zz Cy&#039;s Tower', 'no name: "<owner>\'s Tower", as Glitch named one');
    for (const v of Object.values(r.tower)) if (typeof v === 'object') assert.equal(v.interior, false);
  });

  it('the Tower page is only for players with a Tower', () => {
    assert.equal(r.tower['bea signed out'].status, 404);
    assert.equal(r.tower['eve signed out'].status, 404);
    assert.equal(r.street.nobody.status, 404);
    assert.deepEqual(r.bare, [301, '/players/zz-ada/tower/']);
  });

  it('the profile shows the Tower button only with a Tower, and no home street button (it draws the home street)', (t) => {
    if (!r.gd) return t.skip('no GD in this PHP');
    assert.deepEqual(r.profile.ada, { status: 200, links: [['/players/zz-ada/tower/', 'View Zz <b>Spire</b>']] });
    assert.deepEqual(r.profile.bea, { status: 200, links: [] });
    assert.deepEqual(r.profile.eve, { status: 200, links: [] });
  });

  it('privacy: a page that is not public (below level 5) is its owner\'s alone, unindexed; a suspended player\'s is gone', (t) => {
    if (!r.gd) return t.skip('no GD in this PHP');
    for (const k of ['cy signed out', 'dee signed out']) assert.equal(r.tower[k].status, 404, k);
    for (const p of [r.tower['cy owner']]) {
      assert.equal(p.status, 200);
      assert.equal(p.private, true, 'told only they see it');
      assert.equal(p.noindex, true);
      assert.notEqual(p.ogImage, 'https://groddle.test/players/922/tower-image?v=T');
    }
    assert.deepEqual(r.image['ada tower signed out'], [200, 'image/webp']);
    assert.equal(r.image['bea tower'][0], 404);
    assert.equal(r.image['cy tower signed out'][0], 404);
    assert.equal(r.image['cy tower owner'][0], 200);
    assert.equal(r.image['dee tower'][0], 404);
  });
});
