import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-animation-bar',
  templateUrl: './animation-bar.component.html',
  styleUrls: ['./animation-bar.component.css']
})
export class AnimationBarComponent implements OnInit {

  showIdTags: boolean = false;
  showCoMTags: boolean = false;

  constructor() { }

  ngOnInit(): void {
  }

  onDirectionChange() {

  }

  onSpeedChange() {

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

  }
}
