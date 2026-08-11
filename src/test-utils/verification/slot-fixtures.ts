import { MechanismFixture } from './fixture';
import { cylinderSpanLayoutFrom } from '../../app/model/cylinder';

// The Phase 2 mechanisms, in one place so the specs that assert on them and the
// gallery that publishes them as URLs cannot drift apart. See
// docs/joint-types-plan.md §4.1 for what each case is meant to isolate.

// A fixture is written in objectScale units — that is what makes the same
// numbers work both as a direct model build at `scale = MODEL_SCALE` and as a
// URL at `scale = 1`, since one objectScale is one user unit. R is
// 0.15 objectScale, so every model helper below is called at that R.

/**
 * The interior of a cylinder spanning two fixed mounts.
 *
 * Barrel and rod are the same length, always, so a cylinder is one size number
 * and one position number and its two interior joints are not free — given the
 * mounts and where in its travel the part sits, there is exactly one place each
 * can be. Deriving them here rather than typing them means a fixture cannot
 * drift out of the invariant, and that changing the bore re-derives every
 * mechanism in this file instead of silently invalidating it.
 *
 * `start` is where the piston sits in its own travel: 0 fully retracted, 1
 * fully extended. It sets how much of the span is stroke and how much is body,
 * and therefore how far the part can move either way — but not the pose. The
 * mounts do not move, so the mechanism at t = 0 is exactly the one that was
 * drawn whatever `start` is chosen.
 */
export function cylinderBetween(
  mount: { x: number; y: number },
  driven: { x: number; y: number },
  start: number
): {
  barrelEnd: { x: number; y: number };
  pin: { x: number; y: number };
  stroke: number;
  barrel: number;
  /** The pin's distance from the barrel's mount, which is what a slot bounds. */
  pinAlong: number;
} {
  const span = Math.hypot(driven.x - mount.x, driven.y - mount.y);
  // Inverted through the model's own span rule: the body length a span carries
  // is not a constant, because the head shrinks on a ram too short to hold it.
  const { stroke, barrel, pinAlong } = cylinderSpanLayoutFrom(span, start, 0.15);
  const at = (distance: number) => ({
    x: mount.x + ((driven.x - mount.x) * distance) / span,
    y: mount.y + ((driven.y - mount.y) * distance) / span,
  });
  return { barrelEnd: at(barrel), pin: at(pinAlong), stroke, barrel, pinAlong };
}

export const CRANK = 1;
/** Ground offset between the crank pivot and the lever pivot. */
export const OFFSET = 3;
export const LEVER = 5;
export const INPUT_SPEED = 1;
/** Crank angle at t = 0, chosen so the lever starts clear of the crank. */
export const START_ANGLE = Math.PI / 2;

/** Whitworth proportions: crank longer than the ground offset, so the lever spins. */
export const WHITWORTH_CRANK = 3;
export const WHITWORTH_OFFSET = 1;

/**
 * Inverted slider-crank, also read as the oscillating cylinder: crank AB drives
 * a block riding in a slot along the grounded lever CD.
 *
 * D is placed on the ray from the lever pivot through the crank pin, which is
 * what makes the slot pass through the block at t = 0 — a linkage that does not
 * start assembled has no solution to check against.
 */
export function invertedSliderCrankFixture(
  offset: number = OFFSET,
  crank: number = CRANK
): MechanismFixture {
  const bx = crank * Math.cos(START_ANGLE);
  const by = crank * Math.sin(START_ANGLE);
  const span = Math.hypot(bx - offset, by);
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: bx, y: by },
      { id: 'C', x: offset, y: 0, ground: true },
      { id: 'D', x: offset + (LEVER * (bx - offset)) / span, y: (LEVER * by) / span },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }],
    sliders: [{ at: 'B', prisId: 'P', on: { carrier: 'CD', a: 'C', b: 'D' } }],
    inputAngVel: INPUT_SPEED,
  };
}

/** Where the lever tip sits at t = 0 for the default proportions. */
export const LEVER_TIP: [number, number] = (() => {
  const fixture = invertedSliderCrankFixture();
  const d = fixture.joints.find((joint) => joint.id === 'D')!;
  return [d.x, d.y];
})();

/** The same linkage carrying a load at the lever tip, for the force case. */
export function loadedInvertedSliderCrankFixture(): MechanismFixture {
  return {
    ...invertedSliderCrankFixture(),
    load: { onLink: 'CD', at: LEVER_TIP, vector: [0, -10] },
  };
}

// --- Forward direction -----------------------------------------------------

export const COUPLER = 3;
export const ROCKER = 3;
export const GROUND = 4;
/** Ground pivot of the lever whose pin rides in the coupler's slot. */
export const LEVER_PIVOT: [number, number] = [2, 0.5];
export const RIDER_LEVER = 2;

/** Coupler pin C at the starting crank angle: circle(B, coupler) ∩ circle(D, rocker). */
export const START_C: [number, number] = (() => {
  const midX = (CRANK + GROUND) / 2;
  const half = (GROUND - CRANK) / 2;
  return [midX, Math.sqrt(COUPLER * COUPLER - half * half)];
})();

/**
 * The rider starts on the coupler line at exactly `RIDER_LEVER` from its pivot,
 * because a slot must pass through the block and the lever must be its stated
 * length.
 *
 * The pivot and lever length are chosen so the lever's circle always reaches the
 * coupler line — the line's farthest approach to that pivot over a full
 * revolution is about 1.55, comfortably inside 2. A shorter lever loses the
 * intersection partway round and the mechanism reverses there.
 */
export const START_F: [number, number] = (() => {
  const dx = START_C[0] - CRANK;
  const dy = START_C[1];
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const toPivot = [LEVER_PIVOT[0] - CRANK, LEVER_PIVOT[1]];
  const along = toPivot[0] * ux + toPivot[1] * uy;
  const across = toPivot[0] * -uy + toPivot[1] * ux;
  const half = Math.sqrt(RIDER_LEVER * RIDER_LEVER - across * across);
  return [CRANK + (along + half) * ux, (along + half) * uy];
})();

/**
 * How far past C the coupler's slot has to reach.
 *
 * The rider runs to about 1.49 of the way from B to C over a revolution — the
 * slot here is the *line* through those two pins, and the block travels well
 * beyond the second one. A slot is a channel with ends now, so the channel has
 * to be as long as the travel it carries: X sits on that same line, far enough
 * out that the block is still in it at the far end of its run.
 */
const SLOTTED_COUPLER_REACH = 1.7;

