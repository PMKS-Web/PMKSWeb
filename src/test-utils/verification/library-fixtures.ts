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
      // The walking curve, which is the only reason to build this linkage.
      { id: 'F', x: -43.160110524, y: -91.756932926, trace: true },
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
 * and 6.50 from the ram's mount, which puts the ram at mid-travel; its stops
 * then fall at 4.67 and 8.34, sweeping the bell crank through 75 degrees and
 * the bucket through 54.
 *
 * The proportions are what keep both dyads clear of a tangency: the ear stays
 * between 30 and 106 degrees off the line to the ram's mount, so the triangle
 * that places it never flattens, and the link and the bucket ear span 5.40
 * between them against a gap that never opens past 4.44 and never closes below
 * 1.59.
 *
 * Both margins depend on how far the ram travels, and that is not a property of
 * these coordinates — it is set by `cylinderBetween`, and through it by the
 * model's own rule for how much barrel the head costs. When that rule last
 * changed, every stroke here roughly doubled: this mechanism went to within
 * 0.02 of a tangency at the bucket and flattened its ram triangle to 6 degrees.
 * If it changes again, re-measure rather than assuming the sweeps quoted above
 * still hold.
 */
export const BUCKET = {
  /** Bell-crank pivot on the stick. */
  pivot: { x: 0, y: 0 },
  /** The ram's barrel mount, back along the stick. */
  mount: { x: -7, y: 0 },
  /** The bell crank's rod ear — the point the ram actually moves. */
  ear: { x: -1.124, y: 2.781 },
  /** Its other arm, which pushes the link. */
  arm: { x: 2, y: 1.2 },
  /** The bucket's hinge at the end of the stick. */
  hinge: { x: 3.2, y: -1.6 },
  /** Where the link reaches the bucket, and the cutting edge. */
  bucketEar: { x: 4.818, y: 0.172 },
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
  /**
   * Knee angle at the drawn pose, measured from the pivot.
   *
   * This is the number that bounds the travel. The ram is drawn at mid-stroke
   * like every other one here, so the span between the mounts fixes how much
   * ram there is, and how much ram there is fixes how far past the drawn pose
   * the knee can be pushed. Drawn much straighter than this and the extension
   * carries the knee through the dead point at 270 and out the far side, where
   * the press opens again — honest as motion, but a poor first look at what a
   * toggle is for.
   */
  kneeRad: (235 * Math.PI) / 180,
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
 * The mounts and the drawn knee angle are placed so the ram's stops bracket
 * that behaviour without reaching it. The knee sweeps 205.6 to 262.1 degrees,
 * where 270 is the dead point, and the slider descends from -3.45 to -7.93
 * against a dead-point depth of exactly -8. The last five degrees of that
 * 56-degree sweep are worth under 3% of the slider's travel, and the first half
 * of the sweep is worth twice the second. The press closes almost to the
 * singularity and stops short of it, which is both what the machine does and
 * what keeps this a mechanism rather than a fixture balanced on a knife edge —
 * drawn straighter, as it once was, the ram's own extension carried the knee
 * 8.6 degrees past the dead point and the slider through its singular depth.
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

// --- Machines a driven pin off the ground is for ----------------------------
//
// A driven pin that is not on the ground commands the angle *between two
// moving bodies*, which is what a motor bolted to a swinging arm actually
// does. Three machines, each built around a different consequence of that: a
// knee that cannot finish a revolution, a crank that finishes one without its
// own body ever leaving its arc, and a drive in the middle of a machine whose
// output is a straight line at the far end.
//
// One fact they share is worth naming once. A driven pin off the ground is
// bounded by whatever *else* in the loop runs out first, and for a four-bar
// that is the bar pinned to ground reaching the line of the frame. It gets
// there twice, half a revolution apart, so the drive sweeps out and comes back
// — unless, as in the fan, those two poses cannot be reached at all.

/**
 * Where two bar lengths meet, given the two points they hang from.
 *
 * The two circles cross twice and the roots are mirror images across the line
 * `from`-`to`; `side` is +1 for the root left of that line and -1 for the
 * right. Which one a fixture wants is its assembly mode, so it is named at the
 * call rather than guessed here.
 */
function meet(
  from: { x: number; y: number },
  fromLength: number,
  to: { x: number; y: number },
  toLength: number,
  side: 1 | -1
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = Math.hypot(dx, dy);
  const along = (fromLength ** 2 - toLength ** 2 + span ** 2) / (2 * span);
  const across = Math.sqrt(fromLength ** 2 - along ** 2);
  return {
    x: from.x + (along * dx - side * across * dy) / span,
    y: from.y + (along * dy + side * across * dx) / span,
  };
}

/** A pedaling leg: the rider's dimensions and the bicycle's. */
export const PEDAL = {
  /** Crank arm. 170 mm is what almost every bicycle ships with. */
  crank: 1.7,
  /** The hip, relative to the bottom bracket: back a little and well up. */
  hip: { x: -1.5, y: 5.8 },
  thigh: 4.2,
  /** Knee to pedal spindle — the shank plus the foot, which move as one here. */
  shank: 4.4,
} as const;

/**
 * A leg on a bicycle crank, driven at the knee.
 *
 * The knee is the powered joint, and it is nowhere near the ground: the motor
 * driving it is carried by the thigh, which is itself swinging. What it
 * commands is the angle between thigh and shank, and everything else — where
 * the pedal is, which way the crank is turning — follows from that.
 *
 * The reach is what makes the drive stop where it does. The pedal's distance
 * from the hip runs between 4.35 and 7.69, and the leg spans 8.6 fully
 * extended, so the knee never straightens and never becomes the thing that
 * limits the motion. What limits it is the crank: the drive stops where the
 * crank comes into line with the bottom bracket and the hip, and those two
 * poses are half a revolution apart. So the knee sweeps 66 degrees, from 60.7
 * to 126.7, the crank swings 163 of the 180 available to it, and then it all
 * has to come back — which is why a bicycle needs a second leg and a wheel
 * with some inertia in it, and why nobody starts off one-footed.
 */
export function pedalingLegFixture(): MechanismFixture {
  // Drawn with the crank horizontal and forward, which is roughly mid-sweep.
  const pedal = { x: PEDAL.crank, y: 0 };
  // Knee forward of the hip-to-pedal line, which is the way a leg bends.
  const knee = meet(PEDAL.hip, PEDAL.thigh, pedal, PEDAL.shank, 1);
  return {
    joints: [
      { id: 'B', x: 0, y: 0, ground: true },
      // The circle the pedal is forced to travel, which is what the knee
      // is working against.
      { id: 'P', ...pedal, trace: true },
      { id: 'H', ...PEDAL.hip, ground: true },
      { id: 'K', ...knee, input: true },
    ],
    // Thigh first, so the knee angle is read as the shank's angle relative to
    // the thigh rather than the other way about.
    links: [{ joints: 'HK' }, { joints: 'KP' }, { joints: 'BP' }],
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * An oscillating fan, seen from above.
 *
 * The four lengths are not free. For the crank to keep turning rather than
 * stopping, no two bars in the loop may ever come into line, and that pins the
 * arm and the link to within a crank throw or so of each other — which is why
 * the gearbox sits well out along the head rather than tucked against the
 * pivot. `shaftOffRad` then puts it off the head's centre line, so that the
 * head is a body with a shape rather than three points on a line.
 */
export const FAN = {
  /** Yoke pivot to the gearbox output shaft, both carried by the head. */
  arm: 4,
  /** Pivot to the fixed pin the link is anchored to. */
  anchor: 1.6,
  /** Crank throw on the gearbox output. */
  crank: 1,
  link: 4.4,
  /** Pivot to the blade hub, and how far off the head's centre line the shaft sits. */
  nose: 5.6,
  shaftOffRad: (-30 * Math.PI) / 180,
} as const;

/**
 * An oscillating desk fan, driven at the crank its own gearbox turns.
 *
 * The motor that makes a fan sweep is bolted to the head, and the head is the
 * thing it sweeps. Its output crank therefore turns about an axis that is
 * itself moving, and the only thing the motor knows is the angle between the
 * crank and the head it is bolted to. A short link from the crank pin down to a
 * fixed pin on the yoke is what turns that into a sweep.
 *
 * So this is the case a driven pin exists for, and it is on a table somewhere
 * in every hot country. Nothing here is grounded except the two pins that hold
 * the yoke; the input is the angle between two bodies that both move.
 *
 * It also behaves unlike the other two. The bars are proportioned so the crank
 * makes complete revolutions relative to the head: on Grashof's inequality the
 * crank and the link total 5.4 against 5.6 for the other two, and the crank is
 * the shortest bar, so nothing in this loop ever comes into line and the drive
 * has nowhere to stop. The commanded angle therefore runs right round, and one
 * cycle is 360 samples of genuine revolution rather than a sweep out and back.
 *
 * The head meanwhile sweeps 89 degrees and no more, 44.5 either side of the
 * pose it is drawn at, and returns to the middle twice per turn of the crank. A
 * relative angle going round and round and an absolute one that never leaves
 * its arc, at the same joint: that is the whole distinction a driven pin off
 * the ground exists to make.
 */
export function oscillatingFanFixture(): MechanismFixture {
  const pivot = { x: 0, y: 0 };
  // Drawn with the head pointing along +x, mid-sweep.
  const nose = { x: FAN.nose, y: 0 };
  const shaft = {
    x: FAN.arm * Math.cos(FAN.shaftOffRad),
    y: FAN.arm * Math.sin(FAN.shaftOffRad),
  };
  // The anchor is placed from the sweep rather than typed in: the head's two
  // limits are symmetric about the drawn pose only when the fixed pin sits at
  // the middle of the angle the head can reach, which is half way between the
  // two poses where link and crank line up.
  const halfSweep = (span: number) =>
    Math.acos((FAN.arm ** 2 + FAN.anchor ** 2 - span ** 2) / (2 * FAN.arm * FAN.anchor));
  const middle = (halfSweep(FAN.link + FAN.crank) + halfSweep(FAN.link - FAN.crank)) / 2;
  const anchorRad = FAN.shaftOffRad - middle;
  const anchor = { x: FAN.anchor * Math.cos(anchorRad), y: FAN.anchor * Math.sin(anchorRad) };
  const pin = meet(shaft, FAN.crank, anchor, FAN.link, 1);
  return {
    joints: [
      { id: 'A', ...pivot, ground: true },
      { id: 'C', ...shaft, input: true },
      { id: 'D', ...pin },
      { id: 'B', ...anchor, ground: true },
      { id: 'N', ...nose },
    ],
    // Head first, so the drive reads the crank's angle against the head rather
    // than the head's against the crank — which is the way the motor is bolted.
    links: [{ joints: 'ACN' }, { joints: 'CD' }, { joints: 'DB' }],
    inputAngVel: INPUT_SPEED,
  };
}

/** A walking-beam pumping unit, in the proportions the field uses. */
export const PUMPJACK = {
  /** How far the crankshaft sits from the Samson post the beam pivots on. */
  reach: 4.2,
  crank: 1,
  pitman: 3.3,
  /** Beam behind the post, to the pitman's pin; and in front, to the horsehead. */
  tail: 2.5,
  head: 3.2,
  /** Polished rod, and where its stuffing box holds it. */
  rod: 2.6,
  wellhead: 3.4,
} as const;

/**
 * A walking-beam pumping unit — a nodding donkey — driven at the pitman's
 * upper pin.
 *
 * The pin where the pitman meets the beam is the one an actuator would span if
 * you wanted to work this machine without a crankshaft, and neither of the two
 * bodies meeting there is the ground: the pitman swings and the beam rocks.
 * Everything the well sees comes out of that one angle.
 *
 * What it shows that the other two do not is the far end. The drive is an angle
 * in the middle of the machine and the output is a straight line at the end of
 * it: the polished rod is a block in the wellhead's guide, so its travel is
 * stroke and nothing else — 2.09 of it, and its horizontal position never
 * changes by so much as a rounding.
 *
 * It also shows an output that turns round before the command does. The
 * commanded angle only ever increases from 76.0 to its stop at 126.0, but the
 * beam runs out of travel of its own part way along — the crank comes into line
 * with the pitman at 22.4 degrees of nod, which is where any rocker stops — and
 * gives a degree of it back while the drive is still asking for more. It is a
 * small excursion and it is the only one in the cycle, but it is the thing
 * worth seeing: a relative angle and the motion it produces are not the same
 * quantity, and here one of them is monotone over that stretch and the other is
 * not.
 *
 * The stops are the two poses where the crank comes into line with the
 * crankshaft and the Samson post, 3.2 and 5.2 from the post. The pitman and the
 * beam's tail span 5.8 between them, which is more, so those two can never come
 * into line themselves: what limits this machine is the crank, and the crank
 * rocks through 155 degrees rather than turning. The crankshaft's bearing from
 * the post is chosen so those two stops fall the same angle either side of the
 * pose the beam is drawn level at.
 */
export function pumpjackFixture(): MechanismFixture {
  const post = { x: 0, y: 0 };
  // Drawn with the beam level. That is the middle of the nod rather than an
  // arbitrary pose, because the crankshaft is placed to make it so: the beam
  // stops where the crank lies along the line to the post, which is a fixed
  // angle either side of the crankshaft's own bearing from it.
  const tail = { x: -PUMPJACK.tail, y: 0 };
  const horsehead = { x: PUMPJACK.head, y: 0 };
  const stop = (span: number) =>
    Math.acos((PUMPJACK.tail ** 2 + span ** 2 - PUMPJACK.pitman ** 2) / (2 * PUMPJACK.tail * span));
  const middle =
    (stop(PUMPJACK.reach - PUMPJACK.crank) + stop(PUMPJACK.reach + PUMPJACK.crank)) / 2;
  const crankshaft = {
    x: PUMPJACK.reach * Math.cos(Math.PI + middle),
    y: PUMPJACK.reach * Math.sin(Math.PI + middle),
  };
  const pin = meet(crankshaft, PUMPJACK.crank, tail, PUMPJACK.pitman, -1);
  // The rod hangs from the horsehead to a block in the stuffing box, which is
  // on the wellhead's centre line.
  const drop = Math.sqrt(PUMPJACK.rod ** 2 - (PUMPJACK.wellhead - horsehead.x) ** 2);
  return {
    joints: [
      { id: 'A', ...crankshaft, ground: true },
      { id: 'M', ...pin },
      { id: 'P', ...tail, input: true },
      { id: 'S', ...post, ground: true },
      { id: 'H', ...horsehead },
      { id: 'R', x: PUMPJACK.wellhead, y: horsehead.y - drop },
    ],
    // Pitman first: the drive reads the beam's angle against the pitman.
    links: [{ joints: 'AM' }, { joints: 'MP' }, { joints: 'PSH' }, { joints: 'HR' }],
    slider: { at: 'R', prisId: 'W', angleRad: Math.PI / 2 },
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
  // Far enough out that the block riding the slot is still in it at the bottom
  // of the lift. The arms lie flatter there, which carries the arm's top —
  // the block — further along the platform than the drawn pose shows; at two
  // units the platform ran out from under it, and now the solver refuses a
  // pose where that happens rather than drawing it anyway.
  const platformEnd = { x: top.x + 4, y: top.y };
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
