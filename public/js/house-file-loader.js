/**
 * The housefile play-link param (G1285, report #669; Austin 2026-11-25): fetch a house file
 * (js/house-file.js, the format and the rules), check it, and lay it into this solo practice
 * copy's own house, then report what it did on screen and in the console.
 *
 *   /play/?autostart=1&fresh=1&housefile=<url-encoded URL or path>
 *
 * - Solo only: /play/online/ strips the query before any module loads (js/game-mode.js) and
 *   houseFileRequest refuses a multiplayer page anyway. js/practice-mode.js makes every housefile
 *   link a practice copy, so the player's own solo save is never read or written.
 * - Only this site's files: an absolute URL under /wp-content/uploads/ (the media library) or a
 *   relative same-origin path, ending in .json (resolveHouseFileUrl). The fetch never follows a
 *   redirect, sends no cookies off the site, reads at most HOUSE_FILE_MAX_BYTES and parses JSON
 *   only (no script, no HTML).
 * - Laid in once a copy: a reload keeps what you changed since; &resetgame=1 starts over.
 * - Nothing fails silently: unknown classes, styles, swatches, items and moved pieces are listed
 *   in the report (the first few on screen, all of them in the console).
 * QA: canvas data houseFile (loaded:<pieces> | kept | refused:<reason> | failed:<reason>);
 * window.groddleHouseFile { url, title, problems, counts }.
 */

import { ITEM_CATALOG } from './inventory.js?v=6414dbdc';
import { ownGroundPlaces } from './ground-stacks.js?v=22792362';
import { isSolo } from './game-mode.js?v=1ecf2899';
import {
  HOUSE_FILE_MAX_BYTES,
  HOUSE_FILE_PARAM,
  HOUSE_FILE_TEXT,
  HOUSE_FLOOR_KEYS,
  buildHouse,
  houseCounts,
  houseFileItemClasses,
  houseSummary,
  parseHouseFileText,
  resolveHouseFileUrl,
  validateHouseFile,
} from './house-file.js?v=5449814a';

/** The practice copy's note of the house file it was laid from (a reload keeps the house). */
export const HOUSE_FILE_MARK_KEY = 'groddle.housefile.v1';
const REPORT_LINES = 6;

/**
 * What a page's housefile param asks for: null (none, or not solo), or { ok, url } / { ok: false, msg }.
 * @param {{ search?: string, mode?: string, baseUri?: string, origin?: string }} opts
 */
export function houseFileRequest({ search = '', mode, baseUri, origin } = {}) {
  let params;
  try {
    params = new URLSearchParams(search || '');
  } catch {
    return null;
  }
  if (!params.has(HOUSE_FILE_PARAM)) return null;
  if (!isSolo(mode)) return null;
  return resolveHouseFileUrl(params.get(HOUSE_FILE_PARAM), { baseUri, origin });
}

