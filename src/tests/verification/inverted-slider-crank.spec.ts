// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { rigidLinkResidual, slotResidual } from '../../app/model/mechanism/constraint-residuals';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  CRANK,
  invertedSliderCrankFixture,
  LEVER,
  OFFSET,
} from '../../test-utils/verification/slot-fixtures';

const INVERTED_SLIDER_CRANK = invertedSliderCrankFixture();

// Test-ladder case 2 (docs/joint-types-plan.md §4.1): the inverted slider-crank,
// also read as the oscillating cylinder. This is the *inverse* direction — the
// crank is driven, so the block is located first and the slotted lever's pose is
// what has to be solved from it.
//
// Asserted against the closed form rather than against sampled data:
//   s(theta) = sqrt(r^2 + d^2 - 2*r*d*cos(theta))   distance C to the block
//   phi(theta) = atan2(r sin theta, r cos theta - d) lever direction

function at(joints: Joint[], id: string): Joint {
  return joints.find((joint) => joint.id === id)!;
}

describe('inverted slider-crank (inverse slot direction)', () => {
  it('assembles and completes a full crank revolution', () => {
    const { mechanism } = buildMechanism(INVERTED_SLIDER_CRANK);

    expect(mechanism.dof).toBe(1);
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(mechanism.joints.length).toBeGreaterThanOrEqual(360);
  });

  it('keeps the block on the slot at every timestep', () => {
    // The defining constraint of a slot, asserted directly rather than through
    // the formula that solves it.
    const { mechanism } = buildMechanism(INVERTED_SLIDER_CRANK);

    for (let t = 0; t < mechanism.joints.length; t++) {
      const joints = mechanism.joints[t];
      const block = at(joints, 'P');
      const c = at(joints, 'C');
      const d = at(joints, 'D');
      expect(slotResidual(block.x, block.y, c.x, c.y, d.x, d.y), `t=${t}`).toBeCloseTo(0, 3);
    }
  });

  it('keeps the block coincident with the crank pin', () => {
    const { mechanism } = buildMechanism(INVERTED_SLIDER_CRANK);

    for (let t = 0; t < mechanism.joints.length; t++) {
      const block = at(mechanism.joints[t], 'P');
      const pin = at(mechanism.joints[t], 'B');
      expect([block.x, block.y], `t=${t}`).toEqual([pin.x, pin.y]);
    }
  });

  it('holds both link lengths rigid', () => {
    const { mechanism } = buildMechanism(INVERTED_SLIDER_CRANK);

    for (let t = 0; t < mechanism.joints.length; t++) {
      const joints = mechanism.joints[t];
      const a = at(joints, 'A');
      const b = at(joints, 'B');
      const c = at(joints, 'C');
      const d = at(joints, 'D');
      expect(rigidLinkResidual(a.x, a.y, b.x, b.y, CRANK), `crank t=${t}`).toBeCloseTo(0, 3);
      expect(rigidLinkResidual(c.x, c.y, d.x, d.y, LEVER), `lever t=${t}`).toBeCloseTo(0, 3);
    }
  });

  it('matches the closed form for slot travel and lever angle', () => {
    const { mechanism } = buildMechanism(INVERTED_SLIDER_CRANK);

    for (let t = 0; t < mechanism.joints.length; t++) {
      const joints = mechanism.joints[t];
      const a = at(joints, 'A');
      const b = at(joints, 'B');
      const c = at(joints, 'C');
      const d = at(joints, 'D');

      // Read the crank angle back out of the solved pose and predict the rest.
      const theta = Math.atan2(b.y - a.y, b.x - a.x);
      const expectedSpan = Math.sqrt(
        CRANK * CRANK + OFFSET * OFFSET - 2 * CRANK * OFFSET * Math.cos(theta)
      );
      const expectedLever = Math.atan2(CRANK * Math.sin(theta), CRANK * Math.cos(theta) - OFFSET);

      expect(Math.hypot(b.x - c.x, b.y - c.y), `span t=${t}`).toBeCloseTo(expectedSpan, 3);

      const leverAngle = Math.atan2(d.y - c.y, d.x - c.x);
      const error = Math.atan2(
        Math.sin(leverAngle - expectedLever),
        Math.cos(leverAngle - expectedLever)
      );
      expect(error, `lever angle t=${t}`).toBeCloseTo(0, 3);
    }
  });
});
