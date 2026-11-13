/**
 * Feats and street projects (tools/encyclopedia/sections.mjs): one page per
 * Feat and one per street project phase, with goals, rewards and whether
 * they run solo, with other players or not yet.
 *
 * Sources (read only):
 *  - public/js/solo-feats.js SOLO_FEATS: the fifteen production Feats (title
 *    and vog_text are Tiny Speck's; goal, unit and `what` are the remake's
 *    personal goals), the Small Petrified Rock and the weekly reopening.
 *  - public/js/feats-mp.js: the shared Feat online (goals, MP_REWARD, the
 *    rock tiers by place, the turn order).
 *  - public/assets/content/street-jobs.json: the project phase classes
 *    (title, desc, completion, requirements, rewards, performance rewards
 *    and drop tables are Tiny Speck's), the jobs that use each (the street it
 *    builds, its region), the group halls (online only).
 *  - public/js/street-jobs.js SOLO_DIVISOR / soloNeed: the remake's amounts,
 *    1/50 of the original, solo and online (js/projects-tracker.js PROJECTS_TEXT).
 *
 * Words about the remake are ours. Refs: 'needs' and 'tool' (what a project
 * asks for), 'rewards' (items a Feat or project can give), 'epic' (the other
 * Feats of a Feat's epic, shown both ways on the Feat pages).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_WEEK_DAYS, GAME_WEEK_MS, REWARD_ITEM, SOLO_FEATS } from '../../public/js/solo-feats.js?v=7410af7d';
import { CIGAR_PLACES, LARGE_PLACES, MP_BONUS, MP_GOAL_SCALE, MP_ORDER, MP_REWARD, MP_SUPER, ROCK_LARGE, ROCK_MEDIUM, TOP_PLACES, mpGoals } from '../../public/js/feats-mp.js?v=62dfc05e';
import { CONTRIBUTION_BADGES, SOLO_DIVISOR, soloNeed } from '../../public/js/street-jobs.js?v=ba02a385';
import { esc, fmt, tsHtml } from './parts.mjs';

const PUB = join(import.meta.dirname, '..', '..', 'public');

/* -- Feats -------------------------------------------------------- */

/** Why a Feat is not in the remake, or runs only online: our words. */
const FEAT_WHY = {
  mihceal_conch: 'It counted Conch tunes played for other players. It is not wired for multiplayer yet.',
  graves_celebrating_mourning: 'It counted celebrating and mourning at other players’ graves, and the remake has no graves to visit yet.',
  inviting_friends: 'It counted friends invited into the game, which the remake has no way to do yet.',
  makeup_feat_1: 'What counted for it did not survive. The one incantation that did counts for The First Glimmer of the Giants’ Awakening instead.',
  visiting_stones: 'It counts packages left with a neighbour’s Butler, so it runs only in multiplayer, where neighbours have one.',
};
const FEAT_STATUS = { makeup_feat_1: 'lost' };
const featStatus = (f) => (f.wired ? 'source' : f.mp ? 'multiplayer' : FEAT_STATUS[f.id] || 'missing');

/** Achievements that count Feats (achievements.json conditions on feats and epics), in the order a player meets them. */
const FEAT_BADGES = ['feat_first', 'five_feat_under', 'feater_of_glory', 'featist_of_renown', 'super_featy', 'famous_featologist', 'quick_on_your_feat', 'down_to_the_wire'];
const EPIC_BADGES = ['epic_hero', 'epic_poet', 'epic_urian', 'covered_in_epic_win'];
const TOP_BADGES = ['order_of_the_third_otter', 'order_of_the_seventh_seal', 'the_cigar'];

/* -- Street projects ------------------------------------------------ */

const GROUP_FEATS = 'Feats';
const GROUP_WHOLE = 'Whole-street projects';
const GROUP_PHASES = 'Street project phases';
const GROUP_THEMED = 'Themed street projects';
const GROUP_TOWER = 'Jethimadh Tower';
const GROUP_UPGRADE = 'Street upgrades';
const GROUP_HALL = 'Group halls';

