import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {switchMapTo} from "rxjs";

@Component({
  selector: 'app-animation-bar',
  templateUrl: './animation-bar.component.html',
  styleUrls: ['./animation-bar.component.css']
})
export class AnimationBarComponent implements OnInit {
  @Input() screenCoord: string = '';
  @Input() dof: string = '';
  @Output() animateGridEmitter = new EventEmitter();
  showIdTags: boolean = false;
  showCoMTags: boolean = false;
  direction: string = 'ccw';
  speed: string = 'medium';
  animate: boolean = false;

  constructor() { }

  ngOnInit(): void {
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

  startAnimation() {
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

  stopAnimation() {

  }

  setAnim() {

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
