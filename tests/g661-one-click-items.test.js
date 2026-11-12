/**
 * G661: Glitch skipped the verb menu for the 24 item classes with an `itemDef.oneclick_verb` (GSJS
 * items/*.js). The client ran that verb on a click when it was enabled and opened the full menu
 * otherwise: glitch-client control/TSFrontController.as tryAOneClickActionOnALIS 3703-3760 (3736 not
 * while decorating, 3737 the oneclick_verb, 3745-3753 sent when enabled, 3748 a target item opens the
 * menu, 3755-3758 open_menu_when_one_click_is_disabled, StateModel.as 30 true). The game had only the
 * mailbox. js/world-context-menu.js GLITCH_ONE_CLICK lists the ones the game has (our verb id beside
 * Glitch's), GLITCH_ONE_CLICK_ABSENT the rest; game.js's pointerdown runs it. Enter, a right-click and
 * a long press keep the full menu (the keyboard's way to the other verbs).
 *
 * The classes, with their oneclick_verb (file:line of itemDef.oneclick_verb):
 *   bag_furniture_cabinet open (775), bag_furniture_smallcabinet open (785), bag_furniture_wallcabinet open (775),
 *   esquibeth_button press (190), letter_block spin (659), magic_rock talk_to (1429), note_pole read_oneclick (479),
 *   npc_spinning_wheel spin (546), pile_of_currants collect (145), wall_button press (190), wall_switch press (190);
 *   not in the game: bag_sdb remove (385), clickable_broadcaster click_broadcast (157), esquibeth_note_1..5
 *   note_broadcast (108), gol_sign talk_to (86), home_sign talk_to (93), mountain_lantern light (159),
 *   newxp_door open (112), switch_simple press (89); newxp_chain pull (127) already pulls on a click.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLITCH_ONE_CLICK, GLITCH_ONE_CLICK_ABSENT, ONE_CLICK_ITEM_OF, isOneClick, oneClickChoice, oneClickItem, oneClickVerbId, worldContextAction } from '../public/js/world-context-menu.js?v=2a64801e';
import { cabinetVerbs } from '../public/js/home-storage.js?v=b0225465';
import { poleVerbs } from '../public/js/home-street-mp.js?v=51efc0c1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const GSJS_ITEMS = join(root, '../glitch-GameServerJS/items');
const CLIENT = join(root, '../glitch-client/com/tinyspeck/engine/control/TSFrontController.as');

const LISTED = {
  bag_furniture_cabinet: 'open', bag_furniture_smallcabinet: 'open', bag_furniture_wallcabinet: 'open', esquibeth_button: 'press',
  letter_block: 'spin', magic_rock: 'talk_to', note_pole: 'read_oneclick', npc_spinning_wheel: 'spin', pile_of_currants: 'collect',
  wall_button: 'press', wall_switch: 'press',
};

describe('G661: Glitch\'s one-click items', () => {
  it('the 24 classes are all accounted for: 11 in the game, 13 not (with why)', () => {
    assert.deepEqual(Object.keys(GLITCH_ONE_CLICK).sort(), Object.keys(LISTED).sort());
    for (const [cls, glitch] of Object.entries(LISTED)) assert.equal(GLITCH_ONE_CLICK[cls].glitch, glitch, cls);
    assert.equal(Object.keys(GLITCH_ONE_CLICK).length + Object.keys(GLITCH_ONE_CLICK_ABSENT).length, 24);
    for (const cls of Object.keys(GLITCH_ONE_CLICK)) assert.ok(!(cls in GLITCH_ONE_CLICK_ABSENT), cls);
    for (const why of Object.values(GLITCH_ONE_CLICK_ABSENT)) assert.doesNotMatch(why, /[—–]/);
  });

  it('matches GSJS: every item with an itemDef.oneclick_verb, and its verb id', { skip: !existsSync(GSJS_ITEMS) && 'needs glitch-GameServerJS beside the game' }, () => {
    const found = {};
    for (const f of readdirSync(GSJS_ITEMS).filter((n) => n.endsWith('.js'))) {
      const src = readFileSync(join(GSJS_ITEMS, f), 'utf8');
      const m = /^itemDef\.oneclick_verb\s*=\s*\{[^\n]*\n\s*"id"\s*:\s*"([^"]+)"/m.exec(src);
      if (m) found[f.slice(0, -3)] = m[1];
    }
    assert.equal(Object.keys(found).length, 24);
    assert.deepEqual(Object.keys(found).sort(), [...Object.keys(GLITCH_ONE_CLICK), ...Object.keys(GLITCH_ONE_CLICK_ABSENT)].sort());
    for (const [cls, e] of Object.entries(GLITCH_ONE_CLICK)) assert.equal(e.glitch, found[cls], cls);
    // note_pole's read_oneclick is hidden from the owner at home (visitorsOnly).
    const pole = readFileSync(join(GSJS_ITEMS, 'note_pole.js'), 'utf8').split('\n');
    assert.match(pole[478], /^itemDef\.oneclick_verb/);
    assert.match(pole[493], /if \(pc\.houses_is_at_home\(\)\) return \{state: null\};/);
  });

  it('the client\'s rule (TSFrontController.as 3736-3758)', { skip: !existsSync(CLIENT) && 'needs glitch-client beside the game' }, () => {
    const lines = readFileSync(CLIENT, 'utf8').split('\n');
    assert.match(lines[3702], /public function tryAOneClickActionOnALIS/);
    assert.match(lines[3735], /if \(!model\.stateModel\.decorator_mode\)/);
    assert.match(lines[3736], /lis_view\.item\.oneclick_verb && \(act_like_pc_is_there \|\| lis_view\.item\.oneclick_verb\.from_anywhere\)/);
    assert.match(lines[3744], /if \(rm\.success && verb && verb\.enabled\)/);
    assert.match(lines[3747], /startItemstackMenuWithVerbAndTargetItem/);
    assert.match(lines[3754], /open_menu_when_one_click_is_disabled/);
  });

  it('the things that are those items: renamed ones, and home storage by its piece', () => {
    assert.deepEqual(ONE_CLICK_ITEM_OF, { mp_note_pole: 'note_pole', mp_currant_pile: 'pile_of_currants', greedy_story_button: 'wall_button', clubhouse_wall_button: 'wall_button' });
    assert.equal(oneClickItem({ classId: 'home_storage', state: { itemClass: 'bag_furniture_wallcabinet' } }), 'bag_furniture_wallcabinet');
    assert.equal(oneClickVerbId({ classId: 'home_storage', state: { itemClass: 'bag_furniture_cabinet' } }), 'cabinet_open');
    assert.equal(oneClickVerbId({ classId: 'home_storage', state: { itemClass: 'bag_furniture_sdb' } }), '', 'a Storage Display Box keeps its menu (TSFrontController.as 3760)');
    for (const cls of ['magic_rock', 'letter_block', 'npc_spinning_wheel', 'wall_button', 'wall_switch', 'esquibeth_button', 'mp_note_pole', 'mp_currant_pile', 'greedy_story_button', 'clubhouse_wall_button']) assert.equal(isOneClick({ classId: cls }), true, cls);
    assert.equal(isOneClick({ classId: 'npc_mailbox' }), true, 'the mailbox stays one click');
    assert.equal(isOneClick({ classId: 'trant_fruit' }), false);
    assert.equal(isOneClick({ classId: 'mental_block_button' }), false, 'a designed puzzle button, not a source item');
    // A right-click still opens the full menu on every one of them.
    assert.deepEqual(worldContextAction({ thing: { classId: 'magic_rock' } }), { kind: 'menu' });
  });

  it('oneClickChoice: run the verb when it is there and enabled, else the menu', () => {
    const rock = { classId: 'magic_rock' };
    const talk = { id: 'talk_to', label: 'talk to', enabled: true };
    assert.deepEqual(oneClickChoice(rock, [{ id: 'upgrade', enabled: true }, talk]), { kind: 'run', verb: talk });
    assert.deepEqual(oneClickChoice(rock, [{ id: 'upgrade', enabled: true }]), { kind: 'menu' }, 'nothing to say: the menu');
    assert.deepEqual(oneClickChoice({ classId: 'letter_block' }, [{ id: 'spin', enabled: false, reason: 'Talk to Mr. Block first.' }]), { kind: 'menu' }, 'disabled: the menu shows why');
    assert.deepEqual(oneClickChoice({ classId: 'wall_button' }, [{ id: 'press', enabled: true, picker: 'feed' }]), { kind: 'menu' }, 'a verb that picks from the pack');
    assert.equal(oneClickChoice({ classId: 'npc_piggy' }, [{ id: 'pet', enabled: true }]), null);
    assert.equal(oneClickChoice({ classId: 'npc_mailbox' }, []), null, 'the mailbox has its own path in game.js');
    // The verbs are asked for only for a thing on the list.
    let asked = 0;
    assert.equal(oneClickChoice({ classId: 'npc_piggy' }, () => { asked += 1; return []; }), null);
    assert.equal(asked, 0);
    assert.deepEqual(oneClickChoice(rock, () => { asked += 1; return [talk]; }), { kind: 'run', verb: talk });
    assert.equal(asked, 1);
    // The real menus: a visitor's note pole reads at once, the owner's opens (read, post, customize, pick up).
    const visitor = poleVerbs({ owner: false, hasNote: true });
    assert.equal(oneClickChoice({ classId: 'mp_note_pole', state: { owner: false } }, visitor).kind, 'run');
    assert.equal(oneClickChoice({ classId: 'mp_note_pole', state: { owner: false } }, poleVerbs({ owner: false, hasNote: false })).kind, 'menu', 'Nothing has been posted');
    assert.equal(oneClickChoice({ classId: 'mp_note_pole', state: { owner: true } }, poleVerbs({ owner: true, hasNote: true, notes: 1 })).kind, 'menu');
    const cab = { classId: 'home_storage', state: { owner: true, itemClass: 'bag_furniture_cabinet' } };
    assert.equal(oneClickChoice(cab, cabinetVerbs({ canOpen: true })).verb.id, 'cabinet_open');
    assert.equal(oneClickChoice(cab, cabinetVerbs({ canOpen: true, forSale: true })).kind, 'menu', 'for sale: the menu says so');
  });

  it('our verb ids are the ones those things\' menus offer', () => {
    assert.match(read('public/content.js'), /if \(classId === 'npc_spinning_wheel'\) \{\n[^\n]*\n[^\n]*\n\s*add\('spin', 'spin'/);
    assert.match(read('public/content.js'), /if \(classId === 'letter_block'\) \{\n[^\n]*\n\s*add\('spin', 'spin'/);
    assert.match(read('public/content.js'), /if \(classId === 'greedy_story_button'\) \{[\s\S]{0,300}add\('press', 'press'/);
    assert.match(read('public/js/features/homes-feature.js'), /rows\.push\(\{ id: 'talk_to', label: 'talk to'/);
    assert.match(read('public/js/features/home-street-mp-feature.js'), /if \(target\.classId === CLASS_PILE\) return \[\{ id: 'pile_collect'/);
    assert.match(read('public/js/features/home-street-mp-feature.js'), /const CLASS_POLE = 'mp_note_pole';/);
    assert.match(read('public/js/features/home-street-mp-feature.js'), /const CLASS_PILE = 'mp_currant_pile';/);
    assert.match(read('public/js/hall-rejected-concepts.js'), /verb: 'press',/);
    assert.match(read('public/js/quest-rooms/clubhouse.js'), /classId: 'clubhouse_wall_button',/);
    assert.match(read('public/js/quest-rooms/puzzle-kit.js'), /classId: 'wall_switch',/);
    assert.match(read('public/js/quest-rooms/esquibeth.js'), /classId: 'esquibeth_button'/);
    assert.match(read('public/js/features/home-storage-feature.js'), /state: \{ uid: row\.id, owner, itemClass: row\.classTsid \}/);
  });

  it('game.js: a click runs it (not while decorating or busy); the mailbox and Enter keep their ways', () => {
    const game = read('public/game.js');
    const down = game.slice(game.indexOf("app.canvas.addEventListener('pointerdown', (e) => {"), game.indexOf("app.canvas.addEventListener('contextmenu'"));
    assert.match(down, /if \(best\.classId === 'npc_mailbox'\) \{[\s\S]*?return;\n      \}\n[\s\S]*?const one = !currentAction && !features\.query\('homeEditMode', engine\) \? oneClickChoice\(best, \(\) => menuVerbsFor\(best\)\) : null;\n      if \(one\?\.kind === 'run'\) \{\n[^\n]*\n        requestVerb\(best, one\.verb\);\n        return;\n      \}\n      openVerbMenu\(best\);/);
    // Enter (tryOpenNearestMenu) still opens the menu.
    const enter = game.slice(game.indexOf('\nfunction tryOpenNearestMenu('), game.indexOf('\n}\n', game.indexOf('\nfunction tryOpenNearestMenu(')));
    assert.doesNotMatch(enter, /oneClick/);
    assert.match(enter, /if \(t\) openVerbMenu\(t\);/);
  });
});
