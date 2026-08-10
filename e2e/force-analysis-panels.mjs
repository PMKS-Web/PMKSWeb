// Verifies the Force Analysis accordion on both the joint and the link
// analysis panels: one row per reacting link / per external joint, and a single
// mechanism-wide "Force Analysis Type" toggle shared by both.
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import fs from 'node:fs/promises';
import path from 'node:path';

const screenshotDir = path.resolve('artifacts/screenshots');
await fs.mkdir(screenshotDir, { recursive: true });

const baseUrl = process.env.PMKS_URL || 'http://127.0.0.1:4200/';
const runPrefix = process.env.RUN_PREFIX || 'force-panels';
const chromePath =
  process.env.PMKS_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const fourBar =
  '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq';

const issues = [];
const checks = [];

const issue = (title, details = {}) => issues.push({ title, ...details });
const check = (name, ok, details = {}) => {
  checks.push({ name, ok, ...details });
  if (!ok) issue(name, { severity: 'high', ...details });
};

const context = await chromium.launchPersistentContext(`/tmp/pmks-force-panels-${Date.now()}`, {
  executablePath: chromePath,
  headless: !process.env.PMKS_HEADED,
  viewport: { width: 1440, height: 1000 },
  args: ['--no-first-run', '--no-default-browser-check', '--disable-crash-reporter'],
});
const page = context.pages()[0] || (await context.newPage());
page.setDefaultTimeout(10000);
page.on('pageerror', (error) =>
  issue('Uncaught page error', { severity: 'high', error: error.stack || error.message })
);
import { waitForReady } from './app-ready.mjs';
page.on('console', (msg) => {
  const text = msg.text();
  if (msg.type() === 'error' && !/favicon|google-analytics/i.test(text)) {
    issue(`Console error: ${text.slice(0, 200)}`, { severity: 'medium' });
  }
});

const shot = (name) =>
  page.screenshot({ path: path.join(screenshotDir, `${runPrefix}-${name}`), fullPage: true });

async function dismissIntro() {
  const intro = page.locator('.introjs-tooltip, .introjs-overlay').first();
  if (await intro.isVisible().catch(() => false)) {
    await page
      .locator('.introjs-skipbutton')
      .first()
      .click({ force: true })
      .catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(350);
  }
}

/** Titles of the expansion rows under the Force Analysis subsection. */
async function forceRowTitles() {
  return page.evaluate(() => {
    const sections = [...document.querySelectorAll('collapsible-subseciton')];
    const forceSection = sections.find((el) => /Force Analysis/.test(el.innerText));
    if (!forceSection) return null;
    return [...forceSection.querySelectorAll('mat-expansion-panel-header')].map((el) =>
      el.innerText.replace(/help_outline/g, '').trim()
    );
  });
}

async function toggleLabels() {
  return page.evaluate(() => {
    const sections = [...document.querySelectorAll('collapsible-subseciton')];
    const forceSection = sections.find((el) => /Force Analysis/.test(el.innerText));
    const group = forceSection?.querySelector('mat-button-toggle-group');
    if (!group) return null;
    return [...group.querySelectorAll('mat-button-toggle')].map((el) => ({
      text: el.innerText.trim(),
      checked: el.classList.contains('mat-button-toggle-checked'),
    }));
  });
}

/** Select a joint or link by clicking its SVG element, then open the Analyze tab. */
async function selectAndAnalyze(selector, index) {
  await page.locator(selector).nth(index).click({ force: true });
  await page.waitForTimeout(400);
  // The tab button toggles, so only click it when the panel is not already open.
  const open = await page
    .locator('app-analysis-panel #analysisWrapper')
    .first()
    .isVisible()
    .catch(() => false);
  if (!open) await page.locator('button.leftButton').nth(2).click();
  await page.waitForTimeout(900);
}

/** Expansion headers live in a scrolling panel; bring one into view before clicking. */
async function expandRow(text) {
  const row = page.locator('mat-expansion-panel-header', { hasText: text }).first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await page.waitForTimeout(1500);
}

