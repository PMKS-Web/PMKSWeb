import { Component, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'dual-input-block',
  templateUrl: './dual-input.component.html',
  styleUrls: ['./dual-input.component.scss']
})
export class DualInputComponent {
  @Input() tooltip! : string;  
  @Input() value1! : number;  
  @Input() value2! : number;  
  @Input() unit! : string;  
  @Input() formControl1! : string;  
  @Input() formControl2! : string;  
  @Input() formGroup!: FormGroup;

  constructor() {
    this.formGroup = new FormGroup({});
  }
}
