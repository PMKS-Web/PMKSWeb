// Phase 4.2 — the eight base marks, drawn on real mechanisms.
//
// Loads each of the four reference linkages and checks that the mark system
// actually reaches the canvas: a channel cut from each carrier, a black block
// per slider, a weld plate only where a joint is welded, rails only where the
// slot is grounded. Screenshots land in artifacts/ for eyes-on inspection --
// element counts alone would pass on a mark drawn in the wrong place.
//
//   NODE_PATH=<playwright>/node_modules node e2e/phase4-marks.mjs

import { mkdirSync, writeFileSync } from 'node:fs';

// ESM ignores NODE_PATH, so the out-of-tree Playwright is resolved by path.
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const OUT = 'artifacts/phase4-marks';

const MECHANISMS = [
  {
    name: 'scotch-yoke',
    note: 'a grounded Slide driven by a floating Slot',
    query:
      '?2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,Fe,0,0.OC,C,Fe,0VG,0.GD,D,Fe,Fe,0.HE,E,Fe,0,0,CD,C,D.LF,F,Fe,0VG,0..YRAB,AB,Fe,Fe,7q,0,c5cae9,A,B,,.YRCD,CD,Fe,Fe,Fe,07q,303e9f,C,D,,.YPBE,BE,Fe,0,0,0,,B,E,,.YPCF,CF,Fe,0,0,0,,C,F,,...N_V',
    expect: { blocks: 2, plates: 1, rails: 1, channels: 1 },
  },
  {
    name: 'inverted-slider-crank',
    note: 'one floating Slot, nothing welded',
    query:
      '?2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,0,Fe,0.KC,C,ku,0,0.GD,D,0RF,Oj,0.HP,P,0,Fe,0,CD,C,D..YRAB,AB,Fe,Fe,0,7q,c5cae9,A,B,,.YRCD,CD,Fe,Fe,9q,CN,303e9f,C,D,,.YPBP,BP,Fe,0,0,0,,B,P,,...N_r',
    expect: { blocks: 1, plates: 0, rails: 0, channels: 1 },
  },
  {
    name: 'four-bar-slotted-coupler',
    note: 'a slot cut into a moving coupler',
    query:
      '?2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,Fe,0,0.GC,C,d4,ec,0.KD,D,_W,0,0.KE,E,VG,7q,0.GF,F,bo,cO,0.HP,P,bo,cO,0,BC,B,C..YRAB,AB,Fe,Fe,7q,0,c5cae9,A,B,,.YRBC,BC,Fe,Fe,RM,KJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,oo,KJ,0d125a,C,D,,.YREF,EF,Fe,Fe,YX,N6,B2DFDB,E,F,,.YPFP,FP,Fe,0,0,0,,F,P,,...N_L',
    expect: { blocks: 1, plates: 0, rails: 0, channels: 1 },
  },
  {
    name: 'elliptical-trammel',
    note: 'two grounded guides at once',
    query:
      '?2P.Fe.K,0.1011.GA,A,Fe,0,0.GB,B,0,Fe,0.LC,C,Fe,0,0.LD,D,0,Fe,OZ..YRAB,AB,Fe,Fe,7q,7q,c5cae9,A,B,,.YPAC,AC,Fe,0,0,0,,A,C,,.YPBD,BD,Fe,0,0,0,,B,D,,...N_Q',
    expect: { blocks: 2, plates: 0, rails: 2, channels: 0 },
  },
];

const results = [];

