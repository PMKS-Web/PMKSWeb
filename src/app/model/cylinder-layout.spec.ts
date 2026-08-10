import './joint';
import {
  cylinderHeadHalf,
  cylinderLock,
  cylinderMinimumSpan,
  HEAD_CLEARANCE_R,
  MIN_STROKE_R,
  cylinderMembers,
  cylinderSpanLayout,
  cylinderSpanRange,
  cylinderStroke,
  cylinderStrokeAlong,
  layoutCylinder,
  poseFromStrokeAndStart,
} from './cylinder';
import { CYLINDER } from './joint-marks';

// The parametric drag: pose first, then size. Inside the ram's own travel only
// the piston moves and the ram keeps the size it was given; push past a stop and
// the ram resizes with barrel and rod staying equal. Collinearity holds by
// construction, the anchor mount never moves.
//
// This replaces the flexbox rule, where the barrel absorbed a span change first
// up to a ceiling and the rod then grew without bound. Nothing about that
// survives — under barrel = rod there is no split left to negotiate — so those
// tests are gone rather than adapted.

const R = 0.15;
// barrel = stroke + CLEARANCE, span = stroke(1 + start) + LOCK, and
// LOCK = 2 * CLEARANCE + the head's half-length.
const BORE = HEAD_CLEARANCE_R * R;
/** The lock at any stroke long enough for a full-size head, which all of these are. */
const LOCK = cylinderLock(40, R);
const HEAD_HALF = CYLINDER.headAlongHalfMax * R;
const MIN_STROKE = MIN_STROKE_R * R;
/** The floor ram's span. Its head has shrunk to fit, so it carries its own lock. */
const SPAN_MIN = cylinderMinimumSpan(R);

const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.hypot(q.x - p.x, q.y - p.y);

const cross = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  p: { x: number; y: number }
) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);

/** A cylinder of this stroke, laid along +x from the origin, dragged to `span`. */
const drag = (stroke: number, span: number) =>
  layoutCylinder({ x: 0, y: 0 }, { x: span, y: 0 }, stroke + BORE, R, 'barrel')!;

describe('the cylinder is one size number and one position number', () => {
  it('makes barrel and rod equal at every size', () => {
    for (const stroke of [MIN_STROKE, 1, 3, 40]) {
      const members = cylinderMembers(stroke, 0.5, R);
      expect(members.barrel).toBeCloseTo(members.rod, 12);
      expect(members.barrel).toBeCloseTo(stroke + BORE, 12);
    }
  });

  it('spends exactly the clearance, and nothing else, out of the barrel', () => {
    // The head runs from a clearance off the mount to the mouth, so the barrel
    // is the stroke plus that one gap -- the only reason the stroke is not the
    // whole barrel.
    expect(cylinderStroke(5 + BORE, R)).toBeCloseTo(5, 12);
    expect(cylinderStroke(BORE, R)).toBe(0);
    expect(cylinderStroke(BORE / 2, R)).toBe(0);
  });

  it('reads retracted and extended off the stroke alone', () => {
    const { retracted, extended } = cylinderSpanRange(4, R);
    expect(retracted).toBeCloseTo(4 + LOCK, 12);
    expect(extended).toBeCloseTo(8 + LOCK, 12);
    // Extension approaches 2x for a long ram and is much less for a short one:
    // the ceiling the equality buys, and the reason more reach means a link.
    expect(extended / retracted).toBeLessThan(2);
  });

  it('lands the span exactly where the size and position say', () => {
    for (const start of [0, 0.25, 1]) {
      const members = cylinderMembers(6, start, R);
      expect(members.span).toBeCloseTo(6 * (1 + start) + LOCK, 12);
    }
  });
});

