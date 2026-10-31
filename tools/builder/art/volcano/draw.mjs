/**
 * VOLCANO ZONE ART, drawn in code.
 *
 * Drawn by Claude (Anthropic, model claude-opus-5-5) for Austin Ginder's prompt: "vertical climbing
 * map of a Volcano, various effects like steam and lava squirts, earthquake rumble effect, original
 * artwork". Each piece is an SVG written by the functions below (seeded, so a rebuild draws the
 * same picture), rendered to PNG with rsvg-convert by build.mjs. No image model, no traced or
 * copied art: Tiny Speck's CC0 decos were only looked at for scale and outline weight.
 * Released under CC0 1.0 (public domain dedication).
 *
 * Every piece is 2x art (the file's pixels are its logical size; placements draw it at about half)
 * and anchored bottom-centre, except the particle sprites (centred) and the hanging clouds.
 */

import { rng, smoothClosed, smoothOpen, blobPoints, edge, svgDoc, lin, rad, blur, grain, groundMask, path, BASALT, PUMICE, LAVA } from './lib.mjs';

/** A glowing lava seam: a blurred wide stroke under a thin bright one. */
function seam(r, pts, width = 4, glowId = 'seamGlow') {
  const d = smoothOpen(pts, 0.8);
  return `<g>${path(d, `fill="none" stroke="${LAVA.orange}" stroke-width="${width * 4}" stroke-linecap="round" opacity="0.55" filter="url(#${glowId})"`)}`
    + `${path(d, `fill="none" stroke="${LAVA.red}" stroke-width="${width * 1.6}" stroke-linecap="round" stroke-linejoin="round"`)}`
    + `${path(d, `fill="none" stroke="${LAVA.yellow}" stroke-width="${width * 0.7}" stroke-linecap="round" stroke-linejoin="round"`)}</g>`;
}

/** A crack that wanders down from (x, y) for `len` px. */
function crackPts(r, x, y, len, lean = 0) {
  const pts = [[x, y]];
  let cx = x;
  let cy = y;
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i += 1) {
    cx += (r() * 2 - 1) * (len / n) * 0.7 + lean * (len / n);
    cy += (len / n) * (0.7 + r() * 0.5);
    pts.push([cx, cy]);
  }
  return pts;
}

/**
 * A ledge topper: a flat walkable top `top` px under the file's top, a lighter cap, and a hanging
 * underside of rock that drips to the file's bottom. kind: 'basalt' or 'pumice'.
 */
function ledge({ name, w, h, seed, kind, seams = 2 }) {
  const r = rng(seed);
  const P = kind === 'pumice' ? PUMICE : BASALT;
  const top = 14;
  const capDepth = Math.round(h * (kind === 'pumice' ? 0.34 : 0.3));
  const inset = Math.round(w * 0.025);
  // Top edge: almost flat (it is walked on), rounded ends.
  // A dome of a few px (invisible on a straight platform line) so the top is not one hard flat row.
  const topPts = edge(r, inset + 22, w - inset - 22, top, 40, 1.5).map(([x, y]) => [x, y + 5 * ((2 * x) / w - 1) ** 2]);
  const pts = [[inset, top + 30], [inset + 5, top + 9], ...topPts, [w - inset - 5, top + 9], [w - inset, top + 30]];
  // Underside, right to left: rounded lumps of rock hanging down, the deepest reaching the bottom.
  const base = top + capDepth;
  const span = w - 2 * inset - 10;
  const lumps = Math.max(3, Math.round(w / 150));
  const deepest = Math.floor(lumps * (0.3 + r() * 0.4));
  const under = [];
  for (let i = 0; i < lumps; i += 1) {
    const x1 = w - inset - 5 - (span * i) / lumps;
    const x0 = w - inset - 5 - (span * (i + 1)) / lumps;
    const mid = (x0 + x1) / 2 + (r() * 2 - 1) * (x1 - x0) * 0.12;
    const fade = Math.min(1, (Math.min(i, lumps - 1 - i) + 0.6) / 1.4);
    const depth = i === deepest ? h - 1 - base : (h - base) * fade * (0.45 + r() * 0.35);
    under.push([x1 - (x1 - x0) * 0.04, base + depth * 0.16]);
    under.push([mid + (x1 - x0) * 0.3, base + depth * 0.6]);
    under.push([mid + (x1 - x0) * 0.14, base + depth * 0.95]);
    under.push([mid - (x1 - x0) * 0.14, base + depth * 0.93]);
    under.push([mid - (x1 - x0) * 0.32, base + depth * 0.55]);
  }
  const body = smoothClosed([...pts, ...under], 1);
  // The cap: a light top face and a darker front face under it, down to a wobbly line.
  const faceLine = edge(r, w - inset - 2, inset + 2, top + capDepth * 0.42, 45, capDepth * 0.08);
  const topFace = smoothClosed([...pts.slice(0, -1), [w - inset - 1, top + capDepth * 0.42], ...faceLine.slice(1, -1), [inset + 1, top + capDepth * 0.42]], 0.9);
  const capLow = edge(r, w - inset - 4, inset + 4, base, 50, capDepth * 0.16);
  const cap = smoothClosed([...pts, ...capLow], 0.9);
  const hi = smoothOpen(edge(r, inset + 30, w - inset - 30, top + 6, 60, 1.2), 1);
  let marks = '';
  if (kind === 'pumice') {
    for (let i = 0; i < Math.round(w / 12); i += 1) {
      const x = inset + 20 + r() * (w - 2 * inset - 40);
      const y = top + 10 + r() * (capDepth - 16);
      const rx = 2.5 + r() * 8;
      marks += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${(rx * (0.45 + r() * 0.25)).toFixed(1)}" fill="${P.hole}" opacity="${(0.5 + r() * 0.35).toFixed(2)}"/>`;
      marks += `<ellipse cx="${(x + rx * 0.2).toFixed(1)}" cy="${(y + rx * 0.3).toFixed(1)}" rx="${(rx * 0.7).toFixed(1)}" ry="${(rx * 0.22).toFixed(1)}" fill="${P.light}" opacity="0.5"/>`;
    }
  } else {
    for (let i = 0; i < Math.round(w / 34); i += 1) {
      const x = inset + 24 + r() * (w - 2 * inset - 48);
      const y = top + capDepth * 0.5 + r() * capDepth * 0.4;
      marks += path(smoothClosed(blobPoints(r, x, y, 8 + r() * 16, 4 + r() * 6, 6, 0.3), 1), `fill="${r() < 0.5 ? P.deep : P.light}" opacity="0.45"`);
    }
  }
  // Under the cap: each lump lit on its left, shaded on its right, with a soft shadow under the cap.
  let bands = path(smoothOpen(capLow.slice().reverse(), 1), `fill="none" stroke="#000000" stroke-width="16" opacity="0.28" filter="url(#soft4)"`);
  for (let i = 0; i < under.length; i += 5) {
    const tip = under[i + 2];
    const left = under[i + 4];
    bands += path(smoothOpen([[left[0] + 6, base + 6], [left[0] + 4, left[1]], [tip[0] - 4, tip[1] - 14]], 1), `fill="none" stroke="${BASALT.rim}" stroke-width="14" opacity="0.3" stroke-linecap="round" filter="url(#soft4)"`);
    bands += path(smoothOpen([[under[i][0] - 8, base + 8], [under[i + 1][0] - 8, under[i + 1][1]], [tip[0] + 6, tip[1] - 16]], 1), `fill="none" stroke="#000000" stroke-width="18" opacity="0.25" stroke-linecap="round" filter="url(#soft4)"`);
  }
  let lava = '';
  for (let i = 0; i < seams; i += 1) {
    const tip = under[5 * Math.floor(r() * lumps) + 2];
    lava += seam(r, crackPts(r, tip[0] + (r() * 2 - 1) * 12, base + 6, Math.max(20, (tip[1] - base) * 0.8)), 3.4);
  }
  const defs = [
    lin('body', [[0, P === PUMICE ? '#6b5444' : BASALT.mid], [0.4, BASALT.base], [1, BASALT.deep]]),
    lin('cap', [[0, P.mid], [1, P.base]]),
    lin('topFace', [[0, P.light], [1, P.mid]]),
    blur('seamGlow', 5),
    blur('soft', 2),
    blur('soft4', 5),
    grain('grain', 0.035, seed % 97, 0.16),
    `<clipPath id="clip">${path(body)}</clipPath>`,
  ].join('\n');
  const svg = svgDoc(w, h, defs, `<g filter="url(#grain)">
${path(body, `fill="url(#body)"`)}
<g clip-path="url(#clip)">${bands}${lava}
${path(cap, `fill="url(#cap)"`)}${path(topFace, `fill="url(#topFace)"`)}${marks}
${path(hi, `fill="none" stroke="${P === PUMICE ? '#ecdcba' : BASALT.rim}" stroke-width="5" stroke-linecap="round" opacity="0.8" filter="url(#soft)"`)}
${path(smoothOpen(capLow.slice().reverse(), 0.9), `fill="none" stroke="${BASALT.outline}" stroke-width="3" opacity="0.7"`)}</g>
${path(body, `fill="none" stroke="${BASALT.outline}" stroke-width="4" stroke-linejoin="round"`)}
</g>`);
  return { name, w, h, svg, top };
}

