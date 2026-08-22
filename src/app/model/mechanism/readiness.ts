import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link } from '../link';
import { canDrive } from '../actuator';
import { Mechanism } from './mechanism';
import { MechanismPartition, UnassignedGeometry } from './mechanism-partition';

/**
 * A blocker stops the mechanism running at all. A warning means it runs, and
 * there is something about the result worth knowing before trusting it.
 */
export type CheckState = 'blocker' | 'warning';

export interface ReadinessCheck {
  state: CheckState;
  /** A short sentence-case phrase naming the situation. */
  title: string;
  /** What is wrong and what to do about it. */
  body: string;
  /** The part at fault, so the panel can offer to go to it. */
  at?: Joint | Link;
  /** Title Case, because it labels a button. */
  action?: string;
}

/** A named number about a mechanism, for the overview grid. */
export interface MechanismFact {
  label: string;
  value: string;
}

export interface MechanismReadiness {
  id: string;
  ready: boolean;
  checks: ReadinessCheck[];
  /** What this mechanism *is*, for a reader whose question is not "why is it broken". */
  facts: MechanismFact[];
}

/** The two strings only the service can produce, passed in rather than reached for. */
export interface ReadinessHelpers {
  /** What to call a cylinder identified by its slider joint's id. */
  cylinderName(sliderId: string): string;
  /** Why this mechanism's driven joint cannot be driven, if it cannot. */
  drivenRefusal(partition: MechanismPartition): string | undefined;
  /** The cylinder-cannot-use-its-whole-stroke warning for this mechanism. */
  strokeWarning(partition: MechanismPartition): string | undefined;
  /** This mechanism's input speed, in the units the panel shows it in. */
  describeSpeed(partition: MechanismPartition): string;
}

const names = (joints: Joint[]): string =>
  joints.map((joint) => (joint as RealJoint).name || joint.id).join(', ');

/**
 * Everything standing between one mechanism and its animation, worst first.
 *
 * Ordered the way the fixes depend on one another rather than by severity,
 * because a list a student works down should not send them to do something that
 * cannot help yet: a slider with nothing to slide along has no mobility worth
 * counting, and giving an input to a linkage whose mobility is wrong will not
 * make it run. Each blocker names the way out, not just the wall.
 */
