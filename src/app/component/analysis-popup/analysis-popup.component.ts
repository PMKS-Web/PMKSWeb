import {AfterViewInit, Component, OnInit, ViewChild} from '@angular/core';
import {Joint, RealJoint, RevJoint} from "../../model/joint";
import {Link, RealLink} from "../../model/link";
import {Force} from "../../model/force";
import {GridComponent} from "../grid/grid.component";
import * as XLSX from 'xlsx';
import {DatePipe} from "@angular/common";
import {ForceSolver} from "../../model/mechanism/force-solver";
import {Coord} from "../../model/coord";
import {KinematicsSolver} from "../../model/mechanism/kinematic-solver";
import {ToolbarComponent} from "../toolbar/toolbar.component";
import {roundNumber} from "../../model/utils";
import {
  ChartComponent,
  ApexAxisChartSeries,
  ApexChart,
  ApexXAxis,
  ApexYAxis,
  ApexDataLabels,
  ApexGrid,
  ApexStroke,
  ApexTitleSubtitle
} from "ng-apexcharts";
import {AbstractFormGroupDirective} from "@angular/forms";

export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  dataLabels: ApexDataLabels
  grid: ApexGrid
  stroke: ApexStroke
  title: ApexTitleSubtitle;
};

@Component({
  selector: 'app-analysis-popup',
  templateUrl: './analysis-popup.component.html',
  styleUrls: ['./analysis-popup.component.css']
})

export class AnalysisPopupComponent implements OnInit, AfterViewInit {

  // https://apexcharts.com/docs/angular-charts/
  public chartOptions: Partial<ChartOptions> = {};

  private static popUpWindow: SVGElement;
  private static exportButton: SVGElement;
  private static showPlotsButton: SVGElement;
  private static showEqsButton: SVGElement;
  static selectedTab: number = 0;
  static selectedAnalysis: string = '';

  static firstRefWithinMomentMap = new Map<string, string>();

  // TODO: Possibly come up with new way to have this logic...
  // utilizedLoops: string;
  staticForcesCheck: boolean = true;
  staticTorqueCheck: boolean = true;
  dynamicForcesCheck: boolean = true;
  dynamicTorqueCheck: boolean = true;

  linKinJointCheck: boolean = true;
  linKinJointPos: boolean = true;
  linKinJointVel: boolean = true;
  linKinJointAcc: boolean = true;
  linKinLinkCheck: boolean = true;
  dynamicAngLinkCheck: boolean = true;

  linKinLinkPos: boolean = true;
  linKinLinkVel: boolean = true;
  linKinLinkAcc: boolean = true;
  angKinLinkPos: boolean = true;
  angKinLinkVel: boolean = true;
  angKinLinkAcc: boolean = true;

  icPositionsCheck: boolean = true;
  linKinJointICCheck: boolean = true;
  linKinJointICPos: boolean = true;
  linKinJointICVel: boolean = true;
  linKinLinkICPos: boolean = true;
  linKinLinkICVel: boolean = true;
  angKinLinkICCheck: boolean = true;
  angKinLinkCheck: boolean = true;
  angKinLinkICPos: boolean = true;
  angKinLinkICVel: boolean = true;

  staticJointPositionsCheck: boolean = true;
  staticForcePositionsCheck: boolean = true;
  dynamicForcePositionsCheck: boolean = true;
  dynamicJointKinematicsCheck: boolean = true;
  dynamicLinkKinematicsCheck: boolean = true;

  // dynamicJointPositionsCheck: boolean;
  // dynamicLinkPositionsCheck: boolean;
  // dynamicJointVelocityCheck: boolean;
  // dynamicLinkVelocityCheck: boolean;
  // dynamicJointAccelerationCheck: boolean;
  // dynamicLinkAccelerationCheck: boolean;

  dynamicLinKinJointPos: boolean = true;
  dynamicLinKinJointVel: boolean = true;
  dynamicLinKinJointAcc: boolean = true;

  dynamicLinKinLinkPos: boolean = true;
  dynamicLinKinLinkVel: boolean = true;
  dynamicLinKinLinkAcc: boolean = true;

  dynamicAngKinLinkPos: boolean = true;
  dynamicAngKinLinkVel: boolean = true;
  dynamicAngKinLinkAcc: boolean = true;