/** A four-bar whose coupler carries a slot, driving a grounded lever. */
export function slottedCouplerFixture(): MechanismFixture {
  // On the line through B and C, so the slot's direction is exactly what it
  // always was and the kinematics are untouched.
  const slotEnd: [number, number] = [
    CRANK + (START_C[0] - CRANK) * SLOTTED_COUPLER_REACH,
    START_C[1] * SLOTTED_COUPLER_REACH,
  ];
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: CRANK, y: 0 },
      { id: 'C', x: START_C[0], y: START_C[1] },
      { id: 'D', x: GROUND, y: 0, ground: true },
      { id: 'E', x: LEVER_PIVOT[0], y: LEVER_PIVOT[1], ground: true },
      { id: 'F', x: START_F[0], y: START_F[1] },
      { id: 'X', x: slotEnd[0], y: slotEnd[1] },
    ],
    links: [{ joints: 'AB' }, { joints: 'BCX' }, { joints: 'CD' }, { joints: 'EF' }],
    sliders: [{ at: 'F', prisId: 'P', on: { carrier: 'BCX', a: 'B', b: 'X' } }],
    inputAngVel: INPUT_SPEED,
  };
}

// --- Slide (Phase 3) -------------------------------------------------------

export const YOKE_CRANK = 1;
/** How far below the crank pivot the yoke's horizontal guide runs. */
export const GUIDE_DROP = 2;
/**
 * How far above the crank pivot the yoke's slot reaches.
 *
 * The crank pin rises to exactly the crank's own radius, so a slot ending at 1
 * ends exactly where the pin stops — and the *block* around that pin then hangs
 * out of the end of the channel, which is drawn shorter still by its inset from
 * the joints. Nothing was wrong with the motion; the slot was simply drawn too
 * short to hold the part riding in it. 1.8 leaves the block inside the channel
 * at the top of the stroke, and the line C→D is unchanged, so the kinematics
 * are the same closed form they were.
 */
export const SLOT_RISE = 1.8;

/**
 * Scotch yoke: crank AB drives a block riding in the yoke's vertical slot, and
 * the yoke itself is welded to a block on a horizontal grounded guide.
 *
 * The weld at C is the whole mechanism. Without it the yoke could turn about its
 * guide and the linkage is DOF 2; with it the yoke may only translate, its slot
 * stays vertical, and the crank pin sliding in that slot drives `x = r cos θ`
 * exactly — the closed form Gate 3 asserts.
 *
 * `swapSlotJoints` declares the slot as (D, C) instead of (C, D). Both describe
 * the same line, and a solver that answers differently is reading the pair as
 * ordered when it is not — the bug class review caught in Phase 2.
 */
export function scotchYokeFixture(swapSlotJoints: boolean = false): MechanismFixture {
  const slot = swapSlotJoints ? { a: 'D', b: 'C' } : { a: 'C', b: 'D' };
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: YOKE_CRANK, y: 0 },
      // C and D share the crank pin's x, so the slot passes through B at t = 0.
      { id: 'C', x: YOKE_CRANK, y: -GUIDE_DROP },
      { id: 'D', x: YOKE_CRANK, y: SLOT_RISE },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }],
    sliders: [
      { at: 'B', prisId: 'E', on: { carrier: 'CD', ...slot } },
      { at: 'C', prisId: 'F', angleRad: 0 },
    ],
    welds: ['C'],
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * The same yoke with the guide moved to the far end of the slot, so the loop
 * reaches the welded rider along an ordinary **link** edge rather than across
 * the slot.
 *
 * Kinematically identical to the plain yoke — `x = r cos θ` either way — which
 * is exactly what makes it a control. The loop shape is what differs: the plain
 * yoke's walk steps from the slot straight onto the block, so the rider link
 * never appears as an edge at all, and a solver that hands rotating unknowns out
 * along link edges is never asked about it. Here it is.
 */
export function scotchYokeGuidedAtFarEndFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: YOKE_CRANK, y: 0 },
      // C anchors the slot at the free end; D carries the weld and the guide.
      { id: 'C', x: YOKE_CRANK, y: SLOT_RISE },
      { id: 'D', x: YOKE_CRANK, y: -GUIDE_DROP },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }],
    sliders: [
      { at: 'B', prisId: 'E', on: { carrier: 'CD', a: 'C', b: 'D' } },
      { at: 'D', prisId: 'G', angleRad: 0 },
    ],
    welds: ['D'],
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * Swinging-block engine: a Slide whose guide is cut into a *moving* link.
 *
 * Crank AB drives a rod BR whose far end is welded to a block sliding in the
 * cylinder CD, and CD pivots on ground at C. DOF 1, and a perfectly ordinary
 * mechanism — but Phase 3 does not solve it, because the rider's angle tracks a
 * carrier that is itself unknown and the ordering deadlocks (spec §4). It
 * exists here to prove the refusal is reported rather than drawn: swung as an
 * ordinary Slot it would produce a plausible picture of the wrong linkage.
 */
export function swingingBlockFixture(): MechanismFixture {
  const pivot: [number, number] = [0, -3];
  const toPin = [YOKE_CRANK - pivot[0], -pivot[1]];
  const reach = Math.hypot(toPin[0], toPin[1]);
  const unit = [toPin[0] / reach, toPin[1] / reach];
  const along = (distance: number): [number, number] => [
    pivot[0] + unit[0] * distance,
    pivot[1] + unit[1] * distance,
  ];
  const [dx, dy] = along(2);
  const [rx, ry] = along(reach - 0.4);
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: YOKE_CRANK, y: 0 },
      { id: 'C', x: pivot[0], y: pivot[1], ground: true },
      { id: 'D', x: dx, y: dy },
      { id: 'R', x: rx, y: ry },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }, { joints: 'BR' }],
    sliders: [{ at: 'R', prisId: 'P', on: { carrier: 'CD', a: 'C', b: 'D' } }],
    welds: ['R'],
    inputAngVel: INPUT_SPEED,
  };
}

/** Height of the crank pivot above the guide, and the crank itself. */
export const SQUARE_ROD_OFFSET = 2;
export const SQUARE_ROD_CRANK = 1;

/**
 * An offset slider-crank proportioned so that once a revolution its rod stands
 * square to the guide — the pose where the slot line is *tangent* to the circle
 * the rod sweeps, and the linkage's two assembly modes meet at a single point.
 *
 * The proportion is the whole fixture: the rod is exactly as long as the crank
 * pin's greatest height above the guide. Nothing else about it is unusual, and
 * it is what a user gets by drawing a connecting rod that just reaches. The
 * crank turns through the pose rather than stopping at it — the height peaks
 * there and falls away again, so a solution exists at every angle — and the
 * slider passes through the foot of the perpendicular and comes out the other
 * side, which is the root swapping places.
 *
 * It starts a quarter turn away from that pose, so a run has to *cross* it.
 *
 * One consequence is inherent rather than a defect to fix here: crossing the
 * tangency puts the linkage in the other assembly mode, so its true period is
 * two revolutions. The timeline stops a rotating input at one (`mechanism.ts`,
 * `cycleIncomplete`), so this mechanism's precomputed cycle ends in the mode it
 * did not start in. Every sample within the run is right; the loop is what
 * jumps.
 */
