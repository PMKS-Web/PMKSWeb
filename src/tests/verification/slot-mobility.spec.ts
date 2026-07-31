// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import { ellipticalTrammelFixture } from '../../test-utils/verification/slot-fixtures';

// Mobility for mechanisms whose ground, or whose slot, is not an ordinary pin.
// Gruebler counted over rigid bodies: M = 3(N-1) - 2*J1 - J2.
//
// None of these fixtures names an input joint, so Mechanism stops after
// counting instead of running the position solver. That is deliberate: mobility
// is what is under test here, and the motion of these same linkages is asserted
// against closed form in the Gate 2 suite once the slot primitives exist.

/**
 * Elliptical trammel: a bar whose two ends ride in perpendicular grounded
 * slides. Nothing here is pinned to ground, so it is the case that proves a
 * grounded guide anchors the mechanism.
 */
// The trammel is the shared fixture with its input removed: mobility is what
// is under test here, and naming an input would send it to the position solver.
const ELLIPTICAL_TRAMMEL: MechanismFixture = ellipticalTrammelFixture();

/**
 * Inverted slider-crank: crank AB drives a block that slides in a slot cut
 * along the grounded lever CD. The slot moves with the lever, so it is the
 * floating case, and the direction is inverse (§2.5a) — the block is located
 * first and the lever's pose follows from it.
 */
const INVERTED_SLIDER_CRANK: MechanismFixture = {
  joints: [
    { id: 'A', x: 0, y: 0, ground: true },
    { id: 'B', x: 1, y: 0 },
    { id: 'C', x: 3, y: 0, ground: true },
    { id: 'D', x: 3, y: 2 },
  ],
  links: [{ joints: 'AB' }, { joints: 'CD' }],
  sliders: [{ at: 'B', prisId: 'P', on: { carrier: 'CD', a: 'C', b: 'D' } }],
  inputAngVel: 1,
};

describe('mobility with slots', () => {
  it('counts a mechanism held only by its guides', () => {
    // Bodies: bar AB, two blocks, ground = 4. Lower pairs: two pins and two
    // slides = 4. M = 3(4-1) - 2*4 = 1.
    const { mechanism } = buildMechanism(ELLIPTICAL_TRAMMEL);

    expect(mechanism.dof).toBe(1);
  });

  it('does not report a guide-only mechanism as ungrounded', () => {
    // The specific regression: with no grounded pin anywhere, DOF used to come
    // back NaN and the linkage never reached a solver at all.
    const { mechanism } = buildMechanism(ELLIPTICAL_TRAMMEL);

    expect(Number.isNaN(mechanism.dof)).toBe(false);
  });

  it('counts an inverted slider-crank as one degree of freedom', () => {
    // Bodies: crank AB, lever CD, block, ground = 4. Lower pairs: pins at A, B,
    // C plus the slot = 4. D is a free end and constrains nothing.
    const { mechanism } = buildMechanism(INVERTED_SLIDER_CRANK);

    expect(mechanism.dof).toBe(1);
  });

  it('counts the carrier once, not once per slot riding on it', () => {
    // Two blocks in two slots cut into the same lever. Adding the second slot
    // adds a body and a lower pair, which cancel to leave M unchanged only if
    // the carrier itself is not double-counted.
    const twoSlots: MechanismFixture = {
      ...INVERTED_SLIDER_CRANK,
      joints: [...INVERTED_SLIDER_CRANK.joints, { id: 'E', x: 0, y: 1 }],
      links: [...INVERTED_SLIDER_CRANK.links, { joints: 'AE' }],
      sliders: [
        { at: 'B', prisId: 'P', on: { carrier: 'CD', a: 'C', b: 'D' } },
        { at: 'E', prisId: 'Q', on: { carrier: 'CD', a: 'C', b: 'D' } },
      ],
    };
    const { mechanism } = buildMechanism(twoSlots);

    // Bodies: AB, AE, CD, two blocks, ground = 6. Pairs: A(2 bodies meet, so
    // AB and AE each pin to ground: 2), B, E, C, and two slots = 7.
    // M = 3(6-1) - 2*7 = 1.
    expect(mechanism.dof).toBe(1);
  });
});
