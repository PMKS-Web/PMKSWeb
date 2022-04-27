import {AfterViewInit, Component, Input, OnInit} from '@angular/core';
import {Joint, RealJoint} from "../../model/joint";
import {Piston, Link, RealLink} from "../../model/link";
import {Force} from "../../model/force";
import {GridComponent} from "../grid/grid.component";
import * as XLSX from 'xlsx';
import {DatePipe} from "@angular/common";
import {ForceSolver} from "../../model/mechanism/force-solver";
import {Mechanism} from "../../model/mechanism/mechanism";
import {style} from "@angular/animations";

@Component({
  selector: 'app-analysis-popup',
  templateUrl: './analysis-popup.component.html',
  styleUrls: ['./analysis-popup.component.css']
})
export class AnalysisPopupComponent implements OnInit, AfterViewInit {
  @Input() joints: Joint[] = [];
  @Input() links: Link[] = [];
  @Input() forces: Force[] = [];
  @Input() mechanisms: Mechanism[] = [];
  @Input() gravity: boolean = false;
  @Input() unit: string = '';
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

  analysis: Array<Array<string>> = [];
  titleRow: Array<string> = [];

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

  updateTable(val: string, obj?: any) {
    switch (val) {
      case 'changeHeight':
        const element = document.getElementById('div_' + obj._id)!;
        const styleString = element.getAttribute('style')!;
        const heightIndex = styleString.indexOf('height');
        if (styleString.substring(heightIndex + 8, heightIndex + 8 + 4) === '50px') {
        element.setAttribute('style', 'overflow: scroll; height: 500px');
        } else {
        element.setAttribute('style', 'overflow: scroll; height: 50px');
        }
        break;
      default:
        return
    }
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
        const x_dist = link_center_x + (link_width / 2) + 25;
        const y_dist = link_center_y + (link_height / 2) + 30;
        // // const x_dist = 0;
        // const y_dist = 0;
        // TODO: Be sure to account for the force that is added on the link as well

        return 'translate(' + (x_dist) + ' ' + (y_dist) +  '), scale(' + this.scaleFactor + ')'
        // return 'translate(' + (this.gridOffset.x - center_cord) + ' ' + (this.gridOffset.y - center_cord) +  '), scale(' + this.scaleFactor + ')'
      // return 'translate(' + (this.gridOffset.x - center_cord + 60) + ' ' + (this.gridOffset.y - center_cord + 45) +  '), scale(' + this.scaleFactor + ')'
      case 'height':
        top = link.bound.b1.y;
        bot = link.bound.b3.y;
        return (Math.abs(top - bot) * this.scaleFactor) + (this.scaleFactor * 2 / 5) + 60;
      case 'width':
        left = link.bound.b1.x;
        right = link.bound.b2.x;
        return (Math.abs(right - left) * (this.scaleFactor)) + (this.scaleFactor * 2 / 5) + 50;
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

  exportExcel(analysisType: string): void {
    // first, determine what information will not be put within the table
    const includeMapIndex = new Map<number, boolean>();
    includeMapIndex.set(0, true); // time step number should be included
    let sub_increment: number;
    let condition: boolean;
    let increment = 1;
    switch (analysisType) {
      case 'loops':
        increment = 0;
        this.requiredLoopCheck ? includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        this.allLoopCheck ? includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        break;
      case 'statics':
        // determine whether to export force
        ForceSolver.resetVariables();
        ForceSolver.determineDesiredLoopLettersForce(this.mechanisms[0].requiredLoops);
        ForceSolver.determineForceAnalysis(this.joints, this.links, 'static', this.gravity,
          this.unit);
        this.titleRow = this.mechanisms[0].forceTitleRow(analysisType)!;
        this.analysis = this.mechanisms[0].forceAnalysis(analysisType)!;
        while (increment < (1 + (this.joints.length * 2))) {
          this.staticForcesCheck ? includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        }
        // determine whether to export torque
        this.staticTorqueCheck ? includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        // determine whether to leave space in between analyses
        ((this.staticForcesCheck || this.staticTorqueCheck) &&
          (this.staticForcePositionsCheck || this.staticJointPositionsCheck)) ?
          includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        // determine whether to export force positions
        while (increment < (1 + (this.joints.length * 2) + (1) + 1 +
          (this.forces.length * 2))) {
          this.staticForcePositionsCheck ? includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        }
        // determine whether to leave space in between analyses
        (this.staticForcePositionsCheck && this.staticJointPositionsCheck) ?
          includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        // determine whether to export joint positions
        while (increment < (1 + (this.joints.length * 2) + (1) + 1 +
          (this.forces.length * 2) + 1 + (this.joints.length * 2))) {
          this.staticJointPositionsCheck ? includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        }
        break;
      case 'dynamics':
        // check whether to put the internal force analysis occurring at joints
        while (increment < (1 + (this.joints.length * 2))) {
          this.dynamicForcesCheck ? includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        }
        // check whether to put the torque analysis occurring for mechanism
        this.dynamicTorqueCheck ? includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        // check whether to put space between analyses
        (this.dynamicForcesCheck || this.dynamicTorqueCheck) && (this.dynamicForcePositionsCheck || this.dynamicJointKinematicsCheck ||
          this.dynamicLinkKinematicsCheck || this.dynamicAngLinkCheck) ?
          includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        // check whether to put force positions
        while (increment < (1 + (this.joints.length * 2) + (1) + 1 + (this.forces.length * 2))) {
          this.dynamicForcePositionsCheck ? includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        }
        // check whether to put space between analyses
        (this.dynamicForcePositionsCheck && (this.dynamicJointKinematicsCheck ||
          this.dynamicLinkKinematicsCheck || this.dynamicAngLinkCheck)) ?
          includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);

        sub_increment = 0;
        // check whether linear kinematics for joints (p,v,a) have been asked for
        while (increment < (1 + (this.joints.length * 2) + (1) + 1 + (this.forces.length * 2) + 1 +
          (this.joints.length * 6))) {
          if (this.dynamicJointKinematicsCheck) {
            switch (sub_increment % 6) {
              case 0:
                condition = this.dynamicLinKinJointPos;
                break;
              case 1:
                condition = this.dynamicLinKinJointPos;
                break;
              case 2:
                condition = this.dynamicLinKinJointVel;
                break;
              case 3:
                condition = this.dynamicLinKinJointVel;
                break;
              case 4:
                condition = this.dynamicLinKinJointAcc;
                break;
              case 5:
                condition = this.dynamicLinKinJointAcc;
                break;
              default:
                return;
            }
            includeMapIndex.set(increment++, condition);
          } else {
            includeMapIndex.set(increment++, false);
          }
          sub_increment++;
        }
        // check whether to add another space or not between analyses
        (this.dynamicJointKinematicsCheck && (this.dynamicLinkKinematicsCheck || this.dynamicAngLinkCheck)) ?
          includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        // check whether linear kinematics for links have been asked for
        sub_increment = 0;
        while (increment < (1 + (this.joints.length * 2) + (1) + 1 + (this.forces.length * 2) + 1 +
          (this.joints.length * 6) + 1 + (this.links.length * 6))) {
          if (this.dynamicLinkKinematicsCheck) {
            switch (sub_increment % 6) {
              case 0:
                condition = this.dynamicLinKinLinkPos;
                break;
              case 1:
                condition = this.dynamicLinKinLinkPos;
                break;
              case 2:
                condition = this.dynamicLinKinLinkVel;
                break;
              case 3:
                condition = this.dynamicLinKinLinkVel;
                break;
              case 4:
                condition = this.dynamicLinKinLinkAcc;
                break;
              case 5:
                condition = this.dynamicLinKinLinkAcc;
                break;
              default:
                return
            }
            includeMapIndex.set(increment++, condition);
          } else {
            includeMapIndex.set(increment++, false);
          }
          sub_increment++;
        }
        // account for empty space
        (this.dynamicLinkKinematicsCheck && this.dynamicAngLinkCheck) ?
          includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        sub_increment = 0;
        // check whether angular kinematics have been asked for
        while (increment < (1 + (this.joints.length * 2) + (1) + 1 + (this.forces.length * 2) + 1 +
          (this.joints.length * 6) + 1 + (this.links.length * 6) + 1 + (this.links.length * 3))) {
          if (this.dynamicAngLinkCheck) {
            switch (sub_increment % 3) {
              case 0:
                condition = this.dynamicAngKinLinkPos;
                break;
              case 1:
                condition = this.dynamicAngKinLinkVel;
                break;
              case 2:
                condition = this.dynamicAngKinLinkAcc;
                break;
              default:
                return
            }
            includeMapIndex.set(increment++, condition);
          } else {
            includeMapIndex.set(increment++, false);
          }
          sub_increment++;
        }
        break;
      case 'kinematics_loops':
        // check whether linear kinematics for joints have been asked for
        while (increment < (1 + (this.joints.length * 6))) {
          if (this.linKinJointCheck) {
            switch (increment % 6) {
              case 0:
                condition = this.linKinJointAcc;
                break;
              case 1:
                condition = this.linKinJointPos;
                break;
              case 2:
                condition = this.linKinJointPos;
                break;
              case 3:
                condition = this.linKinJointVel;
                break;
              case 4:
                condition = this.linKinJointVel;
                break;
              case 5:
                condition = this.linKinJointAcc;
                break;
              default:
                return
            }
            includeMapIndex.set(increment++, condition);
          } else {
            includeMapIndex.set(increment++, false);
          }
        }
        // check whether to add another space or not between analyses
        (this.linKinJointCheck && (this.linKinLinkCheck || this.dynamicAngLinkCheck)) ?
          includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        // check whether linear kinematics for links have been asked for
        while (increment < (1 + (this.joints.length * 6) + 1 + (this.links.length * 6))) {
          if (this.linKinLinkCheck) {
            switch (increment % 6) {
              case 0:
                condition = this.linKinLinkAcc;
                break;
              case 1:
                condition = this.linKinLinkAcc;
                break;
              case 2:
                condition = this.linKinLinkPos;
                break;
              case 3:
                condition = this.linKinLinkPos;
                break;
              case 4:
                condition = this.linKinLinkVel;
                break;
              case 5:
                condition = this.linKinLinkVel;
                break;
              default:
                return
            }
            includeMapIndex.set(increment++, condition);
          } else {
            includeMapIndex.set(increment++, false);
          }
        }
        // account for empty space
        (this.linKinLinkCheck && this.dynamicAngLinkCheck) ?
          includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        // check whether angular kinematics have been asked for
        sub_increment = 0;
        while (increment < (1 + (this.joints.length * 6) + 1 + (this.links.length * 6) + 1 + (this.links.length * 3))) {
          if (this.dynamicAngLinkCheck) {
            switch (sub_increment % 3) {
              case 0:
                condition = this.angKinLinkPos;
                break;
              case 1:
                condition = this.angKinLinkVel;
                break;
              case 2:
                condition = this.angKinLinkAcc;
                break;
              default:
                return
            }
            includeMapIndex.set(increment++, condition);
          } else {
            includeMapIndex.set(increment++, false);
          }
          sub_increment++;
        }
        break;
//       case 'kinematics_ic':
//
//         // check whether to export position of ICs
//         while (increment < (1 + (this.icArray.length * 2))) {
//           this.icPositionsCheck ? includeMapIndex.set(increment++, true) : includeMapIndex.set(increment, false);
//         }
//         // check whether to put space in between analyses
//         (this.icPositionsCheck && (this.linKinJointICCheck || this.angKinLinkICCheck)) ?
//           includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
//         // check whether linear kinematics for joints have been asked for
//         sub_increment = 0;
//         while (increment < (1 + (this.icArray.length * 2) + 1 + (this.jointArray.length * 2))) {
//           if (this.linKinJointICCheck) {
//             switch (sub_increment % 4) {
//               case 0:
//                 condition = this.linKinJointICPos;
//                 break;
//               case 1:
//                 condition = this.linKinJointICPos;
//                 break;
//               case 2:
//                 condition = this.linKinJointICVel;
//                 break;
//               case 3:
//                 condition = this.linKinJointICVel;
//                 break;
//             }
//             includeMapIndex.set(increment++, condition);
//           } else {
//             includeMapIndex.set(increment++, false);
//           }
//           sub_increment++;
//         }
// // check whether to add another space or not between analyses
//         (this.linKinJointICCheck && this.angKinLinkICCheck) ?
//           includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
// // check Kin Lin Velocities
//         sub_increment = 0;
//         while (increment < (1 + (this.icArray.length * 2) + 1 + (this.jointArray.length * 2) + 1 + (this.linkArray.length * 2))) {
//           if (this.angKinLinkICCheck) {
//             switch (sub_increment % 2) {
//               // TODO: Be sure to account for angular displacement
//               // case 0:
//               //   condition = this.angKinLinkICPos
//               case 0:
//                 condition = this.angKinLinkICVel;
//                 break;
//               case 1:
//                 condition = this.angKinLinkICVel;
//                 break;
//             }
//             includeMapIndex.set(increment++, condition);
//           } else {
//             includeMapIndex.set(increment++, false);
//           }
//           sub_increment++;
//         }
//         break;








//           (this.linKinJointICCheck && this.linKinJointICVel) ?
//             includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
//         }
// // account for empty space
//         ((this.linKinLinkCheck && this.linKinLinkICVel) && (this.angKinLinkICCheck)) ?
//           includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
// // check whether angular kinematics have been asked for
//
//         while (increment < (1 + (this.icArray.length * 2) + 1 + (this.icArray.length * 2) + 1
//           + (this.linkArray.length * 2))) {
//           (this.angKinLinkICCheck && this.angKinLinkICVel) ?
//             includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
//         }
//         break;
    }
    // const tbl = document.getElementById('Excel-Table');
    const tbl = document.createElement('div');
    // while (tbl.firstChild) {
    //   tbl.removeChild(tbl.lastChild);
    // }
    const table = document.createElement('table'); /*Create `table` element*/
    const rows = this.analysis.length;
    let cols: number;
    if (this.analysis.length === 0) {
      cols = 0;
    } else {
      cols = this.analysis[0].length;
    }
    // const cols = this.analysis[0].length;
    const statTitle = document.createElement('tr');
    for (let i = 0; i < cols; i++) {
      // have a map here to check whether to consider this element or not
      if (!includeMapIndex.get(i)) {
        continue;
      }
      const td = document.createElement('td');
      const cellText = document.createTextNode('\t' + this.titleRow[i]);
      td.appendChild(cellText);
      statTitle.appendChild(td);
    }
    table.appendChild(statTitle);
    for (let i = 0; i < rows; i++) {
      const tr = document.createElement('tr');                 /*Create `tr` element*/
      for (let j = 0; j < cols; j++) {
        // have a map here to check whether to consider this element or not
        if (!includeMapIndex.get(j)) {
          continue;
        }
        const arr = this.analysis[i][j];
        const td = document.createElement('td');             /*Create `td` element*/
        const cellText = document.createTextNode('\t' + arr.toString());   /*Create text for `td` element*/
        td.appendChild(cellText);                          /*Append text to `td` element*/
        tr.appendChild(td);                                /*Append `td` to `tr` element*/
      }
      table.appendChild(tr);                                 /*Append `tr` to `table` element*/
    }
    tbl.appendChild(table);
    // /* table id is passed over here */
    // const element = document.getElementById('StaticExcel-Table');
    // const ws: XLSX.WorkSheet = XLSX.utils.table_to_sheet(element);
    const ws: XLSX.WorkSheet = XLSX.utils.table_to_sheet(tbl);


    /* generate workbook and add the worksheet */
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const date = Date.now();
    const datepipe: DatePipe = new DatePipe('en-US');
    const formattedDate = datepipe.transform(date, 'dd-MMM HH:mm:ss');

    const fileName = analysisType + 'Joints Links' + formattedDate + '.xlsx'
    // this.fileName = analysisType + this.numJointsAndLinks[0] + 'Joints' + this.numJointsAndLinks[1] + 'Links' +
    //   formattedDate + '.xlsx';
    /* save to file*/
    XLSX.writeFile(wb, fileName);
    // XLSX.writeFile(wb, this.fileName);
  }

  forceSelectedCheckbox(link: Link) {
    const element = document.getElementById('checkbox_' + link.id)! as any;
    return element.checked;
  }
}
