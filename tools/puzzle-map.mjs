// Street geometry map for reconstructing lost puzzle triggers.
// Usage: node tools/puzzle-map.mjs <tsid> out.png [x0 x1 y0 y1 scale] [--marks=puzzle-triggers]
// Coordinates are screen space (world - bounds.l/t). Draws middleground decos
// with their real art, collision platforms (green solid, red pc_perm 0, labels
// for ids the street's events toggle), walls (orange), ladders (cyan), doors,
// labels for event decos, and the reconstructed puzzle triggers (yellow boxes).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
mkdirSync(new URL('../shots/', import.meta.url), { recursive: true });
import { chromium } from 'playwright';

const [tsid, out = 'shots/map.png', ...rest] = process.argv.slice(2);
const nums = rest.filter((a) => !a.startsWith('--')).map(Number);
const root = new URL('../public/', import.meta.url);
const street = JSON.parse(readFileSync(new URL(`assets/streets/${tsid}.json`, root), 'utf8'));
let triggers = [];
let quoins = [];
try {
  const all = JSON.parse(readFileSync(new URL('assets/content/puzzle-triggers.json', root), 'utf8'));
  triggers = all.streets?.[tsid]?.triggers || [];
  quoins = all.streets?.[tsid]?.quoins || [];
} catch {}
const W = street.bounds.r - street.bounds.l;
const H = street.bounds.b - street.bounds.t;
const [x0 = 0, x1 = W, y0 = 0, y1 = H, scale = Math.min(1, 4000 / W)] = nums;

const toggled = new Set();
const decoIds = new Set();
for (const acts of Object.values(street.events || {})) {
  for (const a of acts) {
    if (a.type === 'plat') toggled.add(a.plat);
    if (a.type === 'wall') toggled.add(a.wall);
    if (a.type === 'deco_show' || a.type === 'deco_hide') decoIds.add(a.deco);
  }
}