export function squareRodSliderCrankFixture(): MechanismFixture {
  const rod = SQUARE_ROD_OFFSET + SQUARE_ROD_CRANK;
  const reach = Math.sqrt(rod * rod - SQUARE_ROD_OFFSET * SQUARE_ROD_OFFSET);
  return {
    joints: [
      { id: 'A', x: 0, y: SQUARE_ROD_OFFSET, ground: true, input: true },
      // Crank horizontal: a quarter turn short of standing the rod up.
      { id: 'B', x: SQUARE_ROD_CRANK, y: SQUARE_ROD_OFFSET },
      { id: 'C', x: SQUARE_ROD_CRANK + reach, y: 0 },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }],
    sliders: [{ at: 'C', prisId: 'P', angleRad: 0 }],
    inputAngVel: INPUT_SPEED,
  };
}

/** How far off the slot line the tracer arm reaches. */
export const TRACER_OFFSET = 2;

/**
 * The same yoke carrying a tracer point G that is **not** on its slot, and is
 * declared before either slot joint.
 *
 * That combination is the whole point. Sliding the assembly means solving "the
 * block lies on the slot", and the slot line has to be measured from a joint
 * actually on it — from G it is a line parallel to the slot but two units to
 * the side, and solving to *that* puts the yoke somewhere plausible and wrong.
 * In the plain yoke the first movable member happens to be the slot's own
 * anchor, so nothing there can tell the two apart.
 */
export function scotchYokeWithTracerFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: YOKE_CRANK, y: 0 },
      { id: 'G', x: YOKE_CRANK + TRACER_OFFSET, y: SLOT_RISE },
      { id: 'C', x: YOKE_CRANK, y: -GUIDE_DROP },
      { id: 'D', x: YOKE_CRANK, y: SLOT_RISE },
    ],
    links: [{ joints: 'AB' }, { joints: 'CDG' }],
    sliders: [
      { at: 'B', prisId: 'E', on: { carrier: 'CDG', a: 'C', b: 'D' } },
      { at: 'C', prisId: 'F', angleRad: 0 },
    ],
    welds: ['C'],
    inputAngVel: INPUT_SPEED,
  };
}

// --- Mobility --------------------------------------------------------------

/**
 * Elliptical trammel: a bar whose two ends ride in perpendicular grounded
 * slides. Nothing is pinned to ground, so it is the case that proves a grounded
 * guide anchors the mechanism.
 *
 * `driven` adds a carried point T on the bar and drives one slider along its
 * guide, which turns the mobility fixture into a kinematic one: the point T
 * then traces an exact ellipse, and an exact curve is worth having a mechanism
 * checked against.
 */
export function ellipticalTrammelFixture(
  driven: boolean = false,
  scale: number = 1
): MechanismFixture {
  // A driven slide advances by a step measured in internal model units, so a
  // mechanism that is to be *solved* has to be built in them; one that is only
  // to be counted does not care.
  return {
    joints: [
      { id: 'A', x: 1 * scale, y: 0 },
      { id: 'B', x: 0, y: 1 * scale },
      // A third of the way along the bar from A, so its ellipse has distinct
      // axes rather than being the circle the midpoint traces.
      ...(driven ? [{ id: 'T', x: (2 / 3) * scale, y: (1 / 3) * scale }] : []),
    ],
    links: [{ joints: driven ? 'ABT' : 'AB' }],
    sliders: [
      { at: 'A', prisId: 'C', angleRad: 0, input: driven },
      { at: 'B', prisId: 'D', angleRad: Math.PI / 2 },
    ],
    inputAngVel: INPUT_SPEED * scale,
  };
}

/**
 * A hydraulic cylinder: a rod welded to a block that slides in a barrel, with
 * the barrel's far end and the rod's far end on opposite sides of the block and
 * everything on one line (§2.7).
 *
 * Drawn, not solved. A Slide on a *moving* carrier is out of Phase 3's scope --
 * the rider's angle tracks a carrier that is itself unknown -- so this mechanism
 * is deliberately invalid and exists to exercise the cylinder skin, which is a
 * rendering question rather than a kinematic one.
 */
