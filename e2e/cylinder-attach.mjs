/**
 * Attaching a cylinder to the rest of a linkage, by dragging a mount onto it.
 *
 * This is the gesture a ram exists for, and it used to delete the part: the
 * merge moved the mount out of every link and rebuilt connectivity, but the
 * slot cut into the barrel still named the joint that no longer existed, so the
 * slider stopped being well formed and the skin vanished with nothing said.
 *
 * Driven through the browser's own input pipeline, and checked on what a user
 * would see — is the cylinder still drawn as a cylinder.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/cylinder-attach.mjs
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const payload = readFileSync(
  'src/app/component/MODALS/templates/template-linkages.ts',
  'utf8'
).match(/Cylinder_Boom:\s*\n\s*'([^']+)'/)[1];

mkdirSync('artifacts/cylinder-attach', { recursive: true });

const ctx = await chromium.launchPersistentContext('/tmp/pmks-chrome-attach', {
  headless: true,
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
// A 404 on the app's own origin is a broken asset and worth failing on. One on
// somebody else's is the network this happens to be running on: Google's font
// CDN is unreachable here, and its four misses were being counted as four
// things the app did wrong.
page.on('response', (response) => {
  if (response.status() === 404 && response.url().startsWith(BASE)) {
    errors.push(`404 ${response.url()}`);
  }
});
page.on('console', (message) => {
  // Resource failures come through here without a URL, so they cannot be told
  // apart by origin; the listener above is what judges them.
  if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
    errors.push(message.text());
  }
});

const state = () =>
  page.evaluate(() => ({
    skins: document.querySelectorAll('.cylinder-mark').length,
    joints: document.querySelectorAll('[id^="joint_"]').length,
    // The block a stranded slider wears when it has nothing to slide along.
    dangling: document.querySelectorAll('.dangling-slider, [data-dangling="true"]').length,
    invalid: document.body.textContent.includes('nothing to slide along'),
  }));

const centreOf = (id) =>
  page.evaluate((jointId) => {
    const node = document.querySelector(`#joint_${jointId}`);
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, id);

async function dragJointOnto(from, to, name) {
  const a = await centreOf(from);
  const b = typeof to === 'string' ? await centreOf(to) : to;
  if (!a || !b) return { skipped: `no ${from} or ${JSON.stringify(to)}` };
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let step = 1; step <= 14; step++) {
    await page.mouse.move(a.x + ((b.x - a.x) * step) / 14, a.y + ((b.y - a.y) * step) / 14);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `artifacts/cylinder-attach/${name}.png` });
  return state();
}

const load = async () => {
  await page.goto(`${BASE}/?${payload}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  return state();
};

const report = {};
report.start = await load();

// 1 · the barrel mount onto the boom's ground pivot: a joint on another link.
report.ontoJoint = await dragJointOnto('G', 'O', 'mount-onto-joint');

// 2 · the rod mount onto the boom's own ground pivot. Both are joints of the
//     boom link, so the model refuses the merge -- and a refused merge has to
//     leave the part exactly as it was rather than half-applying.
await load();
report.refusedMerge = await dragJointOnto('C', 'O', 'refused-merge');

// 3 · a mount dropped in open space, which should attach to nothing and keep
//     the part exactly as it was.
await load();
const empty = { x: 1350, y: 780 };
report.ontoEmptySpace = await dragJointOnto('G', empty, 'mount-onto-empty');

report.errors = errors;
writeFileSync('artifacts/cylinder-attach/report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

const checks = [
  ['the template opens as one cylinder', report.start.skins === 1],
  ['merging the barrel mount onto another joint keeps the cylinder', report.ontoJoint.skins === 1],
  ['and it is not left stranded', !report.ontoJoint.invalid],
  [
    'a refused merge leaves the cylinder and the joint count alone',
    report.refusedMerge.skins === 1 && report.refusedMerge.joints === report.start.joints,
  ],
  ['a mount dropped in space keeps it', report.ontoEmptySpace.skins === 1],
  ['nothing threw', errors.length === 0],
];
for (const [what, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
await ctx.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
