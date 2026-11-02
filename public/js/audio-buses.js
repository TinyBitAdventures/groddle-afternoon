/**
 * The game's one way to the speakers (MUTE, player report 2026-11-01: muted with Music at 0,
 * the street song came back at about 1% after a trip to another hub).
 *
 *   source -> its own gain (fade, crossfade, duck) -> music bus | effects bus -> master -> speakers
 *
 * Only the master is connected to `ctx.destination`; every other node in the game connects to
 * a bus (tests/audio-buses.test.js fails if anything else does). Mute holds the master at
 * exactly 0, dropping any ramp still scheduled on it, as the client's mute did for every sound
 * at once (SoundMaster.as muteAllSounds 315-324: SoundMixer.soundTransform = 0). The Music
 * slider sets the music bus and the Effects slider the effects bus (SoundMaster.as playSound
 * 233-238: is_music sounds take music_volume, the rest sfx_volume), so a fade on a track's own
 * gain can never be heard past them: Music 0 or Mute is silence whatever a track is doing.
 *
 * Fades use linear ramps, which reach 0 exactly; an exponential ramp or setTargetAtTime never
 * does, and the old street crossfade's 0.001 floor was the leak.
 */

/** Holds a gain at exactly `value` from now on, cancelling every ramp scheduled on it. */
export function holdGain(param, value, ctx) {
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  try {
    param.cancelScheduledValues(0);
  } catch { /* nothing scheduled */ }
  param.value = v;
  try {
    param.setValueAtTime(v, ctx.currentTime);
  } catch { /* closed context */ }
}

/** A linear fade from the gain's current value to `value` (0 is reached exactly). */
export function fadeGain(param, value, seconds, ctx) {
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (!(seconds > 0)) return holdGain(param, v, ctx);
  const t = ctx.currentTime;
  try {
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(v, t + seconds);
  } catch {
    param.value = v;
  }
}

/** 0..1 from a level that may be missing or out of range. */
const unit = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : 1);

/**
 * Builds the master, music and effects buses on `ctx`.
 * `set({ muted, music, effects })` applies the player's settings (music and effects 0..1).
 */
export function createAudioBuses(ctx, settings = {}) {
  const master = ctx.createGain();
  const music = ctx.createGain();
  const sfx = ctx.createGain();
  music.connect(master);
  sfx.connect(master);
  master.connect(ctx.destination);
  const now = { muted: false, music: 1, effects: 1 };
  const buses = {
    master,
    music,
    sfx,
    /** The settings last applied. */
    get settings() {
      return { ...now };
    },
    set({ muted = now.muted, music: m = now.music, effects = now.effects } = {}) {
      now.muted = Boolean(muted);
      now.music = unit(m);
      now.effects = unit(effects);
      holdGain(master.gain, now.muted ? 0 : 1, ctx);
      holdGain(music.gain, now.music, ctx);
      holdGain(sfx.gain, now.effects, ctx);
      return buses;
    },
    /** A gain for one music source (a street track, a cue), silent until faded in. */
    musicVoice(level = 0) {
      const g = ctx.createGain();
      g.gain.value = Math.max(0, level);
      g.connect(music);
      return g;
    },
    /** A gain for one effects source (a Musicblock, a recorded cue). */
    sfxVoice(level = 1) {
      const g = ctx.createGain();
      g.gain.value = Math.max(0, level);
      g.connect(sfx);
      return g;
    },
  };
  return buses.set(settings);
}
