/**
 * The Garden Gnome (G435; see js/feature-host.js). Rules and copy: js/garden-gnome.js.
 *
 * Bought in the pack it has one verb, Place, which works in your own home. Set down it has Teach,
 * Flip and Pick up, and a bump makes it turn and hop and say one of its phrases.
 *
 * Art: the 140 frames of npc_garden_gnome.swf (CC0; js/garden-gnome-art.js, tools/gnome-art, 3x via
 * tools/vector-sprites/garden-gnome.json). The source's states (idle0, idleBlink, hopStart, hopLoop,
 * talk, look, lookSettle) run in js/garden-gnome.js on time and each plays its own label at 24 fps,
 * with hopEnd played out as a hop lands (gnomeVisual). Canvas gnomeArt: label:cell per gnome.
 *
 * Saved in this feature's slice in your own save: { placed, packed }. packed holds what a picked-up
 * gnome knows, for the next one set down.
 *
 * Online, on a visit to another player's home, their gnomes stand where they set them (the site's
 * list with the visit, src/Neighbours.php gnomeRows, through neighbours-mp-feature homeVisitGnomes):
 * a visitor's bump makes one hop and say its owner's phrases, as in the source, and it has no verbs
 * for anyone but its owner (Teach, Flip and Pick up are hidden: 354-364, 232-243, 303-312), so
 * "Cheater..." (onConversation 521) still has nobody to answer. A visited gnome is never saved here.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&homedemo=home&gnomedemo=1 puts one in the pack.
 * window.groddleGnome: state(), place(), bump(id), verbs(id), run(id, verb), menu(id), answer(value),
 * teach(value). Canvas: gnomes (id@x:state:dir:phrases per gnome here, ';'), gnomePlace, gnomeLast.
 */
import { addItem, countItem, removeItem } from '../inventory.js?v=60dfc9ca';
import { readVisitScene } from '../neighbours-mp.js?v=9f99de95';
import { frameTexture, sourceFromUrl } from '../textures.js?v=f024bd6a';
import { GNOME_ART, GNOME_ART_DIR } from '../garden-gnome-art.js?v=994b7c76';
import { filterText } from '../word-filter.js?v=9a7a7ebb';
import { HOME_INTERIOR_TSID, HOME_STREET_TSID } from '../homes.js?v=631ab6b8';
import { homesFeature } from './homes-feature.js?v=bfb54b3e';
import {
  GNOME_CLASS,
  GNOME_PHRASE_MAX,
  GNOME_TEXT as T,
  GNOME_TIMES,
  bumpGnome,
  createGnomeRuntime,
  forgetPhrase,
  gnomePlaceFor,
  gnomeCell,
  gnomesHere,
  gnomeScaleX,
  gnomeVisual,
  inGnomeBox,
  learnPhrase,
  normalizeGnome,
  normalizeGnomeSlice,
  placeState,
  resetDirection,
  shiftGnomes,
  teachMenu,
  tickGnome,
} from '../garden-gnome.js?v=d9f8e52b';

export const GARDEN_GNOME_ID = 'garden-gnome';
const NAME = 'Garden Gnome';

let slice = normalizeGnomeSlice();
let engineRef = null;
const drawn = new Map();
let drawnPlace = null;
let lastPollAt = 0;
let lastAction = '';
let modal = null;
let demoDone = false;

function placeHere(engine) {
  const tsid = engine.streetTsid;
  if (tsid !== HOME_STREET_TSID && tsid !== HOME_INTERIOR_TSID) return null;
  const scene = homesFeature._state?.()?.scene || null;
  if (scene?.room === 'street' && tsid !== HOME_STREET_TSID) return null;
  if (scene?.room === 'interior' && tsid !== HOME_INTERIOR_TSID) return null;
  const visiting = engine.mode === 'multiplayer' && Boolean(readVisitScene(tsid));
  return gnomePlaceFor(scene, { inHome: engine.homeContext?.()?.inHome === true, visiting });
}

