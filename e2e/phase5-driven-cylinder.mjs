// Gate 5 in the browser: the published cylinder-driven boom opens, reports a
// valid one-DOF mechanism, animates, and keeps its cylinder straight and
// whole all the way through the stroke — with the panel talking about
// extension rather than RPM.
//
//   PMKS_PLAYWRIGHT_DIR=<dir> node e2e/phase5-driven-cylinder.mjs

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const OUT = 'artifacts/phase5-driven-cylinder';

/** The boom's query string, taken from the generated gallery so they cannot drift. */
function boomQuery() {
  const row = readFileSync('docs/fixture-urls.md', 'utf8')
    .split('\n')
    .find((line) => line.includes('Cylinder-driven boom'));
  if (!row) throw new Error('Cylinder-driven boom is not in docs/fixture-urls.md');
  return row.match(/\(https:\/\/[^)?]+(\?[^)]*)\)/)[1];
}

const results = [];
const consoleErrors = [];

function checkThat(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));
mkdirSync(OUT, { recursive: true });

await page.goto(BASE + '/' + boomQuery(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.evaluate(() => document.querySelector('.introjs-skipbutton')?.click());
await page.waitForTimeout(300);

/** What the running app thinks it is holding. */
function model() {
  return page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    const mech = c.mechanismSrv.mechanisms[0];
    const joint = (id) => c.mechanismSrv.joints.find((j) => j.id === id);
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    return {
      jointIds: c.mechanismSrv.joints.map((j) => j.id),
      inputIds: c.mechanismSrv.joints.filter((j) => j.input).map((j) => j.id),
      sealedIds: c.mechanismSrv.joints.filter((j) => j.isSealed).map((j) => j.id),
      valid: c.mechanismSrv.oneValidMechanismExists(),
      dof: mech?.dof,
      frames: mech?.joints?.length ?? 0,
      cyclePeriod: mech?.cyclePeriod ?? 0,
      marks: document.querySelectorAll('.cylinder-mark').length,
      span: dist(joint('G'), joint('C')),
      boom: dist(joint('O'), joint('C')),
      barrel: dist(joint('G'), joint('N')),
      rod: dist(joint('P'), joint('C')),
      tip: { x: joint('C').x, y: joint('C').y },
    };
  });
}

/**
 * Where things are actually *drawn*, in screen pixels: the boom tip, and the
 * box the cylinder's skin occupies. Both, because they are cached separately —
 * the skin was painted once at the pose the mechanism was built in and left
 * there while every model-level assertion went on passing.
 */
function drawnGeometry() {
  return page.evaluate(() => {
    const centre = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
    };
    const skin = document.querySelector('.cylinder-mark')?.getBoundingClientRect();
    return {
      tip: centre('#joint_C'),
      skin: skin
        ? { x: +skin.x.toFixed(1), y: +skin.y.toFixed(1), w: +skin.width.toFixed(1) }
        : null,
    };
  });
}

const opened = await model();
console.log('\nphase5-driven-cylinder\n');
checkThat(
  'the published URL decodes to the boom',
  opened.jointIds.length === 6,
  opened.jointIds.join('')
);
checkThat(
  'the cylinder is sealed and drawn as a part',
  opened.sealedIds.length === 1 && opened.marks > 0,
  `marks=${opened.marks}`
);
checkThat(
  'the cylinder is the drive',
  opened.inputIds.join(',') === 'S',
  opened.inputIds.join(',')
);
checkThat('one degree of freedom', opened.dof === 1, `dof=${opened.dof}`);
checkThat('the mechanism solved', opened.valid, `valid=${opened.valid}`);
checkThat(
  'a full stroke of samples was precomputed',
  opened.frames >= 358 && opened.frames <= 361,
  `frames=${opened.frames}`
);
checkThat(
  'the cycle spans real seconds',
  opened.cyclePeriod > 0,
  `${opened.cyclePeriod.toFixed(3)}s`
);
await page.screenshot({ path: `${OUT}/01-opened.png` });

// Animate, sampling the part as it goes.
await page
  .locator('.leftButton', { hasText: 'Analyze' })
  .click()
  .catch(() => {});
await page
  .locator('.playbackControls')
  .waitFor({ state: 'visible' })
  .catch(() => {});
await page.waitForTimeout(500);
await page.locator('.playbackControls .playButton').click();