/** A ground strip with rounded ends, to lay end to end (overlapping) along a floor. */
function groundStrip({ name, w, h, seed }) {
  const r = rng(seed);
  const top = 16;
  const topPts = edge(r, 40, w - 40, top, 60, 2).map(([x, y]) => [x, y + 5 * ((2 * x) / w - 1) ** 2]);
  const pts = [[70, h], [26, h - 44], [6, top + 70], [20, top + 12], ...topPts, [w - 20, top + 12], [w - 6, top + 70], [w - 26, h - 44], [w - 70, h]];
  const body = smoothClosed(pts, 0.7);
  let strata = '';
  for (let i = 0; i < 4; i += 1) {
    const y = top + 40 + i * ((h - top - 40) / 4);
    strata += path(smoothOpen(edge(r, 10, w - 10, y, 80, 6), 1), `fill="none" stroke="${i % 2 ? BASALT.deep : BASALT.mid}" stroke-width="${8 - i}" opacity="0.5" stroke-linecap="round"`);
  }
  let pebbles = '';
  for (let i = 0; i < Math.round(w / 30); i += 1) {
    const x = 20 + r() * (w - 40);
    const y = top + 50 + r() * (h - top - 70);
    const rr = 4 + r() * 10;
    pebbles += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rr.toFixed(1)}" ry="${(rr * 0.6).toFixed(1)}" fill="${r() < 0.5 ? BASALT.light : BASALT.deep}" opacity="0.5"/>`;
  }
  const cap = smoothClosed([[4, top + 40], [14, top + 10], ...topPts, [w - 14, top + 10], [w - 4, top + 40], ...edge(r, w - 8, 8, top + 38, 60, 6)], 0.8);
  const lava = seam(r, crackPts(r, w * (0.3 + r() * 0.4), top + 44, h * 0.5, 0.2), 2.6);
  const defs = [
    lin('body', [[0, BASALT.mid], [1, BASALT.base]]),
    lin('cap', [[0, BASALT.rim], [1, BASALT.light]]),
    blur('seamGlow', 5),
    grain('grain', 0.03, seed % 97, 0.16),
    groundMask('gm', r, w, h, 16),
    `<clipPath id="clip">${path(body)}</clipPath>`,
  ].join('\n');
  return { name, w, h, top, svg: svgDoc(w, h, defs, `<g mask="url(#gm)"><g filter="url(#grain)">${path(body, 'fill="url(#body)"')}<g clip-path="url(#clip)">${strata}${pebbles}${lava}${path(cap, 'fill="url(#cap)"')}${path(smoothOpen(topPts, 1), `fill="none" stroke="${BASALT.rim}" stroke-width="4" opacity="0.7"`)}</g>${path(body, `fill="none" stroke="${BASALT.outline}" stroke-width="4"`)}</g></g>`) };
}

/** A lava pool sunk in a crusted rim, flat, for a floor. */
function lavaPool({ name, w, h, seed }) {
  const r = rng(seed);
  const cy = h * 0.52;
  const rim = smoothClosed(blobPoints(r, w / 2, cy, w / 2 - 6, h / 2 - 4, 16, 0.05, h - 1), 1);
  const lake = smoothClosed(blobPoints(r, w / 2, cy - 4, w / 2 - 44, h / 2 - 26, 14, 0.06), 1);
  let swirls = '';
  for (let i = 0; i < 7; i += 1) {
    const x = w * 0.2 + r() * w * 0.6;
    const y = cy - h * 0.18 + r() * h * 0.3;
    swirls += path(smoothOpen([[x - 60, y], [x - 20, y - 6 + r() * 12], [x + 30, y - 4 + r() * 8], [x + 70, y + 2]], 1), `fill="none" stroke="${r() < 0.5 ? LAVA.yellow : LAVA.white}" stroke-width="${(3 + r() * 4).toFixed(1)}" stroke-linecap="round" opacity="0.7"`);
  }
  let crust = '';
  for (let i = 0; i < 5; i += 1) {
    const x = w * 0.15 + r() * w * 0.7;
    const y = cy - h * 0.12 + r() * h * 0.22;
    crust += path(smoothClosed(blobPoints(r, x, y, 18 + r() * 26, 6 + r() * 6, 8, 0.3), 1), `fill="${LAVA.crust}" opacity="0.85" stroke="${LAVA.deep}" stroke-width="2"`);
  }
  let rocks = '';
  for (let i = 0; i < 16; i += 1) {
    const t = (i / 16) * Math.PI * 2;
    const x = w / 2 + Math.cos(t) * (w / 2 - 26);
    const y = Math.min(h - 14, cy + Math.sin(t) * (h / 2 - 16));
    rocks += path(smoothClosed(blobPoints(r, x, y, 18 + r() * 14, 10 + r() * 6, 7, 0.25), 1), `fill="${r() < 0.5 ? BASALT.mid : BASALT.base}" stroke="${BASALT.outline}" stroke-width="3"`);
  }
  const defs = [
    rad('lava', [[0, LAVA.white], [0.35, LAVA.yellow], [0.7, LAVA.orange], [1, LAVA.red]], 0.5, 0.45, 0.6),
    lin('rimFill', [[0, BASALT.mid], [1, BASALT.deep]]),
    blur('glow', 10),
    grain('grain', 0.04, seed % 97, 0.12),
  ].join('\n');
  return { name, w, h, svg: svgDoc(w, h, defs, `<g filter="url(#grain)">${path(rim, `fill="url(#rimFill)" stroke="${BASALT.outline}" stroke-width="4"`)}${path(lake, `fill="${LAVA.orange}" filter="url(#glow)" opacity="0.9"`)}${path(lake, 'fill="url(#lava)"')}${swirls}${crust}${rocks}</g>`) };
}

