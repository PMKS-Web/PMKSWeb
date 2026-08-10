/**
 * Dragging a cylinder's mount: pose first, then size.
 *
 * The three phases the ram is supposed to have — slide the piston inside the
 * travel, grow past the extended stop, shrink past the retracted one — driven
 * through the browser's own input pipeline rather than dispatched events, and
 * read back off the Edit panel so what is checked is what a user would see.
 *
 * The mechanism is the Gate 5 boom: its rod mount is the boom tip, pinned to a
 * circle about the boom's pivot, so swinging it round takes the span below the
 * retracted stop and above the extended one without any other edit.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/cylinder-drag.mjs
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const SOURCE = 'src/app/component/MODALS/templates/template-linkages.ts';
const payload = readFileSync(SOURCE, 'utf8').match(/Cylinder_Boom:\s*\n\s*'([^']+)'/)[1];

mkdirSync('artifacts/cylinder-drag', { recursive: true });

const ctx = await chromium.launchPersistentContext('/tmp/pmks-chrome-cyldrag', {
  headless: true,
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto(`${BASE}/?${payload}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

/** The panel's own numbers, which is the point: this is what a user reads. */
const readPanel = () =>
  page.evaluate(() => {
    const rows = [...document.querySelectorAll('#input-block')];
    const value = (label) =>
      rows.find((row) => row.querySelector('.label')?.textContent?.trim() === label)?.querySelector('input')
        ?.value ?? null;
    return {
      travel: value('Travel'),
      startsAt: value('Starts at'),
      clamped: document.querySelector('.cylinder-clamped')?.textContent?.trim() ?? null,
    };
  });

/** Where the rod mount is on screen right now. */
const mountAt = () =>
  page.evaluate(() => {
    const svg = document.querySelector('#canvas') ?? document.querySelector('svg');
    const circles = [...svg.querySelectorAll('circle')].filter((c) => c.getBoundingClientRect().width > 6);
    // The boom tip is the highest joint on screen.
    const boxes = circles.map((c) => c.getBoundingClientRect());
    const top = boxes.reduce((best, box) => (box.y < best.y ? box : best));
    return { x: top.x + top.width / 2, y: top.y + top.height / 2 };
  });

// Select the cylinder so the panel is showing before anything moves.
const barrel = await page.$('.cylinder-barrel');
const box = await barrel.boundingBox();
await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.62);
await page.waitForTimeout(600);
const resting = await readPanel();

/** One press-move-release, in steps, the way a hand moves. */
async function drag(dx, dy, name) {
  const from = await mountAt();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step++) {
    await page.mouse.move(from.x + (dx * step) / 12, from.y + (dy * step) / 12);
    await page.waitForTimeout(16);
  }
  // Read the transient notice before releasing: it belongs to the gesture.
  const notice = await page.evaluate(
    () => document.querySelector('simple-snack-bar, .mat-mdc-snack-bar-label')?.textContent?.trim() ?? null
  );
  await page.mouse.up();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `artifacts/cylinder-drag/${name}.png` });
  // The drag selects the joint it moved, which closes the cylinder's panel, so
  // put the selection back on the body before reading the numbers off it.
  const skin = await page.$('.cylinder-barrel');
  const area = await skin.boundingBox();
  await page.mouse.click(area.x + area.width * 0.62, area.y + area.height * 0.62);
  await page.waitForTimeout(400);
  return { ...(await readPanel()), notice };
}

// 1 · a small swing, well inside the ram's own travel.
const posed = await drag(40, 30, 'inside-travel');
// 2 · pushed hard toward the barrel mount: past the retracted stop, the ram shrinks.
const shrunk = await drag(150, 240, 'past-retracted');
// 3 · and pulled away again, past the extended stop, where it grows.
const grown = await drag(-330, -180, 'past-extended');
// 4 · from a fresh template, the rod mount pushed almost the whole way onto the
//     barrel's own, which is well past the floor whatever the ram measures.
//     Aimed at the mount by name rather than moved by a count of pixels: how
//     far "past the floor" is depends on the ram's size, and the size is what
//     the drags above have spent the run changing.
await page.goto(`${BASE}/?${payload}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
const centreOf = (id) =>
  page.evaluate((jointId) => {
    const node = document.querySelector(`#joint_${jointId}`);
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, id);
const rodMount = await centreOf('C');
const barrelMount = await centreOf('G');
const floored = await drag(
  (barrelMount.x - rodMount.x) * 0.95,
  (barrelMount.y - rodMount.y) * 0.95,
  'onto-the-floor'
);

const report = { resting, posed, shrunk, grown, floored, errors };
writeFileSync('artifacts/cylinder-drag/report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

const strokeOf = (panel) => Number(String(panel.travel ?? '').replace(/[^\d.]/g, ''));
const checks = [
  ['a drag inside the travel leaves the size alone', strokeOf(posed) === strokeOf(resting)],
  ['pushing past the retracted stop shrinks the ram', strokeOf(shrunk) < strokeOf(resting)],
  ['pulling past the extended stop grows it again', strokeOf(grown) > strokeOf(shrunk)],
  [
    'the drag says so when it stops at the shortest cylinder',
    /shortest cylinder/.test(floored.notice ?? ''),
  ],
  ['nothing threw', errors.length === 0],
];
for (const [what, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
await ctx.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
