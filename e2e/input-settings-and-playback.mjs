/**
 * Checks the Input Settings section, the time field's width, and that playback
 * interpolates between samples instead of snapping to them.
 *
 * Run: node e2e/input-settings-and-playback.mjs
 */
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { mkdirSync, writeFileSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? process.env.PMKS_URL ?? 'http://127.0.0.1:4200/';
// Same encoded four-bar the other e2e scripts use — loading by URL avoids the
// template dialog entirely.
const FOUR_BAR =
  '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq';
const OUT = 'artifacts/input-settings';
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));

await page.goto(`${BASE}?${FOUR_BAR}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/01-loaded.png` });

// ---------------------------------------------------------------- Edit panel
const editPanel = page.locator('app-edit-panel');
for (let attempt = 0; attempt < 3; attempt++) {
  if (await editPanel.isVisible().catch(() => false)) break;
  await page.locator('.tabButton', { hasText: 'Edit' }).click();
  await page.waitForTimeout(600);
}
check('Edit panel opens', await editPanel.isVisible().catch(() => false));

// Select the input joint (the loaded four-bar already drives joint A).
const joint = page.locator('svg circle').first();
await joint.click({ force: true }).catch(() => {});
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/02-joint-selected.png` });

const makeInput = page.locator('#contextMenu .cm-row', { hasText: 'Driven Input' }).first();
if (await makeInput.isVisible().catch(() => false)) {
  await makeInput.scrollIntoViewIfNeeded();
  await makeInput.click();
  await page.waitForTimeout(700);
}

const inputSection = page.locator('text=Input Settings').first();
check(
  'Input Settings section appears for an input joint',
  await inputSection.isVisible().catch(() => false)
);
await page.screenshot({ path: `${OUT}/03-input-settings.png`, fullPage: true });

// Direction is one button that flips, not a pair of options.
const dirButton = page
  .locator('button#button-block')
  .filter({ hasText: /Clockwise/ })
  .first();
await dirButton.scrollIntoViewIfNeeded();
const readDirection = async () => ({
  text: (await dirButton.textContent()).trim(),
  icon: (await dirButton.locator('mat-icon').textContent()).trim(),
});
const before = await readDirection();
check(
  'Input Direction is a single button showing the current direction',
  (await page
    .locator('button#button-block')
    .filter({ hasText: /Clockwise/ })
    .count()) === 1 && before.icon.startsWith('rotate_'),
  `"${before.text}" icon=${before.icon}`
);

await dirButton.click();
await page.waitForTimeout(600);
const after = await readDirection();
check(
  'Flipping the direction swaps both the label and the icon',
  after.text !== before.text && after.icon !== before.icon,
  `${before.text}/${before.icon} -> ${after.text}/${after.icon}`
);
await dirButton.click(); // back to the original direction
await page.waitForTimeout(600);

// The grid mirrors the direction on the input joint itself: flipping the button
// must swap the joint's arrow image, not just the panel. (The template used to
// test the BehaviorSubject object instead of its value, so the arrow never moved.)
const gridArrowHref = () =>
  page.evaluate(() => {
    const image = [...document.querySelectorAll('svg image')].find((el) =>
      (el.getAttribute('xlink:href') ?? el.getAttribute('href') ?? '').includes('Input')
    );
    return image ? (image.getAttribute('xlink:href') ?? image.getAttribute('href')) : null;
  });
const arrowBefore = await gridArrowHref();
await dirButton.click();
await page.waitForTimeout(600);
const arrowAfter = await gridArrowHref();
check(
  'Grid arrow on the input joint swaps with the direction',
  arrowBefore !== null && arrowAfter !== null && arrowBefore !== arrowAfter,
  `${arrowBefore} -> ${arrowAfter}`
);
await dirButton.click(); // back to the original direction
await page.waitForTimeout(600);

// Unit picker: an inline dropdown sharing the speed field's box
const unitSelect = page
  .locator('input-block')
  .filter({ hasText: 'Input Speed' })
  .locator('select.unit-select');
const unitLabels = (await unitSelect.locator('option').allTextContents()).map((t) => t.trim());
check(
  'Speed unit dropdown offers exactly RPM, deg/s, rad/s',
  JSON.stringify(unitLabels) === JSON.stringify(['RPM', 'deg/s', 'rad/s']),
  unitLabels.join(', ')
);

// Speed field carries no unit text
const speedField = page.locator('input-block').filter({ hasText: 'Input Speed' });
const speedInput = speedField.locator('input').first();
const speedValue = await speedInput.inputValue().catch(() => '');
const suffix = await speedField.locator('.input-unit').count();
check(
  'Input Speed field has no built-in unit text',
  suffix === 0 && /^-?\d+(\.\d+)?$/.test(speedValue.trim()),
  `value="${speedValue}", suffix elements=${suffix}`
);

// The unit picker widens the field, so check it still fits its row and lines up
// with the panel's other fields rather than spilling past them.
const layout = await page.evaluate(() => {
  const q = (s, r = document) => r.querySelector(s);
  const block = [...document.querySelectorAll('input-block')].find((e) =>
    e.textContent.includes('Input Speed')
  );
  const row = q('.row', block);
  // Joint Position's second (Y) field is the panel's right-aligned reference.
  const dualFields = [...document.querySelectorAll('dual-input-block .mat-mdc-text-field-wrapper')];
  const right = (e) => Math.round(e.getBoundingClientRect().right);
  return {
    overflow: row.scrollWidth - row.clientWidth,
    helpWidth: q('.label-help', block).offsetWidth,
    fieldRight: right(q('.mat-mdc-text-field-wrapper', block)),
    otherFieldRight: right(dualFields[1]),
  };
});
check(
  'Speed row does not overflow and the help icon is not squeezed',
  layout.overflow === 0 && layout.helpWidth === 24,
  `overflow=${layout.overflow}px, help=${layout.helpWidth}px`
);
check(
  'Speed field right edge lines up with the other panel fields',
  layout.fieldRight === layout.otherFieldRight,
  `speed=${layout.fieldRight}px, joint position=${layout.otherFieldRight}px`
);

// Unit switch re-expresses the same speed
const rpm = Number(speedValue);
await unitSelect.selectOption('1'); // deg/s
await page.waitForTimeout(500);
const dps = Number(await speedInput.inputValue());
await unitSelect.selectOption('2'); // rad/s
await page.waitForTimeout(500);
const rps = Number(await speedInput.inputValue());
check(
  'Switching units re-expresses the same speed',
  Math.abs(dps - rpm * 6) < 0.05 && Math.abs(rps - (rpm * Math.PI) / 30) < 0.05,
  `${rpm} RPM -> ${dps} deg/s (expect ${(rpm * 6).toFixed(2)}) -> ${rps} rad/s (expect ${((rpm * Math.PI) / 30).toFixed(2)})`
);
await page.screenshot({ path: `${OUT}/04-units-switched.png`, fullPage: true });

// Back to RPM.
await unitSelect.selectOption('0');
await page.waitForTimeout(400);

// A negative speed reads as "the other way": magnitude kept, direction flipped.
const directionBeforeNegative = (await readDirection()).text;
await speedInput.scrollIntoViewIfNeeded();
await speedInput.fill('-20');
await speedInput.press('Tab');
await page.waitForTimeout(700);
const negativeValue = await speedInput.inputValue();
const directionAfterNegative = (await readDirection()).text;
check(
  'Typing a negative speed keeps the magnitude and flips the direction',
  negativeValue === '20' && directionAfterNegative !== directionBeforeNegative,
  `field="${negativeValue}", ${directionBeforeNegative} -> ${directionAfterNegative}`
);
await dirButton.click(); // restore the original direction
await page.waitForTimeout(600);

// Set a slow speed so the time value gets long.
await speedInput.scrollIntoViewIfNeeded();
await speedInput.fill('1');
await speedInput.press('Tab');
await page.waitForTimeout(900);

// ------------------------------------------------------- Global settings gone
// Settings is a project-menu entry now, so the hamburger has to be opened first.
await page.locator('.topStrip .iconButton').first().click();
await page.locator('.projectMenu .menuItem', { hasText: 'Settings' }).click();
await page.waitForTimeout(700);
const settingsPanel = page.locator('app-settings-panel');
const settingsText = (await settingsPanel.textContent().catch(() => '')) ?? '';
check(
  'Global Settings no longer shows Input Direction or Input Speed',
  !settingsText.includes('Input Direction') && !settingsText.includes('Input Speed'),
  settingsText.includes('Input Direction')
    ? 'still has Input Direction'
    : settingsText.includes('Input Speed')
      ? 'still has Input Speed'
      : 'both removed'
);
await page.screenshot({ path: `${OUT}/05-settings-panel.png`, fullPage: true });

// ----------------------------------------------------------- Kinematic / time
await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
await page.waitForTimeout(700);

const timeInput = page.locator('#playbackTime');
// A readout now rather than a field -- the handle measures the input's
// position, and a typed time is a question about a coordinate the transport no
// longer uses. What is left to hold is that it stays inside the card it lives
// in: a readout wide enough for a long value but wider than its card is the
// failure the old sizing rule was there to prevent.
const metrics = await timeInput.evaluate((el) => {
  const card = el.closest('.scrubCard');
  const field = el.getBoundingClientRect();
  const box = card.getBoundingClientRect();
  return {
    fieldWidth: Math.round(field.width),
    overflowLeft: Math.round(box.left - field.left),
    overflowRight: Math.round(field.right - box.right),
  };
});
check(
  'Time readout stays inside the transport card it sits in',
  metrics.fieldWidth > 0 && metrics.overflowLeft <= 0 && metrics.overflowRight <= 0,
  `field=${metrics.fieldWidth}px, spill left=${metrics.overflowLeft}px right=${metrics.overflowRight}px`
);

// ------------------------------------------------------------ Playback motion
const playButton = page.locator('.playButton').first();
await playButton.click();
await page.waitForTimeout(120);

// Sample the first joint's on-screen position over consecutive animation frames.
const samples = await page.evaluate(async () => {
  // Joint circles sit at cx=0 inside a transformed group, so the link outlines are
  // what actually carry the pose in the DOM.
  const readPose = () =>
    [...document.querySelectorAll('svg path')]
      .map((p) => p.getAttribute('d') ?? '')
      .filter((d) => d.startsWith('M'))
      .slice(0, 3)
      .join(';');
  const out = [];
  for (let i = 0; i < 10; i++) {
    out.push(readPose());
    await new Promise((r) => setTimeout(r, 33));
  }
  return out;
});
const distinct = new Set(samples.filter(Boolean)).size;
check(
  'Playback moves continuously at 1 RPM instead of snapping',
  distinct >= 8,
  `${distinct} distinct positions across 10 frames`
);
await page.screenshot({ path: `${OUT}/06-playing.png` });

// Time readout is not clipped.
await page.waitForTimeout(1500);
const timeMetrics = await timeInput.evaluate((el) => ({
  value: el.value,
  clientWidth: el.clientWidth,
  scrollWidth: el.scrollWidth,
}));
check(
  'Time value is fully visible, not clipped',
  timeMetrics.scrollWidth <= timeMetrics.clientWidth + 1,
  `value="${timeMetrics.value}" scrollWidth=${timeMetrics.scrollWidth} clientWidth=${timeMetrics.clientWidth}`
);
await page.screenshot({ path: `${OUT}/07-time-field.png` });

check('No console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

writeFileSync(`${OUT}/report.json`, JSON.stringify({ results, consoleErrors }, null, 2));
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
