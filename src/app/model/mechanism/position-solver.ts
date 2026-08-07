import { Joint, PrisJoint, RealJoint, RevJoint } from '../joint';
import { Link, RealLink, SliderBlock } from '../link';
import {
  circleCircleIntersection,
  circleLineIntersection,
  determineUnknownJointUsingTriangulation,
  euclideanDistance,
  roundNumber,
} from '../utils';
import { Force } from '../force';
import { Coord } from '../coord';
import { assemblyBodyIds, SlideAssembly, slideAssemblies, slotOffset } from '../slide-assembly';
import { core } from '@angular/compiler';
import { MODEL_SCALE } from '../render-scale';
import {
  Cylinder,
  cylinderJoints,
  cylinderStrokeAlong,
  sealedCylinderStructures,
} from '../cylinder';
import {
  Constraint,
  constraintRates,
  residuals,
  SimultaneousSystem,
  solveSimultaneous,
} from './simultaneous-solver';
import { angleReference, resolveActuator } from '../actuator';

/**
 * How far a driven prismatic input advances along its slot per solved sample,
 * in model length units.
 *
 * Exported because the sample spacing is what turns an input speed into a time
 * axis, and `Mechanism` was dividing a *rotational* step by the speed for every
 * input alike. A driven slider therefore ran on a clock that had nothing to do
 * with how fast it was told to move, and the value in the Input Speed box
 * changed nothing at all.
 */
// 0.1 of a user length unit, expressed in internal model units so the sampled
// motion is identical to what it was before the internal world scaled up.
export const PRISMATIC_INPUT_STEP = 0.1 * MODEL_SCALE;

/**
 * How many samples one stroke of a driven cylinder is cut into.
 *
 * A crank closes its cycle in 360 one-degree samples. A cylinder has no
 * revolution to close on — it runs to one end of its travel, reverses, runs to
 * the other and comes back — so the analogous constant is per *stroke*, and an
 * out-and-back cycle costs about the same 360 samples whatever the part
 * measures. The fixed `PRISMATIC_INPUT_STEP` cannot do that job: it samples a
 * long slot finely and a short one into a handful of frames.
 *
 * "About", because the samples are spaced from the pose the cylinder was drawn
 * in rather than from a limit, and the part of a step left over at each end of
 * the travel is not taken — so a cycle is 360 samples or two fewer.
 */
export const SAMPLES_PER_STROKE = 180;

/**
 * How far outside its stroke a solved pin may land before the step is refused.
 *
 * Positions are rounded to four decimals per timestep, so a command that lands
 * exactly on the end of the travel can measure a hair beyond it. Refusing that
 * would cut the stroke a sample short at each end and stop the cycle closing.
 */
const STROKE_TOLERANCE = 1e-3;

/**
 * How exactly a remembered pose still has to satisfy the constraints to be
 * reinstated. Looser than the solver's own tolerance, since a pose solved at
 * one command is being checked against the same command reached from the other
 * side, but far tighter than anything a reader could see.
 */
const POSE_RECALL_TOLERANCE = 1e-4;

/**
 * How close two solve-circle centres must be to count as coincident. Joint
 * positions are rounded to four decimals each timestep, so the bound is absolute
 * rather than mechanism-scale relative — matching circleCircleIntersection's own
 * tangent tolerance.
 */
const CONCENTRIC_TOLERANCE = 0.001;

/** How short a slot ray may get before its direction stops meaning anything. */
const DEGENERATE_SLOT_TOLERANCE = 1e-9;

/**
 * A slot is either fixed in the world or cut along the line joining two joints
 * of the link that carries it.
 */
type SlotLine =
  | { kind: 'fixed'; point: [number, number]; direction: [number, number] }
  | { kind: 'through'; startId: string; endId: string };

/**
 * Placing a carrier link from a point known to lie in its slot (§2.5a).
 *
 * The crank is driven in every mechanism of this shape, so the block is located
 * first and the slotted link's pose is what follows — which is why this solves a
 * set of joints rather than one.
 */
interface InverseSlotStep {
  /** Slot joint whose position is already known; the ray starts here. */
  anchorId: string;
  /** The sliding joint, known to lie on the slot: the ray passes through it. */
  blockId: string;
  /** Every joint of the carrier this step places. */
  targets: string[];
}

/**
 * Sliding a welded assembly along its guide until its own slot reaches the
 * block riding in it (docs/phase-3-slide-spec.md §3.6).
 *
 * The assembly cannot rotate — that is what the weld means — so it has exactly
 * one freedom and every joint of it moves by the same vector. That also makes
 * the slot's direction constant, which is what turns the constraint into a line
 * meeting a line rather than a circle meeting a moving line.
 */
interface SlideAssemblyStep {
  /** Direction of the assembly's guide, fixed in the world. */
  guide: [number, number];
  /** What pins the assembly down along that guide. */
  from:
    | {
        /** A member of the assembly some earlier step already placed. */
        kind: 'member';
        memberId: string;
      }
    | {
        /** A slot cut into the assembly, which must pass through its block. */
        kind: 'slot';
        /** The sliding joint riding in that slot; already located. */
        blockId: string;
        /**
         * A slot-defining joint of the assembly. The offset must be measured
         * from a point on the slot itself — any other member gives a line
         * parallel to it but displaced.
         */
        anchorId: string;
        /** Direction of the slot, constant because the assembly cannot turn. */
        slot: [number, number];
      };
  /** Every joint the step moves: the assembly's, minus anything grounded. */
  targets: string[];
}

/**
 * A sealed cylinder's interior, placed from its two mounts rather than solved
 * joint by joint (§ cylinder 1).
 *
 * The barrel and the rod are steel: their lengths are read once, at t = 0, and
 * held. Only the overlap between them changes, which is the whole of what a
 * cylinder does — and stating it this way is what keeps the part straight
 * without asking the solver to satisfy a collinearity constraint it has no
 * primitive for.
 */
interface CylinderInterior {
  barrelFarId: string;
  rodFarId: string;
  barrelNearId: string;
  pinId: string;
  sliderId: string;
  barrelLength: number;
  rodLength: number;
  /** The pin's travel inside the slot: where the stroke begins and ends. */
  minAlong: number;
  maxAlong: number;
}

/** The commanded extension of the one cylinder driving the mechanism (§5.1). */
interface CylinderDrive {
  /** The mount the rest of the mechanism already holds. */
  anchorMountId: string;
  /** The mount the command moves. */
  drivenMountId: string;
  /** Mount-to-mount length as of the last committed sample. */
  span: number;
  /** How far one sample extends it. */
  step: number;
}

export class PositionSolver {
  static desiredIndexWithinPosAnalysisMap = new Map<string, number>();
  static jointMapPositions = new Map<string, Array<number>>();
  /** One step behind jointMapPositions; see concentricSolution. */
  private static priorJointPositions = new Map<string, Array<number>>();
  static sliderAngleMap = new Map<string, number>();
  static desiredJointGroundIndexMap = new Map<string, number>();
  static unknownJointsIndicesMap = new Map<string, number[]>();
  static desiredLinkIndexMap = new Map<string, number>();
  /**
   * The solve order. A step positions a *set* of joints: the inverse slot
   * primitive settles a whole link's pose at once, and a later optimisation
   * fallback (§2.7a) would settle a whole simultaneous system at once.
   */
  static jointNumOrderSolverMap = new Map<number, string[]>();
  /** Steps actually emitted, which is no longer the same as the joint count. */
  static stepCount = 0;
  /** Joints no primitive could order; empty means the walk completed. */
  static unsolvableJoints: string[] = [];
  private static inverseSlotMap = new Map<string, InverseSlotStep>();
  private static slideAssemblyMap = new Map<string, SlideAssemblyStep>();
  /** Every sealed cylinder, keyed by the buried barrel end its step targets. */
  private static cylinderInteriorMap = new Map<string, CylinderInterior>();
  private static cylinderDrive?: CylinderDrive;
  /** The cylinder the input flag names, before the walk decides which end moves. */
  private static drivenCylinder?: Cylinder;
  /**
   * A driven *pin* (§2.9, Phase 6): the actuator's two bodies, as the three
   * points whose angle the drive prescribes. Held in the same shape as the
   * cylinder's record so one stepping path serves both.
   */
  private static pinDrive?: {
    pivotId: string;
    referenceId: string;
    drivenId: string;
    angle: number;
    step: number;
  };
  /** Joints no chain of dyads can place, and what they have to satisfy (§2.7a). */
  private static simultaneousSystem?: SimultaneousSystem;
  /** Poses already solved, with the length that produced them (§2.7a). */
  private static solvedPoses: { span: number; pose: Map<string, number[]> }[] = [];
  /**
   * The command this timestep proposed, held back until every other step has
   * agreed to it. A sample the mechanism refuses must leave the commanded
   * length exactly where it was, or the reversal would come back on a different
   * grid from the one it went out on and the cycle would never close.
   */
  private static pendingSpan?: number;
  /**
   * Sample spacing a driven cylinder asks for — its stroke cut into
   * `SAMPLES_PER_STROKE`. Undefined when nothing prismatic is driving.
   */
  static drivenSampleStep?: number;
  private static internalTriangleValuesMap = new Map<string, number[]>();
  private static desiredConnectedJointIndicesMap = new Map<string, number[]>();
  private static desiredAnalysisJointMap = new Map<string, string>();
  private static jointDistMap = new Map<string, number>();
  private static initialJointPosMap = new Map<string, [number, number]>();
  /**
   * How to find each sliding joint's slot line.
   *
   * A guide fixed in the world is a point and a direction, settled once. A slot
   * cut into a moving link is not: it is the line through two of that link's
   * joints (§2.4), and it points somewhere different at every timestep, so what
   * gets stored is the pair of joints rather than an answer.
   */
  private static slotLineMap = new Map<string, SlotLine>();
  static forcePositionMap = new Map<string, Coord>();
  static forceMagnitudeMap = new Map<string, number>();

  static resetStaticVariables() {
    this.desiredIndexWithinPosAnalysisMap = new Map<string, number>();
    this.jointMapPositions = new Map<string, Array<number>>();
    this.priorJointPositions = new Map<string, Array<number>>();
    this.sliderAngleMap = new Map<string, number>();
    this.desiredJointGroundIndexMap = new Map<string, number>();
    this.unknownJointsIndicesMap = new Map<string, number[]>();
    this.desiredLinkIndexMap = new Map<string, number>();
    this.internalTriangleValuesMap = new Map<string, number[]>();
    this.jointNumOrderSolverMap = new Map<number, string[]>();
    this.desiredConnectedJointIndicesMap = new Map<string, number[]>();
    this.desiredAnalysisJointMap = new Map<string, string>();
    this.jointDistMap = new Map<string, number>();
    this.initialJointPosMap = new Map<string, [number, number]>();
    this.slotLineMap = new Map<string, SlotLine>();
    this.inverseSlotMap = new Map<string, InverseSlotStep>();
    this.slideAssemblyMap = new Map<string, SlideAssemblyStep>();
    this.cylinderInteriorMap = new Map<string, CylinderInterior>();
    this.cylinderDrive = undefined;
    this.drivenCylinder = undefined;
    this.pinDrive = undefined;
    this.simultaneousSystem = undefined;
    this.solvedPoses = [];
    this.pendingSpan = undefined;
    this.drivenSampleStep = undefined;
    this.stepCount = 0;
    this.unsolvableJoints = [];
  }

