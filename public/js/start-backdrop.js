/**
 * BACKDROP: the start card ("Welcome to a scrap of Ur") over its street, fully drawn.
 *
 * The card is the remake's own (no client equivalent). At boot the street is built while the
 * card is still to come; its decos, the shrine, the items and the avatar are images still on
 * their way. The loading card (#boot-loader) stays up until nothing on screen is loading and the
 * street has drawn a couple of frames at its own camera (parallax, culled decos, blurred layers'
 * tiles), then the card fades in over it. When that takes longer than BACKDROP_CAP_MS (a slow
 * connection), the card fades in over a calm static backdrop instead of a half-built street, and
 * the backdrop clears once the street has drawn.
 */

/** How long the loading card waits for the street before the card goes up over the calm backdrop. */
export const BACKDROP_CAP_MS = 4000;

/**
 * Image sources still loading under the given Pixi roots, as drawn now: hidden and culled
 * branches are skipped (a culled deco is off screen; a hidden one is not drawn).
 * @param {Array<any>} roots Pixi containers (the street, the entities, the front layers)
 * @param {(source: any) => boolean} isSettled loaded or failed
 * @returns {Set<any>}
 */
export function pendingSources(roots, isSettled) {
  const out = new Set();
  const stack = (roots || []).filter(Boolean);
  while (stack.length) {
    const node = stack.pop();
    if (!node || node.destroyed || node.visible === false || node.culled === true) continue;
    const source = node.texture?.source;
    if (source && !isSettled(source)) out.add(source);
    if (node.children?.length) stack.push(...node.children);
  }
  return out;
}

/**
 * Resolves true once nothing under the roots is loading and `frames` frames have drawn since
 * (the frames cull the decos at the real camera and bake the blurred layers' tiles). Loads are
 * re-checked a few rounds: an arrival can bring more (a blurred layer re-parents its decos into
 * tiles, a sharp deco swaps to its own file). Resolves false when the roots are still loading
 * after `rounds`.
 * @param {{
 *   roots: () => Array<any>,
 *   isSettled: (source: any) => boolean,
 *   whenSettled: (source: any) => Promise<any>,
 *   nextFrame: () => Promise<any>,
 *   frames?: number,
 *   rounds?: number,
 * }} opts
 */
export async function whenSceneDrawn({ roots, isSettled, whenSettled, nextFrame, frames = 3, rounds = 6 }) {
  // A first frame culls the street at its camera, so only what is on screen is waited for.
  await nextFrame();
  for (let i = 0; i < rounds; i += 1) {
    const pending = pendingSources(roots(), isSettled);
    if (!pending.size) break;
    await Promise.allSettled([...pending].map((source) => whenSettled(source)));
    await nextFrame();
  }
  for (let i = 0; i < frames; i += 1) await nextFrame();
  return pendingSources(roots(), isSettled).size === 0;
}

/**
 * Show the start card once the street has drawn, or over the calm backdrop at the cap.
 * `drawn` is whenSceneDrawn's promise; `show(mode)` puts the card up ('street' or 'calm') and
 * hides the loading card; `clear()` lifts the calm backdrop when the street draws late.
 * Resolves with the mode the card went up in.
 * @param {{
 *   drawn: Promise<boolean>,
 *   show: (mode: 'street' | 'calm') => void,
 *   clear: () => void,
 *   capMs?: number,
 *   wait?: (ms: number) => Promise<any>,
 * }} opts
 */
export async function revealStartCard({ drawn, show, clear, capMs = BACKDROP_CAP_MS, wait }) {
  const sleep = wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const settled = drawn.then((ok) => ({ ok }), () => ({ ok: false }));
  const first = await Promise.race([settled, sleep(capMs).then(() => null)]);
  if (first?.ok) {
    show('street');
    return 'street';
  }
  show('calm');
  // Drawn after the cap (or a load that failed): the street shows through once it has drawn.
  if (!first) settled.then(({ ok }) => { if (ok) clear(); });
  return 'calm';
}
