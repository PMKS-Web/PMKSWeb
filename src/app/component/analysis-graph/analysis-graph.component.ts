import { MatIcon } from '@angular/material/icon';
import {
  AfterViewInit,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
  ChangeDetectionStrategy,
  inject,
  output,
} from '@angular/core';
import {
  ApexAnnotations,
  ApexAxisChartSeries,
  ApexChart,
  ApexGrid,
  ApexDataLabels,
  ApexFill,
  ApexLegend,
  ApexMarkers,
  ApexStroke,
  ApexTitleSubtitle,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
} from 'apexcharts';
import { KinematicsSolver } from 'src/app/model/mechanism/kinematic-solver';
import {
  ANALYSIS_SERIES_COLORS,
  angularScale,
  formatAnalysisValue,
} from 'src/app/model/analysis-series';
export { ANALYSIS_SERIES_COLORS };
import { ForceAnalysisMode } from 'src/app/model/mechanism/force-solver';
import { Mechanism } from 'src/app/model/mechanism/mechanism';
import { AngleUnit, ForceUnit, LengthUnit } from '../../model/utils';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { FormBuilder } from '@angular/forms';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { AnalysisSampleService } from '../../services/analysis-sample.service';
import { skip, Subscription } from 'rxjs';
import { AnalysisApexChartComponent } from './analysis-apex-chart.component';

export type ChartOptions = {
  annotations: ApexAnnotations;
  series: ApexAxisChartSeries;
  chart: ApexChart;
  dataLabels: ApexDataLabels;
  markers: ApexMarkers;
  title: ApexTitleSubtitle;
  fill: ApexFill;
  yaxis: ApexYAxis;
  xaxis: ApexXAxis;
  tooltip: ApexTooltip;
  stroke: ApexStroke;
  grid: ApexGrid;
  colors: string[];
  legend: ApexLegend;
};

/**
 * Time axis labels: a typical cycle runs 0-3 s, where "3.000" is noise. Cap at
 * three decimals and drop the ones that carry no information.
 */
export function formatTimeLabel(value: number): string {
  const rounded = Number(value);
  if (!Number.isFinite(rounded)) return '';
  return Number(rounded.toFixed(3)).toString();
}

/**
 * The two ends of the time axis, to one decimal.
 *
 * They read beside the y axis, which is also one decimal, and "0" against
 * "6.0" looks like two different kinds of number.
 */
export function formatAxisEnd(value: number): string {
  const rounded = Number(value);
  if (!Number.isFinite(rounded)) return '';
  return rounded.toFixed(1);
}

/** Apex's own fallback, kept by name so the axis can be handed back to it. */
export const FLOOR_OF = (min: number) => Math.floor(min);
export const CEIL_OF = (max: number) => Math.ceil(max);

/**
 * A y axis whose gridlines land on round numbers -- zero among them.
 *
 * Both limits are whole multiples of one step, so every line between them is
 * too.
 *
 * A series that never changes gets the range from zero to its own value. It has
 * no range of its own to divide, and what little it has is floating-point
 * noise: the speed of a four-bar's crank pin is constant, and fitting the axis
 * to it gave a window 1.5e-6 wide, in which every label read "6.2" and the line
 * wandered across the full height of the plot as rounding error. Against zero
 * it reads as what it is -- a constant, at a height the axis can be read off --
 * and zero is the comparison a reader wants of a constant anyway.
 */
export function niceAxisScale(
  low: number,
  high: number
): { min: number; max: number; tickAmount: number } | undefined {
  if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) return undefined;
  if (high - low <= 1e-6 * Math.max(Math.abs(low), Math.abs(high))) {
    // Nothing to plot against but zero, and a series at zero has not even that.
    if (low === 0 && high === 0) return { min: -1, max: 1, tickAmount: 2 };
    return niceAxisScale(Math.min(0, low), Math.max(0, high));
  }
  const magnitude = Math.pow(10, Math.floor(Math.log10((high - low) / 4)));
  const step =
    [1, 2, 2.5, 5, 10]
      .map((factor) => factor * magnitude)
      .find((size) => size >= (high - low) / 4) ?? 10 * magnitude;
  // Away from binary noise: 0.1 + 0.2 arithmetic leaves limits like -1.0000000000000002,
  // which Apex prints in full.
  const round = (value: number) => Number(value.toPrecision(12));
  const min = round(Math.floor(low / step) * step);
  const max = round(Math.ceil(high / step) * step);
  return { min, max, tickAmount: Math.max(1, Math.round((max - min) / step)) };
}