/** A lava fall hanging from a lip of rock, splashing into a pool at the bottom. */
function lavaFall({ name, w, h, seed }) {
  const r = rng(seed);
  const cx = w / 2;
  const lipH = 110;
  const fallTop = lipH - 30;
  const poolTop = h - 120;
  const left = [];
  const right = [];
  for (let i = 0; i <= 10; i += 1) {
    const y = fallTop + ((poolTop + 30 - fallTop) * i) / 10;
    const half = 52 - i * 2.2 + (r() * 2 - 1) * 4;
    left.push([cx - half + Math.sin(i * 0.9) * 6, y]);
    right.unshift([cx + half + Math.sin(i * 0.9 + 1) * 6, y]);
  }
  const stream = smoothClosed([...left, ...right], 0.8);
  let streaks = '';
  for (let i = 0; i < 7; i += 1) {
    const x = cx - 34 + i * 11;
    const pts = [];
    for (let k = 0; k <= 8; k += 1) pts.push([x + Math.sin(k * 0.8 + i) * 4, fallTop + 20 + ((poolTop - fallTop - 20) * k) / 8]);
    streaks += path(smoothOpen(pts, 1), `fill="none" stroke="${i % 3 === 0 ? LAVA.white : LAVA.yellow}" stroke-width="${i % 3 === 0 ? 4 : 2.5}" stroke-linecap="round" opacity="0.65"`);
  }
  const lip = smoothClosed([[cx - 160, lipH + 20], [cx - 186, 60], [cx - 150, 16], [cx - 70, 4], [cx + 20, 10], [cx + 110, 2], [cx + 176, 30], [cx + 190, 74], [cx + 150, lipH + 26], [cx + 90, lipH + 4], [cx + 56, lipH - 8], [cx - 56, lipH - 8], [cx - 100, lipH + 8]], 0.9);
  const lipLight = smoothClosed([[cx - 170, 54], [cx - 140, 20], [cx - 60, 10], [cx + 30, 16], [cx + 120, 8], [cx + 170, 36], [cx + 120, 46], [cx, 40], [cx - 120, 50]], 0.9);
  const sheet = smoothClosed([[cx - 58, lipH - 6], [cx - 64, 40], [cx - 30, 22], [cx + 34, 24], [cx + 66, 42], [cx + 58, lipH - 6]], 0.9);
  const pool = smoothClosed(blobPoints(r, cx, h - 46, 150, 42, 12, 0.08, h - 1), 1);
  let spray = '';
  for (let i = 0; i < 9; i += 1) {
    const x = cx + (r() * 2 - 1) * 120;
    const y = poolTop - 10 + r() * 50;
    const rr = 5 + r() * 9;
    spray += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}" fill="url(#blob)"/>`;
  }
  const defs = [
    lin('fall', [[0, LAVA.red], [0.3, LAVA.orange], [0.5, LAVA.yellow], [0.7, LAVA.orange], [1, LAVA.red]], 0, 0, 1, 0),
    rad('pool', [[0, LAVA.white], [0.4, LAVA.yellow], [0.8, LAVA.orange], [1, LAVA.red]]),
    rad('blob', [[0, LAVA.white], [0.5, LAVA.yellow], [1, LAVA.orange]]),
    lin('rock', [[0, BASALT.light], [0.4, BASALT.mid], [1, BASALT.deep]]),
    blur('glow', 16),
    grain('grain', 0.04, seed % 97, 0.12),
  ].join('\n');
  return { name, w, h, svg: svgDoc(w, h, defs, `${path(stream, `fill="${LAVA.orange}" opacity="0.55" filter="url(#glow)"`)}${path(pool, `fill="${LAVA.orange}" opacity="0.6" filter="url(#glow)"`)}
${path(stream, `fill="url(#fall)" stroke="${LAVA.deep}" stroke-width="3"`)}${streaks}
${path(pool, `fill="url(#pool)" stroke="${LAVA.deep}" stroke-width="4"`)}${spray}
<g filter="url(#grain)">${path(lip, `fill="url(#rock)"`)}${path(lipLight, `fill="${BASALT.rim}" opacity="0.4"`)}${path(lip, `fill="none" stroke="${BASALT.outline}" stroke-width="4"`)}</g>
${path(sheet, `fill="${LAVA.orange}" opacity="0.6" filter="url(#glow)"`)}${path(sheet, `fill="url(#fall)" stroke="${LAVA.deep}" stroke-width="3"`)}`) };
}

/** A squat rock cone with a mouth on top: kind 'steam' (dark, damp mouth) or 'lava' (glowing). */
function vent({ name, w, h, seed, kind }) {
  const r = rng(seed);
  const cx = w / 2;
  const mouthY = h * 0.3;
  const mouthW = w * 0.2;
  const cone = smoothClosed([
    [6, h - 1], [w * 0.12, h * 0.78], [w * 0.22, h * 0.55], [cx - mouthW - 10, mouthY + 14], [cx - mouthW, mouthY - 4],
    [cx - mouthW * 0.4, mouthY - 10], [cx + mouthW * 0.4, mouthY - 12], [cx + mouthW, mouthY - 2], [cx + mouthW + 12, mouthY + 16],
    [w * 0.8, h * 0.58], [w * 0.9, h * 0.8], [w - 6, h - 1],
  ], 0.8);
  const mouth = `<ellipse cx="${cx}" cy="${mouthY + 2}" rx="${mouthW * 0.82}" ry="${mouthW * 0.26}" fill="${kind === 'lava' ? 'url(#mouthLava)' : 'url(#mouthSteam)'}" stroke="${BASALT.outline}" stroke-width="3"/>`;
  let ribs = '';
  for (let i = 0; i < 5; i += 1) {
    const x0 = cx + (i - 2) * mouthW * 0.55;
    ribs += path(smoothOpen([[x0, mouthY + 14], [x0 + (i - 2) * 18, h * 0.6], [x0 + (i - 2) * 34, h - 8]], 1), `fill="none" stroke="${i % 2 ? BASALT.deep : BASALT.light}" stroke-width="${i % 2 ? 9 : 6}" opacity="0.45" stroke-linecap="round"`);
  }
  let extra = '';
  if (kind === 'lava') {
    for (let i = 0; i < 2; i += 1) {
      const s = i ? 1 : -1;
      extra += seam(r, [[cx + s * mouthW * 0.5, mouthY + 6], [cx + s * mouthW * 0.75, mouthY + 40], [cx + s * mouthW * 0.95, mouthY + 80 + r() * 30]], 5);
    }
    extra += seam(r, crackPts(r, w * 0.3, h * 0.62, h * 0.3, -0.2), 2.5);
  } else {
    extra += path(smoothOpen(crackPts(r, w * 0.32, h * 0.55, h * 0.4, -0.2), 1), `fill="none" stroke="${BASALT.outline}" stroke-width="4" stroke-linecap="round"`);
    extra += path(smoothOpen(crackPts(r, w * 0.66, h * 0.5, h * 0.45, 0.2), 1), `fill="none" stroke="${BASALT.outline}" stroke-width="3" stroke-linecap="round"`);
    // Damp mineral crust round the mouth (sulphur yellow and pale grey).
    for (let i = 0; i < 10; i += 1) {
      const t = (i / 10) * Math.PI * 2;
      extra += `<ellipse cx="${(cx + Math.cos(t) * mouthW * 0.95).toFixed(1)}" cy="${(mouthY + 4 + Math.sin(t) * mouthW * 0.32).toFixed(1)}" rx="${(6 + r() * 8).toFixed(1)}" ry="${(3 + r() * 3).toFixed(1)}" fill="${r() < 0.5 ? '#d9c25a' : '#b8aa98'}" opacity="0.75"/>`;
    }
  }
  let pebbles = '';
  for (let i = 0; i < 6; i += 1) {
    const x = (i < 3 ? 10 + r() * w * 0.18 : w * 0.82 + r() * (w * 0.18 - 10));
    const rr = 8 + r() * 12;
    pebbles += path(smoothClosed(blobPoints(r, x, h - rr * 0.6, rr, rr * 0.6, 7, 0.2, h - 1), 1), `fill="${BASALT.mid}" stroke="${BASALT.outline}" stroke-width="3"`);
  }
  const defs = [
    lin('cone', [[0, BASALT.light], [0.25, BASALT.mid], [0.7, BASALT.base], [1, BASALT.deep]]),
    lin('side', [[0, '#ffffff', 0.10], [0.45, '#ffffff', 0], [0.75, '#000000', 0], [1, '#000000', 0.25]], 0, 0, 1, 0),
    rad('mouthLava', [[0, LAVA.white], [0.35, LAVA.yellow], [0.7, LAVA.orange], [1, LAVA.deep]]),
    rad('mouthSteam', [[0, '#5a4a4a'], [0.6, '#2a1c1e'], [1, '#160e10']]),
    rad('halo', [[0, LAVA.orange, 0.7], [1, LAVA.orange, 0]]),
    blur('seamGlow', 5),
    grain('grain', 0.04, seed % 97, 0.16),
    groundMask('gm', r, w, h, 12),
    `<clipPath id="clip">${path(cone)}</clipPath>`,
  ].join('\n');
  const halo = kind === 'lava' ? `<ellipse cx="${cx}" cy="${mouthY}" rx="${mouthW * 1.6}" ry="${mouthW * 1.1}" fill="url(#halo)"/>` : '';
  return { name, w, h, svg: svgDoc(w, h, defs, `${halo}<g mask="url(#gm)"><g filter="url(#grain)">${path(cone, 'fill="url(#cone)"')}<g clip-path="url(#clip)">${ribs}${path(cone, 'fill="url(#side)"')}${extra}</g>${path(cone, `fill="none" stroke="${BASALT.outline}" stroke-width="4"`)}${mouth}${pebbles}</g></g>`) };
}

