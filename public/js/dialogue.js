/**
 * Compact dialogue chains ported from Tiny Speck's generated NPC/trant
 * conversations. Repeated Talk verbs advance rather than repeating one line.
 */

export const DIALOGUE_SOURCE = 'tinyspeck/glitch-GameServerJS CC0';

const DIALOGUE_POOLS = Object.freeze({
  npc_piggy: Object.freeze([
    "Lemons? And Pot? Dude, don't talk to me about Pot and lemons.",
    'There was this Feast of Pot, right? Everyone was having a Very Good Time.',
    'A High Potian Priest said the thing Pot wanted most was a dessert made from every lemon in the multiverse.',
    'Nobody at the party remembered what Pot was supposed to grant them. That was one serious party.',
    'Anyway, it led to the Great Lemon Shortage and the Four-Hundred-Year Angry Citratic War. Bummer, dude.',
  ]),
  npc_chicken: Object.freeze([
    'Beware the ides of Tii.',
    "You don't believe me? Fine. Anything can happen: poisonings, insanification, spontaneous explosionings.",
    "Gravity sucks and sudden baldness. I've seen it all. Watch your step on the ides of Tii.",
    "I look like I know when they are? I couldn't tell you. They're dangerous, though. Beware.",
    'Chickens never lie.',
  ]),
  npc_butterfly: Object.freeze([
    "So, right, butterflies haven't always been small? We were superhuge when Cosma first thought us up.",
    "Spriggan said one flap flattened one of his forests on the other side of another world. Or something.",
    "O I no, rite?!? He thought 'n' thought till we were all tiny. We'll never grow up proper again.",
    'At least, that is what I heard. Butterflies hear a lot. We are excellent at wafting nearby.',
  ]),
  trant_fruit: Object.freeze([
    'Hey.',
    'Lemons?',
    'Pot.',
    "Liked 'em.",
    'A lot.',
    'A LOT.',
    'Ask pig.',
  ]),
  trant_egg: Object.freeze([
    'Eggs, for the record, are not round. They are ovoid. Very few things are truly round.',
    'The Gas Plant has very little idea of how things are in reality. Reality does not bother Gas Plants much.',
    'Pay attention, my distractable little mentee, and I will instruct you on reality.',
    "You don't appear convinced, but I shall continue regardless.",
    'The world is constructed in layers: hills above caves, caves upon other caves, and other worlds beneath those.',
    'All the way down, my precious. All the way down.',
  ]),
  trant_bean: Object.freeze([
    "And HE said, 'I know it is BEAN TREE, but what is it now?!?'",
    "And I said, 'STILL a bean tree, old thing! Or should I say, OLD BEAN!' A ha ha ha ha ha.",
    'The Giants may be mighty, twiglet, but they know very little. You could probably teach them something.',
  ]),
  trant_bubble: Object.freeze([
    'Psst. PSSSSSSSSSSST! Over here. For your ears only, okay?',
    'Did that Spice Tree tell you how he was a great friend of Spriggan?',
    "Lies. It is all lies. Don't listen to a word.",
    'Trust no one. Never chew copper. Check both ways before you dig.',
    "That's all I'm saying. That's all I'm saying.",
  ]),
  trant_gas: Object.freeze([
    'A great Lemmish Wanderer once passed on a piece of truth. Can you handle the truth, friend?',
    "I'm not sure you're ready for the truth, friend.",
    'She told me the world was round. ROUND.',
    'But outside-in! If everything falls up, you fall in. Mind blown, right?',
  ]),
  trant_spice: Object.freeze([
    "Spriggan said to me once, 'Spicy, my old friend,' because that is what he called me.",
    "What have you heard? It is that Bubbling loon again, isn't it?",
    'Spriggan could sneeze a thousand bubble trees down before breakfast. He is a Giant, you know.',
    "Why would Spriggan lie? Not that I'm name-dropping.",
  ]),
  street_spirit: Object.freeze([
    'How-do there, Little?',
    "Lush, ain't it? Green, fertile, flower-filled, sunshine-bathed lushness everywhere.",
    'In the lives the Giants had before, there was bleak and barren and goshforsaken, but no lushness.',
    'When the world came springing into being, lushness was the first thing there was.',
    "Half the forest once fell cattywampus into itself, and rocks tumbled down and buried it in caves.",
    "Sometimes, I swear I can hear that old forest growing down there.",
  ]),
  // The Firebog spirit's "Street Spirit Mysteries" (street_spirit_firebog.js
  // 897-1019: street_spirit_mysteries_1 and _2), its lines in order.
  street_spirit_firebog: Object.freeze([
    'Darklee sat yon giants, brooding in their funk. In darkly times, they grizzled at their woe.',
    'They grumbled! After the furny blast did blasty-raze the wood and leave but twiggybits!',
    'For surishly maybelike! Twiggybits just! No mores! Well, no more but wetly peat-ash and jellicle-spores.',
    'Sayso! Firelybogs from forests green did spring and giantly grumbles echoly did ring. For eons long!',
    'Full rightly wowzers say you, tiny Glitch. This fizzling firebog once all forest was. And giantly sads was deep and thick and flub.',
    'Flub.',
    "Yay, listen Glitchy, while history surrounds 'ee.",
    'Tight-wovened strings that binded giants were till Rookling first did swoop upon the world. It tore with toothied beak and razored claw straight through the imaginings so careful-wrought.',
    'And in their sleep giant tears rolled down giant chins, to watch their frabjous world be torn in bits. The rook is part of them they cannot kill. The knowledge of it heavy on them sits. And breaks their sleeps.',
    'Sleeps.',
  ]),
  // The Uralia spirit's "When Down Was Up" (street_spirit_zutto.js 947-1104:
  // when_down_was_up_1 and _2), its lines in order.
  street_spirit_zutto: Object.freeze([
    'SPOING!!! Ha?!? What? Say? Hi!',
    'Woah! Yah! Woaaaaahh! Hee-hee! Spoing!',
    'Hee! No calm! Too much! Look! Look you talking! You talking! To me!',
    'Zille frowns on jollity. And fun. And floating. Floating is fun.',
    'Me? No. This? No no no. This is just a hangover from a time before, when down was up and up was down.',
    'When time that Cosma forgot and most other giants ignored. Who are they to care if caverns are suddenly the tunnels of the sky?',
    'So then I hung upside down, now I hang downside up. Whatever. All helps to get the stardusts out of my earryholes.',
    'Hi hi hi hi! SPOING!!!!',
    'Shhh, here is a secret. Come closer. Not that close.',
    'Hee! Oooh! Here! During an age in the middle of the ages that I cannot summon the energy to remember, but it is written down somewhere...',
    'Some. Somewhere. Theresome. Anyway but. The caverns filled with water.',
    'No no no no no no no no no no.',
    'No.',
    'Other caverns, elsewhere else. And those? Those filled with things of life and sea and sealife things. But I? I kept all dry. And why?',
    "I don't know. I just liked the rhyme. Why. Dry. Fly. Try. Pie. I. Rye.",
  ]),
});

