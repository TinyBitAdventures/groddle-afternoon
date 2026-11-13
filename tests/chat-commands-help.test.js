/**
 * CMDHELP (Austin 2026-11-03): the chat command list on the hold-? sheet
 * (js/client-hotkeys.js), in chat for "/" or "/help" on its own
 * (features/slash-commands-feature.js), the hint under a message that ends
 * with a command, and Live Help's welcome (js/groups.js CHANNEL_WELCOME).
 * The rules: js/slash-commands.js COMMAND_HELP.
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMMAND_HELP,
  COMMAND_HELP_INTRO,
  COMMAND_HELP_LEFT_OUT,
  PLAYER_COMMANDS,
  REMAKE_COMMANDS,
  commandHelpLines,
  commandHint,
  isCommandHelp,
  misplacedCommand,
  slashPlan,
  strayLetterCommand,
} from '../public/js/slash-commands.js?v=ec0e84ee';
import { chatCommandsSection, createHotkeysSheet } from '../public/js/client-hotkeys.js?v=2922915e';
import { HINT_DELAY_MS, showLocalLines, slashCommandsFeature } from '../public/js/features/slash-commands-feature.js?v=3e42aae8';
import { FEATURES } from '../public/js/features/index.js?v=7cf8a4cd';
import { createFeatureHost } from '../public/js/feature-host.js?v=06bb8b74';
import { CHANNEL_WELCOME, tabCommand } from '../public/js/groups.js?v=c9635d96';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

/** A drawer with Local and a Live Help conversation (social.push's contract). */
function fakeSocial(showing = 'local') {
  const lines = { local: [], help: [] };
  return {
    lines,
    showing,
    has: (id) => id in lines,
    push: (id, line) => (id in lines ? (lines[id].push(line), true) : false),
  };
}

function fakeEngine(over = {}) {
  const data = {};
  const log = [];
  const logged = [];
  const toasts = [];
  return {
    mode: 'solo',
    started: true,
    data,
    log,
    logged,
    toasts,
    setData: (k, v) => { data[k] = v; },
    pushActivity: (t) => log.push(t),
    toast: (t) => toasts.push(t),
    notify: { log: (text, opts) => logged.push({ text, ...opts }) },
    save: () => {},
    homeContext: () => ({ inHome: false, room: 'street', owned: true }),
    whoIsHere: () => ['Ur'],
    acting: () => false,
    transientInstance: () => false,
    query: () => null,
    ...over,
  };
}

afterEach(() => slashCommandsFeature._reset());

describe('the chat command list (js/slash-commands.js COMMAND_HELP)', () => {
  it('is the player commands minus the left-out ones, plus /stuck', () => {
    const want = [...PLAYER_COMMANDS.filter((c) => !(c in COMMAND_HELP_LEFT_OUT)), ...Object.keys(REMAKE_COMMANDS)].sort();
    assert.deepEqual(COMMAND_HELP.map(([cmd]) => cmd).sort(), want);
    assert.deepEqual(Object.keys(COMMAND_HELP_LEFT_OUT).sort(), ['/beans', '/makegod', '/xyzzy']);
    for (const c of Object.keys(COMMAND_HELP_LEFT_OUT)) assert.ok(PLAYER_COMMANDS.includes(c), `${c} is a player command, only unlisted`);
    assert.deepEqual(COMMAND_HELP.map(([cmd]) => cmd), ['/home', '/house', '/tower', '/leave', '/stuck', '/who', '/butler']);
  });

  it('lists only commands the game answers, one plain line each', () => {
    for (const [cmd, what] of COMMAND_HELP) {
      assert.notEqual(slashPlan(cmd, {}), null, `${cmd} is answered`);
      assert.ok(what.length > 0 && what.length <= 70, `${cmd}: short`);
      assert.ok(!/[—–\n]/.test(what), `${cmd}: no dashes or breaks`);
      assert.ok(!/[.]$/.test(what), `${cmd}: no full stop, as the sheet's rows`);
    }
    assert.ok(!/—/.test(COMMAND_HELP_INTRO));
    assert.deepEqual(commandHelpLines(), [COMMAND_HELP_INTRO, ...COMMAND_HELP.map(([c, w]) => `${c}  ${w}`)]);
    assert.equal(commandHelpLines()[4], '/leave  Leave your home and go back to where you were in Ur');
  });

  it('"/", "/help" and "/?" on their own show it; nothing else does', () => {
    for (const t of ['/', ' / ', '/help', '/HELP', '/?']) assert.equal(isCommandHelp(t), true, t);
    for (const t of ['', 'help', '/helpme', '/help me', '//', '/who']) assert.equal(isCommandHelp(t), false, t);
  });

  it('finds a listed command at the end of a message, not at its start or in a link', () => {
    assert.equal(misplacedCommand('aaaa/leave'), '/leave');
    assert.equal(misplacedCommand('how do I get out /leave?'), '/leave');
    assert.equal(misplacedCommand('try /home'), '/home');
    for (const t of ['/leave', 'and/or', 'see https://example.com/home', 'aaaa/beans', 'aaaa/xyzzy', '/home now', 'I am home', 'aaaa/LEAVE']) assert.equal(misplacedCommand(t), '', t);
    assert.equal(commandHint('/leave'), 'Commands go at the start of a message: /leave');
  });
});

