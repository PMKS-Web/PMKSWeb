import { Component, Input, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatCheckboxHarness } from '@angular/material/checkbox/testing';
import { MatIconModule } from '@angular/material/icon';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ApexAxisChartSeries } from 'apexcharts';
import { RealJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { ForceSolver } from '../../model/mechanism/force-solver';
import { KinematicsSolver } from '../../model/mechanism/kinematic-solver';
import { ForceUnit, LengthUnit } from '../../model/unit-enums';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { BUILT_IN_TEMPLATE_IDS, TEMPLATE_LINKAGES } from '../MODALS/templates/template-linkages';
import {
  buildMechanismFixture,
  COMPLEX_WELDED_MECHANISM,
  LEGACY_FORCE_MECHANISM,
  LOOPLESS_WELDED_MECHANISM,
  MechanismFixture,
} from '../../../tests/fixtures/mechanism-fixtures';
import {
  ANALYSIS_SERIES_COLORS,
  AnalysisGraphComponent,
  formatTimeLabel,
} from './analysis-graph.component';

@Component({
  selector: 'app-analysis-apex-chart',
  template: '',
  standalone: false,
})
class ApexChartStubComponent {
  @Input() series: ApexAxisChartSeries = [];
  @Input() annotations: unknown;
  @Input() chart: unknown;
  @Input() colors: unknown;
  @Input() yaxis: unknown;
  @Input() dataLabels: unknown;
  @Input() markers: unknown;
  @Input() stroke: unknown;
  @Input() grid: unknown;
  @Input() xaxis: unknown;
  @Input() tooltip: unknown;
  @Input() legend: unknown;

  addPointAnnotation = vi.fn();
  addXaxisAnnotation = vi.fn();
  clearAnnotations = vi.fn();
  updateOptions = vi.fn();
}

const KINEMATIC_GRAPHS: Array<[string, number]> = [
  ['Linear Joint Pos', 2],
  ['Linear Joint Vel', 3],
  ['Linear Joint Acc', 3],
  ["Linear Link's CoM Pos", 2],
  ["Linear Link's CoM Vel", 3],
  ["Linear Link's CoM Acc", 3],
  ['Angular Link Pos', 1],
  ['Angular Link Vel', 1],
  ['Angular Link Acc', 1],
];

const PRODUCTION_FIXTURES = [
  ...BUILT_IN_TEMPLATE_IDS.map((id) => [id, TEMPLATE_LINKAGES[id]] as const),
  ['complex welded URL', COMPLEX_WELDED_MECHANISM] as const,
  ['loopless welded Safari URL', LOOPLESS_WELDED_MECHANISM] as const,
  ['legacy force URL', LEGACY_FORCE_MECHANISM] as const,
];

function createComponent(fixture: MechanismFixture): AnalysisGraphComponent {
  return new AnalysisGraphComponent(
    new FormBuilder(),
    fixture.service,
    fixture.settings,
    new NumberUnitParserService(),
    fixture.active
  );
}

function expectNumericSeries(
  component: AnalysisGraphComponent,
  expectedSeries: number,
  expectedTimes: number[],
  requireFiniteData = false,
  context = ''
): void {
  const series = component.chartOptions.series ?? [];
  expect(series).toHaveLength(expectedSeries);
  expect(series.every((item) => item.data.length === expectedTimes.length)).toBe(true);
  for (const item of series) {
    const points = item.data as unknown as Array<{ x: number; y: number | null }>;
    points.forEach((point, index) => {
      expect(point).toEqual(expect.objectContaining({ x: expect.any(Number) }));
      expect(Number.isFinite(point.x)).toBe(true);
      expect(point.x).toBeCloseTo(expectedTimes[index], 12);
      expect(point.y === null || Number.isFinite(point.y)).toBe(true);
    });
    if (requireFiniteData) {
      expect(
        points.filter((point) => Number.isFinite(point.y)).length,
        `${context}/${item.name}: ${JSON.stringify(points.slice(0, 3))}`
      ).toBeGreaterThanOrEqual(2);
    }
  }
}

describe('AnalysisGraphComponent production fixtures', () => {
  beforeAll(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterAll(() => vi.restoreAllMocks());

  for (const [fixtureName, payload] of PRODUCTION_FIXTURES) {
    it(`builds every visible graph series for ${fixtureName}`, () => {
      const fixture = buildMechanismFixture(payload);
      const mechanism = fixture.mechanism;
      const component = createComponent(fixture);
      const joint = mechanism.joints[0].find(
        (candidate): candidate is RealJoint => candidate instanceof RealJoint && candidate.ground
      )!;
      const compound = mechanism.links[0].find(
        (candidate): candidate is RealLink =>
          candidate instanceof RealLink && candidate.subset.length > 0
      );
      const link =
        compound ??
        mechanism.links[0].find(
          (candidate): candidate is RealLink => candidate instanceof RealLink
        )!;

      for (const [property, expectedSeries] of KINEMATIC_GRAPHS) {
        const part = property.startsWith('Linear Joint') ? joint.id : link.id;
        component.determineChart('kinematic', 'loop', property, part);
        expectNumericSeries(
          component,
          expectedSeries,
          mechanism.timeNum,
          true,
          `${fixtureName}/${property}`
        );
      }

      for (const analysisType of ['static', 'dynamic'] as const) {
        const forceResult = mechanism.getForceAnalysis(analysisType);
        const sampleFrame = forceResult.frames.find((frame) => frame.status === 'ok');
        expect(
          sampleFrame?.jointReactions.has(joint.id),
          `${fixtureName}/${analysisType}: ${sampleFrame?.status} joints=${[
            ...(sampleFrame?.jointReactions.keys() ?? []),
          ].join(',')}`
        ).toBe(true);
        expect(
          sampleFrame?.jointReactions.get(joint.id)?.every(Number.isFinite),
          `${fixtureName}/${analysisType}: ${sampleFrame?.jointReactions.get(joint.id)}`
        ).toBe(true);
        component.determineChart('force', analysisType, 'Input Effort', joint.id);
        expectNumericSeries(component, 1, mechanism.timeNum, true);
        expect(component.analysisDiagnostic).toBeNull();

        const [reactionData] = component.determineAnalysis(
          'force',
          analysisType,
          'Joint Forces',
          joint.id
        );
        expect(
          reactionData[0].filter(Number.isFinite).length,
          `${fixtureName}/${analysisType}: ${reactionData[0].slice(0, 3)}`
        ).toBeGreaterThanOrEqual(2);
        component.determineChart('force', analysisType, 'Joint Forces', joint.id);
        expectNumericSeries(
          component,
          3,
          mechanism.timeNum,
          true,
          `${fixtureName}/${analysisType}`
        );
        expect(component.analysisDiagnostic).toBeNull();
      }
    });
  }

  it('caches a force solution once per mechanism and mode', () => {
    const analyze = vi.spyOn(ForceSolver, 'analyzeMechanism');
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const component = createComponent(fixture);
    const input = fixture.mechanism.joints[0].find(
      (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
    )!;

    component.determineChart('force', 'dynamic', 'Input Effort', input.id);
    component.determineChart('force', 'dynamic', 'Joint Forces', input.id);

    expect(analyze).toHaveBeenCalledTimes(1);
    analyze.mockRestore();
  });

  it('uses mechanism timestamps identically in chart points and CSV output', () => {
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const component = createComponent(fixture);
    const input = fixture.mechanism.joints[0].find(
      (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
    )!;
    component.determineChart('force', 'dynamic', 'Input Effort', input.id);

    const csvRows = component.buildCSVContent().trim().split('\n').slice(1);
    expect(csvRows).toHaveLength(fixture.mechanism.timeNum.length);
    csvRows.forEach((row, index) => {
      expect(Number(row.split(',')[0])).toBeCloseTo(fixture.mechanism.timeNum[index], 12);
    });
  });

  it('produces mode-dependent dynamic input effort', () => {
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const component = createComponent(fixture);
    const input = fixture.mechanism.joints[0].find(
      (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
    )!;
    component.determineChart('force', 'static', 'Input Effort', input.id);
    const staticValues = (
      component.chartOptions.series![0].data as unknown as Array<{ y: number }>
    ).map((point) => point.y);
    component.determineChart('force', 'dynamic', 'Input Effort', input.id);
    const dynamicValues = (
      component.chartOptions.series![0].data as unknown as Array<{ y: number }>
    ).map((point) => point.y);

    expect(dynamicValues.some((value, index) => value !== staticValues[index])).toBe(true);
  });

  it('shows a diagnostic instead of an unexplained empty internal-weld reaction graph', () => {
    const fixture = buildMechanismFixture(LOOPLESS_WELDED_MECHANISM);
    const component = createComponent(fixture);
    component.determineChart('force', 'static', 'Joint Forces', 'B');

    expect(component.analysisDiagnostic).toContain('internal to one welded body');
    expect(
      component.chartOptions.series!.every((series) =>
        (series.data as unknown as Array<{ y: number | null }>).every((point) => point.y === null)
      )
    ).toBe(true);
  });

  it('says the analysis failed rather than showing an empty series selection', () => {
    // A solver that throws leaves chartOptions.series unassigned, and the
    // template read that as nothing ticked -- "Please select at least one data
    // series", above no checkboxes to tick. The user reads that as their own
    // mistake. Two live defects presented this way before they were found.
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const component = createComponent(fixture);
    const joint = fixture.mechanism.joints[0].find(
      (candidate): candidate is RealJoint => candidate instanceof RealJoint
    )!;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const solver = vi.spyOn(KinematicsSolver, 'determineKinematics').mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading '0')");
    });

    component.determineChart('kinematic', 'loop', 'Linear Joint Vel', joint.id);
    component.applySeriesVisibility();

    expect(component.analysisDiagnostic).toContain('could not be analyzed');
    expect(component.numberOfSeries).toBe(0);
    expect(component.displayedSeries).toHaveLength(0);
    // And the failure is still recoverable in a console, not merely absorbed.
    expect(logged).toHaveBeenCalled();

    solver.mockRestore();
    logged.mockRestore();
  });

  it('uses matching Newton/lbf labels and values for graph and CSV output', () => {
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const component = createComponent(fixture);
    const input = fixture.mechanism.joints[0].find(
      (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
    )!;
    component.determineChart('force', 'static', 'Joint Forces', input.id);
    const newtonPoints = component.chartOptions.series![2].data as unknown as Array<{
      y: number | null;
    }>;
    const finiteIndex = newtonPoints.findIndex((point) => Number.isFinite(point.y));
    const newtonValue = newtonPoints[finiteIndex].y!;
    expect(component.chartOptions.yaxis!.title!.text).toBe('Force (N)');

    fixture.settings.forceUnit.next(ForceUnit.LBF);
    component.determineChart('force', 'static', 'Joint Forces', input.id);
    const lbfValue = (
      component.chartOptions.series![2].data[finiteIndex] as unknown as { y: number }
    ).y;
    expect(component.chartOptions.yaxis!.title!.text).toBe('Force (lbf)');
    expect(lbfValue).toBeCloseTo(newtonValue * 0.22480894387096, 3);
    expect(component.buildCSVContent().split('\n')[0]).toContain('(lbf)');
  });
});

describe('AnalysisGraphComponent lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('updates charts without recursive form or mechanism-state emissions', () => {
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const component = createComponent(fixture);
    const chart = {
      addPointAnnotation: vi.fn(),
      addXaxisAnnotation: vi.fn(),
      clearAnnotations: vi.fn(),
      updateOptions: vi.fn(),
    };
    component.chart = chart as never;
    component.analysis = 'kinematic';
    component.analysisType = 'loop';
    component.mechProp = 'Linear Joint Pos';
    component.mechPart = 'A';
    const determineChart = vi.spyOn(component, 'determineChart');
    const stateEvents: number[] = [];
    const stateSub = fixture.service.onMechUpdateState.subscribe((state) =>
      stateEvents.push(state)
    );

    component.ngOnInit();
    component.ngAfterViewInit();
    vi.advanceTimersByTime(2);

    expect(component.seriesCheckboxForm.getRawValue()).toEqual({ x: true, y: true, z: false });
    expect(component.noDataSelected).toBe(false);
    expect(component.displayedSeries.map((series) => series.name)).toEqual(['X', 'Y']);
    expect(chart.updateOptions).toHaveBeenCalledTimes(1);

    component.seriesCheckboxForm.patchValue({ x: false, y: true, z: false });
    expect(component.displayedSeries.map((series) => series.name)).toEqual(['Y']);
    component.seriesCheckboxForm.patchValue({ x: false, y: false, z: false });
    expect(component.displayedSeries).toHaveLength(0);
    expect(component.noDataSelected).toBe(true);
    component.seriesCheckboxForm.patchValue({ x: true, y: false, z: false });

    const annotationIndex = Math.min(2, fixture.mechanism.timeNum.length - 1);
    fixture.service.onMechPositionChange.next(annotationIndex);
    expect(chart.addXaxisAnnotation).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: fixture.mechanism.timeNum[annotationIndex] }),
      false
    );

    const eventsBeforeRefresh = stateEvents.length;
    fixture.service.onMechUpdateState.next(2);
    vi.advanceTimersByTime(2);
    expect(stateEvents.slice(eventsBeforeRefresh)).toEqual([2]);
    expect(component.loading).toBe(false);

    const callsBeforeUnitChange = determineChart.mock.calls.length;
    fixture.settings.lengthUnit.next(LengthUnit.METER);
    vi.advanceTimersByTime(2);
    expect(determineChart.mock.calls.length).toBe(callsBeforeUnitChange + 1);

    const callsBeforeForceUnitChange = determineChart.mock.calls.length;
    fixture.settings.forceUnit.next(ForceUnit.LBF);
    vi.advanceTimersByTime(2);
    expect(determineChart.mock.calls.length).toBe(callsBeforeForceUnitChange + 1);

    component.ngOnDestroy();
    const callsBeforeDestroyEvents = determineChart.mock.calls.length;
    fixture.settings.lengthUnit.next(LengthUnit.INCH);
    fixture.service.onMechUpdateState.next(2);
    vi.advanceTimersByTime(2);
    expect(determineChart.mock.calls.length).toBe(callsBeforeDestroyEvents);
    stateSub.unsubscribe();
  });

  it('opens force graphs on the X/Y components and kinematic ones on the magnitude', () => {
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const chart = {
      addPointAnnotation: vi.fn(),
      addXaxisAnnotation: vi.fn(),
      clearAnnotations: vi.fn(),
      updateOptions: vi.fn(),
    };

    const defaultsFor = (analysis: string, analysisType: string, mechProp: string) => {
      const component = createComponent(fixture);
      component.chart = chart as never;
      component.analysis = analysis;
      component.analysisType = analysisType;
      component.mechProp = mechProp;
      component.mechPart = 'B';
      component.ngOnInit();
      component.ngAfterViewInit();
      vi.advanceTimersByTime(2);
      return { series: component.numberOfSeries, form: component.seriesCheckboxForm.getRawValue() };
    };

    // A reaction's direction is the point of the graph, so it leads with X/Y...
    const force = defaultsFor('force', 'static', 'Joint Forces');
    expect(force.series).toBe(3);
    expect(force.form).toEqual({ x: true, y: true, z: false });

    // ...while an equally three-series kinematic graph still leads with magnitude.
    const kinematic = defaultsFor('kinematic', 'loop', 'Linear Joint Vel');
    expect(kinematic.series).toBe(3);
    expect(kinematic.form).toEqual({ x: false, y: false, z: true });
  });

  it('compacts only graphs that have no component-selector checkboxes', () => {
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const component = createComponent(fixture);

    component.numberOfSeries = 1;
    expect(component.compactSingleSeries).toBe(true);

    component.numberOfSeries = 2;
    expect(component.compactSingleSeries).toBe(false);

    component.numberOfSeries = 3;
    expect(component.compactSingleSeries).toBe(false);
  });

  it('keeps canonical colors when a middle series is hidden', () => {
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const component = createComponent(fixture);
    component.determineChart('kinematic', 'loop', 'Linear Joint Vel', 'B');
    component.seriesCheckboxForm.setValue({ x: true, y: false, z: true });
    component.applySeriesVisibility();

    expect(component.displayedSeries.map((series) => series.name)).toEqual(['X', 'Z']);
    expect(component.displayedColors).toEqual([ANALYSIS_SERIES_COLORS.X, ANALYSIS_SERIES_COLORS.Z]);
  });
});

