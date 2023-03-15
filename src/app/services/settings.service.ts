import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { LengthUnit, AngleUnit, TorqueUnit, GlobalUnit } from '../model/utils';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  length = new BehaviorSubject(LengthUnit.CM);
  angle = new BehaviorSubject(AngleUnit.DEGREE);
  inputTorque = new BehaviorSubject(TorqueUnit.CM_N);
  global = new BehaviorSubject(GlobalUnit.METRIC);
  isInputCW = new BehaviorSubject(true);
  isGravity = new BehaviorSubject(false);
  inputSpeed = new BehaviorSubject(20);

  isShowID = new BehaviorSubject(false);
  isShowCOM = new BehaviorSubject(false);
  tempGridDisable: boolean = false; //This is to hide the grid lines to fit only to the linkage when doing a svg fit
  static objectScale = new BehaviorSubject(1);

  get objectScale(): number {
    return SettingsService.objectScale.value;
  }

  constructor() {}
}
