/**
 * Writes public/restoration/data.json for the restoration walkthrough page
 * (public/restoration/index.html, served at /restoration/).
 *
 * The hand-kept part is tools/restoration/checklist.mjs. Everything else is
 * computed from the repo so the page stays honest: quests that can be played
 * solo, quest rooms built, badges with original art, the skills audit,
 * streets imported, recovered sounds, recipes, Imagination cards, street
 * projects, the seasons (tools/restoration/seasons.mjs), and the latest
 * additions from the git log.
 *
 *   node tools/build-restoration.mjs          write data.json
 *   node tools/build-restoration.mjs --check  exit 1 if data.json is stale
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { CHECKLIST, GROUPS, STATUS } from './restoration/checklist.mjs';
import { QUEST_ROOMS, BUILT_ROOMS } from '../public/js/quest-rooms/catalog.js';
import { skillAuditTable } from '../public/js/skill-tree.js';
import { HUB_MAP_STREETS } from '../public/js/hub-maps-data.js';
import { IMAGINATION_UPGRADES } from '../public/js/imagination-data.js';
import { remakeStatus } from '../public/js/imagination-remake.js';
import { SHOTS } from './restoration/shots.mjs';
import { playFor, playHref } from './restoration/play-links.mjs';
import { DESIGNERS, DESIGNER_LEVELS, TEXT_LEVELS } from './restoration/designer-levels.mjs';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js';
import { ROOM_NOTES } from './restoration/rooms.mjs';
import { parseQuestConversation } from '../public/js/quests.js';
import { seasonsData } from './restoration/seasons.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const json = (p) => JSON.parse(readFileSync(join(pub, p), 'utf8'));
const out = join(pub, 'restoration', 'data.json');

/** Page-relative path of a captured screenshot, or null until capture.mjs has run. */
export function shotPath(key) {
  return `shots/${key.replace(/^(room|level):/, '$1-')}.webp`;
}
function shotFile(key) {
  if (!SHOTS[key]) return null;
  return existsSync(join(pub, 'restoration', shotPath(key))) ? shotPath(key) : null;
}

/* ------------------------------------------------------------------ */
/* Quests                                                               */
/* ------------------------------------------------------------------ */

// soloReason -> how the page explains it.
const QUEST_BUCKETS = {
  playable: { label: 'Playable', note: 'Offered and finishable in the remake.' },
  job: { label: 'Street projects', note: 'Build-a-street jobs: counted under Street projects.' },
  building: { label: 'Still being rebuilt', note: 'Their rooms or systems are on the workbench.' },
  players: { label: 'Needed other players', note: 'Multiplayer races and favours between players.' },
  retired: { label: 'Retired before shutdown', note: 'Tests, removed features, broken or unreachable in the original.' },
  tutorial: { label: 'Tutorial island', note: 'The new-player experience, being rebuilt.' },
};
const REASON_BUCKET = {
  job: 'job',
  instance_unbuilt: 'building',
  feature_unbuilt: 'building',
  multiplayer: 'players',
  needs_other_players: 'players',
  newxp_tutorial: 'tutorial',
  removed_or_test: 'retired',
  removed_feature: 'retired',
  incomplete_in_source: 'retired',
  broken_in_source: 'retired',
  unreachable_in_source: 'retired',
};

function questStats() {
  const catalog = Object.values(json('assets/content/quests.json'));
  const buckets = Object.fromEntries(Object.keys(QUEST_BUCKETS).map((k) => [k, 0]));
  for (const q of catalog) {
    const bucket = q.solo ? 'playable' : REASON_BUCKET[q.soloReason] || 'retired';
    buckets[bucket] += 1;
  }
  const nonJob = catalog.filter((q) => !q.isJob);
  return {
    total: catalog.length,
    story: nonJob.length,
    playable: buckets.playable,
    buckets: Object.entries(QUEST_BUCKETS).map(([id, b]) => ({ id, ...b, count: buckets[id] })),
  };
}

/* ------------------------------------------------------------------ */
/* Quest rooms                                                          */
/* ------------------------------------------------------------------ */

const ROOM_TITLES = {
  rainbow_run: 'Rainbow Run', top_of_tree: 'The High Jumper', juju_camp: 'Carry That Weight',
  vision_quest: 'Vision Quest', le_miserable: 'Le Misérable', kids_room: "Mr. Block's playroom",
  an_autumn_day: 'An Autumn Day', esquibeth: 'The Last Pilgrimage of Esquibeth', being_watched: 'Being Watched',
  back_alley: "We're Off to See the Lizard", rube_yard: 'The Wrizzards and The Rube', mental_block: 'Mental Block',
  color_unblocking: 'Color Unblocking', light_perspective: 'Walk Toward the Light', radiant_glare: 'Radiant Glare',
  picto_pattern: 'Picto-Pattern', tile_puzzle: 'An Old Fashioned B&E', clubhouse: 'Join the Club',
  operation_grow: 'Operation: Grow', gwendolyn: "Gwendolyn's Task", penalty: 'Smuggle the Smuggler',
};

