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
  ApexLegend,
} from 'ng-apexcharts';
import { KinematicsSolver } from 'src/app/model/mechanism/kinematic-solver';
import { GridComponent } from '../grid/grid.component';
import { ForceSolver } from 'src/app/model/mechanism/force-solver';
import { crossProduct, roundNumber } from '../../model/utils';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { AnimationBarComponent } from '../animation-bar/animation-bar.component';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { FormBuilder } from '@angular/forms';

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
  selector: 'app-analysis-panel',
  templateUrl: './analysis-panel.component.html',
  styleUrls: ['./analysis-panel.component.scss'],
})
export class AnalysisPanelComponent {
  //A dictionary for wether each graph is expanded or not
  graphExpanded: { [key: string]: boolean } = {
    LKineAna: true,
    LForceAna: true,
    JKineAna: true,
    JForceAna: true,
    LAng: false,
    LAngVel: false,
    LAngAcc: false,
    LPos: false,
    LVel: false,
    LAcc: false,
    LForce: false,
    LStress: false,
    JPos: false,
    JVel: false,
    JAcc: false,
    JForce: false,
    JInputForce: false,
  };

  mechStateSub: any;

  constructor(public activeSrv: ActiveObjService, private fb: FormBuilder) {
    if (GridComponent.oneValidMechanismExists()) {
      this.resetVariablesAndSolve();
    }

    this.inputSpeedFormGroup.patchValue({ speed: '0' });
  }

  ngOnInit(): void {
    this.mechStateSub = GridComponent.onMechUpdateState.subscribe((data) => {
      switch (data) {
        case 3:
          if (GridComponent.oneValidMechanismExists()) {
            this.resetVariablesAndSolve();
            GridComponent.onMechUpdateState.next(2);
          }
          break;
      }
    });
  }

  ngOnDestroy() {
    this.mechStateSub.unsubscribe();
  }

  resetVariablesAndSolve() {
    KinematicsSolver.resetVariables();
    ForceSolver.determineDesiredLoopLettersForce(GridComponent.mechanisms[0].requiredLoops);
    ForceSolver.determineForceAnalysis(
      GridComponent.joints,
      GridComponent.links,
      'static',
      ToolbarComponent.gravity,
      ToolbarComponent.unit
    );

    KinematicsSolver.requiredLoops = GridComponent.mechanisms[0].requiredLoops;
    KinematicsSolver.determineKinematics(
      GridComponent.joints,
      GridComponent.links,
      ToolbarComponent.inputAngularVelocity
    );
  }

  handleDebugButton() {
    this.resetVariablesAndSolve();
  }

  validMechanisms() {
    return GridComponent.oneValidMechanismExists();
  }

  inputSpeedFormGroup = this.fb.group({
    speed: ['', { updateOn: 'change' }],
  });
}
