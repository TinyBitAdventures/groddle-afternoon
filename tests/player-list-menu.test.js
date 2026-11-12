/**
 * RIGHTCLICK (Austin 2026-11-03, right-click audit later batch item 1): another player's menu "from
 * a list" (glitch-client InteractionMenuController.as startPcMenuFromList 664-693): built from the
 * player's id and name; on your street the whole world menu, elsewhere only the rows that work at a
 * distance; your own name opens nothing.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FROM_LIST_VERBS, PLAYER_TARGET_FEATURE, listPlayerTarget, opensPlayerMenu, playerMenuRows } from '../public/js/ui/player-menu.js?v=047ec27e';
import { PROFILE_PAGE_VERB } from '../public/js/profiles.js?v=054ca723';
import { IM_VERB_ID } from '../public/js/player-im.js?v=da51888c';
import { BUDDY_VERBS } from '../public/js/buddies.js?v=cff7bf6e';
import { VISIT_VERB } from '../public/js/neighbours-mp.js?v=7dc15891';
import { PARTY_FEATURE_ID } from '../public/js/features/party-feature.js?v=ae589bdd';

const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
const glue = game.slice(game.indexOf('let playerCtxMenu = null;'), game.indexOf('function openPlayerListMenu('));
const opener = game.slice(game.indexOf('function openPlayerListMenu('), game.indexOf('const ROAD_NOT_IN_GAME'));

/** The world player menu as the features compose it (the order the online QA saw, 2026-11-03). */
const WORLD = [
  { id: PROFILE_PAGE_VERB, label: 'Open Profile Page', tooltip: 'View more information about this person.', enabled: true },
  { id: 'party_invite', label: 'Invite to Party', enabled: true },
  { id: IM_VERB_ID, label: 'IM', enabled: true },
  { id: 'follow_start', label: 'Follow', enabled: true },
  { id: 'auctions_view', label: 'View Auctions', enabled: true },
  { id: 'gift_give', label: 'Give', enabled: true },
  { id: VISIT_VERB.id, label: VISIT_VERB.label, enabled: true },
  { id: BUDDY_VERBS.add, label: 'Add to Friends', enabled: true },
  { id: BUDDY_VERBS.ignore, label: 'Block', enabled: true },
  { id: 'trade_start', label: 'Offer to Trade', enabled: true },
];

describe('the player from a list (js/ui/player-menu.js)', () => {
  it('a target from an id and a name: the party feature\'s pc_remote, no sprite', () => {
    assert.equal(PLAYER_TARGET_FEATURE, PARTY_FEATURE_ID);
    const t = listPlayerTarget({ id: '1234', name: ' Ada ' });
    assert.deepEqual(t, { featureId: 'party', classId: 'pc_remote', playerId: 1234, label: 'Ada', name: 'Ada', fromList: true });
    assert.equal('sprite' in t, false);
    assert.equal(listPlayerTarget({ id: 5 }).label, 'Someone', 'the shared fallback (js/player-names.js)');
  });

  it('your own name, no id or a bad one opens nothing (ContactElement.as 269)', () => {
    assert.equal(opensPlayerMenu(12, 34), true);
    assert.equal(opensPlayerMenu(12, 12), false);
    assert.equal(opensPlayerMenu('12', 12), false);
    assert.equal(opensPlayerMenu(0, 12), false);
    assert.equal(opensPlayerMenu('x', 12), false);
    assert.equal(opensPlayerMenu(-3), false);
  });

  it('away from you: only the rows that work at a distance, in the world menu\'s order', () => {
    assert.deepEqual(playerMenuRows(WORLD).map((r) => r.label), ['Open Profile Page', 'Invite to Party', 'IM', 'Visit Home Street', 'Add to Friends', 'Block']);
    // Summon <name> (Teleportation V) was the server's row, so Glitch's list menu kept it (main.js 3661-3715).
    assert.deepEqual([...FROM_LIST_VERBS].sort(), [PROFILE_PAGE_VERB, 'party_invite', IM_VERB_ID, VISIT_VERB.id, 'buddy_destination', 'mp_summon', ...Object.values(BUDDY_VERBS)].sort());
  });

  it('on your street: every row of the world menu (Give, Trade, Follow too)', () => {
    assert.deepEqual(playerMenuRows(WORLD, { here: true }).map((r) => r.id), WORLD.map((v) => v.id));
  });

  it('rows keep the feature\'s tip and, when they can\'t be done, the reason', () => {
    const rows = playerMenuRows([
      { id: PROFILE_PAGE_VERB, label: 'Open Profile Page', tooltip: 'Tip', enabled: false, reason: 'Ada has no public page yet.' },
      { id: 'party_invite', label: 'Invite to Party', enabled: true, reason: 'stale' },
    ]);
    assert.deepEqual(rows, [
      { id: PROFILE_PAGE_VERB, label: 'Open Profile Page', tip: 'Tip', disabled: true, reason: 'Ada has no public page yet.' },
      { id: 'party_invite', label: 'Invite to Party', tip: '', disabled: false, reason: '' },
    ]);
  });

  it('omit drops a row a surface already has (a Chats row\'s Open is the IM)', () => {
    assert.deepEqual(playerMenuRows(WORLD, { omit: [IM_VERB_ID] }).map((r) => r.label), ['Open Profile Page', 'Invite to Party', 'Visit Home Street', 'Add to Friends', 'Block']);
  });
});

