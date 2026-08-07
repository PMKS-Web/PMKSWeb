import { Joint, PrisJoint, RealJoint } from '../joint';
import { SliderBlock, Link, RealLink } from '../link';
import { matLinearSystem } from '../utils';
import { Loop, LoopEdge } from './loop-solver';
import { hasFixedOrientation, SlideAssembly, slideAssemblies } from '../slide-assembly';
import { PositionSolver } from './position-solver';

/** A slot edge's geometry in the frame being solved. */
interface SlotFrame {
  slider: PrisJoint;
  carrier: Link;
  anchor: Joint;
  /** Unit vector along the slot. */
  u: [number, number];
  /** Unit vector normal to it, which is the direction the slot's rotation moves. */
  uPerp: [number, number];
  /** Travel from the anchor, signed along the slot. */
  s: number;
  /** +1 when the chain runs anchor to slider, -1 the other way. */
  sign: number;
}

export class KinematicsSolver {
  static jointIndexMap = new Map<string, number>();
  static jointVelMap = new Map<string, [number, number]>();
  static jointAccMap = new Map<string, [number, number]>();

  static linkIndexMap = new Map<string, number>();
  static linkAngPosMap = new Map<string, number>();
  static linkAngVelMap = new Map<string, number>();
  static linkAngAccMap = new Map<string, number>();
  static linkCoMMap = new Map<string, [number, number]>();
  static linkVelMap = new Map<string, [number, number]>();
  static linkAccMap = new Map<string, [number, number]>();

  static A_matrix_AngVel: Array<Array<number>> = [];
  static B_matrix_AngVel: Array<Array<number>> = [];
  static A_matrix_AngAcc: Array<Array<number>> = [];
  static B_matrix_AngAcc: Array<Array<number>> = [];
  static LinVelJointEq = new Map<string, [string, string]>();
  static LinVelLinkEq = new Map<string, [string, string]>();
  static LinAccJointEq = new Map<string, [string, string]>();
  static LinAccLinkEq = new Map<string, [string, string]>();
  static requiredLoops: Loop[];

  static loopIndexMap = new Map<string, number>();
  private static linkContainsInputMap = new Map<string, boolean>();
  static unknownLinkIndexMap = new Map<string, number>();
  private static groundJointIndexMap = new Map<string, number>();
  static realJointIndexMap = new Map<string, number>();
  static desiredAngleMap = new Map<string, number>();
  /** Travel rate along each floating slot, relative to its carrier. */
  static slideRateMap = new Map<string, number>();
  static slideAccelMap = new Map<string, number>();
  private static inputJointIndex: number | undefined;
  static inputLinkIndex: number;
  /**
   * The Slides in the frame being solved, resolved once per call.
   *
   * Three separate places hand a body an angular unknown, and all three have to
   * ask the same question of the same answer. Re-deriving "is this welded to a
   * grounded guide?" at each of them is how one gets gated and the others do
   * not — which does not show up as a singular matrix but as a wrong number.
   */
  private static slideAssemblyCache: SlideAssembly[] = [];

  static resetVariables() {
    // Also forget the cached input joint so the next call re-derives it (and
    // inputLinkIndex) for the new mechanism instead of reusing stale indices.
    this.inputJointIndex = undefined;
    this.jointIndexMap = new Map<string, number>();
    this.jointVelMap = new Map<string, [number, number]>();
    this.jointAccMap = new Map<string, [number, number]>();

    this.linkIndexMap = new Map<string, number>();
    this.linkAngPosMap = new Map<string, number>();
    this.linkAngVelMap = new Map<string, number>();
    this.linkAngAccMap = new Map<string, number>();
    this.linkCoMMap = new Map<string, [number, number]>();
    this.linkVelMap = new Map<string, [number, number]>();
    this.linkAccMap = new Map<string, [number, number]>();

    this.loopIndexMap = new Map<string, number>();
    this.linkContainsInputMap = new Map<string, boolean>();
    this.unknownLinkIndexMap = new Map<string, number>();
    this.groundJointIndexMap = new Map<string, number>();
    this.realJointIndexMap = new Map<string, number>();
    this.desiredAngleMap = new Map<string, number>();
    this.slideRateMap = new Map<string, number>();
    this.slideAccelMap = new Map<string, number>();
    this.slideAssemblyCache = [];
    this.inputLinkIndex = -1;

    this.A_matrix_AngVel = [];
    this.B_matrix_AngVel = [];
    this.A_matrix_AngAcc = [];
    this.B_matrix_AngAcc = [];

    this.LinVelJointEq = new Map<string, [string, string]>();
    this.LinVelLinkEq = new Map<string, [string, string]>();
    this.LinAccJointEq = new Map<string, [string, string]>();
    this.LinAccLinkEq = new Map<string, [string, string]>();
  }

  static determineKinematics(simJoints: Joint[], simLinks: Link[], initialAngularVelocity: number) {
    this.kinematicsInitializer(simJoints, simLinks, initialAngularVelocity);

    // A mechanism the constraint set solved gets its rates from the same
    // constraints, differentiated (§2.7a). Loop detection cannot see through a
    // sealed cylinder, so every cylinder-driven mechanism reached the loopless
    // path below and came away with no velocities at all -- the graphs plotted
    // NaN and said nothing about why.
    if (this.applyConstraintKinematics(simJoints, simLinks, initialAngularVelocity)) {
      return;
    }

    // A single welded root rotating about its input is a valid one-DOF
    // mechanism even though it has no closed kinematic loop to solve.
    if (this.requiredLoops.length === 0) {
      this.determineLooplessKinematics(simJoints, simLinks, initialAngularVelocity);
      return;
    }

    this.determineAng(simJoints, simLinks, 'Velocity');
    this.determineAng(simJoints, simLinks, 'Acceleration');
    this.determineLin(simJoints, simLinks);
  }

  /**
   * Everything a slot edge needs, read from the frame being solved.
   *
   * `slotAngle` re-measures from the slot's defining joints on every call, and
   * `rebindSlot` has already pointed this copy's slider at this copy's carrier,
   * so nothing here can leak timestep 0's geometry.
   */
  private static slotFrame(
    simJoints: Joint[],
    edge: Extract<LoopEdge, { kind: 'slot' }>
  ): SlotFrame | undefined {
    const slider = simJoints.find((joint) => joint.id === edge.sliderId);
    if (!(slider instanceof PrisJoint) || !slider.carrier || !slider.slotJointA) {
      return undefined;
    }
    const anchor = slider.slotJointA;
    const theta = slider.slotAngle;
    const u: [number, number] = [Math.cos(theta), Math.sin(theta)];
    const uPerp: [number, number] = [-Math.sin(theta), Math.cos(theta)];
    return {
      slider,
      carrier: slider.carrier,
      anchor,
      u,
      uPerp,
      s: (slider.x - anchor.x) * u[0] + (slider.y - anchor.y) * u[1],
      sign: edge.fromId === slider.id ? -1 : 1,
    };
  }