function check(scenario, label, actual, expected) {
  const ok = actual === expected;
  results.push({ scenario, label, actual, expected, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: ${actual} (expected ${expected})`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(String(error)));

mkdirSync(OUT, { recursive: true });

for (const mechanism of MECHANISMS) {
  console.log(`\n${mechanism.name} — ${mechanism.note}`);
  await page.goto(BASE + mechanism.query, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForSelector('#sliderHolder', { timeout: 15000 });
  await page.waitForTimeout(600);

  // The dev server draws a compile error over the page and keeps serving the
  // last good bundle, so a screenshot taken through it shows stale pixels that
  // look fine. Fail on it rather than photograph the wrong build.
  const overlay = await page.evaluate(() => {
    const node = document.querySelector(
      'vite-error-overlay, .vite-error-overlay, #vite-error-overlay'
    );
    return node
      ? (node.shadowRoot?.textContent ?? node.textContent ?? 'compile error').slice(0, 200)
      : null;
  });
  if (overlay) {
    console.log(`  FAIL  dev-server compile overlay: ${overlay.trim()}`);
    results.push({
      scenario: mechanism.name,
      label: 'no compile overlay',
      actual: overlay.trim(),
      expected: 'none',
      ok: false,
    });
  }

  const counts = await page.evaluate(() => ({
    blocks: document.querySelectorAll('#sliderHolder .slider-block').length,
    plates: document.querySelectorAll('#sliderHolder .slider-plate').length,
    rails: document.querySelectorAll('#railHolder > g').length,
    // A channel is a subpath appended to its carrier's own outline and
    // subtracted by the even-odd fill, so it has no element of its own and an
    // extra subpath alone cannot tell it apart from a compound link.
    channels: [...document.querySelectorAll('#linkHolder path[data-channels]')].reduce(
      (total, path) => total + Number(path.getAttribute('data-channels')),
      0
    ),
    // The block is #000 in every slider cell — no colour derivation anywhere.
    blockFills: [...document.querySelectorAll('#sliderHolder .slider-block path')].map((p) =>
      p.getAttribute('fill')
    ),
  }));

  check(mechanism.name, 'blocks', counts.blocks, mechanism.expect.blocks);
  check(mechanism.name, 'weld plates', counts.plates, mechanism.expect.plates);
  check(mechanism.name, 'grounded rails', counts.rails, mechanism.expect.rails);
  check(mechanism.name, 'cut channels', counts.channels, mechanism.expect.channels);

  const allBlack = counts.blockFills.every((fill) => fill === '#000000');
  results.push({
    scenario: mechanism.name,
    label: 'every block is #000',
    actual: counts.blockFills.join(','),
    expected: 'all #000000',
    ok: allBlack,
  });
  console.log(`  ${allBlack ? 'PASS' : 'FAIL'}  every block is #000: ${counts.blockFills}`);

  await page.screenshot({ path: `${OUT}/${mechanism.name}.png` });
}

// ------------------------------------------ the plate follows its rider's paint
console.log('\nrecolouring a rider repaints its weld plate');
// A Slide's plate is painted in the rider's own colour -- that is the whole
// mechanism by which it reads as the same body. Recolouring a link changes a
// mark while moving nothing, so a glyph cache keyed only on positions leaves
// the plate showing a colour the link no longer has.
await page.goto(BASE + MECHANISMS[0].query, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForSelector('#sliderHolder', { state: 'attached', timeout: 15000 });
await page.waitForTimeout(600);

// The plate is one path inside its group now, so the paint is on the path.
const plateFill = () =>
  page.locator('#sliderHolder .slider-plate path').first().getAttribute('fill');
const wasFill = await plateFill();

// Driving the recolour needs Angular's debug globals, which exist only in a
// development build. Skipped rather than failed against a deploy preview: the
// check is about cache invalidation, and a production bundle cannot be asked.
const recolourable = await page.evaluate(() => typeof window.ng?.getComponent === 'function');
if (recolourable) {
  await page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    grid.mechanismSrv.getLinks().find((link) => link.id === 'CD').fill = '#00695C';
    window.ng.applyChanges(grid);
  });
  await page.waitForTimeout(500);
} else {
  console.log("  SKIP  the weld plate follows its rider's colour (needs a dev build)");
}
const nowFill = recolourable ? await plateFill() : null;

// Recorded as skipped rather than passed when it could not be run: a check that
// reports success without executing turns a production regression green.
if (recolourable) {
  const repainted = wasFill !== nowFill && nowFill === '#00695C';
  results.push({
    scenario: 'scotch-yoke',
    label: 'the weld plate follows its rider\u2019s colour',
    actual: `${wasFill} -> ${nowFill}`,
    expected: `${wasFill} -> #00695C`,
    ok: repainted,
  });
  console.log(
    `  ${repainted ? 'PASS' : 'FAIL'}  the weld plate follows its rider's colour: ${wasFill} -> ${nowFill}`
  );
}
await page.screenshot({ path: `${OUT}/recoloured-plate.png` });

await browser.close();

const failed = results.filter((result) => !result.ok);
writeFileSync(
  `${OUT}/report.json`,
  JSON.stringify({ results, consoleErrors, failed: failed.length }, null, 2)
);

console.log(`\nconsole errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 5).forEach((error) => console.log(`  ${error}`));
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 && consoleErrors.length === 0 ? 0 : 1);
