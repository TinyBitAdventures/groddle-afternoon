#!/usr/bin/env node
/**
 * LEVEL BUILDER art pack: makes the pack's pictures with the Gemini API instead of by hand
 * (art-bible.mjs writes the pack; art-intake.mjs and art-apply.mjs take it from drop/ on).
 *
 *   GEMINI_API_KEY=... node tools/builder/art-generate.mjs <pack dir> [--only a,b] [--force]
 *       [--model gemini-nano-banana-2.1] [--api interactions|generate-content] [--cap 40]
 *       [--no-text-check] [--dry-run]
 *
 * For each piece in pieces.json with no picture in drop/ (with --force, each selected piece), one
 * request at a time:
 *
 *   1. sends the piece's prompt file and its attached reference pictures (the Tiny Speck CC0 decos
 *      the pack chose) to the image model, asking for the supported aspect ratio nearest the
 *      piece's shape at 1K (2K for pieces over 1,500 px a side). The default is Google's current
 *      Interactions API (POST /v1beta/interactions, content blocks, response_format image); --api
 *      generate-content uses the older generateContent call (inlineData parts, imageConfig);
 *   2. checks what comes back the way intake will: a painted checkerboard, no flat background, a
 *      shape far from the asked one, and (one small call to a text model) any lettering. A picture
 *      that fails is asked for once more with a short corrective line on the prompt, then the better
 *      of the two is kept with its flags;
 *   3. saves it to drop/<piece>.png (.jpg/.webp as the model sent it; a replaced picture moves to
 *      drop/replaced/), writes the model id to drop/model.txt (drop/models.json per piece when
 *      model.txt names another model), and records provenance in drop/generated.json: per piece
 *      the model, the prompt actually sent, the reference files, the date, the file's sha256, the
 *      attempts and flags; and every API call with its rough cost.
 *
 * 429 and 5xx answers back off and retry (Retry-After when given), except a hard quota (a limit of
 * 0, or a daily limit), which stops the run like a refused key or an unknown model does. --cap
 * stops after that many image requests (default 40). The key comes from GEMINI_API_KEY and is only
 * ever sent in the x-goog-api-key header: never in a URL, a file or the output.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, looksLikeCheckerboard, resize, readImage } from './art-image.mjs';
import { prepare, dropFile } from './art-intake.mjs';

export const API = 'https://generativelanguage.googleapis.com/v1beta';
export const APIS = Object.freeze(['interactions', 'generate-content']);
export const DEFAULT_MODEL = 'gemini-nano-banana-2.1';
export const TEXT_MODEL = 'gemini-3.1-flash-lite';
export const DEFAULT_CAP = 40;
/** The aspect ratios every Gemini image model takes, and the wider set the newer ones add. */
export const BASE_RATIOS = Object.freeze(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);
export const WIDE_RATIOS = Object.freeze([...BASE_RATIOS, '1:4', '4:1', '1:8', '8:1']);
/**
 * Rough USD per output image by size, and per million input tokens (ai.google.dev/gemini-api/docs/pricing,
 * read 2026-10-31). Only for the running cost estimate.
 */
export const PRICES = Object.freeze({
  'gemini-nano-banana-2.1': { '1K': 0.0336, '2K': 0.0504, '4K': 0.113, input: 1.5 },
  'gemini-3.1-flash-image': { '512': 0.045, '1K': 0.067, '2K': 0.101, '4K': 0.151, input: 0.5 },
  'gemini-3.1-flash-lite-image': { '1K': 0.0336, input: 0.25 },
  'gemini-3-pro-image': { '1K': 0.134, '2K': 0.134, '4K': 0.24, input: 2 },
  'gemini-2.5-flash-image': { '1K': 0.039, input: 0.3 },
});
export const TEXT_CHECK_COST = 0.0002;

const r4 = (n) => Math.round(n * 10000) / 10000;
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

/** A refusal that ends the run: the key refused, a hard quota, an unknown model. */
export class StopError extends Error {}
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** PURE: the supported ratio nearest a w x h shape (by log distance). */
export function pickAspect(w, h, ratios = WIDE_RATIOS) {
  const want = Math.log(w / h);
  let best = ratios[0];
  let bestD = Infinity;
  for (const r of ratios) {
    const [a, b] = r.split(':').map(Number);
    const d = Math.abs(Math.log(a / b) - want);
    if (d < bestD - 1e-9) {
      best = r;
      bestD = d;
    }
  }
  return best;
}

/** PURE: the image size asked for: 2K when the finished piece is over 1,500 px a side, else 1K. */
export function pickSize(target) {
  return Math.max(target.w, target.h) > 1500 ? '2K' : '1K';
}

