import {AfterViewInit, Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Joint, PrisJoint, RealJoint, RevJoint} from "../../model/joint";
import {Link, RealLink} from "../../model/link";
import {Force} from "../../model/force";
import {Mechanism} from "../../model/mechanism/mechanism";
import {roundNumber, splitURLInfo, stringToBoolean, stringToFloat} from "../../model/utils";
import {ForceSolver} from "../../model/mechanism/force-solver";
import {AnimationBarComponent} from "../animation-bar/animation-bar.component";
import {GridComponent} from "../grid/grid.component";
import {LinkageTableComponent} from "../linkage-table/linkage-table.component";
import {AnalysisPopupComponent} from "../analysis-popup/analysis-popup.component";
import {KinematicsSolver} from "../../model/mechanism/kinematic-solver";

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.css']
})
export class ToolbarComponent implements OnInit, AfterViewInit {

  selectedTab: string = 'file';
  animate: boolean = false;

  static inputAngularVelocity: number = 10;
  static clockwise: boolean = false;
  static gravity: boolean = false;
  private static fileButton: SVGElement;
  private static analysisButton: SVGElement;
  private static settingsButton: SVGElement;
  private static helpButton: SVGElement;
  static unit = 'cm';
  // TODO: If possible, change this to static variable...
  localUnit = {
    // selectedUnit: 'Metric'
    selectedUnit: 'cm'
  };

  localUnits = [
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
    const settingsPropsString = splitURLInfo('&s=');
    if (!(typeof settingsPropsString === 'string')) {return}
    const settingsPropsArray = settingsPropsString.split(',');
    if (settingsPropsArray.length === 0) {return}
    const input_speed_mag = stringToFloat(settingsPropsArray[0]);
    const clockwise = stringToBoolean(settingsPropsArray[1]);
    const gravity = stringToBoolean(settingsPropsArray[2]);
    const unit = settingsPropsArray[3];
    ToolbarComponent.inputAngularVelocity = input_speed_mag;
    ToolbarComponent.clockwise = clockwise;
    AnimationBarComponent.direction = ToolbarComponent.clockwise ? 'cw' : 'ccw';
    ToolbarComponent.gravity = gravity;
    this.localUnit.selectedUnit = unit;
    ToolbarComponent.unit = unit;
  }

  ngAfterViewInit() {
    ToolbarComponent.fileButton = document.getElementById('fileButton') as unknown as SVGElement;
    ToolbarComponent.analysisButton = document.getElementById('analysisButton') as unknown as SVGElement;
    ToolbarComponent.settingsButton = document.getElementById('settingsButton') as unknown as SVGElement;
    ToolbarComponent.helpButton = document.getElementById('helpButton') as unknown as SVGElement;
  }

