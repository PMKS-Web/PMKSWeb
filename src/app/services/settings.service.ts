import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { LengthUnit, AngleUnit, TorqueUnit } from '../model/utils';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  length = new BehaviorSubject(LengthUnit.CM);
  angle = new BehaviorSubject(AngleUnit.DEGREE);
  isInputCW = new BehaviorSubject(true);
  isGravity = new BehaviorSubject(false);
  inputSpeed = new BehaviorSubject(20);
  linkWidth = new BehaviorSubject(0.5);
  inputTorque = new BehaviorSubject(TorqueUnit.CM_N);

  isShowID = new BehaviorSubject(false);
  isShowCOM = new BehaviorSubject(false);

  constructor() {}
}
