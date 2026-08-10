/**
 * Attach Cylinder, from a link's own context menu.
 *
 * The same gesture as Attach Link with a different member on the end of it: the
 * right-click point is where the ram is bolted, the cursor is where its rod
 * finishes, and the next left-click commits. What this checks is that the mount
 * actually joins the link's body — a ram that merely sits near a bar is not
 * attached to it — and that the whole assembly is one undo step.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/attach-cylinder.mjs
 */

import { readFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const src = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const payloads = Object.fromEntries(
  [...src.matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [id, p])
);
import { waitForReady } from './app-ready.mjs';

const ctx = await chromium.launchPersistentContext('/tmp/pmks-chrome-attachcyl', {
  headless: true,
  viewport: { width: 1500, height: 950 },
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

/** Everything a user could see change, plus what the model says underneath. */
const state = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const cylinder = grid.mechanismSrv.sealedStructures()[0];
    const between = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    return {
      joints: [...document.querySelectorAll('[id^="joint_"]')].map((n) => n.id.slice(6)).join(''),
      skins: document.querySelectorAll('.cylinder-mark').length,
      dof: (document.body.textContent.match(/Degrees of Freedom:\s*(-?[\d.]+|—)/) ?? [])[1],
      links: grid.mechanismSrv.links.map((link) => link.id),
      nan: [...document.querySelectorAll('svg *')].filter((node) =>
        [...node.attributes].some((a) => /NaN/.test(a.value))
      ).length,
      ram: cylinder
        ? {
            barrel: between(cylinder.barrelFar, cylinder.barrelNear),
            rod: between(cylinder.pin, cylinder.rodFar),
            span: between(cylinder.barrelFar, cylinder.rodFar),
            pinAlong: between(cylinder.barrelFar, cylinder.pin),
            mountLinks: cylinder.barrelFar.links.map((link) => link.id),
          }
        : undefined,
    };
  });

const before = await state();

// A point actually ON the coupler: a bounding-box centre lands off a diagonal bar.
const on = await page.evaluate(() => {
  const path = document.querySelector('#linkHolder path.link-default');
  const point = path.getPointAtLength(path.getTotalLength() * 0.35);
  const m = path.getScreenCTM();
  return { x: point.x * m.a + point.y * m.c + m.e, y: point.x * m.b + point.y * m.d + m.f };
});
await page.mouse.move(on.x, on.y);
await page.mouse.click(on.x, on.y, { button: 'right' });
await page.waitForTimeout(600);

const menu = await page.evaluate(() =>
  [...document.querySelectorAll('#contextMenu #menu-item')].map((item) => ({
    label: item.textContent.trim().replace(/\s+/g, ' '),
    disabled: item.classList.contains('disabledItem'),
  }))
);
const entry = menu.find((item) => item.label === 'Attach Cylinder');
record('a link offers Attach Cylinder', !!entry && !entry.disabled, menu);
// Beside Attach Link, not somewhere else in the list: they are the same act.
record(
  'and offers it beside Attach Link',
  menu.findIndex((item) => item.label === 'Attach Cylinder') ===
    menu.findIndex((item) => item.label === 'Attach Link') + 1,
  menu.map((item) => item.label)
);

await page.evaluate(() => {
  const item = [...document.querySelectorAll('#contextMenu #menu-item')].find((node) =>
    /Attach Cylinder/.test(node.textContent)
  );
  item.querySelector('button').click();
});
await page.waitForTimeout(400);
await page.mouse.move(on.x + 260, on.y - 170);
await page.waitForTimeout(300);
await page.mouse.click(on.x + 260, on.y - 170);
await page.waitForTimeout(1500);

const after = await state();
record('the gesture builds one cylinder', after.skins === 1 && !!after.ram, after);
record(
  'barrel and rod are equal, and the span is the two of them',
  !!after.ram &&
    Math.abs(after.ram.barrel - after.ram.rod) < 0.01 &&
    Math.abs(after.ram.pinAlong + after.ram.barrel - after.ram.span) < 0.01,
  after.ram
);
// The point of attaching rather than drawing: the mount is a member of the bar
// that was right-clicked, so the ram swings with it.
const grew = after.links.find(
  (id) => !before.links.includes(id) && before.links.some((old) => id.startsWith(old))
);
record(
  "the mount joins the link's own body",
  !!grew && !!after.ram && after.ram.mountLinks.includes(grew),
  { grew, mountLinks: after.ram?.mountLinks, before: before.links, after: after.links }
);
// Two freedoms, because the rod's far end is deliberately left unattached.
record('the free rod end shows as two added freedoms', after.dof === '3', {
  before: before.dof,
  after: after.dof,
});
record('nothing is drawn NaN', after.nan === 0, after.nan);

await page.evaluate(() => {
  const button = [...document.querySelectorAll('button')].find((n) => /Undo/.test(n.textContent));
  if (button && !button.disabled) button.click();
});
await page.waitForTimeout(1200);
const undone = await state();
record(
  'and the whole ram is one undo step',
  undone.skins === 0 && undone.joints === before.joints && undone.dof === before.dof,
  { before, undone }
);

record('nothing threw', errors.length === 0, errors.slice(0, 2));
await ctx.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