/** A project class's name and group (the classes that build a whole street title themselves "{job_location}"). */
function projectName(id, def) {
  let m;
  if ((m = /^job_standard(\d+b?)_for_new_streets$/.exec(id))) return { name: `New street, plan ${m[1]}`, group: GROUP_WHOLE };
  if ((m = /^job_standard(\d+b?)_for_new_firebog_streets$/.exec(id))) return { name: `New Firebog street, plan ${m[1]}`, group: GROUP_WHOLE };
  if (/^job_standard1_for_new_groddle_meadow_streets$/.test(id)) return { name: 'New Groddle Meadow street', group: GROUP_WHOLE };
  if (/_for_street_upgrades$/.test(id)) return { name: 'Upgrade a street to level 3', group: GROUP_UPGRADE };
  if (/^job_tower_/.test(id)) return { name: `Jethimadh Tower: ${def.title}`, group: GROUP_TOWER };
  if (/^job_street_mine_/.test(id)) return { name: `${def.title.replace(/ - pollo$/, '')} (Pollokoo)`, group: GROUP_THEMED };
  if (/^job_street_baq_/.test(id)) return { name: def.title, group: GROUP_THEMED };
  if (/^job_group_/.test(id)) return { name: `${def.title.replace(/_Group$/, '')} (group hall)`, group: GROUP_HALL };
  return { name: def.title, group: GROUP_PHASES };
}

/** Tiny Speck's project text with its placeholders filled for a reader who has not picked a street. */
const projectText = (s) => String(s || '')
  .replace(/, called <b>\{job_location\}<\/b>/g, '')
  .replace(/:\s*\{job_location\}/g, '')
  .replace(/ in \{job_location\}/g, '')
  .replace(/\{job_location\}/g, 'the new street')
  .replace(/\{job_participation\}%/g, 'all')
  .replace(/You did all of the work/g, 'You did all the work');

const gTsid = (t) => (String(t).startsWith('L') ? `G${t.slice(1)}` : t);
const lTsid = (t) => (String(t).startsWith('G') ? `L${t.slice(1)}` : t);

