import { Coord } from '../../model/coord';
import { MODEL_SCALE } from '../../model/render-scale';
import {
  POSE_TOLERANCE,
  PosePoint,
  circumcenter,
  drivenFromFarPin,
  enumerateCandidates,
  rankCandidates,
  solveFourBar,
} from './synthesis-candidates';

/**
 * Three positions of a rigid body fix three positions of every point on it,
 * and three points determine a circle -- so every pair of points on the
 * end-effector link names a four-bar that closes exactly at all three. These
 * check that the enumeration finds those, tells the ones that are the same
 * machine apart from the ones that are not, and is honest about the one thing
 * the construction cannot promise: that all three can be reached without
 * taking the linkage apart.
 */

const S = MODEL_SCALE;
const LENGTH = 5 * S;

/** A position of the link: a back end, and a front end LENGTH away at theta. */
function pose(x: number, y: number, degrees: number): PosePoint {
  const t = (degrees * Math.PI) / 180;
  return {
    back: new Coord(x * S, y * S),
    front: new Coord(x * S + LENGTH * Math.cos(t), y * S + LENGTH * Math.sin(t)),
  };
}

/**
 * Three positions that are genuinely a motion.
 *
 * The back ends must not be collinear and neither must the fronts: three
 * points on a line have no circle through them, which is the one case the
 * construction has no answer for -- and it is easy to write by accident, which
 * is what the straight-line case below checks deliberately.
 */
const MOTION: PosePoint[] = [pose(0, 0, 0), pose(4, 2, 25), pose(7, 7, 50)];

/**
 * A motion whose four-bars close at all three positions and seize doing it.
 *
 * Every candidate this produces reaches all three, and every one of them binds
 * -- which makes it the corpus for the half of `defectFree` that MOTION cannot
 * exercise, because nothing in MOTION binds at all.
 */
const BINDING_MOTION: PosePoint[] = [pose(0, 0, 0), pose(1, 3, 55), pose(-2, 5, 110)];

function distance(a: Coord, b: Coord): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

describe('circumcenter', () => {
  it('is the same distance from all three points', () => {
    const p1 = new Coord(0, 0);
    const p2 = new Coord(4 * S, 1 * S);
    const p3 = new Coord(1 * S, 5 * S);
    const centre = circumcenter(p1, p2, p3)!;
    expect(centre).not.toBeNull();
    expect(distance(centre, p2)).toBeCloseTo(distance(centre, p1), 3);
    expect(distance(centre, p3)).toBeCloseTo(distance(centre, p1), 3);
  });

  it('has no answer for three points on one line', () => {
    expect(
      circumcenter(new Coord(0, 0), new Coord(1 * S, 1 * S), new Coord(2 * S, 2 * S))
    ).toBeNull();
  });
});

