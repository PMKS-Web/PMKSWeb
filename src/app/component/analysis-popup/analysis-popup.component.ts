import {AfterViewInit, Component, OnInit} from '@angular/core';

@Component({
  selector: 'app-analysis-popup',
  templateUrl: './analysis-popup.component.html',
  styleUrls: ['./analysis-popup.component.css']
})
export class AnalysisPopupComponent implements OnInit, AfterViewInit {
  private static popUpWindow: SVGElement;
  private static exportButton: SVGElement;
  private static showPlotsButton: SVGElement;
  private static showEqsButton: SVGElement;
  selectedTab: number = 0;
  selectedAnalysis: string = '';

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

  constructor() { }

  ngOnInit(): void {
  }

  ngAfterViewInit(): void {
    AnalysisPopupComponent.popUpWindow = document.getElementById('analysisPopup') as unknown as SVGElement;
    AnalysisPopupComponent.exportButton = document.getElementById('exportButton') as unknown as SVGElement;
    AnalysisPopupComponent.showPlotsButton = document.getElementById('showPlotsButton') as unknown as SVGElement;
    AnalysisPopupComponent.showEqsButton = document.getElementById('showEqsButton') as unknown as SVGElement;
  }

  showAnalysis($event: string) {
    AnalysisPopupComponent.popUpWindow.style.display='block';
    this.selectedAnalysis = $event;
  }

  closeAnalysis() {
    AnalysisPopupComponent.popUpWindow.style.display='none';
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
}
