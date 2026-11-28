/**
 * G956 (Austin 2026-11-17): the Encyclopedia shows how long timed skills take,
 * a rank x best speed card table per skill package (tools/encyclopedia/skill-times.mjs),
 * on every skill page in it and every speed card's page. Every cell must be what
 * skillPackageDetails (the port of GSJS getSkillPackageDetails) returns.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SKILL_PACKAGES, skillPackageDetails } from '../public/js/skill-packages.js?v=bfb87281';
import { GSJS_SKILL_PACKAGES } from '../public/js/skill-bubbles.js?v=37f090eb';
import { miningProfile } from '../public/js/mining.js?v=7ecaa572';
import { pace, pacedSystemOf } from '../public/js/pace.js?v=c07dfbd8';
import { TIME_TABLES, cardsFor, learnedFor, paceNote, tablesForCard, tablesForSkill, timeText } from '../tools/encyclopedia/skill-times.mjs';

const pub = join(import.meta.dirname, '..', 'public');
const page = (section, id) => readFileSync(join(pub, 'encyclopedia', section, id, 'index.html'), 'utf8');
/** The "How long it takes" band of a page, or ''. */
const band = (html) => html.match(/<section[^>]*aria-labelledby="time-h">[\s\S]*?<\/section>/)?.[0] || '';
const rowOf = (html, name) => html.match(new RegExp(`<tr[^>]*><th scope="row">(?:<a [^>]*>|<strong>)?${name}(?:</a>|</strong>)?[\\s\\S]*?</tr>`))?.[0] || '';

