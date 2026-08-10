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
 * answered. `GROUND_STROKE` is the single exception, and only because the ground
 * marks are the one place a stroke *is* in model units: the hatch has to know
 * how thick its own line is to sit flush against the rail.
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

  /**
   * Grounded rails and their ground ticks.
   *
   * The rails sit 0.325R clear of the block's own 1.525R half-height. It was
   * 0.45R, which read as a block floating between its rails rather than one
   * held by them — the guide is a close fit, and the drawing should say so.
   */
  railOffset: 1.85,
  railHalfLengthMin: 9.6,
  tickLeg: 0.8,
  tickPitch: 1.3,

  /**
   * How far apart two grounded guides may be and still be drawn as one line.
   *
   * Half a rail's own stroke: closer than that and the two rails cannot be told
   * apart on screen, so drawing them as two crossing members is a fiction.
   */
  railMergeSlack: 0.1,

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
  /** How far the motor body blends into the bar it is welded to. */
  /**
   * The motor's case, and how far it blends into the member it is bolted to.
   * Wider than the bar by enough to leave a shoulder for the fillet to live in
   * -- with no shoulder the fillet has nowhere to go and draws as a spike.
   */
  motorHalf: 2.9,
  pinArcRadius: 1.55,

  /** The welded marker, replacing the circle at 1.47R across. */
  plusArm: 0.22,
  plusExtent: 0.735,
} as const;

/**
 * The two strokes of a grounded mark, in R.
 *
 * `Ground.svg` is placed at 1.2 objectScale and draws its baseline 4/157 of its
 * own width and its hatch 5/157, and R is 0.15 objectScale — so both are fixed
 * multiples of R, and the rail marks are the one place in the app where a
 * stroke is in model units rather than screen pixels. They are stated here, not
 * only in the template, because the hatch geometry has to know its own weight:
 * a round cap is centred on the point it caps, so a tick whose root sits on the
 * rail's centreline puts half its width on the far side of the line.
 */
export const GROUND_STROKE = {
  rail: (1.2 * 4) / 157 / 0.15,
  hatch: (1.2 * 5) / 157 / 0.15,
} as const;

/**
 * The cylinder skin (§2.7). Scoped to the skin: the barrel is deliberately much
 * fatter than the rod, and that heft is what reads as a cylinder body rather
 * than as another bar.
 */
export const CYLINDER = {
  /**
   * The barrel is a body the rod lives inside, so it has to be visibly fatter
   * than the rod along its whole length.
   *
   * This was cut to 1.9 — a quarter over the block's half-height — when the
   * barrel was drawn only as far as the piston. As a short stub behind the
   * block that read as a sleeve; as the full-length bar it now is, at 1.9 the
   * rod's 1.525 sits so close inside it that the two merge into one uniform
   * capsule and the mouth, where one rigid body ends and the other continues,
   * disappears. 2.6 leaves a clear margin of barrel above and below the rod
   * for the whole of the inserted length, which is the cue the whole drawing
   * rests on, without going back to the 2.95 slab.
   */
  barrelHalf: 2.6,
  /**
   * The piston head along the axis, at full size: exactly the block a bare
   * slider wears, because on any ram with room for it that is what it is.
   *
   * It is not always this. The head is what sets the floor on how short a ram
   * can be — it has to fit inside the barrel at full retraction — so on a ram
   * too short to hold the whole block it shrinks to half the barrel instead,
   * and grows back to this the moment there is room. `cylinderHeadHalf` is the
   * one place that choice is made.
   */
  headAlongHalfMax: MARK.blockAlongHalf,
  /**
   * The shortest the head is ever drawn: square, as long as it is across.
   *
   * The real floor on the whole part, and it is a drawing judgement rather than
   * a mechanical one — a head shorter than it is wide stops reading as a head
   * at all, and there is nothing else left holding the size up.
   */
  headAlongHalfMin: MARK.blockAcrossHalf,
  /**
   * Exactly the block's own half-height, so block and rod form one uniform bar.
   * It was 1.84 — the same mockup rounding `barHalf` documents — and the extra
   * 0.315R showed as the rod standing proud of the block above and below where
   * the two meet.
   */
  rodHalf: MARK.blockAcrossHalf,
  // The skin carries no arrow dimensions of its own any more. It had a larger
  // set, sized for the full 3.84 R block it used to draw; the head is shorter
  // than that now, and the honest answer is the block's own arrows scaled by
  // the head — same mark, same proportions, one place to change either.
} as const;

