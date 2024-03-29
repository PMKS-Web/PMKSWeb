import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Force } from '../../model/force';
import { Piston, Link, RealLink, Shape } from '../../model/link';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../../model/joint';
import { Coord } from '../../model/coord';
import { roundNumber } from '../../model/utils';
import { Mechanism } from '../../model/mechanism/mechanism';
import { InstantCenter } from '../../model/instant-center';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { MechanismService } from '../../services/mechanism.service';
import { NewGridComponent } from '../new-grid/new-grid.component';

@Component({
  selector: 'app-linkage-table',
  templateUrl: './linkage-table.component.html',
  styleUrls: ['./linkage-table.component.scss'],
})
export class LinkageTableComponent implements OnInit {
  private static linkageTable: SVGElement;
  private static jointButton: SVGElement;
  private static linkButton: SVGElement;
  private static forceButton: SVGElement;
  private static showLinkageTableButton: SVGElement;

  constructor(private mechanismService: MechanismService) {}

  ngOnInit(): void {}

  ngAfterViewInit() {
    LinkageTableComponent.linkageTable = document.getElementById(
      'linkageTable'
    ) as unknown as SVGElement;
    LinkageTableComponent.jointButton = document.getElementById(
      'jointButton'
    ) as unknown as SVGElement;
    LinkageTableComponent.linkButton = document.getElementById(
      'linkButton'
    ) as unknown as SVGElement;
    LinkageTableComponent.forceButton = document.getElementById(
      'forceButton'
    ) as unknown as SVGElement;
    LinkageTableComponent.showLinkageTableButton = document.getElementById(
      'showTable'
    ) as unknown as SVGElement;
  }

  distFromJoint(joint1: Joint, joint2: Joint) {
    return roundNumber(
      Math.sqrt(Math.pow(joint1.x - joint2.x, 2) + Math.pow(joint1.y - joint2.y, 2)),
      3
    );
  }

  changeJointProp($event: any, joint: Joint, jointProp: string) {
    if (!(joint instanceof RealJoint)) {
      return;
    }
    switch (jointProp) {
      // TODO: When changing the joint positions, be sure to also change the ('d') path of the link
      case 'x':
        if (isNaN(Number($event.target.value))) {
          return NewGridComponent.sendNotification('Check Joint X Value');
        }
        joint.x = Number($event.target.value);
        joint.links.forEach((l) => {
          if (!(l instanceof RealLink)) {
            return;
          }
          // TODO: delete this if this is not needed (verify this)
          const jointIndex = l.joints.findIndex((jt) => jt.id === joint.id);
          l.joints[jointIndex].x = roundNumber(joint.x, 3);
          l.joints[jointIndex].y = roundNumber(joint.y, 3);
          l.CoM = RealLink.determineCenterOfMass(l.joints);
          // l.bound = RealLink.getBounds(new Coord(l.joints[0].x, l.joints[0].y), new Coord(l.joints[1].x, l.joints[1].y), Shape.line);
          // l.d = RealLink.getPointsFromBounds(l.bound, l.shape);
          l.d = l.getPathString();
          l.forces.forEach((f) => {
            // TODO: adjust the location of force endpoints and update the line and arrow
          });
        });
        break;
      case 'y':
        if (isNaN(Number($event.target.value))) {
          return NewGridComponent.sendNotification('Check Joint Y Value');
        }
        joint.y = Number($event.target.value);
        joint.links.forEach((l) => {
          if (!(l instanceof RealLink)) {
            return;
          }
          // TODO: delete this if this is not needed (verify this)
          const jointIndex = l.joints.findIndex((jt) => jt.id === joint.id);
          l.joints[jointIndex].x = roundNumber(joint.x, 3);
          l.joints[jointIndex].y = roundNumber(joint.y, 3);
          l.CoM = RealLink.determineCenterOfMass(l.joints);
          l.d = l.getPathString();
          l.forces.forEach((f) => {
            // TODO: adjust the location of force endpoints and update the line and arrow
          });
        });
        break;
      case 'id':
        if (!(typeof $event.target.value === 'string')) {
          return NewGridComponent.sendNotification('Check Joint ID');
        }
        joint.links.forEach((l) => {
          l.id = l.id.replace(joint.id, $event.target.value);
        });
        joint.id = $event.target.value;
        break;
      case 'angle':
        if (isNaN(Number($event.target.value))) {
          return NewGridComponent.sendNotification('Check Angle Value');
        }
        if (!(joint instanceof PrisJoint)) {
          return;
        }
        joint.angle_rad = (Number($event.target.value) * Math.PI) / 180;
    }
    this.mechanismService.updateMechanism();
  }

