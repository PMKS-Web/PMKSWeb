import { Injectable, Injector, inject } from '@angular/core';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { roundNumber, point_on_line_segment_closest_to_point } from '../model/utils';
import { Link, SliderBlock, RealLink } from '../model/link';
import {
  Cylinder,
  CylinderPose,
  layoutCylinder,
  poseFromStrokeAndStart,
  sealedCylinderStructures,
  stretchedCylinderPose,
} from '../model/cylinder';
import { SettingsService } from './settings.service';
import { MechanismService } from './mechanism.service';
import { canDrive } from '../model/actuator';
import { Lockable, frozenJointIds, locksHolding } from '../model/lock-set';
import { Coord } from '../model/coord';
import { PositionSolver } from '../model/mechanism/position-solver';
import { Force } from '../model/force';
import { Arc, Line } from '../model/line';
import { SynthesisPose } from './synthesis/synthesis-util';
import { SynthesisBuilderService } from './synthesis/synthesis-builder.service';
import { SvgGridService } from './svg-grid.service';
import { ColorService } from './color.service';

/**
 * Map a point from one two-joint frame to another, letting the frame stretch.
 *
 * A neighbour of a link drag is deformed rather than moved: its reference
 * joints change separation as well as direction. A rigid transform would hold
 * the load's absolute distance from the first joint and slide it off the end of
 * a shortened link, so the frame's scale has to come along too. That keeps the
 * load at the same point *of the link*, which is the invariant dragJoint
 * already preserves for a binary link.
 */
function pointThroughFrame(
  point: { x: number; y: number },
  fromStart: { x: number; y: number },
  fromEnd: { x: number; y: number },
  toStart: { x: number; y: number },
  toEnd: { x: number; y: number }
): [number, number] {
  const fromX = fromEnd.x - fromStart.x;
  const fromY = fromEnd.y - fromStart.y;
  const fromLengthSquared = fromX * fromX + fromY * fromY;
  if (fromLengthSquared === 0) {
    return [point.x + (toStart.x - fromStart.x), point.y + (toStart.y - fromStart.y)];
  }

  // The point in the frame's own basis: `along` the joint axis and `across` it.
  const relativeX = point.x - fromStart.x;
  const relativeY = point.y - fromStart.y;
  const along = (relativeX * fromX + relativeY * fromY) / fromLengthSquared;
  const across = (relativeY * fromX - relativeX * fromY) / fromLengthSquared;

  const toX = toEnd.x - toStart.x;
  const toY = toEnd.y - toStart.y;
  return [toStart.x + along * toX - across * toY, toStart.y + along * toY + across * toX];
}

@Injectable({
  providedIn: 'root',
})
export class GridUtilsService {
  private synthesisBuilder = inject(SynthesisBuilderService);
  svgGrid = inject(SvgGridService);
  private injector = inject(Injector);

  /**
   * MechanismService injects this service, so it can only be resolved at call
   * time — the same cycle-breaking the codebase already uses in MechanismService
   * and UrlProcessorService.
   */
  private get mechanismSrv(): MechanismService {
    return this.injector.get(MechanismService);
  }

  //Return a boolean, is this link a ground link?
  getGround(joint: Joint) {
    if (!(joint instanceof PrisJoint || joint instanceof RevJoint)) {
      return;
    }
    return joint.ground;
  }

  createRealLink(id: string, joints: Joint[]) {
    let newLink = new RealLink(id, joints);
    newLink.fill = ColorService.instance.getNextLinkColor();
    return newLink;
  }

  containsSlider(joint: Joint) {
    switch (joint.constructor) {
      case RevJoint:
        if (!(joint instanceof RevJoint)) {
          return false;
        }
        let condition = false;
        joint.connectedJoints.forEach((j) => {
          if (j.constructor === PrisJoint) {
            condition = true;
          }
        });
        return condition;
      case PrisJoint:
        return false;
      case RealJoint:
        return false;
      default:
        return false;
    }
  }

  getJointR(joint: Joint) {
    if (!(joint instanceof RevJoint)) {
      return 0;
    }
    return joint.r;
  }

  getJointShowCurve(joint: Joint) {
    if (!(joint instanceof RevJoint) && !(joint instanceof PrisJoint)) {
      return false;
    }
    return joint.showCurve;
  }

  getInput(joint: Joint) {
    if (!(joint instanceof RevJoint || joint instanceof PrisJoint)) {
      return;
    }
    return joint.input;
  }

  typeOfJoint(joint: Joint) {
    switch (joint.constructor) {
      case RevJoint:
        return 'R';
      case PrisJoint:
        return 'P';
      default:
        return '?';
    }
  }

  typeOfLink(link: Link) {
    switch (link.constructor) {
      case RealLink:
        return 'R';
      case SliderBlock:
        return 'P';
      default:
        return '?';
    }
  }

  getPrisAngle(joint: Joint) {
    return (joint as PrisJoint).angle_rad;
  }

