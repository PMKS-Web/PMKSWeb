import { Component, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { RealJoint } from '../../../model/joint';

@Component({
  selector: 'tri-button',
  templateUrl: './tri-button.component.html',
  styleUrls: ['./tri-button.component.scss'],
})
export class TriButtonComponent {
  @Input() joint!: RealJoint;
  @Input() btn1Disabled: boolean = false;
  @Input() btn2Disabled: boolean = false;
  @Input() btn3Disabled: boolean = false;

  constructor() {}
}