/**
 * The barrel: its own bar, at its own length, rounded on the mount it pivots
 * about and cut square at the mouth the rod slides through.
 *
 * `anchor` and `mouth` are the barrel's two ends in the mark's frame, which is
 * centred on the *pin* with +x toward the rod — so the anchor is behind the
 * piston (negative) and the mouth ahead of it (positive), and the barrel
 * straddles the piston rather than stopping at it.
 *
 * That straddling is the whole point, and it is what this used to get wrong.
 * The barrel was drawn from the piston back to the anchor, so it grew and
 * shrank as the ram cycled: the one part of the assembly that is rigid was the
 * one part visibly changing length, and the stroke was invisible because
 * nothing marked where the bore ended. Drawn at its member length instead, only
 * the *exposed* rod changes, which is what a ram actually does — and how much
 * rod is still inside is the stroke, legible without any annotation.
 */
export function barrelPath(r: number, anchor: number, mouth: number): string {
  const h = CYLINDER.barrelHalf * r;
  return (
    `M ${mouth} ${-h} L ${anchor} ${-h} ` +
    `A ${h} ${h} 0 0 0 ${anchor} ${h} ` +
    `L ${mouth} ${h} Z`
  );
}

/**
 * Rod and block as one body: square where it disappears into the barrel — it is
 * a cut plane, not a free end — and rounded only on the joint it reaches.
 *
 * Drawn over the barrel at the fill alpha every link uses, so the length of it
 * still inside the bore reads as a darker band. One cue, no callout, and it is
 * the cue that carries the whole structure.
 */
export function rodBodyPath(r: number, reach: number, headHalf: number): string {
  const h = CYLINDER.rodHalf * r;
  const inner = -headHalf * Math.sign(reach || 1);
  const sweep = reach > 0 ? 1 : 0;
  return `M ${inner} ${-h} L ${reach} ${-h} A ${h} ${h} 0 0 ${sweep} ${reach} ${h} L ${inner} ${h} Z`;
}

// The skin used to carry two stop notches on the barrel's edges, marking where
// the head bottoms out. The head now stops a visible clearance off the mount at
// one end and clean outside the mouth at the other, so the silhouette says
// where the travel ends and the notches were annotating it twice.

/**
 * The piston head: §2.8 block proportions at the cylinder's own length, square
 * on the side facing the barrel (-x) and rounded only where it reaches toward
 * the rod. The barrel's flat cut ends underneath it, and a rounded corner there
 * drew a sliver of daylight between two parts that are supposed to be flush.
 */
export function cylinderBlockPath(r: number, headHalf: number): string {
  const a = headHalf;
  const c = MARK.blockAcrossHalf * r;
  const k = MARK.blockCorner * r;
  return (
    `M ${-a} ${-c} H ${a - k} A ${k} ${k} 0 0 1 ${a} ${-c + k} ` +
    `V ${c - k} A ${k} ${k} 0 0 1 ${a - k} ${c} H ${-a} Z`
  );
}

// A dotted white line used to run along the blind end of the bore to say "this
// part translates". With the head bottoming out on the barrel's own ends there
// is no blind end left to draw it in at full retraction, and at every other
// position it was a second mark competing with the one that carries the
// structure — how much rod is still inside.

/**
 * The exact outline of the assembled part, for the selection stroke: the
 * barrel's profile from its anchor to its mouth, a sharp step down to the rod,
 * and on to the rod's end. The only curves are the two end caps — a selection
 * is a crisp trace of the silhouette, not a softened echo of it.
 *
 * A step, not a fade: the mouth is where one rigid body ends and another
 * continues, and the outline should say so.
 */
export function cylinderContourPath(
  r: number,
  anchor: number,
  mouth: number,
  rodReach: number
): string {
  const hB = CYLINDER.barrelHalf * r;
  const hR = CYLINDER.rodHalf * r;
  return (
    `M ${mouth} ${-hB} L ${anchor} ${-hB} A ${hB} ${hB} 0 0 0 ${anchor} ${hB} ` +
    `L ${mouth} ${hB} L ${mouth} ${hR} L ${rodReach} ${hR} ` +
    `A ${hR} ${hR} 0 0 0 ${rodReach} ${-hR} L ${mouth} ${-hR} Z`
  );
}

// The skin used to draw a large welded plus at the pin. An atomic cylinder is
// one part — its weld is not an editable fact worth a glyph — so the marker
// is gone and the block reads as the block.

/**
 * The driven arrows of a cylinder, on its piston head.
 *
 * `leading` is the way the head sets off, and that arrow is drawn larger and
 * heavier — the same §4.2b emphasis the unskinned driven mark carries, because
 * the skin changes the drawing, not what the mark has to say.
 *
 * The same arrows a driven block wears, at the size this head has room for.
 * `fit` is the whole difference: on a ram short enough that the head has
 * shrunk, the pair is scaled by the same ratio and keeps the margin the
 * straight arrows already have — at the emphasis factor the larger tip still
 * lands inside the black, which is the only place white is guaranteed to read.
 * On a full-size head it is 1 and these are exactly the block's own arrows.
 *
 * Scaled as a pair, never the emphasised one alone. Bounding only the big
 * arrow is the obvious move and it inverts the emphasis: clamped to the head it
 * came out *smaller* than the arrow it is supposed to be shouting over.
 */
