import {AfterViewInit, Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Joint, PrisJoint, RealJoint, RevJoint} from "../../model/joint";
import {Link} from "../../model/link";
import {Force} from "../../model/force";
import {Mechanism} from "../../model/mechanism/mechanism";
import {roundNumber} from "../../model/utils";
import {ForceSolver} from "../../model/mechanism/force-solver";

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.css']
})
export class ToolbarComponent implements OnInit, AfterViewInit {

  @Input() joints: Joint[] = [];
  @Input() links: Link[] = [];
  @Input() forces: Force[] = [];
  @Input() mechanisms: Mechanism[] = [];
  // TODO: Use screen Coord within toolbar if you can get to this stage of project
  @Input() screenCoord: string = '';
  @Output() showcaseTable = new EventEmitter();
  // TODO: Use animategridemitter within toolbar if you can get to this stage of project
  @Output() animateGridEmitter = new EventEmitter();
  @Output() showAnalysisPopup = new EventEmitter<string>();
  inputAngularVelocity: number = 10;
  selectedTab: string = 'file';
  // showIdTags: boolean = false;
  // showCoMTags: boolean = false;
  // unit: string = 'cm';
  clockwise: boolean = false;
  gravity: boolean = false;
  animate: boolean = false;

  private static fileButton: SVGElement;
  private static analysisButton: SVGElement;
  private static settingsButton: SVGElement;
  private static helpButton: SVGElement;


  unit = {
    // selectedUnit: 'Metric'
    selectedUnit: 'cm'
  };

  units = [
    {id: 'cm', label: 'cm'},
    {id: 'm', label: 'm'},
    // { id: 'km', label: 'km'},
    // { id: 'in', label: 'in'},
    // { id: 'ft', label: 'ft'}
    // { id: 'Metric', label: 'Metric'},
    // { id: 'English', label: 'English'}
  ];

  constructor() { }

  ngOnInit(): void {
  }

  ngAfterViewInit() {
    ToolbarComponent.fileButton = document.getElementById('fileButton') as unknown as SVGElement;
    ToolbarComponent.analysisButton = document.getElementById('analysisButton') as unknown as SVGElement;
    ToolbarComponent.settingsButton = document.getElementById('settingsButton') as unknown as SVGElement;
    ToolbarComponent.helpButton = document.getElementById('helpButton') as unknown as SVGElement;
  }

  showTable() {
    // TODO: If possible, don't have this as an emitter. Have the linkage table have an input here that determines the value,
    // TODO: that is either if it updates automoatically or if NgUpdates is needed
    this.showcaseTable.emit();
  }

  setTab(analysis: string) {
    // TODO: Maybe have this logic later???
    // if (this.selectedTab === analysis) {
    //   this.selectedTab = 'none';
    // } else {
    //   this.selectedTab = analysis;
    // }
    this.selectedTab = analysis
    switch (analysis) {
      case 'file':
        ToolbarComponent.fileButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: black; background-color: gray');
        ToolbarComponent.analysisButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        ToolbarComponent.settingsButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        ToolbarComponent.helpButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        break;
      case 'analysis':
        ToolbarComponent.fileButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        ToolbarComponent.analysisButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: black; background-color: gray');
        ToolbarComponent.settingsButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        ToolbarComponent.helpButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        break;
      case 'settings':
        ToolbarComponent.fileButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        ToolbarComponent.analysisButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        ToolbarComponent.settingsButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: black; background-color: gray');
        ToolbarComponent.helpButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        break;
      case 'help':
        ToolbarComponent.fileButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        ToolbarComponent.analysisButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        ToolbarComponent.settingsButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        ToolbarComponent.helpButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: black; background-color: gray');
        break;
    }
  }

  changeIdTag() {
    // this.showIdTags = !this.showIdTags;
  }

  changeCoMTag() {
    // this.showCoMTags = !this.showCoMTags;
  }