  /**
   * A sliding point does not merely slide — it is carried by the link it slides
   * in. The solved rate is relative to the carrier, so the absolute motion adds
   * the carrier's own motion at that point: `s·ω` across the slot for velocity,
   * and for acceleration the Coriolis and centripetal terms as well.
   *
   * A grounded guide has `ω = α = 0`, so every added term vanishes and the
   * sliding point keeps exactly the motion the slide rate gives it.
   */
  private static applySlotCarriage(
    simJoints: Joint[],
    edge: Extract<LoopEdge, { kind: 'slot' }>
  ): void {
    const frame = this.slotFrame(simJoints, edge);
    if (!frame) {
      return;
    }
    const { slider, carrier, anchor, u, uPerp, s } = frame;
    const anchorVel = this.jointVelMap.get(anchor.id);
    const anchorAcc = this.jointAccMap.get(anchor.id);
    // spreadCarrierMotion runs first and settles every carrier joint, so this
    // only bites when the walk never reached the carrier at all. Writing zeros
    // there would present a stationary slider as a solved one.
    if (!anchorVel || !anchorAcc) {
      return;
    }
    const omega = this.linkAngVelMap.get(carrier.id) ?? 0;
    const alpha = this.linkAngAccMap.get(carrier.id) ?? 0;
    const rate = this.slideRateMap.get(slider.id) ?? 0;
    const accel = this.slideAccelMap.get(slider.id) ?? 0;

    this.jointVelMap.set(slider.id, [
      anchorVel[0] + rate * u[0] + s * omega * uPerp[0],
      anchorVel[1] + rate * u[1] + s * omega * uPerp[1],
    ]);
    this.jointAccMap.set(slider.id, [
      anchorAcc[0] +
        accel * u[0] +
        2 * rate * omega * uPerp[0] +
        s * alpha * uPerp[0] -
        s * omega * omega * u[0],
      anchorAcc[1] +
        accel * u[1] +
        2 * rate * omega * uPerp[1] +
        s * alpha * uPerp[1] -
        s * omega * omega * u[1],
    ]);
  }

  /**
   * A floating slot's block holds its pin and its sliding joint on top of each
   * other, so they share a velocity and an acceleration exactly.
   *
   * The edge's own direction says which end the walk has already settled: both
   * directions occur, since the loop may reach the block from the crank (the
   * inverse case) or from the slot (the forward one). Asking which end already
   * has a value would not work — the maps are only cleared once per mechanism,
   * not per timestep, so after the first frame both ends always have one.
   */
  private static copyCoincidentMotion(
    simJoints: Joint[],
    edge: Extract<LoopEdge, { kind: 'link' }>
  ): void {
    const velocity = this.jointVelMap.get(edge.fromId);
    const acceleration = this.jointAccMap.get(edge.fromId);
    if (velocity) {
      this.jointVelMap.set(edge.toId, [velocity[0], velocity[1]]);
    }
    if (acceleration) {
      this.jointAccMap.set(edge.toId, [acceleration[0], acceleration[1]]);
    }
  }

  /**
   * Rates for a mechanism solved by the constraint set, if it was one.
   *
   * Joint rates come straight from differentiating the constraints. A body's
   * angular rate then follows from any two of its joints, and its centre of
   * mass from that -- the same relations the loop solver ends with, read off a
   * solved motion rather than assembled into a matrix.
   */
  private static applyConstraintKinematics(
    simJoints: Joint[],
    simLinks: Link[],
    commandRate: number
  ): boolean {
    const rates = PositionSolver.constraintKinematics(simJoints, simLinks, commandRate);
    if (!rates) {
      return false;
    }

    const zero: [number, number] = [0, 0];
    for (const joint of simJoints) {
      // Anything the constraint set did not solve is held by the ground.
      this.jointVelMap.set(joint.id, rates.velocity.get(joint.id) ?? zero);
      this.jointAccMap.set(joint.id, rates.acceleration.get(joint.id) ?? zero);
    }

    for (const link of simLinks) {
      const [first, second] = link.joints;
      if (!first || !second) {
        continue;
      }
      const rx = second.x - first.x;
      const ry = second.y - first.y;
      const spanSquared = rx * rx + ry * ry;
      const velocityOf = (joint: Joint) => this.jointVelMap.get(joint.id) ?? zero;
      const accelerationOf = (joint: Joint) => this.jointAccMap.get(joint.id) ?? zero;
      const [v1x, v1y] = velocityOf(first);
      const [v2x, v2y] = velocityOf(second);
      const [a1x, a1y] = accelerationOf(first);
      const [a2x, a2y] = accelerationOf(second);
      // omega = r x dv / |r|^2, and the same for alpha once the centripetal
      // term omega^2 r is taken back out of the relative acceleration.
      const omega = spanSquared < 1e-12 ? 0 : (rx * (v2y - v1y) - ry * (v2x - v1x)) / spanSquared;
      const alpha =
        spanSquared < 1e-12
          ? 0
          : (rx * (a2y - a1y + omega * omega * ry) - ry * (a2x - a1x - omega * omega * rx)) /
            spanSquared;
      this.linkAngVelMap.set(link.id, omega);
      this.linkAngAccMap.set(link.id, alpha);

      if (link instanceof RealLink) {
        const cx = link.CoM.x - first.x;
        const cy = link.CoM.y - first.y;
        this.linkCoMMap.set(link.id, [link.CoM.x, link.CoM.y]);
        this.linkVelMap.set(link.id, [v1x - omega * cy, v1y + omega * cx]);
        this.linkAccMap.set(link.id, [
          a1x - alpha * cy - omega * omega * cx,
          a1y + alpha * cx - omega * omega * cy,
        ]);
      }
    }
    return true;
  }

