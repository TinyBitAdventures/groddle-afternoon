/** Street furniture: mailboxes, notes, notice boards, Visiting Stones (js/street-furniture.js). */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  BOARD_ART,
  BOARD_CAPACITY,
  BOARD_PINS,
  BOARD_TEXT,
  MAILBOX_ALL_DONE_MS,
  MAILBOX_SHEETS,
  NOTE_ART,
  NOTE_LIMITS,
  NOTE_TEXT,
  PLANNER_GROUP_MAX,
  SOURCE_FURNITURE_COUNTS,
  STONE_ART,
  STONE_TEXT,
  STREET_NOTES,
  boardAddVerb,
  boardArtState,
  boardPinSeeds,
  canOptIn,
  closeMailboxView,
  createMailboxView,
  editNote,
  furniturePlacementGroups,
  furnitureFor,
  insideStoneHitbox,
  mailboxClip,
  noteContent,
  notePositions,
  noteReadVerb,
  noteView,
  noteWriteVerb,
  openMailboxView,
  paperWriteVerb,
  pinNote,
  reconcileCarried,
  stoneVerbs,
  stoneVog,
  streetNoteSeeds,
  takePinnedNote,
  writePaperNote,
} from '../public/js/street-furniture.js?v=1519b13a';
import { REMAKE_NOTE_BYLINE, REMAKE_NOTE_MARKER, isRemakeNote, normalizeNote as normalizeNoteRow } from '../public/js/street-furniture.js?v=1519b13a';
import { streetFurnitureFeature } from '../public/js/features/street-furniture-feature.js?v=2b343941';
import { FEATURES } from '../public/js/features/index.js?v=c822ab1d';
import { createFeatureHost } from '../public/js/feature-host.js?v=e4f648b1';
import { setWildlifeCatalog } from '../public/js/wildlife.js?v=670c3a7f';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const catalog = JSON.parse(readFileSync(join(root, 'assets/content/street-ecology.json'), 'utf8'));

function pngSize(rel) {
  const buf = readFileSync(join(root, rel));
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

const PEN = { learned: ['penmanship_1'], quillWorking: true, playerId: 'player', nowS: 1000 };

describe('archived street furniture populations', () => {
  it('matches the location XML counts (minus the curated-empty Stoot memorial notes)', () => {
    const totals = {};
    for (const row of Object.values(catalog.furniture)) {
      for (const [k, v] of Object.entries(row)) totals[k] = (totals[k] || 0) + v;
    }
    assert.equal(totals.npc_mailbox, SOURCE_FURNITURE_COUNTS.npc_mailbox);
    assert.equal(totals.visiting_stone, SOURCE_FURNITURE_COUNTS.visiting_stone);
    assert.equal(totals.bag_notice_board, SOURCE_FURNITURE_COUNTS.bag_notice_board);
    assert.equal(totals.note, SOURCE_FURNITURE_COUNTS.note - 63);
    assert.equal(furnitureFor(catalog, 'GIFPV9EMLT72DP4'), null);
    assert.equal(furnitureFor(catalog, 'GDOU1UON87E3K2T').note, 59);
    assert.equal(catalog.furnitureStreetCount, Object.keys(catalog.furniture).length);
  });

  it('resolves L aliases', () => {
    assert.deepEqual(furnitureFor(catalog, 'LDOU1UON87E3K2T'), furnitureFor(catalog, 'GDOU1UON87E3K2T'));
  });

  it('asks the planner for each class and caps groups at its 40-point limit', () => {
    const groups = furniturePlacementGroups({ npc_mailbox: 1, visiting_stone: 1, note: 59, bag_notice_board: 1 });
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));
    assert.equal(byKey.furnitureMailbox.count, 1);
    assert.equal(byKey.furnitureStone.count, 1);
    assert.equal(byKey.furnitureBoard.count, 1);
    assert.equal(byKey.furnitureNote.count, PLANNER_GROUP_MAX);
    assert.ok(groups.every((g) => g.clearance >= 40));
    assert.deepEqual(furniturePlacementGroups(null), []);
  });

  it('piles notes beyond the planner points beside earlier ones', () => {
    const points = Array.from({ length: 40 }, (_, i) => ({ x: 100 + i * 50, y: 500 }));
    const out = notePositions(points, 59);
    assert.equal(out.length, 59);
    assert.equal(out[0].x, 100);
    assert.equal(out[40].pile, 1);
    assert.equal(out[40].x, 117);
    assert.deepEqual(notePositions([], 3), []);
  });

  it('authored notes and pins only sit on streets with archived notes and boards', () => {
    for (const [tsid, list] of Object.entries(STREET_NOTES)) {
      const row = furnitureFor(catalog, tsid);
      assert.ok(row?.note >= list.length, `${tsid} has ${row?.note} notes`);
    }
    const boardStreets = Object.entries(catalog.furniture).filter(([, r]) => r.bag_notice_board).map(([t]) => t).sort();
    assert.deepEqual(Object.keys(BOARD_PINS).sort(), boardStreets);
    const authored = [...Object.values(STREET_NOTES).flat(), ...Object.values(BOARD_PINS).flat()];
    for (const n of authored) {
      assert.ok(n.title.length <= NOTE_LIMITS.title && n.text.length <= NOTE_LIMITS.body);
      assert.ok(!n.text.includes('—') && !n.title.includes('—'), 'no em-dashes in authored copy');
    }
  });

  it('seeds uutiif with 12 authored notes and 47 blank ones', () => {
    const seeds = streetNoteSeeds('GDOU1UON87E3K2T', 59);
    assert.equal(seeds.length, 59);
    assert.equal(seeds.filter((n) => noteReadVerb(n).enabled).length, 12);
    assert.equal(noteReadVerb(seeds[58]).reason, 'It is blank :(');
  });
});