  animateMechanism() {
    console.log('animateMechanism');
    this.animate = !this.animate;
  }

  determineForceAnalysis() {
    // ForceSolver.determineDesiredLoopLettersForce(this.mechanisms[0].requiredLoops);
    // ForceSolver.determineForceAnalysis(this.joints, this.links, 'static', this.gravity, this.unit);
  }

  popUpAnalysis(analysisType: string) {
    switch (analysisType) {
      // TODO: add logic for determining each logic and determine whether analysis can be done
      case 'loop':
        break;
      case 'force':
        // ForceSolver.determineDesiredLoopLettersForce(this.mechanisms[0].requiredLoops);
        // ForceSolver.determineForceAnalysis(this.joints, this.links, 'static', this.gravity,
        //   this.unit.selectedUnit);
        break;
      case 'stress':
        break;
      case 'kinematic':
        break;
      case 'ic':
        break
      default:
        return
    }
    this.showAnalysisPopup.emit(analysisType);
  }

  upload($event: any) {
    const input = $event.target;
    if (input.files.length !== 1) {
      return;
    }
    const reader = new FileReader();
    const that = this;

    reader.onload = function () {
      const newFile = reader.result;
      // that.newCSVEmit.emit(newFile as String);
    };
    // reader.readAsText(input.files[0]);
  }

  copyURL() {
    const content = this.generateExportURL(this.joints, this.links, this.forces, [],
      [], 10, true, this.gravity, this.unit.selectedUnit);
    const url = this.getURL();
    const dataURLString = `${url}?${content}`;
    const dataURL = encodeURI(dataURLString);
    console.log(dataURL.length);
    // if (dataURL.length > 2000) {
    //   IndiFuncs.showErrorNotification('linkage too large, please use export file');
    //   return;
    // } else {
    //   IndiFuncs.showNotification('URL copied!');
    // }

    // fake a text area to exec copy
    const toolman = document.createElement('textarea');
    document.body.appendChild(toolman);
    toolman.value = dataURL;
    toolman.textContent = dataURL;
    toolman.select();
    document.execCommand('copy');
    document.body.removeChild(toolman);
  }

  downloadLinkage() {
    // TODO: Believe this should be this.unit.selectedUnit
    const content = this.generateExportFile(this.joints, this.links, this.forces, [],
      [], 10, true, this.gravity, this.unit.selectedUnit);

    const blob = new Blob([content], {type: 'text/csv;charset=utf-8;'});
    const fileName = `PMKS+_${new Date().toISOString()}.csv`;
    // if (navigator.msSaveBlob) { // IE 10+
    //   navigator.msSaveBlob(blob, fileName);
    // } else {
    const link = document.createElement('a');
    if (link.download !== undefined) { // feature detection
      // Browsers that support HTML5 download attribute
      // fake an <a> to click on
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // }
    }
  }

  merge() {

  }

  getURL(): string {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const port = window.location.port;
    return `${protocol}//${hostname}${port ? `:${port}` : ''}${pathname}`;
  }

  openURL(url: string) {
    // fake an <a> to click on
    const toolman = document.createElement('a');
    toolman.setAttribute('href', url);
    toolman.setAttribute('target', '_blank');
    toolman.style.display = 'none';
    document.body.appendChild(toolman);
    toolman.click();
    document.body.removeChild(toolman);
  }