const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 800, height: 600 } });
// A file:// page loads the deco PNGs straight from public/ (no server needed).
const blank = new URL('../shots/.puzzle-map-blank.html', import.meta.url);
writeFileSync(blank, '<!doctype html><html><body></body></html>');
await page.goto(blank.href);
const decoBase = new URL('assets/decos/groddle/', root).href;
await page.evaluate(async ({ street, triggers, quoins, x0, x1, y0, y1, scale, toggled, decoIds, decoBase }) => {
  document.body.innerHTML = '';
  const c = document.createElement('canvas');
  c.width = Math.round((x1 - x0) * scale);
  c.height = Math.round((y1 - y0) * scale);
  document.body.appendChild(c);
  document.body.style.margin = '0';
  const g = c.getContext('2d');
  g.fillStyle = '#d8dde6';
  g.fillRect(0, 0, c.width, c.height);
  g.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
  const l = street.bounds.l;
  const t = street.bounds.t;
  const mg = street.layers.find((ly) => ly.id === 'middleground');
  // Middleground decos are world space; T_ layers the size of the middleground
  // hold screen-space decos (often the puzzle art the events toggle).
  const decos = [];
  for (const ly of [...street.layers].sort((a, b) => (a.z || 0) - (b.z || 0))) {
    const same = ly.id === 'middleground' || (ly.w === mg?.w && ly.h === mg?.h && /^T_/.test(ly.id));
    if (!same) continue;
    for (const d of [...(ly.decos || [])].sort((a, b) => (a.z || 0) - (b.z || 0))) {
      decos.push(ly.id === 'middleground' ? d : { ...d, x: d.x + l, y: d.y + t });
    }
  }
  const imgs = new Map();
  await Promise.all([...new Set(decos.map((d) => d.sprite))].map((s) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { imgs.set(s, im); res(); };
    im.onerror = res;
    im.src = `${decoBase}${s}.png`;
  })));
  for (const d of decos) {
    const im = imgs.get(d.sprite);
    const x = d.x - l;
    const y = d.y - t;
    g.save();
    g.translate(x, y);
    if (d.r) g.rotate((d.r * Math.PI) / 180);
    if (d.flip) g.scale(-1, 1);
    g.globalAlpha = d.hidden ? 0.35 : 1;
    if (im) g.drawImage(im, -d.w / 2, -d.h, d.w, d.h);
    else { g.strokeStyle = '#999'; g.strokeRect(-d.w / 2, -d.h, d.w, d.h); }
    g.restore();
  }
  g.font = '11px monospace';
  for (const d of decos) {
    if (!d.id || !decoIds.includes(d.id)) continue;
    g.strokeStyle = '#a0f';
    g.lineWidth = 1.5;
    g.strokeRect(d.x - l - d.w / 2, d.y - t - d.h, d.w, d.h);
    g.fillStyle = '#70c';
    g.fillText(d.id.slice(-4), d.x - l - d.w / 2, d.y - t - d.h - 2);
  }
  for (const p of street.platforms) {
    const on = Number(p.pc_perm) !== 0;
    // green: hard on top (-1), blue: hard from below (1, a ceiling), red: off (0).
    g.strokeStyle = !on ? '#e00' : p.pc_perm == null || Number(p.pc_perm) === 1 ? '#06f' : '#0a0';
    g.lineWidth = toggled.includes(p.id) ? 3 : 1.5;
    g.beginPath();
    g.moveTo(p.x1 - l, p.y1 - t);
    g.lineTo(p.x2 - l, p.y2 - t);
    g.stroke();
    if (toggled.includes(p.id)) {
      g.fillStyle = on ? '#060' : '#900';
      g.fillText(p.id.slice(-4), Math.min(p.x1, p.x2) - l, Math.min(p.y1, p.y2) - t + 12);
    }
  }
  for (const w of street.barriers || []) {
    g.strokeStyle = '#f80';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(w.x - l, w.y - t);
    g.lineTo(w.x - l, w.y - t + w.h);
    g.stroke();
    if (toggled.includes(w.id)) { g.fillStyle = '#c60'; g.fillText(w.id.slice(-4), w.x - l + 3, w.y - t + 12); }
  }
  for (const ld of street.ladders || []) {
    g.strokeStyle = '#0cc';
    g.lineWidth = 2;
    g.strokeRect(ld.x - l - 10, ld.y - t - ld.h, 20, ld.h);
  }
  for (const d of street.doors || []) {
    g.strokeStyle = '#00f';
    g.strokeRect(d.x - d.w / 2, d.y - d.h, d.w, d.h);
  }
  g.font = 'bold 12px monospace';
  for (const tr of triggers) {
    g.strokeStyle = '#fc0';
    g.fillStyle = 'rgba(255,204,0,0.25)';
    g.lineWidth = 2;
    g.fillRect(tr.x - tr.w / 2, tr.y - tr.h, tr.w, tr.h);
    g.strokeRect(tr.x - tr.w / 2, tr.y - tr.h, tr.w, tr.h);
    g.fillStyle = '#860';
    g.fillText(tr.id, tr.x - tr.w / 2, tr.y + 12);
  }
  for (const q of quoins) {
    g.fillStyle = '#c0f';
    g.beginPath();
    g.arc(q.x, q.y, 14, 0, Math.PI * 2);
    g.fill();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.font = '12px monospace';
  g.fillStyle = '#000';
  for (let gx = Math.ceil(x0 / 100) * 100; gx < x1; gx += 100) {
    g.fillText(String(gx), (gx - x0) * scale + 2, 12);
    g.fillRect((gx - x0) * scale, 0, 1, 6);
  }
  for (let gy = Math.ceil(y0 / 100) * 100; gy < y1; gy += 100) {
    g.fillText(String(gy), 2, (gy - y0) * scale - 2);
    g.fillRect(0, (gy - y0) * scale, 6, 1);
  }
}, { street, triggers, quoins, x0, x1, y0, y1, scale, toggled: [...toggled], decoIds: [...decoIds], decoBase });
const canvas = await page.$('canvas');
await canvas.screenshot({ path: out });
await browser.close();
console.log(`${out} ${Math.round((x1 - x0) * scale)}x${Math.round((y1 - y0) * scale)} scale ${scale}`);