try {
  await page.goto(`${baseUrl}?${fourBar}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForReady(page);
  await dismissIntro();

  // --- Joint panel: joint B connects links AB and BC. ---
  await selectAndAnalyze('#jointHolder svg', 1);
  const jointHeading = await page.evaluate(
    () => document.body.innerText.match(/Analysis for Joint \w+/)?.[0]
  );
  await shot('01-joint-panel.png');

  const jointRows = await forceRowTitles();
  check('joint panel shows a Force Analysis section', jointRows !== null, { jointHeading });
  check(
    'joint panel has one "Force on Link X" row per connected link',
    (jointRows ?? []).filter((t) => /^Force on Link /.test(t)).length === 2,
    { jointHeading, jointRows }
  );
  check(
    'joint panel no longer renders the reaction dropdown',
    (await page.locator('.reaction-link-selector').count()) === 0
  );

  const jointToggle = await toggleLabels();
  check(
    'joint panel Force Analysis Type is Static / In-motion',
    jointToggle?.length === 2 &&
      /Static/.test(jointToggle[0].text) &&
      /In-motion/.test(jointToggle[1].text),
    { jointToggle }
  );
  check('force type defaults to Static', jointToggle?.[0]?.checked === true, { jointToggle });

  // Expand the first force row and confirm a chart renders.
  await expandRow('Force on Link');
  await shot('02-joint-force-graph.png');
  check(
    'expanding a joint force row renders a chart',
    (await page.locator('app-analysis-graph .apexcharts-canvas').count()) > 0
  );

  // The time labels used to be ellipsized down to "0...." by Apex label trimming.
  const axis = await page.evaluate(() =>
    [...document.querySelectorAll('.apexcharts-canvas')].flatMap((canvas) => {
      const bounds = canvas.getBoundingClientRect();
      return [...canvas.querySelectorAll('.apexcharts-xaxis-texts-g text')].map((label) => {
        const rect = label.getBoundingClientRect();
        return {
          text: label.textContent,
          clipped: rect.left < bounds.left - 1 || rect.right > bounds.right + 1,
        };
      });
    })
  );
  check(
    'x-axis time labels are shown in full and stay inside the chart',
    axis.length > 0 && axis.every((label) => !/\.\.\./.test(label.text) && !label.clipped),
    { axis }
  );

  // Flip the shared setting to dynamic from the joint side.
  await page.locator('mat-button-toggle', { hasText: 'In-motion' }).first().click();
  await page.waitForTimeout(1500);
  await shot('03-joint-dynamic.png');
  const afterFlip = await toggleLabels();
  check('joint panel toggle switches to In-motion', afterFlip?.[1]?.checked === true, {
    afterFlip,
  });

  // --- Link panel: link BC has external joints B and C. ---
  await selectAndAnalyze('#linkHolder path', 1);
  const linkHeading = await page.evaluate(
    () => document.body.innerText.match(/(Kinematic )?Analysis for Link \w+/)?.[0]
  );
  await shot('04-link-panel.png');

  check('link panel title dropped the "Kinematic" prefix', linkHeading === 'Analysis for Link BC', {
    linkHeading,
  });

  const linkRows = await forceRowTitles();
  check('link panel shows a Force Analysis section', linkRows !== null, { linkHeading });
  check(
    'link panel has one "Force at Joint X" row per external joint',
    (linkRows ?? []).filter((t) => /^Force at Joint /.test(t)).length === 2,
    { linkRows }
  );

  const linkToggle = await toggleLabels();
  check(
    'force analysis type is mechanism-wide (In-motion carried over to the link panel)',
    linkToggle?.[1]?.checked === true,
    { linkToggle }
  );

  await expandRow('Force at Joint');
  await shot('05-link-force-graph.png');
  check(
    'expanding a link force row renders a chart',
    (await page.locator('app-analysis-graph .apexcharts-canvas').count()) > 0
  );

  // Flip back from the link side and confirm the joint side follows.
  await page.locator('mat-button-toggle', { hasText: 'Static' }).first().click();
  await page.waitForTimeout(1200);
  await selectAndAnalyze('#jointHolder svg', 1);
  const backOnJoint = await toggleLabels();
  check(
    'flipping the type on the link panel updates the joint panel',
    backOnJoint?.[0]?.checked === true,
    { backOnJoint }
  );
  await shot('06-joint-after-link-flip.png');
} catch (error) {
  issue('Run failed', { severity: 'high', error: error?.stack || error?.message || String(error) });
} finally {
  await fs.writeFile(
    path.join(screenshotDir, `${runPrefix}-report.json`),
    JSON.stringify({ baseUrl, checks, issues }, null, 2)
  );
  await context.close().catch(() => {});
}

const failed = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ passed: checks.length - failed.length, failed, issues }, null, 2));