  static determineJointOrder(joints: Joint[], links: Link[]) {
    const knownJointsIds: string[] = [];
    let orderNum = 1;
    // pre-condition: Save all the joints as initial Values
    joints.forEach((j) => {
      this.initialJointPosMap.set(j.id, [j.x, j.y]);
    });

    // 1st: store all ground joints as known joints
    joints.forEach((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      if (j instanceof PrisJoint) {
        this.sliderAngleMap.set(j.id, j.slotAngle);
      }
      if (!j.ground) {
        return;
      }
      knownJointsIds.push(j.id);
      // Ground joints are known but no step ever writes them, so seed their
      // positions here. Steps that read a reference position straight out of
      // the map -- rather than falling back to the joint object -- otherwise
      // find nothing there and report the mechanism unsolvable.
      this.jointMapPositions.set(j.id, [j.x, j.y]);
    });
    // 2nd: determine joints that neighbor the input joint
    const inputJointIndex = joints.findIndex((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      return j.input;
    });
    const inputJoint = joints[inputJointIndex];
    if (!(inputJoint instanceof RealJoint)) {
      return;
    }
    // The drive turns one body, so only that body's joints travel with it.
    //
    // Every joint connected to the input used to be swung round it by the same
    // degree per sample. That is right for a ternary crank -- its joints are one
    // rigid body and do move together -- and wrong the moment a second link is
    // pinned to the same ground pivot: the two are free to turn relative to each
    // other, so driving both imposes a rigidity the mechanism does not have. On
    // a bar carrying two blocks, each pushed by its own crank off one pivot, the
    // second crank's joint was carried round instead of being solved, and its
    // block left the bar entirely -- nearly two units off at the widest.
    // Every sealed cylinder is placed as one part, driven or not: its interior
    // follows from its two mounts. That is also what makes a Slide on a moving
    // carrier solvable at all — the pin rides a slot whose own direction is
    // still being solved, so no primitive that measures the slot first can
    // reach it.
    const cylinders = this.registerSealedCylinders(joints);
    const driven = this.drivenBody(inputJoint);
    const tracer_joints: Joint[] = [];
    // A driven cylinder commands a length between two mounts rather than a step
    // taken by a neighbour of the input joint, so the drive loop below has
    // nothing to say about it; the deferred sweep places both mounts instead.
    // A driven *pin* that is not grounded is the same situation for a different
    // reason (§2.9): the walk starts at the input joint and swings its
    // neighbours about it, which assumes the input's own position is known. A
    // floating pin's is not, so it too goes to the constraint set.
    if (this.registerCylinderDrive(cylinders, inputJoint) || this.registerPinDrive(inputJoint)) {
      orderNum = this.orderDeferredJoints(joints, links, orderNum, knownJointsIds);
      this.finishOrder(joints, links, orderNum, knownJointsIds);
      return;
    }

    // A floating input the actuator record cannot describe -- three bodies at
    // the joint, say, which "driven" does not say which pair of. The drive loop
    // below would swing this joint's neighbours *about* it, which is only
    // meaningful when the joint itself is held: for a grounded crank it is, and
    // for a floating pin nothing holds it at all. Left to fall through, the
    // mechanism reported itself valid and animated a pin that never moved,
    // tearing the links that reach it. Refuse instead, and let the panel say
    // why (§2.9).
    if (!(inputJoint instanceof PrisJoint) && !inputJoint.ground) {
      this.finishOrder(joints, links, orderNum, knownJointsIds);
      return;
    }
    inputJoint.connectedJoints.forEach((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      if (j.ground) {
        return;
      }
      if (!driven.has(j.id)) {
        return;
      }
      // if (j.ground && j.constructor !== PrisJoint) {
      //   return;
      // }
      // store the solved number
      this.jointNumOrderSolverMap.set(orderNum++, [j.id]);
      // store desired joints as input joint and current_joint
      // const currentJointIndex = simJoints.findIndex(jt => jt.id === current_joint.id);
      this.desiredConnectedJointIndicesMap.set(j.id, [inputJointIndex]);
      // store the solve type from the input solver
      switch (inputJoint.constructor) {
        case RevJoint: {
          this.desiredAnalysisJointMap.set(j.id, 'incrementRevInput');
          this.jointDistMap.set(
            inputJoint.id + ',' + j.id,
            euclideanDistance(inputJoint.x, inputJoint.y, j.x, j.y)
          );
          break;
        }
        case PrisJoint: {
          this.desiredAnalysisJointMap.set(j.id, 'incrementPrisInput');
          break;
        }
      }
      knownJointsIds.push(j.id);
      tracer_joints.push(j);
    });
    tracer_joints.forEach((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      orderNum = this.detJointOrder(joints, links, j, orderNum, knownJointsIds);
    });

    orderNum = this.orderDeferredJoints(joints, links, orderNum, knownJointsIds);
    this.finishOrder(joints, links, orderNum, knownJointsIds);
  }

  /**
   * Close the walk: how many steps it emitted, and what it could not reach.
   *
   * What it could not reach is not necessarily a mistake. A set of joints that
   * only locate each other is a simultaneous system (§2.7a), and it gets one
   * final step of its own; only joints left over after *that* are unsolvable.
   */
  private static finishOrder(
    joints: Joint[],
    links: Link[],
    orderNum: number,
    known: string[]
  ): void {
    const pending = joints
      .filter((j): j is RealJoint => j instanceof RealJoint && !j.ground && !known.includes(j.id))
      .map((j) => j.id);

    if (pending.length > 0) {
      const system = this.buildSimultaneousSystem(joints, links, pending);
      if (system) {
        this.simultaneousSystem = system;
        this.desiredConnectedJointIndicesMap.set(pending[0], []);
        this.desiredAnalysisJointMap.set(pending[0], 'simultaneousSystem');
        this.jointNumOrderSolverMap.set(orderNum, pending);
        orderNum++;
        pending.forEach((id) => known.push(id));
      }
    }

    this.stepCount = orderNum - 1;
    this.unsolvableJoints = joints
      .filter((j) => j instanceof RealJoint && !j.ground && !known.includes(j.id))
      .map((j) => j.id);
  }

  /**
   * Write down what the unsolved joints have to satisfy, as constraints.
   *
   * Everything the model already says, said once more in a form Newton can
   * read: a link holds its joints at fixed distances, a block is a single
   * point, a slider stays on its slot, a weld keeps a rider parallel to the
   * slot it rides, and the drive prescribes one length. A constraint is emitted
   * only when it touches an unknown — anything among joints the walk already
   * placed is satisfied and would only make the system redundant.
   */
  private static buildSimultaneousSystem(
    joints: Joint[],
    links: Link[],
    unknownIds: string[]
  ): SimultaneousSystem | undefined {
    const unknown = new Set(unknownIds);
    const touches = (...ids: string[]) => ids.some((id) => unknown.has(id));
    const constraints: Constraint[] = [];
    const at = (joint: Joint): [number, number] => [joint.x, joint.y];

    for (const link of links) {
      const members = link.joints;
      if (link instanceof SliderBlock) {
        // §2.10 item 1: the block is zero-length, so its two joints are one
        // point rather than two at a fixed distance.
        if (members.length === 2 && touches(members[0].id, members[1].id)) {
          constraints.push({ kind: 'coincident', a: members[0].id, b: members[1].id });
        }
        continue;
      }
      if (members.length < 2) continue;
      // A rigid body of n joints is pinned by 2n-3 distances: the first pair,
      // then every other joint tied to both of them. Every pair would say the
      // same thing several times over and leave the system redundant.
      const [first, second, ...rest] = members;
      if (touches(first.id, second.id)) {
        constraints.push({
          kind: 'distance',
          a: first.id,
          b: second.id,
          length: euclideanDistance(first.x, first.y, second.x, second.y),
        });
      }
      for (const member of rest) {
        for (const anchor of [first, second]) {
          if (!touches(member.id, anchor.id)) continue;
          constraints.push({
            kind: 'distance',
            a: member.id,
            b: anchor.id,
            length: euclideanDistance(member.x, member.y, anchor.x, anchor.y),
          });
        }
      }
    }

    for (const joint of joints) {
      if (!(joint instanceof PrisJoint)) continue;
      if (joint.isFloating && joint.slotJointA && joint.slotJointB) {
        if (touches(joint.id, joint.slotJointA.id, joint.slotJointB.id)) {
          constraints.push({
            kind: 'onLine',
            point: joint.id,
            from: joint.slotJointA.id,
            to: joint.slotJointB.id,
          });
        }
      } else if (joint.ground) {
        if (touches(joint.id)) {
          constraints.push({
            kind: 'onFixedLine',
            point: joint.id,
            at: at(joint),
            dir: [Math.cos(joint.angle_rad), Math.sin(joint.angle_rad)],
          });
        }
      } else {
        // A slider with nothing to slide along: no constraint exists to write.
        return undefined;
      }
    }

    // A weld at a block is what stops the rider turning inside its slot, and
    // nothing above says so — the rider's distances leave it free to rotate.
    for (const assembly of slideAssemblies(joints)) {
      const slider = assembly.slider;
      const rider = assembly.riders[0];
      const other = rider?.joints.find((member) => member.id !== assembly.weldJoint.id);
      if (!rider || !other) continue;
      if (!touches(assembly.weldJoint.id, other.id, slider.id)) continue;
      if (slider.isFloating && slider.slotJointA && slider.slotJointB) {
        constraints.push({
          kind: 'parallel',
          a1: assembly.weldJoint.id,
          a2: other.id,
          b1: slider.slotJointA.id,
          b2: slider.slotJointB.id,
        });
      }
    }

    const drive = this.drivenConstraint(joints, unknown);
    if (!drive) return undefined;
    constraints.push(drive);

    return { unknownIds, constraints };
  }

  /**
   * The one length the drive prescribes.
   *
   * A driven cylinder commands the distance between its mounts, which is the
   * same quantity `drivenCylinderMount` steps when the walk can place it the
   * ordinary way. A driven crank commands its own angle, which reaches the
   * system as the distance from the far end of the crank to a point fixed in
   * the world — the chord, which is what a prescribed angle is once the radius
   * is already held by the link.
   */
  private static drivenConstraint(joints: Joint[], unknown: Set<string>): Constraint | undefined {
    const cylinder = this.drivenCylinder;
    if (cylinder) {
      const drive = this.cylinderDrive ?? {
        anchorMountId: cylinder.barrelFar.id,
        drivenMountId: cylinder.rodFar.id,
        span: euclideanDistance(
          cylinder.barrelFar.x,
          cylinder.barrelFar.y,
          cylinder.rodFar.x,
          cylinder.rodFar.y
        ),
        step: this.drivenSampleStep ?? PRISMATIC_INPUT_STEP,
      };
      this.cylinderDrive = drive;
      return { kind: 'driven', a: drive.drivenMountId, b: drive.anchorMountId };
    }
    const pin = this.pinDrive;
    if (pin) {
      return {
        kind: 'drivenAngle',
        pivot: pin.pivotId,
        reference: pin.referenceId,
        driven: pin.drivenId,
      };
    }
    return undefined;
  }

