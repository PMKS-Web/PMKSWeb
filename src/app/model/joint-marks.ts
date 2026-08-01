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

/**
 * The cylinder skin (§2.7). Scoped to the skin: the barrel is deliberately much
 * fatter than the rod, and that heft is what reads as a cylinder body rather
 * than as another bar.
 */
export const CYLINDER = {
  barrelHalf: 2.95,
  /** The rod is a standard link width, so block and rod form one uniform bar. */
  rodHalf: 1.84,
  /** Where the barrel stops: inside the block, so the rod visibly enters it. */
  flatCut: 0.56,
  boreHalf: 1.39,
  /** Larger than the general 1.47R weld glyph, matching the reference. */
  markerArm: 0.31,
  markerExtent: 0.95,
  arrowTail: 1.55,
  arrowHeadBase: 2.75,
  arrowTip: 3.3,
  arrowHeadHalf: 0.62,
} as const;

/**
 * The barrel, collapsed: rounded on its own far joint and cut flat inside the
 * block, so the rod disappears into it instead of stopping against it.
 *
 * `reach` is how far the barrel's far joint sits from the block, measured
 * against the slot with the rod in the +x direction — so the barrel runs the
 * other way and `reach` is negative.
 */
export function barrelCollapsedPath(r: number, reach: number): string {
  const h = CYLINDER.barrelHalf * r;
  const cut = CYLINDER.flatCut * MARK.blockAlongHalf * r * Math.sign(reach || -1) * -1;
  const cap = reach;
  const sweep = reach < 0 ? 1 : 0;
  return (
    `M ${cap} ${-h} L ${cut} ${-h} L ${cut} ${h} L ${cap} ${h} ` +
    `A ${h} ${h} 0 0 ${sweep} ${cap} ${-h} Z`
  );
}

/**
 * Rod and block as one body: square where it slides inside the barrel — it is a
 * cut plane, not a free end — and rounded only on the joint it reaches.
 */
export function rodBodyPath(r: number, reach: number): string {
  const h = CYLINDER.rodHalf * r;
  const inner = -MARK.blockAlongHalf * r * Math.sign(reach || 1);
  const sweep = reach > 0 ? 1 : 0;
  return `M ${inner} ${-h} L ${reach} ${-h} A ${h} ${h} 0 0 ${sweep} ${reach} ${h} L ${inner} ${h} Z`;
}

/** The bore, for the revealed state: the barrel's own slot, cut through it. */
export function borePath(r: number, halfLength: number): string {
  return capsulePath(-halfLength, halfLength, CYLINDER.boreHalf * r);
}

/** The cylinder's welded marker, larger than the general one. */
export function cylinderMarkerPath(r: number): string {
  const a = CYLINDER.markerArm * r;
  const e = CYLINDER.markerExtent * r;
  return (
    `M ${-a} ${-e} H ${a} V ${-a} H ${e} V ${a} H ${a} V ${e} ` +
    `H ${-a} V ${a} H ${-e} V ${-a} H ${-a} Z`
  );
}

/** The driven arrows of a cylinder, flanking its marker. */
export function cylinderArrowPaths(r: number): { line: Segment; head: string }[] {
  return [1, -1].map((side) => ({
    line: {
      x1: side * CYLINDER.arrowTail * r,
      y1: 0,
      x2: side * CYLINDER.arrowHeadBase * r,
      y2: 0,
    },
    head: arrowHeadAt(
      side * CYLINDER.arrowTip * r,
      0,
      side > 0 ? 0 : Math.PI,
      MARK.arrowHeadLength * r,
      CYLINDER.arrowHeadHalf * r
    ),
  }));
}

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

/**
 * The same capsule, placed and turned in the frame the caller is already
 * drawing in, so it can be appended to a link's own path data.
 *
 * That is how the channel becomes a real hole: the carrier is filled even-odd,
 * so a subpath inside it is subtracted, and the carrier's existing stroke then
 * traces the new edge in the carrier's own colour with no second element. A
 * mask would do the same job, but an SVG mask big enough to cover any pan or
 * zoom makes the browser rasterize a surface that size and downsample the whole
 * canvas with it.
 */
export function orientedCapsulePath(
  centre: { x: number; y: number },
  angle: number,
  halfLength: number,
  halfWidth: number
): string {
  const u = { x: Math.cos(angle), y: Math.sin(angle) };
  const n = { x: -u.y, y: u.x };
  const at = (along: number, across: number) =>
    `${centre.x + along * u.x + across * n.x} ${centre.y + along * u.y + across * n.y}`;
  const h = halfWidth;
  return (
    `M ${at(-halfLength, -h)} L ${at(halfLength, -h)} ` +
    `A ${h} ${h} 0 0 1 ${at(halfLength, h)} ` +
    `L ${at(-halfLength, h)} ` +
    `A ${h} ${h} 0 0 1 ${at(-halfLength, -h)} Z`
  );
}

/**
 * A rider as the weld plate redraws it: from the joint outward along `angle`,
 * square where it meets the block so the two read as fused, rounded at the far
 * end concentric on the joint it reaches.
 *
 * Both ends are offset along the rider's own normal. Anchoring the near end on
 * the frame's normal instead draws a wedge tapering from the block to the far
 * joint — a plausible link shape, and not this one.
 */
export function riderCapsulePath(reach: number, halfWidth: number, angle: number): string {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const nx = -sin * halfWidth;
  const ny = cos * halfWidth;
  return (
    `M ${-nx} ${-ny} L ${reach * cos - nx} ${reach * sin - ny} ` +
    `A ${halfWidth} ${halfWidth} 0 0 1 ${reach * cos + nx} ${reach * sin + ny} ` +
    `L ${nx} ${ny} Z`
  );
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
  return arrowHeadAt(x, y, angle, MARK.arrowHeadLength * r, MARK.arrowHeadHalf * r);
}

function arrowHeadAt(x: number, y: number, angle: number, back: number, half: number): string {
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
