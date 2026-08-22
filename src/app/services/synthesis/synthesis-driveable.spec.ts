import { Coord } from '../../model/coord';
import { MODEL_SCALE } from '../../model/render-scale';
import {
  BINDING_ANGLE,
  POSE_TOLERANCE,
  PosePoint,
  enumerateCandidates,
  solveFourBar,
} from './synthesis-candidates';

/**
 * The promise a solution makes, kept the way a machine would keep it.
 *
 * "Reaches all 3 positions on one assembly" is not "the loop closes at three
 * crank angles". It is: start the linkage where it is drawn, turn the crank
 * without ever taking it apart, and pass through all three on the way. Asking
 * the first question and reporting the second is how a solution came to be
 * offered that stopped at the first position.
 *
 * Two things had come apart from each other, and both are checked here by
 * driving rather than asking:
 *
 *  - The loop can close at a crank angle the crank cannot turn to. The circles
 *    intersect again on a stretch of the curve reachable only by taking the
 *    linkage apart -- which is the very thing a branch defect is.
 *  - The loop can close at an angle the crank can reach and still stall there.
 *    At a dead point the transmission angle goes to zero, the coupler pin races
 *    hundreds of units per degree, and no force turns it. On paper it passes
 *    through the position; in metal it stops at it.
 *
 * The sweep at the end is deliberately random and deliberately large: both
 * faults were found by one, and neither showed up on a design anybody would
 * think to write by hand.
 */

const S = MODEL_SCALE;
const LENGTH = 5 * S;

function pose(x: number, y: number, degrees: number): PosePoint {
  const t = (degrees * Math.PI) / 180;
  return {
    back: new Coord(x * S, y * S),
    front: new Coord(x * S + LENGTH * Math.cos(t), y * S + LENGTH * Math.sin(t)),
  };
}

const distance = (a: Coord, b: Coord) => Math.hypot(b.x - a.x, b.y - a.y);

/** A deterministic source, so a failure names a design that can be rebuilt. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

type Candidate = ReturnType<typeof enumerateCandidates>['candidates'][number];

/**
 * Drive the linkage across its travel and report how near it came to each
 * position, and whether it came apart on the way.
 *
 * The closest sample is refined afterwards. A stiff linkage moves its coupler
 * pin hundreds of units per degree, so a fixed step straddles the position and
 * would report a miss where the linkage passes cleanly through it.
 */
function drive(cand: Candidate): { closest: number[]; brokeAt: number | null } {
  const STEP = 0.5;
  const closest = cand.ptsB.map(() => Infinity);
  const closestAt = cand.ptsB.map(() => cand.range.from);
  let brokeAt: number | null = null;

  for (let deg = cand.range.from; deg <= cand.range.to; deg += STEP) {
    const solved = solveFourBar(cand, deg, cand.sign);
    if (!solved) {
      brokeAt = deg;
      break;
    }
    cand.ptsB.forEach((target, i) => {
      const d = distance(solved.C, target);
      if (d < closest[i]) {
        closest[i] = d;
        closestAt[i] = deg;
      }
    });
  }

  cand.ptsB.forEach((target, i) => {
    let lo = closestAt[i] - STEP;
    let hi = closestAt[i] + STEP;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      const before = solveFourBar(cand, mid - 1e-3, cand.sign);
      const after = solveFourBar(cand, mid + 1e-3, cand.sign);
      if (!before || !after) break;
      const dBefore = distance(before.C, target);
      const dAfter = distance(after.C, target);
      closest[i] = Math.min(closest[i], dBefore, dAfter);
      if (dBefore < dAfter) hi = mid;
      else lo = mid;
    }
  });

  return { closest, brokeAt };
}

