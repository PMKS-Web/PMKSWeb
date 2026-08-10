import { MechanismFixture } from './fixture';
import { cylinderBetween } from './slot-fixtures';

// Mechanisms from the wider linkage library — real machines people already know
// by name, rather than cases built to isolate a solver feature.

/** One rad/s, matching the rest of the verification suite. */
const INPUT_SPEED = 1;

/**
 * Theo Jansen's "holy numbers": the eleven bar lengths plus the two ground
 * offsets that his genetic algorithm settled on in the late 1980s, in the
 * arbitrary unit they are always quoted in.
 *
 * They are quoted rather than derived, and they do not tolerate rounding — a
 * percent or two off any of them visibly spoils the foot path — so they are
 * named here exactly as published and the fixture reads them by letter.
 */
export const JANSEN = {
  a: 38.0,
  b: 41.5,
  c: 39.3,
  d: 40.1,
  e: 55.8,
  f: 39.4,
  g: 36.7,
  h: 65.7,
  i: 49.0,
  j: 50.0,
  k: 61.9,
  l: 7.8,
  m: 15.0,
} as const;

/**
 * One leg of a Strandbeest: an eight-bar whose foot walks.
 *
 * Labelling convention — there are several equivalent ones, so this is the one
 * the coordinates below were computed from, with `a`..`m` the holy numbers:
 *
 * - `O` is the crank axis at the origin and the input; `G` is the frame pivot
 *   at (-a, -l). Both are ground.
 * - `OA` is the crank, length m. Everything else hangs off the crank pin A.
 * - `AB` = j and `AD` = k are the two long bars reaching back from that pin.
 * - `GBC` is the upper triangle, pivoting on the frame at G: |GB| = b,
 *   |BC| = e, |GC| = d.
 * - `GD` = c is the frame bar that holds the knee.
 * - `CE` = f drops from the upper triangle to the leg.
 * - `DEF` is the leg itself, the triangle that carries the foot F:
 *   |DE| = g, |EF| = h, |DF| = i.
 *
 * Seven moving bodies and ten revolute joints, so Gruebler gives one degree of
 * freedom, and every joint is reachable from two already-known ones — the whole
 * linkage is a chain of dyads off the crank, which is why it solves in closed
 * form rather than needing the simultaneous path.
 *
 * `l` is measured *downwards* here. Written as (-a, +l) with the foot hanging
 * below, the assembly is a different linkage rather than a mirror of this one,
 * and its foot draws a lopsided arc instead of the walking curve.
 *
 * The coordinates are the pose at crank angle zero, computed by intersecting
 * the two circles that locate each joint in turn. Each intersection has two
 * roots, so the same eleven bars assemble 32 ways, and the branch is what makes
 * this the Jansen leg rather than one of the other 31: twelve of them jam
 * partway through a turn, and of the nineteen that run, only this one draws the
 * flat sole. The numbers are literals because what produced them is a search
 * over those branches rather than a formula, and because a pose a reader can
 * check against the bar lengths is worth more than one they have to rerun.
 *
 * No dyad comes near tangency over a revolution — the tightest is D's, which
 * keeps 1.19 units of slack on |AD| - |GD| — so the assembly mode holds all the
 * way round and the linkage cannot flip branch mid-cycle.
 */
export function jansenLegFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'O', x: 0, y: 0, ground: true, input: true },
      { id: 'A', x: JANSEN.m, y: 0 },
      { id: 'G', x: -JANSEN.a, y: -JANSEN.l, ground: true },
      { id: 'B', x: -24.013535097, y: 31.272097455 },
      { id: 'C', x: -74.794365381, y: 8.143170206 },
      { id: 'D', x: -26.952107032, y: -45.51517017 },
      { id: 'E', x: -59.231514961, y: -28.052930231 },
      { id: 'F', x: -43.160110524, y: -91.756932926 },
    ],
    links: [
      { joints: 'OA' },
      { joints: 'AB' },
      { joints: 'GBC' },
      { joints: 'AD' },
      { joints: 'GD' },
      { joints: 'CE' },
      { joints: 'DEF' },
    ],
    inputAngVel: INPUT_SPEED,
  };
}

/** Every bar of the leg, as the joint pair it spans and the length it holds. */
export const JANSEN_BARS: readonly [string, string, number][] = [
  ['O', 'A', JANSEN.m],
  ['A', 'B', JANSEN.j],
  ['G', 'B', JANSEN.b],
  ['B', 'C', JANSEN.e],
  ['G', 'C', JANSEN.d],
  ['A', 'D', JANSEN.k],
  ['G', 'D', JANSEN.c],
  ['C', 'E', JANSEN.f],
  ['D', 'E', JANSEN.g],
  ['E', 'F', JANSEN.h],
  ['D', 'F', JANSEN.i],
];