function roomStats() {
  const quests = json('assets/content/quests.json');
  const rooms = new Map();
  for (const [questId, roomId] of Object.entries(QUEST_ROOMS)) {
    if (!rooms.has(roomId)) rooms.set(roomId, { id: roomId, title: ROOM_TITLES[roomId] || roomId, quests: [] });
    rooms.get(roomId).quests.push(quests[questId]?.title || questId);
  }
  const firstQuest = Object.fromEntries(Object.entries(QUEST_ROOMS).reverse().map(([q, room]) => [room, q]));
  const list = [...rooms.values()].map((r) => {
    // The original offer's opening line, as the quest-giver said it.
    const offer = parseQuestConversation(quests[firstQuest[r.id]]?.offer || '')[0]?.text || '';
    const hd = `shots/hd/room-${r.id}.webp`;
    return {
      ...r,
      quests: [...new Set(r.quests)],
      built: BUILT_ROOMS.includes(r.id),
      shot: shotFile(`room:${r.id}`),
      play: BUILT_ROOMS.includes(r.id) ? playFor(`room:${r.id}`) : null,
      hd: existsSync(join(pub, 'restoration', hd)) ? hd : null,
      offer: offer.length > 420 ? `${offer.slice(0, 417).replace(/\s+\S*$/, '')}…` : offer,
      note: ROOM_NOTES[r.id] || null,
    };
  });
  list.sort((a, b) => Number(b.built) - Number(a.built) || a.title.localeCompare(b.title));
  return { total: list.length, built: list.filter((r) => r.built).length, rooms: list };
}

/* ------------------------------------------------------------------ */
/* Everything else                                                      */
/* ------------------------------------------------------------------ */

function badgeStats() {
  const catalog = Object.keys(json('assets/content/achievements.json'));
  const official = Object.keys(json('assets/content/badge-icons.json')).length;
  const reimagined = Object.keys(json('assets/content/badge-icons-generated.json')).length;
  return { total: catalog.length, officialArt: official, reimaginedArt: reimagined };
}

function skillStats() {
  const table = skillAuditTable();
  const counts = {};
  for (const row of table) counts[row.status] = (counts[row.status] || 0) + 1;
  return { total: table.length, counts };
}

function streetStats() {
  const index = json('assets/streets/index.json').streets;
  // Rebuilt rooms (js/tower-rooms.js) sit in the index but are not archive imports.
  const imported = Object.keys(index).filter((t) => !index[t].reconstructed);
  const mapped = new Set(Object.values(HUB_MAP_STREETS).flat());
  return {
    imported: imported.length,
    onMaps: mapped.size,
    onMapsImported: imported.filter((t) => mapped.has(t)).length,
    hubs: new Set(imported.map((t) => index[t].hubId).filter(Boolean)).size,
  };
}

function soundStats() {
  const { counts, keys } = json('assets/content/sound-keys.json');
  const ambient = readdirSync(join(pub, 'assets/audio/ambient')).filter((f) => f.endsWith('.mp3')).length;
  // Ringtone-set music (Musicblocks, Goodnight Groddle, Round Two in Seven ...) installed under sfx/.
  const archiveMusic = Object.values(keys).filter((r) => r.origin === 'archiveorg-sfx' && r.category === 'music'
    && r.archiveItem === 'esquebeth-quest').length;
  return {
    // Keys the final client could play: those whose every call site is commented
    // out (trumpet, TALK_FROG, CRAFTYBOT_IDLE_1) are not counted (build-sound-keys.mjs).
    keys: counts.live ?? counts.keys,
    deadKeys: counts.dead || 0,
    withFile: counts.withFile,
    playable: counts.playable,
    recoveredWayback: counts.recoveredWayback,
    archiveorgSfx: counts.archiveorgSfx,
    ambientTracks: ambient,
    musicTracks: ambient + archiveMusic,
  };
}

function recipeStats() {
  const recipes = Object.keys(json('assets/content/recipes.json')).length;
  const skipped = json('assets/content/recipes-skipped.json').skipped.length;
  return { imported: recipes, skipped };
}

function iconStats() {
  const files = readdirSync(join(pub, 'assets/sprites/icons')).filter((f) => f.endsWith('.png'));
  return { items: files.filter((f) => !f.includes('@3x')).length, sharp: files.filter((f) => f.includes('@3x')).length };
}

function imaginationStats() {
  const ids = Object.keys(IMAGINATION_UPGRADES);
  const counts = {};
  for (const id of ids) {
    const s = remakeStatus(id).status;
    counts[s] = (counts[s] || 0) + 1;
  }
  return { total: ids.length, counts };
}

function jobStats() {
  const { counts } = json('assets/content/street-jobs.json');
  return { sourceJobs: counts.sourceJobs, playableJobs: counts.playableJobs, offeringStreets: counts.offeringStreets };
}

