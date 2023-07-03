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

@Injectable({
  providedIn: 'root',
})
export class GridUtilsService {
  constructor() {}

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
    
    // cache old joint location
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

          let hullLines: Line[] = l.getHullLines()

          // PositionSolver.setUpSolvingForces(GridComponent.selectedLink.forces);
          PositionSolver.setUpInitialJointLocations(l.joints);
          l.forces.forEach((f) => {
            // TODO: adjust the location of force endpoints and update the line and arrow
            //PositionSolver.determineTracerForce(f.link.joints[0], f.link.joints[1], f, 'start');
            //PositionSolver.determineTracerForce(f.link.joints[0], f.link.joints[1], f, 'end');
            
            // Calculate force vectors relative to start position, as the vector will be shifted but not scaled or rotated
            let fdx = f.endCoord.x - f.startCoord.x;
            let fdy = f.endCoord.y - f.startCoord.y;

            // for binary link, set intersection as other joint.
            // Even for non-binary link, we compute this anyways as backup
            let intersection: [number, number];
            console.log(hullLines.length)
            if (f.link.joints[0] === selectedJoint) {
              intersection = [f.link.joints[1].x, f.link.joints[1].y]
            } else {
              intersection = [f.link.joints[0].x, f.link.joints[0].y]
            }
            if (hullLines.length > 2) {
                // Find the intersection between [line from dragged joint to force] to [one of the external lines]
              let forceToJoint = new Line(new Coord(oldX, oldY), new Coord(f.startCoord.x, f.startCoord.y));
              for (let i=0; i < hullLines.length; i++) {
                intersection = getIntersection(hullLines[i], forceToJoint)!;

                let hx1 = hullLines[i].startPosition.x;
                let hx2 = hullLines[i].endPosition.x;
                let hy1 = hullLines[i].startPosition.y;
                let hy2 = hullLines[i].endPosition.y;
                if (isPointInsideSegment(intersection[0], intersection[1], hx1, hx2, hy1, hy2)) {
                  break;
                }
              }
            }
            
            // Given a line between [oldX, oldY] and [avgX, avgY], find the point on the line closest to [f.startCoord.x, f.startCoord.y]
            let [projForceX, projForceY] = closestPointOnLine(f.startCoord.x, f.startCoord.y, oldX, oldY, intersection[0], intersection[1]);
            let medialDistance = distanceTwoPoints(intersection[0], intersection[1], projForceX, projForceY);
            let lateralDistance = distanceTwoPoints(f.startCoord.x, f.startCoord.y, projForceX, projForceY);

            // Calculate current ratio
            let fullDistance = distanceTwoPoints(oldX, oldY, intersection[0], intersection[1]);
            let ratio = medialDistance / fullDistance;

            // Calculate new distance from old ratio
            let newMedialDistance = distanceTwoPoints(selectedJoint.x, selectedJoint.y, intersection[0], intersection[1]) * ratio;


            // Calculate new force location based on new distance and same angle
            let newTheta = thetaTwoPoints(intersection[0], intersection[1], selectedJoint.x, selectedJoint.y);

            let [newForceX, newForceY] = addVectorToPoint(intersection[0], intersection[1], newTheta, newMedialDistance);

            // Adjust for lateral offset
            [newForceX, newForceY] = addVectorToPoint(newForceX, newForceY, newTheta + Math.PI / 2, lateralDistance);

            // Update force start position
            f.startCoord.x = newForceX;
            f.startCoord.y = newForceY;

            // Now that new start position is computed, maintain vector for end position
            f.endCoord.x = f.startCoord.x + fdx
            f.endCoord.y = f.startCoord.y + fdy
            
            // Update force line and arrow
            f.forceLine = f.createForceLine(f.startCoord, f.endCoord);
            f.forceArrow = f.createForceArrow(f.startCoord, f.endCoord);
          });
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
      selectedForce.startCoord.x = trueCoord.x;
      selectedForce.startCoord.y = trueCoord.y;
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

  getSliderJoint(joint: Joint) {
    if (!(joint instanceof RevJoint)) {
      return;
    }
    return joint.connectedJoints.find((j) => j instanceof PrisJoint);
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
}
function closestPointOnLine(pointX: number, pointY: number, firstX: number, firstY: number, secondX: number, secondY: number): [number, number] {
  let ax = pointX - firstX
  let ay = pointY - firstY
  let bx = secondX - firstX
  let by = secondY - firstY

  let scalar = (ax * bx + ay * by) / (bx * bx + by * by)
  return [firstX + scalar * bx, firstY + scalar * by]
}

function thetaTwoPoints(x1: number, y1: number, x2: number, y2: number) {
  return Math.atan2(y2 - y1, x2 - x1)
}

function distanceTwoPoints(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2))
}

function addVectorToPoint(x: number, y: number, theta: number, distance: number) {
  return [x + distance * Math.cos(theta), y + distance * Math.sin(theta)]
}

// Find the intersection of two lines, not line segments
function getIntersection(a: Line, b: Line): [number, number] | null {
  let ax1 = a.startPosition.x
  let ay1 = a.startPosition.y
  let ax2 = a.endPosition.x
  let ay2 = a.endPosition.y

  let bx1 = b.startPosition.x
  let by1 = b.startPosition.y
  let bx2 = b.endPosition.x
  let by2 = b.endPosition.y

  const a1 = ay2 - ay1;
  const b1 = ax1 - ax2;
  const a2 = by2 - by1;
  const b2 = bx1 - bx2;

  const denom = a1 * b2 - a2 * b1;
  if (denom == 0) {
    return null; // lines are parallel
  }

  const c1 = a1 * ax1 + b1 * ay1;
  const c2 = a2 * bx1 + b2 * by1;

  const x = (b1 * c2 - b2 * c1) / denom;
  const y = (a1 * c2 - a2 * c1) / denom;

  return [x,y];

}

function isPointInsideSegment(pointX: number, pointY: number, firstX: number, firstY: number, secondX: number, secondY: number): boolean {
  let segmentDistance = distanceTwoPoints(firstX, firstY, secondX, secondY)
  let firstDistance = distanceTwoPoints(firstX, firstY, pointX, pointY)
  let secondDistance = distanceTwoPoints(secondX, secondY, pointX, pointY)
  return firstDistance < segmentDistance && secondDistance < segmentDistance
}