/** A cooled-lava boulder: a rounded lump with ropey folds; `hot` adds glowing cracks. */
function boulder({ name, w, h, seed, hot = false }) {
  const r = rng(seed);
  const pts = blobPoints(r, w / 2, h * 0.55, w / 2 - 8, h * 0.5 - 6, 11, 0.12, h - 1);
  const body = smoothClosed(pts, 1);
  let folds = '';
  for (let i = 0; i < 6; i += 1) {
    const y = h * 0.25 + i * h * 0.11;
    const x0 = w * 0.15 + r() * w * 0.1;
    folds += path(smoothOpen([[x0, y], [w * 0.35, y - 10 + r() * 8], [w * 0.6, y + 6 + r() * 6], [w * 0.88 - r() * w * 0.08, y - 4]], 1), `fill="none" stroke="${i % 2 ? BASALT.deep : BASALT.light}" stroke-width="${i % 2 ? 8 : 5}" opacity="0.4" stroke-linecap="round"`);
  }
  const lit = smoothClosed(blobPoints(r, w * 0.38, h * 0.32, w * 0.24, h * 0.14, 8, 0.2), 1);
  let cracks = '';
  if (hot) for (let i = 0; i < 3; i += 1) cracks += seam(r, crackPts(r, w * (0.25 + i * 0.25), h * 0.3, h * 0.55, (r() * 2 - 1) * 0.3), 3);
  const defs = [
    rad('fill', [[0, BASALT.light], [0.45, BASALT.mid], [0.85, BASALT.base], [1, BASALT.deep]], 0.38, 0.3, 0.75),
    blur('soft', 10),
    blur('seamGlow', 5),
    grain('grain', 0.045, seed % 97, 0.16),
    `<clipPath id="clip">${path(body)}</clipPath>`,
  ].join('\n');
  return { name, w, h, svg: svgDoc(w, h, defs, `<g filter="url(#grain)">${path(body, 'fill="url(#fill)"')}<g clip-path="url(#clip)">${folds}${path(lit, `fill="${BASALT.rim}" opacity="0.35" filter="url(#soft)"`)}${cracks}</g>${path(body, `fill="none" stroke="${BASALT.outline}" stroke-width="4"`)}</g>`) };
}

/** A cluster of six-sided basalt columns of different heights. */
function columns({ name, w, h, seed, role = 'middleground' }) {
  const r = rng(seed);
  const n = 6;
  const cw = (w - 20) / (n - 0.5);
  let cols = [];
  for (let i = 0; i < n; i += 1) {
    const x = 10 + i * cw * 0.92 + r() * 8;
    const centre = 1 - Math.abs(i - (n - 1) / 2) / n;
    const topY = h * (0.08 + (1 - centre) * 0.5 + r() * 0.18);
    cols.push({ x, topY, cw: cw * (0.95 + r() * 0.1), lean: (i < n / 2 ? 1 : -1) * (6 + r() * 10) });
  }
  cols = cols.sort((a, b) => a.topY - b.topY);
  let out = '';
  for (const c of cols) {
    const cap = c.cw * 0.22;
    const a = c.x;
    const b = c.x + c.cw;
    const m = c.x + c.cw * 0.42;
    const faceL = `M${a},${c.topY + cap * 0.5} L${m},${c.topY + cap} L${m},${h} L${a},${h} Z`;
    const faceR = `M${m},${c.topY + cap} L${b},${c.topY + cap * 0.5} L${b},${h} L${m},${h} Z`;
    const topF = `M${a},${c.topY + cap * 0.5} L${a + c.cw * 0.22},${c.topY} L${b - c.cw * 0.2},${c.topY - 2} L${b},${c.topY + cap * 0.5} L${m},${c.topY + cap} Z`;
    let joints = '';
    for (let y = c.topY + 80 + r() * 60; y < h - 30; y += 90 + r() * 90) joints += `<path d="M${a},${y.toFixed(1)} L${m},${(y + 8).toFixed(1)} L${b},${(y - 2).toFixed(1)}" fill="none" stroke="${BASALT.outline}" stroke-width="3" opacity="0.7"/>`;
    const skew = (Math.atan(c.lean / Math.max(1, h - c.topY)) * 180) / Math.PI;
    out += `<g transform="translate(0 ${h}) skewX(${skew.toFixed(2)}) translate(0 ${-h})">${path(faceL, 'fill="url(#faceL)"')}${path(faceR, 'fill="url(#faceR)"')}${path(topF, `fill="url(#topF)"`)}${joints}`
      + `<path d="M${a},${h} L${a},${c.topY + cap * 0.5} L${a + c.cw * 0.22},${c.topY} L${b - c.cw * 0.2},${c.topY - 2} L${b},${c.topY + cap * 0.5} L${b},${h}" fill="none" stroke="${BASALT.outline}" stroke-width="4" stroke-linejoin="round"/>`
      + `<path d="M${a},${c.topY + cap * 0.5} L${m},${c.topY + cap} L${b},${c.topY + cap * 0.5} M${m},${c.topY + cap} L${m},${h}" fill="none" stroke="${BASALT.outline}" stroke-width="2.5" opacity="0.8"/></g>`;
  }
  const defs = [
    lin('faceL', [[0, BASALT.light], [1, BASALT.mid]]),
    lin('faceR', [[0, BASALT.base], [1, BASALT.deep]]),
    lin('topF', [[0, BASALT.rim], [1, BASALT.light]]),
    grain('grain', 0.035, seed % 97, 0.14),
    groundMask('gm', r, w, h, 34),
  ].join('\n');
  return { name, w, h, svg: svgDoc(w, h, defs, `<g mask="url(#gm)"><g filter="url(#grain)">${out}</g></g>`) };
}

