/**
 * FEEL (2026-10-30): one eased camera position per frame, and every plane drawn from it.
 *
 * Austin saw the far layers on Guillermo Gamera Way (the arches, the stone houses, the trees)
 * "shift left/right ever so slightly" while the avatar slowed down. The camera itself never
 * reversed. Each plane was rounded on its own, in view pixels: the world to half a pixel
 * (Math.round(cam * 2) / 2) and each parallax layer to a whole pixel (Math.floor in
 * parallaxLayerOffset). On a Retina stage one view pixel is 2.1 to 2.5 device pixels, and the
 * planes stepped on different frames, so against the middleground a layer went back and forth
 * 12 to 25 times in the 60 frames of a stop.
 *
 * Now nothing is rounded while the camera moves: each plane slides by its exact share. When the
 * eased camera comes within a quarter of a device pixel of its target it arrives and rests, and
 * every plane settles on its nearest device pixel (settleOnDevice: or, where the nearest lies
 * behind where it was last frame, the next one on), so art at rest stays as crisp as the renderer
 * can draw it and the last step never turns back. A resting camera holds until its target is a
 * device pixel away, so a still avatar never makes it flicker between resting and moving.
 */

/** Device pixels left between the eased camera and its target that count as arrived. */
export const CAMERA_REST_DEVICE_PX = 0.25;

const EPS = 1e-6;
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const density = (resolution) => (finite(resolution, 1) > 0 ? finite(resolution, 1) : 1);

/** A view-pixel value on a device pixel: the nearest, or the next one along `dir` (+1 / -1). */
export function snapToDevice(value, resolution = 1, dir = 0) {
  const r = density(resolution);
  const v = finite(value) * r;
  if (dir > 0) return Math.ceil(v - EPS) / r;
  if (dir < 0) return Math.floor(v + EPS) / r;
  return Math.round(v) / r;
}

/**
 * A plane settling onto a device pixel: the nearest one to `exact`, unless that lies behind
 * `previous` (where it was drawn last frame) along `dir`, by less than a device pixel; then the
 * next one on from `previous`. Without a direction or a previous position, just the nearest.
 */
export function settleOnDevice(exact, previous, resolution = 1, dir = 0) {
  const r = density(resolution);
  const near = snapToDevice(exact, r);
  if (!dir || !Number.isFinite(previous)) return near;
  if ((near - previous) * dir < -EPS && Math.abs(near - previous) < 1 / r + EPS) return snapToDevice(previous, r, dir);
  return near;
}

/**
 * One frame of the camera along one axis. `alpha` (0..1, movement.js dampingAlpha) is the share
 * of the gap closed this frame, so the ease approaches and never passes its target. `last` is the
 * previous frame's { rest, dir }. Returns { value, rest, dir }: `dir` is the direction of travel,
 * kept while resting so the layers snap the same way every resting frame.
 */
export function easeCameraAxis(current, target, alpha, resolution = 1, last = { rest: false, dir: 0 }) {
  const to = finite(target);
  const r = density(resolution);
  if (!Number.isFinite(current)) return { value: snapToDevice(to, r), rest: true, dir: 0 };
  const dirKept = last?.dir > 0 ? 1 : last?.dir < 0 ? -1 : 0;
  if (last?.rest && Math.abs(to - current) < 1 / r - EPS) {
    return { value: snapToDevice(current, r), rest: true, dir: dirKept };
  }
  const gap = to - current;
  const dir = gap > 0 ? 1 : gap < 0 ? -1 : dirKept;
  const share = Math.min(1, Math.max(0, finite(alpha)));
  const next = current + gap * share;
  if (Math.abs(to - next) <= CAMERA_REST_DEVICE_PX / r) return { value: settleOnDevice(next, current, r, dir), rest: true, dir };
  return { value: next, rest: false, dir };
}

/**
 * A parallax layer's local position under a world drawn at -camera. `offset` is its exact
 * position in world space (street-render parallaxLayerOffset). With `snapResolution` > 0 its
 * screen position (offset - camera) settles on a device pixel (settleOnDevice, with `dir` the way
 * this layer moves on screen and `previousScreen` where it was drawn last frame); 0 leaves it exact.
 */
export function drawnLayerOffset(offset, camera, snapResolution = 0, dir = 0, previousScreen = NaN) {
  const at = finite(offset);
  if (!(snapResolution > 0)) return at;
  const cam = finite(camera);
  return settleOnDevice(at - cam, previousScreen, snapResolution, dir) + cam;
}

/**
 * The way a parallax layer moves on screen when the camera travels `cameraDir`: its screen x is
 * perc * (vpW - layerW), perc growing with the camera, so a layer wider than the view moves
 * against the camera and a narrower one with it.
 */
export function layerScreenDir(cameraDir, viewSize, layerSize) {
  const slope = finite(viewSize) - finite(layerSize);
  if (!cameraDir || !slope) return 0;
  return Math.sign(cameraDir) * Math.sign(slope);
}
