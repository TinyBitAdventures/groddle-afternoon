/**
 * R18 part 2 (G974, G500, G557 #125): every item picker hands over the copy the player chose, not
 * just its type. In Glitch each copy was its own itemstack (stackmax 1, instance props: items/pick.js,
 * firefly_jar.js, npc_cubimal_chick.js, potion_favor.js, still.js, teleportation_script.js,
 * metalmaker.js 13-19) and give, mail, auctions and the Butler took the itemstack chosen (main.js
 * doVerb 2926-3250). The shared rules are js/copy-picks.js; the pickers are Give and Gift Box wrap
 * (gifts-feature), mail (player-mail-feature, game.js renderPlayerMailCompose), the auction post
 * (auctions-feature), the Butler's gift (butler-feature giveMenu) and package (neighbours-mp-feature
 * leavePackage), machine set-down (home-machines-feature) and storage (home-storage-feature).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { addItem, countItem, createInventory, removeItem } from '../public/js/inventory.js?v=3be7988a';
import {
  TOOL_CONDITION_CATALOG,
  bindToolInventory,
  copyTags,
  createToolConditionState,
  setCopyTag,
  setToolRemaining,
  toolCopies,
} from '../public/js/tools.js?v=4156bba8';
import { copyNote, copyPicks, copyWire, markLeaving, packPicks, pickKey, pickRanks, takeCopies } from '../public/js/copy-picks.js?v=b368fd49';
import { scriptTag } from '../public/js/teleportation.js?v=cbbc673f';
import { playerMailFeature } from '../public/js/features/player-mail-feature.js?v=f2efd40f';
import { MAIL_COMPANIONS, createMailboxState, sendMail } from '../public/js/mailbox.js?v=d50d0d05';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, 'public', rel), 'utf8');

function pack(items = {}) {
  const inv = createInventory({});
  const state = bindToolInventory(createToolConditionState(), inv);
  for (const [c, n] of Object.entries(items)) addItem(inv, c, n);
  return { inv, state };
}
const wear = (state, c) => toolCopies(state, c).map((x) => x.remaining);

const A = { tsid: 'GA5101HF7F429V5', x: 100, y: -68, label: 'Hechey Track', hubId: '58', hubName: 'Groddle Forest' };
const B = { tsid: 'GCR10NQRPKJ16H6', x: 300, y: -90, label: 'Sylvan Grove', hubId: '58', hubName: 'Groddle Forest' };

describe('R18 copy picks: one choice per copy that differs, labelled', () => {
  it('worn tools: alike ones share a choice with their count, a worn one is its own', () => {
    const { state } = pack({ pick: 3 });
    assert.equal(copyPicks(state, 'pick'), null, 'three new picks: one choice for the class');
    setToolRemaining(state, 'pick', 45, { copy: 1 });
    const picks = copyPicks(state, 'pick');
    assert.deepEqual(picks.map((p) => [p.copy, p.copies, p.count, p.note]), [[0, [0, 2], 2, '100/100'], [1, [1], 1, '45/100']]);
    setToolRemaining(state, 'pick', 0, { copy: 2 });
    assert.deepEqual(copyPicks(state, 'pick').map((p) => p.note), ['100/100', '45/100', 'Broken']);
  });

  it('words tell copies apart: a Cubimal\'s name, a Draught\'s Giant, a Still\'s Hooch, a pumpkin\'s phrases, a script\'s street', () => {
    const { state } = pack({ npc_cubimal_chick: 2, potion_favor: 2, still: 2, pumpkin_lit_1: 2, teleportation_script: 2 });
    setCopyTag(state, 'npc_cubimal_chick', 0, 'Rufus');
    assert.deepEqual(copyPicks(state, 'npc_cubimal_chick').map((p) => p.note), ['“Rufus”', 'No name']);
    setCopyTag(state, 'potion_favor', 0, 'alph');
    setCopyTag(state, 'potion_favor', 1, 'ti');
    setToolRemaining(state, 'potion_favor', 3, { copy: 1 });
    assert.deepEqual(copyPicks(state, 'potion_favor').map((p) => p.note), ['Alph · 11 uses left', 'Tii · 3 uses left']);
    setCopyTag(state, 'still', 1, { hopper: 5, hooch: 12, workingSince: 0 });
    assert.deepEqual(copyPicks(state, 'still').map((p) => p.note), ['0 Hooch', '12 Hooch']);
    setCopyTag(state, 'pumpkin_lit_1', 1, ['Boo to you, my friend forever']);
    assert.deepEqual(copyPicks(state, 'pumpkin_lit_1').map((p) => p.note), ['No phrases', '“Boo to you, my fr…”']);
    setCopyTag(state, 'teleportation_script', 0, scriptTag({ destination: A }));
    setCopyTag(state, 'teleportation_script', 1, scriptTag({ destination: B }));
    const scripts = copyPicks(state, 'teleportation_script');
    assert.deepEqual(scripts.map((p) => p.note), ['Hechey Track', 'Sylvan Grove']);
    assert.match(scripts[0].title, /Teleportation Script to Hechey Track, Groddle Forest/);
  });

  it('contents tell copies apart: Fireflies in a jar, a Bear\'s upgrades, a machine\'s fuel, uses left', () => {
    const { state } = pack({ firefly_jar: 2, emotional_bear: 2, metalmaker: 2, potion_xp: 2 });
    setToolRemaining(state, 'firefly_jar', 3, { copy: 0 });
    assert.deepEqual(copyPicks(state, 'firefly_jar').map((p) => p.note), ['3 Fireflies', '0 Fireflies']);
    setToolRemaining(state, 'emotional_bear', 3, { copy: 1 });
    assert.deepEqual(copyPicks(state, 'emotional_bear').map((p) => p.note), ['No upgrades', 'Lips, Moon']);
    setToolRemaining(state, 'metalmaker', 30, { copy: 1 });
    assert.deepEqual(copyPicks(state, 'metalmaker').map((p) => p.note), ['Fuel 200/200', 'Fuel 30/200']);
    setToolRemaining(state, 'potion_xp', 2, { copy: 1 });
    assert.deepEqual(copyPicks(state, 'potion_xp').map((p) => p.note), ['5 uses left', '2 uses left']);
    assert.equal(copyNote('cherry', 1), '', 'not a class with copies');
  });

  it('a single copy with words is still named (its picker tile says whose it is)', () => {
    const { state } = pack({ npc_cubimal_chick: 1 });
    setCopyTag(state, 'npc_cubimal_chick', 0, { name: 'Pip', level: 3, xp: 40 });
    assert.deepEqual(copyPicks(state, 'npc_cubimal_chick').map((p) => p.note), ['“Pip” · Level 3']);
  });

  it('packPicks: the picker\'s items, one per choice, the count and How many that choice\'s, keys apart', () => {
    const { state } = pack({ pick: 3, cherry: 12 });
    setToolRemaining(state, 'pick', 45, { copy: 1 });
    const items = packPicks(state, [{ c: 'cherry', label: 'Cherries', count: 12, max: 12 }, { c: 'pick', label: 'Pick', count: 3, max: 3 }]);
    assert.deepEqual(items.map((it) => [it.key, it.count, it.max, it.copy ?? null]), [['cherry', 12, 12, null], ['pick#0', 2, 2, 0], ['pick#1', 1, 1, 1]]);
    assert.equal(pickKey('pick', { copy: 1 }), 'pick#1');
    assert.equal(pickKey('pick'), 'pick');
  });
});

describe('R18 a hand-over takes the copy chosen', () => {
  it('one copy: takeToolCopy({ copy }) moves it last, so the count going down takes it and the others keep theirs', () => {
    const { inv, state } = pack({ pick: 3 });
    setToolRemaining(state, 'pick', 10, { copy: 0 });
    setToolRemaining(state, 'pick', 45, { copy: 1 });
    const chosen = copyPicks(state, 'pick').find((p) => p.note === '10/100');
    assert.deepEqual(copyWire('pick', chosen, 1), { r: 10 });
    assert.deepEqual(takeCopies(state, 'pick', chosen, 1), [0]);
    removeItem(inv, 'pick', 1);
    assert.deepEqual(wear(state, 'pick'), [45, 100], 'the worn one left, not the last');
  });

  it('several alike: the ones chosen go, and the one that differs stays', () => {
    const { inv, state } = pack({ potion_xp: 4 });
    setToolRemaining(state, 'potion_xp', 1, { copy: 2 });
    const full = copyPicks(state, 'potion_xp').find((p) => p.r === 5);
    assert.equal(full.count, 3);
    takeCopies(state, 'potion_xp', full, 3);
    removeItem(inv, 'potion_xp', 3);
    assert.deepEqual(wear(state, 'potion_xp'), [1]);
  });

  it('words go with the one copy chosen; two at once carry none (one copy\'s words at a time on the wire)', () => {
    const { inv, state } = pack({ teleportation_script: 2 });
    setCopyTag(state, 'teleportation_script', 0, scriptTag({ destination: A }));
    setCopyTag(state, 'teleportation_script', 1, scriptTag({ destination: B }));
    const first = copyPicks(state, 'teleportation_script')[0];
    assert.equal(copyWire('teleportation_script', first, 1).t.tsid, A.tsid);
    assert.equal(copyWire('teleportation_script', first, 2).t, undefined);
    takeCopies(state, 'teleportation_script', first, 1);
    removeItem(inv, 'teleportation_script', 1);
    assert.deepEqual(copyTags(state, 'teleportation_script').map((t) => t.tsid), [B.tsid]);
  });

  it('a pack that moved before the answer: the chosen copy is found again by what it holds', () => {
    const { inv, state } = pack({ pick: 3 });
    setToolRemaining(state, 'pick', 45, { copy: 1 });
    const chosen = copyPicks(state, 'pick').find((p) => p.r === 45);
    // Something else moved it to the front in the meantime (a bag, a drag).
    const row = state.condition.pick;
    row.copies = [45, 100, 100];
    assert.deepEqual(pickRanks(state, 'pick', chosen, 1), [0]);
    takeCopies(state, 'pick', chosen, 1);
    removeItem(inv, 'pick', 1);
    assert.deepEqual(wear(state, 'pick'), [100, 100]);
    assert.equal(countItem(inv, 'pick'), 2);
  });

  it('the slot it sits in is the one that empties (bags-feature packTakeUnit)', () => {
    const { state } = pack({ pick: 3 });
    setToolRemaining(state, 'pick', 45, { copy: 2 });
    const asked = [];
    const engine = { toolState: state, query: (name, ...args) => { asked.push([name, args[0], args[1], args[2]]); return true; } };
    markLeaving(engine, 'pick', copyPicks(state, 'pick')[1], 1);
    assert.deepEqual(asked, [['packTakeUnit', 'pick', 2, 1]]);
    assert.equal(markLeaving(engine, 'pick', { c: 'pick' }, 1), 0, 'a pick for the whole class marks nothing');
  });

  it('every class with copies of its own, two that differ: each choice carries a copy and its own wire', () => {
    const missing = [];
    for (const [c, def] of Object.entries(TOOL_CONDITION_CATALOG)) {
      const { state } = pack({ [c]: 2 });
      if (def.tags) setCopyTag(state, c, 0, { name: 'Rufus', giant: 'alph', phrases: ['Boo'], still: { hopper: 1, hooch: 2, workingSince: 0 }, script: scriptTag({ destination: A }) }[def.tag] ?? null);
      if (def.capacity > 1) setToolRemaining(state, c, 1, { copy: 1 });
      const items = packPicks(state, [{ c, label: c, count: 2, max: 2 }]);
      if (items.length < 2 || items.some((it) => !Number.isInteger(it.copy) || !copyWire(c, it, 1))) missing.push(c);
    }
    assert.deepEqual(missing, [], 'a picker over these would hand over the class without the copy');
  });
});

describe('R18 every picker uses the copy picks', () => {
  const pickers = {
    'Give and Gift Box wrap': 'js/features/gifts-feature.js',
    'auction post': 'js/features/auctions-feature.js',
    mail: 'js/features/player-mail-feature.js',
    "the Butler's gift": 'js/features/butler-feature.js',
    "the Butler's package": 'js/features/neighbours-mp-feature.js',
    'machine set-down': 'js/features/home-machines-feature.js',
  };

  it('a new item picker cannot skip it: every file that builds one imports js/copy-picks.js', () => {
    const files = [];
    const walk = (dir) => {
      for (const e of readdirSync(join(root, 'public', dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (e.name.endsWith('.js') && rel !== 'js/ui/item-picker.js' && /createItemPicker\(/.test(read(rel))) files.push(rel);
      }
    };
    walk('js');
    assert.ok(files.length >= 3, files.join(', '));
    for (const f of files) assert.match(read(f), /from '\.\.\/copy-picks\.js/, `${f} builds an item picker without copy picks`);
  });

  it('no picker sends a class\'s wear or words without first asking for the chosen copy\'s (copyWire)', () => {
    for (const [name, f] of Object.entries(pickers)) {
      const src = read(f);
      assert.match(src, /from '\.\.\/copy-picks\.js/, name);
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        if (!/leavingToolWear\(|leavingCopyTag\(/.test(line) || /^\s*(\*|\/\/|import)/.test(line)) return;
        const before = lines.slice(Math.max(0, i - 8), i).join('\n');
        assert.match(before, /copyWire\(|rank >= 0|chosen != null/, `${name} (${f}:${i + 1}) sends wear or words for the class, not the copy chosen`);
      });
    }
  });

  it('Give: each copy that differs is its own choice; the one given carries its own wear and words, and leaves', () => {
    const src = read('js/features/gifts-feature.js');
    assert.match(src, /const picks = engine\.toolState \? copyPicks\(engine\.toolState, c\) : null;/);
    assert.match(src, /copyWire\(p\.c, p, item\.n\)/);
    assert.match(src, /markLeaving\(engine, p\.c, giveCopy\.pick, frame\.item\.n, 60000\)/);
    assert.match(src, /tool\.pick\) takeCopies\(engine\.toolState, c, tool\.pick, -d\)/);
    // G605: a Plop given takes its seeds, as a dropped one does.
    assert.match(src, /plopSeedsOut/);
    assert.match(src, /plopSeedsIn/);
  });

  it('Gift Box wrap: the copy chosen goes in the box with its wear and words, and is the one taken', () => {
    const src = read('js/features/gifts-feature.js');
    assert.match(src, /const items = packPicks\(engine\.toolState, rows\.map/);
    assert.match(src, /copyWire\(p\.c, p, p\.n\)/);
    assert.match(src, /markLeaving\(engine, c, p, -d\)\) takeCopies\(engine\.toolState, c, p, -d\)/);
  });

  it('auction post: the copy chosen is listed with its wear and words and leaves when the site lists it', () => {
    const src = read('js/features/auctions-feature.js');
    assert.match(src, /packPicks\(engine\.toolState, stacks\.map/);
    assert.match(src, /onPick: \(it\) => choose\(it\.c, it\)/);
    assert.match(src, /copyWire\(c, chosen, n\)/);
    assert.match(src, /chosen\?\.c === c && engine\.toolState\) takeCopies\(engine\.toolState, c, chosen, -d\)/);
  });

  it('the Butler\'s gift and a visitor\'s package: the copy chosen (or dragged) is the one that leaves', () => {
    const butler = read('js/features/butler-feature.js');
    assert.match(butler, /const items = packPicks\(engine\.toolState, slots\.map/);
    assert.match(butler, /give: \(\{ cls, count, copy, ds \}\) => giveMenu\(engine, \{ cls, count, copy, ds \}\)/);
    assert.equal((butler.match(/takeCopies\(engine\.toolState, (chosen|cls), pick, n\)/g) || []).length, 2, 'solo and through the site');
    const visit = read('js/features/neighbours-mp-feature.js');
    assert.match(visit, /copyPicks\(engine\.toolState, c\)/);
    assert.match(visit, /st\.pick\?\.copies\.includes\(drop\.copy\)/);
    assert.match(visit, /takeCopies\(engine\.toolState, item\.c, leaving\.pick, item\.n\)/);
  });

  it('machine set-down: the machine whose menu it was goes down with its own tank', () => {
    const src = read('js/features/home-machines-feature.js');
    assert.match(src, /placeFromPack\(classTsid, opts\?\.copy \?\? null\)/);
    assert.match(src, /takeToolCopy\(engine\.toolState, classTsid, \{ copy: one \?\? undefined, take: false \}\)/);
    assert.match(src, /takeCopies\(engine\.toolState, classTsid, chosen, 1\)/);
  });

  it('storage: the copies that go in are the ones whose wear and words go in, the chosen one first', () => {
    const src = read('js/features/home-storage-feature.js');
    assert.match(src, /const moved = pickToolCopies\(engine\.toolState, cls, ranks\)/);
    assert.match(src, /\{ copy: Number\.isInteger\(opts\?\.copy\) \? opts\.copy : null \}/);
  });
});

describe('R18 mail: Attach offers each copy, the letter carries it and it is the one that leaves', () => {
  const saved = {};
  const sent = [];
  before(() => {
    for (const k of ['document', 'fetch', 'GRODDLE_MP_BOOT', 'groddlePlayerMail']) saved[k] = globalThis[k];
    globalThis.document = { baseURI: 'https://groddle.localhost/' };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.fetch = (url, init = {}) => {
      const path = String(url).replace('https://groddle.localhost/wp-json/groddle/v1/', '');
      let body = { letters: [], sent: [], receipts: [] };
      if (path.startsWith('mail') && init.method === 'POST') {
        const letter = JSON.parse(init.body);
        sent.push(letter);
        body = {
          status: 'sent',
          letter: { id: letter.id, to: { id: 7, name: 'Ada' }, text: letter.text, item: letter.item, sent: Date.now(), postage: 2 },
          receipt: { op: `mail-${letter.id}-s`, gave: { items: [{ c: letter.item.c, n: letter.item.n }], currants: 2 } },
        };
      }
      return Promise.resolve({ status: 200, ok: true, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });
    };
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('two Cubimals, one named: Attach lists each; the named one goes with its name and leaves', async () => {
    const { inv, state } = pack({ npc_cubimal_chick: 2, cherry: 3 });
    setCopyTag(state, 'npc_cubimal_chick', 0, 'Rufus');
    const engine = {
      mode: 'multiplayer', inv, toolState: state, pc: { currants: 100 },
      query: (name) => (name === 'ledgerReceipt' ? true : null),
      mailMessages: () => [], save() {}, setData() {}, toast() {}, pushActivity() {}, updateHud() {}, refreshPack() {}, recordSentMail() {},
    };
    playerMailFeature.init(engine);
    const compose = playerMailFeature.mailCompose(engine);
    const slots = [{ classTsid: 'cherry', label: 'Cherry', count: 3 }, { classTsid: 'npc_cubimal_chick', label: 'Chick Cubimal', count: 2 }];
    const options = compose.attachable(slots);
    assert.deepEqual(options.map((o) => [o.key, o.label]), [['cherry', 'Cherry'], ['npc_cubimal_chick#0', 'Chick Cubimal (“Rufus”)'], ['npc_cubimal_chick#1', 'Chick Cubimal (No name)']]);
    const named = options[1];
    const res = await playerMailFeature.mailSend({ to: 'Ada', text: 'For you', item: { c: named.classTsid, n: 1, copy: named.copy, copies: named.copies, r: named.r, t: named.t }, currants: 0 }, engine);
    assert.equal(res?.ok, true, JSON.stringify(res));
    assert.equal(sent[0].item.t, 'Rufus', 'the letter carries the name');
    assert.equal(countItem(inv, 'npc_cubimal_chick'), 1);
    assert.deepEqual(copyTags(state, 'npc_cubimal_chick'), [null], 'the named one left; the other stays');
    assert.match(read('game.js'), /const attachable = online\.attachable \? online\.attachable\(packSlots\) : packSlots;/);
  });
});

describe('R18 solo mail (G974): a letter to a companion takes the copy chosen in Attach, not the last', () => {
  it('two Cubimals, one named: the named one is picked and leaves; the other stays', () => {
    const { inv, state } = pack({ npc_cubimal_chick: 2 });
    setCopyTag(state, 'npc_cubimal_chick', 0, 'Rufus');
    const options = packPicks(state, [{ c: 'npc_cubimal_chick', classTsid: 'npc_cubimal_chick', label: 'Chick Cubimal', count: 2 }]);
    const named = options.find((o) => o.note === '“Rufus”');
    const marked = [];
    const engine = { toolState: state, query: (name, c, rank, n) => marked.push([name, c, rank, n]) };
    const player = { currants: 100 };
    const res = sendMail(createMailboxState(), player, inv, {
      recipient: MAIL_COMPANIONS[0],
      text: 'For you',
      attachment: { classTsid: 'npc_cubimal_chick', count: 1 },
      attachmentBaseCost: 10,
      beforeTake: () => { if (markLeaving(engine, 'npc_cubimal_chick', named, 1)) takeCopies(state, 'npc_cubimal_chick', named, 1); },
    });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(countItem(inv, 'npc_cubimal_chick'), 1);
    assert.deepEqual(copyTags(state, 'npc_cubimal_chick'), [null], 'the named one left');
    assert.deepEqual(marked, [['packTakeUnit', 'npc_cubimal_chick', 0, 1]], 'its own pack slot empties');
  });

  it('a letter that cannot go moves nothing', () => {
    const { inv, state } = pack({ npc_cubimal_chick: 2 });
    let called = 0;
    const res = sendMail(createMailboxState(), { currants: 0 }, inv, {
      recipient: MAIL_COMPANIONS[0], text: 'Hi', attachment: { classTsid: 'npc_cubimal_chick', count: 1 }, attachmentBaseCost: 10, beforeTake: () => { called += 1; },
    });
    assert.equal(res.ok, false);
    assert.equal(called, 0);
    assert.equal(countItem(inv, 'npc_cubimal_chick'), 2);
  });

  it('game.js: solo Attach offers each copy and sends the chosen one', () => {
    const src = read('game.js');
    const solo = src.slice(src.indexOf('function renderMailboxCompose('), src.indexOf('function themeMailPickers('));
    assert.match(solo, /const attachable = packPicks\(toolState, mailAttachSlots\(listPackSlots\(inv\)\)/);
    assert.match(solo, /beforeTake: pick \? \(\) => \{ if \(markLeaving\(engine, classTsid, pick, count\)\) takeCopies\(toolState, classTsid, pick, count\); \} : null/);
  });
});