  /**
   * Whether the Input control may be used on this joint.
   *
   * Lives here so the Edit panel and the right-click menu ask the same
   * question. They had drifted: the menu still greyed Ground out on a slider
   * and Weld out on a joint the reconciler would refuse, both of which the
   * panel deliberately stopped doing in §4.1 — Ground and Slider are
   * independent axes of the 2x2 now, and a refusal is explained rather than
   * hidden. Two surfaces onto one model that disagree about what is possible
   * are worse than either rule on its own.
   */
  canToggleInput(joint: Joint): boolean {
    // A floating pin is drivable now (§2.9, Phase 6): driving it prescribes the
    // relative angle between the two bodies that meet there, which is a
    // perfectly good input as long as exactly two of them do. The control stays
    // *enabled* where three meet, so the refusal is explained rather than
    // hidden -- the same rule Ground and Slider follow.
    if (!(joint instanceof RealJoint)) {
      return false;
    }
    // A slider is driven through its prismatic half, so that is the joint the
    // question is really about.
    const driven = this.isAttachedToSlider(joint)
      ? (this.getSliderJoint(joint) as RealJoint)
      : joint;
    // Always enabled to turn *off*: the same control is how an input is removed,
    // and a joint an edit has since made undrivable is exactly the one a user
    // most needs to be able to un-drive.
    return driven.input || canDrive(driven);
  }

  /**
   * Whether the Weld control may be used on this joint, shared by the Edit
   * panel's toggle and the right-click menu so the two cannot drift.
   *
   * Structural rule only: a weld fuses what meets at a joint, so a joint with
   * fewer than two links — a tracer, a bar's free end — has nothing to fuse and
   * the control is greyed rather than offered-then-refused. A grounded or
   * driven joint keeps the enabled control and gets the model's refusal with
   * its reason (§4.1's explained-refusal rule); an already-welded joint stays
   * enabled because the same control is how it is unwelded.
   */
  canToggleWeld(joint: Joint): boolean {
    if (!(joint instanceof RealJoint)) return false;
    // A cylinder mount cannot weld: welding a mount into a neighbouring
    // compound opened more edge cases than it was worth. Attach by revolute.
    const sealed = this.mechanismSrv.cylinderAt(joint);
    if (
      sealed &&
      (joint.id === sealed.barrelFar.id || joint.id === sealed.rodFar.id) &&
      !joint.isWelded
    ) {
      return false;
    }
    // A weld is the statement that the bodies at this joint do not move
    // relative to each other, and an input is the statement that they do. Both
    // at once is not a state the model can honour, so the control that would
    // create it is greyed -- the same rule from the other side as
    // `describeActuator` refusing to drive a welded joint. Unwelding stays
    // available, since that direction resolves the contradiction.
    if (joint.input && !joint.isWelded) {
      return false;
    }
    return joint.isWelded || joint.links.length >= 2;
  }

  /**
   * Why Weld is greyed on this joint, short and long.
   *
   * The branches of `canToggleWeld`, read back out. The control and its reason
   * come from one place so a menu cannot grey a row it has no explanation for,
   * or explain one it left enabled.
   */
  weldRefusal(joint: Joint): { short: string; long: string } | undefined {
    if (this.canToggleWeld(joint)) return undefined;
    if (!(joint instanceof RealJoint)) {
      return { short: 'not a joint', long: 'Only a joint can be welded.' };
    }
    const sealed = this.mechanismSrv.cylinderAt(joint);
    if (sealed && (joint.id === sealed.barrelFar.id || joint.id === sealed.rodFar.id)) {
      return {
        short: 'part is sealed',
        long: 'A cylinder is one sealed part, so its joints cannot be fused into a neighbouring body. Attach a link here instead.',
      };
    }
    if (joint.input) {
      return {
        short: 'it is driven',
        long: 'A weld says these bodies do not move relative to each other, and an input says they do. Remove the input first.',
      };
    }
    // A loose joint has none at all, and telling it "only one meets here" is
    // a sentence about a link that is not there.
    const meeting = joint.links.length;
    return {
      short: 'needs 2 links',
      long:
        meeting === 0
          ? 'A weld fuses the links that meet at a joint, and this joint is on none.'
          : 'A weld fuses the links that meet at a joint, and only one meets here.',
    };
  }

  /**
   * The joints the current Lock marks hold still. Derived fresh each time —
   * the mechanism is small and the closure is cheap — so every asker (the
   * drag gates, the canvas paint, the panel) reads the same answer with no
   * cache to invalidate.
   */
  frozenJointIds(): Set<string> {
    return frozenJointIds(this.mechanismSrv.joints, this.mechanismSrv.links);
  }

  isJointFrozen(joint: Joint): boolean {
    return this.frozenJointIds().has(joint.id);
  }

  /** The locked objects an Unlock action has to clear for this joint to move. */
  locksHolding(joint: Joint): Lockable[] {
    return locksHolding(joint.id, this.mechanismSrv.joints, this.mechanismSrv.links);
  }