/** A basalt ridge for a bg layer: tiles side by side (both ends meet the file's sides at one height). */
function ridge({ name, w, h, seed }) {
  const r = rng(seed);
  const endY = h * 0.42;
  const peaks = [];
  const n = 7;
  for (let i = 0; i <= n; i += 1) {
    const x = (w * i) / n;
    const y = i === 0 || i === n ? endY : h * (0.08 + r() * 0.4);
    if (i > 0 && i < n) peaks.push([x - w / n / 7, y + h * 0.05]);
    peaks.push([x, y]);
    if (i > 0 && i < n) peaks.push([x + w / n / 7, y + h * 0.06]);
    if (i < n) peaks.push([x + w / n / 2, h * (0.3 + r() * 0.25)]);
  }
  const body = `${smoothOpen(peaks, 1)} L${w},${h} L0,${h} Z`;
  let facets = '';
  for (let i = 1; i < peaks.length - 1; i += 1) {
    const [px, py] = peaks[i];
    if (!(py < peaks[i - 1][1] && py < peaks[i + 1][1])) continue;
    facets += path(`M${px},${py} L${px + 40 + r() * 80},${h} L${px + 160 + r() * 120},${h} Z`, `fill="${BASALT.deep}" opacity="0.4"`);
    facets += path(`M${px},${py} L${px - 60 - r() * 60},${py + 140} L${px - 10},${py + 260} Z`, `fill="${BASALT.light}" opacity="0.25"`);
  }
  let seams = '';
  for (let i = 0; i < 5; i += 1) seams += seam(r, crackPts(r, w * (0.1 + i * 0.2), h * (0.3 + r() * 0.1), h * 0.55, 0), 3.5);
  const defs = [
    lin('body', [[0, '#625548'], [0.5, '#463c32'], [1, '#302821']]),
    blur('seamGlow', 6),
    grain('grain', 0.012, seed % 97, 0.12),
    `<clipPath id="clip"><path d="${body}"/></clipPath>`,
  ].join('\n');
  return { name, w, h, svg: svgDoc(w, h, defs, `<g filter="url(#grain)"><path d="${body}" fill="url(#body)"/><g clip-path="url(#clip)">${facets}${seams}</g><path d="${smoothOpen(peaks, 1)}" fill="none" stroke="#22190f" stroke-width="5"/></g>`) };
}

/** The crater's rim for the top street: a far wall lit from below, the glowing lake, the near lip you stand on. */
function craterRim({ name, w, h, seed }) {
  const r = rng(seed);
  const lipTop = Math.round(h * 0.7);
  // The far rim: high at both ends, lumpy along the middle; the wall runs down behind the lip.
  const farTop = [[0, h * 0.06], [w * 0.06, h * 0.08], ...edge(r, w * 0.14, w * 0.86, h * 0.22, 110, h * 0.05), [w * 0.94, h * 0.07], [w, h * 0.05]];
  const back = smoothClosed([...farTop, [w, h * 0.85], [0, h * 0.85]], 0.8);
  let wallBands = '';
  for (let i = 0; i < 7; i += 1) {
    const y = h * (0.26 + i * 0.065);
    wallBands += path(smoothOpen(edge(r, 0, w, y, 130, 18), 1), `fill="none" stroke="${i % 2 ? BASALT.deep : BASALT.light}" stroke-width="${18 - i * 2}" opacity="${i % 2 ? 0.45 : 0.25}" stroke-linecap="round"`);
  }
  let wallSeams = '';
  for (let i = 0; i < 7; i += 1) wallSeams += seam(r, crackPts(r, w * (0.08 + i * 0.14) + (r() * 2 - 1) * 60, h * (0.2 + r() * 0.08), h * (0.25 + r() * 0.15), 0), 3.5);
  // The lake: an irregular glowing pool with dark crust plates, its near side hidden by the lip.
  const lake = smoothClosed(blobPoints(r, w / 2, h * 0.66, w * 0.43, h * 0.1, 18, 0.06), 1);
  let plates = '';
  for (let i = 0; i < 16; i += 1) {
    const x = w * 0.12 + r() * w * 0.76;
    const y = h * (0.6 + r() * 0.08);
    plates += path(smoothClosed(blobPoints(r, x, y, 30 + r() * 60, 8 + r() * 10, 7, 0.3), 1), `fill="${LAVA.crust}" opacity="0.8" stroke="${LAVA.red}" stroke-width="3"`);
  }
  // The near lip: flat across the middle (walked on), rising into rock lumps at both ends.
  const nearTop = edge(r, w * 0.12, w * 0.88, lipTop, 70, 2.5);
  const near = smoothClosed([[0, h], [0, h * 0.5], [w * 0.04, h * 0.44], [w * 0.09, h * 0.52], [w * 0.11, lipTop - 14], ...nearTop, [w * 0.89, lipTop - 14], [w * 0.91, h * 0.5], [w * 0.96, h * 0.42], [w, h * 0.48], [w, h]], 0.8);
  const nearFace = edge(r, w, 0, lipTop + 70, 80, 14);
  const topFace = smoothClosed([[0, h * 0.5], [w * 0.04, h * 0.44], [w * 0.09, h * 0.52], [w * 0.11, lipTop - 14], ...nearTop, [w * 0.89, lipTop - 14], [w * 0.91, h * 0.5], [w * 0.96, h * 0.42], [w, h * 0.48], ...nearFace], 0.8);
  let lipMarks = '';
  for (let i = 0; i < 46; i += 1) lipMarks += path(smoothClosed(blobPoints(r, 30 + r() * (w - 60), lipTop + 90 + r() * (h - lipTop - 110), 10 + r() * 26, 5 + r() * 9, 6, 0.3), 1), `fill="${r() < 0.5 ? BASALT.deep : BASALT.light}" opacity="0.45"`);
  for (let i = 0; i < 4; i += 1) lipMarks += seam(r, crackPts(r, w * (0.15 + i * 0.23), lipTop + 80, (h - lipTop) * 0.55, 0.1), 3);
  let wisps = '';
  for (let i = 0; i < 8; i += 1) wisps += `<ellipse cx="${(w * 0.15 + r() * w * 0.7).toFixed(1)}" cy="${(h * (0.38 + r() * 0.18)).toFixed(1)}" rx="${(80 + r() * 160).toFixed(1)}" ry="${(30 + r() * 40).toFixed(1)}" fill="#f2c890" opacity="${(0.12 + r() * 0.12).toFixed(2)}"/>`;
  const defs = [
    lin('back', [[0, '#7a6448'], [0.3, BASALT.mid], [0.6, BASALT.base], [0.85, '#8a4420']]),
    rad('lake', [[0, LAVA.white], [0.3, LAVA.yellow], [0.7, LAVA.orange], [1, LAVA.red]]),
    rad('lakeGlow', [[0, LAVA.orange, 0.8], [0.6, LAVA.red, 0.3], [1, LAVA.red, 0]]),
    lin('near', [[0, BASALT.mid], [0.5, BASALT.base], [1, BASALT.deep]]),
    lin('nearTop', [[0, BASALT.rim], [0.5, BASALT.light], [1, BASALT.mid]]),
    blur('seamGlow', 5),
    blur('soft', 6),
    blur('wisp', 26),
    grain('grain', 0.025, seed % 97, 0.15),
    groundMask('gm', r, w, h, 24, 0.04),
    `<clipPath id="clipB">${path(back)}</clipPath><clipPath id="clipN">${path(near)}</clipPath>`,
  ].join('\n');
  return { name, w, h, top: lipTop, svg: svgDoc(w, h, defs, `<g mask="url(#gm)"><g filter="url(#grain)">${path(back, 'fill="url(#back)"')}<g clip-path="url(#clipB)">${wallBands}${wallSeams}<ellipse cx="${w / 2}" cy="${h * 0.62}" rx="${w * 0.5}" ry="${h * 0.3}" fill="url(#lakeGlow)"/></g>${path(back, `fill="none" stroke="${BASALT.outline}" stroke-width="5"`)}</g>
${path(lake, `fill="url(#lake)" stroke="${LAVA.deep}" stroke-width="4"`)}${plates}<g filter="url(#wisp)">${wisps}</g>
<g filter="url(#grain)">${path(near, 'fill="url(#near)"')}<g clip-path="url(#clipN)">${path(topFace, 'fill="url(#nearTop)"')}${lipMarks}${path(smoothOpen(nearTop, 1), `fill="none" stroke="#c8a070" stroke-width="6" opacity="0.7" filter="url(#soft)"`)}<ellipse cx="${w / 2}" cy="${lipTop - 10}" rx="${w * 0.4}" ry="40" fill="${LAVA.orange}" opacity="0.18" filter="url(#wisp)"/></g>${path(near, `fill="none" stroke="${BASALT.outline}" stroke-width="5"`)}</g></g>`) };
}

