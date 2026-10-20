export const STOOT_DOLL_ID = 'stoot_barfield_pullstring_doll';
export const STOOT_DOLL_LABEL = 'Stoot Barfield Pullstring Doll';
export const STOOT_DOLL_BUBBLE_MS = 10_000;
export const STOOT_MEMORIAL_STREET_ID = 'GIFPV9EMLT72DP4';

// Exact production order from items/stoot_barfield_pullstring_doll.js.
export const STOOT_DOLL_QUOTES = Object.freeze([
  'That is not part of our corporate culture.',
  'Who the hell is Paul from Japan?',
  'I’m trying my hardest!',
  'This will only take a week. Two, tops.',
  'Siiiiiiiiiiigh.',
  "I HATE PIGEONS IN THE OFFICE AND THINK THAT SHOULDN'T BE ALLOWED!!!",
  'Work harder!',
  'I would like to go on a forever vacation!!!!!!!!!',
  'I love rhubarb pie!',
  'I have never seen The Sound of Music.',
  'God bless Myles!',
  'Lotsa fluids!',
  'I love you. In an entirely non-creepy way.',
  'afk til 5',
  'You’re my favorite Estonian.',
  "I don't feel like we hug enough. We should hug more.",
  'Everything is such a bother!',
  'They would not call it a funpickle!',
  'Top Priority!',
  'Success is inevitable!',
  '不好',
  '好',
  'Ooooouch!! Soy guapo!',
  'I wanted to change my name to Machine Gun Bill!',
  'My sandwich is bigger than your head!',
  'How do you love it?',
  'TA-DA!',
  'I’m going to fly around in helicopters and stuff like that.',
  'SERGUEIIIIII!!!!',
  'It would be ... a couple hundred pixels wide.',
  'How awesome would that be?',
  'Ssssssswarmatron!',
  'Whatever.',
  'Good luck!',
  "It'll happen someday!",
  "Right now, people can't ... they basically can't play the game, because it's so fucking slow.",
  'I wanted to make it bigger.',
  "That's good?",
  "... And that wasn't going to be enough, so we were like, 'Oh shit,' but then we realized, 'Oh, it doesn't matter!'",
  '...add more... fun to the game.',
  'Fun fun fun fun, fun, a #$% of a lot more fun, fun fun, fun, um... more fun',
  "I don't know uh... a lot about astronomy, but... more fun.",
  "It's fucking awesome!",
]);

export const STOOT_DOLL_SOUND_KEYS = Object.freeze(
  Object.fromEntries(
    STOOT_DOLL_QUOTES.slice(29).map((quote, index) => [quote, `STEWARTDOLL${index + 1}`])
  )
);

function clampRoll(roll) {
  const value = Number(roll);
  if (!Number.isFinite(value)) return Math.random();
  return Math.max(0, Math.min(0.999999999, value));
}

export function createStootDollState() {
  return {
    pullCount: 0,
    lastQuoteIndex: -1,
    lastQuote: '',
    lastSoundKey: '',
  };
}

export function selectStootDollQuote(roll = Math.random()) {
  const index = Math.floor(clampRoll(roll) * STOOT_DOLL_QUOTES.length);
  const quote = STOOT_DOLL_QUOTES[index];
  return {
    index,
    quote,
    soundKey: STOOT_DOLL_SOUND_KEYS[quote] || '',
  };
}

export function pullStootDollString(state, { roll = Math.random() } = {}) {
  const doll = state && typeof state === 'object' ? state : createStootDollState();
  const selected = selectStootDollQuote(roll);
  doll.pullCount = Math.max(0, Math.floor(Number(doll.pullCount) || 0)) + 1;
  doll.lastQuoteIndex = selected.index;
  doll.lastQuote = selected.quote;
  doll.lastSoundKey = selected.soundKey;
  return {
    ok: true,
    ...selected,
    pullCount: doll.pullCount,
    activity: `The doll starts to speak: "${selected.quote}"`,
  };
}