  private static determineLooplessKinematics(
    simJoints: Joint[],
    simLinks: Link[],
    initialAngularVelocity: number
  ): void {
    const inputJoint = simJoints.find(
      (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
    );
    const inputLink = simLinks.find(
      (link): link is RealLink =>
        link instanceof RealLink &&
        inputJoint !== undefined &&
        link.joints.some((joint) => joint.id === inputJoint.id)
    );
    if (!inputJoint || !inputLink) return;

    const velocityAt = (x: number, y: number): [number, number] => [
      -initialAngularVelocity * (y - inputJoint.y),
      initialAngularVelocity * (x - inputJoint.x),
    ];
    const accelerationAt = (x: number, y: number): [number, number] => [
      -Math.pow(initialAngularVelocity, 2) * (x - inputJoint.x),
      -Math.pow(initialAngularVelocity, 2) * (y - inputJoint.y),
    ];

    this.linkAngVelMap.set(inputLink.id, initialAngularVelocity);
    this.linkAngAccMap.set(inputLink.id, 0);
    this.linkCoMMap.set(inputLink.id, [inputLink.CoM.x, inputLink.CoM.y]);
    this.linkVelMap.set(inputLink.id, velocityAt(inputLink.CoM.x, inputLink.CoM.y));
    this.linkAccMap.set(inputLink.id, accelerationAt(inputLink.CoM.x, inputLink.CoM.y));

    inputLink.joints.forEach((joint) => {
      this.jointVelMap.set(joint.id, velocityAt(joint.x, joint.y));
      this.jointAccMap.set(joint.id, accelerationAt(joint.x, joint.y));
    });
  }

  private static kinematicsInitializer(
    joints: Joint[],
    links: Link[],
    initialAngularVelocity: number
  ) {
    if (this.groundJointIndexMap.size === 0) {
      joints.forEach((j, j_index) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        if (j.ground) {
          this.groundJointIndexMap.set(j.id, j_index);
        }
      });
    }

    if (this.inputJointIndex === undefined) {
      this.inputJointIndex = joints.findIndex((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        return j.input;
      });
      const inputJoint = joints[this.inputJointIndex];
      if (!(inputJoint instanceof RealJoint)) {
        return;
      }
      // this.inputLinkIndex = links.findIndex(l => l.id === inputJoint.links[0])
      // this.inputLinkIndex = links.indexOf(inputJoint.links[0]);
      this.inputLinkIndex = links.findIndex((l) => l.id === inputJoint.links[0].id);
    }

    for (const entry of this.groundJointIndexMap.entries()) {
      this.jointVelMap.set(entry[0], [0.0, 0.0]);
      this.jointAccMap.set(entry[0], [0.0, 0.0]);
    }

    switch (links[this.inputLinkIndex].constructor) {
      case RealLink:
        this.linkAngVelMap.set(links[this.inputLinkIndex].id, initialAngularVelocity);
        this.linkAngAccMap.set(links[this.inputLinkIndex].id, 0);
        break;
      case SliderBlock:
        if (!this.realJointIndexMap.has(links[this.inputLinkIndex].id)) {
          const inputLink = links[this.inputLinkIndex];
          if (!(inputLink instanceof RealLink)) {
            return;
          }
          if (inputLink.joints === undefined) {
            return;
          }
          // The sliding joint, specifically. `instanceof RealJoint` matched the
          // block's *pin* first -- a PrisJoint is a RealJoint -- and the
          // PrisJoint check below then bailed out of the whole initializer, so
          // a driven block was seeded with no velocity at all.
          const realJoint = inputLink.joints.find((j) => j instanceof PrisJoint);
          if (realJoint === undefined) {
            return;
          }
          // Match by id: the per-timestep joint arrays hold copies, so an
          // identity indexOf against the link's original joints finds nothing.
          this.realJointIndexMap.set(
            links[this.inputLinkIndex].id,
            joints.findIndex((j) => j.id === realJoint.id)
          );
          const prisJoint = links[this.inputLinkIndex].joints.find(
            (jt) => jt instanceof PrisJoint
          ) as PrisJoint;
          this.desiredAngleMap.set(links[this.inputLinkIndex].id, prisJoint.slotAngle);
        }
        const inputLink = links[this.inputLinkIndex].id;
        if (inputLink === undefined) {
          return;
        }
        const realJoint = joints[this.realJointIndexMap.get(inputLink)!];
        if (!(realJoint instanceof PrisJoint)) {
          return;
        }
        // Along the guide at the commanded speed -- true only while the guide
        // is fixed in the world. On a slot cut into a moving link the block's
        // absolute velocity is the carrier's plus the sliding rate, and
        // writing the sliding rate alone would report a cylinder's mount as
        // travelling through ground it is actually being carried over. Phase 5
        // drives such a cylinder's *positions*; its velocity analysis is left
        // unseeded rather than seeded wrongly, and is Phase 6 work.
        if (realJoint.ground) {
          this.jointVelMap.set(realJoint.id, [
            initialAngularVelocity * Math.cos(realJoint.slotAngle),
            initialAngularVelocity * Math.sin(realJoint.slotAngle),
          ]);
          this.jointAccMap.set(realJoint.id, [0.0, 0.0]);
        }
        break;
      default:
        break;
    }

    links.forEach((l) => {
      if (l instanceof SliderBlock) {
        return;
      }
      const angle = Math.atan2(l.joints[1].y - l.joints[0].y, l.joints[1].x - l.joints[0].x);
      const RadToDeg = 180 / Math.PI;
      this.linkAngPosMap.set(l.id, angle * RadToDeg);
    });

    // A welded rider cannot turn in its block, and a block in a guide fixed to
    // the world cannot turn at all. So the assembly's rotation is not an
    // unknown the loop has to solve — it is zero, and saying so is what leaves
    // the system square.
    this.slideAssemblyCache = slideAssemblies(joints);
    links.forEach((link) => {
      if (!hasFixedOrientation(link, this.slideAssemblyCache)) {
        return;
      }
      this.linkAngVelMap.set(link.id, 0);
      this.linkAngAccMap.set(link.id, 0);
    });

    if (this.linkIndexMap.size === 0) {
      this.requiredLoops.forEach((loop) => {
        // initialize the jointIndexMap and linkIndexMap
        loop.edges.forEach((edge) => {
          if (edge.kind === 'link' && !this.linkIndexMap.has(edge.linkId)) {
            this.setLinkIndexMap(edge.linkId, links);
          }
        });
      });
    }
    joints.forEach((joint) => {
      this.setJointIndexMap(joint.id, joints);
    });

    if (this.unknownLinkIndexMap.size === 0) {
      this.requiredLoops.forEach((loop) => {
        for (const edge of loop.edges) {
          if (edge.kind === 'slot') {
            this.registerSlotUnknowns(joints, edge);
            continue;
          }
          const link = links[this.linkIndexMap.get(edge.linkId)!];
          // Registration path 2 of 3 (§3.6b). This is the one the Scotch yoke
          // never reaches -- its yoke is met across the slot, not along a link
          // edge -- so gating only path 1 would pass Gate 3 and still hand a
          // spurious column to any welded rider that does sit on an edge.
          if (this.isFloatingBlock(link) || hasFixedOrientation(link, this.slideAssemblyCache)) {
            continue;
          }
          switch (link.constructor) {
            case RealLink:
              if (!(link instanceof RealLink)) {
                return;
              }
              if (!this.linkContainsInputMap.has(link.id)) {
                this.linkContainsInputMap.set(
                  link.id,
                  link.joints.findIndex((j) => {
                    if (!(j instanceof RealJoint)) {
                      return;
                    }
                    return j.input;
                  }) !== -1
                );
              }
              if (
                !this.unknownLinkIndexMap.has(link.id) &&
                !this.linkContainsInputMap.get(link.id)
              ) {
                this.unknownLinkIndexMap.set(link.id, this.unknownLinkIndexMap.size);
              }
              break;
            case SliderBlock:
              if (!this.realJointIndexMap.has(link.id)) {
                const connectedJoint = link.joints.find((j) => j instanceof RealJoint)!;
                // Match by id: the per-timestep joint arrays hold copies, so
                // an identity indexOf against the link's original joints
                // finds nothing and the index comes back -1.
                this.realJointIndexMap.set(
                  link.id,
                  joints.findIndex((j) => j.id === connectedJoint.id)
                );
                const prisJoint = link.joints.find((jt) => jt instanceof PrisJoint) as PrisJoint;
                this.desiredAngleMap.set(connectedJoint.id, prisJoint.slotAngle);
              }

              const desiredJoint = joints[this.realJointIndexMap.get(link.id)!];
              if (!this.linkContainsInputMap.has(desiredJoint.id)) {
                this.linkContainsInputMap.set(
                  desiredJoint.id,
                  link.joints.findIndex((j) => {
                    if (!(j instanceof RealJoint)) {
                      return;
                    }
                    return j.input;
                  }) !== -1
                );
              }
              if (
                !this.unknownLinkIndexMap.has(desiredJoint.id) &&
                !this.linkContainsInputMap.get(desiredJoint.id)
              ) {
                this.unknownLinkIndexMap.set(desiredJoint.id, this.unknownLinkIndexMap.size);
              }
              break;
          }
        }
      });
    }

    this.A_matrix_AngVel = [];
    this.B_matrix_AngVel = [];
    this.A_matrix_AngAcc = [];
    this.B_matrix_AngAcc = [];
  }