/** A tall slope flank for a tall street's bg: rounded shoulders stepping up from the bottom left. */
function slope({ name, w, h, seed }) {
  const r = rng(seed);
  const pts = [[0, h * 0.84]];
  const steps = 7;
  for (let i = 0; i < steps; i += 1) {
    const x0 = (w * i) / steps;
    const x1 = (w * (i + 1)) / steps;
    const y = h * (0.84 - (i + 1) * 0.115);
    pts.push([x0 + (x1 - x0) * 0.25, y + h * 0.06 + (r() * 2 - 1) * 14]);
    pts.push([x0 + (x1 - x0) * 0.5, y + h * 0.012]);
    pts.push([x0 + (x1 - x0) * 0.8, y + (r() * 2 - 1) * 10]);
  }
  pts.push([w, h * 0.02]);
  const sil = smoothOpen(pts, 0.9);
  const body = `${sil} L${w},${h} L0,${h} Z`;
  let ledges = '';
  for (let i = 0; i < steps; i += 1) {
    const p = pts[3 + i * 3];
    const lit = [[p[0] - w * 0.06, p[1] + 10], [p[0] + w * 0.04, p[1] + 6], [w, p[1] + 30]];
    ledges += path(smoothOpen(lit, 1), `fill="none" stroke="${BASALT.rim}" stroke-width="10" opacity="0.35" stroke-linecap="round"`);
    ledges += path(smoothOpen(lit.map(([x, y]) => [x, y + 40]), 1), `fill="none" stroke="#000000" stroke-width="26" opacity="0.18" stroke-linecap="round"`);
    for (let k = 0; k < 3; k += 1) ledges += path(smoothClosed(blobPoints(r, p[0] + r() * (w - p[0]), p[1] + 80 + r() * 140, 20 + r() * 40, 10 + r() * 16, 7, 0.3), 1), `fill="${r() < 0.5 ? BASALT.deep : BASALT.light}" opacity="0.3"`);
  }
  let seams = '';
  for (let i = 0; i < 4; i += 1) seams += seam(r, crackPts(r, w * (0.45 + i * 0.13), h * (0.2 + i * 0.12), h * 0.4, -0.1), 3.5);
  const defs = [
    lin('body', [[0, '#625548'], [0.5, '#463c32'], [1, '#302821']], 1, 0, 0, 1),
    blur('seamGlow', 6),
    grain('grain', 0.014, seed % 97, 0.12),
    `<clipPath id="clip"><path d="${body}"/></clipPath>`,
  ].join('\n');
  return { name, w, h, svg: svgDoc(w, h, defs, `<g filter="url(#grain)"><path d="${body}" fill="url(#body)"/><g clip-path="url(#clip)">${ledges}${seams}</g><path d="${sil}" fill="none" stroke="#22190f" stroke-width="5"/></g>`) };
}


/** The distant volcano: a broad cone, a glowing mouth and an ash plume. */
function farCone({ name, w, h, seed }) {
  const r = rng(seed);
  const cx = w / 2;
  const topY = h * 0.42;
  const mouth = w * 0.06;
  const cone = smoothClosed([
    [0, h], [w * 0.12, h * 0.9], [w * 0.28, h * 0.74], [w * 0.38, h * 0.58], [cx - mouth - 20, topY + 16], [cx - mouth, topY],
    [cx - mouth * 0.3, topY + 8], [cx + mouth * 0.4, topY + 4], [cx + mouth, topY + 2], [cx + mouth + 24, topY + 18],
    [w * 0.63, h * 0.6], [w * 0.74, h * 0.76], [w * 0.88, h * 0.9], [w, h],
  ], 0.6);
  let plume = '';
  for (let i = 0; i < 14; i += 1) {
    const t = i / 13;
    const x = cx + Math.sin(t * 2.4) * w * 0.03 + t * t * w * 0.2;
    const y = topY - 30 - t * topY * 0.62;
    const rr = 60 + t * 120;
    plume += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}" fill="url(#ash)" opacity="${(0.95 - t * 0.4).toFixed(2)}"/>`;
    if (t < 0.5) plume += `<circle cx="${(x + rr * 0.1).toFixed(1)}" cy="${(y + rr * 0.45).toFixed(1)}" r="${(rr * 0.7).toFixed(1)}" fill="${LAVA.orange}" opacity="${(0.35 - t * 0.6).toFixed(2)}"/>`;
  }
  let gullies = '';
  for (let i = 0; i < 9; i += 1) {
    const s0 = (i - 4) / 4;
    const x0 = cx + s0 * mouth * 1.1;
    gullies += path(smoothOpen([[x0, topY + 20], [x0 + s0 * w * 0.08, topY + (h - topY) * 0.45], [x0 + s0 * w * 0.22, h - 10]], 1), `fill="none" stroke="${i % 2 ? '#2c2218' : '#9c8a72'}" stroke-width="${i % 2 ? 26 : 16}" opacity="${i % 2 ? 0.28 : 0.18}" stroke-linecap="round" filter="url(#g8)"`);
  }
  let streaks = '';
  for (let i = 0; i < 5; i += 1) {
    const x = cx + (i - 2) * mouth * 0.6;
    streaks += path(smoothOpen([[x, topY + 6], [x + (i - 2) * 24, topY + 120 + r() * 60], [x + (i - 2) * 50, topY + 200 + r() * 120]], 1), `fill="none" stroke="${LAVA.orange}" stroke-width="${(5 + r() * 4).toFixed(1)}" opacity="0.6" stroke-linecap="round" filter="url(#g3)"`);
  }
  const defs = [
    lin('cone', [[0, '#7c6c56'], [0.5, '#5c503e'], [1, '#453b2c']]),
    lin('lightSide', [[0, '#ffffff', 0.12], [0.5, '#ffffff', 0], [0.6, '#000000', 0], [1, '#000000', 0.22]], 0, 0, 1, 0),
    rad('ash', [[0, '#7d7062', 1], [0.6, '#6a5e52', 0.8], [1, '#5a4e44', 0]]),
    rad('mouthGlow', [[0, LAVA.yellow, 0.95], [0.3, LAVA.orange, 0.7], [1, LAVA.red, 0]]),
    blur('g3', 3),
    blur('plumeBlur', 14),
    blur('g8', 8),
    `<clipPath id="clip">${path(cone)}</clipPath>`,
  ].join('\n');
  return { name, w, h, svg: svgDoc(w, h, defs, `<g filter="url(#plumeBlur)">${plume}</g>
<ellipse cx="${cx}" cy="${topY - mouth * 0.6}" rx="${mouth * 1.8}" ry="${mouth * 2.4}" fill="url(#mouthGlow)"/>
${path(cone, 'fill="url(#cone)"')}<g clip-path="url(#clip)">${gullies}${path(cone, 'fill="url(#lightSide)"')}${streaks}</g>
${path(cone, 'fill="none" stroke="#2c2218" stroke-width="5" opacity="0.7"')}
<ellipse cx="${cx}" cy="${topY + 6}" rx="${mouth * 0.95}" ry="${mouth * 0.12}" fill="${LAVA.yellow}" opacity="0.9" filter="url(#g3)"/>`) };
}