export function cylinderSkinFixture(): MechanismFixture {
  const mount = { x: -4, y: 0 };
  const driven = { x: 1.988, y: 0 };
  // Mid-travel: a drawing fixture, so it should show the part with rod both
  // inside and outside the barrel rather than at either stop.
  const { barrelEnd, pin } = cylinderBetween(mount, driven, 0.5);
  return {
    joints: [
      { id: 'A', ...mount, ground: true },
      { id: 'B', ...barrelEnd },
      { id: 'C', ...pin },
      { id: 'D', ...driven },
      { id: 'E', x: driven.x, y: 3, ground: true, input: true },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }, { joints: 'DE' }],
    sliders: [{ at: 'C', prisId: 'P', on: { carrier: 'AB', a: 'A', b: 'B' }, sealed: true }],
    welds: ['C'],
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * A boom raised by a hydraulic cylinder — the Gate 5 mechanism (§5.1).
 *
 * O and G are ground; the boom O→C is rigid; the cylinder runs G→C and is the
 * drive. Commanding its length therefore fixes the boom angle by the law of
 * cosines, which is the closed form the verification spec asserts against.
 *
 * `scale` exists because the cylinder's stroke is bounded by its own slot, and
 * a slot is drawn in mark units — absolute internal model units. Solving this
 * mechanism needs it built in that world, where the other slot fixtures are in
 * user units and never ask a mark how big it is.
 */
export function cylinderBoomFixture(scale: number = 1): MechanismFixture {
  const at = (x: number, y: number) => ({ x: x * scale, y: y * scale });
  const mount = { x: 3, y: 0 };
  const boomTip = { x: 0, y: 4 };
  // Mid-travel, so the boom has as much lift left in it as it has already used.
  const { barrelEnd, pin } = cylinderBetween(mount, boomTip, 0.5);
  return {
    joints: [
      { id: 'O', ...at(0, 0), ground: true },
      { id: 'C', ...at(boomTip.x, boomTip.y) },
      { id: 'G', ...at(mount.x, mount.y), ground: true },
      { id: 'N', ...at(barrelEnd.x, barrelEnd.y) },
      { id: 'P', ...at(pin.x, pin.y) },
    ],
    links: [{ joints: 'OC' }, { joints: 'GN' }, { joints: 'PC' }],
    slider: {
      at: 'P',
      prisId: 'S',
      on: { carrier: 'GN', a: 'G', b: 'N' },
      sealed: true,
      input: true,
    },
    welds: ['P'],
    inputAngVel: INPUT_SPEED * scale,
  };
}

/**
 * A cylinder-driven gripper, drawn by a user and shared as a URL.
 *
 * Worth keeping exactly as drawn — hand-placed coordinates, near-symmetric
 * rather than symmetric — because it is the first mechanism in this suite that
 * no chain of dyads can solve. The cylinder A→D pushes the plate DGHIJ; the
 * plate reaches two arms MQS and TVX through four short links; and each arm has
 * two points riding two vertical rails. The plate's pose and the two arms are
 * one simultaneous system of five unknowns, so it needs § 2.7a rather than the
 * ordering walk.
 *
 * It also has two bars pinned to ground at both ends — the rails KL and OP —
 * which is the natural way to draw a fixed guide and which Gruebler counts as
 * a body with two lower pairs, subtracting a degree of freedom per rail.
 */
export function gripperFixture(scale: number = 1): MechanismFixture {
  const at = (x: number, y: number) => ({ x: x * scale, y: y * scale });
  // The two mounts are exactly as the user drew them; the barrel's buried end
  // and the pin are wherever the invariant puts them, so the plate starts in
  // the pose that was shared and only the travel either side of it is new.
  const mount = { x: -4.684, y: 0.747 };
  const driven = { x: 2.902, y: 0.745 };
  const { barrelEnd, pin } = cylinderBetween(mount, driven, 0.5);
  return {
    joints: [
      { id: 'A', ...at(mount.x, mount.y), ground: true },
      { id: 'B', ...at(barrelEnd.x, barrelEnd.y) },
      { id: 'C', ...at(pin.x, pin.y) },
      { id: 'D', ...at(driven.x, driven.y) },
      { id: 'G', ...at(4.311, 3.004) },
      { id: 'H', ...at(8.246, 3.004) },
      { id: 'I', ...at(4.311, -1.011) },
      { id: 'J', ...at(8.246, -1.011) },
      { id: 'K', ...at(0.0, 9.696), ground: true },
      { id: 'L', ...at(0.09, -7.371), ground: true },
      { id: 'M', ...at(0.02, 5.903) },
      { id: 'O', ...at(6.519, 9.862), ground: true },
      { id: 'P', ...at(6.682, -10.105), ground: true },
      { id: 'Q', ...at(6.552, 5.786) },
      { id: 'S', ...at(14.851, 4.32) },
      { id: 'T', ...at(0.07, -3.573) },
      { id: 'V', ...at(6.63, -3.716) },
      { id: 'X', ...at(14.851, -2.223) },
    ],
    links: [
      { joints: 'AB' },
      { joints: 'CD' },
      { joints: 'DGHIJ' },
      { joints: 'KL' },
      { joints: 'GM' },
      { joints: 'OP' },
      { joints: 'HQ' },
      { joints: 'MQS' },
      { joints: 'IT' },
      { joints: 'JV' },
      { joints: 'TVX' },
    ],
    sliders: [
      { at: 'C', prisId: 'E', on: { carrier: 'AB', a: 'A', b: 'B' }, sealed: true, input: true },
      { at: 'M', prisId: 'N', on: { carrier: 'KL', a: 'K', b: 'L' } },
      { at: 'Q', prisId: 'R', on: { carrier: 'OP', a: 'O', b: 'P' } },
      { at: 'T', prisId: 'U', on: { carrier: 'KL', a: 'K', b: 'L' } },
      { at: 'V', prisId: 'W', on: { carrier: 'OP', a: 'O', b: 'P' } },
    ],
    welds: ['C'],
    inputAngVel: INPUT_SPEED * scale,
  };
}

/** A bar doing nothing, pinned to ground at both ends: a guide rail, alone. */
export function anchoredBarFixture(withRail: boolean): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 1, y: 1 },
      { id: 'C', x: 4, y: 1 },
      { id: 'D', x: 5, y: 0, ground: true },
      ...(withRail
        ? [
            { id: 'E', x: 0, y: 5, ground: true },
            { id: 'F', x: 3, y: 5, ground: true },
          ]
        : []),
    ],
    links: [
      { joints: 'AB' },
      { joints: 'BC' },
      { joints: 'CD' },
      ...(withRail ? [{ joints: 'EF' }] : []),
    ],
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * A gripper whose cylinder actually closes the jaws (§2.7a companion).
 *
 * Built after the shared gripper turned out to do something else: there, each
 * arm has two blocks riding two rails, which leaves it able to slide but
 * barely able to turn, so the jaws travel up and down rather than pinching.
 * Jaws pinch when the two levers *counter-rotate*, and this is the smallest
 * arrangement that makes them:
 *
 * - each jaw is a lever on its own ground pivot, free to swing;
 * - one coupler ties them together, attached on *opposite* sides of the two
 *   pivots. That is the whole trick — with both attachments on the same side
 *   the levers turn together, like a parallelogram, and the jaws stay parallel;
 * - the cylinder drives the upper lever directly.
 *
 * The pin sits where it does so the far end of the stroke is exactly where the
 * jaws meet: extend past that and the levers swing on and the jaws pass
 * through each other.
 */
