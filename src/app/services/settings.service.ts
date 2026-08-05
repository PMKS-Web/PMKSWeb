import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  LengthUnit,
  AngleUnit,
  GlobalUnit,
  ForceUnit,
  AngularVelocityUnit,
} from '../model/unit-enums';
import type { ForceAnalysisMode } from '../model/mechanism/force-solver';
import { MODEL_SCALE } from '../model/render-scale';

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
  /** Always RPM. The input panel converts for display via inputSpeedUnit. */
  inputSpeed = new BehaviorSubject(20);
  /**
   * Display unit for the input joint's speed. Chosen from the Input Settings
   * section rather than typed, so it is a view preference only — inputSpeed
   * stays in RPM and the URL format is unchanged.
   */
  inputSpeedUnit = new BehaviorSubject(AngularVelocityUnit.RPM);
  // One mechanism-wide choice, shown by every force-analysis panel.
  forceAnalysisMode = new BehaviorSubject<ForceAnalysisMode>('static');
  animating = new BehaviorSubject(false);
  isShowMajorGrid = new BehaviorSubject(true);
  isShowMinorGrid = new BehaviorSubject(true);

  isShowID = new BehaviorSubject(false);
  isShowCOM = new BehaviorSubject(false);
  tempGridDisable: boolean = false; //This is to hide the grid lines to fit only to the linkage when doing a svg fit

  isGridDebugOn: boolean = false;
  // 1 in user units; the internal world is MODEL_SCALE times larger, and every
  // visual size in the mark system is a multiple of this number.
  static _objectScale = new BehaviorSubject(1 * MODEL_SCALE);

  static get objectScale(): number {
    return SettingsService._objectScale.value;
  }

  get objectScale(): number {
    return SettingsService._objectScale.value;
  }

  constructor() {}
}
