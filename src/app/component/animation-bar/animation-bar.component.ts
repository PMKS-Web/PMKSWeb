import { AfterViewInit, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
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
  private static adjustAnimation: boolean;

  constructor() {}
  ngOnInit(): void {}

  ngAfterViewInit() {
    AnimationBarComponent.playButton = <HTMLInputElement>document.getElementById('playBtn');
    AnimationBarComponent.pauseButton = <HTMLInputElement>document.getElementById('pauseBtn');
    AnimationBarComponent.stopButton = <HTMLInputElement>document.getElementById('stopBtn');
    AnimationBarComponent.slider = <HTMLInputElement>document.getElementById('slider');
    AnimationBarComponent.sliderContainer = <HTMLInputElement>(
      document.getElementById('sliderContainer')
    );
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

  adjustMechanismAnimation(condition: boolean) {
    AnimationBarComponent.adjustAnimation = condition;
  }

  showCenterOfMass() {
    AnimationBarComponent.showCoMTags = !AnimationBarComponent.showCoMTags;
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
    if (GridComponent.mechanisms[0] === undefined) {
      return true;
    }
    // return false;
    return GridComponent.mechanisms[0].joints.length > 3 ? null : true;
  }
}
