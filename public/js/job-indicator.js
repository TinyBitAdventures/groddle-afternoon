/**
 * The on-street project bubble (gap 4, research/street-projects-audit-2026-11-11.md): the
 * clickable bubble Glitch drew over a project's giver (the Street Spirit; the fallback Job
 * Board where no spirit stood).
 *
 * Source (tinyspeck glitch-client, CC0):
 * - port/JobManager.as status 100-125: between phases (!is_available, with phases) the bubble
 *   counts down (current_available_time = time_until_available, percent 0); with work done
 *   (perc > 0) it reads "<perc*100 toFixed(1)>%" over "of phase N complete" ("of phase N " only
 *   when the job has more than one phase), flipping with alt_msg "Project available", the fill at
 *   perc; otherwise "Project available". 127-138: it goes when the last phase is complete.
 * - port/JobActionIndicatorView.as onTimerTick 69-90: StringUtil.formatTime(sec, false) over
 *   "until next phase", "Less than 1 min" under a minute, and "Project available" at 0.
 *   jaivClickHandler (JobManager.as 175-181): a click asks for the job only when no countdown runs.
 * - port/ActionIndicatorView.as: draw 126-169 (a white pill, corner radius = its height, padding 7,
 *   the icon at 2 * padding, a 10 px pointer under the middle), drawPerc 171-183 (the fill 0x055c73
 *   at 0.37, inset 2 px), flipNext 113-123 (hold 3 s, fade 0.5 s, main and alt in turn), the
 *   black 2 px drop shadow (StaticFilters.black2px90Degrees_DropShadowA).
 * - TSEngineAssets graphics/quest_bubble_active.png (the teal "!", assets/ui/quest_bubble_active.png).
 * - util/StringUtil.as formatTime 177-225.
 * - glitch-GameServerJS quests/quest.js 1012: perc = floor(got base cost / total base cost * 1000) / 1000.
 *
 * The client's style sheet (quest_bubble_msg, quest_bubble_phase_time, quest_bubble_complete) is
 * lost (research/client-sources/README.md 26-35), so the type sizes and teal shades are read from
 * the GlitchAddict video (research/video/frames/PUzIKuL2tPo t0012, t0030): a bold teal line, the
 * second line smaller and lighter.
 */

export const JOB_INDICATOR_TEXT = Object.freeze({
  available: 'Project available',
  complete: 'complete',
  ofPhase: (n) => `of phase ${n} complete`,
  untilNext: 'until next phase',
  underMinute: 'Less than 1 min',
});

export const JOB_INDICATOR_ICON = 'assets/ui/quest_bubble_active.png';

/** ActionIndicatorView.as 26-30 and the drop shadow. */
export const JOB_INDICATOR_LOOK = Object.freeze({
  padding: 7,
  pointerWidth: 10,
  percentPadding: 2,
  progressColor: 0x055c73,
  progressAlpha: 0.37,
  iconW: 5,
  iconH: 19,
  // Read from the video (the sheet is lost): a bold teal, and a lighter one for the small line.
  textColor: 0x1d7d93,
  subColor: 0x4fa3b6,
});

/** flipNext: hold 3 s, fade 0.5 s, and its second tween's half second; one round of both faces is 8 s. */
export const JOB_INDICATOR_FLIP = Object.freeze({ holdMs: 3000, fadeMs: 500, cycleMs: 8000 });

/**
 * StringUtil.formatTime (StringUtil.as 177-225), its defaults: "5 mins 30 secs", "1 hour 2 mins".
 * With displaySec false the seconds go, as the bubble calls it. Past 8 hours (no seconds) only the
 * hours stay and past a day only the days; the source trims those with substr(0, -1), which our
 * delays (at most 3,600 s) never reach.
 */
export function formatTime(sec, displaySec = true, short = false) {
  sec = Math.trunc(Number(sec) || 0);
  let secTxt = `${sec % 60}${!short ? (sec % 60 === 1 ? ' sec' : ' secs') : ' sec'}`;
  const mins = Math.floor(sec / 60) % 60;
  let minTxt = mins > 0 ? `${mins}${!short ? (mins === 1 ? ' min' : ' mins') : ' min'}` : '';
  const hours = Math.floor(sec / 3600) % 24;
  let hourTxt = hours > 0 ? `${hours}${!short ? (hours === 1 ? ' hour' : ' hours') : ' hr'}` : '';
  const days = Math.floor(sec / 86400);
  let dayTxt = days > 0 ? `${days.toLocaleString('en-US')}${days === 1 ? ' day' : ' days'}` : '';
  if (sec % 60 === 0 || !displaySec) secTxt = '';
  if (minTxt && secTxt) minTxt += ' ';
  if (hourTxt && (minTxt || secTxt)) hourTxt += ' ';
  if (dayTxt && (hourTxt || minTxt || secTxt)) dayTxt += ' ';
  if (hours > 8 && !displaySec) {
    minTxt = secTxt = '';
    hourTxt = hourTxt.trimEnd();
  }
  if (days > 1 && !displaySec) {
    hourTxt = minTxt = secTxt = '';
    dayTxt = dayTxt.trimEnd();
  }
  return dayTxt + hourTxt + minTxt + secTxt;
}