  generateExportURL(jointArray: Joint[], linkArray: Link[], forceArray: Force[], pathPointArray: any,
                    threePositionArray: any,  angularVelocity: number, clockwise: boolean,
                    gravityBool: boolean, unit: string): string {
    // TODO: Once the analysis has been completed, have this. Don't want to change this again and again
    // let result = '';
    // result += `j=`;
    // jointArray.forEach(joint => {
    //   result += `${joint.id},`;
    //   result += `${roundNumber(joint.x, 3)},`;
    //   result += `${roundNumber(joint.y, 3)},`;
    //   if (!(joint instanceof RealJoint)) {
    //     if (joint instanceof ImagJoint) {
    //       result += `I`;
    //     } else {
    //       result += `?`; // should never reach here since only mechanism contains pure Joint
    //     }
    //     result += '\n';
    //     return;
    //   }
    //   const relatedLinkIDs = joint.links.map(link => {
    //     return link.id;
    //   });
    //   result += `${relatedLinkIDs.join('|')},`;
    //   result += `${joint.input ? 't' : 'f'},`;
    //   result += `${joint.ground ? 't' : 'f'},`;
    //   switch (joint.constructor) {
    //     case RevJoint:
    //       result += `R`;
    //       break;
    //     case PrisJoint:
    //       if (!(joint instanceof PrisJoint)) {return}
    //       result += `P`;
    //       result += `${joint.angle}`;
    //       break;
    //   }
    //   result += `${joint.type},`;
    //   // result += `${joint.coeffFriction},`; // maybe in future when coefficient of friction is taken into consideration
    //
    //
    //   result += '\n';
    // });
    // result += `&l=`;
    // linkArray.forEach(link => {
    //   result += `${link.id},`;
    //   result += `${link.mass},`;
    //   result += `${link.massMomentOfInertia},`;
    //   result += `${link.centerOfMassX},`;
    //   result += `${link.centerOfMassY},`;
    //   const relatedJointIDs = link.joints.map(joint => {
    //     return joint.id;
    //   });
    //   const relatedForceIDs = link.forces.map(force => {
    //     return force.id;
    //   });
    //
    //   result += `${relatedJointIDs.join('|')},`;
    //   result += `${relatedForceIDs.join('|')},`;
    //   result += `${this.shapeFullnameToNickname(link.uiShape)}`;
    //   const bounds = link.uiBounds;
    //   const keyArray = [editorID.b1, editorID.b2, editorID.b3, editorID.b4];
    //   keyArray.forEach(eid => {
    //     result += `,${IndiFuncs.roundNumber(bounds[eid].x, 3)}`;
    //     result += `,${IndiFuncs.roundNumber(bounds[eid].y, 3)}`;
    //   });
    //   result += '\n';
    // });
    //
    // result += `&f=`;
    // forceArray.forEach(force => {
    //   result += `${force.id},`;
    //   result += `${force.link.id},`;
    //   result += `${IndiFuncs.roundNumber(force.start.x, 3)},`;
    //   result += `${IndiFuncs.roundNumber(force.start.y, 3)},`;
    //   result += `${IndiFuncs.roundNumber(force.end.x, 3)},`;
    //   result += `${IndiFuncs.roundNumber(force.end.y, 3)},`;
    //   result += `${force.isGlobal ? 't' : 'f'},`;
    //   result += `${force.directionOutward},`;
    //   result += `${force.xMag},`;
    //   result += `${force.yMag}`;
    //   result += '\n';
    // });
    // result += `&pp=`;
    // pathPointArray.forEach(pp => {
    //   result += `${pp.id},`;
    //   result += `${IndiFuncs.roundNumber(pp.x, 3)},`;
    //   result += `${IndiFuncs.roundNumber(pp.y, 3)},`;
    //   result += `${pp.neighbor_one.id},`;
    //   result += `${pp.neighbor_two.id},`;
    //   result += '\n';
    // });
    // result += `&tp=`;
    // threePositionArray.forEach(tp => {});
    // result += `&s=`;
    // result += `${angularVelocity},`; // input speed
    // result += `${clockwise},`; // cw (true) or ccw (false)
    // result += `${gravityBool},`; // gravity on or off
    // result += `${unit}`;
    // return result;
    return '';
  }

