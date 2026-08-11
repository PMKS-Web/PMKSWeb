// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import {
  buildMechanism,
  MechanismFixture,
  buildMechanismAtScale,
} from '../../test-utils/verification/fixture';
import { cylinderBetween, cylinderBoomFixture } from '../../test-utils/verification/slot-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { SettingsService } from '../../app/services/settings.service';
import { SAMPLES_PER_STROKE } from '../../app/model/mechanism/position-solver';
import { HEAD_CLEARANCE_R, cylinderHeadHalf } from '../../app/model/cylinder';

// Gate 5 (docs/joint-types-plan.md § Phase 5): a boom raised by a hydraulic
// cylinder, checked against the closed form.
//
// `incrementPrisInput` had no coverage at all before this file — perturbing it
// changed nothing in any spec, because no fixture drove a prismatic joint. This
// is that missing case, written before the solver learned to drive a cylinder
// rather than after.
//
// The mechanism is a triangle with one side that changes length:
//
//        C  (boom tip, on the rod's mount)
//        |\
//        | \  s(t) -- the cylinder, mount to mount
//   BOOM |  \
//        |   \
//        O----G   BASE
//
// O and G are ground. |OC| and |OG| are rigid, so commanding the cylinder to
// length s fixes the boom angle by the law of cosines:
//
//   s^2 = BASE^2 + BOOM^2 - 2 * BASE * BOOM * cos(theta)
//
// Every assertion below is either that identity, or the thing that identity
// silently assumes: that the members really did keep their lengths, that the
// cylinder stayed straight, and that the commanded length advanced at a
// constant rate rather than wherever the solve happened to land.

const S = MODEL_SCALE;

const BOOM = 4; // |OC|, the raised member
const BASE = 3; // |OG|, ground pivot to barrel mount

// The cylinder, laid along G -> C at the start pose. Barrel and rod are the
// same length by construction, so the only thing left to choose is where in the
// travel the part is drawn, and the fixture draws it at mid-stroke — so the
// cycle has to extend, reverse, retract the whole way, and reverse again.
//
// Read back off the same helper that builds the fixture rather than typed: the
// two lengths follow from the mounts and the bore, and a file asserting its own
// copy of them would go on describing whichever part it was written against.
const CYLINDER = cylinderBetween({ x: BASE, y: 0 }, { x: 0, y: BOOM }, 0.5);
const BARREL_LENGTH = CYLINDER.barrel;
const ROD_LENGTH = CYLINDER.barrel;

/** Linear input speed, in user length units per second. */
const EXTENSION_SPEED = 2;

// The published mechanism, built in internal model units: the cylinder's
// stroke is bounded by its own slot, and a slot is drawn in mark units, which
// are absolute internal units rather than the user's.
const boomFixture = (): MechanismFixture => ({
  ...cylinderBoomFixture(S),
  inputAngVel: EXTENSION_SPEED * S,
});

interface Sample {
  /** Commanded cylinder length, mount to mount, in user units. */
  span: number;
  /** Boom angle from the ground line O -> G. */
  theta: number;
  boomLength: number;
  baseLength: number;
  barrelLength: number;
  rodLength: number;
  /** How far the pin sits off the barrel's axis. */
  pinOffAxis: number;
  /** How far along the axis from the barrel's mount the pin sits. */
  pinAlong: number;
  tipAboveGround: number;
}

function sampleMotion(): { samples: Sample[]; period: number; frames: number } {
  // Pinned: objectScale is a process-wide static and the cylinder's stroke is
  // measured against it, so the travel would otherwise depend on which spec
  // file ran last.
  const { mechanism } = buildMechanismAtScale(boomFixture(), 1 * MODEL_SCALE);
  const samples = mechanism.joints.map((frame) => {
    const at = (id: string): Joint => frame.find((joint) => joint.id === id)!;
    const [o, c, g, n, p] = ['O', 'C', 'G', 'N', 'P'].map(at);
    const axisX = (c.x - g.x) / Math.hypot(c.x - g.x, c.y - g.y);
    const axisY = (c.y - g.y) / Math.hypot(c.x - g.x, c.y - g.y);
    return {
      span: Math.hypot(c.x - g.x, c.y - g.y) / S,
      theta: Math.atan2(c.y - o.y, c.x - o.x),
      boomLength: Math.hypot(c.x - o.x, c.y - o.y) / S,
      baseLength: Math.hypot(g.x - o.x, g.y - o.y) / S,
      barrelLength: Math.hypot(n.x - g.x, n.y - g.y) / S,
      rodLength: Math.hypot(c.x - p.x, c.y - p.y) / S,
      pinOffAxis: Math.abs((p.x - g.x) * axisY - (p.y - g.y) * axisX) / S,
      pinAlong: ((p.x - g.x) * axisX + (p.y - g.y) * axisY) / S,
      tipAboveGround: c.y / S,
    };
  });
  return { samples, period: mechanism.cyclePeriod, frames: mechanism.joints.length };
}