/**
 * PURE: the request for one picture: { path, body }. `refs` are { mimeType, data (base64) }.
 * Interactions: content blocks and response_format; generateContent: parts and imageConfig.
 */
export function buildRequest({ api = 'interactions', model, prompt, refs = [], aspect, size }) {
  if (api === 'generate-content') {
    return {
      path: `/models/${encodeURIComponent(model)}:generateContent`,
      body: {
        contents: [{ role: 'user', parts: [{ text: prompt }, ...refs.map((r) => ({ inlineData: { mimeType: r.mimeType, data: r.data } }))] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect, ...(size ? { imageSize: size } : {}) } },
      },
    };
  }
  return {
    path: '/interactions',
    body: {
      model,
      input: [{ type: 'text', text: prompt }, ...refs.map((r) => ({ type: 'image', mime_type: r.mimeType, data: r.data }))],
      response_format: { type: 'image', aspect_ratio: aspect, ...(size ? { image_size: size } : {}) },
    },
  };
}

/** PURE: the text check's request: the question and a small picture, for a text answer. */
export function textCheckRequest({ api = 'interactions', model = TEXT_MODEL, png }) {
  const q = 'Look at this picture. Does it contain any written text, letters, digits, a label, a signature or a watermark? Answer with one word: YES or NO.';
  const data = png.toString('base64');
  if (api === 'generate-content') {
    return { path: `/models/${encodeURIComponent(model)}:generateContent`, body: { contents: [{ role: 'user', parts: [{ text: q }, { inlineData: { mimeType: 'image/png', data } }] }], generationConfig: { maxOutputTokens: 5, temperature: 0 } } };
  }
  return { path: '/interactions', body: { model, input: [{ type: 'text', text: q }, { type: 'image', mime_type: 'image/png', data }], generation_config: { max_output_tokens: 5 } } };
}

/** PURE: every content block an answer carries, either API, as { type, text?, data?, mimeType? }. */
function blocks(json) {
  const out = [];
  if (json?.output_image?.data) out.push({ type: 'image', data: json.output_image.data, mimeType: json.output_image.mime_type || 'image/png' });
  for (const s of json?.steps || []) {
    if (s.type && s.type !== 'model_output') continue;
    for (const c of s.content || []) out.push({ type: c.type, text: c.text, data: c.data, mimeType: c.mime_type || c.mimeType });
  }
  for (const p of json?.candidates?.[0]?.content?.parts || []) {
    const d = p.inlineData || p.inline_data;
    if (d?.data) out.push({ type: 'image', data: d.data, mimeType: d.mimeType || d.mime_type });
    else if (p.text) out.push({ type: 'text', text: p.text });
  }
  return out;
}

/** PURE: the first image in an answer (either API), or { none: why, text }. */
export function extractImage(json) {
  const all = blocks(json);
  const img = all.find((b) => b.type === 'image' && b.data);
  if (img) return { mimeType: img.mimeType || 'image/png', buf: Buffer.from(img.data, 'base64') };
  const text = all.filter((b) => b.type === 'text' && b.text).map((b) => b.text).join(' ').slice(0, 200);
  return { none: json?.candidates?.[0]?.finishReason || json?.promptFeedback?.blockReason || (json?.status && json.status !== 'completed' ? json.status : 'no image'), text };
}

/** PURE: an answer's text (the text check). */
export function answerText(json) {
  return blocks(json).filter((b) => b.type === 'text' && b.text).map((b) => b.text).join(' ').trim();
}

/** PURE: input tokens an answer reports (either API). */
export const inputTokens = (json) => json?.usage?.total_input_tokens ?? json?.usageMetadata?.promptTokenCount ?? 0;

/** PURE: the rough cost of one image request from its size and the input tokens it used. */
export function callCost(model, size, tokensIn = 0, gotImage = true) {
  const p = PRICES[model] || PRICES[DEFAULT_MODEL];
  return r4((tokensIn / 1e6) * (p.input || 0) + (gotImage ? p[size] ?? p['1K'] ?? 0 : 0));
}

/**
 * PURE (on the picture): what is wrong with a returned picture, as intake would see it:
 * 'checkerboard', 'background' (neither clear nor a flat magenta), 'aspect' (its art far from the
 * asked shape). Text is checked separately (it needs a model).
 */