  /**
   * Take the input flag on a floating pin as a command to turn one of its two
   * bodies relative to the other (§2.9).
   *
   * Grounded inputs are deliberately left alone. Their existing path works, and
   * "the crank turns one degree per sample about a pivot that does not move" is
   * both cheaper and better conditioned than asking a constraint set the same
   * question.
   */
  private static registerPinDrive(inputJoint: RealJoint): boolean {
    if (inputJoint instanceof PrisJoint || inputJoint.ground) {
      return false;
    }
    const actuator = resolveActuator(inputJoint);
    if (!actuator || actuator.kind !== 'angle') {
      return false;
    }
    const reference = angleReference(actuator.referenceBody, inputJoint);
    const driven = angleReference(actuator.drivenBody, inputJoint);
    if (!reference || !driven) {
      return false;
    }
    const ax = reference.x - inputJoint.x;
    const ay = reference.y - inputJoint.y;
    const wx = driven.x - inputJoint.x;
    const wy = driven.y - inputJoint.y;
    this.pinDrive = {
      pivotId: inputJoint.id,
      referenceId: reference.id,
      drivenId: driven.id,
      // The angle the mechanism was drawn at; the drive walks away from it.
      angle: Math.atan2(ax * wy - ay * wx, ax * wx + ay * wy),
      // One degree a sample, exactly as a crank turns, so a driven pin closes
      // its cycle on the same 360-sample count.
      step: Math.PI / 180,
    };
    return true;
  }

  /**
   * Record every sealed cylinder's members and the stroke they allow.
   *
   * Lengths are measured once, here, from the t = 0 pose. Re-measuring them per
   * timestep would let the part grow by whatever the last solve's rounding
   * left behind, which over a few hundred samples is a visibly longer cylinder.
   */
  private static registerSealedCylinders(joints: Joint[]): Cylinder[] {
    const cylinders = sealedCylinderStructures(joints);
    for (const cylinder of cylinders) {
      const { barrelFar, barrelNear, pin, slider, rodFar } = cylinder;
      const barrelLength = euclideanDistance(barrelFar.x, barrelFar.y, barrelNear.x, barrelNear.y);
      const stroke = cylinderStrokeAlong(barrelLength);
      this.cylinderInteriorMap.set(barrelNear.id, {
        barrelFarId: barrelFar.id,
        rodFarId: rodFar.id,
        barrelNearId: barrelNear.id,
        pinId: pin.id,
        sliderId: slider.id,
        barrelLength,
        rodLength: euclideanDistance(pin.x, pin.y, rodFar.x, rodFar.y),
        minAlong: stroke.min,
        maxAlong: stroke.max,
      });
    }
    return cylinders;
  }

  /**
   * Take the input flag on a sealed slider as a command to extend that
   * cylinder, and settle how finely the stroke is sampled.
   *
   * A cylinder with no travel left to give is not a drive; saying so here is
   * what keeps the mechanism reporting itself unsolvable rather than dividing
   * the sample step by zero.
   */
  private static registerCylinderDrive(cylinders: Cylinder[], inputJoint: RealJoint): boolean {
    if (!(inputJoint instanceof PrisJoint) || !inputJoint.isSealed) {
      return false;
    }
    const cylinder = cylinders.find((candidate) => candidate.slider.id === inputJoint.id);
    const interior = cylinder && this.cylinderInteriorMap.get(cylinder.barrelNear.id);
    if (!interior) {
      return false;
    }
    const stroke = interior.maxAlong - interior.minAlong;
    if (!(stroke > DEGENERATE_SLOT_TOLERANCE)) {
      return false;
    }
    this.drivenSampleStep = stroke / SAMPLES_PER_STROKE;
    this.drivenCylinder = cylinder;
    return true;
  }

  /**
   * The joints the drive carries with it: those of the one link it turns.
   *
   * A ground pivot can hold several links, and only one of them is being
   * driven. Which one is not something the model says, so the first non-block
   * link on the joint is taken and the rest are left to the solver — the same
   * arbitrary-but-consistent choice `incrementRevInput` was already making when
   * it picked a neighbour to measure the crank radius from.
   */
  private static drivenBody(inputJoint: RealJoint): Set<string> {
    const body = inputJoint.links.find(
      (link) => !link.joints.some((joint) => joint instanceof PrisJoint)
    );
    const members = (body ?? inputJoint.links[0])?.joints ?? [];
    return new Set(members.filter((joint) => joint.id !== inputJoint.id).map((joint) => joint.id));
  }

  /**
   * Keep sweeping the joints the walk above could not place, until a sweep
   * achieves nothing.
   *
   * The walk is a single pass, so it can only order a joint whose references
   * happen to be known by the time it arrives. That was safe while the only
   * slots were grounded ones, whose position is known before the walk starts.
   * A slot on a moving link is not: the carrier may be reached before the block
   * that locates it, or the other way round, and which of those happens depends
   * on the order the joints were drawn in.
   *
   * When a sweep places nothing and joints remain, they are a simultaneous
   * system rather than a mistake (§2.7a). v1 names them and stops.
   */
  private static orderDeferredJoints(
    joints: Joint[],
    links: Link[],
    orderNum: number,
    known: string[]
  ): number {
    let progress = true;
    while (progress) {
      progress = false;
      const pending = joints.filter(
        (j): j is RealJoint => j instanceof RealJoint && !known.includes(j.id)
      );
      for (const joint of pending) {
        // The two cylinder primitives come first. A sealed cylinder's joints
        // also match the generic slot primitives, and letting one of those win
        // would solve the part joint by joint — which is exactly the freedom
        // sealing it took away.
        const advanced =
          this.orderDrivenCylinderMount(joints, links, joint, orderNum, known) ??
          this.orderSealedCylinderInterior(joints, links, joint, orderNum, known) ??
          this.orderCoincidentBlock(joints, joint, orderNum, known) ??
          this.orderCarrierFromBlock(joints, links, joint, orderNum, known) ??
          this.orderSlideAssembly(joints, links, joint, orderNum, known) ??
          this.orderRiderOnMovingSlot(joints, links, joint, orderNum, known);
        if (advanced !== undefined) {
          orderNum = advanced;
          progress = true;
        }
      }
    }
    return orderNum;
  }

  /**
   * Place the mount a driven cylinder pushes (§5.1).
   *
   * The constraint is `|P₁P₂| = s(t)` and nothing more: a circle about the
   * mount the mechanism already holds, of the commanded radius, meeting the
   * circle that the driven mount's own body sweeps. That is the ordinary dyad,
   * with one radius that changes per sample instead of staying put — no slot
   * line, and no ordering problem.
   *
   * v1 requires one mount to be reachable before the other. A cylinder floating
   * between two moving bodies prescribes a length between two unknowns, which
   * is the simultaneous system Phase 6 exists for; it reports unsolvable here
   * rather than picking one and drawing something plausible.
   */
  private static orderDrivenCylinderMount(
    joints: Joint[],
    links: Link[],
    joint: RealJoint,
    orderNum: number,
    known: string[]
  ): number | undefined {
    const cylinder = this.drivenCylinder;
    if (!cylinder || known.includes(joint.id)) {
      return undefined;
    }
    const mounts = [cylinder.barrelFar, cylinder.rodFar];
    if (!mounts.some((mount) => mount.id === joint.id)) {
      return undefined;
    }
    const anchor = mounts.find((mount) => mount.id !== joint.id)!;
    if (!known.includes(anchor.id)) {
      return undefined;
    }
    // The second circle has to come from the driven mount's *own* body. A
    // reference reached back through the cylinder would be constrained by the
    // very length being commanded, and the two circles would be the same one.
    const members = new Set(cylinderJoints(cylinder).map((member) => member.id));
    const reference = joint.connectedJoints.find(
      (candidate) => known.includes(candidate.id) && !members.has(candidate.id)
    );
    if (!reference) {
      return undefined;
    }

    const span = euclideanDistance(joint.x, joint.y, anchor.x, anchor.y);
    this.desiredConnectedJointIndicesMap.set(joint.id, [
      joints.findIndex((j) => j.id === anchor.id),
      joints.findIndex((j) => j.id === reference.id),
    ]);
    this.desiredAnalysisJointMap.set(joint.id, 'drivenCylinderMount');
    this.jointNumOrderSolverMap.set(orderNum, [joint.id]);
    this.jointDistMap.set(
      joint.id + ',' + reference.id,
      euclideanDistance(joint.x, joint.y, reference.x, reference.y)
    );
    // Rewritten every sample; seeded here so the first solve has a radius.
    this.jointDistMap.set(joint.id + ',' + anchor.id, span);
    this.cylinderDrive = {
      anchorMountId: anchor.id,
      drivenMountId: joint.id,
      span,
      step: this.drivenSampleStep ?? PRISMATIC_INPUT_STEP,
    };
    known.push(joint.id);
    return this.detJointOrder(joints, links, joint, orderNum + 1, known);
  }

  /**
   * Place a sealed cylinder's interior once both its mounts are known.
   *
   * One step for three joints, because they are one part: the buried barrel end
   * at the barrel's length from its mount, the pin wherever the rod's length
   * leaves it, and the sliding joint on top of the pin (§2.10 item 2).
   */
  private static orderSealedCylinderInterior(
    joints: Joint[],
    links: Link[],
    joint: RealJoint,
    orderNum: number,
    known: string[]
  ): number | undefined {
    const interior = [...this.cylinderInteriorMap.values()].find((candidate) =>
      [candidate.barrelNearId, candidate.pinId, candidate.sliderId].includes(joint.id)
    );
    if (!interior || known.includes(interior.barrelNearId)) {
      return undefined;
    }
    if (!known.includes(interior.barrelFarId) || !known.includes(interior.rodFarId)) {
      return undefined;
    }

    const targets = [interior.barrelNearId, interior.pinId, interior.sliderId];
    this.desiredConnectedJointIndicesMap.set(interior.barrelNearId, []);
    this.desiredAnalysisJointMap.set(interior.barrelNearId, 'sealedCylinderInterior');
    this.jointNumOrderSolverMap.set(orderNum, targets);
    targets.forEach((id) => known.push(id));

    let next = orderNum + 1;
    // Whatever hangs off the rod or the barrel can now be walked normally.
    for (const id of targets) {
      const placed = joints.find((j) => j.id === id);
      if (placed instanceof RealJoint) {
        next = this.detJointOrder(joints, links, placed, next, known);
      }
    }
    return next;
  }

  /**
   * Extend the driven cylinder by one sample and solve the mount it pushes.
   *
   * The command advances on a grid anchored at the starting length, so a
   * reversal retraces the samples it went out on and the cycle closes exactly
   * where it began. Measuring the current length back off the joints instead
   * would let each sample's rounding accumulate, and the return trip would miss
   * the start by a little more every stroke.
   */
  private static drivenCylinderMount(joints: Joint[], joint: Joint, forward: boolean): boolean {
    const drive = this.cylinderDrive;
    const indices = this.desiredConnectedJointIndicesMap.get(joint.id);
    if (!drive || !indices) {
      return false;
    }
    const next = drive.span + (forward ? drive.step : -drive.step);
    this.jointDistMap.set(drive.drivenMountId + ',' + drive.anchorMountId, next);
    const solved = this.twoCircleIntersectionPoints(joints[indices[0]], joints[indices[1]], joint);
    if (solved) {
      this.pendingSpan = next;
    }
    return solved;
  }

