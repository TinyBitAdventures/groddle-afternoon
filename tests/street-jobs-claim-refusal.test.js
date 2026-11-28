/**
 * #502: a Group Hall claim refused online (the group already owns a hall)
 * went back to the claim question, with the refusal only in a 3.2 s
 * toast. The hall box now says your claim is waiting, draws every refusal
 * the server can send in plain words, and says when the street did not
 * answer; a give's refusal stays under the asks (js/street-jobs-mp.js
 * HALL_REFUSALS, hallRefusalText, refusalFor, hallClaimNote; the panel in
 * features/street-jobs-feature.js renderHall and renderPanel).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serverPath, sitePath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';
import { HALL_REFUSALS, HALL_TEXT, MP_TEXT, hallClaimNote, hallRefusalText, refusalFor } from '../public/js/street-jobs-mp.js?v=ed23d5b4';

const root = join(import.meta.dirname, '..');
const feature = readFileSync(join(root, 'public/js/features/street-jobs-feature.js'), 'utf8');

/** The Go constants `projectTextX = "..."` across the server's files. */
function goTexts(files) {
  const out = {};
  for (const f of files) {
    const src = readFileSync(serverPath(f), 'utf8');
    for (const m of src.matchAll(/^\s*(projectText\w+)\s*=\s*"((?:[^"\\]|\\.)*)"/gm)) out[m[1]] = JSON.parse(`"${m[2]}"`);
  }
  return out;
}

/** The body of a Go method `func (m *projects) name(`. */
function goFunc(file, name) {
  const src = readFileSync(serverPath(file), 'utf8');
  const at = src.indexOf(`func (m *projects) ${name}(`);
  assert.ok(at >= 0, `${file} has ${name}`);
  const end = src.indexOf('\n}\n', at);
  return src.slice(at, end);
}

describe('#502 hall claim refusals in plain words', () => {
  it('says the group already has a hall and may own only one', () => {
    assert.equal(hallRefusalText('That group already owns a group hall.'), 'Your group already has a hall. A group can own only one.');
  });

  it('keeps an unknown refusal as it came, without markup, and words an empty one', () => {
    assert.equal(hallRefusalText('Something <b>new</b>.'), 'Something new.');
    assert.equal(hallRefusalText(''), HALL_REFUSALS['Could not claim']);
  });

  it('has a sentence for every text the server can send a claim', { skip: skipWithoutServer }, () => {
    const texts = goTexts(['projects.go', 'group_halls.go']);
    const used = new Set();
    for (const fn of ['claim', 'claimed']) for (const m of goFunc('group_halls.go', fn).matchAll(/\b(projectText\w+)\b/g)) used.add(m[1]);
    assert.ok(used.has('projectTextHasHall') && used.has('projectTextNotMember') && used.has('projectTextClaimCurrants'), [...used].join(' '));
    for (const name of used) {
      assert.ok(texts[name], `${name} has a text`);
      assert.ok(HALL_REFUSALS[texts[name]], `${name} ("${texts[name]}") is worded for the hall box`);
    }
  });

  it('covers every `why` the site gives a claim', { skip: skipWithoutSite || skipWithoutServer }, () => {
    const php = readFileSync(sitePath('src/LedgerHall.php'), 'utf8');
    const body = php.slice(php.indexOf('private function claim('), php.indexOf('private function own('));
    const whys = [...body.matchAll(/'why' => '(\w+)'/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(whys)].sort(), ['currants', 'member', 'owns']);
    const claimed = goFunc('group_halls.go', 'claimed');
    for (const why of whys) assert.match(claimed, new RegExp(`case "${why}":`), `the server words "${why}"`);
  });
});

describe('#502 which ask a refusal answers', () => {
  it('a waiting give first, else a waiting claim, else nothing', () => {
    assert.deepEqual(refusalFor({ giving: { job: '12' }, claiming: { job: '690' } }), { kind: 'give', job: '12' });
    assert.deepEqual(refusalFor({ claiming: { job: '690' } }), { kind: 'claim', job: '690' });
    assert.equal(refusalFor({}), null);
  });
});

describe('#502 what the hall box says about your claim', () => {
  it('waits while your claim is out', () => {
    assert.deepEqual(hallClaimNote({ jobId: '690', claiming: { job: '690' } }), { kind: 'pending', text: HALL_TEXT.yourClaim });
  });
  it('draws the refusal for this hall only', () => {
    const note = { kind: 'claim', job: '690', text: hallRefusalText('That group already owns a group hall.') };
    assert.deepEqual(hallClaimNote({ jobId: '690', note }), { kind: 'refused', text: note.text });
    assert.equal(hallClaimNote({ jobId: '691', note }), null);
    assert.equal(hallClaimNote({ jobId: '690', note: { ...note, kind: 'give' } }), null);
  });
  it('has words for the street saying nothing', () => {
    assert.match(HALL_TEXT.noAnswer, /didn't answer/);
    assert.match(MP_TEXT.noAnswer, /didn't answer/);
  });
});

describe('#502 the panel draws the notes', () => {
  it('renderHall shows the pending claim and the refusal before the form', () => {
    const hall = feature.slice(feature.indexOf('function renderHall('), feature.indexOf('/** The groups a claim may name'));
    assert.match(hall, /hallClaimNote\(/);
    assert.ok(hall.indexOf("sjHallNote: 'pending'") < hall.indexOf('if (hall?.claiming)'), 'your own claim before the row');
    assert.match(hall, /sjHallNote: 'refused'/);
  });
  it('the error keeps the note for its ask, and the waits that run out leave one', () => {
    assert.match(feature, /const owner = refusalFor\(s\);/);
    assert.match(feature, /text: HALL_TEXT\.noAnswer/);
    assert.match(feature, /text: MP_TEXT\.noAnswer/);
    assert.match(feature, /data-sj-note/);
  });
});
