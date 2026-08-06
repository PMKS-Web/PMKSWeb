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
 *
 * Stroke widths are the one thing not in R, and deliberately so. Every stroke in
 * the app — grid lines, axes, link outlines, the Phase 1 snap rings — goes
 * through `scaleWithZoom`, which divides by the zoom so a line keeps a constant
 * width on screen; a hairline that scaled with the geometry would disappear when
 * zoomed out and turn into a slab when zoomed in. The R rule is about how big
 * things are, and how thick you draw their edges is a question the app already
 * answered. There are deliberately no stroke constants below, so nothing here
 * implies a rule the drawing does not follow.
 */

/** Every dimension of the mark system, in multiples of R. */
export const MARK = {
  /** Block: 7.68R along the slot by 3.05R across, corner 0.34R. */
  blockAlongHalf: 3.84,
  blockAcrossHalf: 1.525,
  blockCorner: 0.34,

  /** Channel: a 2.3R window subtracted from the carrier, outlined in its colour. */
  channelHalfWidth: 1.15,

  /**
   * Half a link bar, which is `objectScale / 4` and therefore exactly 5/3 R.
   *
   * The design package rounded this to 1.84 off a mockup, and 1.84 is 10% wider
   * than the bars the app actually draws. Everything derived from it inherited
   * that error: the weld plate, which redraws a rider, stood proud of the rider
   * all the way round as a pale halo, and it is the one number here that is not
   * free to be chosen — it belongs to the link drawing, not to this system.
   */
  barHalf: 5 / 3,

  /**
   * Fillet radius where the weld plate fuses a rider to its block. The same
   * radius `buildCompoundPath` softens a welded compound link with, because it
   * is the same join being drawn.
   */
  plateFillet: 5 / 3,

  /** Grounded rails and their ground ticks. */
  railOffset: 1.975,
  railHalfLengthMin: 9.6,
  tickLeg: 0.8,
  tickPitch: 1.3,

  /** The plate that welds a rider to its block — visual only. */
  fillet: 1.25,

  /**
   * A slot stops short of the joints that define it, leaving a visible margin
   * of bar between the end of the channel and the joint it stops short of.
   *
   * At 1.8R the channel's end cap landed 0.27 objectScale from the joint centre
   * and the joint's own circle is 0.2 — the two touched, and the bar read as
   * cut through rather than slotted. 2.8R clears the circle by most of its own
   * radius, which is the margin the reference drawing shows.
   */
  slotInset: 2.8,

  /** Driven overlay. Always white, which the black block underneath guarantees. */
  arrowTail: 1.4,
  arrowHeadBase: 2.6,
  arrowTip: 3.0,
  arrowHeadLength: 0.74,
  arrowHeadHalf: 0.46,
  /** How much larger the arrow the block sets off along is drawn. */
  arrowEmphasis: 1.25,

  /** A driven floating pin has no block, so the overlay brings its own backing. */
  pinBackingHalf: 2.2,
  pinArcRadius: 1.55,

  /** The welded marker, replacing the circle at 1.47R across. */
  plusArm: 0.22,
  plusExtent: 0.735,
} as const;

/**
 * The cylinder skin (§2.7). Scoped to the skin: the barrel is deliberately much
 * fatter than the rod, and that heft is what reads as a cylinder body rather
 * than as another bar.
 */
