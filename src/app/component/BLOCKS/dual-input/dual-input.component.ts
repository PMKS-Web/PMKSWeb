import { Component, Input, OnInit, OnChanges } from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'dual-input-block',
  templateUrl: './dual-input.component.html',
  styleUrls: ['./dual-input.component.scss'],
})
export class DualInputComponent {
  @Input() tooltip!: string;
  @Input() unit!: string;
  @Input() formControl1!: string;
  @Input() label1: string = 'X';
  @Input() label2: string = 'Y';
  @Input() formControl2!: string;
  @Input() formGroup!: FormGroup;

  constructor() {}
}
