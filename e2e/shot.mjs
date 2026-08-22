/**
 * A screenshot of one state, for looking at.
 *
 * Not a check — a viewer. Give it a payload and a short script of things to do
 * before the picture is taken.
 *
 *   PMKS_BASE_URL=<origin> node e2e/shot.mjs <name> <steps...>
 */

import { readFileSync, mkdirSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const source = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const dev = readFileSync('src/app/component/MODALS/templates/dev-templates.ts', 'utf8');
const payloads = Object.fromEntries(
  [...(source + dev).matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [
    id,
    // A backslash in the payload is written escaped in the TypeScript source.
    p.replace(/\\\\/g, '\\'),
  ])
);

const [name, template, ...steps] = process.argv.slice(2);
mkdirSync('artifacts/shots', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: {
    width: Number(process.env.SHOT_WIDTH ?? 1500),
    height: Number(process.env.SHOT_HEIGHT ?? 950),
  },
});
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push('console: ' + message.text());
});

const payload = payloads[template] ?? (template === 'empty' ? '' : template);
await page.goto(`${BASE}/${payload ? '?' + payload : ''}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page).catch(() => undefined);
await page.waitForTimeout(600);

for (const step of steps) {
  const [verb, ...rest] = step.split(':');
  const argument = rest.join(':');
  if (verb === 'tab')
    await page.locator('.tabButton', { hasText: argument }).click({ force: true });
  else if (verb === 'click') await page.locator(argument).first().click({ force: true });
  else if (verb === 'clickText')
    await page.getByText(argument, { exact: false }).first().click({ force: true });
  else if (verb === 'hover') await page.locator(argument).first().hover();
  else if (verb === 'wait') await page.waitForTimeout(Number(argument));
  else if (verb === 'eval') await page.evaluate(argument);
  await page.waitForTimeout(500);
}

await page.screenshot({ path: `artifacts/shots/${name}.png` });
if (errors.length) console.log('errors:', errors.slice(0, 5));
console.log(`artifacts/shots/${name}.png`);
await browser.close();
