/**
 * Every action the app offers, on every kind of thing it offers them on.
 *
 * The point is not that each action does the right thing — most have their own
 * suite for that — but that the *set* is consistent: an action that is offered
 * is an action that does something, and an action that refuses says so. The
 * failure this exists to catch is the silent one. A control that is enabled,
 * pressed, and then neither changes the mechanism nor puts a word on screen has
 * told the user their click was lost.
 *
 * For each mechanism it walks every joint, every link, every force and the bare
 * grid; opens the context menu; and for each *enabled* item clicks it, reads the
 * model and the drawing back, and undoes. Disabled items are recorded but not
 * clicked — greying is itself an answer, and a legitimate one.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/interaction-sweep.mjs
 *   ONLY=4-Bar,Cylinder_Boom node e2e/interaction-sweep.mjs     # narrow it
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const source = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const payloads = Object.fromEntries(
  [...source.matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [id, p])
);
import { waitForReady } from './app-ready.mjs';

/**
 * Enough mechanisms to reach every kind of object at least once, and no more —
 * this walk is O(objects x actions) and each action costs a rebuild.
 */
const MECHANISMS = (
  process.env.ONLY?.split(',') ?? [
    '4-Bar', // revolute joints, ground, a driven pin, plain bars
    'Slider_Crank', // a grounded slider and its guide
    'Whitworth_Quick_Return', // a slot cut into a moving link
    'Cylinder_Boom', // a sealed cylinder: body, mounts, hidden interior
    'Jansen_Leg', // a welded compound, and many joints at once
  ]
).filter((id) => payloads[id]);

mkdirSync('artifacts/interaction-sweep', { recursive: true });

const ctx = await chromium.launchPersistentContext('/tmp/pmks-chrome-sweep-int', {
  headless: true,
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();
let errors = [];
page.on('pageerror', (error) => errors.push(String(error).split('\n')[0]));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text().split('\n')[0]);
});

/**
 * Everything an action could reasonably be expected to change, as one value.
 *
 * Flags as well as counts: toggling Ground on a joint changes nothing you could
 * count, and that is exactly the kind of action this walk has to be able to see
 * working.
 */
const signature = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const mech = grid.mechanismSrv;
    const joints = mech.joints
      .map(
        (j) =>
          `${j.id}${j.ground ? 'G' : ''}${j.input ? 'I' : ''}${j.isWelded ? 'W' : ''}` +
          `${j.constructor.name[0]}@${j.x.toFixed(2)},${j.y.toFixed(2)}`
      )
      .join('|');
    const links = mech.links
      .map((l) => `${l.id}:${l.constructor.name[0]}:${l.fill ?? '-'}`)
      .join('|');
    const forces = mech.forces
      .map((f) => `${f.id ?? f.name}:${f.local}:${f.startCoord.x.toFixed(1)}`)
      .join('|');
    const dofText = (document.body.textContent.match(/Degrees of Freedom:\s*(-?[\d.]+|NaN|—)/) ??
      [])[1];
    return {
      key: `${joints}//${links}//${forces}`,
      joints: mech.joints.length,
      links: mech.links.length,
      dof: dofText ?? null,
      skins: document.querySelectorAll('.cylinder-mark').length,
      drawnJoints: document.querySelectorAll('[id^="joint_"]').length,
      nan: [...document.querySelectorAll('svg *')].filter((node) =>
        [...node.attributes].some((a) => /NaN|Infinity/.test(a.value))
      ).length,
    };
  });

/** Whatever the app most recently said out loud, if anything. */
const spoken = () =>
  page.evaluate(() => {
    const bar = document.querySelector('simple-snack-bar, .mat-mdc-snack-bar-label');
    return bar?.textContent?.trim() ?? null;
  });

const dismiss = async () => {
  await page.evaluate(() => {
    document.querySelectorAll('.mat-mdc-snack-bar-container').forEach((node) => node.remove());
  });
};

