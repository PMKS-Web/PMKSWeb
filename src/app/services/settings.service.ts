import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { LengthUnit, AngleUnit, GlobalUnit, ForceUnit, RotationUnit } from '../model/utils';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  lengthUnit = new BehaviorSubject(LengthUnit.CM);
  angleUnit = new BehaviorSubject(AngleUnit.DEGREE);
  forceUnit = new BehaviorSubject(ForceUnit.NEWTON);
  rotationalUnit = new BehaviorSubject(RotationUnit.RPM);
  // inputTorque = new BehaviorSubject(TorqueUnit.CM_N);
  globalUnit = new BehaviorSubject(GlobalUnit.METRIC);
  isInputCW = new BehaviorSubject(true);
  isForces = new BehaviorSubject(false);
  inputSpeed = new BehaviorSubject(20);
  animating = new BehaviorSubject(false);
  isShowMajorGrid = new BehaviorSubject(true);
  isShowMinorGrid = new BehaviorSubject(true);

  isWeldedJointsEnabled = new BehaviorSubject(false);
  isEquationsEnabled = new BehaviorSubject(false);

  isShowID = new BehaviorSubject(false);
  isShowCOM = new BehaviorSubject(false);
  tempGridDisable: boolean = false; //This is to hide the grid lines to fit only to the linkage when doing a svg fit

  isGridDebugOn: boolean = false;
  static _objectScale = new BehaviorSubject(1);

  static get objectScale(): number {
    return SettingsService._objectScale.value;
  }

  get objectScale(): number {
    return SettingsService._objectScale.value;
  }

  constructor() {}
}