  dragJoint(selectedJoint: RealJoint, trueCoord: Coord) {
    // The last line of defence, not the first: the canvas refuses at the
    // grab and the panel greys its fields, but every route to "move this
    // joint" — distance fields aimed at a neighbour, the linkage table, a
    // caller not yet written — lands here, and a held joint holds whoever
    // asks.
    if (this.frozenJointIds().has(selectedJoint.id)) {
      return selectedJoint;
    }
    // TODO: have the round Number be integrated within function for determining trueCoord

    // A cylinder mount never free-moves, whoever asks — canvas drag, the
    // panel's X/Y fields, the distance-to-joint fields, the linkage table.
    // Every route lands on the same parametric re-pose, so no surface can
    // bend the part (§ cylinder 6).
    // Every cylinder on this joint, not just the first: two rams can share a
    // mount, and each has to be told about the move in its own terms. Left to
    // the normalizer afterwards, the second one holds its mounts and repairs
    // the only thing it can -- its interior -- so it quietly changes size.
    const sealedHere = this.mechanismSrv.cylindersAt(selectedJoint);
    if (sealedHere.length > 0) {
      const mounted = sealedHere.filter(
        (sealed) =>
          selectedJoint.id === sealed.barrelFar.id || selectedJoint.id === sealed.rodFar.id
      );
      // Where the mount can actually go, agreed between every ram on it before
      // any of them moves.
      //
      // Each ram clamps the mount at its own minimum span, along its own axis,
      // so asked one at a time they write different positions to the one joint
      // and the last to run wins -- which makes the result depend on the order
      // the cylinders happen to be in. Taking the most restrictive answer first
      // and then posing all of them to it is order-independent, and it is also
      // the right answer: a mount two rams hold can only go where both allow.
      // Iterated to a fixed point, not decided in one pass. Each ram clamps
      // along its own axis, so the landing that satisfies the most restrictive
      // one may still violate another's minimum -- in two dimensions "furthest
      // from where the cursor asked" is not a proof of feasibility. Re-clamping
      // the agreed point against every ram until it stops moving is, and it
      // terminates because a clamp only ever pushes the point further from the
      // request. The cap is a backstop against a pathological arrangement, not
      // an expected exit.
      let agreed = trueCoord;
      for (let pass = 0; pass < 8; pass++) {
        let moved = false;
        for (const sealed of mounted) {
          const landed = this.cylinderMountLanding(sealed, selectedJoint, agreed);
          if (!landed) continue;
          if (this.getPointDistance(landed.x, landed.y, agreed.x, agreed.y) > 1e-6) {
            agreed = landed;
            moved = true;
          }
        }
        if (!moved) break;
      }
      for (const sealed of mounted) {
        this.dragCylinderMount(sealed, selectedJoint, agreed);
      }
      // An interior joint (pin, buried barrel end) takes no free move at all:
      // nothing selects one, so a call here is a stray path, and moving it
      // would bend the part.
      return selectedJoint;
    }

    let oldX = selectedJoint.x;
    let oldY = selectedJoint.y;

    selectedJoint.x = roundNumber(trueCoord.x, 6);
    selectedJoint.y = roundNumber(trueCoord.y, 6);
    switch (selectedJoint.constructor) {
      case RevJoint:
        selectedJoint.links.forEach((l) => {
          if (l instanceof SliderBlock) {
            //If the joint is a slider, then the joint is the second joint in the link must follow the first joint
            // -1 once the block has been taken apart under an in-flight drag.
            // The gesture is cancelled on delete, but a pointer move can still
            // arrive first, and writing through -1 throws.
            const jointIndex = l.joints.findIndex((jt) => jt.id !== selectedJoint.id);
            if (jointIndex >= 0) {
              l.joints[jointIndex].x = roundNumber(trueCoord.x, 6);
              l.joints[jointIndex].y = roundNumber(trueCoord.y, 6);
            }
          }
          if (!(l instanceof RealLink)) {
            return;
          }
          // TODO: delete this if this is not needed (verify this)
          const jointIndex = l.joints.findIndex((jt) => jt.id === selectedJoint.id);
          l.joints[jointIndex].x = roundNumber(trueCoord.x, 6);
          l.joints[jointIndex].y = roundNumber(trueCoord.y, 6);
          // A dragged joint deforms the link, so an auto centre of mass
          // follows the geometry. A custom one stays where its author put it:
          // there is no rigid motion to carry it, and guessing would move a
          // number somebody chose.
          if (!l.comIsCustom) {
            l.CoM = RealLink.determineCenterOfMass(l.joints);
            l.updateCoMDs();
          }
          l.updateLengthAndAngle();

          if (l.subset.length > 0) {
            l.subset.forEach((slink) => {
              let subLink = slink as RealLink;
              // Same rule as the root: a member's hand-placed centre survives
              // for the unweld that will one day restore it.
              if (!subLink.comIsCustom) {
                subLink.CoM = RealLink.determineCenterOfMass(subLink.joints);
                subLink.updateCoMDs();
              }
              subLink.updateLengthAndAngle();
            });
          }

          // PositionSolver.setUpSolvingForces(GridComponent.selectedLink.forces);
          PositionSolver.setUpInitialJointLocations(l.joints);

          // move forces only if dragged joint is not inside link
          let jointInHull: boolean = false;
          let hull = l.getHullPoints();
          hull.forEach((point) => {
            if (selectedJoint.x == point[0] && selectedJoint.y == point[1]) jointInHull = true;
          });

          // find original joint A and joint B
          let jointA = [l.joints[0].x, l.joints[0].y];
          let jointB = [l.joints[1].x, l.joints[1].y];
          let newJointA = jointA;
          let newJointB = jointB;
          if (selectedJoint.x === jointA[0] && selectedJoint.y === jointA[1]) {
            jointA = [oldX, oldY];
          } else {
            jointB = [oldX, oldY];
          }

          if (l.joints.length == 2) {
            // special binary link case, maintain ratio
            let linkDistance = this.getPointDistance(jointA[0], jointA[1], jointB[0], jointB[1]);

            l.forces.forEach((f) => {
              // calculate ratio to be maintained
              let forceDistance = this.getPointDistance(
                jointA[0],
                jointA[1],
                f.startCoord.x,
                f.startCoord.y
              );
              let ratio = forceDistance / linkDistance;

              // update force start position with ratio
              let newX = newJointA[0] + (newJointB[0] - newJointA[0]) * ratio;
              let newY = newJointA[1] + (newJointB[1] - newJointA[1]) * ratio;

              f.moveForceTo(newX, newY);
            });
          } else if (jointInHull) {
            l.forces.forEach((f) => {
              // drag offset
              let offsetX = selectedJoint.x - oldX;
              let offsetY = selectedJoint.y - oldY;

              // Offset is divided by number of joints to average out change
              let newX = f.startCoord.x + offsetX / f.link.joints.length;
              let newY = f.startCoord.y + offsetY / f.link.joints.length;

              f.moveForceTo(newX, newY);
            });
          }
        });
        break;
    }
    // Before the rebuild, not after. A floating slider is deliberately not a
    // member of its carrier -- that is what makes it a slot rather than a pin --
    // so moving the carrier, or one of the two joints defining the slot, leaves
    // the block behind. Putting it back afterwards fixes only the pose on
    // screen: updateMechanism has already copied the stale position into every
    // solved timestep, so pressing Play snapped the block straight back off its
    // channel.
    this.mechanismSrv.reseatFloatingSliders();
    this.mechanismSrv.updateMechanism(false);
    return selectedJoint;
  }

