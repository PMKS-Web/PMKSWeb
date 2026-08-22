/**
 * The transport, after it moved out of the rail and onto the grid.
 *
 * Deleting the mode rail took the animation bar with it, so this exists partly
 * to make sure there is still a way to press play at all. Beyond that it checks
 * the things the redesign changed: the transport belongs to the analysis modes
 * and is absent from Edit, each runnable mechanism gets a row, and the mode
 * highlight lands on the mode you actually chose.
 *
 *   PMKS_BASE_URL=<origin> node e2e/playback-bar.mjs
 */

import { readFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const source = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const payloads = Object.fromEntries(
  [...source.matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [id, p])
);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const tab = (name) => page.locator('.tabButton', { hasText: name });
const jointAt = (id) =>
  page.evaluate((joint) => {
    const box = document.querySelector('#joint_' + joint).getBoundingClientRect();
    return { x: box.x, y: box.y };
  }, id);

await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

// --- the transport belongs to the analysis modes ----------------------------
record('Edit has no transport', (await page.locator('.playButton').count()) === 0);

await tab('Kinematic').click();
await page.waitForTimeout(800);
record('Kinematic has one', (await page.locator('.playButton').count()) === 1);
record('with a row for the mechanism that runs', (await page.locator('.mechRow').count()) === 1);
record(
  'and no readiness word beside it, because being listed is what ready means',
  !(await page.locator('.scrubCard').innerText()).match(/Ready|DoF/i),
  await page.locator('.scrubCard').innerText()
);

// --- the transport's own block is a rounded square --------------------------
const playShape = await page.evaluate(() => {
  const button = document.querySelector('.playButton');
  const style = getComputedStyle(button);
  return {
    radius: style.borderRadius,
    width: Math.round(button.getBoundingClientRect().width),
  };
});
// --- back to where the mechanism was drawn ----------------------------------
// Every other mode shows the start pose, so a reader who has watched a cycle
// needs a way back to it that is not "scrub until the numbers read zero".
await page.locator('.playButton').click();
await page.waitForTimeout(1200);
await page.locator('.playButton').click();
await page.waitForTimeout(300);
const moved = await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.currentTimeSeconds()
);
record('a played cycle leaves the mechanism away from its start', moved > 0.05, { moved });
record(
  'and the stop button beside play offers the way back',
  !(await page.locator('.stopButton').isDisabled())
);
await page.locator('.stopButton').click();
await page.waitForTimeout(1200);
const home = await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.currentTimeSeconds()
);
record('which takes it there', home === 0, { home });
record('and then has nothing left to do', await page.locator('.stopButton').isDisabled());

record(
  'the play button is a rounded square, not a disc',
  !playShape.radius.includes('%') && parseFloat(playShape.radius) < playShape.width / 2,
  playShape
);

// One corner for the whole chrome: play, stop, speed and every view control
// are the same size button on the same strip, and three radii between them
// read as three unrelated controls that happen to sit together.
const corners = await page.evaluate(() =>
  ['.playButton', '.stopButton', '.speedButton', '.viewButton'].map((selector) => {
    const button = document.querySelector(selector);
    return button ? getComputedStyle(button).borderRadius : null;
  })
);
record(
  'and every button on the chrome takes the same corner',
  new Set(corners).size === 1,
  corners
);

// Play is the only filled thing in the cluster, which is what makes it the
// one you press; stop is the same quiet button as the speed control beside it.
record(
  'and play is the only filled one of them',
  await page.evaluate(() => {
    const fill = (selector) => getComputedStyle(document.querySelector(selector)).backgroundColor;
    const clear = (paint) => paint === 'rgba(0, 0, 0, 0)' || paint === 'transparent';
    return !clear(fill('.playButton')) && clear(fill('.stopButton')) && clear(fill('.speedButton'));
  })
);

// Same size, not merely the same shape: three buttons in a row at three widths
// read as three unrelated controls.
const sizes = await page.evaluate(() =>
  ['.playButton', '.stopButton', '.speedButton', '.viewButton'].map((selector) => {
    const box = document.querySelector(selector)?.getBoundingClientRect();
    return box ? `${Math.round(box.width)}x${Math.round(box.height)}` : null;
  })
);
record('and every one of them is the same size', new Set(sizes).size === 1, sizes);

// --- the highlight lands on the mode that was chosen ------------------------
const highlight = await page.evaluate(() => {
  const pill = document.querySelector('.activeTabPill');
  const active = document.querySelector('.tabButton.active');
  const style = getComputedStyle(pill);
  return {
    pillLeft: Math.round(new DOMMatrix(style.transform).m41),
    pillWidth: Math.round(parseFloat(style.width)),
    activeLeft: active.offsetLeft,
    activeWidth: active.offsetWidth,
  };
});
record(
  'the mode highlight sits on the active mode, not the one before it',
  Math.abs(highlight.pillLeft - highlight.activeLeft) <= 1 &&
    Math.abs(highlight.pillWidth - highlight.activeWidth) <= 1,
  highlight
);

// --- pressing play moves the mechanism --------------------------------------
const rest = await jointAt('B');
await page.locator('.playButton').click();
await page.waitForTimeout(1200);
const moving = await jointAt('B');
record('pressing play moves the crank', Math.hypot(moving.x - rest.x, moving.y - rest.y) > 3, {
  rest,
  moving,
});

await page.locator('.playButton').click();
await page.waitForTimeout(400);
const paused = await jointAt('B');
await page.waitForTimeout(700);
const stillPaused = await jointAt('B');
record(
  'and pressing it again stops it',
  Math.hypot(stillPaused.x - paused.x, stillPaused.y - paused.y) < 1,
  { paused, stillPaused }
);

// --- the status strip reports the mode and does not act ---------------------
const strip = await page.locator('#bottomBar').innerText();
record(
  'the status strip names the mode and the rule',
  /Kinematic/.test(strip) && /Geometry locked/.test(strip),
  strip
);
const clickable = await page.evaluate(
  () => getComputedStyle(document.querySelector('#bottomBar')).pointerEvents
);
record('and is not clickable', clickable === 'none', { clickable });

record('nothing threw', errors.length === 0, errors.slice(0, 3));

await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
