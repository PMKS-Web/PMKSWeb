import { Injectable } from '@angular/core';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { Link, Piston, RealLink } from '../model/link';
import { Force } from '../model/force';
import { Mechanism } from '../model/mechanism/mechanism';
import { ToolbarComponent } from '../component/toolbar/toolbar.component';
import { InstantCenter } from '../model/instant-center';
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
import { BehaviorSubject, Subject } from 'rxjs';
import { GridUtilsService } from './grid-utils.service';
import { ActiveObjService } from './active-obj.service';
import { AnimationBarComponent } from '../component/animation-bar/animation-bar.component';
import { NewGridComponent } from '../component/new-grid/new-grid.component';

@Injectable({
  providedIn: 'root',
})
export class MechanismService {
  public mechanismTimeStep: number = 0;
  public mechanismAnimationIncrement: number = 2;
  public joints: Joint[] = [];
  public links: Link[] = [];
  public forces: Force[] = [];
  public ics: InstantCenter[] = [];
  public mechanisms: Mechanism[] = [];
  public showPathHolder: boolean = true;

  // private moveModes: moveModes = moveModes;
  // private selectedJoint!: RealJoint;

  // This is the state of the mechanism
  // 0 is normal, no changes, no pending analysis
  // 1 is actively being dragged, no pending analysis, disable graphs
  // 2 is pending graph draws
  // 3 is pending analysis due to add or remove
  onMechUpdateState = new BehaviorSubject<number>(3);

  //The which timestep the mechanims is in
  onMechPositionChange = new Subject<number>();

  constructor(public gridUtils: GridUtilsService, public activeObjService: ActiveObjService) {}

  getJoints() {
    return this.joints;
  }

  getLinks() {
    return this.links;
  }

  getForces() {
    return this.forces;
  }

  updateMechanism() {
    this.mechanisms = [];
    // TODO: Determine logic later once everything else is determined
    let inputAngularVelocity = ToolbarComponent.inputAngularVelocity;
    if (ToolbarComponent.clockwise) {
      inputAngularVelocity = ToolbarComponent.inputAngularVelocity * -1;
    }
    this.mechanisms.push(
      new Mechanism(
        this.joints,
        this.links,
        this.forces,
        this.ics,
        ToolbarComponent.gravity,
        ToolbarComponent.unit,
        inputAngularVelocity
      )
    );
  }

  getLinkProp(l: Link, propType: string) {
    if (l instanceof Piston) {
      return;
    }
    const link = l as RealLink;
    switch (propType) {
      case 'mass':
        return link.mass;
      case 'massMoI':
        return link.massMoI;
      case 'CoMX':
        return link.CoM.x;
      case 'CoMY':
        // TODO: Implement logic to not have -1?
        return link.CoM.y * -1;
      case 'd':
        return link.d;
      case 'fill':
        return link.fill;
      case 'CoM_d1':
        return link.CoM_d1;
      case 'CoM_d2':
        return link.CoM_d2;
      case 'CoM_d3':
        return link.CoM_d3;
      case 'CoM_d4':
        return link.CoM_d4;
      default:
        return '?';
    }
  }

  getJointColor(joint: Joint) {
    if (NewGridComponent.debugGetJointState() !== jointStates.dragging) {
      return joint.showHighlight ? 'yellow' : 'transparent';
    } else {
      return joint.id === this.activeObjService.selectedJoint.id ? 'red' : 'transparent';
    }
  }

  getJointPath(joint: Joint) {
    if (this.mechanisms[0].joints[0].length === 0) {
      return '';
    }
    let string = 'M';
    const jointIndex = this.joints.findIndex((j) => j.id === joint.id);
    string +=
      this.mechanisms[0].joints[0][jointIndex].x.toString() +
      ' , ' +
      this.mechanisms[0].joints[0][jointIndex].y.toString();
    for (let j_index = 1; j_index < this.mechanisms[0].joints.length; j_index++) {
      string +=
        'L' +
        this.mechanisms[0].joints[j_index][jointIndex].x.toString() +
        ' , ' +
        this.mechanisms[0].joints[j_index][jointIndex].y.toString();
    }
    return string;
  }

