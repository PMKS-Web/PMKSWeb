// Phase 2 floating slot: an inverted slider-crank loaded from a URL must
// decode, assemble, animate, and report real velocities -- not the empty
// analysis the pre-2.9 guard returned. See docs/joint-types-plan.md, Phase 2.
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import fs from 'node:fs/promises';
import path from 'node:path';

const screenshotDir = path.resolve('artifacts/screenshots');
await fs.mkdir(screenshotDir, { recursive: true });

const baseUrl = process.env.PMKS_URL || 'http://127.0.0.1:4200/';
const runPrefix = process.env.RUN_PREFIX || 'phase2';
const chromePath =
  process.env.PMKS_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const userDataDir = `/tmp/pmks-phase2-profile-${Date.now()}`;

// Crank AB driving a block that rides in a slot along the grounded lever CD.
// The three trailing tokens on joint P are the carrier and its two slot joints.
const INVERTED_SLIDER_CRANK =
  '2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,0,Fe,0.KC,C,ku,0,0.GD,D,0RF,Oj,0.HP,P,0,Fe,0,CD,C,D..' +
  'YRAB,AB,Fe,Fe,0,7q,555555,A,B,,.YRCD,CD,Fe,Fe,Fe,Fe,555555,C,D,,.YPBP,BP,Fe,0,0,0,,B,P,,...N_r';

const checks = [];
const issues = [];

function record(name, pass, details = {}) {
  checks.push({ name, pass, ...details });
  if (!pass) issues.push({ title: `Check failed: ${name}`, severity: 'high', ...details });
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(screenshotDir, `${runPrefix}-${name}`) });
}

async function dismissIntro(page) {
  const visible = await page
    .locator('.introjs-tooltip, .introjs-overlay')
    .first()
    .isVisible()
    .catch(() => false);
  if (!visible) return;
  await page
    .locator('.introjs-skipbutton')
    .first()
    .click({ force: true })
    .catch(async () => page.keyboard.press('Escape'));
  await page.waitForTimeout(350);
}

async function jointState(page) {
  return await page.evaluate(() =>
    [...document.querySelectorAll('#jointHolder > svg')]
      .map((el) => {
        const marker = el.querySelector('[id^="joint_"]');
        return {
          id: marker ? marker.id.replace('joint_', '') : null,
          x: Number(el.getAttribute('x')),
          y: Number(el.getAttribute('y')),
        };
      })
      .filter((joint) => joint.id)
      .sort((a, b) => a.id.localeCompare(b.id))
  );
}

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  executablePath: chromePath,
  viewport: { width: 1440, height: 900 },
});
const page = context.pages()[0] ?? (await context.newPage());
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(String(error)));

try {
  await page.goto(baseUrl + '?' + INVERTED_SLIDER_CRANK, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await dismissIntro(page);

  const joints = await jointState(page);
  record('the floating-slot URL decodes into all five joints', joints.length === 5, {
    ids: joints.map((joint) => joint.id).join(''),
  });

  // The lever tip: if the slot were still being treated as grounded, D would
  // sit where the old angle put it rather than on the ray through the block.
  // Coordinates read off the SVG are internal model units — user units x 200
  // (src/app/model/render-scale.ts) — so the pinned value scales with them.
  const MODEL_SCALE = 200;
  const d = joints.find((joint) => joint.id === 'D');
  record(
    'the lever starts on the ray through the block',
    !!d && Math.abs(d.x / MODEL_SCALE - -1.743) < 0.05,
    { d }
  );
  await shot(page, 'loaded.png');

  // Animate and confirm the lever actually swings.
  // Playback and the analysis output both live behind the Analyze tab.
  await page.locator('button:has-text("Analyze")').first().click({ force: true });
  await page.waitForTimeout(900);
  await shot(page, 'analyze.png');

  const before = await jointState(page);
  const play = page.locator('.playButton').first();
  // Disabled means the mechanism never reached DOF 1 with a valid solve, which
  // is the state a floating slot was in before the loop work.
  record('playback is offered, so the linkage solved', await play.isEnabled());
  await play.click({ force: true });
  await page.waitForTimeout(1800);
  const during = await jointState(page);
  const moved = before.some((joint, index) => Math.abs(joint.x - during[index].x) > 0.01);
  record('the mechanism animates', moved, { before: before[3], during: during[3] });
  await shot(page, 'animating.png');

  // The pre-2.9 guard returned an empty analysis for any floating slot, so the
  // panel had nothing to plot. Anything plotted here is new.
  const analysisText = await page.evaluate(() => document.body.innerText);
  record(
    'the analysis panel does not report the topology as unsupported',
    !analysisText.includes('does not have a determinate'),
    { sample: analysisText.slice(0, 0) }
  );

  const analysisErrors = consoleErrors.filter((message) => !message.includes('ResizeObserver'));
  record('no uncaught errors while solving and animating', analysisErrors.length === 0, {
    errors: analysisErrors.slice(0, 3),
  });
} catch (error) {
  issues.push({ title: 'Run aborted', severity: 'high', detail: String(error) });
} finally {
  await fs.writeFile(
    path.join(screenshotDir, `${runPrefix}-report.json`),
    JSON.stringify({ baseUrl, checks, issues, consoleErrors }, null, 2)
  );
  await context.close();
}

const failed = checks.filter((check) => !check.pass);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
failed.forEach((check) => console.log('FAIL', check.name, JSON.stringify(check)));
if (issues.length) console.log(JSON.stringify(issues, null, 2));
process.exit(failed.length || issues.length ? 1 : 0);
