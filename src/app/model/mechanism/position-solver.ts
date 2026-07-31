import { Joint, PrisJoint, RealJoint, RevJoint } from '../joint';
import { Link } from '../link';
import {
  circleCircleIntersection,
  circleLineIntersection,
  determineUnknownJointUsingTriangulation,
  euclideanDistance,
  roundNumber,
} from '../utils';
import { Force } from '../force';
import { Coord } from '../coord';
import {
  assemblyBodyIds,
  SlideAssembly,
  slideAssemblies,
  slotOffset,
} from '../slide-assembly';
import { core } from '@angular/compiler';

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
    const tracer_joints: Joint[] = [];
    inputJoint.connectedJoints.forEach((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      if (j.ground) {
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
    this.stepCount = orderNum - 1;
    this.unsolvableJoints = joints
      .filter(
        (j) => j instanceof RealJoint && !j.ground && !knownJointsIds.includes(j.id)
      )
      .map((j) => j.id);
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
        const advanced =
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
        slideAssemblies(joints).some((assembly) =>
          assemblyBodyIds(assembly).includes(carrier.id)
        )
      ) {
        continue;
      }

      // Exactly one slot joint known: with neither, there is no ray to swing
      // the link about; with both, the carrier is already placed and this is
      // the forward direction instead.
      const anchor = known.includes(slotA.id) ? slotA : known.includes(slotB.id) ? slotB : undefined;
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
    const movable = members.filter(
      (member) => !member.ground || member instanceof PrisJoint
    );
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
      step.from.kind === 'member'
        ? this.travelFromPlacedMember(step)
        : this.travelFromSlot(step);
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
      (candidate): candidate is PrisJoint =>
        candidate instanceof PrisJoint && candidate.isFloating
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
    const increment = angVelDir ? 0.1 : -0.1; // 0.01 : -0.01;
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
  private static setSlot(
    jointID: string,
    joint: PrisJoint,
    throughX: number,
    throughY: number
  ) {
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