  oneValidMechanismExists() {
    if (this.mechanisms.length == 0 || this.mechanisms[0] === undefined) {
      return false;
    }
    return this.mechanisms[0].isMechanismValid();
  }

  mergeToJoints(joints: Joint[]) {
    joints.forEach((j) => {
      this.joints.push(j);
    });
  }

  mergeToLinks(links: Link[]) {
    links.forEach((l) => {
      this.links.push(l);
    });
  }

  determineNextLetter(additionalLetters?: string[]) {
    let lastLetter = '';
    if (this.joints.length === 0 && additionalLetters === undefined) {
      return 'a';
    }
    this.joints.forEach((j) => {
      if (j.id > lastLetter) {
        lastLetter = j.id;
      }
    });
    additionalLetters?.forEach((l) => {
      if (l > lastLetter) {
        lastLetter = l;
      }
    });
    return String.fromCharCode(lastLetter.charCodeAt(0) + 1);
  }

  createRevJoint(x: string, y: string, prevID?: string) {
    const x_num = roundNumber(Number(x), 3);
    const y_num = roundNumber(Number(y), 3);
    let id: string;
    if (prevID === undefined) {
      id = this.determineNextLetter();
    } else {
      id = this.determineNextLetter([prevID]);
    }
    return new RevJoint(id, x_num, y_num);
  }

  deleteJoint() {
    const jointIndex = this.gridUtils.findJointIDIndex(
      this.activeObjService.selectedJoint.id,
      this.joints
    );
    //if the joint that is meant to be deleted is the one selected in activeObjectSrv, set the activeObjectSrv to undefined
    if (
      this.activeObjService.objType === 'Joint' &&
      this.activeObjService.selectedJoint.id === this.activeObjService.selectedJoint.id
    ) {
      this.activeObjService.updateSelectedObj(undefined);
    }

    this.activeObjService.selectedJoint.links.forEach((l) => {
      // TODO: May wanna check this to be sure...
      if (l instanceof Piston) {
        return;
      }
      if (l.joints.length < 3) {
        // TODO: Utilize this same logic when you delete ImagJoint and ImagLink
        // TODO: this.deleteJointFromConnectedJoints(delJoint);
        // TODO: this.deleteLinkFromConnectedLinks(delLink);
        // delete forces on link
        if (l instanceof RealLink) {
          l.forces.forEach((f) => {
            const forceIndex = this.forces.findIndex((fo) => fo.id === f.id);
            this.forces.splice(forceIndex, 1);
          });
        }
        // go to other connected joint and remove this link from its connectedLinks and joint from connectedJoint
        // There may be an easier way to do this but this logic works :P
        const desiredJointID =
          l.joints[0].id === this.activeObjService.selectedJoint.id
            ? l.joints[1].id
            : l.joints[0].id;
        const desiredJointIndex = this.gridUtils.findJointIDIndex(desiredJointID, this.joints);
        const deleteJointIndex = this.gridUtils.findJointIDIndex(
          this.activeObjService.selectedJoint.id,
          (this.joints[desiredJointIndex] as RealJoint).connectedJoints
        );
        (this.joints[desiredJointIndex] as RealJoint).connectedJoints.splice(deleteJointIndex, 1);
        const deleteLinkIndex = (this.joints[desiredJointIndex] as RealJoint).links.findIndex(
          (lin) => {
            if (!(lin instanceof RealLink)) {
              return;
            }
            return lin.id === l.id;
          }
        );
        (this.joints[desiredJointIndex] as RealJoint).links.splice(deleteLinkIndex, 1);
        // remove link from links
        const deleteLinkIndex2 = this.links.findIndex((li) => li.id === l.id);
        this.links.splice(deleteLinkIndex2, 1);
      } else {
        l.joints.forEach((jt) => {
          if (!(jt instanceof RealJoint)) {
            return;
          }
          if (jt.id === this.activeObjService.selectedJoint.id) {
            return;
          }
          const deleteJointIndex = jt.connectedJoints.findIndex(
            (jjj) => jjj.id === this.activeObjService.selectedJoint.id
          );
          jt.connectedJoints.splice(deleteJointIndex, 1);
        });
        l.id = l.id.replace(this.activeObjService.selectedJoint.id, '');
        const delJointIndex = l.joints.findIndex(
          (jj) => jj.id === this.activeObjService.selectedJoint.id
        );
        l.joints.splice(delJointIndex, 1);
      }
    });
    this.joints.splice(jointIndex, 1);
    if (this.activeObjService.selectedLink !== undefined) {
      this.activeObjService.selectedLink.d = RealLink.getD(
        this.activeObjService.selectedLink.joints
      );
    }
    this.updateMechanism();
    this.onMechUpdateState.next(3);
  }

