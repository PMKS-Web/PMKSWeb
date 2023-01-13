import { AfterViewInit, Component, Input, OnInit, ViewChild } from '@angular/core';
import {
  ChartComponent,
  ApexAxisChartSeries,
  ApexChart,
  ApexXAxis,
  ApexYAxis,
  ApexDataLabels,
  ApexGrid,
  ApexStroke,
  ApexTitleSubtitle,
  ApexMarkers,
  ApexFill,
  ApexTooltip,
  ApexAnnotations,
  ApexLegend,
} from 'ng-apexcharts';
import { KinematicsSolver } from 'src/app/model/mechanism/kinematic-solver';
import { GridComponent } from '../grid/grid.component';
import { ForceSolver } from 'src/app/model/mechanism/force-solver';
import { crossProduct, roundNumber } from '../../model/utils';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { AnimationBarComponent } from '../animation-bar/animation-bar.component';

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
})
export class AnalysisGraphComponent implements OnInit, AfterViewInit {
  public chartOptions: Partial<ChartOptions> = {
    chart: {
      width: '100%', //380
      height: '250px', //300
      animations: {
        // enabled: false,
      },
      type: 'line',
      zoom: {
        enabled: false,
      },
      toolbar: {
        show: false,
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
      followCursor: false,
      // theme: 'dark',
      x: {
        show: false,
      },
      marker: {
        show: false,
      },
      y: {
        title: {
          formatter: function () {
            return '';
          },
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
          return String(Number(val) - 1);
        },
      },
      tickAmount: 1,
      title: {
        text: 'Timesteps',
        offsetY: 55,
        offsetX: -10,
      },
    },
    yaxis: {
      showForNullSeries: false,
      forceNiceScale: true,
      min: function (min) {
        return min - 0.01;
      },
      max: function (max) {
        return max + 0.01;
      },
      title: {
        text: 'setLater',
      },
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

  ngAfterViewInit(): void {
    //Delay this call by 1ms to make sure the chart is initialized
    setTimeout(() => {
      if (this.numberOfSeries === 3) {
        this.chart.hideSeries('X');
        this.chart.hideSeries('Y');
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
    console.log(this.analysis, this.analysisType, this.mechProp, this.mechPart);

    this.determineChart(this.analysis, this.analysisType, this.mechProp, this.mechPart);

    //Subscribte to the emitter inside mechanismStateService
    GridComponent.onMechPositionChange.subscribe((data) => {
      this.chart.clearAnnotations();
      this.chart.addXaxisAnnotation({
        x: data,
        borderColor: '#313aa7',
      });
      this.chart.addPointAnnotation({
        x: data,
        y: this.chartOptions.series![0].data[data],
        marker: {
          strokeColor: '#313aa7',
          shape: 'square',
        },
        label: {
          borderColor: '#313aa7',
          fillColor: '#000000',
          orientation: 'horizontal',
          text: String(this.chartOptions.series![0].data[data]),
        },
      });
      if (this.numberOfSeries < 2) return;
      this.chart.addPointAnnotation({
        x: data,
        y: this.chartOptions.series![1].data[data],
        marker: {
          strokeColor: '#ea2b29',
          shape: 'square',
        },
        label: {
          borderColor: '#ea2b29',
          fillColor: '#000000',
          orientation: 'horizontal',
          text: String(this.chartOptions.series![0].data[data]),
        },
      });
      if (this.numberOfSeries < 3) return;
      this.chart.addPointAnnotation({
        x: data,
        y: this.chartOptions.series![2].data[data],
        marker: {
          strokeColor: '#fdb50e',
          shape: 'square',
        },
        label: {
          borderColor: '#fdb50e',
          fillColor: '#000000',
          orientation: 'horizontal',
          text: String(this.chartOptions.series![0].data[data]),
        },
      });
    });
  }

  toggleSeries(seriesName: string) {
    this.chart.toggleSeries(seriesName);
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
    let posLinUnit = '(cm)';
    let velLinUnit = '(cm/s)';
    let accLinUnit = '(cm/s^2)';
    const posAngUnit = '(degrees)';
    // const posAngUnit = '(rad)';
    const velAngUnit = '((rad)/s)';
    const accAngUnit = '((rad)/s^2)';
    if (ToolbarComponent.unit === 'm') {
      posLinUnit = 'm';
      velLinUnit = 'm/s';
      accLinUnit = 'm/s^2';
    }
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
            seriesData.push({ name: 'Z', type: 'line', data: datum[0] });
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
            seriesData.push({ name: 'Z', type: 'line', data: datum[0] });
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
            seriesData.push({ name: 'Z', type: 'line', data: datum[0] });
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
            seriesData.push({ name: 'Z', type: 'line', data: datum[0] });
            this.numberOfSeries = 1;
            break;
        }
        break;
      default:
        return;
    }

    this.chartOptions = { ...this.chartOptions, series: seriesData };
    this.chartOptions.yaxis!.title = { ...this.chartOptions.yaxis!.title, text: yAxisTitle };
  }

  determineAnalysis(
    analysis: string,
    analysisType: string,
    mechProp: string,
    mechPart: string
  ): [[number[], number[], number[]], string[]] {
    // console.warn('At determineAnalysis');
    // console.log(analysis);
    // console.log(analysisType);
    // console.log(mechProp);
    // console.log(mechPart);
    const datum_X: number[] = [];
    const datum_Y: number[] = [];
    const datum_Z: number[] = [];
    let x = 0;
    let y = 0;
    let z = 0;
    const categories: string[] = [];
    GridComponent.mechanisms[0].joints.forEach((_, index) => {
      switch (mechProp) {
        case 'Input Torque':
          if (analysisType === 'dynamics') {
            // TODO: Be sure to have each step within mechanism know its input angular velocity
            KinematicsSolver.requiredLoops = GridComponent.mechanisms[0].requiredLoops;
            KinematicsSolver.determineKinematics(
              GridComponent.mechanisms[0].joints[index],
              GridComponent.mechanisms[0].links[index],
              GridComponent.mechanisms[0].inputAngularVelocities[index]
            );
          }
          ForceSolver.determineForceAnalysis(
            GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index],
            analysisType,
            ToolbarComponent.gravity,
            ToolbarComponent.unit
          );
          datum_X.push(roundNumber(ForceSolver.unknownVariableTorque, 3));
          break;
        case 'Joint Forces':
          if (analysisType === 'dynamics') {
            KinematicsSolver.requiredLoops = GridComponent.mechanisms[0].requiredLoops;
            KinematicsSolver.determineKinematics(
              GridComponent.mechanisms[0].joints[index],
              GridComponent.mechanisms[0].links[index],
              GridComponent.mechanisms[0].inputAngularVelocities[index]
            );
          }
          ForceSolver.determineForceAnalysis(
            GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index],
            analysisType,
            ToolbarComponent.gravity,
            ToolbarComponent.unit
          );
          x = ForceSolver.unknownVariableForcesMap.get(mechPart)![0];
          y = ForceSolver.unknownVariableForcesMap.get(mechPart)![1];
          z = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          datum_Z.push(roundNumber(z, 3));
          break;
        case 'Linear Joint Pos':
          const jt = GridComponent.mechanisms[0].joints[index].find((j) => j.id === mechPart)!;
          x = jt.x;
          y = jt.y;
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          break;
        case 'Linear Joint Vel':
          KinematicsSolver.determineKinematics(
            GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index],
            GridComponent.mechanisms[0].inputAngularVelocities[index]
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
            GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index],
            GridComponent.mechanisms[0].inputAngularVelocities[index]
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
            GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index],
            GridComponent.mechanisms[0].inputAngularVelocities[index]
          );
          x = KinematicsSolver.linkCoMMap.get(mechPart)![0];
          y = KinematicsSolver.linkCoMMap.get(mechPart)![1];
          datum_X.push(roundNumber(x, 3));
          datum_Y.push(roundNumber(y, 3));
          break;
        case "Linear Link's CoM Vel":
          KinematicsSolver.determineKinematics(
            GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index],
            GridComponent.mechanisms[0].inputAngularVelocities[index]
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
            GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index],
            GridComponent.mechanisms[0].inputAngularVelocities[index]
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
            GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index],
            GridComponent.mechanisms[0].inputAngularVelocities[index]
          );
          x = KinematicsSolver.linkAngPosMap.get(mechPart)!;
          datum_X.push(roundNumber(x, 3));
          break;
        case 'Angular Link Vel':
          KinematicsSolver.determineKinematics(
            GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index],
            GridComponent.mechanisms[0].inputAngularVelocities[index]
          );
          x = KinematicsSolver.linkAngVelMap.get(mechPart)!;
          datum_X.push(roundNumber(x, 3));
          break;
        case 'Angular Link Acc':
          KinematicsSolver.determineKinematics(
            GridComponent.mechanisms[0].joints[index],
            GridComponent.mechanisms[0].links[index],
            GridComponent.mechanisms[0].inputAngularVelocities[index]
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
