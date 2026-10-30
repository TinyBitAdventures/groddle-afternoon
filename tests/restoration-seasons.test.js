/**
 * The restoration report's Seasons section: tools/restoration/seasons.mjs
 * writes it into public/restoration/data.json, and the site's src/Seasons.php
 * draws it, working out which season is on from the windows the data names.
 * These check that the data matches the game, that the PHP's "On now" agrees
 * with js/seasons.js day by day, and that every Try it link is a practice copy.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EGG_HUNT, SEASONS, SEASON_IDS, calendarSeasons, isDametimeZilloween } from '../public/js/seasons.js?v=fcb12a83';
import { dametimeParts } from '../public/js/game-day.js?v=3095e05b';
import { seasonsData } from '../tools/restoration/seasons.mjs';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const DAY = 86_400_000;

/** UTC noon of every day from 2026 to 2029: the same calendar date in every time zone from UTC-11 to UTC+11. */
const NOONS = [];
for (let t = Date.UTC(2026, 0, 1, 12); t < Date.UTC(2030, 0, 1); t += DAY) NOONS.push(t);

function php() {
  try {
    execFileSync('php', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Runs src/Seasons.php over a list of moments, returning its JSON answer. */
function runPhp(code, input) {
  const dir = mkdtempSync(join(tmpdir(), 'seasons-'));
  try {
    const file = join(dir, 'in.json');
    writeFileSync(file, JSON.stringify(input));
    const out = execFileSync('php', ['-d', 'date.timezone=UTC', '-r', `require ${JSON.stringify(join(SITE_DIR, 'src/Seasons.php'))}; $in = json_decode(file_get_contents(${JSON.stringify(file)}), true); ${code}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('restoration Seasons section (tools/restoration/seasons.mjs, Seasons.php)', () => {
  const data = seasonsData();

  it('is in public/restoration/data.json as the build writes it', () => {
    const built = JSON.parse(readFileSync(join(pub, 'restoration/data.json'), 'utf8'));
    assert.deepEqual(built.seasons, data, 'run node tools/build-restoration.mjs');
  });

  it('has a card for every dated season in js/seasons.js, then the all-year Egg Hunt, each with its own name, window and blurb', () => {
    assert.deepEqual(data.seasons.map((s) => s.id), [...SEASON_IDS, 'egg_hunt']);
    for (const s of data.seasons) {
      const src = SEASONS[s.id] || EGG_HUNT;
      assert.equal(s.label, src.label);
      assert.equal(s.window, src.window);
      assert.equal(s.blurb, src.blurb);
      assert.equal(s.icon.id, src.icon);
      assert.ok(data.status[s.status], `${s.id} status ${s.status}`);
      assert.equal(s.dametime, s.id === 'zilloween');
    }
  });

  it('shows only art that is in the build (CC0 item icons and badges)', () => {
    const files = [];
    for (const s of data.seasons) {
      files.push(s.icon.icon, s.icon.icon3x);
      for (const f of s.facts) for (const i of f.items) files.push(i.icon, i.icon3x);
      for (const b of s.badges) files.push(b.icon);
    }
    for (const f of files.filter(Boolean)) assert.ok(existsSync(join(pub, f)), f);
    for (const s of data.seasons) assert.ok(s.icon.icon && s.icon.icon.startsWith('/assets/sprites/icons/'), s.id);
  });

  it('names the season badges from achievements.json, keeping secret ones secret', () => {
    const achievements = JSON.parse(readFileSync(join(pub, 'assets/content/achievements.json'), 'utf8'));
    const by = Object.fromEntries(data.seasons.map((s) => [s.id, s]));
    for (const id of ['pumpkin_carver', 'lanternerer', 'mini_tricksy_treater', 'the_candyglitch', 'candy_muncher']) assert.ok(by.zilloween.badges.some((b) => b.id === id), id);
    assert.deepEqual(by.egg_hunt.badges.map((b) => b.id), ['collection_egg_hunter']);
    // The Egg Hunt is the source mechanic: Egg Plants, all year, never On now.
    assert.equal(by.egg_hunt.status, 'source');
    assert.deepEqual(by.egg_hunt.when, { kind: 'always' });
    assert.match(by.egg_hunt.facts[0].text, /Egg Plant once a game day for a 10% chance .* 15%, 20% and 30% with Light Green Thumb I, II and III\. Without the skill only 60% of pettings take/);
    assert.doesNotMatch(JSON.stringify(by.egg_hunt), /grass|Easter/);
    assert.equal(by.glitchmas.badges.some((b) => b.id === 'pop_star'), false, 'Pop Idol is a secret badge');
    assert.equal(by.glitchmas.secret, 1);
    for (const b of data.seasons.flatMap((s) => s.badges)) assert.equal(b.name, achievements[b.id].name);
  });

  it('opens each Try it link as a practice copy (the season on, or beside an Egg Plant), never the saved game', () => {
    const ecology = JSON.parse(readFileSync(join(pub, 'assets/content/street-ecology.json'), 'utf8')).streets;
    for (const s of data.seasons) {
      const url = new URL(s.play, 'https://groddle.localhost/restoration/');
      assert.equal(url.pathname, '/play/');
      assert.equal(url.searchParams.get('practice'), '1', s.id);
      assert.equal(url.searchParams.has('seasonautoplay'), false);
      if (s.id === 'egg_hunt') {
        assert.equal(url.searchParams.has('season'), false);
        assert.equal(url.searchParams.get('caredemo'), 'egg');
        assert.ok(ecology[url.searchParams.get('streetdemo')]?.counts?.trant_egg > 0, 'the street grows an Egg Plant');
      } else {
        assert.equal(url.searchParams.get('season'), s.id);
        assert.equal(url.searchParams.get('seasondemo'), '1');
      }
    }
  });

  it('writes our own words without em dashes', () => {
    const text = JSON.stringify(data);
    assert.doesNotMatch(text, /—/);
  });

  it('describes windows that match calendarSeasons on every day of four years', () => {
    // The same rules as Seasons.php onNow, run over the data.
    const on = (when, t) => {
      const d = new Date(t);
      if (when.kind === 'dates') {
        const v = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
        const a = when.from[0] * 100 + when.from[1];
        const b = when.to[0] * 100 + when.to[1];
        return a <= b ? v >= a && v <= b : v >= a || v <= b;
      }
      return null;
    };
    for (const t of NOONS) {
      const expected = calendarSeasons(t);
      for (const s of data.seasons.filter((x) => x.when.kind === 'dates')) assert.equal(on(s.when, t), expected.includes(s.id), `${s.id} ${new Date(t).toISOString().slice(0, 10)}`);
    }
  });

  it('marks On now in PHP exactly when the game turns a season on, and the all-year Egg Hunt never (Seasons.php, every day 2026 to 2029, and the Pi Day edges)', { skip: skipWithoutSite }, (t) => {
    if (!php()) return t.skip('no php on PATH');
    const piEdges = [2026, 2027].flatMap((y) => [-1, 0, 1].flatMap((h) => [Date.UTC(y, 2, 13, 12 + h), Date.UTC(y, 2, 15, 12 + h) - (h === 0 ? 1 : 0)]));
    const moments = [...NOONS, ...piEdges];
    const got = runPhp('$out = []; foreach ($in["t"] as $ms) { $ids = []; foreach ($in["seasons"] as $s) if (Groddle\\Minn\\Seasons::onNow($s["when"], (int) $ms, new DateTimeZone("UTC"))) $ids[] = $s["id"]; $out[] = $ids; } echo json_encode($out);', { t: moments, seasons: data.seasons });
    moments.forEach((ms, i) => {
      assert.deepEqual([...got[i]].sort(), [...calendarSeasons(ms)].sort(), new Date(ms).toISOString());
    });
  });

  it('knows when Ur\'s own calendar is in Zilloween, as isDametimeZilloween does (Seasons.php dametime)', { skip: skipWithoutSite }, (t) => {
    if (!php()) return t.skip('no php on PATH');
    const moments = [];
    for (let ms = Date.UTC(2026, 9, 1); ms < Date.UTC(2027, 3, 1); ms += 37 * 60_000) moments.push(ms);
    const got = runPhp('$out = []; foreach ($in["t"] as $ms) { $r = Groddle\\Minn\\Seasons::dametime($in["dt"], (int) $ms); $out[] = [$r["on"], $r["ms"]]; } echo json_encode($out);', { t: moments, dt: data.dametime });
    let changes = 0;
    moments.forEach((ms, i) => {
      const [on, left] = got[i];
      assert.equal(on, isDametimeZilloween(dametimeParts(ms)), new Date(ms).toISOString());
      // The time it names is when the state flips.
      assert.equal(isDametimeZilloween(dametimeParts(ms + left)), !on, `${new Date(ms).toISOString()} + ${left}`);
      assert.equal(isDametimeZilloween(dametimeParts(ms + left - 1)), on);
      if (i && got[i - 1][0] !== on) changes += 1;
    });
    assert.ok(changes >= 6, `Ur's Zilloween came and went ${changes} times in six months`);
  });

  it('draws a card per season with the report\'s pill, the On now mark and the play link (Seasons.php, Restoration.php)', { skip: skipWithoutSite }, () => {
    const drawn = readFileSync(join(SITE_DIR, 'src/Seasons.php'), 'utf8');
    for (const cls of ['season-grid', 'season-card', 'season-now', 'season-facts', 'season-badges', 'play-link', 'pill']) assert.match(drawn, new RegExp(`class="${cls}`), cls);
    assert.match(readFileSync(join(SITE_DIR, 'src/Restoration.php'), 'utf8'), /\$section\('seasons'.*Seasons::draw/);
    assert.match(readFileSync(join(SITE_DIR, 'style.css'), 'utf8'), /\.season-card \{/);
    assert.doesNotMatch(drawn, /\b(?:esc_html|esc_attr|get_option|wp_[a-z_]+)\(/, 'engine classes only');
  });
});
