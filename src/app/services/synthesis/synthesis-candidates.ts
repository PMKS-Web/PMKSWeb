import { Coord } from 'src/app/model/coord';
import { MODEL_SCALE } from 'src/app/model/render-scale';
import { smallestArcContaining } from './driver-dyad';

/**
 * Every four-bar that carries a coupler through three given positions.
 *
 * Three positions of a rigid body fix, for any point on that body, three
 * positions of that point -- and three points determine a circle. So the
 * centre of that circle is a ground pivot the point can be pinned to, and the
 * radius is the link that holds it. Do that for two points on the body and the
 * result is a four-bar that closes exactly at all three positions.
 *
 * That construction has exactly one answer per pair of points, which is why
 * synthesis used to produce exactly one linkage: the two points it used were
 * the ends of the end-effector link. But the coupler does not have to be
 * pinned at the ends. Sliding the two pins along the link -- or past it --
 * moves both circle centres and gives a genuinely different machine through
 * the same three positions. Enumerating those is what turns synthesis from
 * "here is the answer" into "here are the answers, compare them".
 *
 * Everything in this file is in model units (render-scale.ts), like the rest
 * of the geometry the app computes with, and knows nothing about how it is
 * drawn.
 */

/** How near a solved coupler pin has to land to count as the same point. */
export const POSE_TOLERANCE = 0.18 * MODEL_SCALE;

/**
 * The worst transmission angle a solution may have and still be offered.
 *
 * The transmission angle is how squarely the coupler pushes the rocker. As it
 * goes to zero the linkage approaches a dead point: the force needed to keep
 * it moving goes to infinity, and the pin it drives races across the drawing
 * for a fraction of a degree of crank. Such a four-bar passes through its
 * positions on paper and stalls at them in metal -- which is exactly what
 * "it claims all three and only gets to the first" looks like.
 *
 * Fifteen degrees is deliberately permissive. Machine design usually wants
 * forty-five and treats thirty as the floor for a working linkage; this only
 * rules out the ones that are stuck.
 */
export const BINDING_ANGLE = 15;

/**
 * Where the two coupler pins may sit on the end-effector link, as fractions of
 * its length from the back end. 0 and 1 are its ends; outside that range the
 * pin is on an extension of the link, which is a real and often better
 * machine.
 */
const PIN_OFFSETS = [-0.6, -0.3, 0, 0.2, 0.5, 0.8, 1, 1.3, 1.6];

/** The least a pair of pins may be apart, as a fraction of the link. */
const MIN_PIN_SPAN = 0.5;

export interface PosePoint {
  /** The back end of the end-effector link in this position. */
  back: Coord;
  /** Its front end. */
  front: Coord;
}

export interface FourBarCandidate {
  /** Identifies this candidate across a rebuild: pin offsets and branch. */
  key: string;
  /** A letter, assigned by rank when the list is handed to the panel. */
  name: string;
  /** Ground pivot of the input crank, and of the output rocker. */
  A: Coord;
  D: Coord;
  /** The two coupler pins in position 1. */
  B: Coord;
  C: Coord;
  /** Crank, rocker, coupler and ground lengths. */
  r1: number;
  r2: number;
  d: number;
  g: number;
  /** Where the pins sit on the end-effector link. */
  uA: number;
  uB: number;
  /** The pins' three positions, in order. */
  ptsA: Coord[];
  ptsB: Coord[];
  /** Which of the two circle intersections this assembly uses. */
  sign: number;
  branch: 'Open' | 'Crossed';
  /** The two branches of one pin pair share this, so they can be swapped. */
  pair: string;
  /**
   * Whether this is the far-pin reading, in which the fields hold the opposite
   * physical pins. The letters drawn on the grid follow the pins, not the
   * fields, so anything that labels a pin must ask `endLetters`.
   */
  swappedEnds?: boolean;
  /** The crank angle, in degrees, at each of the three positions. */
  thetas: number[];
  /** How far the solved coupler pin misses each position by, on this branch. */
  errors: number[];
  onBranch: boolean[];
  onBranchCount: number;
  defectFree: boolean;
  /** How far the crank can turn from position 1 without the loop opening. */
  range: { from: number; to: number; full: boolean };
  /** The worst transmission angle over the working stroke, in degrees. */
  minTransmission: number;
  /** Whether that angle is so tight the linkage stalls rather than turns. */
  binds: boolean;
  /** The span of crank travel the angle above was measured over. */
  stroke: { from: number; to: number };
  kind: string;
  size: number;
}

