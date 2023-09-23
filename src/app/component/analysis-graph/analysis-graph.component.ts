import {
  AfterViewInit,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
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
  ChartComponent,
} from 'ng-apexcharts';
import { KinematicsSolver } from 'src/app/model/mechanism/kinematic-solver';
import { ForceSolver } from 'src/app/model/mechanism/force-solver';
import { AngleUnit, GlobalUnit, LengthUnit, roundNumber } from '../../model/utils';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { FormBuilder } from '@angular/forms';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { ActiveObjService } from '../../services/active-obj.service';

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
})
export class AnalysisGraphComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  public chartOptions: Partial<ChartOptions> = {
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
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      curve: 'straight',
      width: 2,
    },
    colors: ['#313aa7', '#ea2b29', '#fdb50e'],
    tooltip: {
      // followCursor: false,
      // theme: 'dark',
      x: {
        // show: false,
        formatter: function (val) {
          return 'T=' + ((val - 1) / 62.5).toFixed(2) + 's';
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
      position: 'bottom',
      offsetY: -190,
      // floating: true,
      // categories: categories,
      labels: {
        rotate: 0,
        rotateAlways: true,
        trim: true,
        formatter: function (val) {
          return String((Number(val) - 1) / 62.5);
        },
      },
      tickAmount: 1,
      title: {
        text: 'Time, T (second)',
        offsetY: 55,
        offsetX: -10,
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

  //Get the child element in the template with "#chart"
  @ViewChild('chart', { static: true }) chart!: ChartComponent;

  animationTimestep: number = 0;
  numberOfSeries: number = 0;

  noDataSelected: boolean = false;

  mechPositionSub: any;
  mechStateSub: any;

  loading: boolean = false;

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
    //We don't want to resubscribe to things when the component is first initialized
    //Since onInit and ngAfterView will be called on initialization, double calling leads to too many subscriptions
    // if (changes['mechPart'].isFirstChange()) {
    //   return;
    // }
    // this.ngOnDestroy();
    // this.ngOnInit();
    // this.ngAfterViewInit();
    // ForceSolver.resetVariables();
    // KinematicsSolver.resetVariables();
    // ForceSolver.determineDesiredLoopLettersForce(this.mechanismService.mechanisms[0].requiredLoops);
    // ForceSolver.determineForceAnalysis(
    //     this.mechanismService.joints,
    //     this.mechanismService.links,
    //     'static',
    //     this.settingsService.isGravity.value,
    //     unitStr
    // );
    //
    // KinematicsSolver.requiredLoops = this.mechanismService.mechanisms[0].requiredLoops;
    // KinematicsSolver.determineKinematics(
    //     this.mechanismService.joints,
    //     this.mechanismService.links,
    //     ToolbarComponent.inputAngularVelocity
    // );
    this.updateChartData();
  }

  updateChartData() {
    this.determineChart(this.analysis, this.analysisType, this.mechProp, this.mechPart);
    // this.ngAfterViewInit();
    setTimeout(() => {
      this.seriesCheckboxForm.patchValue(
        {
          x: this.seriesCheckboxForm.value.x,
          y: this.seriesCheckboxForm.value.y,
          z: this.seriesCheckboxForm.value.z,
        },
        { emitEvent: true }
      );
    }, 1);
  }

  ngAfterViewInit(): void {
    //Delay this call by 1ms to make sure the chart is initialized
    setTimeout(() => {
      // this.chart.clearAnnotations();
      if (this.numberOfSeries === 3) {
        this.seriesCheckboxForm.patchValue({
          x: false,
          y: false,
          z: true,
        });
      }
      if (this.numberOfSeries === 2) {
        this.seriesCheckboxForm.patchValue({
          x: true,
          y: true,
          z: false,
        });
      }
      if (this.numberOfSeries === 1) {
        this.seriesCheckboxForm.patchValue({
          x: false,
          y: false,
          z: true,
        });
      }
    }, 1);
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

    this.seriesCheckboxForm.valueChanges.subscribe((data) => {
      if (this.chart === null) return;

      switch (this.numberOfSeries) {
        case 3:
          data.x ? this.chart.showSeries('X') : this.chart.hideSeries('X');
          data.y ? this.chart.showSeries('Y') : this.chart.hideSeries('Y');
          data.z ? this.chart.showSeries('Z') : this.chart.hideSeries('Z');
          this.noDataSelected = !data.x && !data.y && !data.z;
          break;
        case 2:
          data.x ? this.chart.showSeries('X') : this.chart.hideSeries('X');
          data.y ? this.chart.showSeries('Y') : this.chart.hideSeries('Y');
          this.noDataSelected = !data.x && !data.y;
          break;
        case 1:
          data.z ? this.chart.showSeries('Z') : this.chart.hideSeries('Z');
          this.noDataSelected = !data.z;
          break;
      }

      this.showAnnotations(this.mechanismService.mechanismTimeStep);
    });

    this.settingsService.angleUnit.subscribe((t) => {
      //Force update the Y axis text with the new label
      setTimeout(() => {
        if (this.chart.chart) {
          this.chart.updateOptions(
            {
              yaxis: this.chartOptions.yaxis,
            },
            false,
            true
          );
        }
      }, 1);
    });

    this.settingsService.lengthUnit.subscribe((t) => {
      //Force update the Y axis text with the new label
      setTimeout(() => {
        if (this.chart.chart) {
          this.chart.updateOptions(
            {
              yaxis: this.chartOptions.yaxis,
            },
            false,
            true
          );
        }
      }, 1);
    });

    this.mechStateSub = this.mechanismService.onMechUpdateState.subscribe((data) => {
      switch (data) {
        case 0:
          this.loading = false;
          break;
        case 1:
          //Apply css class to the chart to make it look like it's loading
          this.loading = true;
          break;
        case 2:
          if (this.mechanismService.oneValidMechanismExists()) {
            this.updateChartData();
            this.mechanismService.onMechUpdateState.next(0);
          }
          break;
      }
    });

    this.mechPositionSub = this.mechanismService.onMechPositionChange.subscribe((timeIndex) => {
      this.showAnnotations(timeIndex);
    });
  }

  private showAnnotations(timeIndex: number) {
    if (timeIndex === 0) {
      this.chart.clearAnnotations();
      return;
    }
    if (
      this.seriesCheckboxForm.value.x ||
      this.seriesCheckboxForm.value.y ||
      this.seriesCheckboxForm.value.z
    ) {
      this.chart.clearAnnotations();
      this.chart.addXaxisAnnotation(
        {
          x: timeIndex,
          borderColor: '#000000',
          label: {
            text: 'T= ' + String((timeIndex / 62.5).toFixed(2)),
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

    this.seriesCheckboxForm.value.x &&
      xSeries &&
      this.chart.addPointAnnotation(
        {
          x: timeIndex,
          y: xSeries.data[timeIndex],
          marker: {
            strokeColor: '#313aa7',
            shape: 'square',
          },
          label: {
            borderColor: '#313aa7',
            fillColor: '#000000',
            orientation: 'horizontal',
            text: String(xSeries.data[timeIndex]),
          },
        },
        false
      );

    this.seriesCheckboxForm.value.y &&
      ySeries &&
      this.chart.addPointAnnotation(
        {
          x: timeIndex,
          y: ySeries.data[timeIndex],
          marker: {
            strokeColor: '#f42a2a',
            shape: 'square',
          },
          label: {
            borderColor: '#f42a2a',
            fillColor: '#000000',
            orientation: 'horizontal',
            text: String(ySeries.data[timeIndex]),
          },
        },
        false
      );

    this.seriesCheckboxForm.value.z &&
      zSeries &&
      this.chart.addPointAnnotation(
        {
          x: timeIndex,
          y: zSeries.data[timeIndex],
          marker: {
            strokeColor: this.numberOfSeries !== 3 ? '#313aa7' : '#fdb50e',
            shape: 'square',
          },
          label: {
            borderColor: this.numberOfSeries !== 3 ? '#313aa7' : '#fdb50e',
            fillColor: '#000000',
            orientation: 'horizontal',
            text: String(zSeries.data[timeIndex]),
          },
        },
        false
      );
  }

  ngOnDestroy(): void {
    if (this.mechPositionSub) {
      this.mechPositionSub.unsubscribe();
    }
    if (this.mechStateSub) {
      this.mechStateSub.unsubscribe();
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
    // if (this.settingsService.globalUnit.value === GlobalUnit.METRIC) {
    //   posLinUnit = '(m)';
    //   velLinUnit = '(m/s)';
    //   accLinUnit = '(m/s²)';
    // }
    switch (analysis) {
      case 'force':
        switch (mechProp) {
          case 'Input Torque':
            yAxisTitle = 'Torque (Nm)';
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: 'Nm', type: 'line', data: datum[0] });
            this.numberOfSeries = 1;
            break;
          case 'Joint Forces':
            yAxisTitle = 'Force (N)';
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            seriesData.push({ name: 'N', type: 'line', data: datum[2] });
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
            seriesData.push({ name: 'Ω', type: 'line', data: datum[2] });
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
            seriesData.push({ name: 'α', type: 'line', data: datum[2] });
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
            seriesData.push({ name: 'Ω', type: 'line', data: datum[2] });
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
            seriesData.push({ name: 'α', type: 'line', data: datum[2] });
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
            seriesData.push({ name: 'θ', type: 'line', data: series });
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
            if (this.settingsService.angleUnit.getValue() == AngleUnit.RADIAN) {
              for (let i = 0; i < series.length; i++) {
                series[i] = Number(
                  this.nup.convertAngle(series[i], AngleUnit.DEGREE, AngleUnit.RADIAN).toFixed(4)
                );
              }
            }
            seriesData.push({ name: 'Ω', type: 'line', data: series });
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
            if (this.settingsService.angleUnit.getValue() == AngleUnit.RADIAN) {
              for (let i = 0; i < series.length; i++) {
                series[i] = Number(
                  this.nup.convertAngle(series[i], AngleUnit.DEGREE, AngleUnit.RADIAN).toFixed(4)
                );
              }
            }
            seriesData.push({ name: 'α', type: 'line', data: series });
            this.numberOfSeries = 1;
            break;
        }
        break;
      default:
        return;
    }

    this.chartOptions = { ...this.chartOptions, series: seriesData };
    // this.chart.updateOptions({ ...this.chartOptions, series: seriesData });
    // this.chart.updateOptions({ ...this.chartOptions.yaxis!.title, text: yAxisTitle });
    this.chartOptions.yaxis!.title = { ...this.chartOptions.yaxis!.title, text: yAxisTitle };
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
    let unitStr = 'cm';
    switch (this.settingsService.globalUnit.value) {
      case GlobalUnit.ENGLISH:
        unitStr = 'cm';
        break;
      case GlobalUnit.METRIC:
        unitStr = 'cm';
        break;
      case GlobalUnit.NULL:
        unitStr = 'cm';
        break;
      case GlobalUnit.SI:
        unitStr = 'cm';
        break;
    }
    this.mechanismService.mechanisms[0].joints.forEach((_, index) => {
      switch (mechProp) {
        case 'Input Torque':
          if (analysisType === 'dynamics') {
            // TODO: Be sure to have each step within mechanism know its input angular velocity
            KinematicsSolver.requiredLoops = this.mechanismService.mechanisms[0].requiredLoops;
            KinematicsSolver.determineKinematics(
              this.mechanismService.mechanisms[0].joints[index],
              this.mechanismService.mechanisms[0].links[index],
              this.mechanismService.mechanisms[0].inputAngularVelocities[index]
            );
          }
          ForceSolver.determineForceAnalysis(
            this.mechanismService.mechanisms[0].joints[index],
            this.mechanismService.mechanisms[0].links[index],
            analysisType,
            this.settingsService.isForces.value,
            unitStr
          );
          datum_X.push(roundNumber(ForceSolver.unknownVariableTorque, 3));
          break;
        case 'Joint Forces':
          if (analysisType === 'dynamics') {
            KinematicsSolver.requiredLoops = this.mechanismService.mechanisms[0].requiredLoops;
            KinematicsSolver.determineKinematics(
              this.mechanismService.mechanisms[0].joints[index],
              this.mechanismService.mechanisms[0].links[index],
              this.mechanismService.mechanisms[0].inputAngularVelocities[index]
            );
          }
          ForceSolver.determineForceAnalysis(
            this.mechanismService.mechanisms[0].joints[index],
            this.mechanismService.mechanisms[0].links[index],
            analysisType,
            this.settingsService.isForces.value,
            unitStr
          );
          x = ForceSolver.unknownVariableForcesMap.get(mechPart)![0];
          y = ForceSolver.unknownVariableForcesMap.get(mechPart)![1];
          z = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          datum_Z.push(roundNumber(z, 3));
          break;
        case 'Linear Joint Pos':
          const jt = this.mechanismService.mechanisms[0].joints[index].find(
            (j) => j.id === mechPart
          )!;
          x = jt.x;
          y = jt.y;
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          break;
        case 'Linear Joint Vel':
          KinematicsSolver.determineKinematics(
            this.mechanismService.mechanisms[0].joints[index],
            this.mechanismService.mechanisms[0].links[index],
            this.mechanismService.mechanisms[0].inputAngularVelocities[index]
          );
          x = KinematicsSolver.jointVelMap.get(mechPart)![0];
          y = KinematicsSolver.jointVelMap.get(mechPart)![1];
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
          x = KinematicsSolver.jointAccMap.get(mechPart)![0];
          y = KinematicsSolver.jointAccMap.get(mechPart)![1];
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
          x = KinematicsSolver.linkCoMMap.get(mechPart)![0];
          y = KinematicsSolver.linkCoMMap.get(mechPart)![1];
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          break;
        case "Linear Link's CoM Vel":
          KinematicsSolver.determineKinematics(
            this.mechanismService.mechanisms[0].joints[index],
            this.mechanismService.mechanisms[0].links[index],
            this.mechanismService.mechanisms[0].inputAngularVelocities[index]
          );
          x = KinematicsSolver.linkVelMap.get(mechPart)![0];
          y = KinematicsSolver.linkVelMap.get(mechPart)![1];
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
          x = KinematicsSolver.linkAccMap.get(mechPart)![0];
          y = KinematicsSolver.linkAccMap.get(mechPart)![1];
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
          x = KinematicsSolver.linkAngPosMap.get(mechPart)!;
          datum_X.push(roundNumber(x, 3));
          break;
        case 'Angular Link Vel':
          KinematicsSolver.determineKinematics(
            this.mechanismService.mechanisms[0].joints[index],
            this.mechanismService.mechanisms[0].links[index],
            this.mechanismService.mechanisms[0].inputAngularVelocities[index]
          );
          x = KinematicsSolver.linkAngVelMap.get(mechPart)!;
          datum_X.push(roundNumber(x, 3));
          break;
        case 'Angular Link Acc':
          KinematicsSolver.determineKinematics(
            this.mechanismService.mechanisms[0].joints[index],
            this.mechanismService.mechanisms[0].links[index],
            this.mechanismService.mechanisms[0].inputAngularVelocities[index]
          );
          x = KinematicsSolver.linkAngAccMap.get(mechPart)!;
          datum_X.push(roundNumber(x, 3));
          break;
        case 'ic':
          break;
      }
    });
    return [[datum_X, datum_Y, datum_Z], categories];
  }
}