// --- Machines the cylinder, the piston and the slider are for ---------------
//
// Four working machines rather than four solver cases. Each is built the way
// its trade builds it, and between them they put the new parts in every role
// the app can give them: the ram as the drive, the block as the output, the
// slot cut into a bar that is itself moving, and the block as a support that
// carries no load along its own guide.

/**
 * A backhoe bucket, in the frame where the stick is the ground link.
 *
 * The bucket cylinder never reaches the bucket: it pulls a bell crank, the
 * bell crank pushes a short link, and the link curls the bucket about its
 * hinge. That indirection is the design rather than an accident of packaging —
 * it is what lets a ram mounted well back along the stick, where there is room
 * for it, turn a bucket whose hinge it cannot reach, and it is why the business
 * end of a backhoe is a four-bar and not a lever.
 *
 * Coordinates are the drawn pose. The bell crank's ear sits 3 from its pivot
 * and 5.48 from the ram's mount, which puts the ram at mid-travel; its stops
 * then fall at 4.65 and 6.31, sweeping the bell crank through 34 degrees and
 * the bucket through 32. Nothing comes near a dyad's tangency: the link and the
 * bucket ear span 4.60 between them, against a gap that never opens past 3.76
 * and never closes below 2.39.
 */
export const BUCKET = {
  /** Bell-crank pivot on the stick. */
  pivot: { x: 0, y: 0 },
  /** The ram's barrel mount, back along the stick. */
  mount: { x: -7, y: 0 },
  /** The bell crank's rod ear — the point the ram actually moves. */
  ear: { x: -2, y: 2.236 },
  /** Its other arm, which pushes the link. */
  arm: { x: 2, y: 1.2 },
  /** The bucket's hinge at the end of the stick. */
  hinge: { x: 3.2, y: -1.6 },
  /** Where the link reaches the bucket, and the cutting edge. */
  bucketEar: { x: 4.3, y: 0.15 },
  tip: { x: 5.6, y: -2.6 },
} as const;

/**
 * The bucket linkage, driven by its own cylinder.
 *
 * `scale` is the same knob `cylinderBoomFixture` carries and for the same
 * reason: a driven ram's stroke is bounded by its own slot, and a slot is
 * drawn in mark units, which are absolute internal units rather than the
 * user's. A mechanism that is to be *solved* is built in them; the published
 * payload is built at 1 and scaled at the codec boundary.
 */
export function excavatorBucketFixture(scale: number = 1): MechanismFixture {
  const at = (point: { x: number; y: number }) => ({ x: point.x * scale, y: point.y * scale });
  // Mid-travel, so the bucket can curl further in and open further out.
  const { barrelEnd, pin } = cylinderBetween(BUCKET.mount, BUCKET.ear, 0.5);
  return {
    joints: [
      { id: 'A', ...at(BUCKET.mount), ground: true },
      { id: 'B', ...at(barrelEnd) },
      { id: 'C', ...at(pin) },
      { id: 'D', ...at(BUCKET.ear) },
      { id: 'G', ...at(BUCKET.pivot), ground: true },
      { id: 'H', ...at(BUCKET.arm) },
      { id: 'J', ...at(BUCKET.hinge), ground: true },
      { id: 'K', ...at(BUCKET.bucketEar) },
      { id: 'T', ...at(BUCKET.tip) },
    ],
    links: [
      { joints: 'AB' },
      { joints: 'CD' },
      // The bell crank: ram ear D, ground pivot G, link arm H.
      { joints: 'DGH' },
      { joints: 'HK' },
      // The bucket itself: hinge, ear, cutting edge.
      { joints: 'JKT' },
    ],
    slider: {
      at: 'C',
      prisId: 'E',
      on: { carrier: 'AB', a: 'A', b: 'B' },
      sealed: true,
      input: true,
    },
    welds: ['C'],
    inputAngVel: INPUT_SPEED * scale,
  };
}

/** Toggle press: the two toggle links, and the mounts they work between. */
export const TOGGLE = {
  /** Ground pivot of the upper toggle link, and both links' length. */
  pivot: { x: 0, y: 0 },
  link: 4,
  /** The ram's barrel mount, out to one side. */
  mount: { x: -8, y: 0 },
  /** Knee angle at the drawn pose, measured from the pivot. */
  kneeRad: (246 * Math.PI) / 180,
} as const;