describe('the stroke interval', () => {
  it('runs the head from a clearance off the mount to clean outside the mouth', () => {
    // Both bounds are the pin, so both carry the head's half-length: the low
    // one is the clearance plus it, and the high one runs *past* the barrel by
    // it, because fully open the head has left the barrel entirely.
    const { min, max, usable } = cylinderStrokeAlong(9 + BORE, R);
    expect(usable).toBe(true);
    expect(min - HEAD_HALF).toBeCloseTo(BORE, 12);
    expect(max - HEAD_HALF).toBeCloseTo(9 + BORE, 12);
    expect(max - min).toBeCloseTo(9, 12);
  });

  it('collapses to one point rather than inverting when the barrel is under its clearance', () => {
    // Object Scale can walk a legal barrel under the clearance at any moment,
    // and every caller clamps or samples against this interval -- handed
    // max < min they would each silently do something different.
    const under = cylinderStrokeAlong(BORE / 2, R);
    expect(under.usable).toBe(false);
    expect(under.min).toBe(under.max);
    expect(under.min).toBeCloseTo(BORE / 4 + cylinderHeadHalf(BORE / 2, R), 12);
  });

  it('calls a barrel with less than the floor stroke unusable too', () => {
    expect(cylinderStrokeAlong(BORE + MIN_STROKE / 2, R).usable).toBe(false);
    expect(cylinderStrokeAlong(BORE + MIN_STROKE * 1.01, R).usable).toBe(true);
  });
});

describe('dragging a mount: pose first, then size', () => {
  it('moves only the piston while the span is inside the travel', () => {
    const stroke = 5;
    const { retracted, extended } = cylinderSpanRange(stroke, R);
    for (const span of [retracted, (retracted + extended) / 2, extended]) {
      const pose = drag(stroke, span);
      // The size the ram was given, untouched.
      expect(dist(pose.barrelFar, pose.barrelNear)).toBeCloseTo(stroke + BORE, 9);
      // And the mount exactly where the cursor put it.
      expect(pose.rodFar.x).toBeCloseTo(span, 9);
    }
  });

  it('grows the ram past fully extended, at half the speed of the mount', () => {
    const stroke = 5;
    const { extended } = cylinderSpanRange(stroke, R);
    const pulled = 3;
    const pose = drag(stroke, extended + pulled);

    // Both halves grow, so the mount travels twice as far as the stroke does.
    expect(cylinderStroke(dist(pose.barrelFar, pose.barrelNear), R)).toBeCloseTo(
      stroke + pulled / 2,
      9
    );
    expect(pose.rodFar.x).toBeCloseTo(extended + pulled, 9);
  });

  it('shrinks the ram past fully retracted, one for one with the mount', () => {
    const stroke = 5;
    const { retracted } = cylinderSpanRange(stroke, R);
    const pushed = 2;
    const pose = drag(stroke, retracted - pushed);

    expect(cylinderStroke(dist(pose.barrelFar, pose.barrelNear), R)).toBeCloseTo(
      stroke - pushed,
      9
    );
    expect(pose.rodFar.x).toBeCloseTo(retracted - pushed, 9);
  });

  it('stops at the floor rather than making a degenerate part', () => {
    const pose = drag(5, 0.001);

    expect(cylinderStroke(dist(pose.barrelFar, pose.barrelNear), R)).toBeCloseTo(MIN_STROKE, 9);
    expect(dist(pose.barrelFar, pose.rodFar)).toBeCloseTo(SPAN_MIN, 9);
  });

  it('is non-destructive for any drag that stays inside the travel', () => {
    // The whole argument for pose-before-size: a ram you sized cannot be
    // resized by accident, only by deliberately pushing past its own stop.
    const stroke = 7;
    const { retracted, extended } = cylinderSpanRange(stroke, R);
    for (let i = 0; i <= 20; i++) {
      const span = retracted + ((extended - retracted) * i) / 20;
      expect(cylinderSpanLayout(span, stroke, R).stroke).toBeCloseTo(stroke, 9);
    }
  });

  it('round-trips: the span it reports is the span it was asked for', () => {
    for (const span of [SPAN_MIN, 4, 9, 30]) {
      expect(cylinderSpanLayout(span, 5, R).span).toBeCloseTo(Math.max(span, SPAN_MIN), 9);
    }
  });
});

