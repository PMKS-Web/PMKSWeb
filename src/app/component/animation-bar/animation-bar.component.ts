import { AfterViewInit, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { NgForm } from '@angular/forms';
// import {switchMapTo} from "rxjs";
import { Mechanism } from '../../model/mechanism/mechanism';
import { GridComponent } from '../grid/grid.component';
import { ToolbarComponent } from '../toolbar/toolbar.component';

@Component({
  selector: 'app-animation-bar',
  templateUrl: './animation-bar.component.html',
  styleUrls: ['./animation-bar.component.scss'],
})
export class AnimationBarComponent implements OnInit, AfterViewInit {
  animating: boolean = false;

  static showIdTags: boolean = false;
  static showCoMTags: boolean = false;
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

  constructor() {}

  ngOnInit(): void {
    //Subscribte to the emitter inside mechanismStateService
    GridComponent.onMechPositionChange.subscribe({
      next: (v) => (this.timestepDisplay = v),
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
    GridComponent.animate(Number(simpleForm.value.timestep), AnimationBarComponent.animate);
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
    return GridComponent.joints.length == 0;
  }

  noLinkExsits() {
    return GridComponent.links.length == 0;
  }

  showCenterOfMass() {
    AnimationBarComponent.showCoMTags = !AnimationBarComponent.showCoMTags;
  }

  comIconName() {
    return AnimationBarComponent.showCoMTags ? 'com_off' : 'com';
  }

  idLabelIconName() {
    return AnimationBarComponent.showIdTags ? 'abc_off' : 'abc';
  }

  onShowIDPressed() {
    AnimationBarComponent.showIdTags = !AnimationBarComponent.showIdTags;
  }

  onZoomInPressed() {
    GridComponent.adjustView('in');
  }

  onZoomOutPressed() {
    GridComponent.adjustView('out');
  }

  onZoomResetPressed() {
    GridComponent.adjustView('reset');
  }

  getSpeed() {
    return AnimationBarComponent.speed;
  }

  onResetLinkagePressed() {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const port = window.location.port;
    const urlString = `${protocol}//${hostname}${port ? `:${port}` : ''}${pathname}`;
    window.location.href = encodeURI(urlString);
  }

  getMechanismTimeStep() {
    return GridComponent.mechanismTimeStep;
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

  validMechanism() {
    //True means the linkage is invalid
    if (GridComponent.mechanisms[0] === undefined) {
      return true;
    }
    // return false;
    return GridComponent.mechanisms[0].joints.length > 3 ? null : true;
  }
}
