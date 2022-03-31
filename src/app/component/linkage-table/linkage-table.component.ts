import {Component, Input, OnInit} from '@angular/core';
import {Force} from "../../model/force";
import {ImagLink, Link, RealLink, Shape} from "../../model/link";
import {Joint, PrisJoint, RevJoint} from "../../model/joint";
import {Coord} from "../../model/coord";

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
    return this.roundNumber(Math.sqrt(Math.pow(joint1.x - joint2.x , 2) +
      Math.pow(joint1.y - joint2.y, 2)), 3);
  }

  roundNumber(num: number, scale: number): number {
    const tens = Math.pow(10, scale);
    return Math.round(num * tens) / tens;
  }

  changeJointProp($event: any, joint: Joint, jointProp: string) {
    switch (jointProp) {
      // TODO: When changing the joint positions, be sure to also change the ('d') path of the link
      case 'x':
        joint.x = Number($event.target.value);
        joint.links.forEach(li => {
          if (li instanceof ImagLink) {return}
          const l = li as RealLink;
          // TODO: delete this if this is not needed (verify this)
          const jointIndex = l.joints.findIndex(jt => jt.id === joint.id);
          l.joints[jointIndex].x = this.roundNumber(joint.x, 3);
          l.joints[jointIndex].y = this.roundNumber(joint.y, 3);
          l.CoMX = l.determineCenterOfMass(l.joints, 'x');
          l.CoMY = l.determineCenterOfMass(l.joints, 'y');
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
          l.joints[jointIndex].x = this.roundNumber(joint.x, 3);
          l.joints[jointIndex].y = this.roundNumber(joint.y, 3);
          l.CoMX = l.determineCenterOfMass(l.joints, 'x');
          l.CoMY = l.determineCenterOfMass(l.joints, 'y');
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
    if (link instanceof ImagLink) {return }
    const l = link as RealLink;
    switch (linkProp) {
      case 'mass':
        l.mass = $event.target.value;
        break;
      case 'massMoI':
        l.massMoI = $event.target.value;
        break;
      case 'CoMX':
        l.CoMX = $event.target.value;
        break;
      case 'CoMY':
        l.CoMY = $event.target.value;
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
      case RevJoint:
        return 'R';
      case PrisJoint:
        return 'P';
      default:
          return '?'
    }
  }
  typeofLink(link: Link) {
    switch (link.constructor) {
      case RealLink:
        return 'R';
      case ImagLink:
        return 'P';
      default:
        return '?'
    }
  }

  getJointAngle(joint: Joint) {
    // joint will always be a prismatic joint
    const j = joint as PrisJoint;
    return j.angle;
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
}
