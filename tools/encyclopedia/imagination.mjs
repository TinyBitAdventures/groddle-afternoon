/**
 * Imagination upgrades (tools/encyclopedia/sections.mjs): one page per card
 * the remake has, with Tiny Speck's card text, its cost, what it needs and
 * what it opens, and what it does in the remake.
 *
 * Sources (read only):
 *  - public/js/imagination-data.js (built from GSJS inc_data_imagination.js):
 *    name, desc, cost, chance, max_uses, conditions, card art, option tiers.
 *  - public/js/imagination.js: the tutorial cards, the price rules of the
 *    option and keepable cards, the secret cards the remake deals.
 *  - public/js/imagination-remake.js remakeStatus: what each card does in the
 *    remake (the same note the Imagination panel shows under "In this remake").
 *  - skills.json reqUpgrades: skills that need a card.
 * Card art: the game's own layers (assets/imagination/cards), stacked as the
 * Imagination panel draws them (features/imagination-feature.js frontLayers).
 */
import {
  BRAIN_CAPACITY_AMOUNTS, BRAIN_CAPACITY_LIMIT, DEALT_SECRET_CARDS, ENERGY_TANK_AMOUNTS, IMAGINATION_UPGRADES,
  JUMP_CARDS, QUOIN_MULTIPLIER_AMOUNTS, QUOIN_MULTIPLIER_LIMIT, SHUFFLE_CARD_COST, STARTER_UPGRADES, upgradeKind,
} from '../../public/js/imagination.js?v=6adb7b9a';
import { isOfferedInRemake, isOfferedOnline, remakeStatus } from '../../public/js/imagination-remake.js?v=c37ad887';
import { andList, esc, fmt } from './parts.mjs';

const ART = 'assets/imagination/cards/';
const CARD = { w: 230, h: 310 };

/** The remake's card status (imagination-remake.js) as an encyclopedia status (parts.mjs STATUS). */
const STATUS_OF = { live: 'source', starter: 'source', partial: 'partial', online: 'multiplayer', later: 'missing', multiplayer: 'missing', interface: 'missing', none: 'unbuilt_original' };

/** Our grouping, by the card's suit (imagination.js: the Your upgrades filter uses it too). */
const groupOf = upgradeKind;

/** A card's name without the amount the deal fills in ("Energy Tank +{amount}"). */
export const cardName = (u) => u.name.replace(/^Add \{amount\} To/, 'Add To').replace(/ (?:by |\+)?\{amount\}/, '').trim();

/** The card's front, layer on layer (bg, pattern, suit, art, icon), as the Imagination panel draws it. */
function cardArt(u, p, cls = 'ency-card-art') {
  const layers = ['bg', 'pattern', 'suit', 'art', 'icon'].filter((f) => u.config[f]).map((f) => `<img src="${p}${ART}${f}_${esc(u.config[f])}.svg" alt="" width="${CARD.w}" height="${CARD.h}" loading="lazy" decoding="async" />`);
  return `<span class="${cls}" aria-hidden="true">${layers.join('')}</span>`;
}

function add({ add: addEntry, entries, items, skills }) {
  const opens = new Map(); // card -> cards that need it
  for (const [id, u] of Object.entries(IMAGINATION_UPGRADES)) {
    for (const c of u.conditions) if (c.type === 3) opens.set(c.imagination_id, [...(opens.get(c.imagination_id) || []), id]);
  }
  for (const [id, u] of Object.entries(IMAGINATION_UPGRADES)) {
    const remake = remakeStatus(id);
    const e = addEntry('imagination', id, {
      name: cardName(u), status: STATUS_OF[remake.status] || 'missing', register: '', group: groupOf(u),
      icon: u.config.art ? { src: `${ART}art_${u.config.art}.svg`, ...CARD, hi: null } : null,
      desc: String(u.desc).replace(/\{amount\}/g, '…'), card: u, remake, opens: opens.get(id) || [],
      skillsOpened: Object.values(skills).filter((s) => (s.reqUpgrades || []).includes(id)).map((s) => s.classTsid),
    });
    if (!e) continue;
    const ref = (to, rel) => { if (to.startsWith('item:') ? items.has(to.slice(5)) : entries.has(to) || to.startsWith('imagination:')) e.refs.push({ to, rel }); };
    for (const c of u.conditions) {
      if (c.type === 3) ref(`imagination:${c.imagination_id}`, 'needs-card');
      if (c.type === 4) ref(`skills:${c.skill_id}`, 'needs-skill');
      if (c.type === 5) ref(`achievements:${c.achievement_id}`, 'after');
      if (c.type === 6) ref(`quests:${c.quest_id}`, 'after');
    }
    if (u.config.item_tsid) ref(`item:${u.config.item_tsid}`, 'gives');
  }
}

