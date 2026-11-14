/**
 * #313 (The Catface, Mr. Block's Playroom): a conversation card sits clear of the one talking.
 *
 * In Glitch a thing's conversation was a talk bubble over the thing itself, never a box in the
 * middle of the screen: ChoicesDialog._actuallyPresent (glitch-client
 * com/tinyspeck/engine/view/gameoverlay/ChoicesDialog.as 833-880) shows chat_bubble at getPtForLIV
 * (921-947: the top of the speaker's art, LocationItemstackView.getYAboveDisplay, less the bubble's
 * pointer), with the pointer down at the speaker, and keeps it in the viewport (keep_in_viewport).
 * The remake keeps its card and puts it there: over the speaker when it fits, else beside it on
 * the side with more room, else under it; null leaves the card where it was (centred).
 *
 * Pure placement plus one DOM helper (checks for its elements); coordinates are the modal's px.
 */
import { measureLocationViewport } from './familiar.js?v=b9597cd3';

/** ChatBubble's talk_bubble_point is 11 px tall: the gap between a card and its speaker. */
export const SPEAKER_CARD_GAP = 11;
/** The least room kept between a card and the edges of the location viewport. */
export const SPEAKER_CARD_MARGIN = 8;

/**
 * Where a w x h card goes so it does not cover `speaker` ({ left, top, right, bottom }) inside
 * `view` ({ x, y, w, h }): { x, y, how: 'above' | 'beside' | 'below' } (its top left), or null
 * when the speaker is not in the view or no side has room.
 */
export function placeCardBySpeaker({ view, card, speaker, gap = SPEAKER_CARD_GAP, margin = SPEAKER_CARD_MARGIN } = {}) {
  if (!view || !card || !speaker) return null;
  const w = Number(card.w) || 0;
  const h = Number(card.h) || 0;
  if (!(w > 0) || !(h > 0)) return null;
  const minX = view.x + margin;
  const maxX = view.x + view.w - margin - w;
  const minY = view.y + margin;
  const maxY = view.y + view.h - margin - h;
  if (maxX < minX || maxY < minY) return null;
  // A speaker out of the view has nothing to keep clear of.
  if (!(speaker.right > view.x && speaker.left < view.x + view.w && speaker.bottom > view.y && speaker.top < view.y + view.h)) return null;
  const clampX = (x) => Math.min(maxX, Math.max(minX, x));
  const clampY = (y) => Math.min(maxY, Math.max(minY, y));
  const cx = (speaker.left + speaker.right) / 2;
  const cy = (speaker.top + speaker.bottom) / 2;
  // Over the speaker's head, as the bubble was (getPtForLIV).
  const above = speaker.top - gap - h;
  if (above >= minY) return { x: Math.round(clampX(cx - w / 2)), y: Math.round(above), how: 'above' };
  // Beside it, on the side with more room.
  const sides = [];
  const right = speaker.right + gap;
  const left = speaker.left - gap - w;
  if (right <= maxX) sides.push({ x: right, room: view.x + view.w - speaker.right });
  if (left >= minX) sides.push({ x: left, room: speaker.left - view.x });
  if (sides.length) {
    sides.sort((a, b) => b.room - a.room);
    return { x: Math.round(sides[0].x), y: Math.round(clampY(cy - h / 2)), how: 'beside' };
  }
  const below = speaker.bottom + gap;
  if (below <= maxY) return { x: Math.round(clampX(cx - w / 2)), y: Math.round(below), how: 'below' };
  return null;
}

/**
 * Place a `.quest-dialogue` modal's card clear of its speaker. `speakerRect` is the speaker's
 * sprite in the modal's px (game.js targetPageRect against the modal's box), or null to centre
 * the card as before. Sets data-speaker-place (style.css) and returns the spot, or null.
 */
export function placeDialogueBySpeaker(modal, speakerRect) {
  const card = modal?.querySelector?.('.quest-dialogue-card');
  if (!card) return null;
  if (!speakerRect) {
    delete modal.dataset.speakerPlace;
    return null;
  }
  // Measured where it will sit (absolute), so its width is the width it will have.
  modal.dataset.speakerPlace = 'measure';
  const spot = placeCardBySpeaker({
    view: measureLocationViewport(modal),
    card: { w: card.offsetWidth, h: card.offsetHeight },
    speaker: speakerRect,
  });
  if (!spot) {
    delete modal.dataset.speakerPlace;
    return null;
  }
  card.style.setProperty('--speaker-card-x', `${spot.x}px`);
  card.style.setProperty('--speaker-card-y', `${spot.y}px`);
  modal.dataset.speakerPlace = spot.how;
  return spot;
}