  /**
   * A slot crossing carries two unknowns, not one: how fast the block travels
   * along the slot, and how fast the slot itself is turning. The carrier is
   * reached only through this crossing in mechanisms like the inverted
   * slider-crank — it appears in no link edge of the loop — so its angular
   * velocity has to be claimed here or it never gets a column.
   *
   * Registration order is load-bearing: `determineArrays` rebuilds the same
   * list every timestep and the two must agree, because a column index from
   * this map indexes into that list.
   */
  private static registerSlotUnknowns(
    simJoints: Joint[],
    edge: Extract<LoopEdge, { kind: 'slot' }>
  ): void {
    const frame = this.slotFrame(simJoints, edge);
    if (!frame) {
      return;
    }
    const carrierId = frame.carrier.id;
    // Registration path 1 of 3 (§3.6b). A carrier welded to a grounded guide
    // has a known rotation of zero, so claiming a column here would leave the
    // loop one unknown short of an equation.
    if (hasFixedOrientation(frame.carrier, this.slideAssemblyCache)) {
      if (!this.unknownLinkIndexMap.has(frame.slider.id)) {
        this.unknownLinkIndexMap.set(frame.slider.id, this.unknownLinkIndexMap.size);
      }
      return;
    }
    if (!this.linkContainsInputMap.has(carrierId)) {
      this.linkContainsInputMap.set(
        carrierId,
        frame.carrier.joints.some((joint) => joint instanceof RealJoint && joint.input)
      );
    }
    if (!this.unknownLinkIndexMap.has(carrierId) && !this.linkContainsInputMap.get(carrierId)) {
      this.unknownLinkIndexMap.set(carrierId, this.unknownLinkIndexMap.size);
    }
    if (!this.unknownLinkIndexMap.has(frame.slider.id)) {
      this.unknownLinkIndexMap.set(frame.slider.id, this.unknownLinkIndexMap.size);
    }
  }

  private static determineAng(simJoints: Joint[], simLinks: Link[], analysisType: string) {
    // 1st, determine arrays from loops and put that within their respective arrays
    const unknownLinks = this.determineArrays(simJoints, simLinks, analysisType);
    // 2nd, store determine unknown Angular Velocities
    let X: Array<Array<number>> = [];
    switch (analysisType) {
      case 'Velocity':
        X = matLinearSystem(this.A_matrix_AngVel, this.B_matrix_AngVel);
        break;
      case 'Acceleration':
        X = matLinearSystem(this.A_matrix_AngAcc, this.B_matrix_AngAcc);
        break;
    }
    // const X = lusolve(this.A_matrix_AngVel, this.B_matrix_AngVel);
    // 3rd, store unknown values to respected links
    for (let i = 0; i < X.length; i++) {
      const linkOrJoint = unknownLinks[i];
      if (linkOrJoint instanceof RealLink) {
        // Link
        switch (analysisType) {
          case 'Velocity':
            this.linkAngVelMap.set(linkOrJoint.id, X[i][0]);
            break;
          case 'Acceleration':
            this.linkAngAccMap.set(linkOrJoint.id, X[i][0]);
        }
      } else if (linkOrJoint instanceof PrisJoint && linkOrJoint.isFloating) {
        // The solved value is travel relative to the carrier, so it is banked
        // rather than written straight out as a velocity. applySlotCarriage
        // turns it into absolute motion once the carrier's is known.
        if (analysisType === 'Velocity') {
          this.slideRateMap.set(linkOrJoint.id, X[i][0]);
        } else {
          this.slideAccelMap.set(linkOrJoint.id, X[i][0]);
        }
      } else {
        // Joint
        const desiredAngle = this.desiredAngleMap.get(linkOrJoint.id)!;
        switch (analysisType) {
          case 'Velocity':
            this.jointVelMap.set(linkOrJoint.id, [
              X[i][0] * Math.cos(desiredAngle),
              X[i][0] * Math.sin(desiredAngle),
              // X[i][0] * Math.cos(linkOrJoint.angle),
              // X[i][0] * Math.sin(linkOrJoint.angle),
            ]);
            break;
          case 'Acceleration':
            this.jointAccMap.set(linkOrJoint.id, [
              X[i][0] * Math.cos(desiredAngle),
              X[i][0] * Math.sin(desiredAngle),
              // X[i][0] * Math.cos(linkOrJoint.angle),
              // X[i][0] * Math.sin(linkOrJoint.angle),
            ]);
            break;
        }
      }
    }
  }