const SPEAKER_LABELS = Object.freeze({
  npc_piggy: 'Piggy',
  npc_chicken: 'Chicken',
  npc_butterfly: 'Butterfly',
  trant_fruit: 'Fruit Tree',
  trant_egg: 'Egg Plant',
  trant_bean: 'Bean Tree',
  trant_bubble: 'Bubble Tree',
  trant_gas: 'Gas Plant',
  trant_spice: 'Spice Plant',
  street_spirit: 'Street Spirit',
  street_spirit_firebog: 'Street Spirit',
  street_spirit_zutto: 'Street Spirit',
});

function dialogueKey(classId) {
  const id = String(classId || '');
  // Store vendors (street_spirit_groceries...) share the Groddle lines; the
  // regional classes with their own conversations keep them (js/street-spirits.js).
  if (DIALOGUE_POOLS[id]) return id;
  return id.startsWith('street_spirit_') ? 'street_spirit' : id;
}

function cleanCount(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function dialoguePool(classId) {
  return DIALOGUE_POOLS[dialogueKey(classId)] || Object.freeze([]);
}

export function hasDialogue(classId) {
  return dialoguePool(classId).length > 0;
}

/**
 * Mutates only the target's scalar dialogue turn, which animal/trant saves
 * already preserve. The returned line is deterministic and loops cleanly.
 */
export function nextDialogue(classId, state = {}, options = {}) {
  const key = dialogueKey(classId);
  const pool = dialoguePool(key);
  const fallback = String(options.fallback || '').trim();
  const lines = pool.length ? pool : fallback ? [fallback] : [];
  if (!lines.length) return null;
  const turn = cleanCount(state.dialogueTurn);
  const index = turn % lines.length;
  state.dialogueTurn = turn + 1;
  const speaker = String(options.speaker || SPEAKER_LABELS[key] || options.label || 'Someone');
  const text = lines[index];
  return {
    classId: String(classId || ''),
    key,
    speaker,
    text,
    index,
    turn,
    total: lines.length,
    durationMs: Math.max(3600, Math.min(9000, 2400 + text.length * 34)),
    source: DIALOGUE_SOURCE,
  };
}

export function formatSpokenLine(dialogue) {
  if (!dialogue) return '';
  return `${dialogue.speaker}: “${dialogue.text}”`;
}

