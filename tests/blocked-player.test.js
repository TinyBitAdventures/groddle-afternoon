/**
 * A player you block (buddies-feature realtimeHidden; the right-click later-batch report,
 * 2026-11-03): their words and acts never reach you on any path, and their menu keeps only the
 * rows Glitch kept. Glitch's client dropped every chat line from an ignored player, party chat
 * too (glitch-client RightSideManager.as chatUpdate 218-223, pc.ignored), and built none of its own
 * rows for a blocked player (InteractionMenuController.as 522-523, is_blocked); the server's
 * Un-Block, Friends and follow rows stayed (GameServerJS main.js 3590-3739). The realtime server
 * refuses the rest (party.go, trade.go, follow.go, gifts.go, homes.go, verbs.go, im.go, hi.go).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FakeEl, memoryStore, page } from './social-fake-dom.js';
import { BLOCKED_PLAYER_VERBS, blockedPlayerVerbs, playerMenuRows } from '../public/js/ui/player-menu.js?v=a7bbaadc';
import { BUDDY_VERBS } from '../public/js/buddies.js?v=cff7bf6e';
import { FOLLOW_STOP_VERB } from '../public/js/follow-mp.js?v=ec738df5';
import { PROFILE_PAGE_VERB } from '../public/js/profiles.js?v=054ca723';
import { IM_VERB_ID } from '../public/js/player-im.js?v=da51888c';
import { VISIT_VERB } from '../public/js/neighbours-mp.js?v=78dd3b33';
import { PARTY_TEXT, inviteCandidates } from '../public/js/party.js?v=7615aab8';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=99cc04a6';
import { createNotifier } from '../public/js/notify.js?v=1fb97b21';
import { partyFeature } from '../public/js/features/party-feature.js?v=ae589bdd';
import { SERVER_DIR, skipWithoutServer } from '../tools/repos.mjs';

const PUB = join(import.meta.dirname, '../public');
const read = (p) => readFileSync(join(PUB, p), 'utf8');

/** Another player's whole world menu, as the features compose it (tests/player-list-menu.test.js WORLD, and the rest). */
const WORLD = [
  { id: PROFILE_PAGE_VERB, label: 'Open Profile Page', enabled: true },
  { id: 'party_invite', label: 'Invite to Party', enabled: true },
  { id: IM_VERB_ID, label: 'IM', enabled: true },
  { id: 'mp_follow', label: 'Follow', enabled: true },
  { id: FOLLOW_STOP_VERB, label: 'Stop following', enabled: true },
  { id: 'auctions_view', label: 'View Auctions', enabled: true },
  { id: 'gift_give', label: 'Give', enabled: true },
  { id: 'hug', label: 'Hug', enabled: true },
  { id: VISIT_VERB.id, label: VISIT_VERB.label, enabled: true },
  { id: BUDDY_VERBS.add, label: 'Add to Friends', enabled: true },
  { id: BUDDY_VERBS.unignore, label: 'Un-Block Cy', enabled: true },
  { id: 'trade_start', label: 'Offer to Trade', enabled: true },
  { id: 'party_space_kick', label: 'Kick out Cy', enabled: true },
];

