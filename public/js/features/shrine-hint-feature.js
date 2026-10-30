/**
 * Shrine hint (npc_shrine_base onPlayerCollision): until the Giant devotion
 * quest (donate_to_all_shrines) has been offered, walking past three
 * different shrines brings the voice of the Giants once:
 * "Lo, a shrine to <Giant>//Try donating something." (announce_vog_fade;
 * '//' separates the faded pages). The shrine's hitbox is 400x400, the same
 * size as its emblem hitbox (js/shrines.js inEmblemHitbox).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&shrinedemo=1&shrinehint=2 counts two
 * other shrines as passed, so the street's own shrine is the third.
 *
 * "I love you <Giant>" (G94, rules in js/giant-love.js): said in the Local
 * chat box within 200 px of that Giant's shrine (the closest shrine there),
 * the Giant's screen opens: "<Giant> says..." / "I love you too, friend",
 * on the Giant's colour, with GONG_GIANTS as the fade-in ends. Click
 * anywhere, Enter or Escape once the line is up closes it (GiantView.as 128
 * listens for a click anywhere, BaseScreenView.as 224-226 for Escape and
 * Enter; Space is not one of them, G364). While it is up it has the keyboard,
 * as the award screens do (screen-fx.js screenInput). It waits in the game's
 * screen queue like the client's GIANT_SCREEN (NCMsgHandler.as 1025-1031:
 * engine.queueScreen, G364). The chat line itself still shows, as in the
 * source. No favor, no daily cap.
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&shrinedemo=1
 *   &giantloveautoplay=1 types "I love you <this shrine's Giant>" into the
 *   chat box and sends it 2.5 s in (&giantlovesay=<line> sends that line
 *   instead). Canvas: giantLove (screen:<giant> | no-shrine:<giant> |
 *   wrong-shrine:<giant>), giantLoveScreen (open | ready | closed),
 *   giantLoveLine, giantLoveSound.
 */
import { questStatus } from '../quest-offers.js?v=g403-1';
import { GIANT_SCREEN_FADE_MS, giantLoveResponse } from '../giant-love.js?v=g94-1';
import { GIANTS, inEmblemHitbox } from '../shrines.js?v=spinning-wheel-test-9';
import { vogPages } from '../newxp.js?v=g449-1';
import { screenInput } from '../screen-fx.js?v=g434-1';

export const SHRINE_HINT_FEATURE_ID = 'shrine-hint';
export const SHRINES_TO_PASS = 3;

let state = { passed: {}, announced: false };
let inside = false;
let ui = null;
let eng = null;
let love = { ui: null, open: false, ready: false, queued: false, autoAt: 0, autoDone: false, timers: [] };

export function shrineHintText(giantName) {
  return `Lo, a shrine to ${giantName}//Try donating something.`;
}

/** One pass of a shrine; returns the hint text on the third distinct shrine. */
export function passShrine(hint, key, giantName, questState) {
  if (hint.announced || questStatus(questState, 'donate_to_all_shrines') !== 'none') return null;
  hint.passed[key] = (hint.passed[key] || 0) + 1;
  if (Object.keys(hint.passed).length !== SHRINES_TO_PASS) return null;
  hint.announced = true;
  return shrineHintText(giantName);
}

function shrineTarget(engine) {
  return engine.interactables.find((t) => t.classId?.startsWith('npc_shrine_') && t.sprite && !t.sprite.destroyed) || null;
}

function ensureUi() {
  if (ui) return ui;
  const style = document.createElement('style');
  style.textContent = `.shrine-vog{position:fixed;z-index:calc(var(--z-notice) + 11);display:flex;align-items:center;justify-content:center;text-align:center;
  background:color-mix(in srgb, var(--c-black) 45%, transparent);cursor:pointer;color:var(--text-inverse);font:800 var(--fs-3xl)/var(--lh-snug) var(--font-round);
  text-shadow:0 2px 4px color-mix(in srgb, var(--c-black) 50%, transparent);padding:var(--sp-10);box-sizing:border-box;opacity:0;transition:opacity .4s}
.shrine-vog.on{opacity:1}
.shrine-vog[hidden]{display:none!important}`;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'shrine-vog';
  el.hidden = true;
  el.setAttribute('role', 'status');
  document.body.appendChild(el);
  ui = el;
  return ui;
}

async function showVog(engine, text) {
  const el = ensureUi();
  const r = engine.app?.canvas?.getBoundingClientRect?.() || document.querySelector('canvas')?.getBoundingClientRect();
  if (r) Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  for (const page of vogPages(text)) {
    el.textContent = page;
    el.hidden = false;
    engine.setData('shrineHint', page);
    requestAnimationFrame(() => el.classList.add('on'));
    await new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        el.removeEventListener('click', done);
        resolve();
      };
      const timer = setTimeout(done, Math.max(2600, page.length * 70));
      el.addEventListener('click', done);
    });
    el.classList.remove('on');
    await new Promise((resolve) => setTimeout(resolve, 400));
    el.hidden = true;
  }
  engine.setData('shrineHint', '');
}

// —— "I love you <Giant>" (G94) ———————————————————————————————————————————