function gitStats() {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  try {
    const commits = Number(git('rev-list', '--count', 'HEAD'));
    const first = git('log', '--reverse', '--format=%cs', '--max-parents=0', 'HEAD').split('\n')[0];
    // Player-visible additions and fixes, newest first.
    const recent = git('log', '-60', '--format=%cs\t%s')
      .split('\n')
      .map((line) => line.split('\t'))
      .filter(([, s]) => /^(📦 NEW|👌 IMPROVE|🐛 FIX):/u.test(s || ''))
      .slice(0, 24)
      .map(([date, subject]) => {
        const [, kind, text] = /^(📦 NEW|👌 IMPROVE|🐛 FIX):\s*(.*)$/u.exec(subject);
        return { date, kind: { '📦 NEW': 'new', '👌 IMPROVE': 'improve', '🐛 FIX': 'fix' }[kind], text };
      });
    return { commits, since: first, recent };
  } catch {
    return { commits: 0, since: '', recent: [] };
  }
}

/**
 * Every player-visible change (📦 NEW, 👌 IMPROVE, 🐛 FIX commits), newest first, with each commit's
 * "- " bullets, for /restoration/history/. Written to history.json beside data.json; it is all git
 * metadata, so --check ignores it like the git block.
 */
export function historyLog() {
  try {
    const raw = execFileSync('git', ['log', '--format=%h%x1f%cs%x1f%s%x1f%b%x1e'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const kinds = { '📦 NEW': 'new', '👌 IMPROVE': 'improve', '🐛 FIX': 'fix' };
    const changes = [];
    for (const rec of raw.split('\x1e')) {
      const [hash, date, subject, body = ''] = rec.replace(/^\n+/, '').split('\x1f');
      const m = /^(📦 NEW|👌 IMPROVE|🐛 FIX):\s*(.*)$/u.exec(subject || '');
      if (!m) continue;
      const details = body.split('\n').filter((l) => /^- /.test(l)).map((l) => l.slice(2).trim()).filter(Boolean);
      changes.push({ hash, date, kind: kinds[m[1]], text: m[2].trim(), details });
    }
    return { since: changes.length ? changes[changes.length - 1].date : '', changes };
  } catch {
    return { since: '', changes: [] };
  }
}

function testFileCount() {
  return readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.js')).length;
}

/* ------------------------------------------------------------------ */
/* Checklist                                                            */
/* ------------------------------------------------------------------ */

function checklist() {
  return CHECKLIST.map((item) => ({
    id: item.id,
    group: item.group,
    name: item.name,
    status: item.status,
    blurb: item.blurb,
    spot: item.spot || null,
    evidence: item.evidence.filter((p) => existsSync(join(root, p))),
    shot: shotFile(item.id),
    play: item.status === 'lost' ? null : playFor(item.id),
  }));
}

/** Levels Tiny Speck's designers recorded, plus the text-only courses, with play links. */
function designerLevels() {
  const row = (l) => ({ ...l, route: undefined, play: playHref(l.route), shot: shotFile(l.shot) });
  return { designers: DESIGNERS, levels: DESIGNER_LEVELS.map(row), text: TEXT_LEVELS.map(row) };
}

export async function buildRestorationData() {
  await loadContentCatalogsFromDir(join(pub, 'assets/content'));
  const items = checklist();
  const tally = {};
  for (const it of items) tally[it.status] = (tally[it.status] || 0) + 1;
  // A checklist item counts as "back" when it is playable in any form.
  const back = items.filter((it) => ['source', 'rebuilt', 'reimagined', 'solo'].includes(it.status)).length;
  const possible = items.filter((it) => it.status !== 'lost').length;
  return {
    status: STATUS,
    groups: GROUPS,
    items,
    tally,
    back,
    possible,
    quests: questStats(),
    rooms: roomStats(),
    designers: designerLevels(),
    badges: badgeStats(),
    skills: skillStats(),
    streets: streetStats(),
    sounds: soundStats(),
    recipes: recipeStats(),
    icons: iconStats(),
    imagination: imaginationStats(),
    jobs: jobStats(),
    seasons: seasonsData(),
    git: gitStats(),
    tests: testFileCount(),
  };
}

/** Stable text, without the git block (that changes on every commit). */
export function comparable(data) {
  const { git, generatedAt, ...rest } = data;
  return JSON.stringify(rest);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = await buildRestorationData();
  if (process.argv.includes('--check')) {
    const current = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
    if (comparable(current) !== comparable(data)) {
      console.error('public/restoration/data.json is stale: run node tools/build-restoration.mjs');
      process.exit(1);
    }
    console.log('restoration data is current');
  } else {
    mkdirSync(dirname(out), { recursive: true });
    const now = new Date();
    data.generatedAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    writeFileSync(out, `${JSON.stringify(data, null, 1)}\n`);
    const history = historyLog();
    writeFileSync(join(pub, 'restoration', 'history.json'), `${JSON.stringify({ generatedAt: data.generatedAt, ...history })}\n`);
    console.log(`${data.back}/${data.possible} systems back · ${data.quests.playable} playable quests · ${data.rooms.built}/${data.rooms.total} rooms -> ${out}`);
    // The item catalog reads the same game data and the coverage inventory, so it is rebuilt with the report.
    execFileSync(process.execPath, [fileURLToPath(new URL('./catalog/build.mjs', import.meta.url))], { stdio: 'inherit' });
  }
}
