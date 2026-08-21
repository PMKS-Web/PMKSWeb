import { Joint, RealJoint } from './joint';
import { Link } from './link';
import { canDrive } from './actuator';

/**
 * The five moves the tutorial teaches, and how to tell from the drawing which
 * one is still outstanding.
 *
 * Read off the mechanism rather than counted by a Next button: a student who
 * grounds the wrong joint simply stays where they are, and one who arrives on a
 * half-built drawing starts at the first move it has not already made. That is
 * also what makes the tutorial replayable on somebody else's linkage.
 */
export type TutorialStepId = 1 | 2 | 3 | 4 | 5;

export const TUTORIAL_STEP_COUNT = 5;

/** What the drawing has to look like for a step to be behind you. */
export interface TutorialProgress {
  /** The first step this drawing has not satisfied. */
  step: TutorialStepId;
  /** The joint the card names and the grid rings, where a step has one. */
  target?: RealJoint;
  /** The second joint step 3 still wants, so the copy can name both at once. */
  alsoTarget?: RealJoint;
  /** What the *previous* step achieved, shown as the card's green line. */
  achieved?: string;
}

const real = (joints: Joint[]): RealJoint[] =>
  joints.filter((joint): joint is RealJoint => joint instanceof RealJoint);

/**
 * The joints at the ends of a chain — the ones a four-bar grounds.
 *
 * Degree one in the link graph, which is what "the far end of the last bar"
 * means once the student has stopped following along exactly.
 */
export function endJoints(joints: Joint[]): RealJoint[] {
  return real(joints).filter((joint) => joint.links.length === 1);
}

/**
 * Whether the drawing holds three links that are actually joined up.
 *
 * Three separate bars are three links and are not a chain, and this is the
 * whole reason step 1 and step 2 are two steps: `Add Link` on bare grid makes
 * a free-standing bar every time, so three of them never touch. Connectivity
 * is the test rather than a joint count, because a student who builds their
 * chain in a different order still built a chain.
 */
export function linksAreChained(links: Link[]): boolean {
  if (links.length < 3) return false;
  const reached = new Set<Link>([links[0]]);
  const queue: Link[] = [links[0]];
  while (queue.length > 0) {
    const link = queue.pop()!;
    for (const joint of link.joints) {
      if (!(joint instanceof RealJoint)) continue;
      for (const neighbour of joint.links) {
        if (!reached.has(neighbour)) {
          reached.add(neighbour);
          queue.push(neighbour);
        }
      }
    }
  }
  return reached.size >= 3;
}

const nameOf = (joint: RealJoint): string => joint.name || joint.id;

/**
 * Which step this drawing is on, and the joint that step is about.
 *
 * The target is resolved from the drawing before the copy that names it: a
 * drawing that arrives with one end already grounded must ring the *other*
 * end, or the sentence sends the student to the finished one.
 */
export function progressFor(joints: Joint[], links: Link[]): TutorialProgress {
  return progressAt(joints, links, stepOf(joints, links));
}

/** The first of the five moves this drawing has not made. */
export function stepOf(joints: Joint[], links: Link[]): TutorialStepId {
  if (links.length < 1) return 1;
  if (!linksAreChained(links)) return 2;
  if (real(joints).filter((joint) => joint.ground).length < 2) return 3;
  if (!real(joints).some((joint) => joint.input)) return 4;
  return 5;
}

/**
 * One step's view of this drawing — including a step it is already past.
 *
 * The card can be turned back to re-read a step that is done, so every step has
 * to be describable against a drawing that has moved on. Where the joint a step
 * asks about has already been dealt with, the finished one is named instead of
 * nothing: the sentence becomes a record of what was done rather than an
 * instruction, and a record still has to say which joint it was about.
 */
