/**
 * Museum of the Rook transient quest.
 *
 * Contract sources:
 * - quests/rook_hall_start.js
 * - quests/rook_hall.js
 * - items/rook_hall_speaker.js
 * - items/npc_quest_widget.js
 */

export const ROOK_HALL_START_QUEST_ID = 'rook_hall_start';
export const ROOK_HALL_QUEST_ID = 'rook_hall';
export const ROOK_MUSEUM_STREET_ID = 'INSTANCE_ROOK_MUSEUM';
export const ROOK_MUSEUM_PRODUCTION_TSID = 'LA91BDTNHS82D36';
export const ROOK_MUSEUM_EXHIBIT_COUNT = 6;
export const ROOK_MUSEUM_REWARD = Object.freeze({ xp: 400 });

export const ROOK_MUSEUM_GREETING = Object.freeze([
  {
    text: 'Welcome, young one, to the ancient and venerable Museum of the Rook. I am Greeterbot Sentry G-42, humble docent of this establishment. How may I be of service?',
    response: 'A magic rock told me to talk to you.',
  },
  {
    text: 'Then it is time: time for you to learn of the Rook! Time for you to take up the fight against those dreadful beasts, the fight for imagination - nay, for Ur itself!',
    response: 'Me?',
  },
  {
    text: 'Yes, for if not you, then who else?',
    response: 'Lead the way.',
  },
]);

export const ROOK_MUSEUM_TOUR_INTRO = Object.freeze([
  {
    text: 'Let me ask you this: do you believe yourself ready to fight the Rook?',
    response: "I'm not so sure.",
  },
  {
    text: 'You do well to be wary, for to fight against the Rook is no trifling matter! Many believe the Rook to originate from outside the minds of the Giants. It is an invading force, a parasite of imagination, fearsome and terrible.',
    response: 'But it can be stopped?',
  },
  {
    text: 'No one knows how to stop the Rook for good, but it can be repelled for a time. The ancients discovered methods for this. The relics and chronicles of their battles against the Rook are displayed here.',
    response: 'Can they teach me how to fight the Rook?',
  },
  {
    text: 'Perhaps they can. Study the exhibits, learn all you can about the weapons of your ancestors, and then speak with me when you are done. We may make a mighty guardian of you yet.',
    response: "OK, I'll do that.",
  },
]);

export const ROOK_MUSEUM_COMPLETION = Object.freeze([
  {
    text: 'You have seen all there is to see here. Do you now feel prepared to do battle with the Rook?',
    response: "I'm not sure.",
  },
  {
    text: 'I understand your trepidation, but you must simply remember this…',
    response: 'Yes?',
  },
  {
    text: 'The Rook, while incredibly powerful, is vulnerable to the attacks of Martial Imagination. Before you can harm the Rook, you must use a Focusing Orb to stun it.',
    response: 'Focusing Orb. Stun. Got it.',
  },
  {
    text: 'Once the Rook has been stunned, the Pious Glitch can prime a shrine, turning the donations of others into powerful attacks.',
    response: 'Prime. Donations. Attack. OK.',
  },
  {
    text: 'I believe you are now ready. Go, rally the forces of imagination in defence of Ur! And may the Giants be with you.',
    response: 'For imagination!',
  },
]);

const ORB_LESSON = Object.freeze([
  'Heed my words, young Glitch. YES, YOU! The Rook, in its full wrath and vigour, cannot be harmed by even the most powerful of attacks. It must first be stunned.',
  'Only with a Focusing Orb and the power of Martial Imagination can you stun the Rook. But you cannot do it alone: others must join in the fight.',
  'As other Glitches turn their wills towards the Focusing Orb, your attack will grow in size and power.',
  'The Rook is exceptionally strong, and several powerful attacks may be required to stun it.',
  'But beware, for as the Orb reaches its most powerful, it also grows fragile. If too many minds join in the attack…',
  'The Orb will be destroyed, and the attack for naught. To walk this fine line between success and failure is your sacred duty as a defender of imagination.',
]);

