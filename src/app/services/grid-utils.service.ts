import { Injectable, Injector } from '@angular/core';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../model/joint';
import {
  gridStates,
  jointStates,
  linkStates,
  forceStates,
  shapeEditModes,
  createModes,
  moveModes,
  roundNumber,
  getDistance,
  point_on_line_segment_closest_to_point,
} from '../model/utils';
import { Link, SliderBlock, RealLink } from '../model/link';
import { MechanismService } from './mechanism.service';
import { ToolbarComponent } from '../component/toolbar/toolbar.component';
import { Mechanism } from '../model/mechanism/mechanism';
import { Coord } from '../model/coord';
import { PositionSolver } from '../model/mechanism/position-solver';
import { Force } from '../model/force';
import { Arc, Line } from '../model/line';
import { SynthesisPose } from './synthesis/synthesis-util';
import { SynthesisBuilderService } from './synthesis/synthesis-builder.service';
import { SynthesisClickMode } from './synthesis/synthesis-constants';
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
  constructor(
    private synthesisBuilder: SynthesisBuilderService,
    public svgGrid: SvgGridService,
    private injector: Injector
  ) {}

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

  dragJoint(selectedJoint: RealJoint, trueCoord: Coord) {
    // console.error('new drag Joint cycle');
    // TODO: have the round Number be integrated within function for determining trueCoord

    let oldX = selectedJoint.x;
    let oldY = selectedJoint.y;

    selectedJoint.x = roundNumber(trueCoord.x, 6);
    selectedJoint.y = roundNumber(trueCoord.y, 6);
    switch (selectedJoint.constructor) {
      case RevJoint:
        selectedJoint.links.forEach((l) => {
          if (l instanceof SliderBlock) {
            //If the joint is a slider, then the joint is the second joint in the link must follow the first joint
            const jointIndex = l.joints.findIndex((jt) => jt.id !== selectedJoint.id);
            l.joints[jointIndex].x = roundNumber(trueCoord.x, 6);
            l.joints[jointIndex].y = roundNumber(trueCoord.y, 6);
          }
          if (!(l instanceof RealLink)) {
            return;
          }
          // TODO: delete this if this is not needed (verify this)
          const jointIndex = l.joints.findIndex((jt) => jt.id === selectedJoint.id);
          l.joints[jointIndex].x = roundNumber(trueCoord.x, 6);
          l.joints[jointIndex].y = roundNumber(trueCoord.y, 6);
          // l.reComputeDPath();
          l.CoM = RealLink.determineCenterOfMass(l.joints);
          l.updateCoMDs();
          l.updateLengthAndAngle();

          if (l.subset.length > 0) {
            l.subset.forEach((slink) => {
              let subLink = slink as RealLink;
              subLink.CoM = RealLink.determineCenterOfMass(subLink.joints);
              subLink.updateCoMDs();
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

    // A neighbour's forces are placed relative to its own two reference joints,
    // so where they end up depends on where those joints were before the move.
    // Captured up front, because the move is about to overwrite them.
    const neighbours = this.mechanismSrv.links
      .filter((link): link is RealLink => link !== selectedLink && link instanceof RealLink)
      .map((link) => ({
        link,
        from: link.joints.slice(0, 2).map((joint) => ({ x: joint.x, y: joint.y })),
      }));

    const movedJointIDs = new Set<string>();
    const moveJoint = (joint: Joint) => {
      if (movedJointIDs.has(joint.id)) return;
      movedJointIDs.add(joint.id);
      joint.x = roundNumber(joint.x + dx, 6);
      joint.y = roundNumber(joint.y + dy, 6);
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

    this.translateLinkBody(selectedLink, dx, dy);
    if (selectedLink instanceof RealLink) {
      selectedLink.subset.forEach((sub) => this.translateLinkBody(sub, dx, dy));
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
      link.CoM = RealLink.determineCenterOfMass(link.joints);
      link.updateCoMDs();
      link.updateLengthAndAngle();
      link.subset.forEach((sub) => {
        const subLink = sub as RealLink;
        subLink.CoM = RealLink.determineCenterOfMass(subLink.joints);
        subLink.updateCoMDs();
        subLink.updateLengthAndAngle();
      });
      PositionSolver.setUpInitialJointLocations(link.joints);
    });

    this.mechanismSrv.updateMechanism(false);
    return selectedLink;
  }

  private translateLinkBody(link: Link, dx: number, dy: number) {
    link.forces.forEach((force) =>
      force.moveForceTo(force.startCoord.x + dx, force.startCoord.y + dy)
    );
    if (!(link instanceof RealLink)) return;
    link.CoM = new Coord(link.CoM.x + dx, link.CoM.y + dy);
    link.updateCoMDs();
    link.updateLengthAndAngle();
    PositionSolver.setUpInitialJointLocations(link.joints);
  }

  findJointIDIndex(id: string, joints: Joint[]) {
    return joints.findIndex((j) => j.id === id);
  }

  dragForce(selectedForce: Force, trueCoord: Coord, isStartSelected: boolean) {
    if (isStartSelected) {
      if (selectedForce.link.joints.length !== 2) {
        selectedForce.moveAnchor(trueCoord);
      } else {
        const joint1 = selectedForce.link.joints[0];
        const joint2 = selectedForce.link.joints[1];
        const [x, y] = point_on_line_segment_closest_to_point(
          trueCoord.x,
          trueCoord.y,
          joint1.x,
          joint1.y,
          joint2.x,
          joint2.y
        );
        selectedForce.moveAnchor(new Coord(x, y));
      }
    } else {
      selectedForce.moveDirectionHandle(trueCoord);
    }
    return selectedForce;
  }

  setPoseTheta(pose: SynthesisPose, thetaRadians: number) {
    this.synthesisBuilder.setPoseTheta(pose, thetaRadians);
  }

  dragPose(pose: SynthesisPose, dx: number, dy: number, mode: SynthesisClickMode) {
    this.synthesisBuilder.movePoseByOffset(pose, mode, dx, dy);
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

  toggleCurve(lastRightClick: Joint | Link | Force | String) {
    console.log(this.getSliderJoint(lastRightClick as RealJoint)! as PrisJoint);
    if (this.containsSlider(lastRightClick as RealJoint)) {
      (this.getSliderJoint(lastRightClick as RealJoint)! as PrisJoint).showCurve = !(
        lastRightClick as RealJoint
      ).showCurve;
    }
    if (lastRightClick instanceof RevJoint) {
      lastRightClick.showCurve = !lastRightClick.showCurve;
    }
    console.log(this.getSliderJoint(lastRightClick as RealJoint)! as PrisJoint);
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

    // console.log(trueCoords.x, trueCoords.y);

    clickedObj.lastSelectedSublink = null;

    clickedObj.subset.forEach((link) => {
      if (this.isPointInsideLink(trueCoords, link as RealLink)) {
        clickedObj.lastSelectedSublink = link;
        // console.log('Found a link');
        // console.log(link);
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