  private static determineLin(simJoints: Joint[], simLinks: Link[]) {
    // this.setUpLinkAndJointIndexMap(simJoints, simLinks, requiredLoops);
    const desired_links_used: Array<string> = [];
    this.requiredLoops.forEach((loop) => {
      for (const edge of loop.edges) {
        if (edge.kind === 'slot') {
          // Both in loop order, because each depends on what came before: the
          // carrier is reached only across the slot, and the sliding point's
          // own motion is measured from the anchor the walk has just passed.
          this.spreadCarrierMotion(simJoints, edge, desired_links_used);
          this.applySlotCarriage(simJoints, edge);
          continue;
        }
        // cannot find velocity of a joint on an imaginary link
        if (edge.kind !== 'link') {
          continue;
        }
        if (simLinks[this.linkIndexMap.get(edge.linkId)!] instanceof SliderBlock) {
          if (this.isFloatingBlock(simLinks[this.linkIndexMap.get(edge.linkId)!])) {
            this.copyCoincidentMotion(simJoints, edge);
          }
          continue;
        }
        const desiredLink = simLinks[this.linkIndexMap.get(edge.linkId)!];
        if (!(desiredLink instanceof RealLink)) {
          return;
        }
        const firstJoint = simJoints[this.jointIndexMap.get(edge.fromId)!];
        // determine the velocity/accel of each link's joint that is not the first joint
        for (let index = 0; index < desiredLink.id.length; index++) {
          const joint_id = desiredLink.id[index];
          const desiredJoint = simJoints[this.jointIndexMap.get(joint_id)!];
          if (joint_id === firstJoint.id) {
            continue;
          }
          // determine the distance for the left side of the equation
          const leftXDist = desiredJoint.x - firstJoint.x;
          const leftYDist = desiredJoint.y - firstJoint.y;

          // velocity and acceleration for joint
          this.determineVelAndAccel(
            desiredLink.id,
            firstJoint.id,
            leftXDist,
            leftYDist,
            desiredJoint.id,
            'joint'
          );
        }

        // set for where link's center of mass is located
        if (desired_links_used.findIndex((id) => id === desiredLink.id) !== -1) {
          continue;
        }
        this.linkCoMMap.set(desiredLink.id, [desiredLink.CoM.x, desiredLink.CoM.y]);
        // determine velocity and acceleration for link's center of mass
        this.determineVelAndAccel(
          desiredLink.id,
          firstJoint.id,
          desiredLink.CoM.x - firstJoint.x,
          desiredLink.CoM.y - firstJoint.y,
          desiredLink.id,
          'link'
        );
        desired_links_used.push(desiredLink.id);
      }
    });
    // determine the velocity and acceleration of tracer joints
  }

  /**
   * Whether a block belongs to a floating slot rather than a grounded guide.
   *
   * For a grounded guide the block edge *is* the sliding pair, and its rate is
   * the unknown. For a floating slot the sliding is the slot edge, and the
   * block is a zero-length rigid coincidence between the pin and the sliding
   * joint — the two are held on top of each other at every timestep. Its edge
   * vector is therefore zero and it contributes nothing; treating it as a
   * second sliding pair invents an unknown the loop has no equation for, and
   * the whole system goes singular.
   */
  private static isFloatingBlock(link: Link): boolean {
    return (
      link instanceof SliderBlock &&
      link.joints.some((joint) => joint instanceof PrisJoint && joint.isFloating)
    );
  }

  /**
   * Carry the carrier's solved rotation out to its own joints and centre of mass.
   *
   * Propagation starts from whichever carrier joint already has motion, not
   * from the slot's anchor. Which of the two slot joints becomes `slotJointA`
   * is arbitrary — the user picks an order in the UI, and a URL may list them
   * either way — so the anchor is the carrier's grounded pivot in some
   * mechanisms and its free end in others. Anchoring propagation there read an
   * unset velocity and threw whenever the free end came first.
   *
   * By this point the matrix solve has settled the carrier's ω and α, so any
   * member with known motion locates every other one; a grounded member always
   * qualifies, having been seeded before the walk began.
   */
  private static spreadCarrierMotion(
    simJoints: Joint[],
    edge: Extract<LoopEdge, { kind: 'slot' }>,
    linksAlreadyDone: string[]
  ): void {
    const frame = this.slotFrame(simJoints, edge);
    if (!frame || !(frame.carrier instanceof RealLink)) {
      return;
    }
    const seed = this.knownCarrierSeed(frame);
    if (!seed) {
      return;
    }
    for (const member of frame.carrier.joints) {
      if (member.id === seed.id) {
        continue;
      }
      this.determineVelAndAccel(
        frame.carrier.id,
        seed.id,
        member.x - seed.x,
        member.y - seed.y,
        member.id,
        'joint'
      );
    }
    if (linksAlreadyDone.includes(frame.carrier.id)) {
      return;
    }
    this.linkCoMMap.set(frame.carrier.id, [frame.carrier.CoM.x, frame.carrier.CoM.y]);
    this.determineVelAndAccel(
      frame.carrier.id,
      seed.id,
      frame.carrier.CoM.x - seed.x,
      frame.carrier.CoM.y - seed.y,
      frame.carrier.id,
      'link'
    );
    linksAlreadyDone.push(frame.carrier.id);
  }

  /** A carrier joint whose motion is settled, preferring the slot's own anchor. */
  private static knownCarrierSeed(frame: SlotFrame): Joint | undefined {
    const settled = (id: string) => this.jointVelMap.has(id) && this.jointAccMap.has(id);
    if (settled(frame.anchor.id)) {
      return frame.anchor;
    }
    return frame.carrier.joints.find((member) => settled(member.id));
  }