export interface CandidateSearch {
  poses: PosePoint[];
  /** Length of the end-effector link, in model units. */
  length: number;
  /** Whether the coupler must be pinned to the link's own two ends. */
  endsOnly: boolean;
  /** When set, both ground pivots must fall inside this box. */
  region?: { x: number; y: number; w: number; h: number };
}

/** Why nothing was found, for a panel that has to explain an empty list. */
export interface CandidateRejections {
  tried: number;
  degenerate: number;
  tooBig: number;
  alike: number;
  outsideRegion: number;
}

export interface CandidateResult {
  candidates: FourBarCandidate[];
  rejections: CandidateRejections;
}

function distance(a: Coord, b: Coord): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** The centre of the circle through three points, or nothing if they line up. */
export function circumcenter(p1: Coord, p2: Coord, p3: Coord): Coord | null {
  const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
  if (Math.abs(d) < 1e-9) return null;
  const s1 = p1.x * p1.x + p1.y * p1.y;
  const s2 = p2.x * p2.x + p2.y * p2.y;
  const s3 = p3.x * p3.x + p3.y * p3.y;
  return new Coord(
    (s1 * (p2.y - p3.y) + s2 * (p3.y - p1.y) + s3 * (p1.y - p2.y)) / d,
    (s1 * (p3.x - p2.x) + s2 * (p1.x - p3.x) + s3 * (p2.x - p1.x)) / d
  );
}

/** Where two circles cross, or nothing if they do not reach each other. */
export function meet(c1: Coord, r1: number, c2: Coord, r2: number): [Coord, Coord] | null {
  const span = distance(c1, c2);
  if (span === 0 || span > r1 + r2 || span < Math.abs(r1 - r2)) return null;
  const a = (span * span + r1 * r1 - r2 * r2) / (2 * span);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const ux = (c2.x - c1.x) / span;
  const uy = (c2.y - c1.y) / span;
  const mx = c1.x + a * ux;
  const my = c1.y + a * uy;
  return [new Coord(mx - h * uy, my + h * ux), new Coord(mx + h * uy, my - h * ux)];
}

function cross(o: Coord, a: Coord, b: Coord): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function pointOn(centre: Coord, radius: number, angleRad: number): Coord {
  return new Coord(centre.x + radius * Math.cos(angleRad), centre.y + radius * Math.sin(angleRad));
}

/**
 * Close the loop with the crank at a given angle.
 *
 * `sign` is the assembly: the two circle intersections are the two ways the
 * same four bars can be pinned together, and a linkage cannot cross from one
 * to the other without being taken apart.
 */
export function solveFourBar(
  cand: Pick<FourBarCandidate, 'A' | 'D' | 'r1' | 'r2' | 'd' | 'sign'>,
  thetaDeg: number,
  sign?: number
): { A: Coord; B: Coord; C: Coord; D: Coord } | null {
  const B = pointOn(cand.A, cand.r1, (thetaDeg * Math.PI) / 180);
  const pair = meet(B, cand.d, cand.D, cand.r2);
  // The one honest failure: the coupler and the rocker cannot reach each other,
  // so the loop does not close at all. That is where travel ends.
  if (!pair) return null;
  const want = sign === undefined ? cand.sign : sign;
  /*
    Choose between the two intersections, always.

    This used to look for the one on the wanted side and give up if it found
    neither -- which sounds equivalent and is not. Near a dead point the two
    intersections converge, `cross` goes to zero, and its sign is whatever the
    rounding says; both can come back on the same side, and the search then
    reported the loop as unclosable at an angle it closes at perfectly well.
    Downstream that read as travel ending early, or as the linkage jumping to
    its other assembly for a frame -- a solution that promised three positions
    and stopped at the first.

    Picking by which side the first intersection is on always yields one of the
    two, and yields the same one the sign test did wherever the sign test meant
    anything. Where it did not -- the two points within rounding of each other
    -- either is right.
  */
  const C = Math.sign(cross(B, cand.D, pair[0])) === want ? pair[0] : pair[1];
  return { A: cand.A, B, C, D: cand.D };
}

/** A point a fraction `u` along the end-effector link, from its back end. */
function attach(pose: PosePoint, u: number): Coord {
  return new Coord(
    pose.back.x + u * (pose.front.x - pose.back.x),
    pose.back.y + u * (pose.front.y - pose.back.y)
  );
}

