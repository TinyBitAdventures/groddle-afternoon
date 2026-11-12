/**
 * Draw order on the street's FX layer (game.js fxLayer; Pixi sorts a container by zIndex once a
 * child sets one). A speech balloon hangs over everything else there; the words a result floats
 * (floatText, a quoin's amount) draw over the balloon, so a gain said beside a talkback is read,
 * not hidden behind it (ticket 245).
 */
export const SPEECH_BUBBLE_Z = 99999;
export const FLOAT_TEXT_Z = SPEECH_BUBBLE_Z + 1;