  deleteForce() {
    const forceIndex = this.forces.findIndex(
      (f) => f.id === this.activeObjService.selectedForce.id
    );
    this.forces.splice(forceIndex, 1);
    this.updateMechanism();
  }

  changeForceDirection() {
    this.activeObjService.selectedForce.arrowOutward =
      !this.activeObjService.selectedForce.arrowOutward;
    if (this.activeObjService.selectedForce.arrowOutward) {
      this.activeObjService.selectedForce.forceArrow = Force.createForceArrow(
        this.activeObjService.selectedForce.startCoord,
        this.activeObjService.selectedForce.endCoord
      );
    } else {
      this.activeObjService.selectedForce.forceArrow = Force.createForceArrow(
        this.activeObjService.selectedForce.endCoord,
        this.activeObjService.selectedForce.startCoord
      );
    }
    this.updateMechanism();
  }

  changeForceLocal() {
    this.activeObjService.selectedForce.local = !this.activeObjService.selectedForce.local;
    if (this.activeObjService.selectedForce.local) {
      this.activeObjService.selectedForce.stroke = 'blue';
      this.activeObjService.selectedForce.fill = 'blue';
    } else {
      this.activeObjService.selectedForce.stroke = 'black';
      this.activeObjService.selectedForce.fill = 'black';
    }
    this.updateMechanism();
  }

  deleteLink() {
    console.log(this.activeObjService);
    if (
      this.activeObjService.objType === 'Link' &&
      this.activeObjService.selectedLink.id === this.activeObjService.selectedLink.id
    ) {
      this.activeObjService.updateSelectedObj(undefined);
    }
    // console.warn(this.activeObjService.Link);
    const linkIndex = this.links.findIndex((l) => l.id === this.activeObjService.selectedLink.id);
    this.links[linkIndex].joints.forEach((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      const delLinkIndex = j.links.findIndex((l) => l.id === this.activeObjService.selectedLink.id);
      j.links.splice(delLinkIndex, 1);
    });
    for (let j_i = 0; j_i < this.links[linkIndex].joints.length - 1; j_i++) {
      for (let next_j_i = j_i + 1; next_j_i < this.links[linkIndex].joints.length; next_j_i++) {
        // TODO: Should recreate a function for this... (kinda too lazy atm)
        const joint = this.links[linkIndex].joints[j_i];
        if (!(joint instanceof RealJoint)) {
          return;
        }
        const desiredJointIndex = joint.connectedJoints.findIndex(
          (jj) => jj.id === this.links[linkIndex].joints[next_j_i].id
        );
        joint.connectedJoints.splice(desiredJointIndex, 1);
        const otherJoint = this.links[linkIndex].joints[next_j_i];
        if (!(otherJoint instanceof RealJoint)) {
          return;
        }
        const otherDesiredJointIndex = otherJoint.connectedJoints.findIndex(
          (jj) => jj.id === this.links[linkIndex].joints[j_i].id
        );
        otherJoint.connectedJoints.splice(otherDesiredJointIndex, 1);
      }
    }
    this.links.splice(linkIndex, 1);
    this.updateMechanism();
    this.onMechUpdateState.next(3);
  }

