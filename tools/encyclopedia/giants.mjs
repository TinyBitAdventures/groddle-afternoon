/**
 * Giants (tools/encyclopedia/sections.mjs): one page per Giant, from
 * Tiny Speck's own words and the remake's shrines.
 *
 * Sources (read only):
 *  - GSJS config_base.js `giants` (the order) and `giants_info` (name,
 *    giant_of, desc, followers, personality, the skills listed for each):
 *    what the client's Giant screen showed.
 *  - GSJS achievements/first_<giant>_emblem.js status_text (what the Giant
 *    says with your first Emblem) and emblem_skill_unlock_<giant>_1.js (what
 *    spending it unlocks).
 *  - public/js/shrines.js (display names, emblem favor), giant-icons.js
 *    (Emblems to an Icon), giant-icons-data.js (the Emblem and Icon classes).
 *  - skills.json `giants` (primary and secondary Giant of each skill).
 *  - street-ecology.json `giantId`: the remake's streets with a shrine (read
 *    from each archived street's shrine), linked to the region pages that list them.
 *
 * Pictures: each Giant's portrait (the page's hero and its card in the section
 * list) is cut from Tiny Speck's CC0 Giants_All.ai by tools/giants/portraits.py
 * (assets/sprites/giant-portraits/, provenance in SOURCE.txt beside them). The
 * Giant's Icon stays its picture everywhere small: links, chips and search.
 *
 * The old /giants/ addresses answer a 301 to this section (the site repo's
 * src/MovedPages.php).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { GSJS } from '../catalog/build.mjs';
import { EMBLEM_FAVOR_COST, EMBLEM_FAVOR_INCREMENT, FAVOR_STUDY_SECONDS, GIANTS as REMAKE_GIANTS } from '../../public/js/shrines.js?v=21cad7cb';
import { ICONIZE_COUNT } from '../../public/js/giant-icons.js?v=0d6b4965';
import { GIANT_ICON_DATA } from '../../public/js/giant-icons-data.js?v=5026b09c';
import { esc, fmt, tsHtml } from './parts.mjs';

/** A `var name = <literal>;` from a GSJS file, evaluated alone in an empty context. */
export function gsjsVar(file, name) {
  const text = readFileSync(join(GSJS, file), 'utf8');
  const m = new RegExp(`^var ${name}\\s*=\\s*`, 'm').exec(text);
  if (!m) throw new Error(`${file}: no var ${name}`);
  const start = m.index + m[0].length;
  let end = start;
  if (text[start] === '"') {
    end += 1;
    while (text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
    end += 1;
  } else {
    const open = text[start];
    const close = { '{': '}', '[': ']' }[open];
    let depth = 0;
    let quote = null;
    for (; end < text.length; end++) {
      const c = text[end];
      if (quote) {
        if (c === '\\') end++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === open) depth++;
      else if (c === close && --depth === 0) { end++; break; }
    }
  }
  return vm.runInNewContext(`(${text.slice(start, end)})`, Object.create(null));
}

const iconOf = (g) => `assets/sprites/giant-icons/icon_${g === 'ti' ? 'tii' : g}.webp`;
export const portraitOf = (g) => `assets/sprites/giant-portraits/${g}.webp`;

function add({ add: addEntry, entries, items, picture, ecology }) {
  // Street tsid -> the region page that lists it.
  const placeOf = new Map([...entries.values()].filter((x) => x.section === 'places').flatMap((x) => x.streets.map((st) => [st.tsid, { place: x.key, tsid: st.tsid }])));
  const ids = gsjsVar('config_base.js', 'giants');
  const info = gsjsVar('config_base.js', 'giants_info');
  for (const id of ids) {
    const i = info[id];
    const remake = REMAKE_GIANTS[id];
    if (!i || !remake) throw new Error(`giant ${id}: missing from giants_info or js/shrines.js GIANTS`);
    const icons = GIANT_ICON_DATA[id];
    const shrines = Object.entries(ecology).filter(([, row]) => row.giantId === id)
      .map(([tsid, row]) => ({ name: row.label, ...(placeOf.get(`L${tsid.slice(1)}`) || placeOf.get(row.sourceTsid) || {}) }));
    const first = `achievements/first_${id}_emblem.js`;
    const unlock = `achievements/emblem_skill_unlock_${id}_1.js`;
    const e = addEntry('giants', id, {
      name: remake.name, status: 'source', register: '', group: 'Giants of Ur', icon: picture(iconOf(id)), portrait: picture(portraitOf(id)),
      desc: i.desc,
      giant: {
        giantOf: i.giant_of, followers: i.followers, personality: i.personality, listedSkills: Object.keys(i.skills || {}),
        firstEmblem: gsjsVar(first, 'status_text'), unlock: { name: gsjsVar(unlock, 'name'), desc: gsjsVar(unlock, 'desc'), text: gsjsVar(unlock, 'status_text') },
        emblem: icons?.emblemClass || `emblem_${id}`, iconItem: icons?.iconClass || `icon_${id}`, shrines,
      },
    });
    if (!e) continue;
    const ref = (to, rel) => { if (to.startsWith('item:') ? items.has(to.slice(5)) : entries.has(to)) e.refs.push({ to, rel }); };
    ref(`people:npc_shrine_${id}`, 'shrine');
    ref(`item:${e.giant.emblem}`, 'emblem');
    ref(`item:${e.giant.iconItem}`, 'icon');
  }
}

function page(e, P, { info, d, uniqBy, kit }) {
  const { band, sub, paras, entryHead } = kit;
  const g = e.giant;
  const linkFor = (id) => { const k = d.keyOf(id); return k ? P.href(k) : null; };
  const skills = Object.values(d.skills).filter((s) => s.giants?.[e.id] && info(`skills:${s.classTsid}`));
  const skillTiles = (primary) => skills.filter((s) => Boolean(s.giants[e.id].primary) === primary)
    .sort((a, b) => info(`skills:${a.classTsid}`).name.localeCompare(info(`skills:${b.classTsid}`).name, 'en', { numeric: true }))
    .map((s) => P.tile(`skills:${s.classTsid}`));
  const byPlace = new Map();
  for (const s of g.shrines) if (s.place) byPlace.set(s.place, [...(byPlace.get(s.place) || []), s]);
  const placeChips = [...byPlace].sort((a, b) => b[1].length - a[1].length || info(a[0]).name.localeCompare(info(b[0]).name))
    .map(([key, list]) => P.chip(`${esc(info(key).name)} <b>${fmt(list.length)}</b>`, { link: `${P.href(key)}#${esc(list[0].tsid)}`, cls: 'ency-place' }));
  const shrineTile = info(`people:npc_shrine_${e.id}`) ? P.tiles([P.tile(`people:npc_shrine_${e.id}`, { sub: 'the shrine' })]) : '';
  const regions = byPlace.size;
  const shrinesBody = g.shrines.length ? `<p class="ency-lead-small">${fmt(g.shrines.length)} streets in the remake have a shrine to ${esc(e.name)}, as their archived files place them, in ${fmt(regions)} region${regions === 1 ? '' : 's'} of the 2012 map.</p>${P.chips(placeChips)}${shrineTile}` : shrineTile;
  const items = ['emblem', 'iconItem'].map((k) => (info(`item:${g[k]}`) ? P.tile(`item:${g[k]}`, { sub: k === 'emblem' ? `for ${fmt(EMBLEM_FAVOR_COST)} favor` : `${fmt(ICONIZE_COUNT)} Emblems` }) : '')).filter(Boolean);
  const achs = [`achievements:first_${e.id}_emblem`, `achievements:emblem_skill_unlock_${e.id}_1`].filter((k) => info(k)).map((k) => P.tile(k));
  const favor = `<p>Donating at a shrine earns favor with its Giant. At ${fmt(EMBLEM_FAVOR_COST)} favor the shrine gives you an Emblem of ${esc(e.name)}, and each Emblem after that takes ${fmt(EMBLEM_FAVOR_INCREMENT)} favor more than the one before. ${fmt(ICONIZE_COUNT)} Emblems of one Giant make an Icon.</p>`;
  const others = uniqBy([...(d.back.get(e.key) || [])], (b) => b.from).filter((b) => !b.from.startsWith('giants:')).map((b) => P.tile(b.from));
  const hero = e.portrait ? P.img(e.portrait, 'cat-hero-icon ency-giant-portrait', 300, `Tiny Speck’s portrait of ${e.name}, Giant of ${g.giantOf}`) : '';
  return `${entryHead(e, P, { subline: esc(`Giant of ${g.giantOf}`), hero, frame: hero ? 'ency-giant-frame' : '' })}
  <main>
    <section class="band cat-original" aria-labelledby="orig-h">
      <div class="wrap">
        <h2 id="orig-h">In Tiny Speck’s game</h2>
        <div class="cat-cols">
          <div>
            <div class="cat-desc">${paras(tsHtml(e.desc, linkFor))}</div>
            <p class="cat-source">From Tiny Speck’s game code.${e.portrait ? ` The portrait is Tiny Speck’s own painting of ${esc(e.name)}.` : ''}</p>
          </div>
          <dl class="cat-facts">
            <dt>Giant of</dt><dd>${esc(g.giantOf)}</dd>
            <dt>Followers</dt><dd>${esc(g.followers)}</dd>
            <dt>Personality</dt><dd>${esc(g.personality)}</dd>
          </dl>
        </div>
        ${sub('With your first Emblem', `<div class="ency-talk">${paras(tsHtml(g.firstEmblem, linkFor))}</div>`)}
      </div>
    </section>
${band('shrines-h', 'Shrines', shrinesBody, { alt: true })}
${band('skills-h', `Skills ${esc(e.name)} favors`, [sub('The main Giant of', P.tiles(skillTiles(true))), sub('Also favors', P.tiles(skillTiles(false)))].filter(Boolean).join('\n        '), { lead: `Favor spent while you learn a skill buys study time: ${fmt(FAVOR_STUDY_SECONDS.p)} seconds a point with the skill’s main Giant, ${fmt(FAVOR_STUDY_SECONDS.s)} with a Giant who also favors it and ${fmt(FAVOR_STUDY_SECONDS.u)} with any other.` })}
${band('favor-h', 'Favor, Emblems and Icons', `${favor}${P.tiles(items)}${sub(`Spending your first Emblem: ${esc(g.unlock.name)}`, `<div class="ency-talk">${paras(tsHtml(g.unlock.text, linkFor))}</div>`)}${sub('Achievements', P.tiles(achs))}`, { alt: true })}
${band('rel-h', 'Linked to this Giant', P.tiles(others))}
${band('remake-h', 'In the remake', `<div class="cat-remake-body"><p class="cat-status-text">In the remake: shrines to ${esc(e.name)} take donations, give favor and Emblems, and favor spent with ${esc(e.name)} speeds up learning a skill.</p></div>`, { alt: true })}
  </main>`;
}

export const SECTION = {
  key: 'giants', label: 'Giants', one: 'giant', groupWord: 'Kind', sample: 'giants:alph', css: 'encyclopedia/sections.css',
  blurb: 'The eleven Giants of Ur: what each one is the Giant of, their shrines, the skills they favor and their Emblems and Icons.',
  // The section list shows each Giant's portrait, small.
  tilePic: (e) => (e.portrait ? { pic: e.portrait, size: 120, cls: 'ency-tile-portrait' } : null),
  add, page,
};