/** The live shrines as { giant, x, y } (sprite anchor at the base, like the player's feet). */
function liveShrines(engine) {
  return (engine?.interactables || [])
    .filter((t) => t?.classId?.startsWith('npc_shrine_') && t.sprite && !t.sprite.destroyed && t.sprite.visible !== false)
    .map((t) => ({ giant: t.state?.giantId || t.classId.slice('npc_shrine_'.length), x: t.sprite.x, y: t.sprite.y }));
}

/** doLocalChat's love check for one line you said. Returns the giantLoveResponse result. */
export function sayLoveLine(engine, text) {
  const p = engine?.player;
  const res = giantLoveResponse(text, { shrines: liveShrines(engine), x: Number(p?.x), y: Number(p?.y) });
  if (res.reason === 'not-love') return res;
  engine.setData?.('giantLove', res.ok ? `screen:${res.giant}` : `${res.reason}:${res.giant}`);
  if (res.ok && !love.open && !love.queued) queueGiantScreen(engine, res.screen, res.giant);
  return res;
}

/** G364: the Giant's screen waits its turn behind award screens and the queue's gates. */
function queueGiantScreen(engine, screen, giantId) {
  love.queued = true;
  const run = () => showGiantScreen(engine, screen, giantId);
  const shown = typeof engine?.queueScreen === 'function' ? engine.queueScreen(run) : run();
  Promise.resolve(shown).finally(() => {
    love.queued = false;
  });
}

function ensureLoveUi() {
  if (love.ui) return love.ui;
  const style = document.createElement('style');
  style.textContent = `.giant-screen{position:fixed;z-index:calc(var(--z-screen) + 16);display:flex;flex-direction:column;align-items:center;justify-content:center;
  box-sizing:border-box;padding:var(--sp-10);cursor:default;opacity:0;transition:opacity .8s linear;color:var(--text-inverse);overflow:hidden}
.giant-screen.on{opacity:1}
.giant-screen.out{opacity:0;transition-duration:.4s}
.giant-screen[hidden]{display:none!important}
.giant-screen.ready{cursor:pointer}
.gs-stage{display:flex;align-items:center;justify-content:center;gap:28px;max-width:100%}
.gs-art{width:190px;height:auto;flex:none;transform:scale(.2);opacity:0;filter:drop-shadow(0 6px 14px color-mix(in srgb, var(--c-black) 45%, transparent))}
.giant-screen.on .gs-art{transform:scale(1);opacity:1;transition:transform 1.6s cubic-bezier(.34,1.56,.64,1) 1.2s,opacity 1.6s ease-in 1.2s}
.gs-text{max-width:350px;clip-path:inset(0 0 100% 0)}
.giant-screen.on .gs-text{clip-path:inset(0 0 0 0);transition:clip-path 1s linear 2.8s}
.gs-name{margin:0;font:800 var(--fs-5xl)/var(--lh-tight) var(--font-round);text-shadow:0 3px 3px color-mix(in srgb, var(--c-black) 35%, transparent)}
.gs-tip{margin:.35em 0 0;font:700 var(--fs-2xl)/var(--lh-snug) var(--font-round);opacity:.9;text-shadow:0 3px 3px color-mix(in srgb, var(--c-black) 35%, transparent)}
.gs-ok{position:absolute;left:50%;bottom:30px;transform:translateX(-50%);display:flex;align-items:center;gap:var(--sp-4);
  padding:var(--sp-3) var(--sp-8) var(--sp-3) var(--sp-6);border-radius:var(--radius-2xl);background:linear-gradient(var(--c-grey-94),var(--c-grey-87));color:var(--c-grey-39);
  font:700 var(--fs-base)/18px var(--font-round);box-shadow:0 2px 0 color-mix(in srgb, var(--c-black) 25%, transparent);opacity:0;transition:opacity .5s linear;pointer-events:none}
.gs-ok::before{content:"";border-left:8px solid var(--c-grey-57);border-top:5px solid transparent;border-bottom:5px solid transparent}
.giant-screen.ready .gs-ok{opacity:1}
@media (max-width:560px){.gs-stage{flex-direction:column;gap:var(--sp-7);text-align:center}.gs-art{width:120px}.gs-name{font-size:var(--fs-3xl)}.gs-tip{font-size:var(--fs-xl)}}`;
  document.head.appendChild(style);
  const el = document.createElement('div');
  // An id ending in -panel holds engine.busy() (quest offers, autoplay) while it is up.
  el.id = 'giant-screen-panel';
  el.className = 'giant-screen';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<div class="gs-stage"><img class="gs-art" alt=""><div class="gs-text"><p class="gs-name"></p><p class="gs-tip"></p></div></div><div class="gs-ok">Click anywhere...</div>';
  document.body.appendChild(el);
  love.ui = el;
  return el;
}