describe('the hold-? sheet (js/client-hotkeys.js)', () => {
  class El {
    constructor(tag) { this.tag = tag; this.children = []; this.className = ''; this.textContent = ''; this.hidden = false; this.attrs = {}; this.id = ''; }
    append(...k) { this.children.push(...k); }
    replaceChildren(...k) { this.children = k; }
    setAttribute(k, v) { this.attrs[k] = v; }
    get firstChild() { return this.children[0]; }
    text() { return [this.textContent, ...this.children.map((c) => (c instanceof El ? c.text() : c.text))].join(''); }
    all() { return [this, ...this.children.flatMap((c) => (c instanceof El ? c.all() : []))]; }
  }
  const doc = { body: new El('body'), createElement: (t) => new El(t), createTextNode: (text) => ({ text }) };

  it('has a Chat commands section under Modes listing them, with where they go', () => {
    const section = chatCommandsSection();
    assert.equal(section.title, 'Chat commands');
    assert.match(section.note, /^Type these at the start of a chat message\./);
    assert.deepEqual(section.commands, COMMAND_HELP.map(([c, w]) => [c, w]));
    const sheet = createHotkeysSheet(doc);
    sheet.show();
    const card = doc.body.children[0].children[0];
    const boxes = card.all().filter((n) => /hotkeys-section/.test(n.className));
    const last = boxes.find((n) => /hotkeys-commands/.test(n.className));
    const modes = boxes.find((n) => n.children[0]?.textContent === 'Modes:');
    assert.ok(modes.children.includes(last), 'in the Modes column');
    assert.equal(last.children[0].textContent, 'Chat commands:');
    assert.equal(last.children[1].textContent, section.note);
    const rows = last.children[2].children.map((li) => li.text());
    assert.deepEqual(rows, COMMAND_HELP.map(([c, w]) => `${c} ${w}`));
  });

  it('is styled in style.css', () => {
    assert.match(read('public/style.css'), /\.hotkeys-commands li \{/);
  });
});

describe('"/" or "/help" in chat (features/slash-commands-feature.js)', () => {
  it('online, shows the list as notes in the chat it was typed in, and nothing is sent', () => {
    const host = createFeatureHost(FEATURES);
    const social = fakeSocial('help');
    const sent = [];
    const engine = fakeEngine({ mode: 'multiplayer', social, query: (hook) => (hook === 'realtimeClient' ? { send: (...a) => sent.push(a), state: 'online' } : null) });
    assert.equal(host.query('chatCommand', '/', engine), true, 'answered before party, trade and realtime see it');
    assert.deepEqual(social.lines.help, commandHelpLines().map((text) => ({ note: true, text })));
    assert.deepEqual(social.lines.local, []);
    assert.deepEqual(engine.log, [], 'no Unknown command, no Activity line');
    assert.deepEqual(engine.toasts, []);
    assert.equal(engine.data.slashLast, '/help:help');
    assert.equal(sent.length, 0);
    social.showing = 'chats';
    host.query('chatCommand', '/help', engine);
    assert.equal(social.lines.local.length, COMMAND_HELP.length + 1, 'the Chats list has no box: Local gets it');
    assert.equal(engine.data.slashLast, '/help:local');
  });

  it('solo, shows it as one Activity log entry, no notice', () => {
    const engine = fakeEngine();
    assert.equal(slashCommandsFeature.chatCommand('/?', engine), true);
    assert.equal(engine.logged.length, 1);
    assert.equal(engine.logged[0].kind, 'help');
    assert.match(engine.logged[0].html, /^Chat commands go at the start of a message:<br><b>\/home<\/b> Go to your home street<br>/);
    assert.equal(engine.logged[0].html.split('<br>').length, COMMAND_HELP.length + 1);
    assert.deepEqual(engine.log, []);
    assert.equal(engine.data.slashLast, '/help:activity');
    assert.equal(showLocalLines(fakeEngine({ notify: null }), ['a', 'b']), 'activity');
  });

  it('every chat leaves a lone "/" to the game: drawer prefixes, chat tabs and IMs', () => {
    assert.equal(tabCommand('/'), null, 'a group or channel tab does not say it');
    assert.equal(tabCommand('/help'), null);
    const drawer = read('public/js/ui/social-drawer.js');
    assert.ok(drawer.includes("if (t.prefix && text.trim() && !text.trim().startsWith('/'))"), 'no /p or /butler prefix on a slash line');
    assert.ok(read('public/js/features/player-im-feature.js').includes("if (text.trim().startsWith('/')) return;"), 'an IM leaves slash lines to the game');
    const ids = FEATURES.map((f) => f.id);
    for (const id of ['party', 'trade', 'realtime']) assert.ok(ids.indexOf('slash-commands') < ids.indexOf(id), `before ${id}`);
  });
});

describe('the hint under a message that ends with a command', () => {
  const saved = {};
  afterEach(() => {
    for (const k of ['document']) {
      if (saved[k] === undefined) delete globalThis[k];
      else globalThis[k] = saved[k];
    }
  });

  it('shows after the line, in the same chat, and the line still goes out', async () => {
    saved.document = globalThis.document;
    const input = { value: 'aaaa/leave' };
    globalThis.document = { getElementById: (id) => (id === 'local-chat-input' ? input : null), addEventListener: () => {} };
    const social = fakeSocial('local');
    const engine = fakeEngine({ mode: 'multiplayer', social });
    slashCommandsFeature.init(engine);
    let stopped = false;
    const e = { target: { id: 'local-chat-form' }, preventDefault: () => { stopped = true; }, stopPropagation: () => { stopped = true; } };
    slashCommandsFeature._onChatSubmit(e);
    assert.equal(stopped, false, 'the message is not held back');
    assert.equal(input.value, 'aaaa/leave');
    assert.deepEqual(social.lines.local, [], 'after the line, not before');
    assert.ok(HINT_DELAY_MS >= 300 && HINT_DELAY_MS <= 1000);
    await new Promise((r) => setTimeout(r, HINT_DELAY_MS + 50));
    assert.deepEqual(social.lines.local, [{ note: true, text: 'Commands go at the start of a message: /leave' }]);
    assert.equal(engine.data.slashLast, 'hint:/leave');
    input.value = 'hello there';
    slashCommandsFeature._onChatSubmit(e);
    input.value = '/leave';
    slashCommandsFeature._onChatSubmit(e);
    await new Promise((r) => setTimeout(r, HINT_DELAY_MS + 50));
    assert.equal(social.lines.local.length, 1, 'no hint for plain words or a real command');
  });
});

describe('G563: a command with a stray letter in front runs', () => {
  const saved = {};
  afterEach(() => {
    if (saved.document === undefined) delete globalThis.document;
    else globalThis.document = saved.document;
  });

  it('one letter and a listed command is that command; anything else is not', () => {
    for (const [line, want] of [
      ['d/home', '/home'], ['a/leave', '/leave'], ['d/leave', '/leave'], ['d/house', '/house'], [' s/stuck ', '/stuck'],
      ['W/Home', '/home'], ['d/butler hello there', '/butler hello there'], ['a/who', '/who'],
    ]) assert.equal(strayLetterCommand(line), want, line);
    for (const line of ['aaaa/leave', 'ad/home', 'go/home', 'd/beans', 'd/xyzzy', 'd/tp me', '/home', 'd/', 'd/homes', 'and/or', '1/home', 'd /home', 'd/home/leave', 'hello']) {
      assert.equal(strayLetterCommand(line), '', line);
    }
  });

  it('the box is turned into the command before any chat reads it; no hint follows', async () => {
    saved.document = globalThis.document;
    const input = { value: 'a/leave' };
    globalThis.document = { getElementById: (id) => (id === 'local-chat-input' ? input : null), addEventListener: () => {}, activeElement: null };
    const social = fakeSocial('local');
    const engine = fakeEngine({ mode: 'multiplayer', social });
    slashCommandsFeature.init(engine);
    const e = { target: { id: 'local-chat-form' }, preventDefault() {}, stopPropagation() {} };
    slashCommandsFeature._onChatSubmit(e);
    assert.equal(input.value, '/leave', 'the game\'s own submit handler then runs /leave');
    assert.equal(engine.data.slashLast, 'stray-letter:/leave');
    // Typed into a box the / key opened (the slash swallowed, then "d/home"): the same.
    input.value = '';
    globalThis.document.activeElement = input;
    slashCommandsFeature._onSlashKey({ key: '/', target: { matches: () => false } });
    await new Promise((r) => setTimeout(r, 5));
    input.value = 'd/home';
    slashCommandsFeature._onChatSubmit(e);
    assert.equal(input.value, '/home');
    await new Promise((r) => setTimeout(r, HINT_DELAY_MS + 50));
    assert.deepEqual(social.lines.local, [], 'no "Commands go at the start" hint');
    // Two letters stay chat, with the hint (the line goes out as typed).
    input.value = 'aaaa/leave';
    slashCommandsFeature._onChatSubmit(e);
    assert.equal(input.value, 'aaaa/leave');
    await new Promise((r) => setTimeout(r, HINT_DELAY_MS + 50));
    assert.deepEqual(social.lines.local, [{ note: true, text: 'Commands go at the start of a message: /leave' }]);
    // The capture-phase submit handler runs before the drawer, the chat tabs and game.js read the box.
    assert.ok(read('public/js/features/slash-commands-feature.js').includes("document.addEventListener('submit', onChatSubmit, true);"));
  });
});

describe('Live Help welcome (js/groups.js CHANNEL_WELCOME)', () => {
  it('ends with where to find the commands, and groups-feature adds it on joining', () => {
    assert.equal(CHANNEL_WELCOME.help, 'Ask and answer questions about the game here. Type / in chat for commands.');
    assert.ok(read('public/js/features/groups-feature.js').includes('if (CHANNEL_WELCOME[ch]) pushLine(chat.lines, { note: true, text: CHANNEL_WELCOME[ch] });'));
  });
});
