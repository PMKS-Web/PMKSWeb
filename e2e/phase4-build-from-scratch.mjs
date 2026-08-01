// Build a linkage from an empty canvas with nothing but the mouse, then give it
// a slot and drive it — the whole Phase 4 story without a seeded URL anywhere.
//
// A URL-seeded fixture starts every check from a state the app never actually
// reached through its own UI. This one starts from nothing, so it exercises the
// creation path, the context menu, joint placement from tracked movement, and
// only then the new joint-type controls.
//
//   PMKS_PLAYWRIGHT_DIR=<dir> node e2e/phase4-build-from-scratch.mjs

import { mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const OUT = 'artifacts/phase4-scratch';

const results = [];
const consoleErrors = [];

function checkThat(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));
mkdirSync(OUT, { recursive: true });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

// The welcome tour covers the canvas on a first visit and silently swallows the
// right-click that opens the creation menu.
await page.evaluate(() => {
  const close = [...document.querySelectorAll('button, span, div')].find(
    (node) => node.textContent.trim() === '×'
  );
  close?.click();
});
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

/**
 * Place a joint by right-clicking, choosing Add Link, then moving to the target
 * before the finalising click. The canvas takes the position from tracked
 * pointer movement rather than from the click's own coordinates, so a click
 * without the move lands the joint wherever the pointer was last seen.
 */
async function addLinkFrom(from, to, label = 'Add Link') {
  await page.mouse.move(from.x, from.y);
  await page.mouse.click(from.x, from.y, { button: 'right' });
  await page.waitForTimeout(450);
  const item = page.locator('.cdk-overlay-container').getByText(label, { exact: true }).first();
  await item.click();
  await page.waitForTimeout(350);
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12);
    await page.waitForTimeout(15);
  }
  await page.mouse.click(to.x, to.y);
  await page.waitForTimeout(500);
}

const counts = () =>
  page.evaluate(() => ({
    joints: document.querySelectorAll('#jointHolder [id^="joint_"]').length,
    links: document.querySelectorAll('#linkHolder path[data-channels]').length,
    blocks: document.querySelectorAll('#sliderHolder .slider-block').length,
    channels: [...document.querySelectorAll('#linkHolder path[data-channels]')].reduce(
      (total, path) => total + Number(path.getAttribute('data-channels')),
      0
    ),
  }));

console.log('\nbuilding a two-bar chain from an empty canvas');
await addLinkFrom({ x: 500, y: 560 }, { x: 760, y: 560 });
const first = await counts();
checkThat('the first link exists', first.joints === 2 && first.links === 1, JSON.stringify(first));
await page.screenshot({ path: `${OUT}/1-first-link.png` });

// From the joint just placed, so the two links share it. The grid's menu says
// "Add Link"; a joint's says "Attach Link", which is the same gesture starting
// from something rather than from nothing.
await addLinkFrom({ x: 760, y: 560 }, { x: 880, y: 380 }, 'Attach Link');
const second = await counts();
checkThat(
  'a second link grows off the first',
  second.joints === 3 && second.links === 2,
  JSON.stringify(second)
);
await page.screenshot({ path: `${OUT}/2-second-link.png` });

console.log('\ncutting a slot on the linkage just drawn');
const ends = await page.evaluate(() =>
  [...document.querySelectorAll('#jointHolder [id^="joint_"]')].map((node) => {
    const box = node.getBoundingClientRect();
    return { id: node.id, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  })
);
checkThat('found the three joints', ends.length === 3, ends.map((e) => e.id).join(','));

// Drag the far joint of the second link onto the middle of the first one.
const dragged = ends[ends.length - 1];
const bar = { x: (ends[0].x + ends[1].x) / 2, y: (ends[0].y + ends[1].y) / 2 };
await page.mouse.move(dragged.x, dragged.y);
await page.mouse.down();
for (let i = 1; i <= 24; i++) {
  await page.mouse.move(
    dragged.x + ((bar.x - dragged.x) * i) / 24,
    dragged.y + ((bar.y - dragged.y) * i) / 24
  );
  await page.waitForTimeout(10);
}
await page.mouse.up();
await page.waitForTimeout(600);

const slotted = await counts();
checkThat(
  'the drop cut a slot on a linkage built entirely by mouse',
  slotted.blocks === 1 && slotted.channels === 1,
  JSON.stringify(slotted)
);
await page.screenshot({ path: `${OUT}/3-slot.png` });

console.log('\nand the panel drives it');
await page.click(`#${dragged.id}`);
await page.waitForTimeout(400);
const panel = await page.evaluate(() => document.body.innerText);
checkThat('the panel names the carrier it was dropped on', /Slot on:/.test(panel));

async function toggle(label) {
  const row = page.locator('#toggle-block .row').filter({ hasText: label }).first();
  await row.locator('button[role="switch"], .mdc-switch').first().click();
  await page.waitForTimeout(500);
}

await toggle('Weld');
checkThat(
  'welding it draws a plate',
  (await page.locator('#sliderHolder .slider-plate').count()) === 1
);
await page.screenshot({ path: `${OUT}/4-welded.png` });

await browser.close();

const failed = results.filter((r) => !r.ok);
writeFileSync(
  `${OUT}/report.json`,
  JSON.stringify({ results, consoleErrors, failed: failed.length }, null, 2)
);
console.log(`\nconsole errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 5).forEach((e) => console.log(`  ${e}`));
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 && consoleErrors.length === 0 ? 0 : 1);
