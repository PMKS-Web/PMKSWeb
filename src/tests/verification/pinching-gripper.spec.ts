// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { pinchingGripperFixture } from '../../test-utils/verification/slot-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { SettingsService } from '../../app/services/settings.service';

// The gripper that grips. Its companion, `gripper.spec.ts`, is the mechanism a
// user actually drew, and it does something else: each arm there rides two
// rails, which leaves it free to slide and barely free to turn, so the jaws
// travel up and down instead of pinching. Jaws pinch when the levers
// counter-rotate, and the whole of what makes that happen here is that the one
// coupler is attached on *opposite* sides of the two pivots.
//
// Asserted as behaviour rather than as coordinates: extending has to close the
// jaws, all the way, without them passing through each other.

const S = MODEL_SCALE;

interface Sample {
  span: number;
  gap: number;
  upperJaw: number;
  lowerJaw: number;
}

function motion(): Sample[] {
  // objectScale is process-wide and the cylinder's stroke is measured against
  // it; pinned so the travel does not depend on the order of the run.
  SettingsService._objectScale.next(1 * MODEL_SCALE);
  const { mechanism } = buildMechanism(pinchingGripperFixture(S));
  return mechanism.joints.map((frame) => {
    const at = (id: string): Joint => frame.find((joint) => joint.id === id)!;
    const [a, d, i, l] = ['A', 'D', 'I', 'L'].map(at);
    return {
      span: Math.hypot(d.x - a.x, d.y - a.y) / S,
      gap: Math.hypot(i.x - l.x, i.y - l.y) / S,
      upperJaw: i.y / S,
      lowerJaw: l.y / S,
    };
  });
}

describe('a gripper the cylinder closes', () => {
  const samples = motion();
  const byExtension = [...samples].sort((first, second) => first.span - second.span);

  it('simulates', () => {
    expect(samples.length).toBeGreaterThan(50);
  });

  it('closes the jaws as the cylinder extends', () => {
    // The whole point of the machine, and the thing the shared design does the
    // other way round.
    expect(byExtension[byExtension.length - 1].gap).toBeLessThan(byExtension[0].gap);
  });

  it('closes them the whole way, and monotonically', () => {
    const mostOpen = byExtension[0].gap;
    const mostClosed = byExtension[byExtension.length - 1].gap;
    expect(mostOpen).toBeGreaterThan(7);
    expect(mostClosed).toBeLessThan(0.2);

    // Every step of extension narrows the gap. A gripper that opened again
    // partway through would mean the levers had swung past each other.
    for (let i = 1; i < byExtension.length; i++) {
      expect(byExtension[i].gap).toBeLessThanOrEqual(byExtension[i - 1].gap + 1e-6);
    }
  });

  it('never lets the jaws pass through each other', () => {
    for (const sample of samples) {
      expect(sample.upperJaw).toBeGreaterThan(sample.lowerJaw);
    }
  });

  it('swings the two jaws toward each other, not along with each other', () => {
    // Counter-rotation is what the crossed coupler buys, and it is what
    // distinguishes a gripper from a linkage that lifts both jaws at once.
    const open = byExtension[0];
    const closed = byExtension[byExtension.length - 1];
    expect(closed.upperJaw).toBeLessThan(open.upperJaw);
    expect(closed.lowerJaw).toBeGreaterThan(open.lowerJaw);
  });
});