  showTable() {
    LinkageTableComponent.linkageVisibility();
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
        ForceSolver.resetVariables();
        ForceSolver.determineDesiredLoopLettersForce(GridComponent.mechanisms[0].requiredLoops);
        ForceSolver.determineForceAnalysis(GridComponent.joints, GridComponent.links, 'static',
          ToolbarComponent.gravity, ToolbarComponent.unit);
        break;
      case 'stress':
        break;
      case 'kinematic_loop':
        KinematicsSolver.resetVariables();
        KinematicsSolver.requiredLoops = GridComponent.mechanisms[0].requiredLoops;
        KinematicsSolver.determineKinematics(GridComponent.joints, GridComponent.links, ToolbarComponent.inputAngularVelocity);
        break;
      case 'ic':
        break
      default:
        return
    }
    AnalysisPopupComponent.showAnalysis(analysisType);
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
    // const content = this.generateExportURL(GridComponent.joints, GridComponent.links, GridComponent.forces, [],
    //   [], 10, true, ToolbarComponent.gravity, ToolbarComponent.unit);
    let content = '';
    content += `j=`;
    GridComponent.joints.forEach(joint => {
      if (!(joint instanceof RealJoint)) {return}
      content += `${joint.id},`;
      content += `${roundNumber(joint.x, 3)},`;
      content += `${roundNumber(joint.y, 3)},`;
      const relatedLinkIDs = joint.links.map(link => {
        return link.id;
      });
      content += `${relatedLinkIDs.join('|')},`;
      switch (joint.constructor) {
        case RevJoint:
          content += `R,`;
          break;
        case PrisJoint:
          content += `P,`;
          break;
        default:
          content += `???`;
          break;
      }
      // switch (joint.constructor) {
      //   case RevJoint:
      //     result += `R`;
      //     break;
      //   case PrisJoint:
      //     if (!(joint instanceof PrisJoint)) {return}
      //     result += `P`;
      //     result += `${joint.angle}`;
      //     break;
      // }
      content += `${joint.ground ? 't' : 'f'},`;
      // result += `${joint.coeffFriction},`;
      content += `${joint.input ? 't' : 'f'},`;
      if (joint instanceof PrisJoint) {content += `${joint.angle},`;}
      else {content += `Null`;}

      // result += `${joint.coeffFriction},`; // maybe in future when coefficient of friction is taken into consideration
      content += '\n';
    });
    content += `&l=`;
    GridComponent.links.forEach(link => {
      if (!(link instanceof RealLink)) {return}
      content += `${link.id},`;
      content += `${link.mass},`;
      content += `${link.massMoI},`;
      content += `${link.CoM.x},`;
      content += `${link.CoM.y},`;
      const relatedJointIDs = link.joints.map(joint => {
        return joint.id;
      });
      const relatedForceIDs = link.forces.map(force => {
        return force.id;
      });

      content += `${relatedJointIDs.join('|')},`;
      content += `${relatedForceIDs.join('|')},`;
      content += `${link.shape}`;
      // result += `${this.shapeFullnameToNickname(link.uiShape)}`;
      const bounds = link.bound;
      const keyArray = [bounds.b1, bounds.b2, bounds.b3, bounds.b4];
      keyArray.forEach(eid => {
        content += `,${roundNumber(eid.x, 3)}`;
        content += `,${roundNumber(eid.y, 3)}`;
      });
      content += '\n';
    });

    content += `&f=`;
    GridComponent.forces.forEach(force => {
      content += `${force.id},`;
      content += `${force.link.id},`;
      content += `${roundNumber(force.startCoord.x, 3)},`;
      content += `${roundNumber(force.startCoord.y, 3)},`;
      content += `${roundNumber(force.endCoord.x, 3)},`;
      content += `${roundNumber(force.endCoord.y, 3)},`;
      content += `${force.local ? 'f' : 't'},`;
      content += `${force.arrowOutward},`;
      content += `${force.mag},`;
      // result += `${force.yMag}`;
      content += '\n';
    });
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
    content += `&s=`;
    content += `${ToolbarComponent.inputAngularVelocity},`; // input speed
    content += `${ToolbarComponent.clockwise},`; // cw (true) or ccw (false)
    content += `${ToolbarComponent.gravity},`; // gravity on or off
    content += `${ToolbarComponent.unit}`;
    /////
    const url = this.getURL();
    const dataURLString = `${url}?${content}`;
    const dataURL = encodeURI(dataURLString);
    console.log(dataURL.length);
    if (dataURL.length > 2000) {
      // IndiFuncs.showErrorNotification('linkage too large, please use export file');
      return;
    } else {
      // IndiFuncs.showNotification('URL copied!');
    }

