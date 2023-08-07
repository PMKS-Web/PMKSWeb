import { AfterViewInit, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { NgForm } from '@angular/forms';
// import {switchMapTo} from "rxjs";
import { Mechanism } from '../../model/mechanism/mechanism';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { SvgGridService } from '../../services/svg-grid.service';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { NewGridComponent } from '../new-grid/new-grid.component';
import { RealJoint, RevJoint } from '../../model/joint';
import { connect } from 'rxjs';

@Component({
  selector: 'app-animation-bar',
  templateUrl: './animation-bar.component.html',
  styleUrls: ['./animation-bar.component.scss'],
})
export class AnimationBarComponent implements OnInit, AfterViewInit {
  userIsDragging: boolean = false;

  wasAnimating: boolean = false;

  static animate: boolean = false;

  static playButton: HTMLInputElement;
  static pauseButton: HTMLInputElement;
  static stopButton: HTMLInputElement;
  static slider: HTMLInputElement;
  static sliderContainer: HTMLInputElement;
  static adjustAnimation: boolean;

  timestepDisplay: number = 0;

  constructor(
    public svgGrid: SvgGridService,
    public mechanismService: MechanismService,
    private settingsService: SettingsService
  ) {}

  ngOnInit(): void {
    //Subscribte to the emitter inside mechanismStateService
    this.mechanismService.onMechPositionChange.subscribe((v) => {
      this.timestepDisplay = Number(this.mechanismService.mechanisms[0].timeNum[v].toFixed(2));
      // this.timestepDisplay = Number((v / 62.5).toFixed(2));
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

  onNewTimeSubmit(simpleForm: any) {
    // TODO: Don't want to use this.maxTimeSteps like this unless it's to pull the max number of timesteps...
    //  Want to pull timeNum within mechanism and showcase this
    console.log(simpleForm.value.timestep);
    if (simpleForm.value.timestep * 62.5 > this.maxTimeSteps()) {
      simpleForm.value.timestep = this.maxTimeSteps() / 62.5;
    } else if (simpleForm.value.timestep < 0) {
      simpleForm.value.timestep = 0;
    }
    this.mechanismService.animate(
      Number(simpleForm.value.timestep * 62.5),
      AnimationBarComponent.animate
    );
  }

  maxTimeSteps() {
    if (this.mechanismService.mechanisms.length === 0) {
      return 0;
    } else {
      return this.mechanismService.mechanisms[0].joints.length - 1;
    }
  }

  // onDirectionChange() {
  //   AnimationBarComponent.direction = AnimationBarComponent.direction === 'ccw' ? 'cw' : 'ccw';
  //   ToolbarComponent.clockwise = AnimationBarComponent.direction === 'cw';
  //   this.mechanismService.updateMechanism();
  // }
  //
  // getDirection() {
  //   return AnimationBarComponent.direction;
  // }
  //
  // onSpeedChange() {
  //   switch (AnimationBarComponent.speed) {
  //     case 'slow':
  //       AnimationBarComponent.speed = 'medium';
  //       this.mechanismService.mechanismAnimationIncrement = 2;
  //       break;
  //     case 'medium':
  //       AnimationBarComponent.speed = 'fast';
  //       this.mechanismService.mechanismAnimationIncrement = 3;
  //       break;
  //     case 'fast':
  //       AnimationBarComponent.speed = 'slow';
  //       this.mechanismService.mechanismAnimationIncrement = 1;
  //       break;
  //   }
  // }

  startAnimation(state: string) {
    // console.log('startAnimation ' + state);
    switch (state) {
      case 'pause':
        AnimationBarComponent.animate = false;
        this.mechanismService.animate(
          this.mechanismService.mechanismTimeStep,
          AnimationBarComponent.animate
        );
        break;
      case 'play':
        AnimationBarComponent.animate = true;
        this.mechanismService.animate(
          this.mechanismService.mechanismTimeStep,
          AnimationBarComponent.animate
        );
        break;
      case 'stop':
        AnimationBarComponent.animate = false;
        this.mechanismService.animate(0, AnimationBarComponent.animate);
        break;
    }
    if (this.mechanismService.mechanismTimeStep !== 0) {
      this.settingsService.animating.next(true);
    } else {
      this.settingsService.animating.next(false);
    }
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

  invalidMechanism() {
    return !this.mechanismService.oneValidMechanismExists();
  }

  handleSpeedChange() {
    //Switch from 1 -> 2 -> 4 -> 1
    this.mechanismService.mechanismAnimationIncrement =
      (this.mechanismService.mechanismAnimationIncrement % 4) + 1;
    if (this.mechanismService.mechanismAnimationIncrement === 3)
      this.mechanismService.mechanismAnimationIncrement++;
  }

  sliderDown() {
    // console.log('slider down');
    this.userIsDragging = true;
    this.wasAnimating = AnimationBarComponent.animate;
    this.startAnimation('pause');
    setTimeout(() => {
      this.sliderChange();
    }, 0);
  }

  sliderUp() {
    // console.log('slider up');
    this.userIsDragging = false;
    if (this.wasAnimating) this.startAnimation('play');
  }

  sliderChange() {
    if (this.userIsDragging) {
      // console.log('real slider change');
      this.mechanismService.animate(
        Number(AnimationBarComponent.slider.value),
        AnimationBarComponent.animate
      );
    }
  }

  getStaticAnimating() {
    return AnimationBarComponent.animate;
  }
}