/** Fetch the file's text: same origin, no redirects, size-capped. { ok, text } or { ok: false, reason, msg }. */
export async function fetchHouseFile(url, { fetchImpl = globalThis.fetch } = {}) {
  let res;
  try {
    res = await fetchImpl(url, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
  } catch (err) {
    return { ok: false, reason: 'fetch', msg: `That house file could not be fetched (${err?.message || 'network error'}).` };
  }
  if (!res?.ok) return { ok: false, reason: `http-${res?.status ?? 0}`, msg: `That house file could not be fetched (${res?.status ?? 'no answer'}).` };
  const len = Number(res.headers?.get?.('content-length'));
  if (Number.isFinite(len) && len > HOUSE_FILE_MAX_BYTES) return { ok: false, reason: 'size', msg: HOUSE_FILE_TEXT.tooBig };
  const type = String(res.headers?.get?.('content-type') || '');
  if (/text\/html|javascript/i.test(type)) return { ok: false, reason: 'type', msg: HOUSE_FILE_TEXT.notJson };
  const text = await res.text();
  return { ok: true, text };
}

/** Item classes this game draws: the catalog, else an icon on the server (one HEAD each). */
async function knownItems(classes, fetchImpl) {
  const known = new Set();
  await Promise.all(classes.map(async (cls) => {
    if (ITEM_CATALOG[cls]) {
      known.add(cls);
      return;
    }
    try {
      const res = await fetchImpl(`assets/sprites/icons/${cls}.webp`, { method: 'HEAD', redirect: 'error' });
      if (res?.ok) known.add(cls);
    } catch { /* unknown */ }
  }));
  return known;
}

/** Lay a built house into the save's own house (homes, home-machines and craftybot slices, the floors' stacks). */
export function applyHouse(built, { engine, features, homeState, imagineHome }) {
  // A copy that owns no house yet imagines one in the file's style (a copy that owns one keeps its own).
  if (!homeState.owned) imagineHome(homeState, built.style || 'meadow', Date.now() - 60_000);
  const homes = features.get('homes');
  const was = homes.save() || {};
  homes.restore({ ...was, decor: built.decors[0], floors: built.floors }, engine);
  const machines = features.get('home-machines');
  if (machines) {
    const slice = machines.save() || {};
    machines.restore({ ...slice, machines: [...(slice.machines || []).filter((m) => !/^house/.test(String(m.place || ''))), ...built.machines] }, engine);
  }
  const bot = features.get('craftybot');
  if (bot && built.craftybot) {
    const x0 = built.craftybot.floor ? 0 : homes.roomWorldX();
    bot.restore({ ...(bot.save() || {}), owned: true, boxRead: true, where: 'interior', floor: built.craftybot.floor, x: x0 + built.craftybot.x, craftState: 'idle', anim: 'idle0', crafting: false, queue: [] }, engine);
  }
  // What stood in the house before goes; then each stack is set down where the file puts it.
  const places = ownGroundPlaces(engine);
  for (const key of HOUSE_FLOOR_KEYS) delete places[key];
  const x0 = homes.roomWorldX();
  let set = 0;
  for (const s of built.stacks) {
    const res = engine.placeOwnStack?.(s.key, s.classTsid, s.count, { x: (s.floor ? 0 : x0) + s.x, y: s.y, on: s.on });
    if (res?.ok) set += 1;
  }
  engine.droppedItemsChanged?.();
  engine.save?.();
  return { stacks: set };
}

/** The report: a small panel over the game, the summary and the first problems (all in the console). */
export function showHouseFileReport(doc, { title = '', summary = '', problems = [], refused = '' } = {}) {
  if (!doc?.body) return null;
  doc.getElementById('house-file-report')?.remove();
  const box = doc.createElement('div');
  box.id = 'house-file-report';
  box.setAttribute('role', 'status');
  box.style.cssText = [
    'position:fixed', 'left:12px', 'bottom:12px', 'z-index:9999', 'max-width:min(560px,calc(100vw - 24px))',
    'padding:8px 12px', 'border-radius:10px', 'font:600 12px/1.45 Nunito,"Trebuchet MS",system-ui,sans-serif',
    `background:${refused ? 'rgba(110,40,30,0.92)' : 'rgba(48,70,44,0.9)'}`, 'color:#fbfaf2',
  ].join(';');
  const head = doc.createElement('div');
  head.textContent = refused || `House file loaded${title ? `: ${title}` : ''}. ${summary}.`;
  box.append(head);
  if (problems.length) {
    const list = doc.createElement('ul');
    list.style.cssText = 'margin:4px 0 0;padding-left:18px;font-weight:400';
    for (const p of problems.slice(0, REPORT_LINES)) {
      const li = doc.createElement('li');
      li.textContent = `${p.where}: ${p.msg}`;
      list.append(li);
    }
    box.append(list);
    if (problems.length > REPORT_LINES) {
      const more = doc.createElement('div');
      more.style.fontWeight = '400';
      more.textContent = `And ${problems.length - REPORT_LINES} more: see the console.`;
      box.append(more);
    }
  }
  const close = doc.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.style.cssText = 'margin-top:6px;font:inherit;padding:2px 10px;border-radius:999px;border:0;cursor:pointer';
  close.addEventListener('click', () => box.remove());
  box.append(close);
  doc.body.append(box);
  return box;
}

/**
 * Boot: the whole housefile route. Returns null (no housefile here), or { entered } when the house
 * is ready to walk into (laid in now, or kept from earlier in this copy).
 */
export async function bootHouseFile({ search, mode, baseUri, origin, doc, engine, features, homeState, imagineHome, hadSave, storage, fetchImpl = globalThis.fetch }) {
  const req = houseFileRequest({ search, mode, baseUri, origin });
  if (!req) return null;
  const report = (data, info) => {
    engine?.setData?.('houseFile', data);
    showHouseFileReport(doc, info);
  };
  if (!req.ok) {
    console.warn(`[housefile] ${req.msg}`);
    report(`refused:${req.reason}`, { refused: req.msg });
    return null;
  }
  // Laid in already in this copy: walk in as it stands now.
  let mark = null;
  try { mark = storage?.getItem(HOUSE_FILE_MARK_KEY); } catch { mark = null; }
  if (hadSave && mark === req.url && homeState.owned) {
    engine?.setData?.('houseFile', 'kept');
    return { entered: true, kept: true };
  }
  const got = await fetchHouseFile(req.url, { fetchImpl });
  const parsed = got.ok ? parseHouseFileText(got.text) : got;
  if (!parsed.ok) {
    console.warn(`[housefile] ${parsed.msg} (${req.url})`);
    report(`failed:${parsed.reason}`, { refused: parsed.msg });
    return null;
  }
  const known = await knownItems(houseFileItemClasses(parsed.raw), fetchImpl);
  const checked = validateHouseFile(parsed.raw, { isItem: (c) => known.has(c) });
  if (!checked.ok) {
    console.warn('[housefile] not a house file:', checked.problems);
    report('failed:invalid', { refused: `That isn't a house file: ${checked.problems.at(-1)?.msg || 'unknown problem'}`, problems: checked.problems.slice(0, -1) });
    return null;
  }
  const built = buildHouse(checked.house);
  const problems = [...checked.problems, ...built.problems];
  applyHouse(built, { engine, features, homeState, imagineHome });
  try { storage?.setItem(HOUSE_FILE_MARK_KEY, req.url); } catch { /* the copy re-lays it next time */ }
  const counts = houseCounts(built);
  const summary = houseSummary(built);
  console.info(`[housefile] ${req.url}: ${summary}.`);
  if (problems.length) {
    console.groupCollapsed?.(`[housefile] ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
    for (const p of problems) console.warn(`[housefile] ${p.level} ${p.where}: ${p.msg}`);
    console.groupEnd?.();
  }
  globalThis.groddleHouseFile = { url: req.url, title: built.title, problems, counts, perFloor: built.counts };
  report(`loaded:${counts.pieces}`, { title: built.title, summary, problems });
  return { entered: true, kept: false, built, problems };
}
