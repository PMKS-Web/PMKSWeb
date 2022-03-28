import {Component, Input, OnInit} from '@angular/core';
import {Force} from "../../model/force";
import {Link} from "../../model/link";
import {Joint} from "../../model/joint";

@Component({
  selector: 'app-linkage-table',
  templateUrl: './linkage-table.component.html',
  styleUrls: ['./linkage-table.component.css']
})
export class LinkageTableComponent implements OnInit {
  @Input() joints: Joint[] = [];
  @Input() links: Link[] = [];
  @Input() forces: Force[] = [];

  private static jointButton: SVGElement;
  private static linkButton: SVGElement;
  private static forceButton: SVGElement;

  selectedTab: number = 0;
  // private static selectedTab: number = 0;
  constructor() { }

  ngOnInit(): void {}

  ngAfterViewInit() {
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
        break;
      case 'y':
        joint.y = Number($event.target.value);
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
}