  toggleGround() {
    //Should be called toggleGround
    if (this.activeObjService.selectedJoint instanceof PrisJoint) {
      const revJoint = this.activeObjService.selectedJoint.connectedJoints.find(
        (j) => j instanceof RevJoint
      )!;
      if (!(revJoint instanceof RevJoint)) {
        return;
      }

      this.activeObjService.selectedJoint.connectedJoints.forEach((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        const removeIndex = j.connectedJoints.findIndex(
          (jt) => jt.id === this.activeObjService.selectedJoint.id
        );
        j.connectedJoints.splice(removeIndex, 1);
      });
      const piston = this.links.find((l) => l instanceof Piston)!;
      piston.joints.forEach((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        const removeIndex = j.links.findIndex((l) => l.id === piston.id);
        j.links.splice(removeIndex, 1);
      });
      const prismaticJointIndex = this.joints.findIndex(
        (j) => j.id == this.activeObjService.selectedJoint.id
      );
      const pistonIndex = this.links.findIndex((l) => l.id === piston.id);
      this.joints.splice(prismaticJointIndex, 1);
      this.links.splice(pistonIndex, 1);

      revJoint.ground = true;
      // let joint = this.activeObjService.selectedJoint as RevJoint;
      // // TODO: Be sure to remove connected joints and links that are ImagJoint and ImagLinks
      // joint = new RevJoint(joint.id, joint.x, joint.y, joint.input, joint.ground, joint.links, joint.connectedJoints);
      // const selectedJointIndex = this.findJointIDIndex(this.activeObjService.selectedJoint.id, this.joints);
      // this.joints[selectedJointIndex] = joint;
    } else {
      this.activeObjService.selectedJoint.ground = !this.activeObjService.selectedJoint.ground;
    }
    this.updateMechanism();
  }

  toggleInput($event: MouseEvent) {
    // TODO: Adjust this logic when there are multiple mechanisms created
    this.activeObjService.selectedJoint.input = !this.activeObjService.selectedJoint.input;
    let jointsTraveled = ''.concat(this.activeObjService.selectedJoint.id);
    this.activeObjService.selectedJoint.connectedJoints.forEach((j) => {
      jointsTraveled = checkConnectedJoints(j, jointsTraveled);
    });

    function checkConnectedJoints(j: Joint, jointsTraveled: string): string {
      if (!(j instanceof RealJoint) || jointsTraveled.includes(j.id)) {
        return jointsTraveled;
      }
      j.input = false;
      jointsTraveled = jointsTraveled.concat(j.id);
      j.connectedJoints.forEach((jt) => {
        jointsTraveled = checkConnectedJoints(jt, jointsTraveled);
      });
      return jointsTraveled;
    }

    this.updateMechanism();
    this.onMechUpdateState.next(3);
  }

