/**
 * Artifacts (js/artifacts.js) as a feature module (G122).
 *
 *  - Registers every artifact piece, necklace bead, finished artifact,
 *    necklace and petrified rock with its source copy and stack size.
 *  - Petrified rocks get a Crack pack verb (one button per working tool from
 *    petrified_rock_base valid_tools). The tool takes one use, PETRIFIED_ROCK
 *    plays, the avatar is locked for the 2 s crack, then the rock is used up
 *    and the size's drop tables pay out with one combined activity line.
 *  - Assembly watches the pack: when a piece or bead arrives and completes
 *    its set, after 1 s the locking 5 s overlay shows, the pieces or beads
 *    are used, artifacts_made / necklaces_made counts it (Student of
 *    Artifactology, Qualified Artifactologist, Bead Threader, Threader of
 *    Renown) and the artifact lands in the pack 5 s later. Finished
 *    artifacts are keepsakes: pick up, drop, give (no verbs of their own).
 *    One guard the source lacks: a set that stopped being whole during the
 *    1 s wait is skipped (the source would still have made the artifact).
 *
 * Rocks come only from Feat rewards in the original (see js/artifacts.js),
 * which the remake does not hand out yet: the register row after G122 tracks
 * that. Until then a player meets this system through QA routes only.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&artifactdemo=rocks
 *     puts one rock of each size and a Pick in the pack;
 *     &artifactautoplay=crack cracks one (&artifactrock=small|medium|large,
 *     default medium; &artifactseed=N fixes the rolls).
 *     artifactdemo=assemble&artifactset=<type> (chicken_brick, wooden_apple,
 *     ... default chicken_brick) holds every piece but the last;
 *     &artifactautoplay=1 adds the last one as a drop would.
 *     &artifactprior=N first counts N other artifacts as made (N=2 makes the
 *     assembly earn Student of Artifactology).
 *     artifactdemo=necklace&artifactbead=<amazonite|rhyolite|onyx|redtigereye|imperial>
 *     holds one bead short; &artifactautoplay=1 adds the last bead.
 *     Canvas: artifactLast, artifactCrack, artifactCracked, artifactMade,
 *     artifactPending, artifactOverlay, artifactProgress, artifactAutoplay.
 */

import { addItem, ensureItem, ITEM_CATALOG, removeItem } from '../inventory.js?v=85d4faba';
import { DROP_ITEMS, rollDropTable } from '../drop-tables.js?v=0f922478';
import { canUseTool, useToolCondition, TOOL_CONDITION_CATALOG } from '../tools.js?v=9a2e7ef4';
import { OVERLAY_USES, playOverlay } from '../overlays.js?v=6d2b7a11';
import {
  ALL_ARTIFACT_CLASSES,
  ARRIVE_DELAY_MS,
  ARTIFACT_MAP,
  ARTIFACT_NECKLACES,
  ASSEMBLE_DELAY_MS,
  BEAD_IDS,
  CRACK_COPY,
  CRACK_MS,
  CRACK_SOUND,
  EXTRA_ITEMS,
  OVERLAY_MS,
  ROCK_IDS,
  assemblyCounter,
  assemblyFor,
  canCrack,
  collectionProgress,
  consumeForAssembly,
  crackMessage,
  crackStartMessage,
  createArtifactState,
  isArtifactPiece,
  isPetrifiedRock,
  normalizeArtifactState,
  rollCrack,
  stackMaxFor,
} from '../artifacts.js?v=fc419ecf';

export const ARTIFACTS_FEATURE_ID = 'artifacts';
const WATCH_MS = 250;
const WATCHED = ALL_ARTIFACT_CLASSES.filter(isArtifactPiece);

let state = createArtifactState();
let last = '';
let seen = null;
let watchAt = 0;
/** Sets waiting their 1 s: key -> { plan, at }. */
const pending = new Map();
/** Artifacts on their way to the pack: [{ id, at }]. */
let arrivals = [];
let overlay = null;
let crack = null;
let rng = Math.random;
let demo = null;
let autoplayAt = 0;
let autoplayDone = '';

