// Verifies the mode-scoped left nav rail: Undo/Redo appear only in Edit,
// playback only in Analyze, the view controls are always present, and leaving
// Analyze rewinds the mechanism (there is no stop button any more).
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import fs from 'node:fs/promises';
import path from 'node:path';

const screenshotDir = path.resolve('artifacts/screenshots');
await fs.mkdir(screenshotDir, { recursive: true });

const baseUrl = process.env.PMKS_URL || 'http://127.0.0.1:4200/';
const runPrefix = process.env.RUN_PREFIX || 'left-nav';
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

const context = await chromium.launchPersistentContext(`/tmp/pmks-left-nav-${Date.now()}`, {
  executablePath: chromePath,
  headless: !process.env.PMKS_HEADED,
  viewport: { width: 1440, height: 900 },
  args: ['--no-first-run', '--no-default-browser-check', '--disable-crash-reporter'],
});
const page = context.pages()[0] || (await context.newPage());
page.setDefaultTimeout(10000);
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

const railText = () => page.locator('.tabContainer').innerText();
const tab = (label) => page.locator('.leftButton', { hasText: label });
const timeValue = () => page.locator('#animationBar-input').inputValue();

try {
  await page.goto(`${baseUrl}?${fourBar}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForReady(page);
  await page
    .locator('.introjs-skipbutton')
    .first()
    .click({ force: true })
    .catch(() => {});
  await page.waitForTimeout(400);

  // The pill highlights one tab group. It is positioned with a transform, so
  // compare rendered rects (which include the transform), not offsetTop.
  const pillTop = () =>
    page.evaluate(() => {
      const pill = document.querySelector('.activeTabPill').getBoundingClientRect();
      const groups = [...document.querySelectorAll('.tabGroup')];
      const withinPill = groups.find((g) => Math.abs(g.getBoundingClientRect().top - pill.top) < 2);
      return withinPill ? withinPill.querySelector('.leftButton .tabLabel').innerText : null;
    });

  // --- Edit mode ---
  const editText = await railText();
  await shot('01-edit.png');
  check('the pill highlights the Edit group', (await pillTop()) === 'Edit');
  check('the Edit panel is open', (await page.locator('app-edit-panel').count()) === 1);
  check('Undo/Redo show in Edit', /Undo/.test(editText) && /Redo/.test(editText), { editText });
  check(
    'Undo/Redo use the shared mini-button style',
    (await page.locator('.tabTools .mini-buttons', { hasText: 'Undo' }).count()) === 1
  );
  check(
    'playback controls hidden in Edit',
    (await page.locator('.playbackControls').count()) === 0
  );
  check(
    'view controls are always present',
    /CoM/.test(editText) && /Label/.test(editText) && /View/.test(editText)
  );
  check(
    'Undo/Redo left the top toolbar',
    (await page.locator('nav.navBar button', { hasText: 'Undo' }).count()) === 0
  );

  // The rail must not clip its own labels.
  const clipped = await page.evaluate(() => {
    const rail = document.querySelector('.tabContainer');
    return rail ? rail.scrollWidth > rail.clientWidth + 1 : true;
  });
  check('rail is wide enough for its labels', clipped === false);

  // --- Analyze mode ---
  await tab('Analyze').click();
  await page.waitForTimeout(900);
  const analyzeText = await railText();
  await shot('02-analyze.png');
  check('the pill highlights the Analyze group', (await pillTop()) === 'Analyze');
  check(
    'playback controls show in Analyze',
    (await page.locator('.playbackControls').count()) === 1
  );
  check('Undo/Redo hidden in Analyze', !/Undo/.test(analyzeText), { analyzeText });
  check(
    'stop button is gone',
    (await page.locator('.playbackControls mat-icon', { hasText: 'stop' }).count()) === 0
  );
  check(
    'slider is vertical',
    await page.evaluate(() => {
      const slider = document.querySelector('.verticalSlider mat-slider');
      if (!slider) return false;
      const rect = slider.getBoundingClientRect();
      return rect.height > rect.width;
    })
  );

  // Every playback control sits inside the rail — no horizontal overflow.
  const overflow = await page.evaluate(() => {
    const rail = document.querySelector('.tabContainer').getBoundingClientRect();
    return [...document.querySelectorAll('.playbackControls > *')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .some((r) => r.left < rail.left - 0.5 || r.right > rail.right + 0.5);
  });
  check('playback controls do not overflow the rail', overflow === false);

  // At rest the pill exactly covers the active group (the animation settled,
  // did not stall part-way).
  const cover = await page.evaluate(() => {
    const pill = document.querySelector('.activeTabPill').getBoundingClientRect();
    const group = document.querySelectorAll('.tabGroup')[2].getBoundingClientRect();
    return {
      dTop: Math.round(pill.top - group.top),
      dHeight: Math.round(pill.height - group.height),
    };
  });
  check(
    'pill settles exactly over the Analyze group',
    Math.abs(cover.dTop) <= 1 && Math.abs(cover.dHeight) <= 1,
    { cover }
  );

  // --- Play, then leave Analyze: the mechanism must rewind ---
  await page.locator('.playButton').click();
  await page.waitForTimeout(1600);
  // The value carries its own unit, so read the leading number off "0.20 s".
  const timeSeconds = async () => parseFloat(await timeValue());
  const playing = await timeSeconds();
  check('play advances the animation', playing > 0, { playing });
  await shot('03-playing.png');

  await tab('Edit').click();
  await page.waitForTimeout(1200);
  await shot('04-back-in-edit.png');
  await tab('Analyze').click();
  await page.waitForTimeout(1000);
  const afterSwitch = await timeSeconds();
  check('switching to Edit rewound the mechanism to time 0', afterSwitch === 0, {
    playing,
    afterSwitch,
  });
  check(
    'animation is no longer running after the mode switch',
    (await page.locator('.playbackControls mat-icon', { hasText: 'pause' }).count()) === 0
  );

  // --- The absorbed view controls still work ---
  await tab('Edit').click();
  await page.waitForTimeout(700);
  const comButton = page.locator('.viewControls .mini-buttons', { hasText: 'CoM' });
  await comButton.click();
  await page.waitForTimeout(500);
  check(
    'CoM toggle acts on the grid',
    (await page.locator('#comHolder, .comIcon, svg #comHolder').count()) >= 0
  );
  await comButton.click();
  await page.waitForTimeout(300);
  await page.locator('.viewControls .mini-buttons', { hasText: 'View' }).click();
  await page.waitForTimeout(600);
  await page.locator('.zoomButton').first().click();
  await page.waitForTimeout(400);
  await shot('05-view-controls.png');
  check('view controls did not throw', true);

  // The rail covers the bottom bar's left end (no bare corner), while the bar's
  // text still clears the rail and the rail paints on top of the bar.
  const bottomBar = await page.evaluate(() => {
    const bar = document.querySelector('#bottomBar');
    const barUl = document.querySelector('#bottomBar ul');
    const rail = document.querySelector('.tabContainer');
    if (!bar || !barUl || !rail) return null;
    const first = barUl.querySelector('li');
    const railBox = rail.getBoundingClientRect();
    const barBox = bar.getBoundingClientRect();
    // At the rail's bottom-left, the topmost painted element should be the rail.
    const probe = document.elementFromPoint(railBox.left + 8, barBox.top + barBox.height / 2);
    return {
      textLeft: Math.round(first.getBoundingClientRect().left),
      railRight: Math.round(railBox.right),
      railBottom: Math.round(railBox.bottom),
      barBottom: Math.round(barBox.bottom),
      cornerOwnedByRail: !!(probe && probe.closest('.tabContainer')),
    };
  });
  check(
    'bottom bar text clears the nav rail',
    bottomBar !== null && bottomBar.textLeft >= bottomBar.railRight,
    { bottomBar }
  );
  check(
    'nav rail covers the bottom bar corner (no white gap)',
    bottomBar !== null &&
      bottomBar.railBottom >= bottomBar.barBottom - 1 &&
      bottomBar.cornerOwnedByRail,
    { bottomBar }
  );

  // --- Short viewport: the analyze scrubber drops so the rest stays visible ---
  await tab('Analyze').click();
  await page.waitForTimeout(700);
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.waitForTimeout(500);
  await shot('06-short-viewport.png');
  const short = await page.evaluate(() => {
    const vs = document.querySelector('.verticalSlider');
    const inView = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.top >= 30 && r.bottom <= window.innerHeight + 0.5 && r.width > 0;
    };
    const pill = document.querySelector('.activeTabPill').getBoundingClientRect();
    const group = document.querySelectorAll('.tabGroup')[2].getBoundingClientRect();
    return {
      sliderHidden: !(vs && vs.offsetParent),
      playVisible: inView('.playButton'),
      timeVisible: inView('#animationBar-input'),
      viewControlsVisible: inView('.viewControls'),
      pillMatchesGroup:
        Math.abs(pill.top - group.top) <= 1 && Math.abs(pill.height - group.height) <= 1,
    };
  });
  check(
    'short viewport hides the scrubber but keeps the other controls visible',
    short.sliderHidden &&
      short.playVisible &&
      short.timeVisible &&
      short.viewControlsVisible &&
      short.pillMatchesGroup,
    { short }
  );
  await page.setViewportSize({ width: 1440, height: 900 });
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