/**
 * What this candidate can actually do with the three positions.
 *
 * The circumcentre construction makes the loop close exactly at all three --
 * that is what it is for -- so the question is never whether a position is
 * reached. It is whether all three are reached on ONE assembly. A position
 * that only closes on the other intersection can be got to only by taking the
 * linkage apart and putting it back together, and that is what makes an
 * otherwise perfect construction useless as a machine. It is called a branch
 * defect, and it is the single most important thing to tell a reader
 * comparing candidates.
 */
/**
 * The stretch of crank travel the three positions occupy, with a little margin.
 *
 * Which stretch this is decides everything the transmission angle then says,
 * and it is not simply the smallest and largest of the three angles.
 *
 * On a crank that turns fully the angles live on a circle, so the arc holding
 * them wraps: taking their smallest and largest can name the long way round.
 * Three positions clustered near the top of the circle came out as a stroke of
 * three hundred and thirty degrees rather than eighty, and the linkage was then
 * judged on travel it never makes between them -- which rejected candidates
 * that are perfectly good, and the other way about accepted ones that bind
 * where they actually work. So the arc is the shortest one containing all
 * three, found by looking for the widest gap between them and taking the rest.
 *
 * On a crank that only rocks there is no wrap to worry about: the travel has
 * ends, and the positions lie between them.
 */
function poseStroke(cand: FourBarCandidate): [number, number] {
  const MARGIN = 5;
  if (cand.range.full) {
    const arc = smallestArcContaining(cand.thetas.map((theta) => (theta * Math.PI) / 180));
    const start = (arc.start * 180) / Math.PI;
    const span = (arc.span * 180) / Math.PI;
    return [start - MARGIN, start + span + MARGIN];
  }
  const placed = cand.thetas
    .map((theta) => intoTravel(theta, cand.range))
    .filter((theta): theta is number => theta !== null);
  if (!placed.length) return [cand.range.from, cand.range.to];
  return [
    Math.max(cand.range.from, Math.min(...placed) - MARGIN),
    Math.min(cand.range.to, Math.max(...placed) + MARGIN),
  ];
}

/**
 * The worst transmission angle over a stretch of crank travel, exactly.
 *
 * This was sampled every two degrees, and the answer rounded, which is not
 * good enough for the one number that decides whether a linkage is a machine
 * or an ornament: near a travel limit the angle falls away steeply, and a
 * candidate reported at sixteen degrees was measured independently at four and
 * a half between two of the samples.
 *
 * It does not need sampling. With the ground link fixed, the distance between
 * the crank pin and the far ground pin is
 *
 *     s(theta)^2 = g^2 + r1^2 - 2*g*r1*cos(theta - theta_AD)
 *
 * and the angle at the coupler-rocker joint follows from that distance alone
 * by the cosine rule. Folded into the first quadrant, the angle is worst where
 * |cos| is largest, which is where s is at an extreme -- and s is extreme only
 * at the ends of the interval or where the crank points directly at, or
 * directly away from, the far ground pin. Four angles to check, not a hundred.
 */
