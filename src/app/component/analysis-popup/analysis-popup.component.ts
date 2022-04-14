import {AfterViewInit, Component, Input, OnInit} from '@angular/core';
import {Joint, RealJoint} from "../../model/joint";
import {ImagLink, Link, RealLink} from "../../model/link";
import {Force} from "../../model/force";
import {GridComponent} from "../grid/grid.component";

@Component({
  selector: 'app-analysis-popup',
  templateUrl: './analysis-popup.component.html',
  styleUrls: ['./analysis-popup.component.css']
})
export class AnalysisPopupComponent implements OnInit, AfterViewInit {
  @Input() joints: Joint[] = [];
  @Input() links: Link[] = [];
  @Input() forces: Force[] = [];
  @Input() gridOffset: { x: number, y: number } = {x: 0, y: 0};
  @Input() scaleFactor: number = 50;
  private static popUpWindow: SVGElement;
  private static exportButton: SVGElement;
  private static showPlotsButton: SVGElement;
  private static showEqsButton: SVGElement;
  selectedTab: number = 0;
  selectedAnalysis: string = '';

  // TODO: Possibly come up with new way to have this logic...
  // utilizedLoops: string;
  staticForcesCheck: boolean = false;
  staticTorqueCheck: boolean = false;
  dynamicForcesCheck: boolean = false;
  dynamicTorqueCheck: boolean = false;

  linKinJointCheck: boolean = false;
  linKinJointPos: boolean = false;
  linKinJointVel: boolean = false;
  linKinJointAcc: boolean = false;
  linKinLinkCheck: boolean = false;
  dynamicAngLinkCheck: boolean = false;

  linKinLinkPos: boolean = false;
  linKinLinkVel: boolean = false;
  linKinLinkAcc: boolean = false;
  angKinLinkPos: boolean = false;
  angKinLinkVel: boolean = false;
  angKinLinkAcc: boolean = false;

  icPositionsCheck: boolean = false;
  linKinJointICCheck: boolean = false;
  linKinJointICPos: boolean = false;
  linKinJointICVel: boolean = false;
  linKinLinkICPos: boolean = false;
  linKinLinkICVel: boolean = false;
  angKinLinkICCheck: boolean = false;
  angKinLinkCheck: boolean = false;
  angKinLinkICPos: boolean = false;
  angKinLinkICVel: boolean = false;

  staticJointPositionsCheck: boolean = false;
  staticForcePositionsCheck: boolean = false;
  dynamicForcePositionsCheck: boolean = false;
  dynamicJointKinematicsCheck: boolean = false;
  dynamicLinkKinematicsCheck: boolean = false;

  // dynamicJointPositionsCheck: boolean;
  // dynamicLinkPositionsCheck: boolean;
  // dynamicJointVelocityCheck: boolean;
  // dynamicLinkVelocityCheck: boolean;
  // dynamicJointAccelerationCheck: boolean;
  // dynamicLinkAccelerationCheck: boolean;

  dynamicLinKinJointPos: boolean = false;
  dynamicLinKinJointVel: boolean = false;
  dynamicLinKinJointAcc: boolean = false;

  dynamicLinKinLinkPos: boolean = false;
  dynamicLinKinLinkVel: boolean = false;
  dynamicLinKinLinkAcc: boolean = false;

  dynamicAngKinLinkPos: boolean = false;
  dynamicAngKinLinkVel: boolean = false;
  dynamicAngKinLinkAcc: boolean = false;

  allLoopCheck: boolean = false;
  requiredLoopCheck: boolean = false;

  constructor() {
  }

  ngOnInit(): void {
  }

  ngAfterViewInit(): void {
    AnalysisPopupComponent.popUpWindow = document.getElementById('analysisPopup') as unknown as SVGElement;
    AnalysisPopupComponent.exportButton = document.getElementById('exportButton') as unknown as SVGElement;
    AnalysisPopupComponent.showPlotsButton = document.getElementById('showPlotsButton') as unknown as SVGElement;
    AnalysisPopupComponent.showEqsButton = document.getElementById('showEqsButton') as unknown as SVGElement;
  }

  showAnalysis($event: string) {
    AnalysisPopupComponent.popUpWindow.style.display = 'block';
    this.selectedAnalysis = $event;
  }

  closeAnalysis() {
    AnalysisPopupComponent.popUpWindow.style.display = 'none';
  }


