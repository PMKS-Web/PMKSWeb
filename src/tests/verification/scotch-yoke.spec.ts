import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { PositionSolver } from '../../app/model/mechanism/position-solver';
import { slotOffset } from '../../app/model/slide-assembly';
import { buildMechanism, BuiltMechanism } from '../../test-utils/verification/fixture';
import {
  GUIDE_DROP,
  scotchYokeFixture,
  scotchYokeWithTracerFixture,
  swingingBlockFixture,
  TRACER_OFFSET,
  YOKE_CRANK,
} from '../../test-utils/verification/slot-fixtures';

// Gate 3. The Scotch yoke is the case that isolates a floating Slot driving a
// grounded Slide: the crank pin rides the yoke's vertical slot, and the yoke is
// welded to a block on a horizontal guide so it can only translate.
//
// x = r cos θ exactly, which is what makes it worth asserting against rather
// than against sampled data (§4.3).

/** Crank angle at a timestep, measured from the pin the input drives. */
function crankAngle(built: BuiltMechanism, step: number): number {
  const a = jointAt(built, step, 'A');
  const b = jointAt(built, step, 'B');
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function jointAt(built: BuiltMechanism, step: number, id: string): Joint {
  return built.mechanism.joints[step].find((joint) => joint.id === id)!;
}

/** Sample steps spread across the revolution, avoiding only the very ends. */
const SAMPLES = [0, 17, 45, 90, 133, 180, 226, 270, 314, 359];

/** The yoke's slot, vertical and held there by the weld. */
const SLOT_DIRECTION: [number, number] = [0, 1];

describe('a Scotch yoke', () => {
  it('solves every timestep of a full revolution', () => {
    const built = buildMechanism(scotchYokeFixture());

    expect(PositionSolver.unsolvableJoints).toEqual([]);
    expect(built.mechanism.dof).toBe(1);
    // 360 one-degree samples plus the closing one.
    expect(built.mechanism.joints.length).toBeGreaterThan(360);
  });

  it('translates the yoke as x = r cos θ', () => {
    const built = buildMechanism(scotchYokeFixture());

    for (const step of SAMPLES) {
      const theta = crankAngle(built, step);
      // The yoke's joints all sit at the slot's x, and the slot must pass
      // through the crank pin, so the whole body tracks r cos θ.
      expect(jointAt(built, step, 'C').x, `C at step ${step}`).toBeCloseTo(
        YOKE_CRANK * Math.cos(theta),
        3
      );
      expect(jointAt(built, step, 'D').x, `D at step ${step}`).toBeCloseTo(
        YOKE_CRANK * Math.cos(theta),
        3
      );
    }
  });

  it('never lets the yoke rotate or leave its guide', () => {
    const built = buildMechanism(scotchYokeFixture());

    for (const step of SAMPLES) {
      const c = jointAt(built, step, 'C');
      const d = jointAt(built, step, 'D');
      // Welded to a horizontal guide: the yoke may only translate along it, so
      // its slot stays exactly vertical and C keeps its starting height.
      expect(d.x - c.x, `slot stays vertical at step ${step}`).toBeCloseTo(0, 3);
      expect(c.y, `C holds its height at step ${step}`).toBeCloseTo(-GUIDE_DROP, 3);
    }
  });

  it('keeps the crank pin in the slot at every sample', () => {
    // slotOffset is the constraint itself, and the solver divides that same
    // quantity to decide how far to slide. Asserting through it checks the
    // answer against the requirement rather than against the arithmetic that
    // produced it (§2.7a item 3).
    const built = buildMechanism(scotchYokeFixture());

    for (const step of SAMPLES) {
      const offset = slotOffset(
        jointAt(built, step, 'B'),
        jointAt(built, step, 'C'),
        SLOT_DIRECTION
      );
      expect(offset, `crank pin on the slot at step ${step}`).toBeCloseTo(0, 3);
    }
  });

  it('keeps the sliding joint on its pin and on its guide line', () => {
    // Two things that pull opposite ways. The sliding joint is drawn at the
    // block, so it has to stay on top of the pin it carries -- the block is
    // zero-length by construction (§2.10 item 2), and leaving it behind
    // stretches it a little further every timestep. But the *guide* is fixed in
    // the world, so the joint may only ever move along it.
    const built = buildMechanism(scotchYokeFixture());
    const start = jointAt(built, 0, 'F');

    for (const step of SAMPLES) {
      const guide = jointAt(built, step, 'F');
      const pin = jointAt(built, step, 'C');
      expect(guide.x, `guide on its pin at step ${step}`).toBeCloseTo(pin.x, 6);
      expect(guide.y, `guide on its pin at step ${step}`).toBeCloseTo(pin.y, 6);
      // The guide runs horizontally, so any change in y is the joint leaving it.
      expect(guide.y, `guide stays on its line at step ${step}`).toBeCloseTo(start.y, 6);
    }
  });

  it('measures the slot from a joint on it, not from whichever member came first', () => {
    // G is a tracer on the yoke, off the slot and declared ahead of both slot
    // joints. Measuring from it gives a line parallel to the slot but two units
    // to the side, and solving to that line moves the yoke somewhere plausible
    // and wrong -- x would be off by exactly the tracer's offset. The plain
    // yoke cannot catch this because its first member is the slot's own anchor.
    const built = buildMechanism(scotchYokeWithTracerFixture());

    expect(PositionSolver.unsolvableJoints).toEqual([]);
    for (const step of SAMPLES) {
      const theta = crankAngle(built, step);
      expect(jointAt(built, step, 'C').x, `C at step ${step}`).toBeCloseTo(
        YOKE_CRANK * Math.cos(theta),
        3
      );
      // The tracer rides along rigidly, holding its offset from the slot.
      expect(
        jointAt(built, step, 'G').x - jointAt(built, step, 'D').x,
        `tracer offset at step ${step}`
      ).toBeCloseTo(TRACER_OFFSET, 3);
    }
  });

  it('refuses a slot running parallel to its own guide', () => {
    // With the slot and the guide pointing the same way, sliding the assembly
    // never brings the slot any closer to the pin: every position satisfies the
    // constraint equally, so there is no solution rather than a hard-to-find
    // one. Dividing by that near-zero cross product would produce a number.
    const parallel = {
      ...scotchYokeFixture(),
      joints: [
        { id: 'A', x: 0, y: 0, ground: true, input: true },
        { id: 'B', x: YOKE_CRANK, y: 0 },
        { id: 'C', x: YOKE_CRANK, y: 0 },
        { id: 'D', x: YOKE_CRANK + 2, y: 0 },
      ],
    };

    const built = buildMechanism(parallel);

    expect(built.mechanism.isMechanismValid()).toBe(false);
    built.mechanism.joints.forEach((frame, step) => {
      frame.forEach((joint) => {
        expect(Number.isFinite(joint.x), `${joint.id} finite at step ${step}`).toBe(true);
        expect(Number.isFinite(joint.y), `${joint.id} finite at step ${step}`).toBe(true);
      });
    });
  });

  it('names what it cannot place rather than drawing a Slide on a moving carrier', () => {
    // A Slide whose guide is cut into a moving link is out of scope (spec §4):
    // the rider's angle tracks a carrier that is itself unknown, so it resolves
    // as a simultaneous two-unknown solve, which §2.7a hands to the "report
    // unsolvable" strategy.
    //
    // Being out of scope is not the same as being harmless. The inverse slot
    // primitive would happily swing this carrier as if it were an ordinary
    // Slot, and the result animates -- a plausible picture of a different
    // mechanism. So the guard that keeps it out covers every assembly, not just
    // the grounded ones this phase can solve.
    const built = buildMechanism(swingingBlockFixture());

    expect(built.mechanism.dof, 'is a genuine one-DOF mechanism').toBe(1);
    expect(PositionSolver.unsolvableJoints.length).toBeGreaterThan(0);
    expect(built.mechanism.isMechanismValid()).toBe(false);
  });

  it('answers the same when the slot joints are declared the other way round', () => {
    // (C, D) and (D, C) describe one line. A solver that answers differently is
    // reading the pair as ordered when it is not.
    const forward = buildMechanism(scotchYokeFixture());
    const forwardX = SAMPLES.map((step) => jointAt(forward, step, 'C').x);
    const swapped = buildMechanism(scotchYokeFixture(true));

    SAMPLES.forEach((step, index) => {
      expect(jointAt(swapped, step, 'C').x, `step ${step}`).toBeCloseTo(forwardX[index], 6);
    });
  });
});
