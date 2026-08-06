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

  it('resizes the rod past the slot ends instead of stopping the mount', () => {
    const half = slotHalfLength(R, BARREL);
    const mid = BARREL / 2;

    // Pulled far past full extension: the pin holds the slot end and the rod
    // grows to follow the gesture — a mount drag has no maximum length.
    const extended = layoutCylinder({ x: 0, y: 0 }, { x: 50, y: 0 }, BARREL, ROD, R, 'barrel')!;
    expect(extended.pin.x).toBeCloseTo(mid + half, 9);
    expect(extended.rodFar.x).toBeCloseTo(50, 9);
    expect(dist(extended.pin, extended.rodFar)).toBeCloseTo(50 - (mid + half), 9);

    // Pushed past full retraction: the pin holds the near end and the rod
    // shrinks to serve the shorter span.
    const retracted = layoutCylinder(
      { x: 0, y: 0 },
      { x: ROD * 0.5, y: 0 },
      BARREL,
      ROD,
      R,
      'barrel'
    )!;
    expect(retracted.pin.x).toBeCloseTo(Math.max(mid - half, 0), 9);
    expect(retracted.rodFar.x).toBeCloseTo(ROD * 0.5, 9);
    expect(dist(retracted.pin, retracted.rodFar)).toBeCloseTo(
      ROD * 0.5 - Math.max(mid - half, 0),
      9
    );
  });

  it('floors the rod at one block-length, holding the anchor still', () => {
    // Dragging the barrel mount nearly onto a fixed rod mount: the rod shrinks
    // to its floor and the barrel mount stops there; the anchor never moves.
    const rodMount = { x: 10, y: 0 };
    const pose = layoutCylinder({ x: 9.99, y: 0 }, rodMount, BARREL, ROD, R, 'rod')!;

    expect(pose.rodFar).toEqual(rodMount);
    const half = slotHalfLength(R, BARREL);
    const minAlong = Math.max(BARREL / 2 - half, 0);
    const rodMin = MARK.blockAlongHalf * R;
    expect(dist(pose.barrelFar, pose.rodFar)).toBeCloseTo(minAlong + rodMin, 9);
    expect(dist(pose.pin, pose.rodFar)).toBeCloseTo(rodMin, 9);
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
