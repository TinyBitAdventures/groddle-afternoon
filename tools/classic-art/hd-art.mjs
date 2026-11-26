/**
 * High-resolution vector traces of the tiny Classic bitmaps the street map scales up (the `hd`
 * list in tools/classic-art/manifest.json, written by tools/classic-art/build.mjs).
 *
 * The phone's street map draws Tiny Speck's 10 x 15 teensy_signpost about 33 x 50 CSS px, so a
 * 3x screen blows it up ten times and it goes soft (Austin 2026-11-24, iPhone sideways: "The
 * mobile signs on the map are blurry"). These are vector traces of the bitmaps, drawn in the
 * bitmap's own pixel grid, the way the hub map's icons were traced for G584 (js/map-graph.js
 * MAP_ICON_ART): the same shape, the same colours and the same box, so a mark keeps its size and
 * placement and only its edges sharpen. No new art: every colour is one of the bitmap's.
 *
 * - teensy_signpost_hd: graphics/teensy_signpost.png (CC0). A grey post (#928685), a left
 *   pointing arm (a #8B453F rim round a #AE7D79 face, its tip at the left and its right end
 *   rounded), a dark foot (#5F5858) and its shadow (#464140), as the bitmap draws them.
 *   Glitch's full-size signpost art (signpost_post.png 43 x 246, signpost_arm.png 260 x 30) is a
 *   brown wooden post and a plain plank with no point; it is not this mark's shape or colour, so
 *   the trace follows the teensy bitmap itself.
 * - map_icon_subway_hd: graphics/map_icon_subway.png, the hub map's own trace of it
 *   (MAP_ICON_ART.subway, G584), so the two maps share one drawing.
 *
 * Pure: hdSvg(name) is the file's text; build.mjs writes it and --check compares bytes.
 */
import { MAP_ICON_ART } from '../../public/js/map-graph.js?v=803cc6cd';

/** The signpost, in teensy_signpost.png's 10 x 15 grid (x right, y down, a pixel is 1 x 1). */
export const SIGNPOST_TRACE = Object.freeze({
  w: 10,
  h: 15,
  colours: Object.freeze({ post: '#928685', rim: '#8B453F', face: '#AE7D79', foot: '#5F5858', shadow: '#464140' }),
  body: (c) =>
    // The foot's shadow (row 14), the post (columns 6-7, rows 0-12), the foot (rows 12-13).
    `<rect x="4.2" y="14" width="5.6" height="0.9" rx="0.45" fill="${c.shadow}" opacity="0.62"/>` +
    `<rect x="6" y="0" width="2" height="13" fill="${c.post}"/>` +
    `<path d="M4.2 14V13.2Q4.4 12.6 5.4 12.5H8.6Q9.6 12.6 9.8 13.2V14Z" fill="${c.foot}"/>` +
    // The arm (rows 2-6): a 1 px rim, the tip at x 0.7, the right end rounded; then its face.
    `<path d="M3.2 2H9.4Q10 2 10 2.6V6.4Q10 7 9.4 7H3.2L0.7 4.5Z" fill="${c.rim}"/>` +
    `<path d="M3.6 3H8Q9 3 9 4V5Q9 6 8 6H3.6L2.1 4.5Z" fill="${c.face}"/>`,
});

/**
 * Pixels of teensy_signpost.png the trace's colours come from: [x, y, colour key]. build.mjs
 * --check and tests/street-minimap-hd.test.js read them from the source when it is beside the game.
 */
export const SIGNPOST_SAMPLES = Object.freeze([
  [6, 0, 'post'], [7, 9, 'post'],
  [3, 2, 'rim'], [9, 4, 'rim'], [6, 6, 'rim'],
  [4, 4, 'face'], [6, 3, 'face'],
  [6, 13, 'foot'],
  [6, 14, 'shadow'],
]);

const svgDoc = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;

/** The high-resolution pieces: name -> { of (the 1x piece), w, h, svg() }. */
export const HD_ART = Object.freeze({
  teensy_signpost_hd: Object.freeze({
    of: 'teensy_signpost',
    w: SIGNPOST_TRACE.w,
    h: SIGNPOST_TRACE.h,
    svg: () => svgDoc(SIGNPOST_TRACE.w, SIGNPOST_TRACE.h, SIGNPOST_TRACE.body(SIGNPOST_TRACE.colours)),
  }),
  map_icon_subway_hd: Object.freeze({
    of: 'map_icon_subway',
    w: MAP_ICON_ART.subway.w,
    h: MAP_ICON_ART.subway.h,
    svg: () => svgDoc(MAP_ICON_ART.subway.w, MAP_ICON_ART.subway.h, MAP_ICON_ART.subway.body),
  }),
});

/** One piece's SVG text, or throws on a name HD_ART does not have. */
export function hdSvg(name) {
  const a = HD_ART[name];
  if (!a) throw new Error(`no high-resolution art named ${name}`);
  return a.svg();
}

/** Where the trace's colours differ from the source bitmap's pixels (empty when they agree). */
export function signpostSampleProblems(img, { tolerance = 2 } = {}) {
  const out = [];
  const hex = (v) => [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
  for (const [x, y, key] of SIGNPOST_SAMPLES) {
    const i = (y * img.w + x) * 4;
    const want = hex(SIGNPOST_TRACE.colours[key]);
    const got = [img.px[i], img.px[i + 1], img.px[i + 2]];
    const far = want.some((v, k) => Math.abs(v - got[k]) > tolerance);
    if (far || img.px[i + 3] < 128) out.push(`teensy_signpost (${x}, ${y}) is rgb(${got.join(', ')}) a ${img.px[i + 3]}, the trace's ${key} is ${SIGNPOST_TRACE.colours[key]}`);
  }
  return out;
}