  changeLinkProp($event: any, link: Link, linkProp: string) {
    if (!(link instanceof RealLink)) {
      return;
    }
    switch (linkProp) {
      case 'mass':
        if (isNaN(Number($event.target.value))) {
          return NewGridComponent.sendNotification('Check Link Mass');
        }
        link.mass = Number($event.target.value);
        break;
      case 'massMoI':
        if (isNaN(Number($event.target.value))) {
          return NewGridComponent.sendNotification('Check Link Mass MoI');
        }
        link.massMoI = Number($event.target.value);
        break;
      case 'CoMX':
        if (isNaN(Number($event.target.value))) {
          return NewGridComponent.sendNotification('Check Link CoM Y');
        }
        link.CoM.x = Number($event.target.value);
        break;
      case 'CoMY':
        if (isNaN(Number($event.target.value))) {
          return NewGridComponent.sendNotification('Check Link CoM Y');
        }
        link.CoM.y = Number($event.target.value);
        break;
    }
    this.mechanismService.updateMechanism();
  }

  showForceAngle(force: Force) {
    return force.angleRad * (180 / Math.PI);
  }

  changeForceProp($event: any, force: Force, forceProp: string) {
    switch (forceProp) {
      case 'id':
        if (!(typeof $event.target.value === 'string')) {
          return NewGridComponent.sendNotification('Check Force ID');
        }
        force.id = $event.target.value;
        break;
      case 'xPos':
        if (isNaN(Number($event.target.value))) {
          return NewGridComponent.sendNotification('Check Force X Position');
        }
        force.startCoord.x = Number($event.target.value);
        break;
      case 'yPos':
        if (isNaN(Number($event.target.value))) {
          return NewGridComponent.sendNotification('Check Force Y Position');
        }
        force.startCoord.y = Number($event.target.value);
        break;
      case 'mag':
        if (isNaN(Number($event.target.value))) {
          return NewGridComponent.sendNotification('Check Force Magnitude');
        }
        force.mag = Number($event.target.value);
        break;
      case 'angle':
        if (isNaN(Number($event.target.value))) {
          return NewGridComponent.sendNotification('Check Force Angle');
        }
        force.angleRad = Number($event.target.value) * (Math.PI / 180);
        // TODO: Within commonClass, have radToDeg and degToRad
        force.endCoord.x = Math.cos(force.angleRad) + force.startCoord.x;
        force.endCoord.y = Math.sin(force.angleRad) + force.startCoord.y;
        break;
    }
    force.forceLine = force.createForceLine(force.startCoord, force.endCoord);
    force.forceArrow = force.createForceArrow(force.startCoord, force.endCoord);
    this.mechanismService.updateMechanism();
  }

  static linkageVisibility() {
    if (LinkageTableComponent.linkageTable.style.visibility === 'visible') {
      LinkageTableComponent.linkageTable.style.visibility = 'hidden';
      LinkageTableComponent.showLinkageTableButton.textContent = 'Show Table';
    } else {
      LinkageTableComponent.linkageTable.style.visibility = 'visible';
      LinkageTableComponent.showLinkageTableButton.textContent = 'Hide Table';
    }
  }

  getLinkageVisibility() {
    return LinkageTableComponent.linkageVisibility();
  }

  typeOfJoint(joint: Joint) {
    switch (joint.constructor) {
      case Joint:
        return '?';
      case RealJoint:
        return '?';
      case RevJoint:
        return 'R';
      case PrisJoint:
        return 'P';
    }
    return '?';
  }

  typeofLink(link: Link) {
    switch (link.constructor) {
      case RealLink:
        return 'R';
      case Piston:
        return 'P';
    }
    return '?';
  }

  getJointAngle(joint: Joint) {
    if (!(joint instanceof PrisJoint)) {
      return;
    }
    return (joint.angle_rad * 180) / Math.PI;
  }

  getLinkProp(link: Link, propType: string) {
    if (!(link instanceof RealLink)) {
      return;
    }
    switch (propType) {
      case 'mass':
        return link.mass;
      case 'massMoI':
        return link.massMoI;
      case 'CoMX':
        return link.CoM.x;
      case 'CoMY':
        return link.CoM.y;
      default:
        return '?';
    }
  }

  connectedJoints(joint: Joint) {
    if (!(joint instanceof PrisJoint || joint instanceof RevJoint)) {
      return;
    }
    return joint.connectedJoints;
  }

  getJoints() {
    return this.mechanismService.joints;
  }

  getLinks() {
    return this.mechanismService.links;
  }

  getForces() {
    return this.mechanismService.forces;
  }

  getUnit() {
    // TODO: Should return this.settingService.globalUnit.value
    return 'cm'; // :P
    // return ToolbarComponent.unit;
  }
}
