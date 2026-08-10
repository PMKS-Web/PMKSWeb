/**
 * Every Analyze panel, on every template, for every part of it.
 *
 * `template-graphs.mjs` already checks the *joint* kinematic graphs numerically,
 * against difference quotients of the plotted positions. This walks the rest:
 * the link graphs (centre-of-mass motion and angular motion), the force panels,
 * and the instant-centre view — the panels nothing has ever opened in anger.
 *
 * The checks here are deliberately coarse. A graph that renders blank, a series
 * with a hole in it, a part that visibly turns while its angular velocity reads
 * zero, a number with nine digits in front of the point: these are all things
 * that are wrong without needing to know what the right answer is.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/analysis-audit.mjs
 *   ONLY=4-Bar node e2e/analysis-audit.mjs
 *   SHOTS=1 node e2e/analysis-audit.mjs        # screenshot every panel state
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
const ids = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8')
  .match(/export const (?:BUILT_IN|LIBRARY)_TEMPLATE_IDS = \[([^\]]*)\]/g)
  .flatMap((block) => [...block.matchAll(/'([\w-]+)'/g)].map((m) => m[1]));

const MECHANISMS = (process.env.ONLY?.split(',') ?? ids).filter((id) => payloads[id]);
const SHOTS = !!process.env.SHOTS;
mkdirSync('artifacts/analysis-audit', { recursive: true });

const ctx = await chromium.launchPersistentContext('/tmp/pmks-chrome-analysis', {
  headless: true,
  viewport: { width: 1600, height: 1100 },
});
const page = await ctx.newPage();
let errors = [];
page.on('pageerror', (error) => errors.push(String(error).split('\n')[0]));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text().split('\n')[0]);
});

const findings = [];
const note = (kind, where, what, detail) => {
  findings.push({ kind, where, what, detail });
  console.log(`!! ${where} — ${what}`);
};

const load = async (id) => {
  await page.goto(`${BASE}/?${payloads[id]}`, { waitUntil: 'load' });
  await page.waitForTimeout(4200);
  errors = [];
  // Analyze is where the panels live.
  await page.click('text=Analyze').catch(() => undefined);
  await page.waitForTimeout(900);
};

/** What the mechanism is, so the audit can tell a still part from a moving one. */
const overview = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const mech = grid.mechanismSrv;
    const solved = mech.mechanisms[0];
    const frames = solved?.joints?.length ?? 0;
    const spread = (values) => Math.max(...values) - Math.min(...values);
    // How far each joint actually travels across the cycle, and how far each
    // link actually turns: the ground truth a flat graph is judged against.
    const travel = {};
    const turn = {};
    if (frames > 1) {
      solved.joints[0].forEach((joint, index) => {
        const xs = solved.joints.map((f) => f[index].x);
        const ys = solved.joints.map((f) => f[index].y);
        travel[joint.id] = Math.hypot(spread(xs), spread(ys));
      });
      solved.links[0].forEach((link, index) => {
        const angles = solved.links.map((f) => f[index].angle ?? 0);
        turn[link.id] = spread(angles);
      });
    }
    return {
      valid: mech.oneValidMechanismExists(),
      invalidReason: mech.invalidReason?.() ?? null,
      frames,
      joints: mech.joints.map((j) => j.id),
      links: mech.links.filter((l) => l.constructor.name === 'RealLink').map((l) => l.id),
      travel,
      turn,
    };
  });

const select = (kind, id) =>
  page.evaluate(
    ([kind, id]) => {
      const grid = ng.getComponent(document.querySelector('app-new-grid'));
      const mech = grid.mechanismSrv;
      const target =
        kind === 'joint'
          ? mech.joints.find((j) => j.id === id)
          : mech.links.find((l) => l.id === id);
      if (!target) return false;
      grid.activeObjService.updateSelectedObj(target);
      return true;
    },
    [kind, id]
  );

/** Open every collapsed section and graph row the panel is offering. */
async function openEverything() {
  for (let pass = 0; pass < 3; pass++) {
    const opened = await page.evaluate(() => {
      let count = 0;
      document.querySelectorAll('collapsible-subseciton').forEach((section) => {
        const header = section.querySelector('title-block, .title, [id*="title"]');
        const body = section.querySelector('.content, .body');
        if (header && body && getComputedStyle(body).display === 'none') {
          header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          count++;
        }
      });
      document.querySelectorAll('mat-expansion-panel').forEach((panel) => {
        if (!panel.classList.contains('mat-expanded')) {
          panel
            .querySelector('mat-expansion-panel-header')
            ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          count++;
        }
      });
      return count;
    });
    await page.waitForTimeout(700);
    if (opened === 0) break;
  }
  await page.waitForTimeout(600);
}