function add({ add: addEntry, entries, items }) {
  const has = (key) => (key.startsWith('item:') ? items.has(key.slice(5)) : entries.has(key));
  const refTo = (e, to, rel) => { if (to && has(to) && !e.refs.some((r) => r.to === to && r.rel === rel)) e.refs.push({ to, rel }); };

  /* Feats. */
  const epics = {};
  for (const f of SOLO_FEATS) if (f.epic_id) (epics[f.epic_id] ||= []).push(f.id);
  for (const f of SOLO_FEATS) {
    const e = addEntry('feats', f.id, {
      name: f.title, status: featStatus(f), register: '', group: GROUP_FEATS,
      icon: items.get(REWARD_ITEM)?.icon || null, desc: f.vog_text.replace(/\{remaining\}/g, 'more').replace(/\s+/g, ' '),
      feat: { ...f, epic: f.epic_id ? epics[f.epic_id] : [] },
    });
    if (!e) continue;
    if (f.wired || f.mp) refTo(e, `item:${REWARD_ITEM}`, 'rewards');
    if (MP_ORDER.includes(f.id)) { refTo(e, `item:${ROCK_MEDIUM}`, 'rewards'); refTo(e, `item:${ROCK_LARGE}`, 'rewards'); }
  }
  for (const f of SOLO_FEATS) {
    const e = entries.get(`feats:${f.id}`);
    for (const other of e?.feat.epic || []) if (other !== f.id) refTo(e, `feats:${other}`, 'epic');
  }

  /* Street projects: every playable phase class, then the group halls' own. */
  const catalog = JSON.parse(readFileSync(join(PUB, 'assets', 'content', 'street-jobs.json'), 'utf8'));
  const placeOf = new Map([...entries.values()].filter((x) => x.section === 'places').flatMap((x) => x.streets.map((st) => [st.tsid, x.key])));
  const usesOf = (jobs) => {
    const out = {};
    for (const job of Object.values(jobs || {})) {
      job.phases.forEach((p, i) => {
        const place = placeOf.get(lTsid(job.street)) || null;
        (out[p.classTsid] ||= []).push({ street: job.label, tsid: lTsid(job.street), place, hub: job.hub, kind: job.kind, phase: i + 1, of: job.phases.length });
      });
    }
    return out;
  };
  const uses = usesOf(catalog.jobs);
  const hallUses = usesOf(catalog.halls?.jobs);
  const classes = [
    ...Object.entries(catalog.classes).filter(([id, def]) => !def.excluded && uses[id]).map(([id, def]) => [id, def, false]),
    ...Object.entries(catalog.halls?.classes || {}).filter(([id]) => !catalog.classes[id] || catalog.classes[id].excluded).map(([id, def]) => [id, def, true]),
  ];
  // Phases that share a title get a letter each, in id order ("Feed the Crew (A)").
  const named = classes.map(([id, def, hall]) => ({ id, def, hall, ...projectName(id, def) }));
  const byName = new Map();
  for (const x of named) byName.set(x.name, [...(byName.get(x.name) || []), x]);
  for (const list of byName.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })).forEach((x, i) => { x.name = `${x.name} (${String.fromCharCode(65 + i)})`; x.twins = list.length; });
  }
  for (const x of named) {
    const def = x.def;
    const e = addEntry('feats', x.id, {
      name: x.name, status: x.hall ? 'multiplayer' : 'source', register: '', group: x.group,
      icon: items.get(def.requirements.find((r) => r.type === 'item')?.classId)?.icon || items.get('street_spirit')?.icon || null,
      desc: projectText(def.desc).replace(/<[^>]+>/g, ''),
      project: { def, hall: x.hall, twins: x.twins || 0, uses: (x.hall ? hallUses : uses)[x.id] || [], drops: catalog.drops },
    });
    if (!e) continue;
    for (const r of def.requirements) {
      if (r.type === 'item') refTo(e, `item:${r.classId}`, 'needs');
      else if (r.type === 'work') for (const t of r.classIds || [r.classId]) refTo(e, `item:${t}`, 'tool');
    }
    for (const table of def.performance?.dropTables || []) {
      for (const [, list] of catalog.drops[table]?.drops || []) for (const d of list) if (d.class_id) refTo(e, `item:${d.class_id}`, 'rewards');
    }
  }
}

/* -- Pages ------------------------------------------------------------ */

const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const hours = (ms) => Math.round(ms / 3_600_000);

function rewardChips(P, info, r, { scale = 1 } = {}) {
  const n = (v) => Math.round((v || 0) * scale);
  const out = [];
  if (n(r.xp)) out.push(P.chip(`${fmt(n(r.xp))} iMG`, { cls: 'ency-chip-xp' }));
  if (n(r.currants)) out.push(P.currants(n(r.currants), 'ency-chip'));
  if (n(r.mood)) out.push(P.chip(`${fmt(n(r.mood))} mood`));
  if (n(r.energy)) out.push(P.chip(`${fmt(n(r.energy))} energy`));
  for (const f of r.favor || []) {
    if (!n(f.points)) continue;
    if (f.giant === 'all') out.push(P.chip(`${fmt(n(f.points))} favor with every Giant`));
    else {
      const g = info(`giants:${f.giant}`);
      out.push(P.chip(`${fmt(n(f.points))} favor with ${esc(g?.name || f.giant)}`, { pic: g?.icon || null, link: g ? P.href(`giants:${f.giant}`) : null }));
    }
  }
  return out;
}