export function readinessOf(
  partition: MechanismPartition,
  mechanism: Mechanism,
  helpers: ReadinessHelpers
): MechanismReadiness {
  const checks: ReadinessCheck[] = [];
  const add = (check: ReadinessCheck) => checks.push(check);

  switch (mechanism.failure) {
    case 'dangling-slider': {
      const dangling = partition.joints.filter(
        (joint) => joint instanceof PrisJoint && joint.isDangling
      );
      add({
        state: 'blocker',
        title: 'A slider has nothing to slide along',
        body: `Slider ${names(dangling)} has no slot and no ground, so there is no direction for it to move in. Drag it onto a link to cut a slot, or ground it to fix its direction.`,
        at: dangling[0],
        action: 'Go To Slider',
      });
      break;
    }

    case 'mobility': {
      const dof = mechanism.dof;
      if (Number.isNaN(dof)) {
        add({
          state: 'blocker',
          title: 'Nothing holds this mechanism in place',
          body: 'It has no ground, so every part of it is free to drift. Ground a joint, or ground a slider’s guide.',
        });
      } else if (dof > 1) {
        // Point at the loose ends when there are any: a joint on one link with
        // no ground is a freedom the reader can see. Only on a *binary* link,
        // though — a third joint riding a link that already has two is a tracer
        // point, and a tracer adds no freedom worth sending anyone to.
        const freeEnds = partition.ownJoints.filter(
          (joint) =>
            joint instanceof RealJoint &&
            !(joint instanceof PrisJoint) &&
            !joint.ground &&
            joint.links.length === 1 &&
            joint.links[0].joints.length <= 2
        );
        add({
          state: 'blocker',
          title: `This mechanism has ${dof} degrees of freedom`,
          body:
            `One input can drive only one degree of freedom. Ground another joint, or connect a free joint to a second link, until this reads 1.` +
            (freeEnds.length > 0
              ? ` ${freeEnds.length === 1 ? 'Joint' : 'Joints'} ${names(freeEnds)} ${
                  freeEnds.length === 1 ? 'hangs' : 'hang'
                } on only one link — free ends like that are where extra freedom usually lives.`
              : ''),
          at: freeEnds[0],
          action: freeEnds.length > 0 ? 'Go To Joint' : undefined,
        });
      } else {
        const welded = partition.ownJoints.some(
          (joint) => joint instanceof RealJoint && joint.isWelded
        );
        add({
          state: 'blocker',
          title: `This mechanism has ${dof} degrees of freedom`,
          body:
            'It is over-constrained, so nothing can move at all. Remove a link, or unground a joint, until this reads 1.' +
            (welded
              ? ' A weld also removes freedom — unwelding a joint is another way out.'
              : ''),
        });
      }
      break;
    }

    case 'not-driven': {
      // Point at a joint that could actually take the job, so the button is an
      // answer rather than a place to start looking.
      const candidate = partition.ownJoints.find(
        (joint) => joint instanceof RealJoint && canDrive(joint)
      );
      add({
        state: 'blocker',
        title: 'Nothing drives this mechanism',
        body: candidate
          ? `There is no time to solve against until one joint is driven. Right-click joint ${(candidate as RealJoint).name || candidate.id} and switch on Driven Input.`
          : 'There is no time to solve against until one joint is driven. Right-click a grounded joint and switch on Driven Input.',
        at: candidate,
        action: candidate ? 'Go To Joint' : undefined,
      });
      break;
    }

    case 'cylinder-has-no-travel': {
      const id = mechanism.unusableCylinder;
      const subject = id ? `Cylinder ${helpers.cylinderName(id)}` : 'This cylinder';
      add({
        state: 'blocker',
        title: 'A cylinder has no travel',
        body: `${subject} has a barrel too short for its rod to slide in at all. Lengthen the cylinder, or reduce Object Scale — a larger scale draws everything on the rod bigger without lengthening the barrel.`,
      });
      break;
    }

    case 'dead-position':
      add({
        state: 'blocker',
        title: 'This mechanism starts at a dead position',
        body: 'The driven joint is at a limit of its travel and cannot turn away from it in either direction. Drag a joint to move the mechanism off the limit.',
      });
      break;

    case 'cycle-never-closes': {
      const gap = mechanism.cycleGap;
      add({
        state: 'blocker',
        title: 'The motion never repeats',
        body:
          'This mechanism never comes back to the pose it started in, so there is no cycle to animate.' +
          (gap !== undefined && Number.isFinite(gap)
            ? gap < 0.5
              ? ` The closest it comes is ${gap.toFixed(2)} units away — a loop that only just fails to close usually has a link length slightly off.`
              : ` The closest it comes is ${gap.toFixed(1)} units away — the motion wanders rather than repeating. Check the link lengths.`
            : ' Check the link lengths — a loop that only just closes can wander instead of repeating.'),
      });
      break;
    }

    case 'nothing-can-move': {
      const unreachable = partition.ownJoints.filter((joint) =>
        mechanism.unreachableJoints.includes(joint.id)
      );
      add({
        state: 'blocker',
        title: 'Nothing moves when the input turns',
        body:
          unreachable.length > 0
            ? `The solver never finds a position for ${
                unreachable.length === 1 ? 'joint' : 'joints'
              } ${names(unreachable)} — the driven joint cannot reach ${
                unreachable.length === 1 ? 'it' : 'them'
              } through the links. Check the connections between the input and ${
                unreachable.length === 1 ? 'that joint' : 'those joints'
              }.`
            : 'The driven joint cannot reach the rest of the mechanism, so no other joint has a position to solve for. Check that it is connected through links to the parts you expect it to move.',
        at: unreachable[0],
        action: unreachable.length > 0 ? 'Go To Joint' : undefined,
      });
      break;
    }
  }

  // Asked even of a mechanism the solver accepted: the toggle refuses a joint
  // it cannot describe, but nothing stops a later edit adding a third body to a
  // joint that was legitimately driven when it was switched on.
  const refusal = helpers.drivenRefusal(partition);
  if (refusal) {
    const driven = partition.ownJoints.find((joint) => joint instanceof RealJoint && joint.input);
    add({
      state: 'blocker',
      title: 'The driven joint cannot be driven',
      body: refusal,
      at: driven,
      action: driven ? 'Go To Joint' : undefined,
    });
  }

  const stroke = helpers.strokeWarning(partition);
  if (stroke) {
    add({ state: 'warning', title: 'A cylinder cannot use its whole stroke', body: stroke });
  }

  return {
    id: partition.id,
    ready: mechanism.isMechanismValid() && checks.every((check) => check.state !== 'blocker'),
    checks,
    facts: factsOf(partition, mechanism, helpers),
  };
}

