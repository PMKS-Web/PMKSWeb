import { Component, OnInit } from '@angular/core';
import {switchMapTo} from "rxjs";

@Component({
  selector: 'app-animation-bar',
  templateUrl: './animation-bar.component.html',
  styleUrls: ['./animation-bar.component.css']
})
export class AnimationBarComponent implements OnInit {

  showIdTags: boolean = false;
  showCoMTags: boolean = false;
  direction: string = 'ccw';
  speed: string = 'medium';

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
