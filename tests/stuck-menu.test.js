/**
 * G792: nine players got stuck and most never found /stuck. The Menu (Modern and Classic share
 * #more-list, phones too) has an "I'm stuck" row that runs /stuck itself, with its cooldown, its
 * quest-room exit and its refusals (features/slash-commands-feature.js placeStuckRow).
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STUCK_MENU, STUCK_TEXT } from '../public/js/slash-commands.js?v=bb2569aa';
import { placeStuckRow, runStuckFromMenu, slashCommandsFeature } from '../public/js/features/slash-commands-feature.js?v=9575b0df';
import { MENU_ROWS, menuRowFor } from '../public/js/ui/topbar.js?v=820dd86c';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const AWAY = { owned: true, inHome: false, room: 'street' };

function fakeEngine(over = {}) {
  const data = {};
  const log = [];
  const moves = [];
  return {
    data,
    log,
    moves,
    started: true,
    player: { x: 900, y: 400 },
    setData: (k, v) => { data[k] = v; },
    pushActivity: (t) => log.push(t),
    toast: () => {},
    save: () => {},
    homeContext: () => AWAY,
    whoIsHere: () => ['Ur'],
    acting: () => false,
    transientInstance: () => false,
    stuckReturn: () => { moves.push('arrival'); return { ok: true, x: 300, y: 682, from: 'arrival' }; },
    ...over,
  };
}

/** Just enough page for the row: #more-list, #more-btn (which toggles the list), buttons. */
function fakeDoc() {
  const byId = new Map();
  const el = (tag) => {
    const node = {
      tagName: tag.toUpperCase(), id: '', className: '', type: '', title: '', textContent: '', hidden: false,
      children: [], listeners: {},
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      click() { for (const fn of this.listeners.click || []) fn({ target: this }); },
      append(child) { this.children.push(child); if (child.id) byId.set(child.id, child); },
    };
    return node;
  };
  const list = el('div');
  list.id = 'more-list';
  list.hidden = true;
  const more = el('button');
  more.id = 'more-btn';
  more.addEventListener('click', () => { list.hidden = !list.hidden; });
  byId.set(list.id, list);
  byId.set(more.id, more);
  return {
    list,
    more,
    createElement: el,
    getElementById: (id) => byId.get(id) || null,
  };
}

afterEach(() => {
  slashCommandsFeature._reset();
  slashCommandsFeature._setClock();
});

describe('G792: the Menu\'s I\'m stuck row', () => {
  it('names what a stuck player looks for, and says what it does without an em dash', () => {
    assert.equal(STUCK_MENU.label, "I'm stuck");
    assert.match(STUCK_MENU.tip, /\/stuck/);
    assert.match(STUCK_MENU.tip, /5 minutes/);
    for (const line of [STUCK_MENU.label, STUCK_MENU.tip, STUCK_TEXT.hint]) assert.doesNotMatch(line, /—/);
  });

  it('the one-time trap hint points at the Menu row as well as the command', () => {
    assert.match(STUCK_TEXT.hint, /I'm stuck in the Menu/);
    assert.match(STUCK_TEXT.hint, /\/stuck/);
  });

  it('sits in the Menu\'s World group beside Home, on a phone too', () => {
    assert.deepEqual(MENU_ROWS[STUCK_MENU.id], { group: 'world', rank: 0.5 });
    assert.equal(menuRowFor(STUCK_MENU.id, { phone: true }).group, 'world');
    assert.ok(MENU_ROWS[STUCK_MENU.id].rank > MENU_ROWS['home-btn'].rank);
    assert.ok(MENU_ROWS[STUCK_MENU.id].rank < MENU_ROWS['feat-btn'].rank);
  });

  it('is made once in #more-list, and not again', () => {
    const doc = fakeDoc();
    const engine = fakeEngine();
    assert.equal(placeStuckRow(engine, doc), true);
    assert.equal(placeStuckRow(engine, doc), false);
    const rows = doc.list.children.filter((c) => c.id === STUCK_MENU.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].textContent, "I'm stuck");
    assert.equal(rows[0].type, 'button');
    assert.equal(rows[0].title, STUCK_MENU.tip);
  });

  it('waits for the Menu when the bar is not there yet', () => {
    const doc = { getElementById: () => null, createElement: () => ({}) };
    assert.equal(placeStuckRow(fakeEngine(), doc), false);
  });

  it('a click closes the Menu, then moves you back as /stuck does and starts the same cooldown', async () => {
    let clock = 1_000_000;
    slashCommandsFeature._setClock(() => clock);
    const doc = fakeDoc();
    const engine = fakeEngine();
    placeStuckRow(engine, doc);
    doc.list.hidden = false;
    doc.getElementById(STUCK_MENU.id).click();
    assert.equal(doc.list.hidden, true, 'the Menu closed first');
    await flush();
    await flush();
    assert.deepEqual(engine.moves, ['arrival']);
    assert.deepEqual(engine.log, [STUCK_TEXT.done]);
    assert.equal(slashCommandsFeature._state().stuckAt, clock);
    // The cooldown is /stuck's own: a second click a minute later says how long is left.
    clock += 60_000;
    doc.list.hidden = false;
    doc.getElementById(STUCK_MENU.id).click();
    await flush();
    assert.deepEqual(engine.moves, ['arrival']);
    assert.equal(engine.log.at(-1), STUCK_TEXT.wait(4 * 60_000));
    assert.equal(engine.data.stuckMenu, '/stuck:say');
  });

  it('keeps /stuck\'s refusals: in a race or another held place it says to use Leave', async () => {
    const engine = fakeEngine({ transientInstance: () => true });
    runStuckFromMenu(engine);
    await flush();
    assert.deepEqual(engine.moves, []);
    assert.deepEqual(engine.log, [STUCK_TEXT.leave]);
  });

  it('in a quest room it leaves the room as /stuck does, with no cooldown', async () => {
    const asked = [];
    const engine = fakeEngine({
      query: (name) => {
        asked.push(name);
        if (name === 'questRoomHere') return { title: 'A room', solved: true };
        if (name === 'questRoomLeave') return Promise.resolve({ ok: true });
        return null;
      },
      param: () => null,
    });
    runStuckFromMenu(engine);
    await flush();
    await flush();
    assert.ok(asked.includes('questRoomLeave'));
    assert.deepEqual(engine.log, [STUCK_TEXT.doneQuestRoomSolved]);
    assert.equal(slashCommandsFeature._state().stuckAt, 0);
  });

  it('does nothing before the game has started (the start card is up)', () => {
    const engine = fakeEngine({ started: false });
    assert.equal(runStuckFromMenu(engine), false);
    assert.deepEqual(engine.log, []);
  });
});