/** quest.js 1012: the phase's done share by base cost, to 3 places, rounded down. */
export function jobPerc(reqs) {
  let total = 0;
  let got = 0;
  for (const r of reqs || []) {
    const bc = Number(r.baseCost) || 0;
    total += (Number(r.need) || 0) * bc;
    got += Math.min(Number(r.got) || 0, Number(r.need) || 0) * bc;
  }
  return total ? Math.floor((got / total) * 1000) / 1000 : 0;
}

/** The countdown's seconds: time_until_available, whole seconds (quest.js 1040). */
export function secondsUntil(until, now = Date.now()) {
  return Math.max(0, Math.ceil(((Number(until) || 0) - now) / 1000));
}

/**
 * What the bubble shows for a giver's headline row ({ status, phase, until } from street-jobs.js
 * jobStatus), the job's phase count and the phase's perc, or null for no bubble:
 * - done / built: gone (JobManager.as 127-138);
 * - cooldown (a street just built, the next build not yet offered): no status at all, as
 *   jobs_get_available skips it (locations/inc_jobs.js 463-467), so no bubble;
 * - delayed: the countdown, not clickable;
 * - otherwise "Project available", or the phase's percent flipping with it.
 * Returns { kind, main: [line] | [big, small], alt, percent, clickable, key }.
 */
export function jobIndicatorView(head, { phases = 1, perc = 0, now = Date.now() } = {}) {
  if (!head) return null;
  const st = head.status;
  if (st === 'done' || st === 'built' || st === 'cooldown') return null;
  const T = JOB_INDICATOR_TEXT;
  let view;
  if (st === 'delayed') {
    const sec = secondsUntil(head.until, now);
    if (sec <= 0) view = { kind: 'available', main: [T.available], alt: '', percent: 0, clickable: true };
    else {
      const left = sec < 60 ? T.underMinute : formatTime(sec, false);
      view = { kind: 'countdown', main: [left, T.untilNext], alt: '', percent: 0, clickable: false };
    }
  } else if (perc > 0) {
    const n = Math.max(1, (Number(head.phase) || 0) + 1);
    view = {
      kind: 'progress',
      main: [`${(perc * 100).toFixed(1)}%`, phases > 1 ? T.ofPhase(n) : T.complete],
      alt: T.available,
      percent: Math.min(1, Math.max(0, perc)),
      clickable: true,
    };
  } else {
    view = { kind: 'available', main: [T.available], alt: '', percent: 0, clickable: true };
  }
  view.key = `${view.kind}|${view.main.join('|')}|${view.alt}|${view.percent}`;
  return view;
}

/** flipNext's faces: the alt face's alpha at a time since the flipping began (0 main, 1 alt). */
export function flipAlpha(ms) {
  const { holdMs, fadeMs, cycleMs } = JOB_INDICATOR_FLIP;
  const t = ((ms % cycleMs) + cycleMs) % cycleMs;
  const half = cycleMs / 2;
  if (t < holdMs) return 0;
  if (t < holdMs + fadeMs) return (t - holdMs) / fadeMs;
  if (t < half + holdMs) return 1;
  if (t < half + holdMs + fadeMs) return 1 - (t - half - holdMs) / fadeMs;
  return 0;
}

/**
 * The bubble as a PIXI container, its pointer's tip at (0, 0): place it over the giver's head.
 * `onClick` runs on a click while the view is clickable; the press is kept from the street below
 * (the canvas's own pointerdown would open whatever stands behind it).
 * Returns { root, update(view, now), destroy() }.
 */
