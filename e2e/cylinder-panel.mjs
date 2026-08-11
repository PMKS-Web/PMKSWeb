/**
 * The cylinder panel, exercised the way it broke.
 *
 * Every case here came from someone driving the app rather than reading it, and
 * each was a real defect: a picker that moved the part it promises never to
 * move, an edit that could not be undone, a value silently held at a limit with
 * nothing said, and a position rounded until the panel disagreed with the
 * drawing.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/cylinder-panel.mjs
 */

import { readFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const payload = readFileSync(
  'src/app/component/MODALS/templates/template-linkages.ts',
  'utf8'
).match(/Cylinder_Boom:\s*\n\s*'([^']+)'/)[1];
const ctx = await chromium.launchPersistentContext('/tmp/pmks-chrome-reg', {
  headless: true,
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
const load = async () => {
  await page.goto(`${BASE}/?${payload}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  const b = await page.$('.cylinder-barrel');
  const box = await b.boundingBox();
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.62);
  await page.waitForTimeout(700);
};
const rows = () =>
  page.evaluate(() => {
    const all = [...document.querySelectorAll('#input-block')];
    const v = (l) =>
      all.find((r) => r.querySelector('.label')?.textContent?.trim() === l)?.querySelector('input')
        ?.value ?? null;
    const sel = (l) =>
      all.find((r) => r.querySelector('.label')?.textContent?.trim() === l)?.querySelector('select')
        ?.value ?? null;
    return {
      travel: v('Travel'),
      travelUnit: sel('Travel'),
      start: v('Starts at'),
      startUnit: sel('Starts at'),
      angle: v('Angle'),
      clamped: document.querySelector('.cylinder-clamped')?.textContent?.trim() ?? null,
    };
  });
const field = async (label) =>
  (await page.$$('#input-block')).find
    ? await page.$$eval(
        '#input-block',
        (bs, l) => bs.findIndex((b) => b.querySelector('.label')?.textContent?.trim() === l),
        label
      )
    : -1;
const setField = async (label, text) => {
  const i = await field(label);
  const inputs = await page.$$('#input-block input');
  await inputs[i].click({ clickCount: 3 });
  if (text !== '') await inputs[i].type(text);
  else await page.keyboard.press('Backspace');
};
const setUnit = async (label, value) => {
  const i = await field(label);
  const sels = await page.$$('#input-block select');
  await sels[i === 0 ? 0 : 1].selectOption(value);
  await page.waitForTimeout(600);
};
const out = {};

// 1 · blank percent then change the picker must not move the part
await load();
out.before1 = await rows();
await setField('Starts at', '');
await setUnit('Starts at', 'len');
out.after1 = await rows();

// 4 · a fractional percentage must survive the round trip
await load();
await setField('Starts at', '33.7');
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
out.fractional = await rows();

// 3 · an unreachable typed length must say it was held
await load();
await setUnit('Starts at', 'len');
await setField('Starts at', '0.4');
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
out.tooShort = await rows();

// 2 · a panel edit must be one undo step
await load();
await setField('Travel', '2');
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
out.beforeUndo = await rows();
await page.click('text=Undo');
await page.waitForTimeout(900);
const b2 = await page.$('.cylinder-barrel');
if (b2) {
  const bb = await b2.boundingBox();
  await page.mouse.click(bb.x + bb.width * 0.62, bb.y + bb.height * 0.62);
  await page.waitForTimeout(600);
}
out.afterUndo = { ...(await rows()), stillThere: !!b2 };

out.errs = errs;
console.log(JSON.stringify(out, null, 2));

const checks = [
  [
    // The picker re-expresses the value, so `start` legitimately changes from a
    // percentage to a length; the ram's own size and axis are what must not.
    'emptying the percentage and then changing its unit does not move the ram',
    out.after1.travel === out.before1.travel && out.after1.angle === out.before1.angle,
  ],
  ['a fractional percentage survives the round trip', out.fractional.start === '33.7'],
  [
    'a length the ram cannot reach says it was held',
    /shortest cylinder/.test(out.tooShort.clamped ?? ''),
  ],
  [
    'one panel edit is one undo step',
    // 2.73 is this ram's travel at the 0.7 object scale the templates open at.
    // A cylinder's stroke is measured against that scale — the head is drawn in
    // multiples of a joint radius — so the number here moves whenever the scale
    // does. It read 2.67 when they opened at 1.
    out.beforeUndo.travel === '2.00 cm' &&
      out.afterUndo.travel === '2.73 cm' &&
      out.afterUndo.stillThere,
  ],
  ['nothing threw', errs.length === 0],
];
for (const [what, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
await ctx.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