/**
 * A toggle press driven by a hydraulic ram.
 *
 * Two equal links hang from a ground pivot to a ram sliding in a vertical
 * guide, and the cylinder pushes their knee sideways. What the machine is for
 * is the last few degrees: as the knee approaches the line between the pivot
 * and the slider, the ram's travel per unit of knee travel goes to zero, and
 * the force it can exert goes the other way. The press closes slowly and
 * enormously hard, which is the whole reason toggle presses exist.
 *
 * The mounts are placed so the ram's stops bracket that behaviour without
 * reaching it. The knee sweeps 225.0 to 267.7 degrees, where 270 is the dead
 * point, and the slider descends from -5.66 to -7.99 against a dead-point depth
 * of exactly -8: the last 2.3 degrees of knee travel are worth 6 thousandths of
 * slider travel. The press closes almost to the singularity and stops short of
 * it, which is both what the machine does and what keeps this a mechanism
 * rather than a fixture balanced on a knife edge.
 */
export function togglePressFixture(scale: number = 1): MechanismFixture {
  const at = (point: { x: number; y: number }) => ({ x: point.x * scale, y: point.y * scale });
  const knee = {
    x: TOGGLE.pivot.x + TOGGLE.link * Math.cos(TOGGLE.kneeRad),
    y: TOGGLE.pivot.y + TOGGLE.link * Math.sin(TOGGLE.kneeRad),
  };
  // The slider is on the vertical through the pivot, a link's length below the
  // knee — so the lower link is its stated length by construction rather than
  // by a coordinate that has to be kept in step with it.
  const ram = { x: TOGGLE.pivot.x, y: knee.y - Math.sqrt(TOGGLE.link ** 2 - knee.x ** 2) };
  const { barrelEnd, pin } = cylinderBetween(TOGGLE.mount, knee, 0.5);
  return {
    joints: [
      { id: 'A', ...at(TOGGLE.mount), ground: true },
      { id: 'B', ...at(barrelEnd) },
      { id: 'C', ...at(pin) },
      { id: 'D', ...at(knee) },
      { id: 'G', ...at(TOGGLE.pivot), ground: true },
      { id: 'R', ...at(ram) },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }, { joints: 'GD' }, { joints: 'DR' }],
    sliders: [
      { at: 'C', prisId: 'E', on: { carrier: 'AB', a: 'A', b: 'B' }, sealed: true, input: true },
      { at: 'R', prisId: 'F', angleRad: Math.PI / 2 },
    ],
    welds: ['C'],
    inputAngVel: INPUT_SPEED * scale,
  };
}

/** Shaper proportions: crank shorter than the ground offset, so the lever rocks. */
export const SHAPER = {
  crank: 1,
  /** How far below the crank axis the lever's ground pivot sits. */
  offset: 3,
  lever: 5,
  /** Height of the ram's guide above the crank axis, and the link up to it. */
  guide: 3.5,
  connector: 2.5,
} as const;

/**
 * A shaper's quick-return drive, ram included.
 *
 * The crank pin rides in a slot cut into the rocking lever, so the lever's
 * angle is the direction from its pivot to the pin. With the crank shorter than
 * the ground offset that direction only rocks, through ±19.47 degrees, and the
 * two ends of the rock are the poses where crank and lever stand square. Those
 * split the revolution unevenly, and the connecting link up to the ram shifts
 * the split a little further: the ram spends 220 degrees of crank on one stroke
 * and 140 on the other. It cuts slowly and returns fast, in the ratio 1.58, off
 * a motor turning at a constant speed.
 *
 * The library's Whitworth entry is the same mechanism proportioned the other
 * way, crank longer than the offset, where the lever turns all the way round
 * instead of rocking. This one is the machine that arrangement was named for,
 * and it carries the ram the quick return is *for*: the slot drives the lever,
 * the lever drives a link, and the link drives a block on a fixed guide.
 */
