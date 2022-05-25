import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Force} from "../../model/force";
import {Piston, Link, RealLink, Shape} from "../../model/link";
import {Joint, PrisJoint, RealJoint, RevJoint} from "../../model/joint";
import {Coord} from "../../model/coord";
import {roundNumber} from "../../model/utils";
import {Mechanism} from "../../model/mechanism/mechanism";
import {InstantCenter} from "../../model/instant-center";
import {GridComponent} from "../grid/grid.component";

@Component({
  selector: 'app-linkage-table',
  templateUrl: './linkage-table.component.html',
  styleUrls: ['./linkage-table.component.css']
})
export class LinkageTableComponent implements OnInit {
  private static linkageTable: SVGElement;
  private static jointButton: SVGElement;
  private static linkButton: SVGElement;
  private static forceButton: SVGElement;
  private static showLinkageTableButton: SVGElement;

  selectedTab: number = 0;
  constructor() { }

  ngOnInit(): void {}

  ngAfterViewInit() {
    LinkageTableComponent.linkageTable = document.getElementById('linkageTable') as unknown as SVGElement;
    LinkageTableComponent.jointButton = document.getElementById('jointButton') as unknown as SVGElement;
    LinkageTableComponent.linkButton = document.getElementById('linkButton') as unknown as SVGElement;
    LinkageTableComponent.forceButton = document.getElementById('forceButton') as unknown as SVGElement;
    LinkageTableComponent.showLinkageTableButton = document.getElementById('showTable') as unknown as SVGElement;
  }

  setTab(tabNum: number) {
    this.selectedTab = tabNum;
    // TODO: If possible, put this as hover within css
    switch (tabNum) {
      case 0:
        LinkageTableComponent.jointButton.setAttribute('style',
          'color: black; background-color: gray; font-family: Arial, sans-serif');
        LinkageTableComponent.linkButton.setAttribute('style',
          'color: gray; background-color: white; font-family: Arial, sans-serif');
        LinkageTableComponent.forceButton.setAttribute('style',
          'color: gray; background-color: white; font-family: Arial, sans-serif');
        break;
      case 1:
        LinkageTableComponent.jointButton.setAttribute('style',
          'color: gray; background-color: white; font-family: Arial, sans-serif');
        LinkageTableComponent.linkButton.setAttribute('style',
          'color: black; background-color: gray; font-family: Arial, sans-serif');
        LinkageTableComponent.forceButton.setAttribute('style',
          'color: gray; background-color: white; font-family: Arial, sans-serif');
        break;
      case 2:
        LinkageTableComponent.jointButton.setAttribute('style',
          'color: gray; background-color: white; font-family: Arial, sans-serif');
        LinkageTableComponent.linkButton.setAttribute('style',
          'color: gray; background-color: white; font-family: Arial, sans-serif');
        LinkageTableComponent.forceButton.setAttribute('style',
          'color: black; background-color: gray; font-family: Arial, sans-serif');
        break;
    }
    // LinkageTableComponent.selectedTab = $event.index;
  }

  distFromJoint(joint1: Joint, joint2: Joint) {
    return roundNumber(Math.sqrt(Math.pow(joint1.x - joint2.x , 2) +
      Math.pow(joint1.y - joint2.y, 2)), 3);
  }

  changeJointProp($event: any, joint: Joint, jointProp: string) {
    if (!(joint instanceof RealJoint)) {return}
    switch (jointProp) {
      // TODO: When changing the joint positions, be sure to also change the ('d') path of the link
      case 'x':
        joint.x = Number($event.target.value);
        joint.links.forEach(li => {
          if (li instanceof Piston) {return}
          const l = li as RealLink;
          // TODO: delete this if this is not needed (verify this)
          const jointIndex = l.joints.findIndex(jt => jt.id === joint.id);
          l.joints[jointIndex].x = roundNumber(joint.x, 3);
          l.joints[jointIndex].y = roundNumber(joint.y, 3);
          l.CoM = RealLink.determineCenterOfMass(l.joints);
          l.bound = RealLink.getBounds(
            new Coord(l.joints[0].x, l.joints[0].y),
            new Coord(l.joints[1].x, l.joints[1].y), Shape.line);
          l.d = RealLink.getPointsFromBounds(l.bound, l.shape);
          l.forces.forEach(f => {
            // TODO: adjust the location of force endpoints and update the line and arrow
          });
        });
        break;
      case 'y':
        joint.y = Number($event.target.value);
        joint.links.forEach(li => {
          if (li instanceof Piston) {return}
          const l = li as RealLink;
          // TODO: delete this if this is not needed (verify this)
          const jointIndex = l.joints.findIndex(jt => jt.id === joint.id);
          l.joints[jointIndex].x = roundNumber(joint.x, 3);
          l.joints[jointIndex].y = roundNumber(joint.y, 3);
          l.CoM = RealLink.determineCenterOfMass(l.joints);
          l.bound = RealLink.getBounds(
            new Coord(l.joints[0].x, l.joints[0].y),
            new Coord(l.joints[1].x, l.joints[1].y), Shape.line);
          l.d = RealLink.getPointsFromBounds(l.bound, l.shape);
          l.forces.forEach(f => {
            // TODO: adjust the location of force endpoints and update the line and arrow
          });
        });
        break;
      case 'id':
        // TODO: Be sure to change the link's ID
        joint.id = $event.target.value;
        break;
      case 'angle':
        if (!(joint instanceof PrisJoint)) {return}
        joint.angle = $event.target.value;
    }
    GridComponent.updateMechanism();
  }