/**
 * What a mechanism is, as opposed to what is wrong with it.
 *
 * A reader who has just been told their linkage is ready still has questions —
 * which joint drives it, how long a cycle takes, whether it goes round or backs
 * up — and until now the app answered none of them anywhere.
 */
function factsOf(
  partition: MechanismPartition,
  mechanism: Mechanism,
  helpers: ReadinessHelpers
): MechanismFact[] {
  const driven = partition.joints.find((joint) => joint instanceof RealJoint && joint.input) as
    RealJoint | undefined;
  const moving = partition.links.length;
  const dof = mechanism.dof;
  const facts: MechanismFact[] = [
    { label: 'Degrees of freedom', value: Number.isFinite(dof) ? String(dof) : '—' },
    { label: 'Links / joints', value: `${moving} / ${partition.ownJoints.length}` },
    { label: 'Driven joint', value: driven ? driven.name || driven.id : 'Not set' },
  ];
  if (mechanism.isMechanismValid()) {
    facts.push({ label: 'Input speed', value: helpers.describeSpeed(partition) });
    facts.push({ label: 'Cycle time', value: `${mechanism.cyclePeriod.toFixed(2)} s` });
    facts.push({
      label: 'Motion',
      value: reciprocates(mechanism) ? 'Reciprocating' : 'Continuous',
    });
  }
  return facts;
}

/**
 * Out and back, rather than round and round.
 *
 * Taken from the sign of the recorded input velocity, which the solver flips at
 * each reversal — so a cycle containing both signs is one that turned around.
 *
 * An earlier version compared a joint's position at the start and the midpoint,
 * which read every mechanism as reciprocating: the joint it sampled was the
 * first in the frame, and the first joint is usually ground, which never moves.
 */
function reciprocates(mechanism: Mechanism): boolean {
  const speeds = mechanism.inputAngularVelocities;
  return speeds.some((speed) => speed > 0) && speeds.some((speed) => speed < 0);
}

/** One condition force analysis needs, and whether the drawing meets it. */
export interface ForceRequirement {
  met: boolean;
  /**
   * Unmet-but-not-blocking: the analysis runs anyway, and the row is worth
   * reading before trusting the numbers. Warnings do not gate readiness and
   * are not counted by the "N to set" chips.
   */
  warning?: boolean;
  /** A short sentence-case phrase naming the condition. */
  title: string;
  /** Met: what is true. Unmet: what is missing, and how to supply it. */
  body: string;
  /**
   * A fix the panel can carry out itself, where there is one.
   *
   * Turning gravity back on is the only one so far, and only where it settles
   * the matter on its own. The other ways out of an unloaded drawing -- attach
   * a force, give a body mass -- are a gesture on the canvas and a row in the
   * table directly below, and a button here would stand in for neither.
   */
  act?: 'gravity';
}

export interface UnassignedReport {
  /** The part at fault, so the panel can offer to go to it. */
  at?: Joint;
  title: string;
  body: string;
}

/**
 * What to say about geometry that is in no mechanism.
 *
 * Split by cause, because the two have different ways out: a floating chain
 * needs grounding, a joint on its own needs connecting.
 */
export function describeUnassigned(unassigned: UnassignedGeometry): UnassignedReport[] {
  const reports: UnassignedReport[] = [];

  unassigned.floatingChains.forEach((chain) => {
    const sorted = [...chain.joints].sort((a, b) => a.id.localeCompare(b.id));
    reports.push({
      at: sorted[0],
      title: `Joints ${names(sorted)} never reach ground`,
      body: 'Nothing anchors this chain, so there is nothing for it to move against and no position to solve for. Ground one of its joints to make it a mechanism.',
    });
  });

  unassigned.fixedLinks.forEach((link) => {
    reports.push({
      title: `Link ${link.name || link.id} is fixed at both ends`,
      body: 'Every joint on it is grounded, so it is part of the frame and nothing about it can move. Unground one of its joints to make it a mechanism, or leave it as a fixed reference.',
    });
  });

  unassigned.looseJoints.forEach((joint) => {
    reports.push({
      at: joint,
      title: `Joint ${(joint as RealJoint).name || joint.id} has no link`,
      body: 'A joint on its own is not part of any mechanism and is skipped by analysis. Attach a link to it, or delete it.',
    });
  });

  return reports;
}
