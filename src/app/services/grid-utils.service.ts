import { Injectable } from '@angular/core';
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
} from '../model/utils';
import { Link, Piston, RealLink } from '../model/link';
import { MechanismService } from './mechanism.service';
import { ToolbarComponent } from '../component/toolbar/toolbar.component';
import { Mechanism } from '../model/mechanism/mechanism';
import { Coord } from '../model/coord';
import { PositionSolver } from '../model/mechanism/position-solver';
import { Force } from '../model/force';
import { Arc, Line } from '../model/line';
import { NewGridComponent } from '../component/new-grid/new-grid.component';
import { SvgGridService } from './svg-grid.service';
import { link } from 'fs';

@Injectable({
  providedIn: 'root',
})
export class GridUtilsService {
  constructor(public svgGrid: SvgGridService) {}

  //Return a boolean, is this link a ground link?
  getGround(joint: Joint) {
    if (!(joint instanceof PrisJoint || joint instanceof RevJoint)) {
      return;
    }
    return joint.ground;
  }

  createRealLink(id: string, joints: Joint[]) {
    return new RealLink(id, joints);
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
      case Piston:
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
          if (l instanceof Piston) {
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
    NewGridComponent.instance.mechanismSrv.updateMechanism();
    return selectedJoint;
  }

  findJointIDIndex(id: string, joints: Joint[]) {
    return joints.findIndex((j) => j.id === id);
  }

  dragForce(selectedForce: Force, trueCoord: Coord, isStartSelected: boolean) {
    // TODO: Determine how to optimize this so screen is more fluid
    if (isStartSelected) {
      if (selectedForce.link.joints.length !== 2) {
        selectedForce.startCoord.x = trueCoord.x;
        selectedForce.startCoord.y = trueCoord.y;
      } else {
        const joint1 = selectedForce.link.joints[0];
        const joint2 = selectedForce.link.joints[1];
        const leftMostX =
          selectedForce.link.joints[0].x < selectedForce.link.joints[1].x
            ? selectedForce.link.joints[0].x
            : selectedForce.link.joints[1].x;
        const rightMostX =
          selectedForce.link.joints[0].x > selectedForce.link.joints[1].x
            ? selectedForce.link.joints[0].x
            : selectedForce.link.joints[1].x;
        const m = (joint1.y - joint2.y) / (joint1.x - joint2.x);
        const b = joint1.y - m * joint1.x;
        if (trueCoord.x < leftMostX) {
          selectedForce.startCoord.x = leftMostX;
        } else if (trueCoord.x > rightMostX) {
          selectedForce.startCoord.x = rightMostX;
        } else {
          selectedForce.startCoord.x = trueCoord.x;
        }
        selectedForce.startCoord.y = m * selectedForce.startCoord.x + b;
      }
    } else {
      selectedForce.endCoord.x = trueCoord.x;
      selectedForce.endCoord.y = trueCoord.y;
    }
    selectedForce.forceLine = selectedForce.createForceLine(
      selectedForce.startCoord,
      selectedForce.endCoord
    );
    if (selectedForce.arrowOutward) {
      selectedForce.forceArrow = selectedForce.createForceArrow(
        selectedForce.startCoord,
        selectedForce.endCoord
      );
    } else {
      selectedForce.forceArrow = selectedForce.createForceArrow(
        selectedForce.endCoord,
        selectedForce.startCoord
      );
    }
    selectedForce.updateInternalValues();
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

  getLinkSubset(link: Link) {
    if (!(link instanceof RealLink)) {
      return;
    }
    return link.subset;
  }

  getCenter(line: Line) {
    return (line as Arc).center;
  }

  getWelded(joint: Joint) {
    return (joint as RealJoint).isWelded;
  }

  getAngleFromJoint(joint: Joint) {
    //This joint must be a welded joint, get the angle of one of the sublinks
    //console.log("gaf1", (joint as RealJoint));
    //console.log("gaf2", (joint as RealJoint).links);
    //console.log("gaf3", (joint as RealJoint).links[0] as RealLink);
    return ((joint as RealJoint).links[0] as RealLink).angleRad;
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
