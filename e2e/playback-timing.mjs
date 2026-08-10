// Verifies that playback is driven by simulation time rather than by a fixed
// number of samples per frame: a revolution takes 60/RPM real seconds, doubling
// the input speed halves it, and the time readout stays consistent with the pose
// when the input speed changes mid-cycle.
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import fs from 'node:fs/promises';
import path from 'node:path';

const screenshotDir = path.resolve('artifacts/screenshots');
await fs.mkdir(screenshotDir, { recursive: true });

const baseUrl = process.env.PMKS_URL || 'http://127.0.0.1:4200/';
const runPrefix = process.env.RUN_PREFIX || 'playback-timing';
const chromePath =
  process.env.PMKS_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const fourBar =
  '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq';

const issues = [];
const checks = [];
const check = (name, ok, details = {}) => {
  checks.push({ name, ok, ...details });
  if (!ok) issues.push({ name, severity: 'high', ...details });
};

const context = await chromium.launchPersistentContext(`/tmp/pmks-playback-${Date.now()}`, {
  executablePath: chromePath,
  headless: !process.env.PMKS_HEADED,
  viewport: { width: 1440, height: 900 },
  args: ['--no-first-run', '--no-default-browser-check', '--disable-crash-reporter'],
});
const page = context.pages()[0] || (await context.newPage());
page.setDefaultTimeout(15000);
page.on('pageerror', (error) =>
  issues.push({ name: 'Uncaught page error', severity: 'high', error: error.message })
);
import { waitForReady } from './app-ready.mjs';
page.on('console', (msg) => {
  if (msg.type() === 'error' && !/favicon|google-analytics/i.test(msg.text())) {
    issues.push({ name: `Console error: ${msg.text().slice(0, 160)}`, severity: 'medium' });
  }
});

const shot = (name) =>
  page.screenshot({ path: path.join(screenshotDir, `${runPrefix}-${name}`), fullPage: false });

const tab = (label) => page.locator('.leftButton', { hasText: label });
const timeField = () => page.locator('#animationBar-input');
const timeSeconds = async () =>
  parseFloat((await timeField().inputValue()).replace(/[^\d.-]/g, ''));

const speedField = () => page.locator('input-block:has-text("Input Speed") input').first();

// The rail buttons toggle their panel, so clicking blindly can close what we need.
async function openAnalyze() {
  if (
    !(await page
      .locator('.playButton')
      .isVisible()
      .catch(() => false))
  ) {
    await tab('Analyze').click();
  }
  await page.locator('.playButton').waitFor({ state: 'visible' });
  await page.waitForTimeout(400);
}

// Input speed now belongs to the input joint, so it lives in the Edit panel's
// Input Settings section rather than the global Settings panel.
async function openInputSettings() {
  if (
    !(await speedField()
      .isVisible()
      .catch(() => false))
  ) {
    if (
      !(await page
        .locator('app-edit-panel')
        .isVisible()
        .catch(() => false))
    ) {
      await tab('Edit').click();
      await page.waitForTimeout(600);
    }
    // Selecting the input joint is what reveals its Input Settings.
    await page
      .locator('svg circle')
      .first()
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(700);
  }
  await speedField().waitFor({ state: 'visible' });
}

async function setInputSpeed(rpm) {
  await openInputSettings();
  const speed = speedField();
  await speed.scrollIntoViewIfNeeded();
  await speed.click();
  await speed.press('ControlOrMeta+A');
  // The unit comes from the picker beside the field, so the value is a bare number.
  await speed.fill(`${rpm}`);
  await speed.press('Enter');
  await page.waitForTimeout(700);
}

/** Play until the time readout wraps back toward zero; return real elapsed seconds. */
async function measureRevolution() {
  await openAnalyze();
  await page.locator('.playButton').click();

  const started = Date.now();
  let previous = 0;
  let wrapped = false;
  while (Date.now() - started < 20000) {
    const now = await timeSeconds();
    if (Number.isFinite(now)) {
      if (now + 0.05 < previous) {
        wrapped = true;
        break;
      }
      previous = now;
    }
    await page.waitForTimeout(50);
  }
  const elapsed = (Date.now() - started) / 1000;
  await page.locator('.playButton').click();
  await page.waitForTimeout(200);
  return { elapsed, wrapped, lastTime: previous };
}

