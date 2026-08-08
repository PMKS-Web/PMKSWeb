// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { pivotingGripperFixture } from '../../test-utils/verification/slot-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { SettingsService } from '../../app/services/settings.service';

// The counterpart to motiongen-gripper.spec.ts: the same gripper with the
// redundancy designed out, so that the refusal recorded there is shown to be
// about the mechanism rather than about grippers.

describe('a gripper with no redundant constraint', () => {
  SettingsService._objectScale.next(1 * MODEL_SCALE);
  const { mechanism } = buildMechanism(pivotingGripperFixture(MODEL_SCALE));
  const at = (t: number, id: string): Joint => mechanism.joints[t].find((j) => j.id === id)!;
  const gap = (t: number) =>
    Math.hypot(at(t, 'J').x - at(t, 'K').x, at(t, 'J').y - at(t, 'K').y) / MODEL_SCALE;

  it('has one degree of freedom and runs', () => {
    expect((mechanism as unknown as { dof: number }).dof).toBe(1);
    expect(mechanism.joints.length).toBeGreaterThan(50);
  });

  it('opens and closes the jaws', () => {
    const gaps = mechanism.joints.map((_, t) => gap(t));
    expect(Math.max(...gaps)).toBeGreaterThan(6);
    expect(Math.min(...gaps)).toBeLessThan(0.5);
  });

  it('keeps both jaws on their pivots and both rods rigid', () => {
    for (let t = 0; t < mechanism.joints.length; t++) {
      // Ground pivots stay put.
      for (const id of ['F', 'H']) {
        expect(Math.hypot(at(t, id).x - at(0, id).x, at(t, id).y - at(0, id).y)).toBeLessThan(3e-4);
      }
      // Rods and jaws stay their own length.
      for (const [a, b] of [
        ['B', 'G'],
        ['C', 'I'],
        ['F', 'K'],
        ['H', 'J'],
      ] as const) {
        const now = Math.hypot(at(t, a).x - at(t, b).x, at(t, a).y - at(t, b).y);
        const was = Math.hypot(at(0, a).x - at(0, b).x, at(0, a).y - at(0, b).y);
        expect(Math.abs(now - was)).toBeLessThan(3e-3);
      }
    }
  });

  it('keeps the plate on its rail, and square to it', () => {
    // Two pins on one line is what stops the plate turning, and it is the part
    // of this design that had to be a rail rather than a single pin: taking a
    // rod away otherwise leaves the plate free to rotate.
    for (let t = 0; t < mechanism.joints.length; t++) {
      expect(Math.abs(at(t, 'A').y)).toBeLessThan(3e-4);
      expect(Math.abs(at(t, 'M').y)).toBeLessThan(3e-4);
    }
  });
});
