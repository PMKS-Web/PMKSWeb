import { Component, ViewChild } from '@angular/core';
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
};

@Component({
  selector: 'app-analysis-panel',
  templateUrl: './analysis-panel.component.html',
  styleUrls: ['./analysis-panel.component.scss'],
})
export class AnalysisPanelComponent {
  public chartOptions: Partial<ChartOptions> = {};

  @ViewChild('chart', { static: true }) chart!: ChartComponent;

  animationTimestep: number = 0;

  ngOnInit(): void {
    //Subscribte to the emitter inside mechanismStateService
    GridComponent.onMechPositionChange.subscribe((data) => {
      this.chart.updateOptions({
        annotations: {
          xaxis: [
            {
              x: data,
              borderColor: '#00E396',
              label: {
                borderColor: '#00E396',
                orientation: 'horizontal',
                text: 'X Annotation',
              },
            },
          ],
        },
      });
    });
  }

  constructor() {
    this.testSetChart();
  }

  testSetChart() {
    ForceSolver.determineDesiredLoopLettersForce(GridComponent.mechanisms[0].requiredLoops);
    ForceSolver.determineForceAnalysis(
      GridComponent.joints,
      GridComponent.links,
      'static',
      ToolbarComponent.gravity,
      ToolbarComponent.unit
    );
    this.determineChart('force', 'statics', 'Input Torque', '');
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
            chartTitle = 'Torque for Mechanism';
            data1Title = 'Torque (Nm)';
            yAxisTitle = 'Torque (Nm)';
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: data1Title, type: 'line', data: datum[0] });
            console.error(seriesData);
            break;
          case 'Joint Forces':
            chartTitle = 'Force Magnitudes';
            data1Title = 'Force ' + mechPart + ' X-Magnitude (N)';
            data2Title = 'Force ' + mechPart + ' Y-Magnitude (N)';
            data3Title = 'Abs Force (N)';
            yAxisTitle = 'Force (N)';
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: data1Title, type: 'line', data: datum[0] });
            seriesData.push({ name: data2Title, type: 'line', data: datum[1] });
            seriesData.push({ name: data3Title, type: 'line', data: datum[2] });
            break;
        }
        break;
      case 'stress':
        break;
      case 'kinematic':
        switch (mechProp) {
          case 'Linear Joint Pos':
            chartTitle = "Joint's Linear Position";
            data1Title = 'Joint ' + mechPart + ' X Position ' + posLinUnit;
            data2Title = 'Joint ' + mechPart + ' Y Position ' + posLinUnit;
            yAxisTitle = 'Position ' + posLinUnit;
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: data1Title, type: 'line', data: datum[0] });
            seriesData.push({ name: data2Title, type: 'line', data: datum[1] });
            break;
          case 'Linear Joint Vel':
            chartTitle = "Joint's Linear Velocity";
            data1Title = 'Joint ' + mechPart + ' X Velocity ' + velLinUnit;
            data2Title = 'Joint ' + mechPart + ' Y Velocity ' + velLinUnit;
            data3Title = 'Absolute Velocity ' + velLinUnit;
            yAxisTitle = 'Velocity ' + velLinUnit;
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: data1Title, type: 'line', data: datum[0] });
            seriesData.push({ name: data2Title, type: 'line', data: datum[1] });
            seriesData.push({ name: data3Title, type: 'line', data: datum[2] });
            break;
          case 'Linear Joint Acc':
            chartTitle = "Joint's Linear Acceleration";
            data1Title = 'Joint ' + mechPart + ' X Acceleration ' + accLinUnit;
            data2Title = 'Joint ' + mechPart + ' Y Acceleration ' + accLinUnit;
            data3Title = 'Absolute Acceleration ' + accLinUnit;
            yAxisTitle = 'Acceleration ' + accLinUnit;
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: data1Title, type: 'line', data: datum[0] });
            seriesData.push({ name: data2Title, type: 'line', data: datum[1] });
            seriesData.push({ name: data3Title, type: 'line', data: datum[2] });
            break;
          case "Linear Link's CoM Pos":
            chartTitle = "Link's Center of Mass Linear Position";
            data1Title = 'Link ' + mechPart + ' (CoM) X Position ' + posLinUnit;
            data2Title = 'Link ' + mechPart + ' (CoM) Y Position ' + posLinUnit;
            yAxisTitle = 'Position (CoM) ' + posLinUnit;
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: data1Title, type: 'line', data: datum[0] });
            seriesData.push({ name: data2Title, type: 'line', data: datum[1] });
            break;
          case "Linear Link's CoM Vel":
            chartTitle = "Link's Center of Mass Linear Velocity";
            data1Title = 'Link ' + mechPart + ' (CoM) X Velocity ' + velLinUnit;
            data2Title = 'Link ' + mechPart + ' (CoM) Y Velocity ' + velLinUnit;
            data3Title = 'Absolute Velocity ' + velLinUnit;
            yAxisTitle = 'Velocity ' + velLinUnit;
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: data1Title, type: 'line', data: datum[0] });
            seriesData.push({ name: data2Title, type: 'line', data: datum[1] });
            seriesData.push({ name: data3Title, type: 'line', data: datum[2] });
            break;
          case "Linear Link's CoM Acc":
            chartTitle = "Link's Center of Mass Linear Acceleration";
            data1Title = 'Link ' + mechPart + ' (CoM) X Acceleration ' + accLinUnit;
            data2Title = 'Link ' + mechPart + ' (CoM) Y Acceleration ' + accLinUnit;
            data3Title = 'Link Absolute Acceleration ' + accLinUnit;
            yAxisTitle = 'Acceleration ' + accLinUnit;
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: data1Title, type: 'line', data: datum[0] });
            seriesData.push({ name: data2Title, type: 'line', data: datum[1] });
            seriesData.push({ name: data3Title, type: 'line', data: datum[2] });
            break;
          case 'Angular Link Pos':
            chartTitle = "Link's Angular Position";
            data1Title = 'Link ' + mechPart + ' Angle ' + posAngUnit;
            yAxisTitle = 'Position ' + posAngUnit;
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: data1Title, type: 'line', data: datum[0] });
            break;
          case 'Angular Link Vel':
            chartTitle = "Link's Angular Velocity";
            data1Title = 'Link ' + mechPart + ' Angular Velocity ' + velAngUnit;
            yAxisTitle = 'Velocity ' + velAngUnit;
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: data1Title, type: 'line', data: datum[0] });
            break;
          case 'Angular Link Acc':
            chartTitle = "Link's Angular Acceleration";
            data1Title = 'Link ' + mechPart + ' Angular Acceleration ' + accAngUnit;
            yAxisTitle = 'Acceleration ' + accAngUnit;
            [datum, categories] = this.determineAnalysis(
              analysis,
              analysisType,
              mechProp,
              mechPart
            );
            seriesData.push({ name: data1Title, type: 'line', data: datum[0] });
            break;
        }
        break;
      default:
        return;
    }

    this.chartOptions = {
      series: seriesData,
      annotations: {
        xaxis: [
          {
            x: this.animationTimestep,
            borderColor: '#00E396',
            label: {
              borderColor: '#00E396',
              orientation: 'horizontal',
              text: 'X Annotation',
            },
          },
        ],
      },
      chart: {
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
        curve: 'smooth',
      },
      tooltip: {
        followCursor: false,
        theme: 'dark',
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
        padding: {
          top: 10,
          right: 0,
          bottom: 0,
          left: 0,
        },
      },
      xaxis: {
        position: 'bottom',
        categories: categories,
        labels: {
          rotate: 0,
          rotateAlways: true,
          trim: true,
        },
        tickAmount: 2,
        title: {
          text: xAxisTitle,
        },
      },
      yaxis: {
        title: {
          text: yAxisTitle,
        },
      },
    };
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
            console.warn('@ Input Torque - Dynamics');
            // TODO: Be sure to have each step within mechanism know its input angular velocity
            KinematicsSolver.requiredLoops = GridComponent.mechanisms[0].requiredLoops;
            KinematicsSolver.determineKinematics(
              GridComponent.mechanisms[0].joints[index],
              GridComponent.mechanisms[0].links[index],
              GridComponent.mechanisms[0].inputAngularVelocities[index]
            );
          }
          // console.warn('@ Input Torque');
          // console.log(GridComponent.mechanisms[0].joints[index]);
          // console.log(GridComponent.mechanisms[0].links[index]);
          // console.log(analysisType);
          // console.log(ToolbarComponent.gravity);
          // console.log(ToolbarComponent.unit);
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
      categories.push(index.toString());
    });
    return [[datum_X, datum_Y, datum_Z], categories];
  }
}
