/**
 * One committed edit, one undo step — wherever the edit was typed.
 *
 * A canvas drag has always saved on release. Typed edits did not, unevenly:
 * some fields reached `updateMechanism(true)` and entered the history, and the
 * ones that re-pose through a drag did not. So typing a coordinate and pressing
 * Undo took back whichever gesture came before it — on a freshly opened
 * template, the template itself, which looks like the app throwing the work
 * away.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/edit-undo.mjs
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

const ctx = await chromium.launchPersistentContext('/tmp/pmks-chrome-undo', {
  headless: true,
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

const load = async (id) => {
  await page.goto(`${BASE}/?${payloads[id]}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
};

/** Every joint's drawn centre, which is what an edit is supposed to move. */
const pose = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[id^="joint_"]')]
      .map((node) => {
        const box = node.getBoundingClientRect();
        return `${node.id}:${Math.round(box.x)},${Math.round(box.y)}`;
      })
      .join('|')
  );

const undoEnabled = () =>
  page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((n) => /Undo/.test(n.textContent));
    return button ? !button.disabled : null;
  });

const clickUndo = async () => {
  // Never wait on a disabled Undo: if the edit before it did not enter the
  // history, that is the finding, and blocking here hides it behind a timeout.
  if ((await undoEnabled()) !== true) return false;
  await page.click('text=Undo');
  await page.waitForTimeout(900);
  return true;
};

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok, detail]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

/**
 * Type into a labelled field of the Edit panel and commit it.
 *
 * Two shapes to look through: a single `input-block` labels its own row, and a
 * `dual-input-block` (joint X/Y, link length and angle) labels each of its two
 * fields separately inside one row.
 */
async function typeInPanel(label, text) {
  const handle = await page.evaluateHandle((want) => {
    for (const block of document.querySelectorAll('#input-block')) {
      if (block.querySelector('.label')?.textContent?.trim() === want) {
        return block.querySelector('input');
      }
    }
    for (const block of document.querySelectorAll('#dual-input-block')) {
      const labels = [...block.querySelectorAll('.label')];
      const inputs = [...block.querySelectorAll('input')];
      // The first label names the pair; the rest name one field each.
      const at = labels.slice(1).findIndex((l) => l.textContent.trim() === want);
      if (at >= 0 && inputs[at]) return inputs[at];
    }
    return null;
  }, label);
  const field = handle.asElement();
  if (!field) return false;
  await field.click({ clickCount: 3 });
  await field.type(text);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  return true;
}

// --- a joint coordinate, typed in the Edit panel ---------------------------
await load('4-Bar');
const jointNode = await page.$('[id^="joint_"]');
await jointNode.click();
await page.waitForTimeout(700);
const beforeJoint = await pose();
const typedX = (await typeInPanel('X', '1.5')) || (await typeInPanel('Joint Position', '1.5'));
const movedJoint = (await pose()) !== beforeJoint;
record('typing a joint coordinate moves it', typedX && movedJoint, { typedX, movedJoint });
record('and enables Undo', (await undoEnabled()) === true, {});
await clickUndo();
record('one undo puts it back, and no more', (await pose()) === beforeJoint, {
  restored: (await pose()) === beforeJoint,
});

// --- a link length, typed in the Edit panel --------------------------------
await load('4-Bar');
const linkNode = await page.$('#linkHolder path.link-default');
if (linkNode) {
  const box = await linkNode.boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForTimeout(700);
  const beforeLink = await pose();
  const typedLength = (await typeInPanel('L', '2.5')) || (await typeInPanel('Length', '2.5'));
  const movedLink = (await pose()) !== beforeLink;
  if (typedLength && movedLink) {
    record('typing a link length moves the linkage', true, {});
    await clickUndo();
    record('one undo puts the link back', (await pose()) === beforeLink, {});
  } else {
    record('typing a link length moves the linkage', false, { typedLength, movedLink });
  }
}

// --- a coordinate typed into the linkage table -----------------------------
await load('Cylinder_Boom');
await page.click('text=Debug').catch(() => undefined);
await page.waitForTimeout(800);
const beforeTable = await pose();
const cells = await page.$$('table input');
if (cells.length > 1) {
  // Index 0 is the joint's name; index 1 is its x.
  await cells[1].click({ clickCount: 3 });
  await cells[1].type('0.5');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  record('a table edit enables Undo', (await undoEnabled()) === true, {});
  record(
    'and the cylinder survives it',
    (await page.evaluate(() => document.querySelectorAll('.cylinder-mark').length)) === 1,
    {}
  );
  await clickUndo();
  record('one undo puts the table edit back', (await pose()) === beforeTable, {});
}

record('nothing threw', errors.length === 0, errors.slice(0, 2));
await ctx.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