  /**
   * The slot's contribution to one loop-closure equation.
   *
   * The chain crosses the slot as the vector `σ·s·û`, so differentiating gives
   *   velocity      σ·( ṡ·û + s·ω·û⊥ )
   *   acceleration  σ·( s̈·û + 2·ṡ·ω·û⊥ + s·α·û⊥ − s·ω²·û )
   * where ω and α belong to the carrier. The grounded case is this with
   * ω = α = 0, which is why the old code could get away with just `ṡ·û`.
   *
   * Unknowns go to A with the coefficient above; anything already known moves
   * to B, which flips its sign — the same convention the link branches use.
   */
  private static addSlotTerms(
    simJoints: Joint[],
    edge: Extract<LoopEdge, { kind: 'slot' }>,
    loop: Loop,
    analysisType: string
  ): void {
    const frame = this.slotFrame(simJoints, edge);
    if (!frame) {
      return;
    }
    const rowIndex = 2 * this.loopIndexMap.get(loop.id)!;
    const slideColumn = this.unknownLinkIndexMap.get(frame.slider.id);
    const carrierColumn = this.unknownLinkIndexMap.get(frame.carrier.id);
    const omega = this.linkAngVelMap.get(frame.carrier.id) ?? 0;
    const velocity = analysisType === 'Velocity';
    const A = velocity ? this.A_matrix_AngVel : this.A_matrix_AngAcc;
    const B = velocity ? this.B_matrix_AngVel : this.B_matrix_AngAcc;

    if (slideColumn !== undefined) {
      A[rowIndex][slideColumn] += frame.sign * frame.u[0];
      A[rowIndex + 1][slideColumn] += frame.sign * frame.u[1];
    }

    // Turning of the slot: ω for the velocity pass, α for acceleration.
    const turnCoefficient = frame.sign * frame.s;
    if (carrierColumn !== undefined) {
      A[rowIndex][carrierColumn] += turnCoefficient * frame.uPerp[0];
      A[rowIndex + 1][carrierColumn] += turnCoefficient * frame.uPerp[1];
    } else {
      const known = velocity ? omega : (this.linkAngAccMap.get(frame.carrier.id) ?? 0);
      B[rowIndex][0] -= turnCoefficient * known * frame.uPerp[0];
      B[rowIndex + 1][0] -= turnCoefficient * known * frame.uPerp[1];
    }

    if (!velocity) {
      // Coriolis and centripetal, both settled by the velocity pass.
      const rate = this.slideRateMap.get(frame.slider.id) ?? 0;
      const carriedX = 2 * rate * omega * frame.uPerp[0] - frame.s * omega * omega * frame.u[0];
      const carriedY = 2 * rate * omega * frame.uPerp[1] - frame.s * omega * omega * frame.u[1];
      B[rowIndex][0] -= frame.sign * carriedX;
      B[rowIndex + 1][0] -= frame.sign * carriedY;
    }
  }

