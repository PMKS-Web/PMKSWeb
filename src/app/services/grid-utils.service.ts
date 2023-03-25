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
    // TODO: have the round Number be integrated within function for determining trueCoord
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
          l.d = RealLink.getD(l.joints);
          l.CoM = RealLink.determineCenterOfMass(l.joints);
          l.updateCoMDs();
          l.updateLengthAndAngle();
          // PositionSolver.setUpSolvingForces(GridComponent.selectedLink.forces);
          PositionSolver.setUpInitialJointLocations(l.joints);
          l.forces.forEach((f) => {
            // TODO: adjust the location of force endpoints and update the line and arrow
            PositionSolver.determineTracerForce(f.link.joints[0], f.link.joints[1], f, 'start');
            PositionSolver.determineTracerForce(f.link.joints[0], f.link.joints[1], f, 'end');
            f.endCoord.x = PositionSolver.forcePositionMap.get(f.id + 'end')!.x;
            f.endCoord.y = PositionSolver.forcePositionMap.get(f.id + 'end')!.y;
            f.startCoord.x = PositionSolver.forcePositionMap.get(f.id + 'start')!.x;
            f.startCoord.y = PositionSolver.forcePositionMap.get(f.id + 'start')!.y;
            f.forceLine = Force.createForceLine(f.startCoord, f.endCoord);
            f.forceArrow = Force.createForceArrow(f.startCoord, f.endCoord);
          });
        });
        break;
    }
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
    selectedForce.forceLine = Force.createForceLine(
      selectedForce.startCoord,
      selectedForce.endCoord
    );
    if (selectedForce.arrowOutward) {
      selectedForce.forceArrow = Force.createForceArrow(
        selectedForce.startCoord,
        selectedForce.endCoord
      );
    } else {
      selectedForce.forceArrow = Force.createForceArrow(
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
}
