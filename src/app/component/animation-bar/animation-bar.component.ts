import { AfterViewInit, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { NgForm } from '@angular/forms';
// import {switchMapTo} from "rxjs";
import { Mechanism } from '../../model/mechanism/mechanism';
import { GridComponent } from '../grid/grid.component';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { SvgGridService } from '../../services/svg-grid.service';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-animation-bar',
  templateUrl: './animation-bar.component.html',
  styleUrls: ['./animation-bar.component.scss'],
})
export class AnimationBarComponent implements OnInit, AfterViewInit {
  animating: boolean = false;

  static animate: boolean = false;

  static direction: string = 'ccw';
  static speed: string = 'medium';
  static playButton: HTMLInputElement;
  static pauseButton: HTMLInputElement;
  static stopButton: HTMLInputElement;
  static slider: HTMLInputElement;
  static sliderContainer: HTMLInputElement;
  static adjustAnimation: boolean;

  timestepDisplay: number = 0;

  constructor(
    private svgGrid: SvgGridService,
    private mechanismService: MechanismService,
    private settingsService: SettingsService
  ) {}

  ngOnInit(): void {
    //Subscribte to the emitter inside mechanismStateService
    GridComponent.onMechPositionChange.subscribe({
      next: (v) => (this.timestepDisplay = Number((v / 125).toFixed(2))),
    });
  }

  ngAfterViewInit() {
    AnimationBarComponent.playButton = <HTMLInputElement>document.getElementById('playBtn');
    AnimationBarComponent.pauseButton = <HTMLInputElement>document.getElementById('pauseBtn');
    AnimationBarComponent.stopButton = <HTMLInputElement>document.getElementById('stopBtn');
    AnimationBarComponent.slider = <HTMLInputElement>document.getElementById('slider');
    AnimationBarComponent.sliderContainer = <HTMLInputElement>(
      document.getElementById('sliderContainer')
    );
  }

  onSubmit(simpleForm: any) {
    if (simpleForm.value.timestep > this.maxTimeSteps()) {
      simpleForm.value.timestep = this.maxTimeSteps();
    } else if (simpleForm.value.timestep < 0) {
      simpleForm.value.timestep = 0;
    }
    GridComponent.animate(Number(simpleForm.value.timestep) * 125, AnimationBarComponent.animate);
  }

  maxTimeSteps() {
    if (GridComponent.mechanisms.length === 0) {
      return 0;
    } else {
      return GridComponent.mechanisms[0].joints.length - 1;
    }
  }

  onDirectionChange() {
    AnimationBarComponent.direction = AnimationBarComponent.direction === 'ccw' ? 'cw' : 'ccw';
    ToolbarComponent.clockwise = AnimationBarComponent.direction === 'cw';
    GridComponent.updateMechanism();
  }

  getDirection() {
    return AnimationBarComponent.direction;
  }

  onSpeedChange() {
    switch (AnimationBarComponent.speed) {
      case 'slow':
        AnimationBarComponent.speed = 'medium';
        GridComponent.mechanismAnimationIncrement = 2;
        break;
      case 'medium':
        AnimationBarComponent.speed = 'fast';
        GridComponent.mechanismAnimationIncrement = 3;
        break;
      case 'fast':
        AnimationBarComponent.speed = 'slow';
        GridComponent.mechanismAnimationIncrement = 1;
        break;
    }
  }

  startAnimation(state: string) {
    if (GridComponent.mechanisms[0] === undefined) {
      return;
    }
    if (GridComponent.mechanisms[0].joints.length < 3) {
      return;
    }
    switch (state) {
      case 'play':
        AnimationBarComponent.animate = false;
        this.animating = false;
        GridComponent.animate(GridComponent.mechanismTimeStep, AnimationBarComponent.animate);
        break;
      case 'pause':
        AnimationBarComponent.animate = true;
        this.animating = true;
        GridComponent.animate(GridComponent.mechanismTimeStep, AnimationBarComponent.animate);
        break;
      case 'stop':
        AnimationBarComponent.animate = false;
        this.animating = false;
        GridComponent.animate(0, AnimationBarComponent.animate);
        break;
    }
  }

  setAnim() {
    if (AnimationBarComponent.adjustAnimation) {
      GridComponent.animate(
        Number(AnimationBarComponent.slider.value),
        AnimationBarComponent.animate
      );
    }
  }

  //Where true means the user is dragging the animation bar
  adjustMechanismAnimation(condition: boolean) {
    AnimationBarComponent.adjustAnimation = condition;
    this.setAnim();
  }

  noJointExsits() {
    return this.mechanismService.joints.length == 0;
  }

  noLinkExsits() {
    return this.mechanismService.links.length == 0;
  }

  showCenterOfMass() {
    this.settingsService.isShowCOM.next(!this.settingsService.isShowCOM.value);
  }

  comIconName() {
    return this.settingsService.isShowCOM.value ? 'com_off' : 'com';
  }

  idLabelIconName() {
    return this.settingsService.isShowID.value ? 'abc_off' : 'abc';
  }

  onShowIDPressed() {
    this.settingsService.isShowID.next(!this.settingsService.isShowID.value);
  }

  onZoomInPressed() {
    this.svgGrid.zoomIn();
  }

  onZoomOutPressed() {
    this.svgGrid.zoomOut();
  }

  onZoomResetPressed() {
    this.svgGrid.panZoomObject.center();
    this.svgGrid.panZoomObject.zoom(this.svgGrid.defaultZoom);
  }

  getSpeed() {
    return AnimationBarComponent.speed;
  }

  getMechanismTimeStep() {
    return this.mechanismService.mechanismTimeStep;
  }

  getScreenCoord() {
    return GridComponent.screenCoord;
  }

  getDoF() {
    // TODO: Have DOF soon
    return '';
    // return GridComponent.
  }

  getAnimate() {
    return AnimationBarComponent.animate;
  }

  invalidMechanism() {
    return this.mechanismService.oneValidMechanismExists();
  }
}
