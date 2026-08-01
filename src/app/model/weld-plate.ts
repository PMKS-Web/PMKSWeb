/**
 * The plate that makes a Slide read as one body with its rider (§2.8 rule 4).
 *
 * A Slide's block is the same #000 block a Slot has — there is no colour
 * derivation anywhere in the mark system. What makes it look like the rider's
 * body is a second, purely visual plate in the rider's own paint at the link's
 * own alpha, drawn over the black and welded to the rider with filleted
 * internal angles. That is the vocabulary a welded joint already uses, so the
 * cue is borrowed rather than invented, and it works for any random palette
 * because it is literally the rider's colour rather than a function of it.
 *
 * The block underneath never changes. Toggling the plate off is exactly the
 * difference between a Slide and a Slot.
 */

import { MARK } from './joint-marks';

/**
 * Fillet paths for the two internal angles between the plate and its rider,
 * in the slot's frame with the joint at the origin.
 *
 * `riderAngle` is the rider's direction relative to the slot axis. Returns
 * fewer than two paths — often none — when the geometry has no concave corner
 * to soften: a rider pointing along its own slot is wider than the block is
 * across, so it swallows the block instead of meeting it at an angle. Drawing
 * a fillet there would invent a corner that is not on screen.
 */
export function weldPlateFillets(r: number, riderAngle: number): string[] {
  const alongHalf = MARK.blockAlongHalf * r;
  const acrossHalf = MARK.blockAcrossHalf * r;
  const barHalf = MARK.barHalf * r;
  const radius = MARK.fillet * r;

  const d = { x: Math.cos(riderAngle), y: Math.sin(riderAngle) };
  const n = { x: -d.y, y: d.x };

  const paths: string[] = [];
  for (const side of [1, -1]) {
    const start = { x: side * barHalf * n.x, y: side * barHalf * n.y };
    // An edge that begins outside the block never meets it.
    if (Math.abs(start.x) > alongHalf || Math.abs(start.y) > acrossHalf) continue;

    const exit = exitPoint(start, d, alongHalf, acrossHalf);
    if (!exit) continue;

    // Which way the plate's surface continues from the corner: along the block
    // edge, away from the rider. The rider's own centreline crosses the same
    // edge line, and the corner always lies to one side of it.
    const tangent = exit.horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 };
    const centreline = centrelineOnEdge(d, exit, alongHalf, acrossHalf);
    if (centreline === undefined) continue;
    const along = exit.point.x * tangent.x + exit.point.y * tangent.y;
    const away = Math.sign(along - centreline);
    if (away === 0) continue;

    const c = exit.point;
    const p1 = { x: c.x + away * radius * tangent.x, y: c.y + away * radius * tangent.y };
    const p2 = { x: c.x + radius * d.x, y: c.y + radius * d.y };
    paths.push(`M ${p1.x} ${p1.y} Q ${c.x} ${c.y} ${p2.x} ${p2.y} L ${c.x} ${c.y} Z`);
  }
  return paths;
}

interface Exit {
  point: { x: number; y: number };
  /** True when the corner sits on a top or bottom edge rather than an end. */
  horizontal: boolean;
}

/** Where a ray leaving `start` along `d` crosses out of the block rectangle. */
function exitPoint(
  start: { x: number; y: number },
  d: { x: number; y: number },
  alongHalf: number,
  acrossHalf: number
): Exit | undefined {
  const candidates: Exit[] = [];
  if (Math.abs(d.x) > 1e-12) {
    const t = ((Math.sign(d.x) || 1) * alongHalf - start.x) / d.x;
    if (t > 0) {
      const y = start.y + t * d.y;
      if (Math.abs(y) <= acrossHalf + 1e-9) {
        candidates.push({ point: { x: start.x + t * d.x, y }, horizontal: false });
      }
    }
  }
  if (Math.abs(d.y) > 1e-12) {
    const t = ((Math.sign(d.y) || 1) * acrossHalf - start.y) / d.y;
    if (t > 0) {
      const x = start.x + t * d.x;
      if (Math.abs(x) <= alongHalf + 1e-9) {
        candidates.push({ point: { x, y: start.y + t * d.y }, horizontal: true });
      }
    }
  }
  // A ray leaving a rectangle crosses one edge; a corner hit yields both, and
  // either answers the same point.
  return candidates[0];
}

/**
 * Where the rider's centreline crosses the line containing the corner's edge,
 * measured along that edge. Undefined when the centreline runs parallel to it.
 */
function centrelineOnEdge(
  d: { x: number; y: number },
  exit: Exit,
  alongHalf: number,
  acrossHalf: number
): number | undefined {
  if (exit.horizontal) {
    if (Math.abs(d.y) < 1e-12) return undefined;
    return (Math.sign(exit.point.y) * acrossHalf * d.x) / d.y;
  }
  if (Math.abs(d.x) < 1e-12) return undefined;
  return (Math.sign(exit.point.x) * alongHalf * d.y) / d.x;
}
