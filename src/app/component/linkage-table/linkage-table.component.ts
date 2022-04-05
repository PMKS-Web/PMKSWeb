import {Component, Input, OnInit} from '@angular/core';
import {Force} from "../../model/force";
import {ImagLink, Link, RealLink, Shape} from "../../model/link";
import {ImagJoint, Joint, PrisJoint, RealJoint, RevJoint} from "../../model/joint";
import {Coord} from "../../model/coord";
import {roundNumber} from "../../model/utils";

@Component({
  selector: 'app-linkage-table',
  templateUrl: './linkage-table.component.html',
  styleUrls: ['./linkage-table.component.css']
})
export class LinkageTableComponent implements OnInit {
  @Input() joints: Joint[] = [];
  @Input() links: Link[] = [];
  @Input() forces: Force[] = [];

  private static linkageTable: SVGElement;
  private static jointButton: SVGElement;
  private static linkButton: SVGElement;
  private static forceButton: SVGElement;

  selectedTab: number = 0;
  constructor() { }

  ngOnInit(): void {}

  ngAfterViewInit() {
    LinkageTableComponent.linkageTable = document.getElementById('linkageTable') as unknown as SVGElement;
    LinkageTableComponent.jointButton = document.getElementById('jointButton') as unknown as SVGElement;
    LinkageTableComponent.linkButton = document.getElementById('linkButton') as unknown as SVGElement;
    LinkageTableComponent.forceButton = document.getElementById('forceButton') as unknown as SVGElement;
  }

  setTab(tabNum: number) {
    this.selectedTab = tabNum;
    // TODO: If possible, put this as hover within css
    switch (tabNum) {
      case 0:
        LinkageTableComponent.jointButton.setAttribute('style',
          'color: black; background-color: gray');
        LinkageTableComponent.linkButton.setAttribute('style',
          'color: gray; background-color: white');
        LinkageTableComponent.forceButton.setAttribute('style',
          'color: gray; background-color: white');
        break;
      case 1:
        LinkageTableComponent.jointButton.setAttribute('style',
          'color: gray; background-color: white');
        LinkageTableComponent.linkButton.setAttribute('style',
          'color: black; background-color: gray');
        LinkageTableComponent.forceButton.setAttribute('style',
          'color: gray; background-color: white');
        break;
      case 2:
        LinkageTableComponent.jointButton.setAttribute('style',
          'color: gray; background-color: white');
        LinkageTableComponent.linkButton.setAttribute('style',
          'color: gray; background-color: white');
        LinkageTableComponent.forceButton.setAttribute('style',
          'color: black; background-color: gray');
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
          if (li instanceof ImagLink) {return}
          const l = li as RealLink;
          // TODO: delete this if this is not needed (verify this)
          const jointIndex = l.joints.findIndex(jt => jt.id === joint.id);
          l.joints[jointIndex].x = roundNumber(joint.x, 3);
          l.joints[jointIndex].y = roundNumber(joint.y, 3);
          l.CoMX = RealLink.determineCenterOfMass(l.joints, 'x');
          l.CoMY = RealLink.determineCenterOfMass(l.joints, 'y');
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
          if (li instanceof ImagLink) {return}
          const l = li as RealLink;
          // TODO: delete this if this is not needed (verify this)
          const jointIndex = l.joints.findIndex(jt => jt.id === joint.id);
          l.joints[jointIndex].x = roundNumber(joint.x, 3);
          l.joints[jointIndex].y = roundNumber(joint.y, 3);
          l.CoMX = RealLink.determineCenterOfMass(l.joints, 'x');
          l.CoMY = RealLink.determineCenterOfMass(l.joints, 'y');
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
        const j = joint as PrisJoint;
        j.angle = $event.target.value;
    }
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
        link.CoMX = $event.target.value;
        break;
      case 'CoMY':
        link.CoMY = $event.target.value;
        break;
    }
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
      case 'xMag':
        force.xMag = $event.target.value;
        break;
      case 'yMag':
        force.yMag = $event.target.value;
        break;
    }
  }

  mouseOver(number: number) {
    if (this.selectedTab === number) {
      return;
    }
    switch (number) {
      case 0:
        LinkageTableComponent.jointButton.setAttribute('style',
          'background-color: lightgray');
        break;
      case 1:
        LinkageTableComponent.linkButton.setAttribute('style',
          'background-color: lightgray');
        break;
      case 2:
        LinkageTableComponent.forceButton.setAttribute('style',
          'background-color: lightgray');
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
          'background-color: white');
        break;
      case 1:
        LinkageTableComponent.linkButton.setAttribute('style',
          'background-color: white');
        break;
      case 2:
        LinkageTableComponent.forceButton.setAttribute('style',
          'background-color: white');
        break;
    }
  }

  linkageVisibility() {
    if (LinkageTableComponent.linkageTable.style.visibility === 'visible') {
      LinkageTableComponent.linkageTable.style.visibility = 'hidden';
    } else {
      LinkageTableComponent.linkageTable.style.visibility = 'visible';
    }
  }

  typeOfJoint(joint: Joint) {
    switch(joint.constructor) {
      case Joint:
        return '?';
      case RealJoint:
        return '?';
      case ImagJoint:
        return 'I';
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
      case ImagLink:
        return 'I';
    }
    return '?'
  }

  getJointAngle(joint: Joint) {
    if (!(joint instanceof PrisJoint)) {return}
    // joint will always be a prismatic joint
    return joint.angle;
  }

  getLinkProp(l: Link, propType: string) {
    if (l instanceof ImagLink) {return}
    const link = l as RealLink;
    switch (propType) {
      case 'mass':
        return link.mass;
      case 'massMoI':
        return link.massMoI;
      case 'CoMX':
        return link.CoMX;
      case 'CoMY':
        return link.CoMY;
      default:
        return '?';
    }
  }

  connectedJoints(joint: Joint) {
    if (!(joint instanceof PrisJoint || joint instanceof RevJoint)) {return}
    return joint.connectedJoints;
  }
}
