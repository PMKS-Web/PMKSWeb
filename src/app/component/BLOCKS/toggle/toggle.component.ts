import { Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'toggle-block',
  templateUrl: './toggle.component.html',
  styleUrls: ['./toggle.component.scss'],
})
export class ToggleComponent {
  @Input() tooltip: string | undefined;
  @Input() formGroup!: FormGroup;
  @Input() _formControl!: string;

  @Input() addInput: boolean = false;
  @Input() _formControlForInput!: string;
  @Input() disableInput: boolean = false;

  @ViewChild('field', { static: false }) field!: ElementRef;

  // ngOnChanges() {
  //   //Get the #field input element
  //   // const field = document.getElementById('field');
  //   console.log(this.field.nativeElement);
  //   (this.field.nativeElement as HTMLInputElement).select();
  //   (this.field.nativeElement as HTMLInputElement).blur();
  // }
}
