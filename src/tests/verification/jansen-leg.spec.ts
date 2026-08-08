// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { Loop, loopId } from '../../app/model/mechanism/loop-solver';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  JANSEN,
  JANSEN_BARS,
  jansenLegFixture,
} from '../../test-utils/verification/library-fixtures';

// Jansen's leg is the linkage the suite was missing at the top end of the pin
// machinery: eight bars, two triangles and a ground pivot shared by two bodies,
// all still dyadic, and with an output nobody has to take on trust. A walking
// foot either walks or it does not, and the numbers below say which.
//
// Nothing here is reference data. Every bound is measured off this mechanism and
// quoted in the comment beside it, so a solver change that quietly rounds the
// leg's shape fails on a number rather than on a picture.

describe("Theo Jansen's leg", () => {
  const { mechanism } = buildMechanism(jansenLegFixture());
  const at = (t: number, id: string): Joint => mechanism.joints[t].find((j) => j.id === id)!;
  const frames = mechanism.joints.length;
  // The last frame repeats the first, so cycle fractions are measured over the
  // frames that are actually distinct poses.
  const cycle = frames - 1;
  const foot = Array.from({ length: cycle }, (_, t) => ({ x: at(t, 'F').x, y: at(t, 'F').y }));
  const xs = foot.map((p) => p.x);
  const ys = foot.map((p) => p.y);
  const stride = Math.max(...xs) - Math.min(...xs);
  const lift = Math.max(...ys) - Math.min(...ys);

  /** Max perpendicular distance from the least-squares line, and its slope. */
  const fitLine = (pts: { x: number; y: number }[]) => {
    const mx = pts.reduce((t, p) => t + p.x, 0) / pts.length;
    const my = pts.reduce((t, p) => t + p.y, 0) / pts.length;
    const slope =
      pts.reduce((t, p) => t + (p.x - mx) * (p.y - my), 0) /
      pts.reduce((t, p) => t + (p.x - mx) ** 2, 0);
    const stray = Math.max(
      ...pts.map((p) => Math.abs(p.y - (my + slope * (p.x - mx))) / Math.sqrt(1 + slope ** 2))
    );
    return { slope, stray };
  };

  it('is one degree of freedom and turns the crank all the way round', () => {
    // Seven moving bodies, ten revolute joints: 3(7) - 2(10) = 1. Worth
    // asserting rather than assuming, because the shared ground pivot at G and
    // the two three-body pins are exactly where a mobility count goes wrong.
    expect((mechanism as unknown as { dof: number }).dof).toBe(1);
    expect(frames).toBeGreaterThan(300);

    let swept = 0;
    for (let t = 1; t < frames; t++) {
      const was = Math.atan2(at(t - 1, 'A').y, at(t - 1, 'A').x);
      const now = Math.atan2(at(t, 'A').y, at(t, 'A').x);
      let step = now - was;
      if (step > Math.PI) step -= 2 * Math.PI;
      if (step < -Math.PI) step += 2 * Math.PI;
      swept += step;
    }
    // Short of a full turn by 6.7e-6 rad, which is the rounded input increment
    // accumulated over 360 steps rather than a linkage that fails to close.
    expect(Math.abs(Math.abs(swept) - 2 * Math.PI)).toBeLessThan(1e-5);
  });

  it('holds every one of the holy numbers at every frame', () => {
    // The point of the fixture. Jansen's proportions are quoted, not derived,
    // and a percent off any of them spoils the foot path -- so a leg that drifts
    // is no longer the linkage the numbers name, whatever it still draws.
    // Worst drift over all 360 frames and all eleven bars: 6.7e-5, on C-E.
    for (let t = 0; t < frames; t++) {
      for (const [p, q, want] of JANSEN_BARS) {
        const now = Math.hypot(at(t, p).x - at(t, q).x, at(t, p).y - at(t, q).y);
        expect(Math.abs(now - want), `${p}${q} at frame ${t}`).toBeLessThan(1e-3);
      }
    }
  });

  it('traces a closed curve', () => {
    // A revolution of the crank has to put the whole leg back where it started.
    // If it does not, the linkage changed assembly mode somewhere in the turn
    // and the path drawn is two half-mechanisms spliced together.
    // Worst joint closure: 3.1e-4.
    for (const id of ['A', 'B', 'C', 'D', 'E', 'F']) {
      const start = at(0, id);
      const end = at(frames - 1, id);
      expect(Math.hypot(start.x - end.x, start.y - end.y), id).toBeLessThan(1e-3);
    }
    // And it is a curve rather than a wobble: the foot travels 68 units, more
    // than four crank diameters, off a crank of 15.
    expect(stride).toBeGreaterThan(4 * JANSEN.m);
    expect(lift).toBeGreaterThan(JANSEN.m);
  });

  it('plants a long, level, near-straight sole', () => {
    // The sole is the part of the path that is actually on the ground, so it is
    // measured as the samples lying within 5% of the path's height of its lowest
    // point -- a band, not the whole lower arc, because the foot curls up at
    // both ends of the stroke and including those curls measures the touch-down
    // and the lift-off rather than the stance.
    const sole = foot.filter((p) => p.y <= Math.min(...ys) + 0.05 * lift);
    const span = Math.max(...sole.map((p) => p.x)) - Math.min(...sole.map((p) => p.x));
    const { slope, stray } = fitLine(sole);

    // Measured: 160 of 360 frames, so the foot is on the ground for 44% of the
    // turn; the contact spans 86% of the whole stride; it strays 1.6% of that
    // span from the line it fits; and that line sits 0.09 degrees off level.
    // Each bound is the nearest round number outside what the leg achieves, so
    // each one discriminates. The same bars can be assembled 32 ways: 12 of
    // those jam partway through a turn, and of the 19 that do run, none reaches
    // 24% of the cycle or 42% of its own stride. Only Jansen's walks.
    expect(sole.length / cycle).toBeGreaterThan(0.4);
    expect(span / stride).toBeGreaterThan(0.8);
    expect(stray / span).toBeLessThan(0.02);
    expect(Math.abs(slope)).toBeLessThan(0.01);

    // And the contact is one unbroken run rather than the foot bobbing on and
    // off the ground: crossing into and out of the band happens exactly twice
    // over a closed cycle.
    const inBand = foot.map((p) => p.y <= Math.min(...ys) + 0.05 * lift);
    const crossings = inBand.filter((now, t) => now !== inBand[(t + 1) % cycle]).length;
    expect(crossings).toBe(2);
  });

  it('lifts the foot back over a shorter, higher return', () => {
    // Split the cycle at the two poses where the foot is furthest left and
    // furthest right. That needs no band and no threshold: it is where the foot
    // reverses, so one arc is the ground stroke and the other is the recovery,
    // and which is which is decided by measuring them rather than by assuming.
    const iMin = xs.indexOf(Math.min(...xs));
    const iMax = xs.indexOf(Math.max(...xs));
    const arc = (from: number, to: number) => {
      const out = [];
      for (let t = from; ; t = (t + 1) % cycle) {
        out.push(foot[t]);
        if (t === to) break;
      }
      return out;
    };
    const forward = arc(iMin, iMax);
    const back = arc(iMax, iMin);
    const meanY = (pts: { y: number }[]) => pts.reduce((t, p) => t + p.y, 0) / pts.length;
    const [stance, recovery] = meanY(forward) < meanY(back) ? [forward, back] : [back, forward];

    // Measured: the stance is 221 of the 360 frames and the recovery 141, so the
    // leg spends three fifths of every turn pushing and two fifths swinging. A
    // walking gait is exactly this asymmetry -- a foot that spent equal time on
    // each would be a foot that traces a circle.
    expect(stance.length / cycle).toBeGreaterThan(0.55);
    expect(recovery.length / cycle).toBeLessThan(0.45);

    // The recovery is higher: its mean sits 9.9 units above the stance's, 44% of
    // the whole path height, which is the ground clearance the leg walks with.
    expect(meanY(recovery) - meanY(stance)).toBeGreaterThan(0.3 * lift);

    // And it is the arched half. The stance's vertical range is 3.64 units
    // against the recovery's 19.35 -- a factor of 5.3 -- so the two halves are
    // not merely at different heights, they are different shapes.
    const range = (pts: { y: number }[]) =>
      Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
    expect(range(recovery) / range(stance)).toBeGreaterThan(4);
  });

  // Everything above reads positions, which is how the leg walked correctly for
  // months while its Analyze tab drew nothing. The velocity solver has its own
  // failure: it sizes its matrix by unknowns and indexes its rows by loop, so a
  // loop too many throws — and the panel reported that as "Please select at
  // least one data series", above no checkboxes to select.

  /** Rates at every timestep, from whichever set of loops is handed in. */
  const solveWith = (loops: Loop[]) => {
    KinematicsSolver.resetVariables();
    KinematicsSolver.requiredLoops = loops;
    const vel: Record<string, [number, number]>[] = [];
    const acc: Record<string, [number, number]>[] = [];
    for (let t = 0; t < frames; t++) {
      KinematicsSolver.determineKinematics(
        mechanism.joints[t],
        mechanism.links[t],
        mechanism.inputAngularVelocities[t]
      );
      vel.push(Object.fromEntries(KinematicsSolver.jointVelMap));
      acc.push(Object.fromEntries(KinematicsSolver.jointAccMap));
    }
    return { vel, acc };
  };

  it('keeps three independent loops out of the four walks it can find', () => {
    // Eight bodies and ten pins leave 10 - 8 + 1 = 3 independent closures, but
    // the two three-body pins let the walk reach ground four different ways.
    // O-A-D-E-C-G is the sum of the three below and states nothing they do not.
    expect(mechanism.requiredLoops.map((loop) => loop.id)).toEqual([
      'O-A-B-G',
      'O-A-B-C-E-D-G',
      'O-A-D-G',
    ]);
  });

  it('moves the foot at a rate that matches the path it draws', () => {
    const { vel, acc } = solveWith(mechanism.requiredLoops);
    const dt = mechanism.timeNum[1] - mechanism.timeNum[0];

    for (const id of ['B', 'C', 'D', 'E', 'F']) {
      // Every moving joint has an answer, and it is a moving one. A solver that
      // throws leaves these maps empty, and one that gives up quietly fills
      // them with zeros; both used to reach the graphs as a blank panel.
      for (let t = 1; t < frames - 1; t++) {
        const [vx, vy] = vel[t][id];
        const [ax, ay] = acc[t][id];
        expect(Number.isFinite(vx) && Number.isFinite(vy), `${id} velocity at ${t}`).toBe(true);
        expect(Number.isFinite(ax) && Number.isFinite(ay), `${id} acceleration at ${t}`).toBe(true);
      }
      expect(Math.max(...vel.slice(1, -1).map((v) => Math.hypot(...v[id]))), id).toBeGreaterThan(1);
      expect(Math.max(...acc.slice(1, -1).map((a) => Math.hypot(...a[id]))), id).toBeGreaterThan(1);

      // And it is the right answer, not merely a number: differentiating the
      // positions the position solver drew has to reproduce it. Errors are
      // measured against each joint's own peak rather than against the
      // instantaneous one, because a joint passing through a standstill divides
      // a truncation error by nothing and reports a percentage about the
      // denominator. Worst over all five joints and all 359 interior frames:
      // 0.16% of peak speed and 3.6% of peak acceleration, which is the central
      // difference's own truncation over a 1/360-turn step.
      let worstVel = 0;
      let worstAcc = 0;
      let peakVel = 0;
      let peakAcc = 0;
      for (let t = 1; t < frames - 1; t++) {
        const [before, here, after] = [at(t - 1, id), at(t, id), at(t + 1, id)];
        const fdVel = [(after.x - before.x) / (2 * dt), (after.y - before.y) / (2 * dt)];
        const fdAcc = [
          (after.x - 2 * here.x + before.x) / (dt * dt),
          (after.y - 2 * here.y + before.y) / (dt * dt),
        ];
        worstVel = Math.max(
          worstVel,
          Math.hypot(fdVel[0] - vel[t][id][0], fdVel[1] - vel[t][id][1])
        );
        worstAcc = Math.max(
          worstAcc,
          Math.hypot(fdAcc[0] - acc[t][id][0], fdAcc[1] - acc[t][id][1])
        );
        peakVel = Math.max(peakVel, Math.hypot(fdVel[0], fdVel[1]));
        peakAcc = Math.max(peakAcc, Math.hypot(fdAcc[0], fdAcc[1]));
      }
      expect(worstVel / peakVel, `${id} velocity`).toBeLessThan(0.005);
      expect(worstAcc / peakAcc, `${id} acceleration`).toBeLessThan(0.05);
    }
  });

  it('answers the same on the loops it dropped as on the ones it kept', () => {
    // The claim behind dropping a loop is that it carries no information. Test
    // it rather than assert it: swap the discarded walk back in for the one it
    // is the sum of, which is a different basis of the same cycle space, and
    // the rates have to come out identical rather than merely close.
    const dropped: Loop = {
      id: '',
      edges: [
        { kind: 'link', fromId: 'O', toId: 'A', linkId: 'OA' },
        { kind: 'link', fromId: 'A', toId: 'D', linkId: 'AD' },
        { kind: 'link', fromId: 'D', toId: 'E', linkId: 'DEF' },
        { kind: 'link', fromId: 'E', toId: 'C', linkId: 'CE' },
        { kind: 'link', fromId: 'C', toId: 'G', linkId: 'GBC' },
      ],
    };
    dropped.id = loopId(dropped.edges);
    expect(dropped.id).toBe('O-A-D-E-C-G');
    expect(mechanism.requiredLoops.map((loop) => loop.id)).not.toContain(dropped.id);

    const kept = solveWith(mechanism.requiredLoops);
    const swapped = solveWith([dropped, ...mechanism.requiredLoops.slice(1)]);

    for (let t = 1; t < frames - 1; t++) {
      for (const id of ['B', 'C', 'D', 'E', 'F']) {
        const scale = Math.hypot(...kept.vel[t][id]);
        expect(
          Math.hypot(
            kept.vel[t][id][0] - swapped.vel[t][id][0],
            kept.vel[t][id][1] - swapped.vel[t][id][1]
          ),
          `${id} velocity at ${t}`
        ).toBeLessThan(1e-9 * scale);
        expect(
          Math.hypot(
            kept.acc[t][id][0] - swapped.acc[t][id][0],
            kept.acc[t][id][1] - swapped.acc[t][id][1]
          ),
          `${id} acceleration at ${t}`
        ).toBeLessThan(1e-9 * Math.hypot(...kept.acc[t][id]));
      }
    }
  });
});