describe('encyclopedia: how long timed skills take (G956)', () => {
  it('every cell, energy and tool wear is what skillPackageDetails gives, for every package sharing the table', () => {
    let cells = 0;
    for (const t of TIME_TABLES) {
      for (const id of t.ids) {
        for (const r of t.rows) {
          const base = skillPackageDetails(id, learnedFor(r.skill));
          assert.equal(base.skill, r.skill, `${id} ${r.skill}: the row applies`);
          assert.equal(r.energy, base.energy_cost ?? null, `${id} ${r.skill}: energy`);
          assert.equal(r.wear, base.tool_wear ?? null, `${id} ${r.skill}: tool wear`);
          r.cells.forEach((c, col) => {
            const d = skillPackageDetails(id, learnedFor(r.skill), cardsFor(t.cards, col));
            // The time the game takes: Glitch's, or at the remake's pace for a paced system (js/pace.js, G983).
            const system = pacedSystemOf(id);
            const game = (ms) => (system && ms ? pace(system, ms) : ms ?? null);
            assert.equal(c.duration, game(d.duration), `${id} ${r.skill} col ${col}: duration`);
            assert.equal(c.max, game(d.duration_max), `${id} ${r.skill} col ${col}: duration_max`);
            // Mining's cells are the swing the game runs (js/mining.js miningProfile).
            if (system === 'mining') assert.equal(c.duration, miningProfile(learnedFor(r.skill), id === 'mining' ? 'pick' : 'fancy_pick', cardsFor(t.cards, col)).durationMs, `${id} ${r.skill} col ${col}: the game's swing`);
            // Only the best card counts: owning just the column's card gives the same time.
            if (col) assert.equal(game(skillPackageDetails(id, learnedFor(r.skill), [t.cards[col - 1].id]).duration), c.duration, `${id} ${r.skill}: best card only`);
            cells += 1;
          });
        }
      }
    }
    assert.ok(cells > 150, `${cells} cells checked`);
  });

  it('covers every package whose time changes with rank or a speed card, and only those the original ran', () => {
    const want = Object.entries(SKILL_PACKAGES).filter(([id, p]) => {
      const rows = Object.values(p.skills || {});
      if (!rows.some((r) => r.duration)) return false;
      if (/never run|details only|test package/.test(GSJS_SKILL_PACKAGES[id] || '')) return false;
      const cards = Object.values(p.img_upgrades || {}).some((u) => u.duration_multiplier);
      return cards || new Set(rows.map((r) => `${r.duration}|${r.duration_max}`)).size > 1;
    }).map(([id]) => id).sort();
    assert.deepEqual(TIME_TABLES.flatMap((t) => t.ids).sort(), want);
    for (const id of ['mining', 'mining_fancypick', 'refining', 'gardening_harvest', 'ak_piggy_nibble', 'meditative_arts', 'jellisac_scooping']) assert.ok(want.includes(id), id);
    for (const id of ['bubbletuning', 'spicemilling', 'smelting', 'tinkering']) assert.ok(!want.includes(id), id);
  });

  it('Mining I-IV take 6, 4.2, 3 and 2.4 s here (a third of Glitch, G983), cut by Manic Mining I-III, and a Pick and a Fancy Pick share the table', () => {
    const [t] = tablesForSkill('mining_1');
    assert.deepEqual(t.ids, ['mining', 'mining_fancypick']);
    assert.equal(t.paced, 'mining');
    assert.deepEqual(t.rows.map((r) => r.cells.map(timeText)), [
      ['6 s', '5.4 s', '4.5 s', '3 s'], ['4.2 s', '3.78 s', '3.15 s', '2.1 s'], ['3 s', '2.7 s', '2.25 s', '1.5 s'], ['2.4 s', '2.16 s', '1.8 s', '1.2 s'],
    ]);
    assert.deepEqual(t.rows.map((r) => r.glitch), [20000, 14000, 10000, 8000], "Glitch's own times, for the note");
    const html = band(page('skills', 'mining_3'));
    assert.match(html, /<h3>Mining a rock with a Pick or a Fancy Pick<\/h3>/);
    assert.match(html, /A Pick and a Fancy Pick take the same time, energy and wear\./);
    assert.match(html, /These are the remake's times, about a third of Glitch's 20\/14\/10\/8 s/);
    assert.match(html, /Where a note says so, the remake runs the time faster than Glitch did\./);
    assert.match(rowOf(html, 'Mining III'), /^<tr class="ency-time-here">[\s\S]*<td class="num-col">3 s<\/td><td class="num-col">2\.7 s<\/td><td class="num-col">2\.25 s<\/td><td class="num-col">1\.5 s<\/td><td class="num-col">8<\/td><td class="num-col">1<\/td><\/tr>$/);
    assert.match(band(page('imagination', 'mining_time_2')), /<th scope="col" class="num-col ency-time-here"><span class="ency-time-with">with<\/span> <strong>Manic Mining II<\/strong>[\s\S]*It cuts the time by 25%\./);
  });

  it('only mining is paced: every other table keeps Glitch\'s times and has no pace note', () => {
    for (const t of TIME_TABLES) {
      if (t.ids.includes('mining')) continue;
      assert.equal(t.paced, null, t.ids.join());
      assert.equal(paceNote(t), '', t.ids.join());
      for (const r of t.rows) if (r.glitch) assert.equal(r.cells[0].duration, r.glitch, `${t.ids[0]} ${r.skill}`);
    }
  });

  it('draws each table on every skill page in it (its row marked) and every speed card page (its column marked)', () => {
    const skills = new Set(TIME_TABLES.flatMap((t) => t.rows.map((r) => r.skill)).filter((s) => s !== 'no_skill'));
    const cards = new Set(TIME_TABLES.flatMap((t) => t.cards.map((c) => c.id)));
    for (const s of skills) {
      const html = band(page('skills', s));
      assert.ok(html, `${s}: has the band`);
      for (const t of tablesForSkill(s)) {
        const block = html.slice(html.indexOf(`id="time-${t.ids[0]}"`));
        assert.ok(block, `${s}: table ${t.ids[0]}`);
        const name = block.match(/<tr class="ency-time-here"><th scope="row"><strong>([^<]+)<\/strong>/)?.[1];
        assert.ok(name, `${s}: its row is marked in ${t.ids[0]}`);
        const r = t.rows.find((x) => x.skill === s);
        const row = rowOf(block, name);
        for (const c of r.cells) assert.ok(row.includes(`>${timeText(c)}<`), `${s} ${t.ids[0]}: ${timeText(c)}`);
      }
    }
    for (const c of cards) {
      const html = band(page('imagination', c));
      assert.equal((html.match(/class="ency-time"/g) || []).length, tablesForCard(c).length, `${c}: one table per package`);
      assert.match(html, /<th scope="col" class="num-col ency-time-here">/, `${c}: its column is marked`);
    }
    // No other skill or card page has the band.
    for (const [section, has] of [['skills', skills], ['imagination', cards]]) {
      for (const id of readdirSync(join(pub, 'encyclopedia', section), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
        assert.equal(Boolean(band(page(section, id))), has.has(id), `${section}/${id}`);
      }
    }
  });

  it('says ranges, instant goes and longer meditation in plain words, with no em-dashes', () => {
    assert.match(band(page('skills', 'meditativearts_1')), /4 to 16 s[\s\S]*Where a time is a range, each go takes a random time inside it\./);
    assert.match(band(page('imagination', 'meditative_arts_focus_2')), /It makes each go last 50% longer\./);
    assert.match(band(page('imagination', 'jellisac_hands_speed_2')), /It takes the wait away\./);
    assert.match(band(page('skills', 'animalkinship_7')), />instant</);
    for (const s of ['mining_1', 'animalkinship_3', 'refining_2', 'light_green_thumb_2']) assert.ok(!band(page('skills', s)).includes('\u2014'), s);
  });
});