function hexToRgba(hex, alpha) {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * GiantView.show with start_with_tip: the Giant's colour, its art, "<Giant> says...", the line, then Click anywhere.
 * Resolves with how it closed once it has faded out.
 */
function showGiantScreen(engine, screen, giantId) {
  if (typeof document === 'undefined') return Promise.resolve('');
  const el = ensureLoveUi();
  const r = engine.app?.canvas?.getBoundingClientRect?.() || document.querySelector('canvas')?.getBoundingClientRect();
  if (r) Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  el.style.background = hexToRgba(screen.bg, screen.alpha);
  el.querySelector('.gs-art').src = `assets/sprites/icons/emblem_${giantId}@3x.png`;
  el.querySelector('.gs-name').textContent = screen.title;
  el.querySelector('.gs-tip').textContent = screen.tipBody;
  el.setAttribute('aria-label', `${screen.title} ${screen.tipBody}`);
  el.classList.remove('on', 'out', 'ready');
  el.hidden = false;
  love.open = true;
  love.ready = false;
  for (const t of love.timers) clearTimeout(t);
  love.timers = [];
  engine.setData('giantLoveScreen', 'open');
  engine.setData('giantLoveLine', `${screen.title} ${screen.tipBody}`);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  // BaseScreenView.as 76: the sound plays as the fade-in ends.
  love.timers.push(setTimeout(() => {
    engine.playSound?.(screen.sound, { volume: 0.7 });
    engine.setData('giantLoveSound', screen.sound);
  }, GIANT_SCREEN_FADE_MS));
  // A click anywhere on it (GiantView.as 128), Enter or Escape (BaseScreenView.as 224-226).
  const input = screenInput(el, { button: el });
  // GiantView: input waits for the text to finish (onAnimateTextComplete 454-459).
  love.timers.push(setTimeout(() => {
    love.ready = true;
    input.ready();
    el.classList.add('ready');
    engine.setData('giantLoveScreen', 'ready');
  }, 3800));
  return input.done.then((how) => closeGiantScreen(how)).finally(() => input.release());
}

function closeGiantScreen(how = '') {
  const el = love.ui;
  if (!el || !love.open) return Promise.resolve(how);
  love.open = false;
  love.ready = false;
  el.classList.add('out');
  el.classList.remove('on');
  eng?.setData?.('giantLoveScreen', 'closed');
  eng?.setData?.('giantLoveClosedBy', how);
  return new Promise((resolve) => {
    love.timers.push(setTimeout(() => {
      if (!love.open) el.hidden = true;
      resolve(how);
    }, 400));
  });
}

/** The Local chat box (read in the capture phase, before the form clears it). */
function onChatSubmit(e) {
  if (!eng?.started || e.target?.id !== 'local-chat-form') return;
  const input = document.getElementById('local-chat-input');
  sayLoveLine(eng, String(input?.value || ''));
}

/** &giantloveautoplay=1: type the line into the real chat box and send it. */
function loveAutoplay(engine) {
  if (love.autoDone || typeof engine?.param !== 'function' || engine.param('giantloveautoplay') !== '1' || !engine.started) return;
  const t = Date.now();
  if (!love.autoAt) {
    love.autoAt = t + 2500;
    return;
  }
  if (t < love.autoAt) return;
  love.autoDone = true;
  const form = document.getElementById('local-chat-form');
  const input = document.getElementById('local-chat-input');
  const near = liveShrines(engine)[0];
  const said = engine.param('giantlovesay') || `I love you ${near?.giant === 'ti' ? 'Tii' : near?.giant || 'Mab'}`;
  if (!form || !input) return;
  input.value = said;
  form.requestSubmit();
}

export const shrineHintFeature = {
  id: SHRINE_HINT_FEATURE_ID,

  init(engine) {
    eng = engine;
    if (typeof document !== 'undefined') document.addEventListener('submit', onChatSubmit, true);
  },

  onStreetEnter(street, engine) {
    inside = false;
    const demo = Number(engine.param('shrinehint'));
    if (demo > 0 && !state.announced) {
      for (let i = 0; i < Math.min(demo, SHRINES_TO_PASS - 1); i++) state.passed[`demo-${i}`] = 1;
    }
  },

  onTick(dtMs, now, engine) {
    loveAutoplay(engine);
    const target = shrineTarget(engine);
    const player = engine.player;
    const now_inside = Boolean(target && player) && inEmblemHitbox(target.sprite, player.x, player.y);
    const entered = now_inside && !inside;
    inside = now_inside;
    if (!entered || state.announced) return;
    const giant = GIANTS[target.state?.giantId];
    const text = passShrine(state, `${engine.streetTsid}:${giant?.id || ''}`, giant?.name || 'the Giants', engine.questState);
    engine.setData('shrinesPassed', String(Object.keys(state.passed).length));
    if (text) showVog(engine, text);
  },

  save() {
    return { version: 1, passed: { ...state.passed }, announced: state.announced };
  },

  restore(slice) {
    const passed = slice?.passed && typeof slice.passed === 'object' ? slice.passed : {};
    state = { passed: { ...passed }, announced: Boolean(slice?.announced) };
  },

  /** Tests. */
  _reset() {
    state = { passed: {}, announced: false };
    inside = false;
  },

  /** Tests: the Giant screen state. */
  _love() {
    return { open: love.open, ready: love.ready, queued: love.queued };
  },
};
