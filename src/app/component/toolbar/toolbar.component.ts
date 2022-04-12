import {AfterViewInit, Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Joint} from "../../model/joint";
import {Link} from "../../model/link";
import {Force} from "../../model/force";
import {interval} from "rxjs";
import {GridComponent} from "../grid/grid.component";
import {Mechanism} from "../../model/mechanism/mechanism";
import {ForceSolver} from "../../model/mechanism/force-solver";

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.css']
})
export class ToolbarComponent implements OnInit, AfterViewInit {

  @Input() joints: Joint[] = [];
  @Input() links: Link[] = [];
  @Input() forces: Force[] = [];
  @Input() mechanisms: Mechanism[] = [];
  // TODO: Use screen Coord within toolbar if you can get to this stage of project
  @Input() screenCoord: string = '';
  @Output() showcaseTable = new EventEmitter();
  @Output() animateGridEmitter = new EventEmitter();
  @Output() showAnalysisPopup = new EventEmitter<string>();
  selectedTab: string = 'file';
  // showIdTags: boolean = false;
  // showCoMTags: boolean = false;
  unit: string = 'cm';
  gravity: boolean = false;
  animate: boolean = false;

  private static fileButton: SVGElement;
  private static analysisButton: SVGElement;
  private static settingsButton: SVGElement;
  private static helpButton: SVGElement;

  constructor() { }

  ngOnInit(): void {
  }

  ngAfterViewInit() {
    ToolbarComponent.fileButton = document.getElementById('fileButton') as unknown as SVGElement;
    ToolbarComponent.analysisButton = document.getElementById('analysisButton') as unknown as SVGElement;
    ToolbarComponent.settingsButton = document.getElementById('settingsButton') as unknown as SVGElement;
    ToolbarComponent.helpButton = document.getElementById('helpButton') as unknown as SVGElement;
  }

  showTable() {
    // TODO: If possible, don't have this as an emitter. Have the linkage table have an input here that determines the value,
    // TODO: that is either if it updates automoatically or if NgUpdates is needed
    this.showcaseTable.emit();
  }

  setTab(analysis: string) {
    // TODO: Maybe have this logic later???
    // if (this.selectedTab === analysis) {
    //   this.selectedTab = 'none';
    // } else {
    //   this.selectedTab = analysis;
    // }
    this.selectedTab = analysis
    switch (analysis) {
      case 'file':
        ToolbarComponent.fileButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: black; background-color: gray');
        ToolbarComponent.analysisButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        ToolbarComponent.settingsButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        ToolbarComponent.helpButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        break;
      case 'analysis':
        ToolbarComponent.fileButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        ToolbarComponent.analysisButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: black; background-color: gray');
        ToolbarComponent.settingsButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        ToolbarComponent.helpButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        break;
      case 'settings':
        ToolbarComponent.fileButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        ToolbarComponent.analysisButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        ToolbarComponent.settingsButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: black; background-color: gray');
        ToolbarComponent.helpButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        break;
      case 'help':
        ToolbarComponent.fileButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        ToolbarComponent.analysisButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        ToolbarComponent.settingsButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: gray; background-color: white');
        ToolbarComponent.helpButton.setAttribute('style',
          'height: 34px; width: 160px; font-size: 24px;\n' +
          '     font-family: Arial, sans-serif; cursor: pointer;color: black; background-color: gray');
        break;
    }
  }

  changeIdTag() {
    // this.showIdTags = !this.showIdTags;
  }

  changeCoMTag() {
    // this.showCoMTags = !this.showCoMTags;
  }

  animateMechanism() {
    console.log('animateMechanism');

    this.animate = !this.animate;
    if (this.animate) {
      this.animateGridEmitter.emit();
      // for (let i = 0; i < 360; i++) {
      for (let i = 0; i < 100; i++) {
        setTimeout(() => {
          // console.log("this is the first message")
          document.getElementById('slider')!.setAttribute('value', i.toString());
          console.log(i.toString());

        }, 10 * i);
      }
    } else {
      document.getElementById('slider')!.setAttribute('value','0');
    }
  }

  determineForceAnalysis() {
    // ForceSolver.determineDesiredLoopLettersForce(this.mechanisms[0].requiredLoops);
    // ForceSolver.determineForceAnalysis(this.joints, this.links, 'static', this.gravity, this.unit);
  }

  popUpAnalysis(analysisType: string) {
    switch (analysisType) {
      // TODO: add logic for determining each logic and determine whether analysis can be done
      case 'loop':
        break;
      case 'force':
        // ForceSolver.determineDesiredLoopLettersForce(this.mechanisms[0].requiredLoops);
        // ForceSolver.determineForceAnalysis(this.joints, this.links, 'static', this.gravity, this.unit);
        break;
      case 'stress':
        break;
      case 'kinematic':
        break;
      case 'ic':
        break
      default:
        return
    }
    this.showAnalysisPopup.emit(analysisType);
  }
}