export function pinchingGripperFixture(scale: number = 1): MechanismFixture {
  const at = (x: number, y: number) => ({ x: x * scale, y: y * scale });
  // The cylinder runs from its ground mount to the point it drives, so barrel
  // and rod are collinear by construction rather than by careful typing.
  const mount = { x: -10, y: 3 };
  const driven = { x: 0.7, y: 4.2 };
  const reach = Math.hypot(driven.x - mount.x, driven.y - mount.y);
  /**
   * Mount-to-mount span at which the two jaw tips come level — a property of
   * the four levers, found from their own geometry and written down because
   * there is no shorter way to say it.
   */
  const JAWS_MEET = 11.4174;
  // The ram's extended stop is put exactly there. Barrel and rod are equal now,
  // so the pin is no longer free to be placed anywhere on the axis: the drawn
  // pose is fixed by the mounts, and the only handle left on the travel is
  // where in it that pose sits. This is the value that stops the ram where the
  // jaws meet — extend past it and the levers swing on and the jaws pass
  // through each other.
  //
  // The retracted stop then lands at 7.20, and the linkage comes apart at
  // 10.49: a ram whose barrel and rod are the same length has a stroke two
  // thirds of its own span, and no `start` fits both stops inside a window a
  // single unit wide. So the mechanism binds on the way back and reverses
  // there, which is the ordinary a-cylinder-outruns-its-linkage case rather
  // than a fixture that needs different mounts.
  const stroke = cylinderSpanLayoutFrom(JAWS_MEET, 1, 0.15).stroke;
  const lock = JAWS_MEET - 2 * stroke;
  const { barrelEnd, pin } = cylinderBetween(mount, driven, (reach - lock) / stroke - 1);

  return {
    joints: [
      { id: 'A', ...at(mount.x, mount.y), ground: true },
      { id: 'B', ...at(barrelEnd.x, barrelEnd.y) },
      { id: 'C', ...at(pin.x, pin.y) },
      { id: 'D', ...at(driven.x, driven.y) },
      { id: 'G', ...at(4, 3), ground: true },
      { id: 'H', ...at(5.2, 1.8) },
      { id: 'I', ...at(11, 2) },
      { id: 'J', ...at(4, -3), ground: true },
      { id: 'K', ...at(2.8, -1.8) },
      { id: 'L', ...at(11, -2) },
    ],
    links: [
      { joints: 'AB' },
      { joints: 'CD' },
      // The upper lever: ground pivot G, driven at D, coupled at H, jaw at I.
      { joints: 'DGHI' },
      // The coupler, crossing between the pivots.
      { joints: 'HK' },
      // The lower lever: ground pivot J, coupled at K, jaw at L.
      { joints: 'JKL' },
    ],
    sliders: [
      { at: 'C', prisId: 'E', on: { carrier: 'AB', a: 'A', b: 'B' }, sealed: true, input: true },
    ],
    welds: ['C'],
    inputAngVel: INPUT_SPEED * scale,
  };
}

// --- MotionGen cross-check -------------------------------------------------

/**
 * The MotionGen library's "Gripper", rebuilt joint for joint.
 *
 * A cylinder pushes a plate; the plate reaches two jaws through four short
 * links; and each jaw has two points riding a fixed vertical rail. Captured
 * geometry and MotionGen's own solved joint paths are in the PMKS_Verification
 * repository under reference-data/motiongen-library/gripper.
 *
 * The drive is a grounded slider rather than a drawn cylinder, and that is
 * faithful rather than a simplification: MotionGen's actuator record for this
 * model is `{ type: 'linear', at: J1, from: J16 }` -- a sliding freedom between
 * the plate anchor and ground, with no barrel or rod length anywhere in the
 * model. Its `cylinders` entry names the same two joints and a stroke, and is
 * what gets drawn. Giving PMKS a barrel and a rod would mean inventing two
 * lengths MotionGen never specified, and the reachable stroke depends on them.
 *
 * Coordinates are verbatim, including the near-symmetry: the two rails sit at
 * x = -1.989744 and x = 0.010256, which is a hand-placed mechanism rather than
 * a generated one, and rounding it would be rebuilding a different linkage.
 */
export function motionGenGripperFixture(scale: number = 1): MechanismFixture {
  const at = (x: number, y: number) => ({ x: x * scale, y: y * scale });
  const RAIL = Math.PI / 2;
  return {
    joints: [
      { id: 'A', ...at(-1.924786, -0.00057) },
      { id: 'B', ...at(-1.133345, 1.004752) },
      { id: 'C', ...at(-1.133345, -0.995248) },
      { id: 'D', ...at(0.866655, 1.004752) },
      { id: 'E', ...at(0.866655, -0.995248) },
      { id: 'F', ...at(-1.989728, 2.121085) },
      { id: 'G', ...at(0.010272, 2.121085) },
      { id: 'H', ...at(-1.98973, -2.11158) },
      { id: 'I', ...at(0.01027, -2.11158) },
      { id: 'J', ...at(4.007358, -0.753037) },
      { id: 'K', ...at(4.017962, 1.051501) },
    ],
    links: [
      { joints: 'ABCDE' },
      { joints: 'BF' },
      { joints: 'DG' },
      { joints: 'CH' },
      { joints: 'EI' },
      { joints: 'HIJ' },
      { joints: 'FGK' },
    ],
    sliders: [
      // The cylinder's freedom: along the line from its ground anchor at
      // (-4.86561, -0.000826) to A, which is 8.7e-5 rad off the x axis.
      { at: 'A', prisId: 'P', angleRad: 8.7e-5, input: true },
      { at: 'F', prisId: 'Q', angleRad: RAIL },
      { at: 'G', prisId: 'R', angleRad: RAIL },
      { at: 'H', prisId: 'S', angleRad: RAIL },
      { at: 'I', prisId: 'T', angleRad: RAIL },
    ],
    inputAngVel: INPUT_SPEED * scale,
  };
}

/**
 * The same gripper with the redundancy designed out: jaws that pivot rather
 * than slide.
 *
 * The original is over-constrained because each jaw is reached by *two* rods
 * while its two rail pins already confine it to pure vertical travel, so the
 * second rod repeats the first. The interesting part is that simply deleting
 * the surplus rods does not fix it. A body with two pins on two parallel rails
 * is exactly what makes the mechanism over-constrained, and it is also a
 * permanent tangency for the closed-form primitives: locating the second pin
 * means intersecting a circle with a line whose distance from the centre is the
 * radius, at every pose. The mobility count comes out at one and the solver
 * still reverses on the first step, because the discriminant sits on zero and
 * rounding decides the sign.
 *
 * So the rails come off the jaws and each jaw pivots on ground instead. Plate
 * translates (two pins on one rail, which is two *distinct* roots and not a
 * tangency), each jaw turns about its own ground pin, and one rod drives each.
 * Three freedoms, two rods, one degree of freedom -- and every step is an
 * ordinary dyad.
 *
 * Coordinates are the MotionGen gripper's wherever a joint survives, so the two
 * can be opened side by side.
 */
export function pivotingGripperFixture(scale: number = 1): MechanismFixture {
  const at = (x: number, y: number) => ({ x: x * scale, y: y * scale });
  return {
    joints: [
      { id: 'A', ...at(-1.924786, 0) },
      { id: 'M', ...at(0.866655, 0) },
      { id: 'B', ...at(-1.133345, 1.004752) },
      { id: 'C', ...at(-1.133345, -0.995248) },
      { id: 'F', ...at(-1.989728, 2.121085), ground: true },
      { id: 'G', ...at(0.010272, 2.121085) },
      { id: 'K', ...at(4.017962, 1.051501) },
      { id: 'H', ...at(-1.98973, -2.11158), ground: true },
      { id: 'I', ...at(0.01027, -2.11158) },
      { id: 'J', ...at(4.007358, -0.753037) },
    ],
    links: [
      { joints: 'AMBC' },
      { joints: 'BG' },
      { joints: 'CI' },
      { joints: 'FGK' },
      { joints: 'HIJ' },
    ],
    sliders: [
      { at: 'A', prisId: 'P', angleRad: 0, input: true },
      { at: 'M', prisId: 'N', angleRad: 0 },
    ],
    inputAngVel: INPUT_SPEED * scale,
  };
}