/** Everything every open graph is plotting, and what it calls itself. */
const readGraphs = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('app-analysis-graph')].map((el) => {
      const c = ng.getComponent(el);
      const series = (c.chartOptions?.series ?? []).map((s) => ({
        name: s.name,
        data: (s.data ?? []).map((point) => (Array.isArray(point) ? point[1] : point)),
      }));
      return {
        analysis: c.analysis,
        mechProp: c.mechProp,
        mechPart: c.mechPart,
        diagnostic: c.analysisDiagnostic ?? null,
        produced: c.chartOptions?.series !== undefined,
        yTitle: c.chartOptions?.yAxis?.title?.text ?? null,
        series,
      };
    })
  );

for (const id of MECHANISMS) {
  await load(id);
  const info = await overview();
  console.log(
    `\n=== ${id}: valid=${info.valid} frames=${info.frames} ` +
      `${info.joints.length} joints, ${info.links.length} links ===`
  );
  if (!info.valid) {
    // Not a finding: some templates are deliberately invalid. But the panel has
    // to say why rather than showing empty graphs.
    console.log(`   (invalid: ${info.invalidReason ?? 'no reason given'})`);
    if (!info.invalidReason)
      note('mute', `${id}`, 'is invalid but the panel gives no reason', info);
    continue;
  }

  const subjects = [
    ...info.joints.map((j) => ({ kind: 'joint', id: j })),
    ...info.links.map((l) => ({ kind: 'link', id: l })),
  ];

  for (const subject of subjects) {
    if (!(await select(subject.kind, subject.id))) continue;
    await page.waitForTimeout(400);
    await openEverything();
    const graphs = await readGraphs();
    const where = `${id} ${subject.kind} ${subject.id}`;

    if (graphs.length === 0) {
      note('empty', where, 'Analyze offers no graphs at all', {});
      continue;
    }
    if (SHOTS) {
      await page
        .locator('#analysisWrapper')
        .screenshot({ path: `artifacts/analysis-audit/${id}-${subject.kind}-${subject.id}.png` })
        .catch(() => undefined);
    }

    for (const graph of graphs) {
      const what = `${graph.mechProp} of ${graph.mechPart}`;
      if (!graph.produced) {
        note('blank', where, `${what}: renders a blank chart`, { diagnostic: graph.diagnostic });
        continue;
      }
      if (graph.series.length === 0) {
        if (!graph.diagnostic) note('blank', where, `${what}: no series and no explanation`, {});
        continue;
      }
      for (const line of graph.series) {
        const data = line.data;
        if (data.length === 0) {
          note('blank', where, `${what}: series "${line.name}" is empty`, {});
          continue;
        }
        const holes = data.filter((v) => v === null || v === undefined).length;
        const wild = data.filter((v) => typeof v === 'number' && !Number.isFinite(v)).length;
        const huge = data.filter((v) => typeof v === 'number' && Math.abs(v) > 1e9).length;
        if (wild) note('nan', where, `${what}: "${line.name}" has ${wild} non-finite values`, {});
        if (huge)
          note(
            'huge',
            where,
            `${what}: "${line.name}" reaches ${Math.max(...data.map(Math.abs)).toExponential(2)}`,
            {}
          );
        // A hole is how a solver failure shows on a graph; a couple at a
        // reversal is ordinary, a series full of them is not.
        if (holes > data.length * 0.1)
          note(
            'holes',
            where,
            `${what}: "${line.name}" is ${Math.round((holes / data.length) * 100)}% empty`,
            {}
          );
      }
      // A part that visibly moves and reports no motion is the flat-zero graph
      // this audit is really looking for.
      const moves =
        subject.kind === 'joint'
          ? (info.travel[subject.id] ?? 0) > 1
          : (info.turn[subject.id] ?? 0) > 0.01;
      const flat = graph.series.every((line) =>
        line.data.every((v) => v === null || v === undefined || Math.abs(v) < 1e-9)
      );
      if (moves && flat && /Vel|Acc|Pos/.test(graph.mechProp))
        note('flat', where, `${what}: reads flat zero on a part that moves`, {
          travel: info.travel[subject.id],
          turn: info.turn[subject.id],
        });
    }
  }
  if (errors.length) note('threw', id, `console errors: ${errors[0]}`, errors.slice(0, 3));
}

writeFileSync(
  'artifacts/analysis-audit/report.json',
  JSON.stringify({ mechanisms: MECHANISMS, findings }, null, 2)
);
const byKind = findings.reduce((acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] ?? 0) + 1 }), {});
console.log(`\n${findings.length} findings ${JSON.stringify(byKind)}`);
await ctx.close();
process.exit(findings.length === 0 ? 0 : 1);
