import { Component, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'toggle-block',
  templateUrl: './toggle.component.html',
  styleUrls: ['./toggle.component.scss'],
})
export class ToggleComponent {
  @Input() disabled!: boolean;
  @Input() tooltip: string | undefined;
  @Input() formGroup!: FormGroup;
  @Input() _formControl!: string;
}