describe('enumerateCandidates', () => {
  it('pinned to the link ends, finds the two assemblies of one construction', () => {
    const { candidates } = enumerateCandidates({
      poses: MOTION,
      length: LENGTH,
      endsOnly: true,
    });
    expect(candidates.length).toBe(2);
    expect(candidates[0].pair).toBe(candidates[1].pair);
    expect([candidates[0].branch, candidates[1].branch].sort()).toEqual(['Crossed', 'Open']);
  });

  it('pinned to the link ends, the coupler is the length that was typed', () => {
    const { candidates } = enumerateCandidates({
      poses: MOTION,
      length: LENGTH,
      endsOnly: true,
    });
    candidates.forEach((c) => expect(c.d).toBeCloseTo(LENGTH, 3));
  });

  it('closes exactly at every position it says it reaches', () => {
    const { candidates } = enumerateCandidates({
      poses: MOTION,
      length: LENGTH,
      endsOnly: true,
    });
    candidates.forEach((cand) => {
      cand.onBranch.forEach((reached, i) => {
        if (!reached) return;
        const solved = solveFourBar(cand, cand.thetas[i], cand.sign)!;
        expect(solved).not.toBeNull();
        expect(distance(solved.B, cand.ptsA[i])).toBeLessThan(POSE_TOLERANCE);
        expect(distance(solved.C, cand.ptsB[i])).toBeLessThan(POSE_TOLERANCE);
      });
    });
  });

  it('calls a candidate defect-free when all three are on one assembly and it does not bind', () => {
    const { candidates } = enumerateCandidates({
      poses: MOTION,
      length: LENGTH,
      endsOnly: false,
    });
    candidates.forEach((c) => {
      // Both halves of the rule. Stating it as `onBranchCount === 3` alone was
      // true of this corpus only because nothing in it bound, so the half that
      // rejects a linkage for seizing up was never being checked.
      expect(c.defectFree).toBe(c.onBranchCount === 3 && !c.binds);
      expect(c.onBranchCount).toBe(c.onBranch.filter(Boolean).length);
    });
  });

  it('and turns down one that reaches all three but seizes on the way', () => {
    const { candidates } = enumerateCandidates({
      poses: BINDING_MOTION,
      length: LENGTH,
      endsOnly: false,
    });
    // Stating the rule against MOTION alone left half of it untested: nothing
    // there binds, so `onBranchCount === 3` and the real rule agreed on every
    // candidate and the `!binds` term could have been deleted without a test
    // noticing. Here all three are reached and every one of them binds.
    const reachesAll = candidates.filter((c) => c.onBranchCount === 3);
    expect(reachesAll.length).toBeGreaterThan(0);
    expect(reachesAll.every((c) => c.binds)).toBe(true);
    expect(reachesAll.some((c) => c.defectFree)).toBe(false);
  });

  it('the crank and rocker are the radii the construction solved for', () => {
    const { candidates } = enumerateCandidates({
      poses: MOTION,
      length: LENGTH,
      endsOnly: true,
    });
    candidates.forEach((c) => {
      expect(distance(c.A, c.ptsA[0])).toBeCloseTo(c.r1, 3);
      expect(distance(c.A, c.ptsA[2])).toBeCloseTo(c.r1, 3);
      expect(distance(c.D, c.ptsB[0])).toBeCloseTo(c.r2, 3);
      expect(distance(c.D, c.ptsB[2])).toBeCloseTo(c.r2, 3);
    });
  });

  it('letting the pins slide finds machines the ends alone cannot', () => {
    const ends = enumerateCandidates({ poses: MOTION, length: LENGTH, endsOnly: true });
    const slid = enumerateCandidates({ poses: MOTION, length: LENGTH, endsOnly: false });
    expect(slid.candidates.length).toBeGreaterThan(ends.candidates.length);
    // And they are different machines, not the same one listed again.
    const couplers = new Set(slid.candidates.map((c) => Math.round(c.d)));
    expect(couplers.size).toBeGreaterThan(1);
  });

  it('finds nothing when the three positions lie on one line', () => {
    const straight = [pose(0, 0, 0), pose(3, 3, 0), pose(6, 6, 0)];
    const { candidates, rejections } = enumerateCandidates({
      poses: straight,
      length: LENGTH,
      endsOnly: true,
    });
    expect(candidates.length).toBe(0);
    expect(rejections.degenerate).toBeGreaterThan(0);
  });

  it('keeps only the linkages whose ground pivots fall inside the region', () => {
    const all = enumerateCandidates({ poses: MOTION, length: LENGTH, endsOnly: false });
    expect(all.candidates.length).toBeGreaterThan(0);
    const region = { x: -100 * S, y: -100 * S, w: 1 * S, h: 1 * S };
    const boxed = enumerateCandidates({
      poses: MOTION,
      length: LENGTH,
      endsOnly: false,
      region,
    });
    expect(boxed.candidates.length).toBe(0);
    expect(boxed.rejections.outsideRegion).toBeGreaterThan(0);
  });

  it('never offers a construction that cannot be closed at position 1', () => {
    const { candidates } = enumerateCandidates({
      poses: MOTION,
      length: LENGTH,
      endsOnly: false,
    });
    candidates.forEach((c) => {
      expect(isFinite(c.errors[0]) || c.onBranchCount > 0).toBe(true);
    });
  });
});

describe('rankCandidates', () => {
  it('puts the defect-free ones first and names them in order', () => {
    const { candidates } = enumerateCandidates({
      poses: MOTION,
      length: LENGTH,
      endsOnly: false,
    });
    const ranked = rankCandidates(candidates);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.length).toBeLessThanOrEqual(8);
    // The whole sequence. Asking only whether the first is A is satisfied by
    // every one of them being A, which is not an order.
    expect(ranked.map((c) => c.name).join('')).toBe('ABCDEFGH'.slice(0, ranked.length));
    ranked.forEach((c, i) => {
      if (i === 0) return;
      const before = ranked[i - 1];
      expect(Number(before.defectFree)).toBeGreaterThanOrEqual(Number(c.defectFree));
    });
  });
});

describe('drivenFromFarPin', () => {
  it('reads the same four bars from the other end', () => {
    const { candidates } = enumerateCandidates({
      poses: MOTION,
      length: LENGTH,
      endsOnly: true,
    });
    const original = candidates[0];
    const swapped = drivenFromFarPin(original);
    expect(swapped.A).toEqual(original.D);
    expect(swapped.D).toEqual(original.A);
    expect(swapped.r1).toBeCloseTo(original.r2, 6);
    expect(swapped.r2).toBeCloseTo(original.r1, 6);
    // Same machine, so the same four lengths -- only the input has moved.
    expect(swapped.d).toBeCloseTo(original.d, 6);
    expect(swapped.g).toBeCloseTo(original.g, 6);
  });

  it('leaves the original untouched', () => {
    const { candidates } = enumerateCandidates({
      poses: MOTION,
      length: LENGTH,
      endsOnly: true,
    });
    const original = candidates[0];
    const before = { r1: original.r1, r2: original.r2, sign: original.sign };
    drivenFromFarPin(original);
    expect(original.r1).toBe(before.r1);
    expect(original.r2).toBe(before.r2);
    expect(original.sign).toBe(before.sign);
  });
});
