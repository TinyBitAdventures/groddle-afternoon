/**
 * The Musicblocks page's players (groddle-afternoon-site/src/Musicblocks.php draws the
 * cards, each with a plain <audio> player that works without this script).
 * Here each card gets a play button, a progress bar and the tune's time, and
 * one tune plays at a time, as in the game: starting a block fades the one
 * already playing out over half a second (MUSICBLOCK_PLAYBACK in
 * js/musicblocks.js), and playing the same block again stops it.
 */
const FADE_MS = 500;
/** The game's block level (MUSICBLOCK_PLAYBACK.gain). */
const GAIN = 0.72;

const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/></svg>';

let current = null;

const clock = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

function fadeOut(player) {
  const { audio } = player;
  const from = audio.volume;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / FADE_MS);
    audio.volume = from * (1 - t);
    if (t < 1 && !audio.paused) requestAnimationFrame(step);
    else player.reset();
  };
  requestAnimationFrame(step);
}

function setup(card) {
  const audio = card.querySelector('audio');
  const name = card.querySelector('.mb-name')?.textContent.trim() || 'this musicblock';
  if (!audio) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mb-play';
  const bar = document.createElement('div');
  bar.className = 'mb-bar';
  bar.innerHTML = '<span></span>';
  const time = document.createElement('span');
  time.className = 'mb-time';
  time.textContent = '';
  card.querySelector('.mb-face')?.append(button);
  audio.after(bar, time);

  const player = {
    audio,
    reset() {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = GAIN;
      card.classList.remove('is-playing');
      button.innerHTML = ICON_PLAY;
      button.setAttribute('aria-label', `Play ${name}`);
      bar.firstChild.style.width = '0%';
      if (current === player) current = null;
    },
  };
  player.reset();

  button.addEventListener('click', () => {
    if (current === player) {
      fadeOut(player);
      return;
    }
    if (current) fadeOut(current);
    current = player;
    audio.currentTime = 0;
    audio.volume = GAIN;
    card.classList.add('is-playing');
    button.innerHTML = ICON_STOP;
    button.setAttribute('aria-label', `Stop ${name}`);
    audio.play().catch(() => player.reset());
  });
  audio.addEventListener('timeupdate', () => {
    if (audio.duration) bar.firstChild.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
    time.textContent = audio.duration ? `${clock(audio.currentTime)} / ${clock(audio.duration)}` : clock(audio.currentTime);
  });
  audio.addEventListener('loadedmetadata', () => { time.textContent = `${clock(audio.currentTime)} / ${clock(audio.duration)}`; });
  audio.addEventListener('ended', () => player.reset());
}

for (const set of document.querySelectorAll('.mb-set')) {
  for (const card of set.querySelectorAll('.mb-card')) setup(card);
  set.classList.add('mb-ready');
}
