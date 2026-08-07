// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { fourBarDrivenAtFixture } from '../../test-utils/verification/fixtures';
import { describeActuator, incidentBodies, GROUND_BODY } from '../../app/model/actuator';

// Gate 6 (docs/joint-types-plan.md § Phase 6): the same four-bar driven at its
// crank and at its coupler-rocker pin has to trace the same coupler curve.
//
// The reference is exact because it is the same mechanism, not a table of
// sampled numbers: whatever the coupler point draws when a grounded crank turns
// it, it must also draw when the floating pin is the thing being turned. Only
// the parameterisation differs -- equal steps of crank angle are not equal
// steps of joint angle -- so the test compares the curves as *sets of points*
// rather than sample by sample.

/** The path the coupler tracer draws, as points. */
function couplerCurve(drivenAt: 'A' | 'C'): { x: number; y: number }[] {
  const { mechanism } = buildMechanism(fourBarDrivenAtFixture(drivenAt));
  return mechanism.joints.map((frame) => {
    const tracer: Joint = frame.find((joint) => joint.id === 'T')!;
    return { x: tracer.x, y: tracer.y };
  });
}

/** How far `point` is from the nearest point of `curve`. */
function distanceToCurve(point: { x: number; y: number }, curve: { x: number; y: number }[]) {
  return Math.min(...curve.map((other) => Math.hypot(other.x - point.x, other.y - point.y)));
}

describe('a four-bar driven at its coupler-rocker pin', () => {
  const fromCrank = couplerCurve('A');
  const fromPin = couplerCurve('C');

  it('solves at all', () => {
    // The ordering walk starts at the input joint and swings its neighbours
    // about it, which assumes the input's position is known. A floating pin's
    // is not, so before Phase 6 this mechanism could not be driven here.
    expect(fromPin.length).toBeGreaterThan(20);
    expect(fromCrank.length).toBeGreaterThan(20);
  });

  it('traces the same coupler curve either way', () => {
    // Every point one drive reaches lies on the curve the other draws. The
    // tolerance is a hair over the sampling: two curves sampled at different
    // parameterisations never share exact points, but the gap between a point
    // and the *nearest* point of the other curve is bounded by how far the
    // tracer moves between samples.
    const stride = Math.max(
      ...fromCrank
        .slice(1)
        .map((point, i) => Math.hypot(point.x - fromCrank[i].x, point.y - fromCrank[i].y))
    );
    for (const point of fromPin) {
      expect(distanceToCurve(point, fromCrank)).toBeLessThan(stride);
    }
  });

  it('covers the arc its own joint angle can reach, and traces it both ways', () => {
    // Not the whole curve, and it cannot be. The angle at the coupler-rocker
    // pin is the transmission angle, which *oscillates* between two limits
    // rather than turning through a full revolution -- so a drive that
    // prescribes it sweeps between those limits and comes back. Every point it
    // reaches is on the crank-driven curve (above); this is how much of it.
    const spread = (curve: { x: number; y: number }[], axis: 'x' | 'y') =>
      Math.max(...curve.map((p) => p[axis])) - Math.min(...curve.map((p) => p[axis]));
    expect(spread(fromPin, 'x')).toBeGreaterThan(spread(fromCrank, 'x') * 0.6);
    expect(spread(fromPin, 'y')).toBeGreaterThan(spread(fromCrank, 'y') * 0.6);

    // Out and back: the tracer returns to where it started, so the cycle is a
    // closed excursion rather than half of one.
    const first = fromPin[0];
    const last = fromPin[fromPin.length - 1];
    expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeLessThan(0.02);
  });

  it('keeps every bar rigid while the pin drives', () => {
    const { mechanism } = buildMechanism(fourBarDrivenAtFixture('C'));
    const at = (t: number, id: string): Joint => mechanism.joints[t].find((j) => j.id === id)!;
    const length = (t: number, a: string, b: string) =>
      Math.hypot(at(t, a).x - at(t, b).x, at(t, a).y - at(t, b).y);
    for (let t = 0; t < mechanism.joints.length; t++) {
      for (const [a, b] of [
        ['O', 'A'],
        ['A', 'C'],
        ['C', 'D'],
        ['A', 'T'],
        ['C', 'T'],
      ] as const) {
        // Bounded by the rounding, not by decimal places: solved positions are
        // kept to four decimals, and a length is a difference of two of them.
        expect(Math.abs(length(t, a, b) - length(0, a, b))).toBeLessThan(3e-4);
      }
    }
  });
});

describe('what a driven joint names', () => {
  const bar = (id: string, joints: Joint[]) => new RealLink(id, joints, 1, 1);

  it('pairs the two bodies a grounded crank turns, ground first', () => {
    const pivot = new RevJoint('O', 0, 0, true, true);
    const far = new RevJoint('A', 1, 0);
    const crank = bar('OA', [pivot, far]);
    pivot.links.push(crank);

    const actuator = describeActuator(pivot);
    expect(typeof actuator).not.toBe('string');
    if (typeof actuator === 'string') return;
    // The crank's angle is read from the world, not the world's from the crank.
    expect(actuator.referenceBody).toBe(GROUND_BODY);
    expect((actuator.drivenBody as RealLink).id).toBe('OA');
    expect(actuator.kind).toBe('angle');
  });

  it('pairs the two links a floating pin turns, in serialization order', () => {
    const pin = new RevJoint('C', 0, 0);
    const left = new RevJoint('A', -1, 0);
    const right = new RevJoint('D', 1, 0);
    const coupler = bar('AC', [left, pin]);
    const rocker = bar('CD', [pin, right]);
    pin.links.push(coupler, rocker);

    const actuator = describeActuator(pin);
    if (typeof actuator === 'string') throw new Error(actuator);
    // joint.links order *is* the serialization order, which is what makes the
    // pairing survive a URL round-trip without entering the codec.
    expect((actuator.referenceBody as RealLink).id).toBe('AC');
    expect((actuator.drivenBody as RealLink).id).toBe('CD');
  });

  it('refuses a joint where three bodies meet, and says why', () => {
    // "The angle between the bodies" names no particular pair here, and every
    // answer a solver could pick is a guess the user never made.
    const pin = new RevJoint('C', 0, 0);
    const a = new RevJoint('A', -1, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('E', 0, 1);
    pin.links.push(bar('AC', [a, pin]), bar('BC', [b, pin]), bar('CE', [pin, c]));

    const refusal = describeActuator(pin);
    expect(typeof refusal).toBe('string');
    expect(refusal as string).toContain('3 bodies');
  });

  it('counts the body on the far side of a slot, which is not in links', () => {
    // A sliding joint's far side is whatever the slot is cut into. Missing it
    // would let a cylinder's own slider look like a one-body joint.
    const { joints } = buildMechanism(fourBarDrivenAtFixture('A'));
    const grounded = joints.find((joint) => joint.id === 'O')! as RevJoint;
    expect(incidentBodies(grounded).length).toBe(2);
  });
});