    // fake a text area to exec copy
    const toolman = document.createElement('textarea');
    document.body.appendChild(toolman);
    toolman.value = dataURL;
    toolman.textContent = dataURL;
    toolman.select();
    document.execCommand('copy');
    document.body.removeChild(toolman);
    GridComponent.sendNotification('URL Copied');
  }

  downloadLinkage() {
    // TODO: Believe this should be this.unit.selectedUnit
    const content = this.generateExportFile(GridComponent.joints, GridComponent.links, GridComponent.forces, [],
      [], 10, true, ToolbarComponent.gravity, ToolbarComponent.unit);

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
    let result = '';
    result += `j=`;
    jointArray.forEach(joint => {
      if (!(joint instanceof RealJoint)) {return}
      result += `${joint.id},`;
      result += `${roundNumber(joint.x, 3)},`;
      result += `${roundNumber(joint.y, 3)},`;
      const relatedLinkIDs = joint.links.map(link => {
        return link.id;
      });
      result += `${relatedLinkIDs.join('|')},`;
      switch (joint.constructor) {
        case RevJoint:
          result += `R`;
          break;
        case PrisJoint:
          result += `P`;
          break;
        default:
          result += `???`;
          break;
      }
      // switch (joint.constructor) {
      //   case RevJoint:
      //     result += `R`;
      //     break;
      //   case PrisJoint:
      //     if (!(joint instanceof PrisJoint)) {return}
      //     result += `P`;
      //     result += `${joint.angle}`;
      //     break;
      // }
      result += `${joint.ground ? 't' : 'f'},`;
      if (joint instanceof PrisJoint) {result += `${joint.angle},`;}
      // result += `${joint.coeffFriction},`;
      result += `${joint.input ? 't' : 'f'},`;

      // result += `${joint.coeffFriction},`; // maybe in future when coefficient of friction is taken into consideration
      result += '\n';
    });
    result += `&l=`;
    linkArray.forEach(link => {
      if (!(link instanceof RealLink)) {return}
      result += `${link.id},`;
      result += `${link.mass},`;
      result += `${link.massMoI},`;
      result += `${link.CoM.x},`;
      result += `${link.CoM.y},`;
      const relatedJointIDs = link.joints.map(joint => {
        return joint.id;
      });
      const relatedForceIDs = link.forces.map(force => {
        return force.id;
      });

      result += `${relatedJointIDs.join('|')},`;
      result += `${relatedForceIDs.join('|')},`;
      result += `${link.shape},`;
      // result += `${this.shapeFullnameToNickname(link.uiShape)}`;
      const bounds = link.bound;
      const keyArray = [bounds.b1, bounds.b2, bounds.b3, bounds.b4];
      keyArray.forEach(eid => {
        result += `,${roundNumber(eid.x, 3)}`;
        result += `,${roundNumber(eid.y, 3)}`;
      });
      result += '\n';
    });

    result += `&f=`;
    forceArray.forEach(force => {
      result += `${force.id},`;
      result += `${force.link.id},`;
      result += `${roundNumber(force.startCoord.x, 3)},`;
      result += `${roundNumber(force.startCoord.y, 3)},`;
      result += `${roundNumber(force.endCoord.x, 3)},`;
      result += `${roundNumber(force.endCoord.y, 3)},`;
      result += `${force.local ? 'f' : 't'},`;
      result += `${force.arrowOutward},`;
      result += `${force.mag},`;
      // result += `${force.yMag}`;
      result += '\n';
    });
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
    result += `&s=`;
    result += `${angularVelocity},`; // input speed
    result += `${clockwise},`; // cw (true) or ccw (false)
    result += `${gravityBool},`; // gravity on or off
    result += `${unit}`;
    return result;
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
    ToolbarComponent.inputAngularVelocity = $event.target.value
    GridComponent.updateMechanism();
  }

  getClockwise() {
    return ToolbarComponent.clockwise;
  }

  setClockwise(cond: boolean) {
    ToolbarComponent.clockwise = cond;
    AnimationBarComponent.direction = ToolbarComponent.clockwise ? 'cw': 'ccw';
    GridComponent.updateMechanism();
  }

  getGravity() {
    return ToolbarComponent.gravity;
  }

  setGravity(cond: boolean) {
    ToolbarComponent.gravity = cond;
    GridComponent.updateMechanism();
  }

  changeUnit(selectedUnit: string) {
    this.localUnit.selectedUnit = selectedUnit;
    ToolbarComponent.unit = this.localUnit.selectedUnit;
    GridComponent.updateMechanism();
  }

  getInputAngVel() {
    return ToolbarComponent.inputAngularVelocity;
  }
}
