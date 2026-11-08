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

const report = {
  webgl: null,
  errors: [],
  checks: {},
  notes: [],
};

async function open(width, height, url) {
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error' || /shader|webgl|three/i.test(text)) logs.push(`${msg.type()}: ${text}`);
  });
  page.on('pageerror', (err) => logs.push(`pageerror: ${err.message}`));
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__turntable?.ready === true, { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 700));
  return { page, logs };
}

try {
  const probe = await open(1440, 900, `${BASE}/?pause=1`);
  report.webgl = await probe.page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2');
    return {
      hasCanvas: Boolean(canvas),
      renderer: gl?.getParameter(gl.RENDERER) ?? null,
      vendor: gl?.getParameter(gl.VENDOR) ?? null,
      api: window.__turntable
        ? {
            sweep: window.__turntable.getSweep(),
            season: window.__turntable.getFrontSeason(),
            playing: window.__turntable.getPlaying(),
            errors: window.__turntable.errors,
          }
        : null,
    };
  });
  report.errors.push(...probe.logs);

  await mkdir(OUT, { recursive: true });
  await probe.page.screenshot({ path: `${OUT}/desktop-spring.png` });

  const before = await probe.page.evaluate(() => window.__turntable.getSweep());
  await probe.page.click('#play');
  await new Promise((r) => setTimeout(r, 1600));
  const afterPlay = await probe.page.evaluate(() => ({
    sweep: window.__turntable.getSweep(),
    playing: window.__turntable.getPlaying(),
  }));
  report.checks.playMovesSweep = afterPlay.playing && afterPlay.sweep > before + 0.01;

  await probe.page.evaluate(() => window.__turntable.setSpeed(1));
  const s1 = await probe.page.evaluate(() => window.__turntable.getSweep());
  await new Promise((r) => setTimeout(r, 1600));
  const d1 = (await probe.page.evaluate(() => window.__turntable.getSweep())) - s1;
  await probe.page.evaluate(() => window.__turntable.setSpeed(5));
  const s2 = await probe.page.evaluate(() => window.__turntable.getSweep());
  await new Promise((r) => setTimeout(r, 1600));
  const d2 = (await probe.page.evaluate(() => window.__turntable.getSweep())) - s2;
  report.checks.speed = { d1, d2, faster: d2 > d1 * 3.2 };

  await probe.page.click('#play');
  await new Promise((r) => setTimeout(r, 350));
  const pausedAt = await probe.page.evaluate(() => window.__turntable.getSweep());
  await new Promise((r) => setTimeout(r, 400));
  const pausedAfter = await probe.page.evaluate(() => ({
    sweep: window.__turntable.getSweep(),
    playing: window.__turntable.getPlaying(),
  }));
  report.checks.pause = {
    playing: pausedAfter.playing,
    delta: Math.abs(pausedAfter.sweep - pausedAt),
  };

  const az0 = await probe.page.evaluate(() => window.__turntable.getAzimuth());
  const box = await probe.page.$('canvas').then((el) => el.boundingBox());
  await probe.page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.48);
  await probe.page.mouse.down();
  await probe.page.mouse.move(box.x + box.width * 0.5 + 220, box.y + box.height * 0.48 - 30, { steps: 14 });
  await probe.page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));
  const az1 = await probe.page.evaluate(() => window.__turntable.getAzimuth());
  const dist0 = await probe.page.evaluate(() => window.__turntable.getDistance());
  await probe.page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.48);
  await probe.page.mouse.wheel({ deltaY: -240 });
  await new Promise((r) => setTimeout(r, 350));
  const dist1 = await probe.page.evaluate(() => window.__turntable.getDistance());
  report.checks.drag = { az0, az1, changed: Math.abs(az1 - az0) > 0.05 };
  report.checks.zoom = { dist0, dist1, changed: Math.abs(dist1 - dist0) > 0.2 };

  const seasonClicks = {};
  for (const [label, index] of [
    ['夏', 1],
    ['秋', 2],
    ['冬', 3],
    ['春', 0],
  ]) {
    const start = await probe.page.evaluate(() => window.__turntable.getSweep());
    await probe.page.click(`[data-season="${index}"]`);
    await new Promise((r) => setTimeout(r, 1600));
    const mid = await probe.page.evaluate((seasonIndex) => ({
      sweep: window.__turntable.getSweep(),
      target: document.querySelector(`[data-season="${seasonIndex}"]`)?.classList.contains('is-target')
        || document.querySelector(`[data-season="${seasonIndex}"]`)?.getAttribute('aria-pressed'),
    }), index);
    seasonClicks[label] = { advanced: mid.sweep > start + 0.02, marker: mid.target };
  }
  report.checks.seasons = seasonClicks;

  await probe.page.evaluate(() => window.__turntable.setPlaying(false));
  await probe.page.waitForFunction(() => !document.querySelector('[data-season="3"].is-target') || window.__turntable.getSweep() > 0, { timeout: 12000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  report.checks.afterSeeks = await probe.page.evaluate(() => ({
    sweep: window.__turntable.getSweep(),
    season: window.__turntable.getFrontSeason(),
    seeking: Boolean(document.querySelector('.is-target')),
    errors: window.__turntable.errors,
  }));

  await probe.page.goto(`${BASE}/?pause=1&sweep=${(Math.PI * 2 * 2 + 2.15).toFixed(4)}`, { waitUntil: 'networkidle0' });
  await probe.page.waitForFunction(() => window.__turntable?.ready === true);
  await new Promise((r) => setTimeout(r, 600));
  await probe.page.screenshot({ path: `${OUT}/desktop-mixed.png` });

  await probe.page.goto(`${BASE}/?pause=1&sweep=${(Math.PI * 2 * 4 + 0.04).toFixed(4)}`, { waitUntil: 'networkidle0' });
  await probe.page.waitForFunction(() => window.__turntable?.ready === true);
  await new Promise((r) => setTimeout(r, 600));
  await probe.page.screenshot({ path: `${OUT}/desktop-winter.png` });
  report.errors.push(...(await probe.page.evaluate(() => window.__turntable.errors)));

  const focusInfo = await probe.page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    buttons[0]?.focus();
    const active = document.activeElement;
    const style = active ? getComputedStyle(active) : null;
    return {
      tag: active?.tagName ?? null,
      outline: style?.outlineStyle ?? null,
      outlineColor: style?.outlineColor ?? null,
    };
  });
  report.checks.focus = focusInfo;

  try {
    await probe.page.click('#full');
    await new Promise((r) => setTimeout(r, 300));
    report.checks.fullscreen = await probe.page.evaluate(() => Boolean(document.fullscreenElement));
  } catch (error) {
    report.checks.fullscreen = false;
    report.notes.push(`fullscreen: ${error.message}`);
  }

  await probe.page.close();

  const phone = await open(390, 844, `${BASE}/?pause=1&sweep=${(Math.PI * 2 * 0.9).toFixed(4)}`);
  await phone.page.screenshot({ path: `${OUT}/portrait-spring.png` });
  await phone.page.goto(`${BASE}/?pause=1&sweep=${(Math.PI * 2 * 3 + Math.PI * 0.72).toFixed(4)}`, { waitUntil: 'networkidle0' });
  await phone.page.waitForFunction(() => window.__turntable?.ready === true);
  await new Promise((r) => setTimeout(r, 500));
  await phone.page.screenshot({ path: `${OUT}/portrait-winter-wedge.png` });
  report.errors.push(...phone.logs);
  report.checks.reduced = null;

  const reduced = await browser.newPage();
  await reduced.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await reduced.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await reduced.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await reduced.waitForFunction(() => window.__turntable?.ready === true);
  report.checks.reduced = await reduced.evaluate(() => window.__turntable.getPlaying());
  await reduced.close();
} catch (error) {
  report.notes.push(String(error?.stack || error));
} finally {
  await writeFile(`${OUT}/console-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
