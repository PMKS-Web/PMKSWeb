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
import {
  AngleUnit,
  ForceUnit,
  GlobalUnit,
  LengthUnit,
  roundNumber,
  stringToBoolean,
  stringToFloat,
  stringToShape,
} from '../../model/utils';
import { ForceSolver } from '../../model/mechanism/force-solver';
import { AnimationBarComponent } from '../animation-bar/animation-bar.component';
import { LinkageTableComponent } from '../linkage-table/linkage-table.component';
import { KinematicsSolver } from '../../model/mechanism/kinematic-solver';
import { Coord } from '../../model/coord';
// import { TemplatesPopupComponent } from '../templates-popup/templates-popup.component';

import { ActiveObjService } from 'src/app/services/active-obj.service';
import { RightPanelComponent } from '../right-panel/right-panel.component';
import { MechanismService } from '../../services/mechanism.service';
import { NewGridComponent } from '../new-grid/new-grid.component';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { UrlProcessorService } from '../../services/url-processor.service';
import { MatDialog } from '@angular/material/dialog';
import { TemplatesComponent } from '../MODALS/templates/templates.component';
import { StringTranscoder } from 'src/app/services/transcoding/string-transcoder';
import {
  ForceData,
  JOINT_TYPE,
  JointData,
  LINK_TYPE,
  LinkData,
} from 'src/app/services/transcoding/transcoder-data';
import { SettingsService } from 'src/app/services/settings.service';
import {
  BoolSetting,
  DecimalSetting,
  EnumSetting,
  IntSetting,
} from 'src/app/services/transcoding/stored-settings';
<<<<<<< HEAD
import { UrlGenerationService } from 'src/app/services/url-generation.service';
import { SaveHistoryService } from 'src/app/services/save-history.service';
=======
>>>>>>> main

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
  static instance: ToolbarComponent;

  constructor(
    private activeObjService: ActiveObjService,
    private mechanismService: MechanismService,
    private urlGenerationService: UrlGenerationService,
    private urlProcessorService: UrlProcessorService,
    private saveHistoryService: SaveHistoryService,
    public dialog: MatDialog,
    public settings: SettingsService
<<<<<<< HEAD
  ) {}
=======
  ) {
    ToolbarComponent.instance = this;
  }

  //Create a static method to get an instance of the toolbar component
