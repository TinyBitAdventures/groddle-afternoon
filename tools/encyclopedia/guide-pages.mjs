/**
 * #668: the "How do I…" pages, drawn from the guides (guides.mjs): one page per guide, the index of
 * them all, and the strip on the Encyclopedia's home. tools/encyclopedia/build.mjs wraps each in the
 * site's page frame (header nav, theme script and button) and writes it; encyclopedia/items/catalog.css
 * (the encyclopedia's shared sheet, "How do I…" block) styles them from the site's tokens, so light and
 * dark both work.
 */
import { GUIDES, HOW_PATH, HOW_TITLE, guideHtml, guidePlain, guideTexts, hrefOf, linksIn } from './guides.mjs';
import { esc, fmt, sep } from './parts.mjs';

const KICKER_HOME = 'Groddle Encyclopedia';

/** A part of a guide: its paragraphs, numbered steps or list, as HTML. */
function partHtml(part, ctx) {
  const line = (t) => guideHtml(t, ctx);
  return [
    ...(part.p || []).map((t) => `<p>${line(t)}</p>`),
    part.steps ? `<ol class="how-steps">${part.steps.map((t) => `<li>${line(t)}</li>`).join('')}</ol>` : '',
    part.list ? `<ul class="how-list">${part.list.map((t) => `<li>${line(t)}</li>`).join('')}</ul>` : '',
  ].filter(Boolean).join('\n        ');
}

/** The pages a guide links, in the order it first names them: entries as tiles, lists and pages as chips. */
function pagesUsed(g, ctx, P, p) {
  const seen = new Set();
  const keys = guideTexts(g).flatMap((t) => linksIn(t)).filter(({ key }) => !seen.has(key) && seen.add(key));
  const entryKinds = (key) => !/^(?:list|search|page|how):/.test(key);
  const tiles = keys.filter(({ key }) => entryKinds(key)).map(({ key }) => P.tile(key));
  const chips = keys.filter(({ key }) => /^(?:list|page):/.test(key)).map(({ key, words }) => {
    const l = key.startsWith('list:') ? ctx.lists.get(key.slice(5)) : null;
    const label = l ? l.title : words || key.slice(key.indexOf(':') + 1);
    return P.chip(esc(label), { pic: l?.icon ? { ...l.icon, hi: null } : null, link: `${p}${hrefOf(key, ctx.info)}` });
  });
  return [
    chips.length ? `<h3>Lists and pages</h3>\n        ${P.chips(chips)}` : '',
    tiles.length ? `<h3>In the encyclopedia</h3>\n        ${P.tiles(tiles)}` : '',
  ].filter(Boolean).join('\n        ');
}

/** Every guide page: [[slug, { title, description, body }]]. */
export function guidePages(ctx) {
  const p = '../../../';
  const P = ctx.makeParts(p, ctx.info, ctx.d.nameOf);
  const out = [];
  GUIDES.forEach((g, i) => {
    const prev = GUIDES[i - 1];
    const next = GUIDES[i + 1];
    const parts = g.parts.map((part, n) => `
    <section class="band${n % 2 ? ' band-alt' : ''} how-part" aria-labelledby="how-${n + 1}">
      <div class="wrap">
        <h2 id="how-${n + 1}">${esc(part.h)}</h2>
        ${partHtml(part, { ...ctx, p })}
      </div>
    </section>`).join('');
    const used = pagesUsed(g, ctx, P, p);
    const usedAlt = g.parts.length % 2 ? ' band-alt' : '';
    const body = `
  <header class="masthead note-head cat-head how-head">
    <div class="wrap">
      <div class="ency-entry-top">
      <p class="kicker"><a href="../../">${KICKER_HOME}</a> · <a href="../">${esc(HOW_TITLE)}</a></p>
      ${ctx.entrySearch('../../')}
      </div>
      <h1>${esc(g.question)}</h1>
      <p class="lead how-answer">${guideHtml(g.answer, { ...ctx, p })}</p>
    </div>
  </header>

  <main>${parts}
    <section class="band${usedAlt} ency-band how-pages" aria-labelledby="used-h">
      <div class="wrap">
        <h2 id="used-h">Pages this guide uses</h2>
        ${used}
      </div>
    </section>
    <nav class="band${usedAlt ? '' : ' band-alt'} note-after" aria-label="More guides">
      <div class="wrap">
        <div class="note-pager">
          ${prev ? `<a class="note-pager-older" href="../${esc(prev.slug)}/" rel="prev"><span>Previous${sep(':')}</span> ${esc(prev.short)}</a>` : '<span></span>'}
          ${next ? `<a class="note-pager-newer" href="../${esc(next.slug)}/" rel="next"><span>Next${sep(':')}</span> ${esc(next.short)}</a>` : '<span></span>'}
        </div>
        <p class="note-all"><a href="../">All ${fmt(GUIDES.length)} guides</a> · <a href="../../">Search the encyclopedia</a></p>
      </div>
    </nav>
  </main>
`;
    out.push([g.slug, { title: `${g.question} · Groddle Encyclopedia`, description: guidePlain(g.answer, ctx), body }]);
  });
  return out;
}