  changeLinkProp($event: any, link: Link, linkProp: string) {
    if (!(link instanceof RealLink)) {return}
    switch (linkProp) {
      case 'mass':
        link.mass = $event.target.value;
        break;
      case 'massMoI':
        link.massMoI = $event.target.value;
        break;
      case 'CoMX':
        link.CoM.x = $event.target.value;
        break;
      case 'CoMY':
        link.CoM.y = $event.target.value;
        break;
    }
    GridComponent.updateMechanism();
  }
  changeForceProp($event: any, force: Force, forceProp: string) {
    switch (forceProp) {
      case 'id':
        force.id = $event.target.value;
        break;
      case 'xPos':
        force.startCoord.x = $event.target.value;
        break;
      case 'yPos':
        force.startCoord.y = $event.target.value;
        break;
      case 'mag':
        force.mag = $event.target.value;
        break;
      case 'angle':
        force.angle = $event.target.value;
        // TODO: Within commonClass, have radToDeg and degToRad
        force.endCoord.x = Math.cos(force.angle * Math.PI / 180) * force.mag + force.startCoord.x;
        force.endCoord.y = Math.sin(force.angle * Math.PI / 180) * force.mag + force.startCoord.y;
        break;
    }
    force.forceLine = Force.createForceLine(force.startCoord, force.endCoord);
    force.forceArrow = Force.createForceArrow(force.startCoord, force.endCoord);
    GridComponent.updateMechanism();
  }

  mouseOver(number: number) {
    if (this.selectedTab === number) {
      return;
    }
    switch (number) {
      case 0:
        LinkageTableComponent.jointButton.setAttribute('style',
          'background-color: lightgray; font-family: Arial, sans-serif');
        break;
      case 1:
        LinkageTableComponent.linkButton.setAttribute('style',
          'background-color: lightgray; font-family: Arial, sans-serif');
        break;
      case 2:
        LinkageTableComponent.forceButton.setAttribute('style',
          'background-color: lightgray; font-family: Arial, sans-serif');
        break;
    }
  }
  mouseOut(number: number) {
    if (this.selectedTab === number) {
      return;
    }
    switch (number) {
      case 0:
        LinkageTableComponent.jointButton.setAttribute('style',
          'background-color: white; font-family: Arial, sans-serif');
        break;
      case 1:
        LinkageTableComponent.linkButton.setAttribute('style',
          'background-color: white; font-family: Arial, sans-serif');
        break;
      case 2:
        LinkageTableComponent.forceButton.setAttribute('style',
          'background-color: white; font-family: Arial, sans-serif');
        break;
    }
  }

  static linkageVisibility() {
    if (LinkageTableComponent.linkageTable.style.visibility === 'visible') {
      LinkageTableComponent.linkageTable.style.visibility = 'hidden';
      LinkageTableComponent.showLinkageTableButton.textContent = 'Show Table'
    } else {
      LinkageTableComponent.linkageTable.style.visibility = 'visible';
      LinkageTableComponent.showLinkageTableButton.textContent = 'Hide Table'
    }
  }

  getLinkageVisibility() {
    return LinkageTableComponent.linkageVisibility();
  }

  typeOfJoint(joint: Joint) {
    switch(joint.constructor) {
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
    return '?'
  }

  getJointAngle(joint: Joint) {
    if (!(joint instanceof PrisJoint)) {return}
    // joint will always be a prismatic joint
    return joint.angle;
  }

  getLinkProp(l: Link, propType: string) {
    if (l instanceof Piston) {return}
    const link = l as RealLink;
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
    if (!(joint instanceof PrisJoint || joint instanceof RevJoint)) {return}
    return joint.connectedJoints;
  }

  getJoints() {
    return GridComponent.joints;
  }

  getLinks() {
    return GridComponent.links;
  }

  getForces() {
    return GridComponent.forces;
  }
}
