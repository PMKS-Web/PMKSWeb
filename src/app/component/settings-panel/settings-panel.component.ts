import { Component } from '@angular/core';
import { SettingsService } from 'src/app/services/settings.service';
import { LengthUnit, AngleUnit, TorqueUnit } from 'src/app/model/utils';
import { FormBuilder, Validators } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';

@Component({
  selector: 'app-settings-panel',
  templateUrl: './settings-panel.component.html',
  styleUrls: ['./settings-panel.component.scss'],
})
export class SettingsPanelComponent {
  constructor(public settingsService: SettingsService, private fb: FormBuilder) { }
  currentLengthUnit!: LengthUnit;
  currentAngleUnit!: AngleUnit;
  currentTorqueUnit!: TorqueUnit;
  rotateDirection!: boolean;
  currentSpeedSetting!: number;
  gravityEnabled!: boolean;

  ngOnInit(): void {
    this.gravityEnabled = false;
    this.currentTorqueUnit = TorqueUnit.INCH_LB;
    this.currentLengthUnit = LengthUnit.INCH;
    this.currentAngleUnit = AngleUnit.DEGREE;
    this.rotateDirection = false;
    this.currentSpeedSetting = 0;
    this.settingsForm.patchValue({
      speed: '0',
      gravity: false,
      rotation: "One",
      lengthunit: "Two",
      angleunit: "One",
      torqueunit: "Two"
    })
    this.onChanges();
  }

  onChanges(): void {
    this.settingsForm.controls['gravity'].valueChanges.subscribe((val) => {
      console.log(val)
      this.gravityEnabled = Boolean(val);
      this.settingsService.isGravity.next(this.gravityEnabled);
    });
    this.settingsForm.controls['rotation'].valueChanges.subscribe((val) => {
      console.log(val)
      this.rotateDirection = String(val) === 'One' ? true : false;
      this.settingsService.isInputCW.next(this.rotateDirection);
    });
    this.settingsForm.controls['speed'].valueChanges.subscribe((val) => {
      console.log(val)
      if (this.settingsForm.controls['speed'].invalid) {
        this.settingsForm.patchValue({ speed: this.currentSpeedSetting.toString() });
      } else {
        this.currentSpeedSetting = Number(val);
        this.settingsService.inputSpeed.next(this.currentSpeedSetting);
      }
    });
    this.settingsForm.controls['lengthunit'].valueChanges.subscribe((val) => {
      console.log(val)
      this.currentLengthUnit = ParseLengthUnit(String(val));
      this.settingsService.length.next(this.currentLengthUnit);
    });
    this.settingsForm.controls['angleunit'].valueChanges.subscribe((val) => {
      console.log(val)
      this.currentAngleUnit = ParseAngleUnit(String(val));
      this.settingsService.angle.next(this.currentAngleUnit);
    });
    this.settingsForm.controls['torqueunit'].valueChanges.subscribe((val) => {
      console.log(val)
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
}
function ParseLengthUnit(val: string | null): LengthUnit {
  switch (val) {
    case 'One':
      return LengthUnit.INCH;
    case 'Two':
      return LengthUnit.CM;
    case 'Three':
      return LengthUnit.METER;
    default:
      return LengthUnit.NULL;
  }
}

function ParseAngleUnit(val: string | null): AngleUnit {
  switch (val) {
    case 'One':
      return AngleUnit.DEGREE;
    case 'Two':
      return AngleUnit.RADIAN;
    default:
      return AngleUnit.NULL;
  }
}

function ParseTorqueUnit(val: string | null): TorqueUnit {
  switch (val) {
    case 'One':
      return TorqueUnit.INCH_LB;
    case 'Two':
      return TorqueUnit.CM_N;
    case 'Three':
      return TorqueUnit.METER_N;
    default:
      return TorqueUnit.NULL;
  }
}