export const ROOK_MUSEUM_EXHIBITS = Object.freeze([
  Object.freeze({
    id: 'button_1',
    number: 1,
    kind: 'painting',
    title: 'The Rook, Enemy of Imagination',
    shortTitle: 'The Rook',
    x: 570,
    painting: 1,
    pages: Object.freeze([
      'Back in the early ages of Ur, when small islands formed spontaneously from the primordial chaos, only to be rendered unrecognizable moments later by the constant ebb and flow of imagination, the ancient Glitchian tribes suffered under constant threats to their very survival.',
      'There was the instability of the environment, the paucity of piggies - not to mention going to sleep every night without knowing what shapes or substances their meagre huts might be when they awoke.',
      'But by far the most dangerous and terrifying of these was the Rook.',
      'THE ROOK, enemy of imagination, visited its wrath upon whatever the Giants’ minds created.',
      'It was the very manifestation of fear, doubt and uncertainty.',
      'It pecked and clawed relentlessly at the periphery of the Giants’ domain, black winter to the Giants’ spring of creativity.',
      'It was, if I can say so myself, most awful.',
    ]),
  }),
  Object.freeze({
    id: 'button_2',
    number: 2,
    kind: 'painting',
    title: 'The Birth of Martial Imagination',
    shortTitle: 'Martial Imagination',
    x: 1040,
    painting: 2,
    pages: Object.freeze([
      'Noticing the capability of a particularly strong, focused and concentrated burst of imagination to temporarily stun the Rook, ascetics and yogis of the Meadow Tribes set to work to develop a more reliable method of harnessing this defensive action.',
      'Employing the recent technological breakthrough of spun-crystal Focusing Orbs, they learned to draw the small imaginations of individual Glitches together and blast the Rook into stillness, at least temporarily.',
      'They gave this discipline the name of “Martial Imagination,” and the image preserved in this display shows an elder Glitch in early times leading imaginators to defend against a stream of Rook attacks.',
    ]),
  }),
  Object.freeze({
    id: 'button_3',
    number: 3,
    kind: 'orb',
    title: 'Ancient Focusing Orb',
    shortTitle: 'Focusing Orb',
    x: 1490,
    pages: Object.freeze([
      'While the lustre of this ancient Focusing Orb has faded with the passing of generations, in ages long past, its flawless surface of spun crystal acted as a nexus for the imaginations of our Glitchian ancestors, and as a potent weapon against the Rook.',
      ...ORB_LESSON,
    ]),
  }),
  Object.freeze({
    id: 'button_4',
    number: 4,
    kind: 'painting',
    title: 'Esquibeth of Inari',
    shortTitle: 'The Pious Esquibeth',
    x: 1940,
    painting: 3,
    pages: Object.freeze([
      'Generations struggled to find a way to fight back against the Rook and end its destruction of creativity.',
      'No progress was made until the extraordinarily Pious Esquibeth of Inari discovered that her will alone could turn a normal shrine into a weapon, harnessing the direct conduit to the minds of the Giants to return fire instead of favor.',
    ]),
  }),
  Object.freeze({
    id: 'button_5',
    number: 5,
    kind: 'shrine',
    title: 'Primitive Shrine Holofilm',
    shortTitle: 'Shrine Holofilm',
    x: 2390,
    pages: Object.freeze([
      'The holofilm which follows demonstrates a pious primitive priming the shrine for an attack.',
      'Discovered half-buried in a rock face at Ekorran Roughs, it would be easy to overlook the coarse stonework of this ancient shrine as simply another natural feature.',
      'But while the crafts of ancient Glitchian tribespeople may have been rudimentary, they still excelled in their piety and devotion to the Giants.',
      'This shrine would have played an integral role in the everyday ceremonies of village life.',
    ]),
  }),
  Object.freeze({
    id: 'button_6',
    number: 6,
    kind: 'painting',
    title: 'Secret Rook Battle Plans',
    shortTitle: 'Rook Battle Plans',
    x: 2840,
    painting: 4,
    pages: Object.freeze([
      'As ancient legends tell it, these battle plans were recovered from an abandoned nest after a series of courageous attacks repulsed the Rook entirely from the Isle of Uralia.',
      'Though their true provenance has never been proven to the satisfaction of all skeptics, most now believe them to be a genuine artifact - indeed, the only such artifact ever to fall into Glitchian hands.',
      'And the only example of Rookish script ever seen.',
    ]),
  }),
]);

export function createRookMuseumState(opts = {}) {
  return {
    status: 'arrival',
    visited: [],
    activeExhibitId: null,
    sourceLocation: opts.sourceLocation ? { ...opts.sourceLocation } : null,
    enteredAt: Number(opts.enteredAt) || Date.now(),
    completedAt: 0,
  };
}

export function beginRookMuseumTour(state) {
  if (!state || state.status !== 'arrival') {
    return { ok: false, reason: state ? 'already_started' : 'missing_state' };
  }
  state.status = 'touring';
  return { ok: true, status: state.status };
}

export function getRookMuseumExhibit(exhibitId) {
  return ROOK_MUSEUM_EXHIBITS.find((exhibit) => exhibit.id === exhibitId) || null;
}

export function visitRookMuseumExhibit(state, exhibitId) {
  const exhibit = getRookMuseumExhibit(exhibitId);
  if (!state) return { ok: false, reason: 'missing_state', exhibit: null };
  if (!exhibit) return { ok: false, reason: 'unknown_exhibit', exhibit: null };
  if (!['touring', 'ready'].includes(state.status)) {
    return { ok: false, reason: 'tour_not_started', exhibit };
  }
  const firstVisit = !state.visited.includes(exhibit.id);
  if (firstVisit) state.visited.push(exhibit.id);
  state.visited = ROOK_MUSEUM_EXHIBITS
    .map((entry) => entry.id)
    .filter((id) => state.visited.includes(id));
  state.activeExhibitId = exhibit.id;
  if (state.visited.length === ROOK_MUSEUM_EXHIBIT_COUNT) state.status = 'ready';
  return {
    ok: true,
    firstVisit,
    exhibit,
    visited: state.visited.length,
    complete: state.status === 'ready',
  };
}

export function rookMuseumObjective(state) {
  if (!state) return 'Enter the Museum of the Rook';
  if (state.status === 'arrival') return 'Speak with Greeterbot Sentry G-42';
  if (state.status === 'ready') return 'Return to Greeterbot Sentry G-42';
  if (state.status === 'complete') return 'Rook training complete';
  const remaining = ROOK_MUSEUM_EXHIBIT_COUNT - state.visited.length;
  return `Study ${remaining} remaining exhibit${remaining === 1 ? '' : 's'}`;
}

export function completeRookMuseum(state, now = Date.now()) {
  if (!state) return { ok: false, reason: 'missing_state', reward: null };
  if (state.status === 'complete') {
    return { ok: false, reason: 'already_complete', reward: null };
  }
  if (state.visited.length !== ROOK_MUSEUM_EXHIBIT_COUNT || state.status !== 'ready') {
    return { ok: false, reason: 'exhibits_remaining', reward: null };
  }
  state.status = 'complete';
  state.completedAt = Number(now) || Date.now();
  state.activeExhibitId = null;
  return { ok: true, reward: { ...ROOK_MUSEUM_REWARD } };
}
