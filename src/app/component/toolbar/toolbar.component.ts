import {
  AfterViewInit,
  Component,
  EventEmitter,
  inject,
  Inject,
  Input,
  isDevMode,
  OnInit,
  Output,
} from '@angular/core';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../../model/joint';
import { Bound, Link, Piston, RealLink } from '../../model/link';
import { Force } from '../../model/force';
import { Mechanism } from '../../model/mechanism/mechanism';
import { roundNumber, stringToBoolean, stringToFloat, stringToShape } from '../../model/utils';
import { ForceSolver } from '../../model/mechanism/force-solver';
import { AnimationBarComponent } from '../animation-bar/animation-bar.component';
import { LinkageTableComponent } from '../linkage-table/linkage-table.component';
import { KinematicsSolver } from '../../model/mechanism/kinematic-solver';
import { Coord } from '../../model/coord';
import { TemplatesPopupComponent } from '../templates-popup/templates-popup.component';

import { ActiveObjService } from 'src/app/services/active-obj.service';
import { RightPanelComponent } from '../right-panel/right-panel.component';
import { MechanismService } from '../../services/mechanism.service';
import { NewGridComponent } from '../new-grid/new-grid.component';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { UrlProcessorService } from '../../services/url-processor.service';
import { MatDialog } from '@angular/material/dialog';
import { TemplatesComponent } from '../MODALS/templates/templates.component';

const parseCSV = require('papaparse');

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.scss'],
})
export class ToolbarComponent implements OnInit, AfterViewInit {
  private analytics: Analytics = inject(Analytics);

  openRightPanelEquations() {
    RightPanelComponent.tabClicked(2);
  }

  openRightPanelHelp() {
    RightPanelComponent.tabClicked(3);
  }

  openRightPanelSettings() {
    RightPanelComponent.tabClicked(1);
  }

  openRightPanelDebug() {
    RightPanelComponent.tabClicked(4);
  }

  animate: boolean = false;

  static inputAngularVelocity: number = 10;
  static clockwise: boolean = false;
  static gravity: boolean = true; //Kohmei set this to true for testing, normally false
  private static fileButton: SVGElement;
  static analysisButton: SVGElement;
  static loopButton: SVGElement;
  static forceButton: SVGElement;
  static stressButton: SVGElement;
  static kinematicButton: SVGElement;
  private static settingsButton: SVGElement;
  private static helpButton: SVGElement;
  static unit = 'cm';
  // TODO: If possible, change this to static variable...
  url: any;

  constructor(
    private activeObjService: ActiveObjService,
    private mechanismService: MechanismService,
    public dialog: MatDialog
  ) {}

  openTemplates() {
    this.dialog.open(TemplatesComponent);
  }

  ngOnInit(): void {
    //This will need to move to settings service
    // const settingsPropsString = splitURLInfo('&s=');
    // if (!(typeof settingsPropsString === 'string')) {
    //   return;
    // }
    // const settingsPropsArray = settingsPropsString.split(',');
    // if (settingsPropsArray.length === 0) {
    //   return;
    // }
    // const input_speed_mag = stringToFloat(settingsPropsArray[0]);
    // const clockwise = stringToBoolean(settingsPropsArray[1]);
    // const gravity = stringToBoolean(settingsPropsArray[2]);
    // const unit = settingsPropsArray[3];
    // ToolbarComponent.inputAngularVelocity = input_speed_mag;
    // ToolbarComponent.clockwise = clockwise;
    // AnimationBarComponent.direction = ToolbarComponent.clockwise ? 'cw' : 'ccw';
    // // ToolbarComponent.gravity = gravity; Temp commneted out by Kohmei for testing
    // this.localUnit.selectedUnit = unit;
    // ToolbarComponent.unit = unit;
    // this.mechanismService.updateMechanism();
  }

