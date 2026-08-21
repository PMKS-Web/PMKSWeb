// Phase 4 gestures, driven by an actual mouse.
//
// Element counts from a URL-seeded fixture cannot see the bugs that live in the
// gesture itself: hit targets that drift, a preview that never appears, a drag
// that leaves two undo entries, state that only breaks on the second attempt.
// So everything here is pointer events on real coordinates read out of the DOM.
//
//   PMKS_PLAYWRIGHT_DIR=<dir> node e2e/phase4-gestures.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

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
      // The red mark is its own top-layer path now: a welded block is covered
      // by its own plate, so a highlight painted on the block could not be seen.
      dangling: document.querySelectorAll('.dangling-block').length,
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
  await page.goto(BASE + query, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
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

// The fit frames the mechanism, not the marks hanging off it. This URL carries
// a hand-placed centre of mass some 90,000 units away, and framing that drew
// the whole four-bar as a single pixel behind the Edit panel -- every gesture
// below still worked, because they aim at coordinates read from the DOM, but
// nothing here was clickable by a reader.
const drawnJoint = await page.evaluate(() =>
  Math.round(document.querySelector('#joint_A')?.getBoundingClientRect().width ?? 0)
);
checkThat('and is framed at a size a reader could aim at', drawnJoint > 10, `${drawnJoint}px`);

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
// The panel used to say "Slot on: CD" in words. The canvas draws the slot on
// its carrier, so the panel no longer repeats it -- but the gesture still has
// to have attached it, and that is what this ever checked.
const slotCarrier = await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const slot = srv.joints.find((j) => j.constructor.name === 'PrisJoint');
  return slot ? `${slot.id} -> ${slot.carrier?.id ?? 'nothing'}` : 'no slot';
});
checkThat(
  'the slot is cut into the link it was dropped on',
  /-> \w/.test(slotCarrier),
  slotCarrier
);
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
  'a dangling block is still black — the red is the highlight, not the fill',
  (await page.locator('#sliderHolder .slider-block path').first().getAttribute('fill')) ===
    '#000000'
);
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

// ------------------------------------------------------- 4.4 the block drag
console.log('\n4.4 — dragging the block along its slot');
const blockBefore = await page.evaluate(() => {
  const j = [...document.querySelectorAll('#jointHolder svg')].length;
  const g = document.querySelector('#sliderHolder .slider-block');
  const box = g.getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, joints: j };
});

// The slot runs along A-B, so push the block well past B and check it stops at
// the end of the channel instead of following the cursor out of its own hole.
const beyondB = await centreOf('#joint_B');
const beforeDrag = await page.evaluate(
  () => document.querySelector('#edit-panel input, input')?.value ?? null
);
const releaseBlock = await dragTo(blockBefore, { x: beyondB.x + 260, y: beyondB.y });
await releaseBlock();

const state44 = await sliderState();
checkThat(
  'the block is still in its channel after being dragged past the end',
  state44.blocks === 1 && state44.channels === 1,
  JSON.stringify(state44)
);
const inside = await page.evaluate(() => {
  const block = document.querySelector('#sliderHolder .slider-block').getBoundingClientRect();
  const carrier = document.querySelector('#ABH').getBoundingClientRect();
  return (
    block.x + block.width / 2 >= carrier.x - 2 &&
    block.x + block.width / 2 <= carrier.x + carrier.width + 2
  );
});
checkThat('and it clamped inside the carrier rather than following the cursor', inside);
await page.screenshot({ path: `${OUT}/9-block-clamped.png` });

// ------------------------------------------- state the panel must not lie about
console.log('\nthe panel and the canvas agree');
const ELLIPTICAL =
  '?2P.Fe.K,0.1011.GA,A,Fe,0,0.GB,B,0,Fe,0.LC,C,Fe,0,0.LD,D,0,Fe,OZ..YRAB,AB,Fe,Fe,7q,7q,c5cae9,A,B,,.YPAC,AC,Fe,0,0,0,,A,C,,.YPBD,BD,Fe,0,0,0,,B,D,,...N_Q';

// Editing a grounded guide's angle turns its whole mark while every coordinate
// in the mechanism stays exactly where it was. If the glyph cache keys only on
// positions, the panel reports the new angle and the canvas keeps the old one.
await load(ELLIPTICAL);
await page.click('#joint_A');
await page.waitForTimeout(400);
const markTransforms = () =>
  page
    .locator('#sliderHolder .slider-mark')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')));
const beforeAngle = await markTransforms();
const angleField = page
  .locator('#toggle-block .row')
  .filter({ hasText: 'Slider' })
  .first()
  .locator('input');
