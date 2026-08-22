import { Coord } from 'src/app/model/coord';

/**
 * Sizing the two-bar driver that turns a synthesised four-bar into a six-bar
 * an ordinary motor can run.
 *
 * Three-position synthesis answers "what linkage passes through these poses",
 * not "what linkage can be driven through them". The four-bar it produces is
 * usually a double-rocker: its input pin swings across an arc and stops, so
 * there is no crank on it to attach a motor to. The classical repair is to
 * drive it indirectly — plant a second ground pin, put a fully rotating crank
 * on it, and couple that crank to the four-bar's input pin. One turn of the
 * new crank then walks the four-bar across its arc and back.
 *
 * The sizing is closed-form, which is the whole reason to do it this way
 * rather than by placing the parts near where they look right. Writing D for
 * the distance between the two ground pins, R for the four-bar's input crank,
 * and Δ for the arc its pin has to cover, the driven pin's distance from the
 * new ground is
 *
 *     d(θ)² = D² + R² − 2·D·R·cos(θ − φ)
 *
 * which is largest and smallest exactly where the driver folds straight and
 * doubles back. Setting
 *
 *     coupler + crank = max d       coupler − crank = min d
 *
 * puts those two turning points precisely at the ends of the arc, so a full
 * rotation delivers that swing and no more. Nothing here is fitted or
 * searched; if a dyad is reported, it drives the four-bar.
 */

const TAU = Math.PI * 2;

/** How far past the outermost poses the driver carries the linkage, as a
 *  fraction of the arc between them. Poses sitting exactly at the turning
 *  points would be reached only at dead centre, where the six-bar has no
 *  velocity and drawing it looks like a stall. */
const OVERTRAVEL = 0.08;

/** Beyond this the construction has no room left (see `place`). */
const WIDEST_SWING = (170 * Math.PI) / 180;

/**
 * How far the new ground pin sits from the four-bar's, in input-crank lengths.
 *
 * Free in the sense that any placement outside the swept directions delivers
 * the swing, so it is chosen for the drawing rather than for the mathematics.
 * Closer keeps the machine compact, which matters more than it sounds: three
 * position synthesis can put a four-bar's pivots a long way from the poses, the
 * driver hangs off one of those pivots, and the result is easily several times
 * the size of the region anyone is looking at. It cannot go arbitrarily close —
 * `coupler − crank` shrinks with it, and at zero the driver would fold through
 * its own ground pin and stall there. At this distance even the widest
 * buildable swing leaves that gap at about half the four-bar's crank.
 */
const GROUND_SPACING = 1.5;

export interface DriverDyad {
  /** The new ground pin, which carries the input crank. */
  ground: Coord;
  /** The pin between crank and coupler, placed for the pose the drawing is in. */
  elbow: Coord;
  crankLength: number;
  couplerLength: number;
  /** The swing this dyad delivers, in radians — for reporting, not for solving. */
  swing: number;
}

export type DriverDyadResult = { dyad: DriverDyad } | { refusal: string };

/**
 * The driver for a four-bar whose input pin visits `drivenPin` positions about
 * `pivot`, or the reason there is none.
 *
 * @param pivot      the four-bar's fixed input pin
 * @param drivenPin  where its moving input pin sits at each pose, the first of
 *                   which is the pose the drawing is currently assembled in
 */
export function driverDyadFor(pivot: Coord, drivenPin: Coord[]): DriverDyadResult {
  if (drivenPin.length < 2) {
    return { refusal: 'A driver needs at least two poses to know what swing to deliver.' };
  }

  const radius = distance(pivot, drivenPin[0]);
  if (!(radius > 0)) {
    return { refusal: 'The four-bar has no input crank to drive: its two pins are in one place.' };
  }

  const angles = drivenPin.map((pin) => Math.atan2(pin.y - pivot.y, pin.x - pivot.x));
  const { start, span } = smallestArcContaining(angles);
  if (!(span > 0)) {
    return { refusal: 'These poses need no motion at the input, so there is nothing to drive.' };
  }

  // The ceiling is on the arc the poses themselves ask for. Overtravel is
  // added after it and clamped to what is left, which is what makes the
  // clamping safe -- asked of the swing instead, the two fought: any span wide
  // enough for the clamp to bite came out at exactly WIDEST_SWING and was
  // refused by the very next line, so the real ceiling stood at 170/1.08, and
  // a 160° swing well inside the documented limit was turned away.
  if (span >= WIDEST_SWING) {
    return {
      refusal:
        `The input has to swing ${Math.round((span * 180) / Math.PI)}° between these poses, ` +
        'which is more than a single driver crank can deliver. Moving the middle pose closer ' +
        'to the others, or swapping which pin drives, brings it back in reach.',
    };
  }
  const margin = Math.min((span * OVERTRAVEL) / 2, (WIDEST_SWING - span) / 2);
  const swing = span + 2 * margin;

  const from = start - margin;
  const to = start + span + margin;
  const ground = place(pivot, radius, from, to);

  // The two turning points, by construction the far and near ends of the
  // swing — the arc was placed so that d(θ) climbs the whole way between them.
  const far = distance(ground, on(pivot, radius, from));
  const near = distance(ground, on(pivot, radius, to));
  const crankLength = (far - near) / 2;
  const couplerLength = (far + near) / 2;
  if (!(crankLength > 0) || !(couplerLength > crankLength)) {
    return { refusal: 'No driver crank fits this swing without passing through its own ground.' };
  }

  // The elbow for the pose actually on the drawing, which is somewhere inside
  // the swing rather than at either end, so it has to be intersected for.
  const elbow = elbowAt(ground, crankLength, drivenPin[0], couplerLength);
  if (elbow === undefined) {
    return { refusal: 'The driver cannot be assembled in the pose the linkage is drawn in.' };
  }

  return { dyad: { ground, elbow, crankLength, couplerLength, swing } };
}

