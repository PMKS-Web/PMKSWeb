// Phase 3 Slide: a Scotch yoke loaded from a URL must decode, reach DOF 1,
// animate, and translate its yoke without ever rotating it. The weld at C is
// what makes all four of those true -- see docs/phase-3-slide-spec.md.
//
// None of this is reachable through the UI yet: a floating slot is born from
// Phase 4's drop-on-link gesture. A URL is the only way to put one on screen,
// which is exactly what the published fixture gallery is for.
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import fs from 'node:fs/promises';
import path from 'node:path';

const screenshotDir = path.resolve('artifacts/screenshots');
await fs.mkdir(screenshotDir, { recursive: true });

const baseUrl = process.env.PMKS_URL || 'http://127.0.0.1:4200/';
const runPrefix = process.env.RUN_PREFIX || 'phase3';
const chromePath =
  process.env.PMKS_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const userDataDir = `/tmp/pmks-phase3-profile-${Date.now()}`;

// Crank AB drives a block in the yoke's vertical slot; the yoke is welded at C
// to a block on a horizontal grounded guide. Joint C carries the weld flag.
const SCOTCH_YOKE =
  '2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,Fe,0,0.OC,C,Fe,0VG,0.GD,D,Fe,Fe,0.HE,E,Fe,0,0,CD,C,D.' +
  'LF,F,Fe,0VG,0..YRAB,AB,Fe,Fe,7q,0,c5cae9,A,B,,.YRCD,CD,Fe,Fe,Fe,07q,303e9f,C,D,,.' +
  'YPBE,BE,Fe,0,0,0,,B,E,,.YPCF,CF,Fe,0,0,0,,C,F,,...N_V';

const checks = [];
const issues = [];

function record(name, pass, details = {}) {
  checks.push({ name, pass, ...details });
  if (!pass) issues.push({ title: `Check failed: ${name}`, severity: 'high', ...details });
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(screenshotDir, `${runPrefix}-${name}`) });
}

/** Joint positions in model coordinates, not screen pixels. */
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

const byId = (joints, id) => joints.find((joint) => joint.id === id);

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  executablePath: chromePath,
  viewport: { width: 1440, height: 900 },
});
const page = context.pages()[0] ?? (await context.newPage());
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(String(error)));

try {
  await page.goto(baseUrl + '?' + SCOTCH_YOKE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const start = await jointState(page);
  record('the Slide URL decodes into all six joints', start.length === 6, {
    ids: start.map((joint) => joint.id).join(''),
  });
  await shot(page, 'loaded.png');

  // DOF 1 is the whole of task 3.3. Unwelded this linkage reports 2 and refuses
  // to simulate at all, so the mobility the running app arrived at is the
  // cheapest end-to-end proof the assembly merge reached it. The status strip
  // no longer prints the number, so it is read off the solved mechanism.
  const reportedDof = await page.evaluate(
    () =>
      ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.mechanisms[0]?.dof ??
      null
  );
  record('the app reports one degree of freedom', reportedDof === 1, { reported: reportedDof });

  await page.locator('.tabButton', { hasText: 'Kinematic' }).click({ force: true });
  await page.waitForTimeout(900);

  const play = page.locator('.playButton').first();
  record('playback is offered, so the linkage solved', await play.isEnabled());
  await play.click({ force: true });
  await page.waitForTimeout(2200);
  const during = await jointState(page);
  await shot(page, 'animating.png');

  const movedX = Math.abs(byId(during, 'C').x - byId(start, 'C').x);
  record('the yoke translates along its guide', movedX > 0.05, {
    startX: byId(start, 'C').x,
    duringX: byId(during, 'C').x,
  });

  // The weld is what forbids rotation. Without it the yoke would swing about
  // its guide and these two would drift apart -- and the picture would still
  // look like a working mechanism, which is why this is asserted rather than
  // eyeballed in the screenshot.
  const slotStaysVertical = Math.abs(byId(during, 'D').x - byId(during, 'C').x) < 0.02;
  record('the yoke never rotates: its slot stays vertical', slotStaysVertical, {
    cx: byId(during, 'C').x,
    dx: byId(during, 'D').x,
  });

  const stayedOnGuide = Math.abs(byId(during, 'C').y - byId(start, 'C').y) < 0.02;
  record('the yoke never leaves its guide', stayedOnGuide, {
    startY: byId(start, 'C').y,
    duringY: byId(during, 'C').y,
  });

  // The crank pin has to stay in the slot at every frame; the slot is vertical,
  // so that is one comparison.
  const pinInSlot = Math.abs(byId(during, 'B').x - byId(during, 'C').x) < 0.02;
  record('the crank pin stays in the slot', pinInSlot, {
    bx: byId(during, 'B').x,
    cx: byId(during, 'C').x,
  });

  const errors = consoleErrors.filter((message) => !message.includes('ResizeObserver'));
  record('no uncaught errors while solving and animating', errors.length === 0, {
    errors: errors.slice(0, 3),
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