  /**
   * Derive a sealed cylinder's interior from its mounts, and refuse the pose if
   * the rod has been pulled out of the barrel.
   *
   * The stroke is the same travel the drawing cuts its slot to, so a refusal
   * here is the part reaching the end of its own extension. The mechanism reads
   * that the way it reads any other limit — it reverses.
   */
  private static sealedCylinderInterior(targets: string[]): boolean {
    const interior = this.cylinderInteriorMap.get(targets[0]);
    if (!interior) {
      return false;
    }
    const barrelMount = this.jointMapPositions.get(interior.barrelFarId);
    const rodMount = this.jointMapPositions.get(interior.rodFarId);
    if (!barrelMount || !rodMount) {
      return false;
    }
    const dx = rodMount[0] - barrelMount[0];
    const dy = rodMount[1] - barrelMount[1];
    const span = Math.hypot(dx, dy);
    if (span < DEGENERATE_SLOT_TOLERANCE) {
      return false;
    }
    const along = span - interior.rodLength;
    if (
      along < interior.minAlong - STROKE_TOLERANCE ||
      along > interior.maxAlong + STROKE_TOLERANCE
    ) {
      return false;
    }

    const ux = dx / span;
    const uy = dy / span;
    this.recordJointPosition(
      interior.barrelNearId,
      barrelMount[0] + interior.barrelLength * ux,
      barrelMount[1] + interior.barrelLength * uy
    );
    const pinX = barrelMount[0] + along * ux;
    const pinY = barrelMount[1] + along * uy;
    this.recordJointPosition(interior.pinId, pinX, pinY);
    this.recordJointPosition(interior.sliderId, pinX, pinY);
    return true;
  }

  /**
   * Put the drawn pose exactly on its own constraints, before sampling starts.
   *
   * A linkage placed by hand never satisfies its constraints to the last
   * decimal, and the dyad walk hides that by deriving every position from
   * lengths measured at t = 0. A simultaneous solve cannot: its first sample
   * corrects the pose onto the constraint manifold and moves every joint a
   * fraction of a unit, permanently. The cycle then never closes, because the
   * mechanism is being asked to come back to a pose it was never actually in,
   * and the run ends at the sample cap reporting an invalid mechanism.
   *
   * The correction is far below anything visible — thousandths of a user unit
   * on a hand-drawn linkage — and it is the honest rest pose.
   */
  static settleInitialPose(joints: Joint[]): void {
    const system = this.simultaneousSystem;
    const drive = this.cylinderDrive;
    if (!system || !drive) {
      return;
    }
    for (const id of system.unknownIds) {
      if (!this.jointMapPositions.has(id)) {
        const joint = joints.find((candidate) => candidate.id === id);
        if (joint) this.jointMapPositions.set(id, [joint.x, joint.y]);
      }
    }
    const drawn = new Map(
      system.unknownIds.map((id) => [id, [...this.jointMapPositions.get(id)!]])
    );
    // A mechanism can be drawn exactly on a limit of its own travel — a toggle
    // clamp usually is, since the clamped pose is the dead-centre. The solve
    // there is singular and cannot converge, so settle at the nearest command
    // that *can* be reached instead. The offsets below are thousandths of a
    // sample, and the pose moves by a few thousandths of a unit with them.
    let settledSpan = drive.span;
    let settled = solveSimultaneous(system, this.jointMapPositions, settledSpan);
    if (!settled) {
      const nudges = [1e-3, 1e-2, 1e-1, 1].flatMap((size) => [size, -size]);
      for (const nudge of nudges) {
        drawn.forEach((position, id) => this.jointMapPositions.set(id, [...position]));
        settledSpan = drive.span + nudge * drive.step;
        if (solveSimultaneous(system, this.jointMapPositions, settledSpan)) {
          settled = true;
          break;
        }
      }
    }
    if (!settled) {
      drawn.forEach((position, id) => this.jointMapPositions.set(id, [...position]));
      return;
    }
    drive.span = settledSpan;
    for (const id of system.unknownIds) {
      const settled = this.jointMapPositions.get(id)!;
      const joint = joints.find((candidate) => candidate.id === id);
      if (joint) {
        joint.x = roundNumber(settled[0], 4);
        joint.y = roundNumber(settled[1], 4);
      }
      this.jointMapPositions.set(id, [roundNumber(settled[0], 4), roundNumber(settled[1], 4)]);
    }
    // The pose the motion has to come back to, which is the one command a
    // solve approaching from the other side may not manage on its own.
    this.rememberPose(system, drive.span);
  }

  /**
   * Velocities and accelerations for a mechanism the constraint set solved.
   *
   * The command is *measured* from the pose rather than read from the drive's
   * running total: the analysis panel asks about one timestep at a time, long
   * after the precompute walked past it, and the pose satisfies the constraint
   * exactly, so measuring it is not an approximation.
   */
  static constraintKinematics(
    joints: Joint[],
    links: Link[],
    commandRate: number
  ):
    | { velocity: Map<string, [number, number]>; acceleration: Map<string, [number, number]> }
    | undefined {
    // Only for the drives the loop formulation cannot express. A grounded crank
    // keeps the existing, MATLAB-verified path: it is cheaper, and replacing a
    // checked answer with an unchecked one is not an improvement.
    if (!this.cylinderDrive && !this.pinDrive) {
      return undefined;
    }
    // The constraint set describes the mechanism whatever route the positions
    // took, so a mechanism the *walk* solved still has one to differentiate --
    // it just has not been built yet.
    const system =
      this.simultaneousSystem ??
      this.buildSimultaneousSystem(
        joints,
        links,
        joints
          .filter((joint): joint is RealJoint => joint instanceof RealJoint && !joint.ground)
          .map((joint) => joint.id)
      );
    if (!system) {
      return undefined;
    }
    const positions = new Map<string, number[]>();
    joints.forEach((joint) => positions.set(joint.id, [joint.x, joint.y]));

    const at = (id: string) => positions.get(id) ?? [0, 0];
    let command: number | undefined;
    const cylinder = this.cylinderDrive;
    if (cylinder) {
      const [ax, ay] = at(cylinder.anchorMountId);
      const [dx, dy] = at(cylinder.drivenMountId);
      command = Math.hypot(dx - ax, dy - ay);
    }
    const pin = this.pinDrive;
    if (pin) {
      const [px, py] = at(pin.pivotId);
      const [rx, ry] = at(pin.referenceId);
      const [dx, dy] = at(pin.drivenId);
      const ux = rx - px;
      const uy = ry - py;
      const wx = dx - px;
      const wy = dy - py;
      command = Math.atan2(ux * wy - uy * wx, ux * wx + uy * wy);
    }
    if (command === undefined) {
      return undefined;
    }
    return constraintRates(system, positions, command, commandRate);
  }

  /**
   * Settle a whole simultaneous system at once (§2.7a).
   *
   * Seeded from where these joints were last time — which for the first sample
   * is where the user drew them. That seed is the assembly mode: the same
   * constraints are satisfied by the mirror image and by the far branch of
   * every dyad in the set, and nothing but continuity distinguishes the one the
   * mechanism actually reached.
   */
  private static simultaneous(joints: Joint[], forward: boolean): boolean {
    const system = this.simultaneousSystem;
    // A cylinder commands a length and a pin commands an angle; both advance by
    // a fixed step from where they were, so the stepping is the same either way.
    const drive = this.cylinderDrive ?? this.pinDrive;
    if (!system || !drive) {
      return false;
    }
    const current = 'span' in drive ? drive.span : drive.angle;
    const next = current + (forward ? drive.step : -drive.step);
    if (!this.withinStroke(next)) {
      return false;
    }

    // Anything the system has not been told about yet starts where the joint
    // object stands, which is the previous sample's pose.
    for (const id of system.unknownIds) {
      if (!this.jointMapPositions.has(id)) {
        const joint = joints.find((candidate) => candidate.id === id);
        if (joint) this.jointMapPositions.set(id, [joint.x, joint.y]);
      }
    }

    const before = new Map(
      system.unknownIds.map((id) => [id, [...this.jointMapPositions.get(id)!]])
    );
    const restore = () =>
      before.forEach((position, id) => this.jointMapPositions.set(id, [...position]));

    if (!this.reachSpan(system, current, next, restore)) {
      // Leave the pose exactly as it was: a half-converged answer drawn once is
      // a mechanism that visibly tears itself apart at the limit.
      restore();
      return false;
    }

    for (const id of system.unknownIds) {
      const solved = this.jointMapPositions.get(id)!;
      this.recordJointPosition(id, solved[0], solved[1]);
    }
    this.pendingSpan = next;
    return true;
  }

  /**
   * Drive the commanded length from one value to another, in as many goes as
   * it takes.
   *
   * One jump is right almost always. It is wrong approaching a dead-centre,
   * where a short command moves the mechanism a long way: the seed then lands
   * outside the basin the answer is in and the solve stalls, which reads as a
   * limit the mechanism does not actually have. Walking the same interval in
   * halves keeps every seed close to its answer. A genuine limit still fails,
   * because no subdivision of an unreachable command becomes reachable.
   */
  private static reachSpan(
    system: SimultaneousSystem,
    from: number,
    to: number,
    restore: () => void
  ): boolean {
    if (solveSimultaneous(system, this.jointMapPositions, to)) {
      this.rememberPose(system, to);
      return true;
    }
    for (const divisions of [2, 4, 8, 16]) {
      restore();
      let reached = true;
      for (let part = 1; part <= divisions && reached; part++) {
        const between = from + ((to - from) * part) / divisions;
        reached = solveSimultaneous(system, this.jointMapPositions, between);
      }
      if (reached) {
        this.rememberPose(system, to);
        return true;
      }
    }

    // Last resort: this exact command may have been solved on the way out.
    //
    // Iteration cannot always come back to a *limit* of travel. At one the
    // solution curve folds — two poses either side merge into one — and the
    // Jacobian there is singular, so a solve approaching it converges slower
    // and slower and gives up a sample short. The pose is not unknown though:
    // the mechanism was standing in it a moment ago, and a 1-DOF linkage
    // retracing its own commands passes back through the same poses. Reinstate
    // it, having checked that it still satisfies every constraint.
    const remembered = this.recallPose(to);
    if (remembered) {
      restore();
      remembered.forEach((position, id) => this.jointMapPositions.set(id, [...position]));
      const off = residuals(system, this.jointMapPositions, to);
      if (Math.max(...off.map(Math.abs)) < POSE_RECALL_TOLERANCE) {
        return true;
      }
      restore();
    }
    return false;
  }

  /**
   * The pose solved at this command, if there was one.
   *
   * Matched by nearness rather than by an exact key: the command is stepped by
   * repeated addition, so the value on the way back down is the same number
   * only to within the drift of two dozen float operations.
   */
  private static recallPose(span: number): Map<string, number[]> | undefined {
    const tolerance = Math.max(Math.abs(span), 1) * 1e-9;
    return this.solvedPoses.find((entry) => Math.abs(entry.span - span) <= tolerance)?.pose;
  }

  private static rememberPose(system: SimultaneousSystem, span: number): void {
    this.solvedPoses.push({
      span,
      pose: new Map(system.unknownIds.map((id) => [id, [...this.jointMapPositions.get(id)!]])),
    });
  }

  /**
   * Whether a commanded mount-to-mount length keeps the pin inside its slot.
   *
   * The interior step enforces this when the walk can place a cylinder the
   * ordinary way; a cylinder inside a simultaneous system never reaches that
   * step, so the same bound is asked here instead of nowhere.
   */
  private static withinStroke(span: number): boolean {
    const cylinder = this.drivenCylinder;
    const interior = cylinder && this.cylinderInteriorMap.get(cylinder.barrelNear.id);
    if (!interior) {
      return true;
    }
    const along = span - interior.rodLength;
    return (
      along >= interior.minAlong - STROKE_TOLERANCE && along <= interior.maxAlong + STROKE_TOLERANCE
    );
  }

