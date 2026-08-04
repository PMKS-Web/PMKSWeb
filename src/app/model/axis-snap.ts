/**
 * Pulling a dragged joint onto the axis of another when it is nearly there.
 *
 * A linkage drawn by hand almost never lands on the right angle it was meant
 * to have: a crank that should be vertical ends up at 89.4 degrees, and the
 * only ways to correct it were to keep nudging or to type coordinates. The
 * snap is per axis and independent — a drag can land on one joint's x and a
 * different joint's y at the same time, which is exactly what putting a joint
 * "square to the frame" means.
 *
 * Tolerance is a distance on screen rather than in the model, so how forgiving
 * it feels does not change with zoom.
 */

export interface SnapPoint {
  x: number;
  y: number;
}

/** A line from the snapped joint to the joint whose axis it landed on. */
export interface SnapGuide {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface AxisSnapResult {
  point: SnapPoint;
  guides: SnapGuide[];
}

export function snapToAxes(
  wanted: SnapPoint,
  others: SnapPoint[],
  tolerance: number
): AxisSnapResult {
  const nearestX = nearest(others, (other) => other.x - wanted.x, tolerance);
  const nearestY = nearest(others, (other) => other.y - wanted.y, tolerance);
  const point = {
    x: nearestX ? nearestX.x : wanted.x,
    y: nearestY ? nearestY.y : wanted.y,
  };

  const guides: SnapGuide[] = [];
  // Drawn from the joint that decided the axis, so the alignment is legible
  // before the drag is released rather than only after it.
  if (nearestX) guides.push({ x1: point.x, y1: point.y, x2: nearestX.x, y2: nearestX.y });
  if (nearestY) guides.push({ x1: point.x, y1: point.y, x2: nearestY.x, y2: nearestY.y });
  return { point, guides };
}

function nearest(
  candidates: SnapPoint[],
  offset: (candidate: SnapPoint) => number,
  tolerance: number
): SnapPoint | undefined {
  let best: SnapPoint | undefined;
  let bestDistance = tolerance;
  for (const candidate of candidates) {
    const distance = Math.abs(offset(candidate));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}