/**
 * The MotionGen library's "Elliptical Crank", rebuilt joint for joint.
 *
 * A six-bar: crank A-B turns about ground, reaches the coupler C-D-E through
 * B-C, and the coupler's far end E rides a fixed guide lying all but along the
 * x axis. D is held by a short grounded rocker D-F. The name comes from the
 * ellipse the coupler traces.
 *
 * Captured geometry is in the PMKS_Verification repository under
 * reference-data/motiongen-library/elliptical-crank. Coordinates are verbatim,
 * including the guide's 0.0028 rad tilt -- it is a hand-placed mechanism, and
 * squaring the guide up would be rebuilding a different one.
 *
 * MotionGen carries the guide as a grounded *bar* with the slot cut into it,
 * and both of the bar's ends are members of the ground link. A grounded guide
 * at that angle is the same constraint with two fewer joints, which is how
 * PMKS+ spells it.
 */
export function ellipticalCrankFixture(scale: number = 1): MechanismFixture {
  const at = (x: number, y: number) => ({ x: x * scale, y: y * scale });
  // The guide runs between the two ends of MotionGen's grounded slot bar.
  const GUIDE = Math.atan2(0.050399 - 0.05919, 4.561923 - 1.432252);
  return {
    joints: [
      { id: 'A', ...at(-2.87544, 0.032816), ground: true, input: true },
      { id: 'B', ...at(-3.960199, 0.472074) },
      { id: 'C', ...at(-3.340474, 1.397268) },
      // The ellipse the mechanism is named for.
      { id: 'D', ...at(-0.517497, 0.696942), trace: true },
      { id: 'E', ...at(2.337757, 0.056553) },
      { id: 'F', ...at(0, 0), ground: true },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CDE' }, { joints: 'DF' }],
    slider: { at: 'E', prisId: 'P', angleRad: GUIDE },
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * A boundary-driven six-bar whose first one-degree sample changes assembly mode.
 *
 * It has the same topology as `ellipticalCrankFixture`: crank AB moves one
 * boundary of a ternary coupler CDE, D is held by rocker DF, and E rides a fixed
 * almost-horizontal guide. No dyad can enter CDE, so C, D, E and the guide block
 * are the square eight-row simultaneous system admitted after AB is stepped.
 * The drawn pose is full rank, and no moving-slot or weld row is involved.
 *
 * The proportions put that full-rank pose close to two isolated assembly modes.
 * Following the positive crank direction in 0.01-degree increments moves E to
 * the right. Solving the production one-degree sample in one LM call instead
 * converges to the other valid root and moves E left. Both roots satisfy every
 * modeled constraint; only continuation from the drawn pose identifies the
 * linkage the user assembled.
 *
 * Coordinates are kept to six decimals to make this a normal hand-enterable
 * fixture rather than a floating-point knife edge.
 */
export function boundaryBranchJumpFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: -2.87544, y: 0.032816, ground: true, input: true },
      { id: 'B', x: -3.960199, y: 0.472074 },
      { id: 'C', x: -8.346306, y: 3.068138 },
      { id: 'D', x: 2.675824, y: 1.869398 },
      { id: 'E', x: 3.903228, y: 5.228105 },
      { id: 'F', x: 4.085514, y: -5.223341, ground: true },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CDE' }, { joints: 'DF' }],
    sliders: [{ at: 'E', prisId: 'P', angleRad: -0.002808914061466237 }],
    inputAngVel: INPUT_SPEED,
  };
}

/** Radial engine: crank throw, rod length, and how many cylinders. */
export const RADIAL_CRANK = 1;
export const RADIAL_ROD = 3;
/**
 * Five, and odd on purpose. Every radial engine ever built has an odd number of
 * cylinders — it is what lets the firing order alternate all the way round
 * instead of doubling back — and five is the smallest that looks like the thing
 * rather than like a demonstration of it.
 */
export const RADIAL_CYLINDERS = 5;
/** The pistons' joint letters, and their blocks'. */
export const RADIAL_PISTON_IDS = ['B', 'C', 'D', 'E', 'F'].slice(0, RADIAL_CYLINDERS);
const RADIAL_BLOCK_IDS = ['P', 'Q', 'R', 'S', 'T'].slice(0, RADIAL_CYLINDERS);
/** Evenly spaced, first one straight up, the way they are drawn end-on. */
export const RADIAL_AXES = Array.from(
  { length: RADIAL_CYLINDERS },
  (_, index) => Math.PI / 2 + (index * 2 * Math.PI) / RADIAL_CYLINDERS
);

/**
 * A five-cylinder radial engine: one crank pin, five connecting rods, five
 * pistons on five fixed guides evenly spaced about it.
 *
 * On the shortlist for the linkage library because it is the case that puts
 * *several* sliders on one crank -- nothing else in the suite has more than two
 * -- and because it stays entirely dyadic while doing it: the crank pin swings
 * about ground, and each piston is then a circle about that pin meeting its own
 * guide. It is a scale test for the closed-form path rather than for the
 * simultaneous one.
 *
 * All five rods share a single crank pin, which is what makes it radial rather
 * than five separate slider-cranks.
 */
export function radialEngineFixture(): MechanismFixture {
  const pin: [number, number] = [RADIAL_CRANK, 0];
  // Where each piston sits at t = 0: along its own guide, a rod's length from
  // the pin. Solving s^2 - 2 s (pin . dir) + |pin|^2 - rod^2 = 0 for the far
  // root keeps every rod on the same side of the crank it is drawn on.
  const piston = (axis: number): { x: number; y: number } => {
    const dir: [number, number] = [Math.cos(axis), Math.sin(axis)];
    const b = pin[0] * dir[0] + pin[1] * dir[1];
    const c = pin[0] * pin[0] + pin[1] * pin[1] - RADIAL_ROD * RADIAL_ROD;
    const s = b + Math.sqrt(b * b - c);
    return { x: s * dir[0], y: s * dir[1] };
  };
  // One letter per piston and one per block, taken in order, so the count is
  // the only thing that has to change to build a seven- or nine-cylinder one.
  const pistonIds = RADIAL_PISTON_IDS;
  const blockIds = RADIAL_BLOCK_IDS;
  return {
    joints: [
      { id: 'O', x: 0, y: 0, ground: true, input: true },
      { id: 'A', x: pin[0], y: pin[1] },
      ...RADIAL_AXES.map((axis, index) => ({ id: pistonIds[index], ...piston(axis) })),
    ],
    links: [{ joints: 'OA' }, ...pistonIds.map((id) => ({ joints: `A${id}` }))],
    sliders: RADIAL_AXES.map((axis, index) => ({
      at: pistonIds[index],
      prisId: blockIds[index],
      angleRad: axis,
    })),
    inputAngVel: INPUT_SPEED,
  };
}