describe('game.js openPlayerListMenu (the shared menu, engine.openPlayerMenu)', () => {
  it('one shared menu with its own id, and the street\'s Glitch when they are here', () => {
    assert.match(glue, /createContextMenu\(\{ doc: document, host: document\.getElementById\('game-root'\), id: 'player-ctx-menu'/);
    assert.match(glue, /t\?\.classId === 'pc_remote' && Number\(t\.playerId\) === pid && t\.sprite && !t\.sprite\.destroyed/);
    assert.match(glue, /features\.query\('realtimeClient', engine\)\?\.me\?\.id/);
  });

  it('multiplayer only, never you; the features\' own verbs; QA keys player:<id> and here|list', () => {
    assert.match(opener, /if \(GAME_MODE !== 'multiplayer' \|\| !opensPlayerMenu\(id, selfPlayerId\(\)\)\) return false;/);
    assert.match(opener, /const target = here \|\| listPlayerTarget\(\{ id: pid, name \}\);/);
    assert.match(opener, /playerMenuRows\(menuVerbsFor\(target\) \|\| \[\], \{ here: Boolean\(here\), omit \}\)/);
    assert.match(opener, /owner: `player:\$\{pid\}`/);
    assert.match(opener, /data: \{ playerMenu: here \? 'here' : 'list' \}/);
  });

  it('a pick runs the verb as it is now (they may have left), the world menu\'s way when their Glitch is here', () => {
    assert.match(opener, /const now = streetPlayerTarget\(pid\) \|\| listPlayerTarget/);
    assert.match(opener, /if \(!verb \|\| verb\.enabled === false\) return;/);
    assert.match(opener, /if \(!now\.sprite \|\| \(currentAction && !\(Number\(verb\.durationMs\) > 0\)\)\) executeVerb\(now, verb\.id\);\n\s+else requestVerb\(now, verb\);/);
    assert.match(opener, /if \(typeof row\?\.run === 'function'\) \{\n\s+row\.run\(\);/);
  });

  it('the features reach it through the engine', () => {
    assert.match(game, /openPlayerMenu: \(opts\) => openPlayerListMenu\(opts\),/);
    assert.match(game, /isPlayerMenuOpen: \(id\) => Boolean\(playerCtxMenu\?\.isOpenFor\(`player:\$\{Number\(id\) \|\| 0\}`\)\),/);
  });

  it('the shared menu can sit over a full-screen panel (data-layer="screen" in both skins)', () => {
    const cm = readFileSync(new URL('../public/js/ui/context-menu.js', import.meta.url), 'utf8');
    assert.match(cm, /if \(layer\) el\.dataset\.layer = String\(layer\);\n\s+else delete el\.dataset\.layer;/);
    const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
    const classic = readFileSync(new URL('../public/css/classic.css', import.meta.url), 'utf8');
    assert.match(css, /\[data-ui="modern"\] #game-root \.ctx-menu\[data-layer="screen"\]:not\(\[hidden\]\) \{ z-index: calc\(var\(--z-screen\) \+ 1\); \}/);
    assert.match(classic, /:root\[data-ui="classic"\] #game-root \.ctx-menu\[data-layer="screen"\]:not\(\[hidden\]\) \{ z-index: calc\(var\(--z-screen\) \+ 1\); \}/);
  });
});

describe('the player menu opens from the chat column too (fixed, both skins)', () => {
  it('placed in the window, not in #game-root (Classic draws the column beside it, outside its clip)', () => {
    const glue = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
    assert.match(glue, /id: 'player-ctx-menu', className: 'player-ctx-menu', rowData: 'playerRow', fixed: true,/);
    const cm = readFileSync(new URL('../public/js/ui/context-menu.js', import.meta.url), 'utf8');
    assert.match(cm, /if \(fixed\) el\.dataset\.fixed = '';/);
    assert.match(cm, /const hostRect = fixed\n\s+\? \{ left: 0, top: 0, width: win\?\.innerWidth/);
    const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
    const classic = readFileSync(new URL('../public/css/classic.css', import.meta.url), 'utf8');
    assert.match(css, /\[data-ui="modern"\] #game-root \.ctx-menu\[data-fixed\]:not\(\[hidden\]\) \{ position: fixed; \}/);
    assert.match(classic, /:root\[data-ui="classic"\] #game-root \.ctx-menu\[data-fixed\]:not\(\[hidden\]\) \{ position: fixed; \}/);
  });

  it('Classic: the footer line wraps inside the card the rows make, so a long tip never widens it past where it was placed', () => {
    const classic = readFileSync(new URL('../public/css/classic.css', import.meta.url), 'utf8');
    assert.match(classic, /:root\[data-ui="classic"\] \.ctx-menu \.vm-detail \{ box-sizing: border-box; width: 0; min-width: calc\(100% - 10 \* var\(--cu\)\);/);
  });

  it('a click on a name keeps the menu\'s keys (js/ui/focus-return.js: the shared menu is one that keeps them)', () => {
    const fr = readFileSync(new URL('../public/js/ui/focus-return.js', import.meta.url), 'utf8');
    assert.match(fr, /#verb-menu, #pack-popover, \.count-pop, \.ctx-menu:not\(\[hidden\]\)';/);
  });
});