  allLoopCheck: boolean = true;
  requiredLoopCheck: boolean = true;

  analysis: Array<Array<string>> = [];
  titleRow: Array<string> = [];

  forceAnalysis = {
    selectedAnalysis: 'none'
  };

  forceMagPlot = {
    force: 'none'
  };

  jointAnalyses = [
    {id: 'Joint Forces', label: 'Joint Forces'},
    {id: 'Input Torque', label: 'Input Torque'},
    // {id: 'force_position', label: 'force_position'},
    // {id: 'joint_position', label: 'joint_position'},
    // { id: 'position', label: 'position'},
    // { id: 'velocity', label: 'velocity'},
    // { id: 'acceleration', label: 'acceleration'},
  ];

  showChart = false;

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

  static showAnalysis(analysis: string) {
    AnalysisPopupComponent.popUpWindow.style.display = 'block';
    AnalysisPopupComponent.selectedAnalysis = analysis;
    // TODO: When choosing an analysis, only here should one reset the static variables...
  }

  closeAnalysis() {
    AnalysisPopupComponent.popUpWindow.style.display = 'none';
  }

  getSelectedAnalysis() {
    return AnalysisPopupComponent.selectedAnalysis;
  }

  getSelectedTab() {
    return AnalysisPopupComponent.selectedTab;
  }

  updateTable(val: string, link?: Link, jointOrCoM?: any) {
    let otherLink: Link;
    switch (val) {
      case 'changeHeight':
        const element = document.getElementById('div_' + link!.id)!;
        const styleString = element.getAttribute('style')!;
        const heightIndex = styleString.indexOf('height');
        if (styleString.substring(heightIndex + 8, heightIndex + 8 + 4) === '50px') {
          element.setAttribute('style', 'margin: 4px; padding: 4px; height: 500px; width: 500px; overflow: scroll; text-align: justify; display: block');
          for (let htmlIndex = 2; htmlIndex < element.children.length; htmlIndex++) {
            const SVGElement = element.children[htmlIndex] as SVGElement;
            SVGElement.style.display = 'block';
          }
        } else {
          element.setAttribute('style', 'margin: 4px; padding: 4px; height: 50px; width: 500px; overflow: scroll; text-align: justify; display: block"');
          for (let htmlIndex = 2; htmlIndex < element.children.length; htmlIndex++) {
            const SVGElement = element.children[htmlIndex] as SVGElement;
            SVGElement.style.display = 'none';
          }
          //   element.setAttribute('style', 'overflow: scroll; height: 500px');
          // } else {
          //   element.setAttribute('style', 'overflow: scroll; height: 50px');
        }
        break;
      case 'x':
        if (!(jointOrCoM instanceof RealJoint)) {return}
        otherLink = jointOrCoM.links[0].id === link!.id ? jointOrCoM.links[1] : jointOrCoM.links[0];
        if (otherLink === undefined) {otherLink = new Link('', []);}
        ForceSolver.jointPositiveForceXLinkMap.get(jointOrCoM!.id) === link!.id ? ForceSolver.jointPositiveForceXLinkMap.set(jointOrCoM!.id, otherLink.id) : ForceSolver.jointPositiveForceXLinkMap.set(jointOrCoM!.id, link!.id);
        ForceSolver.determineForceAnalysis(GridComponent.joints, GridComponent.links, 'static',
          ToolbarComponent.gravity, ToolbarComponent.unit);
        break;
      case 'y':
        if (!(jointOrCoM instanceof RealJoint)) {return}
        otherLink = jointOrCoM.links[0].id === link!.id ? jointOrCoM.links[1] : jointOrCoM.links[0];
        if (otherLink === undefined) {otherLink = new Link('', []);}
        ForceSolver.jointPositiveForceYLinkMap.get(jointOrCoM!.id) === link!.id ? ForceSolver.jointPositiveForceYLinkMap.set(jointOrCoM!.id, otherLink.id) : ForceSolver.jointPositiveForceYLinkMap.set(jointOrCoM!.id, link!.id);
        ForceSolver.determineForceAnalysis(GridComponent.joints, GridComponent.links, 'static',
          ToolbarComponent.gravity, ToolbarComponent.unit);
        break;
      case 'moment':
        let value = jointOrCoM;
        if (value === 'com') {value = link!.id}
        AnalysisPopupComponent.firstRefWithinMomentMap = new Map<string, string>();
        ForceSolver.linkToFixedPositionMap.set(link!.id, value);
        link!.fixedLocation.fixedPoint = value;
        ForceSolver.determineForceAnalysis(GridComponent.joints, GridComponent.links, 'static',
          ToolbarComponent.gravity, ToolbarComponent.unit);
        break;
      default:
        return
    }
  }


