import { MechanismFixture } from './fixture';

/**
 * Four mechanisms built to be looked at on the Analyze tab's force panels.
 *
 * Everything else in the library is a kinematics demonstration that happens to
 * have masses. These carry a load on purpose, and each one puts a different
 * question to the force analysis:
 *
 * - the **punch press** asks what a crank has to push with, and answers with
 *   the classic near-bottom-dead-centre spike;
 * - the **jib crane** asks what holding still costs, and answers with pin
 *   reactions several times the weight hanging off the end;
 * - the **toggle clamp** asks where mechanical advantage comes from, and
 *   answers by running away to infinity as its two links come into line;
 * - the **rocker arm** asks what a load *off* the line of a link does, and
 *   answers with the moment nobody drew.
 *
 * The geometry of each is deliberately ordinary. A force demonstration whose
 * linkage is also unfamiliar teaches neither thing.
 */

/** One rad/s, matching the rest of the verification suite. */
const INPUT_SPEED = 1;

/**
 * A punch press: a slider-crank whose ram meets the work near the bottom of
 * its stroke.
 *
 * The load opposes the punch — it pushes back up the slide — so the crank sees
 * its heaviest torque where the connecting rod comes closest to in line with
 * the slide, which is the geometry every press is designed around.
 */
export function punchPressFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 0, y: 1.2 },
      { id: 'C', x: 0, y: -3.4 },
    ],
    links: [
      { joints: 'AB', mass: 2, moi: 0.05, name: 'Crank' },
      { joints: 'BC', mass: 3, moi: 0.4, name: 'Connecting rod' },
    ],
    // The slide runs straight down, so the ram travels on the y axis.
    slider: { at: 'C', prisId: 'P', angleRad: Math.PI / 2, pistonMass: 6 },
    // The work pushing back: straight up the slide, at the ram.
    load: { onLink: 'BC', at: [0, -3.4], vector: [0, 400] },
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * A derrick crane: a boom luffed by a crank and link, with a weight on the hook.
 *
 * Two earlier shapes did not work, and both failures are worth keeping. A boom
 * held by a *tie bar* is what a crane looks like in a drawing and is a
 * structure, not a mechanism — two bars and the ground make a triangle, and a
 * triangle has nothing to analyse. Luffing it with a **ram** moves, but the
 * force analysis reports an unsupported topology for a sealed cylinder, and a
 * force demonstration whose force panel is empty is not one.
 *
 * So it luffs on a crank and a link, which is how a derrick actually raises its
 * boom, and every joint in it is a pin. The point on a force panel is the size
 * of the numbers: a weight hung far out on the boom, held by a link anchored
 * close in, puts several times that weight through the link and its pins.
 */
export function jibCraneFixture(): MechanismFixture {
  const BOOM = { reach: 6, toLink: 3, angle: (55 * Math.PI) / 180 };
  const along = (distance: number) => ({
    x: distance * Math.cos(BOOM.angle),
    y: distance * Math.sin(BOOM.angle),
  });
  const linkPin = along(BOOM.toLink);
  const hook = along(BOOM.reach);
  const winch = { x: 2.2, y: -0.6 };
  const CRANK = 1;
  const LINK = 2.4;

  // The crank pin closes the four-bar: the circle of the crank about the winch
  // meeting the circle of the link about the boom's own pin.
  const span = Math.hypot(linkPin.x - winch.x, linkPin.y - winch.y);
  const foot = (CRANK ** 2 - LINK ** 2 + span ** 2) / (2 * span);
  const rise = Math.sqrt(CRANK ** 2 - foot ** 2);
  const ux = (linkPin.x - winch.x) / span;
  const uy = (linkPin.y - winch.y) / span;
  const crankPin = {
    x: winch.x + foot * ux - rise * uy,
    y: winch.y + foot * uy + rise * ux,
  };

  return {
    joints: [
      { id: 'O', x: 0, y: 0, ground: true },
      { id: 'C', x: linkPin.x, y: linkPin.y },
      { id: 'T', x: hook.x, y: hook.y },
      { id: 'G', x: winch.x, y: winch.y, ground: true, input: true },
      { id: 'K', x: crankPin.x, y: crankPin.y },
    ],
    links: [
      { joints: 'GK', mass: 2, moi: 0.05, name: 'Luffing crank' },
      { joints: 'CK', mass: 3, moi: 0.4, name: 'Luffing link' },
      { joints: 'OCT', mass: 12, moi: 3, name: 'Boom' },
    ],
    // The hook load, straight down at the tip.
    load: { onLink: 'OCT', at: [hook.x, hook.y], vector: [0, -250] },
    inputAngVel: INPUT_SPEED,
  };
}

/** Toggle clamp: the pivot heights and the pad it closes onto. */
const CLAMP = {
  /** Ground pivot of the handle, and of the link that pushes the bar down. */
  handle: { x: -2.6, y: 1.9 },
  elbow: { x: -0.6, y: 1.5 },
  pad: { x: 1.6, y: 0.35 },
  anchor: { x: -1.4, y: -0.6 },
};

/**
 * A toggle clamp: a hand lever closing a bar onto a pad, through a pair of
 * links that come nearly into line at the closed position.
 *
 * This is the mechanical-advantage case. As the two links approach collinear
 * the clamping force rises without limit for a fixed handle effort, which is
 * why every workshop clamp is built this way — and why the force panel is the
 * only place the effect is visible, since the *motion* near the toggle is
 * unremarkable.
 */
export function toggleClampFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'H', x: CLAMP.handle.x, y: CLAMP.handle.y, ground: true, input: true },
      { id: 'E', x: CLAMP.elbow.x, y: CLAMP.elbow.y },
      { id: 'P', x: CLAMP.pad.x, y: CLAMP.pad.y },
      { id: 'N', x: CLAMP.anchor.x, y: CLAMP.anchor.y, ground: true },
    ],
    links: [
      { joints: 'HE', mass: 1.5, moi: 0.05, name: 'Handle' },
      { joints: 'EP', mass: 1, moi: 0.08, name: 'Toggle link' },
      { joints: 'NP', mass: 2, moi: 0.2, name: 'Clamp bar' },
    ],
    // The work pushing back against the pad.
    load: { onLink: 'NP', at: [CLAMP.pad.x, CLAMP.pad.y], vector: [0, 180] },
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * A rocker arm carrying a load out to one side of it.
 *
 * The plainest four-bar in the library, with the load deliberately *not* on the
 * line between the output link's own two joints. That offset is a moment, and
 * it is the thing a force panel shows that a free-body sketch of the same
 * linkage usually leaves out.
 */
export function offsetLoadFourBarFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 1.1, y: 0.5 },
      { id: 'C', x: 4.1, y: 2.4 },
      { id: 'D', x: 5, y: 0, ground: true },
      // The load pad: rigid with the output rocker, out to one side of CD.
      { id: 'L', x: 5.9, y: 2.9 },
    ],
    links: [
      { joints: 'AB', mass: 2, moi: 0.05, name: 'Crank' },
      { joints: 'BC', mass: 4, moi: 0.5, name: 'Coupler' },
      { joints: 'CDL', mass: 5, moi: 0.9, name: 'Rocker' },
    ],
    load: { onLink: 'CDL', at: [5.9, 2.9], vector: [-120, -90] },
    inputAngVel: INPUT_SPEED,
  };
}