/** The ash-haze sky band: violet ash above a warm glow low down, fading out at the sides and top. */
function skyHaze({ name, w, h, seed }) {
  const r = rng(seed);
  let clouds = '';
  for (let i = 0; i < 26; i += 1) {
    const x = r() * w;
    const y = h * (0.15 + r() * 0.55);
    const rx = 160 + r() * 320;
    clouds += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${(rx * (0.28 + r() * 0.15)).toFixed(1)}" fill="${y > h * 0.5 ? '#c08a58' : '#80746a'}" opacity="${(0.25 + r() * 0.3).toFixed(2)}"/>`;
  }
  const defs = [
    lin('haze', [[0, '#6a5e58', 0], [0.25, '#6a5e58', 0.55], [0.6, '#9a7458', 0.8], [0.85, '#dc9a52', 0.85], [1, '#f0b05a', 0.9]]),
    rad('glow', [[0, '#ffc870', 0.75], [0.5, '#f09048', 0.35], [1, '#d06a38', 0]], 0.5, 1, 0.6),
    lin('fadeX', [[0, '#fff', 0], [0.08, '#fff', 1], [0.92, '#fff', 1], [1, '#fff', 0]], 0, 0, 1, 0),
    `<mask id="m"><rect width="${w}" height="${h}" fill="url(#fadeX)"/></mask>`,
    blur('cb', 30),
  ].join('\n');
  return { name, w, h, svg: svgDoc(w, h, defs, `<g mask="url(#m)"><rect width="${w}" height="${h}" fill="url(#haze)"/><g filter="url(#cb)">${clouds}</g><rect width="${w}" height="${h}" fill="url(#glow)"/></g>`) };
}

/** A puffy ash cloud, lit pale from above and warm from the glow below. */
function ashCloud({ name, w, h, seed }) {
  const r = rng(seed);
  let puffs = '';
  let under = '';
  const n = 9;
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.5) / n;
    const x = w * (0.1 + t * 0.8) + (r() * 2 - 1) * 20;
    const rr = h * (0.2 + Math.sin(t * Math.PI) * 0.22 + r() * 0.06);
    const y = h * 0.62 - Math.sin(t * Math.PI) * h * 0.15;
    puffs += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}"/>`;
    under += `<ellipse cx="${x.toFixed(1)}" cy="${(y + rr * 0.5).toFixed(1)}" rx="${(rr * 0.8).toFixed(1)}" ry="${(rr * 0.42).toFixed(1)}"/>`;
  }
  const defs = [
    lin('cloud', [[0, '#c8bcae'], [0.55, '#968878'], [1, '#74665a']]),
    blur('b', 6),
    blur('b2', 14),
  ].join('\n');
  return { name, w, h, svg: svgDoc(w, h, defs, `<g filter="url(#b)" fill="url(#cloud)">${puffs}</g><g filter="url(#b2)" fill="#e09a58" opacity="0.32">${under}</g><g filter="url(#b2)" fill="#e8dece" opacity="0.4"><ellipse cx="${w * 0.42}" cy="${h * 0.32}" rx="${w * 0.22}" ry="${h * 0.12}"/></g>`) };
}

/** Particle: a soft steam puff (centred). */
function steamPuff({ name, w, h, seed, n = 5 }) {
  const r = rng(seed);
  let puffs = '';
  for (let i = 0; i < n; i += 1) {
    const x = w / 2 + (r() * 2 - 1) * w * 0.16;
    const y = h / 2 + (r() * 2 - 1) * h * 0.14;
    const rr = Math.min(w, h) * (0.16 + r() * 0.1);
    puffs += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}" fill="url(#p)"/>`;
  }
  const defs = [rad('p', [[0, '#ffffff', 0.95], [0.55, '#f0eae0', 0.6], [1, '#dcd2c4', 0]]), blur('b', Math.min(w, h) * 0.04)].join('\n');
  return { name, w, h, svg: svgDoc(w, h, defs, `<g filter="url(#b)">${puffs}</g>`) };
}

/** Particle: a glowing lava blob or drop (centred). */
function lavaBlob({ name, w, h, drop = false }) {
  const cx = w / 2;
  const cy = drop ? h * 0.62 : h / 2;
  const rr = Math.min(w, h) * (drop ? 0.26 : 0.28);
  const shape = drop
    ? `M${cx},${cy - rr * 2.1} C${cx + rr * 0.3},${cy - rr * 1.2} ${cx + rr},${cy - rr * 0.6} ${cx + rr},${cy} A${rr},${rr} 0 0 1 ${cx - rr},${cy} C${cx - rr},${cy - rr * 0.6} ${cx - rr * 0.3},${cy - rr * 1.2} ${cx},${cy - rr * 2.1} Z`
    : smoothClosed(blobPoints(rng(w * 7 + h), cx, cy, rr, rr * 0.92, 9, 0.1), 1);
  const defs = [
    rad('core', [[0, LAVA.white], [0.35, LAVA.yellow], [0.75, LAVA.orange], [1, LAVA.red]], 0.42, drop ? 0.62 : 0.42, 0.6),
    rad('halo', [[0, LAVA.orange, 0.65], [0.5, LAVA.red, 0.25], [1, LAVA.red, 0]]),
  ].join('\n');
  return { name, w, h, svg: svgDoc(w, h, defs, `<ellipse cx="${cx}" cy="${cy - (drop ? rr * 0.4 : 0)}" rx="${w * 0.48}" ry="${h * 0.48}" fill="url(#halo)"/>${path(shape, `fill="url(#core)" stroke="${LAVA.deep}" stroke-width="${Math.max(2, rr * 0.12).toFixed(1)}"`)}<ellipse cx="${cx - rr * 0.35}" cy="${cy - rr * 0.38}" rx="${rr * 0.28}" ry="${rr * 0.18}" fill="#ffffff" opacity="0.7"/>`) };
}

/** Particle: an ember spark (centred). */
function ember({ name, w, h }) {
  const defs = rad('e', [[0, '#ffffff'], [0.15, LAVA.yellow], [0.4, LAVA.orange, 0.7], [1, LAVA.red, 0]]);
  return { name, w, h, svg: svgDoc(w, h, defs, `<circle cx="${w / 2}" cy="${h / 2}" r="${w / 2}" fill="url(#e)"/>`) };
}

/**
 * Every piece: what to draw and how it is meant to be placed. `anchor` is how the game hangs it:
 * bottom (bottom-centre, the visible bottom on the file's bottom) or centre (particles: the lane's
 * emitters draw them centred). `role` is the layer it is for (intake's style band).
 */