export function createJobIndicator(PIXI, { onClick, textureFor } = {}) {
  const L = JOB_INDICATOR_LOOK;
  const root = new PIXI.Container();
  root.label = 'job-indicator';
  root.zIndex = 38;
  root.eventMode = 'static';
  root.cursor = 'pointer';
  const shadow = new PIXI.Graphics();
  const pill = new PIXI.Graphics();
  const fill = new PIXI.Graphics();
  const fillMask = new PIXI.Graphics();
  fill.mask = fillMask;
  const main = new PIXI.Container();
  const alt = new PIXI.Container();
  root.addChild(shadow, pill, fillMask, fill, main, alt);
  const iconTex = textureFor ? textureFor(JOB_INDICATOR_ICON) : null;
  const icon = (into) => {
    if (!iconTex) return null;
    const s = new PIXI.Sprite(iconTex);
    s.width = L.iconW;
    s.height = L.iconH;
    into.addChild(s);
    return s;
  };
  const font = 'Nunito, "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
  // Fixed line heights: the pill's height must not wait on the web font's metrics.
  const style = (size, color, weight = '800') => ({ fontFamily: font, fontSize: size, fontWeight: weight, fill: color, lineHeight: size + 2 });
  let view = null;
  let flipStart = 0;

  function face(into, lines) {
    into.removeChildren().forEach((c) => c.destroy());
    const ic = icon(into);
    const texts = lines.length > 1
      ? [new PIXI.Text({ text: lines[0], style: style(13, L.textColor) }), new PIXI.Text({ text: lines[1], style: style(10, L.subColor, '700') })]
      : [new PIXI.Text({ text: lines[0], style: style(13, L.textColor) })];
    let h = 0;
    let w = 0;
    for (const t of texts) {
      t.y = h;
      h += t.style.lineHeight;
      w = Math.max(w, t.width);
      into.addChild(t);
    }
    return { ic, texts, w, h };
  }

  function draw(v, now) {
    view = v;
    flipStart = now;
    const a = face(main, v.main);
    const b = v.alt ? face(alt, [v.alt]) : (alt.removeChildren().forEach((c) => c.destroy()), null);
    const iconH = L.iconH;
    const textH = Math.max(a.h, b?.h || 0);
    const h = Math.max(iconH, Math.round(textH)) + L.padding * 2 - 1;
    const textX = L.padding * 2 + L.iconW + L.padding;
    const w = Math.round(Math.max(textX + a.w + L.padding * 2, b ? textX + b.w + L.padding * 2 : 0));
    const top = -(h + L.pointerWidth / 2);
    const left = -w / 2;
    const pillPath = (g, dy) => {
      g.roundRect(left, top + dy, w, h, h / 2);
      g.poly([-L.pointerWidth / 2, top + h + dy - 0.5, 0, top + h + L.pointerWidth / 2 + dy, L.pointerWidth / 2, top + h + dy - 0.5]);
    };
    shadow.clear();
    pillPath(shadow, 2);
    shadow.fill({ color: 0x000000, alpha: 0.35 });
    pill.clear();
    pillPath(pill, 0);
    pill.fill({ color: 0xffffff, alpha: 1 });
    // drawPerc: the fill, masked to the pill's inside (2 px in).
    const ih = h - L.percentPadding * 2;
    const iw = w - L.percentPadding * 2;
    fillMask.clear();
    fillMask.roundRect(left + L.percentPadding, top + L.percentPadding, iw, ih, ih / 2).fill({ color: 0xffffff });
    fill.clear();
    if (v.percent > 0) {
      fill.rect(left + L.percentPadding, top + L.percentPadding, iw * v.percent, ih).fill({ color: L.progressColor, alpha: L.progressAlpha });
    }
    for (const [f, m] of [[main, a], [alt, b]]) {
      if (!m) continue;
      // Centred on the pill, as draw() centres alt_holder; the icon leads the text.
      const fw = L.padding * 2 + L.iconW + L.padding + m.w;
      const fx = f === main ? left : -Math.round((fw + L.padding * 2) / 2);
      if (m.ic) {
        m.ic.x = fx + L.padding * 2;
        m.ic.y = top + Math.round((h - L.iconH) / 2);
      }
      for (const t of m.texts) {
        t.x = fx + textX;
        t.y += top + Math.round((h - m.h) / 2);
      }
    }
    alt.alpha = 0;
    main.alpha = 1;
    root.hitArea = new PIXI.Rectangle(left, top, w, h + L.pointerWidth / 2);
    root.cursor = v.clickable ? 'pointer' : 'default';
  }

  root.on('pointerdown', (e) => {
    // The canvas's own pointerdown (game.js) would pick the tree or rock behind the bubble.
    e.nativeEvent?.stopImmediatePropagation?.();
  });
  root.on('pointertap', () => {
    if (view?.clickable && typeof onClick === 'function') onClick();
  });

  return {
    root,
    update(v, now = Date.now()) {
      if (!v) {
        root.visible = false;
        view = null;
        return;
      }
      root.visible = true;
      if (!view || view.key !== v.key) {
        const flipping = view?.alt && v.alt;
        const keep = flipStart;
        draw(v, now);
        if (flipping) flipStart = keep;
      }
      if (view.alt) {
        const k = flipAlpha(now - flipStart);
        alt.alpha = k;
        main.alpha = 1 - k;
      }
    },
    get view() {
      return view;
    },
    destroy() {
      if (!root.destroyed) root.destroy({ children: true });
    },
  };
}