  // determine AX = B
  private static determineArrays(
    simJoints: Joint[],
    simLinks: Link[],
    analysisType: string
  ): any[] {
    const unknownLinksOrJoints: Array<any> = [];
    // first, determine variable locations (X)
    this.requiredLoops.forEach((loop) => {
      for (const edge of loop.edges) {
        if (edge.kind === 'slot') {
          // Same order as registerSlotUnknowns: carrier first, then slide rate.
          const frame = this.slotFrame(simJoints, edge);
          if (!frame) {
            continue;
          }
          for (const unknown of [frame.carrier, frame.slider]) {
            if (
              this.unknownLinkIndexMap.has(unknown.id) &&
              unknownLinksOrJoints.findIndex((l) => l.id === unknown.id) === -1
            ) {
              unknownLinksOrJoints.push(unknown);
            }
          }
          continue;
        }
        const link = simLinks[this.linkIndexMap.get(edge.linkId)!];
        // Registration path 3 of 3 (§3.6b). This list sizes the matrix and its
        // order indexes the columns, so it has to agree with paths 1 and 2
        // exactly or a column index points at the wrong unknown.
        if (this.isFloatingBlock(link) || hasFixedOrientation(link, this.slideAssemblyCache)) {
          continue;
        }
        switch (link.constructor) {
          case RealLink:
            if (
              this.unknownLinkIndexMap.has(link.id) &&
              unknownLinksOrJoints.findIndex((l) => l.id === link.id) === -1
            ) {
              unknownLinksOrJoints.push(link);
            }
            break;
          case SliderBlock:
            const desiredJoint = simJoints[this.realJointIndexMap.get(link.id)!];
            if (this.unknownLinkIndexMap.has(desiredJoint.id)) {
              unknownLinksOrJoints.push(desiredJoint);
            }
            break;
        }
      }
    });
    for (let i = 0; i < unknownLinksOrJoints.length; i++) {
      const row = [];
      for (let j = 0; j < unknownLinksOrJoints.length; j++) {
        row.push(0);
      }
      switch (analysisType) {
        case 'Velocity':
          this.A_matrix_AngVel.push(row);
          this.B_matrix_AngVel.push([0]);
          break;
        case 'Acceleration':
          this.A_matrix_AngAcc.push(row);
          this.B_matrix_AngAcc.push([0]);
          break;
      }
    }

    if (!this.loopIndexMap.has(this.requiredLoops[0].id)) {
      this.requiredLoops.forEach((loop, index) => {
        this.loopIndexMap.set(loop.id, index);
      });
    }

    // second, set up the known and unknown matrix (A and B)
    this.requiredLoops.forEach((loop) => {
      for (const edge of loop.edges) {
        if (edge.kind === 'slot') {
          this.addSlotTerms(simJoints, edge, loop, analysisType);
          continue;
        }
        const link = this.getLink(simLinks, edge.linkId);
        // A body held at a fixed orientation contributes omega x r and
        // alpha x r with both factors zero, so it adds nothing to either side.
        if (this.isFloatingBlock(link) || hasFixedOrientation(link, this.slideAssemblyCache)) {
          continue;
        }
        const firstJoint = this.getJoint(simJoints, edge.fromId);
        const secondJoint = this.getJoint(simJoints, edge.toId);
        // right side of the equation (B)
        const rightXDist = firstJoint.x - secondJoint.x;
        const rightYDist = firstJoint.y - secondJoint.y;
        // left side of the equation (A)
        const leftXDist = secondJoint.x - firstJoint.x;
        const leftYDist = secondJoint.y - firstJoint.y;
        let sol: Array<number>;
        let arr: Array<number>;
        switch (
          analysisType // clean later
        ) {
          case 'Velocity':
            if (link === simLinks[this.inputLinkIndex]) {
              // part of input link (B matrix)
              switch (link.constructor) {
                case RealLink:
                  // v = w x r
                  arr = this.crossProduct(this.linkAngVelMap.get(link.id)!, [
                    rightXDist,
                    rightYDist,
                    0,
                  ]);
                  break;
                case SliderBlock:
                  const realJoint = simJoints[this.realJointIndexMap.get(link.id)!];
                  // // slider crank x, y
                  // if (!(realJoint instanceof PrisJoint)) {
                  //   return;
                  // }
                  const desiredAngle = this.desiredAngleMap.get(realJoint.id)!;
                  arr = [Math.cos(desiredAngle), Math.sin(desiredAngle), 0];
                  // arr = [Math.cos(realJoint.slotAngle), Math.sin(realJoint.slotAngle), 0];
                  break;
                default:
                  return;
              }
              // insert value within B matrix
              const rowIndex = 2 * this.loopIndexMap.get(loop.id)!;
              this.B_matrix_AngVel[rowIndex][0] += arr[0];
              this.B_matrix_AngVel[rowIndex + 1][0] += arr[1];
            } else {
              // not an input Link (A matrix)
              let colIndex: number;
              switch (link.constructor) {
                case RealLink:
                  arr = this.crossProduct(1, [leftXDist, leftYDist, 0]);
                  colIndex = this.unknownLinkIndexMap.get(link.id)!;
                  break;
                case SliderBlock:
                  const realJoint = simJoints[this.realJointIndexMap.get(link.id)!];
                  // if (!(realJoint instanceof PrisJoint)) {
                  //   return;
                  // }
                  const desiredAngle = this.desiredAngleMap.get(realJoint.id)!;
                  arr = [-Math.cos(desiredAngle), -Math.sin(desiredAngle), 0];
                  // arr = [-Math.cos(realJoint.slotAngle), -Math.sin(realJoint.slotAngle), 0];
                  colIndex = this.unknownLinkIndexMap.get(realJoint.id)!;
                  break;
                default:
                  return;
              }

              // insert value within A matrix
              const rowIndex = 2 * this.loopIndexMap.get(loop.id)!;
              this.A_matrix_AngVel[rowIndex][colIndex] += arr[0];
              this.A_matrix_AngVel[rowIndex + 1][colIndex] += arr[1];
            }
            break;
          case 'Acceleration':
            if (link === simLinks[this.inputLinkIndex]) {
              // input link
              const rowIndex = 2 * this.loopIndexMap.get(loop.id)!;
              switch (link.constructor) {
                case RealLink:
                  arr = this.crossProduct(this.linkAngVelMap.get(link.id)!, [
                    rightXDist,
                    rightYDist,
                    0,
                  ]);
                  const transAccel = this.crossProduct(this.linkAngVelMap.get(link.id)!, arr);
                  const angularAccel = this.crossProduct(this.linkAngAccMap.get(link.id)!, [
                    rightXDist,
                    rightYDist,
                    0,
                  ]);
                  sol = this.addTwoArrays(transAccel, angularAccel);
                  break;
                case SliderBlock:
                  const realJoint = simJoints[this.realJointIndexMap.get(link.id)!];
                  // if (!(realJoint instanceof PrisJoint)) {
                  //   return;
                  // }
                  const desiredAngle = this.desiredAngleMap.get(realJoint.id)!;
                  // arr = [-Math.cos(desiredAngle), -Math.sin(desiredAngle), 0];
                  sol = [Math.cos(desiredAngle), Math.sin(desiredAngle)];
                  break;
                default:
                  return;
              }
              this.B_matrix_AngAcc[rowIndex][0] += sol[0];
              this.B_matrix_AngAcc[rowIndex + 1][0] += sol[1];
            } else {
              const rowIndex = 2 * this.loopIndexMap.get(loop.id)!;
              let colIndex: number;
              switch (link.constructor) {
                case RealLink:
                  const arr2 = this.crossProduct(this.linkAngVelMap.get(link.id)!, [
                    rightXDist,
                    rightYDist,
                    0,
                  ]);
                  const transAccel = this.crossProduct(this.linkAngVelMap.get(link.id)!, [
                    arr2[0],
                    arr2[1],
                    arr2[2],
                  ]);
                  sol = this.crossProduct(1, [leftXDist, leftYDist, 0]); // angularAccel
                  this.B_matrix_AngAcc[rowIndex][0] += transAccel[0];
                  this.B_matrix_AngAcc[rowIndex + 1][0] += transAccel[1];
                  colIndex = this.unknownLinkIndexMap.get(link.id)!;
                  break;
                case SliderBlock:
                  const realJoint = simJoints[this.realJointIndexMap.get(link.id)!];
                  // if (!(realJoint instanceof PrisJoint)) {
                  //   return;
                  // }
                  const desiredAngle = this.desiredAngleMap.get(realJoint.id)!;
                  // arr = [-Math.cos(desiredAngle), -Math.sin(desiredAngle), 0];
                  sol = [-Math.cos(desiredAngle), -Math.sin(desiredAngle)];
                  colIndex = this.unknownLinkIndexMap.get(realJoint.id)!;
                  break;
                default:
                  return;
              }
              this.A_matrix_AngAcc[rowIndex][colIndex] += sol[0];
              this.A_matrix_AngAcc[rowIndex + 1][colIndex] += sol[1];
            }
            break;
        }
      }
    });
    return unknownLinksOrJoints;
  }

  private static setLinkIndexMap(linkId: string, simLinks: Link[]) {
    this.linkIndexMap.set(
      linkId,
      simLinks.findIndex((l) => l.id === linkId)
    );
  }

  private static setJointIndexMap(joint_id1: string, simJoints: Joint[]) {
    this.jointIndexMap.set(
      joint_id1,
      simJoints.findIndex((j) => j.id === joint_id1)
    );
  }

  static getLink(simLinks: Link[], link_id: string) {
    return simLinks[this.linkIndexMap.get(link_id)!];
  }

  private static getJoint(simJoints: Joint[], joint_id: string) {
    return simJoints[this.jointIndexMap.get(joint_id)!];
  }

  private static addTwoArrays(first_array: any, second_array: any) {
    return first_array.map(function (num: number, idx: number) {
      // may have to caste num and second_array[idx]
      return num + second_array[idx];
    });
  }

