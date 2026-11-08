import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:47321/fourseasion';
const OUT = process.env.OUT_DIR ?? '/opt/cursor/artifacts';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--hide-scrollbars',
  ],
});

const report = { errors: [], checks: {}, notes: [] };

async function open(url, features) {
  const page = await browser.newPage();
  if (features) await page.emulateMediaFeatures(features);
  const logs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') logs.push(msg.text());
  });
  page.on('pageerror', (err) => logs.push(`pageerror: ${err.message}`));
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__turntable?.ready === true, { timeout: 20000 });
  await page.evaluate(() => {
    window.__turntable.setHoldClock(true);
    window.__turntable.setClock(0);
  });
  await new Promise((r) => setTimeout(r, 200));
  return { page, logs };
}

async function frames(page, count) {
  await page.evaluate(async (n) => {
    for (let i = 0; i < n; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, count);
}

try {
  const { page, logs } = await open(`${BASE}/?pause=1&nobloom&near=1&sweep=2.2`);
  report.errors.push(...logs);
  const angle = await page.evaluate(() => window.__turntable.getCompanion().angle);
  report.checks.angle = angle;

  await page.evaluate((value) => window.__turntable.setSweep(value), angle - 0.22);
  await frames(page, 3);
  const before = await page.evaluate(() => window.__turntable.getCompanion());
  report.checks.before = before;
  if (before.jumps !== 0) report.notes.push('hop started before the hand arrived');

  await page.evaluate((hand) => window.__turntable.setSweep(hand + 0.03), angle);
  await page.waitForFunction(() => window.__turntable.getCompanion().y > 0.6, { timeout: 6000, polling: 'raf' });
  const airborne = await page.evaluate(() => window.__turntable.getCompanion());
  report.checks.airborne = airborne;
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/companions-airborne.png` });

  await page.waitForFunction(() => !window.__turntable.getCompanion().jumping && window.__turntable.getCompanion().y === 0, {
    timeout: 5000,
    polling: 'raf',
  });
  const landed = await page.evaluate(() => window.__turntable.getCompanion());
  report.checks.landed = landed;

  await page.evaluate((hand) => window.__turntable.setSweep(hand + 0.45), angle);
  await frames(page, 8);
  await new Promise((r) => setTimeout(r, 700));
  const held = await page.evaluate(() => window.__turntable.getCompanion());
  report.checks.held = held;

  await page.evaluate((hand) => window.__turntable.setSweep(hand + Math.PI * 2 + 0.05), angle);
  await frames(page, 3);
  const wrapped = await page.evaluate(() => window.__turntable.getCompanion());
  report.checks.wrapped = wrapped;

  await page.close();

  const steppedPage = await open(`${BASE}/?pause=1&nobloom&sweep=${(angle - 0.5).toFixed(4)}`);
  report.errors.push(...steppedPage.logs);
  report.checks.stepped = await steppedPage.page.evaluate(async (hand) => {
    const api = window.__turntable;
    const start = hand - 0.24;
    api.setSweep(start);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    let jumpsAtCross = 0;
    for (let i = 1; i <= 28; i += 1) {
      api.setSweep(start + i * 0.02);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (api.getCompanion().jumps === 1 && jumpsAtCross === 0) jumpsAtCross = i;
    }
    const during = api.getCompanion().jumps;
    for (let i = 0; i < 12; i += 1) {
      api.setSweep(hand + 0.4 + i * 0.01);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return { jumpsAtCross, during, after: api.getCompanion().jumps, errors: api.errors };
  }, angle);
  report.errors.push(...report.checks.stepped.errors);
  await steppedPage.page.close();

  const fast = await open(`${BASE}/?pause=1&nobloom&sweep=${(angle - 0.55).toFixed(4)}`);
  report.errors.push(...fast.logs);
  await fast.page.evaluate(() => {
    window.__turntable.setSpeed(5);
    window.__turntable.setPlaying(true);
  });
  await fast.page.waitForFunction(() => window.__turntable.getCompanion().jumps >= 1, { timeout: 12000, polling: 'raf' });
  const fastHop = await fast.page.evaluate(() => window.__turntable.getCompanion());
  report.checks.fast = { jumps: fastHop.jumps, playing: await fast.page.evaluate(() => window.__turntable.getPlaying()) };
  await fast.page.evaluate(() => window.__turntable.setPlaying(false));
  const fastJumps = fastHop.jumps;
  await new Promise((r) => setTimeout(r, 600));
  const fastHeld = await fast.page.evaluate(() => window.__turntable.getCompanion());
  report.checks.fastHeld = { before: fastJumps, after: fastHeld.jumps, jumping: fastHeld.jumping };
  await fast.page.close();

  const slow = await open(`${BASE}/?pause=1&nobloom&sweep=${(angle - 0.16).toFixed(4)}`);
  report.errors.push(...slow.logs);
  await slow.page.evaluate(() => {
    window.__turntable.setSpeed(0.3);
    window.__turntable.setPlaying(true);
  });
  await slow.page.waitForFunction(() => window.__turntable.getCompanion().jumps >= 1, { timeout: 15000, polling: 'raf' });
  report.checks.slow = await slow.page.evaluate(() => ({
    jumps: window.__turntable.getCompanion().jumps,
    sweep: window.__turntable.getSweep(),
  }));
  await slow.page.close();

  const reduced = await open(`${BASE}/?pause=1&nobloom&sweep=${(angle - 0.3).toFixed(4)}`, [
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  report.errors.push(...reduced.logs);
  await reduced.page.evaluate((hand) => window.__turntable.setSweep(hand + 0.4), angle);
  await frames(reduced.page, 20);
  await new Promise((r) => setTimeout(r, 400));
  report.checks.reduced = await reduced.page.evaluate(() => window.__turntable.getCompanion());
  await reduced.page.close();

  const hop = report.checks.airborne;
  const ground = 0.17;
  const ok = {
    oneStep: report.checks.stepped?.during === 1 && report.checks.stepped?.after === 1 && report.checks.stepped?.jumpsAtCross > 0,
    bothAir: Boolean(hop) && hop.leftY > ground + 0.4 && hop.rightY > ground + 0.4 && Math.abs(hop.leftY - hop.rightY) < 0.08,
    clearRise: Boolean(hop) && hop.y > 0.5,
    wholeBody: Boolean(hop) && hop.scaleY > 0.9 && hop.scaleY < 1.15,
    landed: landed.jumps === 1 && landed.y === 0 && !landed.jumping,
    noRetrigger: held.jumps === 1,
    wrapOnce: wrapped.jumps === 2 && wrapped.jumping,
    fastOnce: report.checks.fast.jumps === 1 && report.checks.fastHeld.after === 1,
    slowOnce: report.checks.slow.jumps === 1,
    reducedStill: report.checks.reduced.jumps === 0 && report.checks.reduced.y === 0,
    clean: report.errors.length === 0,
  };
  report.checks.ok = ok;
  const failed = Object.entries(ok).filter(([, pass]) => !pass).map(([name]) => name);
  if (failed.length) report.notes.push(`failed: ${failed.join(', ')}`);
} catch (error) {
  report.notes.push(String(error?.stack || error));
} finally {
  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/companion-jump-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (report.notes.length) process.exit(1);
}