function featPage(e, P, { info, kit }) {
  const { band, sub, paras, entryHead } = kit;
  const f = e.feat;
  const goals = mpGoals(f.id);
  const vog = paras(tsHtml(f.vog_text.replace(/\{remaining\}/g, f.goal ? fmt(f.goal * (f.wired ? 1 : MP_GOAL_SCALE)) : 'so many').replace(/\s+/g, ' '), () => null));
  const tiles = (keys, sub2 = () => '') => keys.filter((k) => info(k)).map((k) => P.tile(k, { sub: sub2(k) }));
  const turns = MP_ORDER.length;

  const solo = f.wired ? `<ul class="cat-list">
          <li>Goal: ${esc(plural(f.goal, f.unit.replace(/s$/, ''), f.unit))}. ${esc(f.what)}</li>
          <li>Every solo Feat is open at once in a solo game. Reach the goal and you get a ${info(`item:${REWARD_ITEM}`) ? `<a href="${P.href(`item:${REWARD_ITEM}`)}">${esc(info(`item:${REWARD_ITEM}`).name)}</a>` : 'Small Petrified Rock'}.</li>
          <li>A finished Feat opens again one game week later (${fmt(GAME_WEEK_DAYS)} game days, ${fmt(hours(GAME_WEEK_MS))} real hours), for another rock.</li>
        </ul>${P.tiles(tiles([`item:${REWARD_ITEM}`], () => 'for each finished run'))}` : '';
  const online = goals ? `<ul class="cat-list">
          <li>One Feat runs for everyone playing for one real day, and the ${fmt(turns)} Feats take turns, so this one comes back every ${fmt(turns)} days.</li>
          <li>Goals: a minimum of ${fmt(goals.goal)} ${esc(f.unit)}, a bonus goal of ${fmt(goals.bonus)} and a supermegabonus goal of ${fmt(goals.super)}, counted from everyone’s contributions. A Feat that misses its minimum goal fails.</li>
          <li>When it meets its minimum, everyone who helped gets the rewards below, up to ${fmt(MP_SUPER)} times as much as more of the goals are met, and a Small Petrified Rock. The ${fmt(LARGE_PLACES)} biggest contributors also get a Large Petrified Rock, places ${fmt(LARGE_PLACES + 1)} to ${fmt(TOP_PLACES)} a Medium one, and places ${fmt(TOP_PLACES + 1)} to ${fmt(CIGAR_PLACES)} earn The Cigar.</li>
        </ul>${P.chips(rewardChips(P, info, MP_REWARD))}${P.tiles(tiles([`item:${REWARD_ITEM}`, `item:${ROCK_MEDIUM}`, `item:${ROCK_LARGE}`], (k) => (k.endsWith(REWARD_ITEM) ? 'everyone who helped' : k.endsWith(ROCK_LARGE) ? `places 1 to ${LARGE_PLACES}` : `places ${LARGE_PLACES + 1} to ${TOP_PLACES}`)))}` : '';
  const epic = f.epic.length ? `<p>One of ${plural(f.epic.length, 'Feat')} in the same epic. Contribute to every one of them to complete the epic.</p>${P.tiles(f.epic.filter((id) => id !== f.id).map((id) => P.tile(`feats:${id}`)))}` : '';
  const remake = e.status === 'source' ? 'In the remake: a personal goal in a solo game, and the shared Feat for everyone in multiplayer when its turn comes.'
    : e.status === 'multiplayer' ? `In multiplayer only. ${FEAT_WHY[f.id] || ''}`
      : `Not in the remake. ${FEAT_WHY[f.id] || ''}`;
  return `${entryHead(e, P, { subline: esc(`Feat${f.epic.length ? ' · part of an epic' : ''}`) })}
  <main>
    <section class="band cat-original" aria-labelledby="orig-h">
      <div class="wrap">
        <h2 id="orig-h">In Tiny Speck’s game</h2>
        <p>A Feat was a goal the whole world worked toward together, for one day. Each time you added to it, the game told you so:</p>
        <div class="ency-talk">${vog}</div>
        <p class="cat-source">From Tiny Speck’s game code. The goals did not survive: the remake sets its own.</p>
      </div>
    </section>
${band('solo-h', 'On your own', solo, { alt: true })}
${band('online-h', 'With other players', online)}
${band('epic-h', 'Epic', epic, { alt: true })}
${band('ach-h', 'Achievements', [sub('For Feats', P.tiles(tiles(FEAT_BADGES.map((a) => `achievements:${a}`)))), f.epic.length ? sub('For epics', P.tiles(tiles(EPIC_BADGES.map((a) => `achievements:${a}`)))) : '', goals ? sub('For the top contributors', P.tiles(tiles(TOP_BADGES.map((a) => `achievements:${a}`)))) : ''].filter(Boolean).join('\n        '))}
${band('remake-h', 'In the remake', `<div class="cat-remake-body"><p class="cat-status-text">${esc(remake)}</p></div>`, { alt: true })}
  </main>`;
}