  setTab(tabNum: number) {
    this.selectedTab = tabNum;
    // TODO: If possible, put this as hover within css
    switch (tabNum) {
      case 0:
        AnalysisPopupComponent.exportButton.setAttribute('style',
          'color: black; background-color: gray');
        AnalysisPopupComponent.showPlotsButton.setAttribute('style',
          'color: gray; background-color: white');
        AnalysisPopupComponent.showEqsButton.setAttribute('style',
          'color: gray; background-color: white');
        break;
      case 1:
        AnalysisPopupComponent.exportButton.setAttribute('style',
          'color: gray; background-color: white');
        AnalysisPopupComponent.showPlotsButton.setAttribute('style',
          'color: black; background-color: gray');
        AnalysisPopupComponent.showEqsButton.setAttribute('style',
          'color: gray; background-color: white');
        break;
      case 2:
        AnalysisPopupComponent.exportButton.setAttribute('style',
          'color: gray; background-color: white');
        AnalysisPopupComponent.showPlotsButton.setAttribute('style',
          'color: gray; background-color: white');
        AnalysisPopupComponent.showEqsButton.setAttribute('style',
          'color: black; background-color: gray');
        break;
    }
  }

  mouseOver(number: number) {

  }

  mouseOut(number: number) {

  }

  setOption(e: any) {
    // TODO: Figure out what is e's type?
    switch (e.target.value) {
      // kinematics section
      // kin for joints
      case 'linKinJointCheck':
        this.linKinJointCheck = !this.linKinJointCheck;
        break;
      case 'linKinJointPos':
        this.linKinJointPos = !this.linKinJointPos;
        break;
      case 'linKinJointVel':
        this.linKinJointVel = !this.linKinJointVel;
        break;
      case 'linKinJointAcc':
        this.linKinJointAcc = !this.linKinJointAcc;
        break;
      // kin for linear links
      case 'linKinLinkCheck':
        this.linKinLinkCheck = !this.linKinLinkCheck;
        break;
      case 'linKinLinkPos':
        this.linKinLinkPos = !this.linKinLinkPos;
        break;
      case 'linKinLinkVel':
        this.linKinLinkVel = !this.linKinLinkVel;
        break;
      case 'linKinLinkAcc':
        this.linKinLinkAcc = !this.linKinLinkAcc;
        break;
      // kin for angular links
      case 'angKinLinkCheck':
        this.angKinLinkCheck = !this.angKinLinkCheck;
        break;
      case 'angKinLinkPos':
        this.angKinLinkPos = !this.angKinLinkPos;
        break;
      case 'angKinLinkVel':
        this.angKinLinkVel = !this.angKinLinkVel;
        break;
      case 'angKinLinkAcc':
        this.angKinLinkAcc = !this.angKinLinkAcc;
        break;
      ///////////////////////////
      // check for statics
      case 'staticForcesCheck':
        this.staticForcesCheck = !this.staticForcesCheck;
        break;
      case 'staticTorqueCheck':
        this.staticTorqueCheck = !this.staticTorqueCheck;
        break;
      case 'staticForcePositionsCheck':
        this.staticForcePositionsCheck = !this.staticForcePositionsCheck;
        break;
      case 'staticJointPositionsCheck':
        this.staticJointPositionsCheck = !this.staticJointPositionsCheck;
        break;
      ///////////////
      // check for dynamics
      case 'dynamicForcesCheck':
        this.dynamicForcesCheck = !this.dynamicForcesCheck;
        break;
      case 'dynamicTorqueCheck':
        this.dynamicTorqueCheck = !this.dynamicTorqueCheck;
        break;
      case 'dynamicForcePositionsCheck':
        this.dynamicForcePositionsCheck = !this.dynamicForcePositionsCheck;
        break;
      case 'dynamicJointKinematicsCheck':
        this.dynamicJointKinematicsCheck = !this.dynamicJointKinematicsCheck;
        break;
      case 'dynamicLinKinJointPos':
        this.dynamicLinKinJointPos = !this.dynamicLinKinJointPos;
        break;
      case 'dynamicLinKinJointVel':
        this.dynamicLinKinJointVel = !this.dynamicLinKinJointVel;
        break;
      case 'dynamicLinKinJointAcc':
        this.dynamicLinKinJointAcc = !this.dynamicLinKinJointAcc;
        break;

      case 'dynamicLinkKinematicsCheck':
        this.dynamicLinkKinematicsCheck = !this.dynamicLinkKinematicsCheck;
        break;
      case 'dynamicLinKinLinkPos':
        this.dynamicLinKinLinkPos = !this.dynamicLinKinLinkPos;
        break;
      case 'dynamicLinKinLinkVel':
        this.dynamicLinKinLinkVel = !this.dynamicLinKinLinkVel;
        break;
      case 'dynamicLinKinLinkAcc':
        this.dynamicLinKinLinkAcc = !this.dynamicLinKinLinkAcc;
        break;

      case 'dynamicAngLinkCheck':
        this.dynamicAngLinkCheck = !this.dynamicAngLinkCheck;
        break;
      case 'dynamicAngKinLinkPos':
        this.dynamicAngKinLinkPos = !this.dynamicAngKinLinkPos;
        break;
      case 'dynamicAngKinLinkVel':
        this.dynamicAngKinLinkVel = !this.dynamicAngKinLinkVel;
        break;
      case 'dynamicAngKinLinkAcc':
        this.dynamicAngKinLinkAcc = !this.dynamicAngKinLinkAcc;
        break;
      /////////
      // check for IC
      case 'icPositionsCheck':
        this.icPositionsCheck = !this.icPositionsCheck;
        break;
      case 'linKinJointICCheck':
        this.linKinJointICCheck = !this.linKinJointICCheck;
        break;
      case 'linKinJointICPos':
        this.linKinJointICPos = !this.linKinJointICPos;
        break;
      case 'linKinJointICVel':
        this.linKinJointICVel = !this.linKinJointICVel;
        break;

      case 'angKinLinkICCheck':
        this.angKinLinkICCheck = !this.angKinLinkICCheck;
        break;
      case 'angKinLinkICPos':
        this.angKinLinkICPos = !this.angKinLinkICPos;
        break;
      case 'angKinLinkICVel':
        this.angKinLinkICVel = !this.angKinLinkICVel;
        break;
      ////////////
      // check for loops
      case 'allLoopCheck':
        this.allLoopCheck = !this.allLoopCheck;
        break;
      case 'requiredLoopCheck':
        this.requiredLoopCheck = !this.requiredLoopCheck;
        break;
    }
  }