  /** The other joint of a sliding joint's block (§2.10 item 1). */
  private static blockPartner(joint: PrisJoint): RealJoint | undefined {
    for (const link of joint.links) {
      const partner = link.joints.find((candidate) => candidate.id !== joint.id);
      if (partner instanceof RealJoint) {
        return partner;
      }
    }
    return undefined;
  }

  /**
   * A sliding joint sits exactly on the pin it carries (§2.10 item 2), so once
   * the pin is placed there is nothing left to solve.
   */
  private static orderCoincidentBlock(
    joints: Joint[],
    joint: RealJoint,
    orderNum: number,
    known: string[]
  ): number | undefined {
    if (!(joint instanceof PrisJoint)) {
      return undefined;
    }
    const partner = this.blockPartner(joint);
    if (!partner || !known.includes(partner.id)) {
      return undefined;
    }
    this.desiredConnectedJointIndicesMap.set(joint.id, [
      joints.findIndex((j) => j.id === partner.id),
    ]);
    this.desiredAnalysisJointMap.set(joint.id, 'slotBlockFollowsPin');
    this.jointNumOrderSolverMap.set(orderNum, [joint.id]);
    this.setSlot(joint.id, joint, joint.x, joint.y);
    known.push(joint.id);
    return orderNum + 1;
  }

  /**
   * The inverse primitive (§2.5a): place a carrier from a point known to lie in
   * its slot.
   *
   * This is the common direction, not the exotic one — Whitworth, the
   * oscillating cylinder, the Scotch yoke and Geneva all drive the crank, which
   * locates the block first and leaves the slotted link's pose as the unknown.
   */
  private static orderCarrierFromBlock(
    joints: Joint[],
    links: Link[],
    joint: RealJoint,
    orderNum: number,
    known: string[]
  ): number | undefined {
    for (const candidate of joints) {
      if (!(candidate instanceof PrisJoint) || !candidate.isFloating) continue;
      if (!known.includes(candidate.id)) continue;
      const carrier = candidate.carrier;
      const slotA = candidate.slotJointA;
      const slotB = candidate.slotJointB;
      if (!carrier || !slotA || !slotB) continue;
      if (!carrier.joints.some((member) => member.id === joint.id)) continue;
      // This primitive swings the carrier about an anchor, and a welded carrier
      // cannot turn relative to its block at all. Letting it fire here would
      // rotate a body the weld forbids to rotate — and it would win, because it
      // is reached first in the chain.
      //
      // Deliberately *every* assembly, not only the grounded ones. A Slide on a
      // moving carrier is out of scope for Phase 3 (§4), and the point of
      // leaving it out is that it reports unsolvable rather than animating
      // wrongly. Skipping only grounded assemblies would drop the floating case
      // straight into this primitive, which would happily swing it and draw a
      // plausible picture of the wrong mechanism.
      if (
        slideAssemblies(joints).some((assembly) => assemblyBodyIds(assembly).includes(carrier.id))
      ) {
        continue;
      }

      // Exactly one slot joint known: with neither, there is no ray to swing
      // the link about; with both, the carrier is already placed and this is
      // the forward direction instead.
      const anchor = known.includes(slotA.id)
        ? slotA
        : known.includes(slotB.id)
          ? slotB
          : undefined;
      if (!anchor || (known.includes(slotA.id) && known.includes(slotB.id))) continue;

      const targets = carrier.joints
        .filter((member) => !known.includes(member.id))
        .map((member) => member.id);
      if (targets.length === 0) continue;

      this.inverseSlotMap.set(targets[0], {
        anchorId: anchor.id,
        blockId: candidate.id,
        targets,
      });
      this.desiredAnalysisJointMap.set(targets[0], 'inverseSlot');
      this.jointNumOrderSolverMap.set(orderNum, targets);
      targets.forEach((id) => known.push(id));
      let next = orderNum + 1;
      // Everything hanging off the carrier can now be walked normally.
      for (const id of targets) {
        const placed = joints.find((j) => j.id === id);
        if (placed instanceof RealJoint) {
          next = this.detJointOrder(joints, links, placed, next, known);
        }
      }
      return next;
    }
    return undefined;
  }

  /**
   * Place a welded slide assembly from the block riding in its own slot
   * (docs/phase-3-slide-spec.md §3.6).
   *
   * Neither existing slot primitive reaches this shape. The inverse one needs a
   * slot joint already known so it has a ray to swing the carrier about, and the
   * forward one needs both; a Scotch yoke's yoke has neither, because the only
   * thing locating it is that its slot must pass through the crank pin.
   *
   * What replaces the swing is the weld: the assembly cannot rotate, so its pose
   * has a single scalar unknown — how far it has slid along its guide — and the
   * slot's direction is whatever it was at t = 0, for good.
   */
  private static orderSlideAssembly(
    joints: Joint[],
    links: Link[],
    joint: RealJoint,
    orderNum: number,
    known: string[]
  ): number | undefined {
    const assembly = slideAssemblies(joints).find(
      (candidate) =>
        candidate.grounded &&
        assemblyBodyIds(candidate).some((id) =>
          links.some((link) => link.id === id && link.joints.some((m) => m.id === joint.id))
        )
    );
    if (!assembly) {
      return undefined;
    }

    const bodies = assemblyBodyIds(assembly);
    const members = joints.filter(
      (candidate): candidate is RealJoint =>
        candidate instanceof RealJoint &&
        links.some(
          (link) => bodies.includes(link.id) && link.joints.some((m) => m.id === candidate.id)
        )
    );
    // The step moves every movable member, not merely the unplaced ones: the
    // assembly is one rigid body, and translating half of it would tear it
    // apart against whatever placed the other half.
    //
    // A grounded *pin* is the exception, and it should never appear here — an
    // assembly with one could not translate at all.
    //
    // A grounded sliding joint is not that. "Grounded" on a PrisJoint means its
    // slot line is fixed in the world, not that the joint sits still: the line
    // is recorded once in slotLineMap and read from there, while the joint
    // itself is drawn at the block and has to stay on top of the pin it carries
    // (§2.10 item 2). The existing grounded-slider path has always moved it, and
    // leaving it behind here stretched the zero-length block a little further
    // every timestep.
    const movable = members.filter((member) => !member.ground || member instanceof PrisJoint);
    const pending = movable.filter((member) => !known.includes(member.id));
    if (pending.length === 0) {
      return undefined;
    }

    const source = this.slideAssemblySource(joints, assembly, movable, known);
    if (!source) {
      return undefined;
    }

    // Keyed on a *pending* joint. determinePositionAnalysis reads the step back
    // out of the order map by its first target, so keying on a member some
    // earlier step already claimed would overwrite that step's entry and make
    // it run this primitive instead.
    const key = pending[0];
    const guide: [number, number] = [
      Math.cos(assembly.slider.slotAngle),
      Math.sin(assembly.slider.slotAngle),
    ];
    const targets = [key.id, ...movable.filter((m) => m.id !== key.id).map((m) => m.id)];

    this.slideAssemblyMap.set(key.id, { guide, ...source, targets });
    this.desiredAnalysisJointMap.set(key.id, 'slideAssemblyThroughSlot');
    this.jointNumOrderSolverMap.set(orderNum, targets);
    pending.forEach((member) => known.push(member.id));

    let next = orderNum + 1;
    for (const placed of pending) {
      next = this.detJointOrder(joints, links, placed, next, known);
    }
    return next;
  }

  /**
   * What locates the assembly along its guide.
   *
   * Two things can, and the cheaper one wins. If some member of it has already
   * been placed by an ordinary step, the translation is simply how far that
   * member moved. Otherwise the assembly must be located by a slot cut into it,
   * which is the Scotch yoke's case and the one nothing else can do.
   */
  private static slideAssemblySource(
    joints: Joint[],
    assembly: SlideAssembly,
    movable: RealJoint[],
    known: string[]
  ): Pick<SlideAssemblyStep, 'from'> | undefined {
    // Grounded members are seeded as known before the walk starts, but seeded
    // is not placed: the assembly's own sliding joint is "known" from the first
    // moment and does not move until this very step moves it. Reading travel
    // from one would report the assembly permanently at rest.
    const placed = movable.find((member) => !member.ground && known.includes(member.id));
    if (placed) {
      return { from: { kind: 'member', memberId: placed.id } };
    }

    const rider = joints.find(
      (candidate): candidate is PrisJoint =>
        candidate instanceof PrisJoint &&
        candidate.isFloating &&
        candidate.isSlotWellFormed &&
        assemblyBodyIds(assembly).includes(candidate.carrier!.id)
    );
    if (!rider || !known.includes(rider.id)) {
      return undefined;
    }
    // The offset has to be measured from a point actually *on* the slot. Any
    // other member of the assembly gives a line parallel to it but displaced,
    // and solving to that line moves the assembly to a plausible wrong place
    // rather than failing.
    const anchor = movable.find(
      (member) => member.id === rider.slotJointA?.id || member.id === rider.slotJointB?.id
    );
    if (!anchor) {
      return undefined;
    }
    return {
      from: {
        kind: 'slot',
        blockId: rider.id,
        anchorId: anchor.id,
        // Measured now and held: the weld is exactly the statement that this
        // never changes. A later reader will be tempted to re-measure it per
        // timestep, which would make the step describe a Slot instead.
        slot: [Math.cos(rider.slotAngle), Math.sin(rider.slotAngle)],
      },
    };
  }

  /**
   * Slide a welded assembly along its guide to wherever it is now.
   *
   * The pose is one scalar — travel along the guide — because the weld forbids
   * rotation. Located by a slot, that scalar comes from requiring the block `P`
   * to lie on the line through the anchor `A₀` along a fixed `v̂`:
   * `((P − A₀) − t·û) × v̂ = 0`. Located by a placed member, it is just how far
   * that member has gone.
   */
  private static slideAssemblyThroughSlot(targets: string[]): boolean {
    const step = this.slideAssemblyMap.get(targets[0]);
    if (!step) {
      return false;
    }
    const travel =
      step.from.kind === 'member' ? this.travelFromPlacedMember(step) : this.travelFromSlot(step);
    if (travel === undefined) {
      return false;
    }

    for (const id of step.targets) {
      const start = this.initialJointPosMap.get(id);
      if (!start) {
        return false;
      }
      this.recordJointPosition(
        id,
        start[0] + travel * step.guide[0],
        start[1] + travel * step.guide[1]
      );
    }
    return true;
  }

  /** How far a member of the assembly has already been carried along the guide. */
  private static travelFromPlacedMember(step: SlideAssemblyStep): number | undefined {
    if (step.from.kind !== 'member') {
      return undefined;
    }
    const now = this.jointMapPositions.get(step.from.memberId);
    const start = this.initialJointPosMap.get(step.from.memberId);
    if (!now || !start) {
      return undefined;
    }
    return (now[0] - start[0]) * step.guide[0] + (now[1] - start[1]) * step.guide[1];
  }

