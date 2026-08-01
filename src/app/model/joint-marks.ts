/**
 * The joint mark system of docs/joint-types-plan.md §2.8, as geometry.
 *
 * Eight base marks composed from five primitives — hatch, channel, block,
 * marker, arrow — plus one additive driven overlay. Nothing here reads a link
 * colour, and every dimension is a multiple of R, the joint's own radius
 * (0.15 · objectScale). A pixel offset would grow with the canvas transform;
 * this module exists so no caller is tempted to write one.
 *
 * Pure geometry on purpose: the template calls these every animation frame
 * across ~360 timesteps, so they hold no state and allocate only their result.
 */

/** Every dimension of the mark system, in multiples of R. */
export const MARK = {
  /** Block: 7.68R along the slot by 3.05R across, corner 0.34R. */
  blockAlongHalf: 3.84,
  blockAcrossHalf: 1.525,
  blockCorner: 0.34,

  /** Channel: a 2.3R window subtracted from the carrier, outlined in its colour. */
  channelHalfWidth: 1.15,
  channelStroke: 0.16,

  /** Link bars, unchanged from today: 3.68R wide. */
  barHalf: 1.84,

  /** Grounded rails and their ground ticks. */
  railOffset: 1.975,
  railStroke: 0.3,
  railHalfLengthMin: 9.6,
  tickLeg: 0.8,
  tickPitch: 1.3,
  tickStroke: 0.24,

  /** The plate that welds a rider to its block — visual only. */
  fillet: 1.25,

  /** A slot stops short of the joints that define it, never touching them. */
  slotInset: 1.8,

  /** Driven overlay. Always white, which the black block underneath guarantees. */
  arrowTail: 1.4,
  arrowHeadBase: 2.6,
  arrowTip: 3.0,
  arrowStroke: 0.3,
  arrowHeadLength: 0.74,
  arrowHeadHalf: 0.46,

  /** A driven floating pin has no block, so the overlay brings its own backing. */
  pinBackingHalf: 2.2,
  pinArcRadius: 1.55,

  /** The welded marker, replacing the circle at 1.47R across. */
  plusArm: 0.22,
  plusExtent: 0.735,

  /** Elevation, matching the joint circles already on the canvas. */
  shadowOffset: 0.42,
  shadowBlur: 0.21,
} as const;

/** A line segment, in the frame the caller asked for. */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * A capsule whose end-cap centres sit at x0 and x1 on the local x axis. This is
 * the shape of both a link bar and the channel cut into one, which is why a
 * channel reads as a hole in the carrier rather than as a separate object.
 */
export function capsulePath(x0: number, x1: number, halfWidth: number): string {
  const h = halfWidth;
  return `M ${x0} ${-h} H ${x1} A ${h} ${h} 0 0 1 ${x1} ${h} H ${x0} A ${h} ${h} 0 0 1 ${x0} ${-h} Z`;
}

/** The block, centred on the joint, long axis along the slot. Always #000. */
export function blockPath(r: number): string {
  const a = MARK.blockAlongHalf * r;
  const c = MARK.blockAcrossHalf * r;
  const k = MARK.blockCorner * r;
  return roundedRect(-a, -c, 2 * a, 2 * c, k);
}

/** The backing square a driven floating pin brings with it, having no block. */
export function pinBackingPath(r: number): string {
  const h = MARK.pinBackingHalf * r;
  return roundedRect(-h, -h, 2 * h, 2 * h, MARK.blockCorner * r);
}

/** The welded marker: a plus, 1.47R across, in place of the free circle. */
export function plusPath(r: number): string {
  const a = MARK.plusArm * r;
  const e = MARK.plusExtent * r;
  return (
    `M ${-a} ${-e} H ${a} V ${-a} H ${e} V ${a} H ${a} V ${e} ` +
    `H ${-a} V ${a} H ${-e} V ${-a} H ${-a} Z`
  );
}

/**
 * The channel window, centred on the slot's midpoint and running `halfLength`
 * each way. Callers subtract this from the carrier's fill and stroke its
 * outline in the carrier's own colour; both come from the same path so the
 * hole and its edge can never disagree.
 */