describe('the menu of a player you block (js/ui/player-menu.js, game.js menuVerbsFor)', () => {
  it('keeps only the rows Glitch kept: Friends, Un-Block, Stop following, the Party Space kick', () => {
    assert.deepEqual([...BLOCKED_PLAYER_VERBS], [BUDDY_VERBS.add, BUDDY_VERBS.remove, BUDDY_VERBS.unignore, FOLLOW_STOP_VERB, 'party_space_kick']);
    assert.deepEqual(blockedPlayerVerbs(WORLD).map((v) => v.label), ['Stop following', 'Add to Friends', 'Un-Block Cy', 'Kick out Cy']);
    assert.deepEqual(blockedPlayerVerbs([null, undefined]), []);
    assert.deepEqual(blockedPlayerVerbs(null), []);
  });

  it('from a list too: no Open Profile Page, IM or Invite to Party for them', () => {
    assert.deepEqual(playerMenuRows(blockedPlayerVerbs(WORLD)).map((r) => r.id), [BUDDY_VERBS.add, BUDDY_VERBS.unignore]);
  });

  it('game.js filters every player menu (a click on the Glitch, a right-click, a name in a list)', () => {
    const game = read('game.js');
    const fn = game.slice(game.indexOf('function menuVerbsFor('), game.indexOf('function openVerbMenu('));
    assert.match(fn, /if \(target\?\.classId === 'pc_remote' && target\.playerId && features\.query\('realtimeHidden', Number\(target\.playerId\), engine\)\) return blockedPlayerVerbs\(verbs\);/);
    assert.match(game, /import \{ blockedPlayerVerbs, listPlayerTarget, opensPlayerMenu, playerMenuRows \} from '\.\/js\/ui\/player-menu\.js/);
  });
});

function fakeClient() {
  const listeners = new Map();
  const sent = [];
  return {
    state: 'online',
    me: { id: 1, name: 'Ada' },
    players: [{ id: 6, name: 'Fi' }, { id: 7, name: 'Cy' }],
    sent,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(type, payload) { for (const fn of listeners.get(type) || []) fn(payload); },
    msg(m) { this.emit(`msg:${m.t}`, m); },
    send(kind, payload = {}) { sent.push({ t: kind, ...payload }); return true; },
    take(kind) { const out = sent.filter((m) => m.t === kind); for (const m of out) sent.splice(sent.indexOf(m), 1); return out; },
  };
}

describe('party chat from a player you block (features/party-feature.js)', () => {
  const saved = {};
  let t;
  let client;
  let engine;
  let drawer;
  const blocked = new Set([7]);
  const prompts = [];
  const removed = [];

  before(() => {
    for (const k of ['document', 'addEventListener', 'groddleParty', 'CSS', 'requestAnimationFrame']) saved[k] = globalThis[k];
    t = page();
    const menu = new FakeEl('div');
    menu.id = 'more-list';
    t.doc.body.append(menu);
    globalThis.document = t.doc;
    globalThis.addEventListener = () => {};
    globalThis.CSS = { escape: (s) => s };
    globalThis.requestAnimationFrame = (fn) => fn();
    const notifier = createNotifier({ onChange: () => drawer?.update() });
    drawer = mountSocialDrawer({ root: t.game, dock: t.dock, notifier, mode: 'online', storage: memoryStore(), width: () => 1920, streetName: () => 'Hechey Track' });
    client = fakeClient();
    engine = {
      mode: 'multiplayer',
      started: true,
      social: drawer,
      query: (hook, id) => (hook === 'realtimeClient' ? client : hook === 'realtimeHidden' ? (blocked.has(Number(id)) ? true : null) : null),
      setData: (k, v) => { engine.data[k] = v; },
      data: {},
      toast() {},
      prompt: (p) => { prompts.push(p.text); return `uid${prompts.length}`; },
      removePrompt: (uid) => removed.push(uid),
      chatLine: (name, text) => drawer.localLine(name, text),
    };
    partyFeature.onTick(16, 0, engine);
    client.msg({ t: 'party', party: { members: [{ id: 1, name: 'Ada', leader: true, online: true }, { id: 6, name: 'Fi', online: true }, { id: 7, name: 'Cy', online: true }] } });
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('their lines are never shown (the Party chat, its last line in Chats, the QA data); others\' and yours are', () => {
    client.msg({ t: 'party_said', id: 7, name: 'Cy', text: 'you cannot hide', at: 1 });
    assert.deepEqual(drawer.lines('party').filter((l) => !l.note), []);
    assert.equal(drawer.unread('party'), 0);
    assert.equal(engine.data.partyLastSaid || '', '');
    assert.deepEqual(globalThis.groddleParty.log.filter((l) => !l.note), []);
    client.msg({ t: 'party_said', id: 6, name: 'Fi', text: 'hi all', at: 2 });
    client.msg({ t: 'party_said', id: 1, name: 'Ada', text: 'hello Fi', at: 3 });
    assert.deepEqual(drawer.lines('party').filter((l) => !l.note).map((l) => `${l.name}:${l.text}`), ['Fi:hi all', 'Ada:hello Fi']);
    assert.equal(engine.data.partyLastSaid, 'Ada:hello Fi');
  });

  it('their invite is declined unseen; one waiting when you block them goes too', () => {
    client.msg({ t: 'party_invited', from: { id: 7, name: 'Cy' }, text: 'Cy has invited you to join their Party Chat.', timeout: 89 });
    assert.deepEqual(prompts, []);
    assert.deepEqual(client.take('party_decline'), [{ t: 'party_decline', from: 7 }]);
    client.msg({ t: 'party_invited', from: { id: 6, name: 'Fi' }, text: 'Fi has invited you to join their Party Chat.', timeout: 89 });
    assert.equal(prompts.length, 1);
    assert.equal(engine.data.partyInvites, '1');
    blocked.add(6);
    partyFeature.onTick(16, 0, engine);
    assert.deepEqual(removed, ['uid1']);
    assert.deepEqual(client.take('party_decline'), [{ t: 'party_decline', from: 6 }]);
    assert.equal(engine.data.partyInvites, '0');
    blocked.delete(6);
  });

  it('inviting them says the server\'s refusal and sends nothing; the panel has no Invite button for them', () => {
    assert.equal(globalThis.groddleParty.invite({ id: 7 }), false);
    assert.deepEqual(client.take('party_invite'), []);
    assert.equal(globalThis.groddleParty.log.at(-1).text, PARTY_TEXT.blocked);
    assert.equal(PARTY_TEXT.blocked, 'You are blocking or blocked by that player.');
    const hidden = (id) => blocked.has(id);
    assert.deepEqual(inviteCandidates([{ id: 7 }, { id: 9 }], null, hidden), [{ id: 9 }]);
    // By name the server answers (party.go invite: the same words).
    assert.equal(globalThis.groddleParty.invite({ name: 'Cy' }), true);
    assert.deepEqual(client.take('party_invite'), [{ t: 'party_invite', name: 'Cy' }]);
  });
});

describe('every other path a blocked player could reach you on (second line of defence; the server refuses first)', () => {
  const guard = /engine\.query\?\.\('realtimeHidden', [^)]+\)/;
  /** The start of a message handler (enough for its first checks). */
  const handler = (src, kind) => src.slice(src.indexOf(`client.on('msg:${kind}'`), src.indexOf(`client.on('msg:${kind}'`) + 700);

  it('a trade request from them is never shown (requests.go toStreet does not send it)', () => {
    assert.match(handler(read('js/features/trade-feature.js'), 'trade_requested'), /if \(msg\.mine !== true && engine\.query\?\.\('realtimeHidden', from\)\) return;/);
  });

  it('their Follow ask is a no unseen (follow.go refuses it)', () => {
    const h = handler(read('js/features/follow-mp-feature.js'), 'follow_asked');
    assert.match(h, guard);
    assert.match(h, /client\.send\('follow_answer', \{ id, accept: false \}\);\n\s+return;/);
  });

  it('their knock at your house goes unanswered (homes.go refuses it)', () => {
    const h = handler(read('js/features/neighbours-mp-feature.js'), 'home_knocked');
    assert.ok(h.indexOf('realtimeHidden') < h.indexOf('POL_GATE_KNOCKED'), 'before the knock sound');
    assert.match(h, /client\.send\('home_answer', \{ id, allow: false \}\);/);
  });

  it('their hug, kiss, splank or soak on you does nothing (verbs.go refuses it)', () => {
    const src = read('js/features/player-verbs-mp-feature.js');
    const got = src.slice(src.indexOf('function onGot('), src.indexOf('const side = targetSide(verbId'));
    assert.match(got, /if \(from\.id && engine\.query\?\.\('realtimeHidden', from\.id\)\) return;/);
  });

  it('they come and go on your street unannounced; their Local lines, bubbles, typing and emotes are hidden', () => {
    const src = read('js/features/realtime-feature.js');
    assert.match(src, /client\.on\('joined', \(p\) => \{ if \(!engine\.query\?\.\('realtimeHidden', p\.id\)\) addLog/);
    assert.match(src, /if \(r && !engine\.query\?\.\('realtimeHidden', id\)\) addLog\(\{ note: true, text: `\$\{r\.name\} left\.` \}\);/);
    const said = src.slice(src.indexOf("client.on('said'"), src.indexOf("client.on('typing'"));
    assert.ok(said.indexOf('realtimeHidden') < said.indexOf('engine.say?.('), 'the bubble over their Glitch too');
    assert.match(src, /client\.on\('typing', \(\{ id \}\) => \{\n\s+if \(engine\.query\?\.\('realtimeHidden', id\)\) return;/);
    assert.match(src, /client\.on\('emoted', \(\{ id, e \}\) => \{\n\s+if \(engine\.query\?\.\('realtimeHidden', id\)\) return;/);
  });

  it('their IMs, group and channel lines, hi signs, powders and Butler notes are hidden (the features\' own checks)', () => {
    assert.match(read('js/features/player-im-feature.js'), /if \(!\(id > 0\) \|\| !line \|\| hidden\(id\)\) return;/);
    assert.match(read('js/features/player-im-feature.js'), /engine\.toast\?\.\(refusalText\('on your ignore list', nameOf\(id, name\)\), 2800\);/);
    assert.match(read('js/features/groups-feature.js'), /if \(line\.id !== userId\(\) && engine\.query\?\.\('realtimeHidden', line\.id\)\) return;/);
    assert.match(read('js/features/hi-signs-feature.js'), /return Boolean\(engine\.query\?\.\('realtimeHidden', Number\(id\)\)\);/);
    assert.match(read('js/features/powders-feature.js'), /if \(!id \|\| engine\.query\?\.\('realtimeHidden', id\)\) return;/);
    assert.match(read('js/features/butler-im-feature.js'), /if \(from && engine\.query\?\.\('realtimeHidden', from\)\) return;/);
  });

  it('the server does not send a party line to a member who blocks the speaker', { skip: skipWithoutServer }, () => {
    const party = readFileSync(join(SERVER_DIR, 'party.go'), 'utf8');
    const chat = party.slice(party.indexOf('func (m *parties) chatLine('), party.indexOf('// —— Lifecycle ——'));
    assert.match(chat, /ign, _ := m\.h\.ProvidedLocked\("buddies\.ignoring"\)\.\(func\(int64, int64\) bool\)/);
    assert.match(chat, /if mem\.id != cl\.ID\(\) && ign != nil && ign\(mem\.id, cl\.ID\(\)\) \{\n\s+continue\n\s+\}/);
  });
});
