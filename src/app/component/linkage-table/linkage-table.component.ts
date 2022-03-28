import {Component, Input, OnInit} from '@angular/core';
import {Force} from "../../model/force";
import {Link, Shape} from "../../model/link";
import {Joint} from "../../model/joint";
import {Coord} from "../grid/coord/coord";

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
  private static visabilityButton: SVGElement;
  private static jointButton: SVGElement;
  private static linkButton: SVGElement;
  private static forceButton: SVGElement;

  selectedTab: number = 0;
  // private static selectedTab: number = 0;
  constructor() { }

  ngOnInit(): void {}

  ngAfterViewInit() {
    LinkageTableComponent.linkageTable = document.getElementById('linkageTable') as unknown as SVGElement;
    LinkageTableComponent.visabilityButton = document.getElementById('showTable') as unknown as SVGElement;
    LinkageTableComponent.jointButton = document.getElementById('jointButton') as unknown as SVGElement;
    LinkageTableComponent.linkButton = document.getElementById('linkButton') as unknown as SVGElement;
    LinkageTableComponent.forceButton = document.getElementById('forceButton') as unknown as SVGElement;
  }

  setTab(tabNum: number) {
    this.selectedTab = tabNum;
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

  // showLinks() {
  //
  // }
  //
  // showForces() {
  //
  // }
  changeJointProp($event: any, joint: Joint, jointProp: string) {
    switch (jointProp) {
      // TODO: When changing the joint positions, be sure to also change the ('d') path of the link
      case 'x':
        joint.x = Number($event.target.value);
        joint.links.forEach(l => {
          // TODO: delete this if this is not needed (verify this)
          const jointIndex = l.joints.findIndex(jt => jt.id === joint.id);
          l.joints[jointIndex].x = this.roundNumber(joint.x, 3);
          l.joints[jointIndex].y = this.roundNumber(joint.y, 3);
          l.CoMX = l.determineCenterOfMass(l.joints, 'x');
          l.CoMY = l.determineCenterOfMass(l.joints, 'y');
          l.bound = Link.getBounds(
            new Coord(l.joints[0].x, l.joints[0].y),
            new Coord(l.joints[1].x, l.joints[1].y), Shape.line);
          l.d = Link.getPointsFromBounds(l.bound, l.shape);
          l.forces.forEach(f => {
            // TODO: adjust the location of force endpoints and update the line and arrow
          });
        });
        break;
      case 'y':
        joint.y = Number($event.target.value);
        joint.links.forEach(l => {
          // TODO: delete this if this is not needed (verify this)
          const jointIndex = l.joints.findIndex(jt => jt.id === joint.id);
          l.joints[jointIndex].x = this.roundNumber(joint.x, 3);
          l.joints[jointIndex].y = this.roundNumber(joint.y, 3);
          l.CoMX = l.determineCenterOfMass(l.joints, 'x');
          l.CoMY = l.determineCenterOfMass(l.joints, 'y');
          l.bound = Link.getBounds(
            new Coord(l.joints[0].x, l.joints[0].y),
            new Coord(l.joints[1].x, l.joints[1].y), Shape.line);
          l.d = Link.getPointsFromBounds(l.bound, l.shape);
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
        joint.angle = $event.target.value;
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

  linkageVisability() {
    if (LinkageTableComponent.linkageTable.style.visibility === 'visible') {
      LinkageTableComponent.linkageTable.style.visibility = 'hidden';
      LinkageTableComponent.visabilityButton.innerHTML = 'Show table';
    } else {
      LinkageTableComponent.linkageTable.style.visibility = 'visible';
      LinkageTableComponent.visabilityButton.innerHTML = 'Hide table';
    }
  }
}
