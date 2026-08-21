/**
 * Every state the top strip has, checked in a browser.
 *
 * The strip has four things that vary independently, and the combinations are
 * where it went wrong: how much room the window leaves it, how much the status
 * chips are saying, which mode is showing, and whether it was laid out at that
 * size or resized to it. Fixed breakpoints made the first two disagree; a
 * remembered measurement made the last two disagree.
 *
 * What must hold in every combination:
 *
 *   - Nothing in the tab card is outside the tab card.
 *   - The card is not scrolled (its content fits, or the labels gave way).
 *   - The page does not scroll sideways.
 *   - The history card stays inside the window.
 *   - Shrinking and growing back cross the same steps, with room to spare
 *     either side, so a window dragged slowly does not flicker between them.
 *
 *   PMKS_BASE_URL=<origin> node e2e/top-strip-states.mjs
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

/** Two joints and a bar: in no mechanism, so nothing about it is ready. */
const LONE_BAR =
  '2P.Zz,1E8.5,0.1011.0A,A,2UW,9v,0.0B,B,3E8,1Zn,0..YRAB,AB,Fe,Fe,2sK,sr,303e9f,A,B,,...N_P';

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

/** Everything about the strip that can be wrong. */
const inspect = (page) =>
  page.evaluate(() => {
    const strip = document.querySelector('.topStrip');
    const card = document.querySelector('.tabCard');
    const history = document.querySelector('.historyCard');
    if (!strip || !card) return { missing: true };
    const box = card.getBoundingClientRect();
    // A hidden element has a zero rect at the origin, which is not "outside".
    const escaped = [...card.querySelectorAll('.tabButton,.chip')]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
        return rect.right > box.right + 0.5 || rect.left < box.left - 0.5;
      })
      .map((node) => node.textContent.trim().slice(0, 16));
    // scrollWidth still reports content that overflow:hidden has clipped, so
    // whether the page can actually be scrolled is the honest question.
    const scroller = document.scrollingElement;
    const was = scroller.scrollLeft;
    scroller.scrollLeft = 300;
    const scrolls = scroller.scrollLeft;
    scroller.scrollLeft = was;
    return {
      level: Number((strip.className.match(/fit(\d)/) ?? [, '3'])[1]),
      clipped: card.scrollWidth - card.clientWidth,
      escaped,
      scrolls,
      pastEdge: Math.round(
        (history?.getBoundingClientRect().right ?? 0) - document.documentElement.clientWidth
      ),
      chips: [...document.querySelectorAll('.chip')].map((chip) => chip.textContent.trim()),
    };
  });

const broken = (state) =>
  state.missing
    ? false
    : state.clipped > 1 || state.escaped.length > 0 || state.scrolls > 0 || state.pastEdge > -6;

const browser = await chromium.launch();
const errors = [];

// --- every drawing, at every width, in every mode --------------------------
const WIDTHS = [1500, 1200, 1015, 1000, 900, 820, 800, 745, 735, 500, 400, 360];
const DRAWINGS = [
  ['an empty grid', ''],
  ['geometry in no mechanism', LONE_BAR],
  ['a four-bar that runs', payloads['4-Bar']],
  ['a cylinder boom', payloads['Cylinder_Boom']],
  ['a Jansen leg', payloads['Jansen_Leg']],
];

const failures = [];
for (const [what, payload] of DRAWINGS) {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 860 } });
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`${BASE}/${payload ? '?' + payload : ''}`, { waitUntil: 'domcontentloaded' });
    await waitForReady(page).catch(() => undefined);
    for (const mode of ['Synthesis', 'Edit', 'Kinematic', 'Force']) {
      await page
        .locator('.tabButton', { hasText: mode })
        .click({ force: true })
        .catch(() => undefined);
      await page.waitForTimeout(300);
      const state = await inspect(page);
      if (broken(state)) failures.push({ what, width, mode, ...state });
    }
    await page.close();
  }
}
record(
  `the strip holds together in all ${DRAWINGS.length * WIDTHS.length * 4} states`,
  failures.length === 0,
  failures.slice(0, 6)
);

// --- shrinking and growing back --------------------------------------------
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

const sweep = async (from, to, step) => {
  const seen = [];
  for (let width = from; step < 0 ? width >= to : width <= to; width += step) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(130);
    seen.push({ width, ...(await inspect(page)) });
  }
  return seen;
};

const down = await sweep(1500, 380, -10);
const up = await sweep(380, 1500, 10);
record(
  'nothing breaks at any width on the way down or back up',
  [...down, ...up].every((state) => !broken(state)),
  [...down, ...up].filter(broken).slice(0, 4)
);

const steps = (seen) =>
  seen.filter((state, i) => i > 0 && state.level !== seen[i - 1].level).map((s) => s.width);
const downSteps = steps(down);
const upSteps = steps(up);
record(
  'it steps down through the ladder and back up the same way',
  downSteps.length === 3 && upSteps.length === 3,
  { downSteps, upSteps }
);
// Hysteresis: the width it gives a label back at is above the one it took it
// away at, so a window dragged slowly across the boundary does not flicker.
record(
  'and gives each label back a little wider than it took it away',
  downSteps.every((width, i) => upSteps[upSteps.length - 1 - i] > width),
  { downSteps, upSteps }
);

// --- the chips changing under a fixed window --------------------------------
await page.setViewportSize({ width: 1015, height: 900 });
await page.waitForTimeout(400);
const chipStates = [];
for (let round = 0; round < 3; round++) {
  await page.evaluate(() => {
    const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const driven = srv.joints.find((joint) => joint.input);
    if (driven) driven.input = false;
    else srv.joints[0].input = true;
    srv.updateMechanism(true);
  });
  await page.waitForTimeout(600);
  chipStates.push(await inspect(page));
}
record(
  'a status chip changing width never leaves the strip clipped',
  chipStates.every((state) => !broken(state)),
  chipStates
);

record('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