export function checkPicture(img, piece) {
  const flags = [];
  const r = prepare(img, piece, { snap: 0 });
  if (r.refused) {
    flags.push(r.report.background === 'checkerboard' || looksLikeCheckerboard(img) ? 'checkerboard' : 'background');
    return { flags, report: r.report };
  }
  if (r.report.warnings.some((w) => /^Its shape is/.test(w))) flags.push('aspect');
  return { flags, report: r.report };
}

/** PURE: the short line appended to the prompt for the one corrective retry. */
export function correctiveLine(flags, piece) {
  const out = [];
  if (flags.includes('checkerboard') || flags.includes('background')) out.push('Put it on a flat pure magenta #FF00FF background, edge to edge: no checkerboard, no gradient, no scenery behind it.');
  if (flags.includes('aspect')) out.push(`Shape it to ${(piece.target.w / piece.target.h).toFixed(2)}:1 (${piece.target.w > piece.target.h ? 'wide' : 'tall'}), filling the frame that way.`);
  if (flags.includes('text')) out.push('No text, letters, numbers, labels, signature or watermark anywhere.');
  if (flags.includes('noimage')) out.push('Answer with the picture only.');
  return out.length ? `IMPORTANT: ${out.join(' ')}` : '';
}

/** PURE: whether an error answer is a hard quota (nothing to wait out): a limit of 0, or a daily one. */
export function isHardQuota(status, msg) {
  return status === 429 && (/limit: 0\b/.test(msg) || /per day/i.test(msg));
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One POST with retries: 429 and 5xx back off (Retry-After when sent, else 2, 4, 8, 16, 32 s);
 * a refused key (401/403), a hard quota and an unknown model (404) throw StopError; other 4xx throw
 * ApiError. `onCall` hears every attempt's status. The key goes in the header only.
 */
export async function post({ fetch, key, path, body, sleep = sleepMs, tries = 6, onCall = () => {} }) {
  const url = `${API}${path}`;
  for (let i = 0; ; i += 1) {
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
    } catch (e) {
      onCall(0);
      if (i + 1 >= tries) throw new ApiError(`network: ${e.message}`, 0);
      await sleep(2000 * 2 ** i);
      continue;
    }
    onCall(res.status);
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch { /* not JSON */ }
    if (res.ok) return json;
    const msg = String(json?.error?.message || text || '(empty answer)').replace(/\s+/g, ' ').slice(0, 300);
    const detail = JSON.stringify(json?.error?.details || '');
    if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|API key not valid/.test(detail + msg)) throw new StopError(`The API refused the key (${res.status}): ${msg}`);
    if (isHardQuota(res.status, msg)) throw new StopError(`Out of quota (${res.status}): ${msg}`);
    if (res.status === 404) throw new StopError(`Not found (404) at ${path}: ${msg}`);
    if (res.status === 429 || res.status >= 500) {
      if (i + 1 >= tries) throw new ApiError(`${res.status} after ${tries} tries: ${msg}`, res.status);
      const ra = Number(res.headers?.get?.('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * 2 ** i);
      continue;
    }
    throw new ApiError(`${res.status}: ${msg}`, res.status);
  }
}

/** A small PNG of a picture (longest side 512) for the text check. */
function thumbnail(img) {
  const s = Math.min(1, 512 / Math.max(img.w, img.h));
  return encodePng(s < 1 ? resize(img, Math.max(1, Math.round(img.w * s)), Math.max(1, Math.round(img.h * s))) : img);
}

/** Asks a small text model whether a picture has lettering in it: true, false, or null (could not tell). */
export async function hasText({ fetch, key, api, img, sleep, onCall }) {
  const { path, body } = textCheckRequest({ api, png: thumbnail(img) });
  try {
    const t = answerText(await post({ fetch, key, path, body, sleep, tries: 3, onCall })).toUpperCase();
    return t.startsWith('YES') ? true : t.startsWith('NO') ? false : null;
  } catch (e) {
    if (e instanceof StopError && /refused the key/.test(e.message)) throw e;
    return null;
  }
}

/** A returned picture as RGBA (PNG here, others through ImageMagick in a temp folder). */
function decodeAny({ mimeType, buf }) {
  if (mimeType === 'image/png') {
    try {
      return decodePng(buf);
    } catch { /* read below */ }
  }
  const t = mkdtempSync(join(tmpdir(), 'art-generate-'));
  try {
    const f = join(t, `check${EXT[mimeType] || '.png'}`);
    writeFileSync(f, buf);
    return readImage(f);
  } finally {
    rmSync(t, { recursive: true, force: true });
  }
}

/** The pack's provenance log (drop/generated.json), or a fresh one. */
export function readLog(dir) {
  const f = join(dir, 'drop/generated.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { format: 'groddle-art-generated/1', pieces: {}, calls: [] };
}

function writeJson(file, v) {
  writeFileSync(file, `${JSON.stringify(v, null, 1)}\n`);
}

/** Records the model: drop/model.txt when it is absent or names the same model, else drop/models.json for this piece. */
export function recordModel(dir, short, model) {
  const f = join(dir, 'drop/model.txt');
  const cur = existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n')[0].trim() : '';
  if (!cur) writeFileSync(f, `${model}\n`);
  if (cur && cur !== model) {
    const mf = join(dir, 'drop/models.json');
    const per = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : {};
    per[short] = model;
    writeJson(mf, per);
  }
}

/**
 * Generates the pack's missing pictures. Options: fetch (injected for tests), key, model, api,
 * only (a Set of short names), force, cap, textCheck, sleep, today, log (a line printer), dryRun.
 * Answers { made, flagged, skipped, failed, calls, images, cost, stoppedAt, stopped }: `stopped`
 * is why the run ended early (a refused key, a hard quota, an unknown model).
 */
export async function generate(dir, opts = {}) {
  const {
    fetch = globalThis.fetch, key, model = DEFAULT_MODEL, api = 'interactions', only = null, force = false, cap = DEFAULT_CAP,
    textCheck = true, sleep = sleepMs, today = new Date().toISOString().slice(0, 10), log = () => {}, dryRun = false,
  } = opts;
  if (!APIS.includes(api)) throw new Error(`--api is one of ${APIS.join(', ')}`);
  if (!dryRun && !key) throw new StopError('No GEMINI_API_KEY in the environment.');
  const pack = JSON.parse(readFileSync(join(dir, 'pieces.json'), 'utf8'));
  const dropDir = join(dir, 'drop');
  mkdirSync(dropDir, { recursive: true });
  const genLog = readLog(dir);
  const out = { made: [], flagged: [], skipped: [], failed: [], calls: 0, images: 0, cost: 0, stoppedAt: null, stopped: null };
  let ratios = WIDE_RATIOS;
  const call = (entry) => {
    out.calls += 1;
    out.cost = r4(out.cost + (entry.cost || 0));
    genLog.calls.push({ at: new Date().toISOString(), api, ...entry });
  };
  const save = () => {
    if (!dryRun) writeJson(join(dropDir, 'generated.json'), genLog);
  };
  try {
    for (const piece of pack.pieces.filter((p) => !only || only.has(p.short))) {
      const existing = dropFile(dir, piece);
      if (existing && !force) {
        out.skipped.push(piece.short);
        continue;
      }
      if (out.images >= cap) {
        out.stoppedAt = piece.short;
        log(`cap of ${cap} images reached; stopped before ${piece.short}`);
        break;
      }
      const prompt = readFileSync(join(dir, piece.promptFile), 'utf8').trim();
      const refs = piece.attach.map((f) => ({ mimeType: MIME[extname(f).toLowerCase()] || 'image/png', data: readFileSync(join(dir, f)).toString('base64') }));
      const size = pickSize(piece.target);
      if (dryRun) {
        log(`would make ${piece.short}: ${pickAspect(piece.target.w, piece.target.h, ratios)} ${size}, ${refs.length} refs`);
        out.made.push(piece.short);
        continue;
      }
      const attempts = [];
      let best = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (out.images >= cap) break;
        const sent = attempt === 0 ? prompt : `${prompt}\n${correctiveLine(attempts.at(-1).flags, piece)}`;
        let aspect = pickAspect(piece.target.w, piece.target.h, ratios);
        const send = () => post({ fetch, key, sleep, ...buildRequest({ api, model, prompt: sent, refs, aspect, size }), onCall: (status) => status !== 200 && call({ piece: piece.short, model, status, cost: 0 }) });
        let json;
        try {
          json = await send();
        } catch (e) {
          // A model that does not take the wider ratios: the base set for the rest of the run.
          if (!(e instanceof ApiError && e.status === 400 && /aspect/i.test(e.message) && ratios !== BASE_RATIOS)) throw e;
          ratios = BASE_RATIOS;
          aspect = pickAspect(piece.target.w, piece.target.h, ratios);
          log(`  ${model} refused the wider aspect ratios; using ${aspect}`);
          json = await send();
        }
        out.images += 1;
        const got = extractImage(json);
        call({ piece: piece.short, model, status: 200, aspect, size, attempt: attempt + 1, tokensIn: inputTokens(json), cost: callCost(model, size, inputTokens(json), !got.none) });
        if (got.none) {
          attempts.push({ attempt: attempt + 1, aspect, size, flags: ['noimage'], note: `${got.none}${got.text ? `: ${got.text}` : ''}` });
          log(`  [${out.images}/${cap}] ${piece.short}: no image (${got.none})  ~$${out.cost.toFixed(2)}`);
          continue;
        }
        const img = decodeAny(got);
        const { flags } = checkPicture(img, piece);
        if (textCheck) {
          const t = await hasText({ fetch, key, api, img, sleep, onCall: (status) => call({ piece: piece.short, model: TEXT_MODEL, status, check: 'text', cost: status === 200 ? TEXT_CHECK_COST : 0 }) });
          if (t) flags.push('text');
        }
        attempts.push({ attempt: attempt + 1, aspect, size, w: img.w, h: img.h, flags, mimeType: got.mimeType });
        log(`  [${out.images}/${cap}] ${piece.short}: ${img.w}x${img.h} ${aspect} ${size}${flags.length ? `  flags: ${flags.join(', ')}` : ''}  ~$${out.cost.toFixed(2)}`);
        if (!best || flags.length < best.flags.length) best = { ...got, flags, prompt: sent, attempt: attempt + 1 };
        if (!flags.length) break;
      }
      if (!best) {
        out.failed.push(piece.short);
        genLog.pieces[piece.short] = { ...(genLog.pieces[piece.short] || {}), lastFailure: { date: today, model, attempts } };
        save();
        continue;
      }
      if (existing) {
        mkdirSync(join(dropDir, 'replaced'), { recursive: true });
        const n = readdirSync(join(dropDir, 'replaced')).filter((f) => f.startsWith(`${piece.short}.`)).length + 1;
        renameSync(existing, join(dropDir, 'replaced', `${piece.short}.${n}${extname(existing)}`));
      }
      const file = `${piece.short}${EXT[best.mimeType] || '.png'}`;
      writeFileSync(join(dropDir, file), best.buf);
      recordModel(dir, piece.short, model);
      genLog.pieces[piece.short] = {
        file, sha256: sha(best.buf), model, via: api === 'interactions' ? 'Gemini API (Interactions)' : 'Gemini API (generateContent)',
        date: today, prompt: best.prompt, promptFile: piece.promptFile, refs: piece.attach, attempt: best.attempt, attempts, flags: best.flags,
      };
      save();
      out.made.push(piece.short);
      if (best.flags.length) out.flagged.push({ piece: piece.short, flags: best.flags });
    }
  } catch (e) {
    if (!(e instanceof StopError)) {
      save();
      throw e;
    }
    out.stopped = e.message;
    log(`Stopped: ${e.message}`);
  }
  save();
  return out;
}

async function main(argv) {
  const opt = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : null;
  };
  const valued = new Set(['--only', '--model', '--cap', '--api']);
  const dir = argv.find((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
  if (!dir || !existsSync(join(dir, 'pieces.json'))) {
    process.stderr.write('node tools/builder/art-generate.mjs <pack dir (with pieces.json)> [--only a,b] [--force] [--model id] [--api interactions|generate-content] [--cap 40] [--no-text-check] [--dry-run]\n');
    return 2;
  }
  const model = opt('--model') || DEFAULT_MODEL;
  const r = await generate(resolve(dir), {
    key: process.env.GEMINI_API_KEY,
    model,
    api: opt('--api') || 'interactions',
    only: opt('--only') ? new Set(opt('--only').split(',')) : null,
    force: argv.includes('--force'),
    cap: opt('--cap') ? Number(opt('--cap')) : DEFAULT_CAP,
    textCheck: !argv.includes('--no-text-check'),
    dryRun: argv.includes('--dry-run'),
    log: (l) => process.stdout.write(`${l}\n`),
  });
  if (r.skipped.length) process.stdout.write(`kept     ${r.skipped.join(', ')}\n`);
  for (const f of r.flagged) process.stdout.write(`FLAGGED  ${f.piece}: ${f.flags.join(', ')}\n`);
  if (r.failed.length) process.stdout.write(`FAILED   ${r.failed.join(', ')}\n`);
  process.stdout.write(`${r.made.length} made with ${model}, ${r.flagged.length} flagged, ${r.failed.length} failed; ${r.calls} API calls (${r.images} image requests), about $${r.cost.toFixed(2)}${r.stoppedAt ? `; stopped at the cap before ${r.stoppedAt}` : ''}${r.stopped ? `; STOPPED: ${r.stopped}` : ''}\n`);
  return r.stopped ? 3 : r.failed.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  });
}
