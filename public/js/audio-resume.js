/**
 * G1000 (root R25): music and sounds come back after the page was away (AFK, another tab, a phone
 * call, the screen locked). One path brings both back:
 *
 *  - The AudioContext: Chrome and Firefox leave it "suspended" (autoplay, a long background), and
 *    Safari leaves it "interrupted" after a call, Siri or another app's audio, and does not resume
 *    it on its own. Either state is resumed (not "closed"; "running" needs nothing).
 *  - The street music <audio> element: the system pauses it with the interruption and nothing played
 *    it again. A streaming voice that is paused (not stopped, not ended) is played again.
 *  - A voice whose short loop has switched to its decoded buffer (#504) is never played as an
 *    element again: its buffer runs on the context, so resuming the context brings it back, and
 *    playing the element as well would sound the track twice.
 *
 * Tried when the page comes back (visibilitychange to visible, focus, pageshow) and on any gesture
 * (pointerdown, keydown, touchend: an iPhone tap is a gesture when it ends, G918), never while
 * muted (G918: a muted game makes no music element play) or while the page is hidden.
 *
 * #660 (root R25): on an iPad, music the system stopped while the browser was minimized came back
 * faster than it should, more so some times than others. The old element and its MediaElementSource
 * were played again as they were; WebKit can carry them on at the wrong rate after the audio
 * session comes back (not reproduced on Linux WebKit, which has no iOS audio session). So when the
 * page comes back from a background in which its audio stopped (the context left "running", or the
 * element was paused), the music is rebuilt instead: a new element and source node at the same
 * place in the track, once the context runs again (rebuildVoice). Music that played on through the
 * background is left as it is. The Flash client's music never changed speed (SoundMaster played it
 * through Flash's own mixer).
 *
 * #660 (root R25): on Android the music played on after the player left the browser. With
 * hushWhenHidden, the page going hidden (visibilitychange to hidden, pagehide) pauses every sound:
 * the AudioContext is suspended (the music bus, the Vine Radio and street music's buffer loops,
 * musicblocks, cues, effects all stop where they are) and a streaming street music element is
 * paused at its place. hushed() is true until the page shows again, so the game starts no new sound
 * meanwhile (a context would play them all at once on its return). Coming back takes the rebuild
 * path above: the context resumes and the street track is made again at the place it had reached,
 * never played on from the old element. Muted stays muted: the plan does nothing while muted.
 * The Flash client kept playing when the window lost focus: StageBeacon.onDeactivate only throttled
 * the frame rate after a while (power saving mode), and SoundMaster had no focus handling. A Flash
 * plugin in a background tab kept its sound too; a phone browser in the background is another case.
 *
 * #693: so the hush is a setting, "Keep playing sound in the background" (js/background-sound.js):
 * hushWhenHidden may be a function, read each time the page hides. game.js passes the setting
 * turned round: on (the default on a computer) nothing hushes and sound plays on as Glitch's did;
 * off (the default on a phone or tablet) hushes as above. Either way the page coming back takes the
 * rebuild path when its audio stopped while away.
 */

/** Context states a resume() can bring back. */
export const RESUMABLE_CONTEXT = Object.freeze(['suspended', 'interrupted']);

/** Events that try again: the page coming back, and gestures (which browsers require to start audio). */
export const RESUME_EVENTS = Object.freeze({
  doc: Object.freeze(['visibilitychange']),
  win: Object.freeze(['focus', 'pageshow', 'pointerdown', 'keydown', 'touchend']),
});

/** Events that hush the page besides visibilitychange to hidden (a page put away or into the back-forward cache). */
export const HUSH_EVENTS = Object.freeze({ win: Object.freeze(['pagehide']) });

/** Whether an AudioContext in this state should be resumed. */
export const contextNeedsResume = (ctxState) => RESUMABLE_CONTEXT.includes(String(ctxState || ''));

/**
 * What a resume should do, pure. voice: the street music voice ({ el, stopped, looper }) or null.
 * Returns { ctx, el }: resume the context, play the element. back (#660): the page is coming back
 * from a background in which its audio stopped (stopped: the context left "running" while away);
 * then a live voice is rebuilt ({ ctx, el: false, rebuild: true }) rather than played as it was.
 */
export function audioResumePlan({ ctxState = '', muted = false, hidden = false, voice = null, back = false, stopped = false } = {}) {
  if (muted || hidden) return { ctx: false, el: false };
  const ctx = contextNeedsResume(ctxState);
  const live = Boolean(voice && !voice.stopped && voice.el);
  const el = Boolean(live && !voice.looper && voice.el.paused && !voice.el.ended);
  if (back && live && (ctx || el || stopped)) return { ctx, el: false, rebuild: true };
  return { ctx, el };
}

/**
 * What hiding the page pauses, pure (#660): suspend a running context; pause a streaming element
 * that plays (a stopped voice has gone, a handed-over one runs on the context).
 */
