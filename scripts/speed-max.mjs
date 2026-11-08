import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:47324/fourseasion';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars'],
});

const report = { errors: [], checks: {}, notes: [] };

async function open(width, height) {
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') logs.push(msg.text());
  });
  page.on('pageerror', (err) => logs.push(`pageerror: ${err.message}`));
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/?pause=1&nobloom`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__turntable?.ready === true, { timeout: 20000 });
  await page.evaluate(() => {
    window.__turntable.setHoldClock(true);
    window.__turntable.setClock(0);
  });
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  return { page, logs };
}

async function framedDelta(page, frames) {
  return page.evaluate(async (count) => {
    const start = window.__turntable.getSweep();
    for (let i = 0; i < count; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return window.__turntable.getSweep() - start;
  }, frames);
}

try {
  const desktop = await open(1440, 900);
  report.errors.push(...desktop.logs);
  const bounds = await desktop.page.evaluate(() => {
    const input = document.querySelector('#speed');
    return {
      min: input.min,
      max: input.max,
      step: input.step,
      value: input.value,
      ariaMax: input.getAttribute('aria-valuemax'),
      ariaMin: input.getAttribute('aria-valuemin'),
    };
  });
  report.checks.bounds = bounds;

  await desktop.page.evaluate(() => {
    window.__turntable.setPlaying(true);
    window.__turntable.setSpeed(1);
  });
  const d1 = await framedDelta(desktop.page, 20);
  await desktop.page.evaluate(() => window.__turntable.setSpeed(5));
  const d5 = await framedDelta(desktop.page, 20);
  const ratio = d5 / d1;
  const label = await desktop.page.evaluate(() => ({
    speed: window.__turntable.getSpeed(),
    text: document.querySelector('#speed-readout').textContent,
    ariaNow: document.querySelector('#speed').getAttribute('aria-valuenow'),
    ariaText: document.querySelector('#speed').getAttribute('aria-valuetext'),
    input: document.querySelector('#speed').value,
    clamped: (() => {
      window.__turntable.setSpeed(8);
      return window.__turntable.getSpeed();
    })(),
    floor: (() => {
      window.__turntable.setSpeed(0.05);
      const low = window.__turntable.getSpeed();
      window.__turntable.setSpeed(5);
      return low;
    })(),
  }));
  report.checks.rate = { d1, d5, ratio, label };

  await desktop.page.evaluate(() => window.__turntable.setPlaying(false));
  const pausedAt = await desktop.page.evaluate(() => window.__turntable.getSweep());
  await new Promise((resolve) => setTimeout(resolve, 400));
  const paused = await desktop.page.evaluate(() => ({
    sweep: window.__turntable.getSweep(),
    playing: window.__turntable.getPlaying(),
  }));
  report.checks.pause = { pausedAt, ...paused, delta: Math.abs(paused.sweep - pausedAt) };

  const angle = await desktop.page.evaluate(() => window.__turntable.getCompanion().angle);
  await desktop.page.evaluate((hand) => {
    window.__turntable.setPlaying(false);
    window.__turntable.setSweep(hand - 0.18);
    window.__turntable.setSpeed(5);
  }, angle);
  await framedDelta(desktop.page, 2);
  await desktop.page.evaluate(() => window.__turntable.setPlaying(true));
  await framedDelta(desktop.page, 12);
  const once = await desktop.page.evaluate(() => window.__turntable.getCompanion().jumps);
  await framedDelta(desktop.page, 8);
  const stillOnce = await desktop.page.evaluate(() => window.__turntable.getCompanion().jumps);
  await desktop.page.evaluate((hand) => {
    window.__turntable.setPlaying(false);
    window.__turntable.setSweep(hand + Math.PI * 2 - 0.12);
  }, angle);
  await framedDelta(desktop.page, 2);
  const beforeWrap = await desktop.page.evaluate(() => window.__turntable.getCompanion().jumps);
  await desktop.page.evaluate(() => window.__turntable.setPlaying(true));
  await framedDelta(desktop.page, 10);
  await desktop.page.evaluate(() => window.__turntable.setPlaying(false));
  await framedDelta(desktop.page, 6);
  const afterWrap = await desktop.page.evaluate(() => ({
    jumps: window.__turntable.getCompanion().jumps,
    errors: window.__turntable.errors,
  }));
  report.checks.cross = { once, beforeWrap, afterWrap };
  report.errors.push(...afterWrap.errors);
  await desktop.page.evaluate(() => window.__turntable.setSpeed(5));
  await desktop.page.screenshot({ path: '/opt/cursor/artifacts/speed-5x-desktop.png' });
  await desktop.page.close();

  const phone = await open(390, 844);
  report.errors.push(...phone.logs);
  await phone.page.evaluate(() => {
    const input = document.querySelector('#speed');
    input.value = '5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  report.checks.phone = await phone.page.evaluate(() => ({
    speed: window.__turntable.getSpeed(),
    text: document.querySelector('#speed-readout').textContent,
    max: document.querySelector('#speed').max,
  }));
  await phone.page.screenshot({ path: '/opt/cursor/artifacts/speed-5x-phone.png' });
  await phone.page.close();

  const ok = {
    bounds: bounds.min === '0.25' && bounds.max === '5' && bounds.step === '0.05' && bounds.value === '1' && bounds.ariaMax === '5',
    ratio: ratio > 4 && ratio < 6.2,
    label: label.speed === 5 && (label.text === '5.0×' || label.text === '5×') && label.clamped === 5 && label.floor === 0.25,
    pause: paused.playing === false && Math.abs(paused.sweep - pausedAt) < 0.02,
    once: once === 1 && stillOnce === 1,
    wrapOnce: afterWrap.jumps === beforeWrap + 1,
    phone: report.checks.phone.speed === 5 && (report.checks.phone.text === '5.0×' || report.checks.phone.text === '5×'),
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