function seeded(seed) {
  let s = (Number(seed) >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function metaFor(id) {
  return DROP_ITEMS[id] || EXTRA_ITEMS[id] || null;
}

function registerItems() {
  for (const id of ALL_ARTIFACT_CLASSES) {
    const meta = metaFor(id);
    if (!meta) continue;
    ensureItem(id, {
      label: meta.label,
      namePlural: meta.plural,
      desc: meta.desc || undefined,
      baseCost: 0,
      stackMax: stackMaxFor(id),
      // Every class here is tagged no_donate (artifacts, pieces) or no_trade (rocks), with base_cost 0.
      donatable: false,
      sellable: false,
      tags: meta.tags ? [...meta.tags] : undefined,
    });
  }
}

const labelOf = (id) => ITEM_CATALOG[id]?.label || metaFor(id)?.label || id;
const isWorking = (engine) => (id) => canUseTool(engine.toolState, id, 1).ok;

function publish(engine) {
  if (!engine?.setData) return;
  engine.setData('artifactLast', last || 'none');
  engine.setData('artifactCrack', crack ? `${crack.rock}:${crack.tool}` : 'idle');
  engine.setData('artifactCracked', Object.entries(state.cracked).map(([k, v]) => `${k}:${v}`).join(',') || 'none');
  engine.setData('artifactMade', Object.entries(state.made).map(([k, v]) => `${k}:${v}`).join(',') || 'none');
  engine.setData('artifactPending', [...pending.keys(), ...arrivals.map((a) => `arriving:${a.id}`)].join(',') || 'none');
  engine.setData('artifactOverlay', overlay ? overlay.text : 'none');
  const prog = collectionProgress(engine.inv || {});
  engine.setData('artifactProgress', [
    ...prog.artifacts.filter((a) => a.have).map((a) => `${a.type}:${a.have}/${a.need}`),
    ...prog.necklaces.filter((n) => n.have).map((n) => `${n.bead.replace(/^artifact_necklace_|_piece$/g, '')}:${n.have}/${n.need}`),
  ].join(',') || 'none');
}

function say(engine, msg, ok = true) {
  if (!msg) return;
  last = msg;
  engine.pushActivity?.(msg);
  engine.toast?.(msg, ok ? 3600 : 2600);
}

/* ---------------------------------------------------------------- overlay */

function showOverlay(text) {
  hideOverlay();
  if (typeof document === 'undefined') {
    overlay = { el: null, text, until: Date.now() + OVERLAY_MS };
    return;
  }
  const el = document.createElement('div');
  el.className = 'artifact-vog';
  el.setAttribute('role', 'status');
  // announce_vp_overlay: width 500, x 50%, top_y 15%, nuxp_vog text, no click to advance.
  el.style.cssText = 'position:fixed;z-index:62;left:50%;top:15%;transform:translateX(-50%);width:min(500px,calc(100% - 32px));'
    + 'text-align:center;pointer-events:none;color:#fff;font:800 24px/1.3 Nunito,"Trebuchet MS",sans-serif;'
    + 'text-shadow:0 2px 4px rgba(0,0,0,.6),0 0 12px rgba(0,0,0,.35)';
  el.textContent = text;
  document.body.appendChild(el);
  overlay = { el, text, until: Date.now() + OVERLAY_MS };
}

function hideOverlay() {
  if (overlay?.el?.isConnected) overlay.el.remove();
  overlay = null;
}

/* --------------------------------------------------------------- assembly */

/** inc_artifacts.js artifactPieceAdded. */
function pieceAdded(engine, classTsid) {
  const plan = assemblyFor(engine.inv, classTsid);
  if (!plan) return;
  const key = plan.kind === 'necklace' ? plan.produces : plan.artifact;
  if (pending.has(key)) return;
  pending.set(key, { plan, at: Date.now() + ASSEMBLE_DELAY_MS });
}

/** createArtifact / createArtifactNecklace. */
function assemble(engine, plan) {
  if (!consumeForAssembly(engine.inv, plan)) return false;
  const made = plan.kind === 'necklace' ? plan.produces : plan.artifact;
  showOverlay(plan.kind === 'necklace'
    ? CRACK_COPY.combinedBeads(plan.required, labelOf(made))
    : CRACK_COPY.combined(labelOf(made)));
  arrivals.push({ id: made, at: Date.now() + ARRIVE_DELAY_MS });
  state.made[made] = (state.made[made] || 0) + 1;
  engine.achievement?.(assemblyCounter(plan), 1);
  last = `assembled:${made}`;
  engine.refreshPack?.();
  engine.save?.();
  return true;
}

function watchPack(engine, now) {
  if (now < watchAt) return;
  watchAt = now + WATCH_MS;
  const inv = engine.inv || {};
  if (!seen) {
    seen = Object.fromEntries(WATCHED.map((id) => [id, Number(inv[id]) || 0]));
    return;
  }
  for (const id of WATCHED) {
    const n = Number(inv[id]) || 0;
    if (n > seen[id]) pieceAdded(engine, id);
    seen[id] = n;
  }
}

function tickAssembly(engine, now) {
  for (const [key, row] of pending) {
    if (now < row.at || crack) continue;
    pending.delete(key);
    assemble(engine, row.plan);
  }
  if (arrivals.length) {
    const due = arrivals.filter((a) => now >= a.at);
    if (due.length) {
      arrivals = arrivals.filter((a) => now < a.at);
      for (const a of due) {
        // createItemFromGround: the artifact arrives in the pack.
        addItem(engine.inv, a.id, 1);
        engine.playSound?.('DISCOVER_USEFUL_NEW_ITEM', { volume: 0.55 });
        const p = engine.player;
        if (p) engine.floatText?.(p.x, (p.y || 0) - 130, `+1 ${labelOf(a.id)}`, 0xffe39a);
      }
      engine.refreshPack?.();
      engine.save?.();
    }
  }
  if (overlay && now >= overlay.until) hideOverlay();
}

/* ------------------------------------------------------------------ crack */

/**
 * G379 petrified_rock_small.js 174-199 (and medium, large): Tiny Speck's petrified_rock_open_overlay,
 * a pc_overlay at 1:1, delta_y -115, locking, for the 2 s crack.
 */
function crackFx(engine, rock) {
  const p = engine.player;
  if (!engine.PIXI || !p || !engine.fxLayer) return null;
  const use = OVERLAY_USES.petrified_rock_open_overlay;
  const handle = playOverlay(engine.PIXI, 'petrified_rock_open_overlay', {
    layer: engine.fxLayer,
    at: () => ({ x: p.x + use.dx, y: p.y + use.dy }),
    durationMs: Math.max(use.durationMs, CRACK_MS),
    loop: false,
    zIndex: 9000,
  });
  engine.setData?.('artifactCrackArt', `petrified_rock_open_overlay:${rock}`);
  return { handle };
}

function tickCrackFx() {
  // The overlay runs itself (js/overlays.js).
}

function stopCrackFx() {
  crack?.fx?.handle?.stop();
}

function startCrack(engine, rock, tool) {
  if (crack) return say(engine, 'You are already cracking a rock.', false), true;
  const check = canCrack(engine.inv, rock, isWorking(engine));
  if (!check.ok) return say(engine, check.msg || CRACK_COPY.noTool, false), true;
  const use = check.tools.includes(tool) ? tool : check.tools[0];
  // tool.use(this, 1) happens as the crack starts.
  const wear = useToolCondition(engine.toolState, use, 1);
  if (wear.msg) engine.pushActivity?.(wear.msg);
  engine.playSound?.(CRACK_SOUND, { volume: 0.7 });
  say(engine, crackStartMessage(rock));
  crack = { rock, tool: use, at: Date.now() + CRACK_MS, fx: crackFx(engine, rock) };
  engine.refreshPack?.();
  publish(engine);
  return true;
}

/** petrified_rock_*.js onCrack. */
export function finishCrack(engine, rock, opts = {}) {
  const r = opts.rng || rng;
  if (!removeItem(engine.inv, rock, 1)) return null;
  const out = rollCrack(rock, { rng: r, rollTable: (id, g) => rollDropTable(id, g), meta: metaFor });
  for (const [id, n] of out.items) {
    const meta = metaFor(id);
    if (meta && !ITEM_CATALOG[id]) ensureItem(id, { label: meta.label, namePlural: meta.plural, desc: meta.desc || undefined, baseCost: meta.baseCost });
    addItem(engine.inv, id, n);
  }
  if (out.currants && engine.pc) engine.pc.currants = (Number(engine.pc.currants) || 0) + out.currants;
  state.cracked[rock] = (state.cracked[rock] || 0) + 1;
  // items/item.js notifyVerb on success.
  engine.achievement?.(`${rock}:crack`, 1);
  engine.achievement?.(`VERB:crack:${rock}`, 1);
  const msg = crackMessage(out.lines, out.messageLost);
  if (msg) say(engine, msg);
  else last = `cracked:${rock}`;
  const p = engine.player;
  let lift = 0;
  for (const line of out.lines) {
    if (p) engine.floatText?.(p.x, (p.y || 0) - 130 - lift, `+${line}`, 0xffe39a);
    lift += 18;
  }
  engine.refreshPack?.();
  engine.save?.();
  return out;
}

function tickCrack(engine, now, dtMs) {
  if (!crack) return;
  tickCrackFx(crack.fx, engine, dtMs);
  if (now < crack.at) return;
  const { rock } = crack;
  stopCrackFx();
  crack = null;
  finishCrack(engine, rock);
  publish(engine);
}

/* --------------------------------------------------------------- QA demo */

function demoSetup(engine) {
  const mode = engine.param?.('artifactdemo');
  if (!mode || demo) return;
  if (engine.param('artifactseed')) rng = seeded(engine.param('artifactseed'));
  const inv = engine.inv;
  demo = { mode };
  if (mode === 'rocks') {
    for (const rock of ROCK_IDS) inv[rock] = Math.max(1, Number(inv[rock]) || 0);
    if (!inv.pick) inv.pick = 1;
  } else if (mode === 'assemble') {
    const type = ARTIFACT_MAP[engine.param('artifactset')] ? engine.param('artifactset') : 'chicken_brick';
    const pieces = ARTIFACT_MAP[type].pieces;
    for (const piece of pieces.slice(0, -1)) inv[piece] = Math.max(1, Number(inv[piece]) || 0);
    inv[pieces[pieces.length - 1]] = 0;
    demo.add = [pieces[pieces.length - 1], 1];
    const prior = Math.max(0, Math.min(9, Number(engine.param('artifactprior')) || 0));
    const others = Object.values(ARTIFACT_MAP).map((a) => a.artifact).filter((a) => a !== ARTIFACT_MAP[type].artifact);
    for (const other of others.slice(0, prior)) engine.achievement?.(`artifacts_made:${other}`, 1);
  } else if (mode === 'necklace') {
    const bead = BEAD_IDS.find((id) => id.split('_')[2] === engine.param('artifactbead')) || BEAD_IDS[2];
    inv[bead] = ARTIFACT_NECKLACES[bead].required - 1;
    demo.add = [bead, 1];
  }
  seen = null;
  engine.refreshPack?.();
  if (engine.param('artifactautoplay')) autoplayAt = Date.now() + 1500;
}

function autoplay(engine) {
  autoplayAt = 0;
  const step = engine.param('artifactautoplay');
  if (demo?.mode === 'rocks' && step === 'crack') {
    const rock = ROCK_IDS.find((id) => id.endsWith(`_${engine.param('artifactrock')}`)) || ROCK_IDS[1];
    startCrack(engine, rock, 'pick');
    autoplayDone = `crack:${rock}`;
  } else if (demo?.add) {
    // As a drop would: the piece lands in the pack and the watcher sees it.
    addItem(engine.inv, demo.add[0], demo.add[1]);
    engine.refreshPack?.();
    autoplayDone = `add:${demo.add[0]}`;
  }
  engine.setData?.('artifactAutoplay', autoplayDone || 'none');
}

/* ---------------------------------------------------------------- feature */

export const artifactsFeature = {
  id: ARTIFACTS_FEATURE_ID,

  init(engine) {
    registerItems();
    publish(engine);
  },

  onStreetEnter(street, engine) {
    demoSetup(engine);
    publish(engine);
  },

  onTick(dtMs, now, engine) {
    if (autoplayAt && now >= autoplayAt) autoplay(engine);
    watchPack(engine, now);
    tickCrack(engine, now, dtMs);
    const busyBefore = pending.size + arrivals.length + (overlay ? 1 : 0);
    tickAssembly(engine, now);
    if (busyBefore || crack) publish(engine);
  },

  /** The crack overlay and the combined-pieces overlay are both locking. */
  physics() {
    return crack || overlay ? { speed: 0, jump: 0 } : null;
  },

  packVerbs(classTsid, engine) {
    if (!isPetrifiedRock(classTsid)) return [];
    const check = canCrack(engine.inv, classTsid, isWorking(engine));
    if (!check.ok) return [{ id: 'crack', label: 'Crack', enabled: false, reason: check.msg || CRACK_COPY.noTool, tooltip: CRACK_COPY.tooltip }];
    // valid_items: one choice per working tool class.
    if (check.tools.length === 1) {
      return [{ id: `crack:${check.tools[0]}`, label: 'Crack', enabled: !crack, reason: crack ? 'You are already cracking a rock.' : '', tooltip: `${CRACK_COPY.tooltip} with your ${TOOL_CONDITION_CATALOG[check.tools[0]]?.label || labelOf(check.tools[0])}`, primary: true }];
    }
    return check.tools.map((tool, i) => ({
      id: `crack:${tool}`,
      label: `Crack with ${TOOL_CONDITION_CATALOG[tool]?.label || labelOf(tool)}`,
      enabled: !crack,
      reason: crack ? 'You are already cracking a rock.' : '',
      tooltip: CRACK_COPY.tooltip,
      primary: i === 0,
    }));
  },

  runPackVerb(classTsid, verbId, engine) {
    if (!isPetrifiedRock(classTsid) || !String(verbId).startsWith('crack')) return false;
    return startCrack(engine, classTsid, String(verbId).split(':')[1] || '');
  },

  save() {
    return state;
  },

  restore(slice) {
    state = normalizeArtifactState(slice || {});
    seen = null;
  },

  /** QA / tests. */
  _state() {
    return { state, pending, arrivals, overlay, crack, last, seen };
  },
  _reset() {
    state = createArtifactState();
    last = '';
    seen = null;
    watchAt = 0;
    pending.clear();
    arrivals = [];
    hideOverlay();
    crack = null;
    rng = Math.random;
    demo = null;
    autoplayAt = 0;
    autoplayDone = '';
  },
  _setRng(fn) {
    rng = fn;
  },
  _rocks: ROCK_IDS,
};
