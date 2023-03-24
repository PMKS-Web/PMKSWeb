import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { LengthUnit, AngleUnit, GlobalUnit, ForceUnit } from '../model/utils';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  lengthUnit = new BehaviorSubject(LengthUnit.CM);
  angleUnit = new BehaviorSubject(AngleUnit.DEGREE);
  forceUnit = new BehaviorSubject(ForceUnit.NEWTON);
  // inputTorque = new BehaviorSubject(TorqueUnit.CM_N);
  globalUnit = new BehaviorSubject(GlobalUnit.METRIC);
  isInputCW = new BehaviorSubject(true);
  isGravity = new BehaviorSubject(false);
  inputSpeed = new BehaviorSubject(20);
  animating = new BehaviorSubject(false);

  isShowID = new BehaviorSubject(false);
  isShowCOM = new BehaviorSubject(false);
  tempGridDisable: boolean = false; //This is to hide the grid lines to fit only to the linkage when doing a svg fit
  static objectScale = new BehaviorSubject(1);

  get objectScale(): number {
    return SettingsService.objectScale.value;
  }

  constructor() {}
}