await angleField.fill('45 deg');
await angleField.press('Enter');
await page.waitForTimeout(700);
const afterAngle = await markTransforms();
checkThat(
  'editing a grounded slot angle redraws its mark',
  JSON.stringify(beforeAngle) !== JSON.stringify(afterAngle),
  `${beforeAngle[0]} -> ${afterAngle[0]}`
);
await page.screenshot({ path: `${OUT}/10-angle-edit.png` });

// A weld with nothing to fuse is greyed rather than offered-then-refused:
// joint A connects a single link, so the switch is disabled outright and the
// state it shows (off) is the state the mechanism is in.
await load(FOUR_BAR);
await page.click('#joint_A');
await page.waitForTimeout(400);
const weldSwitch = page
  .locator('#toggle-block .row')
  .filter({ hasText: 'Weld' })
  .first()
  .locator('button[role="switch"], .mdc-switch')
  .first();
await weldSwitch.click({ force: true, timeout: 5000 }).catch(() => {});
await page.waitForTimeout(600);
checkThat('a weld with nothing to fuse is greyed out', (await weldSwitch.isDisabled()) === true);
checkThat('and the switch stays off', (await weldSwitch.getAttribute('aria-checked')) === 'false');
checkThat(
  'and the joint keeps its circle rather than becoming a plus',
  (await page.locator('#joint_A').evaluate((n) => n.tagName.toLowerCase())) === 'circle'
);
await page.screenshot({ path: `${OUT}/11-refused-weld.png` });

// ------------------------------------------- the stash across an undo/redo
console.log('\nthe slot stash survives an undo and a redo');
// Undo is a stack of URL strings, so every undo rebuilds the mechanism from
// scratch and the joints that come back are new objects. A stash held on the
// joint is destroyed by an undo and a redo that visibly changed nothing, and
// turning Slider back on then dangles instead of restoring the slot.
await load(FOUR_BAR);
const startJoint = await centreOf('#joint_E');
const startBar = await midpointOf('#joint_A', '#joint_B');
await (
  await dragTo(startJoint, startBar)
)();
checkThat('a slot to remember', (await sliderState()).channels === 1);

await page.click('#joint_E');
await page.waitForTimeout(300);
await toggle('Slider');
checkThat('slider off', (await sliderState()).blocks === 0);

await page.click('text=Undo');
await page.waitForTimeout(500);
await page.click('text=Redo');
await page.waitForTimeout(500);

await page.click('#joint_E');
await page.waitForTimeout(300);
await toggle('Slider');
const restored = await sliderState();
checkThat(
  'turning Slider back on restores the slot rather than dangling',
  restored.blocks === 1 && restored.dangling === 0 && restored.channels === 1,
  JSON.stringify(restored)
);
await page.screenshot({ path: `${OUT}/12-stash-across-undo.png` });

// An unparseable angle must restore the field, not fight itself. Two bugs, both
// older than this branch: the angle was read off the pin -- which has none -- so
// the field was restored to the string "NaN", and the restore emitted, so the
// handler ran again on its own unparseable output.
console.log('\nan angle the parser refuses');
await load(ELLIPTICAL);
await page.click('#joint_A');
await page.waitForTimeout(400);
const badAngle = page
  .locator('#toggle-block .row')
  .filter({ hasText: 'Slider' })
  .first()
  .locator('input');
await badAngle.fill('bogus');
await badAngle.press('Enter');
await page.waitForTimeout(900);
const restoredAngle = await badAngle.inputValue();
checkThat(
  'a refused angle restores the one the slot actually has',
  restoredAngle !== '' && !/nan/i.test(restoredAngle),
  restoredAngle
);
await page.screenshot({ path: `${OUT}/13-bad-angle.png` });

// -------------------------------------------------- things that must not break
console.log('\nhostile input');

// Object Scale multiplies every dimension in the mark system, so a value that is
// not a positive number does not degrade the drawing -- it erases it, behind
// dozens of invalid-SVG errors. The pattern used an unescaped dot, so "1x2"
// validated and Number() turned it into NaN.
await load(FOUR_BAR);
// Settings is a project-menu entry now, so the hamburger opens first.
await page.locator('.topStrip .iconButton').first().click();
await page.locator('.projectMenu .menuItem', { hasText: 'Settings' }).click();
await page.waitForTimeout(900);
const scaleField = page.locator('app-settings-panel input').first();
let scaleOk = true;
for (const bad of ['1x2', 'abc', '-3', '0']) {
  await scaleField.fill(bad);
  await scaleField.press('Enter');
  await page.waitForTimeout(400);
  const shown = await scaleField.inputValue();
  const nan = await page.evaluate(
    () =>
      [
        ...document.querySelectorAll('#linkHolder path, #sliderHolder path, #railHolder line'),
      ].filter((n) => /NaN/.test(n.getAttribute('d') ?? n.getAttribute('x1') ?? '')).length
  );
  if (shown === bad || nan > 0) scaleOk = false;
}
checkThat('a nonsensical object scale is refused rather than drawn', scaleOk);
await page.screenshot({ path: `${OUT}/14-bad-scale.png` });

