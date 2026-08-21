import { SelectedTabService, TabID } from '../../selected-tab.service';
import { environment } from '../../../environments/environment';
import { Component, ChangeDetectionStrategy, OnDestroy, inject } from '@angular/core';
import { SettingsService, writeStoredFlag } from 'src/app/services/settings.service';
import { LengthUnit, AngleUnit, ForceUnit, GlobalUnit } from 'src/app/model/utils';
import { FormBuilder, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MechanismService } from '../../services/mechanism.service';
import { SvgGridService } from '../../services/svg-grid.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { Coord } from '../../model/coord';
import { combineLatest, skip, Subscription } from 'rxjs';
import { MODEL_SCALE } from '../../model/render-scale';
import { PanelSectionComponent } from '../BLOCKS/panel-section/panel-section.component';
import { TitleBlock } from '../BLOCKS/title/title.component';
import { CollapsibleSubsecitonComponent } from '../BLOCKS/collapsible-subseciton/collapsible-subseciton.component';
import { RadioComponent } from '../BLOCKS/radio/radio.component';
import { ToggleComponent } from '../BLOCKS/toggle/toggle.component';
import { InputComponent } from '../BLOCKS/input/input.component';
import { ButtonComponent } from '../BLOCKS/button/button.component';

@Component({
  selector: 'app-settings-panel',
  templateUrl: './settings-panel.component.html',
  styleUrls: ['./settings-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    PanelSectionComponent,
    TitleBlock,
    CollapsibleSubsecitonComponent,
    RadioComponent,
    FormsModule,
    ReactiveFormsModule,
    ToggleComponent,
    InputComponent,
    ButtonComponent,
  ],
})
export class SettingsPanelComponent implements OnDestroy {
  settingsService = inject(SettingsService);
  private fb = inject(FormBuilder);
  mechanismSrv = inject(MechanismService);
  private svgGrid = inject(SvgGridService);
  private nup = inject(NumberUnitParserService);
  private tabs = inject(SelectedTabService);

  readonly appVersion = environment.appVersion;

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
      snapToGrid: this.settingsService.isSnapToGrid.value,
      snapToAlignment: this.settingsService.isSnapToAlignment.value,
      gravity: this.settingsService.isGravity.value,
    });

    this.settingsSubscriptions.add(
      // `skip(1)`, because this is a BehaviorSubject: subscribing to it hands
      // back the value the drawing is *already* drawn at, and acting on that
      // re-derived every link's outline and re-solved every mechanism from
      // scratch. On a forty-five joint linkage that is seven seconds of work to
      // arrive at the picture already on screen -- which is why opening
      // Settings, which changes nothing, was the slowest thing in the app.
      SettingsService._objectScale.pipe(skip(1)).subscribe((val) => {
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
        this.settingsService.isGravity,
      ]).subscribe(([length, angle, force, global, showMajorGrid, showMinorGrid, gravity]) => {
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
            gravity,
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
    // Remembered on this machine rather than written to the URL: see
    // SettingsService.isSnapToGrid.
    this.settingsForm.controls['snapToGrid'].valueChanges.subscribe((val) => {
      const on = val === true;
      this.settingsService.isSnapToGrid.next(on);
      writeStoredFlag('snapToGrid', on);
    });

    this.settingsForm.controls['snapToAlignment'].valueChanges.subscribe((val) => {
      const on = val === true;
      this.settingsService.isSnapToAlignment.next(on);
      writeStoredFlag('snapToAlignment', on);
    });

    this.settingsForm.controls['showMinorGrid'].valueChanges.subscribe((val) => {
      this.settingsService.isShowMinorGrid.next(Boolean(val));
      this.mechanismSrv.updateMechanism();
    });
    // Gravity changes what the force analysis means, so it is an edit: the
    // mechanisms are rebuilt with the new flag and the change is undoable.
    this.settingsForm.controls['gravity'].valueChanges.subscribe((val) => {
      const on = val === true;
      if (on === this.settingsService.isGravity.value) return;
      this.settingsService.isGravity.next(on);
      this.mechanismSrv.updateMechanism(true);
      // An open force graph is plotting the old gravity; ask for a redraw the
      // same way a unit change does.
      this.mechanismSrv.onMechUpdateState.next(2);
    });
  }

  /**
   * The single length-unit switch. Both the Global Units radio and the internal
   * length control funnel here so a unit change always rescales the mechanism's
   * stored geometry, mass, inertia, and forces — never just relabels them.
   */
  /**
   * A unit change rescales the drawing's stored geometry, so it is an edit.
   *
   * The analysis modes lock the geometry, and Synthesis is writing its own --
   * changing what a number means underneath either of them is the same class
   * of surprise the lock exists to prevent.
   */
  unitsEditable(): boolean {
    return this.tabs.getCurrentTab() === TabID.EDIT && !this.settingsService.animating.value;
  }

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
      snapToGrid: [false, { updateOn: 'change' }],
      snapToAlignment: [true, { updateOn: 'change' }],
      gravity: [true, { updateOn: 'change' }],
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