  ngAfterViewInit() {
    ToolbarComponent.fileButton = document.getElementById('fileButton') as unknown as SVGElement;
    ToolbarComponent.analysisButton = document.getElementById(
      'analysisButton'
    ) as unknown as SVGElement;
    ToolbarComponent.loopButton = document.getElementById('loopButton') as unknown as SVGElement;
    ToolbarComponent.forceButton = document.getElementById('forceButton') as unknown as SVGElement;
    ToolbarComponent.stressButton = document.getElementById(
      'stressButton'
    ) as unknown as SVGElement;
    ToolbarComponent.kinematicButton = document.getElementById(
      'kinematicButton'
    ) as unknown as SVGElement;
    ToolbarComponent.settingsButton = document.getElementById(
      'settingsButton'
    ) as unknown as SVGElement;
    ToolbarComponent.helpButton = document.getElementById('helpButton') as unknown as SVGElement;
  }

  popUpTemplates() {
    TemplatesPopupComponent.showTemplates();
    logEvent(this.analytics, 'open_templates');
  }

  upload($event: any) {
    logEvent(this.analytics, 'upload_file');
    const input = $event.target;
    if (input.files.length !== 1) {
      return;
    }
    const reader = new FileReader();
    // const that = this;
    let selectedUnit: string = '';

    reader.onload = () => {
      const newFile = reader.result as string;
      const csv = parseCSV(newFile);

      if (csv.errors.length > 0) {
        console.error(csv.errors);
        throw new Error('parse csv failed');
      }

      const lines = csv.data;
      let currentParseMode = 'none';
      let parsing = false;
      let propsLine = false;
      const jointArray: Joint[] = [];
      const linkArray: Link[] = [];
      const forceArray: Force[] = [];
      // const pathPointArray = [];
      // const threePositionArray = [];
      // const gearSynthesisArray = [];
      // let settings_: {
      //   input_speed_mag: number;
      //   clockwise: boolean;
      //   gravity: boolean;
      //   unit: string};
      // let inputJoint: Joint;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] as string[];

        if (line.length === 1) {
          switch (line[0]) {
            case 'joints': {
              currentParseMode = 'joint';
              propsLine = true;
              break;
            }
            case 'links': {
              currentParseMode = 'link';
              propsLine = true;
              break;
            }
            case 'forces': {
              currentParseMode = 'force';
              propsLine = true;
              break;
            }
            case 'pathPoints': {
              currentParseMode = 'pathPoint';
              propsLine = true;
              break;
            }
            case 'threePositions': {
              currentParseMode = 'threePosition';
              propsLine = true;
              break;
            }
            case 'settings': {
              currentParseMode = 'setting';
              propsLine = true;
              break;
            }
            default: {
              currentParseMode = 'none';
              break;
            }
          }
          parsing = false;
          continue;
        }

        // ignore props line
        if (propsLine) {
          propsLine = false;
          parsing = true;
          continue;
        }

        if (!parsing) {
          continue;
        }
        switch (currentParseMode) {
          case 'joint':
            try {
              const id = line[0];
              const x = stringToFloat(line[1]);
              const y = stringToFloat(line[2]);
              // const links = getLinksByIds(line[3].split(','), linkArray);
              const type = line[4];
              const ground = stringToBoolean(line[5]);
              // const coeff_of_friction = stringToFloat(line[7]);
              const input = stringToBoolean(line[7]);

              let newJoint: RealJoint;
              switch (type) {
                case 'R':
                  newJoint = new RevJoint(id, x, y, input, ground);
                  break;
                case 'P':
                  newJoint = new PrisJoint(id, x, y, input, ground);
                  if (!(newJoint instanceof PrisJoint)) {
                    return;
                  }
                  const angle = stringToFloat(line[6]);
                  newJoint.angle_rad = angle;
                  break;
                default:
                  return;
              }
              // newJoint.angle = angle;
              // newJoint.coeffFriction = coeff_of_friction;
              // newJoint.links = links;
              jointArray.push(newJoint);
            } catch (e) {
              console.error(line);
              console.error(e);
              throw new Error('parse csv failed');
            }
            break;
          case 'link':
            try {
              const id = line[0];
              const linkType = line[1];
              const mass = stringToFloat(line[2]);
              let joints: RealJoint[] = [];
              const jointIDArray = line[6].split(',');
              jointIDArray.forEach((jointID) => {
                const joint = jointArray.find((jt) => jt.id === jointID)!;
                if (!(joint instanceof RealJoint)) {
                  return;
                }
                // TODO: Maybe put check here to see if they got a joint
                joints.push(joint);
              });
              let newLink: Link;
              switch (linkType) {
                case 'R':
                  const mass_moi = stringToFloat(line[3]);
                  const CoM_x = stringToFloat(line[4]);
                  const CoM_y = stringToFloat(line[5]);
                  const CoM = new Coord(CoM_x, CoM_y);

                  // TODO: Adjust for this after finished welded joints
                  newLink = new RealLink(id, joints);
                  // newLink = new RealLink(id, joints, mass, mass_moi, CoM, subset);
                  break;
                case 'P':
                  newLink = new Piston(id, joints, mass);
                  break;
                default:
                  return;
              }
              // const newLink = new RealLink(id, joints, mass, mass_moi, shape, bound, CoM);
              // const newLink = new RealLink(id, joints);
              // const newLink = new RealLink(id, joints, shape);
              // newLink.tryNewBounds({ b1: b1, b2: b2, b3: b3, b4: b4, arrow: arrow });
              // newLink.saveBounds();
              for (let j_index = 0; j_index < joints.length - 1; j_index++) {
                for (let next_j_index = j_index + 1; next_j_index < joints.length; next_j_index++) {
                  joints[j_index].connectedJoints.push(joints[next_j_index]);
                  joints[next_j_index].connectedJoints.push(joints[j_index]);
                }
              }
              joints.forEach((j) => {
                j.links.push(newLink);
              });
              linkArray.push(newLink);
            } catch (e) {
              console.error(line);
              console.error(e);
              throw new Error('parse csv failed');
            }
            break;
          case 'force':
            try {
              const id = line[0];
              const linkId = line[1];
              const link = linkArray.find((l) => {
                return l.id === linkId;
              });
              // if (!link) { throw new Error('link referenced in force does not exist'); }
              if (!(link instanceof RealLink)) {
                return;
              }
              const start = new Coord(stringToFloat(line[2]), stringToFloat(line[3]));
              const end = new Coord(stringToFloat(line[4]), stringToFloat(line[5]));
              const global = stringToBoolean(line[6]);
              const newForce = new Force(id, link, start, end, global);
              newForce.arrowOutward = stringToBoolean(line[7]);
              newForce.mag = stringToFloat(line[8]);
              // newForce.yMag = this.stringToFloat(line[9]);
              forceArray.push(newForce);
            } catch (e) {
              console.error(line);
              console.error(e);
              throw new Error('parse csv failed');
            }
            break;
          case 'pathPoint':
            try {
              // const id = line[0];
              // const x = this.stringToFloat(line[1]);
              // const y = this.stringToFloat(line[2]);
              // const newPathPoint = new PathPoint(id, x, y);
              // const neighborOne = this.getPathPointById(line[3], pathPointArray);
              // const neighborTwo = this.getPathPointById(line[4], pathPointArray);
              // if (neighborOne !== undefined) {
              //   newPathPoint.neighbor_one = neighborOne;
              //   newPathPoint.neighbor_one.neighbor_two = newPathPoint;
              // }
              // if (neighborTwo !== undefined) {
              //   newPathPoint.neighbor_two = neighborTwo;
              //   newPathPoint.neighbor_two.neighbor_one = newPathPoint;
              // }
              // pathPointArray.push(newPathPoint);
            } catch (e) {
              console.error(line);
              console.error(e);
              throw new Error('parse csv failed');
            }
            break;
          case 'threePosition':
            try {
            } catch (e) {
              console.error(line);
              console.error(e);
              throw new Error('parse csv failed');
            }
            break;
          case 'gearSynthesis':
            try {
            } catch (e) {
              console.error(line);
              console.error(e);
              throw new Error('parse csv failed');
            }
            break;
          case 'setting':
            try {
              const input_speed_mag = stringToFloat(line[0]);
              const clockwise = stringToBoolean(line[1]);
              const gravity = stringToBoolean(line[2]);
              const unit = line[3];
              ToolbarComponent.inputAngularVelocity = input_speed_mag;
              ToolbarComponent.clockwise = clockwise;
              AnimationBarComponent.direction = ToolbarComponent.clockwise ? 'cw' : 'ccw';
              ToolbarComponent.gravity = gravity;
              // TODO: Figure out in future how to change dropdown menu to match selectedUnit without calling this/that
              // this.localUnit.selectedUnit = unit;
              // selectedUnit = unit;
              ToolbarComponent.unit = unit;
            } catch (e) {
              console.error(line);
              console.error(e);
              throw new Error('parse csv failed');
            }
            break;
        }
      }
      this.mechanismService.joints = jointArray;
      this.mechanismService.links = linkArray;
      this.mechanismService.forces = forceArray;
      this.mechanismService.updateMechanism();
    };
    reader.readAsText(input.files[0]);
    // if (selectedUnit !== '') {
    //   this.localUnit.selectedUnit = selectedUnit;
    // }
  }

  copyURL() {
    logEvent(this.analytics, 'copyURL');
    // const content = this.generateExportURL(this.mechanismService.joints, this.mechanismService.links, this.mechanismService.forces, [],
    //   [], 10, true, ToolbarComponent.gravity, ToolbarComponent.unit);
    let content = '';
    content += `j=`;
    this.mechanismService.joints.forEach((joint) => {
      if (!(joint instanceof RealJoint)) {
        return;
      }
      content += `${joint.id},`;
      content += `${roundNumber(joint.x, 3)},`;
      content += `${roundNumber(joint.y, 3)},`;
      const relatedLinkIDs = joint.links.map((link) => {
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
      if (joint instanceof PrisJoint) {
        content += `${joint.angle_rad},`;
      } else {
        content += `Null,`;
      }
      content += `${joint.input ? 't' : 'f'}`;

      // result += `${joint.coeffFriction},`; // maybe in future when coefficient of friction is taken into consideration
      content += '\n';
    });
    content += `&l=`;
    this.mechanismService.links.forEach((link) => {
      content += `${link.id},`;
      content += !(link instanceof RealLink) ? `P,` : `R,`;
      // if (!(link instanceof RealLink)) {return}
      // content += (!(link instanceof RealLink)) ? `Null,` : `${link.mass},`;
      content += `${link.mass},`;
      content += !(link instanceof RealLink) ? `Null,` : `${link.massMoI},`;
      content += !(link instanceof RealLink) ? `Null,` : `${link.CoM.x},`;
      content += !(link instanceof RealLink) ? `Null,` : `${link.CoM.y},`;
      const relatedJointIDs = link.joints.map((joint) => {
        return joint.id;
      });
      const relatedForceIDs = link.forces.map((force) => {
        return force.id;
      });

      content += `${relatedJointIDs.join('|')},`;
      content += `${relatedForceIDs.join('|')},`;
      // content += !(link instanceof RealLink) ? `Null,` : `${link.shape},`;
      // if (!(link instanceof RealLink)) {
      //   content += `Null,`;
      //   content += `Null,`;
      //   content += `Null,`;
      //   content += `Null,`;
      //   content += `Null,`;
      //   content += `Null,`;
      //   content += `Null,`;
      //   content += `Null`;
      // } else {
      //   // const bounds = link.bound;
      //   // const keyArray = [bounds.b1, bounds.b2, bounds.b3, bounds.b4];
      //   // keyArray.forEach((eid, index) => {
      //   //   content += `${roundNumber(eid.x, 3)},`;
      //   //   content +=
      //   //     index === keyArray.length - 1
      //   //       ? `${roundNumber(eid.y, 3)}`
      //   //       : `${roundNumber(eid.y, 3)},`;
      //   // });
      // }
      content += '\n';
    });

    content += `&f=`;
    this.mechanismService.forces.forEach((force) => {
      content += `${force.id},`;
      content += `${force.link.id},`;
      content += `${roundNumber(force.startCoord.x, 3)},`;
      content += `${roundNumber(force.startCoord.y, 3)},`;
      content += `${roundNumber(force.endCoord.x, 3)},`;
      content += `${roundNumber(force.endCoord.y, 3)},`;
      content += `${force.local ? 'f' : 't'},`;
      content += `${force.arrowOutward},`;
      content += `${force.mag}`;
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

    NewGridComponent.sendNotification(
      '[WARNING: Save, Open, and Copy features are under development. They will NOT reliably save your linkage! Do not close this tab if you want to come back to this.]  URL copied. If you make additional changes, copy the URL again.'
    );
  }

  alertNotAvailable() {
    //Use this.mechanismService.sendNotification() instead
    NewGridComponent.sendNotification('This feature is not available yet');
  }

  downloadLinkage() {
    logEvent(this.analytics, 'download_linkage');
    // TODO: Believe this should be this.unit.selectedUnit
    const content = this.generateExportFile(
      this.mechanismService.joints,
      this.mechanismService.links,
      this.mechanismService.forces,
      [],
      [],
      ToolbarComponent.inputAngularVelocity,
      ToolbarComponent.clockwise,
      ToolbarComponent.gravity,
      ToolbarComponent.unit
    );

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const fileName = `PMKS+_${new Date().toISOString()}.csv`;
    // if (navigator.msSaveBlob) { // IE 10+
    //   navigator.msSaveBlob(blob, fileName);
    // } else {
    const link = document.createElement('a');
    if (link.download !== undefined) {
      // feature detection
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

  generateExportURL(
    jointArray: Joint[],
    linkArray: Link[],
    forceArray: Force[],
    pathPointArray: any,
    threePositionArray: any,
    angularVelocity: number,
    clockwise: boolean,
    gravityBool: boolean,
    unit: string
  ): string {
    let result = '';
    result += `j=`;
    jointArray.forEach((joint) => {
      if (!(joint instanceof RealJoint)) {
        return;
      }
      result += `${joint.id},`;
      result += `${roundNumber(joint.x, 3)},`;
      result += `${roundNumber(joint.y, 3)},`;
      const relatedLinkIDs = joint.links.map((link) => {
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
      if (joint instanceof PrisJoint) {
        result += `${joint.angle_rad},`;
      }
      // result += `${joint.coeffFriction},`;
      result += `${joint.input ? 't' : 'f'},`;

      // result += `${joint.coeffFriction},`; // maybe in future when coefficient of friction is taken into consideration
      result += '\n';
    });
    result += `&l=`;
    linkArray.forEach((link) => {
      if (!(link instanceof RealLink)) {
        return;
      }
      result += `${link.id},`;
      result += `${link.mass},`;
      result += `${link.massMoI},`;
      result += `${link.CoM.x},`;
      result += `${link.CoM.y},`;
      const relatedJointIDs = link.joints.map((joint) => {
        return joint.id;
      });
      const relatedForceIDs = link.forces.map((force) => {
        return force.id;
      });

      result += `${relatedJointIDs.join('|')},`;
      result += `${relatedForceIDs.join('|')},`;
      // result += `${link.shape},`;
      // result += `${this.shapeFullnameToNickname(link.uiShape)}`;
      // const bounds = link.bound;
      // const keyArray = [bounds.b1, bounds.b2, bounds.b3, bounds.b4];
      // keyArray.forEach((eid) => {
      //   result += `,${roundNumber(eid.x, 3)}`;
      //   result += `,${roundNumber(eid.y, 3)}`;
      // });
      result += '\n';
    });

    result += `&f=`;
    forceArray.forEach((force) => {
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

  generateExportFile(
    jointArray: Joint[],
    linkArray: Link[],
    forceArray: Force[],
    pathPointArray: any,
    threePositionArray: any,
    input_speed_mag: number,
    clockwise: boolean,
    gravity: boolean,
    unit: string
  ): string {
    let result = '';
    result += 'joints\n';
    result += 'id,x,y,links,type,ground,angle,input\n';
    jointArray.forEach((joint) => {
      if (!(joint instanceof RealJoint)) {
        return;
      }
      result += `${joint.id},`;
      result += `${joint.x},`;
      result += `${joint.y},`;
      const relatedLinkIDs = joint.links.map((link) => {
        return link.id;
      });
      result += `${relatedLinkIDs.join('|')},`;
      switch (joint.constructor) {
        case RevJoint:
          result += `R,`;
          break;
        case PrisJoint:
          result += `P,`;
          break;
        default:
          return;
      }
      result += `${joint.ground},`;
      switch (joint.constructor) {
        case RevJoint:
          result += `Null,`;
          break;
        case PrisJoint:
          if (!(joint instanceof PrisJoint)) {
            return;
          }
          result += `${joint.angle_rad},`;
          break;
        default:
          return;
      }
      // result += `${joint.coeffFriction},`;
      result += `${joint.input}`;
      // result += `0`;
      result += '\n';
    });

    result += 'links\n';
    result +=
      'id,type,mass,mass_moi,center_of_mass_x,center_of_mass_y,joints,forces,shape,b1x,b1y,b2x,b2y,b3x,b3y,b4x,b4y\n';

    let relatedJointIDs: any;
    let relatedForceIDs: any;
    linkArray.forEach((link) => {
      switch (link.constructor) {
        case RealLink:
          if (!(link instanceof RealLink)) {
            return;
          }
          result += `${link.id},`;
          result += `R,`;
          result += `${link.mass},`;
          result += `${link.massMoI},`;
          result += `${link.CoM.x},`;
          result += `${link.CoM.y},`;
          relatedJointIDs = link.joints.map((joint) => {
            return joint.id;
          });
          relatedForceIDs = link.forces.map((force) => {
            return force.id;
          });
          result += `"${relatedJointIDs.join(',')}",`;
          result += `"${relatedForceIDs.join(',')}",`;
          // result += `${link.shape}`;
          // const bounds = link.bound;
          // const keyArray = [bounds.b1, bounds.b2, bounds.b3, bounds.b4];
          // keyArray.forEach((eid) => {
          //   result += `,${eid.x}`;
          //   result += `,${eid.y}`;
          // });
          result += '\n';
          break;
        case Piston:
          if (!(link instanceof Piston)) {
            return;
          }
          result += `${link.id},`;
          result += `P,`;
          result += `${link.mass},`;
          result += `Null,`;
          result += `Null,`;
          result += `Null,`;
          relatedJointIDs = link.joints.map((joint) => {
            return joint.id;
          });
          relatedForceIDs = link.forces.map((force) => {
            return force.id;
          });
          result += `"${relatedJointIDs.join(',')}",`;
          result += `"${relatedForceIDs.join(',')}",`;
          result += `Null,`; // Shape
          result += `Null,`; // b1
          result += `Null,`;
          result += `Null,`; // b2
          result += `Null,`;
          result += `Null,`; // b3
          result += `Null,`;
          result += `Null,`; // b4
          result += `Null`;
          result += '\n';
          break;
      }
    });

    result += 'forces\n';
    result += 'id,link,startx,starty,endx,endy,fixed,direction,mag\n';
    forceArray.forEach((force) => {
      result += `${force.id},`;
      result += `${force.link.id},`;
      result += `${force.startCoord.x},`;
      result += `${force.startCoord.y},`;
      result += `${force.endCoord.x},`;
      result += `${force.endCoord.y},`;
      result += `${!force.local},`;
      result += `${force.arrowOutward},`;
      result += `${force.mag},`;
      // result += `${force.yMag}`;
      result += '\n';
    });
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
    // result += 'threePosition\n';
    // result += 'id,x,y\n';
    // threePositionArray.forEach(force => {
    //
    //   result += '\n';
    // });
    result += 'settings\n';
    result += 'input_speed_mag,clockwise,gravity,unit\n';
    result += `${input_speed_mag},`;
    result += `${clockwise},`;
    result += `${gravity},`;
    result += `${unit}`;
    result += '\n';

    return result;
  }

  isDevMode() {
    //Used to change the color of the topbar when not running prod
    return isDevMode();
  }
}
