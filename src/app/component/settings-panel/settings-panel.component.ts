import { Component } from '@angular/core';
import { SettingsService } from 'src/app/services/settings.service';
import { LengthUnit, AngleUnit, TorqueUnit, GlobalUnit } from 'src/app/model/utils';
import { FormBuilder, Validators } from '@angular/forms';
import { NewGridComponent } from '../new-grid/new-grid.component';
import { MechanismService } from '../../services/mechanism.service';
import { Link } from '../../model/link';

@Component({
  selector: 'app-settings-panel',
  templateUrl: './settings-panel.component.html',
  styleUrls: ['./settings-panel.component.scss'],
})
export class SettingsPanelComponent {
  constructor(
    public settingsService: SettingsService,
    private fb: FormBuilder,
    public mechanismSrv: MechanismService
  ) { }

  currentLengthUnit!: LengthUnit;
  currentAngleUnit!: AngleUnit;
  currentTorqueUnit!: TorqueUnit;
  currentGlobalUnit!: GlobalUnit;
  rotateDirection!: boolean;
  currentSpeedSetting!: number;
  gravityEnabled!: boolean;
  currentWidthSetting!: number;

  ngOnInit(): void {
    this.gravityEnabled = this.settingsService.isGravity.value;
    this.currentTorqueUnit = this.settingsService.inputTorque.value;
    this.currentLengthUnit = this.settingsService.length.value;
    this.currentAngleUnit = this.settingsService.angle.value;
    this.currentGlobalUnit = this.settingsService.global.value;
    this.rotateDirection = this.settingsService.isInputCW.value;
    this.currentSpeedSetting = this.settingsService.inputSpeed.value;
    this.currentWidthSetting = SettingsService.objectScale.value;
    this.settingsForm.patchValue({
      speed: this.currentSpeedSetting.toString(),
      width: this.currentWidthSetting.toString(),
      gravity: this.gravityEnabled,
      rotation: this.rotateDirection ? '0' : '1',
      lengthunit: this.currentLengthUnit.toString(),
      angleunit: (this.currentAngleUnit - 10).toString(),
      torqueunit: (this.currentTorqueUnit - 20).toString(),
      globalunit: (this.currentGlobalUnit - 30).toString(),
    });
    this.onChanges();

    SettingsService.objectScale.subscribe((val) => {
      this.currentWidthSetting = val;
      this.settingsForm.patchValue(
        { width: this.currentWidthSetting.toString() },
        { emitEvent: false }
      );
    });
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
    this.settingsForm.controls['width'].valueChanges.subscribe((val) => {
      if (this.settingsForm.controls['width'].invalid) {
        this.settingsForm.patchValue({ speed: this.currentWidthSetting.toString() });
      } else {
        this.currentWidthSetting = Number(val);
        SettingsService.objectScale.next(this.currentWidthSetting);
      }
    });
    this.settingsForm.controls['angleunit'].valueChanges.subscribe((val) => {
      this.currentAngleUnit = ParseAngleUnit(String(val));
      this.settingsService.angle.next(this.currentAngleUnit);
    });
    this.settingsForm.controls['globalunit'].valueChanges.subscribe((val) => {
      this.currentGlobalUnit = ParseGlobalUnit(val);
      this.settingsService.global.next(this.currentGlobalUnit);
      this.currentTorqueUnit = ParseTorqueUnit(val);
      this.settingsForm.controls['torqueunit'].patchValue(String(this.currentTorqueUnit - 20));
      this.currentLengthUnit = ParseLengthUnit(val);
      this.settingsForm.controls['lengthunit'].patchValue(String(this.currentLengthUnit));
    });
    this.settingsForm.controls['lengthunit'].valueChanges.subscribe(() => {
      this.settingsService.length.next(this.currentLengthUnit);
    });
    this.settingsForm.controls['torqueunit'].valueChanges.subscribe(() => {
      this.settingsService.inputTorque.next(this.currentTorqueUnit);
    });
  }

  numRegex = '^-?[0-9]+(.[0-9]{0,10})?$';
  settingsForm = this.fb.group(
    {
      gravity: [false, { updateOn: 'change' }],
      speed: ['', [Validators.required, Validators.pattern(this.numRegex)]],
      width: ['', [Validators.required, Validators.pattern(this.numRegex)]],
      rotation: ['', { updateOn: 'change' }],
      lengthunit: ['', { updateOn: 'change' }],
      angleunit: ['', { updateOn: 'change' }],
      torqueunit: ['', { updateOn: 'change' }],
      globalunit: ['', { updateOn: 'change' }],
    },
    { updateOn: 'blur' }
  );

  sendComingSoon(): void {
    NewGridComponent.sendNotification('This feature is coming soon!');
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
      return LengthUnit.CM;
  }
}

function ParseAngleUnit(val: string | null): AngleUnit {
  switch (val) {
    case '0':
      return AngleUnit.DEGREE;
    case '1':
      return AngleUnit.RADIAN;
    default:
      return AngleUnit.DEGREE;
  }
}

function ParseGlobalUnit(val: string | null): GlobalUnit {
  switch (val) {
    case '0':
      return GlobalUnit.ENGLISH;
    case '1':
      return GlobalUnit.METRIC;
    case '2':
      return GlobalUnit.SI;
    default:
      return GlobalUnit.METRIC;
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
      return TorqueUnit.CM_N;
  }
}
