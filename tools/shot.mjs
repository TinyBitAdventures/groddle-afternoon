// Usage: node tools/shot.mjs "<query>" shots/out.png [waitMs] [actions-json]
// actions: [{"key":"e"},{"wait":500},{"click":"#selector"},{"eval":"js"},{"hold":"d","ms":800}]
// BASE=http://127.0.0.1:8771/ shoots a local server (e.g. over a worktree) instead of Cove.
import { chromium } from 'playwright';

const [query = '', out = 'shot.png', waitArg = '6000', actionsArg = '[]'] = process.argv.slice(2);
const base = String(process.env.BASE || 'https://groddle.localhost/').replace(/\/?$/, '/');
const url = `${base}${query.startsWith("?") || /^[\w/-]+\.html/.test(query) ? query : `?${query}`}`;
const browser = await chromium.launch({
  args: ['--ignore-certificate-errors', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, ignoreHTTPSErrors: true });
const logs = [];
page.on('console', (m) => {
  // SwiftShader GPU stalls and the pre-gesture AudioContext notice are harness noise.
  if (/GL Driver Message|AudioContext was not allowed/.test(m.text())) return;
  if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`);
});
page.on('response', (r) => {
  if (r.status() >= 400) logs.push(`http ${r.status()}: ${r.url().replace(/^https:\/\/groddle\.localhost\//, '')}`);
});
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message} @ ${String(e.stack || '').split('\n').slice(1, 4).join(' | ')}`));
// INIT='js' runs before page scripts (e.g. feature switches for perf checks).
if (process.env.INIT) await page.addInitScript(process.env.INIT);
await page.goto(url, { waitUntil: 'load', timeout: Number(process.env.GOTO_TIMEOUT) || 30000 });
await page.waitForTimeout(Number(waitArg));
for (const a of JSON.parse(actionsArg)) {
  if (a.key) await page.keyboard.press(a.key);
  if (a.hold) {
    await page.keyboard.down(a.hold);
    await page.waitForTimeout(a.ms || 500);
    await page.keyboard.up(a.hold);
  }
  if (a.click) await page.click(a.click, { timeout: 4000 }).catch((e) => logs.push(`click-fail ${a.click}: ${e.message.split('\n')[0]}`));
  if (a.eval) {
    const r = await page.evaluate(a.eval).catch((e) => `eval-error ${e.message}`);
    if (r !== undefined) console.log('eval:', typeof r === 'string' ? r : JSON.stringify(r));
  }
  if (a.wait) await page.waitForTimeout(a.wait);
  if (a.shot) await page.screenshot({ path: a.shot });
}
await page.screenshot({ path: out });
const data = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  return c ? { ...c.dataset } : null;
});
console.log(JSON.stringify({ logs, data }, null, 0).slice(0, Number(process.env.MAXOUT || 3000)));
await browser.close();