export function shaperQuickReturnFixture(): MechanismFixture {
  // Drawn with the crank horizontal, a quarter turn from either end of the
  // lever's rock, so a run has to cross both.
  const pin = { x: SHAPER.crank, y: 0 };
  const pivot = { x: 0, y: -SHAPER.offset };
  const reach = Math.hypot(pin.x - pivot.x, pin.y - pivot.y);
  // The lever tip, out along the ray from the pivot through the pin: the slot
  // has to pass through the block at the drawn pose or nothing is assembled.
  const tip = {
    x: pivot.x + ((pin.x - pivot.x) * SHAPER.lever) / reach,
    y: pivot.y + ((pin.y - pivot.y) * SHAPER.lever) / reach,
  };
  const rise = SHAPER.guide - tip.y;
  const ram = { x: tip.x + Math.sqrt(SHAPER.connector ** 2 - rise ** 2), y: SHAPER.guide };
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', ...pin },
      { id: 'C', ...pivot, ground: true },
      { id: 'D', ...tip },
      { id: 'R', ...ram },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }, { joints: 'DR' }],
    sliders: [
      { at: 'B', prisId: 'P', on: { carrier: 'CD', a: 'C', b: 'D' } },
      { at: 'R', prisId: 'Q', angleRad: 0 },
    ],
    inputAngVel: INPUT_SPEED,
  };
}

/** Scissor lift: one pair of arms, where the ram sits on them, and the drawn rise. */
export const SCISSOR = {
  /** Half an arm — the crossing pin is at the middle of both. */
  half: 8,
  /** How far up the driven arm the ram's rod is pinned. */
  rodAlong: 6,
  /** The ram's barrel mount, out along the base rail. */
  mount: { x: 10, y: 0 },
  /** Arm angle at the drawn pose. */
  raisedRad: (40 * Math.PI) / 180,
} as const;

/**
 * A single-stage scissor lift.
 *
 * Two equal arms cross at their midpoints and are pinned there. One arm is
 * pinned to the base and the other's foot rides a rail along it; at the top
 * the same pair is reversed, so the platform stays level at every height
 * without anything holding it level. A ram between the base and a point part
 * way up the pinned arm does the lifting.
 *
 * Every new part appears in a different job. The ram is the drive. The foot
 * block carries the machine's weight but takes no load along its own rail,
 * which is what a slider is for. And the platform's own block rides a slot cut
 * into the platform — a bar that is itself moving — so the platform's angle is
 * not solved from its own pins but from where the arm underneath it has got
 * to.
 *
 * The drawn pose has the arms at 40 degrees; the ram's stops put them at 27.3
 * and 51.8, lifting the platform from 7.35 to 12.56 and drawing the feet in
 * from 14.21 to 9.91. The platform holds level to six thousandths of a unit
 * across the whole lift, which is the solver's own residual on the slot rather
 * than anything the geometry does.
 */
export function scissorLiftFixture(scale: number = 1): MechanismFixture {
  const at = (point: { x: number; y: number }) => ({ x: point.x * scale, y: point.y * scale });
  const along = (distance: number) => ({
    x: distance * Math.cos(SCISSOR.raisedRad),
    y: distance * Math.sin(SCISSOR.raisedRad),
  });
  const rod = along(SCISSOR.rodAlong);
  const cross = along(SCISSOR.half);
  const top = along(2 * SCISSOR.half);
  // The far arm is the near one reflected through the crossing pin, which is
  // what puts its foot under the near arm's top and its top over the base pin.
  const foot = { x: 2 * cross.x, y: 0 };
  const carried = { x: 0, y: 2 * cross.y };
  // The platform runs level from its pin at the far arm's top, out past the
  // near arm's top, which is the joint riding in its slot.
  const platformEnd = { x: top.x + 2, y: top.y };
  const { barrelEnd, pin } = cylinderBetween(SCISSOR.mount, rod, 0.5);
  return {
    joints: [
      { id: 'A', ...at(SCISSOR.mount), ground: true },
      { id: 'B', ...at(barrelEnd) },
      { id: 'C', ...at(pin) },
      { id: 'D', ...at(rod) },
      { id: 'G', x: 0, y: 0, ground: true },
      { id: 'M', ...at(cross) },
      { id: 'K', ...at(top) },
      { id: 'S', ...at(foot) },
      { id: 'T', ...at(carried) },
      { id: 'U', ...at(platformEnd) },
    ],
    links: [
      { joints: 'AB' },
      { joints: 'CD' },
      // The driven arm: base pin, rod ear, crossing pin, top.
      { joints: 'GDMK' },
      // The other arm, foot to top through the same crossing pin.
      { joints: 'SMT' },
      { joints: 'TU' },
    ],
    sliders: [
      { at: 'C', prisId: 'E', on: { carrier: 'AB', a: 'A', b: 'B' }, sealed: true, input: true },
      { at: 'S', prisId: 'N', angleRad: 0 },
      { at: 'K', prisId: 'P', on: { carrier: 'TU', a: 'T', b: 'U' } },
    ],
    welds: ['C'],
    inputAngVel: INPUT_SPEED * scale,
  };
}
