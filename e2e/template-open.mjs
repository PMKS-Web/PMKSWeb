/**
 * Checks how the template library opens a linkage: in place when the grid is
 * empty, and through a new-tab / replace / cancel choice dialog when the grid
 * already holds work. Replacing must be undoable.
 *
 * Run: node e2e/template-open.mjs
 */
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { mkdirSync, writeFileSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';
const OUT = 'artifacts/template-open';
mkdirSync(OUT, { recursive: true });
const FOUR_BAR =
  '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq';
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
let newPages = 0;
context.on('page', () => newPages++);

const linkCount = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('svg path')].filter((p) =>
        (p.getAttribute('d') ?? '').startsWith('M')
      ).length
  );

// Templates moved off the file toolbar and into the project menu, so it takes
// two presses to reach now.
const openTemplates = async (page) => {
  await page.locator('.topStrip .iconButton').first().click();
  await page.locator('.projectMenu #templatesButton').click();
  await page.waitForTimeout(600);
};

// --- Case 1: empty grid, template loads in this window -----------------------
const page = await context.newPage();
page.setDefaultTimeout(15000);
newPages = 0; // ignore the page we created ourselves
const BASE = process.env.PMKS_BASE_URL ?? process.env.PMKS_URL ?? 'http://127.0.0.1:4200/';
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(600);
// The library opens by itself on a blank start; open it from the menu if not.
if (
  !(await page
    .locator('#templates')
    .isVisible()
    .catch(() => false))
) {
  await openTemplates(page);
}
const before = await linkCount(page);
await page.locator('#templates panel-section').first().click();
await page.waitForTimeout(1500);
const after = await linkCount(page);
check(
  'Empty grid: template loads in the same window',
  newPages === 0 && after > before,
  `links ${before} -> ${after}, new tabs=${newPages}`
);
check(
  'Empty grid: library closes after loading',
  !(await page
    .locator('#templates')
    .isVisible()
    .catch(() => false))
);

// --- Case 2: existing work brings up the choice dialog -----------------------
await page.goto(`${BASE}?${FOUR_BAR}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(800);
await openTemplates(page);
await page.locator('#templates panel-section').nth(1).click(); // Watt I
await page.waitForTimeout(600);
const dialogVisible = await page
  .locator('text=already a linkage on the grid')
  .isVisible()
  .catch(() => false);
check('Existing work: choice dialog appears', dialogVisible);

// Cancel keeps everything as it was.
await page.locator('button:has-text("Cancel")').click();
await page.waitForTimeout(400);
check(
  'Cancel keeps the library open and loads nothing',
  (await page
    .locator('#templates')
    .isVisible()
    .catch(() => false)) && newPages === 0
);

// Replace swaps the linkage in this window (Watt I has more links than the four-bar).
const beforeReplace = await linkCount(page);
await page.locator('#templates panel-section').nth(1).click();
await page.waitForTimeout(600);
await page.locator('button:has-text("Replace")').click();
await page.waitForTimeout(1500);
const afterReplace = await linkCount(page);
check(
  'Replace loads the template in this window',
  newPages === 0 && afterReplace !== beforeReplace,
  `links ${beforeReplace} -> ${afterReplace}, new tabs=${newPages}`
);

// Undo brings the old linkage back. Undo now sits in the top strip in every
// mode, so no mode switch is needed; it being enabled proves the replace saved.
const undo = page.locator('.historyButton', { hasText: 'Undo' });
check('Replace armed Undo', (await undo.isDisabled()) === false);
await undo.click();
await page.waitForTimeout(1200);
const afterUndo = await linkCount(page);
check(
  'Undo restores the replaced linkage',
  afterUndo === beforeReplace,
  `links ${afterReplace} -> ${afterUndo}`
);

// New tab path still works.
if (
  !(await page
    .locator('#templates')
    .isVisible()
    .catch(() => false))
) {
  await openTemplates(page);
}
await page.locator('#templates panel-section').first().click();
await page.waitForTimeout(600);
await page.locator('button:has-text("Open in a new tab")').click();
await page.waitForTimeout(2000);
check('Open in a new tab spawns exactly one tab', newPages === 1, `new tabs=${newPages}`);

await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify({ results }, null, 2));
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