/** The price: a plain cost, or the option and keepable cards' own rules. */
function costHtml(id, u) {
  const ipt = (n) => `${fmt(n)} iMG`;
  if (id === 'keepable_reshuffle') return `<p>The price grows with your level: ${ipt(SHUFFLE_CARD_COST[0])} at level 5 and below, up to ${ipt(Math.max(...SHUFFLE_CARD_COST))}.</p>`;
  if (id === 'keepable_instant_resurrection') return '<p>A tenth of your largest energy tank, and at least 20 iMG.</p>';
  if (!u.options) return '';
  const what = { energy_tank: ['energy tank', 'point of energy', ENERGY_TANK_AMOUNTS], brain_capacity: ['brain capacity', 'skill', BRAIN_CAPACITY_AMOUNTS], quoin_multiplier: ['quoin multiplier', 'whole point', QUOIN_MULTIPLIER_AMOUNTS] }[id];
  if (!what) return '';
  const [stat, unit, amounts] = what;
  const keys = Object.keys(u.options).sort((a, b) => Number(a) - Number(b));
  const rows = keys.map((k, i) => {
    const sizes = u.options[k].chances.map((c, n) => (c ? amounts[n] : null)).filter((x) => x !== null && x !== undefined);
    const to = keys[i + 1] ? ` to ${fmt(Number(keys[i + 1]) - (id === 'quoin_multiplier' ? 0.25 : 1))}` : ' and up';
    return `<dt>${fmt(Number(k))}${to}</dt><dd>${ipt(u.options[k].cost_per)} a ${unit}; dealt as +${andList(sizes.map(fmt))}</dd>`;
  });
  const cap = id === 'brain_capacity' ? ` Your brain capacity tops out at ${fmt(BRAIN_CAPACITY_LIMIT)}.` : id === 'quoin_multiplier' ? ` The multiplier tops out at ${fmt(QUOIN_MULTIPLIER_LIMIT)}.` : '';
  return `<p>This card comes in sizes: the deal picks how much it adds, and the price per ${unit} rises with your ${stat}.${cap}</p><dl class="cat-facts">${rows.join('')}</dl>`;
}

function needs(u, P, info) {
  const lines = [];
  const tiles = [];
  const tileOr = (key, word, sub) => { if (info(key)) tiles.push(P.tile(key, { sub })); else lines.push(word); };
  for (const c of u.conditions) {
    if (c.type === 1) lines.push('Offered in the tutorial.');
    else if (c.type === 2) lines.push(`Level ${fmt(c.level)} or more.`);
    else if (c.type === 3) tileOr(`imagination:${c.imagination_id}`, `The ${esc(IMAGINATION_UPGRADES[c.imagination_id] ? cardName(IMAGINATION_UPGRADES[c.imagination_id]) : c.imagination_id)} card first.`, 'buy it first');
    else if (c.type === 4) tileOr(`skills:${c.skill_id}`, 'A skill first.', 'learn it first');
    else if (c.type === 5) tileOr(`achievements:${c.achievement_id}`, 'An achievement first.', 'earn it first');
    else if (c.type === 6) tileOr(`quests:${c.quest_id}`, 'A quest first.', 'finish it first');
    else if (c.type === 7) lines.push(`An energy tank of ${fmt(c.max_energy)} or more.`);
  }
  return { lines, tiles };
}