  /**
   * Translate a whole link, and everything rigidly attached to it, by (dx, dy).
   *
   * A link drag is a rigid translation, which is a stronger statement than "drag
   * each of its joints in turn": the link's own centre of mass and forces move
   * with the body exactly, rather than being re-derived from the new joint
   * positions. Only the *neighbouring* links genuinely change shape, so those
   * are the ones that get recomputed.
   */
  dragLink(selectedLink: Link, dx: number, dy: number) {
    if (dx === 0 && dy === 0) {
      return selectedLink;
    }
    return this.moveLinkRigidly(selectedLink, (x, y) => ({ x: x + dx, y: y + dy }));
  }

  /**
   * Turn a whole link about a point, carrying everything rigidly attached.
   *
   * This is what a link drag becomes when exactly one of the joints it would
   * carry is locked: the body cannot translate without moving the held joint,
   * but it can swing about it — which is also the only motion the real linkage
   * would allow if that pin were bolted down.
   */
  rotateLink(selectedLink: Link, pivot: Coord, theta: number) {
    if (theta === 0) {
      return selectedLink;
    }
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    return this.moveLinkRigidly(selectedLink, (x, y) => ({
      x: pivot.x + (x - pivot.x) * cos - (y - pivot.y) * sin,
      y: pivot.y + (x - pivot.x) * sin + (y - pivot.y) * cos,
    }));
  }

