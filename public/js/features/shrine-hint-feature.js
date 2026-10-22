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
 */
import { questStatus } from '../quest-offers.js';
import { GIANTS, inEmblemHitbox } from '../shrines.js?v=shrine-walkby-1';
import { vogPages } from '../newxp.js';

export const SHRINE_HINT_FEATURE_ID = 'shrine-hint';
export const SHRINES_TO_PASS = 3;

let state = { passed: {}, announced: false };
let inside = false;
let ui = null;

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
  style.textContent = `.shrine-vog{position:fixed;z-index:61;display:flex;align-items:center;justify-content:center;text-align:center;
  background:rgba(0,0,0,.45);cursor:pointer;color:#fff;font:800 26px/1.25 Nunito,"Trebuchet MS",sans-serif;
  text-shadow:0 2px 4px rgba(0,0,0,.5);padding:20px;box-sizing:border-box;opacity:0;transition:opacity .4s}
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

export const shrineHintFeature = {
  id: SHRINE_HINT_FEATURE_ID,

  onStreetEnter(street, engine) {
    inside = false;
    const demo = Number(engine.param('shrinehint'));
    if (demo > 0 && !state.announced) {
      for (let i = 0; i < Math.min(demo, SHRINES_TO_PASS - 1); i++) state.passed[`demo-${i}`] = 1;
    }
  },

  onTick(dtMs, now, engine) {
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
};
