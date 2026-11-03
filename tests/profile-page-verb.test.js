/**
 * Open Profile Page (Austin 2026-11-03, right-click audit decision 2): another player's menu, by a
 * left or a right click on their Glitch, starts with the client's "Open Profile Page ..." row
 * (glitch-client InteractionMenuController.as 573-578, sort_on -10). It opens their page on the
 * site in a new tab: /players/<slug>.<id>/, which the site sends on to the page's own address
 * (PlayerPages.php find), and says why when they have no public page (below level 5 the site
 * answers 404: Profiles::LISTED_LEVEL). Multiplayer only.
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROFILE_LISTED_LEVEL, PROFILE_PAGE_COPY, PROFILE_PAGE_VERB, profilePagePath, profilePageVerb, profileSlug } from '../public/js/profiles.js?v=06d5732b';
import { lookUpPlayersHere, profilesFeature } from '../public/js/features/profiles-feature.js?v=e13a1145';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete globalThis.window;
  delete globalThis.document;
});

describe('the row (js/profiles.js)', () => {
  it('names the character exactly: slug and id, as the site\'s find() takes it', () => {
    assert.equal(profilePagePath('Bo Peep', 57), '/players/bo-peep.57/');
    assert.equal(profilePagePath('Zz Rc_Bob', 103), '/players/zz-rc-bob.103/');
    assert.equal(profilePagePath('Ada'), '/players/ada/');
    assert.equal(profilePagePath('', 5), '');
    assert.equal(profileSlug('Bo  Peep__x'), 'bo-peep-x');
  });

  it('is the client\'s label and tip; disabled with the reason when there is no public page', () => {
    assert.equal(PROFILE_PAGE_COPY.label, 'Open Profile Page');
    const open = profilePageVerb('Bo', 'public');
    assert.deepEqual([open.id, open.enabled, open.reason, open.durationMs], [PROFILE_PAGE_VERB, true, '', 0]);
    assert.match(open.tooltip, /^View more information about this person/);
    assert.equal(profilePageVerb('Bo', '').enabled, true, 'not looked up yet: it opens, the site answers');
    const none = profilePageVerb('Bo', 'none');
    assert.equal(none.enabled, false);
    assert.equal(none.reason, `Bo has no public page yet. Pages show from level ${PROFILE_LISTED_LEVEL}.`);
    assert.doesNotMatch(none.reason + open.tooltip, /—/, 'no em-dashes in player words');
  });
});

describe('the player menu (features/profiles-feature.js)', () => {
  const engine = (base, players = []) => ({
    mode: 'multiplayer',
    data: {},
    setData(k, v) { this.data[k] = v; },
    targetVerbs: () => profilesFeature.verbOverride(target, engine) ?? base,
    query: (k) => (k === 'realtimeClient' ? { players } : null),
  });
  const target = { classId: 'pc_remote', playerId: 57, label: 'Bo Peep' };

  it('puts Open Profile Page first, on another player\'s Glitch only, in multiplayer only', () => {
    const base = [{ id: 'buddy_add', label: 'Add to Friends' }, { id: 'im', label: 'IM' }];
    const e = { mode: 'multiplayer', targetVerbs: () => base };
    const rows = profilesFeature.verbOverride(target, e);
    assert.deepEqual(rows.map((r) => r.id), [PROFILE_PAGE_VERB, 'buddy_add', 'im']);
    assert.equal(profilesFeature.verbOverride({ classId: 'npc_piggy' }, e), null);
    assert.equal(profilesFeature.verbOverride({ classId: 'pc_remote' }, e), null, 'no player id');
    assert.equal(profilesFeature.verbOverride(target, { ...e, mode: 'solo' }), null);
  });

  it('opens the page in a new tab', () => {
    const opened = [];
    globalThis.document = { baseURI: 'https://groddle.localhost/play/online/' };
    globalThis.window = { open: (...a) => opened.push(a) };
    const e = engine([]);
    assert.equal(profilesFeature.runVerbOverride({ classId: 'pc_remote', playerId: 91, label: 'Cy Zed' }, PROFILE_PAGE_VERB, e), true);
    assert.deepEqual(opened, [['https://groddle.localhost/players/cy-zed.91/', '_blank', 'noopener']]);
    assert.equal(e.data.profilePage, '/players/cy-zed.91/');
    assert.equal(profilesFeature.runVerbOverride(target, 'buddy_add', e), null, 'other rows are theirs');
  });

  it('looks each player on the street up once: a 404 disables the row, a page gives its own address', async () => {
    globalThis.document = { baseURI: 'https://groddle.localhost/play/online/' };
    const asked = [];
    globalThis.fetch = async (url, init) => {
      asked.push([url, init.credentials, init.redirect]);
      if (url.includes('.58/')) return { ok: false, status: 404, url };
      return { ok: true, status: 200, url: 'https://groddle.localhost/players/al/' };
    };
    const players = [{ id: 58, name: 'Lo' }, { id: 59, name: 'Al' }];
    const e = engine([], players);
    // One at a time (onTick calls it once a second).
    await lookUpPlayersHere(e);
    await lookUpPlayersHere(e);
    assert.equal(lookUpPlayersHere(e), null, 'both looked up: nothing more until the lookups are stale');
    assert.deepEqual(asked.map((a) => a[0]), ['https://groddle.localhost/players/lo.58/', 'https://groddle.localhost/players/al.59/']);
    assert.deepEqual(asked[0].slice(1), ['same-origin', 'follow']);
    const lo = profilesFeature.verbOverride({ classId: 'pc_remote', playerId: 58, label: 'Lo' }, { mode: 'multiplayer', targetVerbs: () => [] })[0];
    assert.equal(lo.enabled, false);
    assert.match(lo.reason, /Lo has no public page yet/);
    assert.equal(e.data.profilePages, '58:none,59:public');
    // Al's row opens the page's own address.
    const opened = [];
    globalThis.window = { open: (...a) => opened.push(a[0]) };
    profilesFeature.runVerbOverride({ classId: 'pc_remote', playerId: 59, label: 'Al' }, PROFILE_PAGE_VERB, e);
    assert.deepEqual(opened, ['https://groddle.localhost/players/al/']);
  });
});

describe('the game wiring and the site', () => {
  const pub = join(import.meta.dirname, '../public');
  it('the feature is registered after the other player-menu features (so its row stays first)', () => {
    const index = readFileSync(join(pub, 'js/features/index.js'), 'utf8');
    const at = (name) => index.indexOf(`FEATURES.push(${name})`);
    for (const other of ['partyFeature', 'tradeFeature', 'buddiesFeature']) assert.ok(at(other) < at('profilesFeature'), other);
    assert.match(readFileSync(join(pub, 'js/features/profiles-feature.js'), 'utf8'), /window\.open\(url, '_blank', 'noopener'\);/);
  });

  it('the site takes /players/<slug>.<id>/ and hides pages below the listed level', { skip: skipWithoutSite }, () => {
    const pages = readFileSync(join(SITE_DIR, 'src/PlayerPages.php'), 'utf8');
    assert.match(pages, /preg_match\('\/\^\(\.\+\)\\\.\(\\d\+\)\$\/', \$slug, \$m\)/);
    assert.match(pages, /if \(\$canonical !== \$slug\) \{\n\s+return Response::redirect\(\$here, 301\);/);
    const profiles = readFileSync(join(SITE_DIR, 'src/Profiles.php'), 'utf8');
    assert.match(profiles, new RegExp(`public const LISTED_LEVEL = ${PROFILE_LISTED_LEVEL};`));
  });
});