  private moveLinkRigidly(
    selectedLink: Link,
    mapPoint: (x: number, y: number) => { x: number; y: number }
  ) {
    // A neighbour's forces are placed relative to its own two reference joints,
    // so where they end up depends on where those joints were before the move.
    // Captured up front, because the move is about to overwrite them.
    const neighbours = this.mechanismSrv.links
      .filter((link): link is RealLink => link !== selectedLink && link instanceof RealLink)
      .map((link) => ({
        link,
        from: link.joints.slice(0, 2).map((joint) => ({ x: joint.x, y: joint.y })),
      }));

    // Member lengths of every sealed cylinder, captured while the geometry is
    // still straight: a neighbour drag can carry one mount along, and the
    // re-pose below has to rebuild from the rigid lengths, not from the bent
    // intermediate state.
    const carriedCylinders = sealedCylinderStructures(this.mechanismSrv.joints).map((sealed) => ({
      sealed,
      barrelLength: this.getPointDistance(
        sealed.barrelFar.x,
        sealed.barrelFar.y,
        sealed.barrelNear.x,
        sealed.barrelNear.y
      ),
    }));

    const movedJointIDs = new Set<string>();
    const moveJoint = (joint: Joint) => {
      if (movedJointIDs.has(joint.id)) return;
      movedJointIDs.add(joint.id);
      const at = mapPoint(joint.x, joint.y);
      joint.x = roundNumber(at.x, 6);
      joint.y = roundNumber(at.y, 6);
    };

    selectedLink.joints.forEach((joint) => {
      moveJoint(joint);
      if (!(joint instanceof RealJoint)) return;
      // A slider's block joint is coincident with its pin by construction, so it
      // has to travel with it — the same invariant dragJoint maintains.
      joint.links.forEach((link) => {
        if (link instanceof SliderBlock) link.joints.forEach(moveJoint);
      });
    });

    this.transformLinkBody(selectedLink, mapPoint);
    if (selectedLink instanceof RealLink) {
      selectedLink.subset.forEach((sub) => this.transformLinkBody(sub, mapPoint));
    }

    // Any other link holding one of the moved joints has been deformed, not
    // translated, so its shape and centre of mass follow from where its joints
    // now are. Its forces do not: a load is fixed to the body it acts on, and
    // leaving it at its old world position would silently move it to a
    // different point of the link. Carry each one through the same change of
    // reference frame the link's own geometry goes through.
    neighbours.forEach(({ link, from }) => {
      if (!link.joints.some((joint) => movedJointIDs.has(joint.id))) return;
      const [start, end] = link.joints;
      if (from.length === 2 && start && end) {
        link.forces.forEach((force) => {
          const [x, y] = pointThroughFrame(force.startCoord, from[0], from[1], start, end);
          force.moveForceTo(x, y);
        });
      }
      // A custom centre of mass rides the body through the same change of
      // frame the forces just did — it is a point somebody fixed to this link.
      // An auto one is re-derived from the joints like always, and a frame too
      // degenerate to transport through leaves a custom point untouched.
      if (link.comIsCustom) {
        if (from.length === 2 && start && end) {
          const [comX, comY] = pointThroughFrame(link.CoM, from[0], from[1], start, end);
          link.CoM = new Coord(comX, comY);
        }
      } else {
        link.CoM = RealLink.determineCenterOfMass(link.joints);
      }
      link.updateCoMDs();
      link.updateLengthAndAngle();
      link.subset.forEach((sub) => {
        const subLink = sub as RealLink;
        if (subLink.comIsCustom) {
          if (from.length === 2 && start && end) {
            const [subX, subY] = pointThroughFrame(subLink.CoM, from[0], from[1], start, end);
            subLink.CoM = new Coord(subX, subY);
          }
        } else {
          subLink.CoM = RealLink.determineCenterOfMass(subLink.joints);
        }
        subLink.updateCoMDs();
        subLink.updateLengthAndAngle();
      });
      PositionSolver.setUpInitialJointLocations(link.joints);
    });

    // A neighbour drag that carried a cylinder mount along re-poses that
    // cylinder about its other mount, so the part follows its mount instead
    // of bending (§ cylinder 6). A cylinder whose own pin moved was dragged
    // as a body — every member translated together, nothing to repair.
    // Sequentially, and that is safe here in a way it is not for a shared mount:
    // a link drag moves whole bodies, so each ram is re-posed about its own
    // untouched mount and no two of them are writing to the same joint.
    carriedCylinders.forEach(({ sealed, barrelLength }) => {
      if (movedJointIDs.has(sealed.pin.id)) return;
      if (!movedJointIDs.has(sealed.barrelFar.id) && !movedJointIDs.has(sealed.rodFar.id)) return;
      // Both mounts held: they are where the drag put them, and the ram
      // resizes between them if it has to reach. Anchoring on one of them and
      // recomputing the other put a mount somewhere the drag had not asked for.
      const pose = stretchedCylinderPose(
        { x: sealed.barrelFar.x, y: sealed.barrelFar.y },
        { x: sealed.rodFar.x, y: sealed.rodFar.y },
        barrelLength,
        0.15 * SettingsService.objectScale
      );
      if (pose) this.applyCylinderPose(sealed, pose);
    });

    // Before the rebuild, not after. A floating slider is deliberately not a
    // member of its carrier -- that is what makes it a slot rather than a pin --
    // so moving the carrier, or one of the two joints defining the slot, leaves
    // the block behind. Putting it back afterwards fixes only the pose on
    // screen: updateMechanism has already copied the stale position into every
    // solved timestep, so pressing Play snapped the block straight back off its
    // channel.
    this.mechanismSrv.reseatFloatingSliders();
    this.mechanismSrv.updateMechanism(false);
    return selectedLink;
  }

  /**
   * Drag one mount of a sealed cylinder (§ cylinder 6): the assembly re-poses
   * about the OTHER mount — axis through the mounts, barrel rigid to mount A,
   * rod rigid to mount C, pin re-derived on the axis with the stroke clamped
   * to the slot ends. Collinearity holds by construction, so no drag can bend
   * a cylinder.
   */
  /** Where this ram would put the mount, without moving anything. */
  private cylinderMountLanding(
    sealed: Cylinder,
    mount: RealJoint,
    wanted: Coord
  ): Coord | undefined {
    const pose = this.cylinderMountPose(sealed, mount, wanted);
    if (!pose) return undefined;
    const landed = mount.id === sealed.barrelFar.id ? pose.barrelFar : pose.rodFar;
    return new Coord(landed.x, landed.y);
  }

  private cylinderMountPose(
    sealed: Cylinder,
    mount: RealJoint,
    wanted: Coord
  ): CylinderPose | undefined {
    const draggingBarrelMount = mount.id === sealed.barrelFar.id;
    const barrelLength = this.getPointDistance(
      sealed.barrelFar.x,
      sealed.barrelFar.y,
      sealed.barrelNear.x,
      sealed.barrelNear.y
    );
    return layoutCylinder(
      draggingBarrelMount ? wanted : sealed.barrelFar,
      draggingBarrelMount ? sealed.rodFar : wanted,
      barrelLength,
      0.15 * SettingsService.objectScale,
      // The anchor is the mount NOT being dragged: it stays exactly still,
      // and the dragged mount is what the span floor stops.
      draggingBarrelMount ? 'rod' : 'barrel',
      // The axis before this move, so a drag through the anchor clamps at the
      // minimum span instead of flipping the part 180°.
      {
        x: sealed.rodFar.x - sealed.barrelFar.x,
        y: sealed.rodFar.y - sealed.barrelFar.y,
      }
    );
  }

