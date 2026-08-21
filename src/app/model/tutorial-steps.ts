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
 * Which step this drawing is on, and the joint the step is about.
 *
 * The target is resolved from the drawing before the copy that names it: a
 * drawing that arrives with one end already grounded must ring the *other*
 * end, or the sentence sends the student to the finished one.
 */
export function progressFor(joints: Joint[], links: Link[]): TutorialProgress {
  if (links.length < 1) return { step: 1 };
  if (!linksAreChained(links)) return { step: 2, achieved: 'First bar drawn' };

  const ends = endJoints(joints);
  const ungrounded = ends.filter((joint) => !joint.ground);
  const grounded = real(joints).filter((joint) => joint.ground);
  if (grounded.length < 2) {
    return {
      step: 3,
      target: ungrounded[0],
      alsoTarget: ungrounded[1],
      achieved: 'Three links chained',
    };
  }

  if (!real(joints).some((joint) => joint.input)) {
    // Only a joint that can actually be driven, so "do this step for me" and
    // the ring never point at one the app would refuse.
    const drivable = grounded.filter((joint) => canDrive(joint));
    return {
      step: 4,
      target: drivable[0] ?? grounded[0],
      achieved: `${grounded.length > 1 ? 'Joints' : 'Joint'} ${grounded
        .map(nameOf)
        .join(' and ')} grounded`,
    };
  }

  const input = real(joints).find((joint) => joint.input)!;
  return { step: 5, achieved: `Joint ${nameOf(input)} is the input` };
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
        body: 'Right-click anywhere on the empty grid and choose Add Link. Drag out a bar and release.',
        hint: 'Right-click is how everything is added in PMKS+. The panel on the left edits whatever you then select.',
        hintGlyph: 'mouse',
      };
    case 2:
      return {
        title: 'Extend it into a chain of three',
        body: 'Right-click the joint at the far end of the bar and choose Attach Link. Do that twice, each time from the newest end, so the three links make a chain.',
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
        body: 'Open Kinematic Analysis, press Play at the bottom of the window, then click a moving joint on the grid.',
        hint: 'The reading follows the pose, so scrubbing the handle moves the number.',
        hintGlyph: 'speed',
      };
  }
}