export function audioHushPlan({ ctxState = '', voice = null } = {}) {
  const el = Boolean(voice && !voice.stopped && !voice.looper && voice.el && !voice.el.paused && !voice.el.ended);
  return { ctx: String(ctxState || '') === 'running', el };
}

/**
 * Wires the one resume path. getCtx/getVoice/isMuted read the game's live state; rebuildVoice
 * (optional, #660) makes the street music again at the same place; hushWhenHidden (#660) pauses
 * every sound while the page is hidden (a boolean, or a function asked each time the page hides,
 * #693); onResume (optional) hears what was tried. Returns
 * { resume, dispose, hushed }: resume() runs the plan now, hushed() is true while hidden and hushed.
 */
export function createAudioResumer({ getCtx, getVoice, isMuted, rebuildVoice = null, hushWhenHidden = false, doc = globalThis.document, win = globalThis.window, onResume = null } = {}) {
  let busy = false;
  let hushed = false;
  // #693: the setting is read when the page hides, so a change applies from the next time.
  const hushOn = () => Boolean(typeof hushWhenHidden === 'function' ? hushWhenHidden() : hushWhenHidden);
  // The context's suspend() a hush started, until it settles: a quick return waits for it first.
  let suspending = null;
  // #660: the page went to the background (away), and whether its context left "running" there.
  let away = false;
  let awayCtx = null;
  let ctxStopped = false;
  const onCtxState = () => { if (awayCtx && awayCtx.state !== 'running') ctxStopped = true; };
  const watchCtx = (ctx) => {
    if (awayCtx === ctx) return;
    awayCtx?.removeEventListener?.('statechange', onCtxState);
    awayCtx = ctx;
    awayCtx?.addEventListener?.('statechange', onCtxState);
  };
  const settle = () => {
    away = false;
    ctxStopped = false;
    watchCtx(null);
  };
  function hush(ctx, voice) {
    hushed = true;
    const plan = audioHushPlan({ ctxState: ctx?.state, voice });
    if (plan.ctx) {
      try {
        const p = Promise.resolve(ctx.suspend?.()).catch(() => {});
        suspending = p;
        p.then(() => { if (suspending === p) suspending = null; });
      } catch { /* the context stays as it is */ }
    }
    if (plan.el) {
      try { voice.el.pause?.(); } catch { /* */ }
    }
    return plan;
  }
  async function resume(reason = '') {
    const ctx = getCtx?.() || null;
    const voice = getVoice?.() || null;
    // Safari may fire pagehide before (or without) the page reporting itself hidden.
    const hidden = doc?.visibilityState === 'hidden' || reason === 'pagehide';
    if (hidden) {
      if (!away) {
        away = true;
        ctxStopped = Boolean(ctx && ctx.state !== 'running');
      }
      watchCtx(ctx);
      // Before the busy check: a resume still waiting on the context must not keep the page loud.
      if (hushOn()) hush(ctx, voice);
    } else {
      hushed = false;
    }
    if (busy) return null;
    if (!hidden && suspending) {
      // Back before the hush's suspend() settled: resuming now would be undone by it.
      busy = true;
      try { await suspending; } finally { busy = false; suspending = null; }
      return resume(reason);
    }
    const back = Boolean(rebuildVoice) && away;
    const plan = audioResumePlan({ ctxState: ctx?.state, muted: Boolean(isMuted?.()), hidden, voice, back, stopped: ctxStopped });
    if (!plan.ctx && !plan.el && !plan.rebuild) {
      // Back, and the music played on through the background (or there is none): nothing to mend.
      if (!hidden) settle();
      return plan;
    }
    busy = true;
    try {
      if (plan.ctx) {
        try { await ctx.resume(); } catch { /* still interrupted: the next event tries again */ }
      }
      if (plan.rebuild) {
        // Once the context runs again: a new element would otherwise start its clock on a stopped graph.
        if (!ctx || ctx.state === 'running') {
          settle();
          rebuildVoice(voice);
        }
      } else if (plan.el && voice.play) voice.play();
    } finally {
      busy = false;
    }
    onResume?.(reason, plan);
    return plan;
  }
  const handlers = [];
  const on = (target, type) => {
    if (!target?.addEventListener) return;
    const fn = () => { resume(type); };
    target.addEventListener(type, fn, { capture: true });
    handlers.push([target, type, fn]);
  };
  for (const type of RESUME_EVENTS.doc) on(doc, type);
  for (const type of RESUME_EVENTS.win) on(win, type);
  if (hushWhenHidden) for (const type of HUSH_EVENTS.win) on(win, type);
  return {
    resume,
    hushed: () => hushed,
    dispose() {
      watchCtx(null);
      for (const [target, type, fn] of handlers.splice(0)) target.removeEventListener(type, fn, { capture: true });
    },
  };
}