  /** How far to slide so the assembly's own slot reaches the block riding in it. */
  private static travelFromSlot(step: SlideAssemblyStep): number | undefined {
    if (step.from.kind !== 'slot') {
      return undefined;
    }
    const cross = step.guide[0] * step.from.slot[1] - step.guide[1] * step.from.slot[0];
    // A guide parallel to the slot leaves the assembly free to sit anywhere
    // along it: genuinely no solution, not merely an ill-conditioned one.
    // Reporting that hands it to the same reversal path a rocker's toggle takes.
    if (Math.abs(cross) <= DEGENERATE_SLOT_TOLERANCE) {
      return undefined;
    }
    const block = this.jointMapPositions.get(step.from.blockId);
    const anchorStart = this.initialJointPosMap.get(step.from.anchorId);
    if (!block || !anchorStart) {
      return undefined;
    }
    return (
      slotOffset(
        { x: block[0], y: block[1] },
        { x: anchorStart[0], y: anchorStart[1] },
        step.from.slot
      ) / cross
    );
  }

  /**
   * The forward primitive (§2.6): a rider on a slot whose carrier is already
   * placed. Identical to the grounded case except that the line is measured
   * again at every timestep instead of once.
   */
  private static orderRiderOnMovingSlot(
    joints: Joint[],
    links: Link[],
    joint: RealJoint,
    orderNum: number,
    known: string[]
  ): number | undefined {
    const slider = joint.connectedJoints.find(
      (candidate): candidate is PrisJoint => candidate instanceof PrisJoint && candidate.isFloating
    );
    if (!slider || known.includes(joint.id)) {
      return undefined;
    }
    const slotA = slider.slotJointA;
    const slotB = slider.slotJointB;
    if (!slotA || !slotB || !known.includes(slotA.id) || !known.includes(slotB.id)) {
      return undefined;
    }
    // The rider still needs one known neighbour to fix its distance along the
    // slot; the slot alone leaves it free to slide.
    const reference = joint.connectedJoints.find(
      (candidate) => candidate.id !== slider.id && known.includes(candidate.id)
    );
    if (!reference) {
      return undefined;
    }

    this.desiredConnectedJointIndicesMap.set(joint.id, [
      joints.findIndex((j) => j.id === reference.id),
      joints.findIndex((j) => j.id === slider.id),
    ]);
    this.desiredAnalysisJointMap.set(joint.id, 'circleLineIntersectionPoints');
    this.jointNumOrderSolverMap.set(orderNum, [joint.id]);
    this.jointDistMap.set(
      joint.id + ',' + reference.id,
      euclideanDistance(joint.x, joint.y, reference.x, reference.y)
    );
    this.setSlot(joint.id, slider, joint.x, joint.y);
    known.push(joint.id, slider.id);
    return this.detJointOrder(joints, links, joint, orderNum + 1, known);
  }

  // TODO: Change the names from simJoints, simLinks to just joints and links
  static detJointOrder(
    joints: Joint[],
    links: Link[],
    prevJoint: RealJoint,
    orderNum: number,
    knownJointArray: string[]
  ) {
    prevJoint.connectedJoints.forEach((cur_joint) => {
      if (!(cur_joint instanceof RealJoint)) {
        return;
      }
      // TODO: Within future, have a method to determine the index based on list of joints and desired ID
      if (knownJointArray.findIndex((j_id) => j_id === cur_joint.id) !== -1) {
        return;
      }
      const prev_joint_index = joints.findIndex((j) => j.id === prevJoint.id);
      let connectedToSlider = false;
      cur_joint.connectedJoints.forEach((j) => {
        if (j.constructor === PrisJoint) {
          connectedToSlider = true;
        }
      });
      if (connectedToSlider) {
        const sliderJoint = cur_joint.connectedJoints.find(
          (j): j is PrisJoint => j.constructor === PrisJoint
        );
        if (sliderJoint === undefined) {
          return;
        }
        // A grounded guide is known before the walk begins, so it can always be
        // used here. A slot on a moving link cannot: emitting the step now
        // would run it before the carrier has been placed, and it would read
        // the carrier's position from the previous timestep — wrong, and
        // wrong in a way that still produces a picture. Defer to the retry
        // sweep, which emits it once the carrier is actually known.
        if (
          sliderJoint.isFloating &&
          !(
            knownJointArray.includes(sliderJoint.slotJointA?.id ?? '') &&
            knownJointArray.includes(sliderJoint.slotJointB?.id ?? '')
          )
        ) {
          return;
        }
        const sliderJointIndex = joints.findIndex((j) => j.id === sliderJoint.id);
        this.desiredConnectedJointIndicesMap.set(cur_joint.id, [
          prev_joint_index,
          sliderJointIndex,
        ]);
        this.desiredAnalysisJointMap.set(cur_joint.id, 'circleLineIntersectionPoints');
        this.jointNumOrderSolverMap.set(orderNum++, [cur_joint.id]);
        this.jointDistMap.set(
          cur_joint.id + ',' + prevJoint.id,
          euclideanDistance(cur_joint.x, cur_joint.y, prevJoint.x, prevJoint.y)
        );
        this.setSlot(cur_joint.id, sliderJoint, cur_joint.x, cur_joint.y);
        // Like the revolute branch below, the solved slider joint becomes a
        // known joint and its other neighbors still need solve orders --
        // otherwise a tracer point on the slider's link can never resolve.
        knownJointArray.push(cur_joint.id);
        orderNum = this.detJointOrder(joints, links, cur_joint, orderNum, knownJointArray);
      } else {
        const known_joint = this.findKnownJoint(cur_joint, prevJoint, knownJointArray);
        if (known_joint === undefined) {
          return;
        }
        knownJointArray.push(cur_joint.id);
        const known_joint_index = joints.findIndex((j) => j.id === known_joint.id);
        this.desiredConnectedJointIndicesMap.set(cur_joint.id, [
          prev_joint_index,
          known_joint_index,
        ]);
        this.desiredAnalysisJointMap.set(cur_joint.id, 'twoCircleIntersectionPoints');
        this.jointNumOrderSolverMap.set(orderNum++, [cur_joint.id]);
        this.jointDistMap.set(
          cur_joint.id + ',' + prevJoint.id,
          euclideanDistance(cur_joint.x, cur_joint.y, prevJoint.x, prevJoint.y)
        );
        this.jointDistMap.set(
          cur_joint.id + ',' + known_joint.id,
          euclideanDistance(cur_joint.x, cur_joint.y, known_joint.x, known_joint.y)
        );
        const desiredTracerJoints = [];
        desiredTracerJoints.push(cur_joint);
        cur_joint.connectedJoints.forEach((tracer_joint) => {
          if (!(tracer_joint instanceof RevJoint)) {
            return;
          }
          const cur_joint_index = joints.findIndex((j) => j.id === cur_joint.id);
          if (tracer_joint instanceof PrisJoint) {
            this.desiredConnectedJointIndicesMap.set(tracer_joint.id, [cur_joint_index]);
            this.desiredAnalysisJointMap.set(tracer_joint.id, 'circleLineIntersectionPoints');
            this.jointNumOrderSolverMap.set(orderNum++, [tracer_joint.id]);
            this.jointDistMap.set(
              tracer_joint.id + ',' + tracer_joint.id,
              euclideanDistance(tracer_joint.x, tracer_joint.y, cur_joint.x, cur_joint.y)
            );
            this.setSlot(tracer_joint.id, tracer_joint, tracer_joint.x, tracer_joint.y);
            return;
          }
          const desired_link = links.find((l) => {
            return (
              l.joints.findIndex((l_joint) => l_joint.id === prevJoint.id) !== -1 &&
              l.joints.findIndex((l_joint) => l_joint.id === cur_joint.id) !== -1
            );
          });
          if (desired_link === undefined) {
            return;
          }
          if (knownJointArray.findIndex((j_id) => j_id === tracer_joint.id) !== -1) {
            return;
          }
          // tracer joint is not connected on the same link as prev joint and curr joint
          // if (tracer_joint.connectedLinks.findIndex(ll => ll.id === desired_link.id) !== -1) {
          if (tracer_joint.links.findIndex((ll) => ll.id === desired_link.id) === -1) {
            return;
          }
          // const tracer_joint_index = 0;
          // this.desiredConnectedJointIndicesMap.set(tracer_joint.id, [cur_joint_index, known_joint_index]);
          this.desiredConnectedJointIndicesMap.set(tracer_joint.id, [
            prev_joint_index,
            cur_joint_index,
          ]);
          this.desiredAnalysisJointMap.set(tracer_joint.id, 'determineTracerJoint');
          this.jointNumOrderSolverMap.set(orderNum++, [tracer_joint.id]);
          knownJointArray.push(tracer_joint.id);
          desiredTracerJoints.push(tracer_joint);
          this.jointDistMap.set(
            tracer_joint.id + ',' + prevJoint.id,
            euclideanDistance(tracer_joint.x, tracer_joint.y, prevJoint.x, prevJoint.y)
          );
          this.jointDistMap.set(
            tracer_joint.id + ',' + cur_joint.id,
            euclideanDistance(tracer_joint.x, tracer_joint.y, cur_joint.x, cur_joint.y)
          );
          this.jointDistMap.set(
            cur_joint.id + ',' + prevJoint.id,
            euclideanDistance(cur_joint.x, cur_joint.y, prevJoint.x, prevJoint.y)
          );
        });
        desiredTracerJoints.forEach((jt) => {
          orderNum = this.detJointOrder(joints, links, jt, orderNum, knownJointArray);
        });
      }
    });
    return orderNum;
  }

  static findKnownJoint(joint: RealJoint, prev_joint: Joint, knownJointArray: string[]) {
    return joint.connectedJoints.find((jt) => {
      const knownJointIndex = knownJointArray.findIndex((j_id) => j_id === jt.id);
      return knownJointIndex !== -1 && jt.id !== prev_joint.id;
      // return knownJointArray.findIndex(j_id => j_id === jt.id) !== -1 && jt.id !== prev_joint.id;
    });
  }