export function cylinderArrowPaths(
  r: number,
  headHalf: number,
  leading?: 1 | -1
): { line: Segment; head: string; emphasised: boolean }[] {
  const fit = headHalf / (MARK.blockAlongHalf * r);
  return [1, -1].map((side) => {
    const emphasised = side === leading;
    const grow = (emphasised ? MARK.arrowEmphasis : 1) * fit;
    return {
      line: {
        x1: side * MARK.arrowTail * r * fit,
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

/**
 * The motor's body: the backing square, welded to the bar it is bolted to.
 *
 * A motor at a joint has a *side*. Its body is fixed to one of the two members
 * and its shaft turns the other, and the drawing should say which — otherwise
 * it reads as a decoration floating over a pin rather than as a part with a
 * job. The square is drawn in the frame of the body it is welded to, running
 * along +x, and the two internal corners where the bar leaves the square are
 * filleted, which is what makes the pair read as one piece rather than as a
 * block resting on a bar.
 *
 * The fillets are quadratic curves pulled toward the corner rather than true
 * circular arcs: identical at any size this is drawn at, and without the
 * sweep-flag arithmetic that a mirrored coordinate system makes so easy to get
 * backwards.
 */
export function motorBodyPath(r: number): string {
  const h = MARK.motorHalf * r;
  // No fillet of its own: the case is unioned into the body it is bolted to,
  // and that union fillets the corner where the two meet. A wedge added here as
  // well is a second fillet on the same corner, which draws as a blister.
  return roundedRect(-h, -h, 2 * h, 2 * h, MARK.blockCorner * 2 * r);
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
  /**
   * Set when this guide lies on the same line as the one being drawn, and is
   * the one of the pair that draws the shared span. Its rails are not something
   * to break for — they are the same rails — so the guide reading it keeps its
   * own solid and only stands out of the way of its hatch.
   */
  coincident?: boolean;
}

/**
 * Whether two guides are the same line, within `slack`.
 *
 * Both of `b`'s ends are measured against `a`'s line, so this is one test for
 * two ways of being apart: a guide offset from `a` fails on both ends, and one
 * turned away from it fails on at least one.
 */
export function collinearGuides(a: GuideBand, b: GuideBand, slack: number): boolean {
  const nx = -Math.sin(a.angle);
  const ny = Math.cos(a.angle);
  const ends = [b.halfLength, -b.halfLength].map((along) => ({
    x: b.x + along * Math.cos(b.angle),
    y: b.y + along * Math.sin(b.angle),
  }));
  return ends.every((end) => Math.abs((end.x - a.x) * nx + (end.y - a.y) * ny) <= slack);
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
 *
 * A guide marked `coincident` is not crossed at all — it is the same line seen
 * twice — so nothing breaks for it and the two draw as one continuous rail.
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
  // Where the tick meets the rail: on the rail's far edge, so its round cap
  // reaches back into the line and stops short of the near edge.
  //
  // This is what `Ground.svg` draws, and the two marks say the same thing about
  // the same world, so they have to look the same. There a hatch stroke starts
  // on the far edge of the baseline and its cap projects back to just past the
  // baseline's middle — hatch and line overlap, with no daylight between them.
  // Rooted on the centreline instead, as this was, the cap hangs half the
  // hatch's width over the block's side and the hatching reads as piercing its
  // own rail; backed off far enough to be tangent to the edge, it reads as
  // floating clear of it. Neither is what a ground symbol looks like.
  const clear = (GROUND_STROKE.rail / 2) * r;
  const whole: Segment[] = [
    { x1: -halfLength, y1: -offset, x2: halfLength, y2: -offset },
    { x1: -halfLength, y1: offset, x2: halfLength, y2: offset },
  ];

  const rails: Segment[] = [];
  const dashedRails: Segment[] = [];
  for (const rail of whole) {
    const inside = mergeIntervals(
      crossings
        .filter((band) => !band.coincident)
        .flatMap((band) => segmentInsideBand(rail, band, place))
    );
    rails.push(...outsideIntervals(rail, inside));
    dashedRails.push(...inside.map(([from, to]) => sliceSegment(rail, from, to)));
  }

  // Ticks step along a lattice fixed to the world rather than to this guide's
  // own midpoint, so two guides sharing a line hatch the same set of stations
  // and one can take over from the other at any point without the pitch
  // stuttering. Hatching says the world is on this side, and it is the world
  // the spacing belongs to.
  const start = -halfLength + leg + clear;
  const phase = worldPhase(place, pitch);
  const ticks: Segment[] = [];
  for (let x = Math.ceil((start + phase) / pitch) * pitch - phase; x <= halfLength; x += pitch) {
    // The station on the guide's own centreline, which is what a coincident
    // guide's reach has to be measured against: compared at the tick's root
    // instead, the two guides' claims overlap by the root's own offset and
    // leave a station hatched by neither.
    const station = place({ x, y: 0 });
    for (const side of [-1, 1]) {
      const tick = {
        x1: x - clear,
        y1: side * (offset + clear),
        x2: x - clear - leg,
        y2: side * (offset + clear + leg),
      };
      // Both ends, not just the root: a tick whose leg reaches into the other
      // guide draws an X across its rail, which is the knot this is avoiding.
      const touches = crossings.some((band) =>
        // A guide on the same line has no strip to fall inside — its rails and
        // this one's are the same two lines — so what has to be avoided is
        // hatching the span it already hatches, twice and out of step.
        band.coincident
          ? withinReach(station, band)
          : pointInBand(place({ x: tick.x1, y: tick.y1 }), band) ||
            pointInBand(place({ x: tick.x2, y: tick.y2 }), band)
      );
      if (touches) continue;
      ticks.push(tick);
    }
  }
  return { rails, dashedRails, ticks };
}

/**
 * Where this guide's midpoint falls between two stations of the world lattice,
 * read off `place` rather than passed in, so the frame the caller is drawing
 * through stays the single source of where the guide is.
 */
function worldPhase(
  place: (point: { x: number; y: number }) => { x: number; y: number },
  pitch: number
): number {
  const origin = place({ x: 0, y: 0 });
  const ahead = place({ x: 1, y: 0 });
  const along = origin.x * (ahead.x - origin.x) + origin.y * (ahead.y - origin.y);
  return ((along % pitch) + pitch) % pitch;
}

/** Within the length a guide runs, whichever side of it the point is on. */
function withinReach(point: { x: number; y: number }, band: GuideBand): boolean {
  const dx = point.x - band.x;
  const dy = point.y - band.y;
  return Math.abs(dx * Math.cos(band.angle) + dy * Math.sin(band.angle)) <= band.halfLength;
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

/**
 * The motor's case, in world coordinates, ready to be unioned with the body it
 * is bolted to.
 *
 * Built here rather than placed by a transform on the element, because the
 * point of it is to become *part of* that body's outline: a Boolean union
 * needs both shapes in the same coordinates, and a case drawn separately and
 * laid on top is exactly the two-shapes-pretending-to-be-one this replaces.
 */
export function motorBodyAt(r: number, centre: { x: number; y: number }, along: number): string {
  const cos = Math.cos(along);
  const sin = Math.sin(along);
  const place = (x: number, y: number) =>
    `${centre.x + x * cos - y * sin} ${centre.y + x * sin + y * cos}`;

  const path = motorBodyPath(r);
  const tokens = path.match(/[MLHVQAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const out: string[] = [];
  let command = '';
  let cursor = { x: 0, y: 0 };
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[MLHVQAZ]$/i.test(token)) {
      command = token.toUpperCase();
      index += 1;
      if (command === 'Z') out.push('Z');
      continue;
    }
    const numbers = (count: number) => tokens.slice(index, index + count).map(Number);
    if (command === 'H' || command === 'V') {
      // A rotation turns an axis line into a sloped one, so it has to come out
      // as an L or the case arrives sheared.
      const [value] = numbers(1);
      cursor = command === 'H' ? { x: value, y: cursor.y } : { x: cursor.x, y: value };
      out.push(`L ${place(cursor.x, cursor.y)}`);
      index += 1;
    } else if (command === 'A') {
      // Circular arcs only, from `roundedRect`: turning them leaves the radii
      // and the flags alone and moves only the endpoint.
      const [rx, ry, rotation, large, sweep, x, y] = numbers(7);
      cursor = { x, y };
      out.push(`A ${rx} ${ry} ${rotation} ${large} ${sweep} ${place(x, y)}`);
      index += 7;
    } else if (command === 'Q') {
      const [cx, cy, x, y] = numbers(4);
      cursor = { x, y };
      out.push(`Q ${place(cx, cy)} ${place(x, y)}`);
      index += 4;
    } else {
      const [x, y] = numbers(2);
      cursor = { x, y };
      out.push(`${command} ${place(x, y)}`);
      index += 2;
    }
  }
  return out.join(' ');
}