describe('recovered art', () => {
  it('uses the exact OGA sheet sizes', () => {
    for (const def of Object.values(MAILBOX_SHEETS)) {
      const [w, h] = pngSize(def.path);
      assert.equal(w % def.fw, 0);
      assert.equal(h % def.fh, 0);
      assert.equal(def.fw, 97);
      assert.equal(def.fh, 146);
      assert.ok(def.frames <= (w / def.fw) * (h / def.fh));
    }
    assert.deepEqual(pngSize(MAILBOX_SHEETS.has_mail.path), [970, 1168]);
    assert.deepEqual(pngSize(MAILBOX_SHEETS.all_done.path), [776, 438]);
    assert.deepEqual(pngSize(MAILBOX_SHEETS.interact.path), [873, 146]);
    assert.deepEqual(pngSize(STONE_ART.path), [STONE_ART.w, STONE_ART.h]);
    assert.deepEqual(pngSize(NOTE_ART.path), [NOTE_ART.w, NOTE_ART.h]);
    assert.deepEqual(pngSize(NOTE_ART.icon), [55, 40]);
    for (let i = 0; i <= BOARD_CAPACITY; i += 1) assert.deepEqual(pngSize(BOARD_ART.path(i)), [212, 147]);
  });
});

describe('street mailbox states (npc_mailbox.js)', () => {
  it('shows has_mail, interact, all_done for 2 s, then idle', () => {
    const view = createMailboxView();
    assert.equal(mailboxClip(view, 2, 0), 'has_mail');
    assert.equal(mailboxClip(view, 0, 0), 'idle');
    openMailboxView(view);
    assert.equal(mailboxClip(view, 2, 0), 'interact');
    closeMailboxView(view, 1000);
    assert.equal(MAILBOX_ALL_DONE_MS, 2000);
    assert.equal(mailboxClip(view, 0, 2999), 'all_done');
    assert.equal(mailboxClip(view, 0, 3000), 'idle');
    assert.equal(mailboxClip(view, 1, 3000), 'has_mail');
  });
});