/** The boom angle the law of cosines demands for a commanded cylinder length. */
const thetaFor = (span: number) =>
  Math.acos((BASE * BASE + BOOM * BOOM - span * span) / (2 * BASE * BOOM));

describe('a boom driven by its cylinder', () => {
  const { samples, period, frames } = sampleMotion();

  it('solves at all — the mechanism is valid and it moves', () => {
    // The whole file rests on this: a driven cylinder used to leave the solver
    // with a prismatic input it stepped along a slot angle that was itself
    // being solved, so the mechanism came out invalid or frozen.
    expect(frames).toBeGreaterThan(2);
    expect(new Set(samples.map((s) => s.theta.toFixed(6))).size).toBeGreaterThan(10);
  });

  it('matches the law-of-cosines solution at every sample', () => {
    for (const sample of samples) {
      expect(sample.theta).toBeCloseTo(thetaFor(sample.span), 6);
    }
  });

  it('keeps the rigid members rigid', () => {
    for (const sample of samples) {
      expect(sample.boomLength).toBeCloseTo(BOOM, 6);
      expect(sample.baseLength).toBeCloseTo(BASE, 6);
    }
  });

  it('keeps the cylinder a cylinder: straight, with its own lengths', () => {
    // The barrel and the rod are steel. Only the overlap between them changes,
    // which is the one thing that makes this a cylinder rather than a rubber
    // band drawn between two mounts.
    for (const sample of samples) {
      expect(sample.barrelLength).toBeCloseTo(BARREL_LENGTH, 6);
      expect(sample.rodLength).toBeCloseTo(ROD_LENGTH, 6);
      expect(sample.pinOffAxis).toBeLessThan(1e-6);
    }
  });

  it('advances the commanded length at a constant rate', () => {
    // s(t) is prescribed, so the steps are uniform in length -- not in boom
    // angle, and not in whatever the dyad happened to return.
    const steps = samples.slice(1).map((sample, i) => Math.abs(sample.span - samples[i].span));
    const first = steps[0];
    // Not exact: the span is measured back off joint positions the solver
    // rounds to four decimals in model units, and a step is a difference of two
    // spans, so four of those quanta is the honest bound. The command itself is
    // exact -- that is what closes the cycle below.
    const rounding = 1e-4 / MODEL_SCALE;
    for (const step of steps) {
      expect(Math.abs(step - first)).toBeLessThan(4 * rounding);
    }
  });

  it('travels its whole stroke, out and back, in about 360 samples', () => {
    // The stroke is the pin's travel inside the slot, which is what bounds a
    // real cylinder. Sampling it at SAMPLES_PER_STROKE gives a linear input
    // roughly the 360-sample cycle a crank gets, whatever the part measures.
    const reversals = samples
      .slice(1)
      .map((sample, i) => Math.sign(sample.span - samples[i].span))
      .filter((direction, i, all) => i > 0 && direction !== all[i - 1]).length;
    const step = Math.abs(samples[1].span - samples[0].span);
    const travelled =
      Math.max(...samples.map((s) => s.pinAlong)) - Math.min(...samples.map((s) => s.pinAlong));

    // Out to one end of the travel, back across to the other, home again.
    expect(reversals).toBe(2);
    // Both ends of the stroke are reached to within the last whole step. The
    // sample grid is anchored where the part was drawn rather than at a limit,
    // so the two partial steps at the ends are not taken -- which is also why
    // the cycle can come out two samples short of 2 x SAMPLES_PER_STROKE.
    expect(travelled).toBeGreaterThan(SAMPLES_PER_STROKE * step - 2 * step);
    expect(frames - 1).toBeGreaterThanOrEqual(2 * SAMPLES_PER_STROKE - 2);
    expect(frames - 1).toBeLessThanOrEqual(2 * SAMPLES_PER_STROKE);
  });

  it('closes the cycle exactly where it started', () => {
    const first = samples[0];
    const last = samples[samples.length - 1];

    expect(last.span).toBeCloseTo(first.span, 9);
    expect(last.theta).toBeCloseTo(first.theta, 9);
  });

  it('keeps the head within its own travel at both ends', () => {
    // Past either stop the part comes apart, and the mechanism is claiming a
    // stroke it does not have. The bounds are the head's edges rather than the
    // pin's: closed, its back edge stops a clearance off the mount; open, that
    // back edge reaches the mouth and the head stands clean outside the barrel,
    // so the *pin* legitimately runs a half-head past the barrel's own length.
    // User units, like every other length this spec samples: R is
    // 0.15 objectScale and one objectScale is one user unit.
    const head = cylinderHeadHalf(BARREL_LENGTH, 0.15);
    const clearance = HEAD_CLEARANCE_R * 0.15;
    const alongs = samples.map((sample) => sample.pinAlong);
    expect(Math.min(...alongs) - head).toBeGreaterThanOrEqual(clearance - 1e-6);
    expect(Math.max(...alongs) - head).toBeLessThanOrEqual(BARREL_LENGTH + 1e-6);
  });

  it('raises and lowers the boom without flipping it under the ground', () => {
    // The dyad has two solutions and the mirror image satisfies every length.
    for (const sample of samples) {
      expect(sample.tipAboveGround).toBeGreaterThan(0);
    }
    expect(Math.max(...samples.map((s) => s.theta))).toBeGreaterThan(
      Math.min(...samples.map((s) => s.theta))
    );
  });

  it('spans a cycle whose length follows the commanded speed', () => {
    // Seconds per sample is the step divided by the speed. Doubling the speed
    // has to halve the period and change nothing else -- the property the
    // angular pi/30 conversion silently broke for a linear input.
    const travelled = samples
      .slice(1)
      .reduce((sum, sample, i) => sum + Math.abs(sample.span - samples[i].span), 0);

    expect(period).toBeCloseTo(travelled / EXTENSION_SPEED, 6);
  });
});

