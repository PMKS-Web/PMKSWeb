// Phase 4 marks, while the mechanism is playing.
//
// Every other check in this suite looks at one pose. The marks are recomputed
// every timestep, so a mark that is anchored to the wrong thing is correct in
// any single frame and wrong across a sequence -- which is how a grounded guide
// came to travel along with the block that is supposed to slide through it.
//
//   PMKS_PLAYWRIGHT_DIR=<dir> node e2e/phase4-animation.mjs

import { mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const OUT = 'artifacts/phase4-animation';
const FRAMES = 8;

const MECHANISMS = [
  {
    name: 'scotch-yoke',
    note: 'a grounded Slide, and a yoke that is both slot carrier and welded rider',
    grounded: true,
    query:
      '?2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,Fe,0,0.OC,C,Fe,0VG,0.GD,D,Fe,Fe,0.HE,E,Fe,0,0,CD,C,D.LF,F,Fe,0VG,0..YRAB,AB,Fe,Fe,7q,0,c5cae9,A,B,,.YRCD,CD,Fe,Fe,Fe,07q,303e9f,C,D,,.YPBE,BE,Fe,0,0,0,,B,E,,.YPCF,CF,Fe,0,0,0,,C,F,,...N_V',
  },
  {
    name: 'inverted-slider-crank',
    note: 'a floating Slot on a swinging carrier',
    grounded: false,
    query:
      '?2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,0,Fe,0.KC,C,ku,0,0.GD,D,0RF,Oj,0.HP,P,0,Fe,0,CD,C,D..YRAB,AB,Fe,Fe,0,7q,c5cae9,A,B,,.YRCD,CD,Fe,Fe,9q,CN,303e9f,C,D,,.YPBP,BP,Fe,0,0,0,,B,P,,...N_r',
  },
  {
    name: 'four-bar-slotted-coupler',
    note: 'a slot on a coupler that both turns and translates',
    grounded: false,
    query:
      '?2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,Fe,0,0.GC,C,d4,ec,0.KD,D,_W,0,0.KE,E,VG,7q,0.GF,F,bo,cO,0.HP,P,bo,cO,0,BC,B,C..YRAB,AB,Fe,Fe,7q,0,c5cae9,A,B,,.YRBC,BC,Fe,Fe,RM,KJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,oo,KJ,0d125a,C,D,,.YREF,EF,Fe,Fe,YX,N6,B2DFDB,E,F,,.YPFP,FP,Fe,0,0,0,,F,P,,...N_L',
  },
];

const results = [];
const consoleErrors = [];

function checkThat(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));
mkdirSync(OUT, { recursive: true });

/** What the canvas is showing right now, in model coordinates. */
const snapshot = () =>
  page.evaluate(() => ({
    // Model coordinates, straight off the elements the app positions.
    joints: Object.fromEntries(
      [...document.querySelectorAll('#jointHolder svg')].map((node) => [
        node.querySelector('[id^="joint_"]')?.id?.replace('joint_', '') ?? '?',
        [Number(node.getAttribute('x')), Number(node.getAttribute('y'))],
      ])
    ),
    marks: [...document.querySelectorAll('#sliderHolder .slider-mark')].map((n) =>
      n.getAttribute('transform')
    ),
    rails: [...document.querySelectorAll('#railHolder > g')].map((n) =>
      n.getAttribute('transform')
    ),
    // A rider that is also a slot carrier has to cut its own channel out of its
    // weld plate, or the plate fills the slot back in and the block appears to
    // ride on a solid bar. An extra subpath is that cut.
    plateSubpaths: [...document.querySelectorAll('#sliderHolder .slider-plate path')].map(
      (n) => (n.getAttribute('d') ?? '').match(/M/g)?.length ?? 0
    ),
  }));

for (const mech of MECHANISMS) {
  console.log(`\n${mech.name} — ${mech.note}`);
  await page.goto(BASE + mech.query, { waitUntil: 'networkidle' });
  await page.waitForSelector('#sliderHolder', { state: 'attached', timeout: 15000 });
  await page.waitForTimeout(700);

  // The animation bar is only rendered on the Analyze tab.
  await page.getByText('Analyze', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  const play = page.locator('.playButton').first();
  if (!checkThat(`${mech.name}: the mechanism plays`, !(await play.isDisabled()))) continue;
  await play.click();

  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    await page.waitForTimeout(360);
    frames.push(await snapshot());
    if (i < 3) await page.screenshot({ path: `${OUT}/${mech.name}-${i}.png` });
  }
  await play.click();

  checkThat(
    `${mech.name}: the mechanism actually moved`,
    new Set(frames.map((f) => f.marks.join('|'))).size > 1
  );

  if (mech.grounded) {
    // The bug this exists for: the rails were drawn in the block's frame, so the
    // world-fixed guide slid along with the thing sliding through it.
    const railStates = new Set(frames.map((f) => f.rails.join('|')));
    checkThat(
      `${mech.name}: the grounded guide stays put while its block travels`,
      railStates.size === 1,
      [...railStates].join('  vs  ').slice(0, 160)
    );

    // The yoke is both the slot carrier and the welded rider, so its plate has
    // to carry the channel too.
    const cut = frames.every((f) => f.plateSubpaths.some((count) => count > 1));
    checkThat(`${mech.name}: the weld plate keeps the channel cut through it`, cut);
  }
}

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