describe('notes (note.js / paper.js)', () => {
  const placed = { id: 's0', initialTitle: 'Breathe', initialText: 'In through the nose.' };

  it('reads initial text and disables blank notes', () => {
    assert.deepEqual(noteContent(placed), { title: 'Breathe', body: 'In through the nose.' });
    assert.equal(noteReadVerb(placed).enabled, true);
    assert.deepEqual(noteReadVerb({ id: 'x' }), { id: 'read', label: 'Read', tooltip: 'What does it say?', enabled: false, reason: NOTE_TEXT.blank });
    assert.equal(noteContent({}).title, 'A note!');
  });

  it('gates write on behind Penpersonship and a working Quill', () => {
    assert.equal(noteWriteVerb(placed, {}).reason, 'You need to know Penpersonship.');
    assert.equal(noteWriteVerb(placed, { learned: ['penmanship_1'] }).reason, 'You need a working quill.');
    assert.equal(noteWriteVerb(placed, PEN).enabled, true);
    assert.equal(noteWriteVerb({ ...placed, lastEditor: 'someone' }, PEN), null);
  });

  it('shows "This is not your note." in the view until you write on it', () => {
    assert.equal(noteView(placed, PEN).disabledReason, NOTE_TEXT.notYours);
    const out = editNote(placed, { title: 'Mine', body: 'Now' }, PEN);
    assert.equal(noteView(out.note, PEN).canEdit, true);
  });

  it('edits truncate, clear the initial text, keep 10 history rows and use the Quill once', () => {
    let note = placed;
    for (let i = 0; i < 12; i += 1) {
      const out = editNote(note, { title: 'T'.repeat(200), body: `B${i}`.padEnd(1200, 'x') }, PEN);
      assert.equal(out.ok, true);
      assert.equal(out.costs.quillWear, 1);
      note = out.note;
    }
    assert.equal(note.title.length, 150);
    assert.equal(note.body.length, 1000);
    assert.equal(note.history.length, 10);
    assert.equal(note.initialText, '');
    assert.equal(note.lastEditor, 'player');
    const same = editNote(note, { title: note.title, body: note.body }, PEN);
    assert.equal(same.unchanged, true);
    assert.equal(same.costs.quillWear, 0);
    assert.equal(editNote(note, { body: 'x' }, { ...PEN, quillWorking: false }).error, NOTE_TEXT.quillGone);
  });

  it('turns one Paper into a Note (paper.js), never an empty one', () => {
    assert.equal(paperWriteVerb({}).reason, 'You need to learn Penpersonship.');
    assert.equal(paperWriteVerb({ learned: ['penmanship_1'] }).reason, "You'll need a Quill first.");
    assert.equal(writePaperNote([], { title: '', body: '  ' }, { ...PEN, paper: 1 }).empty, true);
    assert.equal(writePaperNote([], { title: 'Hi' }, { ...PEN, paper: 0 }).error, "Wha? Where'd the paper go?");
    const out = writePaperNote([], { title: 'Hi', body: 'there' }, { ...PEN, paper: 1, nextId: 7 });
    assert.equal(out.ok, true);
    assert.equal(out.note.id, 'n7');
    assert.deepEqual(out.costs, { paper: 1, quillWear: 1 });
    assert.equal(out.notes.length, 1);
  });

  it('keeps carried note texts in step with the pack count', () => {
    const a = { id: 'n1', title: 'a' };
    const b = { id: 'n2', title: 'b' };
    assert.deepEqual(reconcileCarried([a, b], 1, 3).notes.map((n) => n.id), ['n1']);
    const grown = reconcileCarried([a], 3, 3);
    assert.deepEqual(grown.notes.map((n) => n.id), ['n1', 'n3', 'n4']);
    assert.equal(grown.nextId, 5);
  });
});

