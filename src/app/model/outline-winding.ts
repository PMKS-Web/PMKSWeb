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
/**
 * Hull vertices that are corners, dropping any that sit on the line between
 * their neighbours.
 *
 * `hull` returns a point lying on an edge as a vertex of that edge, which is
 * defensible for a hull and wrong for an outline: the offset edge arrives at
 * it, turns through a semicircle it does not need, and leaves along the same
 * line — so the outline folds back over itself. Filled even-odd, the doubled
 * region cancels and renders *white*, and since a joint only has to pass
 * through the line to produce it, the sliver appears and disappears as a joint
 * is dragged past its neighbours.
 *
 * The tolerance is a fraction of the bar's own width, so a fold too thin to
 * see is removed on the same grounds as one that is exactly flat.
 */
export function withoutCollinearVertices(
  order: string,
  joints: PointLike[],
  indexOf: Map<string, number>,
  width: number
): string {
  let kept = [...order];
  const flatness = width * 1e-3;
  for (let pass = 0; pass < kept.length && kept.length > 2; pass++) {
    const at = (index: number) => joints[indexOf.get(kept[(index + kept.length) % kept.length])!];
    const index = kept.findIndex((_, position) => {
      const previous = at(position - 1);
      const vertex = at(position);
      const next = at(position + 1);
      if (!previous || !vertex || !next) return false;
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      const span = Math.hypot(dx, dy);
      if (span < 1e-12) return false;
      const away = Math.abs((vertex.x - previous.x) * dy - (vertex.y - previous.y) * dx) / span;
      if (away >= flatness) return false;
      // Between them, not merely on their line. With three joints in a row all
      // three are on one line, and dropping the wrong one shortens the link to
      // the wrong pair of ends -- only the middle one is the redundant corner.
      const along = ((vertex.x - previous.x) * dx + (vertex.y - previous.y) * dy) / (span * span);
      return along > 0 && along < 1;
    });
    if (index < 0) break;
    kept.splice(index, 1);
  }
  return kept.join('');
}

export function outlineSweepFlag(
  order: string,
  joints: PointLike[],
  indexOf: Map<string, number>,
  width: number
): '0' | '1' {
  const outline = [...order].map((id) => joints[indexOf.get(id)!]).filter(Boolean);
  if (outline.length < 2) return '1';
  const area = outline.length > 2 ? signedArea(outline) : 0;
  // A hull with no area has no winding to read, and joints do fall exactly on
  // one line: three joints in a row, or a link dragged flat. The outline is
  // still a rectangle with a definite winding, decided the same way a bar's is
  // — by which side its first edge was offset to. `determineL` picks that side
  // by which offset lands further from the third joint, and with the three in a
  // line both land the same distance away, so it takes the same `neg` side a
  // two-joint link starts on.
  if (Math.abs(area) > COLLINEAR_AREA) return area > 0 ? '1' : '0';
  return binarySweepFlag(outline[0], outline[1], width);
}

/**
 * Below this a hull is a line, not a polygon. Twice the area of a triangle
 * one part in a thousand of a bar-width deep, which is far finer than anything
 * a corner arc can show and far coarser than the noise in a dragged position.
 */
const COLLINEAR_AREA = 1e-9;

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