/** Chebyshev's classic proportions: ground 4, the two rockers 5, coupler 2. */
export const CHEBYSHEV = { ground: 4, rocker: 5, coupler: 2 };

/**
 * Chebyshev's straight-line linkage: a symmetric double-rocker whose coupler
 * midpoint travels very nearly in a straight line across the middle of its
 * travel.
 *
 * On the shortlist because approximate straight-line generation is the reason
 * four-bars are taught at all, and because the assertion it supports needs no
 * reference data -- how straight the traced line is follows from the
 * proportions, so there is nothing to drift.
 *
 * Grashof with the coupler as the shortest link, so neither grounded arm turns
 * all the way over: the input rocks and the cycle closes on a reversal rather
 * than on a revolution.
 *
 * **The arms cross.** Each ground pivot holds the coupler pin on the far side,
 * which is what puts the pair in the assembly mode the straight line belongs
 * to. Built uncrossed -- each pivot to its own side, which is the arrangement
 * that first looks symmetric and right -- the same five bars at the same five
 * lengths are still rigid, still one degree of freedom, still symmetric, and
 * trace an arc: the tracer climbs 0.89 across its travel where crossed it
 * climbs 0.13, straying 6.4% from a straight line instead of 0.38%. Only one
 * of the two is Chebyshev's linkage.
 *
 * The tracer sits on the coupler between its two pins, which is the one
 * configuration the circle-circle primitive is ill-conditioned in -- the two
 * circles that place it are internally tangent there. It solves; the tolerances
 * below are set where that lands.
 */
export function chebyshevStraightLineFixture(): MechanismFixture {
  const half = CHEBYSHEV.ground / 2;
  const reach = CHEBYSHEV.coupler / 2;
  // Crossed, so each arm spans the whole of the ground plus its own half of the
  // coupler rather than the difference between them.
  const rise = Math.sqrt(CHEBYSHEV.rocker ** 2 - (half + reach) ** 2);
  return {
    joints: [
      { id: 'G', x: -half, y: 0, ground: true, input: true },
      { id: 'A', x: -reach, y: rise },
      { id: 'B', x: reach, y: rise },
      // The whole point of the linkage: this is the near-straight line.
      { id: 'M', x: 0, y: rise, trace: true },
      { id: 'H', x: half, y: 0, ground: true },
    ],
    links: [{ joints: 'GB' }, { joints: 'ABM' }, { joints: 'AH' }],
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * The MotionGen library's "Running Horse Automata", by Ross McSweeney, rebuilt
 * joint for joint from the model MotionGen serves as a public asset.
 *
 * 45 joints and 27 moving links off one grounded crank -- five times anything
 * else in the suite, and there entirely as a scale test. No sliders, no
 * cylinders, no welds: it exercises the pin machinery, the ordering walk and
 * the per-timestep cloning at a width nothing else reaches.
 *
 * Joint ids run A-Z and then a-s, because a mechanism this size does not fit
 * the alphabet. That is a fixture's privilege rather than the app's: PMKS+
 * names joints with `String.fromCharCode(last + 1)`, which walks into
 * punctuation after Z, so the editor cannot currently name a linkage this big
 * even though the solver can hold one.
 */
export function runningHorseFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0.164663, y: -1.03044 },
      { id: 'B', x: -2.486004, y: -1.345107 },
      { id: 'C', x: -0.086004, y: 0.00956, ground: true, input: true },
      { id: 'D', x: -0.806004, y: -0.63044 },
      { id: 'E', x: -2.21875, y: 2.3125 },
      { id: 'F', x: -3.20067, y: 0.516227, ground: true },
      { id: 'G', x: -5.10467, y: 1.129559 },
      { id: 'H', x: -4.118003, y: 1.492225, ground: true },
      { id: 'I', x: 2.320566, y: 0.482221, ground: true },
      { id: 'J', x: 3.768502, y: 2.92281, ground: true },
      { id: 'K', x: 4.378338, y: 0.503138, ground: true },
      { id: 'L', x: -9.042299, y: 2.297471 },
      { id: 'M', x: -12.393118, y: 1.038455 },
      { id: 'N', x: -4.367013, y: -1.391181 },
      { id: 'O', x: -5.809429, y: -1.595915 },
      { id: 'P', x: -6.747891, y: -0.503608 },
      { id: 'Q', x: -7.544045, y: -2.338224 },
      { id: 'R', x: -7.533457, y: -4.772405 },
      { id: 'S', x: -7.099415, y: -3.717086 },
      { id: 'T', x: -8.414308, y: -5.614958 },
      { id: 'U', x: -8.524639, y: -6.516482 },
      { id: 'V', x: -9.630521, y: -5.895305 },
      { id: 'W', x: -9.38111, y: -7.198835 },
      { id: 'X', x: 0.771199, y: 1.960702 },
      { id: 'Y', x: 3.287655, y: 2.122728 },
      { id: 'Z', x: 3.78125, y: -0.1875 },
      { id: 'a', x: 2.720566, y: -0.606386 },
      { id: 'b', x: 2.396516, y: -1.806387 },
      { id: 'c', x: 4.811706, y: -1.254488 },
      { id: 'd', x: 7.807846, y: 2.778548 },
      { id: 'e', x: 8.463584, y: 5.067072 },
      { id: 'f', x: 8.006489, y: 2.041856 },
      { id: 'g', x: 10.806488, y: 5.394236 },
      { id: 'h', x: 12.450933, y: 2.232332 },
      { id: 'i', x: 11.657282, y: 1.756141 },
      { id: 'j', x: 6.616012, y: 4.391062 },
      { id: 'k', x: 7.828711, y: 7.140268 },
      { id: 'l', x: 7.079504, y: 6.930744 },
      { id: 'm', x: 5.617015, y: -1.284553 },
      { id: 'n', x: 5.278987, y: -3.284553 },
      { id: 'o', x: 4.670536, y: -2.490187 },
      { id: 'p', x: 4.050817, y: -5.245117 },
      { id: 'q', x: 3.75786, y: -4.433849 },
      { id: 'r', x: 2.794479, y: -4.338075 },
      { id: 's', x: 2.794479, y: -5.616948 },
    ],
    links: [
      { joints: 'AB' },
      { joints: 'CDA' },
      { joints: 'DE' },
      { joints: 'EFG' },
      { joints: 'HBLM' },
      { joints: 'DN' },
      { joints: 'FN' },
      { joints: 'GOP' },
      { joints: 'PNQ' },
      { joints: 'ORS' },
      { joints: 'QST' },
      { joints: 'RU' },
      { joints: 'TUVW' },
      { joints: 'DX' },
      { joints: 'XIY' },
      { joints: 'YZa' },
      { joints: 'Ib' },
      { joints: 'Db' },
      { joints: 'Ac' },
      { joints: 'Kd' },
      { joints: 'Jefc' },
      { joints: 'eghidjkl' },
      { joints: 'bZm' },
      { joints: 'ano' },
      { joints: 'omp' },
      { joints: 'nq' },
      { joints: 'qprs' },
    ],
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * Wiper proportions, in the ratios a car actually uses.
 *
 * Two spindles a blade's length apart, each blade a little longer than the gap;
 * a motor crank a fraction of the arm it drives, so the sweep comes out near
 * 100 degrees; and a tie rod between the two arms' cranks the same length as
 * the gap between the spindles, which is what makes the pair a parallelogram
 * and the two blades sweep together.
 */
