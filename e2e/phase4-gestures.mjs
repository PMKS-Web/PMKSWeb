// Phase 4 gestures, driven by an actual mouse.
//
// Element counts from a URL-seeded fixture cannot see the bugs that live in the
// gesture itself: hit targets that drift, a preview that never appears, a drag
// that leaves two undo entries, state that only breaks on the second attempt.
// So everything here is pointer events on real coordinates read out of the DOM.
//
//   PMKS_PLAYWRIGHT_DIR=<dir> node e2e/phase4-gestures.mjs

import { mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const OUT = 'artifacts/phase4-gestures';

// A plain four-bar: no sliders anywhere, so every slot in this run is one the
// mouse actually cut.
const FOUR_BAR =
  '?2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,Nm,0,0.GC,C,126,lL,0.KD,D,17S,0,0.GE,E,1As,PW,0.GF,F,dq,Uc,0.GG,G,W5,tN,0.GH,H,Bu,G4,0.GI,I,11K,UW,0..YRABH,ABH,2ZQ,n9pzh4,01Zi,bM,c5cae9,A,B,H,,.YRBCFG,BCFG,9o,A80cTW,jM2,p3C,303e9f,B,C,F,G,,.YRCDEI,CDEI,1Cb,w-akVq,1pNm,0550,0d125a,C,D,E,I,,...N_U';

const results = [];
const consoleErrors = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ label, actual, expected, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(actual)}`);
  return ok;
}

function checkThat(label, ok, detail = '') {
  results.push({ label, actual: ok, expected: true, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));
mkdirSync(OUT, { recursive: true });

/** Screen centre of an element, so the mouse aims at what is actually drawn. */
async function centreOf(selector) {
  return page.evaluate((sel) => {
    const node = document.querySelector(sel);
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, selector);
}

/** The point halfway between two joints — a spot genuinely on the bar. */
async function midpointOf(a, b) {
  const [pa, pb] = [await centreOf(a), await centreOf(b)];
  return pa && pb ? { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 } : null;
}

/** A slow drag, so every pointermove the app listens for actually fires. */
async function dragTo(from, to, steps = 24) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps
    );
    await page.waitForTimeout(8);
  }
  return async () => {
    await page.mouse.up();
    await page.waitForTimeout(400);
  };
}

function sliderState() {
  return page.evaluate(() => {
    const blocks = [...document.querySelectorAll('#sliderHolder .slider-block path')];
    return {
      blocks: blocks.length,
      dangling: blocks.filter((b) => b.getAttribute('stroke') === '#F44336').length,
      plates: document.querySelectorAll('#sliderHolder .slider-plate').length,
      rails: document.querySelectorAll('#railHolder > g').length,
      channels: [...document.querySelectorAll('#linkHolder path[data-channels]')].reduce(
        (t, p) => t + Number(p.getAttribute('data-channels')),
        0
      ),
    };
  });
}

async function load(query) {
  await page.goto(BASE + query, { waitUntil: 'networkidle' });
  await page.waitForSelector('#sliderHolder', { state: 'attached', timeout: 15000 });
  await page.waitForTimeout(500);
  const overlay = await page.evaluate(() =>
    document.querySelector('vite-error-overlay, .vite-error-overlay') ? 'compile error' : null
  );
  if (overlay) checkThat('no dev-server compile overlay', false, overlay);
}

// ---------------------------------------------------------------- 4.3 preview
console.log('\n4.3 — dragging a joint onto a link body');
await load(FOUR_BAR);

const before = await sliderState();
check('starts with no sliders', before.blocks, 0);

// E sits on the coupler CDEI; ABH is a different body, so it is a legal carrier.
//
// Aimed at the midpoint of ABH's A-B edge rather than at the link element's
// bounding-box centre: a three-joint link's bounding box is mostly the empty
// space inside its hull, and a slot has to be cut on a bar the cursor is
// actually over. Aiming at the box centre finds no candidate, correctly.
const jointE = await centreOf('#joint_E');
const midAB = await midpointOf('#joint_A', '#joint_B');
checkThat('found joint E and the A-B edge of ABH', !!jointE && !!midAB);

const release = await dragTo(jointE, midAB);
const previewing = await page.evaluate(() =>
  [...document.querySelectorAll('#linkHolder path[data-channels]')]
    .map((p) => ({ id: p.getAttribute('id'), channels: Number(p.getAttribute('data-channels')) }))
    .filter((entry) => entry.channels > 0)
);
checkThat(
  'a channel previews on the bar under the cursor, before release',
  previewing.length === 1,
  JSON.stringify(previewing)
);
await page.screenshot({ path: `${OUT}/1-preview.png` });

await release();
const after = await sliderState();
checkThat('the drop cut a slot', after.blocks === 1 && after.channels === 1, JSON.stringify(after));
checkThat('the new slider is not dangling', after.dangling === 0);
await page.screenshot({ path: `${OUT}/2-slot-cut.png` });

// ------------------------------------------------------------------ one undo
console.log('\nthe drag is one undo entry, not two');
await page.click('text=Undo');
await page.waitForTimeout(500);
const undone = await sliderState();
checkThat('one undo takes the whole gesture back', undone.blocks === 0, JSON.stringify(undone));
await page.screenshot({ path: `${OUT}/3-undone.png` });

await page.click('text=Redo');
await page.waitForTimeout(500);
checkThat('redo puts it back', (await sliderState()).blocks === 1);

// -------------------------------------------------------------- 4.1 the panel
console.log('\n4.1 — the panel toggles');
await page.click('#joint_E');
await page.waitForTimeout(400);

const panelText = await page.evaluate(() => document.body.innerText);
checkThat('the panel offers Slider and Weld', /Slider/.test(panelText) && /Weld/.test(panelText));
checkThat('and no longer offers a separate Unweld button', !/Unweld\b/.test(panelText));
checkThat('it names what the slot is cut into', /Slot on:/.test(panelText), panelText.slice(0, 0));
await page.screenshot({ path: `${OUT}/4-panel.png` });

/** Toggle a panel row by its visible label. */
async function toggle(label) {
  const handle = await page.evaluateHandle((text) => {
    const rows = [...document.querySelectorAll('#toggle-block .row')];
    const row = rows.find((r) => r.textContent.trim().startsWith(text));
    return row?.querySelector('button[role="switch"], .mdc-switch, mat-slide-toggle button');
  }, label);
  const element = handle.asElement();
  if (!element) return false;
  await element.click();
  await page.waitForTimeout(500);
  return true;
}

const weldToggled = await toggle('Weld');
checkThat('the Weld toggle is reachable', weldToggled);
const welded = await sliderState();
checkThat(
  'welding the slider draws a plate — a Slide',
  welded.plates === 1,
  JSON.stringify(welded)
);
await page.screenshot({ path: `${OUT}/5-slide.png` });

await toggle('Weld');
const unwelded = await sliderState();
checkThat(
  'unwelding gives a Slot back, not a pin',
  unwelded.plates === 0 && unwelded.blocks === 1,
  JSON.stringify(unwelded)
);

// Ground is no longer disabled while Slider is on.
const groundEnabled = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#toggle-block .row')];
  const row = rows.find((r) => r.textContent.trim().startsWith('Ground'));
  const input = row?.querySelector('button[role="switch"], .mdc-switch');
  return (
    !!input && !input.hasAttribute('disabled') && !input.classList.contains('mdc-switch--disabled')
  );
});
checkThat('Ground is enabled even though Slider is on', groundEnabled);

await toggle('Ground');
const grounded = await sliderState();
checkThat('grounding the slot draws rails', grounded.rails === 1, JSON.stringify(grounded));
await page.screenshot({ path: `${OUT}/6-grounded.png` });

await toggle('Ground');
const dangling = await sliderState();
checkThat(
  'un-grounding leaves it dangling and red, keeping the block',
  dangling.blocks === 1 && dangling.dangling === 1 && dangling.rails === 0,
  JSON.stringify(dangling)
);
await page.screenshot({ path: `${OUT}/7-dangling.png` });

// -------------------------------------------------- the dangling repair drag
console.log('\nrepairing a dangling slider by dragging it onto a link');
const danglingJoint = await centreOf('#joint_E');
const carrier = await midpointOf('#joint_A', '#joint_B');
if (danglingJoint && carrier) {
  const releaseRepair = await dragTo(danglingJoint, carrier);
  await releaseRepair();
  const repaired = await sliderState();
  checkThat(
    'the drag gives it a carrier and clears the red',
    repaired.blocks === 1 && repaired.dangling === 0 && repaired.channels === 1,
    JSON.stringify(repaired)
  );
  await page.screenshot({ path: `${OUT}/8-repaired.png` });
}

await browser.close();

const failed = results.filter((r) => !r.ok);
writeFileSync(
  `${OUT}/report.json`,
  JSON.stringify({ results, consoleErrors, failed: failed.length }, null, 2)
);
console.log(`\nconsole errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 6).forEach((e) => console.log(`  ${e}`));
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 && consoleErrors.length === 0 ? 0 : 1);