export function progressAt(joints: Joint[], links: Link[], step: TutorialStepId): TutorialProgress {
  const ends = endJoints(joints);
  const grounded = real(joints).filter((joint) => joint.ground);
  const input = real(joints).find((joint) => joint.input);

  switch (step) {
    case 1:
      return { step: 1 };
    case 2:
      return { step: 2, achieved: 'First bar drawn' };
    case 3: {
      const loose = ends.filter((joint) => !joint.ground);
      const named = loose.length > 0 ? loose : ends;
      return { step: 3, target: named[0], alsoTarget: named[1], achieved: 'Three links chained' };
    }
    case 4: {
      const drivable = grounded.filter((joint) => canDrive(joint));
      return {
        step: 4,
        target: input ?? drivable[0] ?? grounded[0],
        achieved:
          grounded.length > 0
            ? `${grounded.length > 1 ? 'Joints' : 'Joint'} ${grounded.map(nameOf).join(' and ')} grounded`
            : undefined,
      };
    }
    default:
      return {
        step: 5,
        achieved: input ? `Joint ${nameOf(input)} is the input` : undefined,
      };
  }
}

/** A joint worth reading a velocity off: one that moves. */
export function readableJoints(joints: Joint[]): RealJoint[] {
  return real(joints).filter((joint) => !joint.ground);
}

/** The card's words for one step, with the joints of this drawing named in them. */
export interface TutorialCopy {
  title: string;
  body: string;
  hint?: string;
  hintGlyph?: string;
}

/**
 * What the card says, given where the student is.
 *
 * Step 1 and step 2 name *different gestures*, which is the point of their
 * being two steps. `Add Link` on bare grid always makes a free-standing bar —
 * doing it three times leaves three bars that never touch — so the chain is
 * built by attaching to the far end of what is already there.
 */
export function copyFor(progress: TutorialProgress): TutorialCopy {
  const target = progress.target ? nameOf(progress.target) : '';
  switch (progress.step) {
    case 1:
      return {
        title: 'Draw the first bar',
        // The gesture is a click, then a move, then a click -- not a drag. The
        // bar's far end follows the pointer between the two, and describing it
        // as "drag and release" had readers holding the button down through a
        // move that does not want it held.
        body: 'Right-click the empty grid and choose Add Link. One end is placed where you clicked and the other follows your pointer — move to where you want it and left-click to set it.',
        hint: 'Right-click is how everything is added in PMKS+. The panel on the left edits whatever you then select.',
        hintGlyph: 'mouse',
      };
    case 2:
      return {
        title: 'Extend it into a chain of three',
        body: 'Right-click the joint at the far end of the bar and choose Attach Link, then left-click where the new bar should end. Do that twice, each time from the newest end, so the three links make a chain.',
        hint: 'Add Link starts a new bar on its own. Attach Link joins one to a joint that is already there.',
        hintGlyph: 'link',
      };
    case 3: {
      const also = progress.alsoTarget ? nameOf(progress.alsoTarget) : '';
      return {
        title: 'Ground the two end joints',
        body:
          `Right-click joint ${target}, the ringed one, and choose Add Ground. A grounded joint is fixed to the frame.` +
          (also ? ` Then do the same at joint ${also}, at the other end.` : ''),
        hint: 'A mechanism with nothing grounded floats away.',
        hintGlyph: 'push_pin',
      };
    }
    case 4:
      return {
        title: 'Make one joint the input',
        body: `Right-click joint ${target}, the ringed one, and choose Add Input. The input is the joint that drives the mechanism. A mechanism needs exactly one.`,
      };
    default:
      return {
        title: 'Play it and read a velocity',
        // Named by where it is, not only by what it says: below about 900px the
        // mode tabs give up their labels and a student is looking at four
        // unexplained glyphs.
        body: 'Switch to Kinematic Analysis — the third mode in the strip along the top — then press Play at the bottom of the window and click a moving joint on the grid.',
        hint: 'The reading follows the pose, so scrubbing the handle moves the number.',
        hintGlyph: 'speed',
      };
  }
}