// The same boom with the cylinder turned end for end: the barrel now rides the
// moving member and the rod's mount is the grounded one. Worth its own case
// because the walk has to choose which mount the mechanism already holds and
// drive the other, and the two ends are not symmetric in the model — the
// barrel carries the slot, the rod carries the pin.
describe('a boom driven by a cylinder mounted the other way round', () => {
  const reversedFixture = (): MechanismFixture => {
    // Axis C -> G: barrel out from the boom tip, rod back to ground. Same two
    // mounts as the boom above and the same mid-stroke pose, so the only thing
    // this case changes is which end of the ram the mechanism already holds.
    const c = { x: 0, y: BOOM };
    const g = { x: BASE, y: 0 };
    const { barrelEnd, pin } = cylinderBetween(c, g, 0.5);
    return {
      joints: [
        { id: 'O', x: 0, y: 0, ground: true },
        { id: 'C', x: c.x * S, y: c.y * S },
        { id: 'G', x: g.x * S, y: g.y * S, ground: true },
        { id: 'N', x: barrelEnd.x * S, y: barrelEnd.y * S },
        { id: 'P', x: pin.x * S, y: pin.y * S },
      ],
      links: [{ joints: 'OC' }, { joints: 'CN' }, { joints: 'PG' }],
      slider: {
        at: 'P',
        prisId: 'S',
        on: { carrier: 'CN', a: 'C', b: 'N' },
        sealed: true,
        input: true,
      },
      welds: ['P'],
      inputAngVel: EXTENSION_SPEED * S,
    };
  };

  it('solves, and the boom still follows the law of cosines', () => {
    const { mechanism } = buildMechanism(reversedFixture());
    expect(mechanism.joints.length).toBeGreaterThan(2);

    for (const frame of mechanism.joints) {
      const at = (id: string): Joint => frame.find((joint) => joint.id === id)!;
      const [o, c, g] = ['O', 'C', 'G'].map(at);
      const span = Math.hypot(c.x - g.x, c.y - g.y) / S;
      expect(Math.hypot(c.x - o.x, c.y - o.y) / S).toBeCloseTo(BOOM, 6);
      expect(Math.atan2(c.y - o.y, c.x - o.x)).toBeCloseTo(thetaFor(span), 6);
    }
  });
});