// A gesture in flight targets a joint that is about to stop existing.
await load(FOUR_BAR);
const before14 = consoleErrors.length;
await page.locator('#joint_E').click();
await page.waitForTimeout(400);
const doomed = await centreOf('#joint_E');
if (doomed) {
  await page.mouse.move(doomed.x, doomed.y);
  await page.mouse.down();
  await page.mouse.move(doomed.x + 35, doomed.y + 20);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find((n) => n.textContent?.trim() === 'Delete')
      ?.click();
  });
  await page.waitForTimeout(250);
  await page.mouse.move(doomed.x + 70, doomed.y + 45);
  await page.mouse.up();
  await page.waitForTimeout(500);
}
checkThat(
  'deleting a joint mid-drag does not keep dragging deleted topology',
  consoleErrors.length === before14,
  consoleErrors.slice(before14, before14 + 1).join('')
);
await page.screenshot({ path: `${OUT}/15-delete-mid-drag.png` });

// --------------------------------------- atomic cylinder: sealed <=> skinned
console.log('\nonly a sealed cylinder is skinned, and the skin never reveals');
// The same assembly twice: identical geometry, welded slide either way. The
// only difference is the sealed bit on the prismatic pin (H vs n in P's flag
// character; the checksum covers length only, so it is unchanged).
const UNSEALED_SLIDE =
  '?2P.Fe.K,0.1011.KA,A,0_W,0,0.GB,B,0Fe,0,0.OC,C,0,0,0.GD,D,_W,0,0.ME,E,_W,ku,0.HP,P,0,0,0,AB,A,B..YRAB,AB,Fe,Fe,0d4,0,c5cae9,A,B,,.YRCD,CD,Fe,Fe,VG,0,303e9f,C,D,,.YRDE,DE,Fe,Fe,_W,NS,0d125a,D,E,,.YPCP,CP,Fe,0,0,0,,C,P,,...N_a';
// Read from the generated template rather than typed here. A hand-written
// payload for a part with an invariant in it goes stale the moment the
// invariant moves: this one was a barrel one unit long with its piston two
// units outside it, which stopped being a cylinder the day barrel and rod had
// to match, and the check then failed for a reason that had nothing to do with
// what it was testing.
const SEALED_CYLINDER =
  '?' +
  readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8').match(
    /Cylinder_Boom:\s*\n\s*'([^']+)'/
  )[1];

// A hand-built (unsealed) welded slide never wears the skin any more, and the
// Auto/Cylinder/Slotted picker is gone from the app entirely.
await load(UNSEALED_SLIDE);
checkThat(
  'a hand-built welded slide is never skinned',
  (await page.locator('.cylinder-mark').count()) === 0
);
const unsealedPin = await centreOf('#joint_C');
if (unsealedPin) {
  await page.mouse.click(unsealedPin.x, unsealedPin.y);
  await page.waitForTimeout(400);
}
checkThat('and no skin picker exists anywhere', (await page.locator('.skinPicker').count()) === 0);
await page.screenshot({ path: `${OUT}/16-unsealed-never-skinned.png` });

// A sealed cylinder is always skinned; clicking its geometry selects the BODY
// and collapses nothing.
for (const [part, selector] of [
  ['barrel', '.cylinder-barrel'],
  ['rod', '.cylinder-rod'],
]) {
  await load(SEALED_CYLINDER);
  const collapsed = await page.locator('.cylinder-mark').count();
  // A point actually ON the path, not a fraction into its bounding box: the
  // template's ram is diagonal, and a quarter across the box of a diagonal bar
  // is beside the bar rather than on it.
  const at = await page.evaluate((sel) => {
    const node = document.querySelector(sel);
    if (!node) return null;
    const local = node.getPointAtLength(node.getTotalLength() * 0.3);
    const point = new DOMPoint(local.x, local.y).matrixTransform(node.getScreenCTM());
    return { x: point.x, y: point.y };
  }, selector);
  if (!checkThat(`the sealed ${part} is there to click`, collapsed === 1 && !!at)) continue;
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(700);
  checkThat(
    `clicking the ${part} keeps the skin on (sealed <=> skinned)`,
    (await page.locator('.cylinder-mark').count()) === 1
  );
  checkThat(
    `and selects the body (Edit Cylinder panel)`,
    (await page.getByText('Edit Cylinder').count()) >= 1
  );
}
await page.screenshot({ path: `${OUT}/16-sealed-always-skinned.png` });

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
