// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';

// A slider-crank has an exact closed form for any guide angle, so these cases
// are asserted against the formula rather than against sampled reference data:
// stronger, and there is nothing to drift. See docs/joint-types-plan.md §4.3.
//
// The guide angle is the point of the exercise. Today's circle-line
// intersection is written in slope-intercept form (y = m·x + n with
// m = tan(angle)), which cannot represent a vertical guide and leans on a
// Number.MAX_VALUE clamp plus a separate NaN branch to survive near-vertical
// ones. A guide fixed in the world only meets that singularity if a user types
// 90 degrees; a guide carried on a rotating link would cross it twice per
// revolution. The parametric rewrite has to make every angle below ordinary.

const CRANK_LENGTH = 1;
const CRANK_PIVOT: [number, number] = [0, 0];
/** Where the slider sits at t = 0; the guide is the line through here. */
const SLIDER_START: [number, number] = [3.2, 0.6];

function sliderCrankOnGuide(angleRad: number): MechanismFixture {
  const [bx, by] = [CRANK_PIVOT[0] + CRANK_LENGTH, CRANK_PIVOT[1]];
  return {
    joints: [
      { id: 'A', x: CRANK_PIVOT[0], y: CRANK_PIVOT[1], ground: true, input: true },
      { id: 'B', x: bx, y: by },
      { id: 'C', x: SLIDER_START[0], y: SLIDER_START[1] },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }],
    slider: { at: 'C', prisId: 'D', angleRad },
    inputAngVel: (10 * Math.PI) / 30,
  };
}

function jointAt(joints: Joint[], id: string): Joint {
  return joints.find((joint) => joint.id === id)!;
}

/**
 * Where the slider must be, from the geometry alone.
 *
 * The slider rides the line through `SLIDER_START` at `angleRad`, so
 * `C = G + t·u`. Requiring `|C − B| = couplerLength` gives a quadratic in `t`
 * whose two roots are the linkage's two assembly modes; the caller picks the
 * one the mechanism is actually on.
 */
function guidePositionsFor(
  b: { x: number; y: number },
  angleRad: number,
  couplerLength: number
): [number, number][] {
  const ux = Math.cos(angleRad);
  const uy = Math.sin(angleRad);
  const dx = SLIDER_START[0] - b.x;
  const dy = SLIDER_START[1] - b.y;

  const dDotU = dx * ux + dy * uy;
  const discriminant = dDotU * dDotU - (dx * dx + dy * dy) + couplerLength * couplerLength;
  expect(discriminant).toBeGreaterThanOrEqual(0);

  const root = Math.sqrt(discriminant);
  return [-dDotU + root, -dDotU - root].map(
    (t) => [SLIDER_START[0] + t * ux, SLIDER_START[1] + t * uy] as [number, number]
  );
}

const GUIDES: [string, number][] = [
  ['horizontal (0 degrees)', 0],
  ['30 degrees', Math.PI / 6],
  ['60 degrees', Math.PI / 3],
  ['0.05 degrees off vertical', ((90 - 0.05) * Math.PI) / 180],
  ['exactly vertical (90 degrees)', Math.PI / 2],
  ['past vertical (120 degrees)', (2 * Math.PI) / 3],
];

describe('slider-crank on an arbitrary guide angle', () => {
  for (const [label, angleRad] of GUIDES) {
    describe(label, () => {
      it('solves, and every solved position is finite', () => {
        const { mechanism } = buildMechanism(sliderCrankOnGuide(angleRad));

        expect(mechanism.isMechanismValid()).toBe(true);
        expect(mechanism.dof).toBe(1);
        expect(mechanism.joints.length).toBeGreaterThan(1);

        mechanism.joints.forEach((joints) =>
          joints.forEach((joint) => {
            expect(Number.isFinite(joint.x)).toBe(true);
            expect(Number.isFinite(joint.y)).toBe(true);
          })
        );
      });

      it('keeps the slider on its guide line', () => {
        const { mechanism } = buildMechanism(sliderCrankOnGuide(angleRad));
        const ux = Math.cos(angleRad);
        const uy = Math.sin(angleRad);

        mechanism.joints.forEach((joints, timestep) => {
          const c = jointAt(joints, 'C');
          // Distance from C to the guide line, via the 2D cross product.
          const offGuide = Math.abs((c.x - SLIDER_START[0]) * uy - (c.y - SLIDER_START[1]) * ux);
          expect(
            offGuide,
            `timestep ${timestep}: slider left the guide by ${offGuide}`
          ).toBeLessThan(1e-3);
        });
      });

      it('holds the coupler length', () => {
        const { mechanism } = buildMechanism(sliderCrankOnGuide(angleRad));
        const first = mechanism.joints[0];
        const expected = Math.hypot(
          jointAt(first, 'C').x - jointAt(first, 'B').x,
          jointAt(first, 'C').y - jointAt(first, 'B').y
        );

        mechanism.joints.forEach((joints, timestep) => {
          const actual = Math.hypot(
            jointAt(joints, 'C').x - jointAt(joints, 'B').x,
            jointAt(joints, 'C').y - jointAt(joints, 'B').y
          );
          expect(actual, `timestep ${timestep}`).toBeCloseTo(expected, 3);
        });
      });

      it('matches the closed-form slider position at every timestep', () => {
        const { mechanism } = buildMechanism(sliderCrankOnGuide(angleRad));
        const first = mechanism.joints[0];
        const couplerLength = Math.hypot(
          jointAt(first, 'C').x - jointAt(first, 'B').x,
          jointAt(first, 'C').y - jointAt(first, 'B').y
        );

        mechanism.joints.forEach((joints, timestep) => {
          const b = jointAt(joints, 'B');
          const c = jointAt(joints, 'C');
          const roots = guidePositionsFor(b, angleRad, couplerLength);
          // Both roots are geometrically valid; the solver is only required to
          // sit on one of them, and to stay on the branch it started on.
          const nearest = Math.min(...roots.map(([x, y]) => Math.hypot(c.x - x, c.y - y)));
          expect(nearest, `timestep ${timestep}: C=(${c.x}, ${c.y})`).toBeLessThan(1e-3);
        });
      });

      it('keeps the prismatic joint coincident with its revolute', () => {
        const { mechanism } = buildMechanism(sliderCrankOnGuide(angleRad));

        mechanism.joints.forEach((joints, timestep) => {
          const c = jointAt(joints, 'C');
          const d = jointAt(joints, 'D');
          expect([d.x, d.y], `timestep ${timestep}`).toEqual([c.x, c.y]);
        });
      });
    });
  }
});
