/**
 * Buffs (tools/encyclopedia/sections.mjs): one page per buff of Tiny Speck's
 * catalog, with what it does, how long it lasts, what gives it to you and
 * whether the remake does.
 *
 * Sources (read only):
 *  - assets/content/buffs.json (from GSJS items/catalog_buffs.js): name, desc,
 *    duration, tick, debuff, item class.
 *  - js/buff-triggers.js: the drinks and foods that apply a buff
 *    (CONSUME_BUFFS), the timed quests' timer buffs (QUEST_TIMER_BUFFS), the
 *    winter streets, Gandlevery, the tick and end lines, the tray stand-in icons.
 *  - js/buffs.js BUFF_ITEM_CATALOG: the herbs, Spinach and Essences (verb, the
 *    line you get, the remake's effect words).
 *  - CAUSES below: every other buff, from the remake code that applies it
 *    (and GSJS where the remake does not), checked by hand on 2026-11-05.
 *    A row marked missing goes stale when the buff is built later (Stuffed
 *    did, report #186): tests/encyclopedia-buffs.test.js looks for that.
 *
 * Refs: rel 'causes' to the items, creatures, people, quests and places that
 * give a buff (not drawn back on those pages yet); rel 'after' to the buff it
 * follows, drawn back on that buff's page as "What comes after".
 */
import { BUFF_ICONS, BUFF_END_MESSAGES, BUFF_TICK_MESSAGES, CONSUME_BUFFS, GANDLEVERY_MUNCH, KUKUBEE_WINTER_TSIDS, QUEST_TIMER_BUFFS } from '../../public/js/buff-triggers.js?v=a3093922';
import { BUFF_ITEM_CATALOG } from '../../public/js/buffs.js?v=819cb342';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { esc, fmt, orList, tsHtml } from './parts.mjs';

const BUFFS_JSON = join(import.meta.dirname, '..', '..', 'public', 'assets', 'content', 'buffs.json');

/** Staff and test buffs: no player ever had them (admin tools, slash commands, test rows). */
export const DEV_BUFFS = new Set([
  'admin_buff_timers', 'cal_test', 'offline_test', 'online_test', 'timer_test',
  'max_luck', 'turn_off_quests', // main.js /max_luck and /turn_off_quests: staff chat commands
  'walking_dead', // the Admin Widget's
]);

/**
 * What gives each buff that the tables in buff-triggers.js and buffs.js do not
 * name. `say` is our sentence; {key} is a link (a bare id is an item), shown as
 * the name in plain text when the key has no page. `status` is the remake's:
 * source (the remake gives it), multiplayer (only online), missing (the
 * remake does not yet), unbuilt_original (nothing in Tiny Speck's game gave it
 * to players either). Each row was read from the code that applies the buff.
 */
