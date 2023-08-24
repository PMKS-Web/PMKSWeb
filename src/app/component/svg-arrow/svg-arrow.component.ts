import { Component, Input } from '@angular/core';

@Component({
  selector: '[app-svg-arrow]',
  templateUrl: './svg-arrow.component.html',
  styleUrls: ['./svg-arrow.component.scss'],
})
export class SvgArrowComponent {
  @Input() x: number = 0;
  @Input() y: number = 0;
  @Input() magnitude: number = 0;
  @Input() direction: number = 0;
  @Input() width: number = 0.1;
  @Input() color: string = 'black';

  readonly SCALAR: number = 0.2;

  constructor() {}

  get x2(): number {
    return this.x + this.magnitude * Math.cos(this.directionRadians);
  }

  get y2(): number {
    return this.y + this.magnitude * Math.sin(this.directionRadians);
  }

  get delta(): number {
    return this.magnitude * this.SCALAR;
  }

  get directionRadians(): number {
    return (this.direction * Math.PI) / 180;
  }

  // arrow point A
  get ax(): number {
    return this.x2 - this.delta * Math.cos(this.directionRadians);
  }

  get ay(): number {
    return this.y2 - this.delta * Math.sin(this.directionRadians);
  }

  get ax1(): number {
    return this.ax + this.delta * Math.cos(this.directionRadians + 3.1415 / 2);
  }

  get ay1(): number {
    return this.ay + this.delta * Math.sin(this.directionRadians + 3.1415 / 2);
  }

  get ax2(): number {
    return this.ax - this.delta * Math.cos(this.directionRadians + 3.1415 / 2);
  }

  get ay2(): number {
    return this.ay - this.delta * Math.sin(this.directionRadians + 3.1415 / 2);
  }

  getPath() {
    return `M ${this.x} ${this.y} L ${this.x2} ${this.y2} M ${this.ax1} ${this.ay1} L ${this.x2} ${this.y2} M ${this.ax2} ${this.ay2} L ${this.x2} ${this.y2}`;
  }
}
