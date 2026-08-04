import { determineSlope } from './utils';

interface PointLike {
  x: number;
  y: number;
}

/**
 * The SVG sweep flag every corner arc of a link outline must use.
 *
 * A link is drawn as its joints' convex hull pushed outward by half the bar
 * width, with an arc round each hull vertex joining one offset edge to the
 * next. Those arcs all turn the same way, and which way that is depends on one
 * thing: the direction the outline is being traced. Trace the hull
 * counter-clockwise and each corner turns positively, so `sweep = 1`; trace it
 * clockwise and every corner is `sweep = 0`.
 *
 * It has to be derived rather than observed because `hull` does not return a
 * consistent winding — a three-vertex hull can come back clockwise for one link
 * and counter-clockwise for the next. With the wrong flag the arc is still the
 * short way round, but round the *other* circle of that radius through the same
 * two points: it bulges inward, and the corner reads as a bite taken out of the
 * link rather than a rounded end.
 */
export function outlineSweepFlag(
  order: string,
  joints: PointLike[],
  indexOf: Map<string, number>,
  width: number
): '0' | '1' {
  const outline = [...order].map((id) => joints[indexOf.get(id)!]).filter(Boolean);
  if (outline.length < 2) return '1';
  return outline.length === 2
    ? binarySweepFlag(outline[0], outline[1], width)
    : signedArea(outline) > 0
      ? '1'
      : '0';
}

/**
 * A two-joint link has no hull area to read a winding from: its outline is the
 * rectangle between the two offset edges, so the winding is decided by which
 * side of the bar the first edge is offset to. `getSimplePathString` starts
 * that edge on the `neg` side, and this reproduces that choice rather than
 * assuming one, so the two cannot drift apart.
 */
function binarySweepFlag(start: PointLike, end: PointLike, width: number): '0' | '1' {
  const slope = determineSlope(start.x, start.y, end.x, end.y);
  const normalAngle = Math.atan(slope === 0 ? 99999 : -1 / slope);
  const negative = {
    x: Math.cos(normalAngle + Math.PI),
    y: Math.sin(normalAngle + Math.PI),
  };
  const along = { x: end.x - start.x, y: end.y - start.y };
  const rectangle = [
    { x: start.x + width * negative.x, y: start.y + width * negative.y },
    { x: end.x + width * negative.x, y: end.y + width * negative.y },
    { x: end.x - width * negative.x, y: end.y - width * negative.y },
    { x: start.x - width * negative.x, y: start.y - width * negative.y },
  ];
  // Degenerate only if the two joints coincide, which no drawable link does.
  return signedArea(rectangle) > 0 || (signedArea(rectangle) === 0 && along.x > 0) ? '1' : '0';
}

function signedArea(polygon: PointLike[]): number {
  return polygon.reduce((total, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return total + (point.x * next.y - next.x * point.y);
  }, 0);
}