const CAUSES = {
  ancestral_nostalgia: { say: 'Visiting the Ancestral Lands. It lasts as long as the visit may, and when it runs out you are sent back.', status: 'source' },
  too_much_nostalgia: { say: 'Being sent out of the Ancestral Lands when {buffs:ancestral_nostalgia} runs out. Until it ends you cannot go back.', status: 'source' },
  poisoners_guilt: { say: 'Pouring {potion_tree_poison} on a tree. Planting a bean eases it.', status: 'source' },
  a_too_guilty_mind: { say: 'Pouring {potion_tree_poison} on a tree again while {buffs:poisoners_guilt} still runs from a second poisoning.', status: 'source' },
  beta_item_cooldown: { say: 'Using {special_item_that_only_beta_testers_get}: any of its seven verbs.', status: 'source' },
  comedian: { say: 'One of the powers of {special_item_that_only_beta_testers_get}.', status: 'source' },
  sneezing_fit: { say: 'One of the powers of {special_item_that_only_beta_testers_get}.', status: 'source' },
  buff_buzzed: { say: 'Drinking {beer}.', status: 'source' },
  buff_hungover: { say: 'Comes after {buffs:buff_smashed} wears off.', status: 'source' },
  buff_remembering: { say: 'Gazing at {older_spice}.', status: 'source' },
  party_time: { say: 'Staying for the party of a lonely {people:street_spirit} until it ends.', status: 'source' },
  camera_recharging: { say: 'Choosing Forget it after your {camera} shows you another player’s Snap. It works where Snaps are, in multiplayer.', status: 'multiplayer' },
  charades: { say: 'Drinking a {potion_charades}. The other players on the street guess the secret word.', status: 'multiplayer' },
  chocolate_high: { say: 'Eating an egg of the egg hunt: {egghunt_egg_1}, {egghunt_egg_2}, {egghunt_egg_3}, {egghunt_egg_4} or {egghunt_egg_5}.', status: 'source' },
  sugar_crash: { say: 'Comes after {buffs:chocolate_high} wears off.', status: 'source' },
  full_of_pie: { say: 'Eating {pumpkin_pie}.', status: 'source' },
  smug_healthy_glow: { say: 'Eating {pepitas}.', status: 'source' },
  sugar_rush: { say: 'Eating candy: {birch_candy}, {corn_syrup_squares} or {carobish_treats}. Each more candy makes it last longer, until too much candy in a day gives you toothache instead.', status: 'source' },
  crab_state_of_mind: { say: 'Drinking {crabato_juice}.', status: 'source' },
  crazy_coin_collector: { say: 'Drinking an {potion_elixir_of_avarice}.', status: 'source' },
  feeling_called_love: { say: 'Drinking an {potion_amorous_philtre}.', status: 'source' },
  dont_get_caught: { say: 'Carrying {contraband} for a {people:npc_smuggler}. It ends when you hand it over.', status: 'source' },
  extremely_hallowed: { say: 'Sprinkling {extremely_hallowed_shrine_powder} near a shrine. Your next donation uses it up.', status: 'source' },
  fairly_hallowed: { say: 'Sprinkling {fairly_hallowed_shrine_powder} near a shrine. Your next donation uses it up.', status: 'source' },
  fecundity_cooldown: { say: 'Dispersing {powder_of_startling_fecundity}.', status: 'source' },
  glitch_train: { say: 'Following other players in a line of at least twenty.', status: 'multiplayer' },
  hog_tie: { say: 'Carrying a {hogtied_piggy} in your pack. Place it soon, or it gets away.', status: 'source' },
  piggy_capture_cooldown: { say: 'Capturing a {animals:npc_piggy}.', status: 'source' },
  its_so_hot: { say: 'Arriving in the desert of {quests:tower_quest}.', status: 'source' },
  its_so_hot2: { say: 'The desert of {quests:tower_quest} getting hotter as the quest goes on.', status: 'source' },
  levitation_by_meditation: { say: 'Levitating with a {focusing_orb}.', status: 'source' },
  meditation_cooldown: { say: 'Meditating or levitating with a {focusing_orb}.', status: 'source' },
  no_no_powder: { say: 'Sniffing {no_no_powder}.', status: 'source' },
  no_no_powder_crash: { say: 'Comes after {buffs:no_no_powder} wears off. A second sniff in a day shortens it.', status: 'source' },
  please_wait: { say: 'Asking at the Bureaucratic Hall when no {people:npc_bureaucrat} can help you at once.', status: 'source' },
  pooped: { say: 'Running out of energy a second time in one game day: you can only croak once a day. It lasts until your energy is back up, or the new day.', status: 'source' },
  super_pooped: { say: 'Running out of energy again while {buffs:pooped}. It lasts until the new day.', status: 'source' },
  purple_journey: { say: 'Drinking {essence_of_purple}: a little later the journey takes you away.', status: 'source' },
  purpled_out: { say: 'Comes after {buffs:purple_journey} ends and you are back.', status: 'source' },
  rook_armor: { say: 'Imbibing {essence_of_rookswort}.', status: 'source' },
  rube_lure: { say: 'Imbibing {essence_of_rubeweed}.', status: 'source' },
  sneezing: { say: 'Another player scattering {sneezing_powder} near you.', status: 'multiplayer' },
  teleportation_cooldown: { say: 'Teleporting with energy, or with a {teleportation_script} that costs energy.', status: 'source' },
  moonwalk: { say: 'One of the powers of {special_item_that_only_beta_testers_get}.', status: 'source' },
  nekkid: { say: 'Wearing no coat, shirt, pants, dress or skirt.', status: 'source' },
  stuffed: { say: 'Eating more than your daily limit of food. It lasts until the new day.', status: 'source' },
  // Not in the remake yet: the original gave them.
  bad_mood: { say: 'Bumping into a {animals:npc_juju_bandit}: half the time it gives you this, half the time {buffs:real_bummer}.', status: 'missing' },
  real_bummer: { say: 'Bumping into a {animals:npc_juju_bandit}: half the time it gives you this, half the time {buffs:bad_mood}.', status: 'missing' },
  zen: { say: 'Getting all the energy meditation can give you in one game day. It lasts until the new day.', status: 'missing' },
  // Nothing in Tiny Speck's game gave these to players.
  arbito_bonus: { say: 'Nothing gave it: it only ever starts itself.', status: 'unbuilt_original' },
  crusher_invincibility: { say: 'Nothing gave it. A Crusher checks for it, but no code ever applied it.', status: 'unbuilt_original' },
  focused_meditation_cooldown: { say: 'Nothing gave it: the line that would have, after focused meditation, was switched off.', status: 'unbuilt_original' },
  rook_vulnerability_hug: { say: 'Nothing gave it. It was meant for fighting the Rook with an {emotional_bear}.', status: 'unbuilt_original' },
  rook_vulnerability_kiss: { say: 'Nothing gave it. It was meant for fighting the Rook with an {emotional_bear}.', status: 'unbuilt_original' },
  rook_wrath: { say: 'Nothing gave it: the line that gave it to everyone who fought off a Rook was switched off.', status: 'unbuilt_original' },
  rooked: { say: 'Being caught by a Rook. Tiny Speck switched this off: in the later game Rooks no longer caught players.', status: 'unbuilt_original' },
  rooked_recovery: { say: 'Was to follow {buffs:rooked}; the line that gave it was switched off.', status: 'unbuilt_original' },
  rainbow_run: { say: 'Was to be the clock of {quests:numismatic_hustle}; the line that gave it was switched off. The remake times that run without it.', status: 'unbuilt_original' },
  tickle_me_emo: { say: 'The timer of {quests:zero_mood}, a quest only Tiny Speck’s staff were offered.', status: 'unbuilt_original' },
};