/** Which of a graph's three series it draws. */
export interface SeriesSelection {
  x: boolean;
  y: boolean;
  z: boolean;
}

/**
 * Which series a graph opens on.
 *
 * Force graphs open on the X and Y components, since the direction of a
 * reaction is what is being read; kinematic graphs lead with the magnitude. A
 * single-series graph only ever has the magnitude to show.
 *
 * Exported because the legend above the plot has to say the same thing on the
 * very first frame. It used to ask the graph, and the graph did not exist yet,
 * so the legend showed everything lit while the plot drew one line.
 */
export function defaultSeriesSelection(count: number, analysis: string): SeriesSelection {
  const showComponents = count === 2 || (count === 3 && analysis === 'force');
  return showComponents ? { x: true, y: true, z: false } : { x: false, y: false, z: true };
}

@Component({
  selector: 'app-analysis-graph',
  templateUrl: './analysis-graph.component.html',
  styleUrls: ['./analysis-graph.component.scss'],
  animations: [
    trigger('showHide', [
      // ...
      state(
        'graphShown',
        style({
          opacity: 0,
        })
      ),
      state(
        'graphHidden',
        style({
          opacity: 1,
        })
      ),
      transition('* => *', [animate('0.1s ease-in-out')]),
    ]),
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [AnalysisApexChartComponent, MatIcon],
})
export class AnalysisGraphComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  private fb = inject(FormBuilder);
  private mechanismService = inject(MechanismService);
  settingsService = inject(SettingsService);
  private nup = inject(NumberUnitParserService);
  private samples = inject(AnalysisSampleService);

  public chartOptions: Partial<ChartOptions> = {
    annotations: {
      xaxis: [],
      points: [],
    },
    chart: {
      width: '100%',
      height: '250px', //300
      // Off, both the first draw and the tween between one dataset and the
      // next. A chart that morphs is drawing values the mechanism never had:
      // reverse a four-bar and the speed of its crank pin, which is constant,
      // swelled into a hump and settled back while Apex interpolated its way
      // from the old series to the new one. These graphs are also redrawn as
      // the playhead moves, so the tween is between the reader and the answer
      // rather more often than it is decoration.
      animations: {
        enabled: false,
      },
      type: 'line',
      zoom: {
        enabled: false,
      },
      toolbar: {
        show: false, //Change this
        // offsetX: -30,
        // offsetY: -3,
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      curve: 'straight',
      width: 2,
    },
    colors: [ANALYSIS_SERIES_COLORS.X, ANALYSIS_SERIES_COLORS.Y, ANALYSIS_SERIES_COLORS.Z],
    tooltip: {
      // followCursor: false,
      // theme: 'dark',
      x: {
        formatter: function (val) {
          return 'T = ' + formatTimeLabel(Number(val)) + 's';
        },
      },
      marker: {
        // show: false,
      },
      y: {
        title: {
          // formatter: function () {
          //   return 'T = ';
          // },
        },
      },
    },
    grid: {
      position: 'back',
      show: true,
      padding: {
        top: -14,
        bottom: -8,
      },
      xaxis: {
        lines: {
          show: true,
        },
      },
      yaxis: {
        lines: {
          show: true,
        },
      },
    },
    xaxis: {
      type: 'numeric',
      // Under the plot, where a time axis reads. It sat on top because the
      // legend used to want the room below it, and the legend has gone.
      position: 'bottom',
      offsetY: 0,
      // floating: true,
      // categories: categories,
      labels: {
        rotate: 0,
        rotateAlways: true,
        // Apex trims a label to its own tick slot, which is far narrower than
        // the space actually free at the two ends of this axis.
        trim: false,
        hideOverlappingLabels: false,
        // Clear of the plot's own frame, which they used to sit against.
        offsetY: 4,
        style: {
          fontSize: '12px',
          fontWeight: 400,
          colors: ['#373d3f', '#373d3f'],
        },
        formatter: function (val) {
          return formatAxisEnd(Number(val));
        },
      },
      tickAmount: 1,
      title: {
        text: 'Time (seconds)',
        // Up beside the two ends rather than on a line of its own below them,
        // and centred between them: Apex centres it on the whole canvas, which
        // the y axis's own labels make eight pixels wider on the left.
        offsetY: -20,
        offsetX: -8,
      },
      tooltip: {
        enabled: false,
      },
    },
    yaxis: {
      showForNullSeries: false,
      forceNiceScale: true,
      // The same size and weight as the time axis. Apex defaults the two axes
      // to 11px and the x axis was set to 12px on its own, so the two ends of
      // one plot were lettered differently.
      labels: {
        style: {
          fontSize: '12px',
          fontWeight: 400,
        },
      },
      min: FLOOR_OF,
      max: CEIL_OF,
      title: {
        text: 'setLater',
        style: {
          fontSize: '12px',
        },
      },
      // tickAmount: 1,
      decimalsInFloat: 1,
    },
    legend: {
      show: false,
      position: 'top',
      floating: true,
      offsetY: -3,
      // customLegendItems: ['X', 'Y', 'Magnitude'],
      markers: {
        // customHTML: function () {
        //   return '<input type="checkbox" checked="true"> </input>';
        // },
      },
    },
  };

  @Input() analysis: string = '';
  @Input() analysisType: string = '';
  @Input() mechProp: string = '';
  @Input() mechPart: string = '';
  @Input() reactionLinkId: string = '';

  /**
   * Which series to open on, when the card above already has an opinion.
   *
   * The legend is outside this component and survives the card being closed and
   * opened again, so it is the legend that remembers what the reader last chose
   * and hands it back here.
   */
  @Input() initialSeries?: SeriesSelection;

  /** What this graph is actually drawing, whenever that changes. */
  readonly shownSeriesChange = output<SeriesSelection>();

  //Get the child element in the template with "#chart"
  @ViewChild('chart', { static: false }) chart!: AnalysisApexChartComponent;

  animationTimestep: number = 0;
  numberOfSeries: number = 0;
  displayedSeries: ApexAxisChartSeries = [];
  displayedColors: string[] = [];

  get compactSingleSeries(): boolean {
    return this.numberOfSeries === 1;
  }

  /**
   * What this graph plots, in words.
   *
   * Its own controls are labelled "X" and "Y", which say nothing on their own:
   * a panel showing six graphs offers a dozen checkboxes all called the same
   * two things. The graph itself is a canvas with no text in it at all.
   */
  get graphLabel(): string {
    const part = this.mechPart ? ` of ${this.mechPart}` : '';
    return `${this.mechProp}${part}`;
  }

  /** The label, plus what a reader who cannot see the plot would ask next. */
  get graphSummary(): string {
    const names = this.displayedSeries
      .map((series) => series.name)
      .filter((name): name is string => !!name);
    const plotted = names.length ? `, plotting ${names.join(', ')}` : '';
    return `Graph of ${this.graphLabel} over one cycle${plotted}. The same numbers are available from Export Data in the top strip.`;
  }

  noDataSelected: boolean = false;
  analysisDiagnostic: string | null = null;
  /**
   * A hole in an otherwise good force series: how many positions have no
   * solution, and where the first one is, so Show Them can take the reader
   * there. Those are toggle positions — reactions grow without bound as the
   * mechanism approaches them — and standing the mechanism at one teaches
   * more than any sentence about it.
   */
  analysisGap: { failed: number; total: number; firstSeconds: number; mechIndex: number } | null =
    null;

  /**
   * One hole is "the position"; several are shown by naming the one the
   * button actually goes to — the first — so the jump has no surprise in it.
   */
  get gapShowLabel(): string {
    const gap = this.analysisGap;
    if (!gap) return '';
    return gap.failed === 1
      ? 'Show position'
      : `Show first (${formatTimeLabel(gap.firstSeconds)} s)`;
  }

  showGapPosition(): void {
    if (!this.analysisGap) return;
    const service = this.mechanismService;
    // A seek keeps the playback state, so pressed mid-animation it would sail
    // straight past the pose it names. Standing at the pose IS the point.
    if (service.isPlaying) {
      service.animate(service.mechanismTimeStep, false);
    }
    if (service.isMechanismPlaying(this.analysisGap.mechIndex)) {
      service.toggleMechanismPlaying(this.analysisGap.mechIndex);
    }
    service.seekMechanism(this.analysisGap.mechIndex, this.analysisGap.firstSeconds);
  }

  loading: boolean = false;
  private subscriptions = new Subscription();
  private chartSyncTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  seriesCheckboxForm = this.fb.group(
    {
      x: [false],
      y: [false],
      z: [false],
    },
    { updateOn: 'change' }
  );

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes || !this.analysis || !this.mechProp || !this.mechPart) return;
    // The legend handing back what it remembers is not a change to what is
    // plotted, and rebuilding the chart for it would be a rebuild per click.
    if (Object.keys(changes).every((name) => name === 'initialSeries')) return;
    this.updateChartData();
  }

  updateChartData() {
    if (!this.analysis || !this.mechProp || !this.mechPart) return;
    this.determineChart(this.analysis, this.analysisType, this.mechProp, this.mechPart);
    this.scheduleChartSync(false);
  }

  ngAfterViewInit(): void {
    this.scheduleChartSync(true);
  }

  ngOnInit(): void {
    //Param 1: analysis: "force","stress","kinematic"

    //Param 2: analysisType: IF analysis == force: "statics","dynamic"
    //Param 2: analysisType: IF analysis == kinematic: "loop","ic"

    //Param 3: mechProp: IF analysis == force: "Input Torque","Joint Forces"
    //Param 3: mechProp: IF analysis == kinemaics: "Linear Joint Pos","Linear Joint Vel","Linear Joint Acc",
    //"Linear Link's CoM Pos","Linear Link's CoM Vel","Linear Link's CoM Acc",
    //"Angular Link Pos","Angular Link Vel",Angular Link Acc"

    //Param 4: mechPart: If Joint 'a','b','c'... If Link 'ab','bc','cd'...
    this.determineChart(this.analysis, this.analysisType, this.mechProp, this.mechPart);

    this.subscriptions.add(
      this.seriesCheckboxForm.valueChanges.subscribe(() => this.applySeriesVisibility())
    );
    this.subscriptions.add(
      this.settingsService.angleUnit.pipe(skip(1)).subscribe(() => this.updateChartData())
    );
    this.subscriptions.add(
      this.settingsService.lengthUnit.pipe(skip(1)).subscribe(() => this.updateChartData())
    );
    this.subscriptions.add(
      this.settingsService.forceUnit.pipe(skip(1)).subscribe(() => this.updateChartData())
    );
    this.subscriptions.add(
      this.mechanismService.onMechUpdateState.subscribe((data) => {
        if (data === 1) {
          this.loading = true;
        } else if (data === 0) {
          this.loading = false;
        } else if (data === 2 && this.mechanismService.oneValidMechanismExists()) {
          this.loading = false;
          this.updateChartData();
        }
      })
    );
    this.subscriptions.add(
      // The broadcast says *something* moved, not which; this graph asks its
      // own machine where it is.
      this.mechanismService.onMechPositionChange.subscribe(() => this.showAnnotations())
    );
  }

  private scheduleChartSync(resetSelection: boolean): void {
    if (this.chartSyncTimer) clearTimeout(this.chartSyncTimer);
    this.chartSyncTimer = setTimeout(() => {
      if (this.destroyed) return;
      if (resetSelection) {
        this.seriesCheckboxForm.patchValue(
          this.initialSeries ?? defaultSeriesSelection(this.numberOfSeries, this.analysis),
          { emitEvent: false }
        );
      }
      this.applySeriesVisibility();
      this.updateYAxis();
    }, 1);
  }

  /**
   * Which series this graph has, in the order it plots them.
   *
   * Two means X and Y; three means either X, Y and a magnitude, or the three
   * components of a force -- `seriesLabel` is what knows the difference.
   */
  get seriesKeys(): ('x' | 'y' | 'z')[] {
    if (this.numberOfSeries === 3) return ['z', 'x', 'y'];
    if (this.numberOfSeries === 2) return ['x', 'y'];
    return [];
  }

  seriesLabel(key: 'x' | 'y' | 'z'): string {
    if (key !== 'z') return key.toUpperCase();
    // The third series is the magnitude of the other two, except in force
    // analysis, where it is a component of its own.
    return this.analysis === 'force' ? 'Z' : 'Magnitude';
  }

  isSeriesShown(key: 'x' | 'y' | 'z'): boolean {
    return !!this.seriesCheckboxForm.value[key];
  }

  /** The legend is the switch. Showing none of them is allowed; the graph says so. */
  toggleSeries(key: 'x' | 'y' | 'z'): void {
    this.seriesCheckboxForm.patchValue({ [key]: !this.isSeriesShown(key) });
  }

  colorForSeriesKey(key: 'x' | 'y' | 'z'): string {
    return this.colorForSeries(this.seriesLabel(key) === 'Magnitude' ? 'Z' : key.toUpperCase());
  }

  applySeriesVisibility(): void {
    const data = this.seriesCheckboxForm.getRawValue();
    const selectedNames = new Set<string>();
    if (data.x) selectedNames.add('X');
    if (data.y) selectedNames.add('Y');
    if (data.z) selectedNames.add('Z');

    this.displayedSeries = (this.chartOptions.series ?? []).filter((series) =>
      selectedNames.has(series.name ?? '')
    );
    this.displayedColors = this.displayedSeries.map((series) => this.colorForSeries(series.name));
    this.noDataSelected = this.displayedSeries.length === 0;
    this.applyYAxisScale();
    this.shownSeriesChange.emit({ x: !!data.x, y: !!data.y, z: !!data.z });
    if (this.chart) this.showAnnotations();
  }

  /**
   * Where the y axis starts, stops, and puts its lines.
   *
   * Apex picks its own round numbers, and for a series running from -1.1 to 2.0
   * it drew lines at 0.3, 1.0 and 1.7 -- so a graph that crosses zero, which is
   * usually the fact the reader came for, had nothing marking where it does.
   * Every tick here is a whole number of one step away from a limit that is
   * itself a whole number of steps, so zero is a line whenever it is in range.
   */
  private applyYAxisScale(): void {
    const values: number[] = [];
    this.displayedSeries.forEach((series) =>
      series.data.forEach((point) => {
        const value = this.pointValue(point);
        if (value !== null) values.push(value);
      })
    );
    const yaxis = this.chartOptions.yaxis!;
    const scale = values.length
      ? niceAxisScale(Math.min(...values), Math.max(...values))
      : undefined;
    this.chartOptions = {
      ...this.chartOptions,
      yaxis: scale
        ? { ...yaxis, min: scale.min, max: scale.max, tickAmount: scale.tickAmount }
        : { ...yaxis, min: FLOOR_OF, max: CEIL_OF, tickAmount: undefined },
    };
  }

  private updateYAxis(): void {
    if (!this.chart) return;
    const chartInput = (this.chart as unknown as { chart?: () => unknown }).chart;
    if (typeof chartInput === 'function' && !chartInput()) return;
    this.chart.updateOptions({ yaxis: this.chartOptions.yaxis }, false, true);
  }

  /**
   * Where this machine is in its own cycle, as a sample of its own solve.
   *
   * Not the shared clock. Each machine has a clock of its own while they are
   * being controlled apart, and a graph of a paused machine was drawing its
   * playhead at the running machine's time -- a line sweeping across a plot of
   * something standing still on the grid. Machines also have different numbers
   * of samples, so the shared index does not even mean the same moment.
   */
  private ownSample(): number {
    const mechanism = this.mechanismFor(this.mechPart);
    if (!mechanism) return 0;
    const at = this.mechanismService.mechanisms.indexOf(mechanism);
    const step =
      at === -1
        ? this.mechanismService.mechanismTimeStep
        : this.mechanismService.currentSampleOf(at);
    return Math.max(Math.min(step, mechanism.joints.length - 1), 0);
  }

  private showAnnotations() {
    if (!this.chart) return;
    const timeIndex = this.ownSample();
    if (timeIndex === 0) {
      this.chart.clearAnnotations();
      return;
    }
    const timeSeconds = this.mechanismFor(this.mechPart)?.timeNum[timeIndex] ?? timeIndex;
    if (
      this.seriesCheckboxForm.value.x ||
      this.seriesCheckboxForm.value.y ||
      this.seriesCheckboxForm.value.z
    ) {
      this.chart.clearAnnotations();
      this.chart.addXaxisAnnotation(
        {
          x: timeSeconds,
          borderColor: '#000000',
          // Under the line rather than over it. Above, it was pushed past the
          // top of the plot and clipped by the card, which left a white box
          // with half a label in it hanging over the chart.
          label: {
            // One decimal, like the two ends of the axis it sits on: "T= 1"
            // beside "0.0" and "3.0" is the same number written two ways.
            text: 'T= ' + formatAxisEnd(timeSeconds),
            orientation: 'horizontal',
            position: 'bottom',
            offsetY: 4,
          },
        },
        false
      );
    }

    const xSeries = this.chartOptions.series?.find((s) => s.name === 'X');
    const ySeries = this.chartOptions.series?.find((s) => s.name === 'Y');
    const zSeries = this.chartOptions.series?.find((s) => s.name === 'Z');

    if (this.seriesCheckboxForm.value.x && xSeries) {
      this.addPointAnnotation(xSeries, timeIndex, timeSeconds, ANALYSIS_SERIES_COLORS.X);
    }
    if (this.seriesCheckboxForm.value.y && ySeries) {
      this.addPointAnnotation(ySeries, timeIndex, timeSeconds, ANALYSIS_SERIES_COLORS.Y);
    }
    if (this.seriesCheckboxForm.value.z && zSeries) {
      this.addPointAnnotation(zSeries, timeIndex, timeSeconds, this.colorForSeries('Z'));
    }
  }

  private colorForSeries(name: string | undefined): string {
    if (name === 'Y') return ANALYSIS_SERIES_COLORS.Y;
    if (name === 'Z' && this.numberOfSeries === 3) return ANALYSIS_SERIES_COLORS.Z;
    return ANALYSIS_SERIES_COLORS.X;
  }

  private addPointAnnotation(
    series: ApexAxisChartSeries[number],
    timeIndex: number,
    timeSeconds: number,
    color: string
  ): void {
    const value = this.pointValue(series.data[timeIndex]);
    if (value === null) return;
    this.chart.addPointAnnotation(
      {
        x: timeSeconds,
        y: value,
        marker: { strokeColor: color, shape: 'square' },
        label: {
          borderColor: color,
          fillColor: '#000000',
          orientation: 'horizontal',
          text: formatAnalysisValue(value),
        },
      },
      false
    );
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.chartSyncTimer) clearTimeout(this.chartSyncTimer);
    this.subscriptions.unsubscribe();
  }

  /**
   * Put an angular series into the unit the axis beside it is lettered in.
   *
   * In place, and to the four decimals this has always shown: the conversion
   * itself now lives with the model, so the file the export writes and the
   * curve drawn here cannot end up in different units.
   */
  private scaleAngles(series: number[], mechProp: string): void {
    const scale = angularScale(mechProp, this.settingsService.angleUnit.getValue());
    if (scale === 1) return;
    for (let i = 0; i < series.length; i++) {
      series[i] = Number((series[i] * scale).toFixed(4));
    }
  }

  getUnitStr(unit: LengthUnit | AngleUnit): string {
    switch (unit) {
      case AngleUnit.RADIAN:
        return 'rad';
      case AngleUnit.DEGREE:
        return 'deg';
      case LengthUnit.CM:
        return 'cm';
      case LengthUnit.INCH:
        return 'in';
      case LengthUnit.METER:
        return 'm';
      default:
        if (typeof unit === typeof LengthUnit) {
          return 'brokenLength';
        } else {
          return 'brokenAngle';
        }
    }
  }

  private pointValue(point: unknown): number | null {
    if (typeof point === 'number') return Number.isFinite(point) ? point : null;
    if (point && typeof point === 'object' && 'y' in point) {
      const value = (point as { y: unknown }).y;
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }
    return null;
  }

  /**
   * The machine that owns the part being graphed.
   *
   * A drawing holds several independent mechanisms, each with its own samples
   * and its own clock, so the series, the time axis and the force analysis all
   * have to come from this part's machine rather than from whichever one was
   * built first. A part in a floating chain belongs to none, and graphs nothing.
   */
  private mechanismFor(mechPart: string): Mechanism | undefined {
    const part =
      this.mechanismService.joints.find((joint) => joint.id === mechPart) ??
      this.mechanismService.links.find((link) => link.id === mechPart);
    return part ? this.mechanismService.mechanismContaining(part) : undefined;
  }

  determineChart(analysis: string, analysisType: string, mechProp: string, mechPart: string) {
    try {
      this.buildChart(analysis, analysisType, mechProp, mechPart);
    } catch (error) {
      // A solver that throws leaves `chartOptions.series` unassigned, and the
      // template read that as an empty selection -- "Please select at least
      // one data series", above no checkboxes to select. That blames the user
      // for our failure. Say the analysis failed, and keep the stack in the
      // console for whoever has to fix it.
      console.error('Analysis failed for', analysis, mechProp, mechPart, error);
      this.numberOfSeries = 0;
      this.displayedSeries = [];
      this.displayedColors = [];
      this.analysisDiagnostic =
        'This mechanism could not be analyzed, so this graph is unavailable.';
    }
  }

  private buildChart(
    analysis: string,
    analysisType: string,
    mechProp: string,
    mechPart: string
  ): void {
    const mechanism = this.mechanismFor(mechPart);
    let yAxisTitle = '';
    let datum: number[][] = [];
    const seriesData = [];
    let posLinUnit = '(' + this.getUnitStr(this.settingsService.lengthUnit.value) + ')';
    let velLinUnit = '(' + this.getUnitStr(this.settingsService.lengthUnit.value) + '/s)';
    let accLinUnit = '(' + this.getUnitStr(this.settingsService.lengthUnit.value) + '/s²)';
    const posAngUnit = '(' + this.getUnitStr(this.settingsService.angleUnit.value) + ')';
    const velAngUnit = '(' + this.getUnitStr(this.settingsService.angleUnit.value) + '/s)';
    const accAngUnit = '(' + this.getUnitStr(this.settingsService.angleUnit.value) + '/s²)';
    this.analysisDiagnostic = null;
    // Only the force branch writes the gap, so a kinematic graph would
    // otherwise inherit the banner from the force graph shown before it.
    this.analysisGap = null;
    switch (analysis) {
      case 'force':
        switch (mechProp) {
          case 'Input Torque':
          case 'Input Effort': {
            const mode: ForceAnalysisMode = analysisType === 'dynamic' ? 'dynamic' : 'static';
            const effortKind = mechanism
              ?.getForceAnalysis(mode)
              .frames.find((frame) => frame.status === 'ok' && frame.inputEffort)
              ?.inputEffort?.kind;
            yAxisTitle =
              effortKind === 'force'
                ? this.settingsService.forceUnit.value === ForceUnit.LBF
                  ? 'Force (lbf)'
                  : 'Force (N)'
                : this.settingsService.forceUnit.value === ForceUnit.LBF
                  ? 'Torque (lbf·in)'
                  : 'Torque (N·m)';
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            seriesData.push({ name: 'Z', type: 'line', data: datum[0] });
            this.numberOfSeries = 1;
            break;
          }
          case 'Joint Forces':
            yAxisTitle =
              this.settingsService.forceUnit.value === ForceUnit.LBF ? 'Force (lbf)' : 'Force (N)';
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            seriesData.push({ name: 'Z', type: 'line', data: datum[2] });
            this.numberOfSeries = 3;
            break;
        }
        break;
      case 'stress':
        break;
      case 'kinematic':
        switch (mechProp) {
          case 'Linear Joint Pos':
            yAxisTitle = 'Position ' + posLinUnit;
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            this.numberOfSeries = 2;
            break;
          case 'Linear Joint Vel':
            yAxisTitle = 'Velocity ' + velLinUnit;
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            seriesData.push({ name: 'Z', type: 'line', data: datum[2] });
            this.numberOfSeries = 3;
            break;
          case 'Linear Joint Acc':
            yAxisTitle = 'Acceleration ' + accLinUnit;
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            seriesData.push({ name: 'Z', type: 'line', data: datum[2] });
            this.numberOfSeries = 3;
            break;
          case "Linear Link's CoM Pos":
            yAxisTitle = 'Position (CoM) ' + posLinUnit;
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            this.numberOfSeries = 2;
            break;
          case "Linear Link's CoM Vel":
            yAxisTitle = 'Velocity ' + velLinUnit;
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            seriesData.push({ name: 'Z', type: 'line', data: datum[2] });
            this.numberOfSeries = 3;
            break;
          case "Linear Link's CoM Acc":
            yAxisTitle = 'Acceleration ' + accLinUnit;
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            seriesData.push({ name: 'Z', type: 'line', data: datum[2] });
            this.numberOfSeries = 3;
            break;
          case 'Angular Link Pos':
            yAxisTitle = 'Position ' + posAngUnit;
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            var series: number[] = datum[0];
            this.scaleAngles(series, 'Angular Link Pos');
            seriesData.push({ name: 'Z', type: 'line', data: series });
            this.numberOfSeries = 1;
            break;
          case 'Angular Link Vel':
            yAxisTitle = 'Velocity ' + velAngUnit;
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            var series: number[] = datum[0];
            this.scaleAngles(series, 'Angular Link Vel');
            seriesData.push({ name: 'Z', type: 'line', data: series });
            this.numberOfSeries = 1;
            break;
          case 'Angular Link Acc':
            yAxisTitle = 'Acceleration ' + accAngUnit;
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            var series: number[] = datum[0];
            this.scaleAngles(series, 'Angular Link Acc');
            seriesData.push({ name: 'Z', type: 'line', data: series });
            this.numberOfSeries = 1;
            break;
        }
        break;
      default:
        return;
    }

    // ApexCharts/Safari can fail the entire chart when one exact toggle pose
    // contributes NaN or Infinity. A null point creates an intentional gap at
    // that singular timestep while preserving the rest of the series.
    const times = mechanism?.timeNum ?? [];
    const chartSeries = seriesData.map((series) => ({
      ...series,
      data: series.data.map((value, index) => ({
        x: times[index] ?? index,
        y: Number.isFinite(value) ? value : null,
      })),
    })) as ApexAxisChartSeries;
    const yaxis = this.chartOptions.yaxis!;
    this.chartOptions = {
      ...this.chartOptions,
      series: chartSeries,
      yaxis: {
        ...yaxis,
        title: { ...yaxis.title, text: yAxisTitle },
      },
    };
    this.displayedSeries = chartSeries;
    this.displayedColors = chartSeries.map((series) => this.colorForSeries(series.name));
  }

  determineAnalysis(
    analysis: string,
    analysisType: string,
    mechProp: string,
    mechPart: string
  ): [[number[], number[], number[]], string[]] {
    const datum_X: number[] = [];
    const datum_Y: number[] = [];
    const datum_Z: number[] = [];
    const categories: string[] = [];
    const mechanism = this.mechanismFor(mechPart);
    // A loose joint, or a chain that never reaches ground, is in no mechanism
    // and so has nothing solved to plot.
    if (!mechanism) return [[datum_X, datum_Y, datum_Z], categories];

    const series = [datum_X, datum_Y, datum_Z];
    /** One solved sample, spread across the series in the order plotted. */
    const collect = (index: number): void => {
      this.samples
        .sampleAt(mechanism, index, analysis, analysisType, mechProp, mechPart, this.reactionLinkId)
        .forEach((value, position) => series[position].push(value));
    };

    if (analysis === 'force') {
      const mode: ForceAnalysisMode = analysisType === 'dynamic' ? 'dynamic' : 'static';
      const result = mechanism.getForceAnalysis(mode);
      result.frames.forEach((frame, index) => {
        categories.push(frame.timeSeconds.toString());
        collect(index);
      });

      const hasFiniteData = [datum_X, datum_Y, datum_Z].some((values) =>
        values.some(Number.isFinite)
      );
      // A hole in an otherwise good series is worth a sentence of its own: a
      // silent gap at a toggle position reads as a plotting bug, when it is
      // the most physical thing on the chart.
      const failed = result.frames.length - result.successfulFrames;
      const firstFailed = result.frames.find((frame) => frame.status !== 'ok');
      this.analysisGap =
        hasFiniteData && failed > 0 && firstFailed
          ? {
              failed,
              total: result.frames.length,
              firstSeconds: firstFailed.timeSeconds,
              mechIndex: Math.max(this.mechanismService.mechanisms.indexOf(mechanism), 0),
            }
          : null;
      this.analysisDiagnostic = hasFiniteData
        ? null
        : (result.diagnostic ??
          (mechProp === 'Joint Forces'
            ? 'Only one part meets this joint, so there is no force to graph here.'
            : 'Input effort is unavailable for this mechanism.'));
      return [[datum_X, datum_Y, datum_Z], categories];
    }

    // The solver keeps its answers in statics, and starts each graph from a
    // clean set of them rather than from the last mechanism graphed.
    KinematicsSolver.resetVariables();
    KinematicsSolver.requiredLoops = mechanism.requiredLoops;
    mechanism.joints.forEach((_, index) => {
      categories.push(mechanism.timeNum[index]?.toString() ?? index.toString());
      collect(index);
    });
    return [[datum_X, datum_Y, datum_Z], categories];
  }
}
