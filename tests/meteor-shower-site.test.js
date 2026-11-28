/**
 * Meteor showers from the console (ours, Austin 2026-11-27): the site's admin routes (groddle-afternoon-site
 * src/AdminSky.php, administrators only, each press logged), the console's Night sky panel (console/sky.js) and
 * its Activity log line (console/console.js meteorLogWords), and the realtime server's call and frame
 * (groddle-afternoon-server meteor.go: signed calls only, the event this game reads). The PHP runs through the php
 * CLI; the server's own tests (meteor_test.go) refuse unsigned calls on a live server.
 *
 * Run: GRODDLE_SITE_DIR=<site> GRODDLE_SERVER_DIR=<server> node --test tests/meteor-shower-site.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath, sitePath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs?v=00000000';
import { HAS_PHP, PHP } from './php.js?v=00000000';
import { METEOR, meteorEventOf } from '../public/js/meteor-shower.js?v=2eb3c0ed';
import { dametimeParts } from '../public/js/game-day.js?v=57fecfcb';
import { skyPhaseWeights } from '../public/js/sky-clock.js?v=dbd21266';

const skipPhp = skipWithoutSite || (!HAS_PHP && 'needs the php CLI');

function php(body, input = {}) {
  const code = `
    require ${JSON.stringify(SITE_DIR)} . '/src/AdminSky.php';
    use Groddle\\Minn\\AdminSky;
    $in = json_decode(stream_get_contents(STDIN), true);
    ${body}`;
  return JSON.parse(String(execFileSync(PHP, ['-r', code], { input: JSON.stringify(input) })));
}

describe('the site\'s admin routes (src/AdminSky.php)', { skip: skipPhp }, () => {
  const src = HAS_SITE ? readFileSync(sitePath('src/AdminSky.php'), 'utf8') : '';

  it('administrators only (manage_options, as every admin route), registered, each press logged', () => {
    assert.match(src, /#\[Route\(Method::Get, '\/groddle\/v1\/admin\/sky', policy: new Policy\(Access::Cap, self::ADMIN\)\)\]/);
    assert.match(src, /#\[Route\(Method::Post, '\/groddle\/v1\/admin\/meteor', policy: new Policy\(Access::Cap, self::ADMIN\)\)\]/);
    assert.match(src, /private const ADMIN = 'manage_options';/);
    assert.equal((src.match(/#\[Route\(/g) || []).length, 2, 'no other route');
    assert.match(src, /AdminConsole::recordAction\(\$this->minn->db, \$admin->id, 0, 'meteor', \$detail, \$delivery\);/);
    assert.match(src, /\(new RealtimeCall\(\$this->minn\)\)->post\('meteor', \$call\)/, 'the server is asked through the signed call');
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /new AdminSky\(\$minn\)/);
  });

  it('sends the server only a shower now or in 2 minutes, a lone star, or stop', () => {
    const calls = php(`echo json_encode(array_map(fn ($b) => AdminSky::callOf($b), $in['bodies']));`, {
      bodies: [{ op: 'shower' }, { op: 'shower', lead: 0 }, { op: 'shower', lead: 120 }, { op: 'star', lead: 120 }, { op: 'stop' },
        { op: 'shower', lead: 60 }, { op: 'shower', lead: '120' }, { op: 'fireworks' }, {}, 'shower'],
    });
    assert.deepEqual(calls, [{ op: 'shower', lead: 0 }, { op: 'shower', lead: 0 }, { op: 'shower', lead: 120 }, { op: 'star' }, { op: 'stop' }, null, null, null, null, null]);
  });

  it('reads the server\'s answer: live, busy, none or down; an event only when it is one', () => {
    const out = php(`echo json_encode([array_map(fn ($a) => AdminSky::deliveryOf($a), $in['answers']), AdminSky::eventOf($in['ev']), AdminSky::eventOf(['id' => '../x', 'kind' => 'shower'])]);`, {
      answers: [{ status: 'started' }, { status: 'stopped' }, { status: 'busy' }, { status: 'none' }, { status: 'refused' }, null],
      ev: { id: 'mt-0123456789abcdef', kind: 'shower', seed: 9, start: 1, dur: 200000, hint: true, extra: 'x' },
    });
    assert.deepEqual(out[0], ['live', 'live', 'busy', 'none', 'down', 'down']);
    assert.deepEqual(out[1], { id: 'mt-0123456789abcdef', kind: 'shower', seed: 9, start: 1, dur: 200000, hint: true });
    assert.equal(out[2], null);
  });

  it('Ur\'s clock and its sky match the game\'s (js/game-day.js, js/sky-clock.js)', () => {
    const times = [];
    for (let k = 0; k < 60; k++) times.push(Date.UTC(2026, 10, 27) + k * 247_013);
    const out = php(`echo json_encode(array_map(fn ($t) => AdminSky::urClock($t), $in['t']));`, { t: times });
    times.forEach((t, i) => {
      const p = dametimeParts(t);
      assert.deepEqual([out[i].hour, out[i].minute], [p.hour24, p.minute]);
      assert.equal(out[i].time, `${p.time} ${p.ampm}`);
      const w = skyPhaseWeights(p.hour24 + p.minute / 60);
      if (out[i].sky === 'night') assert.ok(w.night >= 0.99, JSON.stringify(w));
      if (out[i].sky === 'day') assert.ok(w.day >= 0.99, JSON.stringify(w));
    });
  });

  it('the console\'s words are plain, with no dashes', () => {
    const ev = { id: 'mt-0123456789abcdef', kind: 'shower', seed: 9, start: 1, dur: 210000, hint: true };
    const lines = php(`echo json_encode([
      AdminSky::text('shower', 0, 'live', 5, $in['ev']), AdminSky::text('shower', 120, 'live', 1, $in['ev']),
      AdminSky::text('star', 0, 'live', 0, null), AdminSky::text('stop', 0, 'live', 2, $in['ev']), AdminSky::text('stop', 0, 'none', 0, null),
      AdminSky::text('shower', 0, 'busy', 0, $in['ev']), AdminSky::text('shower', 0, 'down', 0, null)]);`, { ev });
    assert.equal(lines[0], 'A meteor shower is on for about 4 minutes (5 players online).');
    assert.match(lines[1], /starts in 2 minutes.*hint is out \(1 player online\)/);
    assert.match(lines[2], /lone shooting star.*nobody is online/);
    assert.match(lines[6], /not answering/);
    for (const l of lines) assert.doesNotMatch(l, /—|–/);
  });
});

describe('the console\'s Night sky panel (console/sky.js) and its log line', { skip: skipWithoutSite }, () => {
  it('four buttons on the Players tab; the showers ask first', async () => {
    const sky = await import(pathToFileURL(sitePath('console/sky.js')).href);
    assert.deepEqual(sky.PRESSES.map((p) => p.label), ['Meteor shower now', 'Meteor shower in 2 minutes (with hint)', 'Lone shooting star now', 'Stop shower']);
    assert.deepEqual(sky.PRESSES.map((p) => p.body), [{ op: 'shower', lead: 0 }, { op: 'shower', lead: 120 }, { op: 'star' }, { op: 'stop' }]);
    assert.deepEqual(sky.PRESSES.map((p) => Boolean(p.confirm)), [true, true, false, false]);
    const page = readFileSync(sitePath('src/AdminConsolePage.php'), 'utf8');
    assert.match(page, /sky\.js\?v=" \. self::SKY_ASSET_KEY/);
    assert.match(page, /SKY_ASSET_KEY = 'sky-2'/, 'moved on with the panel\'s words');
    const js = readFileSync(sitePath('console/sky.js'), 'utf8');
    assert.doesNotMatch(js, /6 to 12/, 'the shower is a streak every few seconds now (the game\'s METEOR.gapMinMs..gapMaxMs)');
    assert.ok(METEOR.gapMaxMs <= 5000);
    assert.doesNotMatch(js, /\u2014|\u2013/);
  });

  it('says what is on, how long is left, and how the sky looks now', async () => {
    const sky = await import(pathToFileURL(sitePath('console/sky.js')).href);
    const ev = { kind: 'shower', start: 100000, dur: 200000, hint: true };
    assert.deepEqual(sky.eventWords(null, 0), { text: 'Nothing in the sky now.', on: false });
    assert.deepEqual(sky.eventWords(ev, 20000), { text: 'A meteor shower starts in 1:20 (the hint is out).', on: true });
    assert.deepEqual(sky.eventWords(ev, 160000), { text: 'A meteor shower is on: 2:20 left.', on: true });
    assert.equal(sky.eventWords(ev, 300001).on, false);
    assert.equal(sky.eventWords({ kind: 'star', start: 0, dur: 6000 }, 1000).text, 'A lone shooting star is crossing the sky.');
    assert.deepEqual(sky.urClockAfter({ hour: 23, minute: 58, time: '11:58 PM', sky: 'night' }, 30000), { hour: 0, minute: 1, time: '12:01 AM', sky: 'night' });
    assert.equal(sky.urClockAfter({ hour: 12, minute: 0 }, 0).sky, 'day');
    assert.match(sky.skyWords('night'), /^Night/);
  });

  it('the Activity log names each press', async () => {
    const { logWords } = await import(pathToFileURL(sitePath('console/console.js')).href);
    const line = (detail, delivery = 'live') => logWords({ kind: 'meteor', detail, delivery, by: { id: 1, name: 'A' }, player: { id: 0, name: '' } });
    assert.equal(line({ op: 'shower', lead: 0, players: 3 }), 'started a meteor shower (3 players online)');
    assert.equal(line({ op: 'shower', lead: 120, players: 1 }), 'started a meteor shower in 2 minutes, with the hint (1 player online)');
    assert.equal(line({ op: 'star', players: 2 }), 'started a lone shooting star (2 players online)');
    assert.equal(line({ op: 'stop', players: 2 }), 'stopped the sky show (2 players online)');
    assert.equal(line({ op: 'stop' }, 'none'), 'tried to stop the sky show, but nothing was on');
    assert.equal(line({ op: 'shower', lead: 0 }, 'busy'), 'tried to start a meteor shower, but the sky was busy');
    assert.match(line({ op: 'star' }, 'down'), /not answering/);
  });
});

describe('the realtime server\'s call and frame (meteor.go)', { skip: skipWithoutServer }, () => {
  const go = HAS_SERVER ? readFileSync(serverPath('meteor.go'), 'utf8') : '';
  it('a signed console call only, never a socket kind but meteor_sync', () => {
    assert.match(go, /serviceHandlers\["meteor"\] = adminMeteor/);
    assert.match(go, /r\.Handle\("meteor_sync", /);
    assert.doesNotMatch(go, /r\.Handle\("meteor",/);
  });

  it('the server\'s lengths and seeds are the ones this game accepts', () => {
    const secs = (name) => Number(go.match(new RegExp(`${name}\\s*= (\\d+) \\* time\\.Second`))[1]) * 1000;
    assert.equal(secs('meteorShowerMin'), METEOR.showerMinMs);
    assert.equal(secs('meteorShowerMax'), METEOR.showerMaxMs);
    assert.equal(secs('meteorStarDur'), METEOR.starDurMs);
    const seedMax = Number(go.match(/meteorSeedMax\s*= (\d+)/)[1]);
    const frame = (kind, dur, seed) => ({ t: 'meteor', id: 'mt-0123456789abcdef', kind, seed, start: 1_800_000_000_000, dur, hint: false, now: 1_800_000_000_000 });
    for (const [kind, dur] of [['shower', METEOR.showerMinMs], ['shower', METEOR.showerMaxMs], ['star', METEOR.starDurMs]]) {
      for (const seed of [1, seedMax]) assert.ok(meteorEventOf(frame(kind, dur, seed)), `${kind} ${dur} ${seed}`);
    }
    assert.match(go, /"id": e\.ID, "kind": e\.Kind, "seed": e\.Seed, "start": e\.Start\.UnixMilli\(\), "dur": e\.Dur\.Milliseconds\(\), "hint": e\.Hint/);
  });
});
