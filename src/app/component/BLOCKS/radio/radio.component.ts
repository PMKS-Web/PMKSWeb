import { Component, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'radio-block',
  templateUrl: './radio.component.html',
  styleUrls: ['./radio.component.scss'],
})
export class RadioComponent {
  @Input() tooltip: string | undefined;
  @Input() option1: string | undefined;
  @Input() option2: string | undefined;
  @Input() option3: string | undefined;
  @Input() _formControl!: string;
  @Input() formGroup!: FormGroup;
  @Input() disabled: boolean = false;
}