describe('notice boards (bag_notice_board.js)', () => {
  it('holds ten notes and names its art state m<count>', () => {
    assert.equal(BOARD_CAPACITY, 10);
    assert.equal(boardArtState(3), 'm3');
    assert.equal(boardArtState(14), 'm10');
    const full = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}` }));
    assert.equal(boardAddVerb(full, 2).reason, BOARD_TEXT.full);
    assert.equal(boardAddVerb([], 0).reason, 'You have no notes to add.');
    assert.equal(boardAddVerb([], 1).enabled, true);
    assert.equal(pinNote(full, [{ id: 'n1' }], 'n1').error, BOARD_TEXT.fullAdd);
  });

  it('pins and takes notes', () => {
    const pins = boardPinSeeds('GA5134UPLRU29OH');
    assert.equal(pins.length, 3);
    const added = pinNote(pins, [{ id: 'n1', title: 'mine' }], 'n1');
    assert.equal(added.pins.length, 4);
    assert.equal(added.carried.length, 0);
    const taken = takePinnedNote(added.pins, [], pins[0].id);
    assert.equal(taken.pins.length, 3);
    assert.equal(noteContent(taken.carried[0]).title, 'Tower Social');
  });
});

describe('Visiting Stones (visiting_stone.js)', () => {
  it('offers flip, visit and the opt-in pair with the source gates', () => {
    const ids = (v) => v.map((x) => x.id);
    assert.deepEqual(ids(stoneVerbs({ level: 5, homeOwned: true })), ['flip', 'visit', 'get_visitors']);
    assert.deepEqual(ids(stoneVerbs({ allowVisits: true })), ['flip', 'visit', 'stop_random_visitors']);
    assert.equal(stoneVerbs({ level: 3 }).find((v) => v.id === 'get_visitors').reason, 'You need to reach level 4 first.');
    assert.equal(canOptIn({ level: 4, homeOwned: false }).error, 'no_home');
    assert.equal(canOptIn({ level: 4, homeOwned: true }).ok, true);
  });

  it('keeps the source lines', () => {
    assert.equal(STONE_TEXT.visit, 'Ah — I know just the street to send you to. Ready to go?');
    assert.equal(STONE_TEXT.visitLater, 'Ok, well … come back any time.');
    assert.match(STONE_TEXT.optInDone('your mailbox'), /^Very well\. I will put a word in for you/);
    assert.equal(stoneVog({ level: 1 })[2], 'Later, once you get a little higher level, you can get some visitors through the stones too.');
    assert.equal(stoneVog({ level: 6, homeOwned: true })[2], 'And, if you want s’more visitors you can get them from the stones as well. Go look.');
  });

  it('notices the avatar inside its 1200×1200 hit box', () => {
    assert.equal(insideStoneHitbox({ x: 1000, y: 500 }, { x: 1590, y: 480 }), true);
    assert.equal(insideStoneHitbox({ x: 1000, y: 500 }, { x: 1610, y: 480 }), false);
  });
});

describe('feature wiring', () => {
  it('registers once in the feature list', () => {
    assert.equal(FEATURES.filter((f) => f.id === streetFurnitureFeature.id).length, 1);
    assert.doesNotThrow(() => createFeatureHost(FEATURES));
    assert.ok(existsSync(join(root, 'js/features/street-furniture-feature.js')));
  });

  it('plans furniture from the archived catalog', () => {
    setWildlifeCatalog(catalog);
    const groups = streetFurnitureFeature.placementGroups({}, { tsid: 'GDOU1UON87E3K2T' });
    assert.equal(groups.find((g) => g.key === 'furnitureNote').count, 40);
    setWildlifeCatalog(null);
  });

  it('saves carried notes and neighbour state', () => {
    streetFurnitureFeature.restore({ carried: [{ id: 'n1', title: 'kept' }], nextNoteId: 2, seenStone: true, neighbours: { allowVisits: true, visits: { dorrit: 2, nobody: 3 } } });
    const slice = streetFurnitureFeature.save();
    assert.equal(slice.carried[0].title, 'kept');
    assert.equal(slice.seenStone, true);
    assert.deepEqual(slice.neighbours.visits, { dorrit: 2 });
    assert.equal(slice.neighbours.allowVisits, true);
    streetFurnitureFeature.restore(undefined);
    assert.equal(streetFurnitureFeature.save().carried.length, 0);
  });

  it('G270: a neighbour’s home street loads behind the home card with its own last visit', () => {
    streetFurnitureFeature.restore({ neighbours: { visits: { dorrit: 2 } } });
    const slots = {};
    const engine = { streetSlot: (id, tsid) => ((slots[`${tsid}|${id}`] ||= {})) };
    const t0 = Date.UTC(2026, 9, 25, 12);
    // A save from before the card: its two visits count, with no time ("just moments ago").
    assert.deepEqual(streetFurnitureFeature._neighbourVisit(engine, 'dorrit', t0), { firstVisit: false, visitCount: 2, lastVisitMins: 0 });
    assert.deepEqual(slots['NB_dorrit|street-visits'], { visits: 3, lastAt: t0 });
    assert.deepEqual(streetFurnitureFeature._neighbourVisit(engine, 'dorrit', t0 + 95 * 60000), { firstVisit: false, visitCount: 3, lastVisitMins: 95 });
    // Each neighbour keeps its own.
    assert.deepEqual(streetFurnitureFeature._neighbourVisit(engine, 'juniper', t0), { firstVisit: true, visitCount: 0, lastVisitMins: 0 });
    streetFurnitureFeature.restore(undefined);
    const feature = readFileSync(join(root, 'js/features/street-furniture-feature.js'), 'utf8');
    assert.match(feature, /pol: \{ type: 'exterior', ownerName: neighbour\.name, visit \},/);
    assert.match(feature, /details: \(\) => loadingCardDetails\(\{ targets: engine\.interactables \|\| \[\], visit \}\),/);
    assert.ok(!/No deed needed/.test(feature));
  });

  it('blocks map travel out of a neighbour street and reloads to the way home', () => {
    streetFurnitureFeature.restore({ neighbours: { returnTo: { tsid: 'GLI2V0UN7RD1T2J', x: 10, y: 20 } } });
    const gate = streetFurnitureFeature.travelGate('GLI2V0UN7RD1T2J', { streetTsid: 'NB_dorrit' });
    assert.equal(gate.ok, false);
    assert.equal(streetFurnitureFeature.travelGate('GLI2V0UN7RD1T2J', { streetTsid: 'GLI2V0UN7RD1T2J' }), null);
    assert.deepEqual(streetFurnitureFeature.reloadLocation({ tsid: 'NB_dorrit' }), { tsid: 'GLI2V0UN7RD1T2J', x: 10, y: 20 });
    assert.equal(streetFurnitureFeature.reloadLocation({ tsid: 'GLI2V0UN7RD1T2J' }), null);
    streetFurnitureFeature.restore(undefined);
  });
});


describe('remake text is labelled as such (G175)', () => {
  const PEN_EDIT = { learned: ['penmanship_1'], quillWorking: true, playerId: 'player', nowS: 1000 };

  it('every authored note and pin carries the remake flag, and its seeds keep it', () => {
    for (const row of [...Object.values(STREET_NOTES).flat(), ...Object.values(BOARD_PINS).flat()]) assert.equal(row.remake, true, row.title);
    for (const tsid of ['GCR101Q98A12EHH', 'GA9MU59GB792T80']) {
      const pins = boardPinSeeds(tsid);
      assert.ok(pins.length > 0, tsid);
      for (const pin of pins) {
        assert.equal(pin.remakeText, true);
        assert.equal(isRemakeNote(pin), true);
      }
    }
    const [meadowNote] = streetNoteSeeds('GCR101Q98A12EHH', 1);
    assert.equal(isRemakeNote(meadowNote), true);
    assert.equal(isRemakeNote(streetNoteSeeds('GDOU1UON87E3K2T', 59)[58]), false, 'a blank note is nobody\'s text');
  });

  it('an older save without the flag is still matched by its text; a player\'s words are not', () => {
    const old = normalizeNoteRow({ id: 'b0', initialTitle: BOARD_PINS.GCR101Q98A12EHH[0].title, initialText: BOARD_PINS.GCR101Q98A12EHH[0].text });
    assert.equal(old.remakeText, undefined);
    assert.equal(isRemakeNote(old), true);
    const out = editNote(boardPinSeeds('GCR101Q98A12EHH')[0], { title: 'Mine', body: 'My own words' }, PEN_EDIT);
    assert.equal(out.ok, true);
    assert.equal(isRemakeNote(out.note), false);
    assert.equal(isRemakeNote(normalizeNoteRow({ id: 'x', initialTitle: 'Someone', initialText: 'Not ours' })), false);
  });

  it('the marker and byline are plain words', () => {
    for (const text of [REMAKE_NOTE_MARKER, REMAKE_NOTE_BYLINE]) {
      assert.ok(text.length > 0 && !text.includes('—'));
    }
    assert.match(REMAKE_NOTE_MARKER, /remake/i);
  });
});
