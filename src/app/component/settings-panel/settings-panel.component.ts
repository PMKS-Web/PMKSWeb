import { Component, ChangeDetectionStrategy, OnDestroy } from '@angular/core';
import { SettingsService } from 'src/app/services/settings.service';
import { LengthUnit, AngleUnit, ForceUnit, GlobalUnit } from 'src/app/model/utils';
import { FormBuilder, Validators } from '@angular/forms';
import { MechanismService } from '../../services/mechanism.service';
import { Link, RealLink } from '../../model/link';
import { SvgGridService } from '../../services/svg-grid.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { Coord } from '../../model/coord';
import { combineLatest, Subscription } from 'rxjs';
import { MODEL_SCALE } from '../../model/render-scale';

@Component({
  selector: 'app-settings-panel',
  templateUrl: './settings-panel.component.html',
  styleUrls: ['./settings-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SettingsPanelComponent implements OnDestroy {
  constructor(
    public settingsService: SettingsService,
    private fb: FormBuilder,
    public mechanismSrv: MechanismService,
    private svgGrid: SvgGridService,
    private nup: NumberUnitParserService
  ) {}

  currentLengthUnit!: LengthUnit;
  currentForceUnit!: ForceUnit;
  currentAngleUnit!: AngleUnit;
  // currentTorqueUnit!: TorqueUnit;
  currentGlobalUnit!: GlobalUnit;
  currentObjectScaleSetting!: number;
  private readonly settingsSubscriptions = new Subscription();

  ngOnInit(): void {
    this.currentLengthUnit = this.settingsService.lengthUnit.value;
    this.currentForceUnit = this.settingsService.forceUnit.value;
    this.currentAngleUnit = this.settingsService.angleUnit.value;
    this.currentGlobalUnit = this.settingsService.globalUnit.value;
    // The form shows the scale in the user's frame; internally it is
    // MODEL_SCALE times larger (render-scale.ts), like every other length.
    this.currentObjectScaleSetting = SettingsService.objectScale / MODEL_SCALE;

    this.settingsForm.patchValue({
      objectScale: this.currentObjectScaleSetting.toString(),
      lengthunit: this.currentLengthUnit.toString(),
      angleunit: (this.currentAngleUnit - 10).toString(),
      // torqueunit: (this.currentTorqueUnit - 20).toString(),
      globalunit: (this.currentGlobalUnit - 30).toString(),
      showMajorGrid: this.settingsService.isShowMajorGrid.value,
      showMinorGrid: this.settingsService.isShowMinorGrid.value,
    });

    this.settingsSubscriptions.add(
      SettingsService._objectScale.subscribe((val) => {
        this.currentObjectScaleSetting = val / MODEL_SCALE;
        this.settingsForm.patchValue(
          { objectScale: this.currentObjectScaleSetting.toString() },
          { emitEvent: false }
        );

        // This used to cast every Link to RealLink and call reComputeDPath,
        // which throws on the first SliderBlock and abandons every link after
        // it -- so any mechanism with a slider logged a TypeError the moment
        // Settings opened. The service does it now, guarded by type.
        this.mechanismSrv.applyObjectScaleChange();
      })
    );

    this.onChanges();
    this.bindSerializedSettings();
  }

  /** Keep an already-open settings panel synchronized after URL restore/undo. */
  private bindSerializedSettings(): void {
    this.settingsSubscriptions.add(
      combineLatest([
        this.settingsService.lengthUnit,
        this.settingsService.angleUnit,
        this.settingsService.forceUnit,
        this.settingsService.globalUnit,
        this.settingsService.isShowMajorGrid,
        this.settingsService.isShowMinorGrid,
      ]).subscribe(([length, angle, force, global, showMajorGrid, showMinorGrid]) => {
        this.currentLengthUnit = length;
        this.currentAngleUnit = angle;
        this.currentForceUnit = force;
        this.currentGlobalUnit = global;
        this.settingsForm.patchValue(
          {
            lengthunit: length.toString(),
            angleunit: (angle - 10).toString(),
            globalunit: (global - 30).toString(),
            showMajorGrid,
            showMinorGrid,
          },
          { emitEvent: false }
        );
      })
    );
  }

  ngOnDestroy(): void {
    this.settingsSubscriptions.unsubscribe();
  }

  onChanges(): void {
    this.settingsForm.controls['objectScale'].valueChanges.subscribe((val) => {
      const parsed = Number(val);
      // The pattern is the gate the user sees; this is the one that protects the
      // canvas. Every dimension in the mark system is a multiple of this number,
      // so a NaN or a zero does not degrade the drawing -- it erases it, behind
      // dozens of invalid-SVG errors.
      if (
        this.settingsForm.controls['objectScale'].invalid ||
        !Number.isFinite(parsed) ||
        parsed <= 0
      ) {
        // Restore the last good scale into its own field, not the speed field.
        this.settingsForm.patchValue({ objectScale: this.currentObjectScaleSetting.toString() });
      } else {
        this.currentObjectScaleSetting = parsed;
        SettingsService._objectScale.next(this.currentObjectScaleSetting * MODEL_SCALE);
      }
      this.mechanismSrv.updateMechanism();
    });
    this.settingsForm.controls['angleunit'].valueChanges.subscribe((val) => {
      this.currentAngleUnit = ParseAngleUnit(String(val));
      this.settingsService.angleUnit.next(this.currentAngleUnit);
      this.mechanismSrv.updateMechanism();
    });
    this.settingsForm.controls['globalunit'].valueChanges.subscribe((val) => {
      this.currentGlobalUnit = ParseGlobalUnit(val);
      this.settingsService.globalUnit.next(this.currentGlobalUnit);
      this.currentForceUnit =
        this.currentGlobalUnit === GlobalUnit.ENGLISH ? ForceUnit.LBF : ForceUnit.NEWTON;
      this.settingsService.forceUnit.next(this.currentForceUnit);
      // A global-unit change is, for the geometry, a length-unit change. Route
      // it through the one method that rescales the mechanism so this path and
      // the length control can never diverge.
      this.changeLengthUnit(ParseLengthUnit(val));
    });
    this.settingsForm.controls['lengthunit'].valueChanges.subscribe((val) => {
      let length: LengthUnit;
      if (val === '0') length = LengthUnit.INCH;
      else if (val === '1') length = LengthUnit.CM;
      else length = LengthUnit.METER;
      this.changeLengthUnit(length);
    });
    this.settingsForm.controls['showMajorGrid'].valueChanges.subscribe((val) => {
      this.settingsService.isShowMajorGrid.next(Boolean(val));
      this.mechanismSrv.updateMechanism();
    });
    this.settingsForm.controls['showMinorGrid'].valueChanges.subscribe((val) => {
      this.settingsService.isShowMinorGrid.next(Boolean(val));
      this.mechanismSrv.updateMechanism();
    });
    // this.settingsForm.controls['torqueunit'].valueChanges.subscribe(() => {
    //   this.settingsService.inputTorque.next(this.currentTorqueUnit);
    // });
  }

  /**
   * The single length-unit switch. Both the Global Units radio and the internal
   * length control funnel here so a unit change always rescales the mechanism's
   * stored geometry, mass, inertia, and forces — never just relabels them.
   */
  private changeLengthUnit(toUnit: LengthUnit): void {
    const fromUnit = this.settingsService.lengthUnit.value;
    this.currentLengthUnit = toUnit;
    this.settingsService.lengthUnit.next(toUnit);
    this.settingsForm.controls['lengthunit'].patchValue(String(toUnit), { emitEvent: false });
    if (fromUnit === toUnit) return;

    this.mechanismSrv.updateLinkageUnits(fromUnit, toUnit);

    // Compensate the viewport zoom so the mechanism keeps its apparent size,
    // then scale visual affordances to match.
    const tempOriginInScreen = this.svgGrid.SVGtoScreen(new Coord(0, 0));
    this.svgGrid.panZoomObject.zoomAtPointBy(this.nup.convertLength(1, toUnit, fromUnit), {
      x: tempOriginInScreen.x,
      y: tempOriginInScreen.y,
    });
    SettingsService._objectScale.next(
      this.nup.convertLength(SettingsService.objectScale, fromUnit, toUnit)
    );

    // Update graphs with the new units.
    this.mechanismSrv.onMechUpdateState.next(2);
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

  // The dot is escaped, and the scale has to be positive. Unescaped, `.` matched
  // any character, so "1x2" validated, Number() turned it into NaN, and the NaN
  // reached every mark on the canvas -- the mechanism vanished behind dozens of
  // invalid-SVG errors. A zero or negative scale is just as unusable: every
  // dimension in the mark system is a multiple of it.
  numRegex = '^[0-9]*\\.?[0-9]+$';
  settingsForm = this.fb.group(
    {
      objectScale: ['', [Validators.required, Validators.pattern(this.numRegex)]],
      lengthunit: ['', { updateOn: 'change' }],
      angleunit: ['', { updateOn: 'change' }],
      torqueunit: ['', { updateOn: 'change' }],
      globalunit: ['', { updateOn: 'change' }],
      showMinorGrid: [true, { updateOn: 'change' }],
      showMajorGrid: [true, { updateOn: 'change' }],
    },
    { updateOn: 'blur' }
  );

  updateObjectScale() {
    this.svgGrid.updateObjectScale();
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
