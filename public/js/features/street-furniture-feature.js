/**
 * Street furniture and the social web of Ur, solo-friendly (see
 * js/feature-host.js). Rules live in js/street-furniture.js (mailboxes, notes,
 * notice boards, Visiting Stones) and js/neighbours.js (neighbour homes).
 *
 * - Street Mailboxes (265 archived) open the same mail as the home Mailbox (1)
 *   through engine.openMailbox(), with the per-player npc_mailbox.js states:
 *   has_mail (73-frame wobble) while you have unread mail, interact while the
 *   mail is open, all_done for two seconds after, then idle. No home needed.
 * - Notes (135 archived; 63 sit on the curated-empty Stoot memorial and stay
 *   unspawned) can be read, written on (Penpersonship + a working Quill, one
 *   Quill use) and picked up. Paper becomes a Note through the pack ("Write
 *   on"); carried notes keep their text and can be read from the pack.
 * - Notice Boards (7 archived) hold up to 10 notes: view, read, take, add.
 * - Visiting Stones (199 archived): flip, visit, get visitors, stop random
 *   visitors, and the first-sighting VOG. "Visit" sends you to a neighbour's
 *   home street (js/features/neighbour-scene.js) with a door note, one small
 *   job, a mailbox to post a note in, and a stone home.
 *
 * Art: recovered CC0 OGA npc_mailbox (mailboxLeft) 97×146 sheets,
 * visiting_stone 101×155, note 45×14 world / 55×40 iconic, bag_notice_board
 * m0..m10 212×147, bag_gift_box(_wrapped) 56×49 / 52×49
 * (assets/sprites/street-furniture/, extracted to
 * opengameart/extracted_street_furniture).
 *
 * QA: ?autostart=1&fresh=1&mailboxdemo=street (&mailboxautoplay=open|close)
 *     ?autostart=1&fresh=1&notedemo=1 (&noteautoplay=read|write|board|paper)
 *     ?autostart=1&fresh=1&stonedemo=1&stoneautoplay=1 (=home|back|flip, =optin with &homedemo=owned,
 *       &stoneneighbour=dorrit|pemberton|juniper|hadwin|tamsin|fenwick,
 *       &neighbourspawn=house|chore to land beside the house or the chore)
 * Canvas data: furnitureRow, furnitureMailboxes, furnitureStones,
 * furnitureNotes, furnitureBoards, mailboxClip, notesCarried, boardPins,
 * stoneDir, stoneSeen, visitAllow, neighbourId, neighbourVisits,
 * neighbourChore, neighbourLetters, furnitureLast.
 */