  static determinePositionAnalysis(
    joints: Joint[],
    links: Link[],
    forces: Force[],
    angVelDir: boolean
  ): boolean {
    // Joints the ordering pass could not reach make the whole mechanism
    // unsolvable; running the steps it did emit would move part of the linkage
    // and leave the rest behind.
    if (this.unsolvableJoints.length > 0) {
      return false;
    }
    // A command left over from a sample the mechanism refused. Clearing it here
    // rather than at each of the failure returns below is what makes "committed
    // only when every step agreed" true without a guard on every exit.
    this.pendingSpan = undefined;
    let counter = 1;
    while (counter <= this.stepCount) {
      const step_targets = this.jointNumOrderSolverMap.get(counter)!;
      const joint_id = step_targets[0];
      const joint = joints.find((j) => j.id === joint_id)!;
      const connected_joint_indices = this.desiredConnectedJointIndicesMap.get(joint_id)!;
      const desired_analysis = this.desiredAnalysisJointMap.get(joint_id)!;
      let possible: boolean = true; // Doesn't need to be defined
      switch (desired_analysis) {
        case 'incrementRevInput':
          this.incrementRevInput(joints[connected_joint_indices[0]], joint, angVelDir);
          possible = true;
          break;
        case 'incrementPrisInput':
          this.incrementPrisInput(joints[connected_joint_indices[0]], joint, angVelDir);
          possible = true;
          break;
        case 'twoCircleIntersectionPoints':
          possible = this.twoCircleIntersectionPoints(
            joints[connected_joint_indices[0]],
            joints[connected_joint_indices[1]],
            joint
          );
          break;
        case 'circleLineIntersectionPoints':
          possible = this.circleLineIntersectionPoints(
            joints[connected_joint_indices[0]],
            joints[connected_joint_indices[1]],
            joint
          );
          break;
        case 'slotBlockFollowsPin':
          possible = this.slotBlockFollowsPin(joints[connected_joint_indices[0]], joint);
          break;
        case 'inverseSlot':
          possible = this.inverseSlot(joints, step_targets);
          break;
        case 'slideAssemblyThroughSlot':
          possible = this.slideAssemblyThroughSlot(step_targets);
          break;
        case 'drivenCylinderMount':
          possible = this.drivenCylinderMount(joints, joint, angVelDir);
          break;
        case 'sealedCylinderInterior':
          possible = this.sealedCylinderInterior(step_targets);
          break;
        case 'simultaneousSystem':
          possible = this.simultaneous(joints, angVelDir);
          break;
        case 'determineTracerJoint':
          this.twoCircleIntersectionPoints(
            joints[connected_joint_indices[0]],
            joints[connected_joint_indices[1]],
            joint
          );
          // this.determineTracerJoint(
          //   joints[connected_joint_indices[0]],
          //   joints[connected_joint_indices[1]],
          //   joint
          // );
          possible = true;
          break;
        default:
          // TODO: Should never get here...
          return false;
      }
      if (!possible) {
        return false;
      }
      counter++;
    }
    forces.forEach((f) => {
      this.determineTracerForce(f.link.joints[0], f.link.joints[1], f, 'start');
      this.forceMagnitudeMap.set(f.id + 'x', f.mag);
      if (!f.local) {
        const x_calc =
          f.endCoord.x + (this.forcePositionMap.get(f.id + 'start')!.x - f.startCoord.x);
        const y_calc =
          f.endCoord.y + (this.forcePositionMap.get(f.id + 'start')!.y - f.startCoord.y);
        this.forcePositionMap.set(
          f.id + 'end',
          new Coord(roundNumber(x_calc, 3), roundNumber(y_calc, 3))
        );
      } else {
        this.determineTracerForce(f.link.joints[0], f.link.joints[1], f, 'end');
      }
    });
    // Every step agreed, so the sample the drive proposed is now the one it is
    // extending from.
    if (this.pendingSpan !== undefined) {
      if (this.cylinderDrive) this.cylinderDrive.span = this.pendingSpan;
      if (this.pinDrive) this.pinDrive.angle = this.pendingSpan;
      this.pendingSpan = undefined;
    }
    return true;
  }

  private static incrementRevInput(inputJoint: Joint, unknownJoint: Joint, angVelDir: boolean) {
    const r = this.jointDistMap.get(inputJoint.id + ',' + unknownJoint.id)!;
    const increment = angVelDir ? Math.PI / 180.0 : -Math.PI / 180.0;
    const angle = Math.atan2(unknownJoint.y - inputJoint.y, unknownJoint.x - inputJoint.x);
    const x = Math.cos(angle + increment) * r + inputJoint.x;
    const y = Math.sin(angle + increment) * r + inputJoint.y;
    this.jointMapPositions.set(inputJoint.id, [
      roundNumber(inputJoint.x, 4),
      roundNumber(inputJoint.y, 4),
    ]);
    this.jointMapPositions.set(unknownJoint.id, [roundNumber(x, 4), roundNumber(y, 4)]);
  }

  private static incrementPrisInput(inputJoint: Joint, unknownJoint: Joint, angVelDir: boolean) {
    const increment = angVelDir ? PRISMATIC_INPUT_STEP : -PRISMATIC_INPUT_STEP;
    const inputJointAngle = this.sliderAngleMap.get(inputJoint.id)!;
    const xIncrement = increment * Math.cos(inputJointAngle);
    const yIncrement = increment * Math.sin(inputJointAngle);
    const x = unknownJoint.x + xIncrement;
    const y = unknownJoint.y + yIncrement;
    this.jointMapPositions.set(unknownJoint.id, [roundNumber(x, 4), roundNumber(y, 4)]);
    this.jointMapPositions.set(inputJoint.id, [roundNumber(x, 4), roundNumber(y, 4)]);
  }

  // https://www.petercollingridge.co.uk/tutorials/computational-geometry/circle-circle-intersections/
  private static twoCircleIntersectionPoints(j1: Joint, j2: Joint, unknownJoint: Joint) {
    const solution =
      this.concentricSolution(j1, j2, unknownJoint) ??
      (() => {
        const sols = this.TwoCircleIntersectionMethod(j1, j2, unknownJoint);
        return sols ? this.solutionNearestCurrent(sols, unknownJoint) : undefined;
      })();
    if (!solution) {
      return false;
    }
    this.recordJointPosition(unknownJoint.id, solution[0], solution[1]);
    return true;
  }

  /** Remember where the joint was before this step, for extrapolating through a singularity. */
  private static recordJointPosition(id: string, x: number, y: number) {
    const previous = this.jointMapPositions.get(id);
    if (previous) {
      this.priorJointPositions.set(id, previous);
    }
    this.jointMapPositions.set(id, [roundNumber(x, 4), roundNumber(y, 4)]);
  }

  /**
   * Solve a joint whose two reference joints have landed on top of each other.
   *
   * When a crank is as long as the ground link, the moving pivot passes exactly
   * through the far ground pivot once a revolution. Both circles that locate the
   * next joint then share a centre, so every point on that circle satisfies the
   * link lengths and the intersection is undefined — the solver used to report
   * "no solution", which findFullMovementPos reads as a toggle and answers by
   * reversing the input. A parallelogram has no toggle there; it rotates straight
   * through. Momentum is what disambiguates, so extrapolate the joint's motion and
   * project the prediction back onto the circle it has to stay on.
   *
   * Returns undefined when the centres are apart, i.e. the ordinary case.
   */
  private static concentricSolution(
    j1: Joint,
    j2: Joint,
    unknownJoint: Joint
  ): number[] | undefined {
    const centre1 = this.jointMapPositions.get(j1.id) ?? [j1.x, j1.y];
    const centre2 = this.jointMapPositions.get(j2.id) ?? [j2.x, j2.y];
    if (Math.hypot(centre2[0] - centre1[0], centre2[1] - centre1[1]) > CONCENTRIC_TOLERANCE) {
      return undefined;
    }

    const radius = this.jointDistMap.get(unknownJoint.id + ',' + j1.id);
    const current = this.jointMapPositions.get(unknownJoint.id);
    if (radius === undefined || !current) {
      return undefined;
    }

    // Constant-velocity guess from the last two solved positions; with no history
    // yet, hold the current heading.
    const prior = this.priorJointPositions.get(unknownJoint.id) ?? current;
    const predicted = [2 * current[0] - prior[0], 2 * current[1] - prior[1]];

    let towardX = predicted[0] - centre1[0];
    let towardY = predicted[1] - centre1[1];
    let reach = Math.hypot(towardX, towardY);
    if (reach < 1e-9) {
      // The prediction landed on the centre; fall back to the current heading.
      towardX = current[0] - centre1[0];
      towardY = current[1] - centre1[1];
      reach = Math.hypot(towardX, towardY);
      if (reach < 1e-9) {
        return undefined;
      }
    }
    return [centre1[0] + (towardX / reach) * radius, centre1[1] + (towardY / reach) * radius];
  }

  /**
   * Pick which circle-circle root the joint moves to.
   *
   * Both roots satisfy the link lengths — they are the linkage's two assembly
   * modes — so the choice has to follow the joint step by step. Caching one index
   * for the whole simulation cannot work: the roots trade places as the linkage
   * passes through a collinear pose, so a fixed index silently becomes the *other*
   * assembly mode and the joint jumps across the mechanism.
   *
   * Comparing against the joint's current position is not enough either. Where the
   * circles are tangent the two roots meet, so at that sample both are equidistant
   * and the choice is a coin flip — and once the roots separate again the wrong one
   * is the crossed mode. A parallelogram meets a tangency every revolution. So
   * extrapolate the joint's motion and compare against where it was heading: the
   * velocity carries through the singularity even though position alone does not.
   */
  private static solutionNearestCurrent(sols: number[][], unknownJoint: Joint): number[] {
    if (sols.length === 1) {
      return sols[0];
    }
    const current = this.jointMapPositions.get(unknownJoint.id) ?? [unknownJoint.x, unknownJoint.y];
    const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

    // Constant-velocity guess. Comparing against the joint's *current* position is
    // not good enough: coming off a tangency the crossed root can sit nearer than
    // the true one, because it barely moves, so nearest-position quietly prefers
    // the degenerate branch. Where the joint was heading does distinguish them.
    // With no history — the first sample, or just after a reversal dropped it —
    // this reduces to the current point, which picks the starting assembly mode.
    const prior = this.priorJointPositions.get(unknownJoint.id) ?? current;
    const predicted = [2 * current[0] - prior[0], 2 * current[1] - prior[1]];
    return distance(sols[0], predicted) <= distance(sols[1], predicted) ? sols[0] : sols[1];
  }

  /**
   * Forget how the joints were moving. Extrapolation is only meaningful while
   * motion continues in one direction, so a rocker reversing at a toggle must not
   * keep predicting forward past the dead point.
   */
  static clearMotionHistory() {
    this.priorJointPositions = new Map<string, Array<number>>();
  }

  private static TwoCircleIntersectionMethod(j1: Joint, j2: Joint, unknownJoint: Joint) {
    if (!this.jointMapPositions.has(j1.id)) {
      this.jointMapPositions.set(j1.id, [j1.x, j1.y]);
    }
    if (!this.jointMapPositions.has(j2.id)) {
      this.jointMapPositions.set(j2.id, [j2.x, j2.y]);
    }
    const x0 = this.jointMapPositions.get(j1.id)![0];
    const y0 = this.jointMapPositions.get(j1.id)![1];
    const x1 = this.jointMapPositions.get(j2.id)![0];
    const y1 = this.jointMapPositions.get(j2.id)![1];
    if (x0 === undefined || y0 === undefined) {
      return;
    }
    const r0 = this.jointDistMap.get(unknownJoint.id + ',' + j1.id)!;
    const r1 = this.jointDistMap.get(unknownJoint.id + ',' + j2.id)!;
    return circleCircleIntersection(x0, y0, r0, x1, y1, r1);
  }

  /**
   * Place a joint that rides a slot: it sits where the slot line meets a circle
   * of the connecting link's length about an already-solved joint.
   *
   * Both roots are on the slot and both satisfy the link length, so they are
   * the linkage's two assembly modes. The branch is chosen once, by whichever
   * root the joint started nearest, and then held.
   */
  private static circleLineIntersectionPoints(j1: Joint, j2: Joint, unknownJoint: Joint) {
    const solutions = this.slotSolutions(j1, unknownJoint);
    if (!solutions) {
      return false;
    }

    if (!this.desiredIndexWithinPosAnalysisMap.has(unknownJoint.id)) {
      const initial = this.initialJointPosMap.get(unknownJoint.id)!;
      const distanceToInitial = (point: [number, number]) =>
        Math.hypot(point[0] - initial[0], point[1] - initial[1]);
      this.desiredIndexWithinPosAnalysisMap.set(
        unknownJoint.id,
        distanceToInitial(solutions[0]) <= distanceToInitial(solutions[1]) ? 0 : 1
      );
    }

    // TODO (Phase 2): a held index is not safe through a tangency, where the two
    // roots merge and trade places -- the same failure solutionNearestCurrent
    // fixes for the circle-circle case. Preserved as-is here so this rewrite
    // changes only the line representation.
    const [x, y] = solutions[this.desiredIndexWithinPosAnalysisMap.get(unknownJoint.id)!];
    this.jointMapPositions.set(unknownJoint.id, [roundNumber(x, 4), roundNumber(y, 4)]);
    this.jointMapPositions.set(j2.id, [roundNumber(x, 4), roundNumber(y, 4)]);
    return true;
  }

