import './joint';
import { layoutCylinder } from './cylinder';
import { MARK } from './joint-marks';

// The parametric drag (§ cylinder 6), flexbox semantics: the span between the
// mounts drives everything. The barrel absorbs the change first — bounded by
// its minimum and maximum — and the rod only grows once the barrel is full,
// with no maximum. Collinearity holds by construction, the anchor mount never
// moves, and the same span always draws the same part.

const R = 0.15;
// The spec restates the flex constants from their R definitions, so a change
// to either side is a visible diff here.
const BARREL_MIN = 1.3;
const BARREL_MAX = 2;
const ROD_MIN = 1.7 * MARK.blockAlongHalf * R;
const INSET = MARK.slotInset * R;
const SPAN_MIN = BARREL_MIN - INSET + ROD_MIN;

// Legacy member-length arguments: accepted for the callers' convenience,
// ignored by the flex solve.
const BARREL_ARG = 3;
const ROD_ARG = 4;

const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.hypot(q.x - p.x, q.y - p.y);

const cross = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  p: { x: number; y: number }
) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);

const at = (span: number) =>
  layoutCylinder({ x: 0, y: 0 }, { x: span, y: 0 }, BARREL_ARG, ROD_ARG, R, 'barrel')!;

describe('layoutCylinder (flex)', () => {
  it('puts every joint exactly on the mount-to-mount axis', () => {
    const pose = layoutCylinder(
      { x: 1, y: 2 },
      { x: 5.3, y: 6.1 },
      BARREL_ARG,
      ROD_ARG,
      R,
      'barrel'
    )!;

    for (const point of [pose.barrelNear, pose.pin]) {
      expect(Math.abs(cross(pose.barrelFar, pose.rodFar, point))).toBeLessThan(1e-9);
    }
  });

  it('grows the barrel first, holding the rod at its minimum', () => {
    const span = (BARREL_MIN + BARREL_MAX) / 2 - INSET + ROD_MIN; // barrel mid-range
    const pose = at(span);

    expect(dist(pose.barrelFar, pose.barrelNear)).toBeCloseTo(span + INSET - ROD_MIN, 9);
    expect(dist(pose.pin, pose.rodFar)).toBeCloseTo(ROD_MIN, 9);
  });

  it('grows the rod only after the barrel is at full length', () => {
    const span = BARREL_MAX - INSET + ROD_MIN + 5; // 5 past the barrel's ceiling
    const pose = at(span);

    expect(dist(pose.barrelFar, pose.barrelNear)).toBeCloseTo(BARREL_MAX, 9);
    expect(dist(pose.pin, pose.rodFar)).toBeCloseTo(ROD_MIN + 5, 9);
    expect(pose.rodFar.x).toBeCloseTo(span, 9);
  });

  it('floors the span at the compact pose, holding the anchor still', () => {
    const rodMount = { x: 10, y: 0 };
    const pose = layoutCylinder({ x: 9.999, y: 0 }, rodMount, BARREL_ARG, ROD_ARG, R, 'rod')!;

    expect(pose.rodFar).toEqual(rodMount);
    expect(dist(pose.barrelFar, pose.rodFar)).toBeCloseTo(SPAN_MIN, 9);
    expect(dist(pose.barrelFar, pose.barrelNear)).toBeCloseTo(BARREL_MIN, 9);
    expect(dist(pose.pin, pose.rodFar)).toBeCloseTo(ROD_MIN, 9);
  });

  it('draws the same part at the same span from either anchor', () => {
    const aAnchored = layoutCylinder({ x: 0, y: 0 }, { x: 6, y: 0 }, 1, 9, R, 'barrel')!;
    const cAnchored = layoutCylinder({ x: 0, y: 0 }, { x: 6, y: 0 }, 9, 1, R, 'rod')!;

    expect(dist(aAnchored.barrelFar, aAnchored.barrelNear)).toBeCloseTo(
      dist(cAnchored.barrelFar, cAnchored.barrelNear),
      9
    );
    expect(dist(aAnchored.pin, aAnchored.rodFar)).toBeCloseTo(
      dist(cAnchored.pin, cAnchored.rodFar),
      9
    );
  });

  it('holds the anchor mount exactly still', () => {
    const barrelMount = { x: 1.25, y: -0.75 };
    const rodMount = { x: 7, y: 3 };

    const aboutBarrel = layoutCylinder(barrelMount, rodMount, BARREL_ARG, ROD_ARG, R, 'barrel')!;
    expect(aboutBarrel.barrelFar).toEqual(barrelMount);

    const aboutRod = layoutCylinder(barrelMount, rodMount, BARREL_ARG, ROD_ARG, R, 'rod')!;
    expect(aboutRod.rodFar).toEqual(rodMount);
  });

  it('rotates rigidly about the anchor as the dragged mount swings', () => {
    const anchor = { x: 2, y: 1 };
    const flat = layoutCylinder(anchor, { x: 8, y: 1 }, BARREL_ARG, ROD_ARG, R, 'barrel')!;
    const swung = layoutCylinder(anchor, { x: 2, y: 7 }, BARREL_ARG, ROD_ARG, R, 'barrel')!;

    // Same span both ways, so the same part at a different angle.
    expect(dist(swung.barrelFar, swung.rodFar)).toBeCloseTo(dist(flat.barrelFar, flat.rodFar), 9);
    expect(dist(swung.barrelNear, swung.pin)).toBeCloseTo(dist(flat.barrelNear, flat.pin), 9);
    expect(swung.barrelFar).toEqual(anchor);
  });

  it('holds the axis instead of flipping when a drag crosses the anchor', () => {
    const pose = layoutCylinder({ x: 0, y: 0 }, { x: -5, y: 0 }, BARREL_ARG, ROD_ARG, R, 'barrel', {
      x: 1,
      y: 0,
    })!;

    expect(pose.rodFar.x).toBeCloseTo(SPAN_MIN, 9);
    expect(pose.rodFar.x).toBeGreaterThan(0);
  });

  it('declines coincident mounts with no axis hint', () => {
    expect(
      layoutCylinder({ x: 1, y: 1 }, { x: 1, y: 1 }, BARREL_ARG, ROD_ARG, R, 'barrel')
    ).toBeUndefined();
  });
});