  private static determineVelAndAccel(
    desiredLinkID: string,
    firstJointID: string,
    xDist: number,
    yDist: number,
    desiredID: string,
    linkOrJoint: string
  ) {
    // Velocity calculation
    // w x r
    const arr = this.crossProduct(this.linkAngVelMap.get(desiredLinkID)!, [xDist, yDist, 0]);
    // Acceleration calculation
    // w x (w x r)
    const angularAccel = this.crossProduct(this.linkAngVelMap.get(desiredLinkID)!, arr);
    // alpha x r
    const transAccel = this.crossProduct(this.linkAngAccMap.get(desiredLinkID)!, [xDist, yDist, 0]);
    // add both accelerations together
    const knownAng = this.addTwoArrays(angularAccel, transAccel);
    let firstValue = '';
    let firstSign = '';
    let secondValue = '';
    let secondSign = '';
    let thirdValue = '';
    let thirdSign = '';
    let fourthValue = '';
    let fourthSign = '';
    let fifthValue = '';
    let fifthSign = '';
    let sixthValue = '';
    let sixthSign = '';
    let seventhValue = '';
    let seventhSign = '';
    let eighthValue = '';
    let eighthSign = '';
    // set link's acceleration
    if (linkOrJoint === 'joint') {
      // set joint velocity
      firstValue = (Math.round(arr[0] * 1000) / 1000).toString();
      secondValue = (Math.round(this.jointVelMap.get(firstJointID)![0] * 1000) / 1000).toString();
      thirdValue = (Math.round(arr[1] * 1000) / 1000).toString();
      fourthValue = (Math.round(this.jointVelMap.get(firstJointID)![1] * 1000) / 1000).toString();
      fifthValue = (Math.round(knownAng[0] * 1000) / 1000).toString();
      sixthValue = (Math.round(this.jointAccMap.get(firstJointID)![0] * 1000) / 1000).toString();
      seventhValue = (Math.round(knownAng[1] * 1000) / 1000).toString();
      eighthValue = (Math.round(this.jointAccMap.get(firstJointID)![1] * 1000) / 1000).toString();
      [firstSign, firstValue, secondSign, secondValue] = this.determineValStrings(
        firstValue,
        secondValue
      );
      [thirdSign, thirdValue, fourthSign, fourthValue] = this.determineValStrings(
        thirdValue,
        fourthValue
      );
      [fifthSign, fifthValue, sixthSign, sixthValue] = this.determineValStrings(
        fifthValue,
        sixthValue
      );
      [seventhSign, seventhValue, eighthSign, eighthValue] = this.determineValStrings(
        seventhValue,
        eighthValue
      );

      this.jointVelMap.set(desiredID, [
        arr[0] + this.jointVelMap.get(firstJointID)![0],
        arr[1] + this.jointVelMap.get(firstJointID)![1],
      ]);
      this.LinVelJointEq.set(desiredID, [
        firstValue + secondSign + secondValue,
        thirdValue + fourthSign + fourthValue,
      ]);

      // set joint acceleration
      this.jointAccMap.set(desiredID, [
        knownAng[0] + this.jointAccMap.get(firstJointID)![0],
        knownAng[1] + this.jointAccMap.get(firstJointID)![1],
      ]);
      this.LinAccJointEq.set(desiredID, [
        fifthValue + sixthSign + sixthValue,
        seventhValue + eighthSign + eighthValue,
      ]);
    } else {
      // link
      firstValue = (Math.round(arr[0] * 1000) / 1000).toString();
      secondValue = (Math.round(this.jointVelMap.get(firstJointID)![0] * 1000) / 1000).toString();
      thirdValue = (Math.round(arr[1] * 1000) / 1000).toString();
      fourthValue = (Math.round(this.jointVelMap.get(firstJointID)![1] * 1000) / 1000).toString();
      fifthValue = (Math.round(knownAng[0] * 1000) / 1000).toString();
      sixthValue = (Math.round(this.jointAccMap.get(firstJointID)![0] * 1000) / 1000).toString();
      seventhValue = (Math.round(knownAng[1] * 1000) / 1000).toString();
      eighthValue = (Math.round(this.jointAccMap.get(firstJointID)![1] * 1000) / 1000).toString();
      [firstSign, firstValue, secondSign, secondValue] = this.determineValStrings(
        firstValue,
        secondValue
      );
      [thirdSign, thirdValue, fourthSign, fourthValue] = this.determineValStrings(
        thirdValue,
        fourthValue
      );
      [fifthSign, fifthValue, sixthSign, sixthValue] = this.determineValStrings(
        fifthValue,
        sixthValue
      );
      [seventhSign, seventhValue, eighthSign, eighthValue] = this.determineValStrings(
        seventhValue,
        eighthValue
      );
      // set link's center of mass Velocity
      this.linkVelMap.set(desiredID, [
        arr[0] + this.jointVelMap.get(firstJointID)![0],
        arr[1] + this.jointVelMap.get(firstJointID)![1],
      ]);
      this.LinVelLinkEq.set(desiredID, [
        firstValue + secondSign + secondValue,
        thirdValue + fourthSign + fourthValue,
      ]);
      // set link's center of mass Acceleration
      this.linkAccMap.set(desiredID, [
        knownAng[0] + this.jointAccMap.get(firstJointID)![0],
        knownAng[1] + this.jointAccMap.get(firstJointID)![1],
      ]);
      this.LinAccLinkEq.set(desiredID, [
        fifthValue + sixthSign + sixthValue,
        seventhValue + eighthSign + eighthValue,
      ]);
    }
  }

  private static crossProduct(ang_vel: number, pos: number[]) {
    return [-ang_vel * pos[1], ang_vel * pos[0], 0];
  }

  private static determineValStrings(firstValue: string, secondValue: string) {
    let firstSign = '';
    let secondSign = '';
    switch (firstValue[0]) {
      case '-':
        firstSign = '-';
        break;
      case '0':
        firstSign = '';
        firstValue = '';
        break;
      default:
        firstSign = '+';
        break;
    }
    if (firstValue !== '') {
      switch (secondValue[0]) {
        case '-':
          secondSign = ' - ';
          secondValue = secondValue.substring(1);
          break;
        case '0':
          secondSign = '';
          secondValue = '';
          break;
        default:
          secondSign = ' + ';
          break;
      }
    }
    return [firstSign, firstValue, secondSign, secondValue];
  }
}