function remakeWords(id, e) {
  const { note } = e.remake;
  const deal = STARTER_UPGRADES.includes(id) ? 'You buy it in the tutorial.'
    : JUMP_CARDS.includes(id) ? 'You buy it in the tutorial, and the shop deals it later if you skipped it.'
      : e.card.is_secret && !DEALT_SECRET_CARDS.has(id) ? 'It was a secret card: the original game never dealt it.'
        : isOfferedInRemake(id) ? 'The shop deals it.'
          : isOfferedOnline(id) ? 'The shop deals it in multiplayer.'
            : 'The shop does not deal it yet.';
  const lead = { source: 'In the remake.', partial: 'Partly in the remake.', multiplayer: 'In multiplayer.', missing: 'Not in the remake yet.', unbuilt_original: 'Never finished in the original.' }[e.status];
  return `<p class="cat-status-text">${esc(lead)} ${esc(deal)}</p><p>${esc(note)}</p>`;
}

function page(e, P, { info, d, uniqBy, kit }) {
  const { band, sub, paras, entryHead } = kit;
  const u = e.card;
  const linkFor = (id) => { const k = d.keyOf(id); return k ? P.href(k) : null; };
  const { lines, tiles } = needs(u, P, info);
  const opens = e.opens.filter((id) => info(`imagination:${id}`)).map((id) => P.tile(`imagination:${id}`));
  const skills = e.skillsOpened.filter((s) => info(`skills:${s}`)).map((s) => P.tile(`skills:${s}`, { sub: 'needs this card' }));
  const item = u.config.item_tsid && info(`item:${u.config.item_tsid}`) ? P.tiles([P.tile(`item:${u.config.item_tsid}`, { sub: 'goes into your pack' })]) : '';
  const others = uniqBy([...(d.back.get(e.key) || [])].filter((b) => !b.from.startsWith('imagination:')), (b) => b.from).map((b) => P.tile(b.from));
  const cost = u.options || /^keepable_(reshuffle|instant_resurrection)$/.test(e.id) ? 'varies' : `${fmt(u.cost)} iMG`;
  return `${entryHead(e, P, { subline: esc(`Imagination upgrade · ${e.group}`), hero: cardArt(u, '../../../', 'ency-card-art ency-card-hero') })}
  <main>
    <section class="band cat-original" aria-labelledby="orig-h">
      <div class="wrap">
        <h2 id="orig-h">In Tiny Speck’s game</h2>
        <div class="cat-cols">
          <div>
            <div class="cat-desc">${paras([esc(e.desc)])}</div>
            <p class="cat-source">The card’s own words, from Tiny Speck’s game code.</p>
          </div>
          <dl class="cat-facts">
            <dt>Cost</dt><dd>${esc(cost)}</dd>
            <dt>In the deck</dt><dd>${u.options ? 'by size, see below' : `${fmt(u.chance)} cop${u.chance === 1 ? 'y' : 'ies'}`}</dd>
            <dt>Buy it</dt><dd>${u.max_uses ? 'once' : 'again and again'}</dd>
          </dl>
        </div>
        ${costHtml(e.id, u) ? sub('Price', costHtml(e.id, u)) : ''}
      </div>
    </section>
${band('needs-h', 'What it needs', `${lines.length ? `<ul class="cat-list">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}${P.tiles(tiles)}` || '<p class="cat-muted">Nothing: any player can be dealt it.</p>', { alt: true })}
${band('opens-h', 'What it opens', [sub('Cards', P.tiles(opens)), sub('Skills', P.tiles(skills)), sub('What you get', item)].filter(Boolean).join('\n        '))}
${band('rel-h', 'Linked to this card', P.tiles(others), { alt: true })}
${band('remake-h', 'In the remake', `<div class="cat-remake-body">${remakeWords(e.id, e)}</div>`)}
  </main>`;
}

export const SECTION = {
  key: 'imagination', label: 'Imagination upgrades', one: 'card', groupWord: 'Kind', sample: 'imagination:jump_triple_1', css: 'encyclopedia/sections.css',
  blurb: 'Every upgrade card: what it costs, what it needs, what it opens and what it does in the remake.',
  add, page,
};