describe('layoutCylinder, in the plane', () => {
  it('puts every joint exactly on the mount-to-mount axis', () => {
    const pose = layoutCylinder({ x: 1, y: 2 }, { x: 5.3, y: 6.1 }, 3 + BORE, R, 'barrel')!;

    for (const point of [pose.barrelNear, pose.pin]) {
      expect(Math.abs(cross(pose.barrelFar, pose.rodFar, point))).toBeLessThan(1e-9);
    }
  });

  it('holds the anchor mount exactly still', () => {
    const barrelMount = { x: 1.25, y: -0.75 };
    const rodMount = { x: 7, y: 3 };

    expect(layoutCylinder(barrelMount, rodMount, 2 + BORE, R, 'barrel')!.barrelFar).toEqual(
      barrelMount
    );
    expect(layoutCylinder(barrelMount, rodMount, 2 + BORE, R, 'rod')!.rodFar).toEqual(rodMount);
  });

  it('rotates rigidly about the anchor as the dragged mount swings', () => {
    const anchor = { x: 2, y: 1 };
    const flat = layoutCylinder(anchor, { x: 8, y: 1 }, 3 + BORE, R, 'barrel')!;
    const swung = layoutCylinder(anchor, { x: 2, y: 7 }, 3 + BORE, R, 'barrel')!;

    expect(dist(swung.barrelFar, swung.rodFar)).toBeCloseTo(dist(flat.barrelFar, flat.rodFar), 9);
    expect(dist(swung.barrelNear, swung.pin)).toBeCloseTo(dist(flat.barrelNear, flat.pin), 9);
    expect(swung.barrelFar).toEqual(anchor);
  });

  it('holds the axis instead of flipping when a drag crosses the anchor', () => {
    const pose = layoutCylinder({ x: 0, y: 0 }, { x: -5, y: 0 }, 3 + BORE, R, 'barrel', {
      x: 1,
      y: 0,
    })!;

    expect(pose.rodFar.x).toBeCloseTo(SPAN_MIN, 9);
    expect(pose.rodFar.x).toBeGreaterThan(0);
  });

  it('declines coincident mounts with no axis hint', () => {
    expect(layoutCylinder({ x: 1, y: 1 }, { x: 1, y: 1 }, 3 + BORE, R, 'barrel')).toBeUndefined();
  });
});

describe('poseFromStrokeAndStart: the edit the span rule cannot express', () => {
  it('changes the size while holding the position', () => {
    // The bug this exists to prevent: at start 0.5 a stroke of 12 spans
    // 18 + LOCK, which lies inside the *old* stroke-10 travel [10, 20] + LOCK.
    // Routed through the span rule, a field labelled Travel would have held the
    // size at 10 and moved the piston to 80% instead.
    const asked = poseFromStrokeAndStart({ x: 0, y: 0 }, 0, 12, 0.5, R);
    expect(cylinderStroke(dist(asked.barrelFar, asked.barrelNear), R)).toBeCloseTo(12, 9);

    const viaSpan = cylinderSpanLayout(dist(asked.barrelFar, asked.rodFar), 10, R);
    expect(viaSpan.stroke).toBeCloseTo(10, 9);
    expect(viaSpan.start).toBeCloseTo(0.8, 9);
  });

  it('holds the barrel mount and moves the rod mount', () => {
    const mount = { x: 3, y: -2 };
    const pose = poseFromStrokeAndStart(mount, Math.PI / 3, 6, 0.25, R);

    expect(pose.barrelFar).toEqual(mount);
    expect(dist(pose.barrelFar, pose.rodFar)).toBeCloseTo(6 * 1.25 + LOCK, 9);
  });

  it('clamps a start outside the travel and a stroke under the floor', () => {
    const over = poseFromStrokeAndStart({ x: 0, y: 0 }, 0, 4, 3, R);
    expect(dist(over.barrelFar, over.rodFar)).toBeCloseTo(cylinderSpanRange(4, R).extended, 9);

    const tiny = poseFromStrokeAndStart({ x: 0, y: 0 }, 0, -1, 0.5, R);
    expect(cylinderStroke(dist(tiny.barrelFar, tiny.barrelNear), R)).toBeCloseTo(MIN_STROKE, 9);
  });
});