describe('every solution offered can be driven through what it claims', () => {
  const designs: { name: string; poses: PosePoint[] }[] = [
    { name: 'a gentle sweep', poses: [pose(0, 0, 0), pose(4, 2, 25), pose(7, 7, 50)] },
    { name: 'a tight turn', poses: [pose(0, 0, 0), pose(1, 3, 55), pose(-2, 5, 110)] },
    { name: 'a long reach', poses: [pose(-6, -2, -20), pose(2, 1, 15), pose(11, 6, 40)] },
    { name: 'doubling back', poses: [pose(0, 0, 10), pose(5, 4, -30), pose(1, 7, 60)] },
    { name: 'a small angle change', poses: [pose(0, 0, 0), pose(3, 1, 6), pose(6, 3, 13)] },
    { name: 'a near reversal', poses: [pose(0, 0, 0), pose(4, 5, 85), pose(-1, 6, 165)] },
  ];

  for (const design of designs) {
    it(`walks all three, for ${design.name}`, () => {
      const { candidates } = enumerateCandidates({
        poses: design.poses,
        length: LENGTH,
        endsOnly: false,
      });
      const offered = candidates.filter((c) => c.defectFree);
      walked.set(design.name, offered.length);
      offered.forEach((cand) => {
        const { closest, brokeAt } = drive(cand);
        expect(brokeAt).toBeNull();
        closest.forEach((d) => expect(d).toBeLessThan(POSE_TOLERANCE));
      });
    });
  }

  /**
   * What each named design actually offered, so that walking nothing cannot
   * read as walking everything.
   *
   * Three of the six offer nothing, and each for its own reason: a tight turn
   * reaches all three on twenty-eight candidates and every one of them binds,
   * a long reach admits no construction at all, and doubling back stays on one
   * assembly for none. Those are answers, not gaps -- but a test that walks an
   * empty list passes without doing anything, so the ones that do offer
   * something have to be seen to.
   */
  const walked = new Map<string, number>();

  it('and the named designs between them gave it something to walk', () => {
    expect(walked.size).toBe(designs.length);
    // Each of the three that has an answer, not just the total and not just
    // one of them: any of the others regressing to zero would turn its own
    // walk into a test of nothing while the total stayed comfortably positive.
    ['a gentle sweep', 'a small angle change', 'a near reversal'].forEach((name) =>
      expect(walked.get(name)).toBeGreaterThan(0)
    );
  });

  it('never claims a position the crank cannot turn to', () => {
    const { candidates } = enumerateCandidates({
      poses: designs[3].poses,
      length: LENGTH,
      endsOnly: false,
    });
    candidates.forEach((cand) => {
      cand.onBranch.forEach((claims, i) => {
        if (!claims) return;
        const { from, to, full } = cand.range;
        const inside =
          full ||
          [-2, -1, 0, 1, 2].some((turn) => {
            const at = cand.thetas[i] + turn * 360;
            return at >= from - 1e-6 && at <= to + 1e-6;
          });
        expect(inside).toBe(true);
      });
    });
  });

  /**
   * The transmission angle, worked out from the bar lengths alone.
   *
   * Deliberately not the code's own routine, and deliberately not by asking
   * the solver where the joints are: this measures the same physical quantity
   * by an independent route, so agreeing with it means something. The angle at
   * the coupler-rocker joint follows from the distance between the crank pin
   * and the far ground pin by the cosine rule.
   */
  function transmissionAt(cand: Candidate, deg: number): number | null {
    const t = (deg * Math.PI) / 180;
    const bx = cand.A.x + cand.r1 * Math.cos(t);
    const by = cand.A.y + cand.r1 * Math.sin(t);
    const span = Math.hypot(bx - cand.D.x, by - cand.D.y);
    if (span > cand.d + cand.r2 || span < Math.abs(cand.d - cand.r2)) return null;
    const cosine = (cand.d * cand.d + cand.r2 * cand.r2 - span * span) / (2 * cand.d * cand.r2);
    let mu = (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
    if (mu > 90) mu = 180 - mu;
    return mu;
  }

  /**
   * The worst it gets over the stroke, swept densely rather than claimed.
   *
   * The stroke is the code's, because which span to measure is a definition
   * rather than a measurement -- but the number is arrived at independently,
   * from the bar lengths by the cosine rule, without asking the solver where
   * any joint is. Stepped so that both ends are always sampled: the angle
   * collapses at a travel limit, so an endpoint missed by a rounding error is
   * exactly the sample that matters.
   */
  function measuredWorst(cand: Candidate): number {
    const { from, to } = cand.stroke;
    const steps = Math.max(1, Math.ceil((to - from) / 0.02));
    let worst = 90;
    for (let k = 0; k <= steps; k++) {
      const mu = transmissionAt(cand, from + ((to - from) * k) / steps);
      if (mu !== null) worst = Math.min(worst, mu);
    }
    return worst;
  }

  /**
   * The shortest arc containing three directions, worked out independently.
   *
   * Sorted, then the widest gap between neighbours removed: what is left is the
   * arc, and it is not in general the span between the smallest and the largest.
   */
  function shortestArc(anglesDeg: number[]): { from: number; to: number } {
    const sorted = anglesDeg.map((a) => ((a % 360) + 360) % 360).sort((a, b) => a - b);
    let widest = -1;
    let after = 0;
    sorted.forEach((angle, i) => {
      const next = sorted[(i + 1) % sorted.length];
      const gap = (((next - angle) % 360) + 360) % 360;
      if (gap > widest) {
        widest = gap;
        after = (i + 1) % sorted.length;
      }
    });
    return { from: sorted[after], to: sorted[after] + (360 - widest) };
  }

  it('measures over the shortest travel between the positions, not the long way round', () => {
    const next = rng(20260821);
    const wrong: string[] = [];
    for (let n = 0; n < 300; n++) {
      const poses = [0, 1, 2].map(() =>
        pose(next() * 24 - 12, next() * 24 - 12, next() * 360 - 180)
      );
      const { candidates } = enumerateCandidates({
        poses,
        length: LENGTH,
        endsOnly: next() < 0.5,
      });
      candidates
        .filter((c) => c.range.full)
        .forEach((c) => {
          // On a crank that turns fully the arc wraps, so the smallest and
          // largest of the three angles can name the long way round -- which is
          // travel the linkage never makes between the positions, and judging
          // it there rejects good candidates and accepts binding ones.
          const arc = shortestArc(c.thetas);
          const span = c.stroke.to - c.stroke.from;
          const expected = arc.to - arc.from + 10;
          if (Math.abs(span - expected) > 0.5) {
            wrong.push(
              `design ${n} ${c.key}: measured over ${span.toFixed(1)}°, shortest is ${expected.toFixed(1)}°`
            );
          }
        });
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it('reports a transmission angle that a dense independent measure agrees with', () => {
    const next = rng(20260821);
    const disagreements: string[] = [];
    for (let n = 0; n < 300; n++) {
      const poses = [0, 1, 2].map(() =>
        pose(next() * 24 - 12, next() * 24 - 12, next() * 360 - 180)
      );
      const { candidates } = enumerateCandidates({
        poses,
        length: LENGTH,
        endsOnly: next() < 0.5,
      });
      candidates.forEach((cand) => {
        const measured = measuredWorst(cand);
        // Half a degree of slack for the dense sweep's own step.
        if (Math.abs(measured - cand.minTransmission) > 1.5) {
          disagreements.push(
            `design ${n} ${cand.key}: reported ${cand.minTransmission}°, measured ${measured.toFixed(2)}°`
          );
        }
      });
    }
    expect(disagreements.slice(0, 5)).toEqual([]);
  });

  it('never offers one that a dense measure says stalls', () => {
    const next = rng(20260821);
    const stalling: string[] = [];
    for (let n = 0; n < 300; n++) {
      const poses = [0, 1, 2].map(() =>
        pose(next() * 24 - 12, next() * 24 - 12, next() * 360 - 180)
      );
      const { candidates } = enumerateCandidates({
        poses,
        length: LENGTH,
        endsOnly: next() < 0.5,
      });
      candidates
        .filter((c) => c.defectFree)
        // Measured independently, so this is not the code agreeing with itself.
        // The previous version of this test asked whether any defect-free
        // candidate had `minTransmission < BINDING_ANGLE`, which `defectFree`
        // is defined to make impossible: it could not have failed.
        .filter((c) => measuredWorst(c) < BINDING_ANGLE - 0.5)
        .forEach((c) => stalling.push(`design ${n} ${c.key} at ${measuredWorst(c).toFixed(2)}°`));
    }
    expect(stalling.slice(0, 5)).toEqual([]);
  });

  it('over four hundred designs, every claim survives being driven', () => {
    const next = rng(20260821);
    const broken: string[] = [];
    let claims = 0;
    for (let n = 0; n < 400; n++) {
      const poses = [0, 1, 2].map(() =>
        pose(next() * 24 - 12, next() * 24 - 12, next() * 360 - 180)
      );
      const { candidates } = enumerateCandidates({
        poses,
        length: LENGTH,
        endsOnly: next() < 0.5,
      });
      candidates
        .filter((c) => c.defectFree)
        .forEach((cand) => {
          claims++;
          const { closest, brokeAt } = drive(cand);
          if (brokeAt !== null || closest.some((d) => d >= POSE_TOLERANCE)) {
            broken.push(
              `design ${n} ${cand.key}: closest ${closest.map((d) => d.toFixed(1)).join(', ')}` +
                (brokeAt === null ? '' : ` and came apart at ${brokeAt.toFixed(1)}°`)
            );
          }
        });
    }
    expect(claims).toBeGreaterThan(100);
    expect(broken.slice(0, 5)).toEqual([]);
  });
});
