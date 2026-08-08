import { MechanismFixture } from './fixture';

// The Phase 2 mechanisms, in one place so the specs that assert on them and the
// gallery that publishes them as URLs cannot drift apart. See
// docs/joint-types-plan.md §4.1 for what each case is meant to isolate.

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

/** A four-bar whose coupler carries a slot, driving a grounded lever. */
export function slottedCouplerFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: CRANK, y: 0 },
      { id: 'C', x: START_C[0], y: START_C[1] },
      { id: 'D', x: GROUND, y: 0, ground: true },
      { id: 'E', x: LEVER_PIVOT[0], y: LEVER_PIVOT[1], ground: true },
      { id: 'F', x: START_F[0], y: START_F[1] },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CD' }, { joints: 'EF' }],
    sliders: [{ at: 'F', prisId: 'P', on: { carrier: 'BC', a: 'B', b: 'C' } }],
    inputAngVel: INPUT_SPEED,
  };
}

// --- Slide (Phase 3) -------------------------------------------------------

export const YOKE_CRANK = 1;
/** How far below the crank pivot the yoke's horizontal guide runs. */
export const GUIDE_DROP = 2;
/** How far above the crank pivot the yoke's slot reaches. */
export const SLOT_RISE = 1;

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
  return {
    joints: [
      { id: 'A', x: -4, y: 0, ground: true },
      { id: 'B', x: -1, y: 0 },
      { id: 'C', x: 0, y: 0 },
      { id: 'D', x: 4, y: 0 },
      { id: 'E', x: 4, y: 3, ground: true, input: true },
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
  return {
    joints: [
      { id: 'O', ...at(0, 0), ground: true },
      { id: 'C', ...at(0, 4) },
      { id: 'G', ...at(3, 0), ground: true },
      { id: 'N', ...at(1.5, 2) },
      { id: 'P', ...at(1.8, 1.6) },
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
  return {
    joints: [
      { id: 'A', ...at(-4.684, 0.747), ground: true },
      { id: 'B', ...at(-0.693, 0.746) },
      { id: 'C', ...at(-1.531, 0.746) },
      { id: 'D', ...at(2.902, 0.745) },
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
  const along = (distance: number) => ({
    x: mount.x + ((driven.x - mount.x) * distance) / reach,
    y: mount.y + ((driven.y - mount.y) * distance) / reach,
  });
  const barrelEnd = along(4);
  const pin = along(2.927);

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
      { id: 'D', ...at(-0.517497, 0.696942) },
      { id: 'E', ...at(2.337757, 0.056553) },
      { id: 'F', ...at(0, 0), ground: true },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CDE' }, { joints: 'DF' }],
    slider: { at: 'E', prisId: 'P', angleRad: GUIDE },
    inputAngVel: INPUT_SPEED,
  };
}
