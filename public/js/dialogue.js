/**
 * Dialogue chains from Tiny Speck's NPC and trant conversations: each pool is
 * one GSJS conversation_run_* function's lines, verbatim and in order (the
 * player's reply buttons are left out). Repeated Talk verbs advance rather
 * than repeating one line.
 */

export const DIALOGUE_SOURCE = 'tinyspeck/glitch-GameServerJS CC0';

const DIALOGUE_POOLS = Object.freeze({
  // items/npc_piggy.js 2250-2318 (conversation surfeit_of_cherries_2), its lines in order.
  npc_piggy: Object.freeze([
    "Lemons? And Pot? Dude, don't talk to me about Pot and lemons.",
    'You should.',
    'There was just this time, right? It was the feast of Pot. Everyone was totally … how old are you? Well, whatever, everyone was having a Very Good Time, you get me?',
    'And this High Potian Priest dude climbed on a table, and started waxing about how he’d got this message, right? About how the thing that would please Pot the most was this dessert he loved as a kid. And he was like: the only thing for it was to gather ALL the lemons in the multiverse and smoosh them all up, and then top them with CLOUDS mixed with HONEY. And, like, if they could only do that, Pot would grant them all this thing, yeah?',
    'Well that’s the problem. No one at that party remembered. Damn, dude: that was one hell of a party.',
    'I know, right? Anyway, it led to the Great Lemon Shortage and the consequential Four-Hundred-Year Angry Citratic War.',
    'I know, bummer, right? Yeah, it was a bummer. Catch ya later. Gots turf to snuffle.',
  ]),
  // items/npc_chicken.js 2014-2064 (conversation chickens_cautionary_tales_1), its lines in order.
  npc_chicken: Object.freeze([
    'Beware the ides of Tii.',
    'You don’t believe me? Fine. Just come the ides of Tii, you’ll see. Anything can happen: poisonings, insanification, spontaneous explosionings…',
    '…gravity sucks and sudden baldness. I’ve seen it all. I’ve seen it all. You watch your step on the ides of Tii.',
    'I look like I know? I couldn’t tell you. They’re dangerous, though. Beware them. Beware. Beware the ides of Tii.',
    'Not a problem.',
  ]),
  // items/npc_butterfly.js 1763-1799 (conversation what_the_butterfly_saw_2), its lines in order.
  npc_butterfly: Object.freeze([
    'So, right, butterflies haven’t always been small?  We were, like, superhuge when Cosma first thought us up. Like, huuuuuuuuuuuuge.',
    'Spriggan. Spriggan said one of us flapped our wings and, on the other side of another world, one of his precious forests had been flattened in the gale. Or something.',
    "O I no, rite?!? Anyway. Soon as he had enough power? He thought 'n' thought 'n' thought till we were all tiny. We’ll never grow up proper again, he said. Least, that’s what I heard.",
  ]),
  // items/trant_fruit.js 723-791 (conversation surfeit_of_cherries_1), its lines in order.
  trant_fruit: Object.freeze([
    'Hey.',
    'Lemons?',
    'Pot.',
    "Liked'em.",
    'A lot.',
    'A LOT.',
    'Ask pig.',
  ]),
  // items/trant_egg.js 723-784 (conversation shape_of_the_world_2), its lines in order.
  trant_egg: Object.freeze([
    'Eggs, for the record, are not round. They are ovoid. You may be able to trace a line around them, but they are not, in themselves, round. Very few things are.',
    'The Gas Plant has very little idea of how things are, in reality. Reality is not something that bothers Gas Plants very much. The world is no more round than my fragile harvest is round.',
    'No. Eggs are ovoid. Pay attention, my distractable little mentee, and I will instruct you on the reality, as passed down to me by a great Alphibian scientist named Weena, creator of the first glorious subterranean transportation prototype.',
    'You don’t, but I shall continue regardless.',
    'The world, you should understand, is constructed in layers. Just as hills sit above caves and caves sit upon other caves, so this layer of world sits upon a whole other layer of world, and beneath that one, a whole other world, and beneath that one, a whole other. Each with their own time structure, creatures, societies, and, perhaps, their own giants.',
    'All the way, my precious. All the way down.',
  ]),
  // items/trant_bean.js 716-780 (conversation the_rise_and_fall_of_the_bean_1), its lines in order.
  trant_bean: Object.freeze([
    'And HE said, “I know it’s BEAN TREE, but what is it now?!?”',
    'And I said, “STILL a bean tree, old thing!… Or should I say, OLD BEAN! Like me, the bean tree, you understand?!” A ha ha ha ha ha.',
    'Wait, weren’t you the glitch I was just talking to?',
    'Well where did that ungrateful little… never mind. The point was, this world hasn’t been in place for long, and even though the giants have existed far longer than the world they’ve created, they still haven’t got a handle on how the whole thing works.',
    'See: while they all know a lot about their individual specialisms, when everything is created all at once, the way is was - and it was, don’t let anyone tell you anything different - they have no idea what anything is.',
    'Basically, twiglet: If it’s not an animal, Humbaba won’t acknowledge it, and if it isn’t a rock, Zille couldn’t pick it out of a line-up.',
    'They may be mighty, see, but they know very little. Very little indeed. You, in fact, could probably teach them something.',
  ]),
  // items/trant_bubble.js 724-778 (conversation one_tree_claims_to_know_the_unknowable_2), its lines in order.
  trant_bubble: Object.freeze([
    'Psst. PSSSSSSSSSSST! Over here. For your ears only, ‘k?',
    'Did that Spice Tree tell you all that business about how he was a great friend of Spriggan’s? And how Spriggan always considered the Sprigganite ages the greatest?',
    'Lies. It’s all lies. Don’t listen to a word.',
    'No! One little tree? Spriggan could sneeze a thousand-thousand of him down before breakfast. But it’s more than that, it’s that there haven’t even BEEN multiple ages.',
    'No. That’s what they WANT you to think. Don’t trust them, comrade. Trust no one. Never chew copper. Check both ways before you dig. That’s all I’m saying. That’s all I’m saying.',
  ]),
  // items/trant_gas.js 723-784 (conversation shape_of_the_world_1), its lines in order.
  trant_gas: Object.freeze([
    'This time… One of the great Lemmish Wanderers, Birdie, was passing through, on her way from Groddle Forest to the sand dunes of Hyperia. And she passed on a piece of truth. You want to hear that truth, friend?',
    'I’m not sure you’re ready for the truth, friend.',
    'Can you handle the truth?',
    'She told me - and you might want to hold on to your mind right now, because I’m about to blow it straight outta your darn ears… wait… What were we talking about? No, wait: I’m there, man. I’m there. She told me, Birdie told me, that the world she journeyed around… was round. ROUND.',
    'No, man. Round… But outside-in. So if Cosma suddenly loses interest, and everything up goes down and everything down goes up, you don’t fall OFF, or OUT the world, man: YOU FALL UP, and YOU FALL IN.',
    'I told you you couldn’t handle my truth.',
  ]),
  // items/trant_spice.js 723-770 (conversation one_tree_claims_to_know_the_unknowable_3), its lines in order.
  trant_spice: Object.freeze([
    'Spriggan said to me once, he said  ‘Spicy, my old friend…’ – because that’s what he called me…',
    'What? What have you heard? It’s that Bubbling loon again, isn’t it? Well I’ll tell you something about him.',
    'Those bubbles weren’t always empty. There was a time in the fifteenth age of Spriggan when the Sprigot males of a certain age, under cover of darkness, drained all the bubble juice from the bubble tree’s bubbles and turned it into a celebratory cocktail for Spriggantide, leaving them as empty and mentally aerated as you find that poor Bubbly fool today.',
    'So Spriggan told me. And why would he lie? He’s a giant, you know.',
  ]),
  // items/street_spirit_groddle.js 1000-1071 (conversation street_spirit_stories_1), its lines in order.
  street_spirit: Object.freeze([
    'How-do there, Little?',
    'Lush, ain’t it?',
    'Lush. Not like “Y’all see him o’er ? He’s a Friend of Friendly and no mistake” lush. Like “My, ain’t we looking Purdy an’ Green an’ Fertile terday?” lush.',
    'See, in the lives the Giants had before, there weren’t no such thing as lush. Sure been such things as ‘bleak’, and ‘barren’, and a whole heap of ‘goshforsaken’, but lushness? No sir there weren’t a dribblin’ of lush.',
    'So when the world came springin’ all to be, lushness was the first thing there was. Green, fertile, flower-filled sunshine-bathed lushness everywhere. Course, some of them giants didn’t like it.',
    'No, L’il Honeybadger, no. Not one tiny bitty.',
    'No one knows for sure. All we knewed was that one day there was some mighty wind, and you could hear the giants roarin’, and the ground all fell to shakin’, and then, the half the dern forest fell cattywampus into itself, and rocks came tumblin’ on top of it and buried it all in caverns and caves an’ all.',
    'Who can say? P’raps there is, praps there ain’t But sometimes, I swear I can hear it growin’ down there.',
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

