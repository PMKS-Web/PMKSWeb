// Verifies the Force Analysis accordion on both the joint and the link
// analysis panels: one row per reacting link / per external joint, and a single
// mechanism-wide "Force Analysis Type" toggle shared by both.
//
// These rows now live in the Force mode rather than beside the kinematic ones,
// and that mode refuses to open without a load — so the four-bar is given one
// first, through the same context menu a user would reach for.
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import fs from 'node:fs/promises';
import path from 'node:path';

const screenshotDir = path.resolve('artifacts/screenshots');
await fs.mkdir(screenshotDir, { recursive: true });

const baseUrl = process.env.PMKS_BASE_URL || process.env.PMKS_URL || 'http://127.0.0.1:4200/';
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

/** Titles of the expansion rows under the Force Analysis subsection. */
/**
 * The reaction rows the panel is showing.
 *
 * They no longer sit inside a "Force Analysis" collapsible: the panel puts the
 * mode radio and the rows at its own level now, so the rows are found by what
 * they are rather than by what used to contain them.
 */
async function forceRowTitles() {
  return page.evaluate(() => {
    const panel = document.querySelector('app-analysis-panel');
    if (!panel || !/Force Analysis Type/.test(panel.innerText)) return null;
    return (
      [...panel.querySelectorAll('app-analysis-graph-section .graphTitle')]
        .map((el) => el.innerText.replace(/help_outline/g, '').trim())
        // "Force on Link AB" on a joint, "Force at Joint B" on a link.
        .filter((text) => /^Force (on Link|at Joint)/.test(text))
    );
  });
}

async function toggleLabels() {
  return page.evaluate(() => {
    const row = document.querySelector('.forceModeRow');
    const group = row?.querySelector('mat-button-toggle-group');
    if (!group) return null;
    return [...group.querySelectorAll('mat-button-toggle')].map((el) => ({
      text: el.innerText.trim(),
      checked: el.classList.contains('mat-button-toggle-checked'),
    }));
  });
}

/** Model-space point to screen, through the layer the mechanism is drawn in. */
const toScreen = (x, y) =>
  page.evaluate(
    ([modelX, modelY]) => {
      const m = document.querySelector('#linkHolder').getScreenCTM();
      return { x: modelX * m.a + modelY * m.c + m.e, y: modelX * m.b + modelY * m.d + m.f };
    },
    [x, y]
  );

const jointCoord = (id) =>
  page.evaluate((jointId) => {
    const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const joint = srv.joints.find((candidate) => candidate.id === jointId);
    return joint ? { x: joint.x, y: joint.y } : undefined;
  }, id);

const forceCount = () =>
  page.evaluate(
    () => ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.forces.length
  );

/**
 * Weigh every link.
 *
 * Links arrive massless, and "Mass on every link" is one of the things force
 * analysis asks for -- so a drawing that has never been given masses cannot
 * enter the mode at all, which is the requirement doing its job rather than
 * something to work around in the product.
 */
async function weighTheLinks() {
  await page.evaluate(() => {
    const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    srv.links.forEach((link) => {
      link.mass = 1;
      link.massMoI = 1;
    });
    srv.updateMechanism(true);
  });
  await page.waitForTimeout(600);
}

/** Hang a load on link BC, which is what makes the Force mode enterable at all. */
async function attachForceToBC() {
  const b = await jointCoord('B');
  const c = await jointCoord('C');
  const on = await toScreen(b.x + (c.x - b.x) * 0.4, b.y + (c.y - b.y) * 0.4);
  await page.mouse.move(on.x, on.y);
  await page.mouse.click(on.x, on.y, { button: 'right' });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const item = [...document.querySelectorAll('#contextMenu .cm-row')].find(
      (node) => node.querySelector('.cm-row__label')?.textContent?.trim() === 'Force'
    );
    item?.click();
  });
  await page.waitForTimeout(300);
  await page.mouse.move(on.x + 110, on.y - 80, { steps: 8 });
  await page.waitForTimeout(200);
  await page.mouse.click(on.x + 110, on.y - 80);
  await page.waitForTimeout(800);
}

/** Select a joint or link by clicking its SVG element, then open the Force mode. */
async function selectAndAnalyze(selector, index) {
  // Selection is an Edit-mode act; the analysis modes lock the geometry.
  await page.locator('.tabButton', { hasText: 'Edit' }).click();
  await page.waitForTimeout(400);
  await page.locator(selector).nth(index).click({ force: true });
  await page.waitForTimeout(400);
  await page.locator('.tabButton', { hasText: 'Force' }).click();
  await page.waitForTimeout(900);
}

/** Graph headers live in a scrolling panel; bring one into view before clicking. */
async function expandRow(text) {
  const row = page.locator('app-analysis-graph-section .graphHeader', { hasText: text }).first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await page.waitForTimeout(1500);
}

try {
  await page.goto(`${baseUrl}?${fourBar}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForReady(page);

  await weighTheLinks();
  await attachForceToBC();
  check('the four-bar took a load, so Force analysis can be entered', (await forceCount()) === 1, {
    forces: await forceCount(),
  });

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
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);
console.log(JSON.stringify({ passed: checks.length - failed.length, failed, issues }, null, 2));
process.exit(failed.length ? 1 : 0);
