import { Component, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'input-block',
  templateUrl: './input.component.html',
  styleUrls: ['./input.component.scss'],
})
export class InputComponent {
  @Input() unit: string | undefined;
  @Input() tooltip: string | undefined;
  @Input() _formControl!: string;
  @Input() formGroup!: FormGroup;
}
