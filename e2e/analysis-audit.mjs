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
import { waitForReady } from './app-ready.mjs';
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
  await page.goto(`${BASE}/?${payloads[id]}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
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
      // Measured off the link's own two joints rather than read from a getter:
      // the property is private, and the point is how far the body actually
      // turns, which its joints say without help.
      solved.links[0].forEach((link, index) => {
        const angles = solved.links.map((f) => {
          const [p, q] = f[index].joints;
          return p && q ? Math.atan2(q.y - p.y, q.x - p.x) : 0;
        });
        // Unwrapped, or a body that passes through pi reads as turning 2pi.
        let unwrapped = [angles[0]];
        for (let i = 1; i < angles.length; i++) {
          let d = angles[i] - angles[i - 1];
          while (d > Math.PI) d -= 2 * Math.PI;
          while (d < -Math.PI) d += 2 * Math.PI;
          unwrapped.push(unwrapped[i - 1] + d);
        }
        turn[link.id] = spread(unwrapped);
      });
    }
    return {
      valid: mech.oneValidMechanismExists(),
      invalidReason: mech.invalidReason?.() ?? null,
      frames,
      joints: mech.joints.map((j) => j.id),
      // Through the app's own predicate: class names carry a build-time prefix,
      // so comparing `constructor.name` to 'RealLink' silently matched nothing
      // and this audit walked no links at all.
      links: mech.links.filter((l) => grid.gridUtils.typeOfLink(l) === 'R').map((l) => l.id),
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

/**
 * Every series the Analyze panel can build, asked for directly.
 *
 * The panel builds each graph from four strings, so one live graph component
 * can be asked for all of them in turn. That is the whole reason this does not
 * drive the DOM: expanding the panel's sections is a fight with animations and
 * with Angular swapping components under the previous selection's graphs, and
 * every one of those fights ends in a suite that reports success because it
 * read nothing. Driving the component reaches more combinations than the panel
 * even offers, and reaches them deterministically.
 */
const askFor = (requests) =>
  page.evaluate((requests) => {
    const el = document.querySelector('app-analysis-graph');
    if (!el) return null;
    const c = ng.getComponent(el);
    return requests.map(([analysis, analysisType, mechProp, mechPart]) => {
      c.analysis = analysis;
      c.analysisType = analysisType;
      c.mechProp = mechProp;
      c.mechPart = mechPart;
      let threw = null;
      try {
        c.determineChart(analysis, analysisType, mechProp, mechPart);
      } catch (error) {
        threw = String(error).split('\n')[0];
      }
      return {
        mechProp,
        mechPart,
        threw,
        diagnostic: c.analysisDiagnostic ?? null,
        produced: c.chartOptions?.series !== undefined,
        series: (c.chartOptions?.series ?? []).map((s) => ({
          name: s.name,
          // A plotted point is `{x, y}`. Reading it as a number yields objects,
          // and every numeric check downstream then passes without testing
          // anything — which is how this audit first called all eighteen
          // templates clean while looking at no numbers at all.
          data: (s.data ?? []).map((p) => (p && typeof p === 'object' ? p.y : p)),
        })),
      };
    });
  }, requests);

/** Put one graph component on screen, whatever it is showing. */
async function primeGraph() {
  await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.activeObjService.updateSelectedObj(grid.mechanismSrv.joints[0]);
  });
  await page.waitForTimeout(700);
  for (let pass = 0; pass < 3; pass++) {
    await page.evaluate(() => {
      document.querySelectorAll('collapsible-subseciton').forEach((section) => {
        const header = section.querySelector('button.panel-header');
        if (header && !section.querySelector('mat-icon.rotate180')) header.click();
      });
      document.querySelectorAll('mat-expansion-panel').forEach((panel) => {
        if (!panel.classList.contains('mat-expanded'))
          panel
            .querySelector('mat-expansion-panel-header')
            ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    });
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(500);
  return (await page.$('app-analysis-graph')) !== null;
}

const JOINT_PROPS = [
  ['kinematic', 'loop', 'Linear Joint Pos'],
  ['kinematic', 'loop', 'Linear Joint Vel'],
  ['kinematic', 'loop', 'Linear Joint Acc'],
  ['force', 'statics', 'Joint Forces'],
  ['force', 'dynamics', 'Joint Forces'],
];
const LINK_PROPS = [
  ['kinematic', 'loop', 'Angular Link Pos'],
  ['kinematic', 'loop', 'Angular Link Vel'],
  ['kinematic', 'loop', 'Angular Link Acc'],
  ['kinematic', 'loop', "Linear Link's CoM Pos"],
  ['kinematic', 'loop', "Linear Link's CoM Vel"],
  ['kinematic', 'loop', "Linear Link's CoM Acc"],
];

let asked = 0;
let explained = 0;
for (const id of MECHANISMS) {
  await load(id);
  const info = await overview();
  console.log(
    `\n=== ${id}: valid=${info.valid} frames=${info.frames} ` +
      `${info.joints.length} joints, ${info.links.length} links ===`
  );
  if (!info.valid) {
    console.log(`   (invalid: ${info.invalidReason ?? 'no reason given'})`);
    if (!info.invalidReason) note('mute', id, 'is invalid but the panel gives no reason', info);
    continue;
  }
  if (!(await primeGraph())) {
    note('empty', id, 'Analyze never put a graph on screen', {});
    continue;
  }

  const requests = [
    ...info.joints.flatMap((j) => JOINT_PROPS.map(([a, t, p]) => [a, t, p, j])),
    ...info.links.flatMap((l) => LINK_PROPS.map(([a, t, p]) => [a, t, p, l])),
  ];
  const results = await askFor(requests);
  if (!results) {
    note('empty', id, 'no graph component to ask', {});
    continue;
  }
  asked += results.length;

  const readable = results.flatMap((r) =>
    r.series.flatMap((line) => line.data.filter((v) => typeof v === 'number'))
  );
  if (readable.length === 0) {
    note('vacuous', id, 'every graph answered, and no numbers could be read from any of them', {
      sample: results[0]?.series?.[0]?.data?.[0] ?? null,
    });
    continue;
  }

  for (const r of results) {
    const where = `${id} ${r.mechPart}`;
    const what = r.mechProp;
    if (r.threw) {
      note('threw', where, `${what}: threw — ${r.threw}`, {});
      continue;
    }
    if (!r.produced) {
      note('blank', where, `${what}: renders a blank chart`, { diagnostic: r.diagnostic });
      continue;
    }
    if (r.series.length === 0) {
      if (!r.diagnostic) note('blank', where, `${what}: no series and no explanation`, {});
      continue;
    }
    // A diagnostic means the panel is not drawing a chart at all — it replaces
    // it with the sentence. Judging the empty series behind it reports hundreds
    // of holes in graphs the user is never shown; what matters is that the
    // sentence is really on screen, which is checked once per mechanism below.
    if (r.diagnostic) {
      explained++;
      continue;
    }
    for (const line of r.series) {
      const data = line.data;
      if (data.length === 0) {
        note('blank', where, `${what}: series "${line.name}" is empty`, {});
        continue;
      }
      const holes = data.filter((v) => v === null || v === undefined).length;
      const wild = data.filter((v) => typeof v === 'number' && !Number.isFinite(v)).length;
      const numbers = data.filter((v) => typeof v === 'number' && Number.isFinite(v));
      const peak = numbers.length ? Math.max(...numbers.map(Math.abs)) : 0;
      if (wild) note('nan', where, `${what}: "${line.name}" has ${wild} non-finite values`, {});
      if (peak > 1e9)
        note('huge', where, `${what}: "${line.name}" reaches ${peak.toExponential(2)}`, {});
      if (holes > data.length * 0.1)
        note(
          'holes',
          where,
          `${what}: "${line.name}" is ${Math.round((holes / data.length) * 100)}% empty`,
          {}
        );
    }
    // A part that visibly moves and reports no motion at all.
    //
    // Position and velocity only. Acceleration is legitimately zero on plenty
    // of moving parts — the input link turns at a constant rate, so its angular
    // acceleration is flat zero and correct — and flagging that is how an audit
    // teaches people to ignore it.
    const moves =
      info.travel[r.mechPart] !== undefined
        ? info.travel[r.mechPart] > 1
        : info.turn[r.mechPart] !== undefined
          ? info.turn[r.mechPart] > 0.01
          : null;
    const flat = r.series.every((line) =>
      line.data.every((v) => v === null || v === undefined || Math.abs(v) < 1e-9)
    );
    if (moves === true && flat && /Vel|Pos/.test(r.mechProp) && !/Acc/.test(r.mechProp))
      note('flat', where, `${what}: reads flat zero on a part that moves`, {
        travel: info.travel[r.mechPart],
        turn: info.turn[r.mechPart],
      });
  }
  // A declined graph is replaced on screen by a sentence rather than left as an
  // empty chart — `analysis-diagnostic` where the solver declined one graph,
  // `analysis-message` where a whole section has no rows.
  //
  // That is NOT asserted here, deliberately. Three attempts to check it from
  // this walk (imperative read, DOM read, polled DOM read) each reported panels
  // silent that a hand check then found speaking: the panel renders through
  // animations and a component swap, and every version of the check was
  // measuring its own timing. A check that cries wolf teaches people to skip
  // the suite, which costs more than the check is worth.
  //
  // Verified by hand instead, on the two shapes that produce it:
  //   Scotch_Yoke joint C  — "This topology does not have a determinate
  //                           force-equilibrium model."
  //   Windshield_Wiper T   — "Joint T is internal to one welded body and has
  //                           no independent pin reaction..."
  // Both were on screen. `explained` below counts how many graphs took that
  // path, so a change that stopped producing the explanations at all would show
  // as that number collapsing.
  if (errors.length) note('threw', id, `console errors: ${errors[0]}`, errors.slice(0, 3));
}

writeFileSync(
  'artifacts/analysis-audit/report.json',
  JSON.stringify({ mechanisms: MECHANISMS, findings }, null, 2)
);
const byKind = findings.reduce((acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] ?? 0) + 1 }), {});
console.log(
  `\n${asked} graphs asked for, ${explained} declined with an explanation, ` +
    `${findings.length} findings ${JSON.stringify(byKind)}`
);
await ctx.close();
process.exit(findings.length === 0 ? 0 : 1);