/** The index of every guide: { title, description, body }. */
export function guidesIndex(ctx) {
  const p = '../../';
  const P = ctx.makeParts(p, ctx.info, ctx.d.nameOf);
  const cards = GUIDES.map((g) => `<li><a class="ency-card how-card" href="${esc(g.slug)}/">${P.img(ctx.info(g.icon)?.icon, 'ency-card-ic', 64)}<span class="ency-card-text"><span class="ency-card-name">${esc(g.question)}</span> <span class="ency-card-blurb">${esc(guidePlain(g.answer, ctx))}</span></span></a></li>`);
  const body = `
  <header class="masthead note-head cat-head how-head">
    <div class="wrap">
      <div class="ency-entry-top">
      <p class="kicker"><a href="../">${KICKER_HOME}</a> · ${esc(HOW_TITLE)}</p>
      ${ctx.entrySearch('../')}
      </div>
      <h1>${esc(HOW_TITLE)}</h1>
      <p class="lead">Short answers to questions players have asked, from the game as it is today. Each guide links the pages, lists and streets it relies on.</p>
    </div>
  </header>

  <main class="band cat-main">
    <div class="wrap">
      <ul class="ency-cards how-cards">
        ${cards.join('\n        ')}
      </ul>
      <p class="note-all"><a href="../">Search the encyclopedia</a> · <a href="../streets/with/">Streets with…</a></p>
    </div>
  </main>
`;
  return { title: `${HOW_TITLE} · Groddle Encyclopedia`, description: `${fmt(GUIDES.length)} short guides to questions players ask about Groddle Afternoon: ${GUIDES.map((g) => g.short.toLowerCase()).join(', ')}.`, body };
}

/**
 * The guide cards on the Encyclopedia's home (Austin 2026-11-25: the plain list of questions "looks weak"):
 * one card per guide with its own picture (`pic(key)`, the builder's picture with its sharp files), its
 * short topic as the title and the question under it, and a link to the index.
 */
export function howStrip(pic = () => '') {
  const base = HOW_PATH.slice('encyclopedia/'.length);
  return `<section class="how-strip" id="how" aria-labelledby="how-strip-h">
        <div class="how-strip-head"><h2 id="how-strip-h"><a href="${base}">${esc(HOW_TITLE)}</a></h2><a class="how-all" href="${base}">All guides</a></div>
        <ul class="how-tiles">${GUIDES.map((g) => `<li><a class="how-tile" href="${base}${esc(g.slug)}/">${pic(g.icon)}<span class="how-tile-text"><span class="how-tile-topic">${esc(g.short)}<span class="ency-sep">.</span></span> <span class="how-tile-q">${esc(g.question)}</span></span></a></li>`).join('')}</ul>
      </section>`;
}