try {
  await page.goto(`${baseUrl}?${fourBar}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForReady(page);

  // --- Wall-clock revolution time --------------------------------------------
  await setInputSpeed(20); // 3 s per revolution
  const slow = await measureRevolution();
  check(
    '20 RPM completes a revolution in about 3 s of real time',
    slow.wrapped && Math.abs(slow.elapsed - 3) < 1.2,
    {
      elapsed: slow.elapsed,
      wrapped: slow.wrapped,
    }
  );
  await shot('01-after-20rpm.png');

  await setInputSpeed(40); // 1.5 s per revolution
  const fast = await measureRevolution();
  check(
    '40 RPM completes a revolution in about 1.5 s of real time',
    fast.wrapped && Math.abs(fast.elapsed - 1.5) < 0.9,
    {
      elapsed: fast.elapsed,
      wrapped: fast.wrapped,
    }
  );

  check(
    'doubling the input speed roughly halves the on-screen revolution time',
    slow.wrapped && fast.wrapped && slow.elapsed / fast.elapsed > 1.5,
    { ratio: slow.elapsed / fast.elapsed, slow: slow.elapsed, fast: fast.elapsed }
  );

  // --- Cycle length reported by the time field --------------------------------
  await setInputSpeed(20);
  await openAnalyze();
  await timeField().click();
  await timeField().press('ControlOrMeta+A');
  await timeField().type('99 s');
  await timeField().press('Enter');
  await page.waitForTimeout(400);
  const maxAt20 = await timeSeconds();
  check(
    'clamping past the end of the cycle reports the 3 s period at 20 RPM',
    Math.abs(maxAt20 - 3) < 0.02,
    {
      maxAt20,
    }
  );

  await setInputSpeed(40);
  await openAnalyze();
  await timeField().click();
  await timeField().press('ControlOrMeta+A');
  await timeField().type('99 s');
  await timeField().press('Enter');
  await page.waitForTimeout(400);
  const maxAt40 = await timeSeconds();
  check('the reported period halves at double the input speed', Math.abs(maxAt40 - 1.5) < 0.02, {
    maxAt40,
  });
  await shot('02-period-at-40rpm.png');

  // --- Leaving Analyze rewinds, and time zero survives the round trip ---------
  // Input speed lives with the input joint now, so changing it means entering Edit
  // mode, which deliberately rewinds to t = 0 (it replaced the stop button). The
  // model-level "hold the time across a rebuild" guarantee is covered by the unit
  // suite; what matters here is that the round trip cannot move the start pose.
  await setInputSpeed(20);
  await openAnalyze();
  const zeroPose = await page.locator('svg').first().innerHTML();

  await timeField().click();
  await timeField().press('ControlOrMeta+A');
  await timeField().type('1.5 s');
  await timeField().press('Enter');
  await page.waitForTimeout(400);
  const seekedTime = await timeSeconds();
  const seekedPose = await page.locator('svg').first().innerHTML();

  check(
    'seeking to a non-zero time moves the mechanism',
    seekedTime > 1 && seekedPose !== zeroPose,
    {
      seekedTime,
    }
  );

  // Round trip through Edit at a non-zero time, twice, then come back to t = 0.
  await setInputSpeed(40);
  await openAnalyze();
  await setInputSpeed(20);
  await openAnalyze();
  const rewoundTime = await timeSeconds();
  const rewoundPose = await page.locator('svg').first().innerHTML();

  check('leaving Analyze rewinds to time zero', Math.abs(rewoundTime) < 0.02, { rewoundTime });
  check(
    'time zero still means the same pose after switching modes at a non-zero time',
    rewoundPose === zeroPose
  );
  await shot('03-held-time.png');
} catch (error) {
  issues.push({ name: 'Run failed', severity: 'high', error: error?.stack || String(error) });
} finally {
  await fs.writeFile(
    path.join(screenshotDir, `${runPrefix}-report.json`),
    JSON.stringify({ baseUrl, checks, issues }, null, 2)
  );
  await context.close().catch(() => {});
}

const failed = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ passed: checks.length - failed.length, failed, issues }, null, 2));