export const WIPER = {
  /** Centre distance between the two wiper spindles. */
  spindles: 6,
  /** Blade reach, spindle to tip. */
  blade: 5,
  /** Crank radius on each arm, below the spindle, where the tie rod pins. */
  tie: 1.5,
  /** The motor four-bar: crank, coupler, the arm's own crank, and the ground. */
  crank: 1.5,
  coupler: 4.4,
  rocker: 2,
  motorGround: 4.5,
};

/**
 * A pair of windshield wipers, driven the way a car drives them.
 *
 * A motor turns a crank; a link off that crank rocks the first wiper arm about
 * its spindle; and a **tie rod** carries that same motion to the second arm.
 * The tie rod and the two arm cranks form a parallelogram with the line between
 * the spindles, so the second blade copies the first exactly — which is why the
 * two blades on a car stay parallel through the whole sweep instead of
 * converging.
 *
 * Six bars, one freedom. It was a single crank-rocker before, with the "blade"
 * drawn as an extension of the rocker: correct as a crank-rocker demonstration
 * and not recognisable as a wiper. What makes this one worth having in the
 * library is the parallel pair, which is the part of a real wiper that is
 * actually a linkage problem.
 *
 * The motor four-bar is Grashof with the crank shortest (1.5 + 4.5 = 6 against
 * 4.4 + 2 = 6.4), so the motor turns continuously and the arms rock — the whole
 * point of a wiper — through a little under 100 degrees.
 */
export function windshieldWiperFixture(): MechanismFixture {
  const spindle1: [number, number] = [0, 0];
  const spindle2: [number, number] = [WIPER.spindles, 0];
  // The motor sits below and outboard, as it does under a cowl. Its distance
  // from the first spindle is the four-bar's ground length.
  const motorX = -3.5;
  const motor: [number, number] = [motorX, -Math.sqrt(WIPER.motorGround ** 2 - motorX ** 2)];

  // Where the arm stands at mid-sweep. The rocker's two extremes are the poses
  // where crank and coupler are folded and extended, so the angle at the
  // spindle follows from the law of cosines at each.
  const cosAt = (span: number) =>
    (WIPER.motorGround ** 2 + WIPER.rocker ** 2 - span ** 2) /
    (2 * WIPER.motorGround * WIPER.rocker);
  const extreme = (span: number) => Math.acos(cosAt(span));
  const midSwing =
    (extreme(WIPER.coupler + WIPER.crank) + extreme(WIPER.coupler - WIPER.crank)) / 2;
  const towardMotor = Math.atan2(motor[1] - spindle1[1], motor[0] - spindle1[0]);
  /** Direction of each arm's crank: below the spindle, opposite its blade. */
  const crankDir = towardMotor + midSwing;
  /** Direction of the blades themselves. */
  const bladeDir = crankDir + Math.PI;

  const along = (from: [number, number], dir: number, reach: number): [number, number] => [
    from[0] + reach * Math.cos(dir),
    from[1] + reach * Math.sin(dir),
  ];
  const b = along(spindle1, crankDir, WIPER.rocker);
  const c = along(spindle1, crankDir, WIPER.tie);
  const d = along(spindle2, crankDir, WIPER.tie);
  const tip1 = along(spindle1, bladeDir, WIPER.blade);
  const tip2 = along(spindle2, bladeDir, WIPER.blade);

  // The crank pin closes the motor four-bar: the circle of the crank about the
  // motor meeting the circle of the coupler about the arm's pin. The root taken
  // is the one on the motor's own side, which is the branch that turns over.
  const span = Math.hypot(b[0] - motor[0], b[1] - motor[1]);
  const foot = (WIPER.crank ** 2 - WIPER.coupler ** 2 + span ** 2) / (2 * span);
  const rise = Math.sqrt(WIPER.crank ** 2 - foot ** 2);
  const ux = (b[0] - motor[0]) / span;
  const uy = (b[1] - motor[1]) / span;
  const a: [number, number] = [motor[0] + foot * ux - rise * uy, motor[1] + foot * uy + rise * ux];

  return {
    joints: [
      { id: 'O', x: motor[0], y: motor[1], ground: true, input: true },
      { id: 'A', x: a[0], y: a[1] },
      { id: 'B', x: b[0], y: b[1] },
      { id: 'P', x: spindle1[0], y: spindle1[1], ground: true },
      { id: 'C', x: c[0], y: c[1] },
      // The arcs the two blades sweep, and that they are the same arc.
      { id: 'T', x: tip1[0], y: tip1[1], trace: true },
      { id: 'D', x: d[0], y: d[1] },
      { id: 'Q', x: spindle2[0], y: spindle2[1], ground: true },
      { id: 'U', x: tip2[0], y: tip2[1], trace: true },
    ],
    links: [
      { joints: 'OA', name: 'Motor crank' },
      { joints: 'AB', name: 'Drive link' },
      // One rigid arm: the crank below the spindle, the spindle, and the blade.
      { joints: 'BCPT', name: 'Wiper arm' },
      { joints: 'CD', name: 'Tie rod' },
      { joints: 'DQU', name: 'Passenger arm' },
    ],
    inputAngVel: INPUT_SPEED,
  };
}