// Sampled well inside one cycle: at 0.66s a 320ms interval lands on nearly the
// same pose every other time, which makes a frozen canvas look like a moving
// one. Each sample also reads the rendered joint, so "the model moved" and
// "the drawing moved" are two separate claims.
const during = [];
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(90);
  during.push({ ...(await model()), drawn: await drawnGeometry() });
}
await page.waitForTimeout(120);
await page.screenshot({ path: `${OUT}/02-mid-stroke.png` });
await page.locator('.playbackControls .playButton').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/03-stopped.png` });

const spans = during.map((s) => s.span);
const spread = Math.max(...spans) - Math.min(...spans);
checkThat(
  'the cylinder actually extends and retracts',
  spread > 1,
  `span spread ${spread.toFixed(1)}`
);
checkThat(
  'the boom swings with it',
  Math.max(...during.map((s) => s.tip.x)) - Math.min(...during.map((s) => s.tip.x)) > 1,
  `tip x spread ${(Math.max(...during.map((s) => s.tip.x)) - Math.min(...during.map((s) => s.tip.x))).toFixed(1)}`
);
const rigid = (values, want) => Math.max(...values.map((v) => Math.abs(v - want)));
checkThat(
  'the boom stays rigid while it moves',
  rigid(
    during.map((s) => s.boom),
    opened.boom
  ) < 0.5,
  `worst ${rigid(
    during.map((s) => s.boom),
    opened.boom
  ).toFixed(3)}`
);
checkThat(
  'the barrel keeps its length',
  rigid(
    during.map((s) => s.barrel),
    opened.barrel
  ) < 0.5,
  `worst ${rigid(
    during.map((s) => s.barrel),
    opened.barrel
  ).toFixed(3)}`
);
checkThat(
  'the rod keeps its length',
  rigid(
    during.map((s) => s.rod),
    opened.rod
  ) < 0.5,
  `worst ${rigid(
    during.map((s) => s.rod),
    opened.rod
  ).toFixed(3)}`
);
checkThat(
  'the part stays skinned throughout',
  during.every((s) => s.marks > 0),
  `marks ${during.map((s) => s.marks).join(',')}`
);
// A canvas that stops redrawing while the model animates looks like a working
// mechanism in every model-level assertion above.
const drawnX = during.map((s) => s.drawn.tip?.x ?? 0);
checkThat(
  'the drawing follows the model, not just the numbers',
  Math.max(...drawnX) - Math.min(...drawnX) > 50,
  `drawn tip x spread ${(Math.max(...drawnX) - Math.min(...drawnX)).toFixed(0)}px`
);
// The skin is cached separately from the joints, so it can freeze on its own.
const skinBoxes = new Set(during.map((s) => JSON.stringify(s.drawn.skin)));
const skinWidths = during.map((s) => s.drawn.skin?.w ?? 0);
checkThat(
  'the cylinder skin is redrawn as the part moves',
  skinBoxes.size > 1,
  `${skinBoxes.size} distinct skin boxes in ${during.length} frames`
);
checkThat(
  'the skin lengthens and shortens with the stroke',
  Math.max(...skinWidths) - Math.min(...skinWidths) > 20,
  `skin width spread ${(Math.max(...skinWidths) - Math.min(...skinWidths)).toFixed(0)}px`
);

// The panel, back at rest: a cylinder talks about extension, not RPM.
await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.mechanismSrv.mechanismTimeStep = 0;
});
await page
  .locator('.leftButton', { hasText: 'Edit' })
  .click()
  .catch(() => {});
await page.waitForTimeout(400);
const mark = page.locator('.cylinder-mark').first();
await mark.click({ force: true }).catch(() => {});
await page.waitForTimeout(600);
const panelText = await page
  .locator('app-edit-panel')
  .innerText()
  .catch(() => '');
await page.screenshot({ path: `${OUT}/04-panel.png` });
checkThat(
  'the body panel opens on the cylinder',
  /Edit Cylinder/.test(panelText),
  panelText.slice(0, 60).replace(/\n/g, ' ')
);
checkThat(
  'the drive reads as extension, not rotation',
  /Extending|Retracting/.test(panelText) && !/Clockwise/.test(panelText),
  (panelText.match(/Extending|Retracting|Clockwise/g) ?? []).join(',')
);
checkThat(
  'the speed is a length per second',
  /cm\/s|m\/s|in\/s/.test(panelText),
  (panelText.match(/\w+\/s/g) ?? []).join(',')
);

checkThat('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
writeFileSync(
  `${OUT}/report.json`,
  JSON.stringify({ results, opened, during, consoleErrors }, null, 2)
);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
