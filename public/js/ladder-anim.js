/**
 * Climbing vs paused on a ladder (Ruta Asuncion, 2026-10-28: "when still on a
 * climb the character is continuously bouncing up/down. When not moving the
 * character should also pause").
 *
 * The original client:
 * - AvatarAnimationState.calcAnimationStateFromAPO: on a ladder, CLIMB while
 *   the avatar moves up or down (movingUp/movingDown, its rounded y changed this
 *   tick), else CLIMB_PAUSE.
 * - AbstractAvatarView.setAvatarViewAnimationState: CLIMB_PAUSE after CLIMB
 *   only stops the sheet on the frame showing (ss_view.stop()).
 * - AvatarPhysicsHandler.updateAvatarVelocities: no key on a ladder is vy 0;
 *   nothing in the client bobs a climbing avatar.
 *
 * The remake always reported 'climb' (so other players saw the cycle loop on a
 * resting climber) and added a +/-1.5 px sine bob to the avatar on every
 * ladder frame, moving or not.
 */

import { avatarAnimState } from './avatar-anims.js';

/** 'climb' while moving on the ladder, 'climbPause' at rest. */
export function ladderAnimState(vy) {
  return avatarAnimState({ onLadder: true, climbing: Boolean(Number(vy)) });
}

const LADDER = new Set(['climb', 'climbPause']);

/**
 * Between climb and climbPause the climb sheet stays on: 'stop' holds the frame
 * showing, 'play' runs on from it. null for any other change (a fresh sheet).
 */
export function ladderSwap(prev, next) {
  if (!LADDER.has(prev) || !LADDER.has(next) || prev === next) return null;
  return next === 'climbPause' ? 'stop' : 'play';
}

/**
 * The drawn bob on a ladder: none for the Glitch sheets (they carry their own
 * climb frames) and none at rest; only a sheetless avatar climbing gets the
 * old +/-1.5 px read.
 */
export function climbBobY({ sheets, vy, phase }) {
  if (sheets || !Number(vy)) return 0;
  return Math.sin(Number(phase) || 0) * 1.5;
}
