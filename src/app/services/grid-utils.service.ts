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
          l.forces.forEach((f) => {
            // TODO: adjust the location of force endpoints and update the line and arrow
            //PositionSolver.determineTracerForce(f.link.joints[0], f.link.joints[1], f, 'start');
            //PositionSolver.determineTracerForce(f.link.joints[0], f.link.joints[1], f, 'end');
            
            // Calculate force vectors relative to start position, as the vector will be shifted but not scaled or rotated
            let fdx = f.endCoord.x - f.startCoord.x;
            let fdy = f.endCoord.y - f.startCoord.y;

            // drag offset
            let offsetX = selectedJoint.x - oldX;
            let offsetY = selectedJoint.y - oldY;

            // Offset is divided by number of joints to average out change
            f.startCoord.x += offsetX / f.link.joints.length;
            f.startCoord.y += offsetY / f.link.joints.length;

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
      if (selectedForce.link.joints.length !== 2) {
        selectedForce.startCoord.x = trueCoord.x;
        selectedForce.startCoord.y = trueCoord.y;
      } else {
        const joint1 = selectedForce.link.joints[0];
        const joint2 = selectedForce.link.joints[1];
        const leftMostX = selectedForce.link.joints[0].x < selectedForce.link.joints[1].x ? selectedForce.link.joints[0].x : selectedForce.link.joints[1].x
        const rightMostX = selectedForce.link.joints[0].x > selectedForce.link.joints[1].x ? selectedForce.link.joints[0].x : selectedForce.link.joints[1].x
        const m = (joint1.y - joint2.y) / (joint1.x - joint2.x);
        const b = joint1.y - (m * joint1.x);
        if (trueCoord.x < leftMostX) {
          selectedForce.startCoord.x = leftMostX;
        } else if (trueCoord.x > rightMostX) {
          selectedForce.startCoord.x = rightMostX;
        } else {
          selectedForce.startCoord.x = trueCoord.x;
        }
        selectedForce.startCoord.y = (m * selectedForce.startCoord.x) + b;
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