  toggleSlider() {
    if (!(this.activeObjService.selectedJoint instanceof PrisJoint)) {
      // Create Prismatic Joint
      this.activeObjService.selectedJoint.ground = false;
      const prismaticJointId = this.determineNextLetter();
      const inputJointIndex = this.findInputJointIndex();
      const connectedJoints: Joint[] = [this.activeObjService.selectedJoint];
      this.joints.forEach((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        if (j.ground) {
          connectedJoints.push(j);
        }
      });
      const prisJoint = new PrisJoint(
        prismaticJointId,
        this.activeObjService.selectedJoint.x,
        this.activeObjService.selectedJoint.y,
        this.activeObjService.selectedJoint.input,
        true,
        [],
        connectedJoints
      );
      this.activeObjService.selectedJoint.connectedJoints.push(prisJoint);
      const piston = new Piston(this.activeObjService.selectedJoint.id + prisJoint.id, [
        this.activeObjService.selectedJoint,
        prisJoint,
      ]);
      prisJoint.links.push(piston);
      this.activeObjService.selectedJoint.links.push(piston);
      this.joints.push(prisJoint);
      this.links.push(piston);
    } else {
      // delete Prismatic Joint
      // TODO: determine logic to delete crank and the prismatic joint
      this.activeObjService.selectedJoint.connectedJoints.forEach((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        const removeIndex = j.connectedJoints.findIndex(
          (jt) => jt.id === this.activeObjService.selectedJoint.id
        );
        j.connectedJoints.splice(removeIndex, 1);
      });
      const piston = this.links.find((l) => l instanceof Piston)!;
      piston.joints.forEach((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        const removeIndex = j.links.findIndex((l) => l.id === piston.id);
        j.links.splice(removeIndex, 1);
      });
      const prismaticJointIndex = this.joints.findIndex(
        (j) => j.id == this.activeObjService.selectedJoint.id
      );
      const pistonIndex = this.links.findIndex((l) => l.id === piston.id);
      this.joints.splice(prismaticJointIndex, 1);
      this.links.splice(pistonIndex, 1);
    }
    this.updateMechanism();
  }

  findInputJointIndex() {
    return this.joints.findIndex((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      return j.input;
    });
  }

  animate(progress: number, animationState?: boolean) {
    this.onMechPositionChange.next(progress);
    this.mechanismTimeStep = progress;
    this.showPathHolder = !(this.mechanismTimeStep === 0 && !animationState);
    if (animationState !== undefined) {
      AnimationBarComponent.animate = animationState;
    }

    this.joints.forEach((j, j_index) => {
      j.x = this.mechanisms[0].joints[this.mechanismTimeStep][j_index].x;
      j.y = this.mechanisms[0].joints[this.mechanismTimeStep][j_index].y;
    });
    this.links.forEach((l, l_index) => {
      if (!(l instanceof RealLink)) {
        return;
      }
      const link = this.mechanisms[0].links[this.mechanismTimeStep][l_index];
      if (!(link instanceof RealLink)) {
        return;
      }
      // l.d = RealLink.getD(l.joints);
      l.d = link.d;
      l.CoM = link.CoM;
      l.updateCoMDs();
    });
    this.forces.forEach((f, f_index) => {
      f.startCoord.x = this.mechanisms[0].forces[this.mechanismTimeStep][f_index].startCoord.x;
      f.startCoord.y = this.mechanisms[0].forces[this.mechanismTimeStep][f_index].startCoord.y;
      f.endCoord.x = this.mechanisms[0].forces[this.mechanismTimeStep][f_index].endCoord.x;
      f.endCoord.y = this.mechanisms[0].forces[this.mechanismTimeStep][f_index].endCoord.y;
      f.local = this.mechanisms[0].forces[this.mechanismTimeStep][f_index].local;
      f.mag = this.mechanisms[0].forces[this.mechanismTimeStep][f_index].mag;
      f.angle = this.mechanisms[0].forces[this.mechanismTimeStep][f_index].angle;
      f.forceLine = Force.createForceLine(f.startCoord, f.endCoord);
      f.forceArrow = Force.createForceArrow(f.startCoord, f.endCoord);
    });
    if (!AnimationBarComponent.animate) {
      return;
    }
    this.mechanismTimeStep += this.mechanismAnimationIncrement;
    if (this.mechanismTimeStep >= this.mechanisms[0].joints.length) {
      this.mechanismTimeStep = 0;
    }
    setTimeout(() => {
      this.animate(this.mechanismTimeStep);
    }, 8);
  }
}