/**
 * Where to plant the new ground pin.
 *
 * d(θ) rises and falls once per turn, with its turning points on the line
 * through the two ground pins. Put that line anywhere the input pin actually
 * travels and the pin would reverse mid-swing — the driver would reach an end
 * of its stroke partway along, and the four-bar would never see the rest. Both
 * ends of the line have to miss the swept arc, and since they are half a turn
 * apart, the arc has to be under half a turn for any placement to exist.
 *
 * Of the placements that work, this takes the middle of the clear run just past
 * the arc's end: the furthest from either edge, so rounding cannot land the
 * turning point inside the swing.
 */
function place(pivot: Coord, radius: number, from: number, to: number): Coord {
  const clearance = Math.PI - (to - from);
  const direction = to + clearance / 2;
  return new Coord(
    pivot.x + GROUND_SPACING * radius * Math.cos(direction),
    pivot.y + GROUND_SPACING * radius * Math.sin(direction)
  );
}

/**
 * The elbow pin: `crank` from the ground, `coupler` from the driven pin.
 *
 * Two such points exist — the driver's two assembly modes, mirrored across the
 * line between those pins. They deliver the same motion, so this takes the
 * left-hand one and says so, rather than leaving the choice to the sign that
 * happens to come out of the square root.
 */
function elbowAt(ground: Coord, crank: number, driven: Coord, coupler: number): Coord | undefined {
  const span = distance(ground, driven);
  if (span === 0 || span > crank + coupler || span < Math.abs(coupler - crank)) {
    return undefined;
  }
  const along = (span * span + crank * crank - coupler * coupler) / (2 * span);
  const across = Math.sqrt(Math.max(0, crank * crank - along * along));
  const ux = (driven.x - ground.x) / span;
  const uy = (driven.y - ground.y) / span;
  return new Coord(ground.x + along * ux - across * uy, ground.y + along * uy + across * ux);
}

/** The point at `angle` on the circle of `radius` about `centre`. */
function on(centre: Coord, radius: number, angle: number): Coord {
  return new Coord(centre.x + radius * Math.cos(angle), centre.y + radius * Math.sin(angle));
}

function distance(a: Coord, b: Coord): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * The shortest arc holding every angle: found as the complement of the widest
 * empty gap between neighbours, which is the one stretch nothing has to cross.
 */
/**
 * The shortest arc that contains every one of the given directions.
 *
 * Found by looking for the widest gap between them and taking what is left:
 * the answer wraps, so it cannot be had from the smallest and largest values.
 * Angles in radians; the arc runs from `start` for `span`.
 */
export function smallestArcContaining(angles: number[]): { start: number; span: number } {
  const sorted = angles.map((angle) => ((angle % TAU) + TAU) % TAU).sort((a, b) => a - b);
  let widest = -1;
  let after = 0;
  for (let i = 0; i + 1 < sorted.length; i++) {
    const gap = sorted[i + 1] - sorted[i];
    if (gap > widest) {
      widest = gap;
      after = i + 1;
    }
  }
  // The wrap from the last angle back to the first, measured directly rather
  // than modulo a turn: poses that all sit at one angle leave the whole circle
  // empty, and a modulo reads that as no gap at all -- which came back as an
  // arc of a full turn, and refused three identical poses for asking the input
  // to swing 360° instead of for asking it to stand still.
  const wrap = TAU - (sorted[sorted.length - 1] - sorted[0]);
  if (wrap > widest) {
    widest = wrap;
    after = 0;
  }
  return { start: sorted[after], span: TAU - widest };
}