const load = async (id) => {
  await page.goto(`${BASE}/?${payloads[id]}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  errors = [];
};

/** The context menu for an object, opened through the component the way it opens. */
const menuFor = (kind, id) =>
  page.evaluate(
    ([kind, id]) => {
      const grid = ng.getComponent(document.querySelector('app-new-grid'));
      const mech = grid.mechanismSrv;
      const target =
        kind === 'grid'
          ? 'grid'
          : kind === 'joint'
            ? mech.joints.find((j) => j.id === id)
            : kind === 'link'
              ? mech.links.find((l) => l.id === id)
              : mech.forces.find((f) => (f.id ?? f.name) === id);
      if (!target) return null;
      grid.setLastRightClick(target);
      grid.updateContextMenuItems();
      return grid.cMenuItems.map((item) => ({
        label: item.label,
        disabled: !!item.disabled,
      }));
    },
    [kind, id]
  );

/** Fire one menu item, exactly as the menu fires it. */
const fire = (kind, id, label) =>
  page.evaluate(
    ([kind, id, label]) => {
      const grid = ng.getComponent(document.querySelector('app-new-grid'));
      const mech = grid.mechanismSrv;
      const target =
        kind === 'grid'
          ? 'grid'
          : kind === 'joint'
            ? mech.joints.find((j) => j.id === id)
            : kind === 'link'
              ? mech.links.find((l) => l.id === id)
              : mech.forces.find((f) => (f.id ?? f.name) === id);
      grid.setLastRightClick(target);
      grid.updateContextMenuItems();
      const item = grid.cMenuItems.find((entry) => entry.label === label);
      if (!item) return 'gone';
      item.actionWrapper();
      return 'fired';
    },
    [kind, id, label]
  );

const findings = [];
const note = (finding) => {
  findings.push(finding);
  console.log(`!! ${finding.what}  [${finding.where}]`);
};

/**
 * Everything a user could actually right-click.
 *
 * Joints with no hitbox are skipped, and skipping them is the point rather than
 * a convenience: a sealed cylinder's interior — the buried barrel end, the pin,
 * the slider — is deliberately unreachable, so the guards that refuse to unweld
 * or unpick it are refusing something nobody can ask for. Walking them anyway
 * reports a silent refusal on a menu that never opens, which is a red result
 * nobody can act on. They are counted and named instead.
 */
const everySubject = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const mech = grid.mechanismSrv;
    const drawn = new Set(
      [...document.querySelectorAll('[id^="joint_"]')].map((node) => node.id.slice(6))
    );
    const hidden = mech.joints.filter((j) => !drawn.has(j.id)).map((j) => j.id);
    return {
      hidden,
      subjects: [
        { kind: 'grid', id: 'grid' },
        ...mech.joints.filter((j) => drawn.has(j.id)).map((j) => ({ kind: 'joint', id: j.id })),
        ...mech.links.map((l) => ({ kind: 'link', id: l.id })),
        ...mech.forces.map((f) => ({ kind: 'force', id: f.id ?? f.name })),
      ],
    };
  });

// Actions that begin a two-click gesture rather than finishing an edit: they are
// *meant* to change nothing until the second click, so silence is correct.
const GESTURES =
  /^(Add Link|Attach Link|Add Cylinder|Attach Cylinder|Create Cylinder|Attach Force)$/;

let clicked = 0;
for (const id of MECHANISMS) {
  await load(id);
  const { subjects, hidden } = await everySubject();
  const start = await signature();
  console.log(
    `\n=== ${id}: ${subjects.length} subjects, ${start.joints} joints` +
      `${hidden.length ? `, skipping ${hidden.join(',')} (no hitbox)` : ''} ===`
  );

  for (const subject of subjects) {
    const menu = await menuFor(subject.kind, subject.id);
    if (!menu) continue;
    for (const entry of menu) {
      if (entry.disabled) continue;
      const where = `${id} ${subject.kind} ${subject.id} :: ${entry.label}`;
      await dismiss();
      const before = await signature();
      errors = [];
      const result = await fire(subject.kind, subject.id, entry.label);
      if (result !== 'fired') continue;
      clicked++;
      await page.waitForTimeout(450);
      const after = await signature();
      const said = await spoken();

      if (errors.length) note({ what: `threw: ${errors[0]}`, where, kind: 'threw' });
      if (after.nan > before.nan)
        note({ what: `put ${after.nan - before.nan} NaN into the drawing`, where, kind: 'nan' });
      if (after.dof === 'NaN') note({ what: 'left degrees of freedom NaN', where, kind: 'nan' });
      if (before.joints > 0 && after.joints === 0 && !/Delete/.test(entry.label))
        note({ what: 'emptied the mechanism', where, kind: 'destroyed' });
      if (before.skins > after.skins && !/Delete/.test(entry.label))
        note({ what: 'lost a cylinder skin', where, kind: 'destroyed' });
      // The one this walk exists for.
      if (after.key === before.key && !said && !GESTURES.test(entry.label))
        note({ what: 'did nothing, and said nothing', where, kind: 'silent' });

      // Back to where we were, so the next action starts from the same place.
      await page.evaluate(() => {
        const grid = ng.getComponent(document.querySelector('app-new-grid'));
        const tabs = document.querySelector('app-left-tabs');
        const left = tabs && ng.getComponent(tabs);
        if (left && left.canUndo()) left.handleUndo();
        else grid.mechanismSrv.updateMechanism(false);
      });
      await page.waitForTimeout(400);
      const restored = await signature();
      if (restored.key !== before.key) {
        // Not a finding in itself — some actions are not undoable by design —
        // but the walk has to reload or every later result is measured against
        // a mechanism it did not expect.
        await load(id);
      }
    }
  }
}

const report = { mechanisms: MECHANISMS, actionsClicked: clicked, findings };
writeFileSync('artifacts/interaction-sweep/report.json', JSON.stringify(report, null, 2));
console.log(
  `\n${clicked} actions fired, ${findings.length} findings ` +
    `(${[...new Set(findings.map((f) => f.kind))].join(', ') || 'none'})`
);
await ctx.close();
process.exit(findings.length === 0 ? 0 : 1);