/** The buff another buff's end applies (buffs.js ON_EXPIRE, powders, purple journey). */
const FOLLOWS = { buff_hungover: 'buff_smashed', sugar_crash: 'chocolate_high', no_no_powder_crash: 'no_no_powder', purpled_out: 'purple_journey', too_much_nostalgia: 'ancestral_nostalgia', super_pooped: 'pooped', a_too_guilty_mind: 'poisoners_guilt' };

const GERUND = { Activate: 'Activating', Munch: 'Munching', Imbibe: 'Imbibing', drink: 'Drinking', eat: 'Eating', munch: 'Munching' };
const COOLDOWN = /_cooldown$|^camera_recharging$/;
const QUEST_TIMERS = new Set([...QUEST_TIMER_BUFFS.map((r) => r.buff), 'tickle_me_emo']);
const ONLINE_QUESTS = new Set(['play_musicblocks']); // offered only in multiplayer (player verbs)

/** Tiny Speck's buff text, with the catalog's escaped quotes as plain quotes. */
const tidy = (s) => String(s || '').replace(/\\"/g, '"').trim();

function groupOf(id, b) {
  if (QUEST_TIMERS.has(id)) return 'Quest timers';
  if (COOLDOWN.test(id)) return 'Cooldowns';
  return b.isDebuff ? 'Debuffs' : 'Buffs';
}

/** Seconds as words: "50 seconds", "5 minutes", "4 hours (one game day)". */
export function durationWords(sec) {
  const s = Math.round(Number(sec) || 0);
  if (!s) return '';
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m} minute${m === 1 ? '' : 's'}${r ? ` ${r} seconds` : ''}`;
  }
  const h = Math.round((s / 3600) * 10) / 10;
  return `${fmt(h)} hour${h === 1 ? '' : 's'}${s === 14400 ? ' (one game day)' : ''}`;
}

function add({ add: addEntry, entries, items, itemIcon, picture }) {
  const buffs = JSON.parse(readFileSync(BUFFS_JSON, 'utf8'));
  // Street tsid -> { place key, name } for the winter streets.
  const streetOf = new Map();
  for (const x of entries.values()) if (x.section === 'places') for (const st of x.streets) streetOf.set(st.tsid, { key: x.key, place: x.name, name: st.name });

  // id -> [{ verb, keys: [...], anchor? } | { say }]
  const causes = new Map();
  const push = (id, c) => causes.set(id, [...(causes.get(id) || []), c]);
  const byBuff = new Map();
  for (const r of CONSUME_BUFFS) {
    const [cls, verb] = r.event.split(':');
    const k = `${r.buff}:${verb}`;
    if (!byBuff.has(k)) byBuff.set(k, { buff: r.buff, verb, keys: [] });
    byBuff.get(k).keys.push(`item:${cls}`);
  }
  for (const r of byBuff.values()) push(r.buff, { verb: GERUND[r.verb], keys: r.keys });
  const effects = new Map();
  for (const [cls, r] of Object.entries(BUFF_ITEM_CATALOG)) {
    push(r.buffId, { verb: GERUND[r.verb] || r.verb, keys: [`item:${cls}`] });
    effects.set(r.buffId, { hint: r.effectHint, message: r.message });
  }
  push(GANDLEVERY_MUNCH.buff, { verb: GERUND[GANDLEVERY_MUNCH.verb], keys: [`item:${GANDLEVERY_MUNCH.classTsid}`] });
  effects.set(GANDLEVERY_MUNCH.buff, { hint: GANDLEVERY_MUNCH.tooltip, message: GANDLEVERY_MUNCH.message });
  for (const r of QUEST_TIMER_BUFFS) push(r.buff, { quest: `quests:${r.quest}` });
  const winter = KUKUBEE_WINTER_TSIDS.filter((t) => t.startsWith('L') && streetOf.has(t)).map((t) => ({ ...streetOf.get(t), tsid: t }));
  push('kukubee_winter_negative', { winter });

  for (const [id, raw] of Object.entries(buffs)) {
    if (DEV_BUFFS.has(id)) continue;
    const hand = CAUSES[id];
    if (hand) push(id, { say: hand.say });
    const list = causes.get(id) || [];
    if (!list.length) throw new Error(`buff ${id}: nothing says what gives it (tools/encyclopedia/buffs.mjs CAUSES)`);
    let status = hand?.status || 'source';
    if (QUEST_TIMERS.has(id)) {
      const q = list.find((c) => c.quest)?.quest;
      if (ONLINE_QUESTS.has(q?.slice(7))) status = 'multiplayer';
    }
    const iconId = BUFF_ICONS[id] || raw.itemClass;
    const firstItem = list.flatMap((c) => c.keys || []).find((k) => k.startsWith('item:'))?.slice(5);
    const icon = (iconId && itemIcon(iconId)) || (firstItem && itemIcon(firstItem)) || picture('assets/ui/quest-book.webp');
    const e = addEntry('buffs', id, {
      name: tidy(raw.name), status, register: '', group: groupOf(id, raw), icon, desc: tidy(raw.desc),
      buff: { ...raw, causes: list, effect: effects.get(id) || null, tick: BUFF_TICK_MESSAGES[id] || '', end: BUFF_END_MESSAGES[id] || '', follows: FOLLOWS[id] || null },
    });
    if (!e) continue;
    const ref = (to, rel) => {
      const ok = to.startsWith('item:') ? items.has(to.slice(5)) : to.startsWith('buffs:') ? !DEV_BUFFS.has(to.slice(6)) && Boolean(buffs[to.slice(6)]) : entries.has(to);
      if (ok && !e.refs.some((r) => r.to === to && r.rel === rel)) e.refs.push({ to, rel });
    };
    for (const c of list) {
      for (const k of c.keys || []) ref(k, 'causes');
      if (c.quest) ref(c.quest, 'causes');
      for (const w of c.winter || []) ref(w.key, 'causes');
      for (const m of String(c.say || '').matchAll(/\{([a-z0-9_:]+)\}/g)) {
        const k = m[1].includes(':') ? m[1] : `item:${m[1]}`;
        if (!k.startsWith('buffs:')) ref(k, 'causes');
      }
    }
    if (FOLLOWS[id]) ref(`buffs:${FOLLOWS[id]}`, 'after');
  }
}

const IN_REMAKE = {
  source: 'In the remake: it comes the same way, and does what Tiny Speck’s buff did.',
  multiplayer: 'In the remake in multiplayer: what gives it needs other players.',
  missing: 'Not in the remake yet: nothing gives it to you here.',
  unbuilt_original: 'Never given in the original: Tiny Speck’s game has the buff, but nothing in it gave it to players.',
};

function page(e, P, { info, d, kit }) {
  const { band, sub, paras, entryHead } = kit;
  const b = e.buff;
  const name = (key) => (info(key) ? `<a href="${P.href(key)}">${esc(info(key).name)}</a>` : esc(d.nameOf(key) || key.slice(key.indexOf(':') + 1).replace(/_/g, ' ')));
  const linkFor = (id) => { const k = d.keyOf(id); return k ? P.href(k) : null; };
  const tiles = [];
  const seen = new Set();
  const tile = (key, sub = '', anchor = '') => { if (!seen.has(key) && info(key)) { seen.add(key); tiles.push(P.tile(key, { sub, anchor })); } };
  const lines = b.causes.map((c) => {
    if (c.verb) { c.keys.forEach((k) => tile(k)); return `${esc(c.verb)} ${orList(c.keys.map(name))}.`; }
    if (c.quest) { tile(c.quest, 'the quest'); return `The timer of ${name(c.quest)}: it starts when you take the quest, and the quest fails if it runs out first.`; }
    if (c.winter) {
      const where = c.winter.map((w) => `<a href="${P.href(w.key)}#${esc(w.tsid)}">${esc(w.name)}</a>, ${esc(w.place)}`);
      return `Being on a winter street${where.length ? ` (${where.join('; ')})` : ''} without ${name('buffs:kukubee_winter_positive')} running. Eating something hearty protects you; leaving the street ends it.`;
    }
    return esc(c.say).replace(/\{([a-z0-9_:]+)\}/g, (m, raw) => {
      const key = raw.includes(':') ? raw : `item:${raw}`;
      if (!key.startsWith('buffs:')) tile(key);
      return name(key);
    });
  });
  const after = [...d.entries.values()].filter((x) => x.section === 'buffs' && x.buff.follows === e.id).map((x) => P.tile(x.key, { sub: 'when it ends' }));
  const facts = [
    `<dt>Kind</dt><dd>${b.isDebuff ? 'Debuff' : 'Buff'}</dd>`,
    `<dt>Lasts</dt><dd>${b.duration ? esc(durationWords(b.duration)) : 'Until something ends it'}</dd>`,
    b.tickDuration ? `<dt>Works</dt><dd>every ${esc(durationWords(b.tickDuration))}</dd>` : '',
  ].filter(Boolean).join('\n            ');
  const talk = [
    b.effect?.message ? sub('When it starts', `<div class="ency-talk">${paras(tsHtml(b.effect.message, linkFor))}</div>`) : '',
    b.tick ? sub('While it lasts', `<div class="ency-talk">${paras(tsHtml(b.tick, linkFor))}</div>`) : '',
    b.end ? sub('When it ends', `<div class="ency-talk">${paras(tsHtml(b.end, linkFor))}</div>`) : '',
  ].filter(Boolean).join('\n        ');
  const hint = b.effect?.hint && e.status === 'source' ? `<p>${esc(b.effect.hint.replace(/\.?$/, '.'))}</p>` : '';
  return `${entryHead(e, P, { subline: esc(e.group.replace(/s$/, '')) })}
  <main>
    <section class="band cat-original" aria-labelledby="orig-h">
      <div class="wrap">
        <h2 id="orig-h">In Tiny Speck’s game</h2>
        <div class="cat-cols">
          <div>
            ${e.desc ? `<div class="cat-desc">${paras(tsHtml(e.desc, linkFor))}</div>` : '<p class="cat-muted">The game code gives it no description.</p>'}
            <p class="cat-source">From Tiny Speck’s game code.</p>
          </div>
          <dl class="cat-facts">
            ${facts}
          </dl>
        </div>
        ${talk}
      </div>
    </section>
${band('cause-h', 'What gives it to you', `<ul class="cat-list">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>\n        ${P.tiles(tiles)}`, { alt: true })}
${band('after-h', 'What comes after', P.tiles(after))}
${band('remake-h', 'In the remake', `<div class="cat-remake-body"><p class="cat-status-text">${IN_REMAKE[e.status]}</p>${hint}</div>`, { alt: true })}
  </main>`;
}

export const SECTION = {
  key: 'buffs', label: 'Buffs', one: 'buff', groupWord: 'Kind', sample: 'buffs:high_jumper', css: '',
  blurb: 'Every buff and debuff: what it does, how long it lasts and what gives it to you.',
  add, page,
};
