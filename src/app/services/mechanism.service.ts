import { Injectable } from '@angular/core';
import { Joint, RealJoint } from '../model/joint';
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
} from '../model/utils';

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
  private gridStates: gridStates = gridStates.waiting;
  private jointStates: jointStates = jointStates.waiting;
  private linkStates: linkStates = linkStates.waiting;
  private forceStates: forceStates = forceStates.waiting;

  // private moveModes: moveModes = moveModes;
  private selectedJoint!: RealJoint;

  constructor() {}

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
    if (this.jointStates !== jointStates.dragging) {
      return joint.showHighlight ? 'yellow' : 'black';
    } else {
      return joint.id == this.selectedJoint.id ? 'red' : 'black';
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
}