  dragCylinderMount(sealed: Cylinder, mount: RealJoint, wanted: Coord): boolean {
    const pose = this.cylinderMountPose(sealed, mount, wanted);
    if (!pose) return false;
    this.applyCylinderPose(sealed, pose);
    return pose.atMinimum === true;
  }

  /** Drag the body: the whole assembly translates rigidly. */
  dragCylinder(sealed: Cylinder, dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.applyCylinderPose(sealed, {
      barrelFar: { x: sealed.barrelFar.x + dx, y: sealed.barrelFar.y + dy },
      barrelNear: { x: sealed.barrelNear.x + dx, y: sealed.barrelNear.y + dy },
      pin: { x: sealed.pin.x + dx, y: sealed.pin.y + dy },
      rodFar: { x: sealed.rodFar.x + dx, y: sealed.rodFar.y + dy },
    });
  }

  /**
   * Swing the whole assembly about a point — a rotation is rigid, so
   * collinearity survives and the pose lands as-is. This is a body drag with
   * one mount locked: the part cannot translate, but it can turn on the mount.
   */
  rotateCylinder(sealed: Cylinder, pivot: Coord, theta: number): void {
    if (theta === 0) return;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const turn = (point: { x: number; y: number }) => ({
      x: pivot.x + (point.x - pivot.x) * cos - (point.y - pivot.y) * sin,
      y: pivot.y + (point.x - pivot.x) * sin + (point.y - pivot.y) * cos,
    });
    this.applyCylinderPose(sealed, {
      barrelFar: turn(sealed.barrelFar),
      barrelNear: turn(sealed.barrelNear),
      pin: turn(sealed.pin),
      rodFar: turn(sealed.rodFar),
    });
  }

  /**
   * Land a pose on the assembly's five joints (the slider rides the pin),
   * then rebuild what depends on them — member links, genuinely deformed
   * neighbours, and their forces, by the same frame-carrying rule dragLink
   * applies.
   */
  /**
   * Resize a cylinder to a stroke and a position in it, holding its barrel
   * mount and its axis — what the panel's Travel and Starts-at fields write.
   *
   * Deliberately not routed through the mount drag like the other panel edits.
   * A drag says "put this mount here" and the layout answers with a size; this
   * says "be this size" and the mount goes wherever that puts it. Sent through
   * the drag instead, a longer stroke at the same position asks for a span that
   * usually still lies inside the *old* stroke's travel — so the layout would
   * dutifully keep the old size and slide the piston, and a field labelled
   * Travel would change the position and not the travel.
   */
  resizeCylinder(sealed: Cylinder, stroke: number, start: number): void {
    const pose = poseFromStrokeAndStart(
      { x: sealed.barrelFar.x, y: sealed.barrelFar.y },
      Math.atan2(sealed.rodFar.y - sealed.barrelFar.y, sealed.rodFar.x - sealed.barrelFar.x),
      stroke,
      start,
      0.15 * SettingsService.objectScale
    );
    this.applyCylinderPose(sealed, pose);
  }

  /**
   * Land a pose, and carry any ram bolted to what just moved.
   *
   * Two rams can share a mount: the first's rod end is the second's barrel end.
   * Moving the first moves that joint without the second being asked, and the
   * second was then holding a barrel of the wrong length with its head as far
   * outside it as the stretch -- on screen, a part in two pieces with a gap
   * down the middle. It re-lays itself between its own two mounts instead,
   * resizing to reach: both halves together, so both of its ends move, which is
   * what a drag on a ram's own mount has always done past its stops.
   *
   * `dragLink` has always repaired this for a link drag. Every path that poses
   * a cylinder needs it, which is all of them: dragging the body, dragging a
   * mount, and the Travel and Starts-at fields in its panel.
   *
   * One level deep, as `dragLink` is: a third ram bolted to the second follows
   * on the next rebuild rather than in this one.
   */
  private applyCylinderPose(sealed: Cylinder, pose: CylinderPose): void {
    // Every other ram's rigid barrel length, read while its geometry is still
    // straight -- rebuilding from a bent intermediate state is what bakes the
    // split in.
    const others = sealedCylinderStructures(this.mechanismSrv.joints)
      .filter((other) => other.pin.id !== sealed.pin.id)
      .map((other) => ({
        other,
        barrelLength: this.getPointDistance(
          other.barrelFar.x,
          other.barrelFar.y,
          other.barrelNear.x,
          other.barrelNear.y
        ),
      }));

    const movedIds = this.placeCylinder(sealed, pose);

    others.forEach(({ other, barrelLength }) => {
      if (!movedIds.has(other.barrelFar.id) && !movedIds.has(other.rodFar.id)) return;
      const carried = stretchedCylinderPose(
        { x: other.barrelFar.x, y: other.barrelFar.y },
        { x: other.rodFar.x, y: other.rodFar.y },
        barrelLength,
        0.15 * SettingsService.objectScale
      );
      if (carried) this.placeCylinder(other, carried);
    });

    this.mechanismSrv.reseatFloatingSliders();
    this.mechanismSrv.updateMechanism(false);
  }