  generateExportFile(jointArray: Joint[], linkArray: Link[], forceArray: Force[], pathPointArray: any,
                     threePositionArray: any,  input_speed_mag: number, clockwise: boolean,
                     gravity: boolean, unit: string): string {
    // let result = '';
    // result += 'joints\n';
    // result += 'id,x,y,links,type,ground,angle,coeffOfFriction,input\n';
    // jointArray.forEach(joint => {
    //   result += `${joint.id},`;
    //   result += `${joint.x},`;
    //   result += `${joint.y},`;
    //   const relatedLinkIDs = joint.links.map(link => {
    //     return link.id;
    //   });
    //   result += `${relatedLinkIDs.join('|')},`;
    //   result += `${joint.type},`;
    //   result += `${joint.grounded},`;
    //   result += `${joint.angle},`;
    //   result += `${joint.coeffFriction},`;
    //   result += `${joint.input},`;
    //   // result += `0`;
    //   result += '\n';
    // });
    //
    // result += 'links\n';
    // result += 'id,mass,mass_moi,center_of_mass_x,center_of_mass_y,joints,forces,shape,b1x,b1y,b2x,b2y,b3x,b3y,b4x,b4y\n';
    //
    // linkArray.forEach(link => {
    //   result += `${link.id},`;
    //   result += `${link.mass},`;
    //   result += `${link.massMomentOfInertia},`;
    //   result += `${link.centerOfMassX},`;
    //   result += `${link.centerOfMassY},`;
    //   const relatedJointIDs = link.joints.map(joint => {
    //     return joint.id;
    //   });
    //   const relatedForceIDs = link.forces.map(force => {
    //     return force.id;
    //   });
    //   result += `"${relatedJointIDs.join(',')}",`;
    //   result += `"${relatedForceIDs.join(',')}",`;
    //   result += `${link.uiShape}`;
    //   const bounds = link.uiBounds;
    //   const keyArray = [editorID.b1, editorID.b2, editorID.b3, editorID.b4];
    //   keyArray.forEach(eid => {
    //     result += `,${bounds[eid].x}`;
    //     result += `,${bounds[eid].y}`;
    //   });
    //   result += '\n';
    // });
    //
    // result += 'forces\n';
    // result += 'id,link,startx,starty,endx,endy,fixed,direction,xMag,yMag\n';
    // forceArray.forEach(force => {
    //
    //   result += `${force.id},`;
    //   result += `${force.link.id},`;
    //   result += `${force.start.x},`;
    //   result += `${force.start.y},`;
    //   result += `${force.end.x},`;
    //   result += `${force.end.y},`;
    //   result += `${force.isGlobal},`;
    //   result += `${force.directionOutward},`;
    //   result += `${force.xMag},`;
    //   result += `${force.yMag}`;
    //   result += '\n';
    // });
    // result += 'pathPoints\n';
    // result += 'id,x,y,neighbor1,neighbor2\n';
    // pathPointArray.forEach(pathPoint => {
    //   result += `${pathPoint.id},`;
    //   result += `${pathPoint.x},`;
    //   result += `${pathPoint.y},`;
    //   result += `${pathPoint.neighbor_one.id},`;
    //   result += `${pathPoint.neighbor_two.id},`;
    //   result += '\n';
    // });
    // // result += 'threePosition\n';
    // // result += 'id,x,y\n';
    // // threePositionArray.forEach(force => {
    // //
    // //   result += '\n';
    // // });
    // result += 'settings\n';
    // result += 'input_speed_mag,clockwise,gravity,unit\n';
    // result += `${input_speed_mag},`;
    // result += `${clockwise},`;
    // result += `${gravity},`;
    // result += `${unit}`;
    // result += '\n';
    //
    // return result;
    return '';
  }

  setInputMagnitudeAngVel($event: any) {
    this.inputAngularVelocity = $event.target.value
  }

  setClockwise() {
    this.clockwise = true;
  }

  setCounterClockwise() {
    this.clockwise = false;
  }

  setGravity() {
    this.gravity = true;
  }

  setGravityOff() {
    this.gravity = false;
  }

  changeUnit(selectedUnit: string) {
    this.unit.selectedUnit = selectedUnit;
  }
}