describe('AnalysisGraphComponent rendered controls', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('updates the rendered chart series when its Material checkboxes are clicked', async () => {
    const fixtureData = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    await TestBed.configureTestingModule({
      declarations: [AnalysisGraphComponent, ApexChartStubComponent],
      imports: [
        ReactiveFormsModule,
        MatButtonModule,
        MatCheckboxModule,
        MatIconModule,
        NoopAnimationsModule,
      ],
      providers: [
        { provide: MechanismService, useValue: fixtureData.service },
        { provide: SettingsService, useValue: fixtureData.settings },
        { provide: NumberUnitParserService, useValue: new NumberUnitParserService() },
        { provide: ActiveObjService, useValue: fixtureData.active },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    const fixture: ComponentFixture<AnalysisGraphComponent> =
      TestBed.createComponent(AnalysisGraphComponent);
    fixture.componentRef.setInput('analysis', 'kinematic');
    fixture.componentRef.setInput('analysisType', 'loop');
    fixture.componentRef.setInput('mechProp', 'Linear Joint Pos');
    fixture.componentRef.setInput('mechPart', 'B');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const loader = TestbedHarnessEnvironment.loader(fixture);
    const xCheckbox = await loader.getHarness(MatCheckboxHarness.with({ label: 'X' }));
    const yCheckbox = await loader.getHarness(MatCheckboxHarness.with({ label: 'Y' }));
    expect(await xCheckbox.isChecked()).toBe(true);
    expect(await yCheckbox.isChecked()).toBe(true);

    await xCheckbox.uncheck();
    fixture.detectChanges();
    expect(fixture.componentInstance.displayedSeries.map((series) => series.name)).toEqual(['Y']);

    await yCheckbox.uncheck();
    fixture.detectChanges();
    expect(fixture.componentInstance.displayedSeries).toHaveLength(0);
    expect(fixture.componentInstance.noDataSelected).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Please select at least one data series.');

    await xCheckbox.check();
    fixture.detectChanges();
    expect(fixture.componentInstance.displayedSeries.map((series) => series.name)).toEqual(['X']);
    expect(fixture.componentInstance.noDataSelected).toBe(false);

    const chartStub = fixture.debugElement.query(By.directive(ApexChartStubComponent))
      .componentInstance as ApexChartStubComponent;
    const annotationIndex = Math.min(3, fixtureData.mechanism.timeNum.length - 1);
    fixtureData.service.onMechPositionChange.next(annotationIndex);
    expect(chartStub.addXaxisAnnotation).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: fixtureData.mechanism.timeNum[annotationIndex] }),
      false
    );
    fixture.destroy();
  });
});

describe('formatTimeLabel', () => {
  it('drops decimals that carry no information', () => {
    expect(formatTimeLabel(0)).toBe('0');
    expect(formatTimeLabel(3)).toBe('3');
    expect(formatTimeLabel(3.0)).toBe('3');
    expect(formatTimeLabel(0.3)).toBe('0.3');
  });

  it('keeps up to three decimals when they matter', () => {
    expect(formatTimeLabel(3.14159)).toBe('3.142');
    expect(formatTimeLabel(8.571428)).toBe('8.571');
    expect(formatTimeLabel(0.0238)).toBe('0.024');
  });

  it('renders nothing for a non-finite time', () => {
    expect(formatTimeLabel(Number.NaN)).toBe('');
    expect(formatTimeLabel(Number.POSITIVE_INFINITY)).toBe('');
  });
});