/** One texture per sheet cell, cut once (1x units; js/textures.js swaps the 3x file in on first draw). */
let cellTextures = null;
function gnomeTextures(PIXI) {
  if (cellTextures) return cellTextures;
  const base = sourceFromUrl(`${GNOME_ART_DIR}${GNOME_ART.file}`);
  const { w, h } = GNOME_ART.cell;
  cellTextures = Array.from({ length: GNOME_ART.cells }, (_, k) =>
    frameTexture(base, new PIXI.Rectangle((k % GNOME_ART.cols) * w, Math.floor(k / GNOME_ART.cols) * h, w, h)));
  return cellTextures;
}

function publishArt(engine) {
  engine.setData?.('gnomeArt', [...drawn.values()].map((e) => `${e.vis?.label || ''}:${e.cell}`).join(';'));
}

function publish(engine) {
  publishArt(engine);
  engine.setData?.('gnomes', [...drawn.values()].map((e) => `${e.g.id}@${e.g.x}:${e.rt.state}:${e.rt.dir}:${e.g.phrases.length}`).join(';'));
  engine.setData?.('gnomePlace', drawnPlace || '');
  engine.setData?.('gnomeLast', lastAction);
}

function closeModal() {
  modal?.remove();
  modal = null;
}

function clearDrawn(engine) {
  closeModal();
  for (const e of drawn.values()) {
    engine.unregister?.(e.target);
    if (!e.holder.destroyed) e.holder.destroy({ children: true });
  }
  drawn.clear();
}

/**
 * What stands here to draw: your own gnomes in your own home ({ key: the place, own: true }), or,
 * online on a visit, the owner's in the room you stand in ({ key: visit:<owner>:<place>, own: false,
 * name: whose }); null anywhere else.
 */
function shownHere(engine) {
  const ownPlace = placeHere(engine);
  const multiplayer = engine.mode === 'multiplayer';
  const scene = !ownPlace && multiplayer ? readVisitScene(engine.streetTsid) : null;
  const visit = scene ? engine.query?.('homeVisitGnomes', engine) : null;
  return gnomesHere({ ownPlace, placed: slice.placed, multiplayer, scene, visit });
}

function drawOne(engine, g, { own = true, name = '' } = {}) {
  const { PIXI } = engine;
  if (!PIXI || !engine.entityLayer) return;
  const textures = gnomeTextures(PIXI);
  const holder = new PIXI.Container();
  // The canvas's bottom is the ground under its feet (getAssetInfo 794-796: bottom-centre).
  const body = new PIXI.Sprite(textures[GNOME_ART.frames[0]]);
  body.anchor.set(GNOME_ART.anchor.x, GNOME_ART.anchor.y);
  holder.addChild(body);
  holder.x = g.x;
  holder.y = g.y;
  holder.zIndex = 14;
  engine.entityLayer.addChild(holder);
  const rt = createGnomeRuntime(g);
  holder.scale.x = gnomeScaleX(rt.dir);
  const target = engine.register?.({
    classId: GNOME_CLASS,
    featureId: GARDEN_GNOME_ID,
    label: NAME,
    sprite: holder,
    gnomeId: g.id,
    // Someone else's gnome has no verbs for a visitor (InteractionMenu.as: no choices, a growl).
    ...(own ? {} : { subtitle: T.theirs(name), emptyMenuGrowl: T.theirs(name) }),
  });
  drawn.set(g.id, { g, rt, holder, target, body, own, vis: gnomeVisual(null, rt.state, Date.now(), GNOME_ART), cell: GNOME_ART.frames[0] });
}

function redraw(engine, here) {
  clearDrawn(engine);
  drawnPlace = here?.key || null;
  if (here) for (const g of here.list) drawOne(engine, g, here);
  publish(engine);
}

