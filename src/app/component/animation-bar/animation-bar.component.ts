import {AfterViewInit, Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {switchMapTo} from "rxjs";
import {Mechanism} from "../../model/mechanism/mechanism";

@Component({
  selector: 'app-animation-bar',
  templateUrl: './animation-bar.component.html',
  styleUrls: ['./animation-bar.component.css']
})
export class AnimationBarComponent implements OnInit, AfterViewInit {
  @Input() mechanisms: Mechanism[] = [];
  @Input() screenCoord: string = '';
  @Input() dof: string = '';
  @Input() mechanismTimeSteps: number = 0;
  @Output() animateGridEmitter = new EventEmitter<[number, boolean]>();
  showIdTags: boolean = false;
  showCoMTags: boolean = false;
  direction: string = 'ccw';
  speed: string = 'medium';
  animate: boolean = false;

  private static slider: HTMLInputElement;

  constructor() { }
  ngOnInit(): void {
  }

  ngAfterViewInit() {
    AnimationBarComponent.slider = <HTMLInputElement>document.getElementById('slider');
  }

  maxTimeSteps() {
    if (this.mechanisms.length === 0) {
      return 0;
    } else {
      return this.mechanisms[0].joints.length;
    }
  }

  onDirectionChange() {
    if (this.direction === 'ccw') {
      this.direction = 'cw';
    } else {
      this.direction = 'ccw';
    }
  }

  onSpeedChange() {
    switch (this.speed) {
      case 'slow':
        this.speed = 'medium';
        break;
      case 'medium':
        this.speed = 'fast';
        break;
      case 'fast':
        this.speed = 'slow'
        break;
    }
  }

  startAnimation(state: string) {
    switch (state) {
      case 'play':
        this.animate = false;
        this.animateGridEmitter.emit([this.mechanismTimeSteps, this.animate]);
        break;
      case 'pause':
        this.animate = true;
        this.animateGridEmitter.emit([this.mechanismTimeSteps, this.animate]);
        break;
      case 'stop':
        this.animate = false;
        this.animateGridEmitter.emit([0, this.animate]);
        break;
    }
  }

  setAnim() {
    if (!this.animate) {
      this.animateGridEmitter.emit([Number(AnimationBarComponent.slider.value), this.animate]);
    }
  }

  showCenterOfMass() {
    this.showCoMTags = !this.showCoMTags;
  }

  onShowIDPressed() {
    this.showIdTags = !this.showIdTags;
  }

  onZoomInPressed() {

  }

  onZoomOutPressed() {

  }

  onZoomResetPressed() {

  }

  onResetLinkagePressed() {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const port = window.location.port;
    const urlString = `${protocol}//${hostname}${port ? `:${port}` : ''}${pathname}`;
    window.location.href = encodeURI(urlString);
  }
}
