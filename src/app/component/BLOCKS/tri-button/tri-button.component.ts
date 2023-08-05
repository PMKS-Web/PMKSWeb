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
  @Input() btn3Text: string = '';
  @Input() btn3Icon: string = '';
  @Input() btn1Action!: () => void;
  @Input() btn2Action!: () => void;
  @Input() btn3Action!: () => void;

  constructor() {}
}