export function channelPath(r: number, halfLength: number): string {
  return capsulePath(-halfLength, halfLength, MARK.channelHalfWidth * r);
}

/**
 * How far the channel runs each way from the slot's midpoint.
 *
 * The slot is inset 1.8R from each defining joint — close to them, never
 * touching — and can never be shorter than the block it holds, which would
 * read as a block that has escaped its own guide.
 */
export function slotHalfLength(r: number, jointSeparation: number): number {
  const inset = jointSeparation / 2 - MARK.slotInset * r;
  return Math.max(inset, MARK.blockAlongHalf * r);
}

/**
 * The two rails of a grounded guide and the ground ticks hanging off them.
 *
 * Returned in the slot's own frame, so the caller rotates the whole group to
 * the slot angle. The ticks lean one way regardless of that angle: hatching
 * marks "the world is on this side", and the world does not rotate.
 */
export function railGeometry(
  r: number,
  halfLength: number
): { rails: Segment[]; ticks: Segment[] } {
  const offset = MARK.railOffset * r;
  const leg = MARK.tickLeg * r;
  const pitch = MARK.tickPitch * r;
  const rails: Segment[] = [
    { x1: -halfLength, y1: -offset, x2: halfLength, y2: -offset },
    { x1: -halfLength, y1: offset, x2: halfLength, y2: offset },
  ];
  const ticks: Segment[] = [];
  for (let x = -halfLength + leg; x <= halfLength; x += pitch) {
    ticks.push({ x1: x, y1: -offset, x2: x - leg, y2: -offset - leg });
    ticks.push({ x1: x, y1: offset, x2: x - leg, y2: offset + leg });
  }
  return { rails, ticks };
}

/**
 * The straight arrows of a driven slider: one each way along the slot, clear
 * of the block's centre so the marker sits between them.
 */
export function straightArrowPaths(r: number): { line: Segment; head: string }[] {
  return [1, -1].map((side) => ({
    line: {
      x1: side * MARK.arrowTail * r,
      y1: 0,
      x2: side * MARK.arrowHeadBase * r,
      y2: 0,
    },
    head: arrowHead(r, side * MARK.arrowTip * r, 0, side > 0 ? 0 : Math.PI),
  }));
}

/**
 * The curved arrow of a driven floating pin: an arc most of the way round,
 * with its head tangent to the end.
 */
export function curvedArrowPath(r: number): { arc: string; head: string } {
  const radius = MARK.pinArcRadius * r;
  const start = angleOnCircle(radius, Math.PI - 0.31);
  const end = angleOnCircle(radius, Math.PI / 2 - 0.31);
  return {
    arc: `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${end.x} ${end.y}`,
    head: arrowHead(r, end.x, end.y, (196 * Math.PI) / 180),
  };
}

/** A filled triangular head, tip at (x, y), pointing along `angle`. */
function arrowHead(r: number, x: number, y: number, angle: number): string {
  const back = MARK.arrowHeadLength * r;
  const half = MARK.arrowHeadHalf * r;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const at = (dx: number, dy: number) => `${x + dx * c - dy * s} ${y + dx * s + dy * c}`;
  return `M ${at(0, 0)} L ${at(-back, -half)} L ${at(-back, half)} Z`;
}

function angleOnCircle(radius: number, angle: number): { x: number; y: number } {
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

function roundedRect(x: number, y: number, w: number, h: number, k: number): string {
  const c = Math.min(k, w / 2, h / 2);
  return (
    `M ${x + c} ${y} H ${x + w - c} A ${c} ${c} 0 0 1 ${x + w} ${y + c} ` +
    `V ${y + h - c} A ${c} ${c} 0 0 1 ${x + w - c} ${y + h} ` +
    `H ${x + c} A ${c} ${c} 0 0 1 ${x} ${y + h - c} ` +
    `V ${y + c} A ${c} ${c} 0 0 1 ${x + c} ${y} Z`
  );
}