  setTab(tabNum: number) {
    AnalysisPopupComponent.selectedTab = tabNum;
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
        switch (AnalysisPopupComponent.selectedAnalysis) {
          case 'loop':
            break;
          case 'force':
            // ForceSolver.resetVariables();
            ForceSolver.determineDesiredLoopLettersForce(GridComponent.mechanisms[0].requiredLoops);
            ForceSolver.determineForceAnalysis(GridComponent.joints, GridComponent.links, 'static',
              ToolbarComponent.gravity, ToolbarComponent.unit);
            break;
          case 'kinematic':
            KinematicsSolver.resetVariables();
            KinematicsSolver.requiredLoops = GridComponent.mechanisms[0].requiredLoops;
            KinematicsSolver.determineKinematics(GridComponent.joints, GridComponent.links, ToolbarComponent.inputAngularVelocity);
            break;
          case 'stress':
            break;
          case 'ics':
            break;
        }
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
        center_cord = (GridComponent.scaleFactor * left) + GridComponent.gridOffset.x;
        return 'translate(' + (GridComponent.gridOffset.x - center_cord) + ' ' + (GridComponent.gridOffset.y - center_cord) +  ')';
      case 'scale':
        return 'scale(' + GridComponent.scaleFactor + ')'
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
        center_cord = (GridComponent.scaleFactor * left) + GridComponent.gridOffset.x;


        top = link.bound.b1.y;
        if (Math.abs(link.bound.b2.y - top) < 0.001) {
          bot = link.bound.b4.y;
        } else {
          bot = link.bound.b2.y;
        }
        const link_height =  (Math.abs(top - bot) * GridComponent.scaleFactor) + (GridComponent.scaleFactor * 2 / 5);
        left = link.bound.b1.x;
        if (Math.abs(link.bound.b2.x - left) < 0.001) {
          right = link.bound.b4.x;
        } else {
          right = link.bound.b2.x;
        }
        const link_width = (Math.abs(right - left) * GridComponent.scaleFactor) + (GridComponent.scaleFactor * 2 / 5);
        // TODO: Need scale factor?? Or does this need to be 1 / AppConstants.scaleFactor?
        // TODO: Make sure that the conversion for screen grid matches
        // const link_center_x = ((link.bound.b1.x + link.bound.b3.x) / 2) * (1 / AppConstants.scaleFactor);
        // const link_center_y = ((link.bound.b1.y + link.bound.b3.y) / 2) * (1 / AppConstants.scaleFactor);
        // const link_center_x = ((link.bound.b1.x + link.bound.b3.x) / 2) * -50;
        // const link_center_y = ((link.bound.b1.y + link.bound.b3.y) / 2) * -50;
        const link_center_x = ((left + right) / 2) * (-1 * GridComponent.scaleFactor);
        const link_center_y = ((top + bot) / 2) * (-1 * GridComponent.scaleFactor);
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

        return 'translate(' + (x_dist) + ' ' + (y_dist) +  '), scale(' + GridComponent.scaleFactor + ')'
      // return 'translate(' + (this.gridOffset.x - center_cord) + ' ' + (this.gridOffset.y - center_cord) +  '), scale(' + this.scaleFactor + ')'
      // return 'translate(' + (this.gridOffset.x - center_cord + 60) + ' ' + (this.gridOffset.y - center_cord + 45) +  '), scale(' + this.scaleFactor + ')'
      case 'height':
        top = link.bound.b1.y;
        if (Math.abs(link.bound.b2.y - top) < 0.1) {
          bot = link.bound.b4.y;
        } else {
          bot = link.bound.b2.y;
        }
        return (Math.abs(top - bot) * GridComponent.scaleFactor) + (GridComponent.scaleFactor * 2 / 5) + 60;
      case 'width':
        left = link.bound.b1.x;
        if (Math.abs(link.bound.b2.x - left) < 0.001) {
          right = link.bound.b4.x;
        } else {
          right = link.bound.b2.x;
        }
        return (Math.abs(right - left) * GridComponent.scaleFactor) + (GridComponent.scaleFactor * 2 / 5) + 50;
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

  getForceLine(joint: Joint, dir: string, xOrY: string) {
    switch (dir) {
      case 'pos':
        if (xOrY === 'x') {
          return Force.createForceLine(joint, new Coord(joint.x + 0.7, joint.y));
        } else {
          return Force.createForceLine(joint, new Coord(joint.x, joint.y + 0.7));
        }
      case 'neg':
        if (xOrY === 'x') {
          return Force.createForceLine(joint, new Coord(joint.x - 0.7, joint.y));
        } else {
          return Force.createForceLine(joint, new Coord(joint.x, joint.y - 0.7));
        }
      default:
        return
    }
  }

  getForceArrow(joint: Joint, dir: string, xOrY: string) {
    switch (dir) {
      case 'pos':
        if (xOrY === 'x') {
          return Force.createForceArrow(joint, new Coord(joint.x + 0.7, joint.y));
        } else {
          return Force.createForceArrow(joint, new Coord(joint.x, joint.y + 0.7));
        }
      case 'neg':
        if (xOrY === 'x') {
          return Force.createForceArrow(joint, new Coord(joint.x - 0.7, joint.y));
        } else {
          return Force.createForceArrow(joint, new Coord(joint.x, joint.y - 0.7));
        }
      default:
        return
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
        // ForceSolver.resetVariables();
        ForceSolver.determineDesiredLoopLettersForce(GridComponent.mechanisms[0].requiredLoops);
        ForceSolver.determineForceAnalysis(GridComponent.joints, GridComponent.links, 'static', ToolbarComponent.gravity,
          ToolbarComponent.unit);
        this.titleRow = GridComponent.mechanisms[0].forceTitleRow(analysisType)!;
        this.analysis = GridComponent.mechanisms[0].forceAnalysis(analysisType)!;
        while (increment < (1 + (GridComponent.joints.length * 2))) {
          this.staticForcesCheck ? includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        }
        // determine whether to export torque
        this.staticTorqueCheck ? includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        // determine whether to leave space in between analyses
        ((this.staticForcesCheck || this.staticTorqueCheck) &&
          (this.staticForcePositionsCheck || this.staticJointPositionsCheck)) ?
          includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        // determine whether to export force positions
        while (increment < (1 + (GridComponent.joints.length * 2) + (1) + 1 +
          (GridComponent.forces.length * 2))) {
          this.staticForcePositionsCheck ? includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        }
        // determine whether to leave space in between analyses
        (this.staticForcePositionsCheck && this.staticJointPositionsCheck) ?
          includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        // determine whether to export joint positions
        while (increment < (1 + (GridComponent.joints.length * 2) + (1) + 1 +
          (GridComponent.forces.length * 2) + 1 + (GridComponent.joints.length * 2))) {
          this.staticJointPositionsCheck ? includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        }
        break;
      case 'dynamics':
        // check whether to put the internal force analysis occurring at joints
        while (increment < (1 + (GridComponent.joints.length * 2))) {
          this.dynamicForcesCheck ? includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        }
        // check whether to put the torque analysis occurring for mechanism
        this.dynamicTorqueCheck ? includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        // check whether to put space between analyses
        (this.dynamicForcesCheck || this.dynamicTorqueCheck) && (this.dynamicForcePositionsCheck || this.dynamicJointKinematicsCheck ||
          this.dynamicLinkKinematicsCheck || this.dynamicAngLinkCheck) ?
          includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        // check whether to put force positions
        while (increment < (1 + (GridComponent.joints.length * 2) + (1) + 1 + (GridComponent.forces.length * 2))) {
          this.dynamicForcePositionsCheck ? includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);
        }
        // check whether to put space between analyses
        (this.dynamicForcePositionsCheck && (this.dynamicJointKinematicsCheck ||
          this.dynamicLinkKinematicsCheck || this.dynamicAngLinkCheck)) ?
          includeMapIndex.set(increment++, true) : includeMapIndex.set(increment++, false);

        sub_increment = 0;
        // check whether linear kinematics for joints (p,v,a) have been asked for
        while (increment < (1 + (GridComponent.joints.length * 2) + (1) + 1 + (GridComponent.forces.length * 2) + 1 +
          (GridComponent.joints.length * 6))) {
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
        while (increment < (1 + (GridComponent.joints.length * 2) + (1) + 1 + (GridComponent.forces.length * 2) + 1 +
          (GridComponent.joints.length * 6) + 1 + (GridComponent.links.length * 6))) {
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
        while (increment < (1 + (GridComponent.joints.length * 2) + (1) + 1 + (GridComponent.forces.length * 2) + 1 +
          (GridComponent.joints.length * 6) + 1 + (GridComponent.links.length * 6) + 1 + (GridComponent.links.length * 3))) {
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
        KinematicsSolver.resetVariables();
        KinematicsSolver.requiredLoops = GridComponent.mechanisms[0].requiredLoops;
        KinematicsSolver.determineKinematics(GridComponent.joints, GridComponent.links, ToolbarComponent.inputAngularVelocity);
        this.titleRow = GridComponent.mechanisms[0].kinematicLoopTitleRow();
        this.analysis = GridComponent.mechanisms[0].kinematicLoopAnalysis();
        while (increment < (1 + (GridComponent.joints.length * 6))) {
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
        while (increment < (1 + (GridComponent.joints.length * 6) + 1 + (GridComponent.links.length * 6))) {
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
        while (increment < (1 + (GridComponent.joints.length * 6) + 1 + (GridComponent.links.length * 6) + 1 +
          (GridComponent.links.length * 3))) {
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

  getForceAssumption(link: Link, joint: Joint, xOrY: string) {
    if (xOrY === 'x') {
      if (ForceSolver.jointPositiveForceXLinkMap.get(joint.id) === link.id) {
        return 1;
      } else {
        return -1;
      }
    } else {
      if (ForceSolver.jointPositiveForceYLinkMap.get(joint.id) === link.id) {
        return 1;
      } else {
        return -1;
      }
    }
  }

  getMomentSignEqs(joint: Joint, link: Link) {
    if (AnalysisPopupComponent.firstRefWithinMomentMap.get(link.id) === undefined) {
      AnalysisPopupComponent.firstRefWithinMomentMap.set(link.id, joint.id);
      return '';
    } else {
      if (AnalysisPopupComponent.firstRefWithinMomentMap.get(link.id) === joint.id) {
        return '';
      } else {
        return ' + ';
      }
    }
  }

  containInputJoint(link: Link) {
    let containInputJoint = false;
    link.joints.forEach(j => {
      if (containInputJoint) {return}
      if (!(j instanceof RevJoint)) {return}
      if (j.input) {
        containInputJoint = true;
      }
    });
    return containInputJoint;
  }

  getMoment(joint: Joint, link: Link, xOrY: string) {
    // get value within matrix
    const jointXIndex = ForceSolver.jointIDToUnknownArrayIndexMap.get(joint.id)!;
    const jointYIndex = jointXIndex + 1;
    const linkIndex = ForceSolver.linkIDToUnknownArrayIndexMap.get(link.id)!;
    let val = xOrY === 'x' ? ForceSolver.A_matrix[linkIndex + 2][jointXIndex] : ForceSolver.A_matrix[linkIndex + 2][jointYIndex];
    if (val > 0) {
      val = Math.abs(roundNumber(val, 3));
      if (AnalysisPopupComponent.firstRefWithinMomentMap.get(link.id) === joint.id && xOrY === 'x') {
        return '' + val.toString();
      } else {
        return ' + ' + val.toString();
      }
    } else {
      val = Math.abs(roundNumber(val, 3));
      if (AnalysisPopupComponent.firstRefWithinMomentMap.get(link.id) === joint.id && xOrY === 'x') {
        return '-' + val.toString();
      } else {
        return ' - ' + val.toString();
      }
    }
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

  determineChart(analysis: string, type_of: string, more_type: string) {
    let data1Title = '';
    let data2Title = '';
    let data3Title = '';
    let chartTitle = '';
    const xAxisTitle = 'Time-steps';
    let yAxisTitle = '';
    let datum: number[][] = [];
    let categories: string[] = [];
    const seriesData =  [];
    let posLinUnit = '(cm)';
    let velLinUnit = '(cm/s)';
    let accLinUnit = '(cm/s^2)';
    const posAngUnit = '(degrees)';
    // const posAngUnit = '(rad)';
    const velAngUnit = '((rad)/s)';
    const accAngUnit = '((rad)/s^2)';
    if (ToolbarComponent.unit === 'm') {
      posLinUnit = 'm';
      velLinUnit = 'm/s';
      accLinUnit = 'm/s^2';
    }
    switch (analysis) {
      case 'Input Torque':
        chartTitle = 'Torque for Mechanism';
        data1Title = 'Torque (Nm)';
        yAxisTitle = 'Torque (Nm)';
        [datum, categories] = this.determineAnalysis(analysis, type_of, more_type);
        seriesData.push({name: data1Title, type: 'line', data: datum[0]});
        break;
      case 'Joint Forces':
        chartTitle = 'Force Magnitudes';
        data1Title = 'Force ' + type_of + ' X-Magnitude (N)';
        data2Title = 'Force ' + type_of + ' Y-Magnitude (N)';
        data3Title = 'Abs Force (N)';
        yAxisTitle = 'Force (N)';
        [datum, categories] = this.determineAnalysis(analysis, type_of, more_type);
        seriesData.push({name: data1Title, type: 'line', data: datum[0]});
        seriesData.push({name: data2Title, type: 'line', data: datum[1]});
        seriesData.push({name: data3Title, type: 'line', data: datum[2]});
        break;
      case 'Linear Joint Pos':
        chartTitle = 'Joint\'s Linear Position';
        data1Title = 'Joint ' + type_of + ' X Position ' + posLinUnit;
        data2Title = 'Joint ' + type_of + ' Y Position ' + posLinUnit;
        yAxisTitle = 'Position ' + posLinUnit;
        [datum, categories] = this.determineAnalysis(analysis, type_of, more_type);
        seriesData.push({name: data1Title, type: 'line', data: datum[0]});
        seriesData.push({name: data2Title, type: 'line', data: datum[1]});
        break;
      case 'Linear Joint Vel':
        chartTitle = 'Joint\'s Linear Velocity';
        data1Title = 'Joint ' + type_of + ' X Velocity ' + velLinUnit;
        data2Title = 'Joint ' + type_of + ' Y Velocity ' + velLinUnit;
        data3Title = 'Absolute Velocity ' + velLinUnit;
        yAxisTitle = 'Velocity ' + velLinUnit;
        [datum, categories] = this.determineAnalysis(analysis, type_of, more_type);
        seriesData.push({name: data1Title, type: 'line', data: datum[0]});
        seriesData.push({name: data2Title, type: 'line', data: datum[1]});
        seriesData.push({name: data3Title, type: 'line', data: datum[2]});
        break;
      case 'Linear Joint Acc':
        chartTitle = 'Joint\'s Linear Acceleration';
        data1Title = 'Joint ' + type_of + ' X Acceleration ' + accLinUnit;
        data2Title = 'Joint ' + type_of + ' Y Acceleration ' + accLinUnit;
        data3Title = 'Absolute Acceleration ' + accLinUnit;
        yAxisTitle = 'Acceleration ' + accLinUnit;
        [datum, categories] = this.determineAnalysis(analysis, type_of, more_type);
        seriesData.push({name: data1Title, type: 'line', data: datum[0]});
        seriesData.push({name: data2Title, type: 'line', data: datum[1]});
        seriesData.push({name: data3Title, type: 'line', data: datum[2]});
        break;
      case 'Linear Link\'s CoM Pos':
        chartTitle = 'Link\'s Center of Mass Linear Position';
        data1Title = 'Link ' + type_of + ' (CoM) X Position ' + posLinUnit;
        data2Title = 'Link ' + type_of + ' (CoM) Y Position ' + posLinUnit;
        yAxisTitle = 'Position (CoM) ' + posLinUnit;
        [datum, categories] = this.determineAnalysis(analysis, type_of, more_type);
        seriesData.push({name: data1Title, type: 'line', data: datum[0]});
        seriesData.push({name: data2Title, type: 'line', data: datum[1]});
        break;
      case 'Linear Link\'s CoM Vel':
        chartTitle = 'Link\'s Center of Mass Linear Velocity';
        data1Title = 'Link ' + type_of + ' (CoM) X Velocity ' + velLinUnit;
        data2Title = 'Link ' + type_of + ' (CoM) Y Velocity ' + velLinUnit;
        data3Title = 'Absolute Velocity ' + velLinUnit;
        yAxisTitle = 'Velocity ' + velLinUnit;
        [datum, categories] = this.determineAnalysis(analysis, type_of, more_type);
        seriesData.push({name: data1Title, type: 'line', data: datum[0]});
        seriesData.push({name: data2Title, type: 'line', data: datum[1]});
        seriesData.push({name: data3Title, type: 'line', data: datum[2]});
        break;
      case 'Linear Link\'s CoM Acc':
        chartTitle = 'Link\'s Center of Mass Linear Acceleration';
        data1Title = 'Link ' + type_of + ' (CoM) X Acceleration ' + accLinUnit;
        data2Title = 'Link ' + type_of + ' (CoM) Y Acceleration ' + accLinUnit;
        data3Title = 'Link Absolute Acceleration ' + accLinUnit;
        yAxisTitle = 'Acceleration ' + accLinUnit;
        [datum, categories] = this.determineAnalysis(analysis, type_of, more_type);
        seriesData.push({name: data1Title, type: 'line', data: datum[0]});
        seriesData.push({name: data2Title, type: 'line', data: datum[1]});
        seriesData.push({name: data3Title, type: 'line', data: datum[2]});
        break;
      case 'Angular Link Pos':
        chartTitle = 'Link\'s Angular Position';
        data1Title = 'Link ' + type_of + ' Angle ' + posAngUnit;
        yAxisTitle = 'Position ' + posAngUnit;
        [datum, categories] = this.determineAnalysis(analysis, type_of, more_type);
        seriesData.push({name: data1Title, type: 'line', data: datum[0]});
        break;
      case 'Angular Link Vel':
        chartTitle = 'Link\'s Angular Velocity';
        data1Title = 'Link ' + type_of + ' Angular Velocity ' + velAngUnit;
        yAxisTitle = 'Velocity ' + velAngUnit;
        [datum, categories] = this.determineAnalysis(analysis, type_of, more_type);
        seriesData.push({name: data1Title, type: 'line', data: datum[0]});
        break;
      case 'Angular Link Acc':
        chartTitle = 'Link\'s Angular Acceleration';
        data1Title = 'Link ' + type_of + ' Angular Acceleration ' + accAngUnit;
        yAxisTitle = 'Acceleration ' + accAngUnit;
        [datum, categories] = this.determineAnalysis(analysis, type_of, more_type);
        seriesData.push({name: data1Title, type: 'line', data: datum[0]});
        break;
      default:
        break;
    }
    this.chartOptions = {

      series: seriesData,
      chart: {
        height: 350,
        type: 'line',
        zoom: {
          enabled: false
        }
      },
      dataLabels: {
        enabled: false
      },
      stroke: {
        curve: 'straight'
      },
      title: {
        text: chartTitle,
        align: 'left'
      },
      grid: {
        row: {
          colors: ['#f3f3f3', 'transparent'], // takes an array which will be repeated on columns
          opacity: 0.5
        }
      },
      xaxis: {
        categories: categories,
        title: {
          text: xAxisTitle
        }
      },
      yaxis: {
        title: {
          text: yAxisTitle
        },
      }
    };
  }

  changePlotAnalysis(analysis: string, type_of: string, more_type:string) {
    this.showChart = false;
    switch (analysis) {
      case 'Input Torque':
        this.showChart = true;
        this.determineChart(analysis, type_of, more_type);
        break;
      default:
        switch (type_of) {
          case '':
            break;
          default:
            this.showChart = true;
            this.determineChart(analysis, type_of, more_type);
        }
    }
  }

  determineAnalysis(analysis: string, type_of: string, more_type: string): [[number[], number[], number[]], string[]] {
    const datum_X: number[] = [];
    const datum_Y: number[] = [];
    const datum_Z: number[] = [];
    let x = 0;
    let y = 0;
    let z = 0;
    const categories: string[] = [];
    GridComponent.mechanisms[0].joints.forEach((_, index) => {
      switch (analysis) {
        case 'Input Torque':
          if (more_type === 'dynamics') {
            // TODO: Be sure to have each step within mechanism know its input angular velocity
            KinematicsSolver.determineKinematics(GridComponent.mechanisms[0].joints[index],
              GridComponent.mechanisms[0].links[index], GridComponent.mechanisms[0].inputAngularVelocities[index]);
          }
          ForceSolver.determineForceAnalysis(GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index], more_type, ToolbarComponent.gravity, ToolbarComponent.unit);
          // TODO: Figure out how to get this number...
          // datum_X.push(roundNumber(ForceSolver.unknownVariableTorque[0], 3));
          datum_X.push(roundNumber(1, 3));
          break;
        case 'Joint Forces':
          if (more_type === 'dynamics') {
            KinematicsSolver.determineKinematics(GridComponent.mechanisms[0].joints[index],
              GridComponent.mechanisms[0].links[index], GridComponent.mechanisms[0].inputAngularVelocities[index]);
          }
          ForceSolver.determineForceAnalysis(GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index], more_type, ToolbarComponent.gravity, ToolbarComponent.unit);
          x = ForceSolver.unknownVariableForcesMap.get(type_of)![0];
          y = ForceSolver.unknownVariableForcesMap.get(type_of)![1];
          z = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          datum_Z.push(roundNumber(z, 3));
          break;
        case 'Linear Joint Pos':
          const jt = GridComponent.mechanisms[0].joints[index].find(j => j.id === type_of)!;
          x = jt.x;
          y = jt.y;
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          break;
        case 'Linear Joint Vel':
          KinematicsSolver.determineKinematics(GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index], GridComponent.mechanisms[0].inputAngularVelocities[index]);
          x = KinematicsSolver.jointVelMap.get(type_of)![0];
          y = KinematicsSolver.jointVelMap.get(type_of)![1];
          z = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          datum_Z.push(roundNumber(z, 3));
          break;
        case 'Linear Joint Acc':
          KinematicsSolver.determineKinematics(GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index], GridComponent.mechanisms[0].inputAngularVelocities[index]);
          x = KinematicsSolver.jointAccMap.get(type_of)![0];
          y = KinematicsSolver.jointAccMap.get(type_of)![1];
          z = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          datum_Z.push(roundNumber(z, 3));
          break;
        case 'Linear Link\'s CoM Pos':
          KinematicsSolver.determineKinematics(GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index], GridComponent.mechanisms[0].inputAngularVelocities[index]);
          x = KinematicsSolver.linkCoMMap.get(type_of)![0];
          y = KinematicsSolver.linkCoMMap.get(type_of)![1];
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          break;
        case 'Linear Link\'s CoM Vel':
          KinematicsSolver.determineKinematics(GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index], GridComponent.mechanisms[0].inputAngularVelocities[index]);
          x = KinematicsSolver.linkVelMap.get(type_of)![0];
          y = KinematicsSolver.linkVelMap.get(type_of)![1];
          z = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          datum_Z.push(roundNumber(z, 3));
          break;
        case 'Linear Link\'s CoM Acc':
          KinematicsSolver.determineKinematics(GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index], GridComponent.mechanisms[0].inputAngularVelocities[index]);
          x = KinematicsSolver.linkAccMap.get(type_of)![0];
          y = KinematicsSolver.linkAccMap.get(type_of)![1];
          z = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          datum_Z.push(roundNumber(z, 3));
          break;
        case 'Angular Link Pos':
          KinematicsSolver.determineKinematics(GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index], GridComponent.mechanisms[0].inputAngularVelocities[index]);
          x = KinematicsSolver.linkAngPosMap.get(type_of)!;
          datum_X.push(roundNumber(x, 3));
          break;
        case 'Angular Link Vel':
          KinematicsSolver.determineKinematics(GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index], GridComponent.mechanisms[0].inputAngularVelocities[index]);
          x = KinematicsSolver.linkAngVelMap.get(type_of)!;
          datum_X.push(roundNumber(x, 3));
          break;
        case 'Angular Link Acc':
          KinematicsSolver.determineKinematics(GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index], GridComponent.mechanisms[0].inputAngularVelocities[index]);
          x = KinematicsSolver.linkAngAccMap.get(type_of)!;
          datum_X.push(roundNumber(x, 3));
          break;
        case 'ic':
          break;
      }
      categories.push('Timestep ' + index);
    });
    return [[datum_X, datum_Y, datum_Z], categories];
  }
}
