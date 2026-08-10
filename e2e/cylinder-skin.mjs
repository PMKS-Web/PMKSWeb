/**
 * What the cylinder skin says without any annotation on it.
 *
 * The barrel used to carry two notches marking where the head bottoms out and a
 * dotted line saying "this translates". Both were describing the part rather
 * than being it. The head's own two stops are visible now: closed it stands a
 * clearance off the barrel's mount, so the two never collide; open it has come
 * entirely out of the barrel and rides the exposed rod. This checks that on the
 * drawn paths, and that nothing is drawn on the barrel to say it twice.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/cylinder-skin.mjs
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

const ctx = await chromium.launchPersistentContext('/tmp/pmks-chrome-cylskin', {
  headless: true,
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(`${BASE}/?${payloads['Cylinder_Boom']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

const barrel = await page.$('.cylinder-barrel');
const box = await barrel.boundingBox();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.waitForTimeout(700);

async function setStart(value) {
  const handle = await page.evaluateHandle(() => {
    for (const block of document.querySelectorAll('#input-block'))
      if (block.querySelector('.label')?.textContent?.trim() === 'Starts at')
        return block.querySelector('input');
    return null;
  });
  const field = handle.asElement();
  await field.click({ clickCount: 3 });
  await field.type(value);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
}

/**
 * The x extents of the three paths, in the mark's own frame.
 *
 * Every path is emitted centred on the pin with +x toward the rod, so the
 * numbers compare directly and there is no transform to undo. Walked by command
 * rather than scraped for numbers: an arc carries five parameters before its
 * endpoint, and a bare scrape reads radii as coordinates.
 */
const geometry = () =>
  page.evaluate(() => {
    const group = document.querySelector('.cylinder-mark');
    const xsOf = (selector) => {
      const data = group.querySelector(selector)?.getAttribute('d') ?? '';
      const tokens = data.match(/[A-Za-z]|-?[\d.]+(?:e-?\d+)?/g) ?? [];
      const out = [];
      let at = 0;
      let command = '';
      while (at < tokens.length) {
        if (/[A-Za-z]/.test(tokens[at])) {
          command = tokens[at++];
          continue;
        }
        if (command === 'M' || command === 'L') {
          out.push(+tokens[at]);
          at += 2;
        } else if (command === 'A') {
          out.push(+tokens[at + 5]);
          at += 7;
        } else if (command === 'H') {
          out.push(+tokens[at]);
          at += 1;
        } else at += 1;
      }
      return out;
    };
    const barrelXs = xsOf('.cylinder-barrel');
    const headXs = xsOf('path[filter="url(#elevation-1)"]');
    return {
      anchor: Math.min(...barrelXs),
      mouth: Math.max(...barrelXs),
      headBack: Math.min(...headXs),
      headFront: Math.max(...headXs),
      dashed: group.querySelectorAll('[stroke-dasharray]').length,
      // Arrow shafts live inside the driven group; a line anywhere else is a notch.
      notches: [...group.querySelectorAll('line')].filter(
        (node) => !node.closest('g[pointer-events="none"]')
      ).length,
    };
  });

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

await setStart('0');
const closed = await geometry();
// A gap, not a touch: the head's back edge stands clear of the joint at the
// barrel's mount rather than landing on top of it.
record(
  'closed, the head stands clear of the mount',
  closed.headBack - closed.anchor > 0.5 &&
    closed.headBack - closed.anchor < closed.mouth - closed.anchor,
  closed
);

await setStart('100');
const open = await geometry();
// Fully out of the barrel: the head's *back* edge is the one at the mouth.
record(
  'open, the head is entirely outside the barrel',
  Math.abs(open.headBack - open.mouth) < 0.01,
  open
);

await setStart('50');
const mid = await geometry();
record('nothing dashed is drawn on the barrel', mid.dashed === 0, mid);
record('and no stop notches either', mid.notches === 0, mid);
// Mid-travel the head is strictly inside, which is what makes the two stops
// above a statement about the ends rather than about every pose.
record(
  'mid-travel the head is inside the barrel',
  mid.headBack > mid.anchor && mid.headFront < mid.mouth,
  mid
);

record('nothing threw', errors.length === 0, errors.slice(0, 2));
await ctx.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