export const CYLINDER = {
  /**
   * Was 2.95 — nearly twice the block. The redesign reads the barrel as a
   * sleeve just proud of the block rather than a fat body: a quarter over the
   * block's half-height keeps the step visible without the bulk.
   */
  barrelHalf: 1.9,
  /**
   * Exactly the block's own half-height, so block and rod form one uniform bar.
   * It was 1.84 — the same mockup rounding `barHalf` documents — and the extra
   * 0.315R showed as the rod standing proud of the block above and below where
   * the two meet.
   */
  rodHalf: MARK.blockAcrossHalf,
  /** Where the barrel stops: inside the block, so the rod visibly enters it. */
  flatCut: 0.56,
  boreHalf: 1.39,
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

/**
 * The block of the collapsed skin: §2.8 block proportions, but square on the
 * side facing the barrel (-x) and rounded only where it reaches toward the rod.
 * The barrel's flat cut ends underneath it, and a rounded corner there drew a
 * sliver of daylight between two parts that are supposed to be flush.
 */
export function cylinderBlockPath(r: number): string {
  const a = MARK.blockAlongHalf * r;
  const c = MARK.blockAcrossHalf * r;
  const k = MARK.blockCorner * r;
  return (
    `M ${-a} ${-c} H ${a - k} A ${k} ${k} 0 0 1 ${a} ${-c + k} ` +
    `V ${c - k} A ${k} ${k} 0 0 1 ${a - k} ${c} H ${-a} Z`
  );
}

/** The bore, for the revealed state: the barrel's own slot, cut through it. */
export function borePath(r: number, halfLength: number): string {
  return capsulePath(-halfLength, halfLength, CYLINDER.boreHalf * r);
}

/**
 * The dotted line inside the barrel that says "this part translates": from
 * just clear of the barrel mount's pin to just short of the block. Drawn
 * white at half opacity over the barrel fill, sized in R so it scales with
 * the part like every other mark.
 */
export function cylinderMotionDash(
  r: number,
  barrelReach: number
): { x1: number; x2: number; width: number; dashArray: string } {
  return {
    x1: barrelReach + 2.3 * r,
    x2: -MARK.blockAlongHalf * r - 0.55 * r,
    width: 0.2 * r,
    dashArray: `${0.55 * r} ${0.42 * r}`,
  };
}

/**
 * The exact outline of the assembled part, for the selection stroke: the
 * barrel's profile to its flat cut, a sharp step down to the block-and-rod
 * bar, and on to the rod's end. The only curves are the two end caps — a
 * selection is a crisp trace of the silhouette, not a softened echo of it.
 */
export function cylinderContourPath(r: number, barrelReach: number, rodReach: number): string {
  const hB = CYLINDER.barrelHalf * r;
  const hR = CYLINDER.rodHalf * r;
  const cut = CYLINDER.flatCut * MARK.blockAlongHalf * r;
  return (
    `M ${cut} ${-hB} L ${barrelReach} ${-hB} A ${hB} ${hB} 0 0 0 ${barrelReach} ${hB} ` +
    `L ${cut} ${hB} L ${cut} ${hR} L ${rodReach} ${hR} ` +
    `A ${hR} ${hR} 0 0 0 ${rodReach} ${-hR} L ${cut} ${-hR} Z`
  );
}

// The skin used to draw a large welded plus at the pin. An atomic cylinder is
// one part — its weld is not an editable fact worth a glyph — so the marker
// is gone and the block reads as the block.

/**
 * The driven arrows of a cylinder, flanking its marker.
 *
 * `leading` is the way the block sets off, and that arrow is drawn larger and
 * heavier — the same §4.2b emphasis the unskinned driven mark carries, because
 * the skin changes the drawing, not what the mark has to say.
 */
export function cylinderArrowPaths(
  r: number,
  leading?: 1 | -1
): { line: Segment; head: string; emphasised: boolean }[] {
  return [1, -1].map((side) => {
    const emphasised = side === leading;
    // Bounded by the block, like the straight arrows: the cylinder's arrows are
    // already larger, so the full 1.25 would push the tip past blockAlongHalf
    // and out onto the rod, where white is no longer guaranteed to read.
    const grow = emphasised
      ? Math.min(MARK.arrowEmphasis, (MARK.blockAlongHalf * 0.97) / CYLINDER.arrowTip)
      : 1;
    return {
      line: {
        x1: side * CYLINDER.arrowTail * r,
        y1: 0,
        x2: side * CYLINDER.arrowHeadBase * r * grow,
        y2: 0,
      },
      head: arrowHeadAt(
        side * CYLINDER.arrowTip * r * grow,
        0,
        side > 0 ? 0 : Math.PI,
        MARK.arrowHeadLength * r * grow,
        CYLINDER.arrowHeadHalf * r * grow
      ),
      emphasised,
    };
  });
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
 * The strip a guide occupies: everything between its two rails, for the length
 * they run. Used to work out where two guides cross each other.
 */
export interface GuideBand {
  x: number;
  y: number;
  angle: number;
  halfLength: number;
  halfWidth: number;
}

/**
 * The two rails of a grounded guide and the ground ticks hanging off them.
 *
 * Returned in the slot's own frame, so the caller rotates the whole group to
 * the slot angle. The ticks lean one way regardless of that angle: hatching
 * marks "the world is on this side", and the world does not rotate.
 *
 * `crossings` are the other guides on the canvas, in world coordinates, with
 * `place` mapping this guide's local frame into that world. Where a rail runs
 * through another guide's strip it is handed back as `dashedRails` instead, and
 * the ticks in that strip are dropped: two guides drawn solid straight through
 * each other paint an X-shaped knot with no reading at all, whereas a broken
 * line is the drawing convention for the member that passes behind.
 */
export function railGeometry(
  r: number,
  halfLength: number,
  crossings: GuideBand[] = [],
  place: (point: { x: number; y: number }) => { x: number; y: number } = (point) => point
): { rails: Segment[]; dashedRails: Segment[]; ticks: Segment[] } {
  const offset = MARK.railOffset * r;
  const leg = MARK.tickLeg * r;
  const pitch = MARK.tickPitch * r;
  const whole: Segment[] = [
    { x1: -halfLength, y1: -offset, x2: halfLength, y2: -offset },
    { x1: -halfLength, y1: offset, x2: halfLength, y2: offset },
  ];

  const rails: Segment[] = [];
  const dashedRails: Segment[] = [];
  for (const rail of whole) {
    const inside = mergeIntervals(
      crossings.flatMap((band) => segmentInsideBand(rail, band, place))
    );
    rails.push(...outsideIntervals(rail, inside));
    dashedRails.push(...inside.map(([from, to]) => sliceSegment(rail, from, to)));
  }

  const ticks: Segment[] = [];
  for (let x = -halfLength + leg; x <= halfLength; x += pitch) {
    for (const side of [-1, 1]) {
      const tick = { x1: x, y1: side * offset, x2: x - leg, y2: side * (offset + leg) };
      // Both ends, not just the root: a tick whose leg reaches into the other
      // guide draws an X across its rail, which is the knot this is avoiding.
      const touches = crossings.some(
        (band) =>
          pointInBand(place({ x: tick.x1, y: tick.y1 }), band) ||
          pointInBand(place({ x: tick.x2, y: tick.y2 }), band)
      );
      if (touches) continue;
      ticks.push(tick);
    }
  }
  return { rails, dashedRails, ticks };
}

function pointInBand(point: { x: number; y: number }, band: GuideBand): boolean {
  const dx = point.x - band.x;
  const dy = point.y - band.y;
  const cos = Math.cos(band.angle);
  const sin = Math.sin(band.angle);
  return (
    Math.abs(dx * cos + dy * sin) <= band.halfLength &&
    Math.abs(-dx * sin + dy * cos) <= band.halfWidth
  );
}

/**
 * The parameter interval of `segment` that lies inside `band`, or nothing.
 * Clipped against the band's four edges in the band's own frame, which is the
 * whole of what makes a rotated rectangle convex.
 */
function segmentInsideBand(
  segment: Segment,
  band: GuideBand,
  place: (point: { x: number; y: number }) => { x: number; y: number }
): [number, number][] {
  const start = place({ x: segment.x1, y: segment.y1 });
  const end = place({ x: segment.x2, y: segment.y2 });
  const cos = Math.cos(band.angle);
  const sin = Math.sin(band.angle);
  const local = (point: { x: number; y: number }) => ({
    x: (point.x - band.x) * cos + (point.y - band.y) * sin,
    y: -(point.x - band.x) * sin + (point.y - band.y) * cos,
  });
  const from = local(start);
  const to = local(end);
  let low = 0;
  let high = 1;
  const clip = (position: number, delta: number, limit: number): boolean => {
    // position + t * delta <= limit
    if (Math.abs(delta) < 1e-12) return position <= limit;
    const t = (limit - position) / delta;
    if (delta > 0) high = Math.min(high, t);
    else low = Math.max(low, t);
    return true;
  };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const inside =
    clip(from.x, dx, band.halfLength) &&
    clip(-from.x, -dx, band.halfLength) &&
    clip(from.y, dy, band.halfWidth) &&
    clip(-from.y, -dy, band.halfWidth);
  return inside && high - low > 1e-9 ? [[low, high]] : [];
}

function mergeIntervals(intervals: [number, number][]): [number, number][] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [from, to] of sorted) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

function outsideIntervals(segment: Segment, inside: [number, number][]): Segment[] {
  const pieces: Segment[] = [];
  let cursor = 0;
  for (const [from, to] of inside) {
    if (from - cursor > 1e-9) pieces.push(sliceSegment(segment, cursor, from));
    cursor = to;
  }
  if (1 - cursor > 1e-9) pieces.push(sliceSegment(segment, cursor, 1));
  return pieces;
}

function sliceSegment(segment: Segment, from: number, to: number): Segment {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  return {
    x1: segment.x1 + dx * from,
    y1: segment.y1 + dy * from,
    x2: segment.x1 + dx * to,
    y2: segment.y1 + dy * to,
  };
}

/**
 * The straight arrows of a driven slider: one each way along the slot, clear
 * of the block's centre so the marker sits between them.
 *
 * `leading` is the way the block sets off, as a sign along the slot. That arrow
 * is drawn larger, because two identical arrows say only "this one translates"
 * — they cannot say which way, which is the one thing a driven mark exists to
 * tell you. Pass nothing where the direction is not known and both are equal.
 */
export function straightArrowPaths(
  r: number,
  leading?: 1 | -1
): { line: Segment; head: string; emphasised: boolean }[] {
  return [1, -1].map((side) => {
    const emphasised = side === leading;
    // Bounded by the block: at the emphasis factor the tip still lands inside
    // blockAlongHalf, so the arrow grows without breaking out of its own block.
    const grow = emphasised ? MARK.arrowEmphasis : 1;
    return {
      line: {
        x1: side * MARK.arrowTail * r,
        y1: 0,
        x2: side * MARK.arrowHeadBase * r * grow,
        y2: 0,
      },
      head: arrowHeadAt(
        side * MARK.arrowTip * r * grow,
        0,
        side > 0 ? 0 : Math.PI,
        MARK.arrowHeadLength * r * grow,
        MARK.arrowHeadHalf * r * grow
      ),
      emphasised,
    };
  });
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
