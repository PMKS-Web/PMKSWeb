import { Component } from '@angular/core';
import { SettingsService } from 'src/app/services/settings.service';
import { LengthUnit, AngleUnit, TorqueUnit } from 'src/app/model/utils';
import { FormBuilder, Validators } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { GridComponent } from '../grid/grid.component';

@Component({
  selector: 'app-settings-panel',
  templateUrl: './settings-panel.component.html',
  styleUrls: ['./settings-panel.component.scss'],
})
export class SettingsPanelComponent {
  constructor(public settingsService: SettingsService, private fb: FormBuilder) {}
  currentLengthUnit!: LengthUnit;
  currentAngleUnit!: AngleUnit;
  currentTorqueUnit!: TorqueUnit;
  rotateDirection!: boolean;
  currentSpeedSetting!: number;
  gravityEnabled!: boolean;

  ngOnInit(): void {
    this.gravityEnabled = this.settingsService.isGravity.value;
    this.currentTorqueUnit = this.settingsService.inputTorque.value;
    this.currentLengthUnit = this.settingsService.length.value;
    this.currentAngleUnit = this.settingsService.angle.value;
    this.rotateDirection = this.settingsService.isInputCW.value;
    this.currentSpeedSetting = this.settingsService.inputSpeed.value;
    this.settingsForm.patchValue({
      speed: this.currentSpeedSetting.toString(),
      gravity: this.gravityEnabled,
      rotation: this.rotateDirection ? '0' : '1',
      lengthunit: this.currentLengthUnit.toString(),
      angleunit: (this.currentAngleUnit - 10).toString(),
      torqueunit: (this.currentTorqueUnit - 20).toString(),
    });
    this.onChanges();
  }

  onChanges(): void {
    this.settingsForm.controls['gravity'].valueChanges.subscribe((val) => {
      this.gravityEnabled = Boolean(val);
      this.settingsService.isGravity.next(this.gravityEnabled);
    });
    this.settingsForm.controls['rotation'].valueChanges.subscribe((val) => {
      this.rotateDirection = String(val) === '0' ? true : false;
      this.settingsService.isInputCW.next(this.rotateDirection);
    });
    this.settingsForm.controls['speed'].valueChanges.subscribe((val) => {
      if (this.settingsForm.controls['speed'].invalid) {
        this.settingsForm.patchValue({ speed: this.currentSpeedSetting.toString() });
      } else {
        this.currentSpeedSetting = Number(val);
        this.settingsService.inputSpeed.next(this.currentSpeedSetting);
      }
    });
    this.settingsForm.controls['lengthunit'].valueChanges.subscribe((val) => {
      this.currentLengthUnit = ParseLengthUnit(String(val));
      this.settingsService.length.next(this.currentLengthUnit);
    });
    this.settingsForm.controls['angleunit'].valueChanges.subscribe((val) => {
      this.currentAngleUnit = ParseAngleUnit(String(val));
      this.settingsService.angle.next(this.currentAngleUnit);
    });
    this.settingsForm.controls['torqueunit'].valueChanges.subscribe((val) => {
      this.currentTorqueUnit = ParseTorqueUnit(String(val));
      this.settingsService.inputTorque.next(this.currentTorqueUnit);
    });
  }

  numRegex = '^-?[0-9]+(.[0-9]{0,10})?$';
  settingsForm = this.fb.group(
    {
      gravity: [false, { updateOn: 'change' }],
      speed: ['', [Validators.required, Validators.pattern(this.numRegex)]],
      rotation: ['', { updateOn: 'change' }],
      lengthunit: ['', { updateOn: 'change' }],
      angleunit: ['', { updateOn: 'change' }],
      torqueunit: ['', { updateOn: 'change' }],
    },
    { updateOn: 'blur' }
  );

  sendComingSoon(): void {
    GridComponent.sendNotification('This feature is coming soon!');
  }
}

function ParseLengthUnit(val: string | null): LengthUnit {
  switch (val) {
    case '0':
      return LengthUnit.INCH;
    case '1':
      return LengthUnit.CM;
    case '2':
      return LengthUnit.METER;
    default:
      return LengthUnit.NULL;
  }
}

function ParseAngleUnit(val: string | null): AngleUnit {
  switch (val) {
    case '0':
      return AngleUnit.DEGREE;
    case '1':
      return AngleUnit.RADIAN;
    default:
      return AngleUnit.NULL;
  }
}

function ParseTorqueUnit(val: string | null): TorqueUnit {
  switch (val) {
    case '0':
      return TorqueUnit.INCH_LB;
    case '1':
      return TorqueUnit.CM_N;
    case '2':
      return TorqueUnit.METER_N;
    default:
      return TorqueUnit.NULL;
  }
}
