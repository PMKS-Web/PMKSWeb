/**
 * Every template in the linkage library, checked for CORRECT kinematic graphs.
 *
 * "It animates" is not evidence the graphs are right: a grounded sliding block
 * once reported zero velocity and acceleration while its rider moved, and the
 * animation looked perfect throughout. So this script does not look at the
 * picture — it reads the numbers Apex is plotting straight out of the
 * AnalysisGraphComponent and checks them against each other:
 *
 *   - the velocity and acceleration graphs produce a series at all (a solver
 *     that throws leaves the component's `series` undefined and the panel
 *     renders empty, with no error shown to the user)
 *   - nothing non-finite anywhere (the component maps NaN/Infinity to a null
 *     point, so a null in a plotted series is the tell)
 *   - the plotted position equals the joint's actual solved position
 *   - the plotted velocity equals a finite difference of the plotted position
 *   - the plotted acceleration equals a finite difference of the plotted
 *     velocity
 *   - a joint that visibly moves does not graph as stationary
 *
 * The velocity check is the one that would have caught the zero-velocity bug:
 * position and velocity come from different solver paths, so agreeing to a few
 * percent is a real cross-check rather than a tautology.
 *
 * Where a finite difference legitimately cannot match
 * ---------------------------------------------------
 * A difference quotient is only the derivative where the source series is
 * differentiable, and it is only *accurate* where the source's higher
 * derivatives are modest. Both caveats bite somewhere in this library, so
 * rather than widen the tolerance to swallow them:
 *
 *   - accuracy is bought with a 4th-order five-point stencil, whose truncation
 *     error is O(dt^4) instead of O(dt^2). A plain central difference is off by
 *     ~5% of peak through the elliptical crank's high-jerk stretch purely
 *     because of its own truncation, which is a fact about the arithmetic and
 *     not about the app.
 *   - non-differentiable poses are identified from the *source* series alone —
 *     a reversal (a driven cylinder hitting its stroke end, a rocker at a
 *     limit) leaves position with a corner, and a dead centre leaves velocity
 *     unbounded. Both show up as the two one-sided slopes disagreeing wildly.
 *     A disagreement within two samples of such a kink is reported by index
 *     rather than counted as a failure; a disagreement anywhere else fails.
 *
 * Run: node e2e/template-graphs.mjs
 *      PMKS_ONLY=Scotch_Yoke node e2e/template-graphs.mjs   (one template)
 */
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_URL ?? 'http://127.0.0.1:4200/';
const OUT = 'artifacts/template-graphs';
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------
// Templates, read from the shipping source so this cannot drift from it.
// ---------------------------------------------------------------------------
const SRC = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const idList = (name) =>
  [
    ...(SRC.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([^\\]]*)\\]`))?.[1] ?? '').matchAll(
      /'([^']+)'/g
    ),
  ].map((m) => m[1]);
const TEMPLATE_IDS = [...idList('BUILT_IN_TEMPLATE_IDS'), ...idList('LIBRARY_TEMPLATE_IDS')];
const payloadBlock = SRC.slice(SRC.indexOf('TEMPLATE_LINKAGES'));
const TEMPLATE_LINKAGES = Object.fromEntries(
  [...payloadBlock.matchAll(/^\s*'?([A-Za-z0-9_-]+)'?:\s*\n?\s*'([^']+)',/gm)].map((m) => [
    m[1],
    m[2],
  ])
);
const absent = TEMPLATE_IDS.filter((id) => !TEMPLATE_LINKAGES[id]);
if (!TEMPLATE_IDS.length || absent.length) {
  console.error('Could not parse templates from source. missing:', absent);
  process.exit(2);
}
const ONLY = process.env.PMKS_ONLY ? process.env.PMKS_ONLY.split(',') : null;
const IDS = ONLY ? TEMPLATE_IDS.filter((id) => ONLY.includes(id)) : TEMPLATE_IDS;

// ---------------------------------------------------------------------------
// Tolerances
// ---------------------------------------------------------------------------
// Series are rounded to 3 decimals before plotting, so a difference quotient
// over one timestep carries 0.0005/dt of pure rounding noise. Everything else
// is judged against the series' own peak, so a mechanism's scale is irrelevant.
const REL_TOL = 0.03; // 3% of the series peak
const ROUND_HALF = 0.0005;
// The five-point stencil's coefficients sum to 1.5/dt in absolute value, so it
// amplifies the source's rounding by that much.
const NOISE_GAIN = 1.5;
// How far apart the two one-sided slopes have to be, relative to the source's
// own characteristic slope, before the source counts as kinked at that sample.
const KINK_FACTOR = 0.5;
// A disagreement this close to a kink is the kink's doing: curvature is
// unbounded there and no stencil reaching across it means anything.
const KINK_REACH = 2;
// Kinked samples cluster: one reversal blurs over several neighbouring samples,
// so what is counted is the number of distinct non-differentiable *events*. A
// mechanism has one or two per cycle; a series full of them is a broken series
// wearing a disguise.
const MAX_KINK_EVENTS = 3;

// ---------------------------------------------------------------------------
const results = [];
const failures = [];
let currentTemplate = '';
const check = (name, pass, detail) => {
  const row = { template: currentTemplate, name, pass, detail };
  results.push(row);
  if (!pass) failures.push(row);
  console.log(
    `  ${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`
  );
};

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const peak = (points) => Math.max(...points.map((p) => (finite(p?.y) ? Math.abs(p.y) : 0)), 0);

const quantile = (values, q) => {
  const s = values.filter(finite).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
};

/**
 * Compare a plotted series against difference quotients of the series it should
 * be the derivative of.
 *
 * A sample passes if the plotted value matches ANY of the five-point, central,
 * forward or backward quotient. On a smooth stretch they all agree (the
 * five-point one most accurately), so offering the alternatives is not a
 * loosening; at a corner it credits the plotted value for matching the slope on
 * the side of the corner it actually belongs to.
 */
function compareDerivative(plotted, source, dt, sharedKinks = [], siblingPeak = 0) {
  // Judged against how much the joint actually moves, not against how much this
  // one channel of it does. A joint can travel a long way in y and 0.006 units
  // in x, and then the x series peaks near zero: a tolerance relative to *that*
  // is a tolerance on rounding, and any reversal blows through it while meaning
  // nothing. The scissor lift's platform is exactly that joint.
  const scale = Math.max(peak(plotted), siblingPeak, 1e-9);
  const noise = (NOISE_GAIN * ROUND_HALF) / dt;
  const n = Math.min(plotted.length, source.length);
  const y = (i) => source[i]?.y;
  const t = (i) => source[i]?.x;

  // One-sided slopes everywhere, used both as candidates and to find kinks.
  const bwd = [],
    fwd = [],
    ctr = [];
  for (let i = 0; i < n; i++) {
    bwd[i] =
      i > 0 && finite(y(i)) && finite(y(i - 1)) ? (y(i) - y(i - 1)) / (t(i) - t(i - 1)) : NaN;
    fwd[i] =
      i < n - 1 && finite(y(i)) && finite(y(i + 1)) ? (y(i + 1) - y(i)) / (t(i + 1) - t(i)) : NaN;
    ctr[i] = finite(bwd[i]) && finite(fwd[i]) ? (y(i + 1) - y(i - 1)) / (t(i + 1) - t(i - 1)) : NaN;
  }
  // A kink is where the two one-sided slopes disagree by much more than the
  // source's own characteristic slope — a corner or an unbounded rate.
  const slopeScale = Math.max(quantile(ctr.map(Math.abs), 0.9), 1e-9);
  const kinkThreshold = Math.max(KINK_FACTOR * slopeScale, 6 * noise);
  const kinks = [];
  for (let i = 0; i < n; i++) {
    if (finite(bwd[i]) && finite(fwd[i]) && Math.abs(fwd[i] - bwd[i]) > kinkThreshold)
      kinks.push(i);
  }
  // A reversal belongs to the mechanism, not to one series: every joint's
  // velocity is discontinuous at the same instant. Deciding that per series
  // made the harness contradict itself -- on the Chebyshev linkage it called
  // joint A non-differentiable at sample 80 and joint M differentiable at the
  // same sample, because the threshold is scaled by each series' own typical
  // slope and M happens to be moving slowly right where it turns around. So a
  // sample any series of this mechanism kinks at counts for all of them.
  const allKinks = [...new Set([...kinks, ...sharedKinks])];
  const nearKink = (i) => allKinks.some((k) => Math.abs(k - i) <= KINK_REACH);

  const offenders = [];
  let compared = 0;
  // Worst disagreement anywhere the source is differentiable, reported whether
  // or not it clears the tolerance — it is the number that says how well the
  // two solver paths actually agree.
  let worstClean = 0,
    worstCleanAt = -1;
  for (let i = 1; i < n - 1; i++) {
    const p = plotted[i]?.y;
    if (!finite(p) || !finite(ctr[i])) continue;
    compared++;
    const candidates = [bwd[i], fwd[i], ctr[i]];
    // 4th-order five-point stencil, where there is room for it.
    if (i >= 2 && i <= n - 3 && [y(i - 2), y(i + 2)].every(finite)) {
      candidates.push((-y(i + 2) + 8 * y(i + 1) - 8 * y(i - 1) + y(i - 2)) / (12 * dt));
    }
    const err = Math.min(...candidates.filter(finite).map((q) => Math.abs(p - q)));
    const rel = Math.max(0, err - noise) / scale;
    if (!nearKink(i) && rel > worstClean) {
      worstClean = rel;
      worstCleanAt = i;
    }
    if (rel > REL_TOL) {
      offenders.push({
        i,
        t: Number(t(i).toFixed(4)),
        plotted: p,
        backward: Number(bwd[i].toFixed(3)),
        forward: Number(fwd[i].toFixed(3)),
        rel: Number(rel.toFixed(4)),
        nearKink: nearKink(i),
      });
    }
  }

  const unexplained = offenders.filter((o) => !o.nearKink);
  // Only kinks that actually cost accuracy are worth counting; a rounding-level
  // wobble in a series that is flat to three decimals is not a reversal.
  const loadBearing = kinks.filter((k) => offenders.some((o) => Math.abs(o.i - k) <= KINK_REACH));
  // One reversal smears across several samples, so collapse runs into events.
  const events = loadBearing.filter(
    (k, idx) => idx === 0 || k - loadBearing[idx - 1] > 2 * KINK_REACH + 1
  );
  return {
    compared,
    scale,
    offenders,
    unexplained,
    kinks: loadBearing,
    events,
    worstClean,
    worstCleanAt,
    worstSmooth: Math.max(0, ...unexplained.map((o) => o.rel), 0),
    pass: compared > 0 && unexplained.length === 0 && events.length <= MAX_KINK_EVENTS,
  };
}

// ---------------------------------------------------------------------------
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
let consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().replace(/\s+/g, ' ').slice(0, 220));
});
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 220)));

async function dismissOverlays() {
  if (
    await page
      .locator('.introjs-tooltip')
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    await page
      .locator('.introjs-skipbutton')
      .first()
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(400);
  }
  if ((await page.locator('mat-dialog-container').count()) > 0) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

/** Whatever the app itself knows about the loaded mechanism. */
const readMechanism = () =>
  page.evaluate(() => {
    const grid = document.querySelector('app-new-grid');
    if (!grid || !window.ng) return { error: 'no grid' };
    const ms = window.ng.getComponent(grid).mechanismSrv;
    const m = ms.mechanisms?.[0];
    if (!m) return { error: 'no mechanism' };
    const SCALE = 200; // MODEL_SCALE
    const ids = m.joints[0].map((j) => j.id);
    const tracks = {};
    for (const id of ids) {
      tracks[id] = m.joints.map((step) => {
        const j = step.find((x) => x.id === id);
        return [j ? j.x / SCALE : NaN, j ? j.y / SCALE : NaN];
      });
    }
    // A prismatic guide's marker is drawn with r=0: the block's own body is the
    // selectable thing, and the guide joint cannot be clicked at all.
    const markers = Object.fromEntries(
      [...document.querySelectorAll('[id^="joint_"]')].map((e) => [
        e.id.replace('joint_', ''),
        e.tagName === 'circle' ? Number(e.getAttribute('r')) : 1,
      ])
    );
    return {
      dof: m.dof,
      steps: m.joints.length,
      timeNum: m.timeNum,
      jointIds: ids,
      kinds: Object.fromEntries(m.joints[0].map((j) => [j.id, j.constructor.name])),
      ground: Object.fromEntries(m.joints[0].map((j) => [j.id, !!j.ground])),
      input: Object.fromEntries(m.joints[0].map((j) => [j.id, !!j.input])),
      tracks,
      markers,
    };
  });

/** The numbers each open kinematic graph is actually plotting. */
const readGraphs = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('app-analysis-graph')].map((el) => {
      const c = window.ng.getComponent(el);
      return {
        mechProp: c.mechProp,
        mechPart: c.mechPart,
        diagnostic: c.analysisDiagnostic,
        // undefined (rather than empty) means determineChart threw before it
        // could assign anything — the panel then renders a blank chart.
        seriesProduced: c.chartOptions.series !== undefined,
        series: (c.chartOptions.series ?? []).map((s) => ({ name: s.name, data: s.data })),
      };
    })
  );

const selectedJointId = () =>
  page.evaluate(() => {
    const grid = document.querySelector('app-new-grid');
    return window.ng.getComponent(grid).activeObjService?.selectedJoint?.id ?? null;
  });

const GRAPH_ROWS = ['Position of Joint', 'Velocity of Joint', 'Acceleration of Joint'];

async function openKinematicRows() {
  for (const label of GRAPH_ROWS) {
    const header = page.locator('mat-expansion-panel-header', { hasText: label }).first();
    if ((await header.count()) === 0) continue;
    const panel = page.locator('mat-expansion-panel', { hasText: label }).first();
    const expanded = await panel
      .getAttribute('class')
      .then((c) => (c ?? '').includes('mat-expanded'))
      .catch(() => false);
    if (expanded) continue;
    await header.scrollIntoViewIfNeeded();
    await header.click({ force: true });
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(500);
}

/**
 * Click a joint. Joint hit areas overlap, so a click can land on a neighbour;
 * when it does, fall back to dispatching the same pointerdown the template
 * binds, on the intended element. Returns how the selection was made.
 */
async function selectJoint(id) {
  const el = page.locator(`#joint_${id}`).first();
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await el.click({ force: true, timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  if ((await selectedJointId()) === id) return 'click';
  await page.evaluate((jid) => {
    document
      .querySelector(`#joint_${jid}`)
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  }, id);
  await page.waitForTimeout(400);
  return (await selectedJointId()) === id ? 'dispatch' : 'failed';
}

async function shot(name, locator) {
  try {
    await (locator ?? page).screenshot({ path: `${OUT}/${name}.png` });
  } catch {
    /* a collapsed or detached panel is not worth failing the run over */
  }
}

// ---------------------------------------------------------------------------
const summary = [];

for (const id of IDS) {
  currentTemplate = id;
  consoleErrors = [];
  console.log(`\n=== ${id} ===`);
  const before = results.length;
  const notes = [];
  const kinkNotes = [];
  let worstClean = 0;
  let worstCleanWhere = '';

  try {
    await page.goto(`${BASE}?${TEMPLATE_LINKAGES[id]}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await waitForReady(page);
    await dismissOverlays();

    const mech = await readMechanism();
    check('payload decodes into a mechanism', !mech.error, mech.error);
    if (mech.error) {
      summary.push({ id, status: 'FAIL', failed: 1, notes: [mech.error], kinkNotes });
      continue;
    }
    check('reports DOF 1', mech.dof === 1, { dof: mech.dof });
    check('precomputes a cycle', mech.steps > 2, { steps: mech.steps });
    const dt = (mech.timeNum[1] ?? 0) - (mech.timeNum[0] ?? 0);
    check(
      'time axis is strictly increasing',
      mech.timeNum.every((t, i) => i === 0 || t > mech.timeNum[i - 1]),
      { first: mech.timeNum.slice(0, 3), last: mech.timeNum.slice(-2) }
    );
    if (mech.steps <= 2) {
      summary.push({ id, status: 'FAIL', failed: 1, notes: ['no precomputed cycle'], kinkNotes });
      continue;
    }
    notes.push(`${mech.steps} steps`);

    const span = (jid) => {
      const t = mech.tracks[jid];
      const xs = t.map((p) => p[0]).filter(Number.isFinite);
      const ys = t.map((p) => p[1]).filter(Number.isFinite);
      if (!xs.length) return 0;
      return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    };
    const allMoving = mech.jointIds.filter((j) => span(j) > 0.01);
    // A guide joint drawn with r=0 has no hit area; its graphs are not
    // reachable through the UI at all, so they are out of scope here.
    const unreachable = allMoving.filter((j) => !(mech.markers[j] > 0));
    const moving = allMoving.filter((j) => mech.markers[j] > 0);
    if (unreachable.length)
      notes.push(
        `not selectable in the UI: ${unreachable.map((j) => `${j}(${mech.kinds[j]})`).join(',')}`
      );
    check('has at least one selectable moving joint', moving.length > 0, {
      spans: Object.fromEntries(mech.jointIds.map((j) => [j, Number(span(j).toFixed(3))])),
    });
    if (!moving.length) {
      summary.push({
        id,
        status: 'FAIL',
        failed: 1,
        notes: [...notes, 'no selectable moving joint'],
        kinkNotes,
      });
      continue;
    }
    notes.push(`joints ${moving.join(',')}`);

    // Open Analyze once; the expansion state survives changing the selection.
    await selectJoint(moving[0]);
    const analyzeOpen = await page
      .locator('app-analysis-panel #analysisWrapper')
      .first()
      .isVisible()
      .catch(() => false);
    if (!analyzeOpen) await page.locator('button.leftButton').nth(2).click();
    await page.waitForTimeout(900);
    await openKinematicRows();

    for (const j of moving) {
      const how = await selectJoint(j);
      if (how === 'failed') {
        check(`${id}/${j}: joint can be selected`, false, {
          selected: await selectedJointId(),
          note: 'harness could not select this joint',
        });
        continue;
      }
      await openKinematicRows();
      const graphs = await readGraphs();
      const byProp = Object.fromEntries(graphs.map((g) => [g.mechProp, g]));
      const heading = `${id}/${j}`;

      const pos = byProp['Linear Joint Pos'];
      const vel = byProp['Linear Joint Vel'];
      const acc = byProp['Linear Joint Acc'];
      check(`${heading}: all three kinematic graph panels exist`, !!pos && !!vel && !!acc, {
        got: Object.keys(byProp),
      });
      if (!pos || !vel || !acc) continue;
      check(
        `${heading}: graphs are for the selected joint`,
        pos.mechPart === j && vel.mechPart === j && acc.mechPart === j,
        { pos: pos.mechPart, vel: vel.mechPart, acc: acc.mechPart }
      );

      // --- the graph produced data at all ---------------------------------
      let blank = false;
      for (const g of [pos, vel, acc]) {
        const ok = g.seriesProduced && g.series.length > 0 && g.series[0].data.length > 0;
        if (!ok) blank = true;
        check(`${heading}: ${g.mechProp} graph plots a series`, ok, {
          seriesProduced: g.seriesProduced,
          seriesCount: g.series.length,
          diagnostic: g.diagnostic,
          consoleErrors: consoleErrors.slice(0, 2),
        });
      }
      if (blank) {
        for (const label of GRAPH_ROWS)
          await shot(
            `${id}_${j}_${label.split(' ')[0].toLowerCase()}`,
            page.locator('mat-expansion-panel', { hasText: label }).first()
          );
        continue;
      }

      // --- finiteness ------------------------------------------------------
      for (const g of [pos, vel, acc]) {
        for (const s of g.series) {
          const bad = s.data.map((p, i) => (finite(p?.y) ? -1 : i)).filter((i) => i >= 0);
          check(`${heading}: ${g.mechProp} series ${s.name} is finite everywhere`, !bad.length, {
            nonFiniteCount: bad.length,
            firstIndices: bad.slice(0, 5),
            sample: bad.slice(0, 3).map((i) => ({ i, t: s.data[i].x, y: s.data[i].y })),
          });
        }
      }

      // --- position matches the solved positions ---------------------------
      const px = pos.series.find((s) => s.name === 'X')?.data ?? [];
      const py = pos.series.find((s) => s.name === 'Y')?.data ?? [];
      let posErr = 0,
        posAt = -1;
      for (let i = 0; i < Math.min(px.length, mech.tracks[j].length); i++) {
        const e = Math.max(
          Math.abs((px[i]?.y ?? NaN) - mech.tracks[j][i][0]),
          Math.abs((py[i]?.y ?? NaN) - mech.tracks[j][i][1])
        );
        if (!(e <= posErr)) {
          posErr = Number.isNaN(e) ? Infinity : e;
          posAt = i;
        }
      }
      check(
        `${heading}: plotted position matches the solved joint position`,
        px.length === mech.steps && posErr <= 0.001,
        { worstAbs: posErr, atIndex: posAt, plottedLen: px.length, steps: mech.steps }
      );

      // --- velocity vs a difference quotient of position -------------------
      const vx = vel.series.find((s) => s.name === 'X')?.data ?? [];
      const vy = vel.series.find((s) => s.name === 'Y')?.data ?? [];
      const vz = vel.series.find((s) => s.name === 'Z')?.data ?? [];
      const ax = acc.series.find((s) => s.name === 'X')?.data ?? [];
      const ay = acc.series.find((s) => s.name === 'Y')?.data ?? [];

      const derivatives = [
        ['velocity X', vx, px],
        ['velocity Y', vy, py],
        ['acceleration X', ax, vx],
        ['acceleration Y', ay, vy],
      ];
      // First pass finds where this mechanism turns around, in any of its
      // series; the second judges every series against that shared answer.
      const sharedKinks = [
        ...new Set(derivatives.flatMap(([, p, src]) => compareDerivative(p, src, dt).kinks)),
      ];
      // The joint's own motion, per kind: the x and y channels of one quantity
      // are two views of one movement, so a dead one is judged against its
      // living partner rather than against itself.
      const peakOf = (what) =>
        Math.max(
          ...derivatives
            .filter(([name]) => name.split(' ')[0] === what.split(' ')[0])
            .map(([, series]) => peak(series))
        );
      for (const [what, plotted, source] of derivatives) {
        const cmp = compareDerivative(plotted, source, dt, sharedKinks, peakOf(what));
        if (cmp.worstClean > worstClean) {
          worstClean = cmp.worstClean;
          worstCleanWhere = `${heading} ${what} @ sample ${cmp.worstCleanAt}`;
        }
        if (cmp.events.length)
          kinkNotes.push(
            `${heading} ${what}: source not differentiable near sample ${cmp.events.join(', ')} (${cmp.kinks.length} samples)`
          );
        check(
          `${heading}: ${what} agrees with a difference quotient of its source`,
          cmp.pass,
          cmp.pass
            ? undefined
            : {
                compared: cmp.compared,
                unexplainedSamples: cmp.unexplained.length,
                worstUnexplained: cmp.unexplained.sort((a, b) => b.rel - a.rel).slice(0, 3),
                kinkedSamples: cmp.kinks.length,
                kinkEvents: cmp.events,
                seriesPeak: Number(cmp.scale.toFixed(4)),
              }
        );
      }

      // Magnitude must be the magnitude of its own components.
      let magErr = 0;
      for (let i = 0; i < vz.length; i++) {
        const m = Math.hypot(vx[i]?.y ?? NaN, vy[i]?.y ?? NaN);
        magErr = Math.max(magErr, Math.abs(m - (vz[i]?.y ?? NaN)) || 0);
      }
      check(`${heading}: velocity magnitude matches its components`, magErr <= 0.002, { magErr });

      // --- a moving joint is not stationary --------------------------------
      check(`${heading}: a moving joint has non-zero velocity`, peak(vz.length ? vz : vx) > 1e-6, {
        travel: Number(span(j).toFixed(3)),
        velocityPeak: peak(vz.length ? vz : vx),
      });

      const jointFailed = failures.some((f) => f.name.startsWith(heading + ':'));
      if (j === moving[0] || jointFailed) {
        for (const label of GRAPH_ROWS)
          await shot(
            `${id}_${j}_${label.split(' ')[0].toLowerCase()}`,
            page.locator('mat-expansion-panel', { hasText: label }).first()
          );
      }
    }
    if (consoleErrors.length) notes.push(`${consoleErrors.length} console errors`);
    check(
      'no console errors while graphing',
      consoleErrors.length === 0,
      consoleErrors.slice(0, 2)
    );
  } catch (err) {
    check('template completes without throwing', false, String(err).slice(0, 300));
  }

  const failed = results.slice(before).filter((r) => !r.pass).length;
  if (worstCleanWhere)
    notes.push(
      `worst differentiable-sample disagreement ${(worstClean * 100).toFixed(2)}% (${worstCleanWhere})`
    );
  summary.push({ id, status: failed ? 'FAIL' : 'PASS', failed, notes, kinkNotes });
}

// ---------------------------------------------------------------------------
console.log('\n================ SUMMARY ================');
for (const s of summary) {
  console.log(
    `${s.status}  ${s.id.padEnd(26)} ${s.notes.join(' | ')}${s.failed ? `  [${s.failed} failed]` : ''}`
  );
  for (const k of s.kinkNotes.slice(0, 4)) console.log(`        non-differentiable: ${k}`);
}
writeFileSync(`${OUT}/report.json`, JSON.stringify({ summary, results }, null, 2));
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed`);
console.log(`report: ${OUT}/report.json   screenshots: ${OUT}/`);

await browser.close();
process.exit(failures.length ? 1 : 0);