import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js?v=g446-4';
import { nearestSurfaceY } from '../walk-surface.js?v=g442-6';
import { loadWildlifeCatalog, wildlifeCatalog } from '../wildlife.js';
import { ITEM_CATALOG, addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=catalog-unified-7';
import { canUseTool, useToolCondition } from '../tools.js?v=woodcutting-test-8';
import { getGameDayKey } from '../game-day.js?v=dametime-4';
import { runStreetTransition } from '../screen-fx.js?v=g434-1';
import { STREET_VISITS_SLOT, loadingCardDetails, recordStreetEntry, streetLoadingVisit } from '../exploration.js';
import {
  BOARD_ART,
  BOARD_CAPACITY,
  BOARD_CLASS,
  BOARD_TEXT,
  FURNITURE_GROUPS,
  MAILBOX_CLASS,
  MAILBOX_SHEETS,
  NOTE_ART,
  NOTE_CLASS,
  NOTE_ITEM,
  NOTE_LIMITS,
  NOTE_TEXT,
  PAPER_CLASS,
  PENMANSHIP_SKILL,
  QUILL_CLASS,
  STONE_ART,
  STONE_BUTLER_STANDIN,
  STONE_CLASS,
  STONE_TEXT,
  boardAddVerb,
  boardArtState,
  boardPinSeeds,
  canOptIn,
  closeMailboxView,
  createMailboxView,
  editNote,
  clearOfDoors,
  fixedFurniturePoints,
  furniturePlacementGroups,
  furnitureFor,
  insideStoneHitbox,
  mailboxClip,
  mailboxSubtitle,
  normalizeNote,
  noteContent,
  notePositions,
  noteReadVerb,
  noteView,
  noteWriteVerb,
  openMailboxView,
  paperWriteVerb,
  pinNote,
  REMAKE_NOTE_BYLINE,
  REMAKE_NOTE_MARKER,
  isRemakeNote,
  reconcileCarried,
  stoneVerbs,
  stoneVog,
  streetNoteSeeds,
  takePinnedNote,
  writePaperNote,
} from '../street-furniture.js?v=g442-6';
import {
  CHORES,
  NEIGHBOURS,
  NEIGHBOUR_ITEMS,
  NEIGHBOUR_SCENE,
  choreVerb,
  doChore,
  homeStreetLabel,
  isNeighbourSceneTsid,
  neighbourById,
  neighbourLayout,
  neighbourSceneTsid,
  normalizeNeighbourState,
  pickNeighbour,
  postNoteReply,
  postNoteVerb,
  recordVisit,
  visitorLetter,
} from '../neighbours.js?v=neighbours-4';
import { buildNeighbourBackground, neighbourLoadingColors, neighbourPlatforms } from './neighbour-scene.js?v=neighbours-4';
import { closeNoteView, noteViewOpen, openBoardView, openNotePicker, openNoteView } from '../note-view.js?v=note-g175';
import { textureFromUrl } from '../textures.js';
import { butlerApi } from './butler-feature.js?v=g448-3';
import { neighboursMpApi } from './neighbours-mp-feature.js?v=g448-3';
import { itemZ } from '../item-bands.js?v=g429-1';

export const FURNITURE_FEATURE_ID = 'street-furniture';
const PLAYER_ID = 'player';
const DIR = 'assets/sprites/street-furniture/';
const GIFT_ART = Object.freeze({ wrapped: `${DIR}gift-box-wrapped.png`, open: `${DIR}gift-box-open.png` });
const DECO = 'assets/decos/groddle/';
/** Hechey Track, the street index default, if a visit somehow lost its way home. */
const DEFAULT_RETURN_TSID = 'GLI2V0UN7RD1T2J';

/** The first time a street mailbox opens, the post office explains itself. */
export const STREET_MAIL_WELCOME = Object.freeze({
  sender: 'Tiny Speck Post',
  text: 'Every mailbox in Ur opens the same mail: yours. Write to a friend from any street, and collect your deliveries wherever you happen to be.',
});

const DEMO_NOTE = Object.freeze({
  title: 'Hello, traveller',
  text: 'If you can read this, somebody left it for you. Pick it up, pin it to a board, or write on it with a Quill.',
});

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let loader = null;
let generation = 0;
let mailboxes = []; // { sprite, target, clip }
let stones = []; // { sprite, target, index, dir }
let notes = []; // { sprite, target, index }
let boards = []; // { sprite, target, index }
let neighbourTargets = null; // targets on a neighbour's home street
let mailView = createMailboxView();
let carried = [];
let nextNoteId = 1;
let seenStone = false;
let welcomed = false;
let lettersSent = 0;
let nb = normalizeNeighbourState({});
let currentRow = null;
let lastAction = '';
let publishAt = 0;
let reconcileAt = 0;
let demoUsed = { mailbox: false, note: false, stone: false };
let timers = [];
let vogTimers = [];
/** QA autoplay steps outlive street changes (a visit swaps the street mid-run). */
let demoTimers = [];

function later(fn, ms) {
  const id = setTimeout(fn, ms);
  timers.push(id);
  return id;
}

function demoLater(fn, ms) {
  demoTimers.push(setTimeout(fn, ms));
}

function dayKey() {
  return getGameDayKey(Date.now());
}

function homeInfo(engine) {
  const ctx = engine.homeContext?.() || {};
  return { owned: engine.homeOwned ? engine.homeOwned() : ctx.owned === true, inHome: ctx.inHome === true };
}

/**
 * Butler hand-off (items/bag_butler.js, visiting_stone.js, inc_visiting.js):
 * the opt-in needs an unboxed Butler and its reply names it; the VOG picks by
 * has_butler; drop-by visitors leave their gift and line with it. Stone QA
 * routes (stonedemo) skip the Butler check so they run without one.
 */
function hasButler(engine) {
  return butlerApi.owned() || Boolean(engine.param?.('stonedemo'));
}

function learned(engine) {
  return engine.learnedSkills || [];
}

function quillWorking(engine) {
  return countItem(engine.inv, QUILL_CLASS) > 0 && canUseTool(engine.toolState, QUILL_CLASS, 1).ok;
}

function penCtx(engine, extra = {}) {
  return {
    learned: learned(engine),
    quillWorking: quillWorking(engine),
    playerId: PLAYER_ID,
    nowS: Math.floor(Date.now() / 1000),
    ...extra,
  };
}

function slot(engine) {
  const s = engine.streetSlot(FURNITURE_FEATURE_ID);
  s.notes ||= null;
  s.boards ||= {};
  s.stoneDir ||= {};
  return s;
}

function ensureItems() {
  ensureItem(NOTE_CLASS, { ...NOTE_ITEM });
  if (!ITEM_CATALOG[PAPER_CLASS]) ensureItem(PAPER_CLASS, { label: 'Paper', baseCost: 2, stackMax: 250 });
  for (const [classTsid, meta] of Object.entries(NEIGHBOUR_ITEMS)) {
    if (!ITEM_CATALOG[classTsid]) ensureItem(classTsid, { ...meta });
  }
}

// ---------------------------------------------------------------------------
// Carried notes (paper.js / note.js in the pack)
// ---------------------------------------------------------------------------

function syncCarried(engine) {
  const out = reconcileCarried(carried, countItem(engine.inv, NOTE_CLASS), nextNoteId);
  carried = out.notes;
  nextNoteId = out.nextId;
}

function addCarried(engine, note) {
  syncCarried(engine);
  addItem(engine.inv, NOTE_CLASS, 1);
  carried.push(normalizeNote({ ...note, id: `n${nextNoteId}` }));
  nextNoteId += 1;
  engine.refreshPack();
}

function removeCarried(engine, id) {
  syncCarried(engine);
  const index = carried.findIndex((n) => n.id === id);
  if (index < 0) return null;
  const [note] = carried.splice(index, 1);
  removeItem(engine.inv, NOTE_CLASS, 1);
  engine.refreshPack();
  return note;
}

function noteTitle(note) {
  return noteContent(note).title;
}

/**
 * Written notes in the pack, for other features (fortune_cookie.js add_note
 * takes a note whose `contents` are set and keeps last_editor as the author).
 */
export function writtenCarriedNotes(engine) {
  syncCarried(engine);
  return carried
    .map((n) => normalizeNote(n))
    .filter((n) => n.body)
    .map((n) => ({ id: n.id, title: noteTitle(n), body: n.body, author: n.lastEditor || PLAYER_ID }));
}

/** Add one carried note with its text (QA seeding for other features). */
export function giveCarriedNote(engine, note) {
  addCarried(engine, note);
}

/** Remove one carried note (and its pack stack) by id; returns it or null. */
export function takeCarriedNote(engine, id) {
  return removeCarried(engine, id);
}

function bylineFor(note) {
  const n = normalizeNote(note);
  if (n.lastEditor === PLAYER_ID) {
    const when = n.lastEdited ? new Date(n.lastEdited * 1000).toLocaleDateString() : '';
    return `Written by you${when ? ` · ${when}` : ''}`;
  }
  // STREET_NOTES / BOARD_PINS are remake text, said so plainly (G175).
  if (isRemakeNote(note)) return REMAKE_NOTE_BYLINE;
  return n.initialText || n.initialTitle ? 'Left by a Glitch who passed this way' : '';
}

/** Open a note in the note_view window. `save(next)` stores an edited note. */
function showNote(engine, note, { kicker = 'Note', startEdit = false, save = null, extra = [] } = {}) {
  const view = noteView(note, penCtx(engine));
  const editable = Boolean(save) && (startEdit || view.canEdit);
  openNoteView({
    kicker,
    title: view.title,
    body: view.body,
    marker: isRemakeNote(note) ? REMAKE_NOTE_MARKER : '',
    byline: bylineFor(note),
    reason: startEdit || !save ? '' : view.disabledReason,
    editable,
    startEdit,
    maxTitle: NOTE_LIMITS.title,
    maxBody: NOTE_LIMITS.body,
    extra,
    onSave: (title, body) => {
      const out = editNote(note, { title, body }, penCtx(engine));
      if (!out.ok) return out.error || 'You cannot write on this.';
      if (!out.unchanged) {
        const wear = useToolCondition(engine.toolState, QUILL_CLASS, out.costs.quillWear);
        if (wear?.msg) engine.pushActivity(wear.msg);
        save?.(out.note);
        engine.pushActivity(`You wrote on a note: ${noteTitle(out.note)}`);
        lastAction = `wrote:${noteTitle(out.note)}`;
        engine.updateHud();
        engine.save();
      }
      publish(engine, true);
      return true;
    },
  });
  lastAction = startEdit ? 'note:edit' : `note:read:${view.title}`;
  publish(engine, true);
}

function readCarried(engine) {
  syncCarried(engine);
  if (!carried.length) return engine.toast('You have no notes.', 1800);
  const open = (id) => {
    const note = carried.find((n) => n.id === id);
    if (!note) return;
    showNote(engine, note, {
      kicker: 'Note · in your pack',
      save: (next) => {
        const i = carried.findIndex((n) => n.id === id);
        if (i >= 0) carried[i] = { ...next, id };
      },
    });
  };
  if (carried.length === 1) return open(carried[0].id);
  openNotePicker({ title: 'Which note?', notes: carried.map((n) => ({ id: n.id, title: noteTitle(n) })), onPick: open });
}

function writeOnPaper(engine) {
  const verb = paperWriteVerb(penCtx(engine));
  if (!verb.enabled) return engine.toast(verb.reason, 2200);
  openNoteView({
    kicker: 'Paper',
    title: '',
    body: '',
    editable: true,
    startEdit: true,
    maxTitle: NOTE_LIMITS.title,
    maxBody: NOTE_LIMITS.body,
    onSave: (title, body) => {
      syncCarried(engine);
      const out = writePaperNote(carried, { title, body }, penCtx(engine, { paper: countItem(engine.inv, PAPER_CLASS), nextId: nextNoteId }));
      if (out.empty) return true;
      if (!out.ok) return out.error;
      removeItem(engine.inv, PAPER_CLASS, out.costs.paper);
      const wear = useToolCondition(engine.toolState, QUILL_CLASS, out.costs.quillWear);
      addItem(engine.inv, NOTE_CLASS, 1);
      carried.push(out.note);
      nextNoteId += 1;
      engine.pushActivity(`You turned a piece of Paper into a note: ${noteTitle(out.note)}`);
      if (wear?.msg) engine.pushActivity(wear.msg);
      engine.playSound('CRAFT_DONE', { volume: 0.5 });
      lastAction = `paper:${noteTitle(out.note)}`;
      engine.updateHud();
      engine.save();
      publish(engine, true);
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// Mailboxes
// ---------------------------------------------------------------------------

function setMailboxClip(engine, entity, clip) {
  if (entity.clip === clip || !entity.sprite || entity.sprite.destroyed) return;
  const frames = loader.frames(MAILBOX_SHEETS[clip] || MAILBOX_SHEETS.idle);
  if (!frames.length) return;
  entity.clip = clip;
  entity.sprite.textures = frames;
  entity.sprite.loop = clip === 'has_mail';
  entity.sprite.animationSpeed = pixiSpeed(30);
  entity.sprite.gotoAndPlay(0);
}

function buildMailbox(engine, x, y) {
  const { PIXI } = engine;
  const frames = loader.frames(MAILBOX_SHEETS.idle);
  const spr = new PIXI.AnimatedSprite(frames.length ? frames : [PIXI.Texture.EMPTY]);
  spr.anchor.set(0.5, 0.99);
  spr.x = x;
  spr.y = y + 2;
  spr.zIndex = itemZ(MAILBOX_CLASS, 4);
  spr._worldHitW = 70;
  spr._worldHitH = 140;
  engine.entityLayer.addChild(spr);
  const entity = { sprite: spr, clip: 'idle', target: null };
  entity.target = engine.register({
    classId: MAILBOX_CLASS,
    featureId: FURNITURE_FEATURE_ID,
    label: 'Mailbox',
    subtitle: mailboxSubtitle(engine.mailUnread?.() || 0),
    sprite: spr,
    furniture: 'mailbox',
  });
  mailboxes.push(entity);
  setMailboxClip(engine, entity, mailboxClip(mailView, engine.mailUnread?.() || 0));
  return entity;
}

function openStreetMailbox(engine) {
  if (!welcomed) {
    welcomed = true;
    engine.deliverMail?.({ ...STREET_MAIL_WELCOME, deliveryAt: Date.now() - 1000 });
  }
  openMailboxView(mailView);
  for (const box of mailboxes) setMailboxClip(engine, box, 'interact');
  engine.openMailbox?.();
  engine.pushActivity('You opened the mailbox.');
  lastAction = 'mailbox:open';
  engine.save();
  publish(engine, true);
}

function tickMailboxes(engine, now) {
  if (mailView.open && !engine.mailboxOpen?.()) {
    closeMailboxView(mailView, now);
    lastAction = 'mailbox:all_done';
  }
  if (!mailboxes.length) return;
  const unread = engine.mailUnread?.() || 0;
  const clip = mailboxClip(mailView, unread, now);
  for (const box of mailboxes) {
    setMailboxClip(engine, box, clip);
    box.target.subtitle = mailboxSubtitle(unread);
  }
}

// ---------------------------------------------------------------------------
// Notes on the street
// ---------------------------------------------------------------------------

function streetNotes(engine, count) {
  const s = slot(engine);
  if (!Array.isArray(s.notes) || s.notes.length !== count) {
    const seeds = streetNoteSeeds(engine.streetTsid, count);
    s.notes = seeds.map((seed, i) => ({ ...seed, ...(Array.isArray(s.notes) ? s.notes[i] : null) }));
  }
  return s.notes;
}

function buildNote(engine, x, y, index, row) {
  const { PIXI } = engine;
  const spr = new PIXI.Sprite(textureFromUrl(NOTE_ART.path));
  spr.anchor.set(0.5, 1);
  spr.x = x;
  spr.y = y + 1;
  spr.rotation = ((index * 37) % 11 - 5) * 0.02;
  spr.zIndex = itemZ(NOTE_CLASS, 3);
  spr._worldHitW = 60;
  spr._worldHitH = 36;
  engine.entityLayer.addChild(spr);
  const entity = { sprite: spr, index, target: null };
  entity.target = engine.register({
    classId: NOTE_CLASS,
    featureId: FURNITURE_FEATURE_ID,
    label: noteContent(row).title === NOTE_TEXT.defaultTitle ? 'Note' : noteContent(row).title,
    subtitle: noteReadVerb(row).enabled ? 'What does it say?' : NOTE_TEXT.blank,
    sprite: spr,
    furniture: 'note',
    noteIndex: index,
  });
  notes.push(entity);
  return entity;
}

function refreshNoteTarget(engine, entity) {
  const row = slot(engine).notes?.[entity.index];
  if (!row) return;
  const title = noteContent(row).title;
  entity.target.label = title === NOTE_TEXT.defaultTitle ? 'Note' : title;
  entity.target.subtitle = noteReadVerb(row).enabled ? 'What does it say?' : NOTE_TEXT.blank;
}

function noteVerbs(engine, entity) {
  const row = slot(engine).notes?.[entity.index];
  if (!row) return [];
  const out = [noteReadVerb(row)];
  const write = noteWriteVerb(row, penCtx(engine));
  if (write) out.push(write);
  out.push({ id: 'pickup', label: 'Pick up', tooltip: 'Put it in your pack', enabled: true, reason: '' });
  return out;
}

function runNoteVerb(engine, entity, verbId) {
  const s = slot(engine);
  const row = s.notes?.[entity.index];
  if (!row) return;
  const save = (next) => {
    s.notes[entity.index] = { ...next, id: row.id };
    refreshNoteTarget(engine, entity);
  };
  if (verbId === 'read') {
    showNote(engine, row, { save });
    engine.pushActivity(`You read a note: ${noteTitle(row)}`);
  } else if (verbId === 'write_on') {
    const gate = noteWriteVerb(row, penCtx(engine));
    if (!gate?.enabled) return engine.toast(gate?.reason || NOTE_TEXT.notYours, 2200);
    showNote(engine, row, { startEdit: true, save });
  } else if (verbId === 'pickup') {
    row.taken = true;
    addCarried(engine, row);
    engine.unregister(entity.target);
    notes = notes.filter((n) => n !== entity);
    engine.playSound('ITEM_PICKUP', { volume: 0.55 });
    engine.pushActivity(`You picked up a note: ${noteTitle(row)}`);
    lastAction = `note:pickup:${noteTitle(row)}`;
    engine.save();
  }
  publish(engine, true);
}

// ---------------------------------------------------------------------------
// Notice boards
// ---------------------------------------------------------------------------

function boardPins(engine, index) {
  const s = slot(engine);
  if (!Array.isArray(s.boards[index])) s.boards[index] = index === 0 ? boardPinSeeds(engine.streetTsid) : [];
  return s.boards[index];
}

function buildBoard(engine, x, y, index, opts = {}) {
  const { PIXI } = engine;
  const pins = opts.pins || boardPins(engine, index);
  const spr = new PIXI.Sprite(textureFromUrl(BOARD_ART.path(Math.min(BOARD_CAPACITY, pins.length))));
  spr.anchor.set(0.5, 0.99);
  spr.x = x;
  spr.y = y + 2;
  spr.zIndex = itemZ(BOARD_CLASS, 0.5);
  engine.entityLayer.addChild(spr);
  const entity = { sprite: spr, index, target: null, pins: opts.pins || null };
  entity.target = engine.register({
    classId: BOARD_CLASS,
    featureId: FURNITURE_FEATURE_ID,
    label: 'Notice Board',
    subtitle: `${pins.length} of ${BOARD_CAPACITY} notes pinned`,
    sprite: spr,
    furniture: 'board',
  });
  boards.push(entity);
  return entity;
}

function pinsFor(engine, entity) {
  return entity.pins || boardPins(engine, entity.index);
}

function setPins(engine, entity, pins) {
  if (entity.pins) entity.pins = pins;
  else slot(engine).boards[entity.index] = pins;
  entity.sprite.texture = textureFromUrl(BOARD_ART.path(Math.min(BOARD_CAPACITY, pins.length)));
  entity.target.subtitle = `${pins.length} of ${BOARD_CAPACITY} notes pinned`;
  lastAction = `board:${boardArtState(pins.length)}`;
}

function openBoard(engine, entity) {
  syncCarried(engine);
  const pins = pinsFor(engine, entity);
  const add = boardAddVerb(pins, carried.length);
  openBoardView({
    title: 'Notice Board',
    count: pins.length,
    capacity: BOARD_CAPACITY,
    pins: pins.map((p) => ({ id: p.id, title: noteTitle(p), preview: noteContent(p).body.slice(0, 200), marker: isRemakeNote(p) ? REMAKE_NOTE_MARKER : '' })),
    addEnabled: add.enabled,
    addReason: add.reason,
    onRead: (id) => {
      const note = pinsFor(engine, entity).find((p) => p.id === id);
      if (note) showNote(engine, note, { kicker: 'Notice Board', extra: [{ label: 'Back to the board', onClick: () => openBoard(engine, entity) }] });
    },
    onTake: (id) => {
      syncCarried(engine);
      const out = takePinnedNote(pinsFor(engine, entity), carried, id);
      if (!out.ok) return;
      setPins(engine, entity, out.pins);
      addCarried(engine, out.note);
      engine.pushActivity(`You took a note from the notice board: ${noteTitle(out.note)}`);
      engine.save();
      openBoard(engine, entity);
      publish(engine, true);
    },
    onAdd: () => addToBoard(engine, entity),
  });
  publish(engine, true);
}

function addToBoard(engine, entity, { reopen = true } = {}) {
  syncCarried(engine);
  const pins = pinsFor(engine, entity);
  const gate = boardAddVerb(pins, carried.length);
  if (!gate.enabled) return engine.toast(gate.reason, 2200);
  const pin = (id) => {
    const out = pinNote(pinsFor(engine, entity), carried, id);
    if (!out.ok) return engine.toast(out.error, 2600);
    removeCarried(engine, id);
    const stamped = { ...out.note, id: `p${Date.now().toString(36)}${pins.length}` };
    setPins(engine, entity, [...pinsFor(engine, entity), stamped]);
    engine.pushActivity(`You pinned a note to the notice board: ${noteTitle(stamped)}`);
    engine.save();
    if (reopen) openBoard(engine, entity);
    publish(engine, true);
  };
  if (carried.length === 1) return pin(carried[0].id);
  openNotePicker({ kicker: 'Add a note', title: 'Which note?', notes: carried.map((n) => ({ id: n.id, title: noteTitle(n) })), onPick: pin });
}

// ---------------------------------------------------------------------------
// Visiting Stones
// ---------------------------------------------------------------------------

function buildStone(engine, x, y, index, opts = {}) {
  const { PIXI } = engine;
  const spr = new PIXI.Sprite(textureFromUrl(STONE_ART.path));
  spr.anchor.set(0.5, 0.99);
  spr.x = x;
  spr.y = y + 3;
  spr.zIndex = itemZ(STONE_CLASS, 2);
  engine.entityLayer.addChild(spr);
  const dir = opts.dir || (opts.home ? 'right' : slot(engine).stoneDir[index]) || 'right';
  spr.scale.x = dir === 'left' ? -1 : 1;
  const entity = { sprite: spr, index, dir, home: Boolean(opts.home), target: null };
  entity.target = engine.register({
    classId: STONE_CLASS,
    featureId: FURNITURE_FEATURE_ID,
    label: 'Visiting Stone',
    subtitle: opts.subtitle || 'Sends travellers to see each other',
    sprite: spr,
    furniture: 'stone',
  });
  stones.push(entity);
  return entity;
}

function visitBlock(engine) {
  if (engine.homeContext?.().inHome) return 'Visiting Stones only work out in the world.';
  if (engine.transientInstance?.() && !isNeighbourSceneTsid(engine.streetTsid)) return "You can't go visiting from here.";
  const gate = engine.travelGate?.(neighbourSceneTsid(NEIGHBOURS[0].id));
  if (gate && gate.ok === false && !isNeighbourSceneTsid(engine.streetTsid)) return gate.msg || "You can't go visiting right now.";
  return '';
}

function stoneVerbList(engine, entity) {
  const home = homeInfo(engine);
  const mp = neighboursMpApi.active(engine);
  const allowVisits = mp ? neighboursMpApi.allowVisits() ?? nb.allowVisits : nb.allowVisits;
  const verbs = stoneVerbs({ level: engine.pc.level, homeOwned: home.owned === true, hasButler: hasButler(engine), allowVisits, blocked: visitBlock(engine) });
  // G328: in multiplayer the stone sends you to a random real player's home (visiting_stone.js
  // verbs.visit tooltip), and opting in also wants 3 cultivated items (inc_visiting.js:17-25).
  if (mp) return multiplayerStoneVerbs(engine, verbs, home);
  if (!entity.home) return verbs;
  const back = nb.returnTo ? 'Back to where you came from' : 'Back into Ur';
  return [
    { id: 'go_back', label: 'Go back', tooltip: back, enabled: true, reason: '' },
    { ...verbs.find((v) => v.id === 'visit'), label: 'Visit another neighbour' },
    verbs.find((v) => v.id === 'flip'),
  ];
}

/** G328: visiting_can_opt_in's order: level, a home, 3 cultivations, a Butler (visiting_stone.js 136-138). */
function multiplayerStoneVerbs(engine, verbs, home) {
  return verbs.map((v) => {
    if (v.id === 'visit') return { ...v, tooltip: "Visit a random player's home" };
    if (v.id !== 'get_visitors') return v;
    const gate = canOptIn({ level: engine.pc.level, homeOwned: home.owned === true });
    if (!gate.ok) return { ...v, enabled: false, reason: gate.reason };
    if (neighboursMpApi.cultivations() < 3) return { ...v, enabled: false, reason: 'You need to cultivate 3 items.' };
    if (!butlerApi.owned()) return { ...v, enabled: false, reason: STONE_TEXT.noButler };
    return v;
  });
}

function flipStone(engine, entity) {
  entity.dir = entity.dir === 'left' ? 'right' : 'left';
  entity.sprite.scale.x = entity.dir === 'left' ? -1 : 1;
  if (!entity.home) slot(engine).stoneDir[entity.index] = entity.dir;
  engine.pushActivity('You flipped the Visiting Stone.');
  lastAction = `stone:flip:${entity.dir}`;
  engine.save();
}

/**
 * G277: the stone talks (visiting_stone.js 87, 110, 148 conversation_start): an NPC
 * conversation on the plain card, not a quest offer (no New Quest heading or quest
 * sound). One choice has no second button; `no` adds it.
 */
function stoneTalk(engine, { beats, yes, no = '', onYes, onNo }) {
  engine.scriptedDialogue({
    title: 'Visiting Stone',
    kicker: 'Visiting Stone',
    beats,
    cancelable: Boolean(no),
    primaryLabel: yes,
    cancelLabel: no,
    onComplete: onYes,
    onCancel: no ? onNo : undefined,
  });
}

function askVisit(engine, entity, opts = {}) {
  const block = visitBlock(engine);
  if (block) return engine.toast(block, 2400);
  stoneTalk(engine, {
    beats: [{ text: STONE_TEXT.visit, response: STONE_TEXT.visitYes }],
    yes: STONE_TEXT.visitYes,
    no: STONE_TEXT.visitNo,
    // G328: a random opted-in real player's home in multiplayer (visiting_visit_random).
    onYes: () => (neighboursMpApi.active(engine) ? neighboursMpApi.visitRandom(engine) : goVisit(engine, opts)),
    onNo: () => engine.say(entity.target, STONE_TEXT.visitLater, 3500),
  });
  lastAction = 'stone:ask';
}

function askOptIn(engine, entity) {
  const home = homeInfo(engine);
  const gate = canOptIn({ level: engine.pc.level, homeOwned: home.owned === true, hasButler: hasButler(engine) });
  if (!gate.ok) return engine.toast(gate.reason, 2400);
  stoneTalk(engine, {
    beats: [
      { text: STONE_TEXT.optIn, response: STONE_TEXT.optInSplit },
      { text: STONE_TEXT.optInAsk, response: STONE_TEXT.optInYes },
    ],
    yes: STONE_TEXT.optInYes,
    no: STONE_TEXT.optInNo,
    onYes: async () => {
      // G328: in multiplayer the site keeps the opt-in (pc.home_allow_visits) and checks it again.
      if (neighboursMpApi.active(engine) && !(await neighboursMpApi.optIn(engine))) return;
      nb.allowVisits = true;
      nb.lastVisitorDay = dayKey();
      engine.say(entity.target, STONE_TEXT.optInDone(butlerApi.label() || STONE_BUTLER_STANDIN), 6000);
      engine.pushActivity(STONE_TEXT.optedIn);
      lastAction = 'stone:opt_in';
      engine.save();
      publish(engine, true);
    },
    onNo: () => engine.say(entity.target, STONE_TEXT.optInLater, 4000),
  });
}

function askOptOut(engine) {
  stoneTalk(engine, {
    beats: [{ text: STONE_TEXT.optOut, response: 'OK' }],
    yes: 'OK',
    // G255: visiting_stone.js 84-87 gives the opt-out one choice, OK.
    onYes: async () => {
      if (neighboursMpApi.active(engine) && !(await neighboursMpApi.optOut(engine))) return;
      nb.allowVisits = false;
      engine.pushActivity(STONE_TEXT.optedOut);
      lastAction = 'stone:opt_out';
      engine.save();
      publish(engine, true);
    },
  });
}

function checkStoneVog(engine) {
  if (seenStone || !stones.length || !engine.player || engine.busy()) return;
  const stone = stones.find((s) => !s.home && insideStoneHitbox(s.sprite, engine.player));
  if (!stone) return;
  seenStone = true;
  const home = homeInfo(engine);
  const lines = stoneVog({ level: engine.pc.level, homeOwned: home.owned === true, hasButler: butlerApi.owned() });
  lines.forEach((line, i) => vogTimers.push(setTimeout(() => engine.toast(line, 3600), i * 3800)));
  lastAction = 'stone:vog';
  engine.save();
}

// ---------------------------------------------------------------------------
// Neighbour home streets
// ---------------------------------------------------------------------------

async function goVisit(engine, opts = {}) {
  const neighbour = neighbourById(opts.neighbourId) || pickNeighbour(Math.random(), nb.lastId);
  if (!isNeighbourSceneTsid(engine.streetTsid)) {
    nb.returnTo = { tsid: engine.streetTsid, x: Math.round(engine.player?.x || 0), y: Math.round(engine.player?.y || 0) };
  }
  const layout = neighbourLayout(neighbour);
  const scene = {
    tsid: neighbourSceneTsid(neighbour.id),
    label: homeStreetLabel(neighbour),
    // G318: home streets are copied into mote 15 "Homes" (inc_houses.js 1127), whose hub is
    // 117 "Homes" (inc_data_maps_prod.js 959-966, 1355).
    hubName: 'Homes',
    width: NEIGHBOUR_SCENE.width,
    height: NEIGHBOUR_SCENE.height,
    background: buildNeighbourBackground(engine.PIXI, neighbour),
    platforms: neighbourPlatforms(),
    walls: [],
    // QA: &neighbourspawn=house|chore lands beside the house or the chore instead of at the stone.
    spawn: { x: ({ house: layout.houseX - 60, chore: layout.choreX - 160 })[engine.param('neighbourspawn')] ?? layout.spawnX, y: layout.groundY },
    returnTo: nb.returnTo,
  };
  const setup = () => {
    engine.enterScene(scene);
    spawnNeighbourStreet(engine, neighbour, layout);
  };
  const fx = typeof document !== 'undefined' ? document.getElementById('screen-transition') : null;
  const [top, bottom] = neighbourLoadingColors(neighbour);
  const visit = neighbourVisit(engine, neighbour);
  if (opts.useTransition === false || !fx) setup();
  else {
    await runStreetTransition(fx, {
      fromLabel: engine.street?.label || '',
      fromHub: engine.street?.hubName || '',
      toLabel: homeStreetLabel(neighbour),
      toHub: 'Homes',
      topColor: top,
      bottomColor: bottom,
      // G270: a home street is a POL (location.js getLoadingInfo 3391-3410:
      // pol_type exterior, owner_info): the owner's card, "Entering /
      // <Name>’s / Home Street", with this neighbour's own last visit. The
      // neighbours have no avatar art, so no owner picture or Neighbors faces.
      pol: { type: 'exterior', ownerName: neighbour.name, visit },
      details: () => loadingCardDetails({ targets: engine.interactables || [], visit }),
      onMid: setup,
    });
  }
  const arrival = recordVisit(nb, neighbour);
  engine.achievement(arrival.counter, 1);
  if (arrival.xp) {
    engine.pc.xp = (engine.pc.xp || 0) + arrival.xp;
    if (engine.pc.imagination != null) engine.pc.imagination += arrival.xp;
    engine.pushActivity({ base: `You visited ${neighbour.name} for the first time`, effects: { xp: arrival.xp } });
  } else {
    engine.pushActivity(`You visited ${homeStreetLabel(neighbour)}. Visit ${arrival.visits}.`);
  }
  if (neighbourTargets?.doorNote) {
    later(() => neighbourTargets?.doorNote && engine.say(neighbourTargets.doorNote.target, `${neighbour.first} left a note on the door.`, 3800), 900);
  }
  lastAction = `visit:${neighbour.id}`;
  engine.updateHud();
  engine.save();
  publish(engine, true);
  return true;
}

/**
 * G270: the visit as the card reads it (location.js 3157-3159: pols_visited
 * before this entry counts), then counted, in the neighbour scene's own
 * street-visits slot. Saves from before the slot credit their visit count
 * (no time: "just moments ago", as the street card reads an unstamped slot).
 */
function neighbourVisit(engine, neighbour, now = Date.now()) {
  const slot = engine.streetSlot?.(STREET_VISITS_SLOT, neighbourSceneTsid(neighbour.id));
  const known = Math.max(0, Math.floor(Number(nb.visits?.[neighbour.id]) || 0));
  const visit = streetLoadingVisit(slot, { now, knownVisits: known });
  if (slot) recordStreetEntry(slot, now, known);
  return visit;
}

async function goBack(engine) {
  const back = nb.returnTo;
  nb.returnTo = null;
  closeNoteView({ silent: true });
  lastAction = 'visit:back';
  engine.save();
  if (back?.tsid) {
    await engine.enter(back.tsid, { spawnX: back.x, spawnY: back.y, quiet: true, bypassFeatureGates: true });
  } else {
    await engine.enter(DEFAULT_RETURN_TSID, { bypassFeatureGates: true });
  }
  engine.pushActivity('The Visiting Stone sends you home again.');
  publish(engine, true);
}

function sprite(engine, path, { x, y, w, h, z = 10, anchorY = 1 }) {
  const spr = new engine.PIXI.Sprite(textureFromUrl(path));
  spr.anchor.set(0.5, anchorY);
  if (w) spr.width = w;
  if (h) spr.height = h;
  spr.x = x;
  spr.y = y;
  spr.zIndex = z;
  engine.entityLayer.addChild(spr);
  return spr;
}

function choreArt(engine, neighbour, layout) {
  const { PIXI } = engine;
  const y = layout.groundY;
  const done = nb.chores[neighbour.id] === dayKey();
  if (neighbour.chore === 'garden') {
    const box = new PIXI.Container();
    box.x = layout.choreX;
    box.y = y + 6;
    box.zIndex = 10;
    const planter = new PIXI.Sprite(textureFromUrl(`${DECO}firebog_planter_box_2x3.png`));
    planter.anchor.set(0.5, 1);
    planter.width = 764 * 0.3;
    planter.height = 174 * 0.3;
    box.addChild(planter);
    const plants = new PIXI.Container();
    box.addChild(plants);
    box._plants = plants;
    box._worldHitW = 230;
    box._worldHitH = 90;
    engine.entityLayer.addChild(box);
    paintGarden(engine, box, neighbour, done);
    return box;
  }
  if (neighbour.chore === 'gift') {
    const spr = sprite(engine, done ? GIFT_ART.open : GIFT_ART.wrapped, { x: layout.doorX + 70, y: y + 14, z: 12 });
    spr._worldHitW = 60;
    spr._worldHitH = 56;
    return spr;
  }
  if (neighbour.chore === 'birdhouse') {
    const spr = sprite(engine, `${DECO}bling_birdhouse_1.png`, { x: layout.choreX, y: y + 16, w: 120 * 0.42, h: 438 * 0.42, z: 10 });
    spr._worldHitW = 60;
    spr._worldHitH = 190;
    return spr;
  }
  // lanterns: two posts with hanging lanterns either side of the door
  const box = new PIXI.Container();
  box.x = layout.choreX;
  box.y = y + 10;
  box.zIndex = 10;
  for (const dx of [-70, 70]) {
    const arm = dx < 0 ? 30 : -30;
    const post = new PIXI.Graphics();
    post.roundRect(dx - 4, -150, 8, 150, 3).fill(0x5a3e2a);
    post.rect(Math.min(dx, dx + arm), -150, Math.abs(arm), 6).fill(0x5a3e2a);
    box.addChild(post);
    const glow = new PIXI.Graphics();
    glow.circle(dx + arm * 0.75, -110, 34).fill({ color: 0xffd77a, alpha: 0.18 });
    glow.circle(dx + arm * 0.75, -110, 20).fill({ color: 0xffe6a0, alpha: 0.3 });
    glow.visible = done;
    box.addChild(glow);
    const lamp = new PIXI.Sprite(textureFromUrl(`${DECO}lantern.png`));
    lamp.anchor.set(0.5, 0);
    lamp.width = 54 * 0.6;
    lamp.height = 110 * 0.6;
    lamp.x = dx + arm * 0.75;
    lamp.y = -150;
    lamp.tint = done ? 0xffffff : 0x8a8a9a;
    box.addChild(lamp);
    (box._glows ||= []).push(glow);
    (box._lamps ||= []).push(lamp);
  }
  box._worldHitW = 170;
  box._worldHitH = 160;
  engine.entityLayer.addChild(box);
  return box;
}

function paintGarden(engine, box, neighbour, done) {
  const { PIXI } = engine;
  box._plants.removeChildren();
  const kinds = neighbour.style === 'firebog' ? ['mushrooms', 'underground_plant_1', 'mushrooms'] : ['groddle_flower_2', 'groddle_flower_2', 'groddle_flower_2'];
  const sizes = { mushrooms: [136, 232, 0.24], underground_plant_1: [78, 106, 0.5], groddle_flower_2: [78, 206, 0.3], grass_solid: [124, 106, 0.4] };
  [-62, 0, 62].forEach((dx, i) => {
    const name = done ? kinds[i] : 'grass_solid';
    const [w, h, s] = sizes[name];
    const p = new PIXI.Sprite(textureFromUrl(`${DECO}${name}.png`));
    p.anchor.set(0.5, 1);
    p.width = w * s;
    p.height = h * s * (done ? 1 : 0.8);
    p.x = dx;
    p.y = -28;
    if (!done) p.tint = 0xb8a070;
    box._plants.addChild(p);
  });
}

function refreshChoreArt(engine, neighbour) {
  const art = neighbourTargets?.chore?.sprite;
  if (!art || art.destroyed) return;
  const done = nb.chores[neighbour.id] === dayKey();
  if (neighbour.chore === 'garden') paintGarden(engine, art, neighbour, done);
  else if (neighbour.chore === 'gift') art.texture = textureFromUrl(done ? GIFT_ART.open : GIFT_ART.wrapped);
  else if (neighbour.chore === 'lanterns') {
    for (const glow of art._glows || []) glow.visible = done;
    for (const lamp of art._lamps || []) lamp.tint = done ? 0xffffff : 0x8a8a9a;
  }
}

function spawnNeighbourStreet(engine, neighbour, layout) {
  const y = layout.groundY;
  neighbourTargets = { neighbour, layout };
  const stone = buildStone(engine, layout.stoneX, y, 0, { home: true, subtitle: 'Your way home, and the way to other neighbours' });
  neighbourTargets.stone = stone;

  // The neighbour's own mailbox stands over the house's painted For Sale sign.
  const mailSpr = sprite(engine, MAILBOX_SHEETS.idle.path, { x: layout.mailboxX, y: y + 16, z: 13, anchorY: 0.99 });
  mailSpr.scale.x = -1;
  mailSpr._worldHitW = 70;
  mailSpr._worldHitH = 140;
  neighbourTargets.mailbox = {
    sprite: mailSpr,
    target: engine.register({
      classId: 'neighbour_mailbox',
      featureId: FURNITURE_FEATURE_ID,
      label: `${neighbour.first}'s Mailbox`,
      subtitle: 'Not yours, but it takes notes',
      sprite: mailSpr,
      furniture: 'neighbour-mailbox',
    }),
  };

  const h = neighbour.house;
  const noteY = y + 14 - h.h * h.scale * (h.noteY ?? 0.2);
  const noteSpr = sprite(engine, NOTE_ART.icon, { x: layout.doorX + 4, y: noteY, z: 12, anchorY: 0.5 });
  noteSpr.width = 55 * 0.62;
  noteSpr.height = 40 * 0.62;
  noteSpr.rotation = -0.08;
  noteSpr._worldHitW = 48;
  noteSpr._worldHitH = 40;
  noteSpr.anchor.set(0.5, 0.5);
  neighbourTargets.doorNote = {
    sprite: noteSpr,
    target: engine.register({
      classId: NOTE_CLASS,
      featureId: FURNITURE_FEATURE_ID,
      label: neighbour.doorNote.title,
      subtitle: `A note from ${neighbour.first}`,
      sprite: noteSpr,
      furniture: 'door-note',
    }),
  };

  const art = choreArt(engine, neighbour, layout);
  const chore = CHORES[neighbour.chore];
  neighbourTargets.chore = {
    sprite: art,
    target: engine.register({
      classId: `neighbour_${neighbour.chore}`,
      featureId: FURNITURE_FEATURE_ID,
      label: {
        garden: `${neighbour.first}'s Planter`,
        gift: 'A Porch Present',
        birdhouse: `${neighbour.first}'s Birdhouse`,
        lanterns: `${neighbour.first}'s Lanterns`,
      }[neighbour.chore],
      subtitle: chore.tooltip,
      sprite: art,
      furniture: 'chore',
    }),
  };
}

function neighbourVerbs(engine, target) {
  const t = neighbourTargets;
  if (!t) return [];
  const neighbour = t.neighbour;
  if (target === t.doorNote?.target) return [{ id: 'read', label: 'Read', tooltip: 'What does it say?', enabled: true, reason: '' }];
  if (target === t.mailbox?.target) {
    syncCarried(engine);
    return [postNoteVerb(nb, neighbour, { carried: carried.length, dayKey: dayKey() })];
  }
  if (target === t.chore?.target) {
    const verb = choreVerb(nb, neighbour, {
      dayKey: dayKey(),
      energy: engine.pc.energy,
      have: { grain: countItem(engine.inv, 'grain') },
    });
    return verb ? [verb] : [];
  }
  return [];
}

function runNeighbourVerb(engine, target, verbId) {
  const t = neighbourTargets;
  if (!t) return;
  const neighbour = t.neighbour;
  if (target === t.doorNote?.target) {
    const note = normalizeNote({ id: `door:${neighbour.id}`, initialTitle: neighbour.doorNote.title, initialText: neighbour.doorNote.text });
    showNote(engine, note, { kicker: `${neighbour.first}'s door` });
    engine.pushActivity(`You read ${neighbour.first}'s note.`);
    return;
  }
  if (target === t.mailbox?.target && verbId === 'post_note') {
    syncCarried(engine);
    const post = (id) => {
      const note = removeCarried(engine, id);
      if (!note) return;
      const letter = postNoteReply(nb, neighbour, { title: noteTitle(note) }, { dayKey: dayKey(), now: Date.now() });
      engine.deliverMail?.(letter);
      lettersSent += 1;
      engine.pushActivity(`You posted a note in ${neighbour.first}'s mailbox.`);
      engine.say(t.mailbox.target, 'Clunk.', 1600);
      lastAction = `post:${neighbour.id}`;
      engine.save();
      publish(engine, true);
    };
    if (carried.length === 1) return post(carried[0].id);
    openNotePicker({ kicker: `${neighbour.first}'s Mailbox`, title: 'Which note?', notes: carried.map((n) => ({ id: n.id, title: noteTitle(n) })), onPick: post });
    return;
  }
  if (target === t.chore?.target) {
    const out = doChore(nb, neighbour, engine.pc, {
      dayKey: dayKey(),
      now: Date.now(),
      energy: engine.pc.energy,
      have: { grain: countItem(engine.inv, 'grain') },
    });
    if (!out.ok) return engine.toast(out.msg, 2200);
    for (const row of out.take) removeItem(engine.inv, row.classTsid, row.count);
    for (const row of out.give) addItem(engine.inv, row.classTsid, row.count);
    const gift = out.give[0];
    const giftLabel = gift ? `${gift.count} ${(ITEM_CATALOG[gift.classTsid]?.[gift.count > 1 ? 'namePlural' : 'label']) || gift.classTsid}` : '';
    const base = {
      garden: `You tended ${neighbour.first}'s planter`,
      gift: `You opened the porch present: ${giftLabel}`,
      birdhouse: `You refilled ${neighbour.first}'s birdhouse`,
      lanterns: `You lit ${neighbour.first}'s lanterns`,
    }[neighbour.chore];
    engine.pushActivity({ base, effects: out.effects });
    const art = t.chore.sprite;
    engine.floatText(art.x, art.y - 90, `+${out.effects.mood} mood`, 0xffe5a8);
    engine.playSound(neighbour.chore === 'gift' ? 'ITEM_GIVE' : 'NEIGHBOUR_WAVE', { volume: 0.5 });
    if (out.letter) {
      engine.deliverMail?.(out.letter);
      lettersSent += 1;
      engine.pushActivity(`${neighbour.first} will want to say thank you.`);
    }
    refreshChoreArt(engine, neighbour);
    lastAction = `chore:${neighbour.chore}:${neighbour.id}`;
    engine.updateHud();
    engine.save();
    publish(engine, true);
  }
}

function deliverVisitor(engine) {
  // G328: in multiplayer the visitors are real players; solo's authored neighbours don't drop by.
  if (engine.mode === 'multiplayer') return;
  const home = homeInfo(engine);
  const letter = visitorLetter(nb, { dayKey: dayKey(), homeOwned: home.owned === true, now: Date.now() });
  if (!letter) return;
  // With a Butler the neighbour leaves the gift and the line with it (leave_package + message).
  if (!butlerApi.receiveVisitor(engine, letter)) engine.deliverMail?.(letter);
  lettersSent += 1;
  engine.pushActivity(`${letter.sender} stopped by your home street.`);
  engine.save();
}

// ---------------------------------------------------------------------------
// Spawning, demos, QA
// ---------------------------------------------------------------------------

function demoPoint(engine, dx) {
  const p = engine.player;
  const x = Math.max(80, Math.min(engine.worldW - 80, (p?.x || 0) + dx));
  const y = nearestSurfaceY(engine.platforms, x, p?.y || engine.groundY) ?? p?.y ?? engine.groundY;
  return { x, y };
}

/**
 * The street's furniture row: the archived catalog row, unless a feature's
 * furnitureRow(street, base, engine) hook answers (rebuilt rooms without
 * location XML, fixed wall spots; see fixedFurniturePoints).
 */
function rowFor(engine, catalog, street) {
  const base = furnitureFor(catalog, street?.tsid);
  return (street && engine?.query?.('furnitureRow', street, base, engine)) || base;
}

function spawnStreet(engine, row) {
  currentRow = row;
  const groups = FURNITURE_GROUPS;
  const at = (classTsid) => fixedFurniturePoints(row, classTsid) || engine.placement(groups[classTsid].key) || [];
  // Planned spots step off the street's doors (fixed spots were put where they are on purpose).
  const doors = engine.street?.doors || [];
  const worldW = Number(engine.worldW) || Infinity;
  const clear = (classTsid, half) => fixedFurniturePoints(row, classTsid)
    ? at(classTsid)
    : at(classTsid).map((p) => clearOfDoors(p, half, doors, engine.platforms, worldW));
  (clear('npc_mailbox', 50)).forEach((p) => buildMailbox(engine, p.x, p.y));
  (clear('visiting_stone', STONE_ART.w / 2)).forEach((p, i) => buildStone(engine, p.x, p.y, i));
  (clear('bag_notice_board', BOARD_ART.w / 2)).forEach((p, i) => buildBoard(engine, p.x, p.y, i));
  const noteCount = Number(row?.note) || 0;
  if (noteCount) {
    const rows = streetNotes(engine, noteCount);
    notePositions(at('note'), noteCount).forEach((p, i) => {
      if (rows[i] && !rows[i].taken) buildNote(engine, p.x, p.y, i, rows[i]);
    });
  }
}

function setupDemos(engine) {
  const mailDemo = engine.param('mailboxdemo');
  if (mailDemo && !demoUsed.mailbox) {
    demoUsed.mailbox = true;
    const p = demoPoint(engine, 130);
    const box = buildMailbox(engine, p.x, p.y);
    if (!(engine.mailUnread?.() > 0) && !welcomed) {
      welcomed = true;
      engine.deliverMail?.({ ...STREET_MAIL_WELCOME, deliveryAt: Date.now() - 1000 });
    }
    const auto = engine.param('mailboxautoplay');
    if (auto) {
      demoLater(() => openStreetMailbox(engine), 2500);
      if (auto === 'close') demoLater(() => document.getElementById('mail-close')?.click(), 5000);
    }
  }
  const noteDemo = engine.param('notedemo');
  if (noteDemo && !demoUsed.note) {
    demoUsed.note = true;
    const p = demoPoint(engine, 90);
    const s = slot(engine);
    s.demoNote ||= normalizeNote({ id: 'demo', initialTitle: DEMO_NOTE.title, initialText: DEMO_NOTE.text });
    const demoRow = s.demoNote;
    s.notes = Array.isArray(s.notes) ? s.notes : [];
    const index = s.notes.length;
    s.notes.push(demoRow);
    const noteEntity = buildNote(engine, p.x, p.y, index, demoRow);
    const bp = demoPoint(engine, 330);
    const board = buildBoard(engine, bp.x, bp.y, 99, { pins: boardPinSeeds('GA5134UPLRU29OH') });
    const auto = engine.param('noteautoplay');
    if (auto) {
      demoLater(() => {
        if (auto === 'read') runNoteVerb(engine, noteEntity, 'read');
        else if (auto === 'board') openBoard(engine, board);
        else if (auto === 'write' || auto === 'paper') {
          if (!learned(engine).includes(PENMANSHIP_SKILL)) engine.grantSkill?.(PENMANSHIP_SKILL);
          if (countItem(engine.inv, QUILL_CLASS) < 1) addItem(engine.inv, QUILL_CLASS, 1);
          if (auto === 'paper') {
            addItem(engine.inv, PAPER_CLASS, 1);
            syncCarried(engine);
            const out = writePaperNote(carried, { title: 'Gone fishing', body: 'Back by dinner. Feed the Piggy if he looks at you like that.' }, penCtx(engine, { paper: countItem(engine.inv, PAPER_CLASS), nextId: nextNoteId }));
            if (out.ok) {
              removeItem(engine.inv, PAPER_CLASS, 1);
              useToolCondition(engine.toolState, QUILL_CLASS, 1);
              addItem(engine.inv, NOTE_CLASS, 1);
              carried.push(out.note);
              nextNoteId += 1;
              lastAction = `paper:${noteTitle(out.note)}`;
            }
            addToBoard(engine, board);
          } else {
            const out = editNote(demoRow, { title: 'Hello back', body: 'Thank you for the note. I wrote on it with my brand new Quill.' }, penCtx(engine));
            if (out.ok) {
              useToolCondition(engine.toolState, QUILL_CLASS, 1);
              s.notes[index] = { ...out.note, id: demoRow.id };
              refreshNoteTarget(engine, noteEntity);
              runNoteVerb(engine, noteEntity, 'read');
            }
          }
          engine.updateHud();
        }
        publish(engine, true);
      }, 2500);
    }
  }
  const stoneDemo = engine.param('stonedemo');
  if (stoneDemo && !demoUsed.stone) {
    demoUsed.stone = true;
    const p = demoPoint(engine, 150);
    const stone = buildStone(engine, p.x, p.y, 99);
    const auto = engine.param('stoneautoplay');
    if (auto) {
      const neighbourId = engine.param('stoneneighbour') || '';
      if (auto === 'optin' || auto === 'flip') {
        demoLater(() => {
          if (auto === 'flip') return flipStone(engine, stone), publish(engine, true);
          askOptIn(engine, stone);
          demoLater(() => engine.acceptOpenOffer(), 600);
        }, 2500);
        return;
      }
      demoLater(() => {
        askVisit(engine, stone, { neighbourId });
        demoLater(() => engine.acceptOpenOffer(), 600);
      }, 2500);
      if (auto !== 'home') {
        let tries = 0;
        const choreStep = () => {
          const t = neighbourTargets;
          if (!t || !isNeighbourSceneTsid(engine.streetTsid)) {
            tries += 1;
            if (tries < 30) demoLater(choreStep, 1000);
            return;
          }
          if (t.neighbour.chore === 'birdhouse' && countItem(engine.inv, 'grain') < 1) addItem(engine.inv, 'grain', 1);
          runNeighbourVerb(engine, t.chore.target, CHORES[t.neighbour.chore].id);
          if (auto === 'back') demoLater(() => goBack(engine), 2500);
        };
        demoLater(choreStep, 6000);
      }
    }
  }
}

function publish(engine, force = false) {
  const now = Date.now();
  if (!force && now < publishAt) return;
  publishAt = now + 300;
  const row = currentRow || {};
  engine.setData('furnitureRow', ['npc_mailbox', 'visiting_stone', 'note', 'bag_notice_board'].map((k) => `${k}=${Number(row[k]) || 0}`).join(','));
  engine.setData('furnitureMailboxes', String(mailboxes.length));
  engine.setData('furnitureStones', String(stones.length));
  engine.setData('furnitureNotes', String(notes.length));
  engine.setData('furnitureBoards', String(boards.length));
  engine.setData('mailboxClip', mailboxes[0]?.clip || '');
  engine.setData('notesCarried', String(carried.length));
  engine.setData('noteViewOpen', noteViewOpen() ? '1' : '0');
  engine.setData('boardPins', boards[0] ? String(pinsFor(engine, boards[0]).length) : '');
  engine.setData('stoneDir', stones[0]?.dir || '');
  engine.setData('stoneSeen', seenStone ? '1' : '0');
  engine.setData('visitAllow', nb.allowVisits ? '1' : '0');
  engine.setData('neighbourId', neighbourTargets?.neighbour?.id && isNeighbourSceneTsid(engine.streetTsid) ? neighbourTargets.neighbour.id : '');
  engine.setData('neighbourVisits', String(Object.values(nb.visits).reduce((a, b) => a + b, 0)));
  engine.setData('neighbourChore', neighbourTargets?.neighbour ? (nb.chores[neighbourTargets.neighbour.id] === dayKey() ? 'done' : 'todo') : '');
  engine.setData('neighbourLetters', String(lettersSent));
  engine.setData('furnitureLast', lastAction);
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

export const streetFurnitureFeature = {
  id: FURNITURE_FEATURE_ID,

  init(engine) {
    butlerApi.setVisitState(() => nb.allowVisits, () => canOptIn({ level: engine.pc.level, homeOwned: homeInfo(engine).owned === true, hasButler: butlerApi.owned() }).ok);
    loader = createSheetLoader(engine.PIXI);
    ensureItems();
    loadWildlifeCatalog();
    loader.loadAll(Object.values(MAILBOX_SHEETS));
    publish(engine, true);
  },

  placementGroups(population, street, engine) {
    const catalog = wildlifeCatalog();
    if (!catalog || !street?.tsid) return [];
    return furniturePlacementGroups(rowFor(engine, catalog, street));
  },

  onStreetEnter(street, engine) {
    generation += 1;
    const mine = generation;
    if (!isNeighbourSceneTsid(engine.streetTsid) && nb.returnTo) nb.returnTo = null;
    Promise.all([loadWildlifeCatalog(), loader.loadAll(Object.values(MAILBOX_SHEETS))]).then(([catalog]) => {
      if (mine !== generation) return;
      spawnStreet(engine, rowFor(engine, catalog, engine.street || street));
      setupDemos(engine);
      deliverVisitor(engine);
      publish(engine, true);
    });
  },

  onStreetClear() {
    generation += 1;
    for (const id of timers) clearTimeout(id);
    timers = [];
    for (const id of vogTimers) clearTimeout(id);
    vogTimers = [];
    closeNoteView({ silent: true });
    mailboxes = [];
    stones = [];
    notes = [];
    boards = [];
    neighbourTargets = null;
    currentRow = null;
  },

  onTick(dtMs, now, engine) {
    tickMailboxes(engine, now);
    checkStoneVog(engine);
    if (now >= reconcileAt) {
      reconcileAt = now + 1000;
      syncCarried(engine);
    }
    publish(engine);
  },

  onNewDay(now, engine) {
    deliverVisitor(engine);
    if (neighbourTargets?.neighbour) refreshChoreArt(engine, neighbourTargets.neighbour);
  },

  verbsFor(target, engine) {
    if (neighbourTargets && target.furniture && ['neighbour-mailbox', 'door-note', 'chore'].includes(target.furniture)) {
      return neighbourVerbs(engine, target);
    }
    if (target.furniture === 'mailbox') {
      return [{ id: 'view_inbox', label: 'Open mailbox', tooltip: 'Check your mail', enabled: true, reason: '' }];
    }
    if (target.furniture === 'stone') {
      const entity = stones.find((s) => s.target === target);
      return entity ? stoneVerbList(engine, entity) : [];
    }
    if (target.furniture === 'note') {
      const entity = notes.find((n) => n.target === target);
      return entity ? noteVerbs(engine, entity) : [];
    }
    if (target.furniture === 'board') {
      const entity = boards.find((b) => b.target === target);
      if (!entity) return [];
      syncCarried(engine);
      return [
        { id: 'view', label: 'View', tooltip: BOARD_TEXT.tooltipView, enabled: true, reason: '' },
        boardAddVerb(pinsFor(engine, entity), carried.length),
      ];
    }
    return [];
  },

  runVerb(target, verbId, engine) {
    if (neighbourTargets && ['neighbour-mailbox', 'door-note', 'chore'].includes(target.furniture)) {
      runNeighbourVerb(engine, target, verbId);
      return true;
    }
    if (target.furniture === 'mailbox') {
      if (verbId === 'view_inbox') openStreetMailbox(engine);
      return true;
    }
    if (target.furniture === 'stone') {
      const entity = stones.find((s) => s.target === target);
      if (!entity) return true;
      if (verbId === 'flip') flipStone(engine, entity);
      else if (verbId === 'visit') askVisit(engine, entity);
      else if (verbId === 'go_back') goBack(engine);
      else if (verbId === 'get_visitors') askOptIn(engine, entity);
      else if (verbId === 'stop_random_visitors') askOptOut(engine);
      publish(engine, true);
      return true;
    }
    if (target.furniture === 'note') {
      const entity = notes.find((n) => n.target === target);
      if (entity) runNoteVerb(engine, entity, verbId);
      return true;
    }
    if (target.furniture === 'board') {
      const entity = boards.find((b) => b.target === target);
      if (!entity) return true;
      if (verbId === 'view') openBoard(engine, entity);
      else if (verbId === 'add_note') addToBoard(engine, entity, { reopen: true });
      return true;
    }
    return false;
  },

  packVerbs(classTsid, engine) {
    if (classTsid === PAPER_CLASS) return [paperWriteVerb(penCtx(engine))];
    if (classTsid === NOTE_CLASS) {
      syncCarried(engine);
      return [{ id: 'read_note', label: 'Read', tooltip: 'What does it say?', enabled: carried.length > 0, reason: carried.length ? '' : NOTE_TEXT.blank, primary: true }];
    }
    return [];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid === PAPER_CLASS && verbId === 'write_note') {
      writeOnPaper(engine);
      return true;
    }
    if (classTsid === NOTE_CLASS && verbId === 'read_note') {
      readCarried(engine);
      return true;
    }
    return false;
  },

  travelGate(tsid, engine) {
    if (engine && isNeighbourSceneTsid(engine.streetTsid) && !isNeighbourSceneTsid(tsid)) {
      return { ok: false, msg: 'Use the Visiting Stone to head back.' };
    }
    return null;
  },

  reloadLocation(saved) {
    if (isNeighbourSceneTsid(saved?.tsid)) {
      const back = nb.returnTo;
      return back ? { tsid: back.tsid, x: back.x, y: back.y } : null;
    }
    return null;
  },

  save() {
    return {
      carried,
      nextNoteId,
      seenStone,
      welcomed,
      neighbours: nb,
    };
  },

  restore(slice) {
    const s = slice || {};
    carried = (Array.isArray(s.carried) ? s.carried : []).slice(0, 200).map(normalizeNote);
    nextNoteId = Math.max(1, Math.floor(Number(s.nextNoteId)) || carried.length + 1);
    seenStone = s.seenStone === true;
    welcomed = s.welcomed === true;
    nb = normalizeNeighbourState(s.neighbours || {});
  },

  /** Tests: G270 the neighbour card's visit (read, then counted). */
  _neighbourVisit(engine, neighbourId, now = Date.now()) {
    const neighbour = neighbourById(neighbourId);
    return neighbour ? neighbourVisit(engine, neighbour, now) : null;
  },

  /** QA / tests. */
  _state() {
    return { carried: carried.length, mailboxes: mailboxes.length, stones: stones.length, notes: notes.length, boards: boards.length, lastAction, neighbours: nb };
  },
};
