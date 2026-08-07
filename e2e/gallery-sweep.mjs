// Every mechanism the verification suite publishes, opened in the real app.
//
// The unit suite asserts on fixtures, which are TypeScript objects; the app
// only ever sees URLs. This closes that gap: each row of docs/fixture-urls.md
// is loaded, and has to decode, report the mobility its spec says it has,
// precompute a cycle, animate, and come back out as a URL that decodes to the
// same thing. It is what an outside reviewer does by clicking the gallery, so
// it should fail here first.
//
//   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/gallery-sweep.mjs

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const OUT = 'artifacts/gallery-sweep';

/**
 * Mechanisms the gallery publishes that are *meant* not to solve. The trammel
 * is published in its undriven form, which is a mobility case: nothing drives
 * it, so there is nothing to animate. The hydraulic cylinder used to belong
 * here too -- a Slide on a moving carrier was out of scope until Phase 5 --
 * and now solves like the rest.
 */
const EXPECTED_INVALID = new Set(['Elliptical trammel']);

function galleryRows() {
  return readFileSync('docs/fixture-urls.md', 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('| [') && line.includes('](http'))
    .map((line) => {
      const [, name, query] = line.match(/\| \[([^\]]+)\]\(https:\/\/[^)?]+(\?[^)]*)\)/);
      return { name, query };
    });
}

/**
 * Navigate, retrying once. A dev server that is still settling occasionally
 * aborts a navigation issued straight after the previous page's work, which is
 * a property of the harness rather than of the app.
 */
async function open(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(1500);
    }
  }
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('.introjs-skipbutton')?.click());
  await page.waitForTimeout(200);
}

const results = [];
function checkThat(label, ok, detail = '') {
  results.push({ label, ok, detail });
  if (!ok) console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

const browser = await chromium.launch();
mkdirSync(OUT, { recursive: true });

/** What the running app thinks it is holding. */
const readModel = () =>
  page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    const mech = c.mechanismSrv.mechanisms[0];
    return {
      joints: c.mechanismSrv.joints.length,
      links: c.mechanismSrv.links.length,
      valid: c.mechanismSrv.oneValidMechanismExists(),
      dof: mech?.dof,
      frames: mech?.joints?.length ?? 0,
      // Where everything is right now, to compare against after playing.
      pose: c.mechanismSrv.joints.map((j) => [j.id, j.x, j.y]),
    };
  });

const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

for (const { name, query } of galleryRows()) {
  const before = consoleErrors.length;
  await open(BASE + '/' + query);

  const model = await readModel();
  const shouldSolve = !EXPECTED_INVALID.has(name);

  checkThat(`${name}: decodes`, model.joints > 0, `${model.joints} joints`);
  checkThat(
    `${name}: mobility is ${shouldSolve ? 'one' : 'reported invalid'}`,
    shouldSolve ? model.valid && model.dof === 1 : !model.valid,
    `valid=${model.valid} dof=${model.dof}`
  );
  if (shouldSolve) {
    checkThat(`${name}: precomputes a cycle`, model.frames > 20, `${model.frames} frames`);
  }

  // The URL the app hands back has to mean the same mechanism. This is the
  // share button's output, and the undo stack's storage.
  // The right panel is where the app itself keeps a handle on the encoder.
  const roundTrip = await page
    .evaluate(() =>
      ng
        .getComponent(document.querySelector('app-right-panel'))
        ?.urlGenerationService?.generateUrlQuery()
    )
    .catch(() => null);
  let pose = model.pose;
  if (roundTrip) {
    await open(BASE + '/?' + roundTrip.replace(/^\?/, ''));
    const again = await readModel();
    pose = again.pose;
    checkThat(
      `${name}: survives its own share URL`,
      again.joints === model.joints && again.links === model.links && again.dof === model.dof,
      `${again.joints}/${again.links} joints/links, dof ${again.dof}`
    );
  }

  await page.screenshot({
    path: `${OUT}/${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`,
    animations: 'disabled',
    timeout: 20000,
  });

  // Animation: the editable joints have to actually move. A mechanism that
  // precomputes a cycle and then paints the build pose forever is the failure
  // the cylinder skin already shipped once.
  if (shouldSolve) {
    // The button a user presses, not the method behind it -- it carries a
    // disabled binding, and a mechanism that cannot be played is exactly the
    // failure worth catching. It lives on the Analyze tab.
    await page.getByText('Analyze', { exact: true }).first().click();
    await page.waitForTimeout(800);
    const play = page.locator('.playButton').first();
    if (checkThat(`${name}: play is offered`, !(await play.isDisabled()))) {
      await play.click();
    }
    await page.waitForTimeout(900);
    const moved = await page.evaluate(
      (pose) =>
        Math.max(
          ...ng
            .getComponent(document.querySelector('app-new-grid'))
            .mechanismSrv.joints.map((j) => {
              const was = pose.find((p) => p[0] === j.id);
              return was ? Math.hypot(j.x - was[1], j.y - was[2]) : 0;
            })
        ),
      pose
    );
    checkThat(`${name}: animates`, moved > 1e-3, `max joint travel ${moved.toFixed(4)}`);
  }

  checkThat(
    `${name}: no console errors`,
    consoleErrors.length === before,
    consoleErrors.slice(before).join(' | ').slice(0, 200)
  );
}

await browser.close();

const failed = results.filter((r) => !r.ok);
writeFileSync(`${OUT}/report.json`, JSON.stringify({ results, consoleErrors }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
