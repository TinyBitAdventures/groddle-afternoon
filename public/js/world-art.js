/**
 * The art a stack shows when it is put down in a place (the floor, a shelf, a
 * table, a street), as the original drew it.
 *
 * glitch-client: a stack outside a pack plays the state named by its count, not
 * its icon (ItemstackState.as getDefaultStrForStack 202-209: 'iconic' only in a
 * pack, else String(itemstack.count)); a count with no scene of its own plays the
 * highest numbered one (AbstractItemstackView.as animateMC 339-356,
 * MCUtil.getHighestCountSceneName 95-109), the default being '1'
 * (ItemSSManager.as:28). LocationItemstackView.as _positionViewDO 853-854 puts
 * the SWF stage's bottom centre on the stack's point at the movie's own size,
 * so it rests on the line it landed on; it bobs only for a class whose CSS
 * names a bob_amt (215-229, default 0), so a dropped stack lies still.
 *
 * The art: tools/world-art/render.py renders each numbered scene from the
 * glitch-items SWFs (CC0) into assets/sprites/world/<id>/<state>@3x.webp, listed
 * in js/world-art-list.js. A class with no SWF keeps its pack icon, shrunk to
 * the size a put-down stack has (FALLBACK_MAX).
 */
import { WORLD_ART } from './world-art-list.js?v=2d47f296';

/** The longest side of a pack icon drawn as a put-down stack when no world art exists (the rendered '1' states' median). */
export const FALLBACK_MAX = 36;

/** The id an item's art goes by: its icon file's name (assets/sprites/icons/<id>.png), else the class. */
export function artIdOf(classTsid, iconUrl = '') {
  const m = /(?:^|\/)([a-z0-9_]+)(?:@\dx)?\.(?:png|webp)(?:\?.*)?$/i.exec(String(iconUrl || ''));
  return m && /\/icons\//.test(String(iconUrl)) ? m[1] : String(classTsid || '');
}

/** The state a stack of `count` plays: its own numbered scene, else the highest, else '1'. */
export function worldStateFor(states, count) {
  const want = String(Math.max(1, Math.floor(Number(count) || 1)));
  if (!states) return '1';
  if (states[want]) return want;
  let best = '';
  for (const k of Object.keys(states)) if (/^\d+$/.test(k) && (!best || Number(k) > Number(best))) best = k;
  return best || '1';
}

/**
 * What to draw for a stack: { url, w, h, state } (1x sizes; the art's bottom centre
 * goes on the stack's point), or null when the class has no world art (draw its
 * icon at FALLBACK_MAX). The art is trimmed: almost every item's SWF draws its
 * '1' state standing on the stage's bottom, so the art rests on the line.
 */
export function worldArtFor(classTsid, count = 1, iconUrl = '') {
  const id = artIdOf(classTsid, iconUrl);
  const states = Object.prototype.hasOwnProperty.call(WORLD_ART, id) ? WORLD_ART[id] : null;
  if (!states) return null;
  const state = worldStateFor(states, count);
  const row = states[state];
  if (!row) return null;
  const [w, h] = row;
  return { url: `assets/sprites/world/${id}/${state}@3x.webp`, w, h, state };
}
