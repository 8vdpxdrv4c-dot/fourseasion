import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:47321/fourseasion';
const OUT = process.env.OUT_DIR ?? '/opt/cursor/artifacts';
const TAU = Math.PI * 2;

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

const report = { errors: [], notes: [], shots: {} };

async function open(path, width, height) {
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') logs.push(msg.text());
  });
  page.on('pageerror', (err) => logs.push(`pageerror: ${err.message}`));
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/${path}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__turntable?.ready === true, { timeout: 20000 });
  await page.evaluate(() => window.__turntable.setHoldClock(true));
  await new Promise((r) => setTimeout(r, 280));
  return { page, logs };
}

async function pose(page, time) {
  await page.evaluate(async (value) => {
    window.__turntable.setHoldClock(true);
    window.__turntable.setClock(value);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, time);
}

try {
  await mkdir(OUT, { recursive: true });
  const desktop = await open('?pause=1&nobloom&focus=pair', 1440, 900);
  report.errors.push(...desktop.logs);
  await pose(desktop.page, 3.6);
  const chase = await desktop.page.evaluate(() => ({
    ...window.__turntable.getCompanion(),
    errors: window.__turntable.errors,
  }));
  report.shots.chase = chase;
  report.errors.push(...chase.errors);
  await desktop.page.screenshot({ path: `${OUT}/companions-chase.png` });

  await pose(desktop.page, 8.35);
  report.shots.kiss = await desktop.page.evaluate(() => window.__turntable.getCompanion());
  await desktop.page.screenshot({ path: `${OUT}/companions-kiss.png` });

  await pose(desktop.page, 10.45);
  report.shots.hug = await desktop.page.evaluate(() => window.__turntable.getCompanion());
  await desktop.page.screenshot({ path: `${OUT}/companions-hug.png` });
  await desktop.page.close();

  const phone = await open('?pause=1&nobloom&focus=pair', 390, 844);
  report.errors.push(...phone.logs);
  await pose(phone.page, 0.6);
  report.shots.portrait = await phone.page.evaluate(() => window.__turntable.getCompanion());
  await phone.page.screenshot({ path: `${OUT}/companions-portrait-edge.png` });
  await phone.page.close();

  const seasons = [
    ['spring', 5.4],
    ['summer', TAU + 5.4],
    ['autumn', TAU * 2 + 5.4],
    ['winter', TAU * 3 + 5.4],
  ];
  for (const [name, sweep] of seasons) {
    const page = await open(`?pause=1&nobloom&focus=tree&sweep=${sweep}`, 1280, 800);
    report.errors.push(...page.logs);
    const state = await page.page.evaluate(() => ({
      errors: window.__turntable.errors,
      season: window.__turntable.getFrontSeason(),
    }));
    report.shots[name] = state;
    report.errors.push(...state.errors);
    await page.page.screenshot({ path: `${OUT}/trees-${name}.png` });
    await page.page.close();
  }

  const grass = await open(`?pause=1&nobloom&focus=grass&sweep=${TAU + 5.2}`, 1280, 800);
  report.errors.push(...grass.logs);
  report.shots.grass = await grass.page.evaluate(() => ({ errors: window.__turntable.errors }));
  report.errors.push(...report.shots.grass.errors);
  await grass.page.screenshot({ path: `${OUT}/grass-close.png` });
  await grass.page.close();

  const sky = await open('?pause=1&nobloom', 1440, 900);
  report.errors.push(...sky.logs);
  await pose(sky.page, 16.2);
  report.shots.meteors = await sky.page.evaluate(() => ({
    sky: window.__turntable.getSky(),
    errors: window.__turntable.errors,
  }));
  report.errors.push(...report.shots.meteors.errors);
  await sky.page.screenshot({ path: `${OUT}/meteor-shower.png` });
  await sky.page.close();

  const ok = {
    chase: report.shots.chase?.beat === 'chase' && report.shots.chase.separation > 0.4,
    kiss: report.shots.kiss?.beat === 'kiss' && report.shots.kiss.heart > 0.4,
    hug: report.shots.hug?.beat === 'hug' && report.shots.hug.leftY > 0.1,
    portrait: report.shots.portrait?.beat === 'rest' && report.shots.portrait.leftZ > 2.5,
    meteors: report.shots.meteors?.sky?.active >= 1,
    clean: report.errors.length === 0,
  };
  report.ok = ok;
  const failed = Object.entries(ok).filter(([, pass]) => !pass).map(([name]) => name);
  if (failed.length) report.notes.push(`failed: ${failed.join(', ')}`);
} catch (error) {
  report.notes.push(String(error?.stack || error));
} finally {
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (report.notes.length) process.exit(1);
}