  /** One assembly's five joints, and everything derived from them. */
  private placeCylinder(sealed: Cylinder, pose: CylinderPose): Set<string> {
    const placements: [Joint, { x: number; y: number }][] = [
      [sealed.barrelFar, pose.barrelFar],
      [sealed.barrelNear, pose.barrelNear],
      [sealed.pin, pose.pin],
      [sealed.slider, pose.pin],
      [sealed.rodFar, pose.rodFar],
    ];
    const movedIds = new Set(placements.map(([joint]) => joint.id));
    // Captured before the move: forces are placed relative to their link's
    // own two reference joints, wherever those were.
    const affected = this.mechanismSrv.links
      .filter(
        (link): link is RealLink =>
          link instanceof RealLink && link.joints.some((joint) => movedIds.has(joint.id))
      )
      .map((link) => ({
        link,
        from: link.joints.slice(0, 2).map((joint) => ({ x: joint.x, y: joint.y })),
      }));

    placements.forEach(([joint, at]) => {
      joint.x = roundNumber(at.x, 6);
      joint.y = roundNumber(at.y, 6);
    });

    affected.forEach(({ link, from }) => {
      const [start, end] = link.joints;
      if (from.length === 2 && start && end) {
        link.forces.forEach((force) => {
          const [x, y] = pointThroughFrame(force.startCoord, from[0], from[1], start, end);
          force.moveForceTo(x, y);
        });
      }
      // A custom centre of mass rides the body through the same change of
      // frame the forces just did — it is a point somebody fixed to this link.
      // An auto one is re-derived from the joints like always, and a frame too
      // degenerate to transport through leaves a custom point untouched.
      if (link.comIsCustom) {
        if (from.length === 2 && start && end) {
          const [comX, comY] = pointThroughFrame(link.CoM, from[0], from[1], start, end);
          link.CoM = new Coord(comX, comY);
        }
      } else {
        link.CoM = RealLink.determineCenterOfMass(link.joints);
      }
      link.updateCoMDs();
      link.updateLengthAndAngle();
      link.subset.forEach((sub) => {
        const subLink = sub as RealLink;
        if (subLink.comIsCustom) {
          if (from.length === 2 && start && end) {
            const [subX, subY] = pointThroughFrame(subLink.CoM, from[0], from[1], start, end);
            subLink.CoM = new Coord(subX, subY);
          }
        } else {
          subLink.CoM = RealLink.determineCenterOfMass(subLink.joints);
        }
        subLink.updateCoMDs();
        subLink.updateLengthAndAngle();
      });
      PositionSolver.setUpInitialJointLocations(link.joints);
    });

    return movedIds;
  }

  private transformLinkBody(
    link: Link,
    mapPoint: (x: number, y: number) => { x: number; y: number }
  ) {
    // Both endpoints through the map, not just the anchor: a load is fixed to
    // the body it acts on, so a body that turns takes the arrow's direction
    // round with it — under a pure translation this collapses to the old move.
    link.forces.forEach((force) => {
      const start = mapPoint(force.startCoord.x, force.startCoord.y);
      const end = mapPoint(force.endCoord.x, force.endCoord.y);
      force.moveAnchor(new Coord(start.x, start.y));
      force.moveDirectionHandle(new Coord(end.x, end.y));
    });
    if (!(link instanceof RealLink)) return;
    const centre = mapPoint(link.CoM.x, link.CoM.y);
    link.CoM = new Coord(centre.x, centre.y);
    link.updateCoMDs();
    link.updateLengthAndAngle();
    PositionSolver.setUpInitialJointLocations(link.joints);
  }

  findJointIDIndex(id: string, joints: Joint[]) {
    return joints.findIndex((j) => j.id === id);
  }

  /**
   * Where a force's anchor may sit on its link, given where the pointer is.
   *
   * Two joints are two different answers. A pin shared by more than one link is
   * refused outright: a force applied *there* does not say which of the bodies
   * meeting there it acts on, and every answer the force solver could pick is a
   * guess the user never made — the same rule a driven joint follows. A joint on
   * exactly one link has no such ambiguity, so the anchor snaps onto it, which
   * is how a load is put on a tracer point at the end of a boom.
   *
   * `undefined` means the anchor may not go there at all. The caller keeps its
   * own "inside the bar" test, because that one needs the drawn path.
   */
  forceAnchorAt(
    link: RealLink,
    point: Coord,
    objectScale: number
  ): { at: Coord; snappedTo?: RealJoint } | undefined {
    // Generous enough to catch by hand: a joint is 0.15 object scales across.
    const snapRadius = 0.3 * objectScale;
    let nearest: RealJoint | undefined;
    let nearestGap = Infinity;
    for (const joint of link.joints) {
      if (!(joint instanceof RealJoint)) continue;
      const gap = Math.hypot(joint.x - point.x, joint.y - point.y);
      if (gap < nearestGap) {
        nearest = joint;
        nearestGap = gap;
      }
    }
    if (nearest && nearestGap <= snapRadius) {
      if (nearest.links.length > 1) return undefined;
      return { at: new Coord(nearest.x, nearest.y), snappedTo: nearest };
    }
    return { at: point };
  }

