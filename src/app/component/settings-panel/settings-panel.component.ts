import { Component } from '@angular/core';
import { SettingsService } from 'src/app/services/settings.service';
import { LengthUnit, AngleUnit, ForceUnit, GlobalUnit } from 'src/app/model/utils';
import { FormBuilder, Validators } from '@angular/forms';
import { NewGridComponent } from '../new-grid/new-grid.component';
import { MechanismService } from '../../services/mechanism.service';
import { Link, RealLink } from '../../model/link';
import { SvgGridService } from '../../services/svg-grid.service';
import { AnimationBarComponent } from '../animation-bar/animation-bar.component';
import { ToolbarComponent } from '../toolbar/toolbar.component';

@Component({
  selector: 'app-settings-panel',
  templateUrl: './settings-panel.component.html',
  styleUrls: ['./settings-panel.component.scss'],
})
export class SettingsPanelComponent {
  constructor(
    public settingsService: SettingsService,
    private fb: FormBuilder,
    public mechanismSrv: MechanismService,
    private svgGrid: SvgGridService
  ) {}

  currentLengthUnit!: LengthUnit;
  currentForceUnit!: ForceUnit;
  currentAngleUnit!: AngleUnit;
  // currentTorqueUnit!: TorqueUnit;
  currentGlobalUnit!: GlobalUnit;
  rotateDirection!: boolean;
  currentSpeedSetting!: number;
  gravityEnabled!: boolean;
  currentObjectScaleSetting!: number;

  ngOnInit(): void {
    this.gravityEnabled = this.settingsService.isGravity.value;
    this.currentLengthUnit = this.settingsService.lengthUnit.value;
    this.currentAngleUnit = this.settingsService.angleUnit.value;
    this.currentGlobalUnit = this.settingsService.globalUnit.value;
    this.rotateDirection = this.settingsService.isInputCW.value;
    this.currentSpeedSetting = this.settingsService.inputSpeed.value;
    this.currentObjectScaleSetting = SettingsService.objectScale;

    this.settingsForm.patchValue({
      speed: this.currentSpeedSetting.toString(),
      objectScale: this.currentObjectScaleSetting.toString(),
      gravity: this.gravityEnabled,
      rotation: this.rotateDirection ? '0' : '1',
      lengthunit: this.currentLengthUnit.toString(),
      angleunit: (this.currentAngleUnit - 10).toString(),
      // torqueunit: (this.currentTorqueUnit - 20).toString(),
      globalunit: (this.currentGlobalUnit - 30).toString(),
      showMajorGrid: this.settingsService.isShowMajorGrid.value,
      showMinorGrid: this.settingsService.isShowMinorGrid.value,
    });

    SettingsService._objectScale.subscribe((val) => {
      this.currentObjectScaleSetting = val;
      this.settingsForm.patchValue(
        { objectScale: this.currentObjectScaleSetting.toString() },
        { emitEvent: false }
      );

      //Werid place to put this but
      this.mechanismSrv.links.forEach((link: Link) => {
        (link as RealLink).reComputeDPath();
      });
      this.mechanismSrv.updateMechanism();
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
    this.settingsForm.controls['objectScale'].valueChanges.subscribe((val) => {
      if (this.settingsForm.controls['objectScale'].invalid) {
        this.settingsForm.patchValue({ speed: this.currentObjectScaleSetting.toString() });
      } else {
        this.currentObjectScaleSetting = Number(val);
        SettingsService._objectScale.next(this.currentObjectScaleSetting);
      }
    });
    this.settingsForm.controls['angleunit'].valueChanges.subscribe((val) => {
      this.currentAngleUnit = ParseAngleUnit(String(val));
      this.settingsService.angleUnit.next(this.currentAngleUnit);
    });
    this.settingsForm.controls['globalunit'].valueChanges.subscribe((val) => {
      this.currentGlobalUnit = ParseGlobalUnit(val);
      this.settingsService.globalUnit.next(this.currentGlobalUnit);
      // this.currentTorqueUnit = ParseTorqueUnit(val);
      // this.settingsForm.controls['torqueunit'].patchValue(String(this.currentTorqueUnit - 20));
      if (this.settingsService.globalUnit.value === GlobalUnit.ENGLISH) {
        this.currentForceUnit = ForceUnit.LBF;
      } else {
        this.currentForceUnit = ForceUnit.NEWTON;
      }
      this.settingsService.forceUnit.next(this.currentForceUnit);
      this.currentLengthUnit = ParseLengthUnit(val);
      this.settingsForm.controls['lengthunit'].patchValue(String(this.currentLengthUnit));
      this.svgGrid.scaleToFitLinkage();
      ToolbarComponent.unit = this.getUnitStr(this.settingsService.lengthUnit.value);
    });
    this.settingsForm.controls['lengthunit'].valueChanges.subscribe(() => {
      this.settingsService.lengthUnit.next(this.currentLengthUnit);
    });
    this.settingsForm.controls['showMajorGrid'].valueChanges.subscribe((val) => {
      this.settingsService.isShowMajorGrid.next(Boolean(val));
    });
    this.settingsForm.controls['showMinorGrid'].valueChanges.subscribe((val) => {
      this.settingsService.isShowMinorGrid.next(Boolean(val));
    });
    // this.settingsForm.controls['torqueunit'].valueChanges.subscribe(() => {
    //   this.settingsService.inputTorque.next(this.currentTorqueUnit);
    // });
  }

  getUnitStr(unit: LengthUnit): string {
    switch (unit) {
      case LengthUnit.CM:
        return 'cm';
      case LengthUnit.INCH:
        return 'in';
      case LengthUnit.METER:
        return 'm';
      default:
        return 'cm';
    }
  }

  numRegex = '^-?[0-9]+(.[0-9]{0,10})?$';
  settingsForm = this.fb.group(
    {
      gravity: [false, { updateOn: 'change' }],
      speed: ['', [Validators.required, Validators.pattern(this.numRegex)]],
      objectScale: ['', [Validators.required, Validators.pattern(this.numRegex)]],
      rotation: ['', { updateOn: 'change' }],
      lengthunit: ['', { updateOn: 'change' }],
      angleunit: ['', { updateOn: 'change' }],
      torqueunit: ['', { updateOn: 'change' }],
      globalunit: ['', { updateOn: 'change' }],
      showMinorGrid: [true, { updateOn: 'change' }],
      showMajorGrid: [true, { updateOn: 'change' }],
    },
    { updateOn: 'blur' }
  );

  sendComingSoon(): void {
    NewGridComponent.sendNotification('This feature is coming soon!');
  }

  updateObjectScale() {
    SettingsService._objectScale.next(Number((100 / this.svgGrid.getZoom()).toFixed(2)));
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

// function ParseTorqueUnit(val: string | null): TorqueUnit {
//   switch (val) {
//     case '0':
//       return TorqueUnit.INCH_LB;
//     case '1':
//       return TorqueUnit.CM_N;
//     case '2':
//       return TorqueUnit.METER_N;
//     default:
//       return TorqueUnit.CM_N;
//   }
// }