  /** A sliding joint takes the position of the pin it carries (§2.10 item 2). */
  private static slotBlockFollowsPin(pin: Joint, slidingJoint: Joint): boolean {
    const position = this.jointMapPositions.get(pin.id);
    if (!position) {
      return false;
    }
    this.jointMapPositions.set(slidingJoint.id, [position[0], position[1]]);
    return true;
  }

  /**
   * Swing a carrier link about one of its slot joints until the slot passes
   * through the block again, then carry every one of its joints along.
   *
   * The rotation is measured against where the block sat at t = 0 rather than
   * against the other slot joint. Both describe the same line, but the ray from
   * the anchor to the block is the one that cannot flip: measuring against the
   * far joint leaves the sign undetermined whenever the block sits on the
   * anchor's other side, which would turn the link over.
   */
  private static inverseSlot(joints: Joint[], targets: string[]): boolean {
    const step = this.inverseSlotMap.get(targets[0]);
    if (!step) {
      return false;
    }
    const anchorNow = this.jointMapPositions.get(step.anchorId);
    const blockNow = this.jointMapPositions.get(step.blockId);
    const anchorStart = this.initialJointPosMap.get(step.anchorId);
    const blockStart = this.initialJointPosMap.get(step.blockId);
    if (!anchorNow || !blockNow || !anchorStart || !blockStart) {
      return false;
    }

    const nowX = blockNow[0] - anchorNow[0];
    const nowY = blockNow[1] - anchorNow[1];
    const startX = blockStart[0] - anchorStart[0];
    const startY = blockStart[1] - anchorStart[1];
    // The block passing through the anchor leaves the slot's direction
    // genuinely undefined, not merely imprecise. Reporting "no solution" hands
    // it to the same reversal path a rocker's toggle takes.
    if (
      Math.hypot(nowX, nowY) <= DEGENERATE_SLOT_TOLERANCE ||
      Math.hypot(startX, startY) <= DEGENERATE_SLOT_TOLERANCE
    ) {
      return false;
    }

    const rotation = Math.atan2(nowY, nowX) - Math.atan2(startY, startX);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    for (const id of step.targets) {
      const start = this.initialJointPosMap.get(id);
      if (!start) {
        return false;
      }
      const relativeX = start[0] - anchorStart[0];
      const relativeY = start[1] - anchorStart[1];
      this.recordJointPosition(
        id,
        anchorNow[0] + relativeX * cos - relativeY * sin,
        anchorNow[1] + relativeX * sin + relativeY * cos
      );
    }
    return true;
  }

  /** Intersections of the joint's slot line with the circle centred on `j1`. */
  private static slotSolutions(j1: Joint, unknownJoint: Joint): [number, number][] | undefined {
    const line = this.resolveSlotLine(unknownJoint.id);
    if (!line) {
      return undefined;
    }
    const radius = this.jointDistMap.get(unknownJoint.id + ',' + j1.id)!;
    const [centreX, centreY] = this.jointMapPositions.get(j1.id)!;
    const [[pointX, pointY], [dirX, dirY]] = line;
    return circleLineIntersection(radius, centreX, centreY, pointX, pointY, dirX, dirY);
  }

  /**
   * Where the slot is right now: a point on it and a unit direction.
   *
   * A world-fixed guide answers from what was recorded. A slot cut into a link
   * has to be measured again from that link's current pose, which is the whole
   * difference between a grounded slot and a floating one.
   */
  private static resolveSlotLine(
    jointID: string
  ): [[number, number], [number, number]] | undefined {
    const line = this.slotLineMap.get(jointID);
    if (!line) {
      return undefined;
    }
    if (line.kind === 'fixed') {
      return [line.point, line.direction];
    }
    const start = this.jointMapPositions.get(line.startId);
    const end = this.jointMapPositions.get(line.endId);
    if (!start || !end) {
      return undefined;
    }
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.hypot(dx, dy);
    // Two slot joints on top of each other leave the line undefined rather than
    // merely inaccurate, so there is nothing to return.
    if (length <= DEGENERATE_SLOT_TOLERANCE) {
      return undefined;
    }
    return [
      [start[0], start[1]],
      [dx / length, dy / length],
    ];
  }

  /**
   * Record the slot a joint slides along. Stored as a direction rather than a
   * slope so that vertical and near-vertical guides need no special case.
   */
  private static setSlot(jointID: string, joint: PrisJoint, throughX: number, throughY: number) {
    if (joint.isFloating && joint.slotJointA && joint.slotJointB) {
      this.slotLineMap.set(jointID, {
        kind: 'through',
        startId: joint.slotJointA.id,
        endId: joint.slotJointB.id,
      });
      return;
    }
    this.slotLineMap.set(jointID, {
      kind: 'fixed',
      point: [throughX, throughY],
      direction: [Math.cos(joint.slotAngle), Math.sin(joint.slotAngle)],
    });
  }

  // https://www.mathsisfun.com/algebra/trig-solving-sss-triangles.html
  private static determineTracerJoint(
    lastJoint: Joint,
    joint_with_neighboring_ground: Joint,
    unknown_joint: Joint
  ) {
    let r1, r2, r3, internal_angle: number;
    if (
      !this.internalTriangleValuesMap.has(
        lastJoint.id + joint_with_neighboring_ground.id + unknown_joint.id
      )
    ) {
      // TODO: Have map for determining r1, r2, r3
      r1 = this.jointDistMap.get(unknown_joint.id + ',' + lastJoint.id)!;
      r2 = this.jointDistMap.get(unknown_joint.id + ',' + joint_with_neighboring_ground.id)!;
      r3 = this.jointDistMap.get(joint_with_neighboring_ground.id + ',' + lastJoint.id)!;
      internal_angle = Math.acos(
        (Math.pow(r1, 2) + Math.pow(r3, 2) - Math.pow(r2, 2)) / (2 * r1 * r3)
      );
      this.internalTriangleValuesMap.set(
        lastJoint.id + joint_with_neighboring_ground.id + unknown_joint.id,
        [r1, internal_angle]
      );
    }

    r1 = this.internalTriangleValuesMap.get(
      lastJoint.id + joint_with_neighboring_ground.id + unknown_joint.id
    )![0];
    internal_angle = this.internalTriangleValuesMap.get(
      lastJoint.id + joint_with_neighboring_ground.id + unknown_joint.id
    )![1];
    const x1 = this.jointMapPositions.get(lastJoint.id)![0];
    const y1 = this.jointMapPositions.get(lastJoint.id)![1];
    const x2 = this.jointMapPositions.get(joint_with_neighboring_ground.id)![0];
    const y2 = this.jointMapPositions.get(joint_with_neighboring_ground.id)![1];
    const angle = Math.atan2(y2 - y1, x2 - x1);

    const prevJoint_x = unknown_joint.x;
    const prevJoint_y = unknown_joint.y;
    let [x_calc, y_calc] = determineUnknownJointUsingTriangulation(
      x1,
      y1,
      x2,
      y2,
      r1,
      prevJoint_x,
      prevJoint_y,
      angle,
      internal_angle
    );
    this.jointMapPositions.set(unknown_joint.id, [roundNumber(x_calc, 4), roundNumber(y_calc, 4)]);
  }

  static setUpSolvingForces(forces: Force[]) {
    forces.forEach((f) => {
      const joint1 = f.link.joints[0];
      const joint2 = f.link.joints[1];
      PositionSolver.jointDistMap.set(
        f.id + 'start' + ',' + joint1.id,
        euclideanDistance(f.startCoord.x, f.startCoord.y, joint1.x, joint1.y)
      );
      PositionSolver.jointDistMap.set(
        f.id + 'start' + ',' + joint2.id,
        euclideanDistance(f.startCoord.x, f.startCoord.y, joint2.x, joint2.y)
      );
      PositionSolver.jointDistMap.set(
        f.id + 'end' + ',' + joint1.id,
        euclideanDistance(f.endCoord.x, f.endCoord.y, joint1.x, joint1.y)
      );
      PositionSolver.jointDistMap.set(
        f.id + 'end' + ',' + joint2.id,
        euclideanDistance(f.endCoord.x, f.endCoord.y, joint2.x, joint2.y)
      );
      PositionSolver.jointDistMap.set(
        joint1.id + ',' + joint2.id,
        euclideanDistance(joint1.x, joint1.y, joint2.x, joint2.y)
      );
    });
  }

  static setUpInitialJointLocations(joints: Joint[]) {
    joints.forEach((j) => {
      this.jointMapPositions.set(j.id, [roundNumber(j.x, 4), roundNumber(j.y, 4)]);
    });
  }

  //TODO: merge this with logic for determining tracer points
  static determineTracerForce(joint: Joint, joint2: Joint, force: Force, startOrEnd: string) {
    let r1, r2, r3, internal_angle: number;
    if (!this.internalTriangleValuesMap.has(joint.id + joint2.id + force.id + startOrEnd)) {
      // TODO: Have map for determining r1, r2, r3
      r1 = this.jointDistMap.get(force.id + startOrEnd + ',' + joint.id)!;
      r2 = this.jointDistMap.get(force.id + startOrEnd + ',' + joint2.id)!;
      r3 = this.jointDistMap.get(joint.id + ',' + joint2.id)!;
      internal_angle = Math.acos(
        (Math.pow(r1, 2) + Math.pow(r3, 2) - Math.pow(r2, 2)) / (2 * r1 * r3)
      );
      this.internalTriangleValuesMap.set(joint.id + joint2.id + startOrEnd, [r1, internal_angle]);
    }

    r1 = this.internalTriangleValuesMap.get(joint.id + joint2.id + startOrEnd)![0];
    internal_angle = this.internalTriangleValuesMap.get(joint.id + joint2.id + startOrEnd)![1];
    const x1 = this.jointMapPositions.get(joint.id)![0];
    const y1 = this.jointMapPositions.get(joint.id)![1];
    const x2 = this.jointMapPositions.get(joint2.id)![0];
    const y2 = this.jointMapPositions.get(joint2.id)![1];
    const angle = Math.atan2(y2 - y1, x2 - x1);

    let prevJoint_x: number;
    let prevJoint_y: number;
    if (startOrEnd === 'start') {
      prevJoint_x = force.startCoord.x;
      prevJoint_y = force.startCoord.y;
    } else {
      prevJoint_x = force.endCoord.x;
      prevJoint_y = force.endCoord.y;
    }

    let [x_calc, y_calc] = determineUnknownJointUsingTriangulation(
      x1,
      y1,
      x2,
      y2,
      r1,
      prevJoint_x,
      prevJoint_y,
      angle,
      internal_angle
    );
    this.forcePositionMap.set(
      force.id + startOrEnd,
      new Coord(roundNumber(x_calc, 3), roundNumber(y_calc, 3))
    );
  }
}
