/**
 * What the creation gestures promise, and what they deliver.
 *
 * Drawing a link or a cylinder shows a ghost under the cursor. A ghost is a
 * promise about what the next click will make, so the colour it wears has to be
 * the colour the part turns out to be — otherwise the promise is broken at the
 * exact moment it is kept, which is the one moment a user is looking.
 *
 * The colour comes from a cursor that advances every time a link is built, so
 * two things have to hold together: the ghost has to *peek* at that cursor
 * rather than take from it — a cancelled gesture must not shuffle every colour
 * after it — and consecutive parts have to come out in consecutive colours.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/creation-previews.mjs
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

const linkIds = () =>
  page.evaluate(() =>
    ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.links.map((l) => l.id)
  );

/** Run one creation gesture from a joint, and report what it promised and made. */
async function draw(kind, jointId, to) {
  const at = await page.evaluate((id) => {
    const box = document.querySelector('#joint_' + id).getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, jointId);

  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.waitForTimeout(600);
  await page.evaluate(
    (label) => {
      const item = [...document.querySelectorAll('#contextMenu #menu-item')].find((node) =>
        node.textContent.includes(label)
      );
      item?.querySelector('button')?.click();
    },
    kind === 'link' ? 'Attach Link' : 'Attach Cylinder'
  );
  await page.waitForTimeout(300);

  await page.mouse.move(at.x + to.dx, at.y + to.dy, { steps: 10 });
  await page.waitForTimeout(250);
  const promised = await page.evaluate((which) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return which === 'link' ? grid.linkPreview?.fill : grid.cylinderPreview?.fill;
  }, kind);

  const before = await linkIds();
  await page.mouse.click(at.x + to.dx, at.y + to.dy);
  await page.waitForTimeout(1200);
  // What the user actually sees a cylinder wearing is its *barrel's* colour:
  // the rod is drawn in it too, because one part gets one colour.
  const delivered = await page.evaluate((prev) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const fresh = grid.mechanismSrv.links.filter((link) => !prev.includes(link.id));
    return fresh.map((link) => link.fill).filter(Boolean);
  }, before);
  return { promised, delivered };
}

await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

// --- a gesture that is abandoned must not spend a colour --------------------
const beforeCancel = await page.evaluate(
  () => ng.getComponent(document.querySelector('app-new-grid')).nextLinkColor
);
const onJoint = await page.evaluate(() => {
  const box = document.querySelector('#joint_C').getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
});
await page.mouse.move(onJoint.x, onJoint.y);
await page.mouse.click(onJoint.x, onJoint.y, { button: 'right' });
await page.waitForTimeout(600);
await page.evaluate(() => {
  const item = [...document.querySelectorAll('#contextMenu #menu-item')].find((node) =>
    node.textContent.includes('Attach Link')
  );
  item?.querySelector('button')?.click();
});
await page.waitForTimeout(300);
await page.mouse.move(onJoint.x - 200, onJoint.y + 160, { steps: 8 });
await page.waitForTimeout(200);
// Right-click cancels the gesture, as it does for every creation here.
await page.mouse.click(onJoint.x - 200, onJoint.y + 160, { button: 'right' });
await page.waitForTimeout(500);
const afterCancel = await page.evaluate(
  () => ng.getComponent(document.querySelector('app-new-grid')).nextLinkColor
);
record('an abandoned gesture does not spend a colour', beforeCancel === afterCancel, {
  beforeCancel,
  afterCancel,
});

// --- what is promised is what is made --------------------------------------
await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

const firstLink = await draw('link', 'C', { dx: -300, dy: 260 });
record(
  'the link ghost wears the colour the link is built with',
  !!firstLink.promised && firstLink.delivered.includes(firstLink.promised),
  firstLink
);

const secondLink = await draw('link', 'D', { dx: -180, dy: 170 });
record(
  'and the next one promises the next colour, not the same one again',
  !!secondLink.promised &&
    secondLink.delivered.includes(secondLink.promised) &&
    secondLink.promised !== firstLink.promised,
  { firstLink, secondLink }
);

await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
const ram = await draw('cylinder', 'C', { dx: -300, dy: 260 });
record(
  'the cylinder ghost wears the colour its barrel is built with',
  !!ram.promised && ram.delivered.includes(ram.promised),
  ram
);

record('nothing threw', errors.length === 0, errors.slice(0, 2));
await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