function say(engine, e, text, ms) {
  if (e.target) engine.say?.(e.target, filterText(text), ms);
}

function act(engine, action) {
  lastAction = action;
  publish(engine);
}

/** The pack's copies and what they know: a gnome sold or given away takes the oldest with it. */
function trimPacked(engine) {
  const have = countItem(engine.inv, GNOME_CLASS);
  while (slice.packed.length > have) slice.packed.shift();
}

function placeFromPack(engine) {
  const place = placeHere(engine);
  if (!place || countItem(engine.inv, GNOME_CLASS) < 1 || !engine.player) return false;
  trimPacked(engine);
  if (!removeItem(engine.inv, GNOME_CLASS, 1)) return false;
  const kept = normalizeGnome(slice.packed.pop() || {});
  const g = {
    ...kept,
    id: `g${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
    place,
    x: Math.round(engine.player.x),
    y: Math.round(engine.player.y),
  };
  slice.placed.push(g);
  if (place === drawnPlace) drawOne(engine, g);
  engine.playSound?.('ITEM_DROP', { volume: 0.6 });
  engine.refreshPack?.();
  engine.save?.();
  act(engine, `placed:${g.id}`);
  return true;
}

function pickUp(engine, e) {
  const room = engine.query?.('packRoom', GNOME_CLASS, 1, engine);
  if (room !== null && room !== undefined && Number(room) < 1) {
    engine.playSound?.('PACK_FULL', { volume: 0.6 });
    engine.pushActivity?.(T.bagFull);
    engine.toast?.(T.bagFull, 2600);
    act(engine, 'pickup:full');
    return true;
  }
  slice.placed = slice.placed.filter((g) => g.id !== e.g.id);
  slice.packed.push(normalizeGnome(e.g));
  engine.unregister?.(e.target);
  if (!e.holder.destroyed) e.holder.destroy({ children: true });
  drawn.delete(e.g.id);
  addItem(engine.inv, GNOME_CLASS, 1);
  engine.refreshPack?.();
  engine.save?.();
  act(engine, `pickup:${e.g.id}`);
  return true;
}

/** A small card in the verb menu's style, for the teach conversation and its input box. */
function card(engine, title, build) {
  closeModal();
  if (typeof document === 'undefined') return null;
  const host = document.getElementById('verb-menu')?.parentElement || document.body;
  const wrap = document.createElement('div');
  wrap.className = 'verb-menu gnome-modal';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `<div class="verb-menu-card">
      <div class="verb-menu-head"><div class="verb-menu-title"></div><button type="button" class="verb-menu-x" aria-label="Cancel">×</button></div>
      <div class="gnome-modal-body" style="padding:0.2rem 0.85rem 0.85rem;display:grid;gap:0.55rem"></div>
    </div>`;
  wrap.querySelector('.verb-menu-title').textContent = title;
  wrap.querySelector('.verb-menu-x').addEventListener('click', closeModal);
  wrap.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      closeModal();
    }
    ev.stopPropagation();
  });
  build(wrap.querySelector('.gnome-modal-body'));
  host.appendChild(wrap);
  modal = wrap;
  (wrap.querySelector('input') || wrap.querySelector('button.verb-choice'))?.focus?.();
  return wrap;
}

function answerMenu(engine, e, value) {
  closeModal();
  if (value === 'teach') return openTeachInput(engine, e);
  const m = /^forget-(\d+)$/.exec(String(value));
  if (m && forgetPhrase(e.g, Number(m[1]))) {
    say(engine, e, T.forgot, 2500);
    engine.save?.();
    act(engine, `forgot:${e.g.id}`);
  }
  return true;
}

function openTeachMenu(engine, e) {
  const menu = teachMenu(e.g.phrases);
  card(engine, NAME, (body) => {
    const line = document.createElement('p');
    line.style.margin = '0';
    line.textContent = menu.text;
    body.appendChild(line);
    for (const choice of menu.choices) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'verb-choice';
      b.dataset.gnomeChoice = choice.value;
      b.textContent = filterText(choice.label);
      b.addEventListener('click', () => answerMenu(engine, e, choice.value));
      body.appendChild(b);
    }
  });
  act(engine, `teach:${e.g.id}`);
  return true;
}

function teachPhrase(engine, e, value) {
  closeModal();
  const phrase = learnPhrase(e.g, value);
  if (!phrase) return false;
  say(engine, e, T.boom(phrase), GNOME_TIMES.boomMs);
  engine.save?.();
  act(engine, `learned:${e.g.id}:${e.g.phrases.length}`);
  return true;
}

function openTeachInput(engine, e) {
  card(engine, T.inputTitle, (body) => {
    const form = document.createElement('form');
    form.style.display = 'grid';
    form.style.gap = '0.55rem';
    const label = document.createElement('label');
    label.textContent = T.inputLabel;
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = GNOME_PHRASE_MAX;
    input.autocomplete = 'off';
    input.style.cssText = 'font:inherit;padding:0.45rem 0.6rem;border:1px solid #d9ccb3;border-radius:8px;background:#fff';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:0.5rem;justify-content:flex-end';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'verb-choice';
    cancel.style.width = 'auto';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', closeModal);
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.className = 'verb-choice';
    ok.style.width = 'auto';
    ok.textContent = 'OK';
    row.append(cancel, ok);
    form.append(label, input, row);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      teachPhrase(engine, e, input.value);
    });
    body.appendChild(form);
  });
  return true;
}

function setupDemo(engine) {
  if (demoDone || engine.param?.('gnomedemo') !== '1') return;
  demoDone = true;
  addItem(engine.inv, GNOME_CLASS, Math.max(1, Number(engine.param?.('gnomecount')) || 1));
  engine.refreshPack?.();
  if (typeof window !== 'undefined') {
    const entry = (id) => drawn.get(id);
    window.groddleGnome = {
      state: () => ({ place: placeHere(engine), slice, drawn: [...drawn.values()].map((e) => ({ ...e.g, state: e.rt.state, dir: e.rt.dir })) }),
      place: () => placeFromPack(engine),
      bump: (id) => { const e = entry(id); return e ? bump(engine, e, engine.player?.x ?? 0) : null; },
      verbs: (id) => gardenGnomeFeature.verbsFor(entry(id)?.target),
      run: (id, verb) => gardenGnomeFeature.runVerb(entry(id)?.target, verb, engine),
      answer: (id, value) => answerMenu(engine, entry(id), value),
      teach: (id, value) => teachPhrase(engine, entry(id), value),
    };
  }
}

function bump(engine, e, playerX) {
  const res = bumpGnome(e.g, e.rt, { x: e.g.x, playerX, now: Date.now() });
  if (res) act(engine, `bump:${res}:${e.g.id}`);
  return res;
}

export const gardenGnomeFeature = {
  id: GARDEN_GNOME_ID,

  onTick(dtMs, now, engine) {
    if (!engine.started) return;
    engineRef = engine;
    setupDemo(engine);
    const t = Date.now();
    if (t - lastPollAt >= 250) {
      lastPollAt = t;
      trimPacked(engine);
      const here = shownHere(engine);
      if ((here?.key || null) !== drawnPlace) redraw(engine, here);
    }
    const p = engine.player;
    let changed = false;
    let artChanged = false;
    for (const e of drawn.values()) {
      if (p) {
        const inside = inGnomeBox(e.g, p.x, p.y);
        if (inside && !e.rt.inside) bump(engine, e, p.x);
        e.rt.inside = inside;
      }
      const before = e.rt.state;
      const out = tickGnome(e.g, e.rt, t);
      if (out?.say) say(engine, e, out.say, out.ms);
      if (before !== e.rt.state) changed = true;
      e.holder.scale.x = gnomeScaleX(e.rt.dir);
      const label = e.vis.label;
      e.vis = gnomeVisual(e.vis, e.rt.state, t, GNOME_ART);
      const cell = gnomeCell(GNOME_ART, e.vis.label, t - e.vis.at);
      if (cell !== e.cell && !e.body.destroyed) {
        e.cell = cell;
        e.body.texture = cellTextures[cell];
      }
      if (label !== e.vis.label) artChanged = true;
    }
    if (changed) publish(engine);
    else if (artChanged) publishArt(engine);
  },

  onStreetClear(engine) {
    clearDrawn(engine || engineRef || {});
    drawnPlace = null;
  },

  verbsFor(target) {
    const e = drawn.get(target?.gnomeId);
    if (!e) return null;
    // Its owner's alone: Teach, Flip and Pick up are hidden from anyone else (state null in the source).
    if (!e.own) return [];
    return [
      { id: 'teach', label: 'Teach', enabled: true, tooltip: T.teachTip },
      { id: 'flip', label: 'Flip', enabled: true, tooltip: T.flipTip },
      { id: 'pickup', label: 'Pick up', enabled: true, tooltip: T.pickupTip },
    ];
  },

  runVerb(target, verbId, engine) {
    const e = drawn.get(target?.gnomeId);
    if (!e || !e.own) return false;
    if (verbId === 'teach') return openTeachMenu(engine, e);
    if (verbId === 'pickup') return pickUp(engine, e);
    if (verbId === 'flip') {
      e.g.facingLeft = !e.g.facingLeft;
      resetDirection(e.g, e.rt, Date.now());
      engine.pushActivity?.(`You flipped a ${NAME}.`); // buildVerbMessage(1, 'flip', 'flipped', ...)
      engine.save?.();
      act(engine, `flip:${e.g.id}`);
      return true;
    }
    return false;
  },

  packVerbs(classTsid, engine) {
    if (classTsid !== GNOME_CLASS) return null;
    const state = placeState(placeHere(engine));
    return [{ id: 'gnome_place', label: 'Place', tooltip: T.placeTip, enabled: state.enabled, reason: state.reason, primary: true }];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== GNOME_CLASS || verbId !== 'gnome_place') return false;
    return placeFromPack(engine);
  },

  /**
   * G640: homes-feature's shiftShownRoom says a home room's contents moved by dx in world x (the
   * home street grew to the left, or the back yard did): your own gnomes there move with the house,
   * as the street's stacks and the Craftybot do. homes-feature saves after asking. Null so every
   * feature hears it.
   */
  homeRoomShifted(room, dx, engine) {
    const moved = shiftGnomes(slice.placed, room, dx);
    if (!moved.length) return null;
    for (const g of moved) {
      const e = drawn.get(g.id);
      if (e?.own && e.g === g && !e.holder.destroyed) e.holder.x = g.x;
    }
    lastAction = `shifted:${room}:${Math.round(dx)}:${moved.length}`;
    if (engine) publish(engine);
    return null;
  },

  /** verbs.drop 320-341: "Replaced by place". */
  packDropBlockReason(classTsid) {
    return classTsid === GNOME_CLASS ? T.useInstead : null;
  },

  save() {
    const out = {};
    if (slice.placed.length) out.placed = slice.placed.map((g) => ({ ...g }));
    if (slice.packed.length) out.packed = slice.packed.map((g) => ({ ...g }));
    return Object.keys(out).length ? out : undefined;
  },

  restore(seed) {
    slice = normalizeGnomeSlice(seed || {});
    drawnPlace = null;
    if (engineRef) redraw(engineRef, shownHere(engineRef));
  },

  /** Tests. */
  _reset() {
    slice = normalizeGnomeSlice();
    engineRef = null;
    drawn.clear();
    drawnPlace = null;
    lastPollAt = 0;
    lastAction = '';
    modal = null;
    demoDone = false;
  },
};
