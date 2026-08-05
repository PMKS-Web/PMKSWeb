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
} from '@angular/core';
import {
  ApexAnnotations,
  ApexAxisChartSeries,
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
import { ForceAnalysisMode } from 'src/app/model/mechanism/force-solver';
import { AngleUnit, ForceUnit, LengthUnit, roundNumber } from '../../model/utils';
import { LBF_IN_PER_NEWTON_METER, LBF_PER_NEWTON } from '../../model/unit-conversions';
import { MODEL_SCALE } from '../../model/render-scale';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { FormBuilder } from '@angular/forms';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { skip, Subscription } from 'rxjs';
import { AnalysisApexChartComponent } from './analysis-apex-chart.component';

export type ChartOptions = {
  annotations: ApexAnnotations;
  series: ApexAxisChartSeries;
  chart: any; //ApexChart;
  dataLabels: ApexDataLabels;
  markers: ApexMarkers;
  title: ApexTitleSubtitle;
  fill: ApexFill;
  yaxis: ApexYAxis;
  xaxis: ApexXAxis;
  tooltip: ApexTooltip;
  stroke: ApexStroke;
  grid: any; //ApexGrid;
  colors: any;
  toolbar: any;
  legend: ApexLegend;
};

export const ANALYSIS_SERIES_COLORS = {
  X: '#313aa7',
  Y: '#ea2b29',
  Z: '#fdb50e',
} as const;

/**
 * Time axis labels: a typical cycle runs 0-3 s, where "3.000" is noise. Cap at
 * three decimals and drop the ones that carry no information.
 */
export function formatTimeLabel(value: number): string {
  const rounded = Number(value);
  if (!Number.isFinite(rounded)) return '';
  return Number(rounded.toFixed(3)).toString();
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
  standalone: false,
})
export class AnalysisGraphComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  public chartOptions: Partial<ChartOptions> = {
    annotations: {
      xaxis: [],
      points: [],
    },
    chart: {
      objectScale: '100%', //380
      height: '250px', //300
      animations: {
        // enabled: false,
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
        top: 0,
        bottom: 12,
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
      position: 'top',
      offsetY: 15,
      // floating: true,
      // categories: categories,
      labels: {
        rotate: 0,
        rotateAlways: true,
        // Apex trims a label to its own tick slot, which is far narrower than
        // the space actually free at the two ends of this axis.
        trim: false,
        hideOverlappingLabels: false,
        offsetY: 0,
        formatter: function (val) {
          return formatTimeLabel(Number(val));
        },
      },
      tickAmount: 1,
      title: {
        text: 'Time (seconds)',
        // small nudge to sit on the same baseline as the tick labels
        offsetY: 6,
        offsetX: 0,
      },
      tooltip: {
        enabled: false,
      },
    },
    yaxis: {
      showForNullSeries: false,
      forceNiceScale: true,
      min: function (min) {
        return Math.floor(min);
      },
      max: function (max) {
        return Math.ceil(max);
      },
      title: {
        text: 'setLater',
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

  //Get the child element in the template with "#chart"
  @ViewChild('chart', { static: false }) chart!: AnalysisApexChartComponent;

  animationTimestep: number = 0;
  numberOfSeries: number = 0;
  displayedSeries: ApexAxisChartSeries = [];
  displayedColors: string[] = [];

  get compactSingleSeries(): boolean {
    return this.numberOfSeries === 1;
  }

  noDataSelected: boolean = false;
  analysisDiagnostic: string | null = null;

  loading: boolean = false;
  private subscriptions = new Subscription();
  private chartSyncTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  constructor(
    private fb: FormBuilder,
    private mechanismService: MechanismService,
    public settingsService: SettingsService,
    private nup: NumberUnitParserService,
    private activeSrv: ActiveObjService
  ) {}

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
    // console.log(this.analysis, this.analysisType, this.mechProp, this.mechPart);
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
      this.mechanismService.onMechPositionChange.subscribe((timeIndex) => {
        this.showAnnotations(timeIndex);
      })
    );
  }

  private scheduleChartSync(resetSelection: boolean): void {
    if (this.chartSyncTimer) clearTimeout(this.chartSyncTimer);
    this.chartSyncTimer = setTimeout(() => {
      if (this.destroyed) return;
      if (resetSelection) {
        // Force graphs open on the X/Y components, since the direction of a
        // reaction is what's being read; kinematic graphs still lead with the
        // magnitude. A single-series graph only ever has the magnitude to show.
        const showComponents =
          this.numberOfSeries === 2 || (this.numberOfSeries === 3 && this.analysis === 'force');
        const selection = showComponents
          ? { x: true, y: true, z: false }
          : { x: false, y: false, z: true };
        this.seriesCheckboxForm.patchValue(selection, { emitEvent: false });
      }
      this.applySeriesVisibility();
      this.updateYAxis();
    }, 1);
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
    if (this.chart) this.showAnnotations(this.mechanismService.mechanismTimeStep);
  }

  private updateYAxis(): void {
    if (!this.chart) return;
    const chartInput = (this.chart as unknown as { chart?: () => unknown }).chart;
    if (typeof chartInput === 'function' && !chartInput()) return;
    this.chart.updateOptions({ yaxis: this.chartOptions.yaxis }, false, true);
  }

  private showAnnotations(timeIndex: number) {
    if (!this.chart) return;
    if (timeIndex === 0) {
      this.chart.clearAnnotations();
      return;
    }
    const timeSeconds = this.mechanismService.mechanisms[0]?.timeNum[timeIndex] ?? timeIndex;
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
          label: {
            text: 'T= ' + formatTimeLabel(timeSeconds),
            orientation: 'horizontal',
            offsetY: -20,
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
          text: String(value),
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

  private pointTime(point: unknown, index: number): number {
    if (point && typeof point === 'object' && 'x' in point) {
      const value = (point as { x: unknown }).x;
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return this.mechanismService.mechanisms[0]?.timeNum[index] ?? index;
  }

  buildCSVContent(): string {
    const xSeries = this.chartOptions.series?.find((s) => s.name === 'X');
    const ySeries = this.chartOptions.series?.find((s) => s.name === 'Y');
    const zSeries = this.chartOptions.series?.find((s) => s.name === 'Z');
    const source = xSeries ?? ySeries ?? zSeries;
    const timeSteps = source?.data.length ?? 0;
    const fileName = this.chartOptions.yaxis?.title?.text || 'Z';
    const yAxisUnit = fileName.split(' ').pop()?.replace('Â', '') ?? '';
    let csvContent = '';
    if (!xSeries && !ySeries) {
      csvContent += 'Time (seconds),Time (steps),' + fileName + '\n';
      for (let i = 0; i < timeSteps; i++) {
        csvContent +=
          this.pointTime(zSeries?.data[i], i) +
          ',' +
          i +
          ',' +
          (this.pointValue(zSeries?.data[i]) ?? '') +
          '\n';
      }
    } else if (!zSeries) {
      csvContent += 'Time (seconds),Time (steps),X ' + yAxisUnit + ',Y ' + yAxisUnit + '\n';
      for (let i = 0; i < timeSteps; i++) {
        csvContent +=
          this.pointTime(xSeries?.data[i], i) +
          ',' +
          i +
          ',' +
          (this.pointValue(xSeries?.data[i]) ?? '') +
          ',' +
          (this.pointValue(ySeries?.data[i]) ?? '') +
          '\n';
      }
    } else {
      csvContent += 'Time (seconds),Time (steps),' + fileName + ', X-comp,Y-comp\n';
      for (let i = 0; i < timeSteps; i++) {
        csvContent +=
          this.pointTime(zSeries.data[i], i) +
          ',' +
          i +
          ',' +
          (this.pointValue(zSeries.data[i]) ?? '') +
          ',' +
          (this.pointValue(xSeries?.data[i]) ?? '') +
          ',' +
          (this.pointValue(ySeries?.data[i]) ?? '') +
          '\n';
      }
    }
    return csvContent;
  }

  downloadCSV() {
    const encodedUri = encodeURI('data:text/csv;charset=utf-8,' + this.buildCSVContent());
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const fileName = this.chartOptions.yaxis?.title?.text || 'Analysis';
    // Several rows can graph the same joint, one per reacting link.
    const part = this.reactionLinkId ? `${this.mechPart}_${this.reactionLinkId}` : this.mechPart;
    link.setAttribute('download', part + '_' + fileName + '.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  determineChart(analysis: string, analysisType: string, mechProp: string, mechPart: string) {
    let data1Title = '';
    let data2Title = '';
    let data3Title = '';
    let chartTitle = '';
    const xAxisTitle = 'Time-steps';
    let yAxisTitle = '';
    let datum: number[][] = [];
    let categories: string[] = [];
    const seriesData = [];
    let posLinUnit = '(' + this.getUnitStr(this.settingsService.lengthUnit.value) + ')';
    let velLinUnit = '(' + this.getUnitStr(this.settingsService.lengthUnit.value) + '/s)';
    let accLinUnit = '(' + this.getUnitStr(this.settingsService.lengthUnit.value) + '/s²)';
    const posAngUnit = '(' + this.getUnitStr(this.settingsService.angleUnit.value) + ')';
    // const posAngUnit = '(rad)';
    const velAngUnit = '(' + this.getUnitStr(this.settingsService.angleUnit.value) + '/s)';
    const accAngUnit = '(' + this.getUnitStr(this.settingsService.angleUnit.value) + '/s²)';
    this.analysisDiagnostic = null;
    // if (this.settingsService.globalUnit.value === GlobalUnit.METRIC) {
    //   posLinUnit = '(m)';
    //   velLinUnit = '(m/s)';
    //   accLinUnit = '(m/s²)';
    // }
    switch (analysis) {
      case 'force':
        switch (mechProp) {
          case 'Input Torque':
          case 'Input Effort': {
            const mode: ForceAnalysisMode = analysisType === 'dynamic' ? 'dynamic' : 'static';
            const effortKind = this.mechanismService.mechanisms[0]
              .getForceAnalysis(mode)
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
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: 'Z', type: 'line', data: datum[0] });
            this.numberOfSeries = 1;
            break;
          }
          case 'Joint Forces':
            yAxisTitle =
              this.settingsService.forceUnit.value === ForceUnit.LBF ? 'Force (lbf)' : 'Force (N)';
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
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
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            this.numberOfSeries = 2;
            break;
          case 'Linear Joint Vel':
            yAxisTitle = 'Velocity ' + velLinUnit;
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            seriesData.push({ name: 'Z', type: 'line', data: datum[2] });
            this.numberOfSeries = 3;
            break;
          case 'Linear Joint Acc':
            yAxisTitle = 'Acceleration ' + accLinUnit;
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            seriesData.push({ name: 'Z', type: 'line', data: datum[2] });
            this.numberOfSeries = 3;
            break;
          case "Linear Link's CoM Pos":
            yAxisTitle = 'Position (CoM) ' + posLinUnit;
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            this.numberOfSeries = 2;
            break;
          case "Linear Link's CoM Vel":
            yAxisTitle = 'Velocity ' + velLinUnit;
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            seriesData.push({ name: 'Z', type: 'line', data: datum[2] });
            this.numberOfSeries = 3;
            break;
          case "Linear Link's CoM Acc":
            yAxisTitle = 'Acceleration ' + accLinUnit;
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            seriesData.push({ name: 'Z', type: 'line', data: datum[2] });
            this.numberOfSeries = 3;
            break;
          case 'Angular Link Pos':
            yAxisTitle = 'Position ' + posAngUnit;
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            var series: number[] = datum[0];
            if (this.settingsService.angleUnit.getValue() == AngleUnit.RADIAN) {
              for (let i = 0; i < series.length; i++) {
                series[i] = Number(
                  this.nup.convertAngle(series[i], AngleUnit.DEGREE, AngleUnit.RADIAN).toFixed(4)
                );
              }
            }
            seriesData.push({ name: 'Z', type: 'line', data: series });
            this.numberOfSeries = 1;
            break;
          case 'Angular Link Vel':
            yAxisTitle = 'Velocity ' + velAngUnit;
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            var series: number[] = datum[0];
            if (this.settingsService.angleUnit.getValue() == AngleUnit.DEGREE) {
              for (let i = 0; i < series.length; i++) {
                series[i] = Number(
                  this.nup.convertAngle(series[i], AngleUnit.RADIAN, AngleUnit.DEGREE).toFixed(4)
                );
              }
            }
            seriesData.push({ name: 'Z', type: 'line', data: series });
            this.numberOfSeries = 1;
            break;
          case 'Angular Link Acc':
            yAxisTitle = 'Acceleration ' + accAngUnit;
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            var series: number[] = datum[0];
            if (this.settingsService.angleUnit.getValue() == AngleUnit.DEGREE) {
              for (let i = 0; i < series.length; i++) {
                series[i] = Number(
                  this.nup.convertAngle(series[i], AngleUnit.RADIAN, AngleUnit.DEGREE).toFixed(4)
                );
              }
            }
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
    const times = this.mechanismService.mechanisms[0]?.timeNum ?? [];
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
    let x = 0;
    let y = 0;
    let z = 0;
    const categories: string[] = [];
    const mechanism = this.mechanismService.mechanisms[0];
    if (analysis === 'force') {
      const mode: ForceAnalysisMode = analysisType === 'dynamic' ? 'dynamic' : 'static';
      const result = mechanism.getForceAnalysis(mode);
      const forceConversion =
        this.settingsService.forceUnit.value === ForceUnit.LBF ? LBF_PER_NEWTON : 1;
      const torqueConversion =
        this.settingsService.forceUnit.value === ForceUnit.LBF ? LBF_IN_PER_NEWTON_METER : 1;

      for (const frame of result.frames) {
        categories.push(frame.timeSeconds.toString());
        if (frame.status !== 'ok') {
          datum_X.push(Number.NaN);
          if (mechProp === 'Joint Forces') {
            datum_Y.push(Number.NaN);
            datum_Z.push(Number.NaN);
          }
          continue;
        }

        if (mechProp === 'Input Torque' || mechProp === 'Input Effort') {
          // A torque's moment arms are internal model lengths (MODEL_SCALE
          // times the user's unit), so the solved value divides back down for
          // display. An input *force* has no length in it and is invariant.
          datum_X.push(
            frame.inputEffort
              ? roundNumber(
                  (frame.inputEffort.valueSI *
                    (frame.inputEffort.kind === 'force' ? forceConversion : torqueConversion)) /
                    (frame.inputEffort.kind === 'force' ? 1 : MODEL_SCALE),
                  3
                )
              : Number.NaN
          );
          continue;
        }

        const byLink = frame.jointReactionsByLink.get(mechPart);
        const reaction = this.reactionLinkId
          ? byLink?.get(this.reactionLinkId)
          : frame.jointReactions.get(mechPart);
        if (!reaction) {
          datum_X.push(Number.NaN);
          datum_Y.push(Number.NaN);
          datum_Z.push(Number.NaN);
          continue;
        }
        x = reaction[0] * forceConversion;
        y = reaction[1] * forceConversion;
        z = Math.hypot(x, y);
        datum_X.push(roundNumber(x, 3));
        datum_Y.push(roundNumber(y, 3));
        datum_Z.push(roundNumber(z, 3));
      }

      const hasFiniteData = [datum_X, datum_Y, datum_Z].some((series) =>
        series.some(Number.isFinite)
      );
      this.analysisDiagnostic = hasFiniteData
        ? null
        : (result.diagnostic ??
          (mechProp === 'Joint Forces'
            ? 'This point is internal to one welded body and has no independent joint reaction.'
            : 'Input effort is unavailable for this mechanism.'));
      return [[datum_X, datum_Y, datum_Z], categories];
    }

    KinematicsSolver.resetVariables();
    KinematicsSolver.requiredLoops = mechanism.requiredLoops;
    mechanism.joints.forEach((_, index) => {
      categories.push(mechanism.timeNum[index]?.toString() ?? index.toString());
      const vector = (value: [number, number] | undefined): [number, number] =>
        value ?? [Number.NaN, Number.NaN];
      switch (mechProp) {
        // Positions, velocities and accelerations are linear in length, so
        // each internal model value divides by MODEL_SCALE for display in the
        // user's unit. Angular series carry no length and pass through.
        case 'Linear Joint Pos':
          const jt = this.mechanismService.mechanisms[0].joints[index].find(
            (j) => j.id === mechPart
          );
          x = (jt?.x ?? Number.NaN) / MODEL_SCALE;
          y = (jt?.y ?? Number.NaN) / MODEL_SCALE;
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          break;
        case 'Linear Joint Vel':
          KinematicsSolver.determineKinematics(
            this.mechanismService.mechanisms[0].joints[index],
            this.mechanismService.mechanisms[0].links[index],
            this.mechanismService.mechanisms[0].inputAngularVelocities[index]
          );
          [x, y] = vector(KinematicsSolver.jointVelMap.get(mechPart));
          x /= MODEL_SCALE;
          y /= MODEL_SCALE;
          z = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          datum_Z.push(roundNumber(z, 3));
          break;
        case 'Linear Joint Acc':
          KinematicsSolver.determineKinematics(
            this.mechanismService.mechanisms[0].joints[index],
            this.mechanismService.mechanisms[0].links[index],
            this.mechanismService.mechanisms[0].inputAngularVelocities[index]
          );
          [x, y] = vector(KinematicsSolver.jointAccMap.get(mechPart));
          x /= MODEL_SCALE;
          y /= MODEL_SCALE;
          z = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          datum_Z.push(roundNumber(z, 3));
          break;
        case "Linear Link's CoM Pos":
          KinematicsSolver.determineKinematics(
            this.mechanismService.mechanisms[0].joints[index],
            this.mechanismService.mechanisms[0].links[index],
            this.mechanismService.mechanisms[0].inputAngularVelocities[index]
          );
          [x, y] = vector(KinematicsSolver.linkCoMMap.get(mechPart));
          x /= MODEL_SCALE;
          y /= MODEL_SCALE;
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          break;
        case "Linear Link's CoM Vel":
          KinematicsSolver.determineKinematics(
            this.mechanismService.mechanisms[0].joints[index],
            this.mechanismService.mechanisms[0].links[index],
            this.mechanismService.mechanisms[0].inputAngularVelocities[index]
          );
          [x, y] = vector(KinematicsSolver.linkVelMap.get(mechPart));
          x /= MODEL_SCALE;
          y /= MODEL_SCALE;
          z = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          datum_Z.push(roundNumber(z, 3));
          break;
        case "Linear Link's CoM Acc":
          KinematicsSolver.determineKinematics(
            this.mechanismService.mechanisms[0].joints[index],
            this.mechanismService.mechanisms[0].links[index],
            this.mechanismService.mechanisms[0].inputAngularVelocities[index]
          );
          [x, y] = vector(KinematicsSolver.linkAccMap.get(mechPart));
          x /= MODEL_SCALE;
          y /= MODEL_SCALE;
          z = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          datum_Z.push(roundNumber(z, 3));
          break;
        case 'Angular Link Pos':
          KinematicsSolver.determineKinematics(
            this.mechanismService.mechanisms[0].joints[index],
            this.mechanismService.mechanisms[0].links[index],
            this.mechanismService.mechanisms[0].inputAngularVelocities[index]
          );
          x = KinematicsSolver.linkAngPosMap.get(mechPart) ?? Number.NaN;
          datum_X.push(roundNumber(x, 3));
          break;
        case 'Angular Link Vel':
          KinematicsSolver.determineKinematics(
            this.mechanismService.mechanisms[0].joints[index],
            this.mechanismService.mechanisms[0].links[index],
            this.mechanismService.mechanisms[0].inputAngularVelocities[index]
          );
          x = KinematicsSolver.linkAngVelMap.get(mechPart) ?? Number.NaN;
          datum_X.push(roundNumber(x, 3));
          break;
        case 'Angular Link Acc':
          KinematicsSolver.determineKinematics(
            this.mechanismService.mechanisms[0].joints[index],
            this.mechanismService.mechanisms[0].links[index],
            this.mechanismService.mechanisms[0].inputAngularVelocities[index]
          );
          x = KinematicsSolver.linkAngAccMap.get(mechPart) ?? Number.NaN;
          datum_X.push(roundNumber(x, 3));
          break;
        case 'ic':
          break;
      }
    });
    return [[datum_X, datum_Y, datum_Z], categories];
  }
}