export const PIECES = [
  { make: skyHaze, args: { name: 'gz_ai_ash_haze_sky', w: 4000, h: 1400, seed: 11 }, role: 'sky', anchor: 'bottom', drawn: [4000, 1400], what: 'Ash-haze sky band: violet ash above, an orange glow low down; fades out at the sides and top.', use: 'Sky layer, near the layer bottom so the glow sits behind the cone. Draw it at up to its file size (it is soft, so smaller is fine).' },
  { make: ashCloud, args: { name: 'gz_ai_ash_cloud_big', w: 1200, h: 520, seed: 21 }, role: 'sky', anchor: 'bottom', drawn: [600, 260], what: 'Big ash cloud, pale on top, lit orange from below.', use: 'Sky layer, scattered high; flip some.' },
  { make: ashCloud, args: { name: 'gz_ai_ash_cloud_small', w: 760, h: 340, seed: 23 }, role: 'sky', anchor: 'bottom', drawn: [380, 170], what: 'Small ash cloud.', use: 'Sky layer, between the big ones.' },
  { make: farCone, args: { name: 'gz_ai_volcano_cone_far', w: 3200, h: 1500, seed: 31 }, role: 'sky', anchor: 'bottom', drawn: [1600, 750], what: 'The distant volcano: a broad cone with a glowing mouth and an ash plume.', use: 'Sky (or the furthest bg) layer, its bottom on the layer bottom; once per street. Up to its file size on a wide sky.' },
  { make: ridge, args: { name: 'gz_ai_basalt_ridge', w: 3200, h: 1000, seed: 41 }, role: 'bg', anchor: 'bottom', drawn: [1600, 500], what: 'Dark basalt ridge with glowing seams. Both ends meet the sides at the same height, so copies tile edge to edge.', use: 'bg layer, a row of copies along the layer bottom (or stacked up a tall bg layer); x step = drawn width.' },
  { make: slope, args: { name: 'gz_ai_basalt_slope_tall', w: 1600, h: 2400, seed: 43 }, role: 'bg', anchor: 'bottom', drawn: [800, 1200], what: 'Tall basalt flank rising to the right, with ledges and seams.', use: 'bg layer of a Tall street, at one side; flip for the other side.' },
  { make: columns, args: { name: 'gz_ai_basalt_columns', w: 760, h: 1000, seed: 47 }, role: 'middleground', anchor: 'bottom', drawn: [380, 500], what: 'Cluster of six-sided basalt columns.', use: 'Middleground scenery behind the walk line, or bg at a smaller size.' },
  { make: ledge, args: { name: 'gz_ai_basalt_ledge_small', w: 420, h: 190, seed: 51, kind: 'basalt', seams: 1 }, role: 'middleground', anchor: 'bottom', drawn: [210, 95], what: 'Small basalt ledge topper with a flat top and hanging rock.', use: 'topper' },
  { make: ledge, args: { name: 'gz_ai_basalt_ledge_medium', w: 720, h: 250, seed: 53, kind: 'basalt', seams: 2 }, role: 'middleground', anchor: 'bottom', drawn: [360, 125], what: 'Medium basalt ledge topper.', use: 'topper' },
  { make: ledge, args: { name: 'gz_ai_basalt_ledge_large', w: 1240, h: 320, seed: 57, kind: 'basalt', seams: 3 }, role: 'middleground', anchor: 'bottom', drawn: [620, 160], what: 'Large basalt ledge topper.', use: 'topper' },
  { make: ledge, args: { name: 'gz_ai_pumice_ledge_small', w: 440, h: 180, seed: 61, kind: 'pumice', seams: 0 }, role: 'middleground', anchor: 'bottom', drawn: [220, 90], what: 'Small pumice ledge: pale, pitted cap on dark rock.', use: 'topper' },
  { make: ledge, args: { name: 'gz_ai_pumice_ledge_large', w: 900, h: 240, seed: 63, kind: 'pumice', seams: 1 }, role: 'middleground', anchor: 'bottom', drawn: [450, 120], what: 'Large pumice ledge.', use: 'topper' },
  { make: groundStrip, args: { name: 'gz_ai_basalt_ground', w: 1200, h: 240, seed: 71 }, role: 'middleground', anchor: 'bottom', drawn: [600, 120], what: 'Basalt ground strip with rounded ends.', use: 'ground' },
  { make: lavaPool, args: { name: 'gz_ai_lava_pool', w: 900, h: 170, seed: 81 }, role: 'middleground', anchor: 'bottom', drawn: [450, 85], what: 'Glowing lava pool in a crusted rim.', use: 'Middleground, sunk into a floor (its bottom just under the floor line) or on a ledge; scenery, not a hazard.' },
  { make: lavaFall, args: { name: 'gz_ai_lava_fall', w: 400, h: 1200, seed: 83 }, role: 'middleground', anchor: 'bottom', drawn: [200, 600], what: 'Lava fall from a lip of rock into a splash pool.', use: 'Middleground (or bg) against a cliff: its top lip under a ledge, its pool on the floor below. Scale the height to the drop.' },
  { make: vent, args: { name: 'gz_ai_steam_vent', w: 340, h: 250, seed: 91, kind: 'steam' }, role: 'middleground', anchor: 'bottom', drawn: [170, 125], what: 'Steam vent: a squat rock cone with a dark, sulphur-crusted mouth.', use: 'vent' },
  { make: vent, args: { name: 'gz_ai_lava_vent', w: 380, h: 280, seed: 93, kind: 'lava' }, role: 'middleground', anchor: 'bottom', drawn: [190, 140], what: 'Lava vent: a rock cone with a glowing mouth and lava running down.', use: 'vent' },
  { make: boulder, args: { name: 'gz_ai_cooled_rock_1', w: 420, h: 320, seed: 101 }, role: 'middleground', anchor: 'bottom', drawn: [210, 160], what: 'Cooled-lava boulder with ropey folds.', use: 'Middleground on a floor; middleplus in front of the walk line at a smaller size.' },
  { make: boulder, args: { name: 'gz_ai_cooled_rock_2', w: 300, h: 220, seed: 103 }, role: 'middleground', anchor: 'bottom', drawn: [150, 110], what: 'Small cooled-lava rock.', use: 'Middleground or middleplus on a floor, in twos and threes.' },
  { make: boulder, args: { name: 'gz_ai_cooled_rock_hot', w: 520, h: 340, seed: 107, hot: true }, role: 'middleground', anchor: 'bottom', drawn: [260, 170], what: 'Boulder still glowing in its cracks.', use: 'Middleground on a floor, near vents.' },
  { make: craterRim, args: { name: 'gz_ai_crater_rim', w: 3000, h: 1000, seed: 111 }, role: 'middleground', anchor: 'bottom', drawn: [1500, 500], what: 'The crater: far wall with seams, the glowing lava lake, and the near lip.', use: 'rim' },
  { make: steamPuff, args: { name: 'gz_ai_steam_puff_1', w: 160, h: 160, seed: 121, n: 5 }, role: 'sky', anchor: 'centre', drawn: [80, 80], what: 'Particle: soft round steam puff.', use: 'Emitter particle texture (centre-anchored, scaled and faded by the emitter).' },
  { make: steamPuff, args: { name: 'gz_ai_steam_puff_2', w: 128, h: 128, seed: 123, n: 4 }, role: 'sky', anchor: 'centre', drawn: [64, 64], what: 'Particle: smaller steam puff.', use: 'Emitter particle texture.' },
  { make: steamPuff, args: { name: 'gz_ai_steam_wisp', w: 160, h: 112, seed: 125, n: 6 }, role: 'sky', anchor: 'centre', drawn: [80, 56], what: 'Particle: flat steam wisp.', use: 'Emitter particle texture (the tail of a plume).' },
  { make: lavaBlob, args: { name: 'gz_ai_lava_blob', w: 96, h: 96 }, role: 'middleground', anchor: 'centre', drawn: [48, 48], what: 'Particle: glowing lava blob.', use: 'Lava squirt particle texture.' },
  { make: lavaBlob, args: { name: 'gz_ai_lava_drop', w: 72, h: 104, drop: true }, role: 'middleground', anchor: 'centre', drawn: [36, 52], what: 'Particle: lava droplet (point up).', use: 'Lava squirt particle texture; rotate to its velocity.' },
  { make: ember, args: { name: 'gz_ai_ember', w: 48, h: 48 }, role: 'middleground', anchor: 'centre', drawn: [24, 24], what: 'Particle: ember spark.', use: 'Spark particle for lava squirts.' },
];