>>>>>>> main

  openTemplates() {
    this.dialog.open(TemplatesComponent, {
      height: '90%',
      width: '90%',
      autoFocus: false,
    });
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

  // popUpTemplates() {
  //   TemplatesPopupComponent.showTemplates();
  //   logEvent(this.analytics, 'open_templates');
  // }

  upload($event: any) {
    console.log("upload");
    logEvent(this.analytics, 'upload_file');
    const input = $event.target;
    if (input.files.length !== 1) {
      console.log('No file selected', input.files.length);
      return;
    }
    const reader = new FileReader();

    reader.onload = () => {
      const data = reader.result as string;
      console.log("open", data);

<<<<<<< HEAD
      this.urlProcessorService.updateFromURL(data);
=======
  _addJointToEncoder(encoder: StringTranscoder, joint: Joint) {
    if (joint instanceof RevJoint) {
      encoder.addJoint(
        new JointData(
          JOINT_TYPE.REVOLUTE,
          joint.id,
          joint.name,
          joint.x,
          joint.y,
          joint.ground,
          joint.input,
          joint.isWelded,
          0,
          joint.showCurve
        )
      );
    } else if (joint instanceof PrisJoint) {
      encoder.addJoint(
        new JointData(
          JOINT_TYPE.PRISMATIC,
          joint.id,
          joint.name,
          joint.x,
          joint.y,
          joint.ground,
          joint.input,
          joint.isWelded,
          joint.angle_rad,
          joint.showCurve
        )
      );
>>>>>>> main
    }

<<<<<<< HEAD
    // actually read the file to call the onload callback above
    reader.readAsText(input.files[0]);
  }
=======
  _addLinkToEncoder(encoder: StringTranscoder, link: Link, isRoot: boolean) {
    if (link instanceof RealLink) {
      encoder.addLink(
        new LinkData(
          isRoot,
          LINK_TYPE.REAL,
          link.id,
          link.name,
          link.mass,
          link.massMoI,
          link.CoM.x,
          link.CoM.y,
          link.fill,
          link.joints.map((joint) => joint.id),
          link.subset.map((subset) => subset.id)
        )
      );
    } else if (link instanceof Piston) {
      encoder.addLink(
        new LinkData(
          isRoot,
          LINK_TYPE.PISTON,
          link.id,
          link.name,
          link.mass,
          0,
          0,
          0,
          '',
          link.joints.map((joint) => joint.id),
          []
        )
      );
    }
  }

  _addForceToEncoder(encoder: StringTranscoder, force: Force) {
    encoder.addForce(
      new ForceData(
        force.id,
        force.link.id,
        force.name,
        force.startCoord.x,
        force.startCoord.y,
        force.endCoord.x,
        force.endCoord.y,
        force.local,
        force.arrowOutward,
        force.mag
      )
    );
  }

>>>>>>> main
  /*
   *  Copy the URL of the current mechanism to the clipboard
   */
  copyURL() {
    logEvent(this.analytics, 'copyURL');

<<<<<<< HEAD
    let urlQuery = this.urlGenerationService.generateUrlQuery();
=======
    let dataURL = this.createURL();

    console.log(dataURL.length);
    if (dataURL.length > 2000) {
      // IndiFuncs.showErrorNotification('linkage too large, please use export file');
      NewGridComponent.sendNotification('Linkage too large, please use "Save"');
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

  createURL(): string {
    // First, reset animation to the beginning, but cache animation frame to restore afterwards
    let cachedAnimationFrame = this.mechanismService.mechanismTimeStep;
    if (cachedAnimationFrame > 0) this.mechanismService.animate(0, false);

    let encoder = new StringTranscoder();

    // add each joint
    this.mechanismService.joints.forEach((joint) => {
      this._addJointToEncoder(encoder, joint);
    });

    // add each (non-subset) link
    this.mechanismService.links.forEach((link) => {
      this._addLinkToEncoder(encoder, link, true);
    });

    // for each link, add subset links
    this.mechanismService.links.forEach((link) => {
      if (link instanceof RealLink) {
        link.subset.forEach((subsetLink) => {
          this._addLinkToEncoder(encoder, subsetLink, false);
        });
      }
    });

    this.mechanismService.forces.forEach((force) => {
      this._addForceToEncoder(encoder, force);
    });

    // Encode global settings
    encoder.addEnumSetting(
      EnumSetting.LENGTH_UNIT,
      LengthUnit,
      this.settings.lengthUnit.getValue()
    );
    encoder.addEnumSetting(EnumSetting.ANGLE_UNIT, AngleUnit, this.settings.angleUnit.getValue());
    encoder.addEnumSetting(EnumSetting.FORCE_UNIT, ForceUnit, this.settings.forceUnit.getValue());
    encoder.addEnumSetting(
      EnumSetting.GLOBAL_UNIT,
      GlobalUnit,
      this.settings.globalUnit.getValue()
    );
    encoder.addBoolSetting(BoolSetting.IS_INPUT_CW, this.settings.isInputCW.getValue());
    encoder.addBoolSetting(BoolSetting.IS_GRAVITY, this.settings.isForces.getValue());
    encoder.addIntSetting(IntSetting.INPUT_SPEED, this.settings.inputSpeed.getValue());
    encoder.addBoolSetting(
      BoolSetting.IS_SHOW_MAJOR_GRID,
      this.settings.isShowMajorGrid.getValue()
    );
    encoder.addBoolSetting(
      BoolSetting.IS_SHOW_MINOR_GRID,
      this.settings.isShowMinorGrid.getValue()
    );
    encoder.addBoolSetting(BoolSetting.IS_SHOW_ID, this.settings.isShowID.getValue());
    encoder.addBoolSetting(BoolSetting.IS_SHOW_COM, this.settings.isShowCOM.getValue());
    encoder.addDecimalSetting(DecimalSetting.SCALE, this.settings.objectScale);

    encoder.addIntSetting(IntSetting.TIMESTEP, cachedAnimationFrame);

    let urlRaw = encoder.encodeURL();

    // Restore animation frame
    if (cachedAnimationFrame > 0) this.mechanismService.animate(cachedAnimationFrame, false);
>>>>>>> main

    const url = this.getURL();
    const dataURLString = `${url}?${urlQuery}`;
    const dataURL = encodeURI(dataURLString);
    return dataURL;
  }

  alertNotAvailable() {
    //Use this.mechanismService.sendNotification() instead
    NewGridComponent.sendNotification('This feature is not available yet');
  }

  downloadLinkage() {
    logEvent(this.analytics, 'download_linkage');
    // TODO: Believe this should be this.unit.selectedUnit
    const content = this.urlGenerationService.generateUrlQuery();

    const blob = new Blob([content], { type: 'text;charset=utf-8;' });
    const fileName = `PMKS+_${new Date().toISOString()}.pmks`;
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


  isDevMode() {
    //Used to change the color of the topbar when not running prod
    return isDevMode();
  }

  handleUndo() {
    NewGridComponent.sendNotification('Undo Called!', 0);
    this.saveHistoryService.undo()
  }

  canUndo(): boolean {
    return this.saveHistoryService.canUndo();
  }

  handleRedo() {
    NewGridComponent.sendNotification('Redo Called!', 0);
    this.saveHistoryService.redo()
  }

  canRedo(): boolean {
    return this.saveHistoryService.canRedo();
  }
}
