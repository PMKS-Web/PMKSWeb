import './joint';
import { layoutCylinder } from './cylinder';
import { MARK, slotHalfLength } from './joint-marks';

// The parametric drag (§ cylinder 6): dragging a mount re-poses the whole
// assembly about the other mount. Collinearity has to hold by construction,
// the member lengths are rigid inside the stroke, and beyond the slot's ends
// the rod resizes to follow the gesture (no maximum, one block-length minimum).

const BARREL = 3;
const ROD = 4;
const R = 0.15;

const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.hypot(q.x - p.x, q.y - p.y);

const cross = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  p: { x: number; y: number }
) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);

describe('layoutCylinder', () => {
  it('puts every joint exactly on the mount-to-mount axis', () => {
    const pose = layoutCylinder({ x: 1, y: 2 }, { x: 5.3, y: 6.1 }, BARREL, ROD, R, 'barrel')!;

    for (const point of [pose.barrelNear, pose.pin]) {
      expect(Math.abs(cross(pose.barrelFar, pose.rodFar, point))).toBeLessThan(1e-9);
    }
  });

  it('keeps the barrel and rod rigid', () => {
    const pose = layoutCylinder({ x: -2, y: 0.5 }, { x: 3, y: 4 }, BARREL, ROD, R, 'rod')!;

    expect(dist(pose.barrelFar, pose.barrelNear)).toBeCloseTo(BARREL, 9);
    expect(dist(pose.pin, pose.rodFar)).toBeCloseTo(ROD, 9);
  });

  it('holds the anchor mount exactly still', () => {
    const barrelMount = { x: 1.25, y: -0.75 };
    const rodMount = { x: 7, y: 3 };

    const aboutBarrel = layoutCylinder(barrelMount, rodMount, BARREL, ROD, R, 'barrel')!;
    expect(aboutBarrel.barrelFar).toEqual(barrelMount);

    const aboutRod = layoutCylinder(barrelMount, rodMount, BARREL, ROD, R, 'rod')!;
    expect(aboutRod.rodFar).toEqual(rodMount);
  });

  it('slides the pin as the mounts separate, inside the slot', () => {
    // Separation 6 puts the pin 2 from the barrel mount: inside the slot span
    // for a barrel of 3 (mid 1.5, half >= blockAlongHalf * r).
    const pose = layoutCylinder({ x: 0, y: 0 }, { x: 6, y: 0 }, BARREL, ROD, R, 'barrel')!;

    expect(pose.pin.x).toBeCloseTo(2, 9);
    expect(pose.rodFar.x).toBeCloseTo(6, 9);
  });

  it('scales the whole part past the slot ends, holding the barrel:rod ratio', () => {
    const half = slotHalfLength(R, BARREL);
    const mid = BARREL / 2;
    const maxAlong = mid + half;
    const minAlong = Math.max(mid - half, 0);

    // Pulled far past full extension: no maximum — barrel and rod grow
    // together by the same factor, so the part keeps its proportions.
    const kOut = 50 / (maxAlong + ROD);
    const extended = layoutCylinder({ x: 0, y: 0 }, { x: 50, y: 0 }, BARREL, ROD, R, 'barrel')!;
    expect(extended.rodFar.x).toBeCloseTo(50, 9);
    expect(dist(extended.barrelFar, extended.barrelNear)).toBeCloseTo(BARREL * kOut, 9);
    expect(dist(extended.pin, extended.rodFar)).toBeCloseTo(ROD * kOut, 9);

    // Pushed past full retraction: same rule, shrinking.
    const span = ROD * 0.5;
    const kIn = span / (minAlong + ROD);
    const retracted = layoutCylinder({ x: 0, y: 0 }, { x: span, y: 0 }, BARREL, ROD, R, 'barrel')!;
    expect(retracted.rodFar.x).toBeCloseTo(span, 9);
    expect(dist(retracted.barrelFar, retracted.barrelNear)).toBeCloseTo(BARREL * kIn, 9);
    expect(dist(retracted.pin, retracted.rodFar)).toBeCloseTo(ROD * kIn, 9);
  });

  it('floors the span at the compact pose, holding the anchor still', () => {
    // Dragging the barrel mount nearly onto a fixed rod mount: the span stops
    // at the reference drawing's minimum; the anchor never moves.
    const rodMount = { x: 10, y: 0 };
    const pose = layoutCylinder({ x: 9.999, y: 0 }, rodMount, BARREL, ROD, R, 'rod')!;

    expect(pose.rodFar).toEqual(rodMount);
    expect(dist(pose.barrelFar, pose.rodFar)).toBeCloseTo(2.6 * MARK.blockAlongHalf * R, 9);
  });

  it('holds the axis instead of flipping when a drag crosses the anchor', () => {
    // The rod mount dragged straight through and past the barrel mount: with
    // the previous axis as a hint, the part clamps at its minimum span on the
    // side it was already on rather than flipping 180°.
    const pose = layoutCylinder({ x: 0, y: 0 }, { x: -5, y: 0 }, BARREL, ROD, R, 'barrel', {
      x: 1,
      y: 0,
    })!;

    expect(pose.rodFar.x).toBeCloseTo(2.6 * MARK.blockAlongHalf * R, 9);
    expect(pose.rodFar.x).toBeGreaterThan(0);
  });

  it('rotates rigidly about the anchor as the dragged mount swings', () => {
    const anchor = { x: 2, y: 1 };
    const flat = layoutCylinder(anchor, { x: 8, y: 1 }, BARREL, ROD, R, 'barrel')!;
    const swung = layoutCylinder(anchor, { x: 2, y: 7 }, BARREL, ROD, R, 'barrel')!;

    // Same separation both times, so the same stroke — every inter-joint
    // distance is preserved across the rotation.
    expect(dist(swung.barrelFar, swung.rodFar)).toBeCloseTo(dist(flat.barrelFar, flat.rodFar), 9);
    expect(dist(swung.barrelNear, swung.pin)).toBeCloseTo(dist(flat.barrelNear, flat.pin), 9);
    expect(swung.barrelFar).toEqual(anchor);
  });

  it('declines coincident mounts, which define no axis', () => {
    expect(
      layoutCylinder({ x: 1, y: 1 }, { x: 1, y: 1 }, BARREL, ROD, R, 'barrel')
    ).toBeUndefined();
  });
});