function projectPage(e, P, { info, uniqBy, kit }) {
  const { band, sub, paras, entryHead } = kit;
  const { def, hall, uses, twins, drops } = e.project;
  const name = (key, fallback) => info(key)?.name || fallback;

  // What it needs: buckets in order, each bucket's groups in order (a bucket's next group opens once its group before is done).
  const later = (r) => (r.group > 1 ? [P.chip('after the earlier steps')] : []);
  const reqs = [...def.requirements].sort((a, b) => Number(a.bucket) - Number(b.bucket) || a.group - b.group);
  const steps = reqs.map((r) => {
    const need = soloNeed(r.num);
    const was = `${fmt(r.num)} in the original`;
    if (r.type === 'item') {
      return `<li><p class="ency-step-title">${esc(name(`item:${r.classId}`, r.desc))}: ${fmt(need)}</p>${P.tiles([P.tile(`item:${r.classId}`, { n: need, sub: was })])}${P.chips(later(r))}</li>`;
    }
    if (r.type === 'currants') return `<li><p class="ency-step-title">Currants: ${fmt(need)}</p>${P.chips([P.currants(need, 'ency-chip'), P.chip(esc(was)), ...later(r)])}</li>`;
    const tools = (r.classIds || [r.classId]).filter((t) => info(`item:${t}`)).map((t) => P.tile(`item:${t}`, { sub: 'tool' }));
    const chips = [P.chip(`${fmt(r.energy || 0)} energy a go`), r.wear ? P.chip(`${fmt(r.wear)} tool wear a go`) : '', P.chip(esc(was)), ...later(r)].filter(Boolean);
    if (r.skill && info(`skills:${r.skill}`)) chips.splice(1, 0, P.chip(`needs ${esc(info(`skills:${r.skill}`).name)}`, { pic: info(`skills:${r.skill}`).icon, link: P.href(`skills:${r.skill}`) }));
    const verb = String(r.verb || 'work');
    return `<li><p class="ency-step-title">${esc(verb[0].toUpperCase() + verb.slice(1))} ${fmt(need)} time${need === 1 ? '' : 's'}</p>${P.tiles(tools)}${P.chips(chips)}</li>`;
  });

  // Rewards.
  const r = def.rewards || {};
  const perf = def.performance || {};
  const perfChips = rewardChips(P, info, perf);
  const dropIds = uniqBy((perf.dropTables || []).flatMap((t) => (drops[t]?.drops || []).flatMap(([, list]) => list.filter((d) => d.class_id).map((d) => d.class_id))), (x) => x)
    .filter((id) => info(`item:${id}`));
  // The trophy pieces share one name per trophy: one tile for each name.
  const dropTiles = uniqBy(dropIds, (id) => info(`item:${id}`).name).map((id) => P.tile(`item:${id}`));
  const dropCurrants = (perf.dropTables || []).some((t) => (drops[t]?.drops || []).some(([, list]) => list.some((d) => d.currants)));
  const rewards = [
    `<p>Everyone who works on a phase shares its rewards by how much they put in. In the original the whole phase paid this much:</p>${P.chips(rewardChips(P, info, r))}`,
    `<p>With the remake’s amounts, doing the whole phase yourself pays a fiftieth of that:</p>${P.chips(rewardChips(P, info, r, { scale: 1 / SOLO_DIVISOR }))}`,
    perfChips.length || dropTiles.length ? sub('For the top contributors', `${P.chips(perfChips)}${dropTiles.length ? `<p class="ency-lead-small">And a roll for one of these${dropCurrants ? ', or a pile of currants' : ''}:</p>${P.tiles(dropTiles)}` : ''}`) : '',
  ].filter(Boolean).join('\n        ');

  // Where it is offered: the streets it helps build, by region.
  const byPlace = new Map();
  for (const u of uses) byPlace.set(u.place || `hub:${u.hub}`, [...(byPlace.get(u.place || `hub:${u.hub}`) || []), u]);
  const regionHtml = [...byPlace].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([key, list]) => {
    const region = info(key)?.name || list[0].hub;
    const chips = uniqBy(list, (u) => u.tsid).map((u) => P.chip(`${esc(u.street)}${u.of > 1 ? ` <b>${fmt(u.phase)} of ${fmt(u.of)}</b>` : ''}`, { link: u.place ? `${P.href(u.place)}#${esc(u.tsid)}` : null, cls: 'ency-place' }));
    return sub(info(key) ? `<a href="${P.href(key)}">${esc(region)}</a>` : esc(region), P.chips(chips));
  }).join('\n        ');
  const streets = new Set(uses.map((u) => u.tsid)).size;
  const kind = def.title.startsWith('Upgrade') ? 'upgrades' : 'builds';
  const whereLead = hall
    ? `Part of ${plural(streets, 'group hall')}: a group claims the hall, then has a limited time to finish it.`
    : kind === 'upgrades' ? `Part of the project that upgrades ${plural(streets, 'street')}. It is offered on the street it upgrades.`
      : `Part of the project that builds ${plural(streets, 'street')}. A Street Spirit on a street next door offers it, and the number after a street is this phase’s place among the project’s phases.`;

  const badges = CONTRIBUTION_BADGES.map(([id]) => `achievements:${id}`).filter((k) => info(k)).map((k) => P.tile(k));
  const twinNote = twins ? ` One of ${fmt(twins)} phases with this name, each asking for different things.` : '';
  const remake = hall
    ? 'In multiplayer: a group hall is built by a group of players together, online only.'
    : `In the remake, solo and online. Every amount is a fiftieth of the original’s (at least 1), because the original totals were sized for a whole server of players.${twinNote}`;
  const words = [
    `<div class="cat-desc">${paras(tsHtml(projectText(def.desc), () => null))}</div>`,
    def.completion ? sub('When it is done', `<div class="ency-talk">${paras(tsHtml(projectText(def.completion), () => null))}</div>`) : '',
  ].filter(Boolean).join('\n        ');
  return `${entryHead(e, P, { subline: esc(hall ? 'Group hall project · multiplayer' : e.group === GROUP_WHOLE || e.group === GROUP_UPGRADE ? 'Street project' : 'Street project phase') })}
  <main>
${band('needs-h', 'What it needs', `<ol class="ency-steps">${steps.join('\n          ')}</ol>`, { lead: 'The remake’s amounts. Work is done with any tool from its list, one go at a time; some steps open only once the steps before them are done.' })}
${band('rewards-h', 'Rewards', rewards, { alt: true })}
${band('where-h', 'Where it is offered', `<p class="ency-lead-small">${esc(whereLead)}</p>\n        ${regionHtml}`)}
${band('words-h', 'In Tiny Speck’s words', `${words}\n        <p class="cat-source">From Tiny Speck’s game code.</p>`, { alt: true })}
${band('ach-h', 'Achievements', P.tiles(badges), { lead: 'For working on many different project phases.' })}
${band('remake-h', 'In the remake', `<div class="cat-remake-body"><p class="cat-status-text">${esc(remake)}</p></div>`, { alt: true })}
  </main>`;
}

const page = (e, P, o) => (e.feat ? featPage(e, P, o) : projectPage(e, P, o));

export const SECTION = {
  key: 'feats', label: 'Feats and street projects', one: 'feat', groupWord: 'Kind', sample: 'feats:meditation_of_groddlocritus', css: '',
  blurb: 'The Feats the whole world worked on together, and the street projects that build new streets: their goals, what they need and what they give.',
  add, page,
};
