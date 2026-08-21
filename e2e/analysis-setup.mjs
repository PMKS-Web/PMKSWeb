/**
 * What the app says when you press an analysis mode it cannot enter.
 *
 * The old answer was one sentence about the whole document, first blocker
 * wins — and for a mode that simply did nothing, often no answer at all. This
 * checks the replacement: that the refusal opens a list, that the list names
 * the mechanism at fault rather than the drawing, that each entry says the way
 * out, and that the button offering to go to the part actually goes there.
 *
 *   PMKS_BASE_URL=<origin> node e2e/analysis-setup.mjs
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const drawerText = () =>
  page
    .locator('app-analysis-setup')
    .innerText()
    .catch(() => '');
const tab = (name) => page.locator('.tabButton', { hasText: name });

async function open(payload) {
  await page.goto(`${BASE}/?${payload}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
}

// --- a mechanism that runs says so, and stays out of the way ----------------
await open(payloads['4-Bar']);
// Weight is a load now: gravity hanging on links that have mass is a complete
// static problem, so the four-bar as it arrives is ready for force analysis.
// Turning gravity off is what makes this drawing genuinely unloaded, which is
// the refusal these three checks are about.
await page.evaluate(() => {
  ng.getComponent(document.querySelector('app-new-grid')).settings.isGravity.next(false);
});
await tab('Force').click();
await page.waitForTimeout(600);
let text = await drawerText();
record(
  'pressing a mode it cannot enter opens the list',
  text.includes('Force analysis setup'),
  text
);
// Each mode has a drawer of its own: a reader refused by one should not have
// to read past the other mode's list to find out why.
record(
  'and the list answers the question that was asked, not the other one',
  text.includes('A load to react against') && !text.includes('Mechanism M1'),
  text
);
// The wall is "nothing loads this mechanism". The way out is named in the
// sentence either way, and here -- everything drawn, one switch in another
// panel standing in the way -- the panel walks it for the reader.
record('naming the way out rather than only the wall', /Turn On Gravity/.test(text), text);
await page
  .locator('app-analysis-setup .actionButton', { hasText: 'Turn On Gravity' })
  .first()
  .click();
await page.waitForTimeout(600);
record(
  'and pressing it lifts the blocker it was standing under',
  !(await drawerText()).includes('A load to react against'),
  await drawerText()
);
await tab('Force').click();
await page.waitForTimeout(800);
// The drawer stays -- it carries the mass table, which force analysis reads
// from -- so what says the mode was entered is the analysis itself.
const entered = await page.evaluate(() => ({
  tab: ng.getComponent(document.querySelector('app-new-grid')).tabService.getCurrentTab(),
  graphs: !!document.querySelector('app-analysis-panel'),
}));
record(
  'so the mode that refused the reader now opens',
  entered.tab === 3 && entered.graphs,
  entered
);

// --- a mechanism with nothing driving it ------------------------------------
await open(payloads['4-Bar']);
await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  srv.joints.forEach((joint) => (joint.input = false));
  srv.updateMechanism();
});
await page.waitForTimeout(400);
await tab('Kinematic').click();
await page.waitForTimeout(600);
text = await drawerText();
record(
  'an undriven mechanism is refused with its own reason',
  text.includes('Nothing drives this mechanism'),
  text
);
record(
  'which names a joint that could take the job',
  /Right-click joint [A-Z] and choose Add Input/.test(text),
  text
);

const chip = await tab('Kinematic').locator('.chip').textContent();
record('and the mode chip counts it', chip.trim() === '1 fix', { chip });

// --- the button that offers to take you there, does -------------------------
const goTo = page.locator('.actionButton').first();
record('the check offers to go to the part', (await goTo.count()) === 1);
const label = await goTo.textContent();
await goTo.click();
await page.waitForTimeout(700);
const landed = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  return {
    tab: grid.tabService.getCurrentTab(),
    selected: grid.activeObjService.getSelectedObjType(),
    id: grid.activeObjService.objType === 'Joint' ? grid.activeObjService.selectedJoint.id : null,
  };
});
record(
  'and pressing it lands in Edit with that joint selected',
  landed.tab === 1 && landed.selected === 'Joint' && label.includes(landed.id),
  { label, landed }
);

// Undo must not have been armed by looking at something.
const undoDisabled = await page.locator('.historyButton', { hasText: 'Undo' }).isDisabled();
record('going to a part is not an edit, so Undo stays where it was', undoDisabled === true);

// --- geometry that is in no mechanism ---------------------------------------
// The drawer opens when a mode refuses, so the mechanism is left undriven too:
// a valid one simply enters Kinematic and there is no drawer to read.
await open(payloads['4-Bar']);
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const srv = grid.mechanismSrv;
  // A joint on its own, with no link: unassigned, and reported as such.
  const seed = srv.joints[0];
  const loose = Object.create(Object.getPrototypeOf(seed));
  Object.assign(loose, seed, {
    id: 'Z',
    name: 'Z',
    links: [],
    connectedJoints: [],
    ground: false,
    input: false,
  });
  srv.joints.push(loose);
  srv.joints.forEach((joint) => (joint.input = false));
  srv.updateMechanism();
});
await page.waitForTimeout(400);
await tab('Kinematic').click();
await page.waitForTimeout(600);
text = await drawerText();
record(
  'geometry in no mechanism gets its own section',
  text.includes('Not in any mechanism'),
  text
);

record('nothing threw', errors.length === 0, errors.slice(0, 3));

await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