  /**
   * Move a force under a drag.
   *
   * `how` says which of the three things the gesture is: the tail alone (the
   * point the load acts at), the whole arrow, or the head (its direction).
   */
  /**
   * Move a force under a drag.
   *
   * `how` names which of the three things the gesture is: the tail alone (the
   * point the load acts at, leaving the arrow pointing where it did *from* the
   * new point), the whole arrow, or the head (its direction).
   */
  dragForce(selectedForce: Force, trueCoord: Coord, how: 'anchor' | 'whole' | 'direction') {
    if (how === 'direction') {
      selectedForce.moveDirectionHandle(trueCoord);
      return selectedForce;
    }
    // On a plain two-joint bar the anchor is held to the line between them, so
    // a load cannot end up floating beside the link it is applied to.
    let at = trueCoord;
    if (selectedForce.link.joints.length === 2) {
      const [first, second] = selectedForce.link.joints;
      const [x, y] = point_on_line_segment_closest_to_point(
        trueCoord.x,
        trueCoord.y,
        first.x,
        first.y,
        second.x,
        second.y
      );
      at = new Coord(x, y);
    }
    if (how === 'whole') selectedForce.moveAnchor(at);
    else selectedForce.moveApplicationPoint(at);
    return selectedForce;
  }

  isAttachedToSlider(lastRightClick: Joint | Link | Force | String) {
    if (lastRightClick instanceof Joint && lastRightClick instanceof RevJoint) {
      return lastRightClick.connectedJoints.some((j) => j instanceof PrisJoint);
    }
    return false;
  }

  connectedToPrisJoint(joints: Joint[]) {
    let connectedToPrisJoint = false;
    joints.forEach((j) => {
      if (j instanceof PrisJoint) {
        connectedToPrisJoint = true;
      }
    });
    return connectedToPrisJoint;
  }

  getSliderJoint(joint: Joint): Joint {
    if (!(joint instanceof RevJoint)) {
      return joint;
    }
    return <Joint>joint.connectedJoints.find((j) => j instanceof PrisJoint);
  }

  /**
   * Turn a joint's traced path on, or off.
   *
   * A prismatic joint answers for itself. It used to fall through both arms of
   * this and change nothing at all -- `containsSlider` is false of a prismatic
   * joint, and it is not a RevJoint -- which mattered the moment the menu
   * started offering a Trace Path row on one: a switch that flips nothing.
   */
  toggleCurve(lastRightClick: Joint | Link | Force | String) {
    if (lastRightClick instanceof PrisJoint) {
      lastRightClick.showCurve = !lastRightClick.showCurve;
      return;
    }
    // A pin that rides a block draws its path through the block's prismatic
    // half, so that is the flag the drawing reads.
    if (this.containsSlider(lastRightClick as RealJoint)) {
      (this.getSliderJoint(lastRightClick as RealJoint)! as PrisJoint).showCurve = !(
        lastRightClick as RealJoint
      ).showCurve;
    }
    if (lastRightClick instanceof RevJoint) {
      lastRightClick.showCurve = !lastRightClick.showCurve;
    }
  }

  getLinkSubset(link: Link): Link[] {
    if (!(link instanceof RealLink)) {
      return [];
    }
    return link.subset;
  }

  getCenter(line: Line) {
    return (line as Arc).center;
  }

  getWelded(joint: Joint) {
    return (joint as RealJoint).isWelded;
  }

  updateLastSelectedSublink(mouseEvent: MouseEvent, clickedObj: RealLink) {
    //Seach each link in the subset to see if the mouse is over it
    // use isPointInsideLink()
    //First convert the screen coordinates to true coordinates
    let trueCoords = this.svgGrid.screenToSVG(new Coord(mouseEvent.offsetX, mouseEvent.offsetY));

    clickedObj.lastSelectedSublink = null;

    clickedObj.subset.forEach((link) => {
      if (this.isPointInsideLink(trueCoords, link as RealLink)) {
        clickedObj.lastSelectedSublink = link;
      }
    });
  }

  isPointInsideLink(startPosition: Coord, link: RealLink) {
    //Check if the point is inside of the shape created by the lines
    //First, draw a line that is infinitely long and check if it intersects with the shape an odd number of times
    const infiniteLine = new Line(startPosition, new Coord(10000, startPosition.y));

    let intersections = 0;
    link.initialExternalLines.forEach((line) => {
      const intersectionPoint = infiniteLine.intersectsWith(line);
      const otherIntersectionPoint = infiniteLine.clone().reverse().intersectsWith(line);

      //Add two to the intersection count if intersectionPoint and otherIntersectionPoint are not equal
      if (intersectionPoint && otherIntersectionPoint) {
        if (!intersectionPoint.equals(otherIntersectionPoint)) {
          intersections += 2;
        } else {
          intersections += 1;
        }
      } else if (intersectionPoint || otherIntersectionPoint) {
        intersections += 1;
      }
    });

    //If the number of intersections is odd, then the point is inside the shape
    return intersections % 2 === 1;
  }

  getPointDistance(x1: number, y1: number, x2: number, y2: number): number {
    let x = x2 - x1;
    let y = y2 - y1;
    return Math.sqrt(x * x + y * y);
  }

  isVisuallyInput(selectedJoint: RealJoint) {
    //This is used to update the edit and context menu since the selectable prismatic joints are technically not grounded
    //If it's a slider return the ground of the prismatic joint
    if (this.isAttachedToSlider(selectedJoint)) {
      return (this.getSliderJoint(selectedJoint) as RealJoint).input;
    } else {
      return selectedJoint.input;
    }
  }
}