  getLinkProp(link: Link, propType: string) {
    // if (l instanceof ImagLink) {
    //   return
    // }
    if (!(link instanceof RealLink)) {return}
    let top: number;
    let bot: number;
    let left: number;
    let right: number;
    let center_cord: number;
    // const link = l as RealLink;
    switch (propType) {
      case 'd':
        return link.d;
      case 'fill':
        return link.fill;
        // translate not used, can delete
      case 'translate':
        left = link.bound.b1.x;
        bot = link.bound.b1.y;
        // TODO: Figure out way to simplify this later
        if (link.bound.b2.x < left) {
          left = link.bound.b2.x;
        }
        if (link.bound.b3.x < left) {
          left = link.bound.b3.x;
        }
        if (link.bound.b4.x < left) {
          left = link.bound.b4.x;
        }
        if (link.bound.b2.y < bot) {
          bot = link.bound.b2.y;
        }
        if (link.bound.b3.y < bot) {
          bot = link.bound.b3.y;
        }
        if (link.bound.b4.y < bot) {
          bot = link.bound.b4.y;
        }
        center_cord = (this.scaleFactor * left) + this.gridOffset.x;
        return 'translate(' + (this.gridOffset.x - center_cord) + ' ' + (this.gridOffset.y - center_cord) +  ')';
      case 'scale':
        return 'scale(' + this.scaleFactor + ')'
      case 'transform':
        left = link.bound.b1.x;
        bot = link.bound.b1.y;
        // TODO: Figure out way to simplify this later
        if (link.bound.b2.x < left) {
          left = link.bound.b2.x;
        }
        if (link.bound.b3.x < left) {
          left = link.bound.b3.x;
        }
        if (link.bound.b4.x < left) {
          left = link.bound.b4.x;
        }
        if (link.bound.b2.y < bot) {
          bot = link.bound.b2.y;
        }
        if (link.bound.b3.y < bot) {
          bot = link.bound.b3.y;
        }
        if (link.bound.b4.y < bot) {
          bot = link.bound.b4.y;
        }
        center_cord = (this.scaleFactor * left) + this.gridOffset.x;


        top = link.bound.b1.y;
        bot = link.bound.b3.y;
        const link_height =  (Math.abs(top - bot) * this.scaleFactor) + (this.scaleFactor * 2 / 5);
        left = link.bound.b1.x;
        right = link.bound.b2.x;
        const link_width = (Math.abs(right - left) * (this.scaleFactor)) + (this.scaleFactor * 2 / 5);
        // TODO: Need scale factor?? Or does this need to be 1 / AppConstants.scaleFactor?
        // TODO: Make sure that the conversion for screen grid matches
        // const link_center_x = ((link.bound.b1.x + link.bound.b3.x) / 2) * (1 / AppConstants.scaleFactor);
        // const link_center_y = ((link.bound.b1.y + link.bound.b3.y) / 2) * (1 / AppConstants.scaleFactor);
        // const link_center_x = ((link.bound.b1.x + link.bound.b3.x) / 2) * -50;
        // const link_center_y = ((link.bound.b1.y + link.bound.b3.y) / 2) * -50;
        const link_center_x = ((link.bound.b1.x + link.bound.b3.x) / 2) * (-1 * GridComponent.scaleFactor);
        const link_center_y = ((link.bound.b1.y + link.bound.b3.y) / 2) * (-1 * GridComponent.scaleFactor);
        // const link_center_x = 0;
        // const link_center_y = 0;
        // const grid_center_x =
        // const dist_from_center_x = link_center_x - ((1 / AppConstants.scaleFactor) * -1 * this.gridOffset.x);
        // const dist_from_center_y = link_center_y - ((1 / AppConstants.scaleFactor) * this.gridOffset.y);
        // const link_center_x = 0;
        // const link_center_y = 0;

        // const box = GridComponent.canvasSVGElement.getBoundingClientRect();
        // const grid_width = box.width;
        // const grid_height = box.height;
        // const grid_center_x = 528 - GridComponent._gridOffset.x;
        // const grid_center_y = 470.5 - GridComponent._gridOffset.y;
        // const grid_center_x = (528 - GridComponent._gridOffset.x) * AppConstants.scaleFactor;
        // const grid_center_y = (470.5 - GridComponent._gridOffset.y) * AppConstants.scaleFactor;
        // const x_dist = (grid_center_x - (link_width / 2)) * AppConstants.scaleFactor;
        // const y_dist = (grid_center_y - (link_height / 2)) * AppConstants.scaleFactor;
        // const x_dist = (grid_center_x - link_width) * AppConstants.scaleFactor;
        // const y_dist = (grid_center_y - link_height) * AppConstants.scaleFactor;
        // const x_dist = ((link_center_x - grid_center_x)) + (link_width / 2);
        // const y_dist = ((link_center_y - grid_center_y)) + (link_height / 2);
        // const x_dist = (grid_center_x - link_center_x) * AppConstants.scaleFactor;
        // const y_dist = (grid_center_y - link_center_y) * AppConstants.scaleFactor;
        // TODO: Each screen width and height are different. Be sure to pull screens dimensions
        // const x_dist = link_center_x + dist_from_center_x + (link_width / 2);
        // const y_dist = link_center_y + dist_from_center_y + (link_height / 2);
        const x_dist = link_center_x + (link_width / 2);
        const y_dist = link_center_y + (link_height / 2);
        // // const x_dist = 0;
        // const y_dist = 0;

        return 'translate(' + (x_dist) + ' ' + (y_dist) +  '), scale(' + this.scaleFactor + ')'
        // return 'translate(' + (this.gridOffset.x - center_cord) + ' ' + (this.gridOffset.y - center_cord) +  '), scale(' + this.scaleFactor + ')'
      // return 'translate(' + (this.gridOffset.x - center_cord + 60) + ' ' + (this.gridOffset.y - center_cord + 45) +  '), scale(' + this.scaleFactor + ')'
      case 'height':
        top = link.bound.b1.y;
        bot = link.bound.b3.y;
        return (Math.abs(top - bot) * this.scaleFactor) + (this.scaleFactor * 2 / 5);
      case 'width':
        left = link.bound.b1.x;
        right = link.bound.b2.x;
        return (Math.abs(right - left) * (this.scaleFactor)) + (this.scaleFactor * 2 / 5);
      default:
        return '?';
    }
  }

  getJointProp(joint: any, propType: string) {
    // TODO: Make sure joint is of type Joint and not any
    if (joint === undefined) {
      return 0;
    }
    switch (propType) {
      case 'ring':
        if (!(joint instanceof RealJoint)) {return}
        return joint.r;
      case 'r':
        if (!(joint instanceof RealJoint)) {return}
        return joint.r * 7 / 5;
      default:
        return;
    }
  }
}