export function worstTransmission(cand: FourBarCandidate, from: number, to: number): number {
  const towardsD = (Math.atan2(cand.D.y - cand.A.y, cand.D.x - cand.A.x) * 180) / Math.PI;
  const candidates = [from, to];
  // The two interior extremes, brought into the interval a turn at a time.
  [towardsD, towardsD + 180].forEach((critical) => {
    for (let turn = -2; turn <= 2; turn++) {
      const at = critical + turn * 360;
      if (at > from && at < to) candidates.push(at);
    }
  });

  let worst = 90;
  candidates.forEach((deg) => {
    const t = (deg * Math.PI) / 180;
    const bx = cand.A.x + cand.r1 * Math.cos(t);
    const by = cand.A.y + cand.r1 * Math.sin(t);
    const span = Math.hypot(bx - cand.D.x, by - cand.D.y);
    const cosine = (cand.d * cand.d + cand.r2 * cand.r2 - span * span) / (2 * cand.d * cand.r2);
    let mu = (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
    if (mu > 90) mu = 180 - mu;
    worst = Math.min(worst, mu);
  });
  return worst;
}

/**
 * Whether a crank angle lies inside a stretch of continuous travel.
 *
 * Angles come out of `atan2` in (-180, 180] while a walked range can run
 * anywhere, so the same direction has to be tried a turn either way before it
 * can be called out of reach.
 */
function withinTravel(theta: number, range: { from: number; to: number; full: boolean }): boolean {
  return intoTravel(theta, range) !== null;
}

/**
 * The same crank direction, expressed inside a stretch of travel.
 *
 * Angles come out of `atan2` in (-180, 180] while a walked range runs wherever
 * the walk took it, so the same direction has to be tried a turn either way
 * before it can be placed -- or called out of reach. Returns null when it is
 * genuinely outside.
 */
function intoTravel(
  theta: number,
  range: { from: number; to: number; full: boolean }
): number | null {
  const slack = 1e-6;
  for (let turn = -2; turn <= 2; turn++) {
    const at = theta + turn * 360;
    if (at >= range.from - slack && at <= range.to + slack) return at;
  }
  return range.full ? theta : null;
}

export function assess(cand: FourBarCandidate): void {
  const branch = cand.sign;
  cand.thetas = cand.ptsA.map((p) => (Math.atan2(p.y - cand.A.y, p.x - cand.A.x) * 180) / Math.PI);

  // How far the crank turns from position 1 before the loop can no longer be
  // closed. Walked rather than solved because the limit is where two circles
  // stop reaching, and walking outward from a position we know closes cannot
  // wander onto a disconnected stretch of the same curve.
  const start = cand.thetas[0];
  let from = start;
  let to = start;
  for (let k = 1; k <= 360; k++) {
    if (!solveFourBar(cand, start + k, branch)) break;
    to = start + k;
  }
  for (let k = 1; k <= 360; k++) {
    if (!solveFourBar(cand, start - k, branch)) break;
    from = start - k;
  }
  // A linkage that turns fully has no start of travel, so its track begins at
  // position 1 and runs one revolution forward. A rocking one does have ends,
  // and those are the ends that were walked.
  const full = to - from >= 359;
  cand.range = full ? { from: start, to: start + 360, full: true } : { from, to, full: false };

  /*
    Reached means driveable to, not merely solvable at.

    These two came apart badly. The loop can close at a crank angle the crank
    cannot actually turn to: the circles intersect again on a stretch of the
    curve the linkage can only get onto by being taken apart, which is the very
    thing a branch defect is. Asking only whether the loop closes therefore
    called such a candidate defect-free, and the reader got a linkage that
    promised three positions and stopped at the first.

    So a position counts when the loop closes there on this assembly AND its
    crank angle lies inside the travel walked above -- one continuous run,
    starting from the position the linkage is drawn in.
  */
  cand.errors = cand.ptsB.map((target, i) => {
    if (!withinTravel(cand.thetas[i], cand.range)) return Infinity;
    const sol = solveFourBar(cand, cand.thetas[i], branch);
    return sol ? distance(sol.C, target) : Infinity;
  });
  cand.onBranch = cand.errors.map((e) => e < POSE_TOLERANCE);
  cand.onBranchCount = cand.onBranch.filter(Boolean).length;

  // The transmission angle over the stroke that matters -- the span the three
  // positions actually occupy, not the whole range. It is how squarely the
  // coupler pushes the rocker, and a four-bar that passes through the positions
  // at five degrees will stall there in real life.
  const [strokeFrom, strokeTo] = poseStroke(cand);
  const worst = worstTransmission(cand, strokeFrom, strokeTo);
  cand.stroke = { from: strokeFrom, to: strokeTo };
  cand.minTransmission = Math.round(worst);
  // Against the exact figure, not the rounded one: a linkage that stalls at
  // 14.6 degrees is not saved by being displayed as 15.
  cand.binds = worst < BINDING_ANGLE;
  // Reaching all three is not enough on its own: a linkage that has to pass
  // through a dead point to get between them arrives at the first position and
  // stops there, which is not what "reaches all 3" promises anybody.
  cand.defectFree = cand.onBranchCount === 3 && !cand.binds;
  cand.kind = cand.range.full ? 'crank-rocker' : 'double-rocker';
  cand.size = Math.max(cand.r1, cand.r2, cand.g);
}

/**
 * Drive the linkage from its other ground pin.
 *
 * The same four bars, read from the far end: what was the rocker becomes the
 * crank. A four-bar that will not turn from one ground pin often turns freely
 * from the other, so this is a real second machine rather than a relabelling,
 * and it is re-assessed as one.
 */
export function drivenFromFarPin(cand: FourBarCandidate): FourBarCandidate {
  const swapped: FourBarCandidate = {
    ...cand,
    A: cand.D,
    D: cand.A,
    r1: cand.r2,
    r2: cand.r1,
    B: cand.C,
    C: cand.B,
    ptsA: cand.ptsB,
    ptsB: cand.ptsA,
    sign: Math.sign(cross(cand.ptsB[0], cand.A, cand.ptsA[0])) || 1,
    swappedEnds: !cand.swappedEnds,
  };
  assess(swapped);
  return swapped;
}

/**
 * Which letter belongs to each field of a candidate.
 *
 * A pin keeps its name when you change which end drives. Reading the linkage
 * from the far pin puts pin D in the field called `A`, and labelling by the
 * field meant choosing "Driven from Pin D" drew the motor beside a pin marked
 * A and renamed every bar in the dimensions list -- so the one control whose
 * whole job is to say which pin drives was the control that made the letters
 * stop meaning anything.
 */
export function endLetters(cand: FourBarCandidate | null): {
  A: string;
  B: string;
  C: string;
  D: string;
} {
  return cand?.swappedEnds
    ? { A: 'D', B: 'C', C: 'B', D: 'A' }
    : { A: 'A', B: 'B', C: 'C', D: 'D' };
}

function inRegion(p: Coord, region: { x: number; y: number; w: number; h: number }): boolean {
  return (
    p.x >= region.x && p.x <= region.x + region.w && p.y >= region.y && p.y <= region.y + region.h
  );
}

/** How the two pins sit on the link, in words, for the dimensions list. */
function describePins(uA: number, uB: number, length: number, unit: string): string {
  const part = (u: number, end: 0 | 1): string => {
    if (Math.abs(u - end) < 1e-9) return '';
    const away = Math.abs(u - end) * length;
    const outside = end === 0 ? u < 0 : u > 1;
    // The unit goes with its number. Appended to the whole phrase by the
    // caller, it produced "3.0 past the back cm" -- and, when the pins sit on
    // the ends and there is no number at all, "at both ends cm".
    return (
      (away / MODEL_SCALE).toFixed(1) +
      ' ' +
      unit +
      ' ' +
      (outside ? 'past' : 'inside') +
      ' the ' +
      (end === 0 ? 'back' : 'front')
    );
  };
  const parts = [part(uA, 0), part(uB, 1)].filter(Boolean);
  return parts.length ? parts.join(', ') : 'at both ends';
}

/**
 * Every buildable four-bar through the three positions, best first.
 *
 * "Buildable" is doing real work here: the construction has an answer for
 * almost every pair of pins, but as the three positions approach a straight
 * line the circle centres run off towards infinity, and a ground pivot a
 * hundred link-lengths away is not a machine anybody can make. Those are
 * counted rather than silently dropped, so the panel can say which way the
 * positions need to move.
 */
export function enumerateCandidates(search: CandidateSearch): CandidateResult {
  const { poses, length } = search;
  const rejections: CandidateRejections = {
    tried: 0,
    degenerate: 0,
    tooBig: 0,
    alike: 0,
    outsideRegion: 0,
  };
  if (poses.length !== 3 || !(length > 0)) return { candidates: [], rejections };

  const pairs: [number, number][] = [];
  if (search.endsOnly) {
    pairs.push([0, 1]);
  } else {
    PIN_OFFSETS.forEach((uA) =>
      PIN_OFFSETS.forEach((uB) => {
        if (uB - uA >= MIN_PIN_SPAN) pairs.push([uA, uB]);
      })
    );
  }

  const centre = new Coord(
    poses.reduce((sum, p) => sum + (p.back.x + p.front.x) / 2, 0) / 3,
    poses.reduce((sum, p) => sum + (p.back.y + p.front.y) / 2, 0) / 3
  );
  const spread = Math.max(
    distance(poses[0].back, poses[1].back),
    distance(poses[1].back, poses[2].back),
    distance(poses[0].back, poses[2].back)
  );
  const reach = Math.max(6 * length, 2.5 * spread);

  const out: FourBarCandidate[] = [];
  pairs.forEach(([uA, uB]) => {
    rejections.tried++;
    const ptsA = poses.map((p) => attach(p, uA));
    const ptsB = poses.map((p) => attach(p, uB));
    const A = circumcenter(ptsA[0], ptsA[1], ptsA[2]);
    const D = circumcenter(ptsB[0], ptsB[1], ptsB[2]);
    if (!A || !D) {
      rejections.degenerate++;
      return;
    }
    const r1 = distance(A, ptsA[0]);
    const r2 = distance(D, ptsB[0]);
    const g = distance(A, D);
    if (
      distance(A, centre) > reach ||
      distance(D, centre) > reach ||
      r1 > reach ||
      r2 > reach ||
      g > reach
    ) {
      rejections.tooBig++;
      return;
    }
    if (search.region && (!inRegion(A, search.region) || !inRegion(D, search.region))) {
      rejections.outsideRegion++;
      return;
    }
    // Two constructions that put their pivots within a link-length of each
    // other and hold near-identical bars are the same machine drawn twice.
    const alike = out.some(
      (other) =>
        distance(other.A, A) < length * 0.9 &&
        distance(other.D, D) < length * 0.9 &&
        Math.abs(other.r1 - r1) / Math.max(other.r1, r1) < 0.12 &&
        Math.abs(other.r2 - r2) / Math.max(other.r2, r2) < 0.12
    );
    if (alike) {
      rejections.alike++;
      return;
    }

    const openSign = Math.sign(cross(ptsA[0], D, ptsB[0])) || 1;
    [openSign, -openSign].forEach((sign) => {
      const variant: FourBarCandidate = {
        key: uA + ':' + uB + ':' + sign,
        name: '?',
        A,
        D,
        B: ptsA[0],
        C: ptsB[0],
        r1,
        r2,
        d: distance(ptsA[0], ptsB[0]),
        g,
        uA,
        uB,
        ptsA,
        ptsB,
        sign,
        branch: sign === openSign ? 'Open' : 'Crossed',
        pair: uA + '/' + uB,
        thetas: [],
        errors: [],
        onBranch: [],
        onBranchCount: 0,
        defectFree: false,
        range: { from: 0, to: 0, full: false },
        minTransmission: 0,
        binds: false,
        stroke: { from: 0, to: 0 },
        kind: '',
        size: 0,
      };
      assess(variant);
      // A construction that closes at none of the three positions on this
      // assembly, and cannot even be solved at the first, is not a second
      // branch of anything -- it is the intersection that does not exist.
      if (!isFinite(variant.errors[0]) && variant.onBranchCount === 0) return;
      out.push(variant);
    });
  });

  return { candidates: out, rejections };
}

/** Best first: defect-free, then most positions on one assembly, then roomiest. */
function betterFirst(a: FourBarCandidate, b: FourBarCandidate): number {
  if (a.defectFree !== b.defectFree) return a.defectFree ? -1 : 1;
  if (b.onBranchCount !== a.onBranchCount) return b.onBranchCount - a.onBranchCount;
  return b.minTransmission - a.minTransmission;
}

/**
 * Best first, and one entry per construction rather than per assembly.
 *
 * Open and Crossed are the same four bars closed two different ways -- the same
 * pins in the same places, the same lengths -- so listing them as two solutions
 * asks the reader to compare a thing with itself. They are one solution with a
 * switch on it, and the switch is Assembly branch.
 *
 * The letter is assigned to the construction, so flipping the switch does not
 * rename the solution under the reader.
 */
export function rankCandidates(list: FourBarCandidate[], limit = 8): FourBarCandidate[] {
  const byPair = new Map<string, FourBarCandidate[]>();
  list.forEach((c) => {
    const siblings = byPair.get(c.pair);
    if (siblings) siblings.push(c);
    else byPair.set(c.pair, [c]);
  });

  const best = [...byPair.values()]
    .map((siblings) => siblings.slice().sort(betterFirst)[0])
    .sort(betterFirst)
    .slice(0, limit);

  best.forEach((c, i) => {
    const name = 'ABCDEFGH'[i] ?? '?';
    // Both assemblies of one construction wear it, so the name survives the
    // switch.
    (byPair.get(c.pair) ?? []).forEach((sibling) => (sibling.name = name));
  });
  return best;
}

/** Where the two coupler pins sit on the link, in the reader's own words. */
export function describeCouplerPins(cand: FourBarCandidate, length: number, unit: string): string {
  return describePins(cand.uA, cand.uB, length, unit);
